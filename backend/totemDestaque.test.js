// Os produtos das esteiras da tela de espera — testes puros (node --test, ESM).
// Rodar: node --test backend/totemDestaque.test.js
//
// O que estes testes defendem:
//   1. o índice lê `produtos` do catálogo PROJETADO — ler `itens` (o cru) devolve ids
//      numéricos que não são chaves, e a lista de escolha sai vazia (foi um bug real);
//   2. as chaves são `item:…` / `opcao:…`, para os complementos expandidos entrarem;
//   3. DUAS esteiras, separadas: um produto fica numa só, cada uma com teto próprio;
//   4. o banco guarda chave, esteira e ordem — preço e foto vêm SEMPRE do catálogo;
//   5. órfão, sem foto e em falta somem do vidro e APARECEM no admin, marcados;
//   6. nada aqui lança: catálogo torto vira lista curta, não vira tela quebrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTEIRAS, ESTEIRA_PADRAO, MAX_POR_ESTEIRA, MAX_DESTAQUES, MOTIVO_IDS, MOTIVO_LIMITE,
  chaveDeProduto, normalizarEsteira, indexarCatalogo, destaquesPublicos, destaquesParaAdmin,
  catalogoParaEscolha, validarEsteiras, linhasParaGravar,
} from './totemDestaque.js';

// Um catálogo já PROJETADO: cada categoria tem `produtos` (o resultado) e `itens` (o cru).
const CATALOGO = {
  categorias: [
    {
      nome: 'Tradicionais',
      itens: [{ id: 1, nome: 'cru — não deve ser lido' }],
      produtos: [
        { id: 'item:1', nome: 'X Bacon', preco: 16, imagem: 'https://cdn/x.jpg', status: 'ACTIVE' },
        { id: 'item:2', nome: 'X Salada', preco: 14.005, imagem: 'https://cdn/s.jpg', status: 'ACTIVE' },
        { id: 'item:3', nome: 'Sem foto', preco: 9, imagem: null, status: 'ACTIVE' },
        { id: 'item:5', nome: 'Em falta', preco: 20, imagem: 'https://cdn/f.jpg', status: 'MISSING' },
      ],
    },
    {
      nome: 'Combos',
      itens: [],
      produtos: [
        { id: 'opcao:7:2:40', nome: 'Batata média', preco: 12.5, imagem: 'https://cdn/b.jpg', status: 'ACTIVE' },
        { id: 'item:1', nome: 'X Bacon (repetido)', preco: 99, imagem: 'https://cdn/z.jpg', status: 'ACTIVE' },
      ],
    },
  ],
};
const linhas = (...triplas) => triplas.map(([chave, esteira, ordem]) => ({ chave, esteira, ordem }));

// ── a chave e a esteira ─────────────────────────────────────────────────────
test('🔴 a chave é a do catálogo projetado: item E opção expandida', () => {
  assert.equal(chaveDeProduto('item:12'), 'item:12');
  assert.equal(chaveDeProduto('opcao:12:5:88'), 'opcao:12:5:88');
  for (const v of [12, '12', 'item:', 'item:x', 'opcao:1:2', ' item:1', 'ITEM:1', null, undefined, {}, []]) {
    assert.equal(chaveDeProduto(v), null, JSON.stringify(v));
  }
});

test('duas esteiras, teto de dez em cada, total derivado', () => {
  assert.deepEqual([...ESTEIRAS], ['SUPERIOR', 'INFERIOR']);
  assert.equal(ESTEIRA_PADRAO, 'SUPERIOR');
  assert.equal(MAX_POR_ESTEIRA, 10);
  assert.equal(MAX_DESTAQUES, 20, 'o total é 10 × 2, nunca um número solto');
  assert.equal(normalizarEsteira('INFERIOR'), 'INFERIOR');
  for (const v of ['inferior', 'MEIO', '', null, undefined, 1]) assert.equal(normalizarEsteira(v), null, String(v));
});

// ── o índice ────────────────────────────────────────────────────────────────
test('🔴 o índice lê `produtos`, e NUNCA `itens`', () => {
  // Foi o bug que deixou a lista de escolha vazia em produção: `itens` é o cru, com ids
  // numéricos que não são chaves.
  const m = indexarCatalogo(CATALOGO);
  assert.equal(m.size, 5);
  assert.equal(m.get('item:1').nome, 'X Bacon', 'vale a primeira categoria');
  assert.equal(m.get('opcao:7:2:40').nome, 'Batata média', 'o complemento expandido está no índice');
  assert.equal(indexarCatalogo({ categorias: [{ itens: [{ id: 'item:9', nome: 'só em itens' }] }] }).size, 0);
});

test('preço é arredondado a duas casas; preço torto vira null, nunca NaN', () => {
  assert.equal(indexarCatalogo(CATALOGO).get('item:2').preco, 14.01);
  const m = indexarCatalogo({ categorias: [{ produtos: [{ id: 'item:9', nome: 'x', preco: 'caro' }] }] });
  assert.equal(m.get('item:9').preco, null);
});

test('catálogo torto vira mapa vazio, e não exceção', () => {
  for (const v of [null, undefined, 42, 'texto', [], {}, { categorias: 'x' }, { categorias: [{ produtos: [{ id: 12 }] }] }]) {
    assert.equal(indexarCatalogo(v).size, 0, JSON.stringify(v));
  }
});

// ── o que o quiosque recebe ─────────────────────────────────────────────────
test('🔴 nome, preço e foto vêm do CATÁLOGO, nunca do que foi guardado', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:1', 'SUPERIOR', 0]));
  assert.deepEqual(fora, {
    superior: [{ id: 'item:1', nome: 'X Bacon', preco: 16, imagem: 'https://cdn/x.jpg' }],
    inferior: [],
  });
});

test('🔴 as esteiras NÃO se misturam: cada linha vai para a sua', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:1', 'SUPERIOR', 0], ['opcao:7:2:40', 'INFERIOR', 0], ['item:2', 'SUPERIOR', 1]));
  assert.deepEqual(fora.superior.map((d) => d.id), ['item:1', 'item:2']);
  assert.deepEqual(fora.inferior.map((d) => d.id), ['opcao:7:2:40']);
});

test('esteira torta guardada no banco cai na padrão, não derruba', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:1', 'MEIO', 0], ['item:2', undefined, 1]));
  assert.deepEqual(fora.superior.map((d) => d.id), ['item:1', 'item:2']);
});

test('🔴 órfão, sem foto e em falta somem do vidro, sem limpeza e sem erro', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:3', 'SUPERIOR', 0], ['item:999', 'SUPERIOR', 1], ['item:5', 'SUPERIOR', 2], ['item:1', 'SUPERIOR', 3]));
  assert.deepEqual(fora.superior.map((d) => d.id), ['item:1']);
});

test('a ordem é a guardada por esteira, com desempate estável pela chave', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:2', 'SUPERIOR', 5], ['item:1', 'SUPERIOR', 1], ['opcao:7:2:40', 'SUPERIOR', 3]));
  assert.deepEqual(fora.superior.map((d) => d.id), ['item:1', 'opcao:7:2:40', 'item:2']);
  assert.deepEqual(destaquesPublicos(CATALOGO, linhas(['item:2', 'SUPERIOR', 0], ['item:1', 'SUPERIOR', 0])).superior.map((d) => d.id), ['item:1', 'item:2']);
});

test('o teto é POR esteira e corta depois de descartar o que não entra', () => {
  const fora = destaquesPublicos(CATALOGO, linhas(['item:3', 'SUPERIOR', 0], ['item:1', 'SUPERIOR', 1], ['item:2', 'SUPERIOR', 2], ['opcao:7:2:40', 'INFERIOR', 0]), 2);
  assert.deepEqual(fora.superior.map((d) => d.id), ['item:1', 'item:2']);
  assert.deepEqual(fora.inferior.map((d) => d.id), ['opcao:7:2:40']);
});

test('esteira vazia é resposta válida — a vitrine desenha só a metade de cima', () => {
  assert.deepEqual(destaquesPublicos(CATALOGO, []), { superior: [], inferior: [] });
  assert.deepEqual(destaquesPublicos(CATALOGO, null), { superior: [], inferior: [] });
  assert.deepEqual(destaquesPublicos(null, linhas(['item:1', 'SUPERIOR', 0])), { superior: [], inferior: [] });
  assert.deepEqual(destaquesPublicos(), { superior: [], inferior: [] });
});

// ── o que o admin recebe ────────────────────────────────────────────────────
test('🔴 o admin vê TODOS, por esteira, inclusive os que o vidro pula — marcados', () => {
  const fora = destaquesParaAdmin(CATALOGO, linhas(['item:1', 'SUPERIOR', 0], ['item:999', 'SUPERIOR', 1], ['item:3', 'INFERIOR', 0], ['item:5', 'INFERIOR', 1]));
  assert.deepEqual(fora.superior.map((d) => [d.posicao, d.orfao]), [[1, false], [2, true]]);
  assert.deepEqual(fora.inferior.map((d) => [d.posicao, d.semFoto, d.emFalta]), [[1, true, false], [2, false, true]]);
  assert.equal(fora.superior[1].nome, null, 'do órfão só se sabe a chave');
  assert.equal(fora.superior[1].chave, 'item:999');
});

test('a lista de escolha traz o catálogo inteiro, ordenado por nome, com o complemento', () => {
  const c = catalogoParaEscolha(CATALOGO);
  assert.deepEqual(c.map((i) => i.nome), ['Batata média', 'Em falta', 'Sem foto', 'X Bacon', 'X Salada']);
  assert.equal(c.find((i) => i.nome === 'Sem foto').imagem, null);
  assert.equal(c.find((i) => i.nome === 'Em falta').emFalta, true);
});

// ── a entrada do PUT ────────────────────────────────────────────────────────
test('a ordem sai da POSIÇÃO em cada lista, e a esteira vai junto na linha', () => {
  const r = validarEsteiras({ superior: ['opcao:7:2:40', 'item:1'], inferior: ['item:2'] });
  assert.equal(r.ok, true);
  assert.deepEqual(linhasParaGravar(7, r.esteiras), [
    { empresaId: 7, chave: 'opcao:7:2:40', esteira: 'SUPERIOR', ordem: 0 },
    { empresaId: 7, chave: 'item:1', esteira: 'SUPERIOR', ordem: 1 },
    { empresaId: 7, chave: 'item:2', esteira: 'INFERIOR', ordem: 0 },
  ]);
});

test('🔴 um produto não fica nas duas esteiras: vale a primeira em que apareceu', () => {
  const r = validarEsteiras({ superior: ['item:1'], inferior: ['item:1', 'item:2'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.esteiras, { SUPERIOR: ['item:1'], INFERIOR: ['item:2'] });
});

test('lista ausente vale vazia — mandar só a superior DESLIGA a inferior', () => {
  const r = validarEsteiras({ superior: ['item:1'] });
  assert.deepEqual(r.esteiras, { SUPERIOR: ['item:1'], INFERIOR: [] });
  assert.deepEqual(validarEsteiras({}), { ok: true, esteiras: { SUPERIOR: [], INFERIOR: [] }, erros: [] });
});

test('repetido na mesma esteira é ignorado; chave torta é RECUSADA', () => {
  assert.deepEqual(validarEsteiras({ superior: ['item:1', 'item:1', 'item:2'] }).esteiras.SUPERIOR, ['item:1', 'item:2']);
  const t = validarEsteiras({ superior: ['item:1', 12, 'x'] });
  assert.equal(t.ok, false);
  assert.equal(t.erros.length, 2);
  assert.equal(t.erros[0].motivo, MOTIVO_IDS);
});

test('acima do teto POR ESTEIRA é recusado, apontando qual', () => {
  const onze = Array.from({ length: MAX_POR_ESTEIRA + 1 }, (_, i) => `item:${i + 1}`);
  const r = validarEsteiras({ inferior: onze });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erros, [{ chave: 'inferior', motivo: MOTIVO_LIMITE }]);
  assert.equal(validarEsteiras({ superior: onze.slice(0, MAX_POR_ESTEIRA), inferior: onze.slice(0, MAX_POR_ESTEIRA).map((c) => c + '0') }).ok, true, 'dez em cada passa');
});

test('o que não é objeto de esteiras é recusado — nunca vira "grave zero" em silêncio', () => {
  for (const v of [null, undefined, [], 'x', 42]) {
    const r = validarEsteiras(v);
    assert.equal(r.ok, false, String(v));
    assert.equal(r.erros[0].motivo, MOTIVO_IDS);
  }
  assert.equal(validarEsteiras({ superior: 'item:1' }).ok, false, 'lista que não é lista');
});
