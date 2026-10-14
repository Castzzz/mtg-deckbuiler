import { expect, test } from '@playwright/test'

test('filtra os commanders por identidade exata e carrega mais', async ({ page }) => {
  await page.goto('/')
  const cores = page.getByRole('group', { name: 'Filtrar por cores' })
  await cores.getByRole('button').nth(1).click()  // branco
  await cores.getByRole('button').nth(3).click()  // preto
  await expect(page.getByRole('heading', { name: 'Commanders Orzhov' })).toBeVisible()

  const cartas = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Commanders Orzhov' }) }).locator('a[href^="/commander/"]')
  await expect(cartas).toHaveCount(24)
  await page.getByRole('button', { name: 'Carregar mais' }).click()
  await expect(cartas).toHaveCount(48)

  // Incolor é sozinho: escolher ele tira as outras cores
  await cores.getByRole('button').nth(6).click()
  await expect(page.getByRole('heading', { name: 'Commanders Incolores' })).toBeVisible()
})

test('novo deck pelo atalho do banner', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+ Novo deck' }).click()
  await page.waitForURL(/\/deck\//)
  await expect(page.getByLabel('Nome do deck')).toHaveValue('Deck sem commander')
})
