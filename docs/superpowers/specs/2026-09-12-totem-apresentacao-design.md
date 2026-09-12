# Totem — Camada de Apresentação (modo EXPANDIDO) — Design

**Data:** 2026-09-12 (rev. 3: regra de Vitrine corrigida — outros grupos obrigatórios são legítimos; preço mínimo "a partir de" calculado no HUB) · **Status:** rev. 2 implementada e deployada (A1–A5); rev. 3 aprovada conceitualmente, aguardando implementação (B1–B3) · **Repos:** `nachapa-pdv` e `Traffic Hub`. Sem redesign visual.

## 1. Problema e decisão

O Cardápio Web (CW) modela "TRADICIONAIS 🍔" como um **item base a R$ 0,00** com um grupo obrigatório de escolha única cujas opções são os produtos reais. No Totem cada opção principal vira um card; o pedido continua `item_id` + `option_id`.

Rev. 2 tratava qualquer outro grupo obrigatório como impeditivo (`OUTRO_GRUPO_OBRIGATORIO`). **Isso estava errado**: num combo, BURGUER DO COMBO define a identidade e BEBIDA/ACOMPANHAMENTO são etapas obrigatórias legítimas da jornada. A rev. 3 permite outros obrigatórios, mantém todos visíveis no detalhe (só o principal fica pré-selecionado e oculto), e o card passa a mostrar o **preço mínimo completo** ("a partir de") quando a jornada obrigatória restante pode mudar o valor.

**Configuração explícita**, por loja e item, sem ativação automática; heurística só sugere. **Fonte de verdade continua no CW**; o produto apresentado é projeção dinâmica.

## 2. Modelo de dados (PDV) — inalterado desde a rev. 2

`TotemApresentacao { id, empresaId, cwItemId, modo, cwGrupoPrincipalId, criadoEm, atualizadoEm }`, única por `(empresaId, cwItemId)`, só EXPANDIDO persistido (NORMAL apaga), sem `ativo`. Migration `20260912120000_totem_apresentacao` já aplicada em produção. **Rev. 3 não altera banco.**

## 3. HUB — campos aditivos por grupo (rev. 3) e por opção (rev. 2)

`backend/cardapioPedidoTotem.js`:
- Rev. 2 (feito): opções do bootstrap com `imagem` e `descricao`.
- Rev. 3: novo helper puro **`resumoPrecoDoGrupo(grupo) → { custoMinimo: number|null, custoMaximo: number|null, precoVariavel: boolean }`**, com **exatamente as regras que `validarGrupo` aceita**: só `price_calculation_type === 'SUM'` (não-SUM → o item nem entra no totem); só opções `ACTIVE` contam (MISSING/INACTIVE não podem ser escolhidas); preço da opção é o do vínculo naquele grupo; `SINGLE` = 1 opção qtd 1; `MULTIPLE` = opções distintas qtd 1; `SUMMABLE` = qtd por opção ≤ `max_quantity` (nulo = sem teto); `Σqtd` entre `minimum_quantity` e `maximum_quantity` (nulo = sem teto).
  - `custoMinimo` = menor custo de uma seleção válida que satisfaça `minimum_quantity` (`0` quando `min = 0`; `null` quando não existe seleção válida — sem opções ACTIVE suficientes).
  - `custoMaximo` = maior custo de uma seleção válida (com `maximum_quantity` nulo em SUMMABLE e alguma opção com preço > 0 → `Infinity`, serializado como `null` com `precoVariavel:true`).
  - `precoVariavel` = existe seleção válida com custo ≠ `custoMinimo` (ex.: obrigatório com opções R$ 0 e R$ 6 → `custoMinimo 0`, `precoVariavel true`).
- `catalogoParaTotem` emite, por grupo, `custoMinimo` e `precoVariavel` (aditivo). O PDV **não** recalcula nada de pricing: só soma números que o HUB entregou.
- **Teste de equivalência (binding):** para cada tipo (SINGLE; SUMMABLE 1–1; SUMMABLE 2–2; `minimum_quantity` > 1 em MULTIPLE e SUMMABLE; `max_quantity` por opção; MISSING excluída; grupo todo MISSING → `null`; opcional min 0), `validarECotar` com a seleção mais barata devolve linha cujo `Σ opções` == `custoMinimo`, e com a mais cara == `custoMaximo`. Golden real: COMBO - TRADICIONAIS com X BURGUER + COCA COLA LATA + BATATA FRITA cota 27,90 = `precoMinimo` do produto X BURGUER.

Nada muda em cotar, pedido, caches ou contratos existentes.

## 4. PDV backend — projeção e validação (rev. 3)

### 4.1 Módulo puro `backend/totemApresentacao.js`
- `grupoElegivel(grupo) → { ok:true } | { ok:false, codigo }`, nesta ordem: `GRUPO_INDISPONIVEL` (status não ACTIVE); `GRUPO_NAO_E_ESCOLHA_UNICA` (`!(min === 1 && max === 1)`, independe de `choiceType`); `GRUPO_SEM_OPCOES` (zero opções apresentáveis); **`GRUPO_COM_UMA_OPCAO`** (só uma opção apresentável — não cria vitrine; é o caso "PEGUE SUA BATATA" da QUINTA). **Apresentável** = opção `ACTIVE` ou `MISSING` (MISSING vira card "Em falta"); INACTIVE não conta. Não se exige duas ACTIVE.
- `validarConfiguracao(config, item)`: `MODO_INVALIDO` → `ITEM_AUSENTE` → `GRUPO_AUSENTE` → códigos de `grupoElegivel`. **`OUTRO_GRUPO_OBRIGATORIO` deixa de existir.**
- `ordenavelDoItem(item)` (espelho do frontend) continua: item MISSING → `ITEM_EM_FALTA`; grupo obrigatório MISSING → `GRUPO_EM_FALTA`. Rev. 3 acrescenta: grupo obrigatório restante com `custoMinimo === null` (sem seleção válida) → `GRUPO_EM_FALTA`. Isso **não** derruba a configuração; o produto sai `ordenavel:false`.
- `projetarProduto(item, grupo, opcao)`:
  - `preco` = `item.preco + opcao.preco` (identidade); `precoPromocional` = `item.precoPromocional + opcao.preco` só quando a base tem promoção em vigor.
  - `restantes` = grupos do item exceto o principal; `obrigatoriosRestantes` = restantes com `min ≥ 1` e status visível.
  - `precoMinimo` = `preco + Σ custoMinimo(obrigatoriosRestantes)`; `precoMinimoPromocional` idem sobre `precoPromocional`; se algum `custoMinimo` for `null` → `precoMinimo: null` e `ordenavel:false / GRUPO_EM_FALTA`.
  - `precoEhAPartirDe` = algum obrigatório restante com `precoVariavel === true`. (Grupos opcionais não entram: são extras, como hoje.)
- `sugerirCandidatos`: **inalterada e conservadora** — preço base 0 + exatamente um grupo obrigatório + esse grupo elegível (agora incluindo ≥ 2 opções). Combos e QUINTA não são sugeridos; combos podem ser configurados manualmente.
- `mesclarAdmin`: mantém `elegivel` e `selecionavel` por grupo (na rev. 3 coincidem; o contrato fica para evoluções), e adiciona por item `candidato: boolean` (existe grupo elegível) e `obrigatoriosAlem: n` (outros obrigatórios além do candidato, para a nota "a partir de" no admin).

### 4.2 Bootstrap público e 4.3 Admin — inalterados (contratos aditivos apenas)

## 5. Contrato para o frontend (rev. 3)

`catalogo.categorias[].produtos[]`:
```
{ id, tipo: 'ITEM' | 'OPCAO_PRINCIPAL', nome, descricao, imagem,
  preco, precoPromocional?,                       // identidade: base + opção principal
  precoMinimo, precoMinimoPromocional?,           // base + principal + mínimos dos obrigatórios restantes (null = sem seleção válida)
  precoEhAPartirDe: boolean,                      // true quando algum obrigatório restante pode mudar o valor
  status: 'ACTIVE' | 'MISSING', ordenavel, motivo?,
  origem: { itemId, grupoId?, opcaoId? }, grupoPrincipalId? }
```
Produtos `ITEM` (modo normal): `precoMinimo = preco + Σ custoMinimo(obrigatórios)`, `precoEhAPartirDe` = algum obrigatório variável — assim o card de um combo em modo normal também deixa de mostrar R$ 0,00. `itens` continua no bootstrap, agora com `grupos[].custoMinimo/precoVariavel` vindos do HUB.

## 6. Comportamento no Totem (rev. 3)

- **Card:** mostra `precoMinimo` (ou `precoMinimoPromocional` com "de/por" quando houver promo); prefixo **"a partir de"** quando `precoEhAPartirDe`. MISSING → "Em falta"; `!ordenavel` → "Indisponível no momento".
- **Detalhe:** título/foto/descrição do produto apresentado; grupo principal oculto e pré-selecionado; **todos os demais grupos visíveis na ordem do CW, obrigatórios marcados como hoje**; `itemPronto` exige todos. **Cabeçalho (preço):** enquanto faltar obrigatório, mostra `max(subtotal local, precoMinimo do card × qtd)` com o rótulo "a partir de" (o rótulo depende só de faltar obrigatório — nunca de `precoEhAPartirDe`); com tudo escolhido, mostra o subtotal local sem rótulo. Assim o detalhe nunca anuncia um valor abaixo do menor preço pagável nem diverge do card. Linha sem `precoMinimo` (bootstrap antigo) mantém o subtotal local. Trocar o principal = voltar ao grid.
- **Carrinho/Revisar/Confirmar/cotar/pedido:** sem mudança (rev. 2).

## 7. Fallback e avisos

Configuração revalidada a cada bootstrap. Inválida → NORMAL na vitrine + aviso. Casos: item ausente do balcão, grupo ausente, grupo inelegível (não 1–1, sem opções, uma opção só, oculto). **Outro obrigatório em falta ou sem seleção válida não invalida**: produto `ordenavel:false`.

## 8. Tela admin — UX (rev. 3)

- **Estado neutro** para item que não é candidato: texto cinza "Sem grupo de escolha única com duas ou mais opções" — sem código, sem vermelho. Item candidato sem configuração: "Pode virar vitrine" com o select disponível. Item com `obrigatoriosAlem > 0`: nota informativa "Tem outras escolhas obrigatórias: o card mostra 'a partir de'".
- **Vermelho só quando existe configuração salva e ela deixou de valer**, com frase humana e o código discreto ao lado: `ITEM_AUSENTE` "este item não está mais no cardápio do balcão"; `GRUPO_AUSENTE` "o grupo escolhido não existe mais neste item"; `GRUPO_NAO_E_ESCOLHA_UNICA` "o grupo passou a aceitar mais de uma escolha"; `GRUPO_SEM_OPCOES` "o grupo ficou sem opções"; `GRUPO_COM_UMA_OPCAO` "o grupo tem uma opção só"; `GRUPO_INDISPONIVEL` "o grupo está oculto no cardápio". (Textos são os do `MENSAGENS_ADMIN` do backend, espelhados no frontend.)
- Select de grupo: opções não elegíveis desabilitadas com a frase humana (código só em `title`). Órfãs e Sugestões como na rev. 2. Sidebar já é Loja Digital › Totem › {Pedidos, Apresentação}.

## 9. Testes (delta rev. 3)

- **HUB:** `resumoPrecoDoGrupo` para SINGLE, MULTIPLE min>1, SUMMABLE 1–1, SUMMABLE 2–2, `max_quantity`, MISSING excluída, todo MISSING → null, opcional → 0, `precoVariavel` com R$ 0 e R$ 6; **equivalência** com `validarECotar` (seleção mais barata == `custoMinimo`, mais cara == `custoMaximo`); golden COMBO - TRADICIONAIS 27,90; bootstrap emite os dois campos por grupo.
- **PDV `totemApresentacao.test.js`:** `GRUPO_COM_UMA_OPCAO` (QUINTA › PEGUE SUA BATATA); MISSING conta como apresentável (grupo com 1 ACTIVE + 1 MISSING é elegível); COMBO - TRADICIONAIS EXPANDIDO por BURGUER DO COMBO → 9 produtos com `precoMinimo` 27,90/29,90/…/37,90 e `precoEhAPartirDe:true`; COMBO - ARTESANAIS 11 produtos (CHICKEN CRISPY MISSING); obrigatório restante todo MISSING → `precoMinimo:null`, `ordenavel:false`; obrigatório com R$ 0 e R$ 6 → `custoMinimo 0` e `precoEhAPartirDe:true`; promoção na base → `precoMinimoPromocional`; produto `ITEM` de combo em modo normal com `precoMinimo` > 0; `sugerirCandidatos` continua não sugerindo combos nem QUINTA; nenhum teste espera `OUTRO_GRUPO_OBRIGATORIO`; `mesclarAdmin` com `candidato`/`obrigatoriosAlem`.
- **Frontend:** card "a partir de"; `linhaDeProduto` de um combo mantém bebida/acompanhamento em `gruposRenderizaveis` e `itemPronto` só fica ok depois de escolhê-los; `subtotalLocal` do X BURGUER + Coca + Batata = 27,90; admin: item normal sem código vermelho (teste do helper puro de mensagens `mensagemApresentacao(codigo)`).
- **Smoke:** COMBO - TRADICIONAIS = Vitrine por BURGUER DO COMBO → 9 cards "a partir de R$ 27,90" → abrir X BURGUER → bebida e acompanhamento visíveis e obrigatórios → cotar 27,90 com Coca e Batata → parar sem confirmar. TRADICIONAIS segue com 9 cards sem "a partir de" (só opcionais restantes).

## 10. Deploy

Sem migration. HUB antes do PDV (o PDV lê `custoMinimo`/`precoVariavel`; sem eles, o produto sai com `precoMinimo = preco` e `precoEhAPartirDe:false`, comportamento da rev. 2). Nada muda para lojas sem configuração além do card de item normal com obrigatórios passar a mostrar "a partir de".
