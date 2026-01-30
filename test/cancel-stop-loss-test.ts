/**
 * 测试取消止损单的功能
 * 使用方法：
 * 1. 设置环境变量或修改下方的配置
 * 2. 替换 SYMBOL 和 ORDER_ID 为你实际的值
 * 3. 运行: npx tsx test/cancel-stop-loss-test.ts
 */
import 'dotenv/config'
import * as ccxt from 'ccxt'

// ===== 配置区域 =====
const API_KEY = process.env.BINANCE_API_KEY || ''
const API_SECRET = process.env.BINANCE_SECRET || ''

// 🔥 请修改为你实际的交易对和订单ID
const SYMBOL = 'BNB/USDT:USDT'  // 例如: 'BNB/USDT:USDT'
const ORDER_ID = '3000000460707596'  // 你的止损单ID

// ===== 测试函数 =====
async function testCancelStopLossOrder() {
  console.log('===== 开始测试取消止损单 =====\n')

  // 创建Binance实例
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
    // 加载市场信息
    console.log('1. 加载市场信息...')
    await exchange.loadMarkets()
    console.log('✅ 市场信息加载成功\n')

    // 查询订单状态（取消前）
    console.log('2. 查询订单状态（取消前）...')
    console.log(`   交易对: ${SYMBOL}`)
    console.log(`   订单ID: ${ORDER_ID}`)
    
    try {
      const orderBefore = await exchange.fetchOrder(ORDER_ID, SYMBOL)
      console.log('✅ 订单状态:', {
        id: orderBefore.id,
        symbol: orderBefore.symbol,
        type: orderBefore.type,
        side: orderBefore.side,
        price: orderBefore.price,
        stopPrice: orderBefore.stopPrice,
        amount: orderBefore.amount,
        status: orderBefore.status,
      })
      console.log('')
    } catch (error: any) {
      console.log('⚠️  查询订单失败（可能订单不存在）:', error.message)
      console.log('')
    }

    // 取消订单
    console.log('3. 取消止损单...')
    console.log(`   参数顺序: cancelOrder(orderId="${ORDER_ID}", symbol="${SYMBOL}")`)
    
    const result = await exchange.cancelOrder(ORDER_ID, SYMBOL)
    
    console.log('✅ 取消成功! 返回结果:', {
      id: result.id,
      symbol: result.symbol,
      status: result.status,
      info: result.info,
    })
    console.log('')

    // 验证订单已取消
    console.log('4. 验证订单状态（取消后）...')
    try {
      const orderAfter = await exchange.fetchOrder(ORDER_ID, SYMBOL)
      console.log('订单状态:', {
        id: orderAfter.id,
        status: orderAfter.status,
      })
      
      if (orderAfter.status === 'canceled' || orderAfter.status === 'cancelled') {
        console.log('✅ 订单已成功取消!')
      } else {
        console.log('⚠️  订单状态未变为已取消:', orderAfter.status)
      }
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        console.log('✅ 订单已被完全移除（已取消）')
      } else {
        console.log('⚠️  查询订单失败:', error.message)
      }
    }

    console.log('\n===== 测试完成 =====')

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message)
    
    if (error.message.includes('does not have market symbol')) {
      console.error('\n💡 提示: 参数顺序可能错误，应该是 cancelOrder(orderId, symbol)')
    }
    
    throw error
  }
}

// 运行测试
testCancelStopLossOrder()
  .then(() => {
    console.log('\n✅ 所有测试通过!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ 测试出错:', error)
    process.exit(1)
  })
