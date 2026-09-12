import { moeda } from './formato'
import { Ico } from './icones'

// O pagamento é no balcão. A tela existe só para o caixa saber como o cliente vai
// pagar — e por isso o aviso de que NADA é cobrado aqui saiu do rodapé e virou a
// primeira coisa que se lê: é a dúvida número um de quem usa um totem pela
// primeira vez.
const ICONE_POR_TIPO = { money: 'dinheiro', debit_card: 'cartao', credit_card: 'cartao' }

export default function TelaPagamento({ metodos, metodoId, nomeDoMetodo, total, aoEscolher, aoRevisar }) {
  return (
    <>
      <div className="tq-conteudo">
        <div className="tq-lista">
          <div className="tq-aviso-forte">
            <Ico nome="alerta" tam={26} />
            <span>
              <b>Nada é cobrado neste totem</b>
              Você paga no balcão ao retirar. Aqui é só para o caixa já saber como você vai pagar.
            </span>
          </div>

          {metodos.length === 0 ? (
            <p className="tq-erro-texto">Nenhuma forma de pagamento disponível agora. Fale com um atendente no balcão.</p>
          ) : metodos.map((m) => {
            const escolhido = String(m.id) === String(metodoId)
            return (
              <button
                key={m.id}
                type="button"
                className="tq-metodo"
                aria-pressed={escolhido}
                onClick={() => aoEscolher(m.id)}
              >
                <Ico nome={ICONE_POR_TIPO[m.kind] ?? 'cartao'} tam={34} />
                <span className="tq-metodo-nome tq-disp">{nomeDoMetodo(m)}</span>
                <span className="tq-op-marca" aria-hidden="true"><Ico nome="check" tam={18} traco={3} /></span>
              </button>
            )
          })}
        </div>
      </div>

      <footer className="tq-rodape coluna">
        <div className="tq-subtotal">
          <span>Subtotal<small>o valor final é confirmado na revisão</small></span>
          <strong className="tq-disp tq-disp-forte tq-num">{moeda(total)}</strong>
        </div>
        <button type="button" className="tq-btn tq-btn-primario tq-btn-largo" disabled={!metodoId} onClick={aoRevisar}>
          Revisar o pedido
        </button>
      </footer>
    </>
  )
}
