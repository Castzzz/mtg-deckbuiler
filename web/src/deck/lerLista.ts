// Lê uma lista de deck colada pelo usuário, nos formatos que o Moxfield, o Archidekt,
// o MTG Arena e a maioria dos sites exportam:
//
//   1 Sol Ring                          1x Sol Ring (c21) 263 [Ramp]
//   1 Sol Ring (C21) 263 *F*            1 Edgar Markov *CMDR*
//   Commander / Deck / Sideboard        1x Edgar Markov (c17) 36 [Commander{top}]
//   // Commander                        SIDEBOARD:
//
// Sideboard e maybeboard vêm separados (`secao`); tokens e o resto que não é carta do deck ficam de fora

import type { Secao } from './regras'

export interface LinhaLida {
  nome: string
  qtd: number
  commander: boolean
  secao: Secao
}

export interface ListaLida {
  linhas: LinhaLida[]
  ignoradas: string[] // linhas que não parecem carta
}

type SecaoLista = Secao | 'commander' | 'fora'

// Seções que não entram no deck principal
const SECOES_SIDEBOARD = /^(sideboard|side|companion)$/
const SECOES_MAYBEBOARD = /^(maybeboard|maybe|considering)$/
const SECOES_FORA = /^(tokens?|acquireboard|attractions?|stickers?)$/
const SECOES_COMMANDER = /^(commanders?|command zone|cmdr)$/
const SECOES_DECK = /^(deck|main ?deck|mainboard|main)$/

export function lerLista(texto: string): ListaLida {
  const linhas: LinhaLida[] = []
  const ignoradas: string[] = []
  let secao: SecaoLista = 'cartas'

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue

    // Cabeçalho de seção: "Commander", "// Sideboard", "SIDEBOARD:", "Creatures (32)"
    const cabecalho = linha.replace(/^\/\/\s*/, '').replace(/:$/, '').replace(/\s*\(\d+\)$/, '').trim().toLowerCase()
    if (SECOES_COMMANDER.test(cabecalho)) { secao = 'commander'; continue }
    if (SECOES_SIDEBOARD.test(cabecalho)) { secao = 'sideboard'; continue }
    if (SECOES_MAYBEBOARD.test(cabecalho)) { secao = 'maybeboard'; continue }
    if (SECOES_FORA.test(cabecalho)) { secao = 'fora'; continue }
    if (SECOES_DECK.test(cabecalho)) { secao = 'cartas'; continue }
    if (linha.startsWith('//') || linha.startsWith('#')) continue  // comentário
    if (/^[^\d].*\(\d+\)$/.test(linha)) continue  // cabeçalho de categoria com contagem: "Creatures (32)"

    const m = linha.match(/^(?:(\d+)\s*x?\s+)?(.+)$/i)!
    const qtd = m[1] ? Number(m[1]) : 1
    let resto = m[2]

    // Categorias do Archidekt entre colchetes: [Commander{top}], [Ramp,Maybeboard{noDeck}{noPrice}]
    const categorias = [...resto.matchAll(/\[([^\]]*)\]/g)].map((c) => c[1])
    resto = resto.replace(/\[[^\]]*\]/g, ' ')
    const marcadoCommander = /\*CMDR\*/i.test(resto) || categorias.some((c) => /(^|,)\s*commander\b/i.test(c))
    // No Archidekt, categoria Sideboard vai pro sideboard; Maybeboard ou qualquer outra marcada {noDeck}, pro maybeboard
    const naCategoria: Secao | null = categorias.some((c) => /sideboard/i.test(c)) ? 'sideboard'
      : categorias.some((c) => /\{noDeck\}|maybeboard/i.test(c)) ? 'maybeboard' : null

    const nome = resto
      .replace(/\*[A-Z]+\*/gi, ' ')               // *F*, *E*, *CMDR*
      .replace(/\^[^^]*\^/g, ' ')                 // tags do Moxfield: ^Tag^
      .replace(/\s#\S+/g, ' ')                    // #tag
      .replace(/\s\([A-Za-z0-9]{2,6}\)\s*[\w★-]*\s*$/, ' ')  // edição e número: (C21) 263
      .replace(/\s+/g, ' ')
      .trim()

    if (!nome || /^\d+$/.test(nome)) { ignoradas.push(linha); continue }
    if (secao === 'fora') continue
    const commander = !naCategoria && (secao === 'commander' || (secao === 'cartas' && marcadoCommander))
    linhas.push({ nome, qtd, commander, secao: naCategoria ?? (secao === 'commander' ? 'cartas' : secao) })
  }

  return { linhas: juntarRepetidas(linhas), ignoradas }
}

// A mesma carta em duas linhas (ex: em duas categorias) vira uma linha só (em cada seção)
function juntarRepetidas(linhas: LinhaLida[]): LinhaLida[] {
  const porNome = new Map<string, LinhaLida>()
  for (const l of linhas) {
    const chave = `${l.secao}:${l.nome.toLowerCase()}`
    const atual = porNome.get(chave)
    if (atual) {
      atual.qtd += l.qtd
      atual.commander ||= l.commander
    } else {
      porNome.set(chave, { ...l })
    }
  }
  return [...porNome.values()]
}
