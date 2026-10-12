import { describe, expect, it } from 'vitest'
import type { Carta } from '../api/tipos'
import type { Deck } from './armazenamento'
import {
  comprar, copiar, criarToken, danoDeCommander, desvirarTudo, devolver, devolverAoDono, emprestar, ganharControle, imposto, lugarLivre, manter,
  mover, mudarContador, mudarContadorJogador, mulligan, novaMesa, onde, proximoTurno, rolar, rotulosContadores, semJogadores, terrenosDesvirados,
  virar, voltou, repassar, controleMudou, sairDoJogo, voltarProJogo, poderResistencia, mudarPT, zerarPT, completarCartas,
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

describe('contadores', () => {
  function comCriatura() {
    const mesa = manter(novaMesa(deck, fixo), 'commander')
    const id = mesa.zonas.mao[0].id
    return { mesa: mover(mesa, id, 'campo', 'topo', { x: 0, y: 0 }), id }
  }
  const da = (mesa: ReturnType<typeof novaMesa>, id: number) => mesa.zonas.campo.find((c) => c.id === id)!.contadores

  it('põe e tira, e some quando chega a zero', () => {
    let { mesa, id } = comCriatura()
    mesa = mudarContador(mudarContador(mesa, id, 'Carga', 2), id, '+1/+1', 3)
    expect(da(mesa, id)).toEqual({ Carga: 2, '+1/+1': 3 })
    mesa = mudarContador(mesa, id, 'Carga', -5)
    expect(da(mesa, id)).toEqual({ '+1/+1': 3 })
    expect(rotulosContadores(da(mesa, id))).toEqual([{ curto: '+3', texto: '+3/+3' }])
    // tirar o que não tem não muda nada (nem vira passo no desfazer)
    expect(mudarContador(mesa, id, 'Lealdade', -1)).toBe(mesa)
  })

  it('+1/+1 e -1/-1 se anulam', () => {
    let { mesa, id } = comCriatura()
    mesa = mudarContador(mesa, id, '+1/+1', 2)
    mesa = mudarContador(mesa, id, '-1/-1', 3)
    expect(da(mesa, id)).toEqual({ '-1/-1': 1 })
    expect(rotulosContadores(da(mesa, id))).toEqual([{ curto: '−1', texto: '-1/-1' }])
    expect(rotulosContadores({ Lealdade: 3, Carga: 2 })).toEqual([{ curto: '3', texto: 'Lealdade 3' }, { curto: 'C2', texto: 'Carga 2' }])
  })

  it('a carta perde os contadores ao sair do campo, e a cópia não herda', () => {
    let { mesa, id } = comCriatura()
    mesa = mudarContador(mesa, id, '+1/+1', 1)
    expect(mover(mesa, id, 'campo', 'topo', { x: 50, y: 0 }).zonas.campo.at(-1)!.contadores).toEqual({ '+1/+1': 1 })
    expect(copiar(mesa, id, { x: 9, y: 9 }).zonas.campo.at(-1)!.contadores).toBeUndefined()
    mesa = mover(mover(mesa, id, 'mao'), id, 'campo', 'topo', { x: 0, y: 0 })
    expect(da(mesa, id)).toBeUndefined()
  })

  it('contadores do jogador vão pra mesa pública e pro histórico', () => {
    let mesa = novaMesa(deck, fixo, true)
    mesa = mudarContadorJogador(mudarContadorJogador(mesa, 'Veneno', 3), 'Veneno', -1)
    expect(mesa.contadores).toEqual({ Veneno: 2 })
    expect(mesa.logPublico.at(-1)).toBe('Veneno: 2')
    expect(mesaPublica(mesa, deck, { largura: 1, altura: 1 }).contadores).toEqual({ Veneno: 2 })
    expect(mudarContadorJogador(mesa, 'Energia', -1)).toBe(mesa)
  })
})

describe('dados', () => {
  it('rola dados e moedas', () => {
    expect(rolar(20, 1, () => 0.999)).toBe('Rolou 1d20: 20')
    expect(rolar(6, 2, () => 0)).toBe('Rolou 2d6: 1 + 1 = 2')
    expect(rolar(2, 1, () => 0)).toBe('Jogou uma moeda: cara')
    expect(rolar(2, 2, () => 0.9)).toBe('Jogou 2 moedas: coroa, coroa')
  })
})

describe('controle de cartas entre jogadores', () => {
  // Ana e Bia, cada uma com a sua mesa; a Ana tem uma carta no campo, virada e com contador
  function duas() {
    let ana = manter(novaMesa(deck, fixo, true), 'commander')
    const id = ana.zonas.mao[0].id
    ana = mudarContador(virar(mover(ana, id, 'campo', 'topo', { x: 5, y: 5 }), id), id, '+1/+1', 2)
    return { ana, bia: manter(novaMesa(deck, fixo, true), 'commander'), id }
  }

  it('a Ana dá o controle pra Bia, e a carta chega como estava', () => {
    const { ana, bia, id } = duas()
    const dado = emprestar(ana, id, 'bia', 'Bia')!
    expect(dado.mesa.zonas.campo).toHaveLength(0)
    expect(dado.mesa.emprestadas).toMatchObject([{ id, para: 'bia' }])
    expect(dado.mesa.logPublico.at(-1)).toBe(`Bia ganhou o controle de ${dado.carta.carta.nome}`)

    const comBia = ganharControle(bia, dado.carta, 'ana', { x: 50, y: 50 })
    const nela = comBia.zonas.campo[0]
    expect(nela).toMatchObject({ id: bia.proximoId, dono: 'ana', idDono: id, virada: true, contadores: { '+1/+1': 2 }, pos: { x: 50, y: 50 } })
    // não dá pra mandar pra uma zona da Bia (ela vai pra do dono)
    expect(mover(comBia, nela.id, 'cemiterio')).toBe(comBia)
  })

  it('a Bia devolve o controle: volta pro campo da Ana como estava lá', () => {
    const { ana, bia, id } = duas()
    const dado = emprestar(ana, id, 'bia', 'Bia')!
    let comBia = ganharControle(bia, dado.carta, 'ana', { x: 50, y: 50 })
    comBia = virar(comBia, comBia.zonas.campo[0].id)  // a Bia desvirou
    const devolvido = devolverAoDono(comBia, comBia.zonas.campo[0].id, 'Ana')!
    expect(devolvido.mesa.zonas.campo).toHaveLength(0)
    expect(devolvido.carta).toMatchObject({ id, virada: false })
    expect(devolvido.carta.dono).toBeUndefined()

    const anaDepois = voltou(dado.mesa, devolvido.carta, { x: 9, y: 9 })
    expect(anaDepois.zonas.campo).toMatchObject([{ id, virada: false, pos: { x: 9, y: 9 }, contadores: { '+1/+1': 2 } }])
    expect(anaDepois.emprestadas).toEqual([])
    expect(total(anaDepois)).toBe(100)
  })

  it('morreu com a Bia: vai pro cemitério da Ana (e chegar duas vezes não duplica)', () => {
    const { ana, bia, id } = duas()
    const dado = emprestar(ana, id, 'bia', 'Bia')!
    const comBia = ganharControle(bia, dado.carta, 'ana', { x: 0, y: 0 })
    const devolvido = devolverAoDono(comBia, comBia.zonas.campo[0].id, 'Ana', 'cemiterio')!
    expect(devolvido.mesa.logPublico.at(-1)).toMatch(/foi pro cemitério de Ana$/)
    const anaDepois = voltou(dado.mesa, devolvido.carta, { x: 0, y: 0 }, 'cemiterio')
    expect(anaDepois.zonas.cemiterio.map((c) => c.id)).toEqual([id])
    expect(anaDepois.zonas.cemiterio[0].contadores).toBeUndefined()
    expect(voltou(anaDepois, devolvido.carta, { x: 0, y: 0 }, 'cemiterio')).toBe(anaDepois)
  })

  it('quem sai do jogo leva as cartas dele e devolve as dos outros', () => {
    const { ana, bia, id } = duas()
    const dado = emprestar(ana, id, 'bia', 'Bia')!
    const comBia = ganharControle(bia, dado.carta, 'ana', { x: 0, y: 0 })
    // A Bia saiu: a carta da Ana volta pro campo dela, onde estava
    const anaDepois = semJogadores(dado.mesa, (j) => j === 'bia')
    expect(anaDepois.zonas.campo).toMatchObject([{ id, pos: { x: 5, y: 5 } }])
    expect(anaDepois.logPublico.at(-1)).toMatch(/^Voltaram pro seu controle: /)
    // A Ana saiu: a carta dela some do campo da Bia
    const biaDepois = semJogadores(comBia, (j) => j === 'ana')
    expect(biaDepois.zonas.campo).toHaveLength(0)
    // Ninguém saiu: nada muda
    expect(semJogadores(comBia, () => false)).toBe(comBia)
  })

  it('a mesa pública mostra de quem é a carta', () => {
    const { ana, bia, id } = duas()
    const comBia = ganharControle(bia, emprestar(ana, id, 'bia', 'Bia')!.carta, 'ana', { x: 0, y: 0 })
    expect(mesaPublica(comBia, deck, { largura: 1, altura: 1 }).campo[0].dono).toBe('ana')
  })
})

describe('carta livre entre os jogadores', () => {
  it('a Bia passa a carta da Ana pro Caio: continua sendo da Ana, e a Ana sabe com quem está', () => {
    let ana = manter(novaMesa(deck, fixo, true), 'commander')
    const id = ana.zonas.mao[0].id
    ana = mover(ana, id, 'campo', 'topo', { x: 5, y: 5 })
    const bia = manter(novaMesa(deck, fixo, true), 'commander')
    const caio = manter(novaMesa(deck, fixo, true), 'commander')

    const dado = emprestar(ana, id, 'bia', 'Bia')!
    ana = dado.mesa
    const comBia = ganharControle(bia, dado.carta, 'ana', { x: 0, y: 0 })
    const passada = repassar(comBia, comBia.zonas.campo[0].id, 'caio', 'Caio')!
    expect(passada.mesa.zonas.campo).toHaveLength(0)
    expect(repassar(comBia, comBia.zonas.campo[0].id, 'ana', 'Ana')).toBeNull()  // pro dono é devolver

    const comCaio = ganharControle(caio, passada.carta, 'bia', { x: 0, y: 0 })
    expect(comCaio.zonas.campo[0]).toMatchObject({ dono: 'ana', idDono: id })
    ana = controleMudou(ana, id, 'caio')
    expect(ana.emprestadas).toMatchObject([{ id, para: 'caio' }])
    // a Bia sair não muda nada pra Ana; o Caio sair devolve a carta pra ela
    expect(semJogadores(ana, (j) => j === 'bia')).toBe(ana)
    expect(semJogadores(ana, (j) => j === 'caio').zonas.campo.map((c) => c.id)).toEqual([id])
  })

  it('sair do jogo devolve o que é dos outros e traz as minhas de volta; dá pra voltar', () => {
    let ana = manter(novaMesa(deck, fixo, true), 'commander')
    const [a, b] = ana.zonas.mao.map((c) => c.id)
    ana = mover(mover(ana, a, 'campo', 'topo', { x: 0, y: 0 }), b, 'campo', 'topo', { x: 200, y: 0 })
    const dado = emprestar(ana, a, 'bia', 'Bia')!
    // a Ana também controla uma carta da Bia
    ana = ganharControle(dado.mesa, { ...dado.carta, id: 50 }, 'bia', { x: 400, y: 0 })

    const fora = sairDoJogo(ana, true)
    expect(fora.eliminado).toBe(true)
    expect(fora.zonas.campo.map((c) => c.id).sort()).toEqual([a, b].sort())
    expect(fora.emprestadas).toEqual([])
    expect(fora.logPublico.at(-1)).toBe('Concedeu')

    const deVolta = voltarProJogo(fora)
    expect(deVolta.eliminado).toBe(false)
    expect(deVolta.logPublico.at(-1)).toBe('Voltou pro jogo')
    expect(voltarProJogo(deVolta)).toBe(deVolta)
  })
})

describe('poder e resistência', () => {
  const goyf = { poder: '*', resistencia: '1+*' }

  it('soma o ajuste à mão e os contadores', () => {
    expect(poderResistencia({ poder: '4', resistencia: '4' })).toMatchObject({ poder: 4, resistencia: 4, texto: '4/4' })
    expect(poderResistencia({ poder: '2', resistencia: '2' }, { poder: 1, resistencia: 0 }, { '+1/+1': 2 })).toMatchObject({ texto: '5/4' })
    expect(poderResistencia({ poder: '2', resistencia: '2' }, undefined, { '-1/-1': 1 })).toMatchObject({ texto: '1/1' })
    expect(poderResistencia({ poder: '3', resistencia: '3' }, { poder: 2, resistencia: -1 })).toMatchObject({ texto: '5/2' })
    expect(poderResistencia({ poder: null, resistencia: null })).toBeNull()
  })

  it('com "*" mostra o impresso até a pessoa ajustar', () => {
    expect(poderResistencia(goyf)!.texto).toBe('*/1+*')
    expect(poderResistencia(goyf, { poder: 3, resistencia: 3 })!.texto).toBe('3/4')
  })

  it('ajusta, zera, e esquece ao sair do campo', () => {
    let mesa = manter(novaMesa(deck, fixo), 'commander')
    const id = mesa.zonas.mao[0].id
    mesa = mudarPT(mudarPT(mover(mesa, id, 'campo', 'topo', { x: 0, y: 0 }), id, 'poder', 2), id, 'resistencia', -1)
    expect(mesa.zonas.campo[0].ajuste).toEqual({ poder: 2, resistencia: -1 })
    expect(zerarPT(mesa, id).zonas.campo[0].ajuste).toBeUndefined()
    expect(mudarPT(mudarPT(mesa, id, 'poder', -2), id, 'resistencia', 1).zonas.campo[0].ajuste).toBeUndefined()
    expect(mover(mover(mesa, id, 'mao'), id, 'campo', 'topo', { x: 0, y: 0 }).zonas.campo[0].ajuste).toBeUndefined()
  })

  it('planeswalker entra com a lealdade', () => {
    const liliana = { ...carta('Liliana'), categoria: 'planeswalker' as const, lealdade: '3' }
    const comLiliana: Deck = { ...deck, cartas: [{ carta: liliana, qtd: 1 }, ...deck.cartas] }
    let mesa = manter(novaMesa(comLiliana, fixo), 'commander')
    const id = mesa.zonas.mao.find((c) => c.carta.nome === 'Liliana')!.id
    mesa = mover(mesa, id, 'campo', 'topo', { x: 0, y: 0 })
    expect(mesa.zonas.campo[0].contadores).toEqual({ Lealdade: 3 })
  })

  it('completa as cartas de decks salvos antes', () => {
    const mesa = novaMesa(deck, fixo)
    const atualizadas = new Map([['Swamp', { ...carta('Swamp', 'terreno'), poder: null, resistencia: null, lealdade: null }],
      ['Carta 0', { ...carta('Carta 0'), poder: '2', resistencia: '3', lealdade: null }]])
    const completa = completarCartas(mesa, atualizadas)
    const todas = Object.values(completa.zonas).flat()
    expect(todas.find((c) => c.carta.nome === 'Carta 0')!.carta.poder).toBe('2')
    expect(todas.filter((c) => c.carta.nome === 'Swamp').every((c) => c.carta.poder === null)).toBe(true)
    expect(completarCartas(completa, atualizadas)).toBe(completa)  // já completa: nada muda
  })
})
