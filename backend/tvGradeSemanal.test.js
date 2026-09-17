// TV Indoor › grade semanal — testes puros (node --test, ESM).
// Rodar: node --test backend/tvGradeSemanal.test.js
//
// O que estes testes defendem:
//   1. a grade é avaliada no relógio DA LOJA, não no do VPS nem no da TV;
//   2. a janela que cruza a meia-noite funciona com UMA regra, e o dia marcado é o de INÍCIO;
//   3. sobreposição é recurso, e a de cima vence — sempre, sem empate possível;
//   4. início inclusivo, fim exclusivo, as mesmas bordas da agenda de conteúdo;
//   5. a próxima troca é um instante REAL, atravessando horário de verão sem escorregar.
//
// ⚠️ NENHUM teste depende do TZ do processo. Todos passam o fuso explicitamente, e há um
// caso em Nova York justamente para provar que o resultado não vem do relógio de quem roda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS, FUSO_PADRAO, ORIGEM_PADRAO, ORIGEM_REGRA,
  conferirJanela, cruzaCom, cruzaMeiaNoite, fusoValido, horaDeMinutos, instanteDeLocal,
  minutosDeHora, partesLocais, proximaTroca, regraVale, resolverGrade, validarEntradaRegra,
  MOTIVO_PERIODO, conferirPeriodo, periodoVale, regraParaAdmin,
} from './tvGradeSemanal.js';

const SP = 'America/Sao_Paulo';
// Um instante escrito como hora de São Paulo, para os testes lerem como a loja lê.
const emSP = (iso) => instanteDeLocal(partesDeIso(iso), SP);
function partesDeIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  return { ano: +m[1], mes: +m[2], dia: +m[3], minutos: +m[4] * 60 + +m[5] };
}

const regra = (extra) => ({ id: 1, ativo: true, dias: [1, 2, 3, 4, 5], inicioMin: 11 * 60, fimMin: 14 * 60 + 30, playlistId: 10, ...extra });

// ── Fuso ─────────────────────────────────────────────────────────────────────
test('fuso IANA é validado contra o runtime, não contra lista nossa', () => {
  assert.equal(fusoValido('America/Sao_Paulo'), true);
  assert.equal(fusoValido('America/New_York'), true);
  assert.equal(fusoValido('UTC'), true);
  for (const ruim of ['', '  ', null, undefined, 42, 'Brasilia', 'America/Nao_Existe', '-03:00']) {
    assert.equal(fusoValido(ruim), false, `${ruim} não pode passar`);
  }
});

test('o instante UTC vira o dia e a hora DA LOJA', () => {
  // 2026-09-15T12:00Z é 09:00 em São Paulo (terça) e 08:00 em Nova York.
  const ms = Date.parse('2026-09-15T12:00:00Z');
  const sp = partesLocais(ms, SP);
  assert.equal(sp.diaSemana, 2, 'terça');
  assert.equal(sp.minutos, 9 * 60);
  const ny = partesLocais(ms, 'America/New_York');
  assert.equal(ny.minutos, 8 * 60);
  // E às 16:00Z já é quarta-feira em Tóquio (UTC+9) enquanto ainda é terça em São Paulo —
  // prova de que o dia da semana vem do fuso, não do instante.
  const noite = Date.parse('2026-09-15T16:00:00Z');
  assert.equal(partesLocais(noite, 'Asia/Tokyo').diaSemana, 3);
  assert.equal(partesLocais(noite, SP).diaSemana, 2);
});

test('🔴 a virada de dia local não usa o relógio do processo', () => {
  // 2026-09-16T02:00Z ainda é 15/09 23:00 em São Paulo: terça, não quarta.
  const ms = Date.parse('2026-09-16T02:00:00Z');
  const sp = partesLocais(ms, SP);
  assert.equal(sp.dia, 15);
  assert.equal(sp.diaSemana, 2);
  assert.equal(sp.minutos, 23 * 60);
});

test('hora local → instante UTC atravessa o horário de verão', () => {
  // Nova York entra no horário de verão em 08/03/2026 às 02:00. 01:30 é EST (-05:00) e
  // 03:30 já é EDT (-04:00) — os dois separados por UMA hora real, não duas.
  const antes = instanteDeLocal({ ano: 2026, mes: 3, dia: 8, minutos: 1 * 60 + 30 }, 'America/New_York');
  const depois = instanteDeLocal({ ano: 2026, mes: 3, dia: 8, minutos: 3 * 60 + 30 }, 'America/New_York');
  assert.equal(depois - antes, 60 * 60 * 1000, 'entre 01:30 e 03:30 existe uma hora só naquele dia');
  // E o caminho de ida e volta fecha.
  const p = partesLocais(antes, 'America/New_York');
  assert.equal(p.minutos, 90);
});

// ── Horas ────────────────────────────────────────────────────────────────────
test('hora é estrita: minuto, e só', () => {
  assert.equal(minutosDeHora('11:00'), 660);
  assert.equal(minutosDeHora('14:30'), 870);
  assert.equal(minutosDeHora('00:00'), 0);
  assert.equal(minutosDeHora('23:59'), 1439);
  for (const ruim of ['18h', '6 PM', '25:00', '18:60', '1:00', '18:0', '18:00:30', '', null, undefined, {}, '-1:00']) {
    assert.equal(minutosDeHora(ruim), null, `${JSON.stringify(ruim)} não pode passar`);
  }
});

test('minutos → hora volta com zero à esquerda', () => {
  assert.equal(horaDeMinutos(0), '00:00');
  assert.equal(horaDeMinutos(660), '11:00');
  assert.equal(horaDeMinutos(1439), '23:59');
  assert.equal(horaDeMinutos(1440), null);
  assert.equal(horaDeMinutos(-1), null);
});

// ── Elegibilidade ────────────────────────────────────────────────────────────
test('bordas: início INCLUSIVO, fim EXCLUSIVO', () => {
  const r = regra();                       // seg–sex 11:00–14:30
  const terca = { diaSemana: 2, minutos: 0 };
  assert.equal(regraVale(r, { ...terca, minutos: 659 }), false, 'antes do início');
  assert.equal(regraVale(r, { ...terca, minutos: 660 }), true, 'no minuto do início');
  assert.equal(regraVale(r, { ...terca, minutos: 800 }), true, 'no meio');
  assert.equal(regraVale(r, { ...terca, minutos: 869 }), true, 'um minuto antes do fim');
  assert.equal(regraVale(r, { ...terca, minutos: 870 }), false, 'no minuto do fim já não vale');
});

test('dia fora da seleção não vale, e regra desligada nunca vale', () => {
  const r = regra();
  assert.equal(regraVale(r, { diaSemana: 6, minutos: 700 }), false, 'sábado não está na regra');
  assert.equal(regraVale(regra({ ativo: false }), { diaSemana: 2, minutos: 700 }), false);
});

test('janela nula (início === fim) nunca vale — não é "24 horas"', () => {
  const r = regra({ inicioMin: 600, fimMin: 600 });
  for (let m = 0; m < 1440; m += 60) assert.equal(regraVale(r, { diaSemana: 2, minutos: m }), false);
});

// ── Meia-noite ───────────────────────────────────────────────────────────────
test('🔴 SEXTA 18:00 → 02:00 com UMA regra só', () => {
  // O dia marcado é o de INÍCIO. É o caso que obrigaria o gestor a criar duas regras.
  const r = regra({ dias: [5], inicioMin: 18 * 60, fimMin: 2 * 60 });
  assert.equal(cruzaMeiaNoite(r), true);
  assert.equal(regraVale(r, { diaSemana: 5, minutos: 17 * 60 + 59 }), false, 'sexta 17:59 ainda não');
  assert.equal(regraVale(r, { diaSemana: 5, minutos: 18 * 60 }), true, 'sexta 18:00 entra');
  assert.equal(regraVale(r, { diaSemana: 5, minutos: 23 * 60 + 30 }), true, 'sexta 23:30');
  assert.equal(regraVale(r, { diaSemana: 6, minutos: 1 * 60 + 59 }), true, 'sábado 01:59 ainda é a regra de sexta');
  assert.equal(regraVale(r, { diaSemana: 6, minutos: 2 * 60 }), false, 'sábado 02:00 sai');
  assert.equal(regraVale(r, { diaSemana: 6, minutos: 18 * 60 }), false, 'sábado 18:00 NÃO entra: o dia é o de início');
});

test('🔴 DOMINGO 20:00 → 02:00 atravessa a virada da semana', () => {
  const r = regra({ dias: [7], inicioMin: 20 * 60, fimMin: 2 * 60 });
  assert.equal(regraVale(r, { diaSemana: 7, minutos: 21 * 60 }), true, 'domingo à noite');
  assert.equal(regraVale(r, { diaSemana: 1, minutos: 1 * 60 }), true, 'segunda 01:00 — a semana virou junto');
  assert.equal(regraVale(r, { diaSemana: 1, minutos: 3 * 60 }), false);
});

// ── Prioridade ───────────────────────────────────────────────────────────────
test('🔴 na sobreposição, a regra de CIMA vence', () => {
  const especial = regra({ id: 5, dias: [2], inicioMin: 18 * 60, fimMin: 23 * 60, playlistId: 99 });
  const geral = regra({ id: 6, dias: [1, 2, 3, 4, 5], inicioMin: 18 * 60, fimMin: 23 * 60, playlistId: 10 });
  const agoraMs = emSP('2026-09-15T19:00'); // terça, 19h

  const comEspecialEmCima = resolverGrade({ agoraMs, fuso: SP, regras: [especial, geral], playlistPadraoId: 1 });
  assert.equal(comEspecialEmCima.playlistId, 99);
  assert.equal(comEspecialEmCima.regraId, 5);

  // Reordenar TROCA a vencedora — é a única alavanca de prioridade que o gestor tem.
  const invertido = resolverGrade({ agoraMs, fuso: SP, regras: [geral, especial], playlistPadraoId: 1 });
  assert.equal(invertido.playlistId, 10);
  assert.equal(invertido.regraId, 6);

  // E na quarta, quando só a geral vale, o resultado é o mesmo nas duas ordens.
  const quarta = emSP('2026-09-16T19:00');
  for (const ordem of [[especial, geral], [geral, especial]]) {
    assert.equal(resolverGrade({ agoraMs: quarta, fuso: SP, regras: ordem, playlistPadraoId: 1 }).playlistId, 10);
  }
});

test('sem regra elegível cai na PLAYLIST PADRÃO', () => {
  const r = regra({ dias: [1], inicioMin: 11 * 60, fimMin: 12 * 60 });
  const domingo = emSP('2026-09-13T11:30');
  const saida = resolverGrade({ agoraMs: domingo, fuso: SP, regras: [r], playlistPadraoId: 7 });
  assert.equal(saida.playlistId, 7);
  assert.equal(saida.origem, ORIGEM_PADRAO);
  assert.equal(saida.regraId, null);
});

test('sem regra NENHUMA o comportamento é o de hoje: padrão, e sem próxima troca', () => {
  const saida = resolverGrade({ agoraMs: Date.now(), fuso: SP, regras: [], playlistPadraoId: 3 });
  assert.equal(saida.playlistId, 3);
  assert.equal(saida.origem, ORIGEM_PADRAO);
  assert.equal(saida.proximaTrocaEm, null);
});

test('TV sem playlist padrão e sem regra devolve nada — o institucional é legítimo', () => {
  const saida = resolverGrade({ agoraMs: Date.now(), fuso: SP, regras: [], playlistPadraoId: null });
  assert.equal(saida.playlistId, null);
  assert.equal(saida.origem, ORIGEM_PADRAO);
});

test('regra ativa devolve origem REGRA e o fuso efetivo', () => {
  const r = regra({ id: 4, dias: [2], inicioMin: 11 * 60, fimMin: 14 * 60, playlistId: 12 });
  const saida = resolverGrade({ agoraMs: emSP('2026-09-15T12:00'), fuso: SP, regras: [r], playlistPadraoId: 1 });
  assert.equal(saida.origem, ORIGEM_REGRA);
  assert.equal(saida.regraId, 4);
  assert.equal(saida.playlistId, 12);
  assert.equal(saida.fuso, SP);
  // Fuso inválido não derruba a programação: cai no padrão do canal.
  assert.equal(resolverGrade({ agoraMs: Date.now(), fuso: 'Nao/Existe', regras: [] }).fuso, FUSO_PADRAO);
});

// ── Próxima troca ────────────────────────────────────────────────────────────
test('a próxima troca é a ENTRADA da regra quando ela ainda não começou', () => {
  const r = regra({ dias: [2], inicioMin: 18 * 60, fimMin: 23 * 60 });
  const agoraMs = emSP('2026-09-15T17:00');   // terça, 17h
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [r] }), emSP('2026-09-15T18:00'));
});

test('a próxima troca é a SAÍDA quando a regra já está valendo', () => {
  const r = regra({ dias: [2], inicioMin: 18 * 60, fimMin: 23 * 60 });
  const agoraMs = emSP('2026-09-15T19:00');
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [r] }), emSP('2026-09-15T23:00'));
});

test('🔴 a próxima troca de uma janela overnight cai no dia seguinte', () => {
  const r = regra({ dias: [5], inicioMin: 18 * 60, fimMin: 2 * 60 });
  // Sexta 23:00: o próximo limite é o FIM, às 02:00 de SÁBADO — não às 02:00 de sexta.
  const agoraMs = emSP('2026-09-18T23:00');   // 18/09/2026 é sexta
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [r] }), emSP('2026-09-19T02:00'));
});

test('a próxima troca de domingo→segunda não volta para trás', () => {
  const r = regra({ dias: [7], inicioMin: 20 * 60, fimMin: 2 * 60 });
  const agoraMs = emSP('2026-09-13T22:00');   // 13/09/2026 é domingo
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [r] }), emSP('2026-09-14T02:00'));
});

test('com sobreposição, a próxima troca é o limite mais PRÓXIMO de qualquer regra', () => {
  const a = regra({ id: 1, dias: [2], inicioMin: 18 * 60, fimMin: 20 * 60 });
  const b = regra({ id: 2, dias: [1, 2, 3, 4, 5], inicioMin: 18 * 60, fimMin: 23 * 60 });
  const agoraMs = emSP('2026-09-15T19:00');
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [a, b] }), emSP('2026-09-15T20:00'));
});

test('regra desligada não gera troca, e sem regra ativa não há próxima', () => {
  const r = regra({ ativo: false, dias: [2], inicioMin: 18 * 60, fimMin: 23 * 60 });
  assert.equal(proximaTroca({ agoraMs: emSP('2026-09-15T17:00'), fuso: SP, regras: [r] }), null);
});

test('a troca de semana seguinte é encontrada quando a regra é de um dia só', () => {
  const r = regra({ dias: [1], inicioMin: 9 * 60, fimMin: 10 * 60 });
  // Terça: a próxima ocorrência é a segunda seguinte, seis dias à frente.
  const agoraMs = emSP('2026-09-15T12:00');
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [r] }), emSP('2026-09-21T09:00'));
});

test('o limite devolvido é sempre estritamente FUTURO', () => {
  const r = regra({ dias: [2], inicioMin: 18 * 60, fimMin: 23 * 60 });
  // Exatamente no minuto da entrada: o próximo limite é a saída, não a própria entrada.
  const agoraMs = emSP('2026-09-15T18:00');
  assert.equal(proximaTroca({ agoraMs, fuso: SP, regras: [r] }), emSP('2026-09-15T23:00'));
});

// ── Escrita ──────────────────────────────────────────────────────────────────
test('validação exige dias, horas e playlist na criação', () => {
  const v = validarEntradaRegra({}, { exigirTudo: true });
  assert.equal(v.ok, false);
  assert.deepEqual(v.erros.map((e) => e.campo).sort(), ['dias', 'horaFim', 'horaInicio', 'playlistId']);
});

test('dias são normalizados, sem repetição e sem valor fora de 1–7', () => {
  const v = validarEntradaRegra({ dias: [5, 1, 3], horaInicio: '11:00', horaFim: '14:00', playlistId: 2 }, { exigirTudo: true });
  assert.deepEqual(v.dados.dias, [1, 3, 5]);
  for (const ruins of [[], [0], [8], [1, 1], ['segunda']]) {
    assert.equal(validarEntradaRegra({ dias: ruins }).ok, false, `${JSON.stringify(ruins)} não pode passar`);
  }
  assert.deepEqual(DIAS, [1, 2, 3, 4, 5, 6, 7]);
});

test('playlist precisa existir NESTA empresa', () => {
  const daEmpresa = new Set([2, 3]);
  assert.equal(validarEntradaRegra({ playlistId: 2 }, { playlists: daEmpresa }).ok, true);
  assert.equal(validarEntradaRegra({ playlistId: 9 }, { playlists: daEmpresa }).ok, false, 'playlist de outra loja');
  assert.equal(validarEntradaRegra({ playlistId: 0 }, { playlists: daEmpresa }).ok, false);
});

test('PUT parcial não apaga o que não mencionou', () => {
  const v = validarEntradaRegra({ ativo: false });
  assert.deepEqual(v.dados, { ativo: false });
  assert.equal('dias' in v.dados, false);
  assert.equal('inicioMin' in v.dados, false);
});

test('janela nula é recusada, inclusive num PUT que só manda metade', () => {
  assert.deepEqual(conferirJanela({ inicioMin: 600, fimMin: 600 }, null)?.motivo, 'JANELA_NULA');
  assert.equal(conferirJanela({ inicioMin: 600, fimMin: 900 }, null), null);
  // Só o fim veio, e ele colide com o início já salvo.
  assert.deepEqual(conferirJanela({ fimMin: 660 }, { inicioMin: 660, fimMin: 900 })?.motivo, 'JANELA_NULA');
  // Overnight continua válido.
  assert.equal(conferirJanela({ inicioMin: 18 * 60, fimMin: 2 * 60 }, null), null);
});

// ── Aviso de sobreposição ────────────────────────────────────────────────────
test('o cruzamento é detectado — inclusive quando uma delas vira a noite', () => {
  const jantar = regra({ dias: [1, 2, 3, 4, 5], inicioMin: 18 * 60, fimMin: 23 * 60 });
  const terca = regra({ dias: [2], inicioMin: 19 * 60, fimMin: 21 * 60 });
  const almoco = regra({ dias: [2], inicioMin: 11 * 60, fimMin: 14 * 60 });
  assert.equal(cruzaCom(jantar, terca), true);
  assert.equal(cruzaCom(jantar, almoco), false, 'faixas disjuntas no mesmo dia');

  // Sexta 18:00→02:00 cruza com uma regra de SÁBADO de madrugada.
  const sexta = regra({ dias: [5], inicioMin: 18 * 60, fimMin: 2 * 60 });
  const madrugadaSabado = regra({ dias: [6], inicioMin: 0, fimMin: 1 * 60 });
  assert.equal(cruzaCom(sexta, madrugadaSabado), true);
  // E não cruza com uma de sábado à tarde.
  assert.equal(cruzaCom(sexta, regra({ dias: [6], inicioMin: 14 * 60, fimMin: 16 * 60 })), false);
});

// ── O período: a regra que vale só entre duas datas ──────────────────────────
// "Dia dos Pais" é 16 a 17 de julho, e só. Antes isso morava na arte (começa/termina no
// conteúdo); agora é a grade — a programação — que responde QUANDO.
const DIA_DOS_PAIS = { validoDe: '2026-07-16T03:00:00.000Z', validoAte: '2026-07-18T03:00:00.000Z' }; // 16 e 17/07, hora de SP

test('🔴 fora do período a regra NÃO vale, mesmo no dia e na hora certos', () => {
  const r = regra({ dias: [1, 2, 3, 4, 5, 6, 7], inicioMin: 0, fimMin: 23 * 60 + 59, ...DIA_DOS_PAIS });
  const dentro = emSP('2026-07-17T12:00');
  const antes = emSP('2026-07-15T12:00');
  const depois = emSP('2026-07-18T12:00');
  assert.equal(regraVale(r, partesLocais(dentro, SP), dentro), true);
  assert.equal(regraVale(r, partesLocais(antes, SP), antes), false, 'um dia antes');
  assert.equal(regraVale(r, partesLocais(depois, SP), depois), false, 'um dia depois');
  // O limite de fim é EXCLUSIVO, como o de hora: no instante exato, já acabou.
  assert.equal(periodoVale(r, Date.parse(DIA_DOS_PAIS.validoAte)), false);
  assert.equal(periodoVale(r, Date.parse(DIA_DOS_PAIS.validoAte) - 1), true);
});

test('regra SEM período vale sempre — é toda regra que já existe', () => {
  const r = regra();
  const seg = emSP('2026-09-14T12:00');
  assert.equal(regraVale(r, partesLocais(seg, SP), seg), true);
  assert.equal(periodoVale({ validoDe: null, validoAte: null }, seg), true);
  assert.equal(periodoVale({}, seg), true);
  // Só um dos lados também funciona: "a partir de" e "até".
  assert.equal(periodoVale({ validoDe: DIA_DOS_PAIS.validoDe }, emSP('2026-12-25T12:00')), true);
  assert.equal(periodoVale({ validoAte: DIA_DOS_PAIS.validoAte }, emSP('2026-12-25T12:00')), false);
});

test('🔴 data inválida no banco NÃO some com a regra do ar', () => {
  // `new Date('x').getTime()` é NaN, e NaN em comparação é sempre falso: sem a proteção,
  // uma linha corrompida faria a regra deixar de valer sem erro nenhum. Inválido = sem limite.
  const seg = emSP('2026-09-14T12:00');
  assert.equal(periodoVale({ validoDe: 'ontem' }, seg), true);
  assert.equal(periodoVale({ validoAte: 'amanhã' }, seg), true);
});

test('🔴 a ENTRADA e a SAÍDA do período são trocas — mesmo numa hora que nenhuma janela marca', () => {
  /* É no instante em que "Dia dos Pais" começa a valer que a parede tem de mudar. Se a
     próxima troca só olhasse as janelas semanais, uma regra de dia inteiro que começa às
     03:00 UTC de uma quinta nunca seria "trocada": a TV só descobriria no refresh de rotina. */
  const r = regra({ dias: [1, 2, 3, 4, 5, 6, 7], inicioMin: 0, fimMin: 23 * 60 + 59, ...DIA_DOS_PAIS });
  const antes = emSP('2026-07-15T12:00');
  assert.equal(proximaTroca({ agoraMs: antes, fuso: SP, regras: [r] }), Date.parse(DIA_DOS_PAIS.validoDe));
  const dentro = emSP('2026-07-17T12:00');
  // Dentro do período, a próxima troca é o próximo limite semanal (23:59 de hoje), que
  // vem antes do fim do período.
  assert.equal(proximaTroca({ agoraMs: dentro, fuso: SP, regras: [r] }), emSP('2026-07-17T23:59'));
});

test('limites semanais FORA do período não viram troca', () => {
  // Uma regra que só vale em julho não faz a TV pedir programação nas terças de setembro.
  const r = regra({ dias: [2], inicioMin: 18 * 60, fimMin: 23 * 60, ...DIA_DOS_PAIS });
  const setembro = emSP('2026-09-15T17:00');   // terça, 17h — a janela semanal começaria às 18h
  assert.equal(proximaTroca({ agoraMs: setembro, fuso: SP, regras: [r] }), null);
});

test('a resolução escolhe pelo período: a regra de cima só ganha quando vale', () => {
  const pais = regra({ id: 1, playlistId: 50, dias: [1, 2, 3, 4, 5, 6, 7], inicioMin: 0, fimMin: 23 * 60 + 59, ...DIA_DOS_PAIS });
  const sempre = regra({ id: 2, playlistId: 10, dias: [1, 2, 3, 4, 5, 6, 7], inicioMin: 0, fimMin: 23 * 60 + 59 });
  assert.equal(resolverGrade({ agoraMs: emSP('2026-07-17T12:00'), fuso: SP, regras: [pais, sempre] }).playlistId, 50);
  assert.equal(resolverGrade({ agoraMs: emSP('2026-07-20T12:00'), fuso: SP, regras: [pais, sempre] }).playlistId, 10);
});

test('entrada: o período entra como instante, limpa com null e recusa data torta', () => {
  const ok = validarEntradaRegra({ validoDe: DIA_DOS_PAIS.validoDe, validoAte: DIA_DOS_PAIS.validoAte });
  assert.equal(ok.ok, true);
  assert.ok(ok.dados.validoDe instanceof Date);
  assert.equal(ok.dados.validoDe.toISOString(), DIA_DOS_PAIS.validoDe);

  const limpa = validarEntradaRegra({ validoDe: null, validoAte: '' });
  assert.deepEqual(limpa.dados, { validoDe: null, validoAte: null });

  const parcial = validarEntradaRegra({ ativo: true });
  assert.equal('validoDe' in parcial.dados, false, 'ausente não mexe');

  const torta = validarEntradaRegra({ validoDe: 'dia dos pais' });
  assert.equal(torta.ok, false);
  assert.deepEqual(torta.erros, [{ campo: 'validoDe', motivo: MOTIVO_PERIODO }]);
});

test('🔴 período invertido é recusado — inclusive num PUT parcial contra o que está salvo', () => {
  assert.equal(conferirPeriodo({ validoDe: new Date(DIA_DOS_PAIS.validoAte), validoAte: new Date(DIA_DOS_PAIS.validoDe) }, null)?.motivo, MOTIVO_PERIODO);
  // Só o fim chega, e ele é ANTERIOR ao início já salvo.
  assert.equal(conferirPeriodo({ validoAte: new Date('2026-07-10T00:00:00Z') }, { validoDe: new Date(DIA_DOS_PAIS.validoDe) })?.motivo, MOTIVO_PERIODO);
  assert.equal(conferirPeriodo({ validoAte: new Date(DIA_DOS_PAIS.validoAte) }, { validoDe: new Date(DIA_DOS_PAIS.validoDe) }), null);
  assert.equal(conferirPeriodo({}, { validoDe: null, validoAte: null }), null);
  // Limpar um lado nunca inverte nada.
  assert.equal(conferirPeriodo({ validoDe: null }, { validoDe: new Date(DIA_DOS_PAIS.validoDe), validoAte: new Date(DIA_DOS_PAIS.validoAte) }), null);
});

test('períodos que não se tocam não se cruzam, mesmo com a mesma janela semanal', () => {
  const pais = regra({ id: 1, ...DIA_DOS_PAIS });
  const natal = regra({ id: 2, validoDe: '2026-12-24T03:00:00.000Z', validoAte: '2026-12-26T03:00:00.000Z' });
  assert.equal(cruzaCom(pais, natal), false);
  // Mas uma regra sem período cruza com qualquer uma na mesma janela.
  assert.equal(cruzaCom(pais, regra({ id: 3 })), true);
});

test('o admin recebe o período em ISO, ou null', () => {
  const a = regraParaAdmin({ ...regra(), validoDe: new Date(DIA_DOS_PAIS.validoDe), validoAte: null, playlist: { nome: 'x' } });
  assert.equal(a.validoDe, DIA_DOS_PAIS.validoDe);
  assert.equal(a.validoAte, null);
});
