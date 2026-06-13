<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Wallet, TrendingUp, PieChart, RefreshCw } from 'lucide-vue-next'
import { getAutoUpdateEnabled } from '@/utils/storage'
import StatCard from '@/components/StatCard.vue'
import ProductCard from '@/components/ProductCard.vue'
import { useFinance, PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'
import { calculateXIRR } from '@/utils/xirr'
import { formatCurrency, formatCurrencyInt, formatPercent, getDateOnly } from '@/utils/format'
import { fetchFundNav, fetchCmbNav } from '@/utils/fundApi'
import * as echarts from 'echarts'

const { portfolioSummary, calculatePosition, getProfitHistory, products, transactions, getTransactionsByProductId, addTransaction, refresh } = useFinance()

const typeChartRefs = ref<Record<string, HTMLDivElement>>({})
const trendChartRefs = ref<Record<string, HTMLDivElement>>({})
const typeCharts = new Map<string, echarts.ECharts>()
const trendCharts = new Map<string, echarts.ECharts>()

// 按产品类型分组的持仓
const positionsByType = computed(() => {
  const positions = portfolioSummary.value.positions
  const map = new Map<string, typeof positions>()
  for (const pos of positions) {
    const type = pos.product.type
    if (!map.has(type)) map.set(type, [])
    map.get(type)!.push(pos)
  }
  // 只返回有持仓的类型，按 PRODUCT_TYPE_OPTIONS 顺序
  return PRODUCT_TYPE_OPTIONS
    .filter(opt => map.has(opt.value))
    .map(opt => ({ type: opt.value, label: opt.label, color: opt.color, positions: map.get(opt.value)! }))
})

// 按产品类型分组的统计汇总
const summaryByType = computed(() => {
  return positionsByType.value.map(group => {
    const totalAssets = group.positions.reduce((sum, p) => sum + p.marketValue, 0)
    const totalInvestment = group.positions.reduce((sum, p) => sum + p.totalInvestment, 0)
    const totalProfit = group.positions.reduce((sum, p) => sum + p.profit, 0)
    const totalProfitRate = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0
    
    // 使用 XIRR 计算该类型所有产品的综合年化收益率
    const productIds = new Set(group.positions.map(p => p.product.id))
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
    const annualRate = calculateXIRR(buyTxs, sellTxs, dividendTxs, totalAssets) * 100
    
    return {
      ...group,
      totalAssets,
      totalInvestment,
      totalProfit,
      totalProfitRate,
      annualRate
    }
  })
})

const updatingNavs = ref(false)
const updateStatus = ref('')

const trendRangeOptions = [
  { label: '近1月', value: '1m', days: 30 },
  { label: '近3月', value: '3m', days: 90 },
  { label: '近6月', value: '6m', days: 180 },
  { label: '近1年', value: '1y', days: 365 },
  { label: '全部', value: 'all', days: 0 }
]
const trendRanges = ref<Record<string, string>>({})

const autoUpdateNavs = async () => {
  const todayTimestamp = getDateOnly(Date.now())
  
  const pendingProducts = products.value.filter(p => {
    if (!p.code) return false
    const txs = getTransactionsByProductId(p.id)
    return !txs.some(t => t.type === 'nav_update' && getDateOnly(t.date) === todayTimestamp)
  })
  
  if (pendingProducts.length === 0) return
  
  updatingNavs.value = true
  updateStatus.value = `正在更新 ${pendingProducts.length} 个产品净值...`
  
  for (const product of pendingProducts) {
    try {
      updateStatus.value = `正在获取 ${product.name}...`
      let result
      if (product.type === 'fund') {
        result = await fetchFundNav(product.code)
      } else {
        result = await fetchCmbNav(product.code)
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
      
      const sourceLabel = product.type === 'fund' ? '天天基金' : '招银理财'
      const updateTime = new Date().toLocaleString('zh-CN')
      const navNote = `${sourceLabel}自动查询 - ${updateTime}`
      
      const txs = getTransactionsByProductId(product.id)
      if (!txs.some(t => t.type === 'nav_update' && getDateOnly(t.date) === dateTimestamp)) {
        addTransaction(
          product.id,
          'nav_update',
          dateTimestamp,
          0,
          result.nav,
          0,
          0,
          navNote
        )
      }
    } catch (e) {
      console.error(`自动更新 ${product.name} 净值失败:`, e)
    }
  }
  
  updateStatus.value = ''
  updatingNavs.value = false
}

const initCharts = () => {
  // 初始化各类型的资产分布柱形图
  for (const group of positionsByType.value) {
    const el = typeChartRefs.value[group.type]
    if (el) {
      const chart = echarts.init(el)
      typeCharts.set(group.type, chart)
      updateTypeBarChart(group.type, group.label, group.color, group.positions)
    }
  }
  // 初始化各类型的收益趋势图
  for (const group of positionsByType.value) {
    const el = trendChartRefs.value[group.type]
    if (el) {
      const chart = echarts.init(el)
      trendCharts.set(group.type, chart)
      updateTypeTrendChart(group.type, group.label, group.color, group.positions)
    }
  }
}

const setChartRef = (type: string) => (el: any) => {
  if (el) typeChartRefs.value[type] = el as HTMLDivElement
}

const setTrendChartRef = (type: string) => (el: any) => {
  if (el) trendChartRefs.value[type] = el as HTMLDivElement
}

// 产品颜色调色板（分布图与收益趋势图共用，同一产品颜色一致）
const PRODUCT_COLORS = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4']

// 根据产品列表生成 产品名→颜色 的映射
const buildProductColorMap = (positions: typeof portfolioSummary.value.positions): Map<string, string> => {
  const map = new Map<string, string>()
  let idx = 0
  for (const pos of positions) {
    if (!map.has(pos.product.name)) {
      map.set(pos.product.name, PRODUCT_COLORS[idx % PRODUCT_COLORS.length])
      idx++
    }
  }
  return map
}

const updateTypeBarChart = (type: string, _typeLabel: string, _color: string, positions: typeof portfolioSummary.value.positions) => {
  const chart = typeCharts.get(type)
  if (!chart) return

  // 过滤掉持仓金额小于200元的产品
  const filtered = positions.filter(p => p.marketValue >= 200)
  const colorMap = buildProductColorMap(filtered)
  const typeTotal = filtered.reduce((sum, p) => sum + p.marketValue, 0)
  const data = filtered
    .map((p) => ({ name: p.product.name, value: p.marketValue, color: colorMap.get(p.product.name)! }))
    .sort((a, b) => a.value - b.value) // 升序排列，金额最大的显示在最上方

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0]
        const pct = typeTotal > 0 ? ((item.value / typeTotal) * 100).toFixed(1) : '0'
        return `${item.name}<br/>市值: ${item.value.toLocaleString()}元<br/>占比: ${pct}%`
      }
    },
    grid: {
      left: 10,
      right: 70,
      top: 10,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => {
          if (value >= 10000) return (value / 10000).toFixed(1) + '万'
          return value.toString()
        },
        fontSize: 10
      }
    },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: {
        fontSize: 11,
        width: 80,
        overflow: 'truncate'
      }
    },
    series: [{
      type: 'bar',
      data: data.map(d => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
      barMaxWidth: 28,
      label: {
        show: true,
        position: 'right',
        formatter: (params: any) => {
          const pct = typeTotal > 0 ? ((params.value / typeTotal) * 100).toFixed(1) : '0'
          return `${formatCurrencyInt(params.value)}元 (${pct}%)`
        },
        fontSize: 11,
        fontWeight: 'bold',
        color: '#374151'
      }
    }]
  })
}

const updateTypeTrendChart = (type: string, _typeLabel: string, _color: string, positions: typeof portfolioSummary.value.positions) => {
  const chart = trendCharts.get(type)
  if (!chart) return

  const rangeValue = trendRanges.value[type] || '1m'
  const opt = trendRangeOptions.find(o => o.value === rangeValue)
  const days = opt ? opt.days : 30
  const history = days > 0 ? getProfitHistory(days) : getProfitHistory(3650)
  const dates = history.map(h => {
      const parts = h.date.split('-')
      return `${parts[0].substring(2)}/${parts[1]}/${parts[2]}`
    })

  // 过滤掉持仓金额小于200元的产品
  const filteredPositions = positions.filter(p => p.marketValue >= 200)
  const productNames: string[] = []
  for (const pos of filteredPositions) {
    if (!productNames.includes(pos.product.name)) {
      productNames.push(pos.product.name)
    }
  }

  const colorMap = buildProductColorMap(filteredPositions)

  const series = productNames.map((name) => {
    const productColor = colorMap.get(name) || PRODUCT_COLORS[0]
    return {
      name,
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' },
      itemStyle: { color: productColor },
      data: history.map(h => {
        const pp = h.productProfits.find(p => p.productName === name)
        return pp ? pp.profit : 0
      })
    }
  })

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let result = params[0].name + '<br/>'
        let total = 0
        for (const item of params) {
          if (item.value !== 0) {
            result += `${item.marker} ${item.seriesName}: ${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}元<br/>`
            total += item.value
          }
        }
        result += `合计: ${total >= 0 ? '+' : ''}${total.toFixed(2)}元`
        return result
      }
    },
    legend: {
      data: productNames,
      orient: 'horizontal',
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { fontSize: 10 },
      show: productNames.length > 1
    },
    grid: {
      left: 5,
      right: 10,
      bottom: productNames.length > 1 ? 65 : 40,
      top: 5,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { rotate: 40, fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => {
          if (Math.abs(value) >= 10000) return (value / 10000).toFixed(1) + '万'
          return value.toString()
        }
      }
    },
    series
  })
}

const updateAllTrendCharts = () => {
  for (const group of positionsByType.value) {
    updateTypeTrendChart(group.type, group.label, group.color, group.positions)
  }
}

watch(trendRanges, () => {
  updateAllTrendCharts()
}, { deep: true })

const handleResize = () => {
  for (const chart of typeCharts.values()) chart.resize()
  for (const chart of trendCharts.values()) chart.resize()
}

onMounted(async () => {
  await refresh()
  await nextTick()
  initCharts()
  window.addEventListener('resize', handleResize)
  if (getAutoUpdateEnabled()) {
    autoUpdateNavs()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  for (const chart of typeCharts.values()) chart.dispose()
  for (const chart of trendCharts.values()) chart.dispose()
  typeCharts.clear()
  trendCharts.clear()
})
</script>

<template>
  <div class="space-y-6">
    <!-- 按产品类型分组的统计卡片 -->
    <div v-for="group in summaryByType" :key="group.type + '-stats'" class="space-y-3">
      <div class="flex items-center space-x-2">
        <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: group.color }"></span>
        <h3 class="text-base font-semibold text-gray-700">{{ group.label }}</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="总资产" 
          :value="formatCurrencyInt(group.totalAssets)" 
          :icon="Wallet" 
          color="blue"
        />
        <StatCard 
          title="累计投入" 
          :value="formatCurrency(group.totalInvestment)" 
          :icon="RefreshCw" 
          color="yellow"
        />
        <StatCard 
          title="总盈亏" 
          :value="formatCurrency(group.totalProfit)" 
          :change="group.totalProfitRate"
          :icon="TrendingUp" 
          :color="group.totalProfit >= 0 ? 'green' : 'red'"
        />
        <StatCard 
          title="年化收益率" 
          :value="formatPercent(group.annualRate)" 
          :change="group.annualRate"
          :icon="PieChart" 
          :color="group.annualRate >= 0 ? 'green' : 'red'"
        />
      </div>
    </div>
    
    <div v-if="updatingNavs" class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center space-x-3">
      <RefreshCw class="w-5 h-5 text-blue-600 animate-spin" />
      <span class="text-sm text-blue-700">{{ updateStatus }}</span>
    </div>
    
    <!-- 资产分布图 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div v-for="group in positionsByType" :key="group.type + '-dist'" class="bg-white rounded-xl shadow-sm border border-gray-100 pt-5 px-5 pb-3">
        <div class="flex items-center mb-4">
          <span class="w-3 h-3 rounded-full mr-2" :style="{ backgroundColor: group.color }"></span>
          <h3 class="text-lg font-semibold text-gray-800">{{ group.label }}分布</h3>
          <span class="ml-auto text-sm text-gray-500">
            合计 {{ formatCurrencyInt(group.positions.reduce((s, p) => s + p.marketValue, 0)) }}元
          </span>
        </div>
        <div :ref="setChartRef(group.type)" class="h-56 md:h-64"></div>
      </div>
    </div>

    <!-- 收益趋势图 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div v-for="group in positionsByType" :key="group.type + '-trend'" class="bg-white rounded-xl shadow-sm border border-gray-100 pt-5 px-5 pb-3">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center">
            <span class="w-3 h-3 rounded-full mr-2" :style="{ backgroundColor: group.color }"></span>
            <h3 class="text-lg font-semibold text-gray-800">{{ group.label }}收益趋势</h3>
          </div>
          <div class="flex items-center space-x-1 bg-gray-100 rounded-lg p-0.5">
            <button
              v-for="opt in trendRangeOptions"
              :key="opt.value"
              @click="trendRanges[group.type] = opt.value"
              :class="[
                'px-2.5 py-1 text-xs rounded-md transition-colors',
                (trendRanges[group.type] || '1m') === opt.value
                  ? 'bg-white text-gray-800 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div :ref="setTrendChartRef(group.type)" class="h-72 md:h-80"></div>
      </div>
    </div>
    
    <div>
      <h3 class="text-lg font-semibold text-gray-800 mb-4">持仓明细</h3>
      <div v-if="portfolioSummary.positions.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ProductCard 
          v-for="position in portfolioSummary.positions" 
          :key="position.productId" 
          :position="position" 
        />
      </div>
      <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <p class="text-gray-500">暂无持仓数据</p>
        <p class="text-gray-400 text-sm mt-2">请先添加理财产品和交易记录</p>
      </div>
    </div>
  </div>
</template>
