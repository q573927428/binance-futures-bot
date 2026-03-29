import { BinanceService } from '../../utils/binance'
import { 
  getKLineData,
  getLastKLineTimestamp,
  writeKLineFile,
  updateLatestCache,
  findDataGaps,
  cleanupOldData,
  getStoredSymbols
} from '../../utils/kline-storage'
import type { 
  KLineData, 
  KLineTimeframe,
  KLineSyncConfig,
  KLineSyncStatus 
} from '../../../types/kline'
import fs from 'fs'
import path from 'path'

// 从bot-config.json读取交易对配置
function loadBotConfig(): { symbols: string[] } {
  try {
    const configPath = path.join(process.cwd(), 'data', 'bot-config.json')
    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(configContent)
    
    return {
      symbols: config.symbols || []
    }
  } catch (error) {
    console.error('读取bot-config.json失败', error)
    return { symbols: [] }
  }
}

// 标准化交易对符号（移除斜杠）
function normalizeSymbol(symbol: string): string {
  return symbol.replace('/', '')
}

// 将CCXT格式的K线数据转换为标准格式
function convertCCXTToKLineData(ccxtData: any[]): KLineData[] {
  if (!ccxtData || !Array.isArray(ccxtData)) {
    console.warn('CCXT数据为空或不是数组:', ccxtData)
    return []
  }
  
  return ccxtData
    .filter(item => item !== null && item !== undefined)
    .map(item => {
      // 处理两种格式：CCXT原始数组格式或OHLCV对象格式
      let timestamp: number
      let open: number
      let high: number
      let low: number
      let close: number
      let volume: number
      
      if (Array.isArray(item) && item.length >= 6) {
        // CCXT原始数组格式: [timestamp, open, high, low, close, volume]
        timestamp = Math.floor(item[0] / 1000) // 毫秒转秒
        open = Number(item[1])
        high = Number(item[2])
        low = Number(item[3])
        close = Number(item[4])
        volume = Number(item[5])
      } else if (item && typeof item === 'object' && 'timestamp' in item) {
        // OHLCV对象格式
        timestamp = Math.floor(item.timestamp / 1000) // 毫秒转秒
        open = Number(item.open)
        high = Number(item.high)
        low = Number(item.low)
        close = Number(item.close)
        volume = Number(item.volume)
      } else {
        console.warn('未知的数据格式:', item)
        return null
      }
      
      // 验证数据有效性
      if (isNaN(timestamp) || timestamp <= 0) {
        console.warn('无效的时间戳:', item, timestamp)
        return null
      }
      
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        console.warn('无效的价格或成交量数据:', item)
        return null
      }
      
      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume
      }
    })
    .filter((item): item is KLineData => item !== null)
}

// 根据时间戳获取年份
function getYearFromTimestamp(timestamp: number): number {
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  // 确保年份有效
  if (isNaN(year) || year < 2000 || year > 2100) {
    console.warn(`无效的时间戳年份: ${timestamp} -> ${year}`)
    return new Date().getFullYear()
  }
  return year
}

// 按年份分组K线数据
function groupKLineDataByYear(data: KLineData[]): Record<number, KLineData[]> {
  const grouped: Record<number, KLineData[]> = {}
  
  for (const item of data) {
    const year = getYearFromTimestamp(item.timestamp)
    
    if (!grouped[year]) {
      grouped[year] = []
    }
    
    grouped[year].push(item)
  }
  
  return grouped
}

export class KLineSyncService {
  private binanceService: BinanceService
  private config: KLineSyncConfig
  private syncStatus: Map<string, KLineSyncStatus> = new Map()
  private isSyncing: boolean = false
  
  constructor(config?: Partial<KLineSyncConfig>) {
    this.binanceService = new BinanceService()
    
    // 加载默认配置
    const botConfig = loadBotConfig()
    const defaultConfig: KLineSyncConfig = {
      symbols: botConfig.symbols,
      timeframes: ['15m', '1h', '4h', '1d', '1w'],
      maxBarsPerFile: 30000,
      maxTotalBars: 20000,
      syncInterval: 300, // 5分钟
      initialBars: 20000
    }
    
    this.config = { ...defaultConfig, ...config }
    
    // 初始化同步状态
    this.initializeSyncStatus()
  }
  
  // 初始化同步状态
  private initializeSyncStatus(): void {
    for (const symbol of this.config.symbols) {
      const normalizedSymbol = normalizeSymbol(symbol)
      
      for (const timeframe of this.config.timeframes) {
        const key = this.getStatusKey(normalizedSymbol, timeframe)
        
        this.syncStatus.set(key, {
          symbol: normalizedSymbol,
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
    return `${symbol}:${timeframe}`
  }
  
  // 更新同步状态
  private updateSyncStatus(
    symbol: string, 
    timeframe: KLineTimeframe, 
    updates: Partial<KLineSyncStatus>
  ): void {
    const key = this.getStatusKey(symbol, timeframe)
    const currentStatus = this.syncStatus.get(key)
    
    if (currentStatus) {
      this.syncStatus.set(key, {
        ...currentStatus,
        ...updates,
        lastSyncTime: updates.lastSyncTime || Date.now()
      })
    }
  }
  
  // 获取同步状态
  getSyncStatus(): KLineSyncStatus[] {
    return Array.from(this.syncStatus.values())
  }
  
  // 获取特定交易对和周期的同步状态
  getSymbolSyncStatus(symbol: string, timeframe: KLineTimeframe): KLineSyncStatus | null {
    const normalizedSymbol = normalizeSymbol(symbol)
    const key = this.getStatusKey(normalizedSymbol, timeframe)
    return this.syncStatus.get(key) || null
  }
  
  // 同步单个交易对和周期的K线数据
  async syncSymbolKLine(
    symbol: string, 
    timeframe: KLineTimeframe, 
    options: {
      force?: boolean
      initialBars?: number
    } = {}
  ): Promise<{ success: boolean; message: string; count: number }> {
    const { force = false, initialBars = this.config.initialBars } = options
    const normalizedSymbol = normalizeSymbol(symbol)
    const statusKey = this.getStatusKey(normalizedSymbol, timeframe)
    
    // 检查是否正在同步
    if (this.isSyncing) {
      return {
        success: false,
        message: '已有同步任务正在进行',
        count: 0
      }
    }
    
    this.isSyncing = true
    this.updateSyncStatus(normalizedSymbol, timeframe, { status: 'syncing' })
    
    try {
      console.log(`开始同步K线数据: ${symbol}/${timeframe}`)
      
      // 获取最后一条K线的时间戳
      const lastTimestamp = getLastKLineTimestamp(normalizedSymbol, timeframe)
      const now = Math.floor(Date.now() / 1000)
      
      let newData: KLineData[] = []
      
      if (force || !lastTimestamp) {
        // 强制同步或首次同步：获取初始数据
        console.log(`首次同步或强制同步: ${symbol}/${timeframe}, 获取 ${initialBars} 条数据`)
        
        const ccxtData = await this.binanceService.fetchOHLCV(
          symbol,
          timeframe,
          initialBars
        )
        
        newData = convertCCXTToKLineData(ccxtData)
      } else {
        // 增量同步：获取最后时间戳之后的数据
        console.log(`增量同步: ${symbol}/${timeframe}, 从时间戳 ${lastTimestamp} 开始`)
        
        // 计算需要获取的数据数量（基于时间差和周期）
        const timeframeSeconds: Record<KLineTimeframe, number> = {
          '15m': 15 * 60,
          '1h': 60 * 60,
          '4h': 4 * 60 * 60,
          '1d': 24 * 60 * 60,
          '1w': 7 * 24 * 60 * 60
        }
        
        const interval = timeframeSeconds[timeframe]
        const timeDiff = now - lastTimestamp
        const estimatedBars = Math.ceil(timeDiff / interval) + 300 // 加300条作为缓冲
        
        const ccxtData = await this.binanceService.fetchOHLCV(
          symbol,
          timeframe,
          Math.min(estimatedBars, 1000) // 限制最多1000条
        )
        
        newData = convertCCXTToKLineData(ccxtData)
        
        // 过滤掉已存在的数据
        newData = newData.filter(item => item.timestamp > lastTimestamp)
      }
      
      if (newData.length === 0) {
        console.log(`没有新数据需要同步: ${symbol}/${timeframe}`)
        this.updateSyncStatus(normalizedSymbol, timeframe, { 
          status: 'idle',
          lastSyncCount: 0
        })
        
        return {
          success: true,
          message: '没有新数据需要同步',
          count: 0
        }
      }
      
      console.log(`获取到 ${newData.length} 条新数据: ${symbol}/${timeframe}`)
      
      // 按年份分组并保存
      const groupedData = groupKLineDataByYear(newData)
      let totalSaved = 0
      
      for (const [year, yearData] of Object.entries(groupedData)) {
        const yearNum = parseInt(year)
        const saved = writeKLineFile(normalizedSymbol, timeframe, yearNum, yearData)
        
        if (saved) {
          totalSaved += yearData.length
          console.log(`保存 ${yearData.length} 条数据到 ${year} 年文件: ${symbol}/${timeframe}`)
        }
      }
      
      // 更新缓存
      updateLatestCache(normalizedSymbol, timeframe, newData)
      
      // 清理旧数据
      cleanupOldData(normalizedSymbol, timeframe, this.config.maxBarsPerFile)
      
      // 检查数据缺口
      const allData = getKLineData(normalizedSymbol, timeframe, { limit: 10000 })
      const gaps = findDataGaps(normalizedSymbol, timeframe, allData)
      
      if (gaps.length > 0) {
        console.log(`发现 ${gaps.length} 个数据缺口: ${symbol}/${timeframe}`)
        // TODO: 可以在这里实现数据缺口补全
      }
      
      // 更新同步状态
      this.updateSyncStatus(normalizedSymbol, timeframe, {
        status: 'idle',
        lastSyncCount: totalSaved,
        totalBars: allData.length
      })
      
      console.log(`同步完成: ${symbol}/${timeframe}, 保存 ${totalSaved} 条数据`)
      
      return {
        success: true,
        message: `同步完成，保存 ${totalSaved} 条数据`,
        count: totalSaved
      }
      
    } catch (error: any) {
      console.error(`同步K线数据失败: ${symbol}/${timeframe}`, error)
      
      this.updateSyncStatus(normalizedSymbol, timeframe, {
        status: 'error',
        error: error.message
      })
      
      return {
        success: false,
        message: `同步失败: ${error.message}`,
        count: 0
      }
    } finally {
      this.isSyncing = false
    }
  }
  
  // 同步所有交易对和周期
  async syncAllKLine(options: {
    force?: boolean
    concurrency?: number
  } = {}): Promise<Array<{
    symbol: string
    timeframe: KLineTimeframe
    success: boolean
    message: string
    count: number
  }>> {
    const { force = false, concurrency = 3 } = options
    const results: Array<{
      symbol: string
      timeframe: KLineTimeframe
      success: boolean
      message: string
      count: number
    }> = []
    
    console.log(`开始同步所有K线数据，并发数: ${concurrency}`)
    
    // 创建任务队列
    const tasks: Array<{
      symbol: string
      timeframe: KLineTimeframe
    }> = []
    
    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        tasks.push({ symbol, timeframe })
      }
    }
    
    // 并发执行同步任务
    const executing: Promise<void>[] = []
    
    for (const task of tasks) {
      const promise = this.syncSymbolKLine(task.symbol, task.timeframe, { force })
        .then(result => {
          results.push({
            symbol: task.symbol,
            timeframe: task.timeframe,
            ...result
          })
        })
        .finally(() => {
          // 从执行队列中移除
          const index = executing.indexOf(promise)
          if (index > -1) {
            executing.splice(index, 1)
          }
        })
      
      executing.push(promise)
      
      // 控制并发数
      if (executing.length >= concurrency) {
        await Promise.race(executing)
      }
    }
    
    // 等待所有任务完成
    await Promise.all(executing)
    
    console.log(`所有K线数据同步完成，共 ${results.length} 个任务`)
    
    // 统计结果
    const successCount = results.filter(r => r.success).length
    const totalCount = results.reduce((sum, r) => sum + r.count, 0)
    
    console.log(`同步结果: ${successCount}/${results.length} 成功，共获取 ${totalCount} 条数据`)
    
    return results
  }
  
  // 补全数据缺口
  async fillDataGaps(
    symbol: string, 
    timeframe: KLineTimeframe
  ): Promise<{ success: boolean; message: string; filled: number }> {
    const normalizedSymbol = normalizeSymbol(symbol)
    
    try {
      // 获取现有数据
      const existingData = getKLineData(normalizedSymbol, timeframe, { limit: 50000 })
      
      if (existingData.length < 2) {
        return {
          success: false,
          message: '数据不足，无法检查缺口',
          filled: 0
        }
      }
      
      // 查找数据缺口
      const gaps = findDataGaps(normalizedSymbol, timeframe, existingData)
      
      if (gaps.length === 0) {
        return {
          success: true,
          message: '没有发现数据缺口',
          filled: 0
        }
      }
      
      console.log(`发现 ${gaps.length} 个数据缺口: ${symbol}/${timeframe}`)
      
      let totalFilled = 0
      
      // 补全每个缺口
      for (const gap of gaps) {
        console.log(`补全缺口: ${new Date(gap.start * 1000).toISOString()} - ${new Date(gap.end * 1000).toISOString()}`)
        
        // 计算需要获取的数据数量
        const timeframeSeconds: Record<KLineTimeframe, number> = {
          '15m': 15 * 60,
          '1h': 60 * 60,
          '4h': 4 * 60 * 60,
          '1d': 24 * 60 * 60,
          '1w': 7 * 24 * 60 * 60
        }
        
        const interval = timeframeSeconds[timeframe]
        const gapDuration = gap.end - gap.start
        const barsNeeded = Math.ceil(gapDuration / interval)
        
        if (barsNeeded <= 0) {
          continue
        }
        
        // 获取缺口数据 - 注意：fetchOHLCV只支持symbol, timeframe, limit三个参数
        // 无法指定开始时间，只能获取最新数据
        const ccxtData = await this.binanceService.fetchOHLCV(
          symbol,
          timeframe,
          Math.min(barsNeeded, 1000)
        )
        
        // 过滤出缺口时间范围内的数据
        const filteredData = ccxtData.filter((item: any) => {
          const timestamp = Math.floor(item[0] / 1000)
          return timestamp >= gap.start && timestamp <= gap.end
        })
        
        const gapData = convertCCXTToKLineData(filteredData)
        
        if (gapData.length > 0) {
          // 按年份分组并保存
          const groupedData = groupKLineDataByYear(gapData)
          
          for (const [year, yearData] of Object.entries(groupedData)) {
            const yearNum = parseInt(year)
            writeKLineFile(normalizedSymbol, timeframe, yearNum, yearData)
            totalFilled += yearData.length
          }
          
          console.log(`补全 ${gapData.length} 条数据`)
        }
      }
      
      // 更新缓存
      if (totalFilled > 0) {
        const updatedData = getKLineData(normalizedSymbol, timeframe, { limit: 2000 })
        updateLatestCache(normalizedSymbol, timeframe, updatedData)
      }
      
      return {
        success: true,
        message: `补全 ${totalFilled} 条数据`,
        filled: totalFilled
      }
      
    } catch (error: any) {
      console.error(`补全数据缺口失败: ${symbol}/${timeframe}`, error)
      
      return {
        success: false,
        message: `补全失败: ${error.message}`,
        filled: 0
      }
    }
  }
  
  // 获取已存储的交易对信息
  getStoredSymbolsInfo() {
    return getStoredSymbols()
  }
  
  // 清理配置
  updateConfig(newConfig: Partial<KLineSyncConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.initializeSyncStatus()
  }
  
  // 获取配置
  getConfig(): KLineSyncConfig {
    return { ...this.config }
  }
}