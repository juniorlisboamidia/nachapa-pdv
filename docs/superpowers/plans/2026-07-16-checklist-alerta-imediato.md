# Checklist Alerta Imediato (Fatia 3a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando uma execução conclui com um item crítico não-conforme, o PDV dispara um WhatsApp na hora para uma lista de destinatários que o gestor cadastra.

**Architecture:** Reusa a fundação do Checklist. O disparo acontece no `POST .../concluir` (rota de colaborador, FORA do tenantStore), só na transição para CONCLUIDA, best-effort e assíncrono (nunca segura nem quebra o concluir). A mensagem é uma regra pura e testada. Reusa `zapiEnviarTexto` (WhatsApp já existe no PDV). Uma aba Notificações no gestor gerencia o toggle, os destinatários, a prévia e o histórico.

**Tech Stack:** Express 5 ESM (`backend/server.js`), Prisma 7 + adapter-pg, Postgres 16. React 19 + Vite. WhatsApp via `backend/zapi.mjs` (UAZAPI).

**Spec:** `docs/superpowers/specs/2026-07-16-checklist-alerta-imediato-design.md`

## Global Constraints

- **ESM** (`import`/`export`, nunca `require`). Prisma 7 com adapter.
- **Multi-tenant**: models novos entram em `MODELS_TENANT` (`backend/server.js:24`). Endpoints **admin** (`/api/checklist/notificacoes/*`) rodam DENTRO do gate → a extension injeta `empresaId` (filtro manual é erro). O **disparo** roda no fluxo do colaborador (`/api/public/colaborador/...concluir`), **FORA** do tenantStore → **`empresaId` explícito em TODA query**. **Nunca `req.user.empresaId`**.
- **Disparo best-effort e assíncrono**: `dispararAlertaImediato` é chamado **sem `await`**, tem try/catch próprio; uma falha (zapi off, número inválido, DB) **nunca** toca a resposta do concluir. Só dispara na **transição** EM_ANDAMENTO→CONCLUIDA (`exec.status !== 'CONCLUIDA'` antes do update) **e** quando `emAlerta`.
- **WhatsApp**: `zapiEnviarTexto(numero, texto)` de `./zapi.mjs`; `zapiConfigurado()` diz se dá pra enviar. Número: `foneParaEnvio(foneCanonico(whatsapp))` (canoniza + DDI 55) — os mesmos helpers do OTP (`backend/server.js`).
- **Migration**: próximo livre `20260716340000`. `migrate deploy`; drift → PARAR e reportar.
- Frontend: padrão vivo de `Checklist.jsx`; classes reais; **modais/edição fecham só pelo botão**.
- Commits: um por task, direto na `main`, `git push origin main`.
- **⚠️ Subagentes: NUNCA `taskkill /IM node.exe`** (mata todos os node da máquina). Para testar rota, suba com `node server.js &` e mate só o próprio job com `kill %1`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `backend/checklistAlerta.js` **(novo)** | Regra pura: `itensCriticosNaoConformes`, `montarMensagemAlerta`. |
| `backend/checklistAlerta.test.js` **(novo)** | Teste `node` sem framework. |
| `backend/prisma/schema.prisma` | +3 models. |
| `backend/prisma/migrations/20260716340000_checklist_notificacoes/migration.sql` **(novo)** | 3 tabelas. |
| `backend/server.js` | `MODELS_TENANT`; endpoints admin de notificações; `dispararAlertaImediato` + gatilho no concluir. |
| `frontend/src/pages/Checklist.jsx` | Aba Notificações (toggle + destinatários + prévia + histórico). |

---

## Task 1: Regra pura da mensagem

**Files:** Create `backend/checklistAlerta.js`, `backend/checklistAlerta.test.js`

**Interfaces — Produces:**
- `itensCriticosNaoConformes(itensSnapshot, respostas) → string[]` (títulos dos itens críticos com `conforme===false`; `respostas` = `{ [chave]: { conforme } }`)
- `montarMensagemAlerta({ lojaNome, checklistNome, funcionarioNome, quando, itensForaDoPadrao }) → string`

- [ ] **Step 1: Teste que falha** — `backend/checklistAlerta.test.js`:

```js
import { itensCriticosNaoConformes, montarMensagemAlerta } from './checklistAlerta.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };
const has = (n, txt, sub) => { if (String(txt).includes(sub)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: falta "${sub}" em: ${txt}`); } };

const snap = [
  { chave: '1', tipo: 'CHECK',   critico: true,  titulo: 'Desligar fogões' },
  { chave: '2', tipo: 'NUMERICO', critico: true,  titulo: 'Temperatura do freezer' },
  { chave: '3', tipo: 'CHECK',   critico: false, titulo: 'Retirar lixo' },
  { chave: '4', tipo: 'CHECK',   critico: true,  titulo: 'EPIs' },
];
console.log('\n== itensCriticosNaoConformes ==');
t('só críticos conforme=false', itensCriticosNaoConformes(snap, { '1': { conforme: false }, '2': { conforme: false }, '3': { conforme: false }, '4': { conforme: true } }), ['Desligar fogões', 'Temperatura do freezer']);
t('nenhum não-conforme = vazio', itensCriticosNaoConformes(snap, { '1': { conforme: true }, '4': { conforme: true } }), []);
t('conforme null não entra', itensCriticosNaoConformes(snap, { '1': { conforme: null }, '2': { conforme: false } }), ['Temperatura do freezer']);
t('não-crítico não entra mesmo false', itensCriticosNaoConformes(snap, { '3': { conforme: false } }), []);
t('respostas ausente = vazio', itensCriticosNaoConformes(snap, {}), []);

console.log('\n== montarMensagemAlerta ==');
const msg = montarMensagemAlerta({ lojaNome: 'Hamburgão', checklistNome: 'Fechamento Cozinha', funcionarioNome: 'Rafaely', quando: '15/07 22:10', itensForaDoPadrao: ['Temperatura do freezer', 'EPIs'] });
has('tem a loja', msg, 'Hamburgão');
has('tem o checklist', msg, 'Fechamento Cozinha');
has('tem quem fez', msg, 'Rafaely');
has('tem o horário', msg, '15/07 22:10');
has('tem o item 1', msg, 'Temperatura do freezer');
has('tem o item 2', msg, 'EPIs');
const msg0 = montarMensagemAlerta({ lojaNome: 'L', checklistNome: 'C', funcionarioNome: 'F', quando: 'agora', itensForaDoPadrao: [] });
t('sem itens não quebra (string)', typeof msg0, 'string');

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && node checklistAlerta.test.js`.

- [ ] **Step 3: Implementar** — `backend/checklistAlerta.js`:

```js
// Regra pura do alerta imediato do Checklist: quais itens críticos ficaram fora
// do padrão e o texto do WhatsApp. Sem Prisma, sem Express, sem zapi.

export function itensCriticosNaoConformes(itensSnapshot, respostas) {
  const r = respostas || {};
  return (itensSnapshot || [])
    .filter((it) => it.critico && r[it.chave]?.conforme === false)
    .map((it) => it.titulo);
}

export function montarMensagemAlerta({ lojaNome, checklistNome, funcionarioNome, quando, itensForaDoPadrao }) {
  const itens = Array.isArray(itensForaDoPadrao) ? itensForaDoPadrao : [];
  const lista = itens.length ? itens.map((t) => `• ${t}`).join('\n') : '• (item crítico fora do padrão)';
  return [
    `⚠️ *Checklist fora do padrão* — ${lojaNome}`,
    ``,
    `*${checklistNome}*`,
    `Responsável: ${funcionarioNome}`,
    `Concluído: ${quando}`,
    ``,
    `Itens que precisam de atenção:`,
    lista,
  ].join('\n');
}
```

- [ ] **Step 4: Rodar e ver passar** — `cd backend && node checklistAlerta.test.js` → `12 ok, 0 falha(s)`, exit 0.

- [ ] **Step 5: Commit**
```bash
git add backend/checklistAlerta.js backend/checklistAlerta.test.js
git commit -m "feat(checklist): regra pura do alerta imediato (mensagem + itens fora do padrao)"
git push origin main
```

---

## Task 2: Models + migration

**Files:** Modify `backend/prisma/schema.prisma`, `backend/server.js:24`; Create `backend/prisma/migrations/20260716340000_checklist_notificacoes/migration.sql`

**Interfaces — Produces:** models `ChecklistNotificacaoConfig`, `ChecklistDestinatario`, `ChecklistNotificacaoLog`.

- [ ] **Step 1: Schema** — ao fim do bloco Checklist em `backend/prisma/schema.prisma`:

```prisma
model ChecklistNotificacaoConfig {
  id                  Int      @id @default(autoincrement())
  empresaId           Int
  alertaImediatoAtivo Boolean  @default(false)
  criadoEm            DateTime @default(now())
  atualizadoEm        DateTime @updatedAt
  @@unique([empresaId])
  @@index([empresaId])
}

model ChecklistDestinatario {
  id           Int      @id @default(autoincrement())
  empresaId    Int
  nome         String
  whatsapp     String
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  @@index([empresaId])
}

model ChecklistNotificacaoLog {
  id               Int      @id @default(autoincrement())
  empresaId        Int
  regra            String
  canal            String
  destino          String
  destinatarioNome String?
  execucaoId       Int?
  conteudo         String   @db.Text
  status           String
  erro             String?
  criadoEm         DateTime @default(now())
  @@index([empresaId, criadoEm])
}
```

- [ ] **Step 2: Migration** — `backend/prisma/migrations/20260716340000_checklist_notificacoes/migration.sql`:

```sql
CREATE TABLE "ChecklistNotificacaoConfig" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL,
  "alertaImediatoAtivo" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChecklistNotificacaoConfig_empresaId_key" ON "ChecklistNotificacaoConfig"("empresaId");
CREATE INDEX "ChecklistNotificacaoConfig_empresaId_idx" ON "ChecklistNotificacaoConfig"("empresaId");

CREATE TABLE "ChecklistDestinatario" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "nome" TEXT NOT NULL, "whatsapp" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChecklistDestinatario_empresaId_idx" ON "ChecklistDestinatario"("empresaId");

CREATE TABLE "ChecklistNotificacaoLog" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "regra" TEXT NOT NULL, "canal" TEXT NOT NULL,
  "destino" TEXT NOT NULL, "destinatarioNome" TEXT, "execucaoId" INTEGER, "conteudo" TEXT NOT NULL,
  "status" TEXT NOT NULL, "erro" TEXT, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChecklistNotificacaoLog_empresaId_criadoEm_idx" ON "ChecklistNotificacaoLog"("empresaId","criadoEm");
```

- [ ] **Step 3: `MODELS_TENANT`** — em `backend/server.js:24`, adicione:
```js
  'checklistNotificacaoConfig', 'checklistDestinatario', 'checklistNotificacaoLog',
```

- [ ] **Step 4: Aplicar e verificar**
```bash
cd backend && npx prisma migrate deploy && npx prisma generate && node --check server.js
node checklistAlerta.test.js   # 12 ok
```
Confirme no banco que as 3 tabelas existem. Cole no relatório. (Se `migrate deploy` falhar por drift, PARE e reporte.)

- [ ] **Step 5: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260716340000_checklist_notificacoes backend/server.js
git commit -m "feat(checklist): models de notificacoes (config, destinatarios, log)"
git push origin main
```

---

## Task 3: Endpoints admin de notificações

**Files:** Modify `backend/server.js` (bloco admin de checklist)

**Interfaces — Consumes:** `montarMensagemAlerta` (Task 1), models (Task 2). **Produces:**
- `GET /api/checklist/notificacoes` · `PUT /api/checklist/notificacoes/config`
- `POST/PUT/DELETE /api/checklist/notificacoes/destinatarios[/:id]`
- `GET /api/checklist/notificacoes/historico` · `GET /api/checklist/notificacoes/previa`

- [ ] **Step 1: Import** — no topo do `server.js`, junto dos outros de checklist:
```js
import { itensCriticosNaoConformes, montarMensagemAlerta } from './checklistAlerta.js';
```

- [ ] **Step 2: Endpoints** — no bloco admin de checklist:
```js
// Config de notificações (cria on-demand). Admin, dentro do gate → extension injeta empresaId.
async function garantirNotifConfig() {
  let c = await prisma.checklistNotificacaoConfig.findFirst();
  if (!c) c = await prisma.checklistNotificacaoConfig.create({ data: {} });
  return c;
}
app.get('/api/checklist/notificacoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const config = await garantirNotifConfig();
    const destinatarios = await prisma.checklistDestinatario.findMany({ orderBy: { nome: 'asc' } });
    res.json({ config, destinatarios });
  } catch (err) { console.error('[checklist/notificacoes GET]', err); res.status(500).json({ error: 'Erro ao carregar notificações.' }); }
});
app.put('/api/checklist/notificacoes/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const atual = await garantirNotifConfig();
    const config = await prisma.checklistNotificacaoConfig.update({ where: { id: atual.id }, data: { alertaImediatoAtivo: req.body?.alertaImediatoAtivo !== false && !!req.body?.alertaImediatoAtivo } });
    res.json({ ok: true, config });
  } catch (err) { console.error('[checklist/notificacoes config PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
app.post('/api/checklist/notificacoes/destinatarios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = req.body?.nome == null ? '' : String(req.body.nome).trim().slice(0, 80);
    const whatsapp = req.body?.whatsapp == null ? '' : String(req.body.whatsapp).trim().slice(0, 30);
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' });
    if (soDigitos(whatsapp).length < 10) return res.status(400).json({ error: 'Informe o WhatsApp com DDD.' });
    const dest = await prisma.checklistDestinatario.create({ data: { nome, whatsapp } });
    res.status(201).json({ ok: true, destinatario: dest });
  } catch (err) { console.error('[checklist/destinatarios POST]', err); res.status(500).json({ error: 'Erro ao adicionar.' }); }
});
app.put('/api/checklist/notificacoes/destinatarios/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.checklistDestinatario.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Destinatário não encontrado.' });
    const data = {};
    if (req.body?.nome !== undefined) data.nome = String(req.body.nome).trim().slice(0, 80) || atual.nome;
    if (req.body?.whatsapp !== undefined) data.whatsapp = String(req.body.whatsapp).trim().slice(0, 30) || atual.whatsapp;
    if (req.body?.ativo !== undefined) data.ativo = req.body.ativo !== false;
    const dest = await prisma.checklistDestinatario.update({ where: { id }, data });
    res.json({ ok: true, destinatario: dest });
  } catch (err) { console.error('[checklist/destinatarios PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
app.delete('/api/checklist/notificacoes/destinatarios/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.checklistDestinatario.delete({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/destinatarios DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});
app.get('/api/checklist/notificacoes/historico', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json({ historico: await prisma.checklistNotificacaoLog.findMany({ orderBy: { criadoEm: 'desc' }, take: 50 }) }); }
  catch (err) { console.error('[checklist/notificacoes historico]', err); res.status(500).json({ error: 'Erro ao carregar o histórico.' }); }
});
app.get('/api/checklist/notificacoes/previa', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const loja = await getEmpresa();
    const msg = montarMensagemAlerta({ lojaNome: loja?.nome || 'Sua loja', checklistNome: 'Fechamento Cozinha', funcionarioNome: 'Rafaely', quando: '22:10', itensForaDoPadrao: ['Temperatura do freezer', 'EPIs sendo utilizados'] });
    res.json({ previa: msg });
  } catch (err) { console.error('[checklist/notificacoes previa]', err); res.status(500).json({ error: 'Erro ao gerar prévia.' }); }
});
```

> `soDigitos` e `getEmpresa` já existem no `server.js` (usados no cadastro de operador e em `/empresa`). Confirme os nomes antes de usar; se `getEmpresa` não existir, use `prisma.empresa.findFirst()` (admin, escopado pela extension).

- [ ] **Step 3: Verificar** — `node --check server.js`; subir com `node server.js &`; `curl` sem token em `/api/checklist/notificacoes` → **401**; `kill %1`. **Não use `taskkill`.**

- [ ] **Step 4: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): endpoints admin de notificacoes (config, destinatarios, historico, previa)"
git push origin main
```

---

## Task 4: Aba Notificações (gestor)

**Files:** Modify `frontend/src/pages/Checklist.jsx`

**Interfaces — Consumes:** endpoints da Task 3.

- [ ] **Step 1: Aba** — em `Checklist.jsx`, adicionar `['notificacoes', 'Notificações']` ao `TABS`, `{atual === 'notificacoes' && <AbaNotificacoes />}` no render, e o componente:

```jsx
function AbaNotificacoes() {
  const [config, setConfig] = useState(null)
  const [dests, setDests] = useState([])
  const [historico, setHistorico] = useState([])
  const [previa, setPrevia] = useState('')
  const [nome, setNome] = useState('')
  const [whats, setWhats] = useState('')
  const carregar = () => api.get('/checklist/notificacoes').then((r) => { setConfig(r.data.config); setDests(r.data.destinatarios) }).catch(() => {})
  const carregarHist = () => api.get('/checklist/notificacoes/historico').then((r) => setHistorico(r.data.historico)).catch(() => {})
  useEffect(() => { carregar(); carregarHist() }, [])

  async function toggleAtivo() {
    const novo = !config.alertaImediatoAtivo
    setConfig((c) => ({ ...c, alertaImediatoAtivo: novo }))
    try { await api.put('/checklist/notificacoes/config', { alertaImediatoAtivo: novo }) } catch { carregar() }
  }
  async function addDest() {
    if (!nome.trim() || !whats.trim()) return
    try { await api.post('/checklist/notificacoes/destinatarios', { nome, whatsapp: whats }); setNome(''); setWhats(''); carregar() } catch { /* toast */ }
  }
  async function rmDest(id) { try { await api.delete(`/checklist/notificacoes/destinatarios/${id}`); carregar() } catch { /* toast */ } }
  async function verPrevia() { try { const r = await api.get('/checklist/notificacoes/previa'); setPrevia(r.data.previa) } catch { /* toast */ } }

  if (!config) return <div className="loading-state">Carregando…</div>
  const dt = (v) => new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="table-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Alerta imediato (WhatsApp)</div>
            <div style={{ fontSize: 12, color: '#777' }}>Quando um checklist é concluído com um item crítico fora do padrão, os destinatários recebem na hora.</div>
          </div>
          <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={!!config.alertaImediatoAtivo} onChange={toggleAtivo} /> {config.alertaImediatoAtivo ? 'Ativo' : 'Inativo'}</label>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={verPrevia}>Ver prévia</button>
        {previa && <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--app-surface-2,#f7f7f7)', border: '1px solid var(--app-border,#eee)', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 12 }}>{previa}</pre>}
      </div>

      <div className="table-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Destinatários</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder="WhatsApp (DDD+número)" value={whats} onChange={(e) => setWhats(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={addDest}>Adicionar</button>
        </div>
        {dests.length === 0 ? <p className="empty-state">Nenhum destinatário. Adicione quem deve receber os alertas.</p> : dests.map((d) => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--app-border,#eee)' }}>
            <span><strong>{d.nome}</strong> <span style={{ color: '#777', fontSize: 12 }}>{d.whatsapp}</span>{!d.ativo && <span className="badge badge-gray" style={{ marginLeft: 6 }}>inativo</span>}</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => rmDest(d.id)}>Excluir</button>
          </div>
        ))}
      </div>

      <div className="table-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Histórico de envios</div>
        {historico.length === 0 ? <p className="empty-state">Nenhum envio ainda.</p> : (
          <table className="hb-table"><thead><tr><th>Quando</th><th>Destino</th><th>Status</th></tr></thead>
            <tbody>{historico.map((h) => (
              <tr key={h.id}><td>{dt(h.criadoEm)}</td><td>{h.destinatarioNome || h.destino}</td><td>{h.status === 'ENVIADO' ? '✓ Enviado' : `✗ ${h.erro || 'Falhou'}`}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

Confirme que as classes usadas (`table-card`, `hb-table`, `form-input`, `btn`/`btn-primary`/`btn-secondary`/`btn-danger`/`btn-sm`, `empty-state`, `loading-state`, `badge`/`badge-gray`) existem no `global.css` (todas já usadas neste arquivo). `api` de `../services/api`.

- [ ] **Step 2: Build** — `cd frontend && npm run build` → `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Checklist.jsx
git commit -m "feat(checklist): aba Notificacoes (toggle, destinatarios, previa, historico)"
git push origin main
```

**Fim da F1.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh` (tem migration).

---

## Task 5: Disparo no concluir

**Files:** Modify `backend/server.js` (helper + gatilho no concluir)

**Interfaces — Consumes:** `itensCriticosNaoConformes`, `montarMensagemAlerta` (Task 1); `zapiEnviarTexto`/`zapiConfigurado` (`./zapi.mjs`); `foneCanonico`/`foneParaEnvio`; models (Task 2).

- [ ] **Step 1: Import do zapi** — confirme que o topo do `server.js` importa de `./zapi.mjs`. Precisa de `zapiEnviarTexto` e `zapiConfigurado`. Se já houver um import parcial, adicione o que faltar; senão:
```js
import { zapiEnviarTexto, zapiConfigurado } from './zapi.mjs';
```

- [ ] **Step 2: Helper `dispararAlertaImediato`** — em `backend/server.js`, perto do bloco de execução do colaborador. **Roda FORA do tenantStore → `empresaId` explícito em toda query. Best-effort: try/catch total, nunca lança pra fora.**
```js
// Dispara o alerta imediato de um checklist concluído com item crítico fora do padrão.
// Best-effort: chamado sem await no concluir, com try/catch total — uma falha (zapi off,
// número ruim, DB) NUNCA toca a resposta do concluir. empresaId explícito (fora do tenantStore).
async function dispararAlertaImediato(empresaId, execucaoId) {
  try {
    const cfg = await prisma.checklistNotificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg?.alertaImediatoAtivo) return;
    const exec = await prisma.checklistExecucao.findFirst({ where: { id: execucaoId, empresaId }, include: { respostas: true, checklist: { select: { nome: true } } } });
    if (!exec) return;
    const rmap = {}; for (const r of exec.respostas) rmap[r.itemChave] = { conforme: r.conforme };
    const itensForaDoPadrao = itensCriticosNaoConformes(exec.itensSnapshotJson, rmap);
    const func = await prisma.funcionario.findFirst({ where: { id: exec.funcionarioId, empresaId }, select: { nome: true, apelido: true } });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });
    const quando = new Date(exec.concluidaEm || Date.now()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const msg = montarMensagemAlerta({ lojaNome: loja?.nome || 'Loja', checklistNome: exec.checklist?.nome || 'Checklist', funcionarioNome: func ? (func.apelido || func.nome) : '—', quando, itensForaDoPadrao });

    const dests = await prisma.checklistDestinatario.findMany({ where: { empresaId, ativo: true } });
    if (!dests.length) return;
    const podeEnviar = zapiConfigurado();
    for (const d of dests) {
      const destino = foneParaEnvio(foneCanonico(d.whatsapp));
      let status = 'ENVIADO', erro = null;
      if (!podeEnviar) { status = 'FALHOU'; erro = 'WhatsApp não configurado'; }
      else { try { await zapiEnviarTexto(destino, msg); } catch (e) { status = 'FALHOU'; erro = String(e?.message || e).slice(0, 300); } }
      await prisma.checklistNotificacaoLog.create({ data: { empresaId, regra: 'ALERTA_IMEDIATO', canal: 'WHATSAPP', destino, destinatarioNome: d.nome, execucaoId: exec.id, conteudo: msg, status, erro } });
    }
  } catch (e) { console.error('[dispararAlertaImediato]', e?.message || e); }
}
```

- [ ] **Step 3: Gatilho no concluir** — no `POST /api/public/colaborador/execucoes/:id/concluir`, **antes** do `updateMany` guarde o status anterior, e **depois** do `updateMany` dispare sem `await`:
```js
    // ...após calcular emAlerta...
    const eraAndamento = exec.status !== 'CONCLUIDA'; // guarda a transição
    await prisma.checklistExecucao.updateMany({ where: { id: exec.id, empresaId: sess.empresaId }, data: { status: 'CONCLUIDA', concluidaEm: new Date(), emAlerta } });
    // Alerta só na TRANSIÇÃO para CONCLUIDA e quando em alerta. Fire-and-forget: não segura a resposta.
    if (eraAndamento && emAlerta) dispararAlertaImediato(sess.empresaId, exec.id);
    res.json({ ok: true, status: 'CONCLUIDA', emAlerta });
```

- [ ] **Step 4: Verificar** — `cd backend && node --check server.js && node checklistAlerta.test.js` (12 ok). Subir com `node server.js &`; `curl` sem token no concluir → 401; `kill %1`. **Não use `taskkill`.** Se conseguir sessão de colaborador + um destinatário + a config ativa, prove: concluir uma execução em alerta gera um `ChecklistNotificacaoLog` (ENVIADO se o zapi estiver ok, senão FALHOU com motivo) e **a resposta do concluir continua 200 imediata**. Cole no relatório.

- [ ] **Step 5: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): dispara alerta imediato no WhatsApp ao concluir em alerta"
git push origin main
```

**Fim da F2 / Fatia 3a.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh`.

---

## Checklist pós-deploy (usuário)

1. **Checklist › Notificações** — ligar "Alerta imediato" e adicionar um destinatário (seu WhatsApp) → "Ver prévia".
2. Executar um checklist com item **crítico** e responder fora do padrão (ex.: temperatura fora da faixa) → concluir.
3. Conferir o WhatsApp do destinatário + o **Histórico de envios**.
4. Se o UAZAPI do PDV não estiver configurado (`.env`), o histórico mostra FALHOU "WhatsApp não configurado" — configure a mesma conexão da Bonificação.
