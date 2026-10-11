import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { IdentidadeCor } from '../componentes/Simbolos'
import { useDecks } from '../deck/armazenamento'
import { comArte, identidadeDeck, TAMANHO_DECK, totalCartas } from '../deck/regras'
import { paletaDoDeck } from '../tema'

export function MeusDecks() {
  const decks = useDecks()

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-destaque-forte">Meus decks</h1>
          <p className="mt-1 text-sm text-apagado">Os decks ficam salvos neste navegador.</p>
        </div>
        <Link to="/importar" className="ml-auto rounded-lg border border-destaque/50 px-4 py-2 text-sm font-medium text-destaque-forte hover:bg-destaque/10">
          Importar lista
        </Link>
      </div>

      {!decks.length && (
        <div className="mt-10 rounded-2xl border border-dashed border-borda p-10 text-center text-apagado">
          Nenhum deck ainda. <Link to="/" className="text-destaque hover:underline">Escolha um commander</Link> pra começar.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((d) => (
          // Cada deck com as cores do próprio commander (as variáveis valem só dentro do cartão)
          <Link
            key={d.id}
            to={`/deck/${d.id}`}
            style={d.commanders.length ? (paletaDoDeck(identidadeDeck(d)) as CSSProperties) : undefined}
            className="painel-tingido group relative flex gap-4 overflow-hidden rounded-2xl border border-borda p-4 pt-5 transition hover:-translate-y-0.5 hover:border-destaque/60"
          >
            <div aria-hidden className="faixa-cores absolute inset-x-0 top-0 h-1" />
            <div className="flex shrink-0">
              {d.commanders.map((c, i) => <ImagemCarta key={c.oracle_id} carta={comArte(d, c)} className={`w-16 shadow-lg shadow-black/50 ${i ? '-ml-8 mt-3' : ''}`} />)}
              {!d.commanders.length && (
                <div className="flex aspect-[63/88] w-16 items-center justify-center rounded-md border-2 border-dashed border-red-400/40 text-2xl text-red-300/60">?</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-titulo font-semibold group-hover:text-destaque-forte">{d.nome}</div>
              <div className="mt-1"><IdentidadeCor cores={identidadeDeck(d)} tamanho={14} /></div>
              <div className="mt-2 text-sm text-apagado">
                {totalCartas(d)}/{TAMANHO_DECK} cartas{!d.commanders.length && <span className="text-red-300"> · sem commander</span>}
              </div>
              <div className="text-xs text-apagado">editado em {new Date(d.atualizadoEm).toLocaleDateString('pt-BR')}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
