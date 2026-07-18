# Checklist — Detalhes + Execução pública com PIN + QR — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Coluna Ações na lista + página de Detalhes (dados/itens/link/QR) + execução pública por checklist (link/QR → seleciona nome → PIN 4 dígitos → executa), reusando os endpoints do colaborador.

**Architecture:** o PIN é forma alternativa de obter o JWT `{fid,eid,tipo:'colab'}` (mesmo do OTP); a execução pública reusa `/api/public/colaborador/*`. QR reusa `frontend/src/lib/qr.js`.

## Global Constraints

- **Segurança:** `Funcionario.pin` NUNCA serializado em resposta (redigir em TODA rota que devolve funcionário); `/entrar` com **rate-limit** (mapa em memória por funcionário) + mensagem genérica; token emitido `tipo:'colab'` expiração curta (6h). Posse por `chkColabAtende` limita execução (já existe).
- Rotas públicas FORA do gate → `empresaId` explícito (vem do checklist do token); `chkColabAtende` filtra elegíveis por loja. `publicoToken`/token via `randomBytes` (`@unique`).
- Não quebrar a Área do Colaborador (WhatsApp OTP) nem a execução existente.
- Commit por task na `main`, sem push. Subagentes: NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task 1: Backend — schema + endpoints públicos

**Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260718120000_checklist_publico_pin/migration.sql`, `backend/server.js`.

- [ ] **Step 1 (schema+migration):** `Checklist` += `publicoToken String? @unique`; `Funcionario` += `pin String?`. Migration: `ALTER TABLE "Checklist" ADD COLUMN "publicoToken" TEXT; CREATE UNIQUE INDEX "Checklist_publicoToken_key" ON "Checklist"("publicoToken"); ALTER TABLE "Funcionario" ADD COLUMN "pin" TEXT;`. Aplicar `migrate deploy` + `generate`.
- [ ] **Step 2 (link do checklist):** No `GET /api/checklist/checklists/:id` (admin, ~7789), se `publicoToken` for null, gerar `randomBytes(12).toString('base64url')` e persistir; devolver o `publicoToken` no checklist. (Assim o front monta a URL.)
- [ ] **Step 3 (redigir pin):** achar TODAS as rotas que serializam `Funcionario` e garantir que o `pin` não vai na resposta. Padrão seguro: onde faz `findMany`/`findFirst` sem `select` e devolve o objeto cru (ex.: `GET /api/funcionarios` ~349, `res.json(lista)`), mapear removendo `pin` (`{ ...f, pin: undefined }` ou `select` explícito). Conferir `GET /ponto/colaboradores`, `/funcionarios`, e qualquer `res.json(funcionario)`.
- [ ] **Step 4 (bootstrap público):**
```js
app.get('/api/public/checklist/:token/bootstrap', async (req, res) => {
  try {
    const c = await prisma.checklist.findFirst({ where: { publicoToken: String(req.params.token), ativo: true }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    const ativos = await prisma.funcionario.findMany({ where: { empresaId: c.empresaId, status: 'ATIVO' }, select: { id: true, nome: true, apelido: true, funcao: true, funcionarioIds: false } });
    const elegiveis = ativos.filter((f) => chkColabAtende(c, f)).map((f) => ({ id: f.id, nome: f.apelido || f.nome, funcao: f.funcao || null }));
    res.json({ checklist: { id: c.id, nome: c.nome, descricao: c.descricao }, colaboradores: elegiveis });
  } catch (e) { console.error('[public/checklist/bootstrap]', e); res.status(500).json({ error: 'Erro ao carregar.' }); }
});
```
- [ ] **Step 5 (entrar com PIN + rate-limit):**
```js
const pinTentativas = new Map(); // funcionarioId -> { fails, lockUntil }
app.post('/api/public/checklist/:token/entrar', async (req, res) => {
  try {
    const c = await prisma.checklist.findFirst({ where: { publicoToken: String(req.params.token), ativo: true }, select: { id: true, empresaId: true } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    const fid = parseInt(req.body?.funcionarioId, 10);
    const pin = String(req.body?.pin || '').trim();
    const st = pinTentativas.get(fid) || { fails: 0, lockUntil: 0 };
    if (st.lockUntil > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
    const func = await prisma.funcionario.findFirst({ where: { id: fid, empresaId: c.empresaId, status: 'ATIVO' } });
    const ok = func && func.pin && /^\d{4}$/.test(pin) && func.pin === pin && chkColabAtende(await prisma.checklist.findFirst({ where: { id: c.id }, select: { atribuicaoTipo: true, funcoes: true, funcionarioIds: true } }), func);
    if (!ok) {
      const fails = st.fails + 1;
      pinTentativas.set(fid, { fails, lockUntil: fails >= 5 ? Date.now() + 5 * 60000 : 0 });
      return res.status(401).json({ error: 'Nome ou PIN inválido.' });
    }
    pinTentativas.delete(fid);
    const token = jwt.sign({ fid: func.id, eid: c.empresaId, tipo: 'colab' }, JWT_SECRET, { expiresIn: '6h' });
    res.json({ token, checklistId: c.id });
  } catch (e) { console.error('[public/checklist/entrar]', e); res.status(500).json({ error: 'Erro ao entrar.' }); }
});
```
- [ ] **Step 6:** `node --check server.js` + `migrate status`. Commit.

---

### Task 2: PIN no cadastro do colaborador

**Files:** `backend/server.js` (create/update de Funcionario), `frontend/src/pages/PontoFacial.jsx` (`Colaboradores`).

- [ ] **Step 1 (backend):** achar o POST/PUT que cria/edita `Funcionario` (Ponto Facial). Aceitar `pin`: `String(body.pin||'').replace(/\D/g,'').slice(0,4)`; se vazio → `null` (remove); se 1–3 dígitos → 400 "PIN deve ter 4 dígitos". Gravar `pin`. NÃO devolver o pin (redigido na Task 1).
- [ ] **Step 2 (frontend):** no form de cadastro/edição do colaborador (`Colaboradores` em PontoFacial.jsx), adicionar um campo **PIN (4 dígitos)** (input numérico, maxLength 4). Como o GET não devolve o pin, mostrar um placeholder "••••" / "definir PIN" e só enviar quando digitado (não sobrescrever com vazio se o usuário não mexeu — enviar `pin` só se preenchido, ou um controle "alterar PIN").
- [ ] **Step 3:** `node --check server.js` + `npm run build`. Commit.

---

### Task 3: Lista Ações + Página de Detalhes + QR

**Files:** `frontend/src/pages/Checklist.jsx` (`AbaChecklists` + nova `ChecklistDetalhe`), `frontend/src/App.jsx` (rota), CSS.

- [ ] **Step 1 (coluna Ações):** em `AbaChecklists`, a tabela ganha a coluna **Ações** com ícones (SVG): **Ver detalhes** (→ `navigate('/checklist/detalhe/'+c.id)`), **Executar** (abre o link público em nova aba — precisa do `publicoToken`; buscar via GET `/:id` ao clicar, ou já vir na lista), e mantém **Editar**/**Excluir**. (Sem botões de Estatísticas/Histórico ainda.)
- [ ] **Step 2 (rota + página):** `App.jsx` rota `checklist/detalhe/:id` (dentro do Layout) → `ChecklistDetalhe`. A página faz `GET /checklist/checklists/:id` (que agora traz `publicoToken`), mostra: cabeçalho (nome, categoria, prioridade, recorrência·horário, tempo, responsáveis), botões Editar (`/checklist/checklists?editar=:id`) e Executar (abre o link público), lista de itens (título/tipo/crítico/dica), e o card **Link público**: URL `<origin>/checklist/publico/<publicoToken>` + Copiar (`navigator.clipboard` + fallback) + **QR** (canvas desenhado da `matrizQr(url)` — reusar `frontend/src/lib/qr.js`).
- [ ] **Step 3 (QR):** desenhar o QR num `<canvas>` a partir de `matrizQr(url)` (quadrados pretos), tamanho ~180px. Reusar o padrão do LATERAL_QR do `etiquetaCanvas` (loop na matriz).
- [ ] **Step 4:** `npm run build`. Commit.

---

### Task 4: Página pública de execução (nome → PIN → executa)

**Files:** `frontend/src/pages/ChecklistPublico.jsx` (nova), `frontend/src/App.jsx` (rota fora do Layout), possível extração de `BonificacaoEu.jsx`.

- [ ] **Step 1 (rota):** `App.jsx`, FORA do `<Layout>` (como `EtiquetasQuiosque`): `<Route path="checklist/publico/:token" element={<ChecklistPublico/>} />`.
- [ ] **Step 2 (bootstrap + nome):** `ChecklistPublico` faz `GET /api/public/checklist/:token/bootstrap`; tela "Executar: <nome>" + "Selecione seu nome" listando `colaboradores` (avatar iniciais + função). Clicar → estado "PIN".
- [ ] **Step 3 (PIN keypad):** tela do PIN: nome escolhido + "Digite seu PIN de 4 dígitos" + 4 bolinhas + teclado numérico (0-9, apagar) + "Voltar". Ao completar 4 dígitos, `POST /api/public/checklist/:token/entrar {funcionarioId, pin}`; sucesso → guarda o `token`; erro → mensagem + limpa; 429 → aviso de espera.
- [ ] **Step 4 (execução):** com o `token`, montar um cliente axios com `Authorization: Bearer <token>` e executar o checklist reusando os endpoints `/api/public/colaborador/*` (`checklists`/`iniciar`/`resposta`/`foto`/`concluir`). **Preferir extrair** a UI de responder itens de `BonificacaoEu.jsx` (`ExecutarChecklist`/`ItemChecklist`) para um componente reusável que receba o cliente axios + o checklistId; se a extração ficar arriscada, `ChecklistPublico` implementa a execução chamando os mesmos endpoints (sem duplicar a lógica de conformidade — o backend recalcula). Ao concluir, tela de sucesso + "Executar outro" / voltar.
- [ ] **Step 5:** `npm run build`. Commit.

## Verificação final

`node --check server.js`; `npm run build`; abrir a lista → Ações; Ver detalhes mostra dados/itens/link/QR; o link público lista os nomes, pede PIN, e executa o checklist gravando a execução (mesma da Área do Colaborador). O `pin` nunca aparece em nenhuma resposta de API.
