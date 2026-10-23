import { ref, type Ref } from 'vue'
import type { StageGains, EquityHoldingsResult } from '@/utils/equityApi'
import { useFinance } from './useFinance'
import { getDateOnly } from '@/utils/format'
import {
  fetchEquityNav,
  fetchCmbNav,
  fetchIcbcNav,
  fetchCmbNavHistory,
  fetchIcbcNavHistory,
  fetchEquityStageGains,
  fetchEquityHoldings,
  type NavResult,
} from '@/utils/equityApi'
import { addNavHistoryRecord, getAuthHeaders } from '@/utils/storage'

/**
 * 产品详情页 - 净值/行情/历史补全相关爬取逻辑
 * 从 ProductDetail.vue 抽取，通过 deps 传入 product/productId，导出无参 handler
 */
interface ProductLike {
  code: string
  type: string
  navSource?: string
}

export function useProductNavFetch(deps: {
  product: Ref<ProductLike | undefined>
  productId: Ref<string>
}) {
  const { refresh, updateProductPurchaseLimit } = useFinance()
  const getProduct = () => deps.product.value
  const getProductId = () => deps.productId.value

  // ---- 状态 refs ----
  const fetchingNav = ref(false)
  const fetchingNavHistory = ref(false)
  const fetchingStageGains = ref(false)
  const fetchingHoldings = ref(false)
  const navFetchError = ref('')
  const navHistorySuccess = ref('')
  const backfillingNav = ref(false)
  const stageGains = ref<StageGains | null>(null)
  const holdingsData = ref<EquityHoldingsResult | null>(null)

  // ---- 内部工具 ----

  function resolveNavSource(product: ProductLike | undefined): 'tiantian' | 'cmb' | 'icbc' | null {
    if (!product) return null
    const allowedSources = product.type === 'equity'
      ? ['tiantian']
      : ['tiantian', 'cmb', 'icbc']
    if (allowedSources.includes(product.navSource || '')) {
      return product.navSource as 'tiantian' | 'cmb' | 'icbc'
    }
    return product.type === 'equity' ? 'tiantian' : 'cmb'
  }

  function parseNavDate(dateStr: string | undefined): number {
    if (!dateStr) return Date.now()
    const cleaned = dateStr.trim()
    const tsMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (tsMatch) {
      return new Date(
        parseInt(tsMatch[1]),
        parseInt(tsMatch[2]) - 1,
        parseInt(tsMatch[3])
      ).getTime()
    }
    const parts = cleaned.split(/[-/]/)
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2])
      ).getTime()
    }
    return Date.now()
  }

  // ---- 对外 handler（无参，内部通过 deps 获取 product/productId）----

  const handleFetchStageGains = async () => {
    const product = getProduct()
    if (!product?.code) return
    fetchingStageGains.value = true
    try {
      const result = await fetchEquityStageGains(product.code)
      stageGains.value = result.data
    } catch (e: any) {
      console.error('获取阶段涨幅失败:', e)
    } finally {
      fetchingStageGains.value = false
    }
  }

  const handleFetchHoldings = async () => {
    const product = getProduct()
    if (!product?.code || product.type !== 'equity') return
    fetchingHoldings.value = true
    try {
      holdingsData.value = await fetchEquityHoldings(product.code)
    } catch (e: any) {
      console.error('获取持仓信息失败:', e)
    } finally {
      fetchingHoldings.value = false
    }
  }

  const handleFetchNav = async () => {
    const product = getProduct()
    const productId = getProductId()
    if (!product?.code) return
    fetchingNav.value = true
    navFetchError.value = ''
    try {
      const navSrc = resolveNavSource(product)
      if (!navSrc) return

      let result: NavResult
      if (navSrc === 'tiantian') {
        result = await fetchEquityNav(product.code)
      } else if (navSrc === 'icbc') {
        result = await fetchIcbcNav(product.code)
      } else {
        result = await fetchCmbNav(product.code)
      }

      const navDateMidnight = getDateOnly(parseNavDate(result.date))

      if (result.purchaseLimitLabel) {
        updateProductPurchaseLimit(productId, result.purchaseLimitLabel)
      }

      const updateTime = new Date().toLocaleString('zh-CN')
      // 始终 INSERT OR REPLACE 写入，确保存量记录 accNav 被更新
      await addNavHistoryRecord({
        code: product.code,
        date: navDateMidnight,
        nav: result.nav,
        accNav: result.accNav ?? 0,
        note: updateTime
      })
      await refresh()
    } catch (e: any) {
      navFetchError.value = e.message || '查询失败'
    } finally {
      fetchingNav.value = false
    }
  }

  const handleFetchNavHistory = async () => {
    const product = getProduct()
    if (!product?.code) return

    const navSrc = resolveNavSource(product)
    if (!navSrc || navSrc === 'tiantian') return

    fetchingNavHistory.value = true
    navFetchError.value = ''
    navHistorySuccess.value = ''
    try {
      const results: NavResult[] = navSrc === 'icbc'
        ? await fetchIcbcNavHistory(product.code, 50)
        : await fetchCmbNavHistory(product.code, 50)

      let upsertedCount = 0
      for (const result of results) {
        const dateKey = getDateOnly(parseNavDate(result.date))
        const now = new Date()
        const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
        // 始终 INSERT OR REPLACE，确保存量记录 accNav 被更新
        await addNavHistoryRecord({
          code: product.code,
          date: dateKey,
          nav: result.nav,
          accNav: result.accNav ?? 0,
          note: timeStr
        })
        upsertedCount++
      }

      navHistorySuccess.value = upsertedCount > 0
        ? `已同步 ${upsertedCount} 条历史净值数据`
        : '未获取到历史净值数据'

      if (upsertedCount > 0) {
        await refresh()
      }
    } catch (e: any) {
      navFetchError.value = e.message || '查询失败'
    } finally {
      fetchingNavHistory.value = false
    }
  }

  const handleBackfillNav = async () => {
    const product = getProduct()
    const productId = getProductId()
    if (!product?.code) return
    const canBackfill = product.type === 'equity' ||
      (product.type === 'fixed_income' && product.navSource === 'tiantian')
    if (!canBackfill) return

    backfillingNav.value = true
    navFetchError.value = ''
    navHistorySuccess.value = ''
    try {
      const res = await fetch(`/api/db/fund/backfill-nav/${productId}`, { method: 'POST', headers: getAuthHeaders() })
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

  return {
    fetchingNav,
    fetchingNavHistory,
    fetchingStageGains,
    fetchingHoldings,
    navFetchError,
    navHistorySuccess,
    backfillingNav,
    stageGains,
    holdingsData,
    handleFetchStageGains,
    handleFetchHoldings,
    handleFetchNav,
    handleFetchNavHistory,
    handleBackfillNav,
  }
}
