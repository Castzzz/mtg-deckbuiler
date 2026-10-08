// Símbolos de mana em SVG, servidos pelo próprio Scryfall
const URL_SIMBOLO = (s: string) => `https://svgs.scryfall.io/card-symbols/${s.replace('/', '')}.svg`

export function SimboloMana({ simbolo, tamanho = 18 }: { simbolo: string; tamanho?: number }) {
  return <img src={URL_SIMBOLO(simbolo)} alt={`{${simbolo}}`} width={tamanho} height={tamanho} className="inline-block" />
}

// "{2}{W}{U}" -> ["2", "W", "U"]
export function CustoMana({ custo, tamanho }: { custo: string | null; tamanho?: number }) {
  if (!custo) return null
  const simbolos = [...custo.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {simbolos.map((s, i) => (s === '//' ? <span key={i} className="mx-1 text-apagado">//</span> : <SimboloMana key={i} simbolo={s} tamanho={tamanho} />))}
    </span>
  )
}

const ORDEM_CORES = ['W', 'U', 'B', 'R', 'G']

export function IdentidadeCor({ cores, tamanho = 18 }: { cores: string[]; tamanho?: number }) {
  const ordenadas = cores.length ? ORDEM_CORES.filter((c) => cores.includes(c)) : ['C']
  return (
    <span className="inline-flex items-center gap-1">
      {ordenadas.map((c) => <SimboloMana key={c} simbolo={c} tamanho={tamanho} />)}
    </span>
  )
}
