import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em desenvolvimento o front chama /api e o Vite repassa pra FastAPI
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (caminho) => caminho.replace(/^\/api/, '') },
    },
  },
})
