// Menu Board V2 — templates, exibição e a guarda de que admin e parede desenham IGUAL.
// Rodar: node --test frontend/src/components/tvMenuBoardV2.test.js
//
// Este projeto não tem harness de componente, então o que dá para provar aqui é o que
// IMPORTA de verdade: que existe UMA definição visual servindo os dois lados, que cada
// template desenha o que deve e que o renderer não reinventa nenhuma regra.
//
// A checagem de pixel fica com o olho humano — o checklist em 1920 × 1080 do relatório.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')

const renderer = ler('./tv/MenuBoard.jsx')
const editor = ler('../pages/TvIndoorMenuBoards.jsx')
const player = ler('../pages/TvIndoorPlayer.jsx')
const css = ler('../styles/tvMenuBoard.css')

// ── A guarda arquitetural ────────────────────────────────────────────────────
test('🔴 o admin e a TV desenham pelo MESMO componente', () => {
  // Se o gestor aprovasse por um caminho e a loja mostrasse por outro, ele descobriria a
  // diferença pela parede. Esta é a guarda que impede um `MenuBoardPreview.jsx` de nascer.
  for (const [nome, fonte] of [['editor', editor], ['player', player]]) {
    assert.match(fonte, /from '.*components\/tv\/MenuBoard'/, `o ${nome} precisa importar o renderer compartilhado`)
  }
  // E não existe um segundo arquivo desenhando menu board.
  const arquivos = fs.readdirSync(new URL('../components/tv/', import.meta.url))
  const desenhadores = arquivos.filter((f) => /menuboard/i.test(f) && f.endsWith('.jsx'))
  assert.deepEqual(desenhadores, ['MenuBoard.jsx'], 'só pode existir UM componente de menu board')
})

test('🔴 o renderer não reinventa regra de preço, promoção nem disponibilidade', () => {
  // Ele recebe o board JÁ RESOLVIDO. Recalcular desconto aqui criaria uma segunda régua que
  // um dia discordaria da do servidor — e a que estaria na parede seria a errada.
  const codigo = semComentarios(renderer)
  for (const proibido of ['precoPromocional', 'status', 'ACTIVE', 'Math.round((1', 'disponivel']) {
    assert.equal(codigo.includes(proibido), false, `o renderer não pode conhecer ${proibido}`)
  }
})

// ── Os cinco templates ───────────────────────────────────────────────────────
test('os cinco templates existem no renderer e na folha', () => {
  for (const t of ['GRADE', 'DESTAQUE', 'LISTA', 'VITRINE', 'OFERTA']) {
    assert.match(renderer, new RegExp(`template === '${t}'`), `falta desenhar ${t}`)
    assert.match(css, new RegExp(`\\.tvmb-${t.toLowerCase()}\\b`), `falta a folha de ${t}`)
  }
})

test('🔴 template desconhecido cai na GRADE em vez de apagar a parede', () => {
  // Board gravado por uma versão futura, ou dado torto: a TV desenha ALGUMA coisa.
  assert.match(semComentarios(renderer), /TEMPLATES\.includes\(board\?\.layout\) \? board\.layout : 'GRADE'/)
})

test('🔴 sem bloco de exibição, o renderer reproduz os defaults do V1', () => {
  // É o board vindo de um servidor anterior ao V2. A parede continua igual em vez de ficar
  // sem descrição na Lista — que seria uma regressão visível.
  const i = renderer.indexOf('function exibicaoDe')
  const fn = renderer.slice(i, renderer.indexOf('\n}', i))
  assert.match(fn, /imagem: template !== 'LISTA'/)
  assert.match(fn, /descricao: template === 'LISTA' \|\| template === 'DESTAQUE'/)
  assert.match(fn, /logo: false/)
  assert.match(fn, /fita: true/)
})

// ── Composição ───────────────────────────────────────────────────────────────
test('o cabeçalho só existe quando tem o que dizer', () => {
  // Um bloco vazio de altura fixa empurraria a composição para baixo em todo board sem
  // título, e a diferença apareceria na parede.
  assert.match(semComentarios(renderer), /const temCabeca = ex\.logo \|\| board\?\.titulo \|\| board\?\.subtitulo/)
  assert.match(semComentarios(renderer), /\{temCabeca \? \(/)
})

test('a LISTA honra a foto opcional e a VITRINE não', () => {
  const codigo = semComentarios(renderer)
  // Só a Lista tem o ramo condicional de miniatura; nos outros a foto é a composição.
  assert.match(codigo, /ex\.imagem \? <span className="tvmb-linha-midia">/)
  const vitrine = codigo.slice(codigo.indexOf('const Vitrine'), codigo.indexOf('function Oferta'))
  assert.equal(vitrine.includes('ex.imagem'), false, 'vitrine sem foto não é vitrine')
})

test('a fita pode ser desligada, mas a COR dela nunca vem do tema', () => {
  // A fita é metadado editorial compartilhado: "Mais pedido" tem a mesma cor em todo o
  // sistema. Pintá-la com o token da TV apagaria esse significado.
  assert.match(renderer, /style=\{\{ background: selo\.cor \}\}/)
  assert.equal(/tvmb-selo[^}]*var\(--tvmb/.test(css.slice(css.indexOf('.tvmb-selo'), css.indexOf('.tvmb-selo') + 400)), false)
})

test('🔴 o preço da OFERTA cresce, mas o nome continua disputando o olhar', () => {
  // Um preço gigante sozinho vende desconto, não vende produto — foi o erro que já
  // corrigimos no card do totem.
  const nome = Number(/\.tvmb-of-nome \{[^}]*font-size: (\d+)px/.exec(css)?.[1])
  const preco = Number(/\.tvmb-preco-of \.tvmb-preco-valor \{ font-size: (\d+)px/.exec(css)?.[1])
  assert.ok(nome >= 80, `o nome do produto precisa ser grande (${nome}px)`)
  assert.ok(preco / nome <= 1.5, `o preço não pode dominar o nome (${preco} vs ${nome})`)
})

test('produto sem foto não vira imagem quebrada em nenhum template', () => {
  // O mesmo bloco neutro em todos: `Foto` troca para `tvmb-foto-vazia` no `onError`.
  assert.match(renderer, /if \(!src \|\| quebrou\) return <span className="tvmb-foto tvmb-foto-vazia"/)
  assert.match(css, /\.tvmb-foto-vazia/)
})

test('a descrição é cortada por LINHAS, não por caracteres', () => {
  // `slice` cortaria no meio de uma palavra; o corte por linha mantém a altura previsível
  // sem estragar o texto.
  assert.equal(/descricao[^\n]*slice\(/.test(semComentarios(renderer)), false)
  assert.match(css, /-webkit-line-clamp/)
})

// ── Editor ───────────────────────────────────────────────────────────────────
test('🔴 trocar de template NÃO corta a seleção', () => {
  // Quem montou oito produtos e clicou na Vitrine para dar uma olhada não pode perder cinco.
  const i = editor.indexOf('function trocarLayout')
  const fn = semComentarios(editor.slice(i, editor.indexOf('\n  }', i)))
  assert.equal(fn.includes('.slice(0, regraNova.maximo)'), false, 'a seleção não pode ser cortada')
  assert.match(fn, /setForm\(\(f\) => \(\{ \.\.\.f, layout: novo \}\)\)/)
})

test('o editor só oferece os interruptores que o template honra', () => {
  // A lista vem do SERVIDOR junto com o template. Uma tabela própria aqui divergiria.
  assert.match(editor, /\(regra\.opcoes \?\? \[\]\)\.map\(\(op\)/)
})

test('a prévia recebe o teto do template — mostra o que a parede mostraria', () => {
  const i = editor.indexOf('const previa = previaDoBoard(')
  const chamada = editor.slice(i, editor.indexOf('})', i))
  assert.match(chamada, /maximo: regra\.maximo/)
  assert.match(chamada, /exibicao: exibicaoDoForm\(form, regra\)/)
  assert.match(chamada, /subtitulo: form\.subtitulo/)
})

// ── Responsividade e safe area ───────────────────────────────────────────────
test('🔴 a tela é 1920×1080 e quem encolhe é a escala — um caminho só', () => {
  // É o que faz "o card cabe?" ter uma resposta só. Com layout fluido, o admin em 600px
  // tomaria decisões de quebra diferentes das da TV.
  assert.match(css, /\.tvmb-tela \{\n\s*width: 1920px;\n\s*height: 1080px;/)
  assert.match(renderer, /--tvmb-escala/)
  assert.match(renderer, /largura \/ 1920/)
})

test('a margem de segurança existe em todos os templates', () => {
  // TV de loja com overscan mal configurado é a regra, não a exceção: informação colada na
  // borda simplesmente some.
  const padding = /\.tvmb-tela \{[\s\S]*?padding: (\d+)px (\d+)px/.exec(css)
  assert.ok(Number(padding[1]) >= 40 && Number(padding[2]) >= 60, `safe area insuficiente: ${padding[0]}`)
  assert.match(css, /\.tvmb-tela\.tvmb-oferta, \.tvmb-tela\.tvmb-vitrine \{ padding:/)
})
