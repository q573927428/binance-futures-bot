import { 
  getKLineSyncScheduler, 
  startKLineSyncScheduler, 
  stopKLineSyncScheduler, 
  getSchedulerStatus 
} from '../../modules/kline-sync/scheduler'

export default defineEventHandler(async (event) => {
  const method = event.method
  
  try {
    if (method === 'GET') {
      return handleGetRequest()
    } else if (method === 'POST') {
      return handlePostRequest(event)
    } else {
      return createErrorResponse('不支持的请求方法', 405)
    }
  } catch (error: any) {
    console.error('K线调度器API处理错误:', error)
    return createErrorResponse(`服务器错误: ${error.message}`, 500)
  }
})

// 处理GET请求
async function handleGetRequest() {
  try {
    const status = getSchedulerStatus()
    return createSuccessResponse(status, '获取调度器状态成功')
  } catch (error: any) {
    console.error('获取调度器状态失败:', error)
    return createErrorResponse(`获取状态失败: ${error.message}`, 500)
  }
}

// 处理POST请求
async function handlePostRequest(event: any) {
  const body = await readBody(event)
  const { action, intervalSeconds, force } = body
  
  if (!action) {
    return createErrorResponse('缺少必需参数: action', 400)
  }
  
  try {
    switch (action) {
      case 'start':
        return await handleStartAction(intervalSeconds)
      
      case 'stop':
        return await handleStopAction()
      
      case 'status':
        return await handleStatusAction()
      
      case 'trigger':
        return await handleTriggerAction(force)
      
      case 'config':
        return await handleConfigAction(body)
      
      default:
        return createErrorResponse(`不支持的操作: ${action}`, 400)
    }
  } catch (error: any) {
    console.error(`处理POST请求失败: ${action}`, error)
    return createErrorResponse(`操作失败: ${error.message}`, 500)
  }
}

// 处理启动操作
async function handleStartAction(intervalSeconds?: number) {
  try {
    const scheduler = getKLineSyncScheduler()
    
    // 检查是否已经在运行
    const status = scheduler.getStatus()
    if (status.isRunning) {
      return createSuccessResponse(
        { 
          message: '调度器已经在运行中',
          ...status 
        }, 
        '调度器已经在运行中'
      )
    }
    
    // 启动调度器
    startKLineSyncScheduler(intervalSeconds || 300)
    
    // 获取更新后的状态
    const newStatus = getSchedulerStatus()
    
    return createSuccessResponse(
      { 
        message: '调度器启动成功',
        ...newStatus 
      }, 
      '调度器启动成功'
    )
  } catch (error: any) {
    console.error('启动调度器失败:', error)
    return createErrorResponse(`启动失败: ${error.message}`, 500)
  }
}

// 处理停止操作
async function handleStopAction() {
  try {
    const scheduler = getKLineSyncScheduler()
    
    // 检查是否已经在停止状态
    const status = scheduler.getStatus()
    if (!status.isRunning) {
      return createSuccessResponse(
        { 
          message: '调度器已经停止',
          ...status 
        }, 
        '调度器已经停止'
      )
    }
    
    // 停止调度器
    stopKLineSyncScheduler()
    
    // 获取更新后的状态
    const newStatus = getSchedulerStatus()
    
    return createSuccessResponse(
      { 
        message: '调度器停止成功',
        ...newStatus 
      }, 
      '调度器停止成功'
    )
  } catch (error: any) {
    console.error('停止调度器失败:', error)
    return createErrorResponse(`停止失败: ${error.message}`, 500)
  }
}

// 处理状态查询操作
async function handleStatusAction() {
  try {
    const status = getSchedulerStatus()
    return createSuccessResponse(status, '获取调度器状态成功')
  } catch (error: any) {
    console.error('获取调度器状态失败:', error)
    return createErrorResponse(`获取状态失败: ${error.message}`, 500)
  }
}

// 处理触发同步操作
async function handleTriggerAction(force?: boolean) {
  try {
    const scheduler = getKLineSyncScheduler()
    
    // 检查调度器是否在运行
    const status = scheduler.getStatus()
    if (!status.isRunning) {
      return createErrorResponse('调度器未运行，请先启动调度器', 400)
    }
    
    // 触发同步
    const result = await scheduler.triggerSync(!!force)
    
    if (result.success) {
      return createSuccessResponse(
        { 
          ...result,
          currentStatus: getSchedulerStatus()
        }, 
        result.message
      )
    } else {
      return createErrorResponse(result.message, 500)
    }
  } catch (error: any) {
    console.error('触发同步失败:', error)
    return createErrorResponse(`触发同步失败: ${error.message}`, 500)
  }
}

// 处理配置操作
async function handleConfigAction(body: any) {
  try {
    const scheduler = getKLineSyncScheduler()
    
    // 提取配置参数
    const { symbols, timeframes, maxBarsPerFile, maxTotalBars, syncInterval, initialBars } = body
    
    const newConfig: any = {}
    
    if (symbols !== undefined) newConfig.symbols = symbols
    if (timeframes !== undefined) newConfig.timeframes = timeframes
    if (maxBarsPerFile !== undefined) newConfig.maxBarsPerFile = maxBarsPerFile
    if (maxTotalBars !== undefined) newConfig.maxTotalBars = maxTotalBars
    if (syncInterval !== undefined) newConfig.syncInterval = syncInterval
    if (initialBars !== undefined) newConfig.initialBars = initialBars
    
    // 更新配置
    scheduler.updateConfig(newConfig)
    
    // 获取更新后的配置
    const syncService = scheduler.getSyncService()
    const config = syncService.getConfig()
    const status = scheduler.getStatus()
    
    return createSuccessResponse(
      { 
        config,
        status,
        message: '配置更新成功'
      }, 
      '配置更新成功'
    )
  } catch (error: any) {
    console.error('更新配置失败:', error)
    return createErrorResponse(`更新配置失败: ${error.message}`, 500)
  }
}

// 创建成功响应
function createSuccessResponse(data: any, message: string = '操作成功') {
  return {
    success: true,
    message,
    data
  }
}

// 创建错误响应
function createErrorResponse(message: string, statusCode: number = 400) {
  return {
    success: false,
    message
  }
}