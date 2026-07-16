# Checklist Núcleo (Fatia 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestor cria templates → agenda checklists por setor → o operador executa na Área do Colaborador → cada item vira registro conforme/não-conforme → o dashboard mostra feito, pendente e em alerta.

**Architecture:** Backend guarda tudo; duas superfícies. **Gestor** no PDV admin (`/api/checklist/*`, dentro do gate de tenant → a extension injeta `empresaId`). **Operador** na Área do Colaborador (`/api/public/colaborador/checklists/*`, FORA do gate → `empresaId` explícito da sessão OTP). Duas regras puras e testadas — recorrência ("vence hoje?") e conformidade ("passou?"). A execução congela um snapshot dos itens (auditoria imutável).

**Tech Stack:** Express 5 ESM (`backend/server.js`, arquivo único), Prisma 7 + `@prisma/adapter-pg`, Postgres. Frontend React 19 + Vite + React Router.

**Spec:** `docs/superpowers/specs/2026-07-16-checklist-nucleo-design.md`

## Global Constraints

- **ESM** (`"type":"module"`): `import`/`export`, nunca `require`. Node 24.
- **Prisma 7** com adapter: `new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })`. Scripts avulsos precisam do adapter.
- **Multi-tenant**: todo model novo entra em `MODELS_TENANT` (`backend/server.js:24`). Rotas **admin** rodam dentro do `tenantStore` → a extension injeta `empresaId` (filtro manual é erro, exceto no model `Empresa` que não é tenant). Rotas **públicas de colaborador** rodam FORA do `tenantStore` → **passar `empresaId` explícito em toda query** (já causou vazamento/500 nesta base).
- **NUNCA `req.user.empresaId`** — só existe para operador do PDV; no ADMIN é o JWT cru do HUB. Use `getEmpresaIdAtual()`. Nas rotas de colaborador, `empresaId` vem de `exigirColaborador(req,res)` → `{ funcionarioId, empresaId }`.
- **Fuso BR fixo**: o VPS roda em UTC. Datas usam `brFields`/`brToUtcMs`/`janelaExpedienteAtual` (`backend/server.js`). Nunca `setHours()`.
- **Migration**: nome `AAAAMMDDHHMMSS_descricao`; a próxima livre é `20260716310000`. Aplicar com `npx prisma migrate deploy` (o repo tem `prisma.config.ts`; `db execute` não aceita `--schema`). Se `migrate deploy` falhar por drift, **PARAR e reportar** — nunca resetar o banco nem editar migration aplicada.
- **Área `checklist` já existe** em `AREAS_DISPONIVEIS`/`AREA_PREFIXOS` — as rotas `/api/checklist/*` já nascem protegidas. **Não mexer no middleware.**
- **Conformidade é recalculada no servidor** — o cliente não decide se passou (é auditoria).
- **Snapshot imutável** — editar um checklist não reescreve execuções passadas.
- **⚠️ Nested create + `empresaId`:** a extension injeta `empresaId` no `create`/`createMany` do model **de primeiro nível**, mas pode **não** injetar nos filhos de um nested write (`itens: { create: [...] }`). O `createMany` avulso é o padrão comprovado (o `garantirEtiquetaSetup` usa). Ao implementar cada create de template/checklist com itens: **VERIFICAR** (após o `create`, conferir no banco que os `ChecklistTemplateItem`/`ChecklistItem` nasceram com o `empresaId` certo). Se o nested não injetar, trocar por `create` do pai → `createMany` dos filhos com o `parentId` (que injeta `empresaId` por linha). Coluna `empresaId` é `NOT NULL`, então um nested sem injeção **falha na hora** — não vaza calado, mas trava a criação.
- **Modais fecham só pelo botão**, nunca no overlay.
- **Commits**: direto na `main`, um por task, `git push origin main` em seguida.
- **Deploy** (só ao fim de cada fase, informado ao usuário): `cd /var/www/nachapa-pdv && bash deploy.sh`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `backend/checklistRecorrencia.js` **(novo)** | Regra pura: `venceHoje`, `atrasado`. Sem Prisma/Express. |
| `backend/checklistRecorrencia.test.js` **(novo)** | Teste `node` sem framework. |
| `backend/checklistConformidade.js` **(novo)** | Regra pura: `avaliarResposta`, `execucaoEmAlerta`. |
| `backend/checklistConformidade.test.js` **(novo)** | Teste `node` sem framework. |
| `backend/prisma/schema.prisma` | +4 enums, +7 models, `Funcionario.setorIds`. |
| `backend/prisma/migrations/20260716310000_checklist/migration.sql` **(novo)** | Tabelas + enums + coluna. Sem seed (seed é lazy em JS). |
| `backend/server.js` | `MODELS_TENANT` + seed constante + blocos de endpoints (admin + colaborador). |
| `frontend/src/pages/Checklist.jsx` **(novo)** | Admin com abas (Painel/Checklists/Templates/Setores), molde de `PontoFacial.jsx`. |
| `frontend/src/pages/BonificacaoEu.jsx` | Nova aba **Checklists** na Área do Colaborador. |
| `frontend/src/App.jsx` | Trocar o placeholder `EmConstrucao` de `/checklist`. |

---

## Task 1: Conformidade (módulo puro + teste)

Começa pela regra sanitária — decide se um item passou. Sem banco, sem tela.

**Files:** Create `backend/checklistConformidade.js`, `backend/checklistConformidade.test.js`

**Interfaces — Produces:**
- `avaliarResposta({ tipo, config, valor }) → { conforme: boolean|null, motivo: string|null }`
- `execucaoEmAlerta(itensSnapshot, respostasPorChave) → boolean` (itensSnapshot: `[{chave,critico,...}]`; respostasPorChave: objeto `chave → { conforme }`)

- [ ] **Step 1: Teste que falha** — `backend/checklistConformidade.test.js`:

```js
import { avaliarResposta, execucaoEmAlerta } from './checklistConformidade.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { const a = JSON.stringify(real), b = JSON.stringify(esp); if (a === b) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}\n    real ${a}\n    esp  ${b}`); } };

console.log('\n== CHECK ==');
t('marcado = conforme', avaliarResposta({ tipo: 'CHECK', config: {}, valor: true }), { conforme: true, motivo: null });
t('desmarcado = nao-conforme', avaliarResposta({ tipo: 'CHECK', config: {}, valor: false }).conforme, false);

console.log('\n== NUMERICO ==');
t('sem faixa = nao avalia', avaliarResposta({ tipo: 'NUMERICO', config: { unidade: '°C' }, valor: 8 }), { conforme: null, motivo: null });
t('dentro da faixa', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: 3 }).conforme, true);
t('acima do max', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: 9 }).conforme, false);
t('abaixo do min', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: -2 }).conforme, false);
t('valor invalido = nao avalia', avaliarResposta({ tipo: 'NUMERICO', config: { min: 0, max: 4 }, valor: 'abc' }).conforme, null);

console.log('\n== SELECAO ==');
const opc = { opcoes: [{ rotulo: 'Estoque OK', conforme: true }, { rotulo: 'Sem estoque', conforme: false }] };
t('opcao conforme', avaliarResposta({ tipo: 'SELECAO', config: opc, valor: 'Estoque OK' }).conforme, true);
t('opcao nao-conforme', avaliarResposta({ tipo: 'SELECAO', config: opc, valor: 'Sem estoque' }).conforme, false);
t('opcao inexistente = nao avalia', avaliarResposta({ tipo: 'SELECAO', config: opc, valor: 'Xis' }).conforme, null);

console.log('\n== AVALIACAO ==');
t('sem notaMinima = nao avalia', avaliarResposta({ tipo: 'AVALIACAO', config: {}, valor: 3 }).conforme, null);
t('nota >= minima', avaliarResposta({ tipo: 'AVALIACAO', config: { notaMinima: 4 }, valor: 4 }).conforme, true);
t('nota < minima', avaliarResposta({ tipo: 'AVALIACAO', config: { notaMinima: 4 }, valor: 2 }).conforme, false);

console.log('\n== TEXTO ==');
t('texto nunca avalia', avaliarResposta({ tipo: 'TEXTO', config: {}, valor: 'qualquer' }), { conforme: null, motivo: null });

console.log('\n== execucaoEmAlerta ==');
const itens = [{ chave: '1', critico: true }, { chave: '2', critico: false }];
t('critico nao-conforme = alerta', execucaoEmAlerta(itens, { '1': { conforme: false }, '2': { conforme: true } }), true);
t('nao-critico nao-conforme = SEM alerta', execucaoEmAlerta(itens, { '1': { conforme: true }, '2': { conforme: false } }), false);
t('tudo conforme = sem alerta', execucaoEmAlerta(itens, { '1': { conforme: true }, '2': { conforme: true } }), false);
t('critico sem resposta = sem alerta', execucaoEmAlerta(itens, {}), false);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && node checklistConformidade.test.js` → `Cannot find module`.

- [ ] **Step 3: Implementar** — `backend/checklistConformidade.js`:

```js
// Regra pura de conformidade do Checklist. Decide se cada resposta passou e se a
// execução entra em alerta. Sem Prisma, sem Express — é o que dá valor probatório
// ao registro, então é o que tem teste. conforme=null significa "não avalia"
// (o item é informativo, não gera não-conformidade sozinho).

export function avaliarResposta({ tipo, config, valor }) {
  const c = config || {};
  switch (tipo) {
    case 'CHECK':
      return valor === true ? { conforme: true, motivo: null } : { conforme: false, motivo: 'Não marcado' };
    case 'NUMERICO': {
      const n = Number(valor);
      if (!Number.isFinite(n)) return { conforme: null, motivo: null };
      if (c.min != null && n < c.min) return { conforme: false, motivo: `Abaixo de ${c.min}` };
      if (c.max != null && n > c.max) return { conforme: false, motivo: `Acima de ${c.max}` };
      // Sem faixa definida, o número é só um registro (temperatura anotada, contagem).
      if (c.min == null && c.max == null) return { conforme: null, motivo: null };
      return { conforme: true, motivo: null };
    }
    case 'SELECAO': {
      const op = (c.opcoes || []).find((o) => o.rotulo === valor);
      if (!op) return { conforme: null, motivo: null };
      // conforme ausente na opção = tratada como conforme (só marca não-conforme quando explícito).
      return op.conforme === false ? { conforme: false, motivo: 'Opção fora do padrão' } : { conforme: true, motivo: null };
    }
    case 'AVALIACAO': {
      const n = Number(valor);
      if (!Number.isFinite(n) || c.notaMinima == null) return { conforme: null, motivo: null };
      return n >= c.notaMinima ? { conforme: true, motivo: null } : { conforme: false, motivo: `Nota abaixo de ${c.notaMinima}` };
    }
    case 'TEXTO':
    default:
      return { conforme: null, motivo: null };
  }
}

// A execução entra em alerta se algum item CRÍTICO teve resposta não-conforme.
// Item não-crítico não-conforme não dispara alerta (aparece no registro, mas não
// levanta a bandeira do dashboard).
export function execucaoEmAlerta(itensSnapshot, respostasPorChave) {
  return (itensSnapshot || []).some((it) => it.critico && respostasPorChave?.[it.chave]?.conforme === false);
}
```

- [ ] **Step 4: Rodar e ver passar** — `cd backend && node checklistConformidade.test.js` → `20 ok, 0 falha(s)`.

- [ ] **Step 5: Commit**
```bash
git add backend/checklistConformidade.js backend/checklistConformidade.test.js
git commit -m "feat(checklist): regra de conformidade (modulo puro + teste)"
git push origin main
```

---

## Task 2: Recorrência (módulo puro + teste)

**Files:** Create `backend/checklistRecorrencia.js`, `backend/checklistRecorrencia.test.js`

**Interfaces — Produces:**
- `venceHoje({ recorrenciaTipo, recorrenciaConfig }, diaSemana) → boolean` (`diaSemana` 0=dom..6=sáb, do dia de expediente)
- `atrasado(horarioLimite, minutoAtualBR) → boolean` (`horarioLimite` "HH:mm"|null; `minutoAtualBR` minutos-do-dia BR)

- [ ] **Step 1: Teste que falha** — `backend/checklistRecorrencia.test.js`:

```js
import { venceHoje, atrasado } from './checklistRecorrencia.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };

console.log('\n== venceHoje ==');
t('DIARIA vence todo dia (qua)', venceHoje({ recorrenciaTipo: 'DIARIA', recorrenciaConfig: null }, 3), true);
t('DIARIA vence todo dia (dom)', venceHoje({ recorrenciaTipo: 'DIARIA', recorrenciaConfig: null }, 0), true);
t('DIAS_SEMANA no dia certo (seg)', venceHoje({ recorrenciaTipo: 'DIAS_SEMANA', recorrenciaConfig: { diasSemana: [1, 3, 5] } }, 1), true);
t('DIAS_SEMANA fora do dia (ter)', venceHoje({ recorrenciaTipo: 'DIAS_SEMANA', recorrenciaConfig: { diasSemana: [1, 3, 5] } }, 2), false);
t('DIAS_SEMANA sem config = nunca', venceHoje({ recorrenciaTipo: 'DIAS_SEMANA', recorrenciaConfig: {} }, 3), false);
t('AVULSO nunca vence por recorrencia', venceHoje({ recorrenciaTipo: 'AVULSO', recorrenciaConfig: null }, 3), false);

console.log('\n== atrasado ==');
t('sem horario limite = nunca atrasa', atrasado(null, 900), false);
t('antes do limite', atrasado('10:00', 9 * 60 + 30), false);   // 09:30 < 10:00
t('depois do limite', atrasado('10:00', 10 * 60 + 1), true);    // 10:01 > 10:00
t('exatamente no limite = nao atrasado', atrasado('10:00', 10 * 60), false);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && node checklistRecorrencia.test.js`.

- [ ] **Step 3: Implementar** — `backend/checklistRecorrencia.js`:

```js
// Regra pura de recorrência do Checklist. Sem Prisma, sem Express. Quem chama
// deriva o dia de expediente (corte 05:00 BR) e passa o dia da semana já pronto —
// o módulo não sabe de fuso, só de regra.

export function venceHoje({ recorrenciaTipo, recorrenciaConfig }, diaSemana) {
  if (recorrenciaTipo === 'DIARIA') return true;
  if (recorrenciaTipo === 'DIAS_SEMANA') {
    const dias = Array.isArray(recorrenciaConfig?.diasSemana) ? recorrenciaConfig.diasSemana : [];
    return dias.includes(diaSemana);
  }
  // AVULSO não recorre — fica "disponível sob demanda", tratado fora daqui.
  return false;
}

export function atrasado(horarioLimite, minutoAtualBR) {
  if (!horarioLimite || typeof horarioLimite !== 'string') return false;
  const [h, m] = horarioLimite.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return false;
  return minutoAtualBR > h * 60 + (m || 0);
}
```

- [ ] **Step 4: Rodar e ver passar** — `10 ok, 0 falha(s)`.

- [ ] **Step 5: Commit**
```bash
git add backend/checklistRecorrencia.js backend/checklistRecorrencia.test.js
git commit -m "feat(checklist): regra de recorrencia (modulo puro + teste)"
git push origin main
```

---

## Task 3: Models + migration + MODELS_TENANT

**Files:** Modify `backend/prisma/schema.prisma`, `backend/server.js:24`; Create `backend/prisma/migrations/20260716310000_checklist/migration.sql`

**Interfaces — Produces:** models `Setor`, `ChecklistTemplate`, `ChecklistTemplateItem`, `Checklist`, `ChecklistItem`, `ChecklistExecucao`, `ChecklistResposta`; `Funcionario.setorIds Int[]`.

- [ ] **Step 1: Enums + models no `schema.prisma`** (ao fim do arquivo):

```prisma
// ============================================================
// Checklist Inteligente (Fatia 1 — Núcleo)
// ============================================================

enum TipoItemChecklist { CHECK AVALIACAO TEXTO NUMERICO SELECAO }
enum PrioridadeChecklist { BAIXA MEDIA ALTA }
enum RecorrenciaTipo { DIARIA DIAS_SEMANA AVULSO }
enum StatusExecucao { EM_ANDAMENTO CONCLUIDA }

model Setor {
  id           Int      @id @default(autoincrement())
  empresaId    Int
  nome         String
  ordem        Int      @default(0)
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  @@unique([empresaId, nome])
  @@index([empresaId])
}

model ChecklistTemplate {
  id               Int      @id @default(autoincrement())
  empresaId        Int
  nome             String
  categoria        String
  descricao        String?
  tempoEstimadoMin Int?
  ativo            Boolean  @default(true)
  arquivado        Boolean  @default(false)
  criadoEm         DateTime @default(now())
  atualizadoEm     DateTime @updatedAt
  itens            ChecklistTemplateItem[]
  @@index([empresaId])
}

model ChecklistTemplateItem {
  id         Int      @id @default(autoincrement())
  empresaId  Int
  templateId Int
  ordem      Int      @default(0)
  tipo       TipoItemChecklist
  titulo     String
  descricao  String?
  critico    Boolean  @default(false)
  config     Json?
  template   ChecklistTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  @@index([empresaId])
  @@index([templateId])
}

model Checklist {
  id                Int      @id @default(autoincrement())
  empresaId         Int
  templateOrigemId  Int?
  nome              String
  categoria         String
  descricao         String?
  prioridade        PrioridadeChecklist @default(MEDIA)
  setorIds          Int[]
  recorrenciaTipo   RecorrenciaTipo @default(AVULSO)
  recorrenciaConfig Json?
  ativo             Boolean  @default(true)
  criadoEm          DateTime @default(now())
  atualizadoEm      DateTime @updatedAt
  itens             ChecklistItem[]
  execucoes         ChecklistExecucao[]
  @@index([empresaId])
}

model ChecklistItem {
  id          Int      @id @default(autoincrement())
  empresaId   Int
  checklistId Int
  ordem       Int      @default(0)
  tipo        TipoItemChecklist
  titulo      String
  descricao   String?
  critico     Boolean  @default(false)
  config      Json?
  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  @@index([empresaId])
  @@index([checklistId])
}

model ChecklistExecucao {
  id                Int      @id @default(autoincrement())
  empresaId         Int
  checklistId       Int
  dataRef           DateTime
  funcionarioId     Int
  iniciadaEm        DateTime @default(now())
  concluidaEm       DateTime?
  status            StatusExecucao @default(EM_ANDAMENTO)
  emAlerta          Boolean  @default(false)
  itensSnapshotJson Json
  checklist         Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  respostas         ChecklistResposta[]
  @@unique([checklistId, dataRef])
  @@index([empresaId, dataRef])
}

model ChecklistResposta {
  id           Int      @id @default(autoincrement())
  empresaId    Int
  execucaoId   Int
  itemChave    String
  tipo         TipoItemChecklist
  valorJson    Json?
  conforme     Boolean?
  observacao   String?
  atualizadoEm DateTime @updatedAt
  execucao     ChecklistExecucao @relation(fields: [execucaoId], references: [id], onDelete: Cascade)
  @@unique([execucaoId, itemChave])
  @@index([empresaId])
}
```

Em `model Funcionario`, adicione o campo:
```prisma
  setorIds     Int[]    @default([])
```

- [ ] **Step 2: Migration** — `backend/prisma/migrations/20260716310000_checklist/migration.sql`:

```sql
-- Checklist Inteligente (Fatia 1). Sem seed aqui — os templates são semeados
-- em JS na primeira leitura (cobre lojas criadas depois).

CREATE TYPE "TipoItemChecklist" AS ENUM ('CHECK','AVALIACAO','TEXTO','NUMERICO','SELECAO');
CREATE TYPE "PrioridadeChecklist" AS ENUM ('BAIXA','MEDIA','ALTA');
CREATE TYPE "RecorrenciaTipo" AS ENUM ('DIARIA','DIAS_SEMANA','AVULSO');
CREATE TYPE "StatusExecucao" AS ENUM ('EM_ANDAMENTO','CONCLUIDA');

ALTER TABLE "Funcionario" ADD COLUMN "setorIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE TABLE "Setor" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "nome" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Setor_empresaId_nome_key" ON "Setor"("empresaId","nome");
CREATE INDEX "Setor_empresaId_idx" ON "Setor"("empresaId");

CREATE TABLE "ChecklistTemplate" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "nome" TEXT NOT NULL,
  "categoria" TEXT NOT NULL, "descricao" TEXT, "tempoEstimadoMin" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true, "arquivado" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChecklistTemplate_empresaId_idx" ON "ChecklistTemplate"("empresaId");

CREATE TABLE "ChecklistTemplateItem" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "templateId" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "tipo" "TipoItemChecklist" NOT NULL, "titulo" TEXT NOT NULL,
  "descricao" TEXT, "critico" BOOLEAN NOT NULL DEFAULT false, "config" JSONB,
  CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChecklistTemplateItem_empresaId_idx" ON "ChecklistTemplateItem"("empresaId");
CREATE INDEX "ChecklistTemplateItem_templateId_idx" ON "ChecklistTemplateItem"("templateId");

CREATE TABLE "Checklist" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "templateOrigemId" INTEGER,
  "nome" TEXT NOT NULL, "categoria" TEXT NOT NULL, "descricao" TEXT,
  "prioridade" "PrioridadeChecklist" NOT NULL DEFAULT 'MEDIA',
  "setorIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "recorrenciaTipo" "RecorrenciaTipo" NOT NULL DEFAULT 'AVULSO', "recorrenciaConfig" JSONB,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Checklist_empresaId_idx" ON "Checklist"("empresaId");

CREATE TABLE "ChecklistItem" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "checklistId" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "tipo" "TipoItemChecklist" NOT NULL, "titulo" TEXT NOT NULL,
  "descricao" TEXT, "critico" BOOLEAN NOT NULL DEFAULT false, "config" JSONB,
  CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChecklistItem_empresaId_idx" ON "ChecklistItem"("empresaId");
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

CREATE TABLE "ChecklistExecucao" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "checklistId" INTEGER NOT NULL,
  "dataRef" TIMESTAMP(3) NOT NULL, "funcionarioId" INTEGER NOT NULL,
  "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "concluidaEm" TIMESTAMP(3),
  "status" "StatusExecucao" NOT NULL DEFAULT 'EM_ANDAMENTO', "emAlerta" BOOLEAN NOT NULL DEFAULT false,
  "itensSnapshotJson" JSONB NOT NULL,
  CONSTRAINT "ChecklistExecucao_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChecklistExecucao_checklistId_dataRef_key" ON "ChecklistExecucao"("checklistId","dataRef");
CREATE INDEX "ChecklistExecucao_empresaId_dataRef_idx" ON "ChecklistExecucao"("empresaId","dataRef");

CREATE TABLE "ChecklistResposta" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "execucaoId" INTEGER NOT NULL,
  "itemChave" TEXT NOT NULL, "tipo" "TipoItemChecklist" NOT NULL, "valorJson" JSONB,
  "conforme" BOOLEAN, "observacao" TEXT, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistResposta_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ChecklistExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChecklistResposta_execucaoId_itemChave_key" ON "ChecklistResposta"("execucaoId","itemChave");
CREATE INDEX "ChecklistResposta_empresaId_idx" ON "ChecklistResposta"("empresaId");
```

- [ ] **Step 3: `MODELS_TENANT`** — em `backend/server.js:24`, adicionar ao Set:
```js
  'setor', 'checklistTemplate', 'checklistTemplateItem', 'checklist', 'checklistItem', 'checklistExecucao', 'checklistResposta',
```

- [ ] **Step 4: Aplicar e verificar**
```bash
cd backend && npx prisma migrate deploy && npx prisma generate && node --check server.js
node checklistConformidade.test.js && node checklistRecorrencia.test.js
```
Expected: migration aplicada, client gerado, `server.js` sem erro, `20 ok` e `10 ok`.

- [ ] **Step 5: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260716310000_checklist backend/server.js
git commit -m "feat(checklist): models, enums e migration"
git push origin main
```

---

## Task 4: Seed de templates + endpoints admin de Setores e Templates

**Files:** Modify `backend/server.js` (constante de seed + bloco de endpoints antes do `app.listen`)

**Interfaces — Consumes:** models (Task 3). **Produces:**
- `GET/POST/PUT/DELETE /api/checklist/setores`
- `GET /api/checklist/templates` (+`?categoria`), `GET/POST/PUT/DELETE /api/checklist/templates/:id`
- `CHECKLIST_CATEGORIAS` (constante)

- [ ] **Step 1: Constante de seed + endpoints** — em `backend/server.js`, antes do `app.listen`:

```js
// ===== Checklist (ADMIN) — área `checklist` já protegida pelo middleware =====

const CHECKLIST_CATEGORIAS = ['Abertura', 'Fechamento', 'Controle de Pragas', 'Documentações Sanitárias', 'Segurança Alimentar'];

// Templates de fábrica (da referência), SEM itens de foto — o tipo FOTO chega na
// Fatia 2. Semeados por loja na 1ª leitura (cobre lojas criadas depois).
const CHECKLIST_TEMPLATES_SEED = [
  { nome: 'Abertura Cozinha', categoria: 'Abertura', descricao: 'Procedimentos obrigatórios para abertura da cozinha', tempoEstimadoMin: 20, itens: [
    { tipo: 'CHECK', titulo: 'Verificar validade dos insumos', critico: true },
    { tipo: 'NUMERICO', titulo: 'Temperatura da câmara fria', config: { unidade: '°C' } },
    { tipo: 'AVALIACAO', titulo: 'Estado de limpeza das bancadas', config: { notaMinima: 4 } },
    { tipo: 'CHECK', titulo: 'Ligar equipamentos' },
    { tipo: 'SELECAO', titulo: 'Verificar estoque crítico', config: { opcoes: [{ rotulo: 'Estoque OK', conforme: true }, { rotulo: 'Baixo estoque', conforme: true }, { rotulo: 'Sem estoque', conforme: false }] } },
    { tipo: 'TEXTO', titulo: 'Observações da abertura' },
  ] },
  { nome: 'Abertura Salão', categoria: 'Abertura', descricao: 'Checklist para garantir a correta abertura do salão', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Limpar e arrumar mesas' },
    { tipo: 'CHECK', titulo: 'Verificar cardápios nas mesas' },
    { tipo: 'AVALIACAO', titulo: 'Avaliação da apresentação', config: { notaMinima: 4 } },
  ] },
  { nome: 'Fechamento Salão', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento do salão', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Recolher todos os cardápios' },
    { tipo: 'CHECK', titulo: 'Limpar mesas e cadeiras' },
    { tipo: 'CHECK', titulo: 'Varrer e passar pano no piso' },
    { tipo: 'CHECK', titulo: 'Desligar luzes e ar-condicionado' },
  ] },
  { nome: 'Abertura Caixa', categoria: 'Abertura', descricao: 'Procedimentos de abertura do caixa', tempoEstimadoMin: 10, itens: [
    { tipo: 'NUMERICO', titulo: 'Conferir troco inicial', config: { unidade: 'un' } },
    { tipo: 'CHECK', titulo: 'Testar máquinas de cartão' },
    { tipo: 'CHECK', titulo: 'Ligar sistema PDV' },
    { tipo: 'SELECAO', titulo: 'Status das máquinas', config: { opcoes: [{ rotulo: 'Todas funcionando', conforme: true }, { rotulo: 'Uma com problema', conforme: false }, { rotulo: 'Várias com problema', conforme: false }] } },
  ] },
  { nome: 'Fechamento Caixa', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento do caixa', tempoEstimadoMin: 20, itens: [
    { tipo: 'CHECK', titulo: 'Verificar se há pedidos em aberto no sistema' },
    { tipo: 'CHECK', titulo: 'Realizar fechamento de caixa no sistema' },
    { tipo: 'CHECK', titulo: 'Imprimir e arquivar relatórios de pagamento' },
    { tipo: 'NUMERICO', titulo: 'Contar troco e sangria', config: { unidade: 'un' } },
    { tipo: 'CHECK', titulo: 'Armazenar malote em cofre' },
    { tipo: 'CHECK', titulo: 'Conferir recebimentos eletrônicos' },
    { tipo: 'CHECK', titulo: 'Carregar máquinas de cartão' },
    { tipo: 'CHECK', titulo: 'Encerrar sessão do iFood Manager' },
    { tipo: 'CHECK', titulo: 'Desligar equipamentos de front' },
  ] },
  { nome: 'Abertura Bar', categoria: 'Abertura', descricao: 'Checklist para garantir a correta abertura do bar', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Verificar estoque de bebidas' },
    { tipo: 'CHECK', titulo: 'Preparar mise en place' },
    { tipo: 'CHECK', titulo: 'Verificar gelo e frutas' },
    { tipo: 'CHECK', titulo: 'Limpar bancada do bar' },
  ] },
  { nome: 'Fechamento Bar', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento do bar', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Limpar todos os utensílios' },
    { tipo: 'CHECK', titulo: 'Guardar bebidas' },
    { tipo: 'CHECK', titulo: 'Descartar frutas vencidas' },
  ] },
  { nome: 'Fechamento Cozinha', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento da cozinha', tempoEstimadoMin: 25, itens: [
    { tipo: 'CHECK', titulo: 'Desligar todos os fogões', critico: true },
    { tipo: 'CHECK', titulo: 'Limpar bancadas e superfícies' },
    { tipo: 'CHECK', titulo: 'Armazenar alimentos corretamente' },
    { tipo: 'AVALIACAO', titulo: 'Avaliação geral do turno', config: { notaMinima: 3 } },
    { tipo: 'CHECK', titulo: 'Retirar lixo' },
  ] },
  { nome: 'Fechamento Gerência', categoria: 'Fechamento', descricao: 'Checklist de fechamento para a gerência', tempoEstimadoMin: 15, itens: [
    { tipo: 'NUMERICO', titulo: 'Revisar faturamento do dia', config: { unidade: 'un' } },
    { tipo: 'CHECK', titulo: 'Aprovar fechamento de caixa' },
    { tipo: 'TEXTO', titulo: 'Observações gerenciais' },
  ] },
  { nome: 'Controle de Pragas', categoria: 'Controle de Pragas', descricao: 'Inspeção periódica de controle de pragas', tempoEstimadoMin: 30, itens: [
    { tipo: 'CHECK', titulo: 'Inspeção de armadilhas' },
    { tipo: 'SELECAO', titulo: 'Nível de infestação', config: { opcoes: [{ rotulo: 'Nenhuma', conforme: true }, { rotulo: 'Leve', conforme: true }, { rotulo: 'Moderada', conforme: false }, { rotulo: 'Grave', conforme: false }] } },
    { tipo: 'TEXTO', titulo: 'Laudo técnico' },
  ] },
  { nome: 'Segurança Alimentar', categoria: 'Segurança Alimentar', descricao: 'Checklist de conformidade ANVISA', tempoEstimadoMin: 20, itens: [
    { tipo: 'NUMERICO', titulo: 'Temperatura do refrigerador', config: { unidade: '°C', min: 0, max: 4 } },
    { tipo: 'NUMERICO', titulo: 'Temperatura do freezer', config: { unidade: '°C', max: -18 } },
    { tipo: 'CHECK', titulo: 'EPIs sendo utilizados', critico: true },
    { tipo: 'AVALIACAO', titulo: 'Higiene das mãos', config: { notaMinima: 4 } },
  ] },
  { nome: 'Documentações Sanitárias', categoria: 'Documentações Sanitárias', descricao: 'Conferência de documentações sanitárias obrigatórias', tempoEstimadoMin: 30, itens: [
    { tipo: 'CHECK', titulo: 'Alvará sanitário válido', critico: true },
    { tipo: 'CHECK', titulo: 'Laudo de dedetização em dia' },
    { tipo: 'CHECK', titulo: 'POP atualizado' },
    { tipo: 'CHECK', titulo: 'Certificado de manipuladores' },
    { tipo: 'TEXTO', titulo: 'Observações' },
  ] },
];

// Semeia os templates de fábrica na 1ª vez (a extension injeta empresaId por linha,
// inclusive no createMany dos itens — mesmo padrão do garantirEtiquetaSetup).
async function garantirChecklistTemplatesSeed() {
  // findFirst (não count) — findFirst é escopado por empresaId pela extension; um
  // count() poderia contar entre lojas e nunca semear a 2ª loja. Mesmo cuidado do
  // garantirEtiquetaSetup.
  const existe = await prisma.checklistTemplate.findFirst();
  if (existe) return;
  for (const tpl of CHECKLIST_TEMPLATES_SEED) {
    const criado = await prisma.checklistTemplate.create({
      data: { nome: tpl.nome, categoria: tpl.categoria, descricao: tpl.descricao || null, tempoEstimadoMin: tpl.tempoEstimadoMin || null },
    });
    await prisma.checklistTemplateItem.createMany({
      data: tpl.itens.map((it, i) => ({ templateId: criado.id, ordem: i, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao || null, critico: !!it.critico, config: it.config || null })),
    });
  }
}

const chkOnly = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

// ---- Setores
app.get('/api/checklist/setores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json({ setores: await prisma.setor.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }) }); }
  catch (err) { console.error('[checklist/setores GET]', err); res.status(500).json({ error: 'Erro ao carregar setores.' }); }
});
app.post('/api/checklist/setores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = chkOnly(req.body?.nome, 60);
    if (!nome) return res.status(400).json({ error: 'Informe o nome do setor.' });
    const setor = await prisma.setor.create({ data: { nome, ordem: parseInt(req.body?.ordem, 10) || 0 } });
    res.status(201).json({ ok: true, setor });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
    console.error('[checklist/setores POST]', err); res.status(500).json({ error: 'Erro ao criar setor.' });
  }
});
app.put('/api/checklist/setores/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.setor.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Setor não encontrado.' });
    const data = {};
    if (req.body?.nome !== undefined) data.nome = chkOnly(req.body.nome, 60) || atual.nome;
    if (req.body?.ativo !== undefined) data.ativo = req.body.ativo !== false;
    if (req.body?.ordem !== undefined) data.ordem = parseInt(req.body.ordem, 10) || 0;
    const setor = await prisma.setor.update({ where: { id }, data });
    res.json({ ok: true, setor });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
    console.error('[checklist/setores PUT]', err); res.status(500).json({ error: 'Erro ao salvar setor.' });
  }
});
app.delete('/api/checklist/setores/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.setor.delete({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/setores DELETE]', err); res.status(500).json({ error: 'Erro ao excluir setor.' }); }
});

// ---- Templates
app.get('/api/checklist/templates', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    await garantirChecklistTemplatesSeed();
    const where = { arquivado: false };
    if (req.query.categoria && CHECKLIST_CATEGORIAS.includes(req.query.categoria)) where.categoria = req.query.categoria;
    const templates = await prisma.checklistTemplate.findMany({ where, orderBy: { nome: 'asc' }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.json({ templates, categorias: CHECKLIST_CATEGORIAS });
  } catch (err) { console.error('[checklist/templates GET]', err); res.status(500).json({ error: 'Erro ao carregar templates.' }); }
});
app.get('/api/checklist/templates/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const t = await prisma.checklistTemplate.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });
    res.json({ template: t });
  } catch (err) { console.error('[checklist/templates/:id GET]', err); res.status(500).json({ error: 'Erro ao carregar template.' }); }
});

// Valida e normaliza a lista de itens (compartilhado por template e checklist).
function chkNormalizarItens(itensRaw) {
  const TIPOS = new Set(['CHECK', 'AVALIACAO', 'TEXTO', 'NUMERICO', 'SELECAO']);
  const arr = Array.isArray(itensRaw) ? itensRaw : [];
  const itens = [];
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i] || {};
    if (!TIPOS.has(it.tipo)) throw { http: 400, msg: `Tipo de item inválido: ${it.tipo}` };
    const titulo = chkOnly(it.titulo, 160);
    if (!titulo) throw { http: 400, msg: 'Todo item precisa de um título.' };
    itens.push({ ordem: i, tipo: it.tipo, titulo, descricao: chkOnly(it.descricao, 300), critico: !!it.critico, config: it.config && typeof it.config === 'object' ? it.config : null });
  }
  return itens;
}

app.post('/api/checklist/templates', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = chkOnly(req.body?.nome, 120);
    if (!nome) return res.status(400).json({ error: 'Informe o nome do template.' });
    const categoria = CHECKLIST_CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : CHECKLIST_CATEGORIAS[0];
    let itens; try { itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    const t = await prisma.checklistTemplate.create({
      data: { nome, categoria, descricao: chkOnly(req.body?.descricao, 300), tempoEstimadoMin: parseInt(req.body?.tempoEstimadoMin, 10) || null, itens: { create: itens } },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });
    res.status(201).json({ ok: true, template: t });
  } catch (err) { console.error('[checklist/templates POST]', err); res.status(500).json({ error: 'Erro ao criar template.' }); }
});
app.put('/api/checklist/templates/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.checklistTemplate.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Template não encontrado.' });
    let itens; try { itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    // Substitui os itens (a edição reescreve a lista inteira). Templates são
    // biblioteca — execuções passadas usam snapshot, então isso não afeta histórico.
    const t = await prisma.$transaction(async (tx) => {
      await tx.checklistTemplateItem.deleteMany({ where: { templateId: id } });
      return tx.checklistTemplate.update({
        where: { id },
        data: {
          nome: chkOnly(req.body?.nome, 120) || atual.nome,
          categoria: CHECKLIST_CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : atual.categoria,
          descricao: chkOnly(req.body?.descricao, 300),
          tempoEstimadoMin: parseInt(req.body?.tempoEstimadoMin, 10) || null,
          itens: { create: itens },
        },
        include: { itens: { orderBy: { ordem: 'asc' } } },
      });
    });
    res.json({ ok: true, template: t });
  } catch (err) { console.error('[checklist/templates PUT]', err); res.status(500).json({ error: 'Erro ao salvar template.' }); }
});
app.delete('/api/checklist/templates/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.checklistTemplate.update({ where: { id: parseInt(req.params.id, 10) }, data: { arquivado: true } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/templates DELETE]', err); res.status(500).json({ error: 'Erro ao arquivar template.' }); }
});
```

- [ ] **Step 2: Verificar** — `cd backend && node --check server.js && node server.js &` ; `sleep 2` ; `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4001/api/checklist/templates` (espera **401**) ; `curl -s http://localhost:4001/api/health` ; `kill %1`.

- [ ] **Step 3: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): seed de templates + endpoints admin de setores e templates"
git push origin main
```

---

## Task 5: Tela do gestor — Templates e Setores

**Files:** Create `frontend/src/pages/Checklist.jsx`; Modify `frontend/src/App.jsx`

**Interfaces — Consumes:** endpoints das Tasks 4. **Produces:** rota `/checklist` e `/checklist/:tab` (`templates`|`setores`; abas `checklists` e `painel` chegam nas Tasks 7 e 10).

- [ ] **Step 1: Criar `frontend/src/pages/Checklist.jsx`** (molde de `PontoFacial.jsx`: `useParams`, `api` de `../services/api`, classes `page-header`/`page-header-sub`/`modal-tabs`/`av-tab`/`table-card`/`hb-table`/`form-input`/`btn`/`btn-primary`/`empty-state`; modal fecha só no botão):

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

const TABS = [['painel', 'Painel'], ['checklists', 'Checklists'], ['templates', 'Templates'], ['setores', 'Setores']]
const TIPO_LABEL = { CHECK: 'Check', AVALIACAO: 'Avaliação', TEXTO: 'Texto', NUMERICO: 'Numérico', SELECAO: 'Seleção' }

export default function Checklist() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const atual = TABS.some(([k]) => k === tab) ? tab : 'painel'
  return (
    <div>
      <div className="page-header"><h1>Checklist Inteligente</h1><p className="page-header-sub">Padronize rotinas, exija registro e acompanhe de longe.</p></div>
      <div className="modal-tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, label]) => <button key={k} type="button" className={`av-tab ${atual === k ? 'active' : ''}`} onClick={() => navigate(`/checklist/${k}`)}>{label}</button>)}
      </div>
      {atual === 'templates' && <AbaTemplates />}
      {atual === 'setores' && <AbaSetores />}
      {(atual === 'painel' || atual === 'checklists') && <div className="empty-state" style={{ padding: 28 }}>Em breve nesta fatia.</div>}
    </div>
  )
}

function AbaSetores() {
  const [setores, setSetores] = useState([])
  const [nome, setNome] = useState('')
  const carregar = () => api.get('/checklist/setores').then((r) => setSetores(r.data.setores)).catch(() => {})
  useEffect(() => { carregar() }, [])
  async function criar() { if (!nome.trim()) return; try { await api.post('/checklist/setores', { nome: nome.trim() }); setNome(''); carregar() } catch { /* toast */ } }
  async function excluir(id) { try { await api.delete(`/checklist/setores/${id}`); carregar() } catch { /* toast */ } }
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="table-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Novo setor (ex.: Cozinha)" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} />
          <button type="button" className="btn btn-primary" onClick={criar}>Adicionar</button>
        </div>
        {setores.length === 0 ? <p className="empty-state">Nenhum setor ainda.</p> : setores.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--app-border,#eee)' }}>
            <span style={{ fontWeight: 600 }}>{s.nome}</span>
            <button type="button" onClick={() => excluir(s.id)} className="btn btn-secondary btn-sm" style={{ color: '#dc2626' }}>Excluir</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AbaTemplates() {
  const [templates, setTemplates] = useState([])
  const [cats, setCats] = useState([])
  const [filtro, setFiltro] = useState('')
  const [ver, setVer] = useState(null)
  const carregar = () => api.get('/checklist/templates', { params: filtro ? { categoria: filtro } : {} }).then((r) => { setTemplates(r.data.templates); setCats(r.data.categorias) }).catch(() => {})
  useEffect(() => { carregar() }, [filtro])
  return (
    <div>
      <div className="modal-tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={`av-tab ${!filtro ? 'active' : ''}`} onClick={() => setFiltro('')}>Todos</button>
        {cats.map((c) => <button key={c} type="button" className={`av-tab ${filtro === c ? 'active' : ''}`} onClick={() => setFiltro(c)}>{c}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {templates.map((t) => (
          <div key={t.id} className="table-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>{t.categoria}</div>
            <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0' }}>{t.nome}</div>
            <div style={{ fontSize: 12, color: '#777', minHeight: 32 }}>{t.descricao}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: '#999' }}>
              <span>{t.itens.length} itens{t.tempoEstimadoMin ? ` · ${t.tempoEstimadoMin} min` : ''}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVer(t)}>Ver</button>
            </div>
          </div>
        ))}
      </div>
      {ver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--app-surface,#fff)', borderRadius: 16, padding: 20, maxWidth: 480, width: '100%', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{ver.nome}</div>
            <div style={{ fontSize: 12, color: '#777', marginBottom: 12 }}>{ver.categoria} · {ver.itens.length} itens{ver.tempoEstimadoMin ? ` · ${ver.tempoEstimadoMin} min` : ''}</div>
            {ver.itens.map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid var(--app-border,#eee)' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{it.titulo}{it.critico && <span style={{ color: '#dc2626' }}> *</span>}</span>
                <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{TIPO_LABEL[it.tipo]}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={() => setVer(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rota** — em `frontend/src/App.jsx`, importar `import Checklist from './pages/Checklist'` e trocar a linha `<Route path="checklist" element={<EmConstrucao …/>} />` por:
```jsx
            <Route path="checklist" element={<Checklist />} />
            <Route path="checklist/:tab" element={<Checklist />} />
```
Não remover o import de `EmConstrucao` (outras rotas usam).

- [ ] **Step 3: Build** — `cd frontend && npm run build` → `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Checklist.jsx frontend/src/App.jsx
git commit -m "feat(checklist): tela do gestor com Templates e Setores"
git push origin main
```

**Fim da F1.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh` (tem migration).

---

## Task 6: Endpoints admin de Checklists + setores do colaborador

**Files:** Modify `backend/server.js` (junto do bloco admin de checklist)

**Interfaces — Consumes:** `chkNormalizarItens`, `CHECKLIST_CATEGORIAS`, models. **Produces:**
- `GET/POST/PUT/DELETE /api/checklist/checklists`, `GET /api/checklist/checklists/:id`
- `POST /api/checklist/templates/:id/usar` → cria Checklist a partir do template
- `PUT /api/checklist/colaboradores/:id/setores`
- `GET /api/checklist/colaboradores` (lista funcionários + setores, para atribuir)

- [ ] **Step 1: Endpoints** — em `backend/server.js`, no bloco admin de checklist:

```js
const PRIORIDADES = new Set(['BAIXA', 'MEDIA', 'ALTA']);
const RECORRENCIAS = new Set(['DIARIA', 'DIAS_SEMANA', 'AVULSO']);

function chkDadosChecklist(body, fallback) {
  const nome = chkOnly(body?.nome, 120);
  if (!nome && !fallback) throw { http: 400, msg: 'Informe o nome do checklist.' };
  const setorIds = Array.isArray(body?.setorIds) ? [...new Set(body.setorIds.map((n) => parseInt(n, 10)).filter(Number.isFinite))] : (fallback?.setorIds || []);
  const rc = body?.recorrenciaConfig && typeof body.recorrenciaConfig === 'object' ? body.recorrenciaConfig : {};
  const diasSemana = Array.isArray(rc.diasSemana) ? [...new Set(rc.diasSemana.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))] : [];
  return {
    nome: nome || fallback.nome,
    categoria: CHECKLIST_CATEGORIAS.includes(body?.categoria) ? body.categoria : (fallback?.categoria || CHECKLIST_CATEGORIAS[0]),
    descricao: chkOnly(body?.descricao, 300),
    prioridade: PRIORIDADES.has(body?.prioridade) ? body.prioridade : (fallback?.prioridade || 'MEDIA'),
    setorIds,
    recorrenciaTipo: RECORRENCIAS.has(body?.recorrenciaTipo) ? body.recorrenciaTipo : (fallback?.recorrenciaTipo || 'AVULSO'),
    recorrenciaConfig: { diasSemana, horarioLimite: chkOnly(rc.horarioLimite, 5) },
  };
}

app.get('/api/checklist/checklists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = { ativo: true };
    if (busca) where.nome = { contains: busca, mode: 'insensitive' };
    const checklists = await prisma.checklist.findMany({ where, orderBy: { nome: 'asc' }, include: { _count: { select: { itens: true } } } });
    res.json({ checklists });
  } catch (err) { console.error('[checklist/checklists GET]', err); res.status(500).json({ error: 'Erro ao carregar checklists.' }); }
});
app.get('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await prisma.checklist.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    res.json({ checklist: c });
  } catch (err) { console.error('[checklist/checklists/:id GET]', err); res.status(500).json({ error: 'Erro ao carregar checklist.' }); }
});
app.post('/api/checklist/checklists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let dados, itens;
    try { dados = chkDadosChecklist(req.body, null); itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    const c = await prisma.checklist.create({
      data: { ...dados, templateOrigemId: parseInt(req.body?.templateOrigemId, 10) || null, itens: { create: itens } },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });
    res.status(201).json({ ok: true, checklist: c });
  } catch (err) { console.error('[checklist/checklists POST]', err); res.status(500).json({ error: 'Erro ao criar checklist.' }); }
});
app.put('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.checklist.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Checklist não encontrado.' });
    let dados, itens;
    try { dados = chkDadosChecklist(req.body, atual); itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    const c = await prisma.$transaction(async (tx) => {
      await tx.checklistItem.deleteMany({ where: { checklistId: id } });
      return tx.checklist.update({ where: { id }, data: { ...dados, itens: { create: itens } }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    });
    res.json({ ok: true, checklist: c });
  } catch (err) { console.error('[checklist/checklists PUT]', err); res.status(500).json({ error: 'Erro ao salvar checklist.' }); }
});
app.delete('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.checklist.update({ where: { id: parseInt(req.params.id, 10) }, data: { ativo: false } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/checklists DELETE]', err); res.status(500).json({ error: 'Erro ao excluir checklist.' }); }
});

// Usar template como base → cria um Checklist copiando os itens (snapshot leve).
app.post('/api/checklist/templates/:id/usar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const t = await prisma.checklistTemplate.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });
    const c = await prisma.checklist.create({
      data: {
        templateOrigemId: t.id, nome: t.nome, categoria: t.categoria, descricao: t.descricao,
        itens: { create: t.itens.map((it, i) => ({ ordem: i, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao, critico: it.critico, config: it.config })) },
      },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });
    res.status(201).json({ ok: true, checklist: c });
  } catch (err) { console.error('[checklist/templates/usar]', err); res.status(500).json({ error: 'Erro ao criar a partir do template.' }); }
});

// Colaboradores + atribuição de setor
app.get('/api/checklist/colaboradores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const fs = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true, setorIds: true } });
    res.json({ colaboradores: fs });
  } catch (err) { console.error('[checklist/colaboradores GET]', err); res.status(500).json({ error: 'Erro ao carregar colaboradores.' }); }
});
app.put('/api/checklist/colaboradores/:id/setores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    const setorIds = Array.isArray(req.body?.setorIds) ? [...new Set(req.body.setorIds.map((n) => parseInt(n, 10)).filter(Number.isFinite))] : [];
    await prisma.funcionario.update({ where: { id }, data: { setorIds } });
    res.json({ ok: true, setorIds });
  } catch (err) { console.error('[checklist/colaboradores setores]', err); res.status(500).json({ error: 'Erro ao salvar setores.' }); }
});
```

- [ ] **Step 2: Verificar** — `node --check server.js`; subir e conferir `401` em `/api/checklist/checklists`; `kill`.

- [ ] **Step 3: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): endpoints admin de checklists + setores do colaborador"
git push origin main
```

---

## Task 7: Tela do gestor — Checklists (CRUD + editor) + atribuir setores

**Files:** Modify `frontend/src/pages/Checklist.jsx`

**Interfaces — Consumes:** endpoints da Task 6.

- [ ] **Step 1: Aba Checklists + editor** — em `Checklist.jsx`, trocar o render placeholder de `checklists` por `<AbaChecklists />` e adicionar os componentes ao fim do arquivo. O editor cobre: nome, categoria, prioridade, setores (multi-seleção dos setores cadastrados), recorrência (DIARIA/DIAS_SEMANA/AVULSO + dias da semana + horário limite) e itens (adicionar/remover, tipo, título, crítico, config por tipo). Reusa `TIPO_LABEL`. "Usar como base" chama `POST /checklist/templates/:id/usar` e abre o editor no checklist criado.

```jsx
// (adicionar ao topo, junto de TIPO_LABEL)
const PRIORIDADE_LABEL = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' }
const REC_LABEL = { DIARIA: 'Todo dia', DIAS_SEMANA: 'Dias da semana', AVULSO: 'Sem agendamento' }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TIPOS = ['CHECK', 'AVALIACAO', 'TEXTO', 'NUMERICO', 'SELECAO']

function AbaChecklists() {
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [edit, setEdit] = useState(null) // objeto checklist em edição, ou {novo:true}
  const carregar = () => api.get('/checklist/checklists', { params: busca ? { busca } : {} }).then((r) => setLista(r.data.checklists)).catch(() => {})
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t) }, [busca])
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="form-input" style={{ maxWidth: 320 }} placeholder="Buscar checklist…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setEdit({ novo: true, nome: '', categoria: 'Abertura', prioridade: 'MEDIA', setorIds: [], recorrenciaTipo: 'AVULSO', recorrenciaConfig: { diasSemana: [], horarioLimite: '' }, itens: [] })}>+ Novo checklist</button>
      </div>
      <div className="table-card">
        <table className="hb-table">
          <thead><tr><th>Nome</th><th>Categoria</th><th>Prioridade</th><th>Recorrência</th><th>Itens</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#999' }}>Nenhum checklist. Crie um ou use um template.</td></tr>}
            {lista.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.nome}</td><td>{c.categoria}</td><td>{PRIORIDADE_LABEL[c.prioridade]}</td>
                <td>{REC_LABEL[c.recorrenciaTipo]}</td><td>{c._count?.itens ?? '—'}</td>
                <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => api.get(`/checklist/checklists/${c.id}`).then((r) => setEdit(r.data.checklist))}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ChecklistEditor inicial={edit} onClose={() => setEdit(null)} onSalvou={() => { setEdit(null); carregar() }} />}
    </div>
  )
}

function ChecklistEditor({ inicial, onClose, onSalvou }) {
  const [f, setF] = useState(() => ({ ...inicial, recorrenciaConfig: inicial.recorrenciaConfig || { diasSemana: [], horarioLimite: '' }, itens: inicial.itens || [] }))
  const [setores, setSetores] = useState([])
  const [cats, setCats] = useState(['Abertura', 'Fechamento', 'Controle de Pragas', 'Documentações Sanitárias', 'Segurança Alimentar'])
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api.get('/checklist/setores').then((r) => setSetores(r.data.setores)).catch(() => {}) }, [])
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const updRc = (k, v) => setF((s) => ({ ...s, recorrenciaConfig: { ...s.recorrenciaConfig, [k]: v } }))
  const toggleSetor = (id) => setF((s) => ({ ...s, setorIds: s.setorIds.includes(id) ? s.setorIds.filter((x) => x !== id) : [...s.setorIds, id] }))
  const toggleDow = (d) => updRc('diasSemana', f.recorrenciaConfig.diasSemana.includes(d) ? f.recorrenciaConfig.diasSemana.filter((x) => x !== d) : [...f.recorrenciaConfig.diasSemana, d])
  const setItem = (i, patch) => setF((s) => ({ ...s, itens: s.itens.map((it, j) => j === i ? { ...it, ...patch } : it) }))
  const addItem = () => setF((s) => ({ ...s, itens: [...s.itens, { tipo: 'CHECK', titulo: '', critico: false, config: {} }] }))
  const rmItem = (i) => setF((s) => ({ ...s, itens: s.itens.filter((_, j) => j !== i) }))

  async function salvar() {
    setSalvando(true)
    try {
      const body = { nome: f.nome, categoria: f.categoria, descricao: f.descricao, prioridade: f.prioridade, setorIds: f.setorIds, recorrenciaTipo: f.recorrenciaTipo, recorrenciaConfig: f.recorrenciaConfig, itens: f.itens, templateOrigemId: f.templateOrigemId }
      if (f.novo || !f.id) await api.post('/checklist/checklists', body); else await api.put(`/checklist/checklists/${f.id}`, body)
      onSalvou()
    } catch { /* toast */ } finally { setSalvando(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'var(--app-surface,#fff)', borderRadius: 16, padding: 20, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{f.novo ? 'Novo checklist' : 'Editar checklist'}</h2>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Nome</label><input className="form-input" value={f.nome} onChange={(e) => upd('nome', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Categoria</label><select className="form-input" value={f.categoria} onChange={(e) => upd('categoria', e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Prioridade</label><select className="form-input" value={f.prioridade} onChange={(e) => upd('prioridade', e.target.value)}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option></select></div>
          <div className="form-group"><label className="form-label">Recorrência</label><select className="form-input" value={f.recorrenciaTipo} onChange={(e) => upd('recorrenciaTipo', e.target.value)}><option value="DIARIA">Todo dia</option><option value="DIAS_SEMANA">Dias da semana</option><option value="AVULSO">Sem agendamento</option></select></div>
        </div>
        {f.recorrenciaTipo === 'DIAS_SEMANA' && (
          <div className="form-group"><label className="form-label">Dias</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{DOW.map((d, i) => <button key={i} type="button" onClick={() => toggleDow(i)} className="btn btn-sm" style={{ border: f.recorrenciaConfig.diasSemana.includes(i) ? '2px solid #7c3aed' : '1px solid #ddd', background: '#fff' }}>{d}</button>)}</div>
          </div>
        )}
        {f.recorrenciaTipo !== 'AVULSO' && (
          <div className="form-group"><label className="form-label">Horário limite (opcional)</label><input className="form-input" style={{ maxWidth: 120 }} placeholder="HH:mm" value={f.recorrenciaConfig.horarioLimite || ''} onChange={(e) => updRc('horarioLimite', e.target.value)} /></div>
        )}
        <div className="form-group"><label className="form-label">Setores</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {setores.length === 0 ? <span style={{ fontSize: 12, color: '#999' }}>Cadastre setores na aba Setores.</span> : setores.map((s) => <button key={s.id} type="button" onClick={() => toggleSetor(s.id)} className="btn btn-sm" style={{ border: f.setorIds.includes(s.id) ? '2px solid #7c3aed' : '1px solid #ddd', background: '#fff' }}>{s.nome}</button>)}
          </div>
        </div>

        <label className="form-label" style={{ marginTop: 8 }}>Itens</label>
        {f.itens.map((it, i) => (
          <div key={i} className="table-card" style={{ padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="form-input" style={{ width: 130 }} value={it.tipo} onChange={(e) => setItem(i, { tipo: e.target.value, config: {} })}>{TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select>
              <input className="form-input" style={{ flex: 1, minWidth: 0 }} placeholder="Título do item" value={it.titulo} onChange={(e) => setItem(i, { titulo: e.target.value })} />
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!it.critico} onChange={(e) => setItem(i, { critico: e.target.checked })} />crítico</label>
              <button type="button" className="btn btn-sm" style={{ color: '#dc2626' }} onClick={() => rmItem(i)}>✕</button>
            </div>
            {it.tipo === 'NUMERICO' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input className="form-input" style={{ width: 90 }} placeholder="unidade" value={it.config?.unidade || ''} onChange={(e) => setItem(i, { config: { ...it.config, unidade: e.target.value } })} />
                <input className="form-input" type="number" style={{ width: 80 }} placeholder="min" value={it.config?.min ?? ''} onChange={(e) => setItem(i, { config: { ...it.config, min: e.target.value === '' ? undefined : Number(e.target.value) } })} />
                <input className="form-input" type="number" style={{ width: 80 }} placeholder="max" value={it.config?.max ?? ''} onChange={(e) => setItem(i, { config: { ...it.config, max: e.target.value === '' ? undefined : Number(e.target.value) } })} />
              </div>
            )}
            {it.tipo === 'AVALIACAO' && (
              <input className="form-input" type="number" min={1} max={5} style={{ width: 140, marginTop: 6 }} placeholder="nota mínima" value={it.config?.notaMinima ?? ''} onChange={(e) => setItem(i, { config: { ...it.config, notaMinima: e.target.value === '' ? undefined : Number(e.target.value) } })} />
            )}
            {it.tipo === 'SELECAO' && (
              <div style={{ marginTop: 6 }}>
                {(it.config?.opcoes || []).map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <input className="form-input" style={{ flex: 1 }} placeholder="opção" value={o.rotulo} onChange={(e) => setItem(i, { config: { ...it.config, opcoes: it.config.opcoes.map((x, j) => j === oi ? { ...x, rotulo: e.target.value } : x) } })} />
                    <label style={{ fontSize: 12, display: 'flex', gap: 4 }}><input type="checkbox" checked={o.conforme !== false} onChange={(e) => setItem(i, { config: { ...it.config, opcoes: it.config.opcoes.map((x, j) => j === oi ? { ...x, conforme: e.target.checked } : x) } })} />conforme</label>
                    <button type="button" className="btn btn-sm" onClick={() => setItem(i, { config: { ...it.config, opcoes: it.config.opcoes.filter((_, j) => j !== oi) } })}>✕</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItem(i, { config: { ...it.config, opcoes: [...(it.config?.opcoes || []), { rotulo: '', conforme: true }] } })}>+ opção</button>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar item</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
```

E no modal de "Ver template" (`AbaTemplates`), adicionar o botão **Usar como base** ao lado de Fechar:
```jsx
            <button type="button" className="btn btn-primary" onClick={() => api.post(`/checklist/templates/${ver.id}/usar`).then(() => { setVer(null); navigate('/checklist/checklists') })}>Usar como base</button>
```
(injetar `const navigate = useNavigate()` em `AbaTemplates`).

- [ ] **Step 2: Build** — `npm run build` → `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Checklist.jsx
git commit -m "feat(checklist): editor de checklists (CRUD, recorrencia, setores, itens)"
git push origin main
```

**Fim da F2.**

---

## Task 8: Execução — endpoints do colaborador

**Files:** Modify `backend/server.js` (bloco público, junto de `/api/public/colaborador/*`)

**Interfaces — Consumes:** `avaliarResposta`, `execucaoEmAlerta` (Task 1); `venceHoje` (Task 2); `janelaExpedienteAtual`, `brFields`, `exigirColaborador`. **Produces:**
- `GET /api/public/colaborador/checklists` · `POST .../checklists/:id/iniciar` · `GET .../execucoes/:id` · `PUT .../execucoes/:id/resposta` · `POST .../execucoes/:id/concluir` · `GET .../checklists/historico`

- [ ] **Step 1: Imports** — no topo do `server.js`, junto dos outros:
```js
import { avaliarResposta, execucaoEmAlerta } from './checklistConformidade.js';
import { venceHoje } from './checklistRecorrencia.js';
```

- [ ] **Step 2: Endpoints** — em `backend/server.js`, junto do bloco `/api/public/colaborador/*` (rotas FORA do tenantStore — `empresaId` explícito em TODA query):

```js
// ===== Checklist — Área do Colaborador (execução; sessão OTP) =====
// Fora do gate: empresaId vem de exigirColaborador; passar explícito em toda query.

// Início do dia de expediente atual (corte 05:00 BR) — instante canônico do dataRef.
function chkDataRefAtual() { return janelaExpedienteAtual().de; }
function chkDiaSemanaExpediente() { const f = brFields(chkDataRefAtual().getTime()); return new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay(); }

// Snapshot dos itens do checklist para congelar na execução.
function chkSnapshot(itens) {
  return itens.map((it) => ({ chave: String(it.id), ordem: it.ordem, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao || null, critico: it.critico, config: it.config || null }));
}

app.get('/api/public/colaborador/checklists', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível. Fale com a liderança.' });
    const meus = Array.isArray(func.setorIds) ? func.setorIds : [];
    if (meus.length === 0) return res.json({ hoje: [], disponiveis: [] });

    const checklists = await prisma.checklist.findMany({ where: { empresaId: sess.empresaId, ativo: true, setorIds: { hasSome: meus } }, include: { _count: { select: { itens: true } } } });
    const dataRef = chkDataRefAtual();
    const dow = chkDiaSemanaExpediente();
    // Execuções do dia (para saber o que já foi concluído).
    const execs = await prisma.checklistExecucao.findMany({ where: { empresaId: sess.empresaId, dataRef }, select: { checklistId: true, status: true, emAlerta: true } });
    const execMap = new Map(execs.map((e) => [e.checklistId, e]));
    const mapear = (c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, itens: c._count.itens, recorrenciaTipo: c.recorrenciaTipo, status: execMap.get(c.id)?.status || null, emAlerta: execMap.get(c.id)?.emAlerta || false });
    const hoje = [], disponiveis = [];
    for (const c of checklists) {
      if (venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) hoje.push(mapear(c));
      else if (c.recorrenciaTipo === 'AVULSO') disponiveis.push(mapear(c));
    }
    res.json({ hoje, disponiveis });
  } catch (err) { console.error('[colab/checklists]', err); res.status(500).json({ error: 'Erro ao carregar checklists.' }); }
});

// Verifica posse (checklist do meu setor) e devolve a execução do dia com snapshot.
async function chkAbrirExecucao(sess, checklistId) {
  const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
  if (!func || func.status !== 'ATIVO') throw { http: 401, msg: 'Acesso indisponível.' };
  const meus = Array.isArray(func.setorIds) ? func.setorIds : [];
  const c = await prisma.checklist.findFirst({ where: { id: checklistId, empresaId: sess.empresaId, ativo: true }, include: { itens: { orderBy: { ordem: 'asc' } } } });
  if (!c) throw { http: 404, msg: 'Checklist não encontrado.' };
  if (!c.setorIds.some((s) => meus.includes(s))) throw { http: 403, msg: 'Este checklist não é do seu setor.' };
  const dataRef = chkDataRefAtual();
  let exec = await prisma.checklistExecucao.findFirst({ where: { checklistId: c.id, dataRef }, include: { respostas: true } });
  if (!exec) {
    exec = await prisma.checklistExecucao.create({
      data: { empresaId: sess.empresaId, checklistId: c.id, dataRef, funcionarioId: func.id, itensSnapshotJson: chkSnapshot(c.itens) },
      include: { respostas: true },
    });
  }
  return { exec, checklist: c };
}

app.post('/api/public/colaborador/checklists/:id/iniciar', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const { exec } = await chkAbrirExecucao(sess, parseInt(req.params.id, 10));
    res.status(201).json({ execucao: chkExecJson(exec) });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/iniciar]', e); res.status(500).json({ error: 'Erro ao iniciar.' }); }
});

function chkExecJson(exec) {
  const rmap = {}; for (const r of exec.respostas || []) rmap[r.itemChave] = { valor: r.valorJson, conforme: r.conforme, observacao: r.observacao };
  return { id: exec.id, checklistId: exec.checklistId, status: exec.status, emAlerta: exec.emAlerta, itens: exec.itensSnapshotJson, respostas: rmap };
}

app.get('/api/public/colaborador/execucoes/:id', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await prisma.checklistExecucao.findFirst({ where: { id: parseInt(req.params.id, 10), empresaId: sess.empresaId }, include: { respostas: true } });
    if (!exec) return res.status(404).json({ error: 'Execução não encontrada.' });
    res.json({ execucao: chkExecJson(exec) });
  } catch (err) { console.error('[colab/execucao GET]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.put('/api/public/colaborador/execucoes/:id/resposta', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await prisma.checklistExecucao.findFirst({ where: { id: parseInt(req.params.id, 10), empresaId: sess.empresaId } });
    if (!exec) return res.status(404).json({ error: 'Execução não encontrada.' });
    if (exec.status === 'CONCLUIDA') return res.status(409).json({ error: 'Execução já concluída.' });
    const itemChave = String(req.body?.itemChave || '');
    const item = (exec.itensSnapshotJson || []).find((it) => it.chave === itemChave);
    if (!item) return res.status(400).json({ error: 'Item inválido.' });
    // Conformidade recalculada no servidor — o cliente não decide se passou.
    const { conforme } = avaliarResposta({ tipo: item.tipo, config: item.config, valor: req.body?.valor });
    const observacao = req.body?.observacao == null ? null : String(req.body.observacao).slice(0, 500);
    const existente = await prisma.checklistResposta.findFirst({ where: { execucaoId: exec.id, itemChave } });
    const dados = { tipo: item.tipo, valorJson: req.body?.valor ?? null, conforme, observacao };
    const resp = existente
      ? await prisma.checklistResposta.update({ where: { id: existente.id }, data: dados })
      : await prisma.checklistResposta.create({ data: { ...dados, empresaId: sess.empresaId, execucaoId: exec.id, itemChave } });
    res.json({ ok: true, itemChave, conforme: resp.conforme });
  } catch (err) { console.error('[colab/resposta]', err); res.status(500).json({ error: 'Erro ao salvar resposta.' }); }
});

app.post('/api/public/colaborador/execucoes/:id/concluir', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await prisma.checklistExecucao.findFirst({ where: { id: parseInt(req.params.id, 10), empresaId: sess.empresaId }, include: { respostas: true } });
    if (!exec) return res.status(404).json({ error: 'Execução não encontrada.' });
    const rmap = {}; for (const r of exec.respostas) rmap[r.itemChave] = { conforme: r.conforme };
    const emAlerta = execucaoEmAlerta(exec.itensSnapshotJson, rmap);
    const atual = await prisma.checklistExecucao.update({ where: { id: exec.id }, data: { status: 'CONCLUIDA', concluidaEm: new Date(), emAlerta } });
    res.json({ ok: true, status: atual.status, emAlerta });
  } catch (err) { console.error('[colab/concluir]', err); res.status(500).json({ error: 'Erro ao concluir.' }); }
});

app.get('/api/public/colaborador/checklists/historico', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const execs = await prisma.checklistExecucao.findMany({
      where: { empresaId: sess.empresaId, funcionarioId: sess.funcionarioId, status: 'CONCLUIDA' },
      orderBy: { concluidaEm: 'desc' }, take: 50, include: { checklist: { select: { nome: true, categoria: true } } },
    });
    res.json({ historico: execs.map((e) => ({ id: e.id, nome: e.checklist?.nome, categoria: e.checklist?.categoria, concluidaEm: e.concluidaEm, emAlerta: e.emAlerta })) });
  } catch (err) { console.error('[colab/historico]', err); res.status(500).json({ error: 'Erro ao carregar histórico.' }); }
});
```

- [ ] **Step 3: Verificar** — `node --check server.js`; subir; `curl` sem token em `GET /api/public/colaborador/checklists` → **401**; `node checklistConformidade.test.js && node checklistRecorrencia.test.js` (não pode quebrar); `kill`.

- [ ] **Step 4: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): endpoints de execucao na area do colaborador"
git push origin main
```

---

## Task 9: Execução — aba Checklists na Área do Colaborador

**Files:** Modify `frontend/src/pages/BonificacaoEu.jsx`

**Interfaces — Consumes:** endpoints da Task 8. A página já tem `colabApi` (axios com o token OTP) — usar o mesmo cliente que as outras abas usam.

- [ ] **Step 1: Nova aba** — em `BonificacaoEu.jsx`, adicionar ao `TABS`: `['checklists', 'Checklists', '✅']`, e no render `{tab === 'checklists' && <TabChecklists />}`. Adicionar o componente (usa o mesmo cliente autenticado das outras abas — confirmar o nome real no arquivo, ex.: `colabApi`):

```jsx
function TabChecklists() {
  const [dados, setDados] = useState(null)
  const [exec, setExec] = useState(null)
  const carregar = () => colabApi.get('/public/colaborador/checklists').then((r) => setDados(r.data)).catch(() => setDados({ hoje: [], disponiveis: [] }))
  useEffect(() => { carregar() }, [])

  async function abrir(c) { try { const r = await colabApi.post(`/public/colaborador/checklists/${c.id}/iniciar`); setExec(r.data.execucao) } catch { /* toast */ } }
  if (exec) return <ExecutarChecklist exec={exec} onSair={() => { setExec(null); carregar() }} />
  if (!dados) return <div className="empty-state">Carregando…</div>

  const Card = ({ c }) => (
    <button type="button" onClick={() => abrir(c)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 14, borderRadius: 12, border: '1px solid var(--app-border,#eee)', background: '#fff', marginBottom: 8 }}>
      <div style={{ fontWeight: 700 }}>{c.nome}</div>
      <div style={{ fontSize: 12, color: '#777' }}>{c.categoria} · {c.itens} itens {c.status === 'CONCLUIDA' ? '· ✅ concluído' : c.status === 'EM_ANDAMENTO' ? '· em andamento' : ''}</div>
    </button>
  )
  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: '4px 0 8px' }}>Para hoje</h3>
      {dados.hoje.length === 0 ? <p className="empty-state">Nada para hoje.</p> : dados.hoje.map((c) => <Card key={c.id} c={c} />)}
      {dados.disponiveis.length > 0 && <>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '16px 0 8px' }}>Disponíveis</h3>
        {dados.disponiveis.map((c) => <Card key={c.id} c={c} />)}
      </>}
    </div>
  )
}

function ExecutarChecklist({ exec, onSair }) {
  const [respostas, setRespostas] = useState(exec.respostas || {})
  const [concluida, setConcluida] = useState(exec.status === 'CONCLUIDA')
  const salvar = async (chave, tipo, config, valor, observacao) => {
    setRespostas((s) => ({ ...s, [chave]: { ...s[chave], valor, observacao } }))
    try { const r = await colabApi.put(`/public/colaborador/execucoes/${exec.id}/resposta`, { itemChave: chave, valor, observacao }); setRespostas((s) => ({ ...s, [chave]: { ...s[chave], conforme: r.data.conforme } })) } catch { /* toast */ }
  }
  async function concluir() { try { await colabApi.post(`/public/colaborador/execucoes/${exec.id}/concluir`); setConcluida(true) } catch { /* toast */ } }
  if (concluida) return <div style={{ textAlign: 'center', padding: 24 }}><div style={{ fontSize: 40 }}>✅</div><p style={{ fontWeight: 700 }}>Checklist concluído!</p><button type="button" className="btn btn-primary" onClick={onSair} style={{ marginTop: 12 }}>Voltar</button></div>

  return (
    <div>
      <button type="button" onClick={onSair} style={{ fontSize: 13, marginBottom: 10 }}>← voltar</button>
      {exec.itens.map((it) => {
        const r = respostas[it.chave] || {}
        return (
          <div key={it.chave} style={{ padding: 12, borderRadius: 12, border: '1px solid var(--app-border,#eee)', background: '#fff', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{it.titulo}{it.critico && <span style={{ color: '#dc2626' }}> *</span>}</div>
            {it.tipo === 'CHECK' && <button type="button" onClick={() => salvar(it.chave, it.tipo, it.config, !(r.valor === true), r.observacao)} className="btn btn-sm" style={{ border: r.valor === true ? '2px solid #16a34a' : '1px solid #ddd', background: '#fff' }}>{r.valor === true ? '✔ Feito' : 'Marcar'}</button>}
            {it.tipo === 'AVALIACAO' && <div style={{ display: 'flex', gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => salvar(it.chave, it.tipo, it.config, n, r.observacao)} style={{ fontSize: 22, background: 'none', border: 'none' }}>{n <= (r.valor || 0) ? '★' : '☆'}</button>)}</div>}
            {it.tipo === 'TEXTO' && <textarea className="form-input" rows={2} value={r.valor || ''} onChange={(e) => setRespostas((s) => ({ ...s, [it.chave]: { ...s[it.chave], valor: e.target.value } }))} onBlur={(e) => salvar(it.chave, it.tipo, it.config, e.target.value, r.observacao)} />}
            {it.tipo === 'NUMERICO' && <input className="form-input" type="number" style={{ maxWidth: 160 }} placeholder={it.config?.unidade || ''} defaultValue={r.valor ?? ''} onBlur={(e) => salvar(it.chave, it.tipo, it.config, e.target.value === '' ? null : Number(e.target.value), r.observacao)} />}
            {it.tipo === 'SELECAO' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(it.config?.opcoes || []).map((o) => <button key={o.rotulo} type="button" onClick={() => salvar(it.chave, it.tipo, it.config, o.rotulo, r.observacao)} className="btn btn-sm" style={{ border: r.valor === o.rotulo ? '2px solid #7c3aed' : '1px solid #ddd', background: '#fff' }}>{o.rotulo}</button>)}</div>}
            {r.conforme === false && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>⚠ fora do padrão</div>}
          </div>
        )
      })}
      <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={concluir}>Concluir checklist</button>
    </div>
  )
}
```

> **Nota ao implementador:** confirme o nome real do cliente axios autenticado em `BonificacaoEu.jsx` (as outras abas já fazem chamadas autenticadas — use exatamente o mesmo). Se for `colabApi`, o código acima já está certo; se tiver outro nome, troque as 5 chamadas.

- [ ] **Step 2: Build** — `npm run build` → `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/BonificacaoEu.jsx
git commit -m "feat(checklist): execucao na area do colaborador (aba Checklists)"
git push origin main
```

**Fim da F3.** Deploy.

---

## Task 10: Dashboard do gestor

**Files:** Modify `backend/server.js` (bloco admin) e `frontend/src/pages/Checklist.jsx`

**Interfaces — Consumes:** `venceHoje`, `janelaExpedienteAtual`, `brFields`, models. **Produces:** `GET /api/checklist/painel`.

- [ ] **Step 1: Endpoint** — em `backend/server.js`, no bloco admin de checklist:

```js
app.get('/api/checklist/painel', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const dataRef = janelaExpedienteAtual().de;
    const f = brFields(dataRef.getTime());
    const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
    const checklists = await prisma.checklist.findMany({ where: { ativo: true }, include: { _count: { select: { itens: true } } } });
    const execs = await prisma.checklistExecucao.findMany({ where: { dataRef }, select: { checklistId: true, status: true, emAlerta: true } });
    const execMap = new Map(execs.map((e) => [e.checklistId, e]));
    const venceHojeLista = checklists.filter((c) => venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow));
    const concluidosHoje = execs.filter((e) => e.status === 'CONCLUIDA').length;
    const emAlerta = execs.filter((e) => e.emAlerta).length;
    const pendentes = venceHojeLista.filter((c) => execMap.get(c.id)?.status !== 'CONCLUIDA')
      .map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, status: execMap.get(c.id)?.status || 'PENDENTE' }));
    const alertas = checklists.filter((c) => execMap.get(c.id)?.emAlerta).map((c) => ({ id: c.id, nome: c.nome }));
    res.json({
      kpis: { ativos: checklists.length, venceHoje: venceHojeLista.length, concluidosHoje, emAlerta },
      pendentes, alertas,
      meus: checklists.slice(0, 20).map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, recorrenciaTipo: c.recorrenciaTipo, itens: c._count.itens })),
    });
  } catch (err) { console.error('[checklist/painel]', err); res.status(500).json({ error: 'Erro ao carregar o painel.' }); }
});
```

- [ ] **Step 2: Painel no frontend** — em `Checklist.jsx`, trocar o placeholder de `painel` por `<AbaPainel />`:

```jsx
function AbaPainel() {
  const [p, setP] = useState(null)
  useEffect(() => { api.get('/checklist/painel').then((r) => setP(r.data)).catch(() => {}) }, [])
  if (!p) return <div className="empty-state">Carregando…</div>
  const KPI = ({ n, label }) => <div className="table-card" style={{ padding: 16 }}><div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: '#777' }}>{label}</div></div>
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPI n={p.kpis.ativos} label="Checklists ativos" /><KPI n={p.kpis.venceHoje} label="Vencem hoje" />
        <KPI n={p.kpis.concluidosHoje} label="Concluídos hoje" /><KPI n={p.kpis.emAlerta} label="Em alerta" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div className="table-card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Pendentes de hoje</h3>
          {p.pendentes.length === 0 ? <p className="empty-state">Tudo em dia.</p> : p.pendentes.map((c) => <div key={c.id} style={{ padding: '6px 0', borderTop: '1px solid var(--app-border,#eee)', fontSize: 13 }}>{c.nome} <span style={{ color: '#999' }}>· {c.categoria}</span></div>)}
        </div>
        <div className="table-card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 8 }}>Em alerta</h3>
          {p.alertas.length === 0 ? <p className="empty-state">Nenhum alerta.</p> : p.alertas.map((c) => <div key={c.id} style={{ padding: '6px 0', borderTop: '1px solid var(--app-border,#eee)', fontSize: 13 }}>{c.nome}</div>)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar** — `node --check server.js`; `cd frontend && npm run build`.

- [ ] **Step 4: Commit**
```bash
git add backend/server.js frontend/src/pages/Checklist.jsx
git commit -m "feat(checklist): dashboard do gestor (KPIs, pendentes, alertas)"
git push origin main
```

**Fim da F4 / Fatia 1.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh`.

---

## Checklist pós-deploy (usuário)

1. **Checklist › Setores** — cadastrar Cozinha, Salão, Bar, Caixa…
2. **Configurações › Acessos / Colaboradores** — atribuir setores aos colaboradores (via `PUT /colaboradores/:id/setores`; a UI de atribuição pode entrar como polish).
3. **Checklist › Templates** — "usar como base" num template → ajustar → definir recorrência e setor.
4. **Área do Colaborador** (o colaborador loga por WhatsApp) → aba **Checklists** → executar.
5. Conferir no **Painel** que o concluído aparece e que um item crítico não-conforme levanta "Em alerta".
