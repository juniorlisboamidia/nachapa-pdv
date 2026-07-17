# Etiquetas — Fatia B (Itens operacional) — Design

**Data:** 2026-07-17 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

A Fatia A entregou a Config (4 modelos + prévia + teste, Niimbot B1). Hoje **só o quiosque**
(`EtiquetasQuiosque.jsx`, tablet sem login) imprime de verdade; a tela **Etiquetas › Itens**
(`AbaItens`) só edita conservação/validade/ativo por insumo, **não imprime**. A referência
(Cardápio Web) mostra o Itens como a tela **operacional**: catálogo à esquerda + painel
"Etiqueta selecionada" e **fila de impressão** à direita, imprimindo dali.

Esta fatia reforma o Itens nesse layout 2 colunas (cores da marca), **imprimindo via Niimbot B1**
do próprio aparelho que abre a tela (Web Bluetooth), reusando o renderizador (com o `modelo`
escolhido na Config) e a geração de validade/lote/registro do servidor. O quiosque **continua**
existindo em paralelo.

## Decisões travadas (com o usuário)

1. Produtos = **nosso catálogo (Insumos)** filtrados por `ETIQUETA_TIPOS_INSUMO` + **linhas
   manuais** (item avulso digitado). NÃO Cardápio Web.
2. Impressão = **Niimbot B1** (reusa `niimbotB1` + `etiquetaCanvas` com o `modelo`/`fonte` da Config).
3. **Responsável = texto livre** ("Nome de quem manipulou"), como na referência (o quiosque
   segue exigindo funcionário; a rota de admin aceita nome livre).

**Decisões técnicas assumidas:** a **validade/lote/datas são geradas no servidor** (fonte da
verdade — reusa `criarEtiquetaComLote` + `validadeDe`), numa **rota de admin nova** espelhando o
`/registrar` do quiosque; o registro grava `EtiquetaImpressa` (mesmo histórico/rastreab); a
manipulação e a validade (dias) podem ser ajustadas por etiqueta na tela (default = agora / regra).

## Reuso

- Backend: `criarEtiquetaComLote(dados)` (7382), `validadeDe({manipuladoEmMs,conservacao,regras,
  itemConfig})` (`etiquetas.js`), `EtiquetaImpressa`, `EtiquetaItemConfig`, `EtiquetaRegra`,
  `ETIQUETA_TIPOS_INSUMO`. `GET /etiquetas/itens` (catálogo) + `PUT /etiquetas/itens/:insumoId`.
- Frontend: `desenharEtiqueta`/`dadosExemplo` (`etiquetaCanvas`, respeita `config.modelo/fonte`),
  `niimbotB1` (`bluetoothDisponivel/conectar/conectado/imprimir(canvas,{copias})`), `GET /etiquetas/config`.

## Backend — rota de admin (nova)

`POST /api/etiquetas/registrar` (admin, DENTRO do gate → `empresaId` via `getEmpresaIdAtual()`,
**nunca `req.user.empresaId`**). Espelha o `/public/etiquetas/:token/registrar`, mas autenticado e
com responsável em texto livre:
- Body: `{ insumoId?|nomeAvulso?, conservacao, responsavelNome, manipuladoEm?(ISO), validadeDias?(override), quantidade? }`.
- Valida item (Insumo `ativo` + tipo etiquetável, OU `nomeAvulso`); recusa se `EtiquetaItemConfig.ativo===false` (mesma trava do quiosque). `responsavelNome` obrigatório (1–120 chars).
- `manipuladoEmMs = manipuladoEm ? Date.parse : Date.now()`. Calcula `validadeDe(...)` para obter
  `tempLabel` + `dias`/`validoAte` da regra; **se `validadeDias` (override > 0) veio**, usa
  `validoAte = manipuladoEm + dias*86400000` e `validadeDias = override`, mantendo o `tempLabel`
  da conservação.
- `criarEtiquetaComLote({ empresaId, insumoId, nomeItem, conservacao, tempLabel, manipuladoEm,
  validoAte, validadeDias, responsavelId: null, responsavelNome, dispositivoId: null, quantidade })`.
- `quantidade` clamp 1–50. Devolve `{ ok, etiqueta }` (com `nomeItem/conservacao/tempLabel/
  manipuladoEm/validoAte/validadeDias/lote/responsavelNome`) — o cliente desenha e imprime.

**Sem** endpoint de responsáveis (texto livre). O quiosque e sua rota pública ficam intactos.

## Frontend — `AbaItens` (reforma) + CSS `.etqi-*`

Layout **2 colunas** (grid; empilha no mobile). Busca a config uma vez (`GET /etiquetas/config`)
para saber o `modelo`/`fonte`/identificação da prévia, e conecta o Niimbot (reusa o padrão da Config).

**Coluna esquerda — Catálogo:**
- Busca + tabela do `GET /etiquetas/itens` (Insumos etiquetáveis + override): Nome · Conservação ·
  Validade efetiva. Mantém a **edição inline** que já existe (conservação/validade/ativo, `PUT
  /etiquetas/itens/:insumoId`). Cada linha ganha **"Usar"** → carrega o item no painel da direita.
- **Adicionar item manual:** um campo de nome → carrega como `nomeAvulso` no painel da direita
  (para itens fora do catálogo, sem gravar no catálogo).

**Coluna direita — Etiqueta selecionada + Fila:**
- **Etiqueta selecionada:** item atual (nome), **Conservação** (select das regras; default =
  `conservacaoPadrao` do item), **Manipulação/Abertura** (datetime-local, default agora),
  **Validade (dias)** (input, default = validade efetiva do item; editável), **Responsável**
  (texto livre), **Cópias** (1–50). **Prévia ao vivo** (canvas via `desenharEtiqueta` com o
  `modelo`/`fonte` da Config e os dados preenchidos — datas/lote de exemplo até registrar; ver nota).
- **Adicionar à fila** → empurra `{ item, conservacao, manipuladoEm, validadeDias, responsavelNome,
  copias }` para a **Sequência de impressão** (lista com remover/limpar).
- **Imprimir sequência** (via Niimbot): para cada item da fila → `POST /etiquetas/registrar`
  (servidor gera lote/validade e grava `EtiquetaImpressa`) → `desenharEtiqueta(canvas, dadosDoRegistro, config)`
  → `imprimir(canvas, { copias })`. Sequencial; se um falhar, para e avisa quais saíram. Requer
  Niimbot conectado (senão avisa e aponta o Conectar). Ao fim, limpa a fila.
- Também um **"Imprimir agora"** do item selecionado (fila de 1) para o caso rápido.

**Nota da prévia:** o `lote` e o `validoAte` finais só existem após o registro no servidor; a prévia
usa o `validadeDias`/manipulação preenchidos para mostrar o `validoAte` calculado no cliente e um
lote-placeholder (`—`), deixando claro que o número real sai no papel. O que **importa** para
"o que se vê é o que sai" (layout, campos, modelo) é fiel; só o código de lote é gerado no envio.

CSS `.etqi-*` em `global.css` espelhando o `.etq-*`/`.chkp-*` (cores da marca, tema-aware).

## Erros e invariantes

- **`empresaId` via `getEmpresaIdAtual()`** na rota de admin (o ADMIN é JWT cru do HUB, não tem
  `req.user.empresaId`) — mesma armadilha das outras rotas de admin do PDV.
- **Validade/lote no servidor:** o cliente nunca inventa o `validoAte`/`lote` que vão no registro;
  o `POST /registrar` recalcula (o override de dias é aplicado no servidor, não confiando no cliente).
- **Largura 384px** do canvas (`imprimir` valida) — reusa `desenharEtiqueta`, já garantido.
- **`conectado()` pode mentir** → reconectar manual; a fila só imprime se conectado.
- Item `ativo:false` (override) → a rota recusa (paridade com o quiosque/bootstrap).
- Não quebrar o quiosque nem o `GET/PUT /etiquetas/itens` existentes.

## Testes

- Não há regra pura nova (a lógica de validade/lote é reuso testado de `etiquetas.js`). A rota de
  admin: `node --check` + smoke (registrar via prisma client num script, conferindo lote/validoAte/
  responsavelNome, e o override de dias). Frontend: `npm run build` + leitura (UI + Web Bluetooth,
  sem teste automatizado, como na Fatia A T4).

## Fases (para o plano)

- **T1 — rota admin `POST /etiquetas/registrar`** (reusa `criarEtiquetaComLote`/`validadeDe`,
  texto livre, override de manipulação/dias) + saneamento + smoke.
- **T2 — Itens 2 colunas:** catálogo (esquerda, edição inline + "Usar" + item manual) + painel
  "Etiqueta selecionada" (direita) com prévia ao vivo + "Imprimir agora" + CSS `.etqi-*`.
- **T3 — Sequência de impressão:** fila (adicionar/remover/limpar) + "Imprimir sequência"
  (registrar→desenhar→imprimir por item, sequencial, com aviso de falha parcial).

## Fora do escopo (Fatia B)

Página de rastreabilidade do QR (já decidido: offline); integração Cardápio Web (catálogo =
Insumos); seletor de funcionário como responsável (texto livre); múltiplas impressoras; edição do
histórico. O quiosque segue como está.
