// Formatação de tela do quiosque. Fica em módulo próprio (e não dentro de um
// componente) porque constante exportada ao lado de componente quebra o fast
// refresh do Vite — e porque card, cabeçalho, carrinho e revisão precisam do
// MESMO formato de moeda: um real escrito de dois jeitos na mesma jornada é
// defeito visível.
export const moeda = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Percentual da oferta para o selo "-20%". SÓ exibição: os dois preços já vêm prontos
// do HUB e a tela não cobra nada por este número. Zero (= sem selo) quando o par não
// forma uma oferta de verdade — preço antigo ausente, igual ou menor que o novo — e
// arredondado para o inteiro, como o Cardápio Web mostra.
export function percentualDesconto(valor, valorPromocional) {
  // `Number(null)` é 0 — e 0 é um preço, não uma ausência. Ausência sai antes da conta.
  if (valor == null || valorPromocional == null) return 0
  const de = Number(valor)
  const por = Number(valorPromocional)
  if (!Number.isFinite(de) || !Number.isFinite(por) || de <= 0 || por < 0 || por >= de) return 0
  return Math.round((1 - por / de) * 100)
}
