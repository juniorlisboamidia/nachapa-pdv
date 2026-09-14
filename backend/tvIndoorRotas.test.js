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
  const marca = /prisma\.(tvConteudo|tvConteudoImagem|tvPlaylist|tvPlaylistItem)\.(\w+)\(/g;
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
    // linhas de `itensTvParaGravar(id, …)`, que carimba o MESMO id já provado.
    const itemDePlaylistProvada = c.model === 'tvPlaylistItem'
      && (/playlistId: id\b/.test(c.corpo) || /itensTvParaGravar\(id,/.test(c.corpo));
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
  // E os ids aceitos saem de uma consulta ESCOPADA, não do corpo.
  assert.match(bloco, /prisma\.tvConteudo\.findMany\(\{ where: \{ empresaId \}, select: \{ id: true \} \}\)/,
    'os ids permitidos saem do catálogo da empresa');
  assert.match(bloco, /validarItensTv\(req\.body\?\.ids, new Set\(meus\.map/,
    'e o corpo é validado CONTRA esse conjunto');
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
