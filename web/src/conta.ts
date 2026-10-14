import { useSyncExternalStore } from 'react'
import { api, ErroApi } from './api/cliente'
import type { Usuario } from './api/tipos'
import { quandoPerderSessao, sairDosDecks, semConta, sincronizar } from './deck/armazenamento'

// Quem está logado. A conta é opcional: sem ela tudo funciona e os decks ficam só no navegador

interface EstadoConta {
  carregando: boolean  // ainda perguntando pro servidor
  usuario: Usuario | null
}

let estado: EstadoConta = { carregando: true, usuario: null }
const ouvintes = new Set<() => void>()

function definir(usuario: Usuario | null) {
  estado = { carregando: false, usuario }
  ouvintes.forEach((f) => f())
}

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export function useConta(): EstadoConta {
  return useSyncExternalStore(assinar, () => estado)
}

function trazerDecks(usuario: Usuario) {
  sincronizar(usuario.id).catch((erro) => console.warn('Não deu pra sincronizar os decks:', erro))
}

quandoPerderSessao(() => definir(null))

// Ao abrir o site: já tem sessão?
api.eu().then(
  (usuario) => {
    definir(usuario)
    trazerDecks(usuario)
  },
  (erro) => {
    // 401: não tem. Outro erro (servidor fora do ar): não mexe nos decks, que continuam aqui
    if (erro instanceof ErroApi && erro.status === 401) semConta()
    definir(null)
  },
)

export async function entrar(login: string, senha: string) {
  const usuario = await api.entrar(login, senha)
  definir(usuario)
  trazerDecks(usuario)
}

export async function criarConta(usuario: string, email: string, senha: string) {
  const conta = await api.criarConta(usuario, email, senha)
  definir(conta)
  trazerDecks(conta)
}

export async function sair() {
  await sairDosDecks()
  await api.sair().catch(() => {})
  definir(null)
}
