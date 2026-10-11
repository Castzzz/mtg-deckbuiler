import { useEffect, useRef, useState } from 'react'
import type { Sala } from '../deck/partida'

// Histórico da partida (jogadas de todo mundo e o chat), o mais recente embaixo
export function HistoricoSala({ sala, eu, onChat }: { sala: Sala; eu: string; onChat: (texto: string) => void }) {
  const [texto, setTexto] = useState('')
  const fim = useRef<HTMLLIElement>(null)
  const nomes = new Map(sala.jogadores.map((j) => [j.id, j.nome]))

  useEffect(() => fim.current?.scrollIntoView({ block: 'end' }), [sala.log.length])

  function mandar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    onChat(texto)
    setTexto('')
  }

  return (
    <>
      <h3 className="font-semibold">Histórico da partida</h3>
      <ol className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto text-xs">
        {sala.log.map((l, i) => (
          <li key={i} className={l.chat ? 'text-texto' : 'text-apagado'}>
            {l.jogador && <span className={`font-semibold ${l.jogador === eu ? 'text-destaque-forte' : 'text-texto'}`}>{nomes.get(l.jogador) ?? 'Alguém'}: </span>}
            {l.jogador === null ? <em>{l.texto}</em> : l.texto}
          </li>
        ))}
        <li ref={fim} />
      </ol>
      <form onSubmit={mandar} className="mt-3 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={300}
          placeholder="Mensagem pra mesa…"
          className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-3 py-1.5 text-sm outline-none placeholder:text-apagado focus:border-destaque/60"
        />
        <button className="rounded-lg bg-destaque px-3 py-1.5 text-sm font-semibold text-fundo hover:bg-destaque-forte">Enviar</button>
      </form>
    </>
  )
}
