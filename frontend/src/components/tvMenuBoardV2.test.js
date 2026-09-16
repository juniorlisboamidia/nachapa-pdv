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
  // A âncora é o SELETOR DE CORPO que cada template desenha, e não o nome do template numa
  // regra qualquer: a versão anterior desta guarda casava com `.tvmb-oferta`, que só existia
  // num override de padding — apagar o override "apagava o template" aos olhos do teste.
  const corpo = { GRADE: '.tvmb-grade', DESTAQUE: '.tvmb-destaque', LISTA: '.tvmb-lista', VITRINE: '.tvmb-vitrine', OFERTA: '.tvmb-of' }
  for (const [t, seletor] of Object.entries(corpo)) {
    assert.match(renderer, new RegExp(`template === '${t}'`), `falta desenhar ${t}`)
    assert.match(css, new RegExp(`\\${seletor} \\{`), `falta a folha de ${t} (${seletor})`)
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

const degrau = (nome) => Number(new RegExp(`--tvmb-${nome}:\\s*(\\d+)px`).exec(css)?.[1])

test('🔴 o preço da OFERTA cresce, mas o nome continua disputando o olhar', () => {
  // Um preço gigante sozinho vende desconto, não vende produto — foi o erro que já
  // corrigimos no card do totem. Agora a medida sai dos DEGRAUS da escala, que é de onde os
  // templates tiram o tamanho: um `font-size` solto passaria despercebido por esta guarda.
  const nome = degrau('fs-nome-1')
  const preco = degrau('fs-preco-1')
  assert.ok(nome >= 72, `o nome do produto precisa ser grande (${nome}px)`)
  assert.ok(preco / nome <= 1.5, `o preço não pode dominar o nome (${preco} vs ${nome})`)
})

test('🔴 UMA escala tipográfica, e os templates só escolhem degraus', () => {
  // Antes cada template tinha os próprios `font-size`, e era isso que fazia cinco
  // composições parecerem cinco sistemas de design quando alternavam na mesma parede.
  for (const t of ['fs-titulo', 'fs-sub', 'fs-nome-1', 'fs-nome-2', 'fs-nome-3', 'fs-nome-4',
    'fs-desc-1', 'fs-desc-2', 'fs-desc-3', 'fs-preco-1', 'fs-preco-2', 'fs-preco-3']) {
    assert.ok(degrau(t) > 0, `falta o degrau --tvmb-${t}`)
  }
  // A escala é MONOTÔNICA: se um degrau "menor" ficasse maior que o anterior, a hierarquia
  // entre protagonista e coadjuvante se inverteria sem ninguém perceber.
  assert.ok(degrau('fs-nome-1') > degrau('fs-nome-2'))
  assert.ok(degrau('fs-nome-2') > degrau('fs-nome-3'))
  assert.ok(degrau('fs-nome-3') > degrau('fs-nome-4'))
  assert.ok(degrau('fs-preco-1') > degrau('fs-preco-2'))
  assert.ok(degrau('fs-preco-2') > degrau('fs-preco-3'))
})

test('🔴 fundo e superfície são cores DIFERENTES na folha', () => {
  // É o que faz o card existir como unidade. Enquanto foram iguais, o menu board era texto e
  // foto soltos sobre um fundo.
  const cor = (nome) => new RegExp(`--tvmb-${nome}:\\s*([^;]+);`).exec(css)?.[1]?.trim()
  assert.notEqual(cor('fundo'), cor('superficie'))
  assert.ok(cor('superficie-2'), 'a superfície elevada precisa existir')
})

test('🔴 o card é uma UNIDADE: raio, superfície e área interna própria', () => {
  const bloco = css.slice(css.indexOf('.tvmb-card {'), css.indexOf('.tvmb-card-midia'))
  assert.match(bloco, /background: var\(--tvmb-superficie\)/)
  assert.match(bloco, /border-radius:/)
  assert.match(bloco, /overflow: hidden/, 'a mídia sangra até a borda e é o card que recorta')
  // O texto tem padding próprio; a mídia não (ela vai até a borda).
  assert.match(css, /\.tvmb-card-txt \{[^}]*padding: \d+px \d+px/)
  // Sem sombra: numa TV, sombra vira borrão cinza.
  assert.equal(/box-shadow/.test(css), false, 'nada de sombra no board')
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

test('a margem de segurança é UMA, e vale para os cinco', () => {
  // TV de loja com overscan mal configurado é a regra, não a exceção: informação colada na
  // borda simplesmente some. E cinco margens diferentes fariam os templates parecerem peças
  // de sistemas distintos quando alternam na mesma parede a cada vinte segundos.
  const padding = /\.tvmb-tela \{[\s\S]*?padding: (\d+)px (\d+)px/.exec(css)
  assert.ok(Number(padding[1]) >= 40 && Number(padding[2]) >= 72, `safe area insuficiente: ${padding[0]}`)
  assert.equal(/\.tvmb-tela\.tvmb-\w+ \{[^}]*padding:/.test(css), false, 'nenhum template pode ter safe area própria')
})

// ── A escala do artboard ─────────────────────────────────────────────────────
test('🔴 o palco NÃO aparece antes de existir uma escala medida', () => {
  /* Era a causa do "conteúdo cortado à direita" na prévia: `--tvmb-escala` tem padrão `1`
     na folha, então, entre a montagem e a primeira medida, o palco desenhava 1920×1080 reais
     dentro de uma caixa de ~420px. O padrão existe para o `transform` nunca ser inválido;
     quem impede o quadro errado é a visibilidade. */
  assert.match(css, /\.tvmb-palco \{[\s\S]*?visibility: hidden;/)
  assert.match(css, /\.tvmb-caixa\.medido \.tvmb-palco \{ visibility: visible; \}/)
  const codigo = semComentarios(renderer)
  assert.match(codigo, /if \(largura <= 0\) return/, 'largura zero não escreve escala nem libera a pintura')
  assert.match(codigo, /el\.classList\.add\('medido'\)/)
})

test('🔴 medir não provoca REFLOW dentro do palco', () => {
  // O artboard é fixo em 1920×1080 e só a ESCALA muda. Escrever largura/altura aqui faria a
  // composição se redesenhar quando o contêiner mudasse — que é justamente o que o artboard
  // fixo existe para impedir.
  const i = renderer.indexOf('const medir = ()')
  const fn = renderer.slice(i, renderer.indexOf('medir()', i))
  assert.equal(/style\.(width|height)|setProperty\('width'|setProperty\('height'/.test(fn), false)
  assert.match(fn, /setProperty\('--tvmb-escala'/)
})

test('🔴 o ResizeObserver resolve o contêiner que nasce com largura ZERO', () => {
  // Ele dispara na observação inicial e de novo quando o elemento ganha dimensão — que é o
  // que acontece quando o modal do editor abre. Por isso não há polling nem RAF repetitivo.
  const codigo = semComentarios(renderer)
  assert.match(codigo, /new ResizeObserver\(medir\)/)
  assert.match(codigo, /ro\.observe\(el\)/)
  assert.equal(/requestAnimationFrame|setInterval/.test(codigo), false, 'nada de polling')
})

test('🔴 a largura de cada template CABE na área útil — por matemática, não por encolhimento', () => {
  /* Área útil = 1920 − 2 × 80 de safe area = 1760. A Vitrine antiga somava 1760 contra 1744
     e só cabia porque `flex-shrink` a apertava 16px: apertado por acidente, não por projeto. */
  const util = 1920 - 2 * 80

  const grade = /\.tvmb-grade \{[\s\S]*?grid-template-columns: repeat\(4, (\d+)px\)[\s\S]*?gap: (\d+)px/.exec(css)
  assert.ok(4 * Number(grade[1]) + 3 * Number(grade[2]) <= util, 'a grade não cabe')

  const destaque = /\.tvmb-destaque \{[^}]*grid-template-columns: (\d+)px (\d+)px; gap: (\d+)px/.exec(css)
  assert.equal(Number(destaque[1]) + Number(destaque[2]) + Number(destaque[3]), util, 'o destaque precisa fechar a área útil')

  const oferta = /\.tvmb-of \{[\s\S]*?grid-template-columns: (\d+)px (\d+)px;\n\s*gap: (\d+)px/.exec(css)
  assert.equal(Number(oferta[1]) + Number(oferta[2]) + Number(oferta[3]), util, 'a oferta precisa fechar a área útil')

  // Vitrine e Lista usam `1fr`: a divisão é exata por construção, e é essa a correção.
  assert.match(css, /\.tvmb-vitrine \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.tvmb-lista \{[\s\S]*?grid-template-columns: repeat\(2, 1fr\)/)
})

test('🔴 a LISTA é 5 + 5, na ordem da seleção', () => {
  // `grid-auto-flow: column` com cinco linhas: os cinco primeiros descem à esquerda e os
  // cinco seguintes à direita. Preenchendo por linha, o item 2 apareceria ao lado do 1 e a
  // ordem que o gestor montou deixaria de ser legível.
  const bloco = css.slice(css.indexOf('.tvmb-lista {'), css.indexOf('.tvmb-linha {'))
  assert.match(bloco, /grid-template-rows: repeat\(5, auto\)/)
  assert.match(bloco, /grid-auto-flow: column/)
})

test('🔴 a linha da LISTA tem altura FIXA — produto sem foto não desalinha a coluna', () => {
  // É o caso normal do cardápio que este template existe para atender: alguns itens têm
  // foto, outros não. Sem altura mínima, as duas colunas ficariam desencontradas.
  assert.match(css, /\.tvmb-linha \{ min-height: \d+px; \}/)
})
