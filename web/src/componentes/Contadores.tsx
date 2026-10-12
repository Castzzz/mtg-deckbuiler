import { type Contadores, rotulosContadores, VENENO_LETAL } from '../deck/mesa'

const COR = {
  bonus: 'bg-emerald-600 text-white',
  penalidade: 'bg-red-700 text-white',
  outro: 'bg-fundo/95 text-texto',
}

// Os contadores em cima da carta, no meio dela (como o dado que a gente põe na carta de verdade)
export function SelosContadores({ contadores }: { contadores?: Contadores }) {
  const rotulos = rotulosContadores(contadores)
  if (!rotulos.length) return null
  return (
    <div className="pointer-events-none absolute inset-x-1 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5">
      {rotulos.map((r) => (
        <span key={r.texto} className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs font-bold shadow-md shadow-black/70 ring-1 ring-black/50 ${COR[r.tipo]}`}>
          {r.texto}
        </span>
      ))}
    </div>
  )
}

// Veneno, energia... de um jogador, em linha (só os que ele tem)
export function ContadoresDoJogador({ contadores }: { contadores?: Contadores }) {
  if (!contadores) return null
  return (
    <>
      {Object.entries(contadores).map(([tipo, n]) => (
        <span key={tipo} className={tipo === 'Veneno' && n >= VENENO_LETAL ? 'font-bold text-red-400' : tipo === 'Veneno' ? 'text-lime-300' : 'text-apagado'}>
          {tipo} {n}
        </span>
      ))}
    </>
  )
}

// Carta de outro jogador sob o controle de quem está com ela
export function SeloDono({ nome }: { nome: string }) {
  return (
    <span className="pointer-events-none absolute left-1 top-1 max-w-[85%] truncate rounded bg-sky-700/95 px-1.5 py-px text-[10px] font-semibold text-white shadow ring-1 ring-black/50">
      de {nome}
    </span>
  )
}
