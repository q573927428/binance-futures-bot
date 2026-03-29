<template>
  <div class="kline-chart-simple-container">
    <!-- 图表控制栏 -->
    <div class="chart-controls">
      <div class="controls-left">
        <div class="symbol-badge">{{ selectedSymbol }}</div>
        
        <el-select
          v-model="selectedSymbol"
          placeholder="选择交易对"
          size="small"
          style="width: 120px"
          @change="loadKLineData"
        >
          <el-option label="BTCUSDT" value="BTCUSDT" />
          <el-option label="ETHUSDT" value="ETHUSDT" />
          <el-option label="BNBUSDT" value="BNBUSDT" />
        </el-select>

        <el-select
          v-model="selectedTimeframe"
          placeholder="选择周期"
          size="small"
          style="width: 100px; margin-left: 8px"
          @change="loadKLineData"
        >
          <el-option label="15分钟" value="15m" />
          <el-option label="1小时" value="1h" />
          <el-option label="4小时" value="4h" />
          <el-option label="日线" value="1d" />
          <el-option label="周线" value="1w" />
        </el-select>

        <el-select
          v-model="theme"
          placeholder="主题"
          size="small"
          style="width: 100px; margin-left: 8px"
          @change="toggleTheme"
        >
          <el-option label="浅色" value="light" />
          <el-option label="深色" value="dark" />
        </el-select>
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

/* 图表容器 */
.chart-wrapper {
  position: relative;
  min-height: 500px;
  margin: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  background: #f8f9fa;
}

.kline-chart {
  width: 100%;
  min-height: 500px;
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

/* 响应式设计 - 平板端 (768px以下) */
@media (max-width: 768px) {
  .chart-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 12px 16px;
  }
  
  .controls-left {
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
  
  .controls-left .el-select {
    flex: 1;
    min-width: 120px;
  }
  
  .controls-right .el-button-group {
    display: flex;
    justify-content: center;
    width: 100%;
  }
  
  .controls-right .el-button {
    flex: 1;
    min-width: 60px;
  }
  
  .chart-wrapper {
    margin: 12px;
    min-height: 400px;
  }
  
  .kline-chart {
    min-height: 400px;
  }
  
  .chart-info {
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
  }
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
  
  .controls-left .el-select {
    width: 100% !important;
    margin-left: 0 !important;
    margin-bottom: 0;
  }
  
  .controls-left .el-select:last-child {
    margin-bottom: 0;
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
    min-height: 300px;
    margin: 8px;
    border-radius: 6px;
  }
  
  .kline-chart {
    min-height: 300px;
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
}
</style>
