import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { criarConta, entrar, useConta } from '../conta'
import { useDecks } from '../deck/armazenamento'

const principal = 'rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-fundo hover:bg-destaque-forte disabled:cursor-not-allowed disabled:opacity-40'
const campo = 'mt-1 w-full rounded-lg border border-borda bg-fundo px-4 py-2.5 text-sm outline-none placeholder:text-apagado focus:border-destaque/60'

// Entrar e criar conta na mesma página (/entrar e /criar-conta)
export function Entrar({ criando = false }: { criando?: boolean }) {
  const { usuario } = useConta()
  const decks = useDecks()
  const navegar = useNavigate()
  // volta pra onde estava (ex: a página do deck)
  const voltar = (useLocation().state as { de?: string } | null)?.de ?? '/decks'
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (usuario) {
    return (
      <section className="mx-auto mt-16 max-w-sm text-center">
        <p>Você já está na conta <span className="font-semibold text-destaque-forte">{usuario.usuario}</span>.</p>
        <Link to="/decks" className="mt-4 inline-block text-sm text-destaque hover:underline">Ver meus decks</Link>
      </section>
    )
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      if (criando) await criarConta(login.trim(), email.trim(), senha)
      else await entrar(login.trim(), senha)
      navegar(voltar, { replace: true })
    } catch (erro) {
      setErro(erro instanceof Error ? erro.message : 'Não deu certo, tente de novo')
    } finally {
      setEnviando(false)
    }
  }

  const usuarioValido = /^[A-Za-z0-9_]{3,20}$/.test(login.trim())
  const pode = criando ? usuarioValido && email.includes('@') && senha.length >= 8 : login.trim() && senha

  return (
    <section className="mx-auto mt-12 max-w-sm">
      <h1 className="font-titulo text-2xl font-bold text-texto">{criando ? 'Criar conta' : 'Entrar'}</h1>
      <p className="mt-1 text-sm text-apagado">
        Com conta, seus decks ficam guardados e aparecem em qualquer computador.
        {decks.length > 0 && (decks.length === 1 ? ' O deck deste navegador vai pra ela.' : ` Os ${decks.length} decks deste navegador vão pra ela.`)}
      </p>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm text-apagado">{criando ? 'Nome de usuário' : 'Usuário ou e-mail'}</span>
          <input
            value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required
            autoComplete="username" maxLength={criando ? 20 : 254} className={campo}
          />
          {criando && login.trim() && !usuarioValido && (
            <span className="mt-1 block text-xs text-red-300">De 3 a 20 letras, números ou _ (sem espaço nem acento)</span>
          )}
        </label>
        {criando && (
          <label className="block">
            <span className="text-sm text-apagado">E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={campo} />
          </label>
        )}
        <label className="block">
          <span className="text-sm text-apagado">Senha{criando && ' (pelo menos 8 caracteres)'}</span>
          <input
            type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required
            autoComplete={criando ? 'new-password' : 'current-password'} className={campo}
          />
        </label>
        {erro && <p role="alert" className="text-sm text-red-300">{erro}</p>}
        <button disabled={!pode || enviando} className={`${principal} w-full`}>
          {enviando ? 'Um momento…' : criando ? 'Criar conta' : 'Entrar'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-apagado">
        {criando
          ? <>Já tem conta? <Link to="/entrar" state={{ de: voltar }} className="text-destaque hover:underline">Entrar</Link></>
          : <>Ainda não tem? <Link to="/criar-conta" state={{ de: voltar }} className="text-destaque hover:underline">Criar conta</Link></>}
      </p>
    </section>
  )
}
