import { useEffect, useRef, useState } from 'react'
import { Ico } from './icones'

// Cabeçalho compacto do quiosque: 96px de altura, três zonas fixas.
//
//   [ ‹ Voltar ]   [ sobrelinha / título ]   [ cancelar ]
//
// A LOGO não entra aqui. O arquivo que o Cardápio Web devolve vem com fundo
// branco, e num cabeçalho escuro ele virava um selo branco encostado no canto.
// A marca já se apresenta inteira na tela de repouso; aqui o que dá contexto é
// o nome da loja, como sobrelinha — texto, não asset.
//
// A sobrelinha é sempre a informação de contexto: no catálogo é o nome da loja
// (o modo é o próprio título); nas demais telas é o modo escolhido, que é o que
// o cliente esquece no meio do pedido.
//
// `aoVoltar` ausente não é enfeite: na revisão com confirmação em dúvida NÃO pode
// existir Voltar — voltar recotaria, recotar geraria chave nova, e chave nova
// criaria um segundo pedido no Cardápio Web (spec §12, R2).
export default function Cabecalho({ loja, titulo, modo, aoVoltar, aoCancelar }) {
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

  const sobrelinha = titulo ? (modo ?? loja?.nome) : loja?.nome

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
