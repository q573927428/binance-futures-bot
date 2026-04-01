<template>
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
        <el-button type="primary" @click="$emit('retry')">
          重试
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'
import type { SimpleKLineData } from '../../../types/kline-simple'
import type { TradeHistory, BotConfig } from '../../../types'
import type { SeriesMarkerShape } from 'lightweight-charts'
import { calculateEMASeries, getEMAColor, getEMAWidth } from '../../utils/ema-calculator'
import { prepareCandlestickData, prepareVolumeData, getChartOptions } from './utils/kline-helpers'
import { isDOGESymbol } from './utils/kline-helpers'
import { useBotStore } from '../../stores/bot'

// 定义props
interface Props {
  klineData: SimpleKLineData[]
  tradeHistory?: TradeHistory[]
  theme?: 'light' | 'dark'
  symbol?: string
  timeframe?: string  // 如果提供，则使用提供的timeframe；否则根据策略模式自动选择
  loading?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  klineData: () => [],
  tradeHistory: () => [],
  theme: 'light',
  symbol: 'BTCUSDT',
  timeframe: '',  // 默认为空，根据策略模式自动选择
  loading: false,
  error: ''
})

// 定义emits
const emit = defineEmits<{
  'tooltip-update': [data: { open: number; high: number; low: number; close: number; volume: number; changePercent: number }, time: string]
  'retry': []
}>()

// 图表相关
const chartContainer = ref<HTMLElement | null>(null)
let chart: any = null
let candlestickSeries: any = null
let volumeSeries: any = null
let emaSeries: any[] = []
let resizeObserver: ResizeObserver | null = null
const markersAdded = ref(false)

// 使用Pinia store获取配置
const botStore = useBotStore()

// 计算EMA周期（根据当前策略模式）
const emaPeriods = computed(() => {
  if (!botStore.config) return [14, 120] // 默认值
  
  const strategyMode = botStore.config.strategyMode
  const emaConfig = botStore.config.indicatorsConfig.emaPeriods[strategyMode]
  
  // 返回fast和slow两个周期
  return [emaConfig.fast, emaConfig.slow]
})

// 根据策略模式计算timeframe
const computedTimeframe = computed(() => {
  // 如果props提供了timeframe，则使用提供的值
  if (props.timeframe) return props.timeframe
  
  // 否则根据策略模式自动选择
  if (!botStore.config) return '15m' // 默认值
  
  const strategyMode = botStore.config.strategyMode
  // medium_term 使用 1h，其他（short_term）使用 15m
  return strategyMode === 'medium_term' ? '1h' : '15m'
})

// 判断是否为DOGE交易对
const isDOGE = computed(() => isDOGESymbol(props.symbol))

// 价格格式配置
const priceFormat = computed(() => ({
  type: 'price' as const,
  precision: isDOGE.value ? 5 : 2,
  minMove: isDOGE.value ? 0.00001 : 0.01
}))

// 初始化图表
const initChart = () => {
  if (!chartContainer.value) return
  
  console.log(`📈 初始化图表 (symbol: ${props.symbol}, timeframe: ${computedTimeframe.value})`)
  
  // 清理现有图表
  if (chart) {
    try {
      chart.remove()
    } catch (error) {
      console.warn('清理现有图表失败:', error)
    }
  }
  
  // 创建新图表
  const chartOptions = {
    ...getChartOptions(props.theme),
    width: chartContainer.value.clientWidth,
    height: 500
  }
  
  chart = createChart(chartContainer.value, chartOptions)
  
  // 获取当前价格格式
  const currentPriceFormat = priceFormat.value
  console.log(`💰 价格格式配置: precision=${currentPriceFormat.precision}, minMove=${currentPriceFormat.minMove}`)
  
  // 添加K线系列
  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    priceFormat: currentPriceFormat
  })
  
  // 添加成交量系列
  volumeSeries = chart.addSeries(HistogramSeries, {
    color: '#26a69a',
    priceFormat: { type: 'volume' },
    priceScaleId: ''
  })
  
  // 设置成交量坐标轴位置
  chart.priceScale('').applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0
    }
  })
  
  // 清空EMA系列数组
  emaSeries = []
  
  // 添加EMA线（根据emaPeriods配置）
  for (const period of emaPeriods.value) {
    const emaSeriesItem = chart.addSeries(LineSeries, {
      color: getEMAColor(period),
      lineWidth: getEMAWidth(period),
      title: `EMA${period}`,
      priceFormat: currentPriceFormat
    })
    emaSeries.push(emaSeriesItem)
  }
  
  // 响应窗口大小变化
  resizeObserver = new ResizeObserver(() => {
    if (chart && chartContainer.value) {
      chart.applyOptions({ width: chartContainer.value.clientWidth })
    }
  })
  
  resizeObserver.observe(chartContainer.value)
  
  // 监听鼠标移动事件
  chart.subscribeCrosshairMove((param: any) => {
    if (param.time) {
      // 找到对应的K线数据
      const kline = findKlineByTime(props.klineData, param.time)
      if (kline) {
        // 触发tooltip更新事件
        emitTooltipUpdate(kline)
      }
    }
  })
  
  // 更新图表数据
  updateChart()
  
  // 添加订单标记
  addOrderMarkers()
  
  console.log(`✅ 图表初始化完成 (symbol: ${props.symbol})`)
}

// 根据时间查找K线数据
const findKlineByTime = (klineData: SimpleKLineData[], time: number): SimpleKLineData | null => {
  if (!klineData.length) return null
  
  // 使用二分查找找到最接近的时间
  let left = 0
  let right = klineData.length - 1
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midKline = klineData[mid]
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
  if (right >= 0 && right < klineData.length) {
    const kline = klineData[right]
    return kline || null
  }
  
  return null
}

// 触发tooltip更新事件
const emitTooltipUpdate = (kline: SimpleKLineData) => {
  const changePercent = ((kline.c - kline.o) / kline.o) * 100
  const timeStr = new Date(kline.t * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  
  emit('tooltip-update', {
    open: kline.o,
    high: kline.h,
    low: kline.l,
    close: kline.c,
    volume: kline.v || 0,
    changePercent
  }, timeStr)
}

// 更新最后一根K线数据
const updateLastKline = (updatedKline: SimpleKLineData) => {
  if (!candlestickSeries || !volumeSeries || emaSeries.length === 0) return
  
  try {
    // 更新K线数据
    const candlestickData = {
      time: updatedKline.t,
      open: updatedKline.o,
      high: updatedKline.h,
      low: updatedKline.l,
      close: updatedKline.c
    }
    
    // 使用update方法只更新最后一根K线
    candlestickSeries.update(candlestickData)
    
    // 更新成交量
    const volumeData = {
      time: updatedKline.t,
      value: updatedKline.v || 0,
      color: updatedKline.c >= updatedKline.o ? '#26a69a' : '#ef5350'
    }
    volumeSeries.update(volumeData)
    
    // 重新计算整个EMA序列并更新最后一根K线的EMA值
    // 注意：这里我们只更新最后一根K线的EMA值，而不是重新计算整个序列
    // 因为EMA计算需要整个历史数据，我们已经在updateChart中设置了完整的EMA数据
    // 这里只需要更新最后一根K线的EMA值
    
    // 获取当前props.klineData的副本并更新最后一根K线
    const updatedKlineData = [...props.klineData]
    const lastIndex = updatedKlineData.length - 1
    if (lastIndex >= 0) {
      updatedKlineData[lastIndex] = updatedKline
      
      // 为每个EMA周期更新最后一根K线的EMA值
      for (let i = 0; i < emaPeriods.value.length; i++) {
        const period = emaPeriods.value[i]
        const emaSeriesItem = emaSeries[i]
        
        if (period && emaSeriesItem) {
          const emaData = calculateEMASeries(updatedKlineData, period)
          if (emaData.length > 0) {
            // 只更新最后一根K线的EMA值
            const lastEma = emaData[emaData.length - 1]
            if (lastEma) {
              emaSeriesItem.update(lastEma)
            }
          }
        }
      }
    }
    
    // 如果tooltip正在显示，更新tooltip
    if (chart && typeof chart.getCrosshairPosition === 'function') {
      const crosshairPosition = chart.getCrosshairPosition()
      if (crosshairPosition && crosshairPosition.time === updatedKline.t) {
        emitTooltipUpdate(updatedKline)
      }
    }
  } catch (error) {
    console.error('更新最后一根K线失败:', error)
  }
}

// 更新图表数据
const updateChart = () => {
  if (!chart || !candlestickSeries || !volumeSeries) {
    initChart()
    return
  }
  
  if (props.klineData.length === 0) return
  
  // 准备数据
  const candlestickData = prepareCandlestickData(props.klineData)
  const volumeData = prepareVolumeData(props.klineData)
  
  // 设置数据
  candlestickSeries.setData(candlestickData)
  volumeSeries.setData(volumeData)
  
  // 计算并设置EMA数据
  if (emaSeries.length > 0) {
    for (let i = 0; i < emaPeriods.value.length; i++) {
      const period = emaPeriods.value[i]
      const emaSeriesItem = emaSeries[i]
      
      if (period && emaSeriesItem) {
        const emaData = calculateEMASeries(props.klineData, period)
        if (emaData.length > 0) {
          emaSeriesItem.setData(emaData)
        }
      }
    }
  }
  
  // 设置默认显示200根K线
  if (candlestickData.length > 0) {
    const visibleBarCount = 200
    const totalBars = candlestickData.length
    
    if (totalBars <= visibleBarCount) {
      chart.timeScale().fitContent()
    } else {
      const fromIndex = totalBars - visibleBarCount
      const fromItem = candlestickData[fromIndex]
      const toItem = candlestickData[totalBars - 1]
      
      if (fromItem && toItem) {
        chart.timeScale().setVisibleRange({
          from: fromItem.time,
          to: toItem.time
        })
        if (import.meta.client) {
          setTimeout(() => {
            if (chart) {
              chart.timeScale().applyOptions({
                rightOffset: 12
              })
            }
          }, 0)
        }
      } else {
        chart.timeScale().fitContent()
      }
    }
  }
  
  // 重置标记状态
  markersAdded.value = false
  addOrderMarkers()
}

// 添加订单标记
const addOrderMarkers = () => {
  if (!candlestickSeries || props.tradeHistory?.length === 0 || markersAdded.value) return
  
  const markers = props.tradeHistory!.flatMap(order => {
    // 转换时间格式：毫秒 -> 秒
    const openTime = alignToKlineTime(order.openTime, computedTimeframe.value)
    const closeTime = alignToKlineTime(order.closeTime, computedTimeframe.value)
    
    // 开仓标记
    const openMarker = {
      time: openTime,
      position: 'aboveBar' as const,
      color: order.direction === 'LONG' ? '#26a69a' : '#ef5350',
      shape: (order.direction === 'LONG' ? 'arrowUp' : 'arrowDown') as SeriesMarkerShape,
      text: `${order.direction} @ ${order.entryPrice.toFixed(2)}`
    }
    
    // 平仓标记
    const closeMarker = {
      time: closeTime,
      position: 'belowBar' as const,
      color: order.pnl >= 0 ? '#26a69a' : '#ef5350',
      shape: 'circle' as SeriesMarkerShape,
      text: `平仓 @ ${order.exitPrice.toFixed(2)} (${order.pnl >= 0 ? '+' : ''}${order.pnlPercentage.toFixed(2)}%)`
    }
    
    return [openMarker, closeMarker]
  })
  
  // 使用createSeriesMarkers创建标记
  createSeriesMarkers(candlestickSeries, markers)
  markersAdded.value = true
}

// 将时间戳对齐到K线时间
const alignToKlineTime = (timestamp: number, timeframe: string): number => {
  const timeframeSeconds = getTimeframeSeconds(timeframe)
  return Math.floor(timestamp / 1000 / timeframeSeconds) * timeframeSeconds
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

// 监听数据变化 - 只在数据长度变化或初始加载时刷新图表
watch(() => props.klineData, (newData, oldData) => {
  // 如果数据为空，不刷新
  if (!newData || newData.length === 0) return
  
  // 如果旧数据为空，说明是初始加载，刷新图表
  if (!oldData || oldData.length === 0) {
    updateChart()
    return
  }
  
  // 如果数据长度变化，刷新图表
  if (newData.length !== oldData.length) {
    updateChart()
    return
  }
  
  // 如果只是最后一根K线更新，不刷新整个图表
  // 这个情况由 updateLastKline 方法处理
}, { deep: true })

// 监听主题变化
watch(() => props.theme, () => {
  if (chart) {
    chart.applyOptions(getChartOptions(props.theme))
  }
})

// 监听交易历史变化
watch(() => props.tradeHistory, () => {
  markersAdded.value = false
  addOrderMarkers()
}, { deep: true })

// 监听配置变化，当配置加载后重新初始化图表
watch(() => botStore.config, (newConfig) => {
  if (newConfig && chart) {
    console.log('🔄 配置已加载，重新初始化图表')
    // 重新初始化图表以使用正确的EMA周期
    cleanupChart()
    nextTick(() => {
      if (chartContainer.value) {
        initChart()
      }
    })
  }
})

// 组件挂载时初始化
onMounted(() => {
  nextTick(() => {
    initChart()
  })
})

// 清理图表资源
const cleanupChart = () => {
  console.log(`🧹 清理图表资源 (当前symbol: ${props.symbol})...`)
  
  // 停止所有可能的动画或更新
  if (chart) {
    try {
      // 取消订阅所有事件监听
      chart.unsubscribeCrosshairMove()
      
      // 移除所有系列
      if (candlestickSeries) {
        chart.removeSeries(candlestickSeries)
        candlestickSeries = null
      }
      if (volumeSeries) {
        chart.removeSeries(volumeSeries)
        volumeSeries = null
      }
      // 移除所有EMA系列
      for (const emaSeriesItem of emaSeries) {
        if (emaSeriesItem) {
          chart.removeSeries(emaSeriesItem)
        }
      }
      emaSeries = []
      
      // 移除图表
      chart.remove()
      chart = null
    } catch (error) {
      console.warn('清理图表资源失败:', error)
    }
  }
  
  // 清理ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // 重置标记状态
  markersAdded.value = false
  
  console.log(`✅ 图表资源清理完成 (symbol: ${props.symbol})`)
}

// 组件卸载前清理
onUnmounted(() => {
  cleanupChart()
})

// 监听symbol变化，清理并重新初始化图表
watch(() => props.symbol, (newSymbol, oldSymbol) => {
  if (newSymbol && newSymbol !== oldSymbol) {
    console.log(`🔄 Symbol变化: ${oldSymbol} -> ${newSymbol}, 重新初始化图表`)
    
    // 清理旧图表
    cleanupChart()
    
    // 重新初始化图表
    nextTick(() => {
      if (chartContainer.value) {
        initChart()
      }
    })
  }
})

// 监听timeframe变化，清理并重新初始化图表
watch(() => computedTimeframe.value, (newTimeframe, oldTimeframe) => {
  if (newTimeframe && newTimeframe !== oldTimeframe) {
    console.log(`🔄 Timeframe变化: ${oldTimeframe} -> ${newTimeframe}, 重新初始化图表`)
    
    // 清理旧图表
    cleanupChart()
    
    // 重新初始化图表
    nextTick(() => {
      if (chartContainer.value) {
        initChart()
      }
    })
  }
})

// 暴露方法给父组件
defineExpose({
  updateLastKline
})
</script>

<style scoped>
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

/* 响应式设计 - 手机端 (480px以下) */
@media (max-width: 480px) {
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
}
</style>