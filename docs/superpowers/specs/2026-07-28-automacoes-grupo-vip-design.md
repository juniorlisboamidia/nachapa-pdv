# Automações › Grupo VIP — Design

**Goal:** Um módulo de marketing no PDV para o "Grupo VIP" da loja no WhatsApp: conectar um número dedicado, escolher o grupo, cadastrar mensagens prontas com **agenda semanal recorrente** (ex.: toda terça 18h "terça em dobro"), e — opcionalmente por mensagem — **criar um cupom no Cardápio Web** no momento do disparo, anunciando o código na própria mensagem.

**Architecture:** Reusa a infra que já existe: UAZAPI (`backend/zapi.mjs`) para conectar/enviar WhatsApp, e o padrão de agendador in-process (`setInterval` + varredura fora do tenantStore, igual ao lembrete do checklist). Models novos no banco `operacao`. A criação de cupom reusa a **ponte que já existe no HUB** (`POST /api/internal/cardapio-cupom` → Cardápio Web): o PDV assina um token de serviço (JWT compartilhado via SSO) e chama o HUB — com **um ajuste pequeno no HUB** para aceitar o `svc` do PDV. Só **texto** no v1.

**Tech Stack:** Backend Express 5 ESM (`backend/server.js`), Prisma 7 + adapter-pg, Postgres `operacao`. Frontend React 19 + Vite. WhatsApp: UAZAPI. Cupom: HUB (Traffic Hub) → Cardápio Web (`/api/partner/v1/merchant/coupons`). Deploy PDV `bash deploy.sh`; o ajuste do HUB precisa de deploy próprio do HUB.

---

## Contexto e o que já existe

- **UAZAPI (`backend/zapi.mjs`):** `zapiEnviarTexto(numero, texto)` (POST `/send/text` com `{number,text}`), `zapiStatus()`, `zapiQrCode()` (POST `/instance/connect` → QR base64), `zapiCriarInstancia(nome)` (POST `/instance/create`, exige `UAZAPI_ADMIN_TOKEN`), `zapiConfigurado()`. O `req(method, path, body, token)` interno **já recebe o token por parâmetro** — hoje todas as funções passam `INSTANCE_TOKEN()` (do `.env`, a instância do OTP/alertas).
- **Agendador:** `iniciarAgendadorLembretes()` = `setInterval(varrerLembretes, 5min)` (`backend/server.js` ~2618), roda FORA do tenantStore com `empresaId` explícito e dedup por marcador único (`ChecklistLembreteEnviado`).
- **Cupom no HUB (Traffic Hub, `backend/server.js` ~9826):** `POST /api/internal/cardapio-cupom`, auth `Bearer <JWT de serviço>` com `svc:'h360-dashboard'` (verificado contra `JWT_SECRET`), body `{ clienteId, coupon }`. Cria o cupom no CW via `POST ${CARDAPIOWEB_BASE_URL}/api/partner/v1/merchant/coupons` (headers `cwHeaders(cliente)` = X-API-KEY da loja + partner key). Sem CW vinculado ⇒ `{ conectado:false }`. **O PDV compartilha o `JWT_SECRET`/SSO com o HUB** (aceita o cookie `th_sso` do `.nachapahub.com.br`), então pode assinar um token que o HUB valida.
- **PDV não fala com o HUB hoje** e **não tem nenhuma integração Cardápio Web** — tudo novo aqui é do zero (menos a ponte do HUB, que já existe).
- **"Automações"** é hoje um item solto na sidebar (`{ label:'Automações', to:'/automacoes' }`) apontando pra um `EmConstrucao`.

## Decisões travadas (brainstorming)

1. **Escopo v1 = tudo junto:** disparo agendado **E** criação do cupom no CW.
2. **Número dedicado:** instância UAZAPI **própria do marketing**, conectada por **QR** na tela (separada do número transacional de OTP).
3. **Cupom por mensagem, 2 modos:** "novo a cada disparo" (cria no CW a cada envio, código automático injetado em `{cupom}`) OU "fixo/existente" (referencia um código fixo, sem criar).
4. **Ponte de cupom via HUB** (reusa `/api/internal/cardapio-cupom`), com ajuste no HUB para aceitar o `svc` do PDV + `clienteId` da loja guardado na config.
5. **Só texto no v1** (sem imagem/mídia). Falha na criação do cupom **não** derruba o disparo (best-effort).

---

## 1. Modelos de dados (banco `operacao`)

**Enums:** `GrupoVipCupomModo { NENHUM, NOVO_POR_DISPARO, FIXO }`, `CupomTipoCW { FREE_SHIPPING, PERCENT_DISCOUNT, FLAT_DISCOUNT }`. Dias da semana são `Int[]` (0=dom..6=sáb), consistente com `Funcionario.folgaSemana`/`Checklist.diasSemana` do projeto — sem enum.

**`GrupoVipConfig`** (1/loja, `@@unique([empresaId])`):
- `empresaId Int`
- `instanceName String?`, `instanceToken String?` — a instância UAZAPI dedicada do marketing (criada sob demanda).
- `grupoJid String?`, `grupoNome String?` — o grupo VIP escolhido.
- `hubClienteId String?` — o `clienteId` da loja no HUB (pra ponte de cupom; colado uma vez).
- `ativo Boolean @default(false)` — liga/desliga o módulo inteiro.
- timestamps.

**`GrupoVipMensagem`**:
- `empresaId Int`
- `rotulo String` — nome interno ("Terça em dobro").
- `texto String` — o corpo (aceita a variável `{cupom}`).
- `diasSemana Int[]` — dias (0=dom..6=sáb) em que dispara.
- `horario String` — "HH:MM" (BR).
- `ativa Boolean @default(true)`.
- `cupomModo GrupoVipCupomModo @default(NENHUM)`.
- Campos do cupom (usados quando `cupomModo != NENHUM`): `cupomTipo CupomTipoCW?`, `cupomValor Decimal?`, `cupomNome String?`, `cupomCodigoFixo String?` (modo FIXO), `cupomValidadeHoras Int?` (modo NOVO: janela de validade a partir do disparo; ex.: 6h), `cupomPedidoMinimo Decimal?`, `cupomLimiteUso Int?`, `cupomSoNovosClientes Boolean?`.
- timestamps. `@@index([empresaId])`.

**`GrupoVipDisparo`** (log + dedup):
- `empresaId Int`, `mensagemId Int`, `dataRef DateTime` (00:00 BR do dia da ocorrência — garante 1 disparo/dia/mensagem).
- `status String` — ENVIADO | FALHOU.
- `erro String?`, `cupomCode String?` (o código criado/usado), `conteudo String?` (o texto final enviado).
- `criadoEm DateTime @default(now())`.
- `@@unique([empresaId, mensagemId, dataRef])` (dedup — não repete no mesmo tick nem após restart), `@@index([empresaId, criadoEm])`.

`MODELS_TENANT` += `'grupoVipConfig','grupoVipMensagem','grupoVipDisparo'`.

## 2. WhatsApp — instância dedicada + grupo

**`backend/zapi.mjs` (refactor mínimo):** parametrizar as funções que hoje usam `INSTANCE_TOKEN()` para aceitar um token opcional — `zapiEnviarTexto(numero, texto, token = INSTANCE_TOKEN())`, `zapiStatus(token = INSTANCE_TOKEN())`, `zapiQrCode(token = INSTANCE_TOKEN())`. O OTP/alertas continuam usando o default (env); o Grupo VIP passa o `GrupoVipConfig.instanceToken`. Novo helper `zapiListarGrupos(token)` (GET do endpoint de grupos do UAZAPI — confirmar o path exato na implementação; ex.: `/group/list` ou equivalente) devolvendo `[{ jid, nome }]`.

**Fluxo de conexão (endpoints admin):**
- `POST /api/grupo-vip/instancia` — cria a instância UAZAPI dedicada (`zapiCriarInstancia`), guarda `instanceName`/`instanceToken` na config. Idempotente (se já existe, retorna a atual).
- `GET /api/grupo-vip/qr` — QR da instância dedicada (`zapiQrCode(config.instanceToken)`).
- `GET /api/grupo-vip/status` — status da conexão (`zapiStatus(config.instanceToken)`).
- `GET /api/grupo-vip/grupos` — lista os grupos do número conectado (`zapiListarGrupos`); fallback: o front permite **colar o JID** do grupo manualmente.
- `PUT /api/grupo-vip/config` — salva `grupoJid`/`grupoNome`, `hubClienteId`, `ativo`.

## 3. Mensagens + agendador

**CRUD admin:** `GET/POST/PUT/DELETE /api/grupo-vip/mensagens` (dentro do gate; valida `horario` HH:MM, `diasSemana` ⊂ 0-6, `texto` não vazio; se `cupomModo != NENHUM`, valida os campos do cupom conforme o tipo).

**Regra pura (testável) — `backend/grupoVip.js`:** `mensagensParaDisparar(agoraMs, mensagens, jaDisparados)` — dado o instante atual (BR), a lista de mensagens ativas e o conjunto de ocorrências já disparadas hoje, devolve as que vencem agora: `diasSemana.includes(dowBR)` **E** `agoraMinBR >= horarioMin` **E** ainda não disparada hoje. Fuso BR fixo (`brFields`). Sem teto de atraso no mesmo dia (dispara mesmo se o tick pegou 18:03 em vez de 18:00); não recupera de dias anteriores.

**Agendador `varrerGrupoVip()`** (novo `setInterval`, ~1min; FORA do tenantStore, `empresaId` explícito em toda query — igual `dispararLembretesLoja`): para cada loja com `GrupoVipConfig.ativo` + grupo + instância conectada, calcula as mensagens a disparar, e para cada uma: (a) cria o marcador `GrupoVipDisparo` ANTES de enviar (dedup por `@@unique` — P2002 ⇒ pula); (b) resolve o cupom (§4); (c) monta o texto (injeta `{cupom}`); (d) `zapiEnviarTexto(grupoJid, texto, instanceToken)`; (e) atualiza o `GrupoVipDisparo` com status/erro/cupomCode/conteúdo. Erro de cupom ou de envio fica no log; nunca derruba a varredura das demais.

## 4. Cupom — ponte PDV→HUB→CW

**Modos (por mensagem):**
- **NENHUM:** `{cupom}` (se existir no texto) vira string vazia; nenhum cupom criado.
- **NOVO_POR_DISPARO:** no disparo, o PDV monta o payload do cupom a partir dos campos da mensagem (tipo/valor/nome/pedido mínimo/limite/só-novos), gera um **código automático** (ex.: `VIP` + 4-5 chars sem ambíguos), define `available_from = agora` e `expires_at = agora + cupomValidadeHoras`, e chama a ponte. Injeta o código em `{cupom}`.
- **FIXO:** usa `cupomCodigoFixo` direto em `{cupom}`, **sem** criar nada (o gestor gerencia esse cupom no CW por fora). Só anuncia o código.

**Ponte (novo em `backend/server.js` + `backend/cardapioCupom.js`):** função `criarCupomCW(hubClienteId, coupon)` que assina um JWT de serviço (`jwt.sign({ svc:'pdv-operacao' }, JWT_SECRET, { expiresIn:'2m' })`) e faz `POST ${HUB_API_URL}/internal/cardapio-cupom` com `Authorization: Bearer <token>` e body `{ clienteId: hubClienteId, coupon }`. `HUB_API_URL` no `.env` do PDV (ex.: `http://127.0.0.1:<porta-hub>/api` — HUB e PDV no mesmo VPS). Contrato do `coupon` (do endpoint do HUB): `type` ∈ `free_shipping|percent_discount|flat_discount`, `name`, `value` (obrigatório salvo free_shipping; percent ≤ 100), opcionais `code`, `use_limit`, `new_customers_only`, `minimum_order_value`, `available_from`, `expires_at`. Retorno `{ conectado:true, coupon }` ou `{ conectado:false }` (loja sem CW — o disparo segue, `{cupom}` cai no código fixo ou vazio, e o log registra "CW não vinculado").

**Ajuste no HUB (Traffic Hub, cross-repo):** em `POST /api/internal/cardapio-cupom` (e, se quiser paridade, nos outros `/api/internal/cardapio-cupom*`), aceitar também `svcPayload.svc === 'pdv-operacao'` além de `'h360-dashboard'`. Mudança de 1 linha; precisa de deploy do HUB. `JWT_SECRET` já é compartilhado (SSO), então o token do PDV valida.

**Config do `hubClienteId`:** o gestor cola uma vez, na tela do Grupo VIP, o `clienteId` da loja no HUB (é o mesmo id que o H360 usa na ponte). Sem ele, o cupom não cria (mensagem segue como texto/código fixo).

## 5. Frontend

**Sidebar:** "Automações" vira **grupo** com `itens: [{ to:'/automacoes/grupo-vip', label:'Grupo VIP', icon:'marketing' }]` (o item solto atual vira o grupo). Rota nova `automacoes/grupo-vip`.

**Página `GrupoVip`:** três blocos —
1. **Conexão:** status do número (conectado/desconectado), botão Conectar → modal com QR (poll de status), seletor do grupo VIP (lista + fallback colar JID), campo `hubClienteId`, toggle "Grupo VIP ativo".
2. **Mensagens:** lista (rótulo, dias+horário, cupom-modo, ativa) + "Nova mensagem" (modal: rótulo, texto com dica da variável `{cupom}`, chips de dias, horário, e a seção de cupom com o seletor de modo + campos do tipo). Editar/excluir.
3. **Histórico:** últimos disparos (`GrupoVipDisparo`): quando, mensagem, status, código do cupom, erro.

Modais fecham só por botão (regra do projeto). Reusa `Toast`/`ConfirmDialog`/classes do módulo.

## 6. Fora do escopo (v1)

Múltiplos grupos, segmentação de clientes, métricas de abertura/clique (WhatsApp não fornece), mídia/imagem/botões no disparo, A/B, editar cupom já criado, fila/retry de disparo.

## 7. Testes

- `backend/grupoVip.test.js` (padrão `node`): `mensagensParaDisparar` — dia certo/errado, antes/depois do horário, dedup (já disparada hoje), múltiplos dias, fuso BR, lista vazia.
- Contrato do cupom: teste puro que monta o payload CW a partir dos campos da mensagem (tipos, validação de value/percent, geração de código, available_from/expires_at) — sem rede.
- Verificação: `node backend/grupoVip.test.js`, `node --check backend/server.js`, `npm run build`. Smoke e2e manual: conectar número, escolher grupo, criar mensagem Ter 18:00 com cupom % 20, esperar/forçar o disparo, conferir mensagem no grupo + cupom no CW + log.

## 8. Migration & deploy

- Migration PDV `backend/prisma/migrations/<timestamp>_grupo_vip/migration.sql` (enums + 3 tabelas multi-tenant + índices). ⚠️ **Armadilha conhecida do PDV:** `prisma migrate dev` num banco com DRIFT empacota DROPs de outros models na migration — gerar e **conferir o SQL** (deixar SÓ o Grupo VIP); se contaminar, limpar à mão + acertar checksum (padrão já usado na feature de Afastamentos). `npx prisma generate` explícito.
- `.env` do PDV: `HUB_API_URL` (interno, mesmo VPS). `UAZAPI_ADMIN_TOKEN` já necessário pra criar instância.
- Deploy PDV: `cd /var/www/nachapa-pdv && git pull && bash deploy.sh`.
- **Deploy HUB:** subir o ajuste do `svc:'pdv-operacao'` no `/api/internal/cardapio-cupom` (repo Traffic Hub, `bash deploy.sh` de lá).

## 9. Invariantes e riscos

- **Fuso BR fixo** (`brFields`/`brToUtcMs`); horários de disparo em BR; `dataRef` do dedup = 00:00 BR do dia.
- **Dedup antes de enviar** (cria `GrupoVipDisparo` antes; P2002 ⇒ pula) — não duplica no mesmo tick nem após restart.
- **Best-effort:** falha de cupom OU de envio nunca trava a varredura das outras mensagens/lojas; tudo isolado em try/catch por mensagem e por loja, `empresaId` explícito (fora do tenantStore).
- **Multi-tenant:** models em `MODELS_TENANT`; rotas admin dentro do gate; agendador fora do gate com `empresaId` explícito.
- **Segurança do token de serviço:** JWT de vida curta (2min), `svc:'pdv-operacao'`; o HUB só aceita esse svc no endpoint interno. Não expor o `instanceToken`/`hubClienteId` em respostas públicas.
- **Risco externo:** o path exato de listar grupos no UAZAPI e o comportamento de `available_days`/horário do CW são incertezas a confirmar na implementação — por isso o v1 usa `available_from`/`expires_at` (janela absoluta, bem suportada) e o fallback de colar o JID do grupo.
