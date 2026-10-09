import type { Carta } from '../api/tipos'
import type { Deck } from '../deck/armazenamento'
import { agrupar, comArte } from '../deck/regras'
import { ImagemCarta } from './ImagemCarta'

interface Props {
  deck: Deck
  onAbrir: (carta: Carta) => void
  onTirar: (carta: Carta) => void
}

// Cartas empilhadas por tipo, como no Archidekt: cada carta mostra só a faixa do nome, passar o mouse
// traz a carta inteira pra frente, o × tira do deck e clicar abre os detalhes (arte, commander, cópias)
export function DeckVisual({ deck, onAbrir, onTirar }: Props) {
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
          {pilha.commander && !pilha.cartas.length && (
            <div className="flex aspect-[63/88] items-center justify-center rounded-[4.75%/3.5%] border-2 border-dashed border-red-400/40 p-4 text-center text-xs text-apagado">
              Sem commander. Clique numa criatura lendária do deck e escolha "Definir como commander".
            </div>
          )}
          {/* O margin-top em % é relativo à largura: -118% deixa aparecer ~20% da altura da carta de cima */}
          <div className={pilha.cartas.length ? 'pb-[118%]' : ''}>
            {pilha.cartas.map(({ carta, qtd }, i) => (
              <div
                key={carta.oracle_id}
                onClick={() => onAbrir(carta)}
                title={carta.nome}
                className={`group relative cursor-pointer hover:z-20 ${i ? '-mt-[118%]' : ''}`}
              >
                <ImagemCarta
                  carta={comArte(deck, carta)}
                  className="shadow-md shadow-black/60 ring-1 ring-black/40 transition group-hover:scale-[1.04] group-hover:shadow-2xl"
                />
                {qtd > 1 && (
                  <span className="absolute right-1.5 top-[6%] rounded-full bg-fundo/90 px-2 py-0.5 text-xs font-bold text-ouro-forte shadow group-hover:opacity-0">×{qtd}</span>
                )}
                {!pilha.commander && (
                  // No canto de cima: fica na faixa do nome, que é a parte visível quando a carta está empilhada
                  <button
                    onClick={(e) => { e.stopPropagation(); onTirar(carta) }}
                    title={`Tirar ${carta.nome} do deck`}
                    aria-label={`Tirar ${carta.nome} do deck`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-fundo/90 text-sm text-red-300 opacity-0 shadow-lg transition hover:bg-red-500 hover:text-white group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
