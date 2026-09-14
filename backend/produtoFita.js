// A FITA do produto — módulo puro, NEUTRO de canal (sem Prisma, sem Express, sem rede).
//
// A fita é o selo do produto ("Mais pedido", "Novidade"…): a faixa diagonal no canto do card
// no totem, e a etiqueta sobre a foto no Menu Board da TV. O Cardápio Web não tem esse dado,
// e por isso ele mora no PDV, uma linha por (empresa, item do CW).
//
// ── POR QUE NEUTRO, E NÃO DO TOTEM ────────────────────────────────────────────────────
// Nasceu como `totemFita.js` e mudou de nome quando a TV Indoor precisou da mesma marcação.
// A razão é de produto, não de arquitetura: marcar "Mais pedido" é uma decisão sobre o
// PRODUTO da loja, não sobre um canal. O gestor marca uma vez e aparece nos dois — pedir o
// mesmo cadastro duas vezes seria inventar trabalho. Por isso a tabela também se chama
// `ProdutoFita`: canais IRMÃOS podem dividir catálogo; o que eles não dividem é apresentação.
//
// O catálogo é o MESMO das fitas do HUB (frontend/src/pages/marketing/fitas.js, espelho de
// backend/marketing/fitas.js lá): os mesmos cinco códigos, os mesmos textos e as mesmas
// cores — a fita que a loja conhece do Banner é a que aparece no totem. Copiado por valor,
// de propósito: o Totem não importa nada do HUB (domínio independente). Mudou lá, muda aqui.
//
// Lista FECHADA, e não texto livre: o vidro do totem não é lugar para "PROMOÇÃO
// IMPERDÍVEL!!!" de trinta letras. O banco guarda o CÓDIGO; texto e cor que o cliente vê
// vêm daqui.
//
// A fita é do ITEM BASE. Num item em modo vitrine (um card por opção) ela vai para TODOS os
// cards daquele item. Fita por opção não existe.
//
// `aplicarFitas` abaixo é do TOTEM (trabalha sobre o catálogo projetado, com `produtos`); a
// TV usa `fitasPorItem` direto, contra o catálogo cru. As duas leem o MESMO dado.

export const SELOS = Object.freeze([
  { codigo: 'MAIS_PEDIDO', rotulo: 'Mais pedido', cor: '#B45309' },
  { codigo: 'RECOMENDADO', rotulo: 'Recomendado', cor: '#1D4ED8' },
  { codigo: 'NOVIDADE', rotulo: 'Novidade', cor: '#ff5f00' },
  { codigo: 'EDICAO_LIMITADA', rotulo: 'Edição limitada', cor: '#BE185D' },
  { codigo: 'OFERTA', rotulo: 'Oferta', cor: '#15803D' },
]);

export const CODIGOS = Object.freeze(SELOS.map((s) => s.codigo));

const arranjo = (v) => (Array.isArray(v) ? v : []);
const objeto = (v) => (v && typeof v === 'object' ? v : {});

// O que o CARD recebe: `{ texto, cor }` resolvidos — o quiosque não conhece códigos.
export function fitaDoSelo(codigo) {
  const s = SELOS.find((x) => x.codigo === codigo);
  return s ? { texto: s.rotulo, cor: s.cor } : null;
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

// Catálogo PROJETADO (com `produtos` por categoria) → o mesmo catálogo com
// `fita: { texto, cor }` nos produtos cujo `origem.itemId` tem fita. ADITIVO e imutável: a
// entrada não é tocada, e produto sem fita sai sem a chave — o card já sabe desenhar sem.
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
      return selo ? { ...produto, fita: fitaDoSelo(selo) } : produto;
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
