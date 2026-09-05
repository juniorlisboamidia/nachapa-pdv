import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupos, gruposVisiveis, localizarRota } from './sidebarNav.js';

const labels = (nos) => nos.map((n) => n.label);
const grupo = (nos, label) => nos.find((n) => n.label === label);

test('ordem raiz é a definida pelo Junior', () => {
  assert.deepEqual(labels(grupos), ['Relatórios', 'Produtos', 'Gestão', 'Marketing', 'Dep. Pessoal', 'Ferramentas']);
});

test('Produtos na ordem Ficha técnica, Insumos, Estoque, Fornecedores', () => {
  assert.deepEqual(labels(grupo(grupos, 'Produtos').itens), ['Ficha técnica', 'Insumos', 'Estoque', 'Fornecedores']);
});

test('admin vê tudo', () => {
  assert.equal(gruposVisiveis({ tipo: 'admin' }), grupos);
  assert.equal(gruposVisiveis(null), grupos);
});

test('operador só com ponto vê Dep. Pessoal com Colaboradores e Ponto Facial, sem Bonificação/Motoboys/Talentos', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['ponto'] });
  assert.deepEqual(labels(v), ['Dep. Pessoal']);
  assert.deepEqual(labels(grupo(v, 'Dep. Pessoal').itens), ['Colaboradores', 'Ponto Facial']);
});

test('operador com marketing vê Grupo VIP, Avaliador e Indicação', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['marketing'] });
  assert.deepEqual(labels(v), ['Marketing']);
  assert.deepEqual(labels(grupo(v, 'Marketing').itens), ['Grupo VIP', 'Avaliador', 'Indicação']);
});

test('operador com motoboys vê só o subgrupo Motoboys dentro de Dep. Pessoal', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['motoboys'] });
  assert.deepEqual(labels(grupo(v, 'Dep. Pessoal').itens), ['Motoboys']);
  assert.deepEqual(labels(grupo(grupo(v, 'Dep. Pessoal').itens, 'Motoboys').itens), ['Escala', 'Entregadores', 'Calc. Frete', 'Configuração']);
});

test('operador sem nenhuma área não vê grupo algum', () => {
  assert.deepEqual(gruposVisiveis({ tipo: 'operador', areas: [] }), []);
});

test('localizarRota abre o nível certo', () => {
  assert.deepEqual(localizarRota('/rh/ponto-facial/painel'), { grupo: 'Dep. Pessoal', sub: 'Ponto Facial' });
  assert.deepEqual(localizarRota('/indicacao/promotores'), { grupo: 'Marketing', sub: 'Indicação' });
  assert.deepEqual(localizarRota('/estoque'), { grupo: 'Produtos', sub: null });
  assert.deepEqual(localizarRota('/relatorios/meta'), { grupo: 'Relatórios', sub: null });
  assert.deepEqual(localizarRota('/checklist/painel'), { grupo: 'Ferramentas', sub: 'Checklist' });
  assert.deepEqual(localizarRota('/'), { grupo: null, sub: null });
});
