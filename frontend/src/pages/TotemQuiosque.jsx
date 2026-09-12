// Totem de autoatendimento (spec §5.6) — PÚBLICO, standalone, 100dvh, sem Layout.
// Quem monta esta tela é DispositivoPareamento.jsx, depois de o cookie do aparelho
// provar quem ele é: aqui não existe login, não existe loja escolhida na URL e não
// existe token nenhum no endereço.
//
// A ordem das telas é contrato, não gosto:
//   Início → Catálogo → Item → Carrinho → Pagamento → Revisar → (Confirmar) → Resultado
// Pagamento vem ANTES de Revisar porque o método entra no hash da cotação assinada: sem
// ele o HUB não tem o que assinar, e trocar o método depois obriga a recotar.
//
// Quatro regras que valem mais que qualquer detalhe visual:
//  1. Preço aqui é EXIBIÇÃO. Quem calcula é o HUB (`cotar`), e a tela de Revisar mostra
//     o que ELE devolveu — marcando "Preços atualizados" quando diverge do carrinho.
//  2. A chave de idempotência nasce UMA vez, quando o cliente toca em "Confirmar pedido",
//     e é reenviada IGUAL num retry manual de rede. Nunca se gera outra para a mesma
//     confirmação: é ela que impede dois pedidos no Cardápio Web.
//  3. Depois de um 202 ("estamos confirmando") NÃO existe botão de repetir. O pedido pode
//     ter sido criado; oferecer "tentar de novo" seria convidar a cobrar duas vezes.
//  4. A VITRINE (spec §5/§6) é só apresentação. Quando o bootstrap traz `produtos`, o card
//     pode ser uma OPÇÃO do grupo principal ("X BURGUER" dentro de "TRADICIONAIS 🍔"), e
//     essa identidade acompanha o cliente até o comprovante. O que vai no fio, porém, não
//     muda uma vírgula: `montarCarrinho` continua mandando o item base + a opção escolhida,
//     e a linha sai IDÊNTICA à de quem montou o item à mão. Sem `produtos` (servidor antigo
//     ou falha de banco), o grid volta a ser o de `itens`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aparelhoApi } from '../services/api'
import {
  podeAdicionarOpcao, grupoSatisfeito, itemPronto, itemOrdenavel, subtotalLocal,
  montarCarrinho, diffCotacao, chaveNova, mensagemErro, proximoEstadoAposFalha,
  indicePorItemId, linhaDeProduto, gruposRenderizaveis, nomeApresentado,
  imagemApresentada, descricaoApresentada, opcoesVisiveisDaLinha, substituirLinha,
  linhaDoDetalhe,
} from '../components/totemCarrinho'

const VERSAO = 'totem-1.0'
const MS_HEARTBEAT = 60_000
const MS_BOOTSTRAP = 5 * 60_000
const MS_INATIVIDADE = 90_000
const MS_POLL_DISPLAY = 3_000
const MAX_POLL_DISPLAY = 20        // 20 × 3 s = 60 s
const MS_LIBERAR_NOVO = 20_000     // no 202, "Novo pedido" só aparece depois disso

const MODOS = {
  onsite: { titulo: 'Comer aqui', sub: 'Vou comer na loja', emoji: '🍽️' },
  takeout: { titulo: 'Levar', sub: 'Vou levar para viagem', emoji: '🛍️' },
}
const KIND_LABEL = { money: 'Dinheiro', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito' }

const moeda = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const codigoDe = (e) => e?.response?.data?.erro ?? (e?.response ? 'ERRO_INTERNO' : 'HUB_INDISPONIVEL')

// Rótulo do grupo: o que o cliente precisa saber é quantas escolhas ele deve/pode fazer.
function regraDoGrupo(g) {
  const min = Number(g?.min) || 0
  const max = g?.max === null || g?.max === undefined ? null : Number(g.max)
  if (min > 0 && max !== null && max === min) return { texto: `escolha ${min}`, obrigatorio: true }
  if (min > 0 && max !== null) return { texto: `escolha de ${min} a ${max}`, obrigatorio: true }
  if (min > 0) return { texto: `escolha ao menos ${min}`, obrigatorio: true }
  if (max !== null) return { texto: `escolha até ${max}`, obrigatorio: false }
  return { texto: 'opcional', obrigatorio: false }
}

const somaSelecao = (sel) => (Array.isArray(sel) ? sel : []).reduce((s, e) => s + (Number(e?.qtd) || 1), 0)
const qtdSelecionada = (sel, opcaoId) => {
  const e = (Array.isArray(sel) ? sel : []).find((x) => String(x.opcaoId) === String(opcaoId))
  return e ? (Number(e.qtd) || 1) : 0
}

// ── Blocos de UI pequenos ───────────────────────────────────────────────────
const Spinner = ({ claro }) => <span className={'ttm-spinner' + (claro ? ' claro' : '')} aria-hidden="true" />

function Cabecalho({ loja, titulo, aoVoltar, direita }) {
  return (
    <header className="ttm-topo">
      {aoVoltar
        ? <button type="button" className="ttm-voltar" onClick={aoVoltar}>‹ Voltar</button>
        : <span className="ttm-topo-vazio" />}
      <div className="ttm-topo-meio">
        <div className="ttm-topo-titulo">{titulo}</div>
        {loja?.nome && <div className="ttm-topo-loja">{loja.nome}</div>}
      </div>
      <div className="ttm-topo-dir">{direita}</div>
    </header>
  )
}

function TelaAviso({ emoji, titulo, texto, lista, acao }) {
  return (
    <div className="ttm-tela ttm-aviso-tela">
      <div className="ttm-aviso-emoji" aria-hidden="true">{emoji}</div>
      <h1 className="ttm-aviso-titulo">{titulo}</h1>
      <p className="ttm-aviso-texto">{texto}</p>
      {lista}
      {acao}
    </div>
  )
}

// Imagem do item: placeholder desenhado em CSS quando o cardápio não tem foto (é comum),
// para o card não desabar e a grade não ficar torta.
function FotoItem({ src, alt }) {
  const [quebrou, setQuebrou] = useState(false)
  if (!src || quebrou) return <div className="ttm-foto ttm-foto-vazia" aria-hidden="true">🍔</div>
  return <img className="ttm-foto" src={src} alt={alt} loading="lazy" onError={() => setQuebrou(true)} />
}

function PrecoItem({ item }) {
  const promo = item?.precoPromocional !== null && item?.precoPromocional !== undefined
  if (!promo) return <span className="ttm-preco">{moeda(item?.preco)}</span>
  return (
    <span className="ttm-preco">
      <span className="ttm-preco-de">de {moeda(item.preco)}</span>
      <span className="ttm-preco-por">por {moeda(item.precoPromocional)}</span>
    </span>
  )
}

function Stepper({ valor, onMenos, onMais, minimo = 1, maximoAtingido, rotulo }) {
  return (
    <div className="ttm-stepper" role="group" aria-label={rotulo}>
      <button type="button" className="ttm-step" onClick={onMenos} disabled={valor <= minimo} aria-label="Diminuir">−</button>
      <span className="ttm-step-valor" aria-live="polite">{valor}</span>
      <button type="button" className="ttm-step" onClick={onMais} disabled={maximoAtingido} aria-label="Aumentar">+</button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function TotemQuiosque({ aparelho, loja: lojaInicial, onNaoPareado }) {
  // Bootstrap
  const [boot, setBoot] = useState(null)
  const [bootErro, setBootErro] = useState(null)
  const [carregandoBoot, setCarregandoBoot] = useState(true)

  // Fluxo
  const [tela, setTela] = useState('inicio')
  const [orderType, setOrderType] = useState(null)
  const [carrinho, setCarrinho] = useState([])
  const [aberto, setAberto] = useState(null)     // { item, apresentado, qtd, observacao, selecoes, uid? }
  const [categoriaId, setCategoriaId] = useState(null)
  // Recado curto e passageiro (hoje só "Produto indisponível"): o totem não tem Toast —
  // ele é público e standalone —, então é um aviso próprio, que some sozinho.
  const [aviso, setAviso] = useState(null)
  const [metodoId, setMetodoId] = useState(null)

  // Revisar / confirmar
  const [cotando, setCotando] = useState(false)
  const [cotacao, setCotacao] = useState(null)   // { linhas, total, cotacao }
  const [erroCotar, setErroCotar] = useState(null) // { codigo, detalhes }
  const [avisoPrecos, setAvisoPrecos] = useState(null) // { alteradas, alteradasIdx, totalMudou }
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState(null)  // { codigo, podeRepetir }
  const [resultado, setResultado] = useState(null)  // { status, cwDisplayId, referencia, envioId, total }
  const [liberouNovo, setLiberouNovo] = useState(false)

  // A chave de idempotência da confirmação em curso. Ref, não state: ela não desenha nada
  // e não pode ser perdida num re-render no meio da chamada.
  const chaveRef = useRef(null)
  // Espelho em ref do "confirmação em dúvida": `revisar` e `invalidarCotacao` são as duas
  // portas que zeram a chave, e as duas precisam recusar-se a rodar nesse estado — sem
  // depender de state, que chega tarde dentro de um callback já em voo.
  const travadoRef = useRef(false)
  // Cotação: `cotandoRef` guarda o corpo em voo (mata o duplo toque) e `cotarSeqRef` numera
  // as chamadas para que só a ÚLTIMA resposta pinte a tela — sem isso, uma cotação antiga
  // chegando atrasada sobrescreveria o preço novo (last-write-wins com o valor errado).
  const cotandoRef = useRef(null)
  const cotarSeqRef = useRef(0)
  const inatividadeRef = useRef(null)
  // Confirmação em DÚVIDA (timeout/rede/5xx inesperado): o pedido pode existir no Cardápio
  // Web. Enquanto isto for verdade a tela fica travada num único botão e a chave sobrevive.
  const travado = !!erroEnvio?.podeRepetir
  const cotacaoTotal = cotacao?.total ?? null

  // Fatias do resultado usadas como dependência de efeito (ver os dois efeitos abaixo).
  const statusResultado = resultado?.status ?? null
  const displayResultado = resultado?.cwDisplayId ?? null
  const desistiuDoNumero = !!resultado?.desistiuDoNumero
  const envioIdResultado = resultado?.envioId ?? null
  const telaRef = useRef('inicio')
  useEffect(() => { telaRef.current = tela }, [tela])

  // MESCLA, não substitui: o bootstrap manda `logo` e o /eu manda `logoDataUrl`. Trocar um
  // objeto pelo outro perderia a logo (ou o nome) que só a outra rota conhece.
  const loja = useMemo(() => {
    const a = lojaInicial ?? {}
    const b = boot?.loja ?? {}
    if (!lojaInicial && !boot?.loja) return null
    return { ...a, ...b, nome: b.nome ?? a.nome ?? null, logo: b.logo ?? a.logo ?? null, logoDataUrl: a.logoDataUrl ?? b.logoDataUrl ?? null }
  }, [lojaInicial, boot])
  const metodos = useMemo(() => (Array.isArray(boot?.metodos) ? boot.metodos : []), [boot])
  const orderTypes = useMemo(() => (Array.isArray(boot?.orderTypes) ? boot.orderTypes.filter((t) => MODOS[t]) : []), [boot])
  const categorias = useMemo(() => (Array.isArray(boot?.catalogo?.categorias) ? boot.catalogo.categorias : []), [boot])
  // Vitrine (spec §5): o produto apresentado NÃO carrega o item técnico — ele só aponta
  // para `origem.itemId`. Este índice é a ponte, e é o único lugar da tela que resolve
  // esse vínculo. `itens` continua obrigatório no bootstrap, então o índice nunca some.
  const indice = useMemo(() => indicePorItemId(categorias), [categorias])

  // O aviso passageiro se apaga sozinho. Sem Promise no efeito (regra do projeto).
  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(() => setAviso(null), 4_000)
    return () => clearTimeout(t)
  }, [aviso])

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // `silencioso` = refresh de fundo: ele NUNCA derruba um cliente no meio do pedido.
  // Um catálogo que mudou no meio da escolha é problema da cotação (o HUB recusa a linha);
  // trocar o menu debaixo da mão de quem está escolhendo seria pior.
  const carregarBoot = useCallback((silencioso = false) => {
    if (!silencioso) setCarregandoBoot(true)
    aparelhoApi.get('/public/aparelho/totem/bootstrap')
      .then((r) => {
        setBoot(r.data)
        setBootErro(r.data?.conectado === false ? 'CLIENTE_SEM_CW' : null)
      })
      .catch((e) => {
        const cod = codigoDe(e)
        if (cod === 'APARELHO_NAO_PAREADO') { onNaoPareado?.(); return }
        if (!silencioso || telaRef.current === 'inicio') setBootErro(cod)
      })
      .finally(() => setCarregandoBoot(false))
  }, [onNaoPareado])

  useEffect(() => {
    carregarBoot()
    const t = setInterval(() => carregarBoot(true), MS_BOOTSTRAP)
    return () => clearInterval(t)
  }, [carregarBoot])

  // ── Heartbeat (60 s + ao voltar para a tela) ──────────────────────────────
  useEffect(() => {
    const bater = () => {
      aparelhoApi.post('/public/aparelho/heartbeat', {
        versao: VERSAO,
        tela: { w: window.innerWidth, h: window.innerHeight },
      }).catch(() => { /* sinal de vida não é crítico: quem falhou já aparece offline no admin */ })
    }
    bater()
    const t = setInterval(bater, MS_HEARTBEAT)
    const aoVisivel = () => { if (document.visibilityState === 'visible') bater() }
    document.addEventListener('visibilitychange', aoVisivel)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVisivel) }
  }, [])

  // ── Reset ─────────────────────────────────────────────────────────────────
  // Volta ao Início zerando TUDO, inclusive a chave de idempotência: o próximo cliente
  // nunca herda a confirmação do anterior.
  const reiniciar = useCallback((recarregar = false) => {
    chaveRef.current = null
    travadoRef.current = false
    cotandoRef.current = null
    setCarrinho([])
    setAberto(null)
    setMetodoId(null)
    setOrderType(null)
    setCotacao(null)
    setErroCotar(null)
    setAvisoPrecos(null)
    setErroEnvio(null)
    setResultado(null)
    setLiberouNovo(false)
    setCategoriaId(null)
    setAviso(null)
    setTela('inicio')
    if (recarregar) carregarBoot(true)
  }, [carregarBoot])

  // Qualquer mudança de carrinho / modo / método invalida a cotação assinada E a chave:
  // a partir daí é OUTRO pedido, e reusar a chave devolveria o registro do anterior.
  const invalidarCotacao = useCallback(() => {
    // Confirmação em dúvida: NADA invalida a chave. É ela que garante que o "tentar de novo"
    // devolva o pedido que talvez já exista, em vez de criar um segundo.
    if (travadoRef.current) return
    chaveRef.current = null
    setCotacao(null)
    setErroCotar(null)
    setAvisoPrecos(null)
    setErroEnvio(null)
  }, [])

  // ── Inatividade: 90 s em qualquer tela que não seja o Início → reset ──────
  // Os 90 s são folgados de propósito em relação aos 65 s de timeout do axios no POST
  // /pedido: nenhuma confirmação em voo pode ser interrompida por este relógio. E enquanto
  // `enviando` ou `travado` (confirmação em dúvida) o reset NÃO é armado — ele zera a chave
  // de idempotência, e zerar a chave de um pedido que talvez exista é como se cria o segundo.
  useEffect(() => {
    const armar = () => {
      clearTimeout(inatividadeRef.current)
      if (tela === 'inicio' || enviando || travado) return
      inatividadeRef.current = setTimeout(() => reiniciar(true), MS_INATIVIDADE)
    }
    armar()
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel']
    eventos.forEach((ev) => window.addEventListener(ev, armar, { passive: true }))
    return () => {
      clearTimeout(inatividadeRef.current)
      eventos.forEach((ev) => window.removeEventListener(ev, armar))
    }
  }, [tela, enviando, travado, reiniciar])

  // Confirmação em dúvida e o cliente foi embora: em vez de voltar ao Início (que apagaria a
  // dúvida em silêncio), a tela vira RESULTADO com o texto de "estamos confirmando" e manda
  // procurar o balcão. Nenhuma confirmação em dúvida desaparece sem alguém ser avisado.
  useEffect(() => {
    if (!travado) return undefined
    const t = setTimeout(() => {
      setResultado({ status: 'AMBIGUO', envioId: null, cwDisplayId: null, referencia: null, total: cotacaoTotal })
      setTela('resultado')
      // A dúvida foi ENTREGUE (a tela manda procurar o balcão, e a linha ambígua já está no
      // Totem › Pedidos do admin): a trava sai, e daí o reset normal de 90 s pode devolver o
      // totem ao Início em vez de deixá-lo parado nesta tela para sempre.
      travadoRef.current = false
      setErroEnvio(null)
    }, MS_INATIVIDADE)
    return () => clearTimeout(t)
  }, [travado, cotacaoTotal])

  // No 202 o botão "Novo pedido" só aparece depois de 20 s: dá tempo de o cliente LER que
  // o pedido está sendo confirmado e anotar o código, em vez de apagar a tela num toque.
  // Dependências ESTREITAS (status, não o objeto): o polling do número reescreve
  // `resultado`, e depender do objeto reiniciaria a contagem de 20 s a cada resposta.
  useEffect(() => {
    if (tela !== 'resultado' || !statusResultado) return undefined
    if (statusResultado === 'CRIADO') { setLiberouNovo(true); return undefined }
    setLiberouNovo(false)
    const t = setTimeout(() => setLiberouNovo(true), MS_LIBERAR_NOVO)
    return () => clearTimeout(t)
  }, [tela, statusResultado])

  // ── Polling do número do balcão (201 sem cwDisplayId) ────────────────────
  // Também com dependências estreitas — e com `desistiuDoNumero` na guarda: sem ele, o
  // próprio setResultado da desistência religaria o intervalo, e o totem ficaria batendo
  // no servidor para sempre.
  useEffect(() => {
    if (tela !== 'resultado' || statusResultado !== 'CRIADO' || displayResultado || desistiuDoNumero || !envioIdResultado) return undefined
    let tentativas = 0
    let vivo = true
    const t = setInterval(() => {
      tentativas += 1
      if (tentativas > MAX_POLL_DISPLAY) { clearInterval(t); setResultado((r) => (r ? { ...r, desistiuDoNumero: true } : r)); return }
      aparelhoApi.get(`/public/aparelho/totem/pedido/${envioIdResultado}`)
        .then((r) => {
          if (!vivo) return
          if (r.data?.cwDisplayId) { clearInterval(t); setResultado((atual) => (atual ? { ...atual, cwDisplayId: r.data.cwDisplayId } : atual)) }
        })
        .catch(() => { /* o número é conforto: a referência já está na tela */ })
    }, MS_POLL_DISPLAY)
    return () => { vivo = false; clearInterval(t) }
  }, [tela, statusResultado, displayResultado, desistiuDoNumero, envioIdResultado])

  // ── Navegação ─────────────────────────────────────────────────────────────
  function escolherModo(t) {
    setOrderType(t)
    setCategoriaId(categorias[0]?.id ?? null)
    invalidarCotacao()
    setTela('catalogo')
  }

  function abrirItem(item) {
    // Item em falta, ou com um grupo OBRIGATÓRIO em falta, não abre: não há como montá-lo,
    // e deixar o cliente tentar só adiaria a recusa para a tela de revisão.
    if (!itemOrdenavel(item).ok) return
    setAberto({ item, apresentado: null, qtd: 1, observacao: '', selecoes: {}, uid: null })
    setTela('item')
  }

  // Card da VITRINE (§6). O produto pode ser o item inteiro (`ITEM`) ou uma opção do grupo
  // principal (`OPCAO_PRINCIPAL`) — nos dois casos quem vai ao carrinho é o item base, com
  // a opção já escolhida quando for o caso. Item que sumiu do índice entre o bootstrap e o
  // toque não abre uma tela quebrada: o cliente é avisado e continua onde estava.
  function abrirProduto(produto) {
    if (produto?.status && produto.status !== 'ACTIVE') return
    if (produto?.ordenavel === false) return
    const linha = linhaDeProduto(produto, indice)
    if (!linha) { setAviso('Produto indisponível. Escolha outro.'); return }
    setAberto(linha)   // já nasce com `uid: null` (item novo, não edição)
    setTela('item')
  }

  function editarLinha(linha) {
    // `apresentado` viaja junto: é a identidade que o cliente escolheu (X BURGUER), e
    // perdê-la aqui faria a linha voltar a se chamar pelo nome do item base no carrinho.
    setAberto({
      item: linha.item,
      apresentado: linha.apresentado ?? null,
      qtd: linha.qtd,
      observacao: linha.observacao ?? '',
      selecoes: linha.selecoes,
      uid: linha.uid,
    })
    setTela('item')
  }

  function tocarOpcao(grupo, opcao) {
    setAberto((a) => {
      const sel = a.selecoes[grupo.id] ?? []
      const tipo = grupo.choiceType
      // Em SINGLE/MULTIPLE, tocar no que já está escolhido DESMARCA — é o gesto que o
      // cliente espera, e é a única forma de desfazer num grupo opcional.
      if (tipo !== 'SUMMABLE' && qtdSelecionada(sel, opcao.id) > 0) {
        return { ...a, selecoes: { ...a.selecoes, [grupo.id]: sel.filter((e) => String(e.opcaoId) !== String(opcao.id)) } }
      }
      const r = podeAdicionarOpcao(grupo, sel, opcao)
      if (!r.ok) return a
      const nova = r.substitui
        ? [{ opcaoId: opcao.id, qtd: 1 }]
        : (qtdSelecionada(sel, opcao.id) > 0
          ? sel.map((e) => (String(e.opcaoId) === String(opcao.id) ? { ...e, qtd: (Number(e.qtd) || 1) + 1 } : e))
          : [...sel, { opcaoId: opcao.id, qtd: 1 }])
      return { ...a, selecoes: { ...a.selecoes, [grupo.id]: nova } }
    })
  }

  function menosOpcao(grupo, opcao) {
    setAberto((a) => {
      const sel = a.selecoes[grupo.id] ?? []
      const atual = qtdSelecionada(sel, opcao.id)
      if (atual <= 1) return { ...a, selecoes: { ...a.selecoes, [grupo.id]: sel.filter((e) => String(e.opcaoId) !== String(opcao.id)) } }
      return { ...a, selecoes: { ...a.selecoes, [grupo.id]: sel.map((e) => (String(e.opcaoId) === String(opcao.id) ? { ...e, qtd: atual - 1 } : e)) } }
    })
  }

  function adicionarAoCarrinho() {
    const linha = {
      uid: aberto.uid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      item: aberto.item,
      apresentado: aberto.apresentado ?? null,
      qtd: aberto.qtd,
      observacao: aberto.observacao,
      selecoes: aberto.selecoes,
    }
    // Casamento por `uid`, nunca por itemId: duas linhas do MESMO item base (X BURGUER e
    // X BACON) são normais na vitrine, e editar uma não pode encostar na outra.
    setCarrinho((c) => substituirLinha(c, aberto.uid, linha))
    setAberto(null)
    invalidarCotacao()
    setTela('carrinho')
  }

  function removerLinha(uid) {
    setCarrinho((c) => c.filter((l) => l.uid !== uid))
    invalidarCotacao()
  }

  function mudarQtdLinha(uid, delta) {
    setCarrinho((c) => c.map((l) => (l.uid === uid ? { ...l, qtd: Math.max(1, l.qtd + delta) } : l)))
    invalidarCotacao()
  }

  function escolherMetodo(id) {
    if (String(id) !== String(metodoId)) invalidarCotacao()
    setMetodoId(id)
  }

  // ── Revisar: a cotação do HUB ─────────────────────────────────────────────
  const revisar = useCallback(async () => {
    // Confirmação em dúvida: recotar geraria chave nova, e chave nova vira um SEGUNDO pedido.
    // A tela travada só oferece "tentar confirmar de novo"; esta porta fica fechada.
    if (travadoRef.current) return
    const corpo = { orderType, carrinho: montarCarrinho(carrinho), metodoId }
    const assinatura = JSON.stringify(corpo)
    if (cotandoRef.current === assinatura) return // duplo toque no mesmo botão
    cotandoRef.current = assinatura
    const seq = cotarSeqRef.current + 1
    cotarSeqRef.current = seq
    setTela('revisar')
    setCotando(true)
    setErroCotar(null)
    setAvisoPrecos(null)
    setErroEnvio(null)
    // Cotação nova = confirmação nova: a chave antiga não vale mais.
    chaveRef.current = null
    try {
      const { data } = await aparelhoApi.post('/public/aparelho/totem/cotar', corpo)
      if (seq !== cotarSeqRef.current) return // resposta velha: quem manda é a última cotação
      setCotacao(data)
      const totalLocal = carrinho.reduce((s, l) => s + subtotalLocal(l), 0)
      const d = diffCotacao(carrinho, data?.linhas, totalLocal, data?.total)
      setAvisoPrecos(d.alteradas.length || d.totalMudou ? d : null)
    } catch (e) {
      if (seq !== cotarSeqRef.current) return
      const cod = codigoDe(e)
      if (cod === 'APARELHO_NAO_PAREADO') { onNaoPareado?.(); return }
      setCotacao(null)
      setErroCotar({ codigo: cod, detalhes: Array.isArray(e?.response?.data?.detalhes) ? e.response.data.detalhes : [] })
    } finally {
      if (seq === cotarSeqRef.current) { cotandoRef.current = null; setCotando(false) }
    }
  }, [orderType, carrinho, metodoId, onNaoPareado])

  // ── Confirmar: o ponto sem volta ──────────────────────────────────────────
  async function confirmar() {
    if (enviando || !cotacao?.cotacao) return
    // A chave nasce AQUI, uma vez por confirmação. Se já existe (retry manual depois de
    // falha de rede), é reenviada IGUAL: é ela que faz o servidor devolver o mesmo
    // registro em vez de criar um segundo pedido no Cardápio Web.
    if (!chaveRef.current) chaveRef.current = chaveNova()
    // A tentativa está em voo: sai do estado travado (o desfecho abaixo decide se volta).
    travadoRef.current = false
    setEnviando(true)
    setErroEnvio(null)
    try {
      const { data } = await aparelhoApi.post('/public/aparelho/totem/pedido', {
        chaveIdempotencia: chaveRef.current,
        orderType,
        carrinho: montarCarrinho(carrinho),
        metodoId,
        cotacao: cotacao.cotacao,
      }, { timeout: 65_000 })
      // Desfecho definitivo (201/202): a dúvida acabou, a tela destrava.
      travadoRef.current = false
      setResultado({
        status: data?.status ?? 'ENVIANDO',
        envioId: data?.envioId,
        cwDisplayId: data?.cwDisplayId ?? null,
        referencia: data?.referencia ?? null,
        total: data?.total ?? cotacao.total,
      })
      setTela('resultado')
    } catch (e) {
      const resp = e?.response
      const cod = resp?.data?.erro ?? null
      if (cod === 'APARELHO_NAO_PAREADO') { onNaoPareado?.(); return }
      // Quem decide se o pedido PODE existir é a regra pura (testada), não esta função:
      // proximoEstadoAposFalha devolve { travar, novaChave, tela, codigo }.
      const r = proximoEstadoAposFalha({ temResposta: !!resp, http: resp?.status, codigo: cod })
      travadoRef.current = r.travar
      if (r.novaChave) chaveRef.current = null
      const detalhes = Array.isArray(resp?.data?.detalhes) ? resp.data.detalhes : []

      // 409 de cotação: o preço mudou entre revisar e confirmar. Recota (a chave já foi
      // zerada acima, porque o registro anterior ficou gravado como recusado) e volta para
      // Revisar com o aviso de preços.
      if (r.tela === 'revisar' && r.novaChave) {
        setEnviando(false)
        await revisar()
        setAvisoPrecos((a) => a ?? { alteradas: [], totalMudou: true })
        setErroEnvio({ codigo: r.codigo, podeRepetir: false, detalhes })
        return
      }
      if (r.tela === 'erro') {
        // Recusa determinística (está provado que nada foi criado): a chave morreu com o
        // registro e o cliente pode refazer do zero, sem risco de pedido em dobro.
        setErroEnvio({ codigo: r.codigo, podeRepetir: false, detalhes })
        setTela('erro')
        return
      }
      // AMBÍGUO — rede, timeout ou 5xx inesperado: o pedido PODE ter sido criado. A tela
      // fica travada em Revisar, com um único botão que reenvia a MESMA chave; o servidor
      // devolve o registro existente em vez de criar outro pedido.
      setErroEnvio({ codigo: r.codigo, podeRepetir: true, detalhes })
    } finally {
      setEnviando(false)
    }
  }

  // ── Estados de bloqueio (nada de pedido) ─────────────────────────────────
  if (carregandoBoot && !boot) {
    return (
      <div className="ttm-raiz">
        <div className="ttm-tela ttm-centrado"><Spinner /><div className="ttm-carregando-txt">Carregando o menu…</div></div>
      </div>
    )
  }

  // Nenhum bloqueio pode roubar a tela de RESULTADO: ali está o número (ou o código) do
  // pedido que o cliente vai apresentar no balcão. Se a loja fechar ou o catálogo cair
  // logo depois da confirmação, isso é problema do próximo cliente, não deste.
  if (bootErro && tela !== 'resultado') {
    const recarregar = <button type="button" className="ttm-btn ttm-btn-primario" onClick={() => { setBootErro(null); carregarBoot() }}>Tentar de novo</button>
    return (
      <div className="ttm-raiz">
        <TelaAviso emoji="🔌" titulo="Totem indisponível" texto={mensagemErro(bootErro)} acao={recarregar} />
      </div>
    )
  }

  // Loja fechada / sem modo disponível só barra no Início. Quem já está escolhendo segue
  // até Revisar, e lá quem recusa é o HUB (com a razão certa: LOJA_FECHADA, MODO_INDISPONIVEL)
  // — apagar o carrinho de quem está no meio do pedido seria pior do que deixar o servidor
  // dizer não.
  const fechada = boot?.operacional?.abertaAgora === false
  if ((fechada || orderTypes.length === 0) && tela === 'inicio') {
    return (
      <div className="ttm-raiz">
        <TelaAviso
          emoji={fechada ? '🌙' : '⏸️'}
          titulo={fechada ? 'Estamos fechados' : 'Pedidos pausados'}
          texto={fechada
            ? 'A loja não está aceitando pedidos neste momento. Fale com um atendente no balcão.'
            : 'Nenhuma forma de retirada está disponível agora. Fale com um atendente no balcão.'}
        />
      </div>
    )
  }

  const totalLocal = carrinho.reduce((s, l) => s + subtotalLocal(l), 0)
  const itensNoCarrinho = carrinho.reduce((s, l) => s + l.qtd, 0)
  const categoria = categorias.find((c) => String(c.id) === String(categoriaId)) ?? categorias[0] ?? null
  const metodoEscolhido = metodos.find((m) => String(m.id) === String(metodoId)) ?? null
  const nomeMetodo = (m) => (m.kindAmbiguo ? (m.name || KIND_LABEL[m.kind] || m.kind) : (KIND_LABEL[m.kind] || m.name || m.kind))

  // Nome do produto que um `detalhe` de erro está acusando. Com a vitrine, duas linhas podem
  // ser o mesmo item base: quando `linhaDoDetalhe` não consegue apontar UMA, o nome cai para
  // o do item base — verdadeiro para todas — em vez de acusar o produto errado.
  const nomeDoDetalhe = (d) => {
    const linha = linhaDoDetalhe(carrinho, d)
    if (linha) return nomeApresentado(linha)
    return carrinho.find((l) => String(l.item?.id) === String(d?.itemId))?.item?.nome ?? null
  }

  const banner = boot?.desatualizado
    ? <div className="ttm-banner-desatualizado">O menu pode estar desatualizado. O valor final é confirmado na revisão.</div>
    : null

  // ── Telas ─────────────────────────────────────────────────────────────────
  let conteudo = null

  if (tela === 'inicio') {
    const umModo = orderTypes.length === 1
    conteudo = (
      <div className="ttm-tela ttm-inicio">
        {(loja?.logo || loja?.logoDataUrl) && <img className="ttm-logo" src={loja.logo || loja.logoDataUrl} alt="" />}
        <div className="ttm-inicio-loja">{loja?.nome ?? 'Bem-vindo'}</div>
        <h1 className="ttm-inicio-titulo">Faça seu pedido aqui</h1>
        <p className="ttm-inicio-sub">Toque para começar. O pagamento é feito no balcão.</p>
        <div className={'ttm-modos' + (umModo ? ' um' : '')}>
          {orderTypes.map((t) => (
            <button key={t} type="button" className="ttm-modo" onClick={() => escolherModo(t)}>
              <span className="ttm-modo-emoji" aria-hidden="true">{MODOS[t].emoji}</span>
              <span className="ttm-modo-titulo">{umModo ? 'Começar meu pedido' : MODOS[t].titulo}</span>
              <span className="ttm-modo-sub">{umModo ? MODOS[t].titulo : MODOS[t].sub}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (tela === 'catalogo') {
    conteudo = (
      <>
        <Cabecalho
          loja={loja}
          titulo={MODOS[orderType]?.titulo ?? 'Menu'}
          direita={<button type="button" className="ttm-btn-topo" onClick={() => reiniciar()}>Cancelar pedido</button>}
        />
        {banner}
        {categorias.length === 0 ? (
          <div className="ttm-tela ttm-centrado">
            <p className="ttm-aviso-texto">Nenhum item disponível para pedir no totem agora. Fale com um atendente.</p>
          </div>
        ) : (
          <>
            <nav className="ttm-abas" aria-label="Categorias">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={'ttm-aba' + (String(c.id) === String(categoria?.id) ? ' on' : '')}
                  aria-pressed={String(c.id) === String(categoria?.id)}
                  onClick={() => setCategoriaId(c.id)}
                >
                  {c.nome}
                </button>
              ))}
            </nav>
            <div className="ttm-tela ttm-grade">
              {/* A vitrine manda quando o bootstrap a traz (§6). `produtos` pode faltar
                  (falha do banco no PDV, ou versão antiga do servidor): aí o grid volta a
                  ser o de sempre, item por item. Nenhum cliente fica sem cardápio. */}
              {Array.isArray(categoria?.produtos) ? categoria.produtos.map((produto) => {
                // Duas razões diferentes para o card apagar, e elas não se confundem: a
                // OPÇÃO em falta (status MISSING) é "Em falta"; o ITEM base impossível de
                // montar (outro grupo obrigatório sem opção) é "Indisponível no momento".
                const emFalta = produto.status && produto.status !== 'ACTIVE'
                const bloqueado = emFalta || produto.ordenavel === false
                return (
                  <button
                    key={`${categoria.id}-${produto.id}`}
                    type="button"
                    className={'ttm-card' + (bloqueado ? ' falta' : '')}
                    disabled={bloqueado}
                    onClick={() => abrirProduto(produto)}
                  >
                    <FotoItem src={produto.imagem} alt={produto.nome} />
                    <span className="ttm-card-nome">{produto.nome}</span>
                    {produto.descricao && <span className="ttm-card-desc">{produto.descricao}</span>}
                    {bloqueado
                      ? <span className="ttm-card-falta">{!emFalta && produto.motivo === 'GRUPO_EM_FALTA' ? 'Indisponível no momento' : 'Em falta'}</span>
                      : <PrecoItem item={produto} />}
                  </button>
                )
              }) : (categoria?.itens ?? []).map((item) => {
                // Dois jeitos de um item não estar disponível: ele mesmo em falta, ou um
                // grupo obrigatório dele em falta (aí não existe montagem possível). O
                // cliente vê o card apagado com o motivo, nunca um caminho que dá em erro.
                const razao = itemOrdenavel(item)
                const falta = !razao.ok
                return (
                  <button
                    key={`${categoria.id}-${item.id}`}
                    type="button"
                    className={'ttm-card' + (falta ? ' falta' : '')}
                    disabled={falta}
                    onClick={() => abrirItem(item)}
                  >
                    <FotoItem src={item.imagem} alt={item.nome} />
                    <span className="ttm-card-nome">{item.nome}</span>
                    {item.descricao && <span className="ttm-card-desc">{item.descricao}</span>}
                    {falta
                      ? <span className="ttm-card-falta">{razao.motivo === 'GRUPO_EM_FALTA' ? 'Indisponível no momento' : 'Em falta'}</span>
                      : <PrecoItem item={item} />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </>
    )
  }

  if (tela === 'item' && aberto) {
    const pronto = itemPronto(aberto.item, aberto.selecoes)
    // Editar uma linha do carrinho pode reabrir um item que ficou indisponível enquanto o
    // cliente escolhia — por isso a checagem vale aqui também, não só no catálogo.
    const podePedir = itemOrdenavel(aberto.item)
    // Identidade apresentada (§6): no modo EXPANDIDO quem dá nome, foto e descrição à tela
    // é a OPÇÃO escolhida no card, não o item base (que costuma se chamar "TRADICIONAIS 🍔"
    // e custar R$ 0,00). O cliente nunca vê o item base nem um id.
    const nomeNaTela = nomeApresentado(aberto)
    // Preço do cabeçalho: com apresentação, o preço é base + a opção principal — a MESMA
    // conta do card e da projeção do backend (promoção da base + opção). Vai pelo `PrecoItem`
    // com um produto sintético para o "de/por" do card se repetir aqui, sem CSS novo.
    const opcaoPrincipal = aberto.apresentado
      ? ((aberto.item.grupos ?? []).find((g) => String(g.id) === String(aberto.apresentado.grupoPrincipalId))?.opcoes ?? [])
        .find((o) => String(o.id) === String(aberto.apresentado.opcaoId)) ?? null
      : null
    const extraDoPrincipal = Number(opcaoPrincipal?.preco ?? 0)
    const promoDaBase = aberto.item?.precoPromocional
    const precoApresentado = aberto.apresentado
      ? {
        preco: Number(aberto.item?.preco ?? 0) + extraDoPrincipal,
        precoPromocional: (promoDaBase === null || promoDaBase === undefined) ? undefined : Number(promoDaBase) + extraDoPrincipal,
      }
      : null
    conteudo = (
      <>
        <Cabecalho loja={loja} titulo={nomeNaTela} aoVoltar={() => { setAberto(null); setTela(carrinho.length ? 'carrinho' : 'catalogo') }} />
        {banner}
        <div className="ttm-tela ttm-item">
          {!podePedir.ok && (
            <div className="ttm-bloco-erro pequeno">
              {podePedir.motivo === 'GRUPO_EM_FALTA'
                ? 'Indisponível no momento: falta um ingrediente obrigatório deste item. Escolha outro ou chame um atendente.'
                : 'Este item acabou. Escolha outro ou chame um atendente.'}
            </div>
          )}
          <FotoItem src={imagemApresentada(aberto)} alt={nomeNaTela} />
          <div className="ttm-item-cabeca">
            <h1 className="ttm-item-nome">{nomeNaTela}</h1>
            {descricaoApresentada(aberto) && <p className="ttm-item-desc">{descricaoApresentada(aberto)}</p>}
            <PrecoItem item={precoApresentado ?? aberto.item} />
          </div>

          {/* O grupo principal NÃO é desenhado: ele é a identidade do produto, já escolhida
              no card. Trocar de produto é voltar ao grid — não existe "trocar" aqui. */}
          {gruposRenderizaveis(aberto).filter((g) => !g.status || g.status === 'ACTIVE' || g.status === 'MISSING').map((g) => {
            const sel = aberto.selecoes[g.id] ?? []
            const regra = regraDoGrupo(g)
            const faltando = pronto.gruposFaltando.some((id) => String(id) === String(g.id))
            // Grupo em falta continua NA TELA, apagado: sumir com ele faria o cliente achar
            // que o item mudou de receita. Ele não aceita toque, e se for obrigatório o item
            // inteiro já está travado (itemOrdenavel).
            if (g.status === 'MISSING') {
              return (
                <section key={g.id} className="ttm-grupo falta" aria-disabled="true">
                  <div className="ttm-grupo-cabeca">
                    <h2 className="ttm-grupo-nome">{g.nome}</h2>
                    <span className="ttm-grupo-regra">{regra.obrigatorio ? 'obrigatório · ' : ''}em falta</span>
                  </div>
                  <p className="ttm-grupo-indisponivel">Em falta — não dá para escolher agora.</p>
                </section>
              )
            }
            return (
              <section key={g.id} className={'ttm-grupo' + (faltando ? ' faltando' : '')}>
                <div className="ttm-grupo-cabeca">
                  <h2 className="ttm-grupo-nome">{g.nome}</h2>
                  <span className={'ttm-grupo-regra' + (regra.obrigatorio ? ' obrigatorio' : '')}>
                    {regra.obrigatorio ? 'obrigatório · ' : ''}{regra.texto}
                  </span>
                </div>
                {g.choiceType === 'SUMMABLE' && g.max ? (
                  <div className="ttm-grupo-contagem">{somaSelecao(sel)} de {g.max}</div>
                ) : null}
                <div className="ttm-opcoes">
                  {(g.opcoes ?? []).map((op) => {
                    const emFalta = op.status && op.status !== 'ACTIVE'
                    const qtd = qtdSelecionada(sel, op.id)
                    const marcado = qtd > 0
                    const podeMais = podeAdicionarOpcao(g, sel, op).ok
                    if (g.choiceType === 'SUMMABLE') {
                      return (
                        <div key={op.id} className={'ttm-opcao' + (marcado ? ' on' : '') + (emFalta ? ' falta' : '')}>
                          <span className="ttm-opcao-nome">{op.nome}{emFalta ? ' · em falta' : ''}</span>
                          {op.preco > 0 && <span className="ttm-opcao-preco">+ {moeda(op.preco)}</span>}
                          {emFalta ? <span className="ttm-opcao-falta">—</span> : (
                            qtd > 0
                              ? <Stepper valor={qtd} minimo={0} rotulo={op.nome} onMenos={() => menosOpcao(g, op)} onMais={() => tocarOpcao(g, op)} maximoAtingido={!podeMais} />
                              : <button type="button" className="ttm-opcao-add" disabled={!podeMais} onClick={() => tocarOpcao(g, op)}>Adicionar</button>
                          )}
                        </div>
                      )
                    }
                    return (
                      <button
                        key={op.id}
                        type="button"
                        className={'ttm-opcao ttm-opcao-btn' + (marcado ? ' on' : '') + (emFalta ? ' falta' : '')}
                        disabled={emFalta || (!marcado && !podeMais)}
                        aria-pressed={marcado}
                        onClick={() => tocarOpcao(g, op)}
                      >
                        <span className={'ttm-check' + (marcado ? ' on' : '')} aria-hidden="true">{marcado ? '✓' : ''}</span>
                        <span className="ttm-opcao-nome">{op.nome}{emFalta ? ' · em falta' : ''}</span>
                        {op.preco > 0 && <span className="ttm-opcao-preco">+ {moeda(op.preco)}</span>}
                      </button>
                    )
                  })}
                </div>
                {!grupoSatisfeito(g, sel) && regra.obrigatorio && <div className="ttm-grupo-falta">Escolha para continuar</div>}
              </section>
            )
          })}

          <section className="ttm-grupo">
            <div className="ttm-grupo-cabeca">
              <h2 className="ttm-grupo-nome">Alguma observação?</h2>
              <span className="ttm-grupo-regra">opcional</span>
            </div>
            <textarea
              className="ttm-obs"
              rows={2}
              maxLength={200}
              placeholder="Ex.: sem cebola"
              value={aberto.observacao}
              onChange={(e) => setAberto((a) => ({ ...a, observacao: e.target.value }))}
            />
          </section>
        </div>

        <footer className="ttm-rodape">
          <Stepper
            valor={aberto.qtd}
            rotulo="Quantidade"
            onMenos={() => setAberto((a) => ({ ...a, qtd: Math.max(1, a.qtd - 1) }))}
            onMais={() => setAberto((a) => ({ ...a, qtd: a.qtd + 1 }))}
          />
          <button type="button" className="ttm-btn ttm-btn-primario ttm-btn-largo" disabled={!pronto.ok || !podePedir.ok} onClick={adicionarAoCarrinho}>
            {podePedir.ok ? (aberto.uid ? 'Salvar item' : 'Adicionar') : 'Indisponível no momento'} · {moeda(subtotalLocal(aberto))}
          </button>
        </footer>
      </>
    )
  }

  if (tela === 'carrinho') {
    conteudo = (
      <>
        <Cabecalho loja={loja} titulo="Seu pedido" aoVoltar={() => setTela('catalogo')} />
        {banner}
        <div className="ttm-tela ttm-carrinho">
          {carrinho.length === 0 ? (
            <p className="ttm-aviso-texto">Seu carrinho está vazio. Toque em “Voltar” e escolha um item.</p>
          ) : carrinho.map((l) => (
            <div key={l.uid} className="ttm-linha">
              <div className="ttm-linha-corpo">
                <div className="ttm-linha-nome">{l.qtd}× {nomeApresentado(l)}</div>
                {/* Complementos SEM a opção principal: ela é o próprio nome da linha, e
                    listá-la faria "X BURGUER" virar adicional de si mesmo. */}
                <ul className="ttm-linha-opcoes">
                  {opcoesVisiveisDaLinha(l).map((o) => (
                    <li key={`${o.grupoId}-${o.opcaoId}`}>{o.qtd > 1 ? `${o.qtd}× ` : ''}{o.nome}</li>
                  ))}
                </ul>
                {l.observacao ? <div className="ttm-linha-obs">“{l.observacao}”</div> : null}
              </div>
              <div className="ttm-linha-lado">
                <div className="ttm-linha-valor">{moeda(subtotalLocal(l))}</div>
                <Stepper valor={l.qtd} rotulo={`Quantidade de ${nomeApresentado(l)}`} onMenos={() => mudarQtdLinha(l.uid, -1)} onMais={() => mudarQtdLinha(l.uid, 1)} />
                <div className="ttm-linha-acoes">
                  <button type="button" className="ttm-btn-link" onClick={() => editarLinha(l)}>Editar</button>
                  <button type="button" className="ttm-btn-link perigo" onClick={() => removerLinha(l.uid)}>Remover</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <footer className="ttm-rodape ttm-rodape-coluna">
          <div className="ttm-subtotal">
            <span>Subtotal <span className="ttm-subtotal-nota">(a confirmar na revisão)</span></span>
            <strong>{moeda(totalLocal)}</strong>
          </div>
          <div className="ttm-rodape-botoes">
            <button type="button" className="ttm-btn ttm-btn-secundario" onClick={() => setTela('catalogo')}>Adicionar mais</button>
            <button type="button" className="ttm-btn ttm-btn-primario ttm-btn-largo" disabled={carrinho.length === 0} onClick={() => setTela('pagamento')}>
              Ir para o pagamento
            </button>
          </div>
        </footer>
      </>
    )
  }

  if (tela === 'pagamento') {
    conteudo = (
      <>
        <Cabecalho loja={loja} titulo="Forma de pagamento" aoVoltar={() => setTela('carrinho')} />
        {banner}
        <div className="ttm-tela ttm-pagamento">
          <p className="ttm-pagamento-aviso">
            <strong>Você paga no balcão ao retirar.</strong> Nada é cobrado aqui no totem — escolha só como vai pagar,
            para o caixa já saber.
          </p>
          {metodos.length === 0 ? (
            <p className="ttm-aviso-texto">Nenhuma forma de pagamento disponível agora. Fale com um atendente no balcão.</p>
          ) : (
            <div className="ttm-metodos">
              {metodos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={'ttm-metodo' + (String(m.id) === String(metodoId) ? ' on' : '')}
                  aria-pressed={String(m.id) === String(metodoId)}
                  onClick={() => escolherMetodo(m.id)}
                >
                  <span className={'ttm-check' + (String(m.id) === String(metodoId) ? ' on' : '')} aria-hidden="true">
                    {String(m.id) === String(metodoId) ? '✓' : ''}
                  </span>
                  <span className="ttm-metodo-nome">{nomeMetodo(m)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="ttm-rodape ttm-rodape-coluna">
          <div className="ttm-subtotal">
            <span>Subtotal <span className="ttm-subtotal-nota">(a confirmar na revisão)</span></span>
            <strong>{moeda(totalLocal)}</strong>
          </div>
          <button type="button" className="ttm-btn ttm-btn-primario ttm-btn-largo" disabled={!metodoId} onClick={revisar}>
            Revisar o pedido
          </button>
        </footer>
      </>
    )
  }

  if (tela === 'revisar') {
    const linhas = Array.isArray(cotacao?.linhas) ? cotacao.linhas : []
    const alteradas = avisoPrecos?.alteradas ?? []
    const alteradasIdx = avisoPrecos?.alteradasIdx ?? []
    // O HUB devolve as linhas NA ORDEM do carrinho. Quando a contagem bate, cada linha
    // cotada tem a sua linha local — e é dela que saem o nome apresentado e os
    // complementos, para o cliente ver "X BURGUER" aqui como viu no card (o HUB só
    // conhece o item base). Se a contagem não bater (linha recusada), a tela volta ao
    // que o servidor mandou e o destaque cai para o casamento por itemId.
    const porIndice = linhas.length === carrinho.length
    const localDa = (l, i) => (porIndice && String(carrinho[i]?.item?.id) === String(l?.itemId) ? carrinho[i] : null)
    conteudo = (
      <>
        {/* Travada (confirmação em dúvida): sem Voltar. Voltar levaria a uma nova cotação,
            nova cotação gera chave nova, e chave nova cria um SEGUNDO pedido. */}
        <Cabecalho loja={loja} titulo="Confira seu pedido" aoVoltar={(enviando || travado) ? undefined : () => setTela('carrinho')} />
        {banner}
        <div className="ttm-tela ttm-revisar">
          {cotando ? (
            <div className="ttm-centrado"><Spinner /><div className="ttm-carregando-txt">Calculando o valor do seu pedido…</div></div>
          ) : erroCotar ? (
            <div className="ttm-bloco-erro">
              <div className="ttm-bloco-erro-titulo">Não foi possível fechar o valor</div>
              <p className="ttm-bloco-erro-texto">{mensagemErro(erroCotar.codigo)}</p>
              {erroCotar.detalhes.length > 0 && (
                <ul className="ttm-erro-lista">
                  {erroCotar.detalhes.map((d, i) => {
                    const nome = nomeDoDetalhe(d)
                    // `mensagem` é a frase que o próprio servidor escreveu para ESTA linha
                    // (mais específica que a frase geral do código): quando vem, ela manda.
                    return <li key={`${d.codigo}-${i}`}>{nome ? <strong>{nome}: </strong> : null}{d.mensagem ?? mensagemErro(d.codigo)}</li>
                  })}
                </ul>
              )}
              <div className="ttm-rodape-botoes">
                <button type="button" className="ttm-btn ttm-btn-secundario" onClick={() => setTela('carrinho')}>Voltar ao carrinho</button>
                <button type="button" className="ttm-btn ttm-btn-primario" onClick={revisar}>Tentar de novo</button>
              </div>
            </div>
          ) : (
            <>
              {avisoPrecos && (
                <div className="ttm-precos-mudaram" role="status">
                  <strong>Preços atualizados.</strong> O cardápio mudou enquanto você escolhia. Confira o novo valor antes de confirmar.
                </div>
              )}
              {erroEnvio && !erroEnvio.podeRepetir && (
                <div className="ttm-bloco-erro pequeno">{mensagemErro(erroEnvio.codigo)}</div>
              )}
              <div className="ttm-revisar-modo">
                {MODOS[orderType]?.titulo} · {metodoEscolhido ? nomeMetodo(metodoEscolhido) : '—'}
                {!travado && (
                  <button type="button" className="ttm-btn-link" disabled={enviando} onClick={() => setTela('pagamento')}>trocar pagamento</button>
                )}
              </div>
              {linhas.map((l, i) => {
                const local = localDa(l, i)
                // Destaque por ÍNDICE (§6, ajuste 5): duas linhas podem ser do mesmo item
                // base, e marcar por itemId acenderia as duas quando só uma mudou.
                const mudou = local
                  ? alteradasIdx.includes(i)
                  : alteradas.some((id) => String(id) === String(l.itemId))
                // A lista de opções continua sendo a DO HUB: é ela que traz a ordem do
                // Cardápio Web e as quantidades já consolidadas do que foi realmente cotado.
                // Da linha local sai só uma coisa — qual opção é a PRINCIPAL, para escondê-la
                // (ela já é o nome da linha). Reconstruir a lista aqui seria trocar o que o
                // servidor cobrou pelo que a tela achava.
                const principal = local?.apresentado?.opcaoId
                const opcoes = (l.opcoes ?? []).filter((o) => (
                  principal === null || principal === undefined || String(o.opcaoId) !== String(principal)
                ))
                return (
                  <div key={`${l.itemId}-${i}`} className={'ttm-linha' + (mudou ? ' mudou' : '')}>
                    <div className="ttm-linha-corpo">
                      <div className="ttm-linha-nome">{l.qtd}× {local ? nomeApresentado(local) : l.nome}</div>
                      <ul className="ttm-linha-opcoes">
                        {opcoes.map((o, j) => (
                          <li key={`${o.opcaoId}-${j}`}>{(Number(o.qtd) || 1) > 1 ? `${o.qtd}× ` : ''}{o.nome}</li>
                        ))}
                      </ul>
                      {mudou && <div className="ttm-linha-mudou">preço atualizado</div>}
                    </div>
                    <div className="ttm-linha-valor">{moeda(l.totalPrice)}</div>
                  </div>
                )
              })}
              <div className="ttm-pagar-no-balcao">Pagamento no balcão, na retirada.</div>
            </>
          )}
        </div>
        {!cotando && !erroCotar && (
          <footer className="ttm-rodape ttm-rodape-coluna">
            <div className="ttm-total">
              <span>Total</span>
              <strong className={avisoPrecos?.totalMudou ? 'mudou' : undefined}>{moeda(cotacao?.total)}</strong>
            </div>
            {travado ? (
              <div className="ttm-retry">
                <p className="ttm-retry-texto">
                  Não conseguimos falar com o sistema. <strong>Seu pedido pode já ter sido registrado.</strong>{' '}
                  Toque no botão abaixo — não vai sair pedido em dobro.
                </p>
                <button type="button" className="ttm-btn ttm-btn-primario ttm-btn-largo" disabled={enviando} onClick={confirmar}>
                  {enviando ? <><Spinner claro /> Enviando…</> : 'Tentar confirmar de novo'}
                </button>
                <p className="ttm-retry-nota">Se preferir, chame um atendente.</p>
              </div>
            ) : (
              <button type="button" className="ttm-btn ttm-btn-primario ttm-btn-largo" disabled={enviando || !cotacao?.cotacao} onClick={confirmar}>
                {enviando ? <><Spinner claro /> Enviando seu pedido…</> : 'Confirmar pedido'}
              </button>
            )}
          </footer>
        )}
        {enviando && (
          <div className="ttm-enviando" role="status" aria-live="assertive">
            <Spinner />
            <div className="ttm-enviando-titulo">Enviando seu pedido</div>
            <div className="ttm-enviando-texto">Não feche esta tela. Isso pode levar até um minuto.</div>
          </div>
        )}
      </>
    )
  }

  if (tela === 'erro') {
    // O `detalhes` do 422 diz QUAL linha o servidor recusou. Repetir só a frase geral deixaria
    // o cliente adivinhando qual item tirar do carrinho.
    const detalhes = Array.isArray(erroEnvio?.detalhes) ? erroEnvio.detalhes : []
    conteudo = (
      <TelaAviso
        emoji="⚠️"
        titulo="Não foi possível registrar o pedido"
        texto={mensagemErro(erroEnvio?.codigo)}
        lista={detalhes.length > 0 ? (
          <ul className="ttm-erro-lista">
            {detalhes.map((d, i) => {
              const nome = nomeDoDetalhe(d)
              // Idem: a frase do servidor (inclusive a de `validarCorpoPedido`, que já vem
              // pronta por campo) ganha da frase genérica do código.
              return <li key={`${d.codigo ?? d.campo ?? 'd'}-${i}`}>{nome ? <strong>{nome}: </strong> : null}{d.mensagem ?? mensagemErro(d.codigo)}</li>
            })}
          </ul>
        ) : null}
        acao={
          <div className="ttm-rodape-botoes">
            <button type="button" className="ttm-btn ttm-btn-secundario" onClick={() => { setErroEnvio(null); setTela('carrinho') }}>Voltar</button>
            <button type="button" className="ttm-btn ttm-btn-primario" onClick={() => reiniciar(true)}>Começar de novo</button>
          </div>
        }
      />
    )
  }

  if (tela === 'resultado' && resultado) {
    const criado = resultado.status === 'CRIADO'
    const temNumero = criado && !!resultado.cwDisplayId
    const aindaBuscando = criado && !resultado.cwDisplayId && !resultado.desistiuDoNumero
    conteudo = (
      <div className="ttm-tela ttm-resultado">
        <div className="ttm-resultado-emoji" aria-hidden="true">{criado ? '✅' : '⏳'}</div>
        {temNumero ? (
          <>
            <div className="ttm-resultado-rotulo">Seu pedido</div>
            <div className="ttm-numero">#{resultado.cwDisplayId}</div>
            <p className="ttm-resultado-texto">Acompanhe o número no balcão. O pagamento é feito na retirada.</p>
          </>
        ) : aindaBuscando ? (
          <>
            <div className="ttm-resultado-rotulo">Pedido registrado</div>
            <div className="ttm-numero ttm-numero-buscando"><Spinner /> Gerando o número…</div>
            <p className="ttm-resultado-texto">Já está na cozinha. Em instantes o número aparece aqui.</p>
            <div className="ttm-codigo-balcao">
              <span>Se preferir, apresente este código no balcão:</span>
              <strong>{resultado.referencia}</strong>
            </div>
          </>
        ) : criado ? (
          <>
            <div className="ttm-resultado-rotulo">Pedido registrado</div>
            <p className="ttm-resultado-texto">Apresente este código no balcão:</p>
            <div className="ttm-numero ttm-numero-ref">{resultado.referencia}</div>
          </>
        ) : resultado.referencia ? (
          <>
            <div className="ttm-resultado-rotulo">Estamos confirmando seu pedido</div>
            <p className="ttm-resultado-texto">
              Apresente este código no balcão e o atendente confirma para você. <strong>Não faça o pedido de novo.</strong>
            </p>
            <div className="ttm-numero ttm-numero-ref">{resultado.referencia}</div>
          </>
        ) : (
          // Sem código: a confirmação ficou em dúvida antes de o servidor devolver a
          // referência. Não há o que apresentar — o que existe é o balcão.
          <>
            <div className="ttm-resultado-rotulo">Estamos confirmando seu pedido</div>
            <p className="ttm-resultado-texto">
              <strong>Procure o balcão.</strong> O atendente confirma o seu pedido.{' '}
              <strong>Não faça o pedido de novo.</strong>
            </p>
          </>
        )}
        <div className="ttm-resultado-total">Total {moeda(resultado.total)} · pague no balcão</div>
        {liberouNovo
          ? <button type="button" className="ttm-btn ttm-btn-primario ttm-btn-largo" onClick={() => reiniciar(true)}>Novo pedido</button>
          : <div className="ttm-resultado-espera">Anote o código. O totem volta ao início em instantes.</div>}
      </div>
    )
  }

  return (
    <div className="ttm-raiz">
      {conteudo}
      {aviso && <div className="ttm-aviso-passageiro" role="status" aria-live="polite">{aviso}</div>}
      {itensNoCarrinho > 0 && tela === 'catalogo' && (
        <button type="button" className="ttm-flutuante" onClick={() => setTela('carrinho')}>
          <span className="ttm-flutuante-qtd">{itensNoCarrinho}</span>
          Ver meu pedido · {moeda(totalLocal)}
        </button>
      )}
      {/* Nome do aparelho só no Início: ajuda a equipe a saber de qual tablet se fala,
          e não polui a tela enquanto o cliente escolhe. */}
      {tela === 'inicio' && aparelho?.nome ? <div className="ttm-rodape-aparelho">{aparelho.nome}</div> : null}
    </div>
  )
}
