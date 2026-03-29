<template>
  <div class="kline-chart-simple">
    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="symbol-selector">
        <el-select v-model="selectedSymbol" placeholder="选择交易对" @change="loadKLineData">
          <el-option label="BTCUSDT" value="BTCUSDT" />
          <el-option label="ETHUSDT" value="ETHUSDT" />
          <el-option label="BNBUSDT" value="BNBUSDT" />
        </el-select>
        
        <el-select v-model="selectedTimeframe" placeholder="选择周期" @change="loadKLineData">
          <el-option label="15分钟" value="15m" />
          <el-option label="1小时" value="1h" />
          <el-option label="4小时" value="4h" />
          <el-option label="日线" value="1d" />
          <el-option label="周线" value="1w" />
        </el-select>
        
        <el-button type="primary" @click="loadKLineData" :loading="loading">
          <el-icon><ElIconRefresh /></el-icon>
          刷新
        </el-button>
        
        <el-button @click="toggleTheme">
          <el-icon><ElIconSunny v-if="theme === 'light'" /><ElIconMoon v-else /></el-icon>
          {{ theme === 'light' ? '暗色' : '亮色' }}
        </el-button>
      </div>
      
      <div class="info-display" v-if="klineData.length > 0">
        <span>数据量: {{ klineData.length }} 条</span>
        <span>时间范围: {{ formatTime(klineData[0]?.t || 0) }} - {{ formatTime(klineData[klineData.length - 1]?.t || 0) }}</span>
        <span>最后更新: {{ formatTime(meta.updated) }}</span>
      </div>
    </div>
    
    <!-- 图表容器 -->
    <div ref="chartContainer" class="chart-container"></div>
    
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <el-icon class="loading-icon"><ElIconLoading /></el-icon>
      <span>加载K线数据中...</span>
    </div>
    
    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      <el-alert :title="error" type="error" show-icon />
    </div>
    
    <!-- 无数据提示 -->
    <div v-if="!loading && klineData.length === 0 && !error" class="no-data">
      <el-empty description="暂无K线数据" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { createChart, ColorType, CandlestickSeries, BarSeries } from 'lightweight-charts'
import type { 
  SimpleKLineData,
  KLineApiResponse 
} from '../../types/kline-simple'

// 响应式数据
const selectedSymbol = ref('BTCUSDT')
const selectedTimeframe = ref('1h')
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

// 图表相关
const chartContainer = ref<HTMLElement | null>(null)
let chart: any = null
let candlestickSeries: any = null
let volumeSeries: any = null

// 加载K线数据
const loadKLineData = async () => {
  if (!selectedSymbol.value || !selectedTimeframe.value) {
    error.value = '请选择交易对和周期'
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    const params = new URLSearchParams({
      symbol: selectedSymbol.value,
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
    } else {
      error.value = result.message || '获取数据失败'
      klineData.value = []
    }
  } catch (err: any) {
    console.error('加载K线数据失败:', err)
    error.value = `加载失败: ${err.message}`
    klineData.value = []
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
      secondsVisible: false
    }
  }
  
  chart = createChart(chartContainer.value, chartOptions)
  
  // 添加K线系列 - 使用正确的5.1.0版本API
  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350'
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
  
  // 响应窗口大小变化
  const resizeObserver = new ResizeObserver(() => {
    if (chart && chartContainer.value) {
      chart.applyOptions({ width: chartContainer.value.clientWidth })
    }
  })
  
  resizeObserver.observe(chartContainer.value)
  
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
  
  // 自适应时间范围
  chart.timeScale().fitContent()
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

// 监听主题变化
watch(theme, () => {
  updateChart()
})

// 组件挂载时初始化
onMounted(() => {
  initChart()
  loadKLineData()
})
</script>

<style scoped>
.kline-chart-simple {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.control-panel {
  padding: 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.symbol-selector {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.info-display {
  display: flex;
  gap: 24px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}

.chart-container {
  flex: 1;
  min-height: 500px;
  position: relative;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 1000;
}

.loading-icon {
  font-size: 32px;
  margin-bottom: 12px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-message {
  padding: 16px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .symbol-selector {
    flex-direction: column;
    align-items: stretch;
  }
  
  .info-display {
    flex-direction: column;
    gap: 8px;
  }
  
  .chart-container {
    min-height: 400px;
  }
}
</style>