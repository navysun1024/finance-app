<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import ProfitCalendar from '@/components/ProfitCalendar.vue'
import PullRefresh from '@/components/PullRefresh.vue'
import { useFinance, PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'
import { calculateXIRR } from '@/utils/xirr'
import { formatCurrency, formatCurrencyInt, formatCurrency1 } from '@/utils/format'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const refreshRef = ref<InstanceType<typeof PullRefresh> | null>(null)

const { portfolioSummary, getProfitHistory, getMarketValueHistory, getTransactionsByProductId, transactions, refresh, dashboardSettings, equitySettings, fixedIncomeSettings, saveDisplaySettings } = useFinance()

const typeChartRefs = ref<Record<string, HTMLDivElement>>({})
const mvChartRefs = ref<Record<string, HTMLDivElement>>({})
const typeCharts = new Map<string, echarts.ECharts>()
const mvCharts = new Map<string, echarts.ECharts>()
let initTimer: ReturnType<typeof setTimeout> | null = null

// 按产品类型分组的持仓
const positionsByType = computed(() => {
  const positions = portfolioSummary.value.positions
  const map = new Map<string, typeof positions>()
  for (const pos of positions) {
    // 兼容旧数据：将 'fund' 类型视为 'equity'
    const type = pos.product.type === 'fund' ? 'equity' : pos.product.type
    if (!map.has(type)) map.set(type, [])
    map.get(type)!.push(pos)
  }
  // 只返回有持仓的类型，按 PRODUCT_TYPE_OPTIONS 顺序
  return PRODUCT_TYPE_OPTIONS
    .filter(opt => map.has(opt.value))
    .map(opt => ({ type: opt.value, label: opt.label, color: opt.color, positions: map.get(opt.value)! }))
})

// 用于图表的分组（排除定期存款）
const chartGroups = computed(() => positionsByType.value.filter(g => g.type !== 'term_deposit'))

// 按产品类型分组的统计汇总
// 每个产品代码的当日涨跌幅（与 Products.vue 口径一致）
const dailyReturnMap = computed(() => {
  const map = new Map<string, { dailyReturn: number | null }>()
  const positions = portfolioSummary.value.positions
  for (const pos of positions) {
    const product = pos.product
    if (!product.code) continue
    const navUpdates = getTransactionsByProductId(product.id)
      .filter(t => t.type === 'nav_update')
      .sort((a, b) => b.date - a.date)
    if (navUpdates.length < 2) continue
    const latest = navUpdates[0]
    const prev = navUpdates[1]
    const dailyReturn = prev.price > 0
      ? Math.round(((latest.price - prev.price) / prev.price) * 10000) / 100
      : null
    map.set(product.code, { dailyReturn })
  }
  return map
})

// 单只持仓的当日收益（与 Products.vue getDailyProfit 口径一致）
const calcDailyProfitForPosition = (pos: typeof portfolioSummary.value.positions[number]): number => {
  const product = pos.product
  if (!pos.marketValue) return 0

  // 定存：当日收益 = 本金 × 年利率 / 365（到期后0）
  if (product.type === 'term_deposit') {
    if (product.maturityDate) {
      const maturityTime = new Date(product.maturityDate).getTime()
      if (Date.now() > maturityTime) return 0
    }
    const annualRate = (product.interestRate || 0) / 100
    const principal = pos.totalInvestment || product.minAmount || 0
    return principal * annualRate / 365
  }

  const daily = dailyReturnMap.value.get(product.code || '')
  if (!daily || daily.dailyReturn === null) return 0
  return pos.marketValue * daily.dailyReturn / 100
}

const summaryByType = computed(() => {
  return positionsByType.value.map(group => {
    const totalAssets = group.positions.reduce((sum, p) => sum + p.marketValue, 0)
    const totalInvestment = group.positions.reduce((sum, p) => sum + p.totalInvestment, 0)
    const totalProfit = group.positions.reduce((sum, p) => sum + p.profit, 0)
    const totalDailyProfit = group.positions.reduce((sum, p) => sum + calcDailyProfitForPosition(p), 0)
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
      totalDailyProfit,
      totalProfitRate,
      annualRate
    }
  })
})

// 日历收益数据缓存（按类型懒加载，包含各产品明细）
interface CalendarDayData {
  date: string
  profit: number
  productProfits: { productName: string; profit: number }[]
}
const calendarDataCache = ref<Record<string, CalendarDayData[]>>({})
const calendarDataLoaded = ref<Record<string, boolean>>({})

// 全局缓存：按天数分级的原始收益历史数据
const rawHistoryCache = new Map<number, ReturnType<typeof getProfitHistory>>()

// 获取指定天数的收益历史（带缓存，相同天数只算一次）
const getRawHistory = (days: number) => {
  if (!rawHistoryCache.has(days)) {
    rawHistoryCache.set(days, getProfitHistory(days))
  }
  return rawHistoryCache.get(days)!
}

// 从历史数据中按类型过滤出日历数据
const buildCalendarData = (history: ReturnType<typeof getProfitHistory>, type: string): CalendarDayData[] => {
  const typeProductIds = new Set(
    portfolioSummary.value.positions
      .filter(p => (p.product.type === 'fund' ? 'equity' : p.product.type) === type)
      .map(p => p.product.id)
  )
  return history.map(h => {
    const filteredProfits = h.productProfits.filter(pp => typeProductIds.has(pp.productId))
    const typeProfit = filteredProfits.reduce((sum, pp) => sum + pp.profit, 0)
    return {
      date: h.date,
      profit: Math.round(typeProfit * 100) / 100,
      productProfits: filteredProfits
        .filter(pp => Math.abs(pp.profit) > 0.01)
        .map(pp => ({ productName: pp.productName, profit: Math.round(pp.profit * 100) / 100 }))
    }
  })
}

// 快速加载某类型的日历数据（仅近1年，秒级完成）
const loadCalendarData = (type: string) => {
  if (calendarDataLoaded.value[type]) return
  const history = getRawHistory(365)
  calendarDataCache.value[type] = buildCalendarData(history, type)
  calendarDataLoaded.value[type] = true
}

// 异步扩展到全量数据（后台计算，完成后替换缓存）
const expandCalendarToFull = () => {
  // 使用 requestIdleCallback 在浏览器空闲时执行，避免阻塞主线程
  const run = () => {
    const fullHistory = getRawHistory(3650)
    for (const group of chartGroups.value) {
      if (calendarDataLoaded.value[group.type]) {
        calendarDataCache.value[group.type] = buildCalendarData(fullHistory, group.type)
      }
    }
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 500)
  }
}

const initCharts = () => {
  // 初始化各类型的资产分布柱形图（排除定期存款）
  for (const group of chartGroups.value) {
    const el = typeChartRefs.value[group.type]
    if (el) {
      const chart = echarts.init(el)
      typeCharts.set(group.type, chart)
      updateTypeBarChart(group.type, group.label, group.color, group.positions)
    }
  }
  // 初始化各类型的市值趋势图（排除定期存款）
  for (const group of chartGroups.value) {
    const el = mvChartRefs.value[group.type]
    if (el) {
      const chart = echarts.init(el)
      mvCharts.set(group.type, chart)
      updateMvChart(group.type, group.label, group.color, group.positions)
    }
  }
}

const setChartRef = (type: string) => (el: any) => {
  if (el) typeChartRefs.value[type] = el as HTMLDivElement
}

const setMvChartRef = (type: string) => (el: any) => {
  if (el) mvChartRefs.value[type] = el as HTMLDivElement
}

// 判断是否为移动端（屏幕宽度 < 640px）
const isMobile = () => window.innerWidth < 640

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

  const mobile = isMobile()

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
      left: mobile ? 8 : 10,
      right: mobile ? 50 : 70,
      top: mobile ? 5 : 10,
      bottom: mobile ? 8 : 10,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => {
          if (value >= 10000) return (value / 10000).toFixed(1) + '万'
          return value.toString()
        },
        fontSize: mobile ? 9 : 10
      }
    },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: {
        fontSize: mobile ? 10 : 11,
        width: mobile ? 60 : 80,
        overflow: 'truncate'
      }
    },
    series: [{
      type: 'bar',
      data: data.map(d => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
      barMaxWidth: mobile ? 20 : 28,
      barCategoryGap: mobile ? '40%' : '20%',
      itemStyle: {
        borderRadius: [0, 6, 6, 0]
      },
      label: {
        show: true,
        position: 'right',
        formatter: (params: any) => {
          if (mobile) {
            return `${formatCurrencyInt(params.value)}`
          }
          const pct = typeTotal > 0 ? ((params.value / typeTotal) * 100).toFixed(1) : '0'
          return `${formatCurrencyInt(params.value)}元 (${pct}%)`
        },
        fontSize: mobile ? 9 : 11,
        fontWeight: 'bold',
        color: '#374151'
      }
    }]
  })
}

// 累积市值趋势图（按月聚合的堆叠柱形图）
const mvHistoryCache = new Map<string, ReturnType<typeof getMarketValueHistory>>()
const getMvHistory = (days: number) => {
  const key = String(days)
  if (!mvHistoryCache.has(key)) {
    mvHistoryCache.set(key, getMarketValueHistory(days))
  }
  return mvHistoryCache.get(key)!
}

const updateMvChart = (type: string, _typeLabel: string, _color: string, positions: typeof portfolioSummary.value.positions) => {
  const chart = mvCharts.get(type)
  if (!chart) return

  const history = getMvHistory(365) // 近1年

  // 按月聚合
  const monthlyMap = new Map<string, Map<string, number>>() // month -> productName -> totalMarketValue
  const monthDays = new Map<string, number>() // month -> 天数（用于计算月末市值）

  for (const day of history) {
    const month = day.date.substring(0, 7) // YYYY-MM
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, new Map())
      monthDays.set(month, 0)
    }
    monthDays.set(month, (monthDays.get(month) || 0) + 1)

    // 只取该月最后一天作为月末市值
    const prodMap = monthlyMap.get(month)!
    for (const mv of day.marketValues) {
      prodMap.set(mv.productName, mv.marketValue) // 后续会覆盖，最终为月末最后一天的值
    }
  }

  // 过滤掉持仓金额小于200元的产品
  const filteredPositions = positions.filter(p => p.marketValue >= 200)
  const productNames: string[] = []
  for (const pos of filteredPositions) {
    if (!productNames.includes(pos.product.name)) {
      productNames.push(pos.product.name)
    }
  }

  const colorMap = buildProductColorMap(filteredPositions)
  const months = Array.from(monthlyMap.keys()).sort()
  const monthLabels = months.map(m => {
    const [y, mo] = m.split('-')
    return `${y.substring(2)}/${mo}`
  })

  const series = productNames.map((name, index) => {
    const productColor = colorMap.get(name) || PRODUCT_COLORS[0]
    const isLastSeries = index === productNames.length - 1
    return {
      name,
      type: 'bar' as const,
      stack: 'total',
      emphasis: { focus: 'series' as const },
      itemStyle: { color: productColor },
      data: months.map(month => {
        const prodMap = monthlyMap.get(month)
        const value = prodMap?.get(name) || 0
        if (isLastSeries) {
          return { value, itemStyle: { borderRadius: [4, 4, 0, 0] } }
        }
        return value
      })
    }
  })

  const mobile = isMobile()

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let result = params[0].name + '<br/>'
        let total = 0
        for (const item of params) {
          if (item.value > 0) {
            result += `${item.marker} ${item.seriesName}: ${formatCurrency(item.value)}<br/>`
            total += item.value
          }
        }
        result += `<b>合计: ${formatCurrency(total)}</b>`
        return result
      }
    },
    legend: {
      data: productNames,
      orient: 'horizontal',
      bottom: 0,
      left: 'center',
      itemWidth: 6,
      itemHeight: 6,
      textStyle: { fontSize: mobile ? 8 : 10 },
      formatter: (name: string) => name.length > 6 ? name.substring(0, 6) + '…' : name,
      show: productNames.length > 1
    },
    grid: {
      left: mobile ? 3 : 5,
      right: mobile ? 5 : 10,
      bottom: productNames.length > 1 ? (mobile ? 80 : 65) : (mobile ? 40 : 40),
      top: mobile ? 3 : 5,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: monthLabels,
      axisLabel: { rotate: 0, fontSize: mobile ? 9 : 11 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: mobile ? 9 : 10,
        formatter: (value: number) => {
          if (Math.abs(value) >= 10000) return (value / 10000).toFixed(1) + '万'
          return value.toString()
        }
      }
    },
    series
  })
}

// 根据产品类型获取对应的显示设置
const getSettingsByType = (type: string) => {
  if (type === 'equity') return equitySettings
  if (type === 'fixed_income') return fixedIncomeSettings
  return dashboardSettings
}

// 判断指定类型的收益是否显示
const getShowProfitStatus = (type: string) => {
  const settings = getSettingsByType(type)
  return settings.value.showProfitAmount && settings.value.showProfitRate && settings.value.showMarketValue && settings.value.showCost
}

// 切换指定类型的收益显示/隐藏
const toggleShowProfit = (type: string) => {
  const settings = getSettingsByType(type)
  const current = settings.value.showProfitAmount && settings.value.showProfitRate && settings.value.showMarketValue && settings.value.showCost
  settings.value.showProfitAmount = !current
  settings.value.showProfitRate = !current
  settings.value.showMarketValue = !current
  settings.value.showCost = !current
  saveDisplaySettings()
}

const handleRefresh = async () => {
  await refresh()
  await nextTick()
  // 重新初始化图表
  for (const chart of typeCharts.values()) chart.dispose()
  for (const chart of mvCharts.values()) chart.dispose()
  typeCharts.clear()
  mvCharts.clear()
  initCharts()
  // 通知刷新完成
  refreshRef.value?.onRefreshComplete()
}

const handleResize = () => {
  for (const chart of typeCharts.values()) chart.resize()
  for (const chart of mvCharts.values()) chart.resize()
}

onMounted(async () => {
  await refresh()
  await nextTick()
  // 先初始化图表（轻量操作），日历数据延后到空闲时计算，避免阻塞主线程影响页面切换
  initTimer = setTimeout(() => {
    initCharts()
    // 使用 requestIdleCallback 在浏览器空闲时异步加载日历数据
    const loadCalendarAsync = () => {
      const types = chartGroups.value.map(g => g.type)
      let idx = 0
      const loadNext = () => {
        if (idx >= types.length) {
          expandCalendarToFull()
          return
        }
        loadCalendarData(types[idx])
        idx++
        // 每加载一个类型后让出主线程，确保页面响应
        setTimeout(loadNext, 0)
      }
      loadNext()
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadCalendarAsync, { timeout: 3000 })
    } else {
      setTimeout(loadCalendarAsync, 2000)
    }
  }, 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (initTimer) clearTimeout(initTimer)
  window.removeEventListener('resize', handleResize)
  for (const chart of typeCharts.values()) chart.dispose()
  for (const chart of mvCharts.values()) chart.dispose()
  typeCharts.clear()
  mvCharts.clear()
  // 清除所有原始收益历史缓存，释放内存
  rawHistoryCache.clear()
})
</script>

<template>
  <PullRefresh ref="refreshRef" @refresh="handleRefresh">
    <div class="space-y-8">
      <!-- 按产品类型分组的统计卡片 -->
    <div v-for="group in summaryByType" :key="group.type + '-stats'" class="space-y-3">
      <div class="flex items-center space-x-2.5">
        <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: group.color }"></span>
        <h3 class="text-[20px] font-semibold text-apple-text tracking-tight">{{ group.label }}</h3>
        <button
          @click="toggleShowProfit(group.type)"
          class="ml-2 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          :title="getShowProfitStatus(group.type) ? '点击隐藏收益' : '点击显示收益'"
        >
          <Eye v-if="getShowProfitStatus(group.type)" class="w-4 h-4 text-apple-secondary" />
          <EyeOff v-else class="w-4 h-4 text-apple-secondary" />
        </button>
      </div>
      <!-- 移动端：两行合并卡片（第一行：总市值；第二行：4项指标同一行，与产品页一致） -->
      <div class="glass-card md:hidden">
        <!-- 第一行：总市值 -->
        <div class="mb-2.5">
          <p class="text-[12px] text-apple-secondary uppercase font-medium">总市值</p>
          <p class="text-[24px] font-semibold text-apple-text tracking-tight leading-tight">
            {{ getSettingsByType(group.type).value.showMarketValue ? formatCurrency1(group.totalAssets) : '****' }}
          </p>
        </div>
        <!-- 第二行：4 项指标同一行（持仓收益 / 总收益率 / 年化收益率 / 今日收益，与产品页完全一致） -->
        <div class="grid grid-cols-4 gap-x-2 border-t border-black/5 pt-2.5">
          <div class="min-w-0">
            <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">持仓收益</p>
            <p
              class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate"
              :class="getSettingsByType(group.type).value.showProfitAmount ? (group.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
            >
              {{ getSettingsByType(group.type).value.showProfitAmount ? (group.totalProfit >= 0 ? '+' : '') + formatCurrency1(group.totalProfit) : '****' }}
            </p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">总收益率</p>
            <p
              class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate"
              :class="getSettingsByType(group.type).value.showProfitRate ? (group.totalProfitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
            >
              {{ getSettingsByType(group.type).value.showProfitRate ? (group.totalProfitRate >= 0 ? '+' : '') + group.totalProfitRate.toFixed(2) + '%' : '****' }}
            </p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">年化收益率</p>
            <p
              class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate"
              :class="getSettingsByType(group.type).value.showProfitRate ? (group.annualRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
            >
              {{ getSettingsByType(group.type).value.showProfitRate ? (group.annualRate >= 0 ? '+' : '') + group.annualRate.toFixed(2) + '%' : '****' }}
            </p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-[13px] text-apple-secondary uppercase font-medium leading-tight">今日收益</p>
            <p
              class="text-[15px] font-semibold tracking-tight leading-tight mt-0.5 truncate"
              :class="getSettingsByType(group.type).value.showProfitAmount ? (group.totalDailyProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
            >
              {{ getSettingsByType(group.type).value.showProfitAmount ? (group.totalDailyProfit >= 0 ? '+' : '') + formatCurrency1(group.totalDailyProfit) : '****' }}
            </p>
          </div>
        </div>
      </div>
      <!-- PC 端：4 列卡片（年化收益率在最后，与产品页一致） -->
      <div class="hidden md:grid grid-cols-4 gap-3">
        <div class="glass-card p-4">
          <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">总市值</p>
          <p class="text-[22px] font-semibold text-apple-text tracking-tight">{{ getSettingsByType(group.type).value.showMarketValue ? formatCurrency1(group.totalAssets) : '****' }}</p>
        </div>
        <div class="glass-card p-4">
          <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益</p>
          <div class="flex items-end justify-between">
            <p class="text-[22px] font-semibold tracking-tight" :class="getSettingsByType(group.type).value.showProfitAmount ? (group.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
              {{ getSettingsByType(group.type).value.showProfitAmount ? (group.totalProfit >= 0 ? '+' : '') + formatCurrency1(group.totalProfit) : '****' }}
            </p>
            <p v-if="getSettingsByType(group.type).value.showProfitAmount" class="text-[12px] ml-2 whitespace-nowrap" :class="group.totalDailyProfit >= 0 ? 'text-profit' : 'text-loss'">
              {{ group.totalDailyProfit >= 0 ? '+' : '' }}{{ formatCurrency1(group.totalDailyProfit) }} 今日
            </p>
          </div>
        </div>
        <div class="glass-card p-4">
          <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益率</p>
          <p class="text-[22px] font-semibold tracking-tight" :class="getSettingsByType(group.type).value.showProfitRate ? (group.totalProfitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ getSettingsByType(group.type).value.showProfitRate ? (group.totalProfitRate >= 0 ? '+' : '') + group.totalProfitRate.toFixed(2) + '%' : '****' }}
          </p>
        </div>
        <div class="glass-card p-4">
          <p class="text-[12px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">年化收益率</p>
          <p class="text-[22px] font-semibold tracking-tight" :class="getSettingsByType(group.type).value.showProfitRate ? (group.annualRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
            {{ getSettingsByType(group.type).value.showProfitRate ? (group.annualRate >= 0 ? '+' : '') + group.annualRate.toFixed(2) + '%' : '****' }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- 收益日历 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
      <div v-for="group in chartGroups" :key="group.type + '-calendar'" class="glass-card md:p-5">
        <div class="flex items-center mb-1 md:mb-2">
          <span class="w-2.5 h-2.5 rounded-full mr-2" :style="{ backgroundColor: group.color }"></span>
          <h3 class="text-[15px] font-semibold text-apple-text">{{ group.label }}收益日历</h3>
        </div>
        <div class="h-48 md:h-[210px] px-2 pb-2">
          <div v-if="!calendarDataLoaded[group.type]" class="flex items-center justify-center h-full">
            <span class="text-apple-secondary text-[13px]">加载中...</span>
          </div>
          <ProfitCalendar 
            v-else
            :profit-data="calendarDataCache[group.type] || []" 
            :product-type="group.type"
          />
        </div>
      </div>
    </div>

    <!-- 资产分布图 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
      <div v-for="group in chartGroups" :key="group.type + '-dist'" class="glass-card md:p-5">
        <div class="flex items-center mb-3 md:mb-4">
          <span class="w-2.5 h-2.5 rounded-full mr-2" :style="{ backgroundColor: group.color }"></span>
          <h3 class="text-[15px] font-semibold text-apple-text">{{ group.label }}分布</h3>
          <span class="ml-auto text-[12px] text-apple-secondary font-medium">
            合计 {{ formatCurrency1(group.positions.reduce((s, p) => s + p.marketValue, 0)) }}
          </span>
        </div>
        <div :ref="setChartRef(group.type)" class="h-44 md:h-56"></div>
      </div>
    </div>
    
    <!-- 累积市值趋势图 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
      <div v-for="group in chartGroups" :key="group.type + '-mv'" class="glass-card md:p-5">
        <div class="flex items-center mb-3 md:mb-4">
          <span class="w-2.5 h-2.5 rounded-full mr-2" :style="{ backgroundColor: group.color }"></span>
          <h3 class="text-[15px] font-semibold text-apple-text">{{ group.label }}市值趋势</h3>
          <span class="ml-auto text-[12px] text-apple-secondary font-medium">
            近12个月
          </span>
        </div>
        <div :ref="setMvChartRef(group.type)" class="h-44 md:h-56"></div>
      </div>
    </div>


    </div>
  </PullRefresh>
</template>
