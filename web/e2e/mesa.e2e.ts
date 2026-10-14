import { expect, test } from '@playwright/test'
import { importar } from './ajuda.ts'

test('na mesa de teste, Espaço passa pro próximo turno', async ({ page }) => {
  await importar(page, '1 Edgar Markov *CMDR*\n' + ['Sol Ring', 'Blood Artist', 'Cordial Vampire', 'Lightning Bolt', 'Arcane Signet'].map((n) => `1 ${n}`).join('\n') + '\n20 Swamp')
  await page.getByRole('link', { name: 'Testar mão' }).click()
  await page.getByRole('button', { name: 'Manter' }).click()

  const turno = page.getByText('Turno', { exact: true }).locator('..')  // "Turno" e o número ao lado
  await expect(turno).toContainText('1')
  await page.keyboard.press('Space')
  await expect(turno).toContainText('2')
  await page.keyboard.press('Space')
  await expect(turno).toContainText('3')
})
