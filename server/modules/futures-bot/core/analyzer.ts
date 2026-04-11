import type { TradeSignal, BotConfig, OHLCV, TechnicalIndicators } from '../../../../types'
import { BinanceService } from '../../../utils/binance'
import { getTrendDirection, checkADXTrend, checkLongEntry, checkShortEntry, checkVolatility, checkPriceActionSignal } from '../../../utils/indicators'
import { analyzeMarketWithAI, checkAIAnalysisConditions } from '../../../utils/ai-analysis'
import { logger } from '../../../utils/logger'
import { IndicatorsCache } from '../services/indicators-cache'

/**
 * 市场分析器
 */
export class MarketAnalyzer {
  private binance: BinanceService
  private config: BotConfig
  private indicatorsCache: IndicatorsCache
  private previousADXMap: Record<string, number> = {}
  private crossSignalTracker: Record<string, { timestamp: number; direction: 'LONG' | 'SHORT' }> = {}
  private paSignalTracker: Record<string, { timestamp: number; direction: 'LONG' | 'SHORT' }> = {}

  constructor(binance: BinanceService, config: BotConfig) {
    this.binance = binance
    this.config = config
    this.indicatorsCache = IndicatorsCache.getInstance(binance, config)
  }

  /**
   * 更新配置
   */
  updateConfig(config: BotConfig): void {
    this.config = config
    // 同步更新 indicatorsCache 的配置
    this.indicatorsCache.updateConfig(config)
  }

  /**
   * 获取ADX映射表（供持仓监控使用）
   */
  getPreviousADX(symbol: string): number | undefined {
    return this.previousADXMap[symbol]
  }

  /**
   * 更新ADX值
   */
  updatePreviousADX(symbol: string, adx: number): void {
    this.previousADXMap[symbol] = adx
  }

  /**
   * 分析交易对（优化版：逻辑更简洁，减少冗余计算）
   */
  async analyzeSymbol(symbol: string): Promise<TradeSignal | null> {
    try {
      // ==============================
      // 1. 数据准备 + 开关预检查
      // ==============================
      // 提前读取开关配置，避免后续无效计算
      const aiEnabled = this.config.aiConfig.enabled && this.config.aiConfig.useForEntry

      // 获取当前价格
      const price = await this.binance.fetchPrice(symbol)

      // 根据策略模式选择K线周期
      const mainTF = this.config.strategyMode === 'medium_term' ? '1h' : '15m'
      const mainCandlesCount = this.config.indicatorsConfig?.requiredCandles || 300
      
      // 获取主K线数据
      const mainCandles = await this.binance.fetchOHLCV(symbol, mainTF, undefined, mainCandlesCount)
      if (mainCandles.length === 0) {
        this.logAnalysisResult(symbol, false, 'K线数据为空', price)
        return null
      }

      // 使用指标缓存服务获取技术指标
      const indicators = await this.indicatorsCache.getIndicators(symbol)
      const lastCandle = mainCandles[mainCandles.length - 1]!
      const volumeHistory = mainCandles.map(candle => candle.volume)
      // 仅当AI开启时才计算24h涨跌幅，减少计算
      const priceChange24h = aiEnabled 
        ? ((price - mainCandles[0]!.close) / mainCandles[0]!.close) * 100 
        : 0

      // ==============================
      // 2. 基础条件验证（优先级：ADX > 波动率）
      // ==============================
      // 保存ADX15m用于后续比较
      this.previousADXMap[symbol] = indicators.adx15m

      // 先检查ADX趋势条件（优先级最高，不通过直接返回，避免后续计算）
      const adxResult = checkADXTrend(indicators, this.config)
      if (!adxResult.passed) {
        let logReason = `ADX趋势条件不满足：${adxResult.reason}`
        this.logAnalysisResult(symbol, false, logReason, price)
        return null
      }

      // 再检查波动率条件（用户要求必须保留，优先级次高）
      const volatilityResult = checkVolatility(price, indicators, this.config, symbol)
      if (!volatilityResult.passed) {
        let logReason = `波动率条件不满足：${volatilityResult.reason}`
        this.logAnalysisResult(symbol, false, logReason, price)
        return null
      }

      // ==============================
      // 3. AI分析（仅AI开启时执行，不影响PA/EMA交叉信号，仅作为独立入场信号）
      // ==============================
      let aiAnalysis = undefined
      let aiDirection: 'LONG' | 'SHORT' | null = null
      let aiFailReason = ''
      if (aiEnabled) {
        aiAnalysis = await analyzeMarketWithAI(
          symbol,
          price,
          indicators.ema20,
          indicators.ema60,
          indicators.rsi,
          lastCandle.volume,
          priceChange24h,
          indicators,
          this.config
        )

        // 仅当AI作为入场信号时检查条件，PA/EMA交叉信号不受AI限制
        const aiConditionsResult = checkAIAnalysisConditions(
          aiAnalysis,
          this.config.aiConfig.minScore,
          this.config.aiConfig.minConfidence,
          this.config.aiConfig.maxRiskLevel,
          this.config.aiConfig.conditionMode ?? 'SCORE_ONLY'
        )
        
        // AI满足条件时记录有效方向，不满足时仅不触发AI信号，不阻止PA/EMA交叉
        if (aiConditionsResult.passed) {
          aiDirection = aiAnalysis.direction as 'LONG' | 'SHORT'
        } else {
          aiFailReason = `； AI未通过：${aiConditionsResult.reason}`
        }
      }

      // ==============================
      // 4. PA信号检测 + 趋势方向判断（后置到硬过滤之后，优先级：PA > AI > EMA交叉）
      // ==============================
      const paResult = this.processPASignal(symbol, mainCandles, price, indicators, lastCandle)

      if (paResult.shouldAbort) {
        this.logAnalysisResult(symbol, false, paResult.abortReason!, price)
        return null
      }

      const paTriggered = paResult.triggered
      const paDirection = paResult.direction
      const paReason = paResult.reason
      const paLogSuffix = paResult.logSuffix

      // 判断趋势方向：优先级 PA > AI > EMA交叉
      let trendResult
      if (paTriggered && paDirection) {
        // PA触发时，使用PA方向作为交易方向
        trendResult = {
          direction: paDirection,
          reason: paReason,
          data: {
            isCrossSignal: false
          }
        }
      } else if (aiDirection) {
        // AI触发时，使用AI方向作为交易方向
        trendResult = {
          direction: aiDirection,
          reason: `[AI信号] 方向${aiDirection}，置信度${aiAnalysis?.confidence}`,
          data: {
            isCrossSignal: false
          }
        }
      } else {
        // 没有PA和AI信号时使用正常趋势检测（含EMA金叉/死叉）
        trendResult = getTrendDirection(price, indicators, this.config, mainCandles)
      }
      if (trendResult.direction === 'IDLE') {
        this.logAnalysisResult(symbol, false, `无明确趋势方向：${trendResult.reason}${paLogSuffix}${aiFailReason}`, price)
        return null
      }

      const isCrossSignal = trendResult.data?.isCrossSignal === true
      const crossCandleTimestamp = trendResult.data?.crossCandleTimestamp as number | undefined

      // 交叉信号防抖：同一根K线同方向交叉仅触发一次
      if (isCrossSignal && crossCandleTimestamp && (trendResult.direction === 'LONG' || trendResult.direction === 'SHORT')) {
        const shouldDebounce = this.checkSignalDebounce(
          symbol,
          crossCandleTimestamp,
          trendResult.direction,
          this.crossSignalTracker
        )

        if (shouldDebounce) {
          this.logAnalysisResult(symbol, false, `交叉信号防抖：同一根K线已触发${trendResult.direction}，本次忽略`, price)
          return null
        }
      }

      // ==============================
      // 5. 入场条件检查
      // ==============================
      let entryResult: any = null

      if (isCrossSignal) {
        entryResult = {
          passed: true,
          reason: trendResult.reason
        }
      } else if (trendResult.direction === 'LONG') {
        entryResult = checkLongEntry(price, indicators, lastCandle, this.config, volumeHistory, mainCandles)
      } else if (trendResult.direction === 'SHORT') {
        entryResult = checkShortEntry(price, indicators, lastCandle, this.config, volumeHistory, mainCandles)
      }

      const entryOk = entryResult?.passed || false

      if (!entryOk) {
        let logReason = `入场条件不满足：方向${trendResult.direction} ${entryResult?.reason || '未知原因'}`
        if (this.config.indicatorsConfig?.showCrossFailureReason && trendResult.data?.crossFailureReason) {
          logReason = `${logReason} ； ${trendResult.data.crossFailureReason}`
        }
        logReason += paLogSuffix + aiFailReason
        this.logAnalysisResult(symbol, false, logReason, price)
        return null
      }

      // ==============================
      // 6. 生成交易信号
      // ==============================
      let finalReason = entryResult?.reason || '入场条件满足'
      if (paTriggered && paDirection) {
        // PA触发时，在原因前添加PA信号说明
        finalReason = `${paReason}，${finalReason}`
      }
      
      const signal: TradeSignal = {
        symbol,
        direction: trendResult.direction,
        price,
        confidence: aiAnalysis?.confidence || (paTriggered ? 70 : 60),
        indicators,
        aiAnalysis,
        timestamp: Date.now(),
        reason: finalReason, 
      }

      // 记录最终分析结果，包含具体原因
      logger.success('分析结果', `${symbol} @${this.formatPrice(price)} ${finalReason}`)
      
      return signal
    } catch (error: any) {
      this.logAnalysisResult(symbol, false, `分析失败: ${error.message}`)
      logger.error('分析', `分析${symbol}失败`, error.message)
      return null
    }
  }

  /**
   * 格式化价格显示
   * 根据价格大小自动调整小数位数
   */
  private formatPrice(price: number): string {
    if (price >= 1) {
      // 大于等于1，保留2位小数 (如 BTC: 67890.50, ETH: 3456.78)
      return price.toFixed(2)
    } else if (price >= 0.01) {
      // 0.01-1之间，保留3位小数 (如 DOGE: 0.123)
      return price.toFixed(3)
    } else {
      // 小于0.01，保留6位小数 (如 SHIB: 0.000023)
      return price.toFixed(6)
    }
  }

  /**
   * 通用防抖检查：同一根K线同方向信号仅触发一次
   */
  private checkSignalDebounce(
    symbol: string,
    timestamp: number,
    direction: 'LONG' | 'SHORT',
    tracker: Record<string, { timestamp: number; direction: 'LONG' | 'SHORT' }>
  ): boolean {
    const previous = tracker[symbol]
    if (
      previous &&
      previous.timestamp === timestamp &&
      previous.direction === direction
    ) {
      return true // 已触发过，需要防抖
    }
    // 记录本次信号
    tracker[symbol] = { timestamp, direction }
    return false // 无需防抖
  }

  /**
   * 处理PA信号检测和防抖逻辑
   */
  private processPASignal(
    symbol: string,
    mainCandles: OHLCV[],
    price: number,
    indicators: TechnicalIndicators,
    lastCandle: OHLCV
  ): {
    triggered: boolean
    direction: 'LONG' | 'SHORT' | null
    reason: string
    logSuffix: string
    shouldAbort: boolean
    abortReason?: string
  } {
    const paEnabled = this.config.indicatorsConfig?.priceAction?.enabled ?? false
    
    if (!paEnabled) {
      return {
        triggered: false,
        direction: null,
        reason: '',
        logSuffix: '',
        shouldAbort: false
      }
    }

    const paSignal = checkPriceActionSignal(
      mainCandles, 
      this.config,
      price,
      indicators.ema20,
      indicators.ema60
    )

    let logSuffix = `； PA检测：${paSignal.reason}`

    // PA信号防抖：同一根K线同方向信号仅触发一次
    if (paSignal.triggered && paSignal.direction) {
      const shouldDebounce = this.checkSignalDebounce(
        symbol,
        lastCandle.timestamp,
        paSignal.direction,
        this.paSignalTracker
      )

      if (shouldDebounce) {
        return {
          triggered: false,
          direction: null,
          reason: '',
          logSuffix: '',
          shouldAbort: true,
          abortReason: `PA信号防抖：同一根K线已触发${paSignal.direction}，本次忽略`
        }
      }

      logger.info('PA信号处理', `${symbol} @${this.formatPrice(price)} ${paSignal.reason}，已通过ADX/波动率/AI，进入趋势与入场验证`)
      
      return {
        triggered: true,
        direction: paSignal.direction,
        reason: paSignal.reason,
        logSuffix: '',
        shouldAbort: false
      }
    }

    return {
      triggered: false,
      direction: null,
      reason: '',
      logSuffix,
      shouldAbort: false
    }
  }

  /**
   * 记录分析结果
   */
  private logAnalysisResult(
    symbol: string,
    passed: boolean,
    summary: string,
    price?: number
  ): void {
    const priceStr = price ? ` @${this.formatPrice(price)}` : ''
    if (passed) {
      logger.success('分析结果', `${symbol}${priceStr} 分析通过，生成交易信号`)
    } else {
      logger.info('分析结果', `${symbol}${priceStr} 分析未通过: ${summary}`)
    }
  }
}