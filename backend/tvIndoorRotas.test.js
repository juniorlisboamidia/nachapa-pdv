// TV Indoor — isolamento multiempresa e contrato das rotas. Teste ESTÁTICO sobre o código.
// Rodar: node --test backend/tvIndoorRotas.test.js
//
// ── POR QUE ESTÁTICO, E NÃO HTTP ──────────────────────────────────────────────────────
// Mesma razão de `totemBannerRotas.test.js`: o banco de desenvolvimento desta máquina tem
// migrations pendentes de outras frentes, e aplicá-las só para rodar teste mudaria um
// ambiente que não é desta tarefa. A dívida está registrada no documento da frente.
//
// O que dá para garantir sem banco é mais do que parece, porque vazamento entre lojas não
// é erro de lógica: é um `where` que alguém esqueceu. Este teste lê o código e cobra o
// escopo em TODA consulta do canal — inclusive nas que já recebem um `id` na URL, que é
// justamente onde a distração acontece ("já tenho o id, para que o empresaId?").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Normalizado: em CRLF as regex de comentário param de casar e a varredura se desarma em
// silêncio (foi um bug real, commit e9e9cf8).
const fonte = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/* Cada chamada `prisma.tv<Algo>.<op>({ ... })` do arquivo, com o corpo balanceado. */
function consultasDaTv() {
  const fora = [];
  // `tvMenuBoard` entra aqui pelo mesmo motivo dos outros: a varredura não pode ficar cega
  // para o model novo, ou a próxima consulta sem escopo passa sem ninguém ver.
  const marca = /prisma\.(tvConteudo|tvConteudoImagem|tvPlaylist|tvPlaylistItem|tvMenuBoard)\.(\w+)\(/g;
  let m;
  while ((m = marca.exec(fonte)) !== null) {
    let i = marca.lastIndex - 1;
    let nivel = 0;
    for (; i < fonte.length; i += 1) {
      if (fonte[i] === '(') nivel += 1;
      else if (fonte[i] === ')') { nivel -= 1; if (nivel === 0) break; }
    }
    fora.push({
      model: m[1], op: m[2],
      corpo: fonte.slice(marca.lastIndex, i),
      linha: fonte.slice(0, m.index).split('\n').length,
    });
  }
  return fora;
}

/* O handler de uma rota, do `app.<verbo>('<rota>'` até a PRÓXIMA rota — e não até o
   primeiro `});`, que cortaria o corpo no meio de qualquer chamada multilinha. */
function handler(rota, verbo) {
  const i = fonte.indexOf(`app.${verbo}('${rota}'`);
  assert.ok(i > 0, `handler ${verbo.toUpperCase()} ${rota} não encontrado`);
  const j = fonte.indexOf('\napp.', i + 10);
  return fonte.slice(i, j > 0 ? j : fonte.length);
}

// ── O teste não está vazio por engano ────────────────────────────────────────
test('as rotas do canal existem e as consultas foram encontradas', () => {
  const c = consultasDaTv();
  assert.ok(c.length >= 12, `esperava várias consultas da TV, achei ${c.length}`);
  for (const rota of [
    ['/api/tv-indoor/conteudos', 'get'], ['/api/tv-indoor/conteudos', 'post'],
    ['/api/tv-indoor/conteudos/:id', 'put'], ['/api/tv-indoor/conteudos/:id/imagem', 'put'],
    ['/api/tv-indoor/conteudos/:id', 'delete'], ['/api/tv-indoor/conteudos/:id/imagem', 'get'],
    ['/api/tv-indoor/playlists', 'get'], ['/api/tv-indoor/playlists', 'post'],
    ['/api/tv-indoor/playlists/:id', 'put'], ['/api/tv-indoor/playlists/:id/itens', 'put'],
    ['/api/tv-indoor/playlists/:id', 'delete'],
    ['/api/tv-indoor/telas', 'get'], ['/api/tv-indoor/telas/:id/playlist', 'put'],
    ['/api/public/aparelho/tv/programacao', 'get'],
    ['/api/public/aparelho/tv/conteudo/:id/imagem', 'get'],
  ]) {
    assert.ok(fonte.includes(`app.${rota[1]}('${rota[0]}'`), `falta ${rota[1].toUpperCase()} ${rota[0]}`);
  }
});

// ── Isolamento ───────────────────────────────────────────────────────────────
test('🔴 TODA consulta da TV é escopada por empresa', () => {
  // `empresaId` da sessão do admin, ou `whereDoAparelho` no público. Nunca um id solto.
  //
  // As dispensadas são as que atualizam por `where: { id }` DEPOIS de o mesmo handler já
  // ter confirmado a posse com um `findFirst` escopado, e as que operam sobre itens de uma
  // playlist cuja posse já foi provada — nesses casos o id já foi provado da empresa.
  const semEscopo = [];
  for (const c of consultasDaTv()) {
    const escopado = c.corpo.includes('empresaId') || c.corpo.includes('whereDoAparelho');
    const posseJaProvada = /^\s*\{\s*\n?\s*where:\s*\{\s*id\s*\}/.test(c.corpo);
    // Os itens de uma playlist só são tocados depois do `findFirst` escopado da playlist,
    // no mesmo handler — e o teste abaixo prova que essa conferência existe e vem antes.
    // Duas formas: o `deleteMany` filtra por `playlistId: id`, e o `createMany` recebe as
    // linhas de `itensPlaylistParaGravar(id, …)`, que carimba o MESMO id já provado.
    const itemDePlaylistProvada = c.model === 'tvPlaylistItem'
      && (/playlistId: id\b/.test(c.corpo) || /itensPlaylistParaGravar\(id,/.test(c.corpo));
    if (!escopado && !posseJaProvada && !itemDePlaylistProvada) semEscopo.push(`${c.model}.${c.op} na linha ${c.linha}`);
  }
  assert.deepEqual(semEscopo, [], 'consulta da TV sem escopo de empresa');
});

test('🔴 apagar usa deleteMany COM empresaId — nunca delete simples', () => {
  // Com `delete` e `where: { id }`, um id de outra loja apagaria o conteúdo (ou a
  // programação inteira) dela. Com `deleteMany` escopado, ele afeta ZERO linhas e a rota
  // responde 404.
  for (const [rota, verbo] of [['/api/tv-indoor/conteudos/:id', 'delete'], ['/api/tv-indoor/playlists/:id', 'delete']]) {
    const bloco = handler(rota, verbo);
    assert.match(bloco, /deleteMany\(\{ where: \{ id, empresaId \} \}\)/, `${rota} precisa de deleteMany escopado`);
  }
  const canal = fonte.slice(fonte.indexOf("app.get('/api/tv-indoor/conteudos'"), fonte.indexOf('// ── Job do totem'));
  assert.equal(/prisma\.tvConteudo\.delete\(/.test(canal), false, 'delete simples aceitaria id de outra loja');
  assert.equal(/prisma\.tvPlaylist\.delete\(/.test(canal), false);
});

test('🔴 a TV só recebe playlist DESTA empresa', () => {
  // A FK do banco garante que a playlist existe, não que ela é da mesma loja. Sem esta
  // conferência, um id de outra empresa mandado pelo navegador faria uma TV daqui
  // reproduzir a programação de lá — o vazamento mais caro que este canal poderia ter.
  const bloco = semComentarios(handler('/api/tv-indoor/telas/:id/playlist', 'put'));
  assert.match(bloco, /prisma\.tvPlaylist\.findFirst\(\{ where: \{ id: n, empresaId \}/,
    'a playlist tem de ser conferida contra a empresa da sessão antes de gravar');
  assert.match(bloco, /PLAYLIST_NAO_ENCONTRADA/, 'playlist de outra loja responde 404, não grava');
  assert.match(bloco, /updateMany\(\{\s*\n?\s*where: \{ id, empresaId, tipo: 'TV_INDOOR' \}/,
    'e a tela também: id + empresa + tipo');
});

test('🔴 a gestão de telas não enxerga TOTEM', () => {
  // O filtro é do SERVIDOR, não uma peneira na tela: pedir a lista inteira e esconder
  // metade é como um totem reaparece num contador, num "nenhum resultado" errado ou numa
  // ação em lote.
  const bloco = semComentarios(handler('/api/tv-indoor/telas', 'get'));
  assert.match(bloco, /where: \{ empresaId, tipo: 'TV_INDOOR' \}/, 'a listagem filtra o tipo no banco');
  assert.equal(/TIPOS_APARELHO/.test(bloco), false, 'aqui não vale "qualquer aparelho": é a gestão da TV');
});

test('🔴 os itens da playlist só são gravados depois de a POSSE dela ser provada', () => {
  const bloco = semComentarios(handler('/api/tv-indoor/playlists/:id/itens', 'put'));
  const conferiu = bloco.indexOf('prisma.tvPlaylist.findFirst({ where: { id, empresaId }');
  const apagou = bloco.indexOf('tvPlaylistItem.deleteMany');
  assert.ok(conferiu > 0, 'a posse da playlist tem de ser conferida');
  assert.ok(apagou > conferiu, 'a conferência vem ANTES de apagar os itens');
  // E os ids aceitos saem de consultas ESCOPADAS, não do corpo — os DOIS conjuntos, desde
  // que a playlist ficou polimórfica: é por aqui que o board da empresa B não entra na
  // playlist da A.
  assert.ok(bloco.includes('prisma.tvConteudo.findMany({ where: { empresaId }, select: { id: true } })'),
    'as imagens permitidas saem do acervo da empresa');
  assert.ok(bloco.includes('prisma.tvMenuBoard.findMany({ where: { empresaId }, select: { id: true } })'),
    'e os boards permitidos tambem');
  assert.ok(bloco.includes('validarItensPlaylist(corpo, disponiveis)'),
    'e o corpo e validado CONTRA esses conjuntos');
  // Apagar e recriar na MESMA transação: a programação nunca fica pela metade.
  assert.match(bloco, /prisma\.\$transaction\(\[/, 'a troca de itens precisa ser transacional');
});

// ── Bloco público ────────────────────────────────────────────────────────────
test('🔴 as rotas públicas da TV estão DENTRO do bloco varrido pela guarda do aparelho', () => {
  // O bloco entre os marcadores é o que `aparelhos.tenant.test.js` varre para provar que
  // nenhuma linha lê identidade do corpo. Uma rota pública fora dele escaparia da guarda.
  const i = fonte.indexOf('// ===== INICIO ROTAS PUBLICAS DO APARELHO =====');
  const j = fonte.indexOf('// ===== FIM ROTAS PUBLICAS DO APARELHO =====');
  assert.ok(i > 0 && j > i);
  const bloco = fonte.slice(i, j);
  assert.ok(bloco.includes("app.get('/api/public/aparelho/tv/programacao'"));
  assert.ok(bloco.includes("app.get('/api/public/aparelho/tv/conteudo/:id/imagem'"));
});

test('🔴 a rota pública resolve a empresa pelo APARELHO, nunca pelo pedido', () => {
  for (const rota of ['/api/public/aparelho/tv/programacao', '/api/public/aparelho/tv/conteudo/:id/imagem']) {
    const bloco = semComentarios(handler(rota, 'get'));
    assert.match(bloco, /exigirAparelho\(req, res\)/, `${rota}: sem aparelho autenticado não há empresa`);
    assert.match(bloco, /exigirTvIndoor\(ap, res\)/, `${rota}: e o aparelho precisa ser uma TV`);
    assert.match(bloco, /whereDoAparelho\(ap, \{\}\)/, `${rota}: o escopo sai do aparelho`);
    // O `{}` no lugar do corpo é literal e importante: `whereDoAparelho` descarta o body de
    // propósito, e passar `req.body` ali abriria a porta que a spec §5.4 fecha.
    assert.equal(/whereDoAparelho\(ap, req\.body\)/.test(bloco), false, `${rota}: nada de req.body no escopo`);
    assert.equal(/req\.body\.empresaId|req\.query\.empresaId|params\.empresaId/.test(bloco), false,
      `${rota}: nenhum empresaId vindo do navegador`);
  }
});

test('🔴 um cookie de TOTEM não lê a programação da TV (e vice-versa)', () => {
  const i = fonte.indexOf('function exigirTvIndoor(');
  const fn = fonte.slice(i, fonte.indexOf('\n}', i));
  assert.match(fn, /ap\.tipo === 'TV_INDOOR'/);
  assert.match(fn, /403/);
  assert.match(fn, /APARELHO_NAO_E_TV/);
  // O espelho continua de pé do outro lado.
  const j = fonte.indexOf('function exigirTotem(');
  assert.match(fonte.slice(j, fonte.indexOf('\n}', j)), /ap\.tipo === 'TOTEM'/);
});

test('🔴 a rota pública exige que o ?v= seja a versão ATUAL da imagem', () => {
  // A resposta é `immutable` por um ano. Servir os bytes atuais sob uma versão antiga faria
  // duas TVs terem conteúdos diferentes para a mesma URL, e nada distinguiria os casos
  // depois. A versão entra no WHERE — não bateu, não há linha, e o blob nem é carregado.
  const bloco = semComentarios(handler('/api/public/aparelho/tv/conteudo/:id/imagem', 'get'));
  assert.match(bloco, /const versao = Number\(req\.query\?\.v\)/, 'a versão tem de ser lida da query');
  assert.match(bloco, /Number\.isSafeInteger\(versao\)/, 'versão torta não pode passar');
  assert.match(bloco, /where: \{ id, imagemVersao: versao, \.\.\.whereDoAparelho/,
    'a versão precisa estar no WHERE, junto do escopo da empresa');
  assert.match(bloco, /responderImagem\(/, 'e o cache é o mesmo contrato dos banners');
});

test('🔴 a programação pública nunca carrega os BYTES', () => {
  // Ela é relida a cada 60 s por TV. Um `select` que arraste a relação da imagem colocaria
  // vinte blobs de 500 KB na memória a cada minuto, por tela.
  const bloco = semComentarios(handler('/api/public/aparelho/tv/programacao', 'get'));
  assert.match(bloco, /conteudo: \{ select: TV_CAMPOS \}/, 'os conteúdos vêm por TV_CAMPOS');
  assert.equal(/dados: true/.test(bloco), false, 'nenhum byte na programação');
  // E TV_CAMPOS não pode incluir a relação da imagem.
  const i = fonte.indexOf('const TV_CAMPOS = {');
  const campos = fonte.slice(i, fonte.indexOf('};', i));
  assert.equal(campos.includes('imagem:'), false, 'TV_CAMPOS não pode incluir a relação da imagem');
  assert.equal(campos.includes('dados'), false);
  assert.match(campos, /imagemVersao: true/);
  assert.match(campos, /imagemBytes: true/, 'o TAMANHO viaja; os bytes não');
});

test('🔴 sem playlist (ou com o banco fora) a TV recebe programação VAZIA, nunca um erro', () => {
  // Numa parede da loja, um 500 é uma tela de erro que fica lá o dia inteiro. O fallback
  // institucional é um estado legítimo — e é para ele que a TV cai.
  const bloco = semComentarios(handler('/api/public/aparelho/tv/programacao', 'get'));
  assert.match(bloco, /if \(!ap\.tvPlaylistId\) return vazia\(\)/, 'sem playlist → vazia');
  assert.match(bloco, /if \(!playlist\) return vazia\(\)/, 'playlist de outra loja → vazia, não 403');
  assert.match(bloco, /res\.status\(200\)\.json\(\{ playlist: null/, 'o catch responde 200 com lista vazia');
  assert.equal(/res\.status\(500\)\.json/.test(bloco), false, 'nada de 500 numa parede da loja');
});

// ── Contrato de códigos do canal ─────────────────────────────────────────────
test('🔴 os códigos de erro da TV são os do contrato (nada inventado)', () => {
  const canal = semComentarios(fonte.slice(
    fonte.indexOf('// ── TV Indoor › Conteúdos, Playlists e Telas (ADMIN) ──'),
    fonte.indexOf('// ── Job do totem'),
  ));
  const publicas = semComentarios(fonte.slice(
    fonte.indexOf('// ── TV Indoor (PÚBLICO — a TV pareada) ──'),
    fonte.indexOf('// ===== FIM ROTAS PUBLICAS DO APARELHO ====='),
  ));
  const usados = new Set([...(canal + publicas).matchAll(/erro: '([A-Z_]+)'/g)].map((m) => m[1]));
  const CONTRATO = new Set([
    'APARELHO_NAO_E_TV',          // cookie do canal errado
    'ID_INVALIDO', 'NAO_ENCONTRADO', 'ENTRADA_INVALIDA', 'ERRO_INTERNO',
    'PLAYLIST_INVALIDA', 'PLAYLIST_NAO_ENCONTRADA',
  ]);
  for (const c of usados) assert.ok(CONTRATO.has(c), `código fora do contrato da TV: ${c}`);
  assert.ok(usados.has('APARELHO_NAO_E_TV'));
});

test('🔴 o canal da TV não lê NADA do totem', () => {
  // A regra central da frente: TV e Totem são canais irmãos que dividem infraestrutura, não
  // domínio. Se um dia alguém "resolver" a playlist lendo TotemBanner, este teste cai.
  const canal = fonte.slice(
    fonte.indexOf('// ── TV Indoor › Conteúdos, Playlists e Telas (ADMIN) ──'),
    fonte.indexOf('// ── Job do totem'),
  ) + fonte.slice(
    fonte.indexOf('// ── TV Indoor (PÚBLICO — a TV pareada) ──'),
    fonte.indexOf('// ===== FIM ROTAS PUBLICAS DO APARELHO ====='),
  );
  for (const proibido of ['totemBanner', 'totemConfiguracao', 'totemApresentacao', 'totemDestaque', 'totemEsperaFundo', 'totemCategoria', 'totemFita']) {
    assert.equal(canal.includes(`prisma.${proibido}`), false, `a TV não pode ler ${proibido}`);
  }
  assert.equal(/BANNER_CAMPOS|bannersPublicos|bannerParaAdmin/.test(canal), false,
    'e nem usar as projeções de produto do totem');
});

test('🔴 o módulo puro da TV não importa nada do totem', () => {
  const modulo = fs.readFileSync(new URL('./tvIndoor.js', import.meta.url), 'utf8');
  const imports = [...modulo.matchAll(/from '\.\/([\w.]+)\.js'/g)].map((m) => m[1]);
  // Só helpers TÉCNICOS, que não sabem o que é banner nem o que é conteúdo.
  assert.deepEqual(imports.sort(), ['midiaAgenda'], 'o domínio da TV só depende de helper técnico');
});

// ── Menu Board (contrato e fronteiras) ───────────────────────────────────────
test('as rotas do Menu Board existem', () => {
  for (const [rota, verbo] of [
    ['/api/tv-indoor/menu-boards', 'get'], ['/api/tv-indoor/menu-boards', 'post'],
    ['/api/tv-indoor/menu-boards/:id', 'put'], ['/api/tv-indoor/menu-boards/:id', 'delete'],
    ['/api/tv-indoor/menu-boards/:id/previa', 'get'], ['/api/tv-indoor/catalogo', 'get'],
  ]) {
    assert.ok(fonte.includes(`app.${verbo}('${rota}'`), `falta ${verbo.toUpperCase()} ${rota}`);
  }
});

test('🔴 o navegador NUNCA fala com o Cardápio Web — o caminho é PDV → HUB → CW', () => {
  // A regra central: nenhuma credencial do CW no PDV, nenhuma chamada direta da TV ou do
  // admin ao CW. Quem faz a ponte é `cardapioPedido.js` (JWT de serviço), e o serviço de
  // catálogo é a única porta que o Menu Board usa.
  const canal = fonte.slice(fonte.indexOf('// ── Menu Boards ──'), fonte.indexOf('// ── Telas ──'));
  assert.match(canal, /catalogoDaLoja\(empresaId, \{/, 'o catálogo sai do serviço neutro');
  assert.match(canal, /clienteIdDaEmpresa: clienteIdDaEmpresaTotem/, 'e o clienteId do único lugar que o lê');
  assert.match(canal, /bootstrap: bootstrapTotemCW/, 'a ponte continua sendo a do HUB');
  assert.equal(/cardapioweb|CW_API|apiKey|api_key|X-API-KEY/i.test(canal), false,
    'nenhuma credencial nem host do CW pode aparecer no canal');
});

test('🔴 o Menu Board não lê NADA do totem', () => {
  const canal = fonte.slice(fonte.indexOf('// ── Menu Boards ──'), fonte.indexOf('// ── Telas ──'))
    + fonte.slice(fonte.indexOf('async function boardsDaProgramacao('), fonte.indexOf('// A PROGRAMAÇÃO desta tela.'));
  for (const proibido of ['totemBanner', 'totemConfiguracao', 'totemApresentacao', 'totemDestaque', 'totemEsperaFundo', 'totemCategoria', 'totemFita']) {
    assert.equal(canal.includes(`prisma.${proibido}`), false, `o Menu Board não pode ler ${proibido}`);
  }
  // `produtoFita` é PERMITIDO: a fita foi promovida a conceito neutro do catálogo (marcar
  // "Mais pedido" é decisão sobre o PRODUTO, não sobre o canal), e os dois canais leem o
  // mesmo dado. `projetarCatalogo` continua proibido — a projeção é da vitrine do totem.
  assert.equal(canal.includes('projetarCatalogo'), false, 'o board consome o catálogo CRU, não a projeção da vitrine');
  assert.match(canal, /prisma\.produtoFita\.findMany/, 'a fita é lida do model neutro');
});

test('🔴 a resolução do board é escopada pelo APARELHO, e só vai ao HUB se precisar', () => {
  const i = fonte.indexOf('async function boardsDaProgramacao(');
  const fn = semComentarios(fonte.slice(i, fonte.indexOf('\n// A PROGRAMAÇÃO desta tela.', i)));
  assert.match(fn, /if \(!comBoard\.length\) return vazios/, 'playlist sem board não paga chamada ao HUB');
  assert.match(fn, /whereDoAparelho\(ap, \{\}\)\.empresaId/, 'a empresa do catálogo vem do aparelho');
  assert.match(fn, /where: whereDoAparelho\(ap, \{\}\)/, 'e as fitas também');
  assert.equal(/req\.body|req\.query|req\.params/.test(fn), false, 'nada vindo do navegador');
  // Catálogo fora do ar não pode derrubar a parede: sem catálogo, os boards ficam de fora e
  // as artes continuam tocando.
  assert.match(fn, /if \(!r\.ok\) return vazios/, 'catálogo fora → board fora, nunca erro');
  assert.match(fn, /if \(resolvido\.elegivel\)/, 'board sem produto disponível não entra na programação');
});

test('🔴 a prévia do admin usa a MESMA função que a TV', () => {
  // Admin e parede não podem mostrar coisas diferentes: a resolução é uma só.
  const previa = semComentarios(handler('/api/tv-indoor/menu-boards/:id/previa', 'get'));
  assert.match(previa, /resolverMenuBoard\(board, r\.catalogo, r\.fitas\)/);
  const i = fonte.indexOf('async function boardsDaProgramacao(');
  assert.match(fonte.slice(i, i + 2000), /resolverMenuBoard\(item\.menuBoard, r\.catalogo, fitas\)/);
});

test('🔴 a configuração do board nunca grava preço, nome ou foto', () => {
  // O que entra no banco é o que `validarMenuBoard` devolveu — e o domínio só deixa passar
  // referência, título e ordem. Este teste prende a rota a esse caminho.
  const post = semComentarios(handler('/api/tv-indoor/menu-boards', 'post'));
  assert.match(post, /validarMenuBoard\(req\.body/, 'o corpo passa pelo domínio');
  assert.match(post, /data: \{ empresaId, \.\.\.v\.dados/, 'e só `v.dados` chega ao banco');
  assert.equal(/configuracao: req\.body/.test(post), false, 'o corpo cru não pode ir para a coluna');
});

// ── Aparência (contrato e fronteiras) ────────────────────────────────────────
test('as rotas da aparência existem', () => {
  for (const [rota, verbo] of [
    ['/api/tv-indoor/aparencia', 'get'], ['/api/tv-indoor/aparencia', 'put'],
    ['/api/tv-indoor/aparencia/logo', 'put'], ['/api/tv-indoor/aparencia/logo', 'delete'],
    ['/api/tv-indoor/aparencia/logo', 'get'],
    ['/api/public/aparelho/tv/aparencia/logo', 'get'],
  ]) {
    assert.ok(fonte.includes(`app.${verbo}('${rota}'`), `falta ${verbo.toUpperCase()} ${rota}`);
  }
});

test('🔴 a aparência é escopada por empresa nos dois lados', () => {
  const canal = fonte.slice(fonte.indexOf('// ── Aparência (ADMIN) ──'), fonte.indexOf('// ── Telas ──'));
  // Toda consulta administrativa leva `empresaId` da SESSÃO.
  const consultas = [...canal.matchAll(/prisma\.tvIndoor(Configuracao|Logo)\.(\w+)\(\{([^)]*)/g)];
  assert.ok(consultas.length >= 5, `esperava várias consultas, achei ${consultas.length}`);
  for (const c of consultas) {
    const ok = c[3].includes('empresaId') || c[3].includes('configuracaoId');
    assert.ok(ok, `consulta sem escopo: ${c[0].slice(0, 90)}`);
  }
  // E a pública, pelo APARELHO.
  const publica = semComentarios(handler('/api/public/aparelho/tv/aparencia/logo', 'get'));
  assert.match(publica, /exigirTvIndoor\(ap, res\)/);
  assert.match(publica, /where: \{ \.\.\.whereDoAparelho\(ap, \{\}\), logoVersao: versao \}/,
    'a versão entra no WHERE, junto do escopo do aparelho');
  assert.equal(/req\.body|req\.params\.empresaId|req\.query\.empresaId/.test(publica), false);
});

test('🔴 trocar COR não mexe na versão da logo', () => {
  // Uma troca de paleta não pode fazer todas as TVs rebaixarem uma logo que não mudou.
  const put = semComentarios(handler('/api/tv-indoor/aparencia', 'put'));
  assert.equal(/logoVersao/.test(put), false, 'o PUT de cores não pode tocar em logoVersao');
  assert.match(put, /update: \{ tokens: v\.tokens \}/, 'só os tokens entram no update');
  // E as duas rotas da logo sobem a versão.
  for (const verbo of ['put', 'delete']) {
    assert.match(semComentarios(handler('/api/tv-indoor/aparencia/logo', verbo)), /proximaVersaoLogoTv\(/,
      `${verbo.toUpperCase()} da logo precisa subir a versão`);
  }
});

test('🔴 a versão e os bytes da logo sobem na MESMA transação', () => {
  // Versão nova apontando para bytes velhos é um cache imutável servindo a logo errada por
  // um ano — e o contrário deixa a TV com 404 até alguém salvar de novo.
  const put = semComentarios(handler('/api/tv-indoor/aparencia/logo', 'put'));
  assert.match(put, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(put, /tx\.tvIndoorConfiguracao\.upsert/);
  assert.match(put, /tx\.tvIndoorLogo\.upsert/);
});

test('🔴 o corpo cru nunca vira token: o patch passa pelo domínio', () => {
  const put = semComentarios(handler('/api/tv-indoor/aparencia', 'put'));
  assert.match(put, /tvAparenciaPatch\(atual\?\.tokens, req\.body\?\.tokens\)/);
  assert.equal(/tokens: req\.body/.test(put), false, 'o corpo cru não pode ir para a coluna');
});

test('🔴 a aparência acompanha TODA resposta da programação, inclusive a vazia', () => {
  // É ela que pinta o fallback institucional — que é justamente o que a TV mostra quando
  // não há programação nenhuma.
  const bloco = semComentarios(handler('/api/public/aparelho/tv/programacao', 'get'));
  assert.match(bloco, /const aparencia = await aparenciaDaTv\(ap\)/);
  const vazias = bloco.match(/aparencia,/g) ?? [];
  assert.ok(vazias.length >= 2, 'a resposta vazia e a cheia precisam levar a aparência');
});

test('🔴 falha ao ler a aparência cai nos DEFAULTS, nunca num erro na parede', () => {
  const i = fonte.indexOf('async function aparenciaDaTv(');
  const fn = semComentarios(fonte.slice(i, fonte.indexOf('\n// Os MENU BOARDS', i)));
  assert.match(fn, /\.catch\(\(\) => null\)/, 'cada leitura tem catch próprio');
  assert.match(fn, /catch \{\s*return tvAparenciaPublica\(null\)/, 'e o handler inteiro também');
  assert.match(fn, /whereDoAparelho\(ap, \{\}\)/, 'a empresa vem do aparelho');
});

test('🔴 a aparência da TV não lê NADA do totem', () => {
  const canal = fonte.slice(fonte.indexOf('// ── Aparência (ADMIN) ──'), fonte.indexOf('// ── Telas ──'))
    + fonte.slice(fonte.indexOf('async function aparenciaDaTv('), fonte.indexOf('// Os MENU BOARDS'));
  for (const proibido of ['totemConfiguracao', 'totemAparencia', 'totemBanner', 'totemEsperaFundo']) {
    assert.equal(canal.includes(`prisma.${proibido}`), false, `a aparência da TV não pode ler ${proibido}`);
  }
  assert.equal(/coresEfetivas|PADROES_POR_LAYOUT|aparenciaPublica\(/.test(canal.replace(/tvAparenciaPublica/g, '')), false,
    'nem usar as projeções de aparência do totem');
  // A logo NEUTRA da empresa é permitida — ela é da EMPRESA, não de canal nenhum.
  assert.match(canal, /prisma\.empresa\.findUnique/);
});

// ── Ordem de avaliação do módulo (temporal dead zone) ────────────────────────
// Esta guarda nasceu de uma queda em PRODUÇÃO, e é a única do arquivo que não fala de TV
// Indoor: ela fala de JavaScript.
//
// `TV_PLAYLIST_INCLUDE` é um literal de objeto no TOPO do módulo — avaliado no import, não
// quando uma rota roda. Quando ele passou a referenciar `TV_VIDEO_CAMPOS`, que estava
// declarado 480 linhas ABAIXO, o `server.js` parou de carregar:
//
//     ReferenceError: Cannot access 'TV_VIDEO_CAMPOS' before initialization
//
// O processo morria antes do `app.listen` e o PM2 reiniciava em loop. `node --check` não
// pega isso: a sintaxe está perfeita, o erro é de ORDEM.
//
// Uso dentro de corpo de função aceita qualquer ordem (é adiado). O que não aceita é um
// `const` de topo consumindo outro declarado depois — e é só isso que esta guarda mede.
test('🔴 nenhuma constante de topo é usada antes de ser declarada', async () => {
  const fs = await import('node:fs');
  const fonte = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  // Onde cada constante de topo NASCE. Só as do topo (coluna zero): as de dentro de função
  // têm o escopo delas e não participam da avaliação do módulo.
  const nascimento = new Map();
  for (const m of fonte.matchAll(/^const ([A-Z][A-Z0-9_]*) =/gm)) nascimento.set(m[1], m.index);

  // Os literais de objeto de topo — `const X = {` até o `};` na coluna zero. São eles que
  // avaliam no import, e portanto os únicos que podem cair na dead zone.
  const literais = [...fonte.matchAll(/^const ([A-Z][A-Z0-9_]*) = \{\n[\s\S]*?^\};$/gm)];
  assert.ok(literais.length >= 3, 'o arquivo precisa ter literais de topo para esta guarda valer');

  const problemas = [];
  for (const bloco of literais) {
    const corpo = bloco[0];
    for (const ref of new Set([...corpo.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)].map((r) => r[0]))) {
      if (ref === bloco[1]) continue;
      const onde = nascimento.get(ref);
      if (onde === undefined) continue;            // não é constante nossa de topo
      if (onde > bloco.index) problemas.push(`${bloco[1]} usa ${ref}, que só nasce depois`);
    }
  }
  assert.deepEqual(problemas, [], problemas.join(' | '));
});
