import { createLogger } from './logger'

const logger = createLogger('FundApi')

export interface NavResult {
  code?: string
  nav: number
  date: string
  name: string
  dailyReturn?: number | null
  purchaseLimitLabel?: string
}

/**
 * 获取基金限购信息
 */
export async function fetchFundPurchaseLimit(fundCode: string): Promise<string> {
  try {
    const response = await fetch(`/api/db/api/fund/purchase-limit/${fundCode}`)
    const result = await response.json()
    return result.purchaseLimitLabel || ''
  } catch {
    return ''
  }
}

export async function fetchFundNav(fundCode: string): Promise<NavResult> {
  logger.info(`查询基金净值, code: ${fundCode}`)
  return logger.withTiming(`fetchFundNav(${fundCode})`, async () => {
    const url = `/api/pingzhongdata/pingzhongdata/${fundCode}.js`

    const response = await fetch(url)
    const text = await response.text()

    if (!text || text.length < 100) {
      logger.warn(`基金 ${fundCode} 数据为空, 响应长度: ${text?.length || 0}`)
      throw new Error(`基金 ${fundCode} 数据为空`)
    }

    const nameMatch = text.match(/var Data_fundName\s*=\s*['"]([^'"]+)['"]/)
    const fundName = nameMatch ? nameMatch[1] : ''

    const trendMatch = text.match(/var Data_netWorthTrend\s*=\s*(\[[\s\S]+?\]);/)
    if (!trendMatch) {
      logger.error(`基金 ${fundCode} 净值趋势数据解析失败`)
      throw new Error(`基金 ${fundCode} 净值趋势数据解析失败`)
    }

    const data = JSON.parse(trendMatch[1])
    if (!data || data.length === 0) {
      logger.warn(`基金 ${fundCode} 暂无净值数据`)
      throw new Error(`基金 ${fundCode} 暂无净值数据`)
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
    const purchaseLimitLabel = await fetchFundPurchaseLimit(fundCode)

    logger.info(`基金 ${fundCode} 净值查询成功: nav=${last.y}, date=${dateStr}, name=${fundName}, dailyReturn=${dailyReturn}, limit=${purchaseLimitLabel}`)
    return {
      nav: last.y,
      date: dateStr,
      name: fundName,
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

export async function fetchCmbNavHistory(productCode: string, days: number = 10): Promise<NavResult[]> {
  logger.info(`查询招银理财历史净值, code: ${productCode}, days: ${days}`)
  return logger.withTiming(`fetchCmbNavHistory(${productCode}, ${days})`, async () => {
    try {
      // 优先从后端缓存 API 获取（有缓存时不会触发爬虫）
      const response = await fetch(`/api/db/cmb/nav-history/${encodeURIComponent(productCode)}?days=${days}`)
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

export async function fetchFundStageGains(fundCode: string, force = false): Promise<CachedResult<StageGains>> {
  logger.info(`查询基金阶段涨幅, code: ${fundCode}, force: ${force}`)
  return logger.withTiming(`fetchFundStageGains(${fundCode})`, async () => {
    try {
      const url = force 
        ? `/api/db/fund/stage-gains/${fundCode}?force=true`
        : `/api/db/fund/stage-gains/${fundCode}`
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        logger.info(`基金阶段涨幅查询成功, code: ${fundCode}, fromCache: ${result.fromCache}`)
        return {
          data: result.data,
          fromCache: result.fromCache || false,
          updatedAt: result.updatedAt
        }
      } else {
        logger.error(`基金阶段涨幅查询失败, code: ${fundCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`基金阶段涨幅请求异常, code: ${fundCode}, 错误: ${e.message}`, e)
      throw new Error(`基金阶段涨幅查询失败: ${e.message}`)
    }
  })
}

/**
 * 批量获取多只基金的阶段涨幅
 * @param fundCodes 基金代码数组
 */
export async function fetchFundStageGainsBatch(fundCodes: string[]): Promise<Record<string, StageGains>> {
  if (fundCodes.length === 0) return {}
  logger.info(`批量查询基金阶段涨幅, 数量: ${fundCodes.length}`)
  return logger.withTiming(`fetchFundStageGainsBatch(${fundCodes.length})`, async () => {
    try {
      const url = `/api/db/fund/stage-gains-batch?codes=${encodeURIComponent(fundCodes.join(','))}`
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

// ==================== 基金持仓信息 ====================

export interface FundHolding {
  index: number      // 序号
  code: string       // 股票代码
  name: string       // 股票名称
  ratio: number      // 占净值比例 (%)
  shares: number     // 持股数 (万股)
  marketValue: number // 持仓市值 (万元)
}

export interface FundAssetAllocation {
  stockRatio: number | null   // 股票占净比 (%)
  bondRatio: number | null    // 债券占净比 (%)
  cashRatio: number | null    // 现金占净比 (%)
  netAsset: number | null     // 净资产 (亿元)
  reportDate: string          // 报告期
}

export interface FundHoldingsResult {
  stocks: FundHolding[]
  assetAllocation: FundAssetAllocation
  reportDate: string
  dataSource?: string  // 数据来源说明（如“数据来自目标ETF”）
}

export async function fetchFundHoldings(fundCode: string): Promise<FundHoldingsResult> {
  logger.info(`查询基金持仓信息, code: ${fundCode}`)
  return logger.withTiming(`fetchFundHoldings(${fundCode})`, async () => {
    try {
      const response = await fetch(`/api/db/fund/holdings/${fundCode}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`基金持仓信息查询成功, code: ${fundCode}, 重仓股数量: ${result.data?.stocks?.length || 0}`)
        return result.data
      } else {
        logger.error(`基金持仓信息查询失败, code: ${fundCode}, 错误: ${result.error}`)
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`基金持仓信息请求异常, code: ${fundCode}, 错误: ${e.message}`, e)
      throw new Error(`基金持仓信息查询失败: ${e.message}`)
    }
  })
}

// ==================== 基金持仓汇总 ====================

export interface AggregatedStock {
  code: string        // 股票代码
  name: string        // 股票名称
  totalValue: number  // 汇总市值 (元)
  ratio: number       // 占总持仓比例 (%)
  funds: {            // 持有该股票的基金明细
    fundCode: string
    ratio: number     // 该基金中占比
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
  fundCount: number    // 基金数量
}

/**
 * 获取多只基金的持仓汇总
 * @param funds - 基金代码和市值的数组 [{code, marketValue}]
 */
export async function fetchAggregatedHoldings(
  funds: { code: string; marketValue: number }[]
): Promise<AggregatedHoldingsResult> {
  if (funds.length === 0) {
    return { stocks: [], assetCategories: [], assetAllocation: null, totalValue: 0, fundCount: 0 }
  }
  
  const fundsParam = funds.map(f => `${f.code}:${f.marketValue}`).join(',')
  logger.info(`查询基金持仓汇总, 基金数量: ${funds.length}`)
  
  return logger.withTiming(`fetchAggregatedHoldings(${funds.length})`, async () => {
    try {
      const response = await fetch(`/api/db/fund/aggregated-holdings?funds=${encodeURIComponent(fundsParam)}`)
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