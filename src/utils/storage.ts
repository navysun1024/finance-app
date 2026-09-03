import type { Product, Transaction, NavHistory, ProductDividend } from '@/types'
import { createLogger } from './logger'

const logger = createLogger('Storage')

const API_BASE = '/api'

export function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  }
}

export async function getProducts(): Promise<Product[]> {
  return logger.withTiming('GET /products', async () => {
    const response = await fetch(`${API_BASE}/products`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`获取产品列表失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to fetch products')
    }
    const data = await response.json()
    // 兼容旧数据：补全新增字段
    const normalized = Array.isArray(data)
      ? data.map((p: any) => ({
          ...p,
          holder: p.holder || '',
          purchaseLimit: p.purchaseLimit || '',
          dcaAmount: typeof p.dcaAmount === 'number' ? p.dcaAmount : (p.dcaAmount || 0),
          dcaCycle: p.dcaCycle || '',
          navSource: p.navSource || '',
          holdingTerm: p.holdingTerm || '',
          benchmarkEnabled: p.benchmarkEnabled === true || p.benchmarkEnabled === 1,
          benchmarkFormula: p.benchmarkFormula || '',
          interestRate: typeof p.interestRate === 'number' ? p.interestRate : 0,
          durationMonths: typeof p.durationMonths === 'number' ? p.durationMonths : 0,
          minAmount: typeof p.minAmount === 'number' ? p.minAmount : 0,
          maturityDate: p.maturityDate || '',
          interestMethod: p.interestMethod || '',
          bankName: p.bankName || ''
        }))
      : []
    logger.debug(`获取产品列表成功, 数量: ${normalized.length || 0}`)
    return normalized as Product[]
  })
}

export async function saveProducts(products: Product[]): Promise<{ idMapping?: Record<string, string> }> {
  return logger.withTiming(`POST /products (${products.length} 条)`, async () => {
    const response = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(products)
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`保存产品列表失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to save products')
    }
    const result = await response.json()
    logger.debug(`保存产品列表成功, 数量: ${products.length}`)
    return result
  })
}

export async function getTransactions(): Promise<Transaction[]> {
  return logger.withTiming('GET /transactions', async () => {
    const response = await fetch(`${API_BASE}/transactions`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`获取交易记录失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to fetch transactions')
    }
    const data = await response.json()
    logger.debug(`获取交易记录成功, 数量: ${data?.length || 0}`)
    return data
  })
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  return logger.withTiming(`POST /transactions (${transactions.length} 条)`, async () => {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(transactions)
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`保存交易记录失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to save transactions')
    }
    logger.debug(`保存交易记录成功, 数量: ${transactions.length}`)
  })
}

// ==================== 净值历史（nav_history）API ====================

export async function getNavHistory(): Promise<NavHistory[]> {
  return logger.withTiming('GET /nav-history', async () => {
    const response = await fetch(`${API_BASE}/nav-history`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      logger.error(`获取净值历史失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to fetch nav history')
    }
    const data = await response.json()
    logger.debug(`获取净值历史成功, 数量: ${data?.length || 0}`)
    return data as NavHistory[]
  })
}

export async function getNavHistoryByProduct(productId: string): Promise<NavHistory[]> {
  return logger.withTiming(`GET /nav-history/${productId}`, async () => {
    const response = await fetch(`${API_BASE}/nav-history/${productId}`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      logger.error(`获取产品净值历史失败: ${response.status}`)
      throw new Error('Failed to fetch product nav history')
    }
    const data = await response.json()
    logger.debug(`产品 ${productId} 净值历史: ${data?.length || 0} 条`)
    return data as NavHistory[]
  })
}

export async function addNavHistoryRecord(record: Omit<NavHistory, 'id' | 'userId' | 'createdAt'> & { id?: string }): Promise<void> {
  return logger.withTiming('POST /nav-history', async () => {
    const response = await fetch(`${API_BASE}/nav-history`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(record)
    })
    if (!response.ok) {
      logger.error(`写入净值历史失败: ${response.status}`)
      throw new Error('Failed to add nav history record')
    }
  })
}

export async function batchAddNavHistory(records: Array<Omit<NavHistory, 'userId' | 'createdAt'>>): Promise<{ inserted: number; total: number }> {
  return logger.withTiming(`POST /nav-history/batch (${records.length} 条)`, async () => {
    const response = await fetch(`${API_BASE}/nav-history/batch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ records })
    })
    if (!response.ok) {
      logger.error(`批量写入净值历史失败: ${response.status}`)
      throw new Error('Failed to batch add nav history')
    }
    return response.json()
  })
}

export async function deleteNavHistory(productId: string): Promise<void> {
  return logger.withTiming(`DELETE /nav-history/${productId}`, async () => {
    const response = await fetch(`${API_BASE}/nav-history/${productId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      logger.error(`删除净值历史失败: ${response.status}`)
      throw new Error('Failed to delete nav history')
    }
  })
}

// ==================== 产品分红历史（product_dividends）API ====================

export async function getProductDividends(): Promise<ProductDividend[]> {
  return logger.withTiming('GET /product-dividends', async () => {
    const response = await fetch(`${API_BASE}/product-dividends`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      logger.error(`获取产品分红历史失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to fetch product dividends')
    }
    const data = await response.json()
    logger.debug(`获取产品分红历史成功, 数量: ${data?.length || 0}`)
    return data as ProductDividend[]
  })
}

export async function getProductDividendsByProduct(productId: string): Promise<ProductDividend[]> {
  return logger.withTiming(`GET /product-dividends/${productId}`, async () => {
    const response = await fetch(`${API_BASE}/product-dividends/${productId}`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      logger.error(`获取产品分红历史失败: ${response.status}`)
      throw new Error('Failed to fetch product dividends by product')
    }
    const data = await response.json()
    logger.debug(`产品 ${productId} 分红历史: ${data?.length || 0} 条`)
    return data as ProductDividend[]
  })
}

export async function batchAddProductDividends(records: Array<Omit<ProductDividend, 'userId' | 'createdAt'>>): Promise<{ inserted: number; total: number }> {
  return logger.withTiming(`POST /product-dividends/batch (${records.length} 条)`, async () => {
    const response = await fetch(`${API_BASE}/product-dividends/batch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ records })
    })
    if (!response.ok) {
      logger.error(`批量写入产品分红历史失败: ${response.status}`)
      throw new Error('Failed to batch add product dividends')
    }
    return response.json()
  })
}

export async function addTransactionToServer(transaction: Transaction): Promise<void> {
  return logger.withTiming(`POST /transactions/add`, async () => {
    const response = await fetch(`${API_BASE}/transactions/add`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(transaction)
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`添加事务失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to add transaction')
    }
    logger.debug(`添加事务成功, id: ${transaction.id}`)
  })
}

export async function updateTransactionOnServer(transaction: Transaction): Promise<void> {
  return logger.withTiming(`PUT /transactions/${transaction.id}`, async () => {
    const response = await fetch(`${API_BASE}/transactions/${transaction.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(transaction)
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`更新事务失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to update transaction')
    }
    logger.debug(`更新事务成功, id: ${transaction.id}`)
  })
}

export async function deleteTransactionFromServer(id: string): Promise<void> {
  return logger.withTiming(`DELETE /transactions/${id}`, async () => {
    const response = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`删除事务失败: ${response.status} ${response.statusText}`)
      throw new Error('Failed to delete transaction')
    }
    logger.debug(`删除事务成功, id: ${id}`)
  })
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export async function clearAllData(): Promise<void> {
  logger.info('清空所有数据')
  await saveProducts([])
  await saveTransactions([])
  logger.info('数据已清空')
}

export async function exportData(): Promise<string> {
  logger.info('开始导出数据...')
  const products = await getProducts()
  const allTransactions = await getTransactions()
  const allNavHistory = await getNavHistory()
  // 导出时过滤掉 nav_update 类型（已迁移到 nav_history 表独立导出）
  const transactions = allTransactions.filter(t => t.type !== 'nav_update')
  // 确保产品包含定投、净值查询源、持有期限字段（兼容旧数据）
  const productsWithDca = products.map(p => ({
    ...p,
    dcaAmount: p.dcaAmount || 0,
    dcaCycle: p.dcaCycle || '',
    navSource: p.navSource || '',
    holdingTerm: (p as any).holdingTerm || '',
    benchmarkEnabled: (p as any).benchmarkEnabled ?? false,
    benchmarkFormula: (p as any).benchmarkFormula || ''
  }))
  const excludedNavCount = allTransactions.length - transactions.length
  logger.info(`导出完成: 产品 ${productsWithDca.length} 条, 交易 ${transactions.length} 条, 净值历史 ${allNavHistory.length} 条 (已分离 ${excludedNavCount} 条 nav_update 记录)`)
  return JSON.stringify({ products: productsWithDca, transactions, navHistory: allNavHistory }, null, 2)
}

export async function importData(jsonString: string): Promise<{ success: boolean; message: string }> {
  logger.info('开始导入数据...')
  try {
    const data = JSON.parse(jsonString)
    
    // 检查数据格式
    if (!data.products && !data.transactions) {
      logger.error('数据格式错误: 缺少 products 或 transactions 字段')
      return { success: false, message: '数据格式错误: 缺少 products 或 transactions 字段' }
    }
    
    let productCount = 0
    let transactionCount = 0
    let navHistoryCount = 0
    let idMapping: Record<string, string> = {}
    
    if (data.products && Array.isArray(data.products)) {
      logger.info(`导入产品: ${data.products.length} 条`)
      // 确保产品包含定投、净值查询源、持有期限字段（兼容旧数据）
      const productsWithDca = data.products.map((p: any) => ({
        ...p,
        dcaAmount: p.dcaAmount || 0,
        dcaCycle: p.dcaCycle || '',
        navSource: p.navSource || '',
        holdingTerm: p.holdingTerm || '',
        benchmarkEnabled: p.benchmarkEnabled ?? false,
        benchmarkFormula: p.benchmarkFormula || ''
      }))
      const result = await saveProducts(productsWithDca)
      idMapping = result.idMapping || {}
      productCount = productsWithDca.length
      if (Object.keys(idMapping).length > 0) {
        logger.info(`产品ID冲突，已生成新映射: ${Object.keys(idMapping).length} 个`)
      }
    }
    if (data.transactions && Array.isArray(data.transactions)) {
      // 如果有ID映射，更新事务的productId
      const transactions = Object.keys(idMapping).length > 0
        ? data.transactions.map((t: any) => ({
            ...t,
            productId: idMapping[t.productId] || t.productId
          }))
        : data.transactions
      logger.info(`导入交易: ${transactions.length} 条`)
      await saveTransactions(transactions)
      transactionCount = transactions.length
    }
    // 导入 navHistory（新表独立导入）
    if (data.navHistory && Array.isArray(data.navHistory)) {
      const records = Object.keys(idMapping).length > 0
        ? data.navHistory.map((n: any) => ({
            ...n,
            productId: idMapping[n.productId] || n.productId
          }))
        : data.navHistory
      logger.info(`导入净值历史: ${records.length} 条`)
      // 分批写入避免单次请求过大
      const BATCH_SIZE = 500
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE)
        await batchAddNavHistory(batch)
      }
      navHistoryCount = records.length
    }
    
    logger.info('数据导入成功')
    return { success: true, message: `导入成功: 产品 ${productCount} 条, 交易 ${transactionCount} 条, 净值历史 ${navHistoryCount} 条` }
  } catch (e: any) {
    logger.error(`数据导入失败: ${e.message}`, e)
    return { success: false, message: `数据解析失败: ${e.message}` }
  }
}

export interface BatchImportResult {
  success: boolean
  products: {
    total: number
    imported: number
    skipped: number
    skippedNames: string[]
  }
  transactions: {
    total: number
    imported: number
    skipped: number
    skippedDetails: { productName: string; date: string; amount: number }[]
  }
}

export async function batchImport(data: { products: any[]; transactions: any[] }): Promise<BatchImportResult> {
  return logger.withTiming(`POST /batch-import (产品: ${data.products?.length || 0}, 交易: ${data.transactions?.length || 0})`, async () => {
    const response = await fetch(`${API_BASE}/batch-import`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      if (response.status === 401) {
        logger.warn('认证已过期，跳转登录页')
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }
      logger.error(`批量导入失败: ${response.status} ${response.statusText}`)
      throw new Error('批量导入失败')
    }
    const result = await response.json()
    logger.info(`批量导入完成: 产品 导入${result.products?.imported || 0}/跳过${result.products?.skipped || 0}, 交易 导入${result.transactions?.imported || 0}/跳过${result.transactions?.skipped || 0}`)
    return result
  })
}

export function getCurrentUser(): { username: string | null; token: string | null } {
  return {
    username: localStorage.getItem('username'),
    token: localStorage.getItem('token')
  }
}

export function logout(): void {
  logger.info('用户登出')
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  window.location.href = '/login'
}