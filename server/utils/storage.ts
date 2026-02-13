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
 * 计算总统计数据
 */
function calculateTotalStats(history: TradeHistory[]): { totalTrades: number; totalPnL: number; winRate: number } {
  const totalTrades = history.length
  const totalPnL = history.reduce((sum, trade) => sum + trade.pnl, 0)
  const winningTrades = history.filter(trade => trade.pnl > 0).length
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0
  
  return {
    totalTrades,
    totalPnL,
    winRate: parseFloat(winRate.toFixed(2))
  }
}

/**
 * 更新总统计数据到状态并返回更新后的状态
 */
export async function updateTotalStatsInState(): Promise<BotState | null> {
  try {
    const history = await getTradeHistory()
    const stats = calculateTotalStats(history)
    
    const currentState = await loadBotState()
    if (currentState) {
      currentState.totalTrades = stats.totalTrades
      currentState.totalPnL = stats.totalPnL
      currentState.winRate = stats.winRate
      await saveBotState(currentState)
      return currentState
    }
    return null
  } catch (error: any) {
    console.error('更新总统计数据失败:', error.message)
    return null
  }
}

/**
 * 添加交易历史记录并更新总统计数据
 */
export async function addTradeHistory(trade: TradeHistory): Promise<BotState | null> {
  try {
    await ensureDataDir()
    
    let history: TradeHistory[] = []
    
    if (existsSync(HISTORY_FILE)) {
      try {
        const data = await readFile(HISTORY_FILE, 'utf-8')
        // 检查文件是否为空或无效JSON
        if (data.trim()) {
          history = JSON.parse(data)
        }
      } catch (parseError: any) {
        console.warn('解析交易历史文件失败，创建新文件:', parseError.message)
        // 如果解析失败，从空数组开始
        history = []
      }
    }
    
    // 确保交易有唯一的ID
    if (!trade.id) {
      trade.id = `${trade.closeTime}-${trade.symbol.replace('/', '-')}`
    }
    
    history.push(trade)
    
    // 按关闭时间排序，最新的在前面
    history.sort((a, b) => b.closeTime - a.closeTime)
    
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
    console.log(`交易历史已保存: ${trade.symbol} ${trade.direction} PnL: ${trade.pnl.toFixed(2)} USDT`)
    
    // 更新总统计数据并返回更新后的状态
    return await updateTotalStatsInState()
  } catch (error: any) {
    console.error('保存交易历史失败:', error.message)
    console.error('错误堆栈:', error.stack)
    // 不重新抛出错误，避免影响主流程
    // 但记录详细错误信息以便调试
    return null
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
    
    // 按关闭时间排序，最新的在前面
    history.sort((a, b) => b.closeTime - a.closeTime)
    
    if (limit) {
      return history.slice(0, limit)
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
    symbols: ['BTC/USDT','ETH/USDT', 'BNB/USDT', 'SOL/USDT'],
    leverage: 10,                     //杠杆倍数（静态杠杆，当动态杠杆禁用时使用）
    maxRiskPercentage: 20,           //单笔最大风险比例
    stopLossATRMultiplier: 1.5,      //止损ATR倍数
    maxStopLossPercentage: 2,      //最大止损比例
    positionTimeoutHours: 4,         //持仓超时时间
    scanInterval: 120,                //市场扫描间隔
    positionScanInterval: 60,         //持仓扫描间隔
    tradeCooldownInterval: 600,     //交易冷却时间间隔（秒）- 默认10分钟
    aiConfig: { 
      enabled: true,                //启用AI分析
      minConfidence: 60,             //最小置信度（0-100）
      maxRiskLevel: 'MEDIUM',        //最大风险等级
      useForEntry: true,             //用于开仓决策
      useForExit: true,              //用于平仓决策
      cacheDuration: 10,             //缓存时长（分钟）
    },
    riskConfig: {
      circuitBreaker: {
        dailyLossThreshold: 2,       // 当日亏损阈值（%）
        consecutiveLossesThreshold: 3, // 连续止损阈值（次）
      },
      forceLiquidateTime: {
        hour: 23,    // 小时（0-23）
        minute: 30,  // 分钟（0-59）
      },
      takeProfit: {
        tp1RiskRewardRatio: 2,      // TP1盈亏比（1:2）
        tp2RiskRewardRatio: 3,      // TP2盈亏比（1:3）
        rsiExtreme: {
          long: 70,   // 多头RSI极值
          short: 30,  // 空头RSI极值
        },
        adxDecreaseThreshold: 5,    // ADX下降阈值
      },
      dailyTradeLimit: 3,            // 当天交易次数限制
    },
    dynamicLeverageConfig: {
      enabled: true,                 // 启用动态杠杆
      minLeverage: 2,                // 最小杠杆倍数
      maxLeverage: 20,               // 最大杠杆倍数
      baseLeverage: 6,               // 基础杠杆倍数（从5提高到8以获得更分散的杠杆）
      riskLevelMultipliers: {        // 风险等级乘数（进一步调整以获得更分散的杠杆）
        LOW: 1.5,
        MEDIUM: 1.0,
        HIGH: 0.5,
      },
    },
    trailingStopConfig: {
      enabled: true,                 // 启用移动止损
      activationRatio: 0.5,          // 激活盈亏比：盈利达到风险的50%时启用
      trailingDistance: 1.5,         // 跟踪距离：ATR的1.5倍
      updateIntervalSeconds: 60,     // 更新间隔：60秒检查一次
    },
    indicatorsConfig: {
      adxTrend: {
        adx1hThreshold: 25,          // 1小时ADX阈值
        adx4hThreshold: 28,          // 4小时ADX阈值
      },
      longEntry: {
        emaDeviationThreshold: 0.005, // EMA偏离阈值 (0.5%)
        rsiMin: 40,                  // RSI最小值
        rsiMax: 60,                  // RSI最大值
        candleShadowThreshold: 0.005, // K线下影线阈值 (0.5%)
        volumeConfirmation: true,    // 成交量确认
        volumePeriod: 20,            // 成交量周期
        volumeMultiplier: 1.0,       // 成交量倍数
      },
      shortEntry: {
        emaDeviationThreshold: 0.005, // EMA偏离阈值 (0.5%)
        rsiMin: 40,                  // RSI最小值
        rsiMax: 55,                  // RSI最大值
        candleShadowThreshold: 0.005, // K线上影线阈值 (0.5%)
        volumeConfirmation: true,    // 成交量确认
        volumePeriod: 20,            // 成交量周期
        volumeMultiplier: 1.0,       // 成交量倍数
      },
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
    isRunning: false,
    allowNewTrades: true,  // 默认允许新交易
    lastTradeTime: 0,      // 上次交易时间，默认为0
    // 总统计数据默认值
    totalTrades: 0,
    totalPnL: 0,
    winRate: 0,
  }
}
