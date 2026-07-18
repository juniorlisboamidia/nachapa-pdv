// Regra pura do lembrete de atraso: a mensagem e a checagem de atraso. Sem Prisma, sem Express,
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

// O checklist atrasou? `agora` já passou de (horário + tolerância)? (ms). tolerância >= 0.
// Sem teto — o dedup (1x/dia) evita repetir. tolerância ausente/inválida = 0 (dispara no horário).
export function atrasado(agoraMs, horarioMs, toleranciaMin) {
  if (!Number.isFinite(agoraMs) || !Number.isFinite(horarioMs)) return false;
  const alvo = horarioMs + Math.max(0, Number(toleranciaMin) || 0) * 60000;
  return agoraMs >= alvo;
}
