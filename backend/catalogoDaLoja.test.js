// O catálogo da loja — testes puros do serviço neutro (node --test, ESM).
// Rodar: node --test backend/catalogoDaLoja.test.js
//
// O que estes testes defendem — e o que eles defendem é uma PAREDE:
//   1. HUB fora do ar NÃO esvazia uma TV que já estava funcionando: vale o último bom;
//   2. o último bom tem PRAZO — cardápio fóssil numa parede é pior do que board nenhum;
//   3. 200 com corpo torto não vira "catálogo vazio" (fail-closed);
//   4. loja desvinculada do CW não APAGA o cache: religar não pode custar a parede;
//   5. o cache é por EMPRESA — nunca o catálogo de uma aparece na outra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogoDaLoja, catalogoUtilizavel, limparCacheCatalogo } from './catalogoDaLoja.js';

const CATALOGO = { categorias: [{ id: 1, nome: 'Burgers', itens: [{ id: 9, nome: 'X', preco: 10 }] }] };
const OUTRO = { categorias: [{ id: 2, nome: 'Pizzas', itens: [] }] };

const ok = (catalogo = CATALOGO) => async () => ({ ok: true, data: { catalogo } });
const falha = (codigo = 'HUB_INDISPONIVEL') => async () => ({ ok: false, codigo });
const deps = (bootstrap, extra = {}) => ({ clienteIdDaEmpresa: async () => 'cli-1', bootstrap, ...extra });

test('catalogoUtilizavel: só com categorias em ARRAY', () => {
  assert.equal(catalogoUtilizavel(CATALOGO), true);
  assert.equal(catalogoUtilizavel({ categorias: [] }), true, 'loja sem itens é estado legítimo');
  for (const ruim of [null, undefined, {}, { categorias: null }, { categorias: 'x' }]) {
    assert.equal(catalogoUtilizavel(ruim), false, String(ruim));
  }
});

test('caminho feliz: vem do HUB e não está desatualizado', async () => {
  limparCacheCatalogo();
  const r = await catalogoDaLoja(1, deps(ok()));
  assert.deepEqual(r, { ok: true, catalogo: CATALOGO, desatualizado: false });
});

test('🔴 HUB fora do ar devolve o ÚLTIMO CATÁLOGO BOM, marcado como desatualizado', async () => {
  limparCacheCatalogo();
  let agoraMs = 1_000;
  const d = { clienteIdDaEmpresa: async () => 'cli-1', agora: () => agoraMs };
  await catalogoDaLoja(1, { ...d, bootstrap: ok() });
  agoraMs += 60_000;
  const r = await catalogoDaLoja(1, { ...d, bootstrap: falha() });
  assert.equal(r.ok, true, 'uma TV que já funcionava não pode apagar porque o HUB piscou');
  assert.equal(r.catalogo, CATALOGO);
  assert.equal(r.desatualizado, true);
  assert.equal(r.em, 1_000, 'a TV/admin sabe de quando é o dado');
});

test('🔴 o último bom tem PRAZO: passado o TTL, o cache não serve mais', async () => {
  limparCacheCatalogo();
  let agoraMs = 1_000;
  const d = { clienteIdDaEmpresa: async () => 'cli-1', agora: () => agoraMs, ttlMs: 10_000 };
  await catalogoDaLoja(1, { ...d, bootstrap: ok() });
  agoraMs += 9_999;
  assert.equal((await catalogoDaLoja(1, { ...d, bootstrap: falha() })).ok, true, 'dentro da janela, socorre');
  agoraMs += 2;
  const r = await catalogoDaLoja(1, { ...d, bootstrap: falha() });
  assert.deepEqual(r, { ok: false, codigo: 'HUB_INDISPONIVEL' }, 'preço de ontem numa parede é pior do que board nenhum');
});

test('sem cache e com HUB fora: falha honesta, com o código do que aconteceu', async () => {
  limparCacheCatalogo();
  assert.deepEqual(await catalogoDaLoja(1, deps(falha())), { ok: false, codigo: 'HUB_INDISPONIVEL' });
  limparCacheCatalogo();
  assert.deepEqual(await catalogoDaLoja(1, deps(falha('HUB_NAO_CONFIGURADO'))), { ok: false, codigo: 'HUB_NAO_CONFIGURADO' });
});

test('loja sem clienteId nunca vai ao HUB', async () => {
  limparCacheCatalogo();
  let bateu = false;
  const r = await catalogoDaLoja(1, {
    clienteIdDaEmpresa: async () => null,
    bootstrap: async () => { bateu = true; return { ok: true, data: { catalogo: CATALOGO } }; },
  });
  assert.deepEqual(r, { ok: false, codigo: 'CLIENTE_SEM_CW' });
  assert.equal(bateu, false);
});

test('🔴 200 com `conectado: false` NÃO apaga o cache', async () => {
  // Alguém desvincula a loja por engano no HUB: a parede não pode ficar vazia até religarem.
  limparCacheCatalogo();
  await catalogoDaLoja(1, deps(ok()));
  const r = await catalogoDaLoja(1, deps(async () => ({ ok: true, data: { conectado: false } })));
  assert.deepEqual(r, { ok: false, codigo: 'CLIENTE_SEM_CW' });
  const depois = await catalogoDaLoja(1, deps(falha()));
  assert.equal(depois.catalogo, CATALOGO, 'o último bom continua lá');
});

test('🔴 200 com corpo torto é FAIL-CLOSED, não "catálogo vazio"', async () => {
  // Tratar resposta ruim como "a loja não tem itens" faria o admin declarar toda referência
  // salva como órfã, e um clique apagaria o trabalho do gestor.
  limparCacheCatalogo();
  const r = await catalogoDaLoja(1, deps(async () => ({ ok: true, data: { catalogo: { categorias: null } } })));
  assert.deepEqual(r, { ok: false, codigo: 'CATALOGO_INDISPONIVEL' });
});

test('banco fora ao ler o clienteId é infra, não "loja sem CW"', async () => {
  limparCacheCatalogo();
  const r = await catalogoDaLoja(1, {
    clienteIdDaEmpresa: async () => { throw new Error('db'); },
    bootstrap: ok(),
  });
  assert.deepEqual(r, { ok: false, codigo: 'HUB_INDISPONIVEL' });
});

test('bootstrap que LANÇA não derruba o serviço', async () => {
  limparCacheCatalogo();
  await catalogoDaLoja(1, deps(ok()));
  const r = await catalogoDaLoja(1, deps(async () => { throw new Error('rede'); }));
  assert.equal(r.desatualizado, true);
  assert.equal(r.catalogo, CATALOGO);
});

test('🔴 o cache é POR EMPRESA — o catálogo de uma nunca aparece na outra', async () => {
  limparCacheCatalogo();
  await catalogoDaLoja(1, deps(ok(CATALOGO)));
  await catalogoDaLoja(2, deps(ok(OUTRO)));
  assert.equal((await catalogoDaLoja(1, deps(falha()))).catalogo, CATALOGO);
  assert.equal((await catalogoDaLoja(2, deps(falha()))).catalogo, OUTRO);
  // E uma empresa sem cache nenhum não herda o da vizinha.
  assert.deepEqual(await catalogoDaLoja(3, deps(falha())), { ok: false, codigo: 'HUB_INDISPONIVEL' });
});

test('o cache é ATUALIZADO a cada resposta boa', async () => {
  limparCacheCatalogo();
  await catalogoDaLoja(1, deps(ok(CATALOGO)));
  await catalogoDaLoja(1, deps(ok(OUTRO)));
  assert.equal((await catalogoDaLoja(1, deps(falha()))).catalogo, OUTRO);
});
