// checklistEstatisticas.js — puro (sem Prisma/fuso). O endpoint entrega ms + 'dia' (YYYY-MM-DD BR) prontos.

// 8 faixas de horário de 3h (00–03 … 21–24)
export const FAIXAS = Array.from({ length: 8 }, (_, i) => ({
  ini: i * 3, fim: i * 3 + 3,
  label: `${String(i * 3).padStart(2, '0')}–${String(i * 3 + 3).padStart(2, '0')}h`,
}));

export function faixaIndex(hora) {
  const h = Number.isFinite(hora) ? hora : 0;
  return Math.min(7, Math.max(0, Math.floor(h / 3)));
}

export function scoreDeRespostas(respostas) {
  let avaliaveis = 0, conformes = 0;
  for (const r of respostas || []) {
    if (r.conforme === null || r.conforme === undefined) continue;
    avaliaveis++;
    if (r.conforme === true) conformes++;
  }
  return avaliaveis ? Math.round((conformes / avaliaveis) * 100) : null;
}

function media(nums) {
  const v = nums.filter((n) => Number.isFinite(n));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function pct(num, den) { return den ? Math.round((num / den) * 100) : null; }

export function calcularEstatisticas({ execucoes = [], ocorrenciasEsperadas = [], dias = [], tempoEstimadoMin = null, itensMap = {}, agendado = false } = {}) {
  const concl = execucoes.filter((e) => e.status === 'CONCLUIDA');
  // score por execução concluída
  const scoreDe = new Map();
  for (const e of concl) scoreDe.set(e.id, scoreDeRespostas(e.respostas));

  // KPIs
  const conformidadeMedia = media(concl.map((e) => scoreDe.get(e.id)).filter((s) => s !== null));
  const tempos = concl.filter((e) => Number.isFinite(e.iniciadaMs) && Number.isFinite(e.concluidaMs)).map((e) => (e.concluidaMs - e.iniciadaMs) / 60000);
  const tempoMedioMin = media(tempos);
  const comDeadline = concl.filter((e) => Number.isFinite(e.deadlineMs));
  const noPrazoPct = comDeadline.length ? pct(comDeadline.filter((e) => e.concluidaMs <= e.deadlineMs).length, comDeadline.length) : null;

  // adesão: por dia de ocorrência esperada, houve concluída?
  const conclPorDia = new Map(); // dia -> exec concluída (no máx 1 por dataRef)
  for (const e of concl) conclPorDia.set(e.dia, e);
  const taxaConclusaoPct = ocorrenciasEsperadas.length ? pct(ocorrenciasEsperadas.filter((o) => conclPorDia.has(o.dia)).length, ocorrenciasEsperadas.length) : null;

  // série diária
  const porDia = new Map();
  for (const d of dias) porDia.set(d, { dia: d, execucoes: 0, concluidas: 0, _scores: [] });
  for (const e of execucoes) { const g = porDia.get(e.dia); if (!g) continue; g.execucoes++; if (e.status === 'CONCLUIDA') { g.concluidas++; const s = scoreDe.get(e.id); if (s !== null) g._scores.push(s); } }
  const serie = [...porDia.values()].map((g) => ({ dia: g.dia, execucoes: g.execucoes, concluidas: g.concluidas, conformidade: media(g._scores) }));

  // ranking operadores (sobre concluídas)
  const opMap = new Map();
  for (const e of concl) {
    const k = e.funcionarioId;
    if (!opMap.has(k)) opMap.set(k, { funcionarioId: k, nome: e.funcionario || '—', execucoes: 0, _scores: [], _dl: 0, _ok: 0 });
    const o = opMap.get(k); o.execucoes++;
    const s = scoreDe.get(e.id); if (s !== null) o._scores.push(s);
    if (Number.isFinite(e.deadlineMs)) { o._dl++; if (e.concluidaMs <= e.deadlineMs) o._ok++; }
  }
  const rankingOperadores = [...opMap.values()].map((o) => ({ funcionarioId: o.funcionarioId, nome: o.nome, execucoes: o.execucoes, conformidade: media(o._scores), noPrazoPct: o._dl ? pct(o._ok, o._dl) : null }))
    .sort((a, b) => (b.conformidade ?? -1) - (a.conformidade ?? -1) || b.execucoes - a.execucoes);

  // ranking itens que mais reprovam
  const itMap = new Map();
  for (const e of concl) for (const r of e.respostas || []) {
    if (r.conforme === null || r.conforme === undefined) continue;
    if (!itMap.has(r.itemChave)) itMap.set(r.itemChave, { itemChave: r.itemChave, titulo: itensMap[r.itemChave] || `Item ${r.itemChave}`, reprovacoes: 0, avaliacoes: 0 });
    const it = itMap.get(r.itemChave); it.avaliacoes++; if (r.conforme === false) it.reprovacoes++;
  }
  const rankingItens = [...itMap.values()].map((it) => ({ ...it, taxaPct: pct(it.reprovacoes, it.avaliacoes) }))
    .filter((it) => it.reprovacoes > 0).sort((a, b) => b.reprovacoes - a.reprovacoes || (b.taxaPct ?? 0) - (a.taxaPct ?? 0));

  // heatmap dow(0-6) x faixa: sobre ocorrências esperadas -> problema = não-feita OU atrasada
  const celulas = Array.from({ length: 7 }, (_, dow) => ({ dow, porFaixa: FAIXAS.map(() => ({ esperadas: 0, problemas: 0, taxaPct: null })) }));
  for (const o of ocorrenciasEsperadas) {
    const fi = faixaIndex(o.horaLimite);
    const cel = celulas[o.dow % 7].porFaixa[fi];
    cel.esperadas++;
    const ex = conclPorDia.get(o.dia);
    const problema = !ex || (Number.isFinite(o.deadlineMs) && Number.isFinite(ex.concluidaMs) && ex.concluidaMs > o.deadlineMs);
    if (problema) cel.problemas++;
  }
  for (const linha of celulas) for (const c of linha.porFaixa) c.taxaPct = c.esperadas ? pct(c.problemas, c.esperadas) : null;

  return {
    kpis: { execucoes: execucoes.length, concluidas: concl.length, conformidadeMedia, tempoMedioMin, tempoEstimadoMin, noPrazoPct, taxaConclusaoPct },
    serie, rankingOperadores, rankingItens,
    heatmap: { agendado, faixas: FAIXAS, celulas },
  };
}
