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
  assert.equal(icone('Loja Digital', 'TV Indoor'), 'megaphone');
  // As folhas do Totem também se distinguem entre si: numa lista de seis, ícone
  // repetido faz duas telas diferentes parecerem a mesma de relance.
  const totem = grupo(grupo(grupos, 'Loja Digital').itens, 'Totem').itens;
  assert.deepEqual(totem.map((n) => n.icon), ['relatorios', 'config', 'cpu', 'ficha', 'star', 'financeiro']);
  assert.equal(new Set(totem.map((n) => n.icon)).size, totem.length);
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
  // Só o 2º nível. Mais fundo o ícone deixa de ser identidade e vira decoração (Ponto
  // Facial repete `ponto` de propósito, em Painel/Marcações/Coletor), então exigir
  // unicidade lá dentro seria inventar uma regra que a árvore nunca teve.
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

test('Loja Digital é suíte de canais: Totem (seis folhas) e TV Indoor', () => {
  const ld = grupo(grupos, 'Loja Digital').itens;
  assert.deepEqual(ld.map((n) => n.label), ['Totem', 'TV Indoor']);
  const totem = grupo(ld, 'Totem');
  // A área continua sendo a MESMA de todas as telas (`aparelhos`): reorganizar é
  // agrupamento visual, não mudança de permissão.
  assert.equal(totem.area, 'aparelhos');
  assert.equal(totem.to, undefined, 'o subgrupo não é link: quem tem rota são as folhas');
  assert.deepEqual(totem.itens.map((n) => [n.label, n.to]), [
    ['Pedidos', '/totem/pedidos'],
    ['Configurações', '/totem/configuracoes'],
    ['Gestão de totens', '/totem/aparelhos'],
    ['Cardápio', '/totem/cardapio'],
    ['Aparência do totem', '/totem/aparencia'],
    ['Formas de pagamento', '/totem/pagamentos'],
  ]);
  // Pedidos PRIMEIRO, e isto não é ordem alfabética nem gosto: a `primeiraFolha` da
  // Visão Geral e o redirect de `/totem` apontam para a primeira folha. Trocar a
  // ordem mudaria o destino dos dois em silêncio.
  assert.equal(totem.itens[0].to, '/totem/pedidos');
  // A folha da Aparência aponta para a RAIZ da seção, não para a aba: é assim que
  // `matchLeaf` (prefixo) reconhece `/totem/aparencia/banners` como sendo dela.
  assert.equal(totem.itens.find((n) => n.label === 'Aparência do totem').to, '/totem/aparencia');
  // Folha sem `area` herda a do pai — é o que faz o filtro do operador funcionar.
  assert.ok(totem.itens.every((n) => n.area === undefined));
  assert.deepEqual(grupo(ld, 'TV Indoor'), { to: '/tv-indoor', label: 'TV Indoor', icon: 'megaphone', area: 'aparelhos' });
});

test('operador com aparelhos vê só Loja Digital, com as duas suítes', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['aparelhos'] });
  assert.deepEqual(labels(v), ['Loja Digital']);
  assert.deepEqual(labels(grupo(v, 'Loja Digital').itens), ['Totem', 'TV Indoor']);
  assert.deepEqual(labels(grupo(grupo(v, 'Loja Digital').itens, 'Totem').itens), [
    'Pedidos', 'Configurações', 'Gestão de totens', 'Cardápio', 'Aparência do totem', 'Formas de pagamento',
  ]);
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
  assert.deepEqual(localizarRota('/tv-indoor'), { grupo: 'Loja Digital', sub: null });
  assert.deepEqual(localizarRota('/totem/pedidos'), { grupo: 'Loja Digital', sub: 'Totem' });
  assert.deepEqual(localizarRota('/totem/cardapio'), { grupo: 'Loja Digital', sub: 'Totem' });
  assert.deepEqual(localizarRota('/totem/aparelhos'), { grupo: 'Loja Digital', sub: 'Totem' });
  // As duas abas da Aparência abrem o mesmo nível da sidebar.
  assert.deepEqual(localizarRota('/totem/aparencia/personalizacao'), { grupo: 'Loja Digital', sub: 'Totem' });
  assert.deepEqual(localizarRota('/totem/aparencia/banners'), { grupo: 'Loja Digital', sub: 'Totem' });
  assert.deepEqual(localizarRota('/'), { grupo: null, sub: null });
});
