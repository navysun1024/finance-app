export interface Product {
  id: string
  name: string
  type: ProductType
  code: string
  note: string
  holder: string
  dcaAmount: number
  dcaCycle: string
  navSource: NavSource
  holdingTerm: string
  benchmarkEnabled: boolean
  benchmarkFormula: string
  createdAt: number
  // 定期存款特有字段
  interestRate?: number
  durationMonths?: number
  minAmount?: number
  maturityDate?: string
  interestMethod?: InterestMethod
  bankName?: string
}

export interface IndexPoint {
  date: string   // "2024-01-15"
  value: number  // 指数收盘价
}

export interface BenchmarkPoint {
  date: number   // timestamp
  value: number  // 基准净值（已按产品起始净值缩放）
}

export type ProductType = 'equity' | 'fixed_income' | 'fund' | 'term_deposit'

export type ProductStatus = 'holding' | 'closed' | 'watchlist'

export const PRODUCT_STATUS_OPTIONS: { value: ProductStatus; label: string; color: string }[] = [
  { value: 'holding', label: '持有', color: '#0071e3' },
  { value: 'closed', label: '清仓', color: '#8e8e93' },
  { value: 'watchlist', label: '自选', color: '#34c759' }
]

export type NavSource = 'tiantian' | 'cmb' | 'icbc' | ''

export const NAV_SOURCE_OPTIONS: { value: NavSource; label: string; applicableTypes: ProductType[] }[] = [
  { value: '', label: '不查询', applicableTypes: ['equity', 'fund', 'fixed_income'] },
  { value: 'tiantian', label: '天天基金网', applicableTypes: ['equity', 'fund', 'fixed_income'] },
  { value: 'cmb', label: '招银理财', applicableTypes: ['fixed_income'] },
  { value: 'icbc', label: '工银理财', applicableTypes: ['fixed_income'] }
]

export type DcaCycle = '' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

export const DCA_CYCLE_OPTIONS: { value: DcaCycle; label: string }[] = [
  { value: '', label: '不定投' },
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'biweekly', label: '每两周' },
  { value: 'monthly', label: '每月' }
]

export type TransactionType = 'buy' | 'sell' | 'dividend' | 'nav_update'

export interface Transaction {
  id: string
  productId: string
  type: TransactionType
  date: number
  amount: number
  price: number
  shares: number
  fee: number
  note: string
}

export interface Position {
  productId: string
  product: Product
  totalInvestment: number
  totalShares: number
  avgCost: number
  currentNav: number
  marketValue: number
  profit: number
  profitRate: number
  annualRate: number
  holdingDays: number
  lastNavUpdateDate: number
  transactions: Transaction[]
}

export interface PortfolioSummary {
  totalAssets: number
  totalInvestment: number
  totalProfit: number
  totalProfitRate: number
  totalAnnualRate: number
  positions: Position[]
}

export interface ProductTypeOption {
  value: ProductType
  label: string
  color: string
}

export interface TransactionTypeOption {
  value: TransactionType
  label: string
  color: string
}

// 定期存款相关类型
export type InterestMethod = 'maturity' | 'monthly' | 'quarterly'

export const INTEREST_METHOD_OPTIONS: { value: InterestMethod; label: string }[] = [
  { value: 'maturity', label: '到期付息' },
  { value: 'monthly', label: '按月付息' },
  { value: 'quarterly', label: '按季付息' }
]

export const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: '3个月' },
  { value: 6, label: '6个月' },
  { value: 12, label: '1年' },
  { value: 24, label: '2年' },
  { value: 36, label: '3年' },
  { value: 60, label: '5年' }
]
