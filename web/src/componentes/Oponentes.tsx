import { type DragEvent, useRef, useState } from 'react'
import { DANO_COMMANDER_LETAL } from '../deck/mesa'
import { type CartaPublica, type CartaVisivel, chaveDano, type JogadorSala, type MesaPublica } from '../deck/partida'
import { arrastandoCarta } from './arrasto'
import { ContadoresDoJogador, SeloPT, SelosContadores } from './Contadores'
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
  onAmpliar: (jogador: string) => void  // abre o campo dele na tela toda
  onCarta: (jogador: string, carta: CartaPublica, e: React.MouseEvent) => void  // botão direito numa carta dele
  onSoltarCarta: (jogador: string, e: DragEvent) => void  // arrastei uma carta minha até ele: dou o controle
}

type PropsJogador = Omit<Props, 'jogadores' | 'vez'> & { jogador: JogadorSala; naVez: boolean }

// Soltar uma carta no painel de alguém passa o controle pra ele (quem está fora do jogo não recebe)
function useSoltar(jogador: JogadorSala, onSoltarCarta: Props['onSoltarCarta']) {
  const [sobre, setSobre] = useState(false)
  if (jogador.eliminado) return { sobre: false, props: {} }
  return {
    sobre,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!arrastandoCarta(e)) return
        e.preventDefault()
        setSobre(true)
      },
      onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(false) },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setSobre(false)
        onSoltarCarta(jogador.id, e)
      },
    },
  }
}

const SOBRE = 'ring-2 ring-sky-400 ring-offset-2 ring-offset-fundo'

// Os outros jogadores em cima do meu campo. Num duelo, o outro ocupa tudo; com mais gente, um fica
// grande (quem está na vez, ou o que eu escolher) e os outros ficam menores do lado
export function Oponentes({ jogadores, vez, ...props }: Props) {
  const [fixado, setFixado] = useState<string | null>(null)
  const naVez = (j: JogadorSala) => j.id === vez

  if (jogadores.length === 1) {
    return (
      <div className="flex min-h-0 flex-1 border-b border-borda bg-black/20 p-1">
        <Oponente jogador={jogadores[0]} naVez={naVez(jogadores[0])} {...props} />
      </div>
    )
  }

  const destaque = jogadores.find((j) => j.id === fixado) ?? jogadores.find(naVez) ?? jogadores.find((j) => !j.eliminado) ?? jogadores[0]
  const menores = jogadores.filter((j) => j !== destaque)
  return (
    <div className="flex min-h-0 flex-1 gap-1 border-b border-borda bg-black/20 p-1">
      <Oponente
        jogador={destaque}
        naVez={naVez(destaque)}
        {...props}
        extra={fixado === destaque.id && (
          <button onClick={() => setFixado(null)} className="text-apagado hover:text-texto" title="Voltar a mostrar grande quem está na vez">
            seguir a vez
          </button>
        )}
      />
      <div className="flex w-[30%] min-w-[200px] max-w-[360px] shrink-0 flex-col gap-1">
        {menores.map((j) => (
          <OponenteMenor key={j.id} jogador={j} naVez={naVez(j)} onEscolher={() => setFixado(j.id)} {...props} />
        ))}
      </div>
    </div>
  )
}

function Oponente({ jogador, naVez, danoRecebido, onDano, onPrevia, onVer, onAmpliar, onCarta, onSoltarCarta, extra }: PropsJogador & { extra?: React.ReactNode }) {
  const { mesa } = jogador
  const campoRef = useRef<HTMLDivElement>(null)
  const campo = useTamanho(campoRef)
  const soltar = useSoltar(jogador, onSoltarCarta)

  return (
    <section {...soltar.props} className={`relative flex min-w-0 flex-1 flex-col rounded-lg border bg-painel/70 ${naVez ? 'border-destaque shadow-[0_0_18px_-4px] shadow-destaque/60' : 'border-borda'} ${soltar.sobre ? SOBRE : ''}`}>
      {soltar.sobre && <DicaSoltar nome={jogador.nome} />}
      <Cabecalho jogador={jogador} naVez={naVez} onVer={onVer} onAmpliar={onAmpliar}>{extra}</Cabecalho>
      {jogador.eliminado ? <Eliminado /> : mesa && (
        <div className="flex min-h-0 flex-1">
          <Commanders jogador={jogador} mesa={mesa} danoRecebido={danoRecebido} onDano={onDano} onPrevia={onPrevia} />
          <div ref={campoRef} className="relative min-w-0 flex-1 overflow-hidden">
            <CampoReduzido mesa={mesa} largura={campo.largura} altura={campo.altura} onPrevia={onPrevia} onCarta={(c, e) => onCarta(jogador.id, c, e)} />
          </div>
        </div>
      )}
    </section>
  )
}

// Versão pequena: o resumo e o campo bem reduzido. Clicar traz ele pro destaque (pra anotar dano de commander, etc)
function OponenteMenor({ jogador, naVez, onPrevia, onVer, onAmpliar, onCarta, onSoltarCarta, onEscolher }: PropsJogador & { onEscolher: () => void }) {
  const { mesa } = jogador
  const campoRef = useRef<HTMLDivElement>(null)
  const campo = useTamanho(campoRef)
  const soltar = useSoltar(jogador, onSoltarCarta)

  return (
    <section
      {...soltar.props}
      onClick={onEscolher}
      title={`Mostrar ${jogador.nome} grande`}
      className={`relative flex min-h-0 flex-1 cursor-pointer flex-col rounded-lg border bg-painel/70 transition hover:border-destaque/60 ${naVez ? 'border-destaque shadow-[0_0_12px_-4px] shadow-destaque/60' : 'border-borda'} ${soltar.sobre ? SOBRE : ''}`}
    >
      {soltar.sobre && <DicaSoltar nome={jogador.nome} />}
      <Cabecalho jogador={jogador} naVez={naVez} compacto onVer={onVer} onAmpliar={onAmpliar} />
      {jogador.eliminado ? <Eliminado /> : mesa && (
        <div ref={campoRef} className="relative min-h-0 flex-1 overflow-hidden">
          <CampoReduzido mesa={mesa} largura={campo.largura} altura={campo.altura} onPrevia={onPrevia} onCarta={(c, e) => onCarta(jogador.id, c, e)} />
        </div>
      )}
    </section>
  )
}

function Cabecalho({ jogador, naVez, compacto, onVer, onAmpliar, children }: {
  jogador: JogadorSala; naVez: boolean; compacto?: boolean
  onVer: Props['onVer']; onAmpliar?: Props['onAmpliar']; children?: React.ReactNode
}) {
  const { mesa } = jogador
  // Os botões do cabeçalho não contam como clique no oponente menor (que traz ele pro destaque)
  const sem = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f() }
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borda/60 px-2 py-1 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
        <span className={`h-2 w-2 shrink-0 rounded-full ${jogador.conectado ? 'bg-emerald-400' : 'bg-stone-500'}`} title={jogador.conectado ? 'Conectado' : 'Desconectado'} />
        <span className={`truncate ${jogador.eliminado ? 'text-apagado line-through' : ''}`}>{jogador.nome}</span>
        {naVez && <span className="rounded bg-destaque px-1.5 text-[10px] font-bold uppercase text-fundo">vez</span>}
      </span>
      {jogador.eliminado ? (
        <span className="text-apagado">fora do jogo</span>
      ) : mesa ? (
        <>
          <span className={`text-sm font-bold ${mesa.vida <= 0 ? 'text-red-400' : ''}`} title="Vida">♥ {mesa.vida}</span>
          <ContadoresDoJogador contadores={mesa.contadores} />
          <span className="text-apagado" title="Cartas na mão">Mão {mesa.mao}</span>
          {!compacto && <span className="text-apagado" title="Cartas no grimório">Grimório {mesa.biblioteca}</span>}
          <button onClick={sem(() => onVer(`Cemitério de ${jogador.nome}`, mesa.cemiterio))} className="text-apagado hover:text-texto" title="Cemitério">
            {compacto ? 'Cem.' : 'Cemitério'} {mesa.cemiterio.length}
          </button>
          <button onClick={sem(() => onVer(`Exílio de ${jogador.nome}`, mesa.exilio))} className="text-apagado hover:text-texto" title="Exílio">
            {compacto ? 'Exí.' : 'Exílio'} {mesa.exilio.length}
          </button>
          {mesa.fase !== 'jogo' && <span className="text-amber-200">escolhendo a mão…</span>}
          {children}
          {onAmpliar && <button onClick={sem(() => onAmpliar(jogador.id))} className="ml-auto rounded border border-borda px-1.5 text-apagado hover:bg-painel-2 hover:text-texto" title="Ver o campo inteiro, grande">
            ⤢ {compacto ? '' : 'Ver campo'}
          </button>}
        </>
      ) : (
        <span className="text-apagado">ainda sem mesa</span>
      )}
    </header>
  )
}

function DicaSoltar({ nome }: { nome: string }) {
  return (
    <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-sky-950/70 text-sm font-semibold text-sky-100">
      Soltar pra dar o controle a {nome}
    </p>
  )
}

function Eliminado() {
  return <p className="flex flex-1 items-center justify-center p-2 text-xs text-apagado">Fora do jogo: as cartas dele saíram da mesa</p>
}

// Os commanders dele: onde estão, o imposto, e quanto dano cada um já me deu (eu que anoto, como na mesa de verdade)
function Commanders({ jogador, mesa, danoRecebido, onDano, onPrevia, largura = 74 }: {
  jogador: JogadorSala; mesa: MesaPublica; danoRecebido: Record<string, number>
  onDano: Props['onDano']; onPrevia: Props['onPrevia']; largura?: number
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-borda/60 p-1" style={{ width: largura }}>
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

// O campo dele inteiro, reduzido pra caber (mantendo as posições em que ele colocou as cartas).
// `maxEscala` acima de 1 deixa aumentar, pra ver o campo grande
function CampoReduzido({ mesa, largura, altura, onPrevia, onCarta, maxEscala = 1 }: {
  mesa: MesaPublica; largura: number; altura: number; onPrevia: Props['onPrevia']; maxEscala?: number
  onCarta: (carta: CartaPublica, e: React.MouseEvent) => void
}) {
  const original = mesa.tamanhoCampo
  const escala = Math.min(maxEscala, largura / original.largura, altura / original.altura)
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
          onContextMenu={(e) => { e.stopPropagation(); onCarta(c, e) }}
          title="Botão direito: pegar o controle"
        >
          <div className="transition-transform duration-200" style={{ transform: c.virada ? 'rotate(90deg)' : undefined }}>
            <ImagemCarta carta={c.carta} className="shadow-md shadow-black/60 ring-1 ring-black/40" />
          </div>
          {c.token && <span className="absolute bottom-1 left-1 rounded bg-fundo/90 px-1.5 text-[10px] font-semibold uppercase text-apagado">token</span>}
          <SelosContadores contadores={c.contadores} />
          <SeloPT carta={c.carta} ajuste={c.ajuste} contadores={c.contadores} />
        </div>
      ))}
    </div>
  )
}

// O campo de um jogador na tela toda, do tamanho que couber (atualiza ao vivo, como o resto da mesa)
export function CampoAmpliado({ jogador, naVez, danoRecebido, onDano, onPrevia, onVer, onCarta, onFechar }: Omit<PropsJogador, 'onAmpliar' | 'onSoltarCarta'> & { onFechar: () => void }) {
  const campoRef = useRef<HTMLDivElement>(null)
  const campo = useTamanho(campoRef)
  const { mesa } = jogador
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85 p-2 backdrop-blur-sm sm:p-4" onClick={onFechar}>
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-borda bg-painel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-borda pr-2">
          <div className="min-w-0 flex-1">
            <Cabecalho jogador={jogador} naVez={naVez} onVer={onVer} />
          </div>
          <button onClick={onFechar} className="rounded-lg border border-borda px-3 py-1 text-sm hover:bg-painel-2">Fechar</button>
        </div>
        {mesa && (
          <div className="flex min-h-0 flex-1">
            <Commanders jogador={jogador} mesa={mesa} danoRecebido={danoRecebido} onDano={onDano} onPrevia={onPrevia} largura={120} />
            <div ref={campoRef} className="relative min-w-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,#2a2119_0%,#120e0b_85%)]">
              <CampoReduzido mesa={mesa} largura={campo.largura} altura={campo.altura} onPrevia={onPrevia} maxEscala={2} onCarta={(c, e) => onCarta(jogador.id, c, e)} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
