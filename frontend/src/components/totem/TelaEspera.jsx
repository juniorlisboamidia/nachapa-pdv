import { useEffect, useMemo, useRef, useState } from 'react'
import { Ico } from './icones'
import LogoDaLoja from './LogoDaLoja'
import {
  desvioDoRelogio, paraExibir, duracaoMs, proximoIndice, assinatura, proximaParaPrecarregar,
} from '../totemBanners'

// Tela de ESPERA — o repouso do totem, e a única tela sem sessão.
//
// É ela que fica horas no vidro chamando quem passa. Tem dois rostos:
//
//   COM banner elegível  → a arte da loja ocupa a tela, com a chamada por cima.
//   SEM banner           → a composição institucional (logo + nome + chamada).
//
// O institucional NÃO é o caso degradado. É o padrão, e continua sendo o que aparece
// quando a loja não cadastrou arte, quando a agenda de todas passou, e quando as imagens
// falham. A espera nunca fica preta.
//
// A tela inteira é o alvo de toque, com ou sem banner. Quem passa na frente não vai mirar:
// encosta a mão em qualquer lugar. Continua sendo um `<button>` de verdade — o elemento
// certo para "isto responde ao toque", e o único que funciona com teclado e leitor de tela
// sem gambiarra de `role`.
//
// ── O BANNER NÃO TEM CTA ──────────────────────────────────────────────────────────────
// Tocar na arte faz exatamente o que tocar em qualquer outro lugar já fazia: começa uma
// sessão. Nada de pular para um produto ou uma categoria — isso é outro produto, e o V1
// não o tem. `aoTocar` é a MESMA função de sempre; não há segundo caminho de sessão.
//
// ── OS TIMERS DAQUI NÃO SÃO DE SESSÃO ─────────────────────────────────────────────────
// O carrossel gira imagem numa tela onde, por definição, não existe sessão. Ociosidade,
// MS_AMBIGUO e o relógio capturado são outro domínio e não se encostam. Este componente só
// existe enquanto `tela === 'espera'`: sair desmonta e limpa tudo, voltar remonta.
export default function TelaEspera({ loja, banners, aoTocar }) {
  const logo = loja?.logo || loja?.logoDataUrl || null
  const inicial = String(loja?.nome ?? '').trim().charAt(0).toUpperCase() || '•'

  // Arte que não abriu fica de fora até o componente ser remontado. Não é estado de fluxo:
  // é "esta imagem quebrou", da mesma natureza do que o componente Foto já guarda.
  const [falhados, setFalhados] = useState(() => new Set())
  const [indice, setIndice] = useState(0)
  // O tempo CORRIGIDO pelo desvio do servidor. Um segundo de granularidade basta para uma
  // agenda, e é o que faz um banner marcado para as 18:00 entrar às 18:00 sem depender do
  // próximo bootstrap.
  const [agoraMs, setAgoraMs] = useState(() => Date.now())

  const lista = useMemo(
    () => paraExibir({ itens: banners?.itens, agoraMs, falhados }),
    [banners?.itens, agoraMs, falhados],
  )

  // A ASSINATURA é o que impede a arte de piscar a cada 5 minutos. O bootstrap se refaz
  // sozinho; se o índice zerasse a cada resposta igual, o cliente veria a primeira imagem
  // voltar sem parar. Só uma mudança real — banner novo, arte nova, duração nova —
  // reinicia o carrossel.
  const chave = assinatura(lista)
  const chaveRef = useRef(chave)
  useEffect(() => {
    if (chaveRef.current === chave) return
    chaveRef.current = chave
    setIndice(0)
  }, [chave])

  // O relógio da agenda. Só existe enquanto houver banner COM janela: sem agenda não há o
  // que reavaliar, e um intervalo eterno numa tela que fica horas ligada é trabalho à toa.
  //
  // O desvio é medido AQUI DENTRO, e não em render: `Date.now()` durante o render é chamada
  // impura, e ler uma ref em render também é proibido — as duas regras estão certas, dois
  // renders do mesmo estado não podem dar resultados diferentes. Quem escreve o tempo é o
  // temporizador, que é o único lugar onde ler o relógio é legítimo.
  //
  // Consequência aceita: com o tablet fora de hora, a primeira avaliação (a da montagem)
  // usa o relógio local e a correção entra um segundo depois. Numa tela que fica horas
  // parada, um segundo não muda nada.
  const temAgenda = (banners?.itens ?? []).some((b) => b?.inicioEm || b?.fimEm)
  useEffect(() => {
    if (!temAgenda) return undefined
    const desvio = desvioDoRelogio(banners?.agoraServidor, Date.now())
    const iv = setInterval(() => setAgoraMs(Date.now() + desvio), 1000)
    return () => clearInterval(iv)
  }, [temAgenda, banners?.agoraServidor])

  // A rotação. Um `setTimeout` por vez, com a duração DAQUELE banner — não um intervalo
  // fixo, senão a duração por banner não significaria nada.
  const total = lista.length
  const atual = lista[Math.min(indice, Math.max(0, total - 1))] ?? null
  useEffect(() => {
    if (total < 2 || !atual) return undefined
    const t = setTimeout(() => setIndice((i) => proximoIndice(i, total)), duracaoMs(atual))
    return () => clearTimeout(t)
  }, [atual, total])

  // Pré-carrega SÓ a próxima: o que importa é que a troca não mostre um quadro vazio, e o
  // tablet não tem memória para a lista inteira.
  const proxima = proximaParaPrecarregar(lista, indice)
  useEffect(() => {
    if (!proxima) return
    const img = new Image()
    img.src = proxima
  }, [proxima])

  const marcarFalha = (id) => setFalhados((s) => (s.has(id) ? s : new Set(s).add(id)))
  const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  return (
    <button
      type="button"
      className={'tq-espera' + (atual ? ' com-banner' : ' tq-textura')}
      onClick={aoTocar}
      aria-label="Toque para começar o seu pedido"
    >
      {atual ? (
        <>
          {/* `key` por banner: trocar o src do MESMO elemento deixaria a imagem anterior
              visível até a nova decodificar. Com key, cada arte é um elemento próprio. */}
          <img
            key={atual.id}
            className={'tq-espera-arte' + (reduzido ? '' : ' entrando')}
            src={atual.imagemUrl}
            alt={atual.nome || ''}
            onError={() => marcarFalha(atual.id)}
          />
          {/* A chamada NÃO pode depender da arte que o lojista enviou: um degradê próprio
              garante que ela continue legível sobre uma foto branca, preta ou poluída. */}
          <div className="tq-espera-veu" aria-hidden="true" />
        </>
      ) : (
        <div className="tq-espera-marca">
          {logo
            ? <LogoDaLoja src={logo} propria={loja?.logoPropria} />
            : <div className="tq-espera-inicial tq-disp tq-disp-forte" aria-hidden="true">{inicial}</div>}
          {loja?.nome ? <div className="tq-espera-loja tq-rotulo">{loja.nome}</div> : null}
        </div>
      )}

      <div className="tq-espera-chamada">
        <Ico nome="mais" tam={40} traco={2.4} className="tq-espera-ico" />
        <span className="tq-disp tq-disp-forte">Toque para começar</span>
      </div>

      {/* Marcadores só com dois ou mais: com um banner eles seriam enfeite. */}
      {total > 1 && (
        <div className="tq-espera-pontos" aria-hidden="true">
          {lista.map((b, i) => <span key={b.id} className={i === indice ? 'ativo' : undefined} />)}
        </div>
      )}
    </button>
  )
}
