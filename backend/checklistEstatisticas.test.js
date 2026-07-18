import { FAIXAS, faixaIndex, scoreDeRespostas, calcularEstatisticas } from './checklistEstatisticas.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };

console.log('\n== FAIXAS / faixaIndex ==');
t('FAIXAS tem 8 faixas de 3h', FAIXAS.length, 8);
t('FAIXAS primeira faixa', FAIXAS[0], { ini: 0, fim: 3, label: '00–03h' });
t('FAIXAS última faixa', FAIXAS[7], { ini: 21, fim: 24, label: '21–24h' });
t('faixaIndex(8) -> 2 (06–09h)', faixaIndex(8), 2);
t('faixaIndex(0) -> 0', faixaIndex(0), 0);
t('faixaIndex(23) -> 7', faixaIndex(23), 7);
t('faixaIndex(24) -> clampa em 7', faixaIndex(24), 7);
t('faixaIndex(NaN) -> trata como 0', faixaIndex(NaN), 0);
t('faixaIndex(-5) -> clampa em 0', faixaIndex(-5), 0);

console.log('\n== scoreDeRespostas ==');
t('true+false+null -> 50 (null não conta)', scoreDeRespostas([{ conforme: true }, { conforme: false }, { conforme: null }]), 50);
t('só null -> null (nunca NaN)', scoreDeRespostas([{ conforme: null }]), null);
t('[] -> null', scoreDeRespostas([]), null);
t('undefined -> null', scoreDeRespostas(undefined), null);

console.log('\n== calcularEstatisticas: KPIs ==');
{
  const r = calcularEstatisticas({
    execucoes: [
      { id: 'e1', status: 'CONCLUIDA', respostas: [{ conforme: true }], iniciadaMs: 0, concluidaMs: 600000, deadlineMs: 600000, dia: '2026-07-01', funcionarioId: 'f1', funcionario: 'Ana' },
      { id: 'e2', status: 'CONCLUIDA', respostas: [{ conforme: true }, { conforme: false }], iniciadaMs: 0, concluidaMs: 600000, deadlineMs: 300000, dia: '2026-07-01', funcionarioId: 'f2', funcionario: 'Beto' },
    ],
    ocorrenciasEsperadas: [{ dia: '2026-07-01', dow: 0, horaLimite: 0 }, { dia: '2026-07-02', dow: 0, horaLimite: 0 }],
  });
  t('kpis.execucoes', r.kpis.execucoes, 2);
  t('kpis.concluidas', r.kpis.concluidas, 2);
  t('conformidadeMedia (100 e 50) -> 75', r.kpis.conformidadeMedia, 75);
  t('tempoMedioMin (10min e 10min) -> 10', r.kpis.tempoMedioMin, 10);
  t('tempoEstimadoMin não informado -> null', r.kpis.tempoEstimadoMin, null);
  t('noPrazoPct (1 dentro, 1 fora) -> 50', r.kpis.noPrazoPct, 50);
  t('taxaConclusaoPct (1 de 2 dias esperados) -> 50', r.kpis.taxaConclusaoPct, 50);
}

console.log('\n== calcularEstatisticas: série diária ==');
{
  const r = calcularEstatisticas({
    execucoes: [{ id: 's1', dia: '2026-07-01', status: 'CONCLUIDA', respostas: [{ conforme: true }] }],
    dias: ['2026-07-01', '2026-07-02'],
  });
  t('dia com execução: execucoes/concluidas/conformidade', [r.serie[0].execucoes, r.serie[0].concluidas, r.serie[0].conformidade], [1, 1, 100]);
  t('dia sem execução fica zerado', [r.serie[1].execucoes, r.serie[1].concluidas, r.serie[1].conformidade], [0, 0, null]);
}

console.log('\n== calcularEstatisticas: rankingOperadores ==');
{
  const r = calcularEstatisticas({
    execucoes: [
      { id: 'oa1', funcionarioId: 'A', funcionario: 'Ana', status: 'CONCLUIDA', dia: '2026-07-01', respostas: [{ conforme: true }] },
      { id: 'ob1', funcionarioId: 'B', funcionario: 'Beto', status: 'CONCLUIDA', dia: '2026-07-01', respostas: [{ conforme: true }, { conforme: false }] },
      { id: 'ob2', funcionarioId: 'B', funcionario: 'Beto', status: 'CONCLUIDA', dia: '2026-07-02', respostas: [{ conforme: true }, { conforme: false }] },
      { id: 'oc1', funcionarioId: 'C', funcionario: 'Caio', status: 'CONCLUIDA', dia: '2026-07-01', respostas: [{ conforme: true }, { conforme: false }] },
    ],
  });
  t('ordem: A(100) > B(50,2exec) > C(50,1exec) por empate', r.rankingOperadores.map((o) => o.funcionarioId), ['A', 'B', 'C']);
  t('A conformidade 100', r.rankingOperadores[0].conformidade, 100);
  t('B e C empatam em conformidade 50', [r.rankingOperadores[1].conformidade, r.rankingOperadores[2].conformidade], [50, 50]);
  t('empate desfeito por execuções (B=2 > C=1)', [r.rankingOperadores[1].execucoes, r.rankingOperadores[2].execucoes], [2, 1]);
  t('noPrazoPct null quando não há deadline', r.rankingOperadores[0].noPrazoPct, null);
}

console.log('\n== calcularEstatisticas: rankingItens ==');
{
  const r = calcularEstatisticas({
    execucoes: [
      { id: 'ri1', status: 'CONCLUIDA', dia: 'x', respostas: [{ itemChave: 'a', conforme: false }, { itemChave: 'b', conforme: true }, { itemChave: 'c', conforme: false }] },
      { id: 'ri2', status: 'CONCLUIDA', dia: 'x', respostas: [{ itemChave: 'a', conforme: false }] },
      { id: 'ri3', status: 'CONCLUIDA', dia: 'x', respostas: [{ itemChave: 'a', conforme: true }] },
    ],
    itensMap: { a: 'Guardanapos', b: 'Copos' },
  });
  t('só itens com reprovação aparecem (b some)', r.rankingItens.map((i) => i.itemChave), ['a', 'c']);
  t('item a: 2 reprovações de 3 avaliações -> taxaPct 67', [r.rankingItens[0].avaliacoes, r.rankingItens[0].reprovacoes, r.rankingItens[0].taxaPct], [3, 2, 67]);
  t('item a: título vem do itensMap', r.rankingItens[0].titulo, 'Guardanapos');
  t('item c: sem entrada no itensMap -> fallback "Item c"', r.rankingItens[1].titulo, 'Item c');
}

console.log('\n== calcularEstatisticas: heatmap dow x faixa ==');
{
  const base = { dia: '2026-07-01', dow: 1, horaLimite: 8, deadlineMs: 500000 };
  const semConcluida = calcularEstatisticas({ ocorrenciasEsperadas: [base], execucoes: [], agendado: false });
  t('sem concluída: célula [1][2] esperadas1/problemas1/taxa100', semConcluida.heatmap.celulas[1].porFaixa[2], { esperadas: 1, problemas: 1, taxaPct: 100 });
  t('outra célula da mesma linha fica zerada', semConcluida.heatmap.celulas[1].porFaixa[0], { esperadas: 0, problemas: 0, taxaPct: null });
  t('mesma faixa em outro dow fica zerada', semConcluida.heatmap.celulas[0].porFaixa[2], { esperadas: 0, problemas: 0, taxaPct: null });
  t('agendado:false propaga', semConcluida.heatmap.agendado, false);

  const noPrazo = calcularEstatisticas({
    ocorrenciasEsperadas: [base],
    execucoes: [{ id: 'h1', dia: '2026-07-01', status: 'CONCLUIDA', concluidaMs: 400000, respostas: [] }],
  });
  t('concluída no prazo: problema 0', noPrazo.heatmap.celulas[1].porFaixa[2], { esperadas: 1, problemas: 0, taxaPct: 0 });

  const atrasada = calcularEstatisticas({
    ocorrenciasEsperadas: [base],
    execucoes: [{ id: 'h2', dia: '2026-07-01', status: 'CONCLUIDA', concluidaMs: 600000, respostas: [] }],
  });
  t('concluída atrasada (concluidaMs>deadlineMs): problema 1', atrasada.heatmap.celulas[1].porFaixa[2], { esperadas: 1, problemas: 1, taxaPct: 100 });

  const agendadoTrue = calcularEstatisticas({ ocorrenciasEsperadas: [base], execucoes: [], agendado: true });
  t('agendado:true propaga', agendadoTrue.heatmap.agendado, true);
}

console.log('\n== calcularEstatisticas: bordas ==');
{
  const celulasVazias = Array.from({ length: 7 }, (_, dow) => ({ dow, porFaixa: FAIXAS.map(() => ({ esperadas: 0, problemas: 0, taxaPct: null })) }));

  const vazio = calcularEstatisticas();
  t('input vazio: execucoes/concluidas 0', [vazio.kpis.execucoes, vazio.kpis.concluidas], [0, 0]);
  t('input vazio: médias/percentuais null', [vazio.kpis.conformidadeMedia, vazio.kpis.tempoMedioMin, vazio.kpis.tempoEstimadoMin, vazio.kpis.noPrazoPct, vazio.kpis.taxaConclusaoPct], [null, null, null, null, null]);
  t('input vazio: serie/rankingOperadores/rankingItens vazios', [vazio.serie, vazio.rankingOperadores, vazio.rankingItens], [[], [], []]);
  t('input vazio: heatmap agendado:false, 8 faixas, 7 linhas', [vazio.heatmap.agendado, vazio.heatmap.faixas.length, vazio.heatmap.celulas.length], [false, 8, 7]);
  t('input vazio: todas as células do heatmap zeradas', vazio.heatmap.celulas, celulasVazias);

  const avulso = calcularEstatisticas({
    execucoes: [{ id: 'av1', status: 'CONCLUIDA', dia: '2026-07-01', respostas: [{ conforme: true }] }],
    ocorrenciasEsperadas: [],
  });
  t('AVULSO (sem ocorrências esperadas): taxaConclusaoPct null', avulso.kpis.taxaConclusaoPct, null);
  t('AVULSO: heatmap todas células esperadas 0 / taxa null', avulso.heatmap.celulas, celulasVazias);
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
