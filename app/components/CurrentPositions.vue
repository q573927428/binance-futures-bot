<template>
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
          {{ botStore.state.currentPosition.entryPrice.toFixed(3) }}
          <span class="text-secondary">({{ botStore.state.currentPrice?.toFixed(3) || '--' }})</span>
        </el-descriptions-item>
        <el-descriptions-item label="数量">
          {{ botStore.state.currentPosition.quantity }}
        </el-descriptions-item>
        <el-descriptions-item label="杠杆">
          {{ botStore.state.currentPosition.leverage }}x
        </el-descriptions-item>
        <el-descriptions-item label="止损价">
          {{ botStore.state.currentPosition.stopLoss.toFixed(3) }}
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
          {{ botStore.state.currentPosition.takeProfit1.toFixed(3) }}
        </el-descriptions-item>
        <el-descriptions-item label="止盈TP2">
          {{ botStore.state.currentPosition.takeProfit2.toFixed(3) }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'

const botStore = useBotStore()
</script>

<style scoped>
.card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.position-info {
  padding: 10px 0;
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
</style>
