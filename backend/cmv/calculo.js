// Cálculo puro do CMV Global. Sem I/O (sem Prisma, sem Date "agora").
//
// consumo = estoqueInicial + compras - estoqueFinal
// cmvPercent = (consumo / faturamento) * 100  (null se faturamento <= 0, evita
//              divisão por zero/indeterminação)
// statusMeta = 'ok' (cmvPercent <= meta) | 'acima' (cmvPercent > meta) | null
//              (sem cmvPercent ou sem meta definida)
// diffPontos = cmvPercent - meta, em pontos percentuais

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calcularCmvGlobal({
  estoqueInicial = 0,
  compras = 0,
  estoqueFinal = 0,
  faturamento = 0,
  meta = null,
} = {}) {
  const consumo = r2((Number(estoqueInicial) || 0) + (Number(compras) || 0) - (Number(estoqueFinal) || 0));
  const fat = Number(faturamento) || 0;
  const cmvPercent = fat > 0 ? r2((consumo / fat) * 100) : null;
  const metaN = (meta == null || meta === '') ? null : Number(meta);

  let statusMeta = null;
  let diffPontos = null;
  if (cmvPercent != null && metaN != null) {
    diffPontos = r2(cmvPercent - metaN);
    statusMeta = cmvPercent <= metaN ? 'ok' : 'acima';
  }

  return { consumo, cmvPercent, meta: metaN, statusMeta, diffPontos };
}
