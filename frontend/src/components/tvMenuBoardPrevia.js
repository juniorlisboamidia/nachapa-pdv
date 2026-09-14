// A PRÉVIA do menu board no editor — módulo puro, testado em tvMenuBoardPrevia.test.js.
//
// ── POR QUE ISTO EXISTE, EM VEZ DE PEDIR A PRÉVIA AO SERVIDOR ─────────────────────────
// A rota `/menu-boards/:id/previa` resolve um board JÁ SALVO. No editor o gestor está
// montando: ele marca um produto, desmarca outro, troca a ordem — e precisa ver o efeito no
// mesmo instante. Uma ida ao servidor por clique deixaria a tela lenta justamente no
// momento em que ela precisa ser fluida, e o catálogo inteiro já está aqui.
//
// ── E POR QUE ISSO NÃO É DUPLICAR REGRA DE NEGÓCIO ───────────────────────────────────
// Porque a duplicação é PROVADA. `tvMenuBoardPrevia.test.js` roda os mesmos casos contra
// esta função e contra a `produtoParaTv` do servidor (`backend/tvMenuBoard.js`), e falha se
// as duas divergirem em qualquer um deles. É o mesmo arranjo de `totemBanners.js`, que
// duplica a régua de elegibilidade do backend presa por teste.
//
// O que MANDA continua sendo o servidor: é ele que resolve o board que a TV recebe. Isto
// aqui é a prévia, e ela só vale enquanto o gestor não salvou.

/* Um item do catálogo (como `GET /tv-indoor/catalogo` o entrega) → o produto que o
   componente do player desenha.

   PREÇO: `precoPromocional` é o preço ATUAL e `preco` vira o ANTERIOR. O percentual sai só
   desses dois valores e some quando o par não forma oferta. Nenhuma promoção é inventada, e
   nada é recalculado por outra régua — a mesma frase do lado do servidor, de propósito. */
export function produtoDaPrevia(item, selos) {
  const temPromo = typeof item?.precoPromocional === 'number'
  const de = Number(item?.preco)
  const por = temPromo ? Number(item.precoPromocional) : de
  const oferta = temPromo && Number.isFinite(de) && Number.isFinite(por) && de > 0 && por >= 0 && por < de
  const selo = item?.selo ? (selos ?? []).find((s) => s.codigo === item.selo) : null
  return {
    id: String(item?.id),
    nome: item?.nome ?? null,
    descricao: item?.descricao ?? null,
    imagemUrl: item?.imagem ?? null,
    preco: Number.isFinite(por) ? por : null,
    ...(oferta ? { precoAnterior: de, descontoPercentual: Math.round((1 - por / de) * 100) } : {}),
    ...(selo ? { selo: { texto: selo.rotulo, cor: selo.cor } } : {}),
  }
}

/* Está disponível para aparecer? Indisponível não entra — no V1 a TV não mostra card cinza
   de "em falta". `status` ausente conta como disponível, como no servidor. */
export const disponivelNaPrevia = (item) => {
  const s = item?.status
  return s === undefined || s === null || s === 'ACTIVE'
}

/* A prévia inteira, no formato que `components/tv/MenuBoard` desenha — o MESMO objeto que
   o servidor entrega à TV.

   `escolhidos` é a seleção do editor (`[{ cwItemId, destaque? }]`), `porId` é o catálogo
   indexado por `String(id)`. Produto que sumiu do catálogo, ou que está indisponível, não
   entra: é exatamente o que a parede faria. */
export function previaDoBoard({ layout, titulo, escolhidos, porId, selos }) {
  const lista = Array.isArray(escolhidos) ? escolhidos : []
  const produtos = []
  let destaqueId = null
  for (const escolha of lista) {
    const item = porId?.get?.(String(escolha?.cwItemId))
    if (!item || !disponivelNaPrevia(item)) continue
    const p = produtoDaPrevia(item, selos)
    if (escolha?.destaque === true && layout === 'DESTAQUE') destaqueId = p.id
    produtos.push(p)
  }
  // Sem escolha explícita, o destaque é o primeiro disponível — a mesma regra do servidor,
  // e a razão é a mesma: um layout de destaque sem destaque abriria um buraco na tela.
  if (layout === 'DESTAQUE' && !destaqueId && produtos.length) destaqueId = produtos[0].id
  return { layout, titulo: titulo || null, produtos, ...(destaqueId ? { destaqueId } : {}) }
}
