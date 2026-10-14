import type { CartaNoDeck } from '../deck/armazenamento'
import { agrupar } from '../deck/regras'
import { CORES } from '../tema'
import { SimboloMana } from './Simbolos'

interface Props {
  cartas: CartaNoDeck[]
  simbolos: Record<string, number>  // símbolos de mana por cor (ver simbolosPorCor)
}

// Como as estatísticas do Moxfield: quantas cartas de cada tipo e quanto o deck pede de cada cor
export function ComposicaoDeck({ cartas, simbolos }: Props) {
  const tipos = agrupar(cartas).map((g) => ({ rotulo: g.rotulo, n: g.cartas.reduce((s, c) => s + c.qtd, 0) }))
  const cores = Object.entries(simbolos).filter(([, n]) => n > 0)
  const totalSimbolos = cores.reduce((s, [, n]) => s + n, 0)
  if (!tipos.length) return null

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Tipos</h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {tipos.map((t) => (
            <li key={t.rotulo} className="flex justify-between gap-2">
              <span className="text-apagado">{t.rotulo}</span>
              <span className="font-semibold tabular-nums">{t.n}</span>
            </li>
          ))}
        </ul>
      </div>
      {totalSimbolos > 0 && (
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Símbolos de mana</h3>
            <span className="text-xs text-apagado">{totalSimbolos} no total</span>
          </div>
          {/* Barra empilhada com a proporção de cada cor, e a lista com os números embaixo */}
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-fundo" role="img" aria-label={cores.map(([c, n]) => `${n} de ${c}`).join(', ')}>
            {cores.map(([cor, n]) => <div key={cor} style={{ width: `${(n / totalSimbolos) * 100}%`, background: CORES[cor].base }} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {cores.map(([cor, n]) => (
              <li key={cor} className="flex items-center gap-1">
                <SimboloMana simbolo={cor} tamanho={13} />
                <span className="font-semibold tabular-nums">{n}</span>
                <span className="text-apagado">({Math.round((n / totalSimbolos) * 100)}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
