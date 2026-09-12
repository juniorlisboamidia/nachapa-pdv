import Spinner from './Spinner'
import { moeda } from './formato'

// O fim da jornada. O número do pedido é o motivo desta tela existir — é o que o
// cliente vai apresentar no balcão — então ele ganha painel próprio, amarelo
// sobre preto, em tamanho de vitrine.
//
// Quatro desfechos, e a diferença entre eles importa:
//  · CRIADO com número: o número manda;
//  · CRIADO sem número ainda: o polling continua e a referência serve de código;
//  · CRIADO sem número e desistiu do polling: a referência vira o código;
//  · AMBÍGUO: não há número, e o recado é procurar o balcão SEM refazer o pedido.
export default function TelaResultado({ resultado, liberouNovo, aoNovoPedido }) {
  const criado = resultado.status === 'CRIADO'
  const temNumero = criado && !!resultado.cwDisplayId
  const aindaBuscando = criado && !resultado.cwDisplayId && !resultado.desistiuDoNumero

  return (
    <div className="tq-result">
      {temNumero ? (
        <>
          <div className="tq-painel-num">
            <div className="tq-painel-rot tq-rotulo">Pedido</div>
            <div className="tq-numero tq-disp tq-disp-forte tq-num">#{resultado.cwDisplayId}</div>
          </div>
          <p className="tq-result-tx">Vá até o balcão, informe o número e pague na retirada.</p>
        </>
      ) : aindaBuscando ? (
        <>
          <div className="tq-painel-num">
            <div className="tq-painel-rot tq-rotulo">Pedido registrado</div>
            <div className="tq-numero buscando tq-disp"><Spinner claro /> Gerando o número…</div>
          </div>
          <p className="tq-result-tx">Já está na cozinha. Em instantes o número aparece aqui.</p>
          <div className="tq-codigo-balcao">
            <span>Se preferir, apresente este código no balcão:</span>
            <strong>{resultado.referencia}</strong>
          </div>
        </>
      ) : criado ? (
        <>
          <div className="tq-painel-num">
            <div className="tq-painel-rot tq-rotulo">Pedido registrado</div>
            <div className="tq-numero ref tq-disp tq-disp-forte">{resultado.referencia}</div>
          </div>
          <p className="tq-result-tx">Apresente este código no balcão.</p>
        </>
      ) : resultado.referencia ? (
        <>
          <div className="tq-painel-num">
            <div className="tq-painel-rot tq-rotulo">Estamos confirmando</div>
            <div className="tq-numero ref tq-disp tq-disp-forte">{resultado.referencia}</div>
          </div>
          <p className="tq-result-tx">
            Apresente este código no balcão e o atendente confirma para você. <strong>Não faça o pedido de novo.</strong>
          </p>
        </>
      ) : (
        // Sem código: a confirmação ficou em dúvida antes de o servidor devolver a
        // referência. Não há o que apresentar — o que existe é o balcão.
        <>
          <div className="tq-painel-num">
            <div className="tq-painel-rot tq-rotulo">Estamos confirmando</div>
            <div className="tq-numero ref tq-disp tq-disp-forte">seu pedido</div>
          </div>
          <p className="tq-result-tx">
            <strong>Procure o balcão.</strong> O atendente confirma o seu pedido. <strong>Não faça o pedido de novo.</strong>
          </p>
        </>
      )}

      <div className="tq-result-total tq-rotulo tq-num">Total {moeda(resultado.total)} · pague no balcão</div>

      {/* Botão de tamanho de botão. Enquanto ele não libera (20 s depois de um 202),
          o lugar dele é ocupado pelo recado de anotar o código — nada de um alvo
          gigante convidando a apagar a tela antes de o cliente ler o número. */}
      {liberouNovo
        ? <button type="button" className="tq-btn tq-btn-claro tq-novo" onClick={aoNovoPedido}>Novo pedido</button>
        : <div className="tq-espera">Anote o código. O totem volta ao início em instantes.</div>}
    </div>
  )
}
