// 完整导入测试 - 模拟前端批量导入流程
const API_BASE = 'http://localhost:3002'

// ========== 1. 导入解析（同 importParser.ts）==========
function parseFundTable(text) {
  const lines = text.trim().split('\n')
  const result = { rows: [], errors: [] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const fields = line.split(/\s{2,}|\t/).map(f => f.trim()).filter(Boolean)
    if (fields.length < 9) continue
    const dateStr = fields[0], fundCode = fields[1], fundName = fields[2]
    const bizType = fields[3], status = fields[4]
    const shares = parseFloat(fields[5]), amount = parseFloat(fields[6])
    const fee = parseFloat(fields[7] || '0'), nav = parseFloat(fields[8])
    if (status !== '成功') continue
    if (bizType !== '买基金' && bizType !== '定时定额投资') continue
    if (isNaN(shares) || isNaN(amount) || isNaN(nav)) continue
    result.rows.push({ date: dateStr, fundCode, fundName, type: 'buy', shares, amount, fee, nav })
  }
  return result
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

const testData = `2025/12/8 	 012922 	 易方达全球成长精选混合(QDII)人民币C 	 买基金 	 成功 	 206.67 	 500 	 0 	 2.4193 	 建设银行 | 6398
2025/11/18 	 019455 	 华泰柏瑞中韩半导体ETF发起式联接(QDII)C 	 定时定额投资 	 成功 	 52.12 	 100 	 0 	 1.9186 	 建设银行 | 6398
2025/11/17 	 019455 	 华泰柏瑞中韩半导体ETF发起式联接(QDII)C 	 定时定额投资 	 成功 	 53.46 	 100 	 0 	 1.8704 	 建设银行 | 6398`

const parsed = parseFundTable(testData)
console.log('========== 数据解析结果 ==========')
console.log(`解析成功: ${parsed.rows.length} 条, 失败: ${parsed.errors.length} 条\n`)

parsed.rows.forEach((r, i) => {
  console.log(`记录 ${i+1}: ${r.date} | ${r.fundCode} | ${r.fundName} | ${r.shares}份 | ${r.amount}元 | 净值${r.nav}`)
})

async function doImport() {
  // ========== 2. 注册用户 ==========
  const username = 'test_' + Date.now()
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test123' })
  })
  const regData = await regRes.json()
  if (!regData.token) { console.error('❌ 注册失败:', regData); return }
  console.log('\n✅ 用户注册成功:', username)
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regData.token}` }

  // ========== 3. 模拟 handleImport（同 BatchImportModal.vue）==========
  const newProducts = [], newTransactions = []

  for (const row of parsed.rows) {
    let product = newProducts.find(p => p.code === row.fundCode)
    if (!product) {
      const pid = generateId()
      product = { id: pid, name: row.fundName, code: row.fundCode }
      newProducts.push({ id: pid, name: row.fundName, type: 'equity', code: row.fundCode, note: '', createdAt: Date.now() })
    }
    const dp = row.date.split(/[-/]/)
    const dateTs = new Date(parseInt(dp[0]), parseInt(dp[1])-1, parseInt(dp[2])).getTime()
    if (isNaN(dateTs)) { console.error(`❌ 日期无效: ${row.date}`); continue }
    newTransactions.push({
      id: generateId(), productId: product.id, type: 'buy',
      date: dateTs, amount: row.amount, price: row.nav,
      shares: row.shares, fee: row.fee, note: `批量导入 - ${row.fundName}`
    })
  }

  console.log(`\n========== 准备导入 ==========`)
  console.log(`新建产品: ${newProducts.length} 个`)
  newProducts.forEach(p => console.log(`  - ${p.name} (${p.code})`))
  console.log(`新建交易: ${newTransactions.length} 条`)
  newTransactions.forEach((t, i) => {
    const d = new Date(t.date)
    const ds = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
    console.log(`  ${i+1}. 日期:${ds} | 金额:${t.amount} | 份额:${t.shares} | 净值:${t.price}`)
  })

  // ========== 4. 保存到数据库 ==========
  // 先保存产品
  const prodRes = await fetch(`${API_BASE}/api/products`, {
    method: 'POST', headers, body: JSON.stringify(newProducts)
  })
  const prodData = await prodRes.json()
  if (!prodData.success) { console.error('❌ 保存产品失败:', prodData); return }
  console.log('\n✅ 产品已写入数据库')

  // 保存交易
  const txRes = await fetch(`${API_BASE}/api/transactions`, {
    method: 'POST', headers, body: JSON.stringify(newTransactions)
  })
  const txData = await txRes.json()
  if (!txData.success) { console.error('❌ 保存交易失败:', txData); return }
  console.log('✅ 交易已写入数据库')

  // ========== 5. 验证结果 ==========
  const getProdRes = await fetch(`${API_BASE}/api/products`, { headers })
  const savedProducts = await getProdRes.json()
  const getTxRes = await fetch(`${API_BASE}/api/transactions`, { headers })
  const savedTx = await getTxRes.json()

  console.log(`\n========== 数据库验证 ==========`)
  console.log(`📦 产品数: ${savedProducts.length}`)
  savedProducts.forEach(p => console.log(`  - ${p.name} (${p.code}) id:${p.id}`))

  const byProduct = {}
  savedTx.forEach(t => {
    byProduct[t.productId] = (byProduct[t.productId] || 0) + 1
  })
  console.log(`\n📊 交易数: ${savedTx.length}`)
  for (const [pid, count] of Object.entries(byProduct)) {
    const prod = savedProducts.find(p => p.id === pid)
    console.log(`  ${prod ? prod.name : '未知'} (${prod ? prod.code : ''}): ${count} 条交易`)
  }

  // 详细列出所有交易
  console.log(`\n📋 交易明细:`)
  savedTx.forEach((t, i) => {
    const d = new Date(t.date)
    const ds = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
    const prod = savedProducts.find(p => p.id === t.productId)
    console.log(`  ${i+1}. [${prod ? prod.code : '?'}] ${ds} | 金额:${t.amount} | 份额:${t.shares} | 净值:${t.price}`)
  })

  // ========== 6. 最终结论 ==========
  console.log(`\n========== 最终结论 ==========`)
  const prod019455 = savedProducts.find(p => p.code === '019455')
  const prod012922 = savedProducts.find(p => p.code === '012922')
  const tx019455 = savedTx.filter(t => t.productId === prod019455?.id)
  const tx012922 = savedTx.filter(t => t.productId === prod012922?.id)

  console.log(`012922 (易方达全球成长): ${tx012922.length} 条交易 ${tx012922.length === 1 ? '✅' : '❌'}`)
  console.log(`019455 (华泰柏瑞中韩半导体): ${tx019455.length} 条交易 ${tx019455.length === 2 ? '✅' : '❌'}`)
  console.log(`总记录数: ${savedTx.length} 条 ${savedTx.length === 3 ? '✅' : '❌'}`)

  if (tx019455.length === 2 && tx012922.length === 1 && savedTx.length === 3) {
    console.log('\n🎉 全部验证通过！同一产品(019455)不同日期的2条记录已独立保存，未被合并！')
  } else {
    console.log('\n❌ 验证失败！')
  }
}

doImport().catch(console.error)