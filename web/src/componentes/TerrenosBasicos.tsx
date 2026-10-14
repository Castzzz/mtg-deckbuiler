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

  // Barra em cima da lista do deck: cada básico da identidade com − e +, e o total deles
  const total = cartas.filter((c) => c.carta.tipo.startsWith('Basic ')).reduce((s, c) => s + c.qtd, 0)
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-borda bg-painel px-3 py-2">
      <span className="text-sm font-medium">
        Terrenos básicos <span className="text-xs font-normal tabular-nums text-apagado">{total}</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {cores.map((cor, i) => {
          const carta = basicos[i].data
          const qtd = cartas.find((c) => c.carta.oracle_id === carta?.oracle_id)?.qtd ?? 0
          return (
            <div key={cor} className="flex items-center gap-0.5 rounded-md border border-borda bg-fundo px-1 py-0.5" title={BASICOS[cor]}>
              <button disabled={!carta || !qtd} onClick={() => onMenos(carta!)} className="h-6 w-6 rounded text-apagado hover:bg-painel-2 hover:text-texto disabled:opacity-30" aria-label={`Menos um ${BASICOS[cor]}`}>−</button>
              <SimboloMana simbolo={cor} tamanho={16} />
              <span className="w-6 text-center text-sm tabular-nums">{qtd}</span>
              <button disabled={!carta} onClick={() => onMais(carta!)} className="h-6 w-6 rounded text-apagado hover:bg-painel-2 hover:text-texto disabled:opacity-30" aria-label={`Mais um ${BASICOS[cor]}`}>+</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
