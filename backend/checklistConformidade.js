// Regra pura de conformidade do Checklist. Decide se cada resposta passou e se a
// execução entra em alerta. Sem Prisma, sem Express — é o que dá valor probatório
// ao registro, então é o que tem teste. conforme=null significa "não avalia"
// (o item é informativo, não gera não-conformidade sozinho).

export function avaliarResposta({ tipo, config, valor }) {
  const c = config || {};
  switch (tipo) {
    case 'CHECK':
      return valor === true ? { conforme: true, motivo: null } : { conforme: false, motivo: 'Não marcado' };
    case 'NUMERICO': {
      const n = Number(valor);
      if (!Number.isFinite(n)) return { conforme: null, motivo: null };
      if (c.min != null && n < c.min) return { conforme: false, motivo: `Abaixo de ${c.min}` };
      if (c.max != null && n > c.max) return { conforme: false, motivo: `Acima de ${c.max}` };
      // Sem faixa definida, o número é só um registro (temperatura anotada, contagem).
      if (c.min == null && c.max == null) return { conforme: null, motivo: null };
      return { conforme: true, motivo: null };
    }
    case 'SELECAO': {
      const op = (c.opcoes || []).find((o) => o.rotulo === valor);
      if (!op) return { conforme: null, motivo: null };
      // conforme ausente na opção = tratada como conforme (só marca não-conforme quando explícito).
      return op.conforme === false ? { conforme: false, motivo: 'Opção fora do padrão' } : { conforme: true, motivo: null };
    }
    case 'AVALIACAO': {
      const n = Number(valor);
      if (!Number.isFinite(n) || c.notaMinima == null) return { conforme: null, motivo: null };
      return n >= c.notaMinima ? { conforme: true, motivo: null } : { conforme: false, motivo: `Nota abaixo de ${c.notaMinima}` };
    }
    case 'TEXTO':
    default:
      return { conforme: null, motivo: null };
  }
}

// A execução entra em alerta se algum item CRÍTICO teve resposta não-conforme.
// Item não-crítico não-conforme não dispara alerta (aparece no registro, mas não
// levanta a bandeira do dashboard).
export function execucaoEmAlerta(itensSnapshot, respostasPorChave) {
  return (itensSnapshot || []).some((it) => it.critico && respostasPorChave?.[it.chave]?.conforme === false);
}
