// 交易方向
export type Direction = 'LONG' | 'SHORT' | 'IDLE'

// 风险等级
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

// 仓位状态
export enum PositionStatus {
  IDLE = 'IDLE',           // 空仓
  MONITORING = 'MONITORING', // 监控中
  OPENING = 'OPENING',      // 开仓中
  POSITION = 'POSITION',    // 持仓中
  CLOSING = 'CLOSING',      // 平仓中
  HALTED = 'HALTED'        // 熔断停机
}

// 系统配置
export interface BotConfig {
  // 交易对
  symbols: string[]
  
  // 杠杆倍数
  leverage: number
  
  // 单笔最大风险比例（%）
  maxRiskPercentage: number
  
  // 止损ATR倍数
  stopLossATRMultiplier: number
  
  // 最大止损比例（%）
  maxStopLossPercentage: number
  
  // 持仓超时时间（小时）
  positionTimeoutHours: number
  
  // 扫描间隔（秒）
  scanInterval: number
  
  // AI分析配置
  aiConfig: AIConfig
}

// AI配置
export interface AIConfig {
  enabled: boolean          // 启用AI分析
  analysisInterval: number  // 分析间隔（分钟）
  minConfidence: number     // 最小置信度（0-100）
  maxRiskLevel: RiskLevel   // 最大风险等级
  useForEntry: boolean      // 用于开仓决策
  useForExit: boolean       // 用于平仓决策
  cacheDuration: number     // 缓存时长（分钟）
}

// 市场数据
export interface MarketData {
  symbol: string
  price: number
  timestamp: number
  volume: number
}

// K线数据
export interface OHLCV {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// 技术指标
export interface TechnicalIndicators {
  // EMA
  ema20: number
  ema30: number
  ema60: number
  
  // ADX (多周期)
  adx15m: number
  adx1h: number
  adx4h: number
  
  // RSI
  rsi: number
  
  // ATR
  atr: number
}

// AI分析结果
export interface AIAnalysis {
  symbol: string
  timestamp: number
  direction: Direction
  confidence: number        // 0-100
  score: number            // 0-100
  riskLevel: RiskLevel
  isBullish: boolean
  reasoning: string
  technicalData: {
    price: number
    ema20: number
    ema60: number
    rsi: number
    volume: number
    support?: number
    resistance?: number
  }
}

// 交易信号
export interface TradeSignal {
  symbol: string
  direction: Direction
  price: number
  confidence: number
  indicators: TechnicalIndicators
  aiAnalysis?: AIAnalysis
  timestamp: number
  reason: string
}

// 仓位信息
export interface Position {
  symbol: string
  direction: Direction
  entryPrice: number
  quantity: number
  leverage: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  openTime: number
  orderId?: string
  stopLossOrderId?: string
  takeProfitOrderId?: string
}

// 订单信息
export interface Order {
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET'
  quantity: number
  price?: number
  stopPrice?: number
  status: string
  timestamp: number
}

// 交易记录
export interface TradeHistory {
  id: string
  symbol: string
  direction: Direction
  entryPrice: number
  exitPrice: number
  quantity: number
  leverage: number
  pnl: number
  pnlPercentage: number
  openTime: number
  closeTime: number
  reason: string
}

// 熔断状态
export interface CircuitBreaker {
  isTriggered: boolean
  reason: string
  timestamp: number
  dailyLoss: number
  consecutiveLosses: number
}

// 机器人状态
export interface BotState {
  status: PositionStatus
  currentPosition: Position | null
  circuitBreaker: CircuitBreaker
  todayTrades: number
  dailyPnL: number
  lastResetDate: string
  monitoringSymbols: string[]
}

// 加密货币余额
export interface CryptoBalance {
  asset: string
  free: number
  locked: number
  total: number
  usdValue?: number
}

// 账户信息
export interface AccountInfo {
  balance: number
  availableBalance: number
  totalPnL: number
  positions: Position[]
  cryptoBalances?: CryptoBalance[]
}

// 日志条目
export interface LogEntry {
  timestamp: number
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
  category: string
  message: string
  data?: any
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  state?: BotState
  config?: BotConfig
}

// 状态响应数据
export interface StatusResponseData {
  state: BotState
  config: BotConfig
  logs: LogEntry[]
  cryptoBalances?: CryptoBalance[]
}

// 历史响应数据
export interface HistoryResponseData extends Array<TradeHistory> {}

// 状态响应
export type StatusResponse = ApiResponse<StatusResponseData>

// 历史响应
export type HistoryResponse = ApiResponse<HistoryResponseData>

// 启动/停止响应
export interface StartStopResponse {
  success: boolean
  message?: string
  state?: BotState
}

// 配置更新响应
export interface ConfigResponse {
  success: boolean
  message?: string
  config?: BotConfig
}
