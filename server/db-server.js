import express from 'express'
import cors from 'cors'
import sqlite3 from 'sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'

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

const app = express()
app.use(cors())
app.use(express.json())

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

const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

const sessions = new Map()

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

app.post('/auth/register', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }
  
  const hashedPassword = hashPassword(password)
  const userId = generateId()
  
  db.run('INSERT INTO users (id, username, password, createdAt) VALUES (?, ?, ?, ?)',
    [userId, username, hashedPassword, Date.now()],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          log(`注册失败 - 用户: ${username}, 原因: 用户名已存在`, 'WARN')
          return res.status(400).json({ error: '用户名已存在' })
        }
        log(`注册失败 - 用户: ${username}, 错误: ${err.message}`, 'ERROR')
        return res.status(500).json({ error: err.message })
      }
      
      const token = generateToken()
      sessions.set(token, { userId, username, createdAt: Date.now() })
      log(`注册成功 - 用户: ${username}, userId: ${userId}`)
      res.json({ success: true, token, username })
    })
})

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }
  
  const hashedPassword = hashPassword(password)
  
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, hashedPassword], (err, user) => {
    if (err) {
      log(`登录失败 - 用户: ${username}, 错误: ${err.message}`, 'ERROR')
      return res.status(500).json({ error: err.message })
    }
    if (!user) {
      log(`登录失败 - 用户: ${username}, 原因: 用户名或密码错误`, 'WARN')
      return res.status(401).json({ error: '用户名或密码错误' })
    }
    
    const token = generateToken()
    sessions.set(token, { userId: user.id, username: user.username, createdAt: Date.now() })
    
    log(`登录成功 - 用户: ${username}`)
    res.json({ success: true, token, username: user.username })
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

process.on('uncaughtException', (err) => {
  log(`未捕获异常: ${err.message}\n${err.stack}`, 'ERROR')
  console.error('未捕获异常，服务即将重启:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log(`未处理的Promise拒绝: ${reason}\n${reason?.stack}`, 'ERROR')
  console.error('未处理的Promise拒绝:', reason)
})

const PORT = 3002
const server = app.listen(PORT, '0.0.0.0', () => {
  const message = `数据库服务已启动，监听端口: ${PORT}`
  log(message)
})

function gracefulShutdown(signal) {
  log(`收到 ${signal} 信号，开始优雅关闭...`)
  server.close(() => {
    log('HTTP 服务已关闭')
    db.close((err) => {
      if (err) {
        log(`关闭数据库失败: ${err.message}`, 'ERROR')
      } else {
        log('数据库连接已关闭')
      }
      log('数据库服务已完全停止')
      process.exit(0)
    })
  })
  // 5秒后强制退出
  setTimeout(() => {
    log('强制关闭服务（超时）', 'WARN')
    process.exit(1)
  }, 5000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))