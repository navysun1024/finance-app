/**
 * 导出所有权益产品的持仓分布数据
 * 用于验证持仓穿透的准确性
 */

import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import http from 'http'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const db = new sqlite3.Database(path.join(__dirname, '../data/finance.db'))

// HTTP 请求函数
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

// 获取所有权益产品
function getEquityProducts() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM products WHERE type IN ('equity', 'fund') AND code IS NOT NULL",
      (err, rows) => err ? reject(err) : resolve(rows)
    )
  })
}

// 获取交易记录并计算市值
function calculateMarketValue(userId, productId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM transactions WHERE userId = ? AND productId = ?',
      [userId, productId],
      (err, rows) => {
        if (err) return reject(err)
        
        let totalShares = 0
        let totalCost = 0
        
        for (const tx of rows) {
          if (tx.type === 'buy') {
            totalShares += tx.shares
            totalCost += tx.shares * tx.price
          } else if (tx.type === 'sell') {
            totalShares -= tx.shares
            totalCost -= tx.shares * tx.price
          }
        }
        
        resolve({ totalShares, totalCost })
      }
    )
  })
}

// 获取持仓数据
async function getHoldings(code) {
  const url = `http://localhost:3002/fund/holdings/${code}`
  const res = await httpRequest(url)
  if (res.status === 200 && res.data.success) {
    return res.data.data
  }
  throw new Error(`获取 ${code} 持仓失败: ${res.data?.error || '未知错误'}`)
}

// 主函数
async function main() {
  console.log('=== 开始导出持仓数据 ===\n')
  
  // 1. 获取所有权益产品
  const products = await getEquityProducts()
  console.log(`找到 ${products.length} 个权益产品`)
  
  // 按 userId 分组
  const userProducts = {}
  for (const p of products) {
    if (!userProducts[p.userId]) userProducts[p.userId] = []
    userProducts[p.userId].push(p)
  }
  
  const results = []
  
  for (const [userId, userProds] of Object.entries(userProducts)) {
    console.log(`\n处理用户 ${userId} 的 ${userProds.length} 个产品...`)
    
    for (const product of userProds) {
      try {
        // 计算市值
        const { totalShares } = await calculateMarketValue(userId, product.id)
        if (totalShares <= 0) {
          console.log(`  跳过 ${product.code} ${product.name} (无持仓)`)
          continue
        }
        
        console.log(`  获取 ${product.code} ${product.name} 的持仓数据...`)
        
        // 获取持仓
        const holdings = await getHoldings(product.code)
        
        results.push({
          code: product.code,
          name: product.name,
          type: product.type,
          totalShares,
          assetAllocation: holdings.assetAllocation,
          stocks: holdings.stocks,
          reportDate: holdings.reportDate,
          dataSource: holdings.dataSource
        })
        
        // 避免请求过快
        await new Promise(r => setTimeout(r, 100))
      } catch (e) {
        console.log(`  ❌ ${product.code} ${product.name}: ${e.message}`)
        results.push({
          code: product.code,
          name: product.name,
          type: product.type,
          error: e.message
        })
      }
    }
  }
  
  // 2. 生成汇总接口参数
  const fundParams = []
  for (const r of results) {
    if (r.assetAllocation) {
      // 需要市值来计算权重，这里用份额作为近似值
      fundParams.push(`${r.code}:${r.totalShares}`)
    }
  }
  
  // 3. 获取汇总数据
  console.log(`\n获取汇总数据 (${fundParams.length} 只基金)...`)
  let aggregatedData = null
  try {
    const url = `http://localhost:3002/equity/aggregated-holdings?funds=${encodeURIComponent(fundParams.join(','))}`
    const res = await httpRequest(url)
    if (res.status === 200 && res.data.success) {
      aggregatedData = res.data.data
      console.log('✓ 汇总数据获取成功')
    } else {
      console.log('❌ 汇总接口返回错误:', res.data?.error)
    }
  } catch (e) {
    console.log('❌ 汇总接口请求失败:', e.message)
  }
  
  // 4. 导出为 JSON
  const exportData = {
    exportTime: new Date().toISOString(),
    individualHoldings: results,
    aggregatedHoldings: aggregatedData
  }
  
  const outputPath = path.join(__dirname, '../holdings_export.json')
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8')
  console.log(`\n✓ 数据已导出到: ${outputPath}`)
  
  // 5. 导出 CSV
  const csvLines = ['代码,名称,类型,份额,股票占比,债券占比,现金占比,报告日期,错误']
  for (const r of results) {
    if (r.error) {
      csvLines.push(`${r.code},${r.name},${r.type},${r.totalShares},,,,,,${r.error}`)
    } else if (r.assetAllocation) {
      csvLines.push(`${r.code},${r.name},${r.type},${r.totalShares},${r.assetAllocation.stockRatio || ''},${r.assetAllocation.bondRatio || ''},${r.assetAllocation.cashRatio || ''},${r.reportDate || ''},`)
    }
  }
  
  const csvPath = path.join(__dirname, '../holdings_export.csv')
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8')
  console.log(`✓ CSV 已导出到: ${csvPath}`)
  
  // 6. 打印汇总结果
  console.log('\n=== 持仓数据汇总 ===')
  if (aggregatedData) {
    const aa = aggregatedData.assetAllocation || {}
    console.log(`基金数量: ${aggregatedData.fundCount}`)
    console.log(`股票数量: ${aggregatedData.stocks?.length || 0}`)
    console.log(`资产配置:`)
    console.log(`  股票: ${aa.stockRatio?.toFixed(2) || 0}%`)
    console.log(`  债券: ${aa.bondRatio?.toFixed(2) || 0}%`)
    console.log(`  现金: ${aa.cashRatio?.toFixed(2) || 0}%`)
    console.log(`  其他: ${aa.otherRatio?.toFixed(2) || 0}%`)
    console.log(`  合计: ${((aa.stockRatio || 0) + (aa.bondRatio || 0) + (aa.cashRatio || 0) + (aa.otherRatio || 0)).toFixed(2)}%`)
    
    console.log('\n前10大重仓股:')
    ;(aggregatedData.stocks || []).slice(0, 10).forEach((s, i) => {
      console.log(`  ${i+1}. ${s.name}(${s.code}): ${s.ratio?.toFixed(2)}%`)
    })
  }
  
  db.close()
}

main().catch(console.error)
