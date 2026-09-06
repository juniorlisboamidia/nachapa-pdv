// Normaliza os payloads nativos de cada fonte (Meta, Google, Cardápio) no CONTRATO
// ÚNICO de relatório consumido pelo RelatorioShell do frontend. Isola aqui toda a
// divergência de nomenclatura entre os endpoints internos do HUB.

export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// KPI padronizado. formato ∈ 'brl' | 'num' | 'x' | 'pct'.
// modo ∈ 'bom-sobe' (default; alta = verde) | 'neutro' (métricas de custo, ex.:
// investimento/cpa — subir não é bom nem ruim por si só, então a variação é cinza).
function kpi(chave, label, valor, anterior, formato, modo = 'bom-sobe') {
  return {
    chave, label, formato, modo,
    valor: Number(valor) || 0,
    anterior: (anterior == null ? null : Number(anterior)),
  };
}

function normalizarMeta(p) {
  const k = p.kpis || {}, a = p.anterior || null;
  return {
    conectado: true,
    sincronizando: false,
    conta: p.conta ? { nome: p.conta.nome } : null,
    periodo: p.periodo || null,
    kpis: [
      kpi('investimento', 'Investimento', k.investimento, a?.investimento, 'brl', 'neutro'),
      kpi('faturamento', 'Faturamento', k.faturamento, a?.faturamento, 'brl'),
      kpi('compras', 'Compras', k.compras, a?.compras, 'num'),
      kpi('roas', 'ROAS', k.roas, a?.roas, 'x'),
      kpi('cpa', 'CPA', k.cpa, null, 'brl', 'neutro'),
      kpi('alcance', 'Alcance', k.alcance, null, 'num'),
      kpi('cliques', 'Cliques', k.cliques, null, 'num'),
      kpi('ctr', 'CTR', k.ctr, null, 'pct'),
    ],
    serie: Array.isArray(p.serieDiaria)
      ? p.serieDiaria.map((d) => ({ data: d.data, investimento: Number(d.investimento) || 0, receita: Number(d.receita) || 0 }))
      : [],
    serieConfig: [
      { chave: 'investimento', label: 'Investimento', cor: 'neutro' },
      { chave: 'receita', label: 'Receita', cor: 'success' },
    ],
  };
}

function normalizarGoogle(p) {
  const k = p.kpis || {}, a = p.anterior || null;
  return {
    conectado: true,
    sincronizando: false,
    conta: p.conta ? { nome: p.conta.nome } : null,
    periodo: p.periodo || null,
    kpis: [
      kpi('investimento', 'Investimento', k.investimento, a?.investimento, 'brl', 'neutro'),
      kpi('cliques', 'Cliques', k.cliques, a?.cliques, 'num'),
      kpi('impressoes', 'Impressões', k.impressoes, null, 'num'),
      kpi('ctr', 'CTR', k.ctr, null, 'pct'),
      kpi('conversoes', 'Conversões', k.conversoes, a?.conversoes, 'num'),
      kpi('cpa', 'CPA', k.cpa, null, 'brl', 'neutro'),
      kpi('valorConversoes', 'Valor de conversões', k.valorConversoes, null, 'brl'),
      kpi('roas', 'ROAS', k.roas, a?.roas, 'x'),
    ],
    serie: Array.isArray(p.serie)
      ? p.serie.map((d) => ({ data: d.data, investimento: Number(d.investimento) || 0, receita: Number(d.valorConversoes) || 0 }))
      : [],
    serieConfig: [
      { chave: 'investimento', label: 'Investimento', cor: 'neutro' },
      { chave: 'receita', label: 'Receita', cor: 'success' },
    ],
  };
}

function normalizarCardapio(p) {
  const k = p.kpis || {}, a = p.anterior || null;
  return {
    conectado: true,
    sincronizando: !!p.sincronizando,
    conta: { nome: 'Cardápio Web' },
    periodo: p.periodo || null,
    kpis: [
      kpi('faturamento', 'Faturamento', k.faturamento, a?.faturamento, 'brl'),
      kpi('pedidos', 'Pedidos', k.pedidos, a?.pedidos, 'num'),
      kpi('ticketMedio', 'Ticket médio', k.ticketMedio, a?.ticketMedio, 'brl'),
      kpi('novosClientes', 'Novos clientes', k.novosClientes, null, 'num'),
    ],
    serie: Array.isArray(p.serie)
      ? p.serie.map((d) => ({ data: d.dia, faturamento: Number(d.total) || 0 }))
      : [],
    serieConfig: [
      { chave: 'faturamento', label: 'Faturamento', cor: 'brand' },
    ],
  };
}

const NORMALIZADORES = { meta: normalizarMeta, google: normalizarGoogle, cardapio: normalizarCardapio };
export const FONTES = Object.keys(NORMALIZADORES);

export function normalizarRelatorio(fonte, payload) {
  const fn = NORMALIZADORES[fonte];
  if (!fn) throw new Error(`Fonte de relatório desconhecida: ${fonte}`);
  if (!payload || payload.conectado === false) {
    return { conectado: false, sincronizando: false, conta: null, periodo: null, kpis: [], serie: [], serieConfig: [] };
  }
  return fn(payload);
}
