"""Contas: criar, entrar e sair. O login fica num cookie httpOnly (o JavaScript da página não consegue ler)."""
import base64
import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, Response
from psycopg.errors import UniqueViolation

from api.banco import pool
from api.modelos import Login, NovaConta, Usuario

router = APIRouter(tags = ["contas"])

COOKIE = "sessao"
DURACAO_SESSAO = 30 * 24 * 3600  # segundos
# Em produção (https) o cookie só vai por conexão segura
COOKIE_SEGURO = os.environ.get("COOKIE_SEGURO", "") == "1"

# scrypt (da biblioteca padrão): ~50ms e 32MB por senha, pra deixar caro testar senhas em massa
N, R, P = 2 ** 15, 8, 1


def gerar_hash(senha: str) -> str:
    sal = secrets.token_bytes(16)
    h = hashlib.scrypt(senha.encode(), salt = sal, n = N, r = R, p = P, maxmem = 64 * 1024 * 1024)
    b64 = lambda b: base64.b64encode(b).decode()
    return f"scrypt${N}${R}${P}${b64(sal)}${b64(h)}"


def conferir_senha(senha: str, guardado: str) -> bool:
    _, n, r, p, sal, h = guardado.split("$")
    calculado = hashlib.scrypt(senha.encode(), salt = base64.b64decode(sal), n = int(n), r = int(r), p = int(p), maxmem = 64 * 1024 * 1024)
    return hmac.compare_digest(calculado, base64.b64decode(h))


# Quando o login não existe, confere contra este hash mesmo assim: a resposta demora o mesmo tanto
# e não dá pra descobrir pelo tempo quais usuários existem
HASH_FALSO = gerar_hash(secrets.token_hex())

# Errou a senha muitas vezes seguidas num mesmo login: espera um pouco (fica na memória do servidor)
MAX_ERROS, JANELA_ERROS = 10, 15 * 60
erros: dict[str, deque[float]] = defaultdict(deque)


def bloqueado(login: str) -> bool:
    tentativas = erros[login]
    while tentativas and tentativas[0] < time.monotonic() - JANELA_ERROS:
        tentativas.popleft()
    return len(tentativas) >= MAX_ERROS


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def abrir_sessao(conn, usuario_id: int, resposta: Response):
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (%s, %s, now() + make_interval(secs => %s))",
        (hash_token(token), usuario_id, DURACAO_SESSAO),
    )
    resposta.set_cookie(COOKIE, token, max_age = DURACAO_SESSAO, httponly = True, samesite = "lax", secure = COOKIE_SEGURO)


def usuario_opcional(request: Request) -> Usuario | None:
    """Quem está logado (pelo cookie), ou None."""
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    with pool.connection() as conn:
        linha = conn.execute("""
            SELECT u.id, u.usuario, u.email FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
            WHERE s.token_hash = %s AND s.expira_em > now()
        """, (hash_token(token),)).fetchone()
    return Usuario(**linha) if linha else None


def usuario_atual(request: Request) -> Usuario:
    """Pra usar com Depends nas rotas que precisam de conta."""
    usuario = usuario_opcional(request)
    if not usuario:
        raise HTTPException(401, "Entre na sua conta")
    return usuario


@router.post("/contas", response_model = Usuario, status_code = 201)
def criar_conta(nova: NovaConta, resposta: Response):
    """Cria a conta e já entra nela."""
    senha_hash = gerar_hash(nova.senha)
    try:
        with pool.connection() as conn:
            linha = conn.execute(
                "INSERT INTO usuarios (usuario, email, senha_hash) VALUES (%s, %s, %s) RETURNING id, usuario, email",
                (nova.usuario, nova.email.strip(), senha_hash),
            ).fetchone()
            abrir_sessao(conn, linha["id"], resposta)
    except UniqueViolation as erro:
        qual = "e-mail" if "email" in str(erro.diag.constraint_name) else "nome de usuário"
        raise HTTPException(409, f"Esse {qual} já tem conta")
    return linha


@router.post("/login", response_model = Usuario)
def entrar(login: Login, resposta: Response):
    chave = login.login.strip().lower()
    if bloqueado(chave):
        raise HTTPException(429, "Muitas tentativas erradas. Espere uns minutos e tente de novo")
    with pool.connection() as conn:
        linha = conn.execute(
            "SELECT id, usuario, email, senha_hash FROM usuarios WHERE lower(usuario) = %(l)s OR lower(email) = %(l)s",
            {"l": chave},
        ).fetchone()
        if not conferir_senha(login.senha, linha["senha_hash"] if linha else HASH_FALSO) or not linha:
            erros[chave].append(time.monotonic())
            raise HTTPException(401, "Usuário ou senha errados")
        erros.pop(chave, None)
        # aproveita pra limpar as sessões vencidas dessa pessoa
        conn.execute("DELETE FROM sessoes WHERE usuario_id = %s AND expira_em <= now()", (linha["id"],))
        abrir_sessao(conn, linha["id"], resposta)
    return linha


@router.post("/logout", status_code = 204)
def sair(request: Request, resposta: Response):
    token = request.cookies.get(COOKIE)
    if token:
        with pool.connection() as conn:
            conn.execute("DELETE FROM sessoes WHERE token_hash = %s", (hash_token(token),))
    resposta.delete_cookie(COOKIE, httponly = True, samesite = "lax", secure = COOKIE_SEGURO)


@router.get("/eu", response_model = Usuario)
def eu(request: Request):
    """Quem está logado; 401 se ninguém."""
    return usuario_atual(request)
