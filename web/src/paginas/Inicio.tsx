import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/cliente'
import { BuscaCommander } from '../componentes/BuscaCommander'
import { ImagemCarta } from '../componentes/ImagemCarta'
import { SimboloMana } from '../componentes/Simbolos'

export function Inicio() {
  const { data: populares, isPending, isError } = useQuery({ queryKey: ['commanders', 'populares'], queryFn: () => api.commanders(undefined, 24) })

  return (
    <>
      <section className="relative py-16 text-center sm:py-24">
        <div aria-hidden className="faixa-cores pointer-events-none absolute inset-x-0 top-6 -z-10 mx-auto h-56 max-w-3xl rounded-full opacity-15 blur-3xl" />
        <div className="flex justify-center gap-2" aria-hidden>
          {['W', 'U', 'B', 'R', 'G'].map((c) => <SimboloMana key={c} simbolo={c} tamanho={30} />)}
        </div>
        <h1 className="texto-cores mt-5 font-titulo text-4xl font-bold tracking-wide sm:text-5xl">Monte seu deck de Commander</h1>
        <p className="mx-auto mt-4 max-w-xl text-apagado">
          Escolha o commander e veja as cartas que mais combinam com ele, calculadas a partir de mais de 100 mil decks.
        </p>
        <div className="mx-auto mt-8 max-w-xl"><BuscaCommander grande /></div>
        <p className="mt-4 text-sm text-apagado">
          Já tem um deck? <Link to="/importar" className="text-destaque hover:underline">Importe a lista</Link> do Moxfield ou do Archidekt.
        </p>
      </section>

      <section>
        <h2 className="mb-4 font-titulo text-lg font-semibold text-texto">Commanders mais jogados</h2>
        {isError && <p className="text-apagado">Não consegui falar com a API. Ela está rodando?</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {isPending && Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[63/88] animate-pulse rounded-xl bg-painel" />)}
          {populares?.map((c) => (
            <Link key={c.oracle_id} to={`/commander/${c.oracle_id}`} className="group">
              <ImagemCarta carta={c} className="shadow-lg shadow-black/40 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-destaque/20" />
              <div className="mt-2 truncate text-sm font-medium group-hover:text-destaque-forte">{c.nome}</div>
              <div className="text-xs text-apagado">{c.num_decks.toLocaleString('pt-BR')} decks</div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
