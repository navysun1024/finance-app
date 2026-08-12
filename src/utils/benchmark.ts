import type { IndexPoint, BenchmarkPoint } from '@/types'
import { INDEX_NAME_MAP } from './indexApi'
import { createLogger } from './logger'

const logger = createLogger('Benchmark')

export interface BenchmarkComponent {
  indexCode: string
  indexName: string
  weight: number  // 0~1
}

/**
 * 解析基准公式字符串
 * 格式: "60%*000923+40%*000906"
 * 也支持: "60*000923+40*000906" 或 "0.6*000923+0.4*000906"
 */
export function parseBenchmarkFormula(formula: string): BenchmarkComponent[] {
  if (!formula || !formula.trim()) return []

  const components: BenchmarkComponent[] = []
  // 按 + 分割
  const parts = formula.split('+').map(p => p.trim()).filter(Boolean)

  for (const part of parts) {
    // 匹配 "60%*H11001" 或 "60%*000905" 或 "0.6*H11001"
    const match = part.match(/^([\d.]+)%?\s*\*\s*([A-Za-z]?\d{5,6})$/)
    if (!match) {
      logger.warn(`公式片段解析失败: ${part}`)
      continue
    }
    const weightRaw = parseFloat(match[1])
    const indexCode = match[2]
    const weight = part.includes('%') ? weightRaw / 100 : weightRaw

    if (weight <= 0 || isNaN(weight)) {
      logger.warn(`权重无效: ${part}`)
      continue
    }

    components.push({
      indexCode,
      indexName: INDEX_NAME_MAP[indexCode] || indexCode,
      weight,
    })
  }

  return components
}

/**
 * 将 BenchmarkComponent[] 序列化为公式字符串
 */
export function serializeBenchmarkFormula(components: BenchmarkComponent[]): string {
  return components
    .map(c => `${Math.round(c.weight * 100)}%*${c.indexCode}`)
    .join('+')
}

/**
 * 计算基准净值序列
 * 按产品起始净值缩放，使基准线与产品净值在同一量级可对比
 *
 * @param formula 基准公式
 * @param allIndexData 所有指数的历史数据 Map
 * @param startDate 起始日期 timestamp（用于确定基期）
 * @param startNav 产品在起始日期的净值（基准线起始值 = startNav）
 * @returns 基准净值序列
 */
export function calcBenchmarkSeries(
  formula: string,
  allIndexData: Map<string, IndexPoint[]>,
  startDate: number,
  startNav: number
): BenchmarkPoint[] {
  const components = parseBenchmarkFormula(formula)
  if (components.length === 0) return []

  // 确保有数据
  const validComponents = components.filter(c => allIndexData.has(c.indexCode))
  if (validComponents.length === 0) return []

  // 收集所有日期的并集（只取起始日期之后的）
  const allDates = new Set<string>()
  for (const comp of validComponents) {
    const data = allIndexData.get(comp.indexCode)!
    for (const point of data) {
      const pointTs = new Date(point.date + 'T00:00:00').getTime()
      if (pointTs >= startDate) {
        allDates.add(point.date)
      }
    }
  }

  const sortedDates = Array.from(allDates).sort()

  if (sortedDates.length === 0) return []

  // 计算每个指数在起始日期（或之前最近）的基准值
  const baseValues = new Map<string, number>()
  for (const comp of validComponents) {
    const data = allIndexData.get(comp.indexCode)!
    // 找到起始日期或之前最近的数据点
    let baseVal: number | null = null
    for (const point of data) {
      const pointTs = new Date(point.date + 'T00:00:00').getTime()
      if (pointTs <= startDate) {
        baseVal = point.value
      } else {
        break
      }
    }
    // 如果没有找到起始日期之前的数据，用第一条
    if (baseVal === null && data.length > 0) {
      baseVal = data[0].value
    }
    baseValues.set(comp.indexCode, baseVal || 1)
  }

  // 计算基准序列
  const result: BenchmarkPoint[] = []
  for (const dateStr of sortedDates) {
    const dateTs = new Date(dateStr + 'T00:00:00').getTime()
    let weightedRatio = 0
    let totalWeight = 0

    for (const comp of validComponents) {
      const data = allIndexData.get(comp.indexCode)!
      // 前向填充：找到当前日期或之前最近的数据点
      let currentVal: number | null = null
      for (const point of data) {
        if (point.date <= dateStr) {
          currentVal = point.value
        } else {
          break
        }
      }
      if (currentVal === null) continue

      const baseVal = baseValues.get(comp.indexCode)!
      if (baseVal > 0) {
        weightedRatio += (currentVal / baseVal) * comp.weight
        totalWeight += comp.weight
      }
    }

    if (totalWeight > 0) {
      // 归一化权重，然后乘以起始净值
      const normalizedRatio = weightedRatio / totalWeight
      result.push({
        date: dateTs,
        value: parseFloat((startNav * normalizedRatio).toFixed(4)),
      })
    }
  }

  logger.info(`基准序列计算完成, ${result.length} 个数据点, 起始净值: ${startNav}`)
  return result
}

/**
 * 获取公式中涉及的所有指数代码
 */
export function getFormulaIndexCodes(formula: string): string[] {
  return parseBenchmarkFormula(formula).map(c => c.indexCode)
}
