import type { Carta } from './tipos'

// Como chamar o parceiro, de acordo com a habilidade do commander
export function rotuloParceiro(parceria: string): string {
  if (parceria === 'escolhe_background') return 'Background'
  if (parceria === 'companheiro') return 'Doctor'
  if (parceria === 'doctor') return 'companion'
  if (parceria === 'background') return 'commander'
  return 'parceiro'
}

// Mesma regra do GET /commanders/{id}/parceiros (api/rotas/commanders.py)
const PARES = new Set(['escolhe_background|background', 'background|escolhe_background', 'companheiro|doctor', 'doctor|companheiro'])

export function fazemDupla(a: Carta, b: Carta): boolean {
  if (!a.parceria || !b.parceria || a.oracle_id === b.oracle_id) return false
  if (a.parceria === 'partner' || a.parceria.startsWith('partner:')) return a.parceria === b.parceria
  if (a.parceria.startsWith('partner_with:')) {
    const citado = a.parceria.slice('partner_with:'.length)
    return citado === b.nome || citado === b.nome.split(' // ')[0]
  }
  return PARES.has(`${a.parceria}|${b.parceria}`)
}
