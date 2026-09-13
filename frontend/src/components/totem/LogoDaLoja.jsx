// A logo da loja no quiosque, compartilhada pela Tela de espera e pela escolha de modo.
//
// Existe para que as duas telas não decidam a mesma coisa duas vezes: elas mostram a mesma
// marca, no mesmo tamanho, e a única diferença entre elas é a composição em volta.
//
// ── POR QUE HÁ DOIS TRATAMENTOS ───────────────────────────────────────────────────────
// A logo do CARDÁPIO WEB é feita para o cardápio digital, de fundo claro, e quase sempre
// vem com o branco embutido no arquivo. Sobre o preto do totem ela apareceria como um
// retângulo branco de recorte irregular — então ela assume o que é e vira PLACA, com raio
// e respiro, que lê como sinalização de fachada em vez de imagem colada.
//
// A logo PRÓPRIA do canal é outra história: quem a enviou preparou o PNG com transparência
// justamente para o fundo escuro. Aí a placa é o defeito — ela devolve o retângulo branco
// que o arquivo transparente existia para evitar. Essa vai direto sobre o fundo.
//
// Quem sabe qual é qual é `logoDoTotem` (totemTema.js), na mesma função que resolve a
// precedência canal → HUB. A tela só desenha.
export default function LogoDaLoja({ src, propria, alt = '' }) {
  if (!src) return null
  // Sem placa, sem card, sem moldura e sem sombra: no preto do totem uma logo transparente
  // não precisa de nada para se destacar, e qualquer efeito aqui seria enfeite.
  if (propria) return <img className="tq-logo" src={src} alt={alt} />
  return <div className="tq-placa"><img src={src} alt={alt} /></div>
}
