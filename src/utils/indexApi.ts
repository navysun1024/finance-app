import { createLogger } from './logger'
import type { IndexPoint } from '@/types'

const logger = createLogger('IndexApi')

export interface IndexDefinition {
  code: string
  name: string
  shortName: string
}

export const INDEX_DEFINITIONS: IndexDefinition[] = [
  { code: 'H11001', name: '中证全债指数', shortName: '中证全债' },
  { code: '000905', name: '中证500指数', shortName: '中证500' },
  { code: '000906', name: '中证800指数', shortName: '中证800' },
  { code: '000300', name: '沪深300指数', shortName: '沪深300' },
  { code: '000923', name: '公司债指数', shortName: '公司债' },
]

export const INDEX_NAME_MAP: Record<string, string> = Object.fromEntries(
  INDEX_DEFINITIONS.map(d => [d.code, d.name])
)

/**
 * 获取指数历史数据
 * @param indexCode 指数代码，如 "000905"
 */
export async function fetchIndexHistory(indexCode: string): Promise<IndexPoint[]> {
  logger.info(`查询指数历史数据, code: ${indexCode}`)
  return logger.withTiming(`fetchIndexHistory(${indexCode})`, async () => {
    try {
      const response = await fetch(`/api/db/index/history?code=${indexCode}`)
      const result = await response.json()
      if (result.success) {
        logger.info(`指数 ${indexCode} 历史数据获取成功, ${result.data?.length || 0} 条, fromCache: ${result.fromCache}`)
        return result.data as IndexPoint[]
      } else {
        throw new Error(result.error || '查询失败')
      }
    } catch (e: any) {
      logger.error(`指数 ${indexCode} 历史数据请求异常: ${e.message}`, e)
      throw new Error(`指数数据获取失败: ${e.message}`)
    }
  })
}

/**
 * 批量获取多个指数的历史数据
 */
export async function fetchMultipleIndexHistory(
  indexCodes: string[]
): Promise<Map<string, IndexPoint[]>> {
  const results = new Map<string, IndexPoint[]>()
  await Promise.all(
    indexCodes.map(async (code) => {
      try {
        const data = await fetchIndexHistory(code)
        results.set(code, data)
      } catch (e) {
        logger.warn(`指数 ${code} 获取失败，跳过`)
      }
    })
  )
  return results
}
