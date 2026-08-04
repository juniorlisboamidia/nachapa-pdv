// UAZAPI (WhatsApp) do PDV — espelha a configuração do HUB. Usado para enviar os
// códigos de acesso (OTP) da Área do Colaborador. fetch nativo (Node 20+), sem deps.
// Envs: UAZAPI_SERVER, UAZAPI_ADMIN_TOKEN (só p/ criar instância), UAZAPI_INSTANCE_TOKEN.
const SERVER_URL = () => process.env.UAZAPI_SERVER;
const ADMIN_TOKEN = () => process.env.UAZAPI_ADMIN_TOKEN;
const INSTANCE_TOKEN = () => process.env.UAZAPI_INSTANCE_TOKEN;

function requireServer() {
  if (!SERVER_URL()) throw { http: 503, msg: 'WhatsApp do PDV não configurado (defina UAZAPI_SERVER no .env).' };
}
const exigirToken = (t) => { if (!t) throw { http: 503, msg: 'Instância do WhatsApp não conectada.' }; };

// authHeader: nome do header de auth. Operações de instância usam 'token'; operações de
// ADMIN da UAZAPI (criar instância) exigem 'admintoken' — senão a UAZAPI responde 401.
async function req(method, path, body, token, authHeader = 'token') {
  let res;
  try {
    res = await fetch(`${SERVER_URL()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', [authHeader]: token || '' },
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

export async function zapiStatus(token = INSTANCE_TOKEN()) {
  requireServer(); exigirToken(token);
  const data = await req('GET', '/instance/status', null, token);
  // uazapiGO: { instance: { status, qrcode, owner, ... }, status: { connected, jid, ... } }
  const inst = data?.instance || {};
  const st = (data?.status && typeof data.status === 'object') ? data.status : {};
  const state = inst.status || inst.state || (typeof data?.status === 'string' ? data.status : '') || data?.state || '';
  const connected = st.connected === true || state === 'connected' || state === 'open' || data?.connected === true;
  const widRaw = st.jid || inst.wid || inst.owner || data?.wid || data?.number || '';
  const number = String(widRaw).split('@')[0].split(':')[0] || null;
  const qrRaw = inst.qrcode || data?.qrcode || '';
  const qr = qrRaw ? `data:image/png;base64,${String(qrRaw).replace(/^data:image\/\w+;base64,/, '')}` : null;
  return {
    connected, status: connected ? 'connected' : (state ? 'disconnected' : 'unknown'), number, qr,
    profileName: inst.profileName || null,
    avatar: inst.profilePicUrl || null,
  };
}

// Info do grupo (nome, membros, descrição). A UAZAPI 2.1.4 NÃO expõe a foto do grupo, então
// o front usa avatar com inicial. Best-effort: retorna null em erro.
export async function zapiGrupoInfo(jid, token = INSTANCE_TOKEN()) {
  requireServer(); if (!token || !jid) return null;
  const out = { nome: null, membros: 0, descricao: null, foto: null };
  try {
    const info = await req('POST', '/group/info', { groupjid: jid }, token);
    out.nome = info?.Name || info?.name || null;
    // A UAZAPI costuma devolver ParticipantCount=0 mesmo com grupo cheio; a lista real
    // vem no array Participants — usa o length dele e cai no count só como fallback.
    out.membros = (Array.isArray(info?.Participants) && info.Participants.length)
      || Number(info?.ParticipantCount ?? info?.participantCount ?? 0) || 0;
    out.descricao = String(info?.Topic || info?.topic || '').trim() || null;
  } catch { /* best-effort */ }
  try {
    // Foto do grupo: /chat/details busca a URL ao vivo no campo `image` (o imagePreview do
    // /chat/find costuma vir vazio p/ número recém-conectado). Precisa de `number` = o JID.
    const d = await req('POST', '/chat/details', { number: jid }, token);
    out.foto = d?.image || d?.imagePreview || null;
    if (!out.nome) out.nome = d?.name || d?.wa_name || null;
  } catch { /* best-effort */ }
  return out;
}

export async function zapiQrCode(token = INSTANCE_TOKEN()) {
  requireServer(); if (!token) return null;
  try {
    const data = await req('POST', '/instance/connect', {}, token);
    const b64 = data?.instance?.qrcode || data?.qrcode || data?.base64 || data?.qr || data?.code || null;
    if (!b64) return null;
    const clean = String(b64).replace(/^data:image\/\w+;base64,/, '');
    return `data:image/png;base64,${clean}`;
  } catch { return null; }
}

export async function zapiCriarInstancia(nome) {
  if (!SERVER_URL() || !ADMIN_TOKEN()) throw { http: 503, msg: 'Defina UAZAPI_SERVER e UAZAPI_ADMIN_TOKEN no .env para criar a instância.' };
  // Admin da UAZAPI usa o header `admintoken` (confirmado no servidor: com `token` dá 401
  // "Missing AdminToken Header"). `name`+`instanceName` cobre variações de versão.
  return req('POST', '/instance/create', { name: nome, instanceName: nome }, ADMIN_TOKEN(), 'admintoken');
}

// Envia texto. `numero` = só dígitos com DDI, OU o JID de um grupo (…@g.us).
export async function zapiEnviarTexto(numero, texto, token = INSTANCE_TOKEN()) {
  requireServer(); exigirToken(token);
  return req('POST', '/send/text', { number: numero, text: texto }, token);
}

// Envia uma imagem (data URL base64 ou URL) com legenda opcional. `numero` = dígitos+DDI ou JID de grupo.
export async function zapiEnviarImagem(numero, imagem, legenda, token = INSTANCE_TOKEN()) {
  requireServer(); exigirToken(token);
  const body = { number: numero, type: 'image', file: imagem };
  if (legenda) body.text = legenda;
  return req('POST', '/send/media', body, token);
}

// Lista os grupos do número conectado. O path/shape do UAZAPI variam entre versões —
// parse defensivo. Se o endpoint não existir na sua versão, o front tem fallback de
// colar o JID do grupo à mão. Confirme o path na doc da sua UAZAPI (ex.: /group/list).
export async function zapiListarGrupos(token = INSTANCE_TOKEN()) {
  requireServer(); if (!token) return [];
  let data;
  try { data = await req('GET', '/group/list', null, token); }
  catch { return []; }
  const arr = Array.isArray(data) ? data : (data?.groups || data?.chats || data?.data || []);
  return arr
    // uazapiGO devolve os campos capitalizados: JID / Name (com fallback p/ minúsculo).
    .map((g) => ({
      jid: String(g.JID || g.jid || g.id || g.wid || g.chatid || '').trim(),
      nome: String(g.Name || g.name || g.subject || g.Subject || g.nome || '').trim(),
    }))
    .filter((g) => g.jid.includes('@g.us') || /^\d+-\d+$/.test(g.jid) || g.jid.length > 8);
}
