import { describe, expect, it } from 'vitest'
import { lerLista } from './lerLista'

describe('lerLista', () => {
  it('lê o formato simples, com ou sem quantidade', () => {
    expect(lerLista('1 Sol Ring\n2x Island\nArcane Signet').linhas).toEqual([
      { nome: 'Sol Ring', qtd: 1, commander: false },
      { nome: 'Island', qtd: 2, commander: false },
      { nome: 'Arcane Signet', qtd: 1, commander: false },
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
      { nome: 'Edgar Markov', qtd: 1, commander: true },
      { nome: 'Sol Ring', qtd: 1, commander: false },
    ])
    expect(lerLista('1 Edgar Markov *CMDR*').linhas[0].commander).toBe(true)
    expect(lerLista('1x Edgar Markov (c17) 36 [Commander{top}]').linhas[0].commander).toBe(true)
  })

  it('deixa de fora sideboard, maybeboard e categorias fora do deck', () => {
    const { linhas } = lerLista([
      '1 Sol Ring',
      '1x Cyclonic Rift (2xm) 44 [Maybeboard{noDeck}{noPrice},Removal]',
      'SIDEBOARD:',
      '1 Rhystic Study',
    ].join('\n'))
    expect(linhas.map((l) => l.nome)).toEqual(['Sol Ring'])
  })

  it('ignora cabeçalhos de categoria e comentários', () => {
    const { linhas } = lerLista('// Criaturas\nCreatures (2)\n1 Blood Artist\n# comentário')
    expect(linhas.map((l) => l.nome)).toEqual(['Blood Artist'])
  })

  it('junta a mesma carta repetida em linhas diferentes', () => {
    expect(lerLista('10 Swamp\n5 swamp').linhas).toEqual([{ nome: 'Swamp', qtd: 15, commander: false }])
  })
})
