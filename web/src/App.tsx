import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BuscaCommander } from './componentes/BuscaCommander'
import { sair, useConta } from './conta'
import { useDecks } from './deck/armazenamento'
import { mudarMoeda, usePreco } from './preco'
import { Entrar } from './paginas/Entrar'
import { Importar } from './paginas/Importar'
import { Inicio } from './paginas/Inicio'
import { Jogar, SalaDeJogo } from './paginas/Jogar'
import { MeusDecks } from './paginas/MeusDecks'
import { MontarDeck } from './paginas/MontarDeck'
import { PaginaCommander } from './paginas/PaginaCommander'
import { TestarMao } from './paginas/TestarMao'

export default function App() {
  const { pathname } = useLocation()
  const naInicio = pathname === '/'
  const navegar = useNavigate()
  const { carregando, usuario } = useConta()
  const decks = useDecks()
  const { escolhida, cotacao } = usePreco()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-borda/70 bg-fundo/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="texto-cores font-titulo text-xl font-bold tracking-wide">mtg·deckbuilder</Link>
          <Link to="/decks" className="whitespace-nowrap text-sm text-apagado hover:text-destaque-forte">
            Meus decks{decks.length ? ` (${decks.length})` : ''}
          </Link>
          <Link to="/jogar" className="whitespace-nowrap text-sm text-apagado hover:text-destaque-forte">Jogar</Link>
          {usuario ? (
            <span className="flex items-center gap-2 whitespace-nowrap text-sm">
              <span className="font-medium" title={usuario.email}>{usuario.usuario}</span>
              <button
                onClick={async () => { await sair(); navegar('/') }}
                className="text-apagado hover:text-destaque-forte"
              >
                Sair
              </button>
            </span>
          ) : !carregando && (
            <Link to="/entrar" state={{ de: pathname }} className="whitespace-nowrap text-sm text-apagado hover:text-destaque-forte">Entrar</Link>
          )}
          <div
            className="ml-auto flex rounded-lg border border-borda p-0.5 text-xs sm:order-last sm:ml-0"
            title={cotacao ? `US$ 1 = R$ ${cotacao.usd_brl.toFixed(2).replace('.', ',')} (${cotacao.atualizada_em})` : 'Cotação indisponível: preços em dólar'}
          >
            {(['BRL', 'USD'] as const).map((m) => (
              <button key={m} onClick={() => mudarMoeda(m)} className={`rounded-md px-2 py-1 font-medium ${escolhida === m ? 'bg-painel-2 text-destaque-forte' : 'text-apagado hover:text-texto'}`}>
                {m === 'BRL' ? 'R$' : 'US$'}
              </button>
            ))}
          </div>
          {!naInicio && <div className="w-full sm:ml-auto sm:max-w-md sm:flex-1"><BuscaCommander /></div>}
        </div>
        {/* Faixa com as cores do deck aberto (ou as cinco cores, fora de um deck) */}
        <div aria-hidden className="faixa-cores h-0.5 opacity-80" />
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/commander/:id" element={<PaginaCommander />} />
          <Route path="/decks" element={<MeusDecks />} />
          <Route path="/deck/:id" element={<MontarDeck />} />
          <Route path="/deck/:id/testar" element={<TestarMao />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/criar-conta" element={<Entrar criando />} />
          <Route path="/jogar" element={<Jogar />} />
          <Route path="/jogar/:codigo" element={<SalaDeJogo />} />
          <Route path="*" element={<p className="py-20 text-center text-apagado">Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  )
}
