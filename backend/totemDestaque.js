// Totem › os produtos da ESTEIRA da tela de espera — módulo puro, testado em
// totemDestaque.test.js.
//
// A esteira é a metade de baixo da vitrine: duas fileiras de produtos passando, uma para
// cada lado. Este arquivo decide QUAIS produtos entram e em que ordem; o desenho é da tela.
//
// ── O BANCO GUARDA ID, E MAIS NADA ────────────────────────────────────────────────────
// `TotemDestaque` tem `cwItemId` e `ordem`. Nome, preço e foto NÃO são copiados para lá —
// eles vêm do catálogo vivo a cada bootstrap, e é aqui que os dois se encontram.
//
// Copiar seria criar uma SEGUNDA FONTE DE VERDADE sobre preço: a loja aumenta o X-Bacon no
// Cardápio Web e a esteira continua anunciando o preço velho no vidro, para quem passa na
// calçada. O totem inteiro evita isso, e a esteira não é exceção.
//
// ── ITEM QUE SAI DO CARDÁPIO SOME SOZINHO ─────────────────────────────────────────────
// Nenhuma limpeza, nenhum job: o id simplesmente não é encontrado no catálogo e a linha não
// vira produto. No admin ele aparece MARCADO, com o que se sabe dele (o id) e um botão de
// remover — sumir em silêncio na tela de configuração esconderia da loja que ela escolheu
// doze e só oito estão no ar.
//
// ── SEM FOTO NÃO ENTRA ────────────────────────────────────────────────────────────────
// A esteira é apetite. Um retângulo vazio no meio de fotos de comida chama mais atenção do
// que as fotos, e chama pela razão errada. O admin avisa; o quiosque simplesmente pula.

/* Teto de escolhas.

   Doze é o que duas fileiras aguentam sem repetir na tela e sem esconder o resto: com seis
   por fileira num monitor em pé, o cliente vê o ciclo inteiro em poucos segundos. Acima
   disso a loja escolheria produtos que ninguém chegaria a ver — e escolher achando que
   aparece é pior do que não poder escolher. */
export const MAX_DESTAQUES = 12;

export const MOTIVO_IDS = 'IDS_INVALIDOS';
export const MOTIVO_LIMITE = 'LIMITE_EXCEDIDO';

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arranjo = (v) => (Array.isArray(v) ? v : []);
const round2 = (n) => Math.round(n * 100) / 100;

/* Id de item do Cardápio Web, ou `null`.

   Inteiro SEGURO e positivo, sem arredondar: `12.7` não é um id, e transformá-lo em `13`
   gravaria o destaque em cima de OUTRO produto sem ninguém perceber. É a mesma régua que a
   rota de apresentação já aplica. */
export function idDeItem(valor) {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/* O catálogo vivo achatado num mapa `id → { nome, preco, imagem }`.

   Um item pode aparecer em mais de uma categoria; vale a PRIMEIRA, como no resto do totem
   — a alternativa seria o mesmo produto entrar duas vezes na esteira por acidente de
   catálogo. */
export function indexarCatalogo(catalogo) {
  const mapa = new Map();
  for (const bruta of arranjo(objeto(catalogo).categorias)) {
    for (const cru of arranjo(objeto(bruta).itens)) {
      const item = objeto(cru);
      const id = idDeItem(item.id);
      if (id === null || mapa.has(id)) continue;
      const preco = Number(item.preco);
      mapa.set(id, {
        nome: typeof item.nome === 'string' ? item.nome : null,
        preco: Number.isFinite(preco) ? round2(preco) : null,
        imagem: typeof item.imagem === 'string' && item.imagem ? item.imagem : null,
        categoria: typeof objeto(bruta).nome === 'string' ? objeto(bruta).nome : null,
      });
    }
  }
  return mapa;
}

/* As linhas guardadas, na ordem em que a loja as pôs.

   Desempate por `cwItemId` e não pela ordem de chegada do banco: sem um segundo critério,
   duas linhas com a mesma `ordem` trocariam de lugar entre um bootstrap e outro e a
   esteira mudaria de arrumação sem ninguém pedir. */
function ordenadas(linhas) {
  return arranjo(linhas)
    .map((l) => ({ cwItemId: idDeItem(objeto(l).cwItemId), ordem: Number(objeto(l).ordem) || 0 }))
    .filter((l) => l.cwItemId !== null)
    .sort((a, b) => (a.ordem - b.ordem) || (a.cwItemId - b.cwItemId));
}

/* O que o QUIOSQUE recebe: só o que dá para desenhar.

   Fora ficam o órfão (item que saiu do cardápio) e o sem foto. Nenhum dos dois é erro — os
   dois são estados normais de um cardápio que muda —, e por isso a resposta é uma lista
   mais curta, nunca uma falha. Lista vazia é resposta válida: a vitrine desenha a metade de
   cima e pronto. */
export function destaquesPublicos(catalogo, linhas, teto = MAX_DESTAQUES) {
  const mapa = indexarCatalogo(catalogo);
  const limite = Number.isSafeInteger(teto) && teto > 0 ? teto : MAX_DESTAQUES;
  const fora = [];
  for (const l of ordenadas(linhas)) {
    const item = mapa.get(l.cwItemId);
    if (!item || !item.imagem) continue;
    fora.push({ id: l.cwItemId, nome: item.nome, preco: item.preco, imagem: item.imagem });
    if (fora.length >= limite) break;
  }
  return fora;
}

/* O que o ADMIN recebe: TODOS, inclusive os que o quiosque vai pular, marcados.

   É o oposto da regra do quiosque, e de propósito: lá o silêncio é o certo, aqui ele
   esconderia da loja que ela escolheu doze e só oito estão no ar. */
export function destaquesParaAdmin(catalogo, linhas) {
  const mapa = indexarCatalogo(catalogo);
  return ordenadas(linhas).map((l, i) => {
    const item = mapa.get(l.cwItemId) ?? null;
    return {
      cwItemId: l.cwItemId,
      posicao: i + 1,
      nome: item?.nome ?? null,
      preco: item?.preco ?? null,
      imagem: item?.imagem ?? null,
      categoria: item?.categoria ?? null,
      // Os dois motivos de um escolhido não aparecer no vidro, separados porque as saídas
      // são diferentes: órfão se resolve removendo, sem foto se resolve no Cardápio Web.
      orfao: item === null,
      semFoto: item !== null && !item.imagem,
    };
  });
}

/* O catálogo inteiro para a tela de escolha, achatado e ordenado por nome.

   Vai completo, com foto ou sem: esconder o sem-foto faria a loja procurar um produto que
   está no cardápio e não achar na lista, sem entender por quê. Ele aparece marcado. */
export function catalogoParaEscolha(catalogo) {
  const fora = [];
  for (const [id, item] of indexarCatalogo(catalogo)) {
    fora.push({ cwItemId: id, nome: item.nome, preco: item.preco, imagem: item.imagem, categoria: item.categoria });
  }
  return fora.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
}

/* ENTRADA DO ADMIN — rigor.

   A lista inteira, na ordem: o PUT substitui a escolha, não a emenda. Devolve
   `{ ok, ids, erros }` com os ids já normalizados e sem repetição.

   Lista VAZIA é válida — é como a loja desliga a esteira. Repetido não é erro: a segunda
   ocorrência é ignorada, porque a intenção ("quero este produto") é inequívoca e recusar o
   envio inteiro por causa de um clique duplo seria hostil. Id torto É erro: ali a intenção
   não dá para adivinhar. */
export function validarIds(bruto, teto = MAX_DESTAQUES) {
  if (!Array.isArray(bruto)) return { ok: false, ids: [], erros: [{ chave: 'ids', motivo: MOTIVO_IDS }] };
  const limite = Number.isSafeInteger(teto) && teto > 0 ? teto : MAX_DESTAQUES;
  const ids = [];
  const erros = [];
  const vistos = new Set();
  for (const bruto1 of bruto) {
    const id = idDeItem(bruto1);
    if (id === null) { erros.push({ chave: String(bruto1), motivo: MOTIVO_IDS }); continue; }
    if (vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  if (ids.length > limite) erros.push({ chave: 'ids', motivo: MOTIVO_LIMITE });
  return { ok: erros.length === 0, ids, erros };
}

/* Os ids viram linhas para gravar, com a ordem saindo da POSIÇÃO na lista.

   A ordem não vem do cliente: ele manda a sequência, e a sequência É a ordem. Aceitar um
   número de ordem enviado pelo browser abriria espaço para dois destaques com a mesma
   posição, e aí a esteira decidiria por desempate em vez de por escolha. */
export function linhasParaGravar(empresaId, ids) {
  return arranjo(ids).map((cwItemId, i) => ({ empresaId, cwItemId, ordem: i }));
}
