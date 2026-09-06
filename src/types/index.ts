export interface Product {
  id: string
  name: string
  type: ProductType
  subType?: ProductSubType
  code: string
  note: string
  // 限购属性：单日上限 / 暂停申购 / 不限购 等，独立于备注 note
  purchaseLimit: string
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

export type ProductType = 'equity' | 'fixed_income'  | 'term_deposit'

// 产品二级属性
export type ProductSubType = '' | 'qdii_fund' | 'bond_fund' | 'bond_etf' | 'bank_wm' | 'other'

export const PRODUCT_SUB_TYPE_OPTIONS: { value: ProductSubType; label: string; applicableTypes: ProductType[] }[] = [
  { value: '', label: '未设置', applicableTypes: ['equity', 'fixed_income', 'term_deposit'] },
  { value: 'qdii_fund', label: 'QDII基金', applicableTypes: ['equity', 'fixed_income'] },
  { value: 'bond_fund', label: '债券基金', applicableTypes: ['fixed_income'] },
  { value: 'bond_etf', label: '债券ETF', applicableTypes: ['fixed_income'] },
  { value: 'bank_wm', label: '银行理财', applicableTypes: ['fixed_income'] },
  { value: 'other', label: '其他', applicableTypes: ['equity', 'fixed_income', 'term_deposit'] }
]

export type ProductStatus = 'holding' | 'closed' | 'watchlist' | 'matured'

export const PRODUCT_STATUS_OPTIONS: { value: ProductStatus; label: string; color: string }[] = [
  { value: 'holding', label: '持有', color: '#0071e3' },
  { value: 'closed', label: '清仓', color: '#8e8e93' },
  { value: 'watchlist', label: '自选', color: '#34c759' },
  { value: 'matured', label: '已到期', color: '#ff9500' }
]

export type NavSource = 'tiantian' | 'cmb' | 'icbc' | ''

export const NAV_SOURCE_OPTIONS: { value: NavSource; label: string; applicableTypes: ProductType[] }[] = [
  { value: '', label: '不查询', applicableTypes: ['equity', 'fixed_income'] },
  { value: 'tiantian', label: '东方财富', applicableTypes: ['equity', 'fixed_income'] },
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

// 净值历史（独立于 transactions，存储产品历史净值时间序列）
export interface NavHistory {
  id: string
  code: string          // 产品代码（全局唯一维度）
  date: number          // 净值日期（零点时间戳）
  nav: number           // 单位净值
  accNav?: number       // 累计净值（包含分红再投资）
  note: string          // 更新说明
  createdAt: number     // 记录创建时间
}

// 产品分红历史（独立于 transactions，存储基金公司发布的分红公告）
// 前端产品详情页"分红派息表"展示用
export interface ProductDividend {
  id: string
  code: string           // 产品代码（全局唯一维度）
  registerDate: number   // 权益登记日 timestamp
  exDate: number | null   // 除权除息日 timestamp
  payDate: number | null  // 分红发放日 timestamp
  dividendType: 'cash' | 'split'  // cash=现金分红, split=送股/转增
  perShare: number        // 每份分红(元)
  per10Shares: number     // 每10份分红(元)
  splitRatio: number | null // 送转比例（仅 split 类型有值）
  year: string            // 分红所属年份
  source: string          // 数据来源
  createdAt: number
}

// 过渡期：TransactionType 暂时保留 nav_update（后端双写期），后续清理时移除
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
