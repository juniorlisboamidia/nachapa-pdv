import { moeda, percentualDesconto } from './formato'

// O preço em UM lugar só — card, cabeçalho do detalhe e botão de adicionar usam
// este componente. Quando havia três marcações diferentes para a mesma ideia, o
// "a partir de" acabava aparecendo num lugar e sumindo no outro.
//
// `aPartirDe` vem pronto do HUB (`precoEhAPartirDe`) ou de `precoDoCabecalho`: a
// tela não decide se o valor é piso ou exato, só desenha o que recebeu.
//
// `oferta` é o desenho do CARD: preço antigo riscado e o selo "-20%" numa linha, o
// preço atual embaixo, sem o "por" — é como o Cardápio Web mostra uma promoção, e é
// o que faz a oferta ser percebida de longe. O detalhe e o botão de adicionar seguem
// com "de / por", que ali é leitura de perto.
export default function Preco({ valor, valorPromocional, aPartirDe, className, oferta = false }) {
  const temPromo = valorPromocional !== null && valorPromocional !== undefined
  const rotulo = aPartirDe ? <span className="tq-apartir tq-rotulo">a partir de</span> : null
  if (temPromo && oferta) {
    const pct = percentualDesconto(valor, valorPromocional)
    return (
      <span className={'tq-preco' + (className ? ' ' + className : '')}>
        {rotulo}
        <span className="tq-preco-oferta">
          <span className="tq-preco-de tq-num">de {moeda(valor)}</span>
          {pct ? <span className="tq-fita">-{pct}%</span> : null}
        </span>
        <span className="tq-preco-valor tq-preco-por tq-disp tq-disp-forte tq-num">{moeda(valorPromocional)}</span>
      </span>
    )
  }
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
