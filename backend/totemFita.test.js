// A fita do produto no totem — testes puros (node --test, ESM).
// Rodar: node --test backend/totemFita.test.js
//
// O que estes testes defendem:
//   1. a lista de selos é FECHADA: a escrita só aceita um código dela, ou "nada";
//   2. o banco guarda o código e o vidro recebe o RÓTULO — o rótulo muda aqui, não lá;
//   3. a fita é do item base e vai para TODOS os produtos projetados daquele item;
//   4. o catálogo de entrada nunca é mutado, e produto sem fita sai sem a chave;
//   5. leitura tolerante: linha torta é ignorada, nunca lança.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SELOS, CODIGOS, rotuloDoSelo, validarSelo, fitasPorItem, aplicarFitas, fitasParaAdmin } from './totemFita.js';

test('a lista tem os seis selos combinados, com rótulo humano', () => {
  assert.deepEqual(CODIGOS, ['MAIS_PEDIDO', 'OFERTA', 'NOVO', 'COMBO', 'DESTAQUE', 'EXCLUSIVO']);
  assert.equal(SELOS.length, 6);
  assert.equal(rotuloDoSelo('MAIS_PEDIDO'), 'Mais pedido');
  assert.equal(rotuloDoSelo('NAO_EXISTE'), null);
});

test('validarSelo: só código da lista, ou nada (= tirar)', () => {
  assert.deepEqual(validarSelo('NOVO'), { ok: true, selo: 'NOVO' });
  assert.deepEqual(validarSelo(null), { ok: true, selo: null });
  assert.deepEqual(validarSelo(''), { ok: true, selo: null });
  assert.deepEqual(validarSelo(undefined), { ok: true, selo: null });
  for (const ruim of ['novo', 'Novo', 'Mais pedido', 'PROMOÇÃO!!!', 42, {}, [], true]) {
    assert.equal(validarSelo(ruim).ok, false, String(ruim));
    assert.equal(validarSelo(ruim).codigo, 'SELO_INVALIDO');
  }
});

test('fitasPorItem: chave é texto, e linha torta é ignorada', () => {
  const mapa = fitasPorItem([
    { cwItemId: 10, selo: 'COMBO' },
    { cwItemId: '11', selo: 'NOVO' },
    { cwItemId: 12, selo: 'INVENTADO' },   // código que saiu da lista
    { selo: 'NOVO' },                       // sem item
    null, 'x', 7,
  ]);
  assert.deepEqual([...mapa], [['10', 'COMBO'], ['11', 'NOVO']]);
  assert.equal(fitasPorItem(undefined).size, 0);
});

const CATALOGO = {
  loja: { nome: 'x' },
  categorias: [
    {
      nome: 'Combos',
      itens: [{ id: 1 }],
      produtos: [
        { id: 'opcao:1:9:100', nome: 'Combo A', origem: { itemId: 1, grupoId: 9, opcaoId: 100 } },
        { id: 'opcao:1:9:101', nome: 'Combo B', origem: { itemId: 1, grupoId: 9, opcaoId: 101 } },
        { id: 'item:2', nome: 'Kids', origem: { itemId: 2 } },
      ],
    },
    { nome: 'Vazia', itens: [], produtos: [] },
  ],
};

test('aplicarFitas: a fita do item base vai para TODOS os produtos dele, com o rótulo', () => {
  const antes = JSON.stringify(CATALOGO);
  const saida = aplicarFitas(CATALOGO, [{ cwItemId: 1, selo: 'COMBO' }]);
  const [a, b, kids] = saida.categorias[0].produtos;
  assert.deepEqual(a.selos, ['Combo']);
  assert.deepEqual(b.selos, ['Combo']);
  assert.equal('selos' in kids, false, 'produto sem fita sai sem a chave');
  assert.equal(saida.loja, CATALOGO.loja, 'o resto do catálogo passa por referência');
  assert.equal(JSON.stringify(CATALOGO), antes, 'a entrada não é mutada');
});

test('aplicarFitas: sem fita nenhuma devolve o catálogo como veio', () => {
  assert.equal(aplicarFitas(CATALOGO, []), CATALOGO);
  assert.equal(aplicarFitas(CATALOGO, [{ cwItemId: 99, selo: 'NOVO' }]).categorias[0].produtos[0].selos, undefined);
});

test('aplicarFitas: catálogo torto não lança', () => {
  assert.deepEqual(aplicarFitas(null, [{ cwItemId: 1, selo: 'NOVO' }]), { categorias: [] });
  assert.deepEqual(aplicarFitas({ categorias: [null, { produtos: 'x' }] }, [{ cwItemId: 1, selo: 'NOVO' }]),
    { categorias: [{ produtos: [] }, { produtos: [] }] });
});

test('fitasParaAdmin: objeto por id, só códigos válidos', () => {
  assert.deepEqual(fitasParaAdmin([{ cwItemId: 3, selo: 'OFERTA' }, { cwItemId: 4, selo: 'zzz' }]), { 3: 'OFERTA' });
});
