import type { Position, TradeHistory, BotState } from '../../../../types'
import { calculateNetPnL } from '../../../utils/risk'
import { addTradeHistory } from '../../../utils/storage'

/**
 * 记录交易历史
 */
export async function recordTrade(
  position: Position,
  exitPrice: number,
  reason: string,
  feeRate: number
): Promise<{ pnl: number; updatedState: BotState | null }> {
  // 计算含手续费的盈亏
  const { pnl, pnlPercentage, entryFee, exitFee } = calculateNetPnL(exitPrice, position, feeRate)

  // 记录交易历史
  const trade: TradeHistory = {
    id: `${Date.now()}-${position.symbol}`,
    symbol: position.symbol,
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: position.quantity,
    leverage: position.leverage,
    pnl,  // 使用净盈亏（已扣除手续费）
    pnlPercentage,  // 使用含手续费的盈亏百分比
    entryFee,  // 记录开仓手续费
    exitFee,  // 记录平仓手续费
    openTime: position.openTime,
    closeTime: Date.now(),
    reason,
  }

  // 添加交易历史并返回更新后的状态
  const updatedState = await addTradeHistory(trade)
  
  return { pnl, updatedState }
}
