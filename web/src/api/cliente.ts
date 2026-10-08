import type { Carta, Categoria, Commander, Parceiro, Recomendacao } from './tipos'

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
  carta: (id: string) => pedir<Carta>(`/cartas/${id}`),

  commanders: (q?: string, limite = 24) => pedir<Commander[]>(`/commanders${query({ q, limite })}`),

  commander: (id: string) => pedir<Commander>(`/commanders/${id}`),

  parceiros: (id: string, q?: string) => pedir<Parceiro[]>(`/commanders/${id}/parceiros${query({ q, limite: 60 })}`),

  recomendacoes: (id: string, categoria?: Categoria, limite = 60) =>
    pedir<Recomendacao[]>(`/commanders/${id}/recomendacoes${query({ categoria, limite })}`),

  // Pra duplas: calcula na hora com os dois commanders
  recomendar: (commanders: string[], categoria?: Categoria, cartas: string[] = [], limite = 60) =>
    pedir<Recomendacao[]>('/recomendar', {
      method: 'POST',
      body: JSON.stringify({ commanders, cartas, categoria, limite }),
    }),
}
