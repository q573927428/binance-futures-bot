import type { AIAnalysis, Direction, RiskLevel, TechnicalIndicators } from '../../types'

interface AIAnalysisCache {
  data: AIAnalysis
  timestamp: number
}

const analysisCache = new Map<string, AIAnalysisCache>()

/**
 * 基于技术指标计算权重调整因子
 */
export function calculateTechnicalWeightAdjustment(
  indicators: TechnicalIndicators,
  price: number
): { confidenceAdjustment: number; scoreAdjustment: number } {
  // 初始化调整因子
  let confidenceAdjustment = 0
  let scoreAdjustment = 0
  
  // 1. ADX趋势强度调整（多周期确认）
  // ADX > 25表示强趋势，ADX > 40表示非常强趋势
  const adxScore = (indicators.adx15m + indicators.adx1h + indicators.adx4h) / 3
  if (adxScore >= 40) {
    confidenceAdjustment += 15
    scoreAdjustment += 10
  } else if (adxScore >= 25) {
    confidenceAdjustment += 8
    scoreAdjustment += 5
  } else if (adxScore >= 20) {
    confidenceAdjustment += 3
    scoreAdjustment += 2
  }
  
  // 2. 多周期ADX一致性调整
  const adxConsistency = 
    (indicators.adx15m >= 20 ? 1 : 0) +
    (indicators.adx1h >= 22 ? 1 : 0) +
    (indicators.adx4h >= 25 ? 1 : 0)
  
  if (adxConsistency === 3) {
    confidenceAdjustment += 10
    scoreAdjustment += 8
  } else if (adxConsistency === 2) {
    confidenceAdjustment += 5
    scoreAdjustment += 3
  }
  
  // 3. RSI位置调整
  if (indicators.rsi >= 70) {
    // 超买区域，降低置信度
    confidenceAdjustment -= 10
    scoreAdjustment -= 8
  } else if (indicators.rsi <= 30) {
    // 超卖区域，降低置信度
    confidenceAdjustment -= 10
    scoreAdjustment -= 8
  } else if (indicators.rsi >= 60) {
    // 接近超买，轻微降低
    confidenceAdjustment -= 3
    scoreAdjustment -= 2
  } else if (indicators.rsi <= 40) {
    // 接近超卖，轻微降低
    confidenceAdjustment -= 3
    scoreAdjustment -= 2
  } else {
    // RSI在40-60理想区间
    confidenceAdjustment += 5
    scoreAdjustment += 3
  }
  
  // 4. EMA排列调整
  const emaDistance20_60 = Math.abs(indicators.ema20 - indicators.ema60) / indicators.ema60
  if (emaDistance20_60 >= 0.02) { // 2%以上距离
    if ((indicators.ema20 > indicators.ema60 && price > indicators.ema20) ||
        (indicators.ema20 < indicators.ema60 && price < indicators.ema20)) {
      // 趋势一致
      confidenceAdjustment += 8
      scoreAdjustment += 6
    }
  }
  
  // 5. EMA30支撑/阻力调整
  const priceToEMA30 = Math.abs(price - indicators.ema30) / indicators.ema30
  if (priceToEMA30 <= 0.005) { // 0.5%以内
    // 价格接近EMA30，可能形成支撑/阻力
    confidenceAdjustment += 5
    scoreAdjustment += 3
  }
  
  // 6. ATR波动性调整（低波动性可能更好）
  const normalizedATR = indicators.atr / price
  if (normalizedATR <= 0.01) { // ATR小于1%
    // 低波动性，趋势可能更稳定
    confidenceAdjustment += 3
    scoreAdjustment += 2
  } else if (normalizedATR >= 0.03) { // ATR大于3%
    // 高波动性，风险增加
    confidenceAdjustment -= 5
    scoreAdjustment -= 3
  }
  
  // 确保调整在合理范围内
  confidenceAdjustment = Math.max(-30, Math.min(30, confidenceAdjustment))
  scoreAdjustment = Math.max(-25, Math.min(25, scoreAdjustment))
  
  return { confidenceAdjustment, scoreAdjustment }
}

/**
 * 应用技术指标权重调整到AI分析结果
 */
export function applyTechnicalWeightAdjustment(
  aiAnalysis: AIAnalysis,
  indicators: TechnicalIndicators
): AIAnalysis {
  const { confidenceAdjustment, scoreAdjustment } = 
    calculateTechnicalWeightAdjustment(indicators, aiAnalysis.technicalData.price)
  
  // 计算调整后的值
  const adjustedConfidence = Math.min(100, Math.max(0, aiAnalysis.confidence + confidenceAdjustment))
  const adjustedScore = Math.min(100, Math.max(0, aiAnalysis.score + scoreAdjustment))
  
  // 根据技术指标调整风险等级
  let adjustedRiskLevel = aiAnalysis.riskLevel
  const adxScore = (indicators.adx15m + indicators.adx1h + indicators.adx4h) / 3
  
  if (adxScore >= 30 && indicators.rsi >= 40 && indicators.rsi <= 60) {
    // 强趋势 + 合理RSI，降低风险等级
    if (adjustedRiskLevel === 'HIGH') adjustedRiskLevel = 'MEDIUM'
    else if (adjustedRiskLevel === 'MEDIUM') adjustedRiskLevel = 'LOW'
  } else if (adxScore < 20 || indicators.rsi >= 70 || indicators.rsi <= 30) {
    // 弱趋势或极端RSI，提高风险等级
    if (adjustedRiskLevel === 'LOW') adjustedRiskLevel = 'MEDIUM'
    else if (adjustedRiskLevel === 'MEDIUM') adjustedRiskLevel = 'HIGH'
  }
  
  return {
    ...aiAnalysis,
    confidence: adjustedConfidence,
    score: adjustedScore,
    riskLevel: adjustedRiskLevel,
    reasoning: `${aiAnalysis.reasoning}\n\n[技术指标调整] 置信度${confidenceAdjustment >= 0 ? '+' : ''}${confidenceAdjustment.toFixed(1)}，评分${scoreAdjustment >= 0 ? '+' : ''}${scoreAdjustment.toFixed(1)}，基于：ADX(${adxScore.toFixed(1)})，RSI(${indicators.rsi.toFixed(1)})，ATR(${(indicators.atr / aiAnalysis.technicalData.price * 100).toFixed(2)}%)`,
  }
}

/**
 * AI分析服务
 */
export async function analyzeMarketWithAI(
  symbol: string,
  price: number,
  ema20: number,
  ema60: number,
  rsi: number,
  volume: number,
  priceChange24h: number,
  indicators?: TechnicalIndicators
): Promise<AIAnalysis> {
  const config = useRuntimeConfig()
  
  // 检查缓存
  const cacheKey = `${symbol}_${Math.floor(Date.now() / (10 * 60 * 1000))}`
  const cached = analysisCache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return cached.data
  }

  try {
    // 构建提示词
    const prompt = `作为一位专业的加密货币交易分析师，请分析以下${symbol}的市场数据并提供交易建议：

当前价格: ${price}
24小时价格变化: ${priceChange24h.toFixed(2)}%
EMA20: ${ema20}
EMA60: ${ema60}
RSI(14): ${rsi.toFixed(2)}
成交量: ${volume}

价格趋势:
- EMA20 ${ema20 > ema60 ? '>' : '<'} EMA60 (${ema20 > ema60 ? '多头' : '空头'}排列)
- 当前价格 ${price > ema20 ? '高于' : '低于'} EMA20

请以JSON格式回复，包含以下字段：
{
  "direction": "LONG/SHORT/IDLE",
  "confidence": 0-100之间的数字,
  "score": 0-100之间的综合评分,
  "isBullish": true/false,
  "riskLevel": "LOW/MEDIUM/HIGH",
  "reasoning": "详细的分析理由",
  "support": 支撑位价格(可选),
  "resistance": 阻力位价格(可选)
}

注意：
1. confidence表示对方向判断的置信度
2. score表示交易机会的综合评分（考虑风险和回报）
3. 当RSI>70或<30时应特别注意
4. 只有在趋势明确且风险可控时才给出LONG/SHORT建议
5. 确保返回的是有效的JSON格式`

    // 调用DeepSeek API
    const response = await fetch(`${config.deepseekApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一位专业的加密货币技术分析师，精通各种技术指标和市场分析。请始终以JSON格式回复。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API请求失败: ${response.statusText}`)
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || '{}'

    // 提取JSON内容（可能包含markdown代码块）
    let jsonContent = content
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonContent = jsonMatch[1]
    }

    const aiResult = JSON.parse(jsonContent)

    const analysis: AIAnalysis = {
      symbol,
      timestamp: Date.now(),
      direction: (aiResult.direction || 'IDLE') as Direction,
      confidence: Math.min(100, Math.max(0, aiResult.confidence || 0)),
      score: Math.min(100, Math.max(0, aiResult.score || 0)),
      riskLevel: (aiResult.riskLevel || 'MEDIUM') as RiskLevel,
      isBullish: aiResult.isBullish !== false,
      reasoning: aiResult.reasoning || '无分析理由',
      technicalData: {
        price,
        ema20,
        ema60,
        rsi,
        volume,
        support: aiResult.support,
        resistance: aiResult.resistance,
      },
    }

    // 如果提供了技术指标，应用权重调整
    let finalAnalysis = analysis
    if (indicators) {
      finalAnalysis = applyTechnicalWeightAdjustment(analysis, indicators)
    }

    // 缓存结果
    analysisCache.set(cacheKey, {
      data: finalAnalysis,
      timestamp: Date.now(),
    })

    return finalAnalysis
  } catch (error: any) {
    console.error('AI分析失败:', error.message)
    
    // 返回默认分析结果（降级处理）
    return {
      symbol,
      timestamp: Date.now(),
      direction: 'IDLE',
      confidence: 0,
      score: 0,
      riskLevel: 'HIGH',
      isBullish: false,
      reasoning: `AI分析暂时不可用: ${error.message}`,
      technicalData: {
        price,
        ema20,
        ema60,
        rsi,
        volume,
      },
    }
  }
}

/**
 * 检查AI分析条件
 */
export function checkAIAnalysisConditions(aiAnalysis: AIAnalysis, minConfidence: number, maxRiskLevel: RiskLevel): boolean {
  // 评分必须>=60
  if (aiAnalysis.score < 60) return false
  
  // 必须看涨
  if (!aiAnalysis.isBullish) return false
  
  // 置信度检查
  if (aiAnalysis.confidence < minConfidence) return false
  
  // 风险等级检查
  const riskLevels: Record<RiskLevel, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
  }
  
  if (riskLevels[aiAnalysis.riskLevel] > riskLevels[maxRiskLevel]) {
    return false
  }
  
  return true
}

/**
 * 合并技术指标和AI分析的信号强度
 */
export function mergeSignalStrength(
  technicalConfidence: number,
  aiAnalysis: AIAnalysis | undefined,
  aiWeight: number = 0.3
): number {
  if (!aiAnalysis) return technicalConfidence
  
  // 加权平均
  const aiConfidence = aiAnalysis.score
  const merged = technicalConfidence * (1 - aiWeight) + aiConfidence * aiWeight
  
  return Math.min(100, Math.max(0, merged))
}

/**
 * 清除过期缓存
 */
export function clearExpiredCache(maxAge: number = 30 * 60 * 1000): void {
  const now = Date.now()
  for (const [key, cache] of analysisCache.entries()) {
    if (now - cache.timestamp > maxAge) {
      analysisCache.delete(key)
    }
  }
}
