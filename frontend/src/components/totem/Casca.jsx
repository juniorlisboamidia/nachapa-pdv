// Raiz do quiosque. Existe para que TODA saída de TotemQuiosque (carregando,
// bloqueio, tela cheia) use a mesma casca, em vez de repetir a `div` da raiz em
// cada `return` — era assim que a tela antiga fazia, e cada cópia era uma chance
// de esquecer uma regra de fundo, fonte ou rolagem.
//
// `ttm-raiz` continua aqui de propósito e sai na V11: enquanto houver tela
// migrada e tela antiga convivendo, as antigas ainda dependem do bloco `.ttm-*`
// do global.css para caixa e fonte. `.tq-raiz` entra depois na folha final, então
// onde as duas se sobrepõem quem manda é a nova.
export default function Casca({ children }) {
  return <div className="tq-raiz ttm-raiz">{children}</div>
}
