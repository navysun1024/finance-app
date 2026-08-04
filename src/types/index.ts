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
  createdAt: number
}

export type ProductType = 'equity' | 'fixed_income' | 'fund'

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
