import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { BuscaCommander } from './componentes/BuscaCommander'
import { useDecks } from './deck/armazenamento'
import { Inicio } from './paginas/Inicio'
import { MeusDecks } from './paginas/MeusDecks'
import { MontarDeck } from './paginas/MontarDeck'
import { PaginaCommander } from './paginas/PaginaCommander'

export default function App() {
  const naInicio = useLocation().pathname === '/'
  const decks = useDecks()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-borda/70 bg-fundo/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="font-titulo text-xl font-bold tracking-wide text-ouro">mtg·deckbuilder</Link>
          <Link to="/decks" className="whitespace-nowrap text-sm text-apagado hover:text-ouro-forte">
            Meus decks{decks.length ? ` (${decks.length})` : ''}
          </Link>
          {!naInicio && <div className="w-full sm:ml-auto sm:max-w-md sm:flex-1"><BuscaCommander /></div>}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/commander/:id" element={<PaginaCommander />} />
          <Route path="/decks" element={<MeusDecks />} />
          <Route path="/deck/:id" element={<MontarDeck />} />
          <Route path="*" element={<p className="py-20 text-center text-apagado">Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  )
}
