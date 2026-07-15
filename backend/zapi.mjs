// UAZAPI (WhatsApp) do PDV — espelha a configuração do HUB. Usado para enviar os
// códigos de acesso (OTP) da Área do Colaborador. fetch nativo (Node 20+), sem deps.
// Envs: UAZAPI_SERVER, UAZAPI_ADMIN_TOKEN (só p/ criar instância), UAZAPI_INSTANCE_TOKEN.
const SERVER_URL = () => process.env.UAZAPI_SERVER;
const ADMIN_TOKEN = () => process.env.UAZAPI_ADMIN_TOKEN;
const INSTANCE_TOKEN = () => process.env.UAZAPI_INSTANCE_TOKEN;

function requireConfig() {
  if (!SERVER_URL() || !INSTANCE_TOKEN()) throw { http: 503, msg: 'WhatsApp do PDV não configurado (defina UAZAPI_SERVER e UAZAPI_INSTANCE_TOKEN no .env).' };
}

async function req(method, path, body, token) {
  let res;
  try {
    res = await fetch(`${SERVER_URL()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', token: token || '' },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) { throw { http: 502, msg: 'Não foi possível falar com o servidor do WhatsApp.', causa: String(e?.message || e) }; }
  const text = await res.text().catch(() => '');
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw { http: res.status, msg: data?.error || data?.message || `UAZAPI ${res.status}`, data };
  return data;
}

export function zapiConfigurado() { return !!(SERVER_URL() && INSTANCE_TOKEN()); }

export async function zapiStatus() {
  requireConfig();
  const data = await req('GET', '/instance/status', null, INSTANCE_TOKEN());
  const state = data?.instance?.status || data?.instance?.state || data?.status || data?.state || '';
  const connected = state === 'connected' || state === 'open' || data?.connected === true;
  const widRaw = data?.instance?.wid || data?.wid || data?.number || '';
  const number = String(widRaw).split('@')[0] || null;
  return { connected, status: connected ? 'connected' : (state ? 'disconnected' : 'unknown'), number };
}

export async function zapiQrCode() {
  requireConfig();
  try {
    const data = await req('POST', '/instance/connect', {}, INSTANCE_TOKEN());
    const b64 = data?.qrcode || data?.base64 || data?.qr || data?.code || null;
    if (!b64) return null;
    const clean = String(b64).replace(/^data:image\/\w+;base64,/, '');
    return `data:image/png;base64,${clean}`;
  } catch { return null; }
}

export async function zapiCriarInstancia(nome) {
  if (!SERVER_URL() || !ADMIN_TOKEN()) throw { http: 503, msg: 'Defina UAZAPI_SERVER e UAZAPI_ADMIN_TOKEN no .env para criar a instância.' };
  return req('POST', '/instance/create', { instanceName: nome }, ADMIN_TOKEN());
}

// Envia uma mensagem de texto. `numero` = só dígitos com DDI (ex.: 5511999999999).
export async function zapiEnviarTexto(numero, texto) {
  requireConfig();
  return req('POST', '/send/text', { number: numero, text: texto }, INSTANCE_TOKEN());
}
