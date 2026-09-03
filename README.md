# 个人理财统计系统

一个功能完善的个人投资收益率统计 Web 应用，支持权益（基金）、固收理财、定期存款三类产品的净值跟踪、收益计算、业绩比较基准与可视化展示。

## 功能特性

* **三类产品支持**：权益产品（公募基金 / 权益类理财）、固收理财产品、定期存款

* **多种净值数据源**：天天基金（权益+固收）、招银理财 Puppeteer 爬虫、工银理财 Puppeteer 爬虫

* **业绩比较基准**：支持自定义指数公式（如 `中证800*0.6 + 中证全债*0.4`），随净值走势叠加展示

* **自动净值更新**：内置定时调度器（北京时间 10–13 点 / 16–23 点，每小时一次）+ 手动触发

* **XIRR 年化收益率计算**：基于实际现金流（买入/卖出/分红）计算真实年化

* **持仓穿透**：自动抓取基金股票持仓，按持有权益加权聚合展示

* **限购信息自动同步**：从东方财富基金 F10 抓取，独立存储到 `products.purchaseLimit` 字段

* **可视化图表**：资产分布饼图、收益/市值趋势、净值走势（含基准对比）、阶段涨幅、持仓穿透柱图等 ECharts 图表

* **多产品对比**：支持权益/固收产品收益率与净值走势叠加对比，差异一目了然

* **批量导入 / 导出**：Excel/JSON 导入、JSON 备份、Excel 报表

* **用户认证**：注册/登录、bcrypt 密码哈希、24h 会话、速率限制、多用户数据隔离

* **响应式 UI**：Tailwind CSS，移动端+PC 端深度优化；支持深浅主题

* **Docker 部署**：单容器内 Nginx + DB + 爬虫，Volume 数据持久化

## 技术栈

| 技术                     | 版本      | 用途                                       |
| ---------------------- | ------- | ---------------------------------------- |
| **Vue**                | 3.4.21  | 前端框架（Composition API + `<script setup>`） |
| **Vue Router**         | 4.3.0   | 路由管理（含导航守卫）                              |
| **TypeScript**         | 5.4.5   | 类型系统                                     |
| **Vite**               | 5.2.8   | 构建与开发服务器                                 |
| **@vitejs/plugin-vue** | 6.0.7   | Vite Vue 单文件组件插件                         |
| **vue-tsc**            | 2.0.0   | Vue TypeScript 类型检查                      |
| **Tailwind CSS**       | 3.4.14  | 原子化样式框架                                  |
| **PostCSS**            | 8.4.35  | CSS 后处理器                                 |
| **Autoprefixer**       | 10.4.17 | CSS 自动前缀                                 |
| **ECharts**            | 5.5.0   | 数据可视化图表                                  |
| **Lucide Vue Next**    | 0.31.0  | SVG 图标库                                  |
| **XLSX**               | 0.18.5  | Excel 文件生成/解析                            |
| **Express**            | 5.2.1   | 后端 HTTP 框架                               |
| **cors**               | 2.8.6   | Express 跨域中间件                            |
| **SQLite3**            | 6.0.1   | 后端数据库                                    |
| **sql.js**             | 1.14.1  | 浏览器端 SQLite（保留模块）                        |
| **Puppeteer**          | 25.1.0  | 招银理财 / 工银理财 网页爬虫                         |
| **bcryptjs**           | 3.0.3   | 密码加密                                     |
| **Axios**              | 1.16.1  | HTTP 请求                                  |
| **@types/node**        | 20.11.0 | Node.js TypeScript 类型定义                  |
| **@types/bcryptjs**    | 2.4.6   | bcryptjs TypeScript 类型定义                 |
| **Node**               | >= 22   | 运行环境（Puppeteer 25 要求）                    |

## 快速开始

> **硬约束**：所有服务必须通过 [start.sh](file:///Users/haijun/Documents/Financial/app/start.sh) 启动，防止多进程并发导致净值更新冲突。

### 开发环境（macOS / Linux）

```bash
# 1) 安装依赖
npm install

# 2) 一键启动（推荐）
./start.sh start
#    或重启
./start.sh restart

# 3) 查看状态
./start.sh status
```

启动后访问：

* 前端应用: <http://localhost:5173>

* 数据库 API: <http://localhost:3002>

* 爬虫服务:   <http://localhost:3001>

### npm script（备选）

```bash
# 单独启动
npm run start       # 数据库服务:3002 + 调度器
npm run scraper     # 爬虫服务:3001 (招银/工银)
npm run dev         # 前端开发服务器:5173
```

### 生产环境（Docker / 飞牛 NAS）

```bash
# 构建并启动（单容器含 Nginx + DB + 爬虫）
docker compose up -d --build

# 日志
docker compose logs -f

# 数据库备份 / 恢复
docker cp finance-app:/app/data/finance.db ./finance-backup.db
docker cp ./finance-backup.db finance-app:/app/data/finance.db
docker compose restart
```

NAS 部署注意：

* 飞牛默认 docker 镜像源可能 401，改 daemon.json 的 `registry-mirrors`

* Puppeteer 25 需 Node 22，Dockerfile 已用 `node:22-alpine` + 系统 Chromium + `--no-sandbox`

## 项目结构

```
./
├── src/                              # 前端源码
│   ├── components/                   # 通用组件
│   │   ├── BatchImportModal.vue            # 批量导入弹窗
│   │   ├── BottomSheet.vue                 # 底部弹出面板（移动端友好）
│   │   ├── Navbar.vue                      # 底部导航（移动端）
│   │   ├── ProductCard.vue                 # 产品卡片（图表视图）
│   │   ├── ProductListItem.vue             # 产品列表项（列表视图，含盈亏）
│   │   ├── ProductModal.vue                # 产品编辑弹窗（含定投/基准/净值源）
│   │   ├── ProfitCalendar.vue              # 收益日历
│   │   ├── PullRefresh.vue                 # 下拉刷新组件
│   │   ├── StatCard.vue                    # 统计卡片（资产/收益概览）
│   │   ├── TransactionCard.vue             # 交易记录卡片（净值更新双行布局）
│   │   └── TransactionModal.vue            # 交易记录编辑弹窗
│   ├── composables/
│   │   ├── useCompare.ts             # 产品对比逻辑（组合、区间年化、净值对齐）
│   │   └── useFinance.ts             # 核心业务逻辑（状态 / 盈亏 / XIRR / 汇总）
│   ├── router/
│   │   └── index.ts                  # Vue Router 配置
│   ├── types/
│   │   └── index.ts                  # TS 类型定义（Product/Transaction/Position...）
│   ├── utils/
│   │   ├── benchmark.ts              # 基准公式解析 + 多指数权重组合
│   │   ├── database.ts               # 浏览器端 sql.js 封装（保留）
│   │   ├── equityApi.ts              # 净值 / 阶段涨幅 / 持仓 / 限购 API 封装
│   │   ├── excel.ts                  # Excel 导入/导出
│   │   ├── format.ts                 # 货币 / 百分比 / 日期 格式化
│   │   ├── importParser.ts           # 批量导入解析
│   │   ├── indexApi.ts               # 指数历史数据（基准）前端封装
│   │   ├── logger.ts                 # 统一日志工具
│   │   ├── storage.ts                # 后端 API（HTTP fetch + Bearer Token）
│   │   └── xirr.ts                   # XIRR 牛顿迭代算法
│   ├── views/
│   │   ├── Compare.vue               # 产品对比页（净值走势 + 区间年化 并排对比）
│   │   ├── Dashboard.vue             # 仪表盘（汇总卡 / 饼图 / 趋势图）
│   │   ├── Login.vue                 # 登录
│   │   ├── ProductDetail.vue         # 产品详情（净值走势+基准 / 阶段涨幅 / 交易）
│   │   ├── Products.vue              # 产品列表（权益 / 固收 / 定存 / 全部 + 对比）
│   │   ├── Register.vue              # 注册
│   │   ├── Settings.vue              # 设置（导入导出 / 调度控制 / 清空）
│   │   └── Transactions.vue          # 交易记录总览
│   ├── App.vue
│   ├── main.ts
│   ├── sqljs.d.ts                    # sql.js TypeScript 类型声明
│   └── style.css
├── scripts/                          # 辅助脚本
│   ├── export_holdings.mjs           # 持仓穿透数据导出脚本（v1）
│   └── export_holdings_v2.mjs        # 持仓穿透数据导出脚本（v2）
├── server/
│   ├── db-server.js                  # Express API 服务 + 净值调度器（:3002）
│   ├── scraper.mjs                   # Puppeteer 爬虫（招银/工银 :3001）
│   ├── nav_service.py                # Python 净值辅助服务（历史回填）
│   └── fill_fund_nav.mjs             # 基金净值回填脚本
├── data/
│   └── finance.db                    # SQLite 数据库
├── logs/
│   ├── db-server.log                 # 数据库服务日志
│   └── scraper.log                   # 爬虫服务日志
├── public/                           # 静态资源（sql.js WASM、favicon）
├── Dockerfile                        # Node:22-alpine + Chromium + Nginx 单容器构建
├── docker-compose.yml                # 生产编排
├── docker-entrypoint.sh              # Docker 容器入口脚本
├── nginx.conf                        # 静态文件 + /api 反向代理
├── start.sh                          # macOS / Linux 开发环境一键启停
├── vite.config.ts                    # Vite + 7 条 API 代理规则
├── tailwind.config.js                # Tailwind 主题配置
├── postcss.config.js                 # PostCSS 配置
├── tsconfig.json                     # TypeScript 配置
├── tsconfig.node.json                # TypeScript Node 环境配置
├── package.json
├── package-lock.json
├── CHANGELOG.md                      # 版本变更记录
├── test_full_import.mjs              # 批量导入完整性测试脚本
├── .dockerignore
├── .gitignore
└── index.html
```

## 产品类型

```ts
type ProductType =
  | 'equity'        // 权益产品：公募基金 / 权益类理财
  | 'fixed_income'  // 固收理财产品
  | 'fund'          // 兼容旧数据，等同于 equity
  | 'term_deposit'  // 定期存款：无代码、无净值详情页、按“本金×年利率/365”计日收益
```

**产品关键字段**：

* `navSource`（净值源）：`''`(不查询) / `tiantian`(天天基金) / `cmb`(招银) / `icbc`(工银)；固收产品按 `navSource` 选择对应爬虫，权益走天天基金

* `benchmarkEnabled` / `benchmarkFormula`：是否启用业绩基准 + 基准公式，如 `000906*0.6+H11001*0.4`

* `purchaseLimit`：权益产品限购属性，独立于备注保存，格式如 `单日上限5万元` / `暂停申购` / `不限购`

## 外部数据获取方式与触发条件

> 这是本项目最核心的"动态数据"部分。所有外部请求会通过缓存层（SQLite `data_cache` 表 + 前端 indexApi.ts localStorage 缓存）去重。

### 一、权益产品净值 + 限购（东方财富移动端 + 旧接口回退）

| 数据项                                | 获取端                                                                                                               | 触发条件                                              | 接口 / 代理路径                                                                                             | 目标 URL / 实现                                                                                                                           | 缓存                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **历史净值曲线**                         | 前端 equityApi.ts [fetchEquityNav](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L27)         | 详情页加载、净值走势刷新、回填历史                                 | 优先 `/api/db/api/fund/nav/{code}`（后端统一封装，HTTPS直连）；失败回退 `/api/pingzhongdata/pingzhongdata/{code}.js`    | 后端 `fetchFundNavServer`：①东方财富移动端 APP API（净值更新快 30–60min）→ ②回退 `https://fund.eastmoney.com/pingzhongdata/{code}.js`                    | 详情页回填历史通过 `POST /fund/backfill-nav/:productId` 走 pingzhongdata，不落缓存              |
| **最新净值 + 名称 + 当日收益**               | 后端 db-server.js `fetchFundNavServer`（调度时）                                                                         | 定时调度、手动触发、产品列表页手动更新                               | 后端 `/api/fund/nav/:code` → 前端封装 `/api/db/api/fund/nav/{code}`                                         | ①优先：`https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo`（移动端APP API）；②失败回退：`https://fund.eastmoney.com/pingzhongdata/{code}.js` | —                                                                                |
| **限购信息（暂停/单日上限/不限购）**              | 后端 `fetchFundPurchaseLimit`（在净值接口**内部串行返回**）                                                                      | 随净值查询**一同返回**；即使当日净值已存在，调度器仍会独立更新 `products.purchaseLimit` | 后端直连 `fundf10.eastmoney.com/jbgk_{code}.html`（在 fetchFundNavMobile / fetchFundNavLegacy 内部调用）         | `http://fundf10.eastmoney.com/jbgk_{code}.html`                                                                                       | 写入 `products.purchaseLimit` 字段持久化，格式如 `单日上限5万元` / `暂停申购` / `不限购`                         |
| **阶段涨幅（1w/1m/3m/6m/1y/2y/3y/ytd）** | 前端 equityApi.ts [fetchEquityStageGains](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L250) | 详情页阶段涨幅卡片加载、批量加载                                  | `/api/db/fund/stage-gains/:code` → 后端 `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jdzf` | `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jdzf&code={code}`                                                           | SQLite `data_cache`（`fund_stage_gains_{code}`，TTL 24h）                           |
| **基金持仓（前十大重仓股 + 资产配置）**            | 前端 equityApi.ts [fetchEquityHoldings](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L331)   | 产品列表「持仓穿透」展开、详情页持仓                                | `/api/db/fund/holdings/:code` → 后端 `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc`    | `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10`                                                | SQLite `data_cache`（`fund_holdings_{code}`，TTL 到下季季报发布后 30 天；数据过旧时自动匹配目标 ETF 替代） |
| **持仓穿透聚合（多只基金按持有权益加权）**            | 前端 [fetchAggregatedHoldings](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L394)            | 产品列表页持仓穿透展开                                       | `/api/db/equity/aggregated-holdings?funds=id1,id2`（后端组合，不直连外部）                                        | —                                                                                                                                     | 按基金组合哈希缓存                                                                        |

### 二、固收理财产品净值（Puppeteer 爬虫）

| 数据项               | 触发条件                                   | 路由（前端 → 后端 → 爬虫）                                                                                                    | 目标站点 / 页面                                                    | 超时（爬虫内部 / db-server 外层） |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| **招银理财 最新净值**     | 调度 / 手动 / 产品列表页更新（`navSource==='cmb'`） | 前端 `/api/scrape/cmb?code={code}` → 爬虫 `GET /api/scrape/cmb`                                                         | `https://cfweb.paas.cmbchina.com/personal/prodvalue` （搜索→详情） | **45s / 3min**          |
| **招银理财 历史净值（翻页）** | 详情页手动回填历史（`navSource==='cmb'`，调度不执行历史） | 前端 `/api/db/cmb/nav-history/{code}?maxPages=N` → 后端 `GET /cmb/nav-history/:code` → 爬虫 `GET /api/scrape/cmb/history` | 同上（点击"下一页"翻到指定页）                                             | **5min / 10min**        |
| **招银 批量净值**       | 调度器批量（`navSource==='cmb'`）             | 前端 `/api/scrape/cmb/batch?codes=a,b,c` → 爬虫 `GET /api/scrape/cmb/batch`                                             | 同上                                                           | 每产品 20s / 批             |
| **工银理财 最新净值**     | 调度 / 手动（`navSource==='icbc'`）          | 前端 `/api/scrape/icbc?code={code}` → 爬虫 `GET /api/scrape/icbc`                                                       | `https://wm.icbc.com.cn/netWorthDisclosure` （红按钮搜索区→新详情页）    | **90s（重试 180s） / 3min** |
| **工银理财 历史净值**     | 详情页手动回填（`navSource==='icbc'`，调度不执行历史）  | 前端 `/api/scrape/icbc/history?code={code}&maxPages=N` → 爬虫 `GET /api/scrape/icbc/history`                            | 同上（详情页翻页）                                                    | 爬虫内部 3min / —           |

**爬虫关键约定**：

* 调度器**只跑最新净值**，不做历史 API 调用；历史回填必须由用户在详情页手动触发

* CMB 历史页爬取采用 `elementHandle.evaluate(el => el.click())`，避免 puppeteer `click()` 在 headless 中卡住

* 所有爬虫接口支持 `mock` 参数（未启动 Chromium 时返回模拟数据兜底）

### 三、定期存款

* 定存产品**无外部 API**；当日收益 = 本金 × 年利率 / 365（**到期后收益 = 0**），在前端 `useFinance.ts` 中直接计算

* 定存产品**不展示详情页**；PC 与移动端列表点击均禁止跳转到 `ProductDetail`（卡片层 `@click` 条件拦截 + 无路由守卫兜底）

* 起始日期计算优先级：①有交易记录 → 首次买入日期；②无交易但有到期日+期限 → 到期日 - 存款期限；③其他 → 创建日期

### 四、业绩比较基准指数（走势图对比）

| 指数代码                                                                                     | 数据来源                                         | 获取端                                                                                           | 触发条件               | 目标 URL                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **00xxxx 股票指数**（硬编码支持：`000906` 中证800 / `000300` 沪深300 / `000905` 中证500 / `000923` 公司债指数） | **腾讯 K 线 API**（原 push2his.eastmoney.com 已封锁） | 后端 [fetchFromTencent](file:///Users/haijun/Documents/Financial/app/server/db-server.js#L2962) | 净值走势图加载时基准公式解析出该指数 | `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh{code},day,,,1000,qfq`（重试 3 次，间隔 2s）                                              |
| **H 开头债券指数**（硬编码支持：`H11001` 中证全债）                                                        | 中证指数官网 API                                   | 后端 [fetchFromCsindex](file:///Users/haijun/Documents/Financial/app/server/db-server.js#L2988) | 同上                 | `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={code}&startDate={YYYYMMDD(10年前)}&endDate={YYYYMMDD(今天)}`（实际传具体日期值，而非中文描述） |

**路由**：`GET /index/history?code=000906`（Vite 代理 `/api/db/index/history` → :3002）

**缓存**：SQLite `data_cache`（`index_history_{code}`，TTL 4 小时）

**注意**：非硬编码集合内的指数代码会直接返回"不支持"错误；如需新增请在 db-server.js 的 `INDEX_TENCENT_CODES` / `INDEX_CSI_HCODES` Set 中注册。

**curl 健壮性**（后端 `execCurlWithProxyFallback`）：

1. 先以 `--noproxy '*'` 直连（避免 shell 残留的 https\_proxy 干扰）
2. 直连失败且系统存在 `https_proxy/http_proxy` 环境变量时，自动降级走代理
3. 所有请求加 `-L` 跟随 302 重定向

### 五、基金分红自动同步（东方财富 fundf10）

> 分红同步在净值更新过程中自动触发，仅适用于类型为 `equity`/`fund` 或 `navSource='tiantian'` 的产品（排除固收理财和定期存款）。

| 数据项 | 获取端 | 触发条件 | 目标 URL | 缓存策略 | 写入目标 |
|---|---|---|---|---|---|
| **基金分红/拆分公告** | 后端 `syncDividendsForAllProducts`（在净值调度 `updateAllNavs` 流程中调用） | 净值定时调度运行时自动触发；也支持详情页手动调用 `/api/fund/dividends/:code?autoSync=1` | `https://fundf10.eastmoney.com/fhsp_{code}.html`（HTML 页面解析） | SQLite `data_cache`（`fund_dividends_{code}`，**TTL 6 小时**） | **双写**：① 爬取的分红公告写入 `product_dividends` 表；② 根据用户登记日持仓份额计算的实际分红写入 `transactions` 表（type=dividend） |

**分红同步双写逻辑**：

1. **`product_dividends` 表** — 存储基金分红公告原始数据（登记日、除权日、每份/每10份分红金额、分红类型）
   - 去重：`(userId, productId, registerDate, dividendType)` 唯一索引
   - 数据来源：`fundf10.eastmoney.com/fhsp_{code}.html`，解析分红/拆分公告页
2. **`transactions` 表** — 生成 `dividend` 类型交易记录，金额 = 登记日持仓份额 × 每份分红
   - 去重：`productId + date + amount` 三重去重
   - 份额基础：使用**登记日当天的持仓份额**，而非当前份额，保证历史分红金额准确
3. **缓存节流**：6 小时内同一基金不会重复爬取分红页面，避免频繁 HTTP 请求
4. **失败容错**：分红同步失败仅记录警告日志，不阻塞主净值更新流程

> **适用产品**：仅对 `type === 'equity'` / `type === 'fund'` 或 `navSource === 'tiantian'` 的产品执行分红同步，固收理财和定期存款产品自动跳过。

## 净值定时调度器

调度器内嵌在 [db-server.js L1198-L2033](file:///Users/haijun/Documents/Financial/app/server/db-server.js#L1198-L2033)。

### 触发条件与时间

```
10:00  11:00  12:00  13:00    ← 上午盘后
16:00  17:00  18:00  19:00  20:00  21:00  22:00  23:00   ← 下午/晚间
```

按**北京时间**触发，即使用户部署在海外 Docker 容器里也通过 Asia/Shanghai 时区判断。每分钟 tick 检查是否命中到点。

### 并发约束

* **互斥锁**：`isNavUpdating` 标记 + 所有净值更新在同一 `updateAllNavs()` 串行入口；调度到点、手动 `run` API、短时间内重复点击均会被「正在更新」拦截

* **同日重复拒绝**：写入 `nav_history` 表前以"午夜日期戳"检查是否存在；数据库层面唯一索引 `idx_nav_unique(userId, productId, date)` 兜底

* **净值查询优先级**（同一用户内按产品）：天天基金(tiantian) → 招银(cmb) → 工银(icbc)，分别对应 3 分钟 + 10 分钟超时

* **限购信息先于历史净值检查**：即使当日净值记录已存在，限购信息仍会更新到 `products.purchaseLimit`

### 净值记录细节

* 日期戳**强制转换为当日午夜 00:00**，保证产品列表筛选 / 走势 X 轴 / 对比页 X 轴边界一致

* 净值历史写入 `nav_history` 表而非 `transactions` 表，实现数据分离；`nav_history.note` 中**只写更新时间戳**，不加"来源:xxx"等前缀

* **固收产品的定时净值更新不执行历史净值 API 调用**（如 CMB/ICBC 翻页爬取），仅查询最新净值；历史净值回填需在详情页手动触发

* 分红同步随净值更新自动执行（见「外部数据获取 → 五、基金分红自动同步」），失败不影响主流程

### 调度器 API

| 方法   | 路由                          | 功能                        |
| ---- | --------------------------- | ------------------------- |
| GET  | `/api/nav-scheduler/status` | 启用状态 / 上次运行 / 下次运行 / 汇总统计 |
| POST | `/api/nav-scheduler/run`    | **手动触发一次**全量净值更新（含锁保护）    |
| POST | `/api/nav-scheduler/toggle` | 开 / 关 自动调度                |

也可在「设置」页 UI 操作。

## Vite 开发环境 API 代理

[Vite 配置](file:///Users/haijun/Documents/Financial/app/vite.config.ts) 的 7 条代理规则：

| 前端路径                   | 目标                                   | 用途                            |
| ---------------------- | ------------------------------------ | ----------------------------- |
| `/api/db/*`            | `http://localhost:3002/*`            | 数据库 / 调度 / 基金阶段涨幅 / 持仓 / 指数历史 |
| `/api/scrape/*`        | `http://localhost:3001/api/scrape/*` | 招银 / 工银 爬虫                    |
| `/api/fund/*`          | `http://fundgz.1234567.com.cn/*`     | 天天基金实时估值（保留）                  |
| `/api/eastmoney/*`     | `https://fund.eastmoney.com/*`       | 东方财富基金数据                      |
| `/api/pingzhongdata/*` | `https://fund.eastmoney.com/*`       | 基金历史净值 JS（权益详情页主要来源）          |
| `/api/fundmobapi/*`    | `https://fundmobapi.eastmoney.com/*` | 东方财富移动端基金 API                 |
| `/api/nav-scheduler/*` | `http://localhost:3002/*`            | 净值调度器 API                     |

## 服务架构

### 开发环境

```
                    +────────────────+
                    │   Vite :5173   │
                    │  前端 + 代理    │
                    +──┬─────────┬───+
                       │/api/db  │/api/scrape  +→ 东方财富/天天基金/腾讯/中证官网
                       ▼         ▼              /→ fundgz.1234567.com.cn
              +─────────────+  +───────────+   /→ fundf10 / fund.eastmoney
              │ DB :3002    │  │ Scraper   │  /→ web.ifzq.gtimg.cn(腾讯)
              │ SQLite+调度 │  │ :3001     │ /→ www.csindex.com.cn
              +─────────────+  +──Puppeteer─+  → cfweb.paas.cmbchina.com
                                            \  → wm.icbc.com.cn
```

### 生产环境（单容器）

```
docker-host :8080 ──▶ Nginx (:80 inside)
                        ├─ /        ──▶ 静态 build
                        ├─ /api/db/ ──▶ DB Server :3002
                        └─ /api/scrape/ ─▶ Scraper :3001
   data/finance.db, logs/ 挂在 Volume 持久化
```

## 数据库表结构（7 张表）

### 1. users — 用户表

| 字段        | 类型      | 约束              | 说明            |
| --------- | ------- | --------------- | ------------- |
| id        | TEXT    | PRIMARY KEY     | 用户唯一 ID       |
| username  | TEXT    | UNIQUE NOT NULL | 用户名           |
| password  | TEXT    | NOT NULL        | bcrypt 10 轮哈希 |
| createdAt | INTEGER | NOT NULL        | 注册时间戳（毫秒）     |

***

### 2. products — 产品表（21 个字段）

**核心字段（建表时）**：

| 字段        | 类型      | 默认值  | 说明                                                              |
| --------- | ------- | ---- | --------------------------------------------------------------- |
| id        | TEXT    | —    | PRIMARY KEY                                                     |
| userId    | TEXT    | —    | NOT NULL，用户归属                                                   |
| name      | TEXT    | —    | NOT NULL，产品名称                                                   |
| type      | TEXT    | —    | NOT NULL，`equity` \| `fixed_income` \| `fund` \| `term_deposit` |
| code      | TEXT    | `''` | 产品代码；定存产品可为空                                                    |
| note      | TEXT    | `''` | 备注                                                              |
| holder    | TEXT    | `''` | 持有人                                                             |
| createdAt | INTEGER | —    | NOT NULL，创建时间（毫秒）                                               |

**ALTER 扩展字段（按添加顺序）**：

| 字段               | 类型      | 默认值  | 说明                                                  |
| ---------------- | ------- | ---- | --------------------------------------------------- |
| dcaAmount        | REAL    | 0    | 定投金额                                                |
| dcaCycle         | TEXT    | `''` | 定投周期：`daily` \| `weekly` \| `biweekly` \| `monthly` |
| navSource        | TEXT    | `''` | 净值数据源：`tiantian`(天天基金) \| `cmb`(招银) \| `icbc`(工银)   |
| holdingTerm      | TEXT    | `''` | 持有期限                                                |
| benchmarkEnabled | INTEGER | 0    | 是否启用业绩比较基准（0/1）                                     |
| benchmarkFormula | TEXT    | `''` | 基准公式，如 `000906*0.6+H11001*0.4`                      |
| interestRate     | REAL    | 0    | 定期存款年利率（%）                                          |
| durationMonths   | INTEGER | 0    | 定期存款期限（月）                                           |
| minAmount        | REAL    | 0    | 起存金额                                                |
| maturityDate     | TEXT    | `''` | 到期日期                                                |
| interestMethod   | TEXT    | `''` | 付息方式：`maturity` \| `monthly` \| `quarterly`         |
| bankName         | TEXT    | `''` | 银行名称                                                |
| purchaseLimit    | TEXT    | `''` | 限购信息（独立于 note 保存）                                   |

***

### 3. transactions — 交易记录表

| 字段        | 类型      | 默认值  | 说明                                                     |
| --------- | ------- | ---- | ------------------------------------------------------ |
| id        | TEXT    | —    | PRIMARY KEY                                            |
| userId    | TEXT    | —    | NOT NULL，用户归属                                          |
| productId | TEXT    | —    | NOT NULL，所属产品                                          |
| type      | TEXT    | —    | NOT NULL，`buy` \| `sell` \| `dividend` \| `nav_update` |
| date      | INTEGER | —    | NOT NULL，毫秒时间戳                                         |
| amount    | REAL    | —    | NOT NULL，交易金额                                          |
| price     | REAL    | —    | NOT NULL，单价/净值                                         |
| shares    | REAL    | —    | NOT NULL，份额                                            |
| fee       | REAL    | 0    | 手续费                                                    |
| note      | TEXT    | `''` | 备注（`nav_update` 类型只写时间戳）                               |

> **注**：`nav_update` 类型已逐步迁移至 `nav_history` 独立表，当前 transactions 表仅保留 user 交易的 buy/sell/dividend 三类。

***

### 4. nav\_history — 净值历史表

| 字段        | 类型      | 默认值  | 说明                                        |
| --------- | ------- | ---- | ----------------------------------------- |
| id        | TEXT    | —    | PRIMARY KEY                               |
| userId    | TEXT    | —    | NOT NULL，用户归属                             |
| productId | TEXT    | —    | NOT NULL，所属产品                             |
| date      | INTEGER | —    | NOT NULL，**午夜零点时间戳**（YYYY-MM-DD 00:00:00） |
| nav       | REAL    | —    | NOT NULL，单位净值                             |
| note      | TEXT    | `''` | 更新说明                                      |
| createdAt | INTEGER | —    | NOT NULL，记录创建时间                           |

**唯一索引**：`idx_nav_unique ON nav_history(userId, productId, date)` — 同一产品同一天只允许一条净值记录\
**普通索引**：`idx_nav_product_date ON nav_history(productId, date)` — 加速按产品+日期查询

***

### 5. product\_dividends — 产品分红历史表

| 字段           | 类型      | 默认值           | 说明                                      |
| ------------ | ------- | ------------- | --------------------------------------- |
| id           | TEXT    | —             | PRIMARY KEY                             |
| userId       | TEXT    | —             | NOT NULL，用户归属                           |
| productId    | TEXT    | —             | NOT NULL，所属产品                           |
| registerDate | INTEGER | —             | NOT NULL，权益登记日（零点时间戳）                   |
| exDate       | INTEGER | NULL          | 除权除息日（零点时间戳）                            |
| payDate      | INTEGER | NULL          | 分红发放日（零点时间戳）                            |
| dividendType | TEXT    | —             | NOT NULL，`cash`(现金分红) \| `split`(送股/转增) |
| perShare     | REAL    | —             | NOT NULL，每份分红（元）                        |
| per10Shares  | REAL    | —             | NOT NULL，每 10 份分红（元）                    |
| splitRatio   | REAL    | NULL          | 送转比例（仅 split 类型）                        |
| year         | TEXT    | NULL          | 分红所属年份                                  |
| source       | TEXT    | `'eastmoney'` | 数据来源（东方财富 fundf10 爬取）                   |
| createdAt    | INTEGER | —             | NOT NULL，记录创建时间                         |

**唯一索引**：`idx_pd_unique ON product_dividends(userId, productId, registerDate, dividendType)` — 同一产品同一天同类型只允许一条\
**普通索引**：`idx_pd_product_register ON product_dividends(productId, registerDate)` — 加速按产品+登记日查询

***

### 6. data\_cache — 数据缓存表

| 字段          | 类型      | 说明                                                                                        |
| ----------- | ------- | ----------------------------------------------------------------------------------------- |
| cache\_key  | TEXT    | PRIMARY KEY，如 `index_history_000906` / `fund_holdings_110044` / `fund_stage_gains_110044` |
| cache\_data | TEXT    | NOT NULL，JSON 字符串                                                                         |
| updated\_at | INTEGER | NOT NULL，更新时间戳                                                                            |
| expires\_at | INTEGER | NOT NULL，过期时间戳                                                                            |

**索引**：`idx_data_cache_expires ON data_cache(expires_at)` — 加速过期数据清理

***

### 7. app\_meta — 应用元数据表

| 字段        | 类型      | 说明                                                                              |
| --------- | ------- | ------------------------------------------------------------------------------- |
| key       | TEXT    | PRIMARY KEY，如 `nav_history_migration_done` / `product_dividends_migration_done` |
| value     | TEXT    | NOT NULL，值（JSON 字符串）                                                            |
| updatedAt | INTEGER | NOT NULL，更新时间戳                                                                  |

用途：记录数据迁移状态、版本号等一次性标记。

***

## API 接口文档

db-server 运行在 `:3002`，前端通过 Vite 代理 `/api/db/*` → `:3002` 访问。除非特殊说明，所有 `/api/` 前缀的接口均需 `Authorization: Bearer <token>` 认证头。

### 一、认证接口（无需认证）

| 方法     | 路径               | 说明                                    |
| ------ | ---------------- | ------------------------------------- |
| `GET`  | `/health`        | 健康检查                                  |
| `POST` | `/auth/register` | 用户注册 `{ username, password }`         |
| `POST` | `/auth/login`    | 用户登录，返回 `{ token, userId, username }` |
| `POST` | `/auth/logout`   | 用户登出                                  |
| `GET`  | `/auth/verify`   | 验证 token 有效性                          |

***

### 二、产品 API

| 方法     | 路径              | 说明                      |
| ------ | --------------- | ----------------------- |
| `GET`  | `/api/products` | 获取当前用户全部产品列表            |
| `POST` | `/api/products` | 全量保存产品（DELETE + INSERT） |

**请求体示例**（`POST /api/products`）：

```json
[
  {
    "id": "uuid-xxx",
    "name": "招商中证白酒",
    "type": "equity",
    "code": "161725",
    "navSource": "tiantian",
    "benchmarkEnabled": true,
    "benchmarkFormula": "000906*0.6+H11001*0.4",
    "purchaseLimit": "",
    "holder": "",
    "dcaAmount": 0,
    "dcaCycle": "",
    "holdingTerm": "",
    "interestRate": 0,
    "durationMonths": 0,
    "minAmount": 0,
    "maturityDate": "",
    "interestMethod": "",
    "bankName": ""
  }
]
```

> **重要**：必须使用 `/api/db/products` 路径（即代理到 `/api/products`），不要用旧版 `/products` 路由，以确保所有新字段（如 `benchmark`、`purchaseLimit`）被正确持久化。

***

### 三、交易记录 API

| 方法       | 路径                      | 说明                         |
| -------- | ----------------------- | -------------------------- |
| `GET`    | `/api/transactions`     | 获取全部交易记录                   |
| `POST`   | `/api/transactions`     | 全量保存交易（DELETE + INSERT）    |
| `POST`   | `/api/transactions/add` | 新增单条交易（nav\_update 会做同日去重） |
| `PUT`    | `/api/transactions/:id` | 更新单条交易                     |
| `DELETE` | `/api/transactions/:id` | 删除单条交易                     |

**请求体示例**（`POST /api/transactions/add`）：

```json
{
  "productId": "uuid-xxx",
  "type": "buy",
  "date": 1725120000000,
  "amount": 10000,
  "price": 1.2345,
  "shares": 8100.44,
  "fee": 1.50,
  "note": "定投买入"
}
```

交易类型（`type`）：`buy`(买入) | `sell`(卖出) | `dividend`(分红) | `nav_update`(净值更新，已迁移至 nav\_history 表)

***

### 四、净值历史 API

| 方法       | 路径                            | 说明                                |
| -------- | ----------------------------- | --------------------------------- |
| `GET`    | `/api/nav-history`            | 获取全部净值历史记录                        |
| `GET`    | `/api/nav-history/:productId` | 按产品 ID 获取净值历史（时间升序）               |
| `POST`   | `/api/nav-history`            | 写入单条净值（INSERT OR REPLACE，按唯一索引去重） |
| `POST`   | `/api/nav-history/batch`      | 批量写入净值（INSERT OR IGNORE，跳过重复日期）   |
| `DELETE` | `/api/nav-history/:productId` | 删除某产品的全部净值记录                      |

**请求体示例**（`POST /api/nav-history`）：

```json
{
  "productId": "uuid-xxx",
  "date": 1725120000000,
  "nav": 1.2345,
  "note": "2025/8/30 14:30:00"
}
```

**批量写入示例**（`POST /api/nav-history/batch`）：

```json
{
  "productId": "uuid-xxx",
  "items": [
    { "date": 1725033600000, "nav": 1.2200, "note": "" },
    { "date": 1725120000000, "nav": 1.2345, "note": "" }
  ]
}
```

> **约定**：`date` 字段必须使用**午夜零点时间戳**（`YYYY-MM-DD 00:00:00` 对应毫秒值），唯一索引 `(userId, productId, date)` 保证同一产品同一天只保存一条净值记录。

***

### 五、产品分红 API

| 方法       | 路径                                  | 说明                                |
| -------- | ----------------------------------- | --------------------------------- |
| `GET`    | `/api/product-dividends`            | 获取全部分红历史记录                        |
| `GET`    | `/api/product-dividends/:productId` | 按产品 ID 获取分红历史（登记日降序）              |
| `POST`   | `/api/product-dividends`            | 写入单条分红（INSERT OR REPLACE，按唯一索引去重） |
| `POST`   | `/api/product-dividends/batch`      | 批量写入分红（INSERT OR IGNORE）          |
| `DELETE` | `/api/product-dividends/:productId` | 删除某产品的全部分红记录                      |

**请求体示例**（`POST /api/product-dividends`）：

```json
{
  "productId": "uuid-xxx",
  "registerDate": 1719158400000,
  "exDate": 1719244800000,
  "payDate": 1719763200000,
  "dividendType": "cash",
  "perShare": 0.1200,
  "per10Shares": 1.2000,
  "splitRatio": null,
  "year": "2025"
}
```

> **约定**：分红类型 `dividendType`：`cash`(现金分红) | `split`(送股/转增)。唯一索引 `(userId, productId, registerDate, dividendType)` 保证同一产品同一天同类型只保存一条。

***

### 六、基金净值查询 API（无需认证）

| 方法    | 路径                               | 说明                                 |
| ----- | -------------------------------- | ---------------------------------- |
| `GET` | `/api/fund/nav/:code`            | 查询基金最新净值（优先东方财富移动端 API，失败回退旧版）     |
| `GET` | `/api/fund/purchase-limit/:code` | 查询基金限购信息（来自 fundf10.eastmoney.com） |

**响应示例**（`/api/fund/nav/161725`）：

```json
{
  "code": "161725",
  "name": "招商中证白酒指数(LOF)A",
  "nav": 1.2345,
  "date": "2025-08-29",
  "purchaseLimit": "不限购"
}
```

***

### 七、基金阶段涨幅 API（无需认证）

| 方法    | 路径                                    | 说明                                            |
| ----- | ------------------------------------- | --------------------------------------------- |
| `GET` | `/fund/stage-gains/:code`             | 单只基金阶段涨幅（1 周/1 月/3 月/6 月/1 年/2 年/3 年/今年来/成立来） |
| `GET` | `/fund/stage-gains-batch?codes=a,b,c` | 批量获取多只基金阶段涨幅                                  |

**响应示例**：

```json
{
  "code": "161725",
  "data": {
    "1w": 2.35,
    "1m": -1.20,
    "3m": 5.68,
    "6m": 12.40,
    "1y": 8.90,
    "2y": -3.50,
    "3y": 15.20,
    "ytd": 6.80,
    "sinceInception": 245.60
  }
}
```

> 数据缓存 TTL：24 小时（SQLite `data_cache`，key 格式 `fund_stage_gains_{code}`）。

***

### 八、基金持仓穿透 API（无需认证）

| 方法    | 路径                            | 说明                  |
| ----- | ----------------------------- | ------------------- |
| `GET` | `/fund/holdings/:code`        | 基金前十大重仓股 + 资产配置比例   |
| `GET` | `/equity/aggregated-holdings` | 多只基金持仓汇总（按持有市值加权合并） |
| `GET` | `/stock/industries`           | 批量获取股票行业分类          |

**响应示例**（`/fund/holdings/161725`）：

```json
{
  "code": "161725",
  "stocks": [
    { "name": "贵州茅台", "code": "600519", "ratio": 9.20 },
    { "name": "五粮液", "code": "000858", "ratio": 8.50 }
  ],
  "assetAllocation": {
    "stockRatio": 92.5,
    "bondRatio": 0,
    "cashRatio": 5.8,
    "otherRatio": 1.7
  }
}
```

> 缓存 TTL：到下一季报发布后 30 天；数据过旧时自动匹配目标 ETF 替代。

***

### 九、基金净值补全 API

| 方法     | 路径                              | 说明                                   |
| ------ | ------------------------------- | ------------------------------------ |
| `POST` | `/fund/backfill-nav/:productId` | 补全基金自成立以来的全部历史净值（东方财富 pingzhongdata） |

**响应示例**：

```json
{
  "success": true,
  "total": 1825,
  "inserted": 1520,
  "skipped": 305
}
```

> `inserted + skipped = total`；此操作不经过缓存层，直接写入 `nav_history` 表。

***

### 十、基金分红同步 API

| 方法    | 路径                                     | 说明                                                  |
| ----- | -------------------------------------- | --------------------------------------------------- |
| `GET` | `/api/fund/dividends/:code`            | 获取基金分红/拆分记录                                         |
| `GET` | `/api/fund/dividends/:code?autoSync=1` | 获取并自动同步分红到 `product_dividends` 表 + 生成 `dividend` 交易 |

**响应示例**：

```json
{
  "dividends": [
    {
      "registerDate": "2025-06-15",
      "exDate": "2025-06-16",
      "payDate": "2025-06-18",
      "dividendType": "cash",
      "per10Shares": 1.5000,
      "perShare": 0.1500
    }
  ],
  "synced": 1
}
```

> 分红同步使用 **6 小时节流缓存** 防止频繁 API 调用；分红交易按登记日持仓份额生成，含 productId + date + amount 三重去重。

***

### 十一、固收理财净值爬虫 API（招银/工银）

| 方法    | 路径                                                | 说明                           |
| ----- | ------------------------------------------------- | ---------------------------- |
| `GET` | `/api/scrape/cmb?code={code}`                     | 招银理财最新净值（Puppeteer 爬虫 :3001） |
| `GET` | `/api/scrape/cmb/batch?codes=a,b,c`               | 招银批量净值                       |
| `GET` | `/cmb/nav-history/:code?maxPages=5`               | 招银历史净值（翻页爬取，优先读缓存）           |
| `GET` | `/api/scrape/icbc?code={code}`                    | 工银理财最新净值                     |
| `GET` | `/api/scrape/icbc/history?code={code}&maxPages=5` | 工银历史净值                       |

> 历史净值爬取仅在详情页手动触发，**调度器不执行历史爬取**。CMB 历史缓存 TTL：24 小时。

***

### 十二、指数数据 API（业绩比较基准，无需认证）

| 方法    | 路径                           | 说明           |
| ----- | ---------------------------- | ------------ |
| `GET` | `/index/history?code=000906` | 获取指数历史 K 线数据 |

**支持的指数**：

| 指数代码     | 指数名称   | 数据来源       |
| -------- | ------ | ---------- |
| `000300` | 沪深 300 | 腾讯 K 线 API |
| `000905` | 中证 500 | 腾讯 K 线 API |
| `000906` | 中证 800 | 腾讯 K 线 API |
| `000923` | 公司债指数  | 腾讯 K 线 API |
| `H11001` | 中证全债   | 中证指数官网     |

> 规则：以 `00` 开头的纯数字指数走腾讯 API；以 `H` 开头的债券指数走中证官网。缓存 TTL：4 小时。

***

### 十三、批量导入 API

| 方法     | 路径                  | 说明            |
| ------ | ------------------- | ------------- |
| `POST` | `/api/batch-import` | 批量导入产品 + 交易数据 |

**支持格式**：JSON 数组，每个元素含产品基本信息 + `transactions` 子数组。

```json
[
  {
    "name": "招商中证白酒",
    "type": "equity",
    "code": "161725",
    "navSource": "tiantian",
    "transactions": [
      { "type": "buy", "date": 1725120000000, "amount": 10000, "price": 1.2345, "shares": 8100.44, "fee": 1.50 }
    ]
  }
]
```

> 支持去重逻辑：按产品名 + 代码 + 类型匹配已有产品，跳过重复；交易按 productId + type + date + amount 四重去重。

***

### 十四、净值调度器 API（无需认证）

| 方法     | 路径                          | 说明                         |
| ------ | --------------------------- | -------------------------- |
| `GET`  | `/api/nav-scheduler/status` | 查询调度器状态（启用状态/上次运行/下次运行/统计） |
| `POST` | `/api/nav-scheduler/run`    | 手动触发一次全量净值更新（含互斥锁保护）       |
| `POST` | `/api/nav-scheduler/toggle` | 启用/禁用自动调度                  |

**status 响应示例**：

```json
{
  "enabled": true,
  "lastRun": "2025-08-30 14:00:00",
  "nextRun": "2025-08-30 16:00:00",
  "totalRuns": 1250,
  "totalUpdated": 38420
}
```

> 调度时间：北京时间 10:00–13:00、16:00–23:00 每小时一次。`mutex` 锁防止并发：`isNavUpdating` 标记 + 串行执行入口。

***

### 十五、数据缓存 API（无需认证）

| 方法     | 路径             | 说明                                  |
| ------ | -------------- | ----------------------------------- |
| `GET`  | `/cache/:key`  | 获取单条缓存                              |
| `POST` | `/cache/batch` | 批量获取缓存 `{ keys: ["key1", "key2"] }` |

***

## 认证 & 数据安全

* **密码**：bcrypt 10 轮

* **Token**：`HMAC-SHA256(userId + username + exp)`，Base64URL 编码，24h 有效；前端 localStorage 存储

* **路由守卫**：未登录跳 `/login`，已登录不访问 `/login|/register`

* **请求头**：所有 `/api/db/*` 自动带 `Authorization: Bearer`；401 自动登出

* **速率限制**：登录 / 注册每 IP 每 15 分钟 ≤ 10 次

* **数据隔离**：authenticate 中间件注入 `req.userId`，所有产品/交易/缓存查询均带 userId 过滤

* **输入约束**：用户名 3–20 字母数字下划线；密码 ≥ 6 位；JSON body 限 10 MB

## 路由

| 路径                     | 视图                             | 说明                  |
| ---------------------- | ------------------------------ | ------------------- |
| `/login` / `/register` | Login / Register               | 不需要认证               |
| `/`                    | Dashboard                      | 仪表盘汇总               |
| `/equity`              | Products (`type=equity`)       | 权益产品列表              |
| `/fixed-income`        | Products (`type=fixed_income`) | 固收产品列表              |
| `/term-deposit`        | Products (`type=term_deposit`) | 定存产品列表              |
| `/products`            | Products (all)                 | 全部产品                |
| `/products/:id`        | ProductDetail                  | 产品详情（定存产品路由守卫禁止进入）  |
| `/compare`             | Compare                        | 多产品对比页（净值走势 + 区间年化） |
| `/transactions`        | Transactions                   | 所有交易                |
| `/settings`            | Settings                       | 导入/导出/调度/清空         |

**URL 状态持久化**：

* 产品筛选状态（全部/持有/已清仓/自选）保存在 URL query `status` / `type`，浏览器前进后退保持一致

* 列表排序键与排序方向保存在 `localStorage`，按页类型分离（equity/fixed\_income/all）

## 关键前端 UI 约定

* 金额类数据统一 **1 位小数**

* 汇总卡移动端：总市值标签 12px、值 24px；持仓收益/总收益率/年化收益率/今日收益 4 列一行 `gap-x-2`，标签 **13px**、值 **15px**

* PC 端概览与产品页统一 4 卡布局 `gap-3`（市值 / 持仓收益+今日收益小字 / 持仓收益率 / 年化），标签 **12px**、值 **22px**

* 权益阶段涨幅卡：`grid-cols-4` 固定 8 指标 2 行（1w/1m/3m/6m/1y/2y/3y/ytd）

* 固收年化收益大卡：`grid-cols-3` 固定 5 指标 2 行（1m/3m/6m/1y/成立以来）

* 净值走势图 X 轴 type=`time` 而非 category，与对比页完全对齐

* 净值走势图时间范围默认"近 1 年"，支持 1w/1m/3m/6m/1y/2y/3y/全部；范围选择**按午夜时间戳**截断，保证开始日期整段显示

* 移动端所有选择胶囊（净值区间、交易类型、交易日期）统一降尺寸（px-2 py-0.5、11px、min-h 28px）

* 交易卡片编辑/删除：PC 端显示在右上角，移动端 `< md` 隐藏

* 净值更新卡片：第一行蓝粗日期+备注+标签，第二行净值+涨跌幅；不显示无意义的份额 0.000 与 每日收益空值

* 定存产品卡片：进度条下方一行显示「存款进度 X% · 剩余 X 天 · 到期 YYYY-MM-DD」，均匀分布

## 常见注意事项

1. **必须** **`./start.sh`** **启动**：避免多 db-server 并发，净值更新冲突
2. **macOS 上 lsof 要加** **`-nP`**：否则 DNS 反查会把脚本卡住
3. **Docker 容器里记得装 curl**：`fetchFromEastmoney/Tencent/Csindex` 全部基于 `execSync('curl ...')`，缺 curl 直接 0 数据
4. **指数代码匹配**：正则 `([A-Za-z]?\d{5,6})`，支持纯数字（000906）和字母+数字（H11001）
5. **00xxxx 的东方财富 push2his API 现已全面封程序化请求**；代码已切到腾讯 K 线。请勿回退
6. **SQLite 布尔值**：`benchmarkEnabled` 这类 0/1 整型需 `=== true || === 1` 双重判断
7. **定存产品**：不提供详情页；`term_deposit` 在路由守卫和卡片点击层都禁止跳转
8. **同一用户、同一日期、同一产品** 的 `nav_update` 只能有一条，DB 唯一约束兜底
9. **VPN 关闭但 env 未清**：`https_proxy` 残留会让 curl 连本地也走代理；代码已 `--noproxy '*'` 保护

## 许可证

Private
