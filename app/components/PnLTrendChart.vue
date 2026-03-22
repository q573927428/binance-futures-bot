<template>
  <el-card class="card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>📈 盈亏与胜率走势</span>
        <div class="header-actions">
          <el-select v-model="rollingWindow" size="small" style="width: 120px; margin-right: 10px">
            <el-option label="最近10笔" :value="10" />
            <el-option label="最近20笔" :value="20" />
            <el-option label="最近50笔" :value="50" />
            <el-option label="最近100笔" :value="100" />
          </el-select>
          <el-button text type="primary" @click="refreshData">
            <el-icon><ElIconRefresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>
    </template>

    <div v-if="hasData" class="chart-container">
      <div ref="chartRef" style="height: 400px; width: 100%"></div>
    </div>
    <el-empty v-else description="暂无交易数据，无法生成走势图" />

    <!-- 统计摘要 -->
    <div v-if="hasData" class="stats-summary">
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="stat-box">
            <span class="stat-label">交易次数</span>
            <span class="stat-value">{{ totalTrades }}</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-box">
            <span class="stat-label">累计盈亏</span>
            <span :class="['stat-value', totalPnL >= 0 ? 'text-success' : 'text-danger']">
              {{ totalPnL >= 0 ? '+' : '' }}{{ totalPnL.toFixed(2) }} U
            </span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-box">
            <span class="stat-label">总胜率</span>
            <span class="stat-value">{{ overallWinRate.toFixed(1) }}%</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-box">
            <span class="stat-label">当前滚动胜率</span>
            <span class="stat-value">{{ currentRollingWinRate.toFixed(1) }}%</span>
          </div>
        </el-col>
      </el-row>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'
import type { EChartsOption } from 'echarts'
import { ElMessage } from 'element-plus'

const botStore = useBotStore()

// 图表引用和实例
const chartRef = ref<HTMLDivElement>()
let chartInstance: any = null

// 滚动窗口大小（用于计算滚动胜率）
const rollingWindow = ref(20)

// 是否有数据
const hasData = computed(() => botStore.history && botStore.history.length > 0)

// 总交易次数
const totalTrades = computed(() => botStore.history?.length || 0)

// 按时间排序的交易历史（从早到晚）
const sortedHistory = computed(() => {
  if (!botStore.history || botStore.history.length === 0) return []
  return [...botStore.history].sort((a, b) => a.closeTime - b.closeTime)
})

// 计算累计盈亏数据
const cumulativePnLData = computed(() => {
  let cumulative = 0
  return sortedHistory.value.map(trade => {
    cumulative += trade.pnl
    return {
      time: trade.closeTime,
      value: cumulative,
      symbol: trade.symbol,
      pnl: trade.pnl
    }
  })
})

// 计算滚动胜率数据
const rollingWinRateData = computed(() => {
  const history = sortedHistory.value
  const windowSize = rollingWindow.value
  
  return history.map((trade, index) => {
    // 获取当前及之前的交易（最多windowSize笔）
    const startIndex = Math.max(0, index - windowSize + 1)
    const windowTrades = history.slice(startIndex, index + 1)
    
    // 计算窗口内的胜率
    const wins = windowTrades.filter(t => t.pnl > 0).length
    const winRate = (wins / windowTrades.length) * 100
    
    return {
      time: trade.closeTime,
      value: winRate,
      windowSize: windowTrades.length
    }
  })
})

// 总盈亏
const totalPnL = computed(() => {
  if (cumulativePnLData.value.length === 0) return 0
  const lastItem = cumulativePnLData.value[cumulativePnLData.value.length - 1]
  return lastItem?.value ?? 0
})

// 总胜率
const overallWinRate = computed(() => {
  if (!botStore.history || botStore.history.length === 0) return 0
  const wins = botStore.history.filter(t => t.pnl > 0).length
  return (wins / botStore.history.length) * 100
})

// 当前滚动胜率
const currentRollingWinRate = computed(() => {
  if (rollingWinRateData.value.length === 0) return 0
  const lastItem = rollingWinRateData.value[rollingWinRateData.value.length - 1]
  return lastItem?.value ?? 0
})

// 图表配置
const chartOption = computed<EChartsOption>(() => {
  const xAxisData = cumulativePnLData.value.map(d => dayjs(d.time).format('MM/DD HH:mm'))
  const pnlValues = cumulativePnLData.value.map(d => d.value)
  const winRateValues = rollingWinRateData.value.map(d => d.value)
  
  // 分离盈利和亏损数据
  const positiveData = pnlValues.map((value, index) => value >= 0 ? value : 0)
  const negativeData = pnlValues.map((value, index) => value < 0 ? value : 0)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        const dataIndex = params[0]?.dataIndex
        if (dataIndex === undefined || dataIndex < 0) return ''
        
        const trade = sortedHistory.value[dataIndex]
        const pnlData = cumulativePnLData.value[dataIndex]
        const winRateData = rollingWinRateData.value[dataIndex]
        
        if (!trade || !pnlData || !winRateData) return ''
        
        let html = `<div style="font-weight: bold; margin-bottom: 5px">${dayjs(trade.closeTime).format('YYYY-MM-DD HH:mm')}</div>`
        html += `<div>交易对: ${trade.symbol}</div>`
        html += `<div>方向: ${trade.direction}</div>`
        html += `<div style="color: ${trade.pnl >= 0 ? '#67c23a' : '#f56c6c'}">本次盈亏: ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} U</div>`
        html += `<div style="color: ${pnlData.value >= 0 ? '#67c23a' : '#f56c6c'}">累计盈亏: ${pnlData.value >= 0 ? '+' : ''}${pnlData.value.toFixed(2)} U</div>`
        html += `<div style="color: #409eff">滚动胜率(${winRateData.windowSize}笔): ${winRateData.value.toFixed(1)}%</div>`
        
        return html
      }
    },
    legend: {
      data: ['累计盈亏', `滚动胜率(${rollingWindow.value}笔)`],
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '40px',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '盈亏(U)',
        position: 'left',
        axisLine: {
          show: true,
          lineStyle: {
            color: '#67c23a'
          }
        },
        axisLabel: {
          formatter: '{value}'
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed'
          }
        }
      },
      {
        type: 'value',
        name: '胜率(%)',
        position: 'right',
        min: 0,
        max: 100,
        axisLine: {
          show: true,
          lineStyle: {
            color: '#409eff'
          }
        },
        axisLabel: {
          formatter: '{value}%'
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: '盈利区域',
        type: 'line',
        yAxisIndex: 0,
        data: positiveData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 0
        },
        itemStyle: {
          color: '#67c23a'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
              { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
            ]
          }
        },
        stack: 'total',
        showSymbol: false
      },
      {
        name: '亏损区域',
        type: 'line',
        yAxisIndex: 0,
        data: negativeData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 0
        },
        itemStyle: {
          color: '#f56c6c'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 108, 108, 0.3)' },
              { offset: 1, color: 'rgba(245, 108, 108, 0.05)' }
            ]
          }
        },
        stack: 'total',
        showSymbol: false
      },
      {
        name: '累计盈亏',
        type: 'line',
        yAxisIndex: 0,
        data: pnlValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#67c23a'
        },
        itemStyle: {
          color: '#67c23a'
        }
      },
      {
        name: `滚动胜率(${rollingWindow.value}笔)`,
        type: 'line',
        yAxisIndex: 1,
        data: winRateValues,
        smooth: true,
        symbol: 'diamond',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#409eff',
          type: 'dashed'
        },
        itemStyle: {
          color: '#409eff'
        }
      }
    ]
  }
})

// 刷新数据
async function refreshData() {
  await botStore.fetchHistory(1, rollingWindow.value)
  ElMessage.success('数据已刷新')
}

// 初始化图表
async function initChart() {
  if (!chartRef.value || !hasData.value) return
  
  try {
    // 动态导入echarts
    const echarts = await import('echarts')
    
    // 销毁现有图表实例
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    
    // 创建新的图表实例
    chartInstance = echarts.init(chartRef.value)
    
    // 设置图表选项
    chartInstance.setOption(chartOption.value)
    
    // 监听窗口大小变化
    const handleResize = () => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }
    
    window.addEventListener('resize', handleResize)
    
    // 返回清理函数
    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartInstance) {
        chartInstance.dispose()
        chartInstance = null
      }
    }
  } catch (error) {
    console.error('初始化图表失败:', error)
  }
}

// 更新图表
function updateChart() {
  if (chartInstance && chartOption.value) {
    chartInstance.setOption(chartOption.value)
  }
}

// 监听数据变化
watch(() => botStore.history, () => {
  if (hasData.value) {
    initChart()
  }
}, { deep: true })

// 监听滚动窗口变化
watch(rollingWindow, () => {
  updateChart()
})

// 监听图表配置变化
watch(chartOption, () => {
  updateChart()
})

// 组件挂载时确保有数据并初始化图表
onMounted(async () => {
  if (!botStore.history || botStore.history.length === 0) {
    await botStore.fetchHistory(1, rollingWindow.value)
  }
  
  // 延迟初始化图表，确保DOM已渲染
  setTimeout(() => {
    if (hasData.value) {
      initChart()
    }
  }, 100)
})

// 组件卸载时清理
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
}

.chart-container {
  width: 100%;
  min-height: 400px;
}

.stats-summary {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
}

.stat-box {
  text-align: center;
  padding: 10px;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 5px;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.text-success {
  color: #67c23a;
}

.text-danger {
  color: #f56c6c;
}

@media (max-width: 768px) {
  .header-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .stat-box {
    padding: 5px;
  }
  
  .stat-value {
    font-size: 14px;
  }
}
</style>
