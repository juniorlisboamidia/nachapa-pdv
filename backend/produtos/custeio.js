// Como o custo de um item vendido é apurado. Regra ÚNICA do sistema — em vez de
// espalhar `tipoProduto === 'BEBIDA'` por dezenas de pontos, quem precisa saber
// "usa ficha ou custo de compra?" pergunta aqui.
//
//   FICHA  → monta com insumos (ficha técnica) e entra na régua de CMV
//   DIRETO → comprado pronto: custo de compra informado à mão
//   COMBO  → composto por outros itens prontos, custeado pelo que os filhos custam
//
// O helper existe por causa da SOBREMESA. Enquanto cada tipo tinha um caminho só,
// perguntar o tipo respondia a pergunta do custo. Sobremesa vai pelos dois, então
// o tipo deixou de responder — e a diferença entre os dois é dinheiro.
export const TIPOS_PRODUTO = ['PRODUTO', 'BEBIDA', 'SOBREMESA', 'COMBO'];
// Sobremesa é o único tipo que pode ir por qualquer um dos dois caminhos: tem quem
// faça o pudim na casa e quem revenda o açaí pronto.
export const MODOS_SOBREMESA = ['FICHA', 'REVENDA'];
export const MODO_SOBREMESA_PADRAO = 'FICHA';

export function custeioDoProduto(produto) {
  const tipo = produto?.tipoProduto ?? 'PRODUTO';
  if (tipo === 'COMBO') return 'COMBO';
  if (tipo === 'BEBIDA') return 'DIRETO';
  if (tipo === 'SOBREMESA') {
    const modo = produto?.sobremesaModo;
    if (modo === 'REVENDA') return 'DIRETO';
    if (modo === 'FICHA') return 'FICHA';
    // Modo ausente/desconhecido (dado antigo ou escrito fora da API): se há custo de
    // compra informado, ele manda. Cair em FICHA às cegas custearia R$ 0,00 para uma
    // sobremesa revendida — subestimar custo é o erro que faz precificar errado.
    return produto?.custoDireto === null || produto?.custoDireto === undefined ? 'FICHA' : 'DIRETO';
  }
  return 'FICHA';
}

// Atalhos de leitura — deixam a intenção explícita no ponto de uso.
export const usaCustoDireto = (produto) => custeioDoProduto(produto) === 'DIRETO';
export const usaFichaTecnica = (produto) => custeioDoProduto(produto) === 'FICHA';
