import { useEffect } from 'react'

// O site pega a cor do deck: destaque (botões, links), brilho do fundo e a faixa colorida.
// Preto vira um cinza esfumaçado (como o símbolo de mana) e branco vira marfim, senão não aparecem no fundo escuro
export const CORES: Record<string, { base: string; forte: string }> = {
  W: { base: '#e4dfcf', forte: '#fbf8ef' },
  U: { base: '#4f9be6', forte: '#84bef6' },
  B: { base: '#8f8681', forte: '#c4bbb6' },
  R: { base: '#e5654d', forte: '#f89480' },
  G: { base: '#4cb67d', forte: '#7dd7a4' },
  C: { base: '#9fb1c3', forte: '#c8d5e2' },
}
const ORDEM = ['W', 'U', 'B', 'R', 'G']
const VARIAVEIS = ['--color-destaque', '--color-destaque-forte', '--brilho-a', '--brilho-b', '--faixa']

export function paletaDoDeck(identidade: string[]) {
  const cores = ORDEM.filter((c) => identidade.includes(c))
  if (!cores.length) cores.push('C')
  // Branco é claro demais e preto apagado demais pra botão: num deck multicolor, o destaque é a primeira
  // cor que não seja nenhum dos dois (Edgar, WBR: vermelho); Orzhov fica com o preto
  const principal = cores.find((c) => c !== 'W' && c !== 'B') ?? cores.find((c) => c !== 'W') ?? cores[0]
  const segunda = cores.find((c) => c !== principal) ?? principal
  return {
    '--color-destaque': CORES[principal].base,
    '--color-destaque-forte': CORES[principal].forte,
    '--brilho-a': CORES[principal].base,
    '--brilho-b': CORES[segunda].base,
    '--faixa': `linear-gradient(90deg, ${cores.length > 1 ? cores.map((c) => CORES[c].base).join(', ') : `${CORES[principal].base}, ${CORES[principal].forte}`})`,
  }
}

// Enquanto a página estiver aberta, o site inteiro (cabeçalho incluído) usa as cores do deck
export function useCoresDoDeck(identidade: string[] | null) {
  const chave = identidade ? [...identidade].sort().join('') : null
  useEffect(() => {
    if (chave === null) return
    const raiz = document.documentElement.style
    for (const [nome, valor] of Object.entries(paletaDoDeck(chave.split('')))) raiz.setProperty(nome, valor)
    return () => VARIAVEIS.forEach((nome) => raiz.removeProperty(nome))
  }, [chave])
}
