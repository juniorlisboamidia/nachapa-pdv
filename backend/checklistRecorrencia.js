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
