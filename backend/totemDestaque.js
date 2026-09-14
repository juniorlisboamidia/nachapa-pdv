// Totem › os produtos da ESTEIRA da tela de espera — módulo puro, testado em
// totemDestaque.test.js.
//
// A esteira é a metade de baixo da vitrine: duas fileiras de produtos passando, uma para
// cada lado. Este arquivo decide QUAIS produtos entram e em que ordem; o desenho é da tela.
//
// ── O CATÁLOGO AQUI É O PROJETADO, não o cru do Cardápio Web ──────────────────────────
// O totem não mostra o cardápio como ele vem: `projetarCatalogo` (totemApresentacao.js)
// EXPANDE grupos em produtos — um combo "ARTESANAIS 🍔" com três hambúrgueres dentro vira
// três cards, um por opção. Cada produto projetado tem um id de TEXTO:
//
//   item:12            → o item base
//   opcao:12:5:88      → a opção 88 do grupo 5, dentro do item 12
//
// É esse id que a esteira guarda. Guardar só o `cwItemId` numérico deixava metade do
// cardápio fora do alcance: os complementos que a loja mais quer destacar (a batata, o
// refrigerante, o hambúrguer artesanal dentro do combo) não são itens, são opções — e sem
// eles a loja não chegava aos doze.
//
// ── O BANCO GUARDA A CHAVE, E MAIS NADA ───────────────────────────────────────────────
// `TotemDestaque` tem `chave` e `ordem`. Nome, preço e foto NÃO são copiados para lá — eles
// vêm do catálogo projetado a cada bootstrap, e é aqui que os dois se encontram.
//
// Copiar seria criar uma SEGUNDA FONTE DE VERDADE sobre preço: a loja aumenta o X-Bacon no
// Cardápio Web e a esteira continua anunciando o preço velho no vidro, para quem passa na
// calçada. O totem inteiro evita isso, e a esteira não é exceção.
//
// ── PRODUTO QUE SAI DO CARDÁPIO SOME SOZINHO ──────────────────────────────────────────
// Nenhuma limpeza, nenhum job: a chave simplesmente não é encontrada e a linha não vira
// produto. No admin ele aparece MARCADO, com o que se sabe dele (a chave) e um botão de
// remover — sumir em silêncio na tela de configuração esconderia da loja que ela escolheu
// doze e só oito estão no ar.
//
// ── SEM FOTO NÃO ENTRA; EM FALTA TAMBÉM NÃO ───────────────────────────────────────────
// A esteira é apetite. Um retângulo vazio no meio de fotos de comida chama mais atenção do
// que as fotos, e chama pela razão errada. E anunciar no vidro um produto que o cliente não
// consegue pedir (status MISSING) é promessa que a loja não fez. O admin avisa os dois; o
// quiosque simplesmente pula.

/* Teto de escolhas.

   Doze é o que duas fileiras aguentam sem repetir na tela e sem esconder o resto: com seis
   por fileira num monitor em pé, o cliente vê o ciclo inteiro em poucos segundos. Acima
   disso a loja escolheria produtos que ninguém chegaria a ver — e escolher achando que
   aparece é pior do que não poder escolher. */
export const MAX_DESTAQUES = 12;

export const MOTIVO_IDS = 'IDS_INVALIDOS';
export const MOTIVO_LIMITE = 'LIMITE_EXCEDIDO';

/* A forma da chave, a mesma que `projetarCatalogo` produz. Inteiros sem sinal em cada
   posição: `opcao:12:5:88`. Qualquer outra coisa não é uma chave — é entrada torta. */
const CHAVE = /^(item:\d{1,12}|opcao:\d{1,12}:\d{1,12}:\d{1,12})$/;

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arranjo = (v) => (Array.isArray(v) ? v : []);
const round2 = (n) => Math.round(n * 100) / 100;

/* Chave de produto projetado, ou `null`. Aceita só a forma exata — sem aparar, sem caixa
   baixa: isto vem de um clique numa lista que o servidor montou, não de texto digitado. */
export function chaveDeProduto(valor) {
  return typeof valor === 'string' && CHAVE.test(valor) ? valor : null;
}

/* O catálogo PROJETADO achatado num mapa `chave → { nome, preco, imagem, categoria,
   emFalta }`.

   Um produto pode aparecer em mais de uma categoria; vale a PRIMEIRA, como no resto do
   totem — a alternativa seria o mesmo produto entrar duas vezes na esteira por acidente de
   catálogo. */
export function indexarCatalogo(catalogo) {
  const mapa = new Map();
  for (const bruta of arranjo(objeto(catalogo).categorias)) {
    for (const cru of arranjo(objeto(bruta).itens)) {
      const p = objeto(cru);
      const chave = chaveDeProduto(p.id);
      if (chave === null || mapa.has(chave)) continue;
      const preco = Number(p.preco);
      mapa.set(chave, {
        nome: typeof p.nome === 'string' ? p.nome : null,
        preco: Number.isFinite(preco) ? round2(preco) : null,
        imagem: typeof p.imagem === 'string' && p.imagem ? p.imagem : null,
        categoria: typeof objeto(bruta).nome === 'string' ? objeto(bruta).nome : null,
        emFalta: p.status === 'MISSING',
      });
    }
  }
  return mapa;
}

/* As linhas guardadas, na ordem em que a loja as pôs.

   Desempate pela chave e não pela ordem de chegada do banco: sem um segundo critério,
   duas linhas com a mesma `ordem` trocariam de lugar entre um bootstrap e outro e a
   esteira mudaria de arrumação sem ninguém pedir. */
function ordenadas(linhas) {
  return arranjo(linhas)
    .map((l) => ({ chave: chaveDeProduto(objeto(l).chave), ordem: Number(objeto(l).ordem) || 0 }))
    .filter((l) => l.chave !== null)
    .sort((a, b) => (a.ordem - b.ordem) || a.chave.localeCompare(b.chave));
}

/* O que o QUIOSQUE recebe: só o que dá para desenhar E pedir.

   Fora ficam o órfão (saiu do cardápio), o sem foto e o em falta. Nenhum dos três é erro —
   são estados normais de um cardápio que muda —, e por isso a resposta é uma lista mais
   curta, nunca uma falha. Lista vazia é resposta válida: a vitrine desenha a metade de cima
   e pronto. */
export function destaquesPublicos(catalogo, linhas, teto = MAX_DESTAQUES) {
  const mapa = indexarCatalogo(catalogo);
  const limite = Number.isSafeInteger(teto) && teto > 0 ? teto : MAX_DESTAQUES;
  const fora = [];
  for (const l of ordenadas(linhas)) {
    const p = mapa.get(l.chave);
    if (!p || !p.imagem || p.emFalta) continue;
    fora.push({ id: l.chave, nome: p.nome, preco: p.preco, imagem: p.imagem });
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
    const p = mapa.get(l.chave) ?? null;
    return {
      chave: l.chave,
      posicao: i + 1,
      nome: p?.nome ?? null,
      preco: p?.preco ?? null,
      imagem: p?.imagem ?? null,
      categoria: p?.categoria ?? null,
      // Os três motivos de um escolhido não aparecer no vidro, separados porque as saídas
      // são diferentes: órfão se resolve removendo; sem foto e em falta, no Cardápio Web.
      orfao: p === null,
      semFoto: p !== null && !p.imagem,
      emFalta: p !== null && p.emFalta,
    };
  });
}

/* O catálogo inteiro para a tela de escolha, achatado e ordenado por nome.

   Vai completo, com foto ou sem, em falta ou não: esconder faria a loja procurar um produto
   que está no cardápio e não achar na lista, sem entender por quê. Ele aparece marcado. */
export function catalogoParaEscolha(catalogo) {
  const fora = [];
  for (const [chave, p] of indexarCatalogo(catalogo)) {
    fora.push({ chave, nome: p.nome, preco: p.preco, imagem: p.imagem, categoria: p.categoria, emFalta: p.emFalta });
  }
  return fora.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
}

/* ENTRADA DO ADMIN — rigor.

   A lista inteira, na ordem: o PUT substitui a escolha, não a emenda. Devolve
   `{ ok, chaves, erros }` com as chaves já validadas e sem repetição.

   Lista VAZIA é válida — é como a loja desliga a esteira. Repetido não é erro: a segunda
   ocorrência é ignorada, porque a intenção ("quero este produto") é inequívoca e recusar o
   envio inteiro por causa de um clique duplo seria hostil. Chave torta É erro: ali a
   intenção não dá para adivinhar. */
export function validarChaves(bruto, teto = MAX_DESTAQUES) {
  if (!Array.isArray(bruto)) return { ok: false, chaves: [], erros: [{ chave: 'chaves', motivo: MOTIVO_IDS }] };
  const limite = Number.isSafeInteger(teto) && teto > 0 ? teto : MAX_DESTAQUES;
  const chaves = [];
  const erros = [];
  const vistos = new Set();
  for (const v of bruto) {
    const chave = chaveDeProduto(v);
    if (chave === null) { erros.push({ chave: String(v), motivo: MOTIVO_IDS }); continue; }
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    chaves.push(chave);
  }
  if (chaves.length > limite) erros.push({ chave: 'chaves', motivo: MOTIVO_LIMITE });
  return { ok: erros.length === 0, chaves, erros };
}

/* As chaves viram linhas para gravar, com a ordem saindo da POSIÇÃO na lista.

   A ordem não vem do cliente: ele manda a sequência, e a sequência É a ordem. Aceitar um
   número de ordem enviado pelo browser abriria espaço para dois destaques com a mesma
   posição, e aí a esteira decidiria por desempate em vez de por escolha. */
export function linhasParaGravar(empresaId, chaves) {
  return arranjo(chaves).map((chave, i) => ({ empresaId, chave, ordem: i }));
}
