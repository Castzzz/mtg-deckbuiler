import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Carta, Edicao } from '../api/tipos'
import { usePreco } from '../preco'

interface Props {
  carta: Carta
  atual?: Edicao
  onEscolher: (edicao: Edicao | null) => void  // null = volta pra arte padrão
}

// Todas as edições da carta, pra escolher a arte
export function GradeEdicoes({ carta, atual, onEscolher }: Props) {
  const { formatar } = usePreco()
  const { data: edicoes, isPending, isError } = useQuery({ queryKey: ['edicoes', carta.oracle_id], queryFn: () => api.edicoes(carta.oracle_id) })

  return (
    <div>
      <div className="flex items-center gap-3">
        <h3 className="font-titulo text-lg font-semibold">Arte</h3>
        {edicoes && <span className="text-sm text-apagado">{edicoes.length} edições</span>}
        {atual && (
          <button onClick={() => onEscolher(null)} className="ml-auto rounded-lg border border-borda px-3 py-1 text-sm hover:bg-painel-2">
            Voltar pra padrão
          </button>
        )}
      </div>
      {isError && <p className="mt-3 text-apagado">Não consegui carregar as edições.</p>}
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {isPending && Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-painel-2" />)}
        {edicoes?.map((e) => {
          const escolhida = atual?.scryfall_id === e.scryfall_id
          return (
            <button key={e.scryfall_id} onClick={() => onEscolher(e)} className="group text-left" title={`${e.nome_edicao} (${e.edicao.toUpperCase()} #${e.numero})`}>
              <div className={`aspect-[63/88] overflow-hidden rounded-[4.75%/3.5%] transition group-hover:-translate-y-0.5 ${escolhida ? 'ring-2 ring-ouro' : 'group-hover:ring-2 group-hover:ring-ouro/50'}`}>
                <img src={e.imagem_url} alt={`${carta.nome} (${e.nome_edicao})`} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="mt-1 truncate text-xs font-medium">{e.nome_edicao}</div>
              <div className="flex gap-2 text-[11px] text-apagado">
                <span className="min-w-0 truncate">{e.edicao.toUpperCase()}{e.lancamento && ` · ${e.lancamento.slice(0, 4)}`}</span>
                <span className="ml-auto shrink-0 tabular-nums">{formatar(e.preco_usd)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
