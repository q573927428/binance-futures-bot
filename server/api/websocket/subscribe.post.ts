import { webSocketManager } from '../../../server/utils/websocket-manager'
import type { ApiResponse } from '../../../types'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbols } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      const response: ApiResponse = {
        success: false,
        message: '请提供有效的交易对数组'
      }
      return response
    }

    // 确保WebSocket已连接
    await webSocketManager.initialize()

    // 实际订阅价格数据
    // 创建一个回调函数来接收价格更新
    const priceCallback = (priceData: any) => {
      // 这里可以处理价格更新，例如记录日志或触发其他操作
      console.log(`📈 收到价格更新: ${priceData.symbol} = ${priceData.price}`)
    }

    // 订阅所有交易对
    webSocketManager.subscribePrices(symbols, priceCallback)
    
    const state = webSocketManager.getWebSocketState()
    const prices = new Map<string, any>()
    
    // 获取当前价格（如果有缓存）
    symbols.forEach(symbol => {
      const price = webSocketManager.getPrice(symbol)
      if (price) {
        prices.set(symbol, price)
      }
    })

    const response: ApiResponse = {
      success: true,
      message: `已订阅 ${symbols.length} 个交易对`,
      data: {
        subscribedSymbols: symbols,
        currentPrices: Object.fromEntries(prices),
        webSocketState: state
      }
    }
    
    return response
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      message: `订阅价格失败: ${error.message}`
    }
    
    return response
  }
})
