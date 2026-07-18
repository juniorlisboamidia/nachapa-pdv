// Regra pura do lembrete de atraso: a mensagem e a janela de disparo. Sem Prisma, sem Express,
// sem zapi — igual ao padrão de checklistConformidade/checklistAlerta.
export const TEMPLATE_PADRAO = 'Aviso: o checklist [nome do checklist] previsto para as [horário do checklist] não foi concluído. Colaborador responsável: [nome do responsável]. Por favor, verifique.';

// Substitui os 3 placeholders. Template vazio → o padrão. Dado faltando → string vazia.
export function montarMensagemLembrete(template, { checklist = '', horario = '', responsavel = '' } = {}) {
  const t = (template && String(template).trim()) ? String(template) : TEMPLATE_PADRAO;
  return t
    .split('[nome do checklist]').join(String(checklist || ''))
    .split('[horário do checklist]').join(String(horario || ''))
    .split('[nome do responsável]').join(String(responsavel || ''));
}

// `agora` está na janela [limite - minutosAntes, limite]? (tudo em ms). minutosAntes >= 1.
export function estaNaJanelaDeLembrete(agoraMs, limiteMs, minutosAntes) {
  if (!Number.isFinite(agoraMs) || !Number.isFinite(limiteMs)) return false;
  const inicio = limiteMs - Math.max(1, Number(minutosAntes) || 0) * 60000;
  return agoraMs >= inicio && agoraMs <= limiteMs;
}
