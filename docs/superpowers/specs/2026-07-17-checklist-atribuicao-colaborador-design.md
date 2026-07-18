# Checklist — Atribuição dupla (Função OU Colaborador) — Design

**Data:** 2026-07-17 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

O checklist é atribuído hoje **por função** (`Checklist.funcoes String[]`, casado com
`Funcionario.funcao`). Para o **Lembrete de atraso** (Fatia seguinte) cobrar a pessoa certa,
função dilui a responsabilidade (3 auxiliares → ninguém assume). O usuário quer poder atribuir
a **colaborador(es) específico(s)**, mantendo a opção por função quando fizer sentido.

Esta fatia adiciona um **modo de atribuição por checklist**: `FUNCAO` (como hoje) OU
`COLABORADOR` (pessoas específicas). É pré-requisito do Lembrete.

## Decisões travadas (com o usuário)

1. **Os dois modos coexistem**, escolhidos por checklist no editor (Função OU Colaborador).
2. **1 ou mais** colaboradores por checklist no modo COLABORADOR.
3. Colaboradores vêm do cadastro existente (Ponto Facial) — sem cadastro novo.

## Modelo de dados

`Checklist` ganha (migration `20260717120000_checklist_atribuicao_colaborador`):
- `atribuicaoTipo String @default("FUNCAO")` — `FUNCAO | COLABORADOR`.
- `funcionarioIds Int[] @default([])` — ids de `Funcionario` (modo COLABORADOR).

`funcoes String[]` continua (modo FUNCAO). O checklist usa **um** dos dois conforme `atribuicaoTipo`.

## Backend

**Ponto único de verdade** (perto de `chkFuncaoAtende`):
```js
function chkColabAtende(checklist, func) {
  if (checklist.atribuicaoTipo === 'COLABORADOR')
    return Array.isArray(checklist.funcionarioIds) && checklist.funcionarioIds.includes(func.id);
  return chkFuncaoAtende(checklist.funcoes, func.funcao);
}
```
- **Listagem do operador** (`/public/colaborador/checklists`): remove o early-return por função
  (um colaborador SEM função ainda vê checklists COLABORADOR atribuídos a ele); filtra por
  `chkColabAtende(c, func)`.
- **Posse** (`chkAbrirExecucao`, `chkPosseExecucao`): trocam `chkFuncaoAtende(...)` por
  `chkColabAtende(checklist, func)`.
- **`chkDadosChecklist`**: saneia `atribuicaoTipo` (default FUNCAO) + `funcionarioIds` (Int[],
  dedup, teto 50); `funcoes` continua. Ambos são gravados (o modo decide qual vale).
- **`/api/checklist/painel`**: `linha()` inclui `atribuicaoTipo` e um **`responsavel`** já pronto
  para exibir — FUNCAO → `funcoes.join(', ')`; COLABORADOR → nomes resolvidos dos
  `funcionarioIds` (uma query de funcionários no handler, map id→nome/apelido).

## Frontend

**Editor de checklist** (`ChecklistEditor`): um seletor de **modo** ("Atribuir por: Função /
Colaborador"). No modo Função → os chips de função de hoje. No modo Colaborador → chips da equipe
(`GET /api/funcionarios?status=ATIVO`, mostra nome + função), multi-seleção em `funcionarioIds`.
Salva `atribuicaoTipo` + `funcoes` + `funcionarioIds`.

**Painel** (`AbaPainel`): a coluna **"Funções"** da tabela "Meus checklists" vira **"Responsável"**,
mostrando o `responsavel` que o backend devolve (funções ou nomes). As linhas das colunas
(Próximos/Sem agendamento) idem, quando exibem os responsáveis.

**Área do Colaborador:** nenhuma mudança de UI — o backend passa a incluir os checklists
COLABORADOR atribuídos à pessoa; o operador só vê os dele.

## Erros e invariantes

- Rotas de colaborador FORA do tenantStore → `empresaId` explícito; posse por `chkColabAtende`.
- `atribuicaoTipo` inválido → default FUNCAO (sem 500).
- Checklist COLABORADOR com `funcionarioIds: []` = ninguém (paridade com `funcoes: []`).
- Não quebrar o casamento por função existente (modo FUNCAO idêntico ao de hoje).

## Testes

- `chkColabAtende` é lógica pura sobre `{atribuicaoTipo, funcionarioIds, funcoes}` × `{id, funcao}`
  → dá pra testar em node (extrair ou testar via `chkFuncaoAtende` já testado + os casos novos).
  Mínimo: COLABORADOR com id na lista = true; fora = false; `[]` = false; FUNCAO delega ao
  casamento de função.
- `node --check server.js`; `npm run build`.

## Fases (para o plano — execução direta + review)

- Schema + migration (`atribuicaoTipo`/`funcionarioIds`).
- Backend: `chkColabAtende` + listagem/posse + `chkDadosChecklist` + `responsavel` no painel.
- Frontend: seletor de modo + picker de colaboradores no editor; coluna "Responsável" no painel.

## Fora do escopo

O Lembrete de atraso (Fatia 2). Reatribuição em massa; histórico de quem era responsável.
