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

export function parseFundTable(text: string): ImportResult {
  const lines = text.trim().split('\n')
  const result: ImportResult = { rows: [], errors: [] }
  logger.info(`开始解析导入数据, 总行数: ${lines.length}`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = line.split(/\s{2,}|\t/).map(f => f.trim()).filter(Boolean)

    if (fields.length < 9) {
      if (fields[2] === '基金简称' || fields[2]?.includes('基金简称')) continue
      const err = `第 ${i + 1} 行：格式不正确，需要至少9列数据`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    const dateStr = fields[0]
    const fundCode = fields[1]
    const fundName = fields[2]
    const bizType = fields[3]
    const status = fields[4]
    const sharesStr = fields[5]
    const amountStr = fields[6]
    const feeStr = fields[7]
    const navStr = fields[8]

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
      const err = `第 ${i + 1} 行：${fundName} 数值格式异常`
      logger.warn(err)
      result.errors.push(err)
      continue
    }

    result.rows.push({
      date: dateStr,
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