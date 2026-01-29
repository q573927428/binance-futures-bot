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
 * 快速杠杆计算（极简模式）
 * 只基于AI置信度和风险等级
 */
export function calculateQuickLeverage(
  aiAnalysis: AIAnalysis,
  config: DynamicLeverageConfig
): number {
  // 基础杠杆
  let leverage = config.baseLeverage
  
  // AI置信度调整：置信度越高，杠杆越高
  // 置信度0-100 -> 乘数0.5-1.5
  const confidenceFactor = 0.5 + (aiAnalysis.confidence / 100) * 1.0
  leverage *= confidenceFactor
  
  // 风险等级调整：风险越低，杠杆越高
  const riskFactor = config.riskLevelMultipliers[aiAnalysis.riskLevel] || 1.0
  leverage *= riskFactor
  
  // 确保在范围内并取整
  leverage = Math.max(config.minLeverage, Math.min(config.maxLeverage, leverage))
  return Math.round(leverage)
}

/**
 * 计算安全杠杆倍数（考虑账户风险）
 * 基于止损距离计算最大安全杠杆
 */
export function calculateSafeLeverage(
  accountBalance: number,
  maxRiskPercentage: number,
  stopLossPrice: number,
  entryPrice: number
): number {
  if (accountBalance <= 0) return 1
  
  // 计算止损距离（价格百分比）
  const stopLossDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice
  
  if (stopLossDistance === 0) return 1
  
  // 安全杠杆 = (最大风险百分比/100) / 止损距离
  const safeLeverage = (maxRiskPercentage / 100) / stopLossDistance
  
  // 确保杠杆为正数且合理（1-20倍）
  return Math.max(1, Math.min(20, Math.round(safeLeverage)))
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