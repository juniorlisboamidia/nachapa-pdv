// Anti-tampering das rotas públicas do aparelho (regra do Junior, 2026-09-10):
// NADA de identidade vem do corpo da requisição. Duas provas, porque uma só não basta:
//
//  (a) COMPORTAMENTO — `whereDoAparelho(aparelho, body)` recebe o corpo de propósito e
//      tem de devolver sempre o mesmo escopo do aparelho, com corpos hostis inclusive.
//  (b) CÓDIGO — varredura do bloco de rotas públicas em server.js (entre os marcadores
//      "INICIO/FIM ROTAS PUBLICAS DO APARELHO"): nenhuma linha lê empresaId/clienteId/
//      dispositivoId/aparelhoId do body, e todo acesso ao Prisma ali passa por
//      whereDoAparelho() ou filtroAparelhoDoCookie(). Se alguém acrescentar uma
//      consulta sem escopo, este teste quebra — é o ponto dele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filtroAparelhoDoCookie, escopoEmpresa, whereDoAparelho, hashCredencial, TIPOS_APARELHO } from './aparelhos.js';

// Aparelho da loja 3 (o que o cookie resolveu).
const aparelho = { id: 7, empresaId: 3, nome: 'Totem da frente', tipo: 'TOTEM', ativo: true };

// Corpos que um tablet (ou qualquer um com o cookie) poderia mandar para trocar de loja.
const PAYLOADS_HOSTIS = [
  { empresaId: 99 },
  { empresaId: '99' },
  { empresaId: null },
  { clienteId: 'outro-cliente' },
  { clienteId: 'admin', empresaId: 0 },
  { dispositivoId: 12345 },
  { aparelhoId: 12345, empresaId: 98 },
  { empresa: { id: 97 }, loja: { empresaId: 96 } },
  { codigo: '000123', empresaId: 95, clienteId: 'xx' },
  { versao: '1.0', tela: { w: 1, h: 1 }, empresaId: 94 },
  [{ empresaId: 93 }],
  'empresaId=92',
  null,
  undefined,
];
const VALORES_HOSTIS = ['99', '98', '97', '96', '95', '94', '93', '92', 'outro-cliente', 'admin', '12345', 'clienteId', 'dispositivoId', 'aparelhoId'];

test('(a) whereDoAparelho: o corpo NUNCA muda o escopo', () => {
  const esperado = escopoEmpresa(aparelho);
  assert.deepEqual(esperado, { empresaId: 3 });
  for (const corpo of PAYLOADS_HOSTIS) {
    const where = whereDoAparelho(aparelho, corpo);
    assert.deepEqual(where, esperado, `corpo: ${JSON.stringify(corpo)}`);
    assert.deepEqual(Object.keys(where), ['empresaId']);
    const serializado = JSON.stringify(where);
    for (const v of VALORES_HOSTIS) {
      assert.ok(!serializado.includes(v), `vazou "${v}" com o corpo ${JSON.stringify(corpo)}`);
    }
  }
  // Trocar de loja só trocando o APARELHO — e é o cookie que escolhe o aparelho.
  assert.deepEqual(whereDoAparelho({ ...aparelho, empresaId: 4 }, { empresaId: 99 }), { empresaId: 4 });
});

test('(a) where do /heartbeat e do /eu: id do aparelho + empresaId do aparelho', () => {
  const corpoHostil = { empresaId: 99, clienteId: 'outro-cliente', versao: '1.0' };
  // É este o objeto que as rotas passam ao Prisma (updateMany/findUnique).
  assert.deepEqual({ id: aparelho.id, ...whereDoAparelho(aparelho, corpoHostil) }, { id: 7, empresaId: 3 });
  assert.deepEqual({ id: whereDoAparelho(aparelho, corpoHostil).empresaId }, { id: 3 });
});

test('(a) filtroAparelhoDoCookie: identidade = hash da credencial, ativo, tipo do totem', () => {
  const hash = hashCredencial('credencial-de-teste');
  const filtro = filtroAparelhoDoCookie(hash);
  assert.deepEqual(filtro, { credencialHash: hash, ativo: true, tipo: { in: TIPOS_APARELHO } });
  // Nada de id/empresaId/clienteId: quem manda é o cookie.
  assert.deepEqual(Object.keys(filtro).sort(), ['ativo', 'credencialHash', 'tipo']);
  // Fail-closed: PONTO/ETIQUETA (legados) nunca entram por aqui, nem aparelho desativado.
  assert.ok(!filtro.tipo.in.includes('PONTO'));
  assert.ok(!filtro.tipo.in.includes('ETIQUETA'));
  assert.equal(filtro.ativo, true);
  // Credencial diferente = filtro diferente (não vaza entre aparelhos).
  assert.notEqual(filtroAparelhoDoCookie(hashCredencial('cred-A')).credencialHash, filtroAparelhoDoCookie(hashCredencial('cred-B')).credencialHash);
});

// ── (b) Varredura do código das rotas públicas ───────────────────────────────
const MARCA_INICIO = '// ===== INICIO ROTAS PUBLICAS DO APARELHO =====';
const MARCA_FIM = '// ===== FIM ROTAS PUBLICAS DO APARELHO =====';

function blocoPublico() {
  // Normalizado: em CRLF as regex de comentário deste arquivo param de casar e a
  // varredura se desarma em silêncio. Ver a nota em totem.tenant.test.js.
  const fonte = readFileSync(new URL('./server.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const i = fonte.indexOf(MARCA_INICIO);
  const f = fonte.indexOf(MARCA_FIM);
  assert.ok(i > 0, 'marcador de INICIO das rotas públicas do aparelho não encontrado em server.js');
  assert.ok(f > i, 'marcador de FIM das rotas públicas do aparelho não encontrado em server.js');
  return fonte.slice(i, f + MARCA_FIM.length);
}

// Sem os comentários: a varredura julga CÓDIGO, não prosa.
const semComentarios = (bloco) => bloco.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

test('(b) o bloco público existe e é o que se espera', () => {
  const bloco = blocoPublico();
  for (const rota of ['/api/public/aparelho/parear', '/api/public/aparelho/eu', '/api/public/aparelho/heartbeat', '/api/public/aparelho/sair']) {
    assert.ok(bloco.includes(rota), `rota ${rota} fora do bloco varrido`);
  }
  assert.ok(bloco.includes('resolverAparelhoPorCookie'));
});

// Nenhum campo de identidade pode ser LIDO da requisição — em nenhuma das suas caixas
// (body, query, params, headers). As rotas do totem trouxeram usos legítimos de
// `clienteId` (derivado no servidor), `dispositivoId: ap.id` e `req.params.envioId`, então
// a regra deixou de ser "a palavra não aparece" e passou a ser "a palavra nunca vem do
// cliente"; o que cada um desses usos pode ser está varrido linha a linha em
// totem.tenant.test.js.
test('(b) nenhuma linha do bloco público lê identidade do corpo', () => {
  const codigo = semComentarios(blocoPublico());
  const proibidos = [
    /req\.(?:body|query|params|headers)\s*\??\.?\s*\[?\s*['"]?(?:empresaId|clienteId|dispositivoId|aparelhoId)/,
    /\bempresaId\s*:\s*(?:Number|String|parseInt)?\(?\s*req\./,
    /\bclienteId\s*:\s*(?:Number|String|parseInt)?\(?\s*req\./,
    /\bdispositivoId\s*:\s*(?:Number|String|parseInt)?\(?\s*req\./,
    /\baparelhoId\b/,
    // Desestruturar identidade do corpo também não vale (`const { empresaId } = req.body`).
    /\{[^}\n]*\b(?:empresaId|clienteId|dispositivoId)\b[^}\n]*\}\s*=\s*req\./,
  ];
  for (const re of proibidos) {
    const m = codigo.match(re);
    assert.equal(m, null, `o bloco público casou com ${re}: "${m?.[0]}"`);
  }
});

test('(b) todo acesso ao Prisma no bloco público passa pelo escopo do aparelho', () => {
  const linhas = semComentarios(blocoPublico()).split('\n');
  const alvos = [];
  linhas.forEach((linha, i) => {
    if (/prisma\.(dispositivo|empresa|pedidoTotemEnvio|totemApresentacao)\./.test(linha)) {
      // O where pode estar na mesma linha ou nas 3 seguintes (chamada multilinha).
      alvos.push({ linha: i + 1, trecho: linhas.slice(i, i + 4).join('\n') });
    }
  });
  assert.ok(alvos.length >= 5, `esperava várias consultas no bloco, achei ${alvos.length}`);
  const excecoes = [];
  for (const alvo of alvos) {
    // `where: escopo` conta como escopado: `escopo` é a variável que o bootstrap monta uma
    // vez para as leituras em paralelo, e o teste logo abaixo prova que ela SÓ nasce de
    // `whereDoAparelho(ap, body)`. Sem essa amarra, aceitar o nome seria aceitar qualquer
    // coisa; com ela, o guarda continua tão apertado quanto antes.
    if (/whereDoAparelho\(|filtroAparelhoDoCookie\(|where:\s*escopo\b|\.\.\.escopo\b/.test(alvo.trecho)) continue;
    // ÚNICA exceção admitida: a busca pelo código de pareamento, global de propósito
    // (o código é @unique no banco inteiro e É a identidade da tentativa — nesse
    // momento ainda não existe aparelho resolvido para dar escopo).
    assert.ok(/pareamentoCodigo:\s*codigo/.test(alvo.trecho), `consulta sem escopo do aparelho na linha ${alvo.linha} do bloco:\n${alvo.trecho}`);
    excecoes.push(alvo.linha);
  }
  assert.equal(excecoes.length, 1, `a busca por código deve ser a ÚNICA consulta sem escopo (achei ${excecoes.length})`);
});

test('(b) a variável `escopo` do bloco público só nasce de whereDoAparelho', () => {
  // A amarra do guarda acima. Se alguém atribuir outra coisa a `escopo` — um empresaId
  // vindo do corpo, por exemplo —, a permissão que ele concede deixa de valer e este teste
  // cai antes.
  const atribuicoes = semComentarios(blocoPublico()).match(/const escopo = [^;]+;/g) || [];
  assert.ok(atribuicoes.length >= 1, 'nenhuma atribuição de `escopo` no bloco público');
  for (const a of atribuicoes) {
    assert.match(a, /whereDoAparelho\(ap, body\)/, `escopo atribuído de outra fonte: ${a}`);
  }
});

test('(b) o Set-Cookie do pareamento decide Secure pela função pura', () => {
  const codigo = semComentarios(blocoPublico());
  assert.ok(codigo.includes('cookieDeveSerSecure(req)'), 'a decisão do Secure tem de vir de cookieDeveSerSecure');
  // O que caiu na revisão: NODE_ENV e X-Forwarded-Proto não decidem mais nada aqui.
  assert.equal(codigo.match(/NODE_ENV/), null);
  assert.equal(codigo.match(/x-forwarded-proto/i), null);
});

test('(b) /sair exige o cookie antes de limpar', () => {
  const bloco = blocoPublico();
  const i = bloco.indexOf("app.post('/api/public/aparelho/sair'");
  assert.ok(i > 0);
  const rota = bloco.slice(i);
  const pedeAparelho = rota.indexOf('exigirAparelho(req, res)');
  const limpa = rota.indexOf('cookieAparelhoLimpar()');
  assert.ok(pedeAparelho > 0, '/sair tem de resolver o aparelho pelo cookie');
  assert.ok(limpa > pedeAparelho, '/sair só pode limpar o cookie DEPOIS de exigir o aparelho');
});
