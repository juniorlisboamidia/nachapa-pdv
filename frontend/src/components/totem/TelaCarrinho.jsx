import LinhaCarrinho from './LinhaCarrinho'
import { moeda } from './formato'
import { Ico } from './icones'
import { acaoDoCarrinho } from '../totemLoja'

// O pedido montado. Vazio deixa de ser um parágrafo solto e passa a oferecer a
// saída — o cliente que chega aqui sem nada precisa de um caminho de volta ao
// cardápio, não de um aviso.
//
// A linha é chaveada por `uid`, nunca por itemId: duas linhas do MESMO item base
// (X BURGUER e X BACON, ambos "TRADICIONAIS 🍔") são normais na vitrine, e
// remover ou editar uma não pode encostar na outra.
export default function TelaCarrinho({ linhas, total, fechada = false, aoEditar, aoRemover, aoMudarQtd, aoContinuar, aoAdicionarMais }) {
  // Loja fechada troca o RÓTULO da ação em vez de acrescentar um aviso ao lado: o espaço é
  // o mesmo, o layout não muda, e a razão de não dar para avançar está escrita exatamente
  // onde o dedo ia tocar. A decisão é do módulo puro — aqui só se desenha.
  const acao = acaoDoCarrinho({ fechada, qtdLinhas: linhas.length })
  // Só exibição: a contagem debaixo do rótulo é o mesmo número que a barra do catálogo
  // mostra, para o cliente conferir que está tudo aqui.
  const unidades = linhas.reduce((n, l) => n + (Number(l.qtd) || 0), 0)
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
            <button type="button" className="tq-btn tq-btn-claro tq-lista-mais" onClick={aoAdicionarMais}>
              <Ico nome="mais" tam={26} /> Adicionar mais itens
            </button>
          </div>
        )}
      </div>

      <footer className="tq-rodape coluna tq-rodape-carrinho">
        {/* "Total", não "Subtotal": não há taxa nem entrega somada depois — o número é o
            que se paga. A revisão só reconfirma o preço com a loja, e avisa se mudou. */}
        <div className="tq-subtotal">
          <span>Total<small>{unidades === 1 ? '1 item' : `${unidades} itens`}</small></span>
          <strong className="tq-disp tq-disp-forte tq-num">{moeda(total)}</strong>
        </div>
        {/* Fechado NÃO é um botão desabilitado: é um bloco de estado, sem `onClick` e sem
            `<button>`. Botão apagado convida ao toque repetido — e um totem não tem como
            explicar por que o toque não fez nada. `aria-disabled` conta a mesma coisa a
            quem usa leitor de tela. */}
        {acao.fechada ? (
          <div className="tq-estado-largo" role="status" aria-disabled="true">
            {acao.rotulo}
          </div>
        ) : (
          <button
            type="button"
            className="tq-btn tq-btn-primario tq-btn-largo"
            disabled={!acao.habilitado}
            onClick={aoContinuar}
          >
            {acao.rotulo}
          </button>
        )}
      </footer>
    </>
  )
}
