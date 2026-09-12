// Layout do quiosque — testes puros (node --test, ESM).
// Rodar: node frontend/src/components/totemLayout.test.js
//
// O que estes testes defendem: o texto da regra do grupo diz a verdade sobre o
// que o cliente precisa escolher, e os chips de pendência apontam exatamente os
// grupos que estão segurando o botão — na ordem do Cardápio Web.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { somaDaSelecao, qtdDaOpcao, regraDoGrupo, obrigatoriosPendentes, modoDeOpcoes, aplicarToque, aplicarMenos } from './totemLayout.js';

const grupo = (id, extra = {}) => ({ id, nome: `Grupo ${id}`, min: 0, max: null, status: 'ACTIVE', opcoes: [], ...extra });

// ── somaDaSelecao / qtdDaOpcao ──────────────────────────────────────────────
test('somaDaSelecao: entrada sem qtd conta 1; lixo não derruba', () => {
  assert.equal(somaDaSelecao([{ opcaoId: 1 }, { opcaoId: 2, qtd: 3 }]), 4);
  assert.equal(somaDaSelecao(null), 0);
  assert.equal(somaDaSelecao([{ opcaoId: 1, qtd: 'x' }]), 1);
});

test('qtdDaOpcao casa id em string e em número', () => {
  const sel = [{ opcaoId: '77', qtd: 2 }];
  assert.equal(qtdDaOpcao(sel, 77), 2);
  assert.equal(qtdDaOpcao(sel, '77'), 2);
  assert.equal(qtdDaOpcao(sel, 78), 0);
});

// ── regraDoGrupo ────────────────────────────────────────────────────────────
test('regraDoGrupo: 1–1 é obrigatório e pede uma escolha', () => {
  assert.deepEqual(regraDoGrupo(grupo(1, { min: 1, max: 1 })), { texto: 'escolha 1', obrigatorio: true });
});

test('regraDoGrupo: faixa obrigatória mostra o intervalo', () => {
  assert.deepEqual(regraDoGrupo(grupo(1, { min: 1, max: 3 })), { texto: 'escolha de 1 a 3', obrigatorio: true });
});

test('regraDoGrupo: mínimo sem teto', () => {
  assert.deepEqual(regraDoGrupo(grupo(1, { min: 2, max: null })), { texto: 'escolha ao menos 2', obrigatorio: true });
});

test('regraDoGrupo: opcional com teto e sem teto', () => {
  assert.deepEqual(regraDoGrupo(grupo(1, { min: 0, max: 2 })), { texto: 'escolha até 2', obrigatorio: false });
  assert.deepEqual(regraDoGrupo(grupo(1, { min: 0, max: null })), { texto: 'opcional', obrigatorio: false });
});

test('regraDoGrupo: max 0 é teto de verdade, não ausência de teto', () => {
  assert.deepEqual(regraDoGrupo(grupo(1, { min: 0, max: 0 })), { texto: 'escolha até 0', obrigatorio: false });
});

// ── obrigatoriosPendentes ───────────────────────────────────────────────────
// O combo de produção: BEBIDA (964820) e ACOMPANHAMENTO (964821) obrigatórios,
// MAIONESE opcional. O grupo principal não entra aqui — quem chama já o removeu.
const MAIONESE = grupo('maio', { min: 0, max: 2 });
const BEBIDA = grupo(964820, { min: 1, max: 1 });
const ACOMP = grupo(964821, { min: 1, max: 1 });
const COMBO = [MAIONESE, BEBIDA, ACOMP];

test('combo recém-aberto: os dois obrigatórios pendentes, na ordem do CW', () => {
  const pendentes = obrigatoriosPendentes(COMBO, {});
  assert.deepEqual(pendentes.map((g) => g.id), [964820, 964821]);
});

test('escolhida a bebida, só o acompanhamento continua pendente', () => {
  const pendentes = obrigatoriosPendentes(COMBO, { 964820: [{ opcaoId: 3633069, qtd: 1 }] });
  assert.deepEqual(pendentes.map((g) => g.id), [964821]);
});

test('com os dois escolhidos não sobra pendência', () => {
  const selecoes = { 964820: [{ opcaoId: 1, qtd: 1 }], 964821: [{ opcaoId: 2, qtd: 1 }] };
  assert.deepEqual(obrigatoriosPendentes(COMBO, selecoes), []);
});

test('grupo opcional nunca vira pendência, mesmo vazio', () => {
  assert.equal(obrigatoriosPendentes([MAIONESE], {}).length, 0);
});

test('grupo obrigatório fora de ACTIVE é ignorado — o HUB também o ignora', () => {
  const emFalta = grupo(999, { min: 1, max: 1, status: 'MISSING' });
  assert.deepEqual(obrigatoriosPendentes([emFalta, BEBIDA], {}).map((g) => g.id), [964820]);
});

test('mínimo maior que 1 só sai da pendência quando a soma alcança', () => {
  const dois = grupo(7, { min: 2, max: 2 });
  assert.equal(obrigatoriosPendentes([dois], { 7: [{ opcaoId: 1, qtd: 1 }] }).length, 1);
  assert.equal(obrigatoriosPendentes([dois], { 7: [{ opcaoId: 1, qtd: 2 }] }).length, 0);
  assert.equal(obrigatoriosPendentes([dois], { 7: [{ opcaoId: 1 }, { opcaoId: 2 }] }).length, 0);
});

test('chave da seleção em string e em número dão o mesmo resultado', () => {
  assert.equal(obrigatoriosPendentes([BEBIDA], { '964820': [{ opcaoId: 1, qtd: 1 }] }).length, 0);
});

test('lista vazia ou inválida não quebra', () => {
  assert.deepEqual(obrigatoriosPendentes(null, null), []);
  assert.deepEqual(obrigatoriosPendentes([], {}), []);
});

// ── modoDeOpcoes ────────────────────────────────────────────────────────────
const comFoto = { id: 1, nome: 'Batata frita', imagem: 'https://cdn/x.jpg' };
const semFoto = { id: 2, nome: 'Polenta frita', imagem: null };

test('grupo sem nenhuma foto vira lista de texto', () => {
  assert.equal(modoDeOpcoes(grupo(1, { opcoes: [semFoto, { id: 3, nome: 'X' }] })), 'LISTA');
});

test('basta UMA opção com foto para o grupo inteiro virar grade', () => {
  assert.equal(modoDeOpcoes(grupo(1, { opcoes: [semFoto, comFoto] })), 'GRADE');
});

test('string vazia não conta como foto', () => {
  assert.equal(modoDeOpcoes(grupo(1, { opcoes: [{ id: 4, nome: 'Y', imagem: '   ' }] })), 'LISTA');
});

test('grupo sem opções não quebra', () => {
  assert.equal(modoDeOpcoes(grupo(1)), 'LISTA');
  assert.equal(modoDeOpcoes(null), 'LISTA');
});

// ── aplicarToque / aplicarMenos ─────────────────────────────────────────────
const opt = (id, extra = {}) => ({ id, nome: `Op ${id}`, preco: 0, status: 'ACTIVE', maxQuantidade: null, ...extra });
const gSingle = grupo(1, { choiceType: 'SINGLE', min: 1, max: 1, opcoes: [opt(10), opt(11)] });
const gMult = grupo(2, { choiceType: 'MULTIPLE', min: 0, max: 2, opcoes: [opt(20), opt(21), opt(22)] });
const gSum = grupo(3, { choiceType: 'SUMMABLE', min: 0, max: 3, opcoes: [opt(30, { maxQuantidade: 2 })] });

test('SINGLE substitui a escolha anterior', () => {
  assert.deepEqual(aplicarToque(gSingle, [{ opcaoId: 10, qtd: 1 }], opt(11)), [{ opcaoId: 11, qtd: 1 }]);
});

test('tocar no que já está escolhido desmarca (SINGLE e MULTIPLE)', () => {
  assert.deepEqual(aplicarToque(gSingle, [{ opcaoId: 10, qtd: 1 }], opt(10)), []);
  assert.deepEqual(aplicarToque(gMult, [{ opcaoId: 20, qtd: 1 }], opt(20)), []);
});

test('MULTIPLE no limite devolve a MESMA referência — nada mudou', () => {
  const antes = [{ opcaoId: 20, qtd: 1 }, { opcaoId: 21, qtd: 1 }];
  assert.equal(aplicarToque(gMult, antes, opt(22)), antes);
});

test('SUMMABLE soma até o teto da opção e para', () => {
  const um = aplicarToque(gSum, [], opt(30, { maxQuantidade: 2 }));
  assert.deepEqual(um, [{ opcaoId: 30, qtd: 1 }]);
  const dois = aplicarToque(gSum, um, opt(30, { maxQuantidade: 2 }));
  assert.deepEqual(dois, [{ opcaoId: 30, qtd: 2 }]);
  assert.equal(aplicarToque(gSum, dois, opt(30, { maxQuantidade: 2 })), dois);
});

test('opção em falta não entra', () => {
  const antes = [];
  assert.equal(aplicarToque(gMult, antes, opt(20, { status: 'MISSING' })), antes);
});

test('aplicarMenos tira uma unidade e some na última', () => {
  assert.deepEqual(aplicarMenos([{ opcaoId: 30, qtd: 2 }], opt(30)), [{ opcaoId: 30, qtd: 1 }]);
  assert.deepEqual(aplicarMenos([{ opcaoId: 30, qtd: 1 }], opt(30)), []);
});
