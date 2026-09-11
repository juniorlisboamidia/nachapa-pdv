import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaDoPath, AREAS_DISPONIVEIS } from './areas.js';

test('resolve pelo prefixo mais longo: /ponto-equilibrio é gestao, não ponto', () => {
  assert.equal(areaDoPath('/ponto-equilibrio'), 'gestao');
  assert.equal(areaDoPath('/ponto/marcacoes'), 'ponto');
});

test('rotas novas de todas as fases mapeadas nas áreas certas', () => {
  assert.equal(areaDoPath('/grupo-vip/config'), 'marketing');
  assert.equal(areaDoPath('/automacoes'), 'marketing');
  assert.equal(areaDoPath('/avaliacao/campanhas'), 'marketing');
  assert.equal(areaDoPath('/indicacao/painel'), 'marketing');
  assert.equal(areaDoPath('/motoboys/config'), 'motoboys');
  assert.equal(areaDoPath('/escala-motoboys/3/dias'), 'motoboys');
  assert.equal(areaDoPath('/cmv/contagem'), 'produtos');
  assert.equal(areaDoPath('/dashboard/meta'), 'relatorios');
  assert.equal(areaDoPath('/relatorios/meta'), 'relatorios');
});

test('fail-closed: rota desconhecida e áreas extintas não resolvem', () => {
  assert.equal(areaDoPath('/financeiro'), null);
  assert.equal(areaDoPath('/nada'), null);
  assert.ok(!AREAS_DISPONIVEIS.includes('automacoes'));
  assert.ok(!AREAS_DISPONIVEIS.includes('financeiro'));
  assert.ok(AREAS_DISPONIVEIS.includes('marketing'));
  assert.ok(AREAS_DISPONIVEIS.includes('motoboys'));
});

test('prefixo não casa por substring: /pontoX não é ponto', () => {
  assert.equal(areaDoPath('/pontoX'), null);
});

test('area aparelhos: cadastro e telas do totem', () => {
  assert.equal(areaDoPath('/aparelhos'), 'aparelhos');
  assert.equal(areaDoPath('/aparelhos/3/parear'), 'aparelhos');
  assert.equal(areaDoPath('/aparelhos/3/revogar'), 'aparelhos');
  assert.equal(areaDoPath('/totem'), 'aparelhos');
  assert.equal(areaDoPath('/totem/pedidos'), 'aparelhos');
  assert.ok(AREAS_DISPONIVEIS.includes('aparelhos'));
  // Fail-closed: nada de substring nem de rota parecida.
  assert.equal(areaDoPath('/aparelhosX'), null);
  assert.equal(areaDoPath('/totens'), null);
});
