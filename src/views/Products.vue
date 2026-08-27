<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown, RefreshCw, Eye, EyeOff, Scale, X, TrendingUp, TrendingDown } from 'lucide-vue-next'
import ProductModal from '@/components/ProductModal.vue'
import { useFinance } from '@/composables/useFinance'
import { useCompare } from '@/composables/useCompare'
import { useRouter, useRoute } from 'vue-router'
import type { ProductType, ProductStatus, Product } from '@/types'
import { PRODUCT_STATUS_OPTIONS, DCA_CYCLE_OPTIONS } from '@/types'
import { formatCurrency, formatCurrency1, formatPercent, getDateOnly } from '@/utils/format'
import { calculateXIRR } from '@/utils/xirr'
import { fetchEquityStageGainsBatch, fetchAggregatedHoldings, fetchCmbNavBatch, fetchEquityNav, type StageGains, type AggregatedHoldingsResult, type AggregatedStock } from '@/utils/equityApi'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps<{
  type?: ProductType
}>()

const { products, addProduct, updateProduct, deleteProduct, calculatePosition, getTransactionsByProductId, PRODUCT_TYPE_OPTIONS, transactions, addTransaction, equitySettings, fixedIncomeSettings, saveDisplaySettings } = useFinance()

const { toggleCompare, isInCompare, compareType, compareIds, switchType, clearCompare } = useCompare()

// ==================== 对比面板状态 ====================
const showComparePanel = ref(false)

// 对比区间选择
type RangeType = '1m' | '3m' | '1y' | '3y' | 'all' | 'custom'
const compareRangeType = ref<RangeType>('1y')
const compareCustomStart = ref('')
const compareCustomEnd = ref('')

const rangeOptions = [
  { value: '1m', label: '近1月', days: 30 },
  { value: '3m', label: '近3月', days: 90 },
  { value: '1y', label: '近1年', days: 365 },
  { value: '3y', label: '近3年', days: 1095 },
  { value: 'all', label: '全部', days: 0 },
  { value: 'custom', label: '自定义', days: 0 }
] as const

const compareDateBounds = computed<{ start: number; end: number } | null>(() => {
  if (compareRangeType.value === 'all') return null
  if (compareRangeType.value === 'custom') {
    const start = compareCustomStart.value ? new Date(compareCustomStart.value + 'T00:00:00').getTime() : 0
    const end = compareCustomEnd.value ? new Date(compareCustomEnd.value + 'T23:59:59').getTime() : Date.now()
    return { start, end }
  }
  const opt = rangeOptions.find(o => o.value === compareRangeType.value)
  if (!opt || opt.days === 0) return null
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - opt.days)
  cutoff.setHours(0, 0, 0, 0)
  return { start: cutoff.getTime(), end: Date.now() }
})

// 对比产品过滤
const STOCK_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4'
]

const getCompareProductColor = (productId: string) => {
  const idx = compareIds.value.indexOf(productId)
  return STOCK_COLORS[idx % STOCK_COLORS.length]
}

// 对比类型相关计算
const compareIsEquityType = computed(() => compareType.value === 'equity')

const compareAvailableTypes = computed(() => {
  if (props.type === 'equity') {
    return [{ value: 'equity', label: '权益' }]
  } else if (props.type === 'fixed_income') {
    return [{ value: 'fixed_income', label: '固收' }]
  } else if (props.type === 'term_deposit') {
    return [{ value: 'term_deposit', label: '定存' }]
  }
  return [
    { value: 'equity', label: '权益' },
    { value: 'fixed_income', label: '固收' },
    { value: 'term_deposit', label: '定存' }
  ]
})

// ==================== 收益率计算逻辑 ====================
interface NavPoint {
  date: number
  nav: number
}

interface RangeReturn {
  totalReturn: number | null
  annualReturn: number | null
}

interface CompareItem {
  product: Product
  color: string
  navSeries: NavPoint[]
  r1m: RangeReturn
  r3m: RangeReturn
  r6m: RangeReturn
  r1y: RangeReturn
  rInception: RangeReturn
  inceptionDays: number
  hasData: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

function getAllNavSeries(productId: string): NavPoint[] {
  return transactions.value
    .filter(t => t.productId === productId && t.type === 'nav_update')
    .map(t => ({ date: getDateOnly(t.date), nav: t.price }))
    .sort((a, b) => a.date - b.date)
}

function getProductNavSeries(productId: string, bounds: { start: number; end: number } | null): NavPoint[] {
  return getAllNavSeries(productId).filter(p => !bounds || (p.date >= bounds.start && p.date <= bounds.end))
}

function calcRangeReturn(allNavSeries: NavPoint[], cutoff: number | null): RangeReturn {
  const empty: RangeReturn = { totalReturn: null, annualReturn: null }
  if (allNavSeries.length < 2) return empty
  const endNav = allNavSeries[allNavSeries.length - 1]
  let startNav: NavPoint | null = null
  if (cutoff !== null) {
    for (let i = allNavSeries.length - 1; i >= 0; i--) {
      if (allNavSeries[i].date <= cutoff) {
        startNav = allNavSeries[i]
        break
      }
    }
  } else {
    startNav = allNavSeries[0]
  }
  if (!startNav) return empty
  const days = (endNav.date - startNav.date) / DAY_MS
  if (startNav.nav <= 0 || days < 1) return empty
  const ratio = endNav.nav / startNav.nav
  return {
    totalReturn: (ratio - 1) * 100,
    annualReturn: (Math.pow(ratio, 365 / days) - 1) * 100
  }
}

function getCompareInceptionDays(allNavSeries: NavPoint[]): number {
  if (allNavSeries.length < 2) return 0
  return Math.floor((allNavSeries[allNavSeries.length - 1].date - allNavSeries[0].date) / DAY_MS)
}

const compareData = computed<CompareItem[]>(() => {
  const now = Date.now()
  return compareIds.value.map(id => {
    const product = products.value.find(p => p.id === id)
    if (!product) return null
    const color = getCompareProductColor(id)
    const allNavSeries = getAllNavSeries(id)
    const navSeries = getProductNavSeries(id, compareDateBounds.value)
    return {
      product,
      color,
      navSeries,
      r1m: calcRangeReturn(allNavSeries, now - 30 * DAY_MS),
      r3m: calcRangeReturn(allNavSeries, now - 90 * DAY_MS),
      r6m: calcRangeReturn(allNavSeries, now - 180 * DAY_MS),
      r1y: calcRangeReturn(allNavSeries, now - 365 * DAY_MS),
      rInception: calcRangeReturn(allNavSeries, null),
      inceptionDays: getCompareInceptionDays(allNavSeries),
      hasData: navSeries.length >= 2
    }
  }).filter(Boolean) as CompareItem[]
})

const getCompareReturnValue = (range: RangeReturn): number | null => {
  return compareIsEquityType.value ? range.totalReturn : range.annualReturn
}

// ==================== 对比表格排序 ====================
type CompareSortKey = 'name' | 'r1m' | 'r3m' | 'r6m' | 'r1y' | 'rInception' | 'inceptionDays'
const compareSortKey = ref<CompareSortKey>('r1y')
const compareSortOrder = ref<'asc' | 'desc'>('desc')

const getCompareSortValue = (item: CompareItem, key: CompareSortKey): number | string => {
  if (key === 'name') return item.product.name
  if (key === 'inceptionDays') return item.inceptionDays
  const range = (item as any)[key] as RangeReturn | undefined
  if (!range) return -Infinity
  return (compareIsEquityType.value ? range.totalReturn : range.annualReturn) ?? -Infinity
}

const sortedCompareData = computed(() => {
  const list = [...compareData.value]
  list.sort((a, b) => {
    const aVal = getCompareSortValue(a, compareSortKey.value)
    const bVal = getCompareSortValue(b, compareSortKey.value)
    if (compareSortKey.value === 'name') {
      return compareSortOrder.value === 'asc'
        ? (aVal as string).localeCompare(bVal as string, 'zh-CN')
        : (bVal as string).localeCompare(aVal as string, 'zh-CN')
    }
    return compareSortOrder.value === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })
  return list
})

const handleCompareSort = (key: CompareSortKey) => {
  if (compareSortKey.value === key) {
    compareSortOrder.value = compareSortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    compareSortKey.value = key
    compareSortOrder.value = 'desc'
  }
}

const getCompareSortIcon = (key: CompareSortKey) => {
  if (compareSortKey.value !== key) return ChevronsUpDown
  return compareSortOrder.value === 'asc' ? ArrowUp : ArrowDown
}

// ==================== ECharts 净值走势图 ====================
const compareChartRef = ref<HTMLDivElement>()
let compareChart: echarts.ECharts | null = null
let zoomStartValue: number | null = null
let zoomEndValue: number | null = null

const initCompareChart = () => {
  if (!compareChartRef.value) return
  compareChart = echarts.init(compareChartRef.value)
  compareChart.on('datazoom', () => {
    const opt = compareChart?.getOption() as any
    const dz = opt?.dataZoom?.[0]
    if (dz) {
      zoomStartValue = dz.startValue ?? null
      zoomEndValue = dz.endValue ?? null
      updateCompareChart()
    }
  })
  updateCompareChart()
}

const updateCompareChart = () => {
  if (!compareChart) return
  const items = compareData.value.filter(item => item.hasData)

  if (items.length === 0) {
    compareChart.clear()
    return
  }

  const allDatesSet = new Set<number>()
  for (const item of items) {
    for (const point of item.navSeries) {
      allDatesSet.add(point.date)
    }
  }
  const sortedDates = Array.from(allDatesSet).sort((a, b) => a - b)

  const series = items.map(item => {
    const navMap = new Map<number, number>()
    for (const point of item.navSeries) {
      navMap.set(point.date, point.nav)
    }
    let firstNav: number
    if (zoomStartValue !== null) {
      const firstInRange = item.navSeries.find(p => p.date >= zoomStartValue!)
      firstNav = firstInRange ? firstInRange.nav : item.navSeries[0].nav
    } else {
      firstNav = item.navSeries[0].nav
    }
    let lastNav: number | null = null

    const data: { value: [number, number]; originalNav: number }[] = []
    for (const date of sortedDates) {
      const nav = navMap.get(date)
      if (nav !== undefined) {
        lastNav = nav
        const normalized = (nav / firstNav) * 100
        data.push({ value: [date, parseFloat(normalized.toFixed(4))], originalNav: nav })
      } else if (lastNav !== null) {
        const normalized = (lastNav / firstNav) * 100
        data.push({ value: [date, parseFloat(normalized.toFixed(4))], originalNav: lastNav })
      }
    }

    return {
      name: item.product.name,
      type: 'line',
      data,
      smooth: false,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: item.color, width: 2 },
      itemStyle: { color: item.color },
      emphasis: { focus: 'series' }
    }
  })

  let minVal = Infinity
  let maxVal = -Infinity
  for (const s of series) {
    for (const point of s.data) {
      if (zoomStartValue !== null && point.value[0] < zoomStartValue) continue
      if (zoomEndValue !== null && point.value[0] > zoomEndValue) continue
      if (point.value[1] < minVal) minVal = point.value[1]
      if (point.value[1] > maxVal) maxVal = point.value[1]
    }
  }
  const padding = (maxVal - minVal) * 0.1 || 5

  compareChart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151', fontSize: 12 },
      formatter: (params: any) => {
        if (!params || params.length === 0) return ''
        const date = new Date(params[0].value[0]).toLocaleDateString('zh-CN')
        let result = `<div style="font-weight:600;margin-bottom:4px">${date}</div>`
        params.forEach((p: any) => {
          const normalized = p.value[1]
          const originalNav = p.data?.originalNav
          const changePct = normalized - 100
          const changeColor = changePct >= 0 ? '#ef4444' : '#22c55e'
          result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color}"></span>
            <span style="flex:1">${p.seriesName}</span>
            <span style="font-weight:600">${normalized.toFixed(2)}</span>
            <span style="color:${changeColor};font-size:11px;margin-left:4px">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>
            ${originalNav !== undefined ? `<span style="color:#9ca3af;font-size:11px;margin-left:6px">净值 ${originalNav.toFixed(4)}</span>` : ''}
          </div>`
        })
        return result
      }
    },
    legend: {
      show: true,
      bottom: 30,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { fontSize: 12, color: '#374151' }
    },
    grid: {
      left: 10,
      right: 10,
      top: 20,
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        fontSize: 11,
        color: '#6b7280',
        hideOverlap: true
      },
      axisLine: { show: true, lineStyle: { color: '#e5e7eb' } },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: Math.floor(minVal - padding),
      max: Math.ceil(maxVal + padding),
      axisLabel: {
        fontSize: 11,
        color: '#6b7280',
        formatter: (value: number) => value.toFixed(0)
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#f3f4f6', type: 'dashed' } }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        startValue: zoomStartValue ?? undefined,
        endValue: zoomEndValue ?? undefined,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        startValue: zoomStartValue ?? undefined,
        endValue: zoomEndValue ?? undefined,
        height: 20,
        bottom: 8,
        borderColor: 'transparent',
        backgroundColor: 'rgba(0,0,0,0.05)',
        fillerColor: 'rgba(30, 64, 175, 0.2)',
        handleStyle: { color: '#1e40af' },
        textStyle: { fontSize: 10 }
      }
    ],
    series
  }, true)
}

const handleCompareResize = () => {
  compareChart?.resize()
}

const handleSwitchCompareType = (type: 'equity' | 'fixed_income' | 'term_deposit') => {
  switchType(type)
}

const getCompareReturnClass = (value: number | null) => {
  if (value === null) return 'text-apple-secondary'
  return value >= 0 ? 'text-profit' : 'text-loss'
}

const formatCompareReturn = (value: number | null) => {
  if (value === null) return '数据不足'
  return formatPercent(value)
}

const getCompareProductTypeLabel = (type: string) => {
  if (type === 'fund') return '基金'
  if (type === 'equity') return '权益'
  if (type === 'term_deposit') return '定存'
  return '固收'
}

const getCompareType = (product: Product): 'equity' | 'fixed_income' | 'term_deposit' => {
  if (product.type === 'equity' || product.type === 'fund') return 'equity'
  if (product.type === 'term_deposit') return 'term_deposit'
  return 'fixed_income'
}

const handleToggleCompare = (product: Product) => {
  toggleCompare(product.id, getCompareType(product))
}

const closeComparePanel = () => {
  showComparePanel.value = false
  clearCompare()
}

// 根据当前页面类型选择对应的显示设置
const pageSettings = computed(() => {
  return props.type === 'equity' ? equitySettings.value : fixedIncomeSettings.value
})
const router = useRouter()
const route = useRoute()

// 通过基金代码跳转到产品详情页
const goToProductByCode = (code: string) => {
  const product = products.value.find(p => p.code === code)
  if (product) {
    router.push({ name: 'product-detail', params: { id: product.id }, query: { status: filterStatus.value, type: filterType.value } })
  }
}

// 切换当前页面的所有显示控制
const togglePageDisplay = () => {
  const current = pageSettings.value.showProfitAmount && pageSettings.value.showProfitRate && pageSettings.value.showMarketValue && pageSettings.value.showCost
  pageSettings.value.showProfitAmount = !current
  pageSettings.value.showProfitRate = !current
  pageSettings.value.showMarketValue = !current
  pageSettings.value.showCost = !current
  saveDisplaySettings()
}

const showModal = ref(false)
const editingProduct = ref<typeof products.value[0] | null>(null)
const searchQuery = ref('')
const filterType = ref<ProductType | 'all'>('all')
const filterStatus = ref<ProductStatus | 'all'>(props.type === 'term_deposit' ? 'holding' : 'holding')

const filterStatusOptions = computed(() => {
  if (props.type === 'term_deposit') {
    return ['all', 'holding', 'matured'] as const
  }
  return ['all', 'holding', 'closed', 'watchlist'] as const
})

const SORT_KEYS = ['name', 'marketValue', 'annualRate', 'profitRate', 'profit', 'holdingDays', 'dailyReturn', 'dailyProfit', 'stageGains1m', 'stageGains3m', 'stageGainsYtd', 'fiAnnual1m', 'fiAnnual3m', 'fiAnnual1y', 'holder', 'durationMonths', 'maturityDate'] as const
const sortPrefix = `sort_${props.type || 'all'}`
const sortKey = ref<typeof SORT_KEYS[number]>(
  (localStorage.getItem(`${sortPrefix}_key`) as typeof SORT_KEYS[number]) || 'marketValue'
)
const sortOrder = ref<'asc' | 'desc'>(
  localStorage.getItem(`${sortPrefix}_order`) === 'asc' ? 'asc' : 'desc'
)
watch([sortKey, sortOrder], () => {
  localStorage.setItem(`${sortPrefix}_key`, sortKey.value)
  localStorage.setItem(`${sortPrefix}_order`, sortOrder.value)
})

// 阶段涨幅数据缓存
const stageGainsMap = ref<Map<string, StageGains>>(new Map())
const loadingStageGains = ref(false)

// 批量更新净值相关
const loadingBatchNav = ref(false)
const batchNavResult = ref<{ success: number; total: number; skip?: number } | null>(null)

// ==================== 批量更新净值（支持权益和固收理财）====================
const handleBatchUpdateNav = async () => {
  if (!props.type) return
  
  const targetProducts = products.value.filter(p => (p.type === 'fund' ? 'equity' : p.type) === props.type && p.code)
  if (targetProducts.length === 0) {
    return
  }
  
  loadingBatchNav.value = true
  batchNavResult.value = null
  
  // 创建产品代码到产品ID的映射
  const codeToProductMap = new Map(targetProducts.map(p => [p.code!, p]))
  
  try {
    let results: any[] = []
    
    if (props.type === 'equity') {
      // 权益：逐个查询
      for (const product of targetProducts) {
        try {
          const navResult = await fetchEquityNav(product.code!)
          results.push({ ...navResult, code: product.code })
        } catch (error) {
          console.error(`权益 ${product.code} 查询失败:`, error)
          results.push({ code: product.code, nav: null })
        }
      }
    } else {
      // 固收理财：批量查询
      const codes = targetProducts.map(p => p.code!)
      results = await fetchCmbNavBatch(codes)
    }
    
    let successCount = 0
    let skipCount = 0
    
    // 为每个成功查询到净值的产品创建 nav_update 交易
    for (const result of results) {
      if (result.nav !== null && result.code) {
        const product = codeToProductMap.get(result.code)
        if (product) {
          // 解析日期（权益格式：2026-06-23，固收理财格式：20260623）
          let dateTimestamp = Date.now()
          if (result.date) {
            if (result.date.includes('-')) {
              // 权益日期格式：2026-06-23
              const parts = result.date.split('-')
              dateTimestamp = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime()
            } else if (result.date.length === 8) {
              // 固收理财日期格式：20260623
              const year = parseInt(result.date.substring(0, 4))
              const month = parseInt(result.date.substring(4, 6)) - 1
              const day = parseInt(result.date.substring(6, 8))
              dateTimestamp = new Date(year, month, day).getTime()
            }
          }
          
          // 检查当天是否已经存在净值更新记录
          const dayStart = new Date(dateTimestamp)
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dateTimestamp)
          dayEnd.setHours(23, 59, 59, 999)
          
          const existingNavUpdates = getTransactionsByProductId(product.id)
            .filter(t => 
              t.type === 'nav_update' && 
              t.date >= dayStart.getTime() && 
              t.date <= dayEnd.getTime()
            )
          
          // 如果当天已存在相同净值，跳过；如果净值不同，更新记录
          if (existingNavUpdates.length > 0) {
            const hasSameNav = existingNavUpdates.some(t => Math.abs(t.price - result.nav) < 0.0001)
            if (hasSameNav) {
              skipCount++
              continue // 当天已存在相同净值，跳过
            }
            // 如果净值不同，继续创建新记录（视为净值修正）
          }
          
          // 创建净值更新交易
          // amount 和 shares 对于 nav_update 类型不重要，使用 0
          const now = new Date()
          const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
          await addTransaction(product.id, 'nav_update', dateTimestamp, 0, result.nav, 0, 0, timeStr)
          successCount++
        }
      }
    }
    
    batchNavResult.value = { success: successCount, total: targetProducts.length, skip: skipCount }
    
    // 3秒后清除提示
    setTimeout(() => {
      batchNavResult.value = null
    }, 3000)
  } catch (error) {
    console.error('批量更新净值失败:', error)
  } finally {
    loadingBatchNav.value = false
  }
}

// ==================== 当日收益率（从 nav_update 交易记录计算）====================
const dailyReturnMap = computed(() => {
  const map = new Map<string, { dailyReturn: number | null; date: string }>()
  
  for (const product of products.value) {
    if (!product.code) continue
    
    const navUpdates = getTransactionsByProductId(product.id)
      .filter(t => t.type === 'nav_update')
      .sort((a, b) => b.date - a.date) // 按日期降序
    
    if (navUpdates.length < 2) {
      if (navUpdates.length === 1) {
        const d = new Date(navUpdates[0].date)
        const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        map.set(product.code, { dailyReturn: null, date: dateStr })
      }
      continue
    }
    
    const latest = navUpdates[0]
    const prev = navUpdates[1]
    const dailyReturn = prev.price > 0
      ? Math.round(((latest.price - prev.price) / prev.price) * 10000) / 100
      : null
    
    const d = new Date(latest.date)
    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map.set(product.code, { dailyReturn, date: dateStr })
  }
  
  return map
})

// 当天有净值更新的产品 ID 集合
// 通过交易 ID 前缀（Date.now().toString(36)）判断交易创建时间
const todayNavUpdateSet = computed(() => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  
  const set = new Set<string>()
  for (const product of products.value) {
    const navUpdates = getTransactionsByProductId(product.id)
      .filter(t => t.type === 'nav_update')
    // 检查是否有净值更新交易的创建时间在今天
    const hasTodayUpdate = navUpdates.some(t => {
      // ID 前 8 位是 Date.now().toString(36) 的时间戳
      const creationTime = parseInt(t.id.substring(0, 8), 36)
      return creationTime >= todayStart.getTime() && creationTime <= todayEnd.getTime()
    })
    if (hasTodayUpdate) {
      set.add(product.id)
    }
  }
  return set
})

// 批量获取所有权益产品的阶段涨幅
const fetchAllStageGains = async () => {
  if (props.type !== 'equity') return
  
  const equityProducts = products.value.filter(p => (p.type === 'equity' || p.type === 'fund') && p.code)
  if (equityProducts.length === 0) return
  
  // 找出未缓存的权益产品代码
  const uncachedCodes = equityProducts
    .map(p => p.code!)
    .filter(code => !stageGainsMap.value.has(code))
  
  if (uncachedCodes.length === 0) return
  
  loadingStageGains.value = true
  try {
    // 使用批量 API 一次获取所有未缓存数据
    const results = await fetchEquityStageGainsBatch(uncachedCodes)
    for (const [code, gains] of Object.entries(results)) {
      stageGainsMap.value.set(code, gains)
    }
  } catch (e) {
    console.error('批量获取阶段涨幅失败:', e)
  } finally {
    loadingStageGains.value = false
  }
}

const getStageGains = (code: string | undefined): StageGains | undefined => {
  if (!code) return undefined
  return stageGainsMap.value.get(code)
}

const getDailyReturn = (code: string | undefined): { dailyReturn: number | null; date: string } | undefined => {
  if (!code) return undefined
  return dailyReturnMap.value.get(code)
}

// 当日收益金额 = 持仓市值 × 当日收益率
const getDailyProfit = (product: Product): number | null => {
  const pos = getPosition(product.id) as any
  if (!pos || !pos.marketValue) return null
  
  // 定存产品：当日收益 = 本金 × 年利率 / 365（到期后不再计算）
  if (product.type === 'term_deposit') {
    // 判断是否到期
    if (product.maturityDate) {
      const maturityTime = new Date(product.maturityDate).getTime()
      if (Date.now() > maturityTime) {
        return 0 // 到期后当日收益为0
      }
    }
    const annualRate = (product.interestRate || 0) / 100
    // 本金：有交易记录用累计成本，否则用起存金额
    const principal = pos.totalInvestment || product.minAmount || 0
    return principal * annualRate / 365
  }
  
  const daily = getDailyReturn(product.code)
  if (!daily || daily.dailyReturn === null) return null
  return pos.marketValue * daily.dailyReturn / 100
}

interface FixedIncomeAnnualRate {
  '1m'?: number
  '3m'?: number
  '1y'?: number
}

const fixedIncomeAnnualRateMap = computed(() => {
  const map = new Map<string, FixedIncomeAnnualRate>()
  
  for (const product of products.value) {
    if (product.type !== 'fixed_income' || !product.code) continue
    
    const navUpdates = getTransactionsByProductId(product.id)
      .filter(t => t.type === 'nav_update')
      .sort((a, b) => a.date - b.date)
    
    if (navUpdates.length < 2) continue
    
    const latest = navUpdates[navUpdates.length - 1]
    const result: FixedIncomeAnnualRate = {}
    
    const timeRanges: Record<string, number> = {
      '1m': 30,
      '3m': 90,
      '1y': 365
    }
    
    for (const [key, days] of Object.entries(timeRanges)) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      
      let navBefore = null
      for (let i = navUpdates.length - 1; i >= 0; i--) {
        if (navUpdates[i].date <= cutoff) {
          navBefore = navUpdates[i]
          break
        }
      }
      
      if (navBefore) {
        const actualDays = (latest.date - navBefore.date) / (24 * 60 * 60 * 1000)
        if (actualDays >= 7) {
          const simpleReturn = latest.price / navBefore.price
          result[key as keyof FixedIncomeAnnualRate] = (Math.pow(simpleReturn, 365 / actualDays) - 1) * 100
        }
      }
    }
    
    map.set(product.code, result)
  }
  
  return map
})

const getFixedIncomeAnnualRate = (code: string | undefined): FixedIncomeAnnualRate | undefined => {
  if (!code) return undefined
  return fixedIncomeAnnualRateMap.value.get(code)
}

// ==================== 持仓汇总（懒加载 + 缓存）====================
const aggregatedHoldings = ref<AggregatedHoldingsResult | null>(null)
const loadingAggregatedHoldings = ref(false)
const showAggregatedHoldings = ref(false)
const aggregatedHoldingsFromCache = ref(false)

// 持仓分布弹窗
const selectedStock = ref<AggregatedStock | null>(null)
const showFundModal = ref(false)

// 通过基金代码获取基金名称
const getFundName = (code: string): string => {
  const product = products.value.find(p => p.code === code)
  return product?.name || code
}

const AGGREGATED_HOLDINGS_CACHE_KEY = 'aggregated_holdings'
const AGGREGATED_HOLDINGS_TTL = 24 * 60 * 60 * 1000 // 24 小时

interface AggregatedHoldingsCache {
  data: AggregatedHoldingsResult
  timestamp: number
}

const getAggregatedHoldingsCache = (): AggregatedHoldingsCache | null => {
  try {
    const cached = localStorage.getItem(AGGREGATED_HOLDINGS_CACHE_KEY)
    if (!cached) return null
    
    const data: AggregatedHoldingsCache = JSON.parse(cached)
    if (Date.now() - data.timestamp > AGGREGATED_HOLDINGS_TTL) {
      return null
    }
    return data
  } catch {
    return null
  }
}

const setAggregatedHoldingsCache = (data: AggregatedHoldingsResult) => {
  try {
    const cacheData: AggregatedHoldingsCache = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(AGGREGATED_HOLDINGS_CACHE_KEY, JSON.stringify(cacheData))
  } catch {
    // localStorage 可能满了，忽略
  }
}

const fetchAllAggregatedHoldings = async (force = false) => {
  if (props.type !== 'equity') return

  // 展示层排序：每只股票下属的基金按"该股票在该基金中的占比"降序
  const sortFundsByRatio = (data: AggregatedHoldingsResult): AggregatedHoldingsResult => {
    for (const stock of data.stocks) {
      stock.funds = [...stock.funds].sort((a, b) => b.ratio - a.ratio)
    }
    return data
  }

  // 先尝试读取缓存（不依赖 products，解决刷新时 products 尚未加载导致无法显示缓存的问题）
  if (!force) {
    const cached = getAggregatedHoldingsCache()
    if (cached) {
      aggregatedHoldings.value = sortFundsByRatio(cached.data)
      aggregatedHoldingsFromCache.value = true
      return
    }
  }

  // 无缓存或强制刷新时才需要最新的 products 数据
  const equityData = products.value
    .filter(p => (p.type === 'equity' || p.type === 'fund') && p.code)
    .map(p => {
      const pos = calculatePosition(p)
      return { code: p.code!, marketValue: pos?.marketValue || 0 }
    })
    .filter(f => f.marketValue > 0)

  if (equityData.length === 0) return

  loadingAggregatedHoldings.value = true
  try {
    const result = await fetchAggregatedHoldings(equityData)
    const sorted = sortFundsByRatio(result)
    aggregatedHoldings.value = sorted
    aggregatedHoldingsFromCache.value = false
    setAggregatedHoldingsCache(sorted)
  } catch (e) {
    console.error('获取持仓汇总失败:', e)
  } finally {
    loadingAggregatedHoldings.value = false
  }
}

// 切换展开/收起，展开时加载数据
const toggleAggregatedHoldings = () => {
  showAggregatedHoldings.value = !showAggregatedHoldings.value
  // 展开时如果没有数据，则加载
  if (showAggregatedHoldings.value && !aggregatedHoldings.value) {
    fetchAllAggregatedHoldings()
  }
}

// 收起状态下 Top 10 分布：仅真实股票，排除「其他股票 / 现金 / 其他」等汇总项
const topDistributionItems = computed(() => {
  if (!aggregatedHoldings.value) return []
  
  const items: { key: string; name: string; ratio: number; isAsset: boolean; bgClass: string }[] = []
  
  // 添加真实股票
  for (const stock of aggregatedHoldings.value.stocks) {
    items.push({ key: `stock-${stock.code}`, name: stock.name, ratio: stock.ratio, isAsset: false, bgClass: '' })
  }
  
  // 添加资产类别，但排除 其他股票(other_stocks)、现金(cash)、其他(other)
  const excludedAssetTypes = new Set(['other_stocks', 'cash', 'other'])
  const assetBgMap: Record<string, string> = {
    cash: 'bg-amber-50',
    bond: 'bg-emerald-50',
    other_stocks: 'bg-blue-50',
    other: 'bg-slate-50'
  }
  for (const cat of aggregatedHoldings.value.assetCategories) {
    if (excludedAssetTypes.has(cat.type)) continue
    items.push({ key: `asset-${cat.type}`, name: cat.name, ratio: cat.ratio, isAsset: true, bgClass: assetBgMap[cat.type] || '' })
  }
  
  // 按占比降序排列，取前 10
  return items.sort((a, b) => b.ratio - a.ratio).slice(0, 10)
})

// ==================== 汇总统计 ====================
const summaryStats = computed(() => {
  const positions = filteredProducts.value
    .map(p => positionMap.value.get(p.id))
    .filter(Boolean)
  
  const totalMarketValue = positions.reduce((sum, p) => sum + (p!.marketValue || 0), 0)
  const totalCost = positions.reduce((sum, p) => sum + (p!.totalInvestment || 0), 0)
  const totalProfit = positions.reduce((sum, p) => sum + (p!.profit || 0), 0)
  const profitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
  
  const totalDailyProfit = filteredProducts.value.reduce((sum, product) => {
    const dailyProfit = getDailyProfit(product)
    return sum + (dailyProfit ?? 0)
  }, 0)
  
  // 计算加权平均年化收益率（按市值加权）
  let weightedAnnualRate = 0
  let totalWeight = 0
  for (const p of positions) {
    if (p && p.marketValue && p.annualRate !== undefined) {
      weightedAnnualRate += p.marketValue * (p.annualRate || 0)
      totalWeight += p.marketValue
    }
  }
  const annualRate = totalWeight > 0 ? (weightedAnnualRate / totalWeight) : 0
  
  // 计算整体 XIRR 年化收益率（与概览页面一致）
  const productIds = new Set(filteredProducts.value.map(p => p.id))
  const typeTransactions = transactions.value.filter(t => productIds.has(t.productId))
  const buyTxs = typeTransactions.filter(t => t.type === 'buy').map(t => ({
    date: t.date, amount: t.amount, fee: t.fee
  }))
  const sellTxs = typeTransactions.filter(t => t.type === 'sell').map(t => ({
    date: t.date, amount: t.amount
  }))
  const dividendTxs = typeTransactions.filter(t => t.type === 'dividend').map(t => ({
    date: t.date, amount: t.amount
  }))
  const portfolioAnnualRate = calculateXIRR(buyTxs, sellTxs, dividendTxs, totalMarketValue) * 100
  
  return {
    count: filteredProducts.value.length,
    totalMarketValue,
    totalCost,
    totalProfit,
    totalDailyProfit,
    profitRate,
    annualRate,
    portfolioAnnualRate
  }
})

const getPosition = (productId: string) => {
  return positionMap.value.get(productId) || null
}

const productStatusMap = computed(() => {
  const map = new Map<string, ProductStatus>()
  for (const product of products.value) {
    const pos = getPosition(product.id)
    const shares = pos?.totalShares ?? 0
    const hasBuy = (pos?.transactions ?? []).some(t => t.type === 'buy')
    if (product.type === 'term_deposit') {
      // 判断是否到期
      if (product.maturityDate) {
        const maturityTime = new Date(product.maturityDate).getTime()
        if (Date.now() > maturityTime) {
          map.set(product.id, 'matured')
          continue
        }
      }
      // 未到期：定期存款产品即使没有交易记录，也视为持仓中
      map.set(product.id, 'holding')
    } else if (shares > 0.01) {
      map.set(product.id, 'holding')
    } else if (hasBuy) {
      map.set(product.id, 'closed')
    } else {
      map.set(product.id, 'watchlist')
    }
  }
  return map
})

const filteredProducts = computed(() => {
  let result = [...products.value]
  // 兼容旧数据：将 'fund' 类型视为 'equity'
  const normalizeType = (t: string) => t === 'fund' ? 'equity' : t
  // 如果指定了类型过滤，只显示该类型
  if (props.type) {
    result = result.filter(p => normalizeType(p.type) === props.type)
  } else if (filterType.value !== 'all') {
    result = result.filter(p => normalizeType(p.type) === filterType.value)
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.note.toLowerCase().includes(query) ||
      (p.code && p.code.toLowerCase().includes(query)) ||
      (p.holder && p.holder.toLowerCase().includes(query))
    )
  }
  if (filterStatus.value !== 'all') {
    result = result.filter(p => productStatusMap.value.get(p.id) === filterStatus.value)
  }
  result.sort((a, b) => {
    const posA = positionMap.value.get(a.id)
    const posB = positionMap.value.get(b.id)
    let comparison = 0
    switch (sortKey.value) {
      case 'name':
        comparison = a.name.localeCompare(b.name, 'zh-CN')
        break
      case 'marketValue':
        comparison = (posA?.marketValue || 0) - (posB?.marketValue || 0)
        break
      case 'profit':
        comparison = (posA?.profit || 0) - (posB?.profit || 0)
        break
      case 'annualRate':
        comparison = (posA?.annualRate || 0) - (posB?.annualRate || 0)
        break
      case 'profitRate':
        comparison = (posA?.profitRate || 0) - (posB?.profitRate || 0)
        break
      case 'holdingDays':
        comparison = (posA?.holdingDays || 0) - (posB?.holdingDays || 0)
        break
      case 'holder':
        comparison = (a.holder || '').localeCompare(b.holder || '', 'zh-CN')
        break
      case 'dailyReturn':
        comparison = (getDailyReturn(a.code)?.dailyReturn ?? -999) - (getDailyReturn(b.code)?.dailyReturn ?? -999)
        break
      case 'dailyProfit':
        comparison = (getDailyProfit(a) ?? -999999) - (getDailyProfit(b) ?? -999999)
        break
      case 'stageGains1m':
        comparison = (getStageGains(a.code)?.['1m'] || 0) - (getStageGains(b.code)?.['1m'] || 0)
        break
      case 'stageGains3m':
        comparison = (getStageGains(a.code)?.['3m'] || 0) - (getStageGains(b.code)?.['3m'] || 0)
        break
      case 'stageGainsYtd':
        comparison = (getStageGains(a.code)?.ytd || 0) - (getStageGains(b.code)?.ytd || 0)
        break
      case 'fiAnnual1m':
        comparison = (getFixedIncomeAnnualRate(a.code)?.['1m'] || 0) - (getFixedIncomeAnnualRate(b.code)?.['1m'] || 0)
        break
      case 'fiAnnual3m':
        comparison = (getFixedIncomeAnnualRate(a.code)?.['3m'] || 0) - (getFixedIncomeAnnualRate(b.code)?.['3m'] || 0)
        break
      case 'fiAnnual1y':
        comparison = (getFixedIncomeAnnualRate(a.code)?.['1y'] || 0) - (getFixedIncomeAnnualRate(b.code)?.['1y'] || 0)
        break
      case 'durationMonths':
        comparison = (a.durationMonths || 0) - (b.durationMonths || 0)
        break
      case 'maturityDate':
        comparison = new Date(a.maturityDate || '1970-01-01').getTime() - new Date(b.maturityDate || '1970-01-01').getTime()
        break
    }
    return sortOrder.value === 'asc' ? comparison : -comparison
  })
  return result
})

const handleSort = (key: typeof sortKey.value) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const getProductTypeLabel = (type: string) => {
  const normalized = type === 'fund' ? 'equity' : type
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === normalized)
  return option ? option.label : type
}

const getDcaLabel = (dcaAmount: number, dcaCycle: string) => {
  if (!dcaAmount || !dcaCycle) return ''
  const cycleOption = DCA_CYCLE_OPTIONS.find(o => o.value === dcaCycle)
  return cycleOption ? `${dcaAmount}元/${cycleOption.label}` : ''
}

// 计算定期存款进度
const getTermDepositProgress = (product: any): number => {
  if (!product || product.type !== 'term_deposit') return 0
  
  const durationMonths = product.durationMonths || 0
  if (durationMonths <= 0) return 0
  
  // 计算起始日期
  let startDate: number
  if (product.maturityDate && durationMonths) {
    // 到期日期 - 存款期限 = 起始日期
    const maturityDateMs = new Date(product.maturityDate).getTime()
    const durationDays = durationMonths * 30
    startDate = maturityDateMs - durationDays * 24 * 60 * 60 * 1000
  } else {
    startDate = product.createdAt || Date.now()
  }
  
  const now = Date.now()
  const totalDurationMs = durationMonths * 30 * 24 * 60 * 60 * 1000
  const elapsedMs = Math.max(0, now - startDate)
  
  const progress = (elapsedMs / totalDurationMs) * 100
  return Math.min(100, Math.max(0, progress))
}

// 计算定期存款剩余天数
const getTermDepositRemainingDays = (product: any): number => {
  if (!product || product.type !== 'term_deposit') return 0
  
  const durationMonths = product.durationMonths || 0
  if (durationMonths <= 0) return 0
  
  // 计算起始日期
  let startDate: number
  if (product.maturityDate && durationMonths) {
    const maturityDateMs = new Date(product.maturityDate).getTime()
    const durationDays = durationMonths * 30
    startDate = maturityDateMs - durationDays * 24 * 60 * 60 * 1000
  } else {
    startDate = product.createdAt || Date.now()
  }
  
  const now = Date.now()
  const totalDurationDays = durationMonths * 30
  const elapsedDays = Math.floor((now - startDate) / (24 * 60 * 60 * 1000))
  const remainingDays = Math.max(0, totalDurationDays - elapsedDays)
  
  return remainingDays
}

// 解析固收产品的持有期限为天数
// 支持格式："90天"、"365天"、"6个月"、"1年"、"无固定期限"、空字符串 / "自定义/不填写"
// 返回 null 表示"无期限"，不显示剩余天数；返回数字则为总天数
const parseHoldingTermToDays = (term: string | undefined | null): number | null => {
  if (!term) return null
  const t = String(term).trim()
  if (!t) return null
  if (t.includes('无固定期限')) return null

  // 匹配 年
  const yearMatch = t.match(/^(\d+(?:\.\d+)?)\s*年$/)
  if (yearMatch) return Math.round(parseFloat(yearMatch[1]) * 365)

  // 匹配 个月
  const monthMatch = t.match(/^(\d+(?:\.\d+)?)\s*个月$/)
  if (monthMatch) return Math.round(parseFloat(monthMatch[1]) * 30)

  // 匹配 天 / D（忽略大小写）
  const dayMatch = t.match(/^(\d+(?:\.\d+)?)\s*(天|d|D)$/)
  if (dayMatch) return Math.round(parseFloat(dayMatch[1]))

  // 纯数字，默认按天处理
  const pureNum = t.match(/^(\d+(?:\.\d+)?)$/)
  if (pureNum) return Math.round(parseFloat(pureNum[1]))

  return null
}

// 获取固收产品剩余天数：总期限天数 - 已持有天数；无期限或负值返回 null
const getFixedIncomeRemainingDays = (product: any, position: any): number | null => {
  if (!product || !position) return null
  if (product.type !== 'fixed_income') return null
  const total = parseHoldingTermToDays((product as any).holdingTerm)
  if (total === null) return null
  const held = position.holdingDays || 0
  return Math.max(0, total - held)
}

// 格式化存款期限：超过1年显示年
const formatDuration = (durationMonths: number): string => {
  if (!durationMonths || durationMonths <= 0) return '-'
  if (durationMonths >= 12) {
    const years = Math.floor(durationMonths / 12)
    const remainMonths = durationMonths % 12
    if (remainMonths === 0) {
      return `${years}年`
    }
    return `${years}年${remainMonths}个月`
  }
  return `${durationMonths}个月`
}

// 格式化到期日期
const formatMaturityDate = (product: any): string => {
  if (!product || !product.maturityDate) return '-'
  return product.maturityDate
}

// 计算定存产品到期收益：本金 × 年利率 × 期限(年)，本金优先取持仓本金，否则用起存金额
const getTermDepositMaturityProfit = (product: any, position: any = null): number | null => {
  if (!product || product.type !== 'term_deposit') return null
  const interestRate = product.interestRate || 0
  const durationMonths = product.durationMonths || 0
  if (interestRate <= 0 || durationMonths <= 0) return null
  const principal = position?.totalInvestment ?? product.minAmount ?? 0
  if (principal <= 0) return null
  const maturityProfit = principal * (interestRate / 100) * (durationMonths / 12)
  return Math.round(maturityProfit * 100) / 100
}

// 预计算所有产品的 position（只计算一次，避免模板中重复调用）
const positionMap = computed(() => {
  const map = new Map<string, ReturnType<typeof calculatePosition>>()
  for (const product of products.value) {
    const normalizedType = product.type === 'fund' ? 'equity' : product.type
    if (props.type && normalizedType !== props.type) continue
    map.set(product.id, calculatePosition(product))
  }
  return map
})

const handleAdd = () => {
  editingProduct.value = null
  showModal.value = true
}

const handleEdit = (product: typeof products.value[0]) => {
  editingProduct.value = product
  showModal.value = true
}

const handleDelete = (id: string) => {
  if (confirm('确定要删除这个产品吗？相关的交易记录也会被删除。')) {
    deleteProduct(id)
  }
}

let isRestoringFromQuery = false

onMounted(() => {
  isRestoringFromQuery = true
  if (route.query.status) {
    filterStatus.value = route.query.status as ProductStatus | 'all'
  }
  if (route.query.type && !props.type) {
    filterType.value = route.query.type as ProductType | 'all'
  }
  isRestoringFromQuery = false
  fetchAllStageGains()
  if (props.type === 'equity') {
    // 优先读缓存快速显示，后续 products 加载完成后 watch 会再触发
    fetchAllAggregatedHoldings(false)
  }
  window.addEventListener('resize', handleCompareResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleCompareResize)
  compareChart?.dispose()
  compareChart = null
})

watch(() => products.value, () => {
  if (props.type === 'equity') {
    fetchAllStageGains()
    // products 数据加载完成后，若没有缓存则发起真实请求（无缓存时需要 products 数据）
    fetchAllAggregatedHoldings(false)
  }
})

watch(filterStatus, (val) => {
  if (isRestoringFromQuery) return
  const query = { ...route.query, status: val === 'all' ? undefined : val }
  router.replace({ query })
})

watch(filterType, (val) => {
  if (isRestoringFromQuery || props.type) return
  const query = { ...route.query, type: val === 'all' ? undefined : val }
  router.replace({ query })
})

// 对比面板 watch - 处理图表初始化和更新
watch([compareIds, compareRangeType, compareCustomStart, compareCustomEnd, showComparePanel], async () => {
  await nextTick()
  zoomStartValue = null
  zoomEndValue = null
  if (!showComparePanel.value || compareIds.value.length === 0) {
    if (compareChart) {
      compareChart.dispose()
      compareChart = null
    }
    return
  }
  if (!compareChart && compareChartRef.value) {
    initCompareChart()
  } else if (compareChart) {
    updateCompareChart()
  }
}, { deep: true })

const handleSubmit = (data: { name: string; type: ProductType; note: string; code: string; holder: string; dcaAmount: number; dcaCycle: string; navSource: string; holdingTerm: string; benchmarkEnabled: boolean; benchmarkFormula: string; interestRate: number; durationMonths: number; minAmount: number; maturityDate: string; interestMethod: string; bankName: string; purchaseLimit: string }) => {
  if (editingProduct.value) {
    updateProduct(editingProduct.value.id, data.name, data.type, data.note, data.code, data.holder, data.dcaAmount, data.dcaCycle, data.navSource, data.holdingTerm, data.benchmarkEnabled, data.benchmarkFormula, data.interestRate, data.durationMonths, data.minAmount, data.maturityDate, data.interestMethod as any, data.bankName, data.purchaseLimit)
  } else {
    addProduct(data.name, data.type, data.note, data.code, data.holder, data.dcaAmount, data.dcaCycle, data.navSource, data.holdingTerm, data.benchmarkEnabled, data.benchmarkFormula, data.interestRate, data.durationMonths, data.minAmount, data.maturityDate, data.interestMethod as any, data.bankName, data.purchaseLimit)
  }
  showModal.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center space-x-2 shrink-0">
          <h2 class="apple-section-title">
            {{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : props.type === 'term_deposit' ? '定期存款' : '产品' }}
          </h2>
          <button
            v-if="props.type === 'equity' || props.type === 'fixed_income'"
            @click="togglePageDisplay()"
            class="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            :title="(pageSettings.showProfitAmount && pageSettings.showProfitRate && pageSettings.showMarketValue && pageSettings.showCost) ? '点击隐藏收益' : '点击显示收益'"
          >
            <Eye v-if="pageSettings.showProfitAmount && pageSettings.showProfitRate && pageSettings.showMarketValue && pageSettings.showCost" class="w-4 h-4 text-apple-secondary" />
            <EyeOff v-else class="w-4 h-4 text-apple-secondary" />
          </button>
        </div>
        <div class="flex items-center gap-2 overflow-x-auto no-scrollbar mt-0.5">
          <!-- 批量更新净值按钮（权益和固收理财页面显示） -->
          <button 
            v-if="props.type === 'fixed_income' || props.type === 'equity'"
            @click="handleBatchUpdateNav"
            :disabled="loadingBatchNav"
            class="apple-btn-primary flex items-center space-x-2 px-3 py-1.5 text-[13px] disabled:opacity-50 min-h-[36px] whitespace-nowrap"
          >
            <RefreshCw class="w-3.5 h-3.5 hidden sm:block" :class="{ 'animate-spin': loadingBatchNav }" />
            <span>{{ loadingBatchNav ? '更新中...' : '净值更新' }}</span>
          </button>
          <button 
            @click="handleAdd"
            class="apple-btn-primary flex items-center space-x-2 px-3 py-1.5 text-[13px] min-h-[36px] whitespace-nowrap"
          >
            <Plus class="w-3.5 h-3.5 hidden sm:block" />
            <span>新增产品</span>
          </button>
          <!-- 对比按钮 -->
          <button 
            v-if="compareIds.length > 0 && props.type !== 'term_deposit'"
            @click="showComparePanel = true"
            class="flex items-center space-x-2 px-4 py-2 text-[13px] rounded-full border border-primary-500 text-primary-500 bg-white hover:bg-primary-50 transition-colors min-h-[36px] whitespace-nowrap"
          >
            <Scale class="w-3.5 h-3.5 hidden sm:block" />
            <span>对比</span>
            <span class="px-1.5 py-0.5 bg-primary-500 text-white rounded-full text-[11px] font-medium">{{ compareIds.length }}</span>
          </button>
        </div>
      </div>
      <p class="apple-section-subtitle mt-1">共 {{ filteredProducts.length }} 个{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : props.type === 'term_deposit' ? '定期存款' : '理财产品' }}</p>
      <!-- 批量更新结果提示 -->
      <div 
        v-if="batchNavResult" 
        class="sm:absolute sm:top-20 sm:right-4 text-sm px-3 py-1.5 rounded-full"
        :class="{
          'bg-green-100 text-green-700': batchNavResult.success > 0,
          'bg-blue-100 text-blue-700': batchNavResult.success === 0 && batchNavResult.skip && batchNavResult.skip > 0,
          'bg-red-100 text-red-700': batchNavResult.success === 0 && (!batchNavResult.skip || batchNavResult.skip === 0)
        }"
      >
        {{ batchNavResult.success > 0 
          ? `成功更新 ${batchNavResult.success}/${batchNavResult.total} 个产品${batchNavResult.skip ? `（跳过${batchNavResult.skip}条重复）` : ''}` 
          : (batchNavResult.skip && batchNavResult.skip > 0 ? '所有净值已存在，无需更新' : '更新失败')
        }}
      </div>
    </div>

<!-- 汇总统计卡片 -->
    <!-- 移动端 固收：两行合并卡片（第一行：总市值；第二行：4项指标同一行） -->
    <div v-if="props.type === 'fixed_income'" class="glass-card md:hidden -mx-3 md:mx-0">
      <!-- 第一行：总市值 -->
      <div class="mb-2.5">
        <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium">总市值</p>
        <p class="text-[24px] font-semibold text-apple-text tracking-tight leading-tight">{{ pageSettings.showMarketValue ? formatCurrency1(summaryStats.totalMarketValue) : '****' }}</p>
      </div>
      <!-- 第二行：4 项指标同一行（持仓收益 / 总收益率 / 年化收益率 / 今日收益） -->
      <div class="grid grid-cols-4 gap-x-2 border-t border-black/5 pt-2.5">
        <div class="min-w-0">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">持仓收益</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalProfit) : '****' }}
          </p>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">总收益率</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? '+' : '') + summaryStats.profitRate.toFixed(2) + '%' : '****' }}
          </p>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">年化收益率</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? '+' : '') + summaryStats.portfolioAnnualRate.toFixed(2) + '%' : '****' }}
          </p>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">今日收益</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitAmount ? (summaryStats.totalDailyProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitAmount ? (summaryStats.totalDailyProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalDailyProfit) : '****' }}
          </p>
        </div>
      </div>
    </div>
    <!-- PC端：4列卡片（年化收益率在最后） -->
    <div class="hidden md:grid grid-cols-4 gap-3">
      <div class="glass-card p-4">
        <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">总市值</p>
        <p class="text-[22px] font-semibold text-apple-text tracking-tight">{{ pageSettings.showMarketValue ? formatCurrency1(summaryStats.totalMarketValue) : '****' }}</p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益</p>
        <div class="flex items-end justify-between">
          <p class="text-[22px] font-semibold tracking-tight" :class="pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalProfit) : '****' }}
          </p>
          <p v-if="pageSettings.showProfitAmount" class="text-[12px] ml-2 whitespace-nowrap" :class="summaryStats.totalDailyProfit >= 0 ? 'text-profit' : 'text-loss'">
            {{ summaryStats.totalDailyProfit >= 0 ? '+' : '' }}{{ formatCurrency1(summaryStats.totalDailyProfit) }} 今日
          </p>
        </div>
      </div>
      <div class="glass-card p-4">
        <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益率</p>
        <p class="text-[22px] font-semibold tracking-tight" :class="pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? '+' : '') + summaryStats.profitRate.toFixed(2) + '%' : '****' }}
        </p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">年化收益率</p>
        <p class="text-[22px] font-semibold tracking-tight" :class="pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? '+' : '') + summaryStats.portfolioAnnualRate.toFixed(2) + '%' : '****' }}
        </p>
      </div>
    </div>
    
    <!-- 移动端 权益/定存：两行合并卡片（第一行：总市值；第二行：4项指标同一行） -->
    <div v-if="props.type !== 'fixed_income'" class="glass-card md:hidden -mx-3 md:mx-0">
      <!-- 第一行：总市值 -->
      <div class="mb-2.5">
        <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium">总市值</p>
        <p class="text-[24px] font-semibold text-apple-text tracking-tight leading-tight">{{ pageSettings.showMarketValue ? formatCurrency1(summaryStats.totalMarketValue) : '****' }}</p>
      </div>
      <!-- 第二行：4 项指标同一行（持仓收益 / 总收益率 / 年化收益率 / 今日收益） -->
      <div class="grid grid-cols-4 gap-x-2 border-t border-black/5 pt-2.5">
        <div class="min-w-0">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">持仓收益</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalProfit) : '****' }}
          </p>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">总收益率</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? '+' : '') + summaryStats.profitRate.toFixed(2) + '%' : '****' }}
          </p>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">年化收益率</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? '+' : '') + summaryStats.portfolioAnnualRate.toFixed(2) + '%' : '****' }}
          </p>
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">今日收益</p>
          <p class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate" :class="pageSettings.showProfitAmount ? (summaryStats.totalDailyProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ pageSettings.showProfitAmount ? (summaryStats.totalDailyProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalDailyProfit) : '****' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 持仓穿透汇总（仅权益页面显示） -->
    <div v-if="props.type === 'equity'" class="glass-card overflow-hidden -mx-3 md:mx-0">
      <div class="p-3 md:p-5 border-b border-black/5 flex items-center justify-between">
        <div>
          <h3 class="text-[17px] font-semibold text-apple-text">持仓穿透</h3>
          <p class="text-[12px] text-apple-secondary mt-1">
            <span v-if="aggregatedHoldings">共 {{ aggregatedHoldings.fundCount }} 只权益产品，{{ aggregatedHoldings.stocks.length }} 只股票</span>
            <span v-if="aggregatedHoldingsFromCache" class="text-amber-500"> · 缓存数据</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="showAggregatedHoldings && aggregatedHoldings"
            @click="fetchAllAggregatedHoldings(true)"
            :disabled="loadingAggregatedHoldings"
            class="text-[13px] text-apple-secondary hover:text-primary-500 disabled:opacity-50 transition-colors touch-target"
            title="刷新数据"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loadingAggregatedHoldings }" />
          </button>
          <button
            @click="toggleAggregatedHoldings"
            class="text-[13px] text-primary-500 hover:text-primary-700 font-medium touch-target min-h-[36px]"
          >
            {{ showAggregatedHoldings ? '收起' : '展开' }}
          </button>
        </div>
      </div>
      
      <!-- 资产配置概览条（始终显示） -->
      <div v-if="aggregatedHoldings?.assetAllocation" class="px-3 md:px-5 py-3 border-b border-black/5">
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 text-[12px] mb-2">
          <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 rounded-full bg-primary-500"></span>
            <span class="text-apple-secondary">股票</span>
            <span class="font-semibold text-apple-text">{{ aggregatedHoldings.assetAllocation.stockRatio.toFixed(1) }}%</span>
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span class="text-apple-secondary">债券</span>
            <span class="font-semibold text-apple-text">{{ aggregatedHoldings.assetAllocation.bondRatio.toFixed(1) }}%</span>
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span class="text-apple-secondary">现金</span>
            <span class="font-semibold text-apple-text">{{ aggregatedHoldings.assetAllocation.cashRatio.toFixed(1) }}%</span>
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
            <span class="text-apple-secondary">其他</span>
            <span class="font-semibold text-apple-text">{{ aggregatedHoldings.assetAllocation.otherRatio.toFixed(1) }}%</span>
          </span>
        </div>
        <!-- 比例条 -->
        <div class="flex h-3 rounded-full overflow-hidden bg-apple-bg">
          <div class="bg-primary-500" :style="{ width: aggregatedHoldings.assetAllocation.stockRatio + '%' }"></div>
          <div class="bg-emerald-500" :style="{ width: aggregatedHoldings.assetAllocation.bondRatio + '%' }"></div>
          <div class="bg-amber-500" :style="{ width: aggregatedHoldings.assetAllocation.cashRatio + '%' }"></div>
          <div class="bg-slate-400" :style="{ width: aggregatedHoldings.assetAllocation.otherRatio + '%' }"></div>
        </div>
      </div>
      
      <div v-if="loadingAggregatedHoldings" class="p-8 text-center">
        <p class="text-apple-secondary">加载中...</p>
      </div>
      
      <div v-else-if="showAggregatedHoldings && aggregatedHoldings && aggregatedHoldings.stocks.length > 0" class="-mx-3 md:mx-0">
        <div class="overflow-x-auto max-h-[320px] md:max-h-[480px] overflow-y-auto rounded-lg">
          <table class="w-full apple-table min-w-[520px]">
            <thead class="sticky top-0 z-10 bg-[#FAFAFA] md:bg-white">
              <tr>
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider backdrop-blur-xl">名称</th>
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider backdrop-blur-xl">代码</th>
                <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider backdrop-blur-xl">持仓金额</th>
                <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider backdrop-blur-xl">占比</th>
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider backdrop-blur-xl">持有权益</th>
              </tr>
            </thead>
          <tbody class="divide-y divide-apple-border/50">
            <tr v-for="(stock, idx) in aggregatedHoldings.stocks" :key="stock.code">
              <td class="px-2 py-2.5">
                <div class="flex items-center">
                  <span class="w-5 h-5 rounded-full bg-primary-50 text-primary-500 text-xs flex items-center justify-center mr-1.5 flex-shrink-0">{{ idx + 1 }}</span>
                  <span
                    class="font-medium text-apple-text text-[13px] truncate max-w-[80px] cursor-pointer hover:text-primary-500 transition-colors select-none"
                    @click="selectedStock = stock; showFundModal = true"
                  >{{ stock.name }}</span>
                </div>
              </td>
              <td class="px-2 py-2.5 text-apple-secondary text-[12px]">{{ stock.code }}</td>
              <td class="px-2 py-2.5 text-right font-medium text-apple-text text-[13px] whitespace-nowrap">{{ formatCurrency(stock.totalValue) }}</td>
              <td class="px-2 py-2.5 text-right whitespace-nowrap">
                <span class="apple-tag bg-primary-50 text-primary-500 text-[11px]">
                  {{ stock.ratio.toFixed(2) }}%
                </span>
              </td>
              <td class="px-3 py-2.5">
                <div class="flex flex-nowrap gap-1 overflow-x-auto">
                  <span 
                    v-for="fund in stock.funds.slice(0, 3)" 
                    :key="fund.fundCode"
                    @click="goToProductByCode(fund.fundCode)"
                    class="apple-tag bg-black/5 text-apple-secondary whitespace-nowrap cursor-pointer hover:bg-black/10 hover:text-primary-500 transition-colors select-none"
                  >
                    {{ fund.fundCode }} ({{ fund.ratio.toFixed(1) }}%)
                  </span>
                  <span v-if="stock.funds.length > 3" class="text-xs text-apple-secondary/60 whitespace-nowrap">
                    +{{ stock.funds.length - 3 }}
                  </span>
                </div>
              </td>
            </tr>
            <!-- 资产类别行（现金/债券/其他） -->
            <tr 
              v-for="cat in aggregatedHoldings.assetCategories" 
              :key="cat.type"
              class="bg-apple-bg/50"
            >
              <td class="px-2 py-2.5">
                <div class="flex items-center">
                  <span 
                    class="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center mr-1.5 flex-shrink-0"
                    :class="{
                      'bg-amber-500': cat.type === 'cash',
                      'bg-emerald-500': cat.type === 'bond',
                      'bg-blue-400': cat.type === 'other_stocks',
                      'bg-slate-400': cat.type === 'other'
                    }"
                  >
                    <span class="text-[9px] font-bold">{{ cat.type === 'cash' ? '¥' : cat.type === 'bond' ? '债' : cat.type === 'other_stocks' ? '股' : '...' }}</span>
                  </span>
                  <span class="font-medium text-apple-text text-[13px]">{{ cat.name }}</span>
                </div>
              </td>
              <td class="px-2 py-2.5 text-apple-secondary/50 text-[12px]">—</td>
              <td class="px-2 py-2.5 text-right font-medium text-apple-text text-[13px] whitespace-nowrap">{{ formatCurrency(cat.totalValue) }}</td>
              <td class="px-2 py-2.5 text-right whitespace-nowrap">
                <span 
                  class="apple-tag text-[11px]"
                  :class="{
                    'bg-amber-50 text-amber-600': cat.type === 'cash',
                    'bg-emerald-50 text-emerald-600': cat.type === 'bond',
                    'bg-blue-50 text-blue-500': cat.type === 'other_stocks',
                    'bg-slate-50 text-slate-500': cat.type === 'other'
                  }"
                >
                  {{ cat.ratio.toFixed(2) }}%
                </span>
              </td>
              <td class="px-2 py-2.5 text-apple-secondary/50 text-[12px]">—</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
      
      <!-- 持仓分布弹窗 -->
      <Teleport to="body">
        <div
          v-if="showFundModal && selectedStock"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          @click.self="showFundModal = false"
        >
          <!-- 遮罩层 -->
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="showFundModal = false"></div>
          <!-- 弹窗内容 -->
          <div class="relative w-full max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <!-- 头部 -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                <h3 class="text-[17px] font-semibold text-apple-text">{{ selectedStock.name }}</h3>
                <p class="text-[12px] text-apple-secondary mt-0.5">{{ selectedStock.code }} · {{ selectedStock.funds.length }} 只基金持有</p>
              </div>
              <button
                @click="showFundModal = false"
                class="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg class="w-4 h-4 text-apple-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <!-- 列表 -->
            <div class="max-h-[360px] overflow-y-auto">
              <div
                v-for="(fund, fIdx) in selectedStock.funds"
                :key="fund.fundCode"
                class="flex items-center gap-3 px-5 py-3 border-b border-black/5 last:border-b-0 hover:bg-black/[0.02] transition-colors cursor-pointer select-none"
                @click="goToProductByCode(fund.fundCode); showFundModal = false"
              >
                <span class="w-6 h-6 rounded-full bg-primary-50 text-primary-500 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">{{ fIdx + 1 }}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-medium text-apple-text truncate">{{ getFundName(fund.fundCode) }}</p>
                  <p class="text-[11px] text-apple-secondary mt-0.5">{{ fund.fundCode }}</p>
                </div>
                <div class="text-right flex-shrink-0">
                  <p class="text-[13px] font-semibold text-primary-500">{{ fund.ratio.toFixed(2) }}%</p>
                  <p class="text-[10px] text-apple-secondary mt-0.5">持有占比</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
      
      <!-- 无持仓数据的基金提示 -->
      <div v-if="showAggregatedHoldings && aggregatedHoldings?.noHoldingsFunds && aggregatedHoldings.noHoldingsFunds.length > 0" class="px-3 md:px-5 py-3 border-t border-black/5 bg-orange-50/50">
        <div class="flex items-center gap-2 mb-1.5">
          <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          <span class="text-[13px] font-medium text-orange-700">以下 {{ aggregatedHoldings?.noHoldingsFunds?.length || 0 }} 只基金暂无持仓数据（{{ aggregatedHoldings?.noHoldingsFunds?.map(f => f.code).join('、') || '' }}）</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span 
            v-for="fund in aggregatedHoldings?.noHoldingsFunds || []" 
            :key="fund.code"
            @click="goToProductByCode(fund.code)"
            class="inline-flex items-center px-2 py-1 rounded-md bg-orange-100 text-orange-700 text-[11px] gap-1.5 cursor-pointer hover:bg-orange-200 transition-colors select-none"
          >
            <span class="font-mono">{{ fund.code }}</span>
            <span class="text-orange-500/70">{{ formatCurrency(fund.marketValue) }}</span>
          </span>
        </div>
      </div>
      
      <div v-else-if="showAggregatedHoldings && aggregatedHoldings && aggregatedHoldings.stocks.length === 0" class="p-8 text-center">
        <p class="text-apple-secondary">暂无持仓数据</p>
      </div>
      
      <!-- 收起状态：显示 Top 10 分布（股票 + 资产类别） -->
      <div v-else-if="!showAggregatedHoldings && aggregatedHoldings" class="p-3 md:p-5">
        <div class="flex flex-wrap gap-1">
          <span 
            v-for="(item, idx) in topDistributionItems" 
            :key="item.key"
            class="inline-flex items-center px-2 py-1 rounded-full border"
            :class="item.isAsset 
              ? 'border-transparent ' + item.bgClass 
              : 'bg-apple-bg border-apple-border/50'"
          >
            <span class="text-[10px] text-apple-secondary mr-0.5">{{ idx + 1 }}.</span>
            <span class="text-[12px] font-medium text-apple-text">{{ item.name }}</span>
            <span class="text-[10px] text-apple-secondary ml-1">{{ item.ratio.toFixed(1) }}%</span>
          </span>
          <span v-if="topDistributionItems.length < (aggregatedHoldings.stocks.length + aggregatedHoldings.assetCategories.length)" class="text-[12px] text-apple-secondary self-center">
            +{{ (aggregatedHoldings.stocks.length + aggregatedHoldings.assetCategories.length) - topDistributionItems.length }} 更多
          </span>
        </div>
        <!-- 无持仓基金摘要 -->
        <div v-if="aggregatedHoldings.noHoldingsFunds?.length > 0" class="mt-3 pt-3 border-t border-black/5">
          <div class="flex items-center gap-1.5 text-[11px] text-orange-600">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <span>{{ aggregatedHoldings.noHoldingsFunds.length }} 只基金暂无持仓数据（{{ aggregatedHoldings.noHoldingsFunds.map(f => f.code).join('、') }}）</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 sm:gap-3">
      <!-- 搜索框 -->
      <div class="relative flex-1 min-w-0">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="搜索产品名称、代码、持有人或备注..."
          class="glass-input w-full pl-10 pr-4 py-2.5 rounded-apple outline-none text-[15px]"
        />
      </div>
      <!-- 产品类型（仅"全部产品"页面显示） -->
      <select 
        v-if="!props.type"
        v-model="filterType"
        class="glass-input px-4 py-2.5 rounded-apple outline-none text-[15px] flex-shrink-0 min-w-[100px] touch-target min-h-[44px]"
      >
        <option value="all">全部类型</option>
        <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <!-- 状态按钮组（全部/持有/清仓/自选） -->
      <div class="flex rounded-xl overflow-hidden border border-apple-border/50 bg-white flex-shrink-0">
        <button
          v-for="status in filterStatusOptions"
          :key="status"
          @click="filterStatus = status"
          class="px-3 py-2 text-[13px] font-medium transition-all touch-target min-h-[40px]"
          :class="filterStatus === status 
            ? 'bg-primary-500 text-white' 
            : 'bg-transparent text-apple-secondary hover:text-apple-text'"
        >
          {{ status === 'all' ? '全部' : PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.label }}
        </button>
      </div>
    </div>
    
    <!-- 移动端表格布局（固定产品列 + 横向滚动） -->
    <div v-if="filteredProducts.length > 0" class="md:hidden glass-card glass-table-card overflow-hidden -mx-3 md:mx-0 rounded-[var(--apple-radius-lg)]">
      <div class="mobile-table-scroll rounded-[var(--apple-radius-lg)]">
        <div :class="props.type === 'term_deposit' ? 'min-w-[750px]' : props.type === 'fixed_income' ? 'min-w-[830px]' : 'min-w-[770px]'">
          <table :class="['w-full apple-table mobile-product-table rounded-[var(--apple-radius-lg)]', { 'term-deposit-table': props.type === 'term_deposit' }]">
            <thead>
              <tr>
                <th 
                  class="sticky bg-[#FAFAFA] px-2 py-2 text-left text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                  style="width: 155px; min-width: 155px; max-width: 155px;"
                  @click="handleSort('name')"
                >
                  <div class="flex items-center space-x-1">
                    <span>产品</span>
                    <ChevronsUpDown v-if="sortKey !== 'name'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </div>
                </th>
                <th 
                  v-if="props.type !== 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 58px; min-width: 58px; max-width: 58px;"
                  @click="handleSort('dailyReturn')"
                >
                  <span>当日涨幅</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'dailyReturn'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type !== 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 65px; min-width: 65px; max-width: 65px;"
                  @click="handleSort('dailyProfit')"
                >
                  <span>当日收益</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'dailyProfit'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 80px; min-width: 80px; max-width: 80px;"
                  @click="handleSort('marketValue')"
                >
                  <span>持有市值</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'marketValue'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'fixed_income'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 68px; min-width: 68px; max-width: 68px;"
                  @click="handleSort('annualRate')"
                >
                  <span>持有年化</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'annualRate'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('annualRate')"
                >
                  <span>年利率</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'annualRate'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 80px; min-width: 80px; max-width: 80px;"
                  @click="handleSort('profit')"
                >
                  <span>持有收益</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'profit'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 70px; min-width: 70px; max-width: 70px;"
                  @click="handleSort('durationMonths')"
                >
                  <span>到期收益</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'durationMonths'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 55px; min-width: 55px; max-width: 55px;"
                  @click="handleSort('durationMonths')"
                >
                  <span>期限</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'durationMonths'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 85px; min-width: 85px; max-width: 85px;"
                  @click="handleSort('maturityDate')"
                >
                  <span>到期</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'maturityDate'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type !== 'term_deposit'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 55px; min-width: 55px; max-width: 55px;"
                  @click="handleSort('holdingDays')"
                >
                  <span>持有</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'holdingDays'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'term_deposit'"
                  class="px-2 py-2 text-center text-[10px] font-semibold text-apple-secondary uppercase tracking-wider whitespace-nowrap"
                  style="width: 60px; min-width: 60px; max-width: 60px;"
                >
                  <div class="flex items-center justify-center space-x-1">
                    <span>存款进度</span>
                  </div>
                </th>
                <th 
                  v-if="props.type === 'equity'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 65px; min-width: 65px; max-width: 65px;"
                  @click="handleSort('profitRate')"
                >
                  <span>持有涨幅</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'profitRate'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'fixed_income'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('fiAnnual1m')"
                >
                  <span>近1月</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'fiAnnual1m'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'fixed_income'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('fiAnnual3m')"
                >
                  <span>近3月</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'fiAnnual3m'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'fixed_income'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('fiAnnual1y')"
                >
                  <span>近1年</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'fiAnnual1y'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'equity'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('stageGains1m')"
                >
                  <span>近1月</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'stageGains1m'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'equity'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('stageGains3m')"
                >
                  <span>近3月</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'stageGains3m'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type === 'equity'"
                  class="px-2 py-2 text-right text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap relative pr-3"
                  style="width: 52px; min-width: 52px; max-width: 52px;"
                  @click="handleSort('stageGainsYtd')"
                >
                  <span>今年</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'stageGainsYtd'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th 
                  v-if="props.type !== 'equity'"
                  class="px-2 py-2 text-center text-[10px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none whitespace-nowrap"
                  style="width: 55px; min-width: 55px; max-width: 55px;"
                  @click="handleSort('holder')"
                >
                  <span>持有人</span>
                  <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                    <ChevronsUpDown v-if="sortKey !== 'holder'" class="w-2.5 h-2.5 text-apple-secondary/40" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="w-2.5 h-2.5 text-primary-500" />
                    <ArrowDown v-else class="w-2.5 h-2.5 text-primary-500" />
                  </span>
                </th>
                <th class="px-2 py-2 text-center text-[10px] font-semibold text-apple-secondary uppercase tracking-wider whitespace-nowrap" style="width: 56px; min-width: 56px; max-width: 56px;">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-apple-border/50">
              <tr 
                v-for="product in filteredProducts" 
                :key="product.id" 
                class="hover:bg-primary-50/30 transition-colors"
                :class="product.type === 'term_deposit' ? '' : 'cursor-pointer'"
                @click="product.type !== 'term_deposit' && router.push({ name: 'product-detail', params: { id: product.id }, query: { status: filterStatus, type: filterType } })"
              >
                <td class="sticky bg-white dark:bg-apple-bg px-2 py-2" style="width: 155px; min-width: 155px; max-width: 155px;">
                  <div>
                    <div class="flex items-center gap-1.5">
                      <h3 class="text-[12px] font-semibold text-apple-text truncate max-w-[155px]">{{ product.name }}</h3>
                    </div>
                    <div class="flex items-center space-x-1.5 mt-0.5">
                      <span 
                        v-if="!props.type"
                        class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0"
                        :class="{
                          'bg-primary-50 text-primary-500': product.type === 'equity' || product.type === 'fund',
                          'bg-fixed-income/10 text-fixed-income': product.type === 'fixed_income',
                          'bg-amber-50 text-amber-600': product.type === 'term_deposit'
                        }"
                      >
                        {{ getProductTypeLabel(product.type) }}
                      </span>
                      <span 
                        v-if="productStatusMap.get(product.id)"
                        class="inline-flex items-center px-1 py-0.5 rounded-full text-[9px] font-medium shrink-0"
                        :style="{ backgroundColor: PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.color + '15', color: PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.color }"
                      >
                        {{ PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.label }}
                      </span>
                      <template v-if="product.type === 'term_deposit'">
                        <span v-if="product.bankName" class="text-[10px] text-apple-secondary shrink-0">{{ product.bankName }}</span>
                      </template>
                      <template v-else>
                        <span v-if="product.code" class="text-[10px] font-mono text-apple-secondary shrink-0">{{ product.code }}</span>
                      </template>
                    </div>
                    <div v-if="props.type === 'equity' && product.purchaseLimit" class="mt-0.5">
                      <span 
                        class="text-[10px] text-amber-500 truncate block max-w-[150px]" 
                        :title="product.purchaseLimit"
                      >{{ product.purchaseLimit }}</span>
                    </div>
                  </div>
                </td>
                <td v-if="props.type !== 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 58px; min-width: 58px; max-width: 58px;">
                  <template v-if="getDailyReturn(product.code)">
                    <p
                      class="text-[12px] font-semibold"
                      :class="(getDailyReturn(product.code)?.dailyReturn ?? 0) > 0 ? 'text-profit' : (getDailyReturn(product.code)?.dailyReturn ?? 0) < 0 ? 'text-loss' : ''"
                    >
                      {{ (getDailyReturn(product.code)?.dailyReturn ?? 0) > 0 ? '+' : '' }}{{ (getDailyReturn(product.code)?.dailyReturn ?? 0).toFixed(2) }}%
                    </p>
                    <div class="flex items-center justify-end mt-0.5">
                      <span class="text-[9px]" :class="todayNavUpdateSet.has(product.id) ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
                        {{ getDailyReturn(product.code)?.date || '' }}
                      </span>
                    </div>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type !== 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 65px; min-width: 65px; max-width: 65px;">
                  <template v-if="getDailyProfit(product) !== null">
                    <p
                      class="text-[12px] font-semibold"
                      :class="(getDailyProfit(product) ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getDailyProfit(product) ?? 0) >= 0 ? '+' : '-' }}{{ Math.abs(getDailyProfit(product) ?? 0).toFixed(1) }}
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td class="px-2 py-2 text-right whitespace-nowrap" style="width: 80px; min-width: 80px; max-width: 80px;">
                  <template v-if="getPosition(product.id) && pageSettings.showMarketValue">
                    <p class="text-[12px] font-semibold text-apple-text">{{ Math.round((getPosition(product.id) as any).marketValue).toLocaleString() }}</p>
                  </template>
                  <template v-else-if="getPosition(product.id) && !pageSettings.showMarketValue">
                    <p class="text-[12px] font-semibold text-apple-secondary">****</p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'fixed_income'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 68px; min-width: 68px; max-width: 68px;">
                  <template v-if="getPosition(product.id) && pageSettings.showProfitRate">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getPosition(product.id) as any).annualRate >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getPosition(product.id) as any).annualRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).annualRate.toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else-if="getPosition(product.id) && !pageSettings.showProfitRate">
                    <p class="text-[12px] font-semibold text-apple-secondary">****</p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;">
                  <p class="text-[12px] font-semibold text-amber-600">{{ (product.interestRate || 0).toFixed(2) }}%</p>
                </td>
                <td class="px-2 py-2 text-right whitespace-nowrap" style="width: 80px; min-width: 80px; max-width: 80px;">
                  <template v-if="getPosition(product.id) && pageSettings.showProfitAmount">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getPosition(product.id) as any).profit >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getPosition(product.id) as any).profit >= 0 ? '+' : '' }}{{ formatCurrency1((getPosition(product.id) as any).profit) }}
                    </p>
                  </template>
                  <template v-else-if="getPosition(product.id) && !pageSettings.showProfitAmount">
                    <p class="text-[12px] font-semibold text-apple-secondary">****</p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 70px; min-width: 70px; max-width: 70px;">
                  <p class="text-[12px] font-semibold text-apple-text">
                    {{ getTermDepositMaturityProfit(product, getPosition(product.id)) !== null ? Math.round(getTermDepositMaturityProfit(product, getPosition(product.id)) as number).toLocaleString() : '-' }}
                  </p>
                </td>
                <td v-if="props.type === 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 55px; min-width: 55px; max-width: 55px;">
                  <p class="text-[12px] font-semibold text-apple-text">{{ formatDuration(product.durationMonths || 0) }}</p>
                </td>
                <td v-if="props.type === 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 85px; min-width: 85px; max-width: 85px;">
                  <p class="text-[12px] font-semibold text-apple-text">{{ formatMaturityDate(product) }}</p>
                  <p class="text-[9px] text-apple-secondary mt-0.5">
                    {{ getTermDepositProgress(product) >= 100 ? '已到期' : `剩${getTermDepositRemainingDays(product)}天` }}
                  </p>
                </td>
                <td v-if="props.type !== 'term_deposit'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 55px; min-width: 55px; max-width: 55px;">
                  <template v-if="getPosition(product.id)">
                    <p class="text-[12px] font-semibold text-apple-text">{{ (getPosition(product.id) as any).holdingDays }}天</p>
                    <p 
                      v-if="product.type === 'fixed_income' && getFixedIncomeRemainingDays(product, getPosition(product.id)) !== null" 
                      class="text-[9px] text-apple-secondary mt-0.5"
                    >
                      剩{{ getFixedIncomeRemainingDays(product, getPosition(product.id)) }}天
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'term_deposit'" class="px-2 py-2 text-center whitespace-nowrap" style="width: 60px; min-width: 60px; max-width: 60px;">
                  <p class="text-[12px] font-semibold text-amber-500">{{ getTermDepositProgress(product).toFixed(0) }}%</p>
                </td>
                <td v-if="props.type === 'equity'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 65px; min-width: 65px; max-width: 65px;">
                  <template v-if="getPosition(product.id) && pageSettings.showProfitRate">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getPosition(product.id) as any).profitRate >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getPosition(product.id) as any).profitRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).profitRate.toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else-if="getPosition(product.id) && !pageSettings.showProfitRate">
                    <p class="text-[12px] font-semibold text-apple-secondary">****</p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'fixed_income'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;" @click.stop>
                  <template v-if="getFixedIncomeAnnualRate(product.code)?.['1m'] !== undefined">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getFixedIncomeAnnualRate(product.code)?.['1m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getFixedIncomeAnnualRate(product.code)?.['1m'] || 0) >= 0 ? '+' : '' }}{{ (getFixedIncomeAnnualRate(product.code)?.['1m'] || 0).toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'fixed_income'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;" @click.stop>
                  <template v-if="getFixedIncomeAnnualRate(product.code)?.['3m'] !== undefined">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getFixedIncomeAnnualRate(product.code)?.['3m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getFixedIncomeAnnualRate(product.code)?.['3m'] || 0) >= 0 ? '+' : '' }}{{ (getFixedIncomeAnnualRate(product.code)?.['3m'] || 0).toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'fixed_income'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;">
                  <template v-if="getFixedIncomeAnnualRate(product.code)?.['1y'] !== undefined">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getFixedIncomeAnnualRate(product.code)?.['1y'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getFixedIncomeAnnualRate(product.code)?.['1y'] || 0) >= 0 ? '+' : '' }}{{ (getFixedIncomeAnnualRate(product.code)?.['1y'] || 0).toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">-</p>
                  </template>
                </td>
                <td v-if="props.type === 'equity'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;">
                  <template v-if="getStageGains(product.code)">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getStageGains(product.code)?.['1m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getStageGains(product.code)?.['1m'] || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.['1m'] || 0).toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">{{ loadingStageGains ? '...' : '-' }}</p>
                  </template>
                </td>
                <td v-if="props.type === 'equity'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;">
                  <template v-if="getStageGains(product.code)">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getStageGains(product.code)?.['3m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getStageGains(product.code)?.['3m'] || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.['3m'] || 0).toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">{{ loadingStageGains ? '...' : '-' }}</p>
                  </template>
                </td>
                <td v-if="props.type === 'equity'" class="px-2 py-2 text-right whitespace-nowrap" style="width: 52px; min-width: 52px; max-width: 52px;">
                  <template v-if="getStageGains(product.code)">
                    <p 
                      class="text-[12px] font-semibold"
                      :class="(getStageGains(product.code)?.ytd || 0) >= 0 ? 'text-profit' : 'text-loss'"
                    >
                      {{ (getStageGains(product.code)?.ytd || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.ytd || 0).toFixed(2) }}%
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-[11px] text-apple-secondary">{{ loadingStageGains ? '...' : '-' }}</p>
                  </template>
                </td>
                <td v-if="props.type !== 'equity'" class="px-2 py-2 text-center whitespace-nowrap" style="width: 55px; min-width: 55px; max-width: 55px;">
                  <p class="text-[12px] text-apple-secondary">{{ product.holder || '-' }}</p>
                </td>
                <td class="px-2 py-2 text-center whitespace-nowrap" @click.stop style="width: 56px; min-width: 56px; max-width: 56px;">
                  <div class="flex items-center justify-center space-x-0">
                    <button
                      v-if="product.type !== 'term_deposit'"
                      @click="handleToggleCompare(product)"
                      :class="[
                        'w-6 h-6 flex items-center justify-center rounded-md transition-colors',
                        isInCompare(product.id)
                          ? 'text-primary-500 bg-primary-50'
                          : 'text-apple-secondary hover:text-primary-500 hover:bg-primary-50'
                      ]"
                      :title="isInCompare(product.id) ? '移出对比' : '加入对比'"
                    >
                      <Scale class="w-3 h-3" />
                    </button>
                    <button
                      v-if="product.type === 'term_deposit'"
                      @click="handleEdit(product)"
                      class="w-6 h-6 flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div v-else class="md:hidden glass-card p-6 text-center -mx-3 md:mx-0">
      <p class="text-apple-text text-[15px] font-medium">暂无{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : props.type === 'term_deposit' ? '定期存款' : '产品' }}数据</p>
      <p class="text-apple-secondary text-[12px] mt-2">点击上方按钮添加{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : props.type === 'term_deposit' ? '定期存款' : '理财产品' }}</p>
    </div>
    
    <!-- 桌面端表格布局 -->
    <div class="hidden md:block glass-card overflow-hidden">
      <div class="overflow-x-auto">
        <table :class="['w-full apple-table', { 'term-deposit-table': props.type === 'term_deposit' }]">
          <thead>
            <tr>
              <th 
                class="px-2 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('name')"
              >
                <div class="flex items-center space-x-1">
                  <span>产品</span>
                  <ChevronsUpDown v-if="sortKey !== 'name'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type !== 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('dailyReturn')"
              >
                <span>当日涨幅</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'dailyReturn'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                v-if="props.type !== 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('dailyProfit')"
              >
                <span>当日收益</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'dailyProfit'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('marketValue')"
              >
                <span>持有市值</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'marketValue'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 固收产品特有列：持有年化收益率 -->
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('annualRate')"
              >
                <span>持有年化</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'annualRate'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 定存产品特有列：年利率 -->
              <th 
                v-if="props.type === 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('annualRate')"
              >
                <span>年利率</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'annualRate'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 收益列 -->
              <th 
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('profit')"
              >
                <span>持有收益</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'profit'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 定存产品特有列：到期收益 -->
              <th 
                v-if="props.type === 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('durationMonths')"
              >
                <span>到期收益</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'durationMonths'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 定存产品特有列：期限 -->
              <th 
                v-if="props.type === 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('durationMonths')"
              >
                <span>期限</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'durationMonths'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 定存产品特有列：到期日期 -->
              <th 
                v-if="props.type === 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('maturityDate')"
              >
                <span>到期</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'maturityDate'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 持有列 -->
              <th 
                v-if="props.type !== 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('holdingDays')"
              >
                <span>持有</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'holdingDays'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 定存产品特有列：存款进度 -->
              <th 
                v-if="props.type === 'term_deposit'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>存款进度</span>
                </div>
              </th>
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('profitRate')"
              >
                <span>持有涨幅</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'profitRate'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 固收产品特有列：年化收益率统计 -->
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('fiAnnual1m')"
              >
                <span>近1月</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'fiAnnual1m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('fiAnnual3m')"
              >
                <span>近3月</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'fiAnnual3m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('fiAnnual1y')"
              >
                <span>近1年</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'fiAnnual1y'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <!-- 权益类型特有列：阶段涨幅 -->
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('stageGains1m')"
              >
                <span>近1月</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'stageGains1m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('stageGains3m')"
              >
                <span>近3月</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'stageGains3m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none relative pr-3"
                @click="handleSort('stageGainsYtd')"
              >
                <span>今年</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'stageGainsYtd'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th 
                v-if="props.type !== 'equity'"
                class="px-2 py-2.5 text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('holder')"
              >
                <span>持有人</span>
                <span class="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center">
                  <ChevronsUpDown v-if="sortKey !== 'holder'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </span>
              </th>
              <th class="px-2 py-2.5 text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider w-16">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-apple-border/50">
            <tr 
              v-for="product in filteredProducts" 
              :key="product.id" 
              class="hover:bg-primary-50/30 transition-colors"
              :class="product.type === 'term_deposit' ? '' : 'cursor-pointer'"
              @click="product.type !== 'term_deposit' && router.push({ name: 'product-detail', params: { id: product.id }, query: { status: filterStatus, type: filterType } })"
            >
              <td class="px-2 py-3">
                <div>
                  <div class="flex items-center gap-1.5">
                    <h3 class="text-[14px] font-semibold text-apple-text truncate sm:truncate-none sm:max-w-none max-w-[140px]">{{ product.name }}</h3>
                    <span 
                      v-if="productStatusMap.get(product.id)"
                      class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                      :style="{ backgroundColor: PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.color + '15', color: PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.color }"
                    >
                      {{ PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.label }}
                    </span>
                  </div>
                  <div class="flex items-center space-x-2 mt-1">
                    <span 
                      v-if="!props.type"
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                      :class="{
                        'bg-primary-50 text-primary-500': product.type === 'equity' || product.type === 'fund',
                        'bg-fixed-income/10 text-fixed-income': product.type === 'fixed_income',
                        'bg-amber-50 text-amber-600': product.type === 'term_deposit'
                      }"
                    >
                      {{ getProductTypeLabel(product.type) }}
                    </span>
                    <!-- 定存产品特有信息 -->
                    <template v-if="product.type === 'term_deposit'">
                      <span v-if="product.bankName" class="text-[11px] text-apple-secondary shrink-0">{{ product.bankName }}</span>
                      <span v-if="product.minAmount" class="text-[11px] text-apple-secondary shrink-0">本金{{ product.minAmount.toLocaleString() }}元</span>
                    </template>
                    <!-- 其他产品类型信息 -->
                    <template v-else>
                      <span v-if="product.code" class="text-[11px] font-mono text-apple-secondary shrink-0">代码: {{ product.code }}</span>
                      <span v-if="product.type === 'fixed_income' && (product as any).holdingTerm" class="text-[11px] text-fixed-income shrink-0 bg-fixed-income/5 px-1.5 py-0.5 rounded">期限: {{ (product as any).holdingTerm }}</span>
                      <!-- PC端权益产品显示限购信息（不显示备注） -->
                      <span v-if="props.type === 'equity' && product.purchaseLimit" class="text-[11px] text-amber-500 truncate max-w-[150px]" :title="product.purchaseLimit">{{ product.purchaseLimit }}</span>
                      <span v-if="product.dcaAmount && product.dcaCycle" class="text-[11px] text-primary-500 shrink-0">定投: {{ getDcaLabel(product.dcaAmount, product.dcaCycle) }}</span>
                    </template>
                  </div>
                </div>
              </td>
              <td v-if="props.type !== 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getDailyReturn(product.code)">
                  <p
                    class="text-[14px] font-semibold"
                    :class="(getDailyReturn(product.code)?.dailyReturn ?? 0) > 0 ? 'text-profit' : (getDailyReturn(product.code)?.dailyReturn ?? 0) < 0 ? 'text-loss' : ''"
                  >
                    {{ (getDailyReturn(product.code)?.dailyReturn ?? 0) > 0 ? '+' : '' }}{{ (getDailyReturn(product.code)?.dailyReturn ?? 0).toFixed(2) }}%
                  </p>
                  <div class="flex items-center justify-end mt-0.5">
                    <span class="text-[11px]" :class="todayNavUpdateSet.has(product.id) ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
                      {{ getDailyReturn(product.code)?.date || '' }}
                    </span>
                  </div>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <td v-if="props.type !== 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getDailyProfit(product) !== null">
                  <p
                    class="text-[14px] font-semibold"
                    :class="(getDailyProfit(product) ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getDailyProfit(product) ?? 0) >= 0 ? '+' : '-' }}{{ Math.abs(getDailyProfit(product) ?? 0).toFixed(1) }}
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <td class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id) && pageSettings.showMarketValue">
                  <p class="text-[14px] font-semibold text-apple-text">{{ Math.round((getPosition(product.id) as any).marketValue).toLocaleString() }}</p>
                </template>
                <template v-else-if="getPosition(product.id) && !pageSettings.showMarketValue">
                  <p class="text-[14px] font-semibold text-apple-secondary">****</p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <!-- 固收产品特有列：持有年化收益率 -->
              <td v-if="props.type === 'fixed_income'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id) && pageSettings.showProfitRate">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getPosition(product.id) as any).annualRate >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getPosition(product.id) as any).annualRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).annualRate.toFixed(2) }}%
                  </p>
                </template>
                <template v-else-if="getPosition(product.id) && !pageSettings.showProfitRate">
                  <p class="text-[14px] font-semibold text-apple-secondary">****</p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <!-- 定存产品特有列：年利率 -->
              <td v-if="props.type === 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <p class="text-[14px] font-semibold text-amber-600">{{ (product.interestRate || 0).toFixed(2) }}%</p>
              </td>
              <!-- 收益列 -->
              <td class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id) && pageSettings.showProfitAmount">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getPosition(product.id) as any).profit >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getPosition(product.id) as any).profit >= 0 ? '+' : '' }}{{ formatCurrency1((getPosition(product.id) as any).profit) }}
                  </p>
                </template>
                <template v-else-if="getPosition(product.id) && !pageSettings.showProfitAmount">
                  <p class="text-[14px] font-semibold text-apple-secondary">****</p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <!-- 定存产品特有列：到期收益 -->
              <td v-if="props.type === 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <p class="text-[14px] font-semibold text-apple-text">
                  {{ getTermDepositMaturityProfit(product, getPosition(product.id)) !== null ? Math.round(getTermDepositMaturityProfit(product, getPosition(product.id)) as number).toLocaleString() : '-' }}
                </p>
              </td>
              <!-- 定存产品特有列：期限 -->
              <td v-if="props.type === 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <p class="text-[14px] font-semibold text-apple-text">{{ formatDuration(product.durationMonths || 0) }}</p>
              </td>
              <!-- 定存产品特有列：到期日期 -->
              <td v-if="props.type === 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <p class="text-[14px] font-semibold text-apple-text">{{ formatMaturityDate(product) }}</p>
                <p class="text-[10px] text-apple-secondary mt-0.5">
                  {{ getTermDepositProgress(product) >= 100 ? '已到期' : `剩余${getTermDepositRemainingDays(product)}天` }}
                </p>
              </td>
              <!-- 持有列 -->
              <td v-if="props.type !== 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p class="text-[14px] font-semibold text-apple-text">{{ (getPosition(product.id) as any).holdingDays }} 天</p>
                  <p 
                    v-if="product.type === 'fixed_income' && getFixedIncomeRemainingDays(product, getPosition(product.id)) !== null" 
                    class="text-[10px] text-apple-secondary mt-0.5"
                  >
                    剩余{{ getFixedIncomeRemainingDays(product, getPosition(product.id)) }}天
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <!-- 定存产品特有列：存款进度 -->
              <td v-if="props.type === 'term_deposit'" class="px-2 py-3 text-right whitespace-nowrap">
                <p class="text-[14px] font-semibold text-amber-500 text-right">{{ getTermDepositProgress(product).toFixed(1) }}%</p>
              </td>
              <td v-if="props.type === 'equity'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id) && pageSettings.showProfitRate">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getPosition(product.id) as any).profitRate >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getPosition(product.id) as any).profitRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).profitRate.toFixed(2) }}%
                  </p>
                </template>
                <template v-else-if="getPosition(product.id) && !pageSettings.showProfitRate">
                  <p class="text-[14px] font-semibold text-apple-secondary">****</p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <!-- 固收产品特有列：年化收益率统计 -->
              <td v-if="props.type === 'fixed_income'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getFixedIncomeAnnualRate(product.code)?.['1m'] !== undefined">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getFixedIncomeAnnualRate(product.code)?.['1m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getFixedIncomeAnnualRate(product.code)?.['1m'] || 0) >= 0 ? '+' : '' }}{{ (getFixedIncomeAnnualRate(product.code)?.['1m'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <td v-if="props.type === 'fixed_income'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getFixedIncomeAnnualRate(product.code)?.['3m'] !== undefined">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getFixedIncomeAnnualRate(product.code)?.['3m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getFixedIncomeAnnualRate(product.code)?.['3m'] || 0) >= 0 ? '+' : '' }}{{ (getFixedIncomeAnnualRate(product.code)?.['3m'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <td v-if="props.type === 'fixed_income'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getFixedIncomeAnnualRate(product.code)?.['1y'] !== undefined">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getFixedIncomeAnnualRate(product.code)?.['1y'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getFixedIncomeAnnualRate(product.code)?.['1y'] || 0) >= 0 ? '+' : '' }}{{ (getFixedIncomeAnnualRate(product.code)?.['1y'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <!-- 权益类型特有列：阶段涨幅 -->
              <td v-if="props.type === 'equity'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getStageGains(product.code)">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getStageGains(product.code)?.['1m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getStageGains(product.code)?.['1m'] || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.['1m'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">{{ loadingStageGains ? '...' : '-' }}</p>
                </template>
              </td>
              <td v-if="props.type === 'equity'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getStageGains(product.code)">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getStageGains(product.code)?.['3m'] || 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getStageGains(product.code)?.['3m'] || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.['3m'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">{{ loadingStageGains ? '...' : '-' }}</p>
                </template>
              </td>
              <td v-if="props.type === 'equity'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getStageGains(product.code)">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getStageGains(product.code)?.ytd || 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getStageGains(product.code)?.ytd || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.ytd || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">{{ loadingStageGains ? '...' : '-' }}</p>
                </template>
              </td>
              <td v-if="props.type !== 'equity'" class="px-2 py-3 text-center whitespace-nowrap">
                <p class="text-[14px] text-apple-secondary">{{ product.holder || '-' }}</p>
              </td>
              <td class="px-2 py-3 text-center whitespace-nowrap" @click.stop>
                <div class="flex items-center justify-center space-x-0.5">
                  <button
                    v-if="product.type !== 'term_deposit'"
                    @click="handleToggleCompare(product)"
                    :class="[
                      'w-7 h-7 flex items-center justify-center rounded-md transition-colors',
                      isInCompare(product.id)
                        ? 'text-primary-500 bg-primary-50'
                        : 'text-apple-secondary hover:text-primary-500 hover:bg-primary-50'
                    ]"
                    :title="isInCompare(product.id) ? '移出对比' : '加入对比'"
                  >
                    <Scale class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="handleEdit(product)"
                    class="w-7 h-7 flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button
                    @click="handleDelete(product.id)"
                    class="w-7 h-7 flex items-center justify-center text-apple-secondary hover:text-profit hover:bg-profit/5 rounded-md transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filteredProducts.length === 0" class="p-10 text-center">
        <p class="text-apple-text text-[17px] font-medium">暂无{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : props.type === 'term_deposit' ? '定期存款' : '产品' }}数据</p>
        <p class="text-apple-secondary text-[14px] mt-2">点击上方按钮添加{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : props.type === 'term_deposit' ? '定期存款' : '理财产品' }}</p>
      </div>
    </div>
    
    <ProductModal 
      :visible="showModal"
      :edit-product="editingProduct"
      :default-type="props.type"
      @close="showModal = false"
      @submit="handleSubmit"
    />

    <!-- 对比面板（侧滑） -->
    <Teleport to="body">
      <Transition name="slide">
        <div 
          v-if="showComparePanel" 
          class="fixed inset-0 z-50 flex justify-end"
          @click.self="closeComparePanel"
        >
          <!-- 遮罩 -->
          <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
          
          <!-- 面板内容 -->
          <div class="relative w-full max-w-2xl bg-white dark:bg-apple-bg h-full shadow-2xl flex flex-col overflow-hidden">
            <!-- 面板头部 -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-black/5">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center">
                  <Scale class="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 class="text-lg font-semibold text-apple-text">产品对比</h2>
                  <p class="text-xs text-apple-secondary">对比多只产品的区间收益率与净值走势</p>
                </div>
              </div>
              <button 
                @click="closeComparePanel"
                class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
              >
                <X class="w-5 h-5 text-apple-secondary" />
              </button>
            </div>

            <!-- 面板主体（可滚动） -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
              <!-- 控制栏 -->
              <div v-if="compareAvailableTypes.length > 1" class="glass-card p-4 space-y-4 relative z-30">
                <!-- 类型切换 -->
                <div class="flex items-center gap-3">
                  <span class="text-xs text-apple-secondary">类型:</span>
                  <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
                    <button
                      v-for="t in compareAvailableTypes"
                      :key="t.value"
                      @click="handleSwitchCompareType(t.value as 'equity' | 'fixed_income' | 'term_deposit')"
                      :class="[
                        'px-3.5 py-1.5 text-xs rounded-full transition-all duration-200',
                        compareType === t.value
                          ? 'bg-white text-apple-text shadow-sm font-medium'
                          : 'text-apple-secondary hover:text-apple-text'
                      ]"
                    >
                      {{ t.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- 空状态 -->
              <div v-if="compareIds.length === 0" class="glass-card p-12 text-center">
                <Scale class="w-12 h-12 text-apple-secondary/30 mx-auto mb-3" />
                <p class="text-apple-text text-base font-medium">未选择对比产品</p>
                <p class="text-apple-secondary text-sm mt-2">请在产品列表中点击对比图标添加产品</p>
              </div>

              <template v-else>
                <!-- 区间收益率对比表格 -->
                <div class="glass-card overflow-hidden">
                  <div class="px-5 py-4 border-b border-apple-border/30">
                    <h3 class="text-base font-semibold text-apple-text">区间收益率对比</h3>
                    <p class="text-xs text-apple-secondary mt-0.5">
                      {{ compareIsEquityType ? '实际收益率（非年化）' : '年化收益率' }} · 各区间与成立天数
                    </p>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="w-full apple-table" style="table-layout: fixed;">
                      <thead>
                        <tr>
                          <th class="px-4 py-2.5 w-[180px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('name')">
                            <div class="flex items-center justify-center space-x-1"><span>产品</span><component :is="getCompareSortIcon('name')" class="w-4 h-4" :class="compareSortKey === 'name' ? 'text-primary-500' : ''" /></div>
                          </th>
                          <th class="px-4 py-2.5 w-[80px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('r1m')">
                            <div class="flex items-center justify-center space-x-1"><span>近1月</span><component :is="getCompareSortIcon('r1m')" class="w-4 h-4" :class="compareSortKey === 'r1m' ? 'text-primary-500' : ''" /></div>
                          </th>
                          <th class="px-4 py-2.5 w-[80px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('r3m')">
                            <div class="flex items-center justify-center space-x-1"><span>近3月</span><component :is="getCompareSortIcon('r3m')" class="w-4 h-4" :class="compareSortKey === 'r3m' ? 'text-primary-500' : ''" /></div>
                          </th>
                          <th class="px-4 py-2.5 w-[80px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('r6m')">
                            <div class="flex items-center justify-center space-x-1"><span>近6月</span><component :is="getCompareSortIcon('r6m')" class="w-4 h-4" :class="compareSortKey === 'r6m' ? 'text-primary-500' : ''" /></div>
                          </th>
                          <th class="px-4 py-2.5 w-[80px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('r1y')">
                            <div class="flex items-center justify-center space-x-1"><span>近1年</span><component :is="getCompareSortIcon('r1y')" class="w-4 h-4" :class="compareSortKey === 'r1y' ? 'text-primary-500' : ''" /></div>
                          </th>
                          <th class="px-4 py-2.5 w-[100px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('rInception')">
                            <div class="flex items-center justify-center space-x-1"><span>成立以来</span><component :is="getCompareSortIcon('rInception')" class="w-4 h-4" :class="compareSortKey === 'rInception' ? 'text-primary-500' : ''" /></div>
                          </th>
                          <th class="px-4 py-2.5 w-[100px] whitespace-nowrap text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleCompareSort('inceptionDays')">
                            <div class="flex items-center justify-center space-x-1"><span>成立天数</span><component :is="getCompareSortIcon('inceptionDays')" class="w-4 h-4" :class="compareSortKey === 'inceptionDays' ? 'text-primary-500' : ''" /></div>
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-apple-border/50 whitespace-nowrap">
                        <tr v-for="item in sortedCompareData" :key="item.product.id">
                          <td class="px-4 py-3 w-[180px] text-center">
                            <div class="flex items-center justify-center space-x-2">
                              <span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: item.color }"></span>
                              <div class="min-w-0 flex-1">
                                <p class="text-sm text-apple-text font-medium truncate" :title="item.product.name">{{ item.product.name }}</p>
                                <p class="text-xs text-apple-secondary truncate">{{ getCompareProductTypeLabel(item.product.type) }}<span v-if="item.product.code"> · {{ item.product.code }}</span></p>
                              </div>
                            </div>
                          </td>
                          <td class="px-4 py-3 w-[80px] text-sm text-center font-semibold" :class="getCompareReturnClass(getCompareReturnValue(item.r1m))">
                            {{ formatCompareReturn(getCompareReturnValue(item.r1m)) }}
                          </td>
                          <td class="px-4 py-3 w-[80px] text-sm text-center font-semibold" :class="getCompareReturnClass(getCompareReturnValue(item.r3m))">
                            {{ formatCompareReturn(getCompareReturnValue(item.r3m)) }}
                          </td>
                          <td class="px-4 py-3 w-[80px] text-sm text-center font-semibold" :class="getCompareReturnClass(getCompareReturnValue(item.r6m))">
                            {{ formatCompareReturn(getCompareReturnValue(item.r6m)) }}
                          </td>
                          <td class="px-4 py-3 w-[80px] text-sm text-center font-semibold" :class="getCompareReturnClass(getCompareReturnValue(item.r1y))">
                            {{ formatCompareReturn(getCompareReturnValue(item.r1y)) }}
                          </td>
                          <td class="px-4 py-3 w-[100px] text-sm text-center font-semibold" :class="getCompareReturnClass(getCompareReturnValue(item.rInception))">
                            {{ formatCompareReturn(getCompareReturnValue(item.rInception)) }}
                          </td>
                          <td class="px-4 py-3 w-[100px] text-sm text-center text-apple-secondary">
                            {{ item.inceptionDays > 0 ? item.inceptionDays + ' 天' : '—' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- 净值曲线对比图 -->
                <div class="glass-card p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <h3 class="text-base font-semibold text-apple-text">净值走势对比</h3>
                      <p class="text-xs text-apple-secondary mt-0.5">归一化起点 = 100，支持滚轮缩放与拖动平移</p>
                    </div>
                    <div class="flex items-center space-x-1 text-xs text-apple-secondary">
                      <component :is="compareData.length > 0 && (getCompareReturnValue(compareData[0].r1y) ?? 0) >= 0 ? TrendingUp : TrendingDown" class="w-4 h-4" />
                      <span>{{ compareData.filter(d => d.hasData).length }} 只产品</span>
                    </div>
                  </div>
                  <!-- 区间选择器 -->
                  <div class="flex items-center flex-wrap gap-2 mb-3 pb-3 border-b border-apple-border/30">
                    <span class="text-xs text-apple-secondary">区间:</span>
                    <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
                      <button
                        v-for="opt in rangeOptions"
                        :key="opt.value"
                        @click="compareRangeType = opt.value"
                        :class="[
                          'px-2.5 py-1 text-xs rounded-full transition-all duration-200',
                          compareRangeType === opt.value
                            ? 'bg-white text-apple-text shadow-sm font-medium'
                            : 'text-apple-secondary hover:text-apple-text'
                        ]"
                      >
                        {{ opt.label }}
                      </button>
                    </div>
                    <template v-if="compareRangeType === 'custom'">
                      <input
                        v-model="compareCustomStart"
                        type="date"
                        class="glass-input px-3 py-1 text-xs rounded-full outline-none"
                      />
                      <span class="text-apple-secondary text-xs">至</span>
                      <input
                        v-model="compareCustomEnd"
                        type="date"
                        class="glass-input px-3 py-1 text-xs rounded-full outline-none"
                      />
                    </template>
                  </div>
                  <div ref="compareChartRef" class="w-full" style="height: 380px;"></div>
                  <div v-if="compareData.filter(d => d.hasData).length === 0" class="text-center py-12">
                    <p class="text-apple-secondary text-sm">所选产品在当前区间内净值数据不足</p>
                    <p class="text-apple-secondary text-xs mt-2 opacity-70">请尝试切换区间或在产品详情页补全历史净值</p>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.3s ease;
}

.slide-enter-active .relative,
.slide-leave-active .relative {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

.slide-enter-from .relative,
.slide-leave-to .relative {
  transform: translateX(100%);
}

/* 定存产品列表列间距调整 */
.term-deposit-table th,
.term-deposit-table td {
  padding-left: 0.75rem !important;
  padding-right: 0.75rem !important;
}
</style>
