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
        ? <button type="button" className="tq-topo-btn perigo" onClick={aoCancelar}>Cancelar</button>
        : <span className="tq-topo-vaga" aria-hidden="true" />}
    </header>
  )
}
