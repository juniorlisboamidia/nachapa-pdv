// Máquina de estados da sessão — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/totemSessao.test.js
//
// O que estes testes defendem: o totem em repouso não corre relógio nenhum, e tudo que é
// sessão corre — inclusive a escolha do modo, que antes era confundida com repouso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELA_REPOUSO, emRepouso, temSessao, armaReset, armaAviso } from './totemSessao.js';
import { criarRelogioSessao, MS_OCIOSIDADE_PADRAO, MS_AMBIGUO, msDoAviso } from './totemOciosidade.js';

const TELAS_DE_SESSAO = ['inicio', 'catalogo', 'item', 'carrinho', 'pagamento', 'revisar', 'resultado', 'erro'];

// ── repouso × sessão ────────────────────────────────────────────────────────
test('espera é o repouso, e é o único', () => {
  assert.equal(TELA_REPOUSO, 'espera');
  assert.equal(emRepouso('espera'), true);
  assert.equal(temSessao('espera'), false);
  for (const t of TELAS_DE_SESSAO) {
    assert.equal(emRepouso(t), false, `${t} não é repouso`);
    assert.equal(temSessao(t), true, `${t} é sessão`);
  }
});

test('🔴 inicio passa a CONTAR como sessão — é a mudança de comportamento da frente', () => {
  // Antes, `inicio` era o repouso e o relógio não corria nele. Agora o cliente já tocou:
  // quem toca e vai embora não pode deixar o totem parado na escolha para sempre.
  assert.equal(temSessao('inicio'), true);
  assert.equal(armaReset({ tela: 'inicio' }), true);
  assert.equal(armaAviso({ tela: 'inicio' }), true);
});

test('tela ausente ou desconhecida conta como repouso — é o estado seguro', () => {
  for (const t of [undefined, null, '', 42, {}, []]) {
    assert.equal(temSessao(t), false, `${String(t)} não pode armar relógio`);
    assert.equal(armaReset({ tela: t }), false);
  }
});

// ── o relógio de reset ──────────────────────────────────────────────────────
test('🔴 em espera o relógio NÃO é armado', () => {
  assert.equal(armaReset({ tela: 'espera' }), false);
  assert.equal(armaReset({ tela: 'espera', enviando: false, travado: false }), false);
});

test('o relógio é armado nas telas da sessão', () => {
  for (const t of TELAS_DE_SESSAO) assert.equal(armaReset({ tela: t }), true, t);
});

test('🔴 enviando e travado continuam bloqueando o reset', () => {
  // A guarda não mudou de sentido: o reset zera a chave de idempotência, e zerar a chave
  // de um pedido que talvez exista é como se cria o segundo.
  for (const t of TELAS_DE_SESSAO) {
    assert.equal(armaReset({ tela: t, enviando: true }), false, `${t} enviando`);
    assert.equal(armaReset({ tela: t, travado: true }), false, `${t} travado`);
    assert.equal(armaReset({ tela: t, enviando: true, travado: true }), false, `${t} os dois`);
  }
});

// ── o aviso ─────────────────────────────────────────────────────────────────
test('🔴 espera nunca dispara "Ainda está aí?"', () => {
  assert.equal(armaAviso({ tela: 'espera' }), false);
});

test('🔴 resultado NÃO recebe o aviso, mas continua no relógio de reset', () => {
  // O relógio corre (é assim que o totem volta ao repouso depois do pedido); o que não
  // pode é cobrir o número do pedido com "o seu pedido é apagado".
  assert.equal(armaReset({ tela: 'resultado' }), true);
  assert.equal(armaAviso({ tela: 'resultado' }), false);
});

test('tudo que barra o reset barra o aviso', () => {
  for (const t of TELAS_DE_SESSAO) {
    assert.equal(armaAviso({ tela: t, enviando: true }), false, `${t} enviando`);
    assert.equal(armaAviso({ tela: t, travado: true }), false, `${t} travado`);
  }
});

// ── a sessão inteira, do toque ao reset ─────────────────────────────────────
test('🔴 o percurso completo: espera → inicio → catalogo → reset → espera', () => {
  const relogio = criarRelogioSessao();
  let tela = TELA_REPOUSO;

  // Repouso: nada corre, e o relógio nem foi capturado.
  assert.equal(armaReset({ tela }), false);
  assert.equal(relogio.ativo(), false);

  // O TOQUE começa a sessão — e é AQUI que a captura acontece, não mais na escolha do
  // modo: quem tocou já iniciou, mesmo sem ter dito se come na loja ou leva.
  relogio.iniciar({ ociosidadeSegundos: 45 });
  tela = 'inicio';
  assert.equal(armaReset({ tela }), true, 'o relógio já vale na escolha do modo');
  assert.equal(relogio.atual(), 45_000);
  assert.equal(msDoAviso(relogio.atual()), 30_000);

  // Escolheu o modo e foi ao catálogo: mesma sessão, mesmo valor.
  tela = 'catalogo';
  assert.equal(relogio.atual(), 45_000);

  // Expirou (ou cancelou): reiniciar() volta ao repouso e solta o valor.
  relogio.encerrar();
  tela = TELA_REPOUSO;
  assert.equal(armaReset({ tela }), false);
  assert.equal(relogio.atual(), MS_OCIOSIDADE_PADRAO);
});

test('🔴 abandonar a escolha do modo também expira e volta ao repouso', () => {
  // O cenário que a separação criou: o cliente toca, vê "comer aqui / levar" e vai embora.
  // Com `inicio` fora do relógio, o totem ficaria naquela tela indefinidamente.
  const relogio = criarRelogioSessao();
  relogio.iniciar({ ociosidadeSegundos: 30 });
  assert.equal(armaReset({ tela: 'inicio' }), true);
  assert.equal(relogio.atual(), 30_000);
  relogio.encerrar();
  assert.equal(armaReset({ tela: TELA_REPOUSO }), false);
});

test('🔴 a captura é por SESSÃO: bootstrap novo não mexe na que está correndo', () => {
  const relogio = criarRelogioSessao();
  relogio.iniciar({ ociosidadeSegundos: 300 });   // toque na espera
  // ... o bootstrap se refaz com 30 s no meio do pedido. Ninguém chama `iniciar`.
  assert.equal(relogio.atual(), 300_000);
  // Sessão encerrada; a PRÓXIMA pega o valor mais recente.
  relogio.encerrar();
  relogio.iniciar({ ociosidadeSegundos: 30 });
  assert.equal(relogio.atual(), 30_000);
});

test('🔴 MS_AMBIGUO segue independente da ociosidade da sessão', () => {
  const relogio = criarRelogioSessao();
  relogio.iniciar({ ociosidadeSegundos: 30 });
  assert.equal(relogio.atual(), 30_000);
  assert.equal(MS_AMBIGUO, 90_000);
});
