<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { Wallet, TrendingUp, PieChart, RefreshCw } from 'lucide-vue-next'
import { getAutoUpdateEnabled } from '@/utils/storage'
import StatCard from '@/components/StatCard.vue'
import ProductCard from '@/components/ProductCard.vue'
import { useFinance, PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'
import { formatCurrency, formatCurrencyInt, formatPercent, getDateOnly } from '@/utils/format'
import { fetchFundNav, fetchCmbNav } from '@/utils/fundApi'
import * as echarts from 'echarts'

const { portfolioSummary, getProfitHistory, products, getTransactionsByProductId, addTransaction, refresh } = useFinance()

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

const updatingNavs = ref(false)
const updateStatus = ref('')

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
      const navNote = result.date
        ? `${sourceLabel}自动查询 - 净值日期 ${result.date}`
        : `${sourceLabel}自动查询`
      
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

  const colorMap = buildProductColorMap(positions)
  const typeTotal = positions.reduce((sum, p) => sum + p.marketValue, 0)
  const data = positions
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

  const history = getProfitHistory(30)
  const dates = history.map(h => h.date)

  // 只保留该类型下的产品
  const productNames: string[] = []
  for (const pos of positions) {
    if (!productNames.includes(pos.product.name)) {
      productNames.push(pos.product.name)
    }
  }

  const colorMap = buildProductColorMap(positions)

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
      orient: 'vertical',
      right: 0,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { fontSize: 9, width: 96, overflow: 'truncate' },
      show: productNames.length > 1
    },
    grid: {
      left: 5,
      right: productNames.length > 1 ? 120 : 10,
      bottom: 40,
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
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard 
        title="总资产" 
        :value="formatCurrencyInt(portfolioSummary.totalAssets)" 
        :icon="Wallet" 
        color="blue"
      />
      <StatCard 
        title="累计投入" 
        :value="formatCurrency(portfolioSummary.totalInvestment)" 
        :icon="RefreshCw" 
        color="yellow"
      />
      <StatCard 
        title="总盈亏" 
        :value="formatCurrency(portfolioSummary.totalProfit)" 
        :change="portfolioSummary.totalProfitRate"
        :icon="TrendingUp" 
        :color="portfolioSummary.totalProfit >= 0 ? 'green' : 'red'"
      />
      <StatCard 
        title="年化收益率" 
        :value="formatPercent(portfolioSummary.totalAnnualRate)" 
        :change="portfolioSummary.totalAnnualRate"
        :icon="PieChart" 
        :color="portfolioSummary.totalAnnualRate >= 0 ? 'green' : 'red'"
      />
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
        <div class="flex items-center mb-4">
          <span class="w-3 h-3 rounded-full mr-2" :style="{ backgroundColor: group.color }"></span>
          <h3 class="text-lg font-semibold text-gray-800">{{ group.label }}收益趋势 (近30天)</h3>
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
