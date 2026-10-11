import { describe, expect, it } from 'vitest'
import type { Carta } from '../api/tipos'
import type { Deck } from './armazenamento'
import {
  comprar, copiar, criarToken, danoDeCommander, desvirarTudo, devolver, imposto, lugarLivre, manter, mover, mulligan, novaMesa, onde,
  proximoTurno, terrenosDesvirados, virar,
} from './mesa'
import { mesaPublica } from './partida'

function carta(nome: string, categoria: Carta['categoria'] = 'criatura'): Carta {
  return {
    oracle_id: nome, nome, custo_mana: null, cmc: 2, tipo: '', categoria, texto: null,
    identidade_cor: [], parceria: null, imagem_url: `padrao/${nome}`, scryfall_uri: null,
  }
}

const deck: Deck = {
  id: '1', nome: 'Teste', criadoEm: '', atualizadoEm: '',
  commanders: [carta('Edgar Markov')],
  cartas: [{ carta: carta('Swamp', 'terreno'), qtd: 40 }, ...Array.from({ length: 59 }, (_, i) => ({ carta: carta(`Carta ${i}`), qtd: 1 }))],
}

// Sem embaralhar de verdade: o grimório fica na ordem do deck (o Fisher-Yates com 0,999.. não troca nada)
const fixo = () => 0.9999999

const total = (m: ReturnType<typeof novaMesa>) => Object.values(m.zonas).reduce((s, z) => s + z.length, 0)

describe('mesa de teste', () => {
  it('começa com 7 na mão, o commander na zona de comando e o resto no grimório', () => {
    const mesa = novaMesa(deck, fixo)
    expect(mesa.zonas.mao).toHaveLength(7)
    expect(mesa.zonas.comando.map((c) => c.carta.nome)).toEqual(['Edgar Markov'])
    expect(mesa.zonas.biblioteca).toHaveLength(92)
    expect(new Set(Object.values(mesa.zonas).flat().map((c) => c.id)).size).toBe(100)
    expect(mesa.fase).toBe('mulligan')
  })

  it('mulligan na regra London: manter pede pra devolver, e o jogo começa comprando', () => {
    let mesa = mulligan(mulligan(novaMesa(deck, fixo), deck, fixo), deck, fixo)
    expect(mesa.mulligans).toBe(2)
    mesa = manter(mesa, 'london')
    expect(mesa.fase).toBe('devolvendo')
    const [a, b] = mesa.zonas.mao.map((c) => c.id)
    mesa = devolver(mesa, [a, b])
    expect(mesa.fase).toBe('jogo')
    expect(mesa.turno).toBe(1)
    expect(mesa.zonas.mao).toHaveLength(6)  // 7 − 2 + a compra do turno 1
    expect(mesa.zonas.biblioteca.slice(-2).map((c) => c.id)).toEqual([a, b])
    expect(total(mesa)).toBe(100)
  })

  it('primeiro mulligan grátis: mantém sem devolver nada', () => {
    const mesa = manter(mulligan(novaMesa(deck, fixo), deck, fixo), 'commander')
    expect(mesa.fase).toBe('jogo')
    expect(mesa.zonas.mao).toHaveLength(8)
  })

  it('joga, vira e desvira no próximo turno', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const terreno = mesa.zonas.mao.find((c) => c.carta.categoria === 'terreno')!
    mesa = virar(mover(mesa, terreno.id, 'campo'), terreno.id)
    expect(onde(mesa, terreno.id)).toBe('campo')
    expect(terrenosDesvirados(mesa)).toBe(0)
    mesa = proximoTurno(mesa)
    expect(mesa.turno).toBe(2)
    expect(terrenosDesvirados(mesa)).toBe(1)
    expect(mesa.log.at(-1)).toMatch(/^Turno 2: comprou/)
  })

  it('cobra o imposto do commander a cada vez que ele sai da zona de comando', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const edgar = mesa.zonas.comando[0].id
    expect(imposto(mesa, edgar)).toBe(0)
    mesa = mover(mover(mesa, edgar, 'campo'), edgar, 'comando')
    expect(imposto(mesa, edgar)).toBe(2)
    mesa = mover(mesa, edgar, 'campo')
    expect(mesa.log.at(-1)).toBe('Lançou Edgar Markov (imposto +2)')
    expect(imposto(mesa, edgar)).toBe(4)
  })

  it('só commander vai pra zona de comando; grimório aceita topo e fundo', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const id = mesa.zonas.mao[0].id
    expect(mover(mesa, id, 'comando')).toBe(mesa)
    mesa = mover(mesa, id, 'biblioteca', 'topo')
    expect(mesa.zonas.biblioteca[0].id).toBe(id)
    mesa = mover(mesa, id, 'biblioteca', 'fundo')
    expect(mesa.zonas.biblioteca.at(-1)!.id).toBe(id)
    expect(total(mesa)).toBe(100)
  })

  it('não quebra com o grimório vazio', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    mesa = comprar(mesa, 200)
    expect(mesa.zonas.biblioteca).toHaveLength(0)
    expect(comprar(mesa).log.at(-1)).toBe('Grimório vazio: não deu pra comprar')
  })
})

describe('posição no campo', () => {
  const campo = { largura: 1000, altura: 600 }
  const tamanho = { largura: 96, altura: 134 }

  it('guarda onde a carta foi solta, e mexer dentro do campo traz ela pra frente', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const [a, b] = mesa.zonas.mao.map((c) => c.id)
    mesa = mover(mover(mesa, a, 'campo', 'topo', { x: 10, y: 20 }), b, 'campo', 'topo', { x: 300, y: 40 })
    mesa = virar(mesa, a)
    mesa = mover(mesa, a, 'campo', 'topo', { x: 500, y: 200 })
    expect(mesa.zonas.campo.map((c) => [c.id, c.pos, c.virada])).toEqual([[b, { x: 300, y: 40 }, false], [a, { x: 500, y: 200 }, true]])
    // saiu do campo: esquece a posição
    expect(mover(mesa, a, 'mao').zonas.mao.at(-1)!.pos).toBeUndefined()
  })

  it('acha lugar livre: terrenos embaixo, o resto em cima, sem encavalar', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const [a, b] = mesa.zonas.mao.map((c) => c.id)
    expect(lugarLivre(mesa, false, campo, tamanho)).toEqual({ x: 12, y: 12 })
    const terreno = lugarLivre(mesa, true, campo, tamanho)
    expect(terreno).toEqual({ x: 12, y: 600 - 134 - 12 })
    mesa = mover(mesa, a, 'campo', 'topo', terreno)
    expect(lugarLivre(mesa, true, campo, tamanho)).toEqual({ x: 12 + 142, y: terreno.y })
    mesa = mover(mesa, b, 'campo', 'topo', { x: 12, y: 12 })
    expect(lugarLivre(mesa, false, campo, tamanho)).toEqual({ x: 154, y: 12 })
  })

  it('desvira tudo', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const [a, b] = mesa.zonas.mao.map((c) => c.id)
    mesa = virar(virar(mover(mover(mesa, a, 'campo'), b, 'campo'), a), b)
    const desvirada = desvirarTudo(mesa)
    expect(desvirada.zonas.campo.every((c) => !c.virada)).toBe(true)
    // nada virado: devolve a mesma mesa (não vira um passo no desfazer)
    expect(desvirarTudo(desvirada)).toBe(desvirada)
  })
})

describe('tokens', () => {
  const vampiro = carta('Vampire')

  it('cria tokens no campo com ids novos, e eles somem ao sair do campo', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    mesa = criarToken(mesa, vampiro, [{ x: 10, y: 10 }, { x: 120, y: 10 }])
    const tokens = mesa.zonas.campo.filter((c) => c.token)
    expect(tokens.map((c) => c.id)).toEqual([100, 101])  // as 100 cartas do deck usam 0..99
    expect(mesa.log.at(-1)).toBe('Criou 2 tokens: Vampire')
    mesa = mover(mesa, 100, 'cemiterio')
    expect(mesa.zonas.cemiterio).toHaveLength(0)
    expect(onde(mesa, 100)).toBeUndefined()
    expect(mesa.log.at(-1)).toBe('Vampire (token) deixou de existir')
    // mexer dentro do campo continua funcionando
    expect(mover(mesa, 101, 'campo', 'topo', { x: 5, y: 5 }).zonas.campo.at(-1)!.pos).toEqual({ x: 5, y: 5 })
    expect(total(mesa)).toBe(101)
  })

  it('copia uma carta do campo como token', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const id = mesa.zonas.mao[0].id
    mesa = copiar(mover(mesa, id, 'campo', 'topo', { x: 0, y: 0 }), id, { x: 150, y: 0 })
    const copia = mesa.zonas.campo.at(-1)!
    expect(copia).toMatchObject({ token: true, pos: { x: 150, y: 0 } })
    expect(copia.carta.nome).toBe(mesa.zonas.campo[0].carta.nome)
    expect(copia.id).not.toBe(id)
  })
})

describe('partida com os amigos', () => {
  it('ao manter a mão não compra: espera a vez (e o mulligan continua sendo de partida)', () => {
    let mesa = mulligan(novaMesa(deck, fixo, true), deck, fixo)
    expect(mesa.multiplayer).toBe(true)
    mesa = manter(mesa, 'commander')
    expect(mesa.fase).toBe('jogo')
    expect(mesa.turno).toBe(0)
    expect(mesa.zonas.mao).toHaveLength(7)
    mesa = proximoTurno(mesa)
    expect(mesa.turno).toBe(1)
    expect(mesa.zonas.mao).toHaveLength(8)
  })

  it('o histórico público não conta quais cartas foram compradas', () => {
    const mesa = comprar(manter(novaMesa(deck, fixo, true), 'commander'), 2)
    expect(mesa.log.at(-1)).toMatch(/comprou Swamp, Swamp$/)
    expect(mesa.logPublico).toEqual(['Manteve a mão', 'Comprou 2 cartas'])
  })

  it('dano de commander tira vida junto e não fica negativo', () => {
    let mesa = danoDeCommander(novaMesa(deck, fixo, true), 'bia:0', 'Atraxa', 5)
    expect(mesa.vida).toBe(35)
    expect(mesa.danoCommander).toEqual({ 'bia:0': 5 })
    mesa = danoDeCommander(mesa, 'bia:0', 'Atraxa', -8)
    expect(mesa.vida).toBe(40)
    expect(mesa.danoCommander).toEqual({ 'bia:0': 0 })
    expect(danoDeCommander(mesa, 'bia:0', 'Atraxa', -1)).toBe(mesa)
  })

  it('a mesa pública só tem quantas cartas há na mão e no grimório', () => {
    const mesa = manter(novaMesa(deck, fixo, true), 'commander')
    const publica = mesaPublica(mesa, deck, { largura: 800, altura: 400 })
    expect(publica.mao).toBe(7)
    expect(publica.biblioteca).toBe(92)
    expect(publica.comando.map((c) => c.carta)).toEqual([{ oracle_id: 'Edgar Markov', nome: 'Edgar Markov', imagem_url: 'padrao/Edgar Markov', categoria: 'criatura' }])
    expect(JSON.stringify(publica)).not.toContain('Carta 0')  // nada da mão nem do grimório
  })
})
