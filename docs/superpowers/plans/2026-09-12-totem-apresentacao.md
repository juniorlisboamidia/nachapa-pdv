# Totem — Camada de Apresentação — Implementation Plan (rev. 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, task por task, commit por task. **Não iniciar sem autorização do Junior.**

**Goal:** itens do CW configurados como EXPANDIDO aparecem no Totem como um produto por opção principal, sem mudar cotar/pedido.
**Architecture:** HUB expõe imagem/descrição das opções (aditivo); PDV persiste `TotemApresentacao`, valida contra o catálogo vivo e projeta `produtos` leves; Totem resolve o item técnico por `itemId` e pré-seleciona o principal.
**Spec:** `docs/superpowers/specs/2026-09-12-totem-apresentacao-design.md` (rev. 2).

## Global Constraints
- Configuração explícita por `(empresaId, cwItemId)`; nunca automática; heurística só sugere. Tabela só guarda EXPANDIDO; NORMAL apaga (sem `ativo`).
- Grupo principal = `min 1 e max 1` (independe de `choice_type`); qualquer outro grupo obrigatório invalida; `validarConfiguracao` é a única regra, usada no bootstrap e no admin (`selecionavel`).
- Vínculo por ids exatos; nunca por nome. Produto apresentado **não** carrega o item completo; o frontend indexa `itens` por `itemId`.
- `cotar`/`pedido`/`montarCarrinho` inalterados; contratos existentes intactos, só campos aditivos (`produtos`, `avisosApresentacao`, `alteradasIdx`).
- Fallback seguro para NORMAL com aviso; órfãs expostas no admin e removíveis; catálogo público nunca quebra.
- Tenant: admin via `getEmpresaIdAtual()`, `empresaId` nunca do corpo; rota pública escopada pelo aparelho.
- Git: `git add` explícito; commit por task; sem `-A`; sem deploy sem autorização.

---

### Task A1 (HUB): imagem e descrição das opções no bootstrap
**Files:** Modify `backend/cardapioPedidoTotem.js` (`catalogoParaTotem`, `opcoes.push`), `backend/cardapioPedidoTotem.test.js`.
- [ ] RED: opção com `image.image_url`/`description` → `imagem`/`descricao`; sem → `null`; golden TRADICIONAIS inalterado no resto.
- [ ] GREEN (reusar `imagemDe`); `node backend/cardapioPedidoTotem.test.js`; `node --check`.
- [ ] Commit: `feat(cardapio): bootstrap do totem expõe imagem e descrição das opções (aditivo)`.

### Task A2 (PDV): model + migration + MODELS_TENANT
**Files:** Modify `backend/prisma/schema.prisma` (model da spec §2, sem `ativo`, `cwGrupoPrincipalId` obrigatório); Create `backend/prisma/migrations/20260912120000_totem_apresentacao/migration.sql` (SQL da spec §2); Modify `backend/server.js` (`MODELS_TENANT` += `'totemApresentacao'`).
- [ ] `npx prisma validate && npx prisma generate`; `node --check backend/server.js`. Nada aplicado no banco.
- [ ] Commit: `feat(pdv totem): model TotemApresentacao (migration)`.

### Task A3 (PDV): módulo puro de projeção
**Files:** Create `backend/totemApresentacao.js`, `backend/totemApresentacao.test.js`.
**Interfaces:** `MODOS`, `grupoElegivel(grupo)`, `validarConfiguracao(config, item)`, `projetarProduto(item, grupo, opcao)`, `projetarCatalogo(catalogo, configuracoes) → { catalogo, avisos }`, `sugerirCandidatos(catalogo)`, `mesclarAdmin(catalogo, configuracoes) → { itens, orfas }` (puro: monta a lista do GET admin com `elegivel`/`selecionavel`/`validacao` e as órfãs). Formato de `produto` = spec §5 (sem `item`).
- [ ] Testes RED (lista da spec §9 com fixtures reais: TRADICIONAIS, ARTESANAIS, DOGS, COMBO - TRADICIONAIS, ACOMPANHAMENTO SUMMABLE 1–1, QUINTA 2–2, MONTE SUA BOX) → GREEN. Golden de sugestões = TRADICIONAIS, ARTESANAIS, DOGS, ACOMPANHAMENTO.
- [ ] Commit: `feat(pdv totem): projeção pura de produtos apresentados, validação, órfãs e sugestões`.

### Task A4 (PDV): bootstrap público com `produtos` + rotas admin
**Files:** Modify `backend/server.js` (bootstrap ~8659: `findMany` da config + `projetarCatalogo` + `avisosApresentacao`, falha de banco → sem `produtos`; `GET /api/totem/apresentacao` via `mesclarAdmin` sobre `bootstrapTotemCW`; `PUT /api/totem/apresentacao/:cwItemId` com validação viva no EXPANDIDO e `deleteMany` no NORMAL sem consultar catálogo), `backend/totem.tenant.test.js` (varredura das rotas novas).
- [ ] Varreduras verdes; `node --check`.
- [ ] Commit: `feat(pdv totem): bootstrap projeta produtos apresentados; admin configura, lista órfãs e sugestões`.

### Task A5 (PDV frontend): Totem consome `produtos` + tela admin + sidebar
**Files:** Modify `frontend/src/components/totemCarrinho.js` (+ test: `indicePorItemId`, `linhaDeProduto`, `gruposRenderizaveis`, `nomeApresentado`, `diffCotacao` com `alteradasIdx` aditivo), `frontend/src/pages/TotemQuiosque.jsx` (grid por `produtos` com fallback `itens`; `abrirProduto`; detalhe oculta o principal; carrinho/revisão/confirmação com `nomeApresentado`; destaque por índice/`uid`), Create `frontend/src/pages/TotemApresentacao.jsx`, Modify `frontend/src/App.jsx` (rota `totem/apresentacao`), `frontend/src/components/sidebarNav.js` + test (Loja Digital › **Totem** vira grupo: Pedidos, Apresentação; Aparelhos ao lado; ícones existentes), `frontend/src/pages/Inicio.jsx` (descrição), `frontend/src/styles/global.css` (mínimo, sem redesign).
- [ ] Testes puros RED→GREEN incluindo o cenário de **duas linhas do mesmo item base** (X BURGUER + X BACON); `npm run build`.
- [ ] Commit: `feat(pdv totem): vitrine por produtos apresentados, admin de apresentação e sidebar Totem › Pedidos/Apresentação`.

### ✅ Checkpoint (controlador; aguarda autorização)
Deploy HUB (sem migration) → deploy PDV (`bash deploy.sh` aplica `20260912120000`) → admin: TRADICIONAIS = EXPANDIDO / SEU TRADICIONAL FAVORITO; COMBO - TRADICIONAIS mostra o grupo desabilitado (`OUTRO_GRUPO_OBRIGATORIO`) e o PUT dá 422 → Totem: 9 cards; abrir X BURGUER + milho; adicionar X BACON; revisar as duas linhas e cotar; **parar antes de confirmar**.
