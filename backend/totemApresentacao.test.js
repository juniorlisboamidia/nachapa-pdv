// Apresentação do totem — projeção pura (spec §9, bloco "PDV totemApresentacao.test.js").
//
// Tudo aqui roda em memória: nenhuma linha toca banco, rede ou Express. As fixtures são o
// CARDÁPIO REAL da loja (snapshot do CW de 2026-09-11), recortado nos itens que a spec cita
// e transcrito no formato CRU do CW (`categories[].items[].option_groups[].options[]`). O
// `bootstrapDoCw` abaixo faz o mesmo mapeamento que o HUB (`catalogoParaTotem`) — é por ele
// que os testes passam antes de chegar ao módulo, para que um golden aqui signifique "o que
// o totem realmente recebe", e não "o que eu imaginei que ele recebe".
//
// Por que dados reais e não inventados: as três armadilhas deste módulo só existem no
// cardápio de verdade — "X BURGUER" com um id diferente em cada grupo, "TRADICIONAIS 🍔"
// como nome de DOIS itens distintos, e um grupo SUMMABLE 1–1 que é escolha única de fato.
// Fixture bonitinha esconderia as três.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODOS, grupoElegivel, validarConfiguracao, ordenavelDoItem,
  projetarProduto, produtoDeItem, projetarCatalogo, sugerirCandidatos, mesclarAdmin,
} from './totemApresentacao.js';
// Espelho vivo: `ordenavelDoItem` TEM de responder igual ao `itemOrdenavel` da tela, senão
// o card diz "Indisponível" e o detalhe deixa pedir (ou o contrário).
import { itemOrdenavel } from '../frontend/src/components/totemCarrinho.js';

// ── Fixtures: cardápio real, formato cru do CW ───────────────────────────────
// Só os campos que o `catalogoParaTotem` do HUB lê. As URLs são as reais, escritas como
// arquivo + prefixo fixo do bucket para caber na linha.
const CDN_ITEM = 'https://storage.googleapis.com/prod-cardapio-web/uploads/item/image/';
const CDN_SUB = 'https://storage.googleapis.com/prod-cardapio-web/uploads/subitem/image/';
const url = (base, id, arquivo) => (arquivo == null ? null : arquivo.startsWith('http') ? arquivo : `${base}${id}/${arquivo}`);

const cat = (id, name, index, items) => ({ id, name, index, items });
const it = (id, name, price, status, index, arquivo, description, option_groups) => ({
  id, name, price, status, index, description, option_groups,
  image: arquivo == null ? null : { image_url: url(CDN_ITEM, id, arquivo) },
});
const g = (id, name, choice_type, minimum_quantity, maximum_quantity, status, index, options) => ({
  id, name, choice_type, minimum_quantity, maximum_quantity, status, index, options,
});
// Nos grupos que NÃO são candidatos a principal (maionese, coquinha, docinho…) a imagem e a
// descrição das opções foram omitidas de propósito: a projeção nunca as lê, e transcrevê-las
// dobraria a fixture sem cobrir nada.
const o = (id, name, price, status, index, arquivo = null, description = null) => ({
  id, name, price, status, index, description, max_quantity: null,
  image: arquivo == null ? null : { image_url: url(CDN_SUB, id, arquivo) },
});

const CW_BRUTO = [
  cat(349627, "🍟 QUINTA DA BATATA GRÁTIS", 1, [
    it(3078024, "TRADICIONAIS 🍔", 0, "ACTIVE", 0, null, "Clique aqui para conhecer todos os tradicionais do Hamburgão e fazer sua melhor escolha! 🍔🔥\r\n\r\n*Lanches individuais*", [
      g(820734, "ESCOLHA DOIS E GANHE BATATA FRITA", "SUMMABLE", 2, 2, "ACTIVE", 0, [
        o(3088764, "X BURGUER", 12, "ACTIVE", 0, "465bc914IMG-20240607-WA0039.jpg", "Carne 56G, queijo muçarela, alface e tomate"),
        o(3088765, "X SALADA", 14, "ACTIVE", 1, "f7d1e4c8IMG-20240607-WA0035.jpg", "Carne 56G, ovo, queijo muçarela, alface e tomate"),
        o(3088766, "DELICIA", 14, "ACTIVE", 2, "74539bc7IMG-20240604-WA0031.jpg", "Carne 56G, presunto, queijo muçarela, alface e tomate"),
        o(3088767, "X BACON", 16, "ACTIVE", 3, "e173c7037164d4271f91b39246f9048c6c079ade30f6943e.jpg", "Carne 56G, bacon em cubos, queijo muçarela, alface e tomate"),
        o(3088769, "X CALA BURGUER", 16, "ACTIVE", 4, "74c1c8f4IMG-20240607-WA0030.jpg", "Carne 56G, creme de cheddar, calabresa, alface e tomate"),
        o(3088768, "CHEDDAR BACON", 17, "ACTIVE", 5, null, "Carne 56G, cheddar fatiado, bacon em fatias e cebola roxa"),
        o(3088770, "HAMBURGÃO", 18, "ACTIVE", 6, "fa76a88724e3262386829d93dc182d575a3162bf717e25d5.jpg", "Carne 56G, ovo, bacon em cubos, presunto, queijo muçarela, alface e tomate"),
        o(3088771, "X DUPLO", 18, "ACTIVE", 7, "5e5af905IMG-20240607-WA0028.jpg", "2 Carnes de 56G, queijo muçarela, creme de cheddar, alface e tomate"),
        o(3088772, "ESPECIAL", 22, "ACTIVE", 8, "75d067c5IMG-20240604-WA0029.jpg", "Carne 56G, ovo, bacon em cubos, presunto, calabresa, queijo muçarela, salsicha, alface e tomate"),
      ]),
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 1, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(820735, "PEGUE SUA BATATA 🍟", "SINGLE", 1, 1, "ACTIVE", 2, [
        o(3085952, "BATATA FRITA GRÁTIS", 0, "ACTIVE", 1, "36aa289d8e8d686e4cb0c799eb669f6aaba938092a703e8e.jpg", ""),
      ]),
      g(745979, "E A COQUINHA?", "MULTIPLE", 0, 1, "ACTIVE", 4, [
        o(3002656, "COCA LATA", 6, "ACTIVE", 1),
        o(3002657, "COCA ZERO LATA", 6, "ACTIVE", 2),
      ]),
      g(745980, "UM DOCINHO VAI?", "MULTIPLE", 0, 1, "ACTIVE", 6, [
        o(2796669, "PUDIM", 8, "MISSING", 1),
        o(2796670, "BROWNIE DE BRIGADEIRO", 7, "ACTIVE", 2),
        o(2796671, "BROWNIE DE NINHO", 7, "ACTIVE", 3),
      ]),
    ]),
  ]),
  cat(413357, "🥇 OS MAIS PEDIDOS", 2, [
    it(3722649, "DOM CATUPIRY", 29, "ACTIVE", 10, "b2a47d79_meta__2k_202601180308(2).jpeg", "Carne artesanal 120G, catupiry empanado, cebola caramelizada e bacon em cubos", [
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 1, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(745979, "E A COQUINHA?", "MULTIPLE", 0, 1, "ACTIVE", 2, [
        o(3002656, "COCA LATA", 6, "ACTIVE", 1),
        o(3002657, "COCA ZERO LATA", 6, "ACTIVE", 2),
      ]),
      g(745978, "MAIS ALGO?", "MULTIPLE", 0, 1, "ACTIVE", 3, [
        o(2796660, "BATATA FRITA", 12, "ACTIVE", 0),
        o(2796662, "COXINHA HMB", 18, "MISSING", 2),
      ]),
      g(745980, "UM DOCINHO VAI?", "MULTIPLE", 0, 1, "ACTIVE", 4, [
        o(2796669, "PUDIM", 8, "MISSING", 1),
        o(2796670, "BROWNIE DE BRIGADEIRO", 7, "ACTIVE", 2),
        o(2796671, "BROWNIE DE NINHO", 7, "ACTIVE", 3),
      ]),
    ]),
  ]),
  cat(328732, "🏆COMBOS DO HAMBURGÃO | PRA 1, 2 OU MAIS", 3, [
    it(3649498, "COMBO - TRADICIONAIS", 0, "ACTIVE", 3, "cea62c8a470cbab034f4f1d3bf398e792f9fe5954d8fc47a.jpg", "*Desconto de 15%* - Escolha seu burguer tradicional favorito e forme seu combo no precinho", [
      g(964783, "BURGUER DO COMBO", "SINGLE", 1, 1, "ACTIVE", 0, [
        o(2981962, "X BURGUER", 12, "ACTIVE", 0, "caf32768IMG-20240607-WA0034.jpg", "Carne 56G, queijo muçarela, alface e tomate"),
        o(2981963, "X SALADA", 14, "ACTIVE", 1, "82b21ffdIMG-20240607-WA0035.jpg", "Carne 56G, ovo, queijo muçarela, alface e tomate"),
        o(2981964, "DELICIA", 14, "ACTIVE", 2, "6b2017e9IMG-20240604-WA0031.jpg", "Carne 56G, presunto, queijo muçarela, alface e tomate"),
        o(2981965, "X BACON", 16, "ACTIVE", 3, "8705598c7164d4271f91b39246f9048c6c079ade30f6943e.jpg", "Carne 56G, bacon em cubos, queijo muçarela, alface e tomate"),
        o(2981967, "X CALA BURGUER", 16, "ACTIVE", 4, "2326cb16IMG-20240607-WA0030.jpg", "Carne 56G, creme de cheddar, calabresa, alface e tomate"),
        o(2981966, "CHEDDAR BACON", 17, "ACTIVE", 5, "3147d0fd_meta__2k_202601250134.jpeg", "Carne de hamburguer 56G, cheddar fatiado, bacon em fatias e cebola roxa pra dar o crock"),
        o(2981968, "HAMBURGÃO", 18, "ACTIVE", 6, "1bb43a8c24e3262386829d93dc182d575a3162bf717e25d5.jpg", "Carne 56G, ovo, bacon em cubos, presunto, queijo muçarela, alface e tomate"),
        o(2981969, "X DUPLO", 18, "ACTIVE", 7, "5e3ace88IMG-20240607-WA0028.jpg", "2 Carnes de 56G, queijo muçarela, creme de cheddar, alface e tomate"),
        o(2981970, "ESPECIAL", 22, "ACTIVE", 8, "6dbcc5e3IMG-20240604-WA0029.jpg", "Carne 56G, ovo, bacon em cubos, presunto, calabresa, queijo muçarela, salsicha, alface e tomate"),
      ]),
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 1, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(964820, "BEBIDA DO COMBO", "SINGLE", 1, 1, "ACTIVE", 2, [
        o(3633069, "COCA COLA LATA", 6, "ACTIVE", 1),
        o(3633070, "COCA ZERO LATA", 6, "ACTIVE", 2),
        o(3633071, "CAJUÍNA LATA", 6, "MISSING", 3),
      ]),
      g(964821, "ACOMPANHAMENTO DO COMBO", "SINGLE", 1, 1, "ACTIVE", 3, [
        o(3633534, "BATATA FRITA", 9.9, "ACTIVE", 1),
        o(3633535, "BATATA, CHEDDAR E BACON", 15.9, "ACTIVE", 2),
        o(3633536, "COXINHA HMB", 21.9, "MISSING", 3),
      ]),
    ]),
    it(3649501, "COMBO - ARTESANAIS", 0, "ACTIVE", 4, "c1c0673fab39bd4205d0ad061f6426eec95433204d93415b.jpg", "*Desconto de 15%* - Escolha seu artesanal favorito e forme seu combo no precinho", [
      g(964784, "BURGUER DO COMBO", "SINGLE", 1, 1, "ACTIVE", 2, [
        o(2981972, "UNIVERSITARIO", 19, "ACTIVE", 0, "0e4447d0_meta__2k_202601202356__4_.jpeg", "Carne artesanal 120G, cheddar fatiado, alface e tomate"),
        o(2981973, "CHICKEN CRISPY", 19, "MISSING", 1, "enhanced-image-2981973-2026-01-22T03-10-56-132Z.jpg", "Frango marinado por 24 horas e empanado, fatia de queijo muçarela, molho a base de ketchup, cebola roxa, alface crespa e tomate"),
        o(2981974, "HMB SALADA", 21, "ACTIVE", 2, "enhanced-image-2981974-2026-01-19T07-07-40-896Z(2).jpg", "Carne artesanal 120G, ovo frito, queijo muçarela, fatia de presunto, cebola roxa, alface e tomate"),
        o(2981975, "CHICKEN BACON", 22, "ACTIVE", 3, "cfcae4da_meta__2k_202601220014__2_.jpeg", "Frango desfiado, creme de cheddar, ovo frito, bacon em cubos, cebola caramelizada no shoyu, alface crespa e tomate no pão selado na manteiga"),
        o(2981977, "HMB PICANTE", 23, "ACTIVE", 4, "05274d91_meta__2k_202601250114__3_.jpeg", "Carne artesanal de 120G, creme de queijo feito com catupiry original, calabresa fatiada e chapeada, geleia de pimenta agridoce e cebola roxa pra dar o crock"),
        o(2981976, "HMB BACON", 25, "ACTIVE", 5, "7003da97_meta__2k_202601212048.jpeg", "Carne artesanal 120G, cheddar fatiado, bacon fatiado, ovo, cebola roxa, alface e tomate"),
        o(3472762, "MAPLE", 25, "ACTIVE", 6, "5fece58f_meta__2k_202601182350__2_.jpeg", "Carne artesanal 120G, muito creme de cheddar e bacon em cubos"),
        o(2981978, "CHEDDAR BBQ", 25, "ACTIVE", 7, "enhanced-image-2981978-2026-01-19T07-06-09-800Z.jpg", "Carne artesanal 120G, bacon em cubos, cheddar fatiado, cebola caramelizada e molho barbecue com goiabada"),
        o(2981980, "ESTAÇÃO", 28, "ACTIVE", 8, "b6f988b7_meta__2k_202601210007__1_.jpeg", "Carne artesanal 120G, queijo muçarela, costela desfiada, crispy de cebola e geleia de pimenta"),
        o(2981979, "DOM CATUPIRY", 29, "ACTIVE", 9, "a6c769bc_meta__2k_202601180314__1_.jpeg", "Carne artesanal 120G, catupiry original empanado, cebola caramelizada no shoyu e bacon em cubos"),
        o(2981981, "MARMELHOR", 30, "ACTIVE", 10, "enhanced-image-2981981-2026-01-19T07-06-35-653Z.jpg", "Carne artesanal 120G, lapada de queijo muçarela empanado, bacon fatiado crocante e geleia de pimenta agridoce"),
      ]),
      g(964820, "BEBIDA DO COMBO", "SINGLE", 1, 1, "ACTIVE", 3, [
        o(3633069, "COCA COLA LATA", 6, "ACTIVE", 1),
        o(3633070, "COCA ZERO LATA", 6, "ACTIVE", 2),
        o(3633071, "CAJUÍNA LATA", 6, "MISSING", 3),
      ]),
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 4, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(964821, "ACOMPANHAMENTO DO COMBO", "SINGLE", 1, 1, "ACTIVE", 5, [
        o(3633534, "BATATA FRITA", 9.9, "ACTIVE", 1),
        o(3633535, "BATATA, CHEDDAR E BACON", 15.9, "ACTIVE", 2),
        o(3633536, "COXINHA HMB", 21.9, "MISSING", 3),
      ]),
    ]),
    it(3747333, "MONTE SUA BOX", 0, "INACTIVE", 6, null, "", [
      g(1037252, "ESCOLHA OS 3 BURGUERS", "SUMMABLE", 3, 3, "ACTIVE", 1, [
        o(3928366, "X BACON", 16, "ACTIVE", 0, "613fb13e7164d4271f91b39246f9048c6c079ade30f6943e.jpg", "Carne tradicional, fatia de queijo muçarela, bacon em cubos, alface crespa e tomate"),
        o(3928367, "CHEDDAR BBQ", 25, "ACTIVE", 1, "85603f74067945ee77f60ceae1e3f66e26903ecc5e5ae6c4.jpg", "Carne artesanal 120G, bacon em cubos, cheddar fatiado, cebola caramelizada no shoyu e molho barbecue com goiabada"),
        o(3928368, "X DUPLO", 18, "ACTIVE", 2, "ba13b22fIMG-20240607-WA0028.jpg", "2 Carnes tradicionais, queijo muçarela, creme de cheddar, alface e tomate"),
        o(3928369, "HMB BACON", 25, "ACTIVE", 3, "92eecf5d_meta__2k_202601212048.jpeg", "Carne artesanal 120G, cheddar fatiado, bacon fatiado, ovo, cebola roxa, alface e tomate"),
        o(3928370, "DOM CATUPIRY", 29, "ACTIVE", 4, "84c81e14_meta__2k_202601180307.jpeg", "Carne artesanal 120G, catupiry original empanado, cebola caramelizada no shoyu e bacon em cubos"),
        o(3928377, "UNIVERSITARIO", 19, "ACTIVE", 5, "8e08ad09_meta__2k_202601202356__2_.jpeg", "Carne artesanal 120G, cheddar fatiado, alface e tomate"),
        o(3928371, "MARMELHOR", 30, "ACTIVE", 6, "fe657b3e_meta__2k_202601171638.jpeg", "Carne artesanal 120G, lapada de queijo muçarela empanado, bacon fatiado crocante e geleia de pimenta agridoce"),
        o(3928372, "HMB SALADA", 21, "ACTIVE", 7, "7d76f54c_meta__2k_202601190341__2_.jpeg", "Carne artesanal 120G, ovo frito, queijo muçarela, fatia de presunto, cebola roxa, alface e tomate"),
        o(3928373, "MAPLE", 25, "ACTIVE", 8, "b9e93911_meta__2k_202601182350__2_.jpeg", "Carne artesanal de 120G, creme de cheddar artesanal e bacon em cubos"),
        o(3928374, "CHICKEN CRISPY", 19, "MISSING", 9, "40f5e136_meta__2k_202601200516__1_.jpeg", "Frango empanado, queijo muçarela, molho a base de ketchup, cebola roxa, alface crespa e tomate"),
        o(3928375, "ESTAÇÃO", 28, "ACTIVE", 10, "8a96a301_meta__2k_202601210007__1_.jpeg", "Carne artesanal 120G, queijo muçarela, costela desfiada, crispy de cebola e geleia de pimenta"),
        o(3928376, "ESPECIAL", 22, "ACTIVE", 11, "dcd2acbaIMG-20240604-WA0027.jpg", "Carne tradicional, ovo, bacon em cubos, presunto, calabresa, queijo muçarela, salsicha, alface e tomate"),
      ]),
    ]),
  ]),
  cat(328733, "🍔 ARTESANAIS", 4, [
    it(2979331, "ARTESANAIS 🍔", 0, "ACTIVE", 0, "a381d7daDesign_sem_nome.jpg", "Artesanais com nosso toque especial, combinações únicas te esperam! 🍔🔥\r\n\r\n*Burguers individuais*", [
      g(795195, "BURGUERS ARTESANAIS", "SINGLE", 1, 1, "ACTIVE", 0, [
        o(3633082, "UNIVERSITARIO", 19, "ACTIVE", 0, "31f4afb4_meta__2k_202601202356__2_.jpeg", "Carne artesanal 120G, cheddar fatiado, alface e tomate"),
        o(3633083, "CHICKEN CRISPY", 19, "MISSING", 1, "06676ec1_meta__2k_202601200516__1_.jpeg", "Frango empanado, queijo muçarela, molho a base de ketchup, cebola roxa, alface crespa e tomate"),
        o(3633084, "HMB SALADA", 21, "ACTIVE", 2, "d5db18ff_meta__2k_202601190341__2_.jpeg", "Carne artesanal 120G, ovo frito, queijo muçarela, fatia de presunto, cebola roxa, alface e tomate"),
        o(3633085, "CHICKEN BACON", 22, "ACTIVE", 3, "817aaf8c_meta__2k_202601220014.jpeg", "Frango desfiado, creme de cheddar, ovo frito, bacon em cubos, cebola caramelizada no shoyu, alface crespa e tomate"),
        o(3633087, "HMB PICANTE", 23, "ACTIVE", 4, null, "Carne artesanal de 120G, queijo muçarela, calabresa, geleia de pimenta agridoce e cebola roxa"),
        o(3633086, "HMB BACON", 25, "ACTIVE", 5, "bd9dbd89_meta__2k_202601212048.jpeg", "Carne artesanal 120G, cheddar fatiado, bacon fatiado, ovo, cebola roxa, alface e tomate"),
        o(3633088, "MAPLE", 25, "ACTIVE", 6, "e4e01fda_meta__2k_202601182350__1_.jpeg", "Carne artesanal 120G, muito creme de cheddar e bacon em cubos"),
        o(3633089, "CHEDDAR BBQ", 25, "ACTIVE", 7, "2fc10803_meta__2k_202601190345__1_.jpeg", "Carne artesanal 120G, bacon em cubos, cheddar fatiado, cebola caramelizada e molho barbecue com goiabada"),
        o(3633090, "ESTAÇÃO", 28, "ACTIVE", 8, "e56dfe09_meta__2k_202601210020__2_.jpeg", "Carne artesanal 120G, queijo muçarela, costela desfiada, crispy de cebola e geleia de pimenta"),
        o(3633091, "DOM CATUPIRY", 29, "ACTIVE", 9, "a90f4339_meta__2k_202601180308.jpeg", "*SABOR ÚNICO:* Carne artesanal 120G, catupiry original empanado, cebola caramelizada no shoyu e bacon em cubos"),
        o(3633092, "MARMELHOR", 30, "ACTIVE", 10, "5b24276b_meta__2k_202601162240.jpeg", "Carne artesanal 120G, lapada de queijo muçarela empanado, bacon fatiado crocante e geleia de pimenta agridoce"),
      ]),
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 1, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(745979, "E A COQUINHA?", "MULTIPLE", 0, 1, "ACTIVE", 2, [
        o(3002656, "COCA LATA", 6, "ACTIVE", 1),
        o(3002657, "COCA ZERO LATA", 6, "ACTIVE", 2),
      ]),
      g(745978, "MAIS ALGO?", "MULTIPLE", 0, 1, "ACTIVE", 3, [
        o(2796660, "BATATA FRITA", 12, "ACTIVE", 0),
        o(2796662, "COXINHA HMB", 18, "MISSING", 2),
      ]),
      g(795197, "TURBINE SEU BURGUER!", "SUMMABLE", 0, 4, "ACTIVE", 4, [
        o(2981988, "ADIC. DE CARNE 120G", 8, "ACTIVE", 0),
        o(2981989, "ADIC. DE BACON FATIADO", 4, "ACTIVE", 1),
        o(2981990, "ADIC. DE CEBOLA CARAMELIZADA", 3, "ACTIVE", 2),
        o(2981991, "ADIC. DE OVO", 2.5, "ACTIVE", 3),
      ]),
      g(745980, "UM DOCINHO VAI?", "MULTIPLE", 0, 1, "ACTIVE", 5, [
        o(2796669, "PUDIM", 8, "MISSING", 1),
        o(2796670, "BROWNIE DE BRIGADEIRO", 7, "ACTIVE", 2),
        o(2796671, "BROWNIE DE NINHO", 7, "ACTIVE", 3),
      ]),
    ]),
  ]),
  cat(328734, "🍔 TRADICIONAIS", 5, [
    it(2979325, "TRADICIONAIS 🍔", 0, "ACTIVE", 0, "0eb3a9f3Capa_-_Tradicionais.jpg", "Clique aqui para conhecer todos os tradicionais do Hamburgão e fazer sua melhor escolha! 🍔🔥\r\n\r\n*Lanches individuais*", [
      g(795194, "SEU TRADICIONAL FAVORITO", "SINGLE", 1, 1, "ACTIVE", 0, [
        o(3633259, "X BURGUER", 12, "ACTIVE", 0, "1563a28eIMG-20240607-WA0039.jpg", "Carne 56G, queijo muçarela, alface e tomate"),
        o(3633261, "DELICIA", 14, "ACTIVE", 1, "a06504a7IMG-20240604-WA0031.jpg", "Carne 56G, presunto, queijo muçarela, alface e tomate"),
        o(3633260, "X SALADA", 14, "ACTIVE", 2, "40efd32dIMG-20240607-WA0035.jpg", "Carne 56G, ovo, queijo muçarela, alface e tomate"),
        o(3633264, "X CALA BURGUER", 16, "ACTIVE", 3, "f48ea0dbIMG-20240607-WA0029.jpg", "Carne 56G, creme de cheddar, calabresa, alface e tomate"),
        o(3633262, "X BACON", 16, "ACTIVE", 4, "578fb1317164d4271f91b39246f9048c6c079ade30f6943e.jpg", "Carne 56G, bacon em cubos, queijo muçarela, alface e tomate"),
        o(3633263, "CHEDDAR BACON", 17, "ACTIVE", 5, "7db192e8_meta__2k_202601250130.jpeg", "Carne de hamburguer 56G, cheddar fatiado, bacon em fatias e cebola roxa"),
        o(3633265, "X DUPLO", 18, "ACTIVE", 6, "82d41402IMG-20240607-WA0028.jpg", "2 Carnes de 56G, queijo muçarela, creme de cheddar, alface e tomate"),
        o(3633266, "HAMBURGÃO", 18, "ACTIVE", 7, "8acb02ac6be15bb8f0388031c5e8acd54a579f18db105970.jpg", "Carne 56G, ovo, bacon em cubos, presunto, queijo muçarela, alface e tomate"),
        o(3633267, "ESPECIAL", 22, "ACTIVE", 8, "bbdf5381IMG-20240604-WA0029.jpg", "Carne 56G, ovo, bacon em cubos, presunto, calabresa, queijo muçarela, salsicha, alface e tomate"),
      ]),
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 1, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(745979, "E A COQUINHA?", "MULTIPLE", 0, 1, "ACTIVE", 2, [
        o(3002656, "COCA LATA", 6, "ACTIVE", 1),
        o(3002657, "COCA ZERO LATA", 6, "ACTIVE", 2),
      ]),
      g(745978, "MAIS ALGO?", "MULTIPLE", 0, 1, "ACTIVE", 3, [
        o(2796660, "BATATA FRITA", 12, "ACTIVE", 0),
        o(2796662, "COXINHA HMB", 18, "MISSING", 2),
      ]),
      g(795200, "TURBINE SEU LANCHE!", "SUMMABLE", 0, 4, "ACTIVE", 4, [
        o(2981998, "ADIC. DE CARNE 56G", 4, "ACTIVE", 1),
        o(2981999, "ADIC. DE CALABRESA", 3, "ACTIVE", 2),
        o(2981991, "ADIC. DE OVO", 2, "ACTIVE", 3),
        o(2982000, "ADIC. DE MILHO", 1.5, "ACTIVE", 4),
      ]),
      g(745980, "UM DOCINHO VAI?", "MULTIPLE", 0, 1, "ACTIVE", 5, [
        o(2796669, "PUDIM", 8, "MISSING", 1),
        o(2796670, "BROWNIE DE BRIGADEIRO", 7, "ACTIVE", 2),
        o(2796671, "BROWNIE DE NINHO", 7, "ACTIVE", 3),
      ]),
    ]),
  ]),
  cat(328735, "🌭 CACHORRO QUENTE", 6, [
    it(2979346, "NOSSOS DOGS 🌭", 0, "ACTIVE", 0, null, "Clique e veja todos os dogs do Hamburgão, escolha seu preferido de forma rápida e prática! 🌭🔥", [
      g(795204, "DOGS", "SINGLE", 1, 1, "ACTIVE", 0, [
        o(2982012, "HMB DOG", 12, "ACTIVE", 1, null, "Salsicha, carne moída e purê de batata"),
        o(2982013, "DOG CLÁSSICO", 12, "ACTIVE", 2, "c9642c7eImagem_do_WhatsApp_de_2024-05-27_%C3%A0_s__17.05.10_c04ece5e.jpg", "Salsicha, carne moída, milho, ervilha, tomate em cubos e batata palha"),
        o(2982015, "CHEDDAR BBQ DOG", 16, "ACTIVE", 4, null, "Salsicha, carne moída, creme de cheddar, bacon em cubos e molho barbecue"),
        o(2982016, "PREMIUM DOG", 16, "ACTIVE", 5, null, "Salsicha, carne moída, purê de batata, creme de cheddar, batata palha, tomate, milho e ervilha"),
      ]),
      g(745977, "ESCOLHA SUA MAIONESE", "MULTIPLE", 0, 1, "ACTIVE", 1, [
        o(2796650, "MAIONESE TRADICIONAL", 0, "ACTIVE", 1),
        o(2796651, "MAIONESE VERDE", 0, "ACTIVE", 2),
        o(2796652, "MAIONESE DE ALHO", 0, "ACTIVE", 3),
      ]),
      g(795208, "TURBINE SEU DOGÃO", "SUMMABLE", 0, 3, "ACTIVE", 2, [
        o(2982026, "ADIC. DE BACON EM CUBOS", 4, "ACTIVE", 1),
        o(2982027, "ADIC. DE SALSICHA", 2, "ACTIVE", 2),
        o(2982028, "ADIC. DE PURÊ", 3, "ACTIVE", 3),
        o(2982029, "ADIC. DE CREME CHEDDAR", 3, "ACTIVE", 4),
      ]),
      g(745979, "E A COQUINHA?", "MULTIPLE", 0, 1, "ACTIVE", 3, [
        o(3002656, "COCA LATA", 6, "ACTIVE", 1),
        o(3002657, "COCA ZERO LATA", 6, "ACTIVE", 2),
      ]),
      g(745978, "MAIS ALGO?", "MULTIPLE", 0, 1, "ACTIVE", 4, [
        o(2796660, "BATATA FRITA", 12, "ACTIVE", 0),
        o(2796662, "COXINHA HMB", 18, "MISSING", 2),
      ]),
      g(745980, "UM DOCINHO VAI?", "MULTIPLE", 0, 1, "ACTIVE", 5, [
        o(2796669, "PUDIM", 8, "MISSING", 1),
        o(2796670, "BROWNIE DE BRIGADEIRO", 7, "ACTIVE", 2),
        o(2796671, "BROWNIE DE NINHO", 7, "ACTIVE", 3),
      ]),
    ]),
  ]),
  cat(328762, "🍟 ACOMPANHAMENTOS", 7, [
    it(2986225, "ESCOLHA SEU ACOMPANHAMENTO 🍟", 0, "ACTIVE", 0, null, "Clique para ver os melhores acompanhamentos da cidade 🍟🌰", [
      g(846091, "ESCOLHA SEU FAVORITO", "SUMMABLE", 1, 1, "ACTIVE", 1, [
        o(3183933, "BATATA FRITA", 12, "ACTIVE", 1, "1064856c8e8d686e4cb0c799eb669f6aaba938092a703e8e.jpg", "Fritas crocantes e saborosas com um toque especial"),
        o(3183934, "BATATA, CHEDDAR E BACON", 17, "ACTIVE", 2, "5b96aba0Imagem_do_WhatsApp_de_2024-05-14_%C3%A0_s__16.02.57_2075f36c.jpg", "Fritas recheadas com creme de cheddar e bacon em cubos"),
        o(3183935, "COXINHA SEM MASSA", 20, "MISSING", 3, "50d94cbf042aa18209aa6b91b69e7a4049b9a99f24a81ea0.jpg", "Nossas coxinhas autênticas sem massa, apenas recheio, crocância e muito sabor | 05 unidades"),
      ]),
      g(761733, "MAIS MOLHO", "SUMMABLE", 0, 4, "ACTIVE", 2, [
        o(2854191, "MAIONESE VERDE | POTE 30G", 2.9, "ACTIVE", 1),
        o(2854192, "MAIONESE DE ALHO | POTE 30G", 2.9, "MISSING", 2),
        o(2854193, "BARBECUE COM GOIABADA | POTE 30G\t", 2.9, "ACTIVE", 3),
        o(2854194, "GELEIA DE PIMENTA | POTE 30G", 2.9, "ACTIVE", 4),
      ]),
    ]),
  ]),
  cat(328738, "🍮 SOBREMESA", 8, [
    it(2807542, "PUDIM", 8, "MISSING", null, "0bf7208a3b05a80f2db78c570d5b47a77dd6c3111fe06d64.jpg", "", [
    ]),
  ]),
];

// Mesmo mapeamento do HUB (`backend/cardapioPedidoTotem.js` › `catalogoParaTotem`), reduzido
// ao que importa aqui: ordena por `index`, descarta INACTIVE (MISSING FICA, marcado) e
// renomeia os campos para o formato do bootstrap. Janela de horário, `kind`, `available_for`
// e `price_calculation_type` já foram filtrados lá — este recorte só tem item que passa.
function bootstrapDoCw(categorias) {
  const porIndex = (a, b) => (a?.index ?? 0) - (b?.index ?? 0);
  const imagemDe = (x) => x?.image?.image_url || x?.image?.thumbnail_url || null;
  const visivel = (x) => x?.status !== 'INACTIVE';
  return {
    categorias: [...categorias].sort(porIndex).map((c) => ({
      id: c.id,
      nome: c.name,
      index: c.index,
      itens: [...c.items].sort(porIndex).filter(visivel).map((i) => ({
        id: i.id,
        nome: i.name,
        descricao: i.description ?? null,
        imagem: imagemDe(i),
        preco: i.price,
        status: i.status,
        index: i.index,
        grupos: [...(i.option_groups ?? [])].sort(porIndex).filter(visivel).map((gr) => ({
          id: gr.id,
          nome: gr.name,
          choiceType: gr.choice_type,
          min: gr.minimum_quantity,
          max: gr.maximum_quantity ?? null,
          status: gr.status,
          index: gr.index,
          opcoes: [...(gr.options ?? [])].sort(porIndex).filter(visivel).map((op) => ({
            id: op.id,
            nome: op.name,
            preco: op.price,
            status: op.status,
            maxQuantidade: op.max_quantity ?? null,
            index: op.index,
            imagem: imagemDe(op),
            descricao: op.description ?? null,
          })),
        })),
      })),
    })),
    fetchedAt: '2026-09-11T21:03:00.000Z',
  };
}

const catalogo = () => bootstrapDoCw(CW_BRUTO);
const categoriaDe = (cat, id) => cat.categorias.find((c) => c.id === id);
const itemDe = (cat, idCategoria, idItem) => categoriaDe(cat, idCategoria).itens.find((i) => i.id === idItem);
const grupoDe = (item, id) => item.grupos.find((gr) => gr.id === id);
const opcaoDe = (grupo, id) => grupo.opcoes.find((op) => op.id === id);
// Variante derivada do dado real (o snapshot não tem todo estado possível: nele nenhum
// grupo está MISSING e nenhum item expansível está em promoção). Sempre em cópia.
const variando = (fn) => { const c = catalogo(); fn(c); return c; };

const CAT_QUINTA = 349627;
const CAT_MAIS_PEDIDOS = 413357;
const CAT_COMBOS = 328732;
const CAT_ARTESANAIS = 328733;
const CAT_TRADICIONAIS = 328734;
const CAT_DOGS = 328735;
const CAT_ACOMPANHAMENTOS = 328762;
const CAT_SOBREMESA = 328738;

const IT_TRADICIONAIS = 2979325;   // item base R$ 0,00 — o caso canônico da spec
const IT_ARTESANAIS = 2979331;
const IT_DOGS = 2979346;
const IT_COMBO_TRAD = 3649498;
const IT_COMBO_ART = 3649501;
const IT_ACOMPANHAMENTO = 2986225; // grupo principal SUMMABLE 1–1
const IT_QUINTA = 3078024;         // MESMO NOME de IT_TRADICIONAIS, outro id
const IT_DOM_CATUPIRY = 3722649;   // item com preço próprio
const IT_PUDIM = 2807542;          // item MISSING, sem grupos
const IT_MONTE_BOX = 3747333;      // INACTIVE: o HUB nem manda

const G_TRADICIONAL_FAVORITO = 795194;
const G_ARTESANAIS = 795195;
const G_DOGS = 795204;
const G_FAVORITO_ACOMP = 846091;   // SUMMABLE 1–1
const G_BURGUER_COMBO_T = 964783;  // 1–1, mas o combo tem outros três obrigatórios
const G_BURGUER_COMBO_A = 964784;
const G_ESCOLHA_DOIS = 820734;     // SUMMABLE 2–2
const G_BATATA_GRATIS = 820735;    // 1–1 dentro da QUINTA (outro obrigatório manda nele)
const G_MAIONESE = 745977;         // MULTIPLE 0–1
const G_TURBINE_LANCHE = 795200;   // SUMMABLE 0–4

const OP_X_BURGUER = 3633259;      // "X BURGUER" em TRADICIONAIS
const OP_X_BURGUER_COMBO = 2981962;// "X BURGUER" no COMBO — MESMO NOME, outro id
const OP_X_BURGUER_QUINTA = 3088764;
const OP_CHICKEN_CRISPY = 3633083; // opção MISSING dentro de ARTESANAIS
const OP_HMB_DOG = 2982012;        // opção sem imagem, item sem imagem
const OP_DOG_CLASSICO = 2982013;   // opção com imagem própria

const cfg = (cwItemId, cwGrupoPrincipalId, id = 1) => ({ id, empresaId: 9, cwItemId, modo: 'EXPANDIDO', cwGrupoPrincipalId });

// ── Fixture e conversor ─────────────────────────────────────────────────────
test('fixture: o conversor entrega o bootstrap na ordem do CW e sem INACTIVE', () => {
  const cat = catalogo();
  assert.deepEqual(cat.categorias.map((c) => c.id), [
    CAT_QUINTA, CAT_MAIS_PEDIDOS, CAT_COMBOS, CAT_ARTESANAIS, CAT_TRADICIONAIS, CAT_DOGS, CAT_ACOMPANHAMENTOS, CAT_SOBREMESA,
  ]);
  // MONTE SUA BOX é INACTIVE no CW: o HUB não o inclui no bootstrap, então ele não existe
  // para este módulo (por isso a regra 3–3 dele nunca precisa ser recusada aqui).
  assert.equal(categoriaDe(cat, CAT_COMBOS).itens.some((i) => i.id === IT_MONTE_BOX), false);
  assert.deepEqual(categoriaDe(cat, CAT_COMBOS).itens.map((i) => i.id), [IT_COMBO_TRAD, IT_COMBO_ART]);
  // Ordem das opções do grupo principal = `index` do CW, que NÃO é a ordem do JSON.
  const grupo = grupoDe(itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO);
  assert.deepEqual(grupo.opcoes.map((op) => op.nome), [
    'X BURGUER', 'DELICIA', 'X SALADA', 'X CALA BURGUER', 'X BACON', 'CHEDDAR BACON', 'X DUPLO', 'HAMBURGÃO', 'ESPECIAL',
  ]);
});

// ── MODOS ───────────────────────────────────────────────────────────────────
test('MODOS: só NORMAL e EXPANDIDO (a tabela só persiste EXPANDIDO)', () => {
  assert.deepEqual(MODOS, ['NORMAL', 'EXPANDIDO']);
});

// ── grupoElegivel ───────────────────────────────────────────────────────────
test('grupoElegivel: SINGLE 1–1 do cardápio real passa', () => {
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  assert.deepEqual(grupoElegivel(grupoDe(item, G_TRADICIONAL_FAVORITO)), { ok: true });
});

test('grupoElegivel: SUMMABLE 1–1 passa — o rótulo não decide, min/max decide', () => {
  const item = itemDe(catalogo(), CAT_ACOMPANHAMENTOS, IT_ACOMPANHAMENTO);
  const grupo = grupoDe(item, G_FAVORITO_ACOMP);
  assert.equal(grupo.choiceType, 'SUMMABLE');
  assert.deepEqual(grupoElegivel(grupo), { ok: true });
});

test('grupoElegivel: MULTIPLE 0–1 não é escolha única (é opcional)', () => {
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  assert.deepEqual(grupoElegivel(grupoDe(item, G_MAIONESE)), { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
});

test('grupoElegivel: SUMMABLE 2–2 da QUINTA DA BATATA não é escolha única', () => {
  const item = itemDe(catalogo(), CAT_QUINTA, IT_QUINTA);
  assert.deepEqual(grupoElegivel(grupoDe(item, G_ESCOLHA_DOIS)), { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
});

test('grupoElegivel: `max: null` é SEM TETO, não 1', () => {
  assert.deepEqual(grupoElegivel({ status: 'ACTIVE', min: 1, max: null, opcoes: [{ id: 1 }] }), { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
});

test('grupoElegivel: grupo sem opções visíveis não serve de principal', () => {
  const cat = variando((c) => { grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO).opcoes = []; });
  const grupo = grupoDe(itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO);
  assert.deepEqual(grupoElegivel(grupo), { ok: false, codigo: 'GRUPO_SEM_OPCOES' });
});

test('grupoElegivel: MISSING e INACTIVE são indisponíveis (a checagem de status vem antes)', () => {
  const cat = variando((c) => { grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO).status = 'MISSING'; });
  const grupo = grupoDe(itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO);
  assert.deepEqual(grupoElegivel(grupo), { ok: false, codigo: 'GRUPO_INDISPONIVEL' });
  assert.deepEqual(grupoElegivel({ ...grupo, status: 'INACTIVE' }), { ok: false, codigo: 'GRUPO_INDISPONIVEL' });
  // Indisponível ganha do "sem opções": o motivo mostrado é o que a loja tem de resolver.
  assert.deepEqual(grupoElegivel({ status: 'MISSING', min: 1, max: 1, opcoes: [] }), { ok: false, codigo: 'GRUPO_INDISPONIVEL' });
});

test('grupoElegivel: entrada lixo não explode', () => {
  assert.deepEqual(grupoElegivel(null), { ok: false, codigo: 'GRUPO_INDISPONIVEL' });
  assert.deepEqual(grupoElegivel(undefined), { ok: false, codigo: 'GRUPO_INDISPONIVEL' });
});

// ── validarConfiguracao ─────────────────────────────────────────────────────
test('validarConfiguracao: modo fora de MODOS é MODO_INVALIDO antes de tudo', () => {
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDA', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, item), { ok: false, codigo: 'MODO_INVALIDO' });
  assert.deepEqual(validarConfiguracao({}, item), { ok: false, codigo: 'MODO_INVALIDO' });
  assert.deepEqual(validarConfiguracao(null, item), { ok: false, codigo: 'MODO_INVALIDO' });
});

test('validarConfiguracao: NORMAL é válido e nem olha o catálogo (é o que apaga órfã)', () => {
  assert.deepEqual(validarConfiguracao({ modo: 'NORMAL' }, null), { ok: true, grupo: null });
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  assert.deepEqual(validarConfiguracao({ modo: 'NORMAL', cwGrupoPrincipalId: 999 }, item), { ok: true, grupo: null });
});

test('validarConfiguracao: item nulo/ausente é ITEM_AUSENTE', () => {
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, null), { ok: false, codigo: 'ITEM_AUSENTE' });
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, undefined), { ok: false, codigo: 'ITEM_AUSENTE' });
});

test('validarConfiguracao: grupo que não é do item é GRUPO_AUSENTE (vínculo por id, nunca por nome)', () => {
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  // G_ARTESANAIS existe no cardápio, mas em OUTRO item — não vale.
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_ARTESANAIS }, item), { ok: false, codigo: 'GRUPO_AUSENTE' });
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: null }, item), { ok: false, codigo: 'GRUPO_AUSENTE' });
});

test('validarConfiguracao: TRADICIONAIS 🍔 pelo grupo 795194 é a configuração canônica', () => {
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  const veredito = validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, item);
  assert.equal(veredito.ok, true);
  assert.equal(veredito.grupo, grupoDe(item, G_TRADICIONAL_FAVORITO));
  // Id como texto (veio do corpo de um PUT) casa igual.
  assert.equal(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: String(G_TRADICIONAL_FAVORITO) }, item).ok, true);
});

test('validarConfiguracao: ACOMPANHAMENTO 🍟 (SUMMABLE 1–1, index 1) entra de pleno direito', () => {
  const item = itemDe(catalogo(), CAT_ACOMPANHAMENTOS, IT_ACOMPANHAMENTO);
  assert.equal(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_FAVORITO_ACOMP }, item).ok, true);
});

test('validarConfiguracao: COMBO - TRADICIONAIS é OUTRO_GRUPO_OBRIGATORIO mesmo com o 1–1 em index 0', () => {
  const item = itemDe(catalogo(), CAT_COMBOS, IT_COMBO_TRAD);
  const grupo = grupoDe(item, G_BURGUER_COMBO_T);
  assert.equal(grupo.index, 0);
  assert.deepEqual(grupoElegivel(grupo), { ok: true }); // sozinho o grupo passa…
  // …mas bebida e acompanhamento também são obrigatórios: expandir mentiria para o cliente.
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_BURGUER_COMBO_T }, item), { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' });
});

test('validarConfiguracao: COMBO - ARTESANAIS idem', () => {
  const item = itemDe(catalogo(), CAT_COMBOS, IT_COMBO_ART);
  assert.deepEqual(grupoElegivel(grupoDe(item, G_BURGUER_COMBO_A)), { ok: true });
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_BURGUER_COMBO_A }, item), { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' });
});

test('validarConfiguracao: QUINTA DA BATATA reprova pelos dois lados', () => {
  const item = itemDe(catalogo(), CAT_QUINTA, IT_QUINTA);
  // Pelo 2–2: não é escolha única.
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_ESCOLHA_DOIS }, item), { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
  // Pela batata grátis (1–1 de verdade): o 2–2 obrigatório continua ali.
  assert.deepEqual(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_BATATA_GRATIS }, item), { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' });
});

test('validarConfiguracao: grupo principal MISSING ou sem opções devolve o código do grupo', () => {
  const semOpcoes = variando((c) => { grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO).opcoes = []; });
  assert.deepEqual(
    validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, itemDe(semOpcoes, CAT_TRADICIONAIS, IT_TRADICIONAIS)),
    { ok: false, codigo: 'GRUPO_SEM_OPCOES' },
  );
  const emFalta = variando((c) => { grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TRADICIONAL_FAVORITO).status = 'MISSING'; });
  assert.deepEqual(
    validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, itemDe(emFalta, CAT_TRADICIONAIS, IT_TRADICIONAIS)),
    { ok: false, codigo: 'GRUPO_INDISPONIVEL' },
  );
});

test('validarConfiguracao: outro grupo obrigatório em falta TAMBÉM invalida', () => {
  // Variante derivada: no snapshot real nenhum grupo está MISSING. Um grupo obrigatório em
  // falta continua obrigatório no CW — ignorá-lo faria a configuração piscar com o estoque.
  const cat = variando((c) => {
    const grupo = grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TURBINE_LANCHE);
    grupo.status = 'MISSING';
    grupo.min = 1;
  });
  assert.deepEqual(
    validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO }, itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS)),
    { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' },
  );
});

// ── ordenavelDoItem ─────────────────────────────────────────────────────────
test('ordenavelDoItem: responde exatamente como o itemOrdenavel da tela', () => {
  const cat = catalogo();
  const emFalta = variando((c) => {
    const grupo = grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TURBINE_LANCHE);
    grupo.status = 'MISSING';
    grupo.min = 1;
  });
  const casos = [
    itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS),
    itemDe(cat, CAT_SOBREMESA, IT_PUDIM),
    itemDe(cat, CAT_DOGS, IT_DOGS),
    itemDe(emFalta, CAT_TRADICIONAIS, IT_TRADICIONAIS),
    null,
    {},
  ];
  for (const item of casos) assert.deepEqual(ordenavelDoItem(item), itemOrdenavel(item));
  assert.deepEqual(ordenavelDoItem(itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS)), { ok: true });
  assert.deepEqual(ordenavelDoItem(itemDe(cat, CAT_SOBREMESA, IT_PUDIM)), { ok: false, motivo: 'ITEM_EM_FALTA' });
  assert.deepEqual(ordenavelDoItem(itemDe(emFalta, CAT_TRADICIONAIS, IT_TRADICIONAIS)), { ok: false, motivo: 'GRUPO_EM_FALTA' });
});

test('ordenavelDoItem: grupo OPCIONAL em falta não impede o pedido', () => {
  const cat = variando((c) => { grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_MAIONESE).status = 'MISSING'; });
  assert.deepEqual(ordenavelDoItem(itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS)), { ok: true });
});

// ── projetarProduto ─────────────────────────────────────────────────────────
test('projetarProduto: X BURGUER de TRADICIONAIS — o golden do contrato §5', () => {
  const item = itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS);
  const grupo = grupoDe(item, G_TRADICIONAL_FAVORITO);
  const produto = projetarProduto(item, grupo, opcaoDe(grupo, OP_X_BURGUER));
  assert.deepEqual(produto, {
    id: 'opcao:2979325:795194:3633259',
    tipo: 'OPCAO_PRINCIPAL',
    nome: 'X BURGUER',
    descricao: 'Carne 56G, queijo muçarela, alface e tomate',
    imagem: `${CDN_SUB}3633259/1563a28eIMG-20240607-WA0039.jpg`,
    preco: 12,
    status: 'ACTIVE',
    ordenavel: true,
    origem: { itemId: 2979325, grupoId: 795194, opcaoId: 3633259 },
    grupoPrincipalId: 795194,
  });
  // Ajuste 1 da spec: o produto NÃO carrega o item técnico (o front indexa por origem).
  assert.equal('item' in produto, false);
  assert.equal('grupos' in produto, false);
});

test('projetarProduto: preço é base + opção, com duas casas', () => {
  const item = { id: 1, preco: 12.35, status: 'ACTIVE', grupos: [] };
  const produto = projetarProduto(item, { id: 2 }, { id: 3, nome: 'X', preco: 0.1, status: 'ACTIVE' });
  assert.equal(produto.preco, 12.45);
  // 0.1 + 0.2 em ponto flutuante é 0.30000000000000004 — o card não pode mostrar isso.
  assert.equal(projetarProduto({ id: 1, preco: 0.1, status: 'ACTIVE' }, { id: 2 }, { id: 3, preco: 0.2, status: 'ACTIVE' }).preco, 0.3);
});

test('projetarProduto: promoção do item base soma a opção por cima', () => {
  // Variante derivada: no snapshot nenhum item expansível está em promoção (o CW só promove
  // o item, nunca a opção) — mas a régua é a mesma do preço cheio.
  const cat = variando((c) => {
    const item = itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS);
    item.preco = 5;
    item.precoPromocional = 3.5;
  });
  const item = itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS);
  const grupo = grupoDe(item, G_TRADICIONAL_FAVORITO);
  const produto = projetarProduto(item, grupo, opcaoDe(grupo, OP_X_BURGUER));
  assert.equal(produto.preco, 17);
  assert.equal(produto.precoPromocional, 15.5);
  // Sem promoção a chave nem existe (o front usa `'precoPromocional' in produto`).
  const semPromo = projetarProduto(itemDe(catalogo(), CAT_TRADICIONAIS, IT_TRADICIONAIS), grupo, opcaoDe(grupo, OP_X_BURGUER));
  assert.equal('precoPromocional' in semPromo, false);
});

test('projetarProduto: grupo obrigatório em falta derruba a ordenabilidade do produto', () => {
  // Estado que `projetarCatalogo` não alcança (a configuração cairia antes, em
  // OUTRO_GRUPO_OBRIGATORIO), mas a função é pública e tem de tratar.
  const cat = variando((c) => {
    const grupo = grupoDe(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS), G_TURBINE_LANCHE);
    grupo.status = 'MISSING';
    grupo.min = 1;
  });
  const item = itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS);
  const grupo = grupoDe(item, G_TRADICIONAL_FAVORITO);
  const produto = projetarProduto(item, grupo, opcaoDe(grupo, OP_X_BURGUER));
  assert.equal(produto.ordenavel, false);
  assert.equal(produto.motivo, 'GRUPO_EM_FALTA');
});

test('projetarProduto: mesmo nome, ids diferentes — cada produto aponta para o SEU', () => {
  const cat = catalogo();
  const trad = itemDe(cat, CAT_TRADICIONAIS, IT_TRADICIONAIS);
  const gTrad = grupoDe(trad, G_TRADICIONAL_FAVORITO);
  const combo = itemDe(cat, CAT_COMBOS, IT_COMBO_TRAD);
  const gCombo = grupoDe(combo, G_BURGUER_COMBO_T);
  const quinta = itemDe(cat, CAT_QUINTA, IT_QUINTA);
  const gQuinta = grupoDe(quinta, G_ESCOLHA_DOIS);
  const a = projetarProduto(trad, gTrad, opcaoDe(gTrad, OP_X_BURGUER));
  const b = projetarProduto(combo, gCombo, opcaoDe(gCombo, OP_X_BURGUER_COMBO));
  const c = projetarProduto(quinta, gQuinta, opcaoDe(gQuinta, OP_X_BURGUER_QUINTA));
  assert.deepEqual([a.nome, b.nome, c.nome], ['X BURGUER', 'X BURGUER', 'X BURGUER']);
  assert.deepEqual([a.origem, b.origem, c.origem], [
    { itemId: 2979325, grupoId: 795194, opcaoId: 3633259 },
    { itemId: 3649498, grupoId: 964783, opcaoId: 2981962 },
    { itemId: 3078024, grupoId: 820734, opcaoId: 3088764 },
  ]);
  assert.equal(new Set([a.id, b.id, c.id]).size, 3);
});

// ── produtoDeItem ───────────────────────────────────────────────────────────
test('produtoDeItem: item com preço próprio vira o card de hoje', () => {
  const item = itemDe(catalogo(), CAT_MAIS_PEDIDOS, IT_DOM_CATUPIRY);
  assert.deepEqual(produtoDeItem(item), {
    id: 'item:3722649',
    tipo: 'ITEM',
    nome: 'DOM CATUPIRY',
    descricao: 'Carne artesanal 120G, catupiry empanado, cebola caramelizada e bacon em cubos',
    imagem: `${CDN_ITEM}3722649/b2a47d79_meta__2k_202601180308(2).jpeg`,
    preco: 29,
    status: 'ACTIVE',
    ordenavel: true,
    origem: { itemId: 3722649 },
  });
});

test('produtoDeItem: PUDIM em falta sai MISSING e não ordenável', () => {
  const produto = produtoDeItem(itemDe(catalogo(), CAT_SOBREMESA, IT_PUDIM));
  assert.equal(produto.status, 'MISSING');
  assert.equal(produto.ordenavel, false);
  assert.equal(produto.motivo, 'ITEM_EM_FALTA');
  assert.deepEqual(produto.origem, { itemId: IT_PUDIM });
});

// ── projetarCatalogo ────────────────────────────────────────────────────────
test('projetarCatalogo: TRADICIONAIS EXPANDIDO vira 9 produtos na ordem do CW', () => {
  const base = catalogo();
  const { catalogo: projetado, avisos } = projetarCatalogo(base, [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO)]);
  assert.deepEqual(avisos, []);
  const produtos = categoriaDe(projetado, CAT_TRADICIONAIS).produtos;
  assert.equal(produtos.length, 9);
  assert.deepEqual(produtos.map((p) => p.nome), [
    'X BURGUER', 'DELICIA', 'X SALADA', 'X CALA BURGUER', 'X BACON', 'CHEDDAR BACON', 'X DUPLO', 'HAMBURGÃO', 'ESPECIAL',
  ]);
  assert.deepEqual(produtos.map((p) => p.preco), [12, 14, 14, 16, 16, 17, 18, 18, 22]);
  assert.deepEqual(produtos.map((p) => p.tipo), Array(9).fill('OPCAO_PRINCIPAL'));
  assert.deepEqual(produtos.map((p) => p.grupoPrincipalId), Array(9).fill(G_TRADICIONAL_FAVORITO));
  assert.deepEqual(produtos.map((p) => p.origem.opcaoId), [3633259, 3633261, 3633260, 3633264, 3633262, 3633263, 3633265, 3633266, 3633267]);
  for (const p of produtos) {
    assert.equal(p.origem.itemId, IT_TRADICIONAIS);
    assert.equal(p.origem.grupoId, G_TRADICIONAL_FAVORITO);
    assert.equal('item' in p, false);
  }
  // Identidade apresentada = a da opção, não a do item base.
  assert.equal(produtos[0].imagem, `${CDN_SUB}3633259/1563a28eIMG-20240607-WA0039.jpg`);
  assert.equal(produtos[0].descricao, 'Carne 56G, queijo muçarela, alface e tomate');
  assert.notEqual(produtos[0].imagem, itemDe(base, CAT_TRADICIONAIS, IT_TRADICIONAIS).imagem);
});

test('projetarCatalogo: DOGS — opção sem imagem cai para a do item (que aqui é null)', () => {
  const base = catalogo();
  const item = itemDe(base, CAT_DOGS, IT_DOGS);
  assert.equal(item.imagem, null); // NOSSOS DOGS 🌭 não tem foto no CW
  const { catalogo: projetado } = projetarCatalogo(base, [cfg(IT_DOGS, G_DOGS)]);
  const produtos = categoriaDe(projetado, CAT_DOGS).produtos;
  assert.deepEqual(produtos.map((p) => p.nome), ['HMB DOG', 'DOG CLÁSSICO', 'CHEDDAR BBQ DOG', 'PREMIUM DOG']);
  const hmb = produtos.find((p) => p.origem.opcaoId === OP_HMB_DOG);
  const classico = produtos.find((p) => p.origem.opcaoId === OP_DOG_CLASSICO);
  assert.equal(hmb.imagem, null);                       // sem foto na opção e sem foto no item
  assert.ok(classico.imagem.startsWith(CDN_SUB));       // a opção tem a sua
  // A descrição da opção existe nas duas, então nunca cai para a do item.
  assert.equal(hmb.descricao, 'Salsicha, carne moída e purê de batata');
});

test('projetarCatalogo: imagem do ITEM entra quando a opção não tem', () => {
  // CHEDDAR BACON da QUINTA é a única opção sem foto num item… que também não tem foto.
  // Aqui a variante dá foto ao item para provar o degrau do meio da regra.
  const cat = variando((c) => { itemDe(c, CAT_DOGS, IT_DOGS).imagem = `${CDN_ITEM}${IT_DOGS}/capa-dogs.jpg`; });
  const { catalogo: projetado } = projetarCatalogo(cat, [cfg(IT_DOGS, G_DOGS)]);
  const hmb = categoriaDe(projetado, CAT_DOGS).produtos.find((p) => p.origem.opcaoId === OP_HMB_DOG);
  assert.equal(hmb.imagem, `${CDN_ITEM}${IT_DOGS}/capa-dogs.jpg`);
});

test('projetarCatalogo: opção MISSING vira produto MISSING (as outras seguem ACTIVE)', () => {
  const { catalogo: projetado } = projetarCatalogo(catalogo(), [cfg(IT_ARTESANAIS, G_ARTESANAIS)]);
  const produtos = categoriaDe(projetado, CAT_ARTESANAIS).produtos;
  assert.equal(produtos.length, 11);
  const crispy = produtos.find((p) => p.origem.opcaoId === OP_CHICKEN_CRISPY);
  assert.equal(crispy.nome, 'CHICKEN CRISPY');
  assert.equal(crispy.status, 'MISSING');
  assert.equal(crispy.ordenavel, true); // em falta ≠ não ordenável: o card diz "Em falta"
  assert.deepEqual(produtos.filter((p) => p.status === 'MISSING').map((p) => p.nome), ['CHICKEN CRISPY']);
});

test('projetarCatalogo: item MISSING derruba TODOS os produtos dele', () => {
  const cat = variando((c) => { itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS).status = 'MISSING'; });
  const { catalogo: projetado } = projetarCatalogo(cat, [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO)]);
  const produtos = categoriaDe(projetado, CAT_TRADICIONAIS).produtos;
  assert.equal(produtos.length, 9);
  for (const p of produtos) {
    assert.equal(p.status, 'MISSING');
    assert.equal(p.ordenavel, false);
    assert.equal(p.motivo, 'ITEM_EM_FALTA');
  }
});

test('projetarCatalogo: item sem configuração vira um produto ITEM', () => {
  const { catalogo: projetado, avisos } = projetarCatalogo(catalogo(), []);
  assert.deepEqual(avisos, []);
  for (const categoria of projetado.categorias) {
    assert.deepEqual(categoria.produtos.map((p) => p.tipo), categoria.itens.map(() => 'ITEM'));
    assert.deepEqual(categoria.produtos.map((p) => p.origem.itemId), categoria.itens.map((i) => i.id));
  }
  assert.deepEqual(categoriaDe(projetado, CAT_TRADICIONAIS).produtos.map((p) => p.id), ['item:2979325']);
});

test('projetarCatalogo: configuração inválida cai para NORMAL com aviso (o cardápio não quebra)', () => {
  const { catalogo: projetado, avisos } = projetarCatalogo(catalogo(), [cfg(IT_COMBO_TRAD, G_BURGUER_COMBO_T, 4)]);
  assert.deepEqual(avisos, [{ cwItemId: IT_COMBO_TRAD, codigo: 'OUTRO_GRUPO_OBRIGATORIO' }]);
  const produtos = categoriaDe(projetado, CAT_COMBOS).produtos;
  assert.deepEqual(produtos.map((p) => p.id), ['item:3649498', 'item:3649501']);
  assert.equal(produtos[0].tipo, 'ITEM');
});

test('projetarCatalogo: configuração de item que sumiu do catálogo vira aviso ITEM_AUSENTE', () => {
  const { catalogo: projetado, avisos } = projetarCatalogo(catalogo(), [
    cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO, 1),
    cfg(4384008, 111111, 2), // SUPER BOX saiu do bootstrap (item MISSING fora deste recorte)
  ]);
  assert.deepEqual(avisos, [{ cwItemId: 4384008, codigo: 'ITEM_AUSENTE' }]);
  const todos = projetado.categorias.flatMap((c) => c.produtos);
  assert.equal(todos.some((p) => p.origem.itemId === 4384008), false);
  assert.equal(todos.filter((p) => p.tipo === 'OPCAO_PRINCIPAL').length, 9);
});

test('projetarCatalogo: item em duas categorias expande nas duas e avisa UMA vez', () => {
  // O CW permite o mesmo item em mais de uma categoria; aqui TRADICIONAIS 🍔 também é
  // "mais pedido". A vitrine tem de mostrá-lo nas duas, e o admin, um defeito só.
  const cat = variando((c) => { categoriaDe(c, CAT_MAIS_PEDIDOS).itens.push(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS)); });
  const valido = projetarCatalogo(cat, [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO)]);
  assert.equal(categoriaDe(valido.catalogo, CAT_MAIS_PEDIDOS).produtos.filter((p) => p.tipo === 'OPCAO_PRINCIPAL').length, 9);
  assert.equal(categoriaDe(valido.catalogo, CAT_TRADICIONAIS).produtos.length, 9);
  const invalido = projetarCatalogo(cat, [cfg(IT_TRADICIONAIS, G_MAIONESE)]);
  assert.deepEqual(invalido.avisos, [{ cwItemId: IT_TRADICIONAIS, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' }]);
});

test('projetarCatalogo: `itens` fica intacto e a entrada não é mutada', () => {
  const base = catalogo();
  const antes = JSON.stringify(base);
  const configuracoes = [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO, 1), cfg(IT_COMBO_TRAD, G_BURGUER_COMBO_T, 2), cfg(999999, 1, 3)];
  const configAntes = JSON.stringify(configuracoes);
  const { catalogo: projetado } = projetarCatalogo(base, configuracoes);
  assert.equal(JSON.stringify(base), antes);
  assert.equal(JSON.stringify(configuracoes), configAntes);
  assert.notEqual(projetado, base);
  assert.equal(projetado.fetchedAt, base.fetchedAt);
  assert.deepEqual(projetado.categorias.map((c) => c.id), base.categorias.map((c) => c.id));
  for (const categoria of base.categorias) {
    const espelho = categoriaDe(projetado, categoria.id);
    assert.deepEqual(espelho.itens, categoria.itens);
    assert.equal(espelho.nome, categoria.nome);
    assert.equal(espelho.index, categoria.index);
  }
  // Bootstrap sem categoria nenhuma não pode lançar.
  assert.deepEqual(projetarCatalogo(null, null), { catalogo: { categorias: [] }, avisos: [] });
});

// ── sugerirCandidatos ───────────────────────────────────────────────────────
test('sugerirCandidatos: golden do cardápio real (4 candidatos, na ordem das categorias)', () => {
  const base = catalogo();
  const antes = JSON.stringify(base);
  assert.deepEqual(sugerirCandidatos(base), [
    { cwItemId: IT_ARTESANAIS, nome: 'ARTESANAIS 🍔', categoria: '🍔 ARTESANAIS', cwGrupoPrincipalId: G_ARTESANAIS, grupoNome: 'BURGUERS ARTESANAIS' },
    { cwItemId: IT_TRADICIONAIS, nome: 'TRADICIONAIS 🍔', categoria: '🍔 TRADICIONAIS', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO, grupoNome: 'SEU TRADICIONAL FAVORITO' },
    { cwItemId: IT_DOGS, nome: 'NOSSOS DOGS 🌭', categoria: '🌭 CACHORRO QUENTE', cwGrupoPrincipalId: G_DOGS, grupoNome: 'DOGS' },
    { cwItemId: IT_ACOMPANHAMENTO, nome: 'ESCOLHA SEU ACOMPANHAMENTO 🍟', categoria: '🍟 ACOMPANHAMENTOS', cwGrupoPrincipalId: G_FAVORITO_ACOMP, grupoNome: 'ESCOLHA SEU FAVORITO' },
  ]);
  assert.equal(JSON.stringify(base), antes);
});

test('sugerirCandidatos: o que a heurística NÃO pode sugerir', () => {
  const ids = sugerirCandidatos(catalogo()).map((s) => s.cwItemId);
  assert.equal(ids.includes(IT_COMBO_TRAD), false);      // três grupos obrigatórios
  assert.equal(ids.includes(IT_COMBO_ART), false);
  assert.equal(ids.includes(IT_QUINTA), false);          // 2–2 + batata obrigatória
  assert.equal(ids.includes(IT_DOM_CATUPIRY), false);    // preço próprio: é produto, não vitrine
  assert.equal(ids.includes(IT_PUDIM), false);
  assert.equal(ids.includes(IT_MONTE_BOX), false);       // INACTIVE: nem chega no bootstrap
  assert.equal(ids.length, 4);
});

test('sugerirCandidatos: item em duas categorias sugerido uma vez só (vale a primeira)', () => {
  const cat = variando((c) => { categoriaDe(c, CAT_MAIS_PEDIDOS).itens.push(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS)); });
  const sugestoes = sugerirCandidatos(cat).filter((s) => s.cwItemId === IT_TRADICIONAIS);
  assert.equal(sugestoes.length, 1);
  assert.equal(sugestoes[0].categoria, '🥇 OS MAIS PEDIDOS'); // index 2 vem antes do 5
});

test('sugerirCandidatos: sugestão nunca ativa nada, e o que ela sugere o PUT aceita', () => {
  const base = catalogo();
  // Sem configuração persistida, sugestão nenhuma muda a vitrine.
  const { catalogo: projetado } = projetarCatalogo(base, []);
  assert.equal(projetado.categorias.flatMap((c) => c.produtos).every((p) => p.tipo === 'ITEM'), true);
  // E o que ela sugere passa na regra oficial (senão o admin ofereceria um botão que dá 422).
  for (const s of sugerirCandidatos(base)) {
    const item = base.categorias.flatMap((c) => c.itens).find((i) => i.id === s.cwItemId);
    assert.equal(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: s.cwGrupoPrincipalId }, item).ok, true);
  }
});

// ── mesclarAdmin ────────────────────────────────────────────────────────────
test('mesclarAdmin: uma linha por item, com preço base e categoria', () => {
  const base = catalogo();
  const antes = JSON.stringify(base);
  const { itens, orfas } = mesclarAdmin(base, []);
  assert.deepEqual(orfas, []);
  assert.deepEqual(itens.map((i) => i.cwItemId), [
    IT_QUINTA, IT_DOM_CATUPIRY, IT_COMBO_TRAD, IT_COMBO_ART, IT_ARTESANAIS, IT_TRADICIONAIS, IT_DOGS, IT_ACOMPANHAMENTO, IT_PUDIM,
  ]);
  const trad = itens.find((i) => i.cwItemId === IT_TRADICIONAIS);
  assert.equal(trad.nome, 'TRADICIONAIS 🍔');
  assert.equal(trad.categoria, '🍔 TRADICIONAIS');
  assert.equal(trad.precoBase, 0);
  assert.equal(trad.config, null);
  assert.deepEqual(trad.validacao, { ok: true }); // sem configuração = NORMAL = válido
  assert.equal(itens.find((i) => i.cwItemId === IT_DOM_CATUPIRY).precoBase, 29);
  assert.equal(JSON.stringify(base), antes);
});

test('mesclarAdmin: elegivel ≠ selecionavel é o que desabilita o select do combo', () => {
  const { itens } = mesclarAdmin(catalogo(), []);
  const combo = itens.find((i) => i.cwItemId === IT_COMBO_TRAD);
  const burguer = combo.grupos.find((gr) => gr.id === G_BURGUER_COMBO_T);
  assert.deepEqual(burguer, {
    id: G_BURGUER_COMBO_T,
    nome: 'BURGUER DO COMBO',
    min: 1,
    max: 1,
    choiceType: 'SINGLE',
    nOpcoes: 9,
    elegivel: { ok: true },
    selecionavel: { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' },
  });
  // Nenhum grupo do combo é selecionável: é isso que a tela mostra ao lado de cada opção.
  assert.deepEqual(combo.grupos.map((gr) => gr.selecionavel.ok), [false, false, false, false]);
  assert.deepEqual(combo.grupos.map((gr) => gr.elegivel.ok), combo.grupos.map((gr) => gr.min === 1 && gr.max === 1));
});

test('mesclarAdmin: TRADICIONAIS tem exatamente um grupo selecionável', () => {
  const { itens } = mesclarAdmin(catalogo(), [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO, 12)]);
  const trad = itens.find((i) => i.cwItemId === IT_TRADICIONAIS);
  assert.deepEqual(trad.config, { id: 12, modo: 'EXPANDIDO', cwGrupoPrincipalId: G_TRADICIONAL_FAVORITO });
  assert.deepEqual(trad.validacao, { ok: true });
  assert.deepEqual(trad.grupos.filter((gr) => gr.selecionavel.ok).map((gr) => gr.id), [G_TRADICIONAL_FAVORITO]);
  const favorito = trad.grupos.find((gr) => gr.id === G_TRADICIONAL_FAVORITO);
  assert.equal(favorito.nOpcoes, 9);
  assert.equal(favorito.choiceType, 'SINGLE');
  // Grupo sem teto (`max: null`) é reportado como null, não como número.
  assert.equal(trad.grupos.every((gr) => gr.max === null || Number.isFinite(gr.max)), true);
});

test('mesclarAdmin: configuração que deixou de valer aparece com o código na validação', () => {
  const { itens } = mesclarAdmin(catalogo(), [cfg(IT_TRADICIONAIS, G_MAIONESE, 3)]);
  const trad = itens.find((i) => i.cwItemId === IT_TRADICIONAIS);
  assert.deepEqual(trad.config, { id: 3, modo: 'EXPANDIDO', cwGrupoPrincipalId: G_MAIONESE });
  assert.deepEqual(trad.validacao, { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
});

test('mesclarAdmin: QUINTA DA BATATA mostra o 1–1 elegível e não selecionável', () => {
  const { itens } = mesclarAdmin(catalogo(), []);
  const quinta = itens.find((i) => i.cwItemId === IT_QUINTA);
  assert.equal(quinta.nome, 'TRADICIONAIS 🍔'); // mesmo nome do outro item: só o id distingue
  const batata = quinta.grupos.find((gr) => gr.id === G_BATATA_GRATIS);
  assert.deepEqual(batata.elegivel, { ok: true });
  assert.deepEqual(batata.selecionavel, { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' });
  assert.equal(batata.nOpcoes, 1);
  const dois = quinta.grupos.find((gr) => gr.id === G_ESCOLHA_DOIS);
  assert.deepEqual(dois.elegivel, { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
  assert.deepEqual(dois.selecionavel, { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' });
});

test('mesclarAdmin: configuração órfã sai em `orfas` com ITEM_AUSENTE', () => {
  const orfa = { id: 77, empresaId: 9, cwItemId: 4384008, modo: 'EXPANDIDO', cwGrupoPrincipalId: 111111 };
  const { itens, orfas } = mesclarAdmin(catalogo(), [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO, 1), orfa]);
  assert.deepEqual(orfas, [{
    id: 77,
    cwItemId: 4384008,
    modo: 'EXPANDIDO',
    cwGrupoPrincipalId: 111111,
    validacao: { ok: false, codigo: 'ITEM_AUSENTE' },
  }]);
  assert.equal(itens.some((i) => i.cwItemId === 4384008), false);
});

test('mesclarAdmin: item em duas categorias entra uma vez só (vale a primeira)', () => {
  const cat = variando((c) => { categoriaDe(c, CAT_MAIS_PEDIDOS).itens.push(itemDe(c, CAT_TRADICIONAIS, IT_TRADICIONAIS)); });
  const { itens } = mesclarAdmin(cat, [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO, 5)]);
  const linhas = itens.filter((i) => i.cwItemId === IT_TRADICIONAIS);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].categoria, '🥇 OS MAIS PEDIDOS');
  assert.deepEqual(linhas[0].validacao, { ok: true });
});

test('mesclarAdmin: catálogo vazio devolve listas vazias e as configurações viram órfãs', () => {
  const { itens, orfas } = mesclarAdmin({ categorias: [] }, [cfg(IT_TRADICIONAIS, G_TRADICIONAL_FAVORITO, 8)]);
  assert.deepEqual(itens, []);
  assert.equal(orfas.length, 1);
  assert.equal(orfas[0].cwItemId, IT_TRADICIONAIS);
  assert.deepEqual(mesclarAdmin(null, null), { itens: [], orfas: [] });
});
