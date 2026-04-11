import type { AIAnalysis, Direction, RiskLevel, TechnicalIndicators, BotConfig, AIConditionMode } from '../../types'

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
  price: number,
  config?: BotConfig
): { confidenceAdjustment: number; scoreAdjustment: number } {
  const postAdjustmentMode = config?.aiConfig?.technicalPostAdjustmentMode ?? 'PENALTY_ONLY'
  const isPenaltyOnly = postAdjustmentMode === 'PENALTY_ONLY'

  // 初始化调整因子
  let confidenceAdjustment = 0
  let scoreAdjustment = 0

  const addPositiveAdjustment = (confidence: number, score: number) => {
    if (isPenaltyOnly) return
    confidenceAdjustment += confidence
    scoreAdjustment += score
  }
  
  // 1. ADX趋势强度调整（多周期确认）
  // ADX > 25表示强趋势，ADX > 40表示非常强趋势
  const avgAdxScore = (indicators.adx15m + indicators.adx1h + indicators.adx4h) / 3
  if (avgAdxScore >= 40) {
    addPositiveAdjustment(6, 4)
  } else if (avgAdxScore >= 25) {
    addPositiveAdjustment(3, 2)
  } else if (avgAdxScore >= 20) {
    addPositiveAdjustment(1, 1)
  }
  
  // 2. 多周期ADX一致性调整
  const adxConsistency = 
    (indicators.adx15m >= 25 ? 1 : 0) +
    (indicators.adx1h >= 22 ? 1 : 0) +
    (indicators.adx4h >= 20 ? 1 : 0)
  
  if (adxConsistency === 3) {
    addPositiveAdjustment(5, 4)
  } else if (adxConsistency === 2) {
    addPositiveAdjustment(2, 1)
  }
  
  // 3. RSI位置调整（结合交易方向）
  const isLong = (indicators.ema20 > indicators.ema60 && price > indicators.ema20)
  const isShort = (indicators.ema20 < indicators.ema60 && price < indicators.ema20)
  const rsi = indicators.rsi
  if (isLong) {
    if (rsi >= 75) {
      // 严重超买，风险升高
      confidenceAdjustment -= 3
      scoreAdjustment -= 2
    } else if (rsi >= 60) {
      // 强趋势主升段（健康区间）
      addPositiveAdjustment(4, 3)
    } else if (rsi >= 50) {
      // 健康回调区
      addPositiveAdjustment(2, 2)
    } else if (rsi >= 45) {
      // 趋势初期或深度回调，中性
      // 不加分也不扣分
    } else {
      // 弱趋势/可能反转，扣分力度适当降低
      confidenceAdjustment -= 4
      scoreAdjustment -= 3
    }
  }
  
  // 空头对称调整
  if (isShort) {
    if (rsi <= 25) {
      // 严重超卖，风险升高
      confidenceAdjustment -= 3
      scoreAdjustment -= 2
    } else if (rsi <= 40) {
      // 强趋势主跌段（健康区间）
      addPositiveAdjustment(4, 3)
    } else if (rsi <= 50) {
      // 健康回调区
      addPositiveAdjustment(2, 2)
    } else if (rsi <= 55) {
      // 趋势初期或深度反弹，中性
    } else {
      // 弱趋势/可能反转
      confidenceAdjustment -= 4
      scoreAdjustment -= 3
    }
  }
  

  // 4. EMA排列调整
  const emaDistance20_60 = Math.abs(indicators.ema20 - indicators.ema60) / indicators.ema60
  if (emaDistance20_60 >= 0.02) { // 2%以上距离
    if ((indicators.ema20 > indicators.ema60 && price > indicators.ema20) ||
        (indicators.ema20 < indicators.ema60 && price < indicators.ema20)) {
      // 趋势一致
      addPositiveAdjustment(3, 2)
    }
  }
  
  // 5. EMA30支撑/阻力调整
  const priceToEMA30 = Math.abs(price - indicators.ema30) / indicators.ema30
  // 使用配置文件中的阈值，默认为0.02
  const longEmaDeviationThreshold = config?.indicatorsConfig?.longEntry?.emaDeviationThreshold ?? 0.02
  const shortEmaDeviationThreshold = config?.indicatorsConfig?.shortEntry?.emaDeviationThreshold ?? 0.02
  
  if (isLong && price > indicators.ema30 && priceToEMA30 <= longEmaDeviationThreshold) {
    // 多头回踩EMA（健康趋势）
    addPositiveAdjustment(1, 1)
  }
  
  if (isShort && price < indicators.ema30 && priceToEMA30 <= shortEmaDeviationThreshold) {
    // 空头反弹到EMA
    addPositiveAdjustment(1, 1)
  }
  
  // 6. ATR波动性调整（基于实际交易数据优化）
  const normalizedATR = indicators.atr / price
  const adxScore = (indicators.adx15m + indicators.adx1h + indicators.adx4h) / 3
  
  // 强趋势门槛（使用配置文件中的阈值，默认为25）
  const adx15mThreshold = config?.indicatorsConfig?.adxTrend?.adx15mThreshold ?? 25
  const isStrongTrend = adxScore >= adx15mThreshold

  if (isStrongTrend) {
    // ATR过滤：只做“可交易波动”
    if (normalizedATR < 0.006) {
      // 波动太小 → 不动
      confidenceAdjustment -= 3
      scoreAdjustment -= 2
    } else if (normalizedATR > 0.03) {
      // 波动爆炸 → 风险大
      confidenceAdjustment -= 5
      scoreAdjustment -= 3
    } else {
      // 理想趋势波动区间
      addPositiveAdjustment(3, 2)
    }
  } else {
    // 非趋势市场 → 直接打压（重点）
    confidenceAdjustment -= 6
    scoreAdjustment -= 4
  }
  
  // 确保调整在合理范围内
  const confidenceUpperBound = isPenaltyOnly ? 5 : 15
  const scoreUpperBound = isPenaltyOnly ? 4 : 13
  confidenceAdjustment = Math.max(-30, Math.min(confidenceUpperBound, confidenceAdjustment))
  scoreAdjustment = Math.max(-25, Math.min(scoreUpperBound, scoreAdjustment))
  
  return { confidenceAdjustment, scoreAdjustment }
}

/**
 * 应用技术指标权重调整到AI分析结果
 */
export function applyTechnicalWeightAdjustment(
  aiAnalysis: AIAnalysis,
  indicators: TechnicalIndicators,
  config?: BotConfig
): AIAnalysis {
  const { confidenceAdjustment, scoreAdjustment } = 
    calculateTechnicalWeightAdjustment(indicators, aiAnalysis.technicalData.price, config)
  
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
 * 构建系统提示词
 */
function buildSystemPrompt(): string {
  return `你是一位专业的加密货币期货交易分析师，拥有10年以上的交易经验。请遵循以下原则进行分析：

1. 风险第一：始终优先考虑风险管理，避免高风险交易
2. 趋势为王：尊重市场趋势，不逆势交易
3. 多时间框架：综合考虑15分钟、1小时、4小时时间框架
4. 指标共振：寻找多个技术指标的共振信号
5. 量价配合：成交量必须支持价格走势

请严格按照指定的JSON格式返回分析结果，不要添加任何额外的文本或解释。`
}

/**
 * 构建AI分析提示词
 */
function buildAIPrompt(
  symbol: string,
  price: number,
  ema20: number,
  ema60: number,
  rsi: number,
  volume: number,
  priceChange24h: number,
  indicators?: TechnicalIndicators,
  config?: BotConfig
): string {
  // 获取策略模式，默认为短期
  const strategyMode = config?.strategyMode || 'short_term'
  
  // 根据策略模式选择指标名称（使用配置的EMA周期）
  const emaPeriods = config?.indicatorsConfig?.emaPeriods
  const emaFastPeriod = emaPeriods?.[strategyMode]?.fast || (strategyMode === 'medium_term' ? 50 : 20)
  const emaMediumPeriod = emaPeriods?.[strategyMode]?.medium || (strategyMode === 'medium_term' ? 100 : 30)
  const emaSlowPeriod = emaPeriods?.[strategyMode]?.slow || (strategyMode === 'medium_term' ? 200 : 60)
  const emaFastName = `EMA${emaFastPeriod}`
  const emaMediumName = `EMA${emaMediumPeriod}`
  const emaSlowName = `EMA${emaSlowPeriod}`
  
  // 根据策略模式选择ADX周期名称
  const adxMainName = strategyMode === 'medium_term' ? '1小时ADX' : '15分钟ADX'
  const adxSecondaryName = strategyMode === 'medium_term' ? '4小时ADX' : '1小时ADX'
  const adxTertiaryName = strategyMode === 'medium_term' ? '日线ADX' : '4小时ADX'
  
  // 基础市场数据
  let prompt = `作为专业的加密货币期货交易分析师，请对${symbol}进行全面的技术分析并提供交易建议。

## 市场数据概览：
- 当前价格: ${price.toFixed(4)}
- 价格变化: ${priceChange24h.toFixed(2)}%
- 成交量: ${volume.toFixed(2)}
- RSI(14): ${rsi.toFixed(2)}

## 趋势分析：
- ${emaFastName}: ${ema20.toFixed(4)} ${price > ema20 ? '✓ 价格在' + emaFastName + '之上' : '✗ 价格在' + emaFastName + '之下'}
- ${emaSlowName}: ${ema60.toFixed(4)} ${price > ema60 ? '✓ 价格在' + emaSlowName + '之上' : '✗ 价格在' + emaSlowName + '之下'}
- EMA排列: ${ema20 > ema60 ? '多头排列 (' + emaFastName + ' > ' + emaSlowName + ')' : '空头排列 (' + emaFastName + ' < ' + emaSlowName + ')'}`

  // 如果提供了完整的技术指标，添加更多分析维度
  if (indicators) {
    const adxScore = (indicators.adx15m + indicators.adx1h + indicators.adx4h) / 3
    const normalizedATR = indicators.atr / price
    
    prompt += `

## 多时间框架技术指标：
### ADX趋势强度（数值越高趋势越强）：
- ${adxMainName}: ${indicators.adx15m.toFixed(2)} ${indicators.adx15m >= 25 ? '✓ 强趋势' : indicators.adx15m >= 20 ? '○ 中等趋势' : '✗ 弱趋势'}
- ${adxSecondaryName}: ${indicators.adx1h.toFixed(2)} ${indicators.adx1h >= 25 ? '✓ 强趋势' : indicators.adx1h >= 20 ? '○ 中等趋势' : '✗ 弱趋势'}
- ${adxTertiaryName}: ${indicators.adx4h.toFixed(2)} ${indicators.adx4h >= 25 ? '✓ 强趋势' : indicators.adx4h >= 20 ? '○ 中等趋势' : '✗ 弱趋势'}
- 平均ADX: ${adxScore.toFixed(2)} ${adxScore >= 30 ? '✓ 强趋势市场' : adxScore >= 20 ? '○ 中等趋势市场' : '✗ 震荡市场'}

### 其他关键指标：
- ${emaMediumName}: ${indicators.ema30.toFixed(4)} ${Math.abs(price - indicators.ema30) / indicators.ema30 <= 0.005 ? '⚠️ 价格接近' + emaMediumName + '（潜在支撑/阻力）' : ''}
- ATR: ${indicators.atr.toFixed(4)} (${(normalizedATR * 100).toFixed(2)}%) ${normalizedATR <= 0.005 ? '✓ 低波动性' : normalizedATR >= 0.015 ? '⚠️ 高波动性' : '○ 正常波动性'}

## 多时间框架一致性分析：
- ADX一致性：${indicators.adx15m >= 20 && indicators.adx1h >= 22 && indicators.adx4h >= 25 ? '✓ 多周期趋势一致' : '✗ 多周期趋势不一致'}
- RSI状态：${rsi >= 70 ? '⚠️ 超买区域' : rsi <= 30 ? '⚠️ 超卖区域' : rsi >= 60 ? '接近超买' : rsi <= 40 ? '接近超卖' : '✓ 中性区域'}
- 价格与EMA关系：${(price > ema20 && ema20 > ema60) ? '✓ 多头趋势完整 (' + emaFastName + ' > ' + emaSlowName + ')' : (price < ema20 && ema20 < ema60) ? '✓ 空头趋势完整 (' + emaFastName + ' < ' + emaSlowName + ')' : '⚠️ 趋势不完整'}`
  }

  prompt += `

## 分析要求：
请基于以上数据，综合考虑以下因素：
1. 趋势强度（ADX值）
2. 趋势方向（EMA排列）
3. 超买超卖状态（RSI）
4. 波动性风险（ATR）
5. 成交量配合
6. 多时间框架一致性

## 输出格式：
请以JSON格式回复，包含以下字段：
{
  "direction": "LONG/SHORT/IDLE",
  "confidence": 0-100之间的数字,
  "score": 0-100之间的综合评分,
  "riskLevel": "LOW/MEDIUM/HIGH",
  "reasoning": "详细的分析理由（中文）",
  "support": 支撑位价格（可选，基于技术分析）,
  "resistance": 阻力位价格（可选，基于技术分析）,
  "keyFactors": ["关键因素1", "关键因素2", "关键因素3"]
}

## 评分标准：
- confidence（置信度）：对方向判断的把握程度
- score（综合评分）：考虑风险回报比、趋势强度、指标共振等因素
- riskLevel（风险等级）：基于波动性、RSI位置、趋势完整性等因素

## 注意事项：
1. 只有在趋势明确（ADX≥20）且风险可控时才给出LONG/SHORT建议
2. 当RSI>70时谨慎考虑LONG，RSI<30时谨慎考虑SHORT
3. 高波动性（ATR>3%）时提高风险等级
4. 多周期趋势不一致时降低置信度
5. 如果条件不明确，建议IDLE（观望）`

  return prompt
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
  indicators?: TechnicalIndicators,
  config?: BotConfig
): Promise<AIAnalysis> {
  const runtimeConfig = useRuntimeConfig()
  
  // 检查缓存
  const cacheKey = `${symbol}_${Math.floor(Date.now() / (10 * 60 * 1000))}`
  const cached = analysisCache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return cached.data
  }

  try {
    // 构建优化的提示词
    const prompt = buildAIPrompt(symbol, price, ema20, ema60, rsi, volume, priceChange24h, indicators, config)
    
    // 构建系统提示词
    const systemPrompt = buildSystemPrompt()
    
    // 调用DeepSeek API
    const response = await fetch(`${runtimeConfig.deepseekApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runtimeConfig.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // 降低温度以获得更一致的输出
        max_tokens: 1000,
        response_format: { type: "json_object" } // 强制JSON格式输出
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

    const direction = (aiResult.direction || 'IDLE') as Direction
    
    // 构建分析理由，包含关键因素
    let reasoning = aiResult.reasoning || '无分析理由'
    if (aiResult.keyFactors && Array.isArray(aiResult.keyFactors) && aiResult.keyFactors.length > 0) {
      reasoning += `\n\n关键因素：\n${aiResult.keyFactors.map((factor: string, index: number) => `${index + 1}. ${factor}`).join('\n')}`
    }
    
    const analysis: AIAnalysis = {
      symbol,
      timestamp: Date.now(),
      direction: direction,
      confidence: Math.min(100, Math.max(0, aiResult.confidence || 0)),
      score: Math.min(100, Math.max(0, aiResult.score || 0)),
      riskLevel: (aiResult.riskLevel || 'MEDIUM') as RiskLevel,
      isBullish: direction === 'LONG',
      reasoning: reasoning,
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
      finalAnalysis = applyTechnicalWeightAdjustment(analysis, indicators, config)
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
/**
 * 检查AI分析条件
 */
export function checkAIAnalysisConditions(
  aiAnalysis: AIAnalysis,
  minScore: number,
  minConfidence: number,
  maxRiskLevel: RiskLevel,
  conditionMode: AIConditionMode = 'SCORE_ONLY'
): {
  passed: boolean
  reason: string
  score: number
  confidence: number
  riskLevel: RiskLevel
} {
  // 1. 风险等级权重映射（常量提升，只初始化一次）
  const RISK_LEVEL_WEIGHT: Readonly<Record<RiskLevel, number>> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
  } as const

  // 2. 收集所有不通过原因
  const failReasons: string[] = []

  // 3. 逐项校验
  if (aiAnalysis.direction === 'IDLE') {
    failReasons.push('方向为IDLE')
  }

  if (aiAnalysis.score < minScore) {
    failReasons.push(`评分(${aiAnalysis.score})  < (${minScore})`)
  }

  if (conditionMode === 'SCORE_AND_CONFIDENCE' && aiAnalysis.confidence < minConfidence) {
    failReasons.push(`置信度(${aiAnalysis.confidence}) < (${minConfidence})`)
  }

  if (RISK_LEVEL_WEIGHT[aiAnalysis.riskLevel] > RISK_LEVEL_WEIGHT[maxRiskLevel]) {
    failReasons.push(`风险等级(${aiAnalysis.riskLevel})  > (${maxRiskLevel})`)
  }

  // 4. 统一返回结果
  const passed = failReasons.length === 0
  return {
    passed,
    reason: passed ? '' : failReasons.join('，'),
    score: aiAnalysis.score,
    confidence: aiAnalysis.confidence,
    riskLevel: aiAnalysis.riskLevel,
  }
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
