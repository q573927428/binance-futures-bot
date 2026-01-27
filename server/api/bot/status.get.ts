import { getFuturesBot } from '../../modules/futures-bot'
import { logger } from '../../utils/logger'
import type { CryptoBalance } from '../../../types'

export default defineEventHandler(async (event) => {
  try {
    const bot = getFuturesBot()
    
    // 如果bot还没有初始化，先初始化（不启动）
    // 这样可以获取账户余额信息
    try {
      await bot.initialize()
    } catch (error: any) {
      // 如果已经初始化过，会继续执行
    }
    
    const state = bot.getState()
    const botConfig = bot.getConfig()
    const logs = logger.getRecentLogs(50)
    
    // 获取加密货币余额
    let cryptoBalances: CryptoBalance[] = []
    try {
      const binance = bot.getBinanceService()
      cryptoBalances = await binance.fetchCryptoBalances()
    } catch (error: any) {
      // 静默处理错误，返回空数组
    }
    
    return {
      success: true,
      data: {
        state,
        config: botConfig,
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
