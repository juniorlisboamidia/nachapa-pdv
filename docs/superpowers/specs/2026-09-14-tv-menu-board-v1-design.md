# TV Indoor — Menu Board V1: investigação, arquitetura e decisões

**Data:** 2026-09-14 · **Canal:** Loja Digital › TV Indoor · **Estado:** implementado nesta frente.

A TV já toca imagens em playlist. Esta frente acrescenta um **segundo tipo de item**: o
**Menu Board**, alimentado pelo catálogo real do Cardápio Web — sem preço digitado à mão.

---

## 1. Investigação

### 1.1 O caminho real do catálogo (e ele já existe)

```
TV / admin → backend do PDV → cardapioPedido.js (JWT svc 'pdv-operacao')
           → HUB /api/internal/cardapio-totem-bootstrap → Cardápio Web
```

- `bootstrapTotemCW(clienteId)` em `backend/cardapioPedido.js` é a **única** porta. Nenhuma
  credencial do CW mora no PDV; o HUB é quem fala com o CW.
- `clienteIdDaEmpresaTotem(empresaId)` é o **único** lugar que lê `Empresa.clienteId`.
- `catalogoVivoDoAdmin(empresaId, res)` (server.js) já é **neutro**: clienteId → HUB →
  valida `conectado` e `categorias` → devolve `catalogo`. Fail-closed: 200 sem categorias
  vira 503, para o admin nunca declarar o cardápio inteiro como órfão.

**Shape do catálogo** (confirmado nos fixtures do cardápio real):

```
catalogo.categorias[] = { id, nome, index, itens[] }
  itens[] = { id, nome, descricao, imagem, preco, status, index, grupos[], precoPromocional? }
```

`precoPromocional` é **opcional e ausente quando não há promoção** — o código do projeto
testa `'precoPromocional' in item`, nunca `!= null`.

### 1.2 O que é neutro e o que é do Totem

| Peça | Natureza | Uso no Menu Board |
|---|---|---|
| `bootstrapTotemCW` / `clienteIdDaEmpresaTotem` | **infra neutra** (nome histórico) | reusada |
| `catalogoVivoDoAdmin` | **infra neutra** | reusada |
| `projetarCatalogo` / `TotemApresentacao` (vitrine) | **produto do Totem** | ❌ não tocado |
| `TotemBanner`, `TotemConfiguracao`, `TotemDestaque`, `TotemCategoria` | **produto do Totem** | ❌ não tocado |
| `midiaImagem.js`, `midiaAgenda.js` | helpers técnicos | reusados |

O Menu Board consome o catálogo **cru** (itens base), não o projetado. A projeção da vitrine
é uma decisão de apresentação do totem — expandir um combo em nove cards faz sentido num
quiosque onde o cliente escolhe, e nenhum sentido numa parede.

### 1.3 Selos/fitas — a fronteira que precisou mudar

As fitas ("Mais pedido", "Recomendado", "Novidade", "Edição limitada", "Oferta", com as
cores do HUB) foram implementadas em `TotemFita` + `backend/totemFita.js`.

**Problema:** a fita não é uma decisão do canal — é um atributo do **produto da loja**. O
gestor não quer marcar "Mais pedido" duas vezes, uma para o totem e outra para a TV. Mas a
TV ler `prisma.totemFita` é exatamente o acoplamento que a frente anterior proibiu (e que um
teste desta base ativamente impede).

**Decisão:** promover a fita a **conceito neutro do catálogo**:

- `TotemFita` → **`ProdutoFita`** (migration de rename, idempotente e tolerante aos dois estados);
- `backend/totemFita.js` → **`backend/produtoFita.js`**, conteúdo idêntico;
- o teste de independência da TV continua proibindo todo model `totem*` — `produtoFita` entra
  na lista de **permitidos**, ao lado dos helpers técnicos, porque é catálogo e não canal.

Uma fita marcada aparece **nos dois canais**, com as mesmas cores, sem cadastro duplicado.

### 1.4 IDs do CW

O CW usa **inteiros** (`3527346`, `2979331`) e o projeto já os persiste como `Int` em
`TotemApresentacao.cwItemId` e `ProdutoFita.cwItemId`. Mas o id chega `number` do HUB e
`string` da rota, e por isso **toda comparação no projeto é `String(a) === String(b)`**.

No Menu Board a referência vive dentro de `configuracao Json`, então guarda **o que veio** e
a resolução compara sempre como texto. A validação aceita inteiro seguro positivo ou string
não vazia — não presume o tipo. Nenhuma FK para o CW.

### 1.5 Player e refresh

`TvIndoorPlayer` relê `/tv/programacao` a cada **60 s** (e em `visibilitychange`), guarda a
última resposta boa em estado e **não substitui por vazio quando o refresh falha** (`.catch`
vazio). O reset do rodízio é governado pela `assinatura` da programação crua. **A frequência
atual já atende a meta** — nada de polling mais agressivo.

### 1.6 Resiliência do catálogo

O totem tem `snapshotTotem` (Map em memória, por loja) guardando a última resposta boa do
bootstrap. É resiliência do **caminho do totem**, com o corpo inteiro (operacional,
pagamentos, modos) — coisas que a TV não usa. Mexer nele significaria tocar o caminho
transacional validado em produção.

**Decisão:** um cache próprio e menor, em `backend/catalogoDaLoja.js`: guarda **só o catálogo**
por empresa, com carimbo de tempo. A TV e o admin do Menu Board o consomem. Duas camadas de
último-estado-bom, uma em cada ponta:

```
HUB fora → catalogoDaLoja devolve o catálogo em cache (desatualizado: true)
          → o board continua resolvendo com os últimos preços conhecidos
cache vazio E HUB fora → o board não é elegível; o player segue para o próximo item
refresh HTTP falha    → o player mantém a programação que já está tocando
```

Cold-start totalmente offline continua fora do V1 (o cache é de processo).

---

## 2. Schema e migration

**Migration `20260928120000_tv_menu_board_v1`** — aditiva, idempotente, e ordenada depois de
`20260927120000_tv_indoor_v1`. Nenhum timestamp histórico é tocado.

```prisma
model TvMenuBoard {
  id, empresaId, nome, ativo(true), layout,        // GRADE | LISTA | DESTAQUE
  duracaoSegundos(20), configuracao Json, criadoEm, atualizadoEm
  itens TvPlaylistItem[]
  @@index([empresaId])
}

model TvPlaylistItem {                              // agora POLIMÓRFICO
  id, playlistId, tipo String @default("IMAGEM"),  // IMAGEM | MENU_BOARD
  conteudoId Int?,    // ← deixa de ser NOT NULL
  menuBoardId Int?,
  ordem
  @@unique([playlistId, conteudoId])   // NULLs não colidem no Postgres
  @@unique([playlistId, menuBoardId])
}
```

`configuracao` guarda **só referências e escolhas**:

```json
{ "cwCategoriaId": 123, "titulo": "Hambúrgueres",
  "itens": [{ "cwItemId": 3527346 }, { "cwItemId": 3529326, "destaque": true }] }
```

Nunca nome, preço, imagem, promoção ou disponibilidade — tudo isso é dinâmico.

**Preservação:** `ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'IMAGEM'` faz cada item existente
virar IMAGEM sem edição manual; `conteudoId` continua preenchido neles.

**CHECK em SQL** (o Prisma não expressa isto), *mais* validação no domínio:

```sql
CHECK ( (tipo='IMAGEM'     AND conteudoId IS NOT NULL AND menuBoardId IS NULL)
     OR (tipo='MENU_BOARD' AND menuBoardId IS NOT NULL AND conteudoId IS NULL) )
```

**Duração da duração:** 20 s de padrão no board (contra 10 s da imagem) — um menu precisa ser
**lido**, e quem passa na frente precisa de tempo para achar o produto e o preço.

---

## 3. Layouts (três, fechados)

Medidos para o alvo **1920 × 1080**, com faixa de título de ~140 px:

| Layout | Composição | Teto | Por quê |
|---|---|---|---|
| **GRADE** | 4 colunas × 2 linhas | **8** | card de ~440 px com foto 16:9 (~247 px) + nome + preço; 12 cards deixariam o preço menor que o do totem a 3 m |
| **LISTA** | linhas com nome … preço | **10** | linha de ~72 px em ~900 px úteis; foto opcional, descrição curta quando couber |
| **DESTAQUE** | 1 grande (metade esquerda) + 2×2 | **5** | o destaque é escolhido pelo gestor (`destaque: true`); sem escolha, vale o primeiro |

Sem configuração de colunas, sem arrastar blocos, sem editor livre.

---

## 4. Contrato público

`/tv/programacao` passa a declarar o tipo de cada item (aditivo — o item de imagem mantém
todos os campos que já tinha):

```jsonc
{ "tipo": "imagem", "id": 4, "duracaoSegundos": 10, "imagemUrl": "/…?v=3", … }

{ "tipo": "menu_board", "id": 7, "duracaoSegundos": 20, "layout": "GRADE",
  "titulo": "Hambúrgueres",
  "produtos": [
    { "id": "3527346", "nome": "X Bacon", "descricao": "…", "imagemUrl": "https://…",
      "preco": 31.9, "precoAnterior": 37.9, "descontoPercentual": 16,
      "selo": { "texto": "Mais pedido", "cor": "#B45309" } }
  ] }
```

O servidor resolve as referências contra o catálogo atual e entrega **domínio visual**: a TV
não conhece uma regra do CW. Nenhum byte de imagem — as fotos dos produtos são URLs do
catálogo, nunca copiadas para o banco do PDV.

---

## 5. Disponibilidade, promoção e selo

- **Indisponível não aparece.** `status !== 'ACTIVE'` sai da lista. 8 configurados com 2 em
  falta → 6 na tela. Nada é preenchido automaticamente com produto que o gestor não escolheu.
- **Board sem nenhum produto disponível não é elegível**: o player segue para o próximo item.
  Playlist inteira sem item reproduzível → institucional.
- **Promoção**: `precoPromocional` é o preço atual e `preco` vira o anterior; o percentual é
  calculado **só** desses dois valores (`Math.round((1 − por/de) × 100)`), e some quando o par
  não forma oferta. Nada é inventado, nada é recalculado por outra régua.
- **Selo**: código do banco → `{ texto, cor }` resolvido pelo domínio compartilhado
  (`produtoFita.js`). A TV desenha com componente próprio; a cor é a mesma do HUB.

---

## 6. Isolamento

| Ponto | Como |
|---|---|
| Board de outra empresa | toda consulta com `empresaId` da sessão; `deleteMany`/`updateMany` escopados |
| Board B numa playlist A | os ids aceitos saem de `findMany({ where: { empresaId } })`; o domínio **recusa** (não filtra) o que não estiver lá |
| Catálogo de outra empresa | `catalogoDaLoja(empresaId)` resolve o `clienteId` da própria empresa; o cache é por `empresaId` |
| TV | `whereDoAparelho(ap, {})` — `empresaId` do cookie, nunca do navegador |

---

## 7. Identidade visual

A configuração de cores mora em `TotemConfiguracao` — **do canal totem**. Lê-la criaria o
acoplamento conceitual proibido. O Menu Board usa **defaults próprios da TV** (os mesmos
literais da marca, copiados por valor, como já foi feito com as cores das fitas) e a **logo da
loja**, que é neutra (`Empresa.logoDataUrl`, já entregue pelo `/eu`).

**Dívida registrada:** personalização de cores do canal TV Indoor (fundo, texto, destaque),
com tela própria — não existe no V1.

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Deploy sem migration | leituras do board com `.catch` próprio; a TV cai no institucional, nunca erro na parede |
| HUB fora no momento do refresh | cache de catálogo por empresa + player mantém a última programação boa |
| Produto sai do catálogo | a referência **não** é apagada: o admin mostra "Produto não encontrado no catálogo" e oferece remover |
| Foto do produto quebra | `onError` esconde a foto, o card continua com nome e preço; o board nunca cai por uma imagem |
| Rename `TotemFita`→`ProdutoFita` | migration condicional (`IF EXISTS … AND NOT EXISTS …`), preserva 100% dos dados |

## 9. Fora do V1

editor livre · DnD de layout · zonas · vídeo · YouTube · áudio · QR · clima · relógio ·
redes sociais · templates do usuário · fontes customizadas · vertical · sincronização
frame-perfect · pedido pela TV · CTA · estoque · alteração de preço pelo PDV.
