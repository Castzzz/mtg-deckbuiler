import type { Carta } from '../api/tipos'

export const TAMANHO_MAO = 7

// 'commander': o primeiro mulligan é grátis (regra usada nas mesas de Commander)
// 'london': a cada mulligan compra 7 e devolve 1 a mais pro fundo
export type RegraMulligan = 'commander' | 'london'

// Fisher-Yates; `aleatorio` dá pra trocar nos testes
export function embaralhar<T>(lista: T[], aleatorio = Math.random): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Quantas cartas vão pro fundo depois de manter, tendo feito `mulligans` mulligans
export function cartasADevolver(regra: RegraMulligan, mulligans: number): number {
  return Math.min(TAMANHO_MAO, regra === 'commander' ? Math.max(0, mulligans - 1) : mulligans)
}

export const ehTerreno = (carta: Carta) => carta.categoria === 'terreno'

// Leitura rápida da mão: terrenos, mágicas baratas e um veredito simples
export function avaliarMao(mao: Carta[]): { terrenos: number; baratas: number; veredito: string; boa: boolean } {
  const terrenos = mao.filter(ehTerreno).length
  const baratas = mao.filter((c) => !ehTerreno(c) && c.cmc <= 2).length
  if (terrenos <= 1) return { terrenos, baratas, veredito: 'Poucos terrenos: mulligan', boa: false }
  if (terrenos >= mao.length - 1) return { terrenos, baratas, veredito: 'Quase só terreno: mulligan', boa: false }
  if (terrenos === 2 && baratas === 0) return { terrenos, baratas, veredito: 'Arriscada: 2 terrenos e nada barato', boa: false }
  if (terrenos >= 5) return { terrenos, baratas, veredito: 'Muitos terrenos, pouca ação', boa: false }
  return { terrenos, baratas, veredito: 'Dá pra manter', boa: true }
}

// Combinação n escolhe k, em float (com deck de 100 cartas não estoura)
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

// Hipergeométrica: chance de vir entre `min` e `max` cartas "boas" comprando `compradas`
// de um monte com `total` cartas, das quais `boas` servem
export function chanceEntre(total: number, boas: number, compradas: number, min: number, max = compradas): number {
  if (compradas > total) return 0
  const todas = comb(total, compradas)
  let soma = 0
  for (let k = Math.max(0, min); k <= Math.min(max, boas, compradas); k++) {
    soma += comb(boas, k) * comb(total - boas, compradas - k)
  }
  return soma / todas
}

// Em Commander multiplayer ninguém pula a compra do turno 1: até o turno T você viu 7 + T cartas
export function chancesTerrenos(total: number, terrenos: number) {
  return [
    { rotulo: 'Abrir com 2 a 4 terrenos', chance: chanceEntre(total, terrenos, TAMANHO_MAO, 2, 4) },
    { rotulo: '3+ terrenos até o turno 3', chance: chanceEntre(total, terrenos, TAMANHO_MAO + 3, 3) },
    { rotulo: '4+ terrenos até o turno 4', chance: chanceEntre(total, terrenos, TAMANHO_MAO + 4, 4) },
  ]
}
