/**
 * 查询当前所有的条件单（止损单/止盈单）
 * 使用方法：
 * 1. 运行: npx tsx test/list-stop-orders.ts
 * 2. 复制输出的订单ID用于测试
 */
import 'dotenv/config'
import * as ccxt from 'ccxt'

// ===== 配置区域 =====
const API_KEY = process.env.BINANCE_API_KEY || 'your-api-key-here'
const API_SECRET = process.env.BINANCE_SECRET || 'your-secret-here'

// 可选：指定交易对，留空则查询所有
const SYMBOL = 'BNB/USDT:USDT'  // 或者设置为空字符串 ''

async function listStopOrders() {
  console.log('===== 查询当前条件单（止损/止盈） =====\n')

  const exchange = new ccxt.binance({
    apiKey: API_KEY,
    secret: API_SECRET,
    options: {
      defaultType: 'future',
      adjustForTimeDifference: true,
    },
    enableRateLimit: true,
  })

  try {
    await exchange.loadMarkets()
    console.log('✅ 市场信息加载成功\n')

    // 币安合约的条件单需要使用特殊的API查询
    console.log(`正在查询${SYMBOL ? SYMBOL : '所有交易对'}的条件单（计划委托）...\n`)
    
    // 使用币安原生API查询条件单
    // 注意：条件单在币安API中需要特殊查询
    const params: any = {}
    if (SYMBOL) {
      params.symbol = exchange.market(SYMBOL).id  // 转换为交易所格式，如 BNBUSDT
    }
    
    let stopOrders: any[] = []
    
    try {
      // 尝试使用 fapiPrivateGetOpenOrders 查询所有订单（包括条件单）
      const response = await exchange.fapiPrivateGetOpenOrders(params)
      
      console.log(`✅ 查询到 ${response.length} 个未成交订单\n`)
      
      // 过滤出条件单
      stopOrders = response.filter((order: any) => {
        const orderType = order.type?.toUpperCase() || ''
        return orderType.includes('STOP') || orderType.includes('TAKE_PROFIT')
      })
      
      if (stopOrders.length === 0) {
        console.log('⚠️  没有找到条件单（止损/止盈）')
        console.log(`\n💡 共有 ${response.length} 个普通订单，但都不是条件单`)
        
        if (response.length > 0) {
          console.log('\n当前订单类型:')
          response.forEach((order: any, index: number) => {
            console.log(`  ${index + 1}. [${order.type}] ${order.symbol} ${order.side} ${order.origQty}`)
          })
        }
        return
      }
    } catch (error: any) {
      console.error('❌ 查询失败:', error.message)
      
      // 尝试备用方法
      console.log('\n尝试备用查询方法...\n')
      const regularOrders = await exchange.fetchOpenOrders(SYMBOL || undefined)
      stopOrders = regularOrders.filter(order => {
        const type = order.type?.toLowerCase() || ''
        return type.includes('stop') || type.includes('take_profit')
      })
      
      if (stopOrders.length === 0) {
        console.log('❌ 备用方法也没有找到条件单')
        console.log('\n💡 提示: 条件单可能需要在币安网页版或APP中查看订单ID')
        return
      }
    }

    console.log(`✅ 找到 ${stopOrders.length} 个条件单:\n`)
    console.log('='.repeat(80))

    stopOrders.forEach((order, index) => {
      console.log(`\n【订单 ${index + 1}】`)
      console.log(`  🔑 订单ID:   ${order.id}`)
      console.log(`  📊 交易对:   ${order.symbol}`)
      console.log(`  📝 类型:     ${order.type}`)
      console.log(`  🔄 方向:     ${order.side?.toUpperCase()}`)
      console.log(`  💰 数量:     ${order.amount}`)
      console.log(`  🎯 触发价:   ${order.stopPrice || order.triggerPrice || 'N/A'}`)
      console.log(`  💵 委托价:   ${order.price || '市价'}`)
      console.log(`  📌 状态:     ${order.status}`)
      console.log(`  ⏰ 创建时间: ${order.datetime || new Date(order.timestamp || 0).toISOString()}`)
      
      // 额外信息
      if (order.info) {
        const info = order.info as any
        if (info.reduceOnly) {
          console.log(`  🛡️  仅减仓:   ${info.reduceOnly}`)
        }
        if (info.workingType) {
          console.log(`  🔧 工作类型: ${info.workingType}`)
        }
      }
    })

    console.log('\n' + '='.repeat(80))
    console.log(`\n💡 使用这些订单ID进行测试:`)
    stopOrders.forEach((order, index) => {
      console.log(`   ${index + 1}. ${order.id} (${order.symbol} ${order.type})`)
    })

    console.log('\n📝 修改测试脚本示例:')
    if (stopOrders[0]) {
      console.log(`   const SYMBOL = '${stopOrders[0].symbol}'`)
      console.log(`   const ORDER_ID = '${stopOrders[0].id}'`)
    }

  } catch (error: any) {
    console.error('\n❌ 查询失败:', error.message)
    
    if (error.message.includes('APIKEY')) {
      console.error('\n💡 提示: 请检查环境变量 BINANCE_API_KEY 和 BINANCE_SECRET 是否正确')
    }
    
    throw error
  }
}

listStopOrders()
  .then(() => {
    console.log('\n✅ 查询完成!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ 出错:', error)
    process.exit(1)
  })
