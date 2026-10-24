import { describe, it, expect } from 'vitest'
import { getDateOnly, getDateStr, formatDateTime } from '../format'

describe('日期工具（本地时区口径）', () => {
  it('getDateStr 用本地时间提取日期，不受 UTC 偏移影响', () => {
    // 北京时间 2026-10-22 00:00，UTC 仍是 10-21，toISOString 会差一天
    const cstMidnight = new Date(2026, 9, 22, 0, 0, 0).getTime()
    expect(getDateStr(cstMidnight)).toBe('2026-10-22')
  })

  it('getDateStr 对当日任意时刻返回同一天', () => {
    expect(getDateStr(new Date(2026, 9, 22, 23, 59, 59).getTime())).toBe('2026-10-22')
    expect(getDateStr(new Date(2026, 9, 22, 0, 0, 1).getTime())).toBe('2026-10-22')
  })

  it('getDateOnly 归零时分秒', () => {
    const t = new Date(2026, 9, 22, 15, 30, 45).getTime()
    expect(getDateOnly(t)).toBe(new Date(2026, 9, 22, 0, 0, 0).getTime())
  })

  it('getDateOnly 幂等', () => {
    const t = new Date(2026, 9, 22, 15, 30).getTime()
    expect(getDateOnly(getDateOnly(t))).toBe(getDateOnly(t))
  })

  it('formatDateTime 输出本地时间字符串', () => {
    const s = formatDateTime(new Date(2026, 9, 22, 15, 30).getTime())
    expect(s).toContain('2026')
    expect(s).toContain('15:30')
  })
})
