import type { AIAnalysis, Direction, RiskLevel } from '../../types'

interface AIAnalysisCache {
  data: AIAnalysis
  timestamp: number
}

const analysisCache = new Map<string, AIAnalysisCache>()

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
  priceChange24h: number
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

    // 缓存结果
    analysisCache.set(cacheKey, {
      data: analysis,
      timestamp: Date.now(),
    })

    return analysis
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
