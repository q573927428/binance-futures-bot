import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { 
  KLineData, 
  KLineFileData, 
  LatestKLineCache, 
  KLineTimeframe,
  KLineSyncConfig 
} from '../../types/kline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, '../../data/kline')

// 确保数据目录存在
function ensureDataDir(symbol: string, timeframe: KLineTimeframe): string {
  const symbolDir = path.join(DATA_DIR, symbol.replace('/', ''))
  const timeframeDir = path.join(symbolDir, timeframe)
  
  if (!fs.existsSync(symbolDir)) {
    fs.mkdirSync(symbolDir, { recursive: true })
  }
  
  if (!fs.existsSync(timeframeDir)) {
    fs.mkdirSync(timeframeDir, { recursive: true })
  }
  
  return timeframeDir
}

// 标准化交易对符号（移除斜杠）
function normalizeSymbol(symbol: string): string {
  return symbol.replace('/', '')
}

// 根据时间戳获取年份
function getYearFromTimestamp(timestamp: number): number {
  return new Date(timestamp * 1000).getFullYear()
}

// 获取K线数据文件路径
function getKLineFilePath(
  symbol: string, 
  timeframe: KLineTimeframe, 
  year: number
): string {
  const normalizedSymbol = normalizeSymbol(symbol)
  const timeframeDir = ensureDataDir(normalizedSymbol, timeframe)
  return path.join(timeframeDir, `${year}.json`)
}

// 获取最新数据缓存文件路径
function getLatestCacheFilePath(
  symbol: string, 
  timeframe: KLineTimeframe
): string {
  const normalizedSymbol = normalizeSymbol(symbol)
  const timeframeDir = ensureDataDir(normalizedSymbol, timeframe)
  return path.join(timeframeDir, 'latest.json')
}

// 读取K线数据文件
export function readKLineFile(
  symbol: string, 
  timeframe: KLineTimeframe, 
  year: number
): KLineFileData | null {
  try {
    const filePath = getKLineFilePath(symbol, timeframe, year)
    
    if (!fs.existsSync(filePath)) {
      return null
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(fileContent) as KLineFileData
  } catch (error) {
    console.error(`读取K线文件失败: ${symbol}/${timeframe}/${year}`, error)
    return null
  }
}

// 写入K线数据文件
export function writeKLineFile(
  symbol: string, 
  timeframe: KLineTimeframe, 
  year: number, 
  data: KLineData[]
): boolean {
  try {
    const normalizedSymbol = normalizeSymbol(symbol)
    
    // 按时间戳排序
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp)
    
    // 去重（基于时间戳）
    const uniqueData: KLineData[] = []
    const seenTimestamps = new Set<number>()
    
    for (const item of sortedData) {
      if (!seenTimestamps.has(item.timestamp)) {
        seenTimestamps.add(item.timestamp)
        uniqueData.push(item)
      }
    }
    
    // 更新元数据
    const metadata = {
      firstTimestamp: uniqueData[0]?.timestamp || 0,
      lastTimestamp: uniqueData[uniqueData.length - 1]?.timestamp || 0,
      count: uniqueData.length,
      updatedAt: Math.floor(Date.now() / 1000)
    }
    
    const fileData: KLineFileData = {
      symbol: normalizedSymbol,
      timeframe,
      year,
      data: uniqueData,
      metadata
    }
    
    const filePath = getKLineFilePath(symbol, timeframe, year)
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8')
    
    // 更新最新数据缓存
    updateLatestCache(symbol, timeframe, uniqueData)
    
    return true
  } catch (error) {
    console.error(`写入K线文件失败: ${symbol}/${timeframe}/${year}`, error)
    return false
  }
}

// 更新最新数据缓存
export function updateLatestCache(
  symbol: string, 
  timeframe: KLineTimeframe, 
  newData: KLineData[]
): boolean {
  try {
    const normalizedSymbol = normalizeSymbol(symbol)
    
    // 读取现有缓存
    const cachePath = getLatestCacheFilePath(symbol, timeframe)
    let existingData: KLineData[] = []
    
    if (fs.existsSync(cachePath)) {
      try {
        const cacheContent = fs.readFileSync(cachePath, 'utf-8')
        const cache = JSON.parse(cacheContent) as LatestKLineCache
        existingData = cache.data || []
      } catch (error) {
        console.warn(`读取缓存文件失败，将创建新缓存: ${cachePath}`)
      }
    }
    
    // 合并数据并去重
    const allData = [...existingData, ...newData]
    const uniqueData: KLineData[] = []
    const seenTimestamps = new Set<number>()
    
    for (const item of allData.sort((a, b) => a.timestamp - b.timestamp)) {
      if (!seenTimestamps.has(item.timestamp)) {
        seenTimestamps.add(item.timestamp)
        uniqueData.push(item)
      }
    }
    
    // 只保留最近2000条数据
    const latestData = uniqueData.slice(-2000)
    
    // 更新元数据
    const metadata = {
      firstTimestamp: latestData[0]?.timestamp || 0,
      lastTimestamp: latestData[latestData.length - 1]?.timestamp || 0,
      count: latestData.length,
      updatedAt: Math.floor(Date.now() / 1000)
    }
    
    const cache: LatestKLineCache = {
      symbol: normalizedSymbol,
      timeframe,
      data: latestData,
      metadata
    }
    
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`更新缓存失败: ${symbol}/${timeframe}`, error)
    return false
  }
}

// 读取最新数据缓存
export function readLatestCache(
  symbol: string, 
  timeframe: KLineTimeframe
): LatestKLineCache | null {
  try {
    const cachePath = getLatestCacheFilePath(symbol, timeframe)
    
    if (!fs.existsSync(cachePath)) {
      return null
    }
    
    const cacheContent = fs.readFileSync(cachePath, 'utf-8')
    return JSON.parse(cacheContent) as LatestKLineCache
  } catch (error) {
    console.error(`读取缓存失败: ${symbol}/${timeframe}`, error)
    return null
  }
}

// 获取K线数据（支持跨年份查询）
export function getKLineData(
  symbol: string, 
  timeframe: KLineTimeframe, 
  options: {
    limit?: number
    from?: number
    to?: number
  } = {}
): KLineData[] {
  const { limit = 2000, from, to } = options
  const normalizedSymbol = normalizeSymbol(symbol)
  
  try {
    // 首先尝试从缓存读取
    const cache = readLatestCache(normalizedSymbol, timeframe)
    if (cache && cache.data && cache.data.length > 0) {
      let filteredData = cache.data
      
      // 应用时间范围过滤
      if (from !== undefined) {
        filteredData = filteredData.filter(item => item.timestamp >= from)
      }
      if (to !== undefined) {
        filteredData = filteredData.filter(item => item.timestamp <= to)
      }
      
      // 限制数量
      return filteredData.slice(-limit)
    }
    
    // 如果没有缓存，从年份文件读取
    const result: KLineData[] = []
    const currentYear = new Date().getFullYear()
    
    // 从当前年份向前搜索
    for (let year = currentYear; year >= 2000; year--) {
      const fileData = readKLineFile(normalizedSymbol, timeframe, year)
      
      if (fileData && fileData.data && fileData.data.length > 0) {
        let yearData = fileData.data
        
        // 应用时间范围过滤
        if (from !== undefined) {
          yearData = yearData.filter(item => item.timestamp >= from)
        }
        if (to !== undefined) {
          yearData = yearData.filter(item => item.timestamp <= to)
        }
        
        // 添加到结果
        result.unshift(...yearData)
        
        // 如果达到限制，跳出循环
        if (result.length >= limit) {
          break
        }
      }
    }
    
    // 限制数量并返回
    return result.slice(-limit)
  } catch (error) {
    console.error(`获取K线数据失败: ${symbol}/${timeframe}`, error)
    return []
  }
}

// 获取最后一条K线数据的时间戳
export function getLastKLineTimestamp(
  symbol: string, 
  timeframe: KLineTimeframe
): number | null {
  try {
    const cache = readLatestCache(symbol, timeframe)
    
    if (cache && cache.data.length > 0 && cache.metadata.lastTimestamp > 0) {
      return cache.metadata.lastTimestamp
    }
    
    // 如果没有缓存，查找最新的年份文件
    const currentYear = new Date().getFullYear()
    
    for (let year = currentYear; year >= 2000; year--) {
      const fileData = readKLineFile(symbol, timeframe, year)
      
      if (fileData && fileData.data.length > 0 && fileData.metadata.lastTimestamp > 0) {
        return fileData.metadata.lastTimestamp
      }
    }
    
    return null
  } catch (error) {
    console.error(`获取最后K线时间戳失败: ${symbol}/${timeframe}`, error)
    return null
  }
}

// 检查数据缺口
export function findDataGaps(
  symbol: string, 
  timeframe: KLineTimeframe, 
  data: KLineData[]
): Array<{ start: number; end: number }> {
  if (data.length < 2) {
    return []
  }
  
  const gaps: Array<{ start: number; end: number }> = []
  const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp)
  
  // 计算K线间隔（秒）
  const timeframeSeconds: Record<KLineTimeframe, number> = {
    '15m': 15 * 60,
    '1h': 60 * 60,
    '4h': 4 * 60 * 60,
    '1d': 24 * 60 * 60,
    '1w': 7 * 24 * 60 * 60
  }
  
  const interval = timeframeSeconds[timeframe]
  
  // 如果interval无效，返回空数组
  if (!interval || interval <= 0) {
    return []
  }
  
  for (let i = 1; i < sortedData.length; i++) {
    const prevItem = sortedData[i - 1]
    const currentItem = sortedData[i]
    
    if (!prevItem || !currentItem) continue
    
    const prevTimestamp = prevItem.timestamp
    const currentTimestamp = currentItem.timestamp
    
    // 如果时间戳间隔超过预期间隔的1.5倍，认为有缺口
    if (currentTimestamp - prevTimestamp > interval * 1.5) {
      gaps.push({
        start: prevTimestamp + interval,
        end: currentTimestamp - interval
      })
    }
  }
  
  return gaps
}

// 清理旧数据（保持每个文件不超过最大数量）
export function cleanupOldData(
  symbol: string, 
  timeframe: KLineTimeframe, 
  maxBarsPerFile: number = 30000
): void {
  try {
    const normalizedSymbol = normalizeSymbol(symbol)
    const currentYear = new Date().getFullYear()
    
    // 处理每个年份文件
    for (let year = 2000; year <= currentYear; year++) {
      const fileData = readKLineFile(normalizedSymbol, timeframe, year)
      
      if (fileData && fileData.data && fileData.data.length > maxBarsPerFile) {
        // 只保留最近的数据
        const trimmedData = fileData.data.slice(-maxBarsPerFile)
        writeKLineFile(normalizedSymbol, timeframe, year, trimmedData)
        
        console.log(`清理数据: ${symbol}/${timeframe}/${year}, 从 ${fileData.data.length} 条减少到 ${trimmedData.length} 条`)
      }
    }
    
    // 更新缓存
    const cache = readLatestCache(normalizedSymbol, timeframe)
    if (cache && cache.data && cache.data.length > 2000) {
      const trimmedCacheData = cache.data.slice(-2000)
      updateLatestCache(normalizedSymbol, timeframe, trimmedCacheData)
    }
  } catch (error) {
    console.error(`清理旧数据失败: ${symbol}/${timeframe}`, error)
  }
}

// 获取所有已存储的交易对和周期
export function getStoredSymbols(): Array<{
  symbol: string
  timeframes: KLineTimeframe[]
}> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return []
    }
    
    const result: Array<{ symbol: string; timeframes: KLineTimeframe[] }> = []
    const symbolDirs = fs.readdirSync(DATA_DIR)
    
    for (const symbolDir of symbolDirs) {
      const symbolPath = path.join(DATA_DIR, symbolDir)
      
      if (fs.statSync(symbolPath).isDirectory()) {
        const timeframeDirs = fs.readdirSync(symbolPath)
        const timeframes: KLineTimeframe[] = []
        
        for (const timeframeDir of timeframeDirs) {
          const timeframePath = path.join(symbolPath, timeframeDir)
          
          if (fs.statSync(timeframePath).isDirectory() && 
              ['15m', '1h', '4h', '1d', '1w'].includes(timeframeDir)) {
            timeframes.push(timeframeDir as KLineTimeframe)
          }
        }
        
        if (timeframes.length > 0) {
          result.push({
            symbol: symbolDir,
            timeframes
          })
        }
      }
    }
    
    return result
  } catch (error) {
    console.error('获取已存储交易对失败', error)
    return []
  }
}