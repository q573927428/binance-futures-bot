import { 
  appendSimpleKLineData, 
  getSimpleLastKLineTimestamp,
  readSimpleKLineFile,
  writeSimpleKLineFile 
} from '../../utils/kline-simple-storage'
import type { KLineData, KLineTimeframe, KLineSyncConfig } from '../../../types/kline-simple'
import { DEFAULT_CONFIG } from '../../../types/kline-simple'

// 同步状态
interface SyncStatus {
  symbol: string
  timeframe: KLineTimeframe
  lastSyncTime: number
  lastSyncCount: number
  totalBars: number
  status: 'idle' | 'syncing' | 'error'
  error?: string
}

export class KLineSimpleSyncService {
  private config: KLineSyncConfig
  private syncStatus: Map<string, SyncStatus> = new Map()
  private syncInterval: NodeJS.Timeout | null = null

  constructor(config?: Partial<KLineSyncConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initializeStatus()
  }

  // 初始化状态
  private initializeStatus(): void {
    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        const key = this.getStatusKey(symbol, timeframe)
        this.syncStatus.set(key, {
          symbol,
          timeframe,
          lastSyncTime: 0,
          lastSyncCount: 0,
          totalBars: 0,
          status: 'idle'
        })
      }
    }
  }

  // 获取状态键
  private getStatusKey(symbol: string, timeframe: KLineTimeframe): string {
    return `${symbol}-${timeframe}`
  }

  // 更新状态
  private updateStatus(
    symbol: string, 
    timeframe: KLineTimeframe, 
    updates: Partial<SyncStatus>
  ): void {
    const key = this.getStatusKey(symbol, timeframe)
    const current = this.syncStatus.get(key)
    if (current) {
      this.syncStatus.set(key, { ...current, ...updates })
    }
  }

  // 获取时间间隔秒数
  private getIntervalSeconds(timeframe: KLineTimeframe): number {
    switch (timeframe) {
      case '15m': return 15 * 60
      case '1h': return 60 * 60
      case '4h': return 4 * 60 * 60
      case '1d': return 24 * 60 * 60
      case '1w': return 7 * 24 * 60 * 60
      default: return 60 * 60
    }
  }

  // 从Binance获取K线数据
  private async fetchKLineFromBinance(
    symbol: string, 
    timeframe: KLineTimeframe, 
    startTime?: number, 
    endTime?: number,
    limit: number = 1000
  ): Promise<KLineData[]> {
    try {
      // 构建请求URL
      const intervalMap: Record<KLineTimeframe, string> = {
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d',
        '1w': '1w'
      }
      
      const interval = intervalMap[timeframe]
      const binanceSymbol = symbol.replace('/', '')
      
      let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
      
      if (startTime) {
        url += `&startTime=${startTime}`
      }
      
      if (endTime) {
        url += `&endTime=${endTime}`
      }
      
      // 发送请求
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // 解析数据
      return data.map((item: any[]): KLineData => ({
        timestamp: Math.floor(item[0] / 1000), // 转换为秒
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5])
      }))
      
    } catch (error) {
      console.error(`从Binance获取K线数据失败: ${symbol}/${timeframe}`, error)
      throw error
    }
  }

  // 获取合约信息
  private async getSymbolInfo(symbol: string): Promise<{
    onboardTimestamp: number
    status: string
  } | null> {
    try {
      const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      const symbolInfo = data.symbols.find((s: any) => s.symbol === symbol.replace('/', ''))
      
      if (!symbolInfo) {
        return null
      }
      
      return {
        onboardTimestamp: Math.floor(symbolInfo.onboardDate / 1000),
        status: symbolInfo.status
      }
    } catch (error) {
      console.error(`获取合约信息失败: ${symbol}`, error)
      return null
    }
  }

  // 同步单个交易对的K线数据（精简版）
  async syncSymbolKLine(
    symbol: string, 
    timeframe: KLineTimeframe, 
    options: {
      force?: boolean
    } = {}
  ): Promise<{
    success: boolean
    message: string
    symbol: string
    timeframe: KLineTimeframe
    count: number
  }> {
    const { force = false } = options
    const key = this.getStatusKey(symbol, timeframe)
    
    try {
      // 检查是否正在同步
      const currentStatus = this.syncStatus.get(key)
      if (currentStatus?.status === 'syncing' && !force) {
        return {
          success: false,
          message: '正在同步中，请稍后再试',
          symbol,
          timeframe,
          count: 0
        }
      }
      
      // 更新状态为同步中
      this.updateStatus(symbol, timeframe, { status: 'syncing', error: undefined })
      
      // 获取最后一条数据的时间戳
      const lastTimestamp = getSimpleLastKLineTimestamp(symbol, timeframe)
      
      if (!lastTimestamp || force) {
        // 首次同步或强制同步
        console.log(`[首次同步] 开始获取历史数据: ${symbol}/${timeframe}`)
        const result = await this.syncHistoryData(symbol, timeframe)
        
        this.updateStatus(symbol, timeframe, { 
          status: 'idle', 
          lastSyncTime: Math.floor(Date.now() / 1000),
          lastSyncCount: result.totalBars,
          totalBars: result.totalBars
        })
        
        return {
          success: result.success,
          message: result.message,
          symbol,
          timeframe,
          count: result.totalBars
        }
      } else {
        // 增量更新
        const result = await this.syncIncrementalData(symbol, timeframe, lastTimestamp)
        
        this.updateStatus(symbol, timeframe, { 
          status: 'idle', 
          lastSyncTime: Math.floor(Date.now() / 1000),
          lastSyncCount: result.count,
          totalBars: (currentStatus?.totalBars || 0) + result.count
        })
        
        return {
          success: result.success,
          message: result.message,
          symbol,
          timeframe,
          count: result.count
        }
      }
      
    } catch (error: any) {
      console.error(`同步K线数据失败: ${symbol}/${timeframe}`, error)
      
      this.updateStatus(symbol, timeframe, { 
        status: 'error', 
        error: error.message 
      })
      
      return {
        success: false,
        message: `同步失败: ${error.message}`,
        symbol,
        timeframe,
        count: 0
      }
    }
  }

  // 同步历史数据（首次同步）
  private async syncHistoryData(
    symbol: string, 
    timeframe: KLineTimeframe
  ): Promise<{
    success: boolean
    message: string
    totalBars: number
  }> {
    try {
      // 获取合约信息
      const symbolInfo = await this.getSymbolInfo(symbol)
      if (!symbolInfo) {
        return {
          success: false,
          message: `合约 ${symbol} 不存在`,
          totalBars: 0
        }
      }
      
      const intervalSeconds = this.getIntervalSeconds(timeframe)
      const now = Math.floor(Date.now() / 1000)
      const targetBars = 22000
      const totalSeconds = targetBars * intervalSeconds
      
      // 计算开始时间
      const theoreticalStartTimestamp = now - totalSeconds
      const actualStartTimestamp = Math.max(theoreticalStartTimestamp, symbolInfo.onboardTimestamp)
      
      // 计算实际可获取的数据量
      const availableSeconds = now - actualStartTimestamp
      const maxAvailableBars = Math.floor(availableSeconds / intervalSeconds)
      const actualTargetBars = Math.min(targetBars, maxAvailableBars)
      
      if (actualTargetBars <= 0) {
        return {
          success: false,
          message: '合约上线时间太短，无法获取任何数据',
          totalBars: 0
        }
      }
      
      console.log(`[历史同步] 开始获取 ${symbol}/${timeframe} 的历史数据，目标: ${actualTargetBars} 条`)
      
      let currentStartTime = actualStartTimestamp
      let fetchedBars = 0
      const allData: KLineData[] = []
      
      while (fetchedBars < actualTargetBars) {
        const remaining = actualTargetBars - fetchedBars
        const batchSize = Math.min(1000, remaining)
        
        const batchData = await this.fetchKLineFromBinance(
          symbol, 
          timeframe, 
          currentStartTime * 1000,
          undefined,
          batchSize
        )
        
        if (batchData.length === 0) {
          break
        }
        
        allData.push(...batchData)
        fetchedBars += batchData.length
        
        // 更新下一个批次的开始时间
        const lastItem = batchData[batchData.length - 1]
        if (lastItem) {
          currentStartTime = lastItem.timestamp + intervalSeconds
        } else {
          break
        }
        
        // 避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      if (allData.length > 0) {
        const success = writeSimpleKLineFile(symbol, timeframe, allData)
        
        if (!success) {
          throw new Error('保存数据失败')
        }
        
        console.log(`[历史同步] 完成! 获取 ${allData.length} 条数据`)
        
        return {
          success: true,
          message: `历史同步完成，获取 ${allData.length} 条数据`,
          totalBars: allData.length
        }
      } else {
        return {
          success: false,
          message: '没有获取到任何数据',
          totalBars: 0
        }
      }
      
    } catch (error: any) {
      console.error(`[历史同步] 失败: ${symbol}/${timeframe}`, error)
      return {
        success: false,
        message: `历史同步失败: ${error.message}`,
        totalBars: 0
      }
    }
  }

  // 同步增量数据（避免获取未完成K线）
  private async syncIncrementalData(
    symbol: string, 
    timeframe: KLineTimeframe,
    lastTimestamp: number
  ): Promise<{
    success: boolean
    message: string
    count: number
  }> {
    try {
      const intervalSeconds = this.getIntervalSeconds(timeframe)
      
      // 计算开始时间：从最后一条数据的下一个周期开始
      // 避免获取最后一根未完成的K线
      const startTime = (lastTimestamp + intervalSeconds) * 1000
      
      // 获取数据
      const klineData = await this.fetchKLineFromBinance(
        symbol, 
        timeframe, 
        startTime, 
        undefined,
        1000
      )
      
      // 过滤掉时间戳小于等于lastTimestamp的数据
      // 确保只获取新的、已完成的K线
      const newKlineData = klineData.filter(item => item.timestamp > lastTimestamp)
      
      if (newKlineData.length === 0) {
        return {
          success: true,
          message: '没有新数据',
          count: 0
        }
      }
      
      // 检查是否有未完成的K线（当前周期的K线）
      const now = Math.floor(Date.now() / 1000)
      const currentKlineStart = now - (now % intervalSeconds)
      
      // 过滤掉当前未完成的K线
      const completedKlineData = newKlineData.filter(item => item.timestamp < currentKlineStart)
      
      if (completedKlineData.length === 0) {
        return {
          success: true,
          message: '只有未完成的K线，等待下一周期',
          count: 0
        }
      }
      
      const success = appendSimpleKLineData(symbol, timeframe, completedKlineData)
      
      if (!success) {
        throw new Error('保存数据失败')
      }
      
      console.log(`[增量同步] ${symbol}/${timeframe}: 获取 ${completedKlineData.length} 条新数据`)
      
      return {
        success: true,
        message: `增量同步成功，获取 ${completedKlineData.length} 条数据`,
        count: completedKlineData.length
      }
      
    } catch (error: any) {
      console.error(`[增量同步] 失败: ${symbol}/${timeframe}`, error)
      return {
        success: false,
        message: `增量同步失败: ${error.message}`,
        count: 0
      }
    }
  }

  // 同步所有配置的交易对和周期
  async syncAllKLine(options: { force?: boolean } = {}): Promise<Array<{
    success: boolean
    message: string
    symbol: string
    timeframe: KLineTimeframe
    count: number
  }>> {
    const { force = false } = options
    const results = []
    
    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        try {
          const result = await this.syncSymbolKLine(symbol, timeframe, { force })
          results.push(result)
          
          // 避免请求过于频繁
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (error: any) {
          results.push({
            success: false,
            message: `同步失败: ${error.message}`,
            symbol,
            timeframe,
            count: 0
          })
        }
      }
    }
    
    return results
  }

  // 开始定时同步
  startAutoSync(): void {
    if (this.syncInterval) {
      console.warn('定时同步已经在运行')
      return
    }
    
    console.log(`开始定时同步，间隔: ${this.config.syncInterval}秒`)
    
    this.syncInterval = setInterval(async () => {
      try {
        console.log('开始定时同步所有K线数据...')
        const results = await this.syncAllKLine()
        
        const successCount = results.filter(r => r.success).length
        const totalCount = results.reduce((sum, r) => sum + r.count, 0)
        
        console.log(`定时同步完成: ${successCount}/${results.length} 成功，共获取 ${totalCount} 条数据`)
      } catch (error) {
        console.error('定时同步失败:', error)
      }
    }, this.config.syncInterval * 1000)
  }

  // 停止定时同步
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log('已停止定时同步')
    }
  }

  // 获取同步状态
  getSyncStatus(): SyncStatus[] {
    return Array.from(this.syncStatus.values())
  }

  // 获取特定交易对和周期的状态
  getSymbolSyncStatus(symbol: string, timeframe: KLineTimeframe): SyncStatus | null {
    const key = this.getStatusKey(symbol, timeframe)
    return this.syncStatus.get(key) || null
  }

  // 获取配置
  getConfig(): KLineSyncConfig {
    return { ...this.config }
  }

  // 更新配置
  updateConfig(newConfig: Partial<KLineSyncConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // 重新初始化状态
    this.initializeStatus()
    
    // 如果定时同步在运行，重启它
    if (this.syncInterval) {
      this.stopAutoSync()
      this.startAutoSync()
    }
  }
}