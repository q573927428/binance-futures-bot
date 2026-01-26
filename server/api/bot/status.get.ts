import { getFuturesBot } from '../../modules/futures-bot'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const bot = getFuturesBot()
    const state = bot.getState()
    const config = bot.getConfig()
    const logs = logger.getRecentLogs(50)
    
    return {
      success: true,
      data: {
        state,
        config,
        logs,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || '获取状态失败',
    }
  }
})
