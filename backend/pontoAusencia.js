// Regra pura do afastamento: qual ausência cobre um dado dia. Sem Prisma/Express —
// igual ao padrão dos checklist*.js. Quem chama (calcularEspelho) passa o dia como o
// instante 05:00 BR (início do dia de expediente) e as ausências já em ms.
//
// `ausencias`: [{ tipo, iniMs, fimMs }], com iniMs/fimMs = 05:00 BR do 1º/último dia
// (inclusivos). Devolve a 1ª que cobre `diaMs`, ou null.
export function ausenciaDoDia(diaMs, ausencias) {
  if (!Number.isFinite(diaMs) || !Array.isArray(ausencias)) return null;
  return ausencias.find((a) => a && Number.isFinite(a.iniMs) && Number.isFinite(a.fimMs)
    && a.iniMs <= diaMs && diaMs <= a.fimMs) || null;
}
