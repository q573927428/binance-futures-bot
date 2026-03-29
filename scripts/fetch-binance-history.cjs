#!/usr/bin/env node

/**
 * 从币安获取历史K线数据脚本
 * 这个脚本用于从币安获取22000条历史K线数据
 */

// 由于TypeScript导入问题，我们直接实现核心功能
const fs = require('fs');
const path = require('path');
const https = require('https');

// 数据目录
const DATA_DIR = path.join(__dirname, '../data/kline-simple');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 获取时间间隔秒数
function getIntervalSeconds(timeframe) {
  switch (timeframe) {
    case '15m': return 15 * 60;
    case '1h': return 60 * 60;
    case '4h': return 4 * 60 * 60;
    case '1d': return 24 * 60 * 60;
    case '1w': return 7 * 24 * 60 * 60;
    default: return 60 * 60;
  }
}

// 获取合约信息，包括上线时间
async function getSymbolInfo(symbol) {
  return new Promise((resolve, reject) => {
    https.get('https://fapi.binance.com/fapi/v1/exchangeInfo', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const symbolInfo = json.symbols.find(s => s.symbol === symbol)
          
          if (!symbolInfo) {
            resolve(null) // 合约不存在
          } else {
            resolve({
              exists: true,
              symbol: symbolInfo.symbol,
              status: symbolInfo.status,
              onboardDate: symbolInfo.onboardDate, // 上线时间（毫秒）
              onboardTimestamp: Math.floor(symbolInfo.onboardDate / 1000), // 转换为秒
              baseAsset: symbolInfo.baseAsset,
              quoteAsset: symbolInfo.quoteAsset
            })
          }
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', (error) => {
      reject(error)
    })
  })
}

// 检查合约是否存在
async function checkSymbol(symbol) {
  const info = await getSymbolInfo(symbol)
  return info ? info.exists : false
}

// 从币安获取K线数据
async function fetchKLineFromBinance(symbol, timeframe, startTime, endTime, limit = 1000) {
  return new Promise((resolve, reject) => {
    // 时间间隔映射
    const intervalMap = {
      '15m': '15m',
      '1h': '1h', 
      '4h': '4h',
      '1d': '1d',
      '1w': '1w'
    };

    const interval = intervalMap[timeframe];
    const binanceSymbol = symbol.replace('/', '');
    
    let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
    // https://fapi.binance.com/fapi/v1/klines  合约
    // https://api.binance.com/api/v3/klines  现货
    
    if (startTime) {
      url += `&startTime=${startTime}`;
    }
    
    if (endTime) {
      url += `&endTime=${endTime}`;
    }
    
    console.log(`请求URL: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }
          
          const jsonData = JSON.parse(data);
          
          // 解析数据
          const klineData = jsonData.map((item) => ({
            timestamp: Math.floor(item[0] / 1000), // 转换为秒
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5])
          }));
          
          resolve(klineData);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// 追加K线数据到文件
function appendSimpleKLineData(symbol, timeframe, newData) {
  try {
    const normalizedSymbol = symbol.replace('/', '');
    const fileName = `${normalizedSymbol}-${timeframe}.json`;
    const filePath = path.join(DATA_DIR, fileName);
    
    // 读取现有数据
    let existingData = [];
    let meta = {
      first: 0,
      last: 0,
      count: 0,
      max: 20000,
      updated: Math.floor(Date.now() / 1000)
    };
    
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const fileData = JSON.parse(fileContent);
      
      // 转换回完整格式
      existingData = fileData.data.map(item => ({
        timestamp: item.t,
        open: item.o,
        high: item.h,
        low: item.l,
        close: item.c,
        volume: item.v
      }));
      
      meta = fileData.meta;
    }
    
    // 合并数据
    const allData = [...existingData, ...newData];
    
    // 按时间戳排序
    const sortedData = [...allData].sort((a, b) => a.timestamp - b.timestamp);
    
    // 去重（基于时间戳）
    const uniqueData = [];
    const seenTimestamps = new Set();
    
    for (const item of sortedData) {
      if (!seenTimestamps.has(item.timestamp)) {
        seenTimestamps.add(item.timestamp);
        uniqueData.push(item);
      }
    }
    
    // 限制最多22000条数据
    const limitedData = uniqueData.slice(-22000);
    
    // 转换为简化格式
    const simpleData = limitedData.map(item => ({
      t: item.timestamp,
      o: item.open,
      h: item.high,
      l: item.low,
      c: item.close,
      v: item.volume
    }));
    
    // 更新元数据
    meta = {
      first: limitedData[0]?.timestamp || 0,
      last: limitedData[limitedData.length - 1]?.timestamp || 0,
      count: limitedData.length,
      max: 22000,
      updated: Math.floor(Date.now() / 1000)
    };
    
    const fileData = {
      symbol: normalizedSymbol,
      timeframe,
      data: simpleData,
      meta
    };
    
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
    
    return true;
  } catch (error) {
    console.error(`保存数据失败: ${symbol}/${timeframe}`, error);
    return false;
  }
}

// 批量获取历史数据（优化版，支持新上合约）
async function fetchHistoryData(symbol, timeframe, totalBars = 22000, batchSize = 1000) {
  console.log(`🚀 开始从币安获取历史数据: ${symbol}/${timeframe}`);
  console.log(`目标: ${totalBars} 条数据，批次大小: ${batchSize}`);
  
  // 1. 先获取合约信息，包括上线时间
  console.log(`\n🔍 获取合约信息...`);
  const symbolInfo = await getSymbolInfo(symbol);
  
  if (!symbolInfo) {
    console.log(`❌ 合约 ${symbol} 不存在`);
    return {
      success: false,
      message: `合约 ${symbol} 不存在`,
      symbol,
      timeframe,
      totalBars: 0,
      batches: 0,
      duration: 0
    };
  }
  
  console.log(`   ✅ 合约状态: ${symbolInfo.status}`);
  console.log(`   📅 上线时间: ${new Date(symbolInfo.onboardDate).toLocaleString()}`);
  
  // 2. 计算实际可获取的时间范围
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = getIntervalSeconds(timeframe);
  const totalSeconds = totalBars * intervalSeconds;
  
  // 合约上线时间（秒）
  const onboardTimestamp = symbolInfo.onboardTimestamp;
  
  // 计算理论开始时间（从当前时间往前推）
  const theoreticalStartTimestamp = now - totalSeconds;
  
  // 实际开始时间：取理论开始时间和上线时间的较大值（不能早于上线时间）
  const actualStartTimestamp = Math.max(theoreticalStartTimestamp, onboardTimestamp);
  
  console.log(`\n📊 时间范围分析:`);
  console.log(`   当前时间: ${new Date(now * 1000).toLocaleString()}`);
  console.log(`   理论开始时间: ${new Date(theoreticalStartTimestamp * 1000).toLocaleString()}`);
  console.log(`   实际上线时间: ${new Date(onboardTimestamp * 1000).toLocaleString()}`);
  console.log(`   实际开始时间: ${new Date(actualStartTimestamp * 1000).toLocaleString()}`);
  
  // 3. 计算实际可获取的数据量
  const availableSeconds = now - actualStartTimestamp;
  const maxAvailableBars = Math.floor(availableSeconds / intervalSeconds);
  const actualTargetBars = Math.min(totalBars, maxAvailableBars);
  
  console.log(`\n📈 数据量分析:`);
  console.log(`   目标数据量: ${totalBars} 条`);
  console.log(`   最大可获取数据量: ${maxAvailableBars} 条`);
  console.log(`   实际目标数据量: ${actualTargetBars} 条`);
  
  if (actualTargetBars <= 0) {
    console.log(`❌ 合约上线时间太短，无法获取任何数据`);
    return {
      success: false,
      message: `合约上线时间太短，无法获取任何数据`,
      symbol,
      timeframe,
      totalBars: 0,
      batches: 0,
      duration: 0
    };
  }
  
  if (actualTargetBars < totalBars) {
    console.log(`⚠️  注意：合约上线时间较短，只能获取 ${actualTargetBars} 条数据（原目标: ${totalBars} 条）`);
  }
  
  let currentStartTime = actualStartTimestamp;
  let fetchedBars = 0;
  let batches = 0;
  const allData = [];
  let consecutiveEmptyBatches = 0;
  const maxConsecutiveEmptyBatches = 3;
  
  const startTime = Date.now();
  
  try {
    while (fetchedBars < actualTargetBars && consecutiveEmptyBatches < maxConsecutiveEmptyBatches) {
      const remaining = actualTargetBars - fetchedBars;
      const currentBatchSize = Math.min(batchSize, remaining);
      
      console.log(`\n📦 获取批次 ${batches + 1}: ${symbol}/${timeframe}`);
      console.log(`   开始时间: ${new Date(currentStartTime * 1000).toLocaleString()}`);
      console.log(`   批次大小: ${currentBatchSize}`);
      
      // 计算结束时间（当前批次）
      const batchEndTime = currentStartTime + (currentBatchSize * intervalSeconds);
      
      try {
        const batchData = await fetchKLineFromBinance(
          symbol, 
          timeframe, 
          currentStartTime * 1000, // 转换为毫秒
          batchEndTime * 1000,     // 转换为毫秒
          currentBatchSize
        );
        
        if (batchData.length === 0) {
          console.log('⚠️  批次返回空数据');
          consecutiveEmptyBatches++;
          
          // 如果连续返回空数据，尝试调整时间范围
          if (consecutiveEmptyBatches >= maxConsecutiveEmptyBatches) {
            console.log(`⚠️  连续 ${maxConsecutiveEmptyBatches} 个批次返回空数据，停止获取`);
            break;
          }
          
          // 跳过一段时间继续尝试
          currentStartTime = batchEndTime + 1;
          console.log(`   ⏰ 跳过空数据区间，下一个开始时间: ${new Date(currentStartTime * 1000).toLocaleString()}`);
        } else {
          consecutiveEmptyBatches = 0; // 重置连续空批次计数
          allData.push(...batchData);
          fetchedBars += batchData.length;
          batches++;
          
          // 更新进度
          const progress = Math.round((fetchedBars / actualTargetBars) * 100);
          console.log(`   ✅ 获取成功: ${batchData.length} 条数据`);
          console.log(`   📊 总进度: ${fetchedBars}/${actualTargetBars} (${progress}%)`);
          
          // 更新下一个批次的开始时间
          const lastItem = batchData[batchData.length - 1];
          if (lastItem) {
            currentStartTime = lastItem.timestamp + intervalSeconds;
            console.log(`   ⏰ 下一个批次开始时间: ${new Date(currentStartTime * 1000).toLocaleString()}`);
          } else {
            console.log('⚠️  批次数据异常，停止获取');
            break;
          }
        }
      } catch (batchError) {
        console.log(`⚠️  批次获取失败: ${batchError.message}`);
        consecutiveEmptyBatches++;
        
        if (consecutiveEmptyBatches >= maxConsecutiveEmptyBatches) {
          console.log(`⚠️  连续 ${maxConsecutiveEmptyBatches} 个批次失败，停止获取`);
          break;
        }
        
        // 跳过一段时间继续尝试
        currentStartTime = batchEndTime + 1;
        console.log(`   ⏰ 跳过失败区间，下一个开始时间: ${new Date(currentStartTime * 1000).toLocaleString()}`);
      }
      
      // 避免请求过于频繁
      if (fetchedBars < actualTargetBars && consecutiveEmptyBatches < maxConsecutiveEmptyBatches) {
        console.log('   ⏳ 等待200ms后继续...');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // 保存所有数据
    if (allData.length > 0) {
      console.log(`\n💾 保存数据到文件...`);
      const success = appendSimpleKLineData(symbol, timeframe, allData);
      
      if (!success) {
        throw new Error('保存数据失败');
      }
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`\n🎉 历史数据获取完成!`);
      console.log(`========================================`);
      console.log(`📈 交易对: ${symbol}`);
      console.log(`⏰ 时间周期: ${timeframe}`);
      console.log(`📊 获取数据: ${allData.length} 条`);
      console.log(`🔄 批次数量: ${batches} 个`);
      console.log(`⏱️  总耗时: ${duration.toFixed(2)} 秒`);
      console.log(`📁 文件位置: data/kline-simple/${symbol.replace('/', '')}-${timeframe}.json`);
      console.log(`🌐 测试API: http://localhost:3001/api/kline-simple?symbol=${symbol}&timeframe=${timeframe}&limit=10`);
      console.log(`🖥️  前端页面: http://localhost:3001/kline-simple-test`);
      console.log(`========================================`);
      
      return {
        success: true,
        message: `获取完成，共获取 ${allData.length} 条数据`,
        symbol,
        timeframe,
        totalBars: allData.length,
        batches,
        duration,
        symbolInfo: {
          onboardDate: symbolInfo.onboardDate,
          status: symbolInfo.status
        }
      };
    } else {
      console.log('❌ 没有获取到任何数据');
      return {
        success: false,
        message: '没有获取到任何数据',
        symbol,
        timeframe,
        totalBars: 0,
        batches: 0,
        duration: (Date.now() - startTime) / 1000,
        symbolInfo: {
          onboardDate: symbolInfo.onboardDate,
          status: symbolInfo.status
        }
      };
    }
    
  } catch (error) {
    console.error(`❌ 获取历史数据失败:`, error);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    return {
      success: false,
      message: `获取失败: ${error.message}`,
      symbol,
      timeframe,
      totalBars: allData.length,
      batches,
      duration,
      error: error.message,
      symbolInfo: symbolInfo ? {
        onboardDate: symbolInfo.onboardDate,
        status: symbolInfo.status
      } : null
    };
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('🚀 币安历史K线数据获取工具');
  console.log('========================================\n');
  
  const symbol = 'XAGUSDT';
  const timeframe = '1h';
  const totalBars = 22000;
  const batchSize = 1000;

  // ⭐ 加在这里
  const exists = await checkSymbol(symbol)
  console.log('交易对是否存在:', exists)
  
  try {
    const result = await fetchHistoryData(symbol, timeframe, totalBars, batchSize);
    
    if (result.success) {
      console.log('\n✅ 脚本执行成功!');
      process.exit(0);
    } else {
      console.log('\n❌ 脚本执行失败!');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ 脚本执行出错:', error);
    process.exit(1);
  }
}

// 运行主函数
main();