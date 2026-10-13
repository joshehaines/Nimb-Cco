import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { mockApiPlugin } from './scripts/mockApiPlugin'

export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'], react: ['react', 'react-dom', 'react-router-dom'] } } },
  },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
} as any)
