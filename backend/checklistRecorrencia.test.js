import { venceHoje, atrasado } from './checklistRecorrencia.js';
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

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
