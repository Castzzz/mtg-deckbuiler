import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/cliente'
import type { Deck } from '../deck/armazenamento'
import { useDebounce } from './useDebounce'

// O bracket que sai da lista é o menor em que o deck cabe; 1x2 e 4x5 dependem da intenção de quem joga
const NOMES: Record<number, { rotulo: string; descricao: string; cor: string }> = {
  2: { rotulo: 'Bracket 1–2', descricao: 'Exhibition / Core: casual, sem Game Changers nem combos rápidos', cor: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
  3: { rotulo: 'Bracket 3', descricao: 'Upgraded: mais forte, até 3 Game Changers', cor: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  4: { rotulo: 'Bracket 4–5', descricao: 'Optimized / cEDH: sem restrições', cor: 'border-red-400/40 bg-red-400/10 text-red-200' },
}

export function BracketDeck({ deck }: { deck: Deck }) {
  const [aberto, setAberto] = useState(false)
  const pedido = useDebounce(
    JSON.stringify({
      commanders: deck.commanders.map((c) => c.oracle_id),
      cartas: deck.cartas.map((c) => ({ oracle_id: c.carta.oracle_id, qtd: c.qtd })),
    }),
    1200, // o Commander Spellbook leva ~1s: espera a pessoa parar de adicionar cartas
  )
  const { data, isFetching, isError } = useQuery({
    queryKey: ['bracket', pedido],
    queryFn: () => {
      const { commanders, cartas } = JSON.parse(pedido)
      return api.bracket(commanders, cartas)
    },
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

  if (isError && !data) return null
  if (!data) return <span className="inline-block h-6 w-24 animate-pulse rounded-full bg-painel-2" />
  const nome = NOMES[data.bracket]

  return (
    <>
      <button
        onClick={() => setAberto(!aberto)}
        title={nome.descricao}
        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition hover:brightness-125 ${nome.cor} ${isFetching ? 'opacity-60' : ''}`}
      >
        {nome.rotulo} {aberto ? '▴' : '▾'}
      </button>

      {aberto && (
        <div className="order-last basis-full rounded-xl border border-borda bg-fundo/60 p-4 text-sm">
          <p className="font-medium">{nome.rotulo}: <span className="font-normal text-apagado">{nome.descricao}</span></p>
          {data.motivos.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-apagado">{data.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
          ) : (
            <p className="mt-2 text-apagado">Nada que suba o bracket: sem Game Changers, combos de 2 cartas, turnos extras em sequência ou destruição de terrenos.</p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Lista titulo="Game Changers" itens={data.game_changers} />
            <Lista titulo="Destruição de terrenos" itens={data.terrenos_em_massa} />
            <Lista titulo="Turnos extras" itens={data.turnos_extras} />
          </div>
          {data.combos.length > 0 && (
            <div className="mt-3">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-apagado">Combos ({data.combos.length})</h5>
              <ul className="mt-1 space-y-1">
                {data.combos.map((c) => (
                  <li key={c.link}>
                    <a href={c.link} target="_blank" rel="noreferrer" className="hover:text-ouro-forte">
                      {c.cartas.join(' + ')}
                    </a>
                    <span className="text-apagado"> → {c.resultado.join(', ')}</span>
                    {c.duas_cartas && <span className="ml-2 rounded bg-painel-2 px-1.5 py-0.5 text-[10px] text-ouro-forte">2 cartas</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-apagado">
            Estimativa pelas regras oficiais de Commander Brackets. Combos via{' '}
            <a href="https://commanderspellbook.com" target="_blank" rel="noreferrer" className="underline hover:text-texto">Commander Spellbook</a>.
            {!data.verificado && ' O Spellbook não respondeu agora: só os Game Changers foram verificados.'}
          </p>
        </div>
      )}
    </>
  )
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wider text-apagado">{titulo} ({itens.length})</h5>
      <p className="mt-1">{itens.length ? itens.join(', ') : <span className="text-apagado">nenhum</span>}</p>
    </div>
  )
}
