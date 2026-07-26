import { ausenciaDoDia } from './pontoAusencia.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

const BR = (y, mo, d) => Date.UTC(y, mo - 1, d, 5, 0) - -180 * 60000; // 05:00 BR do dia
const ferias = { tipo: 'FERIAS', iniMs: BR(2026, 7, 10), fimMs: BR(2026, 7, 20) };
const folga1d = { tipo: 'FOLGA_ABONADA', iniMs: BR(2026, 7, 24), fimMs: BR(2026, 7, 24) };

console.log('\n== ausenciaDoDia ==');
t('dia no meio do período', ausenciaDoDia(BR(2026, 7, 15), [ferias])?.tipo, 'FERIAS');
t('borda início (inclusive)', ausenciaDoDia(BR(2026, 7, 10), [ferias])?.tipo, 'FERIAS');
t('borda fim (inclusive)', ausenciaDoDia(BR(2026, 7, 20), [ferias])?.tipo, 'FERIAS');
t('dia antes do início = null', ausenciaDoDia(BR(2026, 7, 9), [ferias]), null);
t('dia depois do fim = null', ausenciaDoDia(BR(2026, 7, 21), [ferias]), null);
t('afastamento de 1 dia pega o próprio dia', ausenciaDoDia(BR(2026, 7, 24), [folga1d])?.tipo, 'FOLGA_ABONADA');
t('1 dia não pega o dia seguinte', ausenciaDoDia(BR(2026, 7, 25), [folga1d]), null);
t('lista vazia = null', ausenciaDoDia(BR(2026, 7, 15), []), null);
t('vários: devolve o que cobre', ausenciaDoDia(BR(2026, 7, 24), [ferias, folga1d])?.tipo, 'FOLGA_ABONADA');
t('diaMs inválido = null', ausenciaDoDia(NaN, [ferias]), null);
t('entrada malformada é ignorada', ausenciaDoDia(BR(2026, 7, 15), [{ tipo: 'X' }, ferias])?.tipo, 'FERIAS');

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
