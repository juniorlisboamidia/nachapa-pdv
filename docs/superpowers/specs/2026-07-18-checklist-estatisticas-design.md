# Checklist — Dashboard de Estatísticas por checklist (Ação 3) — Design

**Data:** 2026-07-18 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

Terceira e última das 3 Ações da lista (Detalhes → Histórico → **Estatísticas**). Traz o **ícone 📊**
na coluna Ações + botão **"Estatísticas"** no Detalhe, abrindo o dashboard **daquele checklist** (por
checklist, igual às outras 2 Ações). **Sem IA** — só números e gráficos reais desenhados à mão
(SVG/CSS), pois o PDV não tem lib de gráfico.

## Decisões travadas (com o usuário)

1. **Escopo: por checklist** (📊 na Ação; nada de painel global).
2. **Ranking:** (a) **colaboradores** (quem executa melhor) + (b) **itens que mais reprovam**.
3. **Heatmap dia×horário:** colore **atrasos / não-feitas** (foco em cobrança).
4. **Sem IA, sem CSV.** Período selecionável.

## Estado atual (mapeado)

- `Checklist`: `recorrenciaTipo` (DIARIA|DIAS_SEMANA|AVULSO), `recorrenciaConfig Json` =
  `{ diasSemana:[0-6], horarioLimite:"HH:MM", toleranciaMin:Int }`, `tempoEstimadoMin Int?`.
- `ChecklistExecucao`: `dataRef`, `funcionarioId`, `iniciadaEm`, `concluidaEm?`, `status`, `emAlerta`,
  `itensSnapshotJson`, `respostas[]`. Tempo real = `concluidaEm - iniciadaEm` (só concluídas).
- `ChecklistResposta`: `itemChave` (== `chave` do snapshot = `String(item.id)`), `conforme Boolean?`.
- `itensSnapshotJson[]`: `{ chave, ordem, tipo, titulo, descricao, critico, config }`.
- **Regras/helpers reusáveis:** `atrasado(agoraMs, horarioMs, toleranciaMin)` (`checklistLembrete.js`,
  ms, `>=`); `venceHoje({recorrenciaTipo,recorrenciaConfig}, diaSemana)` (`checklistRecorrencia.js`);
  `brFields(ms)`/`brToUtcMs(y,mo,day,h,mi)`/`janelaExpedienteAtual()` (INTERNOS ao `server.js`, mês
  0-index, fuso fixo `BR_OFFSET_MIN=-180`, corte 05:00). Score já é calculado em
  `/api/checklist/checklists/:id/execucoes` (`avaliaveis`/`conformes`/`round(%)`).
- **Sem lib de gráfico** (só axios/react/router/xlsx/qrcode-generator/niimbot). Desenhar SVG/CSS.
- **Design system:** `.chkp-kpi*` (cards KPI), `.chkp-col*`/`.chkp-row*` (ranking), `.chkp-tag`,
  `.badge-green/-yellow/-red/-gray`, cores da marca (`--brand-gold`, `--app-*`, contraparte dark).
- Rotas: `checklist/{detalhe,historico}/:id`. Usar `checklist/estatisticas/:id`. `ChkIcon` sem ícone
  de gráfico ainda.

## Arquitetura

Separar a **matemática pura** (testável) da **cola de dados/fuso**:

- **`backend/checklistEstatisticas.js` (novo, puro, sem Prisma/fuso):** `calcularEstatisticas(input)`
  faz TODA a agregação a partir de dados já normalizados em ms. Testado por
  `checklistEstatisticas.test.js` (padrão `node arquivo.test.js`, sem framework).
- **Endpoint `GET /api/checklist/checklists/:id/estatisticas?de=&ate=` (server.js):** carrega checklist
  + execuções (com respostas) da loja, **gera as ocorrências esperadas** (itera os dias do intervalo,
  `venceHoje`, deadline via `brToUtcMs` do `horarioLimite` naquele dia), monta o `itensMap`
  (chave→título mais recente), chama o módulo puro e devolve o JSON. Fuso/DB ficam AQUI.

### Contrato do módulo puro

`calcularEstatisticas({ execucoes, ocorrenciasEsperadas, tempoEstimadoMin, itensMap, agendado })` →
- `execucoes[]`: `{ id, funcionarioId, funcionario, dataRefMs, iniciadaMs, concluidaMs|null, status,
  emAlerta, deadlineMs|null, respostas:[{ itemChave, conforme }] }`.
- `ocorrenciasEsperadas[]`: `{ dataRefMs, dow(0-6), horaLimite(0-23), deadlineMs }` (só DIARIA/
  DIAS_SEMANA; vazio p/ AVULSO). Usadas p/ "não-feitas" e adesão.
- `itensMap`: `{ [itemChave]: titulo }`. `agendado`: boolean (tem `horarioLimite` + recorrência).

Retorna:
```
{
  kpis: { execucoes, concluidas, conformidadeMedia|null, tempoMedioMin|null, tempoEstimadoMin|null,
          noPrazoPct|null, taxaConclusaoPct|null },
  serie: [{ dia:'YYYY-MM-DD', execucoes, concluidas, conformidade|null }],   // um por dia do intervalo
  rankingOperadores: [{ funcionarioId, nome, execucoes, conformidade|null, noPrazoPct|null }],  // desc por conformidade
  rankingItens: [{ itemChave, titulo, reprovacoes, avaliacoes, taxaPct }],   // desc por reprovacoes
  heatmap: { agendado, faixas:[{ ini, fim, label }], celulas:[ // 7 linhas (dow 0-6)
             { dow, porFaixa:[{ esperadas, problemas, taxaPct|null }] } ] }
}
```

### Definições (fórmulas)

- **Score de uma execução:** `avaliaveis = respostas com conforme!==null`;
  `conformes = conforme===true`; `score = avaliaveis ? round(conformes/avaliaveis*100) : null`.
- **Conformidade média:** média dos `score` das **concluídas** que têm score!==null (senão `null`).
- **Tempo médio (min):** média de `(concluidaMs-iniciadaMs)/60000` das concluídas com ambos (senão
  `null`). Exibir ao lado do `tempoEstimadoMin`.
- **No prazo:** entre as concluídas **com `deadlineMs`**, fração com `!atrasado(concluidaMs,
  deadlineMs, tol=0)` (o deadline já embute a tolerância) → `%`. `null` se nenhuma tem deadline.
- **Taxa de conclusão (adesão):** `concluídas_esperadas / ocorrenciasEsperadas` → `%`
  (concluídas cujo `dataRef` casa uma ocorrência esperada). `null` p/ AVULSO (sem esperadas).
- **Não-feita:** ocorrência esperada SEM execução concluída no seu `dataRef`.
- **Atrasada:** execução concluída com `concluidaMs > deadlineMs` (deadline = horarioLimite+tol).
- **Heatmap célula [dow][faixa]:** sobre as **ocorrências esperadas** cujo `dow`+`horaLimite` caem ali:
  `esperadas`; `problemas` = não-feitas + atrasadas; `taxaPct = esperadas ? round(problemas/esperadas*100) : null`.
  Cor: cinza (esperadas=0), verde (≤10%), amarelo (≤40%), vermelho (>40%). **AVULSO → `agendado:false`**
  (frontend mostra aviso "requer agendamento", não desenha heatmap falso).

## Backend

### `GET /api/checklist/checklists/:id/estatisticas?de=&ate=` (admin, dentro do gate)

- `exigirAdmin`; `checklistId` explícito no `where` (extension injeta `empresaId`); default do período =
  últimos 30 dias (dia de expediente) se `de`/`ate` ausentes. Validar `YYYY-MM-DD`, limites BR via
  `brToUtcMs` (00:00 do `de` → 23:59 do `ate`), **igual ao histórico** (Ação 2). Teto de intervalo
  (ex.: 180 dias) pra não varrer demais.
- Carrega o `checklist` (recorrência/horário/tempo) + `execucoes` no intervalo com
  `respostas:{ select:{ itemChave:true, conforme:true } }`.
- **Ocorrências esperadas:** itera cada dia do intervalo; `dow = getUTCDay` do dia BR; se
  `venceHoje({recorrenciaTipo,recorrenciaConfig}, dow)` e há `horarioLimite`, gera
  `{ dataRefMs (05:00 BR daquele dia), dow, horaLimite, deadlineMs = brToUtcMs(dia, hh, mm)+tol }`.
- **itensMap:** varre os `itensSnapshotJson` das execuções, `chave→titulo` (último visto vence).
- Nomes dos operadores via `fmap` (apelido||nome, `select` sem `pin`).
- Normaliza cada execução ao contrato (datas→ms; `deadlineMs` = deadline do `dataRef` dela se agendado)
  e chama `calcularEstatisticas(...)`. Devolve o objeto + `{ periodo:{de,ate}, checklist:{nome,
  recorrenciaTipo, horarioLimite, tempoEstimadoMin} }`.

## Frontend

### Ações + Detalhe

- 6º `ChkAcaoBtn` **depois** de "Ver histórico" (ordem Detalhes→Histórico→Estatísticas): `icon="grafico"`,
  `title="Ver estatísticas"`, `navigate('/checklist/estatisticas/'+c.id)`. Novo `case 'grafico'` no
  `ChkIcon` (barras SVG). Botão "Estatísticas" no cabeçalho de `ChecklistDetalhe`.

### Página `ChecklistEstatisticas` (novo export em `Checklist.jsx`, rota `checklist/estatisticas/:id`)

- Cabeçalho `page-header` (título "Estatísticas — {nome}", Voltar → Detalhe) + **seletor de período**
  (presets 7/30/90 dias + De/Até `type=date`; default 30). Recarrega ao mudar.
- **KPIs** (`.chkp-kpi`): Execuções (e concluídas), Conformidade média (%), Tempo médio (min, "est.
  Xmin"), No prazo (%), Adesão (%). Valores `null` → "—".
- **Série diária** (SVG barras): uma barra por dia (altura = execuções; cor por conformidade
  verde/amarelo/vermelho; dias sem execução = barra vazia). Eixo de datas enxuto; tooltip no hover
  (dia · N execuções · X% conformidade). Rolagem horizontal se muitos dias.
- **Ranking colaboradores** (`.chkp-row`): nome + nº execuções + barra de conformidade + %no-prazo.
  Ordenado por conformidade desc (empty-state se vazio).
- **Ranking itens que mais reprovam** (`.chkp-row`): título do item + "reprovou N de M" + taxa%
  (barra vermelha). Ordenado por reprovações desc. Empty-state "nenhuma reprovação 🎉".
- **Heatmap** (grid CSS): 7 linhas (Dom–Sáb) × faixas; célula colorida por `taxaPct` (verde/amarelo/
  vermelho/cinza) com número; legenda. Se `heatmap.agendado===false` → card com aviso "Este checklist é
  avulso (sem agendamento) — o mapa de atrasos precisa de recorrência com horário-limite." (não desenha).
- Estados loading/erro/vazio ("Sem execuções no período").

## Erros e invariantes

- **Multi-tenant:** admin dentro do gate; `checklistId` explícito; nunca `req.user.empresaId`.
- **Datas/fuso em BR:** limites e deadlines via `brToUtcMs`/`brFields` (mês 0-index), NUNCA `new Date`
  cru. O módulo puro NÃO faz fuso — recebe ms prontos.
- **Divisão por zero → `null`** em todo KPI/score/taxa (nunca `NaN`); frontend mostra "—".
- **AVULSO:** sem ocorrências esperadas → adesão/heatmap `null`/`agendado:false` (aviso honesto, sem
  número falso). Não-feitas/atraso só para DIARIA/DIAS_SEMANA com `horarioLimite`.
- **Teto de período** (ex.: 180 dias) e `take` sensato nas execuções pra não estourar.
- **pin nunca serializado.** Não quebrar Ações/Detalhe/Histórico existentes.
- Rota `checklist/estatisticas/:id` dentro do `<Layout>`, após `historico/:id`.

## Fora do escopo

Painel global (todos os checklists); IA/insights; exportar; comparação entre checklists; previsão.

## Fases (para o plano)

- **T1 — Módulo puro + teste:** `checklistEstatisticas.js` (`calcularEstatisticas`) + `.test.js`
  (KPIs, série, rankings, heatmap, bordas: vazio, sem deadline, AVULSO, divisão por zero). `node …test.js`.
- **T2 — Endpoint:** `GET /api/checklist/checklists/:id/estatisticas` (período BR default 30d, ocorrências
  esperadas, itensMap, chama o módulo). `node --check`.
- **T3 — Frontend:** ícone `grafico` + 📊 na Ação + botão no Detalhe + página `ChecklistEstatisticas`
  (KPIs + série SVG + 2 rankings + heatmap CSS) + rota. `npm run build`.
