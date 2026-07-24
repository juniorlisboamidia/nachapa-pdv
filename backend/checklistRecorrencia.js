// Regra pura de recorrência do Checklist. Sem Prisma, sem Express. Quem chama
// deriva o dia de expediente (corte 05:00 BR) e passa o dia da semana já pronto —
// o módulo não sabe de fuso, só de regra.

export function venceHoje({ recorrenciaTipo, recorrenciaConfig }, diaSemana) {
  if (recorrenciaTipo === 'DIARIA') return true;
  if (recorrenciaTipo === 'DIAS_SEMANA') {
    const dias = Array.isArray(recorrenciaConfig?.diasSemana) ? recorrenciaConfig.diasSemana : [];
    return dias.includes(diaSemana);
  }
  // AVULSO não recorre — fica "disponível sob demanda", tratado fora daqui.
  return false;
}

export function atrasado(horarioLimite, minutoAtualBR) {
  if (!horarioLimite || typeof horarioLimite !== 'string') return false;
  const [h, m] = horarioLimite.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return false;
  return minutoAtualBR > h * 60 + (m || 0);
}

// Corte do dia de EXPEDIENTE (05:00 BR) em minutos — espelha EXP_CUTOFF_MIN do server.
export const CORTE_EXPEDIENTE_MIN = 5 * 60;

// Um horário-limite ANTES do corte pertence à MADRUGADA DO DIA SEGUINTE: o expediente do dia D
// vai das 05:00 de D às 05:00 de D+1, então "02:00" é 02:00 de D+1, não de D. Devolve quantos
// dias (0 ou 1) quem calcula o instante deve somar ao dia de expediente.
//
// Sem isso o limite caía ANTES do expediente começar e o checklist nascia atrasado: o lembrete
// disparava logo no início do expediente (o `atrasado` do lembrete não tem teto superior), e
// estatísticas/histórico contavam "fora do prazo" indevidamente.
export function offsetDiaDoHorario(horarioLimite, corteMin = CORTE_EXPEDIENTE_MIN) {
  if (!horarioLimite || typeof horarioLimite !== 'string') return 0;
  const [h, m] = horarioLimite.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return 0;
  return (h * 60 + (m || 0)) < corteMin ? 1 : 0;
}
