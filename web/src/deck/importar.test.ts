import { describe, expect, it } from 'vitest'
import type { CartaImportada } from '../api/tipos'
import { analisar, sugerirCommanders } from './importar'
import { lerLista } from './lerLista'

function carta(nome: string, extra: Partial<CartaImportada> = {}): CartaImportada {
  return {
    oracle_id: nome, nome, custo_mana: null, cmc: 0, tipo: 'Artifact', categoria: 'artefato', texto: null,
    identidade_cor: [], parceria: null, imagem_url: null, scryfall_uri: null, legal: true, pode_ser_commander: false,
    ...extra,
  }
}

const EDGAR = carta('Edgar Markov', { identidade_cor: ['W', 'B', 'R'], pode_ser_commander: true, tipo: 'Legendary Creature' })
const ACHADAS: Record<string, CartaImportada> = {
  'Edgar Markov': EDGAR,
  'Sol Ring': carta('Sol Ring'),
  'Swamp': carta('Swamp', { tipo: 'Basic Land — Swamp', categoria: 'terreno' }),
  'Mana Crypt': carta('Mana Crypt', { legal: false }),
  'Rhystic Study': carta('Rhystic Study', { identidade_cor: ['U'] }),
  'Blood Artist': carta('Blood Artist', { identidade_cor: ['B'] }),
}

describe('importar', () => {
  const lida = lerLista('1 Edgar Markov *CMDR*\n1 Sol Ring\n12 Swamp\n1 Mana Crypt\n1 Rhystic Study\n2 Blood Artist\n1 Carta Inventada')

  it('sugere o commander marcado na lista', () => {
    expect(sugerirCommanders(lida, ACHADAS)).toEqual(['Edgar Markov'])
  })

  it('separa o que entra no deck do que precisa de aviso', () => {
    const a = analisar(lida, ACHADAS, ['Edgar Markov'])
    expect(a.cartas.map((c) => `${c.qtd} ${c.carta.nome}`)).toEqual(['1 Sol Ring', '12 Swamp', '1 Blood Artist'])
    expect(a.naoEncontradas).toEqual(['Carta Inventada'])
    expect(a.banidas).toEqual(['Mana Crypt'])
    expect(a.foraDasCores).toEqual(['Rhystic Study'])
    expect(a.copiasAMais).toEqual(['Blood Artist (2x)'])
    expect(a.candidatos.map((c) => c.nome)).toEqual(['Edgar Markov'])
  })

  it('sideboard e maybeboard entram como vieram, sem filtrar', () => {
    const a = analisar(lerLista('1 Edgar Markov *CMDR*\n1 Sol Ring\nSideboard\n1 Rhystic Study\n1 Sol Ring\nMaybeboard\n1 Mana Crypt\n3 Blood Artist\n1 Carta Inventada'), ACHADAS, ['Edgar Markov'])
    expect(a.cartas.map((c) => c.carta.nome)).toEqual(['Sol Ring'])
    expect(a.sideboard.map((c) => c.carta.nome)).toEqual(['Rhystic Study', 'Sol Ring'])
    expect(a.maybeboard.map((c) => `${c.qtd} ${c.carta.nome}`)).toEqual(['1 Mana Crypt', '1 Blood Artist'])
    expect(a.naoEncontradas).toEqual(['Carta Inventada'])
    expect(a.banidas).toEqual([])
  })

  it('sem commander escolhido, não filtra por cor', () => {
    const a = analisar(lida, ACHADAS, [])
    expect(a.foraDasCores).toEqual([])
    expect(a.cartas.some((c) => c.carta.nome === 'Edgar Markov')).toBe(true)
  })

  it('sugere a dupla só se as duas fazem dupla', () => {
    const thrasios = carta('Thrasios', { pode_ser_commander: true, parceria: 'partner' })
    const tymna = carta('Tymna', { pode_ser_commander: true, parceria: 'partner' })
    const dupla = lerLista('Commander\n1 Thrasios\n1 Tymna\n1 Edgar Markov')
    expect(sugerirCommanders(dupla, { ...ACHADAS, Thrasios: thrasios, Tymna: tymna })).toEqual(['Thrasios', 'Tymna'])
    const errada = lerLista('Commander\n1 Edgar Markov\n1 Tymna')
    expect(sugerirCommanders(errada, { ...ACHADAS, Tymna: tymna })).toEqual(['Edgar Markov'])
  })
})
