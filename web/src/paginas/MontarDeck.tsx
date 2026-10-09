import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/cliente'
import type { Carta, Edicao } from '../api/tipos'
import { BracketDeck } from '../componentes/BracketDeck'
import { BuscaCarta } from '../componentes/BuscaCarta'
import { ChecagemDeck } from '../componentes/ChecagemDeck'
import { CurvaMana } from '../componentes/CurvaMana'
import { DeckVisual } from '../componentes/DeckVisual'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { ListaDeck } from '../componentes/ListaDeck'
import { ModalSugestoes } from '../componentes/ModalSugestoes'
import { SeletorArte } from '../componentes/SeletorArte'
import { IdentidadeCor } from '../componentes/Simbolos'
import { TerrenosBasicos } from '../componentes/TerrenosBasicos'
import { apagarDeck, atualizarDeck, useDeck, type Origem } from '../deck/armazenamento'
import {
  adicionar, comArte, exportarTexto, identidadeDeck, maxCopias, precoDeck, remover,
  TAMANHO_DECK, TERRENOS_MAX, TERRENOS_MIN, totalCartas,
} from '../deck/regras'
import { usePreco } from '../preco'

export function MontarDeck() {
  const { id = '' } = useParams()
  const deck = useDeck(id)
  const navigate = useNavigate()
  const [modo, setModo] = useState<'lista' | 'imagens'>('imagens')
  const [sugerindo, setSugerindo] = useState(false)
  const [trocandoArte, setTrocandoArte] = useState<Carta | null>(null)
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

  function adicionarCarta(carta: Carta, origem: Origem) {
    if (deck!.commanders.some((c) => c.oracle_id === carta.oracle_id)) return avisar(`${carta.nome} já é o commander`)
    const novas = adicionar(deck!.cartas, carta, origem)
    if (novas === deck!.cartas) {
      const maximo = maxCopias(carta)
      return avisar(maximo === 1 ? `${carta.nome} já está no deck (só pode 1 cópia)` : `${carta.nome}: o máximo é ${maximo} cópias`)
    }
    atualizarDeck(deck!.id, () => ({ cartas: novas }))
    const qtd = novas.find((c) => c.carta.oracle_id === carta.oracle_id)!.qtd
    avisar(qtd > 1 ? `${carta.nome}: ${qtd} cópias` : `${carta.nome} adicionada`)
  }
  // Mais uma cópia de algo que já está no deck (botão + da lista, terrenos básicos)
  const mais = (carta: Carta) => adicionarCarta(carta, carta.tipo.startsWith('Basic ') ? 'basico' : 'busca')
  const menos = (carta: Carta) => atualizarDeck(deck.id, (d) => ({ cartas: remover(d.cartas, carta.oracle_id) }))
  const tirar = (carta: Carta) => atualizarDeck(deck.id, (d) => ({ cartas: remover(d.cartas, carta.oracle_id, true) }))

  function escolherArte(carta: Carta, edicao: Edicao | null) {
    atualizarDeck(deck!.id, (d) => {
      const artes = { ...d.artes }
      if (edicao) artes[carta.oracle_id] = edicao
      else delete artes[carta.oracle_id]
      return { artes }
    })
    setTrocandoArte(null)
  }

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
              <ImagemCarta carta={comArte(deck, c)} className="w-16 shadow-lg shadow-black/50" />
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
            <ChecagemDeck deck={deck} />
            <BracketDeck deck={deck} />
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={copiarLista} className="rounded-lg bg-ouro px-4 py-2 text-sm font-semibold text-fundo hover:bg-ouro-forte">Copiar lista</button>
          <button onClick={apagar} className="rounded-lg border border-borda px-3 py-2 text-sm text-apagado hover:border-red-400/50 hover:text-red-300">Apagar</button>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <BuscaCarta identidade={identidade} onAdicionar={(c) => adicionarCarta(c, 'busca')} />
        </div>
        <button
          onClick={() => setSugerindo(true)}
          className="flex items-center gap-2 rounded-xl bg-ouro px-4 py-3 text-sm font-semibold text-fundo shadow-lg shadow-ouro/10 transition hover:bg-ouro-forte"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M8 0l1.6 4.8L14 6.4 9.6 8 8 12.8 6.4 8 2 6.4l4.4-1.6zM13 10l.8 2.2L16 13l-2.2.8L13 16l-.8-2.2L10 13l2.2-.8z" /></svg>
          Sugerir cartas
        </button>
        <div className="flex rounded-xl border border-borda p-1">
          {([['imagens', 'Imagens'], ['lista', 'Lista']] as const).map(([m, rotulo]) => (
            <button key={m} onClick={() => setModo(m)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${modo === m ? 'bg-painel-2 text-ouro-forte' : 'text-apagado hover:text-texto'}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {!deck.cartas.length ? (
            <div className="rounded-2xl border border-dashed border-borda p-10 text-center text-apagado">
              <p className="text-texto">Seu deck ainda está vazio.</p>
              <p className="mt-1 text-sm">Busque as cartas que você quer pelo nome, ou clique em <span className="text-ouro-forte">Sugerir cartas</span> pra ver o que combina com o commander.</p>
            </div>
          ) : modo === 'imagens' ? (
            <DeckVisual deck={deck} onTirar={tirar} onArte={setTrocandoArte} onMais={mais} onMenos={menos} />
          ) : (
            <ListaDeck deck={deck} onMais={mais} onMenos={menos} onTirar={tirar} onArte={setTrocandoArte} />
          )}
        </div>

        <aside className="order-first lg:order-none lg:sticky lg:top-[78px] lg:self-start">
          <div className="space-y-5 rounded-2xl border border-borda bg-painel p-4">
            <CurvaMana cartas={deck.cartas} />
            <TerrenosBasicos identidade={identidade} cartas={deck.cartas} onMais={mais} onMenos={menos} />
          </div>
        </aside>
      </div>

      {sugerindo && (
        <ModalSugestoes
          commanders={deck.commanders.map((c) => c.oracle_id)}
          cartasNoDeck={ids}
          onAdicionar={(c) => adicionarCarta(c, 'sugestao')}
          onFechar={() => setSugerindo(false)}
        />
      )}

      {trocandoArte && (
        <SeletorArte
          carta={trocandoArte}
          atual={deck.artes?.[trocandoArte.oracle_id]}
          onEscolher={(e) => escolherArte(trocandoArte, e)}
          onFechar={() => setTrocandoArte(null)}
        />
      )}

      {aviso && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-borda bg-painel-2 px-4 py-2 text-sm shadow-2xl shadow-black/60">
          {aviso}
        </div>
      )}
    </>
  )
}
