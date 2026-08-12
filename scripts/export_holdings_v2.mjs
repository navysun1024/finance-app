/**
 * 导出所有权益产品的持仓分布数据（修复后版本）
 */

import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import http from 'http'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const db = new sqlite3.Database(path.join(__dirname, '../data/finance.db'))

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })
    req.on('error', reject)
    if (options.body) req.write(JSON.stringify(options.body))
    req.end()
  })
}

function getEquityProducts() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM products WHERE type IN ('equity', 'fund') AND code IS NOT NULL",
      (err, rows) => err ? reject(err) : resolve(rows)
    )
  })
}

function calculateMarketValue(userId, productId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM transactions WHERE userId = ? AND productId = ?',
      [userId, productId],
      (err, rows) => {
        if (err) return reject(err)
        let totalShares = 0
        for (const tx of rows) {
          if (tx.type === 'buy') totalShares += tx.shares
          else if (tx.type === 'sell') totalShares -= tx.shares
        }
        resolve(totalShares)
      }
    )
  })
}

async function main() {
  console.log('=== 开始导出持仓数据（修复后版本）===\n')
  
  const products = await getEquityProducts()
  console.log(`找到 ${products.length} 个权益产品`)
  
  const userProducts = {}
  for (const p of products) {
    if (!userProducts[p.userId]) userProducts[p.userId] = []
    userProducts[p.userId].push(p)
  }
  
  const results = []
  
  for (const [userId, userProds] of Object.entries(userProducts)) {
    for (const product of userProds) {
      try {
        const totalShares = await calculateMarketValue(userId, product.id)
        if (totalShares <= 0) continue
        
        console.log(`获取 ${product.code} ${product.name}...`)
        const res = await httpRequest(`http://localhost:3002/fund/holdings/${product.code}`)
        
        if (res.status === 200 && res.data.success) {
          const holdings = res.data.data
          results.push({
            code: product.code,
            name: product.name,
            type: product.type,
            totalShares,
            stockRatio: holdings.assetAllocation?.stockRatio ?? null,
            bondRatio: holdings.assetAllocation?.bondRatio ?? null,
            cashRatio: holdings.assetAllocation?.cashRatio ?? null,
            reportDate: holdings.reportDate,
            dataSource: holdings.dataSource,
            stocks: holdings.stocks || []
          })
        }
        await new Promise(r => setTimeout(r, 100))
      } catch (e) {
        console.log(`  ❌ ${product.code}: ${e.message}`)
      }
    }
  }
  
  console.log(`\n成功获取 ${results.length} 只基金的持仓数据`)
  
  // 准备汇总接口参数
  const fundParams = results.map(r => `${r.code}:${r.totalShares}`).join(',')
  
  // 获取修复后的汇总数据
  console.log('获取修复后的汇总数据...')
  const aggRes = await httpRequest(`http://localhost:3002/equity/aggregated-holdings?funds=${encodeURIComponent(fundParams)}`)
  let aggregatedData = null
  if (aggRes.status === 200 && aggRes.data.success) {
    aggregatedData = aggRes.data.data
    console.log('✓ 汇总数据获取成功')
  }
  
  // 生成验证报告
  console.log('\n========================================')
  console.log('  持仓穿透验证报告')
  console.log('========================================\n')
  
  console.log('一、各基金资产配置明细:')
  console.log('-'.repeat(90))
  console.log('代码     名称'.padEnd(32) + '股票%'.padStart(8) + '债券%'.padStart(8) + '现金%'.padStart(8) + '其他%'.padStart(8) + '合计'.padStart(8))
  console.log('-'.repeat(90))
  
  let totalWeightedStock = 0
  let totalWeightedBond = 0
  let totalWeightedCash = 0
  let totalMarketValue = 0
  
  for (const r of results) {
    const stock = r.stockRatio
    const bond = r.bondRatio
    const cash = r.cashRatio
    const valid = stock !== null && bond !== null && cash !== null
    
    if (valid) {
      const other = Math.max(0, 100 - stock - bond - cash)
      totalWeightedStock += stock * r.totalShares
      totalWeightedBond += bond * r.totalShares
      totalWeightedCash += cash * r.totalShares
      totalMarketValue += r.totalShares
      
      const name = r.name.length > 20 ? r.name.substring(0, 18) + '..' : r.name
      const total = stock + bond + cash + other
      console.log(
        r.code.padEnd(8) + ' ' +
        name.padEnd(32) +
        stock.toFixed(2).padStart(8) +
        bond.toFixed(2).padStart(8) +
        cash.toFixed(2).padStart(8) +
        other.toFixed(2).padStart(8) +
        total.toFixed(2).padStart(8)
      )
    } else {
      const name = r.name.length > 20 ? r.name.substring(0, 18) + '..' : r.name
      console.log(
        r.code.padEnd(8) + ' ' +
        name.padEnd(32) +
        (stock === null ? 'N/A' : stock.toFixed(2)).padStart(8) +
        (bond === null ? 'N/A' : bond.toFixed(2)).padStart(8) +
        (cash === null ? 'N/A' : cash.toFixed(2)).padStart(8) +
        '-'.padStart(8) +
        '-'.padStart(8)
      )
    }
  }
  
  console.log('-'.repeat(90))
  
  // 手工计算加权平均
  if (totalMarketValue > 0) {
    const avgStock = totalWeightedStock / totalMarketValue
    const avgBond = totalWeightedBond / totalMarketValue
    const avgCash = totalWeightedCash / totalMarketValue
    const avgOther = Math.max(0, 100 - avgStock - avgBond - avgCash)
    
    console.log('\n二、手工加权平均结果（基于有效数据）:')
    console.log('  股票: ' + avgStock.toFixed(2) + '%')
    console.log('  债券: ' + avgBond.toFixed(2) + '%')
    console.log('  现金: ' + avgCash.toFixed(2) + '%')
    console.log('  其他: ' + avgOther.toFixed(2) + '%')
    console.log('  合计: ' + (avgStock + avgBond + avgCash + avgOther).toFixed(2) + '%')
  }
  
  if (aggregatedData) {
    const aa = aggregatedData.assetAllocation || {}
    console.log('\n三、接口汇总结果:')
    console.log('  股票: ' + (aa.stockRatio || 0).toFixed(2) + '%')
    console.log('  债券: ' + (aa.bondRatio || 0).toFixed(2) + '%')
    console.log('  现金: ' + (aa.cashRatio || 0).toFixed(2) + '%')
    console.log('  其他: ' + (aa.otherRatio || 0).toFixed(2) + '%')
    total = (aa.stockRatio || 0) + (aa.bondRatio || 0) + (aa.cashRatio || 0) + (aa.otherRatio || 0)
    console.log('  合计: ' + total.toFixed(2) + '%')
  }
  
  console.log('\n四、持仓穿透 Top 15:')
  console.log('-'.repeat(60))
  if (aggregatedData && aggregatedData.stocks) {
    aggregatedData.stocks.slice(0, 15).forEach((s, i) => {
      console.log('  ' + (i+1).toString().padStart(2) + '. ' + s.name.padEnd(20) + s.code.padEnd(8) + (s.ratio || 0).toFixed(2) + '%')
    })
  }
  
  // 导出 JSON
  const exportData = {
    exportTime: new Date().toISOString(),
    individualHoldings: results.map(r => ({
      code: r.code,
      name: r.name,
      type: r.type,
      totalShares: r.totalShares,
      assetAllocation: {
        stockRatio: r.stockRatio,
        bondRatio: r.bondRatio,
        cashRatio: r.cashRatio
      },
      reportDate: r.reportDate,
      top5Stocks: r.stocks.slice(0, 5).map(s => ({ name: s.name, code: s.code, ratio: s.ratio }))
    })),
    aggregatedHoldings: aggregatedData,
    manualCalculation: totalMarketValue > 0 ? {
      totalMarketValue,
      allocationFundCount: results.filter(r => r.stockRatio !== null && r.bondRatio !== null && r.cashRatio !== null).length,
      weightedStockRatio: totalWeightedStock / totalMarketValue,
      weightedBondRatio: totalWeightedBond / totalMarketValue,
      weightedCashRatio: totalWeightedCash / totalMarketValue,
      weightedOtherRatio: Math.max(0, 100 - (totalWeightedStock / totalMarketValue) - (totalWeightedBond / totalMarketValue) - (totalWeightedCash / totalMarketValue))
    } : null
  }
  
  const outputPath = path.join(__dirname, '../holdings_export_v2.json')
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8')
  console.log('\n✓ 数据已导出到: ' + outputPath)
  
  db.close()
}

main().catch(console.error)
