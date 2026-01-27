import { defineStore } from 'pinia'
import type { 
  BotState,
  BotConfig, 
  TradeHistory, 
  LogEntry,
  CryptoBalance,
  StatusResponse,
  StartStopResponse,
  ConfigResponse,
  HistoryResponse
} from '../../types'

export const useBotStore = defineStore('bot', {
  state: () => ({
    state: null as BotState | null,
    config: null as BotConfig | null,
    history: [] as TradeHistory[],
    logs: [] as LogEntry[],
    cryptoBalances: [] as CryptoBalance[],
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    isRunning: (state) => {
      return state.state?.status === 'MONITORING' || state.state?.status === 'POSITION'
    },
    hasPosition: (state) => {
      return state.state?.currentPosition !== null
    },
    isHalted: (state) => {
      return state.state?.status === 'HALTED'
    },
  },

  actions: {
    async fetchStatus() {
      try {
        this.isLoading = true
        this.error = null

        const response = await $fetch<StatusResponse>('/api/bot/status')
        
        if (response.success) {
          this.state = response.data!.state
          this.config = response.data!.config
          this.logs = response.data!.logs
          // 更新加密货币余额
          if (response.data!.cryptoBalances) {
            this.cryptoBalances = response.data!.cryptoBalances
          }
        } else {
          this.error = response.message || '获取状态失败'
        }
      } catch (error: any) {
        this.error = error.message || '获取状态失败'
      } finally {
        this.isLoading = false
      }
    },

    async startBot() {
      try {
        this.isLoading = true
        this.error = null

        const response = await $fetch<StartStopResponse>('/api/bot/start', {
          method: 'POST',
        })

        if (response.success) {
          this.state = response.state!
          return true
        } else {
          this.error = response.message || '启动失败'
          return false
        }
      } catch (error: any) {
        this.error = error.message || '启动失败'
        return false
      } finally {
        this.isLoading = false
      }
    },

    async stopBot() {
      try {
        this.isLoading = true
        this.error = null

        const response = await $fetch<StartStopResponse>('/api/bot/stop', {
          method: 'POST',
        })

        if (response.success) {
          this.state = response.state!
          return true
        } else {
          this.error = response.message || '停止失败'
          return false
        }
      } catch (error: any) {
        this.error = error.message || '停止失败'
        return false
      } finally {
        this.isLoading = false
      }
    },

    async updateConfig(newConfig: Partial<BotConfig>) {
      try {
        this.isLoading = true
        this.error = null

        const response = await $fetch<ConfigResponse>('/api/bot/config', {
          method: 'PATCH',
          body: newConfig,
        })

        if (response.success) {
          this.config = response.config!
          return true
        } else {
          this.error = response.message || '更新配置失败'
          return false
        }
      } catch (error: any) {
        this.error = error.message || '更新配置失败'
        return false
      } finally {
        this.isLoading = false
      }
    },

    async fetchHistory() {
      try {
        this.isLoading = true
        this.error = null

        const response = await $fetch<HistoryResponse>('/api/bot/history')

        if (response.success) {
          this.history = response.data!
        } else {
          this.error = response.message || '获取历史失败'
        }
      } catch (error: any) {
        this.error = error.message || '获取历史失败'
      } finally {
        this.isLoading = false
      }
    },

    startPolling(interval?: number) {
      // 使用配置中的 scanInterval 值，如果没有传入 interval 参数
      // 配置中的 scanInterval 是秒，需要转换为毫秒
      const pollInterval = interval || (this.config?.scanInterval || 60) * 1000
      
      // 定时轮询状态
      const timer = setInterval(() => {
        this.fetchStatus()
      }, pollInterval)

      return () => clearInterval(timer)
    },
  },
})