// Raiz do quiosque. Existe para que TODA saída de TotemQuiosque (carregando,
// bloqueio, tela cheia) use a mesma casca, em vez de repetir a `div` da raiz em
// cada `return` — era assim que a tela antiga fazia, e cada cópia era uma chance
// de esquecer uma regra de fundo, fonte ou rolagem.
//
// A partir da V11 não há mais convivência: o bloco `.ttm-*` do quiosque saiu do
// global.css e a casca é só `.tq-raiz`. O que sobrou de `.ttm-` no global.css
// pertence às telas de escritório (Totem › Pedidos e › Apresentação).
//
// `position: relative` é o que ancora o que flutua dentro do quiosque — aviso
// passageiro, sobreposição de envio e o alerta de inatividade.
export default function Casca({ children }) {
  return <div className="tq-raiz">{children}</div>
}
