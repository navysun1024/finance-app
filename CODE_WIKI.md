# 个人理财收益率统计系统 - Code Wiki

## 目录
1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [核心模块详解](#核心模块详解)
5. [净值获取方式](#净值获取方式)
6. [关键函数与 API](#关键函数与-api)
7. [数据类型定义](#数据类型定义)
8. [认证系统](#认证系统)
9. [依赖关系](#依赖关系)
10. [路由与页面](#路由与页面)
11. [运行指南](#运行指南)

---

## 项目概述

### 项目简介
本项目是一个 **个人理财收益率统计系统**（版本 0.85.0），用于管理各类理财产品（基金、固收理财等）、记录交易流水、自动计算 XIRR 年化收益率，并支持净值自动爬取、Excel 导出、数据备份与恢复等功能。

### 主要功能
- **用户认证**：用户名注册、登录、退出（Token 会话管理）
- **产品管理**：添加、编辑、删除理财产品（基金、固收理财等）
- **交易记账**：记录买入、卖出、分红、净值更新等交易
- **收益计算**：自动计算总收益、收益率、年化收益率（XIRR 算法）
- **数据可视化**：资产分布饼图、收益趋势柱状图（ECharts）
- **净值自动获取**：天天基金 API + 招银理财 Puppeteer 爬虫 + AkShare（备选）
- **定时净值更新**：后端调度器每日 4 次自动更新净值
- **批量导入**：支持基金交易流水批量导入解析
- **数据导出**：Excel 格式导出投资明细，JSON 备份/恢复
- **数据隔离**：每个用户的数据通过 userId 隔离

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vue** | 3.4.21 | 前端框架（Composition API + `<script setup>`） |
| **Vue Router** | 4.3.0 | 路由管理（含导航守卫） |
| **TypeScript** | 5.4.5 | 类型系统 |
| **Vite** | 5.4.21 | 构建与开发服务器 |
| **Tailwind CSS** | 3.4.14 | 原子化样式框架 |
| **ECharts** | 5.5.0 | 数据可视化图表 |
| **Lucide Vue Next** | 0.31.0 | SVG 图标库 |
| **XLSX** | 0.18.5 | Excel 文件生成 |
| **Axios** | 1.16.1 | HTTP 客户端 |
| **Express** | 5.2.1 | 后端 HTTP 框架 |
| **SQLite3** | 6.0.1 | 后端数据库 |
| **sql.js** | 1.14.1 | 浏览器端 SQLite（前端直连） |
| **Puppeteer** | 25.1.0 | 招银理财网页爬虫 |
| **CORS** | 2.8.6 | 跨域支持 |
| **AkShare** (Python) | - | 备选基金净值数据源 |

---

## 项目结构

```
project2/
├── src/                          # 前端源码
│   ├── components/               # 可复用组件
│   │   ├── Navbar.vue            # 导航栏
│   │   ├── StatCard.vue          # 统计卡片
│   │   ├── ProductCard.vue       # 产品卡片
│   │   ├── ProductModal.vue      # 产品编辑弹窗
│   │   ├── TransactionModal.vue  # 交易编辑弹窗
│   │   └── BatchImportModal.vue  # 批量导入弹窗
│   ├── composables/              # 组合式函数（状态管理）
│   │   └── useFinance.ts         # 核心业务逻辑（产品/交易/持仓/XIRR）
│   ├── router/                   # 路由配置
│   │   └── index.ts              # 路由定义 + 导航守卫
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts              # 核心类型（Product, Transaction, Position 等）
│   ├── utils/                    # 工具函数
│   │   ├── storage.ts            # 后端 API 封装（HTTP fetch）
│   │   ├── database.ts           # 浏览器端 SQLite（sql.js）封装
│   │   ├── fundApi.ts            # 基金净值获取（天天基金 + 招银爬虫）
│   │   ├── xirr.ts               # XIRR 年化收益率算法
│   │   ├── format.ts             # 格式化工具（货币/百分比/日期）
│   │   ├── excel.ts              # Excel 导出
│   │   ├── importParser.ts       # 基金交易流水导入解析
│   │   └── logger.ts             # 前端日志工具
│   ├── views/                    # 页面组件
│   │   ├── Login.vue             # 登录页
│   │   ├── Register.vue          # 注册页
│   │   ├── Dashboard.vue         # 仪表板首页
│   │   ├── Products.vue          # 产品列表
│   │   ├── ProductDetail.vue     # 产品详情
│   │   ├── Transactions.vue      # 交易记录列表
│   │   └── Settings.vue          # 设置页
│   ├── App.vue                   # 根组件（布局 + 导航条）
│   ├── main.ts                   # 应用入口
│   ├── style.css                 # 全局样式（Tailwind + 自定义）
│   └── sqljs.d.ts                # sql.js 类型声明
├── server/                       # 后端服务
│   ├── db-server.js              # 数据库服务（Express + SQLite，端口 3002）
│   ├── scraper.mjs               # 爬虫服务（Puppeteer，端口 3001）
│   └── nav_service.py            # AkShare Python 服务（备选，端口 3003）
├── public/                       # 静态资源
│   └── sql-wasm.wasm             # sql.js WASM 文件
├── data/                         # 数据库目录
│   └── finance.db                # SQLite 数据库文件
├── logs/                         # 日志目录
│   ├── scraper.log               # 爬虫日志
│   └── nav-service.log           # 净值服务日志
├── index.html                    # HTML 入口模板
├── package.json                  # 项目配置与依赖
├── vite.config.ts                # Vite 构建配置（含代理规则）
├── tsconfig.json                 # TypeScript 配置
├── tsconfig.node.json            # Node 环境 TS 配置
├── tailwind.config.js            # Tailwind CSS 配置
├── postcss.config.js             # PostCSS 配置
├── start.sh                      # 一键启动脚本
├── test_full_import.mjs          # 导入测试脚本
├── CODE_WIKI.md                  # 本文件 - 项目技术文档
└── .gitignore                    # Git 忽略规则
```

---

## 核心模块详解

### 1. 核心业务逻辑 — [useFinance.ts](file:///Users/haijun/Documents/Financial/project2/src/composables/useFinance.ts)

整个应用的核心模块，基于 Vue 3 Composition API 管理所有金融业务逻辑和全局状态。**未使用 Vuex/Pinia**，所有状态通过 `ref` / `computed` 管理。

**状态属性：**
- `products`: `Ref<Product[]>` — 产品列表
- `transactions`: `Ref<Transaction[]>` — 交易记录列表
- `isLoading`: `Ref<boolean>` — 数据加载状态
- `portfolioSummary`: `ComputedRef<PortfolioSummary>` — 投资组合汇总（自动计算）

**主要方法：**
| 方法 | 说明 |
|------|------|
| `addProduct(name, type, code, note, holder)` | 添加新产品 |
| `updateProduct(id, name, type, code, note, holder)` | 更新产品信息 |
| `deleteProduct(id)` | 删除产品及其关联交易 |
| `addTransaction(productId, type, date, amount, price, shares, fee, note)` | 添加交易记录 |
| `updateTransaction(id, ...)` | 更新交易记录 |
| `deleteTransaction(id)` | 删除交易记录 |
| `getProductById(id)` | 根据 ID 获取产品 |
| `getTransactionsByProductId(productId)` | 获取产品的交易记录 |
| `calculatePosition(product)` | 计算产品的持仓信息（含 XIRR） |
| `getPositionById(productId)` | 获取产品的持仓信息 |
| `getProfitHistory(days)` | 计算指定天数的每日收益趋势 |
| `refresh()` | 从服务器重新加载数据 |

### 2. 后端 API 封装 — [storage.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/storage.ts)

通过 HTTP `fetch` 调用后端 Express 服务（端口 3002），所有请求自动携带 `Authorization: Bearer <token>` 头。

**核心函数：**
| 函数 | HTTP 方法 | 路径 | 说明 |
|------|-----------|------|------|
| `getProducts()` | GET | `/api/db/products` | 获取产品列表 |
| `saveProducts(products)` | POST | `/api/db/products` | 保存产品列表 |
| `getTransactions()` | GET | `/api/db/transactions` | 获取交易记录 |
| `saveTransactions(transactions)` | POST | `/api/db/transactions` | 保存交易记录 |
| `addTransactionToServer(tx)` | POST | `/api/db/transactions/add` | 添加单条交易 |
| `updateTransactionOnServer(id, tx)` | PUT | `/api/db/transactions/:id` | 更新单条交易 |
| `deleteTransactionFromServer(id)` | DELETE | `/api/db/transactions/:id` | 删除单条交易 |
| `batchImport(transactions)` | POST | `/api/db/batch-import` | 批量导入交易 |
| `clearAllData()` | DELETE | `/api/db/clear` | 清空当前用户数据 |
| `exportData()` | GET | `/api/db/export` | 导出数据为 JSON |
| `importData(jsonString)` | POST | `/api/db/import` | 导入 JSON 数据 |
| `register(username, password)` | POST | `/api/db/register` | 用户注册 |
| `login(username, password)` | POST | `/api/db/login` | 用户登录 |
| `verifyToken()` | GET | `/api/db/verify` | 验证 Token |
| `getToken()` | — | localStorage | 获取本地 Token |

### 3. 浏览器端数据库 — [database.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/database.ts)

使用 `sql.js` 在浏览器中直接运行 SQLite，数据通过 Base64 序列化存储在 `localStorage` 中。支持离线场景。

**核心函数：**
| 函数 | 说明 |
|------|------|
| `initDatabase()` | 初始化/加载浏览器端 SQLite 数据库 |
| `dbQuery(sql, params)` | 执行查询语句并返回结果 |
| `dbExecute(sql, params)` | 执行写入语句（INSERT/UPDATE/DELETE） |
| `dbRunInTransaction(callback)` | 在事务中执行多个操作 |
| `saveDatabase()` | 将数据库序列化保存到 localStorage |
| `exportDatabase()` | 导出数据库为 Base64 字符串 |
| `importDatabase(base64)` | 从 Base64 字符串导入数据库 |

### 4. 净值获取 — [fundApi.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/fundApi.ts)

提供基金和理财产品净值的多种获取方式，详见[净值获取方式](#净值获取方式)章节。

### 5. XIRR 计算 — [xirr.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/xirr.ts)

实现 XIRR（内部收益率）算法，用于计算投资的年化收益率。基于牛顿迭代法求解现金流折现方程。

**核心函数：**
- `calculateXIRR(buyTransactions, sellTransactions, dividendTransactions, currentMarketValue)` — 返回年化收益率（小数形式）

### 6. 格式化工具 — [format.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/format.ts)

| 函数 | 说明 |
|------|------|
| `formatCurrency(value)` | 格式化货币（¥0.00） |
| `formatCurrencyInt(value)` | 格式化货币（整数，¥0） |
| `formatNumber(value, decimals)` | 格式化数字（千分位分隔） |
| `formatPercent(value)` | 格式化百分比（保留 2 位小数） |
| `formatDate(timestamp)` | 格式化日期（YYYY-MM-DD） |
| `formatDateTime(timestamp)` | 格式化日期时间 |

### 7. Excel 导出 — [excel.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/excel.ts)

使用 `xlsx` 库导出投资数据为 Excel 文件，包含三个工作表：
1. **产品汇总** — 各产品的持仓和收益情况
2. **交易明细** — 所有交易记录
3. **投资汇总** — 整体投资统计

### 8. 批量导入解析 — [importParser.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/importParser.ts)

解析基金交易流水文件，支持多种格式的导入。与 [BatchImportModal.vue](file:///Users/haijun/Documents/Financial/project2/src/components/BatchImportModal.vue) 配合使用。

### 9. 前端日志 — [logger.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/logger.ts)

前端日志工具，支持分级日志输出（debug/info/warn/error），辅助调试。

### 10. 后端服务 — [db-server.js](file:///Users/haijun/Documents/Financial/project2/server/db-server.js)

Express + SQLite3 后端服务（端口 3002），详见[后端服务架构](#后端服务架构)。

### 11. 爬虫服务 — [scraper.mjs](file:///Users/haijun/Documents/Financial/project2/server/scraper.mjs)

Puppeteer 无头浏览器爬虫（端口 3001），详见[净值获取方式](#净值获取方式)中招银理财部分。

---

## 净值获取方式

系统根据产品类型采用不同的净值获取策略，前端入口为 [fundApi.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/fundApi.ts)，在 Dashboard.vue 和 ProductDetail.vue 中调用。

### 1. 公募基金 — 天天基金 pingzhongdata API

**适用产品类型：** `fund`（基金）

**前端函数：** `fetchFundNav(fundCode)` — [fundApi.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/fundApi.ts)

**数据源：** 东方财富天天基金网

**请求链路：**
```
前端调用 /api/pingzhongdata/pingzhongdata/{fundCode}.js
    ↓ Vite 代理（vite.config.ts）
https://fund.eastmoney.com/pingzhongdata/{fundCode}.js
```

**解析逻辑：**
1. 请求返回一段 JS 脚本，包含多个 `var` 变量声明
2. 通过正则提取 `Data_fundName` 获取基金名称
3. 通过正则提取 `Data_netWorthTrend`（JSON 数组）获取历史净值走势
4. 取数组最后一个元素的 `y` 值作为最新净值，`x` 值转为日期

**代理配置（vite.config.ts）：**
| 代理路径 | 目标 | 特殊配置 |
|---------|------|----------|
| `/api/pingzhongdata` | `https://fund.eastmoney.com` | 注入 `Referer` 和 `User-Agent` |

**特点：**
- 无需独立后端服务，通过 Vite 代理直接请求
- 生产环境需配置 Nginx 反向代理
- 数据延迟约 T+1（交易日收盘后更新）

### 2. 招银理财产品 — Puppeteer 爬虫

**适用产品类型：** `fixed_income`（固收理财）

**前端函数：** `fetchCmbNav(productCode)` / `fetchCmbNavHistory(productCode, days)` — [fundApi.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/fundApi.ts)

**后端服务：** [scraper.mjs](file:///Users/haijun/Documents/Financial/project2/server/scraper.mjs)（端口 3001）

**请求链路：**
```
前端调用 /api/scrape/cmb?code={productCode}
    ↓ Vite 代理
http://localhost:3001/api/scrape/cmb?code={productCode}
    ↓ Puppeteer 无头浏览器
https://cfweb.paas.cmbchina.com/personal/prodvalue
```

**爬取流程（scrapeCmbNav）：**
1. 启动 Puppeteer 无头浏览器（禁用图片/CSS/字体以加速）
2. 访问招银理财净值查询页面
3. 在搜索框中输入产品代码并点击搜索
4. 等待 2 秒后解析页面中的 `<table>` 结果
5. 匹配产品代码所在行，提取净值（第 3 列）和日期（第 5 列）

**API 接口：**
| 接口 | 方法 | 路径 | 参数 |
|------|------|------|------|
| 最新净值 | GET | `/api/scrape/cmb` | `code`（产品代码）, `mock`（是否 mock） |
| 历史净值 | GET | `/api/scrape/cmb/history` | `code`, `days`（天数）, `mock` |

**容错机制：**
- 爬取超时限制 20 秒
- 失败或结果为空时，自动返回随机 mock 数据作为 fallback
- 支持 `mock=true` 参数直接返回测试数据

**特点：**
- 需独立启动爬虫服务（`node server/scraper.mjs`）
- 依赖 Puppeteer，首次运行自动下载 Chromium
- 日志输出到 `logs/scraper.log`

### 3. 公募基金 — AkShare Python 服务（备选）

**适用产品类型：** `fund`（基金）

**后端服务：** [nav_service.py](file:///Users/haijun/Documents/Financial/project2/server/nav_service.py)（端口 3003）

**数据源：** AkShare 库（`fund_open_fund_info_em` 接口，数据来自东方财富）

**API 接口：**
| 接口 | 方法 | 路径 | 参数 |
|------|------|------|------|
| 最新净值 | GET | `/api/akshare/fund` | `code`（基金代码） |
| 历史净值 | GET | `/api/akshare/fund_history` | `code` |

**特点：**
- 需 Python 环境 + `akshare` 依赖
- 手动启动：`python server/nav_service.py`
- 当前为备选方案，前端未直接集成调用
- 日志输出到 `logs/nav-service.log`

### 4. 后端定时净值调度器

内置在 [db-server.js](file:///Users/haijun/Documents/Financial/project2/server/db-server.js) 中，每天自动执行 4 次净值更新：
- **调度时间**：09:30 / 12:00 / 15:00 / 20:00
- **更新内容**：自动查询所有用户的基金和招银理财产品最新净值
- **写入方式**：以 `nav_update` 交易类型写入数据库

### 前端调用策略

```typescript
// 根据产品类型选择不同的净值获取方式
if (product.type === 'fund') {
  result = await fetchFundNav(product.code)       // 天天基金 API
} else if (product.type === 'fixed_income') {
  result = await fetchCmbNav(product.code)         // 招银理财爬虫
}
```

---

## 后端服务架构

本项目包含三个独立后端服务：

### 1. 数据库服务（端口 3002）

**文件：** [db-server.js](file:///Users/haijun/Documents/Financial/project2/server/db-server.js)

Express + SQLite3，数据库文件 `data/finance.db`。

**功能模块：**
- **用户认证**：注册/登录/验证（SHA256 密码加密 + Token 会话）
- **产品管理**：CRUD（按 userId 隔离）
- **交易管理**：CRUD（按 userId 隔离）
- **批量导入**：批量写入交易记录
- **数据导入/导出**：JSON 格式备份与恢复
- **净值调度器**：定时自动更新净值（每天 09:30 / 12:00 / 15:00 / 20:00）
- **基金信息**：阶段涨幅、持仓信息（前十大重仓股 + 资产配置），支持 ETF 联接基金自动映射

**健康检查：** `GET /api/db/health` 或 `GET /health`

### 2. 爬虫服务（端口 3001）

**文件：** [scraper.mjs](file:///Users/haijun/Documents/Financial/project2/server/scraper.mjs)

Express + Puppeteer，专门用于招银理财净值爬取。

### 3. AkShare Python 服务（端口 3003）— 备选

**文件：** [nav_service.py](file:///Users/haijun/Documents/Financial/project2/server/nav_service.py)

使用 Python AkShare 库获取基金净值数据，前端未直接调用。

---

## 关键函数与 API

### useFinance() — 核心业务钩子

**文件：** [src/composables/useFinance.ts](file:///Users/haijun/Documents/Financial/project2/src/composables/useFinance.ts)

**属性：**
- `products`: `Ref<Product[]>` — 产品列表
- `transactions`: `Ref<Transaction[]>` — 交易记录列表
- `isLoading`: `Ref<boolean>` — 加载状态
- `portfolioSummary`: `ComputedRef<PortfolioSummary>` — 投资组合汇总

### calculatePosition(product) → Position

根据交易记录计算单个产品的持仓信息：
- 总投资金额、持有份额、平均成本
- 当前净值、市值、盈亏金额/收益率
- XIRR 年化收益率、持有天数

### calculateXIRR(buyTx, sellTx, dividendTx, currentValue) → number

**文件：** [src/utils/xirr.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/xirr.ts)

基于牛顿迭代法计算年化内部收益率。

### getProfitHistory(days) → ProfitHistory[]

计算指定天数内的每日收益趋势：
1. **卖出收益** = 卖出金额 - (卖出份额 × 平均成本)
2. **分红收益** = 分红金额
3. **持仓市值变化** = (当日净值 - 前一日净值) × 持仓数量

### 格式化函数

**文件：** [src/utils/format.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/format.ts)

| 函数 | 输出示例 |
|------|---------|
| `formatCurrency(1234.5)` | `¥1,234.50` |
| `formatCurrencyInt(1234.5)` | `¥1,235` |
| `formatNumber(1234.5, 2)` | `1,234.50` |
| `formatPercent(12.34)` | `12.34%` |
| `formatDate(1700000000000)` | `2024-11-15` |
| `formatDateTime(1700000000000)` | `2024-11-15 10:13` |

### exportToExcel(products, positions, transactions)

**文件：** [src/utils/excel.ts](file:///Users/haijun/Documents/Financial/project2/src/utils/excel.ts)

导出三个工作表：产品汇总 / 交易明细 / 投资汇总。

---

## 数据类型定义

**文件：** [src/types/index.ts](file:///Users/haijun/Documents/Financial/project2/src/types/index.ts)

### Product（产品）

```typescript
interface Product {
  id: string;
  userId: string;      // 所属用户 ID
  name: string;        // 产品名称
  type: ProductType;   // 产品类型
  code: string;        // 产品代码（基金代码或理财代码）
  note: string;        // 备注
  holder: string;      // 持有人类别
  createdAt: number;   // 创建时间戳
}
```

**ProductType：** `'fund'`（基金）| `'fixed_income'`（固收理财）

### Transaction（交易记录）

```typescript
interface Transaction {
  id: string;
  userId: string;      // 所属用户 ID
  productId: string;   // 关联产品 ID
  type: TransactionType;
  date: number;        // 交易日期（时间戳）
  amount: number;      // 交易金额
  price: number;       // 交易价格/净值
  shares: number;      // 交易份额
  fee: number;         // 手续费
  note: string;        // 备注
}
```

**TransactionType：** `'buy'`（买入）| `'sell'`（卖出）| `'dividend'`（分红）| `'nav_update'`（净值更新）

### Position（持仓信息）

```typescript
interface Position {
  productId: string;
  product: Product;
  totalInvestment: number;   // 总投入
  totalShares: number;       // 持有份额
  avgCost: number;           // 平均成本
  currentNav: number;        // 当前净值
  marketValue: number;       // 当前市值
  profit: number;            // 盈亏金额
  profitRate: number;        // 收益率（%）
  annualRate: number;        // 年化收益率（%）
  holdingDays: number;       // 持有天数
  lastNavUpdateDate: number; // 最后净值更新日期
  transactions: Transaction[];
}
```

### PortfolioSummary（投资组合汇总）

```typescript
interface PortfolioSummary {
  totalAssets: number;       // 总资产
  totalInvestment: number;   // 总投入
  totalProfit: number;       // 总盈亏
  totalProfitRate: number;   // 总收益率
  totalAnnualRate: number;   // 总年化收益率
  positions: Position[];     // 各产品持仓列表
}
```

### ProfitHistory（收益趋势）

```typescript
interface ProfitHistory {
  date: string;
  totalProfit: number;       // 累计收益
  dailyProfit: number;       // 当日收益
}
```

### User（用户）

```typescript
interface User {
  id: string;
  username: string;
  password: string;    // SHA256 加密
  token: string;       // 会话 Token
  createdAt: number;
}
```

---

## 认证系统

### 认证流程

```
1. 用户访问应用 → 检查 localStorage 是否有 token
   ├─ 有 token → 验证 token 有效性 → 正常访问
   └─ 无 token → 重定向到登录页

2. 用户登录/注册 → 后端验证 → 返回 token → 存储到 localStorage

3. 后续请求 → 请求头携带 Authorization: Bearer <token>

4. 用户退出 → 清除 token → 重定向到登录页
```

### 数据隔离

每个用户的数据通过 `userId` 字段进行隔离，所有产品和交易的 CRUD 操作都基于当前登录用户的 userId 过滤。

---

## 依赖关系

### 模块依赖图

```
App.vue
├── Navbar.vue
└── <RouterView>
    ├── Login.vue
    │   └── storage.ts (login/register)
    ├── Register.vue
    │   └── storage.ts
    ├── Dashboard.vue
    │   ├── StatCard.vue
    │   ├── ProductCard.vue
    │   └── useFinance.ts
    │       ├── storage.ts (HTTP API)
    │       ├── fundApi.ts (净值获取)
    │       └── xirr.ts (收益率计算)
    ├── Products.vue
    │   ├── ProductModal.vue
    │   └── useFinance.ts
    ├── Transactions.vue
    │   ├── TransactionModal.vue
    │   ├── BatchImportModal.vue
    │   └── useFinance.ts
    ├── ProductDetail.vue
    │   ├── useFinance.ts
    │   └── fundApi.ts
    └── Settings.vue
        ├── useFinance.ts
        ├── storage.ts
        └── excel.ts
```

### 主要 npm 依赖

**生产依赖：** vue, vue-router, echarts, lucide-vue-next, xlsx, axios, express, sqlite3, sql.js, puppeteer, cors

**开发依赖：** vite, typescript, @vitejs/plugin-vue, tailwindcss, autoprefixer, postcss

---

## 路由与页面

**文件：** [src/router/index.ts](file:///Users/haijun/Documents/Financial/project2/src/router/index.ts)

| 路径 | 名称 | 视图组件 | 需要认证 |
|------|------|----------|----------|
| `/login` | login | [Login.vue](file:///Users/haijun/Documents/Financial/project2/src/views/Login.vue) | 否 |
| `/register` | register | [Register.vue](file:///Users/haijun/Documents/Financial/project2/src/views/Register.vue) | 否 |
| `/` | dashboard | [Dashboard.vue](file:///Users/haijun/Documents/Financial/project2/src/views/Dashboard.vue) | 是 |
| `/products` | products | [Products.vue](file:///Users/haijun/Documents/Financial/project2/src/views/Products.vue) | 是 |
| `/products/:id` | product-detail | [ProductDetail.vue](file:///Users/haijun/Documents/Financial/project2/src/views/ProductDetail.vue) | 是 |
| `/funds` | funds | Products.vue (type='fund') | 是 |
| `/fixed-income` | fixed-income | Products.vue (type='fixed_income') | 是 |
| `/transactions` | transactions | [Transactions.vue](file:///Users/haijun/Documents/Financial/project2/src/views/Transactions.vue) | 是 |
| `/settings` | settings | [Settings.vue](file:///Users/haijun/Documents/Financial/project2/src/views/Settings.vue) | 是 |

**导航守卫逻辑：**
- 未登录且访问需认证路由 → 重定向到 `/login`
- 已登录且访问 `/login` 或 `/register` → 重定向到 Dashboard

**页面功能简述：**

| 页面 | 功能 |
|------|------|
| **Dashboard** | 资产分布饼图、收益趋势柱状图、统计卡片（总资产/总投入/总收益）、最近更新产品列表 |
| **Products** | 产品列表（全部/基金/固收分类），支持新增/编辑/删除产品 |
| **ProductDetail** | 产品详情、净值走势图、持仓信息、阶段涨幅、关联交易列表 |
| **Transactions** | 交易记录列表（按产品筛选），支持新增/编辑/删除/批量导入 |
| **Settings** | 数据导出（Excel/JSON）、数据导入、清空数据、净值调度控制 |

---

## 运行指南

### 服务架构

| 服务 | 端口 | 用途 | 启动命令 |
|------|------|------|---------|
| 前端开发服务 | 5173 | Vue 3 前端应用 | `npm run dev` |
| 数据库后端 | 3002 | Express + SQLite API | `node server/db-server.js` |
| 爬虫服务 | 3001 | 招银理财净值爬取 | `node server/scraper.mjs` |
| AkShare Python（备选） | 3003 | 基金净值数据 | `python server/nav_service.py` |

### 启动方式

#### 一键启动
```bash
./start.sh
```
依次启动：数据库服务（3002）→ 爬虫服务（3001）→ 前端开发服务（5173）

#### 分步启动
```bash
# 终端1：数据库服务
node server/db-server.js

# 终端2：爬虫服务
node server/scraper.mjs

# 终端3：前端开发服务
npm run dev
```

#### 快捷命令
```bash
npm run dev:all    # 同时启动爬虫 + 前端（需单独启动数据库）
npm run scraper    # 仅启动爬虫服务
```

### Vite 代理配置

| 代理路径 | 目标 | 说明 |
|----------|------|------|
| `/api/fund` | `https://fundgz.1234567.com.cn` | 基金实时估值 |
| `/api/eastmoney` | `https://fund.eastmoney.com` | 东方财富数据 |
| `/api/pingzhongdata` | `https://fund.eastmoney.com` | 基金净值走势 |
| `/api/scrape` | `http://localhost:3001` | 招银理财爬虫 |
| `/api/db` | `http://localhost:3002` | 数据库 API |
| `/api/nav-scheduler` | `http://localhost:3002` | 净值调度器 API |

### 服务验证
```bash
# 检查后端服务
curl http://localhost:3002/health

# 检查爬虫服务（mock 模式）
curl "http://localhost:3001/api/scrape/cmb?code=YC010211&mock=true"
```

### 使用流程
1. **注册账户** → 在登录页点击注册
2. **登录** → 使用注册的账户登录
3. **添加产品** → 在「产品」页面新增理财产品
4. **记录交易** → 在「交易」页面添加买入、卖出等记录
5. **更新净值** → 通过 `nav_update` 交易类型或自动调度更新净值
6. **查看收益** → 在「首页」查看资产分布和收益趋势
7. **导出数据** → 在「设置」页导出 Excel 或备份 JSON

### 构建部署
```bash
npm run build      # 构建生产版本 → dist/
npm run preview    # 预览生产构建
```

---

*最后更新：2026-06-05*