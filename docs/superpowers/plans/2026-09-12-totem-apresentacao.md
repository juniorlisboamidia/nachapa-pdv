# Totem — Camada de Apresentação — Implementation Plan (rev. 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, task por task, commit por task. **Não iniciar sem autorização do Junior.**

**Estado:** A1–A5 (rev. 2) implementadas, deployadas e validadas parcialmente em 2026-09-12. Rev. 3 = tasks **B1–B3** abaixo.
**Goal rev. 3:** outros grupos obrigatórios não impedem a Vitrine; cards mostram o preço mínimo completo ("a partir de") com pricing calculado só no HUB.
**Spec:** `docs/superpowers/specs/2026-09-12-totem-apresentacao-design.md` (rev. 3).

## Global Constraints (rev. 3)
- Pricing só no HUB: o PDV nunca calcula mínimo de SINGLE/MULTIPLE/SUMMABLE; consome `custoMinimo`/`precoVariavel` por grupo.
- `resumoPrecoDoGrupo` usa exatamente as regras de `validarGrupo`; equivalência provada por teste com `validarECotar`.
- Principal elegível = visível + `min 1 && max 1` + **≥ 2 opções apresentáveis (ACTIVE ou MISSING)**. `OUTRO_GRUPO_OBRIGATORIO` não existe mais.
- Só o principal fica oculto/pré-selecionado; `itemPronto` exige os demais obrigatórios; `montarCarrinho`/`cotar`/`pedido` intactos.
- Contratos aditivos; sem migration; sem redesign visual; admin neutro para itens normais, código técnico só discreto em configuração salva inválida.
- Git: `git add` explícito; commit por task; sem `-A`; sem deploy sem autorização.

---

### Task B1 (HUB): `resumoPrecoDoGrupo` + campos por grupo no bootstrap
**Files:** Modify `backend/cardapioPedidoTotem.js` (helper puro exportado; `catalogoParaTotem` emite `custoMinimo` e `precoVariavel` por grupo), `backend/cardapioPedidoTotem.test.js`.
- [ ] RED: casos da spec §9 (HUB) incluindo o teste de **equivalência** com `validarECotar` (mais barata/mais cara por tipo) e o golden 27,90 do COMBO - TRADICIONAIS.
- [ ] GREEN; suíte inteira do HUB (`cardapioPedidoTotem`, `cardapioTotem`, `cardapioMerchant`) + `node --check`.
- [ ] Commit: `feat(cardapio): bootstrap do totem expõe custoMinimo e precoVariavel por grupo (mesmas regras do validarGrupo)`.

### Task B2 (PDV backend): regra de Vitrine rev. 3 + preço mínimo na projeção
**Files:** Modify `backend/totemApresentacao.js`, `backend/totemApresentacao.test.js`; Modify `backend/totem.tenant.test.js` só se a lista de códigos do contrato mudar (`GRUPO_COM_UMA_OPCAO` entra; `OUTRO_GRUPO_OBRIGATORIO` sai).
- [ ] `grupoElegivel` com `GRUPO_COM_UMA_OPCAO`; `validarConfiguracao` sem `OUTRO_GRUPO_OBRIGATORIO`; `projetarProduto`/`produtoDeItem` com `precoMinimo`, `precoMinimoPromocional`, `precoEhAPartirDe`; `ordenavel` considera `custoMinimo === null`; `mesclarAdmin` com `candidato`/`obrigatoriosAlem`; tolerância a bootstrap antigo (sem os campos → `precoMinimo = preco`, `precoEhAPartirDe:false`).
- [ ] Testes RED→GREEN (spec §9 PDV); suítes `totemApresentacao`, `totem.tenant`, `aparelhos.tenant`; `node --check`.
- [ ] Commit: `feat(pdv totem): vitrine aceita outros grupos obrigatórios; preço mínimo "a partir de" vindo do HUB; grupo com uma opção não é vitrine`.

### Task B3 (PDV frontend): "a partir de" + admin neutro
**Files:** Modify `frontend/src/components/totemCarrinho.js` (+ test: `precoDoCard(produto)`, `mensagemApresentacao(codigo)`), `frontend/src/pages/TotemQuiosque.jsx` (card e cabeçalho do detalhe com "a partir de"; obrigatórios restantes visíveis — já são), `frontend/src/pages/TotemApresentacao.jsx` (estado neutro, mensagens humanas, código discreto só em config inválida, nota "a partir de"), `frontend/src/styles/global.css` (mínimo).
- [ ] Testes puros RED→GREEN; `npm run build`.
- [ ] Commit: `feat(pdv totem): cards com preço mínimo "a partir de"; admin de apresentação com estado neutro e mensagens humanas`.

### ✅ Checkpoint rev. 3 (aguarda autorização)
Deploy HUB (sem migration) → deploy PDV (sem migration) → admin: COMBO - TRADICIONAIS = Vitrine por BURGUER DO COMBO (select habilitado; nota "a partir de") → Totem: 9 cards "a partir de R$ 27,90" → abrir X BURGUER → BEBIDA e ACOMPANHAMENTO visíveis e obrigatórios → Coca + Batata → cotar 27,90 → parar sem confirmar. TRADICIONAIS continua com 9 cards sem "a partir de". Itens normais no admin sem vermelho.
