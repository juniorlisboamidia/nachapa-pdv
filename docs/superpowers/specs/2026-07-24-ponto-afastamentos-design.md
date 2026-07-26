# Afastamentos & Troca de Folga (Ponto Facial) — Design

**Goal:** Registrar ausências por período (férias, atestado, licença, folga abonada, outro) e trocas de folga entre colaboradores, para que esses dias **deixem de contar como falta** no espelho de ponto e, por consequência, **parem de penalizar a assiduidade na Bonificação**.

**Architecture:** Um model novo `PontoAusencia` (afastamento por período) que o motor do espelho (`calcularEspelho`) consulta ao classificar cada dia. Dia dentro de um afastamento vira **"abonado"** (neutro), tratado como uma folga: sem batida → não é falta e não conta previsto; com batida → a batida vence (dia trabalhado, igual à *folga trabalhada* já existente). A Bonificação não muda — como abonado não é falta, o Fechamento não gera ocorrência de falta. Toda a data-math em fuso BR fixo (UTC-3), por **dia de expediente** (corte 05:00), igual ao resto do módulo de ponto.

**Tech Stack:** Backend Express 5 ESM (`backend/server.js`), Prisma 7 + `@prisma/adapter-pg`, Postgres 16. Frontend React 19 + Vite. App PDV/Operação (`nachapa-pdv`), banco `operacao`, deploy `bash deploy.sh` (roda `migrate deploy`).

---

## Contexto e problema

O sistema de ponto **não tem** nenhum conceito de ausência (verificado: sem model/campo de férias/afastamento/licença/justificativa no schema ou no backend). Consequência hoje:

- O espelho (`calcularEspelho`, `backend/server.js`) classifica um **dia de jornada de trabalho sem batida** como **`falta`** (incrementa `tot.faltas`).
- O Fechamento (`POST /api/ponto/fechamento/sincronizar`) transforma as faltas do espelho em **ocorrências de Assiduidade (−25%)** na Bonificação.
- Logo: **férias, atestado e trocas de folga viram uma sequência de faltas** e penalizam o colaborador no bônus. O único "jeito" atual é gambiarra (não sincronizar a pessoa, ou apagar as ocorrências à mão).

A `Funcionario.folgaSemana` e a folga na `Jornada` são **por dia da semana fixo** (0=dom..6=sáb) — não representam um **período de datas** nem uma troca pontual ("essa semana").

## Decisões travadas (brainstorming)

1. **Tipos:** afastamento genérico com `tipo` — **FERIAS / ATESTADO / LICENCA / FOLGA_ABONADA / OUTRO**.
2. **Efeito no cálculo:** **sempre neutro (abonado)** — qualquer afastamento registrado não é falta, não é dia trabalhado, não penaliza a assiduidade. (Se um dia quiser descontar um atestado, o gestor lança à mão na Bonificação, como já é possível.)
3. **Quem registra:** **só o gestor**, direto, **sem** fluxo de solicitação/aprovação.
4. **Colaborador vê:** **sim** — no espelho dele os dias saem como "Férias/Abonado" (não falta) e o painel "Seu dia" mostra "Você está de férias até dd/mm".
5. **Troca de folga:** **atalho dedicado** que pareia as duas pessoas e cria os dois registros de "Folga abonada" de uma vez.
6. **Borda "bateu ponto em dia abonado":** a **batida vence** (conta como trabalhado, igual à *folga trabalhada* de hoje).

---

## 1. Modelo de dados

**`enum AusenciaTipo` (Prisma):** `FERIAS`, `ATESTADO`, `LICENCA`, `FOLGA_ABONADA`, `OUTRO`.

**`model PontoAusencia`:**
- `id Int @id @default(autoincrement())`
- `empresaId Int`
- `funcionarioId Int`
- `tipo AusenciaTipo`
- `dataInicio DateTime` — instante **05:00 BR** do primeiro dia de expediente do período.
- `dataFim DateTime` — instante **05:00 BR** do último dia (inclusivo). Afastamento de 1 dia ⇒ `dataInicio == dataFim`.
- `observacao String?`
- `trocaGrupo String?` — preenchido nas **duas** pontas de uma troca de folga (`null` num afastamento comum). Permite exibir/excluir a troca como uma unidade.
- `criadoEm DateTime @default(now())`, `atualizadoEm DateTime @updatedAt`
- `@@index([empresaId, funcionarioId])`, `@@index([empresaId, dataInicio, dataFim])`

**Por que 05:00 BR:** alinha com o "dia de expediente" (corte `EXP_CUTOFF_MIN`/05:00) que o espelho e o painel já usam. Assim o teste "dia D está no período?" é uma comparação direta de instantes (ver §2), sem ambiguidade de fuso.

**`MODELS_TENANT`** (`backend/server.js` ~52): adicionar `'pontoAusencia'` (a extension multi-tenant injeta `empresaId` nas rotas admin).

## 2. Motor — módulo puro + espelho

**Módulo puro `backend/pontoAusencia.js`** (sem Prisma/Express, padrão dos `checklist*.js`):
- `ausenciaDoDia(diaMs, ausencias)` — dado o instante 05:00-BR de um dia (`diaMs`) e uma lista `[{ tipo, iniMs, fimMs }]`, devolve a **primeira** ausência que cobre o dia (`iniMs <= diaMs && diaMs <= fimMs`) ou `null`. Pura e testável.
- (Opcional, se ajudar o endpoint) `diasDoPeriodo` / helpers de normalização — só se necessário.

**`calcularEspelho(funcionarioId, ano, mes)`** (`backend/server.js` ~6875) — mudanças mínimas:
1. Carregar os afastamentos que **cruzam o mês**: `PontoAusencia` do `funcionarioId` com `dataFim >= (05:00 do dia 1)` e `dataInicio <= (05:00 do último dia)`. Mapear para `[{ tipo, iniMs, fimMs }]`.
2. No loop de dias, calcular `abono = ausenciaDoDia(brToUtcMs(ano, mes-1, d, 5, 0), ausencias)`.
3. **Se `abono`:** forçar o dia a ser tratado como **folga** (`folga = true`, `previstoMin = 0`, `entradaPrevMs = null`) — pula o cálculo de previsto/atraso/falta. A situação é rotulada pelo abono:
   - **com batida** (entrada+saída) → `situacao = 'abonado_trabalhado'`, conta `trabalhadoMin`/`extraMin`/`noturnoMin` e `tot.diasTrabalhados++` (idêntico ao ramo `folga_trabalhada`).
   - **sem batida** → `situacao = 'abonado'`. Nada somado (nem falta, nem previsto, nem trabalhado). Saldo do dia = 0.
4. Cada linha do espelho carrega `ausenciaTipo: abono?.tipo || null` (para o rótulo no front).

**Invariante-chave:** um dia abonado **nunca** incrementa `tot.faltas` nem gera `faltaMin`. É o que faz a Bonificação parar de penalizar.

## 3. Bonificação — nenhuma mudança

O Fechamento/sincronizar lê o espelho (faltas/atrasos) como fonte. Como abonado não é falta, **nenhum código novo** é necessário — os dias de afastamento simplesmente não viram ocorrência de Assiduidade. (A ocorrência manual "Atestado" −5% continua existindo para quem quiser usá-la à parte.)

## 4. Backend — endpoints (admin, dentro do gate; `empresaId` injetado pela extension)

- `GET /api/ponto/ausencias?funcionarioId=&de=&ate=` — lista (join do nome do funcionário; ordena por `dataInicio desc`). Agrupa/expõe `trocaGrupo` para o front parear trocas.
- `POST /api/ponto/ausencias` `{ funcionarioId, tipo, dataInicio, dataFim, observacao? }` — cria. Datas chegam `YYYY-MM-DD` e são convertidas para 05:00-BR via `brToUtcMs(y, mo, d, 5, 0)`. Valida: `tipo` no enum, `dataFim >= dataInicio`, funcionário existe/ATIVO. **Avisa** (não bloqueia) se sobrepõe outro afastamento da mesma pessoa.
- `PUT /api/ponto/ausencias/:id` — edita (tipo/período/obs). Não permite mexer no par de uma troca por aqui (edição de troca = excluir e refazer, no v1).
- `DELETE /api/ponto/ausencias/:id` — remove. Se tiver `trocaGrupo`, **remove as duas pontas** (a troca é atômica).
- `POST /api/ponto/ausencias/troca` `{ aFuncionarioId, aData, bFuncionarioId, bData }` — cria **duas** `PontoAusencia` `tipo=FOLGA_ABONADA` de 1 dia (A folga em `aData`, B folga em `bData`), ambas com o mesmo `trocaGrupo` (`randomBytes` base64url). Valida: A ≠ B, datas válidas.

Erros de regra: `throw { http, msg }` (padrão do projeto). Rotas espelham o bloco de `/api/ponto/jornadas` (`backend/server.js` ~6663).

## 5. Frontend — Gestor (Ponto Facial)

**Nova aba "Afastamentos"** no Ponto Facial:
- `TABS` em `frontend/src/pages/PontoFacial.jsx` += `{ id: 'afastamentos', label: 'Afastamentos', sub: 'Férias, atestados e trocas de folga' }`.
- Item na sidebar (`frontend/src/components/Sidebar.jsx`, grupo Ponto Facial) → `/rh/ponto-facial/afastamentos`.
- Componente `Afastamentos` (em `PontoFacial.jsx` ou arquivo próprio): lista (colaborador · tipo · período · obs) com filtros (colaborador/período) e ações editar/excluir; **trocas aparecem pareadas** ("Troca de folga: Maria — qui 24/07 ↔ Gabrielly — ter 22/07"); botões **"+ Novo afastamento"** (modal: colaborador via `GET /funcionarios?status=ATIVO`, tipo, período, obs) e **"Troca de folga"** (modal: A colaborador+dia, B colaborador+dia). Reusa `ConfirmDialog`, `Toast`, estilos do módulo. Modais fecham só por botão (regra do projeto).

**Espelho do gestor** (aba Espelho, `PontoFacial.jsx`): o mapa de situação ganha `abonado`/`abonado_trabalhado` (rótulo = tipo do afastamento: "Férias"/"Atestado"/"Folga", cor neutra/azul) no lugar de "Falta".

## 6. Frontend — Colaborador (Área do Colaborador)

- **`me`** (`GET /api/public/colaborador/me`, `backend/server.js` ~2009): incluir os dias abonados no `ponto.marcacoes` (o filtro atual descarta dias sem batida — passa a incluir `situacao 'abonado'`/`'abonado_trabalhado'`, carregando `ausenciaTipo`); e enriquecer `pontoHoje` (já existe) com `ausencia: { tipo, ate } | null` quando hoje cai num afastamento.
- **Espelho** (aba Ponto, `BonificacaoEu.jsx` `TabPonto`, mapa `SIT`): adicionar `abonado`/`abonado_trabalhado` com rótulo "Férias/Abonado" (não falta).
- **"Seu dia"** (`SecaoSeuDia`, Início): se `pontoHoje.ausencia`, a linha do ponto mostra **"Você está de férias até dd/mm"** (usa o tipo; "de folga hoje" para FOLGA_ABONADA de 1 dia).

## 7. Fora do escopo (v1)

Feriados da loja (loja-wide, outro conceito), meio-período/horas, fluxo de solicitação/aprovação pelo colaborador, anexar arquivo do atestado. Edição do par de uma troca (v1: excluir e refazer).

## 8. Testes

- `backend/pontoAusencia.test.js` (padrão `node` sem framework): `ausenciaDoDia` — dia dentro/fora do período, borda início/fim inclusivos, período de 1 dia, lista vazia, múltiplos afastamentos.
- Casos do espelho (script/rota exercitando `calcularEspelho` com afastamentos mockados, ou teste da regra): **dia abonado sem batida ⇒ não é falta e não soma previsto**; **dia abonado com batida ⇒ trabalhado (não falta)**; **troca (dois FOLGA_ABONADA) ⇒ nenhuma falta nos dois**.
- Verificação: `node backend/pontoAusencia.test.js`, `node --check backend/server.js`, `npm run build` (frontend).

## 9. Migration & deploy

- Migration `backend/prisma/migrations/20260724120000_ponto_ausencia/migration.sql` (timestamp > último `20260719140000`): `CREATE TYPE "AusenciaTipo"`, `CREATE TABLE "PontoAusencia"` (multi-tenant: `empresaId INTEGER NOT NULL` + FK→`Empresa(id)`; FK→`Funcionario(id)` `ON DELETE CASCADE`), índices. Gerar local com `npx prisma migrate dev --name ponto_ausencia`, revisar o SQL, `npx prisma generate` (o PDV **não** regenera o client sozinho no migrate dev). Sem backfill (tabela nova).
- Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh` (git pull → migrate deploy → generate → build → restart).

## 10. Invariantes e bordas

- **Fuso:** tudo em BR fixo (`brToUtcMs`/`brFields`); nunca `new Date(y,mo,d,h,m)` local (VPS = UTC). Dia = **dia de expediente** (05:00).
- **Abonado ≠ falta** (a razão da feature). Testar explicitamente.
- **Batida vence** num dia abonado (folga trabalhada); não perde o trabalho real.
- **Troca é atômica:** criar cria as duas pontas; excluir remove as duas (por `trocaGrupo`).
- **Multi-tenant:** `pontoAusencia` em `MODELS_TENANT`; rotas admin dentro do gate (extension injeta `empresaId`); nunca `req.user.empresaId`.
- **Sem sobreposição obrigatória:** sobreposição de afastamentos da mesma pessoa **avisa**, não bloqueia (o gestor decide).
