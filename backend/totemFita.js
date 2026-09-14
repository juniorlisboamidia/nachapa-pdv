// A FITA do produto no totem — módulo puro (sem Prisma, sem Express, sem rede).
//
// A fita é o selo que o card mostra sobre a foto ("Mais pedido", "Novo", "Combo"…). É
// APRESENTAÇÃO deste canal, como o modo vitrine e o nome exibido da categoria: o Cardápio
// Web não tem esse dado, e por isso ele mora no PDV, uma linha por (empresa, item do CW).
//
// Lista FECHADA de selos, e não texto livre: o vidro do totem não é lugar para
// "PROMOÇÃO IMPERDÍVEL!!!" de trinta letras. O banco guarda o CÓDIGO; o rótulo que o
// cliente lê vem daqui, e muda aqui.
//
// A fita é do ITEM BASE. Num item em modo vitrine (um card por opção) ela vai para TODOS os
// cards daquele item — "Combo" sobre cada combo, por exemplo. Fita por opção não existe.

export const SELOS = Object.freeze([
  { codigo: 'MAIS_PEDIDO', rotulo: 'Mais pedido' },
  { codigo: 'OFERTA', rotulo: 'Oferta' },
  { codigo: 'NOVO', rotulo: 'Novo' },
  { codigo: 'COMBO', rotulo: 'Combo' },
  { codigo: 'DESTAQUE', rotulo: 'Destaque' },
  { codigo: 'EXCLUSIVO', rotulo: 'Exclusivo' },
]);

export const CODIGOS = Object.freeze(SELOS.map((s) => s.codigo));

const arranjo = (v) => (Array.isArray(v) ? v : []);
const objeto = (v) => (v && typeof v === 'object' ? v : {});

export function rotuloDoSelo(codigo) {
  const s = SELOS.find((x) => x.codigo === codigo);
  return s ? s.rotulo : null;
}

// Rigor na ESCRITA: só um código da lista, ou "nada" (null / '' / undefined = tirar a
// fita). Qualquer outra coisa é recusada — sem normalizar caixa, sem aceitar rótulo no
// lugar do código: o admin manda o código que ele mesmo recebeu na lista.
export function validarSelo(bruto) {
  if (bruto === null || bruto === undefined || bruto === '') return { ok: true, selo: null };
  if (typeof bruto !== 'string') return { ok: false, codigo: 'SELO_INVALIDO' };
  if (!CODIGOS.includes(bruto)) return { ok: false, codigo: 'SELO_INVALIDO' };
  return { ok: true, selo: bruto };
}

// Linhas do banco → mapa `String(cwItemId)` → código. Tolerância na LEITURA: linha sem
// item ou com código que já não existe na lista é ignorada, nunca lança.
export function fitasPorItem(linhas) {
  const mapa = new Map();
  for (const bruta of arranjo(linhas)) {
    const l = objeto(bruta);
    if (l.cwItemId === null || l.cwItemId === undefined) continue;
    if (!CODIGOS.includes(l.selo)) continue;
    mapa.set(String(l.cwItemId), l.selo);
  }
  return mapa;
}

// Catálogo PROJETADO (com `produtos` por categoria) → o mesmo catálogo com `selos: [rótulo]`
// nos produtos cujo `origem.itemId` tem fita. ADITIVO e imutável: a entrada não é tocada,
// e produto sem fita sai sem a chave — o card já sabe desenhar sem lista.
export function aplicarFitas(catalogo, linhas) {
  const raiz = objeto(catalogo);
  const fitas = fitasPorItem(linhas);
  if (fitas.size === 0) return raiz;
  const categorias = arranjo(raiz.categorias).map((bruta) => {
    const categoria = objeto(bruta);
    const produtos = arranjo(categoria.produtos).map((p) => {
      const produto = objeto(p);
      const itemId = objeto(produto.origem).itemId;
      const selo = itemId === null || itemId === undefined ? null : fitas.get(String(itemId));
      return selo ? { ...produto, selos: [rotuloDoSelo(selo)] } : produto;
    });
    return { ...categoria, produtos };
  });
  return { ...raiz, categorias };
}

// Para a tela do admin: `{ [cwItemId]: código }` — a linha da tabela lê o seu pelo id.
export function fitasParaAdmin(linhas) {
  const saida = {};
  for (const [chave, selo] of fitasPorItem(linhas)) saida[chave] = selo;
  return saida;
}
