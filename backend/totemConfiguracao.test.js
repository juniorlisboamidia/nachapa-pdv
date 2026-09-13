// Configurações do canal Totem — testes puros (node --test, ESM).
// Rodar: node --test backend/totemConfiguracao.test.js
//
// O que estes testes defendem: um número que veio torto NUNCA vira relógio no
// vidro do totem. A régua mora só aqui — o PUT do admin e o bootstrap público
// leem esta função, e o quiosque não a repete. Duas cópias divergem no dia em
// que alguém mexe numa só.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OCIOSIDADE_PADRAO, OCIOSIDADE_MIN, OCIOSIDADE_MAX, OCIOSIDADE_SUGERIDA,
  normalizarOciosidade, configuracaoParaJson,
} from './totemConfiguracao.js';

// ── os limites ──────────────────────────────────────────────────────────────
test('os limites são coerentes entre si e com as sugestões da tela', () => {
  assert.ok(OCIOSIDADE_MIN < OCIOSIDADE_PADRAO && OCIOSIDADE_PADRAO < OCIOSIDADE_MAX);
  // O padrão é o comportamento que já está em produção. Mudar este número muda o
  // totem de todas as lojas que nunca abriram a tela de configuração.
  assert.equal(OCIOSIDADE_PADRAO, 90);
  // Toda sugestão da interface tem de ser aceita pela régua: um select oferecendo
  // um valor que o servidor recusa é defeito de nascença.
  for (const v of OCIOSIDADE_SUGERIDA) assert.equal(normalizarOciosidade(v), v, `sugestão ${v} recusada`);
  // O padrão está entre as sugestões — senão a loja não teria como voltar atrás.
  assert.ok(OCIOSIDADE_SUGERIDA.includes(OCIOSIDADE_PADRAO));
  // O teto é MAIOR que a maior sugestão de propósito: a lista da tela é conselho,
  // o limite é segurança.
  assert.ok(OCIOSIDADE_MAX > Math.max(...OCIOSIDADE_SUGERIDA));
  assert.ok(Object.isFrozen(OCIOSIDADE_SUGERIDA));
});

test('🔴 o mínimo deixa o aviso caber: 15 s de aviso não podem ocupar a espera inteira', () => {
  // O "Ainda está aí?" aparece nos 15 s finais. Com um mínimo de 15 s ou menos, o
  // aviso nasceria junto com a sessão — o cliente leria "seu pedido será apagado"
  // antes de ter pedido qualquer coisa.
  assert.ok(OCIOSIDADE_MIN >= 30, 'abaixo de 30 s sobra menos tempo de leitura do que de aviso');
});

// ── normalizarOciosidade ────────────────────────────────────────────────────
test('valor válido passa intacto', () => {
  assert.equal(normalizarOciosidade(45), 45);
  assert.equal(normalizarOciosidade(300), 300);
  assert.equal(normalizarOciosidade(OCIOSIDADE_MIN), OCIOSIDADE_MIN);
  assert.equal(normalizarOciosidade(OCIOSIDADE_MAX), OCIOSIDADE_MAX);
  // Um valor fora da lista de sugestões continua valendo: a lista é atalho, não
  // enumeração fechada.
  assert.equal(normalizarOciosidade(77), 77);
});

test('número em texto é aceito — é o que o corpo de um PUT costuma trazer', () => {
  assert.equal(normalizarOciosidade('120'), 120);
  assert.equal(normalizarOciosidade(' 60 '), 60);
});

test('fora dos limites é GRAMPEADO, não recusado', () => {
  // Grampear em vez de rejeitar porque o valor vem de um select: o que chega fora
  // da faixa é engano ou requisição fabricada, e nos dois casos o totem tem de
  // continuar com um relógio sensato.
  assert.equal(normalizarOciosidade(5), OCIOSIDADE_MIN);
  assert.equal(normalizarOciosidade(29), OCIOSIDADE_MIN);
  assert.equal(normalizarOciosidade(0), OCIOSIDADE_MIN);
  assert.equal(normalizarOciosidade(-90), OCIOSIDADE_MIN);
  assert.equal(normalizarOciosidade(100000), OCIOSIDADE_MAX);
});

test('🔴 lixo cai no PADRÃO, e nunca em zero', () => {
  // Zero seria o pior resultado possível: um relógio de ociosidade zerado apaga o
  // pedido do cliente no instante seguinte ao toque. Na dúvida, 90 s.
  for (const v of [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, {}, [], true, () => {}]) {
    assert.equal(normalizarOciosidade(v), OCIOSIDADE_PADRAO, `entrada ${String(v)} não caiu no padrão`);
  }
});

test('fracionário vira inteiro — setTimeout com 90,7 s não é configuração, é acidente', () => {
  assert.equal(normalizarOciosidade(90.7), 91);
  assert.equal(normalizarOciosidade(44.2), 44);
  assert.equal(normalizarOciosidade('59.5'), 60);
  // Arredondar ANTES de grampear: 29,6 é intenção de 30, não de mínimo forçado.
  assert.equal(normalizarOciosidade(29.6), 30);
});

// ── configuracaoParaJson ────────────────────────────────────────────────────
test('empresa sem linha responde o padrão — ausência de configuração não é erro', () => {
  assert.deepEqual(configuracaoParaJson(null), { ociosidadeSegundos: OCIOSIDADE_PADRAO });
  assert.deepEqual(configuracaoParaJson(undefined), { ociosidadeSegundos: OCIOSIDADE_PADRAO });
});

test('linha existente é normalizada na SAÍDA também', () => {
  assert.deepEqual(configuracaoParaJson({ ociosidadeSegundos: 45 }), { ociosidadeSegundos: 45 });
  // Uma linha gravada antes de um limite mudar, ou escrita à mão no banco, não
  // pode escapar da régua só porque já está salva.
  assert.deepEqual(configuracaoParaJson({ ociosidadeSegundos: 5 }), { ociosidadeSegundos: OCIOSIDADE_MIN });
  assert.deepEqual(configuracaoParaJson({ ociosidadeSegundos: null }), { ociosidadeSegundos: OCIOSIDADE_PADRAO });
});

test('a saída não carrega mais nada do banco', () => {
  // Nem id, nem empresaId, nem datas: isto vai para o bootstrap PÚBLICO, que
  // qualquer tablet pareado lê. O que o totem precisa é do número.
  const json = configuracaoParaJson({ id: 7, empresaId: 3, ociosidadeSegundos: 60, criadoEm: new Date() });
  assert.deepEqual(Object.keys(json), ['ociosidadeSegundos']);
});
