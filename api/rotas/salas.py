"""Salas pra jogar Commander com os amigos, em tempo real (WebSocket).

Cada jogador é dono da própria mesa: o navegador dele guarda tudo (inclusive a mão e o grimório, que
ninguém mais vê) e manda pra cá só a parte pública (campo, cemitério, exílio, vida, quantas cartas tem
na mão...). O servidor guarda as salas na memória, repassa as mesas e o histórico pra todo mundo e
controla de quem é a vez. Reiniciar a API apaga as salas; as mesas continuam no navegador de cada um.

Mensagens do navegador pro servidor (JSON, campo `tipo`):
    deck     {"deck": {...}}       o deck que escolhi (nome e commanders, pra sala de espera)
    mesa     {"mesa": {...}}       a parte pública da minha mesa (substitui a anterior)
    log      {"texto": "..."}      uma jogada pro histórico da sala
    chat     {"texto": "..."}      mensagem pros outros
    regras   {"regra_mulligan": ...}   só o dono, antes de começar: "commander" (1º grátis) ou "london"
    comecar                        só o dono da sala: sorteia a ordem e quem começa, e começa a partida
    passar                         só quem está na vez: passa pro próximo
    dado     {"lados": 20, "quantos": 1}   rola dados (lados 2 é uma moeda); o resultado vai pro histórico
    transferir {"para": "...", "carta": {...}, "devolvendo": bool, "zona": ..., "posicao": ...}
                                   passa o controle de uma carta do meu campo pra outro jogador (ou devolve pro dono)
    pedir    {"de": "...", "id": 3}        pega o controle de uma carta do campo de outro (o navegador dele entrega)
    eliminado                      fui eliminado: a vez passa a me pular e os outros tiram minhas cartas da mesa
    sair                           sai da sala de vez (fechar a aba só desconecta)

Do servidor pro navegador:
    voce     {"id": "..."}                       quem eu sou, logo ao conectar
    sala     {...}                               a sala inteira (ao conectar e quando alguém entra, sai, começa, passa a vez)
    mesa     {"jogador": "...", "mesa": {...}}   a mesa de alguém mudou
    log      {"linha": {...}}                    linha nova no histórico (`destaque`: dado, moeda ou sorteio, que aparece pra todos)
    transferir {"de": "...", ...}                uma carta chegando pra mim (o mesmo que o outro mandou)
    pedido   {"por": "...", "id": 3}             alguém pegou o controle de uma carta minha
Transferências e pedidos pra quem está desconectado ficam guardados e chegam quando ele voltar.
"""
import hashlib
import json
import random
import secrets
import time
from dataclasses import dataclass, field

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(prefix = "/salas", tags = ["salas"])

MAX_JOGADORES = 6
LETRAS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem 0/O e 1/I, pra ler em voz alta sem confusão
TAMANHO_CODIGO = 5
MAX_LOG = 300
MAX_TEXTO = 300
MAX_MESA = 512 * 1024  # bytes do JSON da mesa pública (um campo lotado de cartas dá ~60KB)
ABANDONADA = 6 * 3600  # sala sem ninguém conectado por esse tempo é apagada
REGRAS_MULLIGAN = ("commander", "london")
LADOS_DADO = (2, 4, 6, 8, 10, 12, 20)  # 2: moeda
MAX_DADOS = 10
MAX_CARTA = 20 * 1024  # bytes de uma carta transferida
MAX_PENDENTES = 200

sorteio = random.SystemRandom()  # dados e ordem da mesa: ninguém consegue prever

# Códigos de fechamento do WebSocket que o site entende
SALA_NAO_EXISTE = 4404
SALA_CHEIA = 4403
SUBSTITUIDA = 4409  # a mesma pessoa abriu a sala em outra aba


@dataclass
class Jogador:
    id: str
    nome: str
    conexao: WebSocket | None = None
    deck: dict | None = None
    mesa: dict | None = None
    eliminado: bool = False
    pendentes: list[dict] = field(default_factory = list)  # mensagens pra ele que chegaram enquanto estava fora

    def resumo(self) -> dict:
        return {
            "id": self.id, "nome": self.nome, "conectado": self.conexao is not None, "deck": self.deck, "mesa": self.mesa,
            "eliminado": self.eliminado,
        }


@dataclass
class Sala:
    codigo: str
    dono: str | None = None
    jogadores: dict[str, Jogador] = field(default_factory = dict)  # na ordem dos assentos
    comecou: bool = False
    vez: str | None = None
    turno: int = 0  # quantas vezes a vez passou desde o começo (1 = primeiro turno da partida)
    regra_mulligan: str = "commander"
    log: list[dict] = field(default_factory = list)
    sem_ninguem_desde: float = field(default_factory = time.monotonic)

    def resumo(self) -> dict:
        return {
            "codigo": self.codigo, "dono": self.dono, "comecou": self.comecou, "vez": self.vez, "turno": self.turno,
            "regra_mulligan": self.regra_mulligan,
            "jogadores": [j.resumo() for j in self.jogadores.values()], "log": self.log,
        }

    def conectados(self):
        return [j for j in self.jogadores.values() if j.conexao]

    async def enviar(self, mensagem: dict):
        texto = json.dumps(mensagem)
        for j in self.conectados():
            try:
                await j.conexao.send_text(texto)
            except Exception:
                pass  # caiu agora: o `finally` da conexão dele cuida

    async def enviar_sala(self):
        await self.enviar({"tipo": "sala", "sala": self.resumo()})

    async def registrar(self, jogador: Jogador | None, texto: str, chat: bool = False, destaque: bool = False):
        linha = {"jogador": jogador.id if jogador else None, "texto": texto[:MAX_TEXTO], "chat": chat, "quando": time.time()}
        if destaque:
            linha["destaque"] = True
        self.log = [*self.log[-(MAX_LOG - 1):], linha]
        await self.enviar({"tipo": "log", "linha": linha})

    async def entregar(self, para: Jogador, mensagem: dict):
        """Mensagem só pra um jogador; se ele estiver fora, guarda pra quando voltar."""
        if para.conexao:
            try:
                return await para.conexao.send_text(json.dumps(mensagem))
            except Exception:
                pass
        para.pendentes = [*para.pendentes[-(MAX_PENDENTES - 1):], mensagem]

    def proximo(self, depois_de: str | None) -> str | None:
        """O próximo na mesa que ainda está no jogo."""
        ids = list(self.jogadores)
        vivos = [i for i in ids if not self.jogadores[i].eliminado]
        if not vivos:
            return None
        if depois_de not in ids:
            return vivos[0]
        inicio = ids.index(depois_de)
        return next(ids[(inicio + k) % len(ids)] for k in range(1, len(ids) + 1) if ids[(inicio + k) % len(ids)] in vivos)

    async def eliminar(self, jogador: Jogador):
        jogador.eliminado = True
        await self.registrar(None, f"{jogador.nome} foi eliminado", destaque = True)
        vivos = [j for j in self.jogadores.values() if not j.eliminado]
        if self.vez == jogador.id:
            self.vez, self.turno = self.proximo(jogador.id), self.turno + 1
            if self.vez and len(vivos) > 1:
                await self.registrar(None, f"Vez de {self.jogadores[self.vez].nome}")
        if len(vivos) == 1:
            await self.registrar(None, f"{vivos[0].nome} venceu a partida!", destaque = True)


salas: dict[str, Sala] = {}


def id_publico(segredo: str) -> str:
    # O segredo fica só no navegador do jogador; os outros só veem esse id, então ninguém se passa por ele
    return hashlib.sha256(segredo.encode()).hexdigest()[:12]


def limpar_abandonadas():
    agora = time.monotonic()
    for codigo, sala in list(salas.items()):
        if not sala.conectados() and agora - sala.sem_ninguem_desde > ABANDONADA:
            del salas[codigo]


class NovaSala(BaseModel):
    regra_mulligan: str = "commander"


@router.post("")
def criar_sala(pedido: NovaSala | None = None):
    """Cria uma sala vazia e devolve o código pra passar pros amigos."""
    regra = pedido.regra_mulligan if pedido else "commander"
    if regra not in REGRAS_MULLIGAN:
        raise HTTPException(422, f"Regra de mulligan desconhecida: {regra}")
    limpar_abandonadas()
    while (codigo := "".join(secrets.choice(LETRAS_CODIGO) for _ in range(TAMANHO_CODIGO))) in salas:
        pass
    salas[codigo] = Sala(codigo, regra_mulligan = regra)
    return {"codigo": codigo}


@router.get("/{codigo}")
def ver_sala(codigo: str):
    """Quem está na sala (pra tela de entrada mostrar antes de conectar)."""
    sala = salas.get(codigo.upper())
    if not sala:
        raise HTTPException(404, "Sala não encontrada")
    return {
        "codigo": sala.codigo, "comecou": sala.comecou,
        "jogadores": [{"nome": j.nome, "conectado": j.conexao is not None} for j in sala.jogadores.values()],
    }


async def tratar(sala: Sala, jogador: Jogador, msg: dict) -> bool:
    """Trata uma mensagem do jogador. Devolve False quando ele sai da sala."""
    tipo = msg.get("tipo")
    if tipo == "deck" and isinstance(msg.get("deck"), dict) and len(json.dumps(msg["deck"])) <= MAX_TEXTO * 20:
        jogador.deck = msg["deck"]
        await sala.enviar_sala()
    elif tipo == "mesa" and isinstance(msg.get("mesa"), dict):
        if len(json.dumps(msg["mesa"])) <= MAX_MESA:
            jogador.mesa = msg["mesa"]
            await sala.enviar({"tipo": "mesa", "jogador": jogador.id, "mesa": jogador.mesa})
    elif tipo in ("log", "chat") and isinstance(msg.get("texto"), str) and msg["texto"].strip():
        await sala.registrar(jogador, msg["texto"].strip(), chat = tipo == "chat")
    elif tipo == "regras" and jogador.id == sala.dono and not sala.comecou and msg.get("regra_mulligan") in REGRAS_MULLIGAN:
        sala.regra_mulligan = msg["regra_mulligan"]
        await sala.enviar_sala()
    elif tipo == "comecar" and jogador.id == sala.dono and not sala.comecou:
        # Sorteia os assentos: a ordem do dicionário é a ordem dos turnos, e o primeiro começa
        ordem = list(sala.jogadores.values())
        sorteio.shuffle(ordem)
        sala.jogadores = {j.id: j for j in ordem}
        sala.comecou, sala.vez, sala.turno = True, ordem[0].id, 1
        await sala.registrar(None, f"Sorteio: {ordem[0].nome} começa. Ordem: {', '.join(j.nome for j in ordem)}", destaque = True)
        await sala.enviar_sala()
    elif tipo == "dado" and msg.get("lados") in LADOS_DADO:
        quantos = msg.get("quantos", 1)
        if isinstance(quantos, int) and 1 <= quantos <= MAX_DADOS:
            await sala.registrar(jogador, rolar(msg["lados"], quantos), destaque = True)
    elif tipo == "transferir" and isinstance(msg.get("carta"), dict) and len(json.dumps(msg["carta"])) <= MAX_CARTA:
        para = sala.jogadores.get(msg.get("para"))
        if para and para is not jogador:
            await sala.entregar(para, {
                "tipo": "transferir", "de": jogador.id, "carta": msg["carta"], "devolvendo": bool(msg.get("devolvendo")),
                "zona": msg.get("zona"), "posicao": msg.get("posicao"),
            })
    elif tipo == "pedir" and isinstance(msg.get("id"), int):
        dono = sala.jogadores.get(msg.get("de"))
        if dono and dono is not jogador and not dono.eliminado:
            await sala.entregar(dono, {"tipo": "pedido", "por": jogador.id, "id": msg["id"]})
    elif tipo == "eliminado" and sala.comecou and not jogador.eliminado:
        await sala.eliminar(jogador)
        await sala.enviar_sala()
    elif tipo == "passar" and sala.comecou and jogador.id == sala.vez:
        sala.vez, sala.turno = sala.proximo(jogador.id), sala.turno + 1
        await sala.registrar(None, f"Vez de {sala.jogadores[sala.vez].nome}")
        await sala.enviar_sala()
    elif tipo == "sair":
        return False
    return True


@router.websocket("/{codigo}/ws")
async def conectar(ws: WebSocket, codigo: str, segredo: str, nome: str):
    await ws.accept()
    sala = salas.get(codigo.upper())
    if not sala:
        return await ws.close(SALA_NAO_EXISTE, "Sala não encontrada")

    id_jogador = id_publico(segredo)
    nome = nome.strip()[:24] or "Jogador"
    jogador = sala.jogadores.get(id_jogador)
    if jogador is None:
        if len(sala.jogadores) >= MAX_JOGADORES:
            return await ws.close(SALA_CHEIA, "Sala cheia")
        jogador = sala.jogadores[id_jogador] = Jogador(id_jogador, nome)
        sala.dono = sala.dono or id_jogador
        await sala.registrar(None, f"{nome} entrou na sala")
    elif jogador.conexao:
        # Abriu em outra aba: a nova assume, a antiga fica sabendo
        antiga, jogador.conexao = jogador.conexao, None
        try:
            await antiga.close(SUBSTITUIDA, "Aberta em outra aba")
        except Exception:
            pass
    jogador.nome, jogador.conexao = nome, ws

    await ws.send_text(json.dumps({"tipo": "voce", "id": id_jogador}))
    await sala.enviar_sala()
    pendentes, jogador.pendentes = jogador.pendentes, []
    for mensagem in pendentes:
        await sala.entregar(jogador, mensagem)

    saiu = False
    try:
        while True:
            try:
                msg = json.loads(await ws.receive_text())
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict) and not await tratar(sala, jogador, msg):
                saiu = True
                break
    except WebSocketDisconnect:
        pass
    finally:
        if jogador.conexao is ws:  # se outra aba assumiu, não é pra mexer
            jogador.conexao = None
            if saiu:
                await sair(sala, jogador)
            if not sala.conectados():
                sala.sem_ninguem_desde = time.monotonic()
            await sala.enviar_sala()
    if saiu:
        await ws.close()


def rolar(lados: int, quantos: int) -> str:
    """Rola os dados (ou joga as moedas) e descreve o resultado pro histórico."""
    if lados == 2:
        faces = [sorteio.choice(("cara", "coroa")) for _ in range(quantos)]
        return f"Jogou uma moeda: {faces[0]}" if quantos == 1 else f"Jogou {quantos} moedas: {', '.join(faces)}"
    valores = [sorteio.randint(1, lados) for _ in range(quantos)]
    if quantos == 1:
        return f"Rolou 1d{lados}: {valores[0]}"
    return f"Rolou {quantos}d{lados}: {' + '.join(map(str, valores))} = {sum(valores)}"


async def sair(sala: Sala, jogador: Jogador):
    if sala.vez == jogador.id:
        sala.vez = sala.proximo(jogador.id)
    del sala.jogadores[jogador.id]
    if sala.vez == jogador.id or not sala.jogadores:
        sala.vez = None
    if sala.dono == jogador.id:
        sala.dono = next(iter(sala.jogadores), None)  # o próximo da mesa vira o dono
    await sala.registrar(None, f"{jogador.nome} saiu da sala")
