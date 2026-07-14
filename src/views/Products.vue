<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown, RefreshCw, Eye, EyeOff } from 'lucide-vue-next'
import ProductModal from '@/components/ProductModal.vue'
import ProductListItem from '@/components/ProductListItem.vue'
import { useFinance } from '@/composables/useFinance'
import { useRouter, useRoute } from 'vue-router'
import type { ProductType, ProductStatus } from '@/types'
import { PRODUCT_STATUS_OPTIONS, DCA_CYCLE_OPTIONS } from '@/types'
import { formatCurrency, formatCurrency1 } from '@/utils/format'
import { calculateXIRR } from '@/utils/xirr'
import { fetchEquityStageGainsBatch, fetchAggregatedHoldings, fetchCmbNavBatch, fetchEquityNav, type StageGains, type AggregatedHoldingsResult } from '@/utils/equityApi'

const props = defineProps<{
  type?: ProductType
}>()

const { products, addProduct, updateProduct, deleteProduct, calculatePosition, getTransactionsByProductId, PRODUCT_TYPE_OPTIONS, transactions, addTransaction, equitySettings, fixedIncomeSettings, saveDisplaySettings } = useFinance()

// 根据当前页面类型选择对应的显示设置
const pageSettings = computed(() => {
  return props.type === 'equity' ? equitySettings.value : fixedIncomeSettings.value
})
const router = useRouter()
const route = useRoute()

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
const filterStatus = ref<ProductStatus | 'all'>('holding')

const sortKey = ref<'name' | 'marketValue' | 'annualRate' | 'profitRate' | 'profit' | 'holdingDays' | 'dailyReturn' | 'stageGains1m' | 'stageGains3m' | 'stageGainsYtd' | 'fiAnnual1m' | 'fiAnnual3m' | 'fiAnnual1y' | 'holder' | 'inceptionDays'>('marketValue')
const sortOrder = ref<'asc' | 'desc'>('desc')

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
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

// ==================== 成立天数（基于最早净值日期计算）====================
const inceptionDaysMap = computed(() => {
  const map = new Map<string, number>()
  for (const product of products.value) {
    if (product.type !== 'fixed_income' || !product.code) continue
    const navUpdates = getTransactionsByProductId(product.id)
      .filter(t => t.type === 'nav_update')
      .sort((a, b) => a.date - b.date)
    if (navUpdates.length === 0) continue
    const earliestDate = navUpdates[0].date
    const days = Math.floor((Date.now() - earliestDate) / (24 * 60 * 60 * 1000))
    map.set(product.code, days)
  }
  return map
})

const getInceptionDays = (code: string | undefined): number | undefined => {
  if (!code) return undefined
  return inceptionDaysMap.value.get(code)
}

// ==================== 成立年化收益率（首笔净值至今的年化）====================
const inceptionAnnualRateMap = computed(() => {
  const map = new Map<string, number>()
  for (const product of products.value) {
    if (product.type !== 'fixed_income' || !product.code) continue
    const navUpdates = getTransactionsByProductId(product.id)
      .filter(t => t.type === 'nav_update')
      .sort((a, b) => a.date - b.date)
    if (navUpdates.length < 2) continue
    const first = navUpdates[0]
    const last = navUpdates[navUpdates.length - 1]
    const days = (last.date - first.date) / (24 * 60 * 60 * 1000)
    if (days < 7) continue
    const simpleReturn = last.price / first.price
    const annualRate = (Math.pow(simpleReturn, 365 / days) - 1) * 100
    map.set(product.code, annualRate)
  }
  return map
})

const getInceptionAnnualRate = (code: string | undefined): number | undefined => {
  if (!code) return undefined
  return inceptionAnnualRateMap.value.get(code)
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
  if (props.type !== 'equity') return
  
  // 获取所有有 code 且有市值的权益产品
  const equityData = products.value
    .filter(p => (p.type === 'equity' || p.type === 'fund') && p.code)
    .map(p => {
      const pos = calculatePosition(p)
      return { code: p.code!, marketValue: pos?.marketValue || 0 }
    })
    .filter(f => f.marketValue > 0)
  
  if (equityData.length === 0) return
  
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
    const result = await fetchAggregatedHoldings(equityData)
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

// 收起状态下 Top 10 分布（股票 + 资产类别混合排序）
const topDistributionItems = computed(() => {
  if (!aggregatedHoldings.value) return []
  
  const items: { key: string; name: string; ratio: number; isAsset: boolean; bgClass: string }[] = []
  
  // 添加股票
  for (const stock of aggregatedHoldings.value.stocks) {
    items.push({ key: `stock-${stock.code}`, name: stock.name, ratio: stock.ratio, isAsset: false, bgClass: '' })
  }
  
  // 添加资产类别
  const assetBgMap: Record<string, string> = {
    cash: 'bg-amber-50',
    bond: 'bg-emerald-50',
    other_stocks: 'bg-blue-50'
  }
  for (const cat of aggregatedHoldings.value.assetCategories) {
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
    if (shares > 0.01) {
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
      (p.code && p.code.toLowerCase().includes(query))
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
      case 'inceptionDays':
        comparison = (getInceptionDays(a.code) || 0) - (getInceptionDays(b.code) || 0)
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
    fetchAllAggregatedHoldings(true)
  }
})

watch(() => products.value, () => {
  if (props.type === 'equity') {
    fetchAllStageGains()
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

const handleSubmit = (data: { name: string; type: ProductType; note: string; code: string; holder: string; dcaAmount: number; dcaCycle: string; navSource: string }) => {
  if (editingProduct.value) {
    updateProduct(editingProduct.value.id, data.name, data.type, data.note, data.code, data.holder, data.dcaAmount, data.dcaCycle, data.navSource)
  } else {
    addProduct(data.name, data.type, data.note, data.code, data.holder, data.dcaAmount, data.dcaCycle, data.navSource)
  }
  showModal.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center space-x-2">
          <h2 class="apple-section-title">
            {{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : '产品' }}
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
        <p class="apple-section-subtitle mt-1">共 {{ filteredProducts.length }} 个{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : '理财产品' }}</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- 批量更新净值按钮（权益和固收理财页面显示） -->
        <button 
          v-if="props.type === 'fixed_income' || props.type === 'equity'"
          @click="handleBatchUpdateNav"
          :disabled="loadingBatchNav"
          class="apple-btn-primary flex items-center space-x-2 px-5 py-2.5 text-[14px] disabled:opacity-50"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loadingBatchNav }" />
          <span>{{ loadingBatchNav ? '更新中...' : '净值更新' }}</span>
        </button>
        <button 
          @click="handleAdd"
          class="apple-btn-primary flex items-center space-x-2 px-5 py-2.5 text-[14px]"
        >
          <Plus class="w-4 h-4" />
          <span>新增产品</span>
        </button>
      </div>
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
    <div v-if="props.type === 'fixed_income'" class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">总市值</p>
        <p class="text-[20px] font-semibold text-apple-text tracking-tight">{{ pageSettings.showMarketValue ? formatCurrency1(summaryStats.totalMarketValue) : '****' }}</p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益</p>
        <p class="text-[20px] font-semibold tracking-tight" :class="pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalProfit) : '****' }}
        </p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益率</p>
        <p class="text-[20px] font-semibold tracking-tight" :class="pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? '+' : '') + summaryStats.profitRate.toFixed(2) + '%' : '****' }}
        </p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">年化收益率</p>
        <p class="text-[20px] font-semibold tracking-tight" :class="pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitRate ? (summaryStats.portfolioAnnualRate >= 0 ? '+' : '') + summaryStats.portfolioAnnualRate.toFixed(2) + '%' : '****' }}
        </p>
      </div>
    </div>
    
    <div v-else :class="['grid grid-cols-2 gap-3 md:grid-cols-4']">
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">总市值</p>
        <p class="text-[20px] font-semibold text-apple-text tracking-tight">{{ pageSettings.showMarketValue ? formatCurrency1(summaryStats.totalMarketValue) : '****' }}</p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">总成本</p>
        <p class="text-[20px] font-semibold text-apple-text tracking-tight">{{ pageSettings.showCost ? formatCurrency1(summaryStats.totalCost) : '****' }}</p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益</p>
        <p class="text-[20px] font-semibold tracking-tight" :class="pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitAmount ? (summaryStats.totalProfit >= 0 ? '+' : '') + formatCurrency1(summaryStats.totalProfit) : '****' }}
        </p>
      </div>
      <div class="glass-card p-4">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1.5">持仓收益率</p>
        <p class="text-[20px] font-semibold tracking-tight" :class="pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'">
          {{ pageSettings.showProfitRate ? (summaryStats.profitRate >= 0 ? '+' : '') + summaryStats.profitRate.toFixed(2) + '%' : '****' }}
        </p>
      </div>
    </div>

    <!-- 持仓穿透汇总（仅权益页面显示） -->
    <div v-if="props.type === 'equity'" class="glass-card overflow-hidden">
      <div class="p-5 border-b border-black/5 flex items-center justify-between">
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
            class="text-[13px] text-apple-secondary hover:text-primary-500 disabled:opacity-50 transition-colors"
            title="刷新数据"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loadingAggregatedHoldings }" />
          </button>
          <button
            @click="toggleAggregatedHoldings"
            class="text-[13px] text-primary-500 hover:text-primary-700 font-medium"
          >
            {{ showAggregatedHoldings ? '收起' : '展开' }}
          </button>
        </div>
      </div>
      
      <!-- 资产配置概览条（始终显示） -->
      <div v-if="aggregatedHoldings?.assetAllocation" class="px-5 py-3 border-b border-black/5">
        <div class="flex items-center gap-4 text-[12px] mb-2">
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
            <span class="text-apple-secondary">现金及其他</span>
            <span class="font-semibold text-apple-text">{{ aggregatedHoldings.assetAllocation.cashAndOtherRatio.toFixed(1) }}%</span>
          </span>
        </div>
        <!-- 比例条 -->
        <div class="flex h-3 rounded-full overflow-hidden bg-apple-bg">
          <div class="bg-primary-500" :style="{ width: aggregatedHoldings.assetAllocation.stockRatio + '%' }"></div>
          <div class="bg-emerald-500" :style="{ width: aggregatedHoldings.assetAllocation.bondRatio + '%' }"></div>
          <div class="bg-amber-500" :style="{ width: aggregatedHoldings.assetAllocation.cashAndOtherRatio + '%' }"></div>
        </div>
      </div>
      
      <div v-if="loadingAggregatedHoldings" class="p-8 text-center">
        <p class="text-apple-secondary">加载中...</p>
      </div>
      
      <div v-else-if="showAggregatedHoldings && aggregatedHoldings && aggregatedHoldings.stocks.length > 0" class="overflow-x-auto">
        <table class="w-full apple-table">
          <thead>
            <tr>
              <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">名称</th>
              <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">代码</th>
              <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">持仓金额</th>
              <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">占比</th>
              <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">持有权益</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-apple-border/50">
            <tr v-for="(stock, idx) in aggregatedHoldings.stocks" :key="stock.code">
              <td class="px-2 py-2.5">
                <div class="flex items-center">
                  <span class="w-5 h-5 rounded-full bg-primary-50 text-primary-500 text-xs flex items-center justify-center mr-1.5 flex-shrink-0">{{ idx + 1 }}</span>
                  <span class="font-medium text-apple-text text-[13px] truncate max-w-[80px]">{{ stock.name }}</span>
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
                    class="apple-tag bg-black/5 text-apple-secondary whitespace-nowrap"
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
                      'bg-blue-400': cat.type === 'other_stocks'
                    }"
                  >
                    <span class="text-[9px] font-bold">{{ cat.type === 'cash' ? '¥' : cat.type === 'bond' ? '债' : '股' }}</span>
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
                    'bg-blue-50 text-blue-500': cat.type === 'other_stocks'
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
      
      <div v-else-if="showAggregatedHoldings && aggregatedHoldings && aggregatedHoldings.stocks.length === 0" class="p-8 text-center">
        <p class="text-apple-secondary">暂无持仓数据</p>
      </div>
      
      <!-- 收起状态：显示 Top 10 分布（股票 + 资产类别） -->
      <div v-else-if="!showAggregatedHoldings && aggregatedHoldings" class="p-5">
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="(item, idx) in topDistributionItems" 
            :key="item.key"
            class="inline-flex items-center px-3 py-1.5 rounded-full border"
            :class="item.isAsset 
              ? 'border-transparent ' + item.bgClass 
              : 'bg-apple-bg border-apple-border/50'"
          >
            <span class="text-[11px] text-apple-secondary mr-1">{{ idx + 1 }}.</span>
            <span class="text-[13px] font-medium text-apple-text">{{ item.name }}</span>
            <span class="text-[11px] text-apple-secondary ml-2">{{ item.ratio.toFixed(1) }}%</span>
          </span>
          <span v-if="topDistributionItems.length < (aggregatedHoldings.stocks.length + aggregatedHoldings.assetCategories.length)" class="text-[13px] text-apple-secondary self-center">
            +{{ (aggregatedHoldings.stocks.length + aggregatedHoldings.assetCategories.length) - topDistributionItems.length }} 更多
          </span>
        </div>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="搜索产品名称、代码或备注..."
          class="glass-input w-full pl-10 pr-4 py-2.5 rounded-apple outline-none text-[15px]"
        />
      </div>
      <select 
        v-if="!props.type"
        v-model="filterType"
        class="glass-input px-4 py-2.5 rounded-apple outline-none text-[15px]"
      >
        <option value="all">全部类型</option>
        <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <div class="flex rounded-xl overflow-hidden border border-apple-border/50 bg-white">
        <button
          v-for="status in ['all', 'holding', 'closed', 'watchlist'] as const"
          :key="status"
          @click="filterStatus = status"
          class="px-3 py-2 text-[13px] font-medium transition-all"
          :class="filterStatus === status 
            ? 'bg-primary-500 text-white' 
            : 'bg-transparent text-apple-secondary hover:text-apple-text'"
        >
          {{ status === 'all' ? '全部' : PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.label }}
        </button>
      </div>
    </div>
    
    <!-- 移动端卡片布局 -->
    <div class="md:hidden space-y-2">
      <div v-if="filteredProducts.length > 0" class="space-y-2">
        <ProductListItem 
          v-for="product in filteredProducts" 
          :key="product.id" 
          v-show="getPosition(product.id)"
          :position="getPosition(product.id)!"
          :daily-return="getDailyReturn(product.code)?.dailyReturn"
          :show-profit-amount="pageSettings.showProfitAmount"
          :show-profit-rate="pageSettings.showProfitRate"
          :nav-updated-today="todayNavUpdateSet.has(product.id)"
          :status="productStatusMap.get(product.id)"
          :is-watchlist-mode="filterStatus === 'watchlist' && props.type === 'fixed_income'"
          :inception-days="getInceptionDays(product.code)"
          :fi-annual-1m="getFixedIncomeAnnualRate(product.code)?.['1m']"
          :inception-annual-rate="getInceptionAnnualRate(product.code)"
          @edit="handleEdit(product)"
          @delete="handleDelete(product.id)"
          @click="(id) => router.push({ name: 'product-detail', params: { id }, query: { status: filterStatus, type: filterType } })"
        />
      </div>
      <div v-else class="glass-card p-8 text-center">
        <p class="text-apple-text text-[16px] font-medium">暂无{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : '产品' }}数据</p>
        <p class="text-apple-secondary text-[13px] mt-2">点击上方按钮添加{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : '理财产品' }}</p>
      </div>
    </div>
    
    <!-- 桌面端表格布局 -->
    <div class="hidden md:block glass-card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full apple-table">
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
                class="px-2 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider select-none"
              >
                <div class="flex items-center space-x-1">
                  <span>状态</span>
                </div>
              </th>
              <th 
                v-if="props.type !== 'equity'"
                class="px-2 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('holder')"
              >
                <div class="flex items-center space-x-1">
                  <span>持有人</span>
                  <ChevronsUpDown v-if="sortKey !== 'holder'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('marketValue')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>市值</span>
                  <ChevronsUpDown v-if="sortKey !== 'marketValue'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <!-- 固收产品特有列：持有年化收益率 -->
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('annualRate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>持有年化</span>
                  <ChevronsUpDown v-if="sortKey !== 'annualRate'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('profitRate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>收益率</span>
                  <ChevronsUpDown v-if="sortKey !== 'profitRate'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('profit')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>收益</span>
                  <ChevronsUpDown v-if="sortKey !== 'profit'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('holdingDays')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>持有</span>
                  <ChevronsUpDown v-if="sortKey !== 'holdingDays'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <!-- 固收产品特有列：年化收益率统计 -->
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('fiAnnual1m')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近1月</span>
                  <ChevronsUpDown v-if="sortKey !== 'fiAnnual1m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('fiAnnual3m')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近3月</span>
                  <ChevronsUpDown v-if="sortKey !== 'fiAnnual3m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('fiAnnual1y')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近1年</span>
                  <ChevronsUpDown v-if="sortKey !== 'fiAnnual1y'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <!-- 权益类型特有列：阶段涨幅 -->
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('stageGains1m')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近1月</span>
                  <ChevronsUpDown v-if="sortKey !== 'stageGains1m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('stageGains3m')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>近3月</span>
                  <ChevronsUpDown v-if="sortKey !== 'stageGains3m'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type === 'equity'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('stageGainsYtd')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>今年</span>
                  <ChevronsUpDown v-if="sortKey !== 'stageGainsYtd'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                v-if="props.type === 'fixed_income'"
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('inceptionDays')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>成立</span>
                  <ChevronsUpDown v-if="sortKey !== 'inceptionDays'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th 
                class="px-2 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 transition-colors select-none"
                @click="handleSort('dailyReturn')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>当日</span>
                  <ChevronsUpDown v-if="sortKey !== 'dailyReturn'" class="w-3 h-3 text-apple-secondary/40" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-500" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-500" />
                </div>
              </th>
              <th class="px-2 py-2.5 text-center text-[11px] font-semibold text-apple-secondary uppercase tracking-wider w-16">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-apple-border/50">
            <tr 
              v-for="product in filteredProducts" 
              :key="product.id" 
              class="hover:bg-primary-50/30 cursor-pointer transition-colors"
              @click="router.push({ name: 'product-detail', params: { id: product.id }, query: { status: filterStatus, type: filterType } })"
            >
              <td class="px-2 py-3">
                <div>
                  <h3 class="text-[14px] font-semibold text-apple-text truncate sm:truncate-none sm:max-w-none max-w-[140px]">{{ product.name }}</h3>
                  <div class="flex items-center space-x-2 mt-1">
                    <span 
                      v-if="!props.type"
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                      :class="{
                        'bg-primary-50 text-primary-500': product.type === 'equity' || product.type === 'fund',
                        'bg-fixed-income/10 text-fixed-income': product.type === 'fixed_income'
                      }"
                    >
                      {{ getProductTypeLabel(product.type) }}
                    </span>
                    <span v-if="product.code" class="text-[11px] font-mono text-apple-secondary shrink-0">代码: {{ product.code }}</span>
                    <span v-if="product.note" class="text-[11px] text-amber-500 truncate max-w-[150px]" :title="product.note">{{ product.note }}</span>
                    <span v-if="product.dcaAmount && product.dcaCycle" class="text-[11px] text-primary-500 shrink-0">定投: {{ getDcaLabel(product.dcaAmount, product.dcaCycle) }}</span>
                  </div>
                </div>
              </td>
              <td class="px-2 py-3 whitespace-nowrap">
                <span 
                  v-if="productStatusMap.get(product.id)"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  :style="{ backgroundColor: PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.color + '15', color: PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.color }"
                >
                  {{ PRODUCT_STATUS_OPTIONS.find(o => o.value === productStatusMap.get(product.id))?.label }}
                </span>
                <span v-else class="text-[13px] text-apple-secondary">-</span>
              </td>
              <td v-if="props.type !== 'equity'" class="px-2 py-3 whitespace-nowrap">
                <p class="text-[14px] text-apple-secondary">{{ product.holder || '-' }}</p>
              </td>
              <td class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id) && pageSettings.showMarketValue">
                  <p class="text-[14px] font-semibold text-apple-text">{{ Math.round((getPosition(product.id) as any).marketValue).toLocaleString() }} 元</p>
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
              <td class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p class="text-[14px] font-semibold text-apple-text">{{ (getPosition(product.id) as any).holdingDays }} 天</p>
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
              <td v-if="props.type === 'fixed_income'" class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getInceptionDays(product.code) !== undefined">
                  <p class="text-[14px] font-semibold text-apple-text">{{ getInceptionDays(product.code) }} 天</p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <td class="px-2 py-3 text-right whitespace-nowrap">
                <template v-if="getDailyReturn(product.code)">
                  <p 
                    class="text-[14px] font-semibold"
                    :class="(getDailyReturn(product.code)?.dailyReturn ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
                  >
                    {{ (getDailyReturn(product.code)?.dailyReturn ?? 0) >= 0 ? '+' : '' }}{{ (getDailyReturn(product.code)?.dailyReturn ?? 0).toFixed(2) }}%
                  </p>
                  <p class="text-[11px] mt-0.5" :class="todayNavUpdateSet.has(product.id) ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
                    {{ getDailyReturn(product.code)?.date || '' }}
                  </p>
                </template>
                <template v-else>
                  <p class="text-[13px] text-apple-secondary">-</p>
                </template>
              </td>
              <td class="px-2 py-3 text-center whitespace-nowrap" @click.stop>
                <div class="flex items-center justify-center space-x-1.5">
                  <button 
                    @click="handleEdit(product)"
                    class="w-8 h-8 flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button 
                    @click="handleDelete(product.id)"
                    class="w-8 h-8 flex items-center justify-center text-apple-secondary hover:text-profit hover:bg-profit/5 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filteredProducts.length === 0" class="p-10 text-center">
        <p class="text-apple-text text-[17px] font-medium">暂无{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : '产品' }}数据</p>
        <p class="text-apple-secondary text-[14px] mt-2">点击上方按钮添加{{ props.type === 'equity' ? '权益' : props.type === 'fixed_income' ? '固收理财' : '理财产品' }}</p>
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
