// Estado do canal (loja fechada × canal sem modo) — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/totemLoja.test.js
//
// O que estes testes defendem: loja fechada NÃO esconde o cardápio, e a única porta que
// ela fecha — a passagem para o pagamento — fica fechada nos dois lugares, na aparência e
// no callback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROTULO_AVANCAR, ROTULO_FECHADO, estadoDoCanal, acaoDoCarrinho, podeAvancar,
} from './totemLoja.js';

const ABERTA = { operacional: { abertaAgora: true }, orderTypes: ['onsite', 'takeout'] };
const FECHADA = { operacional: { abertaAgora: false }, orderTypes: ['onsite', 'takeout'] };
const SEM_MODO = { operacional: { abertaAgora: true }, orderTypes: [] };

// ── loja ABERTA ─────────────────────────────────────────────────────────────
test('aberta: tudo liberado, inclusive o pagamento', () => {
  const e = estadoDoCanal(ABERTA);
  assert.equal(e.fechada, false);
  assert.equal(e.bloquearEntrada, false);
  assert.equal(e.podeNavegar, true);
  assert.equal(e.podeIrAoPagamento, true);
  assert.deepEqual(acaoDoCarrinho({ fechada: e.fechada, qtdLinhas: 2 }), {
    rotulo: ROTULO_AVANCAR, habilitado: true, fechada: false,
  });
  assert.equal(podeAvancar({ fechada: false, qtdLinhas: 2 }), true);
});

// ── loja FECHADA ────────────────────────────────────────────────────────────
test('🔴 fechada: o cardápio continua acessível — é o que o Cardápio Web faz', () => {
  const e = estadoDoCanal(FECHADA);
  assert.equal(e.fechada, true);
  // Estas três são a mudança inteira desta frente: fechada NÃO barra na entrada, NÃO
  // esconde o catálogo e NÃO impede montar o carrinho.
  assert.equal(e.bloquearEntrada, false, 'fechada não pode mais barrar na entrada');
  assert.equal(e.podeNavegar, true, 'catálogo e detalhe do produto continuam abertos');
  assert.equal(e.podeMontarCarrinho, true, 'adicionar, editar e remover continuam valendo');
});

test('🔴 fechada: a ÚNICA porta que fecha é a do pagamento', () => {
  const e = estadoDoCanal(FECHADA);
  assert.equal(e.podeIrAoPagamento, false);
  assert.deepEqual(acaoDoCarrinho({ fechada: true, qtdLinhas: 3 }), {
    rotulo: ROTULO_FECHADO, habilitado: false, fechada: true,
  });
});

test('🔴 fechada: avanço programático é recusado, não só o botão', () => {
  // A aparência desabilitada é metade da guarda. Se uma regressão de markup ou de CSS
  // devolvesse o clique, ou se alguém chamasse a função direto, a transição continua
  // recusada.
  assert.equal(podeAvancar({ fechada: true, qtdLinhas: 3 }), false);
  assert.equal(podeAvancar({ fechada: true, qtdLinhas: 1 }), false);
  assert.equal(podeAvancar({ fechada: true, qtdLinhas: 0 }), false);
});

test('fechada com carrinho vazio: continua sendo o rótulo de fechado', () => {
  // A razão mais forte manda. "Ir para o pagamento" desabilitado por estar vazio diria a
  // coisa errada para quem está numa loja fechada.
  const a = acaoDoCarrinho({ fechada: true, qtdLinhas: 0 });
  assert.equal(a.rotulo, ROTULO_FECHADO);
  assert.equal(a.habilitado, false);
});

test('aberta com carrinho vazio: rótulo normal, desabilitado', () => {
  assert.deepEqual(acaoDoCarrinho({ fechada: false, qtdLinhas: 0 }), {
    rotulo: ROTULO_AVANCAR, habilitado: false, fechada: false,
  });
  assert.equal(podeAvancar({ fechada: false, qtdLinhas: 0 }), false);
});

// ── canal SEM MODO — estado diferente, consequência oposta ──────────────────
test('🔴 sem modo NÃO virou navegável junto com a loja fechada', () => {
  // Os dois estavam na mesma condição e foram separados. Sem "comer aqui" nem "levar" não
  // há o que navegar: o fluxo COMEÇA escolhendo o modo, e sem nenhum o cliente ficaria
  // preso numa tela inicial sem saída. Este continua barrando na entrada.
  const e = estadoDoCanal(SEM_MODO);
  assert.equal(e.semModo, true);
  assert.equal(e.fechada, false);
  assert.equal(e.bloquearEntrada, true);
  assert.equal(e.podeNavegar, false);
  assert.equal(e.podeIrAoPagamento, false);
});

test('fechada E sem modo: quem barra é a ausência de modo', () => {
  const e = estadoDoCanal({ operacional: { abertaAgora: false }, orderTypes: [] });
  assert.equal(e.fechada, true);
  assert.equal(e.bloquearEntrada, true);
});

// ── ausência de dado ────────────────────────────────────────────────────────
test('🔴 campo ausente NÃO é loja fechada', () => {
  // Comparação estrita: bootstrap antigo, `null` ou objeto sem `operacional` não podem
  // travar a venda de uma loja aberta. Na dúvida o totem segue e o servidor recusa.
  for (const boot of [{ orderTypes: ['onsite'] }, { operacional: {}, orderTypes: ['onsite'] },
    { operacional: { abertaAgora: null }, orderTypes: ['onsite'] }]) {
    const e = estadoDoCanal(boot);
    assert.equal(e.fechada, false);
    assert.equal(e.podeIrAoPagamento, true);
  }
});

test('bootstrap inexistente: sem modo, barra na entrada', () => {
  for (const boot of [undefined, null, {}]) {
    const e = estadoDoCanal(boot);
    assert.equal(e.fechada, false, 'ausência de dado não é loja fechada');
    assert.equal(e.bloquearEntrada, true, 'mas sem modo não há fluxo');
  }
});

// ── a troca de estado no meio da sessão ─────────────────────────────────────
test('🔴 abrir → fechar durante a sessão só muda a porta do pagamento', () => {
  // O bootstrap se refaz sozinho. O cliente que já estava montando o carrinho não perde
  // nada: continua navegando e montando, e encontra a recusa ao chegar no rodapé.
  const antes = estadoDoCanal(ABERTA);
  assert.equal(antes.podeIrAoPagamento, true);

  const depois = estadoDoCanal(FECHADA);
  assert.equal(depois.podeNavegar, true, 'não expulsa da tela em que está');
  assert.equal(depois.podeMontarCarrinho, true, 'não apaga nem congela o carrinho');
  assert.equal(depois.bloquearEntrada, false, 'nenhuma tela cheia toma a sessão');
  assert.equal(depois.podeIrAoPagamento, false, 'só a porta do pagamento fecha');
  assert.equal(acaoDoCarrinho({ fechada: depois.fechada, qtdLinhas: 2 }).rotulo, ROTULO_FECHADO);
});
