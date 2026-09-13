// Progressão automática entre grupos — testes puros (node --test, ESM).
// Rodar: node frontend/src/components/totemFoco.test.js
//
// A tabela da spec §8.1 está aqui caso a caso. O que estes testes defendem é o
// que mais incomoda num totem: a tela se mexer sozinha na hora errada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atingiuMax, proximoFoco, destinoDeRolagem, categoriaPorRolagem } from './totemFoco.js';

const g = (id, extra = {}) => ({ id, nome: `Grupo ${id}`, min: 0, max: null, status: 'ACTIVE', opcoes: [], ...extra });
const sel = (...ids) => ids.map((id) => ({ opcaoId: id, qtd: 1 }));

// ── atingiuMax: a tabela da spec ────────────────────────────────────────────
test('1–1: escolheu 1 → avança', () => {
  assert.equal(atingiuMax(g(1, { min: 1, max: 1 }), [], sel(10)), true);
});

test('2–2: escolheu 1 → permanece; escolheu 2 → avança', () => {
  const grupo = g(1, { min: 2, max: 2 });
  assert.equal(atingiuMax(grupo, [], sel(10)), false);
  assert.equal(atingiuMax(grupo, sel(10), sel(10, 11)), true);
});

test('0–1: escolheu 1 → avança', () => {
  assert.equal(atingiuMax(g(1, { min: 0, max: 1 }), [], sel(10)), true);
});

test('0–4: só avança ao atingir 4', () => {
  const grupo = g(1, { min: 0, max: 4 });
  assert.equal(atingiuMax(grupo, sel(10, 11), sel(10, 11, 12)), false);
  assert.equal(atingiuMax(grupo, sel(10, 11, 12), sel(10, 11, 12, 13)), true);
});

test('sem teto (max null) nunca avança', () => {
  assert.equal(atingiuMax(g(1, { min: 1, max: null }), [], sel(10)), false);
  assert.equal(atingiuMax(g(1, { min: 1 }), sel(10), sel(10, 11)), false);
});

test('desmarcar nunca avança, mesmo saindo do máximo', () => {
  assert.equal(atingiuMax(g(1, { min: 0, max: 2 }), sel(10, 11), sel(10)), false);
});

test('montagem da tela não avança: sem transição, nada acontece', () => {
  // Editar uma linha já completa chega com antes === depois.
  const grupo = g(1, { min: 1, max: 1 });
  assert.equal(atingiuMax(grupo, sel(10), sel(10)), false);
});

test('SINGLE já completo trocando de opção não avança (max → max)', () => {
  assert.equal(atingiuMax(g(1, { min: 1, max: 1 }), sel(10), sel(11)), false);
});

test('SUMMABLE conta quantidade, não número de linhas', () => {
  const grupo = g(1, { min: 0, max: 3 });
  assert.equal(atingiuMax(grupo, [{ opcaoId: 10, qtd: 2 }], [{ opcaoId: 10, qtd: 3 }]), true);
  assert.equal(atingiuMax(grupo, [{ opcaoId: 10, qtd: 1 }], [{ opcaoId: 10, qtd: 2 }]), false);
});

test('grupo com teto 0 nunca avança', () => {
  assert.equal(atingiuMax(g(1, { min: 0, max: 0 }), [], []), false);
});

test('grupo ausente ou lixo não quebra', () => {
  assert.equal(atingiuMax(null, [], sel(10)), false);
  assert.equal(atingiuMax(g(1, { max: 'x' }), [], sel(10)), false);
});

// ── proximoFoco ─────────────────────────────────────────────────────────────
// Ordem do CW: MAIONESE (opcional), BEBIDA, ACOMPANHAMENTO.
const MAIONESE = g('maio', { min: 0, max: 2 });
const BEBIDA = g(964820, { min: 1, max: 1 });
const ACOMP = g(964821, { min: 1, max: 1 });
const COMBO = [MAIONESE, BEBIDA, ACOMP];

test('do primeiro grupo vai para o seguinte, na ordem do CW', () => {
  assert.deepEqual(proximoFoco(COMBO, 'maio'), { tipo: 'GRUPO', id: 964820 });
  assert.deepEqual(proximoFoco(COMBO, 964820), { tipo: 'GRUPO', id: 964821 });
});

test('do último grupo o destino é o botão de adicionar', () => {
  assert.deepEqual(proximoFoco(COMBO, 964821), { tipo: 'CTA' });
});

test('grupo em falta é pulado — ele não aceita toque', () => {
  const emFalta = g(555, { min: 0, max: 1, status: 'MISSING' });
  assert.deepEqual(proximoFoco([BEBIDA, emFalta, ACOMP], 964820), { tipo: 'GRUPO', id: 964821 });
});

test('se todos os seguintes estão em falta, vai para o botão', () => {
  const emFalta = g(555, { min: 0, max: 1, status: 'MISSING' });
  assert.deepEqual(proximoFoco([BEBIDA, emFalta], 964820), { tipo: 'CTA' });
});

test('id em string casa com id numérico do catálogo', () => {
  assert.deepEqual(proximoFoco(COMBO, '964820'), { tipo: 'GRUPO', id: 964821 });
});

test('grupo fora da lista manda o foco para o botão, não para outro grupo', () => {
  assert.deepEqual(proximoFoco(COMBO, 999), { tipo: 'CTA' });
  assert.deepEqual(proximoFoco(null, 1), { tipo: 'CTA' });
});

// ── destinoDeRolagem ────────────────────────────────────────────────────────
// O defeito que estes testes fecham: a conta antiga somava a altura do cabeçalho
// (o offsetParent dos blocos é a raiz, não o container rolável) e parava ~96px
// abaixo do grupo, escondendo o nome e a regra dele.
test('alvo abaixo da dobra: rola até ele, com a margem', () => {
  const d = destinoDeRolagem({ topoRelativo: 800, alturaAlvo: 300, scrollAtual: 0, alturaVisivel: 900 });
  assert.equal(d, 784);
});

test('alvo inteiro visível: não rola', () => {
  assert.equal(destinoDeRolagem({ topoRelativo: 100, alturaAlvo: 200, scrollAtual: 400, alturaVisivel: 900 }), null);
});

test('alvo acima (rolar para trás): o avanço automático recusa', () => {
  assert.equal(destinoDeRolagem({ topoRelativo: -300, alturaAlvo: 200, scrollAtual: 900, alturaVisivel: 600 }), null);
});

test('alvo acima: um toque explícito do cliente pode voltar', () => {
  const d = destinoDeRolagem({ topoRelativo: -300, alturaAlvo: 200, scrollAtual: 900, alturaVisivel: 600, permitirVoltar: true });
  assert.equal(d, 584);
});

test('nunca devolve destino negativo', () => {
  assert.equal(destinoDeRolagem({ topoRelativo: -5, alturaAlvo: 50, scrollAtual: 0, alturaVisivel: 600, permitirVoltar: true }), 0);
});

test('alvo cortado embaixo conta como não visível', () => {
  const d = destinoDeRolagem({ topoRelativo: 500, alturaAlvo: 300, scrollAtual: 200, alturaVisivel: 600 });
  assert.equal(d, 684);
});

test('entrada inválida não move a tela', () => {
  assert.equal(destinoDeRolagem({ topoRelativo: undefined }), null);
  assert.equal(destinoDeRolagem(), null);
});

/* ── catálogo contínuo: qual categoria a sidebar destaca ────────────────── */
const SECOES = [
  { id: 'a', topo: 0 },
  { id: 'b', topo: 1000 },
  { id: 'c', topo: 2400 },
]

test('categoriaPorRolagem: no topo vale a primeira', () => {
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 0, alturaVisivel: 800, alturaTotal: 3000 }), 'a')
})

test('categoriaPorRolagem: vale a última seção que passou da linha de leitura', () => {
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 900, alturaVisivel: 800, alturaTotal: 4000 }), 'a')
  /* 976 + 24 = 1000: o topo de `b` encosta na linha e ela assume. */
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 976, alturaVisivel: 800, alturaTotal: 4000 }), 'b')
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 1500, alturaVisivel: 800, alturaTotal: 4000 }), 'b')
})

test('🔴 no fim da rolagem vale a última — categoria curta no rodapé nunca alcança a linha', () => {
  /* `c` começa em 2400 e a rolagem só chega a 2200: sem a regra do fim, `b`
     ficaria destacada com `c` inteira na tela. */
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 2200, alturaVisivel: 800, alturaTotal: 3000 }), 'c')
})

test('categoriaPorRolagem: entrada torta não derruba a sidebar', () => {
  assert.equal(categoriaPorRolagem(), null)
  assert.equal(categoriaPorRolagem({ secoes: [] }), null)
  assert.equal(categoriaPorRolagem({ secoes: [{ id: null, topo: 0 }] }), null)
  assert.equal(categoriaPorRolagem({ secoes: [{ id: 'x', topo: 'oi' }] }), null)
  /* Sem medida de altura total a regra do fim não se aplica, e a leitura
     continua pela linha. */
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 1200 }), 'b')
})
