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
  proximoIndice, ehMenuBoard, ehVideo, chaveDoItem,
} from './tvProgramacao.js'

const T = (iso) => new Date(iso).getTime()
const AGORA = T('2026-09-14T12:00:00.000Z')
const conteudo = (extra) => ({ tipo: 'imagem', id: 1, ativo: true, imagemUrl: '/img/1?v=1', imagemVersao: 1, duracaoSegundos: 10, ...extra })
// Um MENU BOARD como o servidor o entrega: já resolvido, com preço e selo prontos.
const board = (extra) => ({ tipo: 'menu_board', id: 9, duracaoSegundos: 20, layout: 'GRADE', titulo: 'Burgers', produtos: [{ id: '1', nome: 'X', preco: 10 }], ...extra })
// Um VÍDEO como o servidor o entrega: URL versionada e a duração só como informação.
const video = (extra) => ({ tipo: 'video', id: 7, ativo: true, arquivoUrl: '/api/public/aparelho/tv/video/7/arquivo?v=2', arquivoVersao: 2, duracaoMs: 31_000, ...extra })

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

// ── Aparência: guardas estáticas do player ───────────────────────────────────
test('🔴 a APARÊNCIA não entra na assinatura — trocar cor não reinicia a playlist', async () => {
  // A assinatura é dos ITENS. A aparência viaja ao lado deles na programação, e por isso
  // uma troca de paleta redesenha o board no lugar, sem a TV voltar ao começo da volta.
  const itens = [conteudo({ id: 1 }), board({ id: 9 })]
  assert.equal(assinatura(itens), assinatura(itens))
  const fs = await import('node:fs')
  const fonteMod = fs.readFileSync(new URL('./tvProgramacao.js', import.meta.url), 'utf8')
  assert.equal(/aparencia|tokens/.test(fonteMod), false, 'o módulo da programação não conhece aparência')
})

test('🔴 refresh sem bloco de aparência NÃO apaga o tema que está na tela', async () => {
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const codigo = player.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')
  // Só uma resposta VÁLIDA substitui a aparência: um servidor de versão anterior, ou uma
  // resposta degradada, não pode apagar a identidade da loja da parede.
  assert.match(codigo, /if \(nova\?\.aparencia\?\.tokens\) setAparencia\(nova\.aparencia\)/)
  // E a aparência vive em estado PRÓPRIO, fora de `programacao` — senão o `.catch` que
  // preserva a programação não a alcançaria.
  assert.match(codigo, /const \[aparencia, setAparencia\] = useState\(null\)/)
})

test('🔴 a ARTE do gestor não recebe overlay de tema', async () => {
  // Uma imagem 1920 × 1080 é exibida como foi criada. Nenhum véu, nenhum filtro, nenhuma
  // cor por cima — a aparência pinta a casca, e `object-fit: cover` faz a arte cobrir tudo.
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const i = player.indexOf('className={\'tv-arte\'')
  assert.ok(i > 0, 'a arte precisa existir no player')
  // Entre a abertura da raiz da arte e o fim do componente não pode haver véu nem tinta.
  const trecho = player.slice(player.lastIndexOf('<div className="tv-raiz" ref={raizRef}>', i), player.indexOf('</div>', i))
  for (const proibido of ['tv-veu', 'veu', 'overlay', 'filter:', 'mixBlend', 'background:']) {
    assert.equal(trecho.includes(proibido), false, `${proibido} não pode existir sobre a arte`)
  }
  const css = fs.readFileSync(new URL('../styles/tv.css', import.meta.url), 'utf8')
  const regra = css.slice(css.indexOf('.tv-arte {'), css.indexOf('}', css.indexOf('.tv-arte {')))
  assert.equal(/filter|opacity|background/.test(regra), false, 'a folha também não pode tingir a arte')
})

// ── Vídeo ────────────────────────────────────────────────────────────────────
// O terceiro tipo de item. O que estes testes defendem é sempre a mesma frase: quem dá a
// hora de um vídeo é o ARQUIVO, e não o relógio do player.

test('ehVideo separa os três tipos sem confundir ids iguais', () => {
  assert.equal(ehVideo(video()), true)
  assert.equal(ehVideo(board()), false)
  assert.equal(ehVideo(conteudo()), false)
  assert.equal(ehMenuBoard(video()), false)
})

test('vídeo SEM arquivo não vai para a tela', () => {
  // O servidor já não deveria mandá-lo (a régua pública descarta), mas a TV não depende
  // disso: um item sem `arquivoUrl` vira um `<video src="">` e um quadro preto na parede.
  const lista = paraExibir({ itens: [video({ arquivoUrl: null }), conteudo()], agoraMs: AGORA })
  assert.deepEqual(lista.map((i) => i.tipo), ['imagem'])
})

test('vídeo obedece à MESMA agenda da imagem — a janela diz quando pode COMEÇAR', () => {
  const futuro = video({ inicioEm: '2026-09-14T18:00:00Z' })
  assert.equal(noAr(futuro, AGORA), false)
  assert.equal(noAr(video({ inicioEm: '2026-09-14T06:00:00Z', fimEm: '2026-09-14T23:00:00Z' }), AGORA), true)
  // Uma régua só para os dois tipos: duas réguas divergem, e a que divergisse deixaria a
  // TV tocando o que a gestão jura que está fora do ar.
  assert.equal(noAr(conteudo({ inicioEm: '2026-09-14T18:00:00Z' }), AGORA), false)
})

test('a chave do vídeo carrega a VERSÃO do arquivo — substituir o arquivo dá nova chance', () => {
  // `falhados` guarda chaves. Sem a versão na chave, um vídeo corrompido que falhou uma vez
  // continuaria fora mesmo depois de o gestor subir o arquivo certo — numa tela que não
  // remonta há semanas, isso é definitivo.
  assert.equal(chaveDoItem(video({ arquivoVersao: 2 })), 'v:7:2')
  assert.notEqual(chaveDoItem(video({ arquivoVersao: 3 })), chaveDoItem(video({ arquivoVersao: 2 })))
  // E os três tipos não colidem com o MESMO id.
  assert.notEqual(chaveDoItem(video({ id: 3, arquivoVersao: 0 })), chaveDoItem(conteudo({ id: 3 })))
  assert.notEqual(chaveDoItem(video({ id: 3, arquivoVersao: 0 })), chaveDoItem(board({ id: 3 })))
})

test('trocar o ARQUIVO muda a assinatura; trocar só o nome não muda', () => {
  const antes = assinatura([video({ arquivoVersao: 2 })])
  assert.notEqual(assinatura([video({ arquivoVersao: 3 })]), antes, 'arquivo novo é mudança estrutural')
  assert.equal(assinatura([video({ arquivoVersao: 2, nome: 'outro nome' })]), antes, 'nome é de admin, não da parede')
})

test('o vídeo NÃO é pré-carregado', () => {
  // Pré-carregar uma arte custa uma imagem; pré-carregar um vídeo custa a banda da loja
  // inteira — e o `<video>` já começa a baixar sozinho quando nasce.
  assert.deepEqual(proximaParaPrecarregar([conteudo({ id: 1 }), video({ id: 7 })], 0), [])
  // A arte seguinte continua sendo pré-carregada normalmente.
  assert.deepEqual(proximaParaPrecarregar([video({ id: 7 }), conteudo({ id: 1 })], 0), ['/img/1?v=1'])
})

// ── Vídeo: guardas estáticas do player ───────────────────────────────────────
test('🔴 o vídeo fica FORA do temporizador de rotação', async () => {
  // Dois donos do mesmo item seria o fim: o `setTimeout` de 10 s mataria um filme de 40 s.
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const codigo = player.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')
  // A âncora é `duracaoMs(atual)`, e NÃO o primeiro `setTimeout` do arquivo: o player tem
  // mais de um temporizador (a virada da grade é outro), e ancorar no primeiro fazia esta
  // guarda medir o efeito errado — passando ou falhando por acidente.
  const i = codigo.indexOf('duracaoMs(atual)')
  assert.ok(i > 0, 'o player precisa ter o temporizador de rotação')
  const guarda = codigo.slice(codigo.lastIndexOf('useEffect', i), i)
  assert.match(guarda, /ehVideo\(atual\)/, 'o efeito da rotação precisa recusar o vídeo')
})

test('🔴 o vídeo da parede é mudo, embutido e sem controles', async () => {
  // `muted` + `playsInline` não são estética: sem os dois o navegador não inicia sozinho, e
  // uma TV de loja não tem quem clique. `controls` na parede seria um convite ao cliente.
  const fs = await import('node:fs')
  const item = fs.readFileSync(new URL('./tv/VideoItem.jsx', import.meta.url), 'utf8')
  const tag = item.slice(item.indexOf('<video'), item.indexOf('/>', item.indexOf('<video')))
  for (const exigido of ['muted', 'autoPlay', 'playsInline', 'controls={false}']) {
    assert.ok(tag.includes(exigido), `o <video> da TV precisa de ${exigido}`)
  }
  // Nada de duração fixa: quem avança é o `ended`.
  assert.ok(item.includes("addEventListener('ended'"), 'o avanço é pelo evento ended')
  // Sem comentários: o cabeçalho do arquivo FALA de `setTimeout` justamente para explicar
  // por que ele não existe aqui, e a guarda é sobre o código, não sobre a prosa.
  const semProsa = item.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')
  assert.equal(/setTimeout/.test(semProsa), false, 'nenhum cronômetro decide o fim de um vídeo')
})

test('🔴 existe watchdog de travamento, e ele olha o PROGRESSO do tempo', async () => {
  // `ended` sozinho não basta: um arquivo ruim deixa a TV em buffering eterno, sem erro
  // nenhum. O que separa "vídeo longo" de "vídeo travado" é o `currentTime` andar.
  const fs = await import('node:fs')
  const item = fs.readFileSync(new URL('./tv/VideoItem.jsx', import.meta.url), 'utf8')
  assert.match(item, /currentTime/, 'o vigia precisa ler o tempo corrente')
  assert.match(item, /setInterval/, 'o vigia é periódico')
  assert.match(item, /clearInterval/, 'e ele é desligado no unmount — a TV fica semanas ligada')
  // A rejeição do autoplay é FALHA daquela mídia, nunca um "toque para reproduzir".
  assert.match(item, /\.catch\(\(\) => falhar\('autoplay'\)\)/)
})

// ── Loop eterno: a parede não desiste sozinha ────────────────────────────────
// Duas guardas para a mesma promessa — "o vídeo repete até alguém desativar". Ela vale
// mais do que parece: quem está na frente da tela é o cliente da loja, e uma parede parada
// não avisa ninguém de que parou.
test('🔴 vídeo ÚNICO reinicia sozinho quando o `ended` escapa do loop', async () => {
  // O atributo `loop` deveria bastar e `ended` nem deveria disparar. Se o navegador não
  // honrar, avisar o player seria inútil: ele avançaria para o MESMO índice, o `<video>`
  // não remontaria (a chave não muda) e o último quadro ficaria congelado o dia inteiro.
  const fs = await import('node:fs')
  const item = fs.readFileSync(new URL('./tv/VideoItem.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const i = item.indexOf('const terminou')
  assert.ok(i > 0, 'o tratamento de `ended` precisa existir')
  const corpo = item.slice(i, item.indexOf('el.addEventListener', i))
  assert.match(corpo, /unico/, 'o caminho do vídeo único precisa ser tratado no `ended`')
  assert.match(corpo, /currentTime = 0/, 'e ele reinicia a reprodução à mão')
})

test('🔴 falha não é sentença perpétua — a programação é reanimada', async () => {
  // `falhados` só era esquecido quando a assinatura da programação MUDAVA. Numa playlist
  // estável ela nunca muda, então a primeira falha valia até alguém ir à loja recarregar o
  // navegador. Com um vídeo único, qualquer soluço apagava a parede para sempre.
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const codigo = player.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')

  assert.match(codigo, /const MS_REANIMAR = /, 'precisa haver uma espera antes de tentar de novo')
  // A condição tem de separar playlist VAZIA (repouso legítimo, institucional e ponto) de
  // playlist CHEIA com tudo falho (defeito, e defeito se tenta de novo).
  assert.match(codigo, /const tudoFalhou = total === 0 && \(itens\?\.length \?\? 0\) > 0/)
  const i = codigo.indexOf('tudoFalhou')
  const efeito = codigo.slice(i, codigo.indexOf('}, [tudoFalhou])', i))
  assert.match(efeito, /setTimeout/, 'a reanimação espera — não é um laço apertado')
  assert.match(efeito, /new Set\(\)/, 'e ela LIMPA os falhados, devolvendo a chance a todos')
})

// ── Grade semanal: a troca na virada, e o vídeo que não é cortado ────────────
test('🔴 a virada é agendada pelo relógio do SERVIDOR, não pelo da TV', async () => {
  // Uma TV de loja com a hora errada é o caso comum, não a exceção. A espera sai da
  // DIFERENÇA entre dois instantes do mesmo relógio (`proximaTrocaEm - agoraServidor`);
  // usar `Date.now()` aqui faria a troca acontecer na hora errada em toda tela desajustada.
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const codigo = player.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')

  const i = codigo.indexOf('const alvo = Date.parse(proximaTrocaEm)')
  assert.ok(i > 0, 'o player precisa agendar a virada')
  const efeito = codigo.slice(i, codigo.indexOf('}, [proximaTrocaEm', i))
  assert.match(efeito, /Date\.parse\(agoraServidor\)/, 'a base é o relógio do servidor');
  assert.match(efeito, /alvo - base/, 'a espera é a diferença entre os dois');
  assert.equal(/Date\.now\(\)/.test(efeito), false, 'o relógio da TV não entra na conta');
  assert.match(efeito, /clearTimeout/, 'e o temporizador é desfeito ao mudar');
  // O polling continua existindo como rede de segurança.
  assert.match(codigo, /setInterval\(buscar, MS_PROGRAMACAO\)/);
});

test('🔴 troca de grade NÃO corta um vídeo no meio', async () => {
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const codigo = player.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n')

  // Só ADIA quando há vídeo no ar E a playlist efetiva é OUTRA. Arte e menu board trocam na
  // hora, e a mesma playlist entra direto (a assinatura cuida de não reiniciar o rodízio).
  assert.match(codigo, /if \(videoNoArRef\.current && idAtual !== null && idNovo !== idAtual\)/);
  assert.match(codigo, /setPendente\(nova\)/);
  // E a pendente entra pelos DOIS caminhos de fim de vídeo: terminou, ou falhou.
  assert.match(codigo, /aoTerminar=\{\(\) => \{ if \(!aplicarPendente\(\)\) avancar\(\) \}\}/);
  // A guarda mede o INVARIANTE (a pendente entra quando o vídeo falha), e não a forma exata
  // do handler: ele ganhou o registro de telemetria no meio, e uma guarda presa ao texto
  // teria quebrado por uma mudança que não mexeu no comportamento nenhum.
  const iFalhar = codigo.indexOf('aoFalhar={(motivo)')
  assert.ok(iFalhar > 0, 'o vídeo precisa tratar a falha')
  const handlerFalha = codigo.slice(iFalhar, codigo.indexOf('aoTocar=', iFalhar))
  assert.match(handlerFalha, /marcarFalha\(atual\)/)
  assert.match(handlerFalha, /aplicarPendente\(\)/)
  // Com troca pendente, o vídeo único deixa de repetir — senão o `ended` nunca dispararia e
  // a grade nova ficaria presa até o fim do expediente.
  assert.match(codigo, /unico=\{total < 2 && !pendente\}/);
});

test('🔴 quem decide a grade é o SERVIDOR — a TV não recalcula nada', async () => {
  // A TV não recebe as regras e não sabe que dia é na loja. Se ela calculasse, teríamos dois
  // algoritmos temporais para manter em sincronia — e eles divergiriam no primeiro ajuste.
  const fs = await import('node:fs')
  const player = fs.readFileSync(new URL('../pages/TvIndoorPlayer.jsx', import.meta.url), 'utf8')
  const modulo = fs.readFileSync(new URL('./tvProgramacao.js', import.meta.url), 'utf8')
  for (const [nome, fonte] of [['player', player], ['módulo da programação', modulo]]) {
    assert.equal(/getDay\(\)|diaSemana|toLocaleTimeString|Intl\.DateTimeFormat/.test(fonte), false,
      `o ${nome} não pode resolver a grade`)
  }
});
