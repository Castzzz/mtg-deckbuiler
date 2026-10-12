import { type AjustePT, type Contadores, poderResistencia, rotulosContadores, VENENO_LETAL } from '../deck/mesa'

const BOLINHA = 'flex h-5 min-w-5 items-center justify-center rounded-full bg-fundo/95 px-1 text-[11px] font-bold leading-none tabular-nums text-texto shadow shadow-black/70 ring-1 ring-white/25'

// Os contadores numa coluna de bolinhas na beirada direita da carta, meio pra fora, pra não tapar a arte
export function SelosContadores({ contadores }: { contadores?: Contadores }) {
  const rotulos = rotulosContadores(contadores)
  if (!rotulos.length) return null
  return (
    <div className="absolute -right-2 top-8 flex flex-col items-end gap-1">
      {rotulos.map((r) => <span key={r.texto} title={r.texto} className={BOLINHA}>{r.curto}</span>)}
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

// Poder/resistência de agora (impresso + contadores + ajuste), no canto de baixo, meio pra fora da carta
export function SeloPT({ carta, ajuste, contadores }: {
  carta: { poder?: string | null; resistencia?: string | null }; ajuste?: AjustePT; contadores?: Contadores
}) {
  const pt = poderResistencia(carta, ajuste, contadores)
  if (!pt) return null
  return <span title="Poder/resistência" className={`absolute -bottom-1.5 -right-2 ${BOLINHA}`}>{pt.texto}</span>
}
