import type { TechnicalIndicators } from '../../../../types'
import { BinanceService } from '../../../utils/binance'
import { calculateIndicators } from '../../../utils/indicators'

/**
 * 指标缓存服务
 */
export class IndicatorsCache {
  private binance: BinanceService
  private cache: Map<string, { indicators: TechnicalIndicators; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000 // 1分钟缓存过期时间

  constructor(binance: BinanceService) {
    this.binance = binance
  }

  /**
   * 获取指标（带缓存）
   */
  async getIndicators(symbol: string): Promise<TechnicalIndicators> {
    const cached = this.cache.get(symbol)
    const now = Date.now()

    // 如果缓存有效，直接返回
    if (cached && (now - cached.timestamp < this.CACHE_TTL)) {
      return cached.indicators
    }

    // 否则重新计算并更新缓存
    try {
      const indicators = await calculateIndicators(this.binance, symbol)
      this.cache.set(symbol, { indicators, timestamp: now })
      return indicators
    } catch (error: any) {
      // 如果计算失败，尝试返回缓存（即使过期）
      if (cached) {
        console.warn(`指标计算失败，使用过期缓存: ${symbol}`, error.message)
        return cached.indicators
      }
      throw error
    }
  }

  /**
   * 清除缓存
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol)
    } else {
      this.cache.clear()
    }
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus(): { size: number; entries: Array<{ symbol: string; age: number }> } {
    const now = Date.now()
    const entries = Array.from(this.cache.entries()).map(([symbol, data]) => ({
      symbol,
      age: now - data.timestamp
    }))

    return {
      size: this.cache.size,
      entries
    }
  }
}