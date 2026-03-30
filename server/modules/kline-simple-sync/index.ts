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

  // 获取合约信息
  private async getSymbolInfo(symbol: string): Promise<{
    exists: boolean
    symbol: string
    status: string
    onboardDate: number
    onboardTimestamp: number
    baseAsset: string
    quoteAsset: string
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
        exists: true,
        symbol: symbolInfo.symbol,
        status: symbolInfo.status,
        onboardDate: symbolInfo.onboardDate,
        onboardTimestamp: Math.floor(symbolInfo.onboardDate / 1000),
        baseAsset: symbolInfo.baseAsset,
        quoteAsset: symbolInfo.quoteAsset
      }
    } catch (error) {
      console.error(`获取合约信息失败: ${symbol}`, error)
      return null
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
      
      if (!lastTimestamp || force) {
        // 首次同步或强制同步，使用manualSyncHistory获取22000条数据
        console.log(`[首次同步] 开始获取历史数据: ${symbol}/${timeframe}`)
        const historyResult = await this.manualSyncHistory(symbol, timeframe, {
          totalBars: 22000,
          batchSize: 1000
        })
        
        if (historyResult.success) {
          this.updateStatus(symbol, timeframe, { 
            status: 'idle', 
            lastSyncTime: Math.floor(Date.now() / 1000),
            lastSyncCount: historyResult.totalBars,
            totalBars: historyResult.totalBars
          })
          
          return {
            success: true,
            message: `首次同步成功，获取 ${historyResult.totalBars} 条数据`,
            symbol,
            timeframe,
            count: historyResult.totalBars,
            newBars: historyResult.totalBars
          }
        } else {
          throw new Error(`首次同步失败: ${historyResult.message}`)
        }
      } else {
        // 已经有数据，进行增量更新
        // 使用 lastTimestamp + intervalSeconds 作为startTime（毫秒），确保获取下一根完整的K线
        const intervalSeconds = this.getIntervalSeconds(timeframe)
        const startTime = (lastTimestamp + intervalSeconds) * 1000 // 转换为毫秒
        
        // 获取数据
        const klineData = await this.fetchKLineFromBinance(
          symbol, 
          timeframe, 
          startTime, 
          undefined, // endTime
          initialBars // limit
        )
        
        // 过滤掉时间戳小于等于lastTimestamp的数据（理论上不应该有，但为了安全）
        const newKlineData = klineData.filter(item => item.timestamp > lastTimestamp)
        
        if (newKlineData.length === 0) {
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
        
        // 检查数据连续性：第一根新K线的开盘价应该等于最后一根旧K线的收盘价
        if (newKlineData.length > 0) {
          const existingFile = await import('../../utils/kline-simple-storage').then(m => m.readSimpleKLineFile(symbol, timeframe))
          if (existingFile && existingFile.data && existingFile.data.length > 0) {
            const lastExistingItem = existingFile.data[existingFile.data.length - 1]
            const firstNewItem = newKlineData[0]
            
            if (lastExistingItem && firstNewItem) {
              // 允许微小的浮点数差异
              const tolerance = 0.000001
              const priceDiff = Math.abs(lastExistingItem.c - firstNewItem.open)
              if (priceDiff > tolerance) {
                console.warn(`⚠️  K线数据不连续: ${symbol}/${timeframe}`)
                console.warn(`    最后一条K线收盘价: ${lastExistingItem.c}`)
                console.warn(`    第一条新K线开盘价: ${firstNewItem.open}`)
                console.warn(`    差异: ${priceDiff}`)
                
                // 尝试修复：重新获取最后几根K线以确保数据连续性
                // 这可能是因为之前的数据同步有问题，现在重新获取正确的数据
                console.log(`🔄 尝试修复数据连续性: ${symbol}/${timeframe}`)
                
                try {
                  // 获取最后一条K线的时间戳
                  const lastKlineTime = lastExistingItem.t
                  
                  // 重新获取从最后一条K线开始的数据（包含最后一条）
                  const repairStartTime = (lastKlineTime - intervalSeconds) * 1000 // 获取前一根K线以确保连续性
                  const repairData = await this.fetchKLineFromBinance(
                    symbol,
                    timeframe,
                    repairStartTime,
                    undefined,
                    10 // 获取10条数据，应该足够覆盖
                  )
                  
                  if (repairData.length > 0) {
                    // 过滤掉时间戳小于lastKlineTime的数据
                    const filteredRepairData = repairData.filter(item => item.timestamp >= lastKlineTime)
                    
                    if (filteredRepairData.length > 0) {
                      console.log(`✅ 获取到 ${filteredRepairData.length} 条修复数据`)
                      
                      // 检查修复后的数据连续性
                      const firstRepairItem = filteredRepairData[0]
                      if (firstRepairItem && Math.abs(lastExistingItem.c - firstRepairItem.open) <= tolerance) {
                        console.log(`✅ 修复数据连续性成功`)
                        
                        // 用修复的数据替换新数据
                        newKlineData.splice(0, filteredRepairData.length, ...filteredRepairData)
                      } else {
                        console.warn(`⚠️  修复数据仍然不连续，保持原数据`)
                      }
                    }
                  }
                } catch (repairError: any) {
                  console.warn(`修复数据连续性失败: ${repairError.message}`)
                  // 继续使用原始数据，不中断同步
                }
              }
            }
          }
        }
        
        // 保存数据
        const success = appendSimpleKLineData(symbol, timeframe, newKlineData)
        
        if (!success) {
          throw new Error('保存数据失败')
        }
        
        // 更新状态
        this.updateStatus(symbol, timeframe, { 
          status: 'idle', 
          lastSyncTime: Math.floor(Date.now() / 1000),
          lastSyncCount: newKlineData.length,
          totalBars: (currentStatus?.totalBars || 0) + newKlineData.length
        })
        
        return {
          success: true,
          message: `增量同步成功，获取 ${newKlineData.length} 条数据`,
          symbol,
          timeframe,
          count: newKlineData.length,
          newBars: newKlineData.length
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


  // 手动同步历史数据（优化版，参考scripts/fetch-binance-history-fixed.cjs）
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
    duration?: number
    symbolInfo?: {
      onboardDate: number
      status: string
    }
  }> {
    const { totalBars = 22000, batchSize = 1000, startTime, endTime } = options
    const startTimestamp = Date.now()
    
    try {
      // 1. 先获取合约信息，包括上线时间
      console.log(`[手动同步] 获取合约信息: ${symbol}`)
      const symbolInfo = await this.getSymbolInfo(symbol)
      
      if (!symbolInfo) {
        const message = `合约 ${symbol} 不存在`
        console.log(`[手动同步] ${message}`)
        return {
          success: false,
          message,
          symbol,
          timeframe,
          totalBars: 0,
          batches: 0
        }
      }
      
      // 2. 计算实际可获取的时间范围
      const now = Math.floor(Date.now() / 1000)
      const intervalSeconds = this.getIntervalSeconds(timeframe)
      const totalSeconds = totalBars * intervalSeconds
      
      // 合约上线时间（秒）
      const onboardTimestamp = symbolInfo.onboardTimestamp
      
      // 计算理论开始时间（从当前时间往前推）
      const theoreticalStartTimestamp = now - totalSeconds
      
      // 实际开始时间：取理论开始时间和上线时间的较大值（不能早于上线时间）
      const actualStartTimestamp = Math.max(theoreticalStartTimestamp, onboardTimestamp)
      
      // 3. 计算实际可获取的数据量
      const availableSeconds = now - actualStartTimestamp
      const maxAvailableBars = Math.floor(availableSeconds / intervalSeconds)
      const actualTargetBars = Math.min(totalBars, maxAvailableBars)
      
      if (actualTargetBars <= 0) {
        const message = `合约上线时间太短，无法获取任何数据`
        console.log(`[手动同步] ${message}`)
        return {
          success: false,
          message,
          symbol,
          timeframe,
          totalBars: 0,
          batches: 0,
          symbolInfo: {
            onboardDate: symbolInfo.onboardDate,
            status: symbolInfo.status
          }
        }
      }
      
      if (actualTargetBars < totalBars) {
        console.log(`[手动同步] 注意：合约上线时间较短，只能获取 ${actualTargetBars} 条数据（原目标: ${totalBars} 条）`)
      }
      
      // 4. 开始批量获取数据
      this.updateStatus(symbol, timeframe, { status: 'syncing', error: undefined })
      
      let currentStartTime = startTime || actualStartTimestamp
      let fetchedBars = 0
      let batches = 0
      const allData: KLineData[] = []
      let consecutiveEmptyBatches = 0
      const maxConsecutiveEmptyBatches = 3
      
      console.log(`[手动同步] 开始获取历史数据: ${symbol}/${timeframe}，目标: ${actualTargetBars} 条`)
      
      while (fetchedBars < actualTargetBars && consecutiveEmptyBatches < maxConsecutiveEmptyBatches) {
        const remaining = actualTargetBars - fetchedBars
        const currentBatchSize = Math.min(batchSize, remaining)
        
        // 计算结束时间（当前批次）
        const batchEndTime = currentStartTime + (currentBatchSize * intervalSeconds)
        
        try {
          const batchData = await this.fetchKLineFromBinance(
            symbol, 
            timeframe, 
            currentStartTime * 1000, // 转换为毫秒
            batchEndTime * 1000,     // 转换为毫秒
            currentBatchSize
          )
          
          if (batchData.length === 0) {
            consecutiveEmptyBatches++
            
            if (consecutiveEmptyBatches >= maxConsecutiveEmptyBatches) {
              console.log(`[手动同步] 连续 ${maxConsecutiveEmptyBatches} 个批次返回空数据，停止获取`)
              break
            }
            
            // 跳过一段时间继续尝试
            currentStartTime = batchEndTime + 1
          } else {
            consecutiveEmptyBatches = 0 // 重置连续空批次计数
            allData.push(...batchData)
            fetchedBars += batchData.length
            batches++
            
            // 每5个批次或最后一批显示进度
            if (batches % 5 === 0 || fetchedBars >= actualTargetBars) {
              const progress = Math.round((fetchedBars / actualTargetBars) * 100)
              console.log(`[手动同步] 进度: ${fetchedBars}/${actualTargetBars} (${progress}%)，批次: ${batches}`)
            }
            
            // 更新下一个批次的开始时间
            const lastItem = batchData[batchData.length - 1]
            if (lastItem) {
              currentStartTime = lastItem.timestamp + intervalSeconds
            } else {
              console.log('[手动同步] 批次数据异常，停止获取')
              break
            }
          }
        } catch (batchError: any) {
          console.log(`[手动同步] 批次 ${batches + 1} 获取失败: ${batchError.message}`)
          consecutiveEmptyBatches++
          
          if (consecutiveEmptyBatches >= maxConsecutiveEmptyBatches) {
            console.log(`[手动同步] 连续 ${maxConsecutiveEmptyBatches} 个批次失败，停止获取`)
            break
          }
          
          // 跳过一段时间继续尝试
          currentStartTime = batchEndTime + 1
        }
        
        // 避免请求过于频繁
        if (fetchedBars < actualTargetBars && consecutiveEmptyBatches < maxConsecutiveEmptyBatches) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      
      // 5. 保存所有数据
      if (allData.length > 0) {
        console.log(`[手动同步] 保存数据到文件...`)
        const success = appendSimpleKLineData(symbol, timeframe, allData)
        
        if (!success) {
          throw new Error('保存数据失败')
        }
        
        const endTimestamp = Date.now()
        const duration = (endTimestamp - startTimestamp) / 1000
        
        // 更新状态
        this.updateStatus(symbol, timeframe, { 
          status: 'idle', 
          lastSyncTime: Math.floor(Date.now() / 1000),
          lastSyncCount: allData.length,
          totalBars: allData.length
        })
        
        console.log(`[手动同步] 完成! 获取 ${allData.length} 条数据，${batches} 个批次，耗时 ${duration.toFixed(2)} 秒`)
        
        return {
          success: true,
          message: `手动同步完成，获取 ${allData.length} 条数据，共 ${batches} 个批次`,
          symbol,
          timeframe,
          totalBars: allData.length,
          batches,
          duration,
          symbolInfo: {
            onboardDate: symbolInfo.onboardDate,
            status: symbolInfo.status
          }
        }
      } else {
        const message = '没有获取到任何数据'
        console.log(`[手动同步] ${message}`)
        
        this.updateStatus(symbol, timeframe, { 
          status: 'idle', 
          lastSyncTime: Math.floor(Date.now() / 1000),
          lastSyncCount: 0
        })
        
        return {
          success: false,
          message,
          symbol,
          timeframe,
          totalBars: 0,
          batches: 0,
          duration: (Date.now() - startTimestamp) / 1000,
          symbolInfo: {
            onboardDate: symbolInfo.onboardDate,
            status: symbolInfo.status
          }
        }
      }
      
    } catch (error: any) {
      console.error(`[手动同步] 失败: ${symbol}/${timeframe}`, error)
      
      this.updateStatus(symbol, timeframe, { 
        status: 'error', 
        error: error.message 
      })
      
      const duration = (Date.now() - startTimestamp) / 1000
      
      return {
        success: false,
        message: `手动同步失败: ${error.message}`,
        symbol,
        timeframe,
        totalBars: 0,
        batches: 0,
        duration
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