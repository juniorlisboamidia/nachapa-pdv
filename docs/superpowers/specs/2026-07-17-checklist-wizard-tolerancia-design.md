# Checklist — Wizard de criação (4 etapas) + Tolerância — Design

**Data:** 2026-07-17 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

A criação/edição do checklist hoje é um modal único (`ChecklistEditor`). O usuário quer o fluxo
em **4 etapas** (Informações → Itens → Agendamento → Revisão) e uma **Tolerância (min)** por
checklist no agendamento — a folga depois do horário antes de o alerta de atraso disparar.

Adapta a referência (Cardápio Web) à nossa realidade: **atribuição por função/colaborador** (não
"Setores"), **Foto sem IA** (sem prompt), e nossos tipos/valores. Aproveita para trazer campos
úteis da referência: **tempo estimado**, **dicas de execução** e **instruções da gestão para
alertas** por item.

## Decisões travadas (com o usuário)

1. **Wizard de 4 etapas** para criar/editar checklist.
2. **Tolerância por checklist:** o alerta de atraso dispara em **horário + tolerância** (é quando
   de fato atrasou). A tolerância **substitui** o campo global "minutos antes" do lembrete.
3. **Mantém função/colaborador** (o "Setores" da referência = nosso seletor "Atribuir a").
4. **Foto sem IA** (sem campo de prompt).

## Modelo de dados

- `Checklist` += `tempoEstimadoMin Int?` (migration `20260717140000_checklist_tempo`).
- `recorrenciaConfig` (Json, sem migration) += `toleranciaMin` (int ≥ 0). Fica ao lado de
  `horarioLimite`/`diasSemana`.
- Item `config` (Json, sem migration) += `dica` (string, "dicas para execução") e
  `instrucaoAlerta` (string, "instruções da gestão para alertas").
- `ChecklistNotificacaoConfig.lembreteMinutosAntes` fica **dormente** (não dropamos; deixa de ser
  usado no agendador e some da UI).

## Backend (Fatia A)

- **`chkDadosChecklist`**: aceita `tempoEstimadoMin` (int ≥ 0 ou null) e `recorrenciaConfig`
  passa a preservar `toleranciaMin` (int, clamp 0–240).
- **`chkNormalizarItens`**: preserva `config.dica` (≤300) e `config.instrucaoAlerta` (≤300).
- **Regra pura** `checklistLembrete.js`: troca `estaNaJanelaDeLembrete` por
  `atrasado(agoraMs, horarioMs, toleranciaMin) → bool` = `agoraMs >= horarioMs + max(0,tol)*60000`
  (sem teto — o dedup 1x/dia evita repetição). Atualiza o teste.
- **`dispararLembretesLoja`**: para cada checklist vence-hoje com `horarioLimite`, calcula
  `horarioMs` (BR via `brToUtcMs`+`brFields`) e usa `atrasado(Date.now(), horarioMs,
  recorrenciaConfig.toleranciaMin)` no lugar da janela antiga. Remove o uso de
  `cfg.lembreteMinutosAntes`. Resto igual (dedup, responsável, envio, log).

## Frontend

### Wizard (Fatia B) — `ChecklistEditor` vira 4 etapas

Barra de progresso (4 passos numerados, o atual em destaque). "Voltar"/"Próximo" entre etapas;
"Salvar checklist" só na Revisão; "Cancelar" fecha (modal fecha só por botão).

- **Etapa 1 — Informações:** Nome*, Categoria*, **Tempo estimado (min)** (opcional), Descrição,
  **Prioridade** (3 botões segmentados: Baixa/Média/Alta), **Atribuir a** (o seletor Função/
  Colaborador da fatia anterior — chips).
- **Etapa 2 — Itens do Checklist:** lista dos itens (com editar/reordenar/excluir, como hoje) +
  form "Adicionar item": Nome*, **Tipo*** (Check/Numérico/Seleção/Foto/Avaliação/Texto — Foto sem
  IA), campos por tipo (Numérico: unidade + validar min/max; Seleção: opções), **Descrição**,
  **Dicas para execução** (`config.dica`), **Instruções da gestão para alertas**
  (`config.instrucaoAlerta`), e **Crítico** (toggle). "Adicionar item".
- **Etapa 3 — Agendamento:** "Este checklist é recorrente" (toggle → AVULSO se off); Frequência
  (Diário/Dias da semana); Dias; **Horário de execução** (`horarioLimite`); **Tolerância (min)**
  (`toleranciaMin`, novo). (Fora do escopo: data início/término e exceções da referência.)
- **Etapa 4 — Revisão:** resumo (nome, categoria, nº itens, horário) + lista dos itens + "Salvar".

O `salvar()` monta o mesmo corpo de hoje + `tempoEstimadoMin`, `recorrenciaConfig.toleranciaMin`,
e os `config.dica`/`config.instrucaoAlerta` nos itens. Reusa `atribuicaoTipo`/`funcoes`/
`funcionarioIds`. O `?editar`/`?novo` continua abrindo o wizard.

### Área do Colaborador (Fatia B) — exibir os campos novos

`BonificacaoEu.jsx` (execução): mostra o **tempo estimado** no cartão do checklist; a **dica**
(`config.dica`) como texto de apoio no item; e a **instrução da gestão** (`config.instrucaoAlerta`)
quando o item fica não-conforme/fora da regra (é o "aparece pro colaborador quando houver
não-conformidade" da referência).

### Aba Configurações (Fatia B)

Remove o input "minutos antes" (agora é a tolerância por checklist). O toggle do lembrete + o
template + os destinatários de atraso continuam.

## Erros e invariantes

- O agendador segue FORA do tenantStore (`empresaId` explícito), best-effort, dedup 1x/dia.
- `toleranciaMin` ausente/inválido → 0 (dispara no próprio horário). Horário em BR via `brToUtcMs`.
- Wizard: validação por etapa (nome obrigatório na 1; item sem título barrado na 2) antes de
  avançar/salvar — sem perder o preenchido ao voltar.
- Não quebrar a execução existente (itens antigos sem `dica`/`instrucaoAlerta` → nada aparece).

## Testes

- `checklistLembrete.test.js`: `atrasado` (antes do horário → false; exatamente no horário com
  tol 0 → true; horário+tol-1min → false; horário+tol → true; tol ausente = 0).
- `node --check server.js`; `npm run build`.

## Fases (para o plano)

**Fatia A (backend):**
- A1 — regra pura: `atrasado` no lugar de `estaNaJanelaDeLembrete` + teste.
- A2 — `chkDadosChecklist`/`chkNormalizarItens` (tempoEstimadoMin, toleranciaMin, dica,
  instrucaoAlerta) + migration `tempoEstimadoMin` + `dispararLembretesLoja` usando `atrasado`.

**Fatia B (frontend):**
- B1 — `ChecklistEditor` → wizard de 4 etapas (com tolerância na etapa 3).
- B2 — exibição dos campos novos na Área do Colaborador + remoção do "minutos antes" da aba
  Configurações.

## Fora do escopo

Data de início/término e exceções do agendamento (reference); recorrência mensal; IA na foto;
boletim/email.
