import { mensagensParaDisparar, montarPayloadCupom } from './grupoVip.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

// Instante BR: 5511... use o offset -180. Ter 28/07/2026 18:05 BR = 21:05 UTC.
const BR = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - -180 * 60000;
const terca1805 = BR(2026, 7, 28, 18, 5); // 28/07/2026 é uma terça
const msg = (over) => ({ id: 1, ativa: true, diasSemana: [2], horario: '18:00', ...over });

console.log('\n== mensagensParaDisparar ==');
t('terça 18:00 dispara às 18:05', mensagensParaDisparar(terca1805, [msg()], new Set()).map((m) => m.id), [1]);
t('antes do horário não dispara', mensagensParaDisparar(BR(2026, 7, 28, 17, 59), [msg()], new Set()).map((m) => m.id), []);
t('dia errado (quarta) não dispara', mensagensParaDisparar(BR(2026, 7, 29, 18, 5), [msg()], new Set()).map((m) => m.id), []);
t('já disparada hoje não repete', mensagensParaDisparar(terca1805, [msg()], new Set([1])).map((m) => m.id), []);
t('inativa não dispara', mensagensParaDisparar(terca1805, [msg({ ativa: false })], new Set()).map((m) => m.id), []);
t('múltiplos dias: seg e ter', mensagensParaDisparar(terca1805, [msg({ diasSemana: [1, 2] })], new Set()).map((m) => m.id), [1]);
t('horário inválido é ignorado', mensagensParaDisparar(terca1805, [msg({ horario: 'xx' })], new Set()).map((m) => m.id), []);
t('lista vazia', mensagensParaDisparar(terca1805, [], new Set()), []);

console.log('\n== montarPayloadCupom ==');
const base = { rotulo: 'Terça em dobro', cupomTipo: 'PERCENT_DISCOUNT', cupomValor: 20, cupomValidadeHoras: 6 };
const p = montarPayloadCupom(base, terca1805, 'VIPABC12');
t('percent: type/value/code', [p.type, p.value, p.code], ['percent_discount', 20, 'VIPABC12']);
t('percent: available_from = agora ISO', p.available_from, new Date(terca1805).toISOString());
t('percent: expires_at = agora + 6h', p.expires_at, new Date(terca1805 + 6 * 3600 * 1000).toISOString());
t('free_shipping não manda value', (() => { const x = montarPayloadCupom({ ...base, cupomTipo: 'FREE_SHIPPING' }, terca1805, 'X'); return 'value' in x; })(), false);
t('tipo inválido = null', montarPayloadCupom({ cupomTipo: 'ZZZ' }, terca1805, 'X'), null);
t('limite/pedido mínimo/novos', (() => { const x = montarPayloadCupom({ ...base, cupomLimiteUso: 100, cupomPedidoMinimo: 30, cupomSoNovosClientes: true }, terca1805, 'X'); return [x.use_limit, x.minimum_order_value, x.new_customers_only]; })(), [100, 30, true]);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
