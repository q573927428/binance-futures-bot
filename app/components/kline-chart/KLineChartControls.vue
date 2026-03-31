<template>
  <div class="chart-controls">
    <div class="controls-left">
      <div class="symbol-badge">{{ displaySymbol }}</div>

      <div class="timeframe-selector">
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
          @click="$emit('refresh')"
          :loading="loading"
          title="刷新图表"
        >
          <el-icon><ElIconRefresh /></el-icon>
        </el-button>
        
        <el-button
          type="info"
          size="small"
          @click="$emit('toggle-theme')"
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
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

// 定义props
interface Props {
  symbol?: string
  timeframe?: string
  theme?: 'light' | 'dark'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  theme: 'light',
  loading: false
})

// 定义emits
const emit = defineEmits<{
  'timeframe-change': [timeframe: string]
  'refresh': []
  'toggle-theme': []
}>()

// 响应式数据
const selectedTimeframe = ref(props.timeframe)

// 计算显示的symbol
const displaySymbol = computed(() => {
  return props.symbol || 'BTCUSDT'
})

// 选择周期
const selectTimeframe = (timeframe: string) => {
  if (selectedTimeframe.value === timeframe) return
  selectedTimeframe.value = timeframe
  emit('timeframe-change', timeframe)
}

// 监听props.timeframe变化
watch(() => props.timeframe, (newTimeframe) => {
  if (newTimeframe && newTimeframe !== selectedTimeframe.value) {
    selectedTimeframe.value = newTimeframe
  }
})
</script>

<style scoped>
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

.timeframe-buttons {
  display: flex;
  gap: 4px;
}

.timeframe-buttons .el-button {
  min-width: 60px;
  padding: 6px 8px;
  font-size: 12px;
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
}
</style>