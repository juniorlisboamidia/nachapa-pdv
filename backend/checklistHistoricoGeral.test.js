import { STATUS, classificarOcorrencia, agregar } from './checklistHistoricoGeral.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };
const eq = (n, real, esp) => { if (Object.is(real, esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${real} != ${esp}`); } };

console.log('\n== STATUS ==');
t('STATUS lista os 5 status', STATUS, ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO', 'NAO_REALIZADO']);

console.log('\n== classificarOcorrencia ==');
t('execução CONCLUIDA → CONCLUIDO', classificarOcorrencia({ execucao: { status: 'CONCLUIDA' } }), 'CONCLUIDO');
t('execução EM_ANDAMENTO → EM_ANDAMENTO', classificarOcorrencia({ execucao: { status: 'EM_ANDAMENTO' } }), 'EM_ANDAMENTO');
t('sem execução + ehPassado (mesmo com deadline no passado) → NAO_REALIZADO',
  classificarOcorrencia({ execucao: null, ehPassado: true, agoraMs: 2000, deadlineMs: 1000 }), 'NAO_REALIZADO');
t('sem execução + hoje + agoraMs > deadlineMs → ATRASADO',
  classificarOcorrencia({ execucao: null, ehPassado: false, agoraMs: 2000, deadlineMs: 1000 }), 'ATRASADO');
t('sem execução + hoje + agoraMs === deadlineMs (limite) → ATRASADO',
  classificarOcorrencia({ execucao: null, ehPassado: false, agoraMs: 1000, deadlineMs: 1000 }), 'ATRASADO');
t('sem execução + hoje + agoraMs < deadlineMs → PENDENTE',
  classificarOcorrencia({ execucao: null, ehPassado: false, agoraMs: 500, deadlineMs: 1000 }), 'PENDENTE');
t('sem execução + hoje + deadlineMs:null (sem horário) → PENDENTE',
  classificarOcorrencia({ execucao: null, ehPassado: false, agoraMs: 500, deadlineMs: null }), 'PENDENTE');

console.log('\n== agregar ==');
const linhasBase = [
  { status: 'CONCLUIDO', esperada: true },
  { status: 'PENDENTE', esperada: true },
  { status: 'ATRASADO', esperada: true },
  { status: 'NAO_REALIZADO', esperada: true },
];
const r1 = agregar(linhasBase, { ativos: 10 });
t('contagens bate com as linhas', r1.contagens, { PENDENTE: 1, EM_ANDAMENTO: 0, CONCLUIDO: 1, ATRASADO: 1, NAO_REALIZADO: 1 });
t('kpis.concluidos = nº CONCLUIDO', r1.kpis.concluidos, 1);
t('kpis.atrasados = ATRASADO + NAO_REALIZADO', r1.kpis.atrasados, 2);
t('taxaConclusaoPct = round(1/4*100) = 25', r1.kpis.taxaConclusaoPct, 25);
t('ativos propaga', r1.kpis.ativos, 10);

const linhasComAvulso = [...linhasBase, { status: 'CONCLUIDO', esperada: false }];
const r2 = agregar(linhasComAvulso, { ativos: 10 });
t('avulso concluído (esperada:false) NÃO entra no denominador → taxa continua 25', r2.kpis.taxaConclusaoPct, 25);
t('mas contagens.CONCLUIDO conta o avulso (=2)', r2.contagens.CONCLUIDO, 2);
t('kpis.concluidos também reflete o avulso (=2)', r2.kpis.concluidos, 2);
t('kpis.atrasados não muda com o avulso', r2.kpis.atrasados, 2);

const r3 = agregar([{ status: 'CONCLUIDO', esperada: false }], { ativos: 0 });
eq('esperadas:0 → taxaConclusaoPct estritamente null (nunca NaN)', r3.kpis.taxaConclusaoPct, null);

const r4 = agregar([], {});
eq('sem linhas e sem ativos → taxaConclusaoPct null', r4.kpis.taxaConclusaoPct, null);
t('sem linhas e sem ativos → ativos default 0', r4.kpis.ativos, 0);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
