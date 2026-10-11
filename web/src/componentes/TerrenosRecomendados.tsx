import { useState } from 'react'
import type { RecomendacaoTerrenos } from '../deck/regras'

// Quantos terrenos a curva pede, com a conta aberta pra pessoa entender (e discordar)
export function TerrenosRecomendados({ recomendacao, terrenos }: { recomendacao: RecomendacaoTerrenos; terrenos: number }) {
  const [aberto, setAberto] = useState(false)
  const { quantidade, media, baratas } = recomendacao
  const diferenca = terrenos - quantidade

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Terrenos recomendados</h3>
        <span className="text-lg font-semibold text-destaque-forte">~{quantidade}</span>
      </div>
      <p className="mt-1 text-xs text-apagado">
        {Math.abs(diferenca) <= 1
          ? <span className="text-emerald-300">✓ Você tem {terrenos}, está no ponto</span>
          : diferenca < 0
            ? <span className="text-amber-200">Você tem {terrenos}: faltam uns {-diferenca}</span>
            : <span className="text-amber-200">Você tem {terrenos}: dá pra tirar uns {diferenca}</span>}
      </p>
      <button onClick={() => setAberto(!aberto)} className="mt-1 text-xs text-apagado underline decoration-dotted hover:text-texto">
        Como calculei {aberto ? '▴' : '▾'}
      </button>
      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg bg-fundo/60 p-3 text-xs text-apagado">
          <p>
            Fórmula do Frank Karsten pra decks de 99 cartas: 31,4 + 3,13 × custo médio
            (<span className="text-texto">{media.toFixed(2)}</span>) − 0,28 × ramp e compra de custo até 2
            (<span className="text-texto">{baratas.length}</span>).
          </p>
          {baratas.length > 0 && (
            <p>Contei como ramp/compra: <span className="text-texto">{baratas.map((c) => c.nome).join(', ')}</span></p>
          )}
        </div>
      )}
    </div>
  )
}
