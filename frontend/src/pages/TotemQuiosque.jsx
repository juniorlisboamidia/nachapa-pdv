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
import Casca from '../components/totem/Casca'
import Cabecalho from '../components/totem/Cabecalho'
import TelaInicio from '../components/totem/TelaInicio'
import TelaEspera from '../components/totem/TelaEspera'
import TelaCatalogo from '../components/totem/TelaCatalogo'
import BarraPedido from '../components/totem/BarraPedido'
import TelaItem from '../components/totem/TelaItem'
import TelaCarrinho from '../components/totem/TelaCarrinho'
import TelaPagamento from '../components/totem/TelaPagamento'
import TelaRevisar from '../components/totem/TelaRevisar'
import Spinner from '../components/totem/Spinner'
import TelaAviso from '../components/totem/TelaAviso'
import TelaResultado from '../components/totem/TelaResultado'
import SheetInatividade from '../components/totem/SheetInatividade'
import { Ico } from '../components/totem/icones'
import { obrigatoriosPendentes, aplicarToque, aplicarMenos } from '../components/totemLayout'
import { atingiuMax, proximoFoco } from '../components/totemFoco'
import {
  itemPronto, itemOrdenavel, subtotalLocal,
  montarCarrinho, diffCotacao, chaveNova, mensagemErro, proximoEstadoAposFalha,
  indicePorItemId, linhaDeProduto, gruposRenderizaveis, nomeApresentado,
  imagemApresentada, descricaoApresentada, substituirLinha,
  linhaDoDetalhe, precoDoCard, precoDoCabecalho,
} from '../components/totemCarrinho'
// O relógio de ociosidade: conversão para ms, o instante do aviso e a CAPTURA do valor
// pela sessão. A régua (piso, teto) é do backend — aqui só há defesa contra ausência.
import {
  MS_AVISO_INATIVIDADE, MS_AMBIGUO, msDoAviso, criarRelogioSessao,
} from '../components/totemOciosidade'
// Loja fechada × canal sem modo: dois estados que estavam na mesma condição e têm
// consequências opostas. Ver totemLoja.js.
import { estadoDoCanal, podeAvancar } from '../components/totemLoja'
// Repouso × sessão. `emRepouso` é a fonte única de "existe sessão?" — a pergunta que o
// código fazia comparando `tela === 'inicio'`, quando início e repouso eram a mesma tela.
import { TELA_REPOUSO, armaReset, armaAviso } from '../components/totemSessao'

const VERSAO = 'totem-1.0'
const MS_HEARTBEAT = 60_000
const MS_BOOTSTRAP = 5 * 60_000
const MS_POLL_DISPLAY = 3_000
const MAX_POLL_DISPLAY = 20        // 20 × 3 s = 60 s
const MS_LIBERAR_NOVO = 20_000     // no 202, "Novo pedido" só aparece depois disso

const MODOS = {
  onsite: { titulo: 'Comer aqui', sub: 'Vou comer na loja', ico: 'talheres' },
  takeout: { titulo: 'Levar', sub: 'Vou levar para viagem', ico: 'sacola' },
}
const KIND_LABEL = { money: 'Dinheiro', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito' }

const codigoDe = (e) => e?.response?.data?.erro ?? (e?.response ? 'ERRO_INTERNO' : 'HUB_INDISPONIVEL')

// Os grupos que o DETALHE desenha: sem o principal da vitrine (ele é a identidade
// do produto, escolhida no card) e sem os INACTIVE, que o HUB também ignora.
// Vive fora do componente porque é usado nos dois lados — no que desenha e no
// que decide o avanço automático — e precisa dar exatamente a mesma lista.
const gruposVisiveisDe = (linha) => (
  linha ? gruposRenderizaveis(linha).filter((g) => !g.status || g.status === 'ACTIVE' || g.status === 'MISSING') : []
)


// ── Blocos de UI pequenos ───────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
export default function TotemQuiosque({ loja: lojaInicial, onNaoPareado }) {
  // Bootstrap
  const [boot, setBoot] = useState(null)
  const [bootErro, setBootErro] = useState(null)
  const [carregandoBoot, setCarregandoBoot] = useState(true)

  // Fluxo
  // Monta em REPOUSO: o totem passa a maior parte da vida nesta tela, e abrir direto na
  // escolha do modo diria que há uma sessão que ninguém começou.
  const [tela, setTela] = useState(TELA_REPOUSO)
  const [orderType, setOrderType] = useState(null)
  const [carrinho, setCarrinho] = useState([])
  const [aberto, setAberto] = useState(null)     // { item, apresentado, qtd, observacao, selecoes, uid? }
  const [categoriaId, setCategoriaId] = useState(null)
  // Recado curto e passageiro: confirma o item que entrou no pedido e avisa a
  // vitrine que saiu do ar. O totem não tem Toast (é público e standalone), então
  // é um aviso próprio, que some sozinho. `{ texto, tom, ms }`.
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
  // Segundos restantes no aviso "Ainda está aí?"; `null` = sem aviso na tela.
  const [alertaInatividade, setAlertaInatividade] = useState(null)

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
  // O tempo de ociosidade DESTA sessão, capturado quando ela começa. O bootstrap se refaz
  // sozinho a cada 5 min: sem capturar, uma troca de configuração no meio do pedido
  // encurtaria o relógio de quem já estava escolhendo. Ver totemOciosidade.js.
  const relogioRef = useRef(null)
  if (relogioRef.current === null) relogioRef.current = criarRelogioSessao()
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
  // Confirmação some rápido (2,5 s); recado de erro fica os 4 s de sempre.
  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(() => setAviso(null), aviso.ms ?? 4_000)
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
    // A sessão acabou: o valor capturado é solto, e a PRÓXIMA sessão pega o mais recente
    // que o bootstrap tiver trazido enquanto isso.
    relogioRef.current.encerrar()
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
    setAlertaInatividade(null)
    // TODA volta ao início é abandono de sessão — cancelar no cabeçalho, "começar de novo"
    // depois de um erro, "novo pedido" depois do comprovante, e o próprio estouro do
    // relógio. Nenhuma delas significa "voltar a escolher o modo", então todas vão para o
    // REPOUSO. Não existe hoje um caminho de volta a `inicio` dentro da sessão; se um dia
    // existir, ele chama `setTela('inicio')` e não passa por aqui.
    setTela(TELA_REPOUSO)
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

  // ── Inatividade: o tempo configurado pela loja, em qualquer tela que não seja o
  // Início → reset ──────────────────────────────────────────────────────────
  // O valor é o CAPTURADO pela sessão (`relogioRef`), nunca o que o bootstrap acabou de
  // trazer: uma troca de configuração no meio do pedido não encurta o relógio de quem já
  // estava escolhendo.
  //
  // O padrão de 90 s é folgado de propósito em relação aos 65 s de timeout do axios no POST
  // /pedido: nenhuma confirmação em voo pode ser interrompida por este relógio. Com a loja
  // configurando abaixo disso a folga some — e é por isso que `enviando` continua sendo
  // guarda absoluta aqui, e não um detalhe. Enquanto `enviando` ou `travado` (confirmação
  // em dúvida) o reset NÃO é armado: ele zera a chave de idempotência, e zerar a chave de um
  // pedido que talvez exista é como se cria o segundo.
  useEffect(() => {
    const armar = () => {
      clearTimeout(inatividadeRef.current)
      if (!armaReset({ tela, enviando, travado })) return
      inatividadeRef.current = setTimeout(() => reiniciar(true), relogioRef.current.atual())
    }
    armar()
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel']
    eventos.forEach((ev) => window.addEventListener(ev, armar, { passive: true }))
    return () => {
      clearTimeout(inatividadeRef.current)
      eventos.forEach((ev) => window.removeEventListener(ev, armar))
    }
  }, [tela, enviando, travado, reiniciar])

  // Aviso "Ainda está aí?", 15 s antes do reset. Vive num efeito PRÓPRIO, e não
  // dentro do relógio acima, por dois motivos: o relógio de reset não pode ganhar
  // dependência nova (é ele que protege a chave de idempotência), e nada aqui
  // pode marcar estado de forma síncrona no corpo do efeito.
  //
  // As guardas são as mesmas do reset — enviando ou confirmação em dúvida não têm
  // aviso, porque nesses estados o totem também não volta sozinho ao Início.
  //
  // A tela de RESULTADO também fica de fora: ali o relógio de reset continua
  // correndo (é assim que o totem volta ao Início depois do pedido), mas cobrir
  // o número do pedido com "o seu pedido é apagado" seria mentir para quem está
  // justamente anotando esse número.
  useEffect(() => {
    if (!armaAviso({ tela, enviando, travado })) return undefined
    let t = null
    let iv = null
    const parar = () => { clearTimeout(t); clearInterval(iv); t = null; iv = null }
    const agendar = () => {
      parar()
      // Os 15 s FINAIS do tempo total da sessão — `msDoAviso` faz essa conta num lugar
      // só e impede atraso negativo, que dispararia o aviso na hora.
      t = setTimeout(() => {
        setAlertaInatividade(Math.round(MS_AVISO_INATIVIDADE / 1000))
        iv = setInterval(() => setAlertaInatividade((n) => (n === null ? null : n - 1)), 1_000)
      }, msDoAviso(relogioRef.current.atual()))
    }
    const aoInteragir = () => { setAlertaInatividade(null); agendar() }
    agendar()
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel']
    eventos.forEach((ev) => window.addEventListener(ev, aoInteragir, { passive: true }))
    return () => {
      parar()
      eventos.forEach((ev) => window.removeEventListener(ev, aoInteragir))
    }
  }, [tela, enviando, travado])

  // Confirmação em dúvida e o cliente foi embora: em vez de voltar ao Início (que apagaria a
  // dúvida em silêncio), a tela vira RESULTADO com o texto de "estamos confirmando" e manda
  // procurar o balcão. Nenhuma confirmação em dúvida desaparece sem alguém ser avisado.
  useEffect(() => {
    if (!travado) return undefined
    const t = setTimeout(() => {
      setResultado({ status: 'AMBIGUO', envioId: null, cwDisplayId: null, referencia: null, total: cotacaoTotal })
      setTela('resultado')
      // A dúvida foi ENTREGUE (a tela manda procurar o balcão, e a linha ambígua já está no
      // Totem › Pedidos do admin): a trava sai, e daí o reset normal pode devolver o
      // totem ao Início em vez de deixá-lo parado nesta tela para sempre.
      travadoRef.current = false
      setErroEnvio(null)
    }, MS_AMBIGUO)
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
  // COMEÇO DA SESSÃO: o toque na espera. A captura do relógio é aqui, e não na escolha do
  // modo, porque quem tocou já iniciou — mesmo sem ter dito ainda se come na loja ou leva.
  // Sem isto, um cliente que tocasse e fosse embora deixaria o totem parado na escolha.
  function comecarSessao() {
    relogioRef.current.iniciar(boot?.configuracao)
    setTela('inicio')
  }

  function escolherModo(t) {
    setOrderType(t)
    setCategoriaId(categorias[0]?.id ?? null)
    invalidarCotacao()
    setTela('catalogo')
  }

  // Carrinho → pagamento. A guarda vive AQUI, e não só no `disabled` do rodapé: aparência
  // é metade da proteção, e uma regressão de markup ou de CSS não pode reabrir o caminho.
  //
  // Isto é UX, não autoridade: o HUB/CW continuam recusando com LOJA_FECHADA na cotação e
  // na confirmação, inclusive quando a loja fecha DEPOIS de o cliente já ter passado
  // daqui. Nenhuma validação de servidor foi afrouxada porque a tela passou a cuidar.
  function irParaPagamento() {
    if (!podeAvancar({ fechada: estadoDoCanal(boot).fechada, qtdLinhas: carrinho.length })) return
    setTela('pagamento')
  }

  function abrirItem(item) {
    // Item em falta, ou com um grupo OBRIGATÓRIO em falta, não abre: não há como montá-lo,
    // e deixar o cliente tentar só adiaria a recusa para a tela de revisão.
    if (!itemOrdenavel(item).ok) return
    setAberto({ item, apresentado: null, qtd: 1, observacao: '', selecoes: {}, uid: null, precoCard: null })
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
    if (!linha) { setAviso({ texto: 'Produto indisponível. Escolha outro.', tom: 'erro' }); return }
    // O preço do CARD viaja junto (fora do módulo puro, porque é rotulagem de tela): é o
    // piso que o cliente acabou de ler no grid, e o cabeçalho do detalhe não pode desmentir
    // esse número enquanto ele ainda não escolheu os obrigatórios que faltam.
    setAberto({ ...linha, precoCard: precoDoCard(produto) })   // já nasce com `uid: null` (item novo, não edição)
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
      precoCard: linha.precoCard ?? null,
    })
    setTela('item')
  }

  // Tudo acontece DENTRO do updater, e de propósito: a decisão de avançar depende
  // de comparar a seleção antes e depois do MESMO toque, e ler o estado de fora
  // daria a versão do render anterior num toque duplo. Aqui é tudo puro —
  // `aplicarToque` e `proximoFoco` são funções testadas, sem efeito colateral.
  //
  // O alvo do avanço mora em `aberto.foco`, não num estado à parte: abrir outro
  // produto ou fechar o detalhe já apaga o alvo junto, sem limpeza manual.
  function tocarOpcao(grupo, opcao) {
    setAberto((a) => {
      const antes = a.selecoes[grupo.id] ?? []
      const depois = aplicarToque(grupo, antes, opcao)
      if (depois === antes) return a   // toque recusado (limite, opção em falta)
      const foco = atingiuMax(grupo, antes, depois)
        ? { ...proximoFoco(gruposVisiveisDe(a), grupo.id), seq: (a.foco?.seq ?? 0) + 1 }
        : a.foco                        // desmarcar e escolha parcial não movem a tela
      return { ...a, selecoes: { ...a.selecoes, [grupo.id]: depois }, foco }
    })
  }

  function menosOpcao(grupo, opcao) {
    setAberto((a) => ({
      ...a,
      selecoes: { ...a.selecoes, [grupo.id]: aplicarMenos(a.selecoes[grupo.id] ?? [], opcao) },
    }))
  }

  function adicionarAoCarrinho() {
    const linha = {
      uid: aberto.uid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      item: aberto.item,
      apresentado: aberto.apresentado ?? null,
      qtd: aberto.qtd,
      observacao: aberto.observacao,
      selecoes: aberto.selecoes,
      precoCard: aberto.precoCard ?? null,
    }
    // Casamento por `uid`, nunca por itemId: duas linhas do MESMO item base (X BURGUER e
    // X BACON) são normais na vitrine, e editar uma não pode encostar na outra.
    const edicao = !!aberto.uid
    setCarrinho((c) => substituirLinha(c, aberto.uid, linha))
    setAberto(null)
    invalidarCotacao()
    // Item NOVO devolve ao catálogo: montar três itens não pode custar três idas
    // e voltas ao carrinho, que fica sempre à mão na barra. EDIÇÃO volta ao
    // carrinho, que é de onde ela partiu.
    setTela(edicao ? 'carrinho' : 'catalogo')
    setAviso({ texto: edicao ? 'Item atualizado' : 'Adicionado ao pedido', tom: 'ok', ms: 2_500 })
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
      <Casca>
        <div className="tq-centrado"><Spinner /><div className="tq-carregando-txt">Carregando o menu…</div></div>
      </Casca>
    )
  }

  // Nenhum bloqueio pode roubar a tela de RESULTADO: ali está o número (ou o código) do
  // pedido que o cliente vai apresentar no balcão. Se a loja fechar ou o catálogo cair
  // logo depois da confirmação, isso é problema do próximo cliente, não deste.
  if (bootErro && tela !== 'resultado') {
    const recarregar = (
      <button type="button" className="tq-btn tq-btn-primario" onClick={() => { setBootErro(null); carregarBoot() }}>
        Tentar de novo
      </button>
    )
    return (
      <Casca>
        <TelaAviso icone="semRede" titulo="Totem indisponível" texto={mensagemErro(bootErro)} acoes={recarregar} />
      </Casca>
    )
  }

  // O canal tem DOIS estados de bloqueio, e eles eram um só até aqui.
  //
  // LOJA FECHADA não barra mais nada além do pagamento: o cliente entra, navega o cardápio
  // inteiro, abre produto, escolhe complemento e monta o carrinho — como no Cardápio Web.
  // A recusa aparece no rodapé do carrinho, onde ele ia tocar. Esconder a loja inteira por
  // causa do relógio era o comportamento errado: quem está em pé na frente do totem, com a
  // vitrine acesa ao lado, não entende uma tela preta.
  //
  // SEM MODO DISPONÍVEL continua barrando na entrada, e é outra coisa: o fluxo COMEÇA
  // escolhendo "comer aqui" ou "levar", e sem nenhum dos dois o cliente ficaria preso numa
  // tela inicial que não leva a lugar nenhum.
  const canal = estadoDoCanal(boot)
  if (canal.bloquearEntrada && tela === 'inicio') {
    return (
      <Casca>
        <TelaAviso
          icone="pausa"
          titulo="Pedidos pausados"
          texto="Nenhuma forma de retirada está disponível agora. Fale com um atendente no balcão."
        />
      </Casca>
    )
  }

  const totalLocal = carrinho.reduce((s, l) => s + subtotalLocal(l), 0)
  const itensNoCarrinho = carrinho.reduce((s, l) => s + l.qtd, 0)
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
    ? <div className="tq-banner">O menu pode estar desatualizado. O valor final é confirmado na revisão.</div>
    : null

  // ── Telas ─────────────────────────────────────────────────────────────────
  let conteudo = null

  if (tela === TELA_REPOUSO) {
    return (
      <Casca>
        <TelaEspera loja={loja} aoTocar={comecarSessao} />
      </Casca>
    )
  }

  if (tela === 'inicio') {
    conteudo = (
      <TelaInicio
        loja={loja}
        modos={orderTypes.map((t) => ({ id: t, ...MODOS[t] }))}
        aoEscolher={escolherModo}
      />
    )
  }

  if (tela === 'catalogo') {
    conteudo = (
      <>
        <Cabecalho key="cab-catalogo" loja={loja} modo={MODOS[orderType]?.titulo ?? 'Menu'} aoCancelar={() => reiniciar()} />
        {banner}
        <TelaCatalogo
          categorias={categorias}
          categoriaId={categoriaId ?? categorias[0]?.id}
          aoTrocarCategoria={setCategoriaId}
          aoAbrirProduto={abrirProduto}
          aoAbrirItem={abrirItem}
        />
        <BarraPedido quantidade={itensNoCarrinho} total={totalLocal} aoVerPedido={() => setTela('carrinho')} />
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
    // Preço do cabeçalho (§6 rev. 3): o MAIOR entre o subtotal corrente e o piso que o card
    // prometeu. Enquanto faltar obrigatório o rótulo "a partir de" continua ao lado;
    // completado o item, o valor é exato e o rótulo some.
    const cabecalho = precoDoCabecalho({ subtotal: subtotalLocal(aberto), qtd: aberto.qtd, precoCard: aberto.precoCard, pronto })
    // Linha sem o preço do card (bootstrap antigo, ou uma linha do carrinho que nasceu antes
    // deste campo): o "de/por" ainda sai do item base, exatamente como antes.
    const promoDaBase = aberto.item?.precoPromocional
    const temPromoBase = promoDaBase !== null && promoDaBase !== undefined
    const descontoDaBase = temPromoBase ? (Number(aberto.item?.preco ?? 0) - Number(promoDaBase)) * Math.max(1, Number(aberto.qtd) || 1) : 0
    const precoCabecalho = cabecalho.valorPromocional !== undefined
      ? { valor: cabecalho.valor, valorPromocional: cabecalho.valorPromocional }
      : (temPromoBase && !aberto.precoCard
        ? { valor: Math.round((cabecalho.valor + descontoDaBase) * 100) / 100, valorPromocional: cabecalho.valor }
        : { valor: cabecalho.valor })
    // Só os grupos que a tela desenha — a MESMA lista que decide o avanço automático.
    const gruposVisiveis = gruposVisiveisDe(aberto)
    const pendentes = obrigatoriosPendentes(gruposVisiveis, aberto.selecoes)
    conteudo = (
      <>
        <Cabecalho
          key="cab-item"
          loja={loja}
          titulo={nomeNaTela}
          aoVoltar={() => { setAberto(null); setTela(carrinho.length ? 'carrinho' : 'catalogo') }}
          aoCancelar={() => reiniciar()}
        />
        {banner}
        <TelaItem
          nome={nomeNaTela}
          descricao={descricaoApresentada(aberto)}
          imagem={imagemApresentada(aberto)}
          grupos={gruposVisiveis}
          selecoes={aberto.selecoes}
          pendentes={pendentes}
          temObrigatorio={gruposVisiveis.some((g) => (!g.status || g.status === 'ACTIVE') && Number(g.min) > 0)}
          preco={{ ...precoCabecalho, aPartirDe: cabecalho.aPartirDe }}
          pronto={pronto}
          podePedir={podePedir}
          qtd={aberto.qtd}
          observacao={aberto.observacao}
          foco={aberto.foco}
          ehEdicao={!!aberto.uid}
          aoTocarOpcao={tocarOpcao}
          aoMenosOpcao={menosOpcao}
          aoMudarQtd={(d) => setAberto((a) => ({ ...a, qtd: Math.max(1, a.qtd + d) }))}
          aoMudarObservacao={(txt) => setAberto((a) => ({ ...a, observacao: txt }))}
          aoAdicionar={adicionarAoCarrinho}
        />
      </>
    )
  }

  if (tela === 'carrinho') {
    conteudo = (
      <>
        <Cabecalho key="cab-carrinho" loja={loja} titulo="Seu pedido" aoVoltar={() => setTela('catalogo')} aoCancelar={() => reiniciar()} />
        {banner}
        <TelaCarrinho
          linhas={carrinho}
          total={totalLocal}
          aoEditar={editarLinha}
          aoRemover={removerLinha}
          aoMudarQtd={mudarQtdLinha}
          fechada={canal.fechada}
          aoContinuar={irParaPagamento}
          aoAdicionarMais={() => setTela('catalogo')}
        />
      </>
    )
  }

  if (tela === 'pagamento') {
    conteudo = (
      <>
        <Cabecalho key="cab-pagamento" loja={loja} titulo="Como você vai pagar?" aoVoltar={() => setTela('carrinho')} aoCancelar={() => reiniciar()} />
        {banner}
        <TelaPagamento
          metodos={metodos}
          metodoId={metodoId}
          nomeDoMetodo={nomeMetodo}
          total={totalLocal}
          aoEscolher={escolherMetodo}
          aoRevisar={revisar}
        />
      </>
    )
  }

  if (tela === 'revisar') {
    conteudo = (
      <>
        {/* Travada (confirmação em dúvida): sem Voltar e sem Cancelar. Os dois levariam
            a uma nova cotação, nova cotação gera chave nova, e chave nova cria um
            SEGUNDO pedido. */}
        <Cabecalho
          key="cab-revisar"
          loja={loja}
          titulo="Confira seu pedido"
          aoVoltar={(enviando || travado) ? undefined : () => setTela('carrinho')}
          aoCancelar={(enviando || travado) ? undefined : () => reiniciar()}
        />
        {banner}
        <TelaRevisar
          cotando={cotando}
          erroCotar={erroCotar}
          linhas={Array.isArray(cotacao?.linhas) ? cotacao.linhas : []}
          carrinho={carrinho}
          avisoPrecos={avisoPrecos}
          erroEnvio={erroEnvio}
          travado={travado}
          enviando={enviando}
          modo={MODOS[orderType]?.titulo}
          metodo={metodoEscolhido ? nomeMetodo(metodoEscolhido) : null}
          total={cotacao?.total}
          podeConfirmar={!!cotacao?.cotacao}
          nomeDoDetalhe={nomeDoDetalhe}
          mensagem={mensagemErro}
          aoVoltarCarrinho={() => setTela('carrinho')}
          aoTrocarPagamento={() => setTela('pagamento')}
          aoRecotar={revisar}
          aoConfirmar={confirmar}
        />
      </>
    )
  }

  if (tela === 'erro') {
    // O `detalhes` do 422 diz QUAL linha o servidor recusou. Repetir só a frase geral deixaria
    // o cliente adivinhando qual item tirar do carrinho.
    const detalhes = Array.isArray(erroEnvio?.detalhes) ? erroEnvio.detalhes : []
    conteudo = (
      <TelaAviso
        icone="alerta"
        titulo="Não foi possível registrar o pedido"
        texto={mensagemErro(erroEnvio?.codigo)}
        lista={detalhes.length > 0 ? (
          <ul className="tq-erro-lista">
            {detalhes.map((d, i) => {
              const nome = nomeDoDetalhe(d)
              // Idem: a frase do servidor (inclusive a de `validarCorpoPedido`, que já vem
              // pronta por campo) ganha da frase genérica do código.
              return <li key={`${d.codigo ?? d.campo ?? 'd'}-${i}`}>{nome ? <strong>{nome}: </strong> : null}{d.mensagem ?? mensagemErro(d.codigo)}</li>
            })}
          </ul>
        ) : null}
        acoes={
          <>
            <button type="button" className="tq-btn tq-btn-claro" onClick={() => { setErroEnvio(null); setTela('carrinho') }}>Voltar</button>
            <button type="button" className="tq-btn tq-btn-primario" onClick={() => reiniciar(true)}>Começar de novo</button>
          </>
        }
      />
    )
  }

  if (tela === 'resultado' && resultado) {
    conteudo = (
      <TelaResultado resultado={resultado} liberouNovo={liberouNovo} aoNovoPedido={() => reiniciar(true)} />
    )
  }

  return (
    <Casca>
      {conteudo}
      {alertaInatividade !== null && tela !== 'inicio' && tela !== 'resultado' && !enviando && !travado ? (
        <SheetInatividade segundos={Math.max(0, alertaInatividade)} aoContinuar={() => setAlertaInatividade(null)} />
      ) : null}
      {aviso && (
        <div className={'tq-toast' + (aviso.tom === 'erro' ? ' erro' : '')} role="status" aria-live="polite">
          <span className="tq-toast-ico" aria-hidden="true">
            <Ico nome={aviso.tom === 'erro' ? 'alerta' : 'check'} tam={18} traco={2.6} />
          </span>
          {aviso.texto}
        </div>
      )}
    </Casca>
  )
}
