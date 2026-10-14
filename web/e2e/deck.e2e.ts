import { expect, type Page, test } from '@playwright/test'
import { adicionar, busca, importar, nomeDoDeck, novoDeck, problemas } from './ajuda.ts'

// Item "Fora das cores do commander: <cartas>" da lista de problemas do deck
const foraDasCores = (page: Page) => page.getByRole('listitem').filter({ hasText: 'Fora das cores do commander' })

test('deck sem commander: sugere commanders pelas cartas e aponta o que ficou fora das cores', async ({ page }) => {
  await novoDeck(page)
  await expect(nomeDoDeck(page)).toHaveValue('Deck sem commander')

  // Sem commander, a busca acha carta de qualquer cor
  for (const nome of ['Llanowar Elves', 'Elvish Archdruid', 'Priest of Titania', 'Child of Alara']) await adicionar(page, nome)

  // Cada sugestão é um botão com o title "Definir <nome> como commander"
  await page.getByTitle('Definir Lathril, Blade of the Elves como commander').click()

  await expect(nomeDoDeck(page)).toHaveValue('Lathril')
  await expect(page.getByText('Commanders que combinam')).toHaveCount(0)
  await problemas(page).click()
  await expect(foraDasCores(page)).toHaveText('✕ Fora das cores do commander: Child of Alara')
})

test('parceiro achado depois: Frodo e Sam viram dupla', async ({ page, request }) => {
  const [frodo] = await (await request.get('http://localhost:8000/commanders', { params: { q: 'Frodo, Adventurous' } })).json()
  await page.goto(`/commander/${frodo.oracle_id}`)
  await page.getByRole('button', { name: 'Montar deck' }).click()
  await page.waitForURL(/\/deck\//)

  // Sam é verde, fora das cores do Frodo, mas a busca acha e marca como parceiro
  await busca(page).fill('Sam, Loyal')
  await expect(page.locator('li button', { hasText: 'Sam, Loyal Attendant' }).getByText('parceiro')).toBeVisible()
  await adicionar(page, 'Sam, Loyal Attendant', 'Sam, Loyal')
  await expect(page.getByText('clique nela pra jogar em dupla')).toBeVisible()

  await adicionar(page, 'Lightning Bolt')
  await expect(page.getByText('Lightning Bolt adicionada (fora das cores do commander)')).toBeVisible()

  await page.getByTitle('Sam, Loyal Attendant', { exact: true }).click()
  await page.getByRole('button', { name: /Jogar em dupla/ }).click()
  await page.keyboard.press('Escape')
  await expect(nomeDoDeck(page)).toHaveValue('Frodo + Sam')
  await problemas(page).click()
  await expect(foraDasCores(page)).toHaveText('✕ Fora das cores do commander: Lightning Bolt')
})

test('importa a lista com sideboard e maybeboard em abas separadas', async ({ page }) => {
  await importar(page, ['Commander', '1 Edgar Markov', 'Deck', '1 Sol Ring', '1 Blood Artist', '', 'Sideboard', '1 Lightning Bolt', '', 'Maybeboard', '1 Cordial Vampire'].join('\n'))
  await expect(nomeDoDeck(page)).toHaveValue('Edgar Markov')

  const aba = (nome: string) => page.getByRole('tab', { name: new RegExp(`^${nome}`) })
  await expect(aba('Deck')).toContainText('3')  // commander + 2
  await aba('Sideboard').click()
  await expect(page.getByTitle('Lightning Bolt', { exact: true })).toBeVisible()
  await aba('Maybeboard').click()
  await expect(page.getByTitle('Cordial Vampire', { exact: true })).toBeVisible()
  await expect(page.getByTitle('Sol Ring', { exact: true })).toHaveCount(0)
})

test('completar com básicos chega no número recomendado de terrenos', async ({ page }) => {
  await importar(page, '1 Edgar Markov *CMDR*\n1 Sol Ring\n1 Blood Artist\n2 Swamp')
  const barra = page.getByText('Terrenos básicos').locator('..')
  await expect(barra).toContainText('2')

  const completar = page.getByRole('button', { name: /^Completar com \d+$/ })
  const faltam = Number((await completar.textContent())!.match(/\d+/)![0])
  expect(faltam).toBe(35)  // poucas mágicas: meio da faixa 35-38 (37) menos os 2 Swamps
  await completar.click()

  await expect(completar).toHaveCount(0)
  await expect(page.getByText(/^\d+ terrenos/).first()).toContainText('37')
})
