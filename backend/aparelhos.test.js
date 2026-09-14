// Testes puros do módulo de aparelhos (pareamento por código + credencial do cookie
// + heartbeat). node:test, sem Prisma, sem rede: `node backend/aparelhos.test.js`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_APARELHO, PAREAMENTO_VALIDADE_MS, PAREAMENTO_MAX_TENTATIVAS, HEARTBEAT_ONLINE_MS,
  COOKIE_NOME, COOKIE_PATH,
  gerarCodigoPareamento, gerarCredencial, hashCredencial, estaOnline,
  cookieAparelho, cookieAparelhoLimpar, cookieDeveSerSecure, lerCookieAparelho, avaliarTentativa,
  aparelhoPublico, aparelhoAdmin, filtroAparelhoDoCookie, escopoEmpresa, whereDoAparelho, LimitadorIp,
} from './aparelhos.js';

test('constantes do contrato (§3.1/§3.2)', () => {
  assert.deepEqual(TIPOS_APARELHO, ['TOTEM', 'TV_INDOOR']);
  assert.equal(PAREAMENTO_VALIDADE_MS, 10 * 60_000);
  assert.equal(PAREAMENTO_MAX_TENTATIVAS, 5);
  assert.equal(HEARTBEAT_ONLINE_MS, 150_000);
  assert.equal(COOKIE_NOME, 'pdv_aparelho');
  assert.equal(COOKIE_PATH, '/api/public/aparelho');
});

test('gerarCodigoPareamento: 6 dígitos com zeros à esquerda', () => {
  const chamadas = [];
  const rand = (a, b) => { chamadas.push([a, b]); return 7; };
  assert.equal(gerarCodigoPareamento(rand), '000007');
  assert.deepEqual(chamadas, [[0, 1_000_000]]);
  assert.equal(gerarCodigoPareamento(() => 0), '000000');
  assert.equal(gerarCodigoPareamento(() => 999_999), '999999');
  assert.equal(gerarCodigoPareamento(() => 42_195), '042195');
  // Sem injeção usa o crypto real: sempre 6 dígitos.
  for (let i = 0; i < 200; i++) assert.match(gerarCodigoPareamento(), /^\d{6}$/);
});

test('gerarCredencial: 32 bytes base64url + hash sha256 de 64 hex', () => {
  const { credencial, hash } = gerarCredencial();
  assert.match(credencial, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(credencial, 'base64url').length, 32);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashCredencial(credencial));
  const outra = gerarCredencial();
  assert.notEqual(outra.credencial, credencial);
  assert.notEqual(outra.hash, hash);
});

test('hashCredencial é determinístico e sensível', () => {
  assert.equal(hashCredencial('abc'), hashCredencial('abc'));
  assert.notEqual(hashCredencial('abc'), hashCredencial('abd'));
  assert.match(hashCredencial(''), /^[0-9a-f]{64}$/);
});

test('estaOnline: 149 s online, 150/151 s offline, nulo offline', () => {
  const agora = new Date('2026-09-10T12:00:00.000Z');
  const ha = (s) => new Date(agora.getTime() - s * 1000);
  assert.equal(estaOnline(ha(149), agora), true);
  assert.equal(estaOnline(ha(0), agora), true);
  assert.equal(estaOnline(ha(150), agora), false);
  assert.equal(estaOnline(ha(151), agora), false);
  assert.equal(estaOnline(null, agora), false);
  assert.equal(estaOnline(undefined, agora), false);
});

test('cookieAparelho: atributos da spec §3.2 e Secure opcional', () => {
  const c = cookieAparelho('CRED');
  assert.equal(c, 'pdv_aparelho=CRED; HttpOnly; Secure; SameSite=Strict; Path=/api/public/aparelho; Max-Age=31536000');
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/public/aparelho', 'Max-Age=31536000']) {
    assert.ok(c.includes(attr), attr);
  }
  const dev = cookieAparelho('CRED', { secure: false });
  assert.ok(!dev.includes('Secure'));
  assert.ok(dev.includes('HttpOnly') && dev.includes('SameSite=Strict') && dev.includes('Path=/api/public/aparelho'));
  const limpa = cookieAparelhoLimpar();
  assert.ok(limpa.startsWith('pdv_aparelho='));
  assert.ok(limpa.includes('Path=/api/public/aparelho'));
  assert.ok(limpa.includes('Max-Age=0'));
});

test('cookieDeveSerSecure: Secure é o padrão, localhost em http é a única exceção', () => {
  // Conexão https: sempre Secure, qualquer host.
  assert.equal(cookieDeveSerSecure({ secure: true, hostname: 'pdv.nachapahub.com.br' }), true);
  assert.equal(cookieDeveSerSecure({ secure: true, hostname: 'localhost' }), true);
  // Conexão http num host de verdade: Secure MESMO ASSIM (era o bug: cookie sem Secure
  // em produção, porque não há NODE_ENV nem X-Forwarded-Proto).
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: 'pdv.nachapahub.com.br' }), true);
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: '10.0.0.5' }), true);
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: 'localhost.evil.com' }), true);
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: '' }), true);
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: undefined }), true);
  assert.equal(cookieDeveSerSecure({}), true);
  assert.equal(cookieDeveSerSecure(), true);
  // Única exceção: dev em http://localhost (ou 127.0.0.1), onde Secure mataria o cookie.
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: 'localhost' }), false);
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: 'LOCALHOST' }), false);
  assert.equal(cookieDeveSerSecure({ secure: false, hostname: '127.0.0.1' }), false);
  // E o cookie montado com a decisão bate com ela.
  assert.ok(cookieAparelho('C', { secure: cookieDeveSerSecure({ secure: false, hostname: 'pdv.nachapahub.com.br' }) }).includes('Secure'));
  assert.ok(!cookieAparelho('C', { secure: cookieDeveSerSecure({ secure: false, hostname: 'localhost' }) }).includes('Secure'));
});

test('lerCookieAparelho: acha o cookie entre outros', () => {
  assert.equal(lerCookieAparelho('th_sso=xyz; pdv_aparelho=abc123; outro=1'), 'abc123');
  assert.equal(lerCookieAparelho('pdv_aparelho=abc123'), 'abc123');
  assert.equal(lerCookieAparelho('pdv_aparelho=a%2Fb'), 'a/b');
  assert.equal(lerCookieAparelho('outro_pdv_aparelho=nao'), null);
  assert.equal(lerCookieAparelho('pdv_aparelho='), null);
  assert.equal(lerCookieAparelho(''), null);
  assert.equal(lerCookieAparelho(undefined), null);
});

const agora = new Date('2026-09-10T12:00:00.000Z');
const disp = (extra = {}) => ({
  id: 7, empresaId: 3, nome: 'Totem da frente', tipo: 'TOTEM', ativo: true,
  pareamentoCodigo: '000123', pareamentoExpiraEm: new Date(agora.getTime() + 60_000),
  pareamentoTentativas: 0, credencialHash: null, pareadoEm: null,
  ultimoHeartbeatEm: null, heartbeatJson: null, token: 'tok-legado',
  criadoEm: new Date('2026-09-01T00:00:00.000Z'), ...extra,
});

test('avaliarTentativa: código certo e vivo passa', () => {
  assert.deepEqual(avaliarTentativa(disp(), '000123', agora), { ok: true });
});

test('avaliarTentativa: código errado falha sem invalidar', () => {
  assert.deepEqual(avaliarTentativa(disp(), '999999', agora), { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: false });
});

test('avaliarTentativa: aparelho inexistente falha sem invalidar', () => {
  assert.deepEqual(avaliarTentativa(null, '000123', agora), { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: false });
  assert.deepEqual(avaliarTentativa(disp({ pareamentoCodigo: null }), '000123', agora), { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: false });
});

test('avaliarTentativa: expirado falha e invalida', () => {
  const expirado = disp({ pareamentoExpiraEm: new Date(agora.getTime() - 1) });
  assert.deepEqual(avaliarTentativa(expirado, '000123', agora), { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: true });
  assert.deepEqual(avaliarTentativa(disp({ pareamentoExpiraEm: null }), '000123', agora), { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: true });
});

test('avaliarTentativa: a 5ª falha invalida o código', () => {
  for (const n of [0, 1, 2, 3]) {
    assert.equal(avaliarTentativa(disp({ pareamentoTentativas: n }), '111111', agora).invalidar, false, `tentativas=${n}`);
  }
  assert.equal(avaliarTentativa(disp({ pareamentoTentativas: 4 }), '111111', agora).invalidar, true); // 5ª falha
  assert.equal(avaliarTentativa(disp({ pareamentoTentativas: 9 }), '111111', agora).invalidar, true);
});

test('avaliarTentativa: aparelho inativo nunca pareia', () => {
  const r = avaliarTentativa(disp({ ativo: false }), '000123', agora);
  assert.deepEqual(r, { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: false });
});

test('aparelhoPublico não expõe segredo nenhum', () => {
  const p = aparelhoPublico(disp({ credencialHash: 'hash', pareamentoCodigo: '000123' }));
  assert.deepEqual(Object.keys(p).sort(), ['id', 'nome', 'tipo']);
  assert.deepEqual(p, { id: 7, nome: 'Totem da frente', tipo: 'TOTEM' });
});

test('aparelhoAdmin: campos da tela, sem token/credencialHash/pareamentoCodigo', () => {
  const d = disp({
    credencialHash: 'h'.repeat(64), pareadoEm: new Date('2026-09-09T10:00:00.000Z'),
    ultimoHeartbeatEm: new Date(agora.getTime() - 10_000), heartbeatJson: { versao: '1.2.3', tela: { w: 1080, h: 1920 } },
  });
  const a = aparelhoAdmin(d, agora);
  assert.deepEqual(Object.keys(a).sort(), [
    'ativo', 'criadoEm', 'id', 'nome', 'online', 'pareadoEm', 'pareado',
    'pareamentoAtivo', 'pareamentoExpiraEm', 'tipo', 'ultimoSinalEm', 'versao',
    // Da TV Indoor, e aditivos: a resolução que o aparelho reportou e a programação
    // associada. Nenhum dos dois é segredo, e num TOTEM o segundo é sempre null.
    'tela', 'tvPlaylistId',
  ].sort());
  for (const proibido of ['token', 'credencialHash', 'pareamentoCodigo', 'credencial']) {
    assert.ok(!(proibido in a), proibido);
  }
  assert.equal(JSON.stringify(a).includes('h'.repeat(64)), false);
  assert.equal(JSON.stringify(a).includes('tok-legado'), false);
  assert.equal(JSON.stringify(a).includes('000123'), false);
  assert.equal(a.pareado, true);
  assert.equal(a.online, true);
  assert.equal(a.versao, '1.2.3');
  assert.equal(a.pareamentoAtivo, true);
  assert.deepEqual(a.tela, { w: 1080, h: 1920 }, 'a resolução sai do heartbeat');
  assert.equal(a.tvPlaylistId, null, 'um totem nunca tem programação de TV');
  assert.equal(a.ultimoSinalEm, d.ultimoHeartbeatEm);
});

test('aparelhoAdmin: não pareado, offline, sem código vivo', () => {
  const a = aparelhoAdmin(disp({ pareamentoCodigo: null, pareamentoExpiraEm: null }), agora);
  assert.equal(a.pareado, false);
  assert.equal(a.online, false);
  assert.equal(a.versao, null);
  assert.equal(a.pareamentoAtivo, false);
  assert.equal(a.pareamentoExpiraEm, null);
  const expirado = aparelhoAdmin(disp({ pareamentoExpiraEm: new Date(agora.getTime() - 1) }), agora);
  assert.equal(expirado.pareamentoAtivo, false);
});

test('filtroAparelhoDoCookie: só hash + ativo + tipos do totem', () => {
  assert.deepEqual(filtroAparelhoDoCookie('abc'), { credencialHash: 'abc', ativo: true, tipo: { in: ['TOTEM', 'TV_INDOOR'] } });
});

test('escopoEmpresa: empresaId vem do aparelho resolvido', () => {
  assert.deepEqual(escopoEmpresa(disp()), { empresaId: 3 });
});

test('LimitadorIp: bloqueia a 11ª tentativa em 10 min e libera depois da janela', () => {
  const lim = new LimitadorIp();
  const t0 = 1_000_000;
  for (let i = 1; i <= 10; i++) assert.equal(lim.registrar('1.2.3.4', t0 + i).bloqueado, false, `tentativa ${i}`);
  assert.equal(lim.registrar('1.2.3.4', t0 + 11).bloqueado, true);
  assert.equal(lim.registrar('1.2.3.4', t0 + 12).bloqueado, true);
  // Outro IP não é afetado.
  assert.equal(lim.registrar('9.9.9.9', t0 + 13).bloqueado, false);
  // Passada a janela de 10 min, libera.
  assert.equal(lim.registrar('1.2.3.4', t0 + 10 * 60_000 + 100).bloqueado, false);
});
