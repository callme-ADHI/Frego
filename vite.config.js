import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/Frego/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@vladmandic/face-api'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by WASM backends)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'face-api': ['@vladmandic/face-api'],
        },
      },
    },
  },
})
