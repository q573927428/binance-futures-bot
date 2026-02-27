import type { Position, BotConfig, BotState } from '../../../../types'
import { PositionStatus } from '../../../../types'
import { BinanceService } from '../../../utils/binance'
import { calculatePnL, checkCircuitBreaker } from '../../../utils/risk'
import { logger } from '../../../utils/logger'
import { saveBotState } from '../../../utils/storage'
import { recordTrade } from '../helpers/trade-recorder'

/**
 * 持仓验证器
 */
export class PositionValidator {
  private binance: BinanceService
  private config: BotConfig
  private state: BotState
  private getStrategyAnalyzer?: () => any

  constructor(binance: BinanceService, config: BotConfig, state: BotState, getStrategyAnalyzer?: () => any) {
    this.binance = binance
    this.config = config
    this.state = state
    this.getStrategyAnalyzer = getStrategyAnalyzer
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
   * 检查持仓一致性（新增方法）
   * 验证本地持仓状态与交易所实际状态是否一致
   */
  async checkPositionConsistency(position: Position): Promise<boolean> {
    const exchangePositions = await this.binance.fetchPositions(position.symbol)
  
    const hasPositionOnExchange = exchangePositions.some(p => {
      const exchangeSymbol = p.symbol.replace(':USDT', '')
      const localSymbol = position.symbol.replace(':USDT', '')
  
      if (exchangeSymbol !== localSymbol) return false
  
      const size = Number(p.quantity || 0)
  
      return Math.abs(size) > 0
    })
  
    // 🔥 核心判断：如果交易所没有持仓，说明仓位已被平仓（止损或止盈）
    if (!hasPositionOnExchange) {
      logger.warn(
        '状态同步',
        `检测到 ${position.symbol} 仓位已不存在（可能已止损/平仓），开始补偿平仓流程`
      )
  
      try {
        // 获取策略分析器
        const strategyAnalyzer = this.getStrategyAnalyzer ? this.getStrategyAnalyzer() : undefined
        
        // 尝试查询止损订单状态
        if (position.stopLossOrderId) {
          await this.handleCompensatedClose(position, '止损触发', strategyAnalyzer)
        } else {
          // 如果没有止损订单ID，可能是其他原因平仓
          await this.handleCompensatedClose(position, '未知原因平仓', strategyAnalyzer)
        }
      } catch (error: any) {
        logger.error('补偿平仓', '补偿平仓流程失败', error.message)
        // 即使补偿流程失败，也要清空本地状态
        this.state.currentPosition = null
        this.state.status = PositionStatus.MONITORING
        await saveBotState(this.state)
      }
  
      return false 
    }
  
    return true  
  }

  /**
   * 处理补偿平仓（当检测到仓位已被平仓但本地没有记录时）
   */
  async handleCompensatedClose(position: Position, reason: string, strategyAnalyzer?: any): Promise<void> {
    try {
      logger.info('补偿平仓', `开始处理补偿平仓: ${position.symbol} ${reason}`)

      let exitPrice = 0
      let closeTime = Date.now()

      // 尝试查询止损订单状态
      if (position.stopLossOrderId) {
        try {
          //ccxt 最新 trigger: true 可以查询 条件委托 止损单 
          const stopOrder = await this.binance.fetchOrder(position.stopLossOrderId, position.symbol, { trigger: true })
          
          // 如果订单已成交，获取成交价格
          if (stopOrder.status === 'closed' || stopOrder.status === 'filled') {
            // 优化：优先使用average（平均成交价），然后是price，最后是position.stopLoss
            exitPrice = Number(stopOrder.info?.actualPrice) || stopOrder.average || stopOrder.price || position.stopLoss
            logger.info('补偿平仓', `止损订单已成交: ${stopOrder.status}，成交价: ${exitPrice}`)
          } else {
            //如果订单未成交 尝试取消止损单
            try {
              await this.binance.cancelOrder(position.stopLossOrderId, position.symbol, { trigger: true })
              logger.info('补偿平仓', `成功取消止损订单: ${position.stopLossOrderId}`)
              // 优化：优先使用average（平均成交价），然后是price，最后是position.stopLoss
              exitPrice = stopOrder.average || stopOrder.price || position.stopLoss
            } catch (error: any) {
              // 如果订单未成交，使用当前价格
              exitPrice = await this.binance.fetchPrice(position.symbol)
              logger.info('补偿平仓', `止损订单状态: ${stopOrder.status}，使用当前价格: ${exitPrice}`)
            }
          }
        } catch (error: any) {
          // 如果查询订单失败，使用当前价格
          logger.warn('补偿平仓', `查询止损订单失败，使用当前价格: ${error.message}`)
          exitPrice = await this.binance.fetchPrice(position.symbol)
        }
      } else {
        // 如果没有止损订单ID，使用当前价格
        exitPrice = await this.binance.fetchPrice(position.symbol)
        logger.info('补偿平仓', `无止损订单ID，使用当前价格: ${exitPrice}`)
      }

      // 安全机制：如果exitPrice为0，强制重新获取价格
      if (exitPrice === 0) {
        logger.warn('补偿平仓', `exitPrice为0，强制重新获取价格`)
        exitPrice = await this.binance.fetchPrice(position.symbol)
        logger.info('补偿平仓', `重新获取的价格: ${exitPrice}`)
      }

      // 如果有策略分析器，生成分析指标
      if (strategyAnalyzer) {
        try {
          const metrics = await strategyAnalyzer.generateAnalysisMetrics(
            exitPrice,
            reason,
            closeTime
          )
          logger.success('策略分析', `补偿平仓分析指标已生成: ${position.symbol} MFE=${metrics.mfe.toFixed(2)}, MAE=${metrics.mae.toFixed(2)}`)
        } catch (error: any) {
          logger.error('策略分析', `补偿平仓生成分析指标失败: ${error.message}`)
        }
      }

      // 计算盈亏
      const { pnl, pnlPercentage } = calculatePnL(exitPrice, position)

      // 记录交易历史并更新状态
      const updatedState = await recordTrade(position, exitPrice, reason)
      if (updatedState) {
        this.state = updatedState
      }

      // 更新每日盈亏
      this.state.dailyPnL += pnl

      // 更新连续亏损次数
      let consecutiveLosses = this.state.circuitBreaker.consecutiveLosses
      if (pnl < 0) {
        consecutiveLosses += 1
      } else {
        consecutiveLosses = 0
      }

      // 检查熔断条件
      const account = await this.binance.fetchBalance()
      const breaker = checkCircuitBreaker(this.state.dailyPnL, consecutiveLosses, account.balance, this.config.riskConfig)

      this.state.circuitBreaker = breaker
      this.state.currentPosition = null
      this.state.status = breaker.isTriggered ? PositionStatus.HALTED : PositionStatus.MONITORING
      this.state.lastTradeTime = Date.now() // 更新上次交易时间（补偿平仓时间）
      
      // 如果触发熔断，停止运行
      if (breaker.isTriggered) {
        this.state.isRunning = false
        logger.error('熔断', breaker.reason)
      }

      await saveBotState(this.state)

      logger.success('补偿平仓完成', `盈亏: ${pnl.toFixed(2)} USDT (${pnlPercentage.toFixed(2)}%)，原因: ${reason}`)
    } catch (error: any) {
      logger.error('补偿平仓', '处理补偿平仓失败', error.message)
      throw error
    }
  }
}
