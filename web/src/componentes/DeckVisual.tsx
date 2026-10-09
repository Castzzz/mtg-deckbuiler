import { useState } from 'react'
import type { Carta } from '../api/tipos'
import type { Deck } from '../deck/armazenamento'
import { agrupar, comArte, maxCopias } from '../deck/regras'
import { ImagemCarta } from './ImagemCarta'

interface Props {
  deck: Deck
  onTirar: (carta: Carta) => void
  onArte: (carta: Carta) => void
  onMais: (carta: Carta) => void
  onMenos: (carta: Carta) => void
}

// Cartas empilhadas por tipo, como no Archidekt: cada carta mostra só a faixa do nome,
// e passar o mouse (ou tocar, no celular) traz a carta inteira pra frente
export function DeckVisual({ deck, onTirar, onArte, onMais, onMenos }: Props) {
  const [aberta, setAberta] = useState<string | null>(null)
  const pilhas = [
    { rotulo: deck.commanders.length > 1 ? 'Commanders' : 'Commander', cartas: deck.commanders.map((carta) => ({ carta, qtd: 1 })), commander: true },
    ...agrupar(deck.cartas).map((g) => ({ ...g, commander: false })),
  ]

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
      {pilhas.map((pilha) => (
        <div key={pilha.rotulo}>
          <h4 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-apagado">
            {pilha.rotulo} <span>{pilha.cartas.reduce((s, c) => s + c.qtd, 0)}</span>
          </h4>
          {/* O margin-top em % é relativo à largura: -118% deixa aparecer ~20% da altura da carta de cima */}
          <div className="pb-[118%]">
            {pilha.cartas.map(({ carta, qtd }, i) => (
              <div
                key={carta.oracle_id}
                onClick={() => setAberta(aberta === carta.oracle_id ? null : carta.oracle_id)}
                className={`group relative cursor-pointer hover:z-20 ${aberta === carta.oracle_id ? 'z-20' : ''} ${i ? '-mt-[118%]' : ''}`}
              >
                <ImagemCarta
                  carta={comArte(deck, carta)}
                  className={`shadow-md shadow-black/60 ring-1 ring-black/40 transition group-hover:scale-[1.04] group-hover:shadow-2xl ${aberta === carta.oracle_id ? 'scale-[1.04] shadow-2xl' : ''}`}
                />
                {qtd > 1 && (
                  <span className="absolute right-1.5 top-[6%] rounded-full bg-fundo/90 px-2 py-0.5 text-xs font-bold text-ouro-forte shadow">×{qtd}</span>
                )}
                <div className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 opacity-0 transition group-hover:opacity-100 ${aberta === carta.oracle_id ? 'opacity-100' : ''}`}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onArte(carta) }}
                    className="rounded-full bg-fundo/90 px-3 py-1 text-xs font-medium shadow-lg hover:bg-painel-2"
                  >
                    Arte
                  </button>
                  {!pilha.commander && maxCopias(carta) > 1 && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); onMenos(carta) }} aria-label={`Menos um ${carta.nome}`} className="rounded-full bg-fundo/90 px-2.5 py-1 text-xs font-bold shadow-lg hover:bg-painel-2">−</button>
                      <button onClick={(e) => { e.stopPropagation(); onMais(carta) }} aria-label={`Mais um ${carta.nome}`} className="rounded-full bg-fundo/90 px-2.5 py-1 text-xs font-bold shadow-lg hover:bg-painel-2">+</button>
                    </>
                  )}
                  {!pilha.commander && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onTirar(carta) }}
                      title={`Tirar ${carta.nome} do deck`}
                      className="rounded-full bg-fundo/90 px-3 py-1 text-xs font-medium text-red-300 shadow-lg hover:bg-red-500/20"
                    >
                      Tirar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
