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

// A carta com a arte que o usuário escolheu (imagem e preço daquela edição)
export function comArte(deck: Deck, carta: Carta): Carta {
  const arte = deck.artes?.[carta.oracle_id]
  return arte ? { ...carta, imagem_url: arte.imagem_url, preco_usd: arte.preco_usd, preco_eur: arte.preco_eur } : carta
}

// Soma em dólar: a edição escolhida, ou a mais barata; `semPreco` conta as cartas que o Scryfall não tem preço
export function precoDeck(deck: Deck): { total: number; semPreco: number } {
  const todas = [...deck.commanders.map((carta) => ({ carta, qtd: 1 })), ...deck.cartas]
    .map((c) => ({ ...c, carta: comArte(deck, c.carta) }))
  return {
    total: todas.reduce((s, c) => s + (c.carta.preco_usd ?? 0) * c.qtd, 0),
    semPreco: todas.filter((c) => c.carta.preco_usd == null).length,
  }
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

// Formato "1 Nome (EDIÇÃO) número" aceito no import do Moxfield e do Archidekt; commanders primeiro.
// A edição só vai quando o usuário escolheu a arte.
export function exportarTexto(deck: Deck): string {
  const linha = (carta: Carta, qtd: number) => {
    const arte = deck.artes?.[carta.oracle_id]
    return `${qtd} ${carta.nome}${arte ? ` (${arte.edicao.toUpperCase()}) ${arte.numero}` : ''}`
  }
  return [
    ...deck.commanders.map((c) => linha(c, 1)),
    ...[...deck.cartas].sort((a, b) => a.carta.nome.localeCompare(b.carta.nome)).map((c) => linha(c.carta, c.qtd)),
  ].join('\n')
}
