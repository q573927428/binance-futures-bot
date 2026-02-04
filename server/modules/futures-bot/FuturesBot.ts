import type { BotConfig, BotState, TradeHistory } from '../../../types'
import { PositionStatus } from '../../../types'
import { BinanceService } from '../../utils/binance'
import { logger } from '../../utils/logger'
import { saveBotState, getDefaultConfig, getDefaultState, getTradeHistory } from '../../utils/storage'
import { StateManager } from './core/state-manager'
import { MarketAnalyzer } from './core/analyzer'
import { MarketScanner } from './core/scanner'
import { PositionOpener } from './trading/position-opener'
import { PositionMonitor } from './trading/position-monitor'
import { PositionCloser } from './trading/position-closer'
import { PositionValidator } from './trading/position-validator'
import { PriceService } from './services/price-service'
import { IndicatorsCache } from './services/indicators-cache'

/**
 * 币安永续合约交易机器人
 */
export class FuturesBot {
  private binance: BinanceService
  private priceService: PriceService
  private stateManager: StateManager
  private analyzer: MarketAnalyzer
  private scanner: MarketScanner
  private positionOpener: PositionOpener
  private positionMonitor: PositionMonitor
  private positionCloser: PositionCloser
  private positionValidator: PositionValidator
  private isInitialized: boolean = false

  constructor() {
    const defaultConfig = getDefaultConfig()
    const defaultState = getDefaultState()
    
    this.binance = new BinanceService()
    this.priceService = new PriceService(this.binance)
    this.stateManager = new StateManager(defaultConfig, defaultState)
    this.analyzer = new MarketAnalyzer(this.binance, defaultConfig)
    
    // 初始化交易模块
    this.positionOpener = new PositionOpener(this.binance, defaultConfig, defaultState)
    this.positionMonitor = new PositionMonitor(
      this.binance,
      this.priceService,
      defaultConfig,
      defaultState,
      (symbol) => this.analyzer.getPreviousADX(symbol)
    )
    this.positionCloser = new PositionCloser(this.binance, defaultConfig, defaultState)
    this.positionValidator = new PositionValidator(this.binance, defaultConfig, defaultState)
    
    // 初始化扫描器（传入回调函数）
    this.scanner = new MarketScanner(
      defaultConfig,
      defaultState,
      this.analyzer,
      {
        onResetDailyState: () => this.resetDailyState(),
        onPositionMonitor: () => this.monitorPosition(),
        onSignalFound: (signal) => this.positionOpener.openPosition(signal),
        onForceClose: () => this.closePositionIfExists('强制平仓时间')
      }
    )
  }

  /**
   * 初始化机器人
   */
  async initialize(): Promise<void> {
    // 如果已经初始化，直接返回
    if (this.isInitialized) {
      return
    }

    try {
      logger.info('系统', '正在初始化交易机器人...')

      // 初始化状态管理器
      await this.stateManager.initialize()
      
      // 同步状态到各个模块
      this.syncStateToModules()

      // 如果保存的状态显示机器人正在运行，但扫描循环未启动，需要手动启动
      const state = this.stateManager.getState()
      if (state.isRunning && (state.status === PositionStatus.MONITORING || state.status === PositionStatus.POSITION)) {
        logger.info('系统', '检测到机器人之前正在运行，自动恢复扫描循环')
        // 启动扫描循环以恢复运行
        this.scanner.startScanLoop()
      }

      this.isInitialized = true
      logger.success('系统', '交易机器人初始化完成')
    } catch (error: any) {
      logger.error('系统', '初始化失败', error.message)
      throw error
    }
  }

  /**
   * 启动机器人
   */
  async start(): Promise<void> {
    const state = this.stateManager.getState()
    
    if (state.isRunning && !state.circuitBreaker.isTriggered) {
      logger.warn('系统', '机器人已在运行中')
      return
    }

    // 情况2：机器人处于熔断状态
    if (state.circuitBreaker.isTriggered) {
      logger.info('系统', '机器人处于熔断状态，尝试重置并启动...')
    }

    try {
      logger.info('系统', '启动交易机器人...')

      // 重置熔断状态（如果处于熔断状态）
      if (state.circuitBreaker.isTriggered) {
        logger.info('熔断', '检测到熔断状态，正在重置...')
        state.circuitBreaker = {
          isTriggered: false,
          reason: '',
          timestamp: Date.now(),
          dailyLoss: 0,
          consecutiveLosses: 0,
        }
        logger.success('熔断', '熔断状态已重置')
      }

      state.isRunning = true
      state.status = PositionStatus.MONITORING
      state.monitoringSymbols = this.stateManager.getConfig().symbols
      
      // 更新状态
      this.stateManager.setState(state)
      await saveBotState(state)
      
      // 同步到各模块
      this.syncStateToModules()

      // 初始化WebSocket价格服务
      try {
        await this.priceService.initializeWebSocket(state.monitoringSymbols)
      } catch (error: any) {
        logger.warn('系统', 'WebSocket初始化失败，将使用REST API', error.message)
      }

      logger.success('系统', '交易机器人已启动')
      
      // 开始扫描循环
      this.scanner.startScanLoop()

    } catch (error: any) {
      logger.error('系统', '启动失败', error.message)
      state.isRunning = false
      this.stateManager.setState(state)
      await saveBotState(state)
      throw error
    }
  }

  /**
   * 停止机器人
   */
  async stop(): Promise<void> {
    logger.info('系统', '正在停止交易机器人...')
    
    const state = this.stateManager.getState()
    state.isRunning = false

    // 停止扫描循环
    this.scanner.stopScanLoop()

    // 断开WebSocket连接
    this.priceService.disconnect()

    state.status = PositionStatus.IDLE
    this.stateManager.setState(state)
    await saveBotState(state)
    
    // 同步到各模块
    this.syncStateToModules()

    logger.success('系统', '交易机器人已停止')
  }

  /**
   * 监控持仓
   */
  private async monitorPosition(): Promise<void> {
    const state = this.stateManager.getState()
    if (!state.currentPosition) return

    try {
      const position = state.currentPosition
      
      // 第一步：检查交易所实际持仓状态（新增容错机制）
      const isConsistent = await this.positionValidator.checkPositionConsistency(position)
      
      // 如果持仓不一致（已被平仓），直接返回
      if (!isConsistent) {
        // 同步验证器的状态回主状态
        const validatorState = this.positionValidator['state']
        this.stateManager.setState(validatorState)
        this.syncStateToModules()
        return
      }

      // 监控持仓
      const result = await this.positionMonitor.monitorPosition(position)
      
      // 同步监控器的状态
      const monitorState = this.positionMonitor['state']
      this.stateManager.setState(monitorState)
      this.syncStateToModules()
      
      // 如果需要平仓
      if (result.shouldClose && result.reason) {
        await this.closePositionIfExists(result.reason)
      } else {
        // 更新ADX值到分析器
        const indicators = await this.binance.fetchPositions(position.symbol)
        // 这里简化处理，ADX更新在分析器的analyzeSymbol中完成
      }
    } catch (error: any) {
      logger.error('持仓监控', '监控失败', error.message)
    }
  }

  /**
   * 平仓（如果存在持仓）
   */
  private async closePositionIfExists(reason: string): Promise<void> {
    const state = this.stateManager.getState()
    if (!state.currentPosition) return

    await this.positionCloser.closePosition(state.currentPosition, reason)
    
    // 同步平仓器的状态
    const closerState = this.positionCloser['state']
    this.stateManager.setState(closerState)
    this.syncStateToModules()
  }

  /**
   * 重置每日状态
   */
  private async resetDailyState(): Promise<void> {
    await this.stateManager.resetDailyState()
    this.syncStateToModules()
  }

  /**
   * 同步状态到所有模块
   */
  private syncStateToModules(): void {
    const config = this.stateManager.getConfig()
    const state = this.stateManager.getState()
    
    this.analyzer.updateConfig(config)
    this.scanner.updateConfig(config)
    this.scanner.updateState(state)
    this.positionOpener.updateConfig(config)
    this.positionOpener.updateState(state)
    this.positionMonitor.updateConfig(config)
    this.positionMonitor.updateState(state)
    this.positionCloser.updateConfig(config)
    this.positionCloser.updateState(state)
    this.positionValidator.updateConfig(config)
    this.positionValidator.updateState(state)
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<BotConfig>): Promise<void> {
    await this.stateManager.updateConfig(newConfig)
    this.syncStateToModules()
  }

  /**
   * 获取当前配置
   */
  getConfig(): BotConfig {
    return this.stateManager.getConfig()
  }

  /**
   * 获取当前状态
   */
  getState(): BotState {
    return this.stateManager.getState()
  }

  /**
   * 获取交易历史
   */
  async getHistory(limit?: number): Promise<TradeHistory[]> {
    return getTradeHistory()
  }

  /**
   * 获取 Binance 服务实例
   */
  getBinanceService(): BinanceService {
    return this.binance
  }
}
