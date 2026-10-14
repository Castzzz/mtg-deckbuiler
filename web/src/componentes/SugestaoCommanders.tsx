import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Carta } from '../api/tipos'
import type { CartaNoDeck } from '../deck/armazenamento'
import { ehBasico } from '../deck/regras'
import { IdentidadeCor } from './Simbolos'

interface Props {
  cartas: CartaNoDeck[]
  onEscolher: (commander: Carta) => void
}

// Deck montado sem commander: quem mais combina com as cartas que já estão nele (pelos decks da base)
export function SugestaoCommanders({ cartas, onEscolher }: Props) {
  const ids = cartas.filter((c) => !ehBasico(c.carta)).map((c) => c.carta.oracle_id).sort()
  const { data: sugestoes = [], isFetching, isError } = useQuery({
    queryKey: ['sugerir-commanders', ids],
    queryFn: () => api.sugerirCommanders(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,  // não pisca a lista a cada carta adicionada
    staleTime: Infinity,
  })

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Commanders que combinam</h3>
        {isFetching && <span className="text-xs text-apagado">calculando...</span>}
      </div>
      {!ids.length ? (
        <p className="mt-1 text-xs text-apagado">Coloque algumas cartas no deck e eu sugiro commanders que costumam jogar com elas.</p>
      ) : isError ? (
        <p className="mt-1 text-xs text-red-300">Não deu pra calcular as sugestões agora.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-apagado">Pelos decks da base que usam as suas cartas. Clique pra definir.</p>
          <ul className="mt-2 space-y-1">
            {sugestoes.map((c) => (
              <li key={c.oracle_id}>
                <button
                  onClick={() => onEscolher(c)}
                  title={`Definir ${c.nome} como commander`}
                  className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-painel-2"
                >
                  {c.imagem_url && (
                    // Recorte da arte: a parte de cima da imagem da carta
                    <div className="h-9 w-12 shrink-0 overflow-hidden rounded">
                      <img src={c.imagem_url} alt="" loading="lazy" className="w-full -translate-y-[18%]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">{c.nome}</div>
                    <div className="mt-0.5 text-xs text-apagado">
                      {c.fora_das_cores
                        ? <span className="text-amber-200">{c.fora_das_cores} carta{c.fora_das_cores > 1 ? 's' : ''} fora das cores</span>
                        : <span title="Cartas do seu deck que estão em pelo menos 20% dos decks dele">{c.em_comum}/{ids.length} cartas</span>}
                      {' · '}{c.num_decks.toLocaleString('pt-BR')} decks
                    </div>
                  </div>
                  <IdentidadeCor cores={c.identidade_cor} tamanho={14} />
                </button>
              </li>
            ))}
            {!sugestoes.length && !isFetching && <li className="text-xs text-apagado">Nenhum commander da base joga com essas cartas.</li>}
          </ul>
        </>
      )}
    </div>
  )
}
