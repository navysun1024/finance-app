import { computed, ref } from 'vue';
import type { Product, Transaction, Position, PortfolioSummary, ProductType, TransactionType } from '@/types';
import { getProducts, saveProducts, getTransactions, generateId, addTransactionToServer, updateTransactionOnServer, deleteTransactionFromServer } from '@/utils/storage';
import { calculateXIRR } from '@/utils/xirr';
export const PRODUCT_TYPE_OPTIONS: {
 value: ProductType;
 label: string;
 color: string;
}[] = [
 { value: 'fund', label: '基金', color: '#3b82f6' },
 { value: 'fixed_income', label: '固收理财', color: '#8b5cf6' }
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
const products = ref<Product[]>([]);
const transactions = ref<Transaction[]>([]);
const isLoading = ref(false);
let initPromise: Promise<void> | null = null;

async function ensureDataLoaded() {
 if (products.value.length === 0 && transactions.value.length === 0 && !initPromise) {
 initPromise = (async () => {
 isLoading.value = true;
 try {
 products.value = await getProducts();
 transactions.value = await getTransactions();
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
 products.value = await getProducts();
 transactions.value = await getTransactions();
 };
 const addProduct = async (name: string, type: ProductType, note: string = '', code: string = '', holder: string = '', dcaAmount: number = 0, dcaCycle: string = '') => {
 const product: Product = {
 id: generateId(),
 name,
 type,
 code,
 note,
 holder,
 dcaAmount,
 dcaCycle,
 createdAt: Date.now()
 };
 products.value.push(product);
 await saveProducts(products.value);
 return product;
 };
 const updateProduct = async (id: string, name: string, type: ProductType, note: string = '', code: string = '', holder: string = '', dcaAmount: number = 0, dcaCycle: string = '') => {
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
 dcaCycle
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
 for (const t of productTransactions) {
 if (t.type === 'sell') {
 remainingShares -= t.shares;
 }
 }
 const marketValue = Math.round(remainingShares * currentNav);
 const profit = marketValue - (remainingShares * avgCost);
 const profitRate = remainingShares > 0 ? (profit / (remainingShares * avgCost)) * 100 : 0;
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

 const dailyProfits: Map<string, number> = new Map();
 let hasNavByPreviousDay = hasSeenNavUpdate;

 for (let i = days - 1; i >= 0; i--) {
 const date = new Date(today);
 date.setDate(date.getDate() - i);
 const dateStr = date.toISOString().split('T')[0];
 const dayStart = new Date(date).setHours(0, 0, 0, 0);
 const dayEnd = new Date(date).setHours(23, 59, 59, 999);

 let dailyProfit = 0;
 const navBefore = currentNav;
 const dayTransactions = productTransactions.filter(t => t.date >= dayStart && t.date <= dayEnd);
 let hasNavUpdateToday = false;
 let sharesAtNavUpdate = shares; // 记录净值更新时的份额，用于计算当日净值变动收益

 for (const t of dayTransactions) {
 if (t.type === 'buy') {
 const newShares = shares + t.shares;
 avgCost = newShares > 0 ? (avgCost * shares + t.amount + t.fee) / newShares : 0;
 shares = newShares;
 if (currentNav === 1 && avgCost > 0) {
 currentNav = avgCost;
 }
 } else if (t.type === 'sell') {
 // 赎回只更新份额，不计入赎回收益（赎回收益含历史累积，不属于当日新增）
 shares = Math.max(0, shares - t.shares);
 } else if (t.type === 'dividend') {
 dailyProfit += t.amount;
 } else if (t.type === 'nav_update') {
 currentNav = t.price;
 sharesAtNavUpdate = shares; // 净值更新时的份额（赎回前的全部份额）
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
 return {
 products,
 transactions,
 isLoading,
 refresh,
 addProduct,
 updateProduct,
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
 PRODUCT_TYPE_OPTIONS,
 TRANSACTION_TYPE_OPTIONS
 };
}