// 测试动态杠杆计算
const config = {
  enabled: true,
  minLeverage: 2,
  maxLeverage: 20,
  baseLeverage: 5,
  riskLevelMultipliers: {
    LOW: 3,
    MEDIUM: 2,
    HIGH: 1
  }
};

function calculateQuickLeverage(aiAnalysis, config) {
  // 基础杠杆
  let leverage = config.baseLeverage;
  
  // AI置信度调整：置信度越高，杠杆越高
  // 置信度0-100 -> 乘数0.8-12
  const confidenceFactor = 0.8 + (aiAnalysis.confidence / 100) * 1.0;
  leverage *= confidenceFactor;
  
  // 风险等级调整：风险越低，杠杆越高
  const riskFactor = config.riskLevelMultipliers[aiAnalysis.riskLevel] || 1.0;
  leverage *= riskFactor;
  
  // 确保在范围内并取整
  leverage = Math.max(config.minLeverage, Math.min(config.maxLeverage, leverage));
  return Math.round(leverage);
}

// 测试不同的AI分析场景
const testCases = [
  { name: "高置信度低风险", confidence: 90, riskLevel: "LOW" },
  { name: "高置信度中风险", confidence: 90, riskLevel: "MEDIUM" },
  { name: "高置信度高风险", confidence: 90, riskLevel: "HIGH" },
  { name: "中置信度低风险", confidence: 70, riskLevel: "LOW" },
  { name: "中置信度中风险", confidence: 70, riskLevel: "MEDIUM" },
  { name: "中置信度高风险", confidence: 70, riskLevel: "HIGH" },
  { name: "低置信度低风险", confidence: 50, riskLevel: "LOW" },
  { name: "低置信度中风险", confidence: 50, riskLevel: "MEDIUM" },
  { name: "低置信度高风险", confidence: 50, riskLevel: "HIGH" },
  { name: "最低置信度", confidence: 0, riskLevel: "MEDIUM" },
  { name: "最高置信度", confidence: 100, riskLevel: "MEDIUM" },
];

console.log("动态杠杆计算结果测试：");
console.log("配置：", config);
console.log("=".repeat(50));

testCases.forEach(testCase => {
  const aiAnalysis = {
    confidence: testCase.confidence,
    riskLevel: testCase.riskLevel
  };
  
  const leverage = calculateQuickLeverage(aiAnalysis, config);
  
  console.log(`${testCase.name}:`);
  console.log(`  置信度: ${testCase.confidence}%, 风险等级: ${testCase.riskLevel}`);
  console.log(`  计算过程: 基础杠杆${config.baseLeverage} * 置信度因子${(0.5 + (testCase.confidence / 100) * 1.0).toFixed(2)} * 风险因子${config.riskLevelMultipliers[testCase.riskLevel]} = ${leverage}x`);
  console.log();
});

// 测试安全杠杆计算
function calculateSafeLeverage(accountBalance, maxRiskPercentage, stopLossPrice, entryPrice) {
  if (accountBalance <= 0) return 1;
  
  // 计算止损距离（价格百分比）
  const stopLossDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice;
  
  if (stopLossDistance === 0) return 1;
  
  // 安全杠杆 = (最大风险百分比/100) / 止损距离
  const safeLeverage = (maxRiskPercentage / 100) / stopLossDistance;
  
  // 确保杠杆为正数且合理（1-20倍）
  return Math.max(1, Math.min(20, Math.round(safeLeverage)));
}

console.log("\n安全杠杆计算测试：");
console.log("=".repeat(50));

const safeTestCases = [
  { accountBalance: 1000, maxRiskPercentage: 20, stopLossPrice: 49000, entryPrice: 50000 },
  { accountBalance: 1000, maxRiskPercentage: 20, stopLossPrice: 49500, entryPrice: 50000 },
  { accountBalance: 1000, maxRiskPercentage: 20, stopLossPrice: 49800, entryPrice: 50000 },
];

safeTestCases.forEach(testCase => {
  const safeLeverage = calculateSafeLeverage(
    testCase.accountBalance,
    testCase.maxRiskPercentage,
    testCase.stopLossPrice,
    testCase.entryPrice
  );
  
  const stopLossDistance = Math.abs(testCase.entryPrice - testCase.stopLossPrice) / testCase.entryPrice * 100;
  
  console.log(`入场价: $${testCase.entryPrice}, 止损价: $${testCase.stopLossPrice}`);
  console.log(`  止损距离: ${stopLossDistance.toFixed(2)}%`);
  console.log(`  安全杠杆: ${safeLeverage}x`);
  console.log();
});