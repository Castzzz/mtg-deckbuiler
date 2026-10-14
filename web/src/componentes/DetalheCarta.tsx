import { useEffect } from 'react'
import type { Carta, Edicao } from '../api/tipos'
import type { Deck } from '../deck/armazenamento'
import { type AcaoCommander, comArte, maxCopias, opcoesCommander, type Secao, SECOES } from '../deck/regras'
import { usePreco } from '../preco'
import { GradeEdicoes } from './GradeEdicoes'
import { ImagemCarta } from './ImagemCarta'
import { CustoMana } from './Simbolos'

interface Props {
  deck: Deck
  carta: Carta
  qtd: number           // 0 pros commanders (não estão no deck principal)
  ehCommander: boolean
  secao: Secao          // onde a carta está (deck, sideboard, maybeboard)
  onFechar: () => void
  onMais: (carta: Carta) => void
  onMenos: (carta: Carta) => void
  onTirar: (carta: Carta) => void
  onArte: (carta: Carta, edicao: Edicao | null) => void
  onCommander: (carta: Carta, acao: AcaoCommander) => void
  onTirarDoCommander: (carta: Carta) => void
  onMover: (carta: Carta, para: Secao) => void
}

const ONDE: Record<Secao, string> = { cartas: 'do deck', sideboard: 'do sideboard', maybeboard: 'do maybeboard' }
const PARA: Record<Secao, string> = { cartas: 'Pro deck', sideboard: 'Pro sideboard', maybeboard: 'Pro maybeboard' }

// Popup ao clicar numa carta do deck: informações, quantidade, commander e troca de arte
export function DetalheCarta({ deck, carta, qtd, ehCommander, secao, onFechar, onMais, onMenos, onTirar, onArte, onCommander, onTirarDoCommander, onMover }: Props) {
  const { formatar } = usePreco()
  const visivel = comArte(deck, carta)
  const arte = deck.artes?.[carta.oracle_id]
  const maximo = maxCopias(carta)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-8" onClick={onFechar}>
      <div className="relative w-full max-w-5xl rounded-lg border border-borda bg-painel p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onFechar} className="absolute right-3 top-3 rounded-lg px-3 py-1 text-apagado hover:bg-painel-2 hover:text-texto" aria-label="Fechar">✕</button>

        <div className="grid gap-6 sm:grid-cols-[240px_minmax(0,1fr)]">
          <ImagemCarta carta={visivel} className="mx-auto w-56 shadow-2xl shadow-black/60 sm:w-full" />

          <div className="min-w-0">
            {ehCommander && <span className="text-xs font-semibold uppercase tracking-wider text-destaque">Commander</span>}
            {secao !== 'cartas' && <span className="text-xs font-semibold uppercase tracking-wider text-destaque">{SECOES.find((s) => s.secao === secao)!.rotulo}</span>}
            <h2 className="pr-10 font-titulo text-2xl font-bold text-texto">{carta.nome}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-apagado">
              <span className="shrink-0"><CustoMana custo={carta.custo_mana} /></span>
              <span>{carta.tipo}</span>
            </div>
            {carta.texto && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-texto/90">{carta.texto}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="font-semibold">{formatar(visivel.preco_usd)}</span>
                <span className="text-apagado"> {arte ? `(${arte.nome_edicao})` : '(edição mais barata)'}</span>
              </span>
              {carta.legal === false && <span className="font-semibold text-red-300">Banida em Commander</span>}
              {carta.scryfall_uri && <a href={carta.scryfall_uri} target="_blank" rel="noreferrer" className="text-apagado underline hover:text-texto">Ver no Scryfall</a>}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {!ehCommander && maximo > 1 && (
                <div className="flex items-center gap-1 rounded-lg border border-borda bg-fundo px-1 py-1">
                  <button onClick={() => onMenos(carta)} className="h-7 w-7 rounded text-apagado hover:bg-painel-2 hover:text-texto" aria-label="Menos uma cópia">−</button>
                  <span className="w-12 text-center text-sm tabular-nums">{qtd}{maximo !== Infinity && `/${maximo}`}</span>
                  <button onClick={() => onMais(carta)} disabled={qtd >= maximo} className="h-7 w-7 rounded text-apagado hover:bg-painel-2 hover:text-texto disabled:opacity-30" aria-label="Mais uma cópia">+</button>
                </div>
              )}
              {secao === 'cartas' && !ehCommander && opcoesCommander(deck, carta).map((o) => (
                <button key={o.acao} onClick={() => onCommander(carta, o.acao)} className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-fundo hover:bg-destaque-forte">
                  {o.rotulo}
                </button>
              ))}
              {ehCommander ? (
                <button onClick={() => onTirarDoCommander(carta)} className="rounded-lg border border-borda px-4 py-2 text-sm hover:bg-painel-2">
                  Deixar de ser commander (volta pro deck)
                </button>
              ) : (
                <>
                  {SECOES.filter((s) => s.secao !== secao).map((s) => (
                    <button key={s.secao} onClick={() => onMover(carta, s.secao)} className="rounded-lg border border-borda px-4 py-2 text-sm hover:bg-painel-2">
                      {PARA[s.secao]}
                    </button>
                  ))}
                  <button onClick={() => onTirar(carta)} className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10">
                    Tirar {ONDE[secao]}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-borda pt-5">
          <GradeEdicoes carta={carta} atual={arte} onEscolher={(e) => onArte(carta, e)} />
        </div>
      </div>
    </div>
  )
}
