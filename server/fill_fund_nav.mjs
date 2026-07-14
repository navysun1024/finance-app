import sqlite3 from 'sqlite3'
import https from 'https'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '../data/finance.db')

const db = new sqlite3.Database(dbPath)

function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  console.log(`[${ts}] [${level}] ${msg}`)
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000, ...options }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, data }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
  })
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => err ? reject(err) : resolve())
  })
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/** 获取某天零点时间戳 */
function getDateOnly(ts) {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 从东方财富获取基金全部历史净值 */
async function fetchFundHistory(fundCode) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`
  const { status, data: text } = await httpRequest(url, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  if (status !== 200 || !text || text.length < 100) {
    throw new Error(`基金 ${fundCode} 数据获取失败 (HTTP ${status})`)
  }

  const trendMatch = text.match(/var Data_netWorthTrend\s*=\s*(\[[\s\S]+?\]);/)
  if (!trendMatch) {
    throw new Error(`基金 ${fundCode} 净值数据解析失败`)
  }

  const trendData = JSON.parse(trendMatch[1])
  if (!trendData || trendData.length === 0) {
    throw new Error(`基金 ${fundCode} 暂无净值数据`)
  }

  // 返回 [{timestamp, nav, dateStr}] 格式
  return trendData.map(item => {
    const d = new Date(item.x)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      timestamp: getDateOnly(item.x),
      nav: item.y,
      dateStr
    }
  })
}

async function main() {
  log('=== 开始补全基金历史净值数据 ===')

  // 1. 查询所有基金产品及其最早买入日期
  const funds = await queryAll(`
    SELECT p.id as productId, p.userId, p.name, p.code,
           MIN(CASE WHEN t.type = 'buy' THEN t.date END) as firstBuyDate
    FROM products p
    LEFT JOIN transactions t ON t.productId = p.id AND t.type = 'buy'
    WHERE p.type = 'equity' AND p.code IS NOT NULL AND p.code != ''
    GROUP BY p.id
    HAVING firstBuyDate IS NOT NULL
    ORDER BY p.name
  `)

  log(`找到 ${funds.length} 只基金产品需要补全`)

  let totalInserted = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const fund of funds) {
    const { productId, userId, name, code, firstBuyDate } = fund
    const buyDateOnly = getDateOnly(firstBuyDate)

    log(`处理: ${name} (${code}), 购买日期: ${new Date(firstBuyDate).toLocaleDateString('zh-CN')}`)

    // 2. 查询该产品已有的 nav_update 记录
    const existingNavs = await queryAll(
      'SELECT date FROM transactions WHERE productId = ? AND type = "nav_update"',
      [productId]
    )
    const existingDateSet = new Set(existingNavs.map(t => getDateOnly(t.date)))

    // 3. 获取全部历史净值
    try {
      const history = await fetchFundHistory(code)

      // 4. 过滤出从购买日起缺失的净值
      const missingNavs = history.filter(item => {
        return item.timestamp >= buyDateOnly && !existingDateSet.has(item.timestamp)
      })

      if (missingNavs.length === 0) {
        log(`  ${name}: 无缺失数据，跳过`)
        totalSkipped++
        continue
      }

      log(`  ${name}: 共 ${history.length} 条净值记录, 缺失 ${missingNavs.length} 条, 开始插入...`)

      // 5. 批量插入缺失的 nav_update 交易
      let inserted = 0
      for (const navItem of missingNavs) {
        const txId = generateId()
        const updateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        const note = updateTime
        try {
          await runSql(
            'INSERT INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [txId, userId, productId, 'nav_update', navItem.timestamp, 0, navItem.nav, 0, 0, note]
          )
          inserted++
        } catch (e) {
          log(`  插入失败: ${navItem.dateStr} nav=${navItem.nav}, 错误: ${e.message}`, 'ERROR')
        }
      }

      totalInserted += inserted
      log(`  ${name}: 成功插入 ${inserted} 条净值记录`)
    } catch (e) {
      log(`  ${name}: 获取历史净值失败 - ${e.message}`, 'ERROR')
      totalFailed++
    }

    // 间隔 500ms，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  log(`=== 补全完成: 插入 ${totalInserted} 条, 跳过 ${totalSkipped} 只, 失败 ${totalFailed} 只 ===`)
}

main()
  .then(() => {
    db.close()
    process.exit(0)
  })
  .catch(e => {
    log(`脚本异常: ${e.message}`, 'ERROR')
    db.close()
    process.exit(1)
  })
