# 个人理财统计系统 - Code Wiki

## 目录
1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [核心模块详解](#核心模块详解)
5. [关键类与函数](#关键类与函数)
6. [数据类型定义](#数据类型定义)
7. [认证系统](#认证系统)
8. [依赖关系](#依赖关系)
9. [运行指南](#运行指南)

---

## 项目概述

### 项目简介
这是一个个人理财收益率统计 Web 应用，用于管理各类理财产品并自动计算收益率，支持 XIRR 年化收益率计算、Excel 导出和数据持久化存储等功能。

### 主要功能
- **用户认证**：用户名注册、登录、退出
- **产品管理**：添加、编辑、删除理财产品（基金、股票、债券、存款、固收理财等）
- **交易记账**：记录买入、卖出、分红、净值更新等交易
- **收益计算**：自动计算总收益、收益率、年化收益率（XIRR）
- **数据可视化**：资产分布饼图、收益趋势柱状图
- **数据导出**：Excel 格式导出投资明细
- **数据管理**：数据导入/导出、清空

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4.21 | 前端框架 |
| Vue Router | 4.3.0 | 路由管理 |
| TypeScript | 5.4.5 | 类型系统 |
| Vite | 5.4.21 | 构建工具 |
| Tailwind CSS | 3.4.14 | UI 样式 |
| ECharts | 5.5.0 | 数据可视化 |
| Lucide Vue Next | 0.31.0 | 图标库 |
| XLSX | 0.18.5 | Excel 文件处理 |
| Express | 5.2.1 | 后端框架 |
| SQLite3 | 6.0.1 | 数据库 |
| sql.js | 1.14.1 | 浏览器端 SQLite |
| Puppeteer | 25.1.0 | 网页爬虫 |
| Axios | 1.16.1 | HTTP 客户端 |
| CORS | 2.8.6 | 跨域支持 |

---

## 项目结构

```
/Users/haijun/Documents/Financial/demo/
├── src/
│   ├── components/          # 可复用组件
│   │   ├── Navbar.vue       # 导航栏
│   │   ├── ProductCard.vue  # 产品卡片
│   │   ├── ProductModal.vue # 产品编辑弹窗
│   │   ├── StatCard.vue     # 统计卡片
│   │   └── TransactionModal.vue # 交易编辑弹窗
│   ├── composables/         # 组合式函数
│   │   └── useFinance.ts    # 核心金融业务逻辑
│   ├── router/              # 路由配置
│   │   └── index.ts         # 路由定义（含认证守卫）
│   ├── types/               # TypeScript 类型定义
│   │   └── index.ts         # 核心类型
│   ├── utils/               # 工具函数
│   │   ├── excel.ts         # Excel 导出
│   │   ├── format.ts        # 格式化工具
│   │   ├── storage.ts       # API 封装（调用后端）
│   │   └── xirr.ts          # XIRR 算法
│   ├── views/               # 页面组件
│   │   ├── Dashboard.vue    # 仪表板
│   │   ├── Login.vue        # 登录页
│   │   ├── ProductDetail.vue # 产品详情
│   │   ├── Products.vue     # 产品列表
│   │   ├── Register.vue     # 注册页
│   │   ├── Settings.vue     # 设置页
│   │   └── Transactions.vue # 交易列表
│   ├── App.vue              # 根组件
│   ├── main.ts              # 入口文件
│   └── style.css            # 全局样式
├── server/
│   └── db-server.js         # 后端服务器（Express + SQLite）
├── data/
│   └── finance.db           # SQLite 数据库文件
├── dist/                    # 构建输出
├── index.html               # HTML 模板
├── package.json             # 项目配置
├── tsconfig.json            # TypeScript 配置
├── vite.config.ts           # Vite 配置（含代理）
└── tailwind.config.js       # Tailwind 配置
```

---

## 核心模块详解

### 1. 核心业务逻辑 - useFinance.ts

这是整个应用的核心模块，负责管理所有金融相关的逻辑和状态。

**主要功能：**
- 产品和交易的 CRUD 操作
- 持仓计算（成本、市值、收益）
- XIRR 年化收益率计算
- 投资组合汇总统计
- 收益趋势计算

### 2. 数据存储 - storage.ts

通过 HTTP API 调用后端 SQLite 数据库。

**主要功能：**
- 产品数据存取（带用户隔离）
- 交易记录存取（带用户隔离）
- 用户认证（注册、登录、验证）
- 数据导入/导出

### 3. 后端服务 - db-server.js

使用 Express + SQLite3 搭建的后端服务。

**主要功能：**
- 用户管理（注册、登录、验证）
- 产品 CRUD（按用户隔离）
- 交易 CRUD（按用户隔离）
- 数据导入/导出

### 4. XIRR 计算 - xirr.ts

实现 XIRR（内部收益率）算法，用于计算投资的年化收益率。

### 5. 数据格式化 - format.ts

提供各类数据的格式化函数（货币、百分比、日期等）。

### 6. Excel 导出 - excel.ts

使用 `xlsx` 库将数据导出为 Excel 文件。

---

## 关键类与函数

### useFinance()
**文件位置：** [src/composables/useFinance.ts](file:///Users/haijun/Documents/Financial/demo/src/composables/useFinance.ts)

核心业务逻辑钩子，返回以下内容：

**属性：**
- `products`: `Ref<Product[]>` - 产品列表
- `transactions`: `Ref<Transaction[]>` - 交易记录列表
- `portfolioSummary`: `ComputedRef<PortfolioSummary>` - 投资组合汇总（计算属性）

**方法：**
| 方法名 | 说明 |
|--------|------|
| `addProduct(name, type, note)` | 添加新产品 |
| `updateProduct(id, name, type, note)` | 更新产品信息 |
| `deleteProduct(id)` | 删除产品及其关联交易 |
| `addTransaction(productId, type, date, amount, price, shares, fee, note)` | 添加交易记录 |
| `updateTransaction(id, ...)` | 更新交易记录 |
| `deleteTransaction(id)` | 删除交易记录 |
| `getProductById(id)` | 根据 ID 获取产品 |
| `getTransactionsByProductId(productId)` | 获取产品的交易记录 |
| `calculatePosition(product)` | 计算产品的持仓信息 |
| `getPositionById(productId)` | 获取产品的持仓信息 |
| `getProfitHistory(days)` | 获取指定天数的收益趋势 |
| `refresh()` | 刷新前端缓存（从服务器重新获取数据） |

### calculatePosition(product)
**返回：** `Position` 对象

根据交易记录计算单个产品的持仓信息，包括：
- 总投资金额
- 持有份额
- 平均成本
- 当前净值
- 市值
- 盈亏金额/收益率
- 年化收益率（XIRR）
- 持有天数

### calculateXIRR(buyTx, sellTx, dividendTx, currentValue)
**文件位置：** [src/utils/xirr.ts](file:///Users/haijun/Documents/Financial/demo/src/utils/xirr.ts)

计算投资的年化内部收益率。

**参数：**
- `buyTransactions`: 买入交易（含手续费）
- `sellTransactions`: 卖出交易
- `dividendTransactions`: 分红交易
- `currentMarketValue`: 当前市值

**返回：** 年化收益率（小数形式）

### getProfitHistory(days)
**文件位置：** [src/composables/useFinance.ts](file:///Users/haijun/Documents/Financial/demo/src/composables/useFinance.ts)

计算指定天数内的每日收益趋势。

**计算逻辑：**
1. **卖出收益** = 卖出金额 - (卖出份额 × 平均成本)
2. **分红收益** = 分红金额
3. **持仓市值变化** = (当日净值 - 前一日净值) × 持仓数量

### exportToExcel(products, positions, transactions)
**文件位置：** [src/utils/excel.ts](file:///Users/haijun/Documents/Financial/demo/src/utils/excel.ts)

导出投资数据到 Excel 文件，包含三个工作表：
1. **产品汇总** - 各产品的持仓和收益情况
2. **交易明细** - 所有交易记录
3. **投资汇总** - 整体投资统计

### 存储相关函数
**文件位置：** [src/utils/storage.ts](file:///Users/haijun/Documents/Financial/demo/src/utils/storage.ts)

| 函数名 | 说明 |
|--------|------|
| `getProducts()` | 从服务器获取当前用户的产品列表 |
| `saveProducts(products)` | 保存产品到服务器 |
| `getTransactions()` | 从服务器获取当前用户的交易记录 |
| `saveTransactions(transactions)` | 保存交易记录到服务器 |
| `generateId()` | 生成唯一 ID |
| `clearAllData()` | 清空当前用户的所有数据 |
| `exportData()` | 导出数据为 JSON 字符串 |
| `importData(jsonString)` | 导入 JSON 数据 |
| `register(username, password)` | 用户注册 |
| `login(username, password)` | 用户登录 |
| `verifyToken()` | 验证当前 Token 是否有效 |
| `getToken()` | 获取本地存储的 Token |

### 格式化函数
**文件位置：** [src/utils/format.ts](file:///Users/haijun/Documents/Financial/demo/src/utils/format.ts)

| 函数名 | 说明 |
|--------|------|
| `formatCurrency(value)` | 格式化货币（¥0.00） |
| `formatCurrencyInt(value)` | 格式化货币（整数） |
| `formatNumber(value, decimals)` | 格式化数字 |
| `formatPercent(value)` | 格式化百分比 |
| `formatDate(timestamp)` | 格式化日期（YYYY-MM-DD） |
| `formatDateTime(timestamp)` | 格式化日期时间 |

---

## 数据类型定义

### Product（产品）
**文件位置：** [src/types/index.ts](file:///Users/haijun/Documents/Financial/demo/src/types/index.ts)

```typescript
interface Product {
  id: string;
  userId: string;      // 所属用户 ID
  name: string;
  type: ProductType;
  note: string;
  createdAt: number;   // 时间戳
}
```

**ProductType（产品类型）：**
- `fund` - 基金
- `stock` - 股票
- `bond` - 债券
- `deposit` - 存款
- `fixed_income` - 固收理财
- `other` - 其他

### Transaction（交易记录）
```typescript
interface Transaction {
  id: string;
  userId: string;      // 所属用户 ID
  productId: string;
  type: TransactionType;
  date: number;        // 时间戳
  amount: number;
  price: number;
  shares: number;
  fee: number;
  note: string;
}
```

**TransactionType（交易类型）：**
- `buy` - 买入
- `sell` - 卖出
- `dividend` - 分红
- `nav_update` - 净值更新

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
  totalAssets: number;     // 总资产
  totalInvestment: number; // 总投入
  totalProfit: number;     // 总盈亏
  totalProfitRate: number; // 总收益率
  positions: Position[];   // 各产品持仓
}
```

### User（用户）
```typescript
interface User {
  id: string;
  username: string;
  password: string;  // SHA256 加密后的密码
  token: string;     // 当前登录 Token
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

3. 后续请求 → 在请求头中携带 Authorization: Bearer <token>

4. 用户退出 → 清除 localStorage 中的 token → 重定向到登录页
```

### 后端 API 接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 注册 | POST | `/auth/register` | 用户注册 |
| 登录 | POST | `/auth/login` | 用户登录 |
| 验证 | GET | `/auth/verify` | 验证 Token |
| 产品列表 | GET | `/products` | 获取当前用户产品 |
| 添加产品 | POST | `/products` | 添加新产品 |
| 更新产品 | PUT | `/products/:id` | 更新产品信息 |
| 删除产品 | DELETE | `/products/:id` | 删除产品 |
| 交易列表 | GET | `/transactions` | 获取当前用户交易 |
| 添加交易 | POST | `/transactions` | 添加交易 |
| 更新交易 | PUT | `/transactions/:id` | 更新交易 |
| 删除交易 | DELETE | `/transactions/:id` | 删除交易 |

### 数据隔离

每个用户的数据通过 `userId` 字段进行隔离，确保不同用户之间的数据互不影响。

---

## 依赖关系

### 模块依赖图
```
App.vue
├── Navbar.vue
└── RouterView
    ├── Login.vue
    ├── Register.vue
    ├── Dashboard.vue
    │   ├── StatCard.vue
    │   ├── ProductCard.vue
    │   └── useFinance.ts
    │       ├── storage.ts (HTTP API)
    │       └── xirr.ts
    ├── Products.vue
    │   ├── ProductModal.vue
    │   └── useFinance.ts
    ├── Transactions.vue
    │   ├── TransactionModal.vue
    │   └── useFinance.ts
    ├── ProductDetail.vue
    │   └── useFinance.ts
    └── Settings.vue
        ├── useFinance.ts
        ├── storage.ts
        └── excel.ts
```

### 主要依赖包

**生产依赖：**
- `vue` - 核心框架
- `vue-router` - 路由
- `echarts` - 图表
- `lucide-vue-next` - 图标
- `xlsx` - Excel 处理
- `tailwindcss` - 样式框架
- `express` - 后端框架
- `sqlite3` - 数据库

**开发依赖：**
- `vite` - 构建工具
- `typescript` - 类型系统
- `@vitejs/plugin-vue` - Vue 插件
- `autoprefixer`, `postcss` - CSS 后处理

---

## 运行指南

### 服务架构

本项目包含三个独立服务，需要分别启动：

| 服务名称 | 端口 | 用途 | 启动命令 |
|---------|------|------|---------|
| 前端开发服务 | 5173 | Vue 3 前端应用 | `npm run dev` |
| 数据库后端服务 | 3002 | Express + SQLite API | `node server/db-server.js` |
| 爬虫服务 | 3001 | 招银理财净值爬取 | `node server/scraper.mjs` |

### 开发环境

#### 方式一：分步启动（推荐）

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动数据库后端服务**（终端1）
   ```bash
   node server/db-server.js
   ```
   运行在 http://localhost:3002

3. **启动爬虫服务**（终端2）
   ```bash
   node server/scraper.mjs
   ```
   运行在 http://localhost:3001

4. **启动前端开发服务器**（终端3）
   ```bash
   npm run dev
   ```
   访问 http://localhost:5173

#### 方式二：同时启动爬虫和前端

```bash
npm run dev:all
```

此命令会同时启动爬虫服务和前端服务，但**数据库服务仍需单独启动**。

#### 方式三：仅启动爬虫服务

```bash
npm run scraper
```

### 构建与部署

1. **构建生产版本**
   ```bash
   npm run build
   ```
   输出到 `dist/` 目录

2. **预览生产构建**
   ```bash
   npm run preview
   ```

### 服务地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173/ |
| 后端 API | http://localhost:3002/ |
| 爬虫服务 | http://localhost:3001/ |
| 后端健康检查 | http://localhost:3002/health |
| 爬虫测试接口 | http://localhost:3001/api/scrape/cmb?code=YC010211&mock=true |

### 服务验证

启动后可通过以下方式验证服务是否正常：

```bash
# 检查后端服务
curl http://localhost:3002/health

# 检查爬虫服务
curl "http://localhost:3001/api/scrape/cmb?code=YC010211&mock=true"
```

### 代理配置说明

前端通过 Vite 代理转发请求：

| 路径 | 目标地址 | 用途 |
|------|---------|------|
| `/api/fund` | https://fundgz.1234567.com.cn | 基金净值查询（外部API） |
| `/api/eastmoney` | https://fund.eastmoney.com | 东方财富数据（外部API） |
| `/api/scrape` | http://localhost:3001 | 招银理财爬虫 |
| `/api/db` | http://localhost:3002 | 数据库服务 |

### 数据存储

应用数据存储在 SQLite 数据库文件 `data/finance.db` 中，每个用户的数据通过 `userId` 字段隔离。

### 使用流程

1. **注册账户** → 在登录页点击注册
2. **登录** → 使用注册的账户登录
3. **添加产品** → 在「产品」页面新增理财产品
4. **记录交易** → 在「交易」页面添加买入、卖出等记录
5. **更新净值** → 通过交易类型 `nav_update` 更新当前净值
6. **查看收益** → 在「首页」查看资产分布和收益情况
7. **导出数据** → 在「设置」页导出 Excel 或备份 JSON

---

## 页面路由

| 路径 | 名称 | 组件 | 认证要求 |
|------|------|------|----------|
| `/login` | login | [Login.vue](file:///Users/haijun/Documents/Financial/demo/src/views/Login.vue) | 否 |
| `/register` | register | [Register.vue](file:///Users/haijun/Documents/Financial/demo/src/views/Register.vue) | 否 |
| `/` | dashboard | [Dashboard.vue](file:///Users/haijun/Documents/Financial/demo/src/views/Dashboard.vue) | 是 |
| `/products` | products | [Products.vue](file:///Users/haijun/Documents/Financial/demo/src/views/Products.vue) | 是 |
| `/products/:id` | product-detail | [ProductDetail.vue](file:///Users/haijun/Documents/Financial/demo/src/views/ProductDetail.vue) | 是 |
| `/transactions` | transactions | [Transactions.vue](file:///Users/haijun/Documents/Financial/demo/src/views/Transactions.vue) | 是 |
| `/settings` | settings | [Settings.vue](file:///Users/haijun/Documents/Financial/demo/src/views/Settings.vue) | 是 |