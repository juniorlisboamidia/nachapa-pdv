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
/* ── OS CINCO TEMPLATES ────────────────────────────────────────────────────────────────
   Esta é A definição central. Capacidade, o que cada composição mostra sempre e o que ela
   deixa o gestor escolher moram aqui — e só aqui. Espalhar `if (template === 'LISTA')` pelo
   editor, pelo renderer e pela rota seria garantir que os três discordem no primeiro ajuste.

   `imagem` e `descricao` têm TRÊS valores, e a distinção é o que evita oferecer opção sem
   efeito:
     · SEMPRE   — intrínseco à composição; não há interruptor (a Vitrine sem foto não é
                  vitrine, e a Oferta sem foto não é campanha);
     · OPCIONAL — o gestor decide, e o interruptor aparece;
     · NUNCA    — a composição não tem lugar para isso.
   `HERO` existe só para a descrição do DESTAQUE: o produto grande tem espaço para ela, os
   quatro secundários não — e essa assimetria é a composição, não uma opção.

   Os três primeiros são os layouts do V1 com o MESMO id e a MESMA capacidade: board antigo
   continua resolvendo sem migração de dado nenhuma. */
export const TEMPLATES = Object.freeze({
  GRADE: Object.freeze({
    id: 'GRADE', rotulo: 'Grade de produtos', maximo: 8, destaque: false,
    imagem: 'SEMPRE', descricao: 'OPCIONAL',
    resumo: 'Até 8 produtos em duas fileiras. O cardápio geral.',
  }),
  DESTAQUE: Object.freeze({
    id: 'DESTAQUE', rotulo: 'Destaque + produtos', maximo: 5, destaque: true,
    imagem: 'SEMPRE', descricao: 'HERO',
    resumo: 'Um produto grande e mais quatro. O primeiro da lista é o destaque.',
  }),
  LISTA: Object.freeze({
    id: 'LISTA', rotulo: 'Lista de cardápio', maximo: 10, destaque: false,
    imagem: 'OPCIONAL', descricao: 'SEMPRE',
    resumo: 'Até 10 itens com nome, descrição e preço. Funciona sem fotos.',
  }),
  VITRINE: Object.freeze({
    id: 'VITRINE', rotulo: 'Vitrine', maximo: 3, destaque: false,
    imagem: 'SEMPRE', descricao: 'OPCIONAL',
    resumo: 'Três produtos lado a lado, bem grandes. Lançamentos e combos.',
  }),
  OFERTA: Object.freeze({
    id: 'OFERTA', rotulo: 'Oferta em destaque', maximo: 1, destaque: false,
    imagem: 'SEMPRE', descricao: 'OPCIONAL',
    resumo: 'Um produto só, em formato de campanha. Valoriza a promoção.',
  }),
});
// `LAYOUTS` continua exportado com o nome antigo: internamente a coluna se chama `layout`, e
// renomear tudo de uma vez seria trocar a fundação no meio da obra. Na UI, a palavra é
// TEMPLATE — o gestor não fala "layout".
export const LAYOUTS = TEMPLATES;
export const LAYOUT_IDS = Object.freeze(Object.keys(TEMPLATES));
export const LAYOUT_PADRAO = 'GRADE';

/* O teto ABSOLUTO da seleção guardada, acima do maior template.

   Ele existe porque a seleção NÃO é truncada ao trocar de template: quem montou uma grade de
   oito e experimenta a Vitrine não pode perder cinco produtos em silêncio — o board público
   recebe os três primeiros elegíveis, e voltar para a grade recupera a seleção inteira.
   O teto só impede que o JSON cresça sem limite. */
export const TETO_SELECAO = 12;

export const TITULO_BOARD_MAX = 60;
export const SUBTITULO_MAX = 100;

/* Quais interruptores esta composição oferece. O editor lê daqui — é o que garante que
   nenhum controle apareça sem ter efeito, e que nenhum efeito exista sem controle. */
export function opcoesDoTemplate(id) {
  const t = TEMPLATES[id] ?? TEMPLATES[LAYOUT_PADRAO];
  return Object.freeze([
    'logo',
    'fita',
    ...(t.descricao === 'OPCIONAL' ? ['descricao'] : []),
    ...(t.imagem === 'OPCIONAL' ? ['imagem'] : []),
  ]);
}

/* Duração: 20 s de padrão, contra os 10 s de uma arte. Um menu precisa ser LIDO — quem passa
   na frente tem de achar o produto e o preço —, e 10 s numa lista de oito itens é pouco. */
export const DURACAO_PADRAO = 20;
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 120;

export const NOME_MAX = 60;
// Mantido pelo contrato antigo: o título vivia dentro de `configuracao.titulo` com 40. No V2
// ele é coluna própria com 60 — o limite velho só serve para ler o que já está gravado.
export const TITULO_MAX = 40;

export const MOTIVO_NOME = 'NOME_OBRIGATORIO';
export const MOTIVO_LAYOUT = 'LAYOUT_INVALIDO';
export const MOTIVO_DURACAO = 'DURACAO_INVALIDA';
export const MOTIVO_ITENS = 'ITENS_INVALIDOS';
export const MOTIVO_LIMITE = 'LIMITE_DE_ITENS';
export const MOTIVO_DESTAQUE = 'DESTAQUE_INVALIDO';
export const MOTIVO_TEXTO = 'TEXTO_INVALIDO';

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
  /* O teto aqui é o ABSOLUTO, e não o do template. Trocar de Grade (8) para Vitrine (3) não
     pode apagar cinco produtos: a seleção fica guardada inteira, o board público recebe os
     três primeiros elegíveis, e voltar para a Grade recupera tudo. Destruir escolha em
     silêncio é como o gestor descobre pela TV que perdeu trabalho. */
  if (itens.length > TETO_SELECAO) return { ok: false, motivo: MOTIVO_LIMITE };

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
  /* TÍTULO e SUBTÍTULO são colunas no V2 — texto estrutural e fechado merece campo tipado,
     não uma chave solta dentro de um JSON sem validação.

     String vazia vira NULL, e isso importa na tela: `''` renderizaria um bloco de altura
     zero empurrando a composição para baixo, e o gestor veria um vão sem entender de onde
     veio. Ausente e vazio significam a mesma coisa, então guardam a mesma coisa. */
  for (const [campo, limite] of [['titulo', TITULO_BOARD_MAX], ['subtitulo', SUBTITULO_MAX]]) {
    if (corpo[campo] === undefined) continue;
    if (corpo[campo] === null) { dados[campo] = null; continue; }
    if (typeof corpo[campo] !== 'string') { erros.push({ campo, motivo: MOTIVO_TEXTO }); continue; }
    const v = corpo[campo].trim().slice(0, limite);
    dados[campo] = v || null;
  }
  // As quatro chaves de EXIBIÇÃO. Booleanos estritos: `'false'` vindo de um formulário mal
  // montado não pode virar `true` por ser string não vazia.
  for (const campo of ['mostrarLogo', 'mostrarDescricao', 'mostrarImagem', 'mostrarFita']) {
    if (corpo[campo] !== undefined) dados[campo] = corpo[campo] === true;
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

  const regra = TEMPLATES[layout];
  const produtos = [];
  const ausentes = [];
  let destaqueId = null;
  for (const bruta of arranjo(cfg.itens)) {
    const escolha = objeto(bruta);
    const chave = texto(escolha.cwItemId);
    const item = indice.get(chave);
    if (!item) { ausentes.push(chave); continue; }
    if (!disponivel(item)) continue;
    /* O TETO é aplicado DEPOIS da disponibilidade, e essa ordem é a regra: um produto
       esgotado não pode gastar uma das três vagas da Vitrine. Cortar antes deixaria a tela
       com dois cards porque o primeiro da lista acabou na cozinha. */
    if (produtos.length >= regra.maximo) break;
    const p = produtoParaTv(item, porItem.get(chave));
    if (escolha.destaque === true && regra.destaque) destaqueId = p.id;
    produtos.push(p);
  }
  /* Sem escolha explícita, o destaque é o PRIMEIRO disponível — a ORDEM resolve, e é por
     isso que o V2 não tem seletor paralelo de "produto destaque": duas maneiras de dizer a
     mesma coisa é uma a mais.

     A marca explícita continua sendo honrada quando existe, e isso é compatibilidade, não
     indecisão: um board V1 que marcou o terceiro item como destaque tem de continuar
     mostrando o terceiro item no lugar grande depois do deploy. */
  if (regra.destaque && !destaqueId && produtos.length) destaqueId = produtos[0].id;

  return {
    id: b.id,
    nome: b.nome ?? null,
    layout,
    // Coluna primeiro; a chave dentro do JSON é o contrato ANTIGO, lida só enquanto houver
    // board gravado antes da migration que ainda não passou por aqui.
    titulo: texto(b.titulo ?? cfg.titulo).trim() || null,
    subtitulo: texto(b.subtitulo).trim() || null,
    exibicao: exibicaoDoBoard(b, layout),
    duracaoSegundos: b.duracaoSegundos ?? DURACAO_PADRAO,
    produtos,
    ...(destaqueId ? { destaqueId } : {}),
    ausentes,
    elegivel: b.ativo !== false && produtos.length > 0,
  };
}

/* O que a TELA mostra, já RESOLVIDO contra o template.

   O renderer não decide nada sobre isto: ele recebe quatro booleanos prontos e desenha. É o
   que impede a pergunta "a Lista mostra descrição?" de ter uma resposta no editor, outra no
   player e uma terceira aqui.

   `SEMPRE`/`NUNCA` ignoram a preferência do board de propósito: a Vitrine sem foto não é
   vitrine, e a Lista sem descrição não é lista. O interruptor só existe onde há escolha. */
export function exibicaoDoBoard(board, layout) {
  const b = objeto(board);
  const regra = TEMPLATES[layout] ?? TEMPLATES[LAYOUT_PADRAO];
  const pedido = (chave, padrao) => (b[chave] === undefined || b[chave] === null ? padrao : b[chave] === true);
  const resolver = (modo, chave) => {
    if (modo === 'SEMPRE') return true;
    if (modo === 'NUNCA') return false;
    if (modo === 'HERO') return true;   // só o produto grande usa; o renderer sabe onde
    return pedido(chave, false);
  };
  return {
    logo: pedido('mostrarLogo', false),
    // A fita é metadado editorial e sempre apareceu no V1: o padrão precisa manter isso.
    fita: pedido('mostrarFita', true),
    imagem: resolver(regra.imagem, 'mostrarImagem'),
    descricao: resolver(regra.descricao, 'mostrarDescricao'),
    // Só o DESTAQUE distingue: o produto grande tem espaço para a descrição, os quatro
    // secundários não. A assimetria é a composição, não uma opção.
    descricaoSoNoDestaque: regra.descricao === 'HERO',
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
    subtitulo: r.subtitulo ?? null,
    // Quatro booleanos, não as preferências cruas: a TV recebe o que DESENHAR, e não a
    // pergunta que ela teria de responder de novo.
    exibicao: r.exibicao ?? exibicaoDoBoard({}, r.layout),
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
    titulo: texto(board.titulo ?? cfg.titulo).trim() || null,
    subtitulo: texto(board.subtitulo).trim() || null,
    mostrarLogo: board.mostrarLogo === true,
    mostrarDescricao: board.mostrarDescricao === true,
    mostrarImagem: board.mostrarImagem === true,
    mostrarFita: board.mostrarFita !== false,
    cwCategoriaId: cfg.cwCategoriaId ?? null,
    itens: arranjo(cfg.itens),
    qtdItens: arranjo(cfg.itens).length,
    maximo: tetoDoLayout(board.layout),
    // Quantos dos selecionados este template REALMENTE mostra. É o que permite o editor
    // avisar "3 de 8" em vez de deixar o gestor descobrir pela parede.
    exibidos: Math.min(arranjo(cfg.itens).length, tetoDoLayout(board.layout)),
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
