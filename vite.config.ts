import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    exclude: ['sql.js']
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
      }
    }
  }
})