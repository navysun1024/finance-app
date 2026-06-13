import { createLogger } from './logger'

const logger = createLogger('FundApi')

export interface NavResult {
  nav: number
  date: string
  name: string
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

    logger.info(`基金 ${fundCode} 净值查询成功: nav=${last.y}, date=${dateStr}, name=${fundName}`)
    return {
      nav: last.y,
      date: dateStr,
      name: fundName
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

export async function fetchCmbNavHistory(productCode: string, days: number = 10): Promise<NavResult[]> {
  logger.info(`查询招银理财历史净值, code: ${productCode}, days: ${days}`)
  return logger.withTiming(`fetchCmbNavHistory(${productCode}, ${days})`, async () => {
    try {
      const response = await fetch(`/api/scrape/cmb/history?code=${encodeURIComponent(productCode)}&days=${days}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`招银理财历史净值查询成功, code: ${productCode}, 条数: ${result.data?.length || 0}`)
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