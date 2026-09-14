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
/* `topo` é a posição do TÍTULO de cada categoria (é o que a tela mede) e `alturaTitulo`
   é o tamanho dele — a régua usa os dois para decidir quando o título "chegou" ao topo. */
const SECOES = [
  { id: 'a', topo: 0, alturaTitulo: 40 },
  { id: 'b', topo: 1000, alturaTitulo: 40 },
  { id: 'c', topo: 2400, alturaTitulo: 40 },
]

test('categoriaPorRolagem: no topo vale a primeira', () => {
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 0, alturaVisivel: 800, alturaTotal: 3000 }), 'a')
})

test('🔴 a categoria acende quando o título CHEGA ao topo, não quando ele sai', () => {
  /* O título de `b` está em 1000 e mede 40. Com folga de 16, a marca é 56: `b` assume
     quando o título dela está a 56px ou menos da borda de cima — ou seja, quando ele
     encosta no topo, ainda inteiro e legível na tela.

     TRÊS tentativas erraram antes desta, todas na mesma direção — a régua pedia mais
     rolagem do que o olho:
       · topo da SEÇÃO com linha a 24px (o título tem 30px de respiro acima);
       · linha a 28% da altura, que consertou o atraso e criou adiantamento;
       · topo do TÍTULO com linha a 8px, que ainda exigia o título sair da tela. */
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 900, alturaVisivel: 800, alturaTotal: 4000 }), 'a',
    'o título de `b` está 100px abaixo da borda: ainda é `a`')
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 944, alturaVisivel: 800, alturaTotal: 4000 }), 'b',
    'a 56px da borda o título chegou, e `b` assume com ele ainda visível')
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 1500, alturaVisivel: 800, alturaTotal: 4000 }), 'b')
})

test('🔴 título maior antecipa a troca na mesma medida — a régua sai do conteúdo', () => {
  /* Numa tela de 1080 o título é maior, e a régua acompanha sem número novo. */
  const grandes = SECOES.map((s) => ({ ...s, alturaTitulo: 90 }))
  assert.equal(categoriaPorRolagem({ secoes: grandes, scrollAtual: 894, alturaVisivel: 800, alturaTotal: 4000 }), 'b')
  assert.equal(categoriaPorRolagem({ secoes: SECOES, scrollAtual: 894, alturaVisivel: 800, alturaTotal: 4000 }), 'a',
    'com título pequeno, o mesmo scroll ainda não trocou')
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

// ── indicador de posição no catálogo ─────────────────────────────────────────
// ══ O marcador na coluna ═══════════════════════════════════════════════════
// Ele era uma BARRA DE ROLAGEM: posição e tamanho saíam da fração rolada do catálogo. O
// defeito não era de ajuste, era de conceito — barra de rolagem e destaque de categoria
// medem coisas diferentes, e com categorias de tamanhos diferentes não podem concordar.
// Agora o marcador é função do destaque, e estes testes travam isso.
import { marcaNaColuna, progressoNaSecao } from './totemFoco.js';

const TRECHOS = [
  { id: 'a', topo: 0 },      // 0 → 1000
  { id: 'b', topo: 1000 },   // 1000 → 1600
  { id: 'c', topo: 1600 },   // 1600 → fim
];
const VISTA = { alturaVisivel: 800, alturaTotal: 3000 };  // rolagem possível: 0 → 2200

test('🔴 o marcador POUSA na pílula da categoria atual', () => {
  // O caso que motivou a mudança: com o catálogo rolado até a quarta categoria, o risco
  // ficava na altura da sexta porque seguia a fração de rolagem. Agora ele é a pílula.
  const m = marcaNaColuna({ inicioPilula: 300, alturaPilula: 100, inicioProxima: 400, alturaTrilha: 1000, progresso: 0 });
  assert.equal(m.inicio, 0.3, 'começa exatamente no topo da pílula atual');
  assert.equal(m.fracao, 0.1, 'e tem a altura dela');
});

test('entre uma pílula e outra ele DESLIZA, não salta', () => {
  const meio = marcaNaColuna({ inicioPilula: 300, alturaPilula: 100, inicioProxima: 400, alturaTrilha: 1000, progresso: 0.5 });
  assert.equal(meio.inicio, 0.35, 'na metade da seção, meio caminho até a próxima');
  const fim = marcaNaColuna({ inicioPilula: 300, alturaPilula: 100, inicioProxima: 400, alturaTrilha: 1000, progresso: 1 });
  assert.equal(fim.inicio, 0.4, 'no fim da seção, encostado na próxima');
});

test('última categoria: sem para onde deslizar, o marcador fica parado nela', () => {
  const m = marcaNaColuna({ inicioPilula: 800, alturaPilula: 100, inicioProxima: null, alturaTrilha: 1000, progresso: 1 });
  assert.equal(m.inicio, 0.8, 'não escorrega para fora da trilha');
});

test('🔴 o marcador nunca passa do fim da trilha', () => {
  const m = marcaNaColuna({ inicioPilula: 960, alturaPilula: 100, inicioProxima: 2000, alturaTrilha: 1000, progresso: 1 });
  assert.ok(m.inicio + m.fracao <= 1.0001, `estourou: ${m.inicio + m.fracao}`);
});

test('medida torta não vira NaN — seria um transform inválido e um risco invisível', () => {
  assert.deepEqual(marcaNaColuna(), { inicio: 0, fracao: 1 });
  assert.deepEqual(marcaNaColuna({}), { inicio: 0, fracao: 1 });
  assert.deepEqual(marcaNaColuna({ alturaTrilha: 0, alturaPilula: 50 }), { inicio: 0, fracao: 1 });
  const m = marcaNaColuna({ inicioPilula: 100, alturaPilula: 50, alturaTrilha: 500, progresso: 'muito' });
  assert.equal(m.inicio, 0.2, 'progresso não-numérico vale zero');
});

// -- o progresso dentro da seção --------------------------------------------
test('progresso vai de 0 a 1 dentro da seção', () => {
  const p = (scrollAtual, atual) => progressoNaSecao({ secoes: TRECHOS, atual, scrollAtual, ...VISTA });
  assert.equal(p(1000, 'b'), 0, 'no topo da seção');
  assert.equal(p(1300, 'b'), 0.5, 'na metade');
  assert.equal(p(1600, 'b'), 1, 'no fim');
});

test('🔴 a ÚLTIMA seção chega a 1 no fim da rolagem possível, não no fim do conteúdo', () => {
  // Termina em 2200 (3000 − 800). Medir contra 3000 faria o marcador parar em 0,73 com o
  // cliente já no rodapé do cardápio.
  const p = (scrollAtual) => progressoNaSecao({ secoes: TRECHOS, atual: 'c', scrollAtual, ...VISTA });
  assert.equal(p(1600), 0);
  assert.equal(p(2200), 1, 'rolou tudo o que dava: chegou ao fim');
});

test('progresso é grampeado e nunca devolve NaN', () => {
  assert.equal(progressoNaSecao({ secoes: TRECHOS, atual: 'b', scrollAtual: -999, ...VISTA }), 0);
  assert.equal(progressoNaSecao({ secoes: TRECHOS, atual: 'b', scrollAtual: 99999, ...VISTA }), 1);
  assert.equal(progressoNaSecao({ secoes: TRECHOS, atual: 'inexistente', scrollAtual: 500, ...VISTA }), 0);
  assert.equal(progressoNaSecao({}), 0);
  assert.equal(progressoNaSecao(), 0);
});

test('seções fora de ordem são ordenadas antes de medir', () => {
  const baralhado = [TRECHOS[2], TRECHOS[0], TRECHOS[1]];
  assert.equal(progressoNaSecao({ secoes: baralhado, atual: 'b', scrollAtual: 1300, ...VISTA }), 0.5);
});
