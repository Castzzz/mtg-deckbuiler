import type { Carta, CartaImportada, Categoria, Commander, Ordem, Parceiro, Recomendacao } from './tipos'

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

  carta: (id: string) => pedir<Carta>(`/cartas/${id}`),

  commanders: (q?: string, limite = 24) => pedir<Commander[]>(`/commanders${query({ q, limite })}`),

  commander: (id: string) => pedir<Commander>(`/commanders/${id}`),

  parceiros: (id: string, q?: string) => pedir<Parceiro[]>(`/commanders/${id}/parceiros${query({ q, limite: 60 })}`),

  recomendacoes: (id: string, ordem: Ordem, categoria?: Categoria, limite = 60) =>
    pedir<Recomendacao[]>(`/commanders/${id}/recomendacoes${query({ ordem, categoria, limite })}`),

  // Calcula na hora: pra duplas e pro deck em montagem (não sugere o que já está em `cartas`)
  recomendar: (commanders: string[], ordem: Ordem, categoria?: Categoria, cartas: string[] = [], limite = 60) =>
    pedir<Recomendacao[]>('/recomendar', {
      method: 'POST',
      body: JSON.stringify({ commanders, cartas, ordem, categoria, limite }),
    }),
}
