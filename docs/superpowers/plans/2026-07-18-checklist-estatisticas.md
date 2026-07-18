# Checklist — Dashboard de Estatísticas por checklist (Ação 3) — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Dashboard 📊 de UM checklist (KPIs conformidade/tempo/no-prazo/adesão + série diária +
ranking de colaboradores + ranking de itens que mais reprovam + heatmap dia×horário de atrasos/não-
feitas), sem IA, gráficos desenhados à mão (SVG/CSS).

**Architecture:** matemática pura testável em `backend/checklistEstatisticas.js` (recebe ms/strings
prontos, sem Prisma/fuso); a cola DB+fuso no endpoint `GET /api/checklist/checklists/:id/estatisticas`;
página `ChecklistEstatisticas` desenha os gráficos. Sem migration.

## Global Constraints

- **Multi-tenant:** admin DENTRO do gate; `checklistId` explícito no `where` (extension injeta
  `empresaId`). NUNCA `req.user.empresaId`. `pin` nunca serializado.
- **Fuso BR:** limites de período e deadlines via `brToUtcMs(y, mo/*0-index*/, day, h, mi)` +
  `brFields(ms)` (internos ao `server.js`, `BR_OFFSET_MIN=-180`), igual ao endpoint de histórico
  (Ação 2). NUNCA `new Date('YYYY-MM-DD')` cru. O **módulo puro não faz fuso** — recebe `dia`
  ('YYYY-MM-DD' BR) e ms já calculados pelo endpoint.
- **Divisão por zero → `null`** em todo KPI/score/taxa (nunca `NaN`); frontend mostra "—".
- **AVULSO / sem `horarioLimite`:** sem ocorrências esperadas → adesão/heatmap `null`/`agendado:false`
  (aviso honesto, sem número inventado).
- **Sem IA, sem CSV, sem lib de gráfico** (desenhar SVG/CSS). Modais só fecham por botão. UI em pt.
- Não quebrar Ações/Detalhe/Histórico existentes. Commit por task na `main`, sem push. Subagentes:
  NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task 1: Módulo puro `checklistEstatisticas.js` + teste

**Files:** Create `backend/checklistEstatisticas.js`, `backend/checklistEstatisticas.test.js`.

**Interfaces (produz):** `calcularEstatisticas(input)` — contrato abaixo. `FAIXAS` (export).

- [ ] **Step 1: escrever o módulo** `backend/checklistEstatisticas.js` EXATAMENTE:

```js
// checklistEstatisticas.js — puro (sem Prisma/fuso). O endpoint entrega ms + 'dia' (YYYY-MM-DD BR) prontos.

// 8 faixas de horário de 3h (00–03 … 21–24)
export const FAIXAS = Array.from({ length: 8 }, (_, i) => ({
  ini: i * 3, fim: i * 3 + 3,
  label: `${String(i * 3).padStart(2, '0')}–${String(i * 3 + 3).padStart(2, '0')}h`,
}));

export function faixaIndex(hora) {
  const h = Number.isFinite(hora) ? hora : 0;
  return Math.min(7, Math.max(0, Math.floor(h / 3)));
}

export function scoreDeRespostas(respostas) {
  let avaliaveis = 0, conformes = 0;
  for (const r of respostas || []) {
    if (r.conforme === null || r.conforme === undefined) continue;
    avaliaveis++;
    if (r.conforme === true) conformes++;
  }
  return avaliaveis ? Math.round((conformes / avaliaveis) * 100) : null;
}

function media(nums) {
  const v = nums.filter((n) => Number.isFinite(n));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function pct(num, den) { return den ? Math.round((num / den) * 100) : null; }

export function calcularEstatisticas({ execucoes = [], ocorrenciasEsperadas = [], dias = [], tempoEstimadoMin = null, itensMap = {}, agendado = false } = {}) {
  const concl = execucoes.filter((e) => e.status === 'CONCLUIDA');
  // score por execução concluída
  const scoreDe = new Map();
  for (const e of concl) scoreDe.set(e.id, scoreDeRespostas(e.respostas));

  // KPIs
  const conformidadeMedia = media(concl.map((e) => scoreDe.get(e.id)).filter((s) => s !== null));
  const tempos = concl.filter((e) => Number.isFinite(e.iniciadaMs) && Number.isFinite(e.concluidaMs)).map((e) => (e.concluidaMs - e.iniciadaMs) / 60000);
  const tempoMedioMin = media(tempos);
  const comDeadline = concl.filter((e) => Number.isFinite(e.deadlineMs));
  const noPrazoPct = comDeadline.length ? pct(comDeadline.filter((e) => e.concluidaMs <= e.deadlineMs).length, comDeadline.length) : null;

  // adesão: por dia de ocorrência esperada, houve concluída?
  const conclPorDia = new Map(); // dia -> exec concluída (no máx 1 por dataRef)
  for (const e of concl) conclPorDia.set(e.dia, e);
  const taxaConclusaoPct = ocorrenciasEsperadas.length ? pct(ocorrenciasEsperadas.filter((o) => conclPorDia.has(o.dia)).length, ocorrenciasEsperadas.length) : null;

  // série diária
  const porDia = new Map();
  for (const d of dias) porDia.set(d, { dia: d, execucoes: 0, concluidas: 0, _scores: [] });
  for (const e of execucoes) { const g = porDia.get(e.dia); if (!g) continue; g.execucoes++; if (e.status === 'CONCLUIDA') { g.concluidas++; const s = scoreDe.get(e.id); if (s !== null) g._scores.push(s); } }
  const serie = [...porDia.values()].map((g) => ({ dia: g.dia, execucoes: g.execucoes, concluidas: g.concluidas, conformidade: media(g._scores) }));

  // ranking operadores (sobre concluídas)
  const opMap = new Map();
  for (const e of concl) {
    const k = e.funcionarioId;
    if (!opMap.has(k)) opMap.set(k, { funcionarioId: k, nome: e.funcionario || '—', execucoes: 0, _scores: [], _dl: 0, _ok: 0 });
    const o = opMap.get(k); o.execucoes++;
    const s = scoreDe.get(e.id); if (s !== null) o._scores.push(s);
    if (Number.isFinite(e.deadlineMs)) { o._dl++; if (e.concluidaMs <= e.deadlineMs) o._ok++; }
  }
  const rankingOperadores = [...opMap.values()].map((o) => ({ funcionarioId: o.funcionarioId, nome: o.nome, execucoes: o.execucoes, conformidade: media(o._scores), noPrazoPct: o._dl ? pct(o._ok, o._dl) : null }))
    .sort((a, b) => (b.conformidade ?? -1) - (a.conformidade ?? -1) || b.execucoes - a.execucoes);

  // ranking itens que mais reprovam
  const itMap = new Map();
  for (const e of concl) for (const r of e.respostas || []) {
    if (r.conforme === null || r.conforme === undefined) continue;
    if (!itMap.has(r.itemChave)) itMap.set(r.itemChave, { itemChave: r.itemChave, titulo: itensMap[r.itemChave] || `Item ${r.itemChave}`, reprovacoes: 0, avaliacoes: 0 });
    const it = itMap.get(r.itemChave); it.avaliacoes++; if (r.conforme === false) it.reprovacoes++;
  }
  const rankingItens = [...itMap.values()].map((it) => ({ ...it, taxaPct: pct(it.reprovacoes, it.avaliacoes) }))
    .filter((it) => it.reprovacoes > 0).sort((a, b) => b.reprovacoes - a.reprovacoes || (b.taxaPct ?? 0) - (a.taxaPct ?? 0));

  // heatmap dow(0-6) x faixa: sobre ocorrências esperadas -> problema = não-feita OU atrasada
  const celulas = Array.from({ length: 7 }, (_, dow) => ({ dow, porFaixa: FAIXAS.map(() => ({ esperadas: 0, problemas: 0, taxaPct: null })) }));
  for (const o of ocorrenciasEsperadas) {
    const fi = faixaIndex(o.horaLimite);
    const cel = celulas[o.dow % 7].porFaixa[fi];
    cel.esperadas++;
    const ex = conclPorDia.get(o.dia);
    const problema = !ex || (Number.isFinite(o.deadlineMs) && Number.isFinite(ex.concluidaMs) && ex.concluidaMs > o.deadlineMs);
    if (problema) cel.problemas++;
  }
  for (const linha of celulas) for (const c of linha.porFaixa) c.taxaPct = c.esperadas ? pct(c.problemas, c.esperadas) : null;

  return {
    kpis: { execucoes: execucoes.length, concluidas: concl.length, conformidadeMedia, tempoMedioMin, tempoEstimadoMin, noPrazoPct, taxaConclusaoPct },
    serie, rankingOperadores, rankingItens,
    heatmap: { agendado, faixas: FAIXAS, celulas },
  };
}
```

- [ ] **Step 2: escrever o teste** `backend/checklistEstatisticas.test.js` (padrão `node arquivo.test.js`,
  sem framework — copie os helpers `t` de `checklistLembrete.test.js`). Cobrir NO MÍNIMO:
  - `scoreDeRespostas`: `[{conforme:true},{conforme:false},{conforme:null}]` → 50 (null não conta);
    `[{conforme:null}]` → null (nunca NaN); `[]` → null.
  - **KPIs:** um cenário com 2 concluídas (scores 100 e 50) → `conformidadeMedia:75`; tempo:
    `iniciadaMs=0,concluidaMs=600000` (10 min) → `tempoMedioMin:10`; `noPrazoPct` com uma dentro e uma
    fora do `deadlineMs`; `taxaConclusaoPct` com 2 esperadas e 1 concluída → 50.
  - **serie:** `dias:['2026-07-01','2026-07-02']`, execuções só no dia 1 → dia 1 conta, dia 2 zerado.
  - **rankingOperadores:** 2 operadores, ordenados por conformidade desc; empate por execuções.
  - **rankingItens:** item 'a' reprova 2x de 3, item 'b' 0 reprovações → só 'a' aparece, `taxaPct:67`,
    `titulo` vem do `itensMap`; fallback `Item <chave>` quando falta no map.
  - **heatmap:** 1 ocorrência esperada dow=1 hora=8 (faixa 06–09 index 2) SEM concluída → célula
    `[1][2] {esperadas:1,problemas:1,taxaPct:100}`; outra COM concluída no prazo → problema 0;
    concluída atrasada (`concluidaMs>deadlineMs`) → problema 1. `agendado:false` propaga.
  - **bordas:** input vazio → tudo `null`/`0`/arrays vazios, sem throw; AVULSO (`ocorrenciasEsperadas:[]`)
    → `taxaConclusaoPct:null`, heatmap todas células `esperadas:0/taxaPct:null`.

- [ ] **Step 3:** `node backend/checklistEstatisticas.test.js` (deve terminar `N ok, 0 falha(s)`, exit 0).
  Commit: `feat(checklist): modulo puro de estatisticas + testes`.

---

### Task 2: Endpoint `GET /api/checklist/checklists/:id/estatisticas`

**Files:** `backend/server.js`.

**Interfaces (consome):** `calcularEstatisticas` (Task 1). **Produz:** JSON `{ periodo:{de,ate},
checklist:{nome, recorrenciaTipo, horarioLimite, tempoEstimadoMin}, ...saída de calcularEstatisticas }`.

- [ ] **Step 1:** `import { calcularEstatisticas } from './checklistEstatisticas.js';` junto dos outros
  imports de módulo checklist no topo do `server.js`. LEIA o endpoint de histórico
  (`GET /api/checklist/checklists/:id/execucoes`) e `dispararLembretesLoja` (~server.js:2488) pra
  reusar o padrão de `brFields`/`brToUtcMs`/`venceHoje`/`fmap`.

- [ ] **Step 2:** adicionar o handler perto do endpoint de histórico:

```js
app.get('/api/checklist/checklists/:id/estatisticas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const checklistId = parseInt(req.params.id, 10);
    if (!Number.isFinite(checklistId)) return res.status(400).json({ error: 'ID inválido.' });
    const c = await prisma.checklist.findFirst({ where: { id: checklistId } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });

    // período: default últimos 30 dias de expediente; teto 180 dias
    const hoje = janelaExpedienteAtual().de;
    const fh = brFields(hoje.getTime());
    const parseDia = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').map(Number) : null);
    let deP = parseDia(String(req.query.de || ''));
    let ateP = parseDia(String(req.query.ate || ''));
    if (!ateP) ateP = [fh.y, fh.mo + 1, fh.day];          // brFields.mo é 0-index → +1 p/ o array [y,m,d] 1-index
    if (!deP) { const dm = new Date(Date.UTC(ateP[0], ateP[1] - 1, ateP[2] - 30)); deP = [dm.getUTCFullYear(), dm.getUTCMonth() + 1, dm.getUTCDate()]; }
    // limites BR
    const deMs = brToUtcMs(deP[0], deP[1] - 1, deP[2], 5, 0);   // 05:00 BR (início do dia de expediente)
    let ateMs = brToUtcMs(ateP[0], ateP[1] - 1, ateP[2], 5, 0);
    if (ateMs < deMs) ateMs = deMs;
    if ((ateMs - deMs) / 86400000 > 180) return res.status(400).json({ error: 'Período máximo de 180 dias.' });

    // execuções no intervalo (dataRef entre os inícios de expediente de de..ate)
    const execs = await prisma.checklistExecucao.findMany({
      where: { checklistId, dataRef: { gte: new Date(deMs), lte: new Date(ateMs + 86400000) } },
      include: { respostas: { select: { itemChave: true, conforme: true } } },
      orderBy: { dataRef: 'asc' }, take: 2000,
    });

    // nomes dos operadores (sem pin)
    const ids = [...new Set(execs.map((e) => e.funcionarioId))];
    const funcs = ids.length ? await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, apelido: true } }) : [];
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));

    // helper: 'YYYY-MM-DD' BR de um instante (dia de expediente ao qual o instante pertence)
    const diaStr = (ms) => { const f = brFields(ms); return `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`; };
    // deadline (ms) de um dia BR [y,m0,d] a partir do horarioLimite+tolerância; null se sem horário
    const hl = (typeof c.recorrenciaConfig?.horarioLimite === 'string') ? c.recorrenciaConfig.horarioLimite : '';
    const tol = Math.max(0, Number(c.recorrenciaConfig?.toleranciaMin) || 0);
    const mHL = /^(\d{1,2}):(\d{2})$/.exec(hl);
    const agendado = (c.recorrenciaTipo === 'DIARIA' || c.recorrenciaTipo === 'DIAS_SEMANA') && !!mHL;
    const deadlineDoDia = (y, m0, d) => (mHL ? brToUtcMs(y, m0, d, parseInt(mHL[1], 10), parseInt(mHL[2], 10)) + tol * 60000 : null);

    // normalizar execuções
    const execucoes = execs.map((e) => {
      const dref = e.dataRef.getTime(); const f = brFields(dref);
      return { id: e.id, funcionarioId: e.funcionarioId, funcionario: fmap.get(e.funcionarioId) || '—', dia: diaStr(dref), iniciadaMs: e.iniciadaEm ? e.iniciadaEm.getTime() : null, concluidaMs: e.concluidaEm ? e.concluidaEm.getTime() : null, status: e.status, emAlerta: e.emAlerta, deadlineMs: deadlineDoDia(f.y, f.mo, f.day), respostas: e.respostas };
    });

    // dias do intervalo + ocorrências esperadas (itera dia a dia)
    const dias = []; const ocorrenciasEsperadas = [];
    for (let ms = deMs; ms <= ateMs; ms += 86400000) {
      const f = brFields(ms); const dstr = `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
      dias.push(dstr);
      const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
      if (agendado && venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) {
        ocorrenciasEsperadas.push({ dia: dstr, dow, horaLimite: parseInt(mHL[1], 10), deadlineMs: deadlineDoDia(f.y, f.mo, f.day) });
      }
    }

    // itensMap: chave -> título (último visto)
    const itensMap = {};
    for (const e of execs) for (const it of (Array.isArray(e.itensSnapshotJson) ? e.itensSnapshotJson : [])) if (it?.chave != null) itensMap[String(it.chave)] = it.titulo || `Item ${it.chave}`;

    const stats = calcularEstatisticas({ execucoes, ocorrenciasEsperadas, dias, tempoEstimadoMin: c.tempoEstimadoMin ?? null, itensMap, agendado });
    res.json({ periodo: { de: dias[0] || null, ate: dias[dias.length - 1] || null }, checklist: { nome: c.nome, recorrenciaTipo: c.recorrenciaTipo, horarioLimite: hl || null, tempoEstimadoMin: c.tempoEstimadoMin ?? null }, ...stats });
  } catch (e) { console.error('[checklist/estatisticas]', e); res.status(500).json({ error: 'Erro ao calcular estatísticas.' }); }
});
```

> **⚠️ Confirme ao ler o código real:** a assinatura de `brToUtcMs` (posicional, mês 0-index — Ação 2
> já confirmou), de `brFields` (retorna `{y, mo/*0-index*/, day, ...}`) e de `venceHoje`. Ajuste os
> `+1`/`-1` de mês se o shape real divergir. O objetivo é: `dia` = 'YYYY-MM-DD' do dia de expediente,
> deadline = horário-limite+tolerância em ms daquele dia.

- [ ] **Step 3:** `node --check backend/server.js`. Smoke opcional (subir server, `curl` com/sem período;
  matar com `kill %1`, NUNCA `taskkill`). Commit: `feat(checklist): endpoint de estatisticas por checklist`.

---

### Task 3: Frontend — ícone 📊, botão no Detalhe e página `ChecklistEstatisticas`

**Files:** `frontend/src/pages/Checklist.jsx`, `frontend/src/App.jsx`, `frontend/src/styles/global.css`
(se precisar de classes de heatmap/gráfico).

**Interfaces (consome):** `GET /api/checklist/checklists/:id/estatisticas?de=&ate=` →
`{ periodo, checklist, kpis:{execucoes,concluidas,conformidadeMedia,tempoMedioMin,tempoEstimadoMin,
noPrazoPct,taxaConclusaoPct}, serie:[{dia,execucoes,concluidas,conformidade}],
rankingOperadores:[{funcionarioId,nome,execucoes,conformidade,noPrazoPct}],
rankingItens:[{itemChave,titulo,reprovacoes,avaliacoes,taxaPct}],
heatmap:{agendado,faixas:[{ini,fim,label}],celulas:[{dow,porFaixa:[{esperadas,problemas,taxaPct}]}]} }`.

- [ ] **Step 1 (ícone):** `case 'grafico':` no `ChkIcon` (Checklist.jsx ~81) — SVG de barras
  (3-4 `<rect>` de alturas diferentes, `stroke="currentColor"`). Não reusar outro.

- [ ] **Step 2 (Ações + Detalhe):** em `AbaChecklists` (coluna Ações), adicionar **depois** do botão
  "Ver histórico": `<ChkAcaoBtn icon="grafico" title="Ver estatísticas" onClick={() => navigate(`/checklist/estatisticas/${c.id}`)} />`.
  No cabeçalho de `ChecklistDetalhe`, botão `btn btn-secondary` "Estatísticas" (ícone `grafico`) → mesma navegação.

- [ ] **Step 3 (página `ChecklistEstatisticas`):** novo `export function ChecklistEstatisticas()` (perto
  de `ChecklistHistorico`). `useParams().id`. Estados: `dados`, `loading`, `erro`, `de`, `ate`, `preset`.
  - `carregar()`: `api.get('/checklist/checklists/'+id+'/estatisticas?'+params)` (params só com de/ate
    preenchidos); `useEffect` deps `[id, de, ate]`.
  - **Cabeçalho** `page-header`: "Estatísticas — {dados?.checklist?.nome}", Voltar (`/checklist/detalhe/`+id).
  - **Seletor de período:** botões preset 7/30/90 dias (setam de/ate calculando no cliente) + inputs
    `type="date"` De/Até. Default 30 (deixar de/ate vazios → backend usa 30d, e refletir o
    `dados.periodo` de volta nos inputs).
  - **KPIs** (`.chkp-kpi`, reusar do Painel): Execuções (`kpis.execucoes`, sub "N concluídas"),
    Conformidade média (`conformidadeMedia==null?'—':+'%'`), Tempo médio (`tempoMedioMin==null?'—':+' min'`,
    sub "est. {tempoEstimadoMin} min" se houver), No prazo (`noPrazoPct`), Adesão (`taxaConclusaoPct`).
  - **Série diária** (SVG): `<svg>` com uma barra por item de `serie` (altura ∝ `execucoes` sobre o
    máximo; cor por `conformidade` verde≥90/amarelo≥70/vermelho<70/cinza null). `title` no `<rect>` com
    "{dia} · {execucoes} exec · {conformidade??'—'}%". Container com `overflow-x:auto` se muitos dias.
    Se `serie` toda zerada, mostrar empty-state.
  - **Ranking colaboradores** (`.chkp-col`/`.chkp-row`): nome + "{execucoes} exec" + barra/valor de
    conformidade + "no prazo {noPrazoPct??'—'}%". Empty-state se vazio.
  - **Ranking itens que mais reprovam** (`.chkp-row`): título + "reprovou {reprovacoes} de {avaliacoes}" +
    `taxaPct%` (barra vermelha). Empty-state "Nenhuma reprovação no período 🎉".
  - **Heatmap:** se `heatmap.agendado===false` → card de aviso "Checklist avulso (sem agendamento) — o
    mapa de atrasos precisa de recorrência com horário-limite." Senão, grid: 7 linhas (Dom,Seg,…,Sáb) ×
    `faixas`; cada célula = `div` com cor de fundo por `taxaPct` (cinza se `esperadas===0`/`taxaPct==null`,
    verde ≤10, amarelo ≤40, vermelho >40) e o número `taxaPct%` (ou vazio). Cabeçalho de colunas com
    `faixa.label`; rótulo de linha com o dia. Legenda de cores abaixo. **Só renderizar as colunas
    (faixas) que têm alguma `esperadas>0`** em qualquer linha (senão fica 8 colunas quase vazias);
    se nenhuma, empty-state.
  - Estados loading/erro/vazio.
  - **LEIA `AbaPainel`/`ChecklistHistorico`** e reuse o visual (`.chkp-*`, `.table-card`, `.badge-*`,
    cores da marca). Novas classes de heatmap/gráfico podem ir no `global.css` (tema-aware, usando as
    variáveis `--app-*`/`--brand-*`).

- [ ] **Step 4 (rota):** `App.jsx`: importar `ChecklistEstatisticas` junto de `ChecklistHistorico`;
  `<Route path="checklist/estatisticas/:id" element={<ChecklistEstatisticas />} />` logo após
  `checklist/historico/:id`, DENTRO do `<Layout>`.

- [ ] **Step 5:** `cd frontend && npm run build`. Commit: `feat(checklist): dashboard de estatisticas
  (KPIs, serie, rankings, heatmap)`.

## Verificação final

`node backend/checklistEstatisticas.test.js` (0 falhas); `node --check backend/server.js`; `npm run
build`. Abrir a lista → 📊 → dashboard: KPIs coerentes, série por dia, ranking de colaboradores e de
itens que mais reprovam, heatmap de atrasos (ou aviso se avulso). Trocar período recarrega. Isolamento
por loja e por checklist mantido; `pin` nunca aparece.
