import type { AIAnalysis, TechnicalIndicators, RiskLevel } from '../../types'

/**
 * 动态杠杆配置
 */
export interface DynamicLeverageConfig {
  enabled: boolean                    // 启用动态杠杆
  minLeverage: number                 // 最小杠杆倍数 (2)
  maxLeverage: number                 // 最大杠杆倍数 (20)
  baseLeverage: number                // 基础杠杆倍数 (2)
  aiConfidenceWeight: number          // AI置信度权重 (0.3)
  aiScoreWeight: number               // AI评分权重 (0.4)
  riskLevelWeights: Record<RiskLevel, number> // 风险等级权重
  volatilityPenaltyFactor: number     // 波动性惩罚因子 (0.5)
  maxVolatilityThreshold: number      // 最大波动性阈值 (0.03 = 3%)
  useMarketConditionAdjustment: boolean // 使用市场条件调整
}

/**
 * 默认动态杠杆配置
 */
export const defaultDynamicLeverageConfig: DynamicLeverageConfig = {
  enabled: true,
  minLeverage: 2,
  maxLeverage: 20,
  baseLeverage: 2,
  aiConfidenceWeight: 0.3,
  aiScoreWeight: 0.4,
  riskLevelWeights: {
    LOW: 1.0,
    MEDIUM: 0.7,
    HIGH: 0.4,
  },
  volatilityPenaltyFactor: 0.5,
  maxVolatilityThreshold: 0.03, // 3%
  useMarketConditionAdjustment: true,
}

/**
 * 计算动态杠杆倍数
 * @param aiAnalysis AI分析结果
 * @param indicators 技术指标
 * @param currentPrice 当前价格
 * @param config 动态杠杆配置
 * @returns 计算后的杠杆倍数
 */
export function calculateDynamicLeverage(
  aiAnalysis: AIAnalysis,
  indicators: TechnicalIndicators,
  currentPrice: number,
  config: DynamicLeverageConfig = defaultDynamicLeverageConfig
): number {
  // 1. 计算AI因素得分
  const aiConfidenceScore = aiAnalysis.confidence / 100 // 归一化到0-1
  const aiScoreNormalized = aiAnalysis.score / 100 // 归一化到0-1
  
  // AI综合得分 = 置信度权重 * 置信度 + 评分权重 * 评分
  const aiCompositeScore = 
    config.aiConfidenceWeight * aiConfidenceScore + 
    config.aiScoreWeight * aiScoreNormalized
  
  // 2. 应用风险等级权重
  const riskWeight = config.riskLevelWeights[aiAnalysis.riskLevel] || 0.5
  
  // 3. 计算波动性惩罚
  const volatilityPenalty = calculateVolatilityPenalty(
    indicators.atr,
    currentPrice,
    config.maxVolatilityThreshold,
    config.volatilityPenaltyFactor
  )
  
  // 4. 计算最终杠杆倍数
  let leverage = config.baseLeverage
  
  // 根据AI综合得分增加杠杆
  leverage += (config.maxLeverage - config.baseLeverage) * aiCompositeScore * riskWeight
  
  // 应用波动性惩罚
  leverage *= volatilityPenalty
  
  // 确保在最小和最大杠杆之间
  leverage = Math.max(config.minLeverage, Math.min(config.maxLeverage, leverage))
  
  // 取整到最接近的整数
  leverage = Math.round(leverage)
  
  return leverage
}

/**
 * 计算波动性惩罚因子
 * @param atr 平均真实波幅
 * @param currentPrice 当前价格
 * @param maxThreshold 最大波动性阈值 (例如 0.03 = 3%)
 * @param penaltyFactor 惩罚因子
 * @returns 波动性惩罚因子 (0-1之间)
 */
function calculateVolatilityPenalty(
  atr: number,
  currentPrice: number,
  maxThreshold: number,
  penaltyFactor: number
): number {
  if (currentPrice === 0) return 1
  
  // 计算ATR相对于价格的百分比
  const atrPercentage = atr / currentPrice
  
  // 如果波动性低于阈值，不惩罚
  if (atrPercentage <= maxThreshold) {
    return 1
  }
  
  // 计算惩罚因子：波动性越高，惩罚越大
  const excessVolatility = atrPercentage - maxThreshold
  const penalty = 1 - (excessVolatility / maxThreshold) * penaltyFactor
  
  // 确保惩罚因子在0.1-1之间
  return Math.max(0.1, Math.min(1, penalty))
}

/**
 * 根据市场条件调整动态杠杆配置
 * @param marketCondition 市场条件 ('bullish' | 'bearish' | 'volatile' | 'stable')
 * @param baseConfig 基础配置
 * @returns 调整后的配置
 */
export function adjustLeverageConfigForMarketCondition(
  marketCondition: 'bullish' | 'bearish' | 'volatile' | 'stable',
  baseConfig: DynamicLeverageConfig = defaultDynamicLeverageConfig
): DynamicLeverageConfig {
  const config = { ...baseConfig }
  
  switch (marketCondition) {
    case 'bullish':
      // 牛市：稍微提高最大杠杆，降低波动性惩罚
      config.maxLeverage = Math.min(25, config.maxLeverage + 2)
      config.volatilityPenaltyFactor = Math.max(0.3, config.volatilityPenaltyFactor - 0.1)
      break
      
    case 'bearish':
      // 熊市：降低最大杠杆，提高波动性惩罚
      config.maxLeverage = Math.max(15, config.maxLeverage - 3)
      config.volatilityPenaltyFactor = Math.min(0.8, config.volatilityPenaltyFactor + 0.2)
      break
      
    case 'volatile':
      // 高波动市场：大幅降低最大杠杆，提高波动性惩罚
      config.maxLeverage = Math.max(10, config.maxLeverage - 5)
      config.volatilityPenaltyFactor = Math.min(0.9, config.volatilityPenaltyFactor + 0.3)
      config.maxVolatilityThreshold = Math.max(0.02, config.maxVolatilityThreshold - 0.005)
      break
      
    case 'stable':
      // 稳定市场：稍微提高最大杠杆，降低波动性惩罚
      config.maxLeverage = Math.min(22, config.maxLeverage + 1)
      config.volatilityPenaltyFactor = Math.max(0.4, config.volatilityPenaltyFactor - 0.1)
      config.maxVolatilityThreshold = Math.min(0.04, config.maxVolatilityThreshold + 0.005)
      break
  }
  
  return config
}

/**
 * 判断市场条件
 * @param indicators 技术指标
 * @param priceChange24h 24小时价格变化
 * @returns 市场条件
 */
export function determineMarketCondition(
  indicators: TechnicalIndicators,
  priceChange24h: number
): 'bullish' | 'bearish' | 'volatile' | 'stable' {
  // 判断趋势
  const isBullish = priceChange24h > 0
  const isBearish = priceChange24h < -2 // 下跌超过2%
  
  // 判断波动性 (使用ATR相对于价格的百分比)
  const atrPercentage = indicators.atr / indicators.ema20
  const isVolatile = atrPercentage > 0.025 // ATR超过2.5%
  const isStable = atrPercentage < 0.01 // ATR低于1%
  
  if (isVolatile) return 'volatile'
  if (isStable) return 'stable'
  if (isBullish) return 'bullish'
  if (isBearish) return 'bearish'
  
  return 'stable' // 默认
}

/**
 * 计算安全杠杆倍数（考虑账户风险）
 * @param accountBalance 账户余额
 * @param maxRiskPercentage 最大风险百分比
 * @param stopLossPrice 止损价格
 * @param entryPrice 入场价格
 * @returns 安全杠杆倍数
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
  
  // 计算安全杠杆 = (最大风险百分比/100) / 止损距离
  // 这个公式基于：风险金额 = 账户余额 × 风险百分比
  // 仓位大小 = 风险金额 / 止损距离
  // 安全杠杆 = 仓位大小 / 账户余额 = (风险金额 / 止损距离) / 账户余额
  //          = (账户余额 × 风险百分比/100) / (止损距离 × 账户余额)
  //          = (风险百分比/100) / 止损距离
  const safeLeverage = (maxRiskPercentage / 100) / stopLossDistance
  
  // 确保杠杆为正数且合理
  return Math.max(1, Math.min(20, Math.round(safeLeverage)))
}

/**
 * 综合计算最终杠杆（结合动态杠杆和安全杠杆）
 * @param dynamicLeverage 动态杠杆
 * @param safeLeverage 安全杠杆
 * @param config 动态杠杆配置
 * @returns 最终杠杆倍数
 */
export function calculateFinalLeverage(
  dynamicLeverage: number,
  safeLeverage: number,
  config: DynamicLeverageConfig = defaultDynamicLeverageConfig
): number {
  // 取动态杠杆和安全杠杆中的较小值
  const finalLeverage = Math.min(dynamicLeverage, safeLeverage)
  
  // 确保在配置范围内
  return Math.max(config.minLeverage, Math.min(config.maxLeverage, finalLeverage))
}