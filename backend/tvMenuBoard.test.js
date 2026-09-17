// TV Indoor › Menu Board — testes puros do domínio (node --test, ESM).
// Rodar: node --test backend/tvMenuBoard.test.js
//
// O que estes testes defendem:
//   1. TRÊS layouts, com tetos próprios; layout inventado é recusado;
//   2. a configuração guarda REFERÊNCIA e ESCOLHA — nunca nome, preço, foto ou status;
//   3. o id do CW não tem tipo presumido: number e string valem, e a comparação é por texto;
//   4. indisponível NÃO aparece; todos indisponíveis → board inelegível;
//   5. produto sumido do catálogo vira `ausentes` (o admin avisa) e NÃO é apagado;
//   6. promoção sai só dos dois preços do catálogo, e o percentual some quando não é oferta;
//   7. item polimórfico: exatamente uma referência, nunca duas, nunca nenhuma;
//   8. referência de outra empresa é RECUSADA, não filtrada em silêncio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TETO_SELECAO, opcoesDoTemplate, exibicaoDoBoard,
  LAYOUTS, LAYOUT_IDS, LAYOUT_PADRAO, DURACAO_PADRAO, DURACAO_MIN, DURACAO_MAX,
  MOTIVO_NOME, MOTIVO_LAYOUT, MOTIVO_DURACAO, MOTIVO_ITENS, MOTIVO_LIMITE, MOTIVO_DESTAQUE,
  MOTIVO_TIPO, MOTIVO_REFERENCIA, TIPOS_ITEM,
  refValida, layoutValido, tetoDoLayout, validarConfiguracao, validarEntrada,
  indexarCatalogo, produtoParaTv, disponivel, resolverMenuBoard, menuBoardPublico,
  menuBoardParaAdmin, validarItensPlaylist, itensParaGravar,
} from './tvMenuBoard.js';

// Catálogo CRU, no shape que o HUB devolve (categorias[].itens[]).
const CATALOGO = {
  categorias: [
    {
      id: 10,
      nome: '🍔 TRADICIONAIS',
      itens: [
        { id: 3527346, nome: 'X BACON', descricao: 'Pão, carne e bacon', imagem: 'https://cw/x.jpg', preco: 31.9, status: 'ACTIVE' },
        { id: 3529326, nome: 'MAPLE', descricao: null, imagem: null, preco: 25, status: 'ACTIVE', precoPromocional: 19.9 },
        { id: 3722673, nome: 'ESPECIAL', descricao: 'Da casa', imagem: 'https://cw/e.jpg', preco: 22, status: 'MISSING' },
      ],
    },
    { id: 20, nome: 'COMBOS', itens: [{ id: 4384008, nome: 'SUPER BOX', preco: 152, status: 'ACTIVE' }] },
  ],
};

// ── Layouts ──────────────────────────────────────────────────────────────────
test('são SEIS templates fechados, com tetos pensados para 1920×1080', () => {
  assert.deepEqual(LAYOUT_IDS, ['GRADE', 'DESTAQUE', 'LISTA', 'VITRINE', 'OFERTA', 'CARROSSEL']);
  assert.equal(LAYOUTS.GRADE.maximo, 8, '4 × 2');
  assert.equal(LAYOUTS.LISTA.maximo, 10);
  assert.equal(LAYOUTS.DESTAQUE.maximo, 5, '1 grande + 2 × 2');
  assert.equal(LAYOUTS.VITRINE.maximo, 3);
  assert.equal(LAYOUTS.OFERTA.maximo, 1);
  /* Seis, e não mais: o board fica no ar por `duracaoSegundos`, e o carrossel divide esse
     tempo entre os produtos. Nos 20 s padrão, seis dão ~3,3 s cada; oito dariam 2,5 s, que
     é rápido demais para ler nome e preço de uma parede. */
  assert.equal(LAYOUTS.CARROSSEL.maximo, 6);
  assert.equal(LAYOUTS.CARROSSEL.destaque, false);
  // Montra vive de foto: um slide sem imagem não é um card feio, é o efeito inteiro parado.
  assert.equal(LAYOUTS.CARROSSEL.imagem, 'SEMPRE');
  assert.equal(LAYOUTS.DESTAQUE.destaque, true);
  assert.equal(LAYOUTS.GRADE.destaque, false, 'só o template de destaque tem destaque');
  assert.equal(LAYOUT_PADRAO, 'GRADE');
});

test('🔴 os três templates do V1 mantêm id, capacidade e semântica', () => {
  // COMPATIBILIDADE: um board gravado antes do V2 resolve igual. Se estes ids ou tetos
  // mudassem, boards existentes passariam a mostrar outra coisa depois do deploy.
  for (const [id, maximo, destaque] of [['GRADE', 8, false], ['LISTA', 10, false], ['DESTAQUE', 5, true]]) {
    assert.equal(LAYOUTS[id].maximo, maximo);
    assert.equal(LAYOUTS[id].destaque, destaque);
  }
});

test('cada template oferece SÓ os interruptores que têm efeito', () => {
  // "Não oferecer opção sem efeito": a Vitrine sem foto não é vitrine, e a Lista sem
  // descrição não é lista — nesses lugares não há o que escolher.
  assert.deepEqual(opcoesDoTemplate('GRADE'), ['logo', 'fita', 'descricao']);
  assert.deepEqual(opcoesDoTemplate('LISTA'), ['logo', 'fita', 'imagem']);
  assert.deepEqual(opcoesDoTemplate('VITRINE'), ['logo', 'fita', 'descricao']);
  assert.deepEqual(opcoesDoTemplate('OFERTA'), ['logo', 'fita', 'descricao']);
  // O DESTAQUE mostra descrição só no produto grande: é composição, não opção.
  assert.deepEqual(opcoesDoTemplate('DESTAQUE'), ['logo', 'fita']);
  assert.deepEqual(opcoesDoTemplate('INVENTADO'), ['logo', 'fita', 'descricao'], 'cai no padrão');
});

test('layout inventado é recusado', () => {
  for (const ruim of ['CANVAS', 'grade', 'ZONAS', '', null, 3]) assert.equal(layoutValido(ruim), false, String(ruim));
  assert.equal(validarEntrada({ layout: 'CANVAS' }).erros[0].motivo, MOTIVO_LAYOUT);
  assert.equal(tetoDoLayout('CANVAS'), 8, 'teto desconhecido cai no padrão em vez de virar NaN');
});

// ── Referência do CW ─────────────────────────────────────────────────────────
test('🔴 a referência do CW não tem tipo presumido: number e string valem', () => {
  assert.equal(refValida(3527346), true);
  assert.equal(refValida('3527346'), true);
  assert.equal(refValida('abc-123'), true, 'um CW que um dia use id textual não quebra o board');
  for (const ruim of [0, -1, 1.5, '', '   ', null, undefined, {}, [], true, 'x'.repeat(41)]) {
    assert.equal(refValida(ruim), false, String(ruim));
  }
});

// ── Configuração ─────────────────────────────────────────────────────────────
test('validarConfiguracao guarda só referência e ordem', () => {
  // O TÍTULO saiu do JSON e virou coluna no V2: texto estrutural e fechado merece campo
  // tipado, não uma chave solta num JSON sem validação de schema.
  const v = validarConfiguracao({
    cwCategoriaId: 10, titulo: '  Hambúrgueres  ',
    itens: [{ cwItemId: 3527346, nome: 'X BACON', preco: 31.9 }, { cwItemId: '3529326' }],
  }, 'GRADE');
  assert.equal(v.ok, true);
  assert.deepEqual(v.configuracao, {
    cwCategoriaId: 10,
    itens: [{ cwItemId: 3527346 }, { cwItemId: '3529326' }],
  });
  assert.equal('titulo' in v.configuracao, false, 'o título agora é coluna');
  const json = JSON.stringify(v.configuracao);
  for (const proibido of ['nome', 'preco', 'imagem', 'status', 'X BACON', '31.9']) {
    assert.equal(json.includes(proibido), false, `a configuração não pode guardar ${proibido}`);
  }
});

test('a ORDEM escolhida é preservada', () => {
  const v = validarConfiguracao({ itens: [{ cwItemId: 3 }, { cwItemId: 1 }, { cwItemId: 2 }] }, 'GRADE');
  assert.deepEqual(v.configuracao.itens.map((i) => i.cwItemId), [3, 1, 2]);
});

test('🔴 trocar de template NÃO apaga a seleção — o teto da escrita é o absoluto', () => {
  // Quem montou uma grade de oito e experimenta a Vitrine (3) não pode perder cinco
  // produtos em silêncio: a seleção fica guardada e voltar para a Grade recupera tudo.
  const oito = Array.from({ length: 8 }, (_, i) => ({ cwItemId: i + 1 }));
  assert.equal(validarConfiguracao({ itens: oito }, 'VITRINE').ok, true, 'oito escolhas sobrevivem à Vitrine');
  assert.equal(validarConfiguracao({ itens: oito }, 'OFERTA').ok, true);
  // O teto absoluto existe só para o JSON não crescer sem limite.
  const treze = Array.from({ length: TETO_SELECAO + 1 }, (_, i) => ({ cwItemId: i + 1 }));
  assert.equal(validarConfiguracao({ itens: treze }, 'GRADE').motivo, MOTIVO_LIMITE);
});

test('item repetido e referência torta são recusados', () => {
  assert.equal(validarConfiguracao({ itens: [{ cwItemId: 1 }, { cwItemId: '1' }] }, 'GRADE').motivo, MOTIVO_ITENS,
    'o mesmo produto duas vezes na mesma tela é engano — e 1 e "1" são o mesmo produto');
  assert.equal(validarConfiguracao({ itens: [{ cwItemId: 0 }] }, 'GRADE').motivo, MOTIVO_ITENS);
  assert.equal(validarConfiguracao({ itens: 'x' }, 'GRADE').motivo, MOTIVO_ITENS);
  assert.equal(validarConfiguracao({}, 'GRADE').motivo, MOTIVO_ITENS);
});

test('destaque: só no layout que o tem, e só um', () => {
  assert.equal(validarConfiguracao({ itens: [{ cwItemId: 1, destaque: true }] }, 'GRADE').motivo, MOTIVO_DESTAQUE,
    'marcar destaque numa grade guardaria uma escolha sem efeito');
  assert.equal(validarConfiguracao({ itens: [{ cwItemId: 1, destaque: true }] }, 'DESTAQUE').ok, true);
  assert.equal(
    validarConfiguracao({ itens: [{ cwItemId: 1, destaque: true }, { cwItemId: 2, destaque: true }] }, 'DESTAQUE').motivo,
    MOTIVO_DESTAQUE,
  );
});

test('validarEntrada: PUT parcial não apaga o resto; nome e duração têm régua', () => {
  assert.deepEqual(Object.keys(validarEntrada({ nome: ' Almoço ' }).dados), ['nome']);
  assert.equal(validarEntrada({ nome: '  ' }, { exigirNome: true }).erros[0].motivo, MOTIVO_NOME);
  assert.equal(validarEntrada({ duracaoSegundos: 4 }).erros[0].motivo, MOTIVO_DURACAO);
  assert.equal(validarEntrada({ duracaoSegundos: 121 }).erros[0].motivo, MOTIVO_DURACAO);
  assert.equal(validarEntrada({ duracaoSegundos: DURACAO_MIN }).dados.duracaoSegundos, DURACAO_MIN);
  assert.equal(validarEntrada({ duracaoSegundos: DURACAO_MAX }).dados.duracaoSegundos, DURACAO_MAX);
  assert.equal(DURACAO_PADRAO, 20, 'um menu precisa ser LIDO — 10 s de arte é pouco');
});

test('🔴 a configuração é validada contra o layout FINAL, não o salvo', () => {
  // Trocar de DESTAQUE para GRADE mandando a configuração antiga (com destaque) tem de ser
  // recusado: aceitar guardaria uma escolha que o layout novo ignora em silêncio.
  const v = validarEntrada(
    { layout: 'GRADE', configuracao: { itens: [{ cwItemId: 1, destaque: true }] } },
    { layoutAtual: 'DESTAQUE' },
  );
  assert.equal(v.ok, false);
  assert.equal(v.erros[0].motivo, MOTIVO_DESTAQUE);
});

// ── Resolução contra o catálogo ──────────────────────────────────────────────
test('indexarCatalogo: por texto, primeira ocorrência vence, torto não lança', () => {
  const i = indexarCatalogo(CATALOGO);
  assert.equal(i.get('3527346').nome, 'X BACON');
  assert.equal(i.size, 4);
  assert.equal(indexarCatalogo(null).size, 0);
  assert.equal(indexarCatalogo({ categorias: [null, { itens: 'x' }] }).size, 0);
});

test('produtoParaTv: preço normal, sem campos de promoção', () => {
  const p = produtoParaTv(CATALOGO.categorias[0].itens[0]);
  assert.deepEqual(p, {
    id: '3527346', nome: 'X BACON', descricao: 'Pão, carne e bacon',
    imagemUrl: 'https://cw/x.jpg', preco: 31.9,
  });
  assert.equal('precoAnterior' in p, false);
  assert.equal('descontoPercentual' in p, false);
});

test('🔴 promoção: o promocional é o preço ATUAL e o outro vira o anterior', () => {
  const p = produtoParaTv(CATALOGO.categorias[0].itens[1]);
  assert.equal(p.preco, 19.9, 'é o que o cliente paga');
  assert.equal(p.precoAnterior, 25);
  assert.equal(p.descontoPercentual, 20);
});

test('promoção que não é oferta não vira desconto', () => {
  for (const par of [{ preco: 10, precoPromocional: 10 }, { preco: 10, precoPromocional: 12 }, { preco: 0, precoPromocional: 0 }]) {
    const p = produtoParaTv({ id: 1, ...par });
    assert.equal('descontoPercentual' in p, false, JSON.stringify(par));
  }
  // Promoção ausente NÃO é `precoPromocional: null` — a chave simplesmente não existe.
  assert.equal('precoAnterior' in produtoParaTv({ id: 1, preco: 10, precoPromocional: null }), false);
});

test('o SELO vem resolvido em texto e cor (o mesmo do HUB)', () => {
  const p = produtoParaTv({ id: 1, preco: 10 }, 'MAIS_PEDIDO');
  assert.deepEqual(p.selo, { texto: 'Mais pedido', cor: '#B45309' });
  assert.equal('selo' in produtoParaTv({ id: 1, preco: 10 }), false);
  assert.equal('selo' in produtoParaTv({ id: 1, preco: 10 }, 'INVENTADO'), false);
});

test('disponivel: só ACTIVE aparece; status ausente conta como disponível', () => {
  assert.equal(disponivel({ status: 'ACTIVE' }), true);
  assert.equal(disponivel({ status: 'MISSING' }), false);
  assert.equal(disponivel({ status: 'INACTIVE' }), false);
  assert.equal(disponivel({}), true, 'catálogo de versão anterior não pode esvaziar a parede');
});

const board = (extra) => ({
  id: 7, nome: 'Almoço', ativo: true, layout: 'GRADE', duracaoSegundos: 20,
  configuracao: { titulo: 'Hambúrgueres', itens: [{ cwItemId: 3527346 }, { cwItemId: 3529326 }] },
  ...extra,
});

test('resolverMenuBoard monta a tela na ordem escolhida', () => {
  const r = resolverMenuBoard(board(), CATALOGO, new Map([['3527346', 'OFERTA']]));
  assert.deepEqual(r.produtos.map((p) => p.nome), ['X BACON', 'MAPLE']);
  assert.deepEqual(r.produtos[0].selo, { texto: 'Oferta', cor: '#15803D' });
  assert.equal(r.produtos[1].descontoPercentual, 20);
  assert.equal(r.titulo, 'Hambúrgueres');
  assert.equal(r.elegivel, true);
  assert.deepEqual(r.ausentes, []);
});

test('🔴 produto INDISPONÍVEL não aparece — e o board não preenche o buraco sozinho', () => {
  const r = resolverMenuBoard(
    board({ configuracao: { itens: [{ cwItemId: 3527346 }, { cwItemId: 3722673 }] } }),
    CATALOGO, new Map(),
  );
  assert.deepEqual(r.produtos.map((p) => p.nome), ['X BACON'], 'o MISSING sai');
  assert.equal(r.produtos.length, 1, 'nada é preenchido com produto que o gestor não escolheu');
  assert.equal(r.elegivel, true);
});

test('🔴 TODOS indisponíveis → board INELEGÍVEL (o player segue para o próximo)', () => {
  const r = resolverMenuBoard(board({ configuracao: { itens: [{ cwItemId: 3722673 }] } }), CATALOGO, new Map());
  assert.deepEqual(r.produtos, []);
  assert.equal(r.elegivel, false);
});

test('board DESLIGADO não é elegível, mesmo com produtos', () => {
  assert.equal(resolverMenuBoard(board({ ativo: false }), CATALOGO, new Map()).elegivel, false);
});

test('🔴 produto que sumiu do catálogo vira AUSENTE e NÃO é apagado', () => {
  const r = resolverMenuBoard(
    board({ configuracao: { itens: [{ cwItemId: 3527346 }, { cwItemId: 999999 }] } }),
    CATALOGO, new Map(),
  );
  assert.deepEqual(r.ausentes, ['999999'], 'o admin avisa "não encontrado no catálogo"');
  assert.deepEqual(r.produtos.map((p) => p.id), ['3527346']);
});

test('catálogo vazio (HUB fora e sem cache) não lança: board inelegível', () => {
  const r = resolverMenuBoard(board(), null, null);
  assert.equal(r.elegivel, false);
  assert.deepEqual(r.produtos, []);
  assert.equal(r.ausentes.length, 2);
});

test('DESTAQUE: o escolhido manda; sem escolha, vale o primeiro disponível', () => {
  const comEscolha = resolverMenuBoard(
    board({ layout: 'DESTAQUE', configuracao: { itens: [{ cwItemId: 3527346 }, { cwItemId: 3529326, destaque: true }] } }),
    CATALOGO, new Map(),
  );
  assert.equal(comEscolha.destaqueId, '3529326');
  const sem = resolverMenuBoard(
    board({ layout: 'DESTAQUE', configuracao: { itens: [{ cwItemId: 3527346 }, { cwItemId: 3529326 }] } }),
    CATALOGO, new Map(),
  );
  assert.equal(sem.destaqueId, '3527346', 'layout de destaque sem destaque abriria um buraco na tela');
  // O destaque escolhido ficou indisponível: o primeiro que sobrou assume.
  const caiu = resolverMenuBoard(
    board({ layout: 'DESTAQUE', configuracao: { itens: [{ cwItemId: 3722673, destaque: true }, { cwItemId: 3529326 }] } }),
    CATALOGO, new Map(),
  );
  assert.equal(caiu.destaqueId, '3529326');
});

test('GRADE nunca ganha destaqueId', () => {
  const r = resolverMenuBoard(board({ configuracao: { itens: [{ cwItemId: 3527346, destaque: true }] } }), CATALOGO, new Map());
  assert.equal('destaqueId' in r, false);
});

// ── Saídas ───────────────────────────────────────────────────────────────────
test('🔴 o board público declara o tipo e não leva nada de admin nem byte nenhum', () => {
  const p = menuBoardPublico(resolverMenuBoard(board(), CATALOGO, new Map()));
  assert.equal(p.tipo, 'menu_board');
  assert.deepEqual(Object.keys(p).sort(), ['duracaoSegundos', 'exibicao', 'id', 'layout', 'produtos', 'subtitulo', 'tipo', 'titulo']);
  assert.equal('ausentes' in p, false, 'referência quebrada é assunto do admin');
  assert.equal('nome' in p, false, 'o nome é etiqueta interna; na tela aparece o título');
  assert.equal('elegivel' in p, false);
  assert.equal(JSON.stringify(p).includes('base64'), false);
  // A foto é URL do catálogo — nenhum byte copiado para o banco do PDV.
  assert.equal(p.produtos[0].imagemUrl, 'https://cw/x.jpg');
});

test('menuBoardParaAdmin abre sem catálogo nenhum', () => {
  const a = menuBoardParaAdmin(board());
  assert.equal(a.qtdItens, 2);
  assert.equal(a.maximo, 8);
  assert.equal(a.titulo, 'Hambúrgueres');
  assert.deepEqual(a.itens, [{ cwItemId: 3527346 }, { cwItemId: 3529326 }]);
});

// ── Item polimórfico da playlist ─────────────────────────────────────────────
const MEUS = { conteudos: new Set([1, 2]), boards: new Set([7, 8]), videos: new Set([4, 5]) };

test('a playlist aceita imagem e board misturados, na ordem', () => {
  const v = validarItensPlaylist([
    { tipo: 'IMAGEM', conteudoId: 2 },
    { tipo: 'MENU_BOARD', menuBoardId: 7 },
    { tipo: 'IMAGEM', conteudoId: 1 },
  ], MEUS);
  assert.equal(v.ok, true);
  assert.deepEqual(v.itens, [
    { tipo: 'IMAGEM', conteudoId: 2 },
    { tipo: 'MENU_BOARD', menuBoardId: 7 },
    { tipo: 'IMAGEM', conteudoId: 1 },
  ]);
});

test('playlist só de imagem e playlist só de board continuam valendo', () => {
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM', conteudoId: 1 }], MEUS).ok, true);
  assert.equal(validarItensPlaylist([{ tipo: 'MENU_BOARD', menuBoardId: 7 }], MEUS).ok, true);
  assert.deepEqual(validarItensPlaylist([], MEUS), { ok: true, itens: [] });
});

test('🔴 item sem tipo é IMAGEM — é o que faz a playlist antiga continuar valendo', () => {
  const v = validarItensPlaylist([{ conteudoId: 1 }], MEUS);
  assert.deepEqual(v.itens, [{ tipo: 'IMAGEM', conteudoId: 1 }]);
});

test('🔴 item polimórfico inválido é recusado: nunca dois, nunca nenhum', () => {
  // Mais de uma referência é corpo malformado — e é exatamente o que o CHECK do banco
  // recusaria, com um 500 no lugar de uma frase.
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM', conteudoId: 1, menuBoardId: 7 }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'MENU_BOARD', conteudoId: 1, menuBoardId: 7 }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'VIDEO', videoId: 4, conteudoId: 1 }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM' }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'MENU_BOARD' }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'VIDEO' }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM', conteudoId: 0 }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'AUDIO', conteudoId: 1 }], MEUS).motivo, MOTIVO_TIPO);
  assert.equal(validarItensPlaylist(null, MEUS).motivo, MOTIVO_ITENS);
  assert.deepEqual(TIPOS_ITEM, ['IMAGEM', 'MENU_BOARD', 'VIDEO']);
});

test('🔴 a playlist aceita os TRÊS tipos misturados, na ordem', () => {
  const v = validarItensPlaylist([
    { tipo: 'IMAGEM', conteudoId: 2 },
    { tipo: 'MENU_BOARD', menuBoardId: 7 },
    { tipo: 'VIDEO', videoId: 4 },
    { tipo: 'IMAGEM', conteudoId: 1 },
    { tipo: 'VIDEO', videoId: 5 },
  ], MEUS);
  assert.equal(v.ok, true);
  assert.deepEqual(v.itens.map((i) => i.tipo), ['IMAGEM', 'MENU_BOARD', 'VIDEO', 'IMAGEM', 'VIDEO']);
  assert.deepEqual(v.itens[2], { tipo: 'VIDEO', videoId: 4 });
});

test('playlist só de VÍDEO também funciona', () => {
  assert.equal(validarItensPlaylist([{ tipo: 'VIDEO', videoId: 4 }], MEUS).ok, true);
});

test('🔴 vídeo de OUTRA empresa é recusado, nunca filtrado', () => {
  assert.equal(validarItensPlaylist([{ tipo: 'VIDEO', videoId: 99 }], MEUS).motivo, MOTIVO_REFERENCIA);
});

test('🔴 board de OUTRA empresa é RECUSADO, nunca filtrado em silêncio', () => {
  // É por aqui que a playlist da empresa A não recebe o board da B. Filtrar deixaria a tela
  // dizendo "salvo" com menos itens do que o gestor escolheu.
  assert.equal(validarItensPlaylist([{ tipo: 'MENU_BOARD', menuBoardId: 99 }], MEUS).motivo, MOTIVO_REFERENCIA);
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM', conteudoId: 99 }], MEUS).motivo, MOTIVO_REFERENCIA);
});

test('o mesmo item repetido na playlist é recusado; tipos diferentes com o mesmo id não', () => {
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM', conteudoId: 1 }, { tipo: 'IMAGEM', conteudoId: 1 }], MEUS).motivo, MOTIVO_ITENS);
  // conteúdo 1 e board 7 são coisas diferentes; ids iguais em tabelas diferentes não colidem.
  assert.equal(validarItensPlaylist([{ tipo: 'IMAGEM', conteudoId: 1 }, { tipo: 'MENU_BOARD', menuBoardId: 7 }], MEUS).ok, true);
});

test('itensParaGravar numera pela POSIÇÃO e deixa as OUTRAS referências NULAS', () => {
  // Explicitamente nulas: é o que o CHECK do banco exige, e `undefined` faria o Prisma
  // omitir a coluna num update — deixando a referência velha para trás.
  assert.deepEqual(itensParaGravar(3, [
    { tipo: 'MENU_BOARD', menuBoardId: 7 },
    { tipo: 'IMAGEM', conteudoId: 1 },
    { tipo: 'VIDEO', videoId: 4 },
  ]), [
    { playlistId: 3, tipo: 'MENU_BOARD', conteudoId: null, menuBoardId: 7, videoId: null, ordem: 0 },
    { playlistId: 3, tipo: 'IMAGEM', conteudoId: 1, menuBoardId: null, videoId: null, ordem: 1 },
    { playlistId: 3, tipo: 'VIDEO', conteudoId: null, menuBoardId: null, videoId: 4, ordem: 2 },
  ]);
  assert.deepEqual(itensParaGravar(3, null), []);
});

// ── V2: capacidade, exibição e compatibilidade ───────────────────────────────
const boardV2 = (extra) => ({
  id: 9, nome: 'Board', ativo: true, layout: 'GRADE', duracaoSegundos: 20,
  configuracao: { itens: [{ cwItemId: 1 }, { cwItemId: 2 }] }, ...extra,
});

test('🔴 o teto do template corta DEPOIS da disponibilidade', () => {
  // Um produto esgotado não pode gastar uma das três vagas da Vitrine: cortar antes deixaria
  // a tela com dois cards porque o primeiro da lista acabou na cozinha.
  const catalogo = { categorias: [{ itens: [
    { id: 1, nome: 'A', preco: 10, status: 'INACTIVE' },
    { id: 2, nome: 'B', preco: 20 },
    { id: 3, nome: 'C', preco: 30 },
    { id: 4, nome: 'D', preco: 40 },
  ] }] };
  const r = resolverMenuBoard(
    boardV2({ layout: 'VITRINE', configuracao: { itens: [1, 2, 3, 4].map((n) => ({ cwItemId: n })) } }),
    catalogo, new Map(),
  );
  assert.deepEqual(r.produtos.map((p) => p.nome), ['B', 'C', 'D'], 'três vagas, três disponíveis');
});

test('a OFERTA resolve um produto só, e a seleção maior não a quebra', () => {
  const catalogo = { categorias: [{ itens: [{ id: 1, nome: 'A', preco: 10 }, { id: 2, nome: 'B', preco: 20 }] }] };
  const r = resolverMenuBoard(boardV2({ layout: 'OFERTA', configuracao: { itens: [{ cwItemId: 1 }, { cwItemId: 2 }] } }), catalogo, new Map());
  assert.equal(r.produtos.length, 1);
  assert.equal(r.produtos[0].nome, 'A', 'o primeiro da ordem é o da campanha');
  assert.equal(r.elegivel, true);
});

test('🔴 os defaults de exibição reproduzem exatamente o V1', () => {
  // Board antigo, sem nenhuma das colunas novas: logo escondida, descrição só onde o V1 a
  // mostrava, e a fita continua aparecendo.
  assert.deepEqual(exibicaoDoBoard({}, 'GRADE'), { logo: false, fita: true, imagem: true, descricao: false, descricaoSoNoDestaque: false });
  assert.deepEqual(exibicaoDoBoard({}, 'LISTA'), { logo: false, fita: true, imagem: false, descricao: true, descricaoSoNoDestaque: false });
  assert.deepEqual(exibicaoDoBoard({}, 'DESTAQUE'), { logo: false, fita: true, imagem: true, descricao: true, descricaoSoNoDestaque: true });
});

test('o interruptor só vale onde o template deixa escolher', () => {
  // A Vitrine ignora `mostrarImagem`: sem foto ela não é vitrine.
  assert.equal(exibicaoDoBoard({ mostrarImagem: false }, 'VITRINE').imagem, true);
  // A Lista honra: é exatamente para o cardápio sem fotografia de todos os itens.
  assert.equal(exibicaoDoBoard({ mostrarImagem: true }, 'LISTA').imagem, true);
  assert.equal(exibicaoDoBoard({ mostrarImagem: false }, 'LISTA').imagem, false);
  // A Grade honra a descrição; a Lista a mostra sempre.
  assert.equal(exibicaoDoBoard({ mostrarDescricao: true }, 'GRADE').descricao, true);
  assert.equal(exibicaoDoBoard({ mostrarDescricao: false }, 'LISTA').descricao, true);
  // Logo e fita valem em todos.
  assert.equal(exibicaoDoBoard({ mostrarLogo: true }, 'OFERTA').logo, true);
  assert.equal(exibicaoDoBoard({ mostrarFita: false }, 'GRADE').fita, false);
});

test('título e subtítulo: vazio vira NULL, e o limite corta', () => {
  // `''` renderizaria um bloco de altura zero empurrando a composição — e o gestor veria um
  // vão sem entender de onde veio.
  assert.equal(validarEntrada({ titulo: '   ' }).dados.titulo, null);
  assert.equal(validarEntrada({ subtitulo: '' }).dados.subtitulo, null);
  assert.equal(validarEntrada({ titulo: null }).dados.titulo, null);
  assert.equal(validarEntrada({ titulo: '  Os mais pedidos  ' }).dados.titulo, 'Os mais pedidos');
  assert.equal(validarEntrada({ titulo: 'x'.repeat(200) }).dados.titulo.length, 60);
  assert.equal(validarEntrada({ subtitulo: 'y'.repeat(300) }).dados.subtitulo.length, 100);
  assert.equal(validarEntrada({ titulo: 42 }).erros[0].campo, 'titulo');
  // PUT parcial não apaga o que não mencionou.
  assert.equal('titulo' in validarEntrada({ nome: 'X' }).dados, false);
});

test('as chaves de exibição são booleanos ESTRITOS', () => {
  // `'false'` vindo de um formulário mal montado não pode virar `true` por ser string.
  assert.equal(validarEntrada({ mostrarLogo: 'false' }).dados.mostrarLogo, false);
  assert.equal(validarEntrada({ mostrarLogo: 1 }).dados.mostrarLogo, false);
  assert.equal(validarEntrada({ mostrarLogo: true }).dados.mostrarLogo, true);
  assert.equal('mostrarFita' in validarEntrada({}).dados, false);
});

test('🔴 board V1 com título no JSON continua exibindo o título', () => {
  // A migration copia o valor para a coluna; esta leitura é o cinto de segurança para o
  // board que ainda não passou por lá.
  const catalogo = { categorias: [{ itens: [{ id: 1, nome: 'A', preco: 10 }] }] };
  const antigo = boardV2({ configuracao: { titulo: 'Hambúrgueres', itens: [{ cwItemId: 1 }] } });
  assert.equal(resolverMenuBoard(antigo, catalogo, new Map()).titulo, 'Hambúrgueres');
  // E a coluna vence quando existe.
  const novo = boardV2({ titulo: 'Os mais pedidos', configuracao: { titulo: 'Velho', itens: [{ cwItemId: 1 }] } });
  assert.equal(resolverMenuBoard(novo, catalogo, new Map()).titulo, 'Os mais pedidos');
});

test('🔴 board V1 com destaque MARCADO continua com aquele produto no lugar grande', () => {
  // Compatibilidade visual: o V2 usa a ORDEM, mas não pode reposicionar o que já estava.
  const catalogo = { categorias: [{ itens: [{ id: 1, nome: 'A', preco: 10 }, { id: 2, nome: 'B', preco: 20 }] }] };
  const antigo = boardV2({ layout: 'DESTAQUE', configuracao: { itens: [{ cwItemId: 1 }, { cwItemId: 2, destaque: true }] } });
  assert.equal(resolverMenuBoard(antigo, catalogo, new Map()).destaqueId, '2');
  // Sem marca, a ordem resolve — que é como o V2 monta boards novos.
  const novo = boardV2({ layout: 'DESTAQUE', configuracao: { itens: [{ cwItemId: 1 }, { cwItemId: 2 }] } });
  assert.equal(resolverMenuBoard(novo, catalogo, new Map()).destaqueId, '1');
});

test('o admin sabe quantos dos selecionados o template mostra', () => {
  const a = menuBoardParaAdmin(boardV2({ layout: 'VITRINE', configuracao: { itens: [1, 2, 3, 4, 5].map((n) => ({ cwItemId: n })) } }));
  assert.equal(a.qtdItens, 5, 'a seleção inteira continua guardada');
  assert.equal(a.exibidos, 3, 'mas a Vitrine mostra três');
  assert.equal(a.maximo, 3);
});
