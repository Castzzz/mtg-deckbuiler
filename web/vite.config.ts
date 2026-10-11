import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em desenvolvimento o front chama /api e o Vite repassa pra FastAPI
    proxy: {
      // ws: as salas de jogo usam WebSocket
      '/api': { target: 'http://localhost:8000', ws: true, rewrite: (caminho) => caminho.replace(/^\/api/, '') },
    },
  },
})
