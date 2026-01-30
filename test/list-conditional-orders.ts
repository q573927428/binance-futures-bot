/**
 * 直接使用币安原生API查询条件单（计划委托）
 * 条件单包括：止损市价单(STOP_MARKET)、止盈市价单(TAKE_PROFIT_MARKET)等
 */
import 'dotenv/config'
import * as crypto from 'crypto'
import * as https from 'https'

// ===== 配置 =====
const API_KEY = process.env.BINANCE_API_KEY || ''
const API_SECRET = process.env.BINANCE_SECRET || ''
const BASE_URL = 'fapi.binance.com'

// 交易对（留空查询所有）
const SYMBOL = 'BNBUSDT'  // 注意：这里使用币安格式 BNBUSDT，不是 BNB/USDT:USDT

// ===== 辅助函数 =====
function createSignature(queryString: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex')
}

function makeRequest(endpoint: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    // 添加时间戳
    params.timestamp = Date.now()
    
    // 构建查询字符串
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')
    
    // 生成签名
    const signature = createSignature(queryString, API_SECRET)
    const finalQuery = `${queryString}&signature=${signature}`
    
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: `${endpoint}?${finalQuery}`,
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': API_KEY,
      },
    }
    
    const req = https.request(options, (res) => {
      let data = ''
      
      res.on('data', (chunk) => {
        data += chunk
      })
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode === 200) {
            resolve(parsed)
          } else {
            reject(new Error(`API错误 (${res.statusCode}): ${JSON.stringify(parsed)}`))
          }
        } catch (error) {
          reject(new Error(`解析响应失败: ${data}`))
        }
      })
    })
    
    req.on('error', (error) => {
      reject(error)
    })
    
    req.end()
  })
}

// ===== 主函数 =====
async function listConditionalOrders() {
  console.log('===== 币安合约条件单查询工具 =====\n')
  
  if (!API_KEY || !API_SECRET || API_KEY === '' || API_SECRET === '') {
    console.error('❌ 错误: 未设置API密钥')
    console.error('请设置环境变量 BINANCE_API_KEY 和 BINANCE_SECRET')
    process.exit(1)
  }
  
  try {
    // 1. 查询所有未成交订单（普通订单）
    console.log('1️⃣  查询普通未成交订单...')
    const params1: any = {}
    if (SYMBOL) params1.symbol = SYMBOL
    
    const openOrders = await makeRequest('/fapi/v1/openOrders', params1)
    console.log(`   ✅ 找到 ${openOrders.length} 个普通未成交订单\n`)
    
    // 2. 查询所有未成交订单（包括条件单） - 使用 allOpenOrders
    console.log('2️⃣  查询所有未成交订单（包括条件单）...')
    const params2: any = {}
    if (SYMBOL) params2.symbol = SYMBOL
    
    const allOrders = await makeRequest('/fapi/v1/allOpenOrders', params2)
    console.log(`   ✅ 找到 ${allOrders.length} 个总未成交订单\n`)
    
    // 过滤出条件单
    const conditionalOrders = allOrders.filter((order: any) => {
      const type = order.type || order.orderType || ''
      return type.includes('STOP') || type.includes('TAKE_PROFIT')
    })
    
    if (conditionalOrders.length === 0) {
      console.log('⚠️  没有找到条件单')
      console.log('\n所有订单类型统计:')
      const typeCount: any = {}
      allOrders.forEach((order: any) => {
        const type = order.type || order.orderType || 'UNKNOWN'
        typeCount[type] = (typeCount[type] || 0) + 1
      })
      Object.entries(typeCount).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`)
      })
      return
    }
    
    console.log(`✅ 找到 ${conditionalOrders.length} 个条件单:\n`)
    console.log('='.repeat(100))
    
    conditionalOrders.forEach((order: any, index: number) => {
      console.log(`\n【订单 ${index + 1}】`)
      console.log(`  🔑 订单ID:      ${order.orderId}`)
      console.log(`  📊 交易对:      ${order.symbol}`)
      console.log(`  📝 类型:        ${order.type || order.orderType}`)
      console.log(`  🔄 方向:        ${order.side}`)
      console.log(`  💰 原始数量:    ${order.origQty}`)
      console.log(`  📈 已成交数量:  ${order.executedQty}`)
      console.log(`  🎯 触发价格:    ${order.stopPrice || 'N/A'}`)
      console.log(`  💵 委托价格:    ${order.price || '市价'}`)
      console.log(`  📌 状态:        ${order.status}`)
      console.log(`  🛡️  仅减仓:      ${order.reduceOnly || false}`)
      console.log(`  🔧 工作类型:    ${order.workingType || 'N/A'}`)
      console.log(`  ⏰ 更新时间:    ${new Date(order.updateTime || order.time).toLocaleString('zh-CN')}`)
    })
    
    console.log('\n' + '='.repeat(100))
    console.log('\n💡 使用这些订单ID进行取消测试:\n')
    conditionalOrders.forEach((order: any, index: number) => {
      console.log(`   ${index + 1}. 订单ID: ${order.orderId}`)
      console.log(`      交易对: ${order.symbol}`)
      console.log(`      类型:   ${order.type || order.orderType} ${order.side}`)
      console.log(`      触发价: ${order.stopPrice}\n`)
    })
    
    console.log('📝 修改取消测试脚本:')
    if (conditionalOrders[0]) {
      const symbol = conditionalOrders[0].symbol
      const ccxtSymbol = `${symbol.replace('USDT', '/USDT')}:USDT`
      console.log(`   const SYMBOL = '${ccxtSymbol}'`)
      console.log(`   const ORDER_ID = '${conditionalOrders[0].orderId}'`)
    }
    
  } catch (error: any) {
    console.error('\n❌ 查询失败:', error.message)
    throw error
  }
}

// 运行查询
listConditionalOrders()
  .then(() => {
    console.log('\n✅ 查询完成!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ 出错:', error)
    process.exit(1)
  })
