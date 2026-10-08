import { fazemDupla } from '../api/parceria'
import type { CartaImportada } from '../api/tipos'
import type { CartaNoDeck } from './armazenamento'
import type { ListaLida } from './lerLista'
import { podeRepetir } from './regras'

export interface Analise {
  candidatos: CartaImportada[]  // cartas da lista que podem ser commander
  cartas: CartaNoDeck[]         // o que vai entrar no deck (sem os commanders)
  naoEncontradas: string[]
  banidas: string[]
  foraDasCores: string[]
  copiasAMais: string[]         // mais de uma cópia de carta que só pode ter uma (fica 1)
}

// Commanders marcados na lista (seção Commander, *CMDR*, categoria do Archidekt)
export function sugerirCommanders(lida: ListaLida, achadas: Record<string, CartaImportada>): string[] {
  const marcados = lida.linhas
    .filter((l) => l.commander && achadas[l.nome]?.pode_ser_commander)
    .map((l) => achadas[l.nome])
  if (marcados.length >= 2 && fazemDupla(marcados[0], marcados[1])) return [marcados[0].oracle_id, marcados[1].oracle_id]
  return marcados.slice(0, 1).map((c) => c.oracle_id)
}

export function analisar(lida: ListaLida, achadas: Record<string, CartaImportada>, commanders: string[]): Analise {
  const analise: Analise = { candidatos: [], cartas: [], naoEncontradas: [], banidas: [], foraDasCores: [], copiasAMais: [] }
  const escolhidos = commanders.map((id) => Object.values(achadas).find((c) => c.oracle_id === id)).filter((c) => !!c)
  const identidade = new Set(escolhidos.flatMap((c) => c.identidade_cor))
  const vistas = new Set<string>()

  for (const linha of lida.linhas) {
    const carta = achadas[linha.nome]
    if (!carta) { analise.naoEncontradas.push(linha.nome); continue }
    if (carta.pode_ser_commander && carta.legal && !analise.candidatos.some((c) => c.oracle_id === carta.oracle_id)) {
      analise.candidatos.push(carta)
    }
    if (commanders.includes(carta.oracle_id)) continue
    if (!carta.legal) { analise.banidas.push(carta.nome); continue }
    if (escolhidos.length && carta.identidade_cor.some((cor) => !identidade.has(cor))) { analise.foraDasCores.push(carta.nome); continue }
    // Nomes diferentes pra mesma carta (ex: "Delver of Secrets" e o nome completo) contam uma vez
    if (vistas.has(carta.oracle_id)) continue
    vistas.add(carta.oracle_id)

    let qtd = linha.qtd
    if (qtd > 1 && !podeRepetir(carta)) {
      analise.copiasAMais.push(`${carta.nome} (${qtd}x)`)
      qtd = 1
    }
    analise.cartas.push({ carta, qtd })
  }
  return analise
}
