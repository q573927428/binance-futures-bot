import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type { BotState, BotConfig, TradeHistory } from '../../types'
import dayjs from 'dayjs'

const DATA_DIR = join(process.cwd(), 'data')
const STATE_FILE = join(DATA_DIR, 'bot-state.json')
const CONFIG_FILE = join(DATA_DIR, 'bot-config.json')
const HISTORY_FILE = join(DATA_DIR, 'trade-history.json')

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
}

/**
 * 保存机器人状态
 */
export async function saveBotState(state: BotState): Promise<void> {
  try {
    await ensureDataDir()
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (error: any) {
    console.error('保存状态失败:', error.message)
    throw error
  }
}

/**
 * 加载机器人状态
 */
export async function loadBotState(): Promise<BotState | null> {
  try {
    if (!existsSync(STATE_FILE)) {
      return null
    }
    const data = await readFile(STATE_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error: any) {
    console.error('加载状态失败:', error.message)
    return null
  }
}

/**
 * 保存配置
 */
export async function saveBotConfig(config: BotConfig): Promise<void> {
  try {
    await ensureDataDir()
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error: any) {
    console.error('保存配置失败:', error.message)
    throw error
  }
}

/**
 * 加载配置
 */
export async function loadBotConfig(): Promise<BotConfig | null> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null
    }
    const data = await readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error: any) {
    console.error('加载配置失败:', error.message)
    return null
  }
}

/**
 * 添加交易历史记录
 */
export async function addTradeHistory(trade: TradeHistory): Promise<void> {
  try {
    await ensureDataDir()
    
    let history: TradeHistory[] = []
    
    if (existsSync(HISTORY_FILE)) {
      const data = await readFile(HISTORY_FILE, 'utf-8')
      history = JSON.parse(data)
    }
    
    history.push(trade)
    
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch (error: any) {
    console.error('保存交易历史失败:', error.message)
    throw error
  }
}

/**
 * 获取交易历史记录
 */
export async function getTradeHistory(limit?: number): Promise<TradeHistory[]> {
  try {
    if (!existsSync(HISTORY_FILE)) {
      return []
    }
    
    const data = await readFile(HISTORY_FILE, 'utf-8')
    const history: TradeHistory[] = JSON.parse(data)
    
    if (limit) {
      return history.slice(-limit)
    }
    
    return history
  } catch (error: any) {
    console.error('加载交易历史失败:', error.message)
    return []
  }
}

/**
 * 获取今日交易历史
 */
export async function getTodayTradeHistory(): Promise<TradeHistory[]> {
  try {
    const history = await getTradeHistory()
    const todayStart = dayjs().startOf('day').valueOf()
    
    return history.filter(trade => trade.closeTime >= todayStart)
  } catch (error: any) {
    console.error('获取今日交易历史失败:', error.message)
    return []
  }
}

/**
 * 获取默认配置
 */
export function getDefaultConfig(): BotConfig {
  return {
    symbols: ['ETH/USDT', 'BNB/USDT', 'SOL/USDT'],
    leverage: 10,                     //杠杆倍数
    maxRiskPercentage: 50,           //单笔最大风险比例
    stopLossATRMultiplier: 1.2,      //止损ATR倍数
    maxStopLossPercentage: 1.5,      //最大止损比例
    positionTimeoutHours: 6,         //持仓超时时间
    scanInterval: 60,                //扫描间隔
    aiConfig: { 
      enabled: true,                //启用AI分析
      analysisInterval: 10,          //分析间隔（分钟）
      minConfidence: 60,             //最小置信度（0-100）
      maxRiskLevel: 'MEDIUM',        //最大风险等级
      useForEntry: true,             //用于开仓决策
      useForExit: true,              //用于平仓决策
      cacheDuration: 10,             //缓存时长（分钟）
    },
    riskConfig: {
      circuitBreaker: {
        dailyLossThreshold: 2,       // 当日亏损阈值（%）
        consecutiveLossesThreshold: 2, // 连续止损阈值（次）
      },
      forceLiquidateTime: {
        hour: 23,    // 小时（0-23）
        minute: 30,  // 分钟（0-59）
      },
      takeProfit: {
        tp1RiskRewardRatio: 1,      // TP1盈亏比（1:1）
        tp2RiskRewardRatio: 2,      // TP2盈亏比（1:2）
        rsiExtreme: {
          long: 70,   // 多头RSI极值
          short: 30,  // 空头RSI极值
        },
        adxDecreaseThreshold: 5,    // ADX下降阈值
      },
      dailyTradeLimit: 3,            // 当天交易次数限制
    },
  }
}

/**
 * 获取默认状态
 */
export function getDefaultState(): BotState {
  return {
    status: 'IDLE' as any,
    currentPosition: null,
    circuitBreaker: {
      isTriggered: false,
      reason: '',
      timestamp: Date.now(),
      dailyLoss: 0,
      consecutiveLosses: 0,
    },
    todayTrades: 0,
    dailyPnL: 0,
    lastResetDate: dayjs().format('YYYY-MM-DD'),
    monitoringSymbols: [],
  }
}
