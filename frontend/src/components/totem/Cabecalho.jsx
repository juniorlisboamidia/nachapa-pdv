import { useEffect, useRef, useState } from 'react'
import { Ico } from './icones'

// Cabeçalho compacto do quiosque: 96px de altura, três zonas fixas.
//
//   [ logo | ‹ Voltar ]   [ título / modo ]   [ Cancelar ]
//
// O cabeçalho antigo gastava a mesma altura para centralizar um título e repetir
// o nome da loja em cinza — espaço que em retrato pertence ao catálogo. Aqui a
// identidade aparece só quando não há para onde voltar, e o modo escolhido
// ("Comer aqui" / "Levar") fica visível o pedido inteiro, porque é a informação
// que o cliente esquece.
//
// `aoVoltar` ausente não é enfeite: na revisão com confirmação em dúvida NÃO pode
// existir Voltar — voltar recotaria, recotar geraria chave nova, e chave nova
// criaria um segundo pedido no Cardápio Web (spec §12, R2).
export default function Cabecalho({ loja, titulo, modo, aoVoltar, aoCancelar }) {
  const logo = loja?.logo || loja?.logoDataUrl || null
  const inicial = String(loja?.nome ?? '').trim().charAt(0).toUpperCase() || '•'
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

  return (
    <header className="tq-topo">
      {aoVoltar ? (
        <button type="button" className="tq-topo-btn" onClick={aoVoltar}>
          <Ico nome="voltar" tam={22} /> Voltar
        </button>
      ) : logo ? (
        <img className="tq-topo-logo" src={logo} alt="" />
      ) : (
        <div className="tq-marca tq-disp tq-disp-forte" aria-hidden="true">{inicial}</div>
      )}

      <div className="tq-topo-meio">
        {titulo ? <h1 className="tq-topo-tit tq-disp">{titulo}</h1> : null}
        {modo ? (
          <div className={titulo ? 'tq-topo-modo' : 'tq-topo-tit tq-disp'}>{modo}</div>
        ) : null}
      </div>

      {aoCancelar
        ? (
          <button
            type="button"
            className={'tq-topo-btn perigo' + (confirmando ? ' confirmando' : '')}
            onClick={tocarCancelar}
          >
            {confirmando ? 'Apagar pedido?' : 'Cancelar'}
          </button>
        )
        : <span className="tq-topo-vaga" aria-hidden="true" />}
    </header>
  )
}
