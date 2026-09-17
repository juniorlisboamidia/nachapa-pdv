// A tela de pareamento vista de uma TV — guardas estáticas.
// Rodar: node --test frontend/src/components/pareamentoNaTv.test.js
//
// Esta tela nasceu para o tablet do totem: em pé, e operada com o dedo. Quando ela passou
// a ser também a porta de entrada da TV Indoor, herdou dois problemas que NÃO aparecem no
// tablet — e é por isso que eles precisam de guarda. Quem mexer aqui vai estar olhando
// para um tablet, onde tudo continua funcionando.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const pagina = ler('../pages/DispositivoPareamento.jsx')
const css = ler('../styles/totem.css')

test('🔴 a tela dá FOCO a uma tecla ao abrir — sem isso o controle da TV não funciona', () => {
  /* A WebView só começa a navegar entre elementos depois que ALGUM deles tem foco. Sem o
     foco inicial, as setas do controle remoto não fazem nada nesta página: o aparelho
     parece travado e a TV não tem como ser pareada.

     No tablet isso não se nota — ninguém vê o anel de foco antes de tocar no número. É
     exatamente por isso que a regressão aqui é silenciosa: ela passa em qualquer teste
     feito com o dedo.

     E o foco é dado UMA vez. Refocando a cada render, o controle não conseguiria sair da
     tecla 1: toda navegação seria desfeita no render seguinte. */
  assert.match(pagina, /ref=\{i === 0 \? primeiraTeclaRef : undefined\}/)
  assert.match(pagina, /const primeiraTeclaRef = useRef\(null\)/)
  assert.match(pagina, /if \(!el \|\| focouRef\.current\) return/, 'o foco é dado uma vez só')
  assert.match(pagina, /el\.focus\(\)/)
})

test('🔴 o foco é visível de longe', () => {
  // Na parede, o anel de foco é a única pista de onde o controle está. Um contorno fino
  // some a três metros, e a pessoa fica apertando seta sem saber o que está selecionado.
  assert.match(css, /\.tq-tecla:focus-visible[\s\S]{0,200}box-shadow: 0 0 0 5px/)
})

test('🔴 numa tela DEITADA o teclado inteiro cabe', () => {
  /* Em pé, a tela é uma pilha: cabeçalho, caixas, teclado. Deitada, essa pilha não cabe —
     na TV o teclado aparecia cortado no 6, com 7, 8, 9 e 0 fora da tela. Sem eles não há
     como digitar código nenhum, e a TV nunca pareia.

     A regra vale por ORIENTAÇÃO, e não por largura: uma TV pequena e um tablet grande
     deitado têm o mesmo problema e a mesma solução. */
  const bloco = css.slice(css.indexOf('@media (orientation: landscape)'))
  assert.ok(bloco.length > 0, 'falta a regra de paisagem do pareamento')
  assert.match(bloco, /\.tq-teclado \{[\s\S]{0,200}grid-column: 2/)
  assert.match(bloco, /\.tq-pareamento-cabeca \{ grid-column: 1/)
})

test('🔴 todo filho do pareamento tem linha atribuída na paisagem', () => {
  /* O layout deitado posiciona cada filho por conta própria, sem um wrapper novo — foi a
     forma de não encostar no layout em pé, que é o que está validado nas lojas. O preço é
     este: um filho novo sem linha cai numa linha implícita e desarruma a coluna.

     Esta guarda cobra o preço na hora certa — quando o filho é acrescentado, e não quando
     alguém liga a TV e vê a tela torta. */
  const corpo = pagina.slice(pagina.indexOf('<div className="tq-pareamento">'))
  const filhos = [...corpo.matchAll(/^        <(?:div|button)[^>]*className="([^"]+)"/gm)]
    .map((m) => m[1].split(' ')[0])
  const dinamicos = [...corpo.matchAll(/^        \{[^}]*<div className="([^"]+)"/gm)].map((m) => m[1].split(' ')[0])
  const todos = [...new Set([...filhos, ...dinamicos])]
  assert.ok(todos.length >= 4, `achei poucos filhos (${todos.join(', ')}) — o parser precisa de revisão`)

  const paisagem = css.slice(css.indexOf('@media (orientation: landscape)'))
  const semArea = todos.filter((c) => !new RegExp('\\.' + c + '\\b[^{]*\\{[^}]*grid-(column|row)').test(paisagem))
  assert.deepEqual(semArea, [], 'estes filhos não têm área no layout deitado')
})

test('🔴 o OK do controle CLICA a tecla focada — não é engolido pelo Enter', () => {
  /* O botão OK do D-pad chega à página como `Enter`. O handler do teclado físico tratava
     todo Enter como "enviar o código" e dava `preventDefault`, o que engolia o clique do
     botão focado: a tecla nunca entrava e o envio rodava com o código vazio.

     Na TV isso lia como "o controle não funciona" — com a navegação entre as teclas
     funcionando perfeitamente ao lado, que é o que torna o defeito difícil de diagnosticar.

     Fora de um botão (teclado bluetooth no balcão) o Enter continua sendo "enviar", e é
     por isso que a saída é condicional ao foco, e não a remoção do tratamento. */
  const i = pagina.indexOf("ev.key === 'Enter'")
  assert.ok(i > 0, 'sumiu o tratamento do Enter')
  const bloco = pagina.slice(i, i + 900)
  const saida = bloco.indexOf("document.activeElement?.tagName === 'BUTTON'")
  const prevent = bloco.indexOf('ev.preventDefault()')
  assert.ok(saida > 0, 'o Enter precisa sair quando há um botão focado')
  assert.ok(saida < prevent, 'a saída tem de vir ANTES do preventDefault, senão o clique já foi engolido')
})
