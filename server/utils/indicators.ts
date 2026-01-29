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
    const candles15m = await binance.fetchOHLCV(symbol, '15m', 96)
    const candles1h = await binance.fetchOHLCV(symbol, '1h', 96)
    const candles4h = await binance.fetchOHLCV(symbol, '4h', 96)

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
export function checkADXTrend(indicators: TechnicalIndicators) {
  const pass1h = indicators.adx1h >= 25
  const pass4h = indicators.adx4h >= 28

  return {
    passed: pass1h || pass4h,
    reason: pass1h
      ? '1h ADX >= 25（趋势明确）'
      : pass4h
        ? '4h ADX >= 28（大周期趋势明确）'
        : '1h 与 4h ADX 均不足',
    data: {
      adx1h: indicators.adx1h,
      adx4h: indicators.adx4h,
      required: {
        adx1h: 25,
        adx4h: 28
      }
    }
  }
}

/**
 * 判断趋势方向
 */
export function getTrendDirection(
  price: number,
  indicators: TechnicalIndicators
) {
  const { ema20, ema60 } = indicators

  const ema20AboveEma60 = ema20 > ema60
  const priceAboveEma20 = price > ema20
  const priceBelowEma20 = price < ema20

  // 做多条件：EMA20 > EMA60 且 价格 > EMA20
  const isLong = ema20AboveEma60 && priceAboveEma20
  
  // 做空条件：EMA20 < EMA60 且 价格 < EMA20
  const isShort = !ema20AboveEma60 && priceBelowEma20

  let direction: 'LONG' | 'SHORT' | 'IDLE' = 'IDLE'
  let reason = ''

  if (isLong) {
    direction = 'LONG'
    reason = `EMA20(${ema20.toFixed(2)}) > EMA60(${ema60.toFixed(2)}) 且 价格(${price.toFixed(2)}) > EMA20`
  } else if (isShort) {
    direction = 'SHORT'
    reason = `EMA20(${ema20.toFixed(2)}) < EMA60(${ema60.toFixed(2)}) 且 价格(${price.toFixed(2)}) < EMA20`
  } else {
    reason = '趋势条件不满足'
    
    if (ema20AboveEma60 && !priceAboveEma20) {
      reason = `EMA20(${ema20.toFixed(2)}) > EMA60(${ema60.toFixed(2)}) 但 价格(${price.toFixed(2)}) ≤ EMA20`
    } else if (!ema20AboveEma60 && !priceBelowEma20) {
      reason = `EMA20(${ema20.toFixed(2)}) < EMA60(${ema60.toFixed(2)}) 但 价格(${price.toFixed(2)}) ≥ EMA20`
    } else {
      reason = `EMA20(${ema20.toFixed(2)}) ≈ EMA60(${ema60.toFixed(2)}) 或 价格(${price.toFixed(2)}) ≈ EMA20`
    }
  }

  return {
    direction,
    reason,
    data: {
      price,
      ema20,
      ema60,
      conditions: {
        ema20AboveEma60,
        priceAboveEma20,
        priceBelowEma20,
        isLong,
        isShort
      }
    }
  }
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
  const rsiInRange = rsi >= 38 && rsi <= 60

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
  const rsiInRange = rsi >= 45 && rsi <= 62

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
  atrMultiplier: number = 1.5,
  maxStopLossPercent: number = 2
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
 * 计算基于风险管理的仓位大小（返回USDT金额）
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

  // 计算止损距离百分比
  const stopLossDistance = priceRisk / entryPrice
  
  if (stopLossDistance === 0) return 0

  // 返回基于风险管理和止损距离的实际仓位大小（USDT金额）
  // 公式：仓位大小 = 风险金额 / 止损距离百分比
  const positionSize = riskAmount / stopLossDistance
  
  return positionSize
}

/**
 * 计算基于账户余额的最大可用USDT金额（考虑杠杆）
 */
export function calculateMaxUsdtAmount(
  accountBalance: number,
  leverage: number,
  maxRiskPercent: number = 100
): number {
  // 最大可用金额 = 账户余额 * 杠杆
  // 在期货交易中，可以使用全部账户余额作为保证金
  const maxAmount = accountBalance * leverage
  
  // 但为了安全，可以限制最大仓位为账户余额的某个倍数
  // 这里使用 maxRiskPercent 作为限制，默认100%表示可以使用全部杠杆
  const safeAmount = accountBalance * leverage * (maxRiskPercent / 100)
  
  return Math.min(maxAmount, safeAmount)
}

/**
 * 检查订单名义价值是否满足交易所最小要求
 */
export function checkMinNotional(
  symbol: string,
  quantity: number,
  price: number,
  minNotional: number = 20
): boolean {
  const notional = quantity * price
  return notional >= minNotional
}
