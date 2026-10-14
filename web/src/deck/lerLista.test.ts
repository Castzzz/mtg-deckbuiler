import { describe, expect, it } from 'vitest'
import { lerLista } from './lerLista'

describe('lerLista', () => {
  it('lê o formato simples, com ou sem quantidade', () => {
    expect(lerLista('1 Sol Ring\n2x Island\nArcane Signet').linhas).toEqual([
      { nome: 'Sol Ring', qtd: 1, commander: false, secao: 'cartas' },
      { nome: 'Island', qtd: 2, commander: false, secao: 'cartas' },
      { nome: 'Arcane Signet', qtd: 1, commander: false, secao: 'cartas' },
    ])
  })

  it('tira edição, número, foil e tags do Moxfield', () => {
    const { linhas } = lerLista('1 Sol Ring (C21) 263 *F*\n1 Blood Artist (2X2) 64 ^Sacrifício^\n1 Swords to Plowshares (STA) 10★ #remoção')
    expect(linhas.map((l) => l.nome)).toEqual(['Sol Ring', 'Blood Artist', 'Swords to Plowshares'])
  })

  it('não confunde parêntese no meio do nome com edição', () => {
    expect(lerLista('1 Borrowing 100,000 Arrows').linhas[0].nome).toBe('Borrowing 100,000 Arrows')
    expect(lerLista('1 Fire // Ice (MH2) 290').linhas[0].nome).toBe('Fire // Ice')
  })

  it('reconhece o commander pela seção, pelo *CMDR* e pela categoria do Archidekt', () => {
    const arena = lerLista('Commander\n1 Edgar Markov (C17) 36\n\nDeck\n1 Sol Ring')
    expect(arena.linhas).toEqual([
      { nome: 'Edgar Markov', qtd: 1, commander: true, secao: 'cartas' },
      { nome: 'Sol Ring', qtd: 1, commander: false, secao: 'cartas' },
    ])
    expect(lerLista('1 Edgar Markov *CMDR*').linhas[0].commander).toBe(true)
    expect(lerLista('1x Edgar Markov (c17) 36 [Commander{top}]').linhas[0].commander).toBe(true)
  })

  it('separa sideboard e maybeboard, e deixa os tokens de fora', () => {
    const { linhas } = lerLista([
      '1 Sol Ring',
      '1x Cyclonic Rift (2xm) 44 [Maybeboard{noDeck}{noPrice},Removal]',
      '1x Pyroblast [Sideboard]',
      '1x Rhystic Study [Considerando{noDeck}]',
      'SIDEBOARD:',
      '1 Rhystic Study',
      '// Maybeboard',
      '1 Smothering Tithe',
      '1 Sol Ring',
      'Tokens',
      '1 Treasure',
    ].join('\n'))
    expect(linhas.map((l) => `${l.secao} ${l.nome}`)).toEqual([
      'cartas Sol Ring', 'maybeboard Cyclonic Rift', 'sideboard Pyroblast', 'maybeboard Rhystic Study',
      'sideboard Rhystic Study', 'maybeboard Smothering Tithe', 'maybeboard Sol Ring',
    ])
    // commander só no deck
    expect(lerLista('Sideboard\n1 Edgar Markov *CMDR*').linhas[0]).toMatchObject({ commander: false, secao: 'sideboard' })
  })

  it('ignora cabeçalhos de categoria e comentários', () => {
    const { linhas } = lerLista('// Criaturas\nCreatures (2)\n1 Blood Artist\n# comentário')
    expect(linhas.map((l) => l.nome)).toEqual(['Blood Artist'])
  })

  it('junta a mesma carta repetida em linhas diferentes', () => {
    expect(lerLista('10 Swamp\n5 swamp').linhas).toEqual([{ nome: 'Swamp', qtd: 15, commander: false, secao: 'cartas' }])
  })
})
