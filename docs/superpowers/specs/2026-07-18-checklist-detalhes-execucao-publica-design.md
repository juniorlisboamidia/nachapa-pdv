# Checklist — Ver Detalhes + Execução pública com PIN + QR — Design

**Data:** 2026-07-18 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

Primeira das 3 Ações da lista de checklists (Detalhes → Histórico → Estatísticas). Traz:
a **coluna Ações** na lista, a **página de Detalhes** do checklist (dados + itens + link/QR de
execução), e um **modo de execução público** — link/QR aberto por checklist onde o colaborador
**seleciona o nome → digita um PIN de 4 dígitos → executa**, em paralelo à Área do Colaborador
(login WhatsApp) que já existe.

**Reuso-chave:** o token do colaborador é um JWT `{fid, eid, tipo:'colab'}` validado por
`exigirColaborador`; o PIN vira só uma **forma alternativa de obter esse token**, e a execução
pública **reusa os endpoints `/api/public/colaborador/*`** (iniciar/resposta/foto/concluir) que já
existem. O QR reusa `frontend/src/lib/qr.js` (`matrizQr`) das Etiquetas.

## Decisões travadas (com o usuário)

1. **As duas execuções coexistem:** Área do Colaborador (WhatsApp) + link público/QR com PIN.
2. **PIN de 4 dígitos** no cadastro do colaborador (Ponto Facial › Colaboradores).
3. **Lista de nomes** no link público = quem está **atribuído** ao checklist (mesma regra
   `chkColabAtende` da Área do Colaborador).
4. **Limite de tentativas** no endpoint público (link aberto pede isso).

## Modelo de dados (migration `20260718120000_checklist_publico_pin`)

- `Checklist.publicoToken String? @unique` — token do link público (gerado on-demand).
- `Funcionario.pin String?` — PIN de 4 dígitos (só dígitos). **NUNCA retornado em GET** (redigir em
  toda serialização de funcionário). Guardado como está (PIN operacional de baixa segurança; a
  defesa real é o rate-limit).

## Backend

### Admin (dentro do gate)
- `GET /api/checklist/checklists/:id` (já existe) passa a incluir/gerar o `publicoToken` (cria
  on-demand se null e devolve). OU um `POST /:id/link-publico` que gera/rotaciona. → o front monta
  a URL `<origin>/checklist/publico/<token>`.
- **PIN no cadastro:** o create/update de `Funcionario` (Ponto Facial) aceita `pin` (4 dígitos ou
  vazio p/ remover); nunca devolve o pin nas listagens (redigir). Confirmar todos os pontos que
  serializam `Funcionario` e garantir que o `pin` não vaza.

### Público (fora do gate — empresaId vem do checklist resolvido pelo token)
- `GET /api/public/checklist/:token/bootstrap` → resolve o checklist por `publicoToken`;
  devolve `{ checklist: {id, nome, descricao}, colaboradores: [{id, nome}] }` — colaboradores =
  ativos que `chkColabAtende(checklist, func)` (SEM pin, SEM whatsapp). 404 se token inválido.
- `POST /api/public/checklist/:token/entrar` `{ funcionarioId, pin }` → **rate-limit** por
  funcionário (mapa em memória: N falhas → trava M min); confere o `pin` do funcionário (ativo, da
  loja do checklist); no sucesso emite o **mesmo JWT** `jwt.sign({fid, eid, tipo:'colab'}, ...)` (
  expiração curta, ex.: `6h`) e devolve `{ token, checklistId }`. Erro genérico ("Nome ou PIN
  inválido") pra não vazar quais nomes têm PIN.
- A execução em si **reusa `/api/public/colaborador/*`** com esse token (nada novo no backend de
  execução) — a posse por `chkColabAtende` já garante que a pessoa só executa o que é dela.

## Frontend

### Lista (`AbaChecklists`) — coluna **Ações**
Cada linha ganha ícones: **👁 Ver detalhes** (→ `/checklist/detalhe/:id`), **▶ Executar** (abre o
link público numa nova aba OU vai pro detalhe), e mantém **Editar** e **Excluir**. (Os ícones de
📊 Estatísticas e 🕐 Histórico entram nas próximas fatias — não colocar botão morto agora.)

### Página de Detalhes (`ChecklistDetalhe`, nova, dentro do Layout)
Rota `/checklist/detalhe/:id`. Cabeçalho (nome, categoria, prioridade, recorrência·horário, tempo,
responsáveis) + **Editar** (`?editar`) + **Executar** (abre o link público). Lista de **itens**
(snapshot: título, tipo, crítico, dica). Card **Link público de execução**: a URL
`<origin>/checklist/publico/<token>` + **Copiar** + **QR Code** (canvas via `matrizQr`) +
"gerar/rotacionar" se precisar.

### Página pública de execução (`ChecklistPublico`, nova, FORA do Layout, standalone)
Rota `/checklist/publico/:token` (espelha o padrão do `EtiquetasQuiosque`). Estados:
1. **Bootstrap** (`.../bootstrap`) → mostra o nome do checklist + "Selecione seu nome" (lista de
   colaboradores, avatar com iniciais + função).
2. **PIN** → escolhido o nome, mostra "Digite seu PIN de 4 dígitos" com **teclado numérico**
   (0-9 + apagar, indicador de 4 bolinhas). `POST .../entrar`; erro → mensagem + limpa; trava se
   rate-limited.
3. **Execução** → com o `token` recebido, executa o checklist reusando os endpoints
   `/api/public/colaborador/*` (iniciar → responder itens → foto → concluir). A UI de execução:
   extrair a parte de responder itens de `BonificacaoEu.jsx` (`ExecutarChecklist`/`ItemChecklist`)
   para um componente reusável, OU o `ChecklistPublico` implementa a execução chamando os mesmos
   endpoints. (O plano decide; preferir extrair pra não duplicar.)

## Erros e invariantes

- **Segurança:** o `pin` nunca é serializado em nenhuma resposta; `/entrar` tem rate-limit e
  mensagem genérica; o token emitido é `tipo:'colab'` de expiração curta; a posse por
  `chkColabAtende` limita o que a pessoa executa (mesma trava da Área do Colaborador).
- **Multi-tenant:** rotas públicas resolvem `empresaId` pelo checklist do token; `empresaId`
  explícito em toda query. `chkColabAtende` filtra os elegíveis por loja.
- Não quebrar a Área do Colaborador (WhatsApp OTP) nem a execução existente.
- `publicoToken` gerado com `randomBytes` (não adivinhável, `@unique`).

## Testes

- Regra pura de PIN (`backend/checklistPin.js`?): validar formato (4 dígitos), normalizar. Teste
  node. (Rate-limit e verificação em si são de integração — smoke.)
- `node --check server.js`; `npm run build`.

## Fases (para o plano)

- **T1 — Backend:** migration (`publicoToken`, `pin`) + `bootstrap`/`entrar` (rate-limit + token) +
  `publicoToken` no GET do checklist + redigir `pin` nas serializações de funcionário.
- **T2 — PIN no cadastro:** backend aceita `pin` no funcionário + input no cadastro (Ponto Facial ›
  Colaboradores).
- **T3 — Lista Ações + Detalhes + QR:** coluna Ações; `ChecklistDetalhe` (dados + itens + link +
  QR/copiar).
- **T4 — Execução pública:** `ChecklistPublico` (bootstrap → seleciona nome → teclado PIN → executa
  reusando os endpoints do colaborador).

## Fora do escopo

Histórico e Estatísticas (próximas Ações); recuperação de PIN esquecido; login público sem PIN.
