import { webSocketManager } from '../../../server/utils/websocket-manager'
import type { ApiResponse } from '../../../types'

// 存储客户端回调函数的映射（与subscribe共享）
// 格式: { [clientId]: { [symbol]: callback } }
const clientCallbacks = new Map<string, Map<string, (data: any) => void>>()

// 存储客户端最后活动时间（与subscribe共享）
const clientLastActivity = new Map<string, number>()

// 生成客户端ID
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 清理过期客户端（超过5分钟没有活动）
function cleanupExpiredClients(): void {
  const now = Date.now()
  const expirationTime = 5 * 60 * 1000 // 5分钟
  
  for (const [clientId, lastActivity] of clientLastActivity.entries()) {
    if (now - lastActivity > expirationTime) {
      const symbolCallbacks = clientCallbacks.get(clientId)
      if (symbolCallbacks) {
        // 取消订阅所有交易对
        for (const [symbol, callback] of symbolCallbacks.entries()) {
          webSocketManager.unsubscribePrice(symbol, callback)
          console.log(`🗑️  清理过期客户端 ${clientId} 的订阅: ${symbol}`)
        }
        clientCallbacks.delete(clientId)
      }
      clientLastActivity.delete(clientId)
      console.log(`🗑️  已清理过期客户端: ${clientId}`)
    }
  }
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbols, clientId } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      const response: ApiResponse = {
        success: false,
        message: '请提供有效的交易对数组'
      }
      return response
    }

    if (!clientId) {
      const response: ApiResponse = {
        success: false,
        message: '请提供clientId'
      }
      return response
    }

    // 确保WebSocket已连接
    await webSocketManager.initialize()

    // 清理过期客户端
    cleanupExpiredClients()
    
    // 更新客户端最后活动时间
    clientLastActivity.set(clientId, Date.now())

    // 获取客户端的回调函数映射
    const symbolCallbacks = clientCallbacks.get(clientId)
    
    if (!symbolCallbacks) {
      const response: ApiResponse = {
        success: true,
        message: `客户端 ${clientId} 没有找到订阅记录`,
        data: {
          clientId,
          requestedUnsubscribeSymbols: symbols,
          actualUnsubscribed: []
        }
      }
      return response
    }

    const unsubscribedSymbols: string[] = []

    // 取消订阅每个交易对
    for (const symbol of symbols) {
      const callback = symbolCallbacks.get(symbol)
      if (callback) {
        // 从WebSocket管理器取消订阅
        webSocketManager.unsubscribePrice(symbol, callback)
        
        // 从客户端映射中移除
        symbolCallbacks.delete(symbol)
        unsubscribedSymbols.push(symbol)
        
        console.log(`✅ 客户端 ${clientId} 取消订阅: ${symbol}`)
      }
    }

    // 如果客户端没有更多订阅，清理映射
    if (symbolCallbacks.size === 0) {
      clientCallbacks.delete(clientId)
      console.log(`🗑️  清理客户端 ${clientId} 的订阅记录`)
    }

    const state = webSocketManager.getWebSocketState()

    const response: ApiResponse = {
      success: true,
      message: `取消订阅完成: ${unsubscribedSymbols.length} 个交易对`,
      data: {
        clientId,
        requestedUnsubscribeSymbols: symbols,
        actualUnsubscribed: unsubscribedSymbols,
        remainingSubscriptions: symbolCallbacks ? Array.from(symbolCallbacks.keys()) : [],
        webSocketState: state
      }
    }
    
    return response
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      message: `取消订阅失败: ${error.message}`
    }
    
    return response
  }
})
