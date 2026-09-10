# Totem — Fase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Não iniciar sem autorização explícita do Junior.**

**Goal:** aparelho pareado ao PDV cria pedidos (`onsite`/`takeout`, pagamento offline) no Cardápio Web através do HUB, com cotação assinada, outbox auditável e reconciliação segura.
**Architecture:** HUB = autoridade de catálogo/preço + única ponte com o CW (internos `cardapio-totem-*`); PDV = identidade do aparelho (cookie), outbox `PedidoTotemEnvio`, job de reconciliação e UI; aparelho = só cookie + UI.
**Tech Stack:** HUB Express CommonJS + Prisma (`node --test`, padrão `t()` de `cardapioFaltas.test.js`); PDV Express ESM + Prisma + React/Vite (`node --test` ESM).
**Spec:** `docs/superpowers/specs/2026-09-10-totem-fase-a-design.md` (fonte de verdade de contratos, estados, códigos de erro e migrations).

## Global Constraints
- **Repos:** HUB `C:\Users\Windows\Traffic Hub` (tasks H*), PDV `C:\Users\Windows\nachapa-pdv` (tasks P*). Nunca misturar commits entre repos.
- **Credenciais:** nada do CW no PDV nem no aparelho; PDV assina `svc:'pdv-operacao'` no servidor; `HUB_API_URL`/`JWT_SECRET` do env, sem default.
- **Migrations:** à mão, aditivas, nomes fixos da spec §6; nunca `prisma migrate dev`. ⚠️ HUB: `deploy.sh` **não** roda migrate — `npx prisma migrate deploy` antes.
- **Tenant/gate (PDV):** rotas `/api/public/aparelho/*` são isentas dos gates e **fora do tenant** — todo `where`/`create` com `empresaId` explícito. Model novo entra no `MODELS_TENANT`; rota admin nova entra em `acessos/areas.js` (fail-closed).
- **Preserva:** `Dispositivo.token` NOT NULL e gerado sempre; fluxos PONTO/ETIQUETA intocados; `autenticarSvcH360` intocado.
- **UI:** modais só fecham por botão; nada de `window.confirm`; `useEffect` sem Promise; contraste forte; identidade laranja; totem/pareamento standalone (sem Layout), alvos ≥ 44 px, `100dvh`.
- **Git:** `git add` explícito; commit por task; push só nos checkpoints; nunca `-A`; `frontend/public/favicon_novo.png` não é nosso; nunca `taskkill`.
- **Verificação por task:** testes puros da task; `node --check` (backend); `npm run build` (frontend); `prisma validate && generate` quando o schema mudar.

---

## Bloco H — HUB (`Traffic Hub`)

### Task H1: Refrescar as specs OpenAPI do CW
**Files:** Replace `backend/docs/cardapioweb/API-Pedidos.openapi.json`, `API-Loja.openapi.json`, `API-Catalogo.openapi.json`; Create `API-Autenticacao.openapi.json`; Modify `backend/docs/cardapioweb/ESTUDO.md` (nota: specs baixadas de `https://docs.cardapioweb.com/reference/api-*.json` em 2026-09-10; `POST /orders` existe; `sales_channel=integration`).
- [ ] Baixar os 4 JSON oficiais (`curl -sS -L`), validar com `node -e "JSON.parse(...)"`, conferir `paths` (Pedidos: 15 operações, incl. `create-order`).
- [ ] Commit: `docs(cardapioweb): specs OpenAPI atualizadas (POST /orders, prepared/dispatch, summary, autenticacao)`.

### Task H2: `autenticarSvcInterno` + `externalOrderId`
**Files:** Modify `backend/server.js` (helper ao lado de `autenticarSvcH360` ~14320); Modify `backend/prisma/schema.prisma` (`PedidoCardapio.externalOrderId String?` + `@@index([clienteId, externalOrderId])`); Create `backend/prisma/migrations/20260910120000_pedido_cardapio_external_order_id/migration.sql` (SQL da spec §6); Modify `backend/cardapioPedidosSync.js:108-133` (`externalOrderId: d.external_order_id ?? null`).
**Interfaces:** `autenticarSvcInterno(req, res, svcs: string[]) → payload | null` (envia 401/403 sozinho).
- [ ] Helper + migration + upsert; `npx prisma validate && npx prisma generate`; `node --check backend/server.js`.
- [ ] Commit: `feat(cardapio): auth de servico com allowlist + externalOrderId no PedidoCardapio`.

### Task H3: `backend/cardapioMerchant.js` (puro) + caches
**Files:** Create `backend/cardapioMerchant.js`, `backend/cardapioMerchant.test.js`; Modify `backend/server.js` (funções `buscarMerchantEstatico(cliente)` [10 min] e `buscarMerchantOperacional(cliente)` [25 s], ao lado de `cardapioWebMerchantCache` ~10454).
**Interfaces:** `abertaAgora(operacional, agoraUtc: Date) → boolean`; `podeOperar(operacional, orderType) → { ok, codigo? }`; `metodosPagamentoTotem(listaIds, listaMerchant) → { metodos:[{id, kind, name, kindAmbiguo}], avisos:[] }`; `extrairOperacional(merchant) → { status, operation_modes, opening_hours }`; `extrairEstatico(merchant, listaIds) → { nome, logo, timezone, metodos, avisos }`.
- [ ] Testes RED (casos da spec §8: tz IANA, `temporary_state` com/sem `_end_at`, `custom_dates`, dia vazio, virada de meia-noite; `podeOperar` por modo/status/immediate; métodos: filtro, taxa excluída, `kindAmbiguo`, kinds fora da Fase A) → implementar → GREEN.
- [ ] Caches no server.js (mesmo padrão `Map` + TTL); `node --check`.
- [ ] Commit: `feat(cardapio): estado operacional e metodos de pagamento do merchant (puro + cache 25s/10min)`.

### Task H4: `backend/cardapioPedidoTotem.js` (validador + preço + CreateOrder + cotação)
**Files:** Create `backend/cardapioPedidoTotem.js`, `backend/cardapioPedidoTotem.test.js`.
**Interfaces:** `validarECotar({ catalogo, operacional, metodos, agoraUtc, orderType, carrinho, metodoId, timezone }) → { ok:true, linhas, total, createOrderBase } | { ok:false, erros:[{codigo, itemId?, grupoId?, opcaoId?, mensagem}] }`; `montarCreateOrder(base, { orderId, displayId, observacao? })`; `cotacaoHash(clienteId, orderType, metodoId, linhas, total) → hex32`; `assinarCotacao(secret, hash, expiraEm) → string`; `verificarCotacao(secret, { hash, expiraEm, assinatura }, agora) → { ok, codigo? }`; `catalogoParaTotem(catalogo, agoraUtc, timezone) → { categorias, avisos }` (filtra visível/`regular_item`/`service_desk`/SUM; marca MISSING).
- [ ] Testes RED (um caso por código de erro do §4.5/§7; promo com/sem schedule; `allowed_times` de categoria e item; estoque somando linhas; SINGLE/MULTIPLE/SUMMABLE; não-SUM recusado e omitido; **golden**: item 2979325 + opções 3633259/2982000 → `createOrder` com `total_price 13.50`, `order_amount 13.50`, `payments[0].total 13.50`; hash estável/sensível; assinatura válida/expirada/adulterada) → implementar → GREEN. Reusar `visibilidadeDoCatalogo` de `cardapioFaltas.js`.
- [ ] Commit: `feat(cardapio): validador/preco do totem + cotacao assinada (puro, testado)`.

### Task H5: internos `cardapio-totem-*`
**Files:** Modify `backend/server.js` (5 endpoints da spec §4.7, após `/api/internal/cardapio-origens` ~12404).
- [ ] `bootstrap` (catálogo cacheado + operacional 25 s + estático 10 min → `catalogoParaTotem`); `cotar` (cacheados → `validarECotar` → hash+assinatura, `expiraEm=+10min`); `pedido` (verificar cotação → recalcular → comparar hash → `POST /orders` 30 s → classificar: 201 / determinístico / ambíguo → `GET /orders/{id}` 10 s → resposta §4.7); `detalhe`; `reconciliar` (polling `updated_since` + filtro + até 10 detalhes). Todos com `autenticarSvcInterno(['h360-dashboard','pdv-operacao'])`, `select {id, cardapioWebApiKey}`, `conectado:false` sem chave.
- [ ] `node --check`; teste manual com `curl` local assinando `svc` (sem POST real ao CW: usar `cotar` e `bootstrap` contra a loja do Hamburgão).
- [ ] Commit: `feat(cardapio): internos do totem (bootstrap, cotar, pedido, detalhe, reconciliar)`.

### ✅ Checkpoint H (controlador)
`git push origin main` · VPS: `cd /var/www/nachapahub/backend && npx prisma migrate deploy && cd .. && bash deploy.sh` · Smoke: `bootstrap`/`cotar` respondem para o Hamburgão; `pedido` só depois do checkpoint P.

---

## Bloco P — PDV (`nachapa-pdv`)

### Task P1: Schema + migrations
**Files:** Modify `backend/prisma/schema.prisma` (campos de `Dispositivo` §3.1; `model PedidoTotemEnvio` §5.3); Create `backend/prisma/migrations/20260910130000_aparelhos_pareamento_heartbeat/migration.sql` e `20260910140000_pedido_totem_envio/migration.sql` (SQL literal da spec §6); Modify `backend/server.js` `MODELS_TENANT` (`'pedidoTotemEnvio'`).
- [ ] `npx prisma validate && npx prisma generate`; `node --check`.
- [ ] Commit: `feat(pdv aparelhos): pareamento/heartbeat no Dispositivo + outbox PedidoTotemEnvio (migrations)`.

### Task P2: `backend/aparelhos.js` (puro) + rotas admin + rotas públicas de pareamento/heartbeat
**Files:** Create `backend/aparelhos.js`, `backend/aparelhos.test.js`; Modify `backend/server.js` (rotas `/api/aparelhos*` §3.4, `/api/public/aparelho/{parear,eu,heartbeat}` §3.2-3.3, middleware `resolverAparelhoPorCookie`, limiter por IP em memória); Modify `backend/acessos/areas.js` (`aparelhos`, prefixos `/aparelhos`, `/totem`); Modify `frontend/src/pages/MinhaEmpresa.jsx` (`AREA_LABEL`); Modify `backend/.env.example` (documentar `HUB_API_URL`).
**Interfaces:** `gerarCodigoPareamento() → '000000'..'999999'`; `gerarCredencial() → { credencial, hash }`; `hashCredencial(s) → hex`; `estaOnline(ultimoHeartbeatEm, agora) → boolean`; `cookieAparelho(credencial) → string` (atributos da spec); `avaliarTentativa(disp, codigo, agora) → { ok } | { codigo:'CODIGO_INVALIDO', invalidar:boolean }`.
- [ ] Testes RED (código 6 dígitos com zeros à esquerda; expiração; 5ª tentativa invalida; hash determinístico; `estaOnline` 149 s/151 s; cookie com `HttpOnly; Secure; SameSite=Strict; Path=/api/public/aparelho`) → GREEN.
- [ ] Rotas + gate + `node --check`. Rotas públicas: `empresaId` explícito em tudo; `token` gerado no POST admin mesmo para TOTEM/TV.
- [ ] Commit: `feat(pdv aparelhos): area Aparelhos, pareamento por codigo + cookie HttpOnly, heartbeat`.

### Task P3: ponte `backend/cardapioPedido.js` + `backend/totemEnvio.js` (puro) + rotas públicas do totem + job
**Files:** Create `backend/cardapioPedido.js`, `backend/totemEnvio.js`, `backend/totemEnvio.test.js`, `backend/cardapioPedido.test.js` (fetch mockado); Modify `backend/server.js` (rotas §5.2, admin `GET /api/totem/pedidos`, `POST /api/totem/pedidos/:id/reconciliar`, job §5.4 com lock, snapshot em memória por empresa).
**Interfaces (totemEnvio.js):** `novaReferencia(aparelhoId, uuid) → { orderId, displayIdEnviado }`; `classificarResposta({ http, codigo, ambiguo, corpo }) → 'CRIADO'|'REJEITADO'|'AMBIGUO'`; `transicao(status, evento) → status` (lança em transição proibida); `precisaReconciliar(envio, agora) → 'RECONCILIAR'|'FALHAR'|'NADA'`; `precisaDisplay(envio, agora) → boolean`.
- [ ] Testes RED (referência estável e independente do id; classificação por status/código; máquina de estados completa — incl. `AMBIGUO` nunca → `ENVIANDO`; janelas 15 min/6 h/24 h; ponte: 201→criado, 422→determinístico, timeout→`ambiguo:true`, sem env→`HUB_NAO_CONFIGURADO`) → GREEN.
- [ ] Rotas: idempotência por `(dispositivoId, chaveIdempotencia)` antes de qualquer INSERT; INSERT `ENVIANDO` **antes** da ponte; transições só via `transicao`; `503` sem gravar nada quando o HUB estiver fora antes do INSERT. Job 60 s.
- [ ] `node --check`. Commit: `feat(pdv totem): ponte com o HUB, outbox com maquina de estados, rotas publicas do totem e reconciliacao`.

### Task P4: Frontend — Aparelhos (admin), pareamento e totem
**Files:** Create `frontend/src/pages/Aparelhos.jsx`, `frontend/src/pages/DispositivoPareamento.jsx`, `frontend/src/pages/TotemQuiosque.jsx`, `frontend/src/pages/TotemPedidos.jsx`, `frontend/src/components/totemCarrinho.js` (+ `.test.js`: regras de UI SINGLE/MULTIPLE/SUMMABLE, contagem por grupo, montagem do `carrinho` no formato do contrato — **sem preço**); Modify `frontend/src/App.jsx` (rotas: `aparelhos`, `totem/pedidos` dentro do `RequireAuth`; `dispositivo` fora); Modify `frontend/src/components/sidebarNav.js`; Modify `frontend/vite.config.js` (proxy `/api`); Modify `frontend/src/styles/global.css` (`.ttm-*` do totem, `.apr-*` dos aparelhos; reaproveitar `.pub-*`).
- [ ] `totemCarrinho.test.js` RED→GREEN; telas conforme spec §5.5-5.7 (fluxo, erros, polling do display, inatividade 90 s, número **numérico** do CW em destaque).
- [ ] `npm run build`. Commit: `feat(pdv totem): telas de Aparelhos, pareamento e totem de autoatendimento`.

### ✅ Checkpoint P (controlador)
`git push origin main` · VPS: `cd /var/www/nachapa-pdv && bash deploy.sh` (aplica as 2 migrations) · Smoke da spec §8: parear/revogar; heartbeat; pedido `takeout` real (cancelar no painel depois); `COTACAO_DIVERGENTE`; item `MISSING`; **autoaceite com loja aberta**; `order_id` repetido (uma vez).

### Task P5 (pós-smoke): ajustes de mapeamento
- [ ] Se o smoke mostrar que `takeout` exige `available_for ∋ delivery`, trocar a constante `AVAILABLE_FOR_TOTEM` por mapa por `orderType` (HUB H4) e re-testar. Registrar a política de `/confirm` (Fase B) conforme o resultado do autoaceite.
