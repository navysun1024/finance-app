import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { calculateXIRR } from '../xirr'

const DAY = 24 * 60 * 60 * 1000

describe('calculateXIRR', () => {
  beforeEach(() => {
    // 固定"当前时间"，否则期末现金流取 Date.now() 导致结果不稳定
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 23, 0, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('没有买入记录时返回 0', () => {
    expect(calculateXIRR([], [], [], 10000)).toBe(0)
  })

  it('现金流方向单一时返回 0（无法求解）', () => {
    const buy = [{ date: new Date(2026, 9, 23).getTime(), amount: 0, fee: 0 }]
    expect(calculateXIRR(buy, [], [], 0)).toBe(0)
  })

  it('持有整 365 天、收益 10%，年化约 10%', () => {
    const buy = [{ date: new Date(2025, 9, 23).getTime(), amount: 10000, fee: 0 }]
    const rate = calculateXIRR(buy, [], [], 11000)
    expect(rate).toBeCloseTo(0.1, 3)
  })

  it('持有 100 天、收益 10%，年化按复利放大（约 41.5%）', () => {
    const buy = [{ date: new Date(2026, 9, 23).getTime() - 100 * DAY, amount: 10000, fee: 0 }]
    const rate = calculateXIRR(buy, [], [], 11000)
    expect(rate).toBeCloseTo(Math.pow(1.1, 365 / 100) - 1, 2)
  })

  it('分红计入现金流，年化 = 11%', () => {
    const buy = [{ date: new Date(2025, 9, 23).getTime(), amount: 10000, fee: 0 }]
    const dividend = [{ date: new Date(2026, 3, 23).getTime(), amount: 100 }]
    const rate = calculateXIRR(buy, dividend, [], 11000)
    expect(rate).toBeCloseTo(0.1105, 3)
  })

  it('部分卖出后剩余市值参与计算', () => {
    const buy = [{ date: new Date(2025, 9, 23).getTime(), amount: 10000, fee: 0 }]
    const sell = [{ date: new Date(2026, 3, 23).getTime(), amount: 4000 }]
    // 投入 10000，半年回笼 4000，期末剩余 7000；中途回笼使实际年化高于 10%
    const rate = calculateXIRR(buy, sell, [], 7000)
    expect(rate).toBeCloseTo(0.1242, 3)
  })

  it('亏损时返回负年化', () => {
    const buy = [{ date: new Date(2025, 9, 23).getTime(), amount: 10000, fee: 0 }]
    const rate = calculateXIRR(buy, [], [], 9000)
    expect(rate).toBeCloseTo(-0.1, 3)
  })

  it('总投入为 0（买入金额为 0）时不产生 NaN', () => {
    const buy = [{ date: new Date(2025, 9, 23).getTime(), amount: 0, fee: 0 }]
    const rate = calculateXIRR(buy, [], [], 100)
    expect(Number.isFinite(rate)).toBe(true)
  })
})
