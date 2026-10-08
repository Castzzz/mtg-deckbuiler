import type { Carta, Categoria } from '../api/tipos'
import type { CartaNoDeck, Deck } from './armazenamento'

export const TAMANHO_DECK = 100

// Commander é singleton, com exceção dos básicos e das cartas que dizem que pode ter quantas quiser
export function podeRepetir(carta: Carta): boolean {
  return carta.tipo.startsWith('Basic ') || !!carta.texto?.includes('A deck can have any number of cards named')
}

export function totalCartas(deck: Deck): number {
  return deck.commanders.length + deck.cartas.reduce((soma, c) => soma + c.qtd, 0)
}

export function identidadeDeck(deck: Deck): string[] {
  return [...new Set(deck.commanders.flatMap((c) => c.identidade_cor))]
}

export function adicionar(cartas: CartaNoDeck[], carta: Carta): CartaNoDeck[] {
  const atual = cartas.find((c) => c.carta.oracle_id === carta.oracle_id)
  if (!atual) return [...cartas, { carta, qtd: 1 }]
  if (!podeRepetir(carta)) return cartas
  return cartas.map((c) => (c === atual ? { ...c, qtd: c.qtd + 1 } : c))
}

export function remover(cartas: CartaNoDeck[], oracleId: string, tudo = false): CartaNoDeck[] {
  return cartas
    .map((c) => (c.carta.oracle_id === oracleId ? { ...c, qtd: tudo ? 0 : c.qtd - 1 } : c))
    .filter((c) => c.qtd > 0)
}

export const GRUPOS: { categoria: Categoria | 'outro'; rotulo: string }[] = [
  { categoria: 'criatura', rotulo: 'Criaturas' },
  { categoria: 'planeswalker', rotulo: 'Planeswalkers' },
  { categoria: 'instantanea', rotulo: 'Instantâneas' },
  { categoria: 'feitico', rotulo: 'Feitiços' },
  { categoria: 'artefato', rotulo: 'Artefatos' },
  { categoria: 'encantamento', rotulo: 'Encantamentos' },
  { categoria: 'batalha', rotulo: 'Batalhas' },
  { categoria: 'terreno', rotulo: 'Terrenos' },
  { categoria: 'outro', rotulo: 'Outros' },
]

export function agrupar(cartas: CartaNoDeck[]) {
  return GRUPOS.map((g) => ({
    ...g,
    cartas: cartas
      .filter((c) => c.carta.categoria === g.categoria)
      .sort((a, b) => a.carta.cmc - b.carta.cmc || a.carta.nome.localeCompare(b.carta.nome)),
  })).filter((g) => g.cartas.length)
}

// Formato "1 Nome" aceito no import do Moxfield e do Archidekt; commanders primeiro
export function exportarTexto(deck: Deck): string {
  const linhas = [
    ...deck.commanders.map((c) => `1 ${c.nome}`),
    ...[...deck.cartas].sort((a, b) => a.carta.nome.localeCompare(b.carta.nome)).map((c) => `${c.qtd} ${c.carta.nome}`),
  ]
  return linhas.join('\n')
}
