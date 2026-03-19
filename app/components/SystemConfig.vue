<template>
  <!-- 配置面板 -->
  <el-card class="card" shadow="hover" style="margin-top: 20px">
    <template #header>
      <div class="card-header">
        <span>系统配置</span>
        <el-button
          text
          type="primary"
          @click="handleEditConfig"
        >
          <el-icon><ElIconSetting /></el-icon>
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

  <!-- 配置对话框 -->
  <el-dialog
    v-model="configDialogVisible"
    title="系统配置"
    width="370px"
    :close-on-click-modal="false"
  >
    <el-form v-if="editConfig" :model="editConfig" label-width="150px">
      <!-- 系统控制区域 -->
      <el-divider>系统控制</el-divider>
      
      <div class="system-control-buttons">
        <el-button
          type="primary"
          :loading="botStore.isLoading"
          :disabled="botStore.isRunning"
          @click="handleStart"
        >
          <el-icon style="margin-right: 8px"><ElIconVideoPlay /></el-icon>
          启动
        </el-button>

        <el-button
          type="danger"
          :loading="botStore.isLoading"
          :disabled="!botStore.isRunning"
          @click="handleStop"
        >
          <el-icon style="margin-right: 8px"><ElIconVideoPause /></el-icon>
          停止
        </el-button>
      </div>

      <div class="system-control-buttons" style="margin-top: 12px;">
        <el-button
          type="warning"
          :loading="isGeneratingScript"
          @click="handleGenerateScript"
        >
          <el-icon style="margin-right: 8px"><ElIconDocumentAdd /></el-icon>
          生成Pine
        </el-button>

        <el-button
          type="success"
          :loading="isCopyingScript"
          @click="handleCopyPineScript"
        >
          <el-icon style="margin-right: 8px"><ElIconDocumentCopy /></el-icon>
          复制Pine
        </el-button>
      </div>

      <el-divider>交易配置</el-divider>
      
      <el-form-item label="交易对">
        <el-select v-model="editConfig.symbols" multiple placeholder="选择交易对" style="width: 100%">
          <el-option label="BTC/USDT" value="BTC/USDT" />
          <el-option label="ETH/USDT" value="ETH/USDT" />
          <el-option label="BNB/USDT" value="BNB/USDT" />
          <el-option label="SOL/USDT" value="SOL/USDT" />
          <el-option label="XAU/USDT" value="XAU/USDT" />
          <el-option label="HYPE/USDT" value="HYPE/USDT" />
          <el-option label="DOGE/USDT" value="DOGE/USDT" />
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
        <el-input-number v-model="editConfig.positionTimeoutHours" :min="1" :max="720" />
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
        <el-input-number v-model="editConfig.trailingStopConfig.trailingDistance" :min="0.1" :max="5" :step="0.1" />
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

      <el-form-item label="启用强制平仓">
        <el-switch v-model="editConfig.riskConfig.forceLiquidateTime.enabled" />
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

      <el-form-item label="TP2最小盈利比例(R)">
        <el-input-number v-model="editConfig.riskConfig.takeProfit.tp2MinProfitRatio" :min="0.1" :max="2" :step="0.1" />
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

      <el-divider>策略模式配置</el-divider>

      <el-form-item label="策略模式">
        <el-radio-group v-model="editConfig.strategyMode">
          <el-radio label="short_term">短期</el-radio>
          <el-radio label="medium_term">中长期</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-divider>技术指标配置</el-divider>

      <el-form-item :label="`${editConfig.strategyMode === 'medium_term' ? '1小时' : '15分钟'}ADX阈值`">
        <el-input-number v-model="editConfig.indicatorsConfig.adxTrend.adx15mThreshold" :min="10" :max="50" />
      </el-form-item>

      <el-form-item :label="`${editConfig.strategyMode === 'medium_term' ? '4小时' : '1小时'}ADX阈值`">
        <el-input-number v-model="editConfig.indicatorsConfig.adxTrend.adx1hThreshold" :min="10" :max="50" />
      </el-form-item>

      <el-form-item :label="`${editConfig.strategyMode === 'medium_term' ? '1天' : '4小时'}ADX阈值`">
        <el-input-number v-model="editConfig.indicatorsConfig.adxTrend.adx4hThreshold" :min="10" :max="50" />
      </el-form-item>

      <el-form-item :label="`ADX${editConfig.strategyMode === 'medium_term' ? '1h' : '15m'} > ${editConfig.strategyMode === 'medium_term' ? '4h' : '1h'}检查`">
        <el-switch v-model="editConfig.indicatorsConfig.adxTrend.enableAdx15mVs1hCheck" />
      </el-form-item>

      <el-divider>做多入场条件</el-divider>

      <el-form-item label="EMA偏离阈值(%)">
        <el-input-number v-model="editConfig.indicatorsConfig.longEntry.emaDeviationThreshold" :min="0.001" :max="5" :step="0.001" :precision="3" />
      </el-form-item>

      <el-form-item label="RSI最小值">
        <el-input-number v-model="editConfig.indicatorsConfig.longEntry.rsiMin" :min="20" :max="80" />
      </el-form-item>

      <el-form-item label="RSI最大值">
        <el-input-number v-model="editConfig.indicatorsConfig.longEntry.rsiMax" :min="20" :max="80" />
      </el-form-item>

      <el-form-item label="K线下影线阈值(%)">
        <el-input-number v-model="editConfig.indicatorsConfig.longEntry.candleShadowThreshold" :min="0.001" :max="5" :step="0.001" :precision="3" />
      </el-form-item>

      <el-form-item label="启用成交量确认">
        <el-switch v-model="editConfig.indicatorsConfig.longEntry.volumeConfirmation" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.longEntry.volumeConfirmation" label="EMA成交量周期">
        <el-input-number v-model="editConfig.indicatorsConfig.longEntry.volumeEMAPeriod" :min="5" :max="50" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.longEntry.volumeConfirmation" label="EMA成交量倍数">
        <el-input-number v-model="editConfig.indicatorsConfig.longEntry.volumeEMAMultiplier" :min="0.5" :max="3" :step="0.1" :precision="2" />
      </el-form-item>

      <el-divider>做空入场条件</el-divider>

      <el-form-item label="EMA偏离阈值(%)">
        <el-input-number v-model="editConfig.indicatorsConfig.shortEntry.emaDeviationThreshold" :min="0.001" :max="5" :step="0.001" :precision="3" />
      </el-form-item>

      <el-form-item label="RSI最小值">
        <el-input-number v-model="editConfig.indicatorsConfig.shortEntry.rsiMin" :min="20" :max="80" />
      </el-form-item>

      <el-form-item label="RSI最大值">
        <el-input-number v-model="editConfig.indicatorsConfig.shortEntry.rsiMax" :min="20" :max="80" />
      </el-form-item>

      <el-form-item label="K线上影线阈值(%)">
        <el-input-number v-model="editConfig.indicatorsConfig.shortEntry.candleShadowThreshold" :min="0.001" :max="5" :step="0.001" :precision="3" />
      </el-form-item>

      <el-form-item label="启用成交量确认">
        <el-switch v-model="editConfig.indicatorsConfig.shortEntry.volumeConfirmation" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.shortEntry.volumeConfirmation" label="EMA成交量周期">
        <el-input-number v-model="editConfig.indicatorsConfig.shortEntry.volumeEMAPeriod" :min="5" :max="50" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.shortEntry.volumeConfirmation" label="EMA成交量倍数">
        <el-input-number v-model="editConfig.indicatorsConfig.shortEntry.volumeEMAMultiplier" :min="0.5" :max="3" :step="0.1" :precision="2" />
      </el-form-item>

      <el-divider>价格突破配置</el-divider>

      <el-form-item label="启用价格突破指标">
        <el-switch v-model="editConfig.indicatorsConfig.priceBreakout.enabled" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.priceBreakout.enabled" label="突破周期(K线数)">
        <el-input-number v-model="editConfig.indicatorsConfig.priceBreakout.period" :min="3" :max="20" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.priceBreakout.enabled" label="需要收盘价确认">
        <el-switch v-model="editConfig.indicatorsConfig.priceBreakout.requireConfirmation" />
      </el-form-item>

      <el-form-item v-if="editConfig.indicatorsConfig.priceBreakout.enabled && editConfig.indicatorsConfig.priceBreakout.requireConfirmation" label="确认K线数量">
        <el-input-number v-model="editConfig.indicatorsConfig.priceBreakout.confirmationCandles" :min="1" :max="3" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="configDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="handleSaveConfig">保存配置</el-button>
    </template>
  </el-dialog>

  <!-- 密码输入对话框 -->
  <el-dialog
    v-model="passwordDialogVisible"
    title="密码验证"
    width="350px"
    :close-on-click-modal="false"
  >
    <div class="password-dialog">
      <p style="margin-bottom: 20px; color: #606266;">
        编辑系统配置需要输入密码进行验证
      </p>
      <el-form>
        <el-form-item label="密码">
          <el-input
            v-model="passwordInput"
            type="password"
            placeholder="请输入密码"
            show-password
            @keyup.enter="verifyPassword"
          />
        </el-form-item>
      </el-form>
    </div>
    
    <template #footer>
      <el-button @click="passwordDialogVisible = false">取消</el-button>
      <el-button 
        type="primary" 
        @click="verifyPassword"
        :loading="isVerifyingPassword"
      >
        验证
      </el-button>
    </template>
  </el-dialog>

</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBotStore } from '../stores/bot'
import type { BotConfig } from '../../types'

const botStore = useBotStore()
const configDialogVisible = ref(false)
const editConfig = ref<BotConfig | null>(null)

// 密码保护相关
const passwordDialogVisible = ref(false)
const passwordInput = ref('')
const isVerifyingPassword = ref(false)
const requiresPassword = ref(false)
const isPasswordVerified = ref(false)

// 脚本相关状态
const isGeneratingScript = ref(false)
const isCopyingScript = ref(false)

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
    // 保留现有的 enabled 属性
    const enabled = editConfig.value.riskConfig.forceLiquidateTime.enabled
    editConfig.value.riskConfig.forceLiquidateTime = { enabled, hour, minute }
  }
})

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

// 处理编辑配置按钮点击
async function handleEditConfig() {
  // 检查是否需要密码验证
  try {
    const response = await $fetch<{ success: boolean; requiresPassword: boolean }>('/api/bot/check-password')
    if (response.success) {
      requiresPassword.value = response.requiresPassword
      
      if (requiresPassword.value && !isPasswordVerified.value) {
        // 需要密码验证，显示密码输入对话框
        passwordDialogVisible.value = true
        return
      }
    }
  } catch (error) {
    console.error('检查密码配置失败:', error)
  }
  
  // 不需要密码验证或已经验证通过，直接打开配置对话框
  openConfigDialog()
}

// 打开配置对话框
function openConfigDialog() {
  if (botStore.config) {
    editConfig.value = JSON.parse(JSON.stringify(botStore.config))
    configDialogVisible.value = true
  }
}

// 验证密码
async function verifyPassword() {
  if (!passwordInput.value.trim()) {
    ElMessage.warning('请输入密码')
    return
  }
  
  isVerifyingPassword.value = true
  try {
    const response = await $fetch<{ success: boolean; message?: string; requiresPassword: boolean }>('/api/bot/verify-password', {
      method: 'POST',
      body: { password: passwordInput.value }
    })
    
    if (response.success) {
      isPasswordVerified.value = true
      passwordDialogVisible.value = false
      passwordInput.value = ''
      ElMessage.success('密码验证成功')
      openConfigDialog()
    } else {
      ElMessage.error(response.message || '密码错误')
    }
  } catch (error: any) {
    ElMessage.error('密码验证失败: ' + (error.message || String(error)))
  } finally {
    isVerifyingPassword.value = false
  }
}

// 生成Pine脚本
async function handleGenerateScript() {
  isGeneratingScript.value = true
  try {
    const result = await botStore.generatePineScript()
    
    if (result.success) {
      ElMessage.success(result.message || 'Pine脚本生成成功')
      console.log('脚本生成成功:', result.data)
    } else {
      ElMessage.error(result.message || '生成失败')
      if (result.error) {
        console.error('脚本生成失败:', result.error)
      }
    }
  } catch (error: any) {
    ElMessage.error('生成脚本时发生错误: ' + (error.message || String(error)))
    console.error('生成脚本错误:', error)
  } finally {
    isGeneratingScript.value = false
  }
}

// 复制Pine脚本到剪贴板
async function handleCopyPineScript() {
  isCopyingScript.value = true
  try {
    const result = await botStore.getPineScriptContent()
    
    if (result.success && result.content) {
      // 复制到剪贴板 - 使用兼容性更好的方法
      try {
        // 方法1: 使用现代Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(result.content)
        } else {
          // 方法2: 使用传统的execCommand方法作为备选
          const textArea = document.createElement('textarea')
          textArea.value = result.content
          textArea.style.position = 'fixed'
          textArea.style.left = '-999999px'
          textArea.style.top = '-999999px'
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          const successful = document.execCommand('copy')
          document.body.removeChild(textArea)
          
          if (!successful) {
            // 方法3: 如果前两种方法都失败，显示内容让用户手动复制
            ElMessage.warning('自动复制失败，请手动复制以下内容')
            console.log('Pine脚本内容:', result.content)
            return
          }
        }
        
        ElMessage.success('Pine脚本已复制到剪贴板')
        console.log('脚本复制成功，文件大小:', result.fileInfo?.size, '字节')
      } catch (copyError: any) {
        // 如果复制失败，显示内容让用户手动复制
        ElMessage.warning('自动复制失败，请手动复制以下内容')
        console.log('Pine脚本内容:', result.content)
        console.error('复制错误:', copyError)
      }
    } else {
      ElMessage.error(result.message || '获取脚本失败')
      if (result.suggestion) {
        ElMessage.info(result.suggestion)
      }
      if (result.error) {
        console.error('获取脚本失败:', result.error)
      }
    }
  } catch (error: any) {
    ElMessage.error('复制脚本时发生错误: ' + (error.message || String(error)))
    console.error('复制脚本错误:', error)
  } finally {
    isCopyingScript.value = false
  }
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
</style>
