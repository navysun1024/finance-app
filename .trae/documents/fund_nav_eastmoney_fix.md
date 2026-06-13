# 计划：修复基金净值查询不支持部分代码（如 019455）的问题

## 背景

当前基金净值查询仅支持天天基金网（`fundgz.1234567.com.cn`）接口，该接口对部分 QDII 基金或新基金（如代码 019455）返回空数据。东方财富网（`fund.eastmoney.com`）的 `F10DataApi.aspx` 接口可以返回这些基金的数据，但需要 `Referer` 请求头验证，而浏览器的 `fetch` API 不允许设置 `Referer`（它是被禁止的请求头）。之前已添加 Vite 代理和 `fetchEastMoneyFundNav` 函数，但由于 `Referer` 头无法从浏览器传递到目标服务器，代理返回空数据。

## 解决方案

利用 Vite 代理中间件的 `configure` 钩子，在服务端转发请求时注入 `Referer` 和 `User-Agent` 头，从而绕过浏览器的限制。

## 实施步骤

### 步骤 1：修改 `vite.config.ts` — 在代理中注入 Referer 头

**文件**：`vite.config.ts`
**位置**：`/api/eastmoney` 代理配置块

在已有的 `/api/eastmoney` 代理中添加 `configure` 选项，通过 `proxyReq` 事件在请求转发前注入 `Referer` 和 `User-Agent` 请求头：

```ts
'/api/eastmoney': {
  target: 'https://fund.eastmoney.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/eastmoney/, ''),
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.setHeader('Referer', 'https://fund.eastmoney.com/')
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    })
  }
}
```

**原因**：`http-proxy` 库（Vite 底层使用的代理）支持 `proxyReq` 事件，通过 `setHeader` 可以在请求到达目标服务器之前添加自定义头。这解决了浏览器 `fetch` 无法设置 `Referer` 的限制。

### 步骤 2：简化 `fundApi.ts` 中的 `fetchEastMoneyFundNav`

**文件**：`src/utils/fundApi.ts`

移除 `fetch` 调用中显式设置的 `User-Agent` 和 `Referer` 请求头（它们已在代理层自动注入），同时移除 `catch (e)` 和 `catch (e2)` 中的 `any` 类型标注以消除 TypeScript 报错：

```ts
async function fetchEastMoneyFundNav(fundCode: string): Promise<NavResult> {
  const today = new Date()
  const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const url = `/api/eastmoney/f10/F10DataApi.aspx?type=lsjz&code=${fundCode}&page=1&sdate=2020-01-01&edate=${endDate}&per=1`

  const response = await fetch(url)
  const text = await response.text()

  const jsonMatch = text.match(/var\s+apidata\s*=\s*(\{.+?\});/)
  if (!jsonMatch) {
    throw new Error('东方财富数据格式异常')
  }

  const data = JSON.parse(jsonMatch[1])
  if (!data.content) {
    throw new Error('东方财富网暂无该基金净值数据')
  }

  const dateMatch = data.content.match(/<tr><td>(\d{4}-\d{2}-\d{2})<\/td><td\s+class='tor\s+bold'>([\d.]+)<\/td>/)
  if (!dateMatch) {
    throw new Error('未能解析净值数据')
  }

  return {
    nav: parseFloat(dateMatch[2]),
    date: dateMatch[1],
    name: ''
  }
}
```

### 步骤 3：重启 Vite 开发服务器并测试

1. 重启 Vite 服务（代理配置变更需要重启）
2. 通过浏览器访问产品详情页，点击「查询净值」按钮
3. 验证基金代码 019455 能否成功查询到净值（预期结果：返回 2026-05-29 的净值 3.9113）

## 涉及文件

| 文件 | 操作 | 变更说明 |
|------|------|---------|
| `vite.config.ts` | 修改 | 在 `/api/eastmoney` 代理中添加 `configure` 钩子注入 Referer 和 User-Agent 头 |
| `src/utils/fundApi.ts` | 修改 | 简化 `fetchEastMoneyFundNav`，移除浏览器中无效的自定义请求头 |

## 净值查询链路（最终）

```
fetchFundNav('019455')
  → 1. 天天基金代理接口 (/api/fund/js/019455.js)
      → 失败：返回空数据 jsonpgz()
  → 2. 天天基金直连接口 (fundgz.1234567.com.cn)
      → 失败：同上
  → 3. 东方财富网代理 (/api/eastmoney/f10/F10DataApi.aspx)
      → Vite 代理注入 Referer + User-Agent
      → fund.eastmoney.com 返回净值数据
      → 解析出 nav=3.9113, date=2026-05-29
      → ✅ 成功！
```

## 预期结果

- 基金代码 019455 能成功查询到最新净值
- 其他在天天基金网查不到的基金代码也能通过东方财富网获取
- 三层查询链路覆盖所有主流基金数据源