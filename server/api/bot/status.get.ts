import { getFuturesBot } from '../../modules/futures-bot'
import { logger } from '../../utils/logger'
import { getBinanceService } from '../../utils/binance'
import type { CryptoBalance } from '../../../types'

export default defineEventHandler(async (event) => {
  try {
    const bot = getFuturesBot()
    const state = bot.getState()
    const config = bot.getConfig()
    const logs = logger.getRecentLogs(50)
    
    // 获取加密货币余额
    let cryptoBalances: CryptoBalance[] = []
    try {
      const binance = getBinanceService()
      cryptoBalances = await binance.fetchCryptoBalances()
    } catch (error: any) {
      console.warn('获取加密货币余额失败:', error.message)
    }
    
    return {
      success: true,
      data: {
        state,
        config,
        logs,
        cryptoBalances,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || '获取状态失败',
    }
  }
})
