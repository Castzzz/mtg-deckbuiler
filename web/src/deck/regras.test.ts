import { describe, expect, it } from 'vitest'
import type { Carta, Edicao } from '../api/tipos'
import type { Deck } from './armazenamento'
import { adicionar, comArte, exportarTexto, maxCopias, precoDeck, validar } from './regras'

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

describe('cópias', () => {
  const comTexto = (nome: string, texto: string, tipo = 'Creature') => ({ ...carta(nome, 1), texto, tipo })

  it('sabe quantas cópias cada carta permite', () => {
    expect(maxCopias(carta('Sol Ring', 1))).toBe(1)
    expect(maxCopias({ ...carta('Snow-Covered Island', 1), tipo: 'Basic Snow Land — Island' })).toBe(Infinity)
    expect(maxCopias(comTexto('Relentless Rats', 'A deck can have any number of cards named Relentless Rats.'))).toBe(Infinity)
    expect(maxCopias(comTexto('Seven Dwarves', 'A deck can have up to seven cards named Seven Dwarves.'))).toBe(7)
    expect(maxCopias(comTexto('Nazgûl', 'A deck can have up to nine cards named Nazgûl.'))).toBe(9)
  })

  it('não passa do máximo ao adicionar', () => {
    const anoes = comTexto('Seven Dwarves', 'A deck can have up to seven cards named Seven Dwarves.')
    let cartas = adicionar([], anoes, 'busca')
    for (let i = 0; i < 10; i++) cartas = adicionar(cartas, anoes)
    expect(cartas).toEqual([{ carta: anoes, qtd: 7, origem: 'busca' }])
    const comSolRing = adicionar([], carta('Sol Ring', 1))
    expect(adicionar(comSolRing, carta('Sol Ring', 1))).toBe(comSolRing)
  })
})

describe('validar', () => {
  it('aponta tamanho, cores, banidas e cópias a mais', () => {
    const textos = validar({
      ...deck,
      commanders: [{ ...carta('Edgar Markov', 10), identidade_cor: ['W', 'B', 'R'] }],
      cartas: [
        { carta: { ...carta('Rhystic Study', 50), identidade_cor: ['U'] }, qtd: 1 },
        { carta: { ...carta('Mana Crypt', 100), legal: false }, qtd: 1 },
        { carta: carta('Sol Ring', 1), qtd: 2 },
      ],
    }).map((p) => p.texto)
    expect(textos).toEqual([
      'Faltam 95 cartas pra chegar em 100',
      'Fora das cores do commander',
      'Banidas em Commander',
      'Cópias a mais do que a carta permite',
    ])
  })

  it('deck de 100 cartas certinho não tem problema', () => {
    const terreno = { ...carta('Swamp', 0.1), tipo: 'Basic Land — Swamp', categoria: 'terreno' as const }
    const ok = validar({ ...deck, artes: {}, cartas: [{ carta: terreno, qtd: 36 }, ...Array.from({ length: 63 }, (_, i) => ({ carta: carta(`Carta ${i}`, 1), qtd: 1 }))] })
    expect(ok).toEqual([])
  })
})
