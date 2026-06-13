interface Database {
  run(sql: string, params?: any[]): void
  prepare(sql: string): Statement
  export(): Uint8Array
}

interface Statement {
  bind(params: any[]): void
  step(): boolean
  getAsObject(): Record<string, any>
  free(): void
}

interface SqlJsModule {
  Database: new(data?: Uint8Array) => Database
}

declare global {
  interface Window {
    initSqlJs: (config: { locateFile: (filename: string) => string }) => Promise<SqlJsModule>
  }
}

const DB_STORAGE_KEY = 'finance_db_data'

let db: Database | null = null
let readyPromise: Promise<void> | null = null

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

function arrayBufferToBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

function persistDb(): void {
  if (!db) return
  const data = db.export()
  const base64 = arrayBufferToBase64(data)
  localStorage.setItem(DB_STORAGE_KEY, base64)
}

export async function initDatabase(): Promise<void> {
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    const sqlModule = await window.initSqlJs({
      locateFile: () => `/sql-wasm-browser.wasm`
    })

    const savedData = localStorage.getItem(DB_STORAGE_KEY)
    if (savedData) {
      const buffer = base64ToArrayBuffer(savedData)
      db = new sqlModule.Database(buffer)
    } else {
      db = new sqlModule.Database()
    }

    db!.run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        code TEXT DEFAULT '',
        note TEXT DEFAULT '',
        createdAt INTEGER NOT NULL
      )
    `)
    db!.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
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

    persistDb()
  })()

  return readyPromise
}

function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function dbQuery<T>(sql: string, params?: any[]): T[] {
  const database = getDb()
  const stmt: Statement = database.prepare(sql)
  if (params) {
    stmt.bind(params)
  }
  const results: T[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return results
}

export function dbExecute(sql: string, params?: any[]): void {
  const database = getDb()
  if (params) {
    database.run(sql, params)
  } else {
    database.run(sql)
  }
  persistDb()
}

export function dbRunInTransaction(queries: { sql: string; params?: any[] }[]): void {
  const database = getDb()
  database.run('BEGIN TRANSACTION')
  try {
    for (const q of queries) {
      if (q.params) {
        database.run(q.sql, q.params)
      } else {
        database.run(q.sql)
      }
    }
    database.run('COMMIT')
    persistDb()
  } catch (e) {
    database.run('ROLLBACK')
    throw e
  }
}