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
                  <span>AI分析:</span>
                  <el-tag :type="botStore.config.aiConfig.enabled ? 'success' : 'info'">
                    {{ botStore.config.aiConfig.enabled ? '已启用' : '未启用' }}
                  </el-tag>
                </div>
                <div class="config-item">
                  <span>动态杠杆:</span>
                  <el-tag :type="botStore.config.dynamicLeverageConfig.enabled ? 'success' : 'info'">
                    {{ botStore.config.dynamicLeverageConfig.enabled ? '已启用' : '未启用' }}
                  </el-tag>
                </div>
                <div class="config-item">
                  <span>移动止损:</span>
                  <el-tag :type="botStore.config.trailingStopConfig.enabled ? 'success' : 'info'">
                    {{ botStore.config.trailingStopConfig.enabled ? '已启用' : '未启用' }}
                  </el-tag>
                </div>
                <div class="config-item">
                  <span>市场扫描间隔:</span>
                  <span>{{ botStore.config.scanInterval }}秒</span>
                </div>
                <div class="config-item">
                  <span>持仓扫描间隔:</span>
                  <span>{{ botStore.config.positionScanInterval }}秒</span>
                </div>
                <div class="config-item">
                  <span>交易冷却时间:</span>
                  <span>{{ formatCooldownTime(botStore.config.tradeCooldownInterval) }}</span>
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
                  <el-descriptions-item label="开仓时间">
                    {{ dayjs(botStore.state.currentPosition.openTime).format('YYYY-MM-DD HH:mm') }}
                  </el-descriptions-item>
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
                    <span class="text-secondary">({{ botStore.state.currentPrice?.toFixed(2) || '--' }})</span>
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
                  <el-descriptions-item label="当前盈亏">
                    <span :class="botStore.state.currentPnL && botStore.state.currentPnL >= 0 ? 'text-success' : 'text-danger'">
                      {{ botStore.state.currentPnL ? botStore.state.currentPnL.toFixed(2) + ' USDT' : '--' }}
                    </span>
                    (<span :class="botStore.state.currentPnLPercentage && botStore.state.currentPnLPercentage >= 0 ? 'text-success' : 'text-danger'">
                      {{ botStore.state.currentPnLPercentage ? botStore.state.currentPnLPercentage.toFixed(2) + '%' : '--' }}
                    </span>)
                  </el-descriptions-item>
                  <el-descriptions-item label="止盈TP1">
                    {{ botStore.state.currentPosition.takeProfit1.toFixed(2) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="止盈TP2">
                    {{ botStore.state.currentPosition.takeProfit2.toFixed(2) }}
                  </el-descriptions-item>
                </el-descriptions>
              </div>
            </el-card>

            <!-- 交易历史 -->
            <el-card class="card" shadow="hover" :style="{ marginTop: botStore.hasPosition ? '20px' : '0' }">
              <template #header>
                <div class="card-header">
                  <span>交易历史记录</span>
                  <el-button text type="primary" @click="handleRefreshHistory">
                    <el-icon><ElIconRefresh  /></el-icon>
                    刷新
                  </el-button>
                </div>
              </template>

              <el-table :data="botStore.history" style="width: 100%" max-height="400">
                <el-table-column prop="symbol" label="交易对" width="100" />
                <el-table-column prop="direction" label="方向" width="80">
                  <template #default="scope">
                    <el-tag :type="scope.row.direction === 'LONG' ? 'success' : 'danger'" size="small">
                      {{ scope.row.direction }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="quantity" label="数量" width="80"> 
                </el-table-column>
                <el-table-column prop="leverage" label="杠杆" width="80"> 
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
                <el-table-column prop="pnl" label="盈亏(U)" width="100">
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
                <el-table-column prop="openTime" label="开仓时间" width="160"> 
                  <template #default="scope">
                    {{ dayjs(scope.row.openTime).format('YYYY-MM-DD HH:mm') }}
                  </template>
                </el-table-column>
                <el-table-column prop="closeTime" label="平仓时间" width="160"> 
                  <template #default="scope">
                    {{ dayjs(scope.row.closeTime).format('YYYY-MM-DD HH:mm') }}
                  </template>
                </el-table-column>
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
      width="370px"
      :close-on-click-modal="false"
    >
      <el-form v-if="editConfig" :model="editConfig" label-width="150px">
        <el-form-item label="交易对">
          <el-select v-model="editConfig.symbols" multiple placeholder="选择交易对" style="width: 100%">
            <el-option label="BTC/USDT" value="BTC/USDT" />
            <el-option label="ETH/USDT" value="ETH/USDT" />
            <el-option label="BNB/USDT" value="BNB/USDT" />
            <el-option label="SOL/USDT" value="SOL/USDT" />
          </el-select>
        </el-form-item>

        <el-form-item label="杠杆倍数">
          <el-input-number v-model="editConfig.leverage" :min="1" :max="20" />
        </el-form-item>

        <el-form-item label="最大风险比例(%)">
          <el-input-number v-model="editConfig.maxRiskPercentage" :min="0.1" :max="50" :step="0.1" />
        </el-form-item>

        <el-form-item label="市场扫描间隔(秒)">
          <el-input-number v-model="editConfig.scanInterval" :min="10" :max="300" />
        </el-form-item>

        <el-form-item label="持仓扫描间隔(秒)">
          <el-input-number v-model="editConfig.positionScanInterval" :min="10" :max="300" />
        </el-form-item>

        <el-form-item label="止损ATR倍数">
          <el-input-number v-model="editConfig.stopLossATRMultiplier" :min="0.5" :max="5" :step="0.1" />
        </el-form-item>

        <el-form-item label="最大止损比例(%)">
          <el-input-number v-model="editConfig.maxStopLossPercentage" :min="0.1" :max="10" :step="0.1" />
        </el-form-item>

        <el-form-item label="持仓超时时间(小时)">
          <el-input-number v-model="editConfig.positionTimeoutHours" :min="1" :max="24" />
        </el-form-item>

        <el-form-item label="交易冷却时间间隔(秒)">
          <el-input-number v-model="editConfig.tradeCooldownInterval" :min="60" :max="86400" :step="60" />
        </el-form-item>

        <el-divider>AI分析配置</el-divider>

        <el-form-item label="启用AI分析">
          <el-switch v-model="editConfig.aiConfig.enabled" />
        </el-form-item>

        <el-form-item v-if="editConfig.aiConfig.enabled" label="AI最小置信度">
          <el-input-number v-model="editConfig.aiConfig.minConfidence" :min="0" :max="100" />
        </el-form-item>

        <el-form-item v-if="editConfig.aiConfig.enabled" label="最大风险等级">
          <el-select v-model="editConfig.aiConfig.maxRiskLevel" placeholder="选择风险等级">
            <el-option label="低" value="LOW" />
            <el-option label="中" value="MEDIUM" />
            <el-option label="高" value="HIGH" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="editConfig.aiConfig.enabled" label="用于开仓决策">
          <el-switch v-model="editConfig.aiConfig.useForEntry" />
        </el-form-item>

        <el-form-item v-if="editConfig.aiConfig.enabled" label="用于平仓决策">
          <el-switch v-model="editConfig.aiConfig.useForExit" />
        </el-form-item>

        <el-form-item v-if="editConfig.aiConfig.enabled" label="缓存时长(分钟)">
          <el-input-number v-model="editConfig.aiConfig.cacheDuration" :min="1" :max="60" />
        </el-form-item>

        <el-divider>动态杠杆配置</el-divider>

        <el-form-item label="启用动态杠杆">
          <el-switch v-model="editConfig.dynamicLeverageConfig.enabled" />
        </el-form-item>

        <el-form-item v-if="editConfig.dynamicLeverageConfig.enabled" label="基础杠杆">
          <el-input-number v-model="editConfig.dynamicLeverageConfig.baseLeverage" :min="1" :max="20" />
        </el-form-item>

        <el-form-item v-if="editConfig.dynamicLeverageConfig.enabled" label="最小杠杆">
          <el-input-number v-model="editConfig.dynamicLeverageConfig.minLeverage" :min="1" :max="20" />
        </el-form-item>

        <el-form-item v-if="editConfig.dynamicLeverageConfig.enabled" label="最大杠杆">
          <el-input-number v-model="editConfig.dynamicLeverageConfig.maxLeverage" :min="1" :max="20" />
        </el-form-item>

        <el-divider>移动止损配置</el-divider>

        <el-form-item label="启用移动止损">
          <el-switch v-model="editConfig.trailingStopConfig.enabled" />
        </el-form-item>

        <el-form-item v-if="editConfig.trailingStopConfig.enabled" label="激活比例(%)">
          <el-input-number v-model="editConfig.trailingStopConfig.activationRatio" :min="0.1" :max="5" :step="0.1" />
        </el-form-item>

        <el-form-item v-if="editConfig.trailingStopConfig.enabled" label="跟踪距离(%)">
          <el-input-number v-model="editConfig.trailingStopConfig.trailingDistance" :min="0.1" :max="5" :step="0.1" />>
        </el-form-item>

        <el-form-item v-if="editConfig.trailingStopConfig.enabled" label="更新间隔(秒)">
          <el-input-number v-model="editConfig.trailingStopConfig.updateIntervalSeconds" :min="10" :max="300" />
        </el-form-item>

        <el-divider>风险配置</el-divider>

        <el-form-item label="当日亏损阈值(%)">
          <el-input-number v-model="editConfig.riskConfig.circuitBreaker.dailyLossThreshold" :min="0.1" :max="10" :step="0.1" />
        </el-form-item>

        <el-form-item label="连续止损阈值(次)">
          <el-input-number v-model="editConfig.riskConfig.circuitBreaker.consecutiveLossesThreshold" :min="1" :max="10" />
        </el-form-item>

        <el-form-item label="强制平仓时间">
          <el-time-picker
            v-model="forceLiquidateTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="选择时间"
          />
        </el-form-item>

        <el-form-item label="TP1盈亏比">
          <el-input-number v-model="editConfig.riskConfig.takeProfit.tp1RiskRewardRatio" :min="0.5" :max="5" :step="0.1" />
        </el-form-item>

        <el-form-item label="TP2盈亏比">
          <el-input-number v-model="editConfig.riskConfig.takeProfit.tp2RiskRewardRatio" :min="0.5" :max="5" :step="0.1" />
        </el-form-item>

        <el-form-item label="多头RSI极值">
          <el-input-number v-model="editConfig.riskConfig.takeProfit.rsiExtreme.long" :min="50" :max="90" />
        </el-form-item>

        <el-form-item label="空头RSI极值">
          <el-input-number v-model="editConfig.riskConfig.takeProfit.rsiExtreme.short" :min="10" :max="50" />
        </el-form-item>

        <el-form-item label="ADX下降阈值">
          <el-input-number v-model="editConfig.riskConfig.takeProfit.adxDecreaseThreshold" :min="1" :max="20" />
        </el-form-item>

        <el-form-item label="每日交易限制">
          <el-input-number v-model="editConfig.riskConfig.dailyTradeLimit" :min="1" :max="50" />
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'
import type { BotConfig } from '../../types'


const botStore = useBotStore()
const configDialogVisible = ref(false)
const editConfig = ref<BotConfig | null>(null)
let stopPolling: (() => void) | null = null

// 强制平仓时间字符串，用于时间选择器
const forceLiquidateTime = computed({
  get: () => {
    if (!editConfig.value) return ''
    const { hour, minute } = editConfig.value.riskConfig.forceLiquidateTime
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  },
  set: (value: string) => {
    if (!editConfig.value || !value) return
    const parts = value.split(':')
    if (parts.length !== 2) return
    const hour = parseInt(parts[0]!, 10)
    const minute = parseInt(parts[1]!, 10)
    if (isNaN(hour) || isNaN(minute)) return
    editConfig.value.riskConfig.forceLiquidateTime = { hour, minute }
  }
})

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
    return value.toFixed(5)
  } else if (value < 1) {
    return value.toFixed(4)
  } else if (value < 1000) {
    return value.toFixed(3)
  } else {
    return value.toFixed(2)
  }
}

function formatCooldownTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}分钟`
  } else {
    const hours = Math.floor(seconds / 3600)
    const remainingMinutes = Math.floor((seconds % 3600) / 60)
    if (remainingMinutes > 0) {
      return `${hours}小时${remainingMinutes}分钟`
    } else {
      return `${hours}小时`
    }
  }
}

  // 页面加载时获取状态
  onMounted(async () => {
    await botStore.fetchStatus()
    await botStore.fetchHistory()

    // 开启轮询，使用配置中的 scanInterval 值
    stopPolling = botStore.startPolling()

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

.text-secondary {
  color: #a9a9a9;
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
