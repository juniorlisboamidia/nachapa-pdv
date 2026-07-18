import { TEMPLATE_PADRAO, montarMensagemLembrete, estaNaJanelaDeLembrete } from './checklistLembrete.js';
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

console.log('\n== estaNaJanelaDeLembrete ==');
const limite = 1_000_000_000;
t('agora=limite-10min, antes=30 → true', estaNaJanelaDeLembrete(limite - 10 * 60000, limite, 30), true);
t('agora=limite+1min → false', estaNaJanelaDeLembrete(limite + 1 * 60000, limite, 30), false);
t('agora=limite-31min, antes=30 → false', estaNaJanelaDeLembrete(limite - 31 * 60000, limite, 30), false);
t('exatamente no limite → true', estaNaJanelaDeLembrete(limite, limite, 30), true);
t('exatamente no início → true', estaNaJanelaDeLembrete(limite - 30 * 60000, limite, 30), true);
t('limite não-finito → false', estaNaJanelaDeLembrete(limite, NaN, 30), false);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
