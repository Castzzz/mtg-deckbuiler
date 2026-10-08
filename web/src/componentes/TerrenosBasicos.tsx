import { useQueries } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Carta } from '../api/tipos'
import type { CartaNoDeck } from '../deck/armazenamento'
import { SimboloMana } from './Simbolos'

const BASICOS: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' }

interface Props {
  identidade: string[]
  cartas: CartaNoDeck[]
  onMais: (carta: Carta) => void
  onMenos: (carta: Carta) => void
}

export function TerrenosBasicos({ identidade, cartas, onMais, onMenos }: Props) {
  const cores = identidade.length ? 'WUBRG'.split('').filter((c) => identidade.includes(c)) : ['C']
  const basicos = useQueries({
    queries: cores.map((cor) => ({
      queryKey: ['basico', cor],
      queryFn: async () => (await api.buscarCartas(BASICOS[cor])).find((c) => c.nome === BASICOS[cor]) ?? null,
      staleTime: Infinity,
    })),
  })

  return (
    <div>
      <h3 className="text-sm font-semibold">Terrenos básicos</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {cores.map((cor, i) => {
          const carta = basicos[i].data
          const qtd = cartas.find((c) => c.carta.oracle_id === carta?.oracle_id)?.qtd ?? 0
          return (
            <div key={cor} className="flex items-center gap-1 rounded-lg border border-borda bg-fundo px-1.5 py-1" title={BASICOS[cor]}>
              <button disabled={!carta || !qtd} onClick={() => onMenos(carta!)} className="h-6 w-6 rounded text-apagado hover:bg-painel-2 hover:text-texto disabled:opacity-30" aria-label={`Menos um ${BASICOS[cor]}`}>−</button>
              <SimboloMana simbolo={cor} tamanho={16} />
              <span className="w-5 text-center text-sm tabular-nums">{qtd}</span>
              <button disabled={!carta} onClick={() => onMais(carta!)} className="h-6 w-6 rounded text-apagado hover:bg-painel-2 hover:text-texto disabled:opacity-30" aria-label={`Mais um ${BASICOS[cor]}`}>+</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
