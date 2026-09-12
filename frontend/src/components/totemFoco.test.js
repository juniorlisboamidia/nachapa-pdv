// Progressão automática entre grupos — testes puros (node --test, ESM).
// Rodar: node frontend/src/components/totemFoco.test.js
//
// A tabela da spec §8.1 está aqui caso a caso. O que estes testes defendem é o
// que mais incomoda num totem: a tela se mexer sozinha na hora errada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atingiuMax, proximoFoco } from './totemFoco.js';

const g = (id, extra = {}) => ({ id, nome: `Grupo ${id}`, min: 0, max: null, status: 'ACTIVE', opcoes: [], ...extra });
const sel = (...ids) => ids.map((id) => ({ opcaoId: id, qtd: 1 }));

// ── atingiuMax: a tabela da spec ────────────────────────────────────────────
test('1–1: escolheu 1 → avança', () => {
  assert.equal(atingiuMax(g(1, { min: 1, max: 1 }), [], sel(10)), true);
});

test('2–2: escolheu 1 → permanece; escolheu 2 → avança', () => {
  const grupo = g(1, { min: 2, max: 2 });
  assert.equal(atingiuMax(grupo, [], sel(10)), false);
  assert.equal(atingiuMax(grupo, sel(10), sel(10, 11)), true);
});

test('0–1: escolheu 1 → avança', () => {
  assert.equal(atingiuMax(g(1, { min: 0, max: 1 }), [], sel(10)), true);
});

test('0–4: só avança ao atingir 4', () => {
  const grupo = g(1, { min: 0, max: 4 });
  assert.equal(atingiuMax(grupo, sel(10, 11), sel(10, 11, 12)), false);
  assert.equal(atingiuMax(grupo, sel(10, 11, 12), sel(10, 11, 12, 13)), true);
});

test('sem teto (max null) nunca avança', () => {
  assert.equal(atingiuMax(g(1, { min: 1, max: null }), [], sel(10)), false);
  assert.equal(atingiuMax(g(1, { min: 1 }), sel(10), sel(10, 11)), false);
});

test('desmarcar nunca avança, mesmo saindo do máximo', () => {
  assert.equal(atingiuMax(g(1, { min: 0, max: 2 }), sel(10, 11), sel(10)), false);
});

test('montagem da tela não avança: sem transição, nada acontece', () => {
  // Editar uma linha já completa chega com antes === depois.
  const grupo = g(1, { min: 1, max: 1 });
  assert.equal(atingiuMax(grupo, sel(10), sel(10)), false);
});

test('SINGLE já completo trocando de opção não avança (max → max)', () => {
  assert.equal(atingiuMax(g(1, { min: 1, max: 1 }), sel(10), sel(11)), false);
});

test('SUMMABLE conta quantidade, não número de linhas', () => {
  const grupo = g(1, { min: 0, max: 3 });
  assert.equal(atingiuMax(grupo, [{ opcaoId: 10, qtd: 2 }], [{ opcaoId: 10, qtd: 3 }]), true);
  assert.equal(atingiuMax(grupo, [{ opcaoId: 10, qtd: 1 }], [{ opcaoId: 10, qtd: 2 }]), false);
});

test('max 0 é teto de verdade e não dispara nada', () => {
  assert.equal(atingiuMax(g(1, { min: 0, max: 0 }), [], []), false);
});

test('grupo ausente ou lixo não quebra', () => {
  assert.equal(atingiuMax(null, [], sel(10)), false);
  assert.equal(atingiuMax(g(1, { max: 'x' }), [], sel(10)), false);
});

// ── proximoFoco ─────────────────────────────────────────────────────────────
// Ordem do CW: MAIONESE (opcional), BEBIDA, ACOMPANHAMENTO.
const MAIONESE = g('maio', { min: 0, max: 2 });
const BEBIDA = g(964820, { min: 1, max: 1 });
const ACOMP = g(964821, { min: 1, max: 1 });
const COMBO = [MAIONESE, BEBIDA, ACOMP];

test('do primeiro grupo vai para o seguinte, na ordem do CW', () => {
  assert.deepEqual(proximoFoco(COMBO, 'maio'), { tipo: 'GRUPO', id: 964820 });
  assert.deepEqual(proximoFoco(COMBO, 964820), { tipo: 'GRUPO', id: 964821 });
});

test('do último grupo o destino é o botão de adicionar', () => {
  assert.deepEqual(proximoFoco(COMBO, 964821), { tipo: 'CTA' });
});

test('grupo em falta é pulado — ele não aceita toque', () => {
  const emFalta = g(555, { min: 0, max: 1, status: 'MISSING' });
  assert.deepEqual(proximoFoco([BEBIDA, emFalta, ACOMP], 964820), { tipo: 'GRUPO', id: 964821 });
});

test('se todos os seguintes estão em falta, vai para o botão', () => {
  const emFalta = g(555, { min: 0, max: 1, status: 'MISSING' });
  assert.deepEqual(proximoFoco([BEBIDA, emFalta], 964820), { tipo: 'CTA' });
});

test('id em string casa com id numérico do catálogo', () => {
  assert.deepEqual(proximoFoco(COMBO, '964820'), { tipo: 'GRUPO', id: 964821 });
});

test('grupo que não está na lista não move a tela para lugar nenhum', () => {
  assert.deepEqual(proximoFoco(COMBO, 999), { tipo: 'CTA' });
  assert.deepEqual(proximoFoco(null, 1), { tipo: 'CTA' });
});
