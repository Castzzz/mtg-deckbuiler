// Espelha os modelos de api/modelos.py

export type Categoria =
  | 'criatura' | 'instantanea' | 'feitico' | 'artefato'
  | 'encantamento' | 'planeswalker' | 'batalha' | 'terreno'

// score: sinergia + grafo; sinergia/inclusao: como o EDHREC; estilo: o que combina com o deck atual
export type Ordem = 'score' | 'sinergia' | 'inclusao' | 'estilo'

export interface Carta {
  oracle_id: string
  nome: string
  custo_mana: string | null
  cmc: number
  tipo: string
  categoria: Categoria | 'outro'
  texto: string | null
  identidade_cor: string[]
  parceria: string | null
  imagem_url: string | null
  scryfall_uri: string | null
}

export interface Commander extends Carta {
  num_decks: number
}

export interface Parceiro extends Carta {
  decks_juntos: number
}

export interface Recomendacao {
  carta: Carta
  num_decks: number
  inclusao: number
  sinergia: number
  afinidade: number
  score: number
}
