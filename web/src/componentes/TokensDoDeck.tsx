import { useState } from 'react'
import type { Deck } from '../deck/armazenamento'
import { descreverToken, useTokensDoDeck } from '../deck/tokens'
import { ImagemCarta } from './ImagemCarta'

// Os tokens que o deck precisa (pra separar antes de jogar): clicar mostra a carta grande e quem cria
export function TokensDoDeck({ deck }: { deck: Deck }) {
  const { data: tokens, isLoading, isError } = useTokensDoDeck(deck)
  const [aberto, setAberto] = useState<string | null>(null)
  if (isLoading) return null
  if (isError) return <p className="text-xs text-apagado">Não consegui buscar os tokens (a API está rodando?)</p>
  if (!tokens?.length) return null
  const escolhido = tokens.find((t) => t.token.oracle_id === aberto)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Tokens do deck</h3>
        <span className="text-xs text-apagado">{tokens.length}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {tokens.map(({ token, criado_por }) => (
          <button
            key={token.oracle_id}
            onClick={() => setAberto(aberto === token.oracle_id ? null : token.oracle_id)}
            title={`${descreverToken(token)}: ${criado_por.join(', ')}`}
            className={`rounded-md transition hover:-translate-y-0.5 ${aberto === token.oracle_id ? 'ring-2 ring-destaque' : ''}`}
          >
            <ImagemCarta carta={token} />
          </button>
        ))}
      </div>
      {escolhido && (
        <div className="mt-3 flex gap-3">
          <ImagemCarta carta={escolhido.token} className="w-28 shrink-0" />
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-texto">{descreverToken(escolhido.token)}</p>
            <p className="mt-1 text-apagado">Criado por</p>
            <ul className="mt-0.5 space-y-0.5">
              {escolhido.criado_por.map((nome) => <li key={nome}>{nome}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
