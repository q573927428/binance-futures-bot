// 简单K线数据类型定义

// 支持的K线周期
export type KLineTimeframe = '15m' | '1h' | '4h' | '1d' | '1w'

// K线数据条目（简化字段名）
export interface SimpleKLineData {
  t: number      // timestamp 时间戳（秒）
  o: number      // open 开盘价
  h: number      // high 最高价
  l: number      // low 最低价
  c: number      // close 收盘价
  v: number      // volume 成交量
}

// 完整的K线数据条目（用于内部处理）
export interface KLineData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// 单文件K线数据格式
export interface KLineSingleFile {
  symbol: string
  timeframe: KLineTimeframe
  data: SimpleKLineData[]  // 最多22000条
  meta: {
    first: number      // 第一条数据时间戳
    last: number       // 最后一条数据时间戳
    count: number      // 当前数据条数
    max: number        // 最大数据条数（22000）
    updated: number    // 最后更新时间戳
  }
}

// API请求参数
export interface KLineQueryParams {
  symbol: string
  timeframe: KLineTimeframe
  limit?: number      // 限制数量
  from?: number      // 开始时间戳
  to?: number        // 结束时间戳
}

// API响应
export interface KLineApiResponse {
  success: boolean
  message?: string
  data?: {
    symbol: string
    timeframe: KLineTimeframe
    data: SimpleKLineData[]
    meta: {
      first: number
      last: number
      count: number
      max: number
      updated: number
    }
  }
}

// 同步配置
export interface KLineSyncConfig {
  symbols: string[]
  timeframes: KLineTimeframe[]
  maxBars: number          // 最大K线数量（22000）
  syncInterval: number     // 同步间隔（秒）
}

// 默认配置
export const DEFAULT_CONFIG: KLineSyncConfig = {
  symbols: ['BTC/USDT', 'ETH/USDT'],
  timeframes: ['15m', '1h', '4h', '1d', '1w'],
  maxBars: 22000,
  syncInterval: 300  // 5分钟
}

// 工具函数：转换完整数据到简化数据
export function toSimpleKLineData(data: KLineData): SimpleKLineData {
  return {
    t: data.timestamp,
    o: data.open,
    h: data.high,
    l: data.low,
    c: data.close,
    v: data.volume
  }
}

// 工具函数：转换简化数据到完整数据
export function fromSimpleKLineData(data: SimpleKLineData): KLineData {
  return {
    timestamp: data.t,
    open: data.o,
    high: data.h,
    low: data.l,
    close: data.c,
    volume: data.v
  }
}

// 工具函数：批量转换
export function toSimpleKLineDataArray(data: KLineData[]): SimpleKLineData[] {
  return data.map(toSimpleKLineData)
}

export function fromSimpleKLineDataArray(data: SimpleKLineData[]): KLineData[] {
  return data.map(fromSimpleKLineData)
}