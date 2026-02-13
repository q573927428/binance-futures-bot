import { EMA, RSI, ADX, ATR } from 'technicalindicators'
import type { OHLCV, TechnicalIndicators, BotConfig } from '../../types'
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
export function checkADXTrend(indicators: TechnicalIndicators, config?: BotConfig) {
  const adx1h = indicators.adx1h
  const adx4h = indicators.adx4h
  
  // 使用配置参数或默认值
  const adx1hThreshold = config?.indicatorsConfig?.adxTrend?.adx1hThreshold || 25
  const adx4hThreshold = config?.indicatorsConfig?.adxTrend?.adx4hThreshold || 28
  
  const pass1h = adx1h >= adx1hThreshold
  const pass4h = adx4h >= adx4hThreshold

  const passed = pass1h || pass4h

  // 提供更详细的调试信息
  let reason = ''
  if (passed) {
    if (pass1h) {
      reason = `1h ADX(${adx1h.toFixed(2)}) >= ${adx1hThreshold}（趋势明确）`
    } else {
      reason = `4h ADX(${adx4h.toFixed(2)}) >= ${adx4hThreshold}（大周期趋势明确）`
    }
  } else {
    reason = `1h ADX(${adx1h.toFixed(2)}) < ${adx1hThreshold} 且 4h ADX(${adx4h.toFixed(2)}) < ${adx4hThreshold}`
  }

  return {
    passed,
    reason,
    data: {
      adx1h,
      adx4h,
      required: {
        adx1h: adx1hThreshold,
        adx4h: adx4hThreshold
      },
      actual: {
        adx1h,
        adx4h,
        pass1h,
        pass4h
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
  lastCandle: OHLCV,
  config?: BotConfig,
  volumeHistory?: number[]
) {
  const { ema20, ema30, rsi } = indicators

  // 使用配置参数或默认值
  const emaDeviationThreshold = config?.indicatorsConfig?.longEntry?.emaDeviationThreshold || 0.005
  const rsiMin = config?.indicatorsConfig?.longEntry?.rsiMin || 40
  const rsiMax = config?.indicatorsConfig?.longEntry?.rsiMax || 60
  const candleShadowThreshold = config?.indicatorsConfig?.longEntry?.candleShadowThreshold || 0.005
  const volumeConfirmation = config?.indicatorsConfig?.longEntry?.volumeConfirmation ?? true
  const volumeEMAPeriod = config?.indicatorsConfig?.longEntry?.volumeEMAPeriod || 10
  const volumeEMAMultiplier = config?.indicatorsConfig?.longEntry?.volumeEMAMultiplier || 1.2

  // 价格回踩 EMA20/EMA30（±阈值）
  const nearEMA20 = Math.abs(price - ema20) / ema20 <= emaDeviationThreshold
  const nearEMA30 = Math.abs(price - ema30) / ema30 <= emaDeviationThreshold
  
  const nearEMA = nearEMA20 || nearEMA30
  const nearEMAType = nearEMA20 ? 'EMA20' : nearEMA30 ? 'EMA30' : 'none'

  // RSI在[min,max]区间
  const rsiInRange = rsi >= rsiMin && rsi <= rsiMax
  const rsiValue = rsi

  // 最近K线为确认阳线或明显下影线
  const isConfirmCandle =
    lastCandle.close > lastCandle.open ||
    (lastCandle.open - lastCandle.low) / lastCandle.open >= candleShadowThreshold
  
  const candleType = lastCandle.close > lastCandle.open ? '阳线' : '下影线'

  // 成交量确认（使用EMA）
  let volumePassed = true
  let volumeReason = ''
  if (volumeConfirmation && volumeHistory && volumeHistory.length >= volumeEMAPeriod) {
    const currentVolume = lastCandle.volume
    
    // 计算成交量EMA
    const volumeEMAValues = EMA.calculate({ period: volumeEMAPeriod, values: volumeHistory })
    const volumeEMA = volumeEMAValues[volumeEMAValues.length - 1] || 0
    
    volumePassed = currentVolume >= volumeEMA * volumeEMAMultiplier
    volumeReason = `当前成交量: ${currentVolume.toFixed(2)}，${volumeEMAPeriod}周期EMA: ${volumeEMA.toFixed(2)}，要求: ≥${(volumeEMA * volumeEMAMultiplier).toFixed(2)}`
  } else if (volumeConfirmation) {
    volumePassed = false
    volumeReason = '成交量数据不足，无法计算EMA'
  }

  const passed = nearEMA && rsiInRange && isConfirmCandle && volumePassed

  let reason = ''
  if (passed) {
    reason = `价格回踩${nearEMAType}，RSI适中(${rsi.toFixed(1)})，${candleType}确认`
    if (volumeConfirmation) {
      reason += `，成交量确认`
    }
  } else {
    const reasons: string[] = []
    if (!nearEMA) {
      reasons.push(`价格未回踩EMA（距离EMA20: ${((price - ema20) / ema20 * 100).toFixed(2)}%，EMA30: ${((price - ema30) / ema30 * 100).toFixed(2)}%）`)
    }
    if (!rsiInRange) {
      reasons.push(`RSI(${rsi.toFixed(1)})[${rsiMin} - ${rsiMax}]`)
    }
    if (!isConfirmCandle) {
      reasons.push('K线未确认（非阳线且无明显下影线）')
    }
    if (!volumePassed) {
      reasons.push(`成交量条件不满足: ${volumeReason}`)
    }
    reason = reasons.join('；')
  }

  return {
    passed,
    reason,
    data: {
      price,
      ema20,
      ema30,
      rsi,
      nearEMA20,
      nearEMA30,
      nearEMA,
      nearEMAType,
      rsiInRange,
      rsiValue,
      isConfirmCandle,
      candleType,
      volumePassed,
      volumeReason,
      lastCandle: {
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
        volume: lastCandle.volume,
      },
      conditions: {
        required: {
          nearEMA: true,
          rsiMin,
          rsiMax,
          confirmCandle: true,
          volumeConfirmation,
        },
        actual: {
          nearEMA,
          rsiValue,
          rsiInRange,
          isConfirmCandle,
          volumePassed,
        }
      }
    }
  }
}

/**
 * 检查做空入场条件
 */
export function checkShortEntry(
  price: number,
  indicators: TechnicalIndicators,
  lastCandle: OHLCV,
  config?: BotConfig,
  volumeHistory?: number[]
) {
  const { ema20, ema30, rsi } = indicators

  // 使用配置参数或默认值
  const emaDeviationThreshold = config?.indicatorsConfig?.shortEntry?.emaDeviationThreshold || 0.005
  const rsiMin = config?.indicatorsConfig?.shortEntry?.rsiMin || 40
  const rsiMax = config?.indicatorsConfig?.shortEntry?.rsiMax || 55
  const candleShadowThreshold = config?.indicatorsConfig?.shortEntry?.candleShadowThreshold || 0.005
  const volumeConfirmation = config?.indicatorsConfig?.shortEntry?.volumeConfirmation ?? true
  const volumeEMAPeriod = config?.indicatorsConfig?.shortEntry?.volumeEMAPeriod || 10
  const volumeEMAMultiplier = config?.indicatorsConfig?.shortEntry?.volumeEMAMultiplier || 1.2

  // 价格反弹至 EMA20/EMA30（±阈值）
  const nearEMA20 = Math.abs(price - ema20) / ema20 <= emaDeviationThreshold
  const nearEMA30 = Math.abs(price - ema30) / ema30 <= emaDeviationThreshold
  
  const nearEMA = nearEMA20 || nearEMA30
  const nearEMAType = nearEMA20 ? 'EMA20' : nearEMA30 ? 'EMA30' : 'none'

  // RSI在[min,max]区间
  const rsiInRange = rsi >= rsiMin && rsi <= rsiMax
  const rsiValue = rsi

  // 最近K线为确认阴线或明显上影线
  const isConfirmCandle =
    lastCandle.close < lastCandle.open ||
    (lastCandle.high - lastCandle.open) / lastCandle.open >= candleShadowThreshold
  
  const candleType = lastCandle.close < lastCandle.open ? '阴线' : '上影线'

  // 成交量确认（使用EMA）
  let volumePassed = true
  let volumeReason = ''
  if (volumeConfirmation && volumeHistory && volumeHistory.length >= volumeEMAPeriod) {
    const currentVolume = lastCandle.volume
    
    // 计算成交量EMA
    const volumeEMAValues = EMA.calculate({ period: volumeEMAPeriod, values: volumeHistory })
    const volumeEMA = volumeEMAValues[volumeEMAValues.length - 1] || 0
    
    volumePassed = currentVolume >= volumeEMA * volumeEMAMultiplier
    volumeReason = `当前成交量: ${currentVolume.toFixed(2)}，${volumeEMAPeriod}周期EMA: ${volumeEMA.toFixed(2)}，要求: ≥${(volumeEMA * volumeEMAMultiplier).toFixed(2)}`
  } else if (volumeConfirmation) {
    volumePassed = false
    volumeReason = '成交量数据不足，无法计算EMA'
  }

  const passed = nearEMA && rsiInRange && isConfirmCandle && volumePassed

  let reason = ''
  if (passed) {
    reason = `价格反弹${nearEMAType}，RSI适中(${rsi.toFixed(1)})，${candleType}确认`
    if (volumeConfirmation) {
      reason += `，成交量确认`
    }
  } else {
    const reasons: string[] = []
    if (!nearEMA) {
      reasons.push(`价格未反弹EMA（距离EMA20: ${((price - ema20) / ema20 * 100).toFixed(2)}%，EMA30: ${((price - ema30) / ema30 * 100).toFixed(2)}%）`)
    }
    if (!rsiInRange) {
      reasons.push(`RSI(${rsi.toFixed(1)})[${rsiMin} - ${rsiMax}]`)
    }
    if (!isConfirmCandle) {
      reasons.push('K线未确认（非阴线且无明显上影线）')
    }
    if (!volumePassed) {
      reasons.push(`成交量条件不满足: ${volumeReason}`)
    }
    reason = reasons.join('；')
  }

  return {
    passed,
    reason,
    data: {
      price,
      ema20,
      ema30,
      rsi,
      nearEMA20,
      nearEMA30,
      nearEMA,
      nearEMAType,
      rsiInRange,
      rsiValue,
      isConfirmCandle,
      candleType,
      volumePassed,
      volumeReason,
      lastCandle: {
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
        volume: lastCandle.volume,
      },
      conditions: {
        required: {
          nearEMA: true,
          rsiMin,
          rsiMax,
          confirmCandle: true,
          volumeConfirmation,
        },
        actual: {
          nearEMA,
          rsiValue,
          rsiInRange,
          isConfirmCandle,
          volumePassed,
        }
      }
    }
  }
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
