// Ponte de LEITURA PDV→HUB: agregados de pedidos por origem (customer_origin) do CW.
// Assina JWT de serviço svc:'pdv-operacao' com o JWT_SECRET compartilhado (SSO).
import jwt from 'jsonwebtoken';

const HUB_API_URL = () => process.env.HUB_API_URL;
const JWT_SECRET = () => process.env.JWT_SECRET;

// Sem hubClienteId ⇒ [] (loja não vinculada ao HUB). Lança {http,msg} em erro — o
// chamador (endpoint da Visão Geral) trata como best-effort.
export async function buscarOrigensCW(hubClienteId, inicioIso, fimIso) {
  if (!HUB_API_URL()) throw { http: 503, msg: 'HUB_API_URL não configurado no .env do PDV.' };
  if (!hubClienteId) return [];
  if (!JWT_SECRET()) throw { http: 500, msg: 'JWT_SECRET ausente.' };
  const token = jwt.sign({ svc: 'pdv-operacao' }, JWT_SECRET(), { expiresIn: '2m' });
  const qs = new URLSearchParams({ clienteId: String(hubClienteId), inicio: inicioIso, fim: fimIso }).toString();
  let res;
  try {
    res = await fetch(`${HUB_API_URL()}/internal/cardapio-origens?${qs}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) { throw { http: 502, msg: 'Não foi possível falar com o HUB.', causa: String(e?.message || e) }; }
  const text = await res.text().catch(() => '');
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) throw { http: res.status, msg: data?.error || `HUB ${res.status}`, data };
  return Array.isArray(data?.origens) ? data.origens : [];
}
