import express from 'express'
import cors from 'cors'
import sqlite3 from 'sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import bcrypt from 'bcryptjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '../data/finance.db')

import fs from 'fs'
const dataDir = join(__dirname, '../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const logsDir = join(__dirname, '../logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const logFile = join(logsDir, 'db-server.log')

function log(message, level = 'INFO') {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  const logLine = `[${timestamp}] [${level}] ${message}`
  console.log(logLine)
  fs.appendFileSync(logFile, logLine + '\n')
}

const db = new sqlite3.Database(dbPath)

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    code TEXT DEFAULT '',
    note TEXT DEFAULT '',
    holder TEXT DEFAULT '',
    createdAt INTEGER NOT NULL
  )
`)

db.run(`ALTER TABLE products ADD COLUMN holder TEXT DEFAULT ''`, (err) => {
  if (err) {
    // 列已存在，忽略错误
  }
})

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    productId TEXT NOT NULL,
    type TEXT NOT NULL,
    date INTEGER NOT NULL,
    amount REAL NOT NULL,
    price REAL NOT NULL,
    shares REAL NOT NULL,
    fee REAL DEFAULT 0,
    note TEXT DEFAULT ''
  )
`)

// 数据缓存表 - 用于缓存爬取的数据，加速页面加载
db.run(`
  CREATE TABLE IF NOT EXISTS data_cache (
    cache_key TEXT PRIMARY KEY,
    cache_data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`)

// 为缓存表创建过期时间索引
db.run(`CREATE INDEX IF NOT EXISTS idx_data_cache_expires ON data_cache(expires_at)`)

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now()
  const { method, originalUrl } = req
  // 不记录健康检查等高频日志
  if (originalUrl === '/health') return next()

  res.on('finish', () => {
    const duration = Date.now() - start
    const { statusCode } = res
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'DEBUG'
    log(`${method} ${originalUrl} → ${statusCode} ${duration}ms`, level)
  })
  next()
})

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

const generateToken = () => {
  return crypto.randomBytes(32).toString('base64')
}

// bcrypt 密码哈希（成本因子 10）
const SALT_ROUNDS = 10
const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS)
}
const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash)
}

// 会话管理（带过期时间）
const SESSION_TTL = 24 * 60 * 60 * 1000 // 24 小时
const sessions = new Map()

// 定期清理过期会话（每小时一次）
setInterval(() => {
  const now = Date.now()
  let cleaned = 0
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token)
      cleaned++
    }
  }
  if (cleaned > 0) log(`[会话] 清理了 ${cleaned} 个过期会话`)
}, 60 * 60 * 1000)

// 速率限制器
const loginAttempts = new Map() // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 分钟
const RATE_LIMIT_MAX = 10 // 每 15 分钟最多 10 次

const checkRateLimit = (ip) => {
  const now = Date.now()
  const record = loginAttempts.get(ip)
  if (!record || now > record.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.resetTime - now) / 60000) }
  }
  record.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count }
}

// 输入验证
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') return '用户名不能为空'
  const trimmed = username.trim()
  if (trimmed.length < 3) return '用户名至少3个字符'
  if (trimmed.length > 32) return '用户名最多32个字符'
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(trimmed)) return '用户名只能包含字母、数字、下划线和中文'
  return null
}

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return '密码不能为空'
  if (password.length < 8) return '密码至少8个字符'
  if (password.length > 128) return '密码最多128个字符'
  return null
}

// ==================== 数据缓存工具函数 ====================

/**
 * 获取缓存数据
 * @param {string} key 缓存键
 * @returns {Promise<{data: any, updatedAt: number, isExpired: boolean} | null>}
 */
async function getCache(key) {
  return new Promise((resolve) => {
    db.get(
      'SELECT cache_data, updated_at, expires_at FROM data_cache WHERE cache_key = ?',
      [key],
      (err, row) => {
        if (err || !row) {
          resolve(null)
          return
        }
        try {
          const data = JSON.parse(row.cache_data)
          const isExpired = Date.now() > row.expires_at
          resolve({
            data,
            updatedAt: row.updated_at,
            isExpired
          })
        } catch (e) {
          resolve(null)
        }
      }
    )
  })
}

/**
 * 设置缓存数据
 * @param {string} key 缓存键
 * @param {any} data 要缓存的数据
 * @param {number} ttlMs 缓存有效期（毫秒）
 */
async function setCache(key, data, ttlMs) {
  const now = Date.now()
  const cacheData = JSON.stringify(data)
  return new Promise((resolve) => {
    db.run(
      `INSERT OR REPLACE INTO data_cache (cache_key, cache_data, updated_at, expires_at) VALUES (?, ?, ?, ?)`,
      [key, cacheData, now, now + ttlMs],
      (err) => {
        if (err) {
          log(`[Cache] 设置缓存失败: ${key}, 错误: ${err.message}`, 'ERROR')
        } else {
          log(`[Cache] 设置缓存成功: ${key}, TTL: ${Math.round(ttlMs / 60000)}分钟`)
        }
        resolve()
      }
    )
  })
}

/**
 * 清理过期缓存
 */
async function cleanExpiredCache() {
  return new Promise((resolve) => {
    db.run(
      'DELETE FROM data_cache WHERE expires_at < ?',
      [Date.now()],
      (err) => {
        if (err) {
          log(`[Cache] 清理过期缓存失败: ${err.message}`, 'ERROR')
        }
        resolve()
      }
    )
  })
}

// 每小时清理一次过期缓存
setInterval(cleanExpiredCache, 60 * 60 * 1000)

// ==================== 缓存 API ====================

/**
 * 获取缓存
 * GET /cache/:key
 */
app.get('/cache/:key', async (req, res) => {
  try {
    const { key } = req.params
    const cached = await getCache(key)
    if (cached) {
      res.json({
        success: true,
        data: cached.data,
        updatedAt: cached.updatedAt,
        isExpired: cached.isExpired,
        fromCache: true
      })
    } else {
      res.json({
        success: true,
        data: null,
        fromCache: false
      })
    }
  } catch (err) {
    log(`获取缓存失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 批量获取缓存
 * POST /cache/batch
 * Body: { keys: ['key1', 'key2', ...] }
 */
app.post('/cache/batch', async (req, res) => {
  try {
    const { keys } = req.body
    if (!Array.isArray(keys)) {
      return res.status(400).json({ success: false, error: 'keys 必须是数组' })
    }
    
    const results = {}
    await Promise.all(keys.map(async (key) => {
      const cached = await getCache(key)
      if (cached) {
        results[key] = {
          data: cached.data,
          updatedAt: cached.updatedAt,
          isExpired: cached.isExpired
        }
      }
    }))
    
    res.json({
      success: true,
      data: results,
      fromCache: true
    })
  } catch (err) {
    log(`批量获取缓存失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/', (req, res) => {
  res.json({ 
    message: '个人理财统计系统 API 服务器',
    version: '1.0.0',
    endpoints: {
      auth: ['POST /auth/register', 'POST /auth/login', 'GET /auth/verify', 'POST /auth/logout'],
      products: ['GET /api/products', 'POST /api/products', 'PUT /api/products/:id', 'DELETE /api/products/:id'],
      transactions: ['GET /api/transactions', 'POST /api/transactions', 'PUT /api/transactions/:id', 'DELETE /api/transactions/:id'],
      data: ['POST /api/data/import', 'GET /api/data/export', 'DELETE /api/data/clear']
    }
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  
  // 速率限制
  const rateLimit = checkRateLimit(ip)
  if (!rateLimit.allowed) {
    log(`注册被限制 - IP: ${ip}, 原因: 请求过于频繁`, 'WARN')
    return res.status(429).json({ error: `请求过于频繁，请 ${rateLimit.retryAfter} 分钟后重试` })
  }
  
  // 输入验证
  const usernameError = validateUsername(username)
  if (usernameError) return res.status(400).json({ error: usernameError })
  
  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ error: passwordError })
  
  const trimmedUsername = username.trim()
  
  try {
    const hashedPassword = await hashPassword(password)
    const userId = generateId()
    
    db.run('INSERT INTO users (id, username, password, createdAt) VALUES (?, ?, ?, ?)',
      [userId, trimmedUsername, hashedPassword, Date.now()],
      (err) => {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            log(`注册失败 - 用户: ${trimmedUsername}, 原因: 用户名已存在`, 'WARN')
            return res.status(400).json({ error: '用户名已存在' })
          }
          log(`注册失败 - 用户: ${trimmedUsername}, 错误: ${err.message}`, 'ERROR')
          return res.status(500).json({ error: '服务器内部错误' })
        }
        
        const token = generateToken()
        const expiresAt = Date.now() + SESSION_TTL
        sessions.set(token, { userId, username: trimmedUsername, createdAt: Date.now(), expiresAt })
        log(`注册成功 - 用户: ${trimmedUsername}, userId: ${userId}`)
        res.json({ success: true, token, username: trimmedUsername })
      })
  } catch (e) {
    log(`注册异常 - 用户: ${trimmedUsername}, 错误: ${e.message}`, 'ERROR')
    res.status(500).json({ error: '服务器内部错误' })
  }
})

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  
  // 速率限制
  const rateLimit = checkRateLimit(ip)
  if (!rateLimit.allowed) {
    log(`登录被限制 - IP: ${ip}, 原因: 请求过于频繁`, 'WARN')
    return res.status(429).json({ error: `请求过于频繁，请 ${rateLimit.retryAfter} 分钟后重试` })
  }
  
  // 输入验证
  const usernameError = validateUsername(username)
  if (usernameError) return res.status(400).json({ error: usernameError })
  
  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ error: passwordError })
  
  const trimmedUsername = username.trim()
  
  db.get('SELECT * FROM users WHERE username = ?', [trimmedUsername], async (err, user) => {
    if (err) {
      log(`登录失败 - 用户: ${trimmedUsername}, 错误: ${err.message}`, 'ERROR')
      return res.status(500).json({ error: '服务器内部错误' })
    }
    if (!user) {
      log(`登录失败 - 用户: ${trimmedUsername}, 原因: 用户不存在`, 'WARN')
      return res.status(401).json({ error: '用户名或密码错误' })
    }
    
    try {
      const isValid = await verifyPassword(password, user.password)
      if (!isValid) {
        log(`登录失败 - 用户: ${trimmedUsername}, 原因: 密码错误`, 'WARN')
        return res.status(401).json({ error: '用户名或密码错误' })
      }
      
      const token = generateToken()
      const expiresAt = Date.now() + SESSION_TTL
      sessions.set(token, { userId: user.id, username: user.username, createdAt: Date.now(), expiresAt })
      
      log(`登录成功 - 用户: ${trimmedUsername}`)
      res.json({ success: true, token, username: user.username })
    } catch (e) {
      log(`登录异常 - 用户: ${trimmedUsername}, 错误: ${e.message}`, 'ERROR')
      res.status(500).json({ error: '服务器内部错误' })
    }
  })
})

app.post('/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (token && sessions.has(token)) {
    const session = sessions.get(token)
    sessions.delete(token)
    log(`用户登出 - 用户: ${session?.username}`)
  }
  res.json({ success: true })
})

app.get('/auth/verify', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!token) {
    log('认证失败 - 缺少 token', 'WARN')
    return res.status(401).json({ error: '未授权' })
  }
  
  const session = sessions.get(token)
  if (!session) {
    log('认证失败 - token 已过期或无效', 'WARN')
    return res.status(401).json({ error: '登录已过期' })
  }
  
  // 检查会话是否过期
  if (session.expiresAt && Date.now() > session.expiresAt) {
    sessions.delete(token)
    log('认证失败 - 会话已过期', 'WARN')
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
  
  res.json({ success: true, username: session.username, userId: session.userId })
})

const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!token) {
    log(`鉴权失败 - ${req.method} ${req.originalUrl}: 缺少 token`, 'WARN')
    return res.status(401).json({ error: '未授权' })
  }
  
  const session = sessions.get(token)
  if (!session) {
    log(`鉴权失败 - ${req.method} ${req.originalUrl}: token 已过期`, 'WARN')
    return res.status(401).json({ error: '登录已过期' })
  }
  
  // 检查会话是否过期
  if (session.expiresAt && Date.now() > session.expiresAt) {
    sessions.delete(token)
    log(`鉴权失败 - ${req.method} ${req.originalUrl}: 会话已过期`, 'WARN')
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
  
  req.userId = session.userId
  next()
}

app.get('/api/products', authenticate, (req, res) => {
  db.all('SELECT * FROM products WHERE userId = ? ORDER BY createdAt DESC', [req.userId], (err, rows) => {
    if (err) {
      log(`查询产品列表失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
      res.status(500).json({ error: err.message })
    } else {
      log(`查询产品列表 - userId: ${req.userId}, 数量: ${rows?.length || 0}`)
      res.json(rows)
    }
  })
})

app.post('/api/products', authenticate, (req, res) => {
  const products = req.body
  log(`保存产品列表 - userId: ${req.userId}, 数量: ${products?.length || 0}`)
  db.run('BEGIN TRANSACTION', () => {
    db.run('DELETE FROM products WHERE userId = ?', [req.userId], (err) => {
      if (err) {
        log(`清空产品失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        db.run('ROLLBACK')
        return res.status(500).json({ error: '清空旧数据失败' })
      }
      const stmt = db.prepare('INSERT OR REPLACE INTO products (id, userId, name, type, code, note, holder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      products.forEach(p => {
        stmt.run(p.id, req.userId, p.name, p.type, p.code || '', p.note || '', p.holder || '', p.createdAt)
      })
      stmt.finalize((err) => {
        if (err) {
          log(`写入产品失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
          db.run('ROLLBACK')
          return res.status(500).json({ error: '数据写入失败' })
        }
        db.run('COMMIT', (err) => {
          if (err) {
            log(`产品事务提交失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
            db.run('ROLLBACK')
            return res.status(500).json({ error: '事务提交失败' })
          }
          log(`保存产品成功 - userId: ${req.userId}, 数量: ${products.length}`)
          res.json({ success: true })
        })
      })
    })
  })
})

app.get('/api/transactions', authenticate, (req, res) => {
  db.all('SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC', [req.userId], (err, rows) => {
    if (err) {
      log(`查询交易记录失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
      res.status(500).json({ error: err.message })
    } else {
      log(`查询交易记录 - userId: ${req.userId}, 数量: ${rows?.length || 0}`)
      res.json(rows)
    }
  })
})

app.post('/api/transactions', authenticate, (req, res) => {
  const transactions = req.body
  
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: '数据格式错误，应为数组' })
  }
  
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i]
    if (!t.id) {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 id` })
    }
    if (!t.productId) {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 productId` })
    }
    if (!t.type) {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 type` })
    }
    if (t.date === undefined || t.date === null || t.date === '') {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 date` })
    }
    if (t.amount === undefined || t.amount === null) {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 amount` })
    }
    if (t.price === undefined || t.price === null) {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 price` })
    }
    if (t.shares === undefined || t.shares === null) {
      return res.status(400).json({ error: `第 ${i + 1} 条记录缺少 shares` })
    }
  }
  
  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      log(`事务开始失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
      return res.status(500).json({ error: '事务开始失败' })
    }
    
    db.run('DELETE FROM transactions WHERE userId = ?', [req.userId], (err) => {
      if (err) {
        log(`删除交易记录失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        db.run('ROLLBACK', () => {
          res.status(500).json({ error: '删除记录失败' })
        })
        return
      }
      
      const stmt = db.prepare('INSERT OR REPLACE INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      let completed = 0
      let hasError = false
      
      transactions.forEach((t, index) => {
        stmt.run(t.id, req.userId, t.productId, t.type, t.date, t.amount, t.price, t.shares, t.fee || 0, t.note || '', (err) => {
          if (err && !hasError) {
            hasError = true
            log(`第 ${index + 1} 条交易记录写入失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
            stmt.finalize(() => {
              db.run('ROLLBACK', () => {
                res.status(500).json({ error: `第 ${index + 1} 条记录写入失败: ${err.message}` })
              })
            })
            return
          }
          
          completed++
          if (completed === transactions.length && !hasError) {
            stmt.finalize((err) => {
              if (err) {
                log(`语句执行失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
                db.run('ROLLBACK', () => {
                  res.status(500).json({ error: '数据写入失败' })
                })
                return
              }
              
              db.run('COMMIT', (err) => {
                if (err) {
                  log(`事务提交失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
                  db.run('ROLLBACK', () => {
                    res.status(500).json({ error: '事务提交失败' })
                  })
                } else {
                  log(`批量导入交易记录成功 - 用户: ${req.userId}, 数量: ${transactions.length}`)
                  res.json({ success: true })
                }
              })
            })
          }
        })
      })
    })
  })
})

// 单条事务接口 - 避免全量替换覆盖调度器写入的数据
app.post('/transactions/add', authenticate, (req, res) => {
  const { id, productId, type, date, amount, price, shares, fee, note } = req.body
  if (!id || !productId || !type || date === undefined || date === null) {
    return res.status(400).json({ error: '缺少必填字段' })
  }
  db.run(
    'INSERT INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.userId, productId, type, date, amount || 0, price || 0, shares || 0, fee || 0, note || ''],
    (err) => {
      if (err) {
        log(`添加事务失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        return res.status(500).json({ error: err.message })
      }
      log(`添加事务成功 - 用户: ${req.userId}, id: ${id}`)
      res.json({ success: true, id })
    }
  )
})

app.put('/transactions/:id', authenticate, (req, res) => {
  const { id } = req.params
  const { productId, type, date, amount, price, shares, fee, note } = req.body
  db.run(
    'UPDATE transactions SET productId = ?, type = ?, date = ?, amount = ?, price = ?, shares = ?, fee = ?, note = ? WHERE id = ? AND userId = ?',
    [productId, type, date, amount, price, shares, fee, note, id, req.userId],
    function (err) {
      if (err) {
        log(`更新事务失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        return res.status(500).json({ error: err.message })
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '事务不存在' })
      }
      log(`更新事务成功 - 用户: ${req.userId}, id: ${id}`)
      res.json({ success: true })
    }
  )
})

app.delete('/transactions/:id', authenticate, (req, res) => {
  const { id } = req.params
  db.run(
    'DELETE FROM transactions WHERE id = ? AND userId = ?',
    [id, req.userId],
    function (err) {
      if (err) {
        log(`删除事务失败 - 用户: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        return res.status(500).json({ error: err.message })
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '事务不存在' })
      }
      log(`删除事务成功 - 用户: ${req.userId}, id: ${id}`)
      res.json({ success: true })
    }
  )
})

app.get('/products', authenticate, (req, res) => {
  db.all('SELECT * FROM products WHERE userId = ? ORDER BY createdAt DESC', [req.userId], (err, rows) => {
    if (err) {
      log(`[legacy] 查询产品失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
      res.status(500).json({ error: err.message })
    } else {
      log(`[legacy] 查询产品 - userId: ${req.userId}, 数量: ${rows?.length || 0}`)
      res.json(rows)
    }
  })
})

app.post('/products', authenticate, (req, res) => {
  const products = req.body
  log(`[legacy] 保存产品 - userId: ${req.userId}, 数量: ${products?.length || 0}`)
  db.run('BEGIN TRANSACTION', () => {
    db.run('DELETE FROM products WHERE userId = ?', [req.userId], (err) => {
      if (err) {
        log(`[legacy] 清空产品失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        db.run('ROLLBACK')
        return res.status(500).json({ error: '清空旧数据失败' })
      }
      const stmt = db.prepare('INSERT OR REPLACE INTO products (id, userId, name, type, code, note, holder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      products.forEach(p => {
        stmt.run(p.id, req.userId, p.name, p.type, p.code || '', p.note || '', p.holder || '', p.createdAt)
      })
      stmt.finalize((err) => {
        if (err) {
          log(`[legacy] 写入产品失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
          db.run('ROLLBACK')
          return res.status(500).json({ error: '数据写入失败' })
        }
        db.run('COMMIT', (err) => {
          if (err) {
            log(`[legacy] 产品事务提交失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
            db.run('ROLLBACK')
            return res.status(500).json({ error: '事务提交失败' })
          }
          log(`[legacy] 保存产品成功 - userId: ${req.userId}, 数量: ${products.length}`)
          res.json({ success: true })
        })
      })
    })
  })
})

app.get('/transactions', authenticate, (req, res) => {
  db.all('SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC', [req.userId], (err, rows) => {
    if (err) {
      log(`[legacy] 查询交易失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
      res.status(500).json({ error: err.message })
    } else {
      log(`[legacy] 查询交易 - userId: ${req.userId}, 数量: ${rows?.length || 0}`)
      res.json(rows)
    }
  })
})

app.post('/transactions', authenticate, (req, res) => {
  const transactions = req.body
  log(`[legacy] 保存交易 - userId: ${req.userId}, 数量: ${transactions?.length || 0}`)
  db.run('BEGIN TRANSACTION', () => {
    db.run('DELETE FROM transactions WHERE userId = ?', [req.userId], (err) => {
      if (err) {
        log(`[legacy] 清空交易失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
        db.run('ROLLBACK')
        return res.status(500).json({ error: '清空旧数据失败' })
      }
      const stmt = db.prepare('INSERT OR REPLACE INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      transactions.forEach(t => {
        stmt.run(t.id, req.userId, t.productId, t.type, t.date, t.amount, t.price, t.shares, t.fee || 0, t.note || '')
      })
      stmt.finalize((err) => {
        if (err) {
          log(`[legacy] 写入交易失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
          db.run('ROLLBACK')
          return res.status(500).json({ error: '数据写入失败' })
        }
        db.run('COMMIT', (err) => {
          if (err) {
            log(`[legacy] 交易事务提交失败 - userId: ${req.userId}, 错误: ${err.message}`, 'ERROR')
            db.run('ROLLBACK')
            return res.status(500).json({ error: '事务提交失败' })
          }
          log(`[legacy] 保存交易成功 - userId: ${req.userId}, 数量: ${transactions.length}`)
          res.json({ success: true })
        })
      })
    })
  })
})

app.post('/batch-import', authenticate, (req, res) => {
  const { products, transactions } = req.body

  const result = {
    success: true,
    products: {
      total: 0,
      imported: 0,
      skipped: 0,
      skippedNames: []
    },
    transactions: {
      total: 0,
      imported: 0,
      skipped: 0,
      skippedDetails: []
    }
  }

  result.products.total = products?.length || 0
  result.transactions.total = transactions?.length || 0

  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      log(`批量导入 - 事务开始失败: ${err.message}`, 'ERROR')
      return res.status(500).json({ success: false, error: '事务开始失败' })
    }

    const existingProductCodeMap = new Map()
    const productCodeMap = new Map()

    db.all('SELECT id, code FROM products WHERE userId = ?', [req.userId], (err, existingProducts) => {
      if (err) {
        log(`批量导入 - 查询已有产品失败: ${err.message}`, 'ERROR')
        db.run('ROLLBACK')
        return res.status(500).json({ success: false, error: '查询已有产品失败' })
      }

      existingProducts.forEach((p) => {
        if (p.code) {
          existingProductCodeMap.set(p.code, p.id)
          productCodeMap.set(p.code, p.id)
        }
      })

      if (!products || products.length === 0) {
        processTransactions()
        return
      }

      const stmtProduct = db.prepare('INSERT INTO products (id, userId, name, type, code, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      let productDone = 0

      products.forEach((product) => {
        if (productCodeMap.has(product.code)) {
          result.products.skipped++
          result.products.skippedNames.push(product.name)
          productCodeMap.set(product.code, productCodeMap.get(product.code))
          productDone++
          if (productDone === products.length) {
            stmtProduct.finalize()
            processTransactions()
          }
          return
        }

        stmtProduct.run(product.id, req.userId, product.name, product.type, product.code || '', product.note || '', product.createdAt, (err) => {
          if (err) {
            log(`批量导入 - 产品插入失败: ${product.name}, 错误: ${err.message}`, 'ERROR')
            db.run('ROLLBACK')
            return res.status(500).json({ success: false, error: `产品「${product.name}」插入失败: ${err.message}` })
          }
          result.products.imported++
          productCodeMap.set(product.code, product.id)
          productDone++
          if (productDone === products.length) {
            stmtProduct.finalize()
            processTransactions()
          }
        })
      })
    })

    function processTransactions() {
      if (!transactions || transactions.length === 0) {
        db.run('COMMIT', (err) => {
          if (err) {
            log(`批量导入 - 提交事务失败: ${err.message}`, 'ERROR')
            return res.status(500).json({ success: false, error: '提交事务失败' })
          }
          log(`批量导入完成 - 用户: ${req.userId}, 产品: 导入${result.products.imported}/跳过${result.products.skipped}, 交易: 导入${result.transactions.imported}/跳过${result.transactions.skipped}`)
          res.json(result)
        })
        return
      }

      const existingTxSet = new Set()
      db.all('SELECT productId, date, type, amount FROM transactions WHERE userId = ?', [req.userId], (err, existingTx) => {
        if (err) {
          log(`批量导入 - 查询已有交易失败: ${err.message}`, 'ERROR')
          db.run('ROLLBACK')
          return res.status(500).json({ success: false, error: '查询已有交易失败' })
        }

        existingTx.forEach((t) => {
          existingTxSet.add(`${t.productId}-${t.date}-${t.type}-${t.amount}`)
        })

        const stmtTx = db.prepare('INSERT INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        let txDone = 0

        transactions.forEach((t) => {
          const realProductId = productCodeMap.get(t.productCode) || t.productId
          const txKey = `${realProductId}-${t.date}-${t.type}-${t.amount}`

          if (existingTxSet.has(txKey)) {
            result.transactions.skipped++
            const productName = (products?.find((p) => p.code === t.productCode)?.name) || (products?.find((p) => p.id === t.productId)?.name) || '未知产品'
            result.transactions.skippedDetails.push({
              productName,
              date: new Date(t.date).toLocaleDateString('zh-CN'),
              amount: t.amount
            })
            txDone++
            if (txDone === transactions.length) {
              stmtTx.finalize()
              finishImport()
            }
            return
          }

          stmtTx.run(t.id, req.userId, realProductId, t.type, t.date, t.amount, t.price, t.shares, t.fee || 0, t.note || '', (err) => {
            if (err) {
              log(`批量导入 - 交易插入失败: ${err.message}`, 'ERROR')
              db.run('ROLLBACK')
              return res.status(500).json({ success: false, error: `交易插入失败: ${err.message}` })
            }
            result.transactions.imported++
            existingTxSet.add(txKey)
            txDone++
            if (txDone === transactions.length) {
              stmtTx.finalize()
              finishImport()
            }
          })
        })
      })
    }

    function finishImport() {
      db.run('COMMIT', (err) => {
        if (err) {
          log(`批量导入 - 提交事务失败: ${err.message}`, 'ERROR')
          return res.status(500).json({ success: false, error: '提交事务失败' })
        }
        log(`批量导入完成 - 用户: ${req.userId}, 产品: 导入${result.products.imported}/跳过${result.products.skipped}, 交易: 导入${result.transactions.imported}/跳过${result.transactions.skipped}`)
        res.json(result)
      })
    }
  })
})

// ==================== 定时净值更新调度器 ====================

// 每天4次定时更新时间（HH:mm 格式，北京时间）
const SCHEDULE_TIMES = ['09:30', '12:00', '15:00', '20:00']

// 记录每个时间点今天是否已执行过，避免重复执行
const scheduleRunLog = new Map() // key: 'HH:mm', value: 'YYYY-MM-DD'

// 调度器状态
const schedulerState = {
  enabled: true,
  lastRunTime: null,      // ISO string
  lastRunSummary: null,   // 上次运行摘要
  totalRuns: 0,
  nextRunTime: null       // 预计下次运行时间
}

/**
 * 发起 HTTP/HTTPS 请求（不依赖 axios）
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.get(url, { timeout: 15000, ...options }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

/**
 * 从东方财富获取基金净值（服务端直接调用，无需 Vite 代理）
 */
async function fetchFundNavServer(fundCode) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`
  const { status, data: text } = await httpRequest(url, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  if (status !== 200 || !text || text.length < 100) {
    throw new Error(`基金 ${fundCode} 数据获取失败 (HTTP ${status})`)
  }

  const nameMatch = text.match(/var Data_fundName\s*=\s*['"]([^'"]+)['"]/)
  const fundName = nameMatch ? nameMatch[1] : ''

  const trendMatch = text.match(/var Data_netWorthTrend\s*=\s*(\[[\s\S]+?\]);/)
  if (!trendMatch) {
    throw new Error(`基金 ${fundCode} 净值数据解析失败`)
  }

  const trendData = JSON.parse(trendMatch[1])
  if (!trendData || trendData.length === 0) {
    throw new Error(`基金 ${fundCode} 暂无净值数据`)
  }

  const last = trendData[trendData.length - 1]
  const lastDate = new Date(last.x)
  const dateStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`

  // 计算当日收益率（与上一个交易日净值对比）
  let dailyReturn = null
  if (trendData.length >= 2) {
    const prev = trendData[trendData.length - 2]
    if (prev.y > 0) {
      dailyReturn = Math.round(((last.y - prev.y) / prev.y) * 10000) / 100 // 百分比，保留两位小数
    }
  }

  return { nav: last.y, date: dateStr, name: fundName, dailyReturn }
}

/**
 * 从爬虫服务获取招银理财产品净值
 */
async function fetchCmbNavServer(productCode) {
  const url = `http://localhost:3001/api/scrape/cmb?code=${encodeURIComponent(productCode)}`
  const { status, data: text } = await httpRequest(url)

  if (status !== 200) {
    throw new Error(`招银理财 ${productCode} 请求失败 (HTTP ${status})`)
  }

  const result = JSON.parse(text)
  if (!result.success || !result.data) {
    throw new Error(result.error || '招银理财净值查询失败')
  }

  return result.data // { nav, date, name }
}

/**
 * 从爬虫服务获取招银理财产品历史净值
 */
async function fetchCmbNavHistoryServer(productCode, days = 10) {
  const url = `http://localhost:3001/api/scrape/cmb/history?code=${encodeURIComponent(productCode)}&days=${days}`
  const { status, data: text } = await httpRequest(url)

  if (status !== 200) {
    throw new Error(`招银理财历史 ${productCode} 请求失败 (HTTP ${status})`)
  }

  const result = JSON.parse(text)
  if (!result.success || !result.data) {
    throw new Error(result.error || '招银理财历史净值查询失败')
  }

  return result.data // [{ nav, date, name }]
}

/**
 * 从东方财富获取基金阶段涨幅
 */
async function fetchFundStageGains(fundCode) {
  const url = `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jdzf&code=${fundCode}`
  const { status, data: text } = await httpRequest(url, {
    headers: {
      'Referer': 'http://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  if (status !== 200 || !text) {
    throw new Error(`基金 ${fundCode} 阶段涨幅获取失败 (HTTP ${status})`)
  }

  // 解析 HTML 内容，提取阶段涨幅数据
  const gains = {}
  const patterns = [
    { key: '1w', regex: /近1周<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: '1m', regex: /近1月<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: '3m', regex: /近3月<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: '6m', regex: /近6月<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: '1y', regex: /近1年<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: '2y', regex: /近2年<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: '3y', regex: /近3年<\/li><li class='tor[^']*'>([0-9.+-]+)%/ },
    { key: 'ytd', regex: /今年来<\/li><li class='tor[^']*'>([0-9.+-]+)%/ }
  ]

  for (const { key, regex } of patterns) {
    const match = text.match(regex)
    if (match) {
      gains[key] = parseFloat(match[1])
    }
  }

  return gains
}

/**
 * 解析净值日期字符串为时间戳
 */
function parseNavDate(dateStr) {
  if (!dateStr) return Date.now()
  const cleaned = dateStr.trim()
  if (/^\d{8}$/.test(cleaned)) {
    return new Date(
      parseInt(cleaned.substring(0, 4)),
      parseInt(cleaned.substring(4, 6)) - 1,
      parseInt(cleaned.substring(6, 8))
    ).getTime()
  }
  const parts = cleaned.split(/[-/]/)
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime()
  }
  return Date.now()
}

/**
 * 获取当天零点时间戳（用于日期比较）
 */
function getDateOnlyTimestamp(ts) {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * 执行一次净值更新
 */
async function runNavUpdate() {
  const startTime = Date.now()
  log('[NAV调度] 开始执行定时净值更新...')

  const summary = { total: 0, success: 0, skipped: 0, failed: 0, details: [] }

  try {
    // 查询所有有代码的产品
    const products = await new Promise((resolve, reject) => {
      db.all('SELECT id, userId, name, type, code FROM products WHERE code IS NOT NULL AND code != ""', [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    summary.total = products.length
    log(`[NAV调度] 找到 ${products.length} 个有代码的产品需要更新`)

    // 按用户分组处理
    const byUser = new Map()
    for (const p of products) {
      if (!byUser.has(p.userId)) byUser.set(p.userId, [])
      byUser.get(p.userId).push(p)
    }

    for (const [userId, userProducts] of byUser) {
      // 查询该用户所有 nav_update 交易（不限于今天，因为净值日期可能是昨天）
      const allNavTxRows = await new Promise((resolve, reject) => {
        db.all(
          'SELECT productId, date FROM transactions WHERE userId = ? AND type = "nav_update"',
          [userId],
          (err, rows) => { if (err) reject(err); else resolve(rows || []) }
        )
      })

      // 构建已更新产品的日期集合（productId -> Set<dateTimestamp>）
      const updatedMap = new Map()
      for (const tx of allNavTxRows) {
        if (!updatedMap.has(tx.productId)) updatedMap.set(tx.productId, new Set())
        updatedMap.get(tx.productId).add(getDateOnlyTimestamp(tx.date))
      }

      for (const product of userProducts) {
        try {
          let result
          if (product.type === 'fund') {
            result = await fetchFundNavServer(product.code)
          } else {
            result = await fetchCmbNavServer(product.code)
          }

          const navDateTs = parseNavDate(result.date)
          const navDateKey = getDateOnlyTimestamp(navDateTs)

          // 检查该产品在净值日期是否已有 nav_update 记录
          const existingDates = updatedMap.get(product.id)
          if (existingDates && existingDates.has(navDateKey)) {
            summary.skipped++
            summary.details.push({ name: product.name, code: product.code, status: 'skipped', reason: '净值已存在' })
            log(`[NAV调度] 跳过 ${product.name} (${product.code}) - 净值日期 ${result.date} 的记录已存在`, 'DEBUG')
            continue
          }

          // 插入 nav_update 交易
          const sourceLabel = product.type === 'fund' ? '天天基金' : '招银理财'
          const updateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          const note = `${sourceLabel}定时更新 - ${updateTime}`

          const txId = generateId()
          await new Promise((resolve, reject) => {
            db.run(
              'INSERT INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [txId, userId, product.id, 'nav_update', navDateTs, 0, result.nav, 0, 0, note],
              (err) => { if (err) reject(err); else resolve() }
            )
          })

          // 更新已记录集合
          if (!updatedMap.has(product.id)) updatedMap.set(product.id, new Set())
          updatedMap.get(product.id).add(navDateKey)

          summary.success++
          summary.details.push({ name: product.name, code: product.code, status: 'success', nav: result.nav, date: result.date })
          log(`[NAV调度] 更新成功: ${product.name} (${product.code}), nav=${result.nav}, date=${result.date}`)

          // 固收理财：同步缓存历史净值，避免前端页面加载时再爬取
          if (product.type !== 'fund') {
            try {
              const history = await fetchCmbNavHistoryServer(product.code, 10)
              const cacheKey = `cmb_history_${product.code}_10`
              await setCache(cacheKey, history, CMB_HISTORY_CACHE_TTL)
              log(`[NAV调度] 已缓存历史净值: ${product.name} (${product.code}), 条数: ${history.length}`)
            } catch (histErr) {
              log(`[NAV调度] 缓存历史净值失败: ${product.name} (${product.code}), 错误: ${histErr.message}`, 'WARN')
            }
          }

        } catch (e) {
          summary.failed++
          summary.details.push({ name: product.name, code: product.code, status: 'failed', error: e.message })
          log(`[NAV调度] 更新失败: ${product.name} (${product.code}), 错误: ${e.message}`, 'ERROR')
        }
      }
    }

  } catch (e) {
    log(`[NAV调度] 执行异常: ${e.message}`, 'ERROR')
    summary.error = e.message
  }

  const elapsed = Date.now() - startTime
  schedulerState.lastRunTime = new Date().toISOString()
  schedulerState.lastRunSummary = summary
  schedulerState.totalRuns++

  log(`[NAV调度] 执行完成, 耗时 ${elapsed}ms, 总计: ${summary.total}, 成功: ${summary.success}, 跳过: ${summary.skipped}, 失败: ${summary.failed}`)

  return summary
}

/**
 * 获取当前北京时间 HH:mm
 */
function getCurrentBeijingTime() {
  const now = new Date()
  const beijingOff = 8 * 60 // UTC+8
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const beijing = new Date(utcMs + beijingOff * 60000)
  const hh = String(beijing.getHours()).padStart(2, '0')
  const mm = String(beijing.getMinutes()).padStart(2, '0')
  const yyyy = beijing.getFullYear()
  const MM = String(beijing.getMonth() + 1).padStart(2, '0')
  const DD = String(beijing.getDate()).padStart(2, '0')
  return { hhmm: `${hh}:${mm}`, dateStr: `${yyyy}-${MM}-${DD}` }
}

/**
 * 计算下一个调度时间
 */
function getNextScheduleTime() {
  const { hhmm } = getCurrentBeijingTime()
  // 找到今天剩余的调度时间，或明天第一个
  const todayNext = SCHEDULE_TIMES.filter(t => t > hhmm)
  if (todayNext.length > 0) {
    return `今天 ${todayNext[0]}`
  }
  return `明天 ${SCHEDULE_TIMES[0]}`
}

/**
 * 每分钟检查是否到达调度时间
 */
let schedulerInterval = null

function startScheduler() {
  if (!schedulerState.enabled) {
    log('[NAV调度] 调度器未启用，不启动')
    return
  }

  log(`[NAV调度] 定时调度器已启动, 调度时间: ${SCHEDULE_TIMES.join(', ')} (北京时间)`)
  schedulerState.nextRunTime = getNextScheduleTime()

  schedulerInterval = setInterval(() => {
    if (!schedulerState.enabled) return

    const { hhmm, dateStr } = getCurrentBeijingTime()

    for (const scheduleTime of SCHEDULE_TIMES) {
      if (hhmm === scheduleTime) {
        const lastRunDate = scheduleRunLog.get(scheduleTime)
        if (lastRunDate === dateStr) {
          // 今天这个时间点已经执行过，跳过
          continue
        }

        log(`[NAV调度] 到达调度时间 ${scheduleTime}, 开始执行...`)
        scheduleRunLog.set(scheduleTime, dateStr)

        // 异步执行，不阻塞定时器
        runNavUpdate().catch(e => {
          log(`[NAV调度] 执行失败: ${e.message}`, 'ERROR')
        })

        schedulerState.nextRunTime = getNextScheduleTime()
      }
    }
  }, 60000) // 每分钟检查一次
}

// ==================== 调度器 API 端点 ====================

// 查询调度器状态
app.get('/api/nav-scheduler/status', (req, res) => {
  res.json({
    enabled: schedulerState.enabled,
    scheduleTimes: SCHEDULE_TIMES,
    nextRunTime: getNextScheduleTime(),
    lastRunTime: schedulerState.lastRunTime,
    lastRunSummary: schedulerState.lastRunSummary ? {
      total: schedulerState.lastRunSummary.total,
      success: schedulerState.lastRunSummary.success,
      skipped: schedulerState.lastRunSummary.skipped,
      failed: schedulerState.lastRunSummary.failed
    } : null,
    totalRuns: schedulerState.totalRuns
  })
})

// 手动触发净值更新
app.post('/api/nav-scheduler/run', async (req, res) => {
  log('[NAV调度] 收到手动触发请求')
  try {
    const summary = await runNavUpdate()
    res.json({ success: true, summary })
  } catch (e) {
    log(`[NAV调度] 手动触发失败: ${e.message}`, 'ERROR')
    res.status(500).json({ success: false, error: e.message })
  }
})

// 启用/禁用调度器
app.post('/api/nav-scheduler/toggle', (req, res) => {
  schedulerState.enabled = !schedulerState.enabled
  log(`[NAV调度] 调度器${schedulerState.enabled ? '已启用' : '已禁用'}`)
  res.json({ enabled: schedulerState.enabled })
})

/**
 * 从东方财富获取基金前十大重仓股
 */
async function fetchFundHoldings(fundCode) {
  const url = `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10`
  const { status, data: text } = await httpRequest(url, {
    headers: {
      'Referer': 'http://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  if (status !== 200 || !text) {
    throw new Error(`基金 ${fundCode} 持仓数据获取失败 (HTTP ${status})`)
  }

  // 提取报告截止日期
  const dateMatch = text.match(/截止至：<font[^>]*>([^<]+)<\/font>/)
  const reportDate = dateMatch ? dateMatch[1].trim() : ''

  // 只取第一个表格（最新报告期）的数据
  const firstTableEnd = text.indexOf('</table>')
  const firstTable = firstTableEnd > 0 ? text.substring(0, firstTableEnd) : text

  // 提取股票持仓表格行（兼容A股、港股、美股、日股等代码格式）
  const stocks = []
  const rowRegex = /<tr><td>(\d+)<\/td><td[^>]*>(?:<a[^>]*>|<span[^>]*>)([^<]+)(?:<\/a>|<\/span>)<\/td><td[^>]*>(?:<a[^>]*>|<span[^>]*>)([^<]+)(?:<\/a>|<\/span>)<\/td>[\s\S]*?<td[^>]*>([\d.]+%)<\/td><td[^>]*>([\d,.]+)<\/td><td[^>]*>([\d,.]+)<\/td><\/tr>/g
  let match
  while ((match = rowRegex.exec(firstTable)) !== null) {
    stocks.push({
      index: parseInt(match[1]),
      code: match[2],
      name: match[3],
      ratio: parseFloat(match[4].replace('%', '')),
      shares: parseFloat(match[5].replace(/,/g, '')),
      marketValue: parseFloat(match[6].replace(/,/g, ''))
    })
  }

  return { stocks, reportDate }
}

/**
 * 获取单只股票的行业分类
 * @param {string} stockCode - 股票代码（如 600519, 000858）
 * @returns {Promise<string|null>} 行业名称，如 "酿酒行业"
 */
async function fetchStockIndustry(stockCode) {
  // 判断市场：6开头为上海，其他为深圳
  const prefix = stockCode.startsWith('6') ? 'SH' : 'SZ'
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code=${prefix}${stockCode}`
  
  try {
    const { status, data } = await httpRequest(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://quote.eastmoney.com/'
      }
    })
    
    if (status !== 200 || !data) {
      return null
    }
    
    const json = JSON.parse(data)
    return json?.jbzl?.sshy || null
  } catch (e) {
    log(`[行业] 获取股票 ${stockCode} 行业失败: ${e.message}`, 'WARN')
    return null
  }
}

/**
 * 常见ETF联接基金到目标ETF的映射表
 * key: 联接基金代码, value: { code: 目标ETF代码, name: 目标ETF名称 }
 */
const ETF_FEEDER_MAP = {
  // 纳斯达克100ETF联接
  '000834': { code: '159513', name: '纳斯达克100ETF大成' },
  '000835': { code: '159513', name: '纳斯达克100ETF大成' },  // B份额
  '040046': { code: '159632', name: '纳斯达克ETF华安' },
  '040047': { code: '159632', name: '纳斯达克ETF华安' },  // 美元份额
  '006479': { code: '159941', name: '纳指ETF' },          // 广发纳斯达克100ETF联接
  '270042': { code: '159941', name: '纳指ETF' },          // 广发纳斯达克100指数
  '160140': { code: '159941', name: '纳指ETF' },          // 南方纳斯达克100
  '161125': { code: '159941', name: '纳指ETF' },          // 易方达标普信息科技
  '050025': { code: '513100', name: '纳指ETF国泰' },      // 博时标普500
  '016055': { code: '159513', name: '纳斯达克100ETF大成' }, // 博时纳斯达克100联接
  // 标普500ETF联接
  '050025': { code: '513500', name: '标普500ETF' },
  '008401': { code: '513500', name: '标普500ETF' },
  // 恒生科技ETF联接
  '012979': { code: '513180', name: '恒生科技ETF' },      // 大成恒生科技联接A
  '012980': { code: '513180', name: '恒生科技ETF' },      // 大成恒生科技联接C
  // 沪深300ETF联接
  '110020': { code: '510310', name: '沪深300ETF' },
  '002987': { code: '510310', name: '沪深300ETF' },
  // 中韩半导体ETF联接
  '019454': { code: '513310', name: '中韩半导体ETF' },    // 华泰柏瑞中韩半导体ETF联接A
  '019455': { code: '513310', name: '中韩半导体ETF' },    // 华泰柏瑞中韩半导体ETF联接C
  // 中证500ETF联接
  '162216': { code: '510510', name: '500ETF' },
  '003015': { code: '510510', name: '500ETF' },
}

/**
 * 查找ETF联接基金的目标ETF
 */
async function findTargetETF(fundCode, fundName) {
  // 优先查找映射表
  if (ETF_FEEDER_MAP[fundCode]) {
    const target = ETF_FEEDER_MAP[fundCode]
    log(`[持仓] ETF联接基金 ${fundCode} → 目标ETF: ${target.name}(${target.code}) [映射表]`)
    return target
  }

  // 如果名称不包含“ETF联接”或“ETF发起式联接”，则不是联接基金
  if (!fundName || !fundName.includes('ETF')) return null

  // 提取指数关键词
  const indexMatch = fundName.match(/([\u4e00-\u9fa5A-Za-z0-9]+?)(?:ETF联接|ETF发起式联接|ETF发起式)/)
  if (!indexMatch) return null
  const indexName = indexMatch[1]

  // 通过东方财富搜索
  const searchUrl = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchPageAPI.ashx?m=1&key=${encodeURIComponent(indexName + 'ETF')}&pageindex=1&pagesize=20`
  const { status, data } = await httpRequest(searchUrl, {
    headers: { 'Referer': 'http://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' }
  })
  if (status !== 200 || !data) return null

  try {
    const json = JSON.parse(data)
    if (!json.Datas) return null

    // 过滤出非联接的ETF
    const etfs = json.Datas.filter(d =>
      d.NAME.includes('ETF') &&
      !d.NAME.includes('联接') &&
      !d.NAME.includes('发起式') &&
      d.NAME.includes(indexName)
    )

    if (etfs.length > 0) {
      log(`[持仓] ETF联接基金 "${fundName}" → 目标ETF: ${etfs[0].NAME}(${etfs[0].CODE}) [搜索]`)
      return { code: etfs[0].CODE, name: etfs[0].NAME }
    }
  } catch {}

  return null
}

/**
 * 解析持仓HTML表格中的股票数据
 */
function parseStocksFromHTML(html) {
  const firstTableEnd = html.indexOf('</table>')
  const firstTable = firstTableEnd > 0 ? html.substring(0, firstTableEnd) : html

  const stocks = []
  const rowRegex = /<tr><td>(\d+)<\/td><td[^>]*>(?:<a[^>]*>|<span[^>]*>)([^<]+)(?:<\/a>|<\/span>)<\/td><td[^>]*>(?:<a[^>]*>|<span[^>]*>)([^<]+)(?:<\/a>|<\/span>)<\/td>[\s\S]*?<td[^>]*>([\d.]+%)<\/td><td[^>]*>([\d,.]+)<\/td><td[^>]*>([\d,.]+)<\/td><\/tr>/g
  let match
  while ((match = rowRegex.exec(firstTable)) !== null) {
    stocks.push({
      index: parseInt(match[1]),
      code: match[2],
      name: match[3],
      ratio: parseFloat(match[4].replace('%', '')),
      shares: parseFloat(match[5].replace(/,/g, '')),
      marketValue: parseFloat(match[6].replace(/,/g, ''))
    })
  }
  return stocks
}

/**
 * 从东方财富获取基金资产配置
 */
async function fetchFundAssetAllocation(fundCode) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`
  const { status, data: text } = await httpRequest(url, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  if (status !== 200 || !text) {
    throw new Error(`基金 ${fundCode} 资产配置获取失败 (HTTP ${status})`)
  }

  const jsonMatch = text.match(/var Data_assetAllocation\s*=\s*(\{[\s\S]+?\})\s*;/)
  if (!jsonMatch) {
    throw new Error(`基金 ${fundCode} 资产配置数据解析失败`)
  }

  const data = JSON.parse(jsonMatch[1])
  const categories = data.categories || []
  const lastIndex = categories.length - 1

  if (lastIndex < 0) {
    throw new Error(`基金 ${fundCode} 无资产配置数据`)
  }

  const getSeriesValue = (name) => {
    const series = (data.series || []).find(s => s.name === name)
    return series && series.data[lastIndex] !== undefined ? series.data[lastIndex] : null
  }

  return {
    stockRatio: getSeriesValue('股票占净比'),
    bondRatio: getSeriesValue('债券占净比'),
    cashRatio: getSeriesValue('现金占净比'),
    netAsset: getSeriesValue('净资产'),
    reportDate: categories[lastIndex] || ''
  }
}

// ==================== 补全基金历史净值 API ====================

// db 异步封装
const dbGetAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
})
const dbAllAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
})
const dbRunAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (err) => err ? reject(err) : resolve())
})

/**
 * POST /api/fund/backfill-nav/:productId
 * 补全指定基金产品自成立以来的全部历史净值
 */
app.post('/fund/backfill-nav/:productId', async (req, res) => {
  try {
    const { productId } = req.params
    const product = await dbGetAsync('SELECT * FROM products WHERE id = ?', [productId])
    if (!product) return res.status(404).json({ error: '产品不存在' })
    if (product.type !== 'fund') return res.status(400).json({ error: '仅基金产品支持此功能' })
    if (!product.code) return res.status(400).json({ error: '基金代码缺失' })

    // 从东方财富获取全部历史净值
    const url = `https://fund.eastmoney.com/pingzhongdata/${product.code}.js`
    const { status, data: text } = await httpRequest(url, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    if (status !== 200 || !text || text.length < 100) {
      return res.status(500).json({ error: `基金 ${product.code} 数据获取失败 (HTTP ${status})` })
    }

    const trendMatch = text.match(/var Data_netWorthTrend\s*=\s*(\[[\s\S]+?\]);/)
    if (!trendMatch) {
      return res.status(500).json({ error: `基金 ${product.code} 净值数据解析失败` })
    }

    const trendData = JSON.parse(trendMatch[1])
    if (!trendData || trendData.length === 0) {
      return res.status(500).json({ error: `基金 ${product.code} 暂无净值数据` })
    }

    // 查询已有的 nav_update 记录
    const existingNavs = await dbAllAsync(
      'SELECT date FROM transactions WHERE productId = ? AND type = ?',
      [productId, 'nav_update']
    )
    const existingDateSet = new Set(existingNavs.map(t => getDateOnlyTimestamp(t.date)))

    // 过滤出缺失的净值记录
    const missingNavs = trendData.filter(item => {
      const ts = getDateOnlyTimestamp(item.x)
      return !existingDateSet.has(ts)
    })

    if (missingNavs.length === 0) {
      return res.json({ inserted: 0, total: trendData.length, message: '无缺失数据，已是完整' })
    }

    // 批量插入缺失的净值记录
    let inserted = 0
    for (const navItem of missingNavs) {
      const d = new Date(navItem.x)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const ts = getDateOnlyTimestamp(navItem.x)
      const txId = generateId()
      try {
        await dbRunAsync(
          'INSERT INTO transactions (id, userId, productId, type, date, amount, price, shares, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [txId, product.userId, productId, 'nav_update', ts, 0, navItem.y, 0, 0, `历史补全 - ${dateStr}`]
        )
        inserted++
      } catch (e) {
        log(`[补全净值] 插入失败: ${dateStr} nav=${navItem.y}, 错误: ${e.message}`, 'ERROR')
      }
    }

    log(`[补全净值] ${product.name} (${product.code}): 共 ${trendData.length} 条, 新增 ${inserted} 条`)
    res.json({ inserted, total: trendData.length })
  } catch (e) {
    log(`[补全净值] 失败: ${e.message}`, 'ERROR')
    res.status(500).json({ error: e.message })
  }
})

// ==================== 基金阶段涨幅 API ====================

// 缓存有效期：1 小时
const STAGE_GAINS_TTL = 60 * 60 * 1000

app.get('/fund/stage-gains/:code', async (req, res) => {
  try {
    const { code } = req.params
    const { force = 'false' } = req.query
    const cacheKey = `stage_gains_${code}`
    
    // 如果非强制刷新，先尝试获取缓存
    if (force !== 'true') {
      const cached = await getCache(cacheKey)
      if (cached && !cached.isExpired) {
        log(`[StageGains] ${code} 命中缓存`)
        return res.json({ 
          success: true, 
          data: cached.data,
          fromCache: true,
          updatedAt: cached.updatedAt
        })
      }
    }
    
    // 缓存不存在或已过期，从网络获取
    const gains = await fetchFundStageGains(code)
    
    // 写入缓存
    await setCache(cacheKey, gains, STAGE_GAINS_TTL)
    
    res.json({ 
      success: true, 
      data: gains,
      fromCache: false
    })
  } catch (err) {
    log(`获取阶段涨幅失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

// 批量获取阶段涨幅
app.get('/fund/stage-gains-batch', async (req, res) => {
  try {
    const codes = (req.query.codes || '').split(',').filter(Boolean)
    if (codes.length === 0) {
      return res.json({ success: true, data: {} })
    }

    const results = {}
    const uncachedCodes = []

    // 先检查缓存
    for (const code of codes) {
      const cacheKey = `stage_gains_${code}`
      const cached = await getCache(cacheKey)
      if (cached && !cached.isExpired) {
        results[code] = cached.data
      } else {
        uncachedCodes.push(code)
      }
    }

    // 并行获取未缓存的数据
    if (uncachedCodes.length > 0) {
      log(`[StageGains批量] 未缓存: ${uncachedCodes.length} 只, 已缓存: ${codes.length - uncachedCodes.length} 只`)
      const fetchPromises = uncachedCodes.map(async (code) => {
        try {
          const gains = await fetchFundStageGains(code)
          await setCache(`stage_gains_${code}`, gains, STAGE_GAINS_TTL)
          results[code] = gains
        } catch (e) {
          log(`[StageGains批量] ${code} 获取失败: ${e.message}`, 'ERROR')
        }
      })
      await Promise.all(fetchPromises)
    }

    res.json({ success: true, data: results, cachedCount: codes.length - uncachedCodes.length })
  } catch (err) {
    log(`[StageGains批量] 失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ==================== 基金持仓信息 API ====================

app.get('/fund/holdings/:code', async (req, res) => {
  try {
    const { code } = req.params
    const [holdings, assetAllocation] = await Promise.all([
      fetchFundHoldings(code),
      fetchFundAssetAllocation(code)
    ])

    let stocks = holdings.stocks
    let allocation = assetAllocation
    let reportDate = holdings.reportDate || assetAllocation.reportDate
    let dataSource = null // 数据来源说明

    // 检测持仓数据是否过旧（超过6个月）
    const isStale = holdings.reportDate && (() => {
      const reportTime = new Date(holdings.reportDate).getTime()
      const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
      return reportTime < sixMonthsAgo
    })()

    // 如果数据过旧或无股票数据，尝试获取目标ETF持仓
    if ((isStale || stocks.length === 0) && (assetAllocation.stockRatio === null || assetAllocation.stockRatio <= 1)) {
      log(`[持仓] ${code} 数据过旧(${holdings.reportDate})或无股票数据，尝试查找目标ETF`)
      // 获取基金名称
      const nameUrl = `https://fund.eastmoney.com/pingzhongdata/${code}.js`
      const { data: nameText } = await httpRequest(nameUrl, {
        headers: { 'Referer': 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' }
      })
      const nameMatch = nameText?.match(/var fS_name\s*=\s*"([^"]+)"/)
      const fundName = nameMatch ? nameMatch[1] : ''
      log(`[持仓] ${code} 基金名称: ${fundName}`)

      const targetETF = await findTargetETF(code, fundName)
      if (targetETF) {
        log(`[持仓] ${code} 找到目标ETF: ${targetETF.name}(${targetETF.code})`)
        try {
          // 同时获取目标ETF的持仓和资产配置
          const [etfHoldings, etfAllocation] = await Promise.all([
            fetchFundHoldings(targetETF.code),
            fetchFundAssetAllocation(targetETF.code)
          ])
          if (etfHoldings.stocks.length > 0) {
            stocks = etfHoldings.stocks
            reportDate = etfHoldings.reportDate || reportDate
            dataSource = `数据来自目标ETF: ${targetETF.name}(${targetETF.code})`
            log(`[持仓] ${code} 使用目标ETF ${targetETF.code} 的持仓数据 (${etfHoldings.reportDate})`)
          }
          // 同步使用目标ETF的资产配置
          allocation = etfAllocation
          log(`[持仓] ${code} 使用目标ETF ${targetETF.code} 的资产配置 (股票:${etfAllocation.stockRatio}%)`)
        } catch (e) {
          log(`[持仓] 获取目标ETF ${targetETF.code} 数据失败: ${e.message}`, 'WARN')
        }
      } else {
        log(`[持仓] ${code} 未找到目标ETF`)
      }
    }

    res.json({
      success: true,
      data: {
        stocks,
        assetAllocation: allocation,
        reportDate,
        dataSource
      }
    })
  } catch (err) {
    log(`获取持仓信息失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ==================== 基金持仓汇总 API ====================

/**
 * 获取基金的有效持仓（支持 ETF 联接基金回退到目标 ETF）
 */
async function getEffectiveHoldings(fundCode) {
  const holdings = await fetchFundHoldings(fundCode)
  
  // 如果持仓数据过旧（超过6个月）或无股票数据，尝试获取目标 ETF 持仓
  const isStale = holdings.reportDate && (() => {
    const reportTime = new Date(holdings.reportDate).getTime()
    const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
    return reportTime < sixMonthsAgo
  })()
  
  if (isStale || holdings.stocks.length === 0) {
    // 检查是否在 ETF_FEEDER_MAP 中
    const targetETF = ETF_FEEDER_MAP[fundCode]
    if (targetETF) {
      log(`[汇总] ${fundCode} 数据过旧(${holdings.reportDate})，使用目标 ETF: ${targetETF.name}(${targetETF.code})`)
      try {
        const etfHoldings = await fetchFundHoldings(targetETF.code)
        if (etfHoldings.stocks.length > 0) {
          return etfHoldings
        }
      } catch (e) {
        log(`[汇总] 获取目标 ETF ${targetETF.code} 持仓失败: ${e.message}`, 'WARN')
      }
    }
  }
  
  return holdings
}

/**
 * 获取多只基金的持仓汇总，按市值加权合并
 * 请求参数: funds=code1:marketValue1,code2:marketValue2,...
 */
app.get('/fund/aggregated-holdings', async (req, res) => {
  try {
    const { funds } = req.query
    if (!funds) {
      return res.status(400).json({ success: false, error: '缺少 funds 参数' })
    }
    
    // 解析基金代码和市值
    const fundList = funds.split(',').map(item => {
      const [code, marketValue] = item.split(':')
      return { code, marketValue: parseFloat(marketValue) || 0 }
    }).filter(f => f.code && f.marketValue > 0)
    
    if (fundList.length === 0) {
      return res.json({ success: true, data: { stocks: [], totalValue: 0 } })
    }
    
    // 并发获取所有基金的持仓（支持 ETF 联接基金回退）
    const holdingsResults = await Promise.all(
      fundList.map(async (fund) => {
        try {
          const holdings = await getEffectiveHoldings(fund.code)
          return { ...fund, holdings }
        } catch (e) {
          log(`[汇总] 获取基金 ${fund.code} 持仓失败: ${e.message}`, 'WARN')
          return { ...fund, holdings: { stocks: [], reportDate: '' } }
        }
      })
    )
    
    // 汇总所有股票持仓
    const stockMap = new Map() // code -> { name, totalValue, funds: [] }
    
    for (const result of holdingsResults) {
      if (!result.holdings.stocks) continue
      
      for (const stock of result.holdings.stocks) {
        // 计算这只基金持有该股票的市值（基金市值 * 占比）
        const stockValue = result.marketValue * (stock.ratio / 100)
        
        if (!stockMap.has(stock.code)) {
          stockMap.set(stock.code, {
            code: stock.code,
            name: stock.name,
            totalValue: 0,
            funds: [] // 记录哪些基金持有该股票
          })
        }
        
        const entry = stockMap.get(stock.code)
        entry.totalValue += stockValue
        entry.funds.push({
          fundCode: result.code,
          ratio: stock.ratio,
          value: stockValue
        })
      }
    }
    
    // 转换为数组并排序
    const stocks = Array.from(stockMap.values())
      .map(s => ({
        ...s,
        totalValue: Math.round(s.totalValue * 100) / 100
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
    
    // 计算总市值
    const totalValue = stocks.reduce((sum, s) => sum + s.totalValue, 0)
    
    // 计算占比
    for (const stock of stocks) {
      stock.ratio = totalValue > 0 ? Math.round((stock.totalValue / totalValue) * 10000) / 100 : 0
    }
    
    res.json({
      success: true,
      data: {
        stocks,
        totalValue: Math.round(totalValue * 100) / 100,
        fundCount: fundList.length
      }
    })
  } catch (err) {
    log(`获取持仓汇总失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ==================== 股票行业分类 API ====================

app.get('/stock/industries', async (req, res) => {
  try {
    const { codes } = req.query
    if (!codes) {
      return res.status(400).json({ success: false, error: '缺少 codes 参数' })
    }
    
    const codeList = codes.split(',').filter(c => c && /^\d{6}$/.test(c))
    if (codeList.length === 0) {
      return res.json({ success: true, data: {} })
    }
    
    // 并发获取所有股票的行业信息
    const results = await Promise.all(
      codeList.map(async (code) => {
        const industry = await fetchStockIndustry(code)
        return { code, industry }
      })
    )
    
    // 构建返回对象
    const industryMap = {}
    for (const { code, industry } of results) {
      if (industry) {
        industryMap[code] = industry
      }
    }
    
    res.json({ success: true, data: industryMap })
  } catch (err) {
    log(`获取股票行业失败: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ==================== 固收理财历史净值缓存 API ====================

const CMB_HISTORY_CACHE_TTL = 12 * 60 * 60 * 1000 // 12 小时

/**
 * 获取固收理财历史净值（优先读缓存）
 */
app.get('/cmb/nav-history/:code', async (req, res) => {
  try {
    const { code } = req.params
    const days = parseInt(req.query.days) || 10
    const cacheKey = `cmb_history_${code}_${days}`

    // 检查缓存
    const cached = await getCache(cacheKey)
    if (cached && !cached.isExpired) {
      log(`[CMB历史] 缓存命中: ${code}, 条数: ${cached.data?.length || 0}`)
      return res.json({ success: true, data: cached.data, fromCache: true })
    }

    // 缓存过期或不存在，从爬虫获取
    log(`[CMB历史] 缓存未命中，开始爬取: ${code}`)
    const history = await fetchCmbNavHistoryServer(code, days)

    // 写入缓存
    await setCache(cacheKey, history, CMB_HISTORY_CACHE_TTL)

    res.json({ success: true, data: history, fromCache: false })
  } catch (err) {
    log(`[CMB历史] 获取失败: ${req.params.code}, 错误: ${err.message}`, 'ERROR')
    res.status(500).json({ success: false, error: err.message })
  }
})

process.on('uncaughtException', (err) => {
  log(`未捕获异常: ${err.message}\n${err.stack}`, 'ERROR')
  console.error('未捕获异常，服务即将重启:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log(`未处理的Promise拒绝: ${reason?.stack}`, 'ERROR')
  console.error('未处理的Promise拒绝:', reason)
})

const PORT = 3002
const server = app.listen(PORT, '0.0.0.0', () => {
  const message = `数据库服务已启动，监听端口: ${PORT}`
  log(message)
  // 启动定时净值更新调度器
  startScheduler()
})