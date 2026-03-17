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
          <el-col :xs="24" :sm="24" :md="8" :lg="8">
            <el-card class="card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>控制面板</span>
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
                    <span class="stat-value">{{ botStore.state?.totalTrades || 0 }}（今日：{{ botStore.state?.todayTrades || 0 }}）</span>
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
                </div>
              </div>
            </el-card>

            <!-- 加密货币余额 -->
            <el-card class="card" shadow="hover" style="margin-top: 20px">
              <template #header>
                <div class="card-header">
                  <span>账户余额</span>
                  <el-button
                    text
                    type="primary"
                    @click="handleRefreshBalances"
                  >
                    <el-icon><ElIconRefresh /></el-icon>
                    刷新
                  </el-button>
                </div>
              </template>

              <div v-if="botStore.cryptoBalances.length > 0" class="crypto-balances">
                <el-row :gutter="12">
                  <el-col 
                    v-for="balance in botStore.cryptoBalances" 
                    :key="balance.asset"
                    :xs="12" 
                    :sm="12" 
                    :md="8" 
                    :lg="6"
                    style="margin-bottom: 12px"
                  >
                    <el-card shadow="never" class="balance-card">
                      <div class="balance-content">
                        <div class="balance-header">
                          <span class="balance-asset">{{ balance.asset }}</span>
                          <el-tag 
                            v-if="balance.asset === 'USDT' || balance.asset === 'USDC'" 
                            type="success" 
                            size="small"
                          >
                            稳定币
                          </el-tag>
                        </div>
                        <div class="balance-amount">
                          <span class="balance-total">{{ formatBalance(balance.total) }}</span>
                          <span class="balance-free">可用: {{ formatBalance(balance.free) }}</span>
                        </div>
                        <div class="balance-details">
                          <span class="balance-locked">锁定: {{ formatBalance(balance.locked) }}</span>
                        </div>
                      </div>
                    </el-card>
                  </el-col>
                </el-row>
              </div>
              <el-empty v-else description="暂无余额数据" />
            </el-card>

            <!-- 系统配置组件 -->
            <SystemConfig />
          </el-col>

          <!-- 中间 - 持仓和交易历史 -->
          <el-col :xs="24" :sm="24" :md="16" :lg="16">
            <!-- 当前持仓组件 -->
            <CurrentPositions />

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
import { ElMessage } from 'element-plus'

// 导入组件
import TradeHistory from '../components/TradeHistory.vue'
import SystemLogs from '../components/SystemLogs.vue'
import SystemConfig from '../components/SystemConfig.vue'
import CurrentPositions from '../components/CurrentPositions.vue'

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
    return value.toFixed(3)
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

async function handleRefreshBalances() {
  await botStore.fetchStatus()
  ElMessage.success('余额已刷新')
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

.stats {
  margin-top: 20px;
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
  font-size: 18px;
  font-weight: 700;
  color: #409eff;
  margin-bottom: 4px;
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
  justify-content: space-between;
  align-items: center;
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
