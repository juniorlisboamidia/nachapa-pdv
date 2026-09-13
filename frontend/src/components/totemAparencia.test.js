// Abas da Aparência do totem — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/totemAparencia.test.js
//
// O que estes testes defendem: nenhum endereço, por mais torto que seja, produz uma tela
// vazia — e o padrão das abas continua batendo com o redirect da rota e com a folha da
// sidebar, que apontam para a raiz da seção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABAS, ABA_PADRAO, abaValida, rotaDaAba } from './totemAparencia.js';

test('duas abas, na ordem combinada', () => {
  assert.deepEqual(ABAS.map((a) => a.id), ['personalizacao', 'banners']);
  assert.deepEqual(ABAS.map((a) => a.label), ['Personalização', 'Banners']);
  assert.ok(Object.isFrozen(ABAS));
});

test('🔴 a primeira aba é o padrão — contrato com o redirect e com a sidebar', () => {
  // `/totem/aparencia` redireciona para a primeira, e a folha da sidebar aponta para a
  // raiz da seção. Reordenar a lista sem mexer nos outros dois deixaria os três
  // discordando, e o sintoma seria a sidebar fechando ao trocar de aba.
  assert.equal(ABA_PADRAO, 'personalizacao');
  assert.equal(ABAS[0].id, ABA_PADRAO);
});

test('aba existente passa', () => {
  assert.equal(abaValida('personalizacao'), 'personalizacao');
  assert.equal(abaValida('banners'), 'banners');
});

test('🔴 endereço torto cai na primeira aba, nunca em tela vazia', () => {
  // URL é entrada do mundo externo: alguém digita, um link antigo aponta para uma aba que
  // deixou de existir, o navegador restaura uma sessão.
  for (const v of [undefined, null, '', '   ', 'inexistente', 'BANNERS ', 42, {}, [], true]) {
    const r = abaValida(v);
    assert.ok(ABAS.some((a) => a.id === r), `entrada ${String(v)} devolveu ${r}`);
  }
  assert.equal(abaValida('inexistente'), ABA_PADRAO);
  assert.equal(abaValida(undefined), ABA_PADRAO);
});

test('caixa e espaço não derrubam a aba — isto é URL, não dado de banco', () => {
  assert.equal(abaValida('Banners'), 'banners');
  assert.equal(abaValida('  BANNERS  '), 'banners');
  assert.equal(abaValida('Personalizacao'), 'personalizacao');
});

test('rotaDaAba nunca monta um endereço que não existe', () => {
  assert.equal(rotaDaAba('banners'), '/totem/aparencia/banners');
  assert.equal(rotaDaAba('personalizacao'), '/totem/aparencia/personalizacao');
  assert.equal(rotaDaAba('lixo'), `/totem/aparencia/${ABA_PADRAO}`);
  assert.equal(rotaDaAba(undefined), `/totem/aparencia/${ABA_PADRAO}`);
  for (const a of ABAS) assert.equal(rotaDaAba(a.id), `/totem/aparencia/${a.id}`);
});
