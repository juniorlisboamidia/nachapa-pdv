import { decidirTipoPonto, jornadaDiaPrevisto, SEQ_INTERVALO } from './pontoTipo.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

const BR_OFFSET_MIN = -180;
const brToUtcMs = (y, mo, day, h, mi) => Date.UTC(y, mo, day, h, mi) - BR_OFFSET_MIN * 60000;
const decidir = (tipos, usaIntervalo = false) => decidirTipoPonto({ tiposExistentes: tipos, usaIntervalo });
const decidirJ = (tipos, usaIntervalo, extra) => decidirTipoPonto({ tiposExistentes: tipos, usaIntervalo, ...extra });

console.log('\n== sequência base (só entrada/saída) ==');
t('1a batida do expediente = ENTRADA', decidir([]), 'ENTRADA');
t('depois de ENTRADA = SAIDA', decidir(['ENTRADA']), 'SAIDA');

console.log('\n== o bug: batida depois do fechamento NÃO reabre entrada (caso Maria 00:56) ==');
// Turno 17:00. Ela bate ENTRADA 17:00, SAIDA ~23:00, e o coletor reconhece o rosto de
// novo às 00:56. A alternância antiga devolvia ENTRADA aqui (fantasma). Agora: SAIDA.
t('ENTRADA,SAIDA + batida extra = SAIDA (não ENTRADA)', decidir(['ENTRADA', 'SAIDA']), 'SAIDA');
t('e a próxima também = SAIDA (nunca volta pra ENTRADA)', decidir(['ENTRADA', 'SAIDA', 'SAIDA']), 'SAIDA');

console.log('\n== modo com intervalo (4 batidas) segue e trava ==');
t('intervalo 1a = ENTRADA', decidir([], true), 'ENTRADA');
t('intervalo após ENTRADA = SAIDA_INTERVALO', decidir(['ENTRADA'], true), 'SAIDA_INTERVALO');
t('intervalo após SAIDA_INTERVALO = RETORNO_INTERVALO', decidir(['ENTRADA', 'SAIDA_INTERVALO'], true), 'RETORNO_INTERVALO');
t('intervalo após RETORNO = SAIDA', decidir(['ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO'], true), 'SAIDA');
t('intervalo após SAIDA trava em SAIDA (não null/ENTRADA)', decidir(['ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'SAIDA'], true), 'SAIDA');

console.log('\n== jornada (Guarda 2): depois do fim previsto do turno, batida não abre entrada ==');
t('batida solta APÓS o fim previsto, sem entrada = SAIDA', decidirJ([], false, { dataHoraMs: 2000, saidaPrevMs: 1000 }), 'SAIDA');
t('batida ANTES do fim previsto = ENTRADA (chegada normal/adiantada)', decidirJ([], false, { dataHoraMs: 500, saidaPrevMs: 1000 }), 'ENTRADA');
t('sem jornada (saidaPrev null): 1a batida = ENTRADA mesmo tarde', decidirJ([], false, { dataHoraMs: 9e9, saidaPrevMs: null }), 'ENTRADA');

console.log('\n== jornadaDiaPrevisto (fim previsto do turno) ==');
// Todos os dias com o mesmo turno 17:00→01:00, então o dow não importa no teste.
const dias17_01 = Array(7).fill({ entrada: '17:00', saida: '01:00' });
const diasFolga = Array(7).fill({ folga: true });
// Expediente que começou 20/07/2026 05:00 BR (a batida da madrugada de 21/07 cai nele).
const ini2007 = brToUtcMs(2026, 6, 20, 5, 0);
const prev = jornadaDiaPrevisto(dias17_01, [], ini2007);
t('turno 17:00–01:00 → saída no dia seguinte 01:00 BR', prev?.saidaMs, brToUtcMs(2026, 6, 21, 1, 0));
t('turno 17:00–01:00 → entrada 17:00 do dia de início', prev?.entradaMs, brToUtcMs(2026, 6, 20, 17, 0));
t('dia de folga na jornada → null', jornadaDiaPrevisto(diasFolga, [], ini2007), null);
t('folga fixa do colaborador (todos os dias) sobrepõe → null', jornadaDiaPrevisto(dias17_01, [0, 1, 2, 3, 4, 5, 6], ini2007), null);
t('diasJson inválido → null', jornadaDiaPrevisto(null, [], ini2007), null);

console.log('\n== integração: caso Maria com a jornada (00:56 dentro do turno, mas já fechado) ==');
// Turno 17:00→01:00: a batida das 00:56 (21/07) está ANTES do fim previsto (01:00),
// então a Guarda 2 não dispara — quem barra é a Guarda 1 (já tem ENTRADA no dia).
const saidaPrevMaria = jornadaDiaPrevisto(dias17_01, [], ini2007).saidaMs;
const batida0056 = brToUtcMs(2026, 6, 21, 0, 56);
t('00:56 com ENTRADA,SAIDA no dia = SAIDA (Guarda 1)', decidirJ(['ENTRADA', 'SAIDA'], false, { dataHoraMs: batida0056, saidaPrevMs: saidaPrevMaria }), 'SAIDA');
t('sanidade: 00:56 é antes do fim previsto 01:00', batida0056 < saidaPrevMaria, true);

console.log('\n== SEQ_INTERVALO exportada continua coerente ==');
t('SEQ_INTERVALO trava após SAIDA', SEQ_INTERVALO.SAIDA, null);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
