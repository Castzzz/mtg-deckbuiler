import { describe, expect, it } from 'vitest'
import { paletaDoDeck } from './tema'

describe('cores do deck', () => {
  it('num deck multicolor o destaque não é o branco', () => {
    const edgar = paletaDoDeck(['R', 'W', 'B'])
    expect(edgar['--color-destaque']).toBe('#a77bd8')  // preto vira roxo
    expect(edgar['--brilho-b']).toBe('#e4dfcf')  // segunda cor na ordem WUBRG: branco
    expect(edgar['--faixa']).toBe('linear-gradient(90deg, #e4dfcf, #a77bd8, #e5654d)')
  })

  it('mono branco usa o branco; sem cor usa o incolor', () => {
    expect(paletaDoDeck(['W'])['--color-destaque']).toBe('#e4dfcf')
    expect(paletaDoDeck([])['--color-destaque']).toBe('#9fb1c3')
  })
})
