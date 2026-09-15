// O VÍDEO na parede — o elemento `<video>` do player, com as três defesas que uma TV exige.
//
// ── POR QUE ELE É UM COMPONENTE, E NÃO UMA TAG NO PLAYER ──────────────────────────────
// Porque tem ciclo de vida próprio: listeners, um watchdog e uma tentativa de `play()` que
// pode ser rejeitada. Enfiar isso no player misturaria três relógios (o da imagem, o do
// board e o do vídeo) no mesmo componente, e o vazamento de um `setInterval` numa tela que
// fica semanas ligada não perdoa.
//
// ── AS TRÊS DEFESAS ───────────────────────────────────────────────────────────────────
//
//  1. AUTOPLAY. `muted` + `playsInline` não são preferência: sem os dois o navegador
//     simplesmente NÃO começa, e uma TV de loja não tem quem clique. É por isso que o V1 é
//     mudo. Se o `play()` ainda assim for rejeitado, é falha daquela mídia — e não um
//     "toque para reproduzir" no meio da parede.
//
//  2. `ended`. É o ÚNICO sinal confiável de "acabou". Nada de `setTimeout` com a duração
//     informada: ela veio do navegador de quem enviou e pode estar errada — e um timer que
//     dispara antes do fim cortaria o vídeo, enquanto um que dispara depois deixaria a tela
//     parada no último quadro.
//
//  3. WATCHDOG DE STALL. `ended` sozinho não basta: um arquivo ruim ou uma rede que caiu
//     deixam a TV eternamente em buffering, sem erro nenhum. A regra de decisão mora em
//     `tvVigiaVideo.js` — módulo puro e testado, porque ela já errou uma vez em produção
//     (exigia tempo crescente e matava o vídeo em loop, que volta a zero ao dar a volta).
import { useEffect, useRef } from 'react'
import { MS_VIGIA, avaliar, inicio } from '../tvVigiaVideo'

export default function VideoItem({ item, unico, aoTerminar, aoFalhar }) {
  const ref = useRef(null)
  // O estado do vigia. Em ref, não em estado do React: ele não deve provocar render nenhum —
  // é um vigia, não uma fonte de tela.
  //
  // Nasce zerado e não com `Date.now()`: ler o relógio durante o render é chamada impura.
  // Quem carimba a hora é o efeito abaixo, no instante em que o vigia começa a contar.
  const progresso = useRef(inicio(0))
  // Os avisos ao player vivem numa REF, e ficam FORA das dependências do efeito abaixo.
  // O motivo é duro: se `aoTerminar`/`aoFalhar` entrassem nas deps, qualquer render do
  // player — e ele renderiza a cada segundo quando há agenda — remontaria o efeito, e o
  // vídeo recomeçaria do zero eternamente. A ref mantém sempre a versão mais nova das
  // funções sem que a identidade delas mande na reprodução.
  // A escrita é num efeito SEM array de dependências (roda depois de todo render), e não
  // no corpo do componente: escrever numa ref durante o render é render impuro, e o
  // React Compiler está ligado neste projeto.
  const avisos = useRef({ aoTerminar, aoFalhar })
  useEffect(() => { avisos.current = { aoTerminar, aoFalhar } })

  const url = item?.arquivoUrl
  const chave = `${item?.id}:${item?.arquivoVersao ?? 0}`

  useEffect(() => {
    const el = ref.current
    if (!el || !url) return undefined
    let vivo = true
    progresso.current = inicio(Date.now())

    const falhar = (motivo) => {
      if (!vivo) return
      vivo = false
      // `aoFalhar` marca esta VERSÃO como falhada e manda o player seguir. O vídeo volta a
      // ter chance quando o arquivo for substituído — a chave inclui a versão.
      avisos.current.aoFalhar?.(motivo)
    }

    const terminou = () => {
      if (!vivo) return
      // Com um vídeo só na playlist, o `loop` do elemento cuida da repetição e `ended` nem
      // dispara. Este caminho é o da playlist com mais de um item.
      vivo = false
      avisos.current.aoTerminar?.()
    }

    el.addEventListener('ended', terminou)
    el.addEventListener('error', () => falhar('erro'))
    // `stalled`/`waiting` sozinhos NÃO são falha: o navegador os dispara a cada rebuffer
    // normal. Quem decide é o watchdog, olhando se o tempo anda.

    const vigia = setInterval(() => {
      if (!vivo || !el) return
      // A decisão inteira está no módulo puro: aqui só se colhe a amostra. Pausado de
      // propósito não existe nesta tela (não há controles), então tempo CONSTANTE é
      // travamento — e tempo que volta a zero é o loop, que é vida.
      const r = avaliar(progresso.current, { t: el.currentTime, agora: Date.now(), ended: el.ended })
      progresso.current = r.estado
      if (r.travado) falhar('travado')
    }, MS_VIGIA)

    // O `autoPlay` do atributo cobre o caso normal; esta chamada cobre o navegador que só
    // inicia por script. A rejeição é tratada como falha da mídia — nunca como um convite
    // para o cliente tocar na tela.
    const tentativa = el.play?.()
    if (tentativa && typeof tentativa.catch === 'function') {
      tentativa.catch(() => falhar('autoplay'))
    }

    return () => {
      vivo = false
      clearInterval(vigia)
      el.removeEventListener('ended', terminou)
      // Parar e soltar a fonte: sem isto, o navegador continua baixando o vídeo que saiu da
      // tela, e numa playlist de cinco itens isso é a banda da loja inteira.
      try {
        el.pause()
        el.removeAttribute('src')
        el.load()
      } catch { /* o elemento já foi desmontado */ }
    }
    // `chave` no lugar de `item`: um refresh que devolve o MESMO vídeo não pode reiniciar a
    // reprodução do zero. Só id ou versão diferentes remontam o efeito.
  }, [chave, url])

  if (!url) return null
  return (
    <video
      // `key` pela chave: trocar o `src` do mesmo elemento deixa o quadro anterior na tela
      // até o novo decodificar.
      key={chave}
      ref={ref}
      className="tv-video"
      src={url}
      // Mudo não é escolha de produto, é o que torna o autoplay possível.
      muted
      autoPlay
      playsInline
      controls={false}
      // Um vídeo sozinho na playlist repete; com mais itens, quem avança é o `ended`.
      loop={!!unico}
      // `metadata`, nunca `auto`: o `auto` faria o navegador engolir o arquivo inteiro assim
      // que o elemento nasce, e a TV tem uma banda só.
      preload="metadata"
      // Sem pôster: o fundo da casca já é a cor da marca, e um pôster seria mais um
      // arquivo para baixar antes do primeiro quadro.
      disablePictureInPicture
    />
  )
}
