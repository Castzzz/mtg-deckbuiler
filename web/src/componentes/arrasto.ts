import type { DragEvent } from 'react'

// O que vai no arrastar de uma carta da mesa: qual é e onde ela foi pega, pra soltar no campo
// exatamente embaixo do mouse (ou no painel de outro jogador, pra dar o controle)
export const TIPO_ARRASTO = 'application/x-carta-mesa'
export interface Arrasto { id: number; dx: number; dy: number }

export function lerArrasto(e: DragEvent): Arrasto | null {
  try {
    const dado = JSON.parse(e.dataTransfer.getData(TIPO_ARRASTO))
    return typeof dado?.id === 'number' ? dado : null
  } catch {
    return null
  }
}

// No dragover só dá pra ver o tipo (o conteúdo só aparece no drop)
export const arrastandoCarta = (e: DragEvent) => e.dataTransfer.types.includes(TIPO_ARRASTO)
