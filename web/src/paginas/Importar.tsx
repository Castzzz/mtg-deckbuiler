import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/cliente'
import { fazemDupla } from '../api/parceria'
import type { CartaImportada } from '../api/tipos'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { criarDeck, nomeCurto } from '../deck/armazenamento'
import { analisar, sugerirCommanders } from '../deck/importar'
import { lerLista, type ListaLida } from '../deck/lerLista'
import { TAMANHO_DECK } from '../deck/regras'

const EXEMPLO = `1 Edgar Markov *CMDR*
1 Sol Ring (C21) 263
1 Blood Artist
1 Viscera Seer
30 Swamp`

export function Importar() {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [lida, setLida] = useState<ListaLida | null>(null)
  const [commanders, setCommanders] = useState<string[]>([])
  const [nome, setNome] = useState('')

  const busca = useMutation({
    mutationFn: async (l: ListaLida) => {
      // A API aceita até 300 nomes por vez
      const nomes = l.linhas.map((x) => x.nome)
      const lotes = Array.from({ length: Math.ceil(nomes.length / 300) }, (_, i) => nomes.slice(i * 300, (i + 1) * 300))
      return Object.assign({}, ...(await Promise.all(lotes.map(api.cartasPorNome)))) as Record<string, CartaImportada>
    },
    onSuccess: (achadas, l) => setCommanders(sugerirCommanders(l, achadas)),
  })

  function ler() {
    const l = lerLista(texto)
    setLida(l)
    if (l.linhas.length) busca.mutate(l)
  }

  const achadas = busca.data
  const analise = lida && achadas ? analisar(lida, achadas, commanders) : null
  const escolhidos = analise ? commanders.map((id) => analise.candidatos.find((c) => c.oracle_id === id)!).filter(Boolean) : []
  const total = analise ? escolhidos.length + analise.cartas.reduce((s, c) => s + c.qtd, 0) : 0
  const opcoesDupla = escolhidos[0] ? analise!.candidatos.filter((c) => fazemDupla(escolhidos[0], c)) : []

  function criar() {
    const deck = criarDeck(escolhidos, analise!.cartas, nome.trim() || undefined)
    navigate(`/deck/${deck.id}`)
  }

  return (
    <section className="mx-auto mt-8 max-w-4xl">
      <h1 className="font-titulo text-2xl font-bold text-ouro-forte">Importar lista</h1>
      <p className="mt-1 text-sm text-apagado">
        Cole a lista exportada do Moxfield, do Archidekt, do MTG Arena ou qualquer lista no formato "1 Nome da carta".
      </p>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={EXEMPLO}
        rows={12}
        spellCheck={false}
        className="mt-4 w-full rounded-xl border border-borda bg-painel p-4 font-mono text-sm outline-none placeholder:text-apagado/60 focus:border-ouro/70 focus:ring-2 focus:ring-ouro/20"
      />
      <button
        onClick={ler}
        disabled={!texto.trim() || busca.isPending}
        className="mt-3 rounded-lg bg-ouro px-5 py-2 text-sm font-semibold text-fundo hover:bg-ouro-forte disabled:opacity-50"
      >
        {busca.isPending ? 'Procurando as cartas...' : 'Ler lista'}
      </button>

      {lida && !lida.linhas.length && <p className="mt-4 text-apagado">Não achei nenhuma carta nessa lista.</p>}
      {busca.isError && <p className="mt-4 text-red-300">Erro ao procurar as cartas: {busca.error.message}</p>}

      {analise && (
        <div className="mt-8 space-y-6 rounded-2xl border border-borda bg-painel p-5">
          <div>
            <h2 className="font-titulo text-lg font-semibold">Commander</h2>
            {!analise.candidatos.length ? (
              <p className="mt-2 text-sm text-red-300">
                Nenhuma carta da lista pode ser commander. Confira se o commander está na lista.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap items-start gap-6">
                <div className="flex shrink-0">
                  {escolhidos.map((c, i) => <ImagemCarta key={c.oracle_id} carta={c} className={`w-28 shadow-lg shadow-black/50 ${i ? '-ml-10 mt-4' : ''}`} />)}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  {!commanders.length && <p className="text-sm text-ouro-forte">A lista não diz quem é o commander: escolha abaixo.</p>}
                  <Seletor
                    rotulo="Commander"
                    valor={commanders[0] ?? ''}
                    opcoes={analise.candidatos}
                    onChange={(id) => setCommanders(id ? [id] : [])}
                  />
                  {escolhidos[0]?.parceria && opcoesDupla.length > 0 && (
                    <Seletor
                      rotulo="Dupla (opcional)"
                      valor={commanders[1] ?? ''}
                      opcoes={opcoesDupla}
                      onChange={(id) => setCommanders(id ? [commanders[0], id] : [commanders[0]])}
                    />
                  )}
                  <label className="block text-sm">
                    <span className="text-apagado">Nome do deck</span>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder={escolhidos.map(nomeCurto).join(' + ') || 'Meu deck'}
                      className="mt-1 w-full rounded-lg border border-borda bg-fundo px-3 py-2 outline-none focus:border-ouro/70"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-borda pt-5">
            <p className="text-sm">
              <span className="font-semibold text-emerald-300">{analise.cartas.length} cartas</span> vão entrar no deck
              ({total}/{TAMANHO_DECK} contando {escolhidos.length > 1 ? 'os commanders' : 'o commander'}).
            </p>
            <div className="mt-3 space-y-2">
              <Aviso titulo="Não encontradas" itens={analise.naoEncontradas} dica="Confira a grafia. Cartas digitais ou que acabaram de sair podem ainda não estar no banco." />
              <Aviso titulo="Banidas em Commander" itens={analise.banidas} dica="Ficaram de fora." />
              <Aviso titulo="Fora das cores do commander" itens={analise.foraDasCores} dica="Ficaram de fora." />
              <Aviso titulo="Cópias a mais" itens={analise.copiasAMais} dica="Em Commander cada carta só pode ter 1 cópia (fora básicos e exceções como Relentless Rats): entrou o máximo permitido." />
              {lida!.ignoradas.length > 0 && <Aviso titulo="Linhas ignoradas" itens={lida!.ignoradas} />}
            </div>
          </div>

          <button
            onClick={criar}
            disabled={!escolhidos.length}
            className="rounded-lg bg-ouro px-5 py-2 text-sm font-semibold text-fundo hover:bg-ouro-forte disabled:opacity-50"
          >
            Criar deck
          </button>
        </div>
      )}

      <p className="mt-6 text-sm text-apagado">
        Prefere começar do zero? <Link to="/" className="text-ouro hover:underline">Escolha um commander</Link>.
      </p>
    </section>
  )
}

function Seletor({ rotulo, valor, opcoes, onChange }: { rotulo: string; valor: string; opcoes: CartaImportada[]; onChange: (id: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-apagado">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-borda bg-fundo px-3 py-2 outline-none focus:border-ouro/70"
      >
        <option value="">Escolha...</option>
        {opcoes.map((c) => <option key={c.oracle_id} value={c.oracle_id}>{c.nome}</option>)}
      </select>
    </label>
  )
}

function Aviso({ titulo, itens, dica }: { titulo: string; itens: string[]; dica?: string }) {
  if (!itens.length) return null
  return (
    <details className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-amber-200">{titulo} ({itens.length})</summary>
      {dica && <p className="mt-1 text-xs text-apagado">{dica}</p>}
      <ul className="mt-2 columns-2 text-apagado">{itens.map((i) => <li key={i}>{i}</li>)}</ul>
    </details>
  )
}
