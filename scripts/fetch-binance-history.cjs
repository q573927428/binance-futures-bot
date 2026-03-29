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
    
    let url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
    
    if (startTime) {
      url += `&startTime=${startTime * 1000}`;
    }
    
    if (endTime) {
      url += `&endTime=${endTime * 1000}`;
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

// 批量获取历史数据
async function fetchHistoryData(symbol, timeframe, totalBars = 22000, batchSize = 1000) {
  console.log(`🚀 开始从币安获取历史数据: ${symbol}/${timeframe}`);
  console.log(`目标: ${totalBars} 条数据，批次大小: ${batchSize}`);
  
  // 计算开始时间：从当前时间往前推，获取历史数据
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = getIntervalSeconds(timeframe);
  const totalSeconds = totalBars * intervalSeconds;
  const startTimestamp = now - totalSeconds;
  
  let currentStartTime = startTimestamp;
  let fetchedBars = 0;
  let batches = 0;
  const allData = [];
  
  const startTime = Date.now();
  
  try {
    while (fetchedBars < totalBars) {
      const remaining = totalBars - fetchedBars;
      const currentBatchSize = Math.min(batchSize, remaining);
      
      console.log(`\n📦 获取批次 ${batches + 1}: ${symbol}/${timeframe}`);
      console.log(`   开始时间: ${new Date(currentStartTime * 1000).toLocaleString()}`);
      console.log(`   批次大小: ${currentBatchSize}`);
      
      // 计算结束时间（当前批次）
      const batchEndTime = currentStartTime + (currentBatchSize * intervalSeconds);
      
      const batchData = await fetchKLineFromBinance(
        symbol, 
        timeframe, 
        currentStartTime * 1000, // 转换为毫秒
        batchEndTime * 1000,     // 转换为毫秒
        currentBatchSize
      );
      
      if (batchData.length === 0) {
        console.log('⚠️  没有更多数据可获取');
        break;
      }
      
      allData.push(...batchData);
      fetchedBars += batchData.length;
      batches++;
      
      // 更新进度
      const progress = Math.round((fetchedBars / totalBars) * 100);
      console.log(`   ✅ 获取成功: ${batchData.length} 条数据`);
      console.log(`   📊 总进度: ${fetchedBars}/${totalBars} (${progress}%)`);
      
      // 更新下一个批次的开始时间
      const lastItem = batchData[batchData.length - 1];
      if (lastItem) {
        currentStartTime = lastItem.timestamp + 1;
        console.log(`   ⏰ 下一个批次开始时间: ${new Date(currentStartTime * 1000).toLocaleString()}`);
      } else {
        console.log('⚠️  批次数据为空，停止获取');
        break;
      }
      
      // 避免请求过于频繁
      if (fetchedBars < totalBars) {
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
        duration
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
        duration: (Date.now() - startTime) / 1000
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
      error: error.message
    };
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('🚀 币安历史K线数据获取工具');
  console.log('========================================\n');
  
  const symbol = 'BTCUSDT';
  const timeframe = '1h';
  const totalBars = 22000;
  const batchSize = 1000;
  
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