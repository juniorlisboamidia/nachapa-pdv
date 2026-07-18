# Checklist — Fatia 2 (Lembrete de atraso) — Design

**Data:** 2026-07-17 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

O alerta imediato (F3a) dispara ao concluir com item crítico fora do padrão. Falta o
**lembrete de atraso**: avisar no WhatsApp, **antes do horário-limite**, que um checklist que
vence hoje ainda não foi concluído — cobrando o **responsável** (agora que a atribuição pode ser
por colaborador específico, [[savepoint-checklist-pdv]] Fatia 1). Precisa "acordar sozinho de
tempos em tempos" → um **agendador in-process** (o PDV não tem cron; decisão travada com o
usuário: `setInterval` no backend, sem infra nova).

Reusa o mesmo WhatsApp que já manda o **código de login OTP** do colaborador (`backend/zapi.mjs`,
`zapiEnviarTexto` — UAZAPI já configurado; se o login funciona, o lembrete funciona).

## Decisões travadas (com o usuário)

1. **Só o Lembrete** agora (boletim/resumo fica pra depois).
2. **Agendador in-process** (`setInterval` ~5 min), sem infra nova.
3. **Nova subcategoria "Configurações"** na sidebar do Checklist, com: (a) modelo de mensagem
   editável + minutos antes; (b) **lista própria** de destinatários da "Notificação de atraso"
   (separada dos destinatários do alerta imediato).
4. **Modelo padrão da mensagem** (editável): `Aviso: o checklist [nome do checklist] previsto
   para as [horário do checklist] não foi concluído. Colaborador responsável: [nome do
   responsável]. Por favor, verifique.` — placeholders `[nome do checklist]`, `[horário do
   checklist]`, `[nome do responsável]`.
5. **Responsável na mensagem:** quem **iniciou** a execução (se iniciou); se ninguém iniciou, os
   **atribuídos** — nomes (modo COLABORADOR) ou funções (modo FUNCAO).

## Modelo de dados (migration `20260717130000_checklist_lembrete`)

- `ChecklistNotificacaoConfig` (1/empresa) += `lembreteAtivo Boolean @default(false)`,
  `lembreteTemplate String @default("")` (vazio = usa a constante padrão no backend),
  `lembreteMinutosAntes Int @default(30)`.
- `ChecklistDestinatario` += `tipo String @default("IMEDIATO")` — `IMEDIATO | ATRASO`. A lista do
  imediato (F3a) fica `tipo=IMEDIATO`; a do lembrete, `tipo=ATRASO`. Reusa o mesmo CRUD.
- **Novo `ChecklistLembreteEnviado`** (dedup): `id, empresaId, checklistId, dataRef DateTime,
  criadoEm`, `@@unique([empresaId, checklistId, dataRef])`, `@@index([empresaId])`. Entra em
  `MODELS_TENANT`. Marca "já lembrei este checklist neste dia de expediente" — 1 lembrete por dia.

## Backend

**Config/destinatários (admin, dentro do gate — extension injeta empresaId):**
- `GET /api/checklist/notificacoes` passa a incluir os campos `lembrete*` no `config` e todos os
  `destinatarios` (com `tipo`). O front filtra por `tipo` na aba certa.
- `PUT /api/checklist/notificacoes/config` aceita `lembreteAtivo` (bool), `lembreteTemplate`
  (string, ≤600, vazio permitido = padrão), `lembreteMinutosAntes` (int, clamp 5–240) além do
  `alertaImediatoAtivo`.
- `POST /notificacoes/destinatarios` aceita `tipo` (IMEDIATO|ATRASO, default IMEDIATO). PUT/DELETE
  por id (inalterados). GET já devolve todos.
- `GET /notificacoes/lembrete/previa` → mensagem de exemplo (template + dados fictícios).

**Regra pura** `backend/checklistLembrete.js` (novo, sem Prisma/Express, testável):
- `montarMensagemLembrete(template, { checklist, horario, responsavel })` → substitui os 3
  placeholders `[nome do checklist]`/`[horário do checklist]`/`[nome do responsável]`. Template
  vazio → usa `TEMPLATE_PADRAO`. Placeholder sem dado → string vazia, não quebra.
- `estaNaJanelaDeLembrete(agoraMs, horarioLimite, minutosAntes, refDia)` → bool: `agora` está
  entre `(limite - minutosAntes)` e `limite` (no dia de expediente). Pura, testada.

**Disparo** `dispararLembretesLoja(empresaId)` (server.js, fora do tenantStore → empresaId
explícito em TODA query):
1. Lê a config da loja; se `!lembreteAtivo`, sai. Lê os destinatários `tipo=ATRASO` ativos; se
   vazio ou `!zapiConfigurado()`, sai.
2. Lê os checklists ativos da loja que **vencem hoje** (dia de expediente, `venceHoje`) e têm
   `recorrenciaConfig.horarioLimite`. Para cada um que **não foi concluído hoje** e está na janela
   (`estaNaJanelaDeLembrete`) e **ainda não teve lembrete** (`ChecklistLembreteEnviado` do dia):
   - Cria o marcador `ChecklistLembreteEnviado` (dedup — se já existe, pula).
   - Calcula o **responsável** (execução iniciada → quem iniciou; senão os atribuídos: nomes p/
     COLABORADOR, funções p/ FUNCAO).
   - `montarMensagemLembrete(...)` e envia a cada destinatário via `zapiEnviarTexto`, gravando um
     `ChecklistNotificacaoLog` (`regra='LEMBRETE_ATRASO'`) — aparece no histórico.

**Agendador** `iniciarAgendadorLembretes()` (chamado 1x no boot, após `app.listen`): `setInterval`
a cada 5 min chama `varrerLembretes()`, que lista as `ChecklistNotificacaoConfig` com
`lembreteAtivo=true` (todas as lojas — roda FORA do tenantStore, sem injeção) e chama
`dispararLembretesLoja(empresaId)` por loja. Best-effort: try/catch por loja, nunca derruba o
intervalo. Um único intervalo, single-thread → sem corrida no dedup.

## Frontend — nova aba "Configurações"

- Sidebar (`Sidebar.jsx`): novo sub-item **Configurações** → `/checklist/configuracoes`.
- Rota `/checklist/:tab` já existe; `TABS` do Checklist += `configuracoes`.
- **`AbaConfiguracoes`** (`Checklist.jsx`): reusa `GET/PUT /checklist/notificacoes`.
  - Card **Lembrete de atraso**: toggle `lembreteAtivo`; **modelo de mensagem** (textarea, com os
    3 placeholders listados como "atalhos" clicáveis que inserem o token); **minutos antes**
    (input); prévia da mensagem (via `/lembrete/previa` ou montada no cliente).
  - Card **Notificações de atraso** (destinatários `tipo=ATRASO`): adicionar (nome + WhatsApp),
    remover — igual ao layout da foto (avatar + nome + selo + número + ícone WhatsApp). Modais/
    confirmações fecham só por botão.

## Erros e invariantes

- Disparo/agendador rodam FORA do tenantStore → `empresaId` explícito em TODA query.
- **Best-effort**: um envio que falha loga FALHOU e não impede os outros; um erro numa loja não
  para a varredura das demais nem o intervalo.
- **1 lembrete por checklist por dia** garantido pelo `@@unique` do `ChecklistLembreteEnviado`
  (create-then-skip-on-conflict). Só checklists **vence hoje + com horarioLimite + não concluídos**.
- Fuso = **dia de expediente** (`janelaExpedienteAtual`/`brFields`) — mesmo do resto do checklist.
- `zapi` não configurado → loga e sai (não estoura). Número via `foneCanonico`/`foneParaEnvio`.
- Não quebrar o alerta imediato (F3a): `tipo=IMEDIATO` é o default; a lista dele não muda.

## Testes

- `backend/checklistLembrete.test.js` (node, sem framework): `montarMensagemLembrete` (substitui os
  3 placeholders; template vazio → padrão; dado faltando não quebra); `estaNaJanelaDeLembrete`
  (dentro/fora da janela; exatamente no limite; antes de `limite-minutos`).
- `node --check server.js`; `npm run build`.

## Fases (para o plano)

- **T1 — regra pura** `checklistLembrete.js` (`montarMensagemLembrete` + `estaNaJanelaDeLembrete`
  + `TEMPLATE_PADRAO`) + teste.
- **T2 — models + config/destinatários** (migration; `lembrete*` na config + `tipo` no
  destinatário + `ChecklistLembreteEnviado` + MODELS_TENANT; GET/PUT config + POST destinatário
  com tipo + `/lembrete/previa`).
- **T3 — disparo + agendador** (`dispararLembretesLoja` + `varrerLembretes` +
  `iniciarAgendadorLembretes` chamado no boot; grava log; dedup).
- **T4 — aba Configurações** (Sidebar + TABS + `AbaConfiguracoes`: toggle + template + minutos +
  destinatários de atraso).

## Fora do escopo

Boletim/resumo periódico; email; lembrete para checklists AVULSO ou sem horarioLimite; múltiplos
lembretes por dia; snooze.
