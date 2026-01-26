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
                </div>
              </template>
              
              <div class="control-panel">
                <el-button
                  type="primary"
                  size="large"
                  :loading="botStore.isLoading"
                  :disabled="botStore.isRunning"
                  @click="handleStart"
                >
                  <el-icon style="margin-right: 8px"><ElIconVideoPlay /></el-icon>
                  启动机器人
                </el-button>

                <el-button
                  type="danger"
                  size="large"
                  :loading="botStore.isLoading"
                  :disabled="!botStore.isRunning"
                  @click="handleStop"
                >
                  <el-icon style="margin-right: 8px"><ElIconVideoPause  /></el-icon>
                  停止机器人
                </el-button>

                <el-divider />

                <div class="stats">
                  <div class="stat-item">
                    <span class="stat-label">今日交易次数</span>
                    <span class="stat-value">{{ botStore.state?.todayTrades || 0 }}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">今日盈亏</span>
                    <span :class="['stat-value', pnlClass]">
                      {{ formatPnL(botStore.state?.dailyPnL || 0) }}
                    </span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">机器人状态</span>
                    <span class="stat-value">{{ statusText }}</span>
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
                    <el-icon><ElIconRefresh  /></el-icon>
                    刷新
                  </el-button>
                </div>
              </template>

              <div v-if="botStore.cryptoBalances.length > 0" class="crypto-balances">
                <el-row :gutter="12">
                  <el-col 
                    v-for="balance in botStore.cryptoBalances" 
                    :key="balance.asset"
                    :xs="24" 
                    :sm="12" 
                    :md="8" 
                    :lg="8"
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
                          <el-tag 
                            v-else 
                            type="info" 
                            size="small"
                          >
                            加密货币
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

            <!-- 配置面板 -->
            <el-card class="card" shadow="hover" style="margin-top: 20px">
              <template #header>
                <div class="card-header">
                  <span>系统配置</span>
                  <el-button
                    text
                    type="primary"
                    @click="configDialogVisible = true"
                  >
                    <el-icon><ElIconSetting  /></el-icon>
                    编辑
                  </el-button>
                </div>
              </template>

              <div v-if="botStore.config" class="config-info">
                <div class="config-item">
                  <span>杠杆倍数:</span>
                  <el-tag>{{ botStore.config.leverage }}x</el-tag>
                </div>
                <div class="config-item">
                  <span>AI分析:</span>
                  <el-tag :type="botStore.config.aiConfig.enabled ? 'success' : 'info'">
                    {{ botStore.config.aiConfig.enabled ? '已启用' : '未启用' }}
                  </el-tag>
                </div>
                <div class="config-item">
                  <span>扫描间隔:</span>
                  <span>{{ botStore.config.scanInterval }}秒</span>
                </div>
              </div>
            </el-card>
          </el-col>

          <!-- 中间 - 持仓和交易历史 -->
          <el-col :xs="24" :sm="24" :md="16" :lg="16">
            <!-- 当前持仓 -->
            <el-card v-if="botStore.hasPosition" class="card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>当前持仓</span>
                  <el-tag :type="botStore.state?.currentPosition?.direction === 'LONG' ? 'success' : 'danger'">
                    {{ botStore.state?.currentPosition?.direction }}
                  </el-tag>
                </div>
              </template>

              <div v-if="botStore.state?.currentPosition" class="position-info">
                <el-descriptions :column="2" border>
                  <el-descriptions-item label="交易对">
                    {{ botStore.state.currentPosition.symbol }}
                  </el-descriptions-item>
                  <el-descriptions-item label="方向">
                    <el-tag :type="botStore.state.currentPosition.direction === 'LONG' ? 'success' : 'danger'">
                      {{ botStore.state.currentPosition.direction }}
                    </el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item label="入场价">
                    {{ botStore.state.currentPosition.entryPrice.toFixed(2) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="数量">
                    {{ botStore.state.currentPosition.quantity }}
                  </el-descriptions-item>
                  <el-descriptions-item label="杠杆">
                    {{ botStore.state.currentPosition.leverage }}x
                  </el-descriptions-item>
                  <el-descriptions-item label="止损价">
                    {{ botStore.state.currentPosition.stopLoss.toFixed(2) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="止盈1">
                    {{ botStore.state.currentPosition.takeProfit1.toFixed(2) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="止盈2">
                    {{ botStore.state.currentPosition.takeProfit2.toFixed(2) }}
                  </el-descriptions-item>
                </el-descriptions>
              </div>
            </el-card>

            <!-- 交易历史 -->
            <el-card class="card" shadow="hover" :style="{ marginTop: botStore.hasPosition ? '20px' : '0' }">
              <template #header>
                <div class="card-header">
                  <span>今日交易历史</span>
                  <el-button text type="primary" @click="handleRefreshHistory">
                    <el-icon><ElIconRefresh  /></el-icon>
                    刷新
                  </el-button>
                </div>
              </template>

              <el-table :data="botStore.history" style="width: 100%" max-height="400">
                <el-table-column prop="symbol" label="交易对" width="120" />
                <el-table-column prop="direction" label="方向" width="80">
                  <template #default="scope">
                    <el-tag :type="scope.row.direction === 'LONG' ? 'success' : 'danger'" size="small">
                      {{ scope.row.direction }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="entryPrice" label="入场价" width="100">
                  <template #default="scope">
                    {{ scope.row.entryPrice.toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column prop="exitPrice" label="出场价" width="100">
                  <template #default="scope">
                    {{ scope.row.exitPrice.toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column prop="pnl" label="盈亏(USDT)" width="120">
                  <template #default="scope">
                    <span :class="scope.row.pnl >= 0 ? 'text-success' : 'text-danger'">
                      {{ scope.row.pnl.toFixed(2) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="pnlPercentage" label="盈亏(%)" width="100">
                  <template #default="scope">
                    <span :class="scope.row.pnlPercentage >= 0 ? 'text-success' : 'text-danger'">
                      {{ scope.row.pnlPercentage.toFixed(2) }}%
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="reason" label="原因" min-width="120" />
              </el-table>

              <el-empty v-if="botStore.history.length === 0" description="暂无交易记录" />
            </el-card>

            <!-- 日志 -->
            <el-card class="card" shadow="hover" style="margin-top: 20px">
              <template #header>
                <div class="card-header">
                  <span>系统日志</span>
                </div>
              </template>

              <div class="logs-container">
                <div
                  v-for="log in botStore.logs"
                  :key="log.timestamp"
                  :class="['log-item', `log-${log.level.toLowerCase()}`]"
                >
                  <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                  <span class="log-category">[{{ log.category }}]</span>
                  <span class="log-message">{{ log.message }}</span>
                </div>
                <el-empty v-if="botStore.logs.length === 0" description="暂无日志" />
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>

    <!-- 配置对话框 -->
    <el-dialog
      v-model="configDialogVisible"
      title="系统配置"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form v-if="editConfig" :model="editConfig" label-width="150px">
        <el-form-item label="交易对">
          <el-select v-model="editConfig.symbols" multiple placeholder="选择交易对" style="width: 100%">
            <el-option label="ETH/USDT" value="ETH/USDT" />
            <el-option label="BTC/USDT" value="BTC/USDT" />
            <el-option label="BNB/USDT" value="BNB/USDT" />
            <el-option label="SOL/USDT" value="SOL/USDT" />
          </el-select>
        </el-form-item>

        <el-form-item label="杠杆倍数">
          <el-input-number v-model="editConfig.leverage" :min="1" :max="20" />
        </el-form-item>

        <el-form-item label="最大风险比例(%)">
          <el-input-number v-model="editConfig.maxRiskPercentage" :min="0.1" :max="5" :step="0.1" />
        </el-form-item>

        <el-form-item label="扫描间隔(秒)">
          <el-input-number v-model="editConfig.scanInterval" :min="10" :max="300" />
        </el-form-item>

        <el-form-item label="启用AI分析">
          <el-switch v-model="editConfig.aiConfig.enabled" />
        </el-form-item>

        <el-form-item v-if="editConfig.aiConfig.enabled" label="AI最小置信度">
          <el-input-number v-model="editConfig.aiConfig.minConfidence" :min="0" :max="100" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveConfig">保存配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'
import type { BotConfig } from '../../types'


const botStore = useBotStore()
const configDialogVisible = ref(false)
const editConfig = ref<BotConfig | null>(null)
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

function formatPnL(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} USDT`
}

function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('HH:mm:ss')
}

async function handleStart() {
  const success = await botStore.startBot()
  if (success) {
    ElMessage.success('机器人已启动')
  } else {
    ElMessage.error(botStore.error || '启动失败')
  }
}

async function handleStop() {
  const success = await botStore.stopBot()
  if (success) {
    ElMessage.success('机器人已停止')
  } else {
    ElMessage.error(botStore.error || '停止失败')
  }
}

async function handleRefreshHistory() {
  await botStore.fetchHistory()
}

async function handleRefreshBalances() {
  await botStore.fetchStatus()
  ElMessage.success('余额已刷新')
}

async function handleSaveConfig() {
  if (!editConfig.value) return

  const success = await botStore.updateConfig(editConfig.value)
  if (success) {
    ElMessage.success('配置已更新')
    configDialogVisible.value = false
  } else {
    ElMessage.error(botStore.error || '更新配置失败')
  }
}

function formatBalance(value: number): string {
  if (value === 0) return '0'
  
  // 根据数值大小格式化显示
  if (value < 0.001) {
    return value.toFixed(8)
  } else if (value < 1) {
    return value.toFixed(6)
  } else if (value < 1000) {
    return value.toFixed(4)
  } else {
    return value.toFixed(2)
  }
}

// 页面加载时获取状态
onMounted(async () => {
  await botStore.fetchStatus()
  await botStore.fetchHistory()

  // 开启轮询
  stopPolling = botStore.startPolling(60000)

  // 编辑配置时复制一份
  if (botStore.config) {
    editConfig.value = JSON.parse(JSON.stringify(botStore.config))
  }
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

.config-info {
  padding: 10px 0;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #ebeef5;
}

.config-item:last-child {
  border-bottom: none;
}

.position-info {
  padding: 10px 0;
}

.logs-container {
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
  background: #fafafa;
  border-radius: 4px;
}

.log-item {
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  display: flex;
  gap: 8px;
}

.log-info {
  background: #f4f4f5;
}

.log-success {
  background: #f0f9ff;
  color: #67c23a;
}

.log-warn {
  background: #fdf6ec;
  color: #e6a23c;
}

.log-error {
  background: #fef0f0;
  color: #f56c6c;
}

.log-time {
  color: #909399;
  flex-shrink: 0;
}

.log-category {
  font-weight: 600;
  flex-shrink: 0;
}

.log-message {
  flex: 1;
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
  padding: 12px;
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
