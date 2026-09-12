# Totem — Camada de Apresentação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, task por task, commit por task. **Não iniciar sem autorização do Junior.**

**Goal:** itens do CW configurados como EXPANDIDO aparecem no Totem como um produto por opção principal, sem mudar cotar/pedido.
**Architecture:** HUB expõe imagem/descrição das opções (aditivo); PDV persiste `TotemApresentacao`, valida contra o catálogo vivo e projeta `produtos`; Totem consome `produtos` e pré-seleciona o principal.
**Spec:** `docs/superpowers/specs/2026-09-12-totem-apresentacao-design.md`.

## Global Constraints
- Configuração explícita por `(empresaId, cwItemId)`; nunca automática; heurística só sugere.
- Grupo principal elegível = `min 1 e max 1` (independe de `choice_type`); qualquer outro grupo obrigatório invalida; sem "a partir de".
- Vínculo por ids exatos (`itemId`, `grupoId`, `opcaoId`); nunca por nome. Nada de opção/produto persistido.
- `cotar`/`pedido`/`montarCarrinho` inalterados; contratos existentes intactos, só campos aditivos.
- Fallback seguro para NORMAL com aviso; catálogo público nunca quebra.
- Tenant: rotas admin via `getEmpresaIdAtual()`, `empresaId` nunca do corpo; rota pública escopada pelo aparelho.
- Git: `git add` explícito; commit por task; sem `-A`; sem deploy sem autorização.

---

### Task A1 (HUB): imagem e descrição das opções no bootstrap
**Files:** Modify `backend/cardapioPedidoTotem.js` (`catalogoParaTotem`, `opcoes.push`), `backend/cardapioPedidoTotem.test.js`.
- [ ] Teste RED: opção com `image.image_url`/`description` → `imagem`/`descricao`; sem → `null`; golden TRADICIONAIS inalterado no resto.
- [ ] Implementar (reusar `imagemDe`). `node backend/cardapioPedidoTotem.test.js`, `node --check`.
- [ ] Commit: `feat(cardapio): bootstrap do totem expõe imagem e descrição das opções (aditivo)`.

### Task A2 (PDV): model + migration + MODELS_TENANT
**Files:** Modify `backend/prisma/schema.prisma`; Create `backend/prisma/migrations/20260912120000_totem_apresentacao/migration.sql` (SQL da spec §2); Modify `backend/server.js` (`MODELS_TENANT` += `'totemApresentacao'`).
- [ ] `npx prisma validate && npx prisma generate`; `node --check backend/server.js`. Nada aplicado no banco.
- [ ] Commit: `feat(pdv totem): model TotemApresentacao (migration)`.

### Task A3 (PDV): módulo puro de projeção
**Files:** Create `backend/totemApresentacao.js`, `backend/totemApresentacao.test.js`.
**Interfaces:** `MODOS`, `grupoElegivel(grupo)`, `validarConfiguracao(config, item)`, `projetarProduto(item, grupo, opcao)`, `projetarCatalogo(catalogo, configuracoes) → { catalogo, avisos }`, `sugerirCandidatos(catalogo)`; formato de `produto` = spec §5.
- [ ] Testes RED (lista da spec §9, com fixtures reais de TRADICIONAIS, ARTESANAIS, DOGS, COMBO - TRADICIONAIS, ACOMPANHAMENTO SUMMABLE 1–1 e QUINTA 2–2) → GREEN.
- [ ] Commit: `feat(pdv totem): projeção pura de produtos apresentados (EXPANDIDO) com validação e sugestões`.

### Task A4 (PDV): bootstrap público com `produtos` + rotas admin
**Files:** Modify `backend/server.js` (bootstrap ~8659: carregar config + `projetarCatalogo`, `avisosApresentacao`, falha de banco → sem `produtos`; `GET /api/totem/apresentacao`, `PUT /api/totem/apresentacao/:cwItemId`), `backend/totem.tenant.test.js` (varredura das rotas novas), `backend/aparelhos.tenant.test.js` se o bloco público for estendido.
- [ ] Rotas conforme spec §4.2–4.3; `PUT` valida contra o catálogo vivo (`bootstrapTotemCW` + `validarConfiguracao`) e apaga a linha em `NORMAL`.
- [ ] Testes de varredura verdes; `node --check`.
- [ ] Commit: `feat(pdv totem): bootstrap projeta produtos apresentados; admin configura NORMAL/EXPANDIDO`.

### Task A5 (PDV frontend): Totem consome `produtos` + tela admin
**Files:** Modify `frontend/src/components/totemCarrinho.js` (+ test: `linhaDeProduto(produto)`, `gruposRenderizaveis(linha)`, `nomeApresentado(linha)`), `frontend/src/pages/TotemQuiosque.jsx` (grid por `produtos` com fallback para `itens`; `abrirProduto`; detalhe oculta `grupoPrincipalId`; carrinho/revisão/confirmação com a identidade apresentada), Create `frontend/src/pages/TotemApresentacao.jsx`, Modify `frontend/src/App.jsx` (rota `totem/apresentacao`), `frontend/src/components/sidebarNav.js` (+ test: Loja Digital › Totem vira grupo com Pedidos e Apresentação — ou item "Apresentação" ao lado; decidir no brief), `frontend/src/pages/Inicio.jsx` (descrição), `frontend/src/styles/global.css` (mínimo).
- [ ] Testes puros RED→GREEN; `npm run build`. Sem redesign visual: mesmos cards/classes.
- [ ] Commit: `feat(pdv totem): vitrine por produtos apresentados e admin de apresentação`.

### ✅ Checkpoint (controlador; aguarda autorização)
Deploy HUB (sem migration) → deploy PDV (`bash deploy.sh` aplica `20260912120000`) → admin: TRADICIONAIS = EXPANDIDO / SEU TRADICIONAL FAVORITO → Totem mostra 9 cards → abrir X BURGUER, milho, cotar 13,50, **parar antes de confirmar** → COMBO - TRADICIONAIS tentar EXPANDIDO → 422 `OUTRO_GRUPO_OBRIGATORIO`.
