import { Link } from 'react-router-dom'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { IdentidadeCor } from '../componentes/Simbolos'
import { useDecks } from '../deck/armazenamento'
import { identidadeDeck, TAMANHO_DECK, totalCartas } from '../deck/regras'

export function MeusDecks() {
  const decks = useDecks()

  return (
    <section className="mt-8">
      <h1 className="font-titulo text-2xl font-bold text-ouro-forte">Meus decks</h1>
      <p className="mt-1 text-sm text-apagado">Os decks ficam salvos neste navegador.</p>

      {!decks.length && (
        <div className="mt-10 rounded-2xl border border-dashed border-borda p-10 text-center text-apagado">
          Nenhum deck ainda. <Link to="/" className="text-ouro hover:underline">Escolha um commander</Link> pra começar.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((d) => (
          <Link key={d.id} to={`/deck/${d.id}`} className="group flex gap-4 rounded-2xl border border-borda bg-painel p-4 transition hover:border-ouro/50">
            <div className="flex shrink-0">
              {d.commanders.map((c, i) => <ImagemCarta key={c.oracle_id} carta={c} className={`w-16 shadow-lg shadow-black/50 ${i ? '-ml-8 mt-3' : ''}`} />)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-titulo font-semibold group-hover:text-ouro-forte">{d.nome}</div>
              <div className="mt-1"><IdentidadeCor cores={identidadeDeck(d)} tamanho={14} /></div>
              <div className="mt-2 text-sm text-apagado">{totalCartas(d)}/{TAMANHO_DECK} cartas</div>
              <div className="text-xs text-apagado">editado em {new Date(d.atualizadoEm).toLocaleDateString('pt-BR')}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
