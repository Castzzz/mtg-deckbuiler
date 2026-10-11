import { type RefObject, useEffect, useState } from 'react'

// Tamanho atual de um elemento (acompanha quando a janela muda)
export function useTamanho(ref: RefObject<HTMLElement | null>) {
  const [tamanho, setTamanho] = useState({ largura: 800, altura: 500 })
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setTamanho({ largura: e.contentRect.width, altura: e.contentRect.height }))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref])
  return tamanho
}
