import { computed, ref } from 'vue';
import type { Product, Transaction, Position, PortfolioSummary, ProductType, TransactionType, InterestMethod, NavHistory, ProductDividend, ProductSubType } from '@/types';
import { getProducts, saveProducts, getTransactions, generateId, addTransactionToServer, updateTransactionOnServer, deleteTransactionFromServer, getNavHistory, getProductDividends, deleteNavHistoryRecord, deleteProductDividendRecord } from '@/utils/storage';
import { calculateXIRR } from '@/utils/xirr';
import { getDateStr } from '@/utils/format';
export const PRODUCT_TYPE_OPTIONS: {
 value: ProductType;
 label: string;
 color: string;
}[] = [
 { value: 'equity', label: '权益', color: '#3b82f6' },
 { value: 'fixed_income', label: '固收理财', color: '#8b5cf6' },
 { value: 'term_deposit', label: '定期存款', color: '#f59e0b' }
];
export const TRANSACTION_TYPE_OPTIONS: {
 value: TransactionType;
 label: string;
 color: string;
}[] = [
 { value: 'buy', label: '买入', color: '#10b981' },
 { value: 'sell', label: '卖出', color: '#ef4444' },
 { value: 'dividend', label: '分红', color: '#f59e0b' }
];
// nav_update 已迁移到 nav_history 表，transactions 只存 buy/sell/dividend
const products = ref<Product[]>([])
const transactions = ref<Transaction[]>([])
const navHistory = ref<NavHistory[]>([])
const productDividends = ref<ProductDividend[]>([])
const isLoading = ref(false)
const transactionsByProductId = ref<Map<string, Transaction[]>>(new Map())
const navHistoryByProductId = ref<Map<string, NavHistory[]>>(new Map())
const productDividendsByProductId = ref<Map<string, ProductDividend[]>>(new Map())
let initPromise: Promise<void> | null = null

function buildTransactionMap(txs: Transaction[]) {
  const map = new Map<string, Transaction[]>()
  for (const t of txs) {
    const list = map.get(t.productId)
    if (list) {
      list.push(t)
    } else {
      map.set(t.productId, [t])
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.date - b.date)
  }
  transactionsByProductId.value = map
}

function buildNavHistoryMap(navs: NavHistory[], prods: Product[] = []) {
  // 先建 code → productId 反向映射
  const codeToPid = new Map<string, string>()
  for (const p of prods) {
    if (p.code) codeToPid.set(p.code, p.id)
  }
  const map = new Map<string, NavHistory[]>()
  for (const n of navs) {
    const pid = codeToPid.get(n.code)
    if (!pid) continue  // 没有匹配的产品（可能是已删除产品的残留）
    const list = map.get(pid)
    if (list) {
      list.push(n)
    } else {
      map.set(pid, [n])
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.date - b.date)
  }
  navHistoryByProductId.value = map
}

function buildProductDividendsMap(pds: ProductDividend[], prods: Product[] = []) {
  const codeToPid = new Map<string, string>()
  for (const p of prods) {
    if (p.code) codeToPid.set(p.code, p.id)
  }
  const map = new Map<string, ProductDividend[]>()
  for (const pd of pds) {
    const pid = codeToPid.get(pd.code)
    if (!pid) continue
    const list = map.get(pid)
    if (list) {
      list.push(pd)
    } else {
      map.set(pid, [pd])
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.registerDate - a.registerDate)
  }
  productDividendsByProductId.value = map
}

type DisplaySettings = { showProfitAmount: boolean; showProfitRate: boolean; showMarketValue: boolean; showCost: boolean }

// 每个页面的独立显示控制
const dashboardSettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })
const equitySettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })
const fixedIncomeSettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })
const termDepositSettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })

const loadDisplaySettings = () => {
  try {
    const saved = localStorage.getItem('displaySettings')
    if (saved) {
      const settings = JSON.parse(saved)
      // showProfitRate 不再参与隐藏切换，强制为 true（收益率始终显示）
      if (settings.dashboard) dashboardSettings.value = { ...dashboardSettings.value, ...settings.dashboard, showProfitRate: true }
      if (settings.equity) equitySettings.value = { ...equitySettings.value, ...settings.equity, showProfitRate: true }
      if (settings.fixedIncome) fixedIncomeSettings.value = { ...fixedIncomeSettings.value, ...settings.fixedIncome, showProfitRate: true }
      if (settings.termDeposit) termDepositSettings.value = { ...termDepositSettings.value, ...settings.termDeposit, showProfitRate: true }
    }
  } catch {
    // 保持默认值
  }
}

const saveDisplaySettings = () => {
  // showProfitRate 不再需要持久化（始终为 true）
  const stripRate = (s: DisplaySettings) => ({ ...s, showProfitRate: true })
  localStorage.setItem('displaySettings', JSON.stringify({
    dashboard: stripRate(dashboardSettings.value),
    equity: stripRate(equitySettings.value),
    fixedIncome: stripRate(fixedIncomeSettings.value),
    termDeposit: stripRate(termDepositSettings.value)
  }))
}

loadDisplaySettings();

async function ensureDataLoaded() {
 if (products.value.length === 0 && transactions.value.length === 0 && !initPromise) {
 initPromise = (async () => {
 isLoading.value = true;
 try {
  const [nextProducts, nextTransactions, nextNavHistory, nextPD] = await Promise.all([getProducts(), getTransactions(), getNavHistory(), getProductDividends()])
  products.value = nextProducts
  transactions.value = nextTransactions
  navHistory.value = nextNavHistory
  productDividends.value = nextPD
  buildTransactionMap(nextTransactions)
  buildNavHistoryMap(nextNavHistory, products.value)
  buildProductDividendsMap(nextPD, products.value)
 } finally {
  isLoading.value = false;
 }
 })();
 }
 if (initPromise) await initPromise;
}

export async function initFinance() {
 await ensureDataLoaded();
}

// ==================== 统一 refresh（带防抖 + 并发保护） ====================
// 模块级单例，所有调用者（Dashboard/Products/autoRefresh/Visibility）共用
let lastRefreshAt = 0
const MIN_REFRESH_GAP = 30 * 1000       // 两次 refresh 最小间隔，避免抖动
let refreshInFlight: Promise<void> | null = null

const refreshInternal = async () => {
  const [nextProducts, nextTransactions, nextNavHistory, nextPD] = await Promise.all([getProducts(), getTransactions(), getNavHistory(), getProductDividends()])
  products.value = nextProducts
  transactions.value = nextTransactions
  navHistory.value = nextNavHistory
  productDividends.value = nextPD
  buildTransactionMap(nextTransactions)
  buildNavHistoryMap(nextNavHistory, products.value)
  buildProductDividendsMap(nextPD, products.value)
}

/** 受控 refresh：30 秒内重复调用自动跳过（页面切换、定时刷新等场景） */
const refresh = async () => {
  // 并发保护
  if (refreshInFlight) return refreshInFlight
  const now = Date.now()
  // 防抖：30 秒内已刷新过就跳过（首次 lastRefreshAt=0 会放行）
  if (lastRefreshAt > 0 && now - lastRefreshAt < MIN_REFRESH_GAP) return

  refreshInFlight = (async () => {
    try {
      await refreshInternal()
      lastRefreshAt = Date.now()
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** 强制 refresh：绕过防抖（用户手动点刷新按钮、数据变更后） */
const forceRefresh = async () => {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      await refreshInternal()
      lastRefreshAt = Date.now()
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// ==================== 定时自动刷新 ====================
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
const REFRESH_INTERVAL = 5 * 60 * 1000  // 5 分钟，对齐后台每小时更新节奏

function startAutoRefresh() {
  if (autoRefreshTimer) return  // 已启动

  autoRefreshTimer = setInterval(refresh, REFRESH_INTERVAL)

  // 页面从后台切回前台时主动刷一次（refresh 内部会做防抖）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh()
    }
  })
}

export function useFinance() {
 // 自动初始化：首次调用时若数据为空则加载
 ensureDataLoaded();

 // 首次使用 useFinance 时启动自动刷新
 startAutoRefresh()
 const addProduct = async (name: string, type: ProductType, note: string = '', code: string = '', holder: string = '', dcaAmount: number = 0, dcaCycle: string = '', navSource: string = '', holdingTerm: string = '', benchmarkEnabled: boolean = false, benchmarkFormula: string = '', interestRate: number = 0, durationMonths: number = 0, minAmount: number = 0, maturityDate: string = '', interestMethod: InterestMethod | '' = '', bankName: string = '', purchaseLimit: string = '', subType: ProductSubType = '') => {
 const product: Product = {
  id: generateId(),
  name,
  type,
  subType,
  code,
  note,
  purchaseLimit,
  holder,
 dcaAmount,
 dcaCycle,
 navSource: navSource as Product['navSource'],
 holdingTerm,
 benchmarkEnabled,
 benchmarkFormula,
 createdAt: Date.now(),
 interestRate,
 durationMonths,
 minAmount,
 maturityDate,
 interestMethod: interestMethod || undefined,
 bankName
 };
 products.value.push(product);
 await saveProducts(products.value);
 return product;
 };
 const updateProduct = async (id: string, name: string, type: ProductType, note: string = '', code: string = '', holder: string = '', dcaAmount: number = 0, dcaCycle: string = '', navSource: string = '', holdingTerm: string = '', benchmarkEnabled: boolean = false, benchmarkFormula: string = '', interestRate: number = 0, durationMonths: number = 0, minAmount: number = 0, maturityDate: string = '', interestMethod: InterestMethod | '' = '', bankName: string = '', purchaseLimit: string = '', subType: ProductSubType = '') => {
 const index = products.value.findIndex(p => p.id === id);
 if (index !== -1) {
 products.value[index] = {
 ...products.value[index],
 name,
 type,
 subType,
 code,
 note,
 holder,
 dcaAmount,
 dcaCycle,
 navSource: navSource as Product['navSource'],
 holdingTerm,
 benchmarkEnabled,
 benchmarkFormula,
 interestRate,
 durationMonths,
 minAmount,
 maturityDate,
 interestMethod: interestMethod || undefined,
 bankName,
 purchaseLimit
 };
 await saveProducts(products.value);
 }
 };
 const deleteProduct = async (id: string) => {
  const txsToDelete = transactions.value.filter(t => t.productId === id);
  products.value = products.value.filter(p => p.id !== id);
  transactions.value = transactions.value.filter(t => t.productId !== id);
  buildTransactionMap(transactions.value)
  await saveProducts(products.value);
  for (const tx of txsToDelete) {
    await deleteTransactionFromServer(tx.id).catch(() => {});
  }
 };
 const updateProductPurchaseLimit = async (id: string, purchaseLimit: string) => {
  // 残留旧限购信息从备注 note 中移除，避免重复/混杂
  let changed = false
  const next = products.value.map(p => {
    if (p.id !== id) return p
    const { note, ...rest } = p
    const cleaned = note.split('\n').filter(line => !/^(限购:|单日上限|不限购$|暂停申购$)/.test(line.trim())).join('\n').trim()
    if (rest.purchaseLimit === purchaseLimit && cleaned === note) return p
    changed = true
    return { ...rest, note: cleaned, purchaseLimit }
  })
  if (changed) {
    products.value = next
    await saveProducts(products.value)
  }
 };
 const addTransaction = async (productId: string, type: TransactionType, date: number, amount: number, price: number, shares: number, fee: number = 0, note: string = '') => {
 const transaction: Transaction = {
 id: generateId(),
 productId,
 type,
 date,
 amount,
 price,
 shares,
 fee,
 note
 };
 transactions.value.push(transaction);
 buildTransactionMap(transactions.value)
 await addTransactionToServer(transaction);
 return transaction;
 };
 const updateTransaction = async (id: string, productId: string, type: TransactionType, date: number, amount: number, price: number, shares: number, fee: number = 0, note: string = '') => {
 const index = transactions.value.findIndex(t => t.id === id);
 if (index !== -1) {
 transactions.value[index] = {
 ...transactions.value[index],
 productId,
 type,
 date,
 amount,
 price,
 shares,
 fee,
 note
 };
 await updateTransactionOnServer(transactions.value[index]);
 buildTransactionMap(transactions.value)
 }
 };
 const deleteTransaction = async (id: string) => {
 transactions.value = transactions.value.filter(t => t.id !== id);
 buildTransactionMap(transactions.value)
 await deleteTransactionFromServer(id);
 };
 // 删除单条净值记录
 const deleteNavHistoryItem = async (id: string) => {
 navHistory.value = navHistory.value.filter(n => n.id !== id);
 // 重新构建所有产品的 navHistoryMap
 const productCodes = new Set(products.value.filter(p => p.code).map(p => p.code!));
 const filteredNav = navHistory.value.filter(n => productCodes.has(n.code));
 buildNavHistoryMap(filteredNav, products.value);
 await deleteNavHistoryRecord(id);
 };
 // 删除单条分红记录
 const deleteProductDividend = async (id: string) => {
 productDividends.value = productDividends.value.filter(pd => pd.id !== id);
 // 重新构建所有产品的 productDividendsMap
 const productCodes = new Set(products.value.filter(p => p.code).map(p => p.code!));
 const filteredPD = productDividends.value.filter(pd => productCodes.has(pd.code));
 buildProductDividendsMap(filteredPD, products.value);
 await deleteProductDividendRecord(id);
 };
 const getProductById = (id: string): Product | undefined => {
 return products.value.find(p => p.id === id);
 };
 const getTransactionsByProductId = (productId: string): Transaction[] => {
 const list = transactionsByProductId.value.get(productId)
 return list ? [...list] : []
 };
 const getNavHistoryByProductId = (productId: string): NavHistory[] => {
 const list = navHistoryByProductId.value.get(productId)
 return list ? [...list] : []
 };
 // 获取产品最新净值（统一从 navHistory 表取）
 const getLatestNavAndDate = (productId: string): { nav: number; date: number } => {
 const navList = navHistoryByProductId.value.get(productId)
 if (navList && navList.length > 0) {
 const last = navList[navList.length - 1]
 return { nav: last.nav, date: last.date }
 }
 return { nav: 1, date: 0 }
 };
 // 获取产品的分红历史列表（基金公司公告，按登记日倒序）
 const getProductDividendsByProduct = (productId: string): ProductDividend[] => {
  const list = productDividendsByProductId.value.get(productId)
  return list ? [...list] : []
 };
 const calculatePosition = (product: Product): Position => {
 const productTransactions = getTransactionsByProductId(product.id);
 let totalInvestment = 0;
 let totalShares = 0;
 let avgCost = 0;
 let currentNav = 1;
 let remainingShares = 0;
 let firstBuyDate = 0;
 let lastSellDate = 0;
 let lastNavUpdateDate = 0;
 const buyTransactions: Transaction[] = [];
 const sellTransactions: Transaction[] = [];
 const dividendTransactions: Transaction[] = [];
 for (const t of productTransactions) {
 if (t.type === 'buy') {
 buyTransactions.push(t);
 // amount 已包含手续费（amount = 份额 × 净值 + 手续费），不再重复加 fee
 totalInvestment += t.amount;
 totalShares += t.shares;
 if (firstBuyDate === 0 || t.date < firstBuyDate) {
 firstBuyDate = t.date;
 }
 }
 else if (t.type === 'sell') {
 sellTransactions.push(t);
 remainingShares -= t.shares;
 if (t.date > lastSellDate) {
  lastSellDate = t.date;
 }
 }
 else if (t.type === 'dividend') {
 dividendTransactions.push(t);
 }
 }
 // 从 navHistory 获取最新净值
 const latestNavInfo = getLatestNavAndDate(product.id)
 currentNav = latestNavInfo.nav
 lastNavUpdateDate = latestNavInfo.date
 let cumulativeCostBasis = 0;
 let cumulativeShares = 0;
 for (const t of buyTransactions) {
 // amount 已包含手续费，不再重复加 fee
 cumulativeCostBasis += t.amount;
 cumulativeShares += t.shares;
 if (cumulativeShares > 0) {
 avgCost = cumulativeCostBasis / cumulativeShares;
 }
 }
 remainingShares = cumulativeShares;
 let realizedProfit = 0;
 let totalDividend = 0;
 for (const t of productTransactions) {
 if (t.type === 'sell') {
 remainingShares -= t.shares;
 // 卖出的 amount 为份额×净值，未扣手续费，已实现盈亏需减去卖出费用
 realizedProfit += t.amount - (t.fee || 0) - t.shares * avgCost;
 } else if (t.type === 'dividend') {
 totalDividend += t.amount;
 }
 }
 // 处理因卖出份额精度截断产生的极小残留份额（< 0.01），视为完全清仓
 if (remainingShares > 0 && remainingShares < 0.01) {
 remainingShares = 0;
 }

 // 定期存款特殊计算
 if (product.type === 'term_deposit') {
 // 如果没有交易记录，使用起存金额作为默认本金
 const hasTransactions = cumulativeCostBasis > 0;
 const principal = hasTransactions ? cumulativeCostBasis : (product.minAmount || 0); // 本金
 const interestRate = (product.interestRate || 0) / 100; // 年利率
 
 // 计算起始日期：
 // 1. 如果有交易记录，使用交易记录的首次买入日期
 // 2. 如果没有交易记录，使用：到期日期 - 存款期限
 // 3. 如果没有到期日期，使用创建日期
 let startDate = firstBuyDate;
 if (!hasTransactions) {
 if (product.maturityDate && product.durationMonths) {
 // 到期日期 - 存款期限 = 起始日期（按月份精算，避免 30 天/月 简化带来的大小月、闰年误差）
 const startDateObj = new Date(product.maturityDate);
 startDateObj.setMonth(startDateObj.getMonth() - product.durationMonths);
 startDate = startDateObj.getTime();
 } else {
 startDate = product.createdAt || Date.now();
 }
 }
 
 // 判断是否到期
 let maturityTime = 0;
 if (product.maturityDate) {
 maturityTime = new Date(product.maturityDate).getTime();
 }
 const isMatured = maturityTime > 0 && Date.now() > maturityTime;

 // 到期后停止计算收益，清仓后也停止
 const isCleared = remainingShares === 0;
 let endDate = Date.now();
 if (isMatured) {
  endDate = maturityTime;
 } else if (isCleared && lastSellDate > 0) {
  endDate = lastSellDate;
 }
 const holdingDays = startDate > 0 ? Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))) : 0;
 // 已到期且有明确存款期限时按整存期计息（整存整取规则），未到期时按实际持有天数计息
 const yearsElapsed = isMatured && product.durationMonths
  ? product.durationMonths / 12
  : holdingDays / 365;

 // 已支取（卖出）的本金部分，避免利息重复计算
 let withdrawnPrincipal = 0;
 if (hasTransactions) {
  for (const t of productTransactions) {
   if (t.type === 'sell') {
    withdrawnPrincipal += t.shares * avgCost;
   }
  }
 }
 const remainingPrincipal = Math.max(0, principal - withdrawnPrincipal); // 剩余本金

 // 利息基于剩余本金计算（到期后不再增加）
 const totalInterest = remainingPrincipal * interestRate * yearsElapsed;
 const marketValue = Math.round((remainingPrincipal + totalInterest) * 100) / 100; // 市值 = 剩余本金 + 利息
 // 已支取的收益已计入 realizedProfit，不再重复计算
 const profit = Math.round(totalInterest * 100) / 100 + totalDividend + realizedProfit;
 const profitRate = principal > 0 ? (profit / principal) * 100 : 0;
 const annualRate = product.interestRate || 0;
 const currentNav = remainingPrincipal > 0 ? (remainingPrincipal + totalInterest) / remainingPrincipal : 1; // 相当于净值
 const effectiveShares = hasTransactions ? Math.max(remainingShares, 0) : 1;

 return {
 productId: product.id,
 product,
 totalInvestment: principal,
 totalShares: effectiveShares,
 avgCost: principal > 0 && effectiveShares > 0 ? principal / effectiveShares : 0,
 currentNav,
 marketValue,
 profit,
 profitRate,
 annualRate,
 holdingDays,
 lastSellDate,
 lastNavUpdateDate: startDate,
 transactions: productTransactions
 };
 }

 const marketValue = Math.round(remainingShares * currentNav * 100) / 100;
 const unrealizedProfit = marketValue - (remainingShares * avgCost);
 const profit = unrealizedProfit + realizedProfit + totalDividend;
 // 收益率与持仓收益保持同一口径：累计收益（含已实现盈亏与分红）÷ 累计总投入
 const profitRate = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
 // 已清仓产品的持有天数在最后一次卖出后不再增加
 const holdingEndDate = remainingShares === 0 && lastSellDate > 0 ? lastSellDate : Date.now();
 const holdingDays = firstBuyDate > 0 ? Math.max(1, Math.ceil((holdingEndDate - firstBuyDate) / (1000 * 60 * 60 * 24))) : 0;
 const xirrRate = calculateXIRR(
 buyTransactions.map(t => ({ date: t.date, amount: t.amount, fee: t.fee })),
 sellTransactions.map(t => ({ date: t.date, amount: t.amount - (t.fee || 0) })),
 dividendTransactions.map(t => ({ date: t.date, amount: t.amount })),
 marketValue
 );
 const annualRate = xirrRate * 100;
 return {
 productId: product.id,
 product,
 totalInvestment,
 totalShares: remainingShares,
 avgCost,
 currentNav,
 marketValue,
 profit,
 profitRate,
 annualRate,
 holdingDays,
 lastSellDate,
 lastNavUpdateDate,
 transactions: productTransactions
 };
 };
 const portfolioSummary = computed<PortfolioSummary>(() => {
 const positions = products.value.map(p => calculatePosition(p)).filter(p => p.totalShares > 0);
 const totalAssets = positions.reduce((sum, p) => sum + p.marketValue, 0);
 const totalInvestment = positions.reduce((sum: number, p: Position) => {
 return sum + p.totalInvestment;
 }, 0);
 const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);
 const totalProfitRate = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;

 const buyTransactions = transactions.value.filter(t => t.type === 'buy').map(t => ({
 date: t.date,
 amount: t.amount,
 fee: t.fee
 }));
 const sellTransactions = transactions.value.filter(t => t.type === 'sell').map(t => ({
 date: t.date,
 amount: t.amount - (t.fee || 0)
 }));
 const dividendTransactions = transactions.value.filter(t => t.type === 'dividend').map(t => ({
 date: t.date,
 amount: t.amount
 }));

 const totalAnnualRate = calculateXIRR(buyTransactions, sellTransactions, dividendTransactions, totalAssets) * 100;
 return {
 totalAssets,
 totalInvestment,
 totalProfit,
 totalProfitRate,
 totalAnnualRate,
 positions
 };
});
 const getPositionById = (productId: string): Position | undefined => {
 const product = getProductById(productId);
 return product ? calculatePosition(product) : undefined;
 };

// ==================== 持仓状态工具（getProfitHistory / getMarketValueHistory 共用）====================

/** 交易索引：按日期字符串分组 */
function buildTxDateIndex(txList: Transaction[]): Map<string, Transaction[]> {
  const idx = new Map<string, Transaction[]>()
  for (const t of txList) {
    const ds = getDateStr(t.date)
    if (!idx.has(ds)) idx.set(ds, [])
    idx.get(ds)!.push(t)
  }
  return idx
}

/** 净值索引：按日期字符串映射（同日多记录保留最后一条） */
function buildNavDateIndex(navList: NavHistory[]): Map<string, NavHistory> {
  const idx = new Map<string, NavHistory>()
  for (const n of navList) {
    idx.set(getDateStr(n.date), n)
  }
  return idx
}

/** 应用一组 buy/sell 交易，更新 shares 和 avgCost（忽略 dividend） */
function applyBuySell(
  txs: Transaction[],
  shares: number,
  avgCost: number
): { shares: number; avgCost: number } {
  for (const t of txs) {
    if (t.type === 'buy') {
      const newShares = shares + t.shares
      avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0
      shares = newShares
    } else if (t.type === 'sell') {
      shares = Math.max(0, shares - t.shares)
    }
  }
  return { shares, avgCost }
}

/** 计算窗口前的 shares / avgCost / currentNav 初始状态 */
function calcPrefixState(
  txList: Transaction[],
  navList: NavHistory[],
  windowStartStr: string,
  txByDate: Map<string, Transaction[]>,
  navByDate: Map<string, NavHistory>
): { shares: number; avgCost: number; currentNav: number; hasSeenNav: boolean } {
  let shares = 0
  let avgCost = 0
  let currentNav = 1
  let hasSeenNav = false

  const allDates = new Set<string>()
  for (const t of txList) allDates.add(getDateStr(t.date))
  for (const n of navList) allDates.add(getDateStr(n.date))

  for (const ds of [...allDates].sort()) {
    if (ds >= windowStartStr) break
    const txs = txByDate.get(ds)
    if (txs) {
      const r = applyBuySell(txs, shares, avgCost)
      shares = r.shares
      avgCost = r.avgCost
    }
    const nav = navByDate.get(ds)
    if (nav) {
      currentNav = nav.nav
      hasSeenNav = true
    }
  }

  if (!hasSeenNav && avgCost > 0) currentNav = avgCost
  return { shares, avgCost, currentNav, hasSeenNav }
}

const getProfitHistory = (days: number = 30): {
  date: string;
  profit: number;
  productProfits: { productId: string; productName: string; profit: number }[];
}[] => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const windowStart = todayStart - (days - 1) * 86400000;
  const windowStartStr = getDateStr(windowStart);

  const productDailyProfits: Map<string, Map<string, number>> = new Map();

  for (const product of products.value) {
    const txList = getTransactionsByProductId(product.id);
    const navList = getNavHistoryByProductId(product.id);
    const productNavList = [...navList].sort((a, b) => a.date - b.date)
    if (txList.length === 0 && productNavList.length === 0) continue;

    const txByDate = buildTxDateIndex(txList);
    const navByDate = buildNavDateIndex(productNavList);

    const prefix = calcPrefixState(txList, productNavList, windowStartStr, txByDate, navByDate);
    let shares = prefix.shares;
    let avgCost = prefix.avgCost;
    let currentNav = prefix.currentNav;
    let hasNavByPreviousDay = prefix.hasSeenNav;

    const dailyProfits: Map<string, number> = new Map();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getDateStr(date.getTime());

      let dailyProfit = 0;
      const navBefore = currentNav;

      // 先处理当日交易
      for (const t of txByDate.get(dateStr) || []) {
        if (t.type === 'buy') {
          const newShares = shares + t.shares;
          avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
          shares = newShares;
          if (currentNav === 1 && avgCost > 0) currentNav = avgCost;
        } else if (t.type === 'sell') {
          shares = Math.max(0, shares - t.shares);
        } else if (t.type === 'dividend') {
          dailyProfit += t.amount;
        }
      }

      // 后处理当日净值
      const navToday = navByDate.get(dateStr);
      let navChanged = false;
      if (navToday) {
        currentNav = navToday.nav;
        navChanged = true;
      }

      if (hasNavByPreviousDay) {
        dailyProfit += (currentNav - navBefore) * shares;
      }
      if (navChanged) hasNavByPreviousDay = true;

      if (Math.abs(dailyProfit) > 0.01) {
        dailyProfits.set(dateStr, Math.round(dailyProfit * 100) / 100);
      }
    }

    if (dailyProfits.size > 0) {
      productDailyProfits.set(product.id, dailyProfits);
    }
  }

  const history: {
    date: string;
    profit: number;
    productProfits: { productId: string; productName: string; profit: number }[];
  }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = getDateStr(date.getTime());

    let totalProfit = 0;
    const productProfits: { productId: string; productName: string; profit: number }[] = [];

    for (const product of products.value) {
      const dailyProfits = productDailyProfits.get(product.id);
      if (!dailyProfits) continue;

      const profit = dailyProfits.get(dateStr);
      if (profit !== undefined && profit !== 0) {
        productProfits.push({
          productId: product.id,
          productName: product.name,
          profit
        });
        totalProfit += profit;
      }
    }

    history.push({
      date: dateStr,
      profit: Math.round(totalProfit * 100) / 100,
      productProfits
    });
  }

  return history;
};

// 获取市值历史（每天每个产品的 shares * nav）
const getMarketValueHistory = (days: number = 365): {
  date: string;
  marketValues: { productId: string; productName: string; marketValue: number }[];
}[] => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const windowStart = todayStart - (days - 1) * 86400000;
  const windowStartStr = getDateStr(windowStart);

  const productDailyValues: Map<string, Map<string, number>> = new Map();

  for (const product of products.value) {
    const txList = getTransactionsByProductId(product.id);
    const navList = getNavHistoryByProductId(product.id);
    const productNavList = [...navList].sort((a, b) => a.date - b.date);
    if (txList.length === 0 && productNavList.length === 0) continue;

    const txByDate = buildTxDateIndex(txList);
    const navByDate = buildNavDateIndex(productNavList);

    const prefix = calcPrefixState(txList, productNavList, windowStartStr, txByDate, navByDate);
    let shares = prefix.shares;
    let avgCost = prefix.avgCost;
    let currentNav = prefix.currentNav;
    if (!navByDate.has(windowStartStr) && avgCost > 0) currentNav = avgCost;

    const dailyVals: Map<string, number> = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getDateStr(date.getTime());

      // 先处理当日交易
      for (const t of txByDate.get(dateStr) || []) {
        if (t.type === 'buy') {
          const newShares = shares + t.shares;
          avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
          shares = newShares;
          if (currentNav === 1 && avgCost > 0) currentNav = avgCost;
        } else if (t.type === 'sell') {
          shares = Math.max(0, shares - t.shares);
        }
      }
      // 后处理当日净值
      const nav = navByDate.get(dateStr);
      if (nav) currentNav = nav.nav;

      if (shares > 0 && currentNav > 0) {
        dailyVals.set(dateStr, Math.round(shares * currentNav * 100) / 100);
      }
    }

    if (dailyVals.size > 0) {
      productDailyValues.set(product.id, dailyVals);
    }
  }

  const history: {
    date: string;
    marketValues: { productId: string; productName: string; marketValue: number }[];
  }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = getDateStr(date.getTime());

    const marketValues: { productId: string; productName: string; marketValue: number }[] = [];

    for (const product of products.value) {
      const dailyMap = productDailyValues.get(product.id);
      if (!dailyMap) continue;
      const val = dailyMap.get(dateStr);
      if (val !== undefined) {
        marketValues.push({ productId: product.id, productName: product.name, marketValue: val });
      }
    }

    if (marketValues.length > 0) {
      history.push({ date: dateStr, marketValues });
    }
  }

  return history;
};

// ==================== 当日收益率/收益计算（Dashboard 和 Products 共用）====================

/**
 * 产品当日收益率 Map: code → { dailyReturn, date }
 * 从最新两条 nav_history 记录计算涨跌幅
 */
const dailyReturnMap = computed(() => {
  const map = new Map<string, { dailyReturn: number | null; date: string }>()
  for (const product of products.value) {
    if (product.type === 'term_deposit') continue  // 定存无净值收益率
    if (!product.code) continue
    // 复制后再排序，避免原地修改 navHistoryByProductId 中共享的升序数组
    const navList = [...getNavHistoryByProductId(product.id)].sort((a, b) => b.date - a.date)
    if (navList.length < 2) {
      if (navList.length === 1) {
        const d = new Date(navList[0].date)
        const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        map.set(product.code, { dailyReturn: null, date: dateStr })
      }
      continue
    }
    const latest = navList[0]
    const prev = navList[1]
    // 除息日净值会因分红下跌：把相邻净值区间内的每份分红加回，避免显示成假亏损
    let dividendPerShare = 0
    for (const d of getProductDividendsByProduct(product.id)) {
      if (d.registerDate > prev.date && d.registerDate <= latest.date) {
        dividendPerShare += d.perShare
      }
    }
    const dailyReturn = prev.nav > 0
      ? Math.round((((latest.nav + dividendPerShare) - prev.nav) / prev.nav) * 10000) / 100
      : null
    const d = new Date(latest.date)
    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map.set(product.code, { dailyReturn, date: dateStr })
  }
  return map
})

/**
 * 统一的当日收益计算函数
 * @param product 产品
 * @param marketValue 当前市值
 * @param principal 本金（定期存款用）
 * @returns 当日收益金额（元），无数据时返回 null
 */
const calcDailyProfit = (
  product: Product,
  marketValue: number,
  principal?: number
): number | null => {
  if (!marketValue && product.type !== 'term_deposit') return null

  // 定期存款：本金 × 年利率 / 365（到期后 0）
  if (product.type === 'term_deposit') {
    if (product.maturityDate) {
      const maturityTime = new Date(product.maturityDate).getTime()
      if (Date.now() > maturityTime) return 0
    }
    const annualRate = (product.interestRate || 0) / 100
    const p = principal || product.minAmount || 0
    if (!p) return null
    return p * annualRate / 365
  }

  // 权益/固收：市值 × 当日收益率 / 100
  const daily = dailyReturnMap.value.get(product.code || '')
  if (!daily || daily.dailyReturn === null) return null
  return marketValue * daily.dailyReturn / 100
}

return {
  products,
  transactions,
  navHistory,
  productDividends,
  productDividendsByProductId,
  isLoading,
  refresh,
  forceRefresh,
  addProduct,
  updateProduct,
  updateProductPurchaseLimit,
  deleteProduct,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  deleteNavHistoryItem,
  deleteProductDividend,
  getProductById,
  getTransactionsByProductId,
  getNavHistoryByProductId,
  getProductDividendsByProduct,
  getLatestNavAndDate,
  calculatePosition,
  portfolioSummary,
  getPositionById,
  getProfitHistory,
  getMarketValueHistory,
  dailyReturnMap,
  calcDailyProfit,
  PRODUCT_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  dashboardSettings,
  equitySettings,
  fixedIncomeSettings,
  termDepositSettings,
  saveDisplaySettings
 };
}

