# Grupo VIP — Rastreio de retorno + Visão Geral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Rastrear quanto retorno (pedidos/receita) cada mensagem do Grupo VIP gera, cruzando o `?s=` do link do Cardápio Web (CW) colado na mensagem com o `customer_origin` dos pedidos, numa aba "Visão Geral" com 4 KPIs.

**Architecture:** O HUB (dono dos pedidos do CW) passa a **capturar `customer_origin`** no sync + expõe um endpoint-ponte de agregados por origem (`svc:'pdv-operacao'`). O PDV **extrai o `?s=` do texto** das mensagens, chama a ponte e monta os KPIs numa aba nova. Só leitura no CW; best-effort (sem HUB/loja vinculada, a aba não quebra).

**Tech Stack:** HUB = Express CommonJS (`Traffic Hub/backend`), Prisma, Postgres `traffichub`. PDV = Express 5 ESM (`nachapa-pdv/backend`), Prisma 7, Postgres `operacao`. React 19 + Vite. Testes: `node` sem framework.

## Global Constraints

- **Dois repos:** Tasks 1-3 no **HUB** (`C:\Users\Windows\Traffic Hub`) — **commit SEM push** (o usuário decide o deploy do HUB). Tasks 4-7 no **PDV** (`C:\Users\Windows\nachapa-pdv`) — commit direto na `main` + `git push origin main`.
- **Fuso BR fixo (UTC-3)** no PDV via `brFields`/`brToUtcMs`.
- **Multi-tenant PDV:** rotas admin no gate (`exigirAdmin` → extension injeta `empresaId`). NUNCA `req.user.empresaId`.
- **Ponte CW = só leitura** (GET). Auth Bearer JWT `svc:'pdv-operacao'` (mesmo trilho do `/api/internal/cardapio-cupom`).
- **Best-effort:** sem `hubClienteId`, ou HUB em 403/erro → a Visão Geral mostra os KPIs locais (Mensagens Enviadas) e zera Conversões/Receita, sem quebrar.
- **STATUS de venda:** usar a MESMA lista `STATUS_VENDA_CARDAPIO` do HUB (server.js ~9718) para bater com o painel do CW.
- **Armadilha migrate dev com drift (nos DOIS bancos):** ao gerar migration, ABRA o SQL e confirme que contém APENAS a mudança da task; remova `DROP`/`ALTER` de outras tabelas; acerte o checksum do dev (`sha256sum` + `UPDATE "_prisma_migrations" SET checksum=...` via `prisma db execute --stdin`); `migrate status` deve ficar verde.
- **Subagentes: NUNCA `taskkill /IM node.exe`.** Matar só o próprio job (`kill %1`).

---

### Task 1: HUB — coluna `customerOrigin` + captura no sync

**Repo:** `C:\Users\Windows\Traffic Hub` (commit SEM push).

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `PedidoCardapio`, ~linha 409)
- Modify: `backend/cardapioPedidosSync.js` (objeto `dados` em `upsertPedido`, ~linha 93)
- Create: `backend/prisma/migrations/<ts>_pedido_customer_origin/migration.sql`

**Interfaces:**
- Produces: `prisma.pedidoCardapio.customerOrigin` (String?), populado pelo sync a partir de `d.customer_origin`.

- [ ] **Step 1: Adicionar a coluna no schema**

Em `backend/prisma/schema.prisma`, no model `PedidoCardapio`, após a linha `orderType String?` (~418), adicionar:
```prisma
  customerOrigin String?  // origem do pedido no CW (customer_origin) = o ?s= do link
```

- [ ] **Step 2: Capturar no upsertPedido**

Em `backend/cardapioPedidosSync.js`, no objeto `dados` (~linha 93-103), adicionar a chave (junto de `orderType`):
```js
    orderType: d.order_type ?? null,
    customerOrigin: d.customer_origin ?? null,
```
(As demais chaves do objeto `dados` ficam iguais.)

- [ ] **Step 3: Gerar a migration**

Run (em `backend/`):
```bash
npx prisma migrate dev --name pedido_customer_origin
```
**⚠️ DRIFT:** o banco dev do HUB tem drift. ABRA `backend/prisma/migrations/<ts>_pedido_customer_origin/migration.sql` e confirme que contém APENAS:
```sql
ALTER TABLE "PedidoCardapio" ADD COLUMN "customerOrigin" TEXT;
```
Se houver QUALQUER `DROP`/`ALTER` de outra tabela, remova essas linhas à mão e acerte o checksum do dev:
```bash
FILE="prisma/migrations/<ts>_pedido_customer_origin/migration.sql"
SUM=$(sha256sum "$FILE" | cut -d' ' -f1)
printf 'UPDATE "_prisma_migrations" SET checksum = '"'"'%s'"'"' WHERE migration_name = '"'"'<ts>_pedido_customer_origin'"'"';\n' "$SUM" | npx prisma db execute --stdin
npx prisma migrate status   # up to date
```

- [ ] **Step 4: Verificar**

Run: `node --check backend/cardapioPedidosSync.js && (cd backend && npx prisma validate)`
Expected: sem erro; schema válido.

- [ ] **Step 5: Commit (SEM push)**

```bash
cd "/c/Users/Windows/Traffic Hub" && git add backend/prisma/schema.prisma backend/cardapioPedidosSync.js backend/prisma/migrations
git commit -m "feat(cardapio): captura customer_origin do pedido (coluna + sync)"
```
NÃO faça `git push`.

---

### Task 2: HUB — endpoint-ponte `GET /api/internal/cardapio-origens`

**Repo:** `C:\Users\Windows\Traffic Hub` (commit SEM push).

**Files:**
- Modify: `backend/server.js` (novo endpoint perto do `/api/internal/cardapio-cupom`, ~linha 9880)

**Interfaces:**
- Consumes: `prisma.pedidoCardapio` (Task 1), `STATUS_VENDA_CARDAPIO` (server.js ~9718), `jwt`, `JWT_SECRET`.
- Produces: `GET /api/internal/cardapio-origens?clienteId=&inicio=&fim=` → `{ origens: [{ origem, pedidos, receita }] }`.

- [ ] **Step 1: Adicionar o endpoint**

Inserir logo após o endpoint `app.post('/api/internal/cardapio-cupom', ...)` (que termina ~9880). O bloco de auth espelha o do cupom (Bearer `svc`; aceita `pdv-operacao` — já ajustado na Task 5 do Grupo VIP):
```js
// Ponte de leitura: agregados de pedidos por ORIGEM (customer_origin) de uma loja no
// período — usado pelo PDV (Grupo VIP › Visão Geral). JWT de serviço svc:'pdv-operacao'.
app.get('/api/internal/cardapio-origens', async (req, res) => {
  const auth = req.headers.authorization || '';
  const svcToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!svcToken) return res.status(401).json({ error: 'Token de serviço ausente' });
  let svcPayload;
  try { svcPayload = jwt.verify(svcToken, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Token de serviço inválido' }); }
  if (!['h360-dashboard', 'pdv-operacao'].includes(svcPayload.svc)) return res.status(403).json({ error: 'Token não autorizado' });

  const clienteId = req.query?.clienteId ? String(req.query.clienteId).trim() : null;
  if (!clienteId) return res.status(400).json({ error: 'clienteId é obrigatório' });
  const inicio = req.query?.inicio ? new Date(String(req.query.inicio)) : null;
  const fim = req.query?.fim ? new Date(String(req.query.fim)) : null;
  if (!inicio || !fim || isNaN(inicio.getTime()) || isNaN(fim.getTime())) return res.status(400).json({ error: 'inicio e fim (ISO) são obrigatórios' });
  try {
    const grupos = await prisma.pedidoCardapio.groupBy({
      by: ['customerOrigin'],
      where: { clienteId, status: { in: STATUS_VENDA_CARDAPIO }, createdAtCW: { gte: inicio, lte: fim }, customerOrigin: { not: null } },
      _count: { _all: true },
      _sum: { total: true },
    });
    const origens = grupos.map((g) => ({ origem: g.customerOrigin, pedidos: g._count._all, receita: g._sum.total || 0 }));
    res.json({ origens });
  } catch (err) { console.error('[internal/cardapio-origens]', err); res.status(500).json({ error: 'Erro ao agregar origens.' }); }
});
```

- [ ] **Step 2: Verificar**

Run (na pasta do HUB): `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 3: Commit (SEM push)**

```bash
cd "/c/Users/Windows/Traffic Hub" && git add backend/server.js
git commit -m "feat(cardapio): endpoint interno de agregados por origem (svc pdv-operacao)"
```
NÃO faça `git push`.

---

### Task 3: HUB — backfill de 6 meses do `customerOrigin`

**Repo:** `C:\Users\Windows\Traffic Hub` (commit SEM push).

**Files:**
- Modify: `backend/cardapioPedidosSync.js` (exportar `backfillOrigem`)
- Create: `backend/tools/backfill-customer-origin.js` (script pontual)

**Interfaces:**
- Consumes: `processarJanela` (interno do módulo, força re-fetch do detalhe → `upsertPedido` grava `customerOrigin`).
- Produces: `backfillOrigem(cliente, desde)`; script `node backend/tools/backfill-customer-origin.js <clienteId>`.

- [ ] **Step 1: Exportar `backfillOrigem` no módulo**

Em `backend/cardapioPedidosSync.js`, antes do `module.exports`, adicionar a função (usa o `processarJanela` interno com `force=true`, que re-baixa o detalhe de todo pedido do histórico da janela → popula `customerOrigin`):
```js
// Backfill pontual: re-processa (force) o histórico dos últimos `desde`→agora, para
// popular o customerOrigin dos pedidos já persistidos. Respeita os throttles do sync.
async function backfillOrigem(cliente, desde) {
  return processarJanela(cliente, desde, new Date(), ['closed', 'canceled'], true);
}
```
E incluir `backfillOrigem` no `module.exports`:
```js
module.exports = { init, syncIncremental, iniciarBackfill, syncIncrementalTodos, ensureState, backfillOrigem };
```

- [ ] **Step 2: Criar o script pontual**

`backend/tools/backfill-customer-origin.js` — monta as deps igual o server.js e roda o backfill de 6 meses para o cliente informado (ou todos com CW se sem argumento):
```js
// Uso: node backend/tools/backfill-customer-origin.js [clienteId]
// Re-lê os pedidos dos últimos 6 meses (force) para preencher customerOrigin.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const sync = require('../cardapioPedidosSync');

const prisma = new PrismaClient();
const BASE_URL = (process.env.CARDAPIOWEB_BASE_URL || 'https://integracao.cardapioweb.com').replace(/\/$/, '');
const cwHeaders = (cliente) => ({ 'X-API-KEY': cliente.cardapioWebApiKey, 'X-PARTNER-KEY': process.env.CARDAPIOWEB_PARTNER_KEY || '' });

(async () => {
  sync.init({ prisma, axios, baseUrl: BASE_URL, cwHeaders });
  const desde = new Date(Date.now() - 183 * 24 * 3600 * 1000); // ~6 meses
  const arg = process.argv[2] ? String(process.argv[2]) : null;
  const clientes = await prisma.cliente.findMany({
    where: arg ? { id: arg } : { cardapioWebApiKey: { not: null } },
    select: { id: true, empresaId: true, cardapioWebApiKey: true },
  });
  for (const c of clientes) {
    if (!c.cardapioWebApiKey) { console.log('pulando (sem CW):', c.id); continue; }
    process.stdout.write(`backfill origem cliente ${c.id}... `);
    try { const r = await sync.backfillOrigem(c, desde); console.log('ok', JSON.stringify(r)); }
    catch (e) { console.log('ERRO', e?.message || e); }
  }
  await prisma.$disconnect();
  process.exit(0);
})();
```

- [ ] **Step 3: Verificar (sintaxe; NÃO rodar contra a prod agora)**

Run: `node --check backend/cardapioPedidosSync.js && node --check backend/tools/backfill-customer-origin.js`
Expected: sem erro. (O script roda de verdade só no deploy, com as chaves de prod.)

- [ ] **Step 4: Commit (SEM push)**

```bash
cd "/c/Users/Windows/Traffic Hub" && git add backend/cardapioPedidosSync.js backend/tools/backfill-customer-origin.js
git commit -m "feat(cardapio): backfill de customer_origin (6 meses, script pontual)"
```
NÃO faça `git push`.
> Deploy do HUB (fora do plano): subir Tasks 1-3 + `migrate deploy` + `node backend/tools/backfill-customer-origin.js <clienteId-da-loja>` uma vez.

---

### Task 4: PDV — helper puro `extrairOrigem` + testes (TDD)

**Repo:** `C:\Users\Windows\nachapa-pdv` (commit + push).

**Files:**
- Create: `backend/grupoVipOrigem.js`
- Create: `backend/grupoVipOrigem.test.js`

**Interfaces:**
- Produces: `extrairOrigem(texto)` → string (valor do param `s` da 1ª URL do texto) ou `null`.

- [ ] **Step 1: Escrever o teste que falha**

`backend/grupoVipOrigem.test.js`:
```js
import { extrairOrigem } from './grupoVipOrigem.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

t('link com ?s= devolve o valor', extrairOrigem('Peça em https://loja.com.br/x?s=vip1 agora'), 'vip1');
t('sem link devolve null', extrairOrigem('Toda terça em dobro!'), null);
t('link sem s devolve null', extrairOrigem('https://loja.com.br/x?a=1'), null);
t('s no meio de outros params', extrairOrigem('https://loja.com.br/x?a=1&s=vip2&b=3'), 'vip2');
t('primeira url com s', extrairOrigem('veja https://site.com/y?s=abc e https://loja.com/z?s=def'), 'abc');
t('texto vazio', extrairOrigem(''), null);
t('null', extrairOrigem(null), null);
t('s vazio devolve null', extrairOrigem('https://loja.com.br/x?s='), null);
t('tira pontuação final', extrairOrigem('peça: https://loja.com.br/x?s=vip3.'), 'vip3');

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node backend/grupoVipOrigem.test.js`
Expected: FALHA — `Cannot find module './grupoVipOrigem.js'`.

- [ ] **Step 3: Implementar o módulo**

`backend/grupoVipOrigem.js`:
```js
// Extrai o identificador de origem (param `s`) da 1ª URL de um texto de mensagem.
// Ex.: "...peça em https://loja.com.br/x?s=vip1" → "vip1". Sem link/param → null.
// É o valor que o Cardápio Web grava como customer_origin do pedido.
export function extrairOrigem(texto) {
  const s = String(texto || '');
  const urls = s.match(/https?:\/\/[^\s]+/gi) || [];
  for (const bruto of urls) {
    const u = bruto.replace(/[.,;:!?)\]}'"]+$/, ''); // tira pontuação colada no fim
    let val = null;
    try { val = new URL(u).searchParams.get('s'); }
    catch { const m = u.match(/[?&]s=([^&#\s]+)/i); val = m ? decodeURIComponent(m[1]) : null; }
    if (val && val.trim()) return val.trim();
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node backend/grupoVipOrigem.test.js`
Expected: `9 ok, 0 falha(s)`.

- [ ] **Step 5: Commit**

```bash
cd ~/nachapa-pdv && git add backend/grupoVipOrigem.js backend/grupoVipOrigem.test.js
git commit -m "feat(grupo-vip): helper puro extrairOrigem (lê o ?s= do link) + testes"
git push origin main
```

---

### Task 5: PDV — ponte `cardapioOrigens.js` (leitura CW via HUB)

**Repo:** `C:\Users\Windows\nachapa-pdv` (commit + push).

**Files:**
- Create: `backend/cardapioOrigens.js`

**Interfaces:**
- Consumes: `HUB_API_URL`, `JWT_SECRET` (env), `jwt`.
- Produces: `buscarOrigensCW(hubClienteId, inicioIso, fimIso)` → `Array<{origem, pedidos, receita}>` (ou `[]`); lança `{http,msg}` em erro de rede/HUB.

- [ ] **Step 1: Criar o módulo (espelha `cardapioCupom.js`)**

`backend/cardapioOrigens.js`:
```js
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
```

- [ ] **Step 2: Verificar**

Run: `node --check backend/cardapioOrigens.js`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
cd ~/nachapa-pdv && git add backend/cardapioOrigens.js
git commit -m "feat(grupo-vip): ponte de leitura de origens do CW (PDV->HUB)"
git push origin main
```

---

### Task 6: PDV — endpoint `GET /api/grupo-vip/visao-geral`

**Repo:** `C:\Users\Windows\nachapa-pdv` (commit + push).

**Files:**
- Modify: `backend/server.js` (imports no topo + endpoint após o bloco de histórico do Grupo VIP)

**Interfaces:**
- Consumes: `extrairOrigem` (Task 4), `buscarOrigensCW` (Task 5), `exigirAdmin`, `garantirGrupoVipConfig`, `brFields`/`brToUtcMs`, `textoErro`, `prisma.grupoVipDisparo`, `prisma.grupoVipMensagem`.
- Produces: `GET /api/grupo-vip/visao-geral?dias=30` → `{ dias, mensagensEnviadas, conversoes, receita, porMensagem: [{rotulo, origem, pedidos, receita}] }`.

- [ ] **Step 1: Adicionar os imports no topo do `backend/server.js`**

Junto dos outros imports de `./`:
```js
import { extrairOrigem } from './grupoVipOrigem.js';
import { buscarOrigensCW } from './cardapioOrigens.js';
```

- [ ] **Step 2: Adicionar o endpoint (após o `GET /api/grupo-vip/historico`)**

```js
// Grupo VIP › Visão Geral: KPIs de retorno por período (cruza o ?s= das mensagens com
// o customer_origin dos pedidos, agregados no HUB). Best-effort com o CW.
app.get('/api/grupo-vip/visao-geral', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const dias = [7, 30, 90].includes(parseInt(req.query?.dias, 10)) ? parseInt(req.query.dias, 10) : 30;
    const fim = new Date();
    const inicio = new Date(fim.getTime() - dias * 24 * 3600 * 1000);
    const mensagensEnviadas = await prisma.grupoVipDisparo.count({ where: { status: 'ENVIADO', criadoEm: { gte: inicio, lte: fim } } });
    const mensagens = await prisma.grupoVipMensagem.findMany();
    const cfg = await garantirGrupoVipConfig();
    let origensCW = [];
    if (cfg.hubClienteId) {
      try { origensCW = await buscarOrigensCW(cfg.hubClienteId, inicio.toISOString(), fim.toISOString()); }
      catch (e) { console.error('[grupo-vip/visao-geral] CW', textoErro(e)); }
    }
    const norm = (s) => String(s || '').trim().toLowerCase();
    const mapaCW = new Map(origensCW.map((o) => [norm(o.origem), o]));
    const porMensagem = [];
    let conversoes = 0, receita = 0;
    const jaContou = new Set(); // não dobra se 2 mensagens usarem a mesma origem
    for (const m of mensagens) {
      const origem = extrairOrigem(m.texto);
      if (!origem) continue;
      const hit = mapaCW.get(norm(origem));
      porMensagem.push({ rotulo: m.rotulo, origem, pedidos: hit ? hit.pedidos : 0, receita: hit ? hit.receita : 0 });
      if (hit && !jaContou.has(norm(origem))) { conversoes += hit.pedidos; receita += hit.receita; jaContou.add(norm(origem)); }
    }
    res.json({ dias, mensagensEnviadas, conversoes, receita, porMensagem });
  } catch (err) { console.error('[grupo-vip/visao-geral]', err); res.status(500).json({ error: 'Erro ao carregar a visão geral.' }); }
});
```
> Nota: `count`/`findMany`/`garantirGrupoVipConfig` rodam DENTRO do gate admin → a extension injeta `empresaId`. `brFields`/`brToUtcMs` não são necessários aqui (janela em ms absolutos serve; o filtro é por `criadoEm`/`createdAtCW` que são timestamps).

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
cd ~/nachapa-pdv && git add backend/server.js
git commit -m "feat(grupo-vip): endpoint /visao-geral (KPIs de retorno por origem)"
git push origin main
```

---

### Task 7: PDV — frontend: abas + aba "Visão Geral"

**Repo:** `C:\Users\Windows\nachapa-pdv` (commit + push).

**Files:**
- Modify: `frontend/src/pages/GrupoVip.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /api/grupo-vip/visao-geral?dias=` (Task 6); `grupoInfo.membros` (já carregado).

- [ ] **Step 1: CSS — abas + KPIs + seletor de período**

Adicionar ao fim de `frontend/src/styles/global.css` (o bloco `.gv-*` já existe; usar os mesmos tokens):
```css
/* Grupo VIP › abas + Visão Geral */
.gv-tabs { display: inline-flex; gap: 4px; background: var(--app-surface-2); border: 1px solid var(--app-border); border-radius: 12px; padding: 4px; margin-bottom: 16px; }
.gv-tab { border: none; background: none; padding: 8px 18px; border-radius: 9px; font-size: 13.5px; font-weight: 600; color: var(--app-text-3); cursor: pointer; }
.gv-tab.on { background: var(--app-surface); color: var(--app-text); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.gv-seg { display: inline-flex; border: 1px solid var(--app-border); border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
.gv-seg button { border: none; border-right: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-text-2); font-size: 12.5px; font-weight: 600; padding: 7px 16px; cursor: pointer; }
.gv-seg button:last-child { border-right: none; }
.gv-seg button.on { background: var(--brand-gold); color: var(--brand-gold-ink); }
.gv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 16px; }
.gv-kpi { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 14px; padding: 16px 18px; }
.gv-kpi-l { font-size: 12.5px; color: var(--app-text-3); font-weight: 600; }
.gv-kpi-n { font-size: 26px; font-weight: 800; color: var(--app-text); margin-top: 6px; line-height: 1; }
```

- [ ] **Step 2: Estado + carregamento no `GrupoVip.jsx`**

Adicionar estado (junto dos outros `useState`, após `hubId`):
```jsx
  const [aba, setAba] = useState('conversas') // 'conversas' | 'visao'
  const [dias, setDias] = useState(30)
  const [visao, setVisao] = useState(null)
```
E carregar a Visão Geral quando a aba estiver ativa / mudar o período (adicionar após o `useEffect` de `carregarMsgs`):
```jsx
  useEffect(() => {
    if (!conectado || aba !== 'visao') return
    setVisao(null)
    api.get(`/grupo-vip/visao-geral?dias=${dias}`).then((r) => setVisao(r.data)).catch(() => setVisao({ mensagensEnviadas: 0, conversoes: 0, receita: 0, porMensagem: [] }))
  }, [conectado, aba, dias]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Render — switch de abas + a aba Visão Geral**

No `return`, logo após o `<Toast .../>`, quando conectado, inserir o switch de abas:
```jsx
      {conectado && (
        <div className="gv-tabs">
          <button type="button" className={'gv-tab' + (aba === 'conversas' ? ' on' : '')} onClick={() => setAba('conversas')}>Conversas</button>
          <button type="button" className={'gv-tab' + (aba === 'visao' ? ' on' : '')} onClick={() => setAba('visao')}>Visão Geral</button>
        </div>
      )}
```
Envolver TODO o conteúdo atual de "conectado" (o `<div className="gv-wa">…`, o card de Configurações e o de Histórico) numa condição `aba === 'conversas'`. Ou seja, trocar `{conectado && (<>` … `</>)}` por `{conectado && aba === 'conversas' && (<>` … `</>)}`.

E adicionar o bloco da Visão Geral logo depois:
```jsx
      {conectado && aba === 'visao' && (
        <>
          <div className="gv-seg">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" className={dias === d ? 'on' : ''} onClick={() => setDias(d)}>{d} dias</button>
            ))}
          </div>
          {!cfg.hubClienteId && (
            <div className="gv-card" style={{ padding: 14 }}>
              <div className="gv-hint" style={{ margin: 0 }}>Para ver Conversões e Receita, vincule o <strong>ID da loja no HUB</strong> nas Configurações (aba Conversas). Sem isso, mostramos só as mensagens enviadas.</div>
            </div>
          )}
          <div className="gv-kpis">
            <div className="gv-kpi"><div className="gv-kpi-l">Mensagens Enviadas</div><div className="gv-kpi-n">{visao ? visao.mensagensEnviadas : '—'}</div></div>
            <div className="gv-kpi"><div className="gv-kpi-l">Conversões</div><div className="gv-kpi-n">{visao ? visao.conversoes : '—'}</div></div>
            <div className="gv-kpi"><div className="gv-kpi-l">Receita Gerada</div><div className="gv-kpi-n">{visao ? `R$ ${Number(visao.receita || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div></div>
            <div className="gv-kpi"><div className="gv-kpi-l">Clientes no Grupo</div><div className="gv-kpi-n">{grupoInfo?.membros > 0 ? grupoInfo.membros : '—'}</div></div>
          </div>
          <div className="gv-card">
            <div className="gv-head"><div className="gv-ic">{I.zap}</div><div><div className="gv-tt">Retorno por mensagem</div><div className="gv-sub">Pedidos e receita atribuídos a cada mensagem (pelo link).</div></div></div>
            <div className="gv-body">
              {!visao || visao.porMensagem.length === 0
                ? <div className="gv-empty">{I.zap}<div>Nenhuma mensagem com link do Cardápio Web ainda. Cole um link com <code>?s=</code> na mensagem para rastrear.</div></div>
                : <div className="table-card" style={{ border: 'none' }}>
                  <table className="hb-table">
                    <thead><tr><th>Mensagem</th><th>Origem</th><th>Pedidos</th><th>Receita</th></tr></thead>
                    <tbody>
                      {visao.porMensagem.map((p, i) => (
                        <tr key={i}>
                          <td>{p.rotulo}</td>
                          <td><span className="gv-chip">{p.origem}</span></td>
                          <td>{p.pedidos}</td>
                          <td>R$ {Number(p.receita || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
            </div>
          </div>
        </>
      )}
```
> `I.zap` (raio) já está definido no objeto `I` do arquivo (chaves: phone/users/zap/clock/check/gear/lock). `.gv-chip`, `.gv-empty`, `.gv-card`, `.hb-table` já existem.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd ~/nachapa-pdv && git add frontend/src/pages/GrupoVip.jsx frontend/src/styles/global.css
git commit -m "feat(grupo-vip): aba Visão Geral (KPIs + retorno por mensagem)"
git push origin main
```

---

## Verificação final (após todas as tasks)

```bash
# PDV
node backend/grupoVipOrigem.test.js   # 9 ok
node --check backend/server.js         # sem erro
cd frontend && npm run build           # ✓ built
# HUB
cd "/c/Users/Windows/Traffic Hub" && node --check backend/server.js && node --check backend/cardapioPedidosSync.js
```

**Deploy:**
- **HUB** (Tasks 1-3, hoje sem push): `git push` no HUB → deploy → `npx prisma migrate deploy` → rodar `node backend/tools/backfill-customer-origin.js <clienteId-da-loja>` UMA vez (popula o histórico). Isso inclui também o commit `996113c` (svc pdv-operacao) que segue local.
- **PDV** (Tasks 4-7): `cd /var/www/nachapa-pdv && git pull && bash deploy.sh` (sem migration) + Ctrl+Shift+R.
- **Validar cedo o formato do `customer_origin`:** criar um identificador no CW, colar o link `?s=vip_teste` numa mensagem, fazer um pedido de teste por esse link, e conferir na Visão Geral se Conversões/Receita sobem (confirma que o `customer_origin` persistido bate com o `?s=`; a comparação já normaliza trim+lowercase).
