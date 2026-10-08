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


class Commander(Carta):
    num_decks: int = Field(description = "decks desse commander na base")


class Parceiro(Carta):
    decks_juntos: int = Field(description = "decks da base com essa dupla de commanders")


class Ordem(str, Enum):
    score = "score"
    estilo = "estilo"


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
    ordem: Ordem = Field(default = Ordem.score, description = "score: melhores no geral; estilo: as que combinam com o deck atual")
    limite: int = Field(default = 50, ge = 1, le = 300)
