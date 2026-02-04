import type { TradeSignal, Position, BotConfig, BotState } from '../../../../types'
import { PositionStatus } from '../../../../types'
import { BinanceService } from '../../../utils/binance'
import { calculateStopLoss, calculateTakeProfit, calculatePositionSize, calculateMaxUsdtAmount } from '../../../utils/indicators'
import { getOrderSide } from '../../../utils/risk'
import { 
  calculateQuickLeverage,
  calculateSafeLeverage,
  calculateFinalLeverage
} from '../../../utils/dynamic-leverage'
import { logger } from '../../../utils/logger'
import { saveBotState } from '../../../utils/storage'
import { waitAndConfirmPosition } from '../helpers/position-helpers'

/**
 * 持仓开仓器
 */
export class PositionOpener {
  private binance: BinanceService
  private config: BotConfig
  private state: BotState

  constructor(binance: BinanceService, config: BotConfig, state: BotState) {
    this.binance = binance
    this.config = config
    this.state = state
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
   * 开仓
   */
  async openPosition(signal: TradeSignal): Promise<void> {
    try {
      logger.info('开仓', `准备开仓: ${signal.symbol} ${signal.direction}`)

      // 确保方向不是IDLE
      if (signal.direction === 'IDLE') {
        logger.warn('开仓', '交易信号方向为IDLE，无法开仓')
        return
      }

      // 获取账户余额
      const account = await this.binance.fetchBalance()
      logger.info('账户', `余额: ${account.availableBalance} USDT`)

      //如果账户余额不足120，提示不够return
      if (account.availableBalance < 120) {
        logger.warn('余额不足', `账户余额（${account.availableBalance} USDT）,不足120 USDT，无法开仓`)
        return
      }

      this.state.status = PositionStatus.OPENING
      await saveBotState(this.state)

      // 计算止损价格
      const stopLoss = calculateStopLoss(
        signal.price,
        signal.direction,
        signal.indicators.atr,
        this.config.stopLossATRMultiplier,
        this.config.maxStopLossPercentage
      )

      // 计算动态杠杆（如果启用）- 使用简化版
      let finalLeverage = this.config.leverage
      let leverageCalculationDetails = {}

      if (this.config.dynamicLeverageConfig.enabled && signal.aiAnalysis) {
        try {
          // 使用简化版动态杠杆计算
          const dynamicLeverage = calculateQuickLeverage(
            signal.aiAnalysis,
            this.config.dynamicLeverageConfig
          )

          // 计算安全杠杆（基于账户风险）
          const safeLeverage = calculateSafeLeverage(
            account.availableBalance,
            this.config.maxRiskPercentage,
            stopLoss,
            signal.price
          )

          // 计算最终杠杆（取两者中的较小值）
          finalLeverage = calculateFinalLeverage(dynamicLeverage, safeLeverage, this.config.dynamicLeverageConfig)

          leverageCalculationDetails = {
            dynamicLeverage,
            safeLeverage,
            finalLeverage,
            aiConfidence: signal.aiAnalysis.confidence,
            aiScore: signal.aiAnalysis.score,
            riskLevel: signal.aiAnalysis.riskLevel,
          }

          logger.info('动态杠杆', `杠杆计算完成 ${finalLeverage} X`, leverageCalculationDetails)
        } catch (error: any) {
          logger.warn('动态杠杆', `动态杠杆计算失败，使用静态杠杆: ${error.message}`)
          // 如果动态杠杆计算失败，使用静态杠杆
          finalLeverage = this.config.leverage
        }
      } else {
        logger.info('杠杆', `使用静态杠杆: ${finalLeverage}x`)
      }

      // 设置杠杆和持仓模式
      await this.binance.setLeverage(signal.symbol, finalLeverage)
      await this.binance.setMarginMode(signal.symbol, 'cross')
      
      // 设置持仓模式为单向（因为我们一次只持有一个方向的仓位）
      try {
        await this.binance.setPositionMode(false) // false = 单向持仓模式
        logger.info('持仓模式', '已设置为单向持仓模式')
      } catch (error: any) {
        // 如果设置失败，记录警告但继续执行
        logger.warn('持仓模式', `设置持仓模式失败: ${error.message}`)
      }

      // 计算基于风险管理的仓位大小（USDT金额）
      const riskAmount = calculatePositionSize(
        account.availableBalance,
        signal.price,
        stopLoss,
        this.config.maxRiskPercentage
      )

      // 计算最大可用USDT金额（考虑杠杆）
      const maxUsdtAmount = calculateMaxUsdtAmount(
        account.availableBalance,
        finalLeverage,
        this.config.maxRiskPercentage
      )

      // 使用较小的金额：风险金额或最大可用金额
      const usdtAmount = Math.min(riskAmount, maxUsdtAmount)

      // 检查最小名义价值
      const minQuantity = 20 / signal.price // 计算满足20 USDT最小名义价值所需的最小数量
      const estimatedQuantity = usdtAmount / signal.price
      
      let quantity: number
      let finalUsdtAmount: number
      let notional: number
      
      if (estimatedQuantity < minQuantity) {
        logger.warn('风控', `预估数量${estimatedQuantity.toFixed(4)}小于最小名义价值要求，调整到最小数量`)
        // 调整到最小数量，但确保不超过最大可用金额
        finalUsdtAmount = Math.min(minQuantity * signal.price, maxUsdtAmount)
        
        // 重新计算数量
        quantity = await this.binance.calculateOrderAmount(
          signal.symbol,
          finalUsdtAmount,
          signal.price
        )

        // 再次检查最小名义价值
        notional = quantity * signal.price
        if (notional < 20) {
          throw new Error(`订单名义价值${notional.toFixed(2)} USDT小于交易所最小要求20 USDT，账户余额可能不足`)
        }

        logger.info('开仓', `仓位参数（已调整）`, {
          数量: quantity,
          杠杆: finalLeverage,
          入场价: signal.price,
          止损价: stopLoss,
          USDT金额: finalUsdtAmount,
          名义价值: notional,
          ...leverageCalculationDetails,
        })
      } else {
        // 计算实际下单数量
        finalUsdtAmount = usdtAmount
        quantity = await this.binance.calculateOrderAmount(
          signal.symbol,
          finalUsdtAmount,
          signal.price
        )

        // 检查最小名义价值
        notional = quantity * signal.price
        if (notional < 20) {
          throw new Error(`订单名义价值${notional.toFixed(2)} USDT小于交易所最小要求20 USDT`)
        }

        logger.info('开仓', `仓位参数`, {
          数量: quantity,
          杠杆: finalLeverage,
          入场价: signal.price,
          止损价: stopLoss,
          USDT金额: finalUsdtAmount,
          名义价值: notional,
          ...leverageCalculationDetails,
        })
      }

      // 市价开仓 (开仓操作，isEntry=true)
      const side = getOrderSide(signal.direction, true)
      const order = await this.binance.marketOrder(signal.symbol, side, quantity)

      logger.success('开仓', `开仓订单已提交`, order)

      // 二次确认持仓建立（关键优化）
      logger.info('持仓确认', '开始二次确认持仓建立...')
      const positionConfirmed = await waitAndConfirmPosition(this.binance, signal.symbol)
      
      if (!positionConfirmed) {
        throw new Error('开仓后未检测到实际持仓，可能存在网络异常或订单未成交')
      }

      // 获取实际持仓信息
      const positions = await this.binance.fetchPositions(signal.symbol)
      const realPosition = positions.find(p => Math.abs(Number(p.quantity || 0)) > 0)
      
      if (!realPosition) {
        throw new Error('开仓后未检测到实际持仓')
      }

      // 使用实际持仓信息更新数量（防止部分成交）
      const actualQuantity = realPosition.quantity
      logger.info('持仓确认', `实际成交数量: ${actualQuantity} (下单数量: ${quantity})`)

      // 计算止盈价格
      const takeProfit1 = calculateTakeProfit(signal.price, stopLoss, signal.direction, 1)
      const takeProfit2 = calculateTakeProfit(signal.price, stopLoss, signal.direction, 2)

      // 设置止损单 (平仓操作，isEntry=false)
      const stopSide = getOrderSide(signal.direction, false)
      const stopOrder = await this.binance.stopLossOrder(signal.symbol, stopSide, actualQuantity, stopLoss)

      logger.success('止损', `止损单已设置`, stopOrder)

      // 更新状态
      const position: Position = {
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice: signal.price,
        quantity: actualQuantity,
        leverage: finalLeverage,
        stopLoss,
        takeProfit1,
        takeProfit2,
        openTime: Date.now(),
        orderId: order.orderId,
        stopLossOrderId: stopOrder.orderId,
        //添加一个止损订单symbol
        stopLossOrderSymbol: stopOrder.symbol,
        stopLossOrderSide: stopOrder.side,
        stopLossOrderType: stopOrder.type,
        stopLossOrderQuantity: stopOrder.quantity,
        stopLossOrderStopPrice: stopOrder.stopPrice,
        stopLossOrderStatus: stopOrder.status,
        stopLossOrderTimestamp: stopOrder.timestamp,
      }

      this.state.currentPosition = position
      this.state.status = PositionStatus.POSITION
      this.state.todayTrades += 1
      await saveBotState(this.state)

      logger.success('持仓', `持仓建立完成`, position)
    } catch (error: any) {
      logger.error('开仓', '开仓失败', error.message)
      this.state.status = PositionStatus.MONITORING
      await saveBotState(this.state)
      throw error
    }
  }
}
