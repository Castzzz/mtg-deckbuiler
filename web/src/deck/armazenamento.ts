import { useSyncExternalStore } from 'react'
import { api, ErroApi } from '../api/cliente'
import type { Carta, Edicao } from '../api/tipos'
import { nomePadrao } from './regras'

// Os decks ficam no navegador (localStorage). Com conta, ficam no servidor e o navegador guarda uma cópia:
// cada mudança vale na hora aqui e vai pro servidor logo depois (ou quando a internet voltar)

// De onde a carta veio: no futuro, pra dar menos peso no grafo às cartas que vieram das nossas sugestões
export type Origem = 'busca' | 'sugestao' | 'importada' | 'basico'

export interface CartaNoDeck {
  carta: Carta
  qtd: number
  origem?: Origem
}

export interface Deck {
  id: string
  nome: string
  commanders: Carta[]
  cartas: CartaNoDeck[]
  // Fora do deck: o sideboard (respostas pra trocar conforme a mesa, cartas que buscam "de fora do jogo")
  // e o maybeboard (as que você está pensando em pôr). Não contam nas 100 cartas
  sideboard?: CartaNoDeck[]
  maybeboard?: CartaNoDeck[]
  // Arte escolhida pra cada carta (oracle_id -> edição); sem escolha, usa a padrão do Scryfall
  artes?: Record<string, Edicao>
  criadoEm: string
  atualizadoEm: string
}

const CHAVE = 'mtg-deckbuilder:decks'
const ouvintes = new Set<() => void>()
let cache: Deck[] | null = null

function ler(): Deck[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
  } catch {
    cache = []
  }
  return cache!
}

function gravar(decks: Deck[]) {
  cache = decks
  try {
    localStorage.setItem(CHAVE, JSON.stringify(decks))
  } catch {
    // modo privado / armazenamento cheio: continua funcionando só na memória
  }
  ouvintes.forEach((f) => f())
}

// Outra aba mexeu nos decks
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE) {
    cache = null
    ouvintes.forEach((f) => f())
  }
})

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export function useDecks(): Deck[] {
  return useSyncExternalStore(assinar, ler)
}

export function useDeck(id: string): Deck | undefined {
  return useDecks().find((d) => d.id === id)
}

export function criarDeck(commanders: Carta[], cartas: CartaNoDeck[] = [], nome?: string, fora: Pick<Deck, 'sideboard' | 'maybeboard'> = {}): Deck {
  const agora = new Date().toISOString()
  const deck: Deck = {
    id: crypto.randomUUID(),
    nome: nome || nomePadrao(commanders),
    commanders,
    cartas,
    ...fora,
    criadoEm: agora,
    atualizadoEm: agora,
  }
  gravar([deck, ...ler()])
  marcar(deck.id)
  return deck
}

// marcarEdicao = false pra mudanças que não são do usuário (ex: atualizar preços; o servidor já manda os de hoje)
export function atualizarDeck(id: string, mudar: (deck: Deck) => Partial<Deck>, marcarEdicao = true) {
  gravar(ler().map((d) => (d.id === id ? { ...d, ...mudar(d), ...(marcarEdicao && { atualizadoEm: new Date().toISOString() }) } : d)))
  if (marcarEdicao) marcar(id)
}

export function apagarDeck(id: string) {
  gravar(ler().filter((d) => d.id !== id))
  marcar(id, true)
}

// --- Com conta ---

// De quem é a cópia que está aqui, e o que mudou e ainda não chegou no servidor
interface Sincronia {
  usuario: number
  pendentes: string[]  // decks pra mandar (criados ou mexidos)
  apagados: string[]
}

const CHAVE_SINCRONIA = 'mtg-deckbuilder:sincronia'
let sincronia: Sincronia | null | undefined  // undefined = ainda não leu

function lerSincronia(): Sincronia | null {
  if (sincronia === undefined) {
    try {
      sincronia = JSON.parse(localStorage.getItem(CHAVE_SINCRONIA) ?? 'null')
    } catch {
      sincronia = null
    }
  }
  return sincronia ?? null
}

function gravarSincronia(s: Sincronia | null) {
  sincronia = s
  try {
    if (s) localStorage.setItem(CHAVE_SINCRONIA, JSON.stringify(s))
    else localStorage.removeItem(CHAVE_SINCRONIA)
  } catch {
    // sem localStorage: fica na memória
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === CHAVE_SINCRONIA) sincronia = undefined
})

function mudarSincronia(mudar: (s: Sincronia) => Partial<Sincronia>) {
  const s = lerSincronia()
  if (s) gravarSincronia({ ...s, ...mudar(s) })
}

const sem = (lista: string[], id: string) => lista.filter((i) => i !== id)

function marcar(id: string, apagado = false) {
  if (!lerSincronia()) return  // sem conta: fica só aqui
  mudarSincronia((s) => (apagado
    ? { pendentes: sem(s.pendentes, id), apagados: [...sem(s.apagados, id), id] }
    : { pendentes: [...sem(s.pendentes, id), id], apagados: sem(s.apagados, id) }))
  agendarEnvio(800)  // espera um pouco: editando o deck, junta várias mudanças num envio só
}

let timer: ReturnType<typeof setTimeout> | undefined
function agendarEnvio(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void enviar().catch(() => agendarEnvio(15_000)), ms)
}

let enviando: Promise<void> | null = null

// A sessão acabou no meio (venceu, saiu em outra aba): quem cuida da conta fica sabendo
let aoPerderSessao = () => {}
export function quandoPerderSessao(f: () => void) {
  aoPerderSessao = f
}

// Manda pro servidor o que está pendente. Falhou (sem internet, servidor fora): tenta de novo depois
function enviar(): Promise<void> {
  if (!enviando) {
    enviando = (async () => {
      let s
      while ((s = lerSincronia()) && (s.apagados.length || s.pendentes.length)) {
        const apagado = s.apagados.length > 0
        const id = apagado ? s.apagados[0] : s.pendentes[0]
        const deck = ler().find((d) => d.id === id)
        try {
          if (apagado) await api.apagarDeck(id)
          else if (deck) {
            const salvo = await api.salvarDeck(deck)
            const agora = ler().find((d) => d.id === id)
            // mexido de novo enquanto ia: continua pendente (vai de novo na próxima volta)
            if (agora !== deck) continue
            // o do servidor era mais novo (mexido em outro aparelho): fica ele
            if (Date.parse(salvo.atualizadoEm) > Date.parse(deck.atualizadoEm)) gravar(ler().map((d) => (d.id === id ? salvo : d)))
          }
        } catch (erro) {
          if (!(erro instanceof ErroApi) || erro.status >= 500 || erro.status === 429) throw erro  // tenta de novo depois
          if (erro.status === 401) {
            semConta()
            aoPerderSessao()
            return
          }
          // o servidor não aceita (ex: carta que não existe mais): não adianta tentar de novo
          console.warn(`Não deu pra salvar o deck ${id} na conta: ${erro.message}`)
        }
        mudarSincronia((s) => apagado ? { apagados: sem(s.apagados, id) } : { pendentes: sem(s.pendentes, id) })
      }
    })().finally(() => { enviando = null })
  }
  return enviando
}

window.addEventListener('online', () => {
  if (lerSincronia()) agendarEnvio(0)
})

// Entrou na conta (ou abriu o site já logado): manda o que está pendente e traz os decks do servidor.
// Na primeira vez neste navegador, os decks que já estavam aqui vão pra conta
export async function sincronizar(usuario: number) {
  const atual = lerSincronia()
  if (atual?.usuario !== usuario) {
    if (atual) semConta()
    gravarSincronia({ usuario, pendentes: ler().map((d) => d.id), apagados: [] })
  }
  await enviar()
  if (!lerSincronia()) return  // a sessão caiu no meio
  const doServidor = await api.meusDecks()
  // o que mudou aqui enquanto buscava continua valendo
  const s = lerSincronia()
  if (!s) return
  const locais = new Map(ler().map((d) => [d.id, d]))
  const decks = doServidor.filter((d) => !s.apagados.includes(d.id)).map((d) => (s.pendentes.includes(d.id) && locais.get(d.id)) || d)
  const novos = s.pendentes.flatMap((id) => (decks.some((d) => d.id === id) ? [] : locais.get(id) ?? []))
  gravar([...novos, ...decks])
}

// Saiu da conta: tenta mandar o que falta e tira os decks dela deste navegador
export async function sairDosDecks() {
  clearTimeout(timer)
  await enviar().catch(() => {})
  gravarSincronia(null)
  gravar([])
}

// Sem sessão (venceu, ou saiu em outra aba): os decks da conta saem daqui, menos o que não chegou
// a ir pro servidor (vira deck só deste navegador, e vai pra conta quando entrar de novo)
export function semConta() {
  const s = lerSincronia()
  if (!s) return
  clearTimeout(timer)
  gravar(ler().filter((d) => s.pendentes.includes(d.id)))
  gravarSincronia(null)
}
