import { computed, ref } from 'vue';
import type { Product, Transaction, Position, PortfolioSummary, ProductType, TransactionType, InterestMethod } from '@/types';
import { getProducts, saveProducts, getTransactions, generateId, addTransactionToServer, updateTransactionOnServer, deleteTransactionFromServer } from '@/utils/storage';
import { calculateXIRR } from '@/utils/xirr';
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
 { value: 'dividend', label: '分红', color: '#f59e0b' },
 { value: 'nav_update', label: '净值更新', color: '#3b82f6' }
];
const products = ref<Product[]>([])
const transactions = ref<Transaction[]>([])
const isLoading = ref(false)
let initPromise: Promise<void> | null = null

type DisplaySettings = { showProfitAmount: boolean; showProfitRate: boolean; showMarketValue: boolean; showCost: boolean }

// 每个页面的独立显示控制
const dashboardSettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })
const equitySettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })
const fixedIncomeSettings = ref<DisplaySettings>({ showProfitAmount: true, showProfitRate: true, showMarketValue: true, showCost: true })

const loadDisplaySettings = () => {
  try {
    const saved = localStorage.getItem('displaySettings')
    if (saved) {
      const settings = JSON.parse(saved)
      if (settings.dashboard) dashboardSettings.value = { ...dashboardSettings.value, ...settings.dashboard }
      if (settings.equity) equitySettings.value = { ...equitySettings.value, ...settings.equity }
      if (settings.fixedIncome) fixedIncomeSettings.value = { ...fixedIncomeSettings.value, ...settings.fixedIncome }
    }
  } catch {
    // 保持默认值
  }
}

const saveDisplaySettings = () => {
  localStorage.setItem('displaySettings', JSON.stringify({
    dashboard: dashboardSettings.value,
    equity: equitySettings.value,
    fixedIncome: fixedIncomeSettings.value
  }))
}

loadDisplaySettings();

async function ensureDataLoaded() {
 if (products.value.length === 0 && transactions.value.length === 0 && !initPromise) {
 initPromise = (async () => {
 isLoading.value = true;
 try {
  ;[products.value, transactions.value] = await Promise.all([getProducts(), getTransactions()])
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
export function useFinance() {
 // 自动初始化：首次调用时若数据为空则加载
 ensureDataLoaded();

 const refresh = async () => {
  ;[products.value, transactions.value] = await Promise.all([getProducts(), getTransactions()])
  };
 const addProduct = async (name: string, type: ProductType, note: string = '', code: string = '', holder: string = '', dcaAmount: number = 0, dcaCycle: string = '', navSource: string = '', holdingTerm: string = '', benchmarkEnabled: boolean = false, benchmarkFormula: string = '', interestRate: number = 0, durationMonths: number = 0, minAmount: number = 0, maturityDate: string = '', interestMethod: InterestMethod | '' = '', bankName: string = '', purchaseLimit: string = '') => {
 const product: Product = {
  id: generateId(),
  name,
  type,
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
 const updateProduct = async (id: string, name: string, type: ProductType, note: string = '', code: string = '', holder: string = '', dcaAmount: number = 0, dcaCycle: string = '', navSource: string = '', holdingTerm: string = '', benchmarkEnabled: boolean = false, benchmarkFormula: string = '', interestRate: number = 0, durationMonths: number = 0, minAmount: number = 0, maturityDate: string = '', interestMethod: InterestMethod | '' = '', bankName: string = '', purchaseLimit: string = '') => {
 const index = products.value.findIndex(p => p.id === id);
 if (index !== -1) {
 products.value[index] = {
 ...products.value[index],
 name,
 type,
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
 }
 };
 const deleteTransaction = async (id: string) => {
 transactions.value = transactions.value.filter(t => t.id !== id);
 await deleteTransactionFromServer(id);
 };
 const getProductById = (id: string): Product | undefined => {
 return products.value.find(p => p.id === id);
 };
 const getTransactionsByProductId = (productId: string): Transaction[] => {
 return transactions.value
 .filter(t => t.productId === productId)
 .sort((a, b) => a.date - b.date);
 };
 const calculatePosition = (product: Product): Position => {
 const productTransactions = getTransactionsByProductId(product.id);
 let totalInvestment = 0;
 let totalShares = 0;
 let avgCost = 0;
 let currentNav = 1;
 let remainingShares = 0;
 let firstBuyDate = 0;
 let lastNavUpdateDate = 0;
 const buyTransactions: Transaction[] = [];
 const sellTransactions: Transaction[] = [];
 const dividendTransactions: Transaction[] = [];
 for (const t of productTransactions) {
 if (t.type === 'buy') {
 buyTransactions.push(t);
 totalInvestment += t.amount + t.fee;
 totalShares += t.shares;
 if (firstBuyDate === 0 || t.date < firstBuyDate) {
 firstBuyDate = t.date;
 }
 }
 else if (t.type === 'sell') {
 sellTransactions.push(t);
 remainingShares -= t.shares;
 }
 else if (t.type === 'dividend') {
 dividendTransactions.push(t);
 }
 else if (t.type === 'nav_update') {
 currentNav = t.price;
 if (t.date > lastNavUpdateDate) {
 lastNavUpdateDate = t.date;
 }
 }
 }
 let cumulativeCostBasis = 0;
 let cumulativeShares = 0;
 for (const t of buyTransactions) {
 cumulativeCostBasis += t.amount + t.fee;
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
 realizedProfit += t.amount - t.shares * avgCost;
 } else if (t.type === 'dividend') {
 totalDividend += t.amount;
 }
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

 // 到期后停止计算收益，使用到期日作为截止日期
 const endDate = isMatured ? maturityTime : Date.now();
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
 lastNavUpdateDate: startDate,
 transactions: productTransactions
 };
 }

 const marketValue = Math.round(remainingShares * currentNav);
 const unrealizedProfit = marketValue - (remainingShares * avgCost);
 const profit = unrealizedProfit + realizedProfit + totalDividend;
 const profitRate = remainingShares > 0 ? (unrealizedProfit / (remainingShares * avgCost)) * 100 : 0;
 const holdingDays = firstBuyDate > 0 ? Math.max(1, Math.ceil((Date.now() - firstBuyDate) / (1000 * 60 * 60 * 24))) : 0;
 const xirrRate = calculateXIRR(
 buyTransactions.map(t => ({ date: t.date, amount: t.amount, fee: t.fee })),
 sellTransactions.map(t => ({ date: t.date, amount: t.amount })),
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
 amount: t.amount
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
 const getProfitHistory = (days: number = 30): {
  date: string;
  profit: number;
  productProfits: { productId: string; productName: string; profit: number }[];
}[] => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const windowStart = todayStart - (days - 1) * 24 * 60 * 60 * 1000;

  const productDailyProfits: Map<string, Map<string, number>> = new Map();

  for (const product of products.value) {
    const productTransactions = getTransactionsByProductId(product.id);
    if (productTransactions.length === 0) continue;

    let shares = 0;
    let avgCost = 0;
    let currentNav = 1;
    let hasSeenNavUpdate = false;

    for (const t of productTransactions) {
      if (t.date >= windowStart) break;
      if (t.type === 'buy') {
        const newShares = shares + t.shares;
        avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
        shares = newShares;
      } else if (t.type === 'sell') {
        shares = Math.max(0, shares - t.shares);
      } else if (t.type === 'nav_update') {
        currentNav = t.price;
        hasSeenNavUpdate = true;
      }
    }

    if (!hasSeenNavUpdate && avgCost > 0) {
      currentNav = avgCost;
    }

    // 按日期预索引窗口期内的交易，避免每日循环中重复 filter
    const dayTxMap = new Map<string, Transaction[]>()
    for (const t of productTransactions) {
      if (t.date < windowStart) continue
      const dt = new Date(t.date)
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      if (!dayTxMap.has(ds)) dayTxMap.set(ds, [])
      dayTxMap.get(ds)!.push(t)
    }

    const dailyProfits: Map<string, number> = new Map();
    let hasNavByPreviousDay = hasSeenNavUpdate;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      let dailyProfit = 0;
      const navBefore = currentNav;
      const dayTransactions = dayTxMap.get(dateStr) || []; // O(1) 查找，无需 filter
      let hasNavUpdateToday = false;
      let sharesAtNavUpdate = shares;

      for (const t of dayTransactions) {
        if (t.type === 'buy') {
          const newShares = shares + t.shares;
          avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
          shares = newShares;
          if (currentNav === 1 && avgCost > 0) {
            currentNav = avgCost;
          }
        } else if (t.type === 'sell') {
          shares = Math.max(0, shares - t.shares);
        } else if (t.type === 'dividend') {
          dailyProfit += t.amount;
        } else if (t.type === 'nav_update') {
          currentNav = t.price;
          sharesAtNavUpdate = shares;
          hasNavUpdateToday = true;
        }
      }

      if (hasNavByPreviousDay) {
        dailyProfit += (currentNav - navBefore) * sharesAtNavUpdate;
      }

      if (hasNavUpdateToday) {
        hasNavByPreviousDay = true;
      }

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
    const dateStr = date.toISOString().split('T')[0];

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
  const windowStart = todayStart - (days - 1) * 24 * 60 * 60 * 1000;

  // 每个产品：{ dailyValues: Map<dateStr, marketValue> }
  const productDailyValues: Map<string, Map<string, number>> = new Map();

  for (const product of products.value) {
    const productTransactions = getTransactionsByProductId(product.id);
    if (productTransactions.length === 0) continue;

    let shares = 0;
    let avgCost = 0;
    let currentNav = 1;
    let hasSeenNavUpdate = false;

    // 先处理窗口前的交易，得到初始 shares/nav
    for (const t of productTransactions) {
      if (t.date >= windowStart) break;
      if (t.type === 'buy') {
        const newShares = shares + t.shares;
        avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
        shares = newShares;
      } else if (t.type === 'sell') {
        shares = Math.max(0, shares - t.shares);
      } else if (t.type === 'nav_update') {
        currentNav = t.price;
        hasSeenNavUpdate = true;
      }
    }

    if (!hasSeenNavUpdate && avgCost > 0) {
      currentNav = avgCost;
    }

    // 按日期预索引窗口期内的交易，避免每日循环中重复 filter
    const dayTxMap = new Map<string, Transaction[]>()
    for (const t of productTransactions) {
      if (t.date < windowStart) continue
      const dt = new Date(t.date)
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      if (!dayTxMap.has(ds)) dayTxMap.set(ds, [])
      dayTxMap.get(ds)!.push(t)
    }

    const dailyVals: Map<string, number> = new Map();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayTransactions = dayTxMap.get(dateStr) || []; // O(1) 查找，无需 filter
      for (const t of dayTransactions) {
        if (t.type === 'buy') {
          const newShares = shares + t.shares;
          avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
          shares = newShares;
          if (currentNav === 1 && avgCost > 0) currentNav = avgCost;
        } else if (t.type === 'sell') {
          shares = Math.max(0, shares - t.shares);
        } else if (t.type === 'nav_update') {
          currentNav = t.price;
        }
      }

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
    const dateStr = date.toISOString().split('T')[0];

    const marketValues: { productId: string; productName: string; marketValue: number }[] = [];
    for (const product of products.value) {
      const vals = productDailyValues.get(product.id);
      if (!vals) continue;
      const mv = vals.get(dateStr);
      if (mv !== undefined && mv > 0) {
        marketValues.push({ productId: product.id, productName: product.name, marketValue: mv });
      }
    }

    history.push({ date: dateStr, marketValues });
  }

  return history;
};

 return {
 products,
 transactions,
 isLoading,
 refresh,
 addProduct,
 updateProduct,
  updateProductPurchaseLimit,
 deleteProduct,
 addTransaction,
 updateTransaction,
 deleteTransaction,
 getProductById,
 getTransactionsByProductId,
 calculatePosition,
 portfolioSummary,
 getPositionById,
 getProfitHistory,
 getMarketValueHistory,
 PRODUCT_TYPE_OPTIONS,
 TRANSACTION_TYPE_OPTIONS,
 dashboardSettings,
 equitySettings,
 fixedIncomeSettings,
 saveDisplaySettings
 };
}