import { moeda } from './formato'

// Barra do pedido — o pedido sempre à vista, no rodapé do catálogo.
//
// COM O PEDIDO VAZIO ELA NÃO EXISTE. Antes reservava a altura e dizia "toque num
// produto para começar", para nada saltar quando o primeiro item entrasse. Mas é
// justamente na tela vazia que a altura pesa mais: 132px de rodapé explicando o
// óbvio a quem está olhando para um cardápio de fotos, tirados do catálogo e da
// coluna de categorias, que são o que a pessoa veio ver.
//
// O salto que a reserva evitava continua existindo, e agora é aceito: quando o
// primeiro item entra, quem avisa é o cartão central com a foto do produto
// (ConfirmacaoItem) — o olho está nele, não no rodapé que apareceu atrás.
//
// Com pedido, o contador pulsa a cada item novo. O pulso não guarda estado: a
// `key` do contador é a própria quantidade, então o nó é recriado a cada mudança
// e a animação do CSS recomeça sozinha.
export default function BarraPedido({ quantidade, total, aoVerPedido }) {
  if (!quantidade) return null
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
