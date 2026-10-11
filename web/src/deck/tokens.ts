import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Carta, Categoria, Token } from '../api/tipos'
import type { Deck } from './armazenamento'

// Tokens que as cartas do deck criam (commanders incluídos). Ordena os ids pra não refazer a busca à toa
export function useTokensDoDeck(deck: Deck | undefined) {
  const ids = deck ? [...new Set([...deck.commanders, ...deck.cartas.map((c) => c.carta)].map((c) => c.oracle_id))].sort() : []
  return useQuery({
    queryKey: ['tokens-do-deck', ids],
    queryFn: () => api.tokensDoDeck(ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
  })
}

const CATEGORIAS: [string, Categoria][] = [
  ['Creature', 'criatura'], ['Land', 'terreno'], ['Artifact', 'artefato'], ['Enchantment', 'encantamento'], ['Planeswalker', 'planeswalker'],
]

// Na mesa o token anda como uma carta qualquer
export function cartaDoToken(token: Token): Carta {
  return {
    oracle_id: token.oracle_id,
    nome: token.nome,
    custo_mana: null,
    cmc: 0,
    tipo: token.tipo,
    categoria: CATEGORIAS.find(([tipo]) => token.tipo.includes(tipo))?.[1] ?? 'outro',
    texto: token.texto,
    identidade_cor: token.cores,
    parceria: null,
    imagem_url: token.imagem_url,
    scryfall_uri: null,
  }
}

// "Vampire 1/1", "Treasure", "Emblema de Elspeth"
export function descreverToken(token: Token): string {
  if (token.tipo.startsWith('Emblem')) return `Emblema${token.tipo.includes('—') ? ` de ${token.tipo.split('—')[1].trim()}` : ''}`
  // Token de duas faces iguais ("Clue // Clue") vira um nome só
  const nome = [...new Set(token.nome.split(' // '))].join(' // ')
  return token.poder != null ? `${nome} ${token.poder}/${token.resistencia}` : nome
}
