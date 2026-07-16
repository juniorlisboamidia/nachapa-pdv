import { validadeDe, gerarLote, CONSERVACOES } from './etiquetas.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

// Regras como vêm do banco (dias por conservação)
const regras = [
  { conservacao: 'CONGELADO',     tempLabel: '<= -18 °C',          dias: 90 },
  { conservacao: 'RESFRIADO_0_4', tempLabel: '0 a 4 °C',           dias: 5  },
  { conservacao: 'RESFRIADO_4_6', tempLabel: '4 a 6 °C',           dias: 3  },
  { conservacao: 'AMBIENTE',      tempLabel: '<= 25 °C',           dias: 30 },
  { conservacao: 'DESCONGELADO',  tempLabel: '0 a 4 °C',           dias: 1  },
  { conservacao: 'ABERTO',        tempLabel: 'conforme fabricante', dias: 3  },
];

// 15/07/2026 16:20 BR  ->  19:20 UTC
const manip = Date.UTC(2026, 6, 15, 19, 20);
const iso = (d) => new Date(d).toISOString();

console.log('\n== validade pela regra ==');
const r1 = validadeDe({ manipuladoEmMs: manip, conservacao: 'RESFRIADO_0_4', regras, itemConfig: null });
t('resfriado 0-4 = +5 dias', iso(r1.validoAte), iso(Date.UTC(2026, 6, 20, 19, 20)));
t('origem = REGRA', r1.origem, 'REGRA');
t('dias = 5', r1.dias, 5);
t('tempLabel vem da regra', r1.tempLabel, '0 a 4 °C');

console.log('\n== override do item vence a regra ==');
const r2 = validadeDe({ manipuladoEmMs: manip, conservacao: 'RESFRIADO_0_4', regras, itemConfig: { validadeDias: 3 } });
t('item com 3 dias', iso(r2.validoAte), iso(Date.UTC(2026, 6, 18, 19, 20)));
t('origem = ITEM', r2.origem, 'ITEM');

console.log('\n== validadeDias null no item cai na regra ==');
const r3 = validadeDe({ manipuladoEmMs: manip, conservacao: 'CONGELADO', regras, itemConfig: { validadeDias: null } });
t('congelado = +90 dias', iso(r3.validoAte), iso(Date.UTC(2026, 9, 13, 19, 20)));
t('origem = REGRA', r3.origem, 'REGRA');

console.log('\n== virada de mes e ano ==');
const dez = Date.UTC(2026, 11, 30, 19, 20); // 30/12/2026 16:20 BR
const r4 = validadeDe({ manipuladoEmMs: dez, conservacao: 'RESFRIADO_0_4', regras, itemConfig: null });
t('30/12 +5d = 04/01/2027', iso(r4.validoAte), iso(Date.UTC(2027, 0, 4, 19, 20)));

console.log('\n== descongelado = 1 dia ==');
const r5 = validadeDe({ manipuladoEmMs: manip, conservacao: 'DESCONGELADO', regras, itemConfig: null });
t('+1 dia', iso(r5.validoAte), iso(Date.UTC(2026, 6, 16, 19, 20)));

console.log('\n== erros ==');
try { validadeDe({ manipuladoEmMs: manip, conservacao: 'INEXISTENTE', regras, itemConfig: null }); t('conservacao invalida lanca', 'nao lancou', 'lanca'); }
catch (e) { t('conservacao invalida lanca', e.http, 400); }

console.log('\n== gerarLote ==');
const lotes = new Set();
for (let i = 0; i < 5000; i++) lotes.add(gerarLote());
t('6 chars', gerarLote().length, 6);
t('sem ambiguos (I/O/0/1)', /[IO01]/.test([...lotes].join('')), false);
t('5000 lotes sem colisao relevante', lotes.size > 4900, true);
t('6 conservacoes', CONSERVACOES.length, 6);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
