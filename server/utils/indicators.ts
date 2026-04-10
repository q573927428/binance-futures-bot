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
 * 直接传入BotConfig自动获取参数
 */
function getEMAPeriodConfig(config?: BotConfig) {
  const strategyMode = config?.strategyMode || 'short_term'
  const periods = config?.indicatorsConfig?.emaPeriods

  const fast = periods?.[strategyMode]?.fast || (strategyMode === 'medium_term' ? 50 : 20)
  const medium = periods?.[strategyMode]?.medium || (strategyMode === 'medium_term' ? 100 : 30)
  const slow = periods?.[strategyMode]?.slow || (strategyMode === 'medium_term' ? 200 : 60)
  return {
    strategyMode,
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
  const { strategyMode, fastName: emaFastName, mediumName: emaMediumName, slowName: emaSlowName } = getEMAPeriodConfig(config)

  const entryConfig = direction === 'LONG' ? config?.indicatorsConfig?.longEntry : config?.indicatorsConfig?.shortEntry
  const cfg = {
    emaDeviationThreshold: entryConfig?.emaDeviationThreshold || 0.005,
    emaDeviationEnabled: entryConfig?.emaDeviationEnabled ?? true,
    emaSlowDeviationThreshold: entryConfig?.emaSlowDeviationThreshold || 0.05,
    emaSlowDeviationEnabled: entryConfig?.emaSlowDeviationEnabled ?? true,
    rsiMin: entryConfig?.rsiMin || 40,
    rsiMax: entryConfig?.rsiMax || (direction === 'LONG' ? 60 : 55),
    candleShadowThreshold: entryConfig?.candleShadowThreshold || 0.005,
    volumeConfirmation: entryConfig?.volumeConfirmation ?? true,
    volumeEMAPeriod: entryConfig?.volumeEMAPeriod || 10,
    volumeEMAMultiplier: entryConfig?.volumeEMAMultiplier || 1.2
  }

  // 基础条件计算
  const nearFastEMA = Math.abs(price - emaFast) / emaFast <= cfg.emaDeviationThreshold
  const nearMediumEMA = Math.abs(price - emaMedium) / emaMedium <= cfg.emaDeviationThreshold
  const nearEMA = nearFastEMA || nearMediumEMA
  const nearEMAType = nearFastEMA ? emaFastName : nearMediumEMA ? emaMediumName : 'none'
  const emaSlowDeviation = Math.abs(price - emaSlow) / emaSlow
  const emaSlowDeviationPassed = !cfg.emaSlowDeviationEnabled || emaSlowDeviation <= cfg.emaSlowDeviationThreshold
  const rsiInRange = rsi >= cfg.rsiMin && rsi <= cfg.rsiMax

  // K线确认
  const isLong = direction === 'LONG'
  const isConfirmCandle = isLong
    ? (lastCandle.close > lastCandle.open || (lastCandle.open - lastCandle.low) / lastCandle.open >= cfg.candleShadowThreshold)
    : (lastCandle.close < lastCandle.open || (lastCandle.high - lastCandle.open) / lastCandle.open >= cfg.candleShadowThreshold)
  const candleType = isLong
    ? (lastCandle.close > lastCandle.open ? '阳线' : '下影线')
    : (lastCandle.close < lastCandle.open ? '阴线' : '上影线')

  // 成交量检查
  const { volumePassed, volumeReason } = checkVolumeConfirmation(
    volumeHistory || [], lastCandle, strategyMode, cfg.volumeEMAPeriod, cfg.volumeEMAMultiplier, cfg.volumeConfirmation
  )

  // 价格突破检查
  let priceBreakoutPassed = true, priceBreakoutReason = '价格突破指标未检查', priceBreakoutData: any = null
  if (candles15m?.length) {
    const res = checkPriceBreakout(direction, price, candles15m, config)
    priceBreakoutPassed = res.passed
    priceBreakoutReason = res.reason
    priceBreakoutData = res.data
  }

  // 核心条件判断
  const emaConditionPassed = !cfg.emaDeviationEnabled || nearEMA
  const breakoutConditionPassed = !priceBreakoutData?.enabled || priceBreakoutPassed
  const passed = (emaConditionPassed || breakoutConditionPassed) && emaSlowDeviationPassed && rsiInRange && isConfirmCandle && volumePassed

  // 原因构建
  const actionType = isLong ? '回踩' : '反弹'
  let reason = ''

  if (passed) {
    const conds: string[] = []
    const bothEnabled = cfg.emaDeviationEnabled && priceBreakoutData?.enabled
    
    if (bothEnabled) {
      nearEMA && priceBreakoutPassed && conds.push(`价格${actionType}${nearEMAType}且突破确认`)
      nearEMA && !priceBreakoutPassed && conds.push(`价格${actionType}${nearEMAType}`)
      !nearEMA && priceBreakoutPassed && conds.push(`价格突破确认`)
    } else if (cfg.emaDeviationEnabled && nearEMA) {
      conds.push(`价格${actionType}${nearEMAType}`)
    } else if (priceBreakoutData?.enabled && priceBreakoutPassed) {
      conds.push(`价格突破确认`)
    } else if (!cfg.emaDeviationEnabled && !priceBreakoutData?.enabled) {
      conds.push(`${actionType}/突破条件已禁用`)
    }

    cfg.emaSlowDeviationEnabled
      ? conds.push(`${emaSlowName}偏离(${(emaSlowDeviation * 100).toFixed(2)}%) ≤ ${(cfg.emaSlowDeviationThreshold * 100).toFixed(2)}%`)
      : conds.push(`${emaSlowName}偏离检查已禁用`)

    conds.push(`RSI适中(${rsi.toFixed(1)})`, `${candleType}确认`)
    cfg.volumeConfirmation && conds.push(`成交量确认`)
    reason = conds.join('，')
  } else {
    const reasons: string[] = []
    const emaFailed = cfg.emaDeviationEnabled && !nearEMA
    const breakoutFailed = priceBreakoutData?.enabled && !priceBreakoutPassed

    if (cfg.emaDeviationEnabled && priceBreakoutData?.enabled && emaFailed && breakoutFailed) {
      const emaFastPercent = calculatePercentage(price, emaFast)
      const emaMediumPercent = calculatePercentage(price, emaMedium)
      reasons.push(`价格既未${actionType}EMA（距离${emaFastName}: ${emaFastPercent}%，${emaMediumName}: ${emaMediumPercent}%）也未${priceBreakoutReason.toLowerCase()}`)
    } else {
      emaFailed && reasons.push(`价格未${actionType}EMA（距离${emaFastName}: ${calculatePercentage(price, emaFast)}%，${emaMediumName}: ${calculatePercentage(price, emaMedium)}%）`)
      breakoutFailed && reasons.push(priceBreakoutReason)
    }

    cfg.emaSlowDeviationEnabled && !emaSlowDeviationPassed && reasons.push(`${emaSlowName}偏离过大(${(emaSlowDeviation * 100).toFixed(2)}%) > ${(cfg.emaSlowDeviationThreshold * 100).toFixed(2)}%`)
    !rsiInRange && reasons.push(`RSI(${rsi.toFixed(1)})[${cfg.rsiMin} - ${cfg.rsiMax}]`)
    !isConfirmCandle && reasons.push(isLong ? 'K线未确认（非阳线且无明显下影线）' : 'K线未确认（非阴线且无明显上影线）')
    !volumePassed && reasons.push(volumeReason)
    reason = reasons.join('；')
  }

  // 返回必要字段，兼顾简洁和可调试性
  return {
    passed,
    reason,
    data: {
      nearEMA,
      rsiInRange,
      isConfirmCandle,
      volumePassed,
      priceBreakoutPassed
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
    // 统一获取EMA配置（复用工具函数，消除重复代码）
    const { strategyMode, fast: emaFast, medium: emaMedium, slow: emaSlow } = getEMAPeriodConfig(config)
    
    // 根据策略模式选择K线周期
    const mainTF = strategyMode === 'medium_term' ? '1h' : '15m'
    const secondaryTF = strategyMode === 'medium_term' ? '4h' : '1h'
    const tertiaryTF = strategyMode === 'medium_term' ? '1d' : '4h'

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
  const { adx15m, adx1h, adx4h } = indicators
  const adxConfig = config?.indicatorsConfig?.adxTrend
  const strategyMode = config?.strategyMode || 'short_term'
  // 根据策略模式确定周期标签
  const [p1, p2, p3] = strategyMode === 'medium_term' ? ['1h', '4h', '1d'] : ['15m', '1h', '4h']
  const t1 = adxConfig?.adx15mThreshold || 30
  const t2 = adxConfig?.adx1hThreshold || 25
  const t3 = adxConfig?.adx4hThreshold || 28
  const enableCompare = adxConfig?.enableAdx15mVs1hCheck ?? true

  const pass1 = adx15m >= t1
  const pass2 = adx1h >= t2
  const pass3 = adx4h >= t3
  const passCompare = enableCompare ? adx15m > adx1h : true
  // 逻辑：必须满足三个绝对阈值，并且根据开关决定是否检查相对比较
  const passed = pass1 && pass2 && pass3 && passCompare

  let reason = ''
  if (passed) {
    const conds = [`${p1} ADX(${adx15m.toFixed(2)}) >= ${t1}`, `${p2} ADX(${adx1h.toFixed(2)}) >= ${t2}`, `${p3} ADX(${adx4h.toFixed(2)}) >= ${t3}`]
    enableCompare && conds.push(`${p1} ADX(${adx15m.toFixed(2)}) > ${p2} ADX(${adx1h.toFixed(2)})`)
    reason = conds.join(' 且 ') + '（趋势全面确认）'
  } else {
    const reasons = []
    !pass1 && reasons.push(`${p1} ADX(${adx15m.toFixed(2)}) < ${t1}`)
    !pass2 && reasons.push(`${p2} ADX(${adx1h.toFixed(2)}) < ${t2}`)
    !pass3 && reasons.push(`${p3} ADX(${adx4h.toFixed(2)}) < ${t3}`)
    enableCompare && !passCompare && reasons.push(`${p1} ADX(${adx15m.toFixed(2)}) ≤ ${p2} ADX(${adx1h.toFixed(2)})`)
    reason = reasons.join('，')
  }

  return {
    passed,
    reason,
    data: {
      adx15m, adx1h, adx4h,
      periodLabels: { p1, p2, p3, strategyMode },
      required: { t1, t2, t3, enableCompare },
      actual: { pass1, pass2, pass3, passCompare }
    }
  }
}


/**
 * 检查EMA交叉（金叉/死叉/预判交叉）
 */
export function checkEMACross(
  emaFastValues: number[],
  emaSlowValues: number[],
  price: number,
  config?: BotConfig,
) {
  // 优先判断EMA金叉/死叉（直接入场信号）
  let isCrossSignal = false
  let crossDirection: 'LONG' | 'SHORT' | null = null
  let crossReason = ''
  let crossFailureReason: string | null = null

  // 使用缓存中已计算好的EMA值，不再重复计算
  if (emaFastValues.length < 2 || emaSlowValues.length < 2) {
    return { isCrossSignal, crossDirection, crossReason, crossFailureReason }
  }

  const fastCurrent = emaFastValues.at(-1)!
  const fastPrev = emaFastValues.at(-2)!
  const slowCurrent = emaSlowValues.at(-1)!
  const slowPrev = emaSlowValues.at(-2)!

  const { fastName: emaFastName, slowName: emaSlowName } = getEMAPeriodConfig(config)
  const crossEntryEnabled = config?.indicatorsConfig?.crossEntryEnabled ?? true
  const showCrossFailureReason = config?.indicatorsConfig?.showCrossFailureReason ?? false

  // 预判交叉配置
  const predConfig = config?.indicatorsConfig?.predictiveCross
  const predEnabled = predConfig?.enabled ?? true
  const distancePercent = predConfig?.distancePercent ?? 0.0008
  const onlyTrend = predConfig?.onlyTrend ?? true

  const emaDiffPercent = Math.abs(fastCurrent - slowCurrent) / slowCurrent
  const isNearCross = emaDiffPercent <= distancePercent
  // 价格在慢EMA上方时，只预判金叉（做多信号）
  // 价格在慢EMA下方时，只预判死叉（做空信号）
  const isTrendAligned = onlyTrend ? 
    (price > slowCurrent && fastCurrent <= slowCurrent) || (price < slowCurrent && fastCurrent >= slowCurrent) : true

  const canPredict = predEnabled && isNearCross && isTrendAligned
  // 检查实际交叉 - 受crossEntryEnabled开关独立控制
  const goldenCross = crossEntryEnabled && fastPrev <= slowPrev && fastCurrent > slowCurrent
  const deadCross = crossEntryEnabled && fastPrev >= slowPrev && fastCurrent < slowCurrent

  if (canPredict && !goldenCross && !deadCross) {
    isCrossSignal = true
    crossDirection = fastCurrent < slowCurrent ? 'LONG' : 'SHORT'
    const crossType = crossDirection === 'LONG' ? '金叉' : '死叉'
    crossReason = `[预判交叉] ${crossDirection} ${emaFastName}即将${crossType}${emaSlowName}，差值: ${(emaDiffPercent * 100).toFixed(3)}%`
  } else if (goldenCross) {
    isCrossSignal = true
    crossDirection = 'LONG'
    crossReason = `[实际金叉] LONG ${emaFastName}上穿${emaSlowName}`
  } else if (deadCross) {
    isCrossSignal = true
    crossDirection = 'SHORT'
    crossReason = `[实际死叉] SHORT ${emaFastName}下穿${emaSlowName}`
  } else if (showCrossFailureReason) {
    const details: string[] = []
    if (predEnabled) {
      details.push(`差值: ${(emaDiffPercent * 100).toFixed(3)}%`)
      !isNearCross && details.push(`超过阈值: ${(distancePercent * 100).toFixed(3)}%`)
      !isTrendAligned && details.push('趋势不对齐')
    }
    if (crossEntryEnabled) {
      const prevRel = fastPrev <= slowPrev ? '≤' : '≥'
      const currRel = fastCurrent <= slowCurrent ? '≤' : '≥'
      details.push(`未交叉：前值${fastPrev.toFixed(2)}${prevRel}${slowPrev.toFixed(2)}，当前${fastCurrent.toFixed(2)}${currRel}${slowCurrent.toFixed(2)}`)
    }
    crossFailureReason = details.length ? `[交叉失败] ${details.join('；')}` : null
  }

  return { isCrossSignal, crossDirection, crossReason, crossFailureReason }
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
  const { fastName: emaFastName, slowName: emaSlowName } = getEMAPeriodConfig(config)
  const showCrossFail = config?.indicatorsConfig?.showCrossFailureReason ?? false
  // 调用独立交叉检测函数
  const cross = checkEMACross(emaFastValues, emaSlowValues, price, config)
  const emaFastAboveSlow = emaFast > emaSlow
  const priceAboveFast = price > emaFast
  const priceBelowFast = price < emaFast

  // 做多条件：快线 > 慢线 且 价格 > 快线
  const isLong = emaFastAboveSlow && priceAboveFast
  // 做空条件：快线 < 慢线 且 价格 < 快线
  const isShort = !emaFastAboveSlow && priceBelowFast

  let direction: 'LONG' | 'SHORT' | 'IDLE' = 'IDLE'
  let reason = ''

  if (cross.isCrossSignal && cross.crossDirection) {
    direction = cross.crossDirection
    reason = cross.crossReason
  } else if (isLong) {
    direction = 'LONG'
    const trendReason = `[趋势做多] LONG ${emaFastName}(${emaFast.toFixed(2)}) > ${emaSlowName}(${emaSlow.toFixed(2)})，价格(${price.toFixed(2)}) > ${emaFastName}`
    reason = showCrossFail && cross.crossFailureReason ? `${trendReason}，${cross.crossFailureReason}` : trendReason
  } else if (isShort) {
    direction = 'SHORT'
    const trendReason = `[趋势做空] SHORT ${emaFastName}(${emaFast.toFixed(2)}) < ${emaSlowName}(${emaSlow.toFixed(2)})，价格(${price.toFixed(2)}) < ${emaFastName}`
    reason = showCrossFail && cross.crossFailureReason ? `${trendReason}，${cross.crossFailureReason}` : trendReason
  } else {
    const details: string[] = []
    if (emaFastAboveSlow && !priceAboveFast) {
      details.push(`${emaFastName}(${emaFast.toFixed(2)}) > ${emaSlowName}(${emaSlow.toFixed(2)})，价格(${price.toFixed(2)}) ≤ ${emaFastName}`)
    } else if (!emaFastAboveSlow && !priceBelowFast) {
      details.push(`${emaFastName}(${emaFast.toFixed(2)}) < ${emaSlowName}(${emaSlow.toFixed(2)})，价格(${price.toFixed(2)}) ≥ ${emaFastName}`)
    } else {
      details.push(`${emaFastName}(${emaFast.toFixed(2)}) ≈ ${emaSlowName}(${emaSlow.toFixed(2)})，价格震荡`)
    }
    showCrossFail && cross.crossFailureReason && details.push(cross.crossFailureReason)
    reason = details.join('；')
  }

  return {
    direction,
    reason,
    data: {
      price,
      ema20: emaFast,
      ema60: emaSlow,
      isCrossSignal: cross.isCrossSignal,
      crossDirection: cross.crossDirection,
      crossCandleTimestamp: candles?.at(-1)?.timestamp,
      crossFailureReason: cross.crossFailureReason,
      conditions: { ema20AboveEma60: emaFastAboveSlow, priceAboveEma20: priceAboveFast, priceBelowEma20: priceBelowFast, isLong, isShort }
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
  config: any,
  emaFast: number,
  emaSlow: number,
  price: number
): { triggered: boolean; direction: 'LONG' | 'SHORT' | null; reason: string } {
  const shadowBodyRatio = config.shadowBodyRatio ?? 3;
  const maxBodyRatio = config.maxBodyRatio ?? 0.3;

  const lastBodySize = Math.abs(lastCandle.close - lastCandle.open);
  const lastTotalSize = lastCandle.high - lastCandle.low;
  const lastUpperShadow = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lastLowerShadow = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  
  // 趋势判断
  const isUptrend = price > emaSlow && emaFast > emaSlow; // 上升趋势：价格在慢线上方 + 快线在慢线上方
  const isDowntrend = price < emaSlow && emaFast < emaSlow; // 下降趋势：价格在慢线下方 + 快线在慢线下方
  
  if (lastBodySize / lastTotalSize <= maxBodyRatio) {
    // 看涨Pin Bar：长下影线 + 上升趋势
    if (isUptrend && lastLowerShadow >= lastBodySize * shadowBodyRatio && lastLowerShadow > lastUpperShadow * 2) {
      return {
        triggered: true,
        direction: 'LONG',
        reason: `[PA信号] 看涨Pin Bar：下影线(${lastLowerShadow.toFixed(4)})是实体(${lastBodySize.toFixed(4)})的${(lastLowerShadow/lastBodySize).toFixed(1)}倍，上升趋势确认，反转做多`
      };
    }
    
    // 看跌Pin Bar：长上影线 + 下降趋势
    if (isDowntrend && lastUpperShadow >= lastBodySize * shadowBodyRatio && lastUpperShadow > lastLowerShadow * 2) {
      return {
        triggered: true,
        direction: 'SHORT',
        reason: `[PA信号] 看跌Pin Bar：上影线(${lastUpperShadow.toFixed(4)})是实体(${lastBodySize.toFixed(4)})的${(lastUpperShadow/lastBodySize).toFixed(1)}倍，下降趋势确认，反转做空`
      };
    }
  }
  
  let reason = '未触发Pin Bar信号';
  if (!isUptrend && !isDowntrend) {
    reason = '未触发Pin Bar信号：当前为震荡趋势，不满足趋势条件';
  } else if (isUptrend) {
    reason = '未触发Pin Bar信号：上升趋势仅允许看涨Pin Bar';
  } else if (isDowntrend) {
    reason = '未触发Pin Bar信号：下降趋势仅允许看跌Pin Bar';
  }
  
  return { triggered: false, direction: null, reason };
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
  config?: BotConfig,
  price?: number,
  emaFast?: number,
  emaSlow?: number
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
  if (paConfig.pinBarEnabled && price !== undefined && emaFast !== undefined && emaSlow !== undefined) {
    const pinBarResult = detectPinBar(lastCandle, paConfig, emaFast, emaSlow, price);
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
