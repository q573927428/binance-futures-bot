import fs from "fs"

const input = "./data/strategy-analysis.json"
const output = "./test/trade-history.pine"

const trades = JSON.parse(fs.readFileSync(input, "utf8"))

const openTimes = []
const closeTimes = []

const entryPrices = []
const exitPrices = []

const stopLoss = []
const tp1 = []
const tp2 = []

const directions = []
const symbols = []
const pnl = []
const leverage = []
const entryRSIs = []
const entryADXs = []
const averageATRs = []
const exitReasons = []

for (const t of trades) {

  openTimes.push(t.openTime)
  closeTimes.push(t.closeTime)

  entryPrices.push(t.entryPrice)
  exitPrices.push(t.exitPrice)

  stopLoss.push(t.stopLossPrice)
  tp1.push(t.takeProfit1Price)
  tp2.push(t.takeProfit2Price)

  directions.push(`"${t.direction}"`)
  symbols.push(`"${t.symbol}"`)

  pnl.push(t.pnlPercentage.toFixed(2))

  leverage.push(t.actualLeverage)
  
  // 添加新字段
  entryRSIs.push(t.entryRSI || 0)
  entryADXs.push(t.entryADX15m || 0)
  averageATRs.push(t.averageATR || 0)
  exitReasons.push(`"${t.exitReason || 'N/A'}"`)
}

const pine = `//@version=6
indicator("Trade History Dashboard", overlay=true, max_labels_count=500, max_lines_count=500)

var int[] openTimes = array.from(${openTimes.join(",")})
var int[] closeTimes = array.from(${closeTimes.join(",")})

var float[] entryPrices = array.from(${entryPrices.join(",")})
var float[] exitPrices = array.from(${exitPrices.join(",")})

var float[] stopLoss = array.from(${stopLoss.join(",")})
var float[] tp1 = array.from(${tp1.join(",")})
var float[] tp2 = array.from(${tp2.join(",")})

var string[] directions = array.from(${directions.join(",")})
var string[] symbols = array.from(${symbols.join(",")})
var float[] pnl = array.from(${pnl.join(",")})

var int[] leverage = array.from(${leverage.join(",")})
var float[] entryRSIs = array.from(${entryRSIs.join(",")})
var float[] entryADXs = array.from(${entryADXs.join(",")})
var float[] averageATRs = array.from(${averageATRs.join(",")})
var string[] exitReasons = array.from(${exitReasons.join(",")})

for i = 0 to array.size(openTimes) - 1

    openTime = array.get(openTimes, i)
    closeTime = array.get(closeTimes, i)

    entryPrice = array.get(entryPrices, i)
    exitPrice = array.get(exitPrices, i)

    sl = array.get(stopLoss, i)
    t1 = array.get(tp1, i)
    t2 = array.get(tp2, i)

    dir = array.get(directions, i)
    sym = array.get(symbols, i)
    lev = array.get(leverage, i)
    p = array.get(pnl, i)
    
    // 获取新字段
    entryRSI = array.get(entryRSIs, i)
    entryADX = array.get(entryADXs, i)
    avgATR = array.get(averageATRs, i)
    exitReason = array.get(exitReasons, i)

    tf = timeframe.in_seconds() * 1000
    openCond =openTime >= time and openTime < time + tf
    closeCond =closeTime >= time and closeTime < time + tf

    if openCond

        label.new(
            bar_index,
            entryPrice,
            sym + "\\n" +
            dir + " 开仓" + "\\n" +
            "价格: " + str.tostring(entryPrice) + "\\n" +
            "Lev: " + str.tostring(lev) + "\\n" +
            "RSI: " + str.tostring(entryRSI, "#.##") + "\\n" +
            "ADX: " + str.tostring(entryADX, "#.##") + "\\n" +
            "ATR: " + str.tostring(avgATR, "#.##"),
            style = dir == "LONG" ? label.style_label_up : label.style_label_down,
            color = dir == "LONG" ? color.green : color.red,
            textcolor = color.white,
            size = size.small
        )

        // line.new(bar_index, entryPrice, bar_index, sl, color=color.red, width=1)
        // line.new(bar_index, entryPrice, bar_index, t1, color=color.green, width=1)
        // line.new(bar_index, entryPrice, bar_index, t2, color=color.green, width=1)

    if closeCond
        
        label.new(
            bar_index,
            exitPrice,
            sym + "\\n平仓\\n" +
            "价格: " + str.tostring(exitPrice) + "\\n" +
            "PnL: " + str.tostring(p) + "%\\n" +
            exitReason,
            style = label.style_label_left,
            color = color.yellow,
            textcolor = p > 0 ? color.green : color.red,
            size = size.small
        )

        // line.new(bar_index, entryPrice, bar_index, exitPrice, color=color.blue, width=2)
`

fs.writeFileSync(output, pine)

console.log("Pine Script 已生成 ->", output)