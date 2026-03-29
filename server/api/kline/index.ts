import { KLineSyncService } from '../../modules/kline-sync'
import { getKLineData, getStoredSymbols } from '../../utils/kline-storage'
import type { KLineQueryParams, KLineApiResponse } from '../../../types/kline'

// 创建K线同步服务实例
const klineSyncService = new KLineSyncService()

export default defineEventHandler(async (event) => {
  const method = event.method
  
  try {
    if (method === 'GET') {
      return handleGetRequest(event)
    } else if (method === 'POST') {
      return handlePostRequest(event)
    } else {
      return createErrorResponse('不支持的请求方法', 405)
    }
  } catch (error: any) {
    console.error('K线API处理错误:', error)
    return createErrorResponse(`服务器错误: ${error.message}`, 500)
  }
})

// 处理GET请求
async function handleGetRequest(event: any) {
  const query = getQuery(event)
  const { symbol, timeframe, limit, from, to } = query
  
  // 验证必需参数
  if (!symbol || !timeframe) {
    return createErrorResponse('缺少必需参数: symbol 和 timeframe', 400)
  }
  
  // 验证timeframe
  const validTimeframes = ['15m', '1h', '4h', '1d', '1w']
  if (!validTimeframes.includes(timeframe as string)) {
    return createErrorResponse(`无效的timeframe: ${timeframe}，有效值: ${validTimeframes.join(', ')}`, 400)
  }
  
  // 解析可选参数
  const params: KLineQueryParams = {
    symbol: symbol as string,
    timeframe: timeframe as any,
    limit: limit ? parseInt(limit as string) : undefined,
    from: from ? parseInt(from as string) : undefined,
    to: to ? parseInt(to as string) : undefined
  }
  
  try {
    // 获取K线数据
    const klineData = getKLineData(params.symbol, params.timeframe, {
      limit: params.limit || 20000,
      from: params.from,
      to: params.to
    })
    
    if (klineData.length === 0) {
      return createSuccessResponse({
        symbol: params.symbol,
        timeframe: params.timeframe,
        data: [],
        metadata: {
          firstTimestamp: 0,
          lastTimestamp: 0,
          count: 0,
          hasMore: false
        }
      }, '没有找到K线数据')
    }
    
    // 准备响应数据
    const responseData = {
      symbol: params.symbol,
      timeframe: params.timeframe,
      data: klineData,
      metadata: {
        firstTimestamp: klineData[0]?.timestamp || 0,
        lastTimestamp: klineData[klineData.length - 1]?.timestamp || 0,
        count: klineData.length,
        hasMore: klineData.length >= (params.limit || 20000)
      }
    }
    
    return createSuccessResponse(responseData, '获取K线数据成功')
    
  } catch (error: any) {
    console.error(`获取K线数据失败: ${params.symbol}/${params.timeframe}`, error)
    return createErrorResponse(`获取K线数据失败: ${error.message}`, 500)
  }
}

// 处理POST请求
async function handlePostRequest(event: any) {
  const body = await readBody(event)
  const { action, symbol, timeframe, force, initialBars } = body
  
  if (!action) {
    return createErrorResponse('缺少必需参数: action', 400)
  }
  
  try {
    switch (action) {
      case 'sync':
        return await handleSyncAction(symbol, timeframe, force, initialBars)
      
      case 'sync-all':
        return await handleSyncAllAction(force)
      
      case 'status':
        return await handleStatusAction(symbol, timeframe)
      
      case 'stored-symbols':
        return await handleStoredSymbolsAction()
      
      case 'fill-gaps':
        return await handleFillGapsAction(symbol, timeframe)
      
      default:
        return createErrorResponse(`不支持的操作: ${action}`, 400)
    }
  } catch (error: any) {
    console.error(`处理POST请求失败: ${action}`, error)
    return createErrorResponse(`操作失败: ${error.message}`, 500)
  }
}

// 处理同步操作
async function handleSyncAction(
  symbol?: string, 
  timeframe?: string, 
  force?: boolean,
  initialBars?: number
) {
  if (!symbol || !timeframe) {
    return createErrorResponse('同步操作需要 symbol 和 timeframe 参数', 400)
  }
  
  // 验证timeframe
  const validTimeframes = ['15m', '1h', '4h', '1d', '1w']
  if (!validTimeframes.includes(timeframe)) {
    return createErrorResponse(`无效的timeframe: ${timeframe}，有效值: ${validTimeframes.join(', ')}`, 400)
  }
  
  try {
    const result = await klineSyncService.syncSymbolKLine(
      symbol,
      timeframe as any,
      { force: !!force, initialBars }
    )
    
    if (result.success) {
      return createSuccessResponse(result, result.message)
    } else {
      return createErrorResponse(result.message, 500)
    }
  } catch (error: any) {
    console.error(`同步K线数据失败: ${symbol}/${timeframe}`, error)
    return createErrorResponse(`同步失败: ${error.message}`, 500)
  }
}

// 处理同步所有操作
async function handleSyncAllAction(force?: boolean) {
  try {
    const results = await klineSyncService.syncAllKLine({ force: !!force })
    
    // 统计结果
    const successCount = results.filter(r => r.success).length
    const totalCount = results.reduce((sum, r) => sum + r.count, 0)
    
    return createSuccessResponse({
      results,
      summary: {
        totalTasks: results.length,
        successTasks: successCount,
        failedTasks: results.length - successCount,
        totalBars: totalCount
      }
    }, `同步完成: ${successCount}/${results.length} 成功，共获取 ${totalCount} 条数据`)
  } catch (error: any) {
    console.error('同步所有K线数据失败', error)
    return createErrorResponse(`同步所有失败: ${error.message}`, 500)
  }
}

// 处理状态查询操作
async function handleStatusAction(symbol?: string, timeframe?: string) {
  try {
    if (symbol && timeframe) {
      // 查询特定交易对和周期的状态
      const status = klineSyncService.getSymbolSyncStatus(symbol, timeframe as any)
      
      if (!status) {
        return createErrorResponse(`未找到状态信息: ${symbol}/${timeframe}`, 404)
      }
      
      return createSuccessResponse(status, '获取状态成功')
    } else {
      // 查询所有状态
      const allStatus = klineSyncService.getSyncStatus()
      const config = klineSyncService.getConfig()
      
      return createSuccessResponse({
        status: allStatus,
        config,
        summary: {
          totalSymbols: config.symbols.length,
          totalTimeframes: config.timeframes.length,
          totalTasks: allStatus.length,
          syncingCount: allStatus.filter(s => s.status === 'syncing').length,
          errorCount: allStatus.filter(s => s.status === 'error').length
        }
      }, '获取所有状态成功')
    }
  } catch (error: any) {
    console.error('获取状态失败', error)
    return createErrorResponse(`获取状态失败: ${error.message}`, 500)
  }
}

// 处理已存储交易对查询操作
async function handleStoredSymbolsAction() {
  try {
    const storedSymbols = getStoredSymbols()
    
    // 获取每个交易对的详细信息
    const detailedSymbols = storedSymbols.map(symbolInfo => {
      const timeframesInfo = symbolInfo.timeframes.map(timeframe => {
        const status = klineSyncService.getSymbolSyncStatus(symbolInfo.symbol, timeframe)
        return {
          timeframe,
          status: status?.status || 'unknown',
          lastSyncTime: status?.lastSyncTime || 0,
          totalBars: status?.totalBars || 0
        }
      })
      
      return {
        symbol: symbolInfo.symbol,
        timeframes: timeframesInfo
      }
    })
    
    return createSuccessResponse({
      symbols: detailedSymbols,
      totalSymbols: storedSymbols.length,
      totalTimeframes: storedSymbols.reduce((sum, s) => sum + s.timeframes.length, 0)
    }, '获取已存储交易对成功')
  } catch (error: any) {
    console.error('获取已存储交易对失败', error)
    return createErrorResponse(`获取已存储交易对失败: ${error.message}`, 500)
  }
}

// 处理数据缺口补全操作
async function handleFillGapsAction(symbol?: string, timeframe?: string) {
  if (!symbol || !timeframe) {
    return createErrorResponse('补全数据缺口需要 symbol 和 timeframe 参数', 400)
  }
  
  // 验证timeframe
  const validTimeframes = ['15m', '1h', '4h', '1d', '1w']
  if (!validTimeframes.includes(timeframe)) {
    return createErrorResponse(`无效的timeframe: ${timeframe}，有效值: ${validTimeframes.join(', ')}`, 400)
  }
  
  try {
    const result = await klineSyncService.fillDataGaps(symbol, timeframe as any)
    
    if (result.success) {
      return createSuccessResponse(result, result.message)
    } else {
      return createErrorResponse(result.message, 500)
    }
  } catch (error: any) {
    console.error(`补全数据缺口失败: ${symbol}/${timeframe}`, error)
    return createErrorResponse(`补全数据缺口失败: ${error.message}`, 500)
  }
}

// 创建成功响应
function createSuccessResponse(data: any, message: string = '操作成功'): KLineApiResponse {
  return {
    success: true,
    message,
    data
  }
}

// 创建错误响应
function createErrorResponse(message: string, statusCode: number = 400): KLineApiResponse {
  return {
    success: false,
    message
  }
}