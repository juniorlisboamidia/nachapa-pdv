// TV Indoor › MENU BOARD — módulo puro do domínio (sem Prisma, sem Express, sem rede).
//
// O menu board é o segundo tipo de item da programação: em vez de uma arte, uma tela montada
// com o CATÁLOGO REAL da loja. Preço nunca é digitado aqui — muda no Cardápio Web, muda na
// parede no próximo refresh.
//
// ── O QUE FICA GUARDADO E O QUE NÃO FICA ──────────────────────────────────────────────
// Guarda-se REFERÊNCIA e ESCOLHA: qual categoria, quais itens, em que ordem, qual é o
// destaque. Nunca nome, preço, foto, promoção ou disponibilidade — esses são do catálogo, e
// uma cópia deles aqui seria uma segunda fonte de verdade sobre dinheiro, que é exatamente o
// que o resto do PDV evita.
//
// ── IDs DO CW ─────────────────────────────────────────────────────────────────────────
// O id chega `number` do HUB e `string` da rota. Aqui ele é guardado COMO VEIO e toda
// comparação é por texto — a mesma disciplina de `itemDoCatalogoCW` no server. Nenhuma FK
// para o CW: o cardápio é de outro sistema e pode mudar embaixo de nós.
//
// ── INDEPENDÊNCIA ─────────────────────────────────────────────────────────────────────
// Nada aqui conhece o totem. O catálogo consumido é o CRU (itens base), não o projetado pela
// vitrine: expandir um combo em nove cards faz sentido num quiosque onde o cliente escolhe, e
// nenhum sentido numa parede. A fita vem de `produtoFita.js`, que é neutro de canal.
import { fitaDoSelo } from './produtoFita.js';

/* Os TRÊS layouts, fechados. Não há "escolha quantas colunas" — cada um é uma composição
   pensada para 1920 × 1080, com a faixa de título ocupando ~140 px e ~900 px úteis embaixo.

   · GRADE    4 × 2 = 8. Card de ~440 px com foto 16:9 (~247 px) + nome + preço. Doze cards
              deixariam o preço menor do que o do totem lido a três metros.
   · LISTA    linha de ~72 px em ~900 px = 12 com aperto; 10 com respiro. Foto opcional.
   · DESTAQUE 1 grande na metade esquerda + 2 × 2 na direita.

   O `maximo` é teto de ESCOLHA no admin; o que chega à tela pode ser menos (indisponíveis
   saem). */
export const LAYOUTS = Object.freeze({
  GRADE: Object.freeze({ id: 'GRADE', rotulo: 'Grade', maximo: 8, destaque: false, foto: true }),
  LISTA: Object.freeze({ id: 'LISTA', rotulo: 'Lista', maximo: 10, destaque: false, foto: false }),
  DESTAQUE: Object.freeze({ id: 'DESTAQUE', rotulo: 'Destaque + grade', maximo: 5, destaque: true, foto: true }),
});
export const LAYOUT_IDS = Object.freeze(Object.keys(LAYOUTS));
export const LAYOUT_PADRAO = 'GRADE';

/* Duração: 20 s de padrão, contra os 10 s de uma arte. Um menu precisa ser LIDO — quem passa
   na frente tem de achar o produto e o preço —, e 10 s numa lista de oito itens é pouco. */
export const DURACAO_PADRAO = 20;
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 120;

export const NOME_MAX = 60;
export const TITULO_MAX = 40;

export const MOTIVO_NOME = 'NOME_OBRIGATORIO';
export const MOTIVO_LAYOUT = 'LAYOUT_INVALIDO';
export const MOTIVO_DURACAO = 'DURACAO_INVALIDA';
export const MOTIVO_ITENS = 'ITENS_INVALIDOS';
export const MOTIVO_LIMITE = 'LIMITE_DE_ITENS';
export const MOTIVO_DESTAQUE = 'DESTAQUE_INVALIDO';

const arranjo = (v) => (Array.isArray(v) ? v : []);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const texto = (v) => (v === null || v === undefined ? '' : String(v));

/* Referência do CW: inteiro seguro positivo OU string não vazia. NÃO presume o tipo — o CW
   usa inteiros hoje, o HUB manda `number`, a rota manda `string`, e amarrar a um deles seria
   escolher em qual ponta quebrar. Guarda como veio; compara como texto. */
export function refValida(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v > 0;
  if (typeof v === 'string') return v.trim().length > 0 && v.trim().length <= 40;
  return false;
}
const mesmaRef = (a, b) => a != null && b != null && texto(a) === texto(b);

export const layoutValido = (v) => LAYOUT_IDS.includes(v);
export const tetoDoLayout = (v) => (LAYOUTS[v] ?? LAYOUTS[LAYOUT_PADRAO]).maximo;

/* ── Entrada administrativa ─────────────────────────────────────────────────────────── */

/* A CONFIGURAÇÃO do board: título da faixa, categoria de referência e os itens escolhidos,
   na ordem em que o gestor os quer.

   Duas recusas que parecem severas e não são:
     · item REPETIDO — o mesmo produto duas vezes na mesma tela é engano em 100% dos casos;
     · DOIS destaques — o layout tem um lugar de destaque; o segundo seria ignorado em
       silêncio, e ignorar em silêncio é como o gestor descobre pela TV que salvou errado.

   `destaque` só é aceito no layout que tem destaque: marcá-lo numa GRADE guardaria uma
   escolha que nunca teria efeito. */
export function validarConfiguracao(bruto, layout) {
  const cfg = objeto(bruto);
  const regra = LAYOUTS[layout] ?? LAYOUTS[LAYOUT_PADRAO];
  const itens = arranjo(cfg.itens);
  if (!Array.isArray(cfg.itens)) return { ok: false, motivo: MOTIVO_ITENS };
  if (itens.length > regra.maximo) return { ok: false, motivo: MOTIVO_LIMITE };

  const vistos = new Set();
  const saida = [];
  let destaques = 0;
  for (const bruta of itens) {
    const item = objeto(bruta);
    if (!refValida(item.cwItemId)) return { ok: false, motivo: MOTIVO_ITENS };
    const chave = texto(item.cwItemId);
    if (vistos.has(chave)) return { ok: false, motivo: MOTIVO_ITENS };
    vistos.add(chave);
    const ehDestaque = item.destaque === true;
    if (ehDestaque && !regra.destaque) return { ok: false, motivo: MOTIVO_DESTAQUE };
    if (ehDestaque) destaques += 1;
    saida.push(ehDestaque ? { cwItemId: item.cwItemId, destaque: true } : { cwItemId: item.cwItemId });
  }
  if (destaques > 1) return { ok: false, motivo: MOTIVO_DESTAQUE };

  const cwCategoriaId = cfg.cwCategoriaId;
  if (cwCategoriaId !== null && cwCategoriaId !== undefined && cwCategoriaId !== '' && !refValida(cwCategoriaId)) {
    return { ok: false, motivo: MOTIVO_ITENS };
  }
  return {
    ok: true,
    configuracao: {
      // A categoria é REFERÊNCIA de origem (por onde o gestor filtrou), não regra: o board
      // mostra os itens escolhidos, e não "tudo o que estiver na categoria". Se a loja
      // acrescentar um produto lá amanhã, a parede não muda sozinha.
      ...(refValida(cwCategoriaId) ? { cwCategoriaId } : {}),
      titulo: texto(cfg.titulo).trim().slice(0, TITULO_MAX),
      itens: saida,
    },
  };
}

/* Rigor ao escrever. Devolve só os campos PRESENTES no corpo — um PUT parcial não pode
   apagar o que não mencionou. A configuração é validada contra o layout FINAL (o que veio
   no corpo, ou o que já estava salvo), senão trocar de GRADE para DESTAQUE aceitaria uma
   configuração que o novo layout recusa. */
export function validarEntrada(bruto, { exigirNome = false, layoutAtual = LAYOUT_PADRAO } = {}) {
  const corpo = objeto(bruto);
  const erros = [];
  const dados = {};

  if (corpo.nome !== undefined || exigirNome) {
    const nome = texto(corpo.nome).trim().slice(0, NOME_MAX);
    if (!nome) erros.push({ campo: 'nome', motivo: MOTIVO_NOME });
    else dados.nome = nome;
  }
  if (corpo.ativo !== undefined) dados.ativo = corpo.ativo === true;
  if (corpo.layout !== undefined) {
    if (!layoutValido(corpo.layout)) erros.push({ campo: 'layout', motivo: MOTIVO_LAYOUT });
    else dados.layout = corpo.layout;
  }
  if (corpo.duracaoSegundos !== undefined) {
    const n = Number(corpo.duracaoSegundos);
    if (!Number.isFinite(n) || Math.round(n) < DURACAO_MIN || Math.round(n) > DURACAO_MAX) {
      erros.push({ campo: 'duracaoSegundos', motivo: MOTIVO_DURACAO });
    } else dados.duracaoSegundos = Math.round(n);
  }
  if (corpo.configuracao !== undefined) {
    const layout = dados.layout ?? layoutAtual;
    const v = validarConfiguracao(corpo.configuracao, layout);
    if (!v.ok) erros.push({ campo: 'configuracao', motivo: v.motivo });
    else dados.configuracao = v.configuracao;
  }
  return { ok: erros.length === 0, dados, erros };
}

/* ── Resolução contra o catálogo ────────────────────────────────────────────────────── */

/* Índice `String(id)` → item, a partir do catálogo CRU do CW. Primeira ocorrência vence: o
   mesmo item aparece em duas categorias e é o mesmo item. */
export function indexarCatalogo(catalogo) {
  const mapa = new Map();
  for (const bruta of arranjo(objeto(catalogo).categorias)) {
    for (const cru of arranjo(objeto(bruta).itens)) {
      const item = objeto(cru);
      if (item.id === null || item.id === undefined) continue;
      const chave = texto(item.id);
      if (!mapa.has(chave)) mapa.set(chave, item);
    }
  }
  return mapa;
}

/* Um produto do catálogo → o que a TV desenha.

   PREÇO: `precoPromocional` é o preço ATUAL e `preco` vira o ANTERIOR — é assim que o
   catálogo modela promoção, e não há segunda régua aqui. O percentual sai só desses dois
   valores e some quando o par não forma oferta (anterior ausente, igual ou menor). Nada é
   inventado e nada é recalculado por outro caminho.

   A chave `precoPromocional` pode simplesmente NÃO EXISTIR — é assim que o resto do projeto
   distingue "sem promoção" de "promoção de zero". */
export function produtoParaTv(item, selo) {
  const it = objeto(item);
  const temPromo = typeof it.precoPromocional === 'number';
  const de = Number(it.preco);
  const por = temPromo ? Number(it.precoPromocional) : de;
  const ofertaValida = temPromo && Number.isFinite(de) && Number.isFinite(por) && de > 0 && por >= 0 && por < de;
  const fita = selo ? fitaDoSelo(selo) : null;
  return {
    id: texto(it.id),
    nome: it.nome ?? null,
    descricao: it.descricao ?? null,
    // A foto vem do CATÁLOGO, por URL. Nenhum byte é copiado para o banco do PDV: a imagem
    // do produto já é servida por quem é dono dela.
    imagemUrl: it.imagem ?? null,
    preco: Number.isFinite(por) ? por : null,
    ...(ofertaValida ? { precoAnterior: de, descontoPercentual: Math.round((1 - por / de) * 100) } : {}),
    ...(fita ? { selo: fita } : {}),
  };
}

/* Está disponível para aparecer? No V1 o indisponível NÃO aparece — card cinza "em falta"
   numa TV promocional é propaganda de frustração. `status` ausente conta como disponível:
   catálogo de versão anterior não pode esvaziar a parede. */
export const disponivel = (item) => {
  const s = objeto(item).status;
  return s === undefined || s === null || s === 'ACTIVE';
};

/* O board resolvido, pronto para a tela.

   Devolve também `ausentes` (referências que não existem mais no catálogo) — o ADMIN usa
   para dizer "Produto não encontrado no catálogo"; a TV ignora. A referência NUNCA é apagada
   aqui: sumir com a escolha do gestor porque o HUB respondeu diferente num minuto ruim seria
   perder trabalho sem aviso.

   `elegivel` é falso quando nenhum produto sobra: o player pula o item e segue a programação.
   Board desligado também não é elegível. */
export function resolverMenuBoard(board, catalogo, fitas) {
  const b = objeto(board);
  const layout = layoutValido(b.layout) ? b.layout : LAYOUT_PADRAO;
  const cfg = objeto(b.configuracao);
  const indice = indexarCatalogo(catalogo);
  const porItem = fitas instanceof Map ? fitas : new Map();

  const produtos = [];
  const ausentes = [];
  let destaqueId = null;
  for (const bruta of arranjo(cfg.itens)) {
    const escolha = objeto(bruta);
    const chave = texto(escolha.cwItemId);
    const item = indice.get(chave);
    if (!item) { ausentes.push(chave); continue; }
    if (!disponivel(item)) continue;
    const p = produtoParaTv(item, porItem.get(chave));
    if (escolha.destaque === true && LAYOUTS[layout].destaque) destaqueId = p.id;
    produtos.push(p);
  }
  // Sem escolha explícita, o destaque é o PRIMEIRO disponível — é o que o gestor vê no
  // topo da lista, e deixar o layout sem destaque nenhum abriria um buraco na tela.
  if (LAYOUTS[layout].destaque && !destaqueId && produtos.length) destaqueId = produtos[0].id;

  return {
    id: b.id,
    nome: b.nome ?? null,
    layout,
    titulo: texto(cfg.titulo).trim() || null,
    duracaoSegundos: b.duracaoSegundos ?? DURACAO_PADRAO,
    produtos,
    ...(destaqueId ? { destaqueId } : {}),
    ausentes,
    elegivel: b.ativo !== false && produtos.length > 0,
  };
}

/* O board no CONTRATO PÚBLICO — o que vai para a TV. Sem `ausentes` (é assunto do admin),
   sem `nome` (é etiqueta interna; quem aparece na tela é o `titulo`) e sem `elegivel`, que
   já foi decidido por quem montou a programação. */
export function menuBoardPublico(resolvido) {
  const r = objeto(resolvido);
  return {
    tipo: 'menu_board',
    id: r.id,
    duracaoSegundos: r.duracaoSegundos,
    layout: r.layout,
    titulo: r.titulo ?? null,
    ...(r.destaqueId ? { destaqueId: r.destaqueId } : {}),
    produtos: arranjo(r.produtos),
  };
}

/* O board na LISTA do admin: sem resolver catálogo nenhum (a listagem não pode depender do
   HUB estar de pé para abrir). */
export function menuBoardParaAdmin(b) {
  const board = objeto(b);
  const cfg = objeto(board.configuracao);
  return {
    id: board.id,
    nome: board.nome,
    ativo: board.ativo,
    layout: layoutValido(board.layout) ? board.layout : LAYOUT_PADRAO,
    duracaoSegundos: board.duracaoSegundos ?? DURACAO_PADRAO,
    titulo: texto(cfg.titulo).trim() || null,
    cwCategoriaId: cfg.cwCategoriaId ?? null,
    itens: arranjo(cfg.itens),
    qtdItens: arranjo(cfg.itens).length,
    maximo: tetoDoLayout(board.layout),
  };
}

/* ── Itens polimórficos da playlist ─────────────────────────────────────────────────── */

export const TIPOS_ITEM = Object.freeze(['IMAGEM', 'MENU_BOARD', 'VIDEO']);

/* Qual coluna cada tipo usa. Um mapa em vez de três `if`: acrescentar um quarto tipo um dia
   é uma linha aqui, e não uma caça a condicionais espalhados. */
const REFERENCIA_DE = Object.freeze({ IMAGEM: 'conteudoId', MENU_BOARD: 'menuBoardId', VIDEO: 'videoId' });
export const MOTIVO_TIPO = 'TIPO_INVALIDO';
export const MOTIVO_REFERENCIA = 'REFERENCIA_INVALIDA';

/* Valida a lista INTEIRA de itens de uma playlist — imagens e boards misturados, na ordem
   em que vão ao ar.

   A regra polimórfica é exatamente uma: cada item aponta para UMA coisa. Nunca as duas,
   nunca nenhuma. O banco também tem um CHECK para isso (a migration), porque uma regra que
   só existe no aplicativo é uma regra que a primeira consulta manual quebra.

   `disponiveis` é `{ conteudos: Set, boards: Set }` com o que É DESTA EMPRESA — quem monta é
   a rota, com consultas escopadas. Referência de fora é RECUSADA, não filtrada: filtrar
   deixaria a tela dizendo "salvo" com menos itens do que o gestor escolheu, e ele não
   saberia qual sumiu. E é por aqui que o board da empresa B não entra na playlist da A. */
export function validarItensPlaylist(bruto, disponiveis) {
  if (!Array.isArray(bruto)) return { ok: false, motivo: MOTIVO_ITENS };
  const permitidos = {
    IMAGEM: disponiveis?.conteudos instanceof Set ? disponiveis.conteudos : new Set(),
    MENU_BOARD: disponiveis?.boards instanceof Set ? disponiveis.boards : new Set(),
    VIDEO: disponiveis?.videos instanceof Set ? disponiveis.videos : new Set(),
  };
  const vistos = new Set();
  const saida = [];
  for (const bruta of bruto) {
    const item = objeto(bruta);
    const tipo = item.tipo === undefined ? 'IMAGEM' : item.tipo;
    if (!TIPOS_ITEM.includes(tipo)) return { ok: false, motivo: MOTIVO_TIPO };
    const campo = REFERENCIA_DE[tipo];
    const id = Number(item[campo]);
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, motivo: MOTIVO_REFERENCIA };
    // MAIS DE UMA referência preenchida é corpo malformado, e aceitar "a que faz sentido"
    // esconderia um erro de quem chamou — além de ser exatamente o que o CHECK do banco
    // recusaria, com um 500 no lugar de uma frase.
    const preenchidas = Object.values(REFERENCIA_DE).filter((c) => item[c] !== null && item[c] !== undefined);
    if (preenchidas.length > 1) return { ok: false, motivo: MOTIVO_REFERENCIA };
    const chave = `${tipo}:${id}`;
    if (vistos.has(chave)) return { ok: false, motivo: MOTIVO_ITENS };
    vistos.add(chave);
    if (!permitidos[tipo].has(id)) return { ok: false, motivo: MOTIVO_REFERENCIA };
    saida.push({ tipo, [campo]: id });
  }
  return { ok: true, itens: saida };
}

/* Itens validados → linhas do `createMany`, com a ordem pela POSIÇÃO na lista. */
export function itensParaGravar(playlistId, itens) {
  return arranjo(itens).map((item, i) => ({
    playlistId,
    tipo: item.tipo,
    // As outras duas vão explicitamente NULAS: é o que o CHECK do banco exige, e deixar
    // `undefined` faria o Prisma omitir a coluna num update.
    conteudoId: item.tipo === 'IMAGEM' ? item.conteudoId : null,
    menuBoardId: item.tipo === 'MENU_BOARD' ? item.menuBoardId : null,
    videoId: item.tipo === 'VIDEO' ? item.videoId : null,
    ordem: i,
  }));
}
