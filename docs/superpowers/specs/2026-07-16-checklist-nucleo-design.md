# Checklist Inteligente — Fatia 1 (Núcleo) — Design

**Data:** 2026-07-16 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

Sistema de checklists para food service: o gestor transforma rotinas (abertura, fechamento,
segurança alimentar) em listas digitais padronizadas; o operador executa e cada item vira
registro comprovável; o gestor acompanha de longe o que foi feito, o que está pendente e o
que saiu do padrão. Referência: um produto de mercado com telas de Painel, Checklists,
Colaboradores, Templates e Notificações.

**O escopo total é grande demais para uma spec** — são subsistemas independentes. Decompomos
em 3 fatias, cada uma um ciclo spec → plano → implementação próprio:

- **Fatia 1 — Núcleo (esta spec):** templates → checklists agendados por setor → execução
  autenticada → evidências não-foto → dashboard. Reusa o que já existe; **zero infra nova**.
- **Fatia 2 — Foto + IA:** pipeline de armazenamento de imagem (o PDV não tem) + tipo de item
  Foto + auditoria da foto por IA de visão.
- **Fatia 3 — Alertas & agendamento:** motor de disparo (lembrete antes do horário, alerta
  imediato de não-conformidade, boletim semanal, alerta para gestores) por WhatsApp + Email
  (o PDV tem envio de WhatsApp via `zapi.mjs`; **não tem** email), mais a tela de Notificações.

## Decisões travadas (com o usuário)

1. **Recorte da v1:** Núcleo sem foto (foto arrasta o gap de armazenamento de imagem → Fatia 2).
2. **Três camadas:** `Template` (biblioteca reutilizável, semeada e editável) → `Checklist`
   (template configurado: setor, prioridade, recorrência) → `Execução` (uma rodada com respostas).
3. **Execução na Área do Colaborador:** não há quiosque por token para checklist. O operador
   executa dentro do mini-app que já tem Benefícios + Espelho de ponto (login por WhatsApp OTP),
   numa nova aba **Checklists**. Login único, e "quem fez" é o colaborador **autenticado** —
   prova mais forte que um PIN num tablet compartilhado. Isso **substitui** o QR anônimo da
   referência.
4. **Atribuição por setor:** um checklist é atribuído a um ou mais setores; todo colaborador do
   setor vê o checklist do dia e qualquer um do setor executa. Espelha o turno real da cozinha.
5. **Só registra o alerta na v1:** item crítico com não-conformidade marca a execução `emAlerta`
   e aparece no dashboard; **nenhum disparo** — todo WhatsApp/Email fica na Fatia 3.

**Decisões técnicas assumidas sem perguntar (YAGNI / robustez):**

6. **Recorrência derivada, sem cron:** a regra fica guardada no checklist e "vence hoje?" é
   calculado na leitura (área do operador + dashboard). O gerador agendado só faz sentido com os
   lembretes → Fatia 3.
7. **Snapshot na execução:** ao iniciar, os itens são congelados na execução. Editar o checklist
   depois **não reescreve** o passado — é auditoria, o registro é imutável (mesma lógica do
   `nomeItem` da Etiqueta).
8. **Dia de expediente, não dia civil:** um checklist de fechamento cruza a meia-noite. Reusa
   `janelaExpedienteAtual`/`brFields`/`brToUtcMs` do Ponto (corte 05:00 BR). Dia civil contaria o
   fechamento da 01h no dia errado — foi bug real no Ponto.

## Reuso (o que já existe no PDV)

| Precisa de | Já existe |
|---|---|
| Operador autenticado sem app | Área do Colaborador: `exigirColaborador(req,res)` deriva o funcionário do token OTP; rotas `/api/public/colaborador/*`; front `BonificacaoEu.jsx` (`TABS`), rota `colaborador/:slug` |
| Colaboradores | `Funcionario` (`apelido`, `funcao`, `whatsapp`, `status`, `pinPonto`) |
| Área protegida no admin | `checklist` já em `AREAS_DISPONIVEIS` e `AREA_PREFIXOS` (`server.js`); sidebar + rota placeholder `EmConstrucao` |
| Fuso / dia de expediente | `janelaExpedienteAtual`, `brFields`, `brToUtcMs` |
| Multi-tenant | extension injeta `empresaId` nos models de `MODELS_TENANT` (`server.js:24`) |

## Arquitetura — duas superfícies

Espelha o "gestores acompanham / operadores executam" da referência.

- **Gestor — PDV admin (`Checklist.jsx`, área `checklist`):** Dashboard, Templates (galeria +
  editor + "usar como base"), Checklists (CRUD + editor), Setores. Colaboradores reusa o
  `Funcionario`, só ganhando setores.
- **Operador — Área do Colaborador (nova aba em `BonificacaoEu.jsx`):** "meus checklists de hoje"
  (meus setores, vencem hoje, não concluídos) → execução (responde item a item, conclui) →
  histórico.

```
[Gestor]  PDV admin /checklist ── /api/checklist/* (gate de tenant: empresaId injetado)
[Operador] Área do Colaborador ── /api/public/colaborador/checklists/* (FORA do tenant: empresaId explícito)
```

## Modelo de dados (7 models novos)

Padrão do PDV: `id Int @id`, `empresaId Int`, `@@index([empresaId])`; todos entram em
`MODELS_TENANT`.

- **`Setor`** — `nome`, `ordem`, `ativo`. `@@unique([empresaId, nome])`. Novo conceito (≠ `Funcao`,
  que é cargo). `Funcionario` ganha `setorIds Int[]` (Postgres scalar list; query "meus checklists"
  usa `setorIds hasSome [...]`).
- **`ChecklistTemplate`** — `nome`, `categoria` (uma de `CHECKLIST_CATEGORIAS`), `descricao`,
  `tempoEstimadoMin`, `ativo`, `arquivado`. Semeado com os templates da referência.
- **`ChecklistTemplateItem`** — `templateId`, `ordem`, `tipo` (`TipoItemChecklist`), `titulo`,
  `descricao`, `critico Bool`, `config Json`.
- **`Checklist`** — `templateOrigemId Int?`, `nome`, `categoria`, `descricao`, `prioridade`
  (`PrioridadeChecklist`), `setorIds Int[]`, `recorrenciaTipo` (`RecorrenciaTipo`),
  `recorrenciaConfig Json`, `ativo`. Itens copiados do template ao criar, editáveis à parte.
- **`ChecklistItem`** — `checklistId`, `ordem`, `tipo`, `titulo`, `descricao`, `critico`, `config Json`.
- **`ChecklistExecucao`** — `checklistId`, `dataRef DateTime` (**instante canônico do início do dia
  de expediente**, normalizado por `janelaExpedienteAtual` — não o horário da batida, para o unique
  casar), `funcionarioId` (**quem iniciou**; autoria por-item fica fora do v1 — checklist de setor é
  colaborativo), `iniciadaEm`, `concluidaEm DateTime?`, `status` (`EM_ANDAMENTO`|`CONCLUIDA`),
  `emAlerta Bool`, `itensSnapshotJson Json` (itens congelados no início). `@@index([empresaId, dataRef])`.
  `@@unique([checklistId, dataRef])` — uma execução por checklist por dia de expediente: dois
  colaboradores do mesmo setor no mesmo dia **compartilham e retomam** a mesma execução.
- **`ChecklistResposta`** — `execucaoId`, `itemChave String` (id do item no snapshot), `tipo`,
  `valorJson Json`, `conforme Boolean?`, `observacao String?`. `@@unique([execucaoId, itemChave])`.

**Enums:**
- `TipoItemChecklist { CHECK AVALIACAO TEXTO NUMERICO SELECAO }` (Fatia 2 adiciona `FOTO`).
- `PrioridadeChecklist { BAIXA MEDIA ALTA }`.
- `RecorrenciaTipo { DIARIA DIAS_SEMANA AVULSO }`.
- `StatusExecucao { EM_ANDAMENTO CONCLUIDA }`.

**Constantes** (`CHECKLIST_CATEGORIAS`): `Abertura`, `Fechamento`, `Controle de Pragas`,
`Documentações Sanitárias`, `Segurança Alimentar`.

**`config` por tipo de item:** `NUMERICO` `{ unidade, min?, max? }` · `SELECAO`
`{ opcoes: [{ rotulo, conforme: bool }] }` · `AVALIACAO` `{ notaMinima?: 1..5 }` · `CHECK` `{}` ·
`TEXTO` `{ obrigatorio?: bool }`.

**`recorrenciaConfig`:** `{ diasSemana?: Int[] (0=dom..6=sáb), horarioLimite?: "HH:mm" }`.

## Dois módulos puros (isolados, testados — foi o que mais protegeu na Etiqueta)

- **`backend/checklistRecorrencia.js`** — `venceHoje({ recorrenciaTipo, recorrenciaConfig }, diaExpedienteFields) → bool`
  (DIARIA sempre; DIAS_SEMANA se o dia da semana está em `diasSemana`; **AVULSO nunca** — ver abaixo)
  e `atrasado(horarioLimite, agoraFields) → bool`. Sem Prisma, sem Express.

  **AVULSO** = sem agendamento: não entra no "vence hoje", mas fica **disponível sob demanda** —
  o operador vê numa lista separada ("disponíveis") e pode executar a qualquer momento (espelha o
  painel "Sem Agendamento" da referência). Então a área do operador tem dois baldes: *vencem hoje*
  (DIARIA/DIAS_SEMANA via `venceHoje`) e *disponíveis* (AVULSO ativos ainda não concluídos hoje).
- **`backend/checklistConformidade.js`** — `avaliarResposta({ tipo, config, valor }) → { conforme: bool|null, motivo }`
  (CHECK: marcado=conforme; NUMERICO: dentro de [min,max]; SELECAO: opção escolhida é conforme;
  AVALIACAO: nota ≥ notaMinima; TEXTO: sempre `null` = não avalia, é observação) e
  `execucaoEmAlerta(itensSnapshot, respostas) → bool` (algum item **crítico** com `conforme === false`).

## Endpoints

**Gestor** (`/api/checklist/*`, dentro do gate — área `checklist` já protegida; extension injeta
`empresaId`, filtro manual é erro):
- Setores: `GET/POST/PUT/DELETE /setores`.
- Templates: `GET /templates` (+`?categoria`), `GET/POST/PUT/DELETE /templates/:id`,
  `POST /templates/:id/usar` → cria um `Checklist` a partir do template.
- Checklists: `GET/POST/PUT/DELETE /checklists`, `GET /checklists/:id`.
- Setores do colaborador: `PUT /colaboradores/:id/setores`.
- Dashboard: `GET /painel`.

**Operador** (`/api/public/colaborador/checklists/*`, FORA do gate — resolve o funcionário e o
`empresaId` por `exigirColaborador`; **passa `empresaId` explícito em toda query** — a extension
não injeta aqui, e isso já causou vazamento/500 nesta base):
- `GET /checklists` — meus checklists que vencem hoje (dos meus setores, com status derivado).
- `POST /checklists/:id/iniciar` — cria (ou retoma) a `ChecklistExecucao` do dia, com o snapshot.
- `GET /execucoes/:id` — snapshot + respostas.
- `PUT /execucoes/:id/resposta` — grava/atualiza uma resposta (`itemChave`, `valor`, `observacao`);
  recalcula `conforme` no servidor.
- `POST /execucoes/:id/concluir` — fecha a execução; calcula `emAlerta`.
- `GET /checklists/historico` — o que já fiz.

## Erros e invariantes

- **Conformidade recalculada no servidor** (`avaliarResposta`) — o cliente não decide se passou;
  é auditoria.
- **Posse cruzada:** a execução e as respostas só podem ser tocadas pelo colaborador dono
  (mesmo `empresaId` + o checklist inclui um `setor` do colaborador). Verificar na abertura.
- **Nunca `req.user.empresaId`** — só existe para operador do PDV; nas rotas de colaborador o
  `empresaId` vem da sessão OTP.

## Testes

- `backend/checklistRecorrencia.test.js`: DIARIA vence todo dia; DIAS_SEMANA só nos dias certos;
  AVULSO nunca; `atrasado` respeita o fuso BR; virada de dia de expediente (fechamento 01h conta
  no dia anterior).
- `backend/checklistConformidade.test.js`: cada tipo decide conformidade certo; TEXTO nunca
  reprova; item não-crítico não-conforme **não** põe `emAlerta`; item crítico não-conforme põe.
- Scripts `node` sem framework (padrão do repo). Build do frontend por fase.

## Fases (para o plano)

- **F1 — Fundação + Templates:** 7 models + migration + `MODELS_TENANT` + Setores (CRUD admin) +
  Templates (CRUD + editor + **seed** dos templates da referência) + tela `Checklist.jsx` base.
- **F2 — Checklists:** CRUD de `Checklist` (a partir de template ou do zero) + editor +
  `checklistRecorrencia.js` (puro + teste) + atribuição de setor ao colaborador.
- **F3 — Execução:** nova aba **Checklists** em `BonificacaoEu.jsx` + endpoints do colaborador +
  `checklistConformidade.js` (puro + teste) + snapshot + concluir/emAlerta.
- **F4 — Dashboard:** `GET /painel` + o painel do gestor (KPIs, vence-hoje, em-alerta, meus
  checklists).

## Fora do escopo (Fatia 1)

Tipo de item Foto + armazenamento de imagem + auditoria IA (Fatia 2); motor de alertas
WhatsApp/Email, lembrete, boletim, alerta imediato, tela de Notificações (Fatia 3); geração
agendada por cron; atribuição individual (só por setor); QR público anônimo (execução é
autenticada); onboarding "Guia Inicial".
