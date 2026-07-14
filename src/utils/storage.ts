import type { Product, Transaction } from '@/types'
import { createLogger } from './logger'

const logger = createLogger('Storage')

const API_BASE = '/api/db'

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
    logger.debug(`获取产品列表成功, 数量: ${data?.length || 0}`)
    return data
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
  // 获取权益产品ID列表
  const equityProductIds = new Set(products.filter(p => p.type === 'equity' || p.type === 'fund').map(p => p.id))
  // 导出时仅排除权益产品的 nav_update 历史净值数据（可通过定时调度器重新获取）
  // 固收产品的净值数据保留在导出中
  const transactions = allTransactions.filter(t => {
    if (t.type === 'nav_update' && equityProductIds.has(t.productId)) {
      return false // 排除权益产品的净值更新记录
    }
    return true
  })
  // 确保产品包含定投字段（兼容旧数据）
  const productsWithDca = products.map(p => ({
    ...p,
    dcaAmount: p.dcaAmount || 0,
    dcaCycle: p.dcaCycle || ''
  }))
  const excludedCount = allTransactions.length - transactions.length
  logger.info(`导出完成: 产品 ${productsWithDca.length} 条, 交易 ${transactions.length} 条 (已排除 ${excludedCount} 条权益净值更新记录)`)
  return JSON.stringify({ products: productsWithDca, transactions }, null, 2)
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
    let idMapping: Record<string, string> = {}
    
    if (data.products && Array.isArray(data.products)) {
      logger.info(`导入产品: ${data.products.length} 条`)
      // 确保产品包含定投字段（兼容旧数据）
      const productsWithDca = data.products.map((p: any) => ({
        ...p,
        dcaAmount: p.dcaAmount || 0,
        dcaCycle: p.dcaCycle || ''
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
    
    logger.info('数据导入成功')
    return { success: true, message: `导入成功: 产品 ${productCount} 条, 交易 ${transactionCount} 条` }
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