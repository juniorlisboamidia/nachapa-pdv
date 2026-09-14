// TV Indoor — testes puros do domínio do canal (node --test, ESM).
// Rodar: node --test backend/tvIndoor.test.js
//
// O que estes testes defendem:
//   1. a duração da TV é a DELA (10 s padrão, até 120 s) — não a do totem;
//   2. rigor na ESCRITA (recusa) e tolerância na LEITURA (grampeia no padrão);
//   3. a agenda é absoluta, com início inclusivo e fim exclusivo;
//   4. a janela é conferida contra o que JÁ está salvo, não só contra o corpo;
//   5. item de playlist é RECUSADO quando não é da empresa — nunca filtrado em silêncio;
//   6. a programação pública não leva um byte e ordena pela posição na playlist;
//   7. conteúdo sem arte nunca viaja para a TV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DURACAO_PADRAO, DURACAO_MIN, DURACAO_MAX, MEDIDA, MAX_ITENS_PLAYLIST,
  MOTIVO_NOME, MOTIVO_DURACAO, MOTIVO_DATA, MOTIVO_JANELA, MOTIVO_ITENS, MOTIVO_LIMITE,
  normalizarDuracao, elegivel, statusDoConteudo, validarConteudo, conferirJanela,
  validarNomePlaylist, validarItens, itensParaGravar,
  conteudoParaAdmin, playlistParaAdmin, programacaoPublica,
} from './tvIndoor.js';

const T = (iso) => new Date(iso).getTime();
const AGORA = T('2026-09-14T12:00:00.000Z');

// ── Constantes do canal ──────────────────────────────────────────────────────
test('a TV tem a duração DELA: 10 s de padrão, até 120 s', () => {
  assert.equal(DURACAO_PADRAO, 10, 'o padrão do totem (6 s) numa parede vira inquietação');
  assert.equal(DURACAO_MIN, 3);
  assert.equal(DURACAO_MAX, 120);
  assert.deepEqual(MEDIDA, { largura: 1920, altura: 1080 }, '16:9 deitado; TV vertical está fora do V1');
});

test('normalizarDuracao grampeia na faixa e cai no padrão quando não há número', () => {
  assert.equal(normalizarDuracao(30), 30);
  assert.equal(normalizarDuracao('45'), 45);
  assert.equal(normalizarDuracao(1), DURACAO_MIN);
  assert.equal(normalizarDuracao(999), DURACAO_MAX);
  assert.equal(normalizarDuracao(12.4), 12);
  for (const vazio of [null, undefined, '', '  ', {}, [], true, NaN]) {
    assert.equal(normalizarDuracao(vazio), DURACAO_PADRAO, String(vazio));
  }
});

// ── Elegibilidade e status ───────────────────────────────────────────────────
test('elegivel: ativo sem agenda está sempre no ar; desligado nunca', () => {
  assert.equal(elegivel({ ativo: true }, AGORA), true);
  assert.equal(elegivel({ ativo: false }, AGORA), false);
  assert.equal(elegivel(null, AGORA), false);
  assert.equal(elegivel({ ativo: true }, NaN), false);
});

test('elegivel: início INCLUSIVO e fim EXCLUSIVO', () => {
  const c = { ativo: true, inicioEm: '2026-09-14T12:00:00.000Z', fimEm: '2026-09-14T18:00:00.000Z' };
  assert.equal(elegivel(c, AGORA), true, 'o segundo do início já conta');
  assert.equal(elegivel(c, AGORA - 1), false);
  assert.equal(elegivel(c, T('2026-09-14T18:00:00.000Z')), false, 'o segundo do fim já não conta');
  assert.equal(elegivel(c, T('2026-09-14T17:59:59.000Z')), true);
});

test('statusDoConteudo: ATIVO | AGENDADO | ENCERRADO | INATIVO', () => {
  assert.equal(statusDoConteudo({ ativo: true }, AGORA), 'ATIVO');
  assert.equal(statusDoConteudo({ ativo: false, inicioEm: '2026-10-01T00:00:00Z' }, AGORA), 'INATIVO',
    'desligado vence a agenda');
  assert.equal(statusDoConteudo({ ativo: true, inicioEm: '2026-10-01T00:00:00Z' }, AGORA), 'AGENDADO');
  assert.equal(statusDoConteudo({ ativo: true, fimEm: '2026-09-01T00:00:00Z' }, AGORA), 'ENCERRADO');
  assert.equal(statusDoConteudo(null, AGORA), 'INATIVO');
});

// ── Escrita ──────────────────────────────────────────────────────────────────
test('validarConteudo devolve SÓ os campos presentes (PUT parcial não apaga o resto)', () => {
  const v = validarConteudo({ nome: '  Promoção de terça  ' });
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.dados), ['nome']);
  assert.equal(v.dados.nome, 'Promoção de terça');
});

test('validarConteudo: nome vazio é recusado quando exigido', () => {
  const v = validarConteudo({ nome: '   ' }, { exigirNome: true });
  assert.equal(v.ok, false);
  assert.deepEqual(v.erros, [{ campo: 'nome', motivo: MOTIVO_NOME }]);
  assert.equal(validarConteudo({}, { exigirNome: true }).ok, false);
});

test('validarConteudo: duração fora da faixa é RECUSA na escrita, não grampeio', () => {
  for (const ruim of [0, 2, 121, 'abc', null]) {
    const v = validarConteudo({ duracaoSegundos: ruim });
    assert.equal(v.ok, false, String(ruim));
    assert.equal(v.erros[0].motivo, MOTIVO_DURACAO);
  }
  assert.equal(validarConteudo({ duracaoSegundos: 120 }).dados.duracaoSegundos, 120);
});

test('validarConteudo: data torta é recusada; vazio LIMPA a agenda', () => {
  assert.equal(validarConteudo({ inicioEm: 'ontem' }).erros[0].motivo, MOTIVO_DATA);
  assert.equal(validarConteudo({ fimEm: null }).dados.fimEm, null);
  assert.equal(validarConteudo({ fimEm: '' }).dados.fimEm, null);
  assert.ok(validarConteudo({ inicioEm: '2026-09-14T12:00:00Z' }).dados.inicioEm instanceof Date);
});

test('conferirJanela compara com o que JÁ está salvo', () => {
  // Só o fim no corpo, o início já no banco: o corpo sozinho não denunciaria a inversão.
  const erro = conferirJanela({ fimEm: new Date('2026-09-01T00:00:00Z') }, { inicioEm: new Date('2026-09-10T00:00:00Z') });
  assert.deepEqual(erro, { campo: 'fimEm', motivo: MOTIVO_JANELA });
  assert.equal(conferirJanela({ fimEm: new Date('2026-09-20T00:00:00Z') }, { inicioEm: new Date('2026-09-10T00:00:00Z') }), null);
  assert.equal(conferirJanela({}, null), null, 'sem janela não há o que conferir');
});

test('validarNomePlaylist exige nome', () => {
  assert.deepEqual(validarNomePlaylist(' Salão '), { ok: true, nome: 'Salão' });
  assert.deepEqual(validarNomePlaylist('   '), { ok: false, motivo: MOTIVO_NOME });
  assert.deepEqual(validarNomePlaylist(undefined), { ok: false, motivo: MOTIVO_NOME });
});

// ── Itens da playlist ────────────────────────────────────────────────────────
test('validarItens: só ids DA EMPRESA, e a ordem é a da lista', () => {
  const meus = new Set([1, 2, 3]);
  assert.deepEqual(validarItens([3, 1], meus), { ok: true, ids: [3, 1] });
  assert.deepEqual(validarItens([], meus), { ok: true, ids: [] }, 'playlist vazia é legítima');
});

test('🔴 validarItens RECUSA id de outra empresa — nunca filtra em silêncio', () => {
  // Filtrar deixaria a tela dizendo "salvo" com menos conteúdos do que o gestor escolheu,
  // e ele não saberia qual sumiu. Pior: seria o caminho por onde a programação de uma loja
  // mostraria a arte de outra se o escopo da consulta afrouxasse um dia.
  assert.deepEqual(validarItens([1, 99], new Set([1, 2])), { ok: false, motivo: MOTIVO_ITENS });
});

test('validarItens recusa repetido, id torto e corpo que não é lista', () => {
  const meus = new Set([1, 2]);
  assert.equal(validarItens([1, 1], meus).motivo, MOTIVO_ITENS, 'repetido mostraria a mesma arte duas vezes por volta');
  assert.equal(validarItens([0], meus).motivo, MOTIVO_ITENS);
  assert.equal(validarItens([-3], new Set([-3])).motivo, MOTIVO_ITENS);
  assert.equal(validarItens(['x'], meus).motivo, MOTIVO_ITENS);
  assert.equal(validarItens(null, meus).motivo, MOTIVO_ITENS);
  assert.equal(validarItens('1,2', meus).motivo, MOTIVO_ITENS);
});

test('validarItens tem teto', () => {
  const muitos = Array.from({ length: MAX_ITENS_PLAYLIST + 1 }, (_, i) => i + 1);
  assert.equal(validarItens(muitos, new Set(muitos)).motivo, MOTIVO_LIMITE);
  const noTeto = muitos.slice(0, MAX_ITENS_PLAYLIST);
  assert.equal(validarItens(noTeto, new Set(noTeto)).ok, true);
});

test('itensParaGravar numera pela POSIÇÃO', () => {
  assert.deepEqual(itensParaGravar(7, [5, 9, 2]), [
    { playlistId: 7, conteudoId: 5, ordem: 0 },
    { playlistId: 7, conteudoId: 9, ordem: 1 },
    { playlistId: 7, conteudoId: 2, ordem: 2 },
  ]);
  assert.deepEqual(itensParaGravar(7, null), []);
});

// ── Saídas ───────────────────────────────────────────────────────────────────
const CONTEUDO = {
  id: 4, nome: 'Combo', ativo: true, duracaoSegundos: 15,
  inicioEm: null, fimEm: null, imagemVersao: 3, imagemTipo: 'image/jpeg', imagemBytes: 1234,
};

test('conteudoParaAdmin leva o TAMANHO, nunca os bytes, e a URL versionada', () => {
  const a = conteudoParaAdmin(CONTEUDO, AGORA);
  assert.equal(a.imagemBytes, 1234);
  assert.equal(a.temImagem, true);
  assert.equal(a.status, 'ATIVO');
  assert.equal(a.imagemUrl, '/api/tv-indoor/conteudos/4/imagem?v=3');
  assert.equal('dados' in a, false);
  assert.equal('imagem' in a, false);
});

test('conteudoParaAdmin: sem arte, temImagem é falso', () => {
  assert.equal(conteudoParaAdmin({ ...CONTEUDO, imagemVersao: 0 }, AGORA).temImagem, false);
});

test('playlistParaAdmin ordena pelos itens e conta quantos estão NO AR', () => {
  const p = playlistParaAdmin({
    id: 1, nome: 'Salão',
    itens: [
      { id: 20, ordem: 1, conteudo: { ...CONTEUDO, id: 9, nome: 'B' } },
      { id: 10, ordem: 0, conteudo: { ...CONTEUDO, id: 8, nome: 'A' } },
      { id: 30, ordem: 2, conteudo: { ...CONTEUDO, id: 7, nome: 'C', ativo: false } },
      { id: 40, ordem: 3, conteudo: null },
    ],
  }, AGORA);
  assert.deepEqual(p.itens.map((i) => i.conteudo.nome), ['A', 'B', 'C']);
  assert.ok(p.itens.every((i) => i.tipo === 'IMAGEM'), 'item sem `tipo` é IMAGEM — é o que preserva a playlist antiga');
  assert.equal(p.noAr, 2, 'o desligado conta na lista mas não no ar');
});

test('playlistParaAdmin mistura imagem e MENU BOARD, na ordem', () => {
  const p = playlistParaAdmin({
    id: 1, nome: 'Salão',
    itens: [
      { id: 10, ordem: 0, tipo: 'IMAGEM', conteudo: { ...CONTEUDO, id: 8, nome: 'Promo' } },
      { id: 20, ordem: 1, tipo: 'MENU_BOARD', menuBoard: { id: 3, nome: 'Burgers', ativo: true, layout: 'GRADE' } },
      { id: 30, ordem: 2, tipo: 'MENU_BOARD', menuBoard: null },
    ],
  }, AGORA);
  assert.deepEqual(p.itens.map((i) => i.tipo), ['IMAGEM', 'MENU_BOARD'], 'board sem linha some, não quebra');
  assert.equal(p.itens[1].board.nome, 'Burgers');
  assert.equal(p.noAr, 2);
});

test('playlistParaAdmin aguenta playlist sem itens', () => {
  assert.deepEqual(playlistParaAdmin({ id: 1, nome: 'Vazia' }, AGORA), { id: 1, nome: 'Vazia', itens: [], noAr: 0 });
});

// ── Programação pública ──────────────────────────────────────────────────────
test('🔴 a programação pública não leva NENHUM byte, e a URL é versionada', () => {
  const p = programacaoPublica([{ id: 1, ordem: 0, conteudo: CONTEUDO }], AGORA);
  const [item] = p.itens;
  // `tipo` entrou com o Menu Board: é ele que permite à playlist misturar arte e menu.
  assert.equal(item.tipo, 'imagem');
  assert.deepEqual(Object.keys(item).sort(), [
    'ativo', 'duracaoSegundos', 'fimEm', 'id', 'imagemUrl', 'imagemVersao', 'inicioEm', 'nome', 'tipo',
  ]);
  assert.equal(item.imagemUrl, '/api/public/aparelho/tv/conteudo/4/imagem?v=3');
  assert.equal(JSON.stringify(p).includes('base64'), false);
  assert.equal(p.agoraServidor, '2026-09-14T12:00:00.000Z', 'o relógio do servidor viaja para a TV corrigir o dela');
});

test('a programação segue a ORDEM da playlist, não o id do conteúdo', () => {
  const p = programacaoPublica([
    { id: 99, ordem: 2, conteudo: { ...CONTEUDO, id: 1, nome: 'terceiro' } },
    { id: 98, ordem: 0, conteudo: { ...CONTEUDO, id: 5, nome: 'primeiro' } },
    { id: 97, ordem: 1, conteudo: { ...CONTEUDO, id: 3, nome: 'segundo' } },
  ], AGORA);
  assert.deepEqual(p.itens.map((i) => i.nome), ['primeiro', 'segundo', 'terceiro']);
});

test('a programação leva os AGENDADOS (a TV decide a hora) mas nunca os desligados', () => {
  const p = programacaoPublica([
    { id: 1, ordem: 0, conteudo: { ...CONTEUDO, id: 10, inicioEm: '2026-12-01T00:00:00Z' } },
    { id: 2, ordem: 1, conteudo: { ...CONTEUDO, id: 11, ativo: false } },
  ], AGORA);
  assert.deepEqual(p.itens.map((i) => i.id), [10]);
  assert.equal(p.itens[0].inicioEm, '2026-12-01T00:00:00.000Z');
  assert.equal(p.itens[0].ativo, true, 'o campo viaja para a régua de elegibilidade ser a MESMA nos dois lados');
});

test('conteúdo SEM ARTE não viaja para a TV', () => {
  const p = programacaoPublica([{ id: 1, ordem: 0, conteudo: { ...CONTEUDO, imagemVersao: 0 } }], AGORA);
  assert.deepEqual(p.itens, [], 'existiria só para falhar no carregamento');
});

test('programação de playlist vazia (ou ausente) é lista vazia, nunca erro', () => {
  assert.deepEqual(programacaoPublica([], AGORA).itens, []);
  assert.deepEqual(programacaoPublica(null, AGORA).itens, []);
  assert.deepEqual(programacaoPublica([{ id: 1, ordem: 0, conteudo: null }], AGORA).itens, []);
});

// ── Programação polimórfica (Menu Board) ─────────────────────────────────────
test('🔴 a programação mistura imagem e menu board, na ORDEM da playlist', () => {
  const boards = new Map([['3', { tipo: 'menu_board', id: 3, duracaoSegundos: 20, layout: 'GRADE', titulo: 'Burgers', produtos: [{ id: '9' }] }]]);
  const p = programacaoPublica([
    { id: 10, ordem: 0, tipo: 'IMAGEM', conteudo: CONTEUDO },
    { id: 20, ordem: 1, tipo: 'MENU_BOARD', menuBoardId: 3 },
    { id: 30, ordem: 2, tipo: 'IMAGEM', conteudo: { ...CONTEUDO, id: 5 } },
  ], AGORA, { boards });
  assert.deepEqual(p.itens.map((i) => i.tipo), ['imagem', 'menu_board', 'imagem']);
  assert.equal(p.itens[1].titulo, 'Burgers');
});

test('🔴 board INELEGÍVEL (sem produto disponível) simplesmente não entra', () => {
  // Quem decide a elegibilidade é a rota, ao resolver o catálogo: o board sai do mapa e o
  // player segue para o próximo item, sem saber que ele existiu.
  const p = programacaoPublica([
    { id: 10, ordem: 0, tipo: 'MENU_BOARD', menuBoardId: 3 },
    { id: 20, ordem: 1, tipo: 'IMAGEM', conteudo: CONTEUDO },
  ], AGORA, { boards: new Map() });
  assert.deepEqual(p.itens.map((i) => i.tipo), ['imagem']);
});

test('playlist SÓ de imagem continua idêntica (o contrato antigo não quebrou)', () => {
  const p = programacaoPublica([{ id: 1, ordem: 0, conteudo: CONTEUDO }], AGORA);
  assert.equal(p.itens.length, 1);
  assert.equal(p.itens[0].imagemUrl, '/api/public/aparelho/tv/conteudo/4/imagem?v=3');
});

test('playlist SÓ de board também funciona', () => {
  const boards = new Map([['3', { tipo: 'menu_board', id: 3, duracaoSegundos: 20, layout: 'LISTA', titulo: null, produtos: [] }]]);
  const p = programacaoPublica([{ id: 10, ordem: 0, tipo: 'MENU_BOARD', menuBoardId: 3 }], AGORA, { boards });
  assert.deepEqual(p.itens.map((i) => i.tipo), ['menu_board']);
});
