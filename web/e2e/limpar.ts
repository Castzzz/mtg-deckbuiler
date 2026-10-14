import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Apaga as contas criadas pelos testes (os decks delas vão junto, pelo ON DELETE CASCADE)
export default function limpar() {
  const raiz = fileURLToPath(new URL('../..', import.meta.url))
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'mtg', 'mtg', '-qc', "DELETE FROM usuarios WHERE usuario LIKE 'e2e\\_%'"], { cwd: raiz, stdio: 'ignore' })
}
