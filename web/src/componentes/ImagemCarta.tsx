import type { Carta } from '../api/tipos'

// Proporção oficial da carta: 63 x 88 mm
export function ImagemCarta({ carta, className = '' }: { carta: Pick<Carta, 'nome' | 'imagem_url'>; className?: string }) {
  return (
    <div className={`aspect-[63/88] overflow-hidden rounded-[4.75%/3.5%] bg-painel-2 ${className}`}>
      {carta.imagem_url ? (
        <img src={carta.imagem_url} alt={carta.nome} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-3 text-center text-sm text-apagado">{carta.nome}</div>
      )}
    </div>
  )
}

