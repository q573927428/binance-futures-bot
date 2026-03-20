<template>
  <div class="container">
    <el-container>
      <!-- 头部 -->
      <el-header class="header">
        <div class="header-content">
          <h1>
            <el-icon style="vertical-align: middle; margin-right: 8px"><ElIconTrendCharts /></el-icon>
            币安永续合约自动交易系统
          </h1>
          <div class="header-actions">
            <el-tag v-if="botStore.isRunning" type="success" effect="dark">运行中</el-tag>
            <el-tag v-else-if="botStore.isHalted" type="danger" effect="dark">熔断停机</el-tag>
            <el-tag v-else type="info" effect="dark">已停止</el-tag>
          </div>
        </div>
      </el-header>

      <!-- 主体 -->
      <el-main class="main">
        <el-row :gutter="20">
          <!-- 左侧 - 控制面板 -->
          <el-col :xs="24" :sm="24" :md="6" :lg="6">
            <el-card class="card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>🎛️ 控制面板</span>
                  <el-button
                    text
                    type="primary"
                  >
                    {{ statusText }}
                  </el-button>
                </div>
              </template>
              
              <div class="control-panel">
                <el-button
                  type="primary"
                  size="large"
                  :loading="botStore.isLoading"
                  :disabled="botStore.isRunning"
                  @click="handleEditConfig"
                >
                  <el-icon style="margin-right: 8px"><ElIconVideoPlay /></el-icon>
                  启动
                </el-button>

                <el-button
                  type="danger"
                  size="large"
                  :loading="botStore.isLoading"
                  :disabled="!botStore.isRunning"
                  @click="handleEditConfig"
                >
                  <el-icon style="margin-right: 8px"><ElIconVideoPause /></el-icon>
                  停止
                </el-button>

                <el-button
                  type="info"
                  size="large"
                  @click="goToAnalysis"
                >
                  <el-icon style="margin-right: 8px"><ElIconTrendCharts /></el-icon>
                  分析
                </el-button>

                <el-divider />

                <div class="stats">
                  <div class="stat-item">
                    <span class="stat-label">总交易次数</span>
                    <span class="stat-value">
                      {{ botStore.state?.totalTrades || 0 }}
                      <span class="today-trades">今日：{{ botStore.state?.todayTrades || 0 }}</span>
                    </span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">今日盈亏</span>
                    <span :class="['stat-value', pnlClass]">
                      {{ formatPnL(botStore.state?.dailyPnL || 0) }}
                    </span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">总盈亏</span>
                    <span :class="['stat-value', totalPnLClass]">
                      {{ formatTotalPnL(botStore.state?.totalPnL || 0) }}
                    </span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">总胜率</span>
                    <span class="stat-value">{{ formatWinRate(botStore.state?.winRate || 0) }}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">USDT余额</span>
                    <div class="balance-details">
                      <div class="balance-compact">
                        <span class="balance-total">总: {{ formatBalance(usdtBalance?.total || 0) }}</span>
                        <span class="balance-separator">/</span>
                        <span class="balance-free">可用: {{ formatBalance(usdtBalance?.free || 0) }}</span>
                        <span class="balance-separator">/</span>
                        <span class="balance-locked">锁定: {{ formatBalance(usdtBalance?.locked || 0) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </el-card>
            <!-- 当前持仓组件 -->
            <CurrentPositions />
            <!-- 系统配置组件 -->
            <SystemConfig />
          </el-col>

          <!-- 中间 - 持仓和交易历史 -->
          <el-col :xs="24" :sm="24" :md="18" :lg="18">

            <!-- 盈亏与胜率走势图 -->
            <PnLTrendChart />

            <!-- 交易历史组件 -->
            <TradeHistory :has-position="botStore.hasPosition" />

            <!-- 系统日志组件 -->
            <SystemLogs />
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'

// 导入组件
import TradeHistory from '../components/TradeHistory.vue'
import SystemLogs from '../components/SystemLogs.vue'
import SystemConfig from '../components/SystemConfig.vue'
import CurrentPositions from '../components/CurrentPositions.vue'
import PnLTrendChart from '../components/PnLTrendChart.vue'

const botStore = useBotStore()
let stopPolling: (() => void) | null = null

const statusText = computed(() => {
  const status = botStore.state?.status
  const statusMap: Record<string, string> = {
    IDLE: '空闲',
    MONITORING: '监控中',
    OPENING: '开仓中',
    POSITION: '持仓中',
    CLOSING: '平仓中',
    HALTED: '熔断停机',
  }
  return statusMap[status || 'IDLE'] || '未知'
})

const pnlClass = computed(() => {
  const pnl = botStore.state?.dailyPnL || 0
  return pnl >= 0 ? 'text-success' : 'text-danger'
})

const totalPnLClass = computed(() => {
  const totalPnL = botStore.state?.totalPnL || 0
  return totalPnL >= 0 ? 'text-success' : 'text-danger'
})

// 获取USDT余额
const usdtBalance = computed(() => {
  if (!botStore.cryptoBalances || botStore.cryptoBalances.length === 0) {
    return null
  }
  return botStore.cryptoBalances.find(balance => balance.asset === 'USDT')
})

function formatPnL(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} USDT`
}

function formatTotalPnL(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} USDT`
}

function formatWinRate(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatBalance(value: number): string {
  if (value === 0) return '0'
  
  // 根据数值大小格式化显示
  if (value < 0.001) {
    return value.toFixed(5)
  } else if (value < 1) {
    return value.toFixed(4)
  } else if (value < 1000) {
    return value.toFixed(2)
  } else {
    return value.toFixed(2)
  }
}

// 跳转到策略分析页面
function goToAnalysis() {
  window.location.href = '/strategy-analysis'
}

// 处理编辑配置按钮点击
async function handleEditConfig() {
  // 检查是否需要密码验证
  try {
    const response = await $fetch<{ success: boolean; requiresPassword: boolean }>('/api/bot/check-password')
    if (response.success) {
      // 如果需要密码验证，显示密码输入对话框
      if (response.requiresPassword) {
        ElMessage.info('编辑配置需要密码验证，请点击配置面板中的"编辑"按钮')
        return
      }
    }
  } catch (error) {
    console.error('检查密码配置失败:', error)
  }
  
  // 不需要密码验证，直接打开配置对话框
  ElMessage.info('请点击配置面板中的"编辑"按钮打开配置对话框')
}

// 页面加载时获取状态
onMounted(async () => {
  await botStore.fetchStatus()
  await botStore.fetchHistory()

  // 开启轮询，使用配置中的 scanInterval 值
  stopPolling = botStore.startPolling()
})

// 页面卸载时停止轮询
onUnmounted(() => {
  if (stopPolling) {
    stopPolling()
  }
})
</script>

<style scoped>
.container {
  min-height: 100vh;
}

.header {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 0 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.header h1 {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  display: flex;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.main {
  padding: 20px;
}

.card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.control-panel {
  padding: 10px 0;
}


.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #ebeef5;
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  color: #909399;
  font-size: 14px;
}

.stat-value {
  font-weight: 600;
  font-size: 16px;
  color: #303133;
}

.text-success {
  color: #67c23a;
}

.text-danger {
  color: #f56c6c;
}

.today-trades {
  font-size: 14px;
  font-weight: normal;
  color: #909399;
  margin-left: 6px;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
  transition: all 0.3s ease;
}

.today-trades:hover {
  background: #e4e7ed;
  border-color: #dcdfe6;
  color: #606266;
}

.crypto-balances {
  padding: 10px 0;
}

.balance-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.balance-card:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.balance-content {
  padding: 5px;
}

.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.balance-asset {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.balance-amount {
  margin-bottom: 6px;
}

.balance-total {
  display: block;
  color: #409eff;
}

.balance-free,
.balance-locked {
  font-size: 12px;
  color: #909399;
  display: block;
}

.balance-free {
  margin-bottom: 2px;
}

.balance-details {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.balance-line {
  font-size: 14px;
  line-height: 1.4;
  color: #303133;
}

.balance-line:first-child {
  font-weight: 600;
  color: #409eff;
}

.balance-compact {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.balance-total {
  color: #409eff;
}

.balance-free {
  color: #67c23a;
}

.balance-locked {
  color: #f56c6c;
}

.balance-separator {
  color: #909399;
  margin: 0 2px;
}

@media (max-width: 768px) {
  .header h1 {
    font-size: 16px;
  }

  .main {
    padding: 10px;
  }
  
  .balance-card {
    margin-bottom: 8px;
  }
}
</style>
