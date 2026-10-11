import { Link, useParams } from 'react-router-dom'
import { Tabuleiro } from '../componentes/Tabuleiro'
import { useDeck } from '../deck/armazenamento'
import { TAMANHO_MAO } from '../deck/mao'

export function TestarMao() {
  const { id = '' } = useParams()
  const deck = useDeck(id)
  if (!deck) {
    return (
      <div className="py-20 text-center text-apagado">
        Deck não encontrado neste navegador. <Link to="/decks" className="text-destaque hover:underline">Ver meus decks</Link>
      </div>
    )
  }
  if (deck.cartas.reduce((s, c) => s + c.qtd, 0) < TAMANHO_MAO) {
    return (
      <div className="py-20 text-center text-apagado">
        Coloque pelo menos {TAMANHO_MAO} cartas no deck pra testar. <Link to={`/deck/${deck.id}`} className="text-destaque hover:underline">Voltar pro deck</Link>
      </div>
    )
  }
  return <Tabuleiro deck={deck} />
}
