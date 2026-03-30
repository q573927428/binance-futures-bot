import { appendSimpleKLineData, getSimpleLastKLineTimestamp } from '../../utils/kline-simple-storage'
import type { KLineData, KLineTimeframe, KLineSyncConfig } from '../../../types/kline-simple'
import { DEFAULT_CONFIG } from '../../../types/kline-simple'

// Binance K线数据接口
interface BinanceKLine {
  timestamp: number
  open: string
  high: string
  low: string
  close: string
  volume: string
}

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

  // 从Binance获取K线数据
  private async fetchKLineFromBinance(
    symbol: string, 
    timeframe: KLineTimeframe, 
    startTime?: number, 
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

  // 同步单个交易对的K线数据
  async syncSymbolKLine(
    symbol: string, 
    timeframe: KLineTimeframe, 
    options: {
      force?: boolean
      initialBars?: number
    } = {}
  ): Promise<{
    success: boolean
    message: string
    symbol: string
    timeframe: KLineTimeframe
    count: number
    newBars: number
  }> {
    const { force = false, initialBars = 1000 } = options
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
          count: 0,
          newBars: 0
        }
      }
      
      // 更新状态为同步中
      this.updateStatus(symbol, timeframe, { status: 'syncing', error: undefined })
      
      // 获取最后一条数据的时间戳
      let lastTimestamp = getSimpleLastKLineTimestamp(symbol, timeframe)
      let startTime: number | undefined
      
      if (lastTimestamp && !force) {
        // 从最后一条数据之后开始获取
        startTime = lastTimestamp + 1
      } else {
        // 首次同步或强制同步，获取初始数据
        startTime = undefined
      }
      
      // 获取数据
      const klineData = await this.fetchKLineFromBinance(
        symbol, 
        timeframe, 
        startTime, 
        initialBars
      )
      
      if (klineData.length === 0) {
        this.updateStatus(symbol, timeframe, { 
          status: 'idle', 
          lastSyncTime: Math.floor(Date.now() / 1000),
          lastSyncCount: 0
        })
        
        return {
          success: true,
          message: '没有新数据',
          symbol,
          timeframe,
          count: 0,
          newBars: 0
        }
      }
      
      // 保存数据
      const success = appendSimpleKLineData(symbol, timeframe, klineData)
      
      if (!success) {
        throw new Error('保存数据失败')
      }
      
      // 更新状态
      this.updateStatus(symbol, timeframe, { 
        status: 'idle', 
        lastSyncTime: Math.floor(Date.now() / 1000),
        lastSyncCount: klineData.length,
        totalBars: (currentStatus?.totalBars || 0) + klineData.length
      })
      
      return {
        success: true,
        message: `同步成功，获取 ${klineData.length} 条数据`,
        symbol,
        timeframe,
        count: klineData.length,
        newBars: klineData.length
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
        count: 0,
        newBars: 0
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


  // 手动同步历史数据
  async manualSyncHistory(
    symbol: string, 
    timeframe: KLineTimeframe, 
    options: {
      totalBars?: number
      batchSize?: number
      startTime?: number
      endTime?: number
    } = {}
  ): Promise<{
    success: boolean
    message: string
    symbol: string
    timeframe: KLineTimeframe
    totalBars: number
    batches: number
  }> {
    const { totalBars = 22000, batchSize = 1000, startTime, endTime } = options
    
    try {
      this.updateStatus(symbol, timeframe, { status: 'syncing', error: undefined })
      
      let currentStartTime = startTime
      let fetchedBars = 0
      let batches = 0
      const allData: KLineData[] = []
      
      while (fetchedBars < totalBars) {
        const remaining = totalBars - fetchedBars
        const currentBatchSize = Math.min(batchSize, remaining)
        
        console.log(`获取批次 ${batches + 1}: ${symbol}/${timeframe}, 开始时间: ${currentStartTime}`)
        
        const batchData = await this.fetchKLineFromBinance(
          symbol, 
          timeframe, 
          currentStartTime, 
          currentBatchSize
        )
        
        if (batchData.length === 0) {
          break // 没有更多数据
        }
        
        allData.push(...batchData)
        fetchedBars += batchData.length
        batches++
        
        // 更新下一个批次的开始时间
        const lastItem = batchData[batchData.length - 1]
        if (lastItem) {
          currentStartTime = lastItem.timestamp + 1
        } else {
          break // 如果没有数据，退出循环
        }
        
        // 检查是否达到结束时间
        if (endTime && currentStartTime > endTime) {
          break
        }
        
        // 避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      // 保存所有数据
      if (allData.length > 0) {
        const success = appendSimpleKLineData(symbol, timeframe, allData)
        
        if (!success) {
          throw new Error('保存数据失败')
        }
      }
      
      this.updateStatus(symbol, timeframe, { 
        status: 'idle', 
        lastSyncTime: Math.floor(Date.now() / 1000),
        lastSyncCount: allData.length,
        totalBars: allData.length
      })
      
      return {
        success: true,
        message: `手动同步完成，获取 ${allData.length} 条数据，共 ${batches} 个批次`,
        symbol,
        timeframe,
        totalBars: allData.length,
        batches
      }
      
    } catch (error: any) {
      console.error(`手动同步历史数据失败: ${symbol}/${timeframe}`, error)
      
      this.updateStatus(symbol, timeframe, { 
        status: 'error', 
        error: error.message 
      })
      
      return {
        success: false,
        message: `手动同步失败: ${error.message}`,
        symbol,
        timeframe,
        totalBars: 0,
        batches: 0
      }
    }
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