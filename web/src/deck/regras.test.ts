import { describe, expect, it } from 'vitest'
import type { Carta, Edicao } from '../api/tipos'
import type { Deck } from './armazenamento'
import {
  adicionar, basicosQueFaltam, comArte, distribuirBasicos, simbolosPorCor, ehRampOuCompraBarata, exportarTexto, maxCopias, moverCarta, totalCartas, opcoesCommander, precoDeck, recomendarTerrenos,
  tirarDoCommander, tornarCommander, validar,
} from './regras'

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
  cartas: [{ carta: carta('Sol Ring', 1), qtd: 1 }, { carta: { ...carta('Swamp', 0.1), tipo: 'Basic Land — Swamp' }, qtd: 10 }, { carta: carta('Carta Rara', null), qtd: 1 }],
  artes: { 'Sol Ring': SECRET_LAIR },
}

describe('regras do deck', () => {
  it('usa a imagem e o preço da edição escolhida', () => {
    expect(comArte(deck, deck.cartas[0].carta)).toMatchObject({ imagem_url: 'sld/sol-ring', preco_usd: 30 })
    expect(comArte(deck, deck.cartas[1].carta).imagem_url).toBe('padrao/Swamp')
  })

  it('soma o preço do deck com as quantidades e a arte escolhida', () => {
    // os 10 Swamps não entram na conta
    expect(precoDeck(deck)).toEqual({ total: 40, semPreco: 1, basicos: 10 })
  })

  it('exporta a edição só das cartas com arte escolhida', () => {
    expect(exportarTexto(deck).split('\n')).toEqual(['1 Edgar Markov', '1 Carta Rara', '1 Sol Ring (SLD) 1011', '10 Swamp'])
  })
})

describe('sideboard e maybeboard', () => {
  const comFora: Deck = {
    ...deck,
    sideboard: [{ carta: carta('Pyroblast', 1), qtd: 1 }],
    maybeboard: [{ carta: carta('Sol Ring', 1), qtd: 1 }, { carta: { ...carta('Swamp', 0.1), tipo: 'Basic Land — Swamp' }, qtd: 3 }],
  }

  it('não contam no deck nem no preço', () => {
    expect(totalCartas(comFora)).toBe(totalCartas(deck))
    expect(precoDeck(comFora)).toEqual(precoDeck(deck))
  })

  it('vão no fim da lista exportada, com o cabeçalho', () => {
    expect(exportarTexto(comFora).split('\n').slice(4)).toEqual(['', 'Sideboard', '1 Pyroblast', '', 'Maybeboard', '1 Sol Ring (SLD) 1011', '3 Swamp'])
  })

  it('move a carta de uma seção pra outra, somando até o máximo de cópias', () => {
    const { mudanca } = moverCarta(comFora, 'Pyroblast', 'sideboard', 'cartas')
    expect(mudanca.sideboard).toEqual([])
    expect(mudanca.cartas!.at(-1)).toMatchObject({ carta: { nome: 'Pyroblast' }, qtd: 1 })
    // básicos somam
    expect(moverCarta(comFora, 'Swamp', 'maybeboard', 'cartas').mudanca.cartas!.find((c) => c.carta.nome === 'Swamp')!.qtd).toBe(13)
    // Sol Ring já está no deck: não cabe outra, fica no maybeboard
    expect(moverCarta(comFora, 'Sol Ring', 'maybeboard', 'cartas')).toEqual({ mudanca: {}, sobraram: 1 })
    // e pro maybeboard (que estava vazio de Pyroblast) vai normal
    expect(moverCarta(comFora, 'Pyroblast', 'sideboard', 'maybeboard').mudanca.maybeboard).toHaveLength(3)
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
      'Fora das cores do commander',
      'Faltam 95 cartas pra chegar em 100',
      'Banidas em Commander',
      'Cópias a mais do que a carta permite',
    ])
  })

  it('deck montado sem commander: ao definir, aponta o que ficou fora das cores dele', () => {
    const cincoCores = { ...carta('Child of Alara', 5), identidade_cor: ['W', 'U', 'B', 'R', 'G'] }
    const edgar = { ...carta('Edgar Markov', 10), tipo: 'Legendary Creature — Vampire Knight', pode_ser_commander: true, legal: true, identidade_cor: ['W', 'B', 'R'] }
    const semCommander: Deck = { ...deck, commanders: [], cartas: [{ carta: cincoCores, qtd: 1 }, { carta: edgar, qtd: 1 }] }
    expect(validar(semCommander).find((p) => p.texto === 'Fora das cores do commander')).toBeUndefined()

    const comEdgar = { ...semCommander, ...tornarCommander(semCommander, edgar, 'definir') }
    expect(comEdgar.cartas.map((c) => c.carta.nome)).toEqual(['Child of Alara'])
    expect(validar(comEdgar).find((p) => p.texto === 'Fora das cores do commander')?.cartas).toEqual(['Child of Alara'])
  })

  it('deck de 100 cartas certinho não tem problema', () => {
    const terreno = { ...carta('Swamp', 0.1), tipo: 'Basic Land — Swamp', categoria: 'terreno' as const }
    const ok = validar({ ...deck, artes: {}, cartas: [{ carta: terreno, qtd: 36 }, ...Array.from({ length: 63 }, (_, i) => ({ carta: { ...carta(`Carta ${i}`, 1), cmc: 2 }, qtd: 1 }))] })
    expect(ok).toEqual([])
  })
})

describe('terrenos recomendados', () => {
  const magica = (nome: string, categoria: Carta['categoria'], cmc: number, texto: string | null = null): Carta => ({ ...carta(nome, 1), categoria, cmc, texto })

  it('reconhece ramp e compra baratas pelo texto', () => {
    expect(ehRampOuCompraBarata(magica('Sol Ring', 'artefato', 1, '{T}: Add {C}{C}.'))).toBe(true)
    expect(ehRampOuCompraBarata(magica('Arcane Signet', 'artefato', 2, "{T}: Add one mana of any color in your commander's color identity."))).toBe(true)
    expect(ehRampOuCompraBarata(magica('Llanowar Elves', 'criatura', 1, '{T}: Add {G}.'))).toBe(true)
    expect(ehRampOuCompraBarata(magica('Rampant Growth', 'feitico', 2, 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'))).toBe(true)
    expect(ehRampOuCompraBarata(magica('Ponder', 'feitico', 1, 'Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card.'))).toBe(true)
    // ritual não é ramp de verdade, e Cultivate custa 3
    expect(ehRampOuCompraBarata(magica('Dark Ritual', 'instantanea', 1, 'Add {B}{B}{B}.'))).toBe(false)
    expect(ehRampOuCompraBarata(magica('Cultivate', 'feitico', 3, 'Search your library for up to two basic land cards'))).toBe(false)
    expect(ehRampOuCompraBarata(magica('Lightning Bolt', 'instantanea', 1, 'Lightning Bolt deals 3 damage to any target.'))).toBe(false)
  })

  it('usa a fórmula do Karsten', () => {
    // custo médio 3, 10 ramp baratas: 31,42 + 9,39 − 2,8 = 38
    const cartas = [
      ...Array.from({ length: 10 }, (_, i) => ({ carta: magica(`Rock ${i}`, 'artefato', 2, '{T}: Add {C}.'), qtd: 1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ carta: magica(`Bomba ${i}`, 'criatura', 4), qtd: 1 })),
      { carta: magica('Swamp', 'terreno', 0), qtd: 30 },
    ]
    expect(recomendarTerrenos(cartas)).toMatchObject({ quantidade: 38, media: 3 })
    expect(recomendarTerrenos(cartas)!.baratas).toHaveLength(10)
    // poucas mágicas ainda: não dá pra recomendar
    expect(recomendarTerrenos(cartas.slice(0, 5))).toBeNull()
  })

  it('avisa quando os terrenos estão longe do recomendado', () => {
    const cartas = [
      { carta: magica('Swamp', 'terreno', 0), qtd: 30 },
      ...Array.from({ length: 69 }, (_, i) => ({ carta: magica(`Bomba ${i}`, 'criatura', 4), qtd: 1 })),
    ]
    expect(validar({ ...deck, artes: {}, cartas }).map((p) => p.texto)).toContain('30 terrenos: pela curva de mana, o recomendado é ~42')
  })
})

describe('commander', () => {
  const lendaria = (nome: string, extra = {}) => ({ ...carta(nome, 1), pode_ser_commander: true, tipo: 'Legendary Creature', ...extra })
  const thrasios = lendaria('Thrasios', { parceria: 'partner', identidade_cor: ['G', 'U'] })
  const tymna = lendaria('Tymna', { parceria: 'partner', identidade_cor: ['W', 'B'] })
  const semCommander: Deck = { ...deck, nome: 'Deck sem commander', commanders: [], artes: {}, cartas: [{ carta: thrasios, qtd: 1 }, { carta: tymna, qtd: 1 }, { carta: carta('Sol Ring', 1), qtd: 1 }] }

  it('deck sem commander pede pra definir, e só oferece isso pra quem pode ser commander', () => {
    expect(validar(semCommander)[0].texto).toMatch(/^Defina o commander/)
    expect(opcoesCommander(semCommander, thrasios).map((o) => o.acao)).toEqual(['definir'])
    expect(opcoesCommander(semCommander, carta('Sol Ring', 1))).toEqual([])
  })

  it('definir tira a carta do deck principal; a dupla entra junto', () => {
    const passo1 = { ...semCommander, ...tornarCommander(semCommander, thrasios, 'definir') }
    expect(passo1.commanders.map((c) => c.nome)).toEqual(['Thrasios'])
    expect(passo1.nome).toBe('Thrasios')
    expect(passo1.cartas.map((c) => c.carta.nome)).toEqual(['Tymna', 'Sol Ring'])
    expect(opcoesCommander(passo1, tymna).map((o) => o.acao)).toEqual(['dupla', 'trocar'])

    const passo2 = { ...passo1, ...tornarCommander(passo1, tymna, 'dupla') }
    expect(passo2.commanders.map((c) => c.nome)).toEqual(['Thrasios', 'Tymna'])
    expect(passo2.nome).toBe('Thrasios + Tymna')
    expect(tornarCommander({ ...passo1, nome: 'Meu deck de partners' }, tymna, 'dupla').nome).toBe('Meu deck de partners')
    expect(passo2.cartas.map((c) => c.carta.nome)).toEqual(['Sol Ring'])
    expect(validar(passo2).map((p) => p.texto)).toEqual(['Faltam 97 cartas pra chegar em 100'])
  })

  it('trocar devolve o commander antigo pro deck; tirar do commander também', () => {
    const comThrasios = { ...semCommander, ...tornarCommander(semCommander, thrasios, 'definir') }
    const trocado = tornarCommander(comThrasios, tymna, 'trocar')
    expect(trocado.commanders.map((c) => c.nome)).toEqual(['Tymna'])
    expect(trocado.cartas.map((c) => c.carta.nome)).toEqual(['Sol Ring', 'Thrasios'])
    const sem = tirarDoCommander({ ...comThrasios, ...trocado }, tymna)
    expect(sem.commanders).toEqual([])
    expect(sem.cartas.map((c) => c.carta.nome)).toEqual(['Sol Ring', 'Thrasios', 'Tymna'])
  })

  it('reclama de dupla que não combina', () => {
    const edgar = lendaria('Edgar Markov')
    expect(validar({ ...deck, commanders: [edgar, tymna] }).map((p) => p.texto)).toContain('Edgar Markov e Tymna não podem jogar em dupla')
  })
})

describe('terrenos básicos', () => {
  const magica = (nome: string, custo_mana: string, qtd = 1) => ({ carta: { ...carta(nome, 1), custo_mana, categoria: 'criatura' as const }, qtd })

  it('conta os símbolos de mana por cor (híbrido pras duas, terreno não conta)', () => {
    expect(simbolosPorCor([
      magica('A', '{2}{W}{W}'), magica('B', '{W/U}{B/P}', 2),
      { carta: { ...carta('Terreno', 1), custo_mana: '{G}', categoria: 'terreno' as const }, qtd: 1 },
    ])).toEqual({ W: 4, U: 2, B: 2, R: 0, G: 0 })
  })

  it('divide pelos símbolos, com as sobras pras maiores frações', () => {
    expect(distribuirBasicos(10, ['W', 'B'], { W: 6, B: 3 })).toEqual({ W: 7, B: 3 })
    expect(distribuirBasicos(9, ['W', 'U', 'B'], {})).toEqual({ W: 3, U: 3, B: 3 })
    expect(distribuirBasicos(5, ['W', 'B'], { W: 4, B: 0 })).toEqual({ W: 5 })
    expect(distribuirBasicos(7, [], {})).toEqual({ C: 7 })
  })

  it('completa até o recomendado sem passar de 100 cartas', () => {
    const vazio: Deck = { ...deck, cartas: [] }
    expect(basicosQueFaltam(vazio)).toBe(37)  // sem mágicas: meio da faixa 35-38
    const quase: Deck = { ...deck, cartas: Array.from({ length: 97 }, (_, i) => magica(`C${i}`, '{1}')) }
    expect(basicosQueFaltam(quase)).toBe(2)  // 1 commander + 97: só cabem 2
  })
})
