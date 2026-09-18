// TV Indoor › posição física, do lado da TV — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tvPosicao.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MS_AJUSTE, MS_TETO_AJUSTE, classeDoGiro, msRestantesDeAjuste, rotacaoValida } from './tvPosicao.js'

test('🔴 ausência de rotação é "não sei", NUNCA zero', () => {
  /* `Number(null)` é 0, e 0 é uma rotação VÁLIDA. Um servidor de versão anterior não
     manda o campo; se a ausência virasse 0, toda parede em pé desviraria sozinha no
     primeiro refresh contra um servidor antigo (ou numa resposta degradada). */
  for (const vazio of [null, undefined, '', '90', NaN, 45, -90, 360, {}, []]) {
    assert.equal(rotacaoValida(vazio), null, `${JSON.stringify(vazio)} não é rotação`)
  }
  for (const r of [0, 90, 180, 270]) assert.equal(rotacaoValida(r), r)
})

test('TV deitada e sem giro não leva classe — o DOM dela não muda', () => {
  assert.equal(classeDoGiro(0), '')
  assert.equal(classeDoGiro(null), '')
  assert.equal(classeDoGiro(undefined), '')
  assert.equal(classeDoGiro(90), ' giro-90')
  assert.equal(classeDoGiro(180), ' giro-180')
  assert.equal(classeDoGiro(270), ' giro-270')
  assert.equal(classeDoGiro(45), '', 'rotação fora do catálogo não vira classe')
})

test('a janela de ajuste conta o que falta, e fecha sozinha', () => {
  const agora = Date.parse('2026-09-17T12:00:00Z')
  assert.equal(msRestantesDeAjuste(new Date(agora + 60_000).toISOString(), agora), 60_000)
  assert.equal(msRestantesDeAjuste(new Date(agora - 1).toISOString(), agora), 0)
  assert.equal(msRestantesDeAjuste(null, agora), 0)
  assert.equal(msRestantesDeAjuste(undefined, agora), 0)
  assert.equal(msRestantesDeAjuste('amanhã', agora), 0)
  assert.equal(msRestantesDeAjuste(new Date(agora + 60_000).toISOString(), NaN), 0)
})

test('🔴 relógio errado não mantém a TV batendo no servidor o dia inteiro', () => {
  // Tablet Android sem rede erra a hora por horas. Uma janela que "termina daqui a 9
  // horas" pelo relógio torto viraria 6.480 consultas em vez de 120.
  const agora = Date.parse('2026-09-17T12:00:00Z')
  const longe = new Date(agora + 9 * 60 * 60_000).toISOString()
  assert.equal(msRestantesDeAjuste(longe, agora), MS_TETO_AJUSTE)
  assert.ok(MS_TETO_AJUSTE <= 15 * 60_000)
  assert.ok(MS_AJUSTE >= 3_000, 'mais rápido que isso é martelar o servidor')
})

// ── Guardas do player e da folha ─────────────────────────────────────────────
const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')

test('🔴 a rotação vale mesmo com uma troca de programação PENDENTE', () => {
  /* Com um vídeo no ar e a playlist mudando, o player guarda a programação nova em
     `pendente` e sai cedo. Se a rotação só fosse lida da programação aplicada, o gestor
     apertaria "girar" e a parede só responderia quando o vídeo acabasse — o que lê como
     "o botão não funciona". Por isso ela é aplicada ANTES da saída antecipada. */
  const codigo = semComentarios(ler('../pages/TvIndoorPlayer.jsx'))
  const iRot = codigo.indexOf('setRotacao(')
  const iPend = codigo.indexOf('setPendente(nova)')
  assert.ok(iRot > 0 && iPend > 0)
  assert.ok(iRot < iPend, 'a rotação tem de ser aplicada antes do caminho da programação pendente')
  // E só quando o servidor DISSE uma rotação: ausência mantém o que a parede já tem.
  assert.match(codigo, /if \(giro !== null\) setRotacao\(giro\)/)
})

test('🔴 girada, a tela troca LARGURA por ALTURA — inclusive nas medidas em vw/vh', () => {
  /* `vw` e `vh` medem o painel físico, e ele não girou: girou o conteúdo. Numa TV em pé,
     uma fonte em `vw` continuaria proporcional aos 1920 de largura física enquanto a
     largura LÓGICA é 1080 — o título estouraria a tela. Por isso a folha usa `--tv-vw` e
     `--tv-vh`, que trocam de papel com a rotação, e nenhuma regra fora da raiz pode usar a
     unidade crua. */
  const css = ler('../styles/tv.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const raiz = css.slice(css.indexOf('.tv-raiz {'), css.indexOf('}', css.indexOf('.tv-raiz {')))
  assert.match(raiz, /--tv-vw: 1vw/)
  assert.match(raiz, /--tv-vh: 1vh/)
  const girada = css.slice(css.indexOf('.tv-raiz.giro-90,'))
  assert.match(girada, /--tv-vw: 1vh/)
  assert.match(girada, /--tv-vh: 1vw/)

  // Fora do bloco da raiz e do bloco do giro, ninguém usa vw/vh cru.
  const blocos = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  const crus = blocos
    .filter(([, sel]) => !/\.tv-raiz(\.giro-\d+)?\s*(,|$)/.test(sel.trim().split('\n').pop().trim()) && !/^\s*\.tv-raiz\s*$/.test(sel.trim()))
    .filter(([, , corpo]) => /\d(vw|vh|dvh)\b/.test(corpo))
    .map(([, sel]) => sel.trim().split('\n').pop().trim())
  assert.deepEqual(crus, [], 'estas regras medem o painel físico, e quebram numa TV em pé')
})

test('🔴 "girar" não manda graus — quem decide a próxima posição é o servidor', () => {
  /* O navegador só diz "a que está aí não serve". A ordem das posições (da mais provável à
     menos, por orientação) é regra de domínio e tem teste no backend; se a tela mandasse os
     graus, existiriam duas ordens — e a do navegador é a que qualquer um edita no console. */
  const modal = semComentarios(ler('./tv/PosicaoDaTela.jsx'))
  assert.match(modal, /api\.post\(`\/tv-indoor\/telas\/\$\{tela\.id\}\/girar`\)/)
  assert.equal(/girar`, \{/.test(modal), false, 'o POST de girar não leva corpo')
})

test('🔴 as duas escolhas e os dois casos ficam LADO A LADO', () => {
  /* Comparar duas coisas exige que elas estejam do mesmo tamanho, uma ao lado da outra —
     senão o desenho maior parece o "certo" só por ser maior.

     Esta guarda nasceu de um estrago: uma regra nova entrou NO MEIO do seletor agrupado
     `.tvp-opcoes, .tvp-comparar { … }`, a primeira metade ficou com a declaração errada, e
     os cartões de orientação viraram largura de conteúdo, cada um de um tamanho. */
  const css = ler('../styles/global.css')
  for (const sel of ['.tvp-opcoes', '.tvp-comparar']) {
    const bloco = css.match(new RegExp(sel.replace('.', '\\.') + '[^{}]*\\{([^}]*)\\}'))
    assert.ok(bloco, `${sel} não tem regra`)
    assert.match(bloco[1], /grid-template-columns: repeat\(2/, `${sel} deixou de ser duas colunas`)
  }
})

test('🔴 quem mede o formato da saída é o SERVIDOR — o modal só repete', () => {
  /* A medida vem em `tela.saida`, calculada no backend a partir do heartbeat. Se o modal
     voltasse a comparar largura e altura por conta própria, um dia ele diria "já está em
     pé" enquanto o servidor ainda mandava girar — duas réguas para a mesma medida. */
  const modal = ler('./tv/PosicaoDaTela.jsx')
  assert.match(modal, /tela\.saida === tela\.orientacao/)
  assert.equal(/tela\.tela/.test(modal), false, 'o modal não mede a tela por conta própria')
})

test('🔴 o modal de posição abre a janela de ajuste ao nascer e a FECHA ao sair', () => {
  // Janela esquecida aberta = a TV batendo no servidor a cada 5 s por dez minutos à toa.
  // (O teto de 10 min no servidor é o cinto de segurança; isto aqui é o comportamento.)
  const modal = semComentarios(ler('./tv/PosicaoDaTela.jsx'))
  assert.match(modal, /\/ajuste`\)\.then/)
  assert.match(modal, /return \(\) => \{ api\.post\(`\/tv-indoor\/telas\/\$\{tela\.id\}\/ajuste`, \{ encerrar: true \}\)/)
  // E, como todo modal do sistema, só fecha por botão: o overlay não tem clique.
  assert.equal(/className="modal-overlay"[^>]*onClick/.test(modal), false)
})
