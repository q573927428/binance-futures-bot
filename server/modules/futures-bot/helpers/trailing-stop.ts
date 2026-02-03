import type { Position, TrailingStopConfig } from '../../../../types'
import { logger } from '../../../utils/logger'

/**
 * 计算移动止损价格
 */
export function calculateTrailingStopLoss(
  currentPrice: number,
  position: Position,
  atr: number,
  config: TrailingStopConfig
): {
  newStopLoss: number | null
  shouldUpdate: boolean
  reason: string
  data: any
} {
  const { entryPrice, stopLoss, direction } = position
  
  // 计算初始风险
  const initialRisk = Math.abs(entryPrice - stopLoss)
  
  // 计算当前盈利
  let currentProfit = 0
  if (direction === 'LONG') {
    currentProfit = currentPrice - entryPrice
  } else if (direction === 'SHORT') {
    currentProfit = entryPrice - currentPrice
  } else {
    return {
      newStopLoss: null,
      shouldUpdate: false,
      reason: '持仓方向无效',
      data: {}
    }
  }
  
  // 计算盈亏比
  const profitRiskRatio = initialRisk > 0 ? currentProfit / initialRisk : 0
  
  // 检查是否达到激活条件
  if (profitRiskRatio < config.activationRatio) {
    return {
      newStopLoss: null,
      shouldUpdate: false,
      reason: `盈亏比 ${profitRiskRatio.toFixed(2)} 未达到激活条件 ${config.activationRatio}`,
      data: {
        currentPrice,
        entryPrice,
        currentStopLoss: stopLoss,
        currentProfit,
        profitRiskRatio,
        activationRatio: config.activationRatio
      }
    }
  }
  
  // 计算跟踪距离
  const trailingDistance = atr * config.trailingDistance
  
  // 计算新止损价格
  let newStopLoss: number
  if (direction === 'LONG') {
    // 多头：新止损 = 当前价 - 跟踪距离
    newStopLoss = currentPrice - trailingDistance
  } else {
    // 空头：新止损 = 当前价 + 跟踪距离
    newStopLoss = currentPrice + trailingDistance
  }
  
  // 确保新止损不会低于当前止损（只向有利方向移动）
  let shouldUpdate = false
  if (direction === 'LONG') {
    if (newStopLoss > stopLoss) {
      shouldUpdate = true
    } else {
      newStopLoss = stopLoss // 保持当前止损
    }
  } else {
    if (newStopLoss < stopLoss) {
      shouldUpdate = true
    } else {
      newStopLoss = stopLoss // 保持当前止损
    }
  }
  
  // 计算止损移动的距离
  const stopLossMove = Math.abs(newStopLoss - stopLoss)
  const stopLossMovePercent = (stopLossMove / entryPrice) * 100
  
  return {
    newStopLoss,
    shouldUpdate,
    reason: shouldUpdate 
      ? `移动止损：从 ${stopLoss.toFixed(2)} → ${newStopLoss.toFixed(2)} (移动 ${stopLossMovePercent.toFixed(2)}%)`
      : `止损保持不变：${stopLoss.toFixed(2)}`,
    data: {
      direction,
      currentPrice,
      entryPrice,
      oldStopLoss: stopLoss,
      newStopLoss,
      trailingDistance,
      atr,
      currentProfit,
      profitRiskRatio,
      stopLossMove,
      stopLossMovePercent
    }
  }
}

/**
 * 检查是否需要更新止损（考虑更新间隔）
 */
export function shouldUpdateTrailingStop(
  lastUpdateTime: number,
  updateIntervalSeconds: number
): boolean {
  const now = Date.now()
  const elapsedSeconds = (now - lastUpdateTime) / 1000
  return elapsedSeconds >= updateIntervalSeconds
}
