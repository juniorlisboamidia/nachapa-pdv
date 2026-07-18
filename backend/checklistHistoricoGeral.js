// checklistHistoricoGeral.js — puro (sem Prisma/fuso). Classifica ocorrências e agrega KPIs/contagens.

export const STATUS = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO', 'NAO_REALIZADO'];

// status de UMA ocorrência. execucao = { status:'EM_ANDAMENTO'|'CONCLUIDA' } | null.
export function classificarOcorrencia({ execucao = null, ehPassado = false, agoraMs = 0, deadlineMs = null } = {}) {
  if (execucao) return execucao.status === 'CONCLUIDA' ? 'CONCLUIDO' : 'EM_ANDAMENTO';
  if (ehPassado) return 'NAO_REALIZADO';                                   // dia passado sem execução
  if (deadlineMs != null && Number.isFinite(deadlineMs) && agoraMs >= deadlineMs) return 'ATRASADO'; // hoje, venceu
  return 'PENDENTE';                                                       // hoje, ainda dá tempo (ou sem horário)
}

// agrega a partir das linhas já classificadas. Cada linha: { status, esperada:boolean }.
export function agregar(linhas = [], { ativos = 0 } = {}) {
  const contagens = { PENDENTE: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0, ATRASADO: 0, NAO_REALIZADO: 0 };
  let esperadas = 0, esperadasConcluidas = 0;
  for (const l of linhas) {
    if (contagens[l.status] != null) contagens[l.status]++;
    if (l.esperada) { esperadas++; if (l.status === 'CONCLUIDO') esperadasConcluidas++; }
  }
  const taxaConclusaoPct = esperadas ? Math.round((esperadasConcluidas / esperadas) * 100) : null;
  return {
    kpis: { ativos, concluidos: contagens.CONCLUIDO, atrasados: contagens.ATRASADO + contagens.NAO_REALIZADO, taxaConclusaoPct },
    contagens,
  };
}
