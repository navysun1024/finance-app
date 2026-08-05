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
  optimizeDeps: {
    exclude: ['sql.js']
  },
  build: {
    // NAS 内存有限，降低并行 worker 数避免 SIGSEGV
    // 默认 Vite 会用 CPU 核数 -1，飞牛等小机器容易 OOM -> Segmentation fault
    workers: Math.max(1, Math.min(2, (cpus().length || 2) - 1)),
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
          vue: ['vue', 'vue-router'],
          echarts: ['echarts'],
          lucide: ['lucide-vue-next']
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