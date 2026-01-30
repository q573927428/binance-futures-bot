/**
 * 简单的取消订单工具
 * 使用说明：
 * 1. 从币安APP或网页版查看订单ID（合约 -> 当前委托 -> 计划委托）
 * 2. 修改下方的 ORDER_ID 和 SYMBOL
 * 3. 运行: npx tsx test/simple-cancel-order.ts
 */
import 'dotenv/config'
import * as ccxt from 'ccxt'

// ===== 配置 =====
const API_KEY = process.env.BINANCE_API_KEY || ''
const API_SECRET = process.env.BINANCE_SECRET || ''

// 🔥 在这里填写你的订单信息
const SYMBOL = 'BNB/USDT:USDT'         // 交易对
const ORDER_ID = '你的订单ID'            // 从APP或网页复制的订单ID

async function cancelOrder() {
  console.log('===== 简单取消订单工具 =====\n')
  
  if (!API_KEY || !API_SECRET) {
    console.error('❌ 错误: 未设置API密钥')
    console.error('请设置环境变量 BINANCE_API_KEY 和 BINANCE_SECRET')
    process.exit(1)
  }
  
  if (ORDER_ID === '你的订单ID') {
    console.error('❌ 错误: 请先修改脚本中的 ORDER_ID')
    console.error('\n📝 如何获取订单ID:')
    console.error('   1. 打开币安APP或网页版')
    console.error('   2. 进入【合约】-> 点击底部【订单】')
    console.error('   3. 切换到【当前委托】标签')
    console.error('   4. 找到你的止损单，复制订单ID')
    console.error('   5. 修改本脚本中的 ORDER_ID 变量\n')
    process.exit(1)
  }
  
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
    console.log('✅ 连接成功\n')
    
    console.log('📋 订单信息:')
    console.log(`   交易对: ${SYMBOL}`)
    console.log(`   订单ID: ${ORDER_ID}\n`)
    
    console.log('⏳ 正在取消订单...')
    
    // ✅ 正确的参数顺序: cancelOrder(orderId, symbol)
    const result = await exchange.cancelOrder(ORDER_ID, SYMBOL)
    
    console.log('\n✅ 订单已成功取消!\n')
    console.log('返回结果:', {
      订单ID: result.id,
      交易对: result.symbol,
      状态: result.status,
    })
    
  } catch (error: any) {
    console.error('\n❌ 取消失败:', error.message)
    
    if (error.message.includes('does not exist') || error.message.includes('-2013')) {
      console.error('\n💡 原因: 订单不存在')
      console.error('   可能原因:')
      console.error('   - 订单ID错误')
      console.error('   - 订单已经被执行（止损已触发）')
      console.error('   - 订单已经被取消')
    } else if (error.message.includes('Unknown order') || error.message.includes('-2011')) {
      console.error('\n💡 原因: 未知订单')
      console.error('   可能原因:')
      console.error('   - 订单ID格式错误')
      console.error('   - 交易对不匹配')
    } else if (error.message.includes('does not have market symbol')) {
      console.error('\n💡 原因: 参数顺序错误')
      console.error('   请检查代码中是否使用了正确的顺序')
    }
    
    throw error
  }
}

// 运行
cancelOrder()
  .then(() => {
    console.log('\n✅ 操作完成!')
    process.exit(0)
  })
  .catch(() => {
    process.exit(1)
  })
