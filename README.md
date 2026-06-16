# 个人理财统计系统

一个功能完善的个人投资收益率统计 Web 应用，支持基金、固收理财等多种产品类型的净值跟踪、收益计算和可视化展示。

## 功能特性

- **多产品类型支持**：基金、固收理财
- **自动净值更新**：定时从天天基金、招银理财等数据源获取最新净值
- **XIRR 年化收益率计算**：基于实际现金流计算真实年化收益率
- **可视化图表**：资产分布、收益趋势、净值走势、持仓分布等 ECharts 图表
- **批量导入**：支持 Excel/JSON 格式批量导入产品和交易记录
- **数据导出**：支持 JSON 和 Excel 格式导出数据
- **用户认证**：注册/登录，bcrypt 密码哈希，会话过期，速率限制
- **响应式设计**：Tailwind CSS 实现的移动端友好界面
- **Docker 部署**：支持 Docker Compose 一键部署

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vue** | 3.4.21 | 前端框架（Composition API + `<script setup>`） |
| **Vue Router** | 4.3.0 | 路由管理（含导航守卫） |
| **TypeScript** | 5.4.5 | 类型系统 |
| **Vite** | 5.2.8 | 构建与开发服务器 |
| **Tailwind CSS** | 3.4.14 | 原子化样式框架 |
| **ECharts** | 5.5.0 | 数据可视化图表 |
| **Lucide Vue Next** | 0.31.0 | SVG 图标库 |
| **XLSX** | 0.18.5 | Excel 文件生成 |
| **Express** | 5.2.1 | 后端 HTTP 框架 |
| **SQLite3** | 6.0.1 | 后端数据库 |
| **sql.js** | 1.14.1 | 浏览器端 SQLite |
| **Puppeteer** | 25.1.0 | 招银理财网页爬虫 |
| **bcryptjs** | 3.0.3 | 密码加密 |

## 项目结构

```
project2/
├── src/                          # 前端源码
│   ├── components/               # 通用组件
│   │   ├── BatchImportModal.vue  # 批量导入弹窗
│   │   ├── Navbar.vue            # 导航栏
│   │   ├── ProductCard.vue       # 产品卡片
│   │   ├── ProductModal.vue      # 产品编辑弹窗
│   │   ├── StatCard.vue          # 统计卡片
│   │   └── TransactionModal.vue  # 交易记录弹窗
│   ├── composables/
│   │   └── useFinance.ts         # 核心业务逻辑（持仓计算、收益统计）
│   ├── router/
│   │   └── index.ts              # Vue Router 路由配置
│   ├── types/
│   │   └── index.ts              # TypeScript 类型定义
│   ├── utils/
│   │   ├── database.ts           # 浏览器端 SQLite（sql.js）封装
│   │   ├── excel.ts              # Excel 导出
│   │   ├── format.ts             # 格式化工具（货币/百分比/日期）
│   │   ├── fundApi.ts            # 基金净值获取（天天基金 + 招银爬虫）
│   │   ├── importParser.ts       # 批量导入解析
│   │   ├── logger.ts             # 前端日志工具
│   │   ├── storage.ts            # 后端 API 封装（HTTP fetch）
│   │   └── xirr.ts               # XIRR 年化收益率算法
│   ├── views/                    # 页面视图
│   │   ├── Dashboard.vue         # 仪表盘（资产概览、图表）
│   │   ├── Login.vue             # 登录页
│   │   ├── ProductDetail.vue     # 产品详情页（净值走势、持仓）
│   │   ├── Products.vue          # 产品列表页（基金/固收）
│   │   ├── Register.vue          # 注册页
│   │   ├── Settings.vue          # 设置页（导入导出、调度器）
│   │   └── Transactions.vue      # 交易记录页
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 入口文件
│   └── style.css                 # 全局样式
├── server/                       # 后端服务
│   ├── db-server.js              # 数据库 API 服务（端口 3002）
│   ├── scraper.mjs               # 爬虫服务（端口 3001）
│   ├── nav_service.py            # Python 净值服务（辅助）
│   └── fill_fund_nav.mjs         # 基金净值回填脚本
├── data/                         # 数据目录
│   └── finance.db                # SQLite 数据库文件
├── logs/                         # 日志目录
│   ├── db-server.log             # 数据库服务日志
│   └── scraper.log               # 爬虫服务日志
├── public/                       # 静态资源
│   ├── favicon.svg               # 网页图标
│   ├── sql-wasm-browser.js       # sql.js WASM 模块
│   └── sql-wasm-browser.wasm
├── docker-compose.yml            # Docker Compose 配置
├── docker-entrypoint.sh          # Docker 入口脚本
├── Dockerfile                    # Docker 镜像构建
├── nginx.conf                    # Nginx 反向代理配置
├── start.sh                      # 一键启动脚本
├── vite.config.ts                # Vite 配置
├── tailwind.config.js            # Tailwind CSS 配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # 项目依赖
└── index.html                    # HTML 入口
```

## 核心模块

### useFinance.ts — 核心业务逻辑

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
| `updateProduct(id, ...)` | 更新产品信息 |
| `deleteProduct(id)` | 删除产品及其关联交易 |
| `addTransaction(productId, type, date, amount, price, shares, fee, note)` | 添加交易记录 |
| `getTransactionsByProductId(productId)` | 获取产品的交易记录 |
| `calculatePosition(product)` | 计算产品的持仓信息（含 XIRR） |
| `getProfitHistory(days)` | 计算指定天数的每日收益趋势 |
| `refresh()` | 从服务器重新加载数据 |

### storage.ts — 后端 API 封装

通过 HTTP `fetch` 调用后端 Express 服务（端口 3002），所有请求自动携带 `Authorization: Bearer <token>` 头。

| 函数 | HTTP 方法 | 路径 | 说明 |
|------|-----------|------|------|
| `getProducts()` | GET | `/api/db/products` | 获取产品列表 |
| `saveProducts(products)` | POST | `/api/db/products` | 保存产品列表 |
| `getTransactions()` | GET | `/api/db/transactions` | 获取交易记录 |
| `saveTransactions(transactions)` | POST | `/api/db/transactions` | 保存交易记录 |
| `batchImport(transactions)` | POST | `/api/db/batch-import` | 批量导入交易 |
| `clearAllData()` | POST | `/api/db/products` + `/api/db/transactions` | 保存空数组清空数据 |
| `exportData()` | GET | `/api/db/export` | 导出数据为 JSON |
| `importData(jsonString)` | POST | `/api/db/import` | 导入 JSON 数据 |
| `register(username, password)` | POST | `/api/db/register` | 用户注册 |
| `login(username, password)` | POST | `/api/db/login` | 用户登录 |

### database.ts — 浏览器端数据库

使用 `sql.js` 在浏览器中直接运行 SQLite，数据通过 Base64 序列化存储在 `localStorage` 中。当前为保留模块，主数据流通过后端 API（storage.ts）实现。

### xirr.ts — XIRR 计算

实现 XIRR（内部收益率）算法，基于牛顿迭代法求解现金流折现方程，用于计算投资的年化收益率。

### format.ts — 格式化工具

| 函数 | 输出示例 |
|------|---------|
| `formatCurrency(1234.5)` | `¥1,234.50` |
| `formatCurrencyInt(1234.5)` | `¥1,235` |
| `formatPercent(12.34)` | `12.34%` |
| `formatDate(timestamp)` | `2024-11-15` |

## 数据类型

### Product（产品）

```typescript
interface Product {
  id: string;
  name: string;        // 产品名称
  type: ProductType;   // 'fund' | 'fixed_income'
  code: string;        // 产品代码
  note: string;        // 备注
  holder: string;      // 持有人类别
  createdAt: number;   // 创建时间戳
}
```

### Transaction（交易记录）

```typescript
interface Transaction {
  id: string;
  productId: string;   // 关联产品 ID
  type: TransactionType; // 'buy' | 'sell' | 'dividend' | 'nav_update'
  date: number;        // 交易日期（时间戳）
  amount: number;      // 交易金额
  price: number;       // 交易价格/净值
  shares: number;      // 交易份额
  fee: number;         // 手续费
  note: string;        // 备注
}
```

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

## 数据库表结构

数据库使用 SQLite，文件位于 `data/finance.db`。共 4 张表：

### 1. users — 用户表

存储用户账户信息，用于认证系统。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 用户唯一 ID |
| username | TEXT | UNIQUE NOT NULL | 用户名 |
| password | TEXT | NOT NULL | 密码哈希（bcrypt） |
| createdAt | INTEGER | NOT NULL | 注册时间戳 |

### 2. products — 产品表

存储理财产品信息，每个用户可拥有多个产品。通过 `userId` 实现数据隔离。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 产品唯一 ID |
| userId | TEXT | NOT NULL | 所属用户 ID（关联 users.id） |
| name | TEXT | NOT NULL | 产品名称 |
| type | TEXT | NOT NULL | 产品类型：`fund`（基金）/ `fixed_income`（固收理财） |
| code | TEXT | DEFAULT '' | 产品代码（如基金代码 110044） |
| note | TEXT | DEFAULT '' | 备注（含限购信息等自动追加内容） |
| holder | TEXT | DEFAULT '' | 持有人姓名 |
| dcaAmount | REAL | DEFAULT 0 | 定投金额（元） |
| dcaCycle | TEXT | DEFAULT '' | 定投周期：`daily` / `weekly` / `biweekly` / `monthly` |
| createdAt | INTEGER | NOT NULL | 创建时间戳 |

### 3. transactions — 交易记录表

存储所有交易操作，通过 `productId` 关联产品。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 交易唯一 ID |
| userId | TEXT | NOT NULL | 所属用户 ID（关联 users.id） |
| productId | TEXT | NOT NULL | 关联产品 ID（关联 products.id） |
| type | TEXT | NOT NULL | 交易类型：`buy`（买入）/ `sell`（卖出）/ `dividend`（分红）/ `nav_update`（净值更新） |
| date | INTEGER | NOT NULL | 交易日期时间戳 |
| amount | REAL | NOT NULL | 交易金额 |
| price | REAL | NOT NULL | 交易价格/净值 |
| shares | REAL | NOT NULL | 交易份额 |
| fee | REAL | DEFAULT 0 | 手续费 |
| note | TEXT | DEFAULT '' | 备注（如数据来源、更新时间等） |

### 4. data_cache — 数据缓存表

缓存爬取的外部数据（如基金阶段涨幅、持仓信息），减少重复请求，加速页面加载。设有过期时间索引自动清理。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| cache_key | TEXT | PRIMARY KEY | 缓存键（如 `fund_stage_gains_110044`） |
| cache_data | TEXT | NOT NULL | 缓存数据（JSON 字符串） |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |
| expires_at | INTEGER | NOT NULL | 过期时间戳（已创建索引 `idx_data_cache_expires`） |

### 表关系

```
users (1) ──────< (N) products
                      │
                      │ (1)
                      │
                      ▼
                  (N) transactions

data_cache（独立表，无外键关联）
```

## 路由与页面

| 路径 | 名称 | 视图组件 | 需要认证 |
|------|------|----------|----------|
| `/login` | login | Login.vue | 否 |
| `/register` | register | Register.vue | 否 |
| `/` | dashboard | Dashboard.vue | 是 |
| `/funds` | funds | Products.vue (type='fund') | 是 |
| `/fixed-income` | fixed-income | Products.vue (type='fixed_income') | 是 |
| `/products` | products | Products.vue | 是 |
| `/products/:id` | product-detail | ProductDetail.vue | 是 |
| `/transactions` | transactions | Transactions.vue | 是 |
| `/settings` | settings | Settings.vue | 是 |

**导航守卫逻辑：**
- 未登录且访问需认证路由 → 重定向到 `/login`
- 已登录且访问 `/login` 或 `/register` → 重定向到 Dashboard

**页面功能：**

| 页面 | 功能 |
|------|------|
| **Dashboard** | 资产分布图、收益趋势图、统计卡片、产品列表 |
| **Products** | 产品列表（基金/固收分类），支持新增/编辑/删除 |
| **ProductDetail** | 产品详情、净值走势图、持仓信息、阶段涨幅、交易列表 |
| **Transactions** | 交易记录列表，支持新增/编辑/删除/批量导入 |
| **Settings** | 数据导出（Excel/JSON）、数据导入、清空数据、调度控制 |

## 净值获取

### 1. 公募基金 — 天天基金 API

**适用产品类型：** `fund`

**请求链路：**
```
前端调用 /api/pingzhongdata/pingzhongdata/{fundCode}.js
    ↓ Vite 代理
https://fund.eastmoney.com/pingzhongdata/{fundCode}.js
```

解析返回的 JS 脚本，提取 `Data_netWorthTrend` 数组获取历史净值。

### 2. 招银理财产品 — Puppeteer 爬虫

**适用产品类型：** `fixed_income`

**请求链路：**
```
前端调用 /api/scrape/cmb?code={productCode}
    ↓ Vite 代理
http://localhost:3001/api/scrape/cmb?code={productCode}
    ↓ Puppeteer 无头浏览器
https://cfweb.paas.cmbchina.com/personal/prodvalue
```

**API 接口：**
| 接口 | 方法 | 路径 | 参数 |
|------|------|------|------|
| 最新净值 | GET | `/api/scrape/cmb` | `code` |
| 历史净值 | GET | `/api/scrape/cmb/history` | `code`, `days` |

### 3. 后端定时净值调度器

内置在 db-server.js 中，每天自动执行 4 次净值更新：
- **调度时间**：09:30 / 12:00 / 15:00 / 20:00
- **更新内容**：自动查询所有用户的基金和理财产品最新净值
- **写入方式**：以 `nav_update` 交易类型写入数据库

## 服务架构

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx (:80)                         │
│              反向代理 + 静态文件服务                       │
└─────────────┬─────────────────────┬─────────────────────┘
              │                     │
              ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐
│   Vite Dev (:5173)  │  │   DB Server (:3002) │
│   前端开发服务器      │  │   Express API 服务   │
└─────────────────────┘  └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  Scraper (:3001)    │
                         │  Puppeteer 爬虫服务  │
                         └─────────────────────┘
```

| 服务 | 端口 | 说明 |
|------|------|------|
| Nginx | 80 | 生产环境入口，反向代理 + 静态文件 |
| Vite Dev | 5173 | 开发环境前端服务器 |
| DB Server | 3002 | 后端 API，数据库操作，定时净值调度 |
| Scraper | 3001 | Puppeteer 爬虫，抓取招银理财等净值 |

## 快速开始

### 开发环境

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev

# 启动前端 + 爬虫服务
npm run dev:all

# 单独启动爬虫服务
npm run scraper

# 启动数据库服务
npm run start
```

### 生产环境（Docker）

#### 构建与启动

```bash
# 构建并启动
docker compose up -d --build

# 查看构建日志
docker compose logs -f
```

访问 `http://NAS_IP:8080`

#### Docker 架构

采用**三阶段构建**，单个容器运行所有服务：

```
┌─────────────────────────────────────────┐
│         finance-app 容器 (:8080)         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Nginx (:80)                      │  │
│  │  静态文件 + API 反向代理            │  │
│  └──────┬──────────┬────────────────┘  │
│         │          │                    │
│         ▼          ▼                    │
│  ┌────────────┐ ┌────────────┐         │
│  │ DB Server  │ │  Scraper   │         │
│  │  :3002     │ │  :3001     │         │
│  └────────────┘ └────────────┘         │
│                                         │
│  /app/data  ← volume 持久化              │
│  /app/logs  ← volume 持久化              │
└─────────────────────────────────────────┘
```

#### 数据持久化

Docker Compose 使用命名卷持久化数据，容器重建不会丢失：

| Volume | 容器路径 | 说明 |
|--------|---------|------|
| finance-data | /app/data | SQLite 数据库 (finance.db) |
| finance-logs | /app/logs | 服务日志文件 |

#### 数据库备份与恢复

```bash
# 备份数据库到本地
docker cp finance-app:/app/data/finance.db ./finance-backup.db

# 用本地数据库覆盖容器中的
docker cp ./data/finance.db finance-app:/app/data/finance.db
docker compose restart
```

#### 容器管理

```bash
# 查看运行状态
docker compose ps

# 查看实时日志
docker logs finance-app --tail 50 -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 更新应用
docker compose down
docker compose up -d --build
```

#### 飞牛NAS 部署注意事项

**1. Docker 镜像源 401 错误**

飞牛NAS 默认的 `docker.fnnas.com` 镜像源可能返回 401 Unauthorized，需要替换：

```bash
cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ]
}
EOF

systemctl restart docker
```

**2. npm 网络超时**

Dockerfile 已内置 npm 重试配置（5 次重试，最长等待 2 分钟）和 npmmirror 国内镜像。

**3. Puppeteer 依赖**

Puppeteer 25 要求 Node >= 22，Dockerfile 使用 `node:22-alpine` 并配置系统 Chromium + `--no-sandbox` 模式。

## API 代理配置

| 前端路径 | 后端目标 | 说明 |
|----------|----------|------|
| `/api/db/*` | `localhost:3002/*` | 数据库 API |
| `/api/scrape/*` | `localhost:3001/api/scrape/*` | 爬虫服务 |
| `/api/fund/*` | `fundgz.1234567.com.cn/*` | 天天基金实时估值 |
| `/api/eastmoney/*` | `fund.eastmoney.com/*` | 东方财富基金数据 |
| `/api/pingzhongdata/*` | `fund.eastmoney.com/*` | 品种数据（历史净值） |
| `/api/nav-scheduler/*` | `localhost:3002/*` | 净值调度器 API |

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

每个用户的数据通过 `userId` 字段进行隔离。后端 `authenticate` 中间件从 Token 中解析 `userId`，所有产品和交易的 CRUD 操作都基于当前用户的 `userId` 过滤。前端类型定义中不包含 `userId`，由服务端自动管理。

### 安全特性

- **密码加密**：bcrypt 哈希（成本因子 10）
- **会话管理**：24 小时过期，定期清理
- **速率限制**：每 IP 每 15 分钟最多 10 次登录/注册
- **输入验证**：用户名格式、密码强度检查
- **请求体限制**：Express JSON body 最大 10MB

## 使用流程

1. **注册账户** → 在登录页点击注册
2. **登录** → 使用注册的账户登录
3. **添加产品** → 在「产品」页面新增理财产品
4. **记录交易** → 在「交易」页面添加买入、卖出等记录
5. **更新净值** → 通过定时调度器自动更新或手动触发
6. **查看收益** → 在「首页」查看资产分布和收益趋势
7. **导出数据** → 在「设置」页导出 Excel 或备份 JSON

## 许可证

Private
