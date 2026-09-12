import Foto from './Foto'
import Stepper from './Stepper'
import { moeda } from './formato'
import { Ico } from './icones'

// Uma opção de complemento. Até aqui ela era uma linha de texto com um quadradinho
// — e o Cardápio Web já mandava `imagem` e `descricao` de cada opção desde a rev. 2,
// que a tela jogava fora. Agora aparecem.
//
// `comFoto` é decisão do GRUPO (modoDeOpcoes), não da opção: dentro de um grupo
// em grade, a opção sem imagem recebe o marcador desenhado para a coluna de nomes
// não ficar torta.
//
// Em falta: a foto acinzenta e o selo aparece, mas o texto mantém contraste
// cheio. O cliente precisa LER que aquilo acabou.
export default function CardOpcao({
  opcao, comFoto, somavel, emFalta, marcado, qtd, podeMais, aoTocar, aoMenos,
}) {
  const conteudo = (
    <>
      {comFoto ? <Foto src={opcao.imagem} alt="" className="tq-op-foto" tamIcone={32} /> : null}
      <span className="tq-op-txt">
        <span className="tq-op-nome">{opcao.nome}</span>
        {opcao.descricao ? <span className="tq-op-desc">{opcao.descricao}</span> : null}
        {opcao.preco > 0 ? <span className="tq-op-preco tq-num">+ {moeda(opcao.preco)}</span> : null}
      </span>
    </>
  )

  // Somável não pode ser um botão só: dentro dele mora um contador, e botão
  // dentro de botão não é HTML válido nem funciona no toque.
  if (somavel) {
    return (
      <div className={'tq-op' + (marcado ? ' on' : '') + (emFalta ? ' falta' : '')}>
        {conteudo}
        <span className="tq-op-lado">
          {emFalta ? <span className="tq-op-falta">Em falta</span> : (
            qtd > 0
              ? (
                <Stepper
                  valor={qtd}
                  minimo={0}
                  rotulo={opcao.nome}
                  aoMenos={aoMenos}
                  aoMais={aoTocar}
                  maximoAtingido={!podeMais}
                />
              )
              : (
                <button type="button" className="tq-op-add" disabled={!podeMais} onClick={aoTocar}>
                  Adicionar
                </button>
              )
          )}
        </span>
      </div>
    )
  }

  const bloqueada = !marcado && !podeMais && !emFalta
  return (
    <button
      type="button"
      className={'tq-op' + (emFalta ? ' falta' : '') + (bloqueada ? ' bloqueada' : '')}
      disabled={!!emFalta || bloqueada}
      aria-pressed={marcado}
      onClick={aoTocar}
    >
      {conteudo}
      {emFalta
        ? <span className="tq-op-falta">Em falta</span>
        : <span className="tq-op-marca" aria-hidden="true"><Ico nome="check" tam={18} traco={3} /></span>}
    </button>
  )
}
