// TV Indoor › Vídeo — testes puros do domínio e da validação de mídia (node --test, ESM).
// Rodar: node --test backend/tvVideo.test.js
//
// O que estes testes defendem:
//   1. o container é reconhecido pelos MAGIC BYTES, nunca pela extensão ou pelo MIME;
//   2. o `ftyp` do MP4 está no offset 4 — checar em 0 recusaria todo MP4 do mundo;
//   3. os três limites (arquivo, cota, disco) e o que acontece quando o disco é desconhecido;
//   4. duração/dimensões são INFORMATIVAS e nunca derrubam um upload;
//   5. a versão sobe só com arquivo novo;
//   6. a agenda decide se o vídeo COMEÇA; o contrato público não leva storageKey.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS, MAX_BYTES_PADRAO, MOTIVO_TIPO, MOTIVO_GRANDE, MOTIVO_VAZIO, MOTIVO_COTA, MOTIVO_DISCO,
  tipoReal, validarContainer, cabe, metadataInformativa, proximaVersaoArquivo,
} from './midiaVideo.js';
import {
  MOTIVO_NOME, MOTIVO_DATA, MOTIVO_JANELA,
  elegivel, statusDoVideo, validarEntrada, conferirJanela, videoParaAdmin, videoPublico, limitesDeVideo,
} from './tvVideo.js';

const T = (iso) => new Date(iso).getTime();
const AGORA = T('2026-09-14T12:00:00.000Z');

// Cabeçalhos reais dos dois containers.
const mp4 = (brand = 'isom') => Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(20),
]);
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);

// ── Container ────────────────────────────────────────────────────────────────
test('🔴 o MP4 é reconhecido pelo `ftyp` no OFFSET 4, não no começo', () => {
  // Os quatro primeiros bytes são o tamanho do box. Procurar "ftyp" em 0 é o erro clássico —
  // e ele recusa todo MP4 que existe.
  assert.equal(tipoReal(mp4()), 'video/mp4');
  assert.equal(tipoReal(mp4('mp42')), 'video/mp4');
  assert.equal(tipoReal(mp4('avc1')), 'video/mp4');
  assert.equal(tipoReal(Buffer.concat([Buffer.from('ftyp'), Buffer.alloc(16)])), null, 'ftyp em 0 não é MP4');
});

test('o WebM é reconhecido pelo magic do Matroska', () => {
  assert.equal(tipoReal(webm()), 'video/webm');
  assert.deepEqual(TIPOS, ['video/mp4', 'video/webm']);
});

test('🔴 extensão e MIME do navegador não valem nada — só os bytes', () => {
  // Um `.exe` renomeado chega com `video/mp4` no cabeçalho sem nenhum esforço.
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(30)]);
  assert.equal(tipoReal(exe), null);
  assert.deepEqual(validarContainer(exe), { ok: false, motivo: MOTIVO_TIPO });
  // AVI, MOV e MKV existem e ficam de fora do V1: não são os dois containers escolhidos.
  assert.equal(tipoReal(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI ')])), null);
  assert.equal(tipoReal(Buffer.alloc(4)), null, 'curto demais para decidir');
  assert.equal(tipoReal(null), null);
});

test('validarContainer devolve a extensão do container VALIDADO', () => {
  assert.deepEqual(validarContainer(mp4()), { ok: true, tipo: 'video/mp4', extensao: 'mp4' });
  assert.deepEqual(validarContainer(webm()), { ok: true, tipo: 'video/webm', extensao: 'webm' });
});

// ── Limites ──────────────────────────────────────────────────────────────────
test('teto por arquivo', () => {
  assert.equal(MAX_BYTES_PADRAO, 200 * 1024 * 1024);
  assert.deepEqual(cabe({ tamanho: 1000, maxBytes: 2000 }), { ok: true });
  assert.equal(cabe({ tamanho: 3000, maxBytes: 2000 }).motivo, MOTIVO_GRANDE);
  assert.equal(cabe({ tamanho: 2000, maxBytes: 2000 }).ok, true, 'o teto é inclusivo');
});

test('arquivo vazio ou tamanho torto é recusado', () => {
  for (const ruim of [0, -1, NaN, null, undefined, 'x', {}]) {
    assert.equal(cabe({ tamanho: ruim }).motivo, MOTIVO_VAZIO, String(ruim));
  }
});

test('🔴 cota por empresa: uma loja não lota o disco do servidor', () => {
  assert.equal(cabe({ tamanho: 500, usadoBytes: 600, cotaBytes: 1000 }).motivo, MOTIVO_COTA);
  assert.equal(cabe({ tamanho: 400, usadoBytes: 600, cotaBytes: 1000 }).ok, true);
  assert.equal(cabe({ tamanho: 500, usadoBytes: 600, cotaBytes: null }).ok, true, 'sem cota, não limita');
});

test('🔴 margem de disco: o upload que comeria a folga é recusado', () => {
  assert.equal(cabe({ tamanho: 500, livreBytes: 1000, margemBytes: 600 }).motivo, MOTIVO_DISCO);
  assert.equal(cabe({ tamanho: 300, livreBytes: 1000, margemBytes: 600 }).ok, true);
});

test('🔴 disco DESCONHECIDO não derruba o upload', () => {
  // Num sistema sem `statfs`, recusar tudo trocaria um risco por uma certeza.
  assert.equal(cabe({ tamanho: 500, livreBytes: null, margemBytes: 10_000 }).ok, true);
});

// ── Metadata informativa ─────────────────────────────────────────────────────
test('🔴 metadata do navegador é INFORMATIVA e nunca derruba o upload', () => {
  assert.deepEqual(metadataInformativa({ duracaoMs: 32_000, largura: 1920, altura: 1080 }),
    { duracaoMs: 32_000, largura: 1920, altura: 1080 });
  // Valor torto vira null — um navegador que não leu a duração não é motivo para recusar um
  // vídeo que toca.
  assert.deepEqual(metadataInformativa({ duracaoMs: Infinity, largura: -1, altura: 'x' }),
    { duracaoMs: null, largura: null, altura: null });
  assert.deepEqual(metadataInformativa(null), { duracaoMs: null, largura: null, altura: null });
  assert.equal(metadataInformativa({ duracaoMs: 5 * 60 * 60 * 1000 }).duracaoMs, null, 'acima de 4 h é lixo de parsing');
});

test('a versão sobe só com arquivo novo', () => {
  assert.equal(proximaVersaoArquivo(0), 1);
  assert.equal(proximaVersaoArquivo(3), 4);
  assert.equal(proximaVersaoArquivo(null), 1);
  assert.equal(proximaVersaoArquivo('2'), 1);
});

// ── Domínio ──────────────────────────────────────────────────────────────────
const video = (extra) => ({
  id: 5, nome: 'Lançamento', ativo: true, inicioEm: null, fimEm: null,
  arquivoVersao: 2, arquivoTipo: 'video/mp4', arquivoBytes: 12_345_678,
  storageKey: '9/abc.mp4', duracaoMs: 32_000, largura: 1920, altura: 1080, ...extra,
});

test('elegivel: ativo, com arquivo e dentro da janela', () => {
  assert.equal(elegivel(video(), AGORA), true);
  assert.equal(elegivel(video({ ativo: false }), AGORA), false);
  assert.equal(elegivel(video({ arquivoVersao: 0, storageKey: null }), AGORA), false, 'sem arquivo não toca');
  assert.equal(elegivel(video({ storageKey: null }), AGORA), false);
  assert.equal(elegivel(null, AGORA), false);
});

test('elegivel: início INCLUSIVO, fim EXCLUSIVO — as mesmas bordas do resto do canal', () => {
  const v = video({ inicioEm: '2026-09-14T12:00:00.000Z', fimEm: '2026-09-14T18:00:00.000Z' });
  assert.equal(elegivel(v, AGORA), true);
  assert.equal(elegivel(v, AGORA - 1), false);
  assert.equal(elegivel(v, T('2026-09-14T18:00:00.000Z')), false);
});

test('🔴 a agenda decide se o vídeo COMEÇA — terminar é decisão do player', () => {
  // Um vídeo que já está tocando quando o `fimEm` passa TERMINA. Cortar no meio é pior do
  // que exibir vinte segundos além da janela. Aqui só se responde "pode começar?".
  const v = video({ fimEm: '2026-09-14T12:00:10.000Z' });
  assert.equal(elegivel(v, T('2026-09-14T12:00:09.000Z')), true, 'começa');
  assert.equal(elegivel(v, T('2026-09-14T12:00:11.000Z')), false, 'não começa de novo');
});

test('statusDoVideo: SEM_ARQUIVO vem antes da agenda', () => {
  assert.equal(statusDoVideo(video(), AGORA), 'ATIVO');
  assert.equal(statusDoVideo(video({ ativo: false }), AGORA), 'INATIVO');
  assert.equal(statusDoVideo(video({ inicioEm: '2026-12-01T00:00:00Z' }), AGORA), 'AGENDADO');
  assert.equal(statusDoVideo(video({ fimEm: '2026-09-01T00:00:00Z' }), AGORA), 'ENCERRADO');
  assert.equal(statusDoVideo(video({ arquivoVersao: 0, storageKey: null, inicioEm: '2026-12-01T00:00:00Z' }), AGORA),
    'SEM_ARQUIVO', 'o rótulo diz o que FALTA, não o que a agenda diria');
  assert.equal(statusDoVideo(null, AGORA), 'INATIVO');
});

// ── Escrita ──────────────────────────────────────────────────────────────────
test('validarEntrada: parcial, com nome e agenda', () => {
  assert.deepEqual(Object.keys(validarEntrada({ nome: ' Lançamento ' }).dados), ['nome']);
  assert.equal(validarEntrada({ nome: '  ' }, { exigirNome: true }).erros[0].motivo, MOTIVO_NOME);
  assert.equal(validarEntrada({ inicioEm: 'ontem' }).erros[0].motivo, MOTIVO_DATA);
  assert.equal(validarEntrada({ fimEm: null }).dados.fimEm, null);
  assert.equal(validarEntrada({ ativo: 'sim' }).dados.ativo, false, 'só `true` liga');
});

test('🔴 o ARQUIVO não passa pela validação de campos — ele tem rota própria', () => {
  // É o que impede um PUT de nome de mexer na versão do arquivo.
  const v = validarEntrada({ nome: 'X', arquivoVersao: 99, storageKey: '../../etc/passwd' });
  assert.deepEqual(Object.keys(v.dados), ['nome']);
});

test('conferirJanela compara com o que JÁ está salvo', () => {
  assert.deepEqual(
    conferirJanela({ fimEm: new Date('2026-09-01T00:00:00Z') }, { inicioEm: new Date('2026-09-10T00:00:00Z') }),
    { campo: 'fimEm', motivo: MOTIVO_JANELA },
  );
  assert.equal(conferirJanela({}, null), null);
});

// ── Saídas ───────────────────────────────────────────────────────────────────
test('🔴 nem o admin nem a TV recebem a storageKey', () => {
  // O caminho físico não é assunto do navegador, nem para exibir.
  const a = videoParaAdmin(video(), AGORA);
  const p = videoPublico(video());
  for (const saida of [a, p]) {
    assert.equal('storageKey' in saida, false);
    assert.equal(JSON.stringify(saida).includes('abc.mp4'), false);
  }
  assert.equal(a.arquivoUrl, '/api/tv-indoor/videos/5/arquivo?v=2');
  assert.equal(p.arquivoUrl, '/api/public/aparelho/tv/video/5/arquivo?v=2');
});

test('o contrato público declara o tipo e não leva metadata de admin', () => {
  const p = videoPublico(video());
  assert.equal(p.tipo, 'video');
  assert.deepEqual(Object.keys(p).sort(), [
    'arquivoTipo', 'arquivoUrl', 'arquivoVersao', 'ativo', 'duracaoMs', 'fimEm', 'id', 'inicioEm', 'nome', 'tipo',
  ]);
  for (const proibido of ['arquivoBytes', 'largura', 'altura', 'nomeOriginal', 'status']) {
    assert.equal(proibido in p, false, `${proibido} não é assunto da parede`);
  }
  assert.equal(JSON.stringify(p).includes('base64'), false);
});

test('videoParaAdmin leva o tamanho e a metadata informativa', () => {
  const a = videoParaAdmin(video(), AGORA);
  assert.equal(a.arquivoBytes, 12_345_678);
  assert.equal(a.duracaoMs, 32_000);
  assert.equal(a.temArquivo, true);
  assert.equal(videoParaAdmin(video({ arquivoVersao: 0, storageKey: null }), AGORA).arquivoUrl, null);
});

test('os limites vêm do servidor, com a recomendação honesta sobre codec', () => {
  const l = limitesDeVideo({ maxBytes: 100 * 1024 * 1024, cotaBytes: 1024 * 1024 * 1024 });
  assert.equal(l.maxMb, 100);
  assert.equal(l.cotaMb, 1024);
  assert.deepEqual(l.tipos.map((t) => t.rotulo), ['MP4', 'WebM']);
  assert.equal(l.recomendacao.codec, 'H.264');
  assert.equal(limitesDeVideo().cotaMb, null);
});
