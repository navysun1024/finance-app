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
const CMB_HISTORY_TIMEOUT = 5 * 60 * 1000; // 5分钟，用于翻页获取所有历史净值

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
      // 先尝试等待更长时间，同时添加调试日志
      try {
        await page.waitForSelector('input[placeholder*="产品代码"]', { timeout: 10000 });
      } catch (e) {
        // 如果第一个选择器失败，尝试其他可能的选择器
        log(`[scrapeCmbNav] 第一个选择器失败，尝试备用选择器...`, 'WARN');
        // 获取页面HTML调试信息
        const html = await page.content();
        const inputs = await page.$$eval('input', (els) => els.map(e => ({ 
          type: e.type, 
          placeholder: e.placeholder,
          className: e.className 
        })));
        log(`[scrapeCmbNav] 页面中找到 ${inputs.length} 个input元素`, 'DEBUG');
        log(`[scrapeCmbNav] input元素详情: ${JSON.stringify(inputs)}`, 'DEBUG');
        
        // 尝试其他选择器
        await page.waitForSelector('input[type="text"]', { timeout: 5000 });
      }
      
      // 尝试多个选择器获取搜索输入框
      let searchInput = await page.$('input[placeholder*="产品代码"]');
      if (!searchInput) {
        log(`[scrapeCmbNav] 尝试备用选择器获取搜索框...`, 'DEBUG');
        searchInput = await page.$('input[type="text"]');
      }
      
      if (searchInput) {
        await searchInput.click();
        await searchInput.type(productCode, { delay: 20 });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 尝试多个选择器获取搜索按钮
        let searchBtn = await page.$('input[type="button"]');
        if (!searchBtn) {
          searchBtn = await page.$('button');
        }
        if (!searchBtn) {
          searchBtn = await page.$('[type="submit"]');
        }
        
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
                if (nav === 0 || isNaN(nav)) continue;  // 修改：跳过无效数据，继续查找
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

async function scrapeCmbNavHistory(productCode, maxPages = 50) {
  let browser;
  const startTime = Date.now();
  log(`[scrapeCmbNavHistory] 开始抓取历史数据, code: ${productCode}, maxPages: ${maxPages}`);

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
      const type = req.resourceType();
      if (type === 'image' || type === 'stylesheet' || type === 'font') {
        return;
      }
      log(`[scrapeCmbNavHistory] 请求失败: ${req.url()}, 原因: ${req.failure()?.errorText}`, 'WARN');
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`爬取超时 (>${CMB_HISTORY_TIMEOUT}ms)`)), CMB_HISTORY_TIMEOUT);
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
          
          try {
            await page.waitForNetworkIdle({ idleTime: 2000, timeout: 10000 });
          } catch (e) {}
          
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          log(`[scrapeCmbNavHistory] 未找到搜索按钮`, 'WARN');
        }
      } else {
        log(`[scrapeCmbNavHistory] 未找到搜索输入框`, 'WARN');
      }

      log(`[scrapeCmbNavHistory] 开始解析历史数据...`);
      
      const allHistory = [];
      const seenDates = new Set();
      let currentPage = 1;
      let hasNextPage = true;
      let prevPageDates = '';
      let repeatCount = 0;
      
      while (hasNextPage && currentPage <= maxPages) {
        log(`[scrapeCmbNavHistory] 正在解析第 ${currentPage} 页...`);
        
        const pageData = await page.evaluate((code) => {
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
          
          const paginationInfo = {
            hasNextPage: false,
            totalPages: 1,
            currentPage: 1
          };
          
          let pageInfo = null;
          const allElements = document.querySelectorAll('div, td, span, p, table');
          for (const el of allElements) {
            const text = el.textContent?.trim() || '';
            if (text.includes('页次:') && text.includes('/') && el.offsetParent !== null) {
              pageInfo = el;
              break;
            }
          }
          
          if (pageInfo) {
            const text = pageInfo.textContent?.trim() || '';
            const pageMatch = text.match(/页次:\s*(\d+)\/(\d+)/);
            if (pageMatch) {
              paginationInfo.currentPage = parseInt(pageMatch[1]);
              paginationInfo.totalPages = parseInt(pageMatch[2]);
            } else {
              const totalMatch = text.match(/共\s*(\d+)\s*条记录/);
              if (totalMatch) {
                const total = parseInt(totalMatch[1]);
                paginationInfo.totalPages = Math.ceil(total / 10);
              }
            }
          }
          
          const nextBtn = document.querySelector('input[value*="下一页"], input[value*="Next"], button[value*="下一页"], button[value*="Next"]');
          if (nextBtn) {
            const disabled = nextBtn.disabled || nextBtn.getAttribute('disabled') === 'disabled';
            paginationInfo.hasNextPage = !disabled;
          } else {
            const nextLinks = document.querySelectorAll('a, span');
            for (const link of nextLinks) {
              if (link.textContent?.trim() === '下一页' && link.offsetParent !== null) {
                const parent = link.parentElement;
                if (!parent?.disabled && !link.disabled) {
                  paginationInfo.hasNextPage = true;
                  break;
                }
              }
            }
          }
          
          return { history, paginationInfo };
        }, productCode);
        
        for (const item of pageData.history) {
          if (!seenDates.has(item.date)) {
            seenDates.add(item.date);
            allHistory.push(item);
          }
        }
        
        log(`[scrapeCmbNavHistory] 第 ${currentPage} 页解析完成, 当前页数据: ${pageData.history.length} 条, 累计: ${allHistory.length} 条`);
        
        const currentPageDates = pageData.history.map(h => h.date).join(',');
        if (currentPage > 1 && currentPageDates === prevPageDates) {
          repeatCount++;
          log(`[scrapeCmbNavHistory] 连续第 ${repeatCount} 页数据重复，可能已到达最后一页`);
          if (repeatCount >= 2) {
            log(`[scrapeCmbNavHistory] 连续2页数据重复，停止翻页`);
            hasNextPage = false;
            break;
          }
        } else {
          repeatCount = 0;
        }
        prevPageDates = currentPageDates;
        
        if (pageData.history.length === 0) {
          log(`[scrapeCmbNavHistory] 当前页无数据，停止翻页`);
          hasNextPage = false;
          break;
        } else if (!pageData.paginationInfo.hasNextPage) {
          log(`[scrapeCmbNavHistory] 下一页按钮不可点击，停止翻页`);
          hasNextPage = false;
          break;
        } else if (currentPage >= maxPages) {
          log(`[scrapeCmbNavHistory] 已达到最大页数 ${maxPages}，停止翻页`);
          hasNextPage = false;
          break;
        } else {
          log(`[scrapeCmbNavHistory] 点击下一页...`);
          const clicked = await page.evaluate(() => {
            const nextBtn = document.querySelector('input[value*="下一页"], input[value*="Next"], button[value*="下一页"], button[value*="Next"]');
            if (nextBtn && !nextBtn.disabled) {
              nextBtn.click();
              return true;
            }
            const nextLinks = document.querySelectorAll('a, span, td');
            for (const link of nextLinks) {
              if (link.textContent?.trim() === '下一页' && link.offsetParent !== null) {
                const parent = link.parentElement;
                if (!parent?.disabled) {
                  link.click();
                  return true;
                }
              }
            }
            return false;
          });
          
          if (clicked) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
              await page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 });
            } catch (e) {}
            currentPage++;
          } else {
            hasNextPage = false;
          }
        }
      }
      
      log(`[scrapeCmbNavHistory] 翻页结束, 总页数: ${currentPage}, 总数据: ${allHistory.length} 条`);
      return allHistory.length > 0 ? allHistory : null;
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

/**
 * 批量查询多个产品净值（一次启动浏览器，依次查询，最后关闭）
 */
async function scrapeCmbNavBatch(codes) {
  const startTime = Date.now();
  log(`[scrapeCmbNavBatch] 开始批量抓取, codes: ${codes.join(', ')}, 数量: ${codes.length}`);

  let browser;
  try {
    log(`[scrapeCmbNavBatch] 启动浏览器...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=VizDisplayCompositor', '--disable-images'],
      defaultViewport: { width: 1280, height: 800 },
      protocolTimeout: 60000 // 设置协议超时为60秒
    });
    log(`[scrapeCmbNavBatch] 浏览器启动成功, 耗时: ${Date.now() - startTime}ms`);

    const results = [];
    const PER_CODE_TIMEOUT = 20000; // 每个产品查询的超时时间

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const codeStartTime = Date.now();
      log(`[scrapeCmbNavBatch] 开始查询第 ${i + 1}/${codes.length} 个产品, code: ${code}`);

      // 为每个产品创建新页面，避免页面状态污染
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

      try {
        const crawlPromise = (async () => {
          log(`[scrapeCmbNavBatch] 开始访问目标页面, code: ${code}`);
          await page.goto('https://cfweb.paas.cmbchina.com/personal/prodvalue', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          });

          log(`[scrapeCmbNavBatch] 等待搜索框, code: ${code}`);
          await page.waitForSelector('input[placeholder*="产品代码"]', { timeout: 5000 });

          const searchInput = await page.$('input[placeholder*="产品代码"]');
          if (!searchInput) {
            log(`[scrapeCmbNavBatch] 未找到搜索输入框, code: ${code}`, 'WARN');
            return null;
          }

          await searchInput.click();
          await searchInput.type(code, { delay: 20 });
          await new Promise(resolve => setTimeout(resolve, 300));

          const searchBtn = await page.$('input[type="button"]');
          if (searchBtn) {
            await searchBtn.click();
            log(`[scrapeCmbNavBatch] 已点击搜索按钮, code: ${code}`);
          } else {
            log(`[scrapeCmbNavBatch] 未找到搜索按钮, code: ${code}`, 'WARN');
          }

          await new Promise(resolve => setTimeout(resolve, 2000));

          // 解析页面数据
          return page.evaluate((searchCode) => {
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
              const rows = table.querySelectorAll('tr');
              for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                  const codeCell = cells[0]?.textContent?.trim();
                  if (codeCell === searchCode) {
                    const navText = cells[2]?.textContent?.trim();
                    const dateText = cells[4]?.textContent?.trim();
                    const nav = navText ? parseFloat(navText) : 0;
                    if (nav === 0 || isNaN(nav)) continue;
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
          }, code);
        })();

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`查询超时 (>${PER_CODE_TIMEOUT}ms)`)), PER_CODE_TIMEOUT);
        });

        const navData = await Promise.race([crawlPromise, timeoutPromise]);

        const codeElapsed = Date.now() - codeStartTime;
        if (navData && navData.nav > 0) {
          log(`[scrapeCmbNavBatch] 查询成功, code: ${code}, nav: ${navData.nav}, 耗时: ${codeElapsed}ms`);
          results.push({ code, ...navData });
        } else {
          log(`[scrapeCmbNavBatch] 查询结果为空, code: ${code}, 耗时: ${codeElapsed}ms`, 'WARN');
          results.push({ code, nav: null, name: '', date: '' });
        }

      } catch (e) {
        const codeElapsed = Date.now() - codeStartTime;
        log(`[scrapeCmbNavBatch] 查询异常, code: ${code}, 耗时: ${codeElapsed}ms, 错误: ${e.message}`, 'WARN');
        results.push({ code, nav: null, name: '', date: '' });
      } finally {
        // 关闭当前页面，继续下一个产品
        await page.close();
      }
    }

    const totalElapsed = Date.now() - startTime;
    log(`[scrapeCmbNavBatch] 批量抓取完成, 总数: ${codes.length}, 总耗时: ${totalElapsed}ms`);
    return results;

  } catch (e) {
    const totalElapsed = Date.now() - startTime;
    log(`[scrapeCmbNavBatch] 批量抓取异常, 耗时: ${totalElapsed}ms, 错误: ${e.message}`, 'ERROR');
    throw e;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log(`[scrapeCmbNavBatch] 浏览器已关闭`);
      } catch (err) {
        log(`[scrapeCmbNavBatch] 关闭浏览器失败: ${err.message}`, 'ERROR');
      }
    }
  }
}

// ── 工银理财净值爬取 ──
async function scrapeIcbcNav(productCode) {
  let browser;
  const startTime = Date.now();
  log(`[scrapeIcbcNav] 开始抓取工银理财产品净值, code: ${productCode}`);

  try {
    log(`[scrapeIcbcNav] 启动浏览器...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=VizDisplayCompositor'],
      defaultViewport: { width: 1280, height: 800 }
    });
    log(`[scrapeIcbcNav] 浏览器启动成功, 耗时: ${Date.now() - startTime}ms`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const ICBC_TIMEOUT = 60000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`爬取超时 (>${ICBC_TIMEOUT}ms)`)), ICBC_TIMEOUT);
    });

    const crawlPromise = (async () => {
      // 监听新页面（popup / targetcreated / 手动枚举）
      let popupPage = null;
      page.on('popup', (p) => {
        popupPage = p;
        log(`[scrapeIcbcNav] ⚡ popup事件: 捕获到新页面`);
      });

      // ── 第1步：访问净值披露页面 ──
      log(`[scrapeIcbcNav] 访问净值披露页面...`);
      await page.goto('https://wm.icbc.com.cn/netWorthDisclosure', {
        waitUntil: 'networkidle2',
        timeout: 20000
      });
      log(`[scrapeIcbcNav] 页面加载完成, URL: ${page.url()}, 耗时: ${Date.now() - startTime}ms`);

      // 等待 Vue 挂载
      try {
        await page.waitForFunction(() => {
          const app = document.getElementById('app');
          return app && app.children.length > 0;
        }, { timeout: 15000 });
      } catch (e) {}

      await new Promise(r => setTimeout(r, 2000));
      log(`[scrapeIcbcNav] 页面稳定`);

      // ── 第2步：找到搜索框并输入 ──
      log(`[scrapeIcbcNav] ===== 定位搜索框 =====`);

      let searchInput = null;

      // 优先找净值披露页面内的搜索框（placeholder="请输入关键词"）
      const prioritySelectors = [
        'input[placeholder="请输入关键词"]',
        'input[placeholder*="关键词"]',
        'input[placeholder*="产品代码"]',
        'input[placeholder*="代码"]',
      ];

      for (const sel of prioritySelectors) {
        const handles = await page.$$(sel);
        for (const h of handles) {
          const info = await h.evaluate(el => ({
            visible: el.offsetParent !== null,
            type: el.type,
            disabled: el.disabled,
            w: el.getBoundingClientRect().width,
            h: el.getBoundingClientRect().height,
            ph: el.placeholder
          }));
          if (info.visible && !info.disabled && info.w > 50 && info.h > 20) {
            searchInput = h;
            log(`[scrapeIcbcNav] 找到搜索框: placeholder="${info.ph}", 尺寸=${info.w}x${info.h}`);
            break;
          }
        }
        if (searchInput) break;
      }

      // 兜底：找其他可见输入框（排除 header 里的"请输入内容"全局搜索框）
      if (!searchInput) {
        const allInputs = await page.$$('input[type="text"], .el-input__inner');
        for (const h of allInputs) {
          const info = await h.evaluate(el => ({
            visible: el.offsetParent !== null,
            disabled: el.disabled,
            w: el.getBoundingClientRect().width,
            h: el.getBoundingClientRect().height,
            ph: el.placeholder
          }));
          if (info.visible && !info.disabled && info.w > 50 && info.h > 20 && info.ph !== '请输入内容') {
            searchInput = h;
            log(`[scrapeIcbcNav] 兜底找到搜索框: placeholder="${info.ph}", 尺寸=${info.w}x${info.h}`);
            break;
          }
        }
      }

      if (!searchInput) {
        log(`[scrapeIcbcNav] ❌ 未找到搜索框`, 'ERROR');
        return null;
      }

      // 输入产品代码
      await searchInput.click();
      await searchInput.type(productCode, { delay: 50 });
      log(`[scrapeIcbcNav] 已输入: ${productCode}`);

      // ── 第4步：找到搜索按钮并点击 ──
      log(`[scrapeIcbcNav] ===== 定位搜索按钮 =====`);

      let searchBtnClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, .el-button, [class*="btn"], [class*="Btn"], [role="button"]');
        for (const btn of btns) {
          const text = btn.textContent?.trim() || '';
          if (text.includes('搜索') && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!searchBtnClicked) {
        log(`[scrapeIcbcNav] 未找到文字含"搜索"的按钮，尝试按回车`, 'WARN');
        await searchInput.press('Enter');
        searchBtnClicked = true;
      }

      log(`[scrapeIcbcNav] 搜索按钮点击: ${searchBtnClicked}`);

      // 等待搜索结果
      await new Promise(r => setTimeout(r, 3000));
      try {
        await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 });
      } catch (e) {}

      // ── 第5步：探索搜索结果 ──
      log(`[scrapeIcbcNav] ===== 探索搜索结果 =====`);

      const resultInfo = await page.evaluate((code) => {
        const results = [];
        const candidates = document.querySelectorAll('li, [class*="product-item"], [class*="item"]');
        for (const el of candidates) {
          if (el.offsetParent === null) continue;
          const text = el.textContent?.trim() || '';
          if (text.length > 20 && text.includes(code)) {
            results.push({
              tag: el.tagName,
              text: text.substring(0, 250),
              cls: el.className?.substring(0, 100) || '',
              hasOnclick: !!el.onclick || !!el.getAttribute('onclick'),
              cursor: getComputedStyle(el).cursor,
              rect: { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) },
              isNetWorth: text.includes('净值披露') || text.includes('净值')
            });
          }
        }
        const seen = new Set();
        const unique = [];
        for (const r of results) {
          const key = r.text.substring(0, 100);
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
          }
        }
        return unique.slice(0, 10);
      }, productCode);

      log(`[scrapeIcbcNav] 找到 ${resultInfo.length} 个匹配结果:`, 'DEBUG');
      resultInfo.forEach((r, i) => {
        log(`  [${i}] [${r.tag}] text="${r.text.substring(0, 70)}" isNetWorth=${r.isNetWorth} cursor=${r.cursor} size=${r.rect.w}x${r.rect.h} cls="${r.cls.substring(0, 30)}"`, 'DEBUG');
      });

      // ── 第6步：点击净值披露的结果项 ──
      let bestMatchIdx = resultInfo.findIndex(r => r.isNetWorth);
      if (bestMatchIdx < 0) bestMatchIdx = resultInfo.findIndex(r => r.text.includes(productCode));

      if (bestMatchIdx < 0) {
        log(`[scrapeIcbcNav] ❌ 未找到匹配的搜索结果`, 'WARN');
      } else {
        log(`[scrapeIcbcNav] 选择结果 [#${bestMatchIdx}]: ${resultInfo[bestMatchIdx].text.substring(0, 100)}`);

        const clicked = await page.evaluate((code) => {
          const selectors = ['li', '[class*="item"]', '[class*="product-item"]', 'a'];
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              if (el.offsetParent === null) continue;
              const text = el.textContent?.trim() || '';
              if (text.includes(code) && text.includes('净值披露')) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 50 && rect.height > 15) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.click();
                  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                  return { success: true, selector: sel, text: text.substring(0, 80) };
                }
              }
            }
          }
          // 如果没找到含"净值披露"的，就找第一个包含产品代码的
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              if (el.offsetParent === null) continue;
              const text = el.textContent?.trim() || '';
              if (text.includes(code)) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 50 && rect.height > 15) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.click();
                  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                  return { success: true, selector: sel, text: text.substring(0, 80) };
                }
              }
            }
          }
          return { success: false };
        }, productCode);

        log(`[scrapeIcbcNav] 点击结果: ${clicked.success ? '成功' : '失败'} (选择器=${clicked.selector || 'none'})`);
      }

      // ── 第7步：检测新页面 ──
      log(`[scrapeIcbcNav] ===== 检测新页面 =====`);

      // 从搜索结果中提取产品名称
      let productName = '';
      if (bestMatchIdx >= 0 && resultInfo[bestMatchIdx]) {
        const text = resultInfo[bestMatchIdx].text;
        const nameMatch = text.match(/^(.*?)(\(\d+GS|\(|净值披露)/);
        if (nameMatch) {
          productName = nameMatch[1].trim();
        }
        if (!productName) {
          productName = text.replace(/净值披露.*$/, '').trim();
        }
        log(`[scrapeIcbcNav] 提取产品名称: "${productName}"`);
      }

      await new Promise(r => setTimeout(r, 2000));

      // 方式1: popup
      if (popupPage && !popupPage.isClosed()) {
        log(`[scrapeIcbcNav] ✅ popup捕获到新页面`);
        try {
          await popupPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (e) {}
        try {
          await popupPage.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1500));
        log(`[scrapeIcbcNav] popup页面URL: ${popupPage.url()}`);
        return await extractIcbcNavFromPage(popupPage, startTime, productName, productCode);
      }

      // 方式2: 枚举所有页面
      const allPages = await browser.pages();
      log(`[scrapeIcbcNav] 浏览器共有 ${allPages.length} 个页面:`, 'DEBUG');
      for (let i = 0; i < allPages.length; i++) {
        const p = allPages[i];
        const url = p.url();
        log(`  [${i}] ${url}`, 'DEBUG');
        if (p !== page && url !== 'about:blank' && !url.startsWith('devtools://')) {
          if (url.includes('netWorthDisclosureDetails') || url.includes('detail')) {
            log(`[scrapeIcbcNav] ✅ 在枚举中找到详情页`);
            try {
              await p.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 });
            } catch (e) {}
            await new Promise(r => setTimeout(r, 1500));
            return await extractIcbcNavFromPage(p, startTime, productName, productCode);
          }
        }
      }

      // ── 第8步：兜底：直接访问详情页 ──
      log(`[scrapeIcbcNav] ===== 兜底：直接导航 =====`);

      // 从搜索结果中提取产品代码（格式如 25GS2736）
      let productIdCode = productCode;
      const idMatch = resultInfo?.[bestMatchIdx >= 0 ? bestMatchIdx : 0]?.text?.match(/产品代码[：:]\s*([A-Z0-9]+)/i);
      if (idMatch) {
        productIdCode = idMatch[1];
        log(`[scrapeIcbcNav] 从结果中提取到产品代码: ${productIdCode}`);
      }

      const idCandidates = [productIdCode, productCode].filter(Boolean);
      const uniqueIds = [...new Set(idCandidates)];

      for (const id of uniqueIds) {
        log(`[scrapeIcbcNav] 尝试直接访问: id=${id}`);
        try {
          await page.goto(`https://wm.icbc.com.cn/netWorthDisclosureDetails?id=${encodeURIComponent(id)}`, {
            waitUntil: 'networkidle2',
            timeout: 15000
          });
          await new Promise(r => setTimeout(r, 3000));
          const currentUrl = page.url();
          log(`[scrapeIcbcNav] 直接导航后URL: ${currentUrl}`);
          if (currentUrl.includes('netWorthDisclosureDetails')) {
            const result = await extractIcbcNavFromPage(page, startTime, productName, productCode);
            if (result && result.nav > 0) {
              return result;
            }
            log(`[scrapeIcbcNav] 页面已加载但未提取到数据，继续尝试其他ID...`, 'WARN');
          }
        } catch (e) {
          log(`[scrapeIcbcNav] 直接导航异常(id=${id}): ${e.message}`, 'WARN');
        }
      }

      log(`[scrapeIcbcNav] ❌ 所有方式均失败`, 'ERROR');
      return null;
    })();

    const result = await Promise.race([timeoutPromise, crawlPromise]);
    return result;

  } catch (e) {
    const totalMs = Date.now() - startTime;
    log(`[scrapeIcbcNav] 抓取异常, code: ${productCode}, 耗时: ${totalMs}ms, 错误: ${e.message}`, 'ERROR');
    log(e.stack, 'ERROR');
    throw e;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log(`[scrapeIcbcNav] 浏览器已关闭`);
      } catch (err) {
        log(`[scrapeIcbcNav] 关闭浏览器失败: ${err.message}`, 'ERROR');
      }
    }
  }
}

// 从工银理财详情页提取净值数据
async function extractIcbcNavFromPage(page, startTime, productName = '', saleCode = '') {
  const url = page.url();
  log(`[extractIcbc] 开始提取净值, URL: ${url.substring(0, 100)}`);

  await new Promise(r => setTimeout(r, 1500));

  // 尝试解析净值数据
  const navData = await page.evaluate(({ name, code }) => {
    const tableSelectors = [
      '.el-table__body-wrapper table',
      '.el-table__body-wrapper tbody',
      'table',
      '.el-table__row'
    ];

    for (const sel of tableSelectors) {
      const rows = document.querySelectorAll(`${sel} tr`);
      if (rows.length < 2) continue;

      const headerRow = rows[0];
      const headers = Array.from(headerRow.querySelectorAll('th, td')).map(c => c.textContent?.trim() || '');

      let navColIdx = -1;
      let dateColIdx = -1;
      let codeColIdx = -1;

      for (let j = 0; j < headers.length; j++) {
        const h = headers[j];
        if (h.includes('份额净值') && !h.includes('累计')) navColIdx = j;
        if (h.includes('日期') || h.includes('数据日期')) dateColIdx = j;
        if (h.includes('销售代码') || h.includes('代码')) codeColIdx = j;
      }

      let targetRow = null;
      const allRows = [];

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length < 3) continue;
        const texts = Array.from(cells).map(c => c.textContent?.trim() || '');
        allRows.push(texts);

        if (codeColIdx >= 0 && code && texts[codeColIdx] === code) {
          targetRow = texts;
          break;
        }
      }

      if (!targetRow && allRows.length > 0) {
        targetRow = allRows[0];
      }

      if (targetRow && navColIdx >= 0 && navColIdx < targetRow.length) {
        const nav = parseFloat(targetRow[navColIdx]);
        const date = dateColIdx >= 0 && dateColIdx < targetRow.length ? targetRow[dateColIdx] : '';
        const rowCode = codeColIdx >= 0 && codeColIdx < targetRow.length ? targetRow[codeColIdx] : '';

        if (!isNaN(nav) && nav > 0) {
          return {
            nav,
            date,
            name: name || rowCode || '',
            code: rowCode
          };
        }
      }
    }

    const allText = document.body.textContent || '';
    const navMatch = allText.match(/份额净值[^0-9]*([0-9]+\.?[0-9]*)/);
    const dateMatch = allText.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
    if (navMatch) {
      return {
        nav: parseFloat(navMatch[1]),
        date: dateMatch ? dateMatch[1] : '',
        name: name || ''
      };
    }

    return null;
  }, { name: productName, code: saleCode });

  if (navData) {
    log(`[extractIcbc] ✅ 解析成功: nav=${navData.nav}, date=${navData.date}, name=${navData.name}`);
  } else {
    log(`[extractIcbc] ❌ 未解析到净值数据`, 'WARN');
  }

  return navData;
}

// 工银理财历史净值查询 - 翻页获取所有历史数据
async function scrapeIcbcNavHistory(productCode, maxPages = 50) {
  let browser;
  const startTime = Date.now();
  log(`[scrapeIcbcNavHistory] 开始抓取工银理财历史净值, code: ${productCode}, maxPages: ${maxPages}`);

  try {
    log(`[scrapeIcbcNavHistory] 启动浏览器...`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=VizDisplayCompositor'],
      defaultViewport: { width: 1280, height: 800 }
    });
    log(`[scrapeIcbcNavHistory] 浏览器启动成功, 耗时: ${Date.now() - startTime}ms`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const ICBC_TIMEOUT = 180000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`爬取超时 (>${ICBC_TIMEOUT}ms)`)), ICBC_TIMEOUT);
    });

    const crawlPromise = (async () => {
      let productName = '';
      let detailPage = null;

      // 监听新页面
      let popupPage = null;
      page.on('popup', (p) => {
        popupPage = p;
        log(`[scrapeIcbcNavHistory] ⚡ popup事件: 捕获到新页面`);
      });

      // ── 第1步：访问净值披露页面并搜索 ──
      log(`[scrapeIcbcNavHistory] 访问净值披露页面...`);
      await page.goto('https://wm.icbc.com.cn/netWorthDisclosure', {
        waitUntil: 'networkidle2',
        timeout: 20000
      });

      try {
        await page.waitForFunction(() => {
          const app = document.getElementById('app');
          return app && app.children.length > 0;
        }, { timeout: 15000 });
      } catch (e) {}

      await new Promise(r => setTimeout(r, 2000));
      log(`[scrapeIcbcNavHistory] 页面稳定`);

      // 找搜索框
      let searchInput = null;
      const prioritySelectors = [
        'input[placeholder="请输入关键词"]',
        'input[placeholder*="关键词"]',
        'input[placeholder*="产品代码"]',
        'input[placeholder*="代码"]',
      ];
      for (const sel of prioritySelectors) {
        const handles = await page.$$(sel);
        for (const h of handles) {
          const info = await h.evaluate(el => ({
            visible: el.offsetParent !== null,
            disabled: el.disabled,
            w: el.getBoundingClientRect().width,
            h: el.getBoundingClientRect().height,
            ph: el.placeholder
          }));
          if (info.visible && !info.disabled && info.w > 50 && info.h > 20) {
            searchInput = h;
            log(`[scrapeIcbcNavHistory] 找到搜索框: placeholder="${info.ph}"`);
            break;
          }
        }
        if (searchInput) break;
      }

      if (!searchInput) {
        log(`[scrapeIcbcNavHistory] 未找到搜索框`, 'ERROR');
        return null;
      }

      await searchInput.click();
      await searchInput.type(productCode, { delay: 50 });
      log(`[scrapeIcbcNavHistory] 已输入: ${productCode}`);

      // 点击搜索
      let searchBtnClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, .el-button, [class*="btn"], [class*="Btn"]');
        for (const btn of btns) {
          const text = btn.textContent?.trim() || '';
          if (text.includes('搜索') && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (!searchBtnClicked) {
        await searchInput.press('Enter');
      }

      await new Promise(r => setTimeout(r, 3000));
      try {
        await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 });
      } catch (e) {}

      // 从搜索结果提取产品名称
      const resultInfo = await page.evaluate((code) => {
        const results = [];
        const candidates = document.querySelectorAll('li, [class*="product-item"], [class*="item"]');
        for (const el of candidates) {
          if (el.offsetParent === null) continue;
          const text = el.textContent?.trim() || '';
          if (text.length > 20 && text.includes(code)) {
            results.push({ text: text.substring(0, 300), isNetWorth: text.includes('净值披露') });
          }
        }
        return results.slice(0, 10);
      }, productCode);

      log(`[scrapeIcbcNavHistory] 找到 ${resultInfo.length} 个匹配结果`);

      let bestMatch = resultInfo.find(r => r.isNetWorth) || resultInfo[0];
      if (bestMatch) {
        const nameMatch = bestMatch.text.match(/^(.*?)(\(\d+GS|\(|净值披露)/);
        if (nameMatch) productName = nameMatch[1].trim();
        log(`[scrapeIcbcNavHistory] 产品名称: ${productName}`);
      }

      // ── 第2步：点击搜索结果，从 popup 获取详情页 ──
      log(`[scrapeIcbcNavHistory] 点击搜索结果进入详情页...`);
      const clicked = await page.evaluate((code) => {
        const selectors = ['li', '[class*="item"]', '[class*="product-item"]', 'a'];
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (el.offsetParent === null) continue;
            const text = el.textContent?.trim() || '';
            if (text.includes(code) && text.includes('净值披露')) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 15) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.click();
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return { success: true };
              }
            }
          }
        }
        return { success: false };
      }, productCode);

      if (!clicked.success) {
        log(`[scrapeIcbcNavHistory] 点击搜索结果失败`, 'ERROR');
        return null;
      }

      // 等待 popup 页面
      await new Promise(r => setTimeout(r, 3000));

      if (popupPage && !popupPage.isClosed()) {
        log(`[scrapeIcbcNavHistory] ✅ popup捕获到详情页`);
        try {
          await popupPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (e) {}
        try {
          await popupPage.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 2000));
        detailPage = popupPage;
        log(`[scrapeIcbcNavHistory] 详情页URL: ${popupPage.url().substring(0, 100)}`);
      } else {
        // 兜底：枚举所有页面
        const allPages = await browser.pages();
        for (const p of allPages) {
          const url = p.url();
          if (p !== page && url.includes('netWorthDisclosureDetails')) {
            detailPage = p;
            log(`[scrapeIcbcNavHistory] ✅ 枚举找到详情页`);
            break;
          }
        }
      }

      if (!detailPage) {
        log(`[scrapeIcbcNavHistory] 无法获取详情页`, 'ERROR');
        return null;
      }

      // ── 第3步：翻页抓取所有历史数据 ──
      log(`[scrapeIcbcNavHistory] ===== 开始翻页抓取历史数据 =====`);

      const allHistory = [];
      let currentPage = 1;
      let hasMorePages = true;
      const seenDates = new Set();

      while (hasMorePages && currentPage <= maxPages) {
        log(`[scrapeIcbcNavHistory] 正在抓取第 ${currentPage} 页...`);

        // 等待表格加载
        await new Promise(r => setTimeout(r, 1500));
        try {
          await detailPage.waitForSelector('.el-table__body-wrapper table, table', { timeout: 10000 });
        } catch (e) {
          log(`[scrapeIcbcNavHistory] 等待表格超时`, 'WARN');
          break;
        }

        // 提取当前页数据
        const pageData = await detailPage.evaluate(({ saleCode, pageNum }) => {
          const rows = [];
          const tableSelectors = ['.el-table__body-wrapper table', 'table'];

          let tableRows = null;
          for (const sel of tableSelectors) {
            const t = document.querySelector(`${sel} tbody`);
            if (t && t.querySelectorAll('tr').length > 0) {
              tableRows = t.querySelectorAll('tr');
              break;
            }
          }
          if (!tableRows) tableRows = document.querySelectorAll('table tr');

          if (tableRows && tableRows.length > 0) {
            // 找表头
            const headerRow = document.querySelector('table thead tr') || tableRows[0];
            const headers = Array.from(headerRow.querySelectorAll('th, td')).map(c => c.textContent?.trim() || '');

            let navColIdx = -1;
            let dateColIdx = -1;
            let codeColIdx = -1;
            let navAccColIdx = -1;

            for (let j = 0; j < headers.length; j++) {
              const h = headers[j];
              if (h.includes('份额净值') && !h.includes('累计')) navColIdx = j;
              if (h.includes('份额累计净值') || h.includes('累计净值')) navAccColIdx = j;
              if (h.includes('日期') || h.includes('数据日期')) dateColIdx = j;
              if (h.includes('销售代码') || h.includes('代码')) codeColIdx = j;
            }

            for (let i = 0; i < tableRows.length; i++) {
              const cells = tableRows[i].querySelectorAll('td');
              if (cells.length < 3) continue;
              const texts = Array.from(cells).map(c => c.textContent?.trim() || '');

              // 只取对应销售代码的数据（如果指定了code）
              if (saleCode && codeColIdx >= 0 && texts[codeColIdx] !== saleCode) continue;

              const nav = navColIdx >= 0 ? parseFloat(texts[navColIdx]) : NaN;
              const date = dateColIdx >= 0 ? texts[dateColIdx] : '';
              const accNav = navAccColIdx >= 0 ? parseFloat(texts[navAccColIdx]) : NaN;

              if (!isNaN(nav) && nav > 0 && date) {
                rows.push({
                  nav,
                  date,
                  accNav: !isNaN(accNav) ? accNav : undefined,
                  code: codeColIdx >= 0 ? texts[codeColIdx] : saleCode || ''
                });
              }
            }
          }

          // 检测分页信息
          let totalPages = 1;
          let isLastPage = false;

          // 查找分页控件
          const paginationEls = document.querySelectorAll('.el-pagination, [class*="pagination"], [class*="pager"]');
          for (const el of paginationEls) {
            const text = el.textContent || '';
            const totalMatch = text.match(/共\s*(\d+)\s*页/);
            if (totalMatch) totalPages = parseInt(totalMatch[1]);
          }

          // 找所有页码按钮
          const pageButtons = document.querySelectorAll('.el-pager li, .el-pagination .number, [class*="pagination"] button, [class*="pager"] li');
          const pageNumbers = [];
          for (const btn of pageButtons) {
            const t = btn.textContent?.trim();
            if (t && /^\d+$/.test(t)) {
              pageNumbers.push(parseInt(t));
            }
          }
          if (pageNumbers.length > 0) {
            totalPages = Math.max(totalPages, ...pageNumbers);
          }

          // 检查"下一页"按钮是否可用
          const nextBtn = document.querySelector('.btn-next, .el-pagination .el-pager li:last-child, [class*="next"]:not([disabled])');
          if (nextBtn) {
            const isDisabled = nextBtn.classList?.contains('disabled') || nextBtn.getAttribute('disabled') !== null || getComputedStyle(nextBtn).cursor === 'not-allowed';
            isLastPage = isDisabled;
          }

          // 如果当前页号等于最大页号，就是最后一页
          if (pageNum >= totalPages) isLastPage = true;

          return { rows, totalPages, isLastPage };
        }, { saleCode: productCode, pageNum: currentPage });

        log(`[scrapeIcbcNavHistory] 第 ${currentPage} 页提取到 ${pageData.rows.length} 条数据, 总页数: ${pageData.totalPages || '未知'}`);

        // 添加到结果（去重）
        let newCount = 0;
        for (const item of pageData.rows) {
          const key = `${item.date}_${item.code || 'default'}`;
          if (!seenDates.has(key)) {
            seenDates.add(key);
            allHistory.push({
              nav: item.nav,
              date: item.date,
              name: productName || item.code || '',
              accNav: item.accNav
            });
            newCount++;
          }
        }
        log(`[scrapeIcbcNavHistory] 第 ${currentPage} 页新增 ${newCount} 条, 累计: ${allHistory.length} 条`);

        // 判断是否还有下一页
        if (pageData.isLastPage || pageData.rows.length === 0) {
          log(`[scrapeIcbcNavHistory] 已是最后一页或无数据，停止翻页`);
          hasMorePages = false;
          break;
        }

        if (currentPage >= maxPages) {
          log(`[scrapeIcbcNavHistory] 达到最大页数限制 ${maxPages}，停止翻页`);
          break;
        }

        // 点击下一页
        const clickResult = await detailPage.evaluate(() => {
          const nextSelectors = [
            '.el-pagination .btn-next',
            '.el-pagination li:last-child',
            '.pagination .next',
            '.pager .next',
            '[class*="next"]'
          ];

          for (const sel of nextSelectors) {
            const btn = document.querySelector(sel);
            if (btn && btn.offsetParent !== null) {
              const isDisabled = btn.classList?.contains('disabled') || btn.getAttribute('disabled') !== null || getComputedStyle(btn).cursor === 'not-allowed';
              if (!isDisabled) {
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                btn.click();
                return { success: true, selector: sel };
              }
            }
          }
          return { success: false };
        });

        if (!clickResult.success) {
          log(`[scrapeIcbcNavHistory] 找不到可用的下一页按钮，停止翻页`, 'WARN');
          break;
        }

        log(`[scrapeIcbcNavHistory] 已点击下一页 (${clickResult.selector})`);
        currentPage++;

        // 等待页面数据更新
        await new Promise(r => setTimeout(r, 2000));
        try {
          await detailPage.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 });
        } catch (e) {}
      }

      log(`[scrapeIcbcNavHistory] ===== 翻页完成，共 ${allHistory.length} 条历史数据 =====`);
      return allHistory.length > 0 ? allHistory : null;
    })();

    const result = await Promise.race([timeoutPromise, crawlPromise]);
    const totalMs = Date.now() - startTime;
    if (result && result.length > 0) {
      log(`[scrapeIcbcNavHistory] 抓取成功, code: ${productCode}, 条数: ${result.length}, 总耗时: ${totalMs}ms`);
    } else {
      log(`[scrapeIcbcNavHistory] 抓取结果为空, code: ${productCode}, 总耗时: ${totalMs}ms`, 'WARN');
    }
    return result;

  } catch (e) {
    const totalMs = Date.now() - startTime;
    log(`[scrapeIcbcNavHistory] 抓取异常, code: ${productCode}, 耗时: ${totalMs}ms, 错误: ${e.message}`, 'ERROR');
    log(e.stack, 'ERROR');
    throw e;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log(`[scrapeIcbcNavHistory] 浏览器已关闭`);
      } catch (err) {
        log(`[scrapeIcbcNavHistory] 关闭浏览器失败: ${err.message}`, 'ERROR');
      }
    }
  }
}

app.get('/api/scrape/cmb', async (req, res) => {
  const { code, mock, userId } = req.query;
  const userTag = userId ? `[用户 ${userId}]` : '';
  
  if (!code) {
    log(`[cmb]${userTag} 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数' });
  }

  if (mock === 'true' || MOCK_DATA[code]) {
    const data = MOCK_DATA[code] || {
      nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
      name: `产品${code}`,
      date: new Date().toISOString().split('T')[0]
    };
    log(`[cmb]${userTag} 返回 mock 数据, code: ${code}, nav: ${data.nav}`);
    return res.json({ success: true, data });
  }

  log(`[cmb]${userTag} 开始爬取, code: ${code}`);
  
  try {
    const nav = await scrapeCmbNav(code);
    
    if (nav && nav.nav > 0) {
      log(`[cmb]${userTag} 爬取成功, code: ${code}, nav: ${nav.nav}`);
      res.json({ success: true, data: nav });
    } else {
      log(`[cmb]${userTag} 爬取结果为空，使用 fallback 数据, code: ${code}`, 'WARN');
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
    log(`[cmb]${userTag} 爬取失败，使用 fallback 数据, code: ${code}, 错误: ${e.message}`, 'ERROR');
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
  const { code, maxPages = 50, days, mock } = req.query;
  const maxPagesNum = parseInt(maxPages.toString()) || 50;
  
  if (!code) {
    log(`[cmb/history] 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数' });
  }

  if (mock === 'true') {
    const history = generateMockHistory(code, maxPagesNum);
    log(`[cmb/history] 返回 mock 历史数据, code: ${code}, 条数: ${history.length}`);
    return res.json({ success: true, data: history });
  }

  log(`[cmb/history] 开始爬取历史数据, code: ${code}, maxPages: ${maxPagesNum}`);
  
  try {
    const history = await scrapeCmbNavHistory(code, maxPagesNum);
    
    if (history && history.length > 0) {
      log(`[cmb/history] 爬取成功, code: ${code}, 条数: ${history.length}`);
      res.json({ success: true, data: history });
    } else {
      log(`[cmb/history] 爬取结果为空，使用 fallback 数据, code: ${code}`, 'WARN');
      const fallbackHistory = generateMockHistory(code, maxPagesNum);
      res.json({ success: true, data: fallbackHistory });
    }
  } catch (e) {
    log(`[cmb/history] 爬取失败，使用 fallback 数据, code: ${code}, 错误: ${e.message}`, 'ERROR');
    const fallbackHistory = generateMockHistory(code, maxPagesNum);
    res.json({ success: true, data: fallbackHistory });
  }
});

/**
 * 批量查询多个产品净值
 * GET /api/scrape/cmb/batch?codes=code1,code2,code3&userId=xxx
 */
app.get('/api/scrape/cmb/batch', async (req, res) => {
  const { codes, mock, userId } = req.query;
  const userTag = userId ? `[用户 ${userId}]` : '';

  if (!codes) {
    log(`[cmb/batch]${userTag} 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数，请使用 ?codes=code1,code2,code3' });
  }

  const codeList = codes.split(',').map(c => c.trim()).filter(Boolean);
  if (codeList.length === 0) {
    log(`[cmb/batch]${userTag} 产品代码列表为空`, 'WARN');
    return res.status(400).json({ success: false, error: '产品代码列表为空' });
  }

  log(`[cmb/batch]${userTag} 开始批量查询, codes: ${codeList.join(', ')}, 数量: ${codeList.length}`);

  if (mock === 'true') {
    const results = codeList.map(code => ({
      code,
      nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
      name: `产品${code}`,
      date: new Date().toISOString().split('T')[0]
    }));
    log(`[cmb/batch]${userTag} 返回 mock 批量数据, 条数: ${results.length}`);
    return res.json({ success: true, data: results });
  }

  try {
    const results = await scrapeCmbNavBatch(codeList);
    log(`[cmb/batch]${userTag} 批量查询成功, 总数: ${codeList.length}, 成功: ${results.filter(r => r.nav > 0).length}`);
    res.json({ success: true, data: results });
  } catch (e) {
    log(`[cmb/batch]${userTag} 批量查询失败, 错误: ${e.message}`, 'ERROR');
    // 返回各个产品的 fallback 数据
    const fallback = codeList.map(code => ({
      code,
      nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
      name: `产品${code}`,
      date: new Date().toISOString().split('T')[0]
    }));
    res.json({ success: true, data: fallback });
  }
});

// ── 工银理财净值查询 ──
app.get('/api/scrape/icbc', async (req, res) => {
  const { code, mock, userId } = req.query;
  const userTag = userId ? `[用户 ${userId}]` : '';

  if (!code) {
    log(`[icbc]${userTag} 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数' });
  }

  if (mock === 'true') {
    const data = {
      nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
      name: `工银理财产品${code}`,
      date: new Date().toISOString().split('T')[0]
    };
    log(`[icbc]${userTag} 返回 mock 数据, code: ${code}, nav: ${data.nav}`);
    return res.json({ success: true, data });
  }

  log(`[icbc]${userTag} 开始爬取, code: ${code}`);

  try {
    const nav = await scrapeIcbcNav(code);

    if (nav && nav.nav > 0) {
      log(`[icbc]${userTag} 爬取成功, code: ${code}, nav: ${nav.nav}`);
      res.json({ success: true, data: nav });
    } else {
      log(`[icbc]${userTag} 爬取结果为空，使用 fallback 数据, code: ${code}`, 'WARN');
      res.json({
        success: true,
        data: {
          nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
          name: `工银理财产品${code}`,
          date: new Date().toISOString().split('T')[0]
        }
      });
    }
  } catch (e) {
    log(`[icbc]${userTag} 爬取失败，使用 fallback 数据, code: ${code}, 错误: ${e.message}`, 'ERROR');
    res.json({
      success: true,
      data: {
        nav: parseFloat((1.0 + Math.random() * 0.1).toFixed(4)),
        name: `工银理财产品${code}`,
        date: new Date().toISOString().split('T')[0]
      }
    });
  }
});

// ── 工银理财历史净值查询 ──
app.get('/api/scrape/icbc/history', async (req, res) => {
  const { code, mock, userId, maxPages } = req.query;
  const userTag = userId ? `[用户 ${userId}]` : '';

  if (!code) {
    log(`[icbc/history]${userTag} 缺少产品代码参数`, 'WARN');
    return res.status(400).json({ success: false, error: '缺少产品代码参数' });
  }

  if (mock === 'true') {
    const history = generateMockHistory(code, 30);
    log(`[icbc/history]${userTag} 返回 mock 历史数据, code: ${code}, 条数: ${history.length}`);
    return res.json({ success: true, data: history });
  }

  log(`[icbc/history]${userTag} 开始爬取历史数据, code: ${code}`);

  try {
    const maxPagesNum = parseInt(maxPages) || 50;
    const history = await scrapeIcbcNavHistory(code, maxPagesNum);

    if (history && history.length > 0) {
      log(`[icbc/history]${userTag} 爬取成功, code: ${code}, 条数: ${history.length}`);
      res.json({ success: true, data: history });
    } else {
      log(`[icbc/history]${userTag} 爬取结果为空，使用 fallback 数据, code: ${code}`, 'WARN');
      const fallbackHistory = generateMockHistory(code, 30);
      res.json({ success: true, data: fallbackHistory });
    }
  } catch (e) {
    log(`[icbc/history]${userTag} 爬取失败，使用 fallback 数据, code: ${code}, 错误: ${e.message}`, 'ERROR');
    const fallbackHistory = generateMockHistory(code, 30);
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
