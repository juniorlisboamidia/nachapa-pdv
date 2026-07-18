# Checklist — Fatia 2 (Lembrete de atraso) — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Lembrar no WhatsApp, antes do horário-limite, que um checklist que vence hoje não foi concluído — cobrando o responsável. Config numa nova aba "Configurações" (modelo de mensagem + minutos + destinatários próprios). Disparo por um agendador in-process.

**Architecture:** regra pura (`checklistLembrete.js`) → models (`lembrete*` na config + `tipo` no destinatário + `ChecklistLembreteEnviado` p/ dedup) → disparo `dispararLembretesLoja` + agendador `setInterval` (boot) → aba `AbaConfiguracoes`.

**Tech Stack:** Express+Prisma 7, `zapi.mjs` (UAZAPI, o mesmo do OTP de login), React/Vite.

## Global Constraints

- Disparo/agendador rodam **FORA do `tenantStore`** → `empresaId` explícito em TODA query.
- **1 lembrete por checklist por dia** (dia de EXPEDIENTE, `janelaExpedienteAtual`) via `@@unique([empresaId, checklistId, dataRef])` do `ChecklistLembreteEnviado` (create-then-skip-on-conflict).
- Só checklists **vence hoje** (`venceHoje`) **+ com `recorrenciaConfig.horarioLimite`** **+ não concluídos** hoje **+ na janela** (`estaNaJanelaDeLembrete`).
- **Best-effort:** envio que falha loga FALHOU e não impede os outros; erro numa loja não para a varredura nem o intervalo.
- `zapi` não configurado → loga/sai, não estoura. Número via `foneCanonico`/`foneParaEnvio`.
- Não quebrar o alerta imediato (F3a): `tipo=IMEDIATO` é o default do destinatário.
- Commit por task na `main`, sem push (o controlador dá push). Subagentes: NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task 1: Regra pura `checklistLembrete.js`

**Files:**
- Create: `backend/checklistLembrete.js`
- Create: `backend/checklistLembrete.test.js`

**Interfaces:**
- Produces: `TEMPLATE_PADRAO` (string); `montarMensagemLembrete(template, {checklist, horario, responsavel}) → string`; `estaNaJanelaDeLembrete(agoraMs, limiteMs, minutosAntes) → bool`.

- [ ] **Step 1:** Escrever `checklistLembrete.js`:
```js
// Regra pura do lembrete de atraso: a mensagem e a janela de disparo. Sem Prisma, sem Express,
// sem zapi — igual ao padrão de checklistConformidade/checklistAlerta.
export const TEMPLATE_PADRAO = 'Aviso: o checklist [nome do checklist] previsto para as [horário do checklist] não foi concluído. Colaborador responsável: [nome do responsável]. Por favor, verifique.';

// Substitui os 3 placeholders. Template vazio → o padrão. Dado faltando → string vazia.
export function montarMensagemLembrete(template, { checklist = '', horario = '', responsavel = '' } = {}) {
  const t = (template && String(template).trim()) ? String(template) : TEMPLATE_PADRAO;
  return t
    .split('[nome do checklist]').join(String(checklist || ''))
    .split('[horário do checklist]').join(String(horario || ''))
    .split('[nome do responsável]').join(String(responsavel || ''));
}

// `agora` está na janela [limite - minutosAntes, limite]? (tudo em ms). minutosAntes >= 1.
export function estaNaJanelaDeLembrete(agoraMs, limiteMs, minutosAntes) {
  if (!Number.isFinite(agoraMs) || !Number.isFinite(limiteMs)) return false;
  const inicio = limiteMs - Math.max(1, Number(minutosAntes) || 0) * 60000;
  return agoraMs >= inicio && agoraMs <= limiteMs;
}
```
- [ ] **Step 2:** Escrever `checklistLembrete.test.js` (node, sem framework, `process.exit(falhou?1:0)`):
  - `montarMensagemLembrete`: substitui os 3 tokens; template `''` → contém "Aviso:" (padrão); responsável vazio não deixa `[nome do responsável]` no texto.
  - `estaNaJanelaDeLembrete`: `agora=limite-10min, antes=30` → true; `agora=limite+1min` → false; `agora=limite-31min, antes=30` → false; exatamente `limite` → true; exatamente `inicio` → true; `limite` não-finito → false.
- [ ] **Step 3:** `cd backend && node checklistLembrete.test.js`.
- [ ] **Step 4:** Commit.

---

### Task 2: Models + config/destinatários

**Files:**
- Modify: `backend/prisma/schema.prisma` (ChecklistNotificacaoConfig, ChecklistDestinatario, novo ChecklistLembreteEnviado)
- Create: `backend/prisma/migrations/20260717130000_checklist_lembrete/migration.sql`
- Modify: `backend/server.js` (MODELS_TENANT; PUT config; POST destinatário; novo GET /lembrete/previa)

**Interfaces:**
- Produces: `GET /notificacoes` inclui `lembrete*` no config e `tipo` nos destinatarios; `PUT /config` aceita os campos do lembrete; `POST /destinatarios` aceita `tipo`; `GET /notificacoes/lembrete/previa` → `{ previa }`.

- [ ] **Step 1 (schema):**
```
model ChecklistNotificacaoConfig { ... 
  lembreteAtivo        Boolean  @default(false)
  lembreteTemplate     String   @default("")
  lembreteMinutosAntes Int      @default(30)
  ... }
model ChecklistDestinatario { ... tipo String @default("IMEDIATO") ... }
model ChecklistLembreteEnviado {
  id          Int      @id @default(autoincrement())
  empresaId   Int
  checklistId Int
  dataRef     DateTime
  criadoEm    DateTime @default(now())
  @@unique([empresaId, checklistId, dataRef])
  @@index([empresaId])
}
```
- [ ] **Step 2 (migration):** `migration.sql` — os 3 ALTER na config (default false/''/30), 1 ALTER no destinatário (default 'IMEDIATO'), CREATE TABLE + UNIQUE INDEX + INDEX do ChecklistLembreteEnviado.
- [ ] **Step 3 (aplicar):** `cd backend && npx prisma migrate deploy && npx prisma generate`.
- [ ] **Step 4 (MODELS_TENANT):** adicionar `'checklistLembreteEnviado'` ao Set (`server.js` ~27).
- [ ] **Step 5 (PUT config):** no `PUT /notificacoes/config`, além do `alertaImediatoAtivo`, sanear e gravar:
  `lembreteAtivo` (`!== false && !!`), `lembreteTemplate` (`String(...).slice(0,600)`; aceita vazio), `lembreteMinutosAntes` (`clamp 5..240`, default 30). Ler `req.body`.
- [ ] **Step 6 (POST destinatário):** aceitar `tipo` (`'ATRASO'` se `req.body.tipo==='ATRASO'`, senão `'IMEDIATO'`) no `create`. GET já devolve todos (com `tipo`).
- [ ] **Step 7 (prévia):** `GET /api/checklist/notificacoes/lembrete/previa` (admin) → lê a config, `montarMensagemLembrete(config.lembreteTemplate, { checklist:'Abertura Cozinha', horario:'09:00', responsavel:'Diego Alves' })` → `{ previa }`.
- [ ] **Step 8:** `node --check server.js`. Commit.

---

### Task 3: Disparo + agendador

**Files:**
- Modify: `backend/server.js` (`dispararLembretesLoja`, `varrerLembretes`, `iniciarAgendadorLembretes`; chamada após `app.listen` ~8021)

**Interfaces:**
- Consumes: `montarMensagemLembrete`, `estaNaJanelaDeLembrete`, `TEMPLATE_PADRAO` (T1); `venceHoje`, `janelaExpedienteAtual`, `brFields`, `brToUtcMs` (existentes), `zapiEnviarTexto`/`zapiConfigurado`, `foneCanonico`/`foneParaEnvio`.

- [ ] **Step 1 (import):** `import { montarMensagemLembrete, estaNaJanelaDeLembrete, TEMPLATE_PADRAO } from './checklistLembrete.js';`
- [ ] **Step 2 (`dispararLembretesLoja(empresaId)`):** FORA do gate → `empresaId` explícito em TODA query.
  1. `cfg = checklistNotificacaoConfig.findFirst({ where:{empresaId} })`; se `!cfg?.lembreteAtivo` → sai.
  2. `destinatarios = checklistDestinatario.findMany({ where:{empresaId, tipo:'ATRASO', ativo:true} })`; se vazio ou `!zapiConfigurado()` → sai.
  3. `dataRef = janelaExpedienteAtual().de`; `dow` do dataRef (via brFields). `agoraMs = brToUtcMs(...)`? — usar `Date.now()` para "agora" e computar `limiteMs` do dia+HH:mm em BR (mesma conta que o resto usa; ver `brToUtcMs`/`brFields`).
  4. `checklists = checklist.findMany({ where:{empresaId, ativo:true} })`. Para cada `c` com `venceHoje(c, dow)` **e** `c.recorrenciaConfig?.horarioLimite` (HH:mm):
     - `limiteMs` = ms do `dataRef` (dia BR) às HH:mm. Se `!estaNaJanelaDeLembrete(Date.now(), limiteMs, cfg.lembreteMinutosAntes)` → pula.
     - `exec = checklistExecucao.findFirst({ where:{empresaId, checklistId:c.id, dataRef} })`; se `exec?.status==='CONCLUIDA'` → pula.
     - **Dedup:** `try { await checklistLembreteEnviado.create({ data:{empresaId, checklistId:c.id, dataRef} }) } catch(e){ if(P2002) continue; else throw }`.
     - **Responsável:** se `exec` (iniciada) → nome de quem iniciou (`funcionario.findFirst({where:{id:exec.funcionarioId, empresaId}})`, apelido||nome); senão os atribuídos: COLABORADOR → nomes de `c.funcionarioIds` (query), FUNCAO → `c.funcoes.join(', ')`. Vazio → ''.
     - `msg = montarMensagemLembrete(cfg.lembreteTemplate, { checklist:c.nome, horario:c.recorrenciaConfig.horarioLimite, responsavel })`.
     - Para cada destinatário: `zapiEnviarTexto(foneParaEnvio(foneCanonico(d.whatsapp)), msg)`, grava `checklistNotificacaoLog` (`regra:'LEMBRETE_ATRASO'`, canal:'WHATSAPP', destino, destinatarioNome, conteudo:msg, status:'ENVIADO'|'FALHOU', erro). Um envio que falha não impede os outros.
  Tudo em try/catch geral (best-effort; `console.error` e segue).
- [ ] **Step 3 (`varrerLembretes()`):** `configs = checklistNotificacaoConfig.findMany({ where:{ lembreteAtivo:true } })` (todas as lojas — fora do tenant, sem injeção). Para cada, `await dispararLembretesLoja(cfg.empresaId)` num try/catch por loja.
- [ ] **Step 4 (agendador):** `function iniciarAgendadorLembretes(){ setInterval(() => { varrerLembretes().catch(e => console.error('[lembretes]', e)); }, 5*60*1000); }`. Chamar `iniciarAgendadorLembretes();` logo após o `app.listen(...)`. (Sem rodar na hora do boot pra não atrasar o start; o 1º ciclo vem em 5 min.)
- [ ] **Step 5:** `node --check server.js`. Smoke opcional: chamar `dispararLembretesLoja` num script com uma loja de teste (lembreteAtivo + um checklist vence-hoje na janela) e conferir o log/dedup — se inviável, `--check` + leitura. NUNCA `taskkill`.
- [ ] **Step 6:** Commit.

---

### Task 4: Aba "Configurações"

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx` (sub-item Configurações no grupo Checklist)
- Modify: `frontend/src/pages/Checklist.jsx` (`TABS` += configuracoes; `AbaConfiguracoes`)

**Interfaces:**
- Consumes: `GET/PUT /checklist/notificacoes` (config com `lembrete*` + destinatarios com `tipo`), `POST/DELETE /notificacoes/destinatarios` (com `tipo`), `GET /notificacoes/lembrete/previa`.

- [ ] **Step 1 (Sidebar):** no grupo `Checklist` (itens), adicionar `{ to: '/checklist/configuracoes', label: 'Configurações', icon: 'gestao' }`.
- [ ] **Step 2 (TABS):** em `Checklist.jsx`, `TABS` += `{ id: 'configuracoes', label: 'Configurações', sub: 'Lembrete de atraso e destinatários' }`; render `{tab === 'configuracoes' && <AbaConfiguracoes notify={notify} />}`.
- [ ] **Step 3 (`AbaConfiguracoes`):** carrega `GET /checklist/notificacoes`. Card **Lembrete de atraso**: toggle `lembreteAtivo` (PUT config); textarea do `lembreteTemplate` (com 3 chips-atalho que inserem `[nome do checklist]`/`[horário do checklist]`/`[nome do responsável]` na posição do cursor ou no fim); input `lembreteMinutosAntes`; botão "Ver prévia" (`/lembrete/previa`) ou prévia montada no cliente; "Salvar". Card **Notificações de atraso**: lista dos destinatarios `tipo==='ATRASO'` (avatar/nome/número + remover) + form add (nome + WhatsApp) → `POST /destinatarios` com `tipo:'ATRASO'`. Reusar os componentes/estilo da `AbaNotificacoes` (imediato) — é o mesmo padrão. Modais/confirmação fecham só por botão.
- [ ] **Step 4:** `cd frontend && npm run build`. Commit.

## Verificação final

`node backend/checklistLembrete.test.js`; `node --check backend/server.js`; `npm run build`; a aba Configurações liga o lembrete, edita o modelo/minutos, cadastra destinatários de atraso; o agendador (setInterval) dispara o lembrete uma vez por checklist atrasado por dia, via o mesmo WhatsApp do OTP.
