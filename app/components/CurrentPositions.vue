<template>
  <el-card v-if="botStore.hasPosition" class="card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>🎯 当前持仓</span>
        <div class="header-actions">
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
      <!-- 仪表盘布局 -->
      <div class="dashboard-layout">
        <!-- 左侧：交易对和基本信息 -->
        <div class="dashboard-left">
          <div class="symbol-display">
            <div class="symbol-name">{{ botStore.state.currentPosition.symbol }}</div>
            <div class="direction-tag">
              <el-tag :type="botStore.state.currentPosition.direction === 'LONG' ? 'success' : 'danger'" size="large">
                {{ botStore.state.currentPosition.direction }}
              </el-tag>
            </div>
          </div>
          
          <div class="basic-info">
            <div class="info-item">
              <span class="info-label">杠杆</span>
              <span class="info-value">{{ botStore.state.currentPosition.leverage }}x</span>
            </div>
            <div class="info-item">
              <span class="info-label">数量</span>
              <span class="info-value">{{ botStore.state.currentPosition.quantity }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">开仓时间</span>
              <span class="info-value">{{ dayjs(botStore.state.currentPosition.openTime).format('MM-DD HH:mm') }}</span>
            </div>
          </div>
        </div>

        <!-- 右侧：盈亏数据 -->
        <div class="dashboard-right">
          <div class="pnl-display" :class="getPnlClass()">
            <div class="pnl-amount">
              {{ botStore.state.currentPnL ? botStore.state.currentPnL.toFixed(2) : '--' }} U
            </div>
            <div class="pnl-percentage">
              {{ botStore.state.currentPnLPercentage ? botStore.state.currentPnLPercentage.toFixed(2) + '%' : '--' }}
            </div>
          </div>
        </div>
      </div>

      <!-- 价格区间进度条 -->
      <div class="price-range-section">
        <div class="price-range-bar">
          <!-- 上方标签区域 -->
          <div class="price-labels-top">
            <div 
              class="price-label-top stop-loss" 
              :style="getStopLossStyle()"
            >
              <div class="label-icon">🛑</div>
              <div class="label-text">止损</div>
            </div>
            
            <div 
              class="price-label-top entry" 
              :style="getEntryPriceStyle()"
            >
              <div class="label-icon">🚀</div>
              <div class="label-text">入场</div>
            </div>
            
            <div 
              class="price-label-top take-profit1" 
              :style="getTakeProfit1Style()"
            >
              <div class="label-icon">🎯</div>
              <div class="label-text">TP1止盈</div>
            </div>
            
            <div 
              class="price-label-top take-profit2" 
              :style="getTakeProfit2Style()"
            >
              <div class="label-icon">🏆</div>
              <div class="label-text">TP2止盈</div>
            </div>
          </div>
          
          <!-- 上方金额区域 -->
          <div class="price-values-top">
            <div 
              class="price-value-top stop-loss" 
              :style="getStopLossStyle()"
            >
              {{ botStore.state.currentPosition.stopLoss.toFixed(3) }}
            </div>
            
            <div 
              class="price-value-top entry" 
              :style="getEntryPriceStyle()"
            >
              {{ botStore.state.currentPosition.entryPrice.toFixed(3) }}
            </div>
            
            <div 
              class="price-value-top take-profit1" 
              :style="getTakeProfit1Style()"
            >
              {{ botStore.state.currentPosition.takeProfit1.toFixed(3) }}
            </div>
            
            <div 
              class="price-value-top take-profit2" 
              :style="getTakeProfit2Style()"
            >
              {{ botStore.state.currentPosition.takeProfit2.toFixed(3) }}
            </div>
          </div>
          
          <!-- 线性进度条 -->
          <div class="price-range-track">
            <div class="linear-progress-bar">
              <!-- 线性进度条背景 -->
              <div class="linear-progress-background"></div>
              
              <!-- 价格标记点在线性进度条上方 -->
              <div 
                class="linear-marker-dot stop-loss" 
                :style="getStopLossStyle()"
              ></div>
              <div 
                class="linear-marker-dot entry" 
                :style="getEntryPriceStyle()"
              ></div>
              <div 
                class="linear-marker-dot current" 
                :style="getCurrentPriceStyle()"
                :class="getCurrentPriceClass()"
              ></div>
              <div 
                class="linear-marker-dot take-profit1" 
                :style="getTakeProfit1Style()"
              ></div>
              <div 
                class="linear-marker-dot take-profit2" 
                :style="getTakeProfit2Style()"
              ></div>
            </div>
          </div>
          
          <!-- 下方当前价格区域 -->
          <div class="current-price-bottom">
            <div 
              class="current-label" 
              :style="getCurrentPriceStyle()"
            >
              <div class="label-icon">▲</div>
              <div class="label-text">当前</div>
            </div>
            
            <div 
              class="current-value" 
              :style="getCurrentPriceStyle()"
            >
              {{ botStore.state.currentPrice?.toFixed(3) || '--' }}
            </div>
          </div>
        </div>
      </div>
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
import { ref, computed } from 'vue'
import { useBotStore } from '../stores/bot'
import dayjs from 'dayjs'

const botStore = useBotStore()

// 密码验证相关
const passwordDialogVisible = ref(false)
const passwordInput = ref('')
const isClosing = ref(false)
const requiresPassword = ref(false)

// 计算价格区间相关数据
const priceRange = computed(() => {
  const position = botStore.state?.currentPosition
  if (!position) return { min: 0, max: 0, range: 0 }
  
  const min = Math.min(position.stopLoss, position.takeProfit2)
  const max = Math.max(position.stopLoss, position.takeProfit2)
  return { min, max, range: max - min }
})

// 获取当前价格位置百分比
const currentPricePosition = computed(() => {
  const position = botStore.state?.currentPosition
  const currentPrice = botStore.state?.currentPrice
  if (!position || !currentPrice || priceRange.value.range === 0) return 50
  
  const normalizedPrice = Math.max(priceRange.value.min, Math.min(priceRange.value.max, currentPrice))
  return ((normalizedPrice - priceRange.value.min) / priceRange.value.range) * 100
})

// 获取入场价格位置百分比
const entryPricePosition = computed(() => {
  const position = botStore.state?.currentPosition
  if (!position || priceRange.value.range === 0) return 50
  
  const normalizedPrice = Math.max(priceRange.value.min, Math.min(priceRange.value.max, position.entryPrice))
  return ((normalizedPrice - priceRange.value.min) / priceRange.value.range) * 100
})

// 获取盈亏显示类名
function getPnlClass() {
  const pnl = botStore.state?.currentPnL
  if (!pnl) return 'pnl-neutral'
  return pnl >= 0 ? 'pnl-positive' : 'pnl-negative'
}

// 获取当前价格样式
function getCurrentPriceStyle() {
  return {
    left: `${currentPricePosition.value}%`
  }
}

// 获取当前价格类名
function getCurrentPriceClass() {
  const position = botStore.state?.currentPosition
  if (!position) return 'price-neutral'
  
  const currentPrice = botStore.state?.currentPrice
  if (!currentPrice) return 'price-neutral'
  
  // 根据价格相对于入场价的位置决定颜色
  if (position.direction === 'LONG') {
    return currentPrice >= position.entryPrice ? 'price-positive' : 'price-negative'
  } else {
    return currentPrice <= position.entryPrice ? 'price-positive' : 'price-negative'
  }
}

// 获取止损价格位置百分比
const stopLossPosition = computed(() => {
  const position = botStore.state?.currentPosition
  if (!position || priceRange.value.range === 0) return 0
  
  const normalizedPrice = Math.max(priceRange.value.min, Math.min(priceRange.value.max, position.stopLoss))
  return ((normalizedPrice - priceRange.value.min) / priceRange.value.range) * 100
})

// 获取止盈TP1价格位置百分比
const takeProfit1Position = computed(() => {
  const position = botStore.state?.currentPosition
  if (!position || priceRange.value.range === 0) return 100
  
  const normalizedPrice = Math.max(priceRange.value.min, Math.min(priceRange.value.max, position.takeProfit1))
  return ((normalizedPrice - priceRange.value.min) / priceRange.value.range) * 100
})

// 获取止盈TP2价格位置百分比
const takeProfit2Position = computed(() => {
  const position = botStore.state?.currentPosition
  if (!position || priceRange.value.range === 0) return 100
  
  const normalizedPrice = Math.max(priceRange.value.min, Math.min(priceRange.value.max, position.takeProfit2))
  return ((normalizedPrice - priceRange.value.min) / priceRange.value.range) * 100
})

// 获取止损价格样式
function getStopLossStyle() {
  return {
    left: `${stopLossPosition.value}%`
  }
}

// 获取入场价格样式
function getEntryPriceStyle() {
  return {
    left: `${entryPricePosition.value}%`
  }
}

// 获取止盈TP1价格样式
function getTakeProfit1Style() {
  return {
    left: `${takeProfit1Position.value}%`
  }
}

// 获取止盈TP2价格样式
function getTakeProfit2Style() {
  return {
    left: `${takeProfit2Position.value}%`
  }
}

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

/* 仪表盘布局样式 */
.dashboard-layout {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.dashboard-left {
  flex: 1;
}

.symbol-display {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.symbol-name {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  letter-spacing: 1px;
}

.direction-tag .el-tag {
  font-size: 14px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 20px;
}

.basic-info {
  display: flex;
  gap: 24px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #7f8c8d;
  font-weight: 500;
}

.info-value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.dashboard-right {
  flex-shrink: 0;
}

.pnl-display {
  padding: 18px 22px;
  border-radius: 16px;
  text-align: center;
  min-width: 150px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.pnl-display.pnl-positive {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  color: white;
}

.pnl-display.pnl-negative {
  background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
  color: white;
}

.pnl-display.pnl-neutral {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
  color: white;
}

.pnl-amount {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.pnl-percentage {
  font-size: 16px;
  font-weight: 600;
  opacity: 0.9;
}

/* 价格区间进度条样式 */
.price-range-section {
  margin-top: 24px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.price-range-bar {
  position: relative;
  height: 140px;
  padding: 0 20px;
}

/* 上方标签区域 */
.price-labels-top {
  position: absolute;
  top: 0;
  left: 20px;
  right: 20px;
  height: 30px;
}

.price-label-top {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  text-align: center;
  transition: left 0.5s ease;
  min-width: 60px;
}

.price-label-top .label-icon {
  font-size: 16px;
  margin-bottom: 2px;
}

.price-label-top .label-text {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.price-label-top.stop-loss .label-text {
  color: #ef4444;
}

.price-label-top.entry .label-text {
  color: #3b82f6;
}

.price-label-top.take-profit1 .label-text,
.price-label-top.take-profit2 .label-text {
  color: #8b5cf6;
}

/* 上方金额区域 */
.price-values-top {
  position: absolute;
  top: 45px;
  left: 20px;
  right: 20px;
  height: 30px;
}

.price-value-top {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
  transition: left 0.5s ease;
  min-width: 80px;
}

.price-value-top.stop-loss {
  color: #ef4444;
}

.price-value-top.entry {
  color: #3b82f6;
}

.price-value-top.take-profit1,
.price-value-top.take-profit2 {
  color: #8b5cf6;
}

/* 线性进度条 */
.price-range-track {
  position: absolute;
  top: 70px;
  left: 20px;
  right: 20px;
  height: 40px;
}

.linear-progress-bar {
  position: relative;
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  margin-top: 5px;
}

.linear-progress-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, #ef4444 0%, #3b82f6 50%, #8b5cf6 100%);
  opacity: 0.3;
  border-radius: 3px;
}

/* 线性进度条上的标记点 */
.linear-marker-dot {
  position: absolute;
  top: -7px;
  transform: translateX(-50%);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: left 0.5s ease;
  z-index: 10;
}

.linear-marker-dot.stop-loss {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.linear-marker-dot.entry {
  background: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.linear-marker-dot.current {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.linear-marker-dot.current.price-negative {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.linear-marker-dot.take-profit1,
.linear-marker-dot.take-profit2 {
  background: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
}

/* 下方当前价格区域 */
.current-price-bottom {
  position: absolute;
  bottom: 10px;
  left: 20px;
  right: 20px;
  height: 50px;
}

.current-label {
  position: absolute;
  bottom: 0px;
  transform: translateX(-50%);
  text-align: center;
  transition: left 0.5s ease;
  min-width: 60px;
}

.current-label .label-icon {
  font-size: 16px;
  margin-bottom: 2px;
  color: #10b981;
}

.current-label .label-text {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  color: #10b981;
}

.current-value {
  position: absolute;
  bottom: -20px;
  transform: translateX(-50%);
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: #10b981;
  white-space: nowrap;
  transition: left 0.5s ease;
  min-width: 80px;
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
@media (max-width: 768px) {
  .pnl-display{
    min-width: 90px;
    padding: 18px 10px;
  }
}
</style>
