import { EMA, RSI, ADX, ATR } from 'technicalindicators'
import type { OHLCV, TechnicalIndicators } from '../../types'
import { BinanceService } from './binance'

/**
 * 计算技术指标
 */
export async function calculateIndicators(
  binance: BinanceService,
  symbol: string
): Promise<TechnicalIndicators> {
  try {
    // 获取不同周期的K线数据
    const candles15m = await binance.fetchOHLCV(symbol, '15m', 100)
    const candles1h = await binance.fetchOHLCV(symbol, '1h', 100)
    const candles4h = await binance.fetchOHLCV(symbol, '4h', 100)

    const closes15m = candles15m.map(c => c.close)
    const highs15m = candles15m.map(c => c.high)
    const lows15m = candles15m.map(c => c.low)

    // 计算EMA（基于15分钟）
    const ema20Values = EMA.calculate({ period: 20, values: closes15m })
    const ema30Values = EMA.calculate({ period: 30, values: closes15m })
    const ema60Values = EMA.calculate({ period: 60, values: closes15m })

    // 计算RSI（基于15分钟）
    const rsiValues = RSI.calculate({ period: 14, values: closes15m })

    // 计算ATR（基于15分钟）
    const atrInput = candles15m.map(c => ({
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    const atrValues = ATR.calculate({ period: 14, high: highs15m, low: lows15m, close: closes15m })

    // 计算ADX（多周期）
    const adx15mValues = ADX.calculate({
      high: candles15m.map(c => c.high),
      low: candles15m.map(c => c.low),
      close: candles15m.map(c => c.close),
      period: 14,
    })

    const adx1hValues = ADX.calculate({
      high: candles1h.map(c => c.high),
      low: candles1h.map(c => c.low),
      close: candles1h.map(c => c.close),
      period: 14,
    })

    const adx4hValues = ADX.calculate({
      high: candles4h.map(c => c.high),
      low: candles4h.map(c => c.low),
      close: candles4h.map(c => c.close),
      period: 14,
    })

    return {
      ema20: ema20Values[ema20Values.length - 1] || 0,
      ema30: ema30Values[ema30Values.length - 1] || 0,
      ema60: ema60Values[ema60Values.length - 1] || 0,
      adx15m: adx15mValues[adx15mValues.length - 1]?.adx || 0,
      adx1h: adx1hValues[adx1hValues.length - 1]?.adx || 0,
      adx4h: adx4hValues[adx4hValues.length - 1]?.adx || 0,
      rsi: rsiValues[rsiValues.length - 1] || 0,
      atr: atrValues[atrValues.length - 1] || 0,
    }
  } catch (error: any) {
    throw new Error(`计算技术指标失败: ${error.message}`)
  }
}

/**
 * 检查ADX趋势条件（多周期确认）
 */
export function checkADXTrend(indicators: TechnicalIndicators): boolean {
  return (
    indicators.adx15m >= 20 &&
    indicators.adx1h >= 22 &&
    indicators.adx4h >= 25
  )
}

/**
 * 判断趋势方向
 */
export function getTrendDirection(
  price: number,
  indicators: TechnicalIndicators
): 'LONG' | 'SHORT' | 'IDLE' {
  const { ema20, ema60 } = indicators

  // 做多条件：EMA20 > EMA60 且 价格 > EMA20
  if (ema20 > ema60 && price > ema20) {
    return 'LONG'
  }

  // 做空条件：EMA20 < EMA60 且 价格 < EMA20
  if (ema20 < ema60 && price < ema20) {
    return 'SHORT'
  }

  return 'IDLE'
}

/**
 * 检查做多入场条件
 */
export function checkLongEntry(
  price: number,
  indicators: TechnicalIndicators,
  lastCandle: OHLCV
): boolean {
  const { ema20, ema30, rsi } = indicators

  // 价格回踩 EMA20/EMA30（±0.2%）
  const nearEMA20 = Math.abs(price - ema20) / ema20 <= 0.002
  const nearEMA30 = Math.abs(price - ema30) / ema30 <= 0.002

  // RSI在[40,60]区间
  const rsiInRange = rsi >= 40 && rsi <= 60

  // 最近K线为确认阳线或明显下影线
  const isConfirmCandle =
    lastCandle.close > lastCandle.open ||
    (lastCandle.open - lastCandle.low) / lastCandle.open >= 0.003

  return (nearEMA20 || nearEMA30) && rsiInRange && isConfirmCandle
}

/**
 * 检查做空入场条件
 */
export function checkShortEntry(
  price: number,
  indicators: TechnicalIndicators,
  lastCandle: OHLCV
): boolean {
  const { ema20, ema30, rsi } = indicators

  // 价格反弹至 EMA20/EMA30（±0.2%）
  const nearEMA20 = Math.abs(price - ema20) / ema20 <= 0.002
  const nearEMA30 = Math.abs(price - ema30) / ema30 <= 0.002

  // RSI在[40,60]区间
  const rsiInRange = rsi >= 40 && rsi <= 60

  // 最近K线为确认阴线或明显上影线
  const isConfirmCandle =
    lastCandle.close < lastCandle.open ||
    (lastCandle.high - lastCandle.open) / lastCandle.open >= 0.003

  return (nearEMA20 || nearEMA30) && rsiInRange && isConfirmCandle
}

/**
 * 计算止损价格
 */
export function calculateStopLoss(
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  atr: number,
  atrMultiplier: number = 1.2,
  maxStopLossPercent: number = 1.5
): number {
  const stopLossDistance = atr * atrMultiplier
  const maxStopLossDistance = entryPrice * (maxStopLossPercent / 100)

  // 使用较小的止损距离
  const finalDistance = Math.min(stopLossDistance, maxStopLossDistance)

  if (direction === 'LONG') {
    return entryPrice - finalDistance
  } else {
    return entryPrice + finalDistance
  }
}

/**
 * 计算止盈价格
 */
export function calculateTakeProfit(
  entryPrice: number,
  stopLoss: number,
  direction: 'LONG' | 'SHORT',
  ratio: number = 1
): number {
  const risk = Math.abs(entryPrice - stopLoss)
  const reward = risk * ratio

  if (direction === 'LONG') {
    return entryPrice + reward
  } else {
    return entryPrice - reward
  }
}

/**
 * 计算仓位大小
 */
export function calculatePositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLoss: number,
  maxRiskPercent: number = 1
): number {
  const riskAmount = accountBalance * (maxRiskPercent / 100)
  const priceRisk = Math.abs(entryPrice - stopLoss)

  if (priceRisk === 0) return 0

  return riskAmount / priceRisk
}
