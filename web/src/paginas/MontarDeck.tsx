import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/cliente'
import type { Carta } from '../api/tipos'
import { BuscaCarta } from '../componentes/BuscaCarta'
import { CurvaMana } from '../componentes/CurvaMana'
import { DeckVisual } from '../componentes/DeckVisual'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { ListaDeck } from '../componentes/ListaDeck'
import { PainelRecomendacoes } from '../componentes/PainelRecomendacoes'
import { IdentidadeCor } from '../componentes/Simbolos'
import { TerrenosBasicos } from '../componentes/TerrenosBasicos'
import { apagarDeck, atualizarDeck, useDeck } from '../deck/armazenamento'
import { adicionar, exportarTexto, identidadeDeck, precoDeck, remover, TAMANHO_DECK, totalCartas } from '../deck/regras'
import { usePreco } from '../preco'

// Faixa de terrenos que costuma funcionar em Commander, pra orientar quem está começando
const TERRENOS_MIN = 35
const TERRENOS_MAX = 38

export function MontarDeck() {
  const { id = '' } = useParams()
  const deck = useDeck(id)
  const navigate = useNavigate()
  const [aba, setAba] = useState<'sugestoes' | 'deck'>('sugestoes')
  const [modo, setModo] = useState<'montar' | 'imagens'>('montar')
  const [aviso, setAviso] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const { formatar } = usePreco()

  useEffect(() => () => clearTimeout(timer.current), [])

  // Ao abrir o deck, atualiza os dados das cartas salvas (preço muda todo dia; decks antigos nem tinham preço)
  const atualizadas = useQuery({
    queryKey: ['atualizar-deck', id],
    queryFn: () => api.cartasPorId([...deck!.commanders, ...deck!.cartas.map((c) => c.carta)].map((c) => c.oracle_id)),
    enabled: !!deck && deck.commanders.length + deck.cartas.length > 0,
    staleTime: Infinity,
  })
  useEffect(() => {
    if (!atualizadas.data) return
    const porId = new Map(atualizadas.data.map((c) => [c.oracle_id, c]))
    const nova = (c: Carta) => porId.get(c.oracle_id) ?? c
    atualizarDeck(id, (d) => ({
      commanders: d.commanders.map(nova),
      cartas: d.cartas.map((c) => ({ ...c, carta: nova(c.carta) })),
    }), false)
  }, [atualizadas.data, id])

  if (!deck) {
    return (
      <div className="py-20 text-center text-apagado">
        Deck não encontrado neste navegador. <Link to="/decks" className="text-ouro hover:underline">Ver meus decks</Link>
      </div>
    )
  }

  function avisar(texto: string) {
    setAviso(texto)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAviso(null), 2200)
  }

  const identidade = identidadeDeck(deck)
  const total = totalCartas(deck)
  const terrenos = deck.cartas.filter((c) => c.carta.categoria === 'terreno').reduce((s, c) => s + c.qtd, 0)
  const ids = deck.cartas.map((c) => c.carta.oracle_id)
  const preco = precoDeck(deck)

  function adicionarCarta(carta: Carta) {
    if (deck!.commanders.some((c) => c.oracle_id === carta.oracle_id)) return avisar(`${carta.nome} já é o commander`)
    const novas = adicionar(deck!.cartas, carta)
    if (novas === deck!.cartas) return avisar(`${carta.nome} já está no deck (só pode 1 cópia)`)
    atualizarDeck(deck!.id, () => ({ cartas: novas }))
    avisar(`${carta.nome} adicionada`)
  }
  const menos = (carta: Carta) => atualizarDeck(deck.id, (d) => ({ cartas: remover(d.cartas, carta.oracle_id) }))
  const tirar = (carta: Carta) => atualizarDeck(deck.id, (d) => ({ cartas: remover(d.cartas, carta.oracle_id, true) }))

  async function copiarLista() {
    try {
      await navigator.clipboard.writeText(exportarTexto(deck!))
      avisar('Lista copiada! Dá pra colar no import do Moxfield ou do Archidekt')
    } catch {
      avisar('Não consegui copiar pra área de transferência')
    }
  }

  function apagar() {
    if (!confirm(`Apagar o deck "${deck!.nome}"? Não dá pra desfazer.`)) return
    apagarDeck(deck!.id)
    navigate('/decks')
  }

  return (
    <>
      <section className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-borda bg-gradient-to-br from-painel to-fundo p-4">
        <div className="flex shrink-0">
          {deck.commanders.map((c, i) => (
            <Link key={c.oracle_id} to={`/commander/${deck.commanders[0].oracle_id}${deck.commanders[1] ? `?parceiro=${deck.commanders[1].oracle_id}` : ''}`} className={i ? '-ml-8' : ''}>
              <ImagemCarta carta={c} className="w-16 shadow-lg shadow-black/50" />
            </Link>
          ))}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <input
            value={deck.nome}
            onChange={(e) => atualizarDeck(deck.id, () => ({ nome: e.target.value }))}
            aria-label="Nome do deck"
            className="w-full rounded-md bg-transparent px-1 font-titulo text-xl font-bold text-ouro-forte outline-none hover:bg-painel-2 focus:bg-painel-2 sm:text-2xl"
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-apagado">
            <IdentidadeCor cores={identidade} tamanho={16} />
            <span>
              <span className={`font-semibold ${total === TAMANHO_DECK ? 'text-emerald-300' : total > TAMANHO_DECK ? 'text-red-400' : 'text-texto'}`}>{total}</span>/{TAMANHO_DECK} cartas
            </span>
            <span title={`Somando a edição mais barata de cada carta${preco.semPreco ? ` (${preco.semPreco} sem preço)` : ''}`}>
              <span className="font-semibold text-texto">{formatar(preco.total)}</span>
            </span>
            <span title={`A maioria dos decks de Commander usa entre ${TERRENOS_MIN} e ${TERRENOS_MAX} terrenos`}>
              <span className={`font-semibold ${terrenos >= TERRENOS_MIN && terrenos <= TERRENOS_MAX ? 'text-emerald-300' : 'text-texto'}`}>{terrenos}</span> terrenos
              <span className="text-xs"> (ideal {TERRENOS_MIN}–{TERRENOS_MAX})</span>
            </span>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={copiarLista} className="rounded-lg bg-ouro px-4 py-2 text-sm font-semibold text-fundo hover:bg-ouro-forte">Copiar lista</button>
          <button onClick={apagar} className="rounded-lg border border-borda px-3 py-2 text-sm text-apagado hover:border-red-400/50 hover:text-red-300">Apagar</button>
        </div>
      </section>

      <div className="mt-4 flex w-fit rounded-lg border border-borda p-1">
        {([['montar', 'Montar'], ['imagens', 'Ver em imagens']] as const).map(([m, rotulo]) => (
          <button key={m} onClick={() => setModo(m)} className={`rounded-md px-4 py-1.5 text-sm font-medium ${modo === m ? 'bg-painel-2 text-ouro-forte' : 'text-apagado hover:text-texto'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {modo === 'imagens' ? (
        <div className="mt-6"><DeckVisual deck={deck} onTirar={tirar} /></div>
      ) : (
        <>
          {/* No celular as duas colunas viram abas */}
          <div className="mt-4 flex rounded-lg border border-borda p-1 lg:hidden">
            {(['sugestoes', 'deck'] as const).map((a) => (
              <button key={a} onClick={() => setAba(a)} className={`flex-1 rounded-md py-2 text-sm font-medium ${aba === a ? 'bg-painel-2 text-ouro-forte' : 'text-apagado'}`}>
                {a === 'sugestoes' ? 'Sugestões' : `Meu deck (${total})`}
              </button>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className={aba === 'sugestoes' ? '' : 'hidden lg:block'}>
              <BuscaCarta identidade={identidade} onAdicionar={adicionarCarta} />
              <div className="mt-6">
                <PainelRecomendacoes
                  commanders={deck.commanders.map((c) => c.oracle_id)}
                  cartasNoDeck={ids}
                  onAdicionar={adicionarCarta}
                  colunas="sm:grid-cols-3 xl:grid-cols-4"
                />
              </div>
            </div>

            <aside className={`${aba === 'deck' ? '' : 'hidden lg:block'} lg:sticky lg:top-[78px] lg:max-h-[calc(100vh-94px)] lg:self-start lg:overflow-y-auto`}>
              <div className="space-y-5 rounded-2xl border border-borda bg-painel p-4">
                <CurvaMana cartas={deck.cartas} />
                <TerrenosBasicos identidade={identidade} cartas={deck.cartas} onMais={adicionarCarta} onMenos={menos} />
                <div className="border-t border-borda pt-4">
                  <ListaDeck deck={deck} onMais={adicionarCarta} onMenos={menos} onTirar={tirar} />
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {aviso && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-borda bg-painel-2 px-4 py-2 text-sm shadow-2xl shadow-black/60">
          {aviso}
        </div>
      )}
    </>
  )
}
