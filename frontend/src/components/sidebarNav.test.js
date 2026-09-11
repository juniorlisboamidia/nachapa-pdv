import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupos, gruposVisiveis, localizarRota } from './sidebarNav.js';

const labels = (nos) => nos.map((n) => n.label);
const grupo = (nos, label) => nos.find((n) => n.label === label);

test('ordem raiz é a definida pelo Junior', () => {
  assert.deepEqual(labels(grupos), ['Relatórios', 'Produtos', 'Gestão', 'Marketing', 'Dep. Pessoal', 'Ferramentas', 'Loja Digital']);
});

test('cada categoria principal tem ícone próprio (Lucide) e nenhum se repete', () => {
  const raiz = Object.fromEntries(grupos.map((g) => [g.label, g.icon]));
  assert.deepEqual(raiz, {
    'Relatórios': 'chartColumn', 'Produtos': 'package', 'Gestão': 'building', 'Marketing': 'megaphone',
    'Dep. Pessoal': 'users', 'Ferramentas': 'wrench', 'Loja Digital': 'monitorSmartphone',
  });
  assert.equal(new Set(Object.values(raiz)).size, grupos.length, 'ícone repetido entre categorias principais');
});

test('subitens de Ferramentas e Loja Digital com identidade própria', () => {
  const icone = (g, label) => grupo(grupo(grupos, g).itens, label).icon;
  assert.equal(icone('Ferramentas', 'Checklist'), 'clipboardCheck');
  assert.equal(icone('Ferramentas', 'Etiquetas'), 'tag');
  assert.equal(icone('Loja Digital', 'Totem'), 'tablet');
  assert.equal(icone('Loja Digital', 'Aparelhos'), 'cpu');
});

test('subitens de Marketing, Produtos e Dep. Pessoal com ícone semântico (Lucide)', () => {
  const icones = (g) => Object.fromEntries(grupo(grupos, g).itens.map((n) => [n.label, n.icon]));
  assert.deepEqual(icones('Marketing'), { 'Grupo VIP': 'crown', 'Avaliador': 'star', 'Indicação': 'userRoundPlus' });
  assert.deepEqual(icones('Produtos'), { 'Ficha técnica': 'clipboardList', 'Insumos': 'boxes', 'Estoque': 'warehouse', 'Fornecedores': 'truck' });
  assert.deepEqual(icones('Dep. Pessoal'), {
    'Colaboradores': 'usersRound', 'Ponto Facial': 'scanFace', 'Motoboys': 'bike', 'Bonificação': 'trophy', 'Banco de talentos': 'userSearch',
  });
});

test('nenhum ícone se repete entre os subitens de uma mesma categoria', () => {
  for (const g of grupos) {
    const usados = g.itens.map((n) => n.icon ?? n.iconImg).filter(Boolean);
    assert.equal(new Set(usados).size, usados.length, `ícone repetido em "${g.label}": ${usados.join(', ')}`);
  }
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

test('Ferramentas volta a ter só Checklist e Etiquetas', () => {
  assert.deepEqual(labels(grupo(grupos, 'Ferramentas').itens), ['Checklist', 'Etiquetas']);
});

test('Loja Digital na ordem Totem, Aparelhos — Totem aponta para os pedidos, Aparelhos para /aparelhos', () => {
  const ld = grupo(grupos, 'Loja Digital').itens;
  assert.deepEqual(ld.map((n) => [n.label, n.to, n.area]), [
    ['Totem', '/totem/pedidos', 'aparelhos'],
    ['Aparelhos', '/aparelhos', 'aparelhos'],
  ]);
  assert.ok(ld.every((n) => !n.itens), 'itens de Loja Digital são folhas (sem subgrupo)');
});

test('operador com aparelhos vê só Loja Digital, com Totem e Aparelhos', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['aparelhos'] });
  assert.deepEqual(labels(v), ['Loja Digital']);
  assert.deepEqual(labels(grupo(v, 'Loja Digital').itens), ['Totem', 'Aparelhos']);
});

test('operador com etiquetas vê Ferramentas com Etiquetas e NÃO vê Loja Digital', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['etiquetas'] });
  assert.deepEqual(labels(v), ['Ferramentas']);
  assert.deepEqual(labels(grupo(v, 'Ferramentas').itens), ['Etiquetas']);
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
  assert.deepEqual(localizarRota('/aparelhos'), { grupo: 'Loja Digital', sub: null });
  assert.deepEqual(localizarRota('/totem/pedidos'), { grupo: 'Loja Digital', sub: null });
  assert.deepEqual(localizarRota('/'), { grupo: null, sub: null });
});
