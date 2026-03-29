# 简单K线数据存储方案

## 设计原则
1. 每个交易对每个周期一个文件
2. 每个文件最多保存10000条K线数据
3. 前端直接读取整个文件
4. 不兼容旧版本，全新实现

## 文件结构
```
data/kline/
├── BTCUSDT-1h.json      # BTCUSDT 1小时K线数据
├── BTCUSDT-15m.json     # BTCUSDT 15分钟K线数据
├── BTCUSDT-4h.json      # BTCUSDT 4小时K线数据
├── BTCUSDT-1d.json      # BTCUSDT 日K线数据
├── BTCUSDT-1w.json      # BTCUSDT 周K线数据
├── ETHUSDT-1h.json      # ETHUSDT 1小时K线数据
└── ETHUSDT-15m.json     # ETHUSDT 15分钟K线数据
```

## 数据格式
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "data": [
    {
      "t": 1763978400,    // timestamp 时间戳（秒）
      "o": 85913.8,       // open 开盘价
      "h": 86164.7,       // high 最高价
      "l": 85654.1,       // low 最低价
      "c": 86017.1,       // close 收盘价
      "v": 6800.987       // volume 成交量
    }
  ],
  "meta": {
    "first": 1763978400,  // 第一条数据时间戳
    "last": 1767193200,   // 最后一条数据时间戳
    "count": 894,         // 当前数据条数
    "max": 10000,         // 最大数据条数
    "updated": 1774776037 // 最后更新时间戳
  }
}
```

## 实现方案

### 1. 新的存储工具 (server/utils/kline-simple-storage.ts)
- 极简实现，只处理单文件
- 自动限制10000条数据
- 按时间戳排序和去重

### 2. 新的API接口 (server/api/kline-simple/index.ts)
- 直接读取文件返回数据
- 支持分页和过滤
- 简单高效

### 3. 新的同步服务 (server/modules/kline-simple-sync/index.ts)
- 从Binance获取数据
- 保存到单文件格式
- 自动清理旧数据

### 4. 前端适配 (app/components/KLineChartSimple.vue)
- 使用新的API
- 直接加载所有数据
- 简化无限滚动逻辑

## 优势
1. 读取速度快：单个文件读取
2. 管理简单：文件数量少
3. 内存友好：前端加载可控数据量
4. 维护容易：代码简洁

## 实现步骤
1. 创建新的类型定义
2. 实现存储工具
3. 实现API接口
4. 实现同步服务
5. 创建前端组件
6. 迁移现有数据（可选）

## 注意
- 不兼容旧版本，全新实现
- 现有数据需要迁移或重新同步
- 可以并行运行，逐步切换