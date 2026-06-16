<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ArrowLeft, Plus, Edit2, Trash2, TrendingUp, TrendingDown, RefreshCw, Calendar, ArrowUp, ArrowDown, ChevronsUpDown, History } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useFinance, initFinance } from '@/composables/useFinance'
import { formatCurrency, formatCurrencyInt, formatPercent, formatDate, getDateOnly } from '@/utils/format'
import { fetchFundNav, fetchCmbNav, fetchCmbNavHistory, fetchFundStageGains, fetchFundHoldings, type NavResult, type StageGains, type FundHoldingsResult } from '@/utils/fundApi'
import { getAuthHeaders } from '@/utils/storage'
import type { Transaction } from '@/types'
import TransactionModal from '@/components/TransactionModal.vue'
import * as echarts from 'echarts'

const route = useRoute()
const router = useRouter()
const { getProductById, getPositionById, getTransactionsByProductId, addTransaction, updateTransaction, deleteTransaction, updateProduct, PRODUCT_TYPE_OPTIONS } = useFinance()

const fetchingNav = ref(false)
const fetchingNavHistory = ref(false)
const fetchingStageGains = ref(false)
const fetchingHoldings = ref(false)
const navFetchError = ref('')
const navHistorySuccess = ref('')
const stageGains = ref<StageGains | null>(null)
const holdingsData = ref<FundHoldingsResult | null>(null)

const handleFetchStageGains = async () => {
  if (!product.value?.code || product.value.type !== 'fund') return

  fetchingStageGains.value = true
  try {
    const result = await fetchFundStageGains(product.value.code)
    stageGains.value = result.data
  } catch (e: any) {
    console.error('获取阶段涨幅失败:', e)
  } finally {
    fetchingStageGains.value = false
  }
}

const handleFetchHoldings = async () => {
  if (!product.value?.code || product.value.type !== 'fund') return

  fetchingHoldings.value = true
  try {
    holdingsData.value = await fetchFundHoldings(product.value.code)
  } catch (e: any) {
    console.error('获取持仓信息失败:', e)
  } finally {
    fetchingHoldings.value = false
  }
}

const handleFetchNav = async () => {
  if (!product.value?.code) return

  const todayTimestamp = getDateOnly(Date.now())
  const existingTransactions = getTransactionsByProductId(productId.value)
  if (existingTransactions.some(
    t => t.type === 'nav_update' && getDateOnly(t.date) === todayTimestamp
  )) return

  fetchingNav.value = true
  navFetchError.value = ''
  try {
    let result: NavResult
    let sourceLabel: string
    if (product.value.type === 'fund') {
      result = await fetchFundNav(product.value.code)
      sourceLabel = '天天基金'
    } else {
      result = await fetchCmbNav(product.value.code)
      sourceLabel = '招银理财'
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
    const updateTime = new Date().toLocaleString('zh-CN')
    const navNote = `${sourceLabel}自动查询 - ${updateTime}`
    if (!existingTransactions.some(
      t => t.type === 'nav_update' && getDateOnly(t.date) === dateTimestamp
    )) {
      addTransaction(
        productId.value,
        'nav_update',
        dateTimestamp,
        0,
        result.nav,
        0,
        0,
        navNote
      )
    }

    // 将限购信息写入产品备注
    if (result.purchaseLimitLabel) {
      const currentNote = product.value.note || ''
      // 移除旧的限购标记，追加新的
      const cleaned = currentNote
        .split('\n')
        .filter(line => !/^(限购:|不限购$|暂停申购$)/.test(line.trim()))
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
        product.value.dcaCycle
      )
    }
  } catch (e: any) {
    navFetchError.value = e.message || '查询失败'
  } finally {
    fetchingNav.value = false
  }
}

const handleFetchNavHistory = async () => {
  if (!product.value?.code || product.value.type === 'fund') return

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

    const results = await fetchCmbNavHistory(product.value.code, 10)
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
        addTransaction(
          productId.value,
          'nav_update',
          dateTimestamp,
          0,
          result.nav,
          0,
          0,
          `招银理财批量查询 - 净值日期 ${result.date}`
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

// 补全基金历史净值
const backfillingNav = ref(false)

const handleBackfillNav = async () => {
  if (!product.value?.code || product.value.type !== 'fund') return

  backfillingNav.value = true
  navFetchError.value = ''
  navHistorySuccess.value = ''
  try {
    const res = await fetch(`/api/db/fund/backfill-nav/${productId.value}`, { method: 'POST', headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '补全失败')
    if (data.inserted > 0) {
      navHistorySuccess.value = `补全成功！共 ${data.total} 条历史净值，新增 ${data.inserted} 条`
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
const allocationChartRef = ref<HTMLDivElement>()
const holdingsChartRef = ref<HTMLDivElement>()
let allocationChart: echarts.ECharts | null = null
let holdingsChart: echarts.ECharts | null = null

const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

const renderHoldingsCharts = () => {
  const data = holdingsData.value
  if (!data) return

  // 释放旧实例，避免绑定到已销毁的 DOM
  if (allocationChart) { allocationChart.dispose(); allocationChart = null }
  if (holdingsChart) { holdingsChart.dispose(); holdingsChart = null }

  // 使用 setTimeout 确保 DOM 完全渲染后再初始化图表
  setTimeout(() => {
    // 资产配置饼图
    if (allocationChartRef.value && data.assetAllocation) {
      allocationChart = echarts.init(allocationChartRef.value)
      const aa = data.assetAllocation
      const allocData = [
        { name: '股票', value: aa.stockRatio || 0 },
        { name: '债券', value: aa.bondRatio || 0 },
        { name: '现金', value: aa.cashRatio || 0 },
      ]
      // 计算"其他"占比
      const total = allocData.reduce((s, d) => s + d.value, 0)
      const other = Math.max(0, 100 - total)
      if (other > 0.01) allocData.push({ name: '其他', value: parseFloat(other.toFixed(2)) })
      allocationChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
        legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
        color: ['#3b82f6', '#10b981', '#f59e0b', '#9ca3af'],
        series: [{
          type: 'pie', radius: ['40%', '65%'], center: ['50%', '45%'],
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 11 },
          data: allocData
        }]
      })
    }
    // 前十大重仓股饼图
    if (holdingsChartRef.value && data.stocks?.length) {
      holdingsChart = echarts.init(holdingsChartRef.value)
      const stocks = data.stocks
      const stocksData: { name: string; value: number; itemStyle?: { color: string } }[] = stocks.map(s => ({ name: s.name, value: s.ratio }))
      // 计算"其他"占比（前十大之外的部分）
      const topTotal = stocks.reduce((s, st) => s + st.ratio, 0)
      const rest = Math.max(0, 100 - topTotal)
      // "其他"使用灰色，避免与股票颜色重复
      if (rest > 0.01) stocksData.push({ name: '其他', value: parseFloat(rest.toFixed(2)), itemStyle: { color: '#9ca3af' } })
      holdingsChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
        legend: { show: false },
        color: PIE_COLORS,
        series: [{
          type: 'pie', radius: ['40%', '65%'], center: ['50%', '45%'],
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 10 },
          data: stocksData
        }]
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
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
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

const updateChart = () => {
  if (!chart) return
  
  const navData = filteredNavTransactions.value
  if (navData.length === 0) {
    chart.clear()
    return
  }
  
  const navValues = navData.map(t => t.nav)
  const minNav = Math.min(...navValues, position.value?.currentNav || 1)
  const maxNav = Math.max(...navValues, position.value?.currentNav || 1)
  const navRange = maxNav - minNav
  const padding = navRange * 0.1 || 0.02

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
        symbol: isBuy ? 'triangle' : 'pin',
        symbolSize: isBuy ? 10 : 12,
        symbolRotate: isBuy ? 0 : 180,
        itemStyle: { color: isBuy ? '#ef4444' : '#3b82f6' },
        label: {
          show: false
        }
      }
    })
    .filter(Boolean)
  
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>净值: {c}'
    },
    grid: {
      left: 10,
      right: 10,
      bottom: 40,
      top: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: navData.map(t => {
        const dateStr = t.date
        // formatDate 返回 YYYY/MM/DD 格式，转为 YY/MM/DD 显示
        if (dateStr.length === 10 && dateStr.includes('/')) {
          return dateStr.substring(2)
        }
        return dateStr
      }),
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        interval: 'auto'
      },
      axisTick: {
        alignWithLabel: true
      },
      axisLine: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      min: Math.max(0, minNav - padding),
      max: maxNav + padding,
      axisLabel: {
        fontSize: 9,
        interval: 'auto',
        formatter: (value: number) => value.toFixed(4)
      },
      splitNumber: 5,
      axisLine: {
        show: true
      },
      axisTick: {
        show: true
      }
    },
    series: [{
      type: 'line',
      data: navData.map(t => t.nav),
      smooth: true,
      lineStyle: {
        color: '#10b981',
        width: 2
      },
      itemStyle: {
        color: '#10b981'
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
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  updateChart()
}

const handleResize = () => {
  chart?.resize()
  allocationChart?.resize()
  holdingsChart?.resize()
}

onMounted(async () => {
  await initFinance()
  if (!product.value) {
    router.push({ name: 'products' })
    return
  }
  initChart()
  window.addEventListener('resize', handleResize)
  // 基金产品自动加载阶段涨幅和持仓信息
  if (product.value.type === 'fund' && product.value.code) {
    handleFetchStageGains()
    handleFetchHoldings()
  }
})

watch([navRange, filteredNavTransactions], () => {
  updateChart()
})

watch(holdingsData, () => {
  renderHoldingsCharts()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  allocationChart?.dispose()
  holdingsChart?.dispose()
})
</script>

<template>
  <div v-if="product" class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4">
      <div class="flex items-center space-x-4">
        <button 
          @click="router.push({ name: 'products' })"
          class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-3">
            <h2 class="text-xl font-bold text-gray-800 truncate">{{ product.name }}</h2>
            <span v-if="product.code" class="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex-shrink-0">
              {{ product.code }}
            </span>
          </div>
          <div class="flex items-center space-x-2 mt-1">
            <span 
              class="text-sm px-2 py-0.5 rounded-full"
              :style="{ backgroundColor: getProductTypeColor(product.type) + '20', color: getProductTypeColor(product.type) }"
            >
              {{ getProductTypeLabel(product.type) }}
            </span>
            <span v-if="product.note" class="text-sm text-gray-500 truncate">{{ product.note }}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2 flex-wrap gap-2">
        <button
          v-if="product.code && product.type !== 'fund'"
          @click="handleFetchNavHistory"
          :disabled="fetchingNavHistory"
          class="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <Calendar class="w-4 h-4" :class="{ 'animate-spin': fetchingNavHistory }" />
          <span>{{ fetchingNavHistory ? '查询中...' : '查询近10天净值' }}</span>
        </button>
        <button
          v-if="product.code && product.type === 'fund'"
          @click="handleBackfillNav"
          :disabled="backfillingNav"
          class="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <History class="w-4 h-4" :class="{ 'animate-spin': backfillingNav }" />
          <span>{{ backfillingNav ? '补全中...' : '补全历史净值' }}</span>
        </button>
        <button
          v-if="product.code"
          @click="handleFetchNav"
          :disabled="fetchingNav"
          class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': fetchingNav }" />
          <span>{{ fetchingNav ? '查询中...' : '查询净值' }}</span>
        </button>
      </div>
    </div>
    <p v-if="navFetchError" class="text-sm text-red-600 mt-2">{{ navFetchError }}</p>
    <p v-if="navHistorySuccess" class="text-sm text-green-600 mt-2">{{ navHistorySuccess }}</p>

    <!-- 持仓概览 + 阶段涨幅 并排显示 -->
    <div :class="product.type === 'fund' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''">
      <!-- 持仓概览 -->
      <div v-if="position" class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">持仓概览</h3>
          <component 
            :is="(position?.profitRate ?? 0) >= 0 ? TrendingUp : TrendingDown" 
            :class="['w-5 h-5', (position?.profitRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']"
          />
        </div>
        <div :class="['grid gap-4', product.type === 'fund' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5']">
          <div>
            <p class="text-xs text-gray-500">持有天数</p>
            <p class="font-semibold text-gray-800 mt-1">{{ position?.holdingDays || 0 }} 天</p>
          </div>
          <div>
            <p class="text-xs text-gray-500">当前市值</p>
            <p class="font-semibold text-gray-800 mt-1">{{ formatCurrencyInt(position?.marketValue || 0) }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500">盈亏金额</p>
            <p :class="['font-semibold mt-1', (position?.profit ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatCurrency(position?.profit || 0) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-500">收益率</p>
            <p :class="['font-semibold mt-1', (position?.profitRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatPercent(position?.profitRate || 0) }}
            </p>
          </div>
          <div v-if="product.type !== 'fund'">
            <p class="text-xs text-gray-500">年化收益率</p>
            <p :class="['font-semibold mt-1', (position?.annualRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatPercent(position?.annualRate || 0) }}
            </p>
          </div>
        </div>
      </div>

      <!-- 阶段涨幅 (仅基金产品显示) -->
      <div v-if="product.type === 'fund' && stageGains" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">阶段涨幅</h3>
          <button
            @click="handleFetchStageGains"
            :disabled="fetchingStageGains"
            class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center space-x-1"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingStageGains }" />
            <span>{{ fetchingStageGains ? '刷新中...' : '刷新' }}</span>
          </button>
        </div>
        <div class="grid grid-cols-4 md:grid-cols-4 gap-3">
          <div v-if="stageGains['1w'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近1周</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['1w'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['1w'] >= 0 ? '+' : '' }}{{ stageGains['1w'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['1m'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近1月</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['1m'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['1m'] >= 0 ? '+' : '' }}{{ stageGains['1m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['3m'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近3月</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['3m'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['3m'] >= 0 ? '+' : '' }}{{ stageGains['3m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['6m'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近6月</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['6m'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['6m'] >= 0 ? '+' : '' }}{{ stageGains['6m'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['1y'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近1年</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['1y'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['1y'] >= 0 ? '+' : '' }}{{ stageGains['1y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['2y'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近2年</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['2y'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['2y'] >= 0 ? '+' : '' }}{{ stageGains['2y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains['3y'] !== undefined" class="text-center">
            <p class="text-xs text-gray-500">近3年</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains['3y'] >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains['3y'] >= 0 ? '+' : '' }}{{ stageGains['3y'].toFixed(2) }}%
            </p>
          </div>
          <div v-if="stageGains.ytd !== undefined" class="text-center">
            <p class="text-xs text-gray-500">今年来</p>
            <p class="text-sm font-semibold mt-1" :class="stageGains.ytd >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ stageGains.ytd >= 0 ? '+' : '' }}{{ stageGains.ytd.toFixed(2) }}%
            </p>
          </div>
        </div>
      </div>
      <div v-else-if="product.type === 'fund' && !stageGains && !fetchingStageGains" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">阶段涨幅</h3>
          <button
            @click="handleFetchStageGains"
            :disabled="fetchingStageGains"
            class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center space-x-1"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingStageGains }" />
            <span>加载</span>
          </button>
        </div>
        <p class="text-sm text-gray-500 mt-2">点击加载查看基金阶段涨幅数据</p>
      </div>
      <div v-else-if="product.type === 'fund' && fetchingStageGains" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">阶段涨幅</h3>
        <p class="text-sm text-gray-500">加载中...</p>
      </div>
    </div>
    
    <!-- 持仓信息 + 净值走势 并排显示 -->
    <div :class="product.type === 'fund' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch' : ''">
      <!-- 持仓信息 (仅基金产品显示) -->
      <div v-if="product.type === 'fund' && holdingsData" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold text-gray-800">持仓信息</h3>
          <div class="flex items-center space-x-3">
            <span v-if="holdingsData.reportDate" class="text-xs text-gray-400">截止 {{ holdingsData.reportDate }}</span>
            <button
              @click="handleFetchHoldings"
              :disabled="fetchingHoldings"
              class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center space-x-1"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingHoldings }" />
              <span>{{ fetchingHoldings ? '刷新中...' : '刷新' }}</span>
            </button>
          </div>
        </div>
        <p v-if="holdingsData.dataSource" class="text-xs text-orange-500 mb-3">ℹ️ {{ holdingsData.dataSource }}</p>

        <!-- 净资产规模 -->
        <div v-if="holdingsData.assetAllocation?.netAsset" class="text-xs text-gray-500 mb-3">
          净资产规模：<span class="font-semibold text-gray-700">{{ holdingsData.assetAllocation.netAsset.toFixed(2) }} 亿元</span>
        </div>

        <!-- 两个饼图左右并排显示 -->
        <div class="flex flex-row">
          <!-- 资产配置饼图（左侧） -->
          <div class="w-1/2 min-w-0">
            <h4 class="text-sm font-medium text-gray-600 mb-2 text-center">资产配置</h4>
            <div ref="allocationChartRef" class="w-full" style="height: 220px;"></div>
          </div>
          <!-- 前十大重仓股饼图（右侧） -->
          <div v-if="holdingsData.stocks && holdingsData.stocks.length > 0" class="w-1/2 min-w-0">
            <h4 class="text-sm font-medium text-gray-600 mb-2 text-center">前十大重仓股</h4>
            <div ref="holdingsChartRef" class="w-full" style="height: 220px;"></div>
          </div>
        </div>
      </div>
      <div v-else-if="product.type === 'fund' && !holdingsData && !fetchingHoldings" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">持仓信息</h3>
          <button
            @click="handleFetchHoldings"
            :disabled="fetchingHoldings"
            class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center space-x-1"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': fetchingHoldings }" />
            <span>加载</span>
          </button>
        </div>
        <p class="text-sm text-gray-500 mt-2">点击加载查看基金持仓信息</p>
      </div>
      <div v-else-if="product.type === 'fund' && fetchingHoldings && !holdingsData" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">持仓信息</h3>
        <p class="text-sm text-gray-500">加载中...</p>
      </div>
      
      <!-- 净值走势 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col min-h-[300px] md:min-h-[400px]">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold text-gray-800">净值走势</h3>
          <div class="flex items-center space-x-1 bg-gray-100 rounded-lg p-0.5">
            <button
              v-for="opt in navRangeOptions"
              :key="opt.value"
              @click="navRange = opt.value"
              :class="[
                'px-2.5 py-1 text-xs rounded-md transition-colors',
                navRange === opt.value
                  ? 'bg-white text-gray-800 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
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
        <h3 class="text-lg font-semibold text-gray-800">历史交易</h3>
        <button 
          @click="handleAddTransaction"
          class="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          <span>新增交易</span>
        </button>
      </div>
      <!-- 日期区间选择 -->
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <Calendar class="w-4 h-4 text-gray-500 flex-shrink-0" />
        <div class="flex items-center space-x-1 glass-btn rounded-xl p-0.5">
          <button
            v-for="opt in txDateRangeOptions"
            :key="opt.value"
            @click="txDateRange = opt.value"
            :class="[
              'px-3 py-1 text-xs rounded-lg transition-all duration-300',
              txDateRange === opt.value
                ? 'bg-white/80 text-indigo-700 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            ]"
          >
            {{ opt.label }}
          </button>
        </div>
        <template v-if="txDateRange === 'custom'">
          <input
            v-model="txCustomStartDate"
            type="date"
            class="glass-input px-3 py-1 text-xs rounded-xl outline-none"
          />
          <span class="text-gray-400 text-xs">至</span>
          <input
            v-model="txCustomEndDate"
            type="date"
            class="glass-input px-3 py-1 text-xs rounded-xl outline-none"
          />
        </template>
        <span class="text-xs text-gray-500 ml-auto">共 {{ sortedTransactions.length }} 条记录</span>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-200">
            <tr>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" @click="handleTxSort('date')">
                <div class="flex items-center space-x-1"><span>日期</span><component :is="getTxSortIcon('date')" class="w-4 h-4" :class="txSortKey === 'date' ? 'text-primary-600' : ''" /></div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" @click="handleTxSort('type')">
                <div class="flex items-center space-x-1"><span>类型</span><component :is="getTxSortIcon('type')" class="w-4 h-4" :class="txSortKey === 'type' ? 'text-primary-600' : ''" /></div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" @click="handleTxSort('amount')">
                <div class="flex items-center space-x-1"><span>金额</span><component :is="getTxSortIcon('amount')" class="w-4 h-4" :class="txSortKey === 'amount' ? 'text-primary-600' : ''" /></div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" @click="handleTxSort('price')">
                <div class="flex items-center space-x-1"><span>单价/净值</span><component :is="getTxSortIcon('price')" class="w-4 h-4" :class="txSortKey === 'price' ? 'text-primary-600' : ''" /></div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" @click="handleTxSort('shares')">
                <div class="flex items-center space-x-1"><span>份额</span><component :is="getTxSortIcon('shares')" class="w-4 h-4" :class="txSortKey === 'shares' ? 'text-primary-600' : ''" /></div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" @click="handleTxSort('fee')">
                <div class="flex items-center space-x-1"><span>手续费</span><component :is="getTxSortIcon('fee')" class="w-4 h-4" :class="txSortKey === 'fee' ? 'text-primary-600' : ''" /></div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">备注</th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="transaction in sortedTransactions" :key="transaction.id" class="hover:bg-gray-50">
              <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-800">{{ formatDate(transaction.date) }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap">
                <span 
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-600': transaction.type === 'buy',
                    'bg-red-100 text-red-600': transaction.type === 'sell',
                    'bg-yellow-100 text-yellow-600': transaction.type === 'dividend',
                    'bg-blue-100 text-blue-600': transaction.type === 'nav_update'
                  }"
                >
                  {{ transaction.type === 'buy' ? '买入' : transaction.type === 'sell' ? '卖出' : transaction.type === 'dividend' ? '分红' : '净值更新' }}
                </span>
              </td>
              <td class="px-4 py-2.5 whitespace-nowrap text-sm" :class="transaction.type === 'buy' ? 'text-gray-800' : transaction.type === 'sell' ? 'text-profit' : 'text-yellow-600'">
                {{ transaction.type === 'buy' ? '-' : '+' }}{{ formatCurrency(transaction.amount) }}
              </td>
              <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-600">{{ transaction.price.toFixed(4) }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-600">{{ transaction.shares.toFixed(4) }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-600">{{ formatCurrency(transaction.fee) }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-600">{{ transaction.note || '-' }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap">
                <div class="flex items-center space-x-2">
                  <button 
                    @click="handleEditTransaction(transaction)"
                    class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Edit2 class="w-4 h-4" />
                  </button>
                  <button 
                    @click="handleDeleteTransaction(transaction.id)"
                    class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="transactions.length === 0" class="px-6 py-12 text-center">
          <p class="text-gray-500">暂无交易记录</p>
          <p class="text-gray-400 text-sm mt-2">点击上方按钮添加交易记录</p>
        </div>
        <div v-else-if="sortedTransactions.length === 0" class="px-6 py-12 text-center">
          <p class="text-gray-500">当前日期区间内无交易记录</p>
          <p class="text-gray-400 text-sm mt-2">试试切换为“全部”查看更多</p>
        </div>
      </div>
      </div>
    </div>
    
    <TransactionModal 
      :visible="showModal"
      :products="product ? [product] : []"
      :edit-transaction="editingTransaction"
      @close="showModal = false"
      @submit="handleSubmitTransaction"
    />
  </div>
</template>
