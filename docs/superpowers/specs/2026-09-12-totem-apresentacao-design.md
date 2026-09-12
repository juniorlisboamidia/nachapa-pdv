# Totem — Camada de Apresentação (modo EXPANDIDO) — Design

**Data:** 2026-09-12 · **Status:** decisões aprovadas pelo Junior (2026-09-11), aguardando revisão desta spec · **Repos:** `nachapa-pdv` (configuração, projeção, admin, Totem) e `Traffic Hub` (campos aditivos no bootstrap). Sem redesign visual nesta versão.

## 1. Problema e decisão

O Cardápio Web (CW) modela "TRADICIONAIS 🍔" como um **item base a R$ 0,00** com um grupo obrigatório de escolha única ("SEU TRADICIONAL FAVORITO") cujas opções são os produtos reais (X BURGUER R$ 12, DELICIA R$ 14…). No Totem o cliente deve ver **cada opção principal como um produto**, e o pedido continua indo ao CW como `item_id` + `option_id` principal.

Inventário real (2026-09-11): 4 itens passam na regra estrita, 1 deles (COMBO - TRADICIONAIS) tem outros grupos obrigatórios e **não** deve expandir; 2 casos semanticamente iguais escapam de qualquer heurística (grupo em `index` 2; `SUMMABLE` 1–1). Por isso a **configuração é explícita**, por loja e item do CW, sem ativação automática; a heurística só poderá **sugerir** no admin.

**Fonte de verdade continua no CW** (item, opção, preço, disponibilidade, estoque, ordem, complementos, ids do pedido). O produto apresentado é uma **projeção dinâmica** do catálogo vivo; nada dele é persistido.

## 2. Modelo de dados (PDV)

```prisma
// Apresentação do Totem: como um item do Cardápio Web aparece na vitrine do totem desta loja.
// A configuração é explícita (nunca automática) e só referencia ids do CW; o produto apresentado
// é projetado do catálogo vivo a cada bootstrap — nada de opção/produto persistido aqui.
model TotemApresentacao {
  id                Int      @id @default(autoincrement())
  empresaId         Int
  cwItemId          Int                       // Item.id do CW (item base)
  modo              String   @default("NORMAL") // NORMAL | EXPANDIDO
  cwGrupoPrincipalId Int?                     // obrigatório quando EXPANDIDO: OptionGroupInItem.id do vínculo
  ativo             Boolean  @default(true)
  criadoEm          DateTime @default(now())
  atualizadoEm      DateTime @updatedAt

  @@unique([empresaId, cwItemId])
  @@index([empresaId])
}
```

`empresaId` sem FK (convenção do PDV); `'totemApresentacao'` entra em `MODELS_TENANT`. Sem campos de merchandising (nome/imagem/ordem customizados) nesta versão.

**Migration `20260912120000_totem_apresentacao`:**
```sql
CREATE TABLE "TotemApresentacao" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL, "cwItemId" INTEGER NOT NULL,
  "modo" TEXT NOT NULL DEFAULT 'NORMAL', "cwGrupoPrincipalId" INTEGER, "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemApresentacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TotemApresentacao_empresaId_cwItemId_key" ON "TotemApresentacao"("empresaId", "cwItemId");
CREATE INDEX "TotemApresentacao_empresaId_idx" ON "TotemApresentacao"("empresaId");
```

## 3. HUB — alterações aditivas

`backend/cardapioPedidoTotem.js` › `catalogoParaTotem`: cada opção do bootstrap ganha `imagem` (`image.image_url || image.thumbnail_url || null`, mesma regra de `imagemDe`) e `descricao` (`description ?? null`). Nada mais muda: cotar, pedido, cache (60 s catálogo / 25 s merchant), contratos. O HUB **não conhece** a configuração de apresentação.

## 4. PDV backend — projeção e validação

### 4.1 Módulo puro `backend/totemApresentacao.js` (ESM, sem Prisma, sem I/O)
- `MODOS = ['NORMAL', 'EXPANDIDO']`.
- `grupoElegivel(grupo) → { ok:true } | { ok:false, motivo }`: `status` visível, `min === 1 && max === 1` (**não** depende de `choice_type`; cobre `SINGLE` e `SUMMABLE` 1–1), `opcoes.length ≥ 1`.
- `validarConfiguracao(config, item) → { ok:true, grupo } | { ok:false, codigo }` com códigos: `ITEM_AUSENTE` (cwItemId não está no bootstrap), `GRUPO_AUSENTE` (cwGrupoPrincipalId não é grupo do item), `GRUPO_NAO_E_ESCOLHA_UNICA` (min/max ≠ 1–1), `GRUPO_SEM_OPCOES`, `OUTRO_GRUPO_OBRIGATORIO` (qualquer outro grupo com `min ≥ 1`), `MODO_INVALIDO`.
- `projetarProduto(item, grupo, opcao) → ProdutoApresentado` (§5).
- `projetarCatalogo(catalogoBootstrap, configuracoes) → { catalogo, avisos }`: para cada categoria/item, se existe config `EXPANDIDO` ativa e válida → a categoria recebe em `produtos` um produto por opção **na ordem do CW** (`index` já vem ordenado do HUB) no lugar do card do item; senão o item entra em `produtos` como `tipo:'ITEM'`. Configuração inválida → produto `ITEM` normal + aviso `{ cwItemId, codigo, mensagem }`. Não muta a entrada.
- `sugerirCandidatos(catalogoBootstrap) → [{ cwItemId, nome, cwGrupoPrincipalId, grupoNome, motivo }]` (heurística: preço base 0, exatamente um grupo obrigatório e ele 1–1). **Só sugestão para o admin**; nunca ativa nada.

### 4.2 Aplicação no bootstrap público
`GET /api/public/aparelho/totem/bootstrap` (server.js ~8659): após obter o bootstrap do HUB (ou o snapshot), carrega `prisma.totemApresentacao.findMany({ where: { empresaId: aparelho.empresaId, ativo: true } })` e aplica `projetarCatalogo`. Resposta = bootstrap do HUB **+** `catalogo.categorias[].produtos` (aditivo; `itens` continua igual). Avisos de configuração vão para `avisosApresentacao` (não misturar com `avisos` do HUB). Falha ao ler a configuração (banco fora) → responde o bootstrap sem `produtos` (o front cai para `itens`) e loga; **o catálogo público nunca quebra**.

### 4.3 Admin (`exigirAdmin`, tenant; prefixo `/totem` já mapeia para a área `aparelhos`)
- `GET /api/totem/apresentacao` → `{ itens:[{ cwItemId, nome, categoria, precoBase, grupos:[{ id, nome, min, max, choiceType, nOpcoes, elegivel }], config:{ modo, cwGrupoPrincipalId, ativo } | null, validacao:{ ok, codigo? } }], sugestoes:[…], avisosApresentacao:[…] }` — monta a lista a partir do bootstrap do HUB (`bootstrapTotemCW(clienteId)`, mesma ponte; sem CW → 409 `CLIENTE_SEM_CW`).
- `PUT /api/totem/apresentacao/:cwItemId { modo, cwGrupoPrincipalId }` → valida `modo ∈ MODOS`; `EXPANDIDO` exige `cwGrupoPrincipalId` inteiro e a validação contra o catálogo vivo (`validarConfiguracao`) precisa passar → senão 422 `{ erro:'APRESENTACAO_INVALIDA', codigo }`; upsert por `(empresaId, cwItemId)`. `NORMAL` apaga a linha (ou grava `NORMAL`; escolhido: **apagar**, para a tabela só ter exceções).
- Nunca aceita `empresaId` do corpo (tenant do admin).

## 5. Contrato para o frontend

`catalogo.categorias[].produtos[]`:
```
{ id: 'item:2979325' | 'opcao:2979325:795194:3633259',
  tipo: 'ITEM' | 'OPCAO_PRINCIPAL',
  nome, descricao, imagem,                    // identidade apresentada (da opção, no EXPANDIDO)
  preco, precoPromocional?,                   // EXPANDIDO: base + preço da opção (promo da base + opção)
  status: 'ACTIVE' | 'MISSING',               // EXPANDIDO: status da opção; item MISSING → todos MISSING
  ordenavel: boolean, motivo?,                // itemOrdenavel do item (grupo obrigatório em falta etc.)
  origem: { itemId, grupoId?, opcaoId? },     // ids exatos do CW — é o que vira carrinho
  item: <item do bootstrap, com grupos na ordem do CW>,
  grupoPrincipalId?: 795194                   // EXPANDIDO: para o detalhe ocultar/travar
}
```
`itens` permanece para compatibilidade; o Totem passa a renderizar `produtos` quando presente.

## 6. Comportamento no Totem

- **Card:** `produto.nome/imagem/descricao/preco`; MISSING → "Em falta"; `!ordenavel` → "Indisponível no momento".
- **Detalhe:** `abrirProduto(produto)` cria `{ item: produto.item, apresentado: produto, selecoes: { [grupoPrincipalId]: [{ opcaoId, qtd:1 }] }, qtd:1 }`; título/foto do produto apresentado; o grupo principal **não é renderizado** (travado); demais grupos como hoje; "Adicionar" usa `itemPronto` normal (o principal já está satisfeito). Trocar o produto principal = voltar ao grid.
- **Carrinho/Revisar/Confirmar:** a linha exibe `apresentado.nome` (+ complementos como hoje) e `subtotalLocal` com `precoEmVigor` da base + opções (o principal entra como opção, então o número bate). `montarCarrinho` **não muda**: emite `itemId` + `grupos[grupoPrincipalId].opcoes[opcaoId]` como qualquer seleção. `diffCotacao` casa por índice/`itemId` como hoje.
- **Cotar/Pedido:** intactos. O HUB recalcula pelo trio de ids; hash idêntico ao de uma seleção manual.
- Frontend sem heurística: só consome `produtos`.

## 7. Fallback e avisos

Toda configuração é revalidada **a cada bootstrap** contra o catálogo vivo. Inválida → item em `NORMAL` na vitrine + aviso em `avisosApresentacao` (público, sem dados sensíveis) e na tela admin (com o código). Casos: item saiu do catálogo/`service_desk`, grupo removido, grupo deixou de ser 1–1, apareceu outro grupo obrigatório, grupo sem opções visíveis. Opção `MISSING` → produto MISSING (em falta), não é fallback.

## 8. Tela admin mínima (`/totem/apresentacao`, Loja Digital › Totem › Apresentação)

Lista dos itens do CW (nome, categoria, preço base), seletor de modo NORMAL/EXPANDIDO, select do grupo principal (só grupos elegíveis habilitados; os demais aparecem desabilitados com o motivo), estado da validação (ok / código), seção "Sugestões" com os candidatos da heurística e botão "Usar" que só preenche o formulário. Salvar por item. Sem edição de nome/imagem/ordem.

## 9. Testes

- **HUB:** opções do bootstrap com `imagem`/`descricao` (presentes e nulos); golden TRADICIONAIS mantém preços/ordem.
- **PDV `totemApresentacao.test.js`:** `grupoElegivel` (SINGLE 1–1 ok; SUMMABLE 1–1 ok; MULTIPLE 0–1 não; 2–2 não; sem opções não); `validarConfiguracao` para cada código (incl. COMBO com bebida obrigatória → `OUTRO_GRUPO_OBRIGATORIO`); `projetarCatalogo` golden TRADICIONAIS → 9 produtos `OPCAO_PRINCIPAL` na ordem do CW com preço = opção, imagem/descrição da opção, `origem` com os três ids; fallback de imagem para a do item (DOGS); item MISSING → todos MISSING; opção MISSING → produto MISSING; promo na base soma à opção; item sem config → `ITEM`; config inválida → `ITEM` + aviso; não muta a entrada; `sugerirCandidatos` acha TRADICIONAIS/ARTESANAIS/DOGS e **não** acha COMBO nem QUINTA; ids de vínculo: X BURGUER com quatro ids diferentes → cada produto aponta ao seu.
- **PDV `totem.tenant.test.js`:** rotas `/api/totem/apresentacao*` nunca leem `empresaId`/`clienteId` do corpo; toda consulta a `totemApresentacao` escopada.
- **Frontend `totemCarrinho.test.js`:** `abrirProduto` (helper puro `linhaDeProduto(produto)`) gera `selecoes` com o principal; `montarCarrinho` da pré-seleção é byte-idêntico ao da seleção manual; `itemPronto` satisfeito só pelo principal; `subtotalLocal` = base + opção; grupos renderizáveis excluem `grupoPrincipalId`.
- **Smoke:** configurar TRADICIONAIS como EXPANDIDO, ver 9 cards, abrir X BURGUER, adicionar milho, cotar 13,50, **sem confirmar**.

## 10. Deploy

HUB primeiro (aditivo, sem migration). PDV depois: `bash deploy.sh` aplica a migration `20260912120000_totem_apresentacao`. Sem env novo. O Totem só muda de aparência depois que a loja configurar um item como EXPANDIDO.
