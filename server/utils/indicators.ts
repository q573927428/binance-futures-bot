import { EMA, RSI, ADX, ATR } from 'technicalindicators'
import type { OHLCV, TechnicalIndicators, BotConfig } from '../../types'
import { BinanceService } from './binance'

/**
 * 计算技术指标
 */
export async function calculateIndicators(
  binance: BinanceService,
  symbol: string,
  config?: BotConfig
): Promise<TechnicalIndicators> {
  try {
    // 获取策略模式，默认为短期
    const strategyMode = config?.strategyMode || 'short_term'
    
    // 根据策略模式选择K线周期
    const mainTF = strategyMode === 'medium_term' ? '1h' : '15m'
    const secondaryTF = strategyMode === 'medium_term' ? '4h' : '1h'
    const tertiaryTF = strategyMode === 'medium_term' ? '1d' : '4h'
    
    // 根据策略模式选择EMA周期
    const emaFast = strategyMode === 'medium_term' ? 50 : 20
    const emaMedium = strategyMode === 'medium_term' ? 100 : 30
    const emaSlow = strategyMode === 'medium_term' ? 200 : 60

    // 获取不同周期的K线数据
    const candlesMain = await binance.fetchOHLCV(symbol, mainTF, 96)
    const candlesSecondary = await binance.fetchOHLCV(symbol, secondaryTF, 96)
    const candlesTertiary = await binance.fetchOHLCV(symbol, tertiaryTF, 96)

    const closesMain = candlesMain.map(c => c.close)
    const highsMain = candlesMain.map(c => c.high)
    const lowsMain = candlesMain.map(c => c.low)

    // 计算EMA（基于主周期）
    const emaFastValues = EMA.calculate({ period: emaFast, values: closesMain })
    const emaMediumValues = EMA.calculate({ period: emaMedium, values: closesMain })
    const emaSlowValues = EMA.calculate({ period: emaSlow, values: closesMain })

    // 计算RSI（基于主周期）
    const rsiValues = RSI.calculate({ period: 14, values: closesMain })

    // 计算ATR（基于主周期）
    const atrValues = ATR.calculate({ period: 14, high: highsMain, low: lowsMain, close: closesMain })

    // 计算ADX（多周期）
    const adxMainValues = ADX.calculate({
      high: candlesMain.map(c => c.high),
      low: candlesMain.map(c => c.low),
      close: candlesMain.map(c => c.close),
      period: 14,
    })

    const adxSecondaryValues = ADX.calculate({
      high: candlesSecondary.map(c => c.high),
      low: candlesSecondary.map(c => c.low),
      close: candlesSecondary.map(c => c.close),
      period: 14,
    })

    const adxTertiaryValues = ADX.calculate({
      high: candlesTertiary.map(c => c.high),
      low: candlesTertiary.map(c => c.low),
      close: candlesTertiary.map(c => c.close),
      period: 14,
    })

    // 根据策略模式映射ADX字段
    let adx15m, adx1h, adx4h
    if (strategyMode === 'medium_term') {
      // 中长期策略：1h为主周期，4h为次要周期，1d为第三周期
      adx15m = adxMainValues[adxMainValues.length - 1]?.adx || 0      // 1h
      adx1h = adxSecondaryValues[adxSecondaryValues.length - 1]?.adx || 0  // 4h
      adx4h = adxTertiaryValues[adxTertiaryValues.length - 1]?.adx || 0    // 1d
    } else {
      // 短期策略：15m为主周期，1h为次要周期，4h为第三周期
      adx15m = adxMainValues[adxMainValues.length - 1]?.adx || 0      // 15m
      adx1h = adxSecondaryValues[adxSecondaryValues.length - 1]?.adx || 0  // 1h
      adx4h = adxTertiaryValues[adxTertiaryValues.length - 1]?.adx || 0    // 4h
    }

    return {
      ema20: emaFastValues[emaFastValues.length - 1] || 0,
      ema30: emaMediumValues[emaMediumValues.length - 1] || 0,
      ema60: emaSlowValues[emaSlowValues.length - 1] || 0,
      adx15m,
      adx1h,
      adx4h,
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
  const adx15m = indicators.adx15m
  const adx1h = indicators.adx1h
  const adx4h = indicators.adx4h
  
  // 使用配置参数或默认值
  const adx1hThreshold = config?.indicatorsConfig?.adxTrend?.adx1hThreshold || 25
  const adx4hThreshold = config?.indicatorsConfig?.adxTrend?.adx4hThreshold || 28
  const adx15mThreshold = config?.indicatorsConfig?.adxTrend?.adx15mThreshold || 30
  const enableAdx15mVs1hCheck = config?.indicatorsConfig?.adxTrend?.enableAdx15mVs1hCheck ?? true
  
  // 三个绝对阈值条件
  const pass15m = adx15m >= adx15mThreshold
  const pass1h = adx1h >= adx1hThreshold
  const pass4h = adx4h >= adx4hThreshold
  
  // 相对比较条件（根据开关决定）
  const pass15mVs1h = enableAdx15mVs1hCheck ? adx15m > adx1h : true

  // 逻辑：必须满足三个绝对阈值，并且根据开关决定是否检查相对比较
  const passed = pass15m && pass1h && pass4h && pass15mVs1h

  // 提供更详细的调试信息
  let reason = ''
  if (passed) {
    // 根据具体满足的条件显示不同的原因
    const conditions: string[] = []
    conditions.push(`15m ADX(${adx15m.toFixed(2)}) >= ${adx15mThreshold}`)
    conditions.push(`1h ADX(${adx1h.toFixed(2)}) >= ${adx1hThreshold}`)
    conditions.push(`4h ADX(${adx4h.toFixed(2)}) >= ${adx4hThreshold}`)
    
    if (enableAdx15mVs1hCheck) {
      conditions.push(`15m ADX(${adx15m.toFixed(2)}) > 1h ADX(${adx1h.toFixed(2)})`)
    }
    
    reason = conditions.join(' 且 ') + '（趋势全面确认）'
  } else {
    // 根据具体不满足的条件显示不同的原因
    const reasons: string[] = []
    if (!pass15m) {
      reasons.push(`15m ADX(${adx15m.toFixed(2)}) < ${adx15mThreshold}`)
    }
    if (!pass1h) {
      reasons.push(`1h ADX(${adx1h.toFixed(2)}) < ${adx1hThreshold}`)
    }
    if (!pass4h) {
      reasons.push(`4h ADX(${adx4h.toFixed(2)}) < ${adx4hThreshold}`)
    }
    if (enableAdx15mVs1hCheck && !pass15mVs1h) {
      reasons.push(`15m ADX(${adx15m.toFixed(2)}) ≤ 1h ADX(${adx1h.toFixed(2)})`)
    }
    reason = reasons.join('，')
  }

  return {
    passed,
    reason,
    data: {
      adx15m,
      adx1h,
      adx4h,
      required: {
        adx15m: adx15mThreshold,
        adx1h: adx1hThreshold,
        adx4h: adx4hThreshold,
        enableAdx15mVs1hCheck
      },
      actual: {
        adx15m,
        adx1h,
        adx4h,
        pass15m,
        pass1h,
        pass4h,
        pass15mVs1h
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
  volumeHistory?: number[],
  candles15m?: OHLCV[]
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

  // 检查价格突破条件
  let priceBreakoutPassed = true
  let priceBreakoutReason = '价格突破指标未检查'
  let priceBreakoutData: any = null
  
  if (candles15m && candles15m.length > 0) {
    const priceBreakoutResult = checkPriceBreakoutLong(price, candles15m, config)
    priceBreakoutPassed = priceBreakoutResult.passed
    priceBreakoutReason = priceBreakoutResult.reason
    priceBreakoutData = priceBreakoutResult.data
  }

  // 所有条件必须同时满足
  const passed = nearEMA && rsiInRange && isConfirmCandle && volumePassed && priceBreakoutPassed

  let reason = ''
  if (passed) {
    reason = `价格回踩${nearEMAType}，RSI适中(${rsi.toFixed(1)})，${candleType}确认`
    if (volumeConfirmation) {
      reason += `，成交量确认`
    }
    if (priceBreakoutData?.enabled) {
      reason += `，价格突破确认`
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
    if (!priceBreakoutPassed && priceBreakoutData?.enabled) {
      reasons.push(`价格突破条件不满足: ${priceBreakoutReason}`)
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
      priceBreakoutPassed,
      priceBreakoutReason,
      priceBreakoutData,
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
          priceBreakout: priceBreakoutData?.enabled || false,
        },
        actual: {
          nearEMA,
          rsiValue,
          rsiInRange,
          isConfirmCandle,
          volumePassed,
          priceBreakoutPassed,
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
  volumeHistory?: number[],
  candles15m?: OHLCV[]
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

  // 检查价格突破条件
  let priceBreakoutPassed = true
  let priceBreakoutReason = '价格突破指标未检查'
  let priceBreakoutData: any = null
  
  if (candles15m && candles15m.length > 0) {
    const priceBreakoutResult = checkPriceBreakoutShort(price, candles15m, config)
    priceBreakoutPassed = priceBreakoutResult.passed
    priceBreakoutReason = priceBreakoutResult.reason
    priceBreakoutData = priceBreakoutResult.data
  }

  // 所有条件必须同时满足
  const passed = nearEMA && rsiInRange && isConfirmCandle && volumePassed && priceBreakoutPassed

  let reason = ''
  if (passed) {
    reason = `价格反弹${nearEMAType}，RSI适中(${rsi.toFixed(1)})，${candleType}确认`
    if (volumeConfirmation) {
      reason += `，成交量确认`
    }
    if (priceBreakoutData?.enabled) {
      reason += `，价格突破确认`
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
    if (!priceBreakoutPassed && priceBreakoutData?.enabled) {
      reasons.push(`价格突破条件不满足: ${priceBreakoutReason}`)
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
      priceBreakoutPassed,
      priceBreakoutReason,
      priceBreakoutData,
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
          priceBreakout: priceBreakoutData?.enabled || false,
        },
        actual: {
          nearEMA,
          rsiValue,
          rsiInRange,
          isConfirmCandle,
          volumePassed,
          priceBreakoutPassed,
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
  atrMultiplier: number = 2,
  maxStopLossPercent: number = 3
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

/**
 * 检查做多价格突破条件
 */
export function checkPriceBreakoutLong(
  price: number,
  candles: OHLCV[],
  config?: BotConfig
): { passed: boolean; reason: string; data?: any } {
  // 使用配置参数或默认值
  const enabled = config?.indicatorsConfig?.priceBreakout?.enabled ?? true
  const period = config?.indicatorsConfig?.priceBreakout?.period ?? 5
  const requireConfirmation = config?.indicatorsConfig?.priceBreakout?.requireConfirmation ?? true
  const confirmationCandles = config?.indicatorsConfig?.priceBreakout?.confirmationCandles ?? 1

  // 如果未启用价格突破指标，直接返回通过
  if (!enabled) {
    return {
      passed: true,
      reason: '价格突破指标未启用',
      data: {
        enabled: false,
        period,
        requireConfirmation,
        confirmationCandles
      }
    }
  }

  // 检查是否有足够的K线数据
  if (candles.length < period + confirmationCandles) {
    return {
      passed: false,
      reason: `K线数据不足，需要至少${period + confirmationCandles}根K线，当前只有${candles.length}根`,
      data: {
        enabled,
        period,
        requireConfirmation,
        confirmationCandles,
        candlesCount: candles.length
      }
    }
  }

  // 获取最近N根K线（排除最后确认的K线）
  const startIndex = Math.max(0, candles.length - period - confirmationCandles)
  const endIndex = candles.length - confirmationCandles
  const recentCandles = candles.slice(startIndex, endIndex)
  
  // 计算最近N根K线的最高价
  const highestHigh = Math.max(...recentCandles.map(c => c.high))
  
  // 检查当前价格是否突破最高价
  const priceBreakout = price > highestHigh
  
  let passed = priceBreakout
  let reason = `当前价格${price.toFixed(2)} ${priceBreakout ? '>' : '≤'} 最近${period}根K线最高价${highestHigh.toFixed(2)}`
  
  // 如果需要确认，检查最近确认K线的收盘价
  if (requireConfirmation && priceBreakout) {
    const confirmationCandlesSlice = candles.slice(-confirmationCandles)
    const allConfirm = confirmationCandlesSlice.every(candle => candle.close > highestHigh)
    
    passed = allConfirm
    reason = allConfirm 
      ? `${reason}，且最近${confirmationCandles}根K线收盘价确认突破`
      : `${reason}，但最近${confirmationCandles}根K线收盘价未全部确认突破`
  }

  return {
    passed,
    reason,
    data: {
      enabled,
      period,
      requireConfirmation,
      confirmationCandles,
      price,
      highestHigh,
      priceBreakout,
      recentCandlesCount: recentCandles.length,
      confirmationCandlesCount: confirmationCandles
    }
  }
}

/**
 * 检查做空价格突破条件
 */
export function checkPriceBreakoutShort(
  price: number,
  candles: OHLCV[],
  config?: BotConfig
): { passed: boolean; reason: string; data?: any } {
  // 使用配置参数或默认值
  const enabled = config?.indicatorsConfig?.priceBreakout?.enabled ?? true
  const period = config?.indicatorsConfig?.priceBreakout?.period ?? 5
  const requireConfirmation = config?.indicatorsConfig?.priceBreakout?.requireConfirmation ?? true
  const confirmationCandles = config?.indicatorsConfig?.priceBreakout?.confirmationCandles ?? 1

  // 如果未启用价格突破指标，直接返回通过
  if (!enabled) {
    return {
      passed: true,
      reason: '价格突破指标未启用',
      data: {
        enabled: false,
        period,
        requireConfirmation,
        confirmationCandles
      }
    }
  }

  // 检查是否有足够的K线数据
  if (candles.length < period + confirmationCandles) {
    return {
      passed: false,
      reason: `K线数据不足，需要至少${period + confirmationCandles}根K线，当前只有${candles.length}根`,
      data: {
        enabled,
        period,
        requireConfirmation,
        confirmationCandles,
        candlesCount: candles.length
      }
    }
  }

  // 获取最近N根K线（排除最后确认的K线）
  const startIndex = Math.max(0, candles.length - period - confirmationCandles)
  const endIndex = candles.length - confirmationCandles
  const recentCandles = candles.slice(startIndex, endIndex)
  
  // 计算最近N根K线的最低价
  const lowestLow = Math.min(...recentCandles.map(c => c.low))
  
  // 检查当前价格是否突破最低价
  const priceBreakout = price < lowestLow
  
  let passed = priceBreakout
  let reason = `当前价格${price.toFixed(2)} ${priceBreakout ? '<' : '≥'} 最近${period}根K线最低价${lowestLow.toFixed(2)}`
  
  // 如果需要确认，检查最近确认K线的收盘价
  if (requireConfirmation && priceBreakout) {
    const confirmationCandlesSlice = candles.slice(-confirmationCandles)
    const allConfirm = confirmationCandlesSlice.every(candle => candle.close < lowestLow)
    
    passed = allConfirm
    reason = allConfirm 
      ? `${reason}，且最近${confirmationCandles}根K线收盘价确认突破`
      : `${reason}，但最近${confirmationCandles}根K线收盘价未全部确认突破`
  }

  return {
    passed,
    reason,
    data: {
      enabled,
      period,
      requireConfirmation,
      confirmationCandles,
      price,
      lowestLow,
      priceBreakout,
      recentCandlesCount: recentCandles.length,
      confirmationCandlesCount: confirmationCandles
    }
  }
}
