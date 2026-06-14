<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Plus, Edit2, Trash2, Search, ArrowUp, ArrowDown, ChevronsUpDown, RefreshCw } from 'lucide-vue-next'
import ProductModal from '@/components/ProductModal.vue'
import { useFinance } from '@/composables/useFinance'
import { useRouter } from 'vue-router'
import type { ProductType } from '@/types'
import { formatCurrency } from '@/utils/format'
import { fetchFundStageGainsBatch, fetchFundNav, fetchCmbNav, fetchCmbNavHistory, fetchAggregatedHoldings, type StageGains, type AggregatedHoldingsResult } from '@/utils/fundApi'

const props = defineProps<{
  type?: ProductType
}>()

const { products, addProduct, updateProduct, deleteProduct, calculatePosition, PRODUCT_TYPE_OPTIONS } = useFinance()
const router = useRouter()

const showModal = ref(false)
const editingProduct = ref<typeof products.value[0] | null>(null)
const searchQuery = ref('')
const filterType = ref<ProductType | 'all'>('all')

const sortKey = ref<'name' | 'marketValue' | 'annualRate' | 'profitRate' | 'profit' | 'holdingDays' | 'dailyReturn' | 'stageGains1m' | 'stageGains3m' | 'stageGainsYtd'>('marketValue')
const sortOrder = ref<'asc' | 'desc'>('desc')

// 阶段涨幅数据缓存
const stageGainsMap = ref<Map<string, StageGains>>(new Map())
const loadingStageGains = ref(false)

// 当日收益率数据缓存
const dailyReturnMap = ref<Map<string, { dailyReturn: number | null; date: string }>>(new Map())
const loadingDailyReturn = ref(false)

// 批量获取所有基金的阶段涨幅
const fetchAllStageGains = async () => {
  if (props.type !== 'fund') return
  
  const fundProducts = products.value.filter(p => p.type === 'fund' && p.code)
  if (fundProducts.length === 0) return
  
  // 找出未缓存的基金代码
  const uncachedCodes = fundProducts
    .map(p => p.code!)
    .filter(code => !stageGainsMap.value.has(code))
  
  if (uncachedCodes.length === 0) return
  
  loadingStageGains.value = true
  try {
    // 使用批量 API 一次获取所有未缓存数据
    const results = await fetchFundStageGainsBatch(uncachedCodes)
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

// ==================== 当日收益率缓存（localStorage）====================
const DAILY_RETURN_CACHE_TTL = 30 * 60 * 1000 // 30 分钟
const DAILY_RETURN_CACHE_PREFIX = 'daily_return_'

interface DailyReturnCache {
  dailyReturn: number | null
  date: string
  timestamp: number
}

// 从 localStorage 获取缓存
const getDailyReturnCache = (code: string): DailyReturnCache | null => {
  try {
    const key = `${DAILY_RETURN_CACHE_PREFIX}${code}`
    const cached = localStorage.getItem(key)
    if (!cached) return null
    
    const data: DailyReturnCache = JSON.parse(cached)
    // 检查是否过期
    if (Date.now() - data.timestamp > DAILY_RETURN_CACHE_TTL) {
      return null
    }
    return data
  } catch {
    return null
  }
}

// 保存到 localStorage
const setDailyReturnCache = (code: string, data: { dailyReturn: number | null; date: string }) => {
  try {
    const key = `${DAILY_RETURN_CACHE_PREFIX}${code}`
    const cacheData: DailyReturnCache = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(key, JSON.stringify(cacheData))
  } catch {
    // localStorage 可能满了，忽略
  }
}

// 批量获取所有产品的当日收益率
const fetchAllDailyReturns = async () => {
  const productList = products.value.filter(p => p.code)
  if (productList.length === 0) return

  loadingDailyReturn.value = true
  
  // 第一步：先加载所有缓存数据（立即显示）
  for (const p of productList) {
    if (!dailyReturnMap.value.has(p.code!)) {
      const cached = getDailyReturnCache(p.code!)
      if (cached) {
        dailyReturnMap.value.set(p.code!, {
          dailyReturn: cached.dailyReturn,
          date: cached.date
        })
      }
    }
  }
  
  // 第二步：后台更新过期的缓存
  const promises = productList.map(async (p) => {
    const cached = getDailyReturnCache(p.code!)
    // 如果有未过期的缓存，不需要重新获取
    if (cached) return
    
    try {
      let result: { dailyReturn: number | null; date: string } | null = null
      
      if (p.type === 'fund') {
        // 基金：从 pingzhongdata 获取当日收益率
        const navResult = await fetchFundNav(p.code!)
        result = {
          dailyReturn: navResult.dailyReturn ?? null,
          date: navResult.date
        }
      } else {
        // 固收理财：同时获取最新净值和历史净值来计算当日收益率
        const [latest, history] = await Promise.all([
          fetchCmbNav(p.code!).catch(() => null),
          fetchCmbNavHistory(p.code!, 3).catch(() => [])
        ])
        
        if (latest && latest.date && latest.nav) {
          const lastNav = latest.nav
          const lastDate = latest.date
          
          let prevNav: number | null = null
          if (history && history.length > 0) {
            const sortedHistory = [...history].sort((a, b) => 
              b.date.localeCompare(a.date)
            )
            const prevEntry = sortedHistory.find(h => h.date < lastDate)
            if (prevEntry) {
              prevNav = prevEntry.nav
            }
          }
          
          result = {
            dailyReturn: prevNav && prevNav > 0
              ? Math.round(((lastNav - prevNav) / prevNav) * 10000) / 100
              : null,
            date: lastDate
          }
        } else if (history && history.length >= 2) {
          const last = history[history.length - 1]
          const prev = history[history.length - 2]
          result = {
            dailyReturn: prev.nav > 0
              ? Math.round(((last.nav - prev.nav) / prev.nav) * 10000) / 100
              : null,
            date: last.date
          }
        } else if (history && history.length === 1) {
          result = {
            dailyReturn: null,
            date: history[0].date
          }
        }
      }
      
      if (result) {
        dailyReturnMap.value.set(p.code!, result)
        setDailyReturnCache(p.code!, result)
      }
    } catch (e) {
      console.error(`获取 ${p.name} 当日收益率失败:`, e)
    }
  })
  
  await Promise.all(promises)
  loadingDailyReturn.value = false
}

const getDailyReturn = (code: string | undefined): { dailyReturn: number | null; date: string } | undefined => {
  if (!code) return undefined
  return dailyReturnMap.value.get(code)
}

// ==================== 持仓汇总（懒加载 + 缓存）====================
const aggregatedHoldings = ref<AggregatedHoldingsResult | null>(null)
const loadingAggregatedHoldings = ref(false)
const showAggregatedHoldings = ref(false)
const aggregatedHoldingsFromCache = ref(false)

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
  if (props.type !== 'fund') return
  
  // 获取所有有 code 且有市值的基金
  const fundData = products.value
    .filter(p => p.type === 'fund' && p.code)
    .map(p => {
      const pos = calculatePosition(p)
      return { code: p.code!, marketValue: pos?.marketValue || 0 }
    })
    .filter(f => f.marketValue > 0)
  
  if (fundData.length === 0) return
  
  // 尝试读取缓存
  if (!force) {
    const cached = getAggregatedHoldingsCache()
    if (cached) {
      aggregatedHoldings.value = cached.data
      aggregatedHoldingsFromCache.value = true
      return
    }
  }
  
  loadingAggregatedHoldings.value = true
  try {
    const result = await fetchAggregatedHoldings(fundData)
    aggregatedHoldings.value = result
    aggregatedHoldingsFromCache.value = false
    setAggregatedHoldingsCache(result)
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

// ==================== 汇总统计 ====================
const summaryStats = computed(() => {
  const positions = filteredProducts.value
    .map(p => calculatePosition(p))
    .filter(Boolean)
  
  const totalMarketValue = positions.reduce((sum, p) => sum + (p!.marketValue || 0), 0)
  const totalCost = positions.reduce((sum, p) => sum + (p!.totalInvestment || 0), 0)
  const totalProfit = positions.reduce((sum, p) => sum + (p!.profit || 0), 0)
  const profitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
  
  return {
    count: filteredProducts.value.length,
    totalMarketValue,
    totalCost,
    totalProfit,
    profitRate
  }
})

const filteredProducts = computed(() => {
  let result = [...products.value]
  // 如果指定了类型过滤，只显示该类型
  if (props.type) {
    result = result.filter(p => p.type === props.type)
  } else if (filterType.value !== 'all') {
    result = result.filter(p => p.type === filterType.value)
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.note.toLowerCase().includes(query) ||
      (p.code && p.code.includes(query))
    )
  }
  result.sort((a, b) => {
    const posA = calculatePosition(a)
    const posB = calculatePosition(b)
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
      case 'dailyReturn':
        comparison = (getDailyReturn(a.code)?.dailyReturn ?? -999) - (getDailyReturn(b.code)?.dailyReturn ?? -999)
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
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.color : '#6b7280'
}

const getPosition = (productId: string) => {
  const product = products.value.find(p => p.id === productId)
  return product ? calculatePosition(product) : null
}

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

onMounted(() => {
  fetchAllStageGains()
  fetchAllDailyReturns()
  // 持仓汇总：页面加载时尝试读取 localStorage 缓存（不发API请求）
  if (props.type === 'fund') {
    const cached = getAggregatedHoldingsCache()
    if (cached) {
      aggregatedHoldings.value = cached.data
      aggregatedHoldingsFromCache.value = true
    }
  }
})

watch(() => products.value, () => {
  if (props.type === 'fund') {
    fetchAllStageGains()
  }
  fetchAllDailyReturns()
})

const handleSubmit = (data: { name: string; type: ProductType; note: string; code: string; holder: string }) => {
  if (editingProduct.value) {
    updateProduct(editingProduct.value.id, data.name, data.type, data.note, data.code, data.holder)
  } else {
    addProduct(data.name, data.type, data.note, data.code, data.holder)
  }
  showModal.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-white drop-shadow-sm">
          {{ props.type === 'fund' ? '基金列表' : props.type === 'fixed_income' ? '固收理财列表' : '产品列表' }}
        </h2>
        <p class="text-white/80 text-sm mt-1">共 {{ filteredProducts.length }} 个{{ props.type === 'fund' ? '基金' : props.type === 'fixed_income' ? '固收理财' : '理财产品' }}</p>
      </div>
      <button 
        @click="handleAdd"
        class="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5"
      >
        <Plus class="w-5 h-5" />
        <span>新增产品</span>
      </button>
    </div>

<!-- 汇总统计卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass-card rounded-2xl p-4 hover:bg-white/80 transition-all duration-300">
        <p class="text-xs text-gray-500 mb-1">总市值</p>
        <p class="text-xl font-bold text-gray-800">{{ formatCurrency(summaryStats.totalMarketValue) }}</p>
      </div>
      <div class="glass-card rounded-2xl p-4 hover:bg-white/80 transition-all duration-300">
        <p class="text-xs text-gray-500 mb-1">总成本</p>
        <p class="text-xl font-bold text-gray-800">{{ formatCurrency(summaryStats.totalCost) }}</p>
      </div>
      <div class="glass-card rounded-2xl p-4 hover:bg-white/80 transition-all duration-300">
        <p class="text-xs text-gray-500 mb-1">持仓收益</p>
        <p class="text-xl font-bold" :class="summaryStats.totalProfit >= 0 ? 'text-red-600' : 'text-green-600'">
          {{ summaryStats.totalProfit >= 0 ? '+' : '' }}{{ formatCurrency(summaryStats.totalProfit) }}
        </p>
      </div>
      <div class="glass-card rounded-2xl p-4 hover:bg-white/80 transition-all duration-300">
        <p class="text-xs text-gray-500 mb-1">持仓收益率</p>
        <p class="text-xl font-bold" :class="summaryStats.profitRate >= 0 ? 'text-red-600' : 'text-green-600'">
          {{ summaryStats.profitRate >= 0 ? '+' : '' }}{{ summaryStats.profitRate.toFixed(2) }}%
        </p>
      </div>
    </div>

    <!-- 持仓股票分布汇总（仅基金页面显示） -->
    <div v-if="props.type === 'fund'" class="glass-card rounded-2xl overflow-hidden hover:bg-white/80 transition-all duration-300">
      <div class="p-4 border-b border-gray-200/50 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">持仓股票分布</h3>
          <p class="text-xs text-gray-500 mt-1">
            汇总所有基金的持仓，按持有金额加权计算（只统计每只基金的前十大持仓）
            <span v-if="aggregatedHoldings"> · 共 {{ aggregatedHoldings.fundCount }} 只基金，{{ aggregatedHoldings.stocks.length }} 只股票</span>
            <span v-if="aggregatedHoldingsFromCache" class="text-amber-600"> · 缓存数据</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="showAggregatedHoldings && aggregatedHoldings"
            @click="fetchAllAggregatedHoldings(true)"
            :disabled="loadingAggregatedHoldings"
            class="text-sm text-gray-500 hover:text-primary-600 disabled:opacity-50"
            title="刷新数据"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loadingAggregatedHoldings }" />
          </button>
          <button
            @click="toggleAggregatedHoldings"
            class="text-sm text-indigo-600 hover:text-indigo-700"
          >
            {{ showAggregatedHoldings ? '收起' : '展开' }}
          </button>
        </div>
      </div>
      
      <div v-if="loadingAggregatedHoldings" class="p-8 text-center">
        <p class="text-gray-500">加载中...</p>
      </div>
      
      <div v-else-if="showAggregatedHoldings && aggregatedHoldings && aggregatedHoldings.stocks.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-200">
            <tr>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600">股票名称</th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600">股票代码</th>
              <th class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600">持仓金额</th>
              <th class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600">占比</th>
              <th class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600">持有基金</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(stock, idx) in aggregatedHoldings.stocks" :key="stock.code" class="hover:bg-gray-50">
              <td class="px-4 py-2.5 whitespace-nowrap">
                <div class="flex items-center">
                  <span class="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs flex items-center justify-center mr-2">{{ idx + 1 }}</span>
                  <span class="font-medium text-gray-800">{{ stock.name }}</span>
                </div>
              </td>
              <td class="px-4 py-2.5 whitespace-nowrap text-gray-600">{{ stock.code }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap text-right font-medium text-gray-800">{{ formatCurrency(stock.totalValue) }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap text-right">
                <span class="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                  {{ stock.ratio.toFixed(2) }}%
                </span>
              </td>
              <td class="px-4 py-2.5 whitespace-nowrap">
                <div class="flex flex-wrap gap-1">
                  <span 
                    v-for="fund in stock.funds.slice(0, 3)" 
                    :key="fund.fundCode"
                    class="inline-block px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
                  >
                    {{ fund.fundCode }} ({{ fund.ratio.toFixed(1) }}%)
                  </span>
                  <span v-if="stock.funds.length > 3" class="text-xs text-gray-400">
                    +{{ stock.funds.length - 3 }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div v-else-if="showAggregatedHoldings && aggregatedHoldings && aggregatedHoldings.stocks.length === 0" class="p-8 text-center">
        <p class="text-gray-500">暂无持仓数据</p>
      </div>
      
      <div v-else-if="!showAggregatedHoldings && aggregatedHoldings" class="p-4">
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="(stock, idx) in aggregatedHoldings.stocks.slice(0, 10)" 
            :key="stock.code"
            class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200"
          >
            <span class="text-xs text-gray-500 mr-1">{{ idx + 1 }}.</span>
            <span class="text-sm font-medium text-gray-800">{{ stock.name }}</span>
            <span class="text-xs text-gray-500 ml-2">{{ stock.ratio.toFixed(1) }}%</span>
          </span>
          <span v-if="aggregatedHoldings.stocks.length > 10" class="text-sm text-gray-400 self-center">
            +{{ aggregatedHoldings.stocks.length - 10 }} 更多
          </span>
        </div>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row gap-4">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="搜索产品名称或备注..."
          class="glass-input w-full pl-10 pr-4 py-2 rounded-xl outline-none"
        />
      </div>
      <select 
        v-if="!props.type"
        v-model="filterType"
        class="glass-input px-4 py-2 rounded-xl outline-none"
      >
        <option value="all">全部类型</option>
        <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    
    <div class="glass-card rounded-2xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-200">
            <tr>
              <th 
                class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('name')"
              >
                <div class="flex items-center space-x-1">
                  <span>产品</span>
                  <ChevronsUpDown v-if="sortKey !== 'name'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th v-if="props.type !== 'fund'" class="px-4 py-2 whitespace-nowrap text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">持有人</th>
              <th 
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('marketValue')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>市值</span>
                  <ChevronsUpDown v-if="sortKey !== 'marketValue'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('profitRate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>持仓收益率</span>
                  <ChevronsUpDown v-if="sortKey !== 'profitRate'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('profit')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>持仓收益</span>
                  <ChevronsUpDown v-if="sortKey !== 'profit'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('holdingDays')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>持有天数</span>
                  <ChevronsUpDown v-if="sortKey !== 'holdingDays'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                v-if="props.type !== 'fund'"
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('annualRate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>年化</span>
                  <ChevronsUpDown v-if="sortKey !== 'annualRate'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <!-- 基金类型特有列：阶段涨幅 -->
              <th 
                v-if="props.type === 'fund'"
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('stageGains1m')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近1月</span>
                  <ChevronsUpDown v-if="sortKey !== 'stageGains1m'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                v-if="props.type === 'fund'"
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('stageGains3m')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近3月</span>
                  <ChevronsUpDown v-if="sortKey !== 'stageGains3m'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                v-if="props.type === 'fund'"
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('stageGainsYtd')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>今年来</span>
                  <ChevronsUpDown v-if="sortKey !== 'stageGainsYtd'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200/80 transition-colors select-none"
                @click="handleSort('dailyReturn')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>当日收益</span>
                  <ChevronsUpDown v-if="sortKey !== 'dailyReturn'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th class="px-4 py-2 whitespace-nowrap text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr 
              v-for="product in filteredProducts" 
              :key="product.id" 
              class="hover:bg-gray-50 cursor-pointer"
              @click="router.push({ name: 'product-detail', params: { id: product.id } })"
            >
              <td class="px-4 py-2.5 whitespace-nowrap">
                <div class="flex items-center space-x-3">
                  <div 
                    class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold flex-shrink-0"
                    :style="{ backgroundColor: getProductTypeColor(product.type) }"
                  >
                    {{ product.name.charAt(0) }}
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-gray-800 truncate">{{ product.name }}</h3>
                    <div class="flex items-center space-x-2 mt-0.5">
                      <span 
                        class="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        :style="{ backgroundColor: getProductTypeColor(product.type) + '20', color: getProductTypeColor(product.type) }"
                      >
                        {{ getProductTypeLabel(product.type) }}
                      </span>
                      <span v-if="product.code" class="text-xs font-mono text-gray-500">代码: {{ product.code }}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td v-if="props.type !== 'fund'" class="px-4 py-2.5 whitespace-nowrap">
                <p class="text-gray-600">{{ product.holder || '-' }}</p>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p class="font-semibold text-gray-800">{{ Math.round((getPosition(product.id) as any).marketValue).toLocaleString() }} 元</p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p 
                    class="font-semibold"
                    :class="(getPosition(product.id) as any).profitRate >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getPosition(product.id) as any).profitRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).profitRate.toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p 
                    class="font-semibold"
                    :class="(getPosition(product.id) as any).profit >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getPosition(product.id) as any).profit >= 0 ? '+' : '' }}{{ formatCurrency((getPosition(product.id) as any).profit) }}
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p class="font-semibold text-gray-800">{{ (getPosition(product.id) as any).holdingDays }} 天</p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td v-if="props.type !== 'fund'" class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p 
                    class="font-semibold"
                    :class="(getPosition(product.id) as any).annualRate >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getPosition(product.id) as any).annualRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).annualRate.toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <!-- 基金类型特有列：阶段涨幅 -->
              <td v-if="props.type === 'fund'" class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getStageGains(product.code)">
                  <p 
                    class="font-semibold"
                    :class="(getStageGains(product.code)?.['1m'] || 0) >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getStageGains(product.code)?.['1m'] || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.['1m'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">{{ loadingStageGains ? '...' : '-' }}</p>
                </template>
              </td>
              <td v-if="props.type === 'fund'" class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getStageGains(product.code)">
                  <p 
                    class="font-semibold"
                    :class="(getStageGains(product.code)?.['3m'] || 0) >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getStageGains(product.code)?.['3m'] || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.['3m'] || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">{{ loadingStageGains ? '...' : '-' }}</p>
                </template>
              </td>
              <td v-if="props.type === 'fund'" class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getStageGains(product.code)">
                  <p 
                    class="font-semibold"
                    :class="(getStageGains(product.code)?.ytd || 0) >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getStageGains(product.code)?.ytd || 0) >= 0 ? '+' : '' }}{{ (getStageGains(product.code)?.ytd || 0).toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">{{ loadingStageGains ? '...' : '-' }}</p>
                </template>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="getDailyReturn(product.code)">
                  <p 
                    class="font-semibold text-sm"
                    :class="(getDailyReturn(product.code)?.dailyReturn ?? 0) >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getDailyReturn(product.code)?.dailyReturn ?? 0) >= 0 ? '+' : '' }}{{ (getDailyReturn(product.code)?.dailyReturn ?? 0).toFixed(2) }}%
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ getDailyReturn(product.code)?.date || '' }}</p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">{{ loadingDailyReturn ? '...' : '-' }}</p>
                </template>
              </td>
              <td class="px-4 py-2.5 text-center whitespace-nowrap" @click.stop>
                <div class="flex items-center justify-center space-x-2">
                  <button 
                    @click="handleEdit(product)"
                    class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Edit2 class="w-4 h-4" />
                  </button>
                  <button 
                    @click="handleDelete(product.id)"
                    class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filteredProducts.length === 0" class="p-8 text-center">
        <p class="text-gray-600">暂无{{ props.type === 'fund' ? '基金' : props.type === 'fixed_income' ? '固收理财' : '产品' }}数据</p>
        <p class="text-gray-500 text-sm mt-2">点击上方按钮添加{{ props.type === 'fund' ? '基金' : props.type === 'fixed_income' ? '固收理财' : '理财产品' }}</p>
      </div>
    </div>
    
    <ProductModal 
      :visible="showModal"
      :edit-product="editingProduct"
      :default-type="props.type"
      @close="showModal = false"
      @submit="handleSubmit"
    />
  </div>
</template>
