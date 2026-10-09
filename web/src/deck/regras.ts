import type { Carta, Categoria } from '../api/tipos'
import type { CartaNoDeck, Deck, Origem } from './armazenamento'

export const TAMANHO_DECK = 100

const NUMEROS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

// Commander é singleton, com exceção dos básicos e das cartas que dizem quantas cópias pode ter
export function maxCopias(carta: Carta): number {
  if (carta.tipo.startsWith('Basic ')) return Infinity
  if (carta.texto?.includes('A deck can have any number of cards named')) return Infinity
  const ate = carta.texto?.match(/A deck can have up to (\w+) cards named/)  // Seven Dwarves, Nazgûl
  return ate ? (NUMEROS[ate[1].toLowerCase()] ?? Number(ate[1])) || 1 : 1
}

export function podeRepetir(carta: Carta): boolean {
  return maxCopias(carta) > 1
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

// Devolve a mesma lista (===) se não der pra adicionar: já tem o máximo de cópias
export function adicionar(cartas: CartaNoDeck[], carta: Carta, origem?: Origem): CartaNoDeck[] {
  const atual = cartas.find((c) => c.carta.oracle_id === carta.oracle_id)
  if (!atual) return [...cartas, { carta, qtd: 1, origem }]
  if (atual.qtd >= maxCopias(carta)) return cartas
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

export interface Problema {
  grave: boolean // grave: o deck não é legal; senão é só um aviso
  texto: string
  cartas?: string[]
}

// Faixa de terrenos que costuma funcionar em Commander, pra orientar quem está começando
export const TERRENOS_MIN = 35
export const TERRENOS_MAX = 38

// Checagem rápida: o que impede o deck de ser legal em Commander, e alguns avisos pra quem está começando
export function validar(deck: Deck): Problema[] {
  const problemas: Problema[] = []
  const total = totalCartas(deck)
  if (total < TAMANHO_DECK) problemas.push({ grave: true, texto: `Faltam ${TAMANHO_DECK - total} cartas pra chegar em ${TAMANHO_DECK}` })
  if (total > TAMANHO_DECK) problemas.push({ grave: true, texto: `${total - TAMANHO_DECK} cartas a mais: o deck tem que ter exatamente ${TAMANHO_DECK}` })

  const identidade = new Set(identidadeDeck(deck))
  const fora = deck.cartas.filter((c) => c.carta.identidade_cor.some((cor) => !identidade.has(cor)))
  if (fora.length) problemas.push({ grave: true, texto: 'Fora das cores do commander', cartas: fora.map((c) => c.carta.nome) })

  const banidas = [...deck.commanders, ...deck.cartas.map((c) => c.carta)].filter((c) => c.legal === false)
  if (banidas.length) problemas.push({ grave: true, texto: 'Banidas em Commander', cartas: banidas.map((c) => c.nome) })

  const copias = deck.cartas.filter((c) => c.qtd > maxCopias(c.carta))
  if (copias.length) {
    problemas.push({ grave: true, texto: 'Cópias a mais do que a carta permite', cartas: copias.map((c) => `${c.carta.nome} (${c.qtd}x)`) })
  }

  const terrenos = deck.cartas.filter((c) => c.carta.categoria === 'terreno').reduce((s, c) => s + c.qtd, 0)
  if (total >= 60 && (terrenos < TERRENOS_MIN - 3 || terrenos > TERRENOS_MAX + 4)) {
    problemas.push({ grave: false, texto: `${terrenos} terrenos: a maioria dos decks usa entre ${TERRENOS_MIN} e ${TERRENOS_MAX}` })
  }
  return problemas
}
