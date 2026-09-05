import { test } from 'node:test';
import assert from 'node:assert';
import { ordemDeRecalculo } from './propagacaoCusto.js';

// Grafo: chave = insumo que mudou de custo; valor = insumos de produção própria
// que o consomem como ingrediente (os que precisam ser recalculados).
const grafo = (obj) => new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));

test('insumo sem receita que o use: nada a recalcular', () => {
  assert.deepStrictEqual(ordemDeRecalculo(1, grafo({})), []);
});

test('consumidor direto entra na lista', () => {
  assert.deepStrictEqual(ordemDeRecalculo(1, grafo({ 1: [10] })), [10]);
});

test('cascata: receita usada por outra receita recalcula na ordem', () => {
  // 1 (tomate) -> 10 (molho) -> 20 (base da pizza)
  assert.deepStrictEqual(ordemDeRecalculo(1, grafo({ 1: [10], 10: [20] })), [10, 20]);
});

test('diamante: o consumidor final só recalcula depois dos dois intermediários', () => {
  // 1 -> 10 e 11; ambos -> 20
  const ordem = ordemDeRecalculo(1, grafo({ 1: [10, 11], 10: [20], 11: [20] }));
  assert.deepStrictEqual(ordem, [10, 11, 20]);
  assert.strictEqual(ordem.filter((id) => id === 20).length, 1, '20 aparece uma única vez');
});

test('a própria raiz nunca é recalculada', () => {
  assert.ok(!ordemDeRecalculo(1, grafo({ 1: [10], 10: [1] })).includes(1));
});

test('ciclo entre receitas não trava e não repete ninguém', () => {
  // 1 -> 10 -> 11 -> 10 (ciclo)
  const ordem = ordemDeRecalculo(1, grafo({ 1: [10], 10: [11], 11: [10] }));
  assert.deepStrictEqual([...new Set(ordem)].sort(), [10, 11]);
  assert.strictEqual(ordem.length, 2);
});

test('ramo não alcançável pela raiz fica de fora', () => {
  assert.deepStrictEqual(ordemDeRecalculo(1, grafo({ 1: [10], 99: [50] })), [10]);
});
