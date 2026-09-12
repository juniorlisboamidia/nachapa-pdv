import { moeda } from './formato'

// O preço em UM lugar só — card, cabeçalho do detalhe e botão de adicionar usam
// este componente. Quando havia três marcações diferentes para a mesma ideia, o
// "a partir de" acabava aparecendo num lugar e sumindo no outro.
//
// `aPartirDe` vem pronto do HUB (`precoEhAPartirDe`) ou de `precoDoCabecalho`: a
// tela não decide se o valor é piso ou exato, só desenha o que recebeu.
export default function Preco({ valor, valorPromocional, aPartirDe, className }) {
  const temPromo = valorPromocional !== null && valorPromocional !== undefined
  const rotulo = aPartirDe ? <span className="tq-apartir tq-rotulo">a partir de</span> : null
  return (
    <span className={'tq-preco' + (className ? ' ' + className : '')}>
      {rotulo}
      {temPromo ? (
        <>
          <span className="tq-preco-de tq-num">de {moeda(valor)}</span>
          <span className="tq-preco-valor tq-preco-por tq-disp tq-disp-forte tq-num">por {moeda(valorPromocional)}</span>
        </>
      ) : (
        <span className="tq-preco-valor tq-disp tq-disp-forte tq-num">{moeda(valor)}</span>
      )}
    </span>
  )
}
