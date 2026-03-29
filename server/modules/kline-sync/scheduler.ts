import { KLineSyncService } from './index'
import type { KLineSyncConfig } from '../../../types/kline'

export class KLineSyncScheduler {
  private syncService: KLineSyncService
  private syncInterval: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  private lastSyncTime: number = 0
  private syncStats: {
    totalSyncs: number
    successfulSyncs: number
    failedSyncs: number
    totalBars: number
    lastSyncDuration: number
  } = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    totalBars: 0,
    lastSyncDuration: 0
  }

  constructor(config?: Partial<KLineSyncConfig>) {
    this.syncService = new KLineSyncService(config)
  }

  // 启动定时同步
  start(intervalSeconds: number = 300): void {
    if (this.isRunning) {
      console.warn('K线数据同步调度器已经在运行中')
      return
    }

    console.log(`启动K线数据同步调度器，同步间隔: ${intervalSeconds}秒`)
    this.isRunning = true

    // 立即执行一次初始同步
    this.performSync()

    // 设置定时同步
    this.syncInterval = setInterval(() => {
      this.performSync()
    }, intervalSeconds * 1000)
  }

  // 停止定时同步
  stop(): void {
    if (!this.isRunning) {
      console.warn('K线数据同步调度器未在运行')
      return
    }

    console.log('停止K线数据同步调度器')
    this.isRunning = false

    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  // 执行同步任务
  private async performSync(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    const startTime = Date.now()
    console.log(`开始执行K线数据同步任务 (${new Date().toISOString()})`)

    try {
      const results = await this.syncService.syncAllKLine({
        force: false,
        concurrency: 3
      })

      // 统计结果
      const successCount = results.filter(r => r.success).length
      const totalBars = results.reduce((sum, r) => sum + r.count, 0)
      const duration = Date.now() - startTime

      // 更新统计信息
      this.syncStats.totalSyncs++
      this.syncStats.successfulSyncs += successCount
      this.syncStats.failedSyncs += results.length - successCount
      this.syncStats.totalBars += totalBars
      this.syncStats.lastSyncDuration = duration

      this.lastSyncTime = Date.now()

      console.log(`K线数据同步任务完成:
        总任务数: ${results.length}
        成功数: ${successCount}
        失败数: ${results.length - successCount}
        获取数据条数: ${totalBars}
        耗时: ${duration}ms
      `)

      // 如果有失败的任务，记录详细信息
      const failedTasks = results.filter(r => !r.success)
      if (failedTasks.length > 0) {
        console.warn('以下任务同步失败:')
        failedTasks.forEach(task => {
          console.warn(`  ${task.symbol}/${task.timeframe}: ${task.message}`)
        })
      }

    } catch (error: any) {
      console.error('K线数据同步任务执行失败:', error)
      
      // 更新统计信息
      this.syncStats.totalSyncs++
      this.syncStats.failedSyncs++
      this.syncStats.lastSyncDuration = Date.now() - startTime
    }
  }

  // 获取调度器状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncStats: { ...this.syncStats },
      serviceStatus: this.syncService.getSyncStatus(),
      config: this.syncService.getConfig()
    }
  }

  // 手动触发同步
  async triggerSync(force: boolean = false): Promise<{
    success: boolean
    message: string
    results?: any[]
  }> {
    if (!this.isRunning) {
      return {
        success: false,
        message: '调度器未运行，请先启动调度器'
      }
    }

    console.log(`手动触发K线数据同步 (force: ${force})`)

    try {
      const results = await this.syncService.syncAllKLine({
        force,
        concurrency: 3
      })

      const successCount = results.filter(r => r.success).length
      const totalBars = results.reduce((sum, r) => sum + r.count, 0)

      return {
        success: true,
        message: `手动同步完成: ${successCount}/${results.length} 成功，获取 ${totalBars} 条数据`,
        results
      }

    } catch (error: any) {
      console.error('手动同步失败:', error)
      return {
        success: false,
        message: `手动同步失败: ${error.message}`
      }
    }
  }

  // 更新配置
  updateConfig(newConfig: Partial<KLineSyncConfig>): void {
    this.syncService.updateConfig(newConfig)
    console.log('K线同步服务配置已更新')
  }

  // 获取同步服务实例
  getSyncService(): KLineSyncService {
    return this.syncService
  }

  // 清理资源
  cleanup(): void {
    this.stop()
    console.log('K线数据同步调度器资源已清理')
  }
}

// 创建全局调度器实例
let globalScheduler: KLineSyncScheduler | null = null

export function getKLineSyncScheduler(config?: Partial<KLineSyncConfig>): KLineSyncScheduler {
  if (!globalScheduler) {
    globalScheduler = new KLineSyncScheduler(config)
  }
  return globalScheduler
}

export function startKLineSyncScheduler(intervalSeconds: number = 300): void {
  const scheduler = getKLineSyncScheduler()
  scheduler.start(intervalSeconds)
}

export function stopKLineSyncScheduler(): void {
  if (globalScheduler) {
    globalScheduler.stop()
  }
}

export function getSchedulerStatus() {
  if (!globalScheduler) {
    return {
      isRunning: false,
      message: '调度器未初始化'
    }
  }
  return globalScheduler.getStatus()
}