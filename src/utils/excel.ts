import type { Product, Transaction, Position } from '@/types'
import { PRODUCT_TYPE_OPTIONS, TRANSACTION_TYPE_OPTIONS } from '@/composables/useFinance'

export async function exportToExcel(
  products: Product[],
  positions: Position[],
  transactions: Transaction[]
): Promise<void> {
  // 动态导入 xlsx，仅在用户点击导出时才加载（~300KB）
  const XLSX = await import('xlsx')

  const workbook = XLSX.utils.book_new()

  const productsData = products.map(p => {
    const position = positions.find(pos => pos.productId === p.id)
    const typeOption = PRODUCT_TYPE_OPTIONS.find(t => t.value === p.type)
    return {
      '产品名称': p.name,
      '产品类型': typeOption?.label || p.type,
      '备注': p.note || '',
      '持有份额': position?.totalShares?.toFixed(4) || '0',
      '平均成本': position?.avgCost?.toFixed(4) || '0',
      '当前净值': position?.currentNav?.toFixed(4) || '0',
      '当前市值': Math.round(position?.marketValue || 0).toString(),
      '盈亏金额': position?.profit?.toFixed(2) || '0',
      '收益率(%)': position?.profitRate?.toFixed(2) || '0',
      '年化收益率(%)': position?.annualRate?.toFixed(2) || '0',
      '持有天数': position?.holdingDays || 0
    }
  })
  const productsSheet = XLSX.utils.json_to_sheet(productsData)
  productsSheet['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 20 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(workbook, productsSheet, '产品汇总')

  const transactionsData = transactions
    .sort((a, b) => b.date - a.date)
    .map(t => {
      const product = products.find(p => p.id === t.productId)
      const typeOption = TRANSACTION_TYPE_OPTIONS.find(type => type.value === t.type)
      return {
        '日期': new Date(t.date).toLocaleDateString('zh-CN'),
        '产品名称': product?.name || '未知',
        '交易类型': typeOption?.label || t.type,
        '金额(元)': t.amount.toFixed(2),
        '单价/净值': t.price.toFixed(4),
        '份额': t.shares.toFixed(4),
        '手续费(元)': t.fee.toFixed(2),
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
    { '指标': '总资产', '数值': totalAssets.toFixed(2) },
    { '指标': '累计投入', '数值': totalInvestment.toFixed(2) },
    { '指标': '总盈亏', '数值': totalProfit.toFixed(2) },
    { '指标': '总收益率(%)', '数值': totalInvestment > 0 ? ((totalProfit / totalInvestment) * 100).toFixed(2) : '0.00' },
    { '指标': '产品数量', '数值': products.length.toString() },
    { '指标': '交易记录数', '数值': transactions.length.toString() },
    { '指标': '导出时间', '数值': new Date().toLocaleString('zh-CN') }
  ]
  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  summarySheet['!cols'] = [{ wch: 15 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, '投资汇总')

  XLSX.writeFile(workbook, `投资明细_${new Date().toISOString().split('T')[0]}.xlsx`)
}
