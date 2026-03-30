#!/usr/bin/env node

/**
 * 启动简单K线数据同步服务
 * 这个脚本启动新的单文件存储方案的K线同步服务
 */

import { KLineSimpleSyncService } from '../server/modules/kline-simple-sync/index.js'

// 配置
const config = {
  symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  timeframes: ['15m', '1h', '4h', '1d', '1w'],
  maxBars: 22000,
  syncInterval: 300 // 5分钟
}

console.log('🚀 启动简单K线数据同步服务...')
console.log('配置:', JSON.stringify(config, null, 2))

// 创建同步服务实例
const syncService = new KLineSimpleSyncService(config)

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n🛑 收到退出信号，停止同步服务...')
  syncService.stopAutoSync()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，停止同步服务...')
  syncService.stopAutoSync()
  process.exit(0)
})

// 主函数
async function main() {
  try {
    console.log('📊 开始初始同步...')
    
    // 初始同步所有数据
    const initialResults = await syncService.syncAllKLine({ force: true })
    
    const successCount = initialResults.filter(r => r.success).length
    const totalBars = initialResults.reduce((sum, r) => sum + r.count, 0)
    
    console.log(`✅ 初始同步完成: ${successCount}/${initialResults.length} 成功，共获取 ${totalBars} 条数据`)
    
    // 显示同步状态
    const status = syncService.getSyncStatus()
    console.log('\n📈 同步状态:')
    status.forEach(s => {
      console.log(`  ${s.symbol}/${s.timeframe}: ${s.status}, 最后同步: ${new Date(s.lastSyncTime * 1000).toLocaleString()}, 总数据: ${s.totalBars}`)
    })
    
    // 启动定时同步
    console.log('\n⏰ 启动定时同步，间隔:', config.syncInterval, '秒')
    syncService.startAutoSync()
    
    console.log('\n🎯 同步服务已启动，按 Ctrl+C 停止')
    
    // 保持进程运行
    setInterval(() => {
      // 心跳检测，保持进程活跃
    }, 60000)
    
  } catch (error) {
    console.error('❌ 启动同步服务失败:', error)
    process.exit(1)
  }
}

// 运行主函数
main().catch(error => {
  console.error('❌ 未处理的错误:', error)
  process.exit(1)
})