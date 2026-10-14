import { expect, type Page } from '@playwright/test'

// Cada teste roda num navegador limpo (localStorage vazio), então cria os próprios decks

export async function importar(page: Page, lista: string) {
  await page.goto('/importar')
  await page.locator('textarea').fill(lista)
  await page.getByRole('button', { name: 'Ler lista' }).click()
  await page.getByRole('button', { name: /^Criar deck/ }).click()
  await page.waitForURL(/\/deck\//)
}

export async function novoDeck(page: Page) {
  await page.goto('/decks')
  await page.getByRole('banner').getByRole('button', { name: 'Novo deck' }).click()
  await page.waitForURL(/\/deck\//)
}

export const busca = (page: Page) => page.getByPlaceholder('Adicionar carta pelo nome... (Enter adiciona)')

// Busca e clica no resultado com esse nome (a lista escolhe no mousedown, pra não perder o foco do campo)
export async function adicionar(page: Page, nome: string, termo = nome) {
  await busca(page).fill(termo)
  const resultado = page.locator('li button', { has: page.getByText(nome, { exact: true }) }).first()
  await resultado.dispatchEvent('mousedown')
  await expect(page.getByText(new RegExp(`^${escapar(nome)}( adicionada|:)`))).toBeVisible()
}

export const nomeDoDeck = (page: Page) => page.getByLabel('Nome do deck')
export const problemas = (page: Page) => page.getByRole('button', { name: /\d+ problemas?/ })

export const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
