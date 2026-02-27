<template>
  <div class="strategy-analysis-page">
    <div class="header">
      <h1>策略分析仪表板</h1>
      <p class="subtitle">交易策略性能分析与优化</p>
    </div>

    <!-- 筛选控制 -->
    <div class="filters">
      <div class="filter-group">
        <label>交易对:</label>
        <select v-model="filters.symbol" @change="loadData">
          <option value="">全部</option>
          <option v-for="symbol in availableSymbols" :key="symbol" :value="symbol">{{ symbol }}</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>方向:</label>
        <select v-model="filters.direction" @change="loadData">
          <option value="">全部</option>
          <option value="LONG">做多</option>
          <option value="SHORT">做空</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>退出原因:</label>
        <select v-model="filters.exitReason" @change="loadData">
          <option value="">全部</option>
          <option v-for="reason in availableExitReasons" :key="reason" :value="reason">{{ reason }}</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>时间范围:</label>
        <select v-model="filters.timeRange" @change="loadData">
          <option value="all">全部</option>
          <option value="today">今日</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
        </select>
      </div>
      
      <div class="filter-group">
        <button @click="exportData" class="export-btn">
          <span>📊 导出数据</span>
        </button>
      </div>
    </div>

    <!-- 统计数据概览 -->
    <div class="stats-overview" v-if="stats">
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalTrades }}</div>
        <div class="stat-label">总交易次数</div>
      </div>
      
      <div class="stat-card" :class="{ 'positive': stats.totalPnL > 0, 'negative': stats.totalPnL < 0 }">
        <div class="stat-value">{{ stats.totalPnL.toFixed(2) }} USDT</div>
        <div class="stat-label">总盈亏</div>
      </div>
      
      <div class="stat-card" :class="{ 'good': stats.winRate > 50, 'bad': stats.winRate < 40 }">
        <div class="stat-value">{{ stats.winRate.toFixed(1) }}%</div>
        <div class="stat-label">胜率</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{{ stats.avgRiskRewardRatio.toFixed(2) }}</div>
        <div class="stat-label">平均风险回报比</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{{ stats.avgMFE.toFixed(2) }}</div>
        <div class="stat-label">平均MFE</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{{ stats.avgMAE.toFixed(2) }}</div>
        <div class="stat-label">平均MAE</div>
      </div>
    </div>

    <!-- 退出原因分析 -->
    <div class="section" v-if="exitReasonStats">
      <h2>退出原因分析</h2>
      <div class="exit-reason-chart">
        <div v-for="(stat, reason) in exitReasonStats" :key="reason" class="reason-bar">
          <div class="reason-label">{{ reason }}</div>
          <div class="reason-bar-container">
            <div class="reason-bar-fill" :style="{ width: (stat.count / maxExitReasonCount * 100) + '%' }">
              <span class="reason-count">{{ stat.count }} 次</span>
            </div>
          </div>
          <div class="reason-stats">
            <span class="pnl" :class="{ 'positive': stat.totalPnL > 0, 'negative': stat.totalPnL < 0 }">
              {{ stat.totalPnL.toFixed(2) }} USDT
            </span>
            <span class="win-rate">胜率: {{ stat.winRate.toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 交易对分析 -->
    <div class="section" v-if="symbolStats">
      <h2>交易对表现</h2>
      <div class="symbols-table">
        <table>
          <thead>
            <tr>
              <th>交易对</th>
              <th>交易次数</th>
              <th>总盈亏</th>
              <th>平均盈亏</th>
              <th>胜率</th>
              <th>做多次数</th>
              <th>做空次数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(stat, symbol) in symbolStats" :key="symbol">
              <td>{{ symbol }}</td>
              <td>{{ stat.count }}</td>
              <td :class="{ 'positive': stat.totalPnL > 0, 'negative': stat.totalPnL < 0 }">
                {{ stat.totalPnL.toFixed(2) }} USDT
              </td>
              <td :class="{ 'positive': stat.avgPnL > 0, 'negative': stat.avgPnL < 0 }">
                {{ stat.avgPnL.toFixed(2) }} USDT
              </td>
              <td :class="{ 'good': stat.winRate > 50, 'bad': stat.winRate < 40 }">
                {{ stat.winRate.toFixed(1) }}%
              </td>
              <td>{{ stat.longCount }}</td>
              <td>{{ stat.shortCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 详细交易记录 -->
    <div class="section">
      <h2>详细交易记录</h2>
      <div class="pagination-controls">
        <button @click="prevPage" :disabled="pagination.page === 1">上一页</button>
        <span>第 {{ pagination.page }} 页 / 共 {{ pagination.totalPages }} 页 ({{ pagination.total }} 条记录)</span>
        <button @click="nextPage" :disabled="pagination.page === pagination.totalPages">下一页</button>
      </div>
      
      <div class="trades-table">
        <table>
          <thead>
            <tr>
              <th>交易ID</th>
              <th>交易对</th>
              <th>方向</th>
              <th>入场时间</th>
              <th>出场时间</th>
              <th>持仓时长</th>
              <th>盈亏</th>
              <th>MFE</th>
              <th>MAE</th>
              <th>风险回报比</th>
              <th>退出原因</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trade in trades" :key="trade.tradeId">
              <td>{{ trade.tradeId.substring(0, 8) }}...</td>
              <td>{{ trade.symbol }}</td>
              <td :class="{ 'long': trade.direction === 'LONG', 'short': trade.direction === 'SHORT' }">
                {{ trade.direction === 'LONG' ? '做多' : '做空' }}
              </td>
              <td>{{ formatDate(trade.openTime) }}</td>
              <td>{{ formatDate(trade.closeTime) }}</td>
              <td>{{ formatDuration(trade.duration) }}</td>
              <td :class="{ 'positive': trade.pnl > 0, 'negative': trade.pnl < 0 }">
                {{ trade.pnl.toFixed(2) }} USDT
              </td>
              <td :class="{ 'positive': trade.mfe > 0, 'negative': trade.mfe < 0 }">
                {{ trade.mfe.toFixed(2) }}
              </td>
              <td :class="{ 'positive': trade.mae > 0, 'negative': trade.mae < 0 }">
                {{ trade.mae.toFixed(2) }}
              </td>
              <td>{{ trade.riskRewardRatio.toFixed(2) }}</td>
              <td :class="getExitReasonClass(trade.exitReasonCategory)">
                {{ trade.exitReason }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

interface StrategyAnalysisMetrics {
  tradeId: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  openTime: number
  closeTime: number
  duration: number
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPercentage: number
  mfe: number
  mfePercentage: number
  mae: number
  maePercentage: number
  riskAmount: number
  rewardAmount: number
  riskRewardRatio: number
  exitReason: string
  exitReasonCategory: string
  [key: string]: any
}

interface Stats {
  totalTrades: number
  totalPnL: number
  winRate: number
  avgRiskRewardRatio: number
  avgMFE: number
  avgMAE: number
  avgDuration: number
  avgPositionSize: number
}

interface ExitReasonStat {
  count: number
  totalPnL: number
  avgPnL: number
  winRate: number
}

interface SymbolStat {
  count: number
  totalPnL: number
  avgPnL: number
  winRate: number
  longCount: number
  shortCount: number
}

// 响应式数据
const loading = ref(false)
const trades = ref<StrategyAnalysisMetrics[]>([])
const stats = ref<Stats | null>(null)
const exitReasonStats = ref<Record<string, ExitReasonStat> | null>(null)
const symbolStats = ref<Record<string, SymbolStat> | null>(null)
const availableSymbols = ref<string[]>([])
const availableExitReasons = ref<string[]>([])

// 筛选条件
const filters = ref({
  symbol: '',
  direction: '',
  exitReason: '',
  timeRange: 'all'
})

// 分页
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false
})

// 计算最大退出原因数量（用于图表）
const maxExitReasonCount = computed(() => {
  if (!exitReasonStats.value) return 0
  return Math.max(...Object.values(exitReasonStats.value).map(stat => stat.count))
})

// 加载数据
async function loadData() {
  try {
    loading.value = true
    
    // 构建查询参数
    const params = new URLSearchParams()
    if (filters.value.symbol) params.append('symbol', filters.value.symbol)
    if (filters.value.direction) params.append('direction', filters.value.direction)
    if (filters.value.exitReason) params.append('exitReason', filters.value.exitReason)
    if (filters.value.timeRange === 'today') params.append('today', 'true')
    params.append('page', pagination.value.page.toString())
    params.append('pageSize', pagination.value.pageSize.toString())
    
    const response = await fetch(`/api/analysis/metrics?${params}`)
    const result = await response.json()
    
    if (result.success) {
      trades.value = result.data.metrics
      stats.value = result.data.stats
      exitReasonStats.value = result.data.exitReasonStats
      symbolStats.value = result.data.symbolStats
      pagination.value = result.data.pagination
      
      // 提取可用的交易对和退出原因
      updateAvailableFilters()
    }
  } catch (error) {
    console.error('加载策略分析数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 更新可用的筛选选项
function updateAvailableFilters() {
  // 从交易记录中提取唯一的交易对
  const symbols = new Set<string>()
  trades.value.forEach(trade => symbols.add(trade.symbol))
  availableSymbols.value = Array.from(symbols).sort()
  
  // 从退出原因统计中提取退出原因
  if (exitReasonStats.value) {
    availableExitReasons.value = Object.keys(exitReasonStats.value).sort()
  }
}

// 导出数据
function exportData() {
  const params = new URLSearchParams()
  if (filters.value.symbol) params.append('symbol', filters.value.symbol)
  if (filters.value.direction) params.append('direction', filters.value.direction)
  
  window.open(`/api/analysis/export?${params}`, '_blank')
}

// 分页控制
function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    pagination.value.page++
    loadData()
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    pagination.value.page--
    loadData()
  }
}

// 工具函数
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

function getExitReasonClass(category: string): string {
  switch (category) {
    case 'TP1':
    case 'TP2':
      return 'exit-tp'
    case 'STOP_LOSS':
      return 'exit-sl'
    case 'TRAILING_STOP':
      return 'exit-ts'
    default:
      return 'exit-other'
  }
}

// 初始化
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.strategy-analysis-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  margin-bottom: 30px;
  text-align: center;
}

.header h1 {
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 10px;
}

.subtitle {
  color: #666;
  font-size: 1.1rem;
}

.filters {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-group label {
  font-weight: 600;
  color: #555;
}

.filter-group select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  min-width: 120px;
}

.export-btn {
  padding: 10px 20px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.3s;
}

.export-btn:hover {
  background: #45a049;
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  text-align: center;
  border-left: 4px solid #3498db;
}

.stat-card.positive {
  border-left-color: #2ecc71;
}

.stat-card.negative {
  border-left-color: #e74c3c;
}

.stat-card.good {
  border-left-color: #2ecc71;
}

.stat-card.bad {
  border-left-color: #e74c3c;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.section {
  background: white;
  padding: 25px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.section h2 {
  color: #2c3e50;
  margin-bottom: 20px;
  font-size: 1.5rem;
}

.exit-reason-chart {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.reason-bar {
  display: flex;
  align-items: center;
  gap: 15px;
}

.reason-label {
  min-width: 120px;
  font-weight: 600;
  color: #555;
}

.reason-bar-container {
  flex: 1;
  height: 30px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.reason-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2980b9);
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding-left: 10px;
  transition: width 0.3s ease;
}

.reason-count {
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
}

.reason-stats {
  min-width: 200px;
  display: flex;
  gap: 15px;
  justify-content: flex-end;
}

.reason-stats .pnl {
  font-weight: 600;
}

.reason-stats .pnl.positive {
  color: #2ecc71;
}

.reason-stats .pnl.negative {
  color: #e74c3c;
}

.reason-stats .win-rate {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.symbols-table table {
  width: 100%;
  border-collapse: collapse;
}

.symbols-table th,
.symbols-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.symbols-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
}

.symbols-table tr:hover {
  background: #f9f9f9;
}

.positive {
  color: #2ecc71;
  font-weight: 600;
}

.negative {
  color: #e74c3c;
  font-weight: 600;
}

.good {
  color: #2ecc71;
}

.bad {
  color: #e74c3c;
}

.long {
  color: #2ecc71;
  font-weight: 600;
}

.short {
  color: #e74c3c;
  font-weight: 600;
}

.exit-tp {
  color: #2ecc71;
  font-weight: 600;
}

.exit-sl {
  color: #e74c3c;
  font-weight: 600;
}

.exit-ts {
  color: #3498db;
  font-weight: 600;
}

.exit-other {
  color: #7f8c8d;
}

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.pagination-controls button {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.pagination-controls button:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.pagination-controls span {
  color: #555;
  font-weight: 600;
}

.trades-table {
  overflow-x: auto;
}

.trades-table table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1200px;
}

.trades-table th,
.trades-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.trades-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
  position: sticky;
  top: 0;
}

.trades-table tr:hover {
  background: #f9f9f9;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 20px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading p {
  color: #555;
  font-size: 1.1rem;
}

@media (max-width: 768px) {
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-group {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .stats-overview {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .reason-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .reason-stats {
    width: 100%;
    justify-content: space-between;
  }
}
</style>