# Checklist — Wizard (4 etapas) + Tolerância — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Criação/edição do checklist em wizard de 4 etapas (Informações → Itens → Agendamento → Revisão) + Tolerância por checklist (o alerta de atraso dispara em horário+tolerância) + campos novos (tempo estimado, dica de execução, instrução da gestão).

**Architecture:** Backend (Fatia A): regra pura `atrasado` no lugar de `estaNaJanelaDeLembrete`; `chkDadosChecklist`/`chkNormalizarItens` aceitam os campos novos; migration `tempoEstimadoMin`; o agendador usa `atrasado`. Frontend (Fatia B): `ChecklistEditor` vira wizard; Área do Colaborador exibe os campos; aba Configurações perde o "minutos antes".

## Global Constraints

- O alerta de atraso dispara em **horário + toleranciaMin** (por checklist, em `recorrenciaConfig`), NÃO mais "minutos antes" global.
- Agendador FORA do tenantStore → `empresaId` explícito; dedup 1x/dia; best-effort; horário em BR via `brToUtcMs`/`brFields`.
- Mantém **atribuição por função/colaborador** (fatia anterior) — o "Setores" da referência é o seletor "Atribuir a". **Foto sem IA** (sem prompt).
- Não quebrar a execução existente (itens antigos sem `dica`/`instrucaoAlerta` → nada aparece); o modo FUNCAO/COLABORADOR intacto.
- Commit por task na `main`, sem push (controlador dá push). Subagentes: NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task A1: Regra pura — `atrasado`

**Files:**
- Modify: `backend/checklistLembrete.js` (troca `estaNaJanelaDeLembrete` por `atrasado`)
- Modify: `backend/checklistLembrete.test.js`

**Interfaces:**
- Produces: `atrasado(agoraMs, horarioMs, toleranciaMin) → bool`. Remove `estaNaJanelaDeLembrete`.

- [ ] **Step 1:** Substituir `estaNaJanelaDeLembrete` por:
```js
// O checklist atrasou? `agora` já passou de (horário + tolerância)? (ms). tolerância >= 0.
// Sem teto — o dedup (1x/dia) evita repetir. tolerância ausente/inválida = 0 (dispara no horário).
export function atrasado(agoraMs, horarioMs, toleranciaMin) {
  if (!Number.isFinite(agoraMs) || !Number.isFinite(horarioMs)) return false;
  const alvo = horarioMs + Math.max(0, Number(toleranciaMin) || 0) * 60000;
  return agoraMs >= alvo;
}
```
`montarMensagemLembrete`/`TEMPLATE_PADRAO` ficam iguais.
- [ ] **Step 2:** No teste, trocar os casos de janela pelos de `atrasado`: antes do horário (tol 0) → false; exatamente no horário (tol 0) → true; `horário + tol*60000 - 1` → false; `horário + tol*60000` → true; tolerância ausente/negativa tratada como 0; `horarioMs` não-finito → false. (Manter os testes de `montarMensagemLembrete`.)
- [ ] **Step 3:** `cd backend && node checklistLembrete.test.js`. Commit.

---

### Task A2: `chkDados`/itens + migration + agendador

**Files:**
- Modify: `backend/prisma/schema.prisma` (`Checklist.tempoEstimadoMin Int?`)
- Create: `backend/prisma/migrations/20260717140000_checklist_tempo/migration.sql`
- Modify: `backend/server.js` (`chkDadosChecklist`, `chkNormalizarItens`, `dispararLembretesLoja`, import)

**Interfaces:**
- Consumes: `atrasado` (A1). Produces: create/PUT do checklist aceitam `tempoEstimadoMin` + `recorrenciaConfig.toleranciaMin`; itens preservam `config.dica`/`config.instrucaoAlerta`.

- [ ] **Step 1 (schema+migration):** `Checklist` += `tempoEstimadoMin Int?`. Migration: `ALTER TABLE "Checklist" ADD COLUMN "tempoEstimadoMin" INTEGER;`. Aplicar: `cd backend && npx prisma migrate deploy && npx prisma generate`.
- [ ] **Step 2 (`chkDadosChecklist`):** adicionar ao retorno `tempoEstimadoMin` (`Number.isFinite(parseInt(body.tempoEstimadoMin))` e ≥0, senão null; fallback do registro atual) e no `recorrenciaConfig` preservar `toleranciaMin` (`clamp 0–240`, default 0) junto de `diasSemana`/`horarioLimite`.
- [ ] **Step 3 (`chkNormalizarItens`):** ler o `chkNormalizarItens` atual; no `config` de cada item, preservar `dica` (`String(...).slice(0,300)`) e `instrucaoAlerta` (`slice(0,300)`) quando vierem — sem quebrar os campos por-tipo existentes (min/max, opções, unidade).
- [ ] **Step 4 (agendador):** import `atrasado` no lugar de `estaNaJanelaDeLembrete`; em `dispararLembretesLoja`, trocar a checagem da janela por `if (!atrasado(Date.now(), horarioMs, c.recorrenciaConfig?.toleranciaMin)) continue;` (o `horarioMs` já é calculado via `brToUtcMs`). Remover o uso de `cfg.lembreteMinutosAntes`.
- [ ] **Step 5:** `node --check server.js`. Commit.

---

### Task B1: `ChecklistEditor` → wizard de 4 etapas

**Files:**
- Modify: `frontend/src/pages/Checklist.jsx` (`ChecklistEditor` + CSS `.wz-*` se precisar em global.css)

**Interfaces:**
- Consumes: os campos do backend (A2): `tempoEstimadoMin`, `recorrenciaConfig.toleranciaMin`, `config.dica`/`config.instrucaoAlerta`; `atribuicaoTipo`/`funcoes`/`funcionarioIds` (fatia anterior); `MODELOS`/tipos de item já existentes.

- [ ] **Step 1:** Ler o `ChecklistEditor` atual inteiro. Adicionar estado `etapa` (1–4) + `f.tempoEstimadoMin` + `f.recorrenciaConfig.toleranciaMin` no init. Manter todo o resto (itens, atribuição, recorrência).
- [ ] **Step 2 (stepper):** barra de 4 passos numerados (atual em destaque, passos concluídos em verde) + navegação "Voltar"/"Próximo"; "Salvar checklist" só na etapa 4; "Cancelar" fecha. Validação por etapa: nome obrigatório p/ sair da 1; item sem título barrado na 2 (o `salvar` já valida).
- [ ] **Step 3 (Etapa 1 — Informações):** Nome, Categoria, **Tempo estimado (min)** (input opcional), Descrição, **Prioridade** (3 botões segmentados Baixa/Média/Alta), **Atribuir a** (o seletor Função/Colaborador que já existe — mover pra cá).
- [ ] **Step 4 (Etapa 2 — Itens):** a lista de itens + o form "Adicionar item" que já existem, movidos pra esta etapa + os campos novos por item: **Dicas para execução** (`config.dica`) e **Instruções da gestão para alertas** (`config.instrucaoAlerta`). Foto sem IA (sem prompt).
- [ ] **Step 5 (Etapa 3 — Agendamento):** o bloco de recorrência (Diário/Dias da semana/Sem agendamento) + Dias + **Horário de execução** (`horarioLimite`) que já existem + **Tolerância (min)** (`recorrenciaConfig.toleranciaMin`, input novo ao lado do horário).
- [ ] **Step 6 (Etapa 4 — Revisão):** resumo (nome, categoria, nº itens, horário) + lista dos itens (nome + tipo) + "Salvar checklist".
- [ ] **Step 7 (salvar):** o `body` inclui `tempoEstimadoMin` + `recorrenciaConfig` com `toleranciaMin` + os `config.dica`/`config.instrucaoAlerta` nos itens (+ o que já mandava). `npm run build`. Commit.

---

### Task B2: Área do Colaborador + aba Configurações

**Files:**
- Modify: `frontend/src/pages/BonificacaoEu.jsx` (execução — exibir os campos)
- Modify: `frontend/src/pages/Checklist.jsx` (`AbaConfiguracoes` — remover "minutos antes")

**Interfaces:** Consumes `config.dica`/`config.instrucaoAlerta` (por item) e `tempoEstimadoMin` (no checklist) que o backend passa ao operador.

- [ ] **Step 1:** Ler o `ExecutarChecklist`/aba Checklists em `BonificacaoEu.jsx`. Exibir o **tempo estimado** do checklist (se houver) no cabeçalho/cartão; a **dica** (`item.config.dica`) como texto de apoio abaixo do item; e a **instrução da gestão** (`item.config.instrucaoAlerta`) quando o item ficar **não-conforme/fora da regra** (destaque, ex.: caixa de aviso).
- [ ] **Step 2:** Confirmar que o snapshot/execução do operador já traz o `config` do item (se não trouxer a `dica`/`instrucaoAlerta`, ajustar o que o backend devolve na execução — mas o snapshot já inclui `config`). Sem quebrar itens antigos (campos ausentes → nada).
- [ ] **Step 3 (Configurações):** na `AbaConfiguracoes`, remover o input "minutos antes" e seu label (a tolerância agora é por checklist, na etapa de agendamento). Manter toggle + template + destinatários.
- [ ] **Step 4:** `npm run build`. Commit.

## Verificação final

`node backend/checklistLembrete.test.js`; `node --check backend/server.js`; `npm run build`; o wizard cria/edita em 4 etapas com tolerância; o alerta de atraso dispara em horário+tolerância; o colaborador vê tempo/dica/instrução; a aba Configurações não tem mais "minutos antes".
