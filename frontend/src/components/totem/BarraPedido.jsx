import { Ico } from './icones'
import { moeda } from './formato'

// Barra do pedido — o pedido sempre à vista, no rodapé do catálogo.
//
// Duas mudanças de comportamento em relação ao botão flutuante que ela
// substitui: a altura é RESERVADA mesmo com o pedido vazio (nada salta quando o
// primeiro item entra, e a última fileira de produtos nunca fica escondida
// embaixo de um botão sobreposto), e o contador pulsa a cada item novo — é o
// sinal de que o toque em "Adicionar" funcionou, já que agora o cliente volta ao
// catálogo em vez de cair no carrinho.
//
// O pulso não guarda estado: a `key` do contador é a própria quantidade, então o
// nó é recriado a cada mudança e a animação do CSS recomeça sozinha.
export default function BarraPedido({ quantidade, total, aoVerPedido }) {
  if (!quantidade) {
    return (
      <div className="tq-barra">
        <div className="tq-barra-vazia">
          <Ico nome="carrinho" tam={26} />
          Toque num produto para começar o seu pedido
        </div>
      </div>
    )
  }
  return (
    <div className="tq-barra tq-sobre-preto">
      <div className="tq-barra-linha">
        <span key={quantidade} className="tq-qtd tq-num">{quantidade}</span>
        <span>{quantidade === 1 ? 'item no pedido' : 'itens no pedido'}</span>
        <strong className="tq-barra-total tq-disp tq-disp-forte tq-num">{moeda(total)}</strong>
      </div>
      <button type="button" className="tq-btn tq-btn-primario tq-btn-largo" onClick={aoVerPedido}>
        Ver meu pedido
      </button>
    </div>
  )
}
