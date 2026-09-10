# Totem de autoatendimento — Fase A — Design (spec formal)

**Data:** 2026-09-10 · **Status:** aprovado conceitualmente pelo Junior (revisões de 06/09 e 10/09 incorporadas) · **Repos:** `nachapa-pdv` (PDV, casa do totem) e `Traffic Hub` (HUB, autoridade de catálogo/preço e única ponte com o Cardápio Web).

Validado em produção (2026-09-06): `POST /api/partner/v1/orders` cria pedido (201, `sales_channel=integration`, `order_timing=immediate`, nasce `waiting_confirmation`); `external_order_id` preserva nosso `order_id` (exclusivo); o `display_id` **do CW** (`#376`) é gerado por ele e só aparece em `GET /orders/{id}`; nosso `display_id` aparece no painel como etiqueta "API …"; o polling `GET /orders` lista o pedido (sem `external_order_id`, sem total, sem display); pagamento offline funciona. **Autoaceite com a loja aberta ainda não foi testado.**

## 1. Objetivo e escopo da Fase A

Um aparelho (tablet) na loja, **pareado** ao PDV, onde o cliente monta o pedido no catálogo real do Cardápio Web, escolhe **comer aqui (`onsite`)** ou **levar (`takeout`)**, revisa o total calculado pelo HUB, escolhe uma forma de pagamento **offline** (paga no balcão) e recebe o **número do pedido do CW**. O pedido nasce no CW e flui para painel/cozinha/relatórios pelos caminhos que já existem.

**Dentro:** pareamento por código temporário + cookie HttpOnly; heartbeat; área Aparelhos (genérica, TOTEM hoje, TV_INDOOR depois); bootstrap (catálogo visível + estado operacional + pagamentos); cotação assinada; criação de pedido; outbox/auditoria no PDV; reconciliação de POST ambíguo; tela admin "Pedidos do totem"; itens `regular_item` com grupos `SUM`.
**Fora (fases seguintes):** delivery; pagamento online/PIX (`prefilled_order`/`checkout_url`); combos (`kind=combo`); grupos `MEAN|MAX|MIN`; métodos com taxa; impressão de senha; cliente identificado (`customer`); TV_INDOOR (só a base de aparelhos fica pronta); política automática de `/confirm` (depende do teste de autoaceite).

## 2. Arquitetura

```
Tablet ──cookie pdv_aparelho (HttpOnly/Secure)──▶ PDV  /api/public/aparelho/*
PDV    ──JWT svc 'pdv-operacao' (2 min, servidor)─▶ HUB  /api/internal/cardapio-totem-*
HUB    ──X-API-KEY (banco) + X-PARTNER-KEY (env)──▶ Cardápio Web  /catalog · /merchant · /merchant/payment_methods · POST /orders · GET /orders/{id} · GET /orders
```
- **Credenciais do CW nunca saem do HUB** (`Cliente.cardapioWebApiKey` write-only, serializer `backend/server.js:8145-8147`; `CARDAPIOWEB_PARTNER_KEY` só no env). O PDV não tem nenhuma variável do CW; o aparelho só tem o cookie.
- **HUB é a autoridade final** de catálogo, disponibilidade e preço: todo valor mostrado na revisão e todo pedido criado passam pelo mesmo validador (`backend/cardapioPedidoTotem.js`). O PDV não calcula preço; guarda só o que enviou e o que recebeu.
- **PDV** cuida de identidade do aparelho, outbox/auditoria, reconciliação e UI. O aparelho pode navegar no último snapshot, mas **revisar e fechar exigem o HUB vivo**.
- Vínculo loja↔HUB: `Empresa.clienteId` (`schema.prisma:487-514`; `'admin'` = loja de teste, inválido), mesma regra de `hubClienteIdGrupoVip` (`server.js:7993-7999`).

## 3. Aparelhos (PDV)

### 3.1 `model Dispositivo` (estendido, `schema.prisma:763-775`)
`token String @unique` **continua obrigatório e gerado** (`randomBytes(12).toString('base64url')`, como `server.js:8349`) para TOTEM/TV_INDOOR — apenas **não é credencial** desses tipos (os legados PONTO/ETIQUETA seguem usando-o na URL, sem mudança). Campos novos:

| campo | tipo | uso |
|---|---|---|
| `pareamentoCodigo` | `String? @unique` | código temporário de 6 dígitos, uso único |
| `pareamentoExpiraEm` | `DateTime?` | validade (+10 min) |
| `pareamentoTentativas` | `Int @default(0)` | até 5 erros → código invalidado |
| `credencialHash` | `String? @unique` | SHA-256 (hex) da credencial do cookie; a credencial em claro nunca é gravada |
| `pareadoEm` | `DateTime?` | último pareamento bem-sucedido |
| `ultimoHeartbeatEm` | `DateTime?` | **online = há < 150 s** (calculado no servidor) |
| `heartbeatJson` | `Json?` | `{ versao, tela:{w,h}, userAgent, ip }` |

`tipo` continua `String` (`'PONTO' | 'ETIQUETA' | 'TOTEM' | 'TV_INDOOR'`) — sem enum, sem migration para novos tipos. Índice novo `(empresaId, tipo)`.

### 3.2 Pareamento
1. Admin (área `aparelhos`) cria o aparelho `{ nome, tipo: 'TOTEM' }` e aciona **Parear** → `POST /api/aparelhos/:id/parear` gera `pareamentoCodigo` (6 dígitos, único entre códigos vivos), `pareamentoExpiraEm = agora+10min`, `pareamentoTentativas = 0` → resposta `{ codigo, expiraEm, urlDispositivo }`; a tela mostra o código e o QR de `https://<pdv>/dispositivo`.
2. No tablet, `/dispositivo` (rota pública, standalone) → `POST /api/public/aparelho/parear { codigo }`:
   - código inexistente/expirado/aparelho inativo → `401 { erro: 'CODIGO_INVALIDO' }` (mesma resposta para todos os casos; incrementa `pareamentoTentativas` quando o código existe; ao 5º erro o código é apagado → `CODIGO_INVALIDO`); limite por IP: 10 tentativas / 10 min → `429`.
   - sucesso → credencial = 32 bytes aleatórios base64url; grava `credencialHash = sha256(credencial)`, `pareadoEm`, zera `pareamentoCodigo/ExpiraEm/Tentativas`; `Set-Cookie: pdv_aparelho=<credencial>; HttpOnly; Secure; SameSite=Strict; Path=/api/public/aparelho; Max-Age=31536000`; resposta `{ ok: true, aparelho: { id, nome, tipo }, loja: { nome, logoDataUrl } }`.
3. **Revogar** (`POST /api/aparelhos/:id/revogar`): zera `credencialHash` (e opcionalmente `ativo=false`). Re-parear gera credencial nova (a antiga morre).
4. Toda rota `/api/public/aparelho/*` (exceto `parear`) passa por `resolverAparelhoPorCookie(req)`: lê o cookie, `findFirst({ where: { credencialHash: sha256(cookie), ativo: true } })`; ausente/inválido → `401 { erro: 'APARELHO_NAO_PAREADO' }`. As rotas `/public/` são isentas dos 3 gates (`server.js:165-170, 201-212, 216-226`) e **fora do tenant**: todo `where`/`create` leva `empresaId: aparelho.empresaId` explícito (precedente `server.js:9114-9118`).
5. Dev: `frontend/vite.config.js` proxia `/api` → `http://localhost:4001` para o cookie ser same-origin (em produção o Nginx já proxia `/api`).

### 3.3 Heartbeat
`POST /api/public/aparelho/heartbeat { versao, tela }` a cada 60 s (e no `visibilitychange`), grava `ultimoHeartbeatEm` + `heartbeatJson` (com `userAgent` e IP do request). `GET /api/public/aparelho/eu` → `{ aparelho:{ id, nome, tipo }, loja:{ nome, logoDataUrl } }` (o front decide a UI pelo `tipo`). Admin lista `online` (`ultimoHeartbeatEm > agora−150s`), `ultimoSinalEm`, `versao`. `ultimaSync` fica só para os legados.

### 3.4 Área e rotas admin
- `backend/acessos/areas.js`: `'aparelhos'` em `AREAS_DISPONIVEIS`; `['/aparelhos','aparelhos']` e `['/totem','aparelhos']` em `AREA_PREFIXOS`. `MinhaEmpresa.jsx` `AREA_LABEL.aparelhos = 'Aparelhos e Totem'`.
- `GET /api/aparelhos?tipo=` · `POST /api/aparelhos { nome, tipo }` · `PATCH /api/aparelhos/:id { nome, ativo }` · `DELETE /api/aparelhos/:id` (404 se `count===0`; recusa se houver `PedidoTotemEnvio` → `409 { erro: 'APARELHO_COM_PEDIDOS' }`) · `POST /api/aparelhos/:id/parear` · `POST /api/aparelhos/:id/revogar`. Todos `exigirAdmin`, `tipo ∈ {TOTEM, TV_INDOOR}` (PONTO/ETIQUETA continuam nas telas próprias).
- Sidebar (`components/sidebarNav.js`): Ferramentas › **Aparelhos** (`/aparelhos`) e **Totem › Pedidos** (`/totem/pedidos`). A Visão Geral herda.

## 4. HUB — internos, caches e validador

### 4.1 Autenticação de serviço
Novo helper `autenticarSvcInterno(req, res, svcs)` (Bearer + `jwt.verify(JWT_SECRET)` + `svcs.includes(p.svc)`); os internos do totem usam `['h360-dashboard','pdv-operacao']`. `autenticarSvcH360` (`server.js:14320-14329`) não muda.

### 4.2 Caches por cliente (`Map` em memória, como `cardapioWebCatalogoCache`)
| função | fonte CW | TTL | conteúdo |
|---|---|---|---|
| `buscarCatalogoCardapio(cliente)` (existente, `server.js:10470`) | `GET /catalog` | 60 s | `categories` bruto |
| `buscarMerchantEstatico(cliente)` | `GET /merchant` + `GET /merchant/payment_methods` | 10 min | `name, logo_image, slug, address, timezone`, `metodosPagamento` (§4.3) |
| `buscarMerchantOperacional(cliente)` | `GET /merchant` | **25 s** | `status, operation_modes, opening_hours` (com `temporary_state`, `temporary_state_end_at`, `custom_dates`, `timezone`) |

`cotar` e `pedido` chamam **as funções cacheadas**; nunca fazem GET próprio. Dois `GET /merchant` distintos por TTL (estático 10 min, operacional 25 s) ficam dentro dos 300 req/3 min.

### 4.3 Métodos de pagamento (`backend/cardapioMerchant.js`, puro)
`metodosPagamentoTotem(listaIds, listaMerchant)`: cruza `GET /merchant/payment_methods` (`id, kind, name, brands`) com `merchant.payment_methods` (`payment_method, active, available_on_menu, percentual_fee, fixed_fee`) **por `kind`**:
- entra só se `active && available_on_menu`;
- **taxa** (`percentual_fee` ou `fixed_fee` não nulos) → **excluído na Fase A** (o mapeamento de taxa no `CreateOrder` não é assumido; fica para validação futura);
- Fase A aceita `kind ∈ {money, debit_card, credit_card}`;
- **ambiguidade:** dois ou mais `id` com o mesmo `kind` → todos entram, cada um com `name` próprio, e o item recebe `kindAmbiguo: true`; o totem exibe pelo `name` e envia o `id` escolhido; o bootstrap devolve `avisos: ['PAGAMENTO_KIND_AMBIGUO:credit_card']` para o admin ver.
Saída: `[{ id, kind, name, kindAmbiguo }]`.

### 4.4 Estado operacional (`cardapioMerchant.js`, puro)
`abertaAgora(operacional, agoraUtc)` com o **`timezone` IANA do merchant** (`Intl.DateTimeFormat` com `timeZone`): `temporary_state` (`open|closed`) vale até `temporary_state_end_at`; senão `custom_dates[YYYY-MM-DD].intervals`; senão o dia da semana; array vazio = fechado. `podeOperar(operacional, orderType)` = `status==='ACTIVE' && operation_modes[orderType] && operation_modes.immediate && abertaAgora`.

### 4.5 Validador e preço (`backend/cardapioPedidoTotem.js`, puro, testado)
Entrada: `{ catalogo, operacional, metodos, agoraUtc, orderType, carrinho, metodoId, referencia? }`.
Regras, na ordem (o primeiro erro por linha é reportado; erros de loja são globais):
1. Loja: `podeOperar` → `LOJA_INATIVA` / `LOJA_FECHADA` / `MODO_INDISPONIVEL`.
2. Carrinho: 1–50 linhas (`CARRINHO_VAZIO`, `CARRINHO_GRANDE`), `qtd` inteiro ≥ 1.
3. Categoria do item: visível (`visibilidadeDoCatalogo` de `backend/cardapioFaltas.js`) e `allowed_times` da **categoria** dentro da janela (tz do merchant) → `ITEM_FORA_DE_HORARIO`.
4. Item: `kind==='regular_item'` (`ITEM_NAO_SUPORTADO`), `status==='ACTIVE'` (`MISSING` → `ITEM_EM_FALTA`, `INACTIVE`/oculto → `ITEM_INDISPONIVEL`), `available_for ∋ AVAILABLE_FOR_TOTEM` (`'service_desk'`, constante), `allowed_times` do item, estoque (`active_stock_control && stock < Σqtd das linhas do mesmo item` → `ESTOQUE_INSUFICIENTE`).
5. Grupos do item: cada grupo `ACTIVE` com `price_calculation_type !== 'SUM'` → `GRUPO_CALCULO_NAO_SUPORTADO` (o item inteiro é recusado; no bootstrap esse item é **omitido**); grupo `MISSING` obrigatório → `ITEM_INDISPONIVEL`; grupo `INACTIVE` → ignorado (e escolhas nele → `OPCAO_INDISPONIVEL`); escolhas: `Σqtd ≥ minimum_quantity` (`GRUPO_OBRIGATORIO`), `≤ maximum_quantity` (`GRUPO_LIMITE`); `SINGLE` = exatamente 1 opção com qtd 1; `MULTIPLE` = sem repetição (qtd 1 cada); `SUMMABLE` = qtd por opção ≤ `max_quantity` (se não nulo); opção `ACTIVE` (`OPCAO_INDISPONIVEL`/`OPCAO_EM_FALTA`), estoque da opção.
6. Preço: `unit_price` do item = `promotional_price` se `promotional_price_active` e (schedules nulo/vazio ou janela `{day, start|null, end|null}` ativa no tz do merchant), senão `price`; opção = `price` da opção **naquele grupo**. `total_price = round2((unit_price + Σ opção.price×qtd) × qtd)`.
7. Pagamento: `metodoId` ∈ `metodos` (`PAGAMENTO_INVALIDO`).
8. Totais: `order_amount = round2(Σ total_price)`; `delivery_fee=0`, `additional_fee=0`, `discounts=0`; `payments=[{ total: order_amount, payment_method_id: metodoId }]`.
Saída ok: `{ linhas:[{ itemId, nome, qtd, unitPrice, totalPrice, opcoes:[{ opcaoId, grupoId, nome, qtd, unitPrice }] }], total, createOrder }` — `createOrder` já no formato oficial (`item_id`/`option_id` como string, `display_id` e `order_id` da referência, `observation` do item se houver).

### 4.6 Cotação assinada
`cotacaoHash = sha256(canon({ clienteId, orderType, metodoId, linhas:[{itemId, qtd, unitPrice, opcoes:[{grupoId, opcaoId, qtd, unitPrice}] ordenadas}], total }))` (hex, 32 chars). O HUB devolve `cotacao: { hash, expiraEm: agora+10min, assinatura: HMAC-SHA256(JWT_SECRET, hash+'|'+expiraEm) }`. Em `pedido`, o HUB recalcula tudo e exige: assinatura válida, não expirada (`COTACAO_EXPIRADA`), e `hash` recalculado **igual** ao enviado (`COTACAO_DIVERGENTE` — preço/disponibilidade mudou; o cliente revisa de novo). O hash **não** inclui `fetchedAt` do catálogo: só diverge quando muda algo que altera o dinheiro ou a composição.

### 4.7 Contratos HTTP dos internos (todos `POST`, JSON, Bearer svc; erros `{ erro, detalhes? }`)
| endpoint | request | 200 |
|---|---|---|
| `/api/internal/cardapio-totem-bootstrap` | `{ clienteId }` | `{ conectado, loja:{nome, logo}, operacional:{ status, abertaAgora, modos:{onsite,takeout} }, metodos:[…], catalogo:{ categorias:[{ id, nome, itens:[{ id, nome, descricao, imagem, preco, precoPromocional?, grupos:[{ id, nome, choiceType, min, max, opcoes:[{ id, nome, preco, status, maxQuantidade }] }], status }] }], fetchedAt }, avisos:[] }` — só itens visíveis, `regular_item`, `available_for ∋ service_desk`, sem grupos não-SUM (item omitido); `MISSING` vai marcado (para exibir "em falta") |
| `/api/internal/cardapio-totem-cotar` | `{ clienteId, orderType, carrinho:[{ itemId, qtd, observacao?, grupos:[{ grupoId, opcoes:[{ opcaoId, qtd }] }] }], metodoId }` | `{ ok:true, linhas, total, cotacao:{hash, expiraEm, assinatura} }` ou `422 { erro:'COTACAO_INVALIDA', detalhes:[{ codigo, itemId?, grupoId?, opcaoId?, mensagem }] }` |
| `/api/internal/cardapio-totem-pedido` | `{ clienteId, orderType, carrinho, metodoId, cotacao:{hash, expiraEm, assinatura}, referencia:{ orderId, displayId }, observacao? }` | `201 { criado:true, cwOrderId, cwStatus, cwDisplayId:int|null, total, detalheOk:bool }` · `409 COTACAO_DIVERGENTE` / `409 COTACAO_EXPIRADA` / `422 COTACAO_INVALIDA` (recálculo falhou) / `422 { erro:'CW_RECUSOU', cwStatus:422, detalhes }` (corpo do CW) / `502 { erro:'CW_INDISPONIVEL', ambiguo:bool }` |
| `/api/internal/cardapio-totem-detalhe` | `{ clienteId, cwOrderId }` | `{ cwDisplayId:int, cwStatus, total }` |
| `/api/internal/cardapio-totem-reconciliar` | `{ clienteId, orderId, orderType, tentadoEm, timeoutMs }` | `{ encontrado:true, cwOrderId, cwDisplayId, cwStatus }` ou `{ encontrado:false, candidatos:n }` |

Semântica de `pedido` no HUB: (a) `POST /orders` com timeout 30 s; (b) **sem resposta** (timeout/rede) ou `5xx` sem JSON → `502 { erro:'CW_INDISPONIVEL', ambiguo:true }`; (c) `4xx` com JSON (401/422/429) → **determinístico**: `422 CW_RECUSOU` (429 → `503 { erro:'CW_RATE_LIMIT' }`, também determinístico: nada foi criado); (d) `201` → tenta `GET /orders/{id}` (timeout 10 s, 1 vez): sucesso → `detalheOk:true` + `cwDisplayId`; falha → `detalheOk:false`, `cwDisplayId:null` — **o pedido está criado**.

Reconciliação (§4.7 último): `GET /orders?updated_since=<tentadoEm−2min>` → candidatos `sales_channel==='integration' && order_type===orderType && created_at ∈ [tentadoEm−60s, tentadoEm+timeoutMs+60s]` → `GET /orders/{id}` de cada candidato (limite 10) → `external_order_id === orderId`. `updated_since` deve ser ≤ 24 h atrás (restrição da API) — o PDV só chama dentro de 6 h.

### 4.8 `PedidoCardapio.externalOrderId`
Coluna nova + `upsertPedido` (`backend/cardapioPedidosSync.js:108-133`) grava `d.external_order_id ?? null`. Comentário de `salesChannel` (`schema.prisma:491`) ganha `integration`. É o cruzamento outbox↔relatório e o campo que a reconciliação usaria se o pedido já tiver sido sincronizado.

## 5. PDV — ponte, rotas públicas, outbox, admin, UI

### 5.1 Ponte `backend/cardapioPedido.js` (clone estrutural de `backend/cardapioOrigens.js`)
`bootstrapTotemCW(clienteId)`, `cotarTotemCW(clienteId, body)`, `criarPedidoTotemCW(clienteId, body)`, `detalheTotemCW(clienteId, cwOrderId)`, `reconciliarTotemCW(clienteId, body)`. `svc:'pdv-operacao'`, `HUB_API_URL`/`JWT_SECRET` lidos do env **por chamada e sem default** (falha alto: `{http:503, codigo:'HUB_NAO_CONFIGURADO'}`); timeouts: bootstrap/cotar/detalhe/reconciliar 15 s; **pedido 45 s** (30 s do HUB→CW + folga). Erros: rede/timeout → `{http:502, codigo:'HUB_INDISPONIVEL', ambiguo:true}` (só em `pedido`); resposta HTTP do HUB é repassada com o corpo.

### 5.2 Rotas públicas do totem (cookie; `empresaId` explícito)
| rota | request | resposta |
|---|---|---|
| `GET /api/public/aparelho/totem/bootstrap` | — | o bootstrap do HUB + `{ orderTypes:['onsite','takeout'] filtrados por modos, snapshotEm }`; se o HUB falhar e houver snapshot → devolve o snapshot com `desatualizado:true`; sem snapshot → `503 CATALOGO_INDISPONIVEL` |
| `POST /api/public/aparelho/totem/cotar` | `{ orderType, carrinho, metodoId }` | repassa o HUB (`200` / `422`); HUB fora → `503 HUB_INDISPONIVEL` (checkout bloqueado) |
| `POST /api/public/aparelho/totem/pedido` | `{ chaveIdempotencia, orderType, carrinho, metodoId, cotacao }` | `201 { envioId, status:'CRIADO', cwOrderId, cwDisplayId:int|null, total }` · `202 { envioId, status:'ENVIANDO'|'AMBIGUO' }` (idempotência: mesma chave em andamento) · `409/422` determinísticos com `{ erro, detalhes }` · `503 HUB_INDISPONIVEL` (nada gravado) |
| `GET /api/public/aparelho/totem/pedido/:envioId` | — | `{ status, cwOrderId, cwDisplayId, total }` (o totem faz polling curto quando `cwDisplayId` vier nulo) |

Fluxo de `pedido`: (1) `chaveIdempotencia` já existe para o aparelho → devolve o estado atual (nunca cria outro); (2) gera `referencia = randomUUID()` **antes** do INSERT: `orderId = 'TOTEM-' + referencia`, `displayIdEnviado = 'T' + aparelho.id + '-' + referencia.slice(0,6).toUpperCase()` (etiqueta de integração, não exclusiva); (3) INSERT `PedidoTotemEnvio(ENVIANDO)`; (4) ponte `criarPedidoTotemCW`; (5) transição conforme §5.3; (6) resposta.

### 5.3 Outbox `PedidoTotemEnvio` — estados e transições
| estado | significado | transições |
|---|---|---|
| `ENVIANDO` | INSERT feito, chamada em curso | → `CRIADO` (201) · → `REJEITADO` (determinístico) · → `AMBIGUO` (sem resposta/5xx sem corpo) |
| `CRIADO` | pedido existe no CW (`cwOrderId` preenchido); `cwDisplayId` pode estar **pendente** (`null`) | `cwDisplayId` preenchido pelo job `completarDisplay` (chama `detalhe`); terminal |
| `REJEITADO` | HUB ou CW recusou de forma determinística (422/409/429/503 do HUB, `CW_RECUSOU`); **nada foi criado** | terminal; o cliente pode refazer com **nova** chave/`orderId` |
| `AMBIGUO` | POST sem confirmação (timeout, rede, 5xx sem JSON) | job `reconciliar` a cada 60 s por até 6 h: encontrado → `CRIADO`; não encontrado após **15 min** → `FALHOU` |
| `FALHOU` | reconciliado como inexistente | terminal; refazer com **nova** chave/`orderId` |

**Nunca** há re-POST automático com o mesmo `orderId`; `AMBIGUO` não autoriza re-POST. Campos: `empresaId, dispositivoId, chaveIdempotencia, orderId, displayIdEnviado, orderType, status, cwOrderId Int?, cwDisplayId Int?, cwStatusInicial, totalCalculado Decimal(12,2), cotacaoHash, carrinhoJson, respostaJson, erroCodigo, erroDetalhe, tentadoEm, reconciliadoEm, criadoEm, atualizadoEm`. Unique `(orderId)`, `(dispositivoId, chaveIdempotencia)`.

### 5.4 Job do PDV (`setInterval` 60 s, in-process, com lock)
- `AMBIGUO` com `tentadoEm > agora−6h` → `reconciliarTotemCW`; `tentadoEm < agora−15min` e não encontrado → `FALHOU`.
- `CRIADO` com `cwDisplayId IS NULL` e `criadoEm > agora−24h` → `detalheTotemCW` → preenche.
- Admin pode forçar por linha (`POST /api/totem/pedidos/:id/reconciliar`).

### 5.5 Admin `GET /api/totem/pedidos?dias=&status=` + `pages/TotemPedidos.jsx`
Lista da outbox (aparelho, hora, status, `#cwDisplayId`, total, erro), filtro por status, botão reconciliar nos `AMBIGUO`/display pendente. Sem edição.

### 5.6 UI do totem (`pages/TotemQuiosque.jsx`, standalone, `100dvh`, sem Layout)
Telas: **Início** (modo `onsite`/`takeout` só se ambos ativos; loja fechada → aviso e bloqueio) → **Catálogo** (categorias/itens do bootstrap; "em falta" desabilitado; preços exibidos **do bootstrap, marcados como "a confirmar"**) → **Item** (grupos: SINGLE/MULTIPLE/SUMMABLE com min/max, `max_quantity`) → **Carrinho** → **Revisar** (`cotar`: linhas e total **do HUB**; erros de cotação listados por linha; `COTACAO_INVALIDA` volta ao carrinho) → **Pagamento** (métodos do bootstrap; texto "pague no balcão") → **Confirmar** (`pedido` com a cotação assinada) → **Resultado**: "Pedido **#<cwDisplayId>**" (numérico, do CW); se pendente, "gerando número…" com polling de `pedido/:envioId` por até 60 s e fallback "Apresente este código no balcão: `displayIdEnviado`" (etiqueta API) — nunca chamado de "senha". Inatividade 90 s → reset. Erros: `HUB_INDISPONIVEL`/`CATALOGO_INDISPONIVEL` → tela "tente de novo em instantes"; `COTACAO_DIVERGENTE`/`EXPIRADA` → volta para Revisar automaticamente.

### 5.7 Tela `/dispositivo` (`pages/DispositivoPareamento.jsx`)
Sem cookie → formulário do código (teclado numérico grande); com cookie → `eu` → monta `TotemQuiosque` (ou "tipo sem UI ainda" para TV_INDOOR).

## 6. Migrations

**PDV — `20260910130000_aparelhos_pareamento_heartbeat`**
```sql
ALTER TABLE "Dispositivo" ADD COLUMN "pareamentoCodigo" TEXT;
ALTER TABLE "Dispositivo" ADD COLUMN "pareamentoExpiraEm" TIMESTAMP(3);
ALTER TABLE "Dispositivo" ADD COLUMN "pareamentoTentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Dispositivo" ADD COLUMN "credencialHash" TEXT;
ALTER TABLE "Dispositivo" ADD COLUMN "pareadoEm" TIMESTAMP(3);
ALTER TABLE "Dispositivo" ADD COLUMN "ultimoHeartbeatEm" TIMESTAMP(3);
ALTER TABLE "Dispositivo" ADD COLUMN "heartbeatJson" JSONB;
CREATE UNIQUE INDEX "Dispositivo_pareamentoCodigo_key" ON "Dispositivo"("pareamentoCodigo");
CREATE UNIQUE INDEX "Dispositivo_credencialHash_key" ON "Dispositivo"("credencialHash");
CREATE INDEX "Dispositivo_empresaId_tipo_idx" ON "Dispositivo"("empresaId", "tipo");
```
(`token` permanece `NOT NULL`.)

**PDV — `20260910140000_pedido_totem_envio`**
```sql
CREATE TABLE "PedidoTotemEnvio" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL, "dispositivoId" INTEGER NOT NULL,
  "chaveIdempotencia" TEXT NOT NULL, "orderId" TEXT NOT NULL, "displayIdEnviado" TEXT NOT NULL,
  "orderType" TEXT NOT NULL, "status" TEXT NOT NULL,
  "cwOrderId" INTEGER, "cwDisplayId" INTEGER, "cwStatusInicial" TEXT,
  "totalCalculado" DECIMAL(12,2), "cotacaoHash" TEXT,
  "carrinhoJson" JSONB NOT NULL, "respostaJson" JSONB, "erroCodigo" TEXT, "erroDetalhe" TEXT,
  "tentadoEm" TIMESTAMP(3) NOT NULL, "reconciliadoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PedidoTotemEnvio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PedidoTotemEnvio_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PedidoTotemEnvio_orderId_key" ON "PedidoTotemEnvio"("orderId");
CREATE UNIQUE INDEX "PedidoTotemEnvio_dispositivoId_chaveIdempotencia_key" ON "PedidoTotemEnvio"("dispositivoId", "chaveIdempotencia");
CREATE INDEX "PedidoTotemEnvio_empresaId_criadoEm_idx" ON "PedidoTotemEnvio"("empresaId", "criadoEm");
CREATE INDEX "PedidoTotemEnvio_empresaId_status_idx" ON "PedidoTotemEnvio"("empresaId", "status");
```
(+ `'pedidoTotemEnvio'` no `MODELS_TENANT`; `empresaId` sem FK, convenção do PDV.)

**HUB — `20260910120000_pedido_cardapio_external_order_id`**
```sql
ALTER TABLE "PedidoCardapio" ADD COLUMN "externalOrderId" TEXT;
CREATE INDEX "PedidoCardapio_clienteId_externalOrderId_idx" ON "PedidoCardapio"("clienteId", "externalOrderId");
```

## 7. Códigos de erro (contrato único, HUB → PDV → aparelho)
`APARELHO_NAO_PAREADO` 401 · `CODIGO_INVALIDO` 401 · `LOJA_INATIVA`/`LOJA_FECHADA`/`MODO_INDISPONIVEL` 422 · `CARRINHO_VAZIO`/`CARRINHO_GRANDE` 422 · `ITEM_INDISPONIVEL`/`ITEM_EM_FALTA`/`ITEM_FORA_DE_HORARIO`/`ITEM_NAO_SUPORTADO`/`ESTOQUE_INSUFICIENTE` 422 · `GRUPO_OBRIGATORIO`/`GRUPO_LIMITE`/`GRUPO_CALCULO_NAO_SUPORTADO`/`OPCAO_INDISPONIVEL`/`OPCAO_EM_FALTA` 422 · `PAGAMENTO_INVALIDO` 422 · `COTACAO_INVALIDA` 422 · `COTACAO_DIVERGENTE`/`COTACAO_EXPIRADA` 409 · `CW_RECUSOU` 422 · `CW_RATE_LIMIT` 503 · `CW_INDISPONIVEL` 502 (`ambiguo:true` só em `pedido`) · `HUB_INDISPONIVEL`/`HUB_NAO_CONFIGURADO`/`CATALOGO_INDISPONIVEL` 503 · `CLIENTE_SEM_CW` 409 (`conectado:false`). Erros `4xx` são determinísticos (nada foi criado); só `CW_INDISPONIVEL` com `ambiguo:true` gera `AMBIGUO`.

## 8. Testes
- **HUB puros (`node --test`, CJS):** `cardapioMerchant.test.js` — `abertaAgora` (tz IANA, `temporary_state` open/closed com/sem `_end_at`, `custom_dates`, dia vazio, virada de meia-noite), `podeOperar`, `metodosPagamentoTotem` (filtro active/available_on_menu, taxa excluída, `kindAmbiguo`, kinds fora da Fase A). `cardapioPedidoTotem.test.js` — cada código de erro do §4.5 com um caso; preço promocional com e sem schedule; `allowed_times` de categoria e de item; estoque somando linhas; SINGLE/MULTIPLE/SUMMABLE; não-SUM recusado; `createOrder` idêntico ao formato oficial (o payload do teste de 06/09 vira **golden**: item 2979325 + 3633259 + 2982000 → `13.50`); `cotacaoHash` estável e sensível a preço/opção/modo/método; assinatura HMAC válida/expirada/adulterada.
- **PDV puros:** `aparelhos.test.js` (código 6 dígitos, expiração, tentativas, hash/credencial, `online`), `totemEnvio.test.js` (máquina de estados — todas as transições permitidas e proibidas; classificação de erro → estado; referência estável antes do INSERT; janela de reconciliação 15 min/6 h).
- **Contrato:** teste da ponte com `fetch` mockado (status → `{http, codigo, ambiguo}`); teste de idempotência (mesma chave → mesma resposta; sem 2º INSERT).
- **Smoke manual (checkpoints):** parear/revogar/re-parear; heartbeat online/offline; pedido `takeout` e `onsite` com `#display` do CW; `COTACAO_DIVERGENTE` mudando preço no CW entre revisar e confirmar; item `MISSING` bloqueado; timeout simulado → `AMBIGUO` → reconciliado; **autoaceite com loja aberta** (define a política de `/confirm` da Fase B); `order_id` repetido → 422 (uma vez, em pedido de teste).

## 9. Riscos e limites conhecidos
Brute force do código (mitigado); cookie em dev (proxy); janela de 25 s do estado operacional (loja pode fechar entre `cotar` e `pedido` — o CW é quem decide, e um 422 vira `REJEITADO`); rate limit sem orçamento global (1 totem/loja é folgado); `AVAILABLE_FOR_TOTEM='service_desk'` é hipótese a confirmar no smoke; latência de 30 min nos relatórios do HUB (upsert imediato fica para a Fase B); combos e grupos não-SUM omitidos silenciosamente do totem (e listados em `avisos` do bootstrap para o admin).
