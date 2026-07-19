# Etiquetas — Melhorias do quiosque (link sem senha) + admin Itens — Design

**Data:** 2026-07-19 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

Melhorias no **quiosque de etiquetas** (`EtiquetasQuiosque.jsx`, link sem senha da cozinha) e alguns
ajustes na aba admin **Etiquetas › Itens** (`AbaItens` em `Etiquetas.jsx`), a partir do uso real. Sem
migration (tudo reusa modelos existentes).

## Decisões travadas (com o usuário)

1. Lista de itens do quiosque: **lista única + badge de tipo**, ordenada por tipo (**Produção própria
   primeiro**) e depois por nome.
2. Quiosque ganha **fila de impressão** (adicionar à fila → imprimir sequência) **+ "Imprimir agora"**,
   ambos com **campo de cópias** — espelhando o admin Itens.
3. Responsável ("quem manipulou") = **seleção da equipe interna**, **sem entregadores**. No quiosque já
   é seleção; no **admin Itens passa de digitado → selecionável**.
4. Conservação **pré-selecionada** quando o item tem `conservacaoPadrao` cadastrado.
5. Remover a mensagem **"Lote de exemplo (—) — o código real sai ao imprimir."** (está no admin).

## Estado atual (mapeado)

- `Insumo.tipo` (`TipoInsumo`: INGREDIENTE / PRODUCAO_PROPRIA / BEBIDA / HORTIFRUTI / EMBALAGEM /
  ACOMPANHAMENTO / OPERACIONAL). Etiquetáveis (`ETIQUETA_TIPOS_INSUMO`, server.js): INGREDIENTE,
  PRODUCAO_PROPRIA, HORTIFRUTI, ACOMPANHAMENTO, BEBIDA. Rótulos/badges já existem em `Insumos.jsx`
  (`TIPOS`), mas **não** ligados a Etiquetas.
- **Bootstrap** `GET /api/public/etiquetas/:token/bootstrap`: `itens[]` = `{insumoId, nome,
  conservacaoPadrao, validadeDias}` — **sem `tipo`**. `funcionarios[]` = `{id, nome, presente}` (só
  ATIVO, ordenado por "no turno"). `regras`, `config`.
- **Quiosque** hoje: lista alfabética simples; 2ª tela = conservação (botões, **não** pré-selecionada),
  responsável (botões, todos os ATIVOs), **sem cópias**, **um** botão "Imprimir etiqueta" (sempre 1
  cópia). **Sem fila.** `pendente` = 1 etiqueta já registrada cuja impressão BLE falhou (retry do mesmo
  lote) — mantém.
- **Admin Itens** (`AbaItens`): tem a **fila** completa (`fila`/`adicionarFila`/`imprimirSequencia`/UI
  "Sequência de impressão") + "Imprimir agora" + campo **Cópias**. Responsável = **input de texto
  livre** (`sel.responsavelNome`). Mensagem "Lote de exemplo (—)" na prévia.
- **`EtiquetaItemConfig.conservacaoPadrao`** já vem no bootstrap por item.
- **Entregadores**: são model separado (`Motoboy`), **não** entram em `Funcionario` — a lista já é
  interna por construção. `Funcionario.funcao` é string livre (não enum).
- **BUG achado:** o quiosque (`EtiquetasQuiosque.jsx`) usa um `CONS_LABEL` **antigo** ('Resfriado' pros
  dois resfriados, 'Ambiente') enquanto o admin usa o novo ('Refrigerado'/'Resfriado'/'Ambiente Seco'/
  'Produto aberto'). Como o quiosque desenha `conservacaoLabel` a partir do seu mapa, **a etiqueta
  impressa pela cozinha sai com o rótulo errado**. Vamos unificar.

## Mudanças

### A. Rótulos compartilhados (corrige o bug) — `frontend/src/lib/etiquetaLabels.js` (novo)
Exporta:
- `CONS_LABEL` = { CONGELADO:'Congelado', RESFRIADO_0_4:'Refrigerado', RESFRIADO_4_6:'Resfriado',
  AMBIENTE:'Ambiente Seco', DESCONGELADO:'Descongelado', ABERTO:'Produto aberto' } (o **correto**, do
  admin).
- `TIPO_LABEL` = { PRODUCAO_PROPRIA:'Produção própria', INGREDIENTE:'Ingrediente',
  ACOMPANHAMENTO:'Acompanhamento', HORTIFRUTI:'Hortifruti', BEBIDA:'Bebida', EMBALAGEM:'Embalagem',
  OPERACIONAL:'Operacional' }.
- `TIPO_BADGE` = { PRODUCAO_PROPRIA:'badge-blue', INGREDIENTE:'badge-orange', ACOMPANHAMENTO:'badge-red',
  HORTIFRUTI:'badge-green', BEBIDA:'badge-yellow', ... } (reusa as classes de badge do app).
- `TIPO_ORDEM` = { PRODUCAO_PROPRIA:0, INGREDIENTE:1, ACOMPANHAMENTO:2, HORTIFRUTI:3, BEBIDA:4 } (default
  99 pros demais).
`EtiquetasQuiosque.jsx` e `Etiquetas.jsx` passam a importar `CONS_LABEL` daqui (removendo os mapas
locais divergentes) — o quiosque volta a rotular a conservação igual ao resto do sistema.

### B. Backend — bootstrap + registrar
- Bootstrap: incluir **`tipo`** no `select` do insumo e no `itens[]` (`{insumoId, nome, tipo,
  conservacaoPadrao, validadeDias}`).
- Bootstrap `funcionarios`: **excluir entregadores** por segurança (o campo `funcao` é texto livre;
  filtrar fora quem tem `funcao` casando `/entregador|motoboy/i`). Motoboys já não entram (model
  separado) — é só cinto-suspensório.
- `POST /registrar` (quiosque): já aceita `quantidade` (cópias) — nada a mudar no backend (o front
  passa a mandar o valor escolhido em vez de fixo 1).

### C. Quiosque — lista de itens (`EtiquetasQuiosque.jsx`)
- Ordenar `itens` por `(TIPO_ORDEM[tipo], nome)`. Cada item mostra o nome + um **badge do tipo**
  (`TIPO_LABEL`/`TIPO_BADGE`). Busca por nome mantém.

### D. Quiosque — 2ª tela (item selecionado), redesenho
- **Conservação pré-selecionada:** ao abrir um item, se `item.conservacaoPadrao` existir, já vem
  marcada; senão, vazia.
- **Cópias:** novo campo numérico (1–50, default 1).
- **Ações:** **"Imprimir agora"** (um item, direto) **+ "Adicionar à fila"** (mesmo padrão do admin).
- **Fila de impressão:** porta o modelo do admin — estado `fila` (lista de specs a imprimir, ainda NÃO
  registradas), `adicionarFila`, `removerDaFila`, `limparFila`, **"Imprimir sequência"** (registra+
  imprime item a item, para no 1º erro sem pular, remove da fila o que já saiu — igual `imprimirSequencia`
  do admin). Cada linha da fila: nome · conservação · N×. `pendente` (retry BLE do item avulso) mantém.
- Responsável: continua seleção (grid), agora **sem entregadores** (backend já filtra).
- Layout mais limpo: item escolhido no topo (com "← trocar item"), depois Conservação, Responsável,
  Cópias, os 2 botões de ação, e a Fila abaixo. Mantém o "Vence em … (N dias)".

### E. Admin Itens (`AbaItens` em `Etiquetas.jsx`)
- **Responsável:** trocar o input de texto por um **select da equipe interna** (busca `GET
  /api/funcionarios?status=ATIVO`, exclui entregadores; a escolha preenche `sel.responsavelNome` com o
  nome — o backend admin continua recebendo `responsavelNome`, sem mudança). Mantém preservação entre
  trocas de item.
- **Remover** a mensagem "Lote de exemplo (—) — o código real sai ao imprimir." da prévia.

## Erros e invariantes

- **Multi-tenant:** bootstrap/registrar já resolvem `empresaId` pelo token; admin dentro do gate. `pin`
  nunca sai.
- **Servidor manda na validade/lote:** o quiosque só escolhe conservação/responsável/cópias; validade e
  lote seguem calculados no servidor (nada muda).
- **Fila = specs não registradas** (registra na hora de imprimir), igual ao admin — nada é gravado ao
  "adicionar à fila".
- Conservação: um único `CONS_LABEL` (lib nova) nas duas telas — fim da divergência.
- Não quebrar o retry `pendente`, o registro, nem o admin.

## Fora do escopo

Renomear "Conservação"→"Armazenamento" nas telas (só ajustamos o texto do guia); prévia visual de
canvas no quiosque; qualquer mudança em Motoboy/entregador; cópias no histórico.

## Fases (para o plano)

- **T1 — Backend:** bootstrap `itens[].tipo` + excluir entregadores de `funcionarios`.
- **T2 — Lib de rótulos:** `etiquetaLabels.js` (CONS_LABEL correto + TIPO_*) e trocar os mapas locais do
  quiosque e do admin por ele (corrige o bug de rótulo).
- **T3 — Quiosque:** lista com badge/ordem por tipo + 2ª tela (pré-seleção de conservação, cópias, fila
  + "Imprimir agora").
- **T4 — Admin Itens:** responsável selecionável (equipe interna) + remover a msg "Lote de exemplo".
