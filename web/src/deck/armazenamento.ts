import { useSyncExternalStore } from 'react'
import type { Carta } from '../api/tipos'

// Por enquanto os decks ficam só no navegador (localStorage)

export interface CartaNoDeck {
  carta: Carta
  qtd: number
}

export interface Deck {
  id: string
  nome: string
  commanders: Carta[]
  cartas: CartaNoDeck[]
  criadoEm: string
  atualizadoEm: string
}

const CHAVE = 'mtg-deckbuilder:decks'
const ouvintes = new Set<() => void>()
let cache: Deck[] | null = null

function ler(): Deck[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
  } catch {
    cache = []
  }
  return cache!
}

function gravar(decks: Deck[]) {
  cache = decks
  try {
    localStorage.setItem(CHAVE, JSON.stringify(decks))
  } catch {
    // modo privado / armazenamento cheio: continua funcionando só na memória
  }
  ouvintes.forEach((f) => f())
}

// Outra aba mexeu nos decks
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE) {
    cache = null
    ouvintes.forEach((f) => f())
  }
})

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export function useDecks(): Deck[] {
  return useSyncExternalStore(assinar, ler)
}

export function useDeck(id: string): Deck | undefined {
  return useDecks().find((d) => d.id === id)
}

// "Tymna the Weaver" -> "Tymna", "Atraxa, Praetors' Voice" -> "Atraxa"
export function nomeCurto(carta: Carta): string {
  return carta.nome.split(' // ')[0].split(/,| the | of /)[0]
}

export function criarDeck(commanders: Carta[], cartas: CartaNoDeck[] = [], nome?: string): Deck {
  const agora = new Date().toISOString()
  const deck: Deck = {
    id: crypto.randomUUID(),
    nome: nome || commanders.map(nomeCurto).join(' + '),
    commanders,
    cartas,
    criadoEm: agora,
    atualizadoEm: agora,
  }
  gravar([deck, ...ler()])
  return deck
}

export function atualizarDeck(id: string, mudar: (deck: Deck) => Partial<Deck>) {
  gravar(ler().map((d) => (d.id === id ? { ...d, ...mudar(d), atualizadoEm: new Date().toISOString() } : d)))
}

export function apagarDeck(id: string) {
  gravar(ler().filter((d) => d.id !== id))
}
