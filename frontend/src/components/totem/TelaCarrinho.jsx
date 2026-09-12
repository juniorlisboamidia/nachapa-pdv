import LinhaCarrinho from './LinhaCarrinho'
import { moeda } from './formato'
import { Ico } from './icones'

// O pedido montado. Vazio deixa de ser um parágrafo solto e passa a oferecer a
// saída — o cliente que chega aqui sem nada precisa de um caminho de volta ao
// cardápio, não de um aviso.
//
// A linha é chaveada por `uid`, nunca por itemId: duas linhas do MESMO item base
// (X BURGUER e X BACON, ambos "TRADICIONAIS 🍔") são normais na vitrine, e
// remover ou editar uma não pode encostar na outra.
export default function TelaCarrinho({ linhas, total, aoEditar, aoRemover, aoMudarQtd, aoContinuar, aoAdicionarMais }) {
  return (
    <>
      <div className="tq-conteudo">
        {linhas.length === 0 ? (
          <div className="tq-vazio">
            <Ico nome="carrinho" tam={64} traco={1.5} />
            <div className="tq-vazio-t tq-disp tq-disp-forte">Seu pedido está vazio</div>
            <p>Escolha um produto no cardápio para começar.</p>
            <button type="button" className="tq-btn tq-btn-primario" onClick={aoAdicionarMais}>Ver o cardápio</button>
          </div>
        ) : (
          <div className="tq-lista">
            {linhas.map((l) => (
              <LinhaCarrinho
                key={l.uid}
                linha={l}
                aoEditar={() => aoEditar(l)}
                aoRemover={() => aoRemover(l.uid)}
                aoMudarQtd={(d) => aoMudarQtd(l.uid, d)}
              />
            ))}
            <button type="button" className="tq-btn tq-btn-claro" onClick={aoAdicionarMais}>
              <Ico nome="mais" tam={22} /> Adicionar mais itens
            </button>
          </div>
        )}
      </div>

      <footer className="tq-rodape coluna">
        <div className="tq-subtotal">
          <span>Subtotal<small>o valor final é confirmado na revisão</small></span>
          <strong className="tq-disp tq-disp-forte tq-num">{moeda(total)}</strong>
        </div>
        <button
          type="button"
          className="tq-btn tq-btn-primario tq-btn-largo"
          disabled={linhas.length === 0}
          onClick={aoContinuar}
        >
          Ir para o pagamento
        </button>
      </footer>
    </>
  )
}
