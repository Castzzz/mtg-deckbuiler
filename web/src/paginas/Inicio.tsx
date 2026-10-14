import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { type CSSProperties, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/cliente'
import type { Commander } from '../api/tipos'
import { BuscaCommander } from '../componentes/BuscaCommander'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { IdentidadeCor, SimboloMana } from '../componentes/Simbolos'
import { criarDeck, type Deck, useDecks } from '../deck/armazenamento'
import { arteDaCarta, comArte, identidadeDeck, TAMANHO_DECK, totalCartas } from '../deck/regras'
import { paletaDoDeck } from '../tema'

// Filtro dos commanders: as cores escolhidas são a identidade exata (⚪⚫ = só Orzhov). Incolor é sozinho
const CORES = ['W', 'U', 'B', 'R', 'G'] as const
const POR_PAGINA = 24
const NOMES: Record<string, string> = {
  W: 'Mono-branco', U: 'Mono-azul', B: 'Mono-preto', R: 'Mono-vermelho', G: 'Mono-verde', C: 'Incolores',
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya', WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  WUBR: 'Sem verde', UBRG: 'Sem branco', WBRG: 'Sem azul', WURG: 'Sem preto', WUBG: 'Sem vermelho', WUBRG: 'Cinco cores',
}

// O commander do banner muda todo dia, entre os 12 mais jogados
const DIA = Math.floor(Date.now() / 86_400_000)

export function Inicio() {
  const { data: populares } = useQuery({
    queryKey: ['commanders', 'populares'],
    queryFn: () => api.commanders(undefined, 12),
  })
  const decks = useDecks()
  const destaque = populares?.length ? populares[DIA % populares.length] : null

  return (
    <>
      <Banner destaque={destaque} />

      {decks.length > 0 && (
        <section className="mt-10">
          <Cabecalho titulo="Seus decks" link={{ para: '/decks', rotulo: `Ver todos (${decks.length})` }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {decks.slice(0, 4).map((d) => <CartaoDeck key={d.id} deck={d} />)}
          </div>
        </section>
      )}

      <Commanders />
    </>
  )
}

// Todos os commanders da base, dos mais jogados pros menos, de 24 em 24
function Commanders() {
  const [cores, setCores] = useState<string[]>([])  // vazio = todos; ['C'] = incolores
  const chave = cores.join('')
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['commanders', 'explorar', chave],
    queryFn: ({ pageParam }) => api.commanders(undefined, POR_PAGINA, chave || undefined, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, paginas) => (ultima.length === POR_PAGINA ? paginas.length * POR_PAGINA : undefined),
  })
  const commanders = data?.pages.flat() ?? []

  function alternar(cor: string) {
    if (cor === 'C') return setCores(chave === 'C' ? [] : ['C'])
    const novas = cores.includes(cor) ? cores.filter((c) => c !== cor) : [...cores.filter((c) => c !== 'C'), cor]
    setCores(CORES.filter((c) => novas.includes(c)))  // sempre na ordem WUBRG, que é a da chave dos NOMES
  }

  return (
    <section className="mt-10">
      <Cabecalho titulo={chave ? `Commanders ${NOMES[chave]}` : 'Commanders mais jogados'}>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por cores">
          <button onClick={() => setCores([])} className={chip(!chave)}>Todos</button>
          {[...CORES, 'C'].map((cor) => (
            <button key={cor} onClick={() => alternar(cor)} className={chip(cores.includes(cor))} aria-pressed={cores.includes(cor)} title={cor === 'C' ? 'Incolores' : 'Escolha uma ou mais cores'}>
              <SimboloMana simbolo={cor} tamanho={16} />
            </button>
          ))}
        </div>
      </Cabecalho>
      {chave && chave !== 'C' && (
        <p className="-mt-2 mb-4 text-xs text-apagado">Commanders com exatamente essas cores. Escolha mais cores pra ver as combinações de 2, 3, 4 ou 5.</p>
      )}
      {isError && <p className="text-apagado">Não consegui falar com a API. Ela está rodando?</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {isPending && Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-lg bg-painel" />)}
        {commanders.map((c, i) => (
          <Link key={c.oracle_id} to={`/commander/${c.oracle_id}`} className="group">
            <div className="relative">
              <ImagemCarta carta={c} className="shadow-lg shadow-black/40 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-destaque/20" />
              <span className="absolute -left-1.5 -top-1.5 rounded-md border border-borda bg-fundo px-1.5 py-0.5 text-xs font-semibold tabular-nums shadow">#{i + 1}</span>
            </div>
            <div className="mt-2 truncate text-sm font-medium group-hover:text-destaque-forte" title={c.nome}>{c.nome}</div>
            <div className="text-xs text-apagado">{c.num_decks.toLocaleString('pt-BR')} decks</div>
          </Link>
        ))}
      </div>
      {!isPending && !commanders.length && !isError && (
        <p className="rounded-lg border border-dashed border-borda p-8 text-center text-sm text-apagado">Nenhum commander com essas cores na base.</p>
      )}
      {hasNextPage && (
        <div className="mt-6 text-center">
          <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="rounded-md border border-borda px-5 py-2 text-sm font-medium hover:bg-painel disabled:opacity-50">
            {isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </button>
        </div>
      )}
    </section>
  )
}

const chip = (ativo: boolean) =>
  `flex h-8 items-center rounded-md border px-2.5 text-sm transition ${ativo ? 'border-destaque/60 bg-painel-2 text-texto' : 'border-borda text-apagado hover:bg-painel hover:text-texto'}`

function Cabecalho({ titulo, link, children }: { titulo: string; link?: { para: string; rotulo: string }; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
      {link && <Link to={link.para} className="text-sm text-apagado hover:text-texto">{link.rotulo} →</Link>}
    </div>
  )
}

// Arte do commander do dia ao fundo, escurecida pra esquerda onde fica o texto
function Banner({ destaque }: { destaque: Commander | null }) {
  const navegar = useNavigate()
  const arte = destaque && arteDaCarta(destaque.imagem_url)
  return (
    <section className="relative mt-6 overflow-hidden rounded-xl border border-borda bg-painel">
      {arte && (
        <img src={arte} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[50%_30%] opacity-90" />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-fundo via-fundo/75 to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-fundo/80 to-transparent" />

      <div className="relative max-w-2xl px-5 py-10 sm:px-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-widest text-destaque-forte">Commander · EDH</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Monte seu deck de Commander</h1>
        <p className="mt-3 max-w-lg text-apagado">
          Escolha o commander e veja as cartas que mais combinam com ele, calculadas a partir de mais de 100 mil decks.
        </p>
        <div className="mt-6"><BuscaCommander grande /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => navegar(`/deck/${criarDeck([]).id}`)}
            className="rounded-md bg-destaque px-4 py-2 text-sm font-semibold text-fundo hover:bg-destaque-forte"
            title="Comece pelas cartas e escolha o commander depois"
          >
            + Novo deck
          </button>
          <Link to="/importar" className="rounded-md border border-borda bg-fundo/60 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-painel-2">
            Importar do Moxfield/Archidekt
          </Link>
          <Link to="/jogar" className="rounded-md border border-borda bg-fundo/60 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-painel-2">
            Jogar com os amigos
          </Link>
        </div>
      </div>

      {destaque && (
        <Link
          to={`/commander/${destaque.oracle_id}`}
          className="absolute bottom-3 right-4 hidden rounded-md bg-fundo/70 px-2.5 py-1 text-xs text-apagado backdrop-blur hover:text-texto sm:block"
        >
          Commander do dia: <span className="font-medium text-texto">{destaque.nome}</span>
        </Link>
      )}
    </section>
  )
}

// Cada deck com a arte e as cores do próprio commander (as variáveis valem só dentro do cartão)
function CartaoDeck({ deck }: { deck: Deck }) {
  const commander = deck.commanders[0]
  const arte = commander && arteDaCarta(comArte(deck, commander).imagem_url)
  const total = totalCartas(deck)
  return (
    <Link
      to={`/deck/${deck.id}`}
      style={commander ? (paletaDoDeck(identidadeDeck(deck)) as CSSProperties) : undefined}
      className="group overflow-hidden rounded-lg border border-borda bg-painel transition hover:-translate-y-0.5 hover:border-destaque/60"
    >
      <div className="relative h-24 overflow-hidden bg-painel-2">
        {arte ? (
          <img src={arte} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_30%] transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-apagado">sem commander</div>
        )}
        <div aria-hidden className="faixa-cores absolute inset-x-0 bottom-0 h-0.5" />
      </div>
      <div className="p-3">
        <div className="truncate font-semibold group-hover:text-destaque-forte">{deck.nome}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-apagado">
          <IdentidadeCor cores={identidadeDeck(deck)} tamanho={13} />
          <span className={total === TAMANHO_DECK ? 'text-emerald-300' : ''}>{total}/{TAMANHO_DECK} cartas</span>
        </div>
      </div>
    </Link>
  )
}
