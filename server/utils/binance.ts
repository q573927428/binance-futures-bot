import * as ccxt from 'ccxt'
import type { OHLCV, Order, AccountInfo, Position, CryptoBalance } from '../../types'

export class BinanceService {
  private exchange: ccxt.binance
  private marketsLoaded: boolean = false
  constructor(apiKey: string, apiSecret: string) {
    this.exchange = new ccxt.binance({
      apiKey,
      secret: apiSecret,
      options: {
        defaultType: 'future', // USDT永续合约
        adjustForTimeDifference: true,
      },
      enableRateLimit: true,
    })
  }

  async initialize(): Promise<void> {
    if (!this.marketsLoaded) {
      await this.exchange.loadMarkets()
      this.marketsLoaded = true
    }
  }

  /**
   * 获取K线数据
   */
  async fetchOHLCV(symbol: string, timeframe: string, limit = 100): Promise<OHLCV[]> {
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit)
      return ohlcv.map(candle => ({
        timestamp: Number(candle[0]) || 0,
        open: Number(candle[1]) || 0,
        high: Number(candle[2]) || 0,
        low: Number(candle[3]) || 0,
        close: Number(candle[4]) || 0,
        volume: Number(candle[5]) || 0,
      }))
    } catch (error: any) {
      throw new Error(`获取K线数据失败: ${error.message}`)
    }
  }

  /**
   * 获取当前价格
   */
  async fetchPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol)
      return ticker.last || 0
    } catch (error: any) {
      throw new Error(`获取价格失败: ${error.message}`)
    }
  }

  /**
   * 获取账户余额
   */
  async fetchBalance(): Promise<AccountInfo> {
    try {
      const balance = await this.exchange.fetchBalance()
      const usdt = balance['USDT'] || { free: 0, total: 0 }
      
      return {
        balance: usdt.total || 0,
        availableBalance: usdt.free || 0,
        totalPnL: 0,
        positions: [],
      }
    } catch (error: any) {
      throw new Error(`获取账户余额失败: ${error.message}`)
    }
  }

  /**
   * 获取加密货币余额（合约账户）
   */
  async fetchCryptoBalances(): Promise<CryptoBalance[]> {
    try {
      // 获取合约账户余额
      const balance = await this.exchange.fetchBalance()
      
      // 定义我们感兴趣的加密货币
      const targetAssets = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'DOGE']
      const cryptoBalances: CryptoBalance[] = []
      
      for (const asset of targetAssets) {
        const assetBalance = balance[asset]
        if (assetBalance) {
          const free = Number(assetBalance.free || 0)
          const locked = Number(assetBalance.used || 0)
          const total = free + locked
          
          if (total > 0) {
            cryptoBalances.push({
              asset,
              free,
              locked,
              total,
            })
          }
        }
      }
      
      return cryptoBalances
    } catch (error: any) {
      // 如果获取现货余额失败，返回空数组
      console.warn(`获取加密货币余额失败: ${error.message}`)
      return []
    }
  }

  /**
   * 设置杠杆
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    try {
      await this.exchange.setLeverage(leverage, symbol)
    } catch (error: any) {
      throw new Error(`设置杠杆失败: ${error.message}`)
    }
  }

  /**
   * 设置保证金模式（逐仓/全仓）
   */
  async setMarginMode(symbol: string, marginMode: 'isolated' | 'cross' = 'isolated'): Promise<void> {
    try {
      await this.exchange.setMarginMode(marginMode, symbol)
    } catch (error: any) {
      // 如果已经是该模式，忽略错误
      if (!error.message.includes('No need to change')) {
        throw new Error(`设置保证金模式失败: ${error.message}`)
      }
    }
  }

  /**
   * 市价开仓
   */
  async marketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<Order> {
    try {
      const order = await this.exchange.createOrder(symbol, 'market', side, amount)
      
      return {
        orderId: order.id,
        symbol: order.symbol,
        side: side.toUpperCase() as 'BUY' | 'SELL',
        type: 'MARKET',
        quantity: order.amount,
        price: order.price,
        status: order.status || 'unknown',
        timestamp: order.timestamp || Date.now(),
      }
    } catch (error: any) {
      throw new Error(`市价下单失败: ${error.message}`)
    }
  }

  /**
   * 止损单
   */
  async stopLossOrder(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    stopPrice: number
  ): Promise<Order> {
    try {
      const order = await this.exchange.createOrder(
        symbol,
        'stop_market',
        side,
        amount,
        undefined,
        { stopPrice }
      )
      
      return {
        orderId: order.id,
        symbol: order.symbol,
        side: side.toUpperCase() as 'BUY' | 'SELL',
        type: 'STOP_MARKET',
        quantity: order.amount,
        stopPrice,
        status: order.status || 'unknown',
        timestamp: order.timestamp || Date.now(),
      }
    } catch (error: any) {
      throw new Error(`止损单下单失败: ${error.message}`)
    }
  }

  /**
   * 止盈单
   */
  async takeProfitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    stopPrice: number
  ): Promise<Order> {
    try {
      const order = await this.exchange.createOrder(
        symbol,
        'take_profit_market',
        side,
        amount,
        undefined,
        { stopPrice }
      )
      
      return {
        orderId: order.id,
        symbol: order.symbol,
        side: side.toUpperCase() as 'BUY' | 'SELL',
        type: 'TAKE_PROFIT_MARKET',
        quantity: order.amount,
        stopPrice,
        status: order.status || 'unknown',
        timestamp: order.timestamp || Date.now(),
      }
    } catch (error: any) {
      throw new Error(`止盈单下单失败: ${error.message}`)
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    try {
      await this.exchange.cancelOrder(orderId, symbol)
    } catch (error: any) {
      throw new Error(`取消订单失败: ${error.message}`)
    }
  }

  /**
   * 取消所有订单
   */
  async cancelAllOrders(symbol: string): Promise<void> {
    try {
      await this.exchange.cancelAllOrders(symbol)
    } catch (error: any) {
      throw new Error(`取消所有订单失败: ${error.message}`)
    }
  }

  /**
   * 获取当前持仓
   */
  async fetchPositions(symbol?: string): Promise<Position[]> {
    try {
      const positions = await this.exchange.fetchPositions(symbol ? [symbol] : undefined)
      
      return positions
        .filter((p: any) => Number(p.contracts || p.info?.positionAmt || 0) !== 0)
        .map((p: any) => ({
          symbol: p.symbol,
          direction: Number(p.contracts || p.info?.positionAmt || 0) > 0 ? 'LONG' : 'SHORT',
          entryPrice: Number(p.entryPrice || 0),
          quantity: Math.abs(Number(p.contracts || p.info?.positionAmt || 0)),
          leverage: Number(p.leverage || 1),
          stopLoss: 0,
          takeProfit1: 0,
          takeProfit2: 0,
          openTime: Date.now(),
        }))
    } catch (error: any) {
      throw new Error(`获取持仓失败: ${error.message}`)
    }
  }

  /**
   * 获取订单状态
   */
  async fetchOrder(symbol: string, orderId: string): Promise<Order> {
    try {
      const order = await this.exchange.fetchOrder(orderId, symbol)
      
      // 映射订单类型
      const mapOrderType = (ccxtType: string | undefined): Order['type'] => {
        if (!ccxtType) return 'MARKET'
        const type = ccxtType.toLowerCase()
        if (type.includes('market')) return 'MARKET'
        if (type.includes('limit')) return 'LIMIT'
        if (type.includes('stop_market') || type.includes('stop')) return 'STOP_MARKET'
        if (type.includes('take_profit_market') || type.includes('take_profit')) return 'TAKE_PROFIT_MARKET'
        return 'MARKET' // 默认值
      }
      
      // 处理可能为undefined的字段
      const side = order.side ? order.side.toUpperCase() as 'BUY' | 'SELL' : 'BUY'
      const orderType = mapOrderType(order.type)
      
      return {
        orderId: order.id,
        symbol: order.symbol,
        side,
        type: orderType,
        quantity: order.amount,
        price: order.price,
        status: order.status || 'unknown',
        timestamp: order.timestamp || Date.now(),
      }
    } catch (error: any) {
      throw new Error(`获取订单状态失败: ${error.message}`)
    }
  }

  /**
   * 计算合适的下单数量（考虑精度）
   */
  async calculateOrderAmount(symbol: string, usdtAmount: number, price: number): Promise<number> {
    try {
      // 确保市场信息已加载
      if (!this.marketsLoaded) {
        await this.initialize()
      }
      
      const market = this.exchange.market(symbol)
      const amount = usdtAmount / price
      
      // 获取最小交易量限制
      const minAmount = market.limits?.amount?.min || 0.001 // 默认0.001
      
      // 确保数量不小于最小交易量
      let finalAmount = Math.max(amount, minAmount)
      
      // 根据交易对精度调整
      const precision = market.precision?.amount || 5
      finalAmount = Number(finalAmount.toFixed(precision))
      
      console.log('计算下单数量:', {
        symbol,
        usdtAmount,
        price,
        rawAmount: amount,
        minAmount,
        finalAmount,
        precision
      })
      
      return finalAmount
    } catch (error: any) {
      throw new Error(`计算下单数量失败: ${error.message}`)
    }
  }

}

// 单例模式
let binanceInstance: BinanceService | null = null

export function getBinanceService(
  apiKey?: string,
  apiSecret?: string
): BinanceService {
  if (!binanceInstance) {
    const config = useRuntimeConfig()
    binanceInstance = new BinanceService(
      apiKey || config.binanceApiKey,
      apiSecret || config.binanceSecret
    )
  }
  return binanceInstance
}

export function resetBinanceService(): void {
  binanceInstance = null
}
