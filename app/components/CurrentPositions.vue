<template>
  <el-card v-if="botStore.hasPosition" class="card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>🎯 当前持仓</span>
        <div class="header-actions">
          <el-tag :type="botStore.state?.currentPosition?.direction === 'LONG' ? 'success' : 'danger'">
            {{ botStore.state?.currentPosition?.direction }}
          </el-tag>
          <el-button
            type="danger"
            size="small"
            @click="handleClosePosition"
            :loading="isClosing"
          >
            手动平仓
          </el-button>
        </div>
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

  <!-- 密码验证对话框 -->
  <el-dialog
    v-model="passwordDialogVisible"
    title="密码验证"
    width="350px"
    :close-on-click-modal="false"
  >
    <div class="password-dialog">
      <p style="margin-bottom: 20px; color: #606266;">
        手动平仓操作需要输入密码进行验证
      </p>
      <el-form>
        <el-form-item label="密码">
          <el-input
            v-model="passwordInput"
            type="password"
            placeholder="请输入密码"
            show-password
            @keyup.enter="executeClosePosition"
          />
        </el-form-item>
      </el-form>
    </div>
    
    <template #footer>
      <el-button @click="passwordDialogVisible = false">取消</el-button>
      <el-button 
        type="danger" 
        @click="executeClosePosition"
        :loading="isClosing"
      >
        确认平仓
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'

const botStore = useBotStore()

// 密码验证相关
const passwordDialogVisible = ref(false)
const passwordInput = ref('')
const isClosing = ref(false)
const requiresPassword = ref(false)

// 处理平仓按钮点击
async function handleClosePosition() {
  // 先检查是否需要密码验证
  try {
    const response = await $fetch<{ success: boolean; requiresPassword: boolean }>('/api/bot/check-password')
    if (response.success) {
      requiresPassword.value = response.requiresPassword
      
      if (requiresPassword.value) {
        // 需要密码验证，显示密码输入对话框
        passwordDialogVisible.value = true
        return
      }
    }
  } catch (error) {
    console.error('检查密码配置失败:', error)
  }
  
  // 不需要密码验证，直接执行平仓（使用空密码）
  await executeClosePositionWithPassword('')
}

// 执行平仓（从对话框触发）
async function executeClosePosition() {
  if (requiresPassword.value && !passwordInput.value.trim()) {
    ElMessage.warning('请输入密码')
    return
  }
  
  await executeClosePositionWithPassword(passwordInput.value)
}

// 使用密码执行平仓
async function executeClosePositionWithPassword(password: string) {
  isClosing.value = true
  try {
    const result = await botStore.closePosition(password, '手动平仓')
    
    if (result.success) {
      ElMessage.success(result.message || '平仓成功')
      passwordDialogVisible.value = false
      passwordInput.value = ''
      // 刷新状态
      await botStore.fetchStatus()
    } else {
      ElMessage.error(result.message || '平仓失败')
    }
  } catch (error: any) {
    ElMessage.error('平仓失败: ' + (error.message || String(error)))
  } finally {
    isClosing.value = false
  }
}
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
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

.password-dialog {
  padding: 10px 0;
}
</style>