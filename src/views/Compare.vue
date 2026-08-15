<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Search, X, ArrowUp, ArrowDown, ChevronsUpDown, Scale, TrendingUp, TrendingDown } from 'lucide-vue-next'
import { useFinance, initFinance } from '@/composables/useFinance'
import { useCompare } from '@/composables/useCompare'
import { formatPercent, getDateOnly } from '@/utils/format'
import type { Product } from '@/types'
import * as echarts from 'echarts'

const { products, transactions } = useFinance()
const { compareType, compareIds, toggleCompare, removeFromCompare, switchType, MAX_COMPARE } = useCompare()

// ==================== 类型与产品选择 ====================
const selectedType = compareType
const selectedProductIds = compareIds

const availableProducts = computed(() => {
  return products.value.filter(p => {
    if (selectedType.value === 'equity') {
      return p.type === 'equity' || p.type === 'fund'
    }
    return p.type === 'fixed_income'
  })
})

const searchQuery = ref('')
const showDropdown = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const STOCK_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4'
]

const filteredAvailableProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return availableProducts.value
  return availableProducts.value.filter(p =>
    p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)
  )
})

const selectedProducts = computed(() =>
  selectedProductIds.value
    .map(id => products.value.find(p => p.id === id))
    .filter(Boolean) as Product[]
)

const getProductColor = (productId: string) => {
  const idx = selectedProductIds.value.indexOf(productId)
  return STOCK_COLORS[idx % STOCK_COLORS.length]
}

const toggleProduct = (productId: string) => {
  toggleCompare(productId, selectedType.value)
}

const removeProduct = (productId: string) => {
  removeFromCompare(productId)
}

const handleSwitchType = (type: 'equity' | 'fixed_income') => {
  switchType(type)
}

// 点击外部关闭下拉
const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}

// ==================== 区间选择 ====================
type RangeType = '1m' | '3m' | '1y' | '3y' | 'all' | 'custom'
const rangeType = ref<RangeType>('1y')
const customStart = ref('')
const customEnd = ref('')

const rangeOptions = [
  { value: '1m', label: '近1月', days: 30 },
  { value: '3m', label: '近3月', days: 90 },
  { value: '1y', label: '近1年', days: 365 },
  { value: '3y', label: '近3年', days: 1095 },
  { value: 'all', label: '全部', days: 0 },
  { value: 'custom', label: '自定义', days: 0 }
] as const

const dateBounds = computed<{ start: number; end: number } | null>(() => {
  if (rangeType.value === 'all') return null
  if (rangeType.value === 'custom') {
    const start = customStart.value ? new Date(customStart.value + 'T00:00:00').getTime() : 0
    const end = customEnd.value ? new Date(customEnd.value + 'T23:59:59').getTime() : Date.now()
    return { start, end }
  }
  const opt = rangeOptions.find(o => o.value === rangeType.value)
  if (!opt || opt.days === 0) return null
  // 取 cutoff 当天 00:00，与产品详情页逻辑一致（包含当天数据）
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - opt.days)
  cutoff.setHours(0, 0, 0, 0)
  return { start: cutoff.getTime(), end: Date.now() }
})

// ==================== 净值数据提取与收益率计算 ====================
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

// 获取产品全部净值记录（用于收益率计算）
function getAllNavSeries(productId: string): NavPoint[] {
  return transactions.value
    .filter(t => t.productId === productId && t.type === 'nav_update')
    .map(t => ({ date: getDateOnly(t.date), nav: t.price }))
    .sort((a, b) => a.date - b.date)
}

// 获取区间内的净值记录（用于图表展示）
function getProductNavSeries(productId: string, bounds: { start: number; end: number } | null): NavPoint[] {
  return getAllNavSeries(productId).filter(p => !bounds || (p.date >= bounds.start && p.date <= bounds.end))
}

// 收益率计算：终点 = 最新净值，起点 = cutoff 之前最近净值
// 返回实际收益率（累计）和年化收益率
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

// 成立天数
function getInceptionDays(allNavSeries: NavPoint[]): number {
  if (allNavSeries.length < 2) return 0
  return Math.floor((allNavSeries[allNavSeries.length - 1].date - allNavSeries[0].date) / DAY_MS)
}

const compareData = computed<CompareItem[]>(() => {
  const now = Date.now()
  return selectedProductIds.value.map(id => {
    const product = products.value.find(p => p.id === id)
    if (!product) return null
    const color = getProductColor(id)
    const allNavSeries = getAllNavSeries(id)
    const navSeries = getProductNavSeries(id, dateBounds.value)
    return {
      product,
      color,
      navSeries,
      r1m: calcRangeReturn(allNavSeries, now - 30 * DAY_MS),
      r3m: calcRangeReturn(allNavSeries, now - 90 * DAY_MS),
      r6m: calcRangeReturn(allNavSeries, now - 180 * DAY_MS),
      r1y: calcRangeReturn(allNavSeries, now - 365 * DAY_MS),
      rInception: calcRangeReturn(allNavSeries, null),
      inceptionDays: getInceptionDays(allNavSeries),
      hasData: navSeries.length >= 2
    }
  }).filter(Boolean) as CompareItem[]
})

// 根据产品类型返回对应收益率：权益类显示实际收益率，固收类显示年化收益率
const isEquityType = computed(() => selectedType.value === 'equity')
const getReturnValue = (range: RangeReturn): number | null => {
  return isEquityType.value ? range.totalReturn : range.annualReturn
}

// ==================== 表格排序 ====================
type SortKey = 'name' | 'r1m' | 'r3m' | 'r6m' | 'r1y' | 'rInception' | 'inceptionDays'
const sortKey = ref<SortKey>('r1y')
const sortOrder = ref<'asc' | 'desc'>('desc')

const getSortValue = (item: CompareItem, key: SortKey): number | string => {
  if (key === 'name') return item.product.name
  if (key === 'inceptionDays') return item.inceptionDays
  const range = (item as any)[key] as RangeReturn | undefined
  if (!range) return -Infinity
  return (isEquityType.value ? range.totalReturn : range.annualReturn) ?? -Infinity
}

const sortedCompareData = computed(() => {
  const list = [...compareData.value]
  list.sort((a, b) => {
    const aVal = getSortValue(a, sortKey.value)
    const bVal = getSortValue(b, sortKey.value)
    if (sortKey.value === 'name') {
      return sortOrder.value === 'asc'
        ? (aVal as string).localeCompare(bVal as string, 'zh-CN')
        : (bVal as string).localeCompare(aVal as string, 'zh-CN')
    }
    return sortOrder.value === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })
  return list
})

const handleSort = (key: SortKey) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
}

const getSortIcon = (key: SortKey) => {
  if (sortKey.value !== key) return ChevronsUpDown
  return sortOrder.value === 'asc' ? ArrowUp : ArrowDown
}

// ==================== ECharts 净值曲线 ====================
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
// dataZoom 可见范围（用于动态归一化）
let zoomStartValue: number | null = null
let zoomEndValue: number | null = null

const initChart = () => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  // 监听 dataZoom 拖拽，以可见区间起点重新归一化
  chart.on('datazoom', () => {
    const opt = chart?.getOption() as any
    const dz = opt?.dataZoom?.[0]
    if (dz) {
      zoomStartValue = dz.startValue ?? null
      zoomEndValue = dz.endValue ?? null
      updateChart()
    }
  })
  updateChart()
}

const updateChart = () => {
  if (!chart) return
  const items = compareData.value.filter(item => item.hasData)

  if (items.length === 0) {
    chart.clear()
    return
  }

  // 收集所有日期并集
  const allDatesSet = new Set<number>()
  for (const item of items) {
    for (const point of item.navSeries) {
      allDatesSet.add(point.date)
    }
  }
  const sortedDates = Array.from(allDatesSet).sort((a, b) => a - b)

  // 为每个产品构建归一化数据（前向填充缺失日期）
  const series = items.map(item => {
    const navMap = new Map<number, number>()
    for (const point of item.navSeries) {
      navMap.set(point.date, point.nav)
    }
    // 归一化基准：有 zoom 范围时用范围内第一条净值，否则用区间内第一条
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
        // 前向填充
        const normalized = (lastNav / firstNav) * 100
        data.push({ value: [date, parseFloat(normalized.toFixed(4))], originalNav: lastNav })
      }
      // lastNav === null 时跳过（该产品在此日期之前还没有数据）
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

  // Y 轴范围：只计算可见区间内的 min/max
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

  chart.setOption({
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

const handleResize = () => {
  chart?.resize()
}

// ==================== 生命周期 ====================
onMounted(async () => {
  await initFinance()
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', handleClickOutside)
  // 若已有对比产品（从产品列表页加入），初始化图表
  if (selectedProductIds.value.length > 0) {
    await nextTick()
    initChart()
  }
})

watch([selectedProductIds, rangeType, customStart, customEnd], async () => {
  await nextTick()
  // 区间或产品变更时重置 dataZoom 归一化范围
  zoomStartValue = null
  zoomEndValue = null
  // 无选中产品时，清理图表实例（容器 div 会被 v-else 移除）
  if (selectedProductIds.value.length === 0) {
    if (chart) {
      chart.dispose()
      chart = null
    }
    return
  }
  // 有选中产品：容器已渲染，确保 chart 已初始化再更新
  if (!chart && chartRef.value) {
    initChart()
  } else if (chart) {
    updateChart()
  }
}, { deep: true })

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleClickOutside)
  chart?.dispose()
  chart = null
})

// ==================== 辅助方法 ====================
const getReturnClass = (value: number | null) => {
  if (value === null) return 'text-apple-secondary'
  return value >= 0 ? 'text-profit' : 'text-loss'
}

const formatReturn = (value: number | null) => {
  if (value === null) return '数据不足'
  return formatPercent(value)
}

const getProductTypeLabel = (type: string) => {
  if (type === 'fund') return '基金'
  if (type === 'equity') return '权益'
  return '固收'
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center space-x-3">
      <div class="w-9 h-9 rounded-xl bg-apple-text flex items-center justify-center">
        <Scale class="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 class="text-xl font-semibold text-apple-text">产品对比</h2>
        <p class="text-sm text-apple-secondary">对比多只产品的区间收益率与净值走势</p>
      </div>
    </div>

    <!-- 顶部控制栏 -->
    <div class="glass-card p-4 md:p-5 space-y-4 relative z-30">
      <!-- 类型切换 -->
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs text-apple-secondary">类型:</span>
        <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
          <button
            v-for="t in [{ value: 'equity', label: '权益' }, { value: 'fixed_income', label: '固收' }]"
            :key="t.value"
            @click="handleSwitchType(t.value as 'equity' | 'fixed_income')"
            :class="[
              'px-3.5 py-1.5 text-xs rounded-full transition-all duration-200',
              selectedType === t.value
                ? 'bg-white text-apple-text shadow-sm font-medium'
                : 'text-apple-secondary hover:text-apple-text'
            ]"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- 产品多选 -->
      <div ref="dropdownRef" class="relative">
        <!-- 已选产品标签 -->
        <div v-if="selectedProducts.length > 0" class="flex flex-wrap gap-2 mb-3">
          <span
            v-for="product in selectedProducts"
            :key="product.id"
            class="inline-flex items-center space-x-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium"
            :style="{ backgroundColor: getProductColor(product.id) + '15', color: getProductColor(product.id) }"
          >
            <span
              class="inline-block w-2 h-2 rounded-full"
              :style="{ backgroundColor: getProductColor(product.id) }"
            ></span>
            <span>{{ product.name }}</span>
            <button
              @click="removeProduct(product.id)"
              class="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
            >
              <X class="w-3 h-3" />
            </button>
          </span>
        </div>

        <!-- 搜索输入框 -->
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-secondary pointer-events-none" />
          <input
            v-model="searchQuery"
            @focus="showDropdown = true"
            type="text"
            :placeholder="`搜索并选择${selectedType === 'equity' ? '权益' : '固收'}产品 (最多 ${MAX_COMPARE} 个)`"
            class="w-full pl-9 pr-3 py-2 text-sm bg-black/5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/30 transition-all"
          />
        </div>

        <!-- 下拉产品列表 -->
        <div
          v-if="showDropdown"
          class="absolute z-20 left-0 right-0 mt-1 bg-white/95 backdrop-blur-xl border border-black/8 rounded-2xl shadow-apple-xl overflow-hidden max-h-72 overflow-y-auto"
        >
          <div v-if="filteredAvailableProducts.length === 0" class="px-4 py-6 text-center text-sm text-apple-secondary">
            {{ availableProducts.length === 0 ? '暂无可选产品' : '未找到匹配产品' }}
          </div>
          <div v-else>
            <button
              v-for="product in filteredAvailableProducts"
              :key="product.id"
              @click="toggleProduct(product.id)"
              :class="[
                'w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-black/5',
                selectedProductIds.includes(product.id) ? 'bg-primary-50/50' : ''
              ]"
            >
              <div class="flex items-center space-x-2.5 min-w-0">
                <div
                  class="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  :class="selectedProductIds.includes(product.id) ? '' : 'border border-apple-border'"
                  :style="selectedProductIds.includes(product.id) ? { backgroundColor: getProductColor(product.id) } : {}"
                >
                  <svg v-if="selectedProductIds.includes(product.id)" class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="min-w-0">
                  <p class="text-sm text-apple-text truncate">{{ product.name }}</p>
                  <p class="text-xs text-apple-secondary">
                    {{ getProductTypeLabel(product.type) }}
                    <span v-if="product.code"> · {{ product.code }}</span>
                  </p>
                </div>
              </div>
              <span class="text-xs text-apple-secondary flex-shrink-0 ml-2">
                {{ selectedProductIds.includes(product.id) ? '已选' : '选择' }}
              </span>
            </button>
          </div>
          <div v-if="selectedProductIds.length >= MAX_COMPARE" class="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-600 text-center">
            已达最大对比数量 {{ MAX_COMPARE }} 个
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="selectedProductIds.length === 0" class="glass-card p-12 text-center">
      <Scale class="w-12 h-12 text-apple-secondary/30 mx-auto mb-3" />
      <p class="text-apple-text text-base font-medium">未选择对比产品</p>
      <p class="text-apple-secondary text-sm mt-2">请在上方搜索并选择至少 2 个产品进行对比</p>
    </div>

    <template v-else>
      <!-- 模块1：区间收益率对比表格 -->
      <div class="glass-card overflow-hidden">
        <div class="px-5 py-4 border-b border-apple-border/30">
          <h3 class="text-lg font-semibold text-apple-text">区间收益率对比</h3>
          <p class="text-xs text-apple-secondary mt-0.5">
            {{ isEquityType ? '实际收益率（非年化）' : '年化收益率' }} · 各区间与成立天数
          </p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full apple-table">
            <thead>
              <tr>
                <th class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('name')">
                  <div class="flex items-center space-x-1"><span>产品</span><component :is="getSortIcon('name')" class="w-4 h-4" :class="sortKey === 'name' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('r1m')">
                  <div class="flex items-center justify-end space-x-1"><span>近1月</span><component :is="getSortIcon('r1m')" class="w-4 h-4" :class="sortKey === 'r1m' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('r3m')">
                  <div class="flex items-center justify-end space-x-1"><span>近3月</span><component :is="getSortIcon('r3m')" class="w-4 h-4" :class="sortKey === 'r3m' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('r6m')">
                  <div class="flex items-center justify-end space-x-1"><span>近6月</span><component :is="getSortIcon('r6m')" class="w-4 h-4" :class="sortKey === 'r6m' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('r1y')">
                  <div class="flex items-center justify-end space-x-1"><span>近1年</span><component :is="getSortIcon('r1y')" class="w-4 h-4" :class="sortKey === 'r1y' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('rInception')">
                  <div class="flex items-center justify-end space-x-1"><span>成立以来</span><component :is="getSortIcon('rInception')" class="w-4 h-4" :class="sortKey === 'rInception' ? 'text-primary-500' : ''" /></div>
                </th>
                <th class="px-4 py-2.5 whitespace-nowrap text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer select-none" @click="handleSort('inceptionDays')">
                  <div class="flex items-center justify-end space-x-1"><span>成立天数</span><component :is="getSortIcon('inceptionDays')" class="w-4 h-4" :class="sortKey === 'inceptionDays' ? 'text-primary-500' : ''" /></div>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-apple-border/50">
              <tr v-for="item in sortedCompareData" :key="item.product.id">
                <td class="px-4 py-3 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: item.color }"></span>
                    <div class="min-w-0">
                      <p class="text-sm text-apple-text font-medium truncate">{{ item.product.name }}</p>
                      <p class="text-xs text-apple-secondary">{{ getProductTypeLabel(item.product.type) }}<span v-if="item.product.code"> · {{ item.product.code }}</span></p>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold" :class="getReturnClass(getReturnValue(item.r1m))">
                  {{ formatReturn(getReturnValue(item.r1m)) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold" :class="getReturnClass(getReturnValue(item.r3m))">
                  {{ formatReturn(getReturnValue(item.r3m)) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold" :class="getReturnClass(getReturnValue(item.r6m))">
                  {{ formatReturn(getReturnValue(item.r6m)) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold" :class="getReturnClass(getReturnValue(item.r1y))">
                  {{ formatReturn(getReturnValue(item.r1y)) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold" :class="getReturnClass(getReturnValue(item.rInception))">
                  {{ formatReturn(getReturnValue(item.rInception)) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right text-apple-secondary">
                  {{ item.inceptionDays > 0 ? item.inceptionDays + ' 天' : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 模块2：净值曲线对比图 -->
      <div class="glass-card p-4 md:p-5">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-lg font-semibold text-apple-text">净值走势对比</h3>
            <p class="text-xs text-apple-secondary mt-0.5">归一化起点 = 100，支持滚轮缩放与拖动平移</p>
          </div>
          <div class="flex items-center space-x-1 text-xs text-apple-secondary">
            <component :is="compareData.length > 0 && (getReturnValue(compareData[0].r1y) ?? 0) >= 0 ? TrendingUp : TrendingDown" class="w-4 h-4" />
            <span>{{ compareData.filter(d => d.hasData).length }} 只产品</span>
          </div>
        </div>
        <div ref="chartRef" class="w-full" style="height: 420px;"></div>
        <div v-if="compareData.filter(d => d.hasData).length === 0" class="text-center py-12">
          <p class="text-apple-secondary text-sm">所选产品在当前区间内净值数据不足</p>
          <p class="text-apple-secondary text-xs mt-2 opacity-70">请尝试切换区间或在产品详情页补全历史净值</p>
        </div>
        <!-- 区间选择器 -->
        <div class="flex items-center flex-wrap gap-2 mt-4 pt-4 border-t border-apple-border/30">
          <span class="text-xs text-apple-secondary">区间:</span>
          <div class="flex items-center space-x-1 bg-black/5 rounded-full p-0.5">
            <button
              v-for="opt in rangeOptions"
              :key="opt.value"
              @click="rangeType = opt.value"
              :class="[
                'px-2.5 py-1 text-xs rounded-full transition-all duration-200',
                rangeType === opt.value
                  ? 'bg-white text-apple-text shadow-sm font-medium'
                  : 'text-apple-secondary hover:text-apple-text'
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
          <template v-if="rangeType === 'custom'">
            <input
              v-model="customStart"
              type="date"
              class="glass-input px-3 py-1 text-xs rounded-full outline-none"
            />
            <span class="text-apple-secondary text-xs">至</span>
            <input
              v-model="customEnd"
              type="date"
              class="glass-input px-3 py-1 text-xs rounded-full outline-none"
            />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
