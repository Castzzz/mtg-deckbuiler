import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ErroApi } from '../api/cliente'
import { rotuloParceiro } from '../api/parceria'
import type { Carta } from '../api/tipos'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { PainelRecomendacoes } from '../componentes/PainelRecomendacoes'
import { SeletorParceiro } from '../componentes/SeletorParceiro'
import { CustoMana, IdentidadeCor } from '../componentes/Simbolos'
import { criarDeck } from '../deck/armazenamento'
import { useCoresDoDeck } from '../tema'

export function PaginaCommander() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const parceiroId = params.get('parceiro')
  const navigate = useNavigate()
  const [escolhendo, setEscolhendo] = useState(false)

  const carta = useQuery({ queryKey: ['carta', id], queryFn: () => api.carta(id) })
  const parceiro = useQuery({ queryKey: ['carta', parceiroId], queryFn: () => api.carta(parceiroId!), enabled: !!parceiroId })
  // Só existe pra commanders com decks suficientes; os outros caem no cálculo na hora
  const estatisticas = useQuery({
    queryKey: ['commander', id],
    queryFn: () => api.commander(id),
    retry: (_, erro) => !(erro instanceof ErroApi && erro.status === 404),
  })

  // A página toda fica com as cores do commander (e do parceiro)
  useCoresDoDeck(carta.data ? [...carta.data.identidade_cor, ...(parceiro.data?.identidade_cor ?? [])] : null)

  function escolherParceiro(p: Carta | null) {
    setEscolhendo(false)
    setParams(p ? { parceiro: p.oracle_id } : {}, { replace: true })
  }

  if (carta.isError) return <p className="py-20 text-center text-apagado">Commander não encontrado.</p>
  if (!carta.data) return <div className="mt-10 h-72 animate-pulse rounded-lg bg-painel" />

  const cmd = carta.data
  const dupla = parceiro.data
  const identidade = [...new Set([...cmd.identidade_cor, ...(dupla?.identidade_cor ?? [])])]
  const rotulo = cmd.parceria && rotuloParceiro(cmd.parceria)

  function montarDeck() {
    const deck = criarDeck(dupla ? [cmd, dupla] : [cmd])
    navigate(`/deck/${deck.id}`)
  }

  return (
    <>
      <section className="painel-tingido relative mt-8 flex flex-col gap-8 overflow-hidden rounded-lg border border-borda p-6 sm:flex-row">
        <div aria-hidden className="faixa-cores absolute inset-x-0 top-0 h-1" />
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
          <h1 className="mt-3 font-titulo text-2xl font-bold text-texto sm:text-3xl">
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

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={montarDeck}
              disabled={!!parceiroId && !dupla}
              className="rounded-lg bg-destaque px-5 py-2 text-sm font-semibold text-fundo transition hover:bg-destaque-forte disabled:opacity-50"
            >
              Montar deck{dupla ? ' com a dupla' : ''}
            </button>
            {rotulo && (
              <button onClick={() => setEscolhendo(true)} className="rounded-lg border border-destaque/50 px-4 py-2 text-sm font-medium text-destaque-forte hover:bg-destaque/10">
                {dupla ? `Trocar ${rotulo}` : `Escolher ${rotulo}`}
              </button>
            )}
            {dupla && (
              <button onClick={() => escolherParceiro(null)} className="rounded-lg border border-borda px-4 py-2 text-sm hover:bg-painel-2">
                Jogar sem {rotulo}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-8">
        {!estatisticas.isPending && (!parceiroId || dupla) && (
          <PainelRecomendacoes
            key={[id, parceiroId].join()}
            commanders={dupla ? [id, dupla.oracle_id] : [id]}
            precalculado={estatisticas.isSuccess}
          />
        )}
      </div>

      {escolhendo && <SeletorParceiro commander={cmd} onEscolher={escolherParceiro} onFechar={() => setEscolhendo(false)} />}
    </>
  )
}
