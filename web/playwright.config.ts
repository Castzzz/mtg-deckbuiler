import { defineConfig, devices } from '@playwright/test'

// Testes de ponta a ponta: o site de verdade, no navegador, falando com a API e o banco locais.
// Precisa do Postgres de pé com os dados importados (docker compose up -d --wait). Se a API e o Vite
// já estiverem rodando, usa eles; senão sobe os dois (a API leva ~20s pra carregar o grafo).
// Uso: npm run e2e  (ou npm run e2e -- --ui pra ver passo a passo)
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',  // .e2e.ts e não .spec.ts, pro Vitest não pegar esses arquivos
  globalTeardown: './e2e/limpar.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // channel chromium: o Chromium completo no modo headless novo (não precisa baixar o headless_shell à parte)
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],
  webServer: [
    {
      command: 'cd .. && .venv/bin/uvicorn api.main:app --port 8000',
      url: 'http://localhost:8000/saude',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
})
