import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, ErroApi } from '../api/cliente'
import { rotuloParceiro } from '../api/parceria'
import type { Carta, Categoria } from '../api/tipos'
import { CartaRecomendada } from '../componentes/CartaRecomendada'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { SeletorParceiro } from '../componentes/SeletorParceiro'
import { CustoMana, IdentidadeCor } from '../componentes/Simbolos'

const ABAS: { categoria?: Categoria; rotulo: string }[] = [
  { rotulo: 'Destaques' },
  { categoria: 'criatura', rotulo: 'Criaturas' },
  { categoria: 'instantanea', rotulo: 'Instantâneas' },
  { categoria: 'feitico', rotulo: 'Feitiços' },
  { categoria: 'artefato', rotulo: 'Artefatos' },
  { categoria: 'encantamento', rotulo: 'Encantamentos' },
  { categoria: 'planeswalker', rotulo: 'Planeswalkers' },
  { categoria: 'batalha', rotulo: 'Batalhas' },
  { categoria: 'terreno', rotulo: 'Terrenos' },
]

export function PaginaCommander() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const parceiroId = params.get('parceiro')
  const [categoria, setCategoria] = useState<Categoria>()
  const [escolhendo, setEscolhendo] = useState(false)

  const carta = useQuery({ queryKey: ['carta', id], queryFn: () => api.carta(id) })
  const parceiro = useQuery({ queryKey: ['carta', parceiroId], queryFn: () => api.carta(parceiroId!), enabled: !!parceiroId })
  // Só existe pra commanders com decks suficientes; os outros caem no cálculo na hora
  const estatisticas = useQuery({
    queryKey: ['commander', id],
    queryFn: () => api.commander(id),
    retry: (_, erro) => !(erro instanceof ErroApi && erro.status === 404),
  })

  const commanders = parceiroId ? [id, parceiroId] : [id]
  const precalculado = !parceiroId && estatisticas.isSuccess
  const recomendacoes = useQuery({
    queryKey: ['recomendacoes', commanders, categoria],
    queryFn: () => (precalculado ? api.recomendacoes(id, categoria) : api.recomendar(commanders, categoria)),
    enabled: !estatisticas.isPending,
  })

  function escolherParceiro(p: Carta | null) {
    setEscolhendo(false)
    setParams(p ? { parceiro: p.oracle_id } : {}, { replace: true })
  }

  if (carta.isError) return <p className="py-20 text-center text-apagado">Commander não encontrado.</p>
  if (!carta.data) return <div className="mt-10 h-72 animate-pulse rounded-2xl bg-painel" />

  const cmd = carta.data
  const dupla = parceiro.data
  const identidade = [...new Set([...cmd.identidade_cor, ...(dupla?.identidade_cor ?? [])])]
  const rotulo = cmd.parceria && rotuloParceiro(cmd.parceria)

  return (
    <>
      <section className="mt-8 flex flex-col gap-8 rounded-2xl border border-borda bg-gradient-to-br from-painel to-fundo p-6 sm:flex-row">
        <div className="flex shrink-0 justify-center">
          <ImagemCarta carta={cmd} className="w-44 shadow-2xl shadow-black/60 sm:w-56" />
          {dupla && <ImagemCarta carta={dupla} className="-ml-16 mt-8 w-44 shadow-2xl shadow-black/60 sm:-ml-20 sm:w-56" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <IdentidadeCor cores={identidade} tamanho={22} />
            {estatisticas.data && !dupla && (
              <span className="text-sm text-apagado">{estatisticas.data.num_decks.toLocaleString('pt-BR')} decks na base</span>
            )}
          </div>
          <h1 className="mt-3 font-titulo text-2xl font-bold text-ouro-forte sm:text-3xl">
            {cmd.nome}
            {dupla && <span className="text-texto"> <span className="text-apagado">+</span> {dupla.nome}</span>}
          </h1>
          <div className={`mt-4 grid gap-6 ${dupla ? 'lg:grid-cols-2' : ''}`}>
            {[cmd, dupla].filter((c) => c !== undefined).map((c) => (
              <div key={c.oracle_id} className="max-w-2xl">
                {dupla && <div className="font-medium">{c.nome}</div>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-apagado">
                  <span className="shrink-0"><CustoMana custo={c.custo_mana} /></span> <span>{c.tipo}</span>
                </div>
                {c.texto && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-texto/85">{c.texto}</p>}
              </div>
            ))}
          </div>

          {rotulo && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setEscolhendo(true)}
                className="rounded-lg bg-ouro px-4 py-2 text-sm font-semibold text-fundo transition hover:bg-ouro-forte"
              >
                {dupla ? `Trocar ${rotulo}` : `Escolher ${rotulo}`}
              </button>
              {dupla && (
                <button onClick={() => escolherParceiro(null)} className="rounded-lg border border-borda px-4 py-2 text-sm hover:bg-painel-2">
                  Jogar sem {rotulo}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <nav className="sticky top-[61px] z-30 -mx-4 mt-8 flex gap-1 overflow-x-auto border-b border-borda bg-fundo/90 px-4 backdrop-blur">
        {ABAS.map((aba) => (
          <button
            key={aba.rotulo}
            onClick={() => setCategoria(aba.categoria)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${categoria === aba.categoria ? 'border-ouro text-ouro-forte' : 'border-transparent text-apagado hover:text-texto'}`}
          >
            {aba.rotulo}
          </button>
        ))}
      </nav>

      <section className="mt-6">
        {recomendacoes.isError && <p className="text-apagado">Erro ao carregar as recomendações: {recomendacoes.error.message}</p>}
        {recomendacoes.data?.length === 0 && <p className="py-10 text-center text-apagado">Nenhuma recomendação nessa categoria.</p>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
          {recomendacoes.isPending && Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-painel" />)}
          {recomendacoes.data?.map((r) => <CartaRecomendada key={r.carta.oracle_id} rec={r} />)}
        </div>
      </section>

      {escolhendo && <SeletorParceiro commander={cmd} onEscolher={escolherParceiro} onFechar={() => setEscolhendo(false)} />}
    </>
  )
}
