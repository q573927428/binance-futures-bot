<template>
  <div class="kline-test-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1>K线图表测试页面</h1>
      <p class="page-description">
        使用Lightweight Charts 5.1版本实现的K线图表，支持无限历史数据加载
      </p>
    </div>

    <!-- 控制面板 -->
    <div class="control-panel">
      <el-card class="control-card">
        <template #header>
          <div class="card-header">
            <span>图表配置</span>
          </div>
        </template>
        
        <div class="control-form">
          <div class="form-row">
            <div class="form-item">
              <label class="form-label">交易对</label>
              <el-select
                v-model="selectedSymbol"
                placeholder="选择交易对"
                style="width: 200px"
                @change="handleSymbolChange"
              >
                <el-option
                  v-for="symbol in availableSymbols"
                  :key="symbol"
                  :label="symbol"
                  :value="symbol"
                />
              </el-select>
            </div>
            
            <div class="form-item">
              <label class="form-label">时间周期</label>
              <el-select
                v-model="selectedTimeframe"
                placeholder="选择时间周期"
                style="width: 120px"
                @change="handleTimeframeChange"
              >
                <el-option label="15分钟" value="15m" />
                <el-option label="1小时" value="1h" />
                <el-option label="4小时" value="4h" />
                <el-option label="1天" value="1d" />
                <el-option label="1周" value="1w" />
              </el-select>
            </div>
            
            <div class="form-item">
              <label class="form-label">图表高度</label>
              <el-input-number
                v-model="chartHeight"
                :min="300"
                :max="1000"
                :step="50"
                style="width: 120px"
              />
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-item">
              <el-checkbox v-model="showControls">显示控制栏</el-checkbox>
            </div>
            
            <div class="form-item">
              <el-checkbox v-model="showInfo">显示价格信息</el-checkbox>
            </div>
            
            <div class="form-item">
              <el-checkbox v-model="autoLoad">自动加载</el-checkbox>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-item">
              <label class="form-label">数据条数</label>
              <el-input-number
                v-model="dataLimit"
                :min="100"
                :max="10000"
                :step="100"
                style="width: 120px"
              />
            </div>
            
            <div class="form-item">
              <el-button
                type="primary"
                @click="refreshChart"
                :loading="isRefreshing"
              >
                刷新图表
              </el-button>
            </div>
            
            <div class="form-item">
              <el-button
                type="success"
                @click="syncKLineData"
                :loading="isSyncing"
              >
                同步数据
              </el-button>
            </div>
            
            <div class="form-item">
              <el-button
                type="info"
                @click="checkSyncStatus"
                :loading="isCheckingStatus"
              >
                检查状态
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- K线图表 -->
    <div class="chart-section">
      <el-card class="chart-card">
        <template #header>
          <div class="card-header">
            <span>K线图表 - {{ selectedSymbol }} / {{ getTimeframeLabel(selectedTimeframe) }}</span>
            <div class="card-actions">
              <el-button
                @click="toggleChartFullscreen"
                :icon="isChartFullscreen ? 'el-icon-close' : 'el-icon-full-screen'"
              >
                {{ isChartFullscreen ? '退出全屏' : '全屏' }}
              </el-button>
            </div>
          </div>
        </template>
        
        <KLineChart
          ref="klineChartRef"
          :symbol="selectedSymbol"
          :timeframe="selectedTimeframe"
          :show-controls="showControls"
          :show-info="showInfo"
          :height="`${chartHeight}px`"
          :auto-load="autoLoad"
          :limit="dataLimit"
          @chart-ready="handleChartReady"
          @chart-error="handleChartError"
          @timeframe-change="handleChartTimeframeChange"
        />
      </el-card>
    </div>

    <!-- 数据同步状态 -->
    <div class="status-section">
      <el-card class="status-card">
        <template #header>
          <div class="card-header">
            <span>数据同步状态</span>
          </div>
        </template>
        
        <div class="status-content">
          <div v-if="syncStatus" class="status-info">
            <div class="status-row">
              <span class="status-label">最后同步时间:</span>
              <span class="status-value">
                {{ formatTimestamp(syncStatus.lastSyncTime) }}
              </span>
            </div>
            
            <div class="status-row">
              <span class="status-label">同步状态:</span>
              <span class="status-value">
                <el-tag
                  :type="getStatusTagType(syncStatus.status)"
                  size="small"
                >
                  {{ getStatusText(syncStatus.status) }}
                </el-tag>
              </span>
            </div>
            
            <div class="status-row">
              <span class="status-label">数据条数:</span>
              <span class="status-value">
                {{ syncStatus.totalBars || 0 }}
              </span>
            </div>
            
            <div class="status-row">
              <span class="status-label">最后同步数量:</span>
              <span class="status-value">
                {{ syncStatus.lastSyncCount || 0 }}
              </span>
            </div>
          </div>
          
          <div v-else class="no-status">
            <el-empty description="暂无同步状态信息" />
          </div>
        </div>
      </el-card>
    </div>

    <!-- 操作日志 -->
    <div class="logs-section">
      <el-card class="logs-card">
        <template #header>
          <div class="card-header">
            <span>操作日志</span>
            <div class="card-actions">
              <el-button
                @click="clearLogs"
                :disabled="logs.length === 0"
              >
                清空日志
              </el-button>
            </div>
          </div>
        </template>
        
        <div class="logs-content">
          <div v-if="logs.length > 0" class="logs-list">
            <div
              v-for="(log, index) in logs"
              :key="index"
              class="log-item"
              :class="`log-${log.level}`"
            >
              <div class="log-time">
                {{ formatTimestamp(log.timestamp) }}
              </div>
              <div class="log-level">
                <el-tag
                  :type="getLogTagType(log.level)"
                  size="small"
                >
                  {{ log.level }}
                </el-tag>
              </div>
              <div class="log-message">
                {{ log.message }}
              </div>
            </div>
          </div>
          
          <div v-else class="no-logs">
            <el-empty description="暂无操作日志" />
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import KLineChart from '../components/KLineChart.vue'
import type { KLineTimeframe } from '../../types/kline'

// 响应式数据
const selectedSymbol = ref('BTCUSDT')
const selectedTimeframe = ref<KLineTimeframe>('1h')
const chartHeight = ref(500)
const showControls = ref(true)
const showInfo = ref(true)
const autoLoad = ref(true)
const dataLimit = ref(2000)
const isRefreshing = ref(false)
const isSyncing = ref(false)
const isCheckingStatus = ref(false)
const isChartFullscreen = ref(false)
const syncStatus = ref<any>(null)
const logs = ref<Array<{
  timestamp: number
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
  message: string
}>>([])

// 图表引用
const klineChartRef = ref<InstanceType<typeof KLineChart>>()

// 可用交易对列表
const availableSymbols = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'DOTUSDT',
  'DOGEUSDT',
]

// 生命周期
onMounted(() => {
  addLog('INFO', '页面加载完成')
  checkSyncStatus()
})

// 处理交易对变化
function handleSymbolChange(symbol: string) {
  addLog('INFO', `切换交易对: ${symbol}`)
  if (klineChartRef.value) {
    // 图表会自动响应symbol变化
  }
}

// 处理时间周期变化
function handleTimeframeChange(timeframe: KLineTimeframe) {
  addLog('INFO', `切换时间周期: ${timeframe}`)
  if (klineChartRef.value) {
    // 图表会自动响应timeframe变化
  }
}

// 获取时间周期标签
function getTimeframeLabel(timeframe: KLineTimeframe): string {
  const labels: Record<KLineTimeframe, string> = {
    '15m': '15分钟',
    '1h': '1小时',
    '4h': '4小时',
    '1d': '1天',
    '1w': '1周'
  }
  return labels[timeframe] || timeframe
}

// 刷新图表
async function refreshChart() {
  isRefreshing.value = true
  addLog('INFO', '开始刷新图表')
  
  try {
    if (klineChartRef.value) {
      // 调用图表组件的刷新方法
      klineChartRef.value.refreshChart()
      addLog('SUCCESS', '图表刷新成功')
    }
  } catch (error: any) {
    addLog('ERROR', `刷新图表失败: ${error.message}`)
  } finally {
    isRefreshing.value = false
  }
}

// 同步K线数据
async function syncKLineData() {
  isSyncing.value = true
  addLog('INFO', `开始同步K线数据: ${selectedSymbol.value}/${selectedTimeframe.value}`)
  
  try {
    const response = await fetch('/api/kline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'sync',
        symbol: selectedSymbol.value,
        timeframe: selectedTimeframe.value,
        force: true
      })
    })
    
    const result = await response.json()
    
    if (result.success) {
      addLog('SUCCESS', `数据同步成功: ${result.message}`)
      // 刷新同步状态
      await checkSyncStatus()
      // 刷新图表
      await refreshChart()
    } else {
      addLog('ERROR', `数据同步失败: ${result.message}`)
    }
  } catch (error: any) {
    addLog('ERROR', `数据同步请求失败: ${error.message}`)
  } finally {
    isSyncing.value = false
  }
}

// 检查同步状态
async function checkSyncStatus() {
  isCheckingStatus.value = true
  
  try {
    const response = await fetch('/api/kline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'status',
        symbol: selectedSymbol.value,
        timeframe: selectedTimeframe.value
      })
    })
    
    const result = await response.json()
    
    if (result.success) {
      syncStatus.value = result.data
      addLog('INFO', '同步状态检查完成')
    } else {
      addLog('WARN', `获取同步状态失败: ${result.message}`)
    }
  } catch (error: any) {
    addLog('ERROR', `检查同步状态失败: ${error.message}`)
  } finally {
    isCheckingStatus.value = false
  }
}

// 切换图表全屏
function toggleChartFullscreen() {
  isChartFullscreen.value = !isChartFullscreen.value
  addLog('INFO', isChartFullscreen.value ? '进入全屏模式' : '退出全屏模式')
}

// 处理图表就绪事件
function handleChartReady() {
  addLog('SUCCESS', 'K线图表加载完成')
}

// 处理图表错误事件
function handleChartError(error: string) {
  addLog('ERROR', `图表错误: ${error}`)
}

// 处理图表时间周期变化事件
function handleChartTimeframeChange(timeframe: KLineTimeframe) {
  selectedTimeframe.value = timeframe
  addLog('INFO', `图表时间周期已更新: ${timeframe}`)
}

// 添加日志
function addLog(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) {
  logs.value.unshift({
    timestamp: Date.now(),
    level,
    message
  })
  
  // 限制日志数量
  if (logs.value.length > 100) {
    logs.value = logs.value.slice(0, 100)
  }
}

// 清空日志
function clearLogs() {
  logs.value = []
  addLog('INFO', '操作日志已清空')
}

// 格式化时间戳
function formatTimestamp(timestamp: number): string {
  if (!timestamp) return '未知'
  
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 获取状态标签类型
function getStatusTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'idle': return 'success'
    case 'syncing': return 'warning'
    case 'error': return 'danger'
    default: return 'info'
  }
}

// 获取状态文本
function getStatusText(status: string): string {
  switch (status) {
    case 'idle': return '空闲'
    case 'syncing': return '同步中'
    case 'error': return '错误'
    default: return status
  }
}

// 获取日志标签类型
function getLogTagType(level: string): 'info' | 'warning' | 'danger' | 'success' {
  switch (level) {
    case 'INFO': return 'info'
    case 'WARN': return 'warning'
    case 'ERROR': return 'danger'
    case 'SUCCESS': return 'success'
    default: return 'info'
  }
}
</script>

<style scoped>
.kline-test-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

/* 页面标题 */
.page-header {
  margin-bottom: 30px;
  text-align: center;
}

.page-header h1 {
  margin: 0;
  color: #303133;
  font-size: 28px;
  font-weight: 600;
}

.page-description {
  margin-top: 10px;
  color: #606266;
  font-size: 16px;
}

/* 控制面板 */
.control-panel {
  margin-bottom: 24px;
}

.control-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #303133;
}

.control-form {
  padding: 8px 0;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 20px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

/* 图表区域 */
.chart-section {
  margin-bottom: 24px;
}

.chart-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 状态区域 */
.status-section {
  margin-bottom: 24px;
}

.status-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.status-content {
  padding: 8px 0;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-label {
  width: 120px;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.status-value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.no-status {
  padding: 40px 0;
  text-align: center;
}

/* 日志区域 */
.logs-section {
  margin-bottom: 24px;
}

.logs-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.logs-content {
  padding: 8px 0;
  max-height: 400px;
  overflow-y: auto;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f8f9fa;
  transition: all 0.2s ease;
}

.log-item:hover {
  background: #f0f2f5;
}

.log-item.log-INFO {
  border-left: 4px solid #409eff;
}

.log-item.log-WARN {
  border-left: 4px solid #e6a23c;
}

.log-item.log-ERROR {
  border-left: 4px solid #f56c6c;
}

.log-item.log-SUCCESS {
  border-left: 4px solid #67c23a;
}

.log-time {
  width: 180px;
  font-size: 12px;
  color: #909399;
  font-family: 'Monaco', 'Consolas', monospace;
}

.log-level {
  width: 80px;
}

.log-message {
  flex: 1;
  font-size: 14px;
  color: #303133;
  word-break: break-word;
}

.no-logs {
  padding: 40px 0;
  text-align: center;
}

/* 响应式设计 - 平板端 (768px以下) */
@media (max-width: 768px) {
  .kline-test-page {
    padding: 16px;
  }
  
  .page-header h1 {
    font-size: 24px;
  }
  
  .page-description {
    font-size: 14px;
  }
  
  .form-row {
    gap: 16px;
  }
  
  .form-item {
    flex: 1;
    min-width: 150px;
  }
  
  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .status-label {
    width: auto;
  }
  
  .log-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .log-time {
    width: auto;
  }
  
  .log-level {
    width: auto;
  }
}

/* 响应式设计 - 手机端 (480px以下) */
@media (max-width: 480px) {
  .kline-test-page {
    padding: 12px;
  }
  
  .page-header h1 {
    font-size: 20px;
  }
  
  .page-description {
    font-size: 13px;
  }
  
  .control-form {
    padding: 4px 0;
  }
  
  .form-row {
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }
  
  .form-item {
    width: 100%;
  }
  
  .form-item .el-select,
  .form-item .el-input-number {
    width: 100% !important;
  }
  
  .form-item .el-button {
    width: 100%;
  }
  
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .card-actions {
    width: 100%;
    justify-content: flex-end;
  }
  
  .status-info {
    gap: 12px;
  }
  
  .logs-content {
    max-height: 300px;
  }
  
  .log-item {
    padding: 8px 12px;
  }
  
  .log-time {
    font-size: 11px;
  }
  
  .log-message {
    font-size: 13px;
  }
}

/* 响应式设计 - 超小屏幕 (360px以下) */
@media (max-width: 360px) {
  .kline-test-page {
    padding: 8px;
  }
  
  .page-header h1 {
    font-size: 18px;
  }
  
  .page-description {
    font-size: 12px;
  }
  
  .form-row {
    gap: 8px;
    margin-bottom: 12px;
  }
  
  .form-label {
    font-size: 13px;
  }
  
  .status-label {
    font-size: 13px;
  }
  
  .status-value {
    font-size: 13px;
  }
  
  .log-time {
    font-size: 10px;
  }
  
  .log-message {
    font-size: 12px;
  }
}
</style>
