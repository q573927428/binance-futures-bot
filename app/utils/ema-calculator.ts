/**
 * EMA计算工具函数
 * 用于在客户端计算EMA值
 */

/**
 * 计算EMA值
 * @param prices 价格数组（通常是收盘价）
 * @param period EMA周期
 * @returns EMA值数组，长度与输入相同
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0 || period <= 0) {
    return []
  }

  const emaValues: number[] = []
  const multiplier = 2 / (period + 1)

  // 第一个EMA是简单移动平均
  let sum = 0
  for (let i = 0; i < Math.min(period, prices.length); i++) {
    sum += prices[i] || 0
  }
  
  const firstSMA = sum / Math.min(period, prices.length)
  emaValues.push(firstSMA)

  // 计算后续EMA值
  for (let i = 1; i < prices.length; i++) {
    const currentPrice = prices[i] || 0
    const previousEMA = emaValues[i - 1] || 0
    const currentEMA = (currentPrice - previousEMA) * multiplier + previousEMA
    emaValues.push(currentEMA)
  }

  return emaValues
}

/**
 * 计算EMA并返回与时间戳对齐的数据
 * @param klineData K线数据数组
 * @param period EMA周期
 * @param priceField 使用的价格字段，默认为收盘价'c'
 * @returns 包含时间和值的EMA数据数组
 */
export function calculateEMASeries(
  klineData: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>,
  period: number,
  priceField: 'c' | 'o' | 'h' | 'l' = 'c'
): Array<{ time: number; value: number }> {
  if (klineData.length < period) {
    return []
  }

  const prices = klineData.map(item => item[priceField])
  const emaValues = calculateEMA(prices, period)

  // 返回与时间戳对齐的数据
  return klineData.map((item, index) => ({
    time: item.t,
    value: emaValues[index] || 0
  }))
}

/**
 * 计算多个EMA周期
 * @param klineData K线数据数组
 * @param periods EMA周期数组，如[14, 120]
 * @returns 包含多个EMA周期的数据对象
 */
export function calculateMultipleEMAs(
  klineData: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>,
  periods: number[]
): Record<number, Array<{ time: number; value: number }>> {
  const result: Record<number, Array<{ time: number; value: number }>> = {}

  for (const period of periods) {
    result[period] = calculateEMASeries(klineData, period)
  }

  return result
}

/**
 * 获取EMA颜色配置
 * @param period EMA周期
 * @returns 颜色配置
 */
export function getEMAColor(period: number): string {
  const colorMap: Record<number, string> = {
    14: '#298cf3', // 红色 - EMA14
    20: '#4ECDC4', // 青色 - EMA20
    30: '#FF6B6B', // 蓝色 - EMA30
    60: '#96CEB4', // 绿色 - EMA60
    120: '#f3ab23', // 黄色 - EMA120
    200: '#DDA0DD'  // 紫色 - EMA200
  }

  return colorMap[period] || '#FFFFFF'
}

/**
 * 获取EMA线宽配置
 * @param period EMA周期
 * @returns 线宽
 */
export function getEMAWidth(period: number): number {
  const widthMap: Record<number, number> = {
    14: 2,
    20: 2,
    30: 2,
    60: 2,
    120: 2.5,
    200: 3
  }

  return widthMap[period] || 1.5
}