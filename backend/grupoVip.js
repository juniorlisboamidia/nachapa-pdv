// Regras puras do Grupo VIP: quais mensagens vencem agora, e o payload do cupom CW.
// Sem Prisma/Express/rede — igual aos outros módulos puros do projeto. BR fixo (UTC-3).
const BR_OFFSET_MIN = -180;
const hmToMin = (hm) => { const p = String(hm || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
const CW_TIPO = { FREE_SHIPPING: 'free_shipping', PERCENT_DISCOUNT: 'percent_discount', FLAT_DISCOUNT: 'flat_discount' };

// Mensagens ativas que vencem AGORA (BR): dia da semana bate, passou do horário, e o id
// ainda não disparou hoje. `jaDisparados` = Set (ou array) de mensagemId já disparados hoje.
export function mensagensParaDisparar(agoraMs, mensagens, jaDisparados) {
  if (!Number.isFinite(agoraMs) || !Array.isArray(mensagens)) return [];
  const d = new Date(agoraMs + BR_OFFSET_MIN * 60000);
  const dow = d.getUTCDay(); // 0=dom..6=sáb (BR)
  const minNow = d.getUTCHours() * 60 + d.getUTCMinutes();
  const feitos = jaDisparados instanceof Set ? jaDisparados : new Set(Array.isArray(jaDisparados) ? jaDisparados : []);
  return mensagens.filter((m) => m && m.ativa
    && Array.isArray(m.diasSemana) && m.diasSemana.includes(dow)
    && /^\d{1,2}:\d{2}$/.test(String(m.horario || '')) && minNow >= hmToMin(m.horario)
    && !feitos.has(m.id));
}

// Payload do cupom CW a partir dos campos da mensagem. `codigo` = gerado pelo chamador.
// `agoraMs` define a janela absoluta available_from/expires_at (cupomValidadeHoras).
export function montarPayloadCupom(m, agoraMs, codigo) {
  const type = CW_TIPO[m?.cupomTipo];
  if (!type) return null;
  const payload = { name: String(m.cupomNome || m.rotulo || 'Cupom VIP').slice(0, 80), type, code: codigo };
  if (type !== 'free_shipping') payload.value = Number(m.cupomValor);
  if (m.cupomLimiteUso != null && m.cupomLimiteUso !== '') payload.use_limit = Math.max(1, Math.trunc(Number(m.cupomLimiteUso)));
  if (m.cupomSoNovosClientes != null) payload.new_customers_only = !!m.cupomSoNovosClientes;
  if (m.cupomPedidoMinimo != null && m.cupomPedidoMinimo !== '') payload.minimum_order_value = Number(m.cupomPedidoMinimo);
  const horas = Number(m.cupomValidadeHoras);
  if (Number.isFinite(horas) && horas > 0) {
    payload.available_from = new Date(agoraMs).toISOString();
    payload.expires_at = new Date(agoraMs + horas * 3600 * 1000).toISOString();
  }
  return payload;
}
