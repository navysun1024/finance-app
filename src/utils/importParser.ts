import { createLogger } from './logger'

const logger = createLogger('ImportParser')

interface ParsedRow {
  date: string
  fundCode: string
  fundName: string
  type: 'buy'
  shares: number
  amount: number
  fee: number
  nav: number
}

export interface ImportResult {
  rows: ParsedRow[]
  errors: string[]
}

/**
 * 解析并规范化日期字符串，支持多种常见格式：
 * - 紧凑格式: 20260814, 2026-8-14 → 统一输出 YYYY-MM-DD
 * - 斜杠格式: 2026/08/14, 2026/8/14
 * - 短横线格式: 2026-08-14
 * - 中文格式: 2026年8月14日, 2026年08月14号
 * 无法解析时返回 null
 */
export function normalizeDate(raw: string): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null

  let y: number | null = null
  let m: number | null = null
  let d: number | null = null

  // 1) 8 位纯数字紧凑格式: 20260814
  if (/^\d{8}$/.test(s)) {
    y = parseInt(s.slice(0, 4), 10)
    m = parseInt(s.slice(4, 6), 10)
    d = parseInt(s.slice(6, 8), 10)
  } else {
    // 2) 统一替换分隔符 ( / - . 年月日号) 为短横线，然后 split
    const norm = s
      .replace(/年|月|号|日/g, '-')
      .replace(/[\/\.]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const parts = norm.split('-').filter(Boolean)
    if (parts.length === 3) {
      y = parseInt(parts[0], 10)
      m = parseInt(parts[1], 10)
      d = parseInt(parts[2], 10)
    }
  }

  if (y === null || m === null || d === null) return null
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  if (y < 1970 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null

  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

export function parseFundTable(text: string): ImportResult {
  const lines = text.trim().split('\n')
  const result: ImportResult = { rows: [], errors: [] }
  logger.info(`开始解析导入数据, 总行数: ${lines.length}`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 支持 Tab、2 个以上空格、以及中文全角空格（U+3000）作为列分隔
    const fields = line
      .split(/\t|\u3000|\s{2,}/)
      .map(f => f.trim())
      .filter(Boolean)

    if (fields.length < 9) {
      if (fields[2] === '基金简称' || fields[2]?.includes('基金简称')) continue
      // 表头行可能首列为"确认日期"、"交易日期"等，整体列数不足时跳过标题
      if (['确认日期', '交易日期', '日期', '申请日期'].some(h => (fields[0] || '').includes(h))) continue
      const err = `第 ${i + 1} 行：格式不正确，需要至少9列数据（当前仅${fields.length}列）`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    const dateRaw = fields[0]
    const fundCode = fields[1]
    const fundName = fields[2]
    const bizType = fields[3]
    const status = fields[4]
    const sharesStr = fields[5]
    const amountStr = fields[6]
    const feeStr = fields[7]
    const navStr = fields[8]

    // 规范化日期：校验 + 统一成 YYYY-MM-DD
    const date = normalizeDate(dateRaw)
    if (!date) {
      const err = `第 ${i + 1} 行：${fundName || fundCode} 日期格式异常「${dateRaw}」，支持 20260814 / 2026-08-14 / 2026/08/14 等`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    if (status !== '成功') {
      const err = `第 ${i + 1} 行：${fundName} 状态为「${status}」，跳过`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    let type: 'buy'
    if (bizType === '买基金' || bizType === '定时定额投资') {
      type = 'buy'
    } else {
      const err = `第 ${i + 1} 行：不支持的业务类型「${bizType}」，跳过`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    const shares = parseFloat(sharesStr)
    const amount = parseFloat(amountStr)
    const fee = parseFloat(feeStr || '0')
    const nav = parseFloat(navStr)

    if (isNaN(shares) || isNaN(amount) || isNaN(nav)) {
      const err = `第 ${i + 1} 行：${fundName} 数值格式异常（份额:${sharesStr} / 金额:${amountStr} / 净值:${navStr}）`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    result.rows.push({
      date,
      fundCode,
      fundName,
      type,
      shares,
      amount,
      fee,
      nav
    })
  }

  logger.info(`解析完成: 有效行 ${result.rows.length} 条, 错误 ${result.errors.length} 条`)
  return result
}