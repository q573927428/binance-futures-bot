// 测试时间戳逻辑
console.log('测试K线时间戳逻辑...\n');

// 假设最后一条K线的时间戳（秒）
const lastTimestamp = 1743328800; // 2025-03-30 18:00:00

console.log('最后一条K线时间戳（秒）:', lastTimestamp);
console.log('对应时间:', new Date(lastTimestamp * 1000).toLocaleString('zh-CN'));
console.log('对应毫秒:', lastTimestamp * 1000);

console.log('\n不同方案对比:');
console.log('1. lastTimestamp + 1 (秒):', lastTimestamp + 1);
console.log('   毫秒:', (lastTimestamp + 1) * 1000);
console.log('   时间:', new Date((lastTimestamp + 1) * 1000).toLocaleString('zh-CN'));

console.log('\n2. lastTimestamp * 1000 + 1 (毫秒):', lastTimestamp * 1000 + 1);
console.log('   时间:', new Date(lastTimestamp * 1000 + 1).toLocaleString('zh-CN'));

console.log('\n3. lastTimestamp * 1000 + 1000 (毫秒):', lastTimestamp * 1000 + 1000);
console.log('   时间:', new Date(lastTimestamp * 1000 + 1000).toLocaleString('zh-CN'));

console.log('\n4. (lastTimestamp + 1) * 1000 (毫秒):', (lastTimestamp + 1) * 1000);
console.log('   时间:', new Date((lastTimestamp + 1) * 1000).toLocaleString('zh-CN'));

console.log('\nBinance K线时间戳示例:');
console.log('18:00:00 K线:', lastTimestamp * 1000, '毫秒');
console.log('19:00:00 K线:', (lastTimestamp + 3600) * 1000, '毫秒');

console.log('\n分析:');
console.log('如果使用方案1或4: startTime =', (lastTimestamp + 1) * 1000);
console.log('Binance API返回时间戳 >=', (lastTimestamp + 1) * 1000, '的数据');
console.log('18:00:00 K线时间戳 =', lastTimestamp * 1000, '(小于startTime，不会返回)');
console.log('19:00:00 K线时间戳 =', (lastTimestamp + 3600) * 1000, '(大于startTime，会返回)');
console.log('结果: 跳过18:00:00 K线，获取19:00:00及之后的K线');

console.log('\n但问题是: 如果18:00:00 K线已经存在，我们需要的是19:00:00及之后的K线');
console.log('所以跳过18:00:00是正确的！');

console.log('\n真正的数据缺口问题可能是:');
console.log('1. 如果因为网络问题或其他原因，18:00:00 K线没有保存成功');
console.log('2. 但lastTimestamp仍然是17:00:00的时间戳');
console.log('3. 那么使用lastTimestamp + 1会跳过18:00:00，导致永久缺口');

console.log('\n解决方案:');
console.log('1. 更智能的数据验证：检查时间间隔是否连续');
console.log('2. 数据补全机制：如果发现缺口，重新获取缺失的数据');
console.log('3. 使用更宽松的startTime：比如lastTimestamp * 1000，然后过滤重复数据');