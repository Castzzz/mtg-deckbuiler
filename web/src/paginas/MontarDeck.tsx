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
import { DetalheCarta } from '../componentes/DetalheCarta'
import { IdentidadeCor } from '../componentes/Simbolos'
import { TerrenosBasicos } from '../componentes/TerrenosBasicos'
import { TerrenosRecomendados } from '../componentes/TerrenosRecomendados'
import { TokensDoDeck } from '../componentes/TokensDoDeck'
import { chancesTerrenos, TAMANHO_MAO } from '../deck/mao'
import { apagarDeck, atualizarDeck, useDeck, type Origem } from '../deck/armazenamento'
import {
  type AcaoCommander, adicionar, cartasDa, comArte, moverCarta, type Secao, SECOES, exportarTexto, identidadeDeck, maxCopias, precoDeck, remover,
  contarTerrenos, recomendarTerrenos, TAMANHO_DECK, TERRENOS_MAX, TERRENOS_MIN, tirarDoCommander, tornarCommander, totalCartas,
} from '../deck/regras'
import { usePreco } from '../preco'
import { useCoresDoDeck } from '../tema'

export function MontarDeck() {
  const { id = '' } = useParams()
  const deck = useDeck(id)
  const navigate = useNavigate()
  const [modo, setModo] = useState<'lista' | 'imagens'>('imagens')
  const [secao, setSecao] = useState<Secao>('cartas')  // o que está aparecendo, e pra onde vai o que adicionar
  const [sugerindo, setSugerindo] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)  // oracle_id da carta no popup de detalhes
  const [aviso, setAviso] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const { formatar } = usePreco()
  // O site fica com as cores do commander enquanto o deck está aberto
  useCoresDoDeck(deck?.commanders.length ? identidadeDeck(deck) : null)

  useEffect(() => () => clearTimeout(timer.current), [])

  // Ao abrir o deck, atualiza os dados das cartas salvas (preço muda todo dia; decks antigos nem tinham preço)
  const atualizadas = useQuery({
    queryKey: ['atualizar-deck', id],
    queryFn: () => api.cartasPorId([...deck!.commanders, ...SECOES.flatMap((s) => cartasDa(deck!, s.secao).map((c) => c.carta))].map((c) => c.oracle_id)),
    enabled: !!deck && deck.commanders.length + deck.cartas.length > 0,
    staleTime: Infinity,
  })
  useEffect(() => {
    if (!atualizadas.data) return
    const porId = new Map(atualizadas.data.map((c) => [c.oracle_id, c]))
    const nova = (c: Carta) => porId.get(c.oracle_id) ?? c
    atualizarDeck(id, (d) => ({
      commanders: d.commanders.map(nova),
      ...Object.fromEntries(SECOES.map(({ secao }) => [secao, cartasDa(d, secao).map((c) => ({ ...c, carta: nova(c.carta) }))])),
    }), false)
  }, [atualizadas.data, id])

  if (!deck) {
    return (
      <div className="py-20 text-center text-apagado">
        Deck não encontrado neste navegador. <Link to="/decks" className="text-destaque hover:underline">Ver meus decks</Link>
      </div>
    )
  }

  function avisar(texto: string) {
    setAviso(texto)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAviso(null), 2200)
  }

  const identidade = identidadeDeck(deck)
  const temCommander = deck.commanders.length > 0
  const total = totalCartas(deck)
  const terrenos = contarTerrenos(deck.cartas)
  const recomendacao = recomendarTerrenos(deck.cartas)
  const terrenosOk = recomendacao ? Math.abs(terrenos - recomendacao.quantidade) <= 1 : terrenos >= TERRENOS_MIN && terrenos <= TERRENOS_MAX
  // as sugestões não repetem o que já está no deck nem na seção aberta
  const ids = [...deck.cartas, ...(secao === 'cartas' ? [] : cartasDa(deck, secao))].map((c) => c.carta.oracle_id)
  const cartasDaSecao = cartasDa(deck, secao)
  const ONDE: Record<Secao, string> = { cartas: 'no deck', sideboard: 'no sideboard', maybeboard: 'no maybeboard' }
  const preco = precoDeck(deck)
  const semCommander = total - deck.commanders.length

  // Na seção aberta (deck, sideboard ou maybeboard); os terrenos básicos da lateral são sempre do deck
  function adicionarCarta(carta: Carta, origem: Origem, onde: Secao = secao) {
    if (onde === 'cartas' && deck!.commanders.some((c) => c.oracle_id === carta.oracle_id)) return avisar(`${carta.nome} já é o commander`)
    const antes = cartasDa(deck!, onde)
    const novas = adicionar(antes, carta, origem)
    if (novas === antes) {
      const maximo = maxCopias(carta)
      return avisar(maximo === 1 ? `${carta.nome} já está ${ONDE[onde]} (só pode 1 cópia)` : `${carta.nome}: o máximo é ${maximo} cópias`)
    }
    atualizarDeck(deck!.id, () => ({ [onde]: novas }))
    const qtd = novas.find((c) => c.carta.oracle_id === carta.oracle_id)!.qtd
    avisar(qtd > 1 ? `${carta.nome}: ${qtd} cópias ${ONDE[onde]}` : `${carta.nome} adicionada${onde === 'cartas' ? '' : ` ${ONDE[onde]}`}`)
  }
  // Mais uma cópia de algo que já está na seção (botão + da lista)
  const mais = (carta: Carta, onde: Secao = secao) => adicionarCarta(carta, carta.tipo.startsWith('Basic ') ? 'basico' : 'busca', onde)
  const menos = (carta: Carta, onde: Secao = secao) => atualizarDeck(deck.id, (d) => ({ [onde]: remover(cartasDa(d, onde), carta.oracle_id) }))
  const tirar = (carta: Carta) => atualizarDeck(deck.id, (d) => ({ [secao]: remover(cartasDa(d, secao), carta.oracle_id, true) }))

  function mover(carta: Carta, para: Secao) {
    const { mudanca, sobraram } = moverCarta(deck!, carta.oracle_id, secao, para)
    if (sobraram) return avisar(`${carta.nome} já está ${ONDE[para]} (só pode ${maxCopias(carta)} cópia${maxCopias(carta) > 1 ? 's' : ''})`)
    atualizarDeck(deck!.id, () => mudanca)
    setAberta(null)
    avisar(`${carta.nome} foi pro ${SECOES.find((s) => s.secao === para)!.rotulo.toLowerCase()}`)
  }

  function escolherArte(carta: Carta, edicao: Edicao | null) {
    atualizarDeck(deck!.id, (d) => {
      const artes = { ...d.artes }
      if (edicao) artes[carta.oracle_id] = edicao
      else delete artes[carta.oracle_id]
      return { artes }
    })
  }

  function virarCommander(carta: Carta, acao: AcaoCommander) {
    atualizarDeck(deck!.id, (d) => tornarCommander(d, carta, acao))
    avisar(acao === 'dupla' ? `${carta.nome} entrou na dupla de commanders` : `${carta.nome} agora é o commander`)
  }

  function deixarDeSerCommander(carta: Carta) {
    atualizarDeck(deck!.id, (d) => tirarDoCommander(d, carta))
    avisar(`${carta.nome} voltou pro deck`)
  }

  // A carta do popup sai sempre do deck atual: a quantidade acompanha, e o popup some se a carta for tirada
  const commanderAberto = secao === 'cartas' ? deck.commanders.find((c) => c.oracle_id === aberta) : undefined
  const cartaAberta = cartasDaSecao.find((c) => c.carta.oracle_id === aberta)

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
      <section className="painel-tingido relative mt-6 flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-borda p-4">
        <div aria-hidden className="faixa-cores absolute inset-x-0 top-0 h-1" />
        <div className="flex shrink-0">
          {deck.commanders.map((c, i) => (
            <Link key={c.oracle_id} to={`/commander/${deck.commanders[0].oracle_id}${deck.commanders[1] ? `?parceiro=${deck.commanders[1].oracle_id}` : ''}`} className={i ? '-ml-8' : ''}>
              <ImagemCarta carta={comArte(deck, c)} className="w-16 shadow-lg shadow-black/50" />
            </Link>
          ))}
          {!temCommander && (
            <div className="flex aspect-[63/88] w-16 items-center justify-center rounded-md border-2 border-dashed border-red-400/40 text-2xl text-red-300/60">?</div>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <input
            value={deck.nome}
            onChange={(e) => atualizarDeck(deck.id, () => ({ nome: e.target.value }))}
            aria-label="Nome do deck"
            className="w-full rounded-md bg-transparent px-1 font-titulo text-xl font-bold text-destaque-forte outline-none hover:bg-painel-2 focus:bg-painel-2 sm:text-2xl"
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-apagado">
            <IdentidadeCor cores={identidade} tamanho={16} />
            <span>
              <span className={`font-semibold ${total === TAMANHO_DECK ? 'text-emerald-300' : total > TAMANHO_DECK ? 'text-red-400' : 'text-texto'}`}>{total}</span>/{TAMANHO_DECK} cartas
            </span>
            <span title={`Somando a edição escolhida (ou a mais barata) de cada carta${preco.basicos ? `, sem contar os ${preco.basicos} terrenos básicos` : ''}${preco.semPreco ? ` (${preco.semPreco} sem preço)` : ''}`}>
              <span className="font-semibold text-texto">{formatar(preco.total)}</span>
            </span>
            <span title={recomendacao ? 'Pela curva de mana e pelo ramp barato do deck (detalhes na lateral)' : `A maioria dos decks de Commander usa entre ${TERRENOS_MIN} e ${TERRENOS_MAX} terrenos`}>
              <span className={`font-semibold ${terrenosOk ? 'text-emerald-300' : 'text-texto'}`}>{terrenos}</span> terrenos
              <span className="text-xs"> ({recomendacao ? `recomendado ~${recomendacao.quantidade}` : `ideal ${TERRENOS_MIN}–${TERRENOS_MAX}`})</span>
            </span>
            <ChecagemDeck deck={deck} />
            {temCommander && <BracketDeck deck={deck} />}
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={copiarLista} className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-fundo hover:bg-destaque-forte">Copiar lista</button>
          <button onClick={apagar} className="rounded-lg border border-borda px-3 py-2 text-sm text-apagado hover:border-red-400/50 hover:text-red-300">Apagar</button>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-64">
          {/* Sem commander ainda não tem identidade de cor pra filtrar */}
          <BuscaCarta identidade={temCommander ? identidade : null} onAdicionar={(c) => adicionarCarta(c, 'busca')} />
        </div>
        <button
          onClick={() => setSugerindo(true)}
          disabled={!temCommander}
          title={temCommander ? undefined : 'Defina o commander primeiro: as sugestões dependem dele'}
          className="flex items-center gap-2 rounded-xl bg-destaque px-4 py-3 text-sm font-semibold text-fundo shadow-lg shadow-destaque/10 transition hover:bg-destaque-forte disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M8 0l1.6 4.8L14 6.4 9.6 8 8 12.8 6.4 8 2 6.4l4.4-1.6zM13 10l.8 2.2L16 13l-2.2.8L13 16l-.8-2.2L10 13l2.2-.8z" /></svg>
          Sugerir cartas
        </button>
        {semCommander >= TAMANHO_MAO ? (
          <Link to={`/deck/${deck.id}/testar`} title="Abre uma mesa pra jogar o deck sozinho: mulligan, comprar, jogar as cartas" className="rounded-xl border border-borda px-4 py-3 text-sm font-medium transition hover:bg-painel-2">
            Testar mão
          </Link>
        ) : (
          <span title="Coloque pelo menos 7 cartas no deck pra testar uma mão" className="cursor-not-allowed rounded-xl border border-borda px-4 py-3 text-sm font-medium opacity-40">Testar mão</span>
        )}
        <div className="flex rounded-xl border border-borda p-1">
          {([['imagens', 'Imagens'], ['lista', 'Lista']] as const).map(([m, rotulo]) => (
            <button key={m} onClick={() => setModo(m)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${modo === m ? 'bg-painel-2 text-destaque-forte' : 'text-apagado hover:text-texto'}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {/* Deck, sideboard e maybeboard: a busca e as sugestões põem na que estiver aberta */}
          <div role="tablist" className="mb-4 flex gap-1 border-b border-borda">
            {SECOES.map((s) => {
              const n = s.secao === 'cartas' ? total : cartasDa(deck, s.secao).reduce((soma, c) => soma + c.qtd, 0)
              return (
                <button
                  key={s.secao}
                  role="tab"
                  aria-selected={secao === s.secao}
                  onClick={() => { setSecao(s.secao); setAberta(null) }}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${secao === s.secao ? 'border-destaque text-destaque-forte' : 'border-transparent text-apagado hover:text-texto'}`}
                >
                  {s.rotulo} <span className="text-xs font-normal text-apagado">{n}</span>
                </button>
              )
            })}
          </div>
          {secao !== 'cartas' && !cartasDaSecao.length ? (
            <div className="rounded-2xl border border-dashed border-borda p-10 text-center text-apagado">
              {secao === 'sideboard'
                ? <p>O sideboard fica fora das 100 cartas: respostas pra trocar conforme a mesa, ou cartas que buscam "de fora do jogo" (Wishes, Karn, Spawnsire).</p>
                : <p>O maybeboard guarda as cartas que você está pensando em pôr, sem contar no deck.</p>}
              <p className="mt-1 text-sm">Com esta aba aberta, o que você buscar ou pegar das sugestões vem pra cá. No popup de cada carta dá pra mover entre o deck, o sideboard e o maybeboard.</p>
            </div>
          ) : !deck.cartas.length && secao === 'cartas' ? (
            <div className="rounded-2xl border border-dashed border-borda p-10 text-center text-apagado">
              <p className="text-texto">Seu deck ainda está vazio.</p>
              <p className="mt-1 text-sm">Busque as cartas que você quer pelo nome, ou clique em <span className="text-destaque-forte">Sugerir cartas</span> pra ver o que combina com o commander.</p>
            </div>
          ) : modo === 'imagens' ? (
            <DeckVisual deck={deck} secao={secao} onTirar={tirar} onAbrir={(c) => setAberta(c.oracle_id)} />
          ) : (
            <ListaDeck deck={deck} secao={secao} onMais={(c) => mais(c)} onMenos={(c) => menos(c)} onTirar={tirar} onAbrir={(c) => setAberta(c.oracle_id)} />
          )}
        </div>

        <aside className="order-first lg:order-none lg:sticky lg:top-[78px] lg:self-start">
          <div className="painel-tingido space-y-5 rounded-2xl border border-borda p-4">
            <CurvaMana cartas={deck.cartas} />
            {recomendacao && <TerrenosRecomendados recomendacao={recomendacao} terrenos={terrenos} />}
            {semCommander >= TAMANHO_MAO && (
              <div>
                <h3 className="text-sm font-semibold">Chance de terrenos</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {chancesTerrenos(semCommander, terrenos).map((c) => (
                    <li key={c.rotulo} className="flex justify-between gap-3">
                      <span className="text-apagado">{c.rotulo}</span>
                      <span className="font-semibold">{Math.round(c.chance * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <TerrenosBasicos identidade={temCommander ? identidade : ['W', 'U', 'B', 'R', 'G']} cartas={deck.cartas} onMais={(c) => mais(c, 'cartas')} onMenos={(c) => menos(c, 'cartas')} />
            <TokensDoDeck deck={deck} />
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

      {(commanderAberto || cartaAberta) && (
        <DetalheCarta
          deck={deck}
          carta={commanderAberto ?? cartaAberta!.carta}
          qtd={cartaAberta?.qtd ?? 0}
          ehCommander={!!commanderAberto}
          secao={secao}
          onFechar={() => setAberta(null)}
          onMais={(c) => mais(c)}
          onMenos={(c) => menos(c)}
          onTirar={(c) => { tirar(c); setAberta(null) }}
          onMover={mover}
          onArte={escolherArte}
          onCommander={virarCommander}
          onTirarDoCommander={deixarDeSerCommander}
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
