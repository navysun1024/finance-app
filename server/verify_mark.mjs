import * as echarts from 'echarts'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pkg = require('echarts/package.json')
console.log('echarts version:', pkg.version)

// 模拟 005698 的净值数据 + 4个买入点
const buys = [
  [new Date('2026-06-26').getTime(), 1.2345],
  [new Date('2026-06-29').getTime(), 1.2400],
  [new Date('2026-07-01').getTime(), 1.2510],
  [new Date('2026-07-13').getTime(), 1.2650],
]
const series = []
let t = new Date('2026-06-20').getTime()
const day = 24 * 60 * 60 * 1000
for (let i = 0; i < 30; i++) {
  series.push([t, 1.2 + i * 0.002])
  t += day
}
const markPointData = buys.map(b => ({ coord: b, value: '买入', symbol: 'circle', symbolSize: 8, itemStyle: { color: '#3b82f6' } }))

const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 400 })
chart.setOption({
  xAxis: { type: 'time' },
  yAxis: { type: 'value' },
  series: [{
    type: 'line',
    data: series,
    showSymbol: false,
    markPoint: { symbolKeepAspect: true, data: markPointData }
  }]
})
const svg = chart.renderToSVGString()
chart.dispose()
const svgLines = svg.split('\n').filter(l => l.includes('circle') || l.includes('path'))
console.log('SVG 标记相关图形数量:', svgLines.length)
console.log('输出SVG总行数:', svg.split('\n').length)
console.log('前20行标记:', svgLines.slice(0, 20).join('\n'))