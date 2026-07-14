import { createLogger } from './logger'

const logger = createLogger('EquityApi')

export interface NavResult {
  code?: string
  nav: number
  date: string
  name: string
  dailyReturn?: number | null
  purchaseLimitLabel?: string
}

/**
 * 获取权益限购信息
 */
export async function fetchEquityPurchaseLimit(equityCode: string): Promise<string> {
  try {
    const response = await fetch(`/api/db/api/fund/purchase-limit/${equityCode}`)
    const result = await response.json()
    return result.purchaseLimitLabel || ''
  } catch {
    return ''
  }
}

export async function fetchEquityNav(equityCode: string): Promise<NavResult> {
  logger.info(`查询权益净值, code: ${equityCode}`)
  return logger.withTiming(`fetchEquityNav(${equityCode})`, async () => {
    const url = `/api/pingzhongdata/pingzhongdata/${equityCode}.js`

    const response = await fetch(url)
    const text = await response.text()

    if (!text || text.length < 100) {
      logger.warn(`权益 ${equityCode} 数据为空, 响应长度: ${text?.length || 0}`)
      throw new Error(`权益 ${equityCode} 数据为空`)
    }

    const nameMatch = text.match(/var Data_fundName\s*=\s*['"]([^'"]+)['"]/)
    const equityName = nameMatch ? nameMatch[1] : ''

    const trendMatch = text.match(/var Data_netWorthTrend\s*=\s*(\[[\s\S]+?\]);/)
    if (!trendMatch) {
      logger.error(`权益 ${equityCode} 净值趋势数据解析失败`)
      throw new Error(`权益 ${equityCode} 净值趋势数据解析失败`)
    }

    const data = JSON.parse(trendMatch[1])
    if (!data || data.length === 0) {
      logger.warn(`权益 ${equityCode} 暂无净值数据`)
      throw new Error(`权益 ${equityCode} 暂无净值数据`)
    }

    const last = data[data.length - 1]
    const lastDate = new Date(last.x)
    const dateStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`

    // 计算当日收益率（与上一个交易日净值对比）
    let dailyReturn: number | null = null
    if (data.length >= 2) {
      const prev = data[data.length - 2]
      if (prev.y > 0) {
        dailyReturn = Math.round(((last.y - prev.y) / prev.y) * 10000) / 100
      }
    }

    // 并行获取限购信息
    const purchaseLimitLabel = await fetchEquityPurchaseLimit(equityCode)

    logger.info(`权益 ${equityCode} 净值查询成功: nav=${last.y}, date=${dateStr}, name=${equityName}, dailyReturn=${dailyReturn}, limit=${purchaseLimitLabel}`)
    return {
      nav: last.y,
      date: dateStr,
      name: equityName,
      dailyReturn,
      purchaseLimitLabel
    }
  })
}

export async function fetchCmbNav(productCode: string): Promise<NavResult> {
  logger.info(`查询招银理财净值, code: ${productCode}`)
  return logger.withTiming(`fetchCmbNav(${productCode})`, async () => {
    try {
      const response = await fetch(`/api/scrape/cmb?code=${encodeURIComponent(productCode)}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`招银理财净值查询成功, code: ${productCode}, nav: ${result.data?.nav}`)
        return result.data
      } else {
        logger.error(`招银理财净值查询失败, code: ${productCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`招银理财净值请求异常, code: ${productCode}, 错误: ${e.message}`, e)
      throw new Error(`招银理财净值查询失败: ${e.message}`)
    }
  })
}

export async function fetchIcbcNav(productCode: string): Promise<NavResult> {
  logger.info(`查询工银理财净值, code: ${productCode}`)
  return logger.withTiming(`fetchIcbcNav(${productCode})`, async () => {
    try {
      const response = await fetch(`/api/scrape/icbc?code=${encodeURIComponent(productCode)}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`工银理财净值查询成功, code: ${productCode}, nav: ${result.data?.nav}`)
        return result.data
      } else {
        logger.error(`工银理财净值查询失败, code: ${productCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`工银理财净值请求异常, code: ${productCode}, 错误: ${e.message}`, e)
      throw new Error(`工银理财净值查询失败: ${e.message}`)
    }
  })
}

/**
 * 批量查询招银理财净值
 * @param productCodes 产品代码数组
 */
export async function fetchCmbNavBatch(productCodes: string[]): Promise<NavResult[]> {
  if (productCodes.length === 0) return []
  logger.info(`批量查询招银理财净值, 数量: ${productCodes.length}`)
  return logger.withTiming(`fetchCmbNavBatch(${productCodes.length})`, async () => {
    try {
      const response = await fetch(`/api/scrape/cmb/batch?codes=${encodeURIComponent(productCodes.join(','))}`)
      const result = await response.json()
      if (result.success) {
        const successCount = result.data.filter((r: any) => r.nav !== null).length
        logger.info(`批量招银理财净值查询成功, 成功: ${successCount}/${productCodes.length}`)
        return result.data
      } else {
        logger.error(`批量招银理财净值查询失败: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`批量招银理财净值请求异常: ${e.message}`, e)
      throw new Error(`批量招银理财净值查询失败: ${e.message}`)
    }
  })
}

export async function fetchCmbNavHistory(productCode: string, maxPages: number = 50): Promise<NavResult[]> {
  logger.info(`查询招银理财历史净值, code: ${productCode}, maxPages: ${maxPages}`)
  return logger.withTiming(`fetchCmbNavHistory(${productCode}, ${maxPages})`, async () => {
    try {
      // 优先从后端缓存 API 获取（有缓存时不会触发爬虫）
      const response = await fetch(`/api/db/cmb/nav-history/${encodeURIComponent(productCode)}?maxPages=${maxPages}`)
      const result = await response.json()
      if (result.success) {
        const from = result.fromCache ? '缓存' : '爬取'
        logger.info(`招银理财历史净值查询成功(${from}), code: ${productCode}, 条数: ${result.data?.length || 0}`)
        return result.data
      } else {
        logger.error(`招银理财历史净值查询失败, code: ${productCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`招银理财历史净值请求异常, code: ${productCode}, 错误: ${e.message}`, e)
      throw new Error(`招银理财净值历史查询失败: ${e.message}`)
    }
  })
}

export async function fetchIcbcNavHistory(productCode: string, maxPages: number = 50): Promise<NavResult[]> {
  logger.info(`查询工银理财历史净值, code: ${productCode}, maxPages: ${maxPages}`)
  return logger.withTiming(`fetchIcbcNavHistory(${productCode}, ${maxPages})`, async () => {
    try {
      const response = await fetch(`/api/scrape/icbc/history?code=${encodeURIComponent(productCode)}&maxPages=${maxPages}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`工银理财历史净值查询成功, code: ${productCode}, 条数: ${result.data?.length || 0}`)
        return result.data
      } else {
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      throw new Error(`工银理财净值历史查询失败: ${e.message}`)
    }
  })
}

export interface StageGains {
  '1w'?: number   // 近1周
  '1m'?: number   // 近1月
  '3m'?: number   // 近3月
  '6m'?: number   // 近6月
  '1y'?: number   // 近1年
  '2y'?: number   // 近2年
  '3y'?: number   // 近3年
  ytd?: number   // 今年来
}

// 带缓存状态的返回结果
export interface CachedResult<T> {
  data: T
  fromCache: boolean
  updatedAt?: number
}

export async function fetchEquityStageGains(equityCode: string, force = false): Promise<CachedResult<StageGains>> {
  logger.info(`查询权益阶段涨幅, code: ${equityCode}, force: ${force}`)
  return logger.withTiming(`fetchEquityStageGains(${equityCode})`, async () => {
    try {
      const url = force 
        ? `/api/db/fund/stage-gains/${equityCode}?force=true`
        : `/api/db/fund/stage-gains/${equityCode}`
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        logger.info(`权益阶段涨幅查询成功, code: ${equityCode}, fromCache: ${result.fromCache}`)
        return {
          data: result.data,
          fromCache: result.fromCache || false,
          updatedAt: result.updatedAt
        }
      } else {
        logger.error(`权益阶段涨幅查询失败, code: ${equityCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`权益阶段涨幅请求异常, code: ${equityCode}, 错误: ${e.message}`, e)
      throw new Error(`权益阶段涨幅查询失败: ${e.message}`)
    }
  })
}

/**
 * 批量获取多只权益的阶段涨幅
 * @param equityCodes 权益代码数组
 */
export async function fetchEquityStageGainsBatch(equityCodes: string[]): Promise<Record<string, StageGains>> {
  if (equityCodes.length === 0) return {}
  logger.info(`批量查询权益阶段涨幅, 数量: ${equityCodes.length}`)
  return logger.withTiming(`fetchEquityStageGainsBatch(${equityCodes.length})`, async () => {
    try {
      const url = `/api/db/fund/stage-gains-batch?codes=${encodeURIComponent(equityCodes.join(','))}`
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        logger.info(`批量阶段涨幅查询成功, cachedCount: ${result.cachedCount}`)
        return result.data || {}
      } else {
        logger.error(`批量阶段涨幅查询失败: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`批量阶段涨幅请求异常: ${e.message}`, e)
      throw new Error(`批量阶段涨幅查询失败: ${e.message}`)
    }
  })
}

// ==================== 权益持仓信息 ====================

export interface EquityHolding {
  index: number      // 序号
  code: string       // 股票代码
  name: string       // 股票名称
  ratio: number      // 占净值比例 (%)
  shares: number     // 持股数 (万股)
  marketValue: number // 持仓市值 (万元)
}

export interface EquityAssetAllocation {
  stockRatio: number | null   // 股票占净比 (%)
  bondRatio: number | null    // 债券占净比 (%)
  cashRatio: number | null    // 现金占净比 (%)
  netAsset: number | null     // 净资产 (亿元)
  reportDate: string          // 报告期
}

export interface EquityHoldingsResult {
  stocks: EquityHolding[]
  assetAllocation: EquityAssetAllocation
  reportDate: string
  dataSource?: string  // 数据来源说明（如"数据来自目标ETF"）
}

export async function fetchEquityHoldings(equityCode: string): Promise<EquityHoldingsResult> {
  logger.info(`查询权益持仓信息, code: ${equityCode}`)
  return logger.withTiming(`fetchEquityHoldings(${equityCode})`, async () => {
    try {
      const response = await fetch(`/api/db/fund/holdings/${equityCode}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`权益持仓信息查询成功, code: ${equityCode}, 重仓股数量: ${result.data?.stocks?.length || 0}`)
        return result.data
      } else {
        logger.error(`权益持仓信息查询失败, code: ${equityCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`权益持仓信息请求异常, code: ${equityCode}, 错误: ${e.message}`, e)
      throw new Error(`权益持仓信息查询失败: ${e.message}`)
    }
  })
}

// ==================== 权益持仓汇总 ====================

export interface AggregatedStock {
  code: string        // 股票代码
  name: string        // 股票名称
  totalValue: number  // 汇总市值 (元)
  ratio: number       // 占总持仓比例 (%)
  funds: {            // 持有该股票的权益明细
    fundCode: string
    ratio: number     // 该权益中占比
    value: number     // 持有市值
  }[]
}

export interface AssetCategory {
  type: 'cash' | 'bond' | 'other_stocks'
  name: string
  code: string
  totalValue: number
  ratio: number
  funds: []
}

export interface AssetAllocation {
  stockRatio: number
  bondRatio: number
  cashAndOtherRatio: number
}

export interface AggregatedHoldingsResult {
  stocks: AggregatedStock[]
  assetCategories: AssetCategory[]
  assetAllocation: AssetAllocation | null
  totalValue: number   // 总市值 (元)
  fundCount: number    // 权益数量
}

/**
 * 获取多只权益的持仓汇总
 * @param equityProducts - 权益代码和市值的数组 [{code, marketValue}]
 */
export async function fetchAggregatedHoldings(
  equityProducts: { code: string; marketValue: number }[]
): Promise<AggregatedHoldingsResult> {
  if (equityProducts.length === 0) {
    return { stocks: [], assetCategories: [], assetAllocation: null, totalValue: 0, fundCount: 0 }
  }
  
  const fundsParam = equityProducts.map(f => `${f.code}:${f.marketValue}`).join(',')
  logger.info(`查询权益持仓汇总, 权益数量: ${equityProducts.length}`)
  
  return logger.withTiming(`fetchAggregatedHoldings(${equityProducts.length})`, async () => {
    try {
      const response = await fetch(`/api/db/equity/aggregated-holdings?funds=${encodeURIComponent(fundsParam)}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`持仓汇总查询成功, 股票数量: ${result.data?.stocks?.length || 0}`)
        return result.data
      } else {
        logger.error(`持仓汇总查询失败, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`持仓汇总请求异常, 错误: ${e.message}`, e)
      throw new Error(`持仓汇总查询失败: ${e.message}`)
    }
  })
}