import { useEffect, useState } from 'react'

export function useDebounce<T>(valor: T, atraso = 250): T {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), atraso)
    return () => clearTimeout(t)
  }, [valor, atraso])
  return atrasado
}
