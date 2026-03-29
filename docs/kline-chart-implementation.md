# K线图表实现文档

## 概述

本项目使用 **Lightweight Charts 5.1** 替代 TradingView 插件，实现了高性能的K线图表系统。系统支持无限历史数据加载、多时间周期、实时数据同步等功能。

## 核心特性

### 1. 数据存储方案
- **按年份分文件存储**: 每个交易对、每个时间周期的数据按年份存储为独立的JSON文件
- **缓存机制**: 最近2000条数据缓存在 `latest.json` 中，提高读取性能
- **数据去重**: 自动去重，避免重复数据
- **数据清理**: 自动清理旧数据，保持每个文件不超过30000条数据

### 2. 数据同步策略
- **增量同步**: 只同步最新数据，减少API调用
- **定时同步**: 可配置的定时同步任务（默认5分钟）
- **数据缺口检测**: 自动检测并补全数据缺口
- **并发控制**: 支持并发同步多个交易对

### 3. 前端图表组件
- **无限滚动**: 支持左移无限加载历史数据
- **多图表类型**: 蜡烛图、线图、面积图、柱状图
- **成交量显示**: 可选的成交量柱状图
- **响应式设计**: 支持移动端和桌面端
- **主题切换**: 深色/浅色主题

### 4. API接口
- **RESTful API**: 提供完整的K线数据管理接口
- **实时状态**: 监控数据同步状态
- **调度器控制**: 启动/停止定时同步任务

## 系统架构

```
├── types/kline.ts                    # TypeScript类型定义
├── server/utils/kline-storage.ts     # 数据存储工具
├── server/modules/kline-sync/        # 数据同步服务
│   ├── index.ts                      # 同步服务主逻辑
│   └── scheduler.ts                  # 定时调度器
├── server/api/                       # API接口
│   ├── kline/                        # K线数据API
│   └── kline-scheduler/              # 调度器控制API
├── app/components/KLineChart.vue     # 前端图表组件
└── app/pages/kline-test.vue          # 测试页面
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install lightweight-charts
```

### 2. 启动开发服务器

```bash
pnpm run dev
```

### 3. 访问测试页面

打开浏览器访问：`http://localhost:3000/kline-test`

### 4. 启动数据同步调度器

```bash
# 使用默认配置（5分钟同步一次）
node scripts/start-kline-sync.js

# 自定义同步间隔（例如：10分钟）
node scripts/start-kline-sync.js 600
```

## API文档

### K线数据API

#### 获取K线数据
```
GET /api/kline?symbol=BTC/USDT&timeframe=1h&limit=2000
```

参数：
- `symbol`: 交易对（必填）
- `timeframe`: 时间周期（15m, 1h, 4h, 1d, 1w）
- `limit`: 返回数据条数（默认2000）
- `from`: 开始时间戳（可选）
- `to`: 结束时间戳（可选）

#### 同步K线数据
```
POST /api/kline
{
  "action": "sync",
  "symbol": "BTC/USDT",
  "timeframe": "1h",
  "force": false
}
```

#### 获取同步状态
```
POST /api/kline
{
  "action": "status",
  "symbol": "BTC/USDT",
  "timeframe": "1h"
}
```

### 调度器控制API

#### 启动调度器
```
POST /api/kline-scheduler
{
  "action": "start",
  "intervalSeconds": 300
}
```

#### 停止调度器
```
POST /api/kline-scheduler
{
  "action": "stop"
}
```

#### 获取调度器状态
```
GET /api/kline-scheduler
```

#### 手动触发同步
```
POST /api/kline-scheduler
{
  "action": "trigger",
  "force": false
}
```

## 配置说明

### 交易对配置

系统从 `data/bot-config.json` 读取交易对配置：

```json
{
  "symbols": ["BTC/USDT", "ETH/USDT", "BNB/USDT"]
}
```

### K线同步配置

默认配置：
```typescript
{
  symbols: [],                    // 从bot-config.json读取
  timeframes: ['15m', '1h', '4h', '1d', '1w'],
  maxBarsPerFile: 30000,          // 每个文件最大数据条数
  maxTotalBars: 20000,            // 总数据条数限制
  syncInterval: 300,              // 同步间隔（秒）
  initialBars: 1600               // 初始加载数据条数
}
```

## 前端组件使用

### 基本用法

```vue
<template>
  <KLineChart
    symbol="BTC/USDT"
    timeframe="1h"
    :show-controls="true"
    :show-info="true"
    height="500px"
    :auto-load="true"
    :limit="2000"
    @chart-ready="handleChartReady"
    @chart-error="handleChartError"
    @timeframe-change="handleTimeframeChange"
  />
</template>

<script setup>
import KLineChart from '../components/KLineChart.vue'

function handleChartReady() {
  console.log('图表加载完成')
}

function handleChartError(error) {
  console.error('图表错误:', error)
}

function handleTimeframeChange(timeframe) {
  console.log('时间周期已更改:', timeframe)
}
</script>
```

### 组件属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| symbol | string | - | 交易对（必填） |
| timeframe | KLineTimeframe | '1h' | 时间周期 |
| show-controls | boolean | true | 显示控制栏 |
| show-info | boolean | true | 显示价格信息 |
| height | string | '500px' | 图表高度 |
| auto-load | boolean | true | 自动加载数据 |
| limit | number | 2000 | 数据条数限制 |

### 组件事件

| 事件 | 参数 | 说明 |
|------|------|------|
| chart-ready | - | 图表加载完成 |
| chart-error | error: string | 图表加载错误 |
| timeframe-change | timeframe: KLineTimeframe | 时间周期更改 |

### 组件方法

通过 `ref` 可以调用组件方法：

```vue
<template>
  <KLineChart ref="klineChartRef" />
  <button @click="refreshChart">刷新图表</button>
</template>

<script setup>
import { ref } from 'vue'
import KLineChart from '../components/KLineChart.vue'

const klineChartRef = ref()

function refreshChart() {
  if (klineChartRef.value) {
    klineChartRef.value.refreshChart()
  }
}
</script>
```

可用方法：
- `refreshChart()`: 刷新图表数据
- `initChart()`: 重新初始化图表
- `destroyChart()`: 销毁图表实例

## 无限历史数据加载

### 实现原理

系统使用 Lightweight Charts 的 `subscribeVisibleLogicalRangeChange` 方法监听可见范围变化。当用户向左滚动到图表边缘时，自动加载更早的历史数据。

### 配置参数

```typescript
// 在KLineChart组件中
const chartData = ref<LightweightChartData[]>([])
const hasMoreData = ref(true)
const lastLoadedTimestamp = ref<number | null>(null)

// 当可见范围变化时
chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
  if (logicalRange.from < 10) {
    // 加载更多数据
    loadMoreData()
  }
})
```

### 数据加载策略

1. **首次加载**: 加载最近2000条数据
2. **增量加载**: 每次加载2000条更早的数据
3. **数据合并**: 新数据插入到现有数据前面
4. **去重处理**: 基于时间戳自动去重

## 性能优化

### 1. 数据缓存
- 最近2000条数据缓存在内存中
- 按年份分文件存储，减少单文件大小
- 使用JSON格式，便于读取和写入

### 2. 网络优化
- 增量同步，只获取最新数据
- 并发控制，避免过多API请求
- 错误重试机制

### 3. 前端优化
- 虚拟滚动，只渲染可见区域
- 图表数据分页加载
- 防抖处理用户交互

### 4. 内存管理
- 自动清理旧数据
- 限制单文件数据条数
- 定期清理缓存

## 故障排除

### 常见问题

1. **图表不显示**
   - 检查网络连接
   - 确认API服务是否运行
   - 查看浏览器控制台错误

2. **数据不同步**
   - 检查调度器状态
   - 查看服务器日志
   - 确认Binance API密钥配置

3. **性能问题**
   - 减少同时显示的图表数量
   - 调整数据加载条数
   - 启用数据缓存

### 日志查看

```bash
# 查看服务器日志
pnpm run dev

# 查看调度器日志
node scripts/start-kline-sync.js
```

### 调试工具

1. **浏览器开发者工具**
   - Network标签：查看API请求
   - Console标签：查看错误信息
   - Performance标签：分析性能

2. **API测试工具**
   - 使用Postman测试API接口
   - 访问 `/api/kline-scheduler` 查看状态
   - 访问 `/api/kline` 测试数据获取

## 扩展开发

### 添加新的时间周期

1. 在 `types/kline.ts` 中添加时间周期类型
2. 在 `server/utils/kline-storage.ts` 中添加时间间隔配置
3. 在前端组件中添加选项

### 添加新的数据源

1. 实现新的数据服务类
2. 修改 `KLineSyncService` 支持多数据源
3. 更新API接口支持数据源选择

### 自定义图表样式

1. 修改 `KLineChart.vue` 中的样式
2. 调整Lightweight Charts配置
3. 添加新的图表主题

## 部署说明

### 生产环境配置

1. **数据存储**
   ```bash
   # 确保数据目录可写
   chmod -R 755 data/kline
   ```

2. **进程管理**
   ```bash
   # 使用PM2管理进程
   pm2 start scripts/start-kline-sync.js --name kline-sync
   pm2 start pnpm --name binance-bot -- run dev
   ```

3. **监控告警**
   - 监控API响应时间
   - 监控数据同步状态
   - 设置磁盘空间告警

### 备份策略

1. **数据备份**
   ```bash
   # 备份K线数据
   tar -czf kline-backup-$(date +%Y%m%d).tar.gz data/kline/
   ```

2. **配置备份**
   ```bash
   # 备份配置文件
   cp data/bot-config.json data/bot-config.json.backup
   ```

## 版本历史

### v1.0.0 (2026-03-29)
- 初始版本发布
- 基于Lightweight Charts 5.1
- 支持无限历史数据加载
- 完整的K线数据同步系统
- 响应式前端组件

## 技术支持

如有问题，请：
1. 查看本文档
2. 检查服务器日志
3. 提交Issue到项目仓库
4. 联系开发团队