from fastapi import APIRouter, HTTPException, Request

from api.banco import COLUNAS_CARTA, pool
from api.modelos import Carta, PedidoRecomendacao, RecomendacaoDeck
from recomendador.score import recomendar_para_deck

router = APIRouter(tags = ["recomendar"])


@router.post("/recomendar", response_model = list[RecomendacaoDeck])
def recomendar(pedido: PedidoRecomendacao, request: Request):
    """Recomendações pro deck que está sendo montado, calculadas na hora.

    Diferente de `/commanders/{id}/recomendacoes`, leva em conta as cartas que já estão no deck:
    o PageRank se teletransporta pro commander *e* pra elas, então as sugestões acompanham
    o estilo que o deck está tomando. Com `ordem = estilo`, ordena pelas cartas que os decks
    parecidos com o do usuário (de qualquer commander nas mesmas cores) usam bem mais que a média.
    """
    grafo = request.app.state.grafo
    meta = request.app.state.meta_cartas

    commanders = [str(c) for c in pedido.commanders]
    desconhecidos = [c for c in commanders if c not in meta.index or not meta.at[c, "pode_ser_commander"]]
    if desconhecidos:
        raise HTTPException(422, f"Não são commanders válidos: {', '.join(desconhecidos)}")

    df = recomendar_para_deck(grafo, commanders, [str(c) for c in pedido.cartas])
    if df.empty:
        return []

    # Filtra pelo que não está no grafo (legalidade, categoria) usando os metadados em memória
    df = df.join(meta, on = "oracle_id", how = "inner")
    df = df[df["legal_commander"]]
    if pedido.categoria:
        df = df[df["categoria"] == pedido.categoria.value]
    df = df.sort_values(pedido.ordem.value, ascending = False).head(pedido.limite)

    with pool.connection() as conn:
        linhas = conn.execute(f"SELECT {COLUNAS_CARTA} FROM cartas c WHERE c.oracle_id = ANY(%s)",
                              (list(df["oracle_id"]),)).fetchall()
    cartas = {str(l["oracle_id"]): Carta(**l) for l in linhas}

    return [
        RecomendacaoDeck(carta = cartas[r.oracle_id], num_decks = r.num_decks, inclusao = r.inclusao,
                         sinergia = r.sinergia, afinidade = r.pagerank, score = r.score, estilo = r.estilo)
        for r in df.itertuples()
    ]
