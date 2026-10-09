import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../api/cliente'
import type { Carta, Edicao } from '../api/tipos'
import { usePreco } from '../preco'

interface Props {
  carta: Carta
  atual?: Edicao
  onEscolher: (edicao: Edicao | null) => void  // null = volta pra arte padrão
  onFechar: () => void
}

export function SeletorArte({ carta, atual, onEscolher, onFechar }: Props) {
  const { formatar } = usePreco()
  const { data: edicoes, isPending, isError } = useQuery({ queryKey: ['edicoes', carta.oracle_id], queryFn: () => api.edicoes(carta.oracle_id) })

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-10" onClick={onFechar}>
      <div className="w-full max-w-5xl rounded-2xl border border-borda bg-painel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-titulo text-xl font-semibold">Arte de {carta.nome}</h2>
          {edicoes && <span className="text-sm text-apagado">{edicoes.length} edições</span>}
          {atual && (
            <button onClick={() => onEscolher(null)} className="ml-auto rounded-lg border border-borda px-3 py-1 text-sm hover:bg-painel-2">
              Voltar pra padrão
            </button>
          )}
          <button onClick={onFechar} className={`${atual ? '' : 'ml-auto'} rounded-lg px-3 py-1 text-apagado hover:bg-painel-2 hover:text-texto`} aria-label="Fechar">✕</button>
        </div>
        {isError && <p className="mt-4 text-apagado">Não consegui carregar as edições.</p>}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {isPending && Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-painel-2" />)}
          {edicoes?.map((e) => {
            const escolhida = atual?.scryfall_id === e.scryfall_id
            return (
              <button key={e.scryfall_id} onClick={() => onEscolher(e)} className="group text-left">
                <div className={`aspect-[63/88] overflow-hidden rounded-[4.75%/3.5%] transition group-hover:-translate-y-1 ${escolhida ? 'ring-2 ring-ouro' : 'group-hover:ring-2 group-hover:ring-ouro/50'}`}>
                  <img src={e.imagem_url} alt={`${carta.nome} (${e.nome_edicao})`} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className="mt-2 truncate text-sm font-medium" title={e.nome_edicao}>{e.nome_edicao}</div>
                <div className="flex gap-2 text-xs text-apagado">
                  <span className="min-w-0 truncate">{e.edicao.toUpperCase()} #{e.numero}{e.lancamento && ` · ${e.lancamento.slice(0, 4)}`}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{formatar(e.preco_usd)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
