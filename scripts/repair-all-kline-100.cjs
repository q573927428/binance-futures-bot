#!/usr/bin/env node

/**
 * 修复所有交易对、所有周期的最近100根K线
 * 这个脚本用于纠正最近同步更新错了的K线
 * 它会重新获取每个数据文件的最近100条K线并替换现有数据
 */

// 使用动态导入来加载TypeScript模块
const { KLineSimpleSyncService } = await import('../server/modules/kline-simple-sync/index.ts')

console.log('🚀 开始修复所有交易对、所有周期的最近100根K线...')
console.log('📊 目标: 修复所有40个数据文件的最近100条K线数据')
console.log('⏰ 开始时间:', new Date().toLocaleString())

// 创建同步服务实例
// 注意：这里使用空配置，因为repairAllRecentKLine会自动发现所有现有数据文件
const syncService = new KLineSimpleSyncService({
  symbols: [], // 空数组，让repairAllRecentKLine自动发现
  timeframes: [],
  maxBars: 22000,
  syncInterval: 300
})

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n🛑 收到退出信号，停止修复...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，停止修复...')
  process.exit(0)
})

// 主函数
async function main() {
  const startTime = Date.now()
  
  try {
    console.log('\n=== 开始批量修复所有数据文件 ===')
    console.log('🔍 正在扫描现有数据文件...')
    
    // 执行批量修复
    const results = await syncService.repairAllRecentKLine({
      recentBars: 10, // 修复最近100条K线
      force: true      // 强制修复，即使正在同步中
    })
    
    const endTime = Date.now()
    const duration = (endTime - startTime) / 1000
    
    // 统计结果
    const successCount = results.filter(r => r.success).length
    const totalFiles = results.length
    const totalRepaired = results.reduce((sum, r) => sum + r.repairedBars, 0)
    const totalKept = results.reduce((sum, r) => sum + r.keptBars, 0)
    const totalBars = results.reduce((sum, r) => sum + r.totalBars, 0)
    
    console.log('\n=== 修复完成 ===')
    console.log(`⏱️  总耗时: ${duration.toFixed(2)} 秒`)
    console.log(`📁 处理文件: ${totalFiles} 个`)
    console.log(`✅ 成功修复: ${successCount} 个`)
    console.log(`❌ 修复失败: ${totalFiles - successCount} 个`)
    console.log(`📊 修复K线: ${totalRepaired} 条`)
    console.log(`💾 保留K线: ${totalKept} 条`)
    console.log(`📈 总K线数: ${totalBars} 条`)
    
    // 显示成功和失败的详细结果
    if (successCount > 0) {
      console.log('\n✅ 成功修复的文件:')
      results
        .filter(r => r.success)
        .forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.symbol}/${result.timeframe}: 修复 ${result.repairedBars} 条，保留 ${result.keptBars} 条，总计 ${result.totalBars} 条`)
        })
    }
    
    if (totalFiles - successCount > 0) {
      console.log('\n❌ 修复失败的文件:')
      results
        .filter(r => !r.success)
        .forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.symbol}/${result.timeframe}: ${result.message}`)
        })
    }
    
    // 生成修复报告
    console.log('\n📋 修复报告:')
    console.log(`开始时间: ${new Date(startTime).toLocaleString()}`)
    console.log(`结束时间: ${new Date(endTime).toLocaleString()}`)
    console.log(`总耗时: ${duration.toFixed(2)} 秒`)
    console.log(`成功率: ${((successCount / totalFiles) * 100).toFixed(2)}%`)
    
    if (successCount === totalFiles) {
      console.log('\n🎉 所有文件修复成功!')
      console.log('✅ K线数据已成功纠正，最近100条K线已更新为正确数据')
    } else if (successCount > 0) {
      console.log('\n⚠️  部分文件修复成功')
      console.log('✅ 大部分K线数据已成功纠正，但有一些文件修复失败')
      console.log('💡 建议检查失败的文件，可能需要手动处理')
    } else {
      console.log('\n❌ 所有文件修复失败')
      console.log('💡 请检查网络连接和Binance API状态，然后重试')
    }
    
    console.log('\n=== 修复操作完成 ===')
    
  } catch (error) {
    const endTime = Date.now()
    const duration = (endTime - startTime) / 1000
    
    console.error('\n❌ 修复过程中发生严重错误:', error)
    console.error(`⏱️  错误发生时间: ${duration.toFixed(2)} 秒后`)
    console.error('💡 建议检查:')
    console.error('  1. 网络连接是否正常')
    console.error('  2. Binance API是否可用')
    console.error('  3. 数据文件是否可读写')
    
    process.exit(1)
  }
}

// 显示警告信息
console.log('\n⚠️  警告:')
console.log('  1. 此操作将修改现有的K线数据文件')
console.log('  2. 每个文件的最近100条K线将被重新获取并替换')
console.log('  3. 历史数据将被保留')
console.log('  4. 操作可能需要几分钟时间，取决于网络速度和文件数量')
console.log('  5. 按 Ctrl+C 可以随时停止操作')

// 确认提示
console.log('\n❓ 是否继续执行修复操作?')
console.log('  输入 "yes" 继续，其他任何输入将取消操作')

// 读取用户输入
process.stdin.setEncoding('utf8')
process.stdin.once('data', (data) => {
  const input = data.toString().trim().toLowerCase()
  
  if (input === 'yes' || input === 'y') {
    console.log('\n🔄 开始执行修复操作...')
    main().catch(error => {
      console.error('❌ 未处理的错误:', error)
      process.exit(1)
    })
  } else {
    console.log('\n🛑 操作已取消')
    process.exit(0)
  }
})

console.log('等待确认...')