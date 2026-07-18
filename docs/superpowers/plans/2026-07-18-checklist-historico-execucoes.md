# Checklist — Ver Histórico de Execuções (Ação 2) — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Página de histórico das execuções de UM checklist (filtros status/operador/datas + coluna de
% de conformidade), aberta pelo ícone 🗓️ na coluna Ações e por um botão no Detalhe, reusando o modal
`DetalheExecucao` que já existe.

**Architecture:** 1 endpoint admin novo (`GET /api/checklist/checklists/:id/execucoes`) que filtra e
calcula o score na hora; 1 página nova `ChecklistHistorico` (export em `Checklist.jsx`) que reusa
tabela/badges/filtros do app e o modal `DetalheExecucao`. Sem migration, sem IA.

## Global Constraints

- **Multi-tenant:** rota admin DENTRO do gate → a extension Prisma injeta `empresaId`; ainda assim
  `checklistId` explícito no `where`. NUNCA `req.user.empresaId`.
- **Datas em BR (dia de expediente):** limites `de/ate` construídos com os helpers existentes
  (`brToUtcMs`/`brFields`), NUNCA `new Date('2026-07-18')` cru (usaria UTC do VPS).
- **Score:** `avaliaveis = respostas com conforme !== null`; `score = avaliaveis ? round(conformes/avaliaveis*100) : null`. Divisão por zero → `null` (UI mostra "—"), nunca `NaN`.
- **Sem IA, sem CSV.** Modais fecham só por botão, nunca no overlay. UI em pt com acentuação.
- Não quebrar `AbaChecklists`, `ChecklistDetalhe`, nem o modal `DetalheExecucao` (é o mesmo do Painel).
- Commit por task na `main`, sem push. Subagentes: NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task 1: Backend — endpoint de histórico com filtros + score

**Files:** `backend/server.js`.

Adicione o endpoint **logo após** `GET /api/checklist/execucoes` (~server.js:8092) e ANTES do
`GET /api/checklist/execucoes/:id` — cuidado com a ordem de rotas do Express: uma rota literal como
`/api/checklist/checklists/:id/execucoes` não conflita com `/api/checklist/execucoes/:id` porque os
prefixos são diferentes (`/checklists/` vs `/execucoes/`); pode ficar em qualquer ordem entre elas.

- [ ] **Step 1:** Ler o `GET /api/checklist/execucoes` (server.js:8092) para copiar o padrão de
  `exigirAdmin`, o mapa de nomes de funcionários (`fmap`), e como a extension injeta o `empresaId`.
  Ler os helpers de data BR (`brToUtcMs`, `brFields`, `janelaExpedienteAtual`) para construir os
  limites de `dataRef`.

- [ ] **Step 2:** Escrever o handler:

```js
app.get('/api/checklist/checklists/:id/execucoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const checklistId = parseInt(req.params.id, 10);
    if (!Number.isFinite(checklistId)) return res.status(400).json({ error: 'ID inválido.' });
    const where = { checklistId };
    const status = String(req.query.status || '').toUpperCase();
    if (status === 'CONCLUIDA' || status === 'EM_ANDAMENTO') where.status = status;
    else if (status === 'ALERTA') where.emAlerta = true;
    const funcionarioId = parseInt(req.query.funcionarioId, 10);
    if (Number.isFinite(funcionarioId)) where.funcionarioId = funcionarioId;
    // intervalo de datas em horário BR (dia de expediente) — reusar brToUtcMs
    const de = String(req.query.de || '').trim();
    const ate = String(req.query.ate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(de) || /^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      where.dataRef = {};
      if (/^\d{4}-\d{2}-\d{2}$/.test(de)) {
        const [y, m, d] = de.split('-').map(Number);
        where.dataRef.gte = new Date(brToUtcMs({ ano: y, mes: m, dia: d, hora: 0, min: 0 }));
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
        const [y, m, d] = ate.split('-').map(Number);
        where.dataRef.lte = new Date(brToUtcMs({ ano: y, mes: m, dia: d, hora: 23, min: 59 }));
      }
    }
    const execs = await prisma.checklistExecucao.findMany({
      where, orderBy: { iniciadaEm: 'desc' }, take: 200,
      include: { respostas: { select: { conforme: true } } },
    });
    // nomes dos operadores (mesmo padrão do /api/checklist/execucoes)
    const ids = [...new Set(execs.map((e) => e.funcionarioId))];
    const funcs = ids.length ? await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, apelido: true } }) : [];
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    const linhas = execs.map((e) => {
      const avaliaveis = e.respostas.filter((r) => r.conforme !== null).length;
      const conformes = e.respostas.filter((r) => r.conforme === true).length;
      const score = avaliaveis ? Math.round((conformes / avaliaveis) * 100) : null;
      return { id: e.id, dataRef: e.dataRef, funcionario: fmap.get(e.funcionarioId) || '—', funcionarioId: e.funcionarioId, status: e.status, emAlerta: e.emAlerta, score, avaliaveis, conformes, iniciadaEm: e.iniciadaEm, concluidaEm: e.concluidaEm };
    });
    res.json({ execucoes: linhas });
  } catch (e) { console.error('[checklist/historico]', e); res.status(500).json({ error: 'Erro ao carregar histórico.' }); }
});
```

> **⚠️ Verifique a assinatura real de `brToUtcMs`** ao ler o código (Step 1): se ele recebe outro
> shape (ex.: `(ano, mes, dia, hora, min)` posicional, ou um objeto com chaves diferentes), adapte a
> chamada acima ao contrato real. O importante é: limite inferior = 00:00 BR do dia `de`, limite
> superior = 23:59 BR do dia `ate`. NÃO usar `new Date('YYYY-MM-DD')` direto.

- [ ] **Step 3:** `node --check backend/server.js`. Smoke manual opcional: subir o server no próprio job
  (`node backend/server.js &`) e `curl` o endpoint com/sem filtros; matar com `kill %1` (NUNCA
  `taskkill`). Commit: `feat(checklist): endpoint de historico de execucoes por checklist (filtros + score)`.

---

### Task 2: Frontend — ícone 🗓️, botão no Detalhe e página `ChecklistHistorico`

**Files:** `frontend/src/pages/Checklist.jsx`, `frontend/src/App.jsx`.

**Interfaces (Task 1):** `GET /api/checklist/checklists/:id/execucoes?status=&funcionarioId=&de=&ate=`
→ `{ execucoes: [{ id, dataRef, funcionario, funcionarioId, status, emAlerta, score, avaliaveis,
conformes, iniciadaEm, concluidaEm }] }`. Detalhe: `DetalheExecucao({ id, onClose })` já existe
(Checklist.jsx:419) — importar/usar direto.

- [ ] **Step 1 (ícone calendário):** no `ChkIcon` (Checklist.jsx:81-98), adicionar um `case
  'calendario':` retornando um SVG inline de calendário (retângulo arredondado + duas hastes no topo +
  linha do cabeçalho), no mesmo estilo `stroke="currentColor"` dos outros ícones. NÃO reusar `relogio`.

- [ ] **Step 2 (coluna Ações):** em `AbaChecklists` (Checklist.jsx:762-769), inserir um `ChkAcaoBtn`
  **entre "Ver detalhes" e "Executar"**:

```jsx
<ChkAcaoBtn icon="eye" title="Ver detalhes" onClick={() => navigate(`/checklist/detalhe/${c.id}`)} />
<ChkAcaoBtn icon="calendario" title="Ver histórico" onClick={() => navigate(`/checklist/historico/${c.id}`)} />
<ChkAcaoBtn icon="play" title="Executar" onClick={() => executar(c)} />
```

- [ ] **Step 3 (botão no Detalhe):** no cabeçalho de `ChecklistDetalhe` (Checklist.jsx:1265-1272),
  adicionar antes do botão Editar:

```jsx
<button type="button" className="btn btn-secondary" onClick={() => navigate(`/checklist/historico/${c.id}`)}>
  <ChkIcon name="calendario" size={15} /> Ver histórico
</button>
```

- [ ] **Step 4 (página `ChecklistHistorico`):** novo `export function ChecklistHistorico()` em
  `Checklist.jsx` (perto de `ChecklistDetalhe`). Comportamento:
  - `const { id } = useParams();` `const navigate = useNavigate();`
  - Estados: `checklist` (nome, via `GET /checklist/checklists/:id`), `funcionarios` (via
    `GET /funcionarios?status=ATIVO`), `execucoes`, `loading`, `erro`, filtros `status`/`funcId`/`de`/`ate`,
    e `verExecucaoId`.
  - `carregar()`: monta a querystring só com os filtros preenchidos e chama
    `api.get('/checklist/checklists/'+id+'/execucoes?'+params)`. `useEffect` re-chama quando qualquer
    filtro muda (deps `[id, status, funcId, de, ate]`).
  - **Cabeçalho** `page-header`: título "Histórico — {checklist?.nome}", botões "Voltar"
    (`navigate('/checklist/detalhe/'+id)`) e "Ver detalhes".
  - **Filtros** (div flex, `.form-group`/`.form-label`/`.form-input`): select Status (`''`=Todos /
    `CONCLUIDA` / `EM_ANDAMENTO` / `ALERTA`=Em alerta), select Operador (`''`=Todos + `funcionarios`),
    input `type="date"` De, input `type="date"` Até.
  - **Tabela** `.table-card`>`.hb-table`: colunas Data (`dataRef` formatado BR — reusar o helper de
    data que a "Execuções recentes" usa, ex.: `new Date(e.dataRef).toLocaleDateString('pt-BR')`),
    Operador, Status (badge: `e.status==='CONCLUIDA'?'badge-green':'badge-gray'` + `STATUS_EXEC_LABEL`;
    `e.emAlerta` → badge-red "Em alerta"), Conformidade (`e.score==null?'—': e.score+'%'`, com cor
    semântica verde≥90/amarelo70-89/vermelho<70 — pode ser um `<span className="badge ...">` ou uma
    mini-barra), Início/Conclusão (hora `toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})`).
    Cada `<tr>` clicável (`style={{cursor:'pointer'}}`, `onClick={() => setVerExecucaoId(e.id)}`).
  - Estados: loading ("Carregando…"), erro, vazio ("Nenhuma execução no período.").
  - **Reuso do detalhe:** `{verExecucaoId != null && <DetalheExecucao id={verExecucaoId} onClose={() => setVerExecucaoId(null)} />}`.
  - Reusar as classes/estilos já presentes no arquivo (`.chk*`, `.table-card`, `.hb-table`, `.badge*`);
    LEIA a `AbaPainel`/`AbaChecklists` para copiar o visual (não inventar design novo).

- [ ] **Step 5 (rota):** em `App.jsx`, importar `ChecklistHistorico` junto do import existente
  (`import Checklist, { ChecklistDetalhe, ChecklistPublico? }`... — confira como está) e adicionar a
  rota **logo após** `checklist/detalhe/:id` (App.jsx:102), DENTRO do `<Layout>`:

```jsx
<Route path="checklist/historico/:id" element={<ChecklistHistorico />} />
```

- [ ] **Step 6:** `cd frontend && npm run build`. Commit: `feat(checklist): pagina de historico de
  execucoes (icone calendario, filtros, score, reuso do detalhe)`.

## Verificação final

`node --check backend/server.js`; `npm run build`. Abrir a lista → ícone 🗓️ → histórico do checklist;
filtrar por status/operador/data; a coluna Conformidade mostra o % (ou "—"); clicar numa linha abre o
modal de Detalhe da Execução com respostas + fotos; o botão "Ver histórico" no Detalhe leva à mesma
página. Isolamento por loja e por checklist mantido.
