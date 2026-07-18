# Checklist Painel — Central de Ajuda + 4 KPIs + Histórico geral — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Mover o Guia Inicial para a Central de Ajuda; refatorar os KPIs do Painel para 4 (Ativos·
Concluídos·Atrasados·Taxa de Conclusão) com seletor de período; e adicionar um Histórico geral de
**ocorrências** (execuções reais + esperadas não feitas, classificadas) que substitui "Execuções
recentes".

**Architecture:** módulo puro `checklistHistoricoGeral.js` (classificação + agregação, testável);
endpoint novo `GET /api/checklist/historico-geral` (cola DB+fuso, reusa o motor de recorrência/deadline
das Estatísticas); Painel refatorado (seletor de período dirige KPIs+Histórico). Sem migration.

**Tech Stack:** Express ESM (`backend/server.js`), Prisma, módulos puros `backend/checklist*.js`
(testados com `node arquivo.test.js`), React 19 + Vite (`frontend/src/pages/Checklist.jsx`).

## Global Constraints

- **Multi-tenant:** rotas admin DENTRO do gate → a extension injeta `empresaId`. `pin` NUNCA serializado
  (funcionário sempre via `select` id/nome/apelido). NUNCA `req.user.empresaId`.
- **Fuso BR:** período/deadline/dia via `brToUtcMs(y, mo/*0-index*/, day, h, mi)` + `brFields(ms)`
  (internos ao server.js, `BR_OFFSET_MIN=-180`, corte 05:00). NUNCA `new Date('YYYY-MM-DD')` cru. Não
  gerar ocorrências no futuro (`ate` ≤ hoje de expediente). Espelhar o endpoint `/estatisticas`
  (server.js ~8158) que já faz `brFields`/`brToUtcMs`/`venceHoje`/`diaStr`/`deadlineDoDia`.
- **Divisão por zero → `null`** (taxa/score); UI mostra "—". Status colore a linha, não o score.
- **Taxonomia:** `CONCLUIDO` (execução concluída) · `EM_ANDAMENTO` (execução iniciada) · `PENDENTE`
  (hoje, antes do prazo, ou sem horário) · `ATRASADO` (hoje, passou horário+tolerância, sem conclusão)
  · `NAO_REALIZADO` (dia **passado** sem execução, independe de horário).
- **KPI Atrasados = ATRASADO + NAO_REALIZADO.** **Taxa = (esperadas concluídas) ÷ (esperadas)**;
  esperada = linha vinda de ocorrência agendada. Avulsos concluídos entram em "Concluídos" mas NÃO no
  denominador da taxa.
- Não quebrar as 3 colunas, "Meus checklists", o modal `DetalheExecucao`, nem o Histórico por checklist
  / Estatísticas. Modais só fecham por botão. UI em pt com acentuação. Commit por task na `main`, sem
  push. Subagentes: NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task 1: Central de Ajuda (mover o Guia) + remover do Painel

**Files:** Create `frontend/src/pages/CentralAjuda.jsx`; Modify `frontend/src/App.jsx` (troca o
`element` da rota `central-de-ajuda`), `frontend/src/pages/Checklist.jsx` (remove Guia do `AbaPainel`).

**Interfaces (produz):** rota `/central-de-ajuda` passa a renderizar `CentralAjuda`.

- [ ] **Step 1:** LEIA em `Checklist.jsx` tudo do Guia: `GUIA_PASSOS` (array dos 4 passos), `GUIA_KEY`,
  `lerGuiaAprendidos`/`salvarGuiaAprendidos`, o `GuiaModal`, o card `.chkp-guia` no `AbaPainel`, o
  estado `verGuia`, e `abrirEtapa(k)`. Entenda o conteúdo e a navegação de cada passo.

- [ ] **Step 2:** Criar `frontend/src/pages/CentralAjuda.jsx` — uma página (dentro do Layout) que
  renderiza o **Guia inicial** como conteúdo principal: cabeçalho "Central de Ajuda" + intro curta +
  os 4 passos de `GUIA_PASSOS` (numerados, coloridos, com `desc`/`chips`), cada um com "Marcar como
  aprendido" (persistindo em localStorage `chk-guia-aprendidos`, mesma chave) e "Abrir etapa" (navega
  pro destino de cada passo). Mova `GUIA_PASSOS`/`GUIA_KEY`/helpers pra cá (ou exporte de um util novo
  `frontend/src/lib/guiaChecklist.js` se preferir compartilhar — mas como o Painel deixa de usar, mover
  pra página é suficiente/DRY). Reuse o visual do antigo `GuiaModal` (as classes `.chkg-*`/passos), mas
  numa página, não num modal. Barra de progresso "{feitos}/4".

- [ ] **Step 3:** Em `App.jsx`, trocar `<Route path="central-de-ajuda" element={<EmConstrucao .../>} />`
  por `<Route path="central-de-ajuda" element={<CentralAjuda />} />` e importar `CentralAjuda`. (Se o
  `EmConstrucao` não for mais usado em lugar nenhum, pode deixar o import — não force remoção.)

- [ ] **Step 4:** Em `Checklist.jsx` `AbaPainel`: remover o card `.chkp-guia`, o estado `verGuia`, a
  renderização do `<GuiaModal .../>`, e o `GuiaModal`/`GUIA_PASSOS`/`GUIA_KEY`/helpers/`abrirEtapa`
  **se não forem mais usados no arquivo** (foram movidos pra CentralAjuda). A linha `.chkp-top` que
  tinha "guia + 3 KPIs" passa a ter só os KPIs (a Task 4 refaz os KPIs — aqui só garanta que remover o
  guia não quebra o layout/o build; deixe os KPIs atuais no lugar). Não deixe imports órfãos.

- [ ] **Step 5:** `cd frontend && npm run build` (deve passar). Commit: `feat(checklist): Guia Inicial
  vira pagina Central de Ajuda (removido do Painel)`.

---

### Task 2: Módulo puro `checklistHistoricoGeral.js` + teste

**Files:** Create `backend/checklistHistoricoGeral.js`, `backend/checklistHistoricoGeral.test.js`.

**Interfaces (produz):** `classificarOcorrencia(input) → status string`; `agregar(linhas, {ativos})
→ { kpis, contagens }`; `STATUS` (export).

- [ ] **Step 1:** Escrever `backend/checklistHistoricoGeral.js` EXATAMENTE:

```js
// checklistHistoricoGeral.js — puro (sem Prisma/fuso). Classifica ocorrências e agrega KPIs/contagens.

export const STATUS = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO', 'NAO_REALIZADO'];

// status de UMA ocorrência. execucao = { status:'EM_ANDAMENTO'|'CONCLUIDA' } | null.
export function classificarOcorrencia({ execucao = null, ehPassado = false, agoraMs = 0, deadlineMs = null } = {}) {
  if (execucao) return execucao.status === 'CONCLUIDA' ? 'CONCLUIDO' : 'EM_ANDAMENTO';
  if (ehPassado) return 'NAO_REALIZADO';                                   // dia passado sem execução
  if (deadlineMs != null && Number.isFinite(deadlineMs) && agoraMs >= deadlineMs) return 'ATRASADO'; // hoje, venceu
  return 'PENDENTE';                                                       // hoje, ainda dá tempo (ou sem horário)
}

// agrega a partir das linhas já classificadas. Cada linha: { status, esperada:boolean }.
export function agregar(linhas = [], { ativos = 0 } = {}) {
  const contagens = { PENDENTE: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0, ATRASADO: 0, NAO_REALIZADO: 0 };
  let esperadas = 0, esperadasConcluidas = 0;
  for (const l of linhas) {
    if (contagens[l.status] != null) contagens[l.status]++;
    if (l.esperada) { esperadas++; if (l.status === 'CONCLUIDO') esperadasConcluidas++; }
  }
  const taxaConclusaoPct = esperadas ? Math.round((esperadasConcluidas / esperadas) * 100) : null;
  return {
    kpis: { ativos, concluidos: contagens.CONCLUIDO, atrasados: contagens.ATRASADO + contagens.NAO_REALIZADO, taxaConclusaoPct },
    contagens,
  };
}
```

- [ ] **Step 2:** Escrever `backend/checklistHistoricoGeral.test.js` no padrão dos outros (`node
  arquivo.test.js`, helper `t` copiado de `checklistLembrete.test.js`, `process.exit(fail?1:0)`).
  Cobrir:
  - `classificarOcorrencia`: execução CONCLUIDA → 'CONCLUIDO'; EM_ANDAMENTO → 'EM_ANDAMENTO'; sem
    execução + `ehPassado:true` → 'NAO_REALIZADO' (mesmo com `deadlineMs` no passado — passado vence);
    sem execução + hoje + `deadlineMs` já passou (`agoraMs>=deadlineMs`) → 'ATRASADO'; sem execução +
    hoje + antes do deadline (`agoraMs<deadlineMs`) → 'PENDENTE'; sem execução + hoje + `deadlineMs:null`
    (sem horário) → 'PENDENTE'.
  - `agregar`: linhas mistas → `kpis.concluidos` = nº CONCLUIDO; `kpis.atrasados` = ATRASADO+NAO_REALIZADO;
    `taxaConclusaoPct` = round(esperadasConcluidas/esperadas*100) — teste com 4 esperadas, 1 concluída
    → 25; com um CONCLUIDO `esperada:false` (avulso) que NÃO entra no denominador (4 esperadas + 1 avulso
    concluído → taxa ainda 25, mas `contagens.CONCLUIDO`=2); `esperadas:0` → `taxaConclusaoPct:null`
    (nunca NaN). `ativos` propaga.

- [ ] **Step 3:** `node backend/checklistHistoricoGeral.test.js` → `N ok, 0 falha(s)`, exit 0. Commit:
  `feat(checklist): modulo puro de classificacao de ocorrencias (historico geral) + testes`.

---

### Task 3: Endpoint `GET /api/checklist/historico-geral`

**Files:** `backend/server.js`.

**Interfaces (consome):** `classificarOcorrencia`, `agregar` (Task 2), `venceHoje`
(checklistRecorrencia.js), `brFields`/`brToUtcMs`/`janelaExpedienteAtual` (server.js). **Produz:** JSON
`{ periodo, kpis, contagens, registros, ocorrencias }` (shapes abaixo).

- [ ] **Step 1:** `import { classificarOcorrencia, agregar } from './checklistHistoricoGeral.js';`
  junto dos outros imports de `./checklist*.js`. LEIA o endpoint `/estatisticas` (server.js ~8158) e o
  `/painel` (~8048) pra copiar: `brFields`/`brToUtcMs`, `venceHoje`, `diaStr`, `deadlineDoDia`, o
  `responsavelDe(c)` do painel (nomes COLABORADOR/FUNCAO), e o cálculo de score das respostas.

- [ ] **Step 2:** Escrever o handler (perto dos outros de checklist):

```js
app.get('/api/checklist/historico-geral', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const hojeRef = janelaExpedienteAtual().de;               // 05:00 BR de hoje (dia de expediente)
    const fh = brFields(hojeRef.getTime());
    const diaStr = (ms) => { const f = brFields(ms); return `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`; };
    const hojeStr = diaStr(hojeRef.getTime());
    // período: preset (hoje/7/30/90) ou de/ate custom; teto 180 dias; nunca depois de hoje
    const preset = String(req.query.periodo || 'hoje').toLowerCase();
    const diasPreset = { hoje: 1, '7': 7, '30': 30, '90': 90 }[preset] || 1;
    const parseDia = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').map(Number) : null);
    let deP = parseDia(String(req.query.de || ''));
    let ateP = parseDia(String(req.query.ate || ''));
    if (!ateP) ateP = [fh.y, fh.mo + 1, fh.day];              // hoje (fh.mo é 0-index → +1 p/ array 1-index)
    if (!deP) { const dm = new Date(Date.UTC(ateP[0], ateP[1] - 1, ateP[2] - (diasPreset - 1))); deP = [dm.getUTCFullYear(), dm.getUTCMonth() + 1, dm.getUTCDate()]; }
    let deMs = brToUtcMs(deP[0], deP[1] - 1, deP[2], 5, 0);
    let ateMs = brToUtcMs(ateP[0], ateP[1] - 1, ateP[2], 5, 0);
    if (ateMs > hojeRef.getTime()) ateMs = hojeRef.getTime(); // não passa de hoje
    if (deMs > ateMs) deMs = ateMs;
    if ((ateMs - deMs) / 86400000 > 180) return res.status(400).json({ error: 'Período máximo de 180 dias.' });
    const agoraMs = Date.now();

    const checklists = await prisma.checklist.findMany({ where: { ativo: true } });
    const execs = await prisma.checklistExecucao.findMany({
      where: { dataRef: { gte: new Date(deMs), lte: new Date(ateMs) } },
      include: { checklist: { select: { nome: true, categoria: true } }, respostas: { select: { conforme: true } } },
      take: 5000,
    });

    // funcionários necessários: executores + atribuídos por COLABORADOR
    const idsExec = execs.map((e) => e.funcionarioId);
    const idsAtrib = checklists.filter((c) => c.atribuicaoTipo === 'COLABORADOR').flatMap((c) => c.funcionarioIds || []);
    const ids = [...new Set([...idsExec, ...idsAtrib])];
    const funcs = ids.length ? await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, apelido: true } }) : [];
    const nomeFunc = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    const responsavelDe = (c) => c.atribuicaoTipo === 'COLABORADOR'
      ? (c.funcionarioIds || []).map((id) => nomeFunc.get(id)).filter(Boolean)
      : (c.funcoes || []);
    const scoreDe = (respostas) => { const av = respostas.filter((r) => r.conforme !== null).length; const co = respostas.filter((r) => r.conforme === true).length; return av ? Math.round((co / av) * 100) : null; };

    const chById = new Map(checklists.map((c) => [c.id, c]));
    const execByKey = new Map();                              // `${checklistId}|${dia}` -> exec
    for (const e of execs) execByKey.set(`${e.checklistId}|${diaStr(e.dataRef.getTime())}`, e);

    const linhas = [];
    const usados = new Set();
    // 1) ocorrências esperadas (checklists agendados)
    for (const c of checklists) {
      const hl = (typeof c.recorrenciaConfig?.horarioLimite === 'string') ? c.recorrenciaConfig.horarioLimite : '';
      const mHL = /^(\d{1,2}):(\d{2})$/.exec(hl);
      const tol = Math.max(0, Number(c.recorrenciaConfig?.toleranciaMin) || 0);
      const agendado = (c.recorrenciaTipo === 'DIARIA' || c.recorrenciaTipo === 'DIAS_SEMANA');
      if (!agendado) continue;
      for (let ms = deMs; ms <= ateMs; ms += 86400000) {
        const f = brFields(ms);
        const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
        if (!venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) continue;
        const dia = `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
        const key = `${c.id}|${dia}`;
        const exec = execByKey.get(key) || null;
        if (exec) usados.add(key);
        const deadlineMs = mHL ? brToUtcMs(f.y, f.mo, f.day, parseInt(mHL[1], 10), parseInt(mHL[2], 10)) + tol * 60000 : null;
        const ehPassado = dia < hojeStr;
        const status = classificarOcorrencia({ execucao: exec, ehPassado, agoraMs, deadlineMs });
        linhas.push({
          checklistId: c.id, checklistNome: c.nome, categoria: c.categoria, dia, dataRef: new Date(ms).toISOString(),
          horario: hl || null, responsavel: exec ? [nomeFunc.get(exec.funcionarioId) || '—'] : responsavelDe(c),
          funcionario: exec ? (nomeFunc.get(exec.funcionarioId) || '—') : null, funcionarioId: exec ? exec.funcionarioId : null,
          status, scorePct: exec ? scoreDe(exec.respostas) : 0, emAlerta: exec ? exec.emAlerta : false, execId: exec ? exec.id : null, esperada: true,
        });
      }
    }
    // 2) execuções reais SEM ocorrência esperada (avulsos, ou dia fora da recorrência)
    for (const e of execs) {
      const dia = diaStr(e.dataRef.getTime());
      const key = `${e.checklistId}|${dia}`;
      if (usados.has(key)) continue;
      const c = chById.get(e.checklistId);
      linhas.push({
        checklistId: e.checklistId, checklistNome: e.checklist?.nome || (c?.nome) || '—', categoria: e.checklist?.categoria || c?.categoria || '—', dia, dataRef: e.dataRef.toISOString(),
        horario: (typeof c?.recorrenciaConfig?.horarioLimite === 'string' ? c.recorrenciaConfig.horarioLimite : null),
        responsavel: [nomeFunc.get(e.funcionarioId) || '—'], funcionario: nomeFunc.get(e.funcionarioId) || '—', funcionarioId: e.funcionarioId,
        status: e.status === 'CONCLUIDA' ? 'CONCLUIDO' : 'EM_ANDAMENTO', scorePct: scoreDe(e.respostas), emAlerta: e.emAlerta, execId: e.id, esperada: false,
      });
    }

    // KPIs (só período, ignoram chips) / contagens (período + colaborador) / registros (todos os filtros)
    const { kpis } = agregar(linhas, { ativos: checklists.length });
    const fid = parseInt(req.query.funcionarioId, 10);
    const casaColab = (l) => l.funcionarioId === fid || (l.execId == null && (chById.get(l.checklistId)?.atribuicaoTipo === 'COLABORADOR') && (chById.get(l.checklistId)?.funcionarioIds || []).includes(fid));
    const linhasColab = Number.isFinite(fid) ? linhas.filter(casaColab) : linhas;
    const { contagens } = agregar(linhasColab, { ativos: checklists.length });
    const statusF = String(req.query.status || '').toUpperCase();
    const linhasFinal = STATUS_VALIDO(statusF) ? linhasColab.filter((l) => l.status === statusF) : linhasColab;
    linhasFinal.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : a.checklistNome.localeCompare(b.checklistNome)));

    res.json({ periodo: { de: diaStr(deMs), ate: diaStr(ateMs), chave: preset }, kpis, contagens, registros: linhasFinal.length, ocorrencias: linhasFinal.slice(0, 1000) });
  } catch (e) { console.error('[checklist/historico-geral]', e); res.status(500).json({ error: 'Erro ao carregar o histórico geral.' }); }
});
```
E um helper perto do handler: `const STATUS_VALIDO = (s) => ['PENDENTE','EM_ANDAMENTO','CONCLUIDO','ATRASADO','NAO_REALIZADO'].includes(s);` (ou importe `STATUS` do módulo e use `STATUS.includes(s)`).

> **⚠️ Confirme ao ler o código real:** `brFields(ms)` retorna `{ y, mo/*0-index*/, day, ... }` e
> `brToUtcMs(y, mo, day, h, mi)` é posicional mês 0-index (já confirmado nas Ações 2/3). Ajuste os
> `+1`/`-1` de mês se divergir. `venceHoje` recebe `({recorrenciaTipo, recorrenciaConfig}, dow)`.

- [ ] **Step 3:** `node --check backend/server.js`. Smoke opcional (subir server, `curl` com
  `?periodo=hoje`, `?periodo=30&status=ATRASADO`, `?funcionarioId=`; matar com `kill %1`, NUNCA
  `taskkill`). Commit: `feat(checklist): endpoint de historico geral de ocorrencias (KPIs + filtros)`.

---

### Task 4: Frontend — Painel (seletor de período + 4 KPIs + Histórico geral)

**Files:** `frontend/src/pages/Checklist.jsx` (`AbaPainel`), `frontend/src/styles/global.css` (chips/
badges de status se precisar).

**Interfaces (consome):** `GET /api/checklist/historico-geral?periodo=&de=&ate=&status=&funcionarioId=`
→ `{ periodo:{de,ate,chave}, kpis:{ativos,concluidos,atrasados,taxaConclusaoPct}, contagens:{PENDENTE,
EM_ANDAMENTO,CONCLUIDO,ATRASADO,NAO_REALIZADO}, registros, ocorrencias:[{checklistId,checklistNome,
categoria,dia,dataRef,horario,responsavel[],funcionario,funcionarioId,status,scorePct,emAlerta,execId}] }`.
`DetalheExecucao({id,onClose})` já existe.

- [ ] **Step 1 (estado + fetch):** em `AbaPainel`, adicionar estados `periodo` (default `'hoje'`), `de`,
  `ate`, `statusFiltro` (''), `funcId` (''), `hg` (resposta do endstão), `hgLoading`, `verExecucaoId`.
  `carregarHG()` monta a querystring (`periodo` sempre; `de`/`ate` só se preenchidos; `status`/
  `funcionarioId` só se selecionados) e chama `api.get('/checklist/historico-geral?'+params)`.
  `useEffect` deps `[periodo, de, ate, statusFiltro, funcId]`. Carregar a lista de colaboradores
  (`GET /funcionarios?status=ATIVO`) 1x. **Remover** o fetch de `/checklist/execucoes` e o state
  `execucoes` (o "Execuções recentes" será substituído).

- [ ] **Step 2 (seletor de período):** no topo do Painel (acima dos KPIs), chips de período: `Hoje`(
  `periodo='hoje'`, e limpa de/ate) `7 dias`(`'7'`) `30 dias`(`'30'`) `90 dias`(`'90'`) + inputs
  `type=date` De/Até (que, ao mudar, setam `de`/`ate` e desmarcam o preset). Reusar estilo de chip
  existente (ex.: os presets do `ChecklistEstatisticas`/`ChecklistHistorico`, classe `.chke-preset-btn`
  ou similar — LEIA e reuse).

- [ ] **Step 3 (4 KPIs):** substituir os 3 cards atuais por 4 (`.chkp-kpi`), lendo de `hg.kpis`:
  - **Checklists ativos** (`ativos`, ícone `lista`, is-gold).
  - **Concluídos** — rótulo `periodo==='hoje' ? 'Concluídos hoje' : 'Concluídos'`, valor `concluidos`,
    ícone `check`, is-green.
  - **Atrasados** — `atrasados`, ícone `alerta`, is-red.
  - **Taxa de Conclusão** — `taxaConclusaoPct == null ? '—' : taxaConclusaoPct + '%'`, ícone `grafico`,
    is-gold. (`null`→"—".)
  Enquanto `hgLoading` e sem dado, mostrar os cards com "…".

- [ ] **Step 4 (Histórico geral):** substituir a seção "Execuções recentes" por "Histórico de execuções":
  - **Chips de status** com contagem (de `hg.contagens`): `Pendente {PENDENTE}` · `Em andamento
    {EM_ANDAMENTO}` · `Concluído {CONCLUIDO}` · `Atrasado {ATRASADO}` · `Não realizado {NAO_REALIZADO}`.
    Clicar num chip alterna `statusFiltro` (toggle: clicar de novo limpa). O chip ativo fica destacado
    (ex.: borda/cor da marca) — como o "Atrasado: 5" da referência. + select **Colaborador** (''=Todos
    + `funcionarios`). + "{registros} registros".
  - **Tabela** `.table-card`>`.hb-table`: colunas **Data** (`dia` em pt-BR — `dia` é 'YYYY-MM-DD', use
    `new Date(dia+'T12:00:00').toLocaleDateString('pt-BR')` p/ evitar shift de fuso, ou formate os
    campos y-m-d direto), **Checklist** (`checklistNome`), **Responsável** (`responsavel.join(', ') ||
    '—'`), **Horário** (`horario || '—'`), **Conclusão** (barra + `scorePct==null?'—':scorePct+'%'`),
    **Status** (badge por status — mapa abaixo). Linha com `execId` é clicável (`cursor:pointer`,
    `onClick={() => setVerExecucaoId(l.execId)}`); linha sem `execId` (virtual) não é clicável.
  - **Badge de status** (mapa `STATUS_HG_LABEL`/cor): CONCLUIDO→verde "Concluído" (+ badge-red "Em
    alerta" se `emAlerta`); EM_ANDAMENTO→cinza/azul "Em andamento"; PENDENTE→amarelo "Pendente";
    ATRASADO→vermelho "Atrasado"; NAO_REALIZADO→cinza-escuro "Não realizado". Reuse `.badge-*`; se faltar
    cor, adicione classe no `global.css` (tema-aware).
  - Estados loading/vazio ("Nenhuma ocorrência no período/filtro.").
  - **Reuso** `{verExecucaoId != null && <DetalheExecucao id={verExecucaoId} onClose={() => setVerExecucaoId(null)} />}`.
  - A **Conclusão** deve colorir por **status** (não pelo número): Pendente/Não realizado com barra
    neutra/vermelha, Concluído verde — pra "0%" de Pendente não parecer falha. (Detalhe visual; use o
    status pra decidir a cor da barra.)

- [ ] **Step 5:** `cd frontend && npm run build`. Commit: `feat(checklist): Painel com periodo + 4 KPIs
  + historico geral de ocorrencias (substitui execucoes recentes)`.

## Verificação final

`node backend/checklistHistoricoGeral.test.js` (0 falhas); `node --check backend/server.js`; `npm run
build`. No app: `/central-de-ajuda` mostra o Guia (e sumiu do Painel); Painel tem seletor de período +
4 KPIs que mudam com o período; Histórico geral lista ocorrências (Concluído/Em andamento/Pendente/
Atrasado/Não realizado) com chips de contagem + filtro de colaborador; clicar numa linha com execução
abre o Detalhe; as 3 colunas e "Meus checklists" seguem lá; isolamento por loja e `pin` nunca aparecem.
