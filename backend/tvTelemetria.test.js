// TV Indoor › telemetria e saúde — testes puros (node --test, ESM).
// Rodar: node --test backend/tvTelemetria.test.js
//
// O que estes testes defendem:
//   1. o que a TV manda é RECONSTRUÍDO campo a campo — nada é copiado, nada desconhecido entra;
//   2. "online" continua sendo do servidor; telemetria nunca vira autoridade;
//   3. sem playlist (configuração) NÃO é o mesmo que playlist sem conteúdo (defeito);
//   4. falha velha que já se recuperou não deixa a TV "quebrada" o dia inteiro;
//   5. problema SOBE na ordenação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODIGOS_FALHA, MS_FALHA_RECENTE, MS_SINC_ANTIGA, PESO_SAUDE, VERSAO_SNAPSHOT,
  fraseDaFalha, fraseDoMotivo, ordenar, resumo, sanitizarSnapshot, saudeDaTela, telaMonitorada,
} from './tvTelemetria.js';

const AGORA = Date.parse('2026-09-15T20:00:00Z');
const isoDe = (msAtras) => new Date(AGORA - msAtras).toISOString();

const snap = (extra) => ({
  estado: 'REPRODUZINDO',
  programacao: { playlistId: 12, origem: 'REGRA', regraId: 8, caiuNoPadrao: false, sincronizadoEm: isoDe(10_000), proximaTrocaEm: null },
  itemAtual: { tipo: 'VIDEO', id: 44, versao: 3 },
  video: { estado: 'PLAYING' },
  falhas: { totalSessao: 0, ultima: null },
  uptimeSegundos: 4821,
  ...extra,
});

// ── Sanitização ──────────────────────────────────────────────────────────────
test('o snapshot válido atravessa com os campos conhecidos', () => {
  const s = sanitizarSnapshot(snap());
  assert.equal(s.versao, VERSAO_SNAPSHOT);
  assert.equal(s.estado, 'REPRODUZINDO');
  assert.deepEqual(s.itemAtual, { tipo: 'VIDEO', id: 44, versao: 3 });
  assert.equal(s.programacao.playlistId, 12);
  assert.equal(s.video.estado, 'PLAYING');
  assert.equal(s.uptimeSegundos, 4821);
});

test('🔴 campo desconhecido NÃO entra — o snapshot é reconstruído, não copiado', () => {
  // Um `{ ...body.tv }` teria sido uma linha, e teria aceitado qualquer coisa que um
  // navegador comprometido mandasse direto para dentro de um JSON no banco.
  const s = sanitizarSnapshot({ ...snap(), segredo: 'x', html: '<script>', extra: { a: 1 } });
  assert.deepEqual(Object.keys(s).sort(), ['estado', 'falhas', 'itemAtual', 'programacao', 'uptimeSegundos', 'versao', 'video']);
  assert.equal('segredo' in s, false);
});

test('estado fora da lista invalida o snapshot inteiro', () => {
  for (const ruim of [undefined, null, '', 'TOCANDO', 'reproduzindo', 42, {}]) {
    assert.equal(sanitizarSnapshot({ ...snap(), estado: ruim }), null, `${JSON.stringify(ruim)} não pode passar`);
  }
  for (const ruim of [null, undefined, 'x', 42, []]) assert.equal(sanitizarSnapshot(ruim), null);
});

test('enums são recusados um a um, sem derrubar o resto', () => {
  const s = sanitizarSnapshot(snap({
    programacao: { ...snap().programacao, origem: 'INVENTADA' },
    itemAtual: { tipo: 'AUDIO', id: 5, versao: 1 },
    video: { estado: 'SEEKING' },
  }));
  assert.equal(s.programacao.origem, null);
  assert.equal(s.itemAtual, null, 'tipo desconhecido derruba o item, não o snapshot');
  assert.equal(s.video, null);
  assert.equal(s.estado, 'REPRODUZINDO', 'o resto continua válido');
});

test('🔴 string arbitrária e enorme não vira JSON no banco', () => {
  const gigante = 'x'.repeat(100_000);
  const s = sanitizarSnapshot(snap({
    programacao: { ...snap().programacao, sincronizadoEm: gigante },
    falhas: { totalSessao: 3, ultima: { codigo: gigante, tipo: 'VIDEO', id: 1, versao: 1, haSegundos: 5 } },
  }));
  assert.equal(s.programacao.sincronizadoEm, null);
  assert.equal(s.falhas.ultima, null, 'código desconhecido não vira falha');
  assert.ok(JSON.stringify(s).length < 600, 'o snapshot gravado é pequeno');
});

test('números fora de faixa viram null, e o contador tem teto', () => {
  const s = sanitizarSnapshot(snap({
    uptimeSegundos: -5,
    programacao: { ...snap().programacao, playlistId: 0 },
    itemAtual: { tipo: 'IMAGEM', id: -1, versao: 1 },
    falhas: { totalSessao: 9e15, ultima: null },
  }));
  assert.equal(s.uptimeSegundos, null);
  assert.equal(s.programacao.playlistId, null);
  assert.equal(s.itemAtual, null);
  assert.equal(s.falhas.totalSessao, 0, 'contador absurdo é descartado, não guardado');
});

test('a falha viaja como DURAÇÃO, nunca como instante da TV', () => {
  // Uma parede com a data errada produziria uma falha datada de 1970 — ou de 2040.
  const s = sanitizarSnapshot(snap({ falhas: { totalSessao: 2, ultima: { codigo: 'VIDEO_STALL', tipo: 'VIDEO', id: 31, versao: 2, haSegundos: 90 } } }));
  assert.equal(s.falhas.ultima.haSegundos, 90);
  assert.equal('em' in s.falhas.ultima, false, 'nenhum instante absoluto vem da TV');
  assert.deepEqual(CODIGOS_FALHA.includes(s.falhas.ultima.codigo), true);
});

test('`sincronizadoEm` só aceita ISO de verdade', () => {
  for (const ruim of ['ontem', '2026-13-45', 42, null, {}]) {
    const s = sanitizarSnapshot(snap({ programacao: { ...snap().programacao, sincronizadoEm: ruim } }));
    assert.equal(s.programacao.sincronizadoEm, null, `${JSON.stringify(ruim)} não pode virar data`);
  }
});

// ── Saúde ────────────────────────────────────────────────────────────────────
test('🔴 offline é decidido pelo SERVIDOR — telemetria não salva TV sem sinal', () => {
  // Mesmo com um snapshot perfeito: se `estaOnline()` disse não, é OFFLINE. Duas definições
  // de "online" divergiriam, e aí gestão e monitoramento discordariam da mesma TV.
  const r = saudeDaTela({ online: false, snapshot: sanitizarSnapshot(snap()), agoraMs: AGORA, sincronizadoEmMs: AGORA - 1000 });
  assert.equal(r.saude, 'OFFLINE');
  assert.equal(r.motivo, 'SEM_SINAL');
});

test('🔴 online sem snapshot é SEM_TELEMETRIA, nunca defeito', () => {
  // É a TV com frontend anterior a esta frente. Tratá-la como quebrada faria todo deploy
  // progressivo parecer incêndio.
  const r = saudeDaTela({ online: true, snapshot: null, agoraMs: AGORA });
  assert.equal(r.saude, 'SEM_TELEMETRIA');
  assert.ok(fraseDoMotivo(r.motivo).includes('ainda não informa'));
});

test('saudável é online + sincronizado + tocando', () => {
  const r = saudeDaTela({ online: true, snapshot: sanitizarSnapshot(snap()), agoraMs: AGORA, sincronizadoEmMs: AGORA - 10_000 });
  assert.equal(r.saude, 'SAUDAVEL');
  assert.equal(r.motivo, null);
});

test('🔴 heartbeat chegando mas programação parada = ATENÇÃO (não é offline)', () => {
  const s = sanitizarSnapshot(snap());
  assert.equal(saudeDaTela({ online: true, snapshot: s, agoraMs: AGORA, sincronizadoEmMs: AGORA - (MS_SINC_ANTIGA - 1000) }).saude, 'SAUDAVEL');
  const velha = saudeDaTela({ online: true, snapshot: s, agoraMs: AGORA, sincronizadoEmMs: AGORA - (MS_SINC_ANTIGA + 1000) });
  assert.equal(velha.saude, 'ATENCAO');
  assert.equal(velha.motivo, 'SINCRONIZACAO_ANTIGA');
  // Nunca ter sincronizado conta como antiga.
  assert.equal(saudeDaTela({ online: true, snapshot: s, agoraMs: AGORA, sincronizadoEmMs: null }).saude, 'ATENCAO');
});

test('🔴 sem playlist é CONFIGURAÇÃO; playlist sem conteúdo é DEFEITO', () => {
  const base = { online: true, agoraMs: AGORA, sincronizadoEmMs: AGORA - 5000 };
  const semPlaylist = sanitizarSnapshot(snap({
    estado: 'SEM_CONTEUDO', itemAtual: null,
    programacao: { ...snap().programacao, playlistId: null, origem: 'PADRAO', regraId: null },
  }));
  const r1 = saudeDaTela({ ...base, snapshot: semPlaylist, temPlaylistPadrao: false });
  assert.equal(r1.saude, 'SEM_PROGRAMACAO');

  // Mesma tela, MESMO estado — mas existe playlist. Aí é operacional.
  const r2 = saudeDaTela({ ...base, snapshot: semPlaylist, temPlaylistPadrao: true });
  assert.equal(r2.saude, 'ATENCAO');
  assert.equal(r2.motivo, 'SEM_CONTEUDO_REPRODUZIVEL');
});

test('falha total é ATENÇÃO', () => {
  const s = sanitizarSnapshot(snap({ estado: 'FALHA_TOTAL', itemAtual: null }));
  const r = saudeDaTela({ online: true, snapshot: s, agoraMs: AGORA, sincronizadoEmMs: AGORA - 5000 });
  assert.equal(r.saude, 'ATENCAO');
  assert.equal(r.motivo, 'FALHA_TOTAL');
});

test('🔴 falha ANTIGA que já se recuperou não deixa a TV quebrada o dia inteiro', () => {
  const s = sanitizarSnapshot(snap({ falhas: { totalSessao: 2, ultima: { codigo: 'VIDEO_STALL', tipo: 'VIDEO', id: 31, versao: 2, haSegundos: 60 } } }));
  const base = { online: true, snapshot: s, agoraMs: AGORA, sincronizadoEmMs: AGORA - 5000 };

  // Recente: merece olhar.
  assert.equal(saudeDaTela({ ...base, ultimaFalhaEmMs: AGORA - 60_000 }).saude, 'ATENCAO');
  // Velha: a TV está tocando. Manter o alarme treinaria o gestor a ignorá-lo.
  assert.equal(saudeDaTela({ ...base, ultimaFalhaEmMs: AGORA - (MS_FALHA_RECENTE + 60_000) }).saude, 'SAUDAVEL');
});

// ── Saída para o admin ───────────────────────────────────────────────────────
const aparelho = { id: 3, nome: 'TV Salão', online: true, ultimoSinalEm: new Date(AGORA - 18_000), tela: { w: 1920, h: 1080 }, versao: 'tv-v1', tvPlaylistId: 5 };

test('a tela monitorada resolve nomes e ancora a falha na hora do SERVIDOR', () => {
  const s = sanitizarSnapshot(snap({ falhas: { totalSessao: 2, ultima: { codigo: 'VIDEO_STALL', tipo: 'VIDEO', id: 31, versao: 2, haSegundos: 120 } } }));
  const t = telaMonitorada({
    aparelho, snapshot: s, agoraMs: AGORA, recebidoEmMs: AGORA - 18_000,
    nomeDoItem: (tipo, id) => (tipo === 'VIDEO' && id === 44 ? 'Billy Tasty Setembro' : tipo === 'VIDEO' && id === 31 ? 'Promo antiga' : null),
    nomeDaPlaylist: (id) => (id === 12 ? 'Jantar' : null),
    nomeDaRegra: (id) => (id === 8 ? 'Seg–Sex 18:00 — 23:00' : null),
  });
  assert.equal(t.itemAtual.nome, 'Billy Tasty Setembro');
  assert.equal(t.programacao.playlistNome, 'Jantar');
  assert.equal(t.programacao.regraDescricao, 'Seg–Sex 18:00 — 23:00');
  assert.equal(t.falhas.ultima.frase, 'Um vídeo parou de avançar e foi pulado.');
  assert.equal(t.falhas.ultima.nome, 'Promo antiga');
  // 18 s atrás recebemos o heartbeat, e a falha era de 120 s antes disso.
  assert.equal(Date.parse(t.falhas.ultima.em), AGORA - 18_000 - 120_000);
});

test('🔴 item apagado entre o heartbeat e a consulta NÃO quebra o diagnóstico', () => {
  const t = telaMonitorada({
    aparelho, snapshot: sanitizarSnapshot(snap()), agoraMs: AGORA, recebidoEmMs: AGORA - 5_000,
    nomeDoItem: () => null, nomeDaPlaylist: () => null, nomeDaRegra: () => null,
  });
  assert.equal(t.itemAtual.nome, null, 'a UI decide como escrever "Item removido"');
  assert.equal(t.itemAtual.id, 44, 'mas o id continua lá para o suporte');
  assert.equal(t.saude, 'SAUDAVEL');
});

test('TV sem telemetria aparece na lista, com os dados do aparelho', () => {
  const t = telaMonitorada({ aparelho, snapshot: null, agoraMs: AGORA, recebidoEmMs: AGORA - 18_000 });
  assert.equal(t.saude, 'SEM_TELEMETRIA');
  assert.equal(t.temTelemetria, false);
  assert.equal(t.programacao, null);
  assert.equal(t.itemAtual, null);
  assert.deepEqual(t.tela, { w: 1920, h: 1080 }, 'a resolução vem do heartbeat de sempre');
});

test('🔴 o resumo bate com a lista, e problema SOBE', () => {
  const telas = [
    { nome: 'D', saude: 'SAUDAVEL' }, { nome: 'B', saude: 'OFFLINE' },
    { nome: 'A', saude: 'SAUDAVEL' }, { nome: 'C', saude: 'ATENCAO' },
    { nome: 'E', saude: 'SEM_PROGRAMACAO' }, { nome: 'F', saude: 'SEM_TELEMETRIA' },
  ];
  assert.deepEqual(ordenar(telas).map((t) => t.nome), ['C', 'B', 'F', 'E', 'A', 'D']);
  const r = resumo(telas);
  assert.equal(r.total, 6);
  assert.equal(r.SAUDAVEL + r.ATENCAO + r.OFFLINE + r.SEM_TELEMETRIA + r.SEM_PROGRAMACAO, r.total, 'a soma dos cartões bate com a lista');
  // ATENÇÃO antes de OFFLINE: uma TV offline pode ser a loja fechada; uma online e com
  // defeito é uma parede acesa mostrando a coisa errada agora.
  assert.ok(PESO_SAUDE.ATENCAO < PESO_SAUDE.OFFLINE);
});

test('todo código de falha tem frase humana, e nenhuma frase é o próprio código', () => {
  for (const c of CODIGOS_FALHA) {
    const f = fraseDaFalha(c);
    assert.ok(f.length > 15, `${c} precisa de uma frase de verdade`);
    assert.equal(f.includes('_'), false, `${c} não pode aparecer cru para o gestor`);
  }
  assert.ok(fraseDaFalha('INVENTADO').length > 0, 'código desconhecido ainda produz frase');
});
