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
  // Edição mais barata. Opcional: decks salvos antes dos preços não têm
  preco_usd?: number | null
  preco_eur?: number | null
  legal?: boolean // false = banida em Commander (opcional pelo mesmo motivo)
  pode_ser_commander?: boolean
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

// Carta vinda da API agora (o import precisa desses campos; decks antigos podem não ter)
export type CartaImportada = Carta & { legal: boolean; pode_ser_commander: boolean }

export interface Cotacao {
  usd_brl: number
  eur_brl: number
  atualizada_em: string
}

export interface ComboBracket {
  cartas: string[]
  resultado: string[]
  duas_cartas: boolean
  turnos_extras: boolean
  link: string
}

export interface Bracket {
  bracket: number // o menor em que o deck cabe: 2 = "1 ou 2", 4 = "4 ou 5"
  motivos: string[]
  game_changers: string[]
  terrenos_em_massa: string[]
  turnos_extras: string[]
  combos: ComboBracket[]
  verificado: boolean
}

export interface Edicao {
  scryfall_id: string
  edicao: string // código da coleção, ex: "c21"
  nome_edicao: string
  numero: string
  lancamento: string | null
  imagem_url: string
  preco_usd: number | null
  preco_eur: number | null
}

export interface Token {
  oracle_id: string
  nome: string
  tipo: string // ex: "Token Creature — Zombie", "Emblem — Liliana"
  texto: string | null
  poder: string | null
  resistencia: string | null
  cores: string[]
  imagem_url: string | null
}

export interface TokenDoDeck {
  token: Token
  criado_por: string[] // cartas do deck que criam
}
