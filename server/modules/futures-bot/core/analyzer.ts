import type { TradeSignal, BotConfig } from '../../../../types'
import { BinanceService } from '../../../utils/binance'
import { calculateIndicators, getTrendDirection, checkADXTrend, checkLongEntry, checkShortEntry } from '../../../utils/indicators'
import { analyzeMarketWithAI, checkAIAnalysisConditions } from '../../../utils/ai-analysis'
import { logger } from '../../../utils/logger'
import { IndicatorsCache } from '../services/indicators-cache'

/**
 * 市场分析器
 */
export class MarketAnalyzer {
  private binance: BinanceService
  private config: BotConfig
  private previousADXMap: Record<string, number> = {}

  constructor(binance: BinanceService, config: BotConfig) {
    this.binance = binance
    this.config = config
  }

  /**
   * 更新配置
   */
  updateConfig(config: BotConfig): void {
    this.config = config
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
   * 分析交易对
   */
  async analyzeSymbol(symbol: string): Promise<TradeSignal | null> {
    try {
      // 获取当前价格
      const price = await this.binance.fetchPrice(symbol)

      // 计算技术指标
      const indicators = await calculateIndicators(this.binance, symbol)

      // 保存ADX15m用于后续比较（按symbol记录）
      // 更新当前symbol的ADX值
      this.previousADXMap[symbol] = indicators.adx15m

      // 检查ADX趋势条件（多周期）
      const adxResult = checkADXTrend(indicators, this.config)
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
      const candles15m = await this.binance.fetchOHLCV(symbol, '15m', 20)
      
      // 检查candles15m是否为空
      if (candles15m.length === 0) {
        this.logAnalysisResult(symbol, false, 'K线数据为空')
        return null
      }
      
      const firstCandle = candles15m[0]!
      const lastCandle = candles15m[candles15m.length - 1]!
      const priceChange24h = ((price - firstCandle.close) / firstCandle.close) * 100

      // 获取成交量历史数据（用于成交量确认）
      const volumeHistory = candles15m.map(candle => candle.volume)
      
      // 检查入场条件
      let entryResult: any = null

      if (trendResult.direction === 'LONG') {
        entryResult = checkLongEntry(price, indicators, lastCandle, this.config, volumeHistory)
      } else if (trendResult.direction === 'SHORT') {
        entryResult = checkShortEntry(price, indicators, lastCandle, this.config, volumeHistory)
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
}
