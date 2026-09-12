import Foto from './Foto'
import Stepper from './Stepper'
import { moeda } from './formato'
import { Ico } from './icones'

// Uma opção de complemento. Card HORIZONTAL: miniatura à esquerda, texto no
// meio, controle à direita.
//
// A versão anterior deixava foto, nome e um botão "Adicionar" disputando a mesma
// largura dentro de uma coluna estreita, e o resultado era nome quebrando em
// vertical — "ADIC. DE CARNE 56G" virava uma coluna de letras. Aqui o texto tem
// `min-width: 0` e quebra só por palavra, a miniatura é fixa e o controle é um
// marcador pequeno no canto.
//
// Não existe mais botão "Adicionar" dentro da opção: o card inteiro é o alvo.
// A única exceção é a opção somável já escolhida, que abre espaço para o
// contador — e aí o card deixa de ser botão, porque contador dentro de botão não
// é HTML válido.
export default function CardOpcao({
  opcao, comFoto, somavel, emFalta, marcado, qtd, podeMais, aoTocar, aoMenos,
}) {
  const conteudo = (
    <>
      {/* No grupo em modo foto, a opção sem imagem mantém o slot com o marcador
          desenhado: é o que impede a grade de desmontar linha a linha. */}
      {comFoto ? <Foto src={opcao.imagem} alt="" className="tq-op-foto" tamIcone={30} /> : null}
      <span className="tq-op-txt">
        <span className="tq-op-nome">{opcao.nome}</span>
        {opcao.descricao ? <span className="tq-op-desc">{opcao.descricao}</span> : null}
        {opcao.preco > 0 ? <span className="tq-op-preco tq-num">+ {moeda(opcao.preco)}</span> : null}
      </span>
    </>
  )

  const classe = (extra = '') => 'tq-op' + (comFoto ? ' com-foto' : '') + (emFalta ? ' falta' : '') + extra

  if (emFalta) {
    return (
      <div className={classe()} aria-disabled="true">
        {conteudo}
        <span className="tq-op-lado"><span className="tq-op-falta">Em falta</span></span>
      </div>
    )
  }

  if (somavel && qtd > 0) {
    return (
      <div className={classe(' on')}>
        {conteudo}
        <span className="tq-op-lado">
          <Stepper
            valor={qtd}
            minimo={0}
            rotulo={opcao.nome}
            aoMenos={aoMenos}
            aoMais={aoTocar}
            maximoAtingido={!podeMais}
          />
        </span>
      </div>
    )
  }

  const bloqueada = !marcado && !podeMais
  return (
    <button
      type="button"
      className={classe(bloqueada ? ' bloqueada' : '')}
      disabled={bloqueada}
      aria-pressed={marcado}
      onClick={aoTocar}
    >
      {conteudo}
      <span className="tq-op-lado">
        <span className="tq-op-marca" aria-hidden="true">
          <Ico nome={somavel ? 'mais' : 'check'} tam={20} traco={3} />
        </span>
      </span>
    </button>
  )
}
