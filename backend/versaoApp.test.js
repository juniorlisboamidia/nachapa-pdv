// A versão do aplicativo — testes puros (node --test, ESM).
// Rodar: node --test backend/versaoApp.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudouDeVersao, versaoDe } from './versaoApp.js';

test('o mesmo conteúdo dá sempre a mesma versão', () => {
  const html = '<script src="/assets/index-abc123.js"></script>';
  assert.equal(versaoDe(html), versaoDe(html));
  assert.equal(versaoDe(html).length, 12);
});

test('🔴 build diferente dá versão diferente', () => {
  // O `index.html` referencia os bundles com hash no nome, então ele muda exatamente quando
  // o aplicativo muda — é essa propriedade que faz a TV saber que está desatualizada.
  const antes = '<script src="/assets/index-abc123.js"></script>';
  const depois = '<script src="/assets/index-def456.js"></script>';
  assert.notEqual(versaoDe(antes), versaoDe(depois));
});

test('entrada vazia ou inválida devolve null — e null significa "não sei"', () => {
  for (const ruim of ['', '   ', null, undefined, 42, {}, []]) {
    assert.equal(versaoDe(ruim), null, `${JSON.stringify(ruim)} não pode virar versão`);
  }
});

test('🔴 na dúvida, NÃO recarrega', () => {
  // Um `null` de qualquer lado significaria mandar a parede recarregar por causa de um
  // arquivo que o servidor não conseguiu ler. Ficar desatualizado é melhor que isso.
  assert.equal(mudouDeVersao('aaa', 'bbb'), true);
  assert.equal(mudouDeVersao('aaa', 'aaa'), false);
  assert.equal(mudouDeVersao(null, 'bbb'), false);
  assert.equal(mudouDeVersao('aaa', null), false);
  assert.equal(mudouDeVersao(null, null), false);
  assert.equal(mudouDeVersao('', 'bbb'), false);
});
