import type { Carta, Recomendacao } from '../api/tipos'
import { usePreco } from '../preco'
import { ImagemCarta } from './ImagemCarta'

const pct = (x: number) => `${Math.round(x * 100)}%`

export function CartaRecomendada({ rec, onAdicionar }: { rec: Recomendacao; onAdicionar?: (carta: Carta) => void }) {
  const { carta } = rec
  const { formatar } = usePreco()
  const imagem = <ImagemCarta carta={carta} className="shadow-lg shadow-black/40 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-ouro/20" />

  return (
    <div className="group">
      {onAdicionar ? (
        <button onClick={() => onAdicionar(carta)} className="relative block w-full" title={`Adicionar ${carta.nome} ao deck`}>
          {imagem}
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ouro px-3 py-1 text-xs font-semibold text-fundo opacity-0 shadow-lg transition group-hover:opacity-100">
            + Adicionar
          </span>
        </button>
      ) : (
        <a href={carta.scryfall_uri ?? undefined} target="_blank" rel="noreferrer" className="block">{imagem}</a>
      )}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-ouro-forte">{carta.nome}</span>
        <span className="shrink-0 text-xs tabular-nums text-apagado" title="edição mais barata">{formatar(carta.preco_usd)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="text-apagado" title={`${rec.num_decks} decks desse commander usam a carta`}>{pct(rec.inclusao)} dos decks</span>
        <span
          title="sinergia: quanto mais esse commander usa a carta do que os outros decks das mesmas cores"
          className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${rec.sinergia > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-painel-2 text-apagado'}`}
        >
          {rec.sinergia > 0 ? '+' : ''}{pct(rec.sinergia)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-painel-2">
        <div className="h-full rounded-full bg-ouro/70" style={{ width: pct(rec.inclusao) }} />
      </div>
    </div>
  )
}
