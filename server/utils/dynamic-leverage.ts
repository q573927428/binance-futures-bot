import type { AIAnalysis, TechnicalIndicators, RiskLevel } from '../../types'

/**
 * 动态杠杆配置（极简版）
 */
export interface DynamicLeverageConfig {
  enabled: boolean                    // 启用动态杠杆
  minLeverage: number                 // 最小杠杆倍数 (2)
  maxLeverage: number                 // 最大杠杆倍数 (20)
  baseLeverage: number                // 基础杠杆倍数 (5)
  riskLevelMultipliers: Record<RiskLevel, number> // 风险等级乘数
}

/**
 * 快速杠杆计算（增强版）
 * 基于AI置信度、AI评分和风险等级
 */
export function calculateQuickLeverage(
  aiAnalysis: AIAnalysis,
  config: DynamicLeverageConfig
): number {
  // 基础杠杆
  let leverage = config.baseLeverage
  
  // AI置信度调整：置信度越高，杠杆越高
  // 置信度60-100 -> 乘数0.7-1.5（扩大范围以获得更分散的杠杆）
  const confidenceFactor = 0.7 + ((aiAnalysis.confidence - 60) / 40) * 0.8
  leverage *= confidenceFactor
  
  // AI评分调整：评分越高，杠杆越高
  // 评分60-100 -> 乘数0.6-1.4（扩大范围以获得更分散的杠杆）
  const scoreFactor = 0.6 + ((aiAnalysis.score - 60) / 40) * 0.8
  leverage *= scoreFactor
  
  // 风险等级调整：风险越低，杠杆越高
  const riskFactor = config.riskLevelMultipliers[aiAnalysis.riskLevel] || 1.0
  leverage *= riskFactor
  
  // 确保在范围内并取整
  leverage = Math.max(config.minLeverage, Math.min(config.maxLeverage, leverage))
  return Math.round(leverage)
}

/**
 * 计算安全杠杆倍数（考虑账户风险）
 * 基于止损距离计算最大安全杠杆，根据ADX趋势强度动态调整
 */
export function calculateSafeLeverage(
  accountBalance: number,
  maxRiskPercentage: number,
  stopLossPrice: number,
  entryPrice: number,
  adx15m?: number
): number {

  if (accountBalance <= 0 || entryPrice <= 0) return 1

  // 实际止损距离
  const stopLossDistance =
    Math.abs(entryPrice - stopLossPrice) / entryPrice

  if (stopLossDistance <= 0) return 1

  // ===== 1️⃣ 基础最小止损距离 =====
  const baseStopLoss = 0.015 // 1.5%

  let minStopLossDistance = baseStopLoss

  if (adx15m !== undefined && adx15m >= 0) {

    // 趋势越强 → 因子越小
    // ADX 0–60 → 因子 1.3–0.7
    const trendFactor =
      1.3 - Math.min(adx15m, 60) / 100

    minStopLossDistance = baseStopLoss * trendFactor
  }

  // 限制在合理范围
  minStopLossDistance = Math.max(
    0.01,
    Math.min(0.02, minStopLossDistance)
  )

  // ===== 2️⃣ 取有效止损距离 =====
  const effectiveStopLossDistance =
    Math.max(stopLossDistance, minStopLossDistance)

  // ===== 3️⃣ 计算安全杠杆 =====
  const safeLeverage =
    (maxRiskPercentage / 100) / effectiveStopLossDistance

  // ===== 4️⃣ 限制范围 =====
  return Math.max(1, Math.min(20, Math.floor(safeLeverage)))
}
/**
 * 综合计算最终杠杆（结合动态杠杆和安全杠杆）
 * 取两者中的较小值，确保安全
 */
export function calculateFinalLeverage(
  dynamicLeverage: number,
  safeLeverage: number,
  config: DynamicLeverageConfig
): number {
  // 取动态杠杆和安全杠杆中的较小值
  const finalLeverage = Math.min(dynamicLeverage, safeLeverage)
  
  // 确保在配置范围内
  return Math.max(config.minLeverage, Math.min(config.maxLeverage, finalLeverage))
}