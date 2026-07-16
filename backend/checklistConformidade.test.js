import { avaliarResposta, execucaoEmAlerta } from './checklistConformidade.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { const a = JSON.stringify(real), b = JSON.stringify(esp); if (a === b) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}\n    real ${a}\n    esp  ${b}`); } };

console.log('\n== CHECK ==');
t('marcado = conforme', avaliarResposta({ tipo: 'CHECK', config: {}, valor: true }), { conforme: true, motivo: null });
t('desmarcado = nao-conforme', avaliarResposta({ tipo: 'CHECK', config: {}, valor: false }).conforme, false);

console.log('\n== NUMERICO ==');
t('sem faixa = nao avalia', avaliarResposta({ tipo: 'NUMERICO', config: { unidade: '°C' }, valor: 8 }), { conforme: null, motivo: null });
t('dentro da faixa', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: 3 }).conforme, true);
t('acima do max', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: 9 }).conforme, false);
t('abaixo do min', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: -2 }).conforme, false);
t('valor invalido = nao avalia', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: 'abc' }).conforme, null);

console.log('\n== SELECAO ==');
const opc = { opcoes: [{ rotulo: 'Estoque OK', conforme: true }, { rotulo: 'Sem estoque', conforme: false }] };
t('opcao conforme', avaliarResposta({ tipo: 'SELECAO', config: opc, valor: 'Estoque OK' }).conforme, true);
t('opcao nao-conforme', avaliarResposta({ tipo: 'SELECAO', config: opc, valor: 'Sem estoque' }).conforme, false);
t('opcao inexistente = nao avalia', avaliarResposta({ tipo: 'SELECAO', config: opc, valor: 'Xis' }).conforme, null);

console.log('\n== AVALIACAO ==');
t('sem notaMinima = nao avalia', avaliarResposta({ tipo: 'AVALIACAO', config: {}, valor: 3 }).conforme, null);
t('nota >= minima', avaliarResposta({ tipo: 'AVALIACAO', config: { notaMinima: 4 }, valor: 4 }).conforme, true);
t('nota < minima', avaliarResposta({ tipo: 'AVALIACAO', config: { notaMinima: 4 }, valor: 2 }).conforme, false);

console.log('\n== TEXTO ==');
t('texto nunca avalia', avaliarResposta({ tipo: 'TEXTO', config: {}, valor: 'qualquer' }), { conforme: null, motivo: null });

console.log('\n== execucaoEmAlerta ==');
const itens = [{ chave: '1', critico: true }, { chave: '2', critico: false }];
t('critico nao-conforme = alerta', execucaoEmAlerta(itens, { '1': { conforme: false }, '2': { conforme: true } }), true);
t('nao-critico nao-conforme = SEM alerta', execucaoEmAlerta(itens, { '1': { conforme: true }, '2': { conforme: false } }), false);
t('tudo conforme = sem alerta', execucaoEmAlerta(itens, { '1': { conforme: true }, '2': { conforme: true } }), false);
t('critico sem resposta = sem alerta', execucaoEmAlerta(itens, {}), false);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
