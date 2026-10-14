import { expect, test } from '@playwright/test'
import { importar } from './ajuda.ts'

test('deck criado logado aparece em outro navegador com a mesma conta', async ({ page, browser }) => {
  const usuario = `e2e_${Date.now().toString(36)}`
  await page.goto('/criar-conta')
  await page.getByLabel('Nome de usuário').fill(usuario)
  await page.getByLabel('E-mail').fill(`${usuario}@teste.com`)
  await page.getByLabel(/^Senha/).fill('senha-de-teste')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByRole('button', { name: `Conta de ${usuario}` })).toBeVisible()

  await importar(page, '1 Edgar Markov *CMDR*\n1 Sol Ring')
  // A sincronização sobe em segundo plano: espera chegar no servidor
  await expect.poll(async () => (await (await page.request.get('/api/meus-decks')).json()).length).toBe(1)

  // Outro navegador, sem nada salvo: entra e o deck desce do servidor
  const outro = await browser.newContext()
  const pagina = await outro.newPage()
  await pagina.goto('/entrar')
  await pagina.getByLabel('Usuário ou e-mail').fill(usuario)
  await pagina.getByLabel(/^Senha/).fill('senha-de-teste')
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await expect(pagina.getByRole('button', { name: `Conta de ${usuario}` })).toBeVisible()  // login terminou
  await pagina.getByRole('banner').getByRole('link', { name: /Meus decks/ }).click()
  await expect(pagina.getByRole('link', { name: /Edgar Markov/ })).toBeVisible()

  // Sair: o menu da conta some e volta o botão de entrar
  await pagina.getByRole('button', { name: `Conta de ${usuario}` }).click()
  await pagina.getByRole('button', { name: 'Sair' }).click()
  await expect(pagina.getByRole('banner').getByRole('link', { name: 'Entrar' })).toBeVisible()
  await outro.close()
})
