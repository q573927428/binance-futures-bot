<template>
  <div class="kline-chart-simple-container">
    <!-- 图表控制栏 -->
    <div class="chart-controls">
      <div class="controls-left">
        <div class="symbol-badge">{{ displaySymbol }}</div>

        <div class="timeframe-selector">
          <span class="timeframe-label">周期:</span>
          <div class="timeframe-buttons">
            <el-button
              size="small"
              :type="selectedTimeframe === '15m' ? 'primary' : 'default'"
              @click="selectTimeframe('15m')"
            >
              15分钟
            </el-button>
            <el-button
              size="small"
              :type="selectedTimeframe === '1h' ? 'primary' : 'default'"
              @click="selectTimeframe('1h')"
            >
              1小时
            </el-button>
            <el-button
              size="small"
              :type="selectedTimeframe === '4h' ? 'primary' : 'default'"
              @click="selectTimeframe('4h')"
            >
              4小时
            </el-button>
            <el-button
              size="small"
              :type="selectedTimeframe === '1d' ? 'primary' : 'default'"
              @click="selectTimeframe('1d')"
            >
              日线
            </el-button>
            <el-button
              size="small"
              :type="selectedTimeframe === '1w' ? 'primary' : 'default'"
              @click="selectTimeframe('1w')"
            >
              周线
            </el-button>
          </div>
        </div>

      </div>

      <div class="controls-right">
        <el-button-group size="small">
          <el-button
            type="primary"
            size="small"
            @click="loadKLineData"
            :loading="loading"
            title="刷新图表"
          >
            <el-icon><ElIconRefresh /></el-icon>
          </el-button>
          
          <el-button
            type="info"
            size="small"
            @click="toggleTheme"
            title="切换主题"
          >
            <el-icon>
              <ElIconSunny v-if="theme === 'light'" />
              <ElIconMoon v-else />
            </el-icon>
          </el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="chart-wrapper">
      <div ref="chartContainer" class="kline-chart"></div>

      <!-- K线数据浮动面板 -->
      <div 
        ref="tooltipRef" 
        class="kline-tooltip"
        :class="{ 'tooltip-visible': tooltipVisible }"
        :style="tooltipStyle"
      >
        <div class="tooltip-content">
          <span class="symbol">{{ displaySymbol }}</span>
          <span class="symbol-info">永续 Binance</span>
          <span class="timeframe">{{ selectedTimeframe }}</span>
          <!-- <span class="time">{{ tooltipTime }}</span> -->
          <span class="data-item">
            <span class="label">开=</span>
            <span class="value" :class="{ 'price-up': tooltipData.close > tooltipData.open, 'price-down': tooltipData.close < tooltipData.open }">
              {{ formatPrice(tooltipData.open) }}
            </span>
          </span>
          <span class="data-item">
            <span class="label">高=</span>
            <span class="value" :class="{ 'price-up': tooltipData.close > tooltipData.open, 'price-down': tooltipData.close < tooltipData.open }">
              {{ formatPrice(tooltipData.high) }}
            </span>
          </span>
          <span class="data-item">
            <span class="label">低=</span>
            <span class="value" :class="{ 'price-up': tooltipData.close > tooltipData.open, 'price-down': tooltipData.close < tooltipData.open }">
              {{ formatPrice(tooltipData.low) }}
            </span>
          </span>
          <span class="data-item">
            <span class="label">收=</span>
            <span class="value" :class="{ 'price-up': tooltipData.close > tooltipData.open, 'price-down': tooltipData.close < tooltipData.open }">
              {{ formatPrice(tooltipData.close) }}
            </span>
          </span>
          <span class="data-item">
            <span class="label">量:</span>
            <span class="value">
              {{ formatVolume(tooltipData.volume) }}
            </span>
          </span>
          <span class="data-item">
            <span class="label">涨跌:</span>
            <span class="value" :class="{ 'price-up': tooltipData.changePercent > 0, 'price-down': tooltipData.changePercent < 0 }">
              {{ formatPercent(tooltipData.changePercent) }}
            </span>
          </span>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="chart-loading">
        <el-skeleton :rows="5" animated />
        <div class="loading-text">正在加载K线数据...</div>
      </div>

      <!-- 错误状态 -->
      <div v-if="error" class="chart-error">
        <el-alert
          :title="error"
          type="error"
          :closable="false"
          show-icon
        />
        <div class="error-actions">
          <el-button type="primary" @click="loadKLineData">
            重试
          </el-button>
        </div>
      </div>


    </div>

    <!-- 图表信息 -->
    <div class="chart-info" v-if="klineData.length > 0">
      <div class="info-row">
        <span class="info-label">数据量:</span>
        <span class="info-value">{{ klineData.length }} 条</span>
      </div>
      <div class="info-row">
        <span class="info-label">时间范围:</span>
        <span class="info-value">{{ formatTime(klineData[0]?.t || 0) }} - {{ formatTime(klineData[klineData.length - 1]?.t || 0) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">最后更新:</span>
        <span class="info-value">{{ formatTime(meta.updated) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { createChart, ColorType, CandlestickSeries, BarSeries, LineSeries } from 'lightweight-charts'
import type { 
  SimpleKLineData,
  KLineApiResponse 
} from '../../types/kline-simple'
import { calculateEMASeries, getEMAColor, getEMAWidth } from '../utils/ema-calculator'
import type { PriceData } from '../../types/websocket'

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

// WebSocket相关
const isWebSocketConnected = ref(false)
const lastPriceUpdate = ref<PriceData | null>(null)
const webSocketClientId = ref<string>('')

// 图表相关
const chartContainer = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
let chart: any = null
let candlestickSeries: any = null
let volumeSeries: any = null
let ema14Series: any = null
let ema120Series: any = null

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
const tooltipStyle = ref({
  left: '20px',
  top: '20px'
})

// EMA周期配置
const emaPeriods = [14, 120]

// 计算显示的symbol（使用默认值如果props.symbol为空）
const displaySymbol = computed(() => {
  return props.symbol || 'BTCUSDT'
})

// 判断是否为DOGE交易对
const isDOGESymbol = computed(() => {
  const symbol = props.symbol || 'BTCUSDT'
  return symbol.toUpperCase().includes('DOGE')
})

// 选择周期
const selectTimeframe = (timeframe: string) => {
  if (selectedTimeframe.value === timeframe) return
  selectedTimeframe.value = timeframe
  loadKLineData()
}

// 加载K线数据
const loadKLineData = async () => {
  // 使用默认值如果symbol为空
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
      limit: '22000' // 最多加载2000条
    })
    
    const response = await fetch(`/api/kline-simple?${params}`)
    const result: KLineApiResponse = await response.json()
    
    if (result.success && result.data) {
      klineData.value = result.data.data
      meta.value = result.data.meta
      
      // 更新图表
      updateChart()
      
      // 显示最新K线数据
      showLatestKline()
    } else {
      error.value = result.message || '获取数据失败'
      klineData.value = []
      // 清空浮动面板数据
      hideTooltip()
    }
  } catch (err: any) {
    console.error('加载K线数据失败:', err)
    error.value = `加载失败: ${err.message}`
    klineData.value = []
    // 清空浮动面板数据
    hideTooltip()
  } finally {
    loading.value = false
  }
}

  // 初始化图表
  const initChart = () => {
    if (!chartContainer.value) return
    
    // 清理现有图表
    if (chart) {
      chart.remove()
    }
    
    // 创建新图表
    const chartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: theme.value === 'dark' ? '#131722' : '#FFFFFF' },
        textColor: theme.value === 'dark' ? '#D9D9D9' : '#191919'
      },
      grid: {
        vertLines: { color: theme.value === 'dark' ? '#2B2B43' : '#F0F3FA' },
        horzLines: { color: theme.value === 'dark' ? '#2B2B43' : '#F0F3FA' }
      },
      width: chartContainer.value.clientWidth,
      height: 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // 右侧留出一点距离，避免K线紧贴Y轴
        borderColor: '#CCCCCC', // X轴颜色设置为浅灰色
        tickMarkFormatter: (time: number) => {
          // 将UTC时间戳转换为本地时间
          const date = new Date(time * 1000)
          return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
        }
      },
      localization: {
        timeFormatter: (time: number) => {
          return new Date(time * 1000).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        }
      },
      rightPriceScale: {
        borderColor: '#CCCCCC', // Y轴边框颜色设置为浅灰色
        textColor: '#333333' // Y轴文字颜色设置为浅灰色
      },
      leftPriceScale: {
        borderColor: '#CCCCCC', // 左侧Y轴边框颜色设置为浅灰色
        textColor: '#333333' // 左侧Y轴文字颜色设置为浅灰色
      }
    }
  
  chart = createChart(chartContainer.value, chartOptions)
  
  // 添加K线系列 - 使用正确的5.1.0版本API
  // 根据交易对类型设置不同的价格格式精度
  const priceFormat = {
    type: 'price' as const,
    precision: isDOGESymbol.value ? 3 : 2,
    minMove: isDOGESymbol.value ? 0.001 : 0.01
  }
  
  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    priceFormat: priceFormat
  })
  
  // 添加成交量系列 - 使用正确的5.1.0版本API
  volumeSeries = chart.addSeries(BarSeries, {
    color: '#26a69a',
    priceFormat: {
      type: 'volume'
    },
    priceScaleId: '' // 使用独立的坐标轴
  })
  
  // 设置成交量坐标轴位置
  chart.priceScale('').applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0
    }
  })
  
  // 添加EMA14线
  ema14Series = chart.addSeries(LineSeries, {
    color: getEMAColor(14),
    lineWidth: getEMAWidth(14),
    title: 'EMA14',
    priceFormat: priceFormat
  })
  
  // 添加EMA120线
  ema120Series = chart.addSeries(LineSeries, {
    color: getEMAColor(120),
    lineWidth: getEMAWidth(120),
    title: 'EMA120',
    priceFormat: priceFormat
  })
  
  // 响应窗口大小变化
  const resizeObserver = new ResizeObserver(() => {
    if (chart && chartContainer.value) {
      chart.applyOptions({ width: chartContainer.value.clientWidth })
    }
  })
  
  resizeObserver.observe(chartContainer.value)
  
  // 监听鼠标移动事件
  chart.subscribeCrosshairMove((param: any) => {
    if (param.time) {
      // 找到对应的K线数据
      const kline = findKlineByTime(param.time)
      if (kline) {
        // 更新浮动面板数据
        updateTooltip(kline, param.point)
      }
    } else {
      // 鼠标离开K线区域，显示最新K线数据
      showLatestKline()
    }
  })
  
  // 初始化时显示最新K线数据
  showLatestKline()
  
  // 清理函数
  onUnmounted(() => {
    resizeObserver.disconnect()
    if (chart) {
      chart.remove()
    }
  })
}

// 更新图表数据
const updateChart = () => {
  if (!chart || !candlestickSeries || !volumeSeries) {
    initChart()
  }
  
  if (klineData.value.length === 0) return
  
  // 准备K线数据
  const candlestickData = klineData.value.map(item => ({
    time: item.t,
    open: item.o,
    high: item.h,
    low: item.l,
    close: item.c
  }))
  
  // 准备成交量数据 - BarSeries需要open、high、low、close字段
  const volumeData = klineData.value.map(item => {
    const volumeValue = item.v || 0
    return {
      time: item.t,
      open: volumeValue,
      high: volumeValue,
      low: 0,
      close: volumeValue,
      color: item.c >= item.o ? '#26a69a' : '#ef5350'
    }
  })
  
  // 设置数据
  candlestickSeries.setData(candlestickData)
  volumeSeries.setData(volumeData)
  
  // 计算并设置EMA数据
  if (ema14Series && ema120Series) {
    // 计算EMA14数据
    const ema14Data = calculateEMASeries(klineData.value, 14)
    if (ema14Data.length > 0) {
      ema14Series.setData(ema14Data)
    }
    
    // 计算EMA120数据
    const ema120Data = calculateEMASeries(klineData.value, 120)
    if (ema120Data.length > 0) {
      ema120Series.setData(ema120Data)
    }
  }
  
  // 设置默认显示200根K线
  if (candlestickData.length > 0) {
    const visibleBarCount = 200
    const totalBars = candlestickData.length
    
    // 如果数据量少于200根，显示所有数据
    if (totalBars <= visibleBarCount) {
      chart.timeScale().fitContent()
    } else {
      // 显示最新的200根K线
      const fromIndex = totalBars - visibleBarCount
      const fromItem = candlestickData[fromIndex]
      const toItem = candlestickData[totalBars - 1]
      
      if (fromItem && toItem) {
        // 先设置可见范围
        chart.timeScale().setVisibleRange({
          from: fromItem.time,
          to: toItem.time
        })
        
        // 然后应用rightOffset，确保右侧有留白
        // 使用setTimeout确保在下一帧应用，避免冲突
        setTimeout(() => {
          if (chart) {
            chart.timeScale().applyOptions({
              rightOffset: 12
            })
          }
        }, 0)
      } else {
        chart.timeScale().fitContent()
      }
    }
  }
}

// 切换主题
const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  
  if (chart) {
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.value === 'dark' ? '#131722' : '#FFFFFF' },
        textColor: theme.value === 'dark' ? '#D9D9D9' : '#191919'
      },
      grid: {
        vertLines: { color: theme.value === 'dark' ? '#2B2B43' : '#F0F3FA' },
        horzLines: { color: theme.value === 'dark' ? '#2B2B43' : '#F0F3FA' }
      }
    })
  }
}

// 格式化时间
const formatTime = (timestamp: number): string => {
  if (!timestamp) return '--'
  
  const date = new Date(timestamp * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 格式化价格
const formatPrice = (price: number): string => {
  if (!price) return '--'
  const precision = isDOGESymbol.value ? 3 : 2
  return price.toFixed(precision)
}

// 格式化成交量
const formatVolume = (volume: number): string => {
  if (!volume) return '--'
  if (volume >= 1000000) {
    return (volume / 1000000).toFixed(2) + 'M'
  } else if (volume >= 1000) {
    return (volume / 1000).toFixed(2) + 'K'
  }
  return volume.toFixed(2)
}

// 格式化百分比
const formatPercent = (percent: number): string => {
  if (!percent) return '--'
  return (percent > 0 ? '+' : '') + percent.toFixed(2) + '%'
}

// 根据时间查找K线数据
const findKlineByTime = (time: number): SimpleKLineData | null => {
  if (!klineData.value.length) return null
  
  // 使用二分查找找到最接近的时间
  let left = 0
  let right = klineData.value.length - 1
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midKline = klineData.value[mid]
    if (!midKline) return null
    
    const midTime = midKline.t
    
    if (midTime === time) {
      return midKline
    } else if (midTime < time) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  
  // 如果没有精确匹配，返回最接近的数据
  if (right >= 0 && right < klineData.value.length) {
    const kline = klineData.value[right]
    return kline || null
  }
  
  return null
}

// 更新浮动面板数据
const updateTooltip = (kline: SimpleKLineData, point?: { x: number; y: number }) => {
  if (!kline) return
  
  // 计算涨跌幅
  const changePercent = ((kline.c - kline.o) / kline.o) * 100
  
  // 更新数据
  tooltipData.value = {
    open: kline.o,
    high: kline.h,
    low: kline.l,
    close: kline.c,
    volume: kline.v || 0,
    changePercent
  }
  
  // 更新时间
  tooltipTime.value = formatTime(kline.t)
  
  // 显示面板
  tooltipVisible.value = true
  
  // 如果需要，可以更新面板位置（这里固定在左上角）
  if (point && chartContainer.value) {
    const containerRect = chartContainer.value.getBoundingClientRect()
    tooltipStyle.value = {
      left: '20px',
      top: '20px'
    }
  }
}

// 隐藏浮动面板
const hideTooltip = () => {
  tooltipVisible.value = false
}

// 显示最新K线数据
const showLatestKline = () => {
  if (klineData.value.length > 0) {
    const latestKline = klineData.value[klineData.value.length - 1]
    if (latestKline) {
      updateTooltip(latestKline)
    }
  }
}

// 监听symbol变化
watch(() => props.symbol, (newSymbol, oldSymbol) => {
  if (newSymbol && newSymbol !== oldSymbol) {
    console.log('Symbol changed:', oldSymbol, '->', newSymbol)
    // 重新初始化图表以应用新的价格格式
    if (chart) {
      chart.remove()
      chart = null
      candlestickSeries = null
      volumeSeries = null
      ema14Series = null
      ema120Series = null
    }
    
    // 停止旧的轮询
    stopPricePolling()
    
    // 加载新数据
    loadKLineData()
    
    // 重新订阅价格更新
    subscribeToPriceUpdates()
  }
})

// 监听timeframe变化
watch(() => props.timeframe, (newTimeframe, oldTimeframe) => {
  if (newTimeframe && newTimeframe !== oldTimeframe) {
    selectedTimeframe.value = newTimeframe
    loadKLineData()
  }
})

// 监听主题变化
watch(theme, () => {
  updateChart()
})

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
  
  // 如果当前没有K线数据，不处理
  if (klineData.value.length === 0) return
  
  // 获取最后一根K线
  const lastKline = klineData.value[klineData.value.length - 1]
  if (!lastKline) return
  
  // 获取当前时间
  const now = Math.floor(Date.now() / 1000)
  
  // 根据周期计算当前K线的时间戳
  const timeframeSeconds = getTimeframeSeconds(selectedTimeframe.value)
  const currentKlineTimestamp = Math.floor(now / timeframeSeconds) * timeframeSeconds
  
  // 检查是否是最后一根K线（当前K线）
  if (lastKline.t === currentKlineTimestamp) {
    // 更新最后一根K线的数据
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
  
  // 创建更新后的K线数据
  const updatedKline = {
    ...lastKline,
    c: price, // 更新收盘价
    h: Math.max(lastKline.h, price), // 更新最高价
    l: Math.min(lastKline.l, price), // 更新最低价
    v: lastKline.v + 0.01 // 增加一点成交量（模拟）
  }
  
  // 更新数据数组
  klineData.value[lastIndex] = updatedKline
  
  // 更新图表
  updateChartWithLastKline(updatedKline)
  
  // 如果当前显示的是最后一根K线，更新浮动面板
  if (tooltipVisible.value) {
    const currentKline = findKlineByTime(lastKline.t)
    if (currentKline && currentKline.t === lastKline.t) {
      updateTooltip(updatedKline)
    }
  }
  
  // 更新元数据更新时间
  meta.value.updated = timestamp
}

// 更新图表中的最后一根K线
const updateChartWithLastKline = (updatedKline: SimpleKLineData) => {
  if (!chart || !candlestickSeries || !volumeSeries) return
  
  // 更新K线数据
  const candlestickData = {
    time: updatedKline.t,
    open: updatedKline.o,
    high: updatedKline.h,
    low: updatedKline.l,
    close: updatedKline.c
  }
  
  // 更新成交量数据
  const volumeData = {
    time: updatedKline.t,
    open: updatedKline.v || 0,
    high: updatedKline.v || 0,
    low: 0,
    close: updatedKline.v || 0,
    color: updatedKline.c >= updatedKline.o ? '#26a69a' : '#ef5350'
  }
  
  // 更新图表数据
  candlestickSeries.update(candlestickData)
  volumeSeries.update(volumeData)
  
  // 重新计算EMA数据
  if (ema14Series && ema120Series) {
    // 计算EMA14数据
    const ema14Data = calculateEMASeries(klineData.value, 14)
    if (ema14Data.length > 0) {
      const lastEma14 = ema14Data[ema14Data.length - 1]
      if (lastEma14) {
        ema14Series.update(lastEma14)
      }
    }
    
    // 计算EMA120数据
    const ema120Data = calculateEMASeries(klineData.value, 120)
    if (ema120Data.length > 0) {
      const lastEma120 = ema120Data[ema120Data.length - 1]
      if (lastEma120) {
        ema120Series.update(lastEma120)
      }
    }
  }
}

// 生成客户端ID
const generateClientId = (): string => {
  return `kline_chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 订阅WebSocket价格更新
const subscribeToPriceUpdates = async () => {
  const symbolToUse = props.symbol || 'BTCUSDT'
  
  try {
    // 如果没有clientId，生成一个
    if (!webSocketClientId.value) {
      webSocketClientId.value = generateClientId()
    }
    
    // 订阅价格更新
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
      
      // 设置轮询获取价格更新（因为WebSocket管理器在服务器端）
      // 这里使用轮询方式获取最新价格
      startPricePolling()
    } else {
      console.error('订阅价格更新失败:', result.message)
    }
  } catch (error) {
    console.error('订阅价格更新失败:', error)
  }
}

// 取消订阅WebSocket价格更新
const unsubscribeFromPriceUpdates = async () => {
  const symbolToUse = props.symbol || 'BTCUSDT'
  
  try {
    if (!webSocketClientId.value) {
      console.log('没有clientId，无需取消订阅')
      return
    }
    
    // 调用取消订阅API
    const response = await fetch('/api/websocket/unsubscribe', {
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
      console.log(`客户端 ${webSocketClientId.value} 已取消订阅 ${symbolToUse} 的价格更新`)
    } else {
      console.error('取消订阅价格更新失败:', result.message)
    }
  } catch (error) {
    console.error('取消订阅价格更新失败:', error)
  }
}

// 轮询获取最新价格
let pricePollingInterval: NodeJS.Timeout | null = null

const startPricePolling = () => {
  if (pricePollingInterval) {
    clearInterval(pricePollingInterval)
  }
  
  // 每3秒获取一次最新价格
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
  }, 3000) // 3秒轮询一次
}

const stopPricePolling = () => {
  if (pricePollingInterval) {
    clearInterval(pricePollingInterval)
    pricePollingInterval = null
  }
}

// 组件挂载时初始化
onMounted(() => {
  initChart()
  loadKLineData()
  
  // 获取WebSocket状态
  fetchWebSocketStatus()
  
  // 订阅价格更新
  subscribeToPriceUpdates()
})

// 组件卸载时清理
onUnmounted(() => {
  stopPricePolling()
  
  // 取消订阅价格更新
  unsubscribeFromPriceUpdates()
  
  // 清理图表
  if (chart) {
    chart.remove()
  }
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

/* 图表控制栏 */
.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e4e7ed;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.controls-right {
  display: flex;
  align-items: center;
}

.symbol-badge {
  background: #409eff;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

/* 周期选择器 */
.timeframe-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeframe-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.timeframe-buttons {
  display: flex;
  gap: 4px;
}

.timeframe-buttons .el-button {
  min-width: 60px;
  padding: 6px 8px;
  font-size: 12px;
}

/* 图表容器 */
.chart-wrapper {
  position: relative;
  min-height: 450px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  background: #f8f9fa;
}

.kline-chart {
  width: 100%;
  min-height: 450px;
}

/* 加载状态 */
.chart-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 60px 20px;
  text-align: center;
  background: white;
  z-index: 10;
}

.loading-text {
  margin-top: 20px;
  color: #6c757d;
  font-size: 16px;
  font-weight: 500;
}

/* 错误状态 */
.chart-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 60px 20px;
  text-align: center;
  background: white;
  z-index: 10;
}

.error-actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  gap: 16px;
}

/* 无数据提示 */
.no-data {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  z-index: 10;
}

/* K线数据浮动面板 */
.kline-tooltip {
  position: absolute;
  left: 20px;
  top: 20px;
  background: transparent;
  z-index: 20;
  opacity: 0;
  transform: translateY(-10px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.kline-tooltip.tooltip-visible {
  opacity: 1;
  transform: translateY(0);
}

.tooltip-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
}

.tooltip-content .symbol {
  font-weight: 600;
  color: #409eff;
}

.tooltip-content .timeframe {
  font-size: 11px;
  color: #6c757d;
  background: #f0f2f5;
  padding: 1px 4px;
  border-radius: 3px;
}

.tooltip-content .time {
  font-size: 11px;
  color: #6c757d;
}

.tooltip-content .data-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tooltip-content .data-item .label {
  color: #6c757d;
  /* font-weight: 500; */
  font-size: 11px;
}

.tooltip-content .data-item .value {
  font-weight: 600;
  font-family: 'Courier New', monospace;
  min-width: 50px;
  text-align: right;
  padding-top: 3px;
}

.tooltip-content .data-item .value.price-up {
  color: #67c23a;
}

.tooltip-content .data-item .value.price-down {
  color: #f56c6c;
}

/* 深色主题下的浮动面板 */
:global(.dark) .kline-tooltip {
  background: transparent;
}

:global(.dark) .tooltip-content {
  color: #e4e7ed;
}

:global(.dark) .tooltip-content .symbol {
  color: #66b3ff;
}

:global(.dark) .tooltip-content .timeframe {
  background: #2c2e33;
  color: #a0a4ad;
}

:global(.dark) .tooltip-content .time {
  color: #a0a4ad;
}

:global(.dark) .tooltip-content .data-item .label {
  color: #a0a4ad;
}

:global(.dark) .tooltip-content .data-item .value.price-up {
  color: #85ce61;
}

:global(.dark) .tooltip-content .data-item .value.price-down {
  color: #f78989;
}

/* 图表信息 */
.chart-info {
  padding: 12px 20px;
  background: #f8f9fa;
  border-top: 1px solid #e4e7ed;
  display: flex;
  gap: 24px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-label {
  color: #6c757d;
  font-size: 14px;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  font-weight: 600;
}

/* 响应式设计 - 手机端 (480px以下) */
@media (max-width: 480px) {
  .symbol-badge {
    font-size: 12px;
    padding: 3px 8px;
    margin-bottom: 8px;
    text-align: center;
    width: 100%;
  }
  
  .chart-controls {
    padding: 10px 12px;
    gap: 10px;
  }
  
  .controls-left {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 100%;
  }
  
  .timeframe-selector {
    width: 100%;
  }
  
  .timeframe-label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
  }
  
  .timeframe-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    width: 100%;
  }
  
  .timeframe-buttons .el-button {
    min-width: auto;
    width: 100%;
    padding: 4px 2px;
    font-size: 11px;
  }
  
  .controls-right {
    width: 100%;
  }
  
  .controls-right .el-button-group {
    display: flex;
    width: 100%;
    gap: 4px;
  }
  
  .controls-right .el-button {
    flex: 1;
    padding: 8px 4px;
    font-size: 12px;
    min-height: 36px;
  }
  
  .controls-right .el-button .el-icon {
    font-size: 14px;
  }
  
  /* 优化按钮图标显示 */
  .controls-right .el-button span {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .chart-wrapper {
    min-height: 250px;
    margin: 8px;
    border-radius: 6px;
  }
  
  .kline-chart {
    min-height: 250px;
  }
  
  .chart-loading,
  .chart-error {
    padding: 30px 10px;
  }
  
  .loading-text {
    font-size: 14px;
  }
  
  .error-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .error-actions .el-button {
    width: 100%;
  }
  
  .no-data {
    padding: 20px;
  }
  
  .chart-info {
    padding: 10px 12px;
  }
  
  .info-row {
    justify-content: space-between;
  }
  
  /* 移动端浮动面板优化 */
  .kline-tooltip {
    left: 10px !important;
    top: 10px !important;
  }
  
  .tooltip-content {
    font-size: 11px;
    gap: 4px;
    flex-wrap: wrap;
    max-width: 95vw;
  }
  
  .tooltip-content .symbol,
  .tooltip-content .timeframe,
  .tooltip-content .time {
    font-size: 10px;
  }
  
  .tooltip-content .data-item {
    font-size: 10px;
  }
  
  .tooltip-content .data-item .value {
    min-width: 40px;
    font-size: 10px;
  }
}
</style>
