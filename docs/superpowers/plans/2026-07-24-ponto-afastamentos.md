# Afastamentos & Troca de Folga (Ponto Facial) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar ausências por período (férias/atestado/licença/folga abonada/outro) e trocas de folga para que esses dias virem "abonado" no espelho (nunca falta) e parem de penalizar a assiduidade na Bonificação.

**Architecture:** Model novo `PontoAusencia` que o motor `calcularEspelho` consulta; dia dentro de um afastamento é tratado como folga e rotulado "abonado" (com batida vence a batida). Bonificação não muda. Aba Afastamentos no Ponto Facial (CRUD + atalho Troca de Folga). Colaborador vê no espelho e no "Seu dia".

**Tech Stack:** Backend Express 5 ESM (`backend/server.js`), Prisma 7 + `@prisma/adapter-pg`, Postgres. Frontend React 19 + Vite. Testes: `node` sem framework (padrão dos `checklist*.test.js`).

## Global Constraints

- Fuso **BR fixo (UTC-3)** via `brToUtcMs`/`brFields`; NUNCA `new Date(y,mo,d,h,m)` local. Dia = **dia de expediente** (corte 05:00).
- Datas de ausência guardadas como **05:00 BR** do dia (`brToUtcMs(y, mo, d, 5, 0)`), início e fim **inclusivos**.
- Rotas admin dentro do gate (`exigirAdmin`) → `empresaId` injetado pela extension; **nunca** `req.user.empresaId`. Em `createMany` a extension **não** injeta → setar `empresaId` explícito via `getEmpresaIdAtual()`.
- `calcularEspelho` roda também no endpoint PÚBLICO do colaborador (fora do tenantStore) → queries por `funcionarioId` (único), sem `empresaId`.
- Tipos válidos: `FERIAS`, `ATESTADO`, `LICENCA`, `FOLGA_ABONADA`, `OUTRO`.
- Situações novas do espelho: `abonado` (sem batida) e `abonado_trabalhado` (com batida). Abonado **nunca** incrementa `tot.faltas`.
- Commit por task direto na `main` + `git push origin main`.
- **Subagentes: NUNCA `taskkill /IM node.exe`.** Se subir server de teste, matar só o próprio job (`kill %1`).

---

### Task 1: Model `PontoAusencia` + enum + migration + MODELS_TENANT

**Files:**
- Modify: `backend/prisma/schema.prisma` (adicionar enum + model)
- Modify: `backend/server.js` (MODELS_TENANT, ~linha 52)
- Create: `backend/prisma/migrations/20260724120000_ponto_ausencia/migration.sql`

**Interfaces:**
- Produces: tabela `PontoAusencia` com colunas `id, empresaId, funcionarioId, tipo (AusenciaTipo), dataInicio, dataFim, observacao, trocaGrupo, criadoEm, atualizadoEm`. Model Prisma `prisma.pontoAusencia`.

- [ ] **Step 1: Adicionar o enum e o model no schema**

Em `backend/prisma/schema.prisma`, no fim do arquivo (segue o padrão dos models de ponto — colunas `Int` puras, SEM `@relation`, igual a `PontoRegistro`):

```prisma
enum AusenciaTipo {
  FERIAS
  ATESTADO
  LICENCA
  FOLGA_ABONADA
  OUTRO
}

// Ponto Facial — ausência/afastamento por PERÍODO (férias, atestado, licença, folga
// abonada, outro). O espelho trata cada dia do período como "abonado" (nunca falta).
// Datas guardadas às 05:00 BR (início do dia de expediente), início e fim inclusivos.
model PontoAusencia {
  id            Int          @id @default(autoincrement())
  empresaId     Int
  funcionarioId Int
  tipo          AusenciaTipo
  dataInicio    DateTime
  dataFim       DateTime
  observacao    String?
  trocaGrupo    String?      // marca as 2 pontas de uma troca de folga
  criadoEm      DateTime     @default(now())
  atualizadoEm  DateTime     @updatedAt

  @@index([empresaId, funcionarioId])
  @@index([empresaId, dataInicio, dataFim])
}
```

- [ ] **Step 2: Registrar no MODELS_TENANT**

Em `backend/server.js` (~linha 52), a lista `MODELS_TENANT` inclui `'funcionarioFace', 'pontoRegistro', 'dispositivo', 'jornada', ...`. Adicionar `'pontoAusencia'` à lista (mantém o multi-tenant nas rotas admin):

```js
// ...'pontoConfig', 'funcao', 'pontoAusencia',
```

- [ ] **Step 3: Gerar a migration + client**

Run (em `backend/`):
```bash
npx prisma migrate dev --name ponto_ausencia
npx prisma generate
```
Expected: cria `backend/prisma/migrations/<timestamp>_ponto_ausencia/migration.sql` e regenera o client (no PDV o client NÃO se regenera sozinho no migrate dev — por isso o `generate` explícito).

**Se houver drift no banco de dev** (o `migrate dev` recusa/quer resetar): NÃO resetar. Criar a pasta `backend/prisma/migrations/20260724120000_ponto_ausencia/` com o `migration.sql` abaixo à mão, aplicar com `npx prisma db execute --file prisma/migrations/20260724120000_ponto_ausencia/migration.sql`, marcar com `npx prisma migrate resolve --applied 20260724120000_ponto_ausencia`, e `npx prisma generate`.

`migration.sql`:
```sql
CREATE TYPE "AusenciaTipo" AS ENUM ('FERIAS', 'ATESTADO', 'LICENCA', 'FOLGA_ABONADA', 'OUTRO');

CREATE TABLE "PontoAusencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "tipo" "AusenciaTipo" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "trocaGrupo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PontoAusencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PontoAusencia_empresaId_funcionarioId_idx" ON "PontoAusencia"("empresaId", "funcionarioId");
CREATE INDEX "PontoAusencia_empresaId_dataInicio_dataFim_idx" ON "PontoAusencia"("empresaId", "dataInicio", "dataFim");
```

- [ ] **Step 4: Verificar**

Run:
```bash
node --check backend/server.js && npx prisma validate
```
Expected: sem erros; `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/server.js backend/prisma/migrations
git commit -m "feat(ponto): model PontoAusencia (afastamentos) + migration + MODELS_TENANT"
git push origin main
```

---

### Task 2: Módulo puro `pontoAusencia.js` (ausenciaDoDia) + testes

**Files:**
- Create: `backend/pontoAusencia.js`
- Create: `backend/pontoAusencia.test.js`

**Interfaces:**
- Produces: `ausenciaDoDia(diaMs, ausencias)` → devolve a 1ª ausência `{ tipo, iniMs, fimMs }` que cobre `diaMs` (inclusive nas bordas) ou `null`. `ausencias` = array de `{ tipo, iniMs, fimMs }` (ms). Consumido pelo `calcularEspelho` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

`backend/pontoAusencia.test.js`:
```js
import { ausenciaDoDia } from './pontoAusencia.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

const BR = (y, mo, d) => Date.UTC(y, mo - 1, d, 5, 0) - -180 * 60000; // 05:00 BR do dia
const ferias = { tipo: 'FERIAS', iniMs: BR(2026, 7, 10), fimMs: BR(2026, 7, 20) };
const folga1d = { tipo: 'FOLGA_ABONADA', iniMs: BR(2026, 7, 24), fimMs: BR(2026, 7, 24) };

console.log('\n== ausenciaDoDia ==');
t('dia no meio do período', ausenciaDoDia(BR(2026, 7, 15), [ferias])?.tipo, 'FERIAS');
t('borda início (inclusive)', ausenciaDoDia(BR(2026, 7, 10), [ferias])?.tipo, 'FERIAS');
t('borda fim (inclusive)', ausenciaDoDia(BR(2026, 7, 20), [ferias])?.tipo, 'FERIAS');
t('dia antes do início = null', ausenciaDoDia(BR(2026, 7, 9), [ferias]), null);
t('dia depois do fim = null', ausenciaDoDia(BR(2026, 7, 21), [ferias]), null);
t('afastamento de 1 dia pega o próprio dia', ausenciaDoDia(BR(2026, 7, 24), [folga1d])?.tipo, 'FOLGA_ABONADA');
t('1 dia não pega o dia seguinte', ausenciaDoDia(BR(2026, 7, 25), [folga1d]), null);
t('lista vazia = null', ausenciaDoDia(BR(2026, 7, 15), []), null);
t('vários: devolve o que cobre', ausenciaDoDia(BR(2026, 7, 24), [ferias, folga1d])?.tipo, 'FOLGA_ABONADA');
t('diaMs inválido = null', ausenciaDoDia(NaN, [ferias]), null);
t('entrada malformada é ignorada', ausenciaDoDia(BR(2026, 7, 15), [{ tipo: 'X' }, ferias])?.tipo, 'FERIAS');

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node backend/pontoAusencia.test.js`
Expected: FALHA — `Cannot find module './pontoAusencia.js'`.

- [ ] **Step 3: Implementar o módulo**

`backend/pontoAusencia.js`:
```js
// Regra pura do afastamento: qual ausência cobre um dado dia. Sem Prisma/Express —
// igual ao padrão dos checklist*.js. Quem chama (calcularEspelho) passa o dia como o
// instante 05:00 BR (início do dia de expediente) e as ausências já em ms.
//
// `ausencias`: [{ tipo, iniMs, fimMs }], com iniMs/fimMs = 05:00 BR do 1º/último dia
// (inclusivos). Devolve a 1ª que cobre `diaMs`, ou null.
export function ausenciaDoDia(diaMs, ausencias) {
  if (!Number.isFinite(diaMs) || !Array.isArray(ausencias)) return null;
  return ausencias.find((a) => a && Number.isFinite(a.iniMs) && Number.isFinite(a.fimMs)
    && a.iniMs <= diaMs && diaMs <= a.fimMs) || null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node backend/pontoAusencia.test.js`
Expected: `11 ok, 0 falha(s)`.

- [ ] **Step 5: Commit**

```bash
git add backend/pontoAusencia.js backend/pontoAusencia.test.js
git commit -m "feat(ponto): módulo puro ausenciaDoDia + testes"
git push origin main
```

---

### Task 3: Integrar afastamentos no `calcularEspelho`

**Files:**
- Modify: `backend/server.js` (`calcularEspelho`, ~linha 6925-6963)

**Interfaces:**
- Consumes: `ausenciaDoDia` (Task 2), `PontoAusencia` (Task 1).
- Produces: linhas do espelho com `situacao` `'abonado'`/`'abonado_trabalhado'` e campo `ausenciaTipo`; dia abonado não conta falta.

- [ ] **Step 1: Importar o módulo puro**

No topo de `backend/server.js`, junto aos outros imports de módulos de ponto (ex.: onde está `import { decidirTipoPonto, ... } from './pontoTipo.js';`), adicionar:
```js
import { ausenciaDoDia } from './pontoAusencia.js';
```

- [ ] **Step 2: Carregar os afastamentos do mês dentro de `calcularEspelho`**

Em `calcularEspelho` (`backend/server.js` ~6936-6938), logo depois do bloco que monta `porDia` (as batidas), adicionar:
```js
    // Afastamentos que cruzam o mês (para abonar dias — ver pontoAusencia.js). Query por
    // funcionarioId (único): funciona dentro do tenantStore (admin) E fora dele (me público).
    const ausRows = await prisma.pontoAusencia.findMany({
      where: {
        funcionarioId,
        dataFim: { gte: new Date(brToUtcMs(ano, mes - 1, 1, 5, 0)) },
        dataInicio: { lte: new Date(brToUtcMs(ano, mes - 1, 31, 5, 0)) },
      },
    });
    const ausencias = ausRows.map((a) => ({ tipo: a.tipo, iniMs: new Date(a.dataInicio).getTime(), fimMs: new Date(a.dataFim).getTime() }));
```

- [ ] **Step 3: Calcular o abono do dia e forçar folga**

No loop `for (let d = 1; d <= 31; d++)`, logo depois de `const batidas = porDia.get(...)` (~linha 6952), adicionar:
```js
    const abono = ausenciaDoDia(brToUtcMs(ano, mes - 1, d, 5, 0), ausencias);
```
E alterar a condição do bloco de previsto (linha ~6957) para **não** calcular previsto num dia abonado — trocar:
```js
    if (cfg && !cfg.folga && cfg.entrada && cfg.saida && !folgaColab) {
```
por:
```js
    if (!abono && cfg && !cfg.folga && cfg.entrada && cfg.saida && !folgaColab) {
```
(Com `abono`, `folga` permanece `true` e `previstoMin` fica 0 — o dia sai da conta de falta/previsto.)

- [ ] **Step 4: Rotular a situação do dia abonado**

No ramo `if (folga) { ... }` (~linha 6970-6977), trocar as duas atribuições de `situacao` para considerar o abono:
```js
    if (folga) {
      if (entradaMs && saidaMs) {
        trabalhadoMin = Math.round((saidaMs - entradaMs) / 60000);
        noturnoMin = minutosNoturnos(entradaMs, saidaMs);
        if (!semJornada) extraMin = trabalhadoMin;
        situacao = abono ? 'abonado_trabalhado' : (semJornada ? 'trabalhado' : 'folga_trabalhada');
        tot.diasTrabalhados++;
      } else situacao = abono ? 'abonado' : (semJornada ? 'vazio' : 'folga');
    } else if (futuro) {
```

- [ ] **Step 5: Expor `ausenciaTipo` na linha**

No `linhas.push({ ... })` (~linha 7002), adicionar o campo:
```js
    linhas.push({
      dia: d, dow, folga, futuro, situacao, previstoMin,
      entradaHm: entradaMs ? hmFmt(brFields(entradaMs).min) : null,
      saidaHm: saidaMs ? hmFmt(brFields(saidaMs).min) : null,
      trabalhadoMin, atrasoMin, extraMin, faltaMin, noturnoMin, saldoMin,
      ausenciaTipo: abono ? abono.tipo : null,
    });
```

- [ ] **Step 6: Verificar (sem quebrar sintaxe/regressão)**

Run:
```bash
node --check backend/server.js && node backend/pontoAusencia.test.js
```
Expected: sem erro no check; `11 ok`.

> Nota: `calcularEspelho` vive dentro de `server.js` (que sobe o servidor no import), então não há teste unitário direto dele — a lógica de "qual dia é abonado" está coberta pela `pontoAusencia.test.js` (Task 2), e a integração aqui é cola mínima que reusa o ramo `folga` já provado. A verificação e2e real acontece na Task 6/7 (registrar um afastamento e ver o espelho).

- [ ] **Step 7: Commit**

```bash
git add backend/server.js
git commit -m "feat(ponto): espelho abona dias de afastamento (nunca falta)"
git push origin main
```

---

### Task 4: Endpoints admin de afastamentos (CRUD + troca)

**Files:**
- Modify: `backend/server.js` (novo bloco de rotas, logo após o bloco de `/api/ponto/jornadas`, ~linha 6751)

**Interfaces:**
- Consumes: `PontoAusencia` (Task 1), `brToUtcMs`, `exigirAdmin`, `getEmpresaIdAtual`, `randomBytes` (já importado no server).
- Produces: `GET/POST/PUT/DELETE /api/ponto/ausencias`, `POST /api/ponto/ausencias/troca` (consumidos pelo front na Task 6).

- [ ] **Step 1: Adicionar os helpers e as rotas**

Em `backend/server.js`, logo após a rota `app.delete('/api/ponto/jornadas/:id', ...)` (~linha 6751), inserir:
```js
// ===== Afastamentos / Ausências (ADMIN) — férias, atestado, licença, folga abonada =====
const AUSENCIA_TIPOS = ['FERIAS', 'ATESTADO', 'LICENCA', 'FOLGA_ABONADA', 'OUTRO'];
// 'YYYY-MM-DD' → Date às 05:00 BR (início do dia de expediente). null se inválido.
const ausData = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(brToUtcMs(+m[1], +m[2] - 1, +m[3], 5, 0)) : null; };

app.get('/api/ponto/ausencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const where = {};
    if (req.query.funcionarioId) where.funcionarioId = parseInt(req.query.funcionarioId, 10);
    const de = ausData(req.query.de), ate = ausData(req.query.ate);
    if (de) where.dataFim = { gte: de };
    if (ate) where.dataInicio = { lte: ate };
    const rows = await prisma.pontoAusencia.findMany({ where, orderBy: { dataInicio: 'desc' }, take: 500 });
    const fs = new Map((await prisma.funcionario.findMany()).map((f) => [f.id, f.apelido || f.nome]));
    res.json({ ausencias: rows.map((a) => ({ id: a.id, funcionarioId: a.funcionarioId, funcionarioNome: fs.get(a.funcionarioId) || '—', tipo: a.tipo, dataInicio: a.dataInicio, dataFim: a.dataFim, observacao: a.observacao || null, trocaGrupo: a.trocaGrupo || null })) });
  } catch (err) { console.error('[ponto/ausencias GET]', err); res.status(500).json({ error: 'Erro ao carregar afastamentos.' }); }
});

app.post('/api/ponto/ausencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    if (!funcionarioId) return res.status(400).json({ error: 'Selecione o colaborador.' });
    if (!AUSENCIA_TIPOS.includes(req.body?.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
    const dataInicio = ausData(req.body?.dataInicio), dataFim = ausData(req.body?.dataFim);
    if (!dataInicio || !dataFim) return res.status(400).json({ error: 'Datas inválidas.' });
    if (dataFim < dataInicio) return res.status(400).json({ error: 'A data fim não pode ser antes do início.' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    // Sobreposição AVISA (não bloqueia): o gestor decide.
    const sobrepoe = await prisma.pontoAusencia.findFirst({ where: { funcionarioId, dataInicio: { lte: dataFim }, dataFim: { gte: dataInicio } } });
    const a = await prisma.pontoAusencia.create({ data: { funcionarioId, tipo: req.body.tipo, dataInicio, dataFim, observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 300) : null } });
    res.status(201).json({ id: a.id, aviso: sobrepoe ? 'Atenção: já existe um afastamento que se sobrepõe a este período.' : null });
  } catch (err) { console.error('[ponto/ausencias POST]', err); res.status(500).json({ error: 'Erro ao salvar o afastamento.' }); }
});

app.put('/api/ponto/ausencias/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.pontoAusencia.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Afastamento não encontrado.' });
    const data = {};
    if (req.body?.tipo !== undefined) {
      if (!AUSENCIA_TIPOS.includes(req.body.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
      data.tipo = req.body.tipo;
    }
    if (req.body?.dataInicio !== undefined) { const d = ausData(req.body.dataInicio); if (!d) return res.status(400).json({ error: 'Data início inválida.' }); data.dataInicio = d; }
    if (req.body?.dataFim !== undefined) { const d = ausData(req.body.dataFim); if (!d) return res.status(400).json({ error: 'Data fim inválida.' }); data.dataFim = d; }
    const ini = data.dataInicio || ex.dataInicio, fim = data.dataFim || ex.dataFim;
    if (fim < ini) return res.status(400).json({ error: 'A data fim não pode ser antes do início.' });
    if (req.body?.observacao !== undefined) data.observacao = req.body.observacao ? String(req.body.observacao).slice(0, 300) : null;
    await prisma.pontoAusencia.update({ where: { id }, data });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/ausencias PUT]', err); res.status(500).json({ error: 'Erro ao salvar o afastamento.' }); }
});

app.delete('/api/ponto/ausencias/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.pontoAusencia.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Afastamento não encontrado.' });
    // Troca é atômica: excluir uma ponta remove as duas (mesmo trocaGrupo).
    if (ex.trocaGrupo) await prisma.pontoAusencia.deleteMany({ where: { trocaGrupo: ex.trocaGrupo } });
    else await prisma.pontoAusencia.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/ausencias DELETE]', err); res.status(500).json({ error: 'Erro ao excluir o afastamento.' }); }
});

// Troca de folga: cria as DUAS pontas (FOLGA_ABONADA de 1 dia) com o mesmo trocaGrupo.
// createMany NÃO recebe injeção de empresaId da extension → setar explícito.
app.post('/api/ponto/ausencias/troca', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const aId = parseInt(req.body?.aFuncionarioId, 10), bId = parseInt(req.body?.bFuncionarioId, 10);
    if (!aId || !bId || aId === bId) return res.status(400).json({ error: 'Escolha dois colaboradores diferentes.' });
    const aData = ausData(req.body?.aData), bData = ausData(req.body?.bData);
    if (!aData || !bData) return res.status(400).json({ error: 'Datas inválidas.' });
    const empresaId = getEmpresaIdAtual();
    const grupo = randomBytes(9).toString('base64url');
    await prisma.pontoAusencia.createMany({ data: [
      { empresaId, funcionarioId: aId, tipo: 'FOLGA_ABONADA', dataInicio: aData, dataFim: aData, trocaGrupo: grupo },
      { empresaId, funcionarioId: bId, tipo: 'FOLGA_ABONADA', dataInicio: bData, dataFim: bData, trocaGrupo: grupo },
    ] });
    res.status(201).json({ ok: true, trocaGrupo: grupo });
  } catch (err) { console.error('[ponto/ausencias/troca POST]', err); res.status(500).json({ error: 'Erro ao registrar a troca de folga.' }); }
});
```

- [ ] **Step 2: Confirmar que `getEmpresaIdAtual` e `randomBytes` existem no escopo**

Run:
```bash
grep -nE "function getEmpresaIdAtual|getEmpresaIdAtual =|import .*randomBytes|randomBytes" backend/server.js | head
```
Expected: `getEmpresaIdAtual` definido (module-level) e `randomBytes` importado de `node:crypto`. Se `randomBytes` não estiver importado, adicionar `import { randomBytes } from 'node:crypto';` (ou usar o já existente — o checklist usa `randomBytes` no publicoToken, então já está).

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(ponto): endpoints admin de afastamentos (CRUD + troca de folga)"
git push origin main
```

---

### Task 5: Colaborador — `me` inclui abono no espelho e na ausência de hoje

**Files:**
- Modify: `backend/server.js` (endpoint `GET /api/public/colaborador/me`, bloco do `ponto`/`pontoHoje`, ~linha 2087-2103)

**Interfaces:**
- Consumes: `calcularEspelho` (agora com `situacao 'abonado'`/`'abonado_trabalhado'` e `ausenciaTipo` — Task 3), `PontoAusencia` (Task 1), `brToUtcMs`, `chkDataRefAtual`, `brFields`.
- Produces: `ponto.marcacoes[]` inclui dias abonados (com `ausenciaTipo`); `pontoHoje.ausencia = { tipo, ate } | null`.

- [ ] **Step 1: Incluir dias abonados no `ponto.marcacoes`**

No `me`, o filtro atual (~linha 2091-2093) descarta dias sem batida. Trocar:
```js
      const marc = (esp.dias || [])
        .filter((d) => !d.futuro && (d.entradaHm || d.situacao === 'falta' || d.situacao === 'incompleto'))
        .map((d) => ({ dia: d.dia, dow: d.dow, entrada: d.entradaHm, saida: d.saidaHm, situacao: d.situacao, atrasoMin: d.atrasoMin }))
        .reverse();
```
por:
```js
      const marc = (esp.dias || [])
        .filter((d) => !d.futuro && (d.entradaHm || d.situacao === 'falta' || d.situacao === 'incompleto' || d.situacao === 'abonado' || d.situacao === 'abonado_trabalhado'))
        .map((d) => ({ dia: d.dia, dow: d.dow, entrada: d.entradaHm, saida: d.saidaHm, situacao: d.situacao, atrasoMin: d.atrasoMin, ausenciaTipo: d.ausenciaTipo || null }))
        .reverse();
```

- [ ] **Step 2: Anexar a ausência de HOJE no `pontoHoje`**

Ainda no `me`, logo depois do bloco que calcula `pontoHoje` (o `if (hf.y === ano && hf.mo === mes - 1) { ... }`, ~linha após o meu `pontoHoje = {...}`), adicionar — reusa o `hf` já calculado ali:
```js
      // Ausência que cobre HOJE (pro "Seu dia": "de férias até dd/mm"). Query por
      // funcionarioId (rota pública, fora do tenantStore).
      const hojeMs = new Date(brToUtcMs(hf.y, hf.mo, hf.day, 5, 0));
      const ausHoje = await prisma.pontoAusencia.findFirst({ where: { funcionarioId: func.id, dataInicio: { lte: hojeMs }, dataFim: { gte: hojeMs } }, orderBy: { dataFim: 'desc' } });
      if (ausHoje) {
        pontoHoje = { ...(pontoHoje || { entrada: null, saida: null, folga: true, situacao: 'abonado' }), ausencia: { tipo: ausHoje.tipo, ate: ausHoje.dataFim } };
      }
```
> `hf` é o `brFields(chkDataRefAtual().getTime())` já declarado no bloco do `pontoHoje`. Se o bloco `try` do ponto estiver estruturado de forma que `hf` não esteja no escopo aqui, recalcular: `const hf = brFields(chkDataRefAtual().getTime());` antes deste trecho.

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(ponto): colaborador vê afastamentos no espelho e a ausência de hoje"
git push origin main
```

---

### Task 6: Frontend gestor — aba "Afastamentos" + rótulo no espelho

**Files:**
- Modify: `frontend/src/pages/PontoFacial.jsx` (TABS, dispatch, `SIT_ESP`, novo componente `Afastamentos`)
- Modify: `frontend/src/components/Sidebar.jsx` (item no grupo Ponto Facial)
- Modify: `frontend/src/App.jsx` (a rota `rh/ponto-facial/:tab` já cobre — confirmar)

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/ponto/ausencias`, `POST /api/ponto/ausencias/troca` (Task 4); `GET /funcionarios?status=ATIVO`.

- [ ] **Step 1: Registrar a aba no `TABS` e no dispatch**

Em `frontend/src/pages/PontoFacial.jsx`, no array `TABS` (~linha 201), adicionar (depois de `jornadas` ou onde fizer sentido):
```js
  { id: 'afastamentos', label: 'Afastamentos', sub: 'Férias, atestados e trocas de folga' },
```
E no dispatch (~linha 231-237), adicionar:
```js
      {tab === 'afastamentos' && <Afastamentos notify={notify} />}
```

- [ ] **Step 2: Rótulos de abono no espelho do gestor**

Em `PontoFacial.jsx`, no mapa `SIT_ESP` (~linha 1377-1385), adicionar duas entradas:
```js
  abonado: { label: 'Abonado', bg: '#e0e7ff', fg: '#3730a3' },
  abonado_trabalhado: { label: 'Abonado (trab.)', bg: '#dbeafe', fg: '#1e40af' },
```

- [ ] **Step 3: Item na sidebar**

Em `frontend/src/components/Sidebar.jsx`, no grupo `Ponto Facial` (`itens`), adicionar depois de "Jornadas e Escalas":
```js
      { to: '/rh/ponto-facial/afastamentos', label: 'Afastamentos', icon: 'calendario' },
```

- [ ] **Step 4: Componente `Afastamentos`**

Em `PontoFacial.jsx`, adicionar o componente (perto de `Jornadas`). Usa `api`, `ConfirmDialog`, `Toast` já importados; datas em `<input type="date">` (YYYY-MM-DD, que os endpoints esperam):
```js
const AUSENCIA_LABEL = { FERIAS: 'Férias', ATESTADO: 'Atestado', LICENCA: 'Licença', FOLGA_ABONADA: 'Folga abonada', OUTRO: 'Outro' }
const fmtDia = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }

function Afastamentos({ notify }) {
  const [lista, setLista] = useState([])
  const [colabs, setColabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)   // { id?, funcionarioId, tipo, dataInicio, dataFim, observacao }
  const [troca, setTroca] = useState(null)    // { aFuncionarioId, aData, bFuncionarioId, bData }
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState(null)

  const carregar = useCallback(() => {
    setLoading(true)
    api.get('/ponto/ausencias')
      .then((r) => setLista(r.data.ausencias || []))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os afastamentos.', 'error'))
      .finally(() => setLoading(false))
  }, [notify])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { api.get('/funcionarios', { params: { status: 'ATIVO' } }).then((r) => setColabs(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }, [])

  async function salvar() {
    const m = modal
    if (!m.funcionarioId || !m.tipo || !m.dataInicio || !m.dataFim) return notify('Preencha colaborador, tipo e período.', 'error')
    setSalvando(true)
    try {
      if (m.id) await api.put(`/ponto/ausencias/${m.id}`, m)
      else { const r = await api.post('/ponto/ausencias', m); if (r.data?.aviso) notify(r.data.aviso) }
      notify('Afastamento salvo.')
      setModal(null); carregar()
    } catch (e) { notify(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error') }
    finally { setSalvando(false) }
  }

  async function salvarTroca() {
    const t = troca
    if (!t.aFuncionarioId || !t.aData || !t.bFuncionarioId || !t.bData) return notify('Preencha as duas pessoas e os dois dias.', 'error')
    if (String(t.aFuncionarioId) === String(t.bFuncionarioId)) return notify('Escolha dois colaboradores diferentes.', 'error')
    setSalvando(true)
    try {
      await api.post('/ponto/ausencias/troca', t)
      notify('Troca de folga registrada.')
      setTroca(null); carregar()
    } catch (e) { notify(e?.response?.data?.error ?? 'Não foi possível registrar a troca.', 'error') }
    finally { setSalvando(false) }
  }

  async function confirmarExcluir() {
    try { await api.delete(`/ponto/ausencias/${excluir.id}`); notify('Afastamento removido.'); setExcluir(null); carregar() }
    catch (e) { notify(e?.response?.data?.error ?? 'Não foi possível excluir.', 'error') }
  }

  const upd = (k, v) => setModal((m) => ({ ...m, [k]: v }))
  const updT = (k, v) => setTroca((t) => ({ ...t, [k]: v }))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setTroca({ aFuncionarioId: '', aData: '', bFuncionarioId: '', bData: '' })}>Troca de folga</button>
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ funcionarioId: '', tipo: 'FERIAS', dataInicio: '', dataFim: '', observacao: '' })}>+ Novo afastamento</button>
      </div>

      {loading ? <div className="loading-state">Carregando…</div>
        : lista.length === 0 ? <div className="empty-state" style={{ padding: '28px 16px' }}>Nenhum afastamento registrado.</div>
        : (
          <div className="table-card">
            <table className="hb-table">
              <thead><tr><th>Colaborador</th><th>Tipo</th><th>Período</th><th>Obs.</th><th aria-hidden="true"></th></tr></thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.funcionarioNome}</strong></td>
                    <td>{AUSENCIA_LABEL[a.tipo] || a.tipo}{a.trocaGrupo && <span className="badge badge-blue" style={{ marginLeft: 8 }}>Troca</span>}</td>
                    <td>{fmtDia(a.dataInicio)}{a.dataFim !== a.dataInicio ? ` – ${fmtDia(a.dataFim)}` : ''}</td>
                    <td style={{ color: 'var(--app-text-3)', fontSize: 12.5 }}>{a.observacao || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!a.trocaGrupo && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ id: a.id, funcionarioId: a.funcionarioId, tipo: a.tipo, dataInicio: String(a.dataInicio).slice(0, 10), dataFim: String(a.dataFim).slice(0, 10), observacao: a.observacao || '' })}>Editar</button>}
                      <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => setExcluir(a)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modal && (
        <div className="modal-overlay"><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
          <div className="modal-title">{modal.id ? 'Editar afastamento' : 'Novo afastamento'}</div>
          <div className="form-group"><label className="form-label">Colaborador</label>
            <select className="form-input" value={modal.funcionarioId} onChange={(e) => upd('funcionarioId', e.target.value)} disabled={!!modal.id}>
              <option value="">Selecione…</option>{colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Tipo</label>
            <select className="form-input" value={modal.tipo} onChange={(e) => upd('tipo', e.target.value)}>
              {Object.entries(AUSENCIA_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label className="form-label">Início</label><input type="date" className="form-input" value={modal.dataInicio} onChange={(e) => upd('dataInicio', e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label className="form-label">Fim</label><input type="date" className="form-input" value={modal.dataFim} onChange={(e) => upd('dataFim', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Observação (opcional)</label><input className="form-input" value={modal.observacao} onChange={(e) => upd('observacao', e.target.value)} maxLength={300} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div></div>
      )}

      {troca && (
        <div className="modal-overlay"><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
          <div className="modal-title">Troca de folga</div>
          <div className="page-header-sub" style={{ marginBottom: 12 }}>Cada pessoa folga no dia da outra. Registra os dois como “Folga abonada”.</div>
          {[['a', 'Pessoa A'], ['b', 'Pessoa B']].map(([p, lbl]) => (
            <div key={p} style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              <div className="form-group" style={{ flex: 1.5 }}><label className="form-label">{lbl}</label>
                <select className="form-input" value={troca[`${p}FuncionarioId`]} onChange={(e) => updT(`${p}FuncionarioId`, e.target.value)}>
                  <option value="">Selecione…</option>{colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></div>
              <div className="form-group" style={{ flex: 1 }}><label className="form-label">Folga em</label><input type="date" className="form-input" value={troca[`${p}Data`]} onChange={(e) => updT(`${p}Data`, e.target.value)} /></div>
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setTroca(null)} disabled={salvando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={salvarTroca} disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar troca'}</button>
          </div>
        </div></div>
      )}

      <ConfirmDialog open={!!excluir} title="Excluir afastamento" message={excluir ? `Excluir o afastamento de ${excluir.funcionarioNome}?` : ''} description={excluir?.trocaGrupo ? 'É uma troca de folga — as duas pontas serão removidas.' : 'Esta ação não pode ser desfeita.'} confirmLabel="Excluir" cancelLabel="Cancelar" variant="danger" onConfirm={confirmarExcluir} onCancel={() => setExcluir(null)} />
    </div>
  )
}
```
> `useCallback` já é importado no topo de `PontoFacial.jsx` (usado por outros componentes). `badge-blue` existe no global.css. Modais fecham só por botão (sem `onClick` de fechar no overlay) — regra do projeto.

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PontoFacial.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(ponto): aba Afastamentos no gestor (CRUD + troca de folga) + rótulo no espelho"
git push origin main
```

---

### Task 7: Frontend colaborador — espelho e "Seu dia" mostram abono

**Files:**
- Modify: `frontend/src/pages/BonificacaoEu.jsx` (mapa `SIT` ~linha 29; `SecaoSeuDia` — linha do ponto)

**Interfaces:**
- Consumes: `me` com `ponto.marcacoes[].situacao` `'abonado'`/`'abonado_trabalhado'` e `pontoHoje.ausencia = { tipo, ate }` (Task 5).

- [ ] **Step 1: Rótulos de abono no mapa `SIT`**

Em `frontend/src/pages/BonificacaoEu.jsx`, no objeto `SIT` (~linha 29-36), adicionar:
```js
  abonado: { l: 'Abonado', c: '#4f46e5' },
  abonado_trabalhado: { l: 'Abonado (trab.)', c: '#2563eb' },
```
(A aba Ponto do colaborador — `TabPonto` — já usa `SIT[m.situacao]` com fallback, então os dias abonados passam a aparecer rotulados, não como falta.)

- [ ] **Step 2: "Seu dia" mostra a ausência de hoje**

Em `SecaoSeuDia` (BonificacaoEu.jsx), o bloco que monta `ptT/ptS` a partir de `pontoHoje`. Trocar:
```js
  let ptT, ptS
  if (!pontoHoje) { ptT = null }
  else if (pontoHoje.folga) { ptT = 'Hoje é sua folga'; ptS = 'Bom descanso 😉' }
  else if (pontoHoje.entrada) { ptT = `Entrada registrada às ${pontoHoje.entrada}`; ptS = pontoHoje.saida ? `Saída às ${pontoHoje.saida}` : 'Bom turno! 💪' }
  else { ptT = 'Você ainda não bateu o ponto hoje'; ptS = 'Registre sua entrada' }
```
por (a ausência tem prioridade):
```js
  const AUS_LBL = { FERIAS: 'férias', ATESTADO: 'atestado', LICENCA: 'licença', FOLGA_ABONADA: 'folga', OUTRO: 'afastamento' }
  const fmtAte = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
  let ptT, ptS
  if (pontoHoje?.ausencia) {
    const nome = AUS_LBL[pontoHoje.ausencia.tipo] || 'afastamento'
    ptT = pontoHoje.ausencia.tipo === 'FOLGA_ABONADA' ? 'Você está de folga hoje' : `Você está de ${nome}`
    ptS = pontoHoje.ausencia.tipo === 'FOLGA_ABONADA' ? 'Aproveite 😉' : `Até ${fmtAte(pontoHoje.ausencia.ate)}`
  } else if (!pontoHoje) { ptT = null }
  else if (pontoHoje.folga) { ptT = 'Hoje é sua folga'; ptS = 'Bom descanso 😉' }
  else if (pontoHoje.entrada) { ptT = `Entrada registrada às ${pontoHoje.entrada}`; ptS = pontoHoje.saida ? `Saída às ${pontoHoje.saida}` : 'Bom turno! 💪' }
  else { ptT = 'Você ainda não bateu o ponto hoje'; ptS = 'Registre sua entrada' }
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BonificacaoEu.jsx
git commit -m "feat(ponto): colaborador vê afastamento no espelho e no Seu dia"
git push origin main
```

---

## Verificação final (após todas as tasks)

```bash
node backend/pontoAusencia.test.js        # 11 ok
node --check backend/server.js            # sem erro
cd frontend && npm run build              # ✓ built
```

Depois: deploy `cd /var/www/nachapa-pdv && git pull && bash deploy.sh` (roda `migrate deploy`). Smoke e2e: registrar férias pra um colaborador num período que inclua hoje; conferir (a) espelho do gestor mostra "Abonado" no lugar de "Falta"; (b) Fechamento não gera ocorrência de falta; (c) Área do Colaborador › Ponto mostra "Abonado"; (d) "Seu dia" mostra "Você está de férias até dd/mm". Testar a Troca de folga (duas pessoas) e conferir que excluir uma remove as duas.
