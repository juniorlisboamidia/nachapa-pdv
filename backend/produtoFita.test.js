// A fita do produto (neutra de canal) — testes puros (node --test, ESM).
// Rodar: node --test backend/produtoFita.test.js
//
// O que estes testes defendem:
//   1. o catálogo de fitas é o MESMO do HUB: cinco códigos, textos e cores iguais;
//   2. a escrita só aceita um código da lista, ou "nada";
//   3. o banco guarda o código e o vidro recebe texto + cor resolvidos;
//   4. a fita é do item base e vai para TODOS os produtos projetados daquele item;
//   5. o catálogo de entrada nunca é mutado, e produto sem fita sai sem a chave;
//   6. leitura tolerante: linha torta (inclusive código antigo) é ignorada, nunca lança.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SELOS, CODIGOS, fitaDoSelo, validarSelo, fitasPorItem, aplicarFitas, fitasParaAdmin } from './produtoFita.js';

test('o catálogo é o espelho das fitas do HUB — cinco, com texto e cor', () => {
  assert.deepEqual(SELOS, [
    { codigo: 'MAIS_PEDIDO', rotulo: 'Mais pedido', cor: '#B45309' },
    { codigo: 'RECOMENDADO', rotulo: 'Recomendado', cor: '#1D4ED8' },
    { codigo: 'NOVIDADE', rotulo: 'Novidade', cor: '#ff5f00' },
    { codigo: 'EDICAO_LIMITADA', rotulo: 'Edição limitada', cor: '#BE185D' },
    { codigo: 'OFERTA', rotulo: 'Oferta', cor: '#15803D' },
  ]);
  assert.deepEqual(CODIGOS, ['MAIS_PEDIDO', 'RECOMENDADO', 'NOVIDADE', 'EDICAO_LIMITADA', 'OFERTA']);
  assert.deepEqual(fitaDoSelo('NOVIDADE'), { texto: 'Novidade', cor: '#ff5f00' });
  assert.equal(fitaDoSelo('NOVO'), null, 'código da primeira rodada não existe mais');
});

test('validarSelo: só código da lista, ou nada (= tirar)', () => {
  assert.deepEqual(validarSelo('OFERTA'), { ok: true, selo: 'OFERTA' });
  assert.deepEqual(validarSelo(null), { ok: true, selo: null });
  assert.deepEqual(validarSelo(''), { ok: true, selo: null });
  assert.deepEqual(validarSelo(undefined), { ok: true, selo: null });
  for (const ruim of ['oferta', 'Oferta', 'Mais pedido', 'NOVO', 'COMBO', 'PROMOÇÃO!!!', 42, {}, [], true]) {
    assert.equal(validarSelo(ruim).ok, false, String(ruim));
    assert.equal(validarSelo(ruim).codigo, 'SELO_INVALIDO');
  }
});

test('fitasPorItem: chave é texto, e linha torta é ignorada', () => {
  const mapa = fitasPorItem([
    { cwItemId: 10, selo: 'OFERTA' },
    { cwItemId: '11', selo: 'NOVIDADE' },
    { cwItemId: 12, selo: 'COMBO' },       // código da primeira rodada, fora da lista
    { selo: 'NOVIDADE' },                   // sem item
    null, 'x', 7,
  ]);
  assert.deepEqual([...mapa], [['10', 'OFERTA'], ['11', 'NOVIDADE']]);
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

test('aplicarFitas: a fita do item base vai para TODOS os produtos dele, com texto e cor', () => {
  const antes = JSON.stringify(CATALOGO);
  const saida = aplicarFitas(CATALOGO, [{ cwItemId: 1, selo: 'MAIS_PEDIDO' }]);
  const [a, b, kids] = saida.categorias[0].produtos;
  assert.deepEqual(a.fita, { texto: 'Mais pedido', cor: '#B45309' });
  assert.deepEqual(b.fita, { texto: 'Mais pedido', cor: '#B45309' });
  assert.equal('fita' in kids, false, 'produto sem fita sai sem a chave');
  assert.equal(saida.loja, CATALOGO.loja, 'o resto do catálogo passa por referência');
  assert.equal(JSON.stringify(CATALOGO), antes, 'a entrada não é mutada');
});

test('aplicarFitas: sem fita nenhuma devolve o catálogo como veio', () => {
  assert.equal(aplicarFitas(CATALOGO, []), CATALOGO);
  assert.equal(aplicarFitas(CATALOGO, [{ cwItemId: 99, selo: 'OFERTA' }]).categorias[0].produtos[0].fita, undefined);
});

test('aplicarFitas: catálogo torto não lança', () => {
  assert.deepEqual(aplicarFitas(null, [{ cwItemId: 1, selo: 'OFERTA' }]), { categorias: [] });
  assert.deepEqual(aplicarFitas({ categorias: [null, { produtos: 'x' }] }, [{ cwItemId: 1, selo: 'OFERTA' }]),
    { categorias: [{ produtos: [] }, { produtos: [] }] });
});

test('fitasParaAdmin: objeto por id, só códigos válidos', () => {
  assert.deepEqual(fitasParaAdmin([{ cwItemId: 3, selo: 'OFERTA' }, { cwItemId: 4, selo: 'zzz' }]), { 3: 'OFERTA' });
});
