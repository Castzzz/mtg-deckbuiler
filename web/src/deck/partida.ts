import { useEffect, useRef, useState } from 'react'
import type { Carta } from '../api/tipos'
import type { Deck } from './armazenamento'
import type { RegraMulligan } from './mao'
import type { CartaMesa, Contadores, Mesa, Posicao, Zona } from './mesa'

// Partida com os amigos (ver api/rotas/salas.py). Cada um é dono da própria mesa: ela fica no navegador,
// e só a parte pública vai pra sala

// O que os outros veem de uma carta: o suficiente pra mostrar a imagem
export type CartaVisivel = Pick<Carta, 'oracle_id' | 'nome' | 'imagem_url' | 'categoria'>

export interface CartaPublica {
  id: number
  carta: CartaVisivel
  virada: boolean
  commander: boolean
  token?: boolean
  pos?: Posicao
  contadores?: Contadores
  dono?: string  // carta de outro jogador sob o controle deste
}

export interface MesaPublica {
  deck: { nome: string; commanders: CartaVisivel[] }
  fase: Mesa['fase']
  vida: number
  mao: number  // só quantas
  biblioteca: number
  campo: CartaPublica[]
  cemiterio: CartaPublica[]
  exilio: CartaPublica[]
  comando: CartaPublica[]
  lancamentos: Record<number, number>
  danoCommander: Record<string, number>
  contadores?: Contadores
  eliminado?: boolean
  tamanhoCampo: { largura: number; altura: number }  // pra quem vê ajustar a escala
}

export interface JogadorSala {
  id: string
  nome: string
  conectado: boolean
  deck: MesaPublica['deck'] | null  // escolhido na sala de espera
  mesa: MesaPublica | null
  eliminado: boolean  // saiu do jogo (perdeu): a vez pula ele
}

export interface LinhaLog {
  jogador: string | null  // null: aviso da própria sala
  texto: string
  chat: boolean
  destaque?: boolean  // dado, moeda ou o sorteio de quem começa: aparece na tela de todo mundo
  quando: number
}

export interface Sala {
  codigo: string
  dono: string | null
  comecou: boolean
  vez: string | null
  turno: number
  regra_mulligan: RegraMulligan
  jogadores: JogadorSala[]
  log: LinhaLog[]
}

export const visivel = ({ oracle_id, nome, imagem_url, categoria }: Carta): CartaVisivel => ({ oracle_id, nome, imagem_url, categoria })

export function mesaPublica(mesa: Mesa, deck: Deck, tamanhoCampo: MesaPublica['tamanhoCampo']): MesaPublica {
  const publicas = (cartas: Mesa['zonas']['campo']) =>
    cartas.map(({ id, carta, virada, commander, token, pos, contadores, dono }) => ({ id, carta: visivel(carta), virada, commander, token, pos, contadores, dono }))
  const { zonas } = mesa
  return {
    deck: { nome: deck.nome, commanders: deck.commanders.map(visivel) },
    fase: mesa.fase,
    vida: mesa.vida,
    mao: zonas.mao.length,
    biblioteca: zonas.biblioteca.length,
    campo: publicas(zonas.campo),
    cemiterio: publicas(zonas.cemiterio),
    exilio: publicas(zonas.exilio),
    comando: publicas(zonas.comando),
    lancamentos: mesa.lancamentos,
    danoCommander: mesa.danoCommander ?? {},
    contadores: mesa.contadores,
    eliminado: mesa.eliminado,
    tamanhoCampo,
  }
}

// Chave do dano de commander: de quem é e qual carta (dupla de Partner conta separado)
export const chaveDano = (jogador: string, carta: number) => `${jogador}:${carta}`

// --- Quem eu sou e o que eu tinha na mesa (sobrevive a recarregar a página) ---

const CHAVE_JOGADOR = 'mtg-deckbuilder:jogador'
const chavePartida = (codigo: string) => `mtg-deckbuilder:partida:${codigo}`

interface Identidade {
  segredo: string
  nome: string
}

export function identidade(): Identidade {
  try {
    const salva = JSON.parse(localStorage.getItem(CHAVE_JOGADOR) ?? 'null')
    if (salva?.segredo) return salva
  } catch {
    // sem armazenamento ou estragado: cria outra
  }
  const nova = { segredo: crypto.randomUUID(), nome: '' }
  salvarIdentidade(nova)
  return nova
}

export function salvarIdentidade(id: Identidade) {
  try {
    localStorage.setItem(CHAVE_JOGADOR, JSON.stringify(id))
  } catch {
    // vale só nesta sessão
  }
}

// Minha mesa numa partida, e até onde ela já foi contada pra sala. Antes de começar, só o deck escolhido
export interface MinhaPartida {
  deckId: string
  mesa: Mesa | null
  turnoFeito: number  // último turno da sala em que já desvirei e comprei (pra não comprar de novo ao recarregar)
  logEnviado: number  // quantas linhas do logPublico já foram pra sala
}

export function lerPartida(codigo: string): MinhaPartida | null {
  try {
    return JSON.parse(localStorage.getItem(chavePartida(codigo)) ?? 'null')
  } catch {
    return null
  }
}

export function salvarPartida(codigo: string, partida: MinhaPartida | null) {
  try {
    if (partida) localStorage.setItem(chavePartida(codigo), JSON.stringify(partida))
    else localStorage.removeItem(chavePartida(codigo))
  } catch {
    // armazenamento cheio: a partida segue, só não sobrevive a recarregar
  }
}

// --- Conexão com a sala ---

const BASE = import.meta.env.VITE_API_URL ?? '/api'

function urlSala(codigo: string, id: Identidade) {
  const url = new URL(`${BASE}/salas/${codigo}/ws`, location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.search = new URLSearchParams({ segredo: id.segredo, nome: id.nome }).toString()
  return url.toString()
}

export type EstadoConexao = 'conectando' | 'conectado' | 'caiu' | 'nao-existe' | 'cheia' | 'outra-aba'

const FECHAMENTO: Record<number, EstadoConexao> = { 4404: 'nao-existe', 4403: 'cheia', 4409: 'outra-aba' }

// Mensagens só pra mim: uma carta chegando (ou voltando) e alguém pegando o controle de uma carta minha
export type Direta =
  | { tipo: 'transferir'; de: string; carta: CartaMesa; devolvendo: boolean; zona: Zona | null; posicao: 'topo' | 'fundo' | null }
  | { tipo: 'pedido'; por: string; id: number }

export interface Conexao {
  estado: EstadoConexao
  sala: Sala | null
  eu: string | null
  enviar: (msg: { tipo: string; [k: string]: unknown }) => boolean  // false: está sem conexão agora
  // Quem trata as mensagens diretas (a mesa). As que chegam sem ninguém ouvindo esperam na fila
  ouvir: (tratar: ((msg: Direta) => void) | null) => void
}

// Conecta na sala e reconecta sozinho se cair (menos quando a sala não existe, está cheia ou abriu em outra aba)
export function useSala(codigo: string, nome: string): Conexao {
  const [estado, setEstado] = useState<EstadoConexao>('conectando')
  const [sala, setSala] = useState<Sala | null>(null)
  const [eu, setEu] = useState<string | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const ouvinte = useRef<((msg: Direta) => void) | null>(null)
  const fila = useRef<Direta[]>([])

  useEffect(() => {
    if (!nome) return
    let fim = false
    let tentativas = 0
    let timer: ReturnType<typeof setTimeout>

    function abrir() {
      const id = { ...identidade(), nome }
      const s = new WebSocket(urlSala(codigo, id))
      ws.current = s
      setEstado('conectando')
      s.onopen = () => { tentativas = 0 }
      s.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.tipo === 'voce') {
          setEu(msg.id)
          setEstado('conectado')
        } else if (msg.tipo === 'sala') {
          setSala(msg.sala)
        } else if (msg.tipo === 'mesa') {
          setSala((atual) => atual && {
            ...atual, jogadores: atual.jogadores.map((j) => (j.id === msg.jogador ? { ...j, mesa: msg.mesa } : j)),
          })
        } else if (msg.tipo === 'log') {
          setSala((atual) => atual && { ...atual, log: [...atual.log, msg.linha] })
        } else if (msg.tipo === 'transferir' || msg.tipo === 'pedido') {
          if (ouvinte.current) ouvinte.current(msg)
          else fila.current.push(msg)
        }
      }
      s.onclose = (e) => {
        if (fim) return
        const motivo = FECHAMENTO[e.code]
        if (motivo) return setEstado(motivo)
        setEstado('caiu')
        // Tenta de novo, cada vez esperando mais (até 10s)
        timer = setTimeout(abrir, Math.min(10_000, 500 * 2 ** tentativas++))
      }
    }
    abrir()
    return () => {
      fim = true
      clearTimeout(timer)
      ws.current?.close()
    }
  }, [codigo, nome])

  const enviar: Conexao['enviar'] = (msg) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return false
    ws.current.send(JSON.stringify(msg))
    return true
  }
  const ouvir: Conexao['ouvir'] = (tratar) => {
    ouvinte.current = tratar
    while (tratar && fila.current.length) tratar(fila.current.shift()!)
  }
  return { estado, sala, eu, enviar, ouvir }
}
