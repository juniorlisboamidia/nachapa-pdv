import { extrairOrigem } from './grupoVipOrigem.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

t('link com ?s= devolve o valor', extrairOrigem('Peça em https://loja.com.br/x?s=vip1 agora'), 'vip1');
t('sem link devolve null', extrairOrigem('Toda terça em dobro!'), null);
t('link sem s devolve null', extrairOrigem('https://loja.com.br/x?a=1'), null);
t('s no meio de outros params', extrairOrigem('https://loja.com.br/x?a=1&s=vip2&b=3'), 'vip2');
t('primeira url com s', extrairOrigem('veja https://site.com/y?s=abc e https://loja.com/z?s=def'), 'abc');
t('texto vazio', extrairOrigem(''), null);
t('null', extrairOrigem(null), null);
t('s vazio devolve null', extrairOrigem('https://loja.com.br/x?s='), null);
t('tira pontuação final', extrairOrigem('peça: https://loja.com.br/x?s=vip3.'), 'vip3');

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
