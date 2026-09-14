import { test } from 'node:test'
import assert from 'node:assert/strict'
import { percentualDesconto, moeda } from './formato.js'

test('moeda formata em pt-BR', () => {
  assert.equal(moeda(19.9).replace(/\u00a0/g, ' '), 'R$ 19,90')
})

test('percentualDesconto arredonda para o inteiro', () => {
  assert.equal(percentualDesconto(24.9, 19.9), 20)
  assert.equal(percentualDesconto(52, 39.9), 23)
  assert.equal(percentualDesconto(10, 5), 50)
})

test('percentualDesconto é zero quando não há oferta de verdade', () => {
  assert.equal(percentualDesconto(10, 10), 0)
  assert.equal(percentualDesconto(10, 12), 0)
  assert.equal(percentualDesconto(0, 5), 0)
  assert.equal(percentualDesconto(undefined, 5), 0)
  assert.equal(percentualDesconto(10, null), 0)
  assert.equal(percentualDesconto(10, -1), 0)
})
