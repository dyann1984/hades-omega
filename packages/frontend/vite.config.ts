import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '127.0.0.1',
    strictPort: false,
    proxy: {
      '/api':  { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/ws':   { target: 'ws://127.0.0.1:3001',   changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir:   'dist',
    target:   'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'framer-motion', 'zustand'],
        },
      },
    },
  },
})
