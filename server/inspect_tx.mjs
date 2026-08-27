import sqlite3 from 'sqlite3'
const db = new sqlite3.Database('data/finance.db')
const fmt = (ts) => new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
const pid = 'mqux4s3r0cekaw9m2cvq'
db.serialize(() => {
  db.all(`SELECT type, date, price FROM transactions WHERE productId = ? ORDER BY date`, [pid], (e3, txs) => {
    if (e3) { console.error('tx', e3.message); return }
    const nav = txs.filter(t => t.type === 'nav_update')
    const bs = txs.filter(t => t.type === 'buy' || t.type === 'sell')
    console.log('总交易数=', txs.length, '净值记录=', nav.length, '买卖=', bs.length)
    console.log('净值日期前5:', nav.slice(0, 5).map(t => fmt(t.date)).join(' | '))
    if (nav.length) console.log('净值日期末:', fmt(nav[nav.length - 1].date))
    const navDates = new Set(nav.map(t => fmt(t.date)))
    for (const t of bs) {
      const d = fmt(t.date)
      console.log('B/S', t.type, d, '-> 净值匹配=', navDates.has(d))
    }
  })
})