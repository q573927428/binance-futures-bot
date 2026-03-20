import { getFuturesBot } from '../../modules/futures-bot'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const config = useRuntimeConfig()
    
    const { password, reason = '手动平仓' } = body
    const configPassword = config.configEditPassword
    
    // 如果设置了密码，需要验证
    if (configPassword && configPassword.length > 0) {
      if (password !== configPassword) {
        return {
          success: false,
          message: '密码错误',
        }
      }
    }
    
    // 获取机器人实例
    const bot = getFuturesBot()
    const state = bot.getState()
    
    // 检查是否有持仓
    if (!state.currentPosition) {
      return {
        success: false,
        message: '当前没有持仓',
      }
    }
    
    // 执行平仓
    // 使用内部方法执行平仓，需要访问私有方法
    // 通过调用 bot 的相关方法来执行平仓
    const position = state.currentPosition
    
    // 获取 binance 服务和 positionCloser
    const binance = bot.getBinanceService()
    
    // 导入平仓器
    const { PositionCloser } = await import('../../modules/futures-bot/trading/position-closer')
    const positionCloser = new PositionCloser(binance, bot.getConfig(), state)
    
    // 执行平仓
    await positionCloser.closePosition(position, reason)
    
    // 重新获取最新状态
    const newState = bot.getState()
    
    return {
      success: true,
      message: '平仓成功',
      state: newState,
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || '平仓失败',
    }
  }
})
