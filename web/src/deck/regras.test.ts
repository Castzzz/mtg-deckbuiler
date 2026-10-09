import { describe, expect, it } from 'vitest'
import type { Carta, Edicao } from '../api/tipos'
import type { Deck } from './armazenamento'
import { comArte, exportarTexto, precoDeck } from './regras'

function carta(nome: string, preco_usd: number | null): Carta {
  return {
    oracle_id: nome, nome, custo_mana: null, cmc: 0, tipo: 'Artifact', categoria: 'artefato', texto: null,
    identidade_cor: [], parceria: null, imagem_url: `padrao/${nome}`, scryfall_uri: null, preco_usd,
  }
}

const SECRET_LAIR: Edicao = {
  scryfall_id: 'x', edicao: 'sld', nome_edicao: 'Secret Lair Drop', numero: '1011', lancamento: '2022-01-01',
  imagem_url: 'sld/sol-ring', preco_usd: 30, preco_eur: 25,
}

const deck: Deck = {
  id: '1', nome: 'Teste', criadoEm: '', atualizadoEm: '',
  commanders: [carta('Edgar Markov', 10)],
  cartas: [{ carta: carta('Sol Ring', 1), qtd: 1 }, { carta: carta('Swamp', 0.1), qtd: 10 }, { carta: carta('Carta Rara', null), qtd: 1 }],
  artes: { 'Sol Ring': SECRET_LAIR },
}

describe('regras do deck', () => {
  it('usa a imagem e o preço da edição escolhida', () => {
    expect(comArte(deck, deck.cartas[0].carta)).toMatchObject({ imagem_url: 'sld/sol-ring', preco_usd: 30 })
    expect(comArte(deck, deck.cartas[1].carta).imagem_url).toBe('padrao/Swamp')
  })

  it('soma o preço do deck com as quantidades e a arte escolhida', () => {
    const { total, semPreco } = precoDeck(deck)
    expect(total).toBeCloseTo(10 + 30 + 10 * 0.1)
    expect(semPreco).toBe(1)
  })

  it('exporta a edição só das cartas com arte escolhida', () => {
    expect(exportarTexto(deck).split('\n')).toEqual(['1 Edgar Markov', '1 Carta Rara', '1 Sol Ring (SLD) 1011', '10 Swamp'])
  })
})
