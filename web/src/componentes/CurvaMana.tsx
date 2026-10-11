import { useState } from 'react'
import type { CartaNoDeck } from '../deck/armazenamento'

const FAIXAS = ['0', '1', '2', '3', '4', '5', '6', '7+']

// Histograma do custo de mana das mágicas (terrenos ficam de fora)
export function CurvaMana({ cartas }: { cartas: CartaNoDeck[] }) {
  const [foco, setFoco] = useState<number | null>(null)
  const magicas = cartas.filter((c) => c.carta.categoria !== 'terreno')
  const contagem = FAIXAS.map(() => 0)
  for (const c of magicas) contagem[Math.min(Math.floor(c.carta.cmc), 7)] += c.qtd
  const maximo = Math.max(...contagem, 1)
  const total = contagem.reduce((a, b) => a + b, 0)
  const media = total ? magicas.reduce((s, c) => s + c.carta.cmc * c.qtd, 0) / total : 0

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Curva de mana</h3>
        <span className="text-xs text-apagado">custo médio <span className="font-semibold text-texto">{media.toFixed(2)}</span></span>
      </div>
      <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label={`Curva de mana: ${FAIXAS.map((f, i) => `${contagem[i]} de custo ${f}`).join(', ')}`}>
        {contagem.map((n, i) => (
          <div
            key={i}
            className="relative flex h-full flex-1 flex-col items-center justify-end"
            onMouseEnter={() => setFoco(i)}
            onMouseLeave={() => setFoco(null)}
          >
            {foco === i && (
              <div className="absolute -top-8 z-10 whitespace-nowrap rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs shadow-lg">
                {n} {n === 1 ? 'carta' : 'cartas'} de custo {FAIXAS[i]}
              </div>
            )}
            <span className="mb-1 text-[10px] text-apagado">{n || ''}</span>
            <div
              className={`w-full rounded-t-[4px] transition-colors ${foco === i ? 'bg-destaque-forte' : 'bg-destaque/70'}`}
              style={{ height: `${(n / maximo) * 80}%`, minHeight: n ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t border-borda pt-1">
        {FAIXAS.map((f) => <span key={f} className="flex-1 text-center text-[10px] text-apagado">{f}</span>)}
      </div>
    </div>
  )
}
