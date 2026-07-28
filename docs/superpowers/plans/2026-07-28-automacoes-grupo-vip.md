# Automações › Grupo VIP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo Grupo VIP no PDV: conectar um número WhatsApp dedicado, escolher o grupo, cadastrar mensagens com agenda semanal recorrente, e opcionalmente criar um cupom no Cardápio Web no disparo (via ponte PDV→HUB), anunciando o código na mensagem.

**Architecture:** Reusa UAZAPI (`backend/zapi.mjs`) e o padrão de agendador in-process (`setInterval` + varredura fora do tenantStore). 3 models novos no `operacao`. Cupom via ponte HUB (`/api/internal/cardapio-cupom`) com JWT de serviço `svc:'pdv-operacao'` (ajuste de 1 linha no HUB). Só texto no v1; criação de cupom é best-effort (falha não derruba o disparo).

**Tech Stack:** Backend Express 5 ESM (`backend/server.js`), Prisma 7 + adapter-pg, Postgres `operacao`. Frontend React 19 + Vite. UAZAPI. Ponte HUB→Cardápio Web. Testes: `node` sem framework.

## Global Constraints

- **Fuso BR fixo (UTC-3)** via `brFields`/`brToUtcMs`; horários de disparo em BR; `dataRef` do dedup = 00:00 BR do dia da ocorrência.
- **Dedup antes de enviar:** cria `GrupoVipDisparo` (unique `[empresaId,mensagemId,dataRef]`) ANTES do envio; P2002 ⇒ pula (não duplica no tick nem após restart).
- **Best-effort:** falha de cupom OU de envio nunca trava a varredura das outras mensagens/lojas; try/catch por mensagem e por loja; `empresaId` explícito (agendador fora do tenantStore).
- **Multi-tenant:** models novos em `MODELS_TENANT`; rotas admin dentro do gate (`exigirAdmin`, extension injeta `empresaId`); agendador fora do gate com `empresaId` explícito. Nunca `req.user.empresaId`.
- **Cupom:** modos por mensagem — `NENHUM` / `NOVO_POR_DISPARO` (cria no CW, código automático em `{cupom}`) / `FIXO` (usa `cupomCodigoFixo`, sem criar). Payload CW: `type` ∈ `free_shipping|percent_discount|flat_discount`, `value` obrigatório salvo free_shipping (percent ≤ 100).
- **Dias da semana = `Int[]`** (0=dom..6=sáb).
- **Não expor** `instanceToken`/`hubClienteId` em respostas de leitura.
- **Só texto no v1** (sem mídia).
- Commit por task direto na `main` + `git push origin main` (EXCETO Task 5, que é no repo Traffic Hub — commit sem push, ver a task).
- **Subagentes: NUNCA `taskkill /IM node.exe`.** Matar só o próprio job (`kill %1`).

---

### Task 1: Models + enums + migration + MODELS_TENANT

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/server.js` (MODELS_TENANT, ~linha 53)
- Create: `backend/prisma/migrations/<timestamp>_grupo_vip/migration.sql`

**Interfaces:**
- Produces: `prisma.grupoVipConfig`, `prisma.grupoVipMensagem`, `prisma.grupoVipDisparo` com os campos abaixo.

- [ ] **Step 1: Adicionar enums + models no schema**

No fim de `backend/prisma/schema.prisma` (colunas `Int` puras, SEM `@relation`, igual aos models de ponto):
```prisma
enum GrupoVipCupomModo {
  NENHUM
  NOVO_POR_DISPARO
  FIXO
}

enum CupomTipoCW {
  FREE_SHIPPING
  PERCENT_DISCOUNT
  FLAT_DISCOUNT
}

// Config do Grupo VIP (1 por loja): instância UAZAPI dedicada do marketing, grupo alvo,
// e o clienteId da loja no HUB (para a ponte de cupom). ativo liga/desliga o módulo.
model GrupoVipConfig {
  id            Int      @id @default(autoincrement())
  empresaId     Int      @unique
  instanceName  String?
  instanceToken String?
  grupoJid      String?
  grupoNome     String?
  hubClienteId  String?
  ativo         Boolean  @default(false)
  criadoEm      DateTime @default(now())
  atualizadoEm  DateTime @updatedAt
}

// Mensagem VIP: texto (aceita a variável {cupom}) + agenda semanal (diasSemana 0-6 +
// horário HH:MM BR) + o cupom opcional por modo.
model GrupoVipMensagem {
  id                   Int               @id @default(autoincrement())
  empresaId            Int
  rotulo               String
  texto                String
  diasSemana           Int[]             @default([])
  horario              String
  ativa                Boolean           @default(true)
  cupomModo            GrupoVipCupomModo  @default(NENHUM)
  cupomTipo            CupomTipoCW?
  cupomValor           Decimal?          @db.Decimal(10, 2)
  cupomNome            String?
  cupomCodigoFixo      String?
  cupomValidadeHoras   Int?
  cupomPedidoMinimo    Decimal?          @db.Decimal(10, 2)
  cupomLimiteUso       Int?
  cupomSoNovosClientes Boolean?
  criadoEm             DateTime          @default(now())
  atualizadoEm         DateTime          @updatedAt

  @@index([empresaId])
}

// Log + dedup de disparo. unique (empresaId,mensagemId,dataRef) garante 1 disparo/dia.
model GrupoVipDisparo {
  id         Int      @id @default(autoincrement())
  empresaId  Int
  mensagemId Int
  dataRef    DateTime
  status     String
  erro       String?
  cupomCode  String?
  conteudo   String?
  criadoEm   DateTime @default(now())

  @@unique([empresaId, mensagemId, dataRef])
  @@index([empresaId, criadoEm])
}
```

- [ ] **Step 2: Registrar no MODELS_TENANT**

Em `backend/server.js` (~linha 53), adicionar à lista `MODELS_TENANT` (depois de `'pontoAusencia'`):
```js
// ...'pontoAusencia', 'grupoVipConfig', 'grupoVipMensagem', 'grupoVipDisparo',
```

- [ ] **Step 3: Gerar a migration + client**

Run (em `backend/`):
```bash
npx prisma migrate dev --name grupo_vip
npx prisma generate
```
**⚠️ ARMADILHA CONHECIDA DO PDV:** o banco de dev tem drift; o `migrate dev` pode empacotar `DROP`s de OUTROS models na migration. **ABRA o `migration.sql` gerado** (`backend/prisma/migrations/<ts>_grupo_vip/migration.sql`) e confirme que contém APENAS: `CREATE TYPE "GrupoVipCupomModo"`, `CREATE TYPE "CupomTipoCW"`, `CREATE TABLE "GrupoVipConfig"/"GrupoVipMensagem"/"GrupoVipDisparo"` e os índices/uniques. Se houver qualquer `DROP`/`ALTER` de outra tabela, **remova essas linhas à mão**, e acerte o checksum do dev: `SUM=$(sha256sum "$FILE" | cut -d' ' -f1); printf 'UPDATE "_prisma_migrations" SET checksum = '"'"'%s'"'"' WHERE migration_name = '"'"'<ts>_grupo_vip'"'"';\n' "$SUM" | npx prisma db execute --stdin` (mesmo procedimento da feature de Afastamentos). Depois `npx prisma migrate status` deve dar "up to date".

- [ ] **Step 4: Verificar**

Run: `node --check backend/server.js && npx prisma validate`
Expected: sem erros; `The schema ... is valid`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/server.js backend/prisma/migrations
git commit -m "feat(grupo-vip): models GrupoVipConfig/Mensagem/Disparo + migration + MODELS_TENANT"
git push origin main
```

---

### Task 2: Refactor `zapi.mjs` (token por parâmetro) + `zapiListarGrupos`

**Files:**
- Modify: `backend/zapi.mjs`

**Interfaces:**
- Produces: `zapiStatus(token?)`, `zapiQrCode(token?)`, `zapiEnviarTexto(numero, texto, token?)`, `zapiListarGrupos(token?)` — todas com `token` opcional (default = instância do OTP, do `.env`); `zapiCriarInstancia(nome)` inalterada. Consumido pelos endpoints/agendador do Grupo VIP com o `instanceToken` da config.

- [ ] **Step 1: Substituir o corpo por versão parametrizada**

Substituir o conteúdo de `backend/zapi.mjs` a partir de `function requireConfig()` mantendo o topo (comentário + `SERVER_URL`/`ADMIN_TOKEN`/`INSTANCE_TOKEN`/`req`). Trocar `requireConfig` por um guarda só de servidor e parametrizar as funções (o default preserva 100% o comportamento do OTP):
```js
function requireServer() {
  if (!SERVER_URL()) throw { http: 503, msg: 'WhatsApp do PDV não configurado (defina UAZAPI_SERVER no .env).' };
}
const exigirToken = (t) => { if (!t) throw { http: 503, msg: 'Instância do WhatsApp não conectada.' }; };

export function zapiConfigurado() { return !!(SERVER_URL() && INSTANCE_TOKEN()); }

export async function zapiStatus(token = INSTANCE_TOKEN()) {
  requireServer(); exigirToken(token);
  const data = await req('GET', '/instance/status', null, token);
  const state = data?.instance?.status || data?.instance?.state || data?.status || data?.state || '';
  const connected = state === 'connected' || state === 'open' || data?.connected === true;
  const widRaw = data?.instance?.wid || data?.wid || data?.number || '';
  const number = String(widRaw).split('@')[0] || null;
  return { connected, status: connected ? 'connected' : (state ? 'disconnected' : 'unknown'), number };
}

export async function zapiQrCode(token = INSTANCE_TOKEN()) {
  requireServer(); if (!token) return null;
  try {
    const data = await req('POST', '/instance/connect', {}, token);
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

// Envia texto. `numero` = só dígitos com DDI, OU o JID de um grupo (…@g.us).
export async function zapiEnviarTexto(numero, texto, token = INSTANCE_TOKEN()) {
  requireServer(); exigirToken(token);
  return req('POST', '/send/text', { number: numero, text: texto }, token);
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
    .map((g) => ({ jid: String(g.jid || g.id || g.wid || g.chatid || '').trim(), nome: String(g.name || g.subject || g.nome || '').trim() }))
    .filter((g) => g.jid.includes('@g.us') || /^\d+-\d+$/.test(g.jid) || g.jid.length > 8);
}
```
> Nota: `requireConfig` some (nenhuma função a chama mais). Confirme que as chamadas de OTP `zapiEnviarTexto(destino, msg)` (sem token) continuam usando o default do `.env` — o comportamento é idêntico.

- [ ] **Step 2: Verificar**

Run: `node --check backend/zapi.mjs && node --check backend/server.js`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add backend/zapi.mjs
git commit -m "feat(grupo-vip): zapi.mjs aceita token por parâmetro + zapiListarGrupos"
git push origin main
```

---

### Task 3: Módulo puro `grupoVip.js` (regra de disparo + payload do cupom) + testes

**Files:**
- Create: `backend/grupoVip.js`
- Create: `backend/grupoVip.test.js`

**Interfaces:**
- Produces:
  - `mensagensParaDisparar(agoraMs, mensagens, jaDisparados)` → array das mensagens ativas que vencem AGORA (dia da semana BR bate, `minNow >= horário`, e o `id` não está em `jaDisparados`).
  - `montarPayloadCupom(mensagem, agoraMs, codigo)` → objeto payload do CW (ou `null` se tipo inválido). `codigo` é gerado pelo chamador.

- [ ] **Step 1: Escrever o teste que falha**

`backend/grupoVip.test.js`:
```js
import { mensagensParaDisparar, montarPayloadCupom } from './grupoVip.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

// Instante BR: 5511... use o offset -180. Ter 28/07/2026 18:05 BR = 21:05 UTC.
const BR = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - -180 * 60000;
const terca1805 = BR(2026, 7, 28, 18, 5); // 28/07/2026 é uma terça
const msg = (over) => ({ id: 1, ativa: true, diasSemana: [2], horario: '18:00', ...over });

console.log('\n== mensagensParaDisparar ==');
t('terça 18:00 dispara às 18:05', mensagensParaDisparar(terca1805, [msg()], new Set()).map((m) => m.id), [1]);
t('antes do horário não dispara', mensagensParaDisparar(BR(2026, 7, 28, 17, 59), [msg()], new Set()).map((m) => m.id), []);
t('dia errado (quarta) não dispara', mensagensParaDisparar(BR(2026, 7, 29, 18, 5), [msg()], new Set()).map((m) => m.id), []);
t('já disparada hoje não repete', mensagensParaDisparar(terca1805, [msg()], new Set([1])).map((m) => m.id), []);
t('inativa não dispara', mensagensParaDisparar(terca1805, [msg({ ativa: false })], new Set()).map((m) => m.id), []);
t('múltiplos dias: seg e ter', mensagensParaDisparar(terca1805, [msg({ diasSemana: [1, 2] })], new Set()).map((m) => m.id), [1]);
t('horário inválido é ignorado', mensagensParaDisparar(terca1805, [msg({ horario: 'xx' })], new Set()).map((m) => m.id), []);
t('lista vazia', mensagensParaDisparar(terca1805, [], new Set()), []);

console.log('\n== montarPayloadCupom ==');
const base = { rotulo: 'Terça em dobro', cupomTipo: 'PERCENT_DISCOUNT', cupomValor: 20, cupomValidadeHoras: 6 };
const p = montarPayloadCupom(base, terca1805, 'VIPABC12');
t('percent: type/value/code', [p.type, p.value, p.code], ['percent_discount', 20, 'VIPABC12']);
t('percent: available_from = agora ISO', p.available_from, new Date(terca1805).toISOString());
t('percent: expires_at = agora + 6h', p.expires_at, new Date(terca1805 + 6 * 3600 * 1000).toISOString());
t('free_shipping não manda value', (() => { const x = montarPayloadCupom({ ...base, cupomTipo: 'FREE_SHIPPING' }, terca1805, 'X'); return 'value' in x; })(), false);
t('tipo inválido = null', montarPayloadCupom({ cupomTipo: 'ZZZ' }, terca1805, 'X'), null);
t('limite/pedido mínimo/novos', (() => { const x = montarPayloadCupom({ ...base, cupomLimiteUso: 100, cupomPedidoMinimo: 30, cupomSoNovosClientes: true }, terca1805, 'X'); return [x.use_limit, x.minimum_order_value, x.new_customers_only]; })(), [100, 30, true]);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node backend/grupoVip.test.js`
Expected: FALHA — `Cannot find module './grupoVip.js'`.

- [ ] **Step 3: Implementar o módulo**

`backend/grupoVip.js`:
```js
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node backend/grupoVip.test.js`
Expected: `14 ok, 0 falha(s)`.

- [ ] **Step 5: Commit**

```bash
git add backend/grupoVip.js backend/grupoVip.test.js
git commit -m "feat(grupo-vip): módulo puro (disparo + payload do cupom) + testes"
git push origin main
```

---

### Task 4: Ponte de cupom `cardapioCupom.js` (PDV→HUB) + `HUB_API_URL`

**Files:**
- Create: `backend/cardapioCupom.js`
- Modify: `backend/.env` (adicionar `HUB_API_URL`)

**Interfaces:**
- Consumes: `HUB_API_URL`, `JWT_SECRET` (env), `jwt`, `randomBytes`.
- Produces: `gerarCodigoCupom(prefixo?, n?)` → string; `criarCupomCW(hubClienteId, coupon)` → `{ conectado, coupon? }` ou lança `{ http, msg }`.

- [ ] **Step 1: Criar o módulo**

`backend/cardapioCupom.js`:
```js
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
```

- [ ] **Step 2: Adicionar `HUB_API_URL` no `.env`**

Em `backend/.env`, adicionar (valor = a base interna da API do HUB no mesmo VPS; confirmar a porta do HUB — é o processo `nachapahub-backend`):
```
HUB_API_URL=http://127.0.0.1:3001/api
```
> A porta pode diferir — ajustar para a porta real do backend do HUB. Isso é config; o código não muda.

- [ ] **Step 3: Verificar**

Run: `node --check backend/cardapioCupom.js`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add backend/cardapioCupom.js backend/.env
git commit -m "feat(grupo-vip): ponte de cupom PDV->HUB (criarCupomCW) + HUB_API_URL"
git push origin main
```
> Se `.env` for gitignored (provável), commite só `backend/cardapioCupom.js` e configure o `HUB_API_URL` direto no `.env` de prod.

---

### Task 5: Ajuste no HUB — aceitar `svc:'pdv-operacao'` (REPO Traffic Hub)

**Files:**
- Modify: `C:\Users\Windows\Traffic Hub\backend\server.js` (endpoint `POST /api/internal/cardapio-cupom`, ~linha 9833)

**Interfaces:**
- Produces: o endpoint interno de criação de cupom do HUB passa a aceitar tokens de serviço do PDV.

> ⚠️ **Esta task é em OUTRO repositório:** `C:\Users\Windows\Traffic Hub` (o Traffic Hub / HUB). NÃO é o `nachapa-pdv`. Trabalhe lá.

- [ ] **Step 1: Aceitar o svc do PDV**

Em `C:\Users\Windows\Traffic Hub\backend\server.js`, no endpoint `app.post('/api/internal/cardapio-cupom', ...)`, trocar a linha do check de svc:
```js
  if (svcPayload.svc !== 'h360-dashboard') return res.status(403).json({ error: 'Token não autorizado' });
```
por:
```js
  if (!['h360-dashboard', 'pdv-operacao'].includes(svcPayload.svc)) return res.status(403).json({ error: 'Token não autorizado' });
```

- [ ] **Step 2: Verificar**

Run (na pasta do HUB): `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 3: Commit (sem push)**

O HUB está numa branch de feature própria; commite a mudança isolada e **NÃO faça push** — o controller/usuário decide o deploy do HUB.
```bash
cd "/c/Users/Windows/Traffic Hub" && git add backend/server.js && git commit -m "feat(cardapio): aceita svc pdv-operacao no /internal/cardapio-cupom (ponte do PDV)"
```
> Até este ajuste ser deployado no HUB, `criarCupomCW` recebe 403 (o disparo da mensagem segue mesmo assim, best-effort — o log registra o erro).

---

### Task 6: Endpoints de conexão do WhatsApp (instância/QR/status/grupos/config)

**Files:**
- Modify: `backend/server.js` (bloco novo, perto dos outros endpoints admin do PDV)

**Interfaces:**
- Consumes: `zapiCriarInstancia`, `zapiQrCode(token)`, `zapiStatus(token)`, `zapiListarGrupos(token)` (Task 2); `exigirAdmin`, `getEmpresaIdAtual`, `prisma.grupoVipConfig` (Task 1).
- Produces: `GET /api/grupo-vip/config`, `POST /api/grupo-vip/instancia`, `GET /api/grupo-vip/qr`, `GET /api/grupo-vip/status`, `GET /api/grupo-vip/grupos`, `PUT /api/grupo-vip/config`.

- [ ] **Step 1: Adicionar os imports do zapi**

Confirmar/estender o import do `zapi.mjs` no topo do `backend/server.js`. Hoje importa `zapiEnviarTexto`/`zapiConfigurado` (para OTP). Estender para:
```js
import { zapiEnviarTexto, zapiConfigurado, zapiStatus, zapiQrCode, zapiListarGrupos, zapiCriarInstancia } from './zapi.mjs';
```
(Grep primeiro a linha de import atual e some os que faltam — não duplique.)

- [ ] **Step 2: Adicionar o bloco de rotas de conexão**

Inserir perto das outras rotas admin do PDV (ex.: após o bloco `/api/ponto/ausencias`). `GrupoVipConfig` é criado on-demand; nunca devolver `instanceToken` cru.
```js
// ===== Automações › Grupo VIP — conexão do WhatsApp (ADMIN) =====
async function garantirGrupoVipConfig() {
  let c = await prisma.grupoVipConfig.findFirst();
  if (!c) c = await prisma.grupoVipConfig.create({ data: {} });
  return c;
}
const grupoVipConfigPublica = (c) => ({
  grupoJid: c.grupoJid || null, grupoNome: c.grupoNome || null,
  hubClienteId: c.hubClienteId || null, ativo: !!c.ativo,
  temInstancia: !!c.instanceToken,
});

app.get('/api/grupo-vip/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json(grupoVipConfigPublica(await garantirGrupoVipConfig())); }
  catch (err) { console.error('[grupo-vip/config GET]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.post('/api/grupo-vip/instancia', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (c.instanceToken) return res.json({ ok: true, jaExistia: true });
    const nome = `pdv-vip-${getEmpresaIdAtual()}-${Date.now()}`;
    const data = await zapiCriarInstancia(nome);
    const token = data?.token || data?.instance?.token || data?.instanceToken || null;
    if (!token) return res.status(502).json({ error: 'A UAZAPI não devolveu o token da instância.' });
    await prisma.grupoVipConfig.update({ where: { id: c.id }, data: { instanceName: nome, instanceToken: token } });
    res.json({ ok: true });
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[grupo-vip/instancia]', err); res.status(500).json({ error: 'Erro ao criar a instância.' }); }
});

app.get('/api/grupo-vip/qr', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken) return res.status(400).json({ error: 'Crie a instância primeiro.' });
    res.json({ qr: await zapiQrCode(c.instanceToken) });
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[grupo-vip/qr]', err); res.status(500).json({ error: 'Erro ao gerar o QR.' }); }
});

app.get('/api/grupo-vip/status', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken) return res.json({ connected: false, status: 'sem_instancia', number: null });
    res.json(await zapiStatus(c.instanceToken));
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[grupo-vip/status]', err); res.status(500).json({ error: 'Erro ao consultar status.' }); }
});

app.get('/api/grupo-vip/grupos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken) return res.json({ grupos: [] });
    res.json({ grupos: await zapiListarGrupos(c.instanceToken) });
  } catch (err) { console.error('[grupo-vip/grupos]', err); res.json({ grupos: [] }); }
});

app.put('/api/grupo-vip/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    const data = {};
    if (req.body?.grupoJid !== undefined) { data.grupoJid = req.body.grupoJid ? String(req.body.grupoJid).trim().slice(0, 120) : null; data.grupoNome = req.body?.grupoNome ? String(req.body.grupoNome).trim().slice(0, 120) : null; }
    if (req.body?.hubClienteId !== undefined) data.hubClienteId = req.body.hubClienteId ? String(req.body.hubClienteId).trim().slice(0, 60) : null;
    if (req.body?.ativo !== undefined) data.ativo = !!req.body.ativo;
    await prisma.grupoVipConfig.update({ where: { id: c.id }, data });
    res.json(grupoVipConfigPublica(await garantirGrupoVipConfig()));
  } catch (err) { console.error('[grupo-vip/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
```

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(grupo-vip): endpoints de conexão do WhatsApp (instância/QR/status/grupos/config)"
git push origin main
```

---

### Task 7: CRUD de mensagens VIP (endpoints)

**Files:**
- Modify: `backend/server.js` (após o bloco da Task 6)

**Interfaces:**
- Consumes: `prisma.grupoVipMensagem`, `prisma.grupoVipDisparo`, `exigirAdmin`.
- Produces: `GET/POST/PUT/DELETE /api/grupo-vip/mensagens` + `GET /api/grupo-vip/historico`.

- [ ] **Step 1: Adicionar o bloco de rotas**

```js
// ===== Grupo VIP — mensagens + histórico (ADMIN) =====
const GRUPOVIP_CUPOM_MODOS = ['NENHUM', 'NOVO_POR_DISPARO', 'FIXO'];
const CUPOM_TIPOS_CW = ['FREE_SHIPPING', 'PERCENT_DISCOUNT', 'FLAT_DISCOUNT'];
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function normalizarMensagemVip(body) {
  const rotulo = String(body?.rotulo || '').trim().slice(0, 80);
  const texto = String(body?.texto || '').trim().slice(0, 2000);
  if (!rotulo) return { error: 'Informe um rótulo.' };
  if (!texto) return { error: 'Informe o texto da mensagem.' };
  const diasSemana = Array.isArray(body?.diasSemana) ? [...new Set(body.diasSemana.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))] : [];
  if (!diasSemana.length) return { error: 'Escolha ao menos um dia da semana.' };
  const horario = String(body?.horario || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(horario)) return { error: 'Horário inválido (HH:MM).' };
  const cupomModo = GRUPOVIP_CUPOM_MODOS.includes(body?.cupomModo) ? body.cupomModo : 'NENHUM';
  const d = { rotulo, texto, diasSemana, horario, ativa: body?.ativa !== false, cupomModo };
  if (cupomModo === 'FIXO') {
    d.cupomCodigoFixo = String(body?.cupomCodigoFixo || '').trim().slice(0, 40) || null;
    if (!d.cupomCodigoFixo) return { error: 'Modo fixo: informe o código do cupom.' };
  }
  if (cupomModo === 'NOVO_POR_DISPARO') {
    if (!CUPOM_TIPOS_CW.includes(body?.cupomTipo)) return { error: 'Escolha o tipo do cupom.' };
    d.cupomTipo = body.cupomTipo;
    d.cupomNome = String(body?.cupomNome || '').trim().slice(0, 80) || null;
    d.cupomValor = d.cupomTipo === 'FREE_SHIPPING' ? null : numOrNull(body?.cupomValor);
    if (d.cupomTipo !== 'FREE_SHIPPING' && (d.cupomValor == null || d.cupomValor <= 0 || (d.cupomTipo === 'PERCENT_DISCOUNT' && d.cupomValor > 100))) return { error: 'Valor do cupom inválido.' };
    d.cupomValidadeHoras = numOrNull(body?.cupomValidadeHoras);
    d.cupomPedidoMinimo = numOrNull(body?.cupomPedidoMinimo);
    d.cupomLimiteUso = numOrNull(body?.cupomLimiteUso);
    d.cupomSoNovosClientes = body?.cupomSoNovosClientes == null ? null : !!body.cupomSoNovosClientes;
  }
  return { data: d };
}

app.get('/api/grupo-vip/mensagens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json({ mensagens: await prisma.grupoVipMensagem.findMany({ orderBy: { criadoEm: 'desc' } }) }); }
  catch (err) { console.error('[grupo-vip/mensagens GET]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.post('/api/grupo-vip/mensagens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const n = normalizarMensagemVip(req.body);
    if (n.error) return res.status(400).json({ error: n.error });
    const m = await prisma.grupoVipMensagem.create({ data: n.data });
    res.status(201).json({ id: m.id });
  } catch (err) { console.error('[grupo-vip/mensagens POST]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});

app.put('/api/grupo-vip/mensagens/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.grupoVipMensagem.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    const n = normalizarMensagemVip(req.body);
    if (n.error) return res.status(400).json({ error: n.error });
    // full-replace dos campos de cupom: zera os que não vieram no modo atual
    const zeraCupom = { cupomTipo: null, cupomValor: null, cupomNome: null, cupomCodigoFixo: null, cupomValidadeHoras: null, cupomPedidoMinimo: null, cupomLimiteUso: null, cupomSoNovosClientes: null };
    await prisma.grupoVipMensagem.update({ where: { id }, data: { ...zeraCupom, ...n.data } });
    res.json({ ok: true });
  } catch (err) { console.error('[grupo-vip/mensagens PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});

app.delete('/api/grupo-vip/mensagens/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.grupoVipMensagem.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    await prisma.grupoVipMensagem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[grupo-vip/mensagens DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

app.get('/api/grupo-vip/historico', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const rows = await prisma.grupoVipDisparo.findMany({ orderBy: { criadoEm: 'desc' }, take: 100 });
    const ms = new Map((await prisma.grupoVipMensagem.findMany({ select: { id: true, rotulo: true } })).map((m) => [m.id, m.rotulo]));
    res.json({ historico: rows.map((d) => ({ id: d.id, rotulo: ms.get(d.mensagemId) || '—', status: d.status, cupomCode: d.cupomCode || null, erro: d.erro || null, criadoEm: d.criadoEm })) });
  } catch (err) { console.error('[grupo-vip/historico]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});
```

- [ ] **Step 2: Verificar**

Run: `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(grupo-vip): CRUD de mensagens + histórico de disparos"
git push origin main
```

---

### Task 8: Agendador `varrerGrupoVip` (disparo + cupom, dedup, best-effort)

**Files:**
- Modify: `backend/server.js` (função nova + start no `app.listen`)

**Interfaces:**
- Consumes: `mensagensParaDisparar`, `montarPayloadCupom` (Task 3), `criarCupomCW`, `gerarCodigoCupom` (Task 4), `zapiEnviarTexto` (Task 2), `brFields`/`brToUtcMs`, `textoErro`, `prisma.*`.

- [ ] **Step 1: Importar os módulos**

No topo do `backend/server.js`:
```js
import { mensagensParaDisparar, montarPayloadCupom } from './grupoVip.js';
import { criarCupomCW, gerarCodigoCupom } from './cardapioCupom.js';
```

- [ ] **Step 2: Adicionar o disparo por loja + a varredura + o start**

Perto do agendador de lembretes (`iniciarAgendadorLembretes`, ~linha 2620). `empresaId` explícito (fora do tenantStore). `dataRef` = 00:00 BR de hoje.
```js
// Dispara as mensagens VIP que vencem AGORA numa loja. FORA do tenantStore (empresaId
// explícito). Dedup: cria GrupoVipDisparo (unique) ANTES de enviar — P2002 ⇒ já foi hoje.
async function dispararGrupoVipLoja(empresaId, cfg) {
  try {
    if (!cfg.ativo || !cfg.grupoJid || !cfg.instanceToken) return;
    const agoraMs = Date.now();
    const f = brFields(agoraMs);
    const dataRef = new Date(brToUtcMs(f.y, f.mo, f.day, 0, 0));
    const mensagens = await prisma.grupoVipMensagem.findMany({ where: { empresaId, ativa: true } });
    const jaHoje = await prisma.grupoVipDisparo.findMany({ where: { empresaId, dataRef }, select: { mensagemId: true } });
    const jaSet = new Set(jaHoje.map((d) => d.mensagemId));
    const aDisparar = mensagensParaDisparar(agoraMs, mensagens, jaSet);
    for (const m of aDisparar) {
      // marcador de dedup ANTES de enviar
      try { await prisma.grupoVipDisparo.create({ data: { empresaId, mensagemId: m.id, dataRef, status: 'ENVIADO' } }); }
      catch (e) { if (e?.code === 'P2002') continue; throw e; }
      let cupomCode = null, erroCupom = null;
      try {
        if (m.cupomModo === 'FIXO' && m.cupomCodigoFixo) cupomCode = m.cupomCodigoFixo;
        else if (m.cupomModo === 'NOVO_POR_DISPARO') {
          const codigo = gerarCodigoCupom();
          const payload = montarPayloadCupom(m, agoraMs, codigo);
          if (payload) {
            const r = await criarCupomCW(cfg.hubClienteId, payload);
            if (r?.conectado === false) erroCupom = 'Loja sem Cardápio Web vinculado';
            else cupomCode = r?.coupon?.code || codigo;
          }
        }
      } catch (e) { erroCupom = textoErro(e).slice(0, 200); }
      const texto = String(m.texto).split('{cupom}').join(cupomCode || '');
      let status = 'ENVIADO', erroEnvio = null;
      try { await zapiEnviarTexto(cfg.grupoJid, texto, cfg.instanceToken); }
      catch (e) { status = 'FALHOU'; erroEnvio = textoErro(e).slice(0, 200); }
      const erro = [erroEnvio, erroCupom].filter(Boolean).join(' · ') || null;
      await prisma.grupoVipDisparo.updateMany({ where: { empresaId, mensagemId: m.id, dataRef }, data: { status, erro, cupomCode, conteudo: texto.slice(0, 1000) } });
    }
  } catch (e) { console.error('[dispararGrupoVipLoja]', empresaId, textoErro(e)); }
}

async function varrerGrupoVip() {
  const cfgs = await prisma.grupoVipConfig.findMany({ where: { ativo: true } });
  for (const cfg of cfgs) {
    try { await dispararGrupoVipLoja(cfg.empresaId, cfg); }
    catch (e) { console.error('[varrerGrupoVip]', cfg.empresaId, e?.message || e); }
  }
}

function iniciarAgendadorGrupoVip() {
  setInterval(() => { varrerGrupoVip().catch((e) => console.error('[grupo-vip]', e)); }, 60 * 1000);
}
```

- [ ] **Step 3: Ligar o agendador no start**

Perto de `iniciarAgendadorLembretes();` (~linha 8724), adicionar:
```js
iniciarAgendadorGrupoVip();
```

- [ ] **Step 4: Verificar**

Run: `node --check backend/server.js && node backend/grupoVip.test.js`
Expected: sem erro; `14 ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat(grupo-vip): agendador de disparos (mensagem + cupom, dedup, best-effort)"
git push origin main
```

---

### Task 9: Frontend — Automações vira grupo + página GrupoVip (conexão)

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/pages/GrupoVip.jsx`

**Interfaces:**
- Consumes: `GET/PUT /api/grupo-vip/config`, `POST /api/grupo-vip/instancia`, `GET /api/grupo-vip/qr`, `GET /api/grupo-vip/status`, `GET /api/grupo-vip/grupos` (Task 6).

- [ ] **Step 1: Sidebar — Automações vira grupo**

Em `frontend/src/components/Sidebar.jsx`, trocar o item solto de Automações:
```js
  { label: 'Automações', icon: 'gestao', to: '/automacoes', area: 'automacoes' },
```
por um grupo com o subitem:
```js
  {
    label: 'Automações', icon: 'gestao', area: 'automacoes',
    itens: [
      { to: '/automacoes/grupo-vip', label: 'Grupo VIP', icon: 'marketing' },
    ]
  },
```

- [ ] **Step 2: Rota**

Em `frontend/src/App.jsx`, importar e adicionar a rota (perto da rota `automacoes`):
```js
import GrupoVip from './pages/GrupoVip'
```
```jsx
            <Route path="automacoes/grupo-vip" element={<GrupoVip />} />
```
(Manter a `automacoes` antiga do EmConstrucao ou trocá-la — pode deixar as duas.)

- [ ] **Step 3: Página `GrupoVip` (bloco de conexão)**

`frontend/src/pages/GrupoVip.jsx`:
```jsx
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

export default function GrupoVip() {
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null) // {connected, number}
  const [qr, setQr] = useState(null)
  const [conectando, setConectando] = useState(false)
  const [grupos, setGrupos] = useState([])
  const [jidManual, setJidManual] = useState('')
  const [hubId, setHubId] = useState('')

  const carregar = useCallback(() => {
    api.get('/grupo-vip/config').then((r) => { setCfg(r.data); setHubId(r.data.hubClienteId || '') }).catch(() => {})
    api.get('/grupo-vip/status').then((r) => setStatus(r.data)).catch(() => setStatus({ connected: false }))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Poll de status enquanto o QR está aberto
  useEffect(() => {
    if (!conectando) return
    const t = setInterval(() => {
      api.get('/grupo-vip/status').then((r) => { setStatus(r.data); if (r.data?.connected) { setConectando(false); setQr(null); notify('WhatsApp conectado!'); carregarGrupos() } }).catch(() => {})
      api.get('/grupo-vip/qr').then((r) => r.data?.qr && setQr(r.data.qr)).catch(() => {})
    }, 3000)
    return () => clearInterval(t)
  }, [conectando]) // eslint-disable-line react-hooks/exhaustive-deps

  async function conectar() {
    setConectando(true); setQr(null)
    try { await api.post('/grupo-vip/instancia'); const r = await api.get('/grupo-vip/qr'); setQr(r.data?.qr || null) }
    catch (e) { setConectando(false); notify(e?.response?.data?.error ?? 'Não foi possível iniciar a conexão.', 'error') }
  }
  async function carregarGrupos() {
    try { const r = await api.get('/grupo-vip/grupos'); setGrupos(r.data.grupos || []) } catch { setGrupos([]) }
  }
  async function salvarGrupo(jid, nome) {
    try { const r = await api.put('/grupo-vip/config', { grupoJid: jid, grupoNome: nome || null }); setCfg(r.data); notify('Grupo salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar o grupo.', 'error') }
  }
  async function salvarConfig(patch) {
    try { const r = await api.put('/grupo-vip/config', patch); setCfg(r.data); notify('Salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
  }

  if (!cfg) return <div className="loading-state">Carregando…</div>
  const conectado = status?.connected

  return (
    <div>
      <div className="page-header"><div><h1>Grupo VIP</h1><div className="page-header-sub">Disparos agendados no seu grupo VIP do WhatsApp + cupom do Cardápio Web.</div></div></div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* Conexão */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <strong>Número do WhatsApp</strong>
            <div style={{ fontSize: 13, color: 'var(--app-text-3)' }}>{conectado ? `Conectado${status?.number ? ` · ${status.number}` : ''}` : 'Não conectado'}</div>
          </div>
          {!conectado && <button type="button" className="btn btn-primary" onClick={conectar} disabled={conectando}>{conectando ? 'Aguardando leitura…' : 'Conectar por QR'}</button>}
        </div>
        {conectando && qr && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <img src={qr} alt="QR" style={{ width: 240, height: 240 }} />
            <div style={{ fontSize: 12.5, color: 'var(--app-text-3)', marginTop: 6 }}>Abra o WhatsApp do número dedicado › Aparelhos conectados › Conectar um aparelho.</div>
          </div>
        )}
      </div>

      {/* Grupo + config (só quando conectado) */}
      {conectado && (
        <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Grupo VIP</div>
          <div style={{ fontSize: 13, color: 'var(--app-text-3)', marginBottom: 10 }}>Grupo atual: <strong>{cfg.grupoNome || cfg.grupoJid || 'nenhum'}</strong></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={carregarGrupos}>Listar grupos</button>
          </div>
          {grupos.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              {grupos.map((g) => <button key={g.jid} type="button" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => salvarGrupo(g.jid, g.nome)}>{g.nome || g.jid}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="…ou cole o ID do grupo (…@g.us)" value={jidManual} onChange={(e) => setJidManual(e.target.value)} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => jidManual.trim() && salvarGrupo(jidManual.trim(), null)}>Usar este</button>
          </div>

          <div style={{ marginTop: 16, borderTop: '1px solid var(--app-border)', paddingTop: 14 }}>
            <label className="form-label">ID da loja no HUB (Cardápio Web) — para os cupons</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} value={hubId} onChange={(e) => setHubId(e.target.value)} placeholder="clienteId no HUB" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => salvarConfig({ hubClienteId: hubId.trim() })}>Salvar</button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => salvarConfig({ ativo: !cfg.ativo })}>{cfg.ativo ? 'Desativar Grupo VIP' : 'Ativar Grupo VIP'}</button>
            <span style={{ fontSize: 13, color: cfg.ativo ? 'var(--money, #0F8A54)' : 'var(--app-text-3)' }}>{cfg.ativo ? 'Ativo — disparos agendados rodando' : 'Inativo — nada é disparado'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/App.jsx frontend/src/pages/GrupoVip.jsx
git commit -m "feat(grupo-vip): Automações vira grupo + página GrupoVip (conexão/QR/grupo)"
git push origin main
```

---

### Task 10: Frontend — mensagens VIP (CRUD + cupom) + histórico

**Files:**
- Modify: `frontend/src/pages/GrupoVip.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/grupo-vip/mensagens`, `GET /api/grupo-vip/historico` (Task 7).

- [ ] **Step 1: Adicionar estado + carregamento**

No componente `GrupoVip`, adicionar estado e carregar mensagens/histórico (junto do `carregar` existente):
```jsx
  const [mensagens, setMensagens] = useState([])
  const [historico, setHistorico] = useState([])
  const [modal, setModal] = useState(null) // mensagem em edição/criação
  const [excluir, setExcluir] = useState(null)
  const carregarMsgs = useCallback(() => {
    api.get('/grupo-vip/mensagens').then((r) => setMensagens(r.data.mensagens || [])).catch(() => {})
    api.get('/grupo-vip/historico').then((r) => setHistorico(r.data.historico || [])).catch(() => {})
  }, [])
  useEffect(() => { carregarMsgs() }, [carregarMsgs])
```

- [ ] **Step 2: Helpers + handlers (dentro do componente)**

```jsx
  const DIAS = [['Dom', 0], ['Seg', 1], ['Ter', 2], ['Qua', 3], ['Qui', 4], ['Sex', 5], ['Sáb', 6]]
  const CUPOM_TIPOS = [['PERCENT_DISCOUNT', '% de desconto'], ['FLAT_DISCOUNT', 'R$ de desconto'], ['FREE_SHIPPING', 'Frete grátis']]
  const fmtDiasHorario = (m) => `${m.diasSemana.map((d) => DIAS.find(([, n]) => n === d)?.[0]).join(', ')} · ${m.horario}`
  const novaMsg = () => setModal({ rotulo: '', texto: '', diasSemana: [], horario: '18:00', ativa: true, cupomModo: 'NENHUM', cupomTipo: 'PERCENT_DISCOUNT', cupomValor: '', cupomNome: '', cupomCodigoFixo: '', cupomValidadeHoras: '', cupomPedidoMinimo: '', cupomLimiteUso: '', cupomSoNovosClientes: false })
  const editarMsg = (m) => setModal({ ...m, cupomValor: m.cupomValor ?? '', cupomValidadeHoras: m.cupomValidadeHoras ?? '', cupomPedidoMinimo: m.cupomPedidoMinimo ?? '', cupomLimiteUso: m.cupomLimiteUso ?? '', cupomNome: m.cupomNome ?? '', cupomCodigoFixo: m.cupomCodigoFixo ?? '', cupomTipo: m.cupomTipo || 'PERCENT_DISCOUNT', cupomSoNovosClientes: !!m.cupomSoNovosClientes })
  const updM = (k, v) => setModal((m) => ({ ...m, [k]: v }))
  const toggleDia = (n) => setModal((m) => ({ ...m, diasSemana: m.diasSemana.includes(n) ? m.diasSemana.filter((x) => x !== n) : [...m.diasSemana, n] }))
  async function salvarMsg() {
    try {
      if (modal.id) await api.put(`/grupo-vip/mensagens/${modal.id}`, modal)
      else await api.post('/grupo-vip/mensagens', modal)
      notify('Mensagem salva.'); setModal(null); carregarMsgs()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
  }
  async function confirmarExcluirMsg() {
    try { await api.delete(`/grupo-vip/mensagens/${excluir.id}`); notify('Removida.'); setExcluir(null); carregarMsgs() }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao excluir.', 'error') }
  }
```

- [ ] **Step 3: Render — lista de mensagens + histórico + modal**

Inserir ANTES do fechamento `</div>` do componente (depois do bloco de conexão). Importar `ConfirmDialog` no topo (`import ConfirmDialog from '../components/ConfirmDialog'`):
```jsx
      {conectado && (
        <>
          <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>Mensagens</strong>
              <button type="button" className="btn btn-primary btn-sm" onClick={novaMsg}>+ Nova mensagem</button>
            </div>
            {mensagens.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>Nenhuma mensagem ainda.</div> : (
              <table className="hb-table"><tbody>
                {mensagens.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.rotulo}</strong>{!m.ativa && <span className="badge badge-gray" style={{ marginLeft: 8 }}>Inativa</span>}<div style={{ fontSize: 12, color: 'var(--app-text-3)' }}>{fmtDiasHorario(m)}{m.cupomModo !== 'NENHUM' && ' · com cupom'}</div></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => editarMsg(m)}>Editar</button>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => setExcluir(m)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div className="table-card" style={{ padding: 16 }}>
            <strong>Histórico de disparos</strong>
            {historico.length === 0 ? <div className="empty-state" style={{ padding: 16 }}>Nada disparado ainda.</div> : (
              <table className="hb-table"><thead><tr><th>Quando</th><th>Mensagem</th><th>Status</th><th>Cupom</th></tr></thead><tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{h.rotulo}</td>
                    <td>{h.status === 'ENVIADO' ? '✓ Enviado' : '✕ Falhou'}{h.erro && <div style={{ fontSize: 11, color: '#dc2626' }}>{h.erro}</div>}</td>
                    <td>{h.cupomCode || '—'}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </>
      )}

      {modal && (
        <div className="modal-overlay"><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-title">{modal.id ? 'Editar mensagem' : 'Nova mensagem'}</div>
          <div className="form-group"><label className="form-label">Rótulo</label><input className="form-input" value={modal.rotulo} onChange={(e) => updM('rotulo', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Texto (use <code>{'{cupom}'}</code> para inserir o código)</label><textarea className="form-input" rows={4} value={modal.texto} onChange={(e) => updM('texto', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Dias</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DIAS.map(([lbl, n]) => <button key={n} type="button" className={'btn btn-sm ' + (modal.diasSemana.includes(n) ? 'btn-primary' : 'btn-secondary')} onClick={() => toggleDia(n)}>{lbl}</button>)}</div></div>
          <div className="form-group"><label className="form-label">Horário</label><input type="time" className="form-input" style={{ maxWidth: 140 }} value={modal.horario} onChange={(e) => updM('horario', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Ativa</label><input type="checkbox" checked={modal.ativa} onChange={(e) => updM('ativa', e.target.checked)} /></div>

          <div className="form-group"><label className="form-label">Cupom</label>
            <select className="form-input" value={modal.cupomModo} onChange={(e) => updM('cupomModo', e.target.value)}>
              <option value="NENHUM">Sem cupom</option>
              <option value="NOVO_POR_DISPARO">Criar um cupom novo a cada disparo</option>
              <option value="FIXO">Usar um código fixo já existente</option>
            </select>
          </div>
          {modal.cupomModo === 'FIXO' && (
            <div className="form-group"><label className="form-label">Código do cupom</label><input className="form-input" value={modal.cupomCodigoFixo} onChange={(e) => updM('cupomCodigoFixo', e.target.value)} placeholder="Ex.: TERCAEMDOBRO" /></div>
          )}
          {modal.cupomModo === 'NOVO_POR_DISPARO' && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Tipo</label><select className="form-input" value={modal.cupomTipo} onChange={(e) => updM('cupomTipo', e.target.value)}>{CUPOM_TIPOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                {modal.cupomTipo !== 'FREE_SHIPPING' && <div className="form-group" style={{ flex: 1 }}><label className="form-label">Valor</label><input type="number" className="form-input" value={modal.cupomValor} onChange={(e) => updM('cupomValor', e.target.value)} /></div>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Vale por (horas)</label><input type="number" className="form-input" value={modal.cupomValidadeHoras} onChange={(e) => updM('cupomValidadeHoras', e.target.value)} placeholder="ex.: 6" /></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Pedido mínimo (R$)</label><input type="number" className="form-input" value={modal.cupomPedidoMinimo} onChange={(e) => updM('cupomPedidoMinimo', e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Limite de usos</label><input type="number" className="form-input" value={modal.cupomLimiteUso} onChange={(e) => updM('cupomLimiteUso', e.target.value)} /></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label"><input type="checkbox" checked={modal.cupomSoNovosClientes} onChange={(e) => updM('cupomSoNovosClientes', e.target.checked)} /> Só novos clientes</label></div>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={salvarMsg}>Salvar</button>
          </div>
        </div></div>
      )}

      <ConfirmDialog open={!!excluir} title="Excluir mensagem" message={excluir ? `Excluir "${excluir.rotulo}"?` : ''} confirmLabel="Excluir" cancelLabel="Cancelar" variant="danger" onConfirm={confirmarExcluirMsg} onCancel={() => setExcluir(null)} />
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GrupoVip.jsx
git commit -m "feat(grupo-vip): mensagens VIP (CRUD + cupom) + histórico na página"
git push origin main
```

---

## Verificação final (após todas as tasks)

```bash
node backend/grupoVip.test.js      # 14 ok
node --check backend/server.js     # sem erro
cd frontend && npm run build       # ✓ built
```

Deploy PDV: `cd /var/www/nachapa-pdv && git pull && bash deploy.sh` (migrate deploy do grupo_vip). Configurar `HUB_API_URL` no `.env` de prod + `UAZAPI_ADMIN_TOKEN` (para criar a instância). **Deploy HUB:** subir o ajuste do `svc:'pdv-operacao'` (Task 5) no repo Traffic Hub. Smoke e2e: conectar número por QR → escolher grupo → colar o `hubClienteId` → ativar → criar mensagem (Ter 18:00, cupom % 20, vale 6h) → aguardar/forçar o disparo → conferir mensagem no grupo + cupom no CW + histórico.
