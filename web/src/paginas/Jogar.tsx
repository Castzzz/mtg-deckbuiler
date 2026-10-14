import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/cliente'
import { useConta } from '../conta'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { type ControlePartida, Tabuleiro } from '../componentes/Tabuleiro'
import type { Deck } from '../deck/armazenamento'
import { useDecks } from '../deck/armazenamento'
import { type RegraMulligan, TAMANHO_MAO } from '../deck/mao'
import { novaMesa } from '../deck/mesa'
import { type Conexao, identidade, lerPartida, type MinhaPartida, salvarIdentidade, salvarPartida, useSala, visivel } from '../deck/partida'
import { comArte, totalCartas } from '../deck/regras'

const botao = 'rounded-lg border border-borda px-4 py-2 text-sm hover:bg-painel-2 disabled:cursor-not-allowed disabled:opacity-40'
const principal = 'rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-fundo hover:bg-destaque-forte disabled:cursor-not-allowed disabled:opacity-40'
const campo = 'w-full rounded-xl border border-borda bg-fundo px-4 py-2.5 text-sm outline-none placeholder:text-apagado focus:border-destaque/60'

// Sem nome escolhido ainda, começa com o da conta
function useNome() {
  const { usuario } = useConta()
  const [nome, setNome] = useState(() => identidade().nome || usuario?.usuario || '')
  const salvar = (novo: string) => {
    setNome(novo)
    salvarIdentidade({ ...identidade(), nome: novo })
  }
  return [nome, salvar] as const
}

function CampoNome({ nome, onNome }: { nome: string; onNome: (n: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-apagado">Seu nome na mesa</span>
      <input value={nome} onChange={(e) => onNome(e.target.value)} maxLength={24} placeholder="Ex: Rafael" className={`${campo} mt-1`} />
    </label>
  )
}

const REGRAS: [RegraMulligan, string, string][] = [
  ['commander', '1º mulligan grátis', 'Regra comum nas mesas de Commander: o primeiro mulligan não custa carta'],
  ['london', 'London', 'A cada mulligan, compra 7 e devolve 1 carta a mais pro fundo'],
]

function EscolhaMulligan({ regra, onRegra }: { regra: RegraMulligan; onRegra?: (r: RegraMulligan) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-apagado">Mulligan</span>
      <div className="flex rounded-xl border border-borda p-1 text-sm" role="group" aria-label="Regra de mulligan">
        {REGRAS.map(([r, rotulo, dica]) => (
          <button
            key={r}
            type="button"
            onClick={() => onRegra?.(r)}
            disabled={!onRegra}
            title={dica}
            className={`rounded-lg px-3 py-1 font-medium disabled:cursor-default ${regra === r ? 'bg-painel-2 text-destaque-forte' : 'text-apagado enabled:hover:text-texto'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

// /jogar: criar uma sala ou entrar numa com o código
export function Jogar() {
  const [nome, setNome] = useNome()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [regra, setRegra] = useState<RegraMulligan>('commander')
  const navegar = useNavigate()

  async function criar() {
    setCriando(true)
    setErro(null)
    try {
      navegar(`/jogar/${(await api.criarSala(regra)).codigo}`)
    } catch {
      setErro('Não consegui criar a sala (a API está rodando?).')
      setCriando(false)
    }
  }

  function entrar(e: FormEvent) {
    e.preventDefault()
    const limpo = codigo.trim().toUpperCase()
    if (limpo) navegar(`/jogar/${limpo}`)
  }

  return (
    <section className="mx-auto mt-10 max-w-lg">
      <h1 className="font-titulo text-2xl font-bold text-destaque-forte">Jogar com os amigos</h1>
      <p className="mt-1 text-sm text-apagado">
        Cada um usa um deck salvo no próprio navegador. A mão e o grimório ficam só com você; os outros veem o campo, os cemitérios e a vida.
      </p>
      <div className="mt-6 space-y-5 rounded-2xl border border-borda bg-painel p-5">
        <CampoNome nome={nome} onNome={setNome} />
        <EscolhaMulligan regra={regra} onRegra={setRegra} />
        <button onClick={criar} disabled={!nome.trim() || criando} className={`${principal} w-full`}>
          {criando ? 'Criando…' : 'Criar uma sala'}
        </button>
        <form onSubmit={entrar} className="flex gap-2 border-t border-borda pt-5">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            maxLength={5}
            placeholder="Código da sala"
            className={`${campo} font-mono uppercase tracking-widest`}
          />
          <button disabled={!nome.trim() || !codigo.trim()} className={botao}>Entrar</button>
        </form>
        {erro && <p className="text-sm text-red-300">{erro}</p>}
      </div>
    </section>
  )
}

// /jogar/:codigo: sala de espera e, depois que começa, a mesa
export function SalaDeJogo() {
  const { codigo = '' } = useParams()
  const sala = codigo.toUpperCase()
  const [nome, setNome] = useNome()
  const [confirmado, setConfirmado] = useState(() => !!identidade().nome.trim())

  if (!confirmado) {
    return (
      <section className="mx-auto mt-10 max-w-lg rounded-2xl border border-borda bg-painel p-5">
        <h1 className="font-titulo text-xl font-semibold">Entrar na sala <span className="font-mono text-destaque-forte">{sala}</span></h1>
        <form onSubmit={(e) => { e.preventDefault(); if (nome.trim()) setConfirmado(true) }} className="mt-4 space-y-4">
          <CampoNome nome={nome} onNome={setNome} />
          <button disabled={!nome.trim()} className={`${principal} w-full`}>Entrar</button>
        </form>
      </section>
    )
  }
  return <NaSala codigo={sala} nome={nome.trim()} />
}

const PROBLEMA: Partial<Record<Conexao['estado'], string>> = {
  'nao-existe': 'Essa sala não existe (ou a API foi reiniciada e ela sumiu).',
  cheia: 'A sala está cheia.',
  'outra-aba': 'Você abriu essa sala em outra aba.',
}

function NaSala({ codigo, nome }: { codigo: string; nome: string }) {
  const conexao = useSala(codigo, nome)
  const decks = useDecks()
  const navegar = useNavigate()
  const [partida, setPartida] = useState<MinhaPartida | null>(() => lerPartida(codigo))
  const { sala, eu, estado, enviar } = conexao
  const meuDeck = partida && decks.find((d) => d.id === partida.deckId)

  // Quando o dono começa, quem já tinha escolhido o deck ganha a mesa (e vai pro mulligan)
  useEffect(() => {
    if (sala?.comecou && partida && !partida.mesa && meuDeck) guardar({ ...partida, mesa: novaMesa(meuDeck, Math.random, true) })
  }, [sala?.comecou, partida, meuDeck])

  function guardar(nova: MinhaPartida | null) {
    setPartida(nova)
    salvarPartida(codigo, nova)
  }

  function escolher(deck: Deck) {
    guardar({ deckId: deck.id, mesa: null, turnoFeito: 0, logEnviado: 0 })
    enviar({ tipo: 'deck', deck: { nome: deck.nome, commanders: deck.commanders.map((c) => visivel(comArte(deck, c))) } })
  }

  function sair() {
    enviar({ tipo: 'sair' })
    salvarPartida(codigo, null)
    navegar('/jogar')
  }

  const problema = PROBLEMA[estado]
  if (problema) {
    return (
      <div className="py-20 text-center text-apagado">
        {problema} <Link to="/jogar" className="text-destaque hover:underline">Voltar</Link>
      </div>
    )
  }
  if (!sala || !eu) return <p className="py-20 text-center text-apagado">Conectando na sala {codigo}…</p>
  const souDono = sala.dono === eu

  // Já começou e eu tenho mesa: joga
  if (sala.comecou && partida?.mesa && meuDeck) {
    const controle: ControlePartida = {
      conexao: { ...conexao, sala, eu },
      inicial: { mesa: partida.mesa, turnoFeito: partida.turnoFeito, logEnviado: partida.logEnviado },
      onSalvar: (estado) => salvarPartida(codigo, { deckId: meuDeck.id, ...estado }),
      onSair: sair,
    }
    return <Tabuleiro key={codigo} deck={meuDeck} partida={controle} />
  }

  const jogaveis = decks.filter((d) => d.commanders.length && totalCartas(d) >= TAMANHO_MAO)
  const todosComDeck = sala.jogadores.every((j) => j.deck)

  // Começou (ou entrei depois): monta a mesa com o deck escolhido
  function entrarNaPartida(deck: Deck) {
    escolher(deck)
    guardar({ deckId: deck.id, mesa: novaMesa(deck, Math.random, true), turnoFeito: 0, logEnviado: 0 })
  }

  return (
    <section className="mx-auto mt-8 max-w-4xl">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm text-apagado">Sala</p>
          <h1 className="font-mono text-3xl font-bold tracking-widest text-destaque-forte">{codigo}</h1>
        </div>
        <button onClick={() => navigator.clipboard?.writeText(location.href)} className={botao} title={location.href}>Copiar link</button>
        <button onClick={sair} className={`${botao} ml-auto`}>Sair da sala</button>
      </div>
      <p className="mt-2 text-sm text-apagado">
        Passe o código ou o link pros seus amigos. {sala.comecou ? 'A partida já começou: escolha seu deck pra entrar.' : 'Quando todo mundo tiver escolhido o deck, o dono da sala começa (quem joga primeiro é sorteado).'}
      </p>
      <div className="mt-4">
        {/* Só o dono muda, e só antes de começar */}
        <EscolhaMulligan
          regra={sala.regra_mulligan}
          onRegra={souDono && !sala.comecou ? (r) => enviar({ tipo: 'regras', regra_mulligan: r }) : undefined}
        />
      </div>

      <h2 className="mt-6 font-semibold">Na mesa ({sala.jogadores.length})</h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {sala.jogadores.map((j) => (
          <li key={j.id} className="flex items-center gap-3 rounded-xl border border-borda bg-painel p-3">
            <div className="flex w-12 shrink-0">
              {j.deck?.commanders.map((c, i) => <ImagemCarta key={c.oracle_id} carta={c} className={`w-12 ${i ? '-ml-8 mt-2' : ''}`} />)}
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                <span className={`h-2 w-2 rounded-full ${j.conectado ? 'bg-emerald-400' : 'bg-stone-500'}`} />
                {j.nome}{j.id === eu && <span className="text-xs font-normal text-apagado">(você)</span>}
                {j.id === sala.dono && <span className="text-xs font-normal text-destaque">dono</span>}
              </p>
              <p className="truncate text-sm text-apagado">{j.deck ? j.deck.nome : 'escolhendo o deck…'}</p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-semibold">{sala.comecou ? 'Entrar com o deck' : 'Seu deck'}</h2>
      {partida && !meuDeck && <p className="mt-1 text-sm text-red-300">O deck que você tinha escolhido não está mais neste navegador.</p>}
      {!jogaveis.length && (
        <p className="mt-2 text-sm text-apagado">
          Você não tem nenhum deck com commander e pelo menos {TAMANHO_MAO} cartas. <Link to="/decks" className="text-destaque hover:underline">Ver meus decks</Link>
        </p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {jogaveis.map((d) => {
          const escolhido = partida?.deckId === d.id
          return (
            <button
              key={d.id}
              onClick={() => (sala.comecou ? entrarNaPartida(d) : escolher(d))}
              className={`flex items-center gap-3 rounded-xl border p-2 text-left transition hover:border-destaque/60 ${escolhido ? 'border-destaque bg-painel-2' : 'border-borda bg-painel'}`}
            >
              <ImagemCarta carta={comArte(d, d.commanders[0])} className="w-10 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{d.nome}</span>
                <span className="text-xs text-apagado">{totalCartas(d)} cartas{escolhido ? ' · escolhido' : ''}</span>
              </span>
            </button>
          )
        })}
      </div>

      {!sala.comecou && (
        <div className="mt-8 flex items-center gap-4">
          {souDono ? (
            <button onClick={() => enviar({ tipo: 'comecar' })} disabled={!todosComDeck} className={principal}>Começar a partida</button>
          ) : (
            <p className="text-sm text-apagado">Esperando o dono da sala começar…</p>
          )}
          {souDono && !todosComDeck && <p className="text-sm text-apagado">Falta alguém escolher o deck.</p>}
        </div>
      )}
    </section>
  )
}
