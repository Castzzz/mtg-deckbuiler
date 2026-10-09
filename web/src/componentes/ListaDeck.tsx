import { useState } from 'react'
import type { Carta } from '../api/tipos'
import type { Deck } from '../deck/armazenamento'
import { agrupar, comArte, podeRepetir } from '../deck/regras'
import { usePreco } from '../preco'
import { ImagemCarta } from './ImagemCarta'
import { CustoMana } from './Simbolos'

interface Props {
  deck: Deck
  onMais: (carta: Carta) => void
  onMenos: (carta: Carta) => void
  onTirar: (carta: Carta) => void
  onArte: (carta: Carta) => void
}

// Lista de texto agrupada por tipo, como no Moxfield; passar o mouse mostra a carta
export function ListaDeck({ deck, onMais, onMenos, onTirar, onArte }: Props) {
  const [previa, setPrevia] = useState<{ carta: Carta; x: number; y: number } | null>(null)
  const { formatar } = usePreco()
  const grupos = agrupar(deck.cartas)

  function linha(carta: Carta, qtd: number, ehCommander = false) {
    const visivel = comArte(deck, carta)
    return (
      <li
        key={carta.oracle_id}
        className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-painel-2"
        onMouseEnter={(e) => setPrevia({ carta: visivel, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setPrevia({ carta: visivel, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPrevia(null)}
      >
        <span className="w-5 shrink-0 text-right text-xs text-apagado">{qtd}</span>
        <span className={`min-w-0 flex-1 truncate ${ehCommander ? 'text-ouro-forte' : ''}`}>{carta.nome}</span>
        {/* No celular não tem hover, então os botões ficam sempre visíveis */}
        <span className="flex shrink-0 gap-0.5 lg:hidden lg:group-hover:flex">
          <BotaoMini onClick={() => onArte(carta)} rotulo={`Trocar a arte de ${carta.nome}`}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="m2.5 11 3.5-3.5 3 3 2-2 2.5 2.5" /><circle cx="10.5" cy="6" r="1" /></svg>
          </BotaoMini>
          {!ehCommander && podeRepetir(carta) && <BotaoMini onClick={() => onMais(carta)} rotulo={`Mais um ${carta.nome}`}>+</BotaoMini>}
          {!ehCommander && podeRepetir(carta) && <BotaoMini onClick={() => onMenos(carta)} rotulo={`Menos um ${carta.nome}`}>−</BotaoMini>}
          {!ehCommander && <BotaoMini onClick={() => onTirar(carta)} rotulo={`Tirar ${carta.nome} do deck`}>✕</BotaoMini>}
        </span>
        <span className="shrink-0 lg:group-hover:hidden"><CustoMana custo={carta.custo_mana} tamanho={13} /></span>
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-apagado">{formatar(visivel.preco_usd == null ? null : visivel.preco_usd * qtd)}</span>
      </li>
    )
  }

  return (
    <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
      <Grupo rotulo={deck.commanders.length > 1 ? 'Commanders' : 'Commander'} total={deck.commanders.length}>
        {deck.commanders.map((c) => linha(c, 1, true))}
      </Grupo>
      {grupos.map((g) => (
        <Grupo key={g.categoria} rotulo={g.rotulo} total={g.cartas.reduce((s, c) => s + c.qtd, 0)}>
          {g.cartas.map((c) => linha(c.carta, c.qtd))}
        </Grupo>
      ))}

      {previa && (
        <div
          className="pointer-events-none fixed z-50 hidden w-60 lg:block"
          style={{
            // do lado direito do cursor, ou do esquerdo se não couber
            left: previa.x + 280 < window.innerWidth ? previa.x + 24 : previa.x - 264,
            top: Math.max(80, Math.min(previa.y - 160, window.innerHeight - 350)),
          }}
        >
          <ImagemCarta carta={previa.carta} className="shadow-2xl shadow-black/70" />
        </div>
      )}
    </div>
  )
}

function Grupo({ rotulo, total, children }: { rotulo: string; total: number; children: React.ReactNode }) {
  return (
    <div className="mb-4 break-inside-avoid">
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
