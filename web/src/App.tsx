import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { BuscaCommander } from './componentes/BuscaCommander'
import { Inicio } from './paginas/Inicio'
import { PaginaCommander } from './paginas/PaginaCommander'

export default function App() {
  const naInicio = useLocation().pathname === '/'
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-borda/70 bg-fundo/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-titulo text-xl font-bold tracking-wide text-ouro">mtg·deckbuilder</Link>
          {!naInicio && <div className="ml-auto w-full max-w-md"><BuscaCommander /></div>}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/commander/:id" element={<PaginaCommander />} />
          <Route path="*" element={<p className="py-20 text-center text-apagado">Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  )
}
