import { describe, expect, it } from 'vitest'
import { paletaDoDeck } from './tema'

describe('cores do deck', () => {
  it('num deck multicolor o destaque não é o branco', () => {
    const edgar = paletaDoDeck(['R', 'W', 'B'])
    expect(edgar['--color-destaque']).toBe('#e5654d')  // nem branco nem preto: vermelho
    expect(edgar['--brilho-b']).toBe('#e4dfcf')  // segunda cor na ordem WUBRG: branco
    expect(edgar['--faixa']).toBe('linear-gradient(90deg, #e4dfcf, #8f8681, #e5654d)')  // preto vira cinza
  })

  it('mono branco usa o branco; sem cor usa o incolor', () => {
    expect(paletaDoDeck(['W'])['--color-destaque']).toBe('#e4dfcf')
    expect(paletaDoDeck([])['--color-destaque']).toBe('#9fb1c3')
    expect(paletaDoDeck(['W', 'B'])['--color-destaque']).toBe('#8f8681')  // Orzhov: só sobra o preto
  })
})
