# Checklist Inteligente — Fatia 3a (Alerta imediato WhatsApp) — Design

**Data:** 2026-07-16 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

A Fatia 1 registra o estado "em alerta" (item crítico não-conforme) e a Fatia 2 adiciona foto.
Falta o disparo — o *"alerta no WhatsApp quando algo sai do padrão"* do pitch. A Fatia 3 (motor
de alertas) foi decomposta em três, por causa dos gaps de infra do PDV:

- **3a — Alerta imediato WhatsApp (esta spec):** on-conclude, item crítico não-conforme → WhatsApp
  na hora. **Zero infra nova** (reusa `zapiEnviarTexto` + `emAlerta`).
- **3b — Agendados (cron):** lembrete antes do horário + boletim semanal. Precisa do agendador que
  o PDV não tem.
- **3c — Email:** email como 2º canal (provider + credenciais).

O `ChecklistNotificacaoConfig` já nasce com espaço para 3b/3c.

## Decisões travadas (com o usuário)

1. **Recorte:** só o alerta imediato no WhatsApp (headline, sem cron nem email).
2. **Destinatários: lista própria** (`ChecklistDestinatario`: nome + whatsapp) na config de
   Notificações — o dono adiciona quem quer (ele mesmo, gerentes). Desacoplado do login.

**Decisões técnicas assumidas:** disparo só na **transição** EM_ANDAMENTO→CONCLUIDA (re-concluir não
re-dispara); **best-effort assíncrono** (não segura a resposta do concluir); a mensagem é uma regra
**pura e testável**; telefone via `foneCanonico`/`foneParaEnvio` (os mesmos do OTP).

## Reuso

`zapiEnviarTexto(numero, texto)` (`backend/zapi.mjs`); `zapiConfigurado()`; `foneCanonico(s)` +
`foneParaEnvio(canon)='55'+canon` (`backend/server.js`); `emAlerta` já calculado no concluir;
`itensSnapshotJson` (títulos/critico) + respostas (`conforme`). Multi-tenant via `MODELS_TENANT`.

## Modelo de dados (3 models novos, multi-tenant)

- **`ChecklistNotificacaoConfig`** (1/empresa, `@@unique([empresaId])`): `alertaImediatoAtivo Boolean
  @default(false)`, `criadoEm`, `atualizadoEm`. (3b/3c adicionam `lembreteAtivo`/`boletimAtivo`/
  `emailAtivo` depois.)
- **`ChecklistDestinatario`**: `nome`, `whatsapp` (dígitos canônicos), `ativo Boolean @default(true)`,
  `criadoEm`, `atualizadoEm`. `@@index([empresaId])`.
- **`ChecklistNotificacaoLog`**: `regra String` ('ALERTA_IMEDIATO'), `canal String` ('WHATSAPP'),
  `destino String` (número), `destinatarioNome String?`, `execucaoId Int?`, `conteudo String @db.Text`,
  `status String` ('ENVIADO'|'FALHOU'), `erro String?`, `criadoEm`. `@@index([empresaId, criadoEm])`.

## Regra pura (mensagem)

`backend/checklistAlerta.js` (novo) — `montarMensagemAlerta({ lojaNome, checklistNome,
funcionarioNome, quando, itensForaDoPadrao }) → string` (itensForaDoPadrao = títulos dos itens
críticos com `conforme===false`). Sem Prisma/Express. Também `itensCriticosNaoConformes(itensSnapshot,
respostas) → string[]` (extrai os títulos), pura e testada.

## Disparo (no concluir)

No `POST /api/public/colaborador/execucoes/:id/concluir`, **depois** do `updateMany` que marca
CONCLUIDA: se `exec.status !== 'CONCLUIDA'` (era EM_ANDAMENTO → é a transição) **e** `emAlerta`,
chama `dispararAlertaImediato(empresaId, execId)` **sem `await`** (fire-and-forget, try/catch próprio
— uma falha nunca toca a resposta do concluir).

`dispararAlertaImediato(empresaId, execId)` (helper no `server.js`, tudo com `empresaId` explícito —
o concluir roda FORA do tenantStore):
1. Lê a `ChecklistNotificacaoConfig`; se `!alertaImediatoAtivo`, sai.
2. Lê a execução (snapshot + respostas), o checklist (nome), o funcionário (nome), a empresa (nome).
3. `itensForaDoPadrao = itensCriticosNaoConformes(...)`. Monta a mensagem.
4. Lê os `ChecklistDestinatario` ativos. Se `!zapiConfigurado()` ou lista vazia, loga FALHOU/nada e sai.
5. Para cada destinatário: `zapiEnviarTexto(foneParaEnvio(foneCanonico(dest.whatsapp)), msg)`, e grava
   um `ChecklistNotificacaoLog` (ENVIADO ou FALHOU com o erro). Um envio que falha não impede os outros.

**Idempotência:** o disparo só ocorre na transição para CONCLUIDA. Re-concluir (execução já CONCLUIDA)
não entra no `if`, então não re-dispara.

## Endpoints (admin, `/api/checklist/notificacoes/*`, dentro do gate — extension injeta empresaId)

- `GET /notificacoes` → `{ config, destinatarios }` (cria a config on-demand se não existir).
- `PUT /notificacoes/config` ← `{ alertaImediatoAtivo }`.
- `POST/PUT/DELETE /notificacoes/destinatarios[/:id]` — CRUD (nome, whatsapp, ativo).
- `GET /notificacoes/historico` → últimos `ChecklistNotificacaoLog` (take 50).
- `GET /notificacoes/previa` → uma mensagem de exemplo (`montarMensagemAlerta` com dados fictícios) —
  para o "Ver prévia" mostrar como o alerta chega.

## Frontend (nova aba "Notificações" no gestor, `Checklist.jsx`)

Aba com: o toggle **"Alerta imediato (WhatsApp)"** (liga/desliga a regra); a **lista de destinatários**
(adicionar nome+WhatsApp, ativar/remover); **"Ver prévia"** (mostra a mensagem de exemplo do
`/previa`); e o **histórico de envios** (de `/historico`: regra, destino, status, quando). Modais/edição
no padrão do arquivo (fecham só pelo botão).

## Erros e invariantes

- **O disparo é best-effort** e assíncrono — nunca quebra nem atrasa o concluir do operador.
- **`zapi` não configurado** → loga FALHOU com motivo claro, não estoura.
- **Multi-tenant**: `dispararAlertaImediato` roda no fluxo do colaborador (FORA do tenantStore) →
  `empresaId` explícito em TODA query. Os endpoints admin de config rodam DENTRO (extension injeta).
- **Nunca `req.user.empresaId`**.
- **Número**: canonicaliza com `foneCanonico` + `foneParaEnvio` (DDI 55) — os mesmos do OTP.

## Testes

- `backend/checklistAlerta.test.js`: `itensCriticosNaoConformes` (só itens críticos com `conforme===false`;
  ignora não-críticos e conformes e null); `montarMensagemAlerta` (contém loja, checklist, quem, e os
  itens fora do padrão; caso sem itens não quebra). Script `node` sem framework.
- `node --check server.js`; build do frontend por fase.

## Fases (para o plano)

- **F1 — Config:** 3 models + migration + `MODELS_TENANT` + endpoints admin (config, destinatários,
  histórico, prévia) + aba Notificações (toggle + lista + prévia + histórico).
- **F2 — Disparo:** `checklistAlerta.js` (`montarMensagemAlerta` + `itensCriticosNaoConformes`, pura +
  teste) + `dispararAlertaImediato` + o gatilho no concluir + envio via `zapi` + o `ChecklistNotificacaoLog`.

## Fora do escopo (3a)

Lembrete antes do horário + boletim semanal (cron → 3b); email (→ 3c); alerta por SMS/push;
personalização do texto da mensagem; deep-link para a execução (a mensagem é informativa; o gestor
abre o PDV).
