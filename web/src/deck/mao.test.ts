import { describe, expect, it } from 'vitest'
import type { Carta } from '../api/tipos'
import { avaliarMao, cartasADevolver, chanceEntre, embaralhar } from './mao'

function carta(nome: string, categoria: Carta['categoria'] = 'artefato', cmc = 2): Carta {
  return {
    oracle_id: nome, nome, custo_mana: null, cmc, tipo: '', categoria, texto: null,
    identidade_cor: [], parceria: null, imagem_url: `padrao/${nome}`, scryfall_uri: null,
  }
}

describe('mão de teste', () => {
  it('embaralha sem perder nem duplicar cartas', () => {
    const lista = Array.from({ length: 99 }, (_, i) => i)
    const embaralhada = embaralhar(lista)
    expect([...embaralhada].sort((a, b) => a - b)).toEqual(lista)
    expect(lista[0]).toBe(0)  // não mexe na original
  })

  it('conta quantas cartas devolver em cada regra', () => {
    expect([0, 1, 2, 3].map((m) => cartasADevolver('commander', m))).toEqual([0, 0, 1, 2])
    expect([0, 1, 2, 3].map((m) => cartasADevolver('london', m))).toEqual([0, 1, 2, 3])
    expect(cartasADevolver('london', 9)).toBe(7)
  })

  it('calcula a hipergeométrica', () => {
    // 1 carta boa em 10, comprando 1: 10%
    expect(chanceEntre(10, 1, 1, 1)).toBeCloseTo(0.1)
    // somando todas as possibilidades dá 100%
    expect(chanceEntre(99, 37, 7, 0)).toBeCloseTo(1)
    // 37 terrenos em 99: abrir com 2 a 4 dá 74,8% (conferido com math.comb do Python)
    expect(chanceEntre(99, 37, 7, 2, 4)).toBeCloseTo(0.7484, 4)
  })

  it('avalia a mão', () => {
    const terreno = carta('Swamp', 'terreno', 0)
    expect(avaliarMao([terreno, ...Array(6).fill(carta('X', 'criatura', 5))]).boa).toBe(false)
    expect(avaliarMao([terreno, terreno, terreno, carta('A'), carta('B', 'feitico', 4), carta('C'), carta('D')])).toMatchObject({ terrenos: 3, baratas: 3, boa: true })
  })
})
