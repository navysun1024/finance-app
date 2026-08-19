# 个人理财统计系统

一个功能完善的个人投资收益率统计 Web 应用，支持权益（基金）、固收理财、定期存款三类产品的净值跟踪、收益计算、业绩比较基准与可视化展示。

## 功能特性

- **三类产品支持**：权益产品（公募基金 / 权益类理财）、固收理财产品、定期存款
- **多种净值数据源**：天天基金（权益+固收）、招银理财 Puppeteer 爬虫、工银理财 Puppeteer 爬虫
- **业绩比较基准**：支持自定义指数公式（如 `中证800*0.6 + 中证全债*0.4`），随净值走势叠加展示
- **自动净值更新**：内置定时调度器（北京时间 10–13 点 / 16–23 点，每小时一次）+ 手动触发
- **XIRR 年化收益率计算**：基于实际现金流（买入/卖出/分红）计算真实年化
- **持仓穿透**：自动抓取基金股票持仓，按持有权益加权聚合展示
- **限购信息自动同步**：从东方财富基金 F10 抓取并合并到产品备注
- **可视化图表**：资产分布饼图、收益/市值趋势、净值走势（含基准对比）、阶段涨幅、持仓穿透柱图等 ECharts 图表
- **多产品对比**：支持权益/固收产品收益率与净值走势叠加对比，差异一目了然
- **批量导入 / 导出**：Excel/JSON 导入、JSON 备份、Excel 报表
- **用户认证**：注册/登录、bcrypt 密码哈希、24h 会话、速率限制、多用户数据隔离
- **响应式 UI**：Tailwind CSS，移动端+PC 端深度优化；支持深浅主题
- **Docker 部署**：单容器内 Nginx + DB + 爬虫，Volume 数据持久化

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vue** | 3.4.21 | 前端框架（Composition API + `<script setup>`） |
| **Vue Router** | 4.3.0 | 路由管理（含导航守卫） |
| **TypeScript** | 5.4.5 | 类型系统 |
| **Vite** | 5.2.8 | 构建与开发服务器 |
| **@vitejs/plugin-vue** | 6.0.7 | Vite Vue 单文件组件插件 |
| **vue-tsc** | 2.0.0 | Vue TypeScript 类型检查 |
| **Tailwind CSS** | 3.4.14 | 原子化样式框架 |
| **PostCSS** | 8.4.35 | CSS 后处理器 |
| **Autoprefixer** | 10.4.17 | CSS 自动前缀 |
| **ECharts** | 5.5.0 | 数据可视化图表 |
| **Lucide Vue Next** | 0.31.0 | SVG 图标库 |
| **XLSX** | 0.18.5 | Excel 文件生成/解析 |
| **Express** | 5.2.1 | 后端 HTTP 框架 |
| **cors** | 2.8.6 | Express 跨域中间件 |
| **SQLite3** | 6.0.1 | 后端数据库 |
| **sql.js** | 1.14.1 | 浏览器端 SQLite（保留模块） |
| **Puppeteer** | 25.1.0 | 招银理财 / 工银理财 网页爬虫 |
| **bcryptjs** | 3.0.3 | 密码加密 |
| **Axios** | 1.16.1 | HTTP 请求 |
| **@types/node** | 20.11.0 | Node.js TypeScript 类型定义 |
| **@types/bcryptjs** | 2.4.6 | bcryptjs TypeScript 类型定义 |
| **Node** | >= 22 | 运行环境（Puppeteer 25 要求） |

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
- 前端应用: http://localhost:5173
- 数据库 API: http://localhost:3002
- 爬虫服务:   http://localhost:3001

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
- 飞牛默认 docker 镜像源可能 401，改 daemon.json 的 `registry-mirrors`
- Puppeteer 25 需 Node 22，Dockerfile 已用 `node:22-alpine` + 系统 Chromium + `--no-sandbox`

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
- `navSource`（净值源）：`''`(不查询) / `tiantian`(天天基金) / `cmb`(招银) / `icbc`(工银)；固收产品按 `navSource` 选择对应爬虫，权益走天天基金
- `benchmarkEnabled` / `benchmarkFormula`：是否启用业绩基准 + 基准公式，如 `000906*0.6+H11001*0.4`
- `purchaseLimit`、`buyLimit` 等限购信息合并到 `note` 字段保存，格式如 `单日上限5万元` / `暂停申购` / `不限购`

## 外部数据获取方式与触发条件

> 这是本项目最核心的"动态数据"部分。所有外部请求会通过缓存层（SQLite `data_cache` 表 + 前端 indexApi.ts localStorage 缓存）去重。

### 一、权益产品净值 + 限购（东方财富移动端 + 旧接口回退）

| 数据项 | 获取端 | 触发条件 | 接口 / 代理路径 | 目标 URL / 实现 | 缓存 |
|---|---|---|---|---|---|
| **历史净值曲线** | 前端 equityApi.ts [fetchEquityNav](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L27) | 详情页加载、净值走势刷新、回填历史 | 优先 `/api/db/api/fund/nav/{code}`（后端统一封装，HTTPS直连）；失败回退 `/api/pingzhongdata/pingzhongdata/{code}.js` | 后端 `fetchFundNavServer`：①东方财富移动端 APP API（净值更新快 30–60min）→ ②回退 `https://fund.eastmoney.com/pingzhongdata/{code}.js` | 详情页回填历史通过 `POST /fund/backfill-nav/:productId` 走 pingzhongdata，不落缓存 |
| **最新净值 + 名称 + 当日收益** | 后端 db-server.js `fetchFundNavServer`（调度时） | 定时调度、手动触发、产品列表页手动更新 | 后端 `/api/fund/nav/:code` → 前端封装 `/api/db/api/fund/nav/{code}` | ①优先：`https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo`（移动端APP API）；②失败回退：`https://fund.eastmoney.com/pingzhongdata/{code}.js` | — |
| **限购信息（暂停/单日上限/不限购）** | 后端 `fetchFundPurchaseLimit`（在净值接口**内部串行返回**） | 随净值查询**一同返回**；即使当日净值已存在，调度器仍会独立更新 `products.note` | 后端直连 `fundf10.eastmoney.com/jbgk_{code}.html`（在 fetchFundNavMobile / fetchFundNavLegacy 内部调用） | `http://fundf10.eastmoney.com/jbgk_{code}.html` | 结果合并到 `products.note` 持久化，格式如 `单日上限5万元` / `暂停申购` / `不限购` |
| **阶段涨幅（1w/1m/3m/6m/1y/2y/3y/ytd）** | 前端 equityApi.ts [fetchEquityStageGains](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L250) | 详情页阶段涨幅卡片加载、批量加载 | `/api/db/fund/stage-gains/:code` → 后端 `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jdzf` | `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jdzf&code={code}` | SQLite `data_cache`（`fund_stage_gains_{code}`，TTL 24h） |
| **基金持仓（前十大重仓股 + 资产配置）** | 前端 equityApi.ts [fetchEquityHoldings](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L331) | 产品列表「持仓穿透」展开、详情页持仓 | `/api/db/fund/holdings/:code` → 后端 `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc` | `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10` | SQLite `data_cache`（`fund_holdings_{code}`，TTL 到下季季报发布后 30 天；数据过旧时自动匹配目标 ETF 替代） |
| **持仓穿透聚合（多只基金按持有权益加权）** | 前端 [fetchAggregatedHoldings](file:///Users/haijun/Documents/Financial/app/src/utils/equityApi.ts#L394) | 产品列表页持仓穿透展开 | `/api/db/equity/aggregated-holdings?funds=id1,id2`（后端组合，不直连外部） | — | 按基金组合哈希缓存 |

### 二、固收理财产品净值（Puppeteer 爬虫）

| 数据项 | 触发条件 | 路由（前端 → 后端 → 爬虫） | 目标站点 / 页面 | 超时（爬虫内部 / db-server 外层） |
|---|---|---|---|---|
| **招银理财 最新净值** | 调度 / 手动 / 产品列表页更新（`navSource==='cmb'`） | 前端 `/api/scrape/cmb?code={code}` → 爬虫 `GET /api/scrape/cmb` | `https://cfweb.paas.cmbchina.com/personal/prodvalue` （搜索→详情） | **45s / 3min** |
| **招银理财 历史净值（翻页）** | 详情页手动回填历史（`navSource==='cmb'`，调度不执行历史） | 前端 `/api/db/cmb/nav-history/{code}?maxPages=N` → 后端 `GET /cmb/nav-history/:code` → 爬虫 `GET /api/scrape/cmb/history` | 同上（点击"下一页"翻到指定页） | **5min / 10min** |
| **招银 批量净值** | 调度器批量（`navSource==='cmb'`） | 前端 `/api/scrape/cmb/batch?codes=a,b,c` → 爬虫 `GET /api/scrape/cmb/batch` | 同上 | 每产品 20s / 批 |
| **工银理财 最新净值** | 调度 / 手动（`navSource==='icbc'`） | 前端 `/api/scrape/icbc?code={code}` → 爬虫 `GET /api/scrape/icbc` | `https://wm.icbc.com.cn/netWorthDisclosure` （红按钮搜索区→新详情页） | **90s（重试 180s） / 3min** |
| **工银理财 历史净值** | 详情页手动回填（`navSource==='icbc'`，调度不执行历史） | 前端 `/api/scrape/icbc/history?code={code}&maxPages=N` → 爬虫 `GET /api/scrape/icbc/history` | 同上（详情页翻页） | 爬虫内部 3min / — |

**爬虫关键约定**：
- 调度器**只跑最新净值**，不做历史 API 调用；历史回填必须由用户在详情页手动触发
- CMB 历史页爬取采用 `elementHandle.evaluate(el => el.click())`，避免 puppeteer `click()` 在 headless 中卡住
- 所有爬虫接口支持 `mock` 参数（未启动 Chromium 时返回模拟数据兜底）

### 三、定期存款

- 定存产品**无外部 API**；当日收益 = 本金 × 年利率 / 365（**到期后收益 = 0**），在前端 `useFinance.ts` 中直接计算
- 定存产品**不展示详情页**；PC 与移动端列表点击均禁止跳转到 `ProductDetail`（卡片层 `@click` 条件拦截 + 无路由守卫兜底）
- 起始日期计算优先级：①有交易记录 → 首次买入日期；②无交易但有到期日+期限 → 到期日 - 存款期限；③其他 → 创建日期

### 四、业绩比较基准指数（走势图对比）

| 指数代码 | 数据来源 | 获取端 | 触发条件 | 目标 URL |
|---|---|---|---|---|
| **00xxxx 股票指数**（硬编码支持：`000906` 中证800 / `000300` 沪深300 / `000905` 中证500 / `000923` 公司债指数） | **腾讯 K 线 API**（原 push2his.eastmoney.com 已封锁） | 后端 [fetchFromTencent](file:///Users/haijun/Documents/Financial/app/server/db-server.js#L2962) | 净值走势图加载时基准公式解析出该指数 | `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh{code},day,,,1000,qfq`（重试 3 次，间隔 2s） |
| **H 开头债券指数**（硬编码支持：`H11001` 中证全债） | 中证指数官网 API | 后端 [fetchFromCsindex](file:///Users/haijun/Documents/Financial/app/server/db-server.js#L2988) | 同上 | `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={code}&startDate={YYYYMMDD(10年前)}&endDate={YYYYMMDD(今天)}`（实际传具体日期值，而非中文描述） |

**路由**：`GET /index/history?code=000906`（Vite 代理 `/api/db/index/history` → :3002）

**缓存**：SQLite `data_cache`（`index_history_{code}`，TTL 4 小时）

**注意**：非硬编码集合内的指数代码会直接返回"不支持"错误；如需新增请在 db-server.js 的 `INDEX_TENCENT_CODES` / `INDEX_CSI_HCODES` Set 中注册。

**curl 健壮性**（后端 `execCurlWithProxyFallback`）：
1. 先以 `--noproxy '*'` 直连（避免 shell 残留的 https_proxy 干扰）
2. 直连失败且系统存在 `https_proxy/http_proxy` 环境变量时，自动降级走代理
3. 所有请求加 `-L` 跟随 302 重定向

## 净值定时调度器

调度器内嵌在 [db-server.js L1198-L2033](file:///Users/haijun/Documents/Financial/app/server/db-server.js#L1198-L2033)。

### 触发条件与时间

```
10:00  11:00  12:00  13:00    ← 上午盘后
16:00  17:00  18:00  19:00  20:00  21:00  22:00  23:00   ← 下午/晚间
```

按**北京时间**触发，即使用户部署在海外 Docker 容器里也通过 Asia/Shanghai 时区判断。每分钟 tick 检查是否命中到点。

### 并发约束

- **互斥锁**：`isNavUpdating` 标记 + 所有净值更新在同一 `updateAllNavs()` 串行入口；调度到点、手动 `run` API、短时间内重复点击均会被「正在更新」拦截
- **同日重复拒绝**：`nav_update` 类型在 `transactions` 插入前以"午夜日期戳"查询，若存在则跳过；数据库层面 `(userId,productId,type,date)` 唯一约束兜底
- **净值查询优先级**（同一用户内按产品）：天天基金(tiantian) → 招银(cmb) → 工银(icbc)，分别对应 3 分钟 + 10 分钟超时
- **限购信息先于历史净值检查**：即使当日净值记录已存在，限购信息仍会更新到 products.note

### 净值记录细节

- 日期戳**强制转换为当日午夜 00:00**，保证产品列表筛选 / 走势 X 轴 / 对比页 X 轴边界一致
- `nav_update` 交易备注中**只写时间戳**，不加"来源:xxx"等前缀

### 调度器 API

| 方法 | 路由 | 功能 |
|---|---|---|
| GET | `/api/nav-scheduler/status` | 启用状态 / 上次运行 / 下次运行 / 汇总统计 |
| POST | `/api/nav-scheduler/run` | **手动触发一次**全量净值更新（含锁保护） |
| POST | `/api/nav-scheduler/toggle` | 开 / 关 自动调度 |

也可在「设置」页 UI 操作。

## Vite 开发环境 API 代理

[Vite 配置](file:///Users/haijun/Documents/Financial/app/vite.config.ts) 的 7 条代理规则：

| 前端路径 | 目标 | 用途 |
|---|---|---|
| `/api/db/*` | `http://localhost:3002/*` | 数据库 / 调度 / 基金阶段涨幅 / 持仓 / 指数历史 |
| `/api/scrape/*` | `http://localhost:3001/api/scrape/*` | 招银 / 工银 爬虫 |
| `/api/fund/*` | `http://fundgz.1234567.com.cn/*` | 天天基金实时估值（保留） |
| `/api/eastmoney/*` | `https://fund.eastmoney.com/*` | 东方财富基金数据 |
| `/api/pingzhongdata/*` | `https://fund.eastmoney.com/*` | 基金历史净值 JS（权益详情页主要来源） |
| `/api/fundmobapi/*` | `https://fundmobapi.eastmoney.com/*` | 东方财富移动端基金 API |
| `/api/nav-scheduler/*` | `http://localhost:3002/*` | 净值调度器 API |

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

## 数据库表结构（4 张）

### users — 用户
| 字段 | 约束 | 说明 |
|---|---|---|
| id TEXT | PK | 用户唯一 ID |
| username TEXT | UNIQUE NOT NULL | 用户名 |
| password TEXT | NOT NULL | bcrypt 哈希 |
| createdAt INTEGER | NOT NULL | 注册时间戳 |

### products — 产品
| 字段 | 说明 |
|---|---|
| id / userId / name | 主键 / 用户归属 / 产品名 |
| type | `equity` \| `fixed_income` \| `fund` \| `term_deposit` |
| code | 产品代码；定存产品可为空 |
| navSource | `''` \| `tiantian` \| `cmb` \| `icbc` |
| note | 备注（**含限购信息自动追加行**） |
| holder / dcaAmount / dcaCycle | 持有人 / 定投金额 / 定投周期 |
| benchmarkEnabled / benchmarkFormula | 是否启用基准 / 基准公式（指数代码×权重代数和） |
| createdAt | 创建时间 |

### transactions — 交易
| 字段 | 说明 |
|---|---|
| id / userId / productId | 主键 / 用户归属 / 产品 |
| type | `buy` \| `sell` \| `dividend` \| `nav_update` |
| date | **午夜时间戳**（用于去重与 X 轴一致） |
| amount / price / shares / fee | 金额 / 价格(净值) / 份额 / 手续费 |
| note | 备注；`nav_update` 只写时间戳 |

### data_cache — 缓存
| 字段 | 说明 |
|---|---|
| cache_key TEXT | PK，如 `index_history_000906` / `fund_holdings_110044` / `fund_stage_gains_110044` |
| cache_data TEXT | JSON 字符串 |
| updated_at / expires_at | 更新 / 过期时间戳；`idx_data_cache_expires` 索引 |

## 认证 & 数据安全

- **密码**：bcrypt 10 轮
- **Token**：`HMAC-SHA256(userId + username + exp)`，Base64URL 编码，24h 有效；前端 localStorage 存储
- **路由守卫**：未登录跳 `/login`，已登录不访问 `/login|/register`
- **请求头**：所有 `/api/db/*` 自动带 `Authorization: Bearer`；401 自动登出
- **速率限制**：登录 / 注册每 IP 每 15 分钟 ≤ 10 次
- **数据隔离**：authenticate 中间件注入 `req.userId`，所有产品/交易/缓存查询均带 userId 过滤
- **输入约束**：用户名 3–20 字母数字下划线；密码 ≥ 6 位；JSON body 限 10 MB

## 路由

| 路径 | 视图 | 说明 |
|---|---|---|
| `/login` / `/register` | Login / Register | 不需要认证 |
| `/` | Dashboard | 仪表盘汇总 |
| `/equity` | Products (`type=equity`) | 权益产品列表 |
| `/fixed-income` | Products (`type=fixed_income`) | 固收产品列表 |
| `/term-deposit` | Products (`type=term_deposit`) | 定存产品列表 |
| `/products` | Products (all) | 全部产品 |
| `/products/:id` | ProductDetail | 产品详情（定存产品路由守卫禁止进入） |
| `/compare` | Compare | 多产品对比页（净值走势 + 区间年化） |
| `/transactions` | Transactions | 所有交易 |
| `/settings` | Settings | 导入/导出/调度/清空 |

**URL 状态持久化**：
- 产品筛选状态（全部/持有/已清仓/自选）保存在 URL query `status` / `type`，浏览器前进后退保持一致
- 列表排序键与排序方向保存在 `localStorage`，按页类型分离（equity/fixed_income/all）

## 关键前端 UI 约定

- 金额类数据统一 **1 位小数**
- 汇总卡移动端：总市值标签 12px、值 24px；持仓收益/总收益率/年化收益率/今日收益 4 列一行 `gap-x-2`，标签 **13px**、值 **15px**
- PC 端概览与产品页统一 4 卡布局 `gap-3`（市值 / 持仓收益+今日收益小字 / 持仓收益率 / 年化），标签 **12px**、值 **22px**
- 权益阶段涨幅卡：`grid-cols-4` 固定 8 指标 2 行（1w/1m/3m/6m/1y/2y/3y/ytd）
- 固收年化收益大卡：`grid-cols-3` 固定 5 指标 2 行（1m/3m/6m/1y/成立以来）
- 净值走势图 X 轴 type=`time` 而非 category，与对比页完全对齐
- 净值走势图时间范围默认"近 1 年"，支持 1w/1m/3m/6m/1y/2y/3y/全部；范围选择**按午夜时间戳**截断，保证开始日期整段显示
- 移动端所有选择胶囊（净值区间、交易类型、交易日期）统一降尺寸（px-2 py-0.5、11px、min-h 28px）
- 交易卡片编辑/删除：PC 端显示在右上角，移动端 `< md` 隐藏
- 净值更新卡片：第一行蓝粗日期+备注+标签，第二行净值+涨跌幅；不显示无意义的份额 0.000 与 每日收益空值
- 定存产品卡片：进度条下方一行显示「存款进度 X% · 剩余 X 天 · 到期 YYYY-MM-DD」，均匀分布

## 常见注意事项

1. **必须 `./start.sh` 启动**：避免多 db-server 并发，净值更新冲突
2. **macOS 上 lsof 要加 `-nP`**：否则 DNS 反查会把脚本卡住
3. **Docker 容器里记得装 curl**：`fetchFromEastmoney/Tencent/Csindex` 全部基于 `execSync('curl ...')`，缺 curl 直接 0 数据
4. **指数代码匹配**：正则 `([A-Za-z]?\d{5,6})`，支持纯数字（000906）和字母+数字（H11001）
5. **00xxxx 的东方财富 push2his API 现已全面封程序化请求**；代码已切到腾讯 K 线。请勿回退
6. **SQLite 布尔值**：`benchmarkEnabled` 这类 0/1 整型需 `=== true || === 1` 双重判断
7. **定存产品**：不提供详情页；`term_deposit` 在路由守卫和卡片点击层都禁止跳转
8. **同一用户、同一日期、同一产品** 的 `nav_update` 只能有一条，DB 唯一约束兜底
9. **VPN 关闭但 env 未清**：`https_proxy` 残留会让 curl 连本地也走代理；代码已 `--noproxy '*'` 保护

## 许可证

Private
