import { useState } from 'react'
import type { Deck } from '../deck/armazenamento'
import { validar } from '../deck/regras'

// Checagem rápida: o deck é legal em Commander? (100 cartas, cores, banidas, cópias)
export function ChecagemDeck({ deck }: { deck: Deck }) {
  const [aberto, setAberto] = useState(false)
  const problemas = validar(deck)
  const graves = problemas.filter((p) => p.grave).length

  const [rotulo, cor] = graves
    ? [`${graves} ${graves === 1 ? 'problema' : 'problemas'}`, 'border-red-400/40 bg-red-400/10 text-red-200']
    : problemas.length
      ? ['Deck válido, com avisos', 'border-amber-400/40 bg-amber-400/10 text-amber-200']
      : ['✓ Deck válido', 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200']

  return (
    <>
      <button onClick={() => setAberto(!aberto)} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition hover:brightness-125 ${cor}`}>
        {rotulo} {problemas.length > 0 && (aberto ? '▴' : '▾')}
      </button>
      {aberto && problemas.length > 0 && (
        <div className="order-last basis-full rounded-xl border border-borda bg-fundo/60 p-4 text-sm">
          <ul className="space-y-2">
            {problemas.map((p) => (
              <li key={p.texto}>
                <span className={p.grave ? 'text-red-300' : 'text-amber-200'}>{p.grave ? '✕' : '!'} {p.texto}</span>
                {p.cartas && <span className="text-apagado">: {p.cartas.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
