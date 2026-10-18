import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { sair, useConta } from '../conta'
import { criarDeck, type Situacao, useDecks, useSituacao } from '../deck/armazenamento'
import { mudarMoeda, usePreco } from '../preco'
import { BuscaCommander } from './BuscaCommander'

const link = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-painel-2 text-texto' : 'text-apagado hover:bg-painel hover:text-texto'}`

// Como no Moxfield: logo e páginas à esquerda, busca no meio, moeda e conta à direita.
// No celular as páginas vão pra um menu e a busca desce pra uma linha só dela
export function Cabecalho() {
  const { pathname } = useLocation()
  const naInicio = pathname === '/'
  const decks = useDecks()
  const [menuAberto, setMenuAberto] = useState(false)
  const navegar = useNavigate()

  // Deck vazio e sem commander: a busca acha qualquer carta, e o commander se escolhe depois
  const novoDeck = () => { setMenuAberto(false); navegar(`/deck/${criarDeck([]).id}`) }
  const fechar = () => setMenuAberto(false)


  const paginas = (
    <>
      <NavLink to="/decks" onClick={fechar} className={link}>
        Meus decks{decks.length ? <span className="ml-1 text-xs text-apagado">{decks.length}</span> : null}
      </NavLink>
      <NavLink to="/importar" onClick={fechar} className={link}>Importar</NavLink>
      <NavLink to="/jogar" onClick={fechar} className={link}>Jogar</NavLink>
    </>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-borda bg-fundo/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:gap-3">
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className="-ml-1 rounded-md p-1.5 text-apagado hover:bg-painel hover:text-texto md:hidden"
          aria-label="Menu"
          aria-expanded={menuAberto}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            {menuAberto ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 5.5h14M3 10h14M3 14.5h14" />}
          </svg>
        </button>
        <Link to="/" onClick={fechar} className="texto-cores shrink-0 font-logo text-base font-bold tracking-wide sm:text-lg">mtg·deckbuilder</Link>
        <nav className="hidden items-center gap-0.5 md:flex">{paginas}</nav>
        <div className="mx-auto hidden w-full max-w-md lg:block">{!naInicio && <BuscaCommander />}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <div className="hidden sm:block"><Moeda /></div>
          <button onClick={novoDeck} className="hidden rounded-md bg-destaque px-3 py-1.5 text-sm font-semibold text-fundo hover:bg-destaque-forte sm:block">
            Novo deck
          </button>
          <Sincronia />
          <Conta />
        </div>
      </div>
      {menuAberto && (
        <nav className="flex flex-col gap-0.5 border-t border-borda px-3 py-2 md:hidden">
          {paginas}
          <button onClick={novoDeck} className="rounded-md px-3 py-1.5 text-left text-sm font-medium text-destaque-forte hover:bg-painel sm:hidden">+ Novo deck</button>
          <div className="flex items-center justify-between px-3 py-1.5 text-sm text-apagado sm:hidden">Moeda <Moeda /></div>
        </nav>
      )}
      {!naInicio && <div className="px-4 pb-2.5 lg:hidden"><BuscaCommander /></div>}
      {/* Faixa com as cores do deck aberto (ou as cinco cores, fora de um deck) */}
      <div aria-hidden className="faixa-cores h-0.5 opacity-80" />
    </header>
  )
}

function Moeda() {
  const { escolhida, cotacao } = usePreco()
  return (
    <div
      className="flex rounded-md border border-borda p-0.5 text-xs"
      title={cotacao ? `US$ 1 = R$ ${cotacao.usd_brl.toFixed(2).replace('.', ',')} (${cotacao.atualizada_em})` : 'Cotação indisponível: preços em dólar'}
    >
      {(['BRL', 'USD'] as const).map((m) => (
        <button key={m} onClick={() => mudarMoeda(m)} className={`rounded px-2 py-1 font-medium ${escolhida === m ? 'bg-painel-2 text-texto' : 'text-apagado hover:text-texto'}`}>
          {m === 'BRL' ? 'R$' : 'US$'}
        </button>
      ))}
    </div>
  )
}

// Com conta: uma nuvem diz se os decks já chegaram no servidor. Sem conta não aparece (ficam só aqui)
const COR_SITUACAO: Record<Exclude<Situacao['estado'], 'sem-conta'>, string> = {
  sincronizado: 'text-apagado',
  salvando: 'text-apagado',
  offline: 'text-amber-200',
  erro: 'text-amber-200',
}

const qtdDecks = (n: number) => (n === 1 ? '1 deck' : `${n} decks`)

function textoSituacao(s: Situacao): string {
  switch (s.estado) {
    case 'sem-conta': return ''
    case 'sincronizado': return 'Decks salvos na conta'
    case 'salvando': return 'Salvando na conta…'
    case 'offline': return `Sem internet: ${qtdDecks(s.pendentes)} com alteração esperando pra ir pra conta`
    case 'erro': return s.pendentes
      ? `Servidor fora do ar: ${qtdDecks(s.pendentes)} esperando pra ir pra conta (tentando de novo)`
      : 'Não deu pra buscar os decks da conta'
  }
}

function IconeSituacao({ situacao }: { situacao: Situacao }) {
  const nuvem = 'M5.5 15.5h9a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 5.2 7.6 4 4 0 0 0 5.5 15.5z'
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className={situacao.estado === 'salvando' ? 'animate-pulse' : undefined}>
      <path d={nuvem} />
      {situacao.estado === 'sincronizado' && <path d="M7.5 11.2l1.8 1.8 3.4-3.6" />}
      {situacao.estado === 'salvando' && <path d="M10 13.5v-4.5M8 11l2-2 2 2" />}
      {situacao.estado === 'offline' && <path d="M3 3l14 14" />}
      {situacao.estado === 'erro' && <path d="M10 9v2.5M10 13.6v.1" />}
    </svg>
  )
}

function Sincronia() {
  const situacao = useSituacao()
  if (situacao.estado === 'sem-conta') return null
  const texto = textoSituacao(situacao)
  return (
    <span role="status" aria-label={texto} title={texto} className={`flex h-8 w-8 items-center justify-center ${COR_SITUACAO[situacao.estado]}`}>
      <IconeSituacao situacao={situacao} />
    </span>
  )
}

// Logado: a inicial num círculo abre o menu da conta. Sem conta: botão de entrar
function Conta() {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const { carregando, usuario } = useConta()
  const situacao = useSituacao()
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc) }
  }, [aberto])

  if (carregando) return <div className="h-8 w-8" />
  if (!usuario) {
    return (
      <Link to="/entrar" state={{ de: pathname }} className="whitespace-nowrap rounded-md border border-borda px-3 py-1.5 text-sm font-medium hover:bg-painel">
        Entrar
      </Link>
    )
  }
  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-painel-2 text-sm font-semibold uppercase text-destaque-forte ring-1 ring-borda hover:ring-destaque/60"
        aria-label={`Conta de ${usuario.usuario}`}
        aria-expanded={aberto}
      >
        {usuario.usuario[0]}
      </button>
      {aberto && (
        <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-borda bg-painel py-1 shadow-xl shadow-black/40">
          <div className="border-b border-borda px-3 py-2">
            <div className="truncate text-sm font-semibold">{usuario.usuario}</div>
            <div className="truncate text-xs text-apagado">{usuario.email}</div>
          </div>
          {situacao.estado !== 'sem-conta' && (
            <div className={`flex items-center gap-2 border-b border-borda px-3 py-2 text-xs ${COR_SITUACAO[situacao.estado]}`}>
              <IconeSituacao situacao={situacao} />
              <span>{textoSituacao(situacao)}</span>
            </div>
          )}
          <Link to="/decks" onClick={() => setAberto(false)} className="block px-3 py-2 text-sm hover:bg-painel-2">Meus decks</Link>
          <button onClick={async () => { setAberto(false); await sair(); navegar('/') }} className="block w-full px-3 py-2 text-left text-sm hover:bg-painel-2">
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
