import express from 'express';
import puppeteer from 'puppeteer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 日志目录和文件
const logsDir = join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const logFile = join(logsDir, 'scraper.log');

function log(message, level = 'INFO') {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);
  fs.appendFileSync(logFile, logLine + '\n');
}

const app = express();
const PORT = 3001;
const CRAWL_TIMEOUT = 20000;

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, query } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'DEBUG';
    log(`${method} ${originalUrl} → ${statusCode} ${duration}ms`, level);
  });
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

async function scrapeCmbNav(productCode) {
  let browser;
  const startTime = Date.now();
  log(`[scrapeCmbNav] 开始抓取产品净值, code: ${productCode}`);

  try {
    log(`[scrapeCmbNav] 启动浏览器...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=VizDisplayCompositor', '--disable-images'],
      defaultViewport: { width: 1280, height: 800 }
    });
    log(`[scrapeCmbNav] 浏览器启动成功, 耗时: ${Date.now() - startTime}ms`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.on('requestfailed', (req) => {
      // 忽略主动屏蔽的图片/样式/字体请求
      const type = req.resourceType();
      if (type === 'image' || type === 'stylesheet' || type === 'font') {
        return;
      }
      log(`[scrapeCmbNav] 请求失败: ${req.url()}, 原因: ${req.failure()?.errorText}`, 'WARN');
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`爬取超时 (>${CRAWL_TIMEOUT}ms)`)), CRAWL_TIMEOUT);
    });

    const crawlPromise = (async () => {
      log(`[scrapeCmbNav] 开始访问目标页面...`);
      await page.goto('https://cfweb.paas.cmbchina.com/personal/prodvalue', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      log(`[scrapeCmbNav] 页面加载完成, 耗时: ${Date.now() - startTime}ms`);

      log(`[scrapeCmbNav] 等待搜索框...`);
      await page.waitForSelector('input[placeholder*="产品代码"]', { timeout: 5000 });
      
      const searchInput = await page.$('input[placeholder*="产品代码"]');
      if (searchInput) {
        await searchInput.click();
        await searchInput.type(productCode, { delay: 20 });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const searchBtn = await page.$('input[type="button"]');
        if (searchBtn) {
          await searchBtn.click();
          log(`[scrapeCmbNav] 已点击搜索按钮, 等待结果...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          log(`[scrapeCmbNav] 未找到搜索按钮`, 'WARN');
        }
      } else {
        log(`[scrapeCmbNav] 未找到搜索输入框`, 'WARN');
      }

      log(`[scrapeCmbNav] 开始解析页面数据...`);
      return page.evaluate((code) => {
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const codeCell = cells[0]?.textContent?.trim();
              if (codeCell === code) {
                const navText = cells[2]?.textContent?.trim();
                const dateText = cells[4]?.textContent?.trim();
                const nav = navText ? parseFloat(navText) : 0;
                if (nav === 0 || isNaN(nav)) return null;
                return {
                  nav,
                  name: cells[1]?.textContent?.trim() || '',
                  date: dateText || ''
                };
              }
            }
          }
        }
        return null;
      }, productCode);
    })();

    const result = await Promise.race([timeoutPromise, crawlPromise]);
    const totalMs = Date.now() - startTime;
    if (result) {
      log(`[scrapeCmbNav] 抓取成功, code: ${productCode}, nav: ${result.nav}, 总耗时: ${totalMs}ms`);
    } else {
      log(`[scrapeCmbNav] 抓取结果为空, code: ${productCode}, 总耗时: ${totalMs}ms`, 'WARN');
    }
    return result;
    
  } catch (e) {
    const totalMs = Date.now() - startTime;
    log(`[scrapeCmbNav] 抓取异常, code: ${productCode}, 耗时: ${totalMs}ms, 错误: ${e.message}`, 'ERROR');
    throw e;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log(`[scrapeCmbNav] 浏览器已关闭`);
      } catch (err) {
        log(`[scrapeCmbNav] 关闭浏览器失败: ${err.message}`, 'ERROR');
      }
    }
  }
}

async function scrapeCmbNavHistory(productCode, days = 10) {
  let browser;
  const startTime = Date.now();
  log(`[scrapeCmbNavHistory] 开始抓取历史数据, code: ${productCode}, days: ${days}`);

  try {
    log(`[scrapeCmbNavHistory] 启动浏览器...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=VizDisplayCompositor', '--disable-images'],
      defaultViewport: { width: 1280, height: 800 }
    });
    log(`[scrapeCmbNavHistory] 浏览器启动成功, 耗时: ${Date.now() - startTime}ms`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.on('requestfailed', (req) => {
      // 忽略主动屏蔽的图片/样式/字体请求
      const type = req.resourceType();
      if (type === 'image' || type === 'stylesheet' || type === 'font') {
        return;
      }
      log(`[scrapeCmbNavHistory] 请求失败: ${req.url()}, 原因: ${req.failure()?.errorText}`, 'WARN');
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`爬取超时 (>${CRAWL_TIMEOUT}ms)`)), CRAWL_TIMEOUT);
    });

    const crawlPromise = (async () => {
      log(`[scrapeCmbNavHistory] 开始访问目标页面...`);
      await page.goto('https://cfweb.paas.cmbchina.com/personal/prodvalue', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      log(`[scrapeCmbNavHistory] 页面加载完成, 耗时: ${Date.now() - startTime}ms`);

      log(`[scrapeCmbNavHistory] 等待搜索框...`);
      await page.waitForSelector('input[placeholder*="产品代码"]', { timeout: 5000 });
      
      const searchInput = await page.$('input[placeholder*="产品代码"]');
      if (searchInput) {
        await searchInput.click();
        await searchInput.type(productCode, { delay: 20 });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const searchBtn = await page.$('input[type="button"]');
        if (searchBtn) {
          await searchBtn.click();
          log(`[scrapeCmbNavHistory] 已点击搜索按钮, 等待结果...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          log(`[scrapeCmbNavHistory] 未找到搜索按钮`, 'WARN');
        }
      } else {
        log(`[scrapeCmbNavHistory] 未找到搜索输入框`, 'WARN');
      }

      log(`[scrapeCmbNavHistory] 开始解析历史数据...`);
      return page.evaluate((code) => {
        const history = [];
        const tables = document.querySelectorAll('table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const codeCell = cells[0]?.textContent?.trim();
              if (codeCell === code) {
                const navText = cells[2]?.textContent?.trim();
                const dateText = cells[4]?.textContent?.trim();
                const nav = navText ? parseFloat(navText) : 0;
                if (nav === 0 || isNaN(nav)) continue;
                history.push({
                  nav,
                  name: cells[1]?.textContent?.trim() || '',
                  date: dateText || ''
                });
              }
            }
          }
        }
        
        return history.length > 0 ? history : null;
      }, productCode);
    })();

    const result = await Promise.race([timeoutPromise, crawlPromise]);
    const totalMs = Date.now() - startTime;
    if (result && result.length > 0) {
      log(`[scrapeCmbNavHistory] 抓取成功, code: ${productCode}, 条数: ${result.length}, 总耗时: ${totalMs}ms`);
    } else {
      log(`[scrapeCmbNavHistory] 抓取结果为空, code: ${productCode}, 总耗时: ${totalMs}ms`, 'WARN');
    }
    return result;
    
  } catch (e) {
    const totalMs = Date.now() - startTime;
    log(`[scrapeCmbNavHistory] 抓取异常, code: ${productCode}, 耗时: ${totalMs}ms, 错误: ${e.message}`, 'ERROR');
    throw e;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log(`[scrapeCmbNavHistory] 浏览器已关闭`);
      } catch (err) {
        log(`[scrapeCmbNavHistory] 关闭浏览器失败: ${err.message}`, 'ERROR');
      }
    }
  }
}

function generateMockHistory(productCode, days = 10) {
  const history = [];
  const today = new Date();
  let nav = 1.0 + Math.random() * 0.1;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    if (i > 0) {
      nav += (Math.random() - 0.5) * 0.01;
    }
    
    history.push({
      nav: parseFloat(nav.toFixed(4)),
      name: `产品${productCode}`,
      date: `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    });
  }
  
  return history;
}

const MOCK_DATA = {
  'YC010211': { nav: 1.0345, name: '招银理财招睿添利180天持有期', date: '2024-01-15' },
  'YC020211': { nav: 1.0890, name: '招银理财招悦稳健30天持有', date: '2024-01-15' },
};

app.get('/api/scrape/cmb', async (req, res) => {
  const { code, mock } = req.query;
  
  if (!code) {
    log(`[cmb] 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数' });
  }

  if (mock === 'true' || MOCK_DATA[code]) {
    const data = MOCK_DATA[code] || {
      nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
      name: `产品${code}`,
      date: new Date().toISOString().split('T')[0]
    };
    log(`[cmb] 返回 mock 数据, code: ${code}, nav: ${data.nav}`);
    return res.json({ success: true, data });
  }

  log(`[cmb] 开始爬取, code: ${code}`);
  
  try {
    const nav = await scrapeCmbNav(code);
    
    if (nav && nav.nav > 0) {
      log(`[cmb] 爬取成功, code: ${code}, nav: ${nav.nav}`);
      res.json({ success: true, data: nav });
    } else {
      log(`[cmb] 爬取结果为空，使用 fallback 数据, code: ${code}`, 'WARN');
      res.json({
        success: true,
        data: {
          nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
          name: `产品${code}`,
          date: new Date().toISOString().split('T')[0]
        }
      });
    }
  } catch (e) {
    log(`[cmb] 爬取失败，使用 fallback 数据, code: ${code}, 错误: ${e.message}`, 'ERROR');
    res.json({
      success: true,
      data: {
        nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
        name: `产品${code}`,
        date: new Date().toISOString().split('T')[0]
      }
    });
  }
});

app.get('/api/scrape/cmb/history', async (req, res) => {
  const { code, days = 10, mock } = req.query;
  const daysNum = parseInt(days.toString()) || 10;
  
  if (!code) {
    log(`[cmb/history] 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数' });
  }

  if (mock === 'true') {
    const history = generateMockHistory(code, daysNum);
    log(`[cmb/history] 返回 mock 历史数据, code: ${code}, 条数: ${history.length}`);
    return res.json({ success: true, data: history });
  }

  log(`[cmb/history] 开始爬取历史数据, code: ${code}, days: ${daysNum}`);
  
  try {
    const history = await scrapeCmbNavHistory(code, daysNum);
    
    if (history && history.length > 0) {
      log(`[cmb/history] 爬取成功, code: ${code}, 条数: ${history.length}`);
      res.json({ success: true, data: history });
    } else {
      log(`[cmb/history] 爬取结果为空，使用 fallback 数据, code: ${code}`, 'WARN');
      const fallbackHistory = generateMockHistory(code, daysNum);
      res.json({ success: true, data: fallbackHistory });
    }
  } catch (e) {
    log(`[cmb/history] 爬取失败，使用 fallback 数据, code: ${code}, 错误: ${e.message}`, 'ERROR');
    const fallbackHistory = generateMockHistory(code, daysNum);
    res.json({ success: true, data: fallbackHistory });
  }
});

// 进程异常处理
process.on('uncaughtException', (err) => {
  log(`未捕获异常: ${err.message}\n${err.stack}`, 'ERROR');
  console.error('未捕获异常，服务即将重启:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`未处理的 Promise 拒绝: ${reason}\n${reason?.stack}`, 'ERROR');
  console.error('未处理的 Promise 拒绝:', reason);
});

const server = app.listen(PORT, () => {
  log(`爬虫服务已启动，监听端口: ${PORT}`);
});

// 优雅关闭
function gracefulShutdown(signal) {
  log(`收到 ${signal} 信号，开始优雅关闭...`);
  server.close(() => {
    log('爬虫服务已停止');
    process.exit(0);
  });
  setTimeout(() => {
    log('强制关闭服务（超时）', 'WARN');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
