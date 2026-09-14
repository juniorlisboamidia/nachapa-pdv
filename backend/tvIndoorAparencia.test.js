// TV Indoor › Aparência — testes puros do domínio (node --test, ESM).
// Rodar: node --test backend/tvIndoorAparencia.test.js
//
// O que estes testes defendem:
//   1. empresa sem configuração desenha com os DEFAULTS do canal, nunca com nada do totem;
//   2. override ESPARSO: mexer numa cor não obriga a reenviar as seis;
//   3. `null` REMOVE o override; chave desconhecida e cor inválida são 400;
//   4. leitura tolerante: dado corrompido no banco é sanitizado e cai no padrão;
//   5. a versão da logo sobe ao trocar e ao remover — e NÃO ao mexer em cor;
//   6. o contrato público não leva byte, id interno nem metadado administrativo;
//   7. a precedência da logo é própria → empresa → inicial, e NUNCA a do totem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAVES, PADROES, PARES, MOTIVO_CHAVE, MOTIVO_COR, MOTIVO_FORMATO,
  validarTokens, sanitizar, coresEfetivas, aplicarPatch, diagnosticoDeContraste,
  origemDaLogo, proximaVersaoLogo, aparenciaParaAdmin, aparenciaPublica, ORIGENS_LOGO,
} from './tvIndoorAparencia.js';

// ── As seis chaves ───────────────────────────────────────────────────────────
test('são SEIS chaves de domínio, e nenhuma é nome de CSS', () => {
  assert.deepEqual(CHAVES, ['fundo', 'superficie', 'texto', 'textoApoio', 'destaque', 'textoDestaque']);
  for (const c of CHAVES) {
    assert.equal(c.startsWith('--'), false, `${c} não pode ser nome de custom property`);
    assert.equal(/tq|ds-|tvmb/.test(c), false, `${c} não pode carregar prefixo de folha`);
  }
});

test('os padrões são do CANAL e cobrem as seis chaves', () => {
  assert.deepEqual(Object.keys(PADROES).sort(), [...CHAVES].sort());
  for (const c of CHAVES) assert.match(PADROES[c], /^#[0-9a-f]{6}$/, c);
});

test('empresa SEM configuração desenha com os defaults', () => {
  assert.deepEqual(coresEfetivas(null), PADROES);
  assert.deepEqual(coresEfetivas(undefined), PADROES);
  assert.deepEqual(coresEfetivas({}), PADROES);
  assert.deepEqual(aparenciaParaAdmin(null).efetivas, PADROES);
  assert.deepEqual(aparenciaPublica(null).tokens, PADROES);
});

// ── Escrita ──────────────────────────────────────────────────────────────────
test('validarTokens aceita #rgb e #rrggbb, normalizando para seis dígitos minúsculos', () => {
  assert.deepEqual(validarTokens({ fundo: '#FFF' }), { ok: true, tokens: { fundo: '#ffffff' }, erros: [] });
  assert.deepEqual(validarTokens({ destaque: '  #D79E00  ' }).tokens, { destaque: '#d79e00' });
});

test('🔴 chave desconhecida é recusada — nunca vira CSS', () => {
  const v = validarTokens({ '--tvmb-fundo': '#000000' });
  assert.equal(v.ok, false);
  assert.deepEqual(v.erros, [{ chave: '--tvmb-fundo', motivo: MOTIVO_CHAVE }]);
  for (const ruim of ['background', 'cartao', 'acaoFundo', 'fonte', '__proto__']) {
    assert.equal(validarTokens({ [ruim]: '#000000' }).ok, false, ruim);
  }
});

test('cor inválida é recusada, e sem alpha', () => {
  for (const ruim of ['vermelho', 'rgb(0,0,0)', '#12', '#1234567', 'var(--x)', '#00000080', 0, null, {}, true]) {
    const v = validarTokens({ fundo: ruim });
    assert.equal(v.ok, false, String(ruim));
    assert.equal(v.erros[0].motivo, MOTIVO_COR);
  }
  assert.equal(validarTokens('x').erros[0].motivo, MOTIVO_FORMATO);
});

// ── PATCH ────────────────────────────────────────────────────────────────────
test('🔴 PUT parcial não apaga o que não mencionou', () => {
  const r = aplicarPatch({ fundo: '#111111', destaque: '#222222' }, { fundo: '#333333' });
  assert.deepEqual(r.tokens, { fundo: '#333333', destaque: '#222222' });
});

test('🔴 null REMOVE o override e volta ao padrão', () => {
  const r = aplicarPatch({ fundo: '#111111', destaque: '#222222' }, { fundo: null });
  assert.deepEqual(r.tokens, { destaque: '#222222' });
  assert.equal(coresEfetivas(r.tokens).fundo, PADROES.fundo, 'a cor volta a ser a padrão');
});

test('null continua NÃO sendo cor na validação — são camadas diferentes', () => {
  // Afrouxar a régua de cor faria um campo vazio enviado por acidente apagar a escolha da
  // loja sem que nada acusasse. `null` só é operação dentro do patch.
  assert.equal(validarTokens({ fundo: null }).ok, false);
  assert.equal(aplicarPatch({}, { fundo: null }).ok, true);
});

test('patch com chave desconhecida ou cor inválida NÃO grava nada', () => {
  const a = aplicarPatch({ fundo: '#111111' }, { fundo: '#222222', zzz: '#000000' });
  assert.equal(a.ok, false);
  assert.deepEqual(a.tokens, {}, 'nem o que era válido entra: o PUT é tudo ou nada');
  assert.equal(a.erros[0].motivo, MOTIVO_CHAVE);
  const b = aplicarPatch({}, { fundo: 'azul' });
  assert.equal(b.ok, false);
  assert.equal(b.erros[0].motivo, MOTIVO_COR);
  assert.equal(aplicarPatch({}, null).erros[0].motivo, MOTIVO_FORMATO);
});

test('patch sobre configuração corrompida parte do que é aproveitável', () => {
  const r = aplicarPatch({ fundo: '#111111', lixo: 'x', texto: 'azul' }, { destaque: '#abcdef' });
  assert.deepEqual(r.tokens, { fundo: '#111111', destaque: '#abcdef' });
});

// ── Leitura tolerante ────────────────────────────────────────────────────────
test('🔴 dado corrompido no banco é sanitizado — a TV nunca quebra por isso', () => {
  const bruto = { fundo: '#112233', '--tvmb-texto': '#fff', destaque: 'dourado', superficie: 42, texto: null };
  const { tokens, ignoradas } = sanitizar(bruto);
  assert.deepEqual(tokens, { fundo: '#112233' });
  assert.deepEqual(ignoradas.map((i) => i.chave).sort(), ['--tvmb-texto', 'destaque', 'superficie', 'texto']);
  const efetivas = coresEfetivas(bruto);
  assert.equal(efetivas.fundo, '#112233');
  assert.equal(efetivas.texto, PADROES.texto, 'o que não presta cai no padrão');
});

test('sanitizar aguenta qualquer entrada', () => {
  for (const ruim of [null, undefined, 'x', 42, [], true]) {
    assert.deepEqual(sanitizar(ruim), { tokens: {}, ignoradas: [] }, String(ruim));
  }
});

// ── Contraste ────────────────────────────────────────────────────────────────
test('o diagnóstico mede os CINCO pares sobre as cores EFETIVAS', () => {
  const d = diagnosticoDeContraste(null);
  assert.equal(d.length, 5);
  assert.deepEqual(d.map((p) => p.id), PARES.map((p) => p.id));
  // Com os padrões, branco sobre o chão escuro passa folgado.
  const textoFundo = d.find((p) => p.id === 'texto-fundo');
  assert.ok(textoFundo.ratio > 15, `esperava contraste alto no padrão, deu ${textoFundo.ratio}`);
  assert.equal(textoFundo.aaNormal, true);
});

test('🔴 contraste ruim é AVISO: o diagnóstico reprova, mas o patch salva', () => {
  const tokens = { fundo: '#777777', texto: '#808080' };
  const d = diagnosticoDeContraste(tokens);
  assert.equal(d.find((p) => p.id === 'texto-fundo').aaNormal, false);
  // E salvar continua valendo — a TV aceita a decisão do gestor.
  assert.equal(aplicarPatch({}, tokens).ok, true);
});

test('o diagnóstico mede o que a loja MUDOU contra o que ficou padrão', () => {
  // Uma loja que troca só o fundo precisa ser avisada do texto PADRÃO sobre ele.
  const d = diagnosticoDeContraste({ fundo: '#ffffff' });
  assert.equal(d.find((p) => p.id === 'texto-fundo').aaNormal, false, 'branco padrão sobre fundo branco');
});

// ── Logo ─────────────────────────────────────────────────────────────────────
test('🔴 a precedência da logo é própria → empresa → inicial', () => {
  assert.deepEqual(ORIGENS_LOGO, ['PROPRIA', 'EMPRESA', 'INICIAL']);
  assert.equal(origemDaLogo({ temPropria: true, temDaEmpresa: true }), 'PROPRIA');
  assert.equal(origemDaLogo({ temPropria: false, temDaEmpresa: true }), 'EMPRESA');
  assert.equal(origemDaLogo({ temPropria: false, temDaEmpresa: false }), 'INICIAL');
  assert.equal(origemDaLogo({}), 'INICIAL');
  assert.equal(origemDaLogo(), 'INICIAL');
});

test('🔴 a versão da logo sobe ao trocar e ao remover', () => {
  assert.equal(proximaVersaoLogo(0), 1);
  assert.equal(proximaVersaoLogo(7), 8);
  assert.equal(proximaVersaoLogo(null), 1, 'configuração nova começa do zero');
  assert.equal(proximaVersaoLogo(-3), 1);
  assert.equal(proximaVersaoLogo('5'), 1);
});

test('🔴 mexer em COR não toca na versão da logo', () => {
  // O patch de tokens não devolve versão nenhuma: não há caminho por onde uma troca de
  // paleta faça as TVs rebaixarem uma logo que não mudou.
  const r = aplicarPatch({}, { fundo: '#123456' });
  assert.equal('logoVersao' in r, false);
  assert.deepEqual(Object.keys(r).sort(), ['erros', 'ok', 'tokens']);
});

// ── Saídas ───────────────────────────────────────────────────────────────────
const CFG = { id: 3, empresaId: 9, tokens: { fundo: '#101010' }, logoVersao: 4, logoTipo: 'image/png', logoBytes: 1234, criadoEm: new Date() };

test('aparenciaParaAdmin manda os TRÊS níveis e nenhum byte', () => {
  const a = aparenciaParaAdmin(CFG, { temLogoDaEmpresa: true });
  assert.deepEqual(a.padroes, PADROES);
  assert.deepEqual(a.overrides, { fundo: '#101010' });
  assert.equal(a.efetivas.fundo, '#101010');
  assert.equal(a.efetivas.texto, PADROES.texto);
  assert.equal(a.logo.tem, true);
  assert.equal(a.logo.origem, 'PROPRIA');
  assert.equal(a.logo.url, '/api/tv-indoor/aparencia/logo?v=4');
  assert.equal(a.logo.bytes, 1234, 'o TAMANHO viaja; os bytes não');
  assert.equal(JSON.stringify(a).includes('base64'), false);
  assert.equal('dados' in a.logo, false);
});

test('aparenciaParaAdmin: sem logo própria, a origem cai para a empresa', () => {
  const semLogo = { ...CFG, logoVersao: 0, logoTipo: null };
  assert.equal(aparenciaParaAdmin(semLogo, { temLogoDaEmpresa: true }).logo.origem, 'EMPRESA');
  assert.equal(aparenciaParaAdmin(semLogo, { temLogoDaEmpresa: false }).logo.origem, 'INICIAL');
  assert.equal(aparenciaParaAdmin(semLogo).logo.url, null);
});

test('🔴 o contrato público não leva byte, id interno nem metadado administrativo', () => {
  const p = aparenciaPublica(CFG, { temLogoDaEmpresa: false });
  assert.deepEqual(Object.keys(p).sort(), ['logoUrl', 'logoVersao', 'origemLogo', 'temLogoPersonalizada', 'tokens']);
  assert.equal(p.logoUrl, '/api/public/aparelho/tv/aparencia/logo?v=4');
  assert.equal(JSON.stringify(p).includes('base64'), false);
  for (const proibido of ['id', 'empresaId', 'criadoEm', 'ignoradas', 'contraste', 'padroes', 'overrides']) {
    assert.equal(proibido in p, false, `${proibido} não é assunto da parede`);
  }
});

test('o público manda os tokens EFETIVOS, não os overrides', () => {
  // A TV precisa saber o que desenhar, não o que é padrão e o que a loja mudou.
  const p = aparenciaPublica({ tokens: { destaque: '#ff0000' } });
  assert.equal(p.tokens.destaque, '#ff0000');
  assert.equal(p.tokens.fundo, PADROES.fundo);
  assert.equal(Object.keys(p.tokens).length, 6, 'as seis, sempre');
});

// ── Independência ────────────────────────────────────────────────────────────
test('🔴 o módulo não importa NADA do totem', async () => {
  const fs = await import('node:fs');
  const fonte = fs.readFileSync(new URL('./tvIndoorAparencia.js', import.meta.url), 'utf8');
  const imports = [...fonte.matchAll(/from '[.]\/([\w.]+)[.]js'/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['cores'], 'so o helper TECNICO de cores');
  // Fora dos comentarios (onde a fronteira e EXPLICADA), nenhum identificador do totem nem
  // nome de custom property pode ser usado.
  const semBloco = fonte.split('/*').map((p, i) => (i === 0 ? p : p.split('*/').slice(1).join('*/'))).join('');
  const codigo = semBloco.split(/\r?\n/).map((l) => l.split('//')[0]).join('\n');
  for (const proibido of ['totem', 'Totem', '--tq-', '--ds-', '--tvmb-']) {
    assert.equal(codigo.includes(proibido), false, `${proibido} nao pode aparecer no codigo`);
  }
});
