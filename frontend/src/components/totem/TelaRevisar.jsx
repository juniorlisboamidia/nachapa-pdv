import { nomeApresentado } from '../totemCarrinho'
import { moeda } from './formato'
import Spinner from './Spinner'

// A tela de confiança antes do ponto sem volta. Três coisas mudam de peso aqui e
// nenhuma delas é enfeite:
//
//  · o total ganha uma faixa PRETA no rodapé — é o único lugar do quiosque com
//    esse tratamento, e ele marca que o próximo toque cria o pedido;
//  · a lista vem do que o HUB COTOU, não do que a tela achava; da linha local sai
//    só o nome apresentado (o HUB conhece o item base) e qual opção é a principal,
//    para ela não aparecer listada como complemento de si mesma;
//  · o destaque de preço alterado é por ÍNDICE, porque duas linhas podem ser do
//    mesmo item base e marcar por itemId acenderia as duas quando só uma mudou.
//
// Estado travado (confirmação em dúvida): a tela oferece UM caminho. Não há
// Voltar, não há trocar pagamento, não há cancelar — qualquer um deles levaria a
// uma nova cotação, nova cotação gera chave nova, e chave nova cria um SEGUNDO
// pedido no Cardápio Web.
export default function TelaRevisar({
  cotando, erroCotar, linhas, carrinho, avisoPrecos, erroEnvio, travado, enviando,
  modo, metodo, total, podeConfirmar, nomeDoDetalhe, mensagem,
  aoVoltarCarrinho, aoTrocarPagamento, aoRecotar, aoConfirmar,
}) {
  const alteradas = avisoPrecos?.alteradas ?? []
  const alteradasIdx = avisoPrecos?.alteradasIdx ?? []
  // O HUB devolve as linhas NA ORDEM do carrinho. Quando a contagem bate, cada
  // linha cotada tem a sua linha local. Se não bater (linha recusada), vale o que
  // o servidor mandou e o destaque cai para o casamento por itemId.
  const porIndice = linhas.length === carrinho.length
  const localDa = (l, i) => (porIndice && String(carrinho[i]?.item?.id) === String(l?.itemId) ? carrinho[i] : null)

  return (
    <>
      <div className="tq-conteudo">
        {cotando ? (
          <div className="tq-centrado">
            <Spinner />
            <div className="tq-carregando-txt">Calculando o valor do seu pedido…</div>
          </div>
        ) : erroCotar ? (
          <div className="tq-lista">
            <div className="tq-erro-bloco">
              <div className="tq-erro-titulo tq-disp tq-disp-forte">Não foi possível fechar o valor</div>
              <p className="tq-erro-texto">{mensagem(erroCotar.codigo)}</p>
              {erroCotar.detalhes.length > 0 ? (
                <ul className="tq-erro-lista">
                  {erroCotar.detalhes.map((d, i) => {
                    const nome = nomeDoDetalhe(d)
                    // A frase que o próprio servidor escreveu para ESTA linha é mais
                    // específica que a frase geral do código: quando vem, ela manda.
                    return <li key={`${d.codigo}-${i}`}>{nome ? <strong>{nome}: </strong> : null}{d.mensagem ?? mensagem(d.codigo)}</li>
                  })}
                </ul>
              ) : null}
              <div className="tq-rodape-botoes">
                <button type="button" className="tq-btn tq-btn-claro" onClick={aoVoltarCarrinho}>Voltar ao carrinho</button>
                <button type="button" className="tq-btn tq-btn-primario" onClick={aoRecotar}>Tentar de novo</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="tq-lista">
            {avisoPrecos ? (
              <div className="tq-precos-mudaram" role="status">
                <strong>Preços atualizados.</strong> O cardápio mudou enquanto você escolhia. Confira o novo valor antes de confirmar.
              </div>
            ) : null}
            {erroEnvio && !erroEnvio.podeRepetir ? (
              <div className="tq-aviso-bloco">{mensagem(erroEnvio.codigo)}</div>
            ) : null}

            <div className="tq-resumo-modo tq-rotulo">
              {modo} · {metodo ?? '—'}
              {!travado ? (
                <button type="button" className="tq-link" disabled={enviando} onClick={aoTrocarPagamento}>trocar pagamento</button>
              ) : null}
            </div>

            {linhas.map((l, i) => {
              const local = localDa(l, i)
              const mudou = local
                ? alteradasIdx.includes(i)
                : alteradas.some((id) => String(id) === String(l.itemId))
              // A lista de opções é a DO HUB: traz a ordem do Cardápio Web e as
              // quantidades do que foi realmente cotado. Reconstruir aqui seria
              // trocar o que o servidor cobrou pelo que a tela achava.
              const principal = local?.apresentado?.opcaoId
              const opcoes = (l.opcoes ?? []).filter((o) => (
                principal === null || principal === undefined || String(o.opcaoId) !== String(principal)
              ))
              return (
                <div key={`${l.itemId}-${i}`} className={'tq-linha' + (mudou ? ' mudou' : '')}>
                  <div className="tq-linha-corpo">
                    <div className="tq-linha-nome tq-disp">{l.qtd}× {local ? nomeApresentado(local) : l.nome}</div>
                    {opcoes.length ? (
                      <ul className="tq-linha-ops">
                        {opcoes.map((o, j) => (
                          <li key={`${o.opcaoId}-${j}`}>{(Number(o.qtd) || 1) > 1 ? `${o.qtd}× ` : ''}{o.nome}</li>
                        ))}
                      </ul>
                    ) : null}
                    {local?.observacao ? <div className="tq-linha-obs">“{local.observacao}”</div> : null}
                    {mudou ? <div className="tq-linha-mudou">preço atualizado</div> : null}
                  </div>
                  <div className="tq-linha-valor tq-disp tq-disp-forte tq-num">{moeda(l.totalPrice)}</div>
                </div>
              )
            })}

            <div className="tq-pagar-balcao">Pagamento no balcão, na retirada.</div>
          </div>
        )}
      </div>

      {!cotando && !erroCotar ? (
        <footer className="tq-fechamento tq-sobre-preto">
          <div className="tq-fechamento-l">
            <span className="tq-rotulo">Total</span>
            <strong className={'tq-disp tq-disp-forte tq-num' + (avisoPrecos?.totalMudou ? ' mudou' : '')}>{moeda(total)}</strong>
          </div>
          {travado ? (
            <>
              <div className="tq-travado">
                Não conseguimos falar com o sistema. <b>Seu pedido pode já ter sido registrado.</b>{' '}
                Toque no botão abaixo — não vai sair pedido em dobro.
              </div>
              <button type="button" className="tq-btn tq-btn-primario tq-btn-largo" disabled={enviando} onClick={aoConfirmar}>
                {enviando ? <><Spinner claro /> Enviando…</> : 'Tentar confirmar de novo'}
              </button>
              <p className="tq-travado-nota">Se preferir, chame um atendente.</p>
            </>
          ) : (
            <button
              type="button"
              className="tq-btn tq-btn-primario tq-btn-largo"
              disabled={enviando || !podeConfirmar}
              onClick={aoConfirmar}
            >
              {enviando ? <><Spinner claro /> Enviando seu pedido…</> : 'Confirmar pedido'}
            </button>
          )}
        </footer>
      ) : null}

      {enviando ? (
        <div className="tq-enviando" role="status" aria-live="assertive">
          <Spinner claro />
          <div className="tq-enviando-t tq-disp tq-disp-forte">Enviando seu pedido</div>
          <div className="tq-enviando-p">Não feche esta tela. Isso pode levar até um minuto.</div>
        </div>
      ) : null}
    </>
  )
}
