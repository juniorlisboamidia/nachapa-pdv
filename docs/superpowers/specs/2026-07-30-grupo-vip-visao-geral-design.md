# Grupo VIP — Rastreio de retorno + Visão Geral (design)

**Data:** 2026-07-30 · **Repos:** `nachapa-pdv` (PDV) + `Traffic Hub` (HUB)

## Contexto

O módulo **Automações › Grupo VIP** (PDV) dispara mensagens agendadas num grupo de WhatsApp, e as mensagens levam links do **Cardápio Web (CW)** para o cliente pedir. Hoje não há como saber **qual mensagem traz mais retorno**.

O CW já resolve metade disso: no painel dele existe o **"Identificador de origem"** — o lojista cria um identificador (ex.: `grupo_vip`), o CW gera um link com `?s=<identificador>`, e a tela **"Análise dos pedidos por origem"** mostra faturamento/pedidos/ticket por origem. Investigação confirmada na OpenAPI oficial (`Traffic Hub/backend/docs/cardapioweb/API-Pedidos.openapi.json`): o pedido tem o campo **`customer_origin`** (campo livre = o valor do `?s=`), presente **só no detalhe** `GET /orders/{id}` (que o HUB já busca no sync `cardapioPedidosSync.js`, mas hoje **descarta**). **Não há API** para criar identificadores (só painel) nem endpoint de analytics por origem — agregamos somando por `customer_origin`.

## Objetivo

Uma seção **"Visão Geral"** no Grupo VIP (PDV) que mostra, por período, quanto retorno as mensagens do grupo geraram — cruzando o `?s=` do link colado na mensagem com o `customer_origin` dos pedidos do CW.

**Sucesso:** o lojista cola um link do CW (`…?s=id`) numa mensagem, e a Visão Geral passa a mostrar quantos pedidos e quanta receita aquele link/mensagem trouxe (inclusive o histórico já existente, via backfill).

## Decisões travadas (com o usuário)

1. **Identificador MANUAL:** o lojista cria no painel do CW e **cola o link na mensagem**. A ferramenta **extrai o `?s=` do texto** — sem campo extra por mensagem. O link é a fonte.
2. **Seção separada "Visão Geral"** (aba), com 4 KPIs: **Mensagens Enviadas · Conversões · Receita Gerada · Clientes no Grupo** (best-effort) + tabela **"Retorno por mensagem"**.
3. **Incluir o histórico** (backfill dos últimos 6 meses no HUB).
4. **Período padrão: últimos 30 dias**, com seletor **7/30/90**.

## Arquitetura (cruza os 2 repos)

### HUB (repo Traffic Hub — dono dos pedidos do CW)

1. **Model `PedidoCardapio`:** nova coluna `customerOrigin String?` (migration no repo do HUB).
2. **Capturar no sync:** em `upsertPedido` (`backend/cardapioPedidosSync.js`), acrescentar `customerOrigin: d.customer_origin ?? null` ao objeto `dados` (persistido em create+update).
3. **Backfill (6 meses):** re-ler os detalhes dos pedidos dos últimos ~6 meses via o **modo `force`** que o sync já tem (`force` re-baixa o detalhe mesmo de pedidos já persistidos → popula o `customerOrigin` dos antigos). Roda **uma vez, em background**, respeitando os throttles já existentes (`DETALHE_THROTTLE_MS`/`HISTORY_THROTTLE_MS`). Mecanismo exato (script pontual vs. gatilho) fica no plano; o resultado é: pedidos dos últimos 6 meses com `customerOrigin` preenchido.
4. **Endpoint-ponte** `GET /api/internal/cardapio-origens?clienteId=&inicio=&fim=` — auth **Bearer JWT `svc:'pdv-operacao'`** (mesmo trilho do `/api/internal/cardapio-cupom`; reusa a verificação já ajustada na Task 5 do Grupo VIP). Retorna agregados por origem da loja no período:
   ```json
   { "origens": [ { "origem": "grupo_vip", "pedidos": 114, "receita": 3950.14 } ] }
   ```
   Query Prisma: `groupBy(['customerOrigin'])` em `PedidoCardapio` com `where: { clienteId, status: { in: STATUS_VENDA_CARDAPIO }, createdAtCW: { gte: inicio, lte: fim }, customerOrigin: { not: null } }`, `_count: { _all: true }`, `_sum: { total: true }`. Usa a MESMA lista `STATUS_VENDA_CARDAPIO` (server.js ~9718) do dashboard de vendas, para bater com o painel.

### PDV (repo nachapa-pdv — Grupo VIP)

1. **Helper puro `backend/grupoVipOrigem.js`** → `extrairOrigem(texto)`: acha a 1ª URL no texto e devolve o valor do query param **`s`** (o identificador), ou `null` se não houver link CW com `?s=`. Testável isolado.
2. **Ponte `backend/cardapioOrigens.js`** (espelha `cardapioCupom.js`): `buscarOrigensCW(hubClienteId, inicioIso, fimIso)` → assina JWT `svc:'pdv-operacao'` com o `JWT_SECRET` compartilhado → `GET ${HUB_API_URL}/internal/cardapio-origens` → devolve `[{origem, pedidos, receita}]`. Best-effort: sem `hubClienteId` → `[]`; erro → lança `{http,msg}` tratado pelo endpoint.
3. **Endpoint `GET /api/grupo-vip/visao-geral?dias=30`** (gate admin). Faz:
   - período = `[agora − dias, agora]` (fuso BR via `brFields`/`brToUtcMs`).
   - **Mensagens Enviadas** = `count` de `GrupoVipDisparo` com `status='ENVIADO'` e `criadoEm` no período (empresaId explícito — está no gate, extension injeta).
   - carrega as mensagens (`grupoVipMensagem`), extrai a origem de cada uma (`extrairOrigem(m.texto)`).
   - se `cfg.hubClienteId`: `buscarOrigensCW(...)` → lista de origens agregadas do CW.
   - **cruzamento com normalização** (`origem.trim().toLowerCase()`) dos dois lados — cobre o risco de o CW normalizar/minúsculo o `?s=`.
   - **Conversões** = soma de `pedidos` das origens que casam com alguma mensagem. **Receita Gerada** = soma de `receita` dessas origens.
   - **Retorno por mensagem** = `[{ rotulo, origem, pedidos, receita }]` (só mensagens com link CW).
   - resposta: `{ dias, mensagensEnviadas, conversoes, receita, porMensagem: [...] }`. (**Clientes no Grupo** o frontend já tem via `grupoInfo.membros`.)
4. **UI — abas na página** `GrupoVip.jsx`: quando conectado, um switch **"Conversas" | "Visão Geral"** logo abaixo do `page-header`. **Conversas** = conteúdo atual (chat + Configurações + Histórico). **Visão Geral** = seletor **7/30/90 dias** + 4 cards de KPI + tabela **Retorno por mensagem**. Estilo reusa os tokens/classes atuais (`.gv-*`, KPIs no padrão dos cards). Best-effort: sem `hubClienteId`, mostra um aviso "vincule a loja no HUB nas Configurações" e zera Conversões/Receita.

## Fluxo de dados

1. Lojista cria o identificador no painel do CW → copia o link `…?s=id`.
2. Cola esse link numa mensagem do Grupo VIP (campo texto).
3. Agendador dispara a mensagem no horário → cai no grupo com o link.
4. Cliente pede pelo link → CW registra o pedido com `customer_origin=id`.
5. Sync do HUB (`/orders/{id}`) captura `customer_origin` → coluna `customerOrigin`.
6. PDV Visão Geral: extrai os `?s=` das mensagens → pede agregados por origem ao HUB → casa e mostra os KPIs + retorno por mensagem.

## Riscos / a confirmar (tratados na implementação)

- **Formato do `customer_origin` vs `?s=`:** o CW pode normalizar (minúsculo/trim). Mitigação: comparar os dois lados normalizados. Validar cedo com um pedido real (link `?s=vip_teste` → pedido → conferir o valor persistido).
- **Nome do param:** o link do CW usa `?s=` (visto no print). O extractor lê `s`; se aparecer outro formato, ajustar o extractor (ponto isolado).
- **Deploy do HUB obrigatório:** migration da coluna + o ajuste `svc:'pdv-operacao'` da Task 5 (commit `996113c`, ainda **local sem push**). Sem o HUB deployado, `buscarOrigensCW` recebe 403 → a Visão Geral mostra os KPIs locais (Mensagens Enviadas) e zera os do CW, sem quebrar.
- **Clientes no Grupo:** `zapiGrupoInfo.membros` (ParticipantCount) veio 0 nos testes (UAZAPI não sincroniza na hora p/ número recém-conectado). KPI **best-effort**: mostra o número quando > 0, senão "—".
- **Rate limit do backfill:** reusa os throttles do sync; roda 1x em background, sem bloquear.

## Testes

- **Puro:** `backend/grupoVipOrigem.test.js` — `extrairOrigem` em vários textos (link com `?s=`, sem link, múltiplas URLs, `?s=` no meio de outros params, texto vazio).
- **HUB:** conferir a query `groupBy` (agregados batem com um conjunto conhecido).
- **e2e:** link `?s=vip1` numa mensagem → pedido de teste no CW → Visão Geral mostra Conversões/Receita.

## Fora de escopo (YAGNI)

- Criar/listar identificadores por API (não existe no CW; é manual no painel).
- Montar o link automaticamente / anexar `?s=` sozinho (o lojista cola o link pronto do CW).
- Analytics em tempo real (KPIs são calculados no load da aba).
- Rastreio de origens que não vêm de mensagens do Grupo VIP (a Visão Geral olha só as origens das mensagens).
