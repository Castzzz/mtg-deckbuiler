"""Atualiza tudo em ordem: cartas novas, edições e preços, tokens, decks do Archidekt e recomendações.

Feito pra rodar todo dia (ver deploy/systemd/), mas dá pra rodar na mão também. Se uma etapa falhar,
as outras rodam mesmo assim, e o comando termina com erro no fim. A API percebe sozinha quando as
recomendações ou os preços mudam e recarrega, sem precisar reiniciar.

Uso:
    python -m pipeline.atualizar                  # coleta decks por até 2h
    python -m pipeline.atualizar --minutos 30
    python -m pipeline.atualizar --sem-coleta     # só cartas, preços e recomendações (~3 min)
"""
import argparse
import subprocess
import sys
import time
from datetime import datetime


def rodar(nome: str, modulo: str, *args: str) -> bool:
    print(f"\n[{datetime.now():%Y-%m-%d %H:%M}] ==> {nome}", flush = True)
    inicio = time.monotonic()
    # Cada etapa num processo separado: um erro numa não derruba as outras
    ok = subprocess.run([sys.executable, "-u", "-m", modulo, *args]).returncode == 0
    print(f"[{datetime.now():%Y-%m-%d %H:%M}] {'ok' if ok else 'FALHOU'}: {nome} ({(time.monotonic() - inicio) / 60:.1f} min)",
          flush = True)
    return ok


def main():
    parser = argparse.ArgumentParser(description = __doc__, formatter_class = argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--minutos", type = float, default = 120, help = "tempo máximo da coleta de decks (padrão: 120)")
    parser.add_argument("--sem-coleta", action = "store_true", help = "não coleta decks do Archidekt")
    args = parser.parse_args()

    etapas = [
        ("Cartas novas (Scryfall)", "pipeline.importar_scryfall"),
        ("Edições e preços (Scryfall)", "pipeline.importar_impressoes"),
        ("Tokens (Scryfall)", "pipeline.importar_tokens"),
    ]
    if not args.sem_coleta:
        etapas.append(("Decks do Archidekt", "pipeline.coletar_archidekt", "--minutos", str(args.minutos)))
    etapas.append(("Recomendações", "pipeline.calcular_recomendacoes"))

    falhas = [nome for nome, *comando in etapas if not rodar(nome, *comando)]
    if falhas:
        print(f"\nTerminou com falha em: {', '.join(falhas)}")
        sys.exit(1)
    print("\nTudo atualizado.")


if __name__ == "__main__":
    main()
