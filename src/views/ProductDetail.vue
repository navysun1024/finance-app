<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ArrowLeft, Plus, Edit, TrendingUp, TrendingDown, RefreshCw, Calendar, ArrowUp, ArrowDown, ChevronsUpDown, History } from 'lucide-vue-next'
import ProductModal from '@/components/ProductModal.vue'
import { useRoute, useRouter } from 'vue-router'
import { useFinance, initFinance } from '@/composables/useFinance'
import { formatCurrency, formatCurrency1, formatPercent, formatDate, getDateOnly } from '@/utils/format'
import { fetchEquityNav, fetchCmbNav, fetchIcbcNav, fetchCmbNavHistory, fetchIcbcNavHistory, fetchEquityStageGains, fetchEquityHoldings, type NavResult, type StageGains, type EquityHoldingsResult } from '@/utils/equityApi'
import { fetchMultipleIndexHistory } from '@/utils/indexApi'
import { calcBenchmarkSeries, getFormulaIndexCodes, parseBenchmarkFormula, type BenchmarkComponent } from '@/utils/benchmark'
import type { BenchmarkPoint } from '@/types'
import { getAuthHeaders } from '@/utils/storage'
import type { Transaction } from '@/types'
import TransactionModal from '@/components/TransactionModal.vue'
import TransactionCard from '@/components/TransactionCard.vue'
import * as echarts from 'echarts'

const route = useRoute()
const router = useRouter()
const { getProductById, getPositionById, getTransactionsByProductId, addTransaction, updateTransaction, deleteTransaction, updateProduct, PRODUCT_TYPE_OPTIONS, refresh } = useFinance()

const fetchingNav = ref(false)
const fetchingNavHistory = ref(false)
const fetchingStageGains = ref(false)
const fetchingHoldings = ref(false)
const navFetchError = ref('')
const navHistorySuccess = ref('')
const stageGains = ref<StageGains | null>(null)
const holdingsData = ref<EquityHoldingsResult | null>(null)

const showProductModal = ref(false)
const editingProduct = ref<typeof product.value | null>(null)

const handleEdit = () => {
  editingProduct.value = product.value
  showProductModal.value = true
}

const handleSubmit = (data: { name: string; type: string; note: string; code: string; holder: string; dcaAmount: number; dcaCycle: string; navSource: string; holdingTerm: string; benchmarkEnabled: boolean; benchmarkFormula: string; interestRate: number; durationMonths: number; minAmount: number; maturityDate: string; interestMethod: string; bankName: string }) => {
  if (editingProduct.value) {
    updateProduct(editingProduct.value.id, data.name, data.type as any, data.note, data.code, data.holder, data.dcaAmount, data.dcaCycle, data.navSource, data.holdingTerm, data.benchmarkEnabled, data.benchmarkFormula, data.interestRate, data.durationMonths, data.minAmount, data.maturityDate, data.interestMethod as any, data.bankName)
  }
  showProductModal.value = false
}

const handleFetchStageGains = async () => {
  if (!product.value?.code || (product.value.type !== 'equity' && product.value.type !== 'fund')) return

  fetchingStageGains.value = true
  try {
    const result = await fetchEquityStageGains(product.value.code)
    stageGains.value = result.data
  } catch (e: any) {
    console.error('获取阶段涨幅失败:', e)
  } finally {
    fetchingStageGains.value = false
  }
}

const handleFetchHoldings = async () => {
  if (!product.value?.code || (product.value.type !== 'equity' && product.value.type !== 'fund')) return

  fetchingHoldings.value = true
  try {
    holdingsData.value = await fetchEquityHoldings(product.value.code)
  } catch (e: any) {
    console.error('获取持仓信息失败:', e)
  } finally {
    fetchingHoldings.value = false
  }
}

const handleFetchNav = async () => {
  if (!product.value?.code) return

  fetchingNav.value = true
  navFetchError.value = ''
  try {
    let result: NavResult
    
    const allowedSources = (product.value.type === 'equity' || product.value.type === 'fund')
      ? ['tiantian'] 
      : ['tiantian', 'cmb', 'icbc']
    const navSrc = allowedSources.includes(product.value.navSource || '') 
      ? product.value.navSource 
      : (product.value.type === 'equity' || product.value.type === 'fund' ? 'tiantian' : 'cmb')
    
    if (navSrc === 'tiantian') {
      result = await fetchEquityNav(product.value.code)
    } else if (navSrc === 'icbc') {
      result = await fetchIcbcNav(product.value.code)
    } else {
      result = await fetchCmbNav(product.value.code)
    }
    let dateTimestamp = Date.now()
    if (result.date) {
      const cleaned = result.date.trim()
      if (/^\d{8}$/.test(cleaned)) {
        dateTimestamp = new Date(
          parseInt(cleaned.substring(0, 4)),
          parseInt(cleaned.substring(4, 6)) - 1,
          parseInt(cleaned.substring(6, 8))
        ).getTime()
      } else {
        const parts = cleaned.split(/[-/]/)
        if (parts.length === 3) {
          dateTimestamp = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2])
          ).getTime()
        }
      }
    }

    // 统一使用当天零点作为日期，确保唯一性
    const navDateMidnight = getDateOnly(dateTimestamp)

    const existingTransactions = getTransactionsByProductId(productId.value)
    if (existingTransactions.some(
      t => t.type === 'nav_update' && getDateOnly(t.date) === navDateMidnight
    )) {
      fetchingNav.value = false
      return
    }

    const updateTime = new Date().toLocaleString('zh-CN')
    addTransaction(
      productId.value,
      'nav_update',
      navDateMidnight,
      0,
      result.nav,
      0,
      0,
      updateTime
    )

    // 将限购信息写入产品备注
    if (result.purchaseLimitLabel) {
      const currentNote = product.value.note || ''
      // 移除旧的限购标记，追加新的
      const cleaned = currentNote
        .split('\n')
        .filter(line => !/^(限购:|单日上限|不限购$|暂停申购$)/.test(line.trim()))
        .join('\n')
        .trim()
      const newNote = cleaned ? `${cleaned}\n${result.purchaseLimitLabel}` : result.purchaseLimitLabel
      updateProduct(
        product.value.id,
        product.value.name,
        product.value.type,
        newNote,
        product.value.code,
        product.value.holder,
        product.value.dcaAmount,
        product.value.dcaCycle,
        product.value.navSource,
        (product.value as any).holdingTerm || '',
        (product.value as any).benchmarkEnabled || false,
        (product.value as any).benchmarkFormula || ''
      )
    }
  } catch (e: any) {
    navFetchError.value = e.message || '查询失败'
  } finally {
    fetchingNav.value = false
  }
}

const handleFetchNavHistory = async () => {
  if (!product.value?.code) return
  
  const allowedSources = (product.value.type === 'equity' || product.value.type === 'fund')
    ? ['tiantian'] 
    : ['tiantian', 'cmb', 'icbc']
  const navSrc = allowedSources.includes(product.value.navSource || '') 
    ? product.value.navSource 
    : (product.value.type === 'equity' || product.value.type === 'fund' ? 'tiantian' : 'cmb')
  
  if (navSrc === 'tiantian') return

  fetchingNavHistory.value = true
  navFetchError.value = ''
  navHistorySuccess.value = ''
  
  try {
    const existingTransactions = getTransactionsByProductId(productId.value)
    const existingDates = new Set(
      existingTransactions
        .filter(t => t.type === 'nav_update')
        .map(t => getDateOnly(t.date))
    )

    let results: NavResult[]
    if (navSrc === 'icbc') {
      results = await fetchIcbcNavHistory(product.value.code, 50)
    } else {
      results = await fetchCmbNavHistory(product.value.code, 50)
    }
    let addedCount = 0

    for (const result of results) {
      let dateTimestamp = Date.now()
      if (result.date) {
        const cleaned = result.date.trim()
        if (/^\d{8}$/.test(cleaned)) {
          dateTimestamp = new Date(
            parseInt(cleaned.substring(0, 4)),
            parseInt(cleaned.substring(4, 6)) - 1,
            parseInt(cleaned.substring(6, 8))
          ).getTime()
        } else {
          const parts = cleaned.split(/[-/]/)
          if (parts.length === 3) {
            dateTimestamp = new Date(
              parseInt(parts[0]),
              parseInt(parts[1]) - 1,
              parseInt(parts[2])
            ).getTime()
          }
        }
      }

      const dateKey = getDateOnly(dateTimestamp)
      if (!existingDates.has(dateKey)) {
        const now = new Date()
        const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
        addTransaction(
          productId.value,
          'nav_update',
          dateTimestamp,
          0,
          result.nav,
          0,
          0,
          timeStr
        )
        existingDates.add(dateKey)
        addedCount++
      }
    }

    if (addedCount > 0) {
      navHistorySuccess.value = `成功更新 ${addedCount} 条净值数据`
    } else {
      navHistorySuccess.value = '所有日期的净值数据已存在，无需更新'
    }
  } catch (e: any) {
    navFetchError.value = e.message || '查询失败'
  } finally {
    fetchingNavHistory.value = false
  }
}

// 补全权益历史净值
const backfillingNav = ref(false)

const handleBackfillNav = async () => {
  const canBackfill = (product.value?.type === 'equity' || product.value?.type === 'fund') ||
    (product.value?.type === 'fixed_income' && product.value?.navSource === 'tiantian')
  if (!product.value?.code || !canBackfill) return

  backfillingNav.value = true
  navFetchError.value = ''
  navHistorySuccess.value = ''
  try {
    const res = await fetch(`/api/db/fund/backfill-nav/${productId.value}`, { method: 'POST', headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '补全失败')
    if (data.inserted > 0) {
      navHistorySuccess.value = `补全成功！共 ${data.total} 条历史净值，新增 ${data.inserted} 条`
      await refresh()
    } else {
      navHistorySuccess.value = `无缺失数据，共 ${data.total} 条历史净值已是完整`
    }
  } catch (e: any) {
    navFetchError.value = e.message || '补全失败'
  } finally {
    backfillingNav.value = false
  }
}

const productId = computed(() => route.params.id as string)
const product = computed(() => getProductById(productId.value))
const position = computed(() => getPositionById(productId.value))
const transactions = computed(() => getTransactionsByProductId(productId.value))

// 交易记录排序
const txSortKey = ref<keyof Transaction>('date')
const txSortOrder = ref<'asc' | 'desc'>('desc')

// 交易记录日期区间筛选
const txDateRangeOptions = [
  { value: '1m', label: '近1月' },
  { value: '3m', label: '近3月' },
  { value: '6m', label: '近6月' },
  { value: '1y', label: '近1年' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' }
]
const txDateRange = ref('3m')
const txCustomStartDate = ref('')
const txCustomEndDate = ref('')

// 交易类型筛选
const txTypeOptions = [
  { value: 'all', label: '全部' },
  { value: 'buy', label: '买入' },
  { value: 'sell', label: '卖出' },
  { value: 'dividend', label: '分红' },
  { value: 'nav_update', label: '净值更新' }
]
const txType = ref('nav_update')

const txDateBounds = computed(() => {
  if (txDateRange.value === 'all') return null
  if (txDateRange.value === 'custom') {
    const start = txCustomStartDate.value ? new Date(txCustomStartDate.value).getTime() : 0
    const end = txCustomEndDate.value ? new Date(txCustomEndDate.value + 'T23:59:59').getTime() : Date.now()
    return { start, end }
  }
  const now = Date.now()
  const days: Record<string, number> = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  const d = days[txDateRange.value] || 90
  return { start: now - d * 24 * 60 * 60 * 1000, end: now }
})

const sortedTransactions = computed(() => {
  let list = [...transactions.value]
  // 按日期区间筛选
  const bounds = txDateBounds.value
  if (bounds) {
    list = list.filter(t => t.date >= bounds.start && t.date <= bounds.end)
  }
  // 按交易类型筛选
  if (txType.value !== 'all') {
    list = list.filter(t => t.type === txType.value)
  }
  list.sort((a, b) => {
    const aVal = a[txSortKey.value]
    const bVal = b[txSortKey.value]
    if (txSortOrder.value === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
    }
  })
  return list
})

const handleTxSort = (key: keyof Transaction) => {
  if (txSortKey.value === key) {
    txSortOrder.value = txSortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    txSortKey.value = key
    txSortOrder.value = 'desc'
  }
}

const getTxSortIcon = (key: keyof Transaction) => {
  if (txSortKey.value !== key) return ChevronsUpDown
  return txSortOrder.value === 'asc' ? ArrowUp : ArrowDown
}

const showModal = ref(false)
const editingTransaction = ref<typeof transactions.value[0] | null>(null)
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
const benchmarkData = ref<BenchmarkPoint[]>([])

const benchmarkComponents = computed<BenchmarkComponent[]>(() => {
  if (!product.value?.benchmarkEnabled || !product.value?.benchmarkFormula) {
    return []
  }
  return parseBenchmarkFormula(product.value.benchmarkFormula)
})

const hasBenchmark = computed(() => benchmarkComponents.value.length > 0)

const benchmarkLegendName = computed(() => {
  if (!hasBenchmark.value) return ''
  const components = benchmarkComponents.value
  const formulaStr = components
    .map(c => `${c.weight.toFixed(2)}*${c.indexName}`)
    .join('+')
  return `比较基准(${formulaStr})`
})
const allocationChartRef = ref<HTMLDivElement>()
const holdingsChartRef = ref<HTMLDivElement>()
const termDepositChartRef = ref<HTMLDivElement>()
let allocationChart: echarts.ECharts | null = null
let holdingsChart: echarts.ECharts | null = null
let termDepositChart: echarts.ECharts | null = null

const ALLOC_COLORS = {
  '股票': '#ef4444',
  '债券': '#3b82f6', 
  '现金': '#f59e0b',
  '其他': '#d1d5db'
}

const STOCK_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0'
]

const isMobile = () => window.innerWidth < 640

const renderHoldingsCharts = () => {
  const data = holdingsData.value
  if (!data) return

  // 释放旧实例，避免绑定到已销毁的 DOM
  if (allocationChart) { allocationChart.dispose(); allocationChart = null }
  if (holdingsChart) { holdingsChart.dispose(); holdingsChart = null }

  const mobile = isMobile()

  // 使用 setTimeout 确保 DOM 完全渲染后再初始化图表
  setTimeout(() => {
    // 资产配置分段条形图
    if (allocationChartRef.value && data.assetAllocation) {
      allocationChart = echarts.init(allocationChartRef.value)
      const aa = data.assetAllocation
      
      // 兼容三种数据格式：
      // 1. 新汇总格式(cashRatio + otherRatio 分开)
      // 2. 旧汇总格式(cashAndOtherRatio 合并)
      // 3. 单基金格式(cashRatio，其他通过残差计算)
      const hasOtherRatio = aa.otherRatio !== null && aa.otherRatio !== undefined
      const hasCashAndOther = aa.cashAndOtherRatio !== null && aa.cashAndOtherRatio !== undefined
      
      let allocData
      if (hasOtherRatio) {
        // 新汇总格式：已分开
        allocData = [
          { name: '股票', value: aa.stockRatio },
          { name: '债券', value: aa.bondRatio },
          { name: '现金', value: aa.cashRatio },
          { name: '其他', value: aa.otherRatio },
        ].filter(d => d.value !== null && d.value !== undefined)
      } else if (hasCashAndOther) {
        // 旧汇总格式：合并
        allocData = [
          { name: '股票', value: aa.stockRatio },
          { name: '债券', value: aa.bondRatio },
          { name: '现金及其他', value: aa.cashAndOtherRatio },
        ].filter(d => d.value !== null && d.value !== undefined)
      } else {
        // 单基金格式
        allocData = [
          { name: '股票', value: aa.stockRatio },
          { name: '债券', value: aa.bondRatio },
          { name: '现金', value: aa.cashRatio },
        ].filter(d => d.value !== null && d.value !== undefined)
      }
      
      // 如果没有有效数据，跳过渲染
      if (allocData.length > 0) {
        // 仅单基金格式需要通过残差计算"其他"
        if (!hasOtherRatio && !hasCashAndOther) {
          const total = allocData.reduce((s, d) => s + (d.value ?? 0), 0)
          const other = Math.max(0, 100 - total)
          if (other > 0.01) allocData.push({ name: '其他', value: parseFloat(other.toFixed(2)) })
        }
      
        allocationChart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            textStyle: { color: '#374151', fontSize: 12 },
            formatter: (params: any) => {
              let result = '<div style="font-weight:600;margin-bottom:4px">资产配置</div>'
              params.forEach((item: any) => {
                if (item.value > 0) {
                  result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.color}"></span>
                    <span>${item.seriesName}: <b>${item.value}%</b></span>
                  </div>`
                }
              })
              return result
            }
          },
          legend: {
            show: true,
            bottom: 0,
            itemWidth: mobile ? 6 : 8,
            itemHeight: mobile ? 6 : 8,
            itemGap: mobile ? 4 : 12,
            textStyle: { fontSize: mobile ? 8 : 10, color: '#6b7280' }
          },
          grid: { left: '0', right: '0', top: '10', bottom: mobile ? '30' : '40' },
          xAxis: {
            type: 'value',
            max: 100,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          yAxis: {
            type: 'category',
            data: [''],
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false }
          },
          series: [{
            type: 'bar',
            barWidth: '90%',
            barGap: '-100%',
            data: [{ value: 100, itemStyle: { color: '#f3f4f6', borderRadius: [8, 8, 8, 8] } }],
            stack: 'bg',
            silent: true,
            tooltip: { show: false }
          }, ...allocData.map((item, index, arr) => {
            const isFirst = index === 0
            const isLast = index === arr.length - 1
            const color = (ALLOC_COLORS as any)[item.name] || STOCK_COLORS[index % STOCK_COLORS.length]
            return {
              name: item.name,
              type: 'bar',
              stack: 'value',
              barWidth: '90%',
              barGap: '-100%',
              itemStyle: {
                color,
                borderRadius: isFirst && isLast ? [8, 8, 8, 8]
                  : isFirst ? [8, 0, 0, 8]
                  : isLast ? [0, 8, 8, 0]
                  : [0, 0, 0, 0]
              },
              label: {
                show: true,
                position: 'inside',
                fontSize: 11,
                color: '#fff',
                fontWeight: 600,
                formatter: (params: any) => params.value >= 5 ? `${params.value}%` : ''
              },
              emphasis: {
                focus: 'series',
                itemStyle: { shadowBlur: 8, shadowOffsetY: 2, shadowColor: 'rgba(0,0,0,0.15)' }
              },
              data: [item.value]
            }
          })]
        })
      }
    }
    // 前十大重仓股分段条形图
    if (holdingsChartRef.value && data.stocks?.length) {
      holdingsChart = echarts.init(holdingsChartRef.value)
      const stocks = data.stocks
      const stocksData: { name: string; value: number }[] = stocks.map((s) => ({
        name: s.name,
        value: s.ratio
      }))
      // 计算"其他"占比（前十大之外的部分）
      const topTotal = stocks.reduce((s, st) => s + st.ratio, 0)
      const rest = Math.max(0, 100 - topTotal)
      if (rest > 0.01) stocksData.push({ name: '其他', value: parseFloat(rest.toFixed(2)) })
      
      holdingsChart.setOption({
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: '#e5e7eb',
          borderWidth: 1,
          textStyle: { color: '#374151', fontSize: 12 },
          formatter: (params: any) => {
            let result = '<div style="font-weight:600;margin-bottom:4px">重仓股分布</div>'
            params.forEach((item: any) => {
              if (item.value > 0 && item.seriesName !== 'bg') {
                result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.color}"></span>
                  <span>${item.seriesName}: <b>${item.value}%</b></span>
                </div>`
              }
            })
            return result
          }
        },
        legend: {
          show: true,
          bottom: 0,
          itemWidth: mobile ? 6 : 8,
          itemHeight: mobile ? 6 : 8,
          itemGap: mobile ? 4 : 10,
          textStyle: { fontSize: mobile ? 8 : 10, color: '#6b7280' },
          data: mobile ? stocksData.filter(s => s.value >= 3).map(s => s.name) : undefined
        },
        grid: { left: '0', right: '0', top: '10', bottom: mobile ? '30' : '40' },
        xAxis: {
          type: 'value',
          max: 100,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { show: false },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'category',
          data: [''],
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { show: false }
        },
        series: [{
          type: 'bar',
          barWidth: '95%',
          barGap: '-100%',
          data: [{ value: 100, itemStyle: { color: '#f3f4f6', borderRadius: [8, 8, 8, 8] } }],
          stack: 'bg',
          silent: true,
          tooltip: { show: false }
        }, ...stocksData.map((item, index, arr) => {
          const isFirst = index === 0
          const isLast = index === arr.length - 1
          const label = item.name === '其他' ? '其他' : item.name
          const color = item.name === '其他' ? '#d1d5db' : STOCK_COLORS[index % STOCK_COLORS.length]
          return {
            name: label,
            type: 'bar',
            stack: 'value',
            barWidth: '95%',
            barGap: '-100%',
            itemStyle: {
              color,
              borderRadius: isFirst && isLast ? [8, 8, 8, 8]
                : isFirst ? [8, 0, 0, 8]
                : isLast ? [0, 8, 8, 0]
                : [0, 0, 0, 0]
            },
            label: {
              show: true,
              position: 'inside',
              fontSize: 11,
              color: '#fff',
              fontWeight: 600,
              formatter: (params: any) => params.value >= 5 ? `${params.value}%` : ''
            },
            emphasis: {
              focus: 'series',
              itemStyle: { shadowBlur: 8, shadowOffsetY: 2, shadowColor: 'rgba(0,0,0,0.15)' }
            },
            data: [item.value]
          }
        })]
      })
    }
  }, 200)
}

const navRangeOptions = [
  { label: '近1月', value: '1m', days: 30 },
  { label: '近3月', value: '3m', days: 90 },
  { label: '近6月', value: '6m', days: 180 },
  { label: '近1年', value: '1y', days: 365 },
  { label: '全部', value: 'all', days: 0 }
]
const navRange = ref<string>('all')

const getProductTypeLabel = (type: string) => {
  const normalized = type === 'fund' ? 'equity' : type
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === normalized)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const normalized = type === 'fund' ? 'equity' : type
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === normalized)
  return option ? option.color : '#6b7280'
}

const handleAddTransaction = () => {
  editingTransaction.value = null
  showModal.value = true
}

const handleEditTransaction = (transaction: typeof transactions.value[0]) => {
  editingTransaction.value = transaction
  showModal.value = true
}

const handleDeleteTransaction = (id: string) => {
  if (confirm('确定要删除这条交易记录吗？')) {
    deleteTransaction(id)
  }
}

const handleSubmitTransaction = (data: { productId: string; type: string; date: number; amount: number; price: number; shares: number; fee: number; note: string }) => {
  if (editingTransaction.value) {
    updateTransaction(
      editingTransaction.value.id,
      data.productId,
      data.type as any,
      data.date,
      data.amount,
      data.price,
      data.shares,
      data.fee,
      data.note
    )
  } else {
    addTransaction(
      data.productId,
      data.type as any,
      data.date,
      data.amount,
      data.price,
      data.shares,
      data.fee,
      data.note
    )
  }
  showModal.value = false
}

const allNavTransactions = computed(() => 
  transactions.value
    .filter(t => t.type === 'nav_update')
    .map(t => ({
      date: formatDate(t.date),
      timestamp: t.date,
      nav: t.price
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
)

const filteredNavTransactions = computed(() => {
  const opt = navRangeOptions.find(o => o.value === navRange.value)
  if (!opt || opt.days === 0) return allNavTransactions.value
  const cutoff = Date.now() - opt.days * 24 * 60 * 60 * 1000
  const cutoffStr = formatDate(cutoff)
  return allNavTransactions.value.filter(t => t.date >= cutoffStr)
})

const fixedIncomeStageGains = computed(() => {
  if (product.value?.type !== 'fixed_income') return null
  
  const navList = allNavTransactions.value
  if (navList.length < 2) return null
  
  const latest = navList[navList.length - 1]
  const result: Record<string, number | undefined> = {}
  
  const timeRanges: Record<string, number> = {
    '1m': 30,
    '3m': 90,
    '6m': 180,
    '1y': 365
  }
  
  for (const [key, days] of Object.entries(timeRanges)) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const cutoffStr = formatDate(cutoff)
    
    let navBefore = null
    for (let i = navList.length - 1; i >= 0; i--) {
      if (navList[i].date <= cutoffStr) {
        navBefore = navList[i]
        break
      }
    }
    if (navBefore) {
      const actualDays = (latest.timestamp - navBefore.timestamp) / (24 * 60 * 60 * 1000)
      if (actualDays >= 7) {
        const simpleReturn = latest.nav / navBefore.nav
        result[key] = (Math.pow(simpleReturn, 365 / actualDays) - 1) * 100
      }
    }
  }
  
  const first = navList[0]
  if (first) {
    const actualDays = (latest.timestamp - first.timestamp) / (24 * 60 * 60 * 1000)
    if (actualDays >= 7) {
      const simpleReturn = latest.nav / first.nav
      result.sinceInception = (Math.pow(simpleReturn, 365 / actualDays) - 1) * 100
    }
  }
  
  return result
})

// 产品成立天数（基于最早净值日期计算）
const inceptionDays = computed(() => {
  if (product.value?.type !== 'fixed_income') return null
  const navList = allNavTransactions.value
  if (navList.length === 0) return null
  const earliestTimestamp = navList[0].timestamp
  return Math.floor((Date.now() - earliestTimestamp) / (24 * 60 * 60 * 1000))
})

// ==================== 定期存款相关计算 ====================
const isTermDeposit = computed(() => product.value?.type === 'term_deposit')

// 定期存款进度计算
const termDepositProgress = computed(() => {
  if (!isTermDeposit.value || !product.value) return null
  const durationMonths = product.value.durationMonths || 0
  if (durationMonths <= 0) return null
  
  const startDate = position.value?.transactions?.find(t => t.type === 'buy')?.date
  if (!startDate) return null
  
  const totalDays = durationMonths * 30 // 简化计算
  const elapsedDays = Math.floor((Date.now() - startDate) / (24 * 60 * 60 * 1000))
  const progress = Math.min(100, (elapsedDays / totalDays) * 100)
  const remainingDays = Math.max(0, totalDays - elapsedDays)
  
  return { progress, elapsedDays, totalDays, remainingDays }
})

// 定期存款收益预测
const termDepositProjection = computed(() => {
  if (!isTermDeposit.value || !product.value || !position.value) return null
  
  const principal = position.value.totalInvestment || 0
  const interestRate = (product.value.interestRate || 0) / 100
  const durationMonths = product.value.durationMonths || 0
  
  if (principal <= 0 || durationMonths <= 0) return null
  
  const totalInterest = principal * interestRate * (durationMonths / 12)
  const maturityAmount = principal + totalInterest
  
  // 生成收益预测数据点
  const points = []
  const numPoints = 12
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints
    const monthOffset = durationMonths * fraction
    const value = principal + totalInterest * fraction
    const date = new Date()
    date.setMonth(date.getMonth() + monthOffset)
    points.push({
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      value: Math.round(value * 100) / 100
    })
  }
  
  return {
    principal,
    interestRate,
    durationMonths,
    totalInterest,
    maturityAmount,
    points
  }
})

// 到期日期计算
const maturityDateComputed = computed(() => {
  if (!isTermDeposit.value || !product.value) return null
  
  // 如果用户手动设置了到期日，优先使用
  if (product.value.maturityDate) {
    return product.value.maturityDate
  }
  
  // 否则根据买入日期+期限计算
  const startDate = position.value?.transactions?.find(t => t.type === 'buy')?.date
  if (!startDate) return null
  
  const durationMonths = product.value.durationMonths || 0
  const maturity = new Date(startDate)
  maturity.setMonth(maturity.getMonth() + durationMonths)
  
  return maturity.toISOString().split('T')[0]
})

// 到期倒计时
const maturityCountdown = computed(() => {
  if (!maturityDateComputed.value) return null
  
  const maturity = new Date(maturityDateComputed.value)
  const now = new Date()
  const diffTime = maturity.getTime() - now.getTime()
  
  if (diffTime <= 0) {
    return { expired: true, days: 0 }
  }
  
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return { expired: false, days: diffDays }
})

// 渲染定期存款收益预测图表
const renderTermDepositChart = () => {
  if (!termDepositChartRef.value || !termDepositProjection.value) return
  
  if (termDepositChart) {
    termDepositChart.dispose()
    termDepositChart = null
  }
  
  termDepositChart = echarts.init(termDepositChartRef.value)
  
  const projection = termDepositProjection.value
  const data = projection.points.map(p => [p.date, p.value])
  
  termDepositChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151', fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0]
        const value = p.value[1]
        const profit = value - projection.principal
        return `<div style="font-weight:600;margin-bottom:4px">${p.value[0]}</div>
                <div>本金: <b>${formatCurrency1(projection.principal)}</b></div>
                <div>预计本息: <b>${formatCurrency1(value)}</b></div>
                <div style="color:${profit >= 0 ? '#f59e0b' : '#22c55e'};margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.05)">
                  累计收益: <b>${profit >= 0 ? '+' : ''}${formatCurrency1(profit)}</b>
                </div>`
      }
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: projection.points.map(p => p.date),
      axisLabel: {
        fontSize: 10,
        interval: 'auto',
        color: '#6b7280'
      },
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: '#6b7280',
        formatter: (value: number) => formatCurrency1(value)
      },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
    },
    series: [{
      type: 'line',
      data,
      smooth: true,
      lineStyle: {
        color: '#f59e0b',
        width: 2
      },
      itemStyle: { color: '#f59e0b' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
            { offset: 1, color: 'rgba(245, 158, 11, 0.05)' }
          ]
        }
      },
      symbol: 'circle',
      symbolSize: 4,
      markPoint: {
        symbol: 'pin',
        symbolSize: 40,
        data: [
          {
            name: '到期',
            coord: [projection.points[projection.points.length - 1].date, projection.maturityAmount],
            value: '到期',
            itemStyle: { color: '#f59e0b' }
          }
        ],
        label: { color: '#fff', fontSize: 10 }
      }
    }]
  })
}

// 计算每个净值的日涨跌幅
const navChangeMap = computed(() => {
  const map = new Map<string, number>()
  const items = allNavTransactions.value
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1].nav
    const curr = items[i].nav
    const change = ((curr - prev) / prev) * 100
    map.set(items[i].date, change)
  }
  return map
})

const getNavChange = (tx: Transaction) => {
  if (tx.type !== 'nav_update') return '-'
  const dateStr = formatDate(tx.date)
  const change = navChangeMap.value.get(dateStr)
  if (change === undefined) return '-'
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
}

const getNavChangeClass = (tx: Transaction) => {
  if (tx.type !== 'nav_update') return ''
  const dateStr = formatDate(tx.date)
  const change = navChangeMap.value.get(dateStr)
  if (change === undefined) return ''
  return change >= 0 ? 'text-profit' : 'text-loss'
}

const updateChart = () => {
  if (!chart) return
  
  const navData = filteredNavTransactions.value
  if (navData.length === 0) {
    chart.clear()
    return
  }
  
  const navValues = navData.map(t => t.nav)
  // 包含比较基准值在 Y 轴范围内
  const benchmarkSeriesData = getBenchmarkSeriesData(navData)
  const benchmarkValues = benchmarkSeriesData.filter((v): v is number => v !== null)
  const allValues = benchmarkValues.length > 0
    ? [...navValues, ...benchmarkValues]
    : navValues
  const minNav = Math.min(...allValues, position.value?.currentNav || 1)
  const maxNav = Math.max(...allValues, position.value?.currentNav || 1)
  const navSpread = maxNav - minNav
  const padding = navSpread * 0.1 || 0.02
  const hasBenchmark = benchmarkSeriesData.length > 0

  // 构建净值日期索引，用于定位买入/卖出点
  const navDateIndex = new Map<string, number>()
  navData.forEach((t, i) => navDateIndex.set(t.date, i))

  // 获取买入/卖出交易
  const buySellTxs = transactions.value.filter(
    t => (t.type === 'buy' || t.type === 'sell')
  )

  const markPointData = buySellTxs
    .map(tx => {
      const txDate = formatDate(tx.date)
      const idx = navDateIndex.get(txDate)
      if (idx === undefined) return null
      const isBuy = tx.type === 'buy'
      return {
        name: isBuy ? '买入' : '卖出',
        xAxis: idx,
        yAxis: navValues[idx],
        symbol: isBuy ? 'circle' : 'pin',
        symbolSize: isBuy ? 8 : 12,
        symbolRotate: isBuy ? 0 : 180,
        itemStyle: { color: isBuy ? '#ef4444' : '#3b82f6' },
        label: {
          show: false
        }
      }
    })
    .filter(Boolean)
  
  // 计算默认区间的年化收益率（仅固收产品）
  let titleOption: any = {}
  if (product.value?.type === 'fixed_income' && navData.length >= 2) {
    const startNav = navData[0].nav
    const endNav = navData[navData.length - 1].nav
    const startTimestamp = navData[0].timestamp
    const endTimestamp = navData[navData.length - 1].timestamp
    const days = (endTimestamp - startTimestamp) / (24 * 60 * 60 * 1000)
    
    if (days >= 1 && startNav > 0) {
      const totalReturn = endNav / startNav
      const annualReturn = (Math.pow(totalReturn, 365 / days) - 1) * 100
      const totalReturnPct = (totalReturn - 1) * 100
      const color = annualReturn >= 0 ? '#ef4444' : '#22c55e'
      
      titleOption = {
        title: [{
          text: `区间年化: ${annualReturn >= 0 ? '+' : ''}${annualReturn.toFixed(2)}%`,
          subtext: `累计: ${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% · ${Math.floor(days)}天`,
          left: 'right',
          bottom: 60,
          textAlign: 'right',
          textStyle: { fontSize: 14, fontWeight: 600, color },
          subtextStyle: { fontSize: 11, color: '#8e8e93' }
        }]
      }
    }
  }
  
    const seriesList: any[] = [{
      name: '净值',
      type: 'line',
      data: navData.map(t => t.nav),
      smooth: true,
      lineStyle: {
        color: '#1e40af',
        width: 2
      },
      itemStyle: {
        color: '#1e40af'
      },
      symbol: 'circle',
      symbolSize: navData.length > 60 ? 0 : 6,
      markPoint: markPointData.length > 0 ? {
        data: markPointData,
        tooltip: {
          formatter: (params: any) => {
            const date = navData[params.data.xAxis]?.date || ''
            const nav = params.data.yAxis
            return `${params.name}<br/>${date}<br/>净值: ${nav}`
          }
        }
      } : undefined
    }]

    if (hasBenchmark) {
      seriesList.push({
        name: benchmarkLegendName.value,
        type: 'line',
        data: benchmarkSeriesData,
        smooth: true,
        lineStyle: {
          color: '#9ca3af',
          width: 1.5,
          type: 'dashed'
        },
        itemStyle: {
          color: '#9ca3af'
        },
        symbol: 'none',
        connectNulls: true
      })
    }
    const startNav = navData[0]?.nav || 1
    const getShortName = (name: string) => {
      const match = name.match(/^(.*?)\(/)
      return match ? match[1] : name
    }
    const tooltipFormatter = hasBenchmark
      ? (params: any) => {
          const idx = params[0].dataIndex
          const fullDate = navData[idx]?.date || params[0].name
          let result = `<div style="font-weight:600;margin-bottom:4px">${fullDate}</div>`
          params.forEach((p: any) => {
            if (p.value !== null && p.value !== undefined) {
              const val = typeof p.value === 'number' ? p.value : parseFloat(p.value)
              const shortName = getShortName(p.seriesName)
              const ret = ((val - startNav) / startNav) * 100
              const returnStr = ` <span style="color:${ret >= 0 ? '#ef4444' : '#22c55e'};font-size:11px">(${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%)</span>`
              result += `<div><span style="color:${p.color}">●</span> ${shortName}: <b>${typeof p.value === 'number' ? p.value.toFixed(4) : p.value}</b>${returnStr}</div>`
            }
          })
          return result
        }
      : (params: any) => {
          const idx = params[0].dataIndex
          const fullDate = navData[idx]?.date || params[0].name
          const val = typeof params[0].value === 'number' ? params[0].value : parseFloat(params[0].value)
          const ret = ((val - startNav) / startNav) * 100
          const color = ret >= 0 ? '#ef4444' : '#22c55e'
          return `<div style="font-weight:600;margin-bottom:4px">${fullDate}</div>
                  <div><span style="color:${params[0].color}">●</span> 净值: <b>${val.toFixed(4)}</b></div>
                  <div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.1)">
                    <span style="color:${color}">相对起始: ${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%</span>
                  </div>`
        }

  chart.setOption({
    ...titleOption,
    tooltip: {
      trigger: 'axis',
      formatter: tooltipFormatter
    },
    legend: hasBenchmark ? {
      show: true,
      top: 0,
      right: 10,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 15,
      textStyle: { fontSize: 11, color: '#6b7280' },
      data: ['净值', benchmarkLegendName.value]
    } : undefined,
    grid: {
      left: 10,
      right: 10,
      bottom: 40,
      top: hasBenchmark ? 30 : 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: navData.map(t => {
        const dateStr = t.date
        if (dateStr.length === 10 && dateStr.includes('/')) {
          const parts = dateStr.split('/')
          return `${parts[0].substring(2)}-${parts[1]}-${parts[2]}`
        }
        return dateStr
      }),
      axisLabel: {
        rotate: 0,
        fontSize: 11,
        interval: 'auto',
        margin: 8
      },
      axisTick: {
        alignWithLabel: true
      },
      axisLine: {
        show: true
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        height: 20,
        bottom: 2,
        borderColor: 'transparent',
        backgroundColor: 'rgba(0,0,0,0.05)',
        fillerColor: 'rgba(30, 64, 175, 0.2)',
        handleStyle: {
          color: '#1e40af'
        },
        textStyle: {
          fontSize: 10
        }
      }
    ],
    yAxis: {
      type: 'value',
      min: Math.max(0, minNav - padding),
      max: maxNav + padding,
      axisLabel: {
        fontSize: 11,
        interval: 'auto',
        formatter: (value: number) => value.toFixed(4),
        margin: 4
      },
      splitNumber: 5,
      axisLine: {
        show: true
      },
      axisTick: {
        show: true
      }
    },
    series: seriesList
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  
  // 计算区间年化收益率并更新显示（仅固收产品）
  const updateRangeAnnualReturn = (start: number, end: number) => {
    const isFixedIncome = product.value?.type === 'fixed_income'
    if (!isFixedIncome) return
    
    const navData = filteredNavTransactions.value
    if (navData.length < 2) {
      chart!.setOption({ title: [{ text: '' }] })
      return
    }
    
    const startIdx = Math.floor((start / 100) * (navData.length - 1))
    const endIdx = Math.ceil((end / 100) * (navData.length - 1))
    const visibleData = navData.slice(startIdx, endIdx + 1)
    
    if (visibleData.length < 2) {
      chart!.setOption({ title: [{ text: '' }] })
      return
    }
    
    const startNav = visibleData[0].nav
    const endNav = visibleData[visibleData.length - 1].nav
    const startTimestamp = visibleData[0].timestamp
    const endTimestamp = visibleData[visibleData.length - 1].timestamp
    
    // 计算持有天数
    const days = (endTimestamp - startTimestamp) / (24 * 60 * 60 * 1000)
    
    if (days < 1 || startNav <= 0) {
      chart!.setOption({ title: [{ text: '' }] })
      return
    }
    
    // 计算年化收益率：((终值/初值)^(365/天数) - 1) * 100%
    const totalReturn = endNav / startNav
    const annualReturn = (Math.pow(totalReturn, 365 / days) - 1) * 100
    const totalReturnPct = (totalReturn - 1) * 100
    
    const color = annualReturn >= 0 ? '#ef4444' : '#22c55e'
    
    chart!.setOption({
      title: [
        {
          text: `区间年化: ${annualReturn >= 0 ? '+' : ''}${annualReturn.toFixed(2)}%`,
          subtext: `累计: ${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% · ${Math.floor(days)}天`,
          left: 'right',
          bottom: 60,
          textAlign: 'right',
          textStyle: {
            fontSize: 14,
            fontWeight: 600,
            color
          },
          subtextStyle: {
            fontSize: 11,
            color: '#8e8e93'
          }
        }
      ]
    })
  }
  
  // 监听 dataZoom 事件，动态调整 y 轴范围和显示区间年化
  chart.on('dataZoom', () => {
    const option = chart!.getOption()
    const dataZoomOpt = option.dataZoom as any[]
    if (!dataZoomOpt || dataZoomOpt.length === 0) return
    
    const start = dataZoomOpt[0].start
    const end = dataZoomOpt[0].end
    const navData = filteredNavTransactions.value
    if (navData.length === 0) return
    
    const startIdx = Math.floor((start / 100) * (navData.length - 1))
    const endIdx = Math.ceil((end / 100) * (navData.length - 1))
    const visibleData = navData.slice(startIdx, endIdx + 1)
    
    if (visibleData.length === 0) return
    
    // 收集可见区间内的净值范围
    let min = Infinity
    let max = -Infinity
    for (const item of visibleData) {
      if (item.nav < min) min = item.nav
      if (item.nav > max) max = item.nav
    }

    // 同步重新归一化基准线，并将基准值纳入 Y 轴范围
    const hasBenchmark = benchmarkData.value.length > 0
    let newBenchmarkData: (number | null)[] = []
    if (hasBenchmark) {
      newBenchmarkData = getBenchmarkSeriesData(navData, startIdx)
      // 只取可见区间内的基准值
      const benchVals = newBenchmarkData
        .slice(startIdx, endIdx + 1)
        .filter((v): v is number => v !== null)
      if (benchVals.length > 0) {
        min = Math.min(min, ...benchVals)
        max = Math.max(max, ...benchVals)
      }
    }

    const range = max - min
    const padding = range * 0.1 || 0.01
    const yAxisUpdate: any = {
      min: Math.max(0, min - padding),
      max: max + padding
    }

    if (hasBenchmark) {
      chart!.setOption({
        yAxis: yAxisUpdate,
        series: [{}, { data: newBenchmarkData }]
      })
    } else {
      chart!.setOption({ yAxis: yAxisUpdate })
    }
    
    // 更新区间年化收益率显示
    updateRangeAnnualReturn(start, end)
  })
  
  // 初始更新一次区间年化
  updateRangeAnnualReturn(0, 100)
  
  updateChart()
}

const handleResize = () => {
  chart?.resize()
  allocationChart?.resize()
  holdingsChart?.resize()
  termDepositChart?.resize()
}

const goBackToProducts = () => {
  // 传递筛选状态 query params，使产品列表页恢复之前的选择
  const query: Record<string, string> = {}
  if (route.query.status) query.status = route.query.status as string
  if (route.query.type) query.type = route.query.type as string
  
  if (!product.value) {
    router.push({ name: 'products', query })
    return
  }
  
  const typeMap: Record<string, string> = {
    'equity': 'equity',
    'fund': 'equity',
    'fixed_income': 'fixed-income',
    'term_deposit': 'term-deposit'
  }
  
  const routeName = typeMap[product.value.type] || 'products'
  router.push({ name: routeName, query })
}

// ==================== 比较基准数据加载 ====================
async function loadBenchmarkData() {
  if (!product.value?.benchmarkEnabled || !product.value?.benchmarkFormula) {
    benchmarkData.value = []
    return
  }
  try {
    const indexCodes = getFormulaIndexCodes(product.value.benchmarkFormula)
    if (indexCodes.length === 0) {
      benchmarkData.value = []
      return
    }
    const allIndexData = await fetchMultipleIndexHistory(indexCodes)
    const navList = allNavTransactions.value
    if (navList.length === 0) {
      benchmarkData.value = []
      return
    }
    const startDate = navList[0].timestamp
    const startNav = navList[0].nav
    benchmarkData.value = calcBenchmarkSeries(
      product.value.benchmarkFormula,
      allIndexData,
      startDate,
      startNav
    )
  } catch (e) {
    console.error('加载基准数据失败:', e)
    benchmarkData.value = []
  }
}

// 构建基准值查找表：日期字符串 "YYYY-MM-DD" -> 基准净值
const benchmarkValueMap = computed(() => {
  const map = new Map<string, number>()
  for (const point of benchmarkData.value) {
    const d = new Date(point.date)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map.set(dateStr, point.value)
  }
  return map
})

// 将基准数据对齐到净值日期序列（前向填充），并按指定起点重归一化
// startIdx: 重归一化的起始索引，默认0（区间起点）
function getBenchmarkSeriesData(navData: { date: string; nav: number }[], startIdx: number = 0): (number | null)[] {
  if (benchmarkData.value.length === 0 || navData.length === 0) return []
  const map = benchmarkValueMap.value
  let lastVal: number | null = null
  const aligned = navData.map(t => {
    const dateStr = t.date.replace(/\//g, '-')
    const val = map.get(dateStr)
    if (val !== undefined) {
      lastVal = val
      return val
    }
    return lastVal
  })
  // 从 startIdx 开始找第一个非空基准值作为重归一化基准
  let ratioBase: number | null = null
  for (let i = startIdx; i < aligned.length; i++) {
    if (aligned[i] !== null) {
      ratioBase = aligned[i]
      break
    }
  }
  if (ratioBase === null || ratioBase === 0) return []
  const startNav = navData[startIdx].nav
  return aligned.map(v =>
    v === null ? null : parseFloat((startNav * (v / ratioBase)).toFixed(4))
  )
}

onMounted(async () => {
  await initFinance()
  if (!product.value) {
    router.push({ name: 'products' })
    return
  }
  initChart()
  window.addEventListener('resize', handleResize)
  // 权益产品自动加载阶段涨幅和持仓信息
  if ((product.value.type === 'equity' || product.value.type === 'fund') && product.value.code) {
    handleFetchStageGains()
    handleFetchHoldings()
  }
  // 加载比较基准数据
  if (product.value.benchmarkEnabled) {
    await loadBenchmarkData()
    updateChart()
  }
  // 定期存款产品初始化收益预测图表
  if (isTermDeposit.value) {
    setTimeout(() => {
      renderTermDepositChart()
    }, 200)
  }
})

watch([navRange, filteredNavTransactions], () => {
  updateChart()
})

watch(benchmarkData, () => {
  updateChart()
})

watch(holdingsData, () => {
  renderHoldingsCharts()
})

watch(termDepositProjection, () => {
  if (isTermDeposit.value) {
    setTimeout(() => {
      renderTermDepositChart()
    }, 100)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  allocationChart?.dispose()
  holdingsChart?.dispose()
  termDepositChart?.dispose()
})
</script>

<template>
  <div v-if="product" class="space-y-6">
    <!-- 顶部标题栏 -->
    <div class="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4">
      <div class="flex items-center space-x-4">
        <button 
          @click="goBackToProducts()"
          class="p-2 text-apple-secondary hover:text-apple-text hover:bg-black/5 rounded-full transition-colors flex-shrink-0"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-3">
            <h2 class="text-xl font-semibold text-apple-text truncate">{{ product.name }}</h2>
            <button
              @click.stop="handleEdit"
              class="p-1.5 text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
              title="编辑产品"
            >
              <Edit class="w-4 h-4" />
            </button>
            <span v-if="product.code" class="text-xs font-mono bg-black/5 text-apple-secondary px-2 py-0.5 rounded-full flex-shrink-0">
              {{ product.code }}
            </span>
          </div>
          <div class="flex items-center space-x-2 mt-1 flex-wrap">
            <span class="apple-tag" :style="{ color: getProductTypeColor(product.type) }">
              {{ getProductTypeLabel(product.type) }}
            </span>
            <span v-if="product.type === 'fixed_income' && (product as any).holdingTerm" class="text-xs text-fixed-income bg-fixed-income/10 px-2 py-0.5 rounded-full">
              持有期限 {{ (product as any).holdingTerm }}
            </span>
            <span v-if="product.note" class="text-sm text-apple-secondary truncate">{{ product.note }}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2 flex-wrap gap-2">
        <button
          v-if="product.code && product.type !== 'equity' && product.type !== 'fund' && product.navSource !== '' && product.navSource !== 'tiantian'"
          @click="handleFetchNavHistory"
          :disabled="fetchingNavHistory"
          class="apple-btn-primary text-sm"
        >
          <Calendar class="w-4 h-4" :class="{ 'animate-spin': fetchingNavHistory }" />
          <span>{{ fetchingNavHistory ? '查询中...' : '查询历史净值' }}</span>
        </button>
        <button
          v-if="product.code && (product.type === 'equity' || product.type === 'fund' || (product.type === 'fixed_income' && product.navSource === 'tiantian'))"
          @click="handleBackfillNav"
          :disabled="backfillingNav"
          class="apple-btn-primary text-sm"
        >
          <History class="w-4 h-4" :class="{ 'animate-spin': backfillingNav }" />
          <span>{{ backfillingNav ? '补全中...' : '补全历史净值' }}</span>
        </button>
        <button
          v-if="product.code"
          @click="handleFetchNav"
          :disabled="fetchingNav"
          class="apple-btn-primary text-sm"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': fetchingNav }" />
          <span>{{ fetchingNav ? '查询中...' : '查询净值' }}</span>
        </button>
      </div>
    </div>
    <p v-if="navFetchError" class="text-sm text-profit mt-2">{{ navFetchError }}</p>
    <p v-if="navHistorySuccess" class="text-sm text-loss mt-2">{{ navHistorySuccess }}</p>

    <!-- 持仓概览 + 阶段涨幅/收益率 并排显示 -->
    <div :class="(product.type === 'equity' || product.type === 'fund' || (product.type === 'fixed_income' && fixedIncomeStageGains)) ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''">
      <!-- 持仓概览 -->
      <div v-if="position" class="glass-card p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-apple-text">持仓概览</h3>
            <span class="text-xs text-apple-secondary bg-black/5 px-2 py-0.5 rounded-full">
              持有 {{ position?.holdingDays || 0 }} 天
            </span>
            <span class="text-xs text-apple-secondary bg-black/5 px-2 py-0.5 rounded-full">
              {{ (position?.totalShares || 0).toFixed(2) }} 份
            </span>
          </div>
          <component 
            :is="(position?.profitRate ?? 0) >= 0 ? TrendingUp : TrendingDown" 
            :class="['w-5 h-5', (position?.profitRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']"
          />
        </div>
        <div :class="['grid gap-4', (product.type === 'equity' || product.type === 'fund') ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4']">
          <div>
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">当前市值</p>
            <p class="text-[15px] font-semibold text-apple-text mt-1">{{ formatCurrency1(position?.marketValue || 0) }}</p>
          </div>
          <div>
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">盈亏金额</p>
            <p :class="['text-[15px] font-semibold mt-1', (position?.profit ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatCurrency1(position?.profit || 0) }}
            </p>
          </div>
          <div>
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">收益率</p>
            <p :class="['text-[15px] font-semibold mt-1', (position?.profitRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatPercent(position?.profitRate || 0) }}
            </p>
          </div>
          <div v-if="product.type !== 'equity' && product.type !== 'fund'">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">年化收益率</p>
            <p :class="['text-[15px] font-semibold mt-1', (position?.annualRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatPercent(position?.annualRate || 0) }}
            </p>
          </div>
        </div>
      </div>

      <!-- 定期存款专属可视化 -->
      <div v-if="isTermDeposit" class="space-y-4">
        <!-- 定期存款属性卡片 -->
        <div class="glass-card p-5">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" /><path d="M3 14h18" /><path d="M7 14v4" /><path d="M17 14v4" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-apple-text">存款详情</h3>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <div v-if="product.interestRate">
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">年利率</p>
              <p class="text-[15px] font-semibold text-amber-600 mt-1">{{ product.interestRate.toFixed(2) }}%</p>
            </div>
            <div v-if="product.durationMonths">
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">存款期限</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">{{ product.durationMonths }} 个月</p>
            </div>
            <div v-if="product.minAmount">
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">本金</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">{{ formatCurrency1(product.minAmount) }}</p>
            </div>
            <div v-if="product.interestMethod">
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">付息方式</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">
                {{ product.interestMethod === 'maturity' ? '到期付息' : product.interestMethod === 'monthly' ? '按月付息' : '按季付息' }}
              </p>
            </div>
            <div v-if="product.bankName">
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">存款银行</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">{{ product.bankName }}</p>
            </div>
            <div v-if="maturityDateComputed">
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">到期日期</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">{{ maturityDateComputed }}</p>
            </div>
          </div>
        </div>

        <!-- 存款进度条 + 到期倒计时 -->
        <div v-if="termDepositProgress" class="glass-card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-apple-text">存款进度</h3>
            <div v-if="maturityCountdown" class="flex items-center gap-2">
              <span v-if="maturityCountdown.expired" class="text-sm text-apple-secondary">已到期</span>
              <span v-else class="text-sm font-medium text-amber-600">
                还有 {{ maturityCountdown.days }} 天到期
              </span>
            </div>
          </div>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-apple-secondary">已存 {{ termDepositProgress.elapsedDays }} 天</span>
              <span class="text-apple-secondary">共 {{ termDepositProgress.totalDays }} 天</span>
            </div>
            <div class="relative h-3 bg-black/5 rounded-full overflow-hidden">
              <div 
                class="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                :style="{ width: `${termDepositProgress.progress}%` }"
              ></div>
            </div>
            <div class="flex justify-between text-xs text-apple-secondary">
              <span>起始日</span>
              <span class="font-medium text-amber-600">{{ termDepositProgress.progress.toFixed(1) }}%</span>
              <span>{{ maturityDateComputed }}</span>
            </div>
          </div>
        </div>

        <!-- 收益预测 -->
        <div v-if="termDepositProjection" class="glass-card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-apple-text">收益预测</h3>
            <span class="text-xs text-apple-secondary">基于 {{ product.interestRate?.toFixed(2) }}% 年利率</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">本金</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">{{ formatCurrency1(termDepositProjection.principal) }}</p>
            </div>
            <div>
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">预计收益</p>
              <p class="text-[15px] font-semibold text-amber-600 mt-1">{{ formatCurrency1(termDepositProjection.totalInterest) }}</p>
            </div>
            <div>
              <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">到期本息</p>
              <p class="text-[15px] font-semibold text-apple-text mt-1">{{ formatCurrency1(termDepositProjection.maturityAmount) }}</p>
            </div>
          </div>
          <div ref="termDepositChartRef" class="w-full h-48"></div>
        </div>
      </div>

      <!-- 阶段涨幅 (仅权益产品显示) -->
      <div v-if="(product.type === 'equity' || product.type === 'fund') && stageGains" class="glass-card p-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold text-apple-text">阶段涨幅</h3>
          <button
            @click="handleFetchStageGains"
            :disabled="fetchingStageGains"
            class="text-sm text-primary-500 hover:text-primary-600 disabled:opacity-50 flex items-center space-x-1"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingStageGains }" />
            <span>{{ fetchingStageGains ? '刷新中...' : '刷新' }}</span>
          </button>
        </div>
        <div class="grid grid-cols-4 md:grid-cols-4 gap-3">
          <div v-if="stageGains['1w'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近1周</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['1w'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['1w'] >= 0 ? '+' : '' }}{{ stageGains['1w'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['1m'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近1月</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['1m'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['1m'] >= 0 ? '+' : '' }}{{ stageGains['1m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['3m'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近3月</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['3m'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['3m'] >= 0 ? '+' : '' }}{{ stageGains['3m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['6m'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近6月</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['6m'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['6m'] >= 0 ? '+' : '' }}{{ stageGains['6m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['1y'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近1年</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['1y'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['1y'] >= 0 ? '+' : '' }}{{ stageGains['1y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['2y'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近2年</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['2y'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['2y'] >= 0 ? '+' : '' }}{{ stageGains['2y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['3y'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近3年</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['3y'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains['3y'] >= 0 ? '+' : '' }}{{ stageGains['3y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains.ytd !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">今年来</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains.ytd >= 0 ? 'text-profit' : 'text-loss'">
              {{ stageGains.ytd >= 0 ? '+' : '' }}{{ stageGains.ytd.toFixed(2) }}%
            </p>
          </div>
        </div>
      </div>
      <div v-else-if="(product.type === 'equity' || product.type === 'fund') && !stageGains && !fetchingStageGains" class="glass-card p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-apple-text">阶段涨幅</h3>
          <button
            @click="handleFetchStageGains"
            :disabled="fetchingStageGains"
            class="text-sm text-primary-500 hover:text-primary-600 disabled:opacity-50 flex items-center space-x-1"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingStageGains }" />
            <span>加载</span>
          </button>
        </div>
        <p class="text-sm text-apple-secondary mt-2">点击加载查看权益阶段涨幅数据</p>
      </div>
      <div v-else-if="(product.type === 'equity' || product.type === 'fund') && fetchingStageGains" class="glass-card p-5">
        <h3 class="text-lg font-semibold text-apple-text mb-2">阶段涨幅</h3>
        <p class="text-sm text-apple-secondary">加载中...</p>
      </div>

      <!-- 年化收益率统计 (仅固收产品显示) -->
      <div v-if="product.type === 'fixed_income' && fixedIncomeStageGains" class="glass-card p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-apple-text">年化收益率统计</h3>
            <span v-if="inceptionDays !== null" class="text-xs text-apple-secondary bg-black/5 px-2 py-0.5 rounded-full">
              成立 {{ inceptionDays }} 天
            </span>
          </div>
          <span class="text-xs text-apple-secondary">基于历史净值计算</span>
        </div>
        <div class="grid grid-cols-5 md:grid-cols-5 gap-3">
          <div v-if="fixedIncomeStageGains['1m'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近1月</p>
            <p class="text-sm font-semibold mt-1" :class="fixedIncomeStageGains['1m'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ fixedIncomeStageGains['1m'] >= 0 ? '+' : '' }}{{ fixedIncomeStageGains['1m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="fixedIncomeStageGains['3m'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近3月</p>
            <p class="text-sm font-semibold mt-1" :class="fixedIncomeStageGains['3m'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ fixedIncomeStageGains['3m'] >= 0 ? '+' : '' }}{{ fixedIncomeStageGains['3m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="fixedIncomeStageGains['6m'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近6月</p>
            <p class="text-sm font-semibold mt-1" :class="fixedIncomeStageGains['6m'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ fixedIncomeStageGains['6m'] >= 0 ? '+' : '' }}{{ fixedIncomeStageGains['6m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="fixedIncomeStageGains['1y'] !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">近1年</p>
            <p class="text-sm font-semibold mt-1" :class="fixedIncomeStageGains['1y'] >= 0 ? 'text-profit' : 'text-loss'">
              {{ fixedIncomeStageGains['1y'] >= 0 ? '+' : '' }}{{ fixedIncomeStageGains['1y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="fixedIncomeStageGains.sinceInception !== undefined" class="text-center">
            <p class="text-[11px] font-medium text-apple-secondary uppercase tracking-wider">成立以来</p>
            <p class="text-sm font-semibold mt-1" :class="fixedIncomeStageGains.sinceInception >= 0 ? 'text-profit' : 'text-loss'">
              {{ fixedIncomeStageGains.sinceInception >= 0 ? '+' : '' }}{{ fixedIncomeStageGains.sinceInception.toFixed(2) }}%
            </p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 持仓信息 + 净值走势 并排显示 -->
    <div :class="(product.type === 'equity' || product.type === 'fund') ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch' : ''">
      <!-- 持仓信息 (仅权益产品显示) -->
      <div v-if="(product.type === 'equity' || product.type === 'fund') && holdingsData" class="glass-card p-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold text-apple-text">持仓信息</h3>
          <div class="flex items-center space-x-3">
            <span v-if="holdingsData.reportDate" class="text-xs text-apple-secondary">截止 {{ holdingsData.reportDate }}</span>
            <button
              @click="handleFetchHoldings"
              :disabled="fetchingHoldings"
              class="text-sm text-primary-500 hover:text-primary-600 disabled:opacity-50 flex items-center space-x-1"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingHoldings }" />
              <span>{{ fetchingHoldings ? '刷新中...' : '刷新' }}</span>
            </button>
          </div>
        </div>
        <p v-if="holdingsData.dataSource" class="text-xs text-apple-secondary mb-3">ℹ️ {{ holdingsData.dataSource }}</p>

        <!-- 净资产规模 -->
        <div v-if="holdingsData.assetAllocation?.netAsset" class="text-xs text-apple-secondary mb-3">
          净资产规模：<span class="font-semibold text-apple-text">{{ holdingsData.assetAllocation.netAsset.toFixed(2) }} 亿元</span>
        </div>

        <!-- 两个分段条形图上下排列显示 -->
        <div class="flex flex-col space-y-3">
          <!-- 资产配置分段条形图（上方） -->
          <div class="w-full">
            <h4 class="text-sm font-medium text-apple-secondary mb-2 text-center">资产配置</h4>
            <div ref="allocationChartRef" class="w-full holdings-chart-h"></div>
          </div>
          <!-- 前十大重仓股分段条形图（下方） -->
          <div v-if="holdingsData.stocks && holdingsData.stocks.length > 0" class="w-full">
            <h4 class="text-sm font-medium text-apple-secondary mb-2 text-center">前十大重仓股</h4>
            <div ref="holdingsChartRef" class="w-full holdings-chart-h"></div>
          </div>
        </div>
      </div>
      <div v-else-if="(product.type === 'equity' || product.type === 'fund') && !holdingsData && !fetchingHoldings" class="glass-card p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-apple-text">持仓信息</h3>
          <button
            @click="handleFetchHoldings"
            :disabled="fetchingHoldings"
            class="text-sm text-primary-500 hover:text-primary-600 disabled:opacity-50 flex items-center space-x-1"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingHoldings }" />
            <span>加载</span>
          </button>
        </div>
        <p class="text-sm text-apple-secondary mt-2">点击加载查看权益持仓信息</p>
      </div>
      <div v-else-if="(product.type === 'equity' || product.type === 'fund') && fetchingHoldings && !holdingsData" class="glass-card p-5">
        <h3 class="text-lg font-semibold text-apple-text mb-2">持仓信息</h3>
        <p class="text-sm text-apple-secondary">加载中...</p>
      </div>
      
      <!-- 净值走势 -->
      <div class="glass-card p-4 flex flex-col min-h-[260px] md:min-h-[340px]">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold text-apple-text">净值走势</h3>
          <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
            <button
              v-for="opt in navRangeOptions"
              :key="opt.value"
              @click="navRange = opt.value"
              :class="[
                'px-2.5 py-1 text-xs rounded-full transition-colors',
                navRange === opt.value
                  ? 'bg-white text-apple-text shadow-sm font-medium'
                  : 'text-apple-secondary hover:text-apple-text'
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div ref="chartRef" class="flex-1 min-h-0 w-full"></div>
      </div>
    </div>
    
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-apple-text">历史交易</h3>
        <button 
          @click="handleAddTransaction"
          class="apple-btn-primary text-sm"
        >
          <Plus class="w-4 h-4" />
          <span>新增交易</span>
        </button>
      </div>
      <!-- 日期区间选择 + 交易类型筛选 -->
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <!-- 交易类型筛选 -->
        <div class="flex items-center space-x-1">
          <span class="text-xs text-apple-secondary">类型:</span>
          <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
            <button
              v-for="opt in txTypeOptions"
              :key="opt.value"
              @click="txType = opt.value"
              :class="[
                'px-2.5 py-1 text-xs rounded-full transition-all duration-300',
                txType === opt.value
                  ? 'bg-white text-apple-text shadow-sm font-medium'
                  : 'text-apple-secondary hover:text-apple-text'
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        
        <!-- 日期区间选择 -->
        <div class="flex items-center space-x-1">
          <span class="text-xs text-apple-secondary">区间:</span>
          <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
            <button
              v-for="opt in txDateRangeOptions"
              :key="opt.value"
              @click="txDateRange = opt.value"
              :class="[
                'px-2.5 py-1 text-xs rounded-full transition-all duration-300',
                txDateRange === opt.value
                  ? 'bg-white text-apple-text shadow-sm font-medium'
                  : 'text-apple-secondary hover:text-apple-text'
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        
        <template v-if="txDateRange === 'custom'">
          <input
            v-model="txCustomStartDate"
            type="date"
            class="glass-input px-3 py-1 text-xs rounded-full outline-none"
          />
          <span class="text-apple-secondary text-xs">至</span>
          <input
            v-model="txCustomEndDate"
            type="date"
            class="glass-input px-3 py-1 text-xs rounded-full outline-none"
          />
        </template>
        <span class="text-xs text-apple-secondary ml-auto">共 {{ sortedTransactions.length }} 条记录</span>
      </div>
      <!-- 移动端卡片布局 -->
      <div class="md:hidden space-y-2">
        <div v-if="sortedTransactions.length > 0" class="space-y-2">
          <TransactionCard 
            v-for="transaction in sortedTransactions" 
            :key="transaction.id" 
            :transaction="transaction"
            :change-percent="transaction.type === 'nav_update' ? getNavChange(transaction) : undefined"
            :hide-product-name="true"
            @edit="handleEditTransaction"
            @delete="handleDeleteTransaction"
          />
        </div>
        <div v-else-if="transactions.length === 0" class="glass-card p-8 text-center">
          <p class="text-apple-text text-[16px] font-medium">暂无交易记录</p>
          <p class="text-apple-secondary text-[13px] mt-2">点击上方按钮添加交易记录</p>
        </div>
        <div v-else class="glass-card p-8 text-center">
          <p class="text-apple-text text-[16px] font-medium">当前日期区间内无交易记录</p>
          <p class="text-apple-secondary text-[13px] mt-2">试试切换为"全部"查看更多</p>
        </div>
      </div>
      
      <!-- 桌面端表格布局 -->
      <div class="hidden md:block">
        <div class="glass-card overflow-hidden">
          <div class="overflow-x-auto">
          <table class="w-full apple-table">
            <thead>
              <tr>
                <th class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleTxSort('date')">
                  <div class="flex items-center space-x-1"><span>日期</span><component :is="getTxSortIcon('date')" class="w-4 h-4" :class="txSortKey === 'date' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleTxSort('type')">
                  <div class="flex items-center space-x-1"><span>类型</span><component :is="getTxSortIcon('type')" class="w-4 h-4" :class="txSortKey === 'type' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleTxSort('amount')">
                  <div class="flex items-center justify-end space-x-1"><span>金额</span><component :is="getTxSortIcon('amount')" class="w-4 h-4" :class="txSortKey === 'amount' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleTxSort('price')">
                  <div class="flex items-center justify-end space-x-1"><span>单价/净值</span><component :is="getTxSortIcon('price')" class="w-4 h-4" :class="txSortKey === 'price' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">涨跌幅</th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleTxSort('shares')">
                  <div class="flex items-center justify-end space-x-1"><span>份额</span><component :is="getTxSortIcon('shares')" class="w-4 h-4" :class="txSortKey === 'shares' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleTxSort('fee')">
                  <div class="flex items-center justify-end space-x-1"><span>手续费</span><component :is="getTxSortIcon('fee')" class="w-4 h-4" :class="txSortKey === 'fee' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">备注</th>
                <th class="px-4 py-2.5 whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-apple-border/50">
              <tr v-for="transaction in sortedTransactions" :key="transaction.id">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-apple-text">{{ new Date(transaction.date).toLocaleDateString('zh-CN') }}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span 
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                    :class="{
                      'bg-loss/10 text-loss': transaction.type === 'buy',
                      'bg-profit/10 text-profit': transaction.type === 'sell',
                      'bg-yellow-50 text-yellow-600': transaction.type === 'dividend',
                      'bg-primary-50 text-primary-500': transaction.type === 'nav_update'
                    }"
                  >
                    {{ transaction.type === 'buy' ? '买入' : transaction.type === 'sell' ? '卖出' : transaction.type === 'dividend' ? '分红' : '净值更新' }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm" :class="transaction.type === 'buy' ? 'text-apple-text' : transaction.type === 'sell' ? 'text-profit' : 'text-yellow-600'">
                  {{ transaction.type === 'buy' ? '-' : '+' }}{{ formatCurrency(transaction.amount) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right text-apple-secondary">{{ transaction.price.toFixed(4) }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-medium" :class="getNavChangeClass(transaction)">{{ getNavChange(transaction) }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right text-apple-secondary">{{ transaction.shares.toFixed(4) }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right text-apple-secondary">{{ formatCurrency(transaction.fee) }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-apple-secondary">{{ transaction.note || '-' }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center">
                  <div class="flex items-center justify-center space-x-2">
                    <button 
                      @click="handleEditTransaction(transaction)"
                      class="w-8 h-8 flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-full transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button 
                      @click="handleDeleteTransaction(transaction.id)"
                      class="w-8 h-8 flex items-center justify-center text-apple-secondary hover:text-profit hover:bg-profit/10 rounded-full transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
          <div v-if="transactions.length === 0" class="px-6 py-12 text-center">
            <p class="text-apple-secondary">暂无交易记录</p>
            <p class="text-apple-secondary text-sm mt-2 opacity-70">点击上方按钮添加交易记录</p>
          </div>
          <div v-else-if="sortedTransactions.length === 0" class="px-6 py-12 text-center">
            <p class="text-apple-secondary">当前日期区间内无交易记录</p>
            <p class="text-apple-secondary text-sm mt-2 opacity-70">试试切换为"全部"查看更多</p>
          </div>
        </div>
      </div>
    </div>
    
    <TransactionModal 
      :visible="showModal"
      :products="product ? [product] : []"
      :current-product="product || null"
      :current-position="position || null"
      :transactions="transactions"
      :edit-transaction="editingTransaction"
      @close="showModal = false"
      @submit="handleSubmitTransaction"
    />
    
    <ProductModal 
      :visible="showProductModal"
      :edit-product="editingProduct"
      @close="showProductModal = false"
      @submit="handleSubmit"
    />
  </div>
</template>
