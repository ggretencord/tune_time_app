import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: [
      '.up.railway.app',
      '.44you.net',
      ...(process.env.RAILWAY_PUBLIC_DOMAIN ? [process.env.RAILWAY_PUBLIC_DOMAIN] : []),
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4010',
        changeOrigin: true,
      },
    },
  },
})
