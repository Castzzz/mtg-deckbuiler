import { useState } from 'react'
import type { Carta } from '../api/tipos'
import type { Deck } from '../deck/armazenamento'
import { agrupar, podeRepetir } from '../deck/regras'
import { ImagemCarta } from './ImagemCarta'
import { CustoMana } from './Simbolos'

interface Props {
  deck: Deck
  onMais: (carta: Carta) => void
  onMenos: (carta: Carta) => void
  onTirar: (carta: Carta) => void
}

// Lista de texto agrupada por tipo, como no Moxfield; passar o mouse mostra a carta
export function ListaDeck({ deck, onMais, onMenos, onTirar }: Props) {
  const [previa, setPrevia] = useState<{ carta: Carta; y: number } | null>(null)
  const grupos = agrupar(deck.cartas)

  function linha(carta: Carta, qtd: number, ehCommander = false) {
    return (
      <li
        key={carta.oracle_id}
        className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-painel-2"
        onMouseEnter={(e) => setPrevia({ carta, y: e.clientY })}
        onMouseMove={(e) => setPrevia({ carta, y: e.clientY })}
        onMouseLeave={() => setPrevia(null)}
      >
        <span className="w-5 shrink-0 text-right text-xs text-apagado">{qtd}</span>
        <span className={`min-w-0 flex-1 truncate ${ehCommander ? 'text-ouro-forte' : ''}`}>{carta.nome}</span>
        {!ehCommander && (
          // No celular não tem hover, então os botões ficam sempre visíveis
          <span className="flex shrink-0 gap-0.5 lg:hidden lg:group-hover:flex">
            {podeRepetir(carta) && <BotaoMini onClick={() => onMais(carta)} rotulo={`Mais um ${carta.nome}`}>+</BotaoMini>}
            {podeRepetir(carta) && <BotaoMini onClick={() => onMenos(carta)} rotulo={`Menos um ${carta.nome}`}>−</BotaoMini>}
            <BotaoMini onClick={() => onTirar(carta)} rotulo={`Tirar ${carta.nome} do deck`}>✕</BotaoMini>
          </span>
        )}
        <span className="shrink-0 lg:group-hover:hidden"><CustoMana custo={carta.custo_mana} tamanho={13} /></span>
      </li>
    )
  }

  return (
    <div>
      <Grupo rotulo={deck.commanders.length > 1 ? 'Commanders' : 'Commander'} total={deck.commanders.length}>
        {deck.commanders.map((c) => linha(c, 1, true))}
      </Grupo>
      {grupos.map((g) => (
        <Grupo key={g.categoria} rotulo={g.rotulo} total={g.cartas.reduce((s, c) => s + c.qtd, 0)}>
          {g.cartas.map((c) => linha(c.carta, c.qtd))}
        </Grupo>
      ))}
      {!deck.cartas.length && (
        <p className="mt-4 rounded-lg border border-dashed border-borda p-4 text-center text-sm text-apagado">
          Clique nas sugestões ou busque uma carta pra começar.
        </p>
      )}

      {previa && (
        <div
          className="pointer-events-none fixed z-50 hidden w-60 lg:block"
          style={{ right: 'min(400px, 30vw)', top: Math.max(80, Math.min(previa.y - 160, window.innerHeight - 350)) }}
        >
          <ImagemCarta carta={previa.carta} className="shadow-2xl shadow-black/70" />
        </div>
      )}
    </div>
  )
}

function Grupo({ rotulo, total, children }: { rotulo: string; total: number; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h4 className="mb-1 flex items-baseline justify-between px-2 text-xs font-semibold uppercase tracking-wider text-apagado">
        {rotulo} <span>{total}</span>
      </h4>
      <ul>{children}</ul>
    </div>
  )
}

function BotaoMini({ onClick, rotulo, children }: { onClick: () => void; rotulo: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={rotulo} aria-label={rotulo} className="flex h-6 w-6 items-center justify-center rounded text-apagado hover:bg-borda hover:text-texto">
      {children}
    </button>
  )
}
