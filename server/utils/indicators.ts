import { EMA, RSI, ADX, ATR } from 'technicalindicators'
import type { OHLCV, TechnicalIndicators, BotConfig } from '../../types'
import { BinanceService } from './binance'

/**
 * 通用工具：计算百分比差值
 */
function calculatePercentage(value: number, base: number): string {
  if (base === 0) return 'N/A'
  return ((value - base) / base * 100).toFixed(2)
}

/**
 * 通用工具：获取EMA周期配置
 */
function getEMAPeriodConfig(strategyMode: string, emaPeriods?: any) {
  const fast = emaPeriods?.[strategyMode]?.fast || (strategyMode === 'medium_term' ? 50 : 20)
  const medium = emaPeriods?.[strategyMode]?.medium || (strategyMode === 'medium_term' ? 100 : 30)
  const slow = emaPeriods?.[strategyMode]?.slow || (strategyMode === 'medium_term' ? 200 : 60)
  return {
    fast,
    medium,
    slow,
    fastName: `EMA${fast}`,
    mediumName: `EMA${medium}`,
    slowName: `EMA${slow}`
  }
}

/**
 * 通用工具：检查成交量确认
 */
function checkVolumeConfirmation(
  volumeHistory: number[],
  lastCandle: OHLCV,
  strategyMode: string,
  volumeEMAPeriod: number,
  volumeEMAMultiplier: number,
  volumeConfirmation: boolean
) {
  let volumePassed = true
  let volumeReason = ''
  let predictedVolume: number | null = null
  let elapsedRatio: number | null = null
  
  if (volumeConfirmation && volumeHistory && volumeHistory.length >= volumeEMAPeriod) {
    const currentVolume = lastCandle.volume
    
    // 计算成交量EMA（使用历史已完成K线的成交量）
    const volumeEMAValues = EMA.calculate({ period: volumeEMAPeriod, values: volumeHistory })
    const volumeEMA = volumeEMAValues[volumeEMAValues.length - 1] || 0
    
    // 计算当前K线已过去的时间比例
    const candleStartTime = lastCandle.timestamp
    const currentTime = Date.now()
    // 根据策略模式确定时间框架（中长期1小时=3600000ms，短期15分钟=900000ms）
    const timeframeMs = strategyMode === 'medium_term' ? 60 * 60 * 1000 : 15 * 60 * 1000
    elapsedRatio = Math.min((currentTime - candleStartTime) / timeframeMs, 1)
    
    if (elapsedRatio < 0.1) {
      // 前10%时间成交量不稳定，不通过成交量检查
      volumePassed = false
      volumeReason = `K线刚开始(${(elapsedRatio * 100).toFixed(1)}%)，成交量数据不稳定，不通过`
    } else {
      // 按时间比例预测完整K线成交量
      predictedVolume = currentVolume / elapsedRatio
      volumePassed = predictedVolume >= volumeEMA * volumeEMAMultiplier
      volumeReason = `成交量: ${currentVolume.toFixed(2)} (${(elapsedRatio * 100).toFixed(1)}%) → 预测: ${predictedVolume.toFixed(2)} vs ${volumeEMAPeriod}周期EMA(x${volumeEMAMultiplier}): ${(volumeEMA * volumeEMAMultiplier).toFixed(2)}`
    }
  } else if (volumeConfirmation) {
    volumePassed = false
    volumeReason = '成交量数据不足，无法计算EMA'
  }

  return {
    volumePassed,
    volumeReason,
    predictedVolume,
    elapsedRatio
  }
}

/**
 * 通用工具：检查价格突破
 */
function checkPriceBreakout(
  direction: 'LONG' | 'SHORT',
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
  
  let targetPrice: number
  let priceBreakout: boolean
  let compareOperator: string
  let targetName: string

  if (direction === 'LONG') {
    targetPrice = Math.max(...recentCandles.map(c => c.high))
    priceBreakout = price > targetPrice
    compareOperator = priceBreakout ? '>' : '≤'
    targetName = '最高价'
  } else {
    targetPrice = Math.min(...recentCandles.map(c => c.low))
    priceBreakout = price < targetPrice
    compareOperator = priceBreakout ? '<' : '≥'
    targetName = '最低价'
  }
  
  let passed = priceBreakout
  let reason = `当前价格${price.toFixed(2)} ${compareOperator} 最近${period}根K线${targetName}${targetPrice.toFixed(2)}`
  
  // 如果需要确认，检查最近确认K线的收盘价
  if (requireConfirmation && priceBreakout) {
    const confirmationCandlesSlice = candles.slice(-confirmationCandles)
    let allConfirm: boolean
    
    if (direction === 'LONG') {
      allConfirm = confirmationCandlesSlice.every(candle => candle.close > targetPrice)
    } else {
      allConfirm = confirmationCandlesSlice.every(candle => candle.close < targetPrice)
    }
    
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
      targetPrice,
      priceBreakout,
      recentCandlesCount: recentCandles.length,
      confirmationCandlesCount: confirmationCandles
    }
  }
}

/**
 * 检查做多价格突破条件（兼容旧接口）
 */
export function checkPriceBreakoutLong(
  price: number,
  candles: OHLCV[],
  config?: BotConfig
): { passed: boolean; reason: string; data?: any } {
  return checkPriceBreakout('LONG', price, candles, config)
}

/**
 * 检查做空价格突破条件（兼容旧接口）
 */
export function checkPriceBreakoutShort(
  price: number,
  candles: OHLCV[],
  config?: BotConfig
): { passed: boolean; reason: string; data?: any } {
  return checkPriceBreakout('SHORT', price, candles, config)
}

/**
 * 通用入场条件检查
 */
function checkEntry(
  direction: 'LONG' | 'SHORT',
  price: number,
  indicators: TechnicalIndicators,
  lastCandle: OHLCV,
  config?: BotConfig,
  volumeHistory?: number[],
  candles15m?: OHLCV[]
) {
  const { ema20: emaFast, ema30: emaMedium, ema60: emaSlow, rsi } = indicators
  const strategyMode = config?.strategyMode || 'short_term'
  const emaPeriods = config?.indicatorsConfig?.emaPeriods
  const { fastName: emaFastName, mediumName: emaMediumName, slowName: emaSlowName } = getEMAPeriodConfig(strategyMode, emaPeriods)

  // 获取方向对应的配置
  const entryConfig = direction === 'LONG' 
    ? config?.indicatorsConfig?.longEntry 
    : config?.indicatorsConfig?.shortEntry

  // 使用配置参数或默认值
  const emaDeviationThreshold = entryConfig?.emaDeviationThreshold || 0.005
  const emaDeviationEnabled = entryConfig?.emaDeviationEnabled ?? true
  const emaSlowDeviationThreshold = entryConfig?.emaSlowDeviationThreshold || 0.05
  const emaSlowDeviationEnabled = entryConfig?.emaSlowDeviationEnabled ?? true
  const rsiMin = entryConfig?.rsiMin || 40
  const rsiMax = entryConfig?.rsiMax || (direction === 'LONG' ? 60 : 55)
  const candleShadowThreshold = entryConfig?.candleShadowThreshold || 0.005
  const volumeConfirmation = entryConfig?.volumeConfirmation ?? true
  const volumeEMAPeriod = entryConfig?.volumeEMAPeriod || 10
  const volumeEMAMultiplier = entryConfig?.volumeEMAMultiplier || 1.2

  // EMA接近检查
  const nearFastEMA = Math.abs(price - emaFast) / emaFast <= emaDeviationThreshold
  const nearMediumEMA = Math.abs(price - emaMedium) / emaMedium <= emaDeviationThreshold
  const nearEMA = nearFastEMA || nearMediumEMA
  const nearEMAType = nearFastEMA ? emaFastName : nearMediumEMA ? emaMediumName : 'none'

  // 慢线偏离检查
  const emaSlowDeviation = Math.abs(price - emaSlow) / emaSlow
  const emaSlowDeviationPassed = !emaSlowDeviationEnabled || emaSlowDeviation <= emaSlowDeviationThreshold

  // RSI区间检查
  const rsiInRange = rsi >= rsiMin && rsi <= rsiMax

  // K线确认检查
  let isConfirmCandle: boolean
  let candleType: string
  if (direction === 'LONG') {
    isConfirmCandle = lastCandle.close > lastCandle.open ||
      (lastCandle.open - lastCandle.low) / lastCandle.open >= candleShadowThreshold
    candleType = lastCandle.close > lastCandle.open ? '阳线' : '下影线'
  } else {
    isConfirmCandle = lastCandle.close < lastCandle.open ||
      (lastCandle.high - lastCandle.open) / lastCandle.open >= candleShadowThreshold
    candleType = lastCandle.close < lastCandle.open ? '阴线' : '上影线'
  }

  // 成交量检查
  const { volumePassed, volumeReason } = checkVolumeConfirmation(
    volumeHistory || [],
    lastCandle,
    strategyMode,
    volumeEMAPeriod,
    volumeEMAMultiplier,
    volumeConfirmation
  )

  // 价格突破检查
  let priceBreakoutPassed = true
  let priceBreakoutReason = '价格突破指标未检查'
  let priceBreakoutData: any = null
  
  if (candles15m && candles15m.length > 0) {
    const priceBreakoutResult = checkPriceBreakout(direction, price, candles15m, config)
    priceBreakoutPassed = priceBreakoutResult.passed
    priceBreakoutReason = priceBreakoutResult.reason
    priceBreakoutData = priceBreakoutResult.data
  }

  // 核心条件判断
  const emaConditionPassed = !emaDeviationEnabled || nearEMA
  const breakoutConditionPassed = !priceBreakoutData?.enabled || priceBreakoutPassed
  const passed = (emaConditionPassed || breakoutConditionPassed) && emaSlowDeviationPassed && rsiInRange && isConfirmCandle && volumePassed

  // 原因构建
  let reason = ''
  const actionType = direction === 'LONG' ? '回踩' : '反弹'
  const failActionType = direction === 'LONG' ? '回踩' : '反弹'

  if (passed) {
    const conditions: string[] = []
    const bothEnabled = emaDeviationEnabled && priceBreakoutData?.enabled
    const onlyEmaEnabled = emaDeviationEnabled && !priceBreakoutData?.enabled
    const onlyBreakoutEnabled = !emaDeviationEnabled && priceBreakoutData?.enabled
    const bothDisabled = !emaDeviationEnabled && !priceBreakoutData?.enabled
    
    if (bothEnabled) {
      if (nearEMA && priceBreakoutPassed) {
        conditions.push(`价格${actionType}${nearEMAType}且突破确认`)
      } else if (nearEMA) {
        conditions.push(`价格${actionType}${nearEMAType}`)
      } else if (priceBreakoutPassed) {
        conditions.push(`价格突破确认`)
      }
    } else if (onlyEmaEnabled && nearEMA) {
      conditions.push(`价格${actionType}${nearEMAType}`)
    } else if (onlyBreakoutEnabled && priceBreakoutPassed) {
      conditions.push(`价格突破确认`)
    } else if (bothDisabled) {
      conditions.push(`${actionType}/突破条件已禁用`)
    }
    
    if (emaSlowDeviationEnabled) {
      conditions.push(`${emaSlowName}偏离(${(emaSlowDeviation * 100).toFixed(2)}%) ≤ ${(emaSlowDeviationThreshold * 100).toFixed(2)}%`)
    } else {
      conditions.push(`${emaSlowName}偏离检查已禁用`)
    }
    
    conditions.push(`RSI适中(${rsi.toFixed(1)})`)
    conditions.push(`${candleType}确认`)
    
    if (volumeConfirmation) {
      conditions.push(`成交量确认`)
    }
    
    reason = conditions.join('，')
  } else {
    const reasons: string[] = []
    const bothEnabled = emaDeviationEnabled && priceBreakoutData?.enabled
    const emaFailed = emaDeviationEnabled && !nearEMA
    const breakoutFailed = priceBreakoutData?.enabled && !priceBreakoutPassed
    
    if (bothEnabled && emaFailed && breakoutFailed) {
      const emaFastPercent = calculatePercentage(price, emaFast)
      const emaMediumPercent = calculatePercentage(price, emaMedium)
      reasons.push(`价格既未${failActionType}EMA（距离${emaFastName}: ${emaFastPercent}%，${emaMediumName}: ${emaMediumPercent}%）也未${priceBreakoutReason.toLowerCase()}`)
    } else {
      if (emaFailed) {
        const emaFastPercent = calculatePercentage(price, emaFast)
        const emaMediumPercent = calculatePercentage(price, emaMedium)
        reasons.push(`价格未${failActionType}EMA（距离${emaFastName}: ${emaFastPercent}%，${emaMediumName}: ${emaMediumPercent}%）`)
      }
      if (breakoutFailed) {
        reasons.push(`${priceBreakoutReason}`)
      }
    }
    
    if (emaSlowDeviationEnabled && !emaSlowDeviationPassed) {
      const emaSlowPercent = ((price - emaSlow) / emaSlow * 100).toFixed(2)
      reasons.push(`${emaSlowName}偏离过大(${emaSlowPercent}%) > ${(emaSlowDeviationThreshold * 100).toFixed(2)}%`)
    }
    
    if (!rsiInRange) {
      reasons.push(`RSI(${rsi.toFixed(1)})[${rsiMin} - ${rsiMax}]`)
    }
    
    if (!isConfirmCandle) {
      const candleFailReason = direction === 'LONG' 
        ? 'K线未确认（非阳线且无明显下影线）' 
        : 'K线未确认（非阴线且无明显上影线）'
      reasons.push(candleFailReason)
    }
    
    if (!volumePassed) {
      reasons.push(`${volumeReason}`)
    }
    
    reason = reasons.join('；')
  }

  return {
    passed,
    reason,
    data: {
      price,
      ema20: emaFast,
      ema30: emaMedium,
      ema60: emaSlow,
      rsi,
      nearEMA20: nearFastEMA,
      nearEMA30: nearMediumEMA,
      nearEMA,
      nearEMAType,
      rsiInRange,
      rsiValue: rsi,
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
          rsiValue: rsi,
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
 * 检查做多入场条件（兼容旧接口）
 */
export function checkLongEntry(
  price: number,
  indicators: TechnicalIndicators,
  lastCandle: OHLCV,
  config?: BotConfig,
  volumeHistory?: number[],
  candles15m?: OHLCV[]
) {
  return checkEntry('LONG', price, indicators, lastCandle, config, volumeHistory, candles15m)
}

/**
 * 检查做空入场条件（兼容旧接口）
 */
export function checkShortEntry(
  price: number,
  indicators: TechnicalIndicators,
  lastCandle: OHLCV,
  config?: BotConfig,
  volumeHistory?: number[],
  candles15m?: OHLCV[]
) {
  return checkEntry('SHORT', price, indicators, lastCandle, config, volumeHistory, candles15m)
}

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
    
    // 根据策略模式选择EMA周期（使用配置值，默认为硬编码值）
    const emaPeriods = config?.indicatorsConfig?.emaPeriods
    const emaFast = emaPeriods?.[strategyMode]?.fast || (strategyMode === 'medium_term' ? 50 : 20)
    const emaMedium = emaPeriods?.[strategyMode]?.medium || (strategyMode === 'medium_term' ? 100 : 30)
    const emaSlow = emaPeriods?.[strategyMode]?.slow || (strategyMode === 'medium_term' ? 200 : 60)

    // K线数量从配置读取，默认300根，中长期策略需要足够K线数据来计算EMA200等指标
    const requiredCandles = config?.indicatorsConfig?.requiredCandles || 300
    
    // 获取不同周期的K线数据
    const candlesMain = await binance.fetchOHLCV(symbol, mainTF, undefined, requiredCandles)
    const candlesSecondary = await binance.fetchOHLCV(symbol, secondaryTF, undefined, requiredCandles)
    const candlesTertiary = await binance.fetchOHLCV(symbol, tertiaryTF, undefined, requiredCandles)

    const closesMain = candlesMain.map(c => c.close)
    const highsMain = candlesMain.map(c => c.high)
    const lowsMain = candlesMain.map(c => c.low)

    // 检查是否有足够的数据计算EMA
    if (closesMain.length < emaSlow) {
      throw new Error(`K线数据不足，需要至少${emaSlow}根K线来计算EMA${emaSlow}，当前只有${closesMain.length}根`)
    }

    // 计算EMA（基于主周期）
    const emaFastValuesFull = EMA.calculate({ period: emaFast, values: closesMain })
    const emaMediumValuesFull = EMA.calculate({ period: emaMedium, values: closesMain })
    const emaSlowValuesFull = EMA.calculate({ period: emaSlow, values: closesMain })

    // 获取EMA值，如果计算失败则使用最后一个收盘价作为替代
    const getEMAValue = (emaValues: number[], defaultValue: number) => {
      if (emaValues.length === 0) {
        // 如果EMA计算失败，使用最后一个收盘价作为替代
        return closesMain[closesMain.length - 1] || defaultValue
      }
      return emaValues[emaValues.length - 1] || defaultValue
    }

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

    // 使用getEMAValue函数获取EMA值
    const emaFastValue = getEMAValue(emaFastValuesFull, closesMain[closesMain.length - 1] || 0)
    const emaMediumValue = getEMAValue(emaMediumValuesFull, closesMain[closesMain.length - 1] || 0)
    const emaSlowValue = getEMAValue(emaSlowValuesFull, closesMain[closesMain.length - 1] || 0)

    // 只保留最后10个EMA值，减少状态文件体积（程序只需要最后2个值用于金叉死叉判断）
    const emaFastValues = emaFastValuesFull.slice(-3)
    const emaMediumValues = emaMediumValuesFull.slice(-3)
    const emaSlowValues = emaSlowValuesFull.slice(-3)

    // 计算ADX斜率（当前值 - N周期前的值）
    const adxSlopePeriod = config?.riskConfig?.takeProfit?.adxSlopePeriod || 3
    const currentADX = adxMainValues[adxMainValues.length - 1]?.adx || 0
    const previousADXIndex = Math.max(0, adxMainValues.length - 1 - adxSlopePeriod)
    const previousADX = adxMainValues[previousADXIndex]?.adx || currentADX
    const adxSlope = currentADX - previousADX

    return {
      ema20: emaFastValue,
      ema30: emaMediumValue,
      ema60: emaSlowValue,
      emaFastValues,
      emaMediumValues,
      emaSlowValues,
      adx15m,
      adx1h,
      adx4h,
      adxSlope,
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
  
  // 获取策略模式，默认为短期
  const strategyMode = config?.strategyMode || 'short_term'
  
  // 根据策略模式确定周期标签
  let period1Label = '15m'
  let period2Label = '1h'
  let period3Label = '4h'
  
  if (strategyMode === 'medium_term') {
    // 中长期策略：1h为主周期，4h为次要周期，1d为第三周期
    period1Label = '1h'
    period2Label = '4h'
    period3Label = '1d'
  }
  
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
    conditions.push(`${period1Label} ADX(${adx15m.toFixed(2)}) >= ${adx15mThreshold}`)
    conditions.push(`${period2Label} ADX(${adx1h.toFixed(2)}) >= ${adx1hThreshold}`)
    conditions.push(`${period3Label} ADX(${adx4h.toFixed(2)}) >= ${adx4hThreshold}`)
    
    if (enableAdx15mVs1hCheck) {
      conditions.push(`${period1Label} ADX(${adx15m.toFixed(2)}) > ${period2Label} ADX(${adx1h.toFixed(2)})`)
    }
    
    reason = conditions.join(' 且 ') + '（趋势全面确认）'
  } else {
    // 根据具体不满足的条件显示不同的原因
    const reasons: string[] = []
    if (!pass15m) {
      reasons.push(`${period1Label} ADX(${adx15m.toFixed(2)}) < ${adx15mThreshold}`)
    }
    if (!pass1h) {
      reasons.push(`${period2Label} ADX(${adx1h.toFixed(2)}) < ${adx1hThreshold}`)
    }
    if (!pass4h) {
      reasons.push(`${period3Label} ADX(${adx4h.toFixed(2)}) < ${adx4hThreshold}`)
    }
    if (enableAdx15mVs1hCheck && !pass15mVs1h) {
      reasons.push(`${period1Label} ADX(${adx15m.toFixed(2)}) ≤ ${period2Label} ADX(${adx1h.toFixed(2)})`)
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
      periodLabels: {
        period1: period1Label,
        period2: period2Label,
        period3: period3Label,
        strategyMode
      },
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
  indicators: TechnicalIndicators,
  config?: BotConfig,
  candles?: OHLCV[]
) {
  const { ema20: emaFast, ema60: emaSlow, emaFastValues, emaSlowValues } = indicators

  // 获取策略模式，默认为短期
  const strategyMode = config?.strategyMode || 'short_term'
  
  // 根据策略模式选择指标名称（使用配置的EMA周期）
  const emaPeriods = config?.indicatorsConfig?.emaPeriods
  const crossEntryEnabled = config?.indicatorsConfig?.crossEntryEnabled ?? true
  // 新增：是否显示交叉失败原因，默认false（生产模式不显示）
  const showCrossFailureReason = config?.indicatorsConfig?.showCrossFailureReason ?? false
  const emaFastPeriod = emaPeriods?.[strategyMode]?.fast || (strategyMode === 'medium_term' ? 50 : 20)
  const emaSlowPeriod = emaPeriods?.[strategyMode]?.slow || (strategyMode === 'medium_term' ? 200 : 60)
  const emaFastName = `EMA${emaFastPeriod}`
  const emaSlowName = `EMA${emaSlowPeriod}`

  // 优先判断EMA金叉/死叉（直接入场信号）
  let isCrossSignal = false
  let crossDirection: 'LONG' | 'SHORT' | null = null
  let crossReason = ''
  let crossFailureReason: string | null = null

  // 使用缓存中已计算好的EMA值，不再重复计算
  if (emaFastValues.length >= 2 && emaSlowValues.length >= 2) {
      const fastCurrent = emaFastValues[emaFastValues.length - 1] || 0
      const fastPrev = emaFastValues[emaFastValues.length - 2] || 0
      const slowCurrent = emaSlowValues[emaSlowValues.length - 1] || 0
      const slowPrev = emaSlowValues[emaSlowValues.length - 2] || 0

      // 1. 先检查预判交叉（在接近交叉但尚未交叉时提前入场） - 独立开关控制
      const predictiveCrossConfig = config?.indicatorsConfig?.predictiveCross
      const predictiveEnabled = predictiveCrossConfig?.enabled ?? true
      const distancePercent = predictiveCrossConfig?.distancePercent ?? 0.0008 // 0.08%
      const onlyTrend = predictiveCrossConfig?.onlyTrend ?? true
      
      // 计算EMA差值百分比（distancePercent已经是百分比，不需要乘以100）
      const emaDiffPercent = Math.abs(fastCurrent - slowCurrent) / slowCurrent
      const isNearCross = emaDiffPercent <= distancePercent
      
      // 检查顺势条件
      let isTrendAligned = true
      if (onlyTrend) {
        // 价格在慢EMA上方时，只预判金叉（做多信号）
        // 价格在慢EMA下方时，只预判死叉（做空信号）
        const priceAboveSlowEMA = price > slowCurrent
        const priceBelowSlowEMA = price < slowCurrent
        
        // 如果价格在慢EMA上方，但快EMA已经在慢EMA上方，没有金叉可预判
        // 如果价格在慢EMA下方，但快EMA已经在慢EMA下方，没有死叉可预判
        if (priceAboveSlowEMA && fastCurrent > slowCurrent) {
          isTrendAligned = false
        } else if (priceBelowSlowEMA && fastCurrent < slowCurrent) {
          isTrendAligned = false
        }
      }
      
      // 预判交叉条件（去掉K线进度检查）
      const canPredict = predictiveEnabled && isNearCross && isTrendAligned
      
      // 2. 检查实际交叉 - 受crossEntryEnabled开关独立控制
      const goldenCross = crossEntryEnabled && fastPrev <= slowPrev && fastCurrent > slowCurrent
      const deadCross = crossEntryEnabled && fastPrev >= slowPrev && fastCurrent < slowCurrent

      // 统一交叉信号输出格式：[信号类型] 方向 | 关键数据
      if (canPredict && !goldenCross && !deadCross) {
        // 预判交叉信号
        isCrossSignal = true
        crossDirection = fastCurrent < slowCurrent ? 'LONG' : 'SHORT'
        const crossType = crossDirection === 'LONG' ? '金叉' : '死叉'
        crossReason = `[预判交叉] ${crossDirection}  ${emaFastName}即将${crossType}${emaSlowName} ， 差值: ${(emaDiffPercent * 100).toFixed(3)}% ， 提前入场`
      } else if (goldenCross) {
        // 实际金叉信号
        isCrossSignal = true
        crossDirection = 'LONG'
        crossReason = `[实际金叉] LONG ${emaFastName}上穿${emaSlowName} ， 前值: ${fastPrev.toFixed(2)} ≤ ${slowPrev.toFixed(2)} ， 当前: ${fastCurrent.toFixed(2)} > ${slowCurrent.toFixed(2)} ， 直接做多`
      } else if (deadCross) {
        // 实际死叉信号
        isCrossSignal = true
        crossDirection = 'SHORT'
        crossReason = `[实际死叉] SHORT ${emaFastName}下穿${emaSlowName} ， 前值: ${fastPrev.toFixed(2)} ≥ ${slowPrev.toFixed(2)} ， 当前: ${fastCurrent.toFixed(2)} < ${slowCurrent.toFixed(2)} ， 直接做空`
      } else {
        // 交叉检测失败，统一格式输出原因
        let failureReason = '[交叉失败]'
        const details: string[] = []
        
        if (predictiveEnabled) {
          // 所有情况都输出当前差值，方便调试
          details.push(`差值: ${(emaDiffPercent * 100).toFixed(3)}%`)
          // 预判交叉启用时先显示预判失败原因
          if (!isNearCross) {
            details.push(`超过阈值: ${(distancePercent * 100).toFixed(3)}%`)
          }
          if (!isTrendAligned) {
            details.push('趋势不对齐')
          }
        }
        
        // 只有开启显示交叉失败原因 且 实际交叉功能开启时，才显示实际交叉的未交叉基础信息
        if (showCrossFailureReason && crossEntryEnabled) {
          const prevRelation = fastPrev <= slowPrev ? '≤' : '≥'
          const currentRelation = fastCurrent <= slowCurrent ? '≤' : '≥'
          details.push(`未交叉：前值: ${fastPrev.toFixed(2)} ${prevRelation} ${slowPrev.toFixed(2)} ， 当前: ${fastCurrent.toFixed(2)} ${currentRelation} ${slowCurrent.toFixed(2)}`)
        }
        
        crossFailureReason = details.length > 0 ? `${failureReason} ${details.join('；')}` : null
        crossReason = ''
    }
  }

  const emaFastAboveEmaSlow = emaFast > emaSlow
  const priceAboveFastEMA = price > emaFast
  const priceBelowFastEMA = price < emaFast

  // 做多条件：快线 > 慢线 且 价格 > 快线
  const isLong = emaFastAboveEmaSlow && priceAboveFastEMA
  
  // 做空条件：快线 < 慢线 且 价格 < 快线
  const isShort = !emaFastAboveEmaSlow && priceBelowFastEMA

  let direction: 'LONG' | 'SHORT' | 'IDLE' = 'IDLE'
  let reason = ''

  if (isCrossSignal && crossDirection) {
    direction = crossDirection
    reason = crossReason
  } else if (isLong) {
    direction = 'LONG'
    const trendReason = `[趋势做多] LONG  ${emaFastName}(${emaFast.toFixed(2)}) > ${emaSlowName}(${emaSlow.toFixed(2)}) ， 价格(${price.toFixed(2)}) > ${emaFastName}`
    // 开启显示时才合并交叉失败原因
    reason = showCrossFailureReason && crossFailureReason ? `${trendReason} ， ${crossFailureReason}` : trendReason
  } else if (isShort) {
    direction = 'SHORT'
    const trendReason = `[趋势做空] SHORT  ${emaFastName}(${emaFast.toFixed(2)}) < ${emaSlowName}(${emaSlow.toFixed(2)}) ， 价格(${price.toFixed(2)}) < ${emaFastName}`
    // 开启显示时才合并交叉失败原因
    reason = showCrossFailureReason && crossFailureReason ? `${trendReason} ， ${crossFailureReason}` : trendReason
  } else {
    // 交叉失败+趋势结果合并显示
    const reasons: string[] = []
    
    // 先加趋势失败原因
    let trendReason = ''
    const trendDetails: string[] = []
    
    if (emaFastAboveEmaSlow && !priceAboveFastEMA) {
      trendDetails.push(`${emaFastName}(${emaFast.toFixed(2)}) > ${emaSlowName}(${emaSlow.toFixed(2)}) ， 价格(${price.toFixed(2)}) ≤ ${emaFastName}`)
    } else if (!emaFastAboveEmaSlow && !priceBelowFastEMA) {
      trendDetails.push(`${emaFastName}(${emaFast.toFixed(2)}) < ${emaSlowName}(${emaSlow.toFixed(2)}) ， 价格(${price.toFixed(2)}) ≥ ${emaFastName}`)
    } else {
      trendDetails.push(`${emaFastName}(${emaFast.toFixed(2)}) ≈ ${emaSlowName}(${emaSlow.toFixed(2)}) ， 价格震荡`)
    }
    
    reasons.push(`${trendReason} ${trendDetails.join('；')}`)
    
    // 交叉失败原因受showCrossFailureReason开关控制
    if (showCrossFailureReason && crossFailureReason) {
      reasons.push(crossFailureReason)
    }
    
    // 合并所有原因
    reason = reasons.join(' ； ')
  }

  return {
    direction,
    reason,
    data: {
      price,
      ema20: emaFast,
      ema60: emaSlow,
      isCrossSignal,
      crossDirection,
      crossCandleTimestamp: candles?.[candles.length - 1]?.timestamp,
      crossFailureReason, // 单独返回交叉失败原因，供外部使用
      conditions: {
        ema20AboveEma60: emaFastAboveEmaSlow,
        priceAboveEma20: priceAboveFastEMA,
        priceBelowEma20: priceBelowFastEMA,
        isLong,
        isShort
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
 * 检测Pin Bar针形K线形态
 */
function detectPinBar(
  lastCandle: OHLCV,
  config: any
): { triggered: boolean; direction: 'LONG' | 'SHORT' | null; reason: string } {
  const shadowBodyRatio = config.shadowBodyRatio ?? 3;
  const maxBodyRatio = config.maxBodyRatio ?? 0.3;
  
  const lastBodySize = Math.abs(lastCandle.close - lastCandle.open);
  const lastTotalSize = lastCandle.high - lastCandle.low;
  const lastUpperShadow = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lastLowerShadow = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  
  if (lastBodySize / lastTotalSize <= maxBodyRatio) {
    // 看涨Pin Bar：长下影线
    if (lastLowerShadow >= lastBodySize * shadowBodyRatio && lastLowerShadow > lastUpperShadow * 2) {
      return {
        triggered: true,
        direction: 'LONG',
        reason: `[PA信号] 看涨Pin Bar：下影线(${lastLowerShadow.toFixed(4)})是实体(${lastBodySize.toFixed(4)})的${(lastLowerShadow/lastBodySize).toFixed(1)}倍，反转做多`
      };
    }
    
    // 看跌Pin Bar：长上影线
    if (lastUpperShadow >= lastBodySize * shadowBodyRatio && lastUpperShadow > lastLowerShadow * 2) {
      return {
        triggered: true,
        direction: 'SHORT',
        reason: `[PA信号] 看跌Pin Bar：上影线(${lastUpperShadow.toFixed(4)})是实体(${lastBodySize.toFixed(4)})的${(lastUpperShadow/lastBodySize).toFixed(1)}倍，反转做空`
      };
    }
  }
  
  return { triggered: false, direction: null, reason: '未触发Pin Bar信号' };
}

/**
 * 检测吞没形态
 */
function detectEngulfing(
  lastCandle: OHLCV,
  prevCandle: OHLCV,
  config: any
): { triggered: boolean; direction: 'LONG' | 'SHORT' | null; reason: string } {
  const minEngulfRatio = config.minEngulfRatio ?? 1.8;
  
  const lastBodySize = Math.abs(lastCandle.close - lastCandle.open);
  const prevBodySize = Math.abs(prevCandle.close - prevCandle.open);
  const prevIsBullish = prevCandle.close > prevCandle.open;
  const lastIsBullish = lastCandle.close > lastCandle.open;
  
  // 看涨吞没：前阴后阳，阳线实体完全包裹阴线实体
  if (!prevIsBullish && lastIsBullish && 
      lastCandle.open < prevCandle.close && 
      lastCandle.close > prevCandle.open &&
      lastBodySize >= prevBodySize * minEngulfRatio) {
    return {
      triggered: true,
      direction: 'LONG',
      reason: `[PA信号] 看涨吞没：阳线实体(${lastBodySize.toFixed(4)})完全包裹前阴线实体(${prevBodySize.toFixed(4)})，反转做多`
    };
  }
  
  // 看跌吞没：前阳后阴，阴线实体完全包裹阳线实体
  if (prevIsBullish && !lastIsBullish && 
      lastCandle.open > prevCandle.close && 
      lastCandle.close < prevCandle.open &&
      lastBodySize >= prevBodySize * minEngulfRatio) {
    return {
      triggered: true,
      direction: 'SHORT',
      reason: `[PA信号] 看跌吞没：阴线实体(${lastBodySize.toFixed(4)})完全包裹前阳线实体(${prevBodySize.toFixed(4)})，反转做空`
    };
  }
  
  return { triggered: false, direction: null, reason: '未触发吞没形态信号' };
}

/**
 * 检查价格行为(PA)信号 统一入口
 * 支持Pin Bar针形K线和吞没形态
 */
export function checkPriceActionSignal(
  candles: OHLCV[],
  config?: BotConfig
): { 
  triggered: boolean; 
  direction: 'LONG' | 'SHORT' | null;
  reason: string;
} {
  // @ts-ignore - 后续会更新类型定义
  const paConfig = config?.indicatorsConfig?.priceAction;
  
  // PA未启用直接返回
  if (!paConfig?.enabled) {
    return { triggered: false, direction: null, reason: 'PA策略未启用' };
  }
  
  if (candles.length < 2) {
    return { triggered: false, direction: null, reason: 'K线数据不足' };
  }
  
  const lastCandle = candles[candles.length - 1]!;
  const prevCandle = candles[candles.length - 2]!;
  
  // 1. 检测Pin Bar
  if (paConfig.pinBarEnabled) {
    const pinBarResult = detectPinBar(lastCandle, paConfig);
    if (pinBarResult.triggered) {
      return pinBarResult;
    }
  }
  
  // 2. 检测吞没形态
  if (paConfig.engulfingEnabled) {
    const engulfingResult = detectEngulfing(lastCandle, prevCandle, paConfig);
    if (engulfingResult.triggered) {
      return engulfingResult;
    }
  }
  
  return { triggered: false, direction: null, reason: '未触发PA信号' };
}

/**
 * 检查波动率条件
 */
export function checkVolatility(
  price: number,
  indicators: TechnicalIndicators,
  config?: BotConfig,
  symbol?: string
): { passed: boolean; reason: string; data?: any } {
  // 使用配置参数或默认值
  const enabled = config?.indicatorsConfig?.volatility?.enabled ?? true
  const minATRPercent = config?.indicatorsConfig?.volatility?.minATRPercent ?? 0.5
  const skipSymbols = config?.indicatorsConfig?.volatility?.skipSymbols ?? []

  // 如果未启用波动率过滤，直接返回通过
  if (!enabled) {
    return {
      passed: true,
      reason: '波动率过滤未启用',
      data: {
        enabled: false,
        minATRPercent,
        skipSymbols
      }
    }
  }

  // 检查是否在跳过列表中
  if (symbol && skipSymbols.includes(symbol)) {
    return {
      passed: true,
      reason: `交易对${symbol}在跳过列表中，不检查波动率`,
      data: {
        enabled,
        minATRPercent,
        skipSymbols,
        symbol,
        skipped: true
      }
    }
  }

  const { atr } = indicators

  // 计算ATR百分比（波动率）
  const atrPercent = (atr / price) * 100

  // 检查波动率是否达到最小阈值
  const passed = atrPercent >= minATRPercent

  let reason = ''
  if (passed) {
    reason = `波动率满足条件：ATR百分比${atrPercent.toFixed(2)}% ≥ ${minATRPercent}%`
  } else {
    reason = `波动率过低：ATR百分比${atrPercent.toFixed(2)}% < ${minATRPercent}%`
  }

  return {
    passed,
    reason,
    data: {
      enabled,
      minATRPercent,
      skipSymbols,
      price,
      atr,
      atrPercent,
      symbol,
      skipped: symbol ? skipSymbols.includes(symbol) : false
    }
  }
}
