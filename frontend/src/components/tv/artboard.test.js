// O artboard do menu board — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tv/artboard.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARTBOARD, artboardDe, ehRetrato, escalaDe } from './artboard.js'

test('em pé é a mesma tela virada: 1080 × 1920', () => {
  assert.deepEqual(ARTBOARD.PAISAGEM, { largura: 1920, altura: 1080 })
  assert.deepEqual(ARTBOARD.RETRATO, { largura: 1080, altura: 1920 })
  assert.equal(ARTBOARD.RETRATO.largura, ARTBOARD.PAISAGEM.altura)
  assert.equal(ARTBOARD.RETRATO.altura, ARTBOARD.PAISAGEM.largura)
})

test('🔴 tudo que não é RETRATO é deitado — inclusive a ausência', () => {
  // Servidor antigo não manda orientação; valor torto não pode virar uma parede em pé.
  for (const v of [undefined, null, '', 'PAISAGEM', 'retrato', 'VERTICAL', 90, {}]) {
    assert.equal(ehRetrato(v), false, `${JSON.stringify(v)} não é em pé`)
    assert.equal(artboardDe(v), ARTBOARD.PAISAGEM)
  }
  assert.equal(ehRetrato('RETRATO'), true)
  assert.equal(artboardDe('RETRATO'), ARTBOARD.RETRATO)
})

test('🔴 a escala divide pela largura do artboard EM USO', () => {
  /* Medir sempre por 1920 numa caixa em pé desenharia o board pela metade — foi o que a
     primeira versão em pé fazia: o artboard de 1080 chegava com 56% do tamanho. */
  assert.equal(escalaDe(1920, 'PAISAGEM'), 1)
  assert.equal(escalaDe(1080, 'RETRATO'), 1)
  assert.equal(escalaDe(1080, 'PAISAGEM'), 0.5625)
  assert.equal(escalaDe(360, 'RETRATO'), 1 / 3)
})

test('caixa sem largura ainda não tem escala', () => {
  // Zero é o que a caixa mede antes de o modal abrir; `null` diz "espere", e o palco fica
  // invisível até a medida de verdade chegar.
  for (const v of [0, -10, NaN, undefined, 'x']) assert.equal(escalaDe(v, 'PAISAGEM'), null)
})
