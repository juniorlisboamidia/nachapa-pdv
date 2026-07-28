// Ponte PDV→HUB→Cardápio Web: cria um cupom no CW reusando o endpoint interno do HUB
// (/api/internal/cardapio-cupom), que já fala com o CW. O PDV assina um JWT de serviço
// com o MESMO JWT_SECRET (compartilhado via SSO) e svc:'pdv-operacao' (o HUB precisa
// aceitar esse svc — ver Task 5). fetch nativo, sem deps.
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

const HUB_API_URL = () => process.env.HUB_API_URL;         // ex.: http://127.0.0.1:<porta-hub>/api
const JWT_SECRET = () => process.env.JWT_SECRET;

// Código legível sem ambíguos (I/O/0/1). Ex.: VIP + 5 chars.
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function gerarCodigoCupom(prefixo = 'VIP', n = 5) {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALFA[b[i] % ALFA.length];
  return `${prefixo}${s}`;
}

// Cria o cupom no CW via HUB. Sem hubClienteId ⇒ { conectado:false } (loja sem CW). Lança
// {http,msg} em erro de rede/HUB — o chamador (agendador) trata como best-effort.
export async function criarCupomCW(hubClienteId, coupon) {
  if (!HUB_API_URL()) throw { http: 503, msg: 'HUB_API_URL não configurado no .env do PDV.' };
  if (!hubClienteId) return { conectado: false };
  if (!JWT_SECRET()) throw { http: 500, msg: 'JWT_SECRET ausente.' };
  const token = jwt.sign({ svc: 'pdv-operacao' }, JWT_SECRET(), { expiresIn: '2m' });
  let res;
  try {
    res = await fetch(`${HUB_API_URL()}/internal/cardapio-cupom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: hubClienteId, coupon }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) { throw { http: 502, msg: 'Não foi possível falar com o HUB.', causa: String(e?.message || e) }; }
  const text = await res.text().catch(() => '');
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw { http: res.status, msg: data?.error || `HUB ${res.status}`, data };
  return data; // { conectado, coupon }
}
