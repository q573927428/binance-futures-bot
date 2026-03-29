#!/usr/bin/env node

/**
 * K线数据同步启动脚本
 * 用于启动K线数据同步调度器
 */

import { startKLineSyncScheduler, getSchedulerStatus } from '../server/modules/kline-sync/scheduler.js'

// 解析命令行参数
const args = process.argv.slice(2)
const intervalSeconds = parseInt(args[0]) || 300 // 默认5分钟

console.log('🚀 启动K线数据同步调度器')
console.log(`📊 同步间隔: ${intervalSeconds}秒 (${intervalSeconds / 60}分钟)`)

try {
  // 启动调度器
  startKLineSyncScheduler(intervalSeconds)
  
  // 获取初始状态
  const status = getSchedulerStatus()
  
  console.log('✅ 调度器启动成功')
  console.log('📈 当前状态:')
  console.log(`  运行状态: ${status.isRunning ? '运行中' : '已停止'}`)
  console.log(`  最后同步时间: ${status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : '从未同步'}`)
  console.log(`  同步统计:`)
  console.log(`    总同步次数: ${status.syncStats?.totalSyncs || 0}`)
  console.log(`    成功次数: ${status.syncStats?.successfulSyncs || 0}`)
  console.log(`    失败次数: ${status.syncStats?.failedSyncs || 0}`)
  console.log(`    总数据条数: ${status.syncStats?.totalBars || 0}`)
  
  // 显示配置信息
  if (status.config) {
    console.log('⚙️  配置信息:')
    console.log(`    交易对: ${status.config.symbols?.join(', ') || '无'}`)
    console.log(`    时间周期: ${status.config.timeframes?.join(', ') || '无'}`)
    console.log(`    最大数据条数: ${status.config.maxTotalBars || 20000}`)
    console.log(`    同步间隔: ${status.config.syncInterval || 300}秒`)
  }
  
  console.log('\n📋 可用API端点:')
  console.log('  GET  /api/kline-scheduler - 获取调度器状态')
  console.log('  POST /api/kline-scheduler - 控制调度器 (action: start|stop|trigger|config)')
  console.log('  GET  /api/kline - 获取K线数据')
  console.log('  POST /api/kline - 同步K线数据')
  
  console.log('\n🔗 测试页面:')
  console.log('  http://localhost:3000/kline-test')
  
  console.log('\n🛑 停止调度器:')
  console.log('  发送 POST 请求到 /api/kline-scheduler 并设置 action: "stop"')
  console.log('  或使用 Ctrl+C 停止此脚本')
  
  // 处理进程退出
  process.on('SIGINT', () => {
    console.log('\n\n🛑 收到停止信号，正在关闭调度器...')
    const { stopKLineSyncScheduler } = require('../server/modules/kline-sync/scheduler.js')
    stopKLineSyncScheduler()
    console.log('👋 调度器已停止，再见！')
    process.exit(0)
  })
  
  process.on('SIGTERM', () => {
    console.log('\n\n🛑 收到终止信号，正在关闭调度器...')
    const { stopKLineSyncScheduler } = require('../server/modules/kline-sync/scheduler.js')
    stopKLineSyncScheduler()
    console.log('👋 调度器已停止，再见！')
    process.exit(0)
  })
  
  // 保持进程运行
  console.log('\n⏳ 调度器正在运行，等待下一次同步...')
  
} catch (error) {
  console.error('❌ 启动调度器失败:', error)
  process.exit(1)
}