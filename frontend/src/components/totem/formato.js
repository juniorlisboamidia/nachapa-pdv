// Formatação de tela do quiosque. Fica em módulo próprio (e não dentro de um
// componente) porque constante exportada ao lado de componente quebra o fast
// refresh do Vite — e porque card, cabeçalho, carrinho e revisão precisam do
// MESMO formato de moeda: um real escrito de dois jeitos na mesma jornada é
// defeito visível.
export const moeda = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
