# Totem — Redesign de UX/UI (Fase V1) — Design Doc

**Revisão 2 — 2026-09-12.** Arquitetura aprovada conceitualmente pelo Junior. Esta revisão fecha as cinco decisões de produto (§16) e aplica quatro correções: sai o campo de observação, o checklist passa a distinguir TRADICIONAIS de COMBO, "os mais pedidos" deixa de ser tratado como categoria sintética e a tela inicial perde a foto ambiente. **Implementação (V1–V11) ainda não autorizada.**

**Data:** 2026-09-12
**Repo:** `nachapa-pdv` (PDV "Operação")
**Escopo:** camada de apresentação visual do Totem do CLIENTE (`/dispositivo`). Nenhuma regra de negócio, nenhum contrato HTTP, nenhuma migration.
**Spec funcional vigente (fonte de verdade das regras):** `docs/superpowers/specs/2026-09-10-totem-fase-a-design.md` e `docs/superpowers/specs/2026-09-12-totem-apresentacao-design.md` (rev. 3).

---

## 0. O que este documento é (e o que não é)

A Fase A e a Camada de Apresentação (rev. 3) estão **validadas em produção**: catálogo do CW, ordem por `index`, `allowed_times`, Vitrine com grupo principal oculto, preço mínimo "a partir de", carrinho com duas linhas do mesmo `itemId`, cotação assinada, pedido real no CW (#800), autoaceite e impressão.

Este documento propõe **substituir a casca visual** que envolve essa máquina. Ele:

- **não** altera nenhuma função de `frontend/src/components/totemCarrinho.js`;
- **não** altera nenhuma rota, contrato ou payload;
- **não** altera o HUB;
- **não** altera o admin (`Loja Digital › Totem › Apresentação`, `› Pedidos`, `› Aparelhos`);
- **não** propõe migration.

Onde uma melhoria visual dependeria de dado que hoje não chega ao aparelho, o documento **registra a dependência e recomenda adiar** — não a implementa por conta própria.

---

## 1. Mapa da implementação atual

### 1.1 Arquivos

| Arquivo | Linhas | Papel |
|---|---|---|
| `frontend/src/pages/DispositivoPareamento.jsx` | 210 | Rota `/dispositivo`. Única porta do tablet. `GET /public/aparelho/eu` → 200 monta o Totem, 401 mostra o teclado de 6 dígitos. Monta `<TotemQuiosque>` passando `aparelho`, `loja`, `onNaoPareado`. |
| `frontend/src/pages/TotemQuiosque.jsx` | 1205 | **Tudo do quiosque**: estado, efeitos, chamadas HTTP, e as 8 telas renderizadas por `if (tela === '…')` dentro de um único componente. |
| `frontend/src/components/totemCarrinho.js` | 533 | Módulo **puro** (sem React, sem rede). Regras de carrinho, apresentação, preço de card/cabeçalho, diff de cotação, classificação de falha, dicionário de mensagens. |
| `frontend/src/components/totemCarrinho.test.js` | — | 75 testes `node --test`. |
| `frontend/src/styles/global.css` | 3718 | CSS de **todo o PDV**. O bloco do quiosque vive nas linhas **3352–3718** (`.ttm-*`). |
| `frontend/src/services/api.js` | — | `aparelhoApi` (axios com `withCredentials`, cookie `pdv_aparelho`). |

**Nenhum componente compartilhado do admin é usado pelo Totem.** Ele não importa `Layout`, `Card`, `Toast`, `ConfirmDialog`, `Header` nem `Sidebar`. Isso é deliberado (a tela roda fora do `Layout`, em `100dvh`) e é a razão pela qual o redesign pode ser feito sem risco para o restante do app.

### 1.2 Colisão de prefixo (achado importante)

O prefixo `.ttm-` é usado por **duas** coisas diferentes no mesmo `global.css`:

- linhas **3313–3350**: telas de escritório `Totem › Pedidos` e `Totem › Apresentação` (`.ttm-filtros`, `.ttm-badge-revisao`, `.ttm-codigo`, `.ttm-apr-form`, `.ttm-linha-revisao`…);
- linhas **3352–3718**: o quiosque do cliente (`.ttm-card`, `.ttm-linha`, `.ttm-grade`, `.ttm-codigo-balcao`…).

Não há hoje uma classe **idêntica** nos dois lados, mas as famílias se entrelaçam: `.ttm-linha-revisao` (linha de tabela do admin) convive com `.ttm-linha` (linha do carrinho), e `.ttm-codigo` (admin) com `.ttm-codigo-balcao` (quiosque). **Um redesign que reescreva `.ttm-*` no quiosque tem chance real de pintar o admin sem aviso** — basta um seletor novo um pouco mais genérico. A proposta (§10) separa os prefixos.

### 1.3 Fluxo de estados (contrato, não gosto)

```
inicio → catalogo → item → carrinho → pagamento → revisar → (confirmar) → resultado
                      ↑        ↓
                      └── editar linha
                                        ↘ erro (recusa determinística)
```

`pagamento` vem **antes** de `revisar` porque o método entra no hash da cotação assinada.

Estado que sustenta o fluxo (todo em `TotemQuiosque.jsx`):

| Estado / ref | Papel |
|---|---|
| `boot`, `bootErro`, `carregandoBoot` | Bootstrap; refresh silencioso a cada 5 min que **nunca** derruba quem está pedindo. |
| `tela`, `orderType`, `categoriaId`, `aberto`, `carrinho`, `metodoId` | Navegação e montagem. |
| `chaveRef` | Chave de idempotência. Nasce **uma vez** no "Confirmar" e é reenviada igual num retry manual. |
| `travadoRef` / `travado` | Confirmação em dúvida (AMBÍGUO). Trava a tela num único botão; bloqueia `revisar()` e `invalidarCotacao()`. |
| `cotandoRef`, `cotarSeqRef` | Mata duplo toque e resposta atrasada de cotação. |
| `inatividadeRef` | Reset em 90 s fora do Início — **desarmado** enquanto `enviando` ou `travado`. |
| `resultado`, `liberouNovo` | Desfecho; "Novo pedido" só aparece 20 s depois de um 202. |

Efeitos relevantes: heartbeat 60 s + `visibilitychange`; polling do `cwDisplayId` (3 s × 20); timeout de 90 s que converte "dúvida abandonada" em tela de resultado com instrução de procurar o balcão.

### 1.4 Contrato que o aparelho já recebe (nada disso muda)

`GET /api/public/aparelho/totem/bootstrap`:

```
{ loja:{nome,logo}, operacional:{status,abertaAgora,modos}, orderTypes:['onsite','takeout'],
  metodos:[{id,kind,name,kindAmbiguo}], catalogo:{ categorias:[ {id,nome,index,
     itens:[ {id,nome,descricao,imagem,preco,precoPromocional?,status,index,
        grupos:[ {id,nome,choiceType,min,max,status,index,custoMinimo,custoMaximo,
           precoVariavel, opcoes:[ {id,nome,preco,status,maxQuantidade,index,
              imagem, descricao} ] } ] } ],
     produtos:[ {id,tipo,nome,descricao,imagem,preco,precoPromocional?,precoMinimo,
        precoMinimoPromocional?,precoEhAPartirDe,status,ordenavel,motivo?,
        origem:{itemId,grupoId?,opcaoId?},grupoPrincipalId?} ] } ] },
  avisosApresentacao:[], snapshotEm, desatualizado? }
```

**Resposta à pergunta do item 5 do briefing: sim — `imagem` e `descricao` de cada OPÇÃO já chegam ao frontend.** O HUB passou a emiti-las na rev. 2 (`backend/cardapioPedidoTotem.js`, montagem das opções) e o PDV repassa o catálogo inteiro sem filtrar (`bootstrapPublico` faz spread do objeto do HUB). Hoje o Totem **ignora esses dois campos**: `TotemQuiosque.jsx:825` e `:845` renderizam apenas `op.nome` e `op.preco`. O redesign dos complementos **não precisa de nenhuma mudança de backend**.

---

## 2. Dispositivo alvo

### 2.1 O que existe hoje

- `frontend/index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0">` — correto, e **não** desabilita zoom.
- `.ttm-raiz`: `min-height:100dvh`, coluna flex, `overflow-x:hidden`, `touch-action:manipulation`, `font-size:17px`, cores **literais** (o tema escuro do admin não alcança o quiosque — regra a preservar).
- Um único breakpoint: `@media (max-width: 560px)` (linha 3700) — pensado para **celular**, não para monitor vertical.
- `prefers-reduced-motion` e `:focus-visible` já tratados (linhas 3713–3718 e 3390).
- Alvos de toque: botão de ação `min-height:60px`; opção `min-height:60px`; stepper 52×52; teclado do pareamento 74px. **Isso já está acima do mínimo** — o problema não é tamanho de alvo, é aproveitamento de área e hierarquia.

### 2.2 O que falta

Nada no CSS atual foi escrito para **retrato grande**. Entre 561px e ∞ existe **um único layout**, o mesmo que roda no notebook do desenvolvedor. Consequências medidas para um monitor 1080×1920 em pé:

| Elemento | Cálculo hoje | Resultado |
|---|---|---|
| Grade de produtos | `repeat(auto-fill, minmax(220px,1fr))` em 1040px úteis | **4 colunas** de ~250px |
| Foto do card | `height:132px` fixo | foto pequena, ~13% da largura da tela |
| Detalhe do item | `max-width:760px` centrado | **320px de vazio** (30% da tela) em cada lado |
| Carrinho / revisão | `max-width:760px` | idem |
| Categorias | faixa horizontal rolável | rolagem horizontal escondida (`scrollbar-width:none`), sem indício de que há mais categorias |
| Altura útil | header 68 + abas ~72 | ~1780px de grade para cards de 240px → muito ar |

### 2.3 Alvo proposto

**Referência de projeto: 1080 × 1920 (retrato), mas o layout é fluido** — nada é fixado em pixels de tela. Faixas:

| Faixa (largura × altura) | Layout |
|---|---|
| ≥ 900px e retrato | Sidebar completa + **2 colunas** de produto (o padrão do projeto) |
| ≥ 1500px | Sidebar completa + 3 colunas |
| 600–899px | Sidebar estreita (nome em 2 linhas, fonte menor) + 2 colunas |
| < 600px | Modo de emergência: categorias voltam a ser faixa no topo, 1–2 colunas (é o tablet pequeno improvisado, não o alvo) |
| altura < 760px (paisagem) | Header 72px, barra do pedido 96px, sidebar com rolagem própria |

Math do alvo: sidebar `clamp(190px, 21vw, 260px)` → 227px em 1080. Área de produtos 853 − 48 de padding = 805; gap 20 → **cards de 392px** com foto 4:3 de **294px**. Altura útil 1920 − 96 (header) − 132 (barra) = 1692 → ~4 linhas visíveis, 8 produtos por tela sem rolar. É esse número que transforma "app web" em "totem".

**Confirmação da resolução real (decisão 1 do §16).** 1080 × 1920 é a referência oficial da V1 e a implementação segue com ela. A tela `Aparelhos` **não** passa a exibir resolução nesta frente — a medida verdadeira é lida no checkpoint físico, pelo `heartbeatJson.tela` que o próprio totem já grava a cada 60 s (item 16 do checklist §13.3). Como nenhuma medida do desenho é fixa em pixels de tela, uma divergência ajusta as faixas desta tabela, não o layout.

---

## 3. Problemas encontrados no layout atual

Ordenados por impacto, com evidência.

1. **A identidade não é a da loja.** O quiosque usa creme `#f4f1ea` + laranja `#f97316` (o `--brand-gold` do PDV administrativo). A identidade pedida é **preto, branco e amarelo `#f9d900`**. Além da marca, há um problema objetivo: **branco sobre `#f97316` dá 2,8:1 de contraste** — abaixo até do piso de 3:1 para texto grande. O CTA principal do totem hoje é ilegível pelo critério WCAG. Preto `#0e1319` sobre amarelo `#f9d900` dá **13,3:1**.
2. **Botão "Novo pedido" ocupa meia tela (bug real de CSS).** `.ttm-btn-largo` é `flex:1 1 auto` (linha 3415) e `.ttm-resultado` é um container **coluna** com espaço livre (linha 3650) → o `flex-grow` cresce na **vertical**. Não é escolha de design; é o botão esticando.
3. **A foto não é protagonista.** 132px de altura fixa num card de 240px, num monitor de 1920. Comida vende por foto.
4. **Categorias em chips horizontais roláveis**, com a barra de rolagem escondida. Em retrato, com 8+ categorias, o cliente não vê que existem mais — e a categoria ativa (pílula preta) compete visualmente com o CTA.
5. **Depois de "Adicionar", o cliente é jogado no carrinho** (`TotemQuiosque.jsx:448`). Para montar um pedido de 3 itens são 3 idas e voltas desnecessárias.
6. **Complementos são linhas de texto.** `imagem` e `descricao` da opção chegam e são descartados (§1.4).
7. **Detalhe é uma página longa** sem noção de progresso: em um combo, o cliente rola por Maionese, Bebida e Acompanhamento sem saber quantas escolhas faltam. Não há avanço automático.
8. **Sem espaço morto útil:** detalhe, carrinho, pagamento e revisão todos em `max-width` de 620–760px, deixando 30–40% da tela vazia em retrato.
9. **Ações destrutivas coladas:** "Editar" e "Remover" são dois links de texto com **8px** de intervalo (`.ttm-linha-acoes`), num aparelho operado em pé, com uma mão.
10. **Emoji como ícone** em toda a casca (🍽️ 🛍️ 🍔 ✅ ⏳ 🌙 ⚠️ 🔌). Renderização varia por sistema e não tem cara de produto.
11. **Tela de revisão sem peso:** é uma lista igual à do carrinho. Deveria ser a tela que dá confiança antes do ponto sem volta.
12. **Carrinho vazio** é um parágrafo solto ("Seu carrinho está vazio. Toque em 'Voltar'…").
13. **Sem `user-select:none`** — toque longo seleciona texto e abre menu do sistema no meio do pedido.
14. **Sem `env(safe-area-inset-*)`** — irrelevante em monitor com moldura, relevante se o aparelho for um iPad.
15. **Um arquivo de 1205 linhas** com 8 telas dentro. Qualquer alteração visual obriga a reler o orquestrador de idempotência.

---

## 4. O que permanece × o que é substituído

### 4.1 Permanece intocado (lógica validada)

`frontend/src/components/totemCarrinho.js` **inteiro**, e por consequência os 75 testes:

`precoEmVigor` · `podeAdicionarOpcao` · `grupoSatisfeito` · `itemPronto` · `itemOrdenavel` · `subtotalLocal` · `indicePorItemId` · `linhaDeProduto` · `gruposRenderizaveis` · `nomeApresentado` · `imagemApresentada` · `descricaoApresentada` · `opcoesVisiveisDaLinha` · `linhaDoDetalhe` · `substituirLinha` · `montarCarrinho` · `diffCotacao` · `proximoEstadoAposFalha` · `chaveNova` · `mensagemErro` · `precoDoCard` · `mensagemApresentacao` · `precoDoCabecalho`

E também, dentro de `TotemQuiosque.jsx`, **toda a camada de orquestração**: bootstrap e refresh silencioso, heartbeat, `chaveRef`/`travadoRef`/`cotandoRef`/`cotarSeqRef`, `revisar()`, `confirmar()`, `reiniciar()`, `invalidarCotacao()`, polling do display, os três efeitos de tempo (inatividade, liberar novo, dúvida abandonada) e os guardas de `enviando`/`travado`.

**Regra dura do redesign:** essa camada continua num único componente pai. As telas viram componentes **de apresentação**, que recebem tudo por props e não guardam estado próprio de fluxo. Nenhum `useState` novo pode nascer dentro de uma tela filha.

### 4.2 É substituído (casca)

- O bloco CSS `.ttm-*` do quiosque (linhas 3352–3718 de `global.css`).
- O JSX de renderização das 8 telas.
- Os subcomponentes locais `Cabecalho`, `TelaAviso`, `FotoItem`, `PrecoItem`, `Stepper`, `Spinner`.
- Os emoji.

### 4.3 É removido: o campo de observação

Decisão do Junior nesta revisão: o Totem redesenhado **não** tem o campo "Alguma observação?".

Um registro honesto do que isso significa, porque o campo **existe hoje** e está no ar: `TotemQuiosque.jsx` desenha um `<textarea>` de 200 caracteres no fim do detalhe; `montarCarrinho` já emite `observacao` na linha quando o texto não está vazio; o carrinho mostra o texto entre aspas; e o HUB e o Cardápio Web aceitam o campo. Portanto isto é a **retirada de um elemento existente**, não a recusa de um elemento novo.

O que sai e o que fica:

- **Sai:** o bloco no detalhe, o texto na linha do carrinho, a regra de CSS do `<textarea>` e a exceção de `user-select`.
- **Fica intocado:** `montarCarrinho` continua suportando `observacao` (e seus testes continuam passando) — simplesmente nada preenche o campo, e o corpo enviado passa a nunca trazê-lo. O contrato é opcional, então nada quebra no HUB nem no CW.
- **Reversível:** voltar atrás é acrescentar um bloco de UI, sem tocar em contrato nem em teste.

Se a intenção era manter o recurso e apenas não redesenhá-lo, este é o ponto de reverter — antes da V5, que é a task que constrói o detalhe.

### 4.4 É acrescentado (novo, puro e testado)

- `frontend/src/components/totemFoco.js` — regra da progressão automática entre grupos (§8).
- `frontend/src/components/totemLayout.js` — decisões de layout que são **regra**, não CSS: `modoDeOpcoes(grupo)` (grade com foto vs. lista de texto), `obrigatoriosPendentes(item, selecoes)` (chips do "falta escolher"), `resumoDoPedido(carrinho)`.

---

## 5. Arquitetura visual proposta

### 5.1 Direção

Preto como estrutura, branco como superfície de conteúdo, amarelo como **única** cor de ação, fotografia como protagonista. O amarelo nunca é fundo de texto pequeno nem decoração: ele marca **onde tocar** e **a categoria ativa**. Nada de gradiente, nada de sombra colorida, nada de emoji.

### 5.2 Tokens (escopados em `.tq-raiz`, valores literais)

```
--tq-preto:        #0e1319   estrutura: sidebar, barra do pedido, painel do número
--tq-preto-2:      #1b222b   superfície escura elevada (item ativo na sidebar)
--tq-branco:       #ffffff   cards, sheets
--tq-amarelo:      #f9d900   AÇÃO e seleção
--tq-amarelo-2:    #e3c500   estado pressionado
--tq-tinta:        #0e1319   texto sobre amarelo (13,3:1)
--tq-fundo:        #f7f4ee   chão quente atrás dos cards
--tq-borda:        #e6e1d7
--tq-texto:        #0e1319
--tq-texto-2:      #4a443c   (6,8:1 sobre --tq-fundo)
--tq-texto-3:      #6b6357   (4,8:1 sobre --tq-fundo) — piso; nada mais claro que isto
--tq-perigo:       #b3261e
--tq-perigo-fraco: #fdeceb
--tq-aviso-fundo:  #fff6d6
--tq-aviso-tinta:  #6b4e00
--tq-ok:           #1c6b3a
--tq-raio:         18px   (cards)  ·  --tq-raio-2: 12px (controles)
--tq-sombra:       0 6px 20px rgba(14,19,25,.10)
```

Escala de espaço 4/8: `4 8 12 16 20 24 32 40 56`.

Escala tipográfica (fluida, `clamp`):

| Papel | Tamanho | Peso |
|---|---|---|
| Número do pedido | `clamp(96px, 16vw, 200px)` | 900 |
| Título de tela | `clamp(28px, 3.4vw, 40px)` | 800 |
| Nome do produto (card) | `clamp(20px, 2.1vw, 26px)` | 800 |
| Preço do card | `clamp(22px, 2.3vw, 28px)` | 900, `tabular-nums` |
| Nome de grupo | `clamp(19px, 2vw, 24px)` | 800 |
| Corpo / opção | `clamp(17px, 1.7vw, 20px)` | 600 |
| Rótulo, "a partir de", regra do grupo | `clamp(13px, 1.3vw, 15px)` | 700, `letter-spacing: .06em`, caixa alta |

### 5.3 Tipografia

**Decidido (§16-5): Archivo auto-hospedada, pesos 800 e 900**, em `woff2` servido pelo próprio Vite (sem CDN, sem `@import` externo — o tablet pode estar em rede ruim, e uma fonte que não carrega troca o desenho inteiro no meio do expediente). Licença SIL OFL, dois arquivos, ≈35 KB somados.

- **Archivo 800/900:** nomes de produto, preços, títulos de tela, nomes de grupo, rótulos em caixa alta e o número do pedido.
- **Pilha do sistema:** todo o corpo de texto, descrições e frases de aviso.
- Declarar `font-display: swap` e a pilha do sistema como fallback em cada `@font-face`, para que uma falha de carregamento degrade em vez de apagar texto.
- Os arquivos entram em `frontend/src/assets/fontes/` na task V1.

### 5.4 Ícones

`components/totem/icones.jsx` — SVG inline (traço 2px, 24/32/40px), mesmo padrão já usado em `components/sidebarIcons.jsx`. Conjunto mínimo: `sacola`, `mesa`, `carrinho`, `mais`, `menos`, `check`, `lixeira`, `lapis`, `voltar`, `relogio`, `cifrao`, `cartao`, `dinheiro`, `alerta`, `wifi-off`, `lua`, `foto-vazia`. Zero emoji.

---

## 6. Telas — wireframe e "Atual vs Proposto"

### A. Início

```
┌────────────────────────────────────────────┐
│                                            │
│              [ LOGO DA LOJA ]              │
│                                            │
│         FAÇA SEU PEDIDO AQUI               │  ← 1 linha, peso 900
│    Pagamento no balcão, na retirada        │
│                                            │
│  ┌──────────────────┐ ┌──────────────────┐ │
│  │      [mesa]      │ │     [sacola]     │ │
│  │   COMER AQUI     │ │      LEVAR       │ │  ← 2 cartões, altura 26vh
│  │  vou comer na    │ │   vou levar      │ │
│  │      loja        │ │   para viagem    │ │
│  └──────────────────┘ └──────────────────┘ │
│                                            │
│                                 nome-do-tablet │
└────────────────────────────────────────────┘
```

| Atual | Proposto |
|---|---|
| Fundo creme; logo ≤180px; título 40px; dois cartões brancos de 190px com emoji 46px | Fundo **preto liso**, a logo da loja em destaque, cartões **amarelos** de altura proporcional (26vh) com ícone SVG, título em 2 níveis (marca / instrução). **Sem foto ambiente:** o bootstrap entrega `loja = { nome, logo }` e nada mais — não existe campo de imagem de fundo, e inventar um exigiria contrato novo |
| Um modo → texto muda para "Começar meu pedido" | Mantido (regra), com o cartão único ocupando a largura |

Nada de novo no dado: `loja.logo`, `orderTypes` e `MODOS` já existem.

### B. Catálogo (redesign principal)

```
┌──────────────────────────────────────────────────────┐
│ [logo]  COMER AQUI                        Cancelar   │  header 96px
├───────────┬──────────────────────────────────────────┤
│           │                                          │
│  ▌TRADIC. │  ┌────────────────┐ ┌────────────────┐  │
│   COMBO   │  │                │ │                │  │
│   ARTES.  │  │     FOTO       │ │     FOTO       │  │
│   DOGS    │  │    (4:3)       │ │    (4:3)       │  │
│   PORÇÕES │  ├────────────────┤ ├────────────────┤  │
│   BEBIDAS │  │ X BURGUER      │ │ X SALADA       │  │
│           │  │ pão, hambúrguer│ │ pão, alface…   │  │
│  (rolagem │  │                │ │                │  │
│   própria)│  │ R$ 12,00       │ │ R$ 14,00       │  │
│           │  └────────────────┘ └────────────────┘  │
│           │  ┌────────────────┐ ┌────────────────┐  │
│           │  │      …         │ │      …         │  │
├───────────┴──────────────────────────────────────────┤
│  2 itens                              R$ 38,00       │  barra 132px
│  [            VER MEU PEDIDO            ]            │
└──────────────────────────────────────────────────────┘
```

| Atual | Proposto |
|---|---|
| Chips horizontais roláveis no topo | **Sidebar preta fixa** à esquerda, rolagem própria |
| 4 colunas de 250px, foto 132px | **2 colunas** de ~392px, foto 4:3 (~294px) |
| Botão flutuante em pílula, centralizado, sobreposto | **Barra fixa** no rodapé, altura reservada sempre (sem CLS) |
| Após adicionar → vai para o carrinho | Após adicionar → **volta ao catálogo** com confirmação e pulso na barra (decisão 3 do §16) |
| Nome + descrição + preço | Mesmos campos, hierarquia nova; "a partir de" acima do número |

O wireframe acima mostra **TRADICIONAIS 🍔**, categoria normal: nove produtos com o preço de cada um (R$ 12,00 a R$ 22,00), **sem** rótulo. Em **COMBO - TRADICIONAIS**, configurada como Vitrine, os mesmos nove nomes aparecem com o mínimo da jornada e o rótulo: X BURGUER "a partir de R$ 27,90", X SALADA e X DELICIA 29,90, X BACON e X CALA BURGUER 31,90, CHEDDAR BACON 32,90, HAMBURGÃO e X DUPLO 33,90, ESPECIAL 37,90. O card é o mesmo componente nos dois casos; o que muda é o dado que o HUB manda.

### C. Detalhe do produto

```
┌──────────────────────────────────────────────────────┐
│ ‹ Voltar        X BURGUER                 Cancelar   │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │                 FOTO (16:9, até 420px)           │ │
│ └──────────────────────────────────────────────────┘ │
│ X BURGUER                                            │
│ pão, hambúrguer 180g, queijo, alface                 │
│ a partir de R$ 27,90                                 │
│ Falta escolher:  [BEBIDA]  [ACOMPANHAMENTO]          │  ← chips tocáveis (scroll até o grupo)
├──────────────────────────────────────────────────────┤
│ ESCOLHA SUA MAIONESE            opcional · até 2     │
│ ┌───────────────────────┐ ┌────────────────────────┐ │
│ │[foto] MAIONESE VERDE  │ │[foto] MAIONESE DE ALHO │ │
│ │       leve, cítrica   │ │                        │ │
│ │              + R$ 2,00│ │               + R$ 2,00│ │
│ └───────────────────────┘ └────────────────────────┘ │
│                                                      │
│ BEBIDA DO COMBO             OBRIGATÓRIO · escolha 1  │  ← barra amarela à esquerda
│ ┌───────────────────────┐ ┌────────────────────────┐ │
│ │ ✓ COCA COLA LATA      │ │  GUARANÁ LATA          │ │
│ └───────────────────────┘ └────────────────────────┘ │
│ …                                                    │
├──────────────────────────────────────────────────────┤
│  [− 1 +]     [   ADICIONAR · R$ 27,90            ]   │
└──────────────────────────────────────────────────────┘
```

| Atual | Proposto |
|---|---|
| Coluna de 760px, foto 200px, grupos empilhados sem noção de progresso | Foto 16:9 full-bleed, conteúdo em `min(920px, 92vw)`, **chips do que falta**, grupos como blocos com marcação obrigatório/opcional |
| Obrigatório = texto "obrigatório · escolha 1" | Obrigatório = **barra amarela** de 6px na borda esquerda do bloco + rótulo; opcional = borda neutra e rótulo discreto |
| Opção = linha de texto com check quadrado | **Card de opção** com foto, descrição e adicional (§7) |
| Sem avanço automático | **Progressão automática** (§8) |
| Grupo principal oculto | **Mantido** (`gruposRenderizaveis`) |
| Cabeçalho/botão com o piso do card | **Mantido** (`precoDoCabecalho`), só re-tipografado |
| Campo "Alguma observação?" no fim da página | **Removido** — o detalhe termina no último grupo (§4.3) |

### D. Carrinho

```
┌──────────────────────────────────────────────────────┐
│ ‹ Voltar        SEU PEDIDO                Cancelar   │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │[foto] 1× X BURGUER                     R$ 27,90  │ │
│ │       • Coca cola lata                           │ │
│ │       • Batata frita                             │ │
│ │       [− 1 +]        [editar]        [ 🗑 ]      │ │  ← lixeira a ≥32px do editar
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │[foto] 1× X BACON …                               │ │
│ └──────────────────────────────────────────────────┘ │
│              [ + ADICIONAR MAIS ITENS ]              │
├──────────────────────────────────────────────────────┤
│ Subtotal (confirmado na revisão)          R$ 41,80   │
│ [           IR PARA O PAGAMENTO               ]      │
└──────────────────────────────────────────────────────┘
```

| Atual | Proposto |
|---|---|
| Linha sem foto, "Editar"/"Remover" como links a 8px | Linha com miniatura 88px; remover é **ícone** separado por ≥32px, com confirmação inline de 1 toque ("Remover?" → "Sim, remover", expira em 4 s) |
| Vazio = parágrafo | Vazio = ícone + "Seu pedido está vazio" + botão "Ver o cardápio" |
| Complementos em lista com bullet | Mantidos (`opcoesVisiveisDaLinha`), com tipografia legível e a principal oculta |

### E. Pagamento

```
┌──────────────────────────────────────────────────────┐
│ ‹ Voltar     COMO VOCÊ VAI PAGAR?         Cancelar   │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │  ⓘ  NADA É COBRADO NESTE TOTEM                   │ │
│ │     Você paga no balcão ao retirar. Aqui é só    │ │
│ │     para o caixa já saber como você vai pagar.   │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [dinheiro]  DINHEIRO                        ( ) │ │
│ ├──────────────────────────────────────────────────┤ │
│ │ [cartao]    CARTÃO DE DÉBITO                (✓) │ │
│ ├──────────────────────────────────────────────────┤ │
│ │ [cartao]    CARTÃO DE CRÉDITO               ( ) │ │
│ └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│ Subtotal                                  R$ 41,80   │
│ [             REVISAR O PEDIDO                ]      │
└──────────────────────────────────────────────────────┘
```

O aviso "não é cobrado aqui" sai de rodapé de texto e vira **o primeiro elemento da tela**, em bloco de alerta neutro (fundo `--tq-aviso-fundo`). Ícone por método a partir de `m.kind`; `kindAmbiguo` continua caindo para `m.name` (regra existente).

### F. Revisão

```
┌──────────────────────────────────────────────────────┐
│ ‹ Voltar      CONFIRA SEU PEDIDO                     │  ← sem Voltar quando travado
├──────────────────────────────────────────────────────┤
│  COMER AQUI  ·  CARTÃO DE DÉBITO      [trocar]       │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 1× X BURGUER                            R$ 27,90 │ │
│ │    • Coca cola lata  • Batata frita              │ │
│ ├──────────────────────────────────────────────────┤ │
│ │ 1× X BACON                              R$ 13,90 │ │
│ └──────────────────────────────────────────────────┘ │
│  Pagamento no balcão, na retirada.                   │
├──────────────────────────────────────────────────────┤
│ ┃ TOTAL                              R$ 41,80      ┃ │  ← faixa PRETA
│ ┃ [        CONFIRMAR PEDIDO                     ]  ┃ │  ← amarelo
└──────────────────────────────────────────────────────┘
```

| Atual | Proposto |
|---|---|
| Lista igual à do carrinho, total em texto | **Faixa preta** de fechamento com total em 40px e CTA amarelo; a lista fica em um cartão só, sem controles (nada de editar aqui) |
| "Preços atualizados" = bloco laranja | Bloco de alerta no topo + **linha marcada** (borda amarela) via `alteradasIdx` — regra existente |
| Overlay de envio | Mantido, re-desenhado: fundo preto 92%, spinner, "Enviando seu pedido — não feche esta tela" |

### G. Sucesso

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃                  PEDIDO                         ┃  │
│ ┃                   #802                          ┃  │  ← 200px, amarelo sobre preto
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                                      │
│   Vá até o balcão, informe o número e pague na       │
│   retirada.                                          │
│                                                      │
│   Total R$ 41,80  ·  Cartão de débito                │
│                                                      │
│              [ Novo pedido ]     voltando em 12 s    │  ← botão pequeno
└──────────────────────────────────────────────────────┘
```

| Atual | Proposto |
|---|---|
| Emoji ✅, número 88px, botão esticado verticalmente (bug §3.2) | Número **protagonista** em painel preto, sem emoji; botão "Novo pedido" com largura de conteúdo (máx. 320px) e altura fixa 64px |
| "Novo pedido" aparece após 20 s (202) | Mantido, com **contagem visível** dos segundos e a instrução de anotar o código |
| Variantes (buscando número / só referência / ambíguo sem referência) | Mantidas, todas com o mesmo painel: o que muda é o conteúdo do painel (número, referência monoespaçada, ou aviso "procure o balcão") |

### H. Loja fechada

```
┌──────────────────────────────────────────────────────┐
│                    [ LOGO ]                          │
│                                                      │
│                 ESTAMOS FECHADOS                     │
│                                                      │
│   A loja não está aceitando pedidos neste momento.   │
│   Fale com um atendente no balcão.                   │
└──────────────────────────────────────────────────────┘
```

Fundo preto, logo, uma frase. **Sem horário de funcionamento**: o bootstrap público entrega `operacional = { status, abertaAgora, modos }` e **não** entrega `opening_hours` (o HUB o extrai em `extrairOperacional` mas a foto pública só repassa os três campos). Mostrar "abrimos às 18h" exigiria campo aditivo no HUB **e** faria o PDV interpretar semântica de horário — contra a regra de que o HUB é a autoridade. **Recomendação: não fazer.** Mesma casca serve a "Pedidos pausados" (ícone diferente).

### I. Estados de erro e exceção

| Situação | Origem no código | Tratamento visual proposto |
|---|---|---|
| Bootstrap falhou / HUB fora | `bootErro`, `mensagemErro(cod)` | Tela cheia preta, ícone `wifi-off`, frase do dicionário, botão "Tentar de novo". **Nunca** rouba a tela de resultado (guarda existente) |
| Catálogo desatualizado | `boot.desatualizado` | Faixa fina amarela sob o header: "O menu pode estar desatualizado. O valor final é confirmado na revisão." |
| Produto sumiu entre bootstrap e toque | `setAviso(...)` | Toast preto no rodapé, acima da barra, some em 4 s (comportamento atual, novo visual) |
| Item / grupo obrigatório em falta | `itemOrdenavel` | Card apagado com selo "Em falta" ou "Indisponível no momento" (dois motivos distintos — manter a distinção) |
| Cotação recusada | `erroCotar` + `detalhes[]` | Cartão de erro com a frase do servidor **por linha**, nomeando o produto via `linhaDoDetalhe`; dois botões: "Voltar ao carrinho" / "Tentar de novo" |
| Preço mudou | `avisoPrecos` | Alerta no topo + linha marcada por `alteradasIdx` + total em destaque |
| Recusa determinística (4xx) | `tela === 'erro'` | Tela cheia com o motivo e a lista de detalhes; "Voltar" e "Começar de novo" |
| **Ambíguo** (rede/timeout/5xx) | `travado === true` | Fica em Revisar, **sem Voltar**, com um único botão "Tentar confirmar de novo" e a frase "seu pedido pode já ter sido registrado — não vai sair pedido em dobro". Visual: bloco de alerta forte, botão amarelo, nada mais tocável |
| Dúvida abandonada (90 s) | efeito de `travado` | Vira tela de resultado "Estamos confirmando seu pedido — procure o balcão" |
| Inatividade 90 s | `MS_INATIVIDADE` | **Novo**: aos 75 s, sheet "Ainda está aí?" com contagem de 15 s e botão "Continuar". **Suprimido** enquanto `enviando` ou `travado` — mesma guarda do timer atual |
| Loja fechou no meio | — | Nada muda: quem já está pedindo segue até Revisar e o HUB recusa com `LOJA_FECHADA`; a frase já existe no dicionário |

Nenhuma regra nova. Todas as mensagens continuam saindo de `mensagemErro()`.

---

## 7. Estrutura dos cards de opção (complementos)

### 7.1 Duas formas, escolhidas por grupo

`modoDeOpcoes(grupo)` (novo, puro):

- **`GRADE`** quando **pelo menos uma** opção do grupo tem `imagem` → todas as opções do grupo entram em grade de 2 colunas com slot de foto de 96×96 (as sem foto recebem a marca-placeholder em SVG, nunca emoji). Homogeneidade dentro do grupo evita fileira torta.
- **`LISTA`** quando **nenhuma** opção tem imagem → linhas de texto de 72px de altura, largura cheia, sem espaço reservado para foto.

`descricao` só ocupa espaço quando existe e não é string vazia — sem linha fantasma.

```
GRADE                                   LISTA
┌──────────────────────────┐            ┌────────────────────────────────┐
│ [ FOTO ]  BATATA FRITA   │            │ ✓  MAIONESE DE ALHO   + R$ 2,00│
│   96×96   porção 150g    │            └────────────────────────────────┘
│                +R$ 12,00 │            ┌────────────────────────────────┐
│                      (✓) │            │    MAIONESE VERDE     + R$ 2,00│
└──────────────────────────┘            └────────────────────────────────┘
```

### 7.2 Estados

| Estado | Visual |
|---|---|
| Disponível, não escolhido | Card branco, borda `--tq-borda` |
| Escolhido (SINGLE/MULTIPLE) | Borda amarela 3px + selo de check amarelo no canto; **não** pinta o card inteiro (a foto tem de continuar legível) |
| SUMMABLE com quantidade | Stepper 56×56 no rodapé do card + contador "2 de 4" no cabeçalho do grupo |
| Limite atingido | Cards não escolhidos ficam a 45% com "limite atingido" no cabeçalho do grupo — nunca somem |
| `MISSING` | Foto em `grayscale(1)` a 40%, selo "EM FALTA" em cinza escuro, **texto em contraste cheio**, sem toque |
| Grupo `MISSING` inteiro | Bloco visível e apagado com "Em falta — não dá para escolher agora" (comportamento atual preservado) |

Preço: `+ R$ 12,00` alinhado à direita, `tabular-nums`; opção de preço 0 continua **sem** rótulo de preço (regra atual `op.preco > 0`).

---

## 8. Progressão automática entre grupos

### 8.1 Regra (módulo puro `components/totemFoco.js`)

```
atingiuMax(grupo, selecaoAntes, selecaoDepois) → boolean
  true  ⟺  max é finito  E  soma(antes) < max  E  soma(depois) === max
```

`proximoFoco(gruposRenderizados, grupoId)` → `{ tipo:'GRUPO', id }` | `{ tipo:'CTA' }`

- Percorre `gruposRenderizados` **na ordem do CW** (já vem ordenada por `index`, e `gruposRenderizaveis` já removeu o principal).
- Pula grupos `MISSING` (não aceitam toque).
- Se não sobrar nenhum → `{ tipo:'CTA' }`.

Tabela de aceitação (vira teste 1:1):

| min–max | ação | resultado |
|---|---|---|
| 1–1 | escolheu 1 | avança |
| 2–2 | escolheu 1 | permanece |
| 2–2 | escolheu 2 | avança |
| 0–1 | escolheu 1 | avança |
| 0–4 | escolheu 3 | permanece |
| 0–4 | escolheu 4 | avança |
| 1–∞ (`max: null`) | qualquer | **nunca** avança |
| qualquer | **desmarcou** (max → max−1) | nunca avança |
| qualquer | montagem da tela / edição de linha já completa | nunca avança |
| SINGLE 1–1 | trocou de opção (max→max) | nunca avança (não houve transição `< max` → `== max`) |
| último grupo | atingiu max | vai para o CTA |
| grupo principal (oculto) | — | não participa (não está em `gruposRenderizados`) |

### 8.2 Impacto técnico

- `tocarOpcao` e `menosOpcao` passam a calcular a seleção **antes** e **depois** (já fazem, dentro do updater) e, quando `atingiuMax` for verdadeiro, gravam o alvo num `useRef` + um contador (`focoSeq`) para que dois avanços seguidos disparem dois scrolls.
- Um `useEffect` no componente do detalhe faz `element.scrollIntoView({ behavior, block:'start' })`, com `behavior: 'auto'` quando `matchMedia('(prefers-reduced-motion: reduce)')` casa.
- **Não** rola se o alvo já estiver inteiramente visível (evita "pulo" gratuito).
- Alvo `CTA`: rola o container até o fim e aplica um realce de 600 ms no botão (suprimido em reduced-motion).
- O scroll é do **container de conteúdo**, não da janela: o header e o rodapé são fixos.
- Nenhuma interação com idempotência, cotação ou preço. É puro foco visual.

Risco conhecido: um cliente que já rolou manualmente até o fim e então marca um grupo do meio será trazido de volta. Mitigação: só rolar quando o alvo está **fora** da viewport, e nunca rolar para trás (se o alvo estiver acima da posição atual, não move).

---

## 9. Sidebar de categorias e barra do pedido

### 9.1 Sidebar

```
┌──────────────┐
│   [ LOGO ]   │  56px
├──────────────┤
│ ▌TRADICIONAIS│  ← ativo: fundo --tq-preto-2, barra amarela 6px, texto branco
│  ARTESANAIS  │
│  DOGS        │  cada item: 88px de altura, padding 16px,
│  PORÇÕES     │  nome em 2 linhas no máximo, sem hover obrigatório
│  BEBIDAS     │
│  SOBREMESAS  │
│      ⌄       │  ← indício de "há mais" quando a lista transborda
└──────────────┘
```

- Largura `clamp(190px, 21vw, 260px)`; fundo `--tq-preto`; posição `sticky`/`fixed` na coluna, com `overflow-y:auto` **próprio** e `overscroll-behavior: contain` (a rolagem da sidebar não arrasta o grid).
- Ativo indicado por **três** sinais simultâneos (fundo, barra amarela, peso) — nunca só cor. `aria-current="true"`.
- Sem dependência de `hover`; estado `:active` com `transform: scale(.99)`.
- Transbordo: gradiente de 24px no topo/rodapé quando há conteúdo cortado.
- Ao trocar de categoria, o grid volta ao topo (`scrollTop = 0`).
- **Sem ícone e sem miniatura (decisão 4 do §16).** A V1 mostra **apenas o nome da categoria**, em caixa alta. O CW não fornece ícone nem imagem de categoria, e nenhuma configuração de merchandising é criada nesta frente.
- **Toda categoria que vier do CW aparece.** A sidebar é um espelho do `catalogo.categorias` do bootstrap, na ordem do `index`. Se a loja tiver uma categoria chamada **🥇 OS MAIS PEDIDOS**, ela é uma categoria real como qualquer outra e é renderizada normalmente, com o emoji que faz parte do nome cadastrado — emoji em nome de dado não é o mesmo que emoji usado como ícone da interface, que continua proibido (§5.4). O que a V1 **não** faz é inventar uma categoria sintética a partir de histórico de vendas: isso não existe no contrato e exigiria dado novo vindo do HUB.

### 9.2 Barra do pedido

```
┌──────────────────────────────────────────────────────┐
│  [carrinho] 2 itens                       R$ 38,00   │
│  [               VER MEU PEDIDO                   ]  │
└──────────────────────────────────────────────────────┘
```

- Altura fixa **132px** (96px quando a altura da tela < 760px), fundo `--tq-preto`, CTA amarelo de 72px.
- **Sempre presente** no catálogo (espaço reservado, sem salto de layout). Vazia: fundo preto, texto "Toque num produto para começar", sem CTA.
- `padding-bottom: env(safe-area-inset-bottom)`.
- O grid recebe `padding-bottom` igual à altura da barra — a última fileira nunca fica sob ela.
- Feedback ao adicionar: o contador incrementa com um pulso de 250 ms + toast "Adicionado ao pedido" por 2 s (ambos suprimidos em reduced-motion).

---

## 10. Estratégia CSS e componentização

### 10.1 CSS

1. **Arquivo próprio:** `frontend/src/styles/totem.css`, importado **apenas** por `pages/DispositivoPareamento.jsx` (o Vite resolve e injeta; nada de `@import` em cascata).
2. **Prefixo novo `.tq-`** (totem quiosque). O `.ttm-` **permanece** e passa a pertencer só ao admin (§1.2). Isso torna impossível pintar o admin sem querer e permite que as duas cascas coexistam durante a migração.
3. **Tokens escopados** em `.tq-raiz` com valores **literais** — o `body.theme-dark` do admin não alcança o quiosque (regra atual, preservada e agora garantida pelo escopo).
4. Espaçamento por `gap` de flex/grid; nada de margens irmãs colapsando.
5. Conteúdo largo (nome de opção longo) nunca causa rolagem horizontal: `min-width: 0` nos filhos flex e `overflow-wrap: anywhere` nos nomes.
6. `user-select: none` na raiz, sem exceção — com a saída do campo de observação (§4.3), o quiosque não tem mais nenhum campo de digitação livre.
7. Remoção do bloco antigo `global.css:3352–3718` (quiosque + pareamento + as duas media queries que só servem a eles) só na **última** task, depois de a tela nova estar completa. O bloco do admin (3313–3350) **fica**.

### 10.2 Componentização

`TotemQuiosque.jsx` continua sendo o **orquestrador** (estado, efeitos, HTTP, idempotência). O JSX sai para:

```
components/totem/
  Casca.jsx            (raiz .tq-raiz + toast + sheet de inatividade)
  Cabecalho.jsx
  TelaInicio.jsx
  TelaCatalogo.jsx     ├── SidebarCategorias.jsx
                       ├── GradeProdutos.jsx → CardProduto.jsx
                       └── BarraPedido.jsx
  TelaItem.jsx         ├── ChipsPendentes.jsx
                       ├── BlocoGrupo.jsx → CardOpcao.jsx
                       └── RodapeItem.jsx
  TelaCarrinho.jsx     └── LinhaCarrinho.jsx
  TelaPagamento.jsx
  TelaRevisar.jsx
  TelaResultado.jsx
  TelaAviso.jsx
  Stepper.jsx  Foto.jsx  Spinner.jsx  Preco.jsx  icones.jsx
```

**Contrato de disciplina:** nenhum componente dessa pasta tem `useState` de fluxo, faz chamada HTTP ou conhece `chaveRef`/`travadoRef`. Estado local permitido apenas para efeito puramente visual e descartável (ex.: `Foto` guardando "a imagem quebrou"; `LinhaCarrinho` guardando "confirmação de remover pendente"). Toda decisão passa por props e callbacks vindos do pai.

### 10.3 Reaproveitamento

| Reaproveitado | Como |
|---|---|
| `components/totemCarrinho.js` | **Inteiro, sem uma linha alterada** |
| Padrão de `components/sidebarIcons.jsx` | Copiar a técnica (SVG inline, `currentColor`, `strokeWidth`), não o arquivo |
| Guardas e efeitos de `TotemQuiosque.jsx` | Ficam onde estão |
| `services/api.js` (`aparelhoApi`) | Sem alteração |
| Regra `prefers-reduced-motion` e `:focus-visible` | Portadas para `totem.css` |
| `DispositivoPareamento.jsx` (teclado de código) | Só re-skin com os tokens novos; a lógica de dígito/auto-envio não muda |

| Novo | Por quê |
|---|---|
| `components/totemFoco.js` (+ teste) | Progressão automática (§8) |
| `components/totemLayout.js` (+ teste) | `modoDeOpcoes`, `obrigatoriosPendentes`, `resumoDoPedido` |
| `components/totem/*.jsx` | Telas e blocos |
| `styles/totem.css` | Casca |
| `components/totem/icones.jsx` | Substituir emoji |

---

## 11. Regras específicas de toque

O cliente está **em pé, com uma mão, sem familiaridade**. Regras que valem para toda a casca:

| Tema | Regra |
|---|---|
| Alvo mínimo | 56×56 para qualquer controle; 72px de altura para CTA de tela; 88px para item de sidebar |
| Folga | ≥ 12px entre alvos vizinhos; **≥ 32px** entre um alvo comum e um destrutivo |
| Destrutivo | Só "Remover" no carrinho e "Cancelar pedido" no header. Ambos exigem 2 toques (confirmação inline de 4 s), nunca modal de sistema |
| Feedback | Todo alvo tem `:active` com `transform: scale(.98)` e mudança de fundo, em ≤ 100 ms |
| Duplo toque | `touch-action: manipulation` na raiz (já existe) + botões que disparam rede ficam `disabled` durante a chamada. `revisar()` e `confirmar()` já têm guarda própria — preservada |
| Loading | Botão que espera rede troca o rótulo por spinner + texto ("Enviando seu pedido…") e **não** some da tela |
| Bloqueio durante envio | Overlay `position:fixed; inset:0` cobrindo tudo (comportamento atual, mantido): um segundo toque em qualquer lugar durante o POST é a origem de pedido duplicado |
| Hover | Nunca é o único caminho: todo estado tem forma em `:active`/selecionado |
| Rolagem | Uma região rolável por vez em cada eixo: sidebar (y) e grid (y). Nada rola em x. `overscroll-behavior: contain` nas duas |
| Modal vs. página | Fluxo principal é **página** (o cliente não perde contexto). Sheet só para "Ainda está aí?" e confirmação de cancelar |
| Escape | Toda tela que não seja Início e Resultado tem "‹ Voltar", exceto Revisar travada (regra de idempotência) |
| Texto | Corpo ≥ 17px; nada abaixo de 4,5:1; nenhum cinza sobre cinza |
| Seleção de texto | Desabilitada em toda a tela; não há campo de digitação livre no quiosque |

---

## 12. Riscos de regressão funcional

Ordenados por gravidade. Cada um vira item de verificação obrigatória.

| # | Risco | Por que acontece | Como evitar |
|---|---|---|---|
| R1 | **Pedido duplicado** | Se `TotemQuiosque` for remontado (troca de chave React, novo Router, componente pai novo), `chaveRef` zera e um retry vira segundo pedido | O orquestrador **não** muda de lugar nem de identidade; as telas viram filhos. Nenhum `key` dinâmico no pai |
| R2 | **Voltar em estado travado** | Um header genérico que sempre desenha "‹ Voltar" | `Cabecalho` recebe `aoVoltar` podendo ser `undefined`; teste manual do drill de ambiguidade |
| R3 | **Reset durante envio** | Sheet de inatividade novo disparando com `enviando`/`travado` | Mesma guarda do timer atual, replicada e testada |
| R4 | **Duas linhas do mesmo item** | Novos componentes com `key={item.id}` em vez de `key={uid}` | `LinhaCarrinho` chaveada por `uid`; `CardProduto` por `${categoria.id}-${produto.id}` (como hoje) |
| R5 | **Grupo principal reaparecer** | Renderizar `item.grupos` em vez de `gruposRenderizaveis(linha)` | O componente do detalhe recebe **a lista já filtrada** por prop, nunca o item cru |
| R6 | **Preço abaixo do pagável** | Trocar `precoDoCabecalho` por `subtotalLocal` no cabeçalho/botão redesenhados | Ambos recebem o mesmo objeto `cabecalho`; teste com o COMBO (piso 27,90 vs. subtotal 12,00) |
| R7 | **"a partir de" sumir** | Card novo esquecer `precoEhAPartirDe` | `Preco` é um componente único usado por card, detalhe e botão |
| R8 | **Destaque de preço errado** | Voltar a marcar por `itemId` em vez de `alteradasIdx` | Revisão continua usando o índice; teste com duas linhas do mesmo item base |
| R9 | **Fallback do bootstrap antigo** | Grid novo assumir `produtos` sempre presente | Manter o `Array.isArray(categoria.produtos) ? … : itens` |
| R10 | **Progressão automática atrapalhar** | Scroll disparando no carregamento ou ao desmarcar | Regra pura + testes da tabela §8.1 |
| R11 | **CSS vazar para o admin** | Reescrever `.ttm-*` | Prefixo `.tq-` + arquivo separado (§10.1) |
| R12 | **Polling do número parar** | Reescrever a tela de resultado mexendo em `desistiuDoNumero` | A tela de resultado é apresentação pura; os três efeitos ficam no pai |

---

## 13. Testes

### 13.1 Automatizados (puros, `node --test`, o padrão do repo)

- `components/totemFoco.test.js` — **novo**: a tabela §8.1 inteira, caso a caso, incluindo `max: null`, desmarcar, montagem, MISSING pulado e último grupo → CTA.
- `components/totemLayout.test.js` — **novo**: `modoDeOpcoes` (nenhuma foto → LISTA; uma foto → GRADE; string vazia não conta como foto); `obrigatoriosPendentes` (combo recém-aberto devolve os dois grupos, na ordem do CW); `resumoDoPedido` (contagem e soma com duas linhas do mesmo item).
- `components/totemCarrinho.test.js` — **os 75 existentes têm de continuar passando sem edição**. Se um deles precisar mudar, o redesign saiu do escopo.

### 13.2 Build

`cd frontend && npm run build` ao fim de cada task.

### 13.3 Verificação manual no aparelho (checklist do checkpoint)

1. Retrato: 2 colunas, sem rolagem horizontal, última fileira não coberta pela barra.
2. Sidebar rola sozinha; grid volta ao topo ao trocar de categoria; categoria ativa óbvia a 2 m de distância.
3. **TRADICIONAIS 🍔** (categoria normal): 9 produtos com o preço de cada um — X BURGUER R$ 12,00, X SALADA e X DELICIA R$ 14,00, X BACON e X CALA BURGUER R$ 16,00, CHEDDAR BACON R$ 17,00, HAMBURGÃO e X DUPLO R$ 18,00, ESPECIAL R$ 22,00 — **sem** o rótulo "a partir de".
4. **COMBO - TRADICIONAIS** (Vitrine por BURGUER DO COMBO 964783): 9 produtos com mínimos diferentes, começando em X BURGUER **"a partir de R$ 27,90"** e terminando em ESPECIAL R$ 37,90; ao abrir, o grupo principal fica oculto e BEBIDA e ACOMPANHAMENTO aparecem obrigatórios.
5. Cabeçalho e botão do combo mostram **27,90**, nunca 12,00, enquanto faltar obrigatório.
6. Escolher a bebida rola sozinho para o acompanhamento; escolher o acompanhamento rola para o CTA; **desmarcar não rola**.
7. Complementos com foto aparecem em grade; grupo sem foto nenhuma aparece como lista.
8. Nenhuma tela tem campo de digitação livre; toque longo não seleciona texto nem abre menu do sistema.
9. Duas linhas do mesmo item base: editar uma não encosta na outra.
10. Adicionar um item devolve ao catálogo, com o contador da barra atualizado — não abre o carrinho.
11. Carrinho → pagamento → revisão: total confere; "trocar pagamento" recota.
12. Drill de ambiguidade (falha simulada PDV→HUB, **sem POST real**): tela trava, sem Voltar, um botão só.
13. Inatividade: sheet aos 75 s; **não** aparece durante envio nem no estado travado.
14. Tela de sucesso: número protagonista; botão "Novo pedido" pequeno.
15. Admin (`Totem › Pedidos` e `› Apresentação`) inalterado depois da remoção do CSS antigo.
16. **Resolução real do aparelho** (decisão 1 do §16): ler `heartbeatJson.tela` do dispositivo do totem no banco (`SELECT "heartbeatJson"->'tela' FROM "Dispositivo" WHERE tipo='TOTEM'`) e conferir contra a referência de 1080 × 1920. Se divergir, ajustar as faixas do §2.3 antes de dar o checkpoint por aprovado — nenhuma medida do desenho é fixa em pixels de tela, então o ajuste é de faixa, não de layout.

---

## 14. Divisão sugerida em tasks

Commit por task, `git add` explícito por caminho, sem deploy durante a sequência.

| Task | Entrega | Verificação |
|---|---|---|
| **V1** | `styles/totem.css` com tokens, reset e casca `.tq-raiz`; Archivo 800/900 em `assets/fontes/` com `@font-face` e `font-display: swap`; `components/totem/icones.jsx`; importado por `DispositivoPareamento`. Nenhuma tela migrada ainda | build; a tela antiga continua idêntica; a fonte carrega sem rede externa |
| **V2** | Casca + `Cabecalho` compacto + `TelaInicio` | build; pareamento e Início na cara nova |
| **V3** | `TelaCatalogo`: `SidebarCategorias` + `GradeProdutos` + `CardProduto` (foto grande, "a partir de", Em falta / Indisponível) | build; 9 cards do combo com 27,90 |
| **V4** | `BarraPedido` fixa + feedback ao adicionar + retorno ao catálogo após "Adicionar" (decisão 3) | build; contador e total corretos com duas linhas do mesmo item |
| **V5** | `TelaItem`: hero, chips de pendência, `BlocoGrupo` (obrigatório × opcional), `RodapeItem` com `precoDoCabecalho`. **Sem campo de observação** (§4.3) | build; R6/R7 do §12 conferidos |
| **V6** | `CardOpcao` + `totemLayout.js` (`modoDeOpcoes`) com foto, descrição, adicional, estados MISSING/limite | `node --test` + build |
| **V7** | `totemFoco.js` + progressão automática com smooth scroll e reduced-motion | `node --test` (tabela §8.1) + build |
| **V8** | `TelaCarrinho` (miniatura, remover afastado com confirmação inline, vazio resolvido) | build |
| **V9** | `TelaPagamento` + `TelaRevisar` (faixa preta de fechamento, aviso de preços, overlay de envio, estado travado) | build; drill de ambiguidade |
| **V10** | `TelaResultado` (número protagonista, correção do `flex-grow`), `TelaAviso` (fechada / pausada / sem catálogo / erro), sheet "Ainda está aí?" | build |
| **V11** | Limpeza: remover `global.css:3352–3718` (o bloco do admin, 3313–3350, fica), conferir o admin, varredura de contraste e de alvos, checklist §13.3 | build + inspeção do admin |

Ordem escolhida para que **cada task deixe a tela funcionando**: nada de "meio redesenhado, meio quebrado" entre commits.

---

## 15. Fora de escopo desta frente

- Admin `Loja Digital › Totem › Apresentação` (recebeu a limpeza da rev. 3).
- Qualquer mudança de contrato, rota ou banco.
- Categoria sintética de "mais pedidos" calculada a partir de vendas (exigiria dado novo vindo do HUB). Categoria real vinda do CW com esse nome aparece normalmente — ver §9.1.
- Ícone, miniatura ou qualquer configuração de merchandising por categoria.
- Horário de funcionamento na tela de loja fechada (exigiria campo aditivo no HUB — §6.H).
- Multi-idioma, acessibilidade por leitor de tela além do que já existe (`aria-pressed`, `aria-live`, foco visível), impressão de comprovante no próprio totem.
- Fase B (reconciliação automática, `/confirm`).

---

## 16. Decisões fechadas (rev. 2)

As cinco decisões de produto foram tomadas pelo Junior em 2026-09-12. Nenhuma fica em aberto para a implementação.

| # | Decisão | Onde vive na spec |
|---|---|---|
| 1 | **Referência oficial da V1: 1080 × 1920 em retrato, layout fluido.** A tela `Aparelhos` **não** ganha exibição de resolução agora; a resolução real é conferida pelo `heartbeatJson.tela` no checkpoint físico | §2.3 e item 16 do checklist §13.3 |
| 2 | **Preto, branco e amarelo `#f9d900` exclusivamente no quiosque.** O admin mantém a identidade atual (`--brand-gold: #f97316`), sem uma linha alterada | §5.2, tokens escopados em `.tq-raiz`; §10.1, arquivo e prefixo separados |
| 3 | **Adicionar um item devolve ao catálogo**, com confirmação e pulso na barra; o pedido continua acessível o tempo todo pela barra fixa | §6.B, §9.2, task V4 |
| 4 | **Sidebar da V1 só com o nome das categorias** — sem ícone, sem miniatura automática, sem tela de configuração de merchandising | §9.1 |
| 5 | **Archivo auto-hospedada nos pesos 800 e 900** para nomes, preços, títulos e número do pedido; corpo na pilha do sistema | §5.3, task V1 |

Correções documentais aplicadas junto (pedidas na mesma revisão):

- **Campo de observação removido** de wireframes, CSS e regras de seleção de texto — com o registro, em §4.3, de que se trata da retirada de um campo que existe hoje e é aceito pelo contrato, e de como reverter se a intenção for outra.
- **Checklist corrigido:** TRADICIONAIS normal tem nove produtos com preço próprio; COMBO - TRADICIONAIS em Vitrine tem nove produtos com mínimos, começando em R$ 27,90 (§13.3, itens 3 e 4).
- **"Os mais pedidos" reescrito:** nenhuma categoria sintética por vendas nesta frente, e qualquer categoria real do CW com esse nome aparece normalmente na sidebar (§9.1, §15).
- **Foto ambiente removida** da tela inicial: fundo preto, logo e ações amarelas, porque o bootstrap não tem campo de imagem de fundo (§6.A).

---

## 17. Resumo em uma frase

A máquina do Totem está certa e não será tocada; o que muda é a casca — de uma página web de coluna única em creme e laranja para um quiosque em preto, branco e amarelo, com categorias fixas à esquerda, duas colunas de fotografia grande, complementos com imagem, avanço automático entre grupos e o número do pedido como protagonista no fim.
