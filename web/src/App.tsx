import { Route, Routes } from 'react-router-dom'
import { Cabecalho } from './componentes/Cabecalho'
import { Entrar } from './paginas/Entrar'
import { Importar } from './paginas/Importar'
import { Inicio } from './paginas/Inicio'
import { Jogar, SalaDeJogo } from './paginas/Jogar'
import { MeusDecks } from './paginas/MeusDecks'
import { MontarDeck } from './paginas/MontarDeck'
import { PaginaCommander } from './paginas/PaginaCommander'
import { TestarMao } from './paginas/TestarMao'

export default function App() {
  return (
    <div className="min-h-screen">
      <Cabecalho />
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
