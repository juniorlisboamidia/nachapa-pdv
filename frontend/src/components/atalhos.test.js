import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupos } from './sidebarNav.js';
import {
  atalhosDaArvore, primeiraFolha, chaveFavoritos, alternarFavorito, favoritosValidos,
  lerFavoritos, gravarFavoritos, MAX_FAVORITOS,
} from './atalhos.js';

test('seções na ordem da sidebar, uma por grupo raiz com itens', () => {
  assert.deepEqual(atalhosDaArvore(grupos).map((s) => s.titulo), ['Relatórios', 'Produtos', 'Gestão', 'Marketing', 'Dep. Pessoal', 'Ferramentas']);
});

test('card por nó de 2º nível; subgrupo aponta pra primeira folha', () => {
  const s = atalhosDaArvore(grupos);
  const dp = s.find((x) => x.titulo === 'Dep. Pessoal');
  assert.deepEqual(dp.itens.map((i) => [i.label, i.to]), [
    ['Colaboradores', '/rh/colaboradores'], ['Ponto Facial', '/rh/ponto-facial/painel'], ['Motoboys', '/escala-motoboys'],
    ['Bonificação', '/rh/bonificacao/mes'], ['Banco de talentos', '/rh/banco-de-talentos/banco'],
  ]);
  assert.equal(s.find((x) => x.titulo === 'Marketing').itens.find((i) => i.label === 'Avaliador').to, '/avaliacoes');
  assert.equal(s.find((x) => x.titulo === 'Ferramentas').itens.find((i) => i.label === 'Checklist').to, '/checklist/painel');
});

test('iconImg dos relatórios é preservado no card', () => {
  const rel = atalhosDaArvore(grupos).find((x) => x.titulo === 'Relatórios');
  assert.equal(rel.itens[0].iconImg, '/meta-ads.svg');
  assert.equal(rel.itens[4].icon, 'relatorios');
});

test('grupo raiz sem itens (link direto) não vira seção; subgrupo vazio é ignorado', () => {
  const s = atalhosDaArvore([{ label: 'Solto', to: '/x' }, { label: 'G', itens: [{ label: 'vazio', itens: [] }, { label: 'ok', to: '/ok', icon: 'i' }] }]);
  assert.deepEqual(s, [{ titulo: 'G', itens: [{ to: '/ok', label: 'ok', icon: 'i', iconImg: undefined, grupo: 'G' }] }]);
  assert.deepEqual(atalhosDaArvore(null), []);
});

test('primeiraFolha desce em profundidade', () => {
  assert.equal(primeiraFolha({ itens: [{ itens: [{ to: '/deep' }] }] }), '/deep');
  assert.equal(primeiraFolha({ itens: [] }), null);
  assert.equal(primeiraFolha(null), null);
});

test('chaveFavoritos = loja + tipo + id; sem id = anon', () => {
  assert.equal(chaveFavoritos({ tipo: 'operador', id: 7 }, 3), 'hb-favoritos:3:operador:7');
  assert.equal(chaveFavoritos({ tipo: 'admin' }, 3), 'hb-favoritos:3:admin:anon');
  assert.equal(chaveFavoritos(null, null), 'hb-favoritos:loja:anon:anon');
});

test('alternarFavorito adiciona, remove e respeita o limite de 6', () => {
  assert.equal(MAX_FAVORITOS, 6);
  assert.deepEqual(alternarFavorito([], '/a'), { lista: ['/a'], cheio: false });
  assert.deepEqual(alternarFavorito(['/a'], '/a'), { lista: [], cheio: false });
  const seis = ['/1', '/2', '/3', '/4', '/5', '/6'];
  assert.deepEqual(alternarFavorito(seis, '/7'), { lista: seis, cheio: true });
  assert.deepEqual(alternarFavorito(seis, '/3').lista, ['/1', '/2', '/4', '/5', '/6']);
  assert.deepEqual(alternarFavorito(undefined, '/a').lista, ['/a']);
});

test('favoritosValidos ignora rota fora dos atalhos e mantém a ordem de fixação', () => {
  const s = [{ titulo: 'G', itens: [{ to: '/a' }, { to: '/b' }] }];
  assert.deepEqual(favoritosValidos(['/b', '/x', '/a'], s), ['/b', '/a']);
  assert.deepEqual(favoritosValidos(null, s), []);
});

test('lerFavoritos tolera storage vazio, inválido ou ausente; gravar nunca lança', () => {
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(lerFavoritos(st, 'k'), []);
  gravarFavoritos(st, 'k', ['/a']);
  assert.deepEqual(lerFavoritos(st, 'k'), ['/a']);
  mem.set('k', '{bad');
  assert.deepEqual(lerFavoritos(st, 'k'), []);
  mem.set('k', '[1, "/b", null]');
  assert.deepEqual(lerFavoritos(st, 'k'), ['/b']);
  assert.deepEqual(lerFavoritos(null, 'k'), []);
  gravarFavoritos(null, 'k', []);
  gravarFavoritos({ setItem: () => { throw new Error('cheio'); } }, 'k', ['/a']);
});
