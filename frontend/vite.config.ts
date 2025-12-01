import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3691,
    proxy: {
      '/api/': {
        target: 'http://localhost:8847',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 自动添加 api_key 参数（开发环境）
            const apiKey = 'yk_HPGMcKf8CkgIsUlUXQLyKJds4tU6CpbP63SPAEIfJ9M'
            const url = new URL(req.url || '', 'http://localhost')
            if (!url.searchParams.has('api_key')) {
              url.searchParams.set('api_key', apiKey)
              proxyReq.path = url.pathname + url.search
            }
          })
        },
      },
    },
  },
})
