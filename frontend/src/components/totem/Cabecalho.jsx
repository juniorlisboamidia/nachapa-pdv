import { useEffect, useRef, useState } from 'react'
import { Ico } from './icones'
import LogoDaLoja from './LogoDaLoja'

// Cabeçalho compacto do quiosque: 96px de altura, três zonas fixas.
//
//   [ ‹ Voltar ]   [ sobrelinha / título ]   [ cancelar ]
//
// A LOGO não entra aqui. O arquivo que o Cardápio Web devolve vem com fundo
// branco, e num cabeçalho escuro ele virava um selo branco encostado no canto.
// A marca já se apresenta inteira na tela de repouso.
//
// O NOME DA LOJA também não entra. Ele estava como sobrelinha no catálogo, e ali era
// repetição pura: o cliente acabou de ver a marca em tela cheia duas telas atrás, e
// ninguém precisa ser lembrado de onde está enquanto escolhe um hambúrguer. A sobrelinha
// ficou só com o que o cliente ESQUECE no meio do pedido — o modo escolhido —, e aparece
// apenas nas telas que já têm título próprio.
//
// `aoVoltar` ausente não é enfeite: na revisão com confirmação em dúvida NÃO pode
// existir Voltar — voltar recotaria, recotar geraria chave nova, e chave nova
// criaria um segundo pedido no Cardápio Web (spec §12, R2).
// ── A FAIXA DO CATÁLOGO ───────────────────────────────────────────────────────────────
// Com `marca` e `capa`, o cabeçalho vira outra coisa: logo à esquerda, alinhada com a
// coluna de categorias, a capa ocupando a faixa, e o cancelar por cima dela.
//
// A logo alinhada com a sidebar não é detalhe: é o que faz as duas colunas da tela
// parecerem uma grade em vez de dois blocos encostados. A capa preenche o resto, e o
// cliente ganha um lugar de comunicação que não existia — sem tirar espaço do cardápio,
// porque o cabeçalho já ocupava aquela faixa.
//
// A CAPA NÃO É TOCÁVEL. O único alvo daquela região continua sendo o Cancelar. Uma arte
// que responde ao toque no meio de um fluxo de pedido é um jeito de o cliente sair de onde
// estava sem querer.
export default function Cabecalho({ titulo, modo, marca, capa, aoVoltar, aoCancelar }) {
  // Cancelar joga fora o pedido inteiro e não tem desfazer. Com a casca nova o
  // botão passou a existir em cinco telas, inclusive com um combo montado na
  // mão — então ele pede dois toques, como o remover do carrinho, e a
  // confirmação expira sozinha em 4 s (spec §11).
  const [confirmando, setConfirmando] = useState(false)
  const timerRef = useRef(null)
  // A confirmação NÃO pode sobreviver a uma troca de tela: quem chama dá `key`
  // por tela, então o cabeçalho remonta e o estado nasce limpo. O cleanup abaixo
  // mata o relógio junto.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  function tocarCancelar() {
    if (confirmando) { clearTimeout(timerRef.current); aoCancelar(); return }
    setConfirmando(true)
    timerRef.current = setTimeout(() => setConfirmando(false), 4_000)
  }

  const sobrelinha = titulo ? modo : null

  // Só o catálogo pede a faixa. As outras telas continuam com o cabeçalho de três zonas.
  if (marca) {
    return (
      <header className={'tq-topo tq-topo-faixa' + (capa ? ' com-capa' : '')}>
        <div className="tq-topo-marca">
          {marca.logo
            ? <LogoDaLoja src={marca.logo} propria={marca.logoPropria} alt="" />
            : <span className="tq-topo-inicial tq-disp tq-disp-forte" aria-hidden="true">{marca.inicial}</span>}
        </div>

        <div className="tq-topo-capa">
          {/* Sem capa configurada, a faixa mostra o título — que é o que ela mostrava
              antes de a capa existir. O padrão não é tela vazia. */}
          {capa
            ? <img key={capa.id} className="tq-topo-capa-img" src={capa.imagemUrl} alt={capa.nome || ''} onError={capa.aoFalhar} />
            : <h1 className="tq-topo-tit tq-disp">{titulo ?? modo}</h1>}
        </div>

        {/* SOBRE A CAPA o botão é um X solto, sem chão nenhum.
            A capa é arte da loja e a faixa é dela; um balão escrito "Cancelar" — ou um
            disco por baixo do X — disputava a leitura com a peça que a loja desenhou.

            SEM CHÃO, o X precisa se garantir sobre qualquer arte: sobre foto clara um
            vermelho puro some, e sobre foto escura ele encosta no fundo. Quem resolve é um
            CONTORNO — o mesmo desenho traçado duas vezes, escuro e grosso por baixo,
            vermelho e fino por cima. É contorno, não sombra: borda dura, sem borrão e sem
            brilho, que é o que a folha evita em todo lugar. Sobre claro quem separa é o
            contorno; sobre escuro, o vermelho.

            🔴 UM TOQUE SÓ, por decisão do Junior (13/09/2026). Este botão não passa pela
            confirmação de dois toques que o `.tq-topo-cancelar` de texto ainda usa: aqui
            ele descarta o pedido e volta à tela inicial na hora. A consequência é real e
            está registrada — um toque errado no canto superior direito joga fora um
            carrinho montado, e não tem desfazer. */}
        {aoCancelar ? (
          <button
            type="button"
            className="tq-topo-cancelar sobre-capa"
            onClick={aoCancelar}
            aria-label="Cancelar o pedido e voltar ao início"
          >
            <span className="tq-xis" aria-hidden="true">
              <Ico nome="xis" tam={46} traco={6} className="tq-xis-borda" />
              <Ico nome="xis" tam={46} traco={3} className="tq-xis-tinta" />
            </span>
          </button>
        ) : null}
      </header>
    )
  }

  return (
    <header className="tq-topo">
      {aoVoltar ? (
        <button type="button" className="tq-topo-btn" onClick={aoVoltar}>
          <Ico nome="voltar" tam={22} /> Voltar
        </button>
      ) : <span className="tq-topo-vaga" aria-hidden="true" />}

      <div className="tq-topo-meio">
        {sobrelinha ? <div className="tq-topo-sup tq-rotulo">{sobrelinha}</div> : null}
        <h1 className="tq-topo-tit tq-disp">{titulo ?? modo}</h1>
      </div>

      {aoCancelar
        ? (
          <button
            type="button"
            className={'tq-topo-cancelar' + (confirmando ? ' confirmando' : '')}
            onClick={tocarCancelar}
          >
            {confirmando ? 'Apagar pedido?' : 'Cancelar'}
          </button>
        )
        : <span className="tq-topo-vaga" aria-hidden="true" />}
    </header>
  )
}
