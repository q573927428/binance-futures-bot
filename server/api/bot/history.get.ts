import { getFuturesBot } from '../../modules/futures-bot'

export default defineEventHandler(async (event) => {
  try {
    const bot = getFuturesBot()
    const history = await bot.getHistory()
    
    return {
      success: true,
      data: history,
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || '获取历史失败',
    }
  }
})
