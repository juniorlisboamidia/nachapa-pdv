// O vigia de reprodução — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tvVigiaVideo.test.js
//
// O teste central é o 🔴 do loop: foi o bug que chegou à parede. A primeira versão do vigia
// exigia `currentTime` estritamente crescente, e um vídeo em loop volta a zero ao dar a
// volta — o vigia lia a volta como travamento e matava a reprodução.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MS_STALL, avaliar, inicio } from './tvVigiaVideo.js'

const T0 = 1_000_000

test('tempo andando é progresso, e o relógio do vigia reinicia junto', () => {
  let e = inicio(T0)
  let r = avaliar(e, { t: 2, agora: T0 + 2000 })
  assert.equal(r.travado, false)
  assert.deepEqual(r.estado, { t: 2, em: T0 + 2000 })
  r = avaliar(r.estado, { t: 4, agora: T0 + 4000 })
  assert.equal(r.travado, false)
})

test('🔴 o LOOP não é travamento — voltar a zero é movimento', () => {
  // Um vídeo de 17 s que deu a volta: o tempo cai de 16,8 para 0,2. A régua antiga
  // (`t > anterior`) via isso como parado e, 12 s depois, matava um vídeo que estava
  // tocando perfeitamente. Com um vídeo só na playlist, matar = tela institucional.
  const depoisDeUmaVolta = { t: 16.8, em: T0 }
  const r = avaliar(depoisDeUmaVolta, { t: 0.2, agora: T0 + 2000 })
  assert.equal(r.travado, false, 'a volta do loop é progresso')
  assert.deepEqual(r.estado, { t: 0.2, em: T0 + 2000 }, 'e o relógio reinicia a partir dela')

  // E a segunda passagem inteira continua válida, mesmo sempre abaixo do máximo já visto.
  let estado = r.estado
  for (let s = 1; s <= 16; s += 1) {
    const passo = avaliar(estado, { t: s, agora: T0 + 2000 + s * 1000 })
    assert.equal(passo.travado, false, `segundo ${s} da segunda volta não pode ser travamento`)
    estado = passo.estado
  }
})

test('tempo CONSTANTE além da janela é travamento', () => {
  const parado = { t: 7, em: T0 }
  // Ainda dentro da janela: espera.
  assert.equal(avaliar(parado, { t: 7, agora: T0 + MS_STALL - 1 }).travado, false)
  // Passou: desiste.
  assert.equal(avaliar(parado, { t: 7, agora: T0 + MS_STALL + 1 }).travado, true)
})

test('variação minúscula é ruído do elemento, não reprodução', () => {
  const parado = { t: 7, em: T0 }
  assert.equal(avaliar(parado, { t: 7.01, agora: T0 + MS_STALL + 1 }).travado, true)
})

test('vídeo que ACABOU nunca é travamento', () => {
  // Quem cuida do fim é o evento `ended`. O vigia parar de reclamar aqui é o que impede a
  // falha de aparecer no último quadro de um vídeo que terminou direito.
  const parado = { t: 17, em: T0 }
  assert.equal(avaliar(parado, { t: 17, agora: T0 + MS_STALL + 5000, ended: true }).travado, false)
})

test('tempo que o elemento ainda não sabe informar não conta — nem a favor, nem contra', () => {
  const parado = { t: 3, em: T0 }
  for (const ruim of [NaN, undefined, null, 'x', Infinity]) {
    const r = avaliar(parado, { t: ruim, agora: T0 + 1000 })
    assert.equal(r.travado, false, `${ruim} não pode declarar travamento`)
    assert.deepEqual(r.estado, parado, `${ruim} também não pode reiniciar o relógio`)
  }
})

test('seek para trás (e para frente) também é movimento', () => {
  assert.equal(avaliar({ t: 30, em: T0 }, { t: 5, agora: T0 + 2000 }).travado, false)
  assert.equal(avaliar({ t: 5, em: T0 }, { t: 30, agora: T0 + 2000 }).travado, false)
})

test('sem estado, a primeira amostra nunca declara travamento', () => {
  assert.equal(avaliar(undefined, { t: 0, agora: T0 }).travado, false)
})
