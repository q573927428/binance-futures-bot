import type { Position, BotConfig, BotState } from '../../../../types'
import { BinanceService } from '../../../utils/binance'
import { calculatePnL, isPositionTimeout, checkTP1Condition, checkTP2Condition, getOrderSide } from '../../../utils/risk'
import { calculateIndicators } from '../../../utils/indicators'
import { logger } from '../../../utils/logger'
import { saveBotState } from '../../../utils/storage'
import { calculateTrailingStopLoss, shouldUpdateTrailingStop } from '../helpers/trailing-stop'

/**
 * 持仓监控器
 */
export class PositionMonitor {
  private binance: BinanceService
  private config: BotConfig
  private state: BotState
  private getPreviousADX: (symbol: string) => number | undefined

  constructor(
    binance: BinanceService,
    config: BotConfig,
    state: BotState,
    getPreviousADX: (symbol: string) => number | undefined
  ) {
    this.binance = binance
    this.config = config
    this.state = state
    this.getPreviousADX = getPreviousADX
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
   * 监控持仓
   * @returns 返回是否需要平仓以及平仓原因
   */
  async monitorPosition(position: Position): Promise<{ shouldClose: boolean; reason?: string }> {
    try {
      const price = await this.binance.fetchPrice(position.symbol)

      // 计算当前盈亏
      const { pnl, pnlPercentage } = calculatePnL(price, position)

      logger.info(
        '持仓监控',
        `${position.symbol} ${position.direction} 入场价: ${position.entryPrice} 当前价: ${price} 盈亏: ${pnl.toFixed(2)} USDT (${pnlPercentage.toFixed(2)}%)`
      )

      // 保存当前价格和盈亏到state中，供前端显示
      this.state.currentPrice = price
      this.state.currentPnL = pnl
      this.state.currentPnLPercentage = pnlPercentage
      await saveBotState(this.state)

      // 重新计算指标
      const indicators = await calculateIndicators(this.binance, position.symbol)

      // 获取当前symbol的previous ADX值
      const prevADX = this.getPreviousADX(position.symbol) ?? indicators.adx15m
      
      // 检查持仓超时
      if (isPositionTimeout(position, this.config.positionTimeoutHours, prevADX > indicators.adx15m)) {
        logger.warn('风控', '持仓超时且ADX走弱')
        return { shouldClose: true, reason: '持仓超时' }
      }

      // 检查TP2条件
      const tp2Result = checkTP2Condition(price, position, indicators.rsi, indicators.adx15m, prevADX, this.config.riskConfig)
      if (tp2Result.triggered) {
        logger.success('止盈', tp2Result.reason, tp2Result.data)
        return { shouldClose: true, reason: 'TP2止盈' }
      }

      // 检查TP1条件 目前 直接全部平仓（简化策略）
      const tp1Result = checkTP1Condition(price, position)
      if (tp1Result.triggered) {
        logger.success('止盈', tp1Result.reason, tp1Result.data)
        return { shouldClose: true, reason: 'TP1止盈' }
      }

      // 检查移动止损
      await this.checkAndUpdateTrailingStop(price, position, indicators.atr)

      return { shouldClose: false }
    } catch (error: any) {
      logger.error('持仓监控', '监控失败', error.message)
      return { shouldClose: false }
    }
  }

  /**
   * 检查并更新移动止损
   */
  private async checkAndUpdateTrailingStop(
    currentPrice: number,
    position: Position,
    atr: number
  ): Promise<void> {
    // 如果未启用移动止损，直接返回
    if (!this.config.trailingStopConfig.enabled) {
      return
    }

    try {
      // 检查更新间隔
      const lastUpdate = position.lastStopLossUpdate || position.openTime
      if (!shouldUpdateTrailingStop(lastUpdate, this.config.trailingStopConfig.updateIntervalSeconds)) {
        return
      }

      // 计算新的止损价格
      const result = calculateTrailingStopLoss(
        currentPrice,
        position,
        atr,
        this.config.trailingStopConfig
      )

      // 如果需要更新止损
      if (result.shouldUpdate && result.newStopLoss) {
        await this.updateStopLoss(position, result.newStopLoss, result.reason)
      }
    } catch (error: any) {
      logger.error('移动止损', '检查失败', error.message)
    }
  }

  /**
   * 更新止损价格
   */
  private async updateStopLoss(
    position: Position,
    newStopLoss: number,
    reason: string
  ): Promise<void> {
    try {
      logger.info('移动止损', `准备更新止损: ${reason}`)

      // 1. 取消旧止损单
      if (position.stopLossOrderId) {
        try {
          await this.binance.cancelOrder(position.stopLossOrderId, position.symbol, { trigger: true })
          logger.info('移动止损', '旧止损单已取消')
        } catch (e: any) {
          logger.warn('移动止损', `取消旧止损单失败: ${e.message}`)
        }
      }

      // 2. 创建新止损单
      if (position.direction === 'IDLE') {
        throw new Error('持仓方向无效')
      }
      const side = getOrderSide(position.direction, false)
      const newStopOrder = await this.binance.stopLossOrder(
        position.symbol,
        side,
        position.quantity,
        newStopLoss
      )

      logger.success('移动止损', '新止损单已创建', newStopOrder)

      // 3. 更新持仓信息
      position.stopLoss = newStopLoss
      position.stopLossOrderId = newStopOrder.orderId
      position.stopLossOrderStopPrice = newStopOrder.stopPrice
      position.stopLossOrderTimestamp = newStopOrder.timestamp
      position.lastStopLossUpdate = Date.now()

      // 4. 更新状态到state
      if (this.state.currentPosition) {
        this.state.currentPosition = position
        await saveBotState(this.state)
      }

      logger.success('移动止损', `止损已更新至 ${newStopLoss.toFixed(2)}`)
    } catch (error: any) {
      logger.error('移动止损', '更新失败', error.message)
      throw error
    }
  }
}
