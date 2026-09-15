// HTTP Range — testes puros (node --test, ESM).
// Rodar: node --test backend/rangeHttp.test.js
//
// As bordas de um Range são exatamente o tipo de conta que se erra por UM byte, e o erro não
// aparece num teste manual: o `<video>` simplesmente engasga de vez em quando. Daí a
// quantidade de casos aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarRange, cabecalhosDeMidia } from './rangeHttp.js';

const TOTAL = 1000; // bytes 0..999

// ── Ausente ──────────────────────────────────────────────────────────────────
test('sem Range: responde o arquivo inteiro', () => {
  for (const vazio of [undefined, null, '', '   ', 42, {}]) {
    assert.deepEqual(interpretarRange(vazio, TOTAL), { tipo: 'ausente' }, String(vazio));
  }
});

// ── Faixas válidas ───────────────────────────────────────────────────────────
test('bytes=0-1023 pede do começo e é grampeado no fim do arquivo', () => {
  // Pedir ALÉM do fim é legítimo: entrega-se até onde o arquivo vai, sem 416.
  assert.deepEqual(interpretarRange('bytes=0-1023', TOTAL), { tipo: 'parcial', inicio: 0, fim: 999 });
});

test('faixa intermediária sai exata', () => {
  assert.deepEqual(interpretarRange('bytes=100-199', TOTAL), { tipo: 'parcial', inicio: 100, fim: 199 });
});

test('bytes=N- vai de N até o fim', () => {
  assert.deepEqual(interpretarRange('bytes=500-', TOTAL), { tipo: 'parcial', inicio: 500, fim: 999 });
  assert.deepEqual(interpretarRange('bytes=0-', TOTAL), { tipo: 'parcial', inicio: 0, fim: 999 });
  assert.deepEqual(interpretarRange('bytes=999-', TOTAL), { tipo: 'parcial', inicio: 999, fim: 999 });
});

test('🔴 bytes=-N é SUFIXO: os últimos N bytes, não "do N em diante"', () => {
  // É a forma que mais se esquece — e trocá-la faz o navegador receber o começo do arquivo
  // quando pediu o fim, que é justamente onde fica o índice de alguns MP4.
  assert.deepEqual(interpretarRange('bytes=-100', TOTAL), { tipo: 'parcial', inicio: 900, fim: 999 });
  assert.deepEqual(interpretarRange('bytes=-1', TOTAL), { tipo: 'parcial', inicio: 999, fim: 999 });
  // Sufixo maior que o arquivo devolve o arquivo todo, e não 416.
  assert.deepEqual(interpretarRange('bytes=-5000', TOTAL), { tipo: 'parcial', inicio: 0, fim: 999 });
});

test('um byte só, no começo e no fim', () => {
  assert.deepEqual(interpretarRange('bytes=0-0', TOTAL), { tipo: 'parcial', inicio: 0, fim: 0 });
  assert.deepEqual(interpretarRange('bytes=999-999', TOTAL), { tipo: 'parcial', inicio: 999, fim: 999 });
});

test('espaço em volta e caixa alta não atrapalham', () => {
  assert.deepEqual(interpretarRange('  bytes=10-20  ', TOTAL), { tipo: 'parcial', inicio: 10, fim: 20 });
  assert.deepEqual(interpretarRange('BYTES=10-20', TOTAL), { tipo: 'parcial', inicio: 10, fim: 20 });
});

// ── Inválidas (416) ──────────────────────────────────────────────────────────
test('🔴 começar em EOF ou além é 416', () => {
  assert.deepEqual(interpretarRange(`bytes=${TOTAL}-`, TOTAL), { tipo: 'invalido' });
  assert.deepEqual(interpretarRange('bytes=5000-6000', TOTAL), { tipo: 'invalido' });
});

test('fim antes do início é 416', () => {
  assert.deepEqual(interpretarRange('bytes=500-100', TOTAL), { tipo: 'invalido' });
});

test('sufixo de zero bytes é 416', () => {
  assert.deepEqual(interpretarRange('bytes=-0', TOTAL), { tipo: 'invalido' });
});

test('arquivo vazio: qualquer faixa é 416', () => {
  assert.deepEqual(interpretarRange('bytes=0-10', 0), { tipo: 'invalido' });
  assert.deepEqual(interpretarRange('bytes=-1', 0), { tipo: 'invalido' });
});

// ── Ignoradas (200) ──────────────────────────────────────────────────────────
test('🔴 o que não sabemos atender é IGNORADO, não recusado', () => {
  // A RFC 9110 permite ignorar um Range que o servidor não atende, e ignorar é mais seguro
  // do que adivinhar: o navegador recebe o arquivo inteiro e funciona.
  for (const torto of ['bytes=0-10,20-30', 'items=0-10', 'bytes=abc', 'bytes=', 'bytes=-', 'bytes=1-2-3', 'coisa']) {
    assert.deepEqual(interpretarRange(torto, TOTAL), { tipo: 'ignorar' }, torto);
  }
});

test('tamanho torto não lança', () => {
  assert.deepEqual(interpretarRange('bytes=0-10', NaN), { tipo: 'ignorar' });
  assert.deepEqual(interpretarRange('bytes=0-10', -1), { tipo: 'ignorar' });
});

// ── Cabeçalhos ───────────────────────────────────────────────────────────────
const base = { tamanho: TOTAL, tipo: 'video/mp4', etag: 'W/"v1"' };

test('200: Content-Length completo e Accept-Ranges SEMPRE', () => {
  const r = cabecalhosDeMidia({ veredito: { tipo: 'ausente' }, ...base });
  assert.equal(r.status, 200);
  assert.equal(r.cabecalhos['Content-Length'], '1000');
  assert.equal(r.cabecalhos['Accept-Ranges'], 'bytes', 'é por ele que o navegador sabe que pode pedir trechos');
  assert.equal(r.cabecalhos['Content-Range'], undefined);
  assert.deepEqual(r.corpo, { inicio: 0, fim: 999 });
});

test('🔴 206: Content-Range e Content-Length do TRECHO', () => {
  const r = cabecalhosDeMidia({ veredito: { tipo: 'parcial', inicio: 100, fim: 199 }, ...base });
  assert.equal(r.status, 206);
  assert.equal(r.cabecalhos['Content-Range'], 'bytes 100-199/1000');
  assert.equal(r.cabecalhos['Content-Length'], '100', 'o trecho tem 100 bytes, não 1000');
  assert.deepEqual(r.corpo, { inicio: 100, fim: 199 });
});

test('416: Content-Range com o total e sem corpo', () => {
  const r = cabecalhosDeMidia({ veredito: { tipo: 'invalido' }, ...base });
  assert.equal(r.status, 416);
  assert.equal(r.cabecalhos['Content-Range'], 'bytes */1000');
  assert.equal(r.corpo, null);
});

test('o cache e o nosniff vão nas três respostas', () => {
  for (const veredito of [{ tipo: 'ausente' }, { tipo: 'parcial', inicio: 0, fim: 9 }, { tipo: 'invalido' }]) {
    const r = cabecalhosDeMidia({ veredito, ...base });
    assert.equal(r.cabecalhos['Cache-Control'], 'private, max-age=31536000, immutable');
    assert.equal(r.cabecalhos.Vary, 'Cookie');
    assert.equal(r.cabecalhos.ETag, 'W/"v1"');
    assert.equal(r.cabecalhos['X-Content-Type-Options'], 'nosniff');
    assert.equal(r.cabecalhos['Content-Type'], 'video/mp4');
    assert.equal(r.cabecalhos['Accept-Ranges'], 'bytes');
  }
});

test('arquivo de 1 byte', () => {
  assert.deepEqual(interpretarRange('bytes=0-0', 1), { tipo: 'parcial', inicio: 0, fim: 0 });
  assert.deepEqual(interpretarRange('bytes=1-', 1), { tipo: 'invalido' });
  assert.equal(cabecalhosDeMidia({ veredito: { tipo: 'ausente' }, tamanho: 1, tipo: 'video/mp4', etag: 'x' }).cabecalhos['Content-Length'], '1');
});
