import type { Recomendacao } from '../api/tipos'
import { ImagemCarta } from './ImagemCarta'

const pct = (x: number) => `${Math.round(x * 100)}%`

export function CartaRecomendada({ rec }: { rec: Recomendacao }) {
  const { carta } = rec
  return (
    <a href={carta.scryfall_uri ?? undefined} target="_blank" rel="noreferrer" className="group block">
      <ImagemCarta carta={carta} className="shadow-lg shadow-black/40 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-ouro/20" />
      <div className="mt-2 truncate text-sm font-medium group-hover:text-ouro-forte">{carta.nome}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="text-apagado" title="dos decks desse commander usam a carta">{pct(rec.inclusao)} dos decks</span>
        <span
          title="sinergia: quanto mais esse commander usa a carta do que os outros decks das mesmas cores"
          className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${rec.sinergia > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-painel-2 text-apagado'}`}
        >
          {rec.sinergia > 0 ? '+' : ''}{pct(rec.sinergia)}
        </span>
      </div>
      {/* barra de inclusão */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-painel-2">
        <div className="h-full rounded-full bg-ouro/70" style={{ width: pct(rec.inclusao) }} />
      </div>
    </a>
  )
}
