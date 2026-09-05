# Repaginada da sidebar do PDV + importação de módulos do H360 — Design

**Data:** 2026-09-05 · **Status:** aprovado pelo Junior · **Repo alvo:** `nachapa-pdv` · **Fonte dos módulos:** `Hamburgueria360`

## Objetivo

O PDV é a **bancada de construção** do H360: o que se constrói aqui é portado pra lá. Para isso ele precisa (1) ter a mesma organização de sidebar que o Junior definiu e (2) ter os módulos que o H360 já tem e o PDV não. Esta spec cobre as duas coisas, em fatias deployáveis.

## Decisões fechadas (com o Junior)

| Tema | Decisão |
|---|---|
| Relatórios | **Ligar o PDV ao HUB**, fiel ao H360: os relatórios (Meta, Instagram, Google, Cardápio, AnotaAI) vêm por proxy do HUB usando o `clienteId` da empresa. |
| Estoque | **Importar o CMV Global do H360** e montá-lo na rota `/estoque`. |
| Estrutura da sidebar | **3 níveis com drill** (raiz → grupo → subgrupo), como o H360. Zero retrabalho nas telas existentes. |
| Motoboys | **Grupo inteiro** do H360: Escala, Entregadores, Calc. Frete, Configuração. |
| Abordagem | **Fundação primeiro, módulos em fatias**: Fase 0 entrega a sidebar nova com placeholders; cada fase seguinte troca um placeholder pelo módulo real. Cada fase é deployável sozinha. |
| Identidade visual | Já feita (commits `bd4f272` + `163cac7`): acento e chrome laranja do H360. Nada a fazer aqui. |

## 1. Sidebar — 3 níveis, nova ordem

**Onde:** `frontend/src/components/Sidebar.jsx`. Hoje: array `const grupos = [...]` (l.177-252), formato `{ label, icon, area, itens: [{ to, label, icon }] }`, drill de 2 níveis; `localizarRota(pathname)` (l.263-275) já entende `it.itens` aninhado.

**Formato estendido** (3º nível = `itens` dentro de um item):
```js
{ label, icon, to?, area?, itens?: [
  { to?, label, icon, area?, itens?: [ { to, label, icon, area? } ] }
]}
```
Um nó com `to` e sem `itens` é link; com `itens` é drill. A `area` pode estar em qualquer nível (ver §2).

**Ordem final (a fonte de verdade — não inventar itens fora dela):**
```
Visão Geral                     → /  (link direto, como hoje)
Relatórios  › Meta Ads /relatorios/meta · Instagram /relatorios/instagram · Google Ads /relatorios/google
              · Cardápio /relatorios/cardapio · Google Meu Negócio /relatorios/gmn
Produtos    › Ficha técnica /produtos · Insumos /insumos · Estoque /estoque · Fornecedores /fornecedores
Gestão      › Faturamento /faturamento · Custos /custos
Marketing   › Grupo VIP /marketing/grupo-vip
              · Avaliador › Avaliação /avaliacoes · Clientes /clientes · Respostas /respostas
              · Indicação › Painel Geral /indicacao · Personalização /indicacao/personalizacao
                            · Promotores /indicacao/promotores · Recompensas /indicacao/recompensas
                            · Indicações /indicacao/indicacoes · Cupons /indicacao/cupons
Dep. Pessoal › Colaboradores /rh/colaboradores
              · Ponto Facial › (os 7 itens de hoje, mesmas rotas)
              · Motoboys › Escala /escala-motoboys · Entregadores /entregadores
                          · Calc. Frete /calc-frete · Configuração /motoboys/config
              · Bonificação › (os 5 itens de hoje, mesmas rotas)
              · Banco de talentos › (os 3 itens de hoje, mesmas rotas)
Ferramentas  › Checklist › (os 5 itens de hoje) · Etiquetas › (os 3 itens de hoje)
```
- **Financeiro some** (a rota `/financeiro` era `EmConstrucao`; Faturamento e Custos vivem em Gestão).
- **Automações vira Marketing.** Grupo VIP muda de `/automacoes/grupo-vip` para `/marketing/grupo-vip`, com **redirect** da rota antiga.
- Rotas dos módulos importados **copiam os paths do H360** (fidelidade da bancada): `/avaliacoes`, `/clientes`, `/respostas`, `/indicacao[/:secao]`, `/escala-motoboys`, `/entregadores`, `/motoboys/config`, `/calc-frete`, `/relatorios/*`.
- Sub-páginas de Custos (`/custos-fixos`, `/custos-variaveis`, `/ponto-equilibrio`) e `/ficha-tecnica/*` seguem fora da sidebar, alcançadas pelas telas-mãe.
- **Render:** pilha de navegação `[grupo, subgrupo]`; cabeçalho "‹ {label}" em cada nível; `localizarRota` estendida a 3 níveis para abrir o nível certo no load/refresh. Ícones: reaproveitar o objeto `ICONS`; adicionar `marketing`, `pessoal`, `ferramentas`, `relatorios`, `motoboys`, `avaliador`, `indicacao`, `estoque` se não existirem (SVG inline no mesmo estilo).
- `Equipe.jsx` (`/rh/equipe`) é vestigial: **não entra** na sidebar (já não entra).

## 2. Gate de áreas — filtro por item + chaves novas

**Onde:** `backend/server.js` l.198-226 (`AREAS_DISPONIVEIS`, `AREA_PREFIXOS`, `areaDoPath`, middleware fail-closed em `/api` para `u.tipo === 'operador'`); `Sidebar.jsx` `gruposVisiveis` (l.254-258); `frontend/src/pages/MinhaEmpresa.jsx` `AREA_LABEL` (l.11-15) + aba Acessos / `OperadorModal`.

**Problema:** grupos novos misturam áreas (Dep. Pessoal = `ponto`+`bonificacao`+`talentos`+`motoboys`; Marketing = Grupo VIP + Avaliador + Indicação). `gruposVisiveis` só filtra `g.area` no nível do grupo → operador só com `ponto` veria Bonificação e tomaria 403.

**Solução — filtro recursivo:** um nó com `area` só aparece se `areas.has(area)`; um nó sem `area` herda a do pai; um grupo/subgrupo aparece se tiver ≥1 filho visível. ADMIN (`usuario.tipo !== 'operador'`) vê tudo (como hoje).

**Chaves de área (finais):**

| chave | rótulo na tela Acessos | cobre |
|---|---|---|
| `relatorios` | Relatórios | Relatórios (5 itens) |
| `produtos` | Produtos (ficha, insumos, estoque, fornecedores) | Produtos, incl. Estoque/CMV |
| `gestao` | Gestão (faturamento, custos) | Gestão |
| `marketing` **(nova; substitui `automacoes`)** | Marketing (Grupo VIP, Avaliador, Indicação) | Marketing inteiro |
| `ponto` | Ponto Facial e Colaboradores | Colaboradores + Ponto Facial |
| `motoboys` **(nova)** | Motoboys | Motoboys (4 itens) |
| `bonificacao` | Bonificação | Bonificação |
| `talentos` | Banco de talentos | Banco de talentos |
| `checklist` | Checklist | Checklist |
| `etiquetas` | Etiquetas | Etiquetas |
| ~~`financeiro`~~ | — | **removida** |
| ~~`automacoes`~~ | — | **renomeada para `marketing`** |

**`AREA_PREFIXOS` (paths de API → área)** — adicionar/alterar:
- `marketing`: `/grupo-vip`, `/automacoes`, `/avaliacao`, `/indicacao`
- `motoboys`: `/motoboys`, `/escala-motoboys` (Calc. Frete: se tiver API, `/calc-frete` → `motoboys`; se for só front, nada)
- `produtos`: + `/cmv`
- `relatorios`: `/relatorios`, `/dashboard` (os proxies do H360 usam `/dashboard/*`)
- remover `['/financeiro','financeiro']`
- **Armadilha da ordem:** hoje `areaDoPath` devolve o **primeiro** prefixo que casa. Passar a resolver pelo **prefixo mais longo** (ordenar por comprimento desc, como `acessos/modulos.js:38` do H360). Match continua `path === pre || path.startsWith(pre + '/')`.
- **Regra fail-closed:** toda rota de API nova de cada fase **precisa** de prefixo mapeado, senão todo operador toma 403. Isso é item de checklist de cada fase.

**Migration de dados (Fase 0)** — `backend/prisma/migrations/20260905130000_areas_marketing/migration.sql`:
```sql
-- Renomeia a area 'automacoes' -> 'marketing' e remove 'financeiro' nos acessos ja gravados.
UPDATE "AcessoOperador" SET "areas" = array_replace("areas", 'automacoes', 'marketing') WHERE 'automacoes' = ANY("areas");
UPDATE "AcessoOperador" SET "areas" = array_remove("areas", 'financeiro') WHERE 'financeiro' = ANY("areas");
```
(`AcessoOperador.areas` é `String[]` = `text[]` no Postgres.) Sem isso os gerentes perdem o Grupo VIP em silêncio (fail-closed). `AREAS_DISPONIVEIS` é a fonte de verdade da sanitização em `POST/PUT /api/acessos` — a chave nova entra lá primeiro.

## 3. Módulos — fatias

### Fase 0 — Fundação (sidebar + gate + placeholders)
- §1 e §2 completos.
- Placeholders `EmConstrucao` com título nas rotas que ainda não existem: `/relatorios/*` (5), `/avaliacoes`, `/clientes`, `/respostas`, `/indicacao` e `/indicacao/:secao`, `/escala-motoboys`, `/entregadores`, `/calc-frete`, `/motoboys/config`. `/estoque` já é placeholder.
- Redirect `/automacoes/grupo-vip` → `/marketing/grupo-vip`; remover rota `/financeiro`.
- Migration `20260905130000_areas_marketing`.
- **Resultado:** sidebar nova no ar. Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh`.

### Fase 1 — Avaliador + Indicação (sem migration)
Os models **já existem** no PDV (herdados do fork) e estão no `MODELS_TENANT`: `AvaliacaoCampanha`, `AvaliacaoResposta` (`schema.prisma:1239,1255`); `IndicacaoConfig`, `Promotor`, `Indicacao`, `RecompensaTier`, `Cupom` + enums (`schema.prisma:1301-1438`). Faltam endpoints e páginas.
- **Avaliador** — portar do H360: endpoints admin `/api/avaliacao/campanhas` (GET/POST, PUT/DELETE `/:id`, GET `/:id/relatorio`) e públicos `/api/public/avaliacao/:token` (GET/POST) (H360 `server.js:7503-7620`); páginas `pages/Avaliacao.jsx` (admin) e `pages/AvaliacaoPublica.jsx`; `/clientes` e `/respostas` ficam `EmConstrucao` (como no H360). Sem dependência externa.
- **Indicação** — portar: endpoints públicos `/api/public/indicacao/*` e admin `/api/indicacao/*` (H360 `server.js:7768-8249`), incluindo a **ponte de cupom do Cardápio Web** (`/cw-cupons`, `/cw-webhook`, helpers `criarCupomCardapioWeb` etc., `server.js:7707-7765`) — ela degrada para `{ conectado: false }` sem `clienteId`/HUB e passa a funcionar após a Fase 4; páginas `Indicacao.jsx` (admin, `:secao`), `SejaPromotor.jsx`, `PainelPromotor.jsx`, `IndicacaoAtendente.jsx`, `AmigoIndicacao.jsx`. Verificar se o schema do PDV tem **todos** os campos que os endpoints do H360 usam (as 10 migrations de indicação do H360 são anteriores ao fork `20260708`; se algum campo faltar, migration aditiva pequena).
- CSS: trazer os blocos que essas páginas usam do `global.css` do H360 (já no laranja).

### Fase 2 — Motoboys
Models já existem (`schema.prisma:532-668`, `init`) e estão no `MODELS_TENANT`. **Diferenças a corrigir por migration** `20260905140000_motoboys_campos`: enum `MotoboyStatus` ganha `PENDENTE`; `Motoboy.possuiCnh Boolean?`; `Empresa` ganha `motoboyContatoWhatsapp String?`, `motoboyBloqueadoPodeEscalar Boolean @default(false)`, `motoboyPerguntaCnh Boolean @default(false)` (conferir tipos/defaults exatos nas migrations do H360 `20260804120000_motoboy_status_pendente`, `20260804160000_motoboys_config`).
- Endpoints: escala `/api/escala-motoboys*` (H360 `server.js:6630-6796` + presença `7418`), públicos `/api/public/escala-motoboys/:token*` (`6844-7011`), base `/api/motoboys*` (`7112-7403`). Área `motoboys`.
- Páginas: `Entregadores.jsx`, `EscalaMotoboys.jsx`, `MotoboysConfig.jsx`, `EscalaMotoboysPublica.jsx`, `CalcFrete.jsx`. Rota pública `/escala/motoboys/:token`.
- `backend/scripts/backfill-motoboys.js` só se fizer sentido para dados existentes (o PDV não tem motoboys cadastrados → provavelmente não precisa; decidir no plano).

### Fase 3 — Estoque = CMV Global
O PDV **não tem** os models. Portar do H360: `CmvContagem`, `CmvContagemItem`, `CmvCompra`, `CmvCompraItem` (`schema.prisma:1785-1832`) + migration `20260905150000_cmv_global` (porte da `20260722120000_cmv_global`, aditiva; `empresaId` sem FK, convenção do PDV) + registrar os 4 no `MODELS_TENANT` (`cmvContagem`, `cmvContagemItem`, `cmvCompra`, `cmvCompraItem`).
- Endpoints `/api/cmv*` (H360 `server.js:5264, 5416, 5556, 5622, 5708`). Área `produtos` (prefixo `/cmv`).
- Página `CmvGlobal.jsx` + `components/cmv/ContagemEstoque.jsx`, montada em `/estoque` com título "Estoque" na sidebar (o conteúdo é o CMV Global).

### Fase 4 — Relatórios ligado ao HUB
- **Pré-check (primeiro passo da fase):** no repo do HUB (`Traffic Hub`), ler os endpoints `/internal/cliente-*-insights|dashboard|fonte` e confirmar que aceitam o token `{ svc: 'h360-dashboard' }` assinado com o `JWT_SECRET` compartilhado **independente da origem**. Se checarem origem/app, o ajuste é no HUB (fora desta spec) — parar e alinhar.
- `Empresa.clienteId` **já existe** no PDV (`String`, obrigatório, indexado). Confirmar que a empresa do Hamburgão tem o `clienteId` do HUB preenchido.
- Backend: portar os proxies (`/dashboard/meta|instagram|google|cardapio|cardapio-fonte|anotaai`, H360 `server.js:912-1200`; `/api/relatorios/:fonte` com `REL_FONTE_ENDPOINT`, `1308-1345`) e `backend/relatorios/normalizar.js`. Token de serviço: `jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' })`, `HUB_API_URL` (já existe no PDV pela ponte do Grupo VIP; reaproveitar a constante). Sem `clienteId` → `{ conectado: false }` (tela mostra "desconectado", não quebra).
- Frontend: `pages/relatorios/{RelatorioBase,RelatorioShell,RelatorioMeta,RelatorioInstagram,RelatorioGoogle,RelatorioCardapioSwitch,RelatorioCardapio,RelatorioCardapioAnotaAI}.jsx` + `components/relatorios/SeletorPeriodo`; `/relatorios` → redirect `/relatorios/meta`; GMN = `EmConstrucao`.
- Sidebar: Relatórios já é grupo com 5 itens desde a Fase 0 (placeholders viram páginas reais).

## 4. Rotas públicas (fora do `RequireAuth`)
`/avaliacao/:token` · `/indicacao/seja-promotor/:token` · `/indicacao/painel/:token` · `/indicacao/atendente/:token` · `/i/:codigo` · `/escala/motoboys/:token`. O backend `/api/public/*` já é isento do gate.

## 5. Verificação (por fase)
- `cd frontend && npm run build` · `node --check backend/server.js` · `node --test` nos testes puros existentes (`backend/custos/propagacaoCusto.test.js` e os que a fase trouxer) · `npx prisma validate` + `npx prisma generate` quando o schema mudar.
- **Teste do operador (gate):** criar/usar um operador com UMA área; confirmar que a sidebar mostra só os itens dela e que a API das outras responde 403.
- Rotas públicas: abrir sem login.
- Deploy por fase: `cd /var/www/nachapa-pdv && bash deploy.sh` (roda `migrate deploy` + `generate` + build + restart) → Ctrl+Shift+R.

## 6. Restrições globais (valem para todas as fases)
- Migrations **à mão, aditivas**; nunca `prisma migrate dev` (drift). Timestamp posterior à última (`20260905120000_fornecedores`).
- Todo model novo entra no `MODELS_TENANT` (`$extends` injeta `empresaId`). Toda rota de API nova entra em `AREA_PREFIXOS` (fail-closed).
- Toda escrita em `Insumo.custoUnitario` chama `propagarCustoParaConsumidores` (armadilha do custo) — relevante se o CMV tocar custo.
- Padrões do PDV: modais só fecham por botão; hook de confirmação (não `window.confirm`); nunca Promise dentro de `useEffect`; contraste forte; identidade laranja do H360 (já aplicada — não reintroduzir dourado).
- Git: **`git add` explícito** dos arquivos da tarefa, nunca `-A`/`.`/`commit -a`/`reset`; o Junior trabalha em outra janela no mesmo repo; `frontend/public/favicon_novo.png` não é nosso. Commit por tarefa direto na `main`; push ao fim de cada fase. Nunca `taskkill` de node.
- Fidelidade: portar do H360 lendo o código-fonte, não reescrevendo; adaptar só as diferenças de infra documentadas aqui (tenant, `clienteId`, chaves de área, rotas).

## 7. Riscos e como estão tratados
1. Rename `automacoes→marketing` sem migration de dados → gerente perde o Grupo VIP. **Tratado:** migration na Fase 0.
2. Rota nova sem prefixo no gate → 403 para todo operador. **Tratado:** checklist por fase + resolução por prefixo mais longo.
3. Relatórios depende do HUB aceitar o token do PDV. **Tratado:** pré-check no início da Fase 4; se falhar, parar e alinhar (ajuste é no HUB).
4. Schemas divergentes (Motoboys, possivelmente Indicação). **Tratado:** conferência campo a campo antes de portar endpoints; migrations aditivas pequenas.
5. Sidebar de 3 níveis em telas estreitas. **Tratado:** mesmo padrão de drill do H360, que já roda em produção.
