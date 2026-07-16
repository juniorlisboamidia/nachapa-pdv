# Etiquetas v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cozinha escolhe um item no celular Android, o sistema calcula a validade e imprime uma etiqueta ANVISA numa Niimbot B1 via Bluetooth — sem app, sem cálculo de data na mão.

**Architecture:** O backend guarda config e registro; **quem fala com a impressora é o navegador**. A etiqueta é desenhada num `<canvas>` 384×240 px (48×30 mm a 203 dpi), convertida para bitmap 1-bit e enviada por Web Bluetooth (BLE). A mesma função de desenho serve a prévia e a impressão, então o que se vê é o que sai. A tela da cozinha é um quiosque público por token, reusando o `Dispositivo` que o Ponto Facial já usa.

**Tech Stack:** Backend Express 5 ESM (`backend/server.js`, arquivo único ~6.7k linhas), Prisma 7 + `@prisma/adapter-pg`, Postgres. Frontend React 19 + Vite + React Router. Impressão: `niimbot-web-bluetooth` (npm, validada em B1 real).

**Spec:** `docs/superpowers/specs/2026-07-15-etiquetas-design.md`

## Global Constraints

- **ESM em todo o backend** (`"type": "module"`): use `import`, nunca `require`. Node 24, `fetch` nativo.
- **Prisma 7**: o client é instanciado com adapter — `new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })`. Scripts avulsos precisam do adapter, senão erram na inicialização.
- **Multi-tenant**: todo model novo entra em `MODELS_TENANT` (`backend/server.js:23`). A extension do Prisma injeta `empresaId` automaticamente **quando há tenantStore**; rotas públicas (`/api/public/*`) rodam fora dele e passam `empresaId` **explícito**.
- **Fuso BR fixo**: o VPS roda em UTC. Toda conta de data usa `brFields`/`brToUtcMs` (`backend/server.js:6101-6106`). **Nunca** `new Date().setHours()` — foi exatamente o bug do ponto (commit a68d005).
- **Migrations**: nome `AAAAMMDDHHMMSS_descricao`; a próxima livre é `20260716280000`. Aplicar com `npx prisma migrate deploy` (o repo tem `prisma.config.ts` — `db execute` **não** aceita `--schema`).
- **Área de permissão `etiquetas` já existe** em `AREAS_DISPONIVEIS` e `AREA_PREFIXOS` (`backend/server.js:175,184`). Rotas `/api/etiquetas/*` já ficam protegidas — **não** mexer no middleware.
- **Modais fecham só pelo botão**, nunca clicando fora (regra do projeto).
- **Impressão**: bitmap **1-bit, sem dithering** (luminância < 128 = preto), empacotado por linha, MSB-first. Cabeça da B1 = **384 px = 48 mm** (50 mm dariam 400 px e 16 px cairiam fora).
- **Commits**: direto na `main`, um por task, seguido de `git push origin main`.
- **Deploy**: `cd /var/www/nachapa-pdv && bash deploy.sh` (só ao fim de cada fase, informado ao usuário).

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `backend/etiquetas.js` **(novo)** | Regra pura: `validadeDe()`, `gerarLote()`. Sem Prisma, sem Express — é o que carrega o risco sanitário e o que tem teste. |
| `backend/etiquetas.test.js` **(novo)** | Teste do módulo acima. `node backend/etiquetas.test.js`, sem framework (o repo não tem). |
| `backend/prisma/schema.prisma` | +1 enum, +4 models. |
| `backend/prisma/migrations/20260716280000_etiquetas/migration.sql` **(novo)** | Tabelas + seed das 6 regras padrão. |
| `backend/server.js` | `MODELS_TENANT` + bloco de endpoints (admin e público). |
| `frontend/src/lib/etiquetaCanvas.js` **(novo)** | `desenharEtiqueta(ctx, dados, config)` — só desenha. Usada pela prévia **e** pela impressão. |
| `frontend/src/lib/niimbotB1.js` **(novo)** | Único arquivo que sabe que a impressora é Niimbot: conectar/imprimir, canvas→1-bit→BLE. |
| `frontend/src/pages/Etiquetas.jsx` **(novo)** | Admin com abas (Configuração/Itens/Painel/Histórico), no molde do `PontoFacial.jsx`. |
| `frontend/src/pages/EtiquetasQuiosque.jsx` **(novo)** | Tela pública da cozinha (`/etiquetas/:token`). |
| `frontend/src/App.jsx` | Trocar o placeholder `EmConstrucao` pelas rotas reais. |

`Etiquetas.jsx` nasce com abas em vez de 4 arquivos porque é o padrão vivo do repo (`PontoFacial.jsx`, `Bonificacao.jsx`) e as abas compartilham config e estado. Se passar de ~800 linhas, dividir as abas em componentes no mesmo diretório.

---

## Task 1: Regra de validade (módulo puro + teste)

O coração sanitário do módulo: dada a conservação e o item, quando vence. Começa aqui porque é a única parte com risco real de erro silencioso, e não depende de banco nem de tela.

**Files:**
- Create: `backend/etiquetas.js`
- Test: `backend/etiquetas.test.js`

**Interfaces:**
- Consumes: nada (módulo raiz).
- Produces:
  - `validadeDe({ manipuladoEmMs, conservacao, regras, itemConfig }) → { validoAte: Date, dias: number, origem: 'ITEM'|'REGRA', tempLabel: string }`
  - `gerarLote() → string` (6 chars, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
  - `CONSERVACOES → string[]` (as 6 chaves do enum)

- [ ] **Step 1: Escrever o teste que falha**

Crie `backend/etiquetas.test.js`:

```js
import { validadeDe, gerarLote, CONSERVACOES } from './etiquetas.js';

let ok = 0, fail = 0;
const t = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${nome}`); }
  else { fail++; console.log(`  FALHA ${nome}\n       real: ${a}\n       esp.: ${b}`); }
};

// Regras como vêm do banco (dias por conservação)
const regras = [
  { conservacao: 'CONGELADO',     tempLabel: '<= -18 °C',          dias: 90 },
  { conservacao: 'RESFRIADO_0_4', tempLabel: '0 a 4 °C',           dias: 5  },
  { conservacao: 'RESFRIADO_4_6', tempLabel: '4 a 6 °C',           dias: 3  },
  { conservacao: 'AMBIENTE',      tempLabel: '<= 25 °C',           dias: 30 },
  { conservacao: 'DESCONGELADO',  tempLabel: '0 a 4 °C',           dias: 1  },
  { conservacao: 'ABERTO',        tempLabel: 'conforme fabricante', dias: 3  },
];

// 15/07/2026 16:20 BR  ->  19:20 UTC
const manip = Date.UTC(2026, 6, 15, 19, 20);
const iso = (d) => new Date(d).toISOString();

console.log('\n== validade pela regra ==');
const r1 = validadeDe({ manipuladoEmMs: manip, conservacao: 'RESFRIADO_0_4', regras, itemConfig: null });
t('resfriado 0-4 = +5 dias', iso(r1.validoAte), iso(Date.UTC(2026, 6, 20, 19, 20)));
t('origem = REGRA', r1.origem, 'REGRA');
t('dias = 5', r1.dias, 5);
t('tempLabel vem da regra', r1.tempLabel, '0 a 4 °C');

console.log('\n== override do item vence a regra ==');
const r2 = validadeDe({ manipuladoEmMs: manip, conservacao: 'RESFRIADO_0_4', regras, itemConfig: { validadeDias: 3 } });
t('item com 3 dias', iso(r2.validoAte), iso(Date.UTC(2026, 6, 18, 19, 20)));
t('origem = ITEM', r2.origem, 'ITEM');

console.log('\n== validadeDias null no item cai na regra ==');
const r3 = validadeDe({ manipuladoEmMs: manip, conservacao: 'CONGELADO', regras, itemConfig: { validadeDias: null } });
t('congelado = +90 dias', iso(r3.validoAte), iso(Date.UTC(2026, 9, 13, 19, 20)));
t('origem = REGRA', r3.origem, 'REGRA');

console.log('\n== virada de mes e ano ==');
const dez = Date.UTC(2026, 11, 30, 19, 20); // 30/12/2026 16:20 BR
const r4 = validadeDe({ manipuladoEmMs: dez, conservacao: 'RESFRIADO_0_4', regras, itemConfig: null });
t('30/12 +5d = 04/01/2027', iso(r4.validoAte), iso(Date.UTC(2027, 0, 4, 19, 20)));

console.log('\n== descongelado = 1 dia ==');
const r5 = validadeDe({ manipuladoEmMs: manip, conservacao: 'DESCONGELADO', regras, itemConfig: null });
t('+1 dia', iso(r5.validoAte), iso(Date.UTC(2026, 6, 16, 19, 20)));

console.log('\n== erros ==');
try { validadeDe({ manipuladoEmMs: manip, conservacao: 'INEXISTENTE', regras, itemConfig: null }); t('conservacao invalida lanca', 'nao lancou', 'lanca'); }
catch (e) { t('conservacao invalida lanca', e.http, 400); }

console.log('\n== gerarLote ==');
const lotes = new Set();
for (let i = 0; i < 5000; i++) lotes.add(gerarLote());
t('6 chars', gerarLote().length, 6);
t('sem ambiguos (I/O/0/1)', /[IO01]/.test([...lotes].join('')), false);
t('5000 lotes sem colisao relevante', lotes.size > 4900, true);
t('6 conservacoes', CONSERVACOES.length, 6);

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && node etiquetas.test.js`
Expected: FALHA — `Cannot find module './etiquetas.js'`.

- [ ] **Step 3: Implementar o módulo**

Crie `backend/etiquetas.js`:

```js
// Regra de validade e lote das Etiquetas (ANVISA RDC 216/2004).
// Módulo puro: sem Prisma, sem Express — é o que decide a data que vai colada
// no alimento, então é o que tem teste.

export const CONSERVACOES = ['CONGELADO', 'RESFRIADO_0_4', 'RESFRIADO_4_6', 'AMBIENTE', 'DESCONGELADO', 'ABERTO'];

const DIA_MS = 24 * 60 * 60 * 1000;

// Validade = manipulação + N dias. N vem do item (se ele tem validade própria)
// ou da regra da conservação. Somamos em ms sobre o instante: o horário de
// parede se preserva e não dependemos do fuso do processo (o VPS roda em UTC).
export function validadeDe({ manipuladoEmMs, conservacao, regras, itemConfig }) {
  if (!CONSERVACOES.includes(conservacao)) throw { http: 400, msg: 'Conservação inválida.' };
  const regra = (regras || []).find((r) => r.conservacao === conservacao);
  if (!regra) throw { http: 400, msg: 'Não há regra de validade para esta conservação.' };

  const diasItem = itemConfig?.validadeDias;
  const usaItem = Number.isFinite(diasItem) && diasItem > 0;
  const dias = usaItem ? diasItem : regra.dias;

  return {
    validoAte: new Date(manipuladoEmMs + dias * DIA_MS),
    dias,
    origem: usaItem ? 'ITEM' : 'REGRA',
    tempLabel: regra.tempLabel,
  };
}

// Alfabeto sem ambíguos (I/O/0/1): o lote é lido em voz alta e digitado por
// gente com a mão ocupada.
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function gerarLote() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFA[Math.floor(Math.random() * ALFA.length)];
  return s;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && node etiquetas.test.js`
Expected: `15 ok, 0 falha(s)`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/etiquetas.js backend/etiquetas.test.js
git commit -m "feat(etiquetas): regra de validade e lote (modulo puro + teste)"
git push origin main
```

---

## Task 2: Models + migration com seed das regras

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260716280000_etiquetas/migration.sql`
- Modify: `backend/server.js:23` (`MODELS_TENANT`)

**Interfaces:**
- Consumes: `CONSERVACOES` (Task 1) — o enum do banco tem exatamente esses 6 valores.
- Produces: models `EtiquetaConfig`, `EtiquetaRegra`, `EtiquetaItemConfig`, `EtiquetaImpressa` no client Prisma.

- [ ] **Step 1: Adicionar o enum e os models ao schema**

No fim de `backend/prisma/schema.prisma`:

```prisma
// ============================================================
// Etiquetas (rotulagem ANVISA RDC 216/2004)
// ============================================================

enum ConservacaoTipo {
  CONGELADO
  RESFRIADO_0_4
  RESFRIADO_4_6
  AMBIENTE
  DESCONGELADO
  ABERTO
}

// Identificação impressa + formato. 1 por empresa.
model EtiquetaConfig {
  id                 Int      @id @default(autoincrement())
  empresaId          Int
  razaoSocial        String?
  cnpj               String?
  responsavelTecnico String?
  sif                String?
  sie                String?
  // larguraMm é o ROLO; a área desenhada trava em 48mm (384px), o limite da cabeça da B1.
  larguraMm          Int      @default(50)
  alturaMm           Int      @default(30)
  campos             Json?    // { alergenos: false, instrucoes: false, ... }
  criadoEm           DateTime @default(now())
  atualizadoEm       DateTime @updatedAt

  @@unique([empresaId])
  @@index([empresaId])
}

// Tabela de validade por conservação (semeada na migration; editável).
model EtiquetaRegra {
  id           Int             @id @default(autoincrement())
  empresaId    Int
  conservacao  ConservacaoTipo
  tempLabel    String
  dias         Int
  ordem        Int             @default(0)
  ativo        Boolean         @default(true)
  criadoEm     DateTime        @default(now())
  atualizadoEm DateTime        @updatedAt

  @@unique([empresaId, conservacao])
  @@index([empresaId])
}

// Config de etiqueta por insumo. validadeDias null = usa a EtiquetaRegra.
model EtiquetaItemConfig {
  id                Int              @id @default(autoincrement())
  empresaId         Int
  insumoId          Int
  conservacaoPadrao ConservacaoTipo?
  validadeDias      Int?
  ativo             Boolean          @default(true)
  criadoEm          DateTime         @default(now())
  atualizadoEm      DateTime         @updatedAt

  insumo Insumo @relation(fields: [insumoId], references: [id], onDelete: Cascade)

  @@unique([empresaId, insumoId])
  @@index([empresaId])
}

// Registro de cada etiqueta emitida. Alimenta painel e histórico.
// nomeItem/responsavelNome são SNAPSHOT: a etiqueta é um documento sanitário do
// momento da manipulação e não pode mudar quando o cadastro muda.
model EtiquetaImpressa {
  id             Int             @id @default(autoincrement())
  empresaId      Int
  lote           String          @unique
  insumoId       Int?
  nomeItem       String
  conservacao    ConservacaoTipo
  tempLabel      String
  manipuladoEm   DateTime
  validoAte      DateTime
  validadeDias   Int
  responsavelId  Int?
  responsavelNome String
  dispositivoId  Int?
  quantidade     Int             @default(1)
  criadoEm       DateTime        @default(now())

  @@index([empresaId, validoAte])
  @@index([empresaId, criadoEm])
  @@index([empresaId, insumoId])
}
```

Em `model Insumo`, adicione a relação inversa (o Prisma exige):

```prisma
  etiquetaConfig EtiquetaItemConfig?
```

- [ ] **Step 2: Escrever a migration**

Crie `backend/prisma/migrations/20260716280000_etiquetas/migration.sql`:

```sql
-- Etiquetas v1 — rotulagem ANVISA (RDC 216/2004).

CREATE TYPE "ConservacaoTipo" AS ENUM ('CONGELADO', 'RESFRIADO_0_4', 'RESFRIADO_4_6', 'AMBIENTE', 'DESCONGELADO', 'ABERTO');

CREATE TABLE "EtiquetaConfig" (
  "id"                 SERIAL PRIMARY KEY,
  "empresaId"          INTEGER NOT NULL,
  "razaoSocial"        TEXT,
  "cnpj"               TEXT,
  "responsavelTecnico" TEXT,
  "sif"                TEXT,
  "sie"                TEXT,
  "larguraMm"          INTEGER NOT NULL DEFAULT 50,
  "alturaMm"           INTEGER NOT NULL DEFAULT 30,
  "campos"             JSONB,
  "criadoEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EtiquetaConfig_empresaId_key" ON "EtiquetaConfig"("empresaId");
CREATE INDEX "EtiquetaConfig_empresaId_idx" ON "EtiquetaConfig"("empresaId");

CREATE TABLE "EtiquetaRegra" (
  "id"           SERIAL PRIMARY KEY,
  "empresaId"    INTEGER NOT NULL,
  "conservacao"  "ConservacaoTipo" NOT NULL,
  "tempLabel"    TEXT NOT NULL,
  "dias"         INTEGER NOT NULL,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EtiquetaRegra_empresaId_conservacao_key" ON "EtiquetaRegra"("empresaId", "conservacao");
CREATE INDEX "EtiquetaRegra_empresaId_idx" ON "EtiquetaRegra"("empresaId");

CREATE TABLE "EtiquetaItemConfig" (
  "id"                SERIAL PRIMARY KEY,
  "empresaId"         INTEGER NOT NULL,
  "insumoId"          INTEGER NOT NULL,
  "conservacaoPadrao" "ConservacaoTipo",
  "validadeDias"      INTEGER,
  "ativo"             BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EtiquetaItemConfig_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EtiquetaItemConfig_empresaId_insumoId_key" ON "EtiquetaItemConfig"("empresaId", "insumoId");
CREATE INDEX "EtiquetaItemConfig_empresaId_idx" ON "EtiquetaItemConfig"("empresaId");

CREATE TABLE "EtiquetaImpressa" (
  "id"              SERIAL PRIMARY KEY,
  "empresaId"       INTEGER NOT NULL,
  "lote"            TEXT NOT NULL,
  "insumoId"        INTEGER,
  "nomeItem"        TEXT NOT NULL,
  "conservacao"     "ConservacaoTipo" NOT NULL,
  "tempLabel"       TEXT NOT NULL,
  "manipuladoEm"    TIMESTAMP(3) NOT NULL,
  "validoAte"       TIMESTAMP(3) NOT NULL,
  "validadeDias"    INTEGER NOT NULL,
  "responsavelId"   INTEGER,
  "responsavelNome" TEXT NOT NULL,
  "dispositivoId"   INTEGER,
  "quantidade"      INTEGER NOT NULL DEFAULT 1,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EtiquetaImpressa_lote_key" ON "EtiquetaImpressa"("lote");
CREATE INDEX "EtiquetaImpressa_empresaId_validoAte_idx" ON "EtiquetaImpressa"("empresaId", "validoAte");
CREATE INDEX "EtiquetaImpressa_empresaId_criadoEm_idx" ON "EtiquetaImpressa"("empresaId", "criadoEm");
CREATE INDEX "EtiquetaImpressa_empresaId_insumoId_idx" ON "EtiquetaImpressa"("empresaId", "insumoId");

-- Seed das regras padrão (RDC 216) para cada empresa existente. Sem isso a
-- primeira etiqueta não teria como calcular validade.
INSERT INTO "EtiquetaRegra" ("empresaId", "conservacao", "tempLabel", "dias", "ordem", "atualizadoEm")
SELECT e."id", r.conservacao::"ConservacaoTipo", r.temp, r.dias, r.ordem, CURRENT_TIMESTAMP
FROM "Empresa" e
CROSS JOIN (VALUES
  ('CONGELADO',     '<= -18 °C',           90, 0),
  ('RESFRIADO_0_4', '0 a 4 °C',             5, 1),
  ('RESFRIADO_4_6', '4 a 6 °C',             3, 2),
  ('AMBIENTE',      '<= 25 °C',            30, 3),
  ('DESCONGELADO',  '0 a 4 °C',             1, 4),
  ('ABERTO',        'Conforme fabricante',  3, 5)
) AS r(conservacao, temp, dias, ordem)
ON CONFLICT ("empresaId", "conservacao") DO NOTHING;
```

- [ ] **Step 3: Registrar os models como multi-tenant**

Em `backend/server.js:23`, dentro de `MODELS_TENANT`, adicione ao final do Set:

```js
  'etiquetaConfig', 'etiquetaRegra', 'etiquetaItemConfig', 'etiquetaImpressa',
```

- [ ] **Step 4: Aplicar e verificar**

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
node --check server.js
```
Expected: migration aplicada, client gerado, `server.js` sem erro de sintaxe.

Confirme que o seed rodou:
```bash
node -e "import('dotenv').then(d=>{d.default.config();return Promise.all([import('@prisma/client'),import('@prisma/adapter-pg')])}).then(([c,a])=>{const p=new c.PrismaClient({adapter:new a.PrismaPg(process.env.DATABASE_URL)});return p.etiquetaRegra.findMany({orderBy:{ordem:'asc'},select:{conservacao:true,dias:true}}).then(r=>{console.log(r);return p.\$disconnect()})})"
```
Expected: 6 regras por empresa (CONGELADO 90, RESFRIADO_0_4 5, RESFRIADO_4_6 3, AMBIENTE 30, DESCONGELADO 1, ABERTO 3).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260716280000_etiquetas backend/server.js
git commit -m "feat(etiquetas): models, migration e seed das regras de validade"
git push origin main
```

---

## Task 3: Endpoints de admin (config, regras, itens)

**Files:**
- Modify: `backend/server.js` — bloco novo antes do `app.listen`

**Interfaces:**
- Consumes: `validadeDe`, `CONSERVACOES` (Task 1); models (Task 2).
- Produces:
  - `GET /api/etiquetas/config` → `{ config, regras, conservacoes }`
  - `PUT /api/etiquetas/config` ← `{ razaoSocial, cnpj, responsavelTecnico, sif, sie, larguraMm, alturaMm, campos }`
  - `PUT /api/etiquetas/regras` ← `{ regras: [{ conservacao, tempLabel, dias }] }`
  - `GET /api/etiquetas/itens?busca=` → `{ itens: [{ insumoId, nome, tipo, conservacaoPadrao, validadeDias, validadeEfetiva, ativo }] }`
  - `PUT /api/etiquetas/itens/:insumoId` ← `{ conservacaoPadrao, validadeDias, ativo }`

- [ ] **Step 1: Importar o módulo de regra**

No topo de `backend/server.js`, junto dos outros imports:

```js
import { validadeDe, gerarLote, CONSERVACOES } from './etiquetas.js';
```

- [ ] **Step 2: Escrever o bloco de endpoints**

Antes do `app.listen(...)` no fim de `backend/server.js`:

```js
// ===== Etiquetas (ADMIN) — área `etiquetas` já protegida pelo middleware =====

// Tipos de insumo que não se etiqueta: embalagem e material operacional não são
// alimento manipulado.
const ETIQUETA_TIPOS_INSUMO = ['INGREDIENTE', 'PRODUCAO_PROPRIA', 'HORTIFRUTI', 'ACOMPANHAMENTO', 'BEBIDA'];

async function etiquetaConfigDaEmpresa(empresaId) {
  let c = await prisma.etiquetaConfig.findFirst();
  if (!c) {
    const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });
    c = await prisma.etiquetaConfig.create({ data: { razaoSocial: emp?.nome || null, campos: {} } });
  }
  return c;
}

app.get('/api/etiquetas/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const config = await etiquetaConfigDaEmpresa(req.user.empresaId);
    const regras = await prisma.etiquetaRegra.findMany({ orderBy: { ordem: 'asc' } });
    res.json({ config, regras, conservacoes: CONSERVACOES });
  } catch (err) { console.error('[etiquetas/config GET]', err); res.status(500).json({ error: 'Erro ao carregar a configuração.' }); }
});

app.put('/api/etiquetas/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const b = req.body || {};
    const only = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
    const atual = await etiquetaConfigDaEmpresa(req.user.empresaId);
    const config = await prisma.etiquetaConfig.update({
      where: { id: atual.id },
      data: {
        razaoSocial: only(b.razaoSocial, 160),
        cnpj: only(b.cnpj, 20),
        responsavelTecnico: only(b.responsavelTecnico, 120),
        sif: only(b.sif, 10),
        sie: only(b.sie, 10),
        larguraMm: Number.isFinite(+b.larguraMm) ? Math.min(50, Math.max(20, +b.larguraMm)) : 50,
        alturaMm: Number.isFinite(+b.alturaMm) ? Math.min(100, Math.max(15, +b.alturaMm)) : 30,
        campos: b.campos && typeof b.campos === 'object' ? b.campos : {},
      },
    });
    res.json({ ok: true, config });
  } catch (err) { console.error('[etiquetas/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

app.put('/api/etiquetas/regras', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const entrada = Array.isArray(req.body?.regras) ? req.body.regras : [];
    for (const r of entrada) {
      if (!CONSERVACOES.includes(r.conservacao)) return res.status(400).json({ error: `Conservação inválida: ${r.conservacao}` });
      const dias = parseInt(r.dias, 10);
      if (!Number.isFinite(dias) || dias < 1 || dias > 3650) return res.status(400).json({ error: 'Validade deve ser de 1 a 3650 dias.' });
    }
    for (const r of entrada) {
      await prisma.etiquetaRegra.updateMany({
        where: { conservacao: r.conservacao },
        data: { dias: parseInt(r.dias, 10), tempLabel: String(r.tempLabel || '').slice(0, 60) },
      });
    }
    const regras = await prisma.etiquetaRegra.findMany({ orderBy: { ordem: 'asc' } });
    res.json({ ok: true, regras });
  } catch (err) { console.error('[etiquetas/regras PUT]', err); res.status(500).json({ error: 'Erro ao salvar as regras.' }); }
});

app.get('/api/etiquetas/itens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = { ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } };
    if (busca) where.nome = { contains: busca, mode: 'insensitive' };
    const insumos = await prisma.insumo.findMany({ where, orderBy: { nome: 'asc' }, select: { id: true, nome: true, tipo: true, unidade: true } });
    const cfgs = await prisma.etiquetaItemConfig.findMany();
    const cMap = new Map(cfgs.map((c) => [c.insumoId, c]));
    const regras = await prisma.etiquetaRegra.findMany();
    const itens = insumos.map((i) => {
      const c = cMap.get(i.id) || null;
      const cons = c?.conservacaoPadrao || null;
      const regra = cons ? regras.find((r) => r.conservacao === cons) : null;
      return {
        insumoId: i.id, nome: i.nome, tipo: i.tipo, unidade: i.unidade,
        conservacaoPadrao: cons,
        validadeDias: c?.validadeDias ?? null,
        validadeEfetiva: c?.validadeDias ?? regra?.dias ?? null, // o que a cozinha vai ver
        ativo: c ? c.ativo : true,
      };
    });
    res.json({ itens, conservacoes: CONSERVACOES });
  } catch (err) { console.error('[etiquetas/itens GET]', err); res.status(500).json({ error: 'Erro ao carregar os itens.' }); }
});

app.put('/api/etiquetas/itens/:insumoId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const insumoId = parseInt(req.params.insumoId, 10);
    if (!Number.isFinite(insumoId)) return res.status(400).json({ error: 'Insumo inválido.' });
    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId } });
    if (!insumo) return res.status(404).json({ error: 'Insumo não encontrado.' });

    const b = req.body || {};
    if (b.conservacaoPadrao && !CONSERVACOES.includes(b.conservacaoPadrao)) return res.status(400).json({ error: 'Conservação inválida.' });
    const dias = b.validadeDias == null || b.validadeDias === '' ? null : parseInt(b.validadeDias, 10);
    if (dias !== null && (!Number.isFinite(dias) || dias < 1 || dias > 3650)) return res.status(400).json({ error: 'Validade deve ser de 1 a 3650 dias.' });

    const dados = {
      conservacaoPadrao: b.conservacaoPadrao || null,
      validadeDias: dias,
      ativo: b.ativo !== false,
    };
    const existente = await prisma.etiquetaItemConfig.findFirst({ where: { insumoId } });
    const cfg = existente
      ? await prisma.etiquetaItemConfig.update({ where: { id: existente.id }, data: dados })
      : await prisma.etiquetaItemConfig.create({ data: { ...dados, insumoId } });
    res.json({ ok: true, item: cfg });
  } catch (err) { console.error('[etiquetas/itens PUT]', err); res.status(500).json({ error: 'Erro ao salvar o item.' }); }
});
```

- [ ] **Step 3: Verificar sintaxe e subir o servidor**

```bash
cd backend && node --check server.js && node server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4001/api/etiquetas/config   # 401 (sem token)
curl -s http://localhost:4001/api/health
kill %1
```
Expected: `401` no config (o gate de auth barra) e `{"status":"ok","app":"operacao-pdv"}` no health.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(etiquetas): endpoints de config, regras e itens"
git push origin main
```

---

## Task 4: Tela de admin — Configuração e Itens

**Files:**
- Create: `frontend/src/pages/Etiquetas.jsx`
- Modify: `frontend/src/App.jsx:97` (trocar o `EmConstrucao`)

**Interfaces:**
- Consumes: endpoints da Task 3.
- Produces: rota `/etiquetas` e `/etiquetas/:tab` (`config` | `itens`). Abas `painel` e `historico` entram na Task 8.

- [ ] **Step 1: Criar a página com as duas abas**

Crie `frontend/src/pages/Etiquetas.jsx`. Siga o molde de `PontoFacial.jsx`: `useParams()` para a aba, `api` de `../services/api`, `notify` do contexto de toast do projeto (confira como `PontoFacial.jsx` importa e use o mesmo).

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

const TABS = [['config', 'Configuração'], ['itens', 'Itens']]

const CONS_LABEL = {
  CONGELADO: 'Congelado', RESFRIADO_0_4: 'Resfriado (0 a 4 °C)', RESFRIADO_4_6: 'Resfriado (4 a 6 °C)',
  AMBIENTE: 'Ambiente (seco)', DESCONGELADO: 'Descongelado', ABERTO: 'Produto aberto',
}

export default function Etiquetas() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const atual = TABS.some(([k]) => k === tab) ? tab : 'config'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Etiquetas</h1>
        <p className="page-subtitle">Rotulagem de alimentos manipulados conforme ANVISA (RDC 216/2004).</p>
      </div>
      <div className="modal-tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={`av-tab ${atual === k ? 'active' : ''}`}
            onClick={() => navigate(`/etiquetas/${k}`)}>{label}</button>
        ))}
      </div>
      {atual === 'config' ? <AbaConfig /> : <AbaItens />}
    </div>
  )
}

function AbaConfig() {
  const [config, setConfig] = useState(null)
  const [regras, setRegras] = useState([])
  const [salvando, setSalvando] = useState(false)

  const carregar = () => api.get('/etiquetas/config').then((r) => { setConfig(r.data.config); setRegras(r.data.regras) }).catch(() => {})
  useEffect(() => { carregar() }, [])

  const upd = (k, v) => setConfig((c) => ({ ...c, [k]: v }))
  const updRegra = (cons, dias) => setRegras((rs) => rs.map((r) => (r.conservacao === cons ? { ...r, dias } : r)))

  async function salvar() {
    setSalvando(true)
    try {
      await api.put('/etiquetas/config', config)
      await api.put('/etiquetas/regras', { regras: regras.map((r) => ({ conservacao: r.conservacao, tempLabel: r.tempLabel, dias: r.dias })) })
      await carregar()
    } catch (e) { /* toast do projeto */ }
    finally { setSalvando(false) }
  }

  if (!config) return <div className="empty-state">Carregando…</div>

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <div className="table-card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Identificação do estabelecimento</h2>
        <div className="form-group">
          <label className="form-label">Razão social / nome fantasia</label>
          <input className="form-input" value={config.razaoSocial || ''} onChange={(e) => upd('razaoSocial', e.target.value)} />
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">CNPJ</label>
            <input className="form-input" value={config.cnpj || ''} onChange={(e) => upd('cnpj', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Responsável técnico</label>
            <input className="form-input" value={config.responsavelTecnico || ''} onChange={(e) => upd('responsavelTecnico', e.target.value)} />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">SIF (inspeção federal)</label>
            <input className="form-input" value={config.sif || ''} onChange={(e) => upd('sif', e.target.value)} placeholder="Ex.: 4231" />
          </div>
          <div className="form-group">
            <label className="form-label">SIE (inspeção estadual)</label>
            <input className="form-input" value={config.sie || ''} onChange={(e) => upd('sie', e.target.value)} placeholder="Ex.: 0987" />
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Regras de validade (padrão)</h2>
        <p style={{ fontSize: 12, color: 'var(--app-text-soft, #777)', marginBottom: 12 }}>
          Vale quando o item não tem validade própria.
        </p>
        {regras.map((r) => (
          <div key={r.conservacao} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--app-border, #eee)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{CONS_LABEL[r.conservacao]}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--app-text-soft, #777)' }}>{r.tempLabel}</span>
            <input className="form-input" type="number" min={1} max={3650} style={{ width: 76 }}
              value={r.dias} onChange={(e) => updRegra(r.conservacao, parseInt(e.target.value, 10) || 1)} />
            <span style={{ fontSize: 12, color: 'var(--app-text-soft, #777)', width: 30 }}>dias</span>
          </div>
        ))}
      </div>

      <div>
        <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}

function AbaItens() {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  const [cons, setCons] = useState([])

  const carregar = () => api.get('/etiquetas/itens', { params: busca ? { busca } : {} })
    .then((r) => { setItens(r.data.itens); setCons(r.data.conservacoes) }).catch(() => {})
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t) }, [busca])

  async function salvarItem(it, patch) {
    const novo = { ...it, ...patch }
    setItens((xs) => xs.map((x) => (x.insumoId === it.insumoId ? novo : x)))
    try {
      await api.put(`/etiquetas/itens/${it.insumoId}`, {
        conservacaoPadrao: novo.conservacaoPadrao, validadeDias: novo.validadeDias, ativo: novo.ativo,
      })
      carregar() // devolve validadeEfetiva recalculada
    } catch { carregar() }
  }

  return (
    <div>
      <input className="form-input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Buscar item…"
        value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="table-card">
        <table className="hb-table">
          <thead>
            <tr><th>Item</th><th>Conservação padrão</th><th>Validade própria</th><th>Vale na cozinha</th></tr>
          </thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: '#999' }}>Nenhum item.</td></tr>}
            {itens.map((it) => (
              <tr key={it.insumoId}>
                <td style={{ fontWeight: 600 }}>{it.nome}</td>
                <td>
                  <select className="form-input" value={it.conservacaoPadrao || ''} onChange={(e) => salvarItem(it, { conservacaoPadrao: e.target.value || null })}>
                    <option value="">— escolher na hora —</option>
                    {cons.map((c) => <option key={c} value={c}>{CONS_LABEL[c]}</option>)}
                  </select>
                </td>
                <td>
                  <input className="form-input" type="number" min={1} max={3650} style={{ width: 90 }} placeholder="usa a regra"
                    value={it.validadeDias ?? ''} onChange={(e) => salvarItem(it, { validadeDias: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                </td>
                <td style={{ color: 'var(--app-text-soft, #777)' }}>
                  {it.validadeEfetiva ? `${it.validadeEfetiva} dia(s)` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Trocar o placeholder pela rota real**

Em `frontend/src/App.jsx`, importe no topo:
```jsx
import Etiquetas from './pages/Etiquetas'
```

Remova a linha 97 (`<Route path="etiquetas" element={<EmConstrucao … />} />`) e ponha, junto das rotas autenticadas:
```jsx
            <Route path="etiquetas" element={<Etiquetas />} />
            <Route path="etiquetas/:tab" element={<Etiquetas />} />
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built in …`, sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Etiquetas.jsx frontend/src/App.jsx
git commit -m "feat(etiquetas): tela de configuracao e itens"
git push origin main
```

**Fim da F1.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh` (tem migration).

---

## Task 5: Driver da Niimbot B1 (canvas → 1-bit → BLE)

O maior risco do projeto. Vem antes do quiosque para poder ser testado sozinho, com a impressora na mão.

**Files:**
- Create: `frontend/src/lib/niimbotB1.js`
- Modify: `frontend/package.json` (dependência)

**Interfaces:**
- Consumes: nada do projeto.
- Produces:
  - `bluetoothDisponivel() → boolean`
  - `conectar() → Promise<{ nome: string }>` (abre o seletor do navegador; exige gesto do usuário)
  - `imprimir(canvas, { copias = 1 }) → Promise<void>`
  - `desconectar() → void`
  - `canvasParaBitmap(canvas) → { largura, altura, linhas: Uint8Array[] }` (exportada para teste)

- [ ] **Step 1: Instalar a biblioteca com versão travada**

```bash
cd frontend && npm install -E niimbot-web-bluetooth@1.3.5
```
`-E` é obrigatório: a lib é engenharia reversa e não promete estabilidade de API.

- [ ] **Step 2: Escrever o driver**

Crie `frontend/src/lib/niimbotB1.js`:

```js
// Único arquivo que sabe que a impressora é uma Niimbot B1. Se um dia trocar de
// modelo, é aqui que mexe — a UI só conhece conectar/imprimir.
//
// A B1 não recebe texto (não fala TSPL/ZPL/ESC-POS): ela recebe bitmap 1-bit.
// Protocolo v3, 203 dpi, cabeça de 384 px = 48 mm.
import { NiimbotBluetoothClient } from 'niimbot-web-bluetooth'

export const LARGURA_PX = 384 // cabeça da B1; 48mm a 203dpi

let client = null

export function bluetoothDisponivel() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth
}

// Precisa ser chamado a partir de um gesto do usuário (clique) — exigência do
// navegador para abrir o seletor de dispositivos.
export async function conectar() {
  if (!bluetoothDisponivel()) throw new Error('Este navegador não tem Bluetooth. Use o Chrome no Android.')
  client = new NiimbotBluetoothClient()
  await client.connect()
  const info = await client.getPrinterInfo?.().catch(() => null)
  return { nome: info?.model || 'Niimbot B1' }
}

export function conectado() {
  return !!client?.isConnected?.()
}

export function desconectar() {
  try { client?.disconnect?.() } catch { /* já caiu */ }
  client = null
}

// Canvas → 1-bit, MSB-first, uma linha por entrada. Threshold fixo em 128 e sem
// dithering: é o que o protocolo espera, e dithering em etiqueta de 203dpi vira
// borrão ilegível.
export function canvasParaBitmap(canvas) {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, width, height)
  const bytesPorLinha = Math.ceil(width / 8)
  const linhas = []
  for (let y = 0; y < height; y++) {
    const linha = new Uint8Array(bytesPorLinha)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Luminância padrão; alfa 0 conta como branco (fundo não impresso).
      const lum = data[i + 3] === 0 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (lum < 128) linha[x >> 3] |= 0x80 >> (x & 7) // MSB-first
    }
    linhas.push(linha)
  }
  return { largura: width, altura: height, linhas }
}

export async function imprimir(canvas, { copias = 1 } = {}) {
  if (!client) throw new Error('Impressora não conectada.')
  if (canvas.width !== LARGURA_PX) {
    throw new Error(`A etiqueta precisa ter ${LARGURA_PX}px de largura (a cabeça da B1 tem 48mm).`)
  }
  await client.print(canvas, { quantity: copias, density: 3 })
}
```

> **Nota ao implementador:** a API exata de `niimbot-web-bluetooth@1.3.5` (`connect`, `print`, `getPrinterInfo`) deve ser conferida no README da versão instalada — `node_modules/niimbot-web-bluetooth/README.md`. Se os nomes divergirem, ajuste **apenas este arquivo**; a interface pública (`conectar`/`imprimir`/`desconectar`) não muda. `canvasParaBitmap` fica exportada porque é lógica nossa e testável mesmo sem impressora.

- [ ] **Step 3: Testar a conversão de bitmap (sem impressora)**

Crie `frontend/src/lib/niimbotB1.test.js`:

```js
// Roda no navegador (precisa de canvas). Chame de um console ou de uma página
// temporária: import('./lib/niimbotB1.test.js').then(m => m.run())
import { canvasParaBitmap } from './niimbotB1'

export function run() {
  const c = document.createElement('canvas')
  c.width = 16; c.height = 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 16, 2)
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 8, 1) // 8 px pretos na 1ª linha

  const bmp = canvasParaBitmap(c)
  const l0 = bmp.linhas[0], l1 = bmp.linhas[1]
  const ok = [
    ['2 bytes por linha', l0.length === 2],
    ['8 px pretos = 0xFF no 1º byte', l0[0] === 0xff],
    ['resto branco = 0x00', l0[1] === 0x00],
    ['2ª linha toda branca', l1[0] === 0x00 && l1[1] === 0x00],
    ['altura preservada', bmp.altura === 2],
  ]
  ok.forEach(([n, v]) => console.log(v ? `ok   ${n}` : `FALHA ${n}`))
  return ok.every(([, v]) => v)
}
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem erro de import.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/niimbotB1.js frontend/src/lib/niimbotB1.test.js frontend/package.json frontend/package-lock.json
git commit -m "feat(etiquetas): driver da Niimbot B1 (canvas -> 1-bit -> BLE)"
git push origin main
```

---

## Task 6: Desenho da etiqueta (canvas)

**Files:**
- Create: `frontend/src/lib/etiquetaCanvas.js`

**Interfaces:**
- Consumes: `LARGURA_PX` (Task 5).
- Produces: `desenharEtiqueta(canvas, dados, config) → void`, onde
  `dados = { nomeItem, tempLabel, conservacaoLabel, manipuladoEm: Date, validoAte: Date, responsavelNome, lote, qrDataUrl? }`
  e `config = { alturaMm, razaoSocial, cnpj, sif, sie }`.

- [ ] **Step 1: Escrever o módulo de desenho**

Crie `frontend/src/lib/etiquetaCanvas.js`:

```js
// Desenha a etiqueta. Só desenha — não conecta, não imprime, não busca dados.
// A prévia da tela e o bitmap enviado à impressora saem DESTA função, então o
// que o usuário vê é literalmente o que sai no papel.
import { LARGURA_PX } from './niimbotB1'

const DOTS_POR_MM = 8 // 203 dpi

const fmt = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Corta o texto com reticências até caber em `max` px.
function ajustar(ctx, texto, max) {
  let t = String(texto || '')
  if (ctx.measureText(t).width <= max) return t
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

export function dimensoes(config) {
  return { largura: LARGURA_PX, altura: Math.round((config?.alturaMm || 30) * DOTS_POR_MM) }
}

export function desenharEtiqueta(canvas, dados, config) {
  const { largura, altura } = dimensoes(config)
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const M = 8               // margem
  const qr = dados.qrDataUrl ? 64 : 0 // lado do QR
  const larguraTexto = largura - M * 2 - (qr ? qr + 6 : 0)
  let y = M

  // Nome do item — o que a cozinha lê de longe
  ctx.font = 'bold 22px monospace'
  ctx.fillText(ajustar(ctx, dados.nomeItem, larguraTexto), M, y)
  y += 26

  // Conservação
  ctx.font = 'bold 13px monospace'
  ctx.fillText(ajustar(ctx, `${dados.conservacaoLabel} · ${dados.tempLabel}`, larguraTexto), M, y)
  y += 18

  // Datas — o motivo da etiqueta existir
  ctx.font = '14px monospace'
  ctx.fillText(`PREP.: ${fmt(dados.manipuladoEm)}`, M, y); y += 17
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`VAL.:  ${fmt(dados.validoAte)}`, M, y); y += 19

  // Responsável + lote
  ctx.font = '11px monospace'
  ctx.fillText(ajustar(ctx, `RESP: ${dados.responsavelNome} · LOTE ${dados.lote}`, larguraTexto), M, y)
  y += 14

  // Rodapé: identificação do estabelecimento (rodapé fixo, ancorado na base)
  const rodape = [config?.razaoSocial, config?.cnpj ? `CNPJ ${config.cnpj}` : null,
    config?.sif ? `SIF ${config.sif}` : null, config?.sie ? `SIE ${config.sie}` : null]
    .filter(Boolean).join(' · ')
  if (rodape) {
    ctx.font = '10px monospace'
    ctx.fillText(ajustar(ctx, rodape, largura - M * 2), M, altura - M - 11)
  }

  // QR no canto superior direito
  if (dados.qrDataUrl && dados.qrImg) {
    ctx.drawImage(dados.qrImg, largura - M - qr, M, qr, qr)
  }
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/etiquetaCanvas.js
git commit -m "feat(etiquetas): desenho da etiqueta em canvas (previa = impressao)"
git push origin main
```

---

## Task 7: Quiosque da cozinha + registro

**Files:**
- Modify: `backend/server.js` (endpoints públicos)
- Create: `frontend/src/pages/EtiquetasQuiosque.jsx`
- Modify: `frontend/src/App.jsx` (rota pública)

**Interfaces:**
- Consumes: `validadeDe`/`gerarLote` (Task 1), `resolverDispositivo` (`backend/server.js:6591`), `desenharEtiqueta` (Task 6), `conectar`/`imprimir` (Task 5).
- Produces:
  - `GET /api/public/etiquetas/:token/bootstrap` → `{ loja, dispositivo, config, regras, itens, funcionarios }`
  - `POST /api/public/etiquetas/:token/registrar` ← `{ insumoId?, nomeAvulso?, conservacao, responsavelId, quantidade }` → `{ etiqueta }`

- [ ] **Step 1: Escrever os endpoints públicos**

Em `backend/server.js`, logo após o bloco de admin da Task 3:

```js
// ===== Etiquetas (PÚBLICO — quiosque por token, sem login) =====
// Fora do gate de auth: resolve a loja pelo token do Dispositivo e passa
// empresaId EXPLÍCITO (não há tenantStore aqui).

app.get('/api/public/etiquetas/:token/bootstrap', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const empresaId = disp.empresaId;

    const [loja, config, regras, insumos, cfgs, funcionarios] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true } }),
      prisma.etiquetaConfig.findFirst({ where: { empresaId } }),
      prisma.etiquetaRegra.findMany({ where: { empresaId, ativo: true }, orderBy: { ordem: 'asc' } }),
      prisma.insumo.findMany({ where: { empresaId, ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
      prisma.etiquetaItemConfig.findMany({ where: { empresaId, ativo: true } }),
      prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true } }),
    ]);

    // Quem bateu ponto no expediente corrente aparece primeiro: é quem está na
    // cozinha agora, e a lista inteira num tablet é lenta de percorrer.
    const { de, ate } = janelaExpedienteAtual();
    const presentes = new Set((await prisma.pontoRegistro.findMany({
      where: { empresaId, invalidada: false, dataHora: { gte: de, lt: ate } }, select: { funcionarioId: true },
    })).map((r) => r.funcionarioId));

    const cMap = new Map(cfgs.map((c) => [c.insumoId, c]));
    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null },
      dispositivo: { nome: disp.nome },
      config: config || { larguraMm: 50, alturaMm: 30, razaoSocial: loja?.nome || null },
      regras,
      itens: insumos.map((i) => {
        const c = cMap.get(i.id) || null;
        return { insumoId: i.id, nome: i.nome, conservacaoPadrao: c?.conservacaoPadrao || null, validadeDias: c?.validadeDias ?? null };
      }),
      funcionarios: funcionarios
        .map((f) => ({ id: f.id, nome: f.apelido || f.nome, presente: presentes.has(f.id) }))
        .sort((a, b) => (b.presente - a.presente) || a.nome.localeCompare(b.nome)),
    });
  } catch (err) { console.error('[public/etiquetas/bootstrap]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.post('/api/public/etiquetas/:token/registrar', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const empresaId = disp.empresaId;
    const b = req.body || {};

    const insumoId = b.insumoId ? parseInt(b.insumoId, 10) : null;
    const nomeAvulso = typeof b.nomeAvulso === 'string' ? b.nomeAvulso.trim().slice(0, 120) : '';
    if (!insumoId && !nomeAvulso) return res.status(400).json({ error: 'Escolha um item ou informe o nome.' });

    let nomeItem = nomeAvulso, itemConfig = null;
    if (insumoId) {
      const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
      if (!insumo) return res.status(404).json({ error: 'Item não encontrado.' });
      nomeItem = insumo.nome;
      itemConfig = await prisma.etiquetaItemConfig.findFirst({ where: { empresaId, insumoId } });
    }

    const func = b.responsavelId ? await prisma.funcionario.findFirst({ where: { id: parseInt(b.responsavelId, 10), empresaId } }) : null;
    if (!func) return res.status(400).json({ error: 'Escolha quem manipulou.' });

    const regras = await prisma.etiquetaRegra.findMany({ where: { empresaId, ativo: true } });
    // A validade é recalculada AQUI: o cliente não é fonte de verdade para a
    // data que vai colada num alimento.
    let calc;
    try { calc = validadeDe({ manipuladoEmMs: Date.now(), conservacao: b.conservacao, regras, itemConfig }); }
    catch (e) { return res.status(e.http || 400).json({ error: e.msg || 'Conservação inválida.' }); }

    const quantidade = Math.min(50, Math.max(1, parseInt(b.quantidade, 10) || 1));
    const etiqueta = await prisma.etiquetaImpressa.create({
      data: {
        empresaId, lote: gerarLote(), insumoId, nomeItem,
        conservacao: b.conservacao, tempLabel: calc.tempLabel,
        manipuladoEm: new Date(), validoAte: calc.validoAte, validadeDias: calc.dias,
        responsavelId: func.id, responsavelNome: func.apelido || func.nome,
        dispositivoId: disp.id, quantidade,
      },
    });
    await prisma.dispositivo.update({ where: { id: disp.id }, data: { ultimaSync: new Date() } });
    res.status(201).json({ ok: true, etiqueta });
  } catch (err) { console.error('[public/etiquetas/registrar]', err); res.status(500).json({ error: 'Erro ao registrar a etiqueta.' }); }
});

// Consulta pública do QR.
app.get('/api/public/etiquetas/lote/:lote', async (req, res) => {
  try {
    const e = await prisma.etiquetaImpressa.findUnique({ where: { lote: String(req.params.lote).toUpperCase() } });
    if (!e) return res.status(404).json({ error: 'Etiqueta não encontrada.' });
    res.json({ etiqueta: {
      lote: e.lote, nomeItem: e.nomeItem, conservacao: e.conservacao, tempLabel: e.tempLabel,
      manipuladoEm: e.manipuladoEm, validoAte: e.validoAte, responsavelNome: e.responsavelNome,
    } });
  } catch (err) { console.error('[public/etiquetas/lote]', err); res.status(500).json({ error: 'Erro ao consultar.' }); }
});
```

- [ ] **Step 2: Verificar o backend**

```bash
cd backend && node --check server.js && node server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4001/api/public/etiquetas/token-invalido/bootstrap  # 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4001/api/public/etiquetas/lote/XXXXXX               # 404
kill %1
```
Expected: `404` nos dois (rota pública responde, token/lote não existem).

- [ ] **Step 3: Escrever o quiosque**

Crie `frontend/src/pages/EtiquetasQuiosque.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { desenharEtiqueta } from '../lib/etiquetaCanvas'
import { bluetoothDisponivel, conectar, conectado, imprimir } from '../lib/niimbotB1'

const API = import.meta.env.VITE_API_URL || '/api'

const CONS_LABEL = {
  CONGELADO: 'Congelado', RESFRIADO_0_4: 'Resfriado', RESFRIADO_4_6: 'Resfriado',
  AMBIENTE: 'Ambiente', DESCONGELADO: 'Descongelado', ABERTO: 'Aberto',
}

export default function EtiquetasQuiosque() {
  const { token } = useParams()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [item, setItem] = useState(null)
  const [conservacao, setConservacao] = useState('')
  const [responsavelId, setResponsavelId] = useState(null)
  const [busca, setBusca] = useState('')
  const [impressora, setImpressora] = useState('')
  const [imprimindo, setImprimindo] = useState(false)
  const canvasRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/public/etiquetas/${token}/bootstrap`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Dispositivo não autorizado.'))))
      .then(setDados)
      .catch((e) => setErro(e.message))
  }, [token])

  // Sem Bluetooth o fluxo inteiro é inútil: avisar no boot, não no clique.
  const semBt = !bluetoothDisponivel()

  const regra = dados?.regras?.find((r) => r.conservacao === conservacao) || null
  const dias = item?.validadeDias ?? regra?.dias ?? null
  const validoAte = dias ? new Date(Date.now() + dias * 86400000) : null

  function escolher(it) {
    setItem(it)
    setConservacao(it.conservacaoPadrao || '')
  }

  async function conectarImpressora() {
    try { const { nome } = await conectar(); setImpressora(nome) }
    catch (e) { setErro(e.message) }
  }

  async function imprimirEtiqueta() {
    if (!item || !conservacao || !responsavelId) return
    setImprimindo(true); setErro('')
    try {
      const r = await fetch(`${API}/public/etiquetas/${token}/registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insumoId: item.insumoId || null, nomeAvulso: item.avulso ? item.nome : null, conservacao, responsavelId, quantidade: 1 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro ao registrar.')

      const e = j.etiqueta
      desenharEtiqueta(canvasRef.current, {
        nomeItem: e.nomeItem, conservacaoLabel: CONS_LABEL[e.conservacao], tempLabel: e.tempLabel,
        manipuladoEm: new Date(e.manipuladoEm), validoAte: new Date(e.validoAte),
        responsavelNome: e.responsavelNome, lote: e.lote,
      }, dados.config)
      if (conectado()) await imprimir(canvasRef.current, { copias: 1 })
      setItem(null); setConservacao('')
    } catch (e) { setErro(e.message) }
    finally { setImprimindo(false) }
  }

  if (erro && !dados) return <div style={{ padding: 24, textAlign: 'center' }}>{erro}</div>
  if (!dados) return <div style={{ padding: 24, textAlign: 'center' }}>Carregando…</div>

  const itens = dados.itens.filter((i) => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div style={{ minHeight: '100dvh', background: '#f4f1ea', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>{dados.loja.nome}</strong>
        <button type="button" onClick={conectarImpressora} disabled={semBt}
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8 }}>
          {impressora ? `🖨 ${impressora}` : 'Conectar impressora'}
        </button>
      </header>

      {semBt && (
        <div style={{ background: '#fee', border: '1px solid #fcc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
          Este navegador não imprime por Bluetooth. Use o <strong>Chrome no Android</strong> — iPhone não tem suporte.
        </div>
      )}
      {erro && <div style={{ background: '#fee', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      {!item ? (
        <>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item…"
            style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd', marginBottom: 12, fontSize: 16 }} />
          <div style={{ display: 'grid', gap: 8 }}>
            {itens.map((i) => (
              <button key={i.insumoId} type="button" onClick={() => escolher(i)}
                style={{ padding: 14, borderRadius: 10, border: '1px solid #ddd', background: '#fff', textAlign: 'left', fontSize: 15, fontWeight: 600 }}>
                {i.nome}
              </button>
            ))}
            {busca && (
              <button type="button" onClick={() => escolher({ nome: busca, avulso: true, conservacaoPadrao: null, validadeDias: null })}
                style={{ padding: 14, borderRadius: 10, border: '1px dashed #bbb', background: 'transparent', textAlign: 'left', fontSize: 14 }}>
                Etiquetar “{busca}” como item avulso
              </button>
            )}
          </div>
        </>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
          <button type="button" onClick={() => setItem(null)} style={{ fontSize: 13, marginBottom: 10 }}>← trocar item</button>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{item.nome}</h2>

          <label style={{ fontSize: 12, fontWeight: 700 }}>CONSERVAÇÃO</label>
          <div style={{ display: 'grid', gap: 6, margin: '6px 0 14px' }}>
            {dados.regras.map((r) => (
              <button key={r.conservacao} type="button" onClick={() => setConservacao(r.conservacao)}
                style={{ padding: 12, borderRadius: 8, border: conservacao === r.conservacao ? '2px solid #eab802' : '1px solid #ddd', background: '#fff', textAlign: 'left' }}>
                {CONS_LABEL[r.conservacao]} · {r.tempLabel}
              </button>
            ))}
          </div>

          {validoAte && (
            <p style={{ fontSize: 14, marginBottom: 14 }}>
              Vence em <strong>{validoAte.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong> ({dias} dia{dias > 1 ? 's' : ''})
            </p>
          )}

          <label style={{ fontSize: 12, fontWeight: 700 }}>QUEM MANIPULOU</label>
          <div style={{ display: 'grid', gap: 6, margin: '6px 0 16px' }}>
            {dados.funcionarios.map((f) => (
              <button key={f.id} type="button" onClick={() => setResponsavelId(f.id)}
                style={{ padding: 12, borderRadius: 8, border: responsavelId === f.id ? '2px solid #eab802' : '1px solid #ddd', background: '#fff', textAlign: 'left' }}>
                {f.nome} {f.presente && <span style={{ fontSize: 11, color: '#0a0' }}>· no turno</span>}
              </button>
            ))}
          </div>

          <button type="button" disabled={!conservacao || !responsavelId || imprimindo} onClick={imprimirEtiqueta}
            style={{ width: '100%', padding: 16, borderRadius: 10, border: 'none', background: '#0e1319', color: '#eab802', fontSize: 16, fontWeight: 800, opacity: (!conservacao || !responsavelId) ? 0.5 : 1 }}>
            {imprimindo ? 'Imprimindo…' : 'Imprimir etiqueta'}
          </button>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
```

- [ ] **Step 4: Registrar a rota pública**

Em `frontend/src/App.jsx`, importe e adicione **fora** do `<Route element={<RequireAuth>…}`, junto das outras públicas:

```jsx
import EtiquetasQuiosque from './pages/EtiquetasQuiosque'
// …
          <Route path="etiquetas/:token/imprimir" element={<EtiquetasQuiosque />} />
```

> A rota é `/etiquetas/:token/imprimir` — e não `/etiquetas/:token` — para não colidir com `/etiquetas/:tab` da tela de admin (Task 4), que já ocupa esse formato.

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js frontend/src/pages/EtiquetasQuiosque.jsx frontend/src/App.jsx
git commit -m "feat(etiquetas): quiosque da cozinha e registro da etiqueta"
git push origin main
```

**Fim da F2.** Deploy e **testar com a B1 real** — é o que valida bitmap, calibração e legibilidade.

---

## Task 8: Painel de vencimentos e histórico

**Files:**
- Modify: `backend/server.js` (2 endpoints admin)
- Modify: `frontend/src/pages/Etiquetas.jsx` (2 abas)

**Interfaces:**
- Consumes: `EtiquetaImpressa` (Task 2), `janelaExpedienteAtual` (`backend/server.js`).
- Produces:
  - `GET /api/etiquetas/painel` → `{ vencidas: [], hoje: [], amanha: [] }`
  - `GET /api/etiquetas/historico?de=&ate=&busca=` → `{ etiquetas: [] }`

- [ ] **Step 1: Endpoints**

Em `backend/server.js`, junto do bloco admin:

```js
app.get('/api/etiquetas/painel', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const agora = new Date();
    const fim = new Date(agora.getTime() + 2 * 86400000); // hoje + amanhã
    const linhas = await prisma.etiquetaImpressa.findMany({
      where: { validoAte: { lt: fim } }, orderBy: { validoAte: 'asc' }, take: 500,
    });
    const f = brFields(agora);
    const fimDeHoje = brToUtcMs(f.y, f.mo, f.day, 23, 59);
    const fimDeAmanha = brToUtcMs(f.y, f.mo, f.day + 1, 23, 59);
    const grupo = { vencidas: [], hoje: [], amanha: [] };
    for (const e of linhas) {
      const t = new Date(e.validoAte).getTime();
      if (t < agora.getTime()) grupo.vencidas.push(e);
      else if (t <= fimDeHoje) grupo.hoje.push(e);
      else if (t <= fimDeAmanha) grupo.amanha.push(e);
    }
    res.json(grupo);
  } catch (err) { console.error('[etiquetas/painel]', err); res.status(500).json({ error: 'Erro ao carregar o painel.' }); }
});

app.get('/api/etiquetas/historico', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = {};
    if (busca) where.OR = [{ nomeItem: { contains: busca, mode: 'insensitive' } }, { lote: { contains: busca.toUpperCase() } }];
    const etiquetas = await prisma.etiquetaImpressa.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 200 });
    res.json({ etiquetas });
  } catch (err) { console.error('[etiquetas/historico]', err); res.status(500).json({ error: 'Erro ao carregar o histórico.' }); }
});
```

- [ ] **Step 2: Abas no frontend**

Em `frontend/src/pages/Etiquetas.jsx`, troque a constante `TABS` por:

```jsx
const TABS = [['config', 'Configuração'], ['itens', 'Itens'], ['painel', 'Vencimentos'], ['historico', 'Histórico']]
```

E o render das abas por:

```jsx
      {atual === 'config' && <AbaConfig />}
      {atual === 'itens' && <AbaItens />}
      {atual === 'painel' && <AbaPainel />}
      {atual === 'historico' && <AbaHistorico />}
```

Adicione os dois componentes ao fim do arquivo:

```jsx
const dt = (v) => new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function AbaPainel() {
  const [g, setG] = useState({ vencidas: [], hoje: [], amanha: [] })
  useEffect(() => { api.get('/etiquetas/painel').then((r) => setG(r.data)).catch(() => {}) }, [])

  const Bloco = ({ titulo, cor, lista }) => (
    <div className="table-card" style={{ padding: 14, marginBottom: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: cor, marginBottom: 8 }}>{titulo} · {lista.length}</h3>
      {lista.length === 0 ? <p style={{ fontSize: 12, color: '#999' }}>Nada aqui.</p> : lista.map((e) => (
        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--app-border,#eee)', fontSize: 13 }}>
          <span style={{ fontWeight: 600, minWidth: 0 }}>{e.nomeItem}</span>
          <span style={{ color: '#777', flexShrink: 0 }}>{dt(e.validoAte)} · {e.responsavelNome}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 720 }}>
      <Bloco titulo="Vencidas" cor="#dc2626" lista={g.vencidas} />
      <Bloco titulo="Vencem hoje" cor="#b45309" lista={g.hoje} />
      <Bloco titulo="Vencem amanhã" cor="#555" lista={g.amanha} />
    </div>
  )
}

function AbaHistorico() {
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/etiquetas/historico', { params: busca ? { busca } : {} })
        .then((r) => setLista(r.data.etiquetas)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  return (
    <div>
      <input className="form-input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Buscar item ou lote…"
        value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="table-card">
        <table className="hb-table">
          <thead><tr><th>Item</th><th>Lote</th><th>Manipulado</th><th>Validade</th><th>Responsável</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: '#999' }}>Nenhuma etiqueta.</td></tr>}
            {lista.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600 }}>{e.nomeItem}</td>
                <td style={{ fontFamily: 'monospace' }}>{e.lote}</td>
                <td>{dt(e.manipuladoEm)}</td>
                <td>{dt(e.validoAte)}</td>
                <td>{e.responsavelNome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

```bash
cd backend && node --check server.js
cd ../frontend && npm run build
```
Expected: sem erro; `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js frontend/src/pages/Etiquetas.jsx
git commit -m "feat(etiquetas): painel de vencimentos e historico"
git push origin main
```

**Fim da F3.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh`

---

## Checklist pós-deploy (usuário)

1. **Configurações › Etiquetas › Configuração** — preencher CNPJ e conferir as 6 regras.
2. **Itens** — definir conservação padrão dos itens mais usados.
3. **Ponto Facial › Coletor/Dispositivos** — cadastrar um dispositivo para a cozinha e pegar o token.
4. Abrir `https://pdv.nachapahub.com.br/etiquetas/<token>/imprimir` no **Chrome do Android**.
5. Parear a B1 e **imprimir uma etiqueta de verdade** — conferir legibilidade e alinhamento (a 1ª pode sair torta: a B1 calibra pela altura gravada no RFID).
