// K线数据类型定义

// 支持的K线周期
export type KLineTimeframe = '15m' | '1h' | '4h' | '1d' | '1w'

// K线数据条目
export interface KLineData {
  timestamp: number      // 时间戳（秒）
  open: number          // 开盘价
  high: number          // 最高价
  low: number           // 最低价
  close: number         // 收盘价
  volume: number        // 成交量
}

// K线数据文件格式
export interface KLineFileData {
  symbol: string        // 交易对（如：BTCUSDT）
  timeframe: KLineTimeframe // 周期
  year: number          // 年份
  data: KLineData[]     // K线数据
  metadata: {
    firstTimestamp: number  // 第一条数据时间戳
    lastTimestamp: number   // 最后一条数据时间戳
    count: number           // 数据条数
    updatedAt: number       // 最后更新时间戳
  }
}

// 最新数据缓存格式
export interface LatestKLineCache {
  symbol: string
  timeframe: KLineTimeframe
  data: KLineData[]     // 最近2000条数据
  metadata: {
    firstTimestamp: number
    lastTimestamp: number
    count: number
    updatedAt: number
  }
}

// K线同步配置
export interface KLineSyncConfig {
  symbols: string[]           // 需要同步的交易对列表
  timeframes: KLineTimeframe[] // 需要同步的周期列表
  maxBarsPerFile: number      // 每个文件最大K线数量（默认30000）
  maxTotalBars: number        // 总共最大K线数量（默认20000）
  syncInterval: number        // 同步间隔（秒，默认300=5分钟）
  initialBars: number         // 初始同步K线数量（默认1600）
}

// K线同步状态
export interface KLineSyncStatus {
  symbol: string
  timeframe: KLineTimeframe
  lastSyncTime: number        // 最后同步时间
  lastSyncCount: number       // 最后同步数量
  totalBars: number           // 总K线数量
  status: 'idle' | 'syncing' | 'error'
  error?: string
}

// K线API请求参数
export interface KLineQueryParams {
  symbol: string
  timeframe: KLineTimeframe
  limit?: number              // 限制数量（默认2000）
  from?: number              // 开始时间戳（可选）
  to?: number                // 结束时间戳（可选）
}

// K线API响应
export interface KLineApiResponse {
  success: boolean
  message?: string
  data?: {
    symbol: string
    timeframe: KLineTimeframe
    data: KLineData[]
    metadata: {
      firstTimestamp: number
      lastTimestamp: number
      count: number
      hasMore: boolean        // 是否有更多历史数据
    }
  }
}

// Lightweight Charts数据格式
export interface LightweightChartData {
  time: number               // 时间戳（秒）
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

// 图表配置
export interface ChartConfig {
  theme: 'light' | 'dark'
  chartType: 'candlestick' | 'line' | 'area' | 'bar'
  showVolume: boolean
  indicators: {
    ema: boolean
    emaPeriods: number[]
    rsi: boolean
    rsiPeriod: number
    macd: boolean
  }
}

// 交易对符号转换工具类型
export interface SymbolMapping {
  ccxtSymbol: string        // CCXT格式：BTC/USDT
  binanceSymbol: string     // 币安格式：BTCUSDT
  normalizedSymbol: string  // 标准化格式：BTCUSDT（去掉斜杠）
}

// 周期映射
export const TIMEFRAME_MAP: Record<KLineTimeframe, string> = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w'
}

// CCXT周期映射
export const CCXT_TIMEFRAME_MAP: Record<KLineTimeframe, string> = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w'
}

// 默认配置
export const DEFAULT_KLINE_SYNC_CONFIG: KLineSyncConfig = {
  symbols: [], // 从bot-config.json读取
  timeframes: ['15m', '1h', '4h', '1d', '1w'],
  maxBarsPerFile: 30000,
  maxTotalBars: 30000,
  syncInterval: 300, // 5分钟
  initialBars: 2200
}