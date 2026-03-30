/**
 * K线数据同步服务插件
 * 在Nuxt服务器启动时自动初始化并启动K线数据同步服务
 */

import type { NitroApp } from 'nitropack'
import { KLineSimpleSyncService } from '../modules/kline-simple-sync'
import type { KLineSyncConfig } from '../../types/kline-simple'
import { eventHandler } from 'h3'

// 全局同步服务实例
let syncService: KLineSimpleSyncService | null = null

// 默认配置
const DEFAULT_SYNC_CONFIG: KLineSyncConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'HYPEUSDT', 'XAUUSDT', 'XAGUSDT', 'BNBUSDT' ],
  timeframes: ['15m', '1h', '4h', '1d', '1w'],
  maxBars: 22000,
  syncInterval: 300 // 5分钟 300秒
}

export default defineNitroPlugin(async (nitroApp: NitroApp) => {
  console.log('🚀 初始化K线数据同步服务插件...')
  
  try {
    // 从环境变量或配置文件中获取配置
    const config = await getSyncConfig()
    
    // 创建同步服务实例
    syncService = new KLineSimpleSyncService(config)
    
    console.log('✅ K线同步服务配置:', JSON.stringify(config, null, 2))
    
    // 注册API端点
    registerApiEndpoints(nitroApp)
    
    // 启动初始同步（延迟启动，避免影响服务器启动）
    setTimeout(async () => {
      await startInitialSync()
    }, 5000) // 延迟5秒启动
    
    // 处理服务器关闭
    nitroApp.hooks.hook('close', async () => {
      await stopSyncService()
    })
    
  } catch (error) {
    console.error('❌ 初始化K线同步服务失败:', error)
  }
})

/**
 * 获取同步配置
 */
async function getSyncConfig(): Promise<KLineSyncConfig> {
  // 这里可以从环境变量、配置文件或数据库获取配置
  // 目前使用默认配置，后续可以扩展
  
  const runtimeConfig = useRuntimeConfig()
  
  // 可以添加从环境变量读取配置的逻辑
  // 例如：const symbols = runtimeConfig.klineSyncSymbols?.split(',') || DEFAULT_SYNC_CONFIG.symbols
  
  return {
    ...DEFAULT_SYNC_CONFIG,
    // 可以在这里覆盖默认配置
  }
}

/**
 * 注册API端点
 */
function registerApiEndpoints(nitroApp: NitroApp): void {
  if (!syncService) return
  
  // 获取同步状态
  nitroApp.router?.get('/api/kline-sync/status', eventHandler(async (event) => {
    try {
      const status = syncService?.getSyncStatus() || []
      return {
        success: true,
        data: status,
        timestamp: Date.now()
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }
  }))
  
  // 手动触发同步
  nitroApp.router?.post('/api/kline-sync/sync', eventHandler(async (event) => {
    try {
      const body = await readBody(event)
      const { force = false } = body
      
      if (!syncService) {
        throw new Error('同步服务未初始化')
      }
      
      const results = await syncService.syncAllKLine({ force })
      
      return {
        success: true,
        data: results,
        message: `同步完成: ${results.filter(r => r.success).length}/${results.length} 成功`,
        timestamp: Date.now()
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }
  }))
  
  // 获取服务配置
  nitroApp.router?.get('/api/kline-sync/config', eventHandler(async (event) => {
    try {
      const config = syncService?.getConfig() || DEFAULT_SYNC_CONFIG
      return {
        success: true,
        data: config,
        timestamp: Date.now()
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }
  }))
  
  // 更新服务配置
  nitroApp.router?.put('/api/kline-sync/config', eventHandler(async (event) => {
    try {
      const body = await readBody(event)
      
      if (!syncService) {
        throw new Error('同步服务未初始化')
      }
      
      syncService.updateConfig(body)
      
      return {
        success: true,
        message: '配置更新成功',
        data: syncService.getConfig(),
        timestamp: Date.now()
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }
  }))
  
  // 启动/停止定时同步
  nitroApp.router?.post('/api/kline-sync/auto-sync', eventHandler(async (event) => {
    try {
      const body = await readBody(event)
      const { action } = body // 'start' 或 'stop'
      
      if (!syncService) {
        throw new Error('同步服务未初始化')
      }
      
      if (action === 'start') {
        syncService.startAutoSync()
        return {
          success: true,
          message: '定时同步已启动',
          timestamp: Date.now()
        }
      } else if (action === 'stop') {
        syncService.stopAutoSync()
        return {
          success: true,
          message: '定时同步已停止',
          timestamp: Date.now()
        }
      } else {
        throw new Error('无效的action参数，必须是 "start" 或 "stop"')
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }
  }))
  
  console.log('✅ K线同步服务API端点已注册')
}

/**
 * 启动初始同步
 */
async function startInitialSync(): Promise<void> {
  if (!syncService) {
    console.error('❌ 同步服务未初始化，无法启动初始同步')
    return
  }
  
  try {
    console.log('📊 开始K线数据初始同步...')
    
    // 检查是否需要初始同步 - 通过检查数据文件是否存在
    const config = syncService.getConfig()
    let needsInitialSync = false
    
    // 导入文件系统模块来检查文件是否存在
    const fs = await import('fs/promises')
    const path = await import('path')
    
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        // 构建数据文件路径 - 注意：文件名格式是 BTCUSDT-15m.json（使用连字符）
        const dataDir = path.join(process.cwd(), 'data', 'kline-simple')
        const fileName = `${symbol.replace('/', '')}-${timeframe}.json`
        const filePath = path.join(dataDir, fileName)
        
        try {
          // 检查文件是否存在
          await fs.access(filePath)
          console.log(`✅ 数据文件已存在: ${symbol}/${timeframe}`)
        } catch {
          // 文件不存在，需要初始同步
          console.log(`⚠️  数据文件不存在: ${symbol}/${timeframe}，需要初始同步`)
          needsInitialSync = true
        }
      }
    }
    
    if (needsInitialSync) {
      console.log('🔄 检测到缺少数据文件，开始初始同步...')
      const results = await syncService.syncAllKLine({ force: true })
      
      const successCount = results.filter(r => r.success).length
      const totalBars = results.reduce((sum, r) => sum + r.count, 0)
      
      console.log(`✅ 初始同步完成: ${successCount}/${results.length} 成功，共获取 ${totalBars} 条数据`)
    } else {
      console.log('✅ 所有数据文件已存在，进行增量同步...')
      
      // 进行增量同步
      const results = await syncService.syncAllKLine({ force: false })
      
      const successCount = results.filter(r => r.success).length
      const totalBars = results.reduce((sum, r) => sum + r.count, 0)
      
      console.log(`✅ 增量同步完成: ${successCount}/${results.length} 成功，共获取 ${totalBars} 条数据`)
      
      // 显示当前状态
      const status = syncService.getSyncStatus()
      status.forEach(s => {
        console.log(`  ${s.symbol}/${s.timeframe}: 最后同步: ${new Date(s.lastSyncTime * 1000).toLocaleString()}, 总数据: ${s.totalBars}`)
      })
    }
    
    // 启动定时同步
    console.log('⏰ 启动定时同步...')
    syncService.startAutoSync()
    
    console.log('🎯 K线同步服务已完全启动')
    
  } catch (error) {
    console.error('❌ 启动初始同步失败:', error)
  }
}

/**
 * 停止同步服务
 */
async function stopSyncService(): Promise<void> {
  if (syncService) {
    console.log('🛑 停止K线同步服务...')
    syncService.stopAutoSync()
    syncService = null
    console.log('✅ K线同步服务已停止')
  }
}

// 导出同步服务实例供其他模块使用
export function getSyncService(): KLineSimpleSyncService | null {
  return syncService
}