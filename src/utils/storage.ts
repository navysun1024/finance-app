import type { Product, Transaction } from '@/types'
import { createLogger } from './logger'

const logger = createLogger('Storage')

const API_BASE = '/api/db'
const AUTO_UPDATE_KEY = 'finance_auto_update'

function getAuthHeaders() {
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

export async function saveProducts(products: Product[]): Promise<void> {
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
    logger.debug(`保存产品列表成功, 数量: ${products.length}`)
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

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export async function clearAllData(): Promise<void> {
  logger.info('清空所有数据')
  await saveProducts([])
  await saveTransactions([])
  localStorage.removeItem(AUTO_UPDATE_KEY)
  logger.info('数据已清空')
}

export function getAutoUpdateEnabled(): boolean {
  return localStorage.getItem(AUTO_UPDATE_KEY) !== 'false'
}

export function setAutoUpdateEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_UPDATE_KEY, enabled.toString())
}

export async function exportData(): Promise<string> {
  logger.info('开始导出数据...')
  const products = await getProducts()
  const transactions = await getTransactions()
  logger.info(`导出完成: 产品 ${products.length} 条, 交易 ${transactions.length} 条`)
  return JSON.stringify({ products, transactions }, null, 2)
}

export async function importData(jsonString: string): Promise<boolean> {
  logger.info('开始导入数据...')
  try {
    const data = JSON.parse(jsonString)
    if (data.products && Array.isArray(data.products)) {
      logger.info(`导入产品: ${data.products.length} 条`)
      await saveProducts(data.products)
    }
    if (data.transactions && Array.isArray(data.transactions)) {
      logger.info(`导入交易: ${data.transactions.length} 条`)
      await saveTransactions(data.transactions)
    }
    logger.info('数据导入成功')
    return true
  } catch (e: any) {
    logger.error(`数据导入失败: ${e.message}`, e)
    return false
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