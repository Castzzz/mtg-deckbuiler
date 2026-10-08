import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/cliente'
import { rotuloParceiro } from '../api/parceria'
import type { Carta } from '../api/tipos'
import { ImagemCarta } from './ImagemCarta'
import { useDebounce } from './useDebounce'

interface Props {
  commander: Carta
  onEscolher: (parceiro: Carta) => void
  onFechar: () => void
}

export function SeletorParceiro({ commander, onEscolher, onFechar }: Props) {
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto.trim())
  const { data: parceiros, isPending } = useQuery({
    queryKey: ['parceiros', commander.oracle_id, q],
    queryFn: () => api.parceiros(commander.oracle_id, q || undefined),
    placeholderData: (anterior) => anterior,
  })

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const rotulo = rotuloParceiro(commander.parceria!)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-10" onClick={onFechar}>
      <div className="w-full max-w-5xl rounded-2xl border border-borda bg-painel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <h2 className="font-titulo text-xl font-semibold">Escolha o {rotulo} de {commander.nome}</h2>
          <button onClick={onFechar} className="ml-auto rounded-lg px-3 py-1 text-apagado hover:bg-painel-2 hover:text-texto" aria-label="Fechar">✕</button>
        </div>
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Filtrar pelo nome..."
          className="mt-4 w-full rounded-lg border border-borda bg-fundo px-4 py-2 outline-none focus:border-ouro/70"
        />
        <p className="mt-2 text-xs text-apagado">Ordenados pelas duplas mais jogadas.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {isPending && Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-painel-2" />)}
          {parceiros?.map((p) => (
            <button key={p.oracle_id} onClick={() => onEscolher(p)} className="group text-left">
              <ImagemCarta carta={p} className="transition group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-ouro/60" />
              <div className="mt-2 truncate text-sm font-medium">{p.nome}</div>
              <div className="text-xs text-apagado">
                {p.decks_juntos ? `${p.decks_juntos.toLocaleString('pt-BR')} decks juntos` : 'nenhum deck ainda'}
              </div>
            </button>
          ))}
        </div>
        {parceiros?.length === 0 && <p className="py-8 text-center text-apagado">Nenhum {rotulo} encontrado.</p>}
      </div>
    </div>
  )
}
