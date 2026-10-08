// Como chamar o parceiro, de acordo com a habilidade do commander
export function rotuloParceiro(parceria: string): string {
  if (parceria === 'escolhe_background') return 'Background'
  if (parceria === 'companheiro') return 'Doctor'
  if (parceria === 'doctor') return 'companion'
  if (parceria === 'background') return 'commander'
  return 'parceiro'
}
