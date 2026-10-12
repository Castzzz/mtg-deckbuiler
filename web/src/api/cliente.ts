import type {
  Bracket, Carta, CartaImportada, Categoria, Commander, Cotacao, Edicao, Ordem, Parceiro, Recomendacao, Token, TokenDoDeck,
} from './tipos'
import type { RegraMulligan } from '../deck/mao'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

export class ErroApi extends Error {
  status: number
  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + caminho, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!r.ok) {
    const corpo = await r.json().catch(() => null)
    throw new ErroApi(r.status, typeof corpo?.detail === 'string' ? corpo.detail : `Erro ${r.status}`)
  }
  return r.json()
}

function query(params: Record<string, string | number | undefined>) {
  const definidos = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  return definidos.length ? '?' + new URLSearchParams(definidos.map(([k, v]) => [k, String(v)])) : ''
}

export const api = {
  // cores: identidade de cor do deck, ex: "WBR" (só cartas que cabem nela)
  buscarCartas: (q: string, cores?: string) => pedir<Carta[]>(`/cartas${query({ q, cores, limite: 12 })}`),

  // {nome pedido: carta}; os nomes não encontrados ficam de fora
  cartasPorNome: (nomes: string[]) =>
    pedir<Record<string, CartaImportada>>('/cartas/por-nome', { method: 'POST', body: JSON.stringify({ nomes }) }),

  edicoes: (id: string) => pedir<Edicao[]>(`/cartas/${id}/edicoes`),

  carta: (id: string) => pedir<Carta>(`/cartas/${id}`),

  commanders: (q?: string, limite = 24) => pedir<Commander[]>(`/commanders${query({ q, limite })}`),

  commander: (id: string) => pedir<Commander>(`/commanders/${id}`),

  parceiros: (id: string, q?: string) => pedir<Parceiro[]>(`/commanders/${id}/parceiros${query({ q, limite: 60 })}`),

  cartasPorId: (ids: string[]) => pedir<Carta[]>('/cartas/por-id', { method: 'POST', body: JSON.stringify({ ids }) }),

  cotacao: () => pedir<Cotacao>('/cotacao'),

  // Os tokens que as cartas criam (commanders + cartas do deck)
  tokensDoDeck: (ids: string[]) => pedir<TokenDoDeck[]>('/tokens/do-deck', { method: 'POST', body: JSON.stringify({ ids }) }),

  buscarTokens: (q: string) => pedir<Token[]>(`/tokens${query({ q, limite: 40 })}`),

  // Sala pra jogar com os amigos; o resto da conversa é pelo WebSocket (deck/partida.ts)
  criarSala: (regra_mulligan: RegraMulligan) =>
    pedir<{ codigo: string }>('/salas', { method: 'POST', body: JSON.stringify({ regra_mulligan }) }),

  bracket: (commanders: string[], cartas: { oracle_id: string; qtd: number }[]) =>
    pedir<Bracket>('/bracket', { method: 'POST', body: JSON.stringify({ commanders, cartas }) }),

  // precoMax em dólar
  recomendacoes: (id: string, ordem: Ordem, categoria?: Categoria, precoMax?: number, limite = 60) =>
    pedir<Recomendacao[]>(`/commanders/${id}/recomendacoes${query({ ordem, categoria, preco_max: precoMax, limite })}`),

  // Calcula na hora: pra duplas e pro deck em montagem (não sugere o que já está em `cartas`)
  recomendar: (commanders: string[], ordem: Ordem, categoria?: Categoria, cartas: string[] = [], precoMax?: number, limite = 60) =>
    pedir<Recomendacao[]>('/recomendar', {
      method: 'POST',
      body: JSON.stringify({ commanders, cartas, ordem, categoria, preco_max: precoMax, limite }),
    }),
}
