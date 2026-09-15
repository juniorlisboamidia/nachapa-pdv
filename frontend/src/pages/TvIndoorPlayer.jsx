// TV INDOOR — o player. Montado por `/dispositivo` quando o aparelho pareado é do tipo
// TV_INDOOR (a mesma porta do totem: quem decide o que a tela vira é o COOKIE, não a URL).
//
// ── O QUE ESTA TELA É ─────────────────────────────────────────────────────────────────
// Uma parede. Ela fica ligada o dia inteiro, ninguém a toca, ninguém a olha de perto e
// ninguém vai reiniciar o navegador quando o gestor trocar uma arte no PDV. Tudo aqui sai
// dessa frase:
//
//   · fullscreen, fundo preto, nenhum controle, cursor escondido — nada de cara de admin;
//   · NENHUM erro aparece na tela. Rede caindo, playlist apagada, banco fora: a TV mostra o
//     institucional da loja. Um "não foi possível carregar" numa parede fica lá o dia todo;
//   · NÃO PISCA. A programação é relida a cada 60 s, e um refresh que devolve o mesmo não
//     reinicia o rodízio (`assinatura`). Sem isso, a primeira imagem voltaria a cada minuto;
//   · imagem que falha é PULADA; todas falharem cai no institucional;
//   · a GRADE SEMANAL é do SERVIDOR. A TV não sabe que dia é nem que horas são na loja —
//     ela recebe "esta é a programação agora" e "reconsulte neste instante". O delay sai de
//     `proximaTrocaEm - agoraServidor`, os dois do mesmo relógio, então uma TV com a hora
//     errada troca na hora certa do mesmo jeito;
//   · TROCA DE GRADE NÃO CORTA VÍDEO. Se a playlist efetiva mudar com um filme no ar, a
//     programação nova fica PENDENTE e entra no `ended` — a mesma regra do vídeo cuja
//     janela termina enquanto ele toca;
//   · a programação alterna ARTE, MENU BOARD e VÍDEO no mesmo motor. Não há um segundo
//     player: o que muda é o que se desenha e QUEM DÁ A HORA. Arte e board correm por um
//     `setTimeout` com a duração daquele item; o vídeo corre pelo próprio `ended`, porque
//     duração de vídeo não é escolha do gestor — é o arquivo. Um cronômetro por cima disso
//     cortaria o filme no meio ou deixaria o último quadro parado na parede.
//
// ── O QUE ELA NÃO É ───────────────────────────────────────────────────────────────────
// Não há toque, não há sessão, não há pedido. O V1 é promocional/institucional — a TV não
// compra nada, e o cookie dela nem alcança as rotas do totem (`exigirTotem` recusa).
//
// ── ESCALA DA IMAGEM ──────────────────────────────────────────────────────────────────
// `object-fit: cover`, com o mesmo recorte na prévia do admin. O formato recomendado é
// 16:9 (1920 × 1080), e numa arte 16:9 numa TV 16:9 o `cover` não corta NADA. Ele só age
// quando a arte veio noutra proporção — e aí a escolha é entre cortar a borda ou deixar
// tarja preta numa tela ligada o dia inteiro. Tarja preta lê como defeito.
import { useCallback, useEffect, useRef, useState } from 'react'
import { aparelhoApi } from '../services/api'
import { assinatura, chaveDoItem, desvioDoRelogio, duracaoMs, ehMenuBoard, ehVideo, paraExibir, proximaParaPrecarregar, proximoIndice } from '../components/tvProgramacao'
import MenuBoard from '../components/tv/MenuBoard'
import VideoItem from '../components/tv/VideoItem'
import { aplicar as aplicarTemaTv } from '../components/tvIndoorTema'
import '../styles/tv.css'

// A programação se refaz a cada minuto: é o que faz uma troca no PDV aparecer na parede
// sem ninguém ir até lá. Mais curto que isso seria bater no servidor à toa; mais longo
// faria o gestor achar que o sistema não pegou a alteração.
const MS_PROGRAMACAO = 60_000
// O mesmo heartbeat do totem, na mesma rota: 60 s é o que alimenta o "online" (< 150 s) da
// gestão. Duplicar essa infraestrutura por canal seria criar um segundo lugar para ela
// divergir.
const MS_HEARTBEAT = 60_000
// Quanto a parede espera antes de PERDOAR as falhas e tentar tudo de novo.
//
// Sem isto, uma falha é sentença perpétua: `falhados` só é limpo quando a programação MUDA,
// e numa playlist estável ela nunca muda. Um soluço de rede de 12 s tirava o único vídeo do
// ar e a TV ficava no institucional até alguém recarregar o navegador da loja.
//
// 30 s é o equilíbrio: curto para o cliente na fila não achar que a tela morreu, longo o
// bastante para não virar um laço apertado de tentativa e erro quando a mídia está mesmo
// quebrada — nesse caso o ciclo é institucional, tentativa, institucional, sem custo.
const MS_REANIMAR = 30_000
// A folga ao pedir a programação na virada da grade. Pedir no instante EXATO chegaria ao
// servidor alguns milissegundos antes por causa da latência, e ele responderia a grade
// antiga — a TV só trocaria no polling seguinte, um minuto depois.
const MS_FOLGA_TROCA = 1_500
// Teto de um `setTimeout`. Uma grade com uma regra só, daqui a cinco dias, pediria uma
// espera enorme; em vez disso a TV reconsulta em algumas horas e reagenda com o relógio do
// servidor na mão. Também evita o estouro de 32 bits do `setTimeout`.
const MS_MAX_ESPERA = 6 * 60 * 60_000
const VERSAO = 'tv-v1'

export default function TvIndoorPlayer({ aparelho, loja }) {
  // A programação CRUA como veio do servidor. Quem decide o que está no ar é o efeito
  // abaixo, com o relógio corrigido — não esta resposta.
  const [programacao, setProgramacao] = useState(null)
  const [indice, setIndice] = useState(0)
  const [falhados, setFalhados] = useState(() => new Set())
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  // A APARÊNCIA vive em estado PRÓPRIO, e não dentro de `programacao`. A razão é o último
  // estado bom: um refresh que falha, ou que volta sem o bloco (servidor de versão
  // anterior), não pode trocar um tema válido que já está na tela pelos defaults. Só uma
  // resposta VÁLIDA substitui a aparência.
  const [aparencia, setAparencia] = useState(null)
  /* A programação que CHEGOU mas ainda não entrou, porque há um vídeo tocando.

     É ESTADO, e não uma ref, porque ela muda o que se desenha: um vídeo único normalmente
     repete pelo atributo `loop`, e aí o `ended` nunca dispara. Com uma troca esperando, ele
     precisa deixar de repetir — senão a grade nova ficaria presa até o fim do expediente.
     Uma ref não provocaria esse render, e o bug seria invisível até alguém reclamar que a
     TV "não mudou às 18h". */
  const [pendente, setPendente] = useState(null)
  // Guarda o desvio entre refreshes: a agenda continua correta mesmo se um refresh falhar.
  const desvioRef = useRef(0)
  const raizRef = useRef(null)
  /* `programacaoRef`/`videoNoArRef`: a decisão de adiar uma troca acontece dentro do
     `.then` de uma promessa, que não enxerga o render atual. Refs são lidas e escritas
     FORA do render — no `.then` e em efeitos —, nunca durante ele. */
  const programacaoRef = useRef(null)
  const videoNoArRef = useRef(false)

  // ── A programação, e o refresh que não interrompe nada ────────────────────
  const buscar = useCallback(() => {
    aparelhoApi.get('/public/aparelho/tv/programacao')
      .then((r) => {
        const nova = r.data ?? null
        // Só troca o tema quando vem um bloco de verdade. Sem isto, um servidor de versão
        // anterior (ou uma resposta degradada) apagaria a identidade da loja da parede.
        if (nova?.aparencia?.tokens) setAparencia(nova.aparencia)
        desvioRef.current = desvioDoRelogio(nova?.agoraServidor, Date.now())

        /* TROCA DE GRADE COM VÍDEO NO AR. A playlist efetiva mudou enquanto um filme toca:
           a programação nova espera o `ended` em vez de cortar no meio. É a mesma regra do
           vídeo cuja janela de agenda termina durante a reprodução — e ela vale aqui pelo
           mesmo motivo: cortar um vídeo pela metade lê como defeito na parede.

           Arte e menu board NÃO esperam: eles trocam na hora, e é o que se quer.

           Se a playlist efetiva for a MESMA, aplica-se direto. A assinatura cuida do resto:
           conteúdo idêntico não reinicia o rodízio, e conteúdo que o gestor editou de
           verdade deve mesmo recomeçar. */
        const idDe = (prog) => prog?.programacaoTela?.playlistEfetivaId ?? prog?.playlist?.id ?? null
        const idNovo = idDe(nova)
        const idAtual = idDe(programacaoRef.current)
        if (videoNoArRef.current && idAtual !== null && idNovo !== idAtual) {
          setPendente(nova)
          return
        }
        setPendente(null)
        setProgramacao(nova)
      })
      // Rede fora não apaga o que já está tocando: a TV segue com a última programação boa
      // e tenta de novo no minuto seguinte. Sem nenhuma programação, cai no institucional.
      .catch(() => {})
  }, [])

  useEffect(() => {
    buscar()
    const t = setInterval(buscar, MS_PROGRAMACAO)
    // TV que volta do modo de espera (ou aba que reaparece) repesca na hora, em vez de
    // esperar até um minuto mostrando programação velha.
    const aoVisivel = () => { if (document.visibilityState === 'visible') buscar() }
    document.addEventListener('visibilitychange', aoVisivel)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVisivel) }
  }, [buscar])

  /* Os espelhos que o `.then` da busca precisa ler. Efeito sem array de dependências: roda
     depois de todo render, e escrever em ref durante o render é render impuro (o React
     Compiler está ligado neste projeto). */
  useEffect(() => { programacaoRef.current = programacao })

  /* ── A TROCA NA VIRADA, sem depender do relógio da TV ──────────────────────
     O servidor manda `agoraServidor` e `proximaTrocaEm`. A espera é a DIFERENÇA entre os
     dois — ambos do mesmo relógio —, então uma TV com a hora errada, ou num fuso qualquer,
     reconsulta no instante certo do mesmo jeito. É por isso que a conta não é
     `proximaTrocaEm - Date.now()`.

     Quem decide qual regra venceu continua sendo o servidor: a TV só sabe QUANDO perguntar
     de novo. O polling de 60 s permanece como rede de segurança — se este temporizador
     falhar, a troca acontece com até um minuto de atraso em vez de não acontecer. */
  const proximaTrocaEm = programacao?.programacaoTela?.proximaTrocaEm ?? null
  const agoraServidor = programacao?.agoraServidor ?? null
  useEffect(() => {
    if (!proximaTrocaEm || !agoraServidor) return undefined
    const alvo = Date.parse(proximaTrocaEm)
    const base = Date.parse(agoraServidor)
    if (!Number.isFinite(alvo) || !Number.isFinite(base)) return undefined
    const espera = Math.min(Math.max(alvo - base + MS_FOLGA_TROCA, 1000), MS_MAX_ESPERA)
    const t = setTimeout(buscar, espera)
    return () => clearTimeout(t)
  }, [proximaTrocaEm, agoraServidor, buscar])

  // A paleta na casca do player: pinta o institucional e o chão atrás de tudo. Escrita por
  // CSSOM, propriedade conhecida a propriedade conhecida — a mesma disciplina do board.
  //
  // SEM array de dependências, e isso é deliberado: a raiz é um nó DIFERENTE em cada um dos
  // três desfechos (institucional, board, arte), e com `[aparencia]` o efeito não rodaria ao
  // trocar de desfecho — a tela nova nasceria sem tema até a próxima mudança de cor. Rodar a
  // cada render custa sete `setProperty` idempotentes, que é barato perto de uma parede
  // piscando para o padrão a cada troca de item.
  useEffect(() => { aplicarTemaTv(raizRef.current, aparencia?.tokens) })

  // ── Heartbeat: a MESMA rota do totem ──────────────────────────────────────
  // `tela` é o que a gestão mostra como resolução reportada — é como o gestor confere, do
  // escritório, que o painel da loja é mesmo 1920 × 1080.
  useEffect(() => {
    const bater = () => {
      aparelhoApi.post('/public/aparelho/heartbeat', {
        versao: VERSAO,
        tela: { w: window.innerWidth, h: window.innerHeight },
      }).catch(() => { /* sinal de vida não é crítico: quem falhou já aparece offline */ })
    }
    bater()
    const t = setInterval(bater, MS_HEARTBEAT)
    const aoVisivel = () => { if (document.visibilityState === 'visible') bater() }
    document.addEventListener('visibilitychange', aoVisivel)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVisivel) }
  }, [])

  // ── O relógio da agenda ───────────────────────────────────────────────────
  // Só existe enquanto houver conteúdo COM janela: sem agenda não há o que reavaliar, e um
  // intervalo eterno numa tela que fica ligada o dia inteiro é trabalho à toa.
  //
  // O desvio é aplicado AQUI DENTRO, e não em render: `Date.now()` durante o render é
  // chamada impura, e ler uma ref em render também é proibido.
  const itens = programacao?.itens
  const temAgenda = (itens ?? []).some((c) => c?.inicioEm || c?.fimEm)
  useEffect(() => {
    if (!temAgenda) return undefined
    const iv = setInterval(() => setAgoraMs(Date.now() + desvioRef.current), 1000)
    return () => clearInterval(iv)
  }, [temAgenda])

  // Sem `useMemo` à mão: o React Compiler está ligado neste projeto e já dá identidade
  // estável a este array. Escrever o `useMemo` mesmo assim faz o compilador DESISTIR do
  // arquivo inteiro — e é justamente aqui que a estabilidade importa, porque o
  // temporizador de rotação depende dela para não reiniciar a cada render.
  const lista = paraExibir({ itens, agoraMs, falhados })
  const total = lista.length

  // ── O que impede a TV de piscar (e o que devolve a chance a quem falhou) ──
  // A assinatura é da programação CRUA (o que o servidor mandou), não da lista já
  // filtrada. São duas coisas diferentes, e a distinção resolve dois problemas de uma vez:
  //
  //  · NÃO PISCAR. Refresh que devolve a mesma programação tem a mesma assinatura, e o
  //    rodízio continua de onde estava. Com a lista filtrada dava no mesmo — até aqui.
  //
  //  · NOVA CHANCE PARA QUEM FALHOU. Esta tela não remonta NUNCA: ela fica ligada por
  //    semanas. Com a assinatura da lista filtrada, um id que entrou em `falhados` ficava
  //    lá para sempre — a loja corrigia a arte, a versão subia, a URL mudava, e aquele
  //    conteúdo continuava fora até alguém reiniciar o navegador da TV. Com a assinatura
  //    CRUA, trocar a arte (ou a programação) muda a chave e limpa a lista de falhados.
  //
  //  · E não há laço: marcar uma falha muda a lista filtrada, mas NÃO muda a crua — então
  //    o efeito não dispara de novo e o item não volta imediatamente para falhar outra vez.
  const chave = assinatura(itens)
  /* eslint-disable react-hooks/set-state-in-effect -- o reset É o efeito que esta
     sincronização existe para produzir: a programação mudou, então o rodízio recomeça e as
     falhas antigas são perdoadas. Não há caminho sem estado aqui. */
  useEffect(() => {
    setIndice(0)
    setFalhados((s) => (s.size ? new Set() : s))
  }, [chave])
  /* eslint-enable react-hooks/set-state-in-effect */

  const atual = lista[Math.min(indice, Math.max(0, total - 1))] ?? null

  const avancar = useCallback(() => setIndice((i) => proximoIndice(i, total)), [total])

  // A rotação: um `setTimeout` por vez, com a duração DAQUELE conteúdo. Não um intervalo
  // fixo, senão a duração por item não significaria nada. Com um conteúdo só não há
  // temporizador nenhum — a imagem fica parada, como deve.
  //
  // VÍDEO fica FORA deste relógio. Quem avança é o `ended` do elemento (ou o watchdog, se
  // travar). Deixar o `setTimeout` correr junto seria um segundo dono do mesmo item: o que
  // chegasse primeiro venceria, e um vídeo de 40 s morreria nos 10 s do padrão.
  useEffect(() => {
    if (total < 2 || !atual || ehVideo(atual)) return undefined
    const t = setTimeout(avancar, duracaoMs(atual))
    return () => clearTimeout(t)
  }, [atual, total, avancar])

  /* O espelho que o `.then` da busca lê para decidir se ADIA uma troca de grade. Num efeito
     (depois do commit), e não no corpo do componente: escrever numa ref durante o render é
     render impuro, e o React Compiler está ligado neste projeto. */
  useEffect(() => { videoNoArRef.current = ehVideo(atual) })

  // Pré-carrega SÓ a próxima: o que importa é que a troca não mostre um quadro vazio, e TV
  // de loja não tem memória para a lista inteira.
  // Pré-carrega o PRÓXIMO item: uma arte, ou as fotos dos produtos do próximo menu board —
  // sem isso, a troca mostraria oito retângulos vazios enchendo um a um na frente do cliente.
  const proximas = proximaParaPrecarregar(lista, indice)
  const chaveProximas = proximas.join('|')
  useEffect(() => {
    for (const url of chaveProximas ? chaveProximas.split('|') : []) {
      const img = new Image()
      img.src = url
    }
  }, [chaveProximas])

  // A chave é por TIPO (`i:3` / `b:3`): o id 3 de uma arte e o id 3 de um board são coisas
  // diferentes, e uma imagem quebrada não pode tirar um menu board do ar.
  const marcarFalha = (item) => setFalhados((s) => {
    const k = chaveDoItem(item)
    return s.has(k) ? s : new Set(s).add(k)
  })

  /* ── A parede se reanima ───────────────────────────────────────────────────
     TUDO falhou, mas a programação NÃO está vazia. São duas situações diferentes e a
     distinção é o ponto: playlist vazia é repouso (institucional, e está certo); playlist
     cheia com tudo marcado como falho é DEFEITO, e defeito na TV de uma loja se resolve
     tentando de novo, não desistindo.

     Antes disto, `falhados` só era esquecido quando a assinatura da programação mudava.
     Numa playlist estável ela nunca muda — então a primeira falha era definitiva até
     alguém ir até a loja recarregar o navegador. Com um vídeo único, qualquer soluço
     apagava a parede para sempre.

     O laço não aperta: se a mídia estiver mesmo quebrada, o ciclo é institucional por 30 s,
     uma tentativa, institucional de novo. Nada pisca, nada acumula. */
  /* A programação que estava esperando o vídeo terminar entra AGORA.

     Devolve se aplicou, porque quem chama precisa saber: no `ended`, aplicar a pendente
     substitui o avanço (a playlist nova começa do primeiro item, não do segundo da velha). */
  const aplicarPendente = () => {
    if (!pendente) return false
    setPendente(null)
    setProgramacao(pendente)
    return true
  }

  const tudoFalhou = total === 0 && (itens?.length ?? 0) > 0
  useEffect(() => {
    if (!tudoFalhou) return undefined
    const t = setTimeout(() => setFalhados((s) => (s.size ? new Set() : s)), MS_REANIMAR)
    return () => clearTimeout(t)
  }, [tudoFalhou])

  // Movimento decorativo respeita a preferência do sistema; a TROCA em si não é
  // decoração — é o conteúdo — e continua acontecendo.
  const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  if (!atual) return <Institucional loja={loja} aparelho={aparelho} aparencia={aparencia} raizRef={raizRef} />

  // MENU BOARD: a mesma casca, o mesmo temporizador, outro desenho. O board chega RESOLVIDO
  // do servidor (preço, promoção e selo prontos) — a TV não conhece regra do Cardápio Web.
  //
  // A `key` é só o id, e NÃO inclui os produtos: quando o preço muda no CW, o board tem de
  // se redesenhar NO LUGAR, sem remontar. Remontar reiniciaria a animação de entrada e
  // piscaria a tela a cada refresh de preço — exatamente o que não se quer numa parede.
  if (ehMenuBoard(atual)) {
    return (
      <div className="tv-raiz" ref={raizRef}>
        <div key={`b${atual.id}`} className={'tv-board' + (reduzido ? '' : ' entrando')}>
          <MenuBoard board={atual} tokens={aparencia?.tokens} />
        </div>
      </div>
    )
  }

  // VÍDEO: mesma casca, mesmo fundo, sem cronômetro. O `<video>` avisa quando acabou, e um
  // vídeo que não consegue tocar é marcado como falho — marcar já o TIRA da lista filtrada,
  // e o item seguinte ocupa este mesmo índice. Não há um "avançar" separado a chamar aqui.
  if (ehVideo(atual)) {
    return (
      <div className="tv-raiz" ref={raizRef}>
        <VideoItem
          item={atual}
          // Com um item só, quem repete é o `loop` do elemento: um `ended` que avançasse
          // para o mesmo índice remontaria o elemento e daria um piscar preto a cada volta.
          // Mas se há programação PENDENTE, ele deixa de ser único — tem para onde ir.
          unico={total < 2 && !pendente}
          // O filme acabou: se a grade mudou enquanto ele tocava, a playlist nova entra
          // aqui — e não o próximo item da playlist velha, que já não é a programação.
          aoTerminar={() => { if (!aplicarPendente()) avancar() }}
          // Falhou (erro ou travamento): a programação pendente também entra. Um vídeo
          // quebrado não pode segurar a grade nova até o fim do expediente.
          aoFalhar={() => { marcarFalha(atual); aplicarPendente() }}
        />
      </div>
    )
  }

  return (
    // A ARTE do gestor NÃO é tocada pela aparência: uma imagem 1920 × 1080 é exibida como
    // foi criada. O que a paleta pinta é o chão atrás dela — e `object-fit: cover` faz a
    // arte cobrir a tela inteira, então nem isso aparece. Nenhum véu, nenhum overlay.
    <div className="tv-raiz" ref={raizRef}>
      {/* `key` por conteúdo: trocar o `src` do MESMO elemento deixaria a imagem anterior
          visível até a nova decodificar — um flash de arte velha a cada troca. Com key,
          cada peça é um elemento próprio. */}
      <img
        key={`i${atual.id}:${atual.imagemVersao}`}
        className={'tv-arte' + (reduzido ? '' : ' entrando')}
        src={atual.imagemUrl}
        alt=""
        onError={() => marcarFalha(atual)}
      />
    </div>
  )
}

// ── O institucional ─────────────────────────────────────────────────────────
// O que a TV mostra com zero conteúdos elegíveis: playlist vazia, nenhuma associada, tudo
// agendado para amanhã, ou todas as imagens falhando. NÃO é uma tela de erro — é o estado
// de repouso do canal, e por isso não há nenhuma palavra sobre configuração aqui: quem
// está na frente dela é o cliente da loja, não o gestor.
//
// ── A LOGO, E POR QUE A ORIGEM IMPORTA ────────────────────────────────────────────────
// Precedência: logo PRÓPRIA do TV Indoor → logo neutra da EMPRESA → a inicial do nome num
// disco. Nunca a logo do totem: os canais são irmãos, e uma loja pode querer no vidro do
// quiosque uma arte que não serve para a parede.
//
// A própria é feita para a televisão e pode ter transparência: vai direto sobre o fundo,
// sem placa. A da empresa costuma vir de material impresso, com fundo branco embutido —
// sobre um fundo escuro o retângulo branco aparece como um erro, então ela ganha uma placa
// clara discreta. A decisão é da ORIGEM (que o servidor manda), não do arquivo.
function Institucional({ loja, aparelho, aparencia, raizRef }) {
  const nome = (loja?.nome ?? '').trim()
  const inicial = (nome || aparelho?.nome || '?').trim().charAt(0).toUpperCase()
  const propria = aparencia?.temLogoPersonalizada && aparencia?.logoUrl
  const daEmpresa = !propria && loja?.logoDataUrl
  return (
    <div className="tv-raiz tv-institucional" ref={raizRef}>
      {propria ? <img className="tv-logo" src={aparencia.logoUrl} alt="" /> : null}
      {daEmpresa ? <img className="tv-logo tv-logo-placa" src={loja.logoDataUrl} alt="" /> : null}
      {!propria && !daEmpresa ? <div className="tv-inicial" aria-hidden="true">{inicial}</div> : null}
      {nome ? <div className="tv-nome">{nome}</div> : null}
    </div>
  )
}
