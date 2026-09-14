// TV Indoor › a programação na tela — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tvProgramacao.test.js
//
// O que estes testes defendem:
//   1. o relógio da TV não é confiável: a agenda usa o tempo CORRIGIDO pelo servidor;
//   2. as bordas da janela são as MESMAS do servidor (início inclusivo, fim exclusivo);
//   3. a ordem é a da playlist e NÃO é reordenada na tela;
//   4. imagem que falhou é pulada; todas falharem devolve lista vazia (→ fallback);
//   5. a assinatura só muda quando a programação muda DE VERDADE — é o que impede a TV
//      de piscar a cada refresh de 60 s;
//   6. a duração é a do canal da TV (10 s padrão, até 120 s), não a do totem.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAIXA, desvioDoRelogio, noAr, paraExibir, duracaoMs, assinatura, proximaParaPrecarregar,
  proximoIndice, ehMenuBoard, chaveDoItem,
} from './tvProgramacao.js'

const T = (iso) => new Date(iso).getTime()
const AGORA = T('2026-09-14T12:00:00.000Z')
const conteudo = (extra) => ({ tipo: 'imagem', id: 1, ativo: true, imagemUrl: '/img/1?v=1', imagemVersao: 1, duracaoSegundos: 10, ...extra })
// Um MENU BOARD como o servidor o entrega: já resolvido, com preço e selo prontos.
const board = (extra) => ({ tipo: 'menu_board', id: 9, duracaoSegundos: 20, layout: 'GRADE', titulo: 'Burgers', produtos: [{ id: '1', nome: 'X', preco: 10 }], ...extra })

// ── Relógio ──────────────────────────────────────────────────────────────────
test('desvioDoRelogio: a TV atrasada é corrigida pelo servidor', () => {
  // A TV acha que são 11:00; o servidor diz 12:00. Uma hora de desvio.
  assert.equal(desvioDoRelogio('2026-09-14T12:00:00Z', T('2026-09-14T11:00:00Z')), 3_600_000)
  assert.equal(desvioDoRelogio('2026-09-14T12:00:00Z', AGORA), 0)
})

test('desvioDoRelogio: sem instante do servidor, vale o relógio da TV', () => {
  // Degradar para "confiar no aparelho" é melhor do que não exibir nada numa parede.
  for (const ruim of [null, undefined, '', 'ontem']) assert.equal(desvioDoRelogio(ruim, AGORA), 0)
  assert.equal(desvioDoRelogio('2026-09-14T12:00:00Z', NaN), 0)
})

// ── Elegibilidade ────────────────────────────────────────────────────────────
test('noAr: ativo sem agenda está sempre no ar; desligado nunca', () => {
  assert.equal(noAr(conteudo(), AGORA), true)
  assert.equal(noAr(conteudo({ ativo: false }), AGORA), false)
  assert.equal(noAr(null, AGORA), false)
  assert.equal(noAr(conteudo(), NaN), false)
})

test('noAr: início INCLUSIVO e fim EXCLUSIVO — as mesmas bordas do servidor', () => {
  const c = conteudo({ inicioEm: '2026-09-14T12:00:00.000Z', fimEm: '2026-09-14T18:00:00.000Z' })
  assert.equal(noAr(c, AGORA), true, 'o segundo do início já conta')
  assert.equal(noAr(c, AGORA - 1), false)
  assert.equal(noAr(c, T('2026-09-14T18:00:00.000Z')), false, 'o segundo do fim já não conta')
})

test('noAr: data torta não derruba a peça ativa', () => {
  // Um `inicioEm` ilegível não pode apagar a TV: o que se ignora é a borda, não a peça.
  assert.equal(noAr(conteudo({ inicioEm: 'quinta que vem' }), AGORA), true)
})

// ── A lista da tela ──────────────────────────────────────────────────────────
test('🔴 paraExibir NÃO reordena: a sequência é a que o gestor montou na playlist', () => {
  const lista = paraExibir({
    itens: [conteudo({ id: 9 }), conteudo({ id: 2 }), conteudo({ id: 5 })],
    agoraMs: AGORA,
  })
  assert.deepEqual(lista.map((c) => c.id), [9, 2, 5], 'ordenar por id desfaria a programação')
})

test('paraExibir tira o agendado para o futuro e o encerrado', () => {
  const lista = paraExibir({
    itens: [
      conteudo({ id: 1 }),
      conteudo({ id: 2, inicioEm: '2026-12-01T00:00:00Z' }),
      conteudo({ id: 3, fimEm: '2026-09-01T00:00:00Z' }),
      conteudo({ id: 4, ativo: false }),
    ],
    agoraMs: AGORA,
  })
  assert.deepEqual(lista.map((c) => c.id), [1])
})

test('🔴 imagem que FALHOU é pulada; todas falharem devolve vazio (→ fallback)', () => {
  const itens = [conteudo({ id: 1 }), conteudo({ id: 2 })]
  assert.deepEqual(paraExibir({ itens, agoraMs: AGORA, falhados: new Set(['i:1']) }).map((c) => c.id), [2])
  assert.deepEqual(paraExibir({ itens, agoraMs: AGORA, falhados: new Set(['i:1', 'i:2']) }), [],
    'com tudo falhando a TV cai no institucional, nunca num retângulo preto')
})

test('🔴 a chave de falha é por TIPO: uma arte quebrada não tira um board do ar', () => {
  // `i:3` e `b:3` são coisas diferentes — os dois têm id próprio, em tabelas próprias.
  assert.equal(chaveDoItem(conteudo({ id: 3 })), 'i:3')
  assert.equal(chaveDoItem(board({ id: 3 })), 'b:3')
  const itens = [conteudo({ id: 3 }), board({ id: 3 })]
  const fora = paraExibir({ itens, agoraMs: AGORA, falhados: new Set(['i:3']) })
  assert.deepEqual(fora.map((i) => i.tipo), ['menu_board'])
})

test('paraExibir ignora conteúdo sem URL e aguenta entrada torta', () => {
  assert.deepEqual(paraExibir({ itens: [conteudo({ imagemUrl: null })], agoraMs: AGORA }), [])
  assert.deepEqual(paraExibir({ itens: null, agoraMs: AGORA }), [])
  assert.deepEqual(paraExibir({}), [])
  assert.deepEqual(paraExibir({ itens: [null, undefined], agoraMs: AGORA }), [])
})

// ── Duração ──────────────────────────────────────────────────────────────────
test('a duração é a do canal da TV: 10 s de padrão, até 120 s', () => {
  assert.deepEqual(FAIXA, { minS: 3, maxS: 120, padraoS: 10 })
  assert.equal(duracaoMs(conteudo({ duracaoSegundos: 30 })), 30_000)
  assert.equal(duracaoMs(conteudo({ duracaoSegundos: 200 })), 120_000, 'grampeia no teto do canal')
  assert.equal(duracaoMs(conteudo({ duracaoSegundos: 1 })), 3_000)
})

test('duração ausente cai no PADRÃO, não no piso', () => {
  // `Number(null)` é 0 e `Number(true)` é 1: sem o teste de tipo, ausência viraria 3 s e a
  // TV giraria três vezes mais rápido do que a loja pediu.
  for (const vazio of [null, undefined, '', '   ', true, {}, []]) {
    assert.equal(duracaoMs(conteudo({ duracaoSegundos: vazio })), 10_000, String(vazio))
  }
  assert.equal(duracaoMs(undefined), 10_000)
})

// ── Não piscar ───────────────────────────────────────────────────────────────
test('🔴 refresh que devolve a MESMA programação não muda a assinatura (a TV não pisca)', () => {
  const a = [conteudo({ id: 1 }), conteudo({ id: 2 })]
  const b = [conteudo({ id: 1 }), conteudo({ id: 2 })]
  assert.equal(assinatura(a), assinatura(b))
})

test('a assinatura MUDA quando a arte, a duração ou a lista mudam', () => {
  const base = [conteudo({ id: 1 })]
  assert.notEqual(assinatura(base), assinatura([conteudo({ id: 1, imagemVersao: 2 })]), 'arte nova é mudança')
  assert.notEqual(assinatura(base), assinatura([conteudo({ id: 1, duracaoSegundos: 20 })]))
  assert.notEqual(assinatura(base), assinatura([conteudo({ id: 1 }), conteudo({ id: 2 })]))
  assert.notEqual(assinatura(base), assinatura([conteudo({ id: 2 })]))
})

test('o NOME não entra na assinatura — renomear no admin não reinicia a TV', () => {
  assert.equal(assinatura([conteudo({ id: 1, nome: 'A' })]), assinatura([conteudo({ id: 1, nome: 'B' })]))
})

test('assinatura de lista vazia ou torta é string, nunca erro', () => {
  assert.equal(assinatura([]), '')
  assert.equal(assinatura(null), '')
})

// ── Pré-carregamento e rotação ───────────────────────────────────────────────
test('pré-carrega a PRÓXIMA, e nada com um conteúdo só', () => {
  const lista = [conteudo({ id: 1, imagemUrl: '/a' }), conteudo({ id: 2, imagemUrl: '/b' })]
  assert.deepEqual(proximaParaPrecarregar(lista, 0), ['/b'])
  assert.deepEqual(proximaParaPrecarregar(lista, 1), ['/a'], 'circular')
  assert.deepEqual(proximaParaPrecarregar([lista[0]], 0), [], 'com um só não há o que pré-carregar')
  assert.deepEqual(proximaParaPrecarregar(null, 0), [])
})

test('🔴 o board pré-carrega as FOTOS DOS PRODUTOS dele', () => {
  // Sem isto, a troca mostraria oito retângulos vazios enchendo um a um na frente do cliente.
  const lista = [
    conteudo({ id: 1, imagemUrl: '/a' }),
    board({ id: 9, produtos: [{ id: '1', imagemUrl: '/p1' }, { id: '2', imagemUrl: null }, { id: '3', imagemUrl: '/p3' }] }),
  ]
  assert.deepEqual(proximaParaPrecarregar(lista, 0), ['/p1', '/p3'], 'produto sem foto não vira URL vazia')
})

test('proximoIndice é circular e nunca devolve NaN', () => {
  assert.equal(proximoIndice(0, 3), 1)
  assert.equal(proximoIndice(2, 3), 0)
  assert.equal(proximoIndice(0, 0), 0, 'lista vazia não pode virar índice inválido')
  assert.equal(proximoIndice(NaN, 3), 1)
})

// ── Guarda estática do player ────────────────────────────────────────────────
// O comportamento abaixo mora no JSX (`pages/TvIndoorPlayer.jsx`) e não num módulo puro,
// mas é o que mais provavelmente alguém desfaz sem perceber — então fica preso por
// leitura de código, no mesmo estilo das guardas do backend.
test('🔴 o player assina a programação CRUA, não a lista filtrada', async () => {
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const semComentarios = player.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  // Com `assinatura(lista)` a TV também não piscava — mas um id que entrou em `falhados`
  // ficaria lá para sempre: esta tela NUNCA remonta, e a loja corrigir a arte não devolvia
  // a chance ao conteúdo. Com a crua, trocar a arte muda a chave e limpa os falhados.
  assert.match(semComentarios, /const chave = assinatura\(itens\)/, 'a chave sai da programação crua')
  assert.equal(/assinatura\(lista\)/.test(semComentarios), false, 'assinar a lista filtrada prende o falhado para sempre')
  assert.match(semComentarios, /setFalhados\(\(s\) => \(s\.size \? new Set\(\) : s\)\)/,
    'a mudança de programação precisa dar nova chance a quem falhou')
  // E o institucional continua sendo a saída para "nada no ar".
  assert.match(semComentarios, /if \(!atual\) return <Institucional/, 'sem conteúdo elegível, a TV mostra a marca')
})

// ── Menu Board na programação ────────────────────────────────────────────────
test('ehMenuBoard: item sem `tipo` é IMAGEM (contrato do servidor)', () => {
  assert.equal(ehMenuBoard(board()), true)
  assert.equal(ehMenuBoard(conteudo()), false)
  assert.equal(ehMenuBoard({ id: 1 }), false, 'o DEFAULT da coluna e IMAGEM')
  assert.equal(ehMenuBoard(null), false)
})

test('🔴 o board não passa pela régua de agenda da imagem — ele já vem resolvido', () => {
  // Quem sabe se ha produto disponivel e o SERVIDOR, que tem o catalogo. A checagem aqui e a
  // ultima rede: board sem produto nenhum seria uma tela vazia na parede.
  assert.equal(noAr(board(), AGORA), true)
  assert.equal(noAr(board({ produtos: [] }), AGORA), false)
  assert.equal(noAr(board({ produtos: null }), AGORA), false)
  // Board nao tem `ativo` nem janela no contrato publico, e isso nao o derruba.
  assert.equal(noAr({ tipo: 'menu_board', id: 1, produtos: [{ id: 'a' }] }, AGORA), true)
})

test('🔴 a playlist MISTA sai na ordem, sem reordenar', () => {
  const lista = paraExibir({
    itens: [conteudo({ id: 1 }), board({ id: 9 }), conteudo({ id: 2 }), board({ id: 8 })],
    agoraMs: AGORA,
  })
  assert.deepEqual(lista.map((i) => i.tipo + ':' + i.id), ['imagem:1', 'menu_board:9', 'imagem:2', 'menu_board:8'])
})

test('a duração do board é a DELE (20 s), como a de qualquer item', () => {
  assert.equal(duracaoMs(board({ duracaoSegundos: 20 })), 20_000)
  assert.equal(duracaoMs(board({ duracaoSegundos: 300 })), 120_000, 'o teto do canal vale para os dois tipos')
})

test('🔴 o PREÇO não entra na assinatura: preço novo NÃO reinicia o rodízio', () => {
  // E o coracao do menu board: o gestor muda o preco no Cardapio Web e a parede mostra o
  // valor novo no proximo refresh, sem a tela voltar para o comeco da programacao.
  const antes = [board({ produtos: [{ id: '1', preco: 10 }, { id: '2', preco: 20 }] })]
  const depois = [board({ produtos: [{ id: '1', preco: 12 }, { id: '2', preco: 20 }] })]
  assert.equal(assinatura(antes), assinatura(depois))
  // Promocao nova tambem e so preco.
  const promo = [board({ produtos: [{ id: '1', preco: 9, precoAnterior: 10, descontoPercentual: 10 }, { id: '2', preco: 20 }] })]
  assert.equal(assinatura(antes), assinatura(promo))
})

test('🔴 a COMPOSIÇÃO do board muda a assinatura (produto que saiu, layout, título)', () => {
  const base = [board({ produtos: [{ id: '1' }, { id: '2' }] })]
  assert.notEqual(assinatura(base), assinatura([board({ produtos: [{ id: '1' }] })]), 'produto indisponivel saiu')
  assert.notEqual(assinatura(base), assinatura([board({ produtos: [{ id: '2' }, { id: '1' }] })]), 'a ordem mudou')
  assert.notEqual(assinatura(base), assinatura([board({ produtos: [{ id: '1' }, { id: '2' }], layout: 'LISTA' })]))
  assert.notEqual(assinatura(base), assinatura([board({ produtos: [{ id: '1' }, { id: '2' }], titulo: 'Outro' })]))
  assert.notEqual(assinatura(base), assinatura([board({ produtos: [{ id: '1' }, { id: '2' }], duracaoSegundos: 40 })]))
})

test('imagem e board com o MESMO id não se confundem na assinatura', () => {
  assert.notEqual(assinatura([conteudo({ id: 3 })]), assinatura([board({ id: 3, produtos: [] })]))
})
