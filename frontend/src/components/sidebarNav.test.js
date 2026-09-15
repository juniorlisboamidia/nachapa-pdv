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
  assert.deepEqual(totem.map((n) => n.icon), ['relatorios', 'config', 'cpu', 'ficha', 'star', 'marketing', 'financeiro']);
  // Banners é SUBGRUPO: ele abre outro nível na sidebar em vez de abas dentro da página.
  const banners = totem.find((n) => n.label === 'Banners');
  assert.equal(banners.to, undefined, 'subgrupo não é link');
  assert.deepEqual(banners.itens.map((n) => [n.label, n.to]), [
    ['Capa', '/totem/banners/capa'],
    ['Tela de espera', '/totem/banners/espera'],
  ]);
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

test('Loja Digital é suíte de canais: Totem (sete itens) e TV Indoor', () => {
  const ld = grupo(grupos, 'Loja Digital').itens;
  assert.deepEqual(ld.map((n) => n.label), ['Totem', 'TV Indoor']);
  const totem = grupo(ld, 'Totem');
  // A área continua sendo a MESMA de todas as telas (`aparelhos`): reorganizar é
  // agrupamento visual, não mudança de permissão.
  assert.equal(totem.area, 'aparelhos');
  assert.equal(totem.to, undefined, 'o subgrupo não é link: quem tem rota são as folhas');
  assert.deepEqual(totem.itens.map((n) => n.label), [
    'Pedidos', 'Configurações', 'Gestão de totens', 'Cardápio',
    'Personalização', 'Banners', 'Formas de pagamento',
  ]);
  // Seis folhas com rota própria; Banners é o único que abre outro nível.
  assert.deepEqual(totem.itens.filter((n) => n.to).map((n) => n.to), [
    '/totem/pedidos', '/totem/configuracoes', '/totem/aparelhos',
    '/totem/cardapio', '/totem/pagamentos',
  ]);
  // Personalização também abre outro nível: aparência e destaques são duas telas da mesma
  // coisa, e o PDV resolve profundidade com subcategoria.
  const personalizacao = totem.itens.find((n) => n.label === 'Personalização');
  assert.equal(personalizacao.to, undefined, 'subgrupo não é link');
  assert.deepEqual(personalizacao.itens.map((n) => [n.label, n.to]), [
    ['Aparência', '/totem/personalizacao'],
    ['Destaques da vitrine', '/totem/personalizacao/destaques'],
  ]);
  assert.equal(personalizacao.itens[0].end, true, '`end` para a Aparência não acender em /destaques');
  // Pedidos PRIMEIRO, e isto não é ordem alfabética nem gosto: a `primeiraFolha` da
  // Visão Geral e o redirect de `/totem` apontam para a primeira folha. Trocar a
  // ordem mudaria o destino dos dois em silêncio.
  assert.equal(totem.itens[0].to, '/totem/pedidos');
  // Folha sem `area` herda a do pai, inclusive as que estão um nível mais fundo.
  assert.ok(totem.itens.find((n) => n.label === 'Banners').itens.every((n) => n.area === undefined));
  // Folha sem `area` herda a do pai — é o que faz o filtro do operador funcionar.
  assert.ok(totem.itens.every((n) => n.area === undefined));
  // A TV Indoor deixou de ser folha-placeholder e virou SUBGRUPO, com a mesma estrutura do
  // Totem: os aparelhos, o acervo e a programação são naturezas diferentes.
  const tv = grupo(ld, 'TV Indoor');
  assert.equal(tv.area, 'aparelhos', 'a área é a MESMA do totem: quem cadastra o aparelho programa o que ele mostra');
  assert.equal(tv.to, undefined, 'o subgrupo não é link: quem tem rota são as folhas');
  assert.deepEqual(tv.itens.map((n) => [n.label, n.to]), [
    ['Telas', '/tv-indoor/telas'],
    ['Conteúdos', '/tv-indoor/conteudos'],
    ['Vídeos', '/tv-indoor/videos'],
    ['Playlists', '/tv-indoor/playlists'],
    // Menu Boards vem por último: é o passo que se aprende depois, e o único que exige
    // cardápio no Cardápio Web para fazer sentido.
    ['Menu Boards', '/tv-indoor/menu-boards'],
    ['Programação', '/tv-indoor/programacao'],
    // A aparência é o ajuste fino: vem depois de existir algo na tela para ver pintado.
    ['Aparência', '/tv-indoor/aparencia'],
  ]);
  // Telas PRIMEIRO, e isto não é gosto: a `primeiraFolha` da Visão Geral e o redirect de
  // `/tv-indoor` apontam para a primeira folha. Sem uma TV cadastrada, conteúdo e playlist
  // não têm onde aparecer.
  assert.equal(tv.itens[0].to, '/tv-indoor/telas');
  // Folha sem `area` herda a do pai — é o que faz o filtro do operador funcionar.
  assert.ok(tv.itens.every((n) => n.area === undefined));
});

test('operador com aparelhos vê só Loja Digital, com as duas suítes', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['aparelhos'] });
  assert.deepEqual(labels(v), ['Loja Digital']);
  assert.deepEqual(labels(grupo(v, 'Loja Digital').itens), ['Totem', 'TV Indoor']);
  assert.deepEqual(labels(grupo(grupo(v, 'Loja Digital').itens, 'Totem').itens), [
    'Pedidos', 'Configurações', 'Gestão de totens', 'Cardápio', 'Personalização', 'Banners', 'Formas de pagamento',
  ]);
  // A mesma área abre os DOIS canais: as folhas da TV herdam `aparelhos` do subgrupo.
  assert.deepEqual(labels(grupo(grupo(v, 'Loja Digital').itens, 'TV Indoor').itens), ['Telas', 'Conteúdos', 'Vídeos', 'Playlists', 'Menu Boards', 'Programação', 'Aparência']);
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
  assert.deepEqual(localizarRota('/rh/ponto-facial/painel').caminho, ['Dep. Pessoal', 'Ponto Facial']);
  assert.deepEqual(localizarRota('/indicacao/promotores').caminho, ['Marketing', 'Indicação']);
  assert.deepEqual(localizarRota('/estoque').caminho, ['Produtos']);
  assert.deepEqual(localizarRota('/relatorios/meta').caminho, ['Relatórios']);
  assert.deepEqual(localizarRota('/checklist/painel').caminho, ['Ferramentas', 'Checklist']);
  assert.deepEqual(localizarRota('/tv-indoor/telas').caminho, ['Loja Digital', 'TV Indoor']);
  assert.deepEqual(localizarRota('/tv-indoor/conteudos').caminho, ['Loja Digital', 'TV Indoor']);
  assert.deepEqual(localizarRota('/tv-indoor/playlists').caminho, ['Loja Digital', 'TV Indoor']);
  assert.deepEqual(localizarRota('/totem/pedidos').caminho, ['Loja Digital', 'Totem']);
  assert.deepEqual(localizarRota('/totem/cardapio').caminho, ['Loja Digital', 'Totem']);
  assert.deepEqual(localizarRota('/totem/aparelhos').caminho, ['Loja Digital', 'Totem']);
  assert.deepEqual(localizarRota('/totem/personalizacao').caminho, ['Loja Digital', 'Totem', 'Personalização']);
  assert.deepEqual(localizarRota('/totem/personalizacao/destaques').caminho, ['Loja Digital', 'Totem', 'Personalização']);
  // 🔴 TRÊS níveis: é o caminho inteiro que a sidebar usa para abrir no lugar certo.
  assert.deepEqual(localizarRota('/totem/banners/capa').caminho, ['Loja Digital', 'Totem', 'Banners']);
  assert.deepEqual(localizarRota('/totem/banners/espera').caminho, ['Loja Digital', 'Totem', 'Banners']);
  // `grupo` e `sub` continuam sendo os dois primeiros degraus do mesmo caminho.
  assert.deepEqual(localizarRota('/totem/banners/capa').grupo, 'Loja Digital');
  assert.deepEqual(localizarRota('/totem/banners/capa').sub, 'Totem');
  assert.deepEqual(localizarRota('/').caminho, []);
  assert.equal(localizarRota('/').grupo, null);
  assert.deepEqual(localizarRota('/rh/ponto-facial/painel').caminho, ['Dep. Pessoal', 'Ponto Facial']);
  assert.deepEqual(localizarRota('/estoque').caminho, ['Produtos']);
});
