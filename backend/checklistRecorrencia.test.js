import { venceHoje, atrasado, offsetDiaDoHorario, CORTE_EXPEDIENTE_MIN } from './checklistRecorrencia.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };

console.log('\n== venceHoje ==');
t('DIARIA vence todo dia (qua)', venceHoje({ recorrenciaTipo: 'DIARIA', recorrenciaConfig: null }, 3), true);
t('DIARIA vence todo dia (dom)', venceHoje({ recorrenciaTipo: 'DIARIA', recorrenciaConfig: null }, 0), true);
t('DIAS_SEMANA no dia certo (seg)', venceHoje({ recorrenciaTipo: 'DIAS_SEMANA', recorrenciaConfig: { diasSemana: [1, 3, 5] } }, 1), true);
t('DIAS_SEMANA fora do dia (ter)', venceHoje({ recorrenciaTipo: 'DIAS_SEMANA', recorrenciaConfig: { diasSemana: [1, 3, 5] } }, 2), false);
t('DIAS_SEMANA sem config = nunca', venceHoje({ recorrenciaTipo: 'DIAS_SEMANA', recorrenciaConfig: {} }, 3), false);
t('AVULSO nunca vence por recorrencia', venceHoje({ recorrenciaTipo: 'AVULSO', recorrenciaConfig: null }, 3), false);

console.log('\n== atrasado ==');
t('sem horario limite = nunca atrasa', atrasado(null, 900), false);
t('antes do limite', atrasado('10:00', 9 * 60 + 30), false);   // 09:30 < 10:00
t('depois do limite', atrasado('10:00', 10 * 60 + 1), true);    // 10:01 > 10:00
t('exatamente no limite = nao atrasado', atrasado('10:00', 10 * 60), false);

console.log('\n== offsetDiaDoHorario (horário-limite na madrugada) ==');
// O expediente do dia D vai das 05:00 de D às 05:00 de D+1. Um limite "02:00" é 02:00 de D+1.
// Sem o offset o limite caía ANTES do expediente começar e tudo nascia atrasado.
t('02:00 (antes do corte) cai no dia seguinte', offsetDiaDoHorario('02:00'), 1);
t('04:59 (antes do corte) cai no dia seguinte', offsetDiaDoHorario('04:59'), 1);
t('05:00 (no corte) é do próprio dia', offsetDiaDoHorario('05:00'), 0);
t('09:00 é do próprio dia', offsetDiaDoHorario('09:00'), 0);
t('23:30 é do próprio dia', offsetDiaDoHorario('23:30'), 0);
t('00:00 (virada) cai no dia seguinte', offsetDiaDoHorario('00:00'), 1);
t('vazio/invalido = 0 (sem deslocar)', [offsetDiaDoHorario(''), offsetDiaDoHorario(null), offsetDiaDoHorario('abc')], [0, 0, 0]);
t('CORTE_EXPEDIENTE_MIN = 05:00 em minutos', CORTE_EXPEDIENTE_MIN, 300);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
