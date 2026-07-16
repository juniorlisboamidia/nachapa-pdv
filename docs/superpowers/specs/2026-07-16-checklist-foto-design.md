# Checklist Inteligente — Fatia 2 (Foto) — Design

**Data:** 2026-07-16 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

A Fatia 1 (Núcleo) entregou o ciclo template → checklist → execução → dashboard, com itens
Check/Avaliação/Texto/Numérico/Seleção. A Fatia 2 adiciona **FOTO como evidência** — o headline
do pitch ("exigir fotos como evidência") — e a **tela do gestor para revisar a execução**, que a
Fatia 1 não tinha (o gestor via *quais* checklists estavam pendentes/em alerta, mas não conseguia
abrir uma execução e ver o que foi respondido).

**Sem IA** — decisão do usuário: a foto é registro/prova, sem auditoria automática por visão.

## Decisões travadas (com o usuário)

1. **Storage: base64 no banco, em tabela própria** (`ChecklistFoto`). Segue o padrão do PDV
   (`logoDataUrl` — dataURL na coluna, "sem upload de arquivo no servidor"); zero infra nova.
   Isolada da `ChecklistResposta` para não pesar as queries de lista; **bytes só sob demanda**.
2. **Revisão do gestor: detalhe da execução.** O gestor abre uma execução (do dashboard) e vê
   respostas item a item + fotos + quem fez + horário + conformidade.
3. **Foto obrigatória:** um item FOTO **crítico** exige a foto para concluir (400 se faltar).
   Honra o "exigir foto" do pitch. Item FOTO não-crítico é opcional.

**Decisões técnicas assumidas:** conformidade da foto é `null` (evidência, sem IA para julgar —
igual TEXTO); uma foto por item; compressão **no cliente** antes de subir.

## Reuso (Fatia 1)

Toda a fundação: `ChecklistExecucao`/`ChecklistResposta` + `itensSnapshotJson`, `exigirColaborador`,
`chkAbrirExecucao`/`chkPosseExecucao` (posse por setor), o gate de tenant, `MODELS_TENANT`. A regra
pura de conformidade (`avaliarResposta`) ganha o caso FOTO.

## Modelo de dados

**Enum:** `TipoItemChecklist` ganha o valor **`FOTO`** (`ALTER TYPE ... ADD VALUE 'FOTO'`). No
Postgres 16 (o do VPS) `ADD VALUE` roda dentro da transação da migration desde que o valor não
seja *usado* na mesma migration — e não é (só declaramos). Sem risco.

**Model novo — `ChecklistFoto`** (multi-tenant, entra em `MODELS_TENANT`):
`id`, `empresaId`, `execucaoId`, `itemChave String`, `dataUrl String @db.Text` (base64), `largura Int?`,
`altura Int?`, `tamanhoBytes Int?`, `criadoEm`. `@@unique([execucaoId, itemChave])` (uma foto por
item por execução; retomar substitui), FK `execucaoId → ChecklistExecucao onDelete: Cascade`,
`@@index([empresaId])`.

A `ChecklistResposta` do item FOTO guarda só um marcador leve (`valorJson = { temFoto: true }`,
`conforme: null`) — os bytes ficam na `ChecklistFoto`. Assim `chkExecJson` e as listas continuam
leves; a imagem carrega por endpoint dedicado.

## Regra de conformidade (FOTO)

`avaliarResposta` (`backend/checklistConformidade.js`) ganha o caso `FOTO`: sempre
`{ conforme: null, motivo: null }` — evidência, não se julga sem IA (mesma semântica de TEXTO). A
obrigatoriedade **não** é conformidade; é uma checagem de completude no concluir (abaixo).

## Compressão no cliente

`frontend/src/lib/comprimirFoto.js` (novo): recebe um `File`/`Blob` da câmera, desenha num canvas
redimensionado para no máximo **1280px** no maior lado, exporta **JPEG** (qualidade ~0.7) e devolve
um dataURL. Alvo <300KB; se o resultado passar de **~4MB** (margem do body limit de 5mb), rejeita
com mensagem clara. Isolada e testável (a parte de canvas roda no navegador; a lógica de escala é
verificável).

## Endpoints

**Operador** (`/api/public/colaborador/*`, FORA do gate — `empresaId` explícito, posse por setor
via `chkPosseExecucao`):
- `PUT .../execucoes/:id/foto` ← `{ itemChave, dataUrl }` — valida que o item existe no snapshot e é
  do tipo FOTO, valida o tamanho do dataUrl, faz **upsert** de `ChecklistFoto` (por
  `execucaoId+itemChave`) e **upsert** da `ChecklistResposta` (`{ temFoto: true }`, `conforme: null`).
  Bloqueia se a execução está `CONCLUIDA` (409).
- `GET .../fotos/:id` — devolve o `dataUrl` (bytes sob demanda), escopado por `empresaId` + posse.
- `chkExecJson` passa a incluir `fotos: { [itemChave]: { id } }` (metadata, **sem** bytes).
- **Concluir** (`POST .../execucoes/:id/concluir`) ganha a regra: se algum item **FOTO crítico** do
  snapshot não tem `ChecklistFoto`, responde **400** ("Falta a foto obrigatória de: <título>").
  Reusa o snapshot para saber quais itens são FOTO crítico.

**Gestor** (`/api/checklist/*`, DENTRO do gate — extension injeta `empresaId`):
- `GET /execucoes` — lista de execuções recentes (hoje + últimas concluídas): `id`, checklist nome,
  funcionário nome, `status`, `emAlerta`, `concluidaEm`. Para o gestor escolher qual abrir.
- `GET /execucoes/:id` — detalhe: checklist, funcionário, `dataRef`, status, emAlerta,
  `itensSnapshotJson`, respostas (valor/conforme/observação), e `fotos: { [itemChave]: { id } }`.
- `GET /fotos/:id` — o `dataUrl` (bytes sob demanda).

## Frontend

**Operador** (`BonificacaoEu.jsx`, item FOTO em `ExecutarChecklist`): botão de câmera
(`<input type="file" accept="image/*" capture="environment">`), comprime via `comprimirFoto`, mostra
prévia (miniatura) com "refazer", sobe pelo `PUT .../foto`. Item FOTO crítico sem foto **bloqueia** o
"Concluir" (client-side, além do 400 do servidor). Ao reabrir a execução, os itens com foto mostram
"✓ foto anexada" e permitem ver/trocar (o ver busca os bytes via `GET .../fotos/:id`).

**Gestor** (`Checklist.jsx`): a aba **Painel** ganha uma seção "Execuções recentes" (de
`GET /execucoes`), e os cards de pendentes/alertas/execuções que **têm** execução ficam clicáveis →
abrem o **modal Detalhe da Execução**: cada item com resposta + conformidade + a foto (miniatura →
abre grande, bytes sob demanda), quem fez e o horário. Modal fecha só pelo botão.

## Templates

Os itens de foto que a Fatia 1 tirou dos templates voltam: entram no `CHECKLIST_TEMPLATES_SEED`
(lojas novas) **e** uma migration de dados os **anexa aos templates já semeados**, casando por
`nome`+`categoria` e inserindo os itens FOTO na ordem certa. Itens de foto da referência:
- **Abertura Cozinha:** "Foto da organização geral" (FOTO).
- **Abertura Salão:** "Foto do salão montado" (FOTO).
- **Fechamento Cozinha:** "Foto da válvula de gás desligada" (FOTO, **crítico**), "Foto do estado
  final da cozinha" (FOTO).
- **Controle de Pragas:** "Foto das armadilhas" (FOTO).
- **Segurança Alimentar:** "Foto das etiquetas de validade" (FOTO).

## Erros e invariantes

- **Posse por setor** em toda rota de operador (reusa `chkPosseExecucao`); `empresaId` explícito
  (fora do tenantStore). Nunca `req.user.empresaId`.
- **Foto obrigatória é do servidor** — o concluir rejeita 400 mesmo que o cliente burle a trava.
- **Tamanho** validado no servidor (o dataURL não pode passar da margem do body limit).
- Editar o checklist não afeta execuções passadas (snapshot imutável); a foto pertence à execução.

## Testes

- `backend/checklistConformidade.test.js`: caso FOTO → `conforme: null` (com e sem foto — nunca
  reprova por conteúdo). Os 23 casos anteriores seguem passando.
- Teste da regra de foto-obrigatória no concluir (via o helper que decide "faltam fotos críticas"):
  item FOTO crítico sem foto → bloqueia; com foto → passa; FOTO não-crítico sem foto → passa.
- `comprimirFoto`: a lógica de escala (dado L×A e teto 1280, calcula as dimensões finais) testável
  em `node` sem canvas; a exportação JPEG é verificada manualmente no navegador.

## Fases (para o plano)

- **F1 — Fundação:** enum `FOTO` + `ChecklistFoto` + migration (tabela + append dos itens de foto aos
  templates) + `MODELS_TENANT` + caso FOTO em `avaliarResposta` (+ teste) + FOTO no validador/editor
  de itens (gestor).
- **F2 — Captura:** `comprimirFoto.js` + endpoints de foto do operador + `chkExecJson` com metadata
  + a regra de foto-obrigatória no concluir + UI de captura na execução do operador.
- **F3 — Revisão do gestor:** endpoints `GET /execucoes`, `GET /execucoes/:id`, `GET /fotos/:id` + o
  modal Detalhe da Execução + a seção "Execuções recentes" no Painel.

## Fora do escopo (Fatia 2)

IA de visão (a foto é só prova); múltiplas fotos por item; completude obrigatória para tipos que não
são foto (recurso transversal futuro); motor de alertas (Fatia 3); edição/anotação da foto.
