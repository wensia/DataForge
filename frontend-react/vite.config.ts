import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/df/' : '/',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3692,
    proxy: {
      '/api': {
        target: 'http://localhost:8847',
        changeOrigin: true,
        timeout: 0, // 禁用超时
      },
      '/uploads': {
        target: 'http://localhost:8847',
        changeOrigin: true,
      },
    },
  },
})
