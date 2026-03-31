<template>
  <div class="kline-chart-simple-container">
    <!-- 图表控制栏 -->
    <KLineChartControls
      :symbol="displaySymbol"
      :timeframe="selectedTimeframe"
      :theme="theme"
      :loading="loading"
      @timeframe-change="selectTimeframe"
      @refresh="loadKLineData"
      @toggle-theme="toggleTheme"
    />

    <!-- 图表容器 -->
    <div class="chart-container">
      <KLineChartCanvas
        ref="chartCanvasRef"
        :kline-data="klineData"
        :trade-history="tradeHistory"
        :theme="theme"
        :symbol="displaySymbol"
        :timeframe="selectedTimeframe"
        :loading="loading"
        :error="error"
        @tooltip-update="handleTooltipUpdate"
        @retry="loadKLineData"
      />

      <!-- K线数据浮动面板 -->
      <KLineTooltip
        :visible="tooltipVisible"
        :symbol="displaySymbol"
        :timeframe="selectedTimeframe"
        :time="tooltipTime"
        :data="tooltipData"
        :position="tooltipPosition"
      />
    </div>

    <!-- 图表信息 -->
    <KLineChartInfo
      :kline-data="klineData"
      :updated="meta.updated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, onBeforeUnmount } from 'vue'
import type { SimpleKLineData, KLineApiResponse } from '../../../types/kline-simple'
import type { PriceData } from '../../../types/websocket'
import type { TradeHistory } from '../../../types'

// 导入子组件
import KLineChartControls from './KLineChartControls.vue'
import KLineChartCanvas from './KLineChartCanvas.vue'
import KLineTooltip from './KLineTooltip.vue'
import KLineChartInfo from './KLineChartInfo.vue'

// 图表组件引用
const chartCanvasRef = ref<InstanceType<typeof KLineChartCanvas> | null>(null)

// 导入工具函数
import { formatTime } from './utils/kline-formatters'
import { generateClientId, isDOGESymbol } from './utils/kline-helpers'

// 防抖函数
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

// 定义props
interface Props {
  symbol?: string
  timeframe?: string
}

const props = withDefaults(defineProps<Props>(), {
  symbol: 'BTCUSDT',
  timeframe: '1h'
})

// 响应式数据
const selectedTimeframe = ref(props.timeframe)
const klineData = ref<SimpleKLineData[]>([])
const meta = ref({
  first: 0,
  last: 0,
  count: 0,
  max: 22000,
  updated: 0
})
const loading = ref(false)
const error = ref('')
const theme = ref<'light' | 'dark'>('light')

// 历史订单数据
const tradeHistory = ref<TradeHistory[]>([])
const loadingHistory = ref(false)

// WebSocket相关
const isWebSocketConnected = ref(false)
const lastPriceUpdate = ref<PriceData | null>(null)
const webSocketClientId = ref<string>('')
const currentSubscriptionSymbol = ref<string>('') // 跟踪当前订阅的交易对

// 浮动面板相关
const tooltipVisible = ref(false)
const tooltipData = ref({
  open: 0,
  high: 0,
  low: 0,
  close: 0,
  volume: 0,
  changePercent: 0
})
const tooltipTime = ref('')
const tooltipPosition = ref({
  left: '20px',
  top: '20px'
})

// 计算显示的symbol
const displaySymbol = computed(() => {
  return props.symbol || 'BTCUSDT'
})

// 选择周期
const selectTimeframe = (timeframe: string) => {
  if (selectedTimeframe.value === timeframe) return
  selectedTimeframe.value = timeframe
  loadKLineData()
}

// 加载历史订单数据
const loadTradeHistory = async () => {
  const symbolToUse = props.symbol || 'BTCUSDT'
  if (!symbolToUse) return
  
  loadingHistory.value = true
  
  try {
    const response = await fetch(`/api/bot/history?page=1&pageSize=100`)
    const result = await response.json()
    
    if (result.success && result.data) {
      const filteredOrders = result.data.filter((order: TradeHistory) => {
        const orderSymbol = order.symbol.replace('/', '')
        const currentSymbol = symbolToUse.replace('/', '')
        return orderSymbol === currentSymbol
      })
      
      tradeHistory.value = filteredOrders
    }
  } catch (err: any) {
    console.error('加载交易历史失败:', err)
  } finally {
    loadingHistory.value = false
  }
}

// 加载K线数据
const loadKLineData = async () => {
  const symbolToUse = props.symbol || 'BTCUSDT'
  if (!symbolToUse || !selectedTimeframe.value) {
    error.value = '请提供交易对和周期'
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    const params = new URLSearchParams({
      symbol: symbolToUse,
      timeframe: selectedTimeframe.value,
      limit: '22000'
    })
    
    const response = await fetch(`/api/kline-simple?${params}`)
    const result: KLineApiResponse = await response.json()
    
    if (result.success && result.data) {
      klineData.value = result.data.data
      meta.value = result.data.meta
      
      // 加载历史订单数据
      loadTradeHistory()
      
      // 显示最新K线数据
      showLatestKline()
    } else {
      error.value = result.message || '获取数据失败'
      klineData.value = []
      hideTooltip()
    }
  } catch (err: any) {
    console.error('加载K线数据失败:', err)
    error.value = `加载失败: ${err.message}`
    klineData.value = []
    hideTooltip()
  } finally {
    loading.value = false
  }
}

// 切换主题
const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}

// 处理tooltip更新
const handleTooltipUpdate = (data: any, time: string) => {
  tooltipData.value = data
  tooltipTime.value = time
  tooltipVisible.value = true
}

// 显示最新K线数据
const showLatestKline = () => {
  if (klineData.value.length > 0) {
    const latestKline = klineData.value[klineData.value.length - 1]
    if (latestKline) {
      const changePercent = ((latestKline.c - latestKline.o) / latestKline.o) * 100
      tooltipData.value = {
        open: latestKline.o,
        high: latestKline.h,
        low: latestKline.l,
        close: latestKline.c,
        volume: latestKline.v || 0,
        changePercent
      }
      tooltipTime.value = formatTime(latestKline.t)
      tooltipVisible.value = true
    }
  }
}

// 隐藏浮动面板
const hideTooltip = () => {
  tooltipVisible.value = false
}

// 获取WebSocket连接状态
const fetchWebSocketStatus = async () => {
  try {
    const response = await fetch('/api/websocket/status')
    const result = await response.json()
    if (result.success && result.data?.isConnected !== undefined) {
      isWebSocketConnected.value = result.data.isConnected
    }
  } catch (error) {
    console.error('获取WebSocket状态失败:', error)
  }
}

// 处理实时价格更新
const handlePriceUpdate = (priceData: PriceData) => {
  lastPriceUpdate.value = priceData
  
  if (klineData.value.length === 0) return
  
  const lastKline = klineData.value[klineData.value.length - 1]
  if (!lastKline) return
  
  const now = Math.floor(Date.now() / 1000)
  const timeframeSeconds = getTimeframeSeconds(selectedTimeframe.value)
  const currentKlineTimestamp = Math.floor(now / timeframeSeconds) * timeframeSeconds
  
  if (lastKline.t === currentKlineTimestamp) {
    updateLastKlineWithPrice(priceData.price, now)
  }
}

// 获取时间段的秒数
const getTimeframeSeconds = (timeframe: string): number => {
  switch (timeframe) {
    case '15m': return 15 * 60
    case '1h': return 60 * 60
    case '4h': return 4 * 60 * 60
    case '1d': return 24 * 60 * 60
    case '1w': return 7 * 24 * 60 * 60
    default: return 60 * 60
  }
}

// 使用实时价格更新最后一根K线
const updateLastKlineWithPrice = (price: number, timestamp: number) => {
  if (klineData.value.length === 0) return
  
  const lastIndex = klineData.value.length - 1
  const lastKline = klineData.value[lastIndex]
  
  if (!lastKline) return
  
  const updatedKline = {
    ...lastKline,
    c: price,
    h: Math.max(lastKline.h, price),
    l: Math.min(lastKline.l, price),
    v: lastKline.v + 0.01
  }
  
  // 更新数据数组
  klineData.value[lastIndex] = updatedKline
  meta.value.updated = timestamp
  
  // 使用图表组件的方法只更新最后一根K线，而不是刷新整个图表
  if (chartCanvasRef.value) {
    chartCanvasRef.value.updateLastKline(updatedKline)
  }
  
  // 更新tooltip
  if (tooltipVisible.value) {
    const changePercent = ((updatedKline.c - updatedKline.o) / updatedKline.o) * 100
    tooltipData.value = {
      open: updatedKline.o,
      high: updatedKline.h,
      low: updatedKline.l,
      close: updatedKline.c,
      volume: updatedKline.v || 0,
      changePercent
    }
    tooltipTime.value = formatTime(updatedKline.t)
  }
}

// 清理旧的WebSocket订阅
const cleanupOldSubscription = async (): Promise<boolean> => {
  if (!webSocketClientId.value || !currentSubscriptionSymbol.value) {
    return true
  }
  
  const oldSymbol = currentSubscriptionSymbol.value
  const clientId = webSocketClientId.value
  
  console.log(`🔄 清理旧的订阅: ${oldSymbol} (客户端: ${clientId})`)
  
  try {
    const response = await fetch('/api/websocket/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbols: [oldSymbol],
        clientId: clientId
      })
    })
    
    const result = await response.json()
    if (result.success) {
      console.log(`✅ 已清理旧的订阅: ${oldSymbol}`)
      return true
    } else {
      console.warn(`⚠️ 清理旧订阅失败: ${result.message}`)
      return false
    }
  } catch (error: any) {
    console.warn(`⚠️ 清理旧订阅异常: ${error.message}`)
    return false
  }
}

// 订阅WebSocket价格更新
const subscribeToPriceUpdates = async () => {
  const symbolToUse = props.symbol || 'BTCUSDT'
  
  // 如果当前已经有订阅，先清理旧的
  if (currentSubscriptionSymbol.value && currentSubscriptionSymbol.value !== symbolToUse) {
    await cleanupOldSubscription()
  }
  
  try {
    if (!webSocketClientId.value) {
      webSocketClientId.value = generateClientId()
    }
    
    const response = await fetch('/api/websocket/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbols: [symbolToUse],
        clientId: webSocketClientId.value
      })
    })
    
    const result = await response.json()
    if (result.success) {
      console.log(`客户端 ${webSocketClientId.value} 已订阅 ${symbolToUse} 的价格更新`)
      currentSubscriptionSymbol.value = symbolToUse
      startPricePolling()
    } else {
      console.error('订阅价格更新失败:', result.message)
    }
  } catch (error) {
    console.error('订阅价格更新失败:', error)
  }
}

// 取消订阅WebSocket价格更新
const unsubscribeFromPriceUpdates = async (): Promise<boolean> => {
  const symbolToUse = props.symbol || 'BTCUSDT'
  
  if (!webSocketClientId.value) {
    console.log('没有clientId，无需取消订阅')
    return true
  }
  
  const clientId = webSocketClientId.value
  const maxRetries = 2
  const timeout = 3000
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch('/api/websocket/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          symbols: [symbolToUse],
          clientId: clientId
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      const result = await response.json()
      if (result.success) {
        console.log(`✅ 客户端 ${clientId} 已取消订阅 ${symbolToUse} 的价格更新`)
        webSocketClientId.value = ''
        return true
      } else {
        console.warn(`⚠️ 取消订阅失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, result.message)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`⏰ 取消订阅超时 (尝试 ${attempt + 1}/${maxRetries + 1})`)
      } else {
        console.warn(`⚠️ 取消订阅失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error.message)
      }
    }
    
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  console.error(`❌ 取消订阅 ${symbolToUse} 失败，已达到最大重试次数`)
  return false
}

// 轮询获取最新价格
let pricePollingInterval: NodeJS.Timeout | null = null

const startPricePolling = () => {
  if (pricePollingInterval) {
    clearInterval(pricePollingInterval)
  }
  
  pricePollingInterval = setInterval(async () => {
    const symbolToUse = props.symbol || 'BTCUSDT'
    
    try {
      const response = await fetch(`/api/websocket/prices?symbols=${symbolToUse}`)
      const result = await response.json()
      
      if (result.success && result.data?.prices?.[symbolToUse]) {
        const priceData = result.data.prices[symbolToUse]
        handlePriceUpdate({
          symbol: symbolToUse,
          price: priceData.price,
          timestamp: Date.now()
        })
      }
    } catch (error) {
      console.error('获取最新价格失败:', error)
    }
  }, 3000)
}

const stopPricePolling = () => {
  if (pricePollingInterval) {
    clearInterval(pricePollingInterval)
    pricePollingInterval = null
  }
}

// symbol变化处理函数
const handleSymbolChange = async (newSymbol: string, oldSymbol: string) => {
  if (newSymbol && newSymbol !== oldSymbol) {
    console.log(`🔄 Symbol变化: ${oldSymbol} -> ${newSymbol}`)
    
    // 1. 立即清空当前显示的K线数据，避免显示旧数据
    klineData.value = []
    tradeHistory.value = []
    hideTooltip()
    
    // 2. 停止旧的轮询
    stopPricePolling()
    
    // 3. 清理旧的WebSocket订阅
    if (oldSymbol && currentSubscriptionSymbol.value === oldSymbol) {
      console.log(`🔄 清理旧的WebSocket订阅: ${oldSymbol}`)
      await cleanupOldSubscription()
    }
    
    // 4. 重置WebSocket客户端ID，确保新订阅使用新的ID
    webSocketClientId.value = ''
    currentSubscriptionSymbol.value = ''
    
    // 5. 加载新数据
    console.log(`📊 加载新交易对数据: ${newSymbol}`)
    await loadKLineData()
    
    // 6. 重新订阅价格更新
    console.log(`🔗 订阅新交易对价格更新: ${newSymbol}`)
    await subscribeToPriceUpdates()
    
    console.log(`✅ Symbol切换完成: ${oldSymbol} -> ${newSymbol}`)
  }
}

// 创建防抖函数（500ms延迟）
const debouncedHandleSymbolChange = debounce(handleSymbolChange, 500)

// 监听symbol变化（使用防抖）
watch(() => props.symbol, (newSymbol, oldSymbol) => {
  if (newSymbol && newSymbol !== oldSymbol) {
    debouncedHandleSymbolChange(newSymbol, oldSymbol)
  }
})

// 监听timeframe变化
watch(() => props.timeframe, (newTimeframe, oldTimeframe) => {
  if (newTimeframe && newTimeframe !== oldTimeframe) {
    selectedTimeframe.value = newTimeframe
    loadKLineData()
  }
})

// 组件挂载时初始化
onMounted(() => {
  loadKLineData()
  fetchWebSocketStatus()
  subscribeToPriceUpdates()
  loadTradeHistory()
})

// 组件卸载前同步清理
onBeforeUnmount(() => {
  stopPricePolling()
})

// 组件卸载时异步清理
onUnmounted(async () => {
  await unsubscribeFromPriceUpdates()
})
</script>

<style scoped>
.kline-chart-simple-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 1px solid #e4e7ed;
  overflow: hidden;
  transition: all 0.3s ease;
}

.kline-chart-simple-container:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
}

.chart-container {
  position: relative;
}

/* 深色主题 */
:global(.dark) .kline-chart-simple-container {
  background: #1a1a1a;
  border-color: #333;
}

:global(.dark) .kline-chart-simple-container:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
}
</style>