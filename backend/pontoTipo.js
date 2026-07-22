// Decisão do TIPO de uma batida de ponto (ENTRADA/SAIDA/…), jornada-aware.
// Puro de propósito (sem prisma/IO) pra ser testável: quem chama busca as batidas
// do expediente e a jornada, e passa só os dados aqui.
//
// Por que existe: o coletor decidia o tipo por alternância pura E↔S dentro da janela
// de expediente. No modo "só entrada/saída" (o padrão) essa alternância NUNCA travava,
// então qualquer batida depois da saída de fechamento REABRIA uma ENTRADA fantasma —
// foi assim que a Maria (turno 17:00) apareceu com uma "entrada" às 00:56, que na
// verdade era o rosto reconhecido de novo já no fim do turno anterior. A jornada prevê
// UM turno por dia, então uma vez aberto o turno nenhuma batida reabre entrada.

// Sequência do modo COM intervalo (4 batidas). Depois da SAIDA, trava (null → SAIDA).
export const SEQ_INTERVALO = {
  ENTRADA: 'SAIDA_INTERVALO', SAIDA_INTERVALO: 'RETORNO_INTERVALO',
  RETORNO_INTERVALO: 'SAIDA', SAIDA: null,
};

const BR_OFFSET_MIN = -180; // BR fixo UTC-3 (independe do TZ do servidor em UTC)
const brToUtcMs = (y, mo, day, h, mi) => Date.UTC(y, mo, day, h, mi) - BR_OFFSET_MIN * 60000;
function brFields(ms) {
  const d = new Date(Number(ms) + BR_OFFSET_MIN * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate(), dow: d.getUTCDay() };
}
const hmToMin = (hm) => { const p = String(hm).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };

// Horário PREVISTO do turno (entrada/saída absolutas em ms UTC) para o expediente que
// começou em `expedienteIniMs` (05:00 BR do dia de início). Retorna null quando não há
// jornada aplicável (sem jornada, dia de folga, ou folga fixa do colaborador).
// Se saida <= entrada, o turno cruza a meia-noite (sai no dia seguinte) — mesma regra
// do espelho (calcularEspelho) e do texto do model Jornada.
export function jornadaDiaPrevisto(diasJson, folgaSemana, expedienteIniMs) {
  if (!Array.isArray(diasJson)) return null;
  const f = brFields(expedienteIniMs);
  const cfg = diasJson[f.dow];
  const folgaColab = Array.isArray(folgaSemana) && folgaSemana.includes(f.dow);
  if (!cfg || cfg.folga || folgaColab || !cfg.entrada || !cfg.saida) return null;
  const em = hmToMin(cfg.entrada), sm = hmToMin(cfg.saida);
  const entradaMs = brToUtcMs(f.y, f.mo, f.day, Math.floor(em / 60), em % 60);
  const saidaMs = brToUtcMs(f.y, f.mo, f.day + (sm <= em ? 1 : 0), Math.floor(sm / 60), sm % 60);
  return { entradaMs, saidaMs };
}

// Decide o tipo da batida nova.
//   tiposExistentes: tipos das batidas JÁ gravadas no expediente, em ordem asc.
//   usaIntervalo:    config da loja (2 batidas E/S x 4 batidas com intervalo).
//   dataHoraMs:      instante da batida nova (ms). Só usado com saidaPrevMs.
//   saidaPrevMs:     fim previsto do turno pela jornada (ms) ou null (sem jornada).
export function decidirTipoPonto({ tiposExistentes = [], usaIntervalo = false, dataHoraMs = null, saidaPrevMs = null }) {
  const ultimo = tiposExistentes.length ? tiposExistentes[tiposExistentes.length - 1] : null;
  const jaTemEntrada = tiposExistentes.includes('ENTRADA');

  // Sequência base (comportamento histórico).
  let proposto;
  if (usaIntervalo) proposto = ultimo ? (SEQ_INTERVALO[ultimo] || 'SAIDA') : 'ENTRADA';
  else proposto = !ultimo ? 'ENTRADA' : ((ultimo === 'ENTRADA' || ultimo === 'RETORNO_INTERVALO') ? 'SAIDA' : 'ENTRADA');

  // Guarda 1 — teto universal: uma vez ABERTO o turno (já houve ENTRADA), nenhuma batida
  // REABRE entrada no mesmo expediente. Espelha o teto que o modo intervalo já tinha e
  // mata a entrada fantasma pós-saída do modo só entrada/saída. É o conserto do bug.
  if (proposto === 'ENTRADA' && jaTemEntrada) proposto = 'SAIDA';

  // Guarda 2 — jornada: a PARTIR do fim previsto do turno, batida não abre entrada. Pega
  // o caso raro da batida solta na madrugada (rosto reconhecido depois do turno) que,
  // sem batida anterior, viraria uma entrada fora de hora. O espelho usa 1ª/última
  // batida do dia, então isto ajusta o RÓTULO (e a situação no painel), não o horário.
  if (proposto === 'ENTRADA' && saidaPrevMs != null && dataHoraMs != null && Number(dataHoraMs) >= Number(saidaPrevMs)) {
    proposto = 'SAIDA';
  }

  return proposto;
}
