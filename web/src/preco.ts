import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { api } from './api/cliente'

// Os preços vêm em dólar (TCGplayer, via Scryfall); em real é só a conversão pela cotação do dia,
// não o preço das lojas brasileiras

export type Moeda = 'BRL' | 'USD'

const CHAVE = 'mtg-deckbuilder:moeda'
const ouvintes = new Set<() => void>()

function lerMoeda(): Moeda {
  try {
    return localStorage.getItem(CHAVE) === 'USD' ? 'USD' : 'BRL'
  } catch {
    return 'BRL'
  }
}

let moedaAtual = lerMoeda()

export function mudarMoeda(moeda: Moeda) {
  moedaAtual = moeda
  try {
    localStorage.setItem(CHAVE, moeda)
  } catch {
    // sem localStorage: vale só até fechar a aba
  }
  ouvintes.forEach((f) => f())
}

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

const FORMATOS = {
  BRL: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  USD: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }),
}

export function usePreco() {
  const escolhida = useSyncExternalStore(assinar, () => moedaAtual)
  const { data: cotacao } = useQuery({ queryKey: ['cotacao'], queryFn: api.cotacao, staleTime: 60 * 60_000, retry: false })
  // Sem cotação (API fora do ar), mostra em dólar
  const moeda: Moeda = escolhida === 'BRL' && !cotacao ? 'USD' : escolhida
  const taxa = moeda === 'BRL' ? cotacao!.usd_brl : 1

  return {
    moeda,
    escolhida,
    cotacao,
    // Valor em dólar -> texto na moeda escolhida
    formatar: (usd: number | null | undefined) => (usd == null ? '—' : FORMATOS[moeda].format(usd * taxa)),
    // Valor na moeda escolhida -> dólar (pros filtros da API)
    paraDolar: (valor: number) => valor / taxa,
  }
}
