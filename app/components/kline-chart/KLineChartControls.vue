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
            class="timeframe-btn"
          >
            15分钟
          </el-button>
          <el-button
            size="small"
            :type="selectedTimeframe === '1h' ? 'primary' : 'default'"
            @click="selectTimeframe('1h')"
            class="timeframe-btn"
          >
            1小时
          </el-button>
          <el-button
            size="small"
            :type="selectedTimeframe === '4h' ? 'primary' : 'default'"
            @click="selectTimeframe('4h')"
            class="timeframe-btn"
          >
            4小时
          </el-button>
          <el-button
            size="small"
            :type="selectedTimeframe === '1d' ? 'primary' : 'default'"
            @click="selectTimeframe('1d')"
            class="timeframe-btn"
          >
            日线
          </el-button>
          <el-button
            size="small"
            :type="selectedTimeframe === '1w' ? 'primary' : 'default'"
            @click="selectTimeframe('1w')"
            class="timeframe-btn"
          >
            周线
          </el-button>
        </div>
      </div>
    </div>

    <div class="controls-right">
      <el-button-group size="small" class="action-buttons">
        <el-button
          type="primary"
          size="small"
          @click="$emit('refresh')"
          :loading="loading"
          title="刷新图表"
          class="action-btn"
        >
          <el-icon><ElIconRefresh /></el-icon>
          <span class="btn-label">刷新</span>
        </el-button>
        
        <el-button
          type="info"
          size="small"
          @click="$emit('toggle-theme')"
          title="切换主题"
          class="action-btn"
        >
          <el-icon>
            <ElIconSunny v-if="theme === 'light'" />
            <ElIconMoon v-else />
          </el-icon>
          <span class="btn-label">主题</span>
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
  transition: all 0.3s ease;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.controls-right {
  display: flex;
  align-items: center;
}

.symbol-badge {
  background: #409eff;
  color: white;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.2);
}

/* 周期选择器 */
.timeframe-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeframe-buttons {
  display: flex;
  gap: 6px;
}

.timeframe-btn {
  min-width: 70px;
  padding: 8px 12px;
  font-size: 13px;
  transition: all 0.2s ease;
}

.timeframe-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  min-width: 80px;
  transition: all 0.2s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-label {
  font-size: 13px;
  font-weight: 500;
}


/* 手机端响应式 (576px以下) */
@media (max-width: 576px) {
  .chart-controls {
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }
  
  .controls-left {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .symbol-badge {
    width: 100%;
    text-align: center;
    padding: 8px;
    font-size: 14px;
    margin-bottom: 4px;
  }
  
  .timeframe-selector {
    width: 100%;
  }
  
  .timeframe-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    width: 100%;
  }
  
  .timeframe-btn {
    width: 100%;
    min-width: auto;
    padding: 10px 4px;
    font-size: 12px;
    min-height: 40px;
  }
  
  .controls-right {
    width: 100%;
  }
  
  .action-buttons {
    width: 100%;
    gap: 8px;
  }
  
  .action-btn {
    flex: 1;
    min-width: auto;
    padding: 12px 8px;
    min-height: 44px;
    font-size: 13px;
  }
  
  .action-btn .el-icon {
    font-size: 16px;
  }
  
  .btn-label {
    font-size: 13px;
  }
}
</style>
