import type { BotConfig, BotState, Position, TradeSignal, TradeHistory } from '../../../types'
import { PositionStatus } from '../../../types'
import { BinanceService } from '../../utils/binance'
import { calculateIndicators, getTrendDirection, checkADXTrend, checkLongEntry, checkShortEntry, calculateStopLoss, calculateTakeProfit, calculatePositionSize, calculateMaxUsdtAmount, checkMinNotional } from '../../utils/indicators'
import { analyzeMarketWithAI, checkAIAnalysisConditions } from '../../utils/ai-analysis'
import { checkCircuitBreaker, shouldResetDailyState, shouldForceLiquidate, isPositionTimeout, checkTP1Condition, checkTP2Condition, calculatePnL, getOrderSide, checkDailyTradeLimit } from '../../utils/risk'
import { logger } from '../../utils/logger'
import { saveBotState, loadBotState, saveBotConfig, loadBotConfig, getDefaultConfig, getDefaultState, addTradeHistory, getTradeHistory, updateTotalStatsInState } from '../../utils/storage'
import { 
  calculateQuickLeverage,
  calculateSafeLeverage,
  calculateFinalLeverage
} from '../../utils/dynamic-leverage'
import dayjs from 'dayjs'

/**
 * 币安永续合约交易机器人
 */
export class FuturesBot {
  private binance: BinanceService
  private config: BotConfig
  private state: BotState
  private isInitialized: boolean = false
  private scanTimer: NodeJS.Timeout | null = null
  private previousADX15m: number = 0

  constructor() {
    this.config = getDefaultConfig()
    this.state = getDefaultState()
    this.binance = new BinanceService()
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

      // 检查是否需要重置每日状态
      if (shouldResetDailyState(this.state.lastResetDate)) {
        await this.resetDailyState()
      }

      // 如果保存的状态显示机器人正在运行，自动重启扫描循环
      if (this.state.isRunning && (this.state.status === PositionStatus.MONITORING || this.state.status === PositionStatus.POSITION)) {
        logger.info('系统', '检测到机器人之前正在运行，自动重启扫描循环')
        // 注意：这里不调用 start() 避免重复初始化
        // 直接开始扫描循环
        await this.scanLoop()
      }

      // 初始化总统计数据并更新当前状态
      const updatedState = await updateTotalStatsInState()
      if (updatedState) {
        this.state = updatedState
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
    if (this.state.isRunning && !this.state.circuitBreaker.isTriggered) {
      logger.warn('系统', '机器人已在运行中')
      return
    }

    // 情况2：机器人处于熔断状态
    if (this.state.circuitBreaker.isTriggered) {
      logger.info('系统', '机器人处于熔断状态，尝试重置并启动...')
    }

    try {
      logger.info('系统', '启动交易机器人...')

      // 重置熔断状态（如果处于熔断状态）
      if (this.state.circuitBreaker.isTriggered) {
        logger.info('熔断', '检测到熔断状态，正在重置...')
        this.state.circuitBreaker = {
          isTriggered: false,
          reason: '',
          timestamp: Date.now(),
          dailyLoss: 0,
          consecutiveLosses: 0,
        }
        logger.success('熔断', '熔断状态已重置')
      }

      this.state.isRunning = true
      this.state.status = PositionStatus.MONITORING
      this.state.monitoringSymbols = this.config.symbols
      await saveBotState(this.state)

      logger.success('系统', '交易机器人已启动')
      // 开始扫描循环
      await this.scanLoop()

    } catch (error: any) {
      logger.error('系统', '启动失败', error.message)
      this.state.isRunning = false
      await saveBotState(this.state)
      throw error
    }
  }

  /**
   * 停止机器人
   */
  async stop(): Promise<void> {
    logger.info('系统', '正在停止交易机器人...')
    this.state.isRunning = false

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
    if (!this.state.isRunning) return

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
      this.state.isRunning = false
      await saveBotState(this.state)
      return
    }

    // 检查强制平仓时间
    if (shouldForceLiquidate(this.config.riskConfig) && this.state.currentPosition) {
      logger.warn('风控', '到达强制平仓时间')
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
    const dailyLimitPassed = checkDailyTradeLimit(this.state.todayTrades, this.config.riskConfig)
    
    if (!dailyLimitPassed) {
      logger.warn('风控', '已达到每日交易次数限制，停止扫描', {
        今日交易次数: this.state.todayTrades,
        限制次数: this.config.riskConfig.dailyTradeLimit,
      })
      // 停止机器人运行，避免不必要的API调用
      this.state.isRunning = false
      this.state.status = PositionStatus.IDLE
      await saveBotState(this.state)
      return
    }

    logger.info('扫描', `开始扫描交易机会 [${this.config.symbols.join(', ')}]`, {
      今日交易次数: this.state.todayTrades,
      限制次数: this.config.riskConfig.dailyTradeLimit,
    })

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
      const adxResult = checkADXTrend(indicators)
      if (!adxResult.passed) {
        this.logAnalysisResult(symbol, false, `ADX趋势条件不满足：${adxResult.reason}`)
        return null
      }

      // 判断趋势方向
      const trendResult = getTrendDirection(price, indicators)
      if (trendResult.direction === 'IDLE') {
        this.logAnalysisResult(symbol, false, `无明确趋势方向：${trendResult.reason}`)
        return null
      }

      // 获取15分钟K线数据（用于AI分析、价格变化计算和入场条件检查）
      const candles15m = await this.binance.fetchOHLCV(symbol, '15m', 2)
      
      // 检查candles15m是否为空
      if (candles15m.length === 0) {
        this.logAnalysisResult(symbol, false, 'K线数据为空')
        return null
      }
      
      const firstCandle = candles15m[0]!
      const lastCandle = candles15m[candles15m.length - 1]!
      const priceChange24h = ((price - firstCandle.close) / firstCandle.close) * 100

      // 检查入场条件
      let entryResult: any = null

      if (trendResult.direction === 'LONG') {
        entryResult = checkLongEntry(price, indicators, lastCandle)
      } else if (trendResult.direction === 'SHORT') {
        entryResult = checkShortEntry(price, indicators, lastCandle)
      }

      const entryOk = entryResult?.passed || false

      if (!entryOk) {
        this.logAnalysisResult(symbol, false, `入场条件不满足：方向${trendResult.direction} ${entryResult?.reason || '未知原因'}`)
        return null
      }

      // AI分析（如果启用）
      let aiAnalysis = undefined
      if (this.config.aiConfig.enabled && this.config.aiConfig.useForEntry) {
        aiAnalysis = await analyzeMarketWithAI(
          symbol,
          price,
          indicators.ema20,
          indicators.ema60,
          indicators.rsi,
          lastCandle.volume,
          priceChange24h,
          indicators
        )

        // 检查AI分析条件
        const aiConditionsPassed = checkAIAnalysisConditions(aiAnalysis, this.config.aiConfig.minConfidence, this.config.aiConfig.maxRiskLevel)
        if (!aiConditionsPassed) {
          this.logAnalysisResult(symbol, false, `AI分析条件不满足：方向${aiAnalysis.direction}、置信度${aiAnalysis.confidence}、评分${aiAnalysis.score}、风险${aiAnalysis.riskLevel}`)
          return null
        }
      }

      // 构建交易信号
      const signal: TradeSignal = {
        symbol,
        direction: trendResult.direction,
        price,
        confidence: aiAnalysis?.confidence || 60,
        indicators,
        aiAnalysis,
        timestamp: Date.now(),
        reason: entryResult?.reason || '入场条件满足', 
      }

      // 记录最终分析结果
      this.logAnalysisResult(symbol, true, '所有条件满足，生成交易信号')
      
      return signal
    } catch (error: any) {
      this.logAnalysisResult(symbol, false, `分析失败: ${error.message}`)
      logger.error('分析', `分析${symbol}失败`, error.message)
      return null
    }
  }

  /**
   * 记录分析结果
   */
  private logAnalysisResult(
    symbol: string,
    passed: boolean,
    summary: string
  ): void {
    if (passed) {
      logger.success('分析结果', `${symbol} 分析通过，生成交易信号`)
    } else {
      logger.info('分析结果', `${symbol} 分析未通过: ${summary}`)
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

      //如果账户余额不足120，提示不够return
      if (account.availableBalance < 120) {
        logger.warn('余额不足', `账户余额（${account.availableBalance} USDT）,不足120 USDT，无法开仓`)
        return
      }

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

      logger.success('开仓', `开仓成功`, order)

      // 计算止盈价格
      const takeProfit1 = calculateTakeProfit(signal.price, stopLoss, signal.direction, 1)
      const takeProfit2 = calculateTakeProfit(signal.price, stopLoss, signal.direction, 2)

      // 设置止损单 (平仓操作，isEntry=false)
      const stopSide = getOrderSide(signal.direction, false)
      const stopOrder = await this.binance.stopLossOrder(signal.symbol, stopSide, quantity, stopLoss)

      logger.success('止损', `止损单已设置`, stopOrder)

      // 更新状态
      const position: Position = {
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice: signal.price,
        quantity,
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

  /**
   * 监控持仓
   */
  private async monitorPosition(): Promise<void> {
    if (!this.state.currentPosition) return

    try {
      const position = this.state.currentPosition
      
      // 第一步：检查交易所实际持仓状态（新增容错机制）
      await this.checkPositionConsistency(position)

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

      // 检查持仓超时
      if (isPositionTimeout(position, this.config.positionTimeoutHours, this.previousADX15m > indicators.adx15m)) {
        logger.warn('风控', '持仓超时且ADX走弱')
        await this.closePosition('持仓超时')
        return
      }

      // 检查TP2条件
      if (checkTP2Condition(price, position, indicators.rsi, indicators.adx15m, this.previousADX15m, this.config.riskConfig)) {
        logger.success('止盈', '达到TP2条件，全部平仓')
        await this.closePosition('TP2止盈')
        return
      }

      // 检查TP1条件 目前 直接全部平仓（简化策略）
      if (checkTP1Condition(price, position)) {
        logger.success('止盈', '达到TP1条件，直接全部平仓（简化策略）')
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
   * 检查持仓一致性（新增方法）
   * 验证本地持仓状态与交易所实际状态是否一致
   */
  private async checkPositionConsistency(position: Position): Promise<boolean> {
    const exchangePositions = await this.binance.fetchPositions(position.symbol)
  
    const hasPositionOnExchange = exchangePositions.some(p => {
      const exchangeSymbol = p.symbol.replace(':USDT', '')
      const localSymbol = position.symbol.replace(':USDT', '')
  
      if (exchangeSymbol !== localSymbol) return false
  
      const size = Number(
        (p as any).contracts ??
        (p as any).quantity ??
        (p as any).positionAmt ??
        0
      )
  
      return Math.abs(size) > 0
    })
  
    // 🔥 核心判断：如果交易所没有持仓，说明仓位已被平仓（止损或止盈）
    if (!hasPositionOnExchange) {
      logger.warn(
        '状态同步',
        `检测到 ${position.symbol} 仓位已不存在（可能已止损/平仓），开始补偿平仓流程`
      )
  
      try {
        // 尝试查询止损订单状态
        if (position.stopLossOrderId) {
          await this.handleCompensatedClose(position, '止损触发')
        } else {
          // 如果没有止损订单ID，可能是其他原因平仓
          await this.handleCompensatedClose(position, '未知原因平仓')
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
  private async handleCompensatedClose(position: Position, reason: string): Promise<void> {
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
            exitPrice = stopOrder.price || position.stopLoss
            logger.info('补偿平仓', `止损订单已成交，成交价: ${exitPrice}`)
          } else {
            //如果订单未成交 尝试取消止损单
            try {
              await this.binance.cancelOrder(position.stopLossOrderId, position.symbol, { trigger: true })
              logger.info('补偿平仓', `成功取消止损订单: ${position.stopLossOrderId}`)
              exitPrice = stopOrder.price || position.stopLoss
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

      // 计算盈亏
      const { pnl, pnlPercentage } = calculatePnL(exitPrice, position)

      // 记录交易历史
      const trade: TradeHistory = {
        id: `${closeTime}-${position.symbol}`,
        symbol: position.symbol,
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        leverage: position.leverage,
        pnl,
        pnlPercentage,
        openTime: position.openTime,
        closeTime,
        reason,
      }

      // 添加交易历史并更新状态
      const updatedState = await addTradeHistory(trade)
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

      // 取消止损单（条件单）
      if (position.stopLossOrderId) {
        try {
          await this.binance.cancelOrder(position.stopLossOrderId, position.symbol, { trigger: true })
          logger.info('平仓', '止损单已取消')
        } catch (e: any) {
          logger.warn('平仓', `取消止损单失败: ${e.message}`)
        }
      }

      // 取消所有未成交订单
      try {
        await this.binance.cancelAllOrders(position.symbol)
      } catch (err) {
        logger.warn('平仓', '取消挂单失败，继续强制平仓')
      }

      // 市价平仓 (平仓操作，isEntry=false)
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

      // 添加交易历史并更新状态
      const updatedState = await addTradeHistory(trade)
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
      
      // 如果触发熔断，停止运行
      if (breaker.isTriggered) {
        this.state.isRunning = false
      }

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
    
    // 保存重置前的运行状态，用于判断是否需要自动重启
    const wasRunning = this.state.isRunning
    
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
    
    // 简单实用的自动重启逻辑：
    // 如果重置前机器人是停止状态（可能是因为达到每日交易限制），
    // 重置后自动启动机器人
    if (!wasRunning) {
      logger.info('系统', '每日状态重置完成，自动启动机器人')
      this.state.isRunning = true
      this.state.status = PositionStatus.MONITORING
      await saveBotState(this.state)
      
      // 开始扫描循环
      await this.scanLoop()
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<BotConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig }
    await saveBotConfig(this.config)

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
    return getTradeHistory()
  }

  /**
   * 获取 Binance 服务实例
   */
  getBinanceService(): BinanceService {
    return this.binance
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
