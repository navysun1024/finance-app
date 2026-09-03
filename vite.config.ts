import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { cpus } from 'os'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    // NAS 内存有限，降低并行 worker 数避免 SIGSEGV
    // 默认 Vite 会用 CPU 核数 -1，飞牛等小机器容易 OOM -> Segmentation fault
    workers: Math.max(1, Math.min(2, (cpus().length || 2) - 1)),
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts')) return 'echarts'
          if (id.includes('node_modules/xlsx')) return 'xlsx'
          if (id.includes('node_modules/vue') || id.includes('node_modules/vue-router') || id.includes('node_modules/@vue')) return 'vue'
          if (id.includes('node_modules/lucide-vue-next')) return 'lucide'
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/fund': {
        target: 'https://fundgz.1234567.com.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fund/, '')
      },
      '/api/eastmoney': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/api\/eastmoney/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            try {
              proxyReq.setHeader('Referer', 'https://fund.eastmoney.com/')
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
            } catch (_) {}
          })
        }
      },
      '/api/pingzhongdata': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pingzhongdata/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            try {
              proxyReq.setHeader('Referer', 'https://fund.eastmoney.com/')
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
            } catch (_) {}
          })
        }
      },
      '/api/fundmobapi': {
        target: 'https://fundmobapi.eastmoney.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/api\/fundmobapi/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            try {
              proxyReq.setHeader('Referer', 'https://fund.eastmoney.com/')
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')
            } catch (_) {}
          })
        }
      },
      '/api/scrape': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/db': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/db/, ''),
        timeout: 600000
      },
      '/api/nav-scheduler': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      // 通用后端代理：/api/products, /api/transactions, /api/nav-history, /api/transactions/add, /api/batch-import 等
      // 放在更具体的 /api/* 代理之后，匹配不到的 /api/* 请求都转到 db-server (3002)
      '/api/products': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/transactions': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/nav-history': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/product-dividends': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/batch-import': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/fund/purchase-limit': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/fund/nav': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      },
      '/api/fund/dividends': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        timeout: 600000
      }
    }
  }
})