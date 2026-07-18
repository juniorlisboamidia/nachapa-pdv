import { TEMPLATE_PADRAO, montarMensagemLembrete, atrasado } from './checklistLembrete.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };
const has = (n, txt, sub) => { if (String(txt).includes(sub)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: falta "${sub}" em: ${txt}`); } };
const not = (n, txt, sub) => { if (!String(txt).includes(sub)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: não devia ter "${sub}" em: ${txt}`); } };

console.log('\n== montarMensagemLembrete ==');
const msg = montarMensagemLembrete(null, { checklist: 'Abertura Cozinha', horario: '08:00', responsavel: 'Rafaely' });
has('tem o nome do checklist', msg, 'Abertura Cozinha');
has('tem o horário', msg, '08:00');
has('tem o responsável', msg, 'Rafaely');
not('não sobra token [nome do checklist]', msg, '[nome do checklist]');
not('não sobra token [horário do checklist]', msg, '[horário do checklist]');
not('não sobra token [nome do responsável]', msg, '[nome do responsável]');

const msgVazio = montarMensagemLembrete('', { checklist: 'X', horario: '10:00', responsavel: 'Y' });
has('template vazio usa o padrão', msgVazio, 'Aviso:');

const msgSemResponsavel = montarMensagemLembrete(null, { checklist: 'Fechamento', horario: '22:00' });
not('responsável ausente não deixa o token', msgSemResponsavel, '[nome do responsável]');

console.log('\n== atrasado (horário + tolerância) ==');
const horario = 1_000_000_000;
t('antes do horário (tol 0) → false', atrasado(horario - 1 * 60000, horario, 0), false);
t('exatamente no horário (tol 0) → true', atrasado(horario, horario, 0), true);
t('horário+15min, tol 15 → true (limite)', atrasado(horario + 15 * 60000, horario, 15), true);
t('horário+14min, tol 15 → false', atrasado(horario + 14 * 60000, horario, 15), false);
t('depois do horário+tol → true', atrasado(horario + 30 * 60000, horario, 15), true);
t('tolerância negativa tratada como 0 → true no horário', atrasado(horario, horario, -5), true);
t('tolerância ausente = 0 → true no horário', atrasado(horario, horario), true);
t('horário não-finito → false', atrasado(horario, NaN, 15), false);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
