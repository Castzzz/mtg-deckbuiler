import { useQuery } from '@tanstack/react-query'
import { type DragEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/cliente'
import type { Carta, Token } from '../api/tipos'
import { type Arrasto, lerArrasto, TIPO_ARRASTO } from './arrasto'
import { ImagemCarta } from './ImagemCarta'
import { useDebounce } from './useDebounce'
import type { Deck } from '../deck/armazenamento'
import { avaliarMao, cartasADevolver, ehTerreno, type RegraMulligan, TAMANHO_MAO } from '../deck/mao'
import {
  anotarNaMesa, type CartaMesa, comprar, CONTADORES_CARTA, CONTADORES_JOGADOR, copiar, criarToken, DANO_COMMANDER_LETAL, danoDeCommander,
  desvirarTudo, devolver, devolverAoDono, emprestar, embaralharGrimorio, ganharControle, imposto, lugarLivre, manter, type Mesa, mover,
  mudarContador, mudarContadorJogador, mudarPT, mudarVida, mulligan, NOME_ZONA, novaMesa, onde, poderResistencia, type Posicao, proximoTurno,
  rolar, semJogadores, zerarPT, completarCartas, type AjustePT,
  terrenosDesvirados, VENENO_LETAL, virar, voltou, type Zona, controleMudou, repassar, sairDoJogo, voltarProJogo,
} from '../deck/mesa'
import { type CartaPublica, type CartaVisivel, type Conexao, type Direta, mesaPublica, type MinhaPartida, type Sala } from '../deck/partida'
import { identidadeDeck } from '../deck/regras'
import { cartaDoToken, descreverToken, useTokensDoDeck } from '../deck/tokens'
import { useCoresDoDeck } from '../tema'
import { ContadoresDoJogador, SeloPT, SelosContadores } from './Contadores'
import { HistoricoSala } from './HistoricoSala'
import { CampoAmpliado, Oponentes } from './Oponentes'
import { useTamanho } from './useTamanho'

const CHAVE_REGRA = 'mtg-deckbuilder:regra-mulligan'

function regraSalva(): RegraMulligan {
  try {
    return localStorage.getItem(CHAVE_REGRA) === 'london' ? 'london' : 'commander'
  } catch {
    return 'commander'
  }
}

// Zoom do campo e da mão (Ctrl + rodinha, ou os botões − / +), guardado pro próximo jogo
const CHAVE_ZOOM = 'mtg-deckbuilder:zoom-mesa'
const ZOOMS = [0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2]
type Zoom = { campo: number; mao: number }

function zoomSalvo(): Zoom {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_ZOOM) ?? 'null')
    if (ZOOMS.includes(salvo?.campo) && ZOOMS.includes(salvo?.mao)) return salvo
  } catch {
    // estragado: volta pro normal
  }
  return { campo: 1, mao: 1 }
}

const DADOS: [number, string][] = [[2, 'Moeda'], [4, 'd4'], [6, 'd6'], [8, 'd8'], [10, 'd10'], [12, 'd12'], [20, 'd20']]

const botao = 'rounded-lg border border-borda px-3 py-1.5 text-sm hover:bg-painel-2 disabled:cursor-not-allowed disabled:opacity-40'
const principal = 'rounded-lg bg-destaque px-4 py-1.5 text-sm font-semibold text-fundo hover:bg-destaque-forte disabled:cursor-not-allowed disabled:opacity-40'

// Tamanho das cartas: no campo e nas pilhas, e na mão (um pouco maior, pra ler)
const CARTA = { largura: 96, altura: 134 }
const NA_MAO = 120

const ATALHOS: [string, string][] = [
  ['C', 'Comprar uma carta'],
  ['Espaço / N', 'Passar a vez (sozinho: próximo turno, desvira tudo e compra)'],
  ['U', 'Desvirar tudo'],
  ['S', 'Embaralhar o grimório'],
  ['O', 'Criar token'],
  ['+ / −', 'Ganhar / perder 1 de vida'],
  ['Ctrl+Z', 'Desfazer'],
  ['F', 'Tela cheia'],
  ['?', 'Mostrar os atalhos'],
]
const ATALHOS_CARTA: [string, string][] = [
  ['T', 'Virar / desvirar'],
  ['D', 'Criar uma cópia (token)'],
  ['P', 'Jogar no campo'],
  ['H', 'Voltar pra mão'],
  ['G', 'Mandar pro cemitério'],
  ['E', 'Exilar'],
  ['Y', 'Topo do grimório'],
  ['B', 'Fundo do grimório'],
  ['K', 'Commander de volta pra zona de comando'],
]
const ATALHOS_MULLIGAN: [string, string][] = [['Enter', 'Manter'], ['M', 'Mulligan']]

// Numa partida com os amigos: a sala (já conectada uma vez) e o que fica salvo da minha mesa
type EstadoPartida = Omit<MinhaPartida, 'deckId' | 'mesa'> & { mesa: Mesa }
export interface ControlePartida {
  conexao: Conexao & { sala: Sala; eu: string }
  inicial: EstadoPartida
  onSalvar: (estado: EstadoPartida) => void
  onSair: () => void
}

// Mesa na tela toda: campo livre (a carta fica onde for solta), pilhas do lado e mão embaixo.
// Sozinho é o teste do deck; com `partida`, os outros jogadores aparecem em cima do meu campo
export function Tabuleiro({ deck, partida }: { deck: Deck; partida?: ControlePartida }) {
  const [regra, setRegra] = useState<RegraMulligan>(regraSalva)
  const [mesa, setMesa] = useState(() => partida?.inicial.mesa ?? novaMesa(deck))
  const [turnoFeito, setTurnoFeito] = useState(partida?.inicial.turnoFeito ?? 0)
  const [logEnviado, setLogEnviado] = useState(partida?.inicial.logEnviado ?? 0)
  const [previa, setPrevia] = useState<{ carta: CartaVisivel; esquerda: boolean } | null>(null)  // carta de outro jogador
  const [vendoOutro, setVendoOutro] = useState<{ titulo: string; cartas: CartaPublica[] } | null>(null)
  const [passado, setPassado] = useState<Mesa[]>([])
  const [aDevolver, setADevolver] = useState<number[]>([])
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null)
  const [vendo, setVendo] = useState<Zona | null>(null)  // cemitério, exílio ou busca no grimório
  const [foco, setFoco] = useState<{ id: number; esquerda: boolean } | null>(null)  // carta embaixo do mouse
  const [arrastando, setArrastando] = useState(false)
  // Carta que sai da tela ao ser solta (foi pra outro jogador, pro cemitério...) não recebe o dragend: o drop avisa
  useEffect(() => {
    const parou = () => setArrastando(false)
    window.addEventListener('drop', parou, true)  // na captura: quem recebe o drop pode parar a propagação
    window.addEventListener('dragend', parou, true)
    return () => { window.removeEventListener('drop', parou, true); window.removeEventListener('dragend', parou, true) }
  }, [])
  const [painel, setPainel] = useState<'historico' | 'atalhos' | 'dados' | 'contadores' | 'sair' | null>(null)
  const [criandoToken, setCriandoToken] = useState(false)
  const [zoom, setZoom] = useState(zoomSalvo)
  const [vendoCampo, setVendoCampo] = useState<string | null>(null)  // campo de outro jogador na tela toda
  const [aviso, setAviso] = useState<{ texto: string; quando: number } | null>(null)  // dado, moeda, sorteio
  const [menuOutro, setMenuOutro] = useState<{ jogador: string; carta: CartaPublica; x: number; y: number } | null>(null)  // carta de outro jogador
  const [naoPerdi, setNaoPerdi] = useState<string | null>(null)  // "ainda não perdi" pra esse motivo
  // A mesa mais atual, pra quem não pode esperar o React (as mensagens dos outros chegando juntas)
  const mesaRef = useRef(mesa)
  const tokensDoDeck = useTokensDoDeck(deck)
  // Deck salvo antes de a API mandar poder/resistência: busca os dados novos das cartas (uma vez)
  const faltaPT = [deck.commanders, deck.cartas.map((c) => c.carta)].flat().some((c) => c.poder === undefined)
  const atualizadas = useQuery({
    queryKey: ['cartas-da-mesa', deck.id],
    queryFn: () => api.cartasPorId([...new Set([...deck.commanders, ...deck.cartas.map((c) => c.carta)].map((c) => c.oracle_id))]),
    enabled: faltaPT,
    staleTime: Infinity,
  })
  useCoresDoDeck(deck.commanders.length ? identidadeDeck(deck) : null)
  const campoRef = useRef<HTMLDivElement>(null)
  const maoRef = useRef<HTMLDivElement>(null)
  const vista = useTamanho(campoRef)
  const mao = useTamanho(maoRef)
  // O campo em "pixels da mesa": com zoom, cabe mais (ou menos) mesa na mesma tela.
  // `campo` é a parte que aparece; `extensao` vai até a carta mais longe (o resto se vê rolando)
  const campo = { largura: Math.floor(vista.largura / zoom.campo), altura: Math.floor(vista.altura / zoom.campo) }
  const extensao = {
    largura: Math.max(campo.largura, ...mesa.zonas.campo.map((c) => (c.pos?.x ?? 0) + CARTA.largura)),
    altura: Math.max(campo.altura, ...mesa.zonas.campo.map((c) => (c.pos?.y ?? 0) + CARTA.altura)),
  }
  const larguraMao = Math.round(NA_MAO * zoom.mao)

  function mudarZoom(area: keyof Zoom, passo: number | 'normal') {
    setZoom((z) => {
      const i = ZOOMS.indexOf(z[area])
      const novo = { ...z, [area]: passo === 'normal' ? 1 : ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + passo))] }
      try {
        localStorage.setItem(CHAVE_ZOOM, JSON.stringify(novo))
      } catch {
        // sem armazenamento: vale só agora
      }
      return novo
    })
  }

  // Ctrl + rodinha em cima do campo ou da mão muda o zoom dele (e não o da página)
  useEffect(() => {
    let ultima = 0
    const tirar = ([[campoRef.current, 'campo'], [maoRef.current, 'mao']] as const).map(([el, area]) => {
      const roda = (e: WheelEvent) => {
        if (!e.ctrlKey) return
        e.preventDefault()
        if (e.timeStamp - ultima < 120) return  // o touchpad manda muitos de uma vez
        ultima = e.timeStamp
        mudarZoom(area, e.deltaY < 0 ? 1 : -1)
      }
      el?.addEventListener('wheel', roda, { passive: false })
      return () => el?.removeEventListener('wheel', roda)
    })
    return () => tirar.forEach((t) => t())
  }, [])

  // A mesa ocupa a tela toda: some a rolagem da página por baixo
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])

  function trocarMesa(nova: Mesa) {
    mesaRef.current = nova
    setMesa(nova)
  }

  useEffect(() => {
    if (!atualizadas.data) return
    const nova = completarCartas(mesaRef.current, new Map(atualizadas.data.map((c) => [c.oracle_id, c])))
    if (nova !== mesaRef.current) trocarMesa(nova)
  }, [atualizadas.data])

  // Toda jogada passa por aqui, pra dar pra desfazer
  function fazer(jogada: (m: Mesa) => Mesa) {
    const atual = mesaRef.current
    const nova = jogada(atual)
    if (nova === atual) return
    setPassado((p) => [...p.slice(-99), atual])
    trocarMesa(nova)
  }

  // Jogada que envolve outro jogador (carta indo ou vindo): não dá pra desfazer só do meu lado,
  // então o desfazer recomeça daqui
  function compartilhar(nova: Mesa) {
    trocarMesa(nova)
    setPassado([])
  }

  function desfazer() {
    if (!passado.length) return
    const anterior = passado[passado.length - 1]
    trocarMesa(anterior)
    setPassado((p) => p.slice(0, -1))
    setADevolver([])
    if (partida) {
      // O histórico da sala não volta atrás: avisa, e o que vier depois continua sendo enviado
      setLogEnviado((n) => Math.min(n, anterior.logPublico.length))
      partida.conexao.enviar({ tipo: 'log', texto: 'Desfez a última jogada' })
    }
  }

  // --- Partida: a sala fica sabendo de tudo que é público, e a minha vez começa sozinha ---
  const sala = partida?.conexao.sala
  const eu = partida?.conexao.eu
  const conectado = partida?.conexao.estado === 'conectado'
  const minhaVez = !!sala && sala.vez === eu
  const enviar = partida?.conexao.enviar
  // Numa partida, a regra de mulligan é a da sala (o dono escolhe ao criar)
  const regraAtual = sala?.regra_mulligan ?? regra

  function avisar(texto: string) {
    setAviso({ texto, quando: Date.now() })
  }

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4500)
    return () => clearTimeout(t)
  }, [aviso])

  // Dados, moedas e o sorteio de quem começa aparecem na tela de todo mundo. Ao abrir a mesa, mostra
  // só o que acabou de acontecer (o sorteio de quem começa chega junto com a partida)
  const avisosVistos = useRef<number | null>(null)
  useEffect(() => {
    if (!sala) return
    if (avisosVistos.current === null) {
      const recente = sala.log.findIndex((l) => l.quando > Date.now() / 1000 - 15)
      avisosVistos.current = recente < 0 ? sala.log.length : recente
    }
    const ultima = sala.log.slice(avisosVistos.current).filter((l) => l.destaque).at(-1)
    avisosVistos.current = sala.log.length
    if (ultima) {
      const quem = ultima.jogador && (ultima.jogador === eu ? 'Você' : sala.jogadores.find((j) => j.id === ultima.jogador)?.nome)
      avisar(quem ? `${quem}: ${ultima.texto}` : ultima.texto)
    }
  }, [sala?.log.length])

  // Numa partida quem rola é a sala (todo mundo vê o mesmo resultado); sozinho, rola aqui mesmo
  function rolarDado(lados: number, quantos: number) {
    if (partida) {
      if (!enviar?.({ tipo: 'dado', lados, quantos })) avisar('Sem conexão com a sala agora')
      return
    }
    const texto = rolar(lados, quantos)
    avisar(texto)
    trocarMesa(anotarNaMesa(mesaRef.current, texto))
  }

  useEffect(() => {
    partida?.onSalvar({ mesa, turnoFeito, logEnviado })
  }, [mesa, turnoFeito, logEnviado])

  // A mesa pública vai inteira a cada mudança (e de novo ao reconectar)
  useEffect(() => {
    if (!enviar || !conectado) return
    const t = setTimeout(() => enviar({ tipo: 'mesa', mesa: mesaPublica(mesa, deck, extensao) }), 80)
    return () => clearTimeout(t)
  }, [mesa, conectado, extensao.largura, extensao.altura])

  // As linhas novas do histórico público; o que não saiu (sem conexão) vai quando voltar
  useEffect(() => {
    if (!enviar || !conectado) return
    let n = logEnviado
    while (n < mesa.logPublico.length && enviar({ tipo: 'log', texto: mesa.logPublico[n] })) n++
    if (n !== logEnviado) setLogEnviado(n)
  }, [mesa.logPublico, logEnviado, conectado])

  // Chegou a minha vez (e já mantive a mão): desvira e compra, uma vez por turno da sala
  useEffect(() => {
    if (!sala || !minhaVez || mesa.fase !== 'jogo' || sala.turno === turnoFeito) return
    setTurnoFeito(sala.turno)
    fazer(proximoTurno)
  }, [minhaVez, mesa.fase, sala?.turno])

  function passarVez() {
    if (minhaVez && mesa.fase === 'jogo') enviar?.({ tipo: 'passar' })
  }

  // --- Cartas entre jogadores e quem saiu do jogo ---
  const nomeDe = (id: string) => (id === eu ? 'você' : sala?.jogadores.find((j) => j.id === id)?.nome ?? 'outro jogador')
  const vivos = sala?.jogadores.filter((j) => !j.eliminado && j.id !== eu) ?? []
  const euEliminado = !!mesa.eliminado || !!sala?.jogadores.find((j) => j.id === eu)?.eliminado

  function semConexao() {
    avisar('Sem conexão com a sala agora')
  }

  // Dar o controle de uma carta do meu campo pra outro (Donate, ou alguém roubou e eu aplico aqui).
  // A carta é livre: se for de outro dono, vai adiante (e o dono fica sabendo com quem ela está)
  function darControle(id: number, para: string) {
    const carta = mesaRef.current.zonas.campo.find((c) => c.id === id)
    if (!carta) return
    if (carta.dono === para) return devolverControle(id)
    const dado = carta.dono ? repassar(mesaRef.current, id, para, nomeDe(para)) : emprestar(mesaRef.current, id, para, nomeDe(para))
    if (!dado) return
    if (!enviar?.({ tipo: 'transferir', para, carta: dado.carta })) return semConexao()
    if (carta.dono) enviar({ tipo: 'controle', para: carta.dono, id: carta.idDono, com: para })
    compartilhar(dado.mesa)
    if (foco?.id === id) setFoco(null)
  }

  // Carta de outro jogador saindo do meu campo: o controle volta pra ele, ou ela vai pra uma zona dele
  function devolverControle(id: number, zona?: Zona, posicao?: 'topo' | 'fundo') {
    const dono = mesaRef.current.zonas.campo.find((c) => c.id === id)?.dono
    const devolvido = dono && devolverAoDono(mesaRef.current, id, nomeDe(dono), zona)
    if (!devolvido) return
    if (!enviar?.({ tipo: 'transferir', para: dono, carta: devolvido.carta, devolvendo: true, zona, posicao })) return semConexao()
    compartilhar(devolvido.mesa)
    if (foco?.id === id) setFoco(null)
  }

  // Arrastei uma carta minha até o painel de alguém: dou o controle. Se não estava no campo, ela entra
  // no campo primeiro (como "coloque no campo sob o controle de um oponente")
  function soltarNoJogador(jogador: string, e: DragEvent) {
    const arrasto = lerArrasto(e)
    if (!arrasto || !emJogo || euEliminado) return
    if (onde(mesaRef.current, arrasto.id) !== 'campo') jogar(arrasto.id)
    darControle(arrasto.id, jogador)
  }

  // Pegar o controle de uma carta do campo de outro: quem aplica é o navegador dele (que é dono da mesa dele)
  function pegarControle(jogador: string, carta: CartaPublica) {
    if (!enviar?.({ tipo: 'pedir', de: jogador, id: carta.id })) semConexao()
  }

  function receber(msg: Direta) {
    const m = mesaRef.current
    if (msg.tipo === 'controle') {
      const nova = controleMudou(m, msg.id, msg.com)
      if (nova !== m) compartilhar(nova)
      return
    }
    if (msg.tipo === 'pedido') {
      const carta = m.zonas.campo.find((c) => c.id === msg.id)
      if (!carta || m.eliminado) return
      darControle(carta.id, msg.por)  // se a carta era de quem pediu, isso devolve
      return avisar(`${nomeDe(msg.por)} pegou o controle de ${carta.carta.nome}`)
    }
    const pos = lugarLivre(m, ehTerreno(msg.carta.carta), campo, CARTA)
    if (msg.devolvendo || msg.carta.dono === eu) {
      // Voltou pra mim (pelo id que ela tem na minha mesa)
      const minha = msg.carta.dono === eu ? { ...msg.carta, id: msg.carta.idDono!, dono: undefined, idDono: undefined } : msg.carta
      const nova = voltou(m, minha, pos, msg.zona ?? undefined, msg.posicao ?? 'topo')
      if (nova !== m) compartilhar(nova)
    } else if (!m.eliminado) {
      compartilhar(ganharControle(m, msg.carta, msg.de, pos))
      avisar(`Você ganhou o controle de ${msg.carta.carta.nome} (de ${nomeDe(msg.de)})`)
    }
  }

  // A cada render, pra quem trata as mensagens ver a mesa e a sala de agora
  useEffect(() => {
    if (!partida) return
    partida.conexao.ouvir(receber)
    return () => partida.conexao.ouvir(null)
  })

  // Alguém foi eliminado ou saiu da sala: as cartas dele que eu controlava somem, e as minhas voltam
  useEffect(() => {
    if (!sala) return
    const fora = (id: string) => !sala.jogadores.some((j) => j.id === id && !j.eliminado)
    const nova = semJogadores(mesaRef.current, fora)
    if (nova !== mesaRef.current) compartilhar(nova)
  }, [sala])

  // O que costuma acabar com o jogo: aí a mesa pergunta se a pessoa perdeu (quem decide é ela)
  const motivoDerrota = !partida || euEliminado || mesa.fase !== 'jogo' ? null
    : mesa.vida <= 0 ? `Sua vida chegou a ${mesa.vida}`
    : (mesa.contadores?.Veneno ?? 0) >= VENENO_LETAL ? `Você tem ${mesa.contadores!.Veneno} de veneno`
    : Object.values(mesa.danoCommander ?? {}).some((d) => d >= DANO_COMMANDER_LETAL) ? `Você levou ${DANO_COMMANDER_LETAL} de dano de um commander`
    : null

  // Sair do jogo (perdeu ou concedeu): as cartas dos outros voltam pra eles e as minhas saem da mesa.
  // Mesa casual: dá pra voltar depois, com as minhas cartas de volta no campo
  function sairDoJogoAgora(concedeu = false) {
    if (!enviar?.({ tipo: 'eliminado', concedeu })) return semConexao()
    compartilhar(sairDoJogo(mesaRef.current, concedeu))
    setPainel(null)
  }

  function voltarAoJogo() {
    if (!enviar?.({ tipo: 'voltar' })) return semConexao()
    compartilhar(voltarProJogo(mesaRef.current))
    setNaoPerdi(null)
  }

  function sairDaPartida() {
    if (confirm('Sair da partida? Sua mesa some para os outros jogadores.')) partida?.onSair()
  }

  // Os outros, na ordem dos turnos a partir de mim
  const meuLugar = sala?.jogadores.findIndex((j) => j.id === eu) ?? -1
  const outros = sala ? [...sala.jogadores.slice(meuLugar + 1), ...sala.jogadores.slice(0, Math.max(0, meuLugar))] : []
  const nomeDaVez = sala?.jogadores.find((j) => j.id === sala.vez)?.nome

  const cartaPorId = (id: number) => Object.values(mesa.zonas).flat().find((c) => c.id === id)

  // Pro campo: onde foi solta, ou no primeiro lugar livre (terreno embaixo, o resto em cima)
  function jogar(id: number, pos?: Posicao) {
    const c = cartaPorId(id)
    if (!c) return
    fazer((m) => mover(m, id, 'campo', 'topo', pos ?? lugarLivre(m, ehTerreno(c.carta), campo, CARTA)))
  }

  // N tokens iguais, cada um no próximo lugar livre
  function criarTokens(carta: Carta, quantos: number) {
    fazer((m) => {
      const posicoes: Posicao[] = []
      let ocupada = m
      for (let i = 0; i < quantos; i++) {
        const pos = lugarLivre(ocupada, ehTerreno(carta), campo, CARTA)
        posicoes.push(pos)
        ocupada = { ...ocupada, zonas: { ...ocupada.zonas, campo: [...ocupada.zonas.campo, { id: -1 - i, carta, virada: false, commander: false, pos }] } }
      }
      return criarToken(m, carta, posicoes)
    })
  }

  // A cópia aparece um pouco deslocada do original, pra ficar claro de onde veio
  function copiarCarta(id: number) {
    const original = mesa.zonas.campo.find((c) => c.id === id)
    if (!original?.pos) return
    const pos = {
      x: Math.min(original.pos.x + 24, Math.max(0, campo.largura - CARTA.largura)),
      y: Math.min(original.pos.y + 24, Math.max(0, campo.altura - CARTA.altura)),
    }
    fazer((m) => copiar(m, id, pos))
  }

  function moverPara(id: number, para: Zona, posicao: 'topo' | 'fundo' = 'topo') {
    if (para === 'campo') return jogar(id)
    // Carta de outro jogador: vai pra zona do dono, não pra minha
    const c = mesaRef.current.zonas.campo.find((x) => x.id === id)
    if (c?.dono) return para === 'comando' && !c.commander ? undefined : devolverControle(id, para, posicao)
    fazer((m) => mover(m, id, para, posicao))
    if (foco?.id === id) setFoco(null)  // a carta saiu de baixo do mouse
  }

  function soltarNoCampo(e: DragEvent) {
    const arrasto = lerArrasto(e)
    const el = campoRef.current
    if (!arrasto || !el) return
    // Da tela pra mesa: tira o canto do campo, soma o quanto rolou e desfaz o zoom
    const caixa = el.getBoundingClientRect()
    const x = (e.clientX - caixa.left + el.scrollLeft - arrasto.dx) / zoom.campo
    const y = (e.clientY - caixa.top + el.scrollTop - arrasto.dy) / zoom.campo
    jogar(arrasto.id, {
      x: Math.round(Math.min(Math.max(x, 0), extensao.largura - CARTA.largura)),
      y: Math.round(Math.min(Math.max(y, 0), extensao.altura - CARTA.altura)),
    })
  }

  function fecharLista() {
    // Depois de procurar no grimório, embaralha (como num tutor de verdade)
    if (vendo === 'biblioteca') fazer((m) => embaralharGrimorio(m))
    setVendo(null)
  }

  function telaCheia() {
    const pedido = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    pedido?.catch(() => {})  // navegador sem suporte ou bloqueado: segue na janela
  }

  function trocarRegra(nova: RegraMulligan) {
    setRegra(nova)
    try {
      localStorage.setItem(CHAVE_REGRA, nova)
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }

  const emJogo = mesa.fase === 'jogo'

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      // Digitando (busca de token, contador com nome): só o Esc vale, pra fechar
      if ((e.target instanceof HTMLInputElement && e.key !== 'Escape') || e.altKey) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        return desfazer()
      }
      if (e.ctrlKey || e.metaKey) return
      if (k === 'escape') {
        if (menu) setMenu(null)
        else if (menuOutro) setMenuOutro(null)
        else if (vendoOutro) setVendoOutro(null)
        else if (vendoCampo) setVendoCampo(null)
        else if (vendo) fecharLista()
        else if (criandoToken) setCriandoToken(false)
        else setPainel(null)
        return
      }
      if (k === '?') return setPainel((p) => (p === 'atalhos' ? null : 'atalhos'))
      if (k === 'f') return telaCheia()
      if (menu || menuOutro || vendo || vendoOutro || vendoCampo || criandoToken) return

      if (mesa.fase === 'mulligan') {
        if (k === 'enter') fazer((m) => manter(m, regraAtual))
        if (k === 'm' && cartasADevolver(regraAtual, mesa.mulligans + 1) < TAMANHO_MAO) { setADevolver([]); fazer((m) => mulligan(m, deck)) }
        return
      }
      if (!emJogo) return

      const alvo = foco && cartaPorId(foco.id)
      const naCarta: Record<string, () => void> = alvo ? {
        t: () => onde(mesa, alvo.id) === 'campo' && fazer((m) => virar(m, alvo.id)),
        d: () => copiarCarta(alvo.id),
        p: () => jogar(alvo.id),
        h: () => moverPara(alvo.id, 'mao'),
        g: () => moverPara(alvo.id, 'cemiterio'),
        e: () => moverPara(alvo.id, 'exilio'),
        y: () => moverPara(alvo.id, 'biblioteca', 'topo'),
        b: () => moverPara(alvo.id, 'biblioteca', 'fundo'),
        k: () => moverPara(alvo.id, 'comando'),
      } : {}
      const geral: Record<string, () => void> = {
        c: () => fazer((m) => comprar(m)),
        n: () => (partida ? passarVez() : fazer(proximoTurno)),
        ' ': () => (partida ? passarVez() : fazer(proximoTurno)),
        u: () => fazer(desvirarTudo),
        s: () => fazer((m) => embaralharGrimorio(m)),
        o: () => setCriandoToken(true),
        '+': () => fazer((m) => mudarVida(m, 1)),
        '=': () => fazer((m) => mudarVida(m, 1)),
        '-': () => fazer((m) => mudarVida(m, -1)),
      }
      const acao = naCarta[k] ?? geral[k]
      if (acao) {
        e.preventDefault()
        acao()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const abrirMenu = (e: MouseEvent, id: number) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ id, x: e.clientX, y: e.clientY })
  }

  // Clique faz o óbvio de cada zona: da mão e da zona de comando vai pro campo; no campo, vira;
  // no cemitério e no exílio abre a pilha inteira
  function clicar(c: CartaMesa) {
    const zona = onde(mesa, c.id)
    if (zona === 'mao' || zona === 'comando') jogar(c.id)
    else if (zona === 'campo') fazer((m) => virar(m, c.id))
    else if (zona === 'cemiterio' || zona === 'exilio') setVendo(zona)
  }

  const props = {
    onClick: clicar,
    onMenu: abrirMenu,
    onFoco: (c: CartaMesa | null, x = 0) => setFoco(c && { id: c.id, esquerda: x > window.innerWidth / 2 }),
    onArrastar: setArrastando,
  }
  const { zonas } = mesa
  const emFoco = foco && cartaPorId(foco.id)
  const grande = emFoco ? { carta: emFoco.carta, esquerda: foco!.esquerda } : previa

  // Mão com muita carta: elas se sobrepõem pra caber na largura
  const passoMao = zonas.mao.length > 1 ? Math.min(larguraMao + 6, (mao.largura - larguraMao) / (zonas.mao.length - 1)) : 0

  return (
    <div className="fixed inset-0 z-50 flex select-none flex-col bg-fundo">
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-borda bg-painel px-3 py-2">
        {partida
          ? <button onClick={sairDaPartida} className="text-sm text-apagado hover:text-destaque-forte">← Sair</button>
          : <Link to={`/deck/${deck.id}`} className="text-sm text-apagado hover:text-destaque-forte">← Deck</Link>}
        <h1 className="hidden font-titulo font-semibold text-texto sm:block">{deck.nome}</h1>
        {sala && (
          <span className="text-sm">
            {minhaVez ? <span className="font-semibold text-destaque-forte">Sua vez</span> : <><span className="text-apagado">Vez de</span> <span className="font-semibold">{nomeDaVez ?? '–'}</span></>}
            {!conectado && <span className="ml-2 text-amber-200">reconectando…</span>}
          </span>
        )}
        <span className="text-sm"><span className="text-apagado">{partida ? 'Seu turno' : 'Turno'}</span> <span className="font-semibold">{mesa.turno || '–'}</span></span>
        <span className="flex items-center gap-1 text-sm">
          <span className="text-apagado">Vida</span>
          <button onClick={() => fazer((m) => mudarVida(m, -1))} className="h-6 w-6 rounded-md border border-borda hover:bg-painel-2" aria-label="Perder 1 de vida">−</button>
          <span className="w-8 text-center font-semibold">{mesa.vida}</span>
          <button onClick={() => fazer((m) => mudarVida(m, 1))} className="h-6 w-6 rounded-md border border-borda hover:bg-painel-2" aria-label="Ganhar 1 de vida">+</button>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <ContadoresDoJogador contadores={mesa.contadores} />
          <button onClick={() => setPainel(painel === 'contadores' ? null : 'contadores')} className="text-xs text-apagado underline-offset-2 hover:text-texto hover:underline" title="Veneno, energia, experiência">
            Contadores
          </button>
        </span>
        <span className="text-sm" title="Terrenos no campo que ainda não foram virados">
          <span className="text-apagado">Terrenos livres</span> <span className="font-semibold">{terrenosDesvirados(mesa)}</span>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setCriandoToken(true)} disabled={!emJogo} className={botao} title="O">Tokens</button>
          <button onClick={() => setPainel(painel === 'dados' ? null : 'dados')} className={botao} title="Dados e moeda">Dados</button>
          <button onClick={() => setPainel(painel === 'historico' ? null : 'historico')} className={botao}>Histórico</button>
          <button onClick={() => setPainel(painel === 'atalhos' ? null : 'atalhos')} className={botao} title="?">Atalhos</button>
          <button onClick={telaCheia} className={`${botao} hidden sm:block`} title="F">Tela cheia</button>
          <button onClick={desfazer} disabled={!passado.length} className={botao} title="Ctrl+Z">Desfazer</button>
          {partida && (euEliminado ? (
            <button onClick={voltarAoJogo} className={botao} title="Volta pra partida com as suas cartas">Voltar pro jogo</button>
          ) : (
            <button onClick={() => setPainel(painel === 'sair' ? null : 'sair')} disabled={!emJogo} className={botao}>Sair do jogo</button>
          ))}
          {partida ? (
            <button onClick={passarVez} disabled={!minhaVez || !emJogo || euEliminado} className={principal} title="Passa a vez pro próximo jogador (Espaço)">Passar a vez</button>
          ) : (
            <>
              <button onClick={() => { setADevolver([]); fazer(() => novaMesa(deck)) }} className={botao}>Recomeçar</button>
              <button onClick={() => fazer(proximoTurno)} disabled={!emJogo} className={principal} title="Desvira tudo e compra uma carta (Espaço)">Próximo turno</button>
            </>
          )}
        </div>

        {painel && (
          <div className="absolute right-3 top-full z-30 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-borda bg-painel-2 p-4 text-sm shadow-2xl shadow-black/60">
            {painel === 'sair' ? (
              <>
                <h3 className="font-semibold">Sair do jogo</h3>
                <p className="mt-1 text-xs text-apagado">
                  Suas cartas saem da mesa, as dos outros que estão com você voltam pros donos e a vez passa a te pular.
                  Dá pra voltar depois, se foi engano.
                </p>
                <div className="mt-3 space-y-2">
                  <button onClick={() => sairDoJogoAgora()} className={`${botao} w-full text-left`}>
                    <span className="font-semibold">Fui eliminado</span>
                    <span className="block text-xs text-apagado">Vida, veneno, dano de commander…</span>
                  </button>
                  <button onClick={() => sairDoJogoAgora(true)} className={`${botao} w-full text-left`}>
                    <span className="font-semibold">Conceder</span>
                    <span className="block text-xs text-apagado">Precisa sair? A partida segue sem você, e dá pra fechar a aba.</span>
                  </button>
                </div>
              </>
            ) : painel === 'dados' ? (
              <PainelDados partida={!!partida} onRolar={rolarDado} />
            ) : painel === 'contadores' ? (
              <>
                <h3 className="font-semibold">Seus contadores</h3>
                <div className="mt-2 space-y-1">
                  {CONTADORES_JOGADOR.map((tipo) => (
                    <LinhaContador key={tipo} tipo={tipo} n={mesa.contadores?.[tipo] ?? 0} onMudar={(delta) => fazer((m) => mudarContadorJogador(m, tipo, delta))} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-apagado">10 de veneno mata. Os outros veem os seus contadores do lado da vida.</p>
              </>
            ) : painel === 'historico' && sala ? (
              <HistoricoSala sala={sala} eu={eu!} onChat={(texto) => enviar?.({ tipo: 'chat', texto })} />
            ) : painel === 'historico' ? (
              <>
                <h3 className="font-semibold">Histórico</h3>
                <ol className="mt-2 space-y-1 text-xs text-apagado">
                  {[...mesa.log].reverse().map((linha, i) => <li key={mesa.log.length - i} className={i ? '' : 'text-texto'}>{linha}</li>)}
                  {!mesa.log.length && <li>Nada ainda.</li>}
                </ol>
              </>
            ) : (
              <>
                <h3 className="font-semibold">Atalhos do teclado</h3>
                <ListaAtalhos itens={ATALHOS} />
                <h4 className="mt-3 text-xs font-semibold text-apagado">Com o mouse em cima de uma carta</h4>
                <ListaAtalhos itens={ATALHOS_CARTA} />
                <h4 className="mt-3 text-xs font-semibold text-apagado">Na mão inicial</h4>
                <ListaAtalhos itens={ATALHOS_MULLIGAN} />
                <p className="mt-3 text-xs text-apagado">Também dá pra arrastar as cartas pra qualquer lugar, e o botão direito abre as opções da carta.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
        {outros.length > 0 && (
          <div className="flex h-[42%] min-h-[170px] shrink-0 flex-col">
            <Oponentes
              jogadores={outros}
              vez={sala!.vez}
              danoRecebido={mesa.danoCommander ?? {}}
              onDano={(chave, nome, delta) => fazer((m) => danoDeCommander(m, chave, nome, delta))}
              onPrevia={(carta, x = 0) => setPrevia(carta && { carta, esquerda: x > window.innerWidth / 2 })}
              onVer={(titulo, cartas) => setVendoOutro({ titulo, cartas: [...cartas].reverse() })}
              onAmpliar={setVendoCampo}
              onCarta={(jogador, carta, e) => { e.preventDefault(); setMenuOutro({ jogador, carta, x: e.clientX, y: e.clientY }) }}
              onSoltarCarta={soltarNoJogador}
            />
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <div
            ref={campoRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={soltarNoCampo}
            onClick={() => setPainel(null)}
            aria-label="Campo de batalha"
            className="absolute inset-0 overflow-auto bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-destaque)_14%,#232730)_0%,#121418_85%)]"
          >
            {!zonas.campo.length && emJogo && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-apagado">
                Arraste as cartas da mão pra qualquer lugar do campo, ou clique nelas pra jogar. Aperte ? pra ver os atalhos.
              </p>
            )}
            {/* A mesa no tamanho dela, aumentada ou diminuída pelo zoom; o que passa da tela aparece rolando */}
            <div className="relative" style={{ width: Math.floor(extensao.largura * zoom.campo), height: Math.floor(extensao.altura * zoom.campo) }}>
              <div className="absolute left-0 top-0 origin-top-left" style={{ width: extensao.largura, height: extensao.altura, transform: `scale(${zoom.campo})` }}>
                {zonas.campo.map((c) => (
                  <div key={c.id} className="absolute transition-[left,top] duration-75" style={{ left: c.pos?.x ?? 0, top: c.pos?.y ?? 0 }}>
                    <CartaNaMesa c={c} largura={CARTA.largura} {...props} noCampo />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ControleZoom valor={zoom.campo} rotulo="do campo" onMudar={(passo) => mudarZoom('campo', passo)} className="absolute bottom-2 right-3" />
        </div>
        </div>

        <div className="flex w-[124px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-borda bg-painel/60 p-2 sm:w-[132px]">
          {deck.commanders.length > 0 && (
            <Pilha zona="comando" titulo="Comando" onSoltar={moverPara}>
              {zonas.comando.map((c) => (
                <div key={c.id} className="relative">
                  <CartaNaMesa c={c} largura={CARTA.largura} {...props} />
                  {imposto(mesa, c.id) > 0 && (
                    <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-full bg-fundo/90 px-2 text-xs font-semibold text-destaque-forte">imposto +{imposto(mesa, c.id)}</span>
                  )}
                </div>
              ))}
              {!zonas.comando.length && <Vazio />}
            </Pilha>
          )}
          <Pilha zona="biblioteca" titulo={`Grimório · ${zonas.biblioteca.length}`} onSoltar={moverPara}>
            <button
              onClick={() => fazer((m) => comprar(m))}
              disabled={!emJogo || !zonas.biblioteca.length}
              title="Comprar uma carta (C)"
              style={{ width: CARTA.largura, height: CARTA.altura }}
              className="flex items-center justify-center rounded-md border-4 border-stone-800 bg-gradient-to-br from-amber-900 via-stone-900 to-amber-950 font-titulo text-xs text-destaque/80 shadow-lg transition hover:-translate-y-0.5 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {zonas.biblioteca.length ? 'Comprar' : 'Vazio'}
            </button>
            <div className="mt-1 flex justify-between text-[11px]">
              <button onClick={() => setVendo('biblioteca')} disabled={!emJogo} className="text-apagado hover:text-texto disabled:opacity-40">Buscar</button>
              <button onClick={() => fazer((m) => embaralharGrimorio(m))} disabled={!emJogo} className="text-apagado hover:text-texto disabled:opacity-40" title="S">Embaralhar</button>
            </div>
          </Pilha>
          {(['cemiterio', 'exilio'] as const).map((z) => (
            <Pilha key={z} zona={z} titulo={`${NOME_ZONA[z]} · ${zonas[z].length}`} onSoltar={moverPara}>
              {/* A carta de cima se arrasta pra fora como qualquer outra; clicar abre a pilha toda */}
              {zonas[z].length ? (
                <>
                  <div className={z === 'exilio' ? 'opacity-70 grayscale' : ''}>
                    <CartaNaMesa c={zonas[z][zonas[z].length - 1]} largura={CARTA.largura} {...props} />
                  </div>
                  <button onClick={() => setVendo(z)} className="mt-1 w-full text-[11px] text-apagado hover:text-texto">Ver todas</button>
                </>
              ) : <Vazio />}
            </Pilha>
          ))}
        </div>
      </div>

      <Pilha zona="mao" onSoltar={moverPara} className="shrink-0 border-t border-borda bg-painel/80 px-3 pb-2 pt-1.5">
        <div className="mb-1 flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-apagado">Mão · {zonas.mao.length}</span>
          <ControleZoom valor={zoom.mao} rotulo="da mão" onMudar={(passo) => mudarZoom('mao', passo)} />
        </div>
        <div ref={maoRef} className="relative" style={{ height: Math.round(160 * zoom.mao) }}>
          {zonas.mao.map((c, i) => (
            <div key={c.id} className="absolute bottom-0 transition-[left,transform] duration-150 hover:z-20 hover:-translate-y-3" style={{ left: i * passoMao }}>
              <CartaNaMesa c={c} largura={larguraMao} {...props} />
            </div>
          ))}
        </div>
      </Pilha>

      {/* Carta em destaque: do lado oposto ao mouse, pra não tapar o que você está olhando */}
      {grande && !arrastando && !menu && (
        <div className={`pointer-events-none fixed top-16 z-[75] hidden w-[260px] md:block ${grande.esquerda ? 'left-4' : 'right-[148px]'}`}>
          <ImagemCarta carta={grande.carta} className="shadow-2xl shadow-black/80" />
        </div>
      )}

      {aviso && (
        <div key={aviso.quando} role="status" className="pointer-events-none fixed inset-x-0 top-20 z-[80] flex justify-center px-4">
          <p className="rounded-lg border border-destaque/70 bg-painel-2/95 px-6 py-3 text-center text-lg font-semibold text-destaque-forte shadow-2xl shadow-black/70">
            {aviso.texto}
          </p>
        </div>
      )}

      {euEliminado && (
        <div className="fixed inset-x-0 bottom-[220px] z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-lg border border-borda bg-painel-2/95 px-5 py-2 text-sm shadow-xl">
            Você está fora do jogo. Dá pra continuar assistindo a partida.
            <button onClick={voltarAoJogo} className={botao}>Voltar pro jogo</button>
          </div>
        </div>
      )}
      {motivoDerrota && naoPerdi !== motivoDerrota && (
        <div className="fixed inset-x-0 bottom-[220px] z-30 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-400/60 bg-painel-2/95 px-5 py-3 text-sm shadow-xl shadow-black/60">
            <span><span className="font-semibold text-red-300">{motivoDerrota}.</span> Você perdeu?</span>
            <button onClick={() => { if (confirm('Sair do jogo? Dá pra voltar depois.')) sairDoJogoAgora() }} className={principal}>Fui eliminado</button>
            <button onClick={() => setNaoPerdi(motivoDerrota)} className={botao}>Ainda não</button>
          </div>
        </div>
      )}

      {menuOutro && (
        <MenuCartaDeOutro
          {...menuOutro}
          nomeDe={nomeDe}
          eu={eu!}
          podePegar={emJogo && !euEliminado}
          onPegar={() => { pegarControle(menuOutro.jogador, menuOutro.carta); setMenuOutro(null) }}
          onFechar={() => setMenuOutro(null)}
        />
      )}

      {vendoCampo && sala && (() => {
        const jogador = sala.jogadores.find((j) => j.id === vendoCampo)
        return jogador && (
          <CampoAmpliado
            jogador={jogador}
            naVez={jogador.id === sala.vez}
            danoRecebido={mesa.danoCommander ?? {}}
            onDano={(chave, nome, delta) => fazer((m) => danoDeCommander(m, chave, nome, delta))}
            onPrevia={(carta, x = 0) => setPrevia(carta && { carta, esquerda: x > window.innerWidth / 2 })}
            onVer={(titulo, cartas) => setVendoOutro({ titulo, cartas: [...cartas].reverse() })}
            onFechar={() => { setVendoCampo(null); setPrevia(null) }}
            onCarta={(jogadorId, carta, e) => { e.preventDefault(); setMenuOutro({ jogador: jogadorId, carta, x: e.clientX, y: e.clientY }) }}
          />
        )
      })()}

      {mesa.fase !== 'jogo' && (
        <PainelMulligan
          mesa={mesa}
          voltar={!partida}
          regra={regraAtual}
          regraDaSala={!!sala}
          aDevolver={aDevolver}
          onRegra={trocarRegra}
          onMulligan={() => { setADevolver([]); fazer((m) => mulligan(m, deck)) }}
          onManter={() => fazer((m) => manter(m, regraAtual))}
          onAlternar={(id) => setADevolver((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < cartasADevolver(regraAtual, mesa.mulligans) ? [...ids, id] : ids)}
          onConfirmar={() => { fazer((m) => devolver(m, aDevolver)); setADevolver([]) }}
        />
      )}

      {vendo && (
        <ListaZona
          titulo={vendo === 'biblioteca' ? 'Buscar no grimório' : NOME_ZONA[vendo]}
          dica={vendo === 'biblioteca' ? 'Em ordem alfabética (a ordem do grimório não aparece). Embaralha quando você fechar.' : undefined}
          cartas={vendo === 'biblioteca' ? [...zonas.biblioteca].sort((a, b) => a.carta.nome.localeCompare(b.carta.nome)) : [...zonas[vendo]].reverse()}
          onMenu={abrirMenu}
          onMover={moverPara}
          onFechar={fecharLista}
        />
      )}

      {vendoOutro && <ListaZona titulo={vendoOutro.titulo} cartas={vendoOutro.cartas} onFechar={() => setVendoOutro(null)} />}

      {menu && (
        <MenuCarta
          mesa={mesa}
          {...menu}
          onFechar={() => setMenu(null)}
          onVirar={() => fazer((m) => virar(m, menu.id))}
          onCopiar={() => copiarCarta(menu.id)}
          onContador={(tipo, delta) => fazer((m) => mudarContador(m, menu.id, tipo, delta))}
          onPT={(qual, delta) => fazer((m) => (delta ? mudarPT(m, menu.id, qual, delta) : zerarPT(m, menu.id)))}
          outros={partida && !euEliminado ? vivos.map((j) => ({ id: j.id, nome: j.nome })) : []}
          nomeDe={nomeDe}
          onDar={(para) => darControle(menu.id, para)}
          onDevolverControle={() => devolverControle(menu.id)}
          onMover={(para, posicao) => moverPara(menu.id, para, posicao)}
        />
      )}

      {criandoToken && (
        <ModalTokens
          doDeck={tokensDoDeck.data ?? []}
          erro={tokensDoDeck.isError}
          onCriar={criarTokens}
          onFechar={() => setCriandoToken(false)}
        />
      )}
    </div>
  )
}

// − 100% +  (clicar na porcentagem volta pro normal)
function ControleZoom({ valor, rotulo, onMudar, className = '' }: {
  valor: number; rotulo: string; onMudar: (passo: number | 'normal') => void; className?: string
}) {
  const b = 'h-6 w-6 rounded-md hover:bg-painel-2 disabled:opacity-30'
  return (
    <div className={`flex items-center gap-0.5 rounded-lg border border-borda bg-painel/90 px-1 text-xs shadow ${className}`} title={`Zoom ${rotulo} (Ctrl + rodinha do mouse)`}>
      <button onClick={() => onMudar(-1)} disabled={valor === ZOOMS[0]} className={b} aria-label={`Diminuir o zoom ${rotulo}`}>−</button>
      <button onClick={() => onMudar('normal')} className="w-10 text-center text-apagado hover:text-texto" aria-label={`Zoom ${rotulo} normal`}>{Math.round(valor * 100)}%</button>
      <button onClick={() => onMudar(1)} disabled={valor === ZOOMS.at(-1)} className={b} aria-label={`Aumentar o zoom ${rotulo}`}>+</button>
    </div>
  )
}

function LinhaContador({ tipo, n, onMudar }: { tipo: string; n: number; onMudar: (delta: number) => void }) {
  const b = 'h-6 w-6 rounded-md border border-borda hover:bg-painel disabled:opacity-30'
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className={`truncate ${n ? 'font-semibold' : 'text-apagado'}`}>{tipo}</span>
      <span className="flex shrink-0 items-center gap-1">
        <button onClick={() => onMudar(-1)} disabled={!n} className={b} aria-label={`Tirar um contador ${tipo}`}>−</button>
        <span className="w-6 text-center font-semibold">{n}</span>
        <button onClick={() => onMudar(1)} className={b} aria-label={`Pôr um contador ${tipo}`}>+</button>
      </span>
    </div>
  )
}

function PainelDados({ partida, onRolar }: { partida: boolean; onRolar: (lados: number, quantos: number) => void }) {
  const [quantos, setQuantos] = useState(1)
  return (
    <>
      <h3 className="font-semibold">Dados e moeda</h3>
      <div className="mt-2 flex items-center gap-1" role="group" aria-label="Quantos">
        <span className="mr-1 text-xs text-apagado">Quantos</span>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} onClick={() => setQuantos(n)} className={`h-7 w-7 rounded-lg border text-xs font-semibold ${quantos === n ? 'border-destaque bg-painel text-destaque-forte' : 'border-borda text-apagado hover:text-texto'}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {DADOS.map(([lados, nome]) => (
          <button key={lados} onClick={() => onRolar(lados, quantos)} className={`${botao} font-semibold ${lados === 2 ? 'col-span-2' : ''}`}>{nome}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-apagado">{partida ? 'Quem rola é a sala: o resultado aparece na tela de todo mundo e fica no histórico.' : 'O resultado fica no histórico.'}</p>
    </>
  )
}

function ListaAtalhos({ itens }: { itens: [string, string][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 text-xs">
      {itens.map(([tecla, oQue]) => (
        <div key={tecla} className="contents">
          <dt><kbd className="rounded border border-borda bg-painel px-1.5 py-0.5 font-mono text-[11px]">{tecla}</kbd></dt>
          <dd className="text-apagado">{oQue}</dd>
        </div>
      ))}
    </dl>
  )
}

function Vazio() {
  return <div style={{ width: CARTA.largura, height: CARTA.altura }} className="rounded-md border border-dashed border-borda" />
}

// Zona que recebe carta arrastada (menos o campo, que guarda a posição); acende com uma carta em cima
function Pilha({ zona, titulo, onSoltar, className = 'rounded-lg border border-borda bg-painel p-2', children }: {
  zona: Zona; titulo?: string; onSoltar: (id: number, zona: Zona) => void; className?: string; children: ReactNode
}) {
  const [sobre, setSobre] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setSobre(false)
        const arrasto = lerArrasto(e)
        if (arrasto) onSoltar(arrasto.id, zona)
      }}
      className={`${className} transition ${sobre ? 'ring-2 ring-inset ring-destaque/70' : ''}`}
    >
      {titulo && <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-apagado">{titulo}</h3>}
      {children}
    </div>
  )
}

interface PropsCarta {
  c: CartaMesa
  largura: number
  onClick: (c: CartaMesa) => void
  onMenu: (e: MouseEvent, id: number) => void
  onFoco: (c: CartaMesa | null, x?: number) => void
  onArrastar: (sim: boolean) => void
  noCampo?: boolean  // aí mostra o poder/resistência de agora
}

function CartaNaMesa({ c, largura, onClick, onMenu, onFoco, onArrastar, noCampo }: PropsCarta) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        const caixa = e.currentTarget.getBoundingClientRect()
        const arrasto: Arrasto = { id: c.id, dx: Math.round(e.clientX - caixa.left), dy: Math.round(e.clientY - caixa.top) }
        e.dataTransfer.setData(TIPO_ARRASTO, JSON.stringify(arrasto))
        e.dataTransfer.effectAllowed = 'move'
        onArrastar(true)
      }}
      onDragEnd={() => onArrastar(false)}
      onClick={(e) => { e.stopPropagation(); onClick(c) }}
      onContextMenu={(e) => onMenu(e, c.id)}
      onMouseEnter={(e) => onFoco(c, e.clientX)}
      onMouseLeave={() => onFoco(null)}
      title={c.carta.nome}
      className="group relative cursor-pointer"
      style={{ width: largura }}
    >
      {/* Virada: gira 90° no lugar */}
      <div className="transition-transform duration-200" style={{ transform: c.virada ? 'rotate(90deg)' : undefined }}>
        <ImagemCarta carta={c.carta} className="shadow-md shadow-black/60 ring-1 ring-black/40 group-hover:ring-2 group-hover:ring-destaque/70" />
      </div>
      {c.token && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-fundo/90 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-apagado">token</span>
      )}
      <SelosContadores contadores={c.contadores} />
      {noCampo && <SeloPT carta={c.carta} ajuste={c.ajuste} contadores={c.contadores} />}
      <button
        onClick={(e) => onMenu(e, c.id)}
        aria-label={`Opções de ${c.carta.nome}`}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-fundo/90 text-sm opacity-0 shadow transition hover:bg-painel-2 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        ⋯
      </button>
    </div>
  )
}

const DESTINOS: { para: Zona; posicao?: 'topo' | 'fundo'; rotulo: string }[] = [
  { para: 'mao', rotulo: 'Pra mão' },
  { para: 'campo', rotulo: 'Pro campo' },
  { para: 'cemiterio', rotulo: 'Pro cemitério' },
  { para: 'exilio', rotulo: 'Pro exílio' },
  { para: 'biblioteca', posicao: 'topo', rotulo: 'Topo do grimório' },
  { para: 'biblioteca', posicao: 'fundo', rotulo: 'Fundo do grimório' },
  { para: 'comando', rotulo: 'Pra zona de comando' },
]

function MenuCarta({ mesa, id, x, y, onFechar, onVirar, onCopiar, onContador, onPT, onMover, outros, nomeDe, onDar, onDevolverControle }: {
  mesa: Mesa; id: number; x: number; y: number
  onFechar: () => void; onVirar: () => void; onCopiar: () => void
  onPT: (qual: keyof AjustePT, delta: number) => void  // delta 0: volta pro impresso
  onContador: (tipo: string, delta: number) => void; onMover: (para: Zona, posicao?: 'topo' | 'fundo') => void
  outros: { id: string; nome: string }[]; nomeDe: (id: string) => string; onDar: (para: string) => void; onDevolverControle: () => void
}) {
  const [dando, setDando] = useState(false)
  const [outro, setOutro] = useState('')
  const zona = onde(mesa, id)
  const carta = zona && mesa.zonas[zona].find((c) => c.id === id)
  if (!zona || !carta) return null
  // Os de sempre e os que a carta já tem (inclusive os de nome livre)
  const tipos = [...new Set([...CONTADORES_CARTA, ...Object.keys(carta.contadores ?? {})])]
  const pt = zona === 'campo' ? poderResistencia(carta.carta, carta.ajuste, carta.contadores) : null
  const altura = zona === 'campo' ? (pt ? 720 : 620) : 320
  const opcoes = DESTINOS.filter((d) => (d.para !== zona || d.para === 'biblioteca') && (d.para !== 'comando' || carta.commander))
  const acao = (f: () => void) => () => { f(); onFechar() }

  return (
    <div className="fixed inset-0 z-[70]" onClick={onFechar} onContextMenu={(e) => { e.preventDefault(); onFechar() }}>
      <div
        className="absolute w-52 rounded-lg border border-borda bg-painel-2 py-1 text-sm shadow-2xl shadow-black/60"
        style={{ left: Math.min(x, window.innerWidth - 216), top: Math.max(8, Math.min(y, window.innerHeight - altura)), maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate px-3 py-1.5 text-xs font-semibold text-apagado">{carta.carta.nome}</p>
        {zona === 'campo' && (
          <>
            <button onClick={acao(onVirar)} className="block w-full px-3 py-1.5 text-left hover:bg-painel">{carta.virada ? 'Desvirar' : 'Virar'}</button>
            <button onClick={acao(onCopiar)} className="block w-full px-3 py-1.5 text-left hover:bg-painel">Criar cópia (token)</button>
            {/* Poder/resistência: ajuste à mão por cima do impresso e dos contadores (o menu fica aberto) */}
            {pt && (
              <div className="mt-1 border-t border-borda px-3 py-1.5">
                <p className="mb-1 flex items-center justify-between gap-2 whitespace-nowrap text-xs font-semibold text-apagado">
                  Poder / resistência
                  {carta.ajuste && <button onClick={() => onPT('poder', 0)} className="font-normal hover:text-texto" title="Voltar ao impresso (os contadores continuam)">↺ zerar</button>}
                </p>
                {(['poder', 'resistencia'] as const).map((qual) => (
                  <div key={qual} className="flex items-center justify-between gap-2 py-0.5">
                    <span>{qual === 'poder' ? 'Poder' : 'Resistência'}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button onClick={() => onPT(qual, -1)} className="h-6 w-6 rounded-md border border-borda hover:bg-painel" aria-label={`Tirar 1 de ${qual === 'poder' ? 'poder' : 'resistência'}`}>−</button>
                      <span className="w-6 text-center font-semibold">{pt[qual]}</span>
                      <button onClick={() => onPT(qual, 1)} className="h-6 w-6 rounded-md border border-borda hover:bg-painel" aria-label={`Pôr 1 de ${qual === 'poder' ? 'poder' : 'resistência'}`}>+</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Contadores: o menu fica aberto pra dar vários cliques */}
            <div className="my-1 border-y border-borda px-3 py-1.5">
              <p className="mb-1 text-xs font-semibold text-apagado">Contadores</p>
              {tipos.map((tipo) => (
                <LinhaContador key={tipo} tipo={tipo} n={carta.contadores?.[tipo] ?? 0} onMudar={(delta) => onContador(tipo, delta)} />
              ))}
              <form
                onSubmit={(e) => { e.preventDefault(); if (outro.trim()) { onContador(outro.trim().slice(0, 20), 1); setOutro('') } }}
                className="mt-1 flex gap-1"
              >
                <input
                  value={outro}
                  onChange={(e) => setOutro(e.target.value)}
                  maxLength={20}
                  placeholder="Outro (ex: Tempo)"
                  className="min-w-0 flex-1 rounded-md border border-borda bg-fundo px-2 py-0.5 text-xs outline-none placeholder:text-apagado focus:border-destaque/60"
                />
                <button disabled={!outro.trim()} className="h-6 w-6 rounded-md border border-borda text-xs hover:bg-painel disabled:opacity-40" aria-label="Pôr um contador desse">+</button>
              </form>
            </div>
          </>
        )}
        {zona === 'campo' && carta.dono && (
          <>
            <button onClick={acao(onDevolverControle)} className="block w-full px-3 py-1.5 text-left hover:bg-painel">Devolver o controle a {nomeDe(carta.dono)}</button>
            <p className="px-3 pb-1 text-[11px] text-apagado">É de {nomeDe(carta.dono)}: se sair do campo, vai pra zona dele</p>
          </>
        )}
        {zona === 'campo' && outros.length > 0 && (
          dando ? (
            <div className="border-b border-borda pb-1">
              <p className="px-3 py-1 text-xs text-apagado">Dar o controle a…</p>
              {outros.filter((o) => o.id !== carta.dono).map((o) => (
                <button key={o.id} onClick={acao(() => onDar(o.id))} className="block w-full px-5 py-1.5 text-left hover:bg-painel">{o.nome}</button>
              ))}
            </div>
          ) : (
            <button onClick={() => setDando(true)} className="block w-full px-3 py-1.5 text-left hover:bg-painel">Dar o controle a… ▸</button>
          )
        )}
        {carta.token && <p className="px-3 pb-1 text-[11px] text-apagado">Token: fora do campo, ele deixa de existir</p>}
        {opcoes.map((d) => (
          <button key={d.rotulo} onClick={acao(() => onMover(d.para, d.posicao))} className="block w-full px-3 py-1.5 text-left hover:bg-painel">
            {d.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

// Botão direito numa carta do campo de outro jogador
function MenuCartaDeOutro({ jogador, carta, x, y, eu, nomeDe, podePegar, onPegar, onFechar }: {
  jogador: string; carta: CartaPublica; x: number; y: number; eu: string
  nomeDe: (id: string) => string; podePegar: boolean; onPegar: () => void; onFechar: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70]" onClick={onFechar} onContextMenu={(e) => { e.preventDefault(); onFechar() }}>
      <div
        className="absolute w-60 rounded-lg border border-borda bg-painel-2 py-1 text-sm shadow-2xl shadow-black/60"
        style={{ left: Math.min(x, window.innerWidth - 248), top: Math.min(y, window.innerHeight - 140) }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate px-3 py-1.5 text-xs font-semibold text-apagado">{carta.carta.nome} · campo de {nomeDe(jogador)}</p>
        <button onClick={onPegar} disabled={!podePegar} className="block w-full px-3 py-1.5 text-left hover:bg-painel disabled:cursor-not-allowed disabled:opacity-40">
          {carta.dono === eu ? 'Pegar de volta' : 'Pegar o controle'}
        </button>
        <p className="px-3 pb-1.5 text-[11px] text-apagado">
          {carta.dono && carta.dono !== eu ? `É de ${nomeDe(carta.dono)}: continua sendo dele. ` : ''}Control Magic, Threaten, Act of Treason… Vem pro seu campo como está.
        </p>
      </div>
    </div>
  )
}

// Pilha aberta: cada carta tem os destinos mais comuns à mão, e o ⋯ (ou o botão direito) pro resto.
// Sem onMover é só pra ver (a pilha de outro jogador)
function ListaZona({ titulo, dica, cartas, onMenu, onMover, onFechar }: {
  titulo: string; dica?: string; cartas: CartaPublica[]
  onMenu?: (e: MouseEvent, id: number) => void; onMover?: (id: number, para: Zona) => void; onFechar: () => void
}) {
  const acao = 'flex-1 rounded-md border border-borda py-1 text-xs hover:bg-painel-2'
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-8" onClick={onFechar}>
      <div className="w-full max-w-5xl rounded-lg border border-borda bg-painel p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-titulo text-xl font-semibold">{titulo} · {cartas.length}</h2>
            <p className="text-sm text-apagado">{dica ?? 'A mais recente primeiro.'}</p>
          </div>
          <button onClick={onFechar} className={`${botao} ml-auto`}>Fechar</button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {cartas.map((c) => (
            <div key={c.id} onContextMenu={(e) => onMenu?.(e, c.id)}>
              <ImagemCarta carta={c.carta} />
              {onMover && onMenu && (
                <div className="mt-1 flex gap-1">
                  <button onClick={() => onMover(c.id, 'mao')} className={acao}>Mão</button>
                  <button onClick={() => onMover(c.id, 'campo')} className={acao}>Campo</button>
                  <button onClick={(e) => onMenu(e, c.id)} className={`${acao} max-w-8`} aria-label={`Mais opções de ${c.carta.nome}`}>⋯</button>
                </div>
              )}
            </div>
          ))}
          {!cartas.length && <p className="col-span-full py-8 text-center text-sm text-apagado">Nenhuma carta aqui.</p>}
        </div>
      </div>
    </div>
  )
}

function PainelMulligan({ mesa, voltar, regra, regraDaSala, aDevolver, onRegra, onMulligan, onManter, onAlternar, onConfirmar }: {
  mesa: Mesa; voltar: boolean; regra: RegraMulligan; regraDaSala: boolean; aDevolver: number[]
  onRegra: (r: RegraMulligan) => void; onMulligan: () => void; onManter: () => void
  onAlternar: (id: number) => void; onConfirmar: () => void
}) {
  const devolvendo = mesa.fase === 'devolvendo'
  const quantas = cartasADevolver(regra, mesa.mulligans)
  const podeMulligan = cartasADevolver(regra, mesa.mulligans + 1) < TAMANHO_MAO
  const ficam: Carta[] = mesa.zonas.mao.filter((c) => !aDevolver.includes(c.id)).map((c) => c.carta)
  const avaliacao = avaliarMao(ficam)

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-5xl rounded-lg border border-borda bg-painel p-4 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h2 className="font-titulo text-xl font-semibold">{mesa.mulligans ? `${mesa.mulligans}º mulligan` : 'Mão inicial'}</h2>
            <p className="text-sm text-apagado">{devolvendo ? 'Escolha o que vai pro fundo do grimório' : 'Fica com essa mão?'}</p>
          </div>
          <div className="flex rounded-lg border border-borda p-1 text-sm" role="group" aria-label="Regra de mulligan">
            {([['commander', '1º mulligan grátis'], ['london', 'London']] as const).map(([r, rotulo]) => (
              <button
                key={r}
                onClick={() => onRegra(r)}
                disabled={devolvendo || regraDaSala}
                title={regraDaSala ? 'A regra da sala (o dono escolheu ao criar)' : r === 'commander' ? 'Regra comum nas mesas de Commander: o primeiro mulligan não custa carta' : 'A cada mulligan, compra 7 e devolve 1 carta a mais pro fundo'}
                className={`rounded-lg px-3 py-1 font-medium disabled:cursor-not-allowed ${regra === r ? 'bg-painel-2 text-destaque-forte' : regraDaSala ? 'hidden' : 'text-apagado hover:text-texto'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {voltar && <Link to=".." relative="path" className={`${botao} ml-auto`}>Voltar pro deck</Link>}
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {mesa.zonas.mao.map((c) => {
            const marcada = aDevolver.includes(c.id)
            return devolvendo ? (
              <button
                key={c.id}
                onClick={() => onAlternar(c.id)}
                aria-pressed={marcada}
                title={marcada ? 'Fica na mão' : 'Vai pro fundo do grimório'}
                className={`relative rounded-md transition ${marcada ? 'translate-y-2 opacity-40 ring-2 ring-red-400' : 'hover:-translate-y-1'}`}
              >
                <ImagemCarta carta={c.carta} />
                {marcada && <span className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-red-200">pro fundo</span>}
              </button>
            ) : (
              <ImagemCarta key={c.id} carta={c.carta} />
            )
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {devolvendo ? (
            <>
              <span className="text-sm">
                Escolha <span className="font-semibold text-destaque-forte">{quantas}</span> {quantas === 1 ? 'carta' : 'cartas'} ({aDevolver.length}/{quantas})
              </span>
              <button onClick={onConfirmar} disabled={aDevolver.length !== quantas} className={principal}>Confirmar e começar</button>
            </>
          ) : (
            <>
              <button onClick={onManter} className={principal}>Manter</button>
              <button onClick={onMulligan} disabled={!podeMulligan} className={botao} title={`Embaralha e compra 7; ao manter, devolve ${cartasADevolver(regra, mesa.mulligans + 1)} pro fundo`}>
                Mulligan
              </button>
            </>
          )}
          <p className="text-sm">
            <span className={avaliacao.boa ? 'text-emerald-300' : 'text-amber-200'}>{avaliacao.boa ? '✓' : '!'} {avaliacao.veredito}</span>
            <span className="text-apagado"> · {avaliacao.terrenos} {avaliacao.terrenos === 1 ? 'terreno' : 'terrenos'} · {avaliacao.baratas} {avaliacao.baratas === 1 ? 'mágica' : 'mágicas'} de custo até 2</span>
          </p>
        </div>
      </div>
    </div>
  )
}

const QUANTIDADES = [1, 2, 3, 4, 5, 10]

// Criar tokens: os que o deck usa primeiro, e uma busca pra qualquer outro (Treasure, Clue, Zombie...)
function ModalTokens({ doDeck, erro, onCriar, onFechar }: {
  doDeck: { token: Token; criado_por: string[] }[]; erro: boolean
  onCriar: (carta: Carta, quantos: number) => void; onFechar: () => void
}) {
  const [quantos, setQuantos] = useState(1)
  const [busca, setBusca] = useState('')
  const [ultimo, setUltimo] = useState<string | null>(null)
  const termo = useDebounce(busca.trim())
  const resultados = useQuery({ queryKey: ['tokens', termo], queryFn: () => api.buscarTokens(termo), enabled: termo.length >= 2 })

  function criar(token: Token) {
    onCriar(cartaDoToken(token), quantos)
    setUltimo(`${quantos > 1 ? `${quantos}× ` : ''}${descreverToken(token)}`)
  }

  const grade = (tokens: { token: Token; legenda?: string }[]) => (
    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
      {tokens.map(({ token, legenda }) => (
        <button key={token.oracle_id} onClick={() => criar(token)} title={legenda} className="text-left transition hover:-translate-y-1">
          <ImagemCarta carta={token} />
          <p className="mt-1 truncate text-xs font-medium">{descreverToken(token)}</p>
          {legenda && <p className="truncate text-[11px] text-apagado">{legenda}</p>}
        </button>
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-8" onClick={onFechar}>
      <div className="w-full max-w-5xl rounded-lg border border-borda bg-painel p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h2 className="font-titulo text-xl font-semibold">Criar token</h2>
            <p className="text-sm text-apagado">{ultimo ? <span className="text-emerald-300">✓ Criou {ultimo}</span> : 'Clique no token pra criar no campo. Dá pra clicar várias vezes.'}</p>
          </div>
          <div className="flex items-center gap-1 text-sm" role="group" aria-label="Quantos criar">
            <span className="mr-1 text-apagado">Quantos</span>
            {QUANTIDADES.map((n) => (
              <button key={n} onClick={() => setQuantos(n)} className={`h-8 w-8 rounded-lg border text-sm font-semibold ${quantos === n ? 'border-destaque bg-painel-2 text-destaque-forte' : 'border-borda text-apagado hover:text-texto'}`}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={onFechar} className={`${botao} ml-auto`}>Pronto</button>
        </div>

        {doDeck.length > 0 && (
          <section className="mt-5">
            <h3 className="text-sm font-semibold">Do seu deck</h3>
            {grade(doDeck.map(({ token, criado_por }) => ({ token, legenda: criado_por.join(', ') })))}
          </section>
        )}
        {erro && <p className="mt-4 text-sm text-apagado">Não consegui buscar os tokens do deck (a API está rodando?).</p>}

        <section className="mt-6">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoFocus
            placeholder="Buscar outro token: Treasure, Clue, Zombie, Soldier..."
            className="w-full rounded-lg border border-borda bg-fundo px-4 py-2.5 text-sm outline-none placeholder:text-apagado focus:border-destaque/60"
          />
          {termo.length >= 2 && resultados.data && (
            resultados.data.length ? grade(resultados.data.map((token) => ({ token }))) : <p className="mt-3 text-sm text-apagado">Nenhum token com "{termo}".</p>
          )}
        </section>
      </div>
    </div>
  )
}
