// Os produtos da esteira da tela de espera — testes puros (node --test, ESM).
// Rodar: node --test backend/totemDestaque.test.js
//
// O que estes testes defendem:
//   1. a esteira fala a língua do catálogo PROJETADO: chave `item:…` / `opcao:…`, para os
//      complementos expandidos poderem entrar — sem isso a loja não chega aos doze;
//   2. o banco guarda a chave e nada mais — preço e foto vêm SEMPRE do catálogo vivo;
//   3. produto que saiu, sem foto ou em falta some do vidro e APARECE no admin, marcado;
//   4. a ordem é a da lista enviada, nunca um número que o browser mandou;
//   5. nada aqui lança: catálogo torto vira lista curta, não vira tela quebrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DESTAQUES, MOTIVO_IDS, MOTIVO_LIMITE,
  chaveDeProduto, indexarCatalogo, destaquesPublicos, destaquesParaAdmin,
  catalogoParaEscolha, validarChaves, linhasParaGravar,
} from './totemDestaque.js';

// Um catálogo já PROJETADO: itens base e opções expandidas convivem como produtos.
const CATALOGO = {
  categorias: [
    {
      nome: 'Tradicionais',
      itens: [
        { id: 'item:1', nome: 'X Bacon', preco: 16, imagem: 'https://cdn/x.jpg', status: 'ACTIVE' },
        { id: 'item:2', nome: 'X Salada', preco: 14.005, imagem: 'https://cdn/s.jpg', status: 'ACTIVE' },
        { id: 'item:3', nome: 'Sem foto', preco: 9, imagem: null, status: 'ACTIVE' },
        { id: 'item:5', nome: 'Em falta', preco: 20, imagem: 'https://cdn/f.jpg', status: 'MISSING' },
      ],
    },
    {
      nome: 'Combos',
      itens: [
        // Um COMPLEMENTO expandido: a batata que vive dentro do combo 7, grupo 2.
        { id: 'opcao:7:2:40', nome: 'Batata média', preco: 12.5, imagem: 'https://cdn/b.jpg', status: 'ACTIVE' },
        { id: 'item:1', nome: 'X Bacon (repetido)', preco: 99, imagem: 'https://cdn/z.jpg', status: 'ACTIVE' },
      ],
    },
  ],
};
const linhas = (...pares) => pares.map(([chave, ordem]) => ({ chave, ordem }));

// ── a chave ─────────────────────────────────────────────────────────────────
test('🔴 a chave é a do catálogo projetado: item E opção expandida', () => {
  // Era só cwItemId numérico, e isso deixava os complementos fora do alcance — a batata,
  // o refrigerante, o artesanal dentro do combo não são itens, são opções.
  assert.equal(chaveDeProduto('item:12'), 'item:12');
  assert.equal(chaveDeProduto('opcao:12:5:88'), 'opcao:12:5:88');
  for (const v of [12, '12', 'item:', 'item:x', 'opcao:1:2', ' item:1', 'item:1 ', 'ITEM:1', null, undefined, {}, []]) {
    assert.equal(chaveDeProduto(v), null, JSON.stringify(v));
  }
});

// ── o índice ────────────────────────────────────────────────────────────────
test('produto repetido em duas categorias vale pela PRIMEIRA', () => {
  const m = indexarCatalogo(CATALOGO);
  assert.equal(m.size, 5);
  assert.equal(m.get('item:1').nome, 'X Bacon');
  assert.equal(m.get('item:1').categoria, 'Tradicionais');
  assert.equal(m.get('opcao:7:2:40').nome, 'Batata média', 'o complemento expandido está no índice');
});

test('preço é arredondado a duas casas; preço torto vira null, nunca NaN', () => {
  assert.equal(indexarCatalogo(CATALOGO).get('item:2').preco, 14.01);
  const m = indexarCatalogo({ categorias: [{ itens: [{ id: 'item:9', nome: 'x', preco: 'caro' }] }] });
  assert.equal(m.get('item:9').preco, null);
});

test('catálogo torto vira mapa vazio, e não exceção', () => {
  for (const v of [null, undefined, 42, 'texto', [], {}, { categorias: 'x' }, { categorias: [{ itens: [{ id: 12 }] }] }]) {
    assert.equal(indexarCatalogo(v).size, 0, JSON.stringify(v));
  }
});

// ── o que o quiosque recebe ─────────────────────────────────────────────────
test('🔴 nome, preço e foto vêm do CATÁLOGO, nunca do que foi guardado', () => {
  // O banco só tem a chave. Se um dia alguém copiar preço para lá, este teste é o que quebra.
  const fora = destaquesPublicos(CATALOGO, linhas(['item:1', 0]));
  assert.deepEqual(fora, [{ id: 'item:1', nome: 'X Bacon', preco: 16, imagem: 'https://cdn/x.jpg' }]);
});

test('🔴 complemento expandido entra na esteira como qualquer produto', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['opcao:7:2:40', 0]));
  assert.deepEqual(fora.map((d) => d.id), ['opcao:7:2:40']);
  assert.equal(fora[0].preco, 12.5);
});

test('🔴 produto que saiu do cardápio some do vidro, sem limpeza e sem erro', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:1', 0], ['item:999', 1], ['opcao:7:2:40', 2]));
  assert.deepEqual(fora.map((d) => d.id), ['item:1', 'opcao:7:2:40']);
});

test('🔴 sem foto não entra, e EM FALTA também não', () => {
  // Retângulo vazio chama atenção pela razão errada; produto em falta é promessa que a
  // loja não fez.
  const fora = destaquesPublicos(CATALOGO, linhas(['item:3', 0], ['item:5', 1], ['item:1', 2]));
  assert.deepEqual(fora.map((d) => d.id), ['item:1']);
});

test('a ordem é a guardada, com desempate estável pela chave', () => {
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas(['item:2', 5], ['item:1', 1], ['opcao:7:2:40', 3])).map((d) => d.id), ['item:1', 'opcao:7:2:40', 'item:2']);
  // Mesma `ordem` nas duas: sem o segundo critério elas trocariam de lugar entre um
  // bootstrap e outro, e a esteira mudaria de arrumação sem ninguém pedir.
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas(['item:2', 0], ['item:1', 0])).map((d) => d.id), ['item:1', 'item:2']);
});

test('o teto corta, e corta DEPOIS de descartar o que não entra', () => {
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas(['item:3', 0], ['item:1', 1], ['item:2', 2]), 2).map((d) => d.id), ['item:1', 'item:2']);
  assert.equal(MAX_DESTAQUES, 12);
});

test('lista vazia é resposta válida — a vitrine desenha só a metade de cima', () => {
  assert.deepEqual(destaquesPublicos(CATALOGO, []), []);
  assert.deepEqual(destaquesPublicos(CATALOGO, null), []);
  assert.deepEqual(destaquesPublicos(null, linhas(['item:1', 0])), []);
  assert.deepEqual(destaquesPublicos(), []);
});

// ── o que o admin recebe ────────────────────────────────────────────────────
test('🔴 o admin vê TODOS, inclusive os que o vidro pula — marcados', () => {
  const fora = destaquesParaAdmin(CATALOGO, linhas(['item:1', 0], ['item:999', 1], ['item:3', 2], ['item:5', 3]));
  assert.equal(fora.length, 4);
  assert.deepEqual(fora.map((d) => d.posicao), [1, 2, 3, 4]);
  assert.deepEqual(fora.map((d) => d.orfao), [false, true, false, false]);
  assert.deepEqual(fora.map((d) => d.semFoto), [false, false, true, false]);
  assert.deepEqual(fora.map((d) => d.emFalta), [false, false, false, true]);
  // Três motivos separados porque as saídas são diferentes: órfão se resolve removendo;
  // sem foto e em falta, no Cardápio Web.
  assert.equal(fora[1].nome, null, 'do órfão só se sabe a chave');
  assert.equal(fora[1].chave, 'item:999');
});

test('a lista de escolha traz o catálogo inteiro, ordenado por nome, com o complemento', () => {
  const c = catalogoParaEscolha(CATALOGO);
  assert.deepEqual(c.map((i) => i.nome), ['Batata média', 'Em falta', 'Sem foto', 'X Bacon', 'X Salada']);
  assert.equal(c.find((i) => i.nome === 'Sem foto').imagem, null);
  assert.equal(c.find((i) => i.nome === 'Em falta').emFalta, true);
});

// ── a entrada do PUT ────────────────────────────────────────────────────────
test('a ordem sai da POSIÇÃO na lista, nunca de um número enviado pelo browser', () => {
  const r = validarChaves(['opcao:7:2:40', 'item:1', 'item:2']);
  assert.deepEqual(r.chaves, ['opcao:7:2:40', 'item:1', 'item:2']);
  assert.deepEqual(linhasParaGravar(7, r.chaves), [
    { empresaId: 7, chave: 'opcao:7:2:40', ordem: 0 },
    { empresaId: 7, chave: 'item:1', ordem: 1 },
    { empresaId: 7, chave: 'item:2', ordem: 2 },
  ]);
});

test('lista vazia é como a loja DESLIGA a esteira', () => {
  assert.deepEqual(validarChaves([]), { ok: true, chaves: [], erros: [] });
  assert.deepEqual(linhasParaGravar(7, []), []);
});

test('repetido é ignorado; chave torta é RECUSADA', () => {
  const r = validarChaves(['item:1', 'item:1', 'item:2']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.chaves, ['item:1', 'item:2']);
  // Um id numérico cru é exatamente o formato antigo: tem de ser recusado, não convertido,
  // senão um cliente velho gravaria chaves que nunca casariam com nada.
  const t = validarChaves(['item:1', 12, 'x']);
  assert.equal(t.ok, false);
  assert.equal(t.erros.length, 2);
  assert.equal(t.erros[0].motivo, MOTIVO_IDS);
});

test('acima do teto é recusado, com motivo próprio', () => {
  const muitos = Array.from({ length: MAX_DESTAQUES + 1 }, (_, i) => `item:${i + 1}`);
  const r = validarChaves(muitos);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.motivo === MOTIVO_LIMITE));
  assert.equal(validarChaves(muitos.slice(0, MAX_DESTAQUES)).ok, true, 'o teto exato passa');
});

test('o que não é lista é recusado — nunca vira lista vazia em silêncio', () => {
  for (const v of [null, undefined, {}, 'x', 42]) {
    const r = validarChaves(v);
    assert.equal(r.ok, false, String(v));
    assert.equal(r.erros[0].motivo, MOTIVO_IDS);
  }
});
