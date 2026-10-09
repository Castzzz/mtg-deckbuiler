from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class Categoria(str, Enum):
    criatura = "criatura"
    instantanea = "instantanea"
    feitico = "feitico"
    artefato = "artefato"
    encantamento = "encantamento"
    planeswalker = "planeswalker"
    batalha = "batalha"
    terreno = "terreno"


class Carta(BaseModel):
    oracle_id: UUID
    nome: str
    custo_mana: str | None
    cmc: float
    tipo: str
    categoria: str
    texto: str | None
    identidade_cor: list[str]
    parceria: str | None = Field(description = "tipo de dupla de commanders que a carta forma (partner, background, ...)")
    imagem_url: str | None
    scryfall_uri: str | None
    preco_usd: float | None = Field(description = "edição mais barata, em dólar (TCGplayer, via Scryfall)")
    preco_eur: float | None = Field(description = "edição mais barata, em euro (Cardmarket, via Scryfall)")


class Commander(Carta):
    num_decks: int = Field(description = "decks desse commander na base")


class CartaImportada(Carta):
    legal: bool = Field(description = "legal em Commander (false = banida)")
    pode_ser_commander: bool


class PedidoNomes(BaseModel):
    nomes: list[str] = Field(min_length = 1, max_length = 300)


class PedidoIds(BaseModel):
    ids: list[UUID] = Field(min_length = 1, max_length = 300)


class Cotacao(BaseModel):
    usd_brl: float
    eur_brl: float
    atualizada_em: str


class Parceiro(Carta):
    decks_juntos: int = Field(description = "decks da base com essa dupla de commanders")


class Ordem(str, Enum):
    score = "score"        # sinergia + afinidade do grafo
    sinergia = "sinergia"  # como o "High Synergy" do EDHREC
    inclusao = "inclusao"  # as mais usadas, como o "Top Cards" do EDHREC
    estilo = "estilo"      # só no /recomendar: as que combinam com as cartas que já estão no deck


class Recomendacao(BaseModel):
    carta: Carta
    num_decks: int = Field(description = "decks desse commander que usam a carta")
    inclusao: float = Field(description = "fração dos decks desse commander que usam a carta")
    sinergia: float = Field(description = "inclusão no commander - inclusão geral nas cores da carta (estilo EDHREC)")
    afinidade: float = Field(description = "PageRank personalizado / PageRank global (1 = neutro)")
    score: float = Field(description = "combinação de sinergia e afinidade, de 0 a 1")


class RecomendacaoDeck(Recomendacao):
    estilo: float = Field(description = "inclusão nos decks parecidos com o do usuário - inclusão geral do commander")


class PedidoRecomendacao(BaseModel):
    commanders: list[UUID] = Field(min_length = 1, max_length = 2, description = "1 commander, ou 2 se forem partners")
    cartas: list[UUID] = Field(default = [], max_length = 250, description = "cartas que já estão no deck")
    categoria: Categoria | None = None
    ordem: Ordem = Field(default = Ordem.score, description = "score: melhores no geral; sinergia/inclusao: como o EDHREC; estilo: as que combinam com o deck atual")
    preco_max: float | None = Field(default = None, gt = 0, description = "só cartas até esse preço, em dólar")
    limite: int = Field(default = 50, ge = 1, le = 300)
