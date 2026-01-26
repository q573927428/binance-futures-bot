import type { BotConfig, BotState, Position, TradeSignal, TradeHistory } from '../../../types'
import { PositionStatus } from '../../../types'
import { BinanceService } from '../../utils/binance'
import { calculateIndicators, getTrendDirection, checkADXTrend, checkLongEntry, checkShortEntry, calculateStopLoss, calculateTakeProfit, calculatePositionSize } from '../../utils/indicators'
import { analyzeMarketWithAI, checkAIAnalysisConditions } from '../../utils/ai-analysis'
import { checkCircuitBreaker, shouldResetDailyState, shouldForceLiquidate, isPositionTimeout, checkTP1Condition, checkTP2Condition, calculatePnL, getOrderSide, checkDailyTradeLimit } from '../../utils/risk'
import { logger } from '../../utils/logger'
import { saveBotState, loadBotState, saveBotConfig, loadBotConfig, getDefaultConfig, getDefaultState, addTradeHistory, getTodayTradeHistory } from '../../utils/storage'
import dayjs from 'dayjs'

/**
 * 币安永续合约交易机器人
 */
export class FuturesBot {
  private binance: BinanceService
  private config: BotConfig
  private state: BotState
  private isRunning: boolean = false
  private scanTimer: NodeJS.Timeout | null = null
  private previousADX15m: number = 0

  constructor() {
    this.config = getDefaultConfig()
    this.state = getDefaultState()
    this.binance = new BinanceService('', '', this.config.isTestnet)
  }

  /**
   * 初始化机器人
   */
  async initialize(apiKey: string, apiSecret: string): Promise<void> {
    try {
      logger.info('系统', '正在初始化交易机器人...')

      // 加载配置和状态
      const savedConfig = await loadBotConfig()
      const savedState = await loadBotState()

      if (savedConfig) {
        this.config = savedConfig
        logger.info('系统', '已加载保存的配置')
      } else {
        await saveBotConfig(this.config)
        logger.info('系统', '已创建默认配置')
      }

      if (savedState) {
        this.state = savedState
        logger.info('系统', '已加载保存的状态')
      } else {
        await saveBotState(this.state)
        logger.info('系统', '已创建默认状态')
      }

      // 初始化币安客户端
      this.binance = new BinanceService(apiKey, apiSecret, this.config.isTestnet)

      // 检查是否需要重置每日状态
      if (shouldResetDailyState(this.state.lastResetDate)) {
        await this.resetDailyState()
      }

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
    if (this.isRunning) {
      logger.warn('系统', '机器人已在运行中')
      return
    }

    try {
      logger.info('系统', '启动交易机器人...')
      this.isRunning = true
      this.state.status = PositionStatus.MONITORING
      this.state.monitoringSymbols = this.config.symbols
      await saveBotState(this.state)

      // 开始扫描循环
      await this.scanLoop()

      logger.success('系统', '交易机器人已启动')
    } catch (error: any) {
      logger.error('系统', '启动失败', error.message)
      this.isRunning = false
      throw error
    }
  }

  /**
   * 停止机器人
   */
  async stop(): Promise<void> {
    logger.info('系统', '正在停止交易机器人...')
    this.isRunning = false

    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = null
    }

    this.state.status = PositionStatus.IDLE
    await saveBotState(this.state)

    logger.success('系统', '交易机器人已停止')
  }

  /**
   * 扫描循环
   */
  private async scanLoop(): Promise<void> {
    if (!this.isRunning) return

    try {
      await this.scan()
    } catch (error: any) {
      logger.error('扫描', '扫描失败', error.message)
    }

    // 下一次扫描
    this.scanTimer = setTimeout(() => {
      this.scanLoop()
    }, this.config.scanInterval * 1000)
  }

  /**
   * 执行一次扫描
   */
  private async scan(): Promise<void> {
    // 检查是否需要重置每日状态
    if (shouldResetDailyState(this.state.lastResetDate)) {
      await this.resetDailyState()
    }

    // 检查熔断状态
    if (this.state.circuitBreaker.isTriggered) {
      logger.warn('熔断', '系统处于熔断状态，停止交易')
      this.state.status = PositionStatus.HALTED
      await saveBotState(this.state)
      return
    }

    // 检查强制平仓时间
    if (shouldForceLiquidate() && this.state.currentPosition) {
      logger.warn('风控', '到达强制平仓时间（23:30）')
      await this.closePosition('强制平仓时间')
      return
    }

    // 如果有持仓，监控持仓
    if (this.state.currentPosition) {
      await this.monitorPosition()
    } else {
      // 否则扫描交易机会
      await this.scanForOpportunities()
    }
  }

  /**
   * 扫描交易机会
   */
  private async scanForOpportunities(): Promise<void> {
    // 检查每日交易次数限制
    if (!checkDailyTradeLimit(this.state.todayTrades, 3)) {
      logger.warn('风控', '已达到每日交易次数限制')
      return
    }

    logger.info('扫描', `开始扫描交易机会 [${this.config.symbols.join(', ')}]`)

    for (const symbol of this.config.symbols) {
      try {
        const signal = await this.analyzeSymbol(symbol)

        if (signal && signal.direction !== 'IDLE') {
          logger.success('信号', `发现交易信号: ${symbol} ${signal.direction}`, {
            price: signal.price,
            confidence: signal.confidence,
            reason: signal.reason,
          })

          await this.openPosition(signal)
          break // 一次只开一个仓位
        }
      } catch (error: any) {
        logger.error('扫描', `分析${symbol}失败`, error.message)
      }
    }
  }

  /**
   * 分析交易对
   */
  private async analyzeSymbol(symbol: string): Promise<TradeSignal | null> {
    try {
      // 获取当前价格
      const price = await this.binance.fetchPrice(symbol)

      // 计算技术指标
      const indicators = await calculateIndicators(this.binance, symbol)

      // 保存ADX15m用于后续比较
      if (this.previousADX15m === 0) {
        this.previousADX15m = indicators.adx15m
      }

      // 检查ADX趋势条件（多周期）
      if (!checkADXTrend(indicators)) {
        return null
      }

      // 判断趋势方向
      const direction = getTrendDirection(price, indicators)
      if (direction === 'IDLE') {
        return null
      }

      // AI分析（如果启用）
      let aiAnalysis = undefined
      if (this.config.aiConfig.enabled && this.config.aiConfig.useForEntry) {
        const candles15m = await this.binance.fetchOHLCV(symbol, '15m', 2)
        
        // 检查candles15m是否为空
        if (candles15m.length === 0) {
          logger.warn('AI分析', `无法获取${symbol}的K线数据`)
          return null
        }
        
        // 使用非空断言，因为我们已经检查了数组长度
        const firstCandle = candles15m[0]!
        const lastCandle15m = candles15m[candles15m.length - 1]!
        const priceChange24h = ((price - firstCandle.close) / firstCandle.close) * 100

        aiAnalysis = await analyzeMarketWithAI(
          symbol,
          price,
          indicators.ema20,
          indicators.ema60,
          indicators.rsi,
          lastCandle15m.volume,
          priceChange24h
        )

        // 检查AI分析条件
        if (!checkAIAnalysisConditions(aiAnalysis, this.config.aiConfig.minConfidence, this.config.aiConfig.maxRiskLevel)) {
          logger.info('AI分析', `${symbol} AI条件不满足`, {
            score: aiAnalysis.score,
            isBullish: aiAnalysis.isBullish,
          })
          return null
        }
      }

      // 获取最后一根K线
      const candles = await this.binance.fetchOHLCV(symbol, '15m', 1)
      
      // 检查candles是否为空
      if (candles.length === 0) {
        logger.warn('分析', `无法获取${symbol}的K线数据`)
        return null
      }
      
      // 使用非空断言，因为我们已经检查了数组长度
      const lastCandle = candles[0]!

      // 检查入场条件
      let entryOk = false
      let reason = ''

      if (direction === 'LONG') {
        entryOk = checkLongEntry(price, indicators, lastCandle)
        reason = '多头趋势，价格回踩EMA，RSI适中'
      } else if (direction === 'SHORT') {
        entryOk = checkShortEntry(price, indicators, lastCandle)
        reason = '空头趋势，价格反弹EMA，RSI适中'
      }

      if (!entryOk) {
        return null
      }

      // 构建交易信号
      return {
        symbol,
        direction,
        price,
        confidence: 75,
        indicators,
        aiAnalysis,
        timestamp: Date.now(),
        reason,
      }
    } catch (error: any) {
      logger.error('分析', `分析${symbol}失败`, error.message)
      return null
    }
  }

  /**
   * 开仓
   */
  private async openPosition(signal: TradeSignal): Promise<void> {
    try {
      logger.info('开仓', `准备开仓: ${signal.symbol} ${signal.direction}`)

      // 确保方向不是IDLE
      if (signal.direction === 'IDLE') {
        logger.warn('开仓', '交易信号方向为IDLE，无法开仓')
        return
      }

      this.state.status = PositionStatus.OPENING
      await saveBotState(this.state)

      // 获取账户余额
      const account = await this.binance.fetchBalance()
      logger.info('账户', `余额: ${account.availableBalance} USDT`)

      // 计算止损价格
      const stopLoss = calculateStopLoss(
        signal.price,
        signal.direction,
        signal.indicators.atr,
        this.config.stopLossATRMultiplier,
        this.config.maxStopLossPercentage
      )

      // 计算仓位大小
      const positionSize = calculatePositionSize(
        account.availableBalance,
        signal.price,
        stopLoss,
        this.config.maxRiskPercentage
      )

      // 设置杠杆
      await this.binance.setLeverage(signal.symbol, this.config.leverage)
      await this.binance.setMarginMode(signal.symbol, 'isolated')

      // 计算实际下单数量
      const quantity = await this.binance.calculateOrderAmount(
        signal.symbol,
        positionSize * this.config.leverage,
        signal.price
      )

      logger.info('开仓', `仓位参数`, {
        数量: quantity,
        杠杆: this.config.leverage,
        入场价: signal.price,
        止损价: stopLoss,
      })

      // 市价开仓
      const side = getOrderSide(signal.direction, true)
      const order = await this.binance.marketOrder(signal.symbol, side, quantity)

      logger.success('开仓', `开仓成功`, order)

      // 计算止盈价格
      const takeProfit1 = calculateTakeProfit(signal.price, stopLoss, signal.direction, 1)
      const takeProfit2 = calculateTakeProfit(signal.price, stopLoss, signal.direction, 2)

      // 设置止损单
      const stopSide = getOrderSide(signal.direction, false)
      const stopOrder = await this.binance.stopLossOrder(signal.symbol, stopSide, quantity, stopLoss)

      logger.success('止损', `止损单已设置`, stopOrder)

      // 更新状态
      const position: Position = {
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice: signal.price,
        quantity,
        leverage: this.config.leverage,
        stopLoss,
        takeProfit1,
        takeProfit2,
        openTime: Date.now(),
        orderId: order.orderId,
        stopLossOrderId: stopOrder.orderId,
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

  /**
   * 监控持仓
   */
  private async monitorPosition(): Promise<void> {
    if (!this.state.currentPosition) return

    try {
      const position = this.state.currentPosition
      const price = await this.binance.fetchPrice(position.symbol)

      // 计算当前盈亏
      const { pnl, pnlPercentage } = calculatePnL(price, position)

      logger.info('持仓监控', `${position.symbol} ${position.direction}`, {
        入场价: position.entryPrice,
        当前价: price,
        盈亏: `${pnl.toFixed(2)} USDT (${pnlPercentage.toFixed(2)}%)`,
      })

      // 重新计算指标
      const indicators = await calculateIndicators(this.binance, position.symbol)

      // 检查持仓超时
      if (isPositionTimeout(position, this.config.positionTimeoutHours, this.previousADX15m > indicators.adx15m)) {
        logger.warn('风控', '持仓超时且ADX走弱')
        await this.closePosition('持仓超时')
        return
      }

      // 检查TP2条件
      if (checkTP2Condition(price, position, indicators.rsi, indicators.adx15m, this.previousADX15m)) {
        logger.success('止盈', '达到TP2条件，全部平仓')
        await this.closePosition('TP2止盈')
        return
      }

      // 检查TP1条件
      if (checkTP1Condition(price, position)) {
        logger.success('止盈', '达到TP1条件，平仓50%，止损移至成本')
        // TODO: 实现部分平仓逻辑
        // 这里简化处理，直接全部平仓
        await this.closePosition('TP1止盈')
        return
      }

      // 更新previousADX15m
      this.previousADX15m = indicators.adx15m
    } catch (error: any) {
      logger.error('持仓监控', '监控失败', error.message)
    }
  }

  /**
   * 平仓
   */
  private async closePosition(reason: string): Promise<void> {
    if (!this.state.currentPosition) return

    try {
      logger.info('平仓', `准备平仓: ${reason}`)

      this.state.status = PositionStatus.CLOSING
      await saveBotState(this.state)

      const position = this.state.currentPosition

      // 确保方向是LONG或SHORT
      if (position.direction === 'IDLE') {
        logger.error('平仓', '持仓方向为IDLE，无法平仓')
        return
      }

      // 取消所有未成交订单
      await this.binance.cancelAllOrders(position.symbol)

      // 市价平仓
      const side = getOrderSide(position.direction, false)
      const order = await this.binance.marketOrder(position.symbol, side, position.quantity)

      logger.success('平仓', `平仓成功`, order)

      // 获取当前价格
      const exitPrice = await this.binance.fetchPrice(position.symbol)
      const { pnl, pnlPercentage } = calculatePnL(exitPrice, position)

      // 记录交易历史
      const trade: TradeHistory = {
        id: `${Date.now()}-${position.symbol}`,
        symbol: position.symbol,
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        leverage: position.leverage,
        pnl,
        pnlPercentage,
        openTime: position.openTime,
        closeTime: Date.now(),
        reason,
      }

      await addTradeHistory(trade)

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
      const breaker = checkCircuitBreaker(this.state.dailyPnL, consecutiveLosses, account.balance)

      this.state.circuitBreaker = breaker
      this.state.currentPosition = null
      this.state.status = breaker.isTriggered ? PositionStatus.HALTED : PositionStatus.MONITORING

      await saveBotState(this.state)

      if (breaker.isTriggered) {
        logger.error('熔断', breaker.reason)
      }

      logger.success('交易完成', `盈亏: ${pnl.toFixed(2)} USDT (${pnlPercentage.toFixed(2)}%)`)
    } catch (error: any) {
      logger.error('平仓', '平仓失败', error.message)
      throw error
    }
  }

  /**
   * 重置每日状态
   */
  private async resetDailyState(): Promise<void> {
    logger.info('系统', '重置每日状态')

    this.state.todayTrades = 0
    this.state.dailyPnL = 0
    this.state.lastResetDate = dayjs().format('YYYY-MM-DD')
    this.state.circuitBreaker = {
      isTriggered: false,
      reason: '',
      timestamp: Date.now(),
      dailyLoss: 0,
      consecutiveLosses: 0,
    }

    await saveBotState(this.state)
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<BotConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig }
    await saveBotConfig(this.config)

    // 如果测试网模式变化，重新初始化币安客户端
    if (newConfig.isTestnet !== undefined) {
      const config = useRuntimeConfig()
      this.binance = new BinanceService(
        config.binanceApiKey,
        config.binanceSecret,
        this.config.isTestnet
      )
    }

    logger.success('配置', '配置已更新')
  }

  /**
   * 获取当前配置
   */
  getConfig(): BotConfig {
    return this.config
  }

  /**
   * 获取当前状态
   */
  getState(): BotState {
    return this.state
  }

  /**
   * 获取交易历史
   */
  async getHistory(limit?: number): Promise<TradeHistory[]> {
    return getTodayTradeHistory()
  }
}

// 导出单例
let botInstance: FuturesBot | null = null

export function getFuturesBot(): FuturesBot {
  if (!botInstance) {
    botInstance = new FuturesBot()
  }
  return botInstance
}
