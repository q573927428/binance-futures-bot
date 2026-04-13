import type { BotConfig, BotState, TradeSignal } from '../../../../types'
import { PositionStatus } from '../../../../types'
import { shouldResetDailyState, shouldForceLiquidate, checkDailyTradeLimit } from '../../../utils/risk'
import { logger } from '../../../utils/logger'
import { saveBotState } from '../../../utils/storage'
import { MarketAnalyzer } from './analyzer'

/**
 * 市场扫描器
 */
export class MarketScanner {
  private config: BotConfig
  private state: BotState
  private analyzer: MarketAnalyzer
  private positionMonitorTimer: NodeJS.Timeout | null = null
  private opportunityScanTimer: NodeJS.Timeout | null = null
  private isMonitoring = false
  private isScanningOpportunity = false
  private onResetDailyState: () => Promise<void>
  private onPositionMonitor: () => Promise<void>
  private onSignalFound: (signal: TradeSignal) => Promise<void>
  private onForceClose: () => Promise<void>

  constructor(
    config: BotConfig,
    state: BotState,
    analyzer: MarketAnalyzer,
    callbacks: {
      onResetDailyState: () => Promise<void>
      onPositionMonitor: () => Promise<void>
      onSignalFound: (signal: TradeSignal) => Promise<void>
      onForceClose: () => Promise<void>
    }
  ) {
    this.config = config
    this.state = state
    this.analyzer = analyzer
    this.onResetDailyState = callbacks.onResetDailyState
    this.onPositionMonitor = callbacks.onPositionMonitor
    this.onSignalFound = callbacks.onSignalFound
    this.onForceClose = callbacks.onForceClose
  }

  /**
   * 更新配置
   */
  updateConfig(config: BotConfig): void {
    this.config = config
  }

  /**
   * 更新状态
   */
  updateState(state: BotState): void {
    this.state = state
  }

  /**
   * 启动扫描循环
   */
  startScanLoop(): void {
    if (!this.state.isRunning) return
    this.positionMonitorLoop()
    this.opportunityScanLoop()
  }

  /**
   * 停止扫描循环
   */
  stopScanLoop(): void {
    if (this.positionMonitorTimer) {
      clearTimeout(this.positionMonitorTimer)
      this.positionMonitorTimer = null
    }
    if (this.opportunityScanTimer) {
      clearTimeout(this.opportunityScanTimer)
      this.opportunityScanTimer = null
    }
  }

  /**
   * 持仓监控循环
   */
  private async positionMonitorLoop(): Promise<void> {
    if (!this.state.isRunning) return
    if (this.isMonitoring) return

    this.isMonitoring = true
    try {
      await this.monitorPositions()
    } catch (e: any) {
      logger.error('持仓监控', '监控失败', e.message)
    } finally {
      this.isMonitoring = false
    }

    if (this.state.isRunning) {
      this.positionMonitorTimer = setTimeout(
        () => this.positionMonitorLoop(),
        this.config.positionScanInterval * 1000
      )
    }
  }

  /**
   * 机会扫描循环
   */
  private async opportunityScanLoop(): Promise<void> {
    if (!this.state.isRunning) return
    if (this.isScanningOpportunity) return

    this.isScanningOpportunity = true
    try {
      await this.scanForOpportunities()
    } catch (e: any) {
      logger.error('机会扫描', '扫描失败', e.message)
    } finally {
      this.isScanningOpportunity = false
    }

    if (this.state.isRunning) {
      this.opportunityScanTimer = setTimeout(
        () => this.opportunityScanLoop(),
        this.config.scanInterval * 1000
      )
    }
  }

  /**
   * 执行持仓监控
   */
  private async monitorPositions(): Promise<void> {
    // 检查是否需要重置每日状态
    if (shouldResetDailyState(this.state.lastResetDate)) {
      await this.onResetDailyState()
    }

    // 检查熔断状态
    if (this.state.circuitBreaker.isTriggered) {
      logger.warn('熔断', '系统处于熔断状态，停止交易')
      this.state.status = PositionStatus.HALTED
      this.state.isRunning = false
      await saveBotState(this.state)
      return
    }

    // 检查强制平仓时间
    const hasPositions = this.state.positions && Object.keys(this.state.positions).length > 0
    if (shouldForceLiquidate(this.config.riskConfig) && hasPositions) {
      logger.warn('风控', '到达强制平仓时间')
      await this.onForceClose()
      return
    }

    // 监控所有持仓
    await this.onPositionMonitor()
  }

  /**
   * 扫描交易机会
   */
  private async scanForOpportunities(): Promise<void> {
    // 检查是否允许新交易
    if (!this.state.allowNewTrades) {
      logger.info('信号扫描', '已达到每日交易次数限制，暂停扫描新机会', {
        今日交易次数: this.state.todayTrades,
        限制次数: this.config.riskConfig.dailyTradeLimit,
      })
      return
    }

    // 检查每日交易次数限制
    const dailyLimitPassed = checkDailyTradeLimit(this.state.todayTrades, this.config.riskConfig)
    
    if (!dailyLimitPassed) {
      logger.warn('信号扫描', '已达到每日交易次数限制，禁止新交易', {
        今日交易次数: this.state.todayTrades,
        限制次数: this.config.riskConfig.dailyTradeLimit,
      })
      // 设置不允许新交易，但保持机器人运行（用于监控持仓）
      this.state.allowNewTrades = false
      await saveBotState(this.state)
      return
    }

    // 检查交易冷却时间
    if (this.state.lastTradeTime && this.state.lastTradeTime > 0) {
      const now = Date.now()
      const timeSinceLastTrade = Math.floor((now - this.state.lastTradeTime) / 1000) // 转换为秒
      const cooldownRemaining = this.config.tradeCooldownInterval - timeSinceLastTrade
      
      if (cooldownRemaining > 0) {
      logger.info('信号扫描', `交易冷却中，还需等待 ${cooldownRemaining} 秒`, {
          上次交易时间: new Date(this.state.lastTradeTime).toLocaleString(),
          冷却时间: this.config.tradeCooldownInterval,
          已等待时间: timeSinceLastTrade,
        })
        return
      }
    }

    logger.info('信号扫描', `开始扫描交易机会 [${this.config.symbols.join(', ')}]`, {
      今日交易次数: this.state.todayTrades,
      限制次数: this.config.riskConfig.dailyTradeLimit,
      冷却时间: this.config.tradeCooldownInterval,
    })

    for (const symbol of this.config.symbols) {
      try {
        const signal = await this.analyzer.analyzeSymbol(symbol)
        
        if (signal && signal.direction !== 'IDLE') {
          logger.success('信号扫描', `发现交易信号: ${symbol} ${signal.direction}`, {
            price: signal.price,
            confidence: signal.confidence,
            reason: signal.reason,
          })

          await this.onSignalFound(signal)
          break // 一次只开一个仓位
        }
      } catch (error: any) {
        logger.error('信号扫描', `分析${symbol}失败`, error.message)
      }
    }
  }
}
