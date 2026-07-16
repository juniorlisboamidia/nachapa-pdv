import { itensCriticosNaoConformes, montarMensagemAlerta } from './checklistAlerta.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };
const has = (n, txt, sub) => { if (String(txt).includes(sub)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: falta "${sub}" em: ${txt}`); } };

const snap = [
  { chave: '1', tipo: 'CHECK',   critico: true,  titulo: 'Desligar fogões' },
  { chave: '2', tipo: 'NUMERICO', critico: true,  titulo: 'Temperatura do freezer' },
  { chave: '3', tipo: 'CHECK',   critico: false, titulo: 'Retirar lixo' },
  { chave: '4', tipo: 'CHECK',   critico: true,  titulo: 'EPIs' },
];
console.log('\n== itensCriticosNaoConformes ==');
t('só críticos conforme=false', itensCriticosNaoConformes(snap, { '1': { conforme: false }, '2': { conforme: false }, '3': { conforme: false }, '4': { conforme: true } }), ['Desligar fogões', 'Temperatura do freezer']);
t('nenhum não-conforme = vazio', itensCriticosNaoConformes(snap, { '1': { conforme: true }, '4': { conforme: true } }), []);
t('conforme null não entra', itensCriticosNaoConformes(snap, { '1': { conforme: null }, '2': { conforme: false } }), ['Temperatura do freezer']);
t('não-crítico não entra mesmo false', itensCriticosNaoConformes(snap, { '3': { conforme: false } }), []);
t('respostas ausente = vazio', itensCriticosNaoConformes(snap, {}), []);

console.log('\n== montarMensagemAlerta ==');
const msg = montarMensagemAlerta({ lojaNome: 'Hamburgão', checklistNome: 'Fechamento Cozinha', funcionarioNome: 'Rafaely', quando: '15/07 22:10', itensForaDoPadrao: ['Temperatura do freezer', 'EPIs'] });
has('tem a loja', msg, 'Hamburgão');
has('tem o checklist', msg, 'Fechamento Cozinha');
has('tem quem fez', msg, 'Rafaely');
has('tem o horário', msg, '15/07 22:10');
has('tem o item 1', msg, 'Temperatura do freezer');
has('tem o item 2', msg, 'EPIs');
const msg0 = montarMensagemAlerta({ lojaNome: 'L', checklistNome: 'C', funcionarioNome: 'F', quando: 'agora', itensForaDoPadrao: [] });
t('sem itens não quebra (string)', typeof msg0, 'string');

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
