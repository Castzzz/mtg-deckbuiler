import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/cliente'
import { fazemDupla } from '../api/parceria'
import type { Carta } from '../api/tipos'
import { CustoMana } from './Simbolos'
import { useDebounce } from './useDebounce'

interface Props {
  commanders: Carta[]
  identidade: string[]  // do deck, pra marcar o que está fora das cores
  onAdicionar: (carta: Carta) => void
}

// Adiciona qualquer carta pelo nome. Não filtra pela cor: o que estiver fora das cores do commander vem
// marcado (e o deck aponta o problema), e um parceiro do commander dá pra achar e pôr no deck pra depois
// virar a dupla
export function BuscaCarta({ commanders, identidade, onAdicionar }: Props) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const q = useDebounce(texto.trim(), 200)

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['buscar-cartas', q],
    queryFn: () => api.buscarCartas(q),
    enabled: q.length >= 2,
  })

  function escolher(carta: Carta) {
    onAdicionar(carta)
    setTexto('')
    setDestaque(0)
  }

  function teclado(e: React.KeyboardEvent) {
    if (!resultados.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque((d) => (d + 1) % resultados.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque((d) => (d - 1 + resultados.length) % resultados.length) }
    if (e.key === 'Enter') escolher(resultados[destaque])
    if (e.key === 'Escape') setAberto(false)
  }

  return (
    <div className="relative">
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setDestaque(0) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={teclado}
        placeholder="Adicionar carta pelo nome... (Enter adiciona)"
        className="w-full rounded-lg border border-borda bg-painel px-4 py-3 text-sm outline-none transition placeholder:text-apagado focus:border-destaque/70 focus:ring-2 focus:ring-destaque/20"
      />
      {aberto && q.length >= 2 && (
        <ul className="absolute z-30 mt-2 max-h-96 w-full overflow-y-auto rounded-lg border border-borda bg-painel shadow-2xl shadow-black/50">
          {resultados.map((c, i) => (
            <li key={c.oracle_id}>
              <button
                onMouseDown={(e) => { e.preventDefault(); escolher(c) }}
                onMouseEnter={() => setDestaque(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === destaque ? 'bg-painel-2' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
                <Marca carta={c} commanders={commanders} identidade={identidade} />
                <span className="hidden truncate text-xs text-apagado sm:block sm:max-w-48">{c.tipo}</span>
                <span className="shrink-0"><CustoMana custo={c.custo_mana} tamanho={14} /></span>
              </button>
            </li>
          ))}
          {!resultados.length && (
            <li className="px-4 py-3 text-sm text-apagado">{isFetching ? 'Buscando...' : 'Nenhuma carta encontrada'}</li>
          )}
        </ul>
      )}
    </div>
  )
}

function Marca({ carta, commanders, identidade }: { carta: Carta; commanders: Carta[]; identidade: string[] }) {
  if (!commanders.length) return null
  if (commanders.length === 1 && fazemDupla(commanders[0], carta)) {
    return <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">parceiro</span>
  }
  if (carta.identidade_cor.some((cor) => !identidade.includes(cor))) {
    return <span className="shrink-0 rounded bg-amber-300/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">fora das cores</span>
  }
  return null
}
