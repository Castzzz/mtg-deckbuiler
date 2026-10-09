import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/cliente'
import type { Carta, Categoria, Ordem } from '../api/tipos'
import { CartaRecomendada } from './CartaRecomendada'

const ORDENS: { ordem: Ordem; rotulo: string; explicacao: string; soNoDeck?: boolean }[] = [
  { ordem: 'estilo', rotulo: 'Para o seu deck', soNoDeck: true, explicacao: 'Cartas que os decks mais parecidos com o seu (de qualquer commander nas suas cores) usam bem mais que a média. Muda conforme você adiciona cartas.' },
  { ordem: 'sinergia', rotulo: 'Alta sinergia', explicacao: 'Cartas que esse commander usa bem mais do que os outros decks das mesmas cores.' },
  { ordem: 'inclusao', rotulo: 'Mais usadas', explicacao: 'As cartas mais presentes nos decks desse commander.' },
  { ordem: 'score', rotulo: 'Recomendadas', explicacao: 'Combina a sinergia com o grafo de cartas jogadas juntas (PageRank).' },
]

const CATEGORIAS: { categoria?: Categoria; rotulo: string }[] = [
  { rotulo: 'Todas' },
  { categoria: 'criatura', rotulo: 'Criaturas' },
  { categoria: 'instantanea', rotulo: 'Instantâneas' },
  { categoria: 'feitico', rotulo: 'Feitiços' },
  { categoria: 'artefato', rotulo: 'Artefatos' },
  { categoria: 'encantamento', rotulo: 'Encantamentos' },
  { categoria: 'planeswalker', rotulo: 'Planeswalkers' },
  { categoria: 'batalha', rotulo: 'Batalhas' },
  { categoria: 'terreno', rotulo: 'Terrenos' },
]

interface Props {
  commanders: string[]
  // Commander sozinho com recomendações pré-calculadas no banco (mais rápido que o /recomendar)
  precalculado?: boolean
  // Modo montagem: não sugere o que já está no deck e oferece "Para o seu deck"
  cartasNoDeck?: string[]
  onAdicionar?: (carta: Carta) => void
  colunas?: string
}

export function PainelRecomendacoes({ commanders, precalculado = false, cartasNoDeck, onAdicionar, colunas = 'sm:grid-cols-4 lg:grid-cols-6' }: Props) {
  const noDeck = cartasNoDeck !== undefined
  const [ordem, setOrdem] = useState<Ordem>(noDeck ? 'estilo' : 'sinergia')
  const [categoria, setCategoria] = useState<Categoria>()

  // "Para o seu deck" com o deck vazio não tem com o que comparar
  const ordemEfetiva = ordem === 'estilo' && !cartasNoDeck?.length ? 'score' : ordem
  const usarPrecalculado = precalculado && !noDeck && commanders.length === 1
  const cartas = [...(cartasNoDeck ?? [])].sort()

  const recomendacoes = useQuery({
    queryKey: ['recomendacoes', commanders, ordemEfetiva, categoria, usarPrecalculado ? null : cartas],
    queryFn: () =>
      usarPrecalculado
        ? api.recomendacoes(commanders[0], ordemEfetiva, categoria)
        : api.recomendar(commanders, ordemEfetiva, categoria, cartas),
    // Ao adicionar uma carta, mantém a grade antiga na tela até a nova chegar
    placeholderData: keepPreviousData,
  })

  const opcoes = ORDENS.filter((o) => noDeck || !o.soNoDeck)
  const atual = opcoes.find((o) => o.ordem === ordem)!

  return (
    <section>
      <nav className="flex gap-1 overflow-x-auto border-b border-borda [scrollbar-width:none]">
        {opcoes.map((o) => (
          <button
            key={o.ordem}
            onClick={() => setOrdem(o.ordem)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${ordem === o.ordem ? 'border-ouro text-ouro-forte' : 'border-transparent text-apagado hover:text-texto'}`}
          >
            {o.rotulo}
          </button>
        ))}
      </nav>
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIAS.map((c) => (
          <button
            key={c.rotulo}
            onClick={() => setCategoria(c.categoria)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${categoria === c.categoria ? 'border-ouro/60 bg-ouro/15 text-ouro-forte' : 'border-borda text-apagado hover:text-texto'}`}
          >
            {c.rotulo}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-apagado">
        {atual.explicacao}
        {ordem === 'estilo' && ordemEfetiva !== 'estilo' && ' Adicione algumas cartas pra essa aba ficar personalizada.'}
      </p>

      <div className={`mt-5 grid grid-cols-2 gap-x-4 gap-y-6 transition-opacity ${colunas} ${recomendacoes.isPlaceholderData ? 'opacity-60' : ''}`}>
        {recomendacoes.isPending && Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-painel" />)}
        {recomendacoes.data?.map((r) => <CartaRecomendada key={r.carta.oracle_id} rec={r} onAdicionar={onAdicionar} />)}
      </div>
      {recomendacoes.isError && <p className="mt-4 text-apagado">Erro ao carregar as recomendações: {recomendacoes.error.message}</p>}
      {recomendacoes.data?.length === 0 && <p className="py-10 text-center text-apagado">Nenhuma recomendação aqui.</p>}
    </section>
  )
}
