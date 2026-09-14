// Totem › os produtos das ESTEIRAS da tela de espera — módulo puro, testado em
// totemDestaque.test.js.
//
// A metade de baixo da vitrine tem DUAS esteiras: a superior anda para a direita, a inferior
// para a esquerda, e cada uma tem a sua lista. Não se misturam — a loja decide o que passa
// em cada uma, e em que ordem. Este arquivo decide QUAIS produtos entram; o desenho é da
// tela.
//
// ── O CATÁLOGO AQUI É O PROJETADO, e os produtos estão em `produtos` ─────────────────
// O totem não mostra o cardápio como ele vem: `projetarCatalogo` (totemApresentacao.js)
// EXPANDE grupos em produtos — um combo "ARTESANAIS 🍔" com três hambúrgueres dentro vira
// três cards, um por opção. Cada categoria projetada carrega `produtos` (o resultado) ao
// lado de `itens` (o cru, por referência). É `produtos` que este módulo lê — ler `itens`
// devolve os ids numéricos crus, que não são chaves, e a lista sai vazia. Foi um bug real.
//
// Cada produto projetado tem um id de TEXTO:
//
//   item:12            → o item base
//   opcao:12:5:88      → a opção 88 do grupo 5, dentro do item 12
//
// É esse id que as esteiras guardam. Guardar só o `cwItemId` numérico deixava metade do
// cardápio fora do alcance: os complementos que a loja mais quer destacar não são itens, são
// opções.
//
// ── O BANCO GUARDA CHAVE, ESTEIRA E ORDEM — E MAIS NADA ───────────────────────────────
// Nome, preço e foto NÃO são copiados para lá — vêm do catálogo projetado a cada bootstrap.
// Copiar seria criar uma SEGUNDA FONTE DE VERDADE sobre preço: a loja aumenta o X-Bacon no
// Cardápio Web e a esteira continua anunciando o preço velho no vidro.
//
// ── PRODUTO QUE SAI DO CARDÁPIO SOME SOZINHO ──────────────────────────────────────────
// Nenhuma limpeza: a chave não é encontrada e a linha não vira produto. No admin aparece
// MARCADO, com botão de remover — sumir em silêncio esconderia da loja que ela escolheu
// dez e só oito estão no ar.
//
// ── SEM FOTO NÃO ENTRA; EM FALTA TAMBÉM NÃO ───────────────────────────────────────────
// A esteira é apetite. Retângulo vazio no meio de fotos de comida chama atenção pela razão
// errada; produto que o cliente não consegue pedir (MISSING) é promessa que a loja não fez.

/* As duas esteiras. A ordem aqui é a ordem na tela, de cima para baixo. */
export const ESTEIRAS = Object.freeze(['SUPERIOR', 'INFERIOR']);
export const ESTEIRA_PADRAO = 'SUPERIOR';

/* Teto POR ESTEIRA. Dez numa fileira de cards de 30vw é o que passa inteiro na frente do
   cliente em cerca de um minuto; acima disso a loja escolheria produtos que ninguém
   chegaria a ver. O total (20) é derivado — nunca um número solto. */
export const MAX_POR_ESTEIRA = 10;
export const MAX_DESTAQUES = MAX_POR_ESTEIRA * ESTEIRAS.length;

export const MOTIVO_IDS = 'IDS_INVALIDOS';
export const MOTIVO_LIMITE = 'LIMITE_EXCEDIDO';

const CHAVE = /^(item:\d{1,12}|opcao:\d{1,12}:\d{1,12}:\d{1,12})$/;

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arranjo = (v) => (Array.isArray(v) ? v : []);
const round2 = (n) => Math.round(n * 100) / 100;
// A chave da resposta é a esteira em minúsculas: é a língua da tela ("esteira superior"),
// e JSON com `SUPERIOR` gritando no meio de `nome`/`preco` destoa sem ganhar nada.
const slot = (esteira) => esteira.toLowerCase();

/* Chave de produto projetado, ou `null`. Só a forma exata — sem aparar, sem caixa baixa:
   vem de um clique numa lista que o servidor montou, não de texto digitado. */
export function chaveDeProduto(valor) {
  return typeof valor === 'string' && CHAVE.test(valor) ? valor : null;
}

/* Esteira válida, ou `null`. Mesma régua da posição das categorias: seletor com duas
   opções, sem normalizar caixa. */
export function normalizarEsteira(valor) {
  return ESTEIRAS.includes(valor) ? valor : null;
}

/* O catálogo PROJETADO achatado num mapa `chave → { nome, preco, imagem, categoria,
   emFalta }`. Lê `produtos`, e não `itens` — ver o cabeçalho. Um produto pode aparecer em
   mais de uma categoria; vale a PRIMEIRA, como no resto do totem. */
export function indexarCatalogo(catalogo) {
  const mapa = new Map();
  for (const bruta of arranjo(objeto(catalogo).categorias)) {
    const categoria = objeto(bruta);
    for (const cru of arranjo(categoria.produtos)) {
      const p = objeto(cru);
      const chave = chaveDeProduto(p.id);
      if (chave === null || mapa.has(chave)) continue;
      const preco = Number(p.preco);
      mapa.set(chave, {
        nome: typeof p.nome === 'string' ? p.nome : null,
        preco: Number.isFinite(preco) ? round2(preco) : null,
        imagem: typeof p.imagem === 'string' && p.imagem ? p.imagem : null,
        categoria: typeof categoria.nome === 'string' ? categoria.nome : null,
        emFalta: p.status === 'MISSING',
      });
    }
  }
  return mapa;
}

/* As linhas guardadas, separadas por esteira e na ordem em que a loja as pôs. Esteira
   torta cai na padrão; desempate pela chave para a arrumação não mudar entre bootstraps. */
function porEsteira(linhas) {
  const saida = Object.fromEntries(ESTEIRAS.map((e) => [e, []]));
  for (const cru of arranjo(linhas)) {
    const l = objeto(cru);
    const chave = chaveDeProduto(l.chave);
    if (chave === null) continue;
    const esteira = normalizarEsteira(l.esteira) ?? ESTEIRA_PADRAO;
    saida[esteira].push({ chave, ordem: Number(l.ordem) || 0 });
  }
  for (const e of ESTEIRAS) saida[e].sort((a, b) => (a.ordem - b.ordem) || a.chave.localeCompare(b.chave));
  return saida;
}

/* O que o QUIOSQUE recebe: `{ superior: [...], inferior: [...] }`, só com o que dá para
   desenhar E pedir. Fora ficam órfão, sem foto e em falta — estados normais de um cardápio
   que muda, nunca uma falha. Esteira vazia é resposta válida. */
export function destaquesPublicos(catalogo, linhas, teto = MAX_POR_ESTEIRA) {
  const mapa = indexarCatalogo(catalogo);
  const limite = Number.isSafeInteger(teto) && teto > 0 ? teto : MAX_POR_ESTEIRA;
  const separadas = porEsteira(linhas);
  const fora = {};
  for (const e of ESTEIRAS) {
    const lista = [];
    for (const l of separadas[e]) {
      const p = mapa.get(l.chave);
      if (!p || !p.imagem || p.emFalta) continue;
      lista.push({ id: l.chave, nome: p.nome, preco: p.preco, imagem: p.imagem });
      if (lista.length >= limite) break;
    }
    fora[slot(e)] = lista;
  }
  return fora;
}

/* O que o ADMIN recebe: TODOS, marcados — o oposto da regra do quiosque, de propósito. */
export function destaquesParaAdmin(catalogo, linhas) {
  const mapa = indexarCatalogo(catalogo);
  const separadas = porEsteira(linhas);
  const fora = {};
  for (const e of ESTEIRAS) {
    fora[slot(e)] = separadas[e].map((l, i) => {
      const p = mapa.get(l.chave) ?? null;
      return {
        chave: l.chave,
        posicao: i + 1,
        nome: p?.nome ?? null,
        preco: p?.preco ?? null,
        imagem: p?.imagem ?? null,
        categoria: p?.categoria ?? null,
        orfao: p === null,
        semFoto: p !== null && !p.imagem,
        emFalta: p !== null && p.emFalta,
      };
    });
  }
  return fora;
}

/* O catálogo inteiro para a tela de escolha, achatado e ordenado por nome. Vai completo,
   com foto ou sem, em falta ou não — esconder faria a loja procurar um produto que está no
   cardápio e não achar, sem entender por quê. */
export function catalogoParaEscolha(catalogo) {
  const fora = [];
  for (const [chave, p] of indexarCatalogo(catalogo)) {
    fora.push({ chave, nome: p.nome, preco: p.preco, imagem: p.imagem, categoria: p.categoria, emFalta: p.emFalta });
  }
  return fora.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
}

/* ENTRADA DO ADMIN — rigor. O corpo é `{ superior: [...], inferior: [...] }`, cada lista na
   ordem final: o PUT substitui a escolha, não a emenda.

   Devolve `{ ok, esteiras: { SUPERIOR: [], INFERIOR: [] }, erros }`.

   Um produto NÃO fica nas duas: se vier repetido entre esteiras, vale a primeira em que
   apareceu (a ordem de ESTEIRAS). Repetido dentro da mesma esteira é ignorado — clique
   duplo não é erro. Chave torta É erro. Lista ausente vale vazia: mandar só `superior`
   desliga a inferior, o que é o esperado de um PUT que substitui. */
export function validarEsteiras(bruto, teto = MAX_POR_ESTEIRA) {
  const vazio = Object.fromEntries(ESTEIRAS.map((e) => [e, []]));
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { ok: false, esteiras: vazio, erros: [{ chave: 'esteiras', motivo: MOTIVO_IDS }] };
  }
  const limite = Number.isSafeInteger(teto) && teto > 0 ? teto : MAX_POR_ESTEIRA;
  const esteiras = Object.fromEntries(ESTEIRAS.map((e) => [e, []]));
  const erros = [];
  const vistos = new Set();
  for (const e of ESTEIRAS) {
    const lista = bruto[slot(e)];
    if (lista === undefined || lista === null) continue;
    if (!Array.isArray(lista)) { erros.push({ chave: slot(e), motivo: MOTIVO_IDS }); continue; }
    for (const v of lista) {
      const chave = chaveDeProduto(v);
      if (chave === null) { erros.push({ chave: String(v), motivo: MOTIVO_IDS }); continue; }
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      esteiras[e].push(chave);
    }
    if (esteiras[e].length > limite) erros.push({ chave: slot(e), motivo: MOTIVO_LIMITE });
  }
  return { ok: erros.length === 0, esteiras, erros };
}

/* As esteiras viram linhas para gravar, com a ordem saindo da POSIÇÃO em cada lista. A
   ordem não vem do cliente: ele manda a sequência, e a sequência É a ordem. */
export function linhasParaGravar(empresaId, esteiras) {
  const fora = [];
  for (const e of ESTEIRAS) {
    arranjo(objeto(esteiras)[e]).forEach((chave, i) => fora.push({ empresaId, chave, esteira: e, ordem: i }));
  }
  return fora;
}
