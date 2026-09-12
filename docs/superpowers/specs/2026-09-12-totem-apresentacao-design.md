# Totem — Camada de Apresentação (modo EXPANDIDO) — Design

**Data:** 2026-09-12 (rev. 2, com os seis ajustes do Junior) · **Status:** arquitetura aprovada; revisão documental antes de codificar · **Repos:** `nachapa-pdv` (configuração, projeção, admin, Totem) e `Traffic Hub` (campos aditivos no bootstrap). Sem redesign visual nesta versão.

## 1. Problema e decisão

O Cardápio Web (CW) modela "TRADICIONAIS 🍔" como um **item base a R$ 0,00** com um grupo obrigatório de escolha única ("SEU TRADICIONAL FAVORITO") cujas opções são os produtos reais (X BURGUER R$ 12, DELICIA R$ 14…). No Totem o cliente deve ver **cada opção principal como um produto**, e o pedido continua indo ao CW como `item_id` + `option_id` principal.

Inventário real (2026-09-11): 4 itens passam na regra estrita, 1 deles (COMBO - TRADICIONAIS) tem outros grupos obrigatórios e **não** deve expandir; 2 casos semanticamente iguais escapam de qualquer heurística (grupo em `index` 2; `SUMMABLE` 1–1). Por isso a **configuração é explícita**, por loja e item do CW, sem ativação automática; a heurística só **sugere** no admin.

**Fonte de verdade continua no CW** (item, opção, preço, disponibilidade, estoque, ordem, complementos, ids do pedido). O produto apresentado é uma **projeção dinâmica** do catálogo vivo; nada dele é persistido.

## 2. Modelo de dados (PDV)

```prisma
// Apresentação do Totem: como um item do Cardápio Web aparece na vitrine do totem desta loja.
// Explícita (nunca automática) e só com ids do CW; o produto apresentado é projetado do catálogo
// vivo a cada bootstrap — nada de opção/produto persistido. A tabela só guarda EXCEÇÕES: voltar
// a NORMAL apaga a linha (por isso não há `ativo` — não existe "desligado mas guardado").
model TotemApresentacao {
  id                 Int      @id @default(autoincrement())
  empresaId          Int
  cwItemId           Int                          // Item.id do CW (item base)
  modo               String                       // hoje só 'EXPANDIDO' é persistido
  cwGrupoPrincipalId Int                          // OptionGroupInItem.id do vínculo item↔grupo
  criadoEm           DateTime @default(now())
  atualizadoEm       DateTime @updatedAt

  @@unique([empresaId, cwItemId])
  @@index([empresaId])
}
```

Decisão sobre `ativo` (ajuste 6): **removido**. NORMAL apaga a linha e não há toggle nesta versão; um `ativo=false` seria um terceiro estado sem tela. Se um dia houver "pausar apresentação sem perder a escolha do grupo", volta como campo novo com migration própria. `cwGrupoPrincipalId` passa a ser obrigatório, já que só EXPANDIDO é persistido. `empresaId` sem FK (convenção do PDV); `'totemApresentacao'` entra em `MODELS_TENANT`. Sem campos de merchandising.

**Migration `20260912120000_totem_apresentacao`:**
```sql
CREATE TABLE "TotemApresentacao" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL, "cwItemId" INTEGER NOT NULL,
  "modo" TEXT NOT NULL, "cwGrupoPrincipalId" INTEGER NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemApresentacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TotemApresentacao_empresaId_cwItemId_key" ON "TotemApresentacao"("empresaId", "cwItemId");
CREATE INDEX "TotemApresentacao_empresaId_idx" ON "TotemApresentacao"("empresaId");
```

## 3. HUB — alterações aditivas

`backend/cardapioPedidoTotem.js` › `catalogoParaTotem`: cada opção do bootstrap ganha `imagem` (`image.image_url || image.thumbnail_url || null`, mesma regra de `imagemDe`) e `descricao` (`description ?? null`). Nada mais muda: cotar, pedido, caches, contratos. O HUB **não conhece** a configuração de apresentação.

## 4. PDV backend — projeção e validação

### 4.1 Módulo puro `backend/totemApresentacao.js` (ESM, sem Prisma, sem I/O, não muta a entrada)
- `MODOS = ['NORMAL', 'EXPANDIDO']`.
- `grupoElegivel(grupo) → { ok:true } | { ok:false, codigo }`: grupo visível (`ACTIVE`), `min === 1 && max === 1` (**não** depende de `choice_type`: cobre `SINGLE` e `SUMMABLE` 1–1), ≥ 1 opção. Códigos: `GRUPO_NAO_E_ESCOLHA_UNICA`, `GRUPO_SEM_OPCOES`, `GRUPO_INDISPONIVEL`.
- `validarConfiguracao({ modo, cwGrupoPrincipalId }, item) → { ok:true, grupo } | { ok:false, codigo }`: `MODO_INVALIDO`; `ITEM_AUSENTE` (item nulo/não está no bootstrap); `GRUPO_AUSENTE`; os códigos de `grupoElegivel`; `OUTRO_GRUPO_OBRIGATORIO` (qualquer outro grupo visível com `min ≥ 1`). É a **única** regra de "pode ser principal"; o admin e o bootstrap usam a mesma função (ajuste 4).
- `projetarProduto(item, grupo, opcao) → ProdutoApresentado` (§5) — **sem** o item completo (ajuste 1).
- `projetarCatalogo(catalogoBootstrap, configuracoes) → { catalogo, avisos }`: cada categoria ganha `produtos`; item com configuração válida → um produto `OPCAO_PRINCIPAL` por opção, na ordem do CW (o HUB já ordena por `index`); demais itens → um produto `ITEM`. Configuração inválida → produto `ITEM` + aviso `{ cwItemId, codigo }`. `itens` é preservado intacto.
- `sugerirCandidatos(catalogoBootstrap) → [{ cwItemId, nome, categoria, cwGrupoPrincipalId, grupoNome }]` — regra documentada (ajuste 3): **preço base 0 + exatamente um grupo visível obrigatório (`min ≥ 1`) + esse grupo com `min 1 e max 1`**, sem olhar `choice_type` nem `index`. No catálogo real de 2026-09-11 sugere **TRADICIONAIS 🍔, ARTESANAIS 🍔, NOSSOS DOGS 🌭 e ESCOLHA SEU ACOMPANHAMENTO 🍟** (este é `SUMMABLE` 1–1 em `index` 1 e entra de pleno direito); **não** sugere COMBO - TRADICIONAIS/ARTESANAIS (três obrigatórios), QUINTA DA BATATA (2–2 + batata obrigatória) nem MONTE SUA BOX (3–3). Sem regra adicional de exclusão. Sugestão nunca ativa nada.

### 4.2 Aplicação no bootstrap público
`GET /api/public/aparelho/totem/bootstrap` (server.js ~8659): após obter o bootstrap do HUB (ou o snapshot), carrega `prisma.totemApresentacao.findMany({ where: { empresaId: aparelho.empresaId } })` e aplica `projetarCatalogo`. Resposta = bootstrap do HUB **+** `catalogo.categorias[].produtos` (aditivo; `itens` continua igual) **+** `avisosApresentacao` (separado dos `avisos` do HUB; só `{ cwItemId, codigo }`, sem dados sensíveis). Falha ao ler a configuração → bootstrap sem `produtos` (o front cai para `itens`) e log; **o catálogo público nunca quebra**.

### 4.3 Admin (`exigirAdmin`, tenant via `getEmpresaIdAtual()`; prefixo `/totem` já mapeia para a área `aparelhos`)
- `GET /api/totem/apresentacao` → **merge** entre catálogo vivo e configurações persistidas (ajuste 2):
  ```
  { itens:[{ cwItemId, nome, categoria, precoBase, config: { id, modo, cwGrupoPrincipalId } | null,
             validacao: { ok, codigo? },                       // validarConfiguracao da config atual (ok quando NORMAL)
             grupos:[{ id, nome, min, max, choiceType, nOpcoes,
                       elegivel: { ok, codigo? },              // grupoElegivel — olha só o grupo
                       selecionavel: { ok, codigo? } }] }],    // validarConfiguracao({EXPANDIDO, id}, item) — olha o item inteiro (ajuste 4)
    orfas:[{ id, cwItemId, modo, cwGrupoPrincipalId, validacao: { ok:false, codigo:'ITEM_AUSENTE' } }],
    sugestoes:[…], avisosApresentacao:[…] }
  ```
  Um grupo 1–1 de um combo aparece `elegivel.ok:true` e `selecionavel.ok:false, codigo:'OUTRO_GRUPO_OBRIGATORIO'`; a tela desabilita o select com esse motivo antes do salvar. Órfãs (config cujo `cwItemId` sumiu do bootstrap) vêm identificadas por `id` e `cwItemId`.
- `PUT /api/totem/apresentacao/:cwItemId { modo, cwGrupoPrincipalId? }`: `modo` fora de `MODOS` → 400. `EXPANDIDO` → exige `cwGrupoPrincipalId` inteiro e `validarConfiguracao` contra o catálogo vivo (`bootstrapTotemCW`) → 422 `{ erro:'APRESENTACAO_INVALIDA', codigo }` quando falha; upsert por `(empresaId, cwItemId)`. `NORMAL` → `deleteMany({ empresaId, cwItemId })` **sem consultar o catálogo** (é o que remove uma órfã). Nunca aceita `empresaId` do corpo.

## 5. Contrato para o frontend

`catalogo.categorias[].produtos[]` — leve, sem a árvore técnica (ajuste 1):
```
{ id: 'item:2979325' | 'opcao:2979325:795194:3633259',
  tipo: 'ITEM' | 'OPCAO_PRINCIPAL',
  nome, descricao, imagem,                    // identidade apresentada (da opção no EXPANDIDO; imagem cai para a do item)
  preco, precoPromocional?,                   // EXPANDIDO: base + preço da opção (promo da base + opção)
  status: 'ACTIVE' | 'MISSING',               // EXPANDIDO: status da opção; item MISSING → todos MISSING
  ordenavel: boolean, motivo?,                // itemOrdenavel do item base (outro grupo em falta etc.)
  origem: { itemId, grupoId?, opcaoId? },     // ids exatos do CW — é o que vira carrinho
  grupoPrincipalId?: 795194 }                 // EXPANDIDO: para o detalhe ocultar/travar
```
O frontend monta **um índice `itemId → item técnico`** a partir de `categorias[].itens` (o mesmo item em duas categorias tem grupos idênticos; vale a primeira ocorrência) e resolve `origem.itemId` ao abrir o produto. `itens` permanece obrigatório no bootstrap.

## 6. Comportamento no Totem

- **Grid:** renderiza `produtos` quando presente (fallback: `itens` como hoje). Card = `nome/imagem/descricao/preco`; MISSING → "Em falta"; `!ordenavel` → "Indisponível no momento".
- **Detalhe:** `abrirProduto(produto)` → `linhaDeProduto(produto, indice)` cria `{ item: indice[origem.itemId], apresentado: { nome, imagem, descricao, grupoPrincipalId, opcaoId }, selecoes: { [grupoPrincipalId]: [{ opcaoId, qtd:1 }] }, qtd:1, uid }`; título/foto do apresentado; `gruposRenderizaveis(linha)` = grupos do item **sem** o principal; "Adicionar" usa `itemPronto` normal (o principal já satisfaz o grupo). Trocar o produto = voltar ao grid.
- **Carrinho/Revisar/Confirmar:** cada linha tem `uid` próprio (já é assim); `nomeApresentado(linha)` = `apresentado?.nome ?? item.nome`; complementos listados sem o principal; `subtotalLocal` inalterado (base + opções, o principal entra como opção). `montarCarrinho` **não muda**.
- **Cotar/Pedido:** intactos; o HUB recalcula pelo trio de ids; hash idêntico ao de uma seleção manual.
- **Duas linhas do mesmo item base** (ajuste 5, verificado no código atual): edição/remoção/quantidade são por `uid`; `montarCarrinho` emite uma entrada por linha; o HUB devolve `linhas` na ordem do carrinho e soma o estoque das duas; `diffCotacao` casa por **índice** primeiro (correto) e só cai para `itemId` quando o índice não bate. É seguro para carrinho, cotação e pedido. A única imprecisão é de **destaque**: `alteradas` é lista de `itemId`, então se só X BURGUER mudar de preço, X BACON (mesmo `itemId`) também aparece marcado em "Preços atualizados". Correção aditiva na A5: `diffCotacao` passa a devolver também `alteradasIdx` (índices das linhas) e a tela marca por índice/`uid`; `alteradas` continua por compatibilidade. Sem mudança no casamento.
- Frontend sem heurística: só consome `produtos`.

## 7. Fallback e avisos

Toda configuração é revalidada **a cada bootstrap** contra o catálogo vivo com a mesma `validarConfiguracao`. Inválida → item em NORMAL na vitrine + aviso em `avisosApresentacao` e código no admin. Casos: item saiu do catálogo/`service_desk` (`ITEM_AUSENTE`, e no admin vira **órfã**), grupo removido, grupo deixou de ser 1–1, apareceu outro grupo obrigatório, grupo sem opções visíveis. Opção `MISSING` → produto MISSING (em falta), não é fallback.

## 8. Tela admin mínima (`/totem/apresentacao`)

Sidebar aprovada: **Loja Digital › Totem** vira grupo com **Pedidos** e **Apresentação** (`/totem/pedidos`, `/totem/apresentacao`); Aparelhos segue ao lado. Tela: lista dos itens do CW (nome, categoria, preço base), seletor NORMAL/EXPANDIDO, select do grupo principal com só `selecionavel.ok` habilitado e o `codigo` como motivo nos demais, estado da validação atual, seção **Órfãs** (config sem item no catálogo, com botão "Remover" = PUT NORMAL) e seção **Sugestões** (heurística; "Usar" só preenche o formulário). Salvar por item. Sem edição de nome/imagem/ordem.

## 9. Testes

- **HUB:** opções do bootstrap com `imagem`/`descricao` (presentes e nulos); golden TRADICIONAIS mantém preços/ordem.
- **PDV `totemApresentacao.test.js`:** `grupoElegivel` (SINGLE 1–1 ok; SUMMABLE 1–1 ok; MULTIPLE 0–1 não; 2–2 não; sem opções não; INACTIVE não). `validarConfiguracao` para cada código, incluindo COMBO - TRADICIONAIS → `OUTRO_GRUPO_OBRIGATORIO` mesmo com o grupo 1–1 em `index` 0, e `ITEM_AUSENTE` com item nulo. `projetarCatalogo`: golden TRADICIONAIS → 9 produtos `OPCAO_PRINCIPAL` na ordem do CW, preço = opção, imagem/descrição da opção, `origem` com os três ids, **sem campo `item`**; DOGS → imagem cai para a do item; item MISSING → todos MISSING; opção MISSING → produto MISSING; promo na base soma à opção; item sem config → `ITEM`; config inválida → `ITEM` + aviso; `itens` preservado; entrada não mutada. `sugerirCandidatos` golden: **TRADICIONAIS, ARTESANAIS, DOGS, ACOMPANHAMENTO**; não COMBO ×2, QUINTA ×2, MONTE SUA BOX. Vínculo por id: X BURGUER com quatro ids diferentes → cada produto aponta ao seu.
- **PDV admin (varredura em `totem.tenant.test.js`):** rotas `/api/totem/apresentacao*` nunca leem `empresaId`/`clienteId` do corpo; toda consulta escopada. Teste puro do merge: config órfã aparece em `orfas` com `ITEM_AUSENTE`; `selecionavel` ≠ `elegivel` no combo.
- **Frontend `totemCarrinho.test.js`:** `indicePorItemId(categorias)`; `linhaDeProduto` gera `selecoes` com o principal; `gruposRenderizaveis` exclui o principal; `nomeApresentado`; `montarCarrinho` da pré-seleção byte-idêntico ao da seleção manual; `itemPronto` satisfeito só pelo principal; `subtotalLocal` = base + opção; **duas linhas do mesmo item base** (X BURGUER e X BACON de TRADICIONAIS): `montarCarrinho` com duas entradas corretas, `subtotalLocal` de cada uma, `nomeApresentado` de cada uma, `diffCotacao` com `linhasHub` na ordem marcando **só** a linha alterada em `alteradasIdx` (e `alteradas` por `itemId` como hoje), edição por `uid` não vaza para a outra linha.
- **Smoke:** configurar TRADICIONAIS como EXPANDIDO, ver 9 cards, abrir X BURGUER, adicionar milho, cotar 13,50, adicionar também X BACON, revisar as duas linhas, **sem confirmar**; tentar COMBO - TRADICIONAIS → select desabilitado com `OUTRO_GRUPO_OBRIGATORIO` e PUT → 422.

## 10. Deploy

HUB primeiro (aditivo, sem migration). PDV depois: `bash deploy.sh` aplica `20260912120000_totem_apresentacao`. Sem env novo. O Totem só muda depois que a loja configurar um item como EXPANDIDO.
