# Checklist Foto (Fatia 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O operador tira foto como evidência num item FOTO da execução, a foto crítica é obrigatória para concluir, e o gestor abre a execução e revê tudo (respostas + fotos).

**Architecture:** Reusa toda a Fatia 1. A foto é base64 dataURL numa tabela própria (`ChecklistFoto`) para não pesar as queries de lista; os bytes carregam sob demanda por endpoint dedicado. Compressão no cliente antes de subir. Conformidade da foto é `null` (evidência, sem IA); a obrigatoriedade é uma checagem de completude no concluir.

**Tech Stack:** Express 5 ESM (`backend/server.js`), Prisma 7 + adapter-pg, Postgres 16. React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-07-16-checklist-foto-design.md`

## Global Constraints

- **ESM** (`import`/`export`, nunca `require`). Prisma 7 com adapter.
- **Multi-tenant**: models novos entram em `MODELS_TENANT` (`backend/server.js:24`). Rotas **admin** dentro do gate (extension injeta `empresaId`; filtro manual é erro). Rotas de **colaborador** FORA do gate → **`empresaId` explícito em toda query** (de `exigirColaborador` → `sess.empresaId`) + **posse por setor** via `chkPosseExecucao`. **Nunca `req.user.empresaId`**.
- **Enum + Postgres**: adicionar `FOTO` a `TipoItemChecklist` é `ALTER TYPE ... ADD VALUE`. **O Postgres não deixa usar um valor de enum novo na mesma transação em que ele foi adicionado.** Por isso o `ADD VALUE` vai numa migration própria, e o INSERT de itens FOTO nos templates vai numa migration seguinte.
- **Foto**: base64 dataURL, comprimida no cliente (máx 1280px, JPEG ~0.7). Tamanho validado no **servidor** (margem do body limit de 5mb). Uma foto por item por execução.
- **Conformidade FOTO = `null`** (evidência). Foto obrigatória = item FOTO **crítico** sem foto bloqueia o concluir (400) — checagem no servidor.
- **Snapshot imutável** (a foto pertence à execução, não ao checklist editável).
- Migration: próximos livres `20260716320000` e `20260716330000`. `migrate deploy`; se der drift, **PARAR e reportar** (nunca resetar).
- Frontend: padrão vivo de `Checklist.jsx`/`BonificacaoEu.jsx`; classes reais; **modais fecham só pelo botão**.
- Commits: um por task, direto na `main`, `git push origin main` em seguida.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `backend/checklistConformidade.js` | +caso FOTO em `avaliarResposta`; +`fotosCriticasFaltando` (regra pura da obrigatoriedade). |
| `backend/checklistConformidade.test.js` | +testes de FOTO e de `fotosCriticasFaltando`. |
| `backend/prisma/schema.prisma` | +`FOTO` no enum; +model `ChecklistFoto`; inverse relation em `ChecklistExecucao`. |
| `backend/prisma/migrations/20260716320000_checklist_foto_enum/migration.sql` **(novo)** | Só `ALTER TYPE ADD VALUE 'FOTO'`. |
| `backend/prisma/migrations/20260716330000_checklist_foto/migration.sql` **(novo)** | Tabela `ChecklistFoto` + INSERT dos itens FOTO nos templates semeados. |
| `backend/server.js` | `MODELS_TENANT`; seed constant (+itens FOTO); endpoints foto (operador e gestor); `chkExecJson` +metadata; regra de foto obrigatória no concluir. |
| `frontend/src/lib/comprimirFoto.js` **(novo)** | `dimensoesComprimidas` (pura) + `comprimirFoto` (canvas). |
| `frontend/src/lib/comprimirFoto.test.js` **(novo)** | Teste da lógica de escala. |
| `frontend/src/pages/BonificacaoEu.jsx` | Captura de foto no item FOTO da execução. |
| `frontend/src/pages/Checklist.jsx` | FOTO no editor de itens; modal Detalhe da Execução + seção Execuções recentes no Painel. |

---

## Task 1: Regra de FOTO (conformidade + obrigatoriedade) — módulo puro

**Files:** Modify `backend/checklistConformidade.js`, `backend/checklistConformidade.test.js`

**Interfaces — Produces:** `avaliarResposta` passa a ter caso `FOTO` explícito (`{conforme:null,motivo:null}`); `fotosCriticasFaltando(itensSnapshot, chavesComFoto) → string[]` (títulos dos itens FOTO críticos sem foto).

- [ ] **Step 1: Testes que falham** — adicione ao fim de `backend/checklistConformidade.test.js`, **antes** da linha final `console.log(\`\n${ok}...\`)`/`process.exit`:

```js
console.log('\n== FOTO ==');
t('FOTO sempre evidencia (com foto)', avaliarResposta({ tipo: 'FOTO', config: {}, valor: { temFoto: true } }), { conforme: null, motivo: null });
t('FOTO sempre evidencia (sem valor)', avaliarResposta({ tipo: 'FOTO', config: {}, valor: null }), { conforme: null, motivo: null });

console.log('\n== fotosCriticasFaltando ==');
const snap = [
  { chave: '1', tipo: 'FOTO', critico: true, titulo: 'Foto da válvula' },
  { chave: '2', tipo: 'FOTO', critico: false, titulo: 'Foto geral' },
  { chave: '3', tipo: 'CHECK', critico: true, titulo: 'Desligar fogões' },
];
t('critica sem foto = falta', fotosCriticasFaltando(snap, new Set([])), ['Foto da válvula']);
t('critica com foto = ok', fotosCriticasFaltando(snap, new Set(['1'])), []);
t('nao-critica sem foto = ok', fotosCriticasFaltando(snap, new Set(['1'])), []);
t('aceita array em vez de Set', fotosCriticasFaltando(snap, ['1']), []);
t('CHECK critico nao entra (so FOTO)', fotosCriticasFaltando(snap, new Set(['1'])), []);
```

E adicione ao import do teste (topo do arquivo) `fotosCriticasFaltando`:
```js
import { avaliarResposta, execucaoEmAlerta, fotosCriticasFaltando } from './checklistConformidade.js';
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && node checklistConformidade.test.js` → falha (`fotosCriticasFaltando is not a function`).

- [ ] **Step 3: Implementar** — em `backend/checklistConformidade.js`:

No `switch (tipo)` de `avaliarResposta`, troque `case 'TEXTO':` por um bloco explícito que também cobre FOTO:
```js
    case 'TEXTO':
    case 'FOTO':
      // TEXTO é observação; FOTO é evidência — sem IA, nenhuma das duas se julga
      // por conteúdo. Sempre "não avalia".
      return { conforme: null, motivo: null };
```
(remova o `case 'TEXTO':` antigo se ele estava junto do `default`; o `default` continua devolvendo `{conforme:null,motivo:null}`.)

Adicione a função nova ao fim do arquivo:
```js
// Obrigatoriedade da foto: um item FOTO CRÍTICO precisa de foto para concluir.
// Recebe os itens do snapshot e o conjunto de itemChave que já têm foto; devolve
// os títulos dos itens FOTO críticos ainda sem foto (vazio = pode concluir).
export function fotosCriticasFaltando(itensSnapshot, chavesComFoto) {
  const tem = chavesComFoto instanceof Set ? chavesComFoto : new Set(chavesComFoto || []);
  return (itensSnapshot || [])
    .filter((it) => it.tipo === 'FOTO' && it.critico && !tem.has(it.chave))
    .map((it) => it.titulo);
}
```

- [ ] **Step 4: Rodar e ver passar** — `cd backend && node checklistConformidade.test.js` → `30 ok, 0 falha(s)` (23 + 7 novos), exit 0.

- [ ] **Step 5: Commit**
```bash
git add backend/checklistConformidade.js backend/checklistConformidade.test.js
git commit -m "feat(checklist): regra de FOTO (evidencia) + foto critica obrigatoria (puro + teste)"
git push origin main
```

---

## Task 2: Enum FOTO + model ChecklistFoto + migrations + seed

**Files:** Modify `backend/prisma/schema.prisma`, `backend/server.js` (`MODELS_TENANT` + seed constant); Create as 2 migrations.

**Interfaces — Produces:** enum `TipoItemChecklist` com `FOTO`; model `ChecklistFoto`.

- [ ] **Step 1: Schema** — em `backend/prisma/schema.prisma`:

No enum, adicione `FOTO`:
```prisma
enum TipoItemChecklist {
  CHECK
  AVALIACAO
  TEXTO
  NUMERICO
  SELECAO
  FOTO
}
```

Model novo (ao fim do bloco Checklist):
```prisma
model ChecklistFoto {
  id           Int      @id @default(autoincrement())
  empresaId    Int
  execucaoId   Int
  itemChave    String
  dataUrl      String   @db.Text
  largura      Int?
  altura       Int?
  tamanhoBytes Int?
  criadoEm     DateTime @default(now())
  execucao     ChecklistExecucao @relation(fields: [execucaoId], references: [id], onDelete: Cascade)
  @@unique([execucaoId, itemChave])
  @@index([empresaId])
}
```

Em `model ChecklistExecucao`, adicione a relação inversa:
```prisma
  fotos             ChecklistFoto[]
```

- [ ] **Step 2: Migration 1 (enum)** — `backend/prisma/migrations/20260716320000_checklist_foto_enum/migration.sql`:
```sql
-- FOTO no enum, numa migration ISOLADA: o Postgres não deixa usar um valor de
-- enum novo na mesma transação em que ele é adicionado. O INSERT que usa FOTO
-- (itens dos templates) fica na migration seguinte.
ALTER TYPE "TipoItemChecklist" ADD VALUE IF NOT EXISTS 'FOTO';
```

- [ ] **Step 3: Migration 2 (tabela + itens FOTO nos templates)** — `backend/prisma/migrations/20260716330000_checklist_foto/migration.sql`:
```sql
CREATE TABLE "ChecklistFoto" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "execucaoId" INTEGER NOT NULL,
  "itemChave" TEXT NOT NULL, "dataUrl" TEXT NOT NULL, "largura" INTEGER, "altura" INTEGER,
  "tamanhoBytes" INTEGER, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistFoto_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ChecklistExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChecklistFoto_execucaoId_itemChave_key" ON "ChecklistFoto"("execucaoId","itemChave");
CREATE INDEX "ChecklistFoto_empresaId_idx" ON "ChecklistFoto"("empresaId");

-- Backfill: os itens de foto que a Fatia 1 tirou dos templates voltam aos templates
-- JÁ semeados (lojas novas recebem pelo seed atualizado). Casa por nome+categoria,
-- anexa ao fim (ordem = max+1) e é idempotente (NOT EXISTS pelo título).
INSERT INTO "ChecklistTemplateItem" ("empresaId","templateId","ordem","tipo","titulo","descricao","critico","config")
SELECT t."empresaId", t."id",
  (SELECT COALESCE(MAX(i2."ordem"),-1)+1 FROM "ChecklistTemplateItem" i2 WHERE i2."templateId"=t."id"),
  'FOTO'::"TipoItemChecklist", f.titulo, f.descricao, f.critico, NULL
FROM "ChecklistTemplate" t
JOIN (VALUES
  ('Abertura Cozinha','Abertura','Foto da organização geral','Verifique se a cozinha está organizada, limpa e sem resíduos',false),
  ('Abertura Salão','Abertura','Foto do salão montado','Verifique se as mesas estão arrumadas e o ambiente apresentável',false),
  ('Fechamento Cozinha','Fechamento','Foto da válvula de gás desligada','Verifique se a válvula de gás está na posição FECHADA',true),
  ('Fechamento Cozinha','Fechamento','Foto do estado final da cozinha','Verifique se os equipamentos estão desligados e a cozinha limpa',false),
  ('Controle de Pragas','Controle de Pragas','Foto das armadilhas','Verifique se as armadilhas estão intactas e posicionadas',false),
  ('Segurança Alimentar','Segurança Alimentar','Foto das etiquetas de validade','Verifique se as etiquetas estão visíveis e dentro do prazo',false)
) AS f(tnome,tcat,titulo,descricao,critico)
  ON t."nome"=f.tnome AND t."categoria"=f.tcat
WHERE NOT EXISTS (
  SELECT 1 FROM "ChecklistTemplateItem" i3 WHERE i3."templateId"=t."id" AND i3."titulo"=f.titulo
);
```

- [ ] **Step 4: `MODELS_TENANT` + seed constant** — em `backend/server.js`:

Adicione `'checklistFoto'` ao Set `MODELS_TENANT`.

Na constante `CHECKLIST_TEMPLATES_SEED`, adicione os itens FOTO aos templates certos (para lojas novas), no fim da lista de `itens` de cada um:
- `Abertura Cozinha`: `{ tipo: 'FOTO', titulo: 'Foto da organização geral', descricao: 'Verifique se a cozinha está organizada, limpa e sem resíduos' }`
- `Abertura Salão`: `{ tipo: 'FOTO', titulo: 'Foto do salão montado', descricao: 'Verifique se as mesas estão arrumadas e o ambiente apresentável' }`
- `Fechamento Cozinha`: `{ tipo: 'FOTO', titulo: 'Foto da válvula de gás desligada', descricao: 'Verifique se a válvula de gás está na posição FECHADA', critico: true }` e `{ tipo: 'FOTO', titulo: 'Foto do estado final da cozinha', descricao: 'Verifique se os equipamentos estão desligados e a cozinha limpa' }`
- `Controle de Pragas`: `{ tipo: 'FOTO', titulo: 'Foto das armadilhas', descricao: 'Verifique se as armadilhas estão intactas e posicionadas' }`
- `Segurança Alimentar`: `{ tipo: 'FOTO', titulo: 'Foto das etiquetas de validade', descricao: 'Verifique se as etiquetas estão visíveis e dentro do prazo' }`

Também inclua `'FOTO'` no set de tipos válidos de `chkNormalizarItens` (a função que valida itens de template/checklist) — hoje é `new Set(['CHECK','AVALIACAO','TEXTO','NUMERICO','SELECAO'])`; adicione `'FOTO'`.

- [ ] **Step 5: Aplicar e verificar**
```bash
cd backend && npx prisma migrate deploy && npx prisma generate && node --check server.js
node checklistConformidade.test.js   # 30 ok
```
Confirme no banco que a tabela `ChecklistFoto` existe, que `FOTO` está no enum, e que os itens FOTO foram anexados aos templates (ex.: `Fechamento Cozinha` deve ter os 2 itens de foto). Cole no relatório.

- [ ] **Step 6: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260716320000_checklist_foto_enum backend/prisma/migrations/20260716330000_checklist_foto backend/server.js
git commit -m "feat(checklist): enum FOTO, model ChecklistFoto e itens de foto nos templates"
git push origin main
```

---

## Task 3: FOTO no editor de itens do gestor

**Files:** Modify `frontend/src/pages/Checklist.jsx`

**Interfaces — Consumes:** o enum FOTO (Task 2).

- [ ] **Step 1: Adicionar FOTO ao editor** — em `frontend/src/pages/Checklist.jsx`:
  - No `TIPO_LABEL`, adicione `FOTO: 'Foto'`.
  - Na constante `TIPOS` (usada no `<select>` de tipo do item, no `ChecklistEditor`), adicione `'FOTO'`.
  - O item FOTO **não tem config** (como CHECK/TEXTO): o editor não renderiza campos extras para ele — confirme que o `ChecklistEditor` só renderiza config para NUMERICO/AVALIACAO/SELECAO (FOTO cai fora desses `if`, sem UI de config). Se houver um rótulo/legenda dizendo o que é o tipo, um comentário em português basta.

- [ ] **Step 2: Build** — `cd frontend && npm run build` → `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Checklist.jsx
git commit -m "feat(checklist): tipo FOTO no editor de itens do gestor"
git push origin main
```

**Fim da F1.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh` (2 migrations).

---

## Task 4: Compressão de foto no cliente

**Files:** Create `frontend/src/lib/comprimirFoto.js`, `frontend/src/lib/comprimirFoto.test.js`

**Interfaces — Produces:**
- `dimensoesComprimidas(largura, altura, teto = 1280) → { largura, altura }` (pura)
- `comprimirFoto(file, { teto = 1280, qualidade = 0.7 } = {}) → Promise<{ dataUrl, largura, altura, tamanhoBytes }>` (canvas)

- [ ] **Step 1: Teste que falha** — `frontend/src/lib/comprimirFoto.test.js`:
```js
// Testa só a lógica de escala (pura). A parte de canvas roda no navegador.
// Rodar: node src/lib/comprimirFoto.test.js
import { dimensoesComprimidas } from './comprimirFoto.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };

t('menor que o teto nao muda', dimensoesComprimidas(800, 600, 1280), { largura: 800, altura: 600 });
t('paisagem escala pela largura', dimensoesComprimidas(4000, 3000, 1280), { largura: 1280, altura: 960 });
t('retrato escala pela altura', dimensoesComprimidas(3000, 4000, 1280), { largura: 960, altura: 1280 });
t('quadrado no teto', dimensoesComprimidas(2560, 2560, 1280), { largura: 1280, altura: 1280 });
t('exatamente no teto nao muda', dimensoesComprimidas(1280, 720, 1280), { largura: 1280, altura: 720 });
t('arredonda pra inteiro', dimensoesComprimidas(1281, 721, 1280), { largura: 1280, altura: 720 });

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && node src/lib/comprimirFoto.test.js`.

- [ ] **Step 3: Implementar** — `frontend/src/lib/comprimirFoto.js`:
```js
// Comprime a foto ANTES de subir — a evidência vira base64 no banco (padrão do
// PDV) e precisa caber no body limit (5mb). Redimensiona para no máx `teto` px no
// maior lado e exporta JPEG. dimensoesComprimidas é pura (testável sem canvas).

export function dimensoesComprimidas(largura, altura, teto = 1280) {
  const maior = Math.max(largura, altura);
  if (maior <= teto) return { largura, altura };
  const escala = teto / maior;
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

export function comprimirFoto(file, { teto = 1280, qualidade = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const { largura, altura } = dimensoesComprimidas(img.naturalWidth, img.naturalHeight, teto);
        const canvas = document.createElement('canvas');
        canvas.width = largura; canvas.height = altura;
        canvas.getContext('2d').drawImage(img, 0, 0, largura, altura);
        const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
        URL.revokeObjectURL(url);
        // base64 ~= bytes * 4/3.
        const tamanhoBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        resolve({ dataUrl, largura, altura, tamanhoBytes });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
```

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && node src/lib/comprimirFoto.test.js` → `6 ok, 0 falha(s)`.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/comprimirFoto.js frontend/src/lib/comprimirFoto.test.js
git commit -m "feat(checklist): compressao de foto no cliente (escala pura + teste)"
git push origin main
```

---

## Task 5: Endpoints de foto do operador + concluir obrigatório

**Files:** Modify `backend/server.js` (bloco `/api/public/colaborador/*`)

**Interfaces — Consumes:** `chkPosseExecucao(sess, id, {comRespostas})`, `chkExecJson`, `fotosCriticasFaltando`, `chkAbrirExecucao`. **Produces:**
- `PUT /api/public/colaborador/execucoes/:id/foto` · `GET /api/public/colaborador/fotos/:id`
- `chkExecJson` passa a devolver `fotos: { [itemChave]: { id } }`

- [ ] **Step 1: `chkExecJson` + includes** — em `backend/server.js`:

Atualize `chkExecJson` para incluir as fotos (metadata, sem bytes):
```js
function chkExecJson(exec) {
  const rmap = {}; for (const r of exec.respostas || []) rmap[r.itemChave] = { valor: r.valorJson, conforme: r.conforme, observacao: r.observacao };
  const fmap = {}; for (const f of exec.fotos || []) fmap[f.itemChave] = { id: f.id };
  return { id: exec.id, checklistId: exec.checklistId, status: exec.status, emAlerta: exec.emAlerta, itens: exec.itensSnapshotJson, respostas: rmap, fotos: fmap };
}
```

Nos pontos onde a execução é carregada para `chkExecJson` (o `create`/`findFirst` dentro de `chkAbrirExecucao`, e o `GET .../execucoes/:id`), adicione `fotos: true` ao `include` (junto de `respostas: true`). Ex.: em `chkAbrirExecucao`, `include: { respostas: true, fotos: true }` no `findFirst` e no `create`; no `GET .../execucoes/:id`, `include: { respostas: true, fotos: true }`.

- [ ] **Step 2: Endpoints de foto** — no bloco `/api/public/colaborador/*`:
```js
// Sobe/atualiza a foto de um item FOTO (uma por item por execução). dataUrl já vem
// comprimido do cliente; o servidor ainda valida tamanho e formato.
app.put('/api/public/colaborador/execucoes/:id/foto', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await chkPosseExecucao(sess, parseInt(req.params.id, 10));
    if (exec.status === 'CONCLUIDA') return res.status(409).json({ error: 'Execução já concluída.' });
    const itemChave = String(req.body?.itemChave || '');
    const item = (exec.itensSnapshotJson || []).find((it) => it.chave === itemChave);
    if (!item || item.tipo !== 'FOTO') return res.status(400).json({ error: 'Item de foto inválido.' });
    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return res.status(400).json({ error: 'Foto inválida.' });
    if (dataUrl.length > 4_500_000) return res.status(413).json({ error: 'Foto muito grande. Tente novamente.' });
    const tamanhoBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    const largura = parseInt(req.body?.largura, 10) || null;
    const altura = parseInt(req.body?.altura, 10) || null;

    const fExist = await prisma.checklistFoto.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId } });
    if (fExist) await prisma.checklistFoto.updateMany({ where: { id: fExist.id, empresaId: sess.empresaId }, data: { dataUrl, tamanhoBytes, largura, altura } });
    else await prisma.checklistFoto.create({ data: { empresaId: sess.empresaId, execucaoId: exec.id, itemChave, dataUrl, tamanhoBytes, largura, altura } });

    // marca a resposta do item (temFoto); conformidade FOTO é sempre null.
    const rExist = await prisma.checklistResposta.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId } });
    const dados = { tipo: 'FOTO', valorJson: { temFoto: true }, conforme: null };
    if (rExist) await prisma.checklistResposta.updateMany({ where: { id: rExist.id, empresaId: sess.empresaId }, data: dados });
    else await prisma.checklistResposta.create({ data: { ...dados, empresaId: sess.empresaId, execucaoId: exec.id, itemChave } });

    const foto = await prisma.checklistFoto.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId }, select: { id: true } });
    res.json({ ok: true, itemChave, fotoId: foto?.id });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/foto PUT]', e); res.status(500).json({ error: 'Erro ao salvar a foto.' }); }
});

// Bytes da foto sob demanda (o operador vê a própria; posse por setor garante isolamento).
app.get('/api/public/colaborador/fotos/:id', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const foto = await prisma.checklistFoto.findFirst({ where: { id: parseInt(req.params.id, 10), empresaId: sess.empresaId } });
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });
    await chkPosseExecucao(sess, foto.execucaoId); // 403 se não for do setor
    res.json({ dataUrl: foto.dataUrl });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/fotos GET]', e); res.status(500).json({ error: 'Erro ao carregar a foto.' }); }
});
```

- [ ] **Step 3: Regra de foto obrigatória no concluir** — no handler `POST /api/public/colaborador/execucoes/:id/concluir`, ANTES de marcar CONCLUIDA (depois de obter `exec` com o snapshot):
```js
    // Foto crítica é obrigatória: item FOTO crítico sem foto bloqueia concluir.
    const chavesComFoto = new Set((await prisma.checklistFoto.findMany({ where: { execucaoId: exec.id, empresaId: sess.empresaId }, select: { itemChave: true } })).map((f) => f.itemChave));
    const faltando = fotosCriticasFaltando(exec.itensSnapshotJson, chavesComFoto);
    if (faltando.length) return res.status(400).json({ error: `Falta a foto obrigatória de: ${faltando.join(', ')}` });
```
E adicione `fotosCriticasFaltando` ao import de `./checklistConformidade.js` no topo do `server.js`.

- [ ] **Step 4: Verificar** — `cd backend && node --check server.js`; subir e conferir `401` sem token em `PUT /api/public/colaborador/execucoes/1/foto`; `node checklistConformidade.test.js` (30). Se conseguir sessão de colaborador, prove: subir foto → item FOTO crítico sem foto bloqueia concluir (400) → com foto conclui. Cole no relatório.

- [ ] **Step 5: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): endpoints de foto do operador + foto critica obrigatoria no concluir"
git push origin main
```

---

## Task 6: Captura de foto na execução do operador

**Files:** Modify `frontend/src/pages/BonificacaoEu.jsx`

**Interfaces — Consumes:** `comprimirFoto` (Task 4); endpoints (Task 5); `colabApi` (o cliente OTP já usado nas outras chamadas).

- [ ] **Step 1: Item FOTO na execução** — em `BonificacaoEu.jsx`, no componente que renderiza cada item da execução (`ItemChecklist` ou equivalente), adicione o caso `FOTO`. Importe `comprimirFoto` de `../lib/comprimirFoto`. A execução já traz `exec.fotos` (metadata `{ itemChave: { id } }`).

Comportamento do item FOTO:
- Se **não** há foto (`!fotos[chave]`): botão de câmera `<input type="file" accept="image/*" capture="environment" hidden>` + rótulo "Tirar foto". Ao escolher → `comprimirFoto(file)` → `colabApi.put('/public/colaborador/execucoes/'+exec.id+'/foto', { itemChave: chave, dataUrl, largura, altura })` → guardar localmente que agora tem foto (e o `fotoId` de retorno) + prévia (o próprio `dataUrl` comprimido serve de prévia imediata, sem novo fetch).
- Se **há** foto: mostra "✓ foto anexada", miniatura (busca os bytes via `colabApi.get('/public/colaborador/fotos/'+id)` → `dataUrl`, OU usa o dataUrl local se acabou de tirar) e botão "Refazer" (abre o input de novo).
- Item FOTO crítico sem foto: mostra um aviso ("Foto obrigatória") e o botão **Concluir** da execução fica bloqueado enquanto faltar (calcule: existe algum item do snapshot com `tipo==='FOTO' && critico` sem foto). O 400 do servidor é a rede de segurança.

Mantenha o estado das fotos no componente de execução (ex.: um objeto `fotos` no estado, inicializado de `exec.fotos`, atualizado ao subir). Erros via o padrão do arquivo (`setAviso`/`notify`).

- [ ] **Step 2: Build** — `cd frontend && npm run build` → `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/BonificacaoEu.jsx
git commit -m "feat(checklist): captura de foto na execucao do operador"
git push origin main
```

**Fim da F2.** Deploy.

---

## Task 7: Endpoints de revisão do gestor

**Files:** Modify `backend/server.js` (bloco admin de checklist)

**Interfaces — Produces:**
- `GET /api/checklist/execucoes` → `{ execucoes: [...] }` (recentes)
- `GET /api/checklist/execucoes/:id` → `{ execucao }` (detalhe com respostas + fotos metadata)
- `GET /api/checklist/fotos/:id` → `{ dataUrl }`

- [ ] **Step 1: Endpoints** — no bloco admin de checklist do `backend/server.js` (dentro do gate; a extension injeta `empresaId`):
```js
// Execuções recentes — o gestor escolhe qual abrir.
app.get('/api/checklist/execucoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const execs = await prisma.checklistExecucao.findMany({
      orderBy: { iniciadaEm: 'desc' }, take: 50,
      include: { checklist: { select: { nome: true, categoria: true } } },
    });
    const funcIds = [...new Set(execs.map((e) => e.funcionarioId))];
    const funcs = funcIds.length ? await prisma.funcionario.findMany({ where: { id: { in: funcIds } }, select: { id: true, nome: true, apelido: true } }) : [];
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    res.json({ execucoes: execs.map((e) => ({ id: e.id, checklistNome: e.checklist?.nome, categoria: e.checklist?.categoria, funcionario: fmap.get(e.funcionarioId) || '—', status: e.status, emAlerta: e.emAlerta, iniciadaEm: e.iniciadaEm, concluidaEm: e.concluidaEm })) });
  } catch (err) { console.error('[checklist/execucoes]', err); res.status(500).json({ error: 'Erro ao carregar execuções.' }); }
});

// Detalhe de uma execução (respostas + fotos metadata; bytes por /fotos/:id).
app.get('/api/checklist/execucoes/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const e = await prisma.checklistExecucao.findFirst({
      where: { id: parseInt(req.params.id, 10) },
      include: { respostas: true, fotos: { select: { id: true, itemChave: true } }, checklist: { select: { nome: true, categoria: true } } },
    });
    if (!e) return res.status(404).json({ error: 'Execução não encontrada.' });
    const func = await prisma.funcionario.findFirst({ where: { id: e.funcionarioId }, select: { nome: true, apelido: true } });
    const rmap = {}; for (const r of e.respostas) rmap[r.itemChave] = { valor: r.valorJson, conforme: r.conforme, observacao: r.observacao };
    const fmap = {}; for (const f of e.fotos) fmap[f.itemChave] = { id: f.id };
    res.json({ execucao: { id: e.id, checklistNome: e.checklist?.nome, categoria: e.checklist?.categoria, funcionario: func ? (func.apelido || func.nome) : '—', dataRef: e.dataRef, status: e.status, emAlerta: e.emAlerta, iniciadaEm: e.iniciadaEm, concluidaEm: e.concluidaEm, itens: e.itensSnapshotJson, respostas: rmap, fotos: fmap } });
  } catch (err) { console.error('[checklist/execucoes/:id]', err); res.status(500).json({ error: 'Erro ao carregar a execução.' }); }
});

// Bytes da foto (gestor).
app.get('/api/checklist/fotos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const foto = await prisma.checklistFoto.findFirst({ where: { id: parseInt(req.params.id, 10) }, select: { dataUrl: true } });
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });
    res.json({ dataUrl: foto.dataUrl });
  } catch (err) { console.error('[checklist/fotos]', err); res.status(500).json({ error: 'Erro ao carregar a foto.' }); }
});
```

- [ ] **Step 2: Verificar** — `node --check server.js`; subir; `401` sem token em `/api/checklist/execucoes` e `/api/checklist/execucoes/1`. `kill`.

- [ ] **Step 3: Commit**
```bash
git add backend/server.js
git commit -m "feat(checklist): endpoints de revisao da execucao para o gestor"
git push origin main
```

---

## Task 8: Detalhe da Execução + Execuções recentes (gestor)

**Files:** Modify `frontend/src/pages/Checklist.jsx`

**Interfaces — Consumes:** endpoints da Task 7.

- [ ] **Step 1: Seção Execuções recentes + modal Detalhe** — em `Checklist.jsx`:

Na `AbaPainel`, adicione uma seção "Execuções recentes" que carrega `GET /checklist/execucoes` e lista as execuções (checklist, categoria, funcionário, horário, badge "em alerta" se `emAlerta`, status). Cada linha é clicável → abre o modal `DetalheExecucao` com o `id`.

Adicione o componente `DetalheExecucao({ id, onClose })`:
- Carrega `GET /checklist/execucoes/:id`.
- Cabeçalho: checklist, categoria, funcionário, horário (início/conclusão), badge em alerta.
- Para cada item do `itens` (snapshot): título (+ `*` se crítico), a resposta formatada por tipo (CHECK ✓/✗, AVALIACAO estrelas, NUMERICO valor+unidade, SELECAO rótulo, TEXTO texto, **FOTO** miniatura), e um selo de conformidade quando `conforme === false` ("fora do padrão"). A foto: usa `fotos[chave]` → miniatura que ao clicar busca os bytes (`GET /checklist/fotos/:id`) e abre grande num overlay (ou carrega a miniatura já com os bytes — para poucas fotos por execução, carregar os bytes ao abrir o detalhe é aceitável; se preferir, carregue sob clique). Modal fecha só pelo botão.

Use as classes reais do arquivo (`modal-overlay`/`modal`/`modal-title`/`modal-actions`, `table-card`, `empty-state`, `btn`), `api` de `../services/api`. Comentário em português onde não óbvio.

- [ ] **Step 2: Build** — `cd frontend && npm run build` → `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Checklist.jsx
git commit -m "feat(checklist): detalhe da execucao e execucoes recentes no painel do gestor"
git push origin main
```

**Fim da F3 / Fatia 2.** Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh`.

---

## Checklist pós-deploy (usuário)

1. **Checklist › Templates** — os templates de abertura/fechamento já vêm com os itens de foto de volta.
2. Criar/editar um checklist com um item **FOTO** (marque **crítico** para exigir a foto).
3. O operador (Área do Colaborador) executa: o item FOTO pede a câmera; item crítico sem foto **não deixa concluir**.
4. **Checklist › Painel › Execuções recentes** — abrir a execução e conferir as respostas + as fotos.
