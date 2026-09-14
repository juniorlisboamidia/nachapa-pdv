// Os produtos da esteira da tela de espera — testes puros (node --test, ESM).
// Rodar: node --test backend/totemDestaque.test.js
//
// O que estes testes defendem:
//   1. o banco guarda ID e nada mais — preço e foto vêm SEMPRE do catálogo vivo;
//   2. item que saiu do cardápio some do vidro e APARECE no admin, marcado;
//   3. a ordem é a da lista enviada, nunca um número que o browser mandou;
//   4. nada aqui lança: catálogo torto vira lista curta, não vira tela quebrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DESTAQUES, MOTIVO_IDS, MOTIVO_LIMITE,
  idDeItem, indexarCatalogo, destaquesPublicos, destaquesParaAdmin,
  catalogoParaEscolha, validarIds, linhasParaGravar,
} from './totemDestaque.js';

const CATALOGO = {
  categorias: [
    {
      nome: 'Tradicionais',
      itens: [
        { id: 1, nome: 'X Bacon', preco: 16, imagem: 'https://cdn/x.jpg' },
        { id: 2, nome: 'X Salada', preco: 14.005, imagem: 'https://cdn/s.jpg' },
        { id: 3, nome: 'Sem foto', preco: 9, imagem: null },
      ],
    },
    {
      nome: 'Bebidas',
      itens: [
        { id: 4, nome: 'Guaraná', preco: 7, imagem: 'https://cdn/g.jpg' },
        { id: 1, nome: 'X Bacon (repetido)', preco: 99, imagem: 'https://cdn/z.jpg' },
      ],
    },
  ],
};
const linhas = (...pares) => pares.map(([cwItemId, ordem]) => ({ cwItemId, ordem }));

// ── o índice ────────────────────────────────────────────────────────────────
test('item repetido em duas categorias vale pela PRIMEIRA', () => {
  // A alternativa seria o mesmo produto entrar duas vezes na esteira por acidente de
  // catálogo — e com preço diferente, que é pior.
  const m = indexarCatalogo(CATALOGO);
  assert.equal(m.size, 4);
  assert.equal(m.get(1).nome, 'X Bacon');
  assert.equal(m.get(1).categoria, 'Tradicionais');
});

test('preço é arredondado a duas casas; preço torto vira null, nunca NaN', () => {
  assert.equal(indexarCatalogo(CATALOGO).get(2).preco, 14.01);
  const m = indexarCatalogo({ categorias: [{ itens: [{ id: 9, nome: 'x', preco: 'caro' }] }] });
  assert.equal(m.get(9).preco, null);
});

test('catálogo torto vira mapa vazio, e não exceção', () => {
  for (const v of [null, undefined, 42, 'texto', [], {}, { categorias: 'x' }]) {
    assert.equal(indexarCatalogo(v).size, 0, JSON.stringify(v));
  }
});

test('id de item: inteiro seguro e positivo, sem arredondar', () => {
  assert.equal(idDeItem(12), 12);
  assert.equal(idDeItem('12'), 12);
  // 🔴 Arredondar `12.7` para 13 gravaria o destaque em cima de OUTRO produto.
  for (const v of [12.7, 0, -1, NaN, Infinity, 1e30, null, undefined, '', 'x', {}]) {
    assert.equal(idDeItem(v), null, String(v));
  }
});

// ── o que o quiosque recebe ─────────────────────────────────────────────────
test('🔴 nome, preço e foto vêm do CATÁLOGO, nunca do que foi guardado', () => {
  // O banco só tem o id. Se um dia alguém copiar preço para lá, este teste é o que quebra.
  const fora = destaquesPublicos(CATALOGO, linhas([1, 0]));
  assert.deepEqual(fora, [{ id: 1, nome: 'X Bacon', preco: 16, imagem: 'https://cdn/x.jpg' }]);
});

test('🔴 item que saiu do cardápio some do vidro, sem limpeza e sem erro', () => {
  const fora = destaquesPublicos(CATALOGO, linhas([1, 0], [999, 1], [4, 2]));
  assert.deepEqual(fora.map((d) => d.id), [1, 4]);
});

test('🔴 sem foto não entra: retângulo vazio chama mais atenção que as fotos', () => {
  const fora = destaquesPublicos(CATALOGO, linhas([3, 0], [1, 1]));
  assert.deepEqual(fora.map((d) => d.id), [1]);
});

test('a ordem é a guardada, com desempate estável por id', () => {
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas([4, 5], [1, 1], [2, 3])).map((d) => d.id), [1, 2, 4]);
  // Mesma `ordem` nas duas: sem o segundo critério elas trocariam de lugar entre um
  // bootstrap e outro, e a esteira mudaria de arrumação sem ninguém pedir.
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas([4, 0], [1, 0])).map((d) => d.id), [1, 4]);
});

test('o teto corta, e corta DEPOIS de descartar órfão e sem-foto', () => {
  // Cortar antes deixaria a esteira mais curta do que precisa por causa de um item que nem
  // ia aparecer.
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas([3, 0], [1, 1], [4, 2]), 2).map((d) => d.id), [1, 4]);
  assert.equal(MAX_DESTAQUES, 12);
});

test('lista vazia é resposta válida — a vitrine desenha só a metade de cima', () => {
  assert.deepEqual(destaquesPublicos(CATALOGO, []), []);
  assert.deepEqual(destaquesPublicos(CATALOGO, null), []);
  assert.deepEqual(destaquesPublicos(null, linhas([1, 0])), []);
  assert.deepEqual(destaquesPublicos(), []);
});

// ── o que o admin recebe ────────────────────────────────────────────────────
test('🔴 o admin vê TODOS, inclusive os que o vidro pula — marcados', () => {
  // No quiosque o silêncio é o certo; aqui ele esconderia da loja que ela escolheu três e
  // só uma está no ar.
  const fora = destaquesParaAdmin(CATALOGO, linhas([1, 0], [999, 1], [3, 2]));
  assert.equal(fora.length, 3);
  assert.deepEqual(fora.map((d) => d.posicao), [1, 2, 3]);
  assert.deepEqual(fora.map((d) => d.orfao), [false, true, false]);
  assert.deepEqual(fora.map((d) => d.semFoto), [false, false, true]);
  // Órfão e sem-foto são separados porque as saídas são diferentes: um se resolve
  // removendo, o outro se resolve no Cardápio Web.
  assert.equal(fora[1].nome, null, 'do órfão só se sabe o id');
  assert.equal(fora[2].nome, 'Sem foto');
});

test('a lista de escolha traz o catálogo inteiro, ordenado por nome', () => {
  const c = catalogoParaEscolha(CATALOGO);
  assert.deepEqual(c.map((i) => i.nome), ['Guaraná', 'Sem foto', 'X Bacon', 'X Salada']);
  // O sem-foto vai junto: escondê-lo faria a loja procurar um produto que está no cardápio
  // e não achar na lista, sem entender por quê.
  assert.equal(c.find((i) => i.nome === 'Sem foto').imagem, null);
});

// ── a entrada do PUT ────────────────────────────────────────────────────────
test('a ordem sai da POSIÇÃO na lista, nunca de um número enviado pelo browser', () => {
  const r = validarIds([4, 1, 2]);
  assert.deepEqual(r.ids, [4, 1, 2]);
  assert.deepEqual(linhasParaGravar(7, r.ids), [
    { empresaId: 7, cwItemId: 4, ordem: 0 },
    { empresaId: 7, cwItemId: 1, ordem: 1 },
    { empresaId: 7, cwItemId: 2, ordem: 2 },
  ]);
});

test('lista vazia é como a loja DESLIGA a esteira', () => {
  assert.deepEqual(validarIds([]), { ok: true, ids: [], erros: [] });
  assert.deepEqual(linhasParaGravar(7, []), []);
});

test('repetido é ignorado; id torto é RECUSADO', () => {
  // A intenção de um clique duplo é inequívoca — recusar o envio inteiro por causa dela
  // seria hostil. Já um id torto não dá para adivinhar.
  const r = validarIds([1, 1, 2]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, [1, 2]);
  const t = validarIds([1, 'x', 2.5]);
  assert.equal(t.ok, false);
  assert.equal(t.erros.length, 2);
  assert.equal(t.erros[0].motivo, MOTIVO_IDS);
});

test('acima do teto é recusado, com motivo próprio', () => {
  const muitos = Array.from({ length: MAX_DESTAQUES + 1 }, (_, i) => i + 1);
  const r = validarIds(muitos);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.motivo === MOTIVO_LIMITE));
  assert.equal(validarIds(muitos.slice(0, MAX_DESTAQUES)).ok, true, 'o teto exato passa');
});

test('o que não é lista é recusado — nunca vira lista vazia em silêncio', () => {
  // Silêncio aqui apagaria a escolha da loja: um corpo torto viraria "grave zero destaques".
  for (const v of [null, undefined, {}, 'x', 42]) {
    const r = validarIds(v);
    assert.equal(r.ok, false, String(v));
    assert.equal(r.erros[0].motivo, MOTIVO_IDS);
  }
});
