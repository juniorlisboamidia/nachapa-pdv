# Checklist — Painel: Central de Ajuda + 4 KPIs + Histórico geral — Design

**Data:** 2026-07-18 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

Três melhorias no **Checklist › Painel** (gestor), inspiradas na referência Cardápio Web:
1. **Mover o Guia Inicial** do Painel para a **Central de Ajuda** (hoje só placeholder "Em construção").
2. **Refatorar os KPIs** do topo para 4: **Checklists ativos · Concluídos · Atrasados · Taxa de
   Conclusão**, com um **seletor de período** (Hoje/7/30/90 dias, padrão Hoje).
3. Adicionar um **Histórico geral de execuções** no Painel (todos os checklists), no formato de
   **ocorrências** — mescla execuções reais com ocorrências esperadas não feitas, classificando cada
   linha (Concluído/Em andamento/Pendente/Atrasado/Não realizado). **Substitui** a tabela "Execuções
   recentes". Sem IA, sem migration.

## Decisões travadas (com o usuário)

1. Histórico geral = **ocorrências** (virtuais + reais), igual à screenshot da referência.
2. **Substitui** a tabela "Execuções recentes" no rodapé do Painel.
3. **Um seletor de período** (Hoje/7/30/90 + De/Até, padrão **Hoje**) no topo controla **os KPIs e o
   Histórico** juntos.
4. Guia → Central de Ajuda = **página mínima real** (mostra os 4 passos + "marcar como aprendido"),
   sem CRUD de artigos.
5. **Taxonomia de status objetiva:** dia **passado** sem execução concluída = **Não realizado**
   (independe de horário). **Atrasado** só existe **hoje** (passou do horário-limite+tolerância).
6. As **3 colunas** (Próximos/Sem agendamento/Checks em alerta) e a tabela **"Meus checklists"**
   permanecem.

## Estado atual (mapeado)

- **Central de Ajuda:** só esqueleto — model `AjudaArtigo` (schema, sem uso), rota `/central-de-ajuda`
  → `EmConstrucao` (placeholder), link no rodapé da `Sidebar.jsx`. Nenhum endpoint/UI real.
- **Guia:** `GUIA_PASSOS` (4 passos estáticos) + `GuiaModal` + card no Painel (`AbaPainel`,
  Checklist.jsx), progresso em localStorage `chk-guia-aprendidos` (`GUIA_KEY`).
- **KPIs atuais** (`GET /api/checklist/painel` → `kpis`): `ativos`, `venceHoje` (calculado, **não
  usado** na UI), `concluidosHoje`, `emAlerta`. UI mostra 3 cards (ativos / concluídos hoje / **Alertas
  pendentes**=emAlerta).
- **Execuções recentes:** `GET /api/checklist/execucoes` (50 últimas, todos, **sem filtro**) → tabela
  no rodapé do Painel.
- **Statuses:** enum `StatusExecucao` só `EM_ANDAMENTO|CONCLUIDA` + `emAlerta Boolean`. "Pendente"/
  "Atrasado"/"Não realizado" são **virtuais** (derivados de recorrência + horário-limite + execução).
- **Motor reusável:** `venceHoje({recorrenciaTipo,recorrenciaConfig}, dow)` (checklistRecorrencia.js);
  `atrasado(agoraMs, horarioMs, toleranciaMin)` (checklistLembrete.js, ms, `>=`); `brFields(ms)` /
  `brToUtcMs(y, mo/*0-index*/, day, h, mi)` / `janelaExpedienteAtual()` (internos ao server.js, corte
  05:00 BR). `recorrenciaConfig = { diasSemana:[0-6], horarioLimite:"HH:MM", toleranciaMin }`. Score =
  `conformes/avaliaveis` (conforme!==null). O endpoint de estatísticas já gera ocorrências esperadas +
  deadline por dia — mesmo padrão a reusar.
- Rotas `checklist/*` dentro do `<Layout>`. `AbaPainel` = `Checklist.jsx:228-412`.

## 1. Central de Ajuda (mover o Guia)

- **Nova página** `frontend/src/pages/CentralAjuda.jsx` (dentro do `<Layout>`, rota `/central-de-ajuda`
  já existe — trocar o `element` de `EmConstrucao` por `CentralAjuda`). Renderiza o **Guia inicial**:
  os 4 passos (mover `GUIA_PASSOS` + a lógica de "marcar como aprendido"/localStorage para lá, OU
  extrair para um componente `GuiaChecklist` reusável). Cada passo com "Abrir etapa" (navega pro
  destino, ex.: `/checklist/checklists?novo=1`). Cabeçalho da página + intro curta.
- **Remover do Painel:** o card "Guia inicial" (`.chkp-guia`) e o `GuiaModal`/estado `verGuia` do
  `AbaPainel`. O `GUIA_PASSOS`/`GUIA_KEY`/helpers migram para a página (ou componente compartilhado).
- Sem backend/CRUD (o `AjudaArtigo` fica intocado por ora — YAGNI).

## 2. Período + 4 KPIs

- **Seletor de período** no topo do Painel: chips `Hoje · 7 dias · 30 dias · 90 dias` + inputs De/Até
  (`type=date`); padrão **Hoje**. Controla os KPIs **e** o Histórico geral (um controle único).
- **4 KPIs** (`.chkp-kpi`), vindos do endpoint no período selecionado:
  - **Checklists ativos** — total de checklists ativos (absoluto, não muda com período).
  - **Concluídos** — nº de ocorrências CONCLUÍDO no período (rótulo "Concluídos hoje" quando período=Hoje).
  - **Atrasados** — nº de ocorrências **vencidas não concluídas** no período = ATRASADO + NÃO
    REALIZADO (substitui "Alertas pendentes"). No padrão Hoje = os atrasados de hoje.
  - **Taxa de Conclusão** — `CONCLUÍDO ÷ total de esperadas no período` (%). "—" se 0 esperadas.

## 3. Histórico geral (ocorrências) — substitui "Execuções recentes"

Tabela de **ocorrências** de todos os checklists no período. Colunas **Data · Checklist · Responsável ·
Horário · Conclusão(%) · Status**. Filtros: **chips de status** (com contagem, ex.: "Atrasado: 5") +
**Colaborador** (`GET /funcionarios?status=ATIVO`) + o período do topo. Contador "N registros".

### Geração das ocorrências (backend)
Para o período `[de, ate]` (só até hoje — não gera futuro):
1. Carrega checklists ativos (recorrência/horário/atribuição) + execuções no período (com respostas p/
   score, e o nome do checklist).
2. **Ocorrências esperadas:** para cada checklist agendado (DIARIA/DIAS_SEMANA), cada dia do período em
   que `venceHoje(dow)` → chave `(checklistId, dia)` com `deadlineMs` (horário-limite+tolerância do
   dia, ou null se sem horário).
3. **Linhas = união:** cada ocorrência esperada (com sua execução se houver) **+** cada execução real
   sem ocorrência esperada correspondente (avulsos, ou execução feita em dia fora da recorrência).
4. **Classificação** (regra pura — ver Arquitetura): a partir de `(execução?, ehPassado, agoraMs,
   deadlineMs)`.
5. **Score/Conclusão:** com execução → `conformes/avaliaveis` (%); sem execução → 0% (a UI colore por
   **status**, não pelo número — Pendente 0% não é "falha", é "não começou").
6. **Responsável:** com execução → quem executou (`funcionario`); sem execução → o(s) responsável(is)
   atribuído(s) do checklist (nomes COLABORADOR ou nomes de FUNÇÃO).

### Filtros
- **Período:** presets Hoje(hoje)/7/30/90 dias (incluindo hoje) + De/Até custom (override). Teto 180 dias.
- **Status (chip):** filtra as linhas; as **contagens** dos chips são sobre o período (+ colaborador se
  aplicado), independentes do chip ativo. "N registros" = linhas após os filtros.
- **Colaborador:** casa `funcionarioId` da execução (linhas reais) OU os `funcionarioIds` atribuídos
  (checklists modo COLABORADOR). Linhas de modo FUNÇÃO sem execução não casam um colaborador específico
  (limitação aceita).
- **KPIs** refletem só o **período** (ignoram os chips de status/colaborador — são o resumo global).

## Arquitetura (sem migration)

- **Módulo puro** `backend/checklistHistoricoGeral.js` + `checklistHistoricoGeral.test.js`:
  ```js
  // status: 'CONCLUIDO' | 'EM_ANDAMENTO' | 'PENDENTE' | 'ATRASADO' | 'NAO_REALIZADO'
  export function classificarOcorrencia({ execucao /* {status}|null */, ehPassado, agoraMs, deadlineMs }) {
    if (execucao) return execucao.status === 'CONCLUIDA' ? 'CONCLUIDO' : 'EM_ANDAMENTO';
    if (ehPassado) return 'NAO_REALIZADO';                 // dia passado sem execução (independe de horário)
    if (deadlineMs != null && agoraMs >= deadlineMs) return 'ATRASADO';  // hoje, passou do prazo
    return 'PENDENTE';                                     // hoje, ainda dá tempo (ou sem horário)
  }
  ```
  (+ helper opcional de agregação de contagens/KPIs a partir das linhas classificadas, testável.)
- **Endpoint novo** `GET /api/checklist/historico-geral?periodo=&de=&ate=&status=&funcionarioId=`
  (admin, dentro do gate): faz a cola DB+fuso (gera ocorrências, classifica, filtra) e devolve
  `{ periodo:{de,ate,chave}, kpis:{ativos,concluidos,atrasados,taxaConclusaoPct}, contagens:{PENDENTE,
  EM_ANDAMENTO,CONCLUIDO,ATRASADO,NAO_REALIZADO}, registros, ocorrencias:[{checklistId, checklistNome,
  categoria, dia, dataRef, horario, responsavel, funcionario, funcionarioId, status, scorePct, emAlerta,
  execId}] }`. `dataRef`/`dia` e `deadline` via `brToUtcMs`/`brFields` (mês 0-index), igual ao endpoint
  de estatísticas. Teto 180 dias; `take` sensato nas execuções.
- **`GET /api/checklist/painel`** permanece para as **3 colunas + "Meus checklists"** (carregado 1x). A
  linha de KPIs passa a vir do endpoint novo (period-driven). "Execuções recentes" some.
- **Frontend `AbaPainel`:** remove Guia; adiciona o seletor de período; os 4 KPIs e o Histórico geral
  leem o endpoint novo (recarrega ao trocar período/filtros). Reusa `.chkp-kpi*`, `.table-card`/
  `.hb-table`, `.badge-*`, o modal `DetalheExecucao` (clicar numa linha COM execução abre o detalhe;
  linha virtual sem execução não abre).

## Erros e invariantes

- **Multi-tenant:** admin dentro do gate; a extension injeta `empresaId`; `pin` nunca serializado
  (funcionário sempre via `select` id/nome/apelido). Nunca `req.user.empresaId`.
- **Fuso BR:** período/deadline/dia via `brToUtcMs`/`brFields` (mês 0-index, corte 05:00). Nunca `new
  Date('YYYY-MM-DD')` cru. Não gera ocorrências no futuro (ate ≤ hoje de expediente).
- **Divisão por zero → null** (taxa/score); UI mostra "—". Status colore a linha, não o score.
- **Performance:** teto 180 dias; ocorrências = checklists × dias — ok pro volume do PDV; `take` nas
  execuções.
- **Não quebrar** as 3 colunas, "Meus checklists", nem o modal `DetalheExecucao` (compartilhado com o
  Histórico por checklist e as Estatísticas). O Histórico **por checklist** (Ação 2) e as Estatísticas
  (Ação 3) continuam intactos.
- **Consistência:** o KPI "Atrasados" e os chips ATRASADO/NÃO REALIZADO usam a **mesma** classificação
  pura; a taxa de conclusão bate com CONCLUÍDO/esperadas.

## Fora do escopo

CRUD de artigos da Central de Ajuda; remover as 3 colunas/redundância; exportar CSV; histórico geral
como página própria (fica no Painel); notificação/ação a partir das linhas virtuais.

## Fases (para o plano)

- **T1 — Central de Ajuda:** página `CentralAjuda` (Guia) + remover card/modal do Painel (frontend +
  troca de `element` na rota). `npm run build`.
- **T2 — Módulo puro:** `checklistHistoricoGeral.js` (`classificarOcorrencia` + agregação) + teste
  (`node …test.js`).
- **T3 — Endpoint:** `GET /api/checklist/historico-geral` (período BR, ocorrências esperadas + união
  com execuções, classificação, filtros status/colaborador, KPIs+contagens). `node --check`.
- **T4 — Frontend Painel:** seletor de período + 4 KPIs (do endpoint novo) + Histórico geral
  (chips de status com contagem + colaborador + tabela de ocorrências, reuso do `DetalheExecucao`),
  substituindo "Execuções recentes". `npm run build`.
