import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/cliente'
import { IdentidadeCor } from './Simbolos'
import { useDebounce } from './useDebounce'

export function BuscaCommander({ grande = false }: { grande?: boolean }) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const navigate = useNavigate()
  const q = useDebounce(texto.trim())

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['commanders', q],
    queryFn: () => api.commanders(q, 8),
    enabled: q.length >= 2,
  })

  function escolher(id: string) {
    setTexto('')
    setAberto(false)
    navigate(`/commander/${id}`)
  }

  function teclado(e: React.KeyboardEvent) {
    if (!resultados.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque((d) => (d + 1) % resultados.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque((d) => (d - 1 + resultados.length) % resultados.length) }
    if (e.key === 'Enter') escolher(resultados[destaque].oracle_id)
    if (e.key === 'Escape') setAberto(false)
  }

  const mostrar = aberto && q.length >= 2

  return (
    <div className="relative w-full">
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setDestaque(0) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={teclado}
        placeholder="Busque um commander... (ex: Edgar Markov)"
        className={`w-full rounded-xl border border-borda bg-painel text-texto placeholder:text-apagado outline-none transition focus:border-destaque/70 focus:ring-2 focus:ring-destaque/20 ${grande ? 'px-5 py-4 text-lg' : 'px-4 py-2 text-sm'}`}
      />
      {mostrar && (
        <ul className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-borda bg-painel shadow-2xl shadow-black/50">
          {resultados.map((c, i) => (
            <li key={c.oracle_id}>
              <button
                onMouseDown={() => escolher(c.oracle_id)}
                onMouseEnter={() => setDestaque(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === destaque ? 'bg-painel-2' : ''}`}
              >
                {c.imagem_url && (
                  // Recorte da arte: a parte de cima da imagem da carta
                  <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md">
                    <img src={c.imagem_url} alt="" className="w-full -translate-y-[18%]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.nome}</div>
                  <div className="text-xs text-apagado">{c.num_decks.toLocaleString('pt-BR')} decks</div>
                </div>
                <IdentidadeCor cores={c.identidade_cor} tamanho={16} />
              </button>
            </li>
          ))}
          {!resultados.length && (
            <li className="px-4 py-3 text-sm text-apagado">{isFetching ? 'Buscando...' : 'Nenhum commander encontrado'}</li>
          )}
        </ul>
      )}
    </div>
  )
}
