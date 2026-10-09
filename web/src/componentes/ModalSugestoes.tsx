import { useEffect } from 'react'
import type { Carta } from '../api/tipos'
import { PainelRecomendacoes } from './PainelRecomendacoes'

interface Props {
  commanders: string[]
  cartasNoDeck: string[]
  onAdicionar: (carta: Carta) => void
  onFechar: () => void
}

// Sugestões só quando a pessoa pede: fica aberto enquanto ela adiciona, e as sugestões
// se refazem a cada carta (as que entraram somem da lista)
export function ModalSugestoes({ commanders, cartasNoDeck, onAdicionar, onFechar }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-8" onClick={onFechar}>
      <div className="w-full max-w-6xl rounded-2xl border border-borda bg-painel p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-titulo text-xl font-semibold">Sugestões pro seu deck</h2>
            <p className="text-sm text-apagado">
              {cartasNoDeck.length
                ? `Com base nas ${cartasNoDeck.length} cartas que você já colocou. Clique pra adicionar.`
                : 'Seu deck ainda está vazio: essas são as cartas que mais combinam com o commander.'}
            </p>
          </div>
          <button onClick={onFechar} className="ml-auto rounded-lg border border-borda px-4 py-2 text-sm hover:bg-painel-2">Pronto</button>
        </div>
        <div className="mt-4">
          <PainelRecomendacoes commanders={commanders} cartasNoDeck={cartasNoDeck} onAdicionar={onAdicionar} colunas="sm:grid-cols-4 lg:grid-cols-6" />
        </div>
      </div>
    </div>
  )
}
