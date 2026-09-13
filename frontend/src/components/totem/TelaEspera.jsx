import { Ico } from './icones'
import LogoDaLoja from './LogoDaLoja'
import useCarrossel from './useCarrossel'

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

  // O rodízio é o mesmo da capa do catálogo e mora num lugar só: `useCarrossel`. Este
  // componente só decide o DESENHO — arte em tela cheia, véu e chamada.
  const { atual, total, indice, lista, marcarFalha } = useCarrossel({
    itens: banners?.itens, agoraServidor: banners?.agoraServidor, tipo: 'ESPERA',
  })

  const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  return (
    <button
      type="button"
      className={'tq-espera' + (atual ? ' com-banner' : '')}
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
        // A logo basta para identificar a loja. O nome escrito embaixo dela repetia a
        // mesma informação em dois formatos, e numa tela de abertura repetição lê como
        // insegurança — a marca já está ali.
        <div className="tq-espera-marca">
          {logo
            ? <LogoDaLoja src={logo} propria={loja?.logoPropria} />
            : <div className="tq-espera-inicial tq-disp tq-disp-forte" aria-hidden="true">{inicial}</div>}
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
