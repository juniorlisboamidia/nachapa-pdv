// Totem › nome de exibição das CATEGORIAS — módulo puro, testado em
// totemCategoria.test.js.
//
// Por que existe: o nome da categoria é cadastrado no Cardápio Web pensando no
// cardápio digital, onde o emoji ajuda a varrer a lista com o polegar. No totem,
// numa coluna estreita e vertical, o mesmo emoji come caractere de um nome que
// já é curto — e nomes longos ("🏆COMBOS DO HAMBURGÃO | PRA 1, 2 OU MAIS") não
// cabem de jeito nenhum.
//
// O que este módulo NÃO faz: mexer em ordem, em itens, em disponibilidade ou em
// qualquer coisa que o CW decide. Ele troca UMA string, a que o cliente lê.
//
// Guarda exceção, como a Camada de Apresentação: categoria sem apelido mostra o
// nome do CW como ele vem. Apagar o apelido é apagar a linha.

const lista = (v) => (Array.isArray(v) ? v : []);
const texto = (v) => (typeof v === 'string' ? v : '');

// Emoji, símbolos e a pontuação decorativa que costuma vir grudada neles.
// `\p{Extended_Pictographic}` cobre a família inteira de emoji sem lista fixa;
// os seletores de variação e o ZWJ vêm junto porque um emoji composto (bandeira,
// profissão) é uma sequência, não um caractere.
const PICTORICOS = /[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;

// Sugestão para o admin preencher o campo — NUNCA aplicada sozinha.
// A regra é conservadora: tira os pictóricos, colapsa o espaço que sobrou e
// apara pontuação solta nas pontas. Se o resultado ficar vazio ou com menos de
// dois caracteres, devolve o nome original: um nome que era só um emoji continua
// sendo o nome que a loja cadastrou, e sumir com ele seria pior que mantê-lo.
export function sugerirNome(nome) {
  const bruto = texto(nome);
  const semEmoji = bruto.replace(PICTORICOS, ' ');
  const limpo = semEmoji
    .replace(/\s+/g, ' ')
    .replace(/^[\s|\-–—·•/,.:;]+/, '')
    .replace(/[\s|\-–—·•/,.:;]+$/, '')
    .trim();
  return limpo.length >= 2 ? limpo : bruto.trim();
}

// A configuração salva, indexada por id de categoria (em string, como o resto
// do fluxo compara id).
function indice(configuracoes) {
  const mapa = new Map();
  for (const c of lista(configuracoes)) {
    const id = c?.cwCategoriaId;
    if (id === null || id === undefined) continue;
    const nome = texto(c?.nomeExibido).trim();
    if (!nome) continue; // linha sem nome não é apelido; é lixo
    mapa.set(String(id), nome);
  }
  return mapa;
}

// Bootstrap: acrescenta `nomeExibido` a cada categoria. ADITIVO de propósito —
// `nome` continua sendo o do CW, para o admin poder mostrar os dois lados e para
// um totem antigo (sem esta versão) seguir desenhando o que sempre desenhou.
export function aplicarNomes(catalogo, configuracoes) {
  const cat = catalogo && typeof catalogo === 'object' ? catalogo : null;
  if (!cat || !Array.isArray(cat.categorias)) return catalogo;
  const mapa = indice(configuracoes);
  if (!mapa.size) return catalogo;
  return {
    ...cat,
    categorias: cat.categorias.map((c) => {
      const apelido = mapa.get(String(c?.id));
      return apelido ? { ...c, nomeExibido: apelido } : c;
    }),
  };
}

// Lista da tela do admin: uma linha por categoria do CW, com o nome de lá, o
// apelido salvo (quando existe) e a sugestão. A sugestão é mostrada como
// sugestão — quem decide é quem está na tela.
export function mesclarAdmin(catalogo, configuracoes) {
  const mapa = indice(configuracoes);
  return lista(catalogo?.categorias).map((c) => {
    const nomeCw = texto(c?.nome);
    const apelido = mapa.get(String(c?.id)) ?? null;
    const sugestao = sugerirNome(nomeCw);
    return {
      cwCategoriaId: c?.id ?? null,
      nomeCw,
      nomeExibido: apelido,
      sugestao,
      // A sugestão só interessa quando muda alguma coisa.
      temSugestao: sugestao !== nomeCw,
      itens: lista(c?.itens).length,
    };
  });
}

// O que a tela do totem mostra. Fora do bootstrap também — carrinho, revisão e
// qualquer lugar que cite categoria passam por aqui.
export function nomeDaCategoria(categoria) {
  const apelido = texto(categoria?.nomeExibido).trim();
  return apelido || texto(categoria?.nome);
}
