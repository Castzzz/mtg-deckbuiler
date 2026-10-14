import type { Deck } from '../deck/armazenamento'
import type {
  Bracket, Carta, CartaImportada, Categoria, Commander, Cotacao, Edicao, Ordem, Parceiro, Recomendacao, SugestaoCommander, Token, TokenDoDeck, Usuario,
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
    credentials: 'include',  // o cookie do login
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!r.ok) {
    const corpo = await r.json().catch(() => null)
    throw new ErroApi(r.status, typeof corpo?.detail === 'string' ? corpo.detail : `Erro ${r.status}`)
  }
  return r.status === 204 ? (undefined as T) : r.json()
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

  // `cores`: identidade exata (ex: 'WB' = só Orzhov, 'C' = incolores)
  commanders: (q?: string, limite = 24, cores?: string, offset = 0) => pedir<Commander[]>(`/commanders${query({ q, limite, cores, offset })}`),

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

  // Conta: o login fica num cookie que o navegador manda sozinho
  eu: () => pedir<Usuario>('/eu'),
  criarConta: (usuario: string, email: string, senha: string) =>
    pedir<Usuario>('/contas', { method: 'POST', body: JSON.stringify({ usuario, email, senha }) }),
  entrar: (login: string, senha: string) => pedir<Usuario>('/login', { method: 'POST', body: JSON.stringify({ login, senha }) }),
  sair: () => pedir<void>('/logout', { method: 'POST' }),
  meusDecks: () => pedir<Deck[]>('/meus-decks'),
  salvarDeck: ({ id, ...deck }: Deck) => pedir<Deck>(`/meus-decks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(deck) }),
  apagarDeck: (id: string) => pedir<void>(`/meus-decks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

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

  // Pra deck sem commander: quem combina com as cartas que já estão nele
  sugerirCommanders: (cartas: string[], limite = 8) =>
    pedir<SugestaoCommander[]>('/sugerir-commanders', { method: 'POST', body: JSON.stringify({ cartas, limite }) }),
}
