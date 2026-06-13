interface CashFlow {
  date: Date
  amount: number
}

function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000
  return Math.round(Math.abs((date2.getTime() - date1.getTime()) / oneDay))
}

function xirr(cashFlows: CashFlow[], guess: number = 0.1): number {
  const maxIterations = 100
  const tolerance = 0.0001
  
  if (cashFlows.length < 2) return 0
  
  const firstDate = cashFlows[0].date
  let rate = guess
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0
    let dnpv = 0
    
    for (const cf of cashFlows) {
      const days = daysBetween(firstDate, cf.date)
      const factor = Math.pow(1 + rate, days / 365)
      npv += cf.amount / factor
      dnpv -= (cf.amount * days / 365) / (factor * (1 + rate))
    }
    
    if (Math.abs(npv) < tolerance) {
      return rate
    }
    
    if (Math.abs(dnpv) < 1e-10) {
      break
    }
    
    rate = rate - npv / dnpv
    
    if (rate < -0.99) rate = -0.99
    if (rate > 10) rate = 10
  }
  
  return rate
}

export function calculateXIRR(
  buyTransactions: { date: number; amount: number; fee: number }[],
  sellTransactions: { date: number; amount: number }[],
  dividendTransactions: { date: number; amount: number }[],
  currentMarketValue: number
): number {
  if (buyTransactions.length === 0) return 0
  
  const cashFlows: CashFlow[] = []
  
  for (const t of buyTransactions) {
    cashFlows.push({
      date: new Date(t.date),
      amount: -(t.amount + t.fee)
    })
  }
  
  for (const t of sellTransactions) {
    cashFlows.push({
      date: new Date(t.date),
      amount: t.amount
    })
  }
  
  for (const t of dividendTransactions) {
    cashFlows.push({
      date: new Date(t.date),
      amount: t.amount
    })
  }
  
  cashFlows.push({
    date: new Date(),
    amount: currentMarketValue
  })
  
  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())
  
  const hasPositive = cashFlows.some(cf => cf.amount > 0)
  const hasNegative = cashFlows.some(cf => cf.amount < 0)
  
  if (!hasPositive || !hasNegative) {
    return 0
  }
  
  const rate = xirr(cashFlows)
  
  return rate
}
