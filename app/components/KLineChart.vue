<template>
  <div class="kline-chart-container">
    <!-- 图表控制栏 -->
    <div class="chart-controls" v-if="showControls">
      <div class="controls-left">
        <div class="symbol-badge">{{ symbol }}</div>
        
        <el-select
          v-model="timeframe"
          placeholder="时间周期"
          size="small"
          style="width: 100px"
          @change="handleTimeframeChange"
        >
          <el-option label="15分钟" value="15m" />
          <el-option label="1小时" value="1h" />
          <el-option label="4小时" value="4h" />
          <el-option label="1天" value="1d" />
          <el-option label="1周" value="1w" />
        </el-select>

        <el-select
          v-model="chartType"
          placeholder="图表类型"
          size="small"
          style="width: 100px; margin-left: 8px"
          @change="updateChart"
        >
          <el-option label="蜡烛图" value="candlestick" />
          <el-option label="线图" value="line" />
          <el-option label="面积图" value="area" />
          <el-option label="柱状图" value="bar" />
        </el-select>

        <el-select
          v-model="theme"
          placeholder="主题"
          size="small"
          style="width: 100px; margin-left: 8px"
          @change="updateChart"
        >
          <el-option label="深色" value="dark" />
          <el-option label="浅色" value="light" />
        </el-select>

        <el-checkbox
          v-model="showVolume"
          style="margin-left: 12px"
          @change="updateChart"
        >
          显示成交量
        </el-checkbox>
      </div>

      <div class="controls-right">
        <el-button-group size="small">
          <el-button
            type="primary"
            size="small"
            @click="refreshChart"
            :loading="isLoading"
            title="刷新图表"
          >
            <el-icon><ElIconRefresh /></el-icon>
          </el-button>
          
          <el-button
            type="info"
            size="small"
            @click="toggleFullscreen"
            title="切换全屏"
          >
            <el-icon>
              <ElIconFullScreen v-if="!isFullscreen" />
              <ElIconClose v-else />
            </el-icon>
          </el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="chart-wrapper" :class="{ 'fullscreen': isFullscreen }">
      <div 
        ref="chartContainer"
        class="kline-chart"
        :style="{ 
          height: chartHeight,
          width: '100%'
        }"
      ></div>

      <!-- 加载状态 -->
      <div 
        v-if="isLoading && !chartError" 
        class="chart-loading"
      >
        <el-skeleton :rows="5" animated />
        <div class="loading-text">正在加载K线数据...</div>
      </div>

      <!-- 错误状态 -->
      <div 
        v-if="chartError" 
        class="chart-error"
      >
        <el-alert
          :title="chartError"
          type="error"
          :closable="false"
          show-icon
        />
        <div class="error-actions">
          <el-button type="primary" @click="initChart">
            重试
          </el-button>
        </div>
      </div>

      <!-- 无限加载提示 -->
      <div 
        v-if="isLoadingMore" 
        class="loading-more"
      >
        <el-icon class="loading-icon"><ElIconLoading /></el-icon>
        <span>正在加载更多历史数据...</span>
      </div>
    </div>

    <!-- 图表信息 -->
    <div class="chart-info" v-if="showInfo && currentPrice">
      <div class="info-row">
        <span class="info-label">当前价格:</span>
        <span class="info-value" :class="getPriceColorClass()">
          {{ formatPrice(currentPrice) }}
        </span>
      </div>
      <div class="info-row" v-if="priceChange !== null">
        <span class="info-label">涨跌幅:</span>
        <span class="info-value" :class="getChangeColorClass(priceChange)">
          {{ priceChange > 0 ? '+' : '' }}{{ priceChange.toFixed(2) }}%
        </span>
      </div>
      <div class="info-row" v-if="volume">
        <span class="info-label">成交量:</span>
        <span class="info-value">{{ formatVolume(volume) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries, BarSeries } from 'lightweight-charts'
import type { 
  KLineData, 
  KLineTimeframe,
  LightweightChartData,
  ChartConfig 
} from '../../types/kline'

// Props
const props = defineProps<{
  symbol: string
  timeframe?: KLineTimeframe
  showControls?: boolean
  showInfo?: boolean
  height?: string
  autoLoad?: boolean
  limit?: number
}>()

// Emits
const emit = defineEmits<{
  'timeframe-change': [timeframe: KLineTimeframe]
  'chart-ready': []
  'chart-error': [error: string]
}>()

// 响应式数据
const timeframe = ref<KLineTimeframe>(props.timeframe || '1h')
const chartType = ref<'candlestick' | 'line' | 'area' | 'bar'>('candlestick')
const theme = ref<'light' | 'dark'>('light')
const showVolume = ref(true)
const isFullscreen = ref(false)
const isLoading = ref(false)
const isLoadingMore = ref(false)
const chartError = ref('')
const currentPrice = ref<number | null>(null)
const priceChange = ref<number | null>(null)
const volume = ref<number | null>(null)

// 图表实例
const chartContainer = ref<HTMLDivElement>()
let chart: any = null
let series: any = null
let volumeSeries: any = null

// 数据管理
const chartData = ref<LightweightChartData[]>([])
const allLoadedData = ref<KLineData[]>([])
const hasMoreData = ref(true)
const lastLoadedTimestamp = ref<number | null>(null)

// 计算属性
const chartHeight = computed(() => {
  if (isFullscreen.value) {
    return 'calc(100vh - 100px)'
  }
  return props.height || '500px'
})

// 监听symbol变化
watch(() => props.symbol, (newSymbol) => {
  if (newSymbol) {
    resetChart()
    loadChartData()
  }
})

// 监听timeframe变化
watch(() => props.timeframe, (newTimeframe) => {
  if (newTimeframe && newTimeframe !== timeframe.value) {
    timeframe.value = newTimeframe
    resetChart()
    loadChartData()
  }
})

// 组件挂载
onMounted(() => {
  if (props.autoLoad !== false) {
    nextTick(() => {
      initChart()
    })
  }
})

// 组件卸载
onUnmounted(() => {
  destroyChart()
})

// 初始化图表
async function initChart() {
  if (!props.symbol) {
    chartError.value = '缺少交易对'
    return
  }

  destroyChart()
  
  isLoading.value = true
  chartError.value = ''
  
  try {
    // 等待DOM渲染完成
    await nextTick()
    
    if (!chartContainer.value) {
      throw new Error('图表容器未找到')
    }
    
    // 创建图表
    chart = createChart(chartContainer.value, {
      layout: {
        background: { 
          type: ColorType.Solid, 
          color: theme.value === 'dark' ? '#131722' : '#FFFFFF' 
        },
        textColor: theme.value === 'dark' ? '#D9D9D9' : '#191919',
      },
      grid: {
        vertLines: {
          color: theme.value === 'dark' ? '#2B2B43' : '#F0F3FA',
        },
        horzLines: {
          color: theme.value === 'dark' ? '#2B2B43' : '#F0F3FA',
        },
      },
      width: chartContainer.value.clientWidth,
      height: chartContainer.value.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: theme.value === 'dark' ? '#2B2B43' : '#D6DCDE',
      },
      rightPriceScale: {
        borderColor: theme.value === 'dark' ? '#2B2B43' : '#D6DCDE',
      },
      crosshair: {
        mode: 1, // Normal mode
      },
    })
    
    // 创建主系列
    switch (chartType.value) {
      case 'candlestick':
        series = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        })
        break
      case 'line':
        series = chart.addSeries(LineSeries, {
          color: '#2962FF',
          lineWidth: 2,
        })
        break
      case 'area':
        series = chart.addSeries(AreaSeries, {
          topColor: 'rgba(41, 98, 255, 0.4)',
          bottomColor: 'rgba(41, 98, 255, 0)',
          lineColor: '#2962FF',
          lineWidth: 2,
        })
        break
      case 'bar':
        series = chart.addSeries(BarSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
        })
        break
    }
    
    // 创建成交量系列
    if (showVolume.value) {
      volumeSeries = chart.addSeries(BarSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '', // 使用独立的价格刻度
      })
      
      // 设置成交量系列的位置
      chart.priceScale('').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      })
    }
    
    // 加载数据
    await loadChartData()
    
    // 设置无限加载监听
    setupInfiniteLoading()
    
    // 设置图表事件监听
    setupChartEvents()
    
    emit('chart-ready')
    
  } catch (error: any) {
    console.error('初始化图表失败:', error)
    chartError.value = `加载图表失败: ${error.message || '未知错误'}`
    emit('chart-error', chartError.value)
  } finally {
    isLoading.value = false
  }
}

function isValidCandle(
  item: any
): item is LightweightChartData {
  return (
    item &&
    Number.isFinite(item.open) &&
    Number.isFinite(item.high) &&
    Number.isFinite(item.low) &&
    Number.isFinite(item.close) &&
    Number.isFinite(item.time)
  )
}
// 加载图表数据 - 修复版本，恢复同步数据功能
async function loadChartData() {
  if (!props.symbol || !timeframe.value) {
    return
  }
  
  try {
    const limit = props.limit || 20000
    
    // 构建API请求URL
    const params = new URLSearchParams({
      symbol: props.symbol,
      timeframe: timeframe.value,
      limit: limit.toString()
    })
    
    if (lastLoadedTimestamp.value) {
      params.append('to', lastLoadedTimestamp.value.toString())
    }
    
    console.log('正在请求K线数据...', props.symbol, timeframe.value)
    
    const response = await fetch(`/api/kline?${params}`)
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || '获取数据失败')
    }
    
    const { data, metadata } = result.data
    
    if (data.length === 0) {
      chartError.value = '没有找到K线数据'
      return
    }
    
    console.log('收到K线数据条数:', data.length)
    
    // 数据转换 - 直接创建普通对象，避免Proxy问题
    const chartDataItems = data.map((item: KLineData) => {
      // 创建普通对象，不是响应式对象
      return {
        time: Number(item.timestamp),
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume || 0)
      }
    })
    
    // 确保数据按时间排序
    chartDataItems.sort((a: LightweightChartData, b: LightweightChartData) => a.time - b.time)
    
    console.log('转换后的第一条数据:', JSON.stringify(chartDataItems[0]))
    
    // 直接使用普通对象数组，不存入响应式变量
    const plainData = chartDataItems.map((item: LightweightChartData) => ({ ...item }))
    
    // 更新数据
    if (lastLoadedTimestamp.value) {
      // 加载更早的数据，添加到前面
      chartData.value = [...plainData, ...chartData.value]
      allLoadedData.value = [...data, ...allLoadedData.value]
    } else {
      // 首次加载
      chartData.value = plainData
      allLoadedData.value = data
    }
    
    // 更新最后加载的时间戳
    lastLoadedTimestamp.value = metadata.firstTimestamp - 1
    
    // 更新是否有更多数据
    hasMoreData.value = metadata.hasMore
    
    // 设置图表数据
    if (series) {
      console.log('设置主系列数据...')
      series.setData(chartData.value)
      console.log('主系列数据设置完成')
    }
    
    // 设置成交量数据 - 修复版本
    if (volumeSeries && showVolume.value) {
      console.log('设置成交量数据...')
      // Lightweight Charts的BarSeries期望的数据结构：需要open、high、low、close字段
      const volumeData = chartData.value.map((item: LightweightChartData) => {
        // 对于成交量，我们使用volume作为open/close，其他字段设为相同值
        const volumeValue = item.volume || 0
        return {
          time: item.time,
          open: volumeValue,
          high: volumeValue,
          low: 0,
          close: volumeValue,
          color: item.close >= item.open ? '#26a69a' : '#ef5350'
        }
      })
      console.log('成交量数据示例:', JSON.stringify(volumeData.slice(0, 1)))
      volumeSeries.setData(volumeData)
      console.log('成交量数据设置完成')
    }
    
    // 更新当前价格
    updatePriceInfo()
    
    console.log('K线数据加载完成')
    
  } catch (error: any) {
    console.error('加载K线数据失败:', error)
    chartError.value = `加载数据失败: ${error.message || '未知错误'}`
    emit('chart-error', chartError.value)
  }
}

// 设置无限加载
function setupInfiniteLoading() {
  if (!chart) return
  
  chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange: any) => {
    if (!logicalRange || isLoadingMore.value || !hasMoreData.value) {
      return
    }
    
    // 检查是否需要加载更早的数据
    if (logicalRange.from < 10) {
      loadMoreData()
    }
  })
}

// 加载更多数据
async function loadMoreData() {
  if (isLoadingMore.value || !hasMoreData.value) {
    return
  }
  
  isLoadingMore.value = true
  
  try {
    await loadChartData()
  } catch (error: any) {
    console.error('加载更多数据失败:', error)
  } finally {
    isLoadingMore.value = false
  }
}

// 设置图表事件监听
function setupChartEvents() {
  if (!chart || !series) return
  
  // 订阅十字光标移动事件
  chart.subscribeCrosshairMove((param: any) => {
    if (!param.time || !param.seriesPrices) {
      return
    }
    
    const price = param.seriesPrices.get(series)
    if (price) {
      currentPrice.value = price
    }
  })
}

  // 更新价格信息
  function updatePriceInfo() {
    if (chartData.value.length < 2) return
    
    const latest = chartData.value[chartData.value.length - 1]
    const previous = chartData.value[chartData.value.length - 2]
    
    if (latest && previous) {
      currentPrice.value = latest.close
      volume.value = latest.volume || 0
      
      if (previous.close > 0) {
        priceChange.value = ((latest.close - previous.close) / previous.close) * 100
      }
    }
  }

// 处理时间周期变化
function handleTimeframeChange(newTimeframe: KLineTimeframe) {
  timeframe.value = newTimeframe
  resetChart()
  loadChartData()
  emit('timeframe-change', newTimeframe)
}

// 更新图表
function updateChart() {
  if (chart) {
    destroyChart()
    initChart()
  }
}

// 刷新图表
function refreshChart() {
  resetChart()
  loadChartData()
}

// 切换全屏
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  
  if (chart) {
    setTimeout(() => {
      chart.resize(chartContainer.value?.clientWidth || 0, chartContainer.value?.clientHeight || 0)
      chart.timeScale().fitContent()
    }, 100)
  }
}

// 重置图表
function resetChart() {
  chartData.value = []
  allLoadedData.value = []
  lastLoadedTimestamp.value = null
  hasMoreData.value = true
  currentPrice.value = null
  priceChange.value = null
  volume.value = null
}

// 销毁图表
function destroyChart() {
  if (chart) {
    chart.remove()
    chart = null
    series = null
    volumeSeries = null
  }
}

// 格式化价格
function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else if (price >= 1) {
    return price.toFixed(2)
  } else {
    return price.toFixed(6)
  }
}

// 格式化成交量
function formatVolume(vol: number): string {
  if (vol >= 1000000) {
    return `${(vol / 1000000).toFixed(2)}M`
  } else if (vol >= 1000) {
    return `${(vol / 1000).toFixed(2)}K`
  } else {
    return vol.toFixed(2)
  }
}

// 获取价格颜色类
function getPriceColorClass(): string {
  if (!priceChange.value) return ''
  return priceChange.value > 0 ? 'price-up' : priceChange.value < 0 ? 'price-down' : ''
}

// 获取涨跌幅颜色类
function getChangeColorClass(change: number): string {
  return change > 0 ? 'price-up' : change < 0 ? 'price-down' : ''
}

// 暴露方法给父组件
defineExpose({
  refreshChart,
  initChart,
  destroyChart
})
</script>

<style scoped>
.kline-chart-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 1px solid #e4e7ed;
  overflow: hidden;
  margin-bottom: 20px;
  transition: all 0.3s ease;
}

.kline-chart-container:hover {
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

.chart-wrapper.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  margin: 0;
  border-radius: 0;
  border: none;
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

/* 无限加载提示 */
.loading-more {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 5;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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

.info-value.price-up {
  color: #26a69a;
}

.info-value.price-down {
  color: #ef5350;
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
  
  .loading-more {
    bottom: 10px;
    padding: 6px 12px;
    font-size: 12px;
  }
  
  .chart-info {
    padding: 10px 12px;
  }
  
  .info-row {
    justify-content: space-between;
  }
}

/* 响应式设计 - 超小屏幕 (360px以下) */
@media (max-width: 360px) {
  .chart-controls {
    padding: 8px 10px;
    gap: 8px;
  }
  
  .controls-left .el-select {
    font-size: 12px;
  }
  
  .controls-right .el-button {
    padding: 6px 3px;
    font-size: 11px;
    min-height: 32px;
  }
  
  .controls-right .el-button .el-icon {
    font-size: 12px;
  }
  
  .symbol-badge {
    font-size: 11px;
    padding: 2px 6px;
  }
  
  .chart-wrapper {
    margin: 6px;
    min-height: 280px;
  }
  
  .kline-chart {
    min-height: 280px;
  }
}
</style>
