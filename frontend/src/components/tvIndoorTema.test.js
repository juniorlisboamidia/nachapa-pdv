// TV Indoor › o adaptador domínio → CSS — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tvIndoorTema.test.js
//
// O que estes testes defendem:
//   1. 🔴 chave desconhecida NUNCA vira CSS — é a garantia de segurança do módulo;
//   2. o valor só atravessa como hexadecimal canônico (o último portão não confia no servidor);
//   3. os defaults daqui, do backend e da folha CONCORDAM;
//   4. a divisória é derivada do texto, e por isso acompanha um fundo claro;
//   5. tirar um override APAGA a propriedade — é o que faz a loja conseguir voltar;
//   6. nada aqui conhece o totem.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PROPRIEDADES, CHAVES, PADROES, PROP_DIVISORIA, ALPHA_DIVISORIA, PROP_ELEVADA, ALPHA_ELEVADA,
  efetivas, derivados, aplicar, paresDe, comAlpha,
} from './tvIndoorTema.js'
// O backend, para provar que os defaults não divergiram.
import { PADROES as PADROES_SERVIDOR, CHAVES as CHAVES_SERVIDOR } from '../../../backend/tvIndoorAparencia.js'

// Um nó falso com a API que o módulo usa: dá para testar o CSSOM inteiro sem DOM.
function no() {
  const props = new Map()
  return {
    props,
    style: {
      setProperty: (p, v) => props.set(p, v),
      removeProperty: (p) => props.delete(p),
    },
  }
}

// ── Allowlist ────────────────────────────────────────────────────────────────
test('o mapa tem SEIS entradas, e todas apontam para custom property', () => {
  assert.equal(CHAVES.length, 6)
  for (const chave of CHAVES) assert.match(PROPRIEDADES[chave], /^--tvmb-[a-z0-9-]+$/, chave)
})

test('🔴 chave desconhecida NUNCA vira CSS', () => {
  const el = no()
  aplicar(el, { '--tvmb-fundo': '#ff0000', background: '#ff0000', __proto__: '#ff0000', cartao: '#ff0000' })
  // Só as seis conhecidas foram escritas — nenhuma das chaves inventadas virou propriedade.
  for (const [, prop] of el.props) assert.notEqual(prop, '#ff0000')
  // As únicas propriedades aceitas são as seis do mapa e as DERIVADAS (divisória e
  // superfície elevada), que nascem no código e nunca de uma chave do banco.
  const permitidas = [...Object.values(PROPRIEDADES), PROP_DIVISORIA, PROP_ELEVADA]
  assert.equal([...el.props.keys()].every((p) => permitidas.includes(p)), true)
  // E o valor gravado em `--tvmb-fundo` é o PADRÃO, não o que veio com a chave torta.
  assert.equal(el.props.get('--tvmb-fundo'), PADROES.fundo)
})

test('🔴 valor que não é hexadecimal canônico não atravessa', () => {
  for (const ruim of ['red', 'rgb(0,0,0)', '#fff', '#00000080', 'var(--x)', '; color: red', 42, null, {}]) {
    const el = no()
    aplicar(el, { fundo: ruim })
    assert.equal(el.props.get('--tvmb-fundo'), PADROES.fundo, `${String(ruim)} não pode passar`)
  }
  // `#fff` é recusado aqui de propósito: quem normaliza para seis dígitos é o servidor, e
  // este portão não adivinha o que o anterior deveria ter feito.
  assert.deepEqual(paresDe({ fundo: '#FF0000' }).find(([p]) => p === '--tvmb-fundo'), ['--tvmb-fundo', '#ff0000'])
})

// ── Defaults concordam ───────────────────────────────────────────────────────
test('🔴 os defaults do adaptador e do SERVIDOR são os mesmos', () => {
  assert.deepEqual(PADROES, PADROES_SERVIDOR, 'divergir faria a prévia mentir sobre a parede')
  assert.deepEqual([...CHAVES].sort(), [...CHAVES_SERVIDOR].sort())
})

test('🔴 os defaults da FOLHA são os mesmos', () => {
  // A folha é o chão: é o que a TV desenha quando NADA chega (cold start, rede caindo).
  const css = fs.readFileSync(new URL('../styles/tvMenuBoard.css', import.meta.url), 'utf8')
  for (const [chave, prop] of Object.entries(PROPRIEDADES)) {
    const m = css.match(new RegExp(`${prop}:\\s*([^;]+);`))
    assert.ok(m, `a folha precisa declarar ${prop}`)
    assert.equal(m[1].trim().toLowerCase(), PADROES[chave], `${prop} divergiu da folha`)
  }
})

// ── Efetivas ─────────────────────────────────────────────────────────────────
test('efetivas: overrides por cima dos padrões; entrada torta devolve os padrões', () => {
  assert.deepEqual(efetivas(null), PADROES)
  assert.deepEqual(efetivas('x'), PADROES)
  assert.deepEqual(efetivas([]), PADROES)
  assert.equal(efetivas({ destaque: '#ff0000' }).destaque, '#ff0000')
  assert.equal(efetivas({ destaque: '#ff0000' }).fundo, PADROES.fundo)
})

// ── Divisória derivada ───────────────────────────────────────────────────────
test('🔴 as derivadas saem do TEXTO — é o que as faz aparecer num fundo claro', () => {
  // Uma cor fixa funcionaria numa paleta e sumiria na outra: divisória branca some no fundo
  // claro, e um cinza fixo de superfície elevada some no escuro. Saindo do texto, as duas
  // acompanham a paleta sozinhas.
  assert.deepEqual(derivados({ texto: '#ffffff' }), [
    [PROP_DIVISORIA, `rgba(255, 255, 255, ${ALPHA_DIVISORIA})`],
    [PROP_ELEVADA, `rgba(255, 255, 255, ${ALPHA_ELEVADA})`],
  ])
  assert.deepEqual(derivados({ texto: '#000000' }), [
    [PROP_DIVISORIA, `rgba(0, 0, 0, ${ALPHA_DIVISORIA})`],
    [PROP_ELEVADA, `rgba(0, 0, 0, ${ALPHA_ELEVADA})`],
  ])
  // Sem token, vale o padrão — nunca uma lista vazia que deixaria a lista sem linha.
  assert.equal(derivados({}).length, 2)
  assert.equal(derivados(null).length, 2)
})

test('🔴 fundo e superfície NÃO nascem com a mesma cor', () => {
  // Enquanto foram iguais, o card não existia: o menu board era texto e foto soltos sobre um
  // fundo, e era isso que fazia a peça parecer dados em vez de cartaz.
  assert.notEqual(PADROES.fundo, PADROES.superficie)
  assert.notEqual(PADROES_SERVIDOR.fundo, PADROES_SERVIDOR.superficie)
})

test('comAlpha só aceita hexadecimal canônico e alpha na faixa', () => {
  assert.equal(comAlpha('#112233', 0.5), 'rgba(17, 34, 51, 0.5)')
  for (const ruim of ['#fff', 'red', null, 42]) assert.equal(comAlpha(ruim, 0.5), null, String(ruim))
  for (const a of [-0.1, 1.1, 'x', NaN]) assert.equal(comAlpha('#112233', a), null, String(a))
})

// ── Escrita no nó ────────────────────────────────────────────────────────────
test('aplicar escreve as seis + as DERIVADAS', () => {
  const el = no()
  aplicar(el, { fundo: '#101010', destaque: '#ff0000' })
  assert.equal(el.props.get('--tvmb-fundo'), '#101010')
  assert.equal(el.props.get('--tvmb-destaque'), '#ff0000')
  assert.equal(el.props.get('--tvmb-texto'), PADROES.texto)
  assert.ok(el.props.get(PROP_DIVISORIA).startsWith('rgba('))
  // A elevada entrou na etapa de refino: é o chão atrás de uma foto que não veio e o realce
  // do card protagonista. Derivada, não um sétimo campo configurável.
  assert.ok(el.props.get('--tvmb-superficie-2').startsWith('rgba('))
  assert.equal(el.props.size, 8)
})

test('🔴 tirar um override volta ao padrão no MESMO nó, sem recarregar', () => {
  // Sem o `removeProperty`, a cor antiga ficaria grudada no aparelho até alguém recarregar
  // a página — e numa parede ninguém recarrega.
  const el = no()
  aplicar(el, { fundo: '#101010' })
  assert.equal(el.props.get('--tvmb-fundo'), '#101010')
  aplicar(el, {})
  assert.equal(el.props.get('--tvmb-fundo'), PADROES.fundo, 'volta ao padrão explicitamente')
})

test('aplicar em nó inexistente não lança', () => {
  assert.doesNotThrow(() => aplicar(null, { fundo: '#101010' }))
  assert.doesNotThrow(() => aplicar({}, { fundo: '#101010' }))
})

// ── Independência ────────────────────────────────────────────────────────────
test('🔴 o adaptador não conhece o totem', () => {
  const fonte = fs.readFileSync(new URL('./tvIndoorTema.js', import.meta.url), 'utf8')
  const semBloco = fonte.split('/*').map((p, i) => (i === 0 ? p : p.split('*/').slice(1).join('*/'))).join('')
  const codigo = semBloco.split(/\r?\n/).map((l) => l.split('//')[0]).join('\n')
  for (const proibido of ['totem', 'Totem', '--tq-', '--ds-']) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode aparecer no código`)
  }
})
