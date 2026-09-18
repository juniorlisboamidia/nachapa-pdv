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
test('🔴 a tela tem tamanho FIXO por orientação e quem encolhe é a escala — um caminho só', () => {
  /* É o que faz "o card cabe?" ter uma resposta só. Com layout fluido, o admin em 600px
     tomaria decisões de quebra diferentes das da TV.
     Deitada é 1920 × 1080; em pé é a MESMA tela virada, 1080 × 1920 — e a escala divide
     pela largura do artboard em uso (a conta tem teste em artboard.test.js). O que esta
     guarda proíbe é um terceiro caminho: um template medindo a si mesmo. */
  assert.match(css, /\.tvmb-tela \{\n\s*width: 1920px;\n\s*height: 1080px;/)
  assert.match(css, /\.tvmb-tela\.retrato \{ width: 1080px; height: 1920px; \}/)
  assert.match(renderer, /--tvmb-escala/)
  assert.match(renderer, /escalaDe\(largura, retrato \? 'RETRATO' : 'PAISAGEM'\)/)
  assert.equal(/largura \/ \d+/.test(semComentarios(renderer)), false, 'nenhuma divisão à mão: a conta é do artboard.js')
})

test('🔴 em pé, cada template tem composição própria — e nenhuma soma pixels', () => {
  /* As regras `.retrato` reorganizam o que já existe: colunas viram linhas, o herói sobe, a
     fila anda na vertical. A regra de nunca somar pixels vale nas duas orientações, e toda
     regra em pé que declara linhas declara colunas (a coluna implícita já derrubou o
     artboard e o Carrossel). */
  const emPe = css.slice(css.indexOf('EM PÉ — as composições'))
  assert.ok(emPe.length > 0, 'faltam as composições em pé')
  for (const corpo of ['.tvmb-grade', '.tvmb-destaque', '.tvmb-lista', '.tvmb-vitrine', '.tvmb-of', '.tvmb-cr']) {
    assert.ok(emPe.includes('.tvmb-tela.retrato ' + corpo + ' {'), `${corpo} não tem composição em pé`)
  }
  const grids = [...emPe.matchAll(/\.tvmb-tela\.retrato [^{]+\{([^}]*grid-template-(?:columns|rows)[^}]*)\}/g)]
  assert.ok(grids.length >= 5)
  for (const [regra, bloco] of grids) {
    assert.equal(/grid-template-columns:[^;]*\d+px/.test(bloco), false, `coluna em px: ${regra.slice(0, 60)}`)
    if (bloco.includes('grid-template-rows')) assert.match(bloco, /grid-template-columns/, `linhas sem colunas: ${regra.slice(0, 60)}`)
  }
  // E as regras em pé ficam DEPOIS das deitadas: as guardas acima leem a primeira ocorrência.
  assert.ok(css.indexOf('.tvmb-tela.retrato .tvmb-grade {') > css.indexOf('.tvmb-grade {'))
})

test('🔴 na TV em pé o board preenche a tela — a centralização usa a altura certa', () => {
  // A conta do centro é "metade da caixa menos metade do artboard". Em pé o artboard tem
  // 1920 de altura, não 1080: com o número deitado, o board em pé desceria 420px.
  const tv = ler('../styles/tv.css')
  assert.match(tv, /\.tv-board \.tvmb-palco \{ top: calc\(50% - 540px \* var\(--tvmb-escala\)\); \}/)
  assert.match(tv, /\.tv-board \.tvmb-caixa\.retrato \.tvmb-palco \{ top: calc\(50% - 960px \* var\(--tvmb-escala\)\); \}/)
  // E o player passa a orientação DA TELA para o board.
  assert.match(player, /<MenuBoard board=\{atual\}[^>]*orientacao=\{programacao\?\.tela\?\.orientacao \?\? aparelho\?\.orientacao \?\? 'PAISAGEM'\}/)
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
  /* A proibição de polling vale para o BLOCO DA MEDIÇÃO, não para o arquivo: o Carrossel
     usa `setInterval` para girar os produtos, que é conteúdo e não medida. A guarda antes
     olhava o arquivo inteiro e teria reprovado o template novo sem que nada do invariante
     dela tivesse mudado — mediu a letra, não a regra. */
  const medicao = codigo.slice(codigo.indexOf('const medir = ()'), codigo.indexOf('ro.disconnect()'))
  assert.ok(medicao.length > 100, 'não encontrei o bloco da medição')
  assert.equal(/requestAnimationFrame|setInterval/.test(medicao), false, 'nada de polling na medição')
})

test('🔴 NENHUM template usa largura fixa — é impossível estourar o artboard', () => {
  /* A versão anterior somava pixels e conferia se cabiam em 1760. Uma conta que precisa
     fechar é uma conta que um dia não fecha: foi assim que a Vitrine passou a depender de
     `flex-shrink` para caber, apertada por acidente.

     Agora toda coluna é `fr`/`minmax(0, fr)`, e a divisão é exata por construção. Esta
     guarda não confere aritmética: ela proíbe a aritmética. */
  const corpos = ['.tvmb-grade {', '.tvmb-destaque {', '.tvmb-lista {', '.tvmb-vitrine {', '.tvmb-of {']
  for (const seletor of corpos) {
    const i = css.indexOf(seletor)
    assert.ok(i > 0, `falta ${seletor}`)
    const bloco = css.slice(i, css.indexOf('}', i))
    const colunas = /grid-template-columns:([^;]+);/.exec(bloco)
    assert.ok(colunas, `${seletor} precisa declarar as colunas`)
    assert.equal(/\d+px/.test(colunas[1]), false, `${seletor} não pode ter coluna em px: ${colunas[1].trim()}`)
    assert.match(colunas[1], /minmax\(0,/, `${seletor} precisa de minmax(0,…) para poder encolher`)
  }
  /* E os CARDS precisam de `min-width: 0`: sem ele, a largura mínima do card é o max-content
     do que há dentro, e nenhuma faixa `1fr` consegue ficar menor que isso. A coluna do
     artboard prende a largura; isto permite que o conteúdo realmente caiba nela. */
  for (const seletor of ['.tvmb-card {', '.tvmb-hero {', '.tvmb-vt {']) {
    const bloco = css.slice(css.indexOf(seletor), css.indexOf('}', css.indexOf(seletor)))
    assert.match(bloco, /min-width: 0/, `${seletor} precisa de min-width: 0`)
  }
})

test('🔴 o artboard é GRID de duas faixas — a posição do cabeçalho é estrutural', () => {
  /* Com `flex-direction: column`, "o cabeçalho fica em cima" depende de uma direção que
     qualquer regra posterior pode inverter — e o sintoma disso (título AO LADO do conteúdo)
     apareceu na prévia. Com faixas de grid não há direção para dar errado.

     `minmax(0, 1fr)` na segunda faixa é o que deixa o corpo ENCOLHER: uma faixa `1fr` nunca
     fica menor que o conteúdo, e um card a mais empurraria a composição para fora. */
  const bloco = css.slice(css.indexOf('.tvmb-tela {'), css.indexOf('}', css.indexOf('.tvmb-tela {')))
  assert.match(bloco, /display: grid/)
  assert.match(bloco, /grid-template-rows: auto minmax\(0, 1fr\)/)
  /* A COLUNA precisa ser DECLARADA. Sem ela, a coluna implícita é `auto` — dimensionada pelo
     MAX-CONTENT dos filhos — e quatro cards lado a lado estouram o artboard: o cabeçalho fica
     alinhado à esquerda de uma coluna larguíssima e o corpo vaza para a direita. Foi
     exatamente esse o defeito que apareceu na prévia, e esta linha é a guarda dele. */
  assert.match(bloco, /grid-template-columns: minmax\(0, 1fr\)/, 'a coluna do artboard precisa ser declarada')
  assert.match(bloco, /overflow: hidden/, 'nada escapa do artboard')
  assert.equal(/flex-direction/.test(bloco), false, 'a ordem das faixas não pode depender de flex')
})

test('🔴 o modificador do artboard NÃO colide com a classe de nenhum corpo', () => {
  /* O defeito que deixou quatro dos cinco templates quebrados: a tela recebia
     `tvmb-tela tvmb-grade`, e `.tvmb-grade` é a classe do CORPO da grade. As duas regras
     caíam no mesmo elemento, a do corpo vencia, e o artboard virava um grid 4 × 2 — com o
     cabeçalho numa célula de 419px e o conteúdo espremido na célula ao lado.

     Ficou invisível por duas versões porque `.tvmb-tela` era `display: flex`, e flex ignora
     `grid-template-*`. Só a Oferta escapava, porque o corpo dela se chama `.tvmb-of`.

     Esta guarda é sobre NOMES, não sobre layout: enquanto o modificador tiver prefixo
     próprio, a colisão é impossível. */
  assert.match(renderer, /'tvmb-tela tvmb-tpl-' \+ template\.toLowerCase\(\)/)
  const corpos = ['.tvmb-grade', '.tvmb-destaque', '.tvmb-lista', '.tvmb-vitrine', '.tvmb-of']
  for (const t of ['grade', 'destaque', 'lista', 'vitrine', 'oferta']) {
    assert.equal(corpos.includes(`.tvmb-tpl-${t}`), false, `o modificador tvmb-tpl-${t} colide com um corpo`)
  }
})

test('🔴 o dourado é do PREÇO — o título não disputa com ele', () => {
  // Com título e oito preços dourados, a tela disputa atenção consigo mesma: a cor deixa de
  // significar "olhe aqui" e passa a significar "isto é um menu board".
  const titulo = css.slice(css.indexOf('.tvmb-titulo {'), css.indexOf('}', css.indexOf('.tvmb-titulo {')))
  assert.match(titulo, /color: var\(--tvmb-texto\)/)
  assert.equal(/--tvmb-destaque/.test(titulo), false, 'o título não pode ser dourado')
  assert.match(css, /\.tvmb-preco-valor \{[\s\S]*?color: var\(--tvmb-destaque\)/)
})

test('🔴 a LISTA é 5 + 5, na ordem da seleção', () => {
  // `grid-auto-flow: column` com cinco linhas: os cinco primeiros descem à esquerda e os
  // cinco seguintes à direita. Preenchendo por linha, o item 2 apareceria ao lado do 1 e a
  // ordem que o gestor montou deixaria de ser legível.
  const bloco = css.slice(css.indexOf('.tvmb-lista {'), css.indexOf('.tvmb-linha {'))
  assert.match(bloco, /grid-template-rows: repeat\(5, minmax\(0, 1fr\)\)/)
  assert.match(bloco, /grid-auto-flow: column/)
})

test('🔴 as dez linhas da LISTA têm a MESMA altura, com ou sem foto', () => {
  /* É o caso normal do cardápio que este template atende: alguns itens têm foto, outros não.
     A altura vem da FILEIRA do grid, e não de um `min-height` no item — com o mínimo no
     item, um texto de duas linhas cresceria além dele e desencontraria a coluna vizinha. */
  const bloco = css.slice(css.indexOf('.tvmb-lista {'), css.indexOf('.tvmb-linha {'))
  assert.match(bloco, /grid-template-rows: repeat\(5, minmax\(0, 1fr\)\)/)
  assert.equal(/\.tvmb-linha \{ min-height/.test(css), false, 'a altura é da fileira, não do item')
})

// ── CARROSSEL ────────────────────────────────────────────────────────────────
test('🔴 o tempo do slide sai da DURAÇÃO DO BOARD, nunca de um número fixo', () => {
  /* O board fica no ar por `duracaoSegundos` e depois a playlist troca. Com um tempo
     fixo por slide, seis produtos a 4 s dariam 24 s dentro de um board de 20 s: os dois
     últimos nunca apareceriam. E o gestor não teria como descobrir — o editor mostra o
     carrossel rodando em laço, sem a troca de board que corta o ciclo na parede.

     Dividindo, cada produto aparece uma vez e o ciclo fecha quando o board sai. */
  const codigo = semComentarios(renderer)
  assert.match(codigo, /function Carrossel\(\{[^}]*duracaoSegundos[^}]*\}\)/, 'o Carrossel precisa receber a duração')
  assert.match(codigo, /msPorPasso\(duracaoSegundos, n, MS_MINIMO_SLIDE\)/)
  // A conta em si tem teste de verdade em carrosselFila.test.js; aqui só se garante que
  // o componente CHAMA a conta, em vez de refazer uma cópia dela.
  assert.match(codigo, /from '\.\/carrosselFila\.js'/)
  assert.match(codigo, /duracaoSegundos=\{board\?\.duracaoSegundos\}/, 'e a tela precisa passá-la')
})

test('🔴 o editor conta o ritmo com o MESMO piso do renderer', () => {
  // Dois pisos diferentes fariam o editor prometer seis produtos e a parede mostrar
  // quatro — e a conta do editor existe justamente para essa promessa ser confiável.
  assert.match(renderer, /export const MS_MINIMO_SLIDE = \d+/)
  assert.match(editor, /import MenuBoard, \{ MS_MINIMO_SLIDE \} from/)
  assert.equal(/MS_MINIMO_SLIDE/.test(semComentarios(editor)), true)
  // E o número não aparece solto em lugar nenhum dos dois.
  const soltos = (semComentarios(renderer) + semComentarios(editor)).match(/\b1600\b/g) ?? []
  assert.equal(soltos.length, 1, 'o 1600 só pode existir na declaração da constante')
})

test('🔴 a pista inteira fica MONTADA — deslizar não descarrega foto', () => {
  /* Renderizar só os cards visíveis obrigaria a montar o próximo no instante da troca,
     com a foto ainda carregando — e o que entraria em cena seria um buraco. O que muda é
     a classe e o deslocamento, nunca a existência do nó. */
  const codigo = semComentarios(renderer)
  const i = codigo.indexOf('function Carrossel(')
  const corpo = codigo.slice(i, codigo.indexOf('const TEMPLATES', i))
  assert.match(corpo, /trilha\.map\(/, 'todos os cards da trilha são desenhados')
  assert.match(corpo, /'tvmb-cr-card' \+ \(i === n \+ passo \? ' ativo' : ''\)/)
  assert.equal(/i === ativo \?\s*<article/.test(corpo), false, 'nada de montar só o ativo')
})

test('🔴 a fila nunca tem ponta vazia — a lista é desenhada TRÊS vezes', () => {
  /* Com uma cópia só, a tela abria com metade da fila (nada à esquerda do primeiro) e
     terminava com a outra metade faltando (nada à direita do último). Três cópias, com a
     pista sempre no bloco do meio, garantem vizinhos dos dois lados em qualquer produto.

     O deslocamento soma `n` justamente para começar no bloco do meio — sem isso, as três
     cópias existiriam e a fila continuaria abrindo vazia à esquerda. */
  const codigo = semComentarios(renderer)
  assert.match(codigo, /const trilha = \[\.\.\.itens, \.\.\.itens, \.\.\.itens\]/)
  assert.match(codigo, /'--tvmb-cr-i': n \+ passo/)
  // A lista se repete, então o id sozinho identificaria três nós diferentes.
  assert.match(codigo, /key=\{i \+ '-' \+ p\.id\}/)
})

test('🔴 a volta da fila é INVISÍVEL — recuo sem transição, na posição gêmea', () => {
  /* A posição `n + n` mostra exatamente o mesmo que `n`, porque a lista é a mesma. Então,
     quando o deslize até lá termina, a pista recua `n` posições sem transição e nada na
     tela muda. Tirar o `parada` (ou trocar o gatilho por um timer que dispare antes da
     hora) transforma isso num deslize gigante para a direita, desfazendo a fila inteira à
     vista de quem estiver olhando.

     O gatilho é `onTransitionEnd` de propósito: um timer erraria o instante sempre que a
     WebView da TV atrasasse um quadro. */
  const codigo = semComentarios(renderer)
  assert.match(codigo, /onTransitionEnd=\{aoFimDoDeslize\}/)
  /* ⚠️ `transitionend` BORBULHA, e os trinta cards da trilha também transicionam. Sem o
     filtro, o recuo rodava dezenas de vezes por passo, cada uma subtraindo o tamanho da
     lista — o passo despencava para negativo e a TV ficava branca e travada. Este é o
     bug que aconteceu de verdade na parede; a guarda existe para ele não voltar. */
  assert.match(codigo, /e\.target !== e\.currentTarget \|\| e\.propertyName !== 'transform'/)
  assert.match(codigo, /if \(!precisaRecuar\(passo, n\)\) return/, 'só recua no fim da volta')
  assert.match(codigo, /setDeslizando\(false\)[\s\S]{0,40}setPasso\(\(v\) => v - n\)/)
  assert.match(codigo, /\(deslizando \? '' : ' parada'\)/)
  /* A pista E os cards param juntos. Parando só a pista, no recuo o card que sai de cena
     encolhe animado enquanto o gêmeo dele cresce animado, na mesma posição da tela — o
     produto do meio "cresce duas vezes" e a fila engasga na volta. */
  assert.match(css, /\.tvmb-cr-pista\.parada,\s*\.tvmb-cr-pista\.parada \.tvmb-cr-card \{ transition: none; \}/)
})

test('🔴 o card em cena cresce por SCALE, nunca por largura', () => {
  /* A pista se desloca `i × passo`, e o passo é largura + vão. Se o card ativo ficasse
     mais LARGO, cada produto teria um passo diferente e o alinhamento quebraria já no
     segundo — o card em cena pararia torto, cada vez mais. `scale` não muda o layout,
     então a conta continua valendo para os seis.

     É por isso que a regra do ativo não pode ganhar `width` nem `flex-basis`. */
  const ativo = css.slice(css.indexOf('.tvmb-cr-card.ativo {'), css.indexOf('.tvmb-cr-card .tvmb-selo'))
  assert.match(ativo, /transform: scale\(var\(--tvmb-cr-zoom\)\)/)
  assert.equal(/width|flex-basis|flex:/.test(ativo), false, 'o card em cena não pode mudar de tamanho no layout')
  // E o deslocamento sai da conta única, não de um número escrito à mão por produto.
  const pista = css.slice(css.indexOf('.tvmb-cr-pista {'), css.indexOf('.tvmb-cr-card {'))
  assert.match(pista, /var\(--tvmb-cr-i, 0\) \* var\(--tvmb-cr-passo\)/)
  assert.match(pista, /translate3d\(/, 'camada própria: a tela fica ligada por horas')
})

test('🔴 nenhum grid do board declara LINHAS sem declarar COLUNAS', () => {
  /* Declarar só as linhas deixa a coluna implícita em `auto`, que é o MAX-CONTENT dos
     filhos. Isso já derrubou o artboard uma vez (o cabeçalho foi parar ao lado do corpo,
     o corpo vazou para a direita) e derrubou o Carrossel de outro jeito: o palco tem
     max-content ZERO, porque todos os slides são `position: absolute` e absoluto não
     conta para o tamanho intrínseco de quem o contém — a prévia mostrava os pontinhos e
     mais nada.

     Dois sintomas opostos da mesma omissão. Por isso a guarda é sobre a omissão, e não
     sobre nenhum dos dois estragos. */
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const faltando = [];
  for (const bloco of limpo.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const corpo = bloco[2];
    if (corpo.includes('grid-template-rows') && !corpo.includes('grid-template-columns')) {
      faltando.push(bloco[1].trim().split('\n').pop().trim());
    }
  }
  assert.deepEqual(faltando, [], 'estes grids precisam declarar a coluna também');
});

test('🔴 o Carrossel não depende de haver cabeçalho para ter altura', () => {
  /* O artboard é `auto minmax(0, 1fr)` e o cabeçalho só é renderizado quando há logo,
     título ou subtítulo. Sem ele, o corpo vira o PRIMEIRO filho e cai na linha 1 — que é
     `auto`, a altura do próprio conteúdo.

     Os outros cinco templates nunca notaram porque cards, linhas e fotos têm altura
     própria. O Carrossel é o primeiro cujo conteúdo mede ZERO (todos os slides são
     `position: absolute`): o board sem título mostrava os pontinhos e mais nada, e o
     corpo inteiro media 16px — a altura dos pontinhos.

     A regra é escopada no template porque mudar `.tvmb-corpo` para todos mexeria na
     composição dos cinco já validados em boards sem título. */
  assert.match(css, /\.tvmb-tpl-carrossel \.tvmb-corpo \{[^}]*grid-row: 2/);
  // E a faixa 2 do artboard continua sendo a que tem altura.
  const tela = css.slice(css.indexOf('.tvmb-tela {'), css.indexOf('.tvmb-cabeca'));
  assert.match(tela, /grid-template-rows: auto minmax\(0, 1fr\)/);
});

test('🔴 o fundo do Carrossel reage à troca — NUNCA anima em laço', () => {
  /* Esta parede fica ligada doze horas por dia num aparelho fraco, e ninguém está olhando
     na maior parte do tempo. Uma animação de fundo em laço cobra GPU o tempo inteiro sem
     entregar nada; reagindo à troca, ela custa alguns quadros a cada dois segundos.

     O que sustenta isso são duas peças, e as duas precisam existir: a `key` no halo (sem
     ela o nó seria o mesmo, a animação rodaria uma vez na montagem e o fundo ficaria
     parado para sempre depois do primeiro produto) e o `both`, que segura o último
     fotograma num estado de repouso em vez de voltar ao início.

     `infinite` aqui é exatamente o que este teste existe para impedir. */
  const codigo = semComentarios(renderer);
  assert.match(codigo, /className="tvmb-cr-halo" key=\{'halo-' \+ emCena\.id\}/);
  /* ⚠️ O halo fica FORA do palco. Dentro, o `overflow: hidden` que corta os cards nas
     pontas cortava o halo junto, e o que era para ser uma sombra se esvaindo terminava
     numa linha reta atravessando a tela. */
  const ordem = codigo.indexOf('tvmb-cr-halo') < codigo.indexOf('className="tvmb-cr-palco"');
  assert.ok(ordem, 'o halo precisa vir ANTES do palco, como irmão — nunca dentro dele');

  /* E a sintaxe do gradiente: forma e tamanho NÃO levam vírgula entre si. Com a vírgula
     o gradiente inteiro é inválido, o navegador descarta a declaração e o halo some sem
     erro nenhum no console. */
  const ruins = [...css.matchAll(/radial-gradient\(([^,]+),\s*(circle|ellipse)/g)];
  assert.deepEqual(ruins.map((m) => m[0]), [], 'gradiente com vírgula entre forma e tamanho é descartado');

  const halo = css.slice(css.indexOf('.tvmb-cr-halo {'), css.indexOf('@keyframes tvmb-cr-acende'));
  assert.match(halo, /animation: tvmb-cr-acende \d+ms [^;]*both;/);
  assert.equal(/infinite|alternate/.test(halo), false, 'o halo não pode rodar em laço');

  /* E o fundo em si é PINTADO (background-image), não uma camada extra: uma textura de
     ruído de 1920×1080 seria repintada a cada quadro na WebView da TV. */
  const fundo = css.slice(css.indexOf('.tvmb-tpl-carrossel {'), css.indexOf('.tvmb-cr {'));
  assert.match(fundo, /background-image:\s*\n?\s*radial-gradient/);
  assert.equal(/animation|url\(/.test(fundo), false, 'o fundo não anima nem carrega imagem');
});
