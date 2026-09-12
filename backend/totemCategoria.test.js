// Nome de exibição das categorias — testes puros (node --test, ESM).
// Rodar: node backend/totemCategoria.test.js
//
// O que estes testes defendem: a sugestão nunca engole o nome da loja, o apelido
// é exceção (categoria sem linha continua com o nome do CW), e nada aqui encosta
// em ordem, itens ou disponibilidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirNome, aplicarNomes, mesclarAdmin, nomeDaCategoria } from './totemCategoria.js';

// ── sugerirNome ─────────────────────────────────────────────────────────────
// Os nomes reais do Hamburgão, como vêm do Cardápio Web.
test('tira o emoji do começo, com e sem espaço', () => {
  assert.equal(sugerirNome('🥇 OS MAIS PEDIDOS'), 'OS MAIS PEDIDOS');
  assert.equal(sugerirNome('🏆COMBOS DO HAMBURGÃO | PRA 1, 2 OU MAIS'), 'COMBOS DO HAMBURGÃO | PRA 1, 2 OU MAIS');
  assert.equal(sugerirNome('🍔 TRADICIONAIS'), 'TRADICIONAIS');
  assert.equal(sugerirNome('🌭 CACHORRO QUENTE'), 'CACHORRO QUENTE');
});

test('tira emoji do fim e do meio, e colapsa o espaço que sobra', () => {
  assert.equal(sugerirNome('BEBIDAS 🥤'), 'BEBIDAS');
  assert.equal(sugerirNome('DOCES 🍰 E SOBREMESAS'), 'DOCES E SOBREMESAS');
});

test('emoji composto (com seletor de variação e ZWJ) sai inteiro', () => {
  assert.equal(sugerirNome('☕️ CAFÉ'), 'CAFÉ');
  assert.equal(sugerirNome('👨‍🍳 DO CHEF'), 'DO CHEF');
});

test('acento e cedilha ficam intactos', () => {
  assert.equal(sugerirNome('🍟 PORÇÕES'), 'PORÇÕES');
  assert.equal(sugerirNome('SOBREMESA'), 'SOBREMESA');
});

test('pontuação decorativa colada ao emoji é aparada nas pontas', () => {
  assert.equal(sugerirNome('🔥 - PROMOÇÕES'), 'PROMOÇÕES');
  assert.equal(sugerirNome('BEBIDAS ·🥤'), 'BEBIDAS');
});

test('barra no MEIO do nome é conteúdo e não se toca', () => {
  assert.equal(sugerirNome('COMBOS | PRA 2'), 'COMBOS | PRA 2');
});

test('nome que é só emoji volta inteiro — sumir com ele seria pior', () => {
  assert.equal(sugerirNome('🍔'), '🍔');
  assert.equal(sugerirNome('🍔🍟'), '🍔🍟');
});

test('nome sem emoji não muda', () => {
  assert.equal(sugerirNome('EXTRAS'), 'EXTRAS');
  assert.equal(sugerirNome(''), '');
  assert.equal(sugerirNome(null), '');
});

// ── aplicarNomes ────────────────────────────────────────────────────────────
const catalogo = () => ({
  categorias: [
    { id: 1, nome: '🥇 OS MAIS PEDIDOS', index: 0, itens: [{ id: 10 }] },
    { id: 2, nome: '🍔 TRADICIONAIS', index: 1, itens: [{ id: 20 }, { id: 21 }] },
  ],
});

test('aplica o apelido só onde existe, e como campo NOVO', () => {
  const r = aplicarNomes(catalogo(), [{ cwCategoriaId: 1, nomeExibido: 'MAIS PEDIDOS' }]);
  assert.equal(r.categorias[0].nomeExibido, 'MAIS PEDIDOS');
  assert.equal(r.categorias[0].nome, '🥇 OS MAIS PEDIDOS'); // o do CW continua ali
  assert.equal(r.categorias[1].nomeExibido, undefined);
});

test('id em string casa com id numérico do catálogo', () => {
  const r = aplicarNomes(catalogo(), [{ cwCategoriaId: '2', nomeExibido: 'BURGERS' }]);
  assert.equal(r.categorias[1].nomeExibido, 'BURGERS');
});

test('apelido vazio ou só espaço não vira apelido', () => {
  const r = aplicarNomes(catalogo(), [{ cwCategoriaId: 1, nomeExibido: '   ' }]);
  assert.equal(r.categorias[0].nomeExibido, undefined);
});

test('sem configuração nenhuma o catálogo volta IDÊNTICO (mesma referência)', () => {
  const c = catalogo();
  assert.equal(aplicarNomes(c, []), c);
  assert.equal(aplicarNomes(c, null), c);
});

test('não mexe em ordem, itens nem em nada além do nome', () => {
  const antes = catalogo();
  const r = aplicarNomes(antes, [{ cwCategoriaId: 1, nomeExibido: 'X' }]);
  assert.deepEqual(r.categorias.map((c) => c.id), [1, 2]);
  assert.deepEqual(r.categorias.map((c) => c.index), [0, 1]);
  assert.equal(r.categorias[0].itens.length, 1);
  assert.equal(r.categorias[1].itens.length, 2);
  // e não muta o original
  assert.equal(antes.categorias[0].nomeExibido, undefined);
});

test('catálogo sem categorias não quebra', () => {
  assert.deepEqual(aplicarNomes(null, [{ cwCategoriaId: 1, nomeExibido: 'X' }]), null);
  assert.deepEqual(aplicarNomes({}, [{ cwCategoriaId: 1, nomeExibido: 'X' }]), {});
});

// ── mesclarAdmin ────────────────────────────────────────────────────────────
test('a tela recebe os dois nomes, a sugestão e a contagem de itens', () => {
  const linhas = mesclarAdmin(catalogo(), [{ cwCategoriaId: 2, nomeExibido: 'BURGERS' }]);
  assert.deepEqual(linhas[0], {
    cwCategoriaId: 1, nomeCw: '🥇 OS MAIS PEDIDOS', nomeExibido: null,
    sugestao: 'OS MAIS PEDIDOS', temSugestao: true, itens: 1,
  });
  assert.equal(linhas[1].nomeExibido, 'BURGERS');
  assert.equal(linhas[1].sugestao, 'TRADICIONAIS');
});

test('categoria sem emoji não anuncia sugestão', () => {
  const linhas = mesclarAdmin({ categorias: [{ id: 9, nome: 'EXTRAS', itens: [] }] }, []);
  assert.equal(linhas[0].temSugestao, false);
  assert.equal(linhas[0].sugestao, 'EXTRAS');
});

// ── nomeDaCategoria ─────────────────────────────────────────────────────────
test('a tela mostra o apelido quando existe e o do CW quando não', () => {
  assert.equal(nomeDaCategoria({ nome: '🍔 TRADICIONAIS', nomeExibido: 'BURGERS' }), 'BURGERS');
  assert.equal(nomeDaCategoria({ nome: '🍔 TRADICIONAIS' }), '🍔 TRADICIONAIS');
  assert.equal(nomeDaCategoria({ nome: '🍔 X', nomeExibido: '  ' }), '🍔 X');
  assert.equal(nomeDaCategoria(null), '');
});
