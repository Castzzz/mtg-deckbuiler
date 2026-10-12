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
  contadores?: Contadores  // só no campo: ao sair, a carta perde os contadores
  // Numa partida: carta de outro jogador que está sob o meu controle (Control Magic, Threaten...).
  // `dono` é o id dele, `idDono` o id dela na mesa dele; ao sair do campo ela vai pra uma zona do dono
  dono?: string
  idDono?: number
}

// Carta minha que está no campo de outro jogador (`para`), pra voltar quando o controle acabar
export type Emprestada = CartaMesa & { para: string }

// Tipo do contador -> quantos (só os que têm algum)
export type Contadores = Record<string, number>

// Os mais comuns ficam à mão; dá pra criar qualquer outro pelo nome
export const CONTADORES_CARTA = ['+1/+1', '-1/-1', 'Lealdade', 'Carga', 'Escudo']
export const CONTADORES_JOGADOR = ['Veneno', 'Energia', 'Experiência']
export const VENENO_LETAL = 10

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
  contadores?: Contadores  // do jogador: veneno, energia...
  emprestadas?: Emprestada[]
  eliminado?: boolean
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
  // Carta de outro jogador só sai do campo voltando pra ele (ver devolverAoDono)
  if (carta.dono && para !== 'campo') return mesa
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
  const movida = { ...carta, virada: false, pos: para === 'campo' ? pos : undefined, contadores: undefined }
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

// --- Controle das cartas entre jogadores (numa partida) ---

// Dou o controle de uma carta do meu campo pra outro jogador: ela sai do meu campo e fica anotada,
// pra voltar quando ele devolver ou sair do jogo. Devolve também a carta, pra mandar pra ele
export function emprestar(mesa: Mesa, id: number, para: string, nomePara: string): { mesa: Mesa; carta: CartaMesa } | null {
  const carta = mesa.zonas.campo.find((c) => c.id === id)
  if (!carta || carta.dono) return null
  return {
    carta,
    mesa: {
      ...mesa,
      zonas: { ...mesa.zonas, campo: mesa.zonas.campo.filter((c) => c.id !== id) },
      emprestadas: [...(mesa.emprestadas ?? []), { ...carta, para }],
      ...anotar(mesa, `${nomePara} ganhou o controle de ${carta.carta.nome}`),
    },
  }
}

// Chegou pro meu campo uma carta de outro jogador (como estava: virada, com contadores)
export function ganharControle(mesa: Mesa, carta: CartaMesa, de: string, pos: Posicao): Mesa {
  const nova: CartaMesa = { ...carta, id: mesa.proximoId, dono: de, idDono: carta.id, pos }
  return { ...mesa, zonas: { ...mesa.zonas, campo: [...mesa.zonas.campo, nova] }, proximoId: mesa.proximoId + 1 }
}

// Uma carta que não é minha sai do meu campo: o controle volta pro dono (sem zona) ou ela vai pra uma zona dele.
// Devolve também a carta como ela é na mesa do dono, pra mandar pra ele
export function devolverAoDono(mesa: Mesa, id: number, nomeDono: string, zona?: Zona): { mesa: Mesa; carta: CartaMesa } | null {
  const carta = mesa.zonas.campo.find((c) => c.id === id)
  if (!carta?.dono || carta.idDono === undefined) return null
  const { dono: _, idDono, ...resto } = carta
  const texto = zona && zona !== 'campo' ? `${carta.carta.nome} foi pro ${NOME_ZONA[zona].toLowerCase()} de ${nomeDono}` : `Devolveu ${carta.carta.nome} pra ${nomeDono}`
  return {
    carta: { ...resto, id: idDono },
    mesa: { ...mesa, zonas: { ...mesa.zonas, campo: mesa.zonas.campo.filter((c) => c.id !== id) }, ...anotar(mesa, texto) },
  }
}

// A carta como ela fica na minha mesa (sem o "pra quem emprestei")
function semPara(emprestada: Emprestada): CartaMesa {
  const { para: _, ...carta } = emprestada
  return carta
}

// Uma carta minha voltou de outro jogador: pro meu campo (como estava lá) ou pra zona que ele disse
export function voltou(mesa: Mesa, carta: CartaMesa, pos: Posicao, zona?: Zona, posicao: 'topo' | 'fundo' = 'topo'): Mesa {
  const emprestada = mesa.emprestadas?.find((c) => c.id === carta.id)
  if (!emprestada) return mesa
  const noCampo: CartaMesa = { ...semPara(emprestada), virada: carta.virada, contadores: carta.contadores, pos }
  const comEla = {
    ...mesa,
    emprestadas: mesa.emprestadas!.filter((c) => c.id !== carta.id),
    zonas: { ...mesa.zonas, campo: [...mesa.zonas.campo, noCampo] },
  }
  return !zona || zona === 'campo' ? comEla : mover(comEla, carta.id, zona, posicao)
}

// Quem sai do jogo leva as cartas dele (as que eu controlava deixam o jogo), e as minhas que estavam
// com ele voltam pro meu campo, onde estavam
export function semJogadores(mesa: Mesa, fora: (jogador: string) => boolean): Mesa {
  const saem = mesa.zonas.campo.filter((c) => c.dono && fora(c.dono))
  const voltam = (mesa.emprestadas ?? []).filter((c) => fora(c.para))
  if (!saem.length && !voltam.length) return mesa
  let nova: Mesa = {
    ...mesa,
    emprestadas: mesa.emprestadas?.filter((c) => !voltam.includes(c)),
    zonas: { ...mesa.zonas, campo: [...mesa.zonas.campo.filter((c) => !saem.includes(c)), ...voltam.map(semPara)] },
  }
  if (saem.length) nova = anotarNaMesa(nova, `Saíram do jogo junto com o dono: ${saem.map((c) => c.carta.nome).join(', ')}`)
  if (voltam.length) nova = anotarNaMesa(nova, `Voltaram pro seu controle: ${voltam.map((c) => c.carta.nome).join(', ')}`)
  return nova
}

function somar(contadores: Contadores | undefined, tipo: string, delta: number): Contadores | undefined {
  const novos = { ...contadores, [tipo]: Math.max(0, (contadores?.[tipo] ?? 0) + delta) }
  if (!novos[tipo]) delete novos[tipo]
  return Object.keys(novos).length ? novos : undefined
}

// Põe (ou tira, com delta negativo) contadores numa carta do campo.
// +1/+1 e -1/-1 se anulam, como manda a regra: colocar um deles tira primeiro do outro
export function mudarContador(mesa: Mesa, id: number, tipo: string, delta: number): Mesa {
  const carta = mesa.zonas.campo.find((c) => c.id === id)
  const nome = tipo.trim()
  if (!carta || !nome || !delta) return mesa
  let contadores = carta.contadores
  const oposto = { '+1/+1': '-1/-1', '-1/-1': '+1/+1' }[nome]
  if (oposto && delta > 0) {
    const anula = Math.min(delta, contadores?.[oposto] ?? 0)
    contadores = somar(contadores, oposto, -anula)
    delta -= anula
  }
  contadores = somar(contadores, nome, delta)
  const antes = carta.contadores ?? {}
  const depois = contadores ?? {}
  if (Object.keys({ ...antes, ...depois }).every((t) => antes[t] === depois[t])) return mesa
  return { ...mesa, zonas: { ...mesa.zonas, campo: mesa.zonas.campo.map((c) => (c.id === id ? { ...c, contadores } : c)) } }
}

// Contadores do jogador (veneno, energia...); 10 de veneno mata
export function mudarContadorJogador(mesa: Mesa, tipo: string, delta: number): Mesa {
  const contadores = somar(mesa.contadores, tipo, delta)
  if ((contadores?.[tipo] ?? 0) === (mesa.contadores?.[tipo] ?? 0)) return mesa
  const texto = `${tipo}: ${contadores?.[tipo] ?? 0}`
  return { ...mesa, contadores, ...anotar(mesa, texto) }
}

// Como os contadores aparecem na carta: +1/+1 vira o bônus (+2/+2), o resto "Lealdade 3"
export function rotulosContadores(contadores: Contadores | undefined): { texto: string; tipo: 'bonus' | 'penalidade' | 'outro' }[] {
  if (!contadores) return []
  const rotulos: ReturnType<typeof rotulosContadores> = []
  const saldo = (contadores['+1/+1'] ?? 0) - (contadores['-1/-1'] ?? 0)
  if (saldo > 0) rotulos.push({ texto: `+${saldo}/+${saldo}`, tipo: 'bonus' })
  if (saldo < 0) rotulos.push({ texto: `${saldo}/${saldo}`, tipo: 'penalidade' })
  for (const [tipo, n] of Object.entries(contadores)) {
    if (tipo !== '+1/+1' && tipo !== '-1/-1') rotulos.push({ texto: `${tipo} ${n}`, tipo: 'outro' })
  }
  return rotulos
}

// Rolagem na mesa de teste (numa partida quem rola é a sala, pra ninguém poder escolher o resultado)
export function rolar(lados: number, quantos: number, aleatorio: Aleatorio = Math.random): string {
  const valores = Array.from({ length: quantos }, () => 1 + Math.floor(aleatorio() * lados))
  if (lados === 2) {
    const faces = valores.map((v) => (v === 1 ? 'cara' : 'coroa'))
    return quantos === 1 ? `Jogou uma moeda: ${faces[0]}` : `Jogou ${quantos} moedas: ${faces.join(', ')}`
  }
  if (quantos === 1) return `Rolou 1d${lados}: ${valores[0]}`
  return `Rolou ${quantos}d${lados}: ${valores.join(' + ')} = ${valores.reduce((a, b) => a + b, 0)}`
}

export const anotarNaMesa = (mesa: Mesa, texto: string): Mesa => ({ ...mesa, ...anotar(mesa, texto) })

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
