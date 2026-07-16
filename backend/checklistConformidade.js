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
      // Campo em branco (null/undefined/'') não é medição — Number(null)===0 e
      // Number('')===0 coagiam "não respondido" para zero e avaliavam contra a
      // faixa como se fosse leitura real. Ausência não avalia (não aprova nem
      // reprova); só um número de verdade entra na faixa. 0 legítimo (número ou
      // string '0') continua sendo medição válida — checa ausência antes do Number().
      if (valor == null || valor === '') return { conforme: null, motivo: null };
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
      // Mesmo cuidado do NUMERICO: item crítico não avaliado não pode virar nota 0
      // e disparar reprovação por silêncio do operador. 0 real continua avaliável.
      if (valor == null || valor === '') return { conforme: null, motivo: null };
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
