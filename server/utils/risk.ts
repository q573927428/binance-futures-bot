import type { CircuitBreaker, Position, BotConfig } from '../../types'
import dayjs from 'dayjs'

/**
 * 检查熔断条件
 */
export function checkCircuitBreaker(
  dailyPnL: number,
  consecutiveLosses: number,
  accountBalance: number
): CircuitBreaker {
  const dailyLossPercent = (Math.abs(dailyPnL) / accountBalance) * 100

  // 当日亏损 >= 2%
  if (dailyPnL < 0 && dailyLossPercent >= 2) {
    return {
      isTriggered: true,
      reason: `当日亏损达到${dailyLossPercent.toFixed(2)}%，触发熔断`,
      timestamp: Date.now(),
      dailyLoss: dailyLossPercent,
      consecutiveLosses,
    }
  }

  // 连续2笔止损
  if (consecutiveLosses >= 2) {
    return {
      isTriggered: true,
      reason: `连续${consecutiveLosses}笔止损，触发熔断`,
      timestamp: Date.now(),
      dailyLoss: dailyLossPercent,
      consecutiveLosses,
    }
  }

  return {
    isTriggered: false,
    reason: '',
    timestamp: Date.now(),
    dailyLoss: dailyLossPercent,
    consecutiveLosses,
  }
}

/**
 * 检查是否需要重置日期状态
 */
export function shouldResetDailyState(lastResetDate: string): boolean {
  const today = dayjs().format('YYYY-MM-DD')
  return lastResetDate !== today
}

/**
 * 检查是否到了强制平仓时间（23:30）
 */
export function shouldForceLiquidate(): boolean {
  const now = dayjs()
  const hour = now.hour()
  const minute = now.minute()
  
  // 23:30-23:59之间强制平仓
  return hour === 23 && minute >= 30
}

/**
 * 检查持仓是否超时
 */
export function isPositionTimeout(
  position: Position,
  timeoutHours: number,
  adxDecreasing: boolean
): boolean {
  const holdingTime = (Date.now() - position.openTime) / (1000 * 60 * 60) // 小时
  
  return holdingTime >= timeoutHours && adxDecreasing
}

/**
 * 检查是否达到TP1条件（盈亏比1:1）
 */
export function checkTP1Condition(
  currentPrice: number,
  position: Position
): boolean {
  const { entryPrice, stopLoss, direction } = position
  const risk = Math.abs(entryPrice - stopLoss)
  
  if (direction === 'LONG') {
    const profit = currentPrice - entryPrice
    return profit >= risk
  } else {
    const profit = entryPrice - currentPrice
    return profit >= risk
  }
}

/**
 * 检查是否达到TP2条件（盈亏比1:2 或 RSI极值 或 ADX走弱）
 */
export function checkTP2Condition(
  currentPrice: number,
  position: Position,
  rsi: number,
  adx15m: number,
  previousADX15m: number
): boolean {
  const { entryPrice, stopLoss, direction } = position
  const risk = Math.abs(entryPrice - stopLoss)
  
  // 盈亏比1:2
  if (direction === 'LONG') {
    const profit = currentPrice - entryPrice
    if (profit >= risk * 2) return true
  } else {
    const profit = entryPrice - currentPrice
    if (profit >= risk * 2) return true
  }
  
  // RSI极值
  if (direction === 'LONG' && rsi >= 70) return true
  if (direction === 'SHORT' && rsi <= 30) return true
  
  // ADX走弱（下降超过5个点）
  if (previousADX15m - adx15m >= 5) return true
  
  return false
}

/**
 * 计算当前盈亏
 */
export function calculatePnL(
  currentPrice: number,
  position: Position
): { pnl: number; pnlPercentage: number } {
  const { entryPrice, quantity, direction, leverage } = position
  
  let pnl = 0
  if (direction === 'LONG') {
    pnl = (currentPrice - entryPrice) * quantity
  } else {
    pnl = (entryPrice - currentPrice) * quantity
  }
  
  const pnlPercentage = ((pnl / (entryPrice * quantity)) * 100) * leverage
  
  return { pnl, pnlPercentage }
}

/**
 * 检查止损是否被触发
 */
export function isStopLossTriggered(
  currentPrice: number,
  position: Position
): boolean {
  const { stopLoss, direction } = position
  
  if (direction === 'LONG') {
    return currentPrice <= stopLoss
  } else {
    return currentPrice >= stopLoss
  }
}

/**
 * 检查止盈是否被触发
 */
export function isTakeProfitTriggered(
  currentPrice: number,
  position: Position,
  level: 1 | 2
): boolean {
  const targetPrice = level === 1 ? position.takeProfit1 : position.takeProfit2
  const { direction } = position
  
  if (direction === 'LONG') {
    return currentPrice >= targetPrice
  } else {
    return currentPrice <= targetPrice
  }
}

/**
 * 验证交易参数
 */
export function validateTradeParams(
  symbol: string,
  quantity: number,
  price: number,
  stopLoss: number,
  takeProfit: number
): { valid: boolean; reason: string } {
  if (!symbol || symbol.trim() === '') {
    return { valid: false, reason: '交易对不能为空' }
  }
  
  if (quantity <= 0) {
    return { valid: false, reason: '数量必须大于0' }
  }
  
  if (price <= 0) {
    return { valid: false, reason: '价格必须大于0' }
  }
  
  if (stopLoss <= 0) {
    return { valid: false, reason: '止损价格必须大于0' }
  }
  
  if (takeProfit <= 0) {
    return { valid: false, reason: '止盈价格必须大于0' }
  }
  
  return { valid: true, reason: '' }
}

/**
 * 检查每日交易次数限制
 */
export function checkDailyTradeLimit(
  todayTrades: number,
  maxDailyTrades: number = 3
): boolean {
  return todayTrades < maxDailyTrades
}

/**
 * 获取交易方向对应的订单side
 */
export function getOrderSide(
  direction: 'LONG' | 'SHORT',
  isEntry: boolean
): 'buy' | 'sell' {
  if (direction === 'LONG') {
    return isEntry ? 'buy' : 'sell'
  } else {
    return isEntry ? 'sell' : 'buy'
  }
}
