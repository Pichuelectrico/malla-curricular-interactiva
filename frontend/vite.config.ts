import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/malla-curricular-interactiva/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
  mode: "development",
  build: {
    minify: false,
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
