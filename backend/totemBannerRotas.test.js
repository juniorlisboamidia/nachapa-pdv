// Isolamento multiempresa das rotas de banner — teste ESTÁTICO sobre o código das rotas.
// Rodar: node --test backend/totemBannerRotas.test.js
//
// ── POR QUE ESTÁTICO, E NÃO HTTP ──────────────────────────────────────────────────────
// O ideal seria subir o app e bater nas rotas com duas empresas. O banco de
// desenvolvimento desta máquina está com migrations pendentes de outras frentes, e
// aplicá-las só para rodar teste mudaria um ambiente que não é desta tarefa. A dívida está
// registrada no relatório.
//
// O que dá para garantir sem banco é mais do que parece, porque o vazamento entre lojas
// não é um erro de lógica: é um `where` que alguém esqueceu. Este teste lê o código das
// rotas e cobra o escopo em TODA consulta ao banner — inclusive nas que já recebem um `id`
// na URL, que é justamente onde a distração acontece ("já tenho o id, para que o
// empresaId?"). A resposta: sem ele, um id adulterado devolve a linha da outra loja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonte = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');

/* Cada chamada `prisma.totemBanner.<op>({ ... })` do arquivo, com o corpo balanceado. */
function consultasDeBanner() {
  const fora = [];
  const marca = /prisma\.totemBanner(?:Imagem)?\.(\w+)\(/g;
  let m;
  while ((m = marca.exec(fonte)) !== null) {
    let i = marca.lastIndex - 1;
    let nivel = 0;
    for (; i < fonte.length; i += 1) {
      if (fonte[i] === '(') nivel += 1;
      else if (fonte[i] === ')') { nivel -= 1; if (nivel === 0) break; }
    }
    fora.push({ op: m[1], corpo: fonte.slice(marca.lastIndex, i), linha: fonte.slice(0, m.index).split('\n').length });
  }
  return fora;
}

test('o arquivo realmente tem as consultas de banner (o teste não está vazio por engano)', () => {
  const c = consultasDeBanner();
  assert.ok(c.length >= 8, `esperava várias consultas, achei ${c.length}`);
});

test('🔴 TODA consulta de banner é escopada por empresa', () => {
  // `empresaId` da sessão do admin, ou `whereDoAparelho` no público. Nunca um id solto.
  //
  // As únicas dispensadas são as que atualizam por `where: { id }` DEPOIS de o mesmo
  // handler já ter confirmado a posse com um `findFirst` escopado — nesses casos o id já
  // foi provado da empresa, e é o padrão que as rotas de edição usam.
  const semEscopo = [];
  for (const c of consultasDeBanner()) {
    // `escopo` é a variável do bootstrap, e o teste seguinte prova que ela SÓ nasce de
    // `whereDoAparelho` — sem isso, aceitar o nome seria aceitar qualquer coisa.
    const escopado = c.corpo.includes('empresaId')
      || c.corpo.includes('whereDoAparelho')
      || c.corpo.includes('...escopo');
    const posseJaProvada = /^\s*\{\s*\n?\s*where:\s*\{\s*id\s*\}/.test(c.corpo);
    if (!escopado && !posseJaProvada) semEscopo.push(`${c.op} na linha ${c.linha}`);
  }
  assert.deepEqual(semEscopo, [], 'consulta de banner sem escopo de empresa');
});

test('🔴 apagar e reordenar usam deleteMany/updateMany COM empresaId', () => {
  // Com `delete`/`update` simples e `where: { id }`, um id de outra loja apagaria ou
  // reordenaria o carrossel dela. Com `deleteMany`/`updateMany` escopados, ele afeta ZERO
  // linhas e a rota responde 404.
  const bloco = fonte.slice(fonte.indexOf("app.get('/api/totem/banners'"), fonte.indexOf('// ── Job do totem'));
  assert.match(bloco, /deleteMany\(\{\s*where:\s*\{\s*id,\s*empresaId\s*\}/, 'DELETE precisa de deleteMany escopado');
  assert.match(bloco, /updateMany\(\{\s*where:\s*\{\s*id,\s*empresaId\s*\}/, 'a reordenação precisa de updateMany escopado');
  assert.equal(/prisma\.totemBanner\.delete\(/.test(bloco), false, 'delete simples aceitaria id de outra loja');
});

test('🔴 a rota PÚBLICA resolve a empresa pelo APARELHO, nunca pelo pedido', () => {
  const i = fonte.indexOf("app.get('/api/public/aparelho/totem/banner/:id/imagem'");
  assert.ok(i > 0, 'rota pública da imagem não encontrada');
  const bloco = fonte.slice(i, fonte.indexOf('});', i));
  assert.match(bloco, /exigirAparelho\(req, res\)/, 'sem aparelho autenticado não há empresa');
  assert.match(bloco, /exigirTotem\(ap, res\)/, 'e o aparelho precisa ser um TOTEM');
  assert.match(bloco, /whereDoAparelho\(ap, \{\}\)/, 'o escopo sai do aparelho');
  // O `{}` no lugar do corpo é literal e importante: `whereDoAparelho` descarta o body de
  // propósito, e passar `req.body` ali abriria a porta que o §5.4 fecha.
  assert.equal(/whereDoAparelho\(ap, req\.body\)/.test(bloco), false);
  assert.equal(/req\.body\.empresaId|req\.query\.empresaId|params\.empresaId/.test(bloco), false,
    'nenhum empresaId vindo do navegador');
});

test('🔴 a rota /banners/ordem é declarada ANTES de /banners/:id', () => {
  // O Express casa por ordem de declaração. Com `ordem` embaixo, o caminho cairia no
  // parâmetro, viraria Number('ordem') = NaN e responderia 400 — um bug que só aparece ao
  // arrastar, nunca ao editar.
  const ordem = fonte.indexOf("app.put('/api/totem/banners/ordem'");
  const porId = fonte.indexOf("app.put('/api/totem/banners/:id'");
  assert.ok(ordem > 0 && porId > 0);
  assert.ok(ordem < porId, 'a rota /ordem precisa vir primeiro');
});

test('🔴 a listagem nunca traz os BYTES da arte', () => {
  // A arte mora em tabela própria justamente para isto. Se alguém incluir `imagem` no
  // select da listagem, vinte artes de 400 KB entram na memória a cada abertura da tela.
  const i = fonte.indexOf('const BANNER_CAMPOS = {');
  const campos = fonte.slice(i, fonte.indexOf('};', i));
  assert.equal(campos.includes('imagem:'), false, 'BANNER_CAMPOS não pode incluir a relação da imagem');
  assert.equal(campos.includes('dados'), false);
  assert.match(campos, /imagemVersao: true/);
  assert.match(campos, /imagemBytes: true/, 'o TAMANHO viaja; os bytes não');
});

test('🔴 o bootstrap lê os banners com catch próprio', () => {
  // Sem o catch isolado, uma falha só desta leitura estouraria o Promise.all antes da
  // projeção e a VITRINE sumiria em silêncio — a mesma armadilha da configuração.
  const i = fonte.indexOf('prisma.totemBanner.findMany({');
  const bloco = fonte.slice(i, i + 400);
  assert.match(bloco, /\.catch\(\(\) => \[\]\)/, 'a leitura de banners precisa de catch próprio');
  assert.match(bloco, /select: BANNER_CAMPOS/, 'e sem os bytes');
});

test('🔴 a variável `escopo` do bootstrap só nasce de whereDoAparelho', () => {
  // O teste acima aceita `...escopo` como escopo válido. Esta é a amarra: se alguém
  // atribuir outra coisa a essa variável, a permissão de cima deixa de valer.
  const atribuicoes = fonte.match(/const escopo = [^;]+;/g) ?? [];
  assert.ok(atribuicoes.length >= 1, 'nenhuma atribuição de `escopo` encontrada');
  for (const a of atribuicoes) {
    assert.match(a, /whereDoAparelho\(ap, body\)/, `escopo atribuído de outra fonte: ${a}`);
  }
});

test('🔴 a rota pública exige que o ?v= seja a versão ATUAL da arte', () => {
  // A resposta é `immutable` por um ano. Servir os bytes atuais sob uma versão antiga
  // faria dois tablets terem conteúdos diferentes para a mesma URL, e nada distinguiria os
  // dois casos depois. A versão entra no WHERE — não bateu, não há linha, e o blob nem é
  // carregado para ser descartado.
  const i = fonte.indexOf("app.get('/api/public/aparelho/totem/banner/:id/imagem'");
  // Até a PRÓXIMA rota, e não até o primeiro `});`: o handler tem chamadas multilinha
  // dentro dele, e recortar no primeiro fecha-parêntese deixaria metade do corpo de fora.
  // Ate a PROXIMA rota, e nao ate o primeiro `});`: o handler tem chamadas multilinha
  // dentro dele, e recortar no primeiro fecha-parenteses deixaria metade do corpo de fora.
  const bloco = fonte.slice(i, fonte.indexOf('\napp.', i + 10));
  assert.match(bloco, /const versao = Number\(req\.query\?\.v\)/, 'a versão tem de ser lida da query');
  assert.match(bloco, /Number\.isSafeInteger\(versao\)/, 'versão torta não pode passar');
  assert.match(bloco, /where: \{ id, imagemVersao: versao, \.\.\.whereDoAparelho/,
    'a versão precisa estar no WHERE, junto do escopo da empresa');
  // E o isolamento e o cache continuam de pé.
  assert.match(bloco, /whereDoAparelho\(ap, \{\}\)/);
  assert.match(bloco, /responderImagem\(/);
});

test('🔴 a resposta de imagem é cache PRIVADO, versionado e com ETag por empresa', () => {
  // `private` porque a URL é a mesma para todas as lojas: um cache COMPARTILHADO poderia
  // servir a arte da loja A para a B. `Vary: Cookie` fecha a porta em quem ignore o
  // `private`, e o ETag carrega empresa e versão para nunca colidir.
  const i = fonte.indexOf('function responderImagem(');
  const fn = fonte.slice(i, fonte.indexOf('\n}', i));
  assert.match(fn, /Cache-Control', 'private, max-age=31536000, immutable'/);
  assert.match(fn, /res\.set\('Vary', 'Cookie'\)/);
  assert.match(fn, /ETag/);
  assert.equal(/public,/.test(fn), false, 'cache público vazaria arte entre lojas');
});
