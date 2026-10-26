import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':  { target: 'http://localhost:3001', changeOrigin: true },
      '/ws':   { target: 'ws://localhost:3001',   changeOrigin: true, ws: true },
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
