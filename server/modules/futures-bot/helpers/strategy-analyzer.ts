import type { Position, TechnicalIndicators, StrategyAnalysisMetrics } from '../../../../types'
import { calculatePnL } from '../../../utils/risk'
import { saveStrategyAnalysisMetrics } from '../../../utils/analysis-storage'
import { logger } from '../../../utils/logger'
import dayjs from 'dayjs'

/**
 * 价格历史记录
 */
interface PriceHistoryPoint {
  timestamp: number
  price: number
  pnl: number
  pnlPercentage: number
}

/**
 * 策略分析器 - 用于记录和分析交易策略指标
 */
export class StrategyAnalyzer {
  private tradeId: string
  private symbol: string
  private direction: string
  private entryPrice: number
  private openTime: number
  private stopLossPrice: number
  private takeProfit1Price: number
  private takeProfit2Price: number
  private quantity: number
  private leverage: number
  
  // MFE/MAE跟踪
  private maxFavorableExcursion: number = 0
  private maxFavorableExcursionPercentage: number = 0
  private maxAdverseExcursion: number = 0
  private maxAdverseExcursionPercentage: number = 0
  
  // 价格历史记录
  private priceHistory: PriceHistoryPoint[] = []
  private lastPrice: number = 0
  
  // 入场指标
  private entryIndicators: TechnicalIndicators | null = null
  
  // 出场指标
  private exitIndicators: TechnicalIndicators | null = null
  
  // ATR历史记录（用于计算平均ATR）
  private atrHistory: number[] = []
  
  // 最高价和最低价跟踪
  private highestPrice: number = 0
  private lowestPrice: number = 0

  constructor(position: Position) {
    this.tradeId = `${position.openTime}-${position.symbol.replace('/', '-')}`
    this.symbol = position.symbol
    this.direction = position.direction
    this.entryPrice = position.entryPrice
    this.openTime = position.openTime
    this.stopLossPrice = position.stopLoss
    this.takeProfit1Price = position.takeProfit1
    this.takeProfit2Price = position.takeProfit2
    this.quantity = position.quantity
    this.leverage = position.leverage
    
    // 初始化价格跟踪
    this.lastPrice = position.entryPrice
    this.highestPrice = position.entryPrice
    this.lowestPrice = position.entryPrice
    
    // 记录初始价格点
    this.recordPricePoint(position.entryPrice, position.openTime)
  }

  /**
   * 记录入场指标
   */
  recordEntryIndicators(indicators: TechnicalIndicators): void {
    this.entryIndicators = indicators
    this.atrHistory.push(indicators.atr)
    
    logger.info('策略分析', `记录入场指标: ${this.symbol} RSI=${indicators.rsi}, ADX15m=${indicators.adx15m}`)
  }

  /**
   * 记录价格点并更新MFE/MAE
   */
  recordPricePoint(price: number, timestamp: number): void {
    this.lastPrice = price
    
    // 更新最高价和最低价
    if (price > this.highestPrice) {
      this.highestPrice = price
    }
    if (price < this.lowestPrice) {
      this.lowestPrice = price
    }
    
    // 计算当前盈亏
    const position = this.createPositionObject()
    const { pnl, pnlPercentage } = calculatePnL(price, position)
    
    // 更新MFE/MAE
    if (pnl > this.maxFavorableExcursion) {
      this.maxFavorableExcursion = pnl
      this.maxFavorableExcursionPercentage = pnlPercentage
    }
    
    if (pnl < this.maxAdverseExcursion) {
      this.maxAdverseExcursion = pnl
      this.maxAdverseExcursionPercentage = pnlPercentage
    }
    
    // 记录价格历史（限制频率，避免数据过大）
    const now = Date.now()
    const lastRecord = this.priceHistory[this.priceHistory.length - 1]
    
    // 每5分钟记录一次，或者价格变化超过0.5%
    if (!lastRecord || 
        (now - lastRecord.timestamp > 300000) || 
        Math.abs(price - lastRecord.price) / lastRecord.price > 0.005) {
      this.priceHistory.push({
        timestamp,
        price,
        pnl,
        pnlPercentage
      })
    }
  }

  /**
   * 记录ATR值（用于计算平均ATR）
   */
  recordATR(atr: number): void {
    this.atrHistory.push(atr)
  }

  /**
   * 记录出场指标
   */
  recordExitIndicators(indicators: TechnicalIndicators): void {
    this.exitIndicators = indicators
  }

  /**
   * 生成策略分析指标
   */
  async generateAnalysisMetrics(
    exitPrice: number,
    exitReason: string,
    exitTime: number
  ): Promise<StrategyAnalysisMetrics> {
    // 确保记录最终价格点
    this.recordPricePoint(exitPrice, exitTime)
    
    // 计算持仓时长
    const duration = exitTime - this.openTime
    
    // 计算风险金额
    const riskAmount = this.calculateRiskAmount()
    
    // 计算实际盈利金额
    const position = this.createPositionObject()
    const { pnl, pnlPercentage } = calculatePnL(exitPrice, position)
    const rewardAmount = pnl // 使用实际盈利金额（可以是负数）
    
    // 计算风险回报比
    // 如果盈利为正，风险回报比 = 盈利 / 风险
    // 如果盈利为负，风险回报比 = -1 * (亏损 / 风险)
    let riskRewardRatio = 0
    if (riskAmount > 0) {
      if (pnl >= 0) {
        riskRewardRatio = pnl / riskAmount
      } else {
        riskRewardRatio = -1 * (Math.abs(pnl) / riskAmount)
      }
    }
    
    // 计算价格波动范围百分比
    const priceRangePercentage = (this.highestPrice - this.lowestPrice) / this.entryPrice * 100
    
    // 计算最大回撤百分比
    const maxDrawdownPercentage = Math.abs(this.maxAdverseExcursionPercentage)
    
    // 计算平均ATR
    const averageATR = this.atrHistory.length > 0 
      ? this.atrHistory.reduce((sum, atr) => sum + atr, 0) / this.atrHistory.length
      : 0
    
    // 计算入场价格与EMA的偏离度
    const entryPriceToEMA20Deviation = this.entryIndicators 
      ? ((this.entryPrice - this.entryIndicators.ema20) / this.entryIndicators.ema20) * 100
      : 0
    
    const entryPriceToEMA60Deviation = this.entryIndicators 
      ? ((this.entryPrice - this.entryIndicators.ema60) / this.entryIndicators.ema60) * 100
      : 0
    
    // 确定退出原因分类
    const exitReasonCategory = this.categorizeExitReason(exitReason)
    
    // 提取时间特征
    const tradeDate = dayjs(this.openTime)
    const tradeHour = tradeDate.hour()
    const tradeDayOfWeek = tradeDate.day() // 0=周日, 1=周一, ..., 6=周六
    const tradeMonth = tradeDate.month() + 1 // 1-12
    
    // 计算仓位大小百分比（简化计算）
    const positionSizePercentage = this.calculatePositionSizePercentage()
    
    // 计算使用的保证金
    const marginUsed = this.calculateMarginUsed()
    
    // 构建分析指标对象
    const analysisMetrics: StrategyAnalysisMetrics = {
      // 基础信息
      tradeId: this.tradeId,
      symbol: this.symbol,
      direction: this.direction as any,
      
      // 时间信息
      openTime: this.openTime,
      closeTime: exitTime,
      duration,
      
      // 价格信息
      entryPrice: this.entryPrice,
      exitPrice,
      stopLossPrice: this.stopLossPrice,
      takeProfit1Price: this.takeProfit1Price,
      takeProfit2Price: this.takeProfit2Price,
      
      // MFE/MAE指标
      mfe: this.maxFavorableExcursion,
      mfePercentage: this.maxFavorableExcursionPercentage,
      mae: this.maxAdverseExcursion,
      maePercentage: this.maxAdverseExcursionPercentage,
      
      // 风险回报指标
      riskAmount,
      rewardAmount,
      riskRewardRatio,
      
      // 入场指标
      entryRSI: this.entryIndicators?.rsi || 0,
      entryADX15m: this.entryIndicators?.adx15m || 0,
      entryADX1h: this.entryIndicators?.adx1h || 0,
      entryADX4h: this.entryIndicators?.adx4h || 0,
      entryEMA20: this.entryIndicators?.ema20 || 0,
      entryEMA60: this.entryIndicators?.ema60 || 0,
      entryPriceToEMA20Deviation,
      entryPriceToEMA60Deviation,
      
      // 出场指标
      exitRSI: this.exitIndicators?.rsi || 0,
      exitADX15m: this.exitIndicators?.adx15m || 0,
      exitADX1h: this.exitIndicators?.adx1h || 0,
      exitADX4h: this.exitIndicators?.adx4h || 0,
      exitEMA20: this.exitIndicators?.ema20 || 0,
      exitEMA60: this.exitIndicators?.ema60 || 0,
      
      // 波动性指标
      averageATR,
      priceRangePercentage,
      maxDrawdownPercentage,
      
      // 资金管理指标
      positionSizePercentage,
      actualLeverage: this.leverage,
      marginUsed,
      
      // 交易结果
      pnl,
      pnlPercentage,
      exitReason,
      exitReasonCategory,
      
      // 时间特征
      tradeHour,
      tradeDayOfWeek,
      tradeMonth,
      
      // 价格历史（可选）
      priceHistory: this.priceHistory.length > 0 ? this.priceHistory.map(point => ({
        timestamp: point.timestamp,
        price: point.price,
        pnl: point.pnl,
        pnlPercentage: point.pnlPercentage
      })) : undefined,
      
      // 创建时间
      createdAt: Date.now()
    }
    
    // 保存分析指标
    await saveStrategyAnalysisMetrics(analysisMetrics)
    
    logger.info('策略分析', `分析指标已生成: ${this.symbol} MFE=${this.maxFavorableExcursion.toFixed(2)}, MAE=${this.maxAdverseExcursion.toFixed(2)}`)
    
    return analysisMetrics
  }

  /**
   * 创建用于计算的仓位对象
   */
  private createPositionObject(): any {
    return {
      symbol: this.symbol,
      direction: this.direction,
      entryPrice: this.entryPrice,
      quantity: this.quantity,
      leverage: this.leverage,
      openTime: this.openTime
    }
  }

  /**
   * 计算风险金额
   */
  private calculateRiskAmount(): number {
    // 风险金额 = 初始止损对应的亏损金额
    const position = this.createPositionObject()
    const { pnl: stopLossPnL } = calculatePnL(this.stopLossPrice, position)
    return Math.abs(stopLossPnL)
  }

  /**
   * 计算仓位大小百分比
   */
  private calculatePositionSizePercentage(): number {
    // 简化计算：仓位价值 / 假设的总资金
    // 实际项目中应该从账户信息获取总资金
    const positionValue = this.entryPrice * this.quantity
    const assumedTotalCapital = 10000 // 假设总资金为10000 USDT
    return (positionValue / assumedTotalCapital) * 100
  }

  /**
   * 计算使用的保证金
   */
  private calculateMarginUsed(): number {
    // 保证金 = 仓位价值 / 杠杆倍数
    const positionValue = this.entryPrice * this.quantity
    return positionValue / this.leverage
  }

  /**
   * 分类退出原因
   */
  private categorizeExitReason(reason: string): 'TP1' | 'TP2' | 'STOP_LOSS' | 'TIMEOUT' | 'FORCE_LIQUIDATE' | 'TRAILING_STOP' | 'OTHER' {
    const lowerReason = reason.toLowerCase()
    
    if (lowerReason.includes('tp1') || lowerReason.includes('止盈1')) {
      return 'TP1'
    } else if (lowerReason.includes('tp2') || lowerReason.includes('止盈2')) {
      return 'TP2'
    } else if (lowerReason.includes('止损') || lowerReason.includes('stop loss')) {
      return 'STOP_LOSS'
    } else if (lowerReason.includes('超时') || lowerReason.includes('timeout')) {
      return 'TIMEOUT'
    } else if (lowerReason.includes('强制平仓') || lowerReason.includes('force liquidate')) {
      return 'FORCE_LIQUIDATE'
    } else if (lowerReason.includes('移动止损') || lowerReason.includes('trailing stop')) {
      return 'TRAILING_STOP'
    } else {
      return 'OTHER'
    }
  }

  /**
   * 获取当前MFE/MAE
   */
  getCurrentMetrics() {
    return {
      mfe: this.maxFavorableExcursion,
      mfePercentage: this.maxFavorableExcursionPercentage,
      mae: this.maxAdverseExcursion,
      maePercentage: this.maxAdverseExcursionPercentage,
      highestPrice: this.highestPrice,
      lowestPrice: this.lowestPrice,
      priceRangePercentage: (this.highestPrice - this.lowestPrice) / this.entryPrice * 100
    }
  }
}