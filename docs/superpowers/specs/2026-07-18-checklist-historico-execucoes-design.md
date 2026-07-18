# Checklist — Ver Histórico de Execuções (Ação 2) — Design

**Data:** 2026-07-18 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

Segunda das 3 Ações da lista de checklists (Detalhes → **Histórico** → Estatísticas).
Traz o **ícone 🗓️ (calendário)** na coluna Ações + um botão **"Ver histórico"** na página de
Detalhes, ambos abrindo uma página que lista as **execuções de UM checklist** com **filtros**
(status + operador + intervalo de datas), uma coluna de **% de conformidade (score)** por execução,
e onde **clicar numa linha abre o Detalhe da Execução** que já existe.

**Sem IA.** Só dados reais (números, filtros, tabela).

## Decisões travadas (com o usuário)

1. **Filtros:** status (Concluída / Em andamento / Em alerta) + operador (colaborador que executou) +
   intervalo de datas.
2. **Coluna de score/conformidade** por linha (% = itens conformes ÷ itens avaliáveis).
3. **Clicar → abre o Detalhe da Execução** (reusa o modal `DetalheExecucao` que já existe — F2).
4. **Acesso:** ícone 🗓️ na coluna Ações da lista **e** botão "Ver histórico" no cabeçalho da página
   de Detalhes.
5. **Ícone = calendário** (🗓️), não relógio.
6. **Sem exportar CSV** (fica de fora; pode entrar depois).

## Estado atual (mapeado)

- **`ChecklistExecucao`** (`schema.prisma:1898`): `status` (EM_ANDAMENTO|CONCLUIDA), `emAlerta Boolean`,
  `funcionarioId`, `dataRef DateTime`, `iniciadaEm`, `concluidaEm`, `itensSnapshotJson`, `respostas
  ChecklistResposta[]`. **Não há score persistido.** `ChecklistResposta.conforme Boolean?` por item.
- **`GET /api/checklist/execucoes`** (`server.js:8092`): admin, **sem filtros**, `take: 50`, todos os
  checklists. Não serve pro histórico por checklist → **rota nova dedicada**.
- **`GET /api/checklist/execucoes/:id`** (`server.js:8107`): detalhe de uma execução; alimenta o modal.
- **`DetalheExecucao({ id, onClose })`** (`Checklist.jsx:419`): **modal auto-suficiente** (só recebe
  `id`/`onClose`, busca `/checklist/execucoes/:id`, mostra respostas item-a-item + fotos). **Reusar.**
- **Score não existe** em lugar nenhum — calcular na hora: `conformes / avaliáveis` onde avaliáveis =
  itens com `conforme !== null` (CHECK/NUMERICO/SELECAO/AVALIACAO avaliam; TEXTO/FOTO não).
- **UI reusável:** `.table-card` + `.hb-table` (tabela), `.badge`+`.badge-green/red/gray` (status),
  `.form-input`/`.form-group`/`.form-label` (filtros select/date), `STATUS_EXEC_LABEL` (Checklist.jsx:36),
  `ChkAcaoBtn`/`ChkIcon` (coluna Ações, Checklist.jsx:81-109).
- **Rotas:** `checklist/detalhe/:id` (App.jsx:102). Usar `checklist/historico/:id` (2 segmentos, não
  colide com `checklist/:tab`). Novo export `ChecklistHistorico` em `Checklist.jsx`.

## Backend

### `GET /api/checklist/checklists/:id/execucoes` (novo, admin, dentro do gate)

Query params (todos opcionais): `status` (EM_ANDAMENTO|CONCLUIDA|ALERTA), `funcionarioId` (int),
`de` (YYYY-MM-DD), `ate` (YYYY-MM-DD).

- `exigirAdmin`; a extension Prisma injeta `empresaId` (mesmo padrão do `/api/checklist/execucoes`).
- `where`: `{ checklistId: id }` **sempre**; `+ status: 'CONCLUIDA'|'EM_ANDAMENTO'` quando `status` é um
  desses; quando `status === 'ALERTA'` → `emAlerta: true` (sem filtrar `status`); `+ funcionarioId`
  quando informado; `+ dataRef` no intervalo `[de, ate]` construído **em horário BR** com os helpers
  existentes (`brToUtcMs`/`brFields`) — nunca `new Date(str)` cru (usaria o fuso UTC do VPS).
- Traz `respostas: { select: { conforme: true } }` pra computar o score barato (sem carregar valores/fotos).
- Resolve os nomes dos operadores via o mesmo mapa de funcionários usado no `/api/checklist/execucoes`.
- **Score por execução:** `avaliaveis = respostas.filter(r => r.conforme !== null).length`;
  `conformes = respostas.filter(r => r.conforme === true).length`;
  `score = avaliaveis ? Math.round(conformes / avaliaveis * 100) : null`.
- Ordena `iniciadaEm desc`, `take: 200` (histórico é por checklist, volume baixo).
- Devolve `{ execucoes: [{ id, dataRef, funcionario, funcionarioId, status, emAlerta, score, avaliaveis,
  conformes, iniciadaEm, concluidaEm }] }`.

O detalhe continua sendo o `GET /api/checklist/execucoes/:id` já existente (nada novo).

## Frontend

### Coluna Ações (`AbaChecklists`, Checklist.jsx:762) + botão no Detalhe (Checklist.jsx:1265)

- 5º `ChkAcaoBtn` **entre "Ver detalhes" e "Executar"** (ordem visual Detalhes → Histórico →
  [Estatísticas depois]): `icon="calendario"`, `title="Ver histórico"`, `onClick={() =>
  navigate('/checklist/historico/'+c.id)}`.
- Novo `case 'calendario'` no `ChkIcon` (SVG de calendário inline — retângulo + duas hastes no topo +
  linha do cabeçalho). Não reusar `'relogio'`.
- No cabeçalho de `ChecklistDetalhe`: botão `btn btn-secondary` "Ver histórico" (ícone `calendario`) ao
  lado de Editar/Executar → mesma navegação.

### Página `ChecklistHistorico` (novo export em `Checklist.jsx`, rota `checklist/historico/:id`)

- `useParams().id`; `page-header` com o nome do checklist (busca `GET /checklist/checklists/:id`) +
  botão "Voltar" (`navigate(-1)` ou pro Detalhe) + "Ver detalhes".
- **Barra de filtros** (`.form-*` nativos): select **Status** (Todos / Concluída / Em andamento / Em
  alerta), select **Operador** (Todos + lista de `GET /api/funcionarios?status=ATIVO`), inputs
  **Data de** / **Data até** (`type="date"`). Recarrega ao mudar (monta a querystring só com os
  preenchidos).
- **Tabela** (`.table-card`/`.hb-table`): colunas **Data** (`dataRef` formatada BR), **Operador**,
  **Status** (badge verde/cinza + badge vermelha "Em alerta" quando `emAlerta`), **Conformidade**
  (barra + `score%`, ou "—" quando `score === null`), **Início/Conclusão** (hora). Linha clicável →
  `setVerExecucaoId(e.id)`.
- **Reusar `DetalheExecucao`**: `{verExecucaoId != null && <DetalheExecucao id={verExecucaoId}
  onClose={() => setVerExecucaoId(null)} />}` (mesmo componente do Painel).
- Estados loading / erro / vazio ("Nenhuma execução no período"). Score exibido com cor semântica
  (verde ≥90, amarelo 70–89, vermelho <70) — reusa `.badge-*` ou um mini-bar `.chk*`.

## Erros e invariantes

- **Multi-tenant:** rota admin dentro do gate → a extension injeta `empresaId`; **`checklistId`
  explícito** no `where` (não confiar só na extension pra isolar checklist). Nunca `req.user.empresaId`.
- **Datas em BR:** o intervalo `de/ate` vira limites via `brToUtcMs`/`brFields` (dia de expediente),
  não `new Date` cru.
- **Score:** divisão por zero → `null` (mostra "—"), nunca `NaN`. Itens TEXTO/FOTO não contam como
  avaliáveis.
- **Não quebrar** a `AbaChecklists`, o `ChecklistDetalhe`, nem o modal `DetalheExecucao` (é o mesmo
  usado no Painel).
- Rota `checklist/historico/:id` dentro do `<Layout>`, logo após `checklist/detalhe/:id`.

## Fora do escopo

Exportar CSV; estatísticas agregadas (é a Ação 3); histórico global de todos os checklists;
deep-link direto pra uma execução (o detalhe segue como modal).

## Fases (para o plano)

- **T1 — Backend:** `GET /api/checklist/checklists/:id/execucoes` (filtros status/operador/datas-BR +
  score calculado). `node --check`.
- **T2 — Frontend:** ícone `calendario` + botão 🗓️ na coluna Ações + botão "Ver histórico" no Detalhe +
  página `ChecklistHistorico` (filtros + tabela + score + reuso do `DetalheExecucao`) + rota. `npm run build`.
