// Regra pura do alerta imediato do Checklist: quais itens críticos ficaram fora
// do padrão e o texto do WhatsApp. Sem Prisma, sem Express, sem zapi.

export function itensCriticosNaoConformes(itensSnapshot, respostas) {
  const r = respostas || {};
  return (itensSnapshot || [])
    .filter((it) => it.critico && r[it.chave]?.conforme === false)
    .map((it) => it.titulo);
}

export function montarMensagemAlerta({ lojaNome, checklistNome, funcionarioNome, quando, itensForaDoPadrao }) {
  const itens = Array.isArray(itensForaDoPadrao) ? itensForaDoPadrao : [];
  const lista = itens.length ? itens.map((t) => `• ${t}`).join('\n') : '• (item crítico fora do padrão)';
  return [
    `⚠️ *Checklist fora do padrão* — ${lojaNome}`,
    ``,
    `*${checklistNome}*`,
    `Responsável: ${funcionarioNome}`,
    `Concluído: ${quando}`,
    ``,
    `Itens que precisam de atenção:`,
    lista,
  ].join('\n');
}
