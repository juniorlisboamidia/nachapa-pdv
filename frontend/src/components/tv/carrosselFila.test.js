// A aritmética da fila do Carrossel — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tv/carrosselFila.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MS_CONFORTO, duracaoConfortavel, indiceEmCena, msPorPasso, precisaRecuar } from './carrosselFila.js'

test('o passo anda em círculo pelos produtos', () => {
  assert.equal(indiceEmCena(0, 10), 0)
  assert.equal(indiceEmCena(7, 10), 7)
  assert.equal(indiceEmCena(10, 10), 0)
  assert.equal(indiceEmCena(23, 10), 3)
})

test('🔴 passo NEGATIVO não pode virar índice negativo', () => {
  /* Este é o bug que deixou a parede branca. O `transitionend` borbulha, e os trinta
     cards da trilha também transicionam: o recuo rodava dezenas de vezes por passo, cada
     uma subtraindo o tamanho da lista outra vez. O passo despencava.

     `passo % n` devolve NEGATIVO em JavaScript para passo negativo, `itens[-1]` é
     `undefined`, e o primeiro acesso a `.nome` derruba a árvore inteira — na TV, tela
     branca travada até alguém ir à loja recarregar. A causa raiz foi corrigida no
     handler; isto é a porta trancada por dentro. */
  assert.equal(indiceEmCena(-1, 10), 9)
  assert.equal(indiceEmCena(-10, 10), 0)
  assert.equal(indiceEmCena(-13, 10), 7)
  for (let p = -50; p <= 50; p += 1) {
    const i = indiceEmCena(p, 10)
    assert.ok(i >= 0 && i < 10, `passo ${p} saiu da lista: ${i}`)
  }
})

test('lista vazia ou inválida devolve zero, nunca NaN', () => {
  // Zero é um índice que existe quando a lista existe, e quando ela não existe o
  // componente nem chega a desenhar. NaN viraria `itens[NaN]` — `undefined` de novo.
  for (const n of [0, -1, null, undefined, NaN, 'dez']) {
    assert.equal(indiceEmCena(3, n), 0, `n=${JSON.stringify(n)}`)
  }
  assert.equal(indiceEmCena(NaN, 10), 0)
  assert.equal(indiceEmCena(undefined, 10), 0)
})

test('o recuo acontece na posição gêmea, e só nela', () => {
  assert.equal(precisaRecuar(9, 10), false)
  assert.equal(precisaRecuar(10, 10), true)
  assert.equal(precisaRecuar(11, 10), true)
  assert.equal(precisaRecuar(0, 10), false)
  assert.equal(precisaRecuar(5, 0), false, 'sem produtos não há volta a dar')
})

test('o tempo do board é dividido entre os produtos', () => {
  assert.equal(msPorPasso(20, 10, 1600), 2000)
  assert.equal(msPorPasso(20, 4, 1600), 5000)
  assert.equal(msPorPasso(120, 10, 1600), 12000)
})

test('🔴 abaixo do piso, o piso manda — ilegível é pior que incompleto', () => {
  // 5 s (o mínimo do board) com dez produtos daria 500 ms por passo. Ninguém lê nome e
  // preço de uma parede em meio segundo. O ciclo deixa de fechar, os últimos não chegam
  // ao centro, e o editor avisa o gestor antes de ele salvar.
  assert.equal(msPorPasso(5, 10, 1600), 1600)
  assert.equal(msPorPasso(5, 4, 1600), 1600, '1250 ms também fica abaixo do piso')
})

test('duração ausente cai no padrão, não em zero', () => {
  /* `Number(null)` é 0 — a armadilha que já mordeu este projeto várias vezes. Um zero
     aqui viraria um `setInterval` de 0 ms: a pista giraria a cada quadro e a TV
     esquentaria sem mostrar nada. */
  for (const ruim of [null, undefined, 0, -5, '', 'vinte', NaN]) {
    assert.equal(msPorPasso(ruim, 10, 1600), 2000, `${JSON.stringify(ruim)} devia cair no padrão`)
  }
})

test('a duração confortável dá 3,5s a cada produto', () => {
  assert.equal(duracaoConfortavel(10), 35)
  assert.equal(duracaoConfortavel(6), 21)
  assert.equal(duracaoConfortavel(3), 11, 'arredonda para cima: 10,5 vira 11')
  assert.equal(MS_CONFORTO, 3500)
})

test('🔴 a sugestão nunca cai fora do que o board aceita', () => {
  // A rota recusa duração fora de 5..120, e uma sugestão que o servidor rejeita é pior
  // que nenhuma sugestão: o gestor clica, salva e leva um erro que não é culpa dele.
  assert.equal(duracaoConfortavel(1), 5, 'o mínimo do board manda')
  assert.equal(duracaoConfortavel(100), 120, 'o teto do board manda')
  assert.equal(duracaoConfortavel(10, { min: 5, max: 30 }), 30)
  for (const ruim of [0, -3, null, undefined, NaN, 'dez']) {
    const d = duracaoConfortavel(ruim)
    assert.ok(d >= 5 && d <= 120, `${JSON.stringify(ruim)} devolveu ${d}`)
  }
})
