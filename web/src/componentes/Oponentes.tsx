import { useRef } from 'react'
import { DANO_COMMANDER_LETAL } from '../deck/mesa'
import { type CartaPublica, type CartaVisivel, chaveDano, type JogadorSala, type MesaPublica } from '../deck/partida'
import { useTamanho } from './useTamanho'
import { ImagemCarta } from './ImagemCarta'

const CARTA_LARGURA = 96  // a mesma do Tabuleiro: o campo dos outros vem nessa escala e é reduzido

interface Props {
  jogadores: JogadorSala[]  // os outros, na ordem da mesa
  vez: string | null
  danoRecebido: Record<string, number>  // o que eu levei de cada commander
  onDano: (chave: string, nome: string, delta: number) => void
  onPrevia: (carta: CartaVisivel | null, x?: number) => void
  onVer: (titulo: string, cartas: CartaPublica[]) => void
}

// Os outros jogadores, lado a lado em cima do meu campo
export function Oponentes({ jogadores, vez, danoRecebido, onDano, onPrevia, onVer }: Props) {
  return (
    <div className="flex min-h-0 gap-1 border-b border-borda bg-black/20 p-1">
      {jogadores.map((j) => (
        <Oponente key={j.id} jogador={j} naVez={j.id === vez} danoRecebido={danoRecebido} onDano={onDano} onPrevia={onPrevia} onVer={onVer} />
      ))}
    </div>
  )
}

function Oponente({ jogador, naVez, danoRecebido, onDano, onPrevia, onVer }: Omit<Props, 'jogadores' | 'vez'> & { jogador: JogadorSala; naVez: boolean }) {
  const { mesa } = jogador
  const campoRef = useRef<HTMLDivElement>(null)
  const campo = useTamanho(campoRef)

  return (
    <section className={`flex min-w-0 flex-1 flex-col rounded-lg border bg-painel/70 ${naVez ? 'border-destaque shadow-[0_0_18px_-4px] shadow-destaque/60' : 'border-borda'}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borda/60 px-2 py-1 text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className={`h-2 w-2 rounded-full ${jogador.conectado ? 'bg-emerald-400' : 'bg-stone-500'}`} title={jogador.conectado ? 'Conectado' : 'Desconectado'} />
          {jogador.nome}
          {naVez && <span className="rounded bg-destaque px-1.5 text-[10px] font-bold uppercase text-fundo">vez</span>}
        </span>
        {mesa ? (
          <>
            <span className={`text-sm font-bold ${mesa.vida <= 0 ? 'text-red-400' : ''}`} title="Vida">♥ {mesa.vida}</span>
            <span className="text-apagado" title="Cartas na mão">Mão {mesa.mao}</span>
            <span className="text-apagado" title="Cartas no grimório">Grimório {mesa.biblioteca}</span>
            <button onClick={() => onVer(`Cemitério de ${jogador.nome}`, mesa.cemiterio)} className="text-apagado hover:text-texto">Cemitério {mesa.cemiterio.length}</button>
            <button onClick={() => onVer(`Exílio de ${jogador.nome}`, mesa.exilio)} className="text-apagado hover:text-texto">Exílio {mesa.exilio.length}</button>
            {mesa.fase !== 'jogo' && <span className="text-amber-200">escolhendo a mão…</span>}
          </>
        ) : (
          <span className="text-apagado">ainda sem mesa</span>
        )}
      </header>

      {mesa && (
        <div className="flex min-h-0 flex-1">
          <Commanders jogador={jogador} mesa={mesa} danoRecebido={danoRecebido} onDano={onDano} onPrevia={onPrevia} />
          <div ref={campoRef} className="relative min-w-0 flex-1 overflow-hidden">
            <CampoReduzido mesa={mesa} largura={campo.largura} altura={campo.altura} onPrevia={onPrevia} />
          </div>
        </div>
      )}
    </section>
  )
}

// Os commanders dele: onde estão, o imposto, e quanto dano cada um já me deu (eu que anoto, como na mesa de verdade)
function Commanders({ jogador, mesa, danoRecebido, onDano, onPrevia }: {
  jogador: JogadorSala; mesa: MesaPublica; danoRecebido: Record<string, number>
  onDano: Props['onDano']; onPrevia: Props['onPrevia']
}) {
  return (
    <div className="flex w-[74px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-borda/60 p-1">
      {mesa.deck.commanders.map((carta, i) => {
        // O commander é a carta de id i (ver cartasDoDeck): se está na zona de comando, a imagem fica acesa
        const naZona = mesa.comando.some((c) => c.id === i)
        const imposto = 2 * (mesa.lancamentos[i] ?? 0)
        const chave = chaveDano(jogador.id, i)
        const dano = danoRecebido[chave] ?? 0
        return (
          <div key={i} className="text-center text-[10px]">
            <div onMouseEnter={(e) => onPrevia(carta, e.clientX)} onMouseLeave={() => onPrevia(null)} className={naZona ? '' : 'opacity-40'}>
              <ImagemCarta carta={carta} />
            </div>
            {imposto > 0 && <p className="text-apagado">imposto +{imposto}</p>}
            <p className={`mt-0.5 ${dano >= DANO_COMMANDER_LETAL ? 'font-bold text-red-400' : 'text-apagado'}`} title="Dano que esse commander já te deu">
              em você: {dano}
            </p>
            <div className="flex justify-center gap-0.5">
              <button onClick={() => onDano(chave, carta.nome, -1)} className="h-5 w-5 rounded border border-borda hover:bg-painel-2" aria-label={`Tirar 1 do dano de ${carta.nome}`}>−</button>
              <button onClick={() => onDano(chave, carta.nome, 1)} className="h-5 w-5 rounded border border-borda hover:bg-painel-2" aria-label={`Levei 1 de dano de ${carta.nome}`}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// O campo dele inteiro, reduzido pra caber (mantendo as posições em que ele colocou as cartas)
function CampoReduzido({ mesa, largura, altura, onPrevia }: { mesa: MesaPublica; largura: number; altura: number; onPrevia: Props['onPrevia'] }) {
  const original = mesa.tamanhoCampo
  const escala = Math.min(1, largura / original.largura, altura / original.altura)
  if (!mesa.campo.length) {
    return <p className="flex h-full items-center justify-center text-xs text-apagado">Campo vazio</p>
  }
  return (
    <div className="absolute left-0 top-0 origin-top-left" style={{ width: original.largura, height: original.altura, transform: `scale(${escala})` }}>
      {mesa.campo.map((c) => (
        <div
          key={c.id}
          className="absolute"
          style={{ left: c.pos?.x ?? 0, top: c.pos?.y ?? 0, width: CARTA_LARGURA }}
          onMouseEnter={(e) => onPrevia(c.carta, e.clientX)}
          onMouseLeave={() => onPrevia(null)}
        >
          <div className="transition-transform duration-200" style={{ transform: c.virada ? 'rotate(90deg)' : undefined }}>
            <ImagemCarta carta={c.carta} className="shadow-md shadow-black/60 ring-1 ring-black/40" />
          </div>
          {c.token && <span className="absolute bottom-1 left-1 rounded bg-fundo/90 px-1.5 text-[10px] font-semibold uppercase text-apagado">token</span>}
        </div>
      ))}
    </div>
  )
}
