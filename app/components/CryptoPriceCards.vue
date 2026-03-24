<template>
  <el-card class="price-cards-container" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>📊 加密货币</span>
        <div class="header-actions">
          <el-button 
            text 
            type="primary" 
            size="small" 
            @click="refreshPrices"
            :loading="isLoading"
          >
            <el-icon><ElIconRefresh /></el-icon>
            刷新
          </el-button>
          <el-button 
            text 
            type="info" 
            size="small" 
            @click="showWebSocketStatus"
          >
            <el-icon><ElIconConnection /></el-icon>
            连接状态
          </el-button>
        </div>
      </div>
    </template>

    <!-- WebSocket状态提示 -->
    <div v-if="!isWebSocketConnected" class="connection-warning">
      <el-alert
        title="WebSocket未连接"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #default>
          <span>价格数据可能不是实时的，正在尝试重新连接...</span>
        </template>
      </el-alert>
    </div>

    <!-- 价格卡片网格 -->
    <div class="cards-grid">
      <div 
        v-for="crypto in cryptoPrices" 
        :key="crypto.symbol"
        class="price-card"
        :class="{ 'price-up': crypto.change24hPercent > 0, 'price-down': crypto.change24hPercent < 0 }"
        @click="openChartModal(crypto)"
      >
        <div class="price-card-header">
          <div class="crypto-info">
            <div class="crypto-symbol">
              <img 
                v-if="getCryptoIcon(crypto.symbol)" 
                :src="getCryptoIcon(crypto.symbol)" 
                :alt="getSymbolDisplay(crypto.symbol)"
                class="crypto-icon"
              />
              {{ getSymbolDisplay(crypto.symbol) }}
            </div>
          </div>
          <div class="price-change" :class="crypto.change24hPercent >= 0 ? 'positive' : 'negative'">
            {{ formatPercent(crypto.change24hPercent) }}
          </div>
        </div>

        <div class="price-card-body">
          <div class="current-price">
            ${{ formatPrice(crypto.price) }}
          </div>
          <div class="price-change-amount" :class="crypto.change24h >= 0 ? 'positive' : 'negative'">
            {{ crypto.change24h >= 0 ? '+' : '' }}{{ formatPrice(Math.abs(crypto.change24h)) }}
          </div>
        </div>

        <div class="price-card-footer">
          <div class="price-range">
            <div class="range-item">
              <span class="range-label">高:</span>
              <span class="range-value">${{ formatPrice(crypto.high24h) }}</span>
            </div>
            <div class="range-item">
              <span class="range-label">低:</span>
              <span class="range-value">${{ formatPrice(crypto.low24h) }}</span>
            </div>
          </div>
          <div class="volume-info">
            <span class="volume-label">24h量:</span>
            <span class="volume-value">{{ formatVolume(crypto.volume24h) }}</span>
          </div>
        </div>

        <div class="last-update">
          更新: {{ formatTime(crypto.lastUpdate) }}
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading && cryptoPrices.length === 0" class="loading-state">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- 空状态 -->
    <div v-else-if="!isLoading && cryptoPrices.length === 0" class="empty-state">
      <el-empty description="暂无价格数据" />
    </div>
  </el-card>

  <!-- TradingView弹窗 -->
  <TradingViewChartModal 
    v-model="showChartModal"
    :symbol="selectedSymbol"
    :visible="showChartModal"
    @close="closeChartModal"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import TradingViewChartModal from './TradingViewChartModal.vue'

// 默认加密货币列表
const DEFAULT_CRYPTOS = [
  'BTCUSDT',
  'ETHUSDT', 
  'BNBUSDT',
  'SOLUSDT',
  'DOGEUSDT',
  'XAUUSDT',
  'XAGUSDT',
  'HYPEUSDT',
]

// 响应式数据
const cryptoPrices = ref<CryptoPrice[]>([])
const isLoading = ref(false)
const isWebSocketConnected = ref(false)
const showChartModal = ref(false)
const selectedSymbol = ref('')

// 计算属性
const hasPrices = computed(() => cryptoPrices.value.length > 0)

// 获取WebSocket连接状态
async function fetchWebSocketStatus() {
  try {
    const response = await $fetch<WebSocketStatusResponse>('/api/websocket/status')
    if (response.success && response.data?.isConnected !== undefined) {
      isWebSocketConnected.value = response.data.isConnected
    }
  } catch (error) {
    console.error('获取WebSocket状态失败:', error)
  }
}

// 获取价格数据
async function fetchPrices() {
  isLoading.value = true
  try {
    const response = await $fetch<ApiResponse>('/api/websocket/prices', {
      params: {
        symbols: DEFAULT_CRYPTOS.join(',')
      }
    })

    if (response.success && response.data?.prices) {
      updateCryptoPrices(response.data.prices)
    } else {
      ElMessage.warning('获取价格数据失败')
    }
  } catch (error: any) {
    console.error('获取价格失败:', error)
    ElMessage.error(`获取价格失败: ${error.message}`)
  } finally {
    isLoading.value = false
  }
}

// 更新加密货币价格
function updateCryptoPrices(prices: Record<string, any>) {
  const updatedPrices: CryptoPrice[] = []
  
  DEFAULT_CRYPTOS.forEach(symbol => {
    const priceData = prices[symbol]
    if (priceData) {
      updatedPrices.push({
        symbol,
        price: priceData.price || 0,
        change24h: priceData.change24h || 0,
        change24hPercent: priceData.change24hPercent || 0,
        high24h: priceData.high24h || 0,
        low24h: priceData.low24h || 0,
        volume24h: priceData.volume24h || 0,
        lastUpdate: priceData.timestamp || Date.now()
      })
    } else {
      // 如果没有数据，使用默认值
      updatedPrices.push({
        symbol,
        price: 0,
        change24h: 0,
        change24hPercent: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        lastUpdate: Date.now()
      })
    }
  })
  
  cryptoPrices.value = updatedPrices
}

// 刷新价格
function refreshPrices() {
  fetchPrices()
  ElMessage.success('正在刷新价格数据...')
}

// 显示WebSocket状态
function showWebSocketStatus() {
  ElMessageBox.alert(
    `WebSocket连接状态: ${isWebSocketConnected.value ? '已连接' : '未连接'}`,
    '连接状态',
    {
      confirmButtonText: '确定',
      type: isWebSocketConnected.value ? 'success' : 'warning'
    }
  )
}

// 打开图表弹窗
function openChartModal(crypto: CryptoPrice) {
  selectedSymbol.value = crypto.symbol
  showChartModal.value = true
}

// 关闭图表弹窗
function closeChartModal() {
  showChartModal.value = false
  selectedSymbol.value = ''
}

// 格式化函数
function formatPrice(price: number): string {
  if (price === 0) return '0'
  
  if (price < 0.001) {
    return price.toFixed(6)
  } else if (price < 1) {
    return price.toFixed(4)
  } else if (price < 1000) {
    return price.toFixed(2)
  } else {
    // 对于大数字，添加千位分隔符
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }
}

function formatPercent(percent: number): string {
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
}

function formatVolume(volume: number): string {
  if (volume >= 1000000000) {
    return `${(volume / 1000000000).toFixed(2)}B`
  } else if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(2)}M`
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(2)}K`
  } else {
    return volume.toFixed(2)
  }
}

function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('HH:mm:ss')
}

function getSymbolDisplay(symbol: string): string {
  return symbol.replace('USDT', '')
}

// 获取加密货币图标
function getCryptoIcon(symbol: string): string {
  const baseSymbol = symbol.replace('USDT', '').toLowerCase()
  
  // 加密货币图标映射 - 使用本地路径
  const iconMap: Record<string, string> = {
    'btc': '/assets/crypto-icons/btc.png',
    'eth': '/assets/crypto-icons/eth.png',
    'bnb': '/assets/crypto-icons/bnb.png',
    'sol': '/assets/crypto-icons/sol.png',
    'doge': '/assets/crypto-icons/doge.png',
    'xau': '/assets/crypto-icons/xau.png', // 黄金图标
    'xag': '/assets/crypto-icons/xag.png', // 白银图标
    'hype': '/assets/crypto-icons/hype.png', // 默认代币图标
  }
  
  return iconMap[baseSymbol] || ''
}


// 定时刷新
let refreshInterval: NodeJS.Timeout | null = null

function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  
  // 每10秒刷新一次价格
  refreshInterval = setInterval(() => {
    if (!isLoading.value) {
      fetchPrices()
    }
  }, 10000)
}

// 组件生命周期
onMounted(() => {
  fetchWebSocketStatus()
  fetchPrices()
  startAutoRefresh()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
})

// 类型定义
interface CryptoPrice {
  symbol: string
  price: number
  change24h: number
  change24hPercent: number
  high24h: number
  low24h: number
  volume24h: number
  lastUpdate: number
}

interface ApiResponse {
  success: boolean
  message?: string
  data?: {
    prices: Record<string, any>
    timestamp: number
    webSocketState?: {
      connected: boolean
    }
  }
}

interface WebSocketStatusResponse {
  success: boolean
  message?: string
  data?: {
    isConnected: boolean
    webSocketState?: any
    subscribedSymbols?: string[]
    priceCount?: number
    lastUpdate?: number
  }
}
</script>

<style scoped>
.price-cards-container {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.connection-warning {
  margin-bottom: 16px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.price-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.price-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #409eff;
}

.price-card.price-up:hover {
  border-color: #67c23a;
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.15);
}

.price-card.price-down:hover {
  border-color: #f56c6c;
  box-shadow: 0 4px 12px rgba(245, 108, 108, 0.15);
}

.price-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.crypto-info {
  display: flex;
  flex-direction: column;
}

.crypto-symbol {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.crypto-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.price-change {
  font-size: 14px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
}

.price-change.positive {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.price-change.negative {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.price-card-body {
  margin-bottom: 12px;
}

.current-price {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
  margin-bottom: 4px;
}

.price-change-amount {
  font-size: 14px;
  font-weight: 500;
}

.price-change-amount.positive {
  color: #67c23a;
}

.price-change-amount.negative {
  color: #f56c6c;
}

.price-card-footer {
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
  margin-bottom: 8px;
}

.price-range {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.range-item {
  display: flex;
  flex-direction: column;
}

.range-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
}

.range-value {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.volume-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.volume-label {
  font-size: 11px;
  color: #909399;
}

.volume-value {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.last-update {
  font-size: 10px;
  color: #c0c4cc;
  text-align: right;
  margin-top: 4px;
}

.loading-state,
.empty-state {
  padding: 40px 0;
  text-align: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(170px, 2fr));
    gap: 12px;
  }
  
  .price-card {
    padding: 12px;
  }
  
  .crypto-symbol {
    font-size: 16px;
  }
  
  .current-price {
    font-size: 20px;
  }
  
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 480px) {
  .cards-grid {
    grid-template-columns: 2fr;
  }
}
</style>