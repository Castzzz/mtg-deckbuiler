import type { Carta } from '../api/tipos'
import type { Deck } from './armazenamento'
import { cartasADevolver, embaralhar, type RegraMulligan, TAMANHO_MAO } from './mao'
import { comArte } from './regras'

// A mesa do teste: as zonas de um jogo de verdade, pra jogar as cartas sozinho e ver como o deck anda

export type Zona = 'biblioteca' | 'mao' | 'campo' | 'cemiterio' | 'exilio' | 'comando'

export const NOME_ZONA: Record<Zona, string> = {
  biblioteca: 'Grimório', mao: 'Mão', campo: 'Campo de batalha', cemiterio: 'Cemitério', exilio: 'Exílio', comando: 'Zona de comando',
}

export interface Posicao {
  x: number
  y: number
}

// `id` diferencia as cópias (10 Swamps são 10 cartas diferentes na mesa).
// `pos`: onde ela está no campo, em pixels a partir do canto de cima do campo
export interface CartaMesa {
  id: number
  carta: Carta
  virada: boolean
  commander: boolean
  token?: boolean  // fora do campo, token deixa de existir
  pos?: Posicao
}

export interface Mesa {
  zonas: Record<Zona, CartaMesa[]>  // grimório: o topo é o índice 0
  // mulligan: decidindo se fica com a mão; devolvendo: escolhendo o que vai pro fundo; jogo: valendo
  fase: 'mulligan' | 'devolvendo' | 'jogo'
  mulligans: number
  turno: number
  vida: number
  lancamentos: Record<number, number>  // commander -> quantas vezes saiu da zona de comando (imposto = 2 × isso)
  log: string[]
  // O mesmo histórico, sem o que só eu posso ver (as cartas compradas): é o que vai pros outros numa partida
  logPublico: string[]
  proximoId: number  // pros tokens criados na mesa
  // Partida com os amigos: ao manter a mão ninguém compra, cada um compra quando chega a sua vez
  multiplayer?: boolean
  // Dano que levei de cada commander dos outros (chave: jogador:carta); 21 do mesmo commander mata
  danoCommander?: Record<string, number>
}

type Aleatorio = () => number

const VIDA_INICIAL = 40
export const DANO_COMMANDER_LETAL = 21

// Linha nova no histórico; `publico` é como ela aparece pros outros (null: não aparece)
function anotar(mesa: Mesa, texto: string, publico: string | null = texto): Pick<Mesa, 'log' | 'logPublico'> {
  return { log: [...mesa.log, texto], logPublico: publico === null ? mesa.logPublico : [...mesa.logPublico, publico] }
}

function cartasDoDeck(deck: Deck): CartaMesa[] {
  const commanders = deck.commanders.map((c, id) => ({ id, carta: comArte(deck, c), virada: false, commander: true }))
  const resto = deck.cartas.flatMap((c) => Array.from({ length: c.qtd }, () => comArte(deck, c.carta)))
    .map((carta, i) => ({ id: commanders.length + i, carta, virada: false, commander: false }))
  return [...commanders, ...resto]
}

function zonasVazias(): Record<Zona, CartaMesa[]> {
  return { biblioteca: [], mao: [], campo: [], cemiterio: [], exilio: [], comando: [] }
}

// Embaralha e compra 7; usado no começo e a cada mulligan
function darMao(deck: Deck, mulligans: number, aleatorio: Aleatorio, multiplayer?: boolean): Mesa {
  const todas = cartasDoDeck(deck)
  const biblioteca = embaralhar(todas.filter((c) => !c.commander), aleatorio)
  const zonas = zonasVazias()
  zonas.comando = todas.filter((c) => c.commander)
  zonas.mao = biblioteca.slice(0, TAMANHO_MAO)
  zonas.biblioteca = biblioteca.slice(TAMANHO_MAO)
  return {
    zonas, fase: 'mulligan', mulligans, turno: 0, vida: VIDA_INICIAL, lancamentos: {}, log: [], logPublico: [], proximoId: todas.length,
    ...(multiplayer && { multiplayer, danoCommander: {} }),
  }
}

export const novaMesa = (deck: Deck, aleatorio: Aleatorio = Math.random, multiplayer = false) => darMao(deck, 0, aleatorio, multiplayer)

export function mulligan(mesa: Mesa, deck: Deck, aleatorio: Aleatorio = Math.random): Mesa {
  return darMao(deck, mesa.mulligans + 1, aleatorio, mesa.multiplayer)
}

// Começa o jogo. Sozinho já é o turno 1, e em Commander ninguém pula a compra do primeiro turno.
// Numa partida, fica esperando a vez (aí o proximoTurno desvira e compra)
function comecar(mesa: Mesa): Mesa {
  const texto = mesa.mulligans ? `Manteve depois de ${mesa.mulligans} mulligan${mesa.mulligans > 1 ? 's' : ''}` : 'Manteve a mão'
  const mantida = { ...mesa, fase: 'jogo' as const, ...anotar(mesa, texto) }
  return mesa.multiplayer ? mantida : comprar({ ...mantida, turno: 1 })
}

export function manter(mesa: Mesa, regra: RegraMulligan): Mesa {
  return cartasADevolver(regra, mesa.mulligans) ? { ...mesa, fase: 'devolvendo' } : comecar(mesa)
}

// As cartas escolhidas vão pro fundo do grimório, na ordem em que foram escolhidas
export function devolver(mesa: Mesa, ids: number[]): Mesa {
  const vao = ids.map((id) => mesa.zonas.mao.find((c) => c.id === id)!)
  const zonas = {
    ...mesa.zonas,
    mao: mesa.zonas.mao.filter((c) => !ids.includes(c.id)),
    biblioteca: [...mesa.zonas.biblioteca, ...vao],
  }
  return comecar({ ...mesa, zonas })
}

export function onde(mesa: Mesa, id: number): Zona | undefined {
  return (Object.keys(mesa.zonas) as Zona[]).find((z) => mesa.zonas[z].some((c) => c.id === id))
}

// Move uma carta pra outra zona. No grimório dá pra escolher topo ou fundo; nas outras ela entra no fim.
// No campo, `pos` diz onde ela fica; mover dentro do campo só muda o lugar (e traz a carta pra frente)
export function mover(mesa: Mesa, id: number, para: Zona, posicao: 'topo' | 'fundo' = 'topo', pos?: Posicao): Mesa {
  const de = onde(mesa, id)
  if (!de) return mesa
  const carta = mesa.zonas[de].find((c) => c.id === id)!
  // Só commander vai pra zona de comando
  if (para === 'comando' && !carta.commander) return mesa
  if (de === para && para === 'campo') {
    if (!pos) return mesa
    return { ...mesa, zonas: { ...mesa.zonas, campo: [...mesa.zonas.campo.filter((c) => c.id !== id), { ...carta, pos }] } }
  }
  if (de === para && para !== 'biblioteca') return mesa
  // Token que sai do campo deixa de existir (vai pro cemitério e some)
  if (carta.token) {
    return {
      ...mesa,
      zonas: { ...mesa.zonas, [de]: mesa.zonas[de].filter((c) => c.id !== id) },
      ...anotar(mesa, `${carta.carta.nome} (token) deixou de existir`),
    }
  }

  const zonas = { ...mesa.zonas, [de]: mesa.zonas[de].filter((c) => c.id !== id) }
  const movida = { ...carta, virada: false, pos: para === 'campo' ? pos : undefined }
  zonas[para] = para === 'biblioteca' && posicao === 'topo' ? [movida, ...zonas[para]] : [...zonas[para], movida]

  let { lancamentos } = mesa
  let texto: string | null = null
  if (de === 'comando' && para === 'campo') {
    lancamentos = { ...lancamentos, [id]: (lancamentos[id] ?? 0) + 1 }
    const imposto = 2 * (lancamentos[id] - 1)
    texto = `Lançou ${carta.carta.nome}${imposto ? ` (imposto +${imposto})` : ''}`
  } else if (para === 'campo' && de === 'mao') {
    texto = `Jogou ${carta.carta.nome}`
  }
  return { ...mesa, zonas, lancamentos, ...(texto && anotar(mesa, texto)) }
}

export function desvirarTudo(mesa: Mesa): Mesa {
  if (!mesa.zonas.campo.some((c) => c.virada)) return mesa
  return { ...mesa, zonas: { ...mesa.zonas, campo: mesa.zonas.campo.map((c) => (c.virada ? { ...c, virada: false } : c)) } }
}

// Cria tokens no campo, cada um na posição dada (um por posição)
export function criarToken(mesa: Mesa, carta: Carta, posicoes: Posicao[]): Mesa {
  const novos = posicoes.map((pos, i) => ({ id: mesa.proximoId + i, carta, virada: false, commander: false, token: true, pos }))
  if (!novos.length) return mesa
  return {
    ...mesa,
    zonas: { ...mesa.zonas, campo: [...mesa.zonas.campo, ...novos] },
    proximoId: mesa.proximoId + novos.length,
    ...anotar(mesa, `Criou ${novos.length > 1 ? `${novos.length} tokens` : 'um token'}: ${carta.nome}`),
  }
}

// Cópia (como token) de uma carta do campo: Populate, Helm of the Host, clone...
export function copiar(mesa: Mesa, id: number, pos: Posicao): Mesa {
  const original = mesa.zonas.campo.find((c) => c.id === id)
  return original ? criarToken(mesa, original.carta, [pos]) : mesa
}

export function virar(mesa: Mesa, id: number): Mesa {
  return { ...mesa, zonas: { ...mesa.zonas, campo: mesa.zonas.campo.map((c) => (c.id === id ? { ...c, virada: !c.virada } : c)) } }
}

export function comprar(mesa: Mesa, quantas = 1): Mesa {
  const compradas = mesa.zonas.biblioteca.slice(0, quantas)
  if (!compradas.length) return { ...mesa, ...anotar(mesa, 'Grimório vazio: não deu pra comprar') }
  return {
    ...mesa,
    zonas: { ...mesa.zonas, biblioteca: mesa.zonas.biblioteca.slice(quantas), mao: [...mesa.zonas.mao, ...compradas] },
    // Os outros só ficam sabendo quantas
    ...anotar(mesa, `Turno ${mesa.turno}: comprou ${compradas.map((c) => c.carta.nome).join(', ')}`,
      `Comprou ${compradas.length > 1 ? `${compradas.length} cartas` : 'uma carta'}`),
  }
}

export function embaralharGrimorio(mesa: Mesa, aleatorio: Aleatorio = Math.random): Mesa {
  return { ...mesa, zonas: { ...mesa.zonas, biblioteca: embaralhar(mesa.zonas.biblioteca, aleatorio) }, ...anotar(mesa, 'Embaralhou o grimório') }
}

// Desvira tudo e compra
export function proximoTurno(mesa: Mesa): Mesa {
  return comprar({ ...desvirarTudo(mesa), turno: mesa.turno + 1 })
}

export function mudarVida(mesa: Mesa, delta: number): Mesa {
  return { ...mesa, vida: mesa.vida + delta }
}

// Dano de commander também é perda de vida: muda os dois juntos (e nunca fica negativo)
export function danoDeCommander(mesa: Mesa, chave: string, nome: string, delta: number): Mesa {
  const antes = mesa.danoCommander?.[chave] ?? 0
  const depois = Math.max(0, antes + delta)
  if (depois === antes) return mesa
  const texto = depois > antes ? `Levou ${depois - antes} de dano de ${nome} (total ${depois})` : `Desfez ${antes - depois} de dano de ${nome} (total ${depois})`
  return {
    ...mesa,
    vida: mesa.vida - (depois - antes),
    danoCommander: { ...mesa.danoCommander, [chave]: depois },
    ...anotar(mesa, texto),
  }
}

// Imposto pra lançar o commander de novo da zona de comando
export const imposto = (mesa: Mesa, id: number) => 2 * (mesa.lancamentos[id] ?? 0)

// Primeiro lugar livre no campo pra uma carta que entrou sem ser arrastada (clique, atalho, menu):
// terrenos enchem de baixo pra cima, o resto de cima pra baixo, em linhas da esquerda pra direita
export function lugarLivre(mesa: Mesa, terreno: boolean, campo: { largura: number; altura: number }, carta: { largura: number; altura: number }): Posicao {
  const passoX = carta.altura + 8  // cabe a carta virada sem encostar na vizinha
  const passoY = carta.altura + 12
  const colunas = Math.max(1, Math.floor((campo.largura - 12) / passoX))
  const linhas = Math.max(1, Math.floor((campo.altura - 12) / passoY))
  const ocupado = (x: number, y: number) => mesa.zonas.campo.some((c) => c.pos && Math.abs(c.pos.x - x) < passoX / 2 && Math.abs(c.pos.y - y) < passoY / 2)
  for (let l = 0; l < linhas; l++) {
    const y = terreno ? campo.altura - carta.altura - 12 - l * passoY : 12 + l * passoY
    for (let k = 0; k < colunas; k++) {
      const x = 12 + k * passoX
      if (!ocupado(x, y)) return { x, y }
    }
  }
  // Campo lotado: empilha com um deslocamento pra ainda dar pra ver
  const n = mesa.zonas.campo.length
  return { x: 12 + (n % 10) * 24, y: 12 + (n % 6) * 24 }
}

// Mana disponível agora: terrenos desvirados no campo (o que dá pra ver sem ler o texto de cada carta)
export const terrenosDesvirados = (mesa: Mesa) =>
  mesa.zonas.campo.filter((c) => c.carta.categoria === 'terreno' && !c.virada).length
