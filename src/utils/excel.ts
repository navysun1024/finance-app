import type { Product, Transaction, Position } from '@/types'
import { PRODUCT_TYPE_OPTIONS, TRANSACTION_TYPE_OPTIONS } from '@/composables/useFinance'

export async function exportToExcel(
  products: Product[],
  positions: Position[],
  transactions: Transaction[]
): Promise<void> {
  const XLSX = await import('xlsx')

  const workbook = XLSX.utils.book_new()

  const productsData = products.map(p => {
    const position = positions.find(pos => pos.productId === p.id)
    const typeOption = PRODUCT_TYPE_OPTIONS.find(t => t.value === p.type)
    return {
      '产品名称': p.name,
      '产品类型': typeOption?.label || p.type,
      '持有人': p.holder || '',
      '备注': p.note || '',
      '持有份额': { v: position?.totalShares || 0, t: 'n', z: '0.0000' },
      '平均成本': { v: position?.avgCost || 0, t: 'n', z: '0.0000' },
      '当前净值': { v: position?.currentNav || 0, t: 'n', z: '0.0000' },
      '当前市值': { v: Math.round(position?.marketValue || 0), t: 'n', z: '0' },
      '盈亏金额': { v: position?.profit || 0, t: 'n', z: '0.00' },
      '收益率(%)': { v: position?.profitRate || 0, t: 'n', z: '0.00' },
      '年化收益率(%)': { v: position?.annualRate || 0, t: 'n', z: '0.00' },
      '持有天数': { v: position?.holdingDays || 0, t: 'n', z: '0' }
    }
  })
  const productsSheet = XLSX.utils.json_to_sheet(productsData)
  productsSheet['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(workbook, productsSheet, '产品汇总')

  const transactionsData = transactions
    .filter(t => t.type !== 'nav_update')
    .sort((a, b) => b.date - a.date)
    .map(t => {
      const product = products.find(p => p.id === t.productId)
      const typeOption = TRANSACTION_TYPE_OPTIONS.find(type => type.value === t.type)
      return {
        '日期': new Date(t.date).toLocaleDateString('zh-CN'),
        '产品名称': product?.name || '未知',
        '交易类型': typeOption?.label || t.type,
        '金额(元)': { v: t.amount, t: 'n', z: '0.00' },
        '单价/净值': { v: t.price, t: 'n', z: '0.0000' },
        '份额': { v: t.shares, t: 'n', z: '0.0000' },
        '手续费(元)': { v: t.fee, t: 'n', z: '0.00' },
        '备注': t.note || ''
      }
    })
  const transactionsSheet = XLSX.utils.json_to_sheet(transactionsData)
  transactionsSheet['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 20 }
  ]
  XLSX.utils.book_append_sheet(workbook, transactionsSheet, '交易明细')

  const totalAssets = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0)
  const totalProfit = positions.reduce((sum, p) => sum + (p.profit || 0), 0)
  const totalInvestment = positions.reduce((sum, p) => sum + (p.totalInvestment || 0), 0)
  const summaryData = [
    { '指标': '总资产', '数值': { v: totalAssets, t: 'n', z: '0.00' } },
    { '指标': '累计投入', '数值': { v: totalInvestment, t: 'n', z: '0.00' } },
    { '指标': '总盈亏', '数值': { v: totalProfit, t: 'n', z: '0.00' } },
    { '指标': '总收益率(%)', '数值': { v: totalInvestment > 0 ? ((totalProfit / totalInvestment) * 100) : 0, t: 'n', z: '0.00' } },
    { '指标': '产品数量', '数值': { v: products.length, t: 'n', z: '0' } },
    { '指标': '交易记录数', '数值': { v: transactions.length, t: 'n', z: '0' } },
    { '指标': '导出时间', '数值': new Date().toLocaleString('zh-CN') }
  ]
  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  summarySheet['!cols'] = [{ wch: 15 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, '投资汇总')

  const wopts = { bookType: 'xlsx' as const, bookSST: false, type: 'binary' as const }
  const wbout = XLSX.write(workbook, wopts)
  const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `投资明细_${new Date().toISOString().split('T')[0]}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function s2ab(s: string): ArrayBuffer {
  const buf = new ArrayBuffer(s.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < s.length; i++) {
    view[i] = s.charCodeAt(i) & 0xFF
  }
  return buf
}
