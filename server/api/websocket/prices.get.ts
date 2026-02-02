import { webSocketManager } from '../../../server/utils/websocket-manager'
import type { ApiResponse } from '../../../types'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { symbols } = query

    let symbolList: string[] = []
    
    if (symbols) {
      if (typeof symbols === 'string') {
        symbolList = symbols.split(',').map(s => s.trim())
      } else if (Array.isArray(symbols)) {
        symbolList = symbols.map(s => String(s).trim())
      }
    }

    // 确保WebSocket已连接
    await webSocketManager.initialize()

    const allPrices = webSocketManager.getAllPrices()
    const state = webSocketManager.getWebSocketState()

    let filteredPrices: Record<string, any> = {}
    
    if (symbolList.length > 0) {
      // 返回指定交易对的价格
      symbolList.forEach(symbol => {
        const price = allPrices.get(symbol)
        if (price) {
          filteredPrices[symbol] = price
        }
      })
    } else {
      // 返回所有价格
      allPrices.forEach((price, symbol) => {
        filteredPrices[symbol] = price
      })
    }

    const response: ApiResponse = {
      success: true,
      message: `获取到 ${Object.keys(filteredPrices).length} 个交易对的价格`,
      data: {
        prices: filteredPrices,
        timestamp: Date.now(),
        webSocketState: state
      }
    }
    
    return response
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      message: `获取价格失败: ${error.message}`
    }
    
    return response
  }
})