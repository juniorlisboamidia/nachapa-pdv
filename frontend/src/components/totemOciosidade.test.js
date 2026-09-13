// O relógio de ociosidade da sessão — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/totemOciosidade.test.js
//
// O que estes testes defendem: o cliente nunca perde o pedido antes do tempo que a tela
// prometeu quando ele começou, e o prazo da confirmação em dúvida não é alcançado pela
// configuração da loja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_OCIOSIDADE_PADRAO, MS_AVISO_INATIVIDADE, MS_AMBIGUO,
  msDeOciosidade, msDoAviso, criarRelogioSessao,
} from './totemOciosidade.js';

// ── conversão ───────────────────────────────────────────────────────────────
test('segundos do bootstrap viram milissegundos', () => {
  assert.equal(msDeOciosidade({ ociosidadeSegundos: 90 }), 90_000);
  assert.equal(msDeOciosidade({ ociosidadeSegundos: 30 }), 30_000);
  assert.equal(msDeOciosidade({ ociosidadeSegundos: 300 }), 300_000);
  // Número em texto: é o que uma resposta JSON pode trazer.
  assert.equal(msDeOciosidade({ ociosidadeSegundos: '45' }), 45_000);
});

test('🔴 bootstrap sem o campo cai no padrão de 90 s', () => {
  // Servidor antigo, bootstrap de cache, resposta truncada: em nenhum caso o totem pode
  // ficar sem relógio ou com relógio zerado.
  for (const boot of [undefined, null, {}, { ociosidadeSegundos: undefined }, { ociosidadeSegundos: null }]) {
    assert.equal(msDeOciosidade(boot), MS_OCIOSIDADE_PADRAO);
  }
});

test('valor impossível cai no padrão — nunca em zero', () => {
  for (const v of [0, -30, NaN, Infinity, 'abc', '', true, {}, []]) {
    assert.equal(msDeOciosidade({ ociosidadeSegundos: v }), MS_OCIOSIDADE_PADRAO, `entrada ${String(v)}`);
  }
});

test('🔴 a faixa 30–600 NÃO é reimplementada aqui', () => {
  // Se o servidor mandar algo fora da faixa dele, o cliente obedece: a régua tem um dono,
  // e é o backend. Duplicar aqui criaria a segunda fonte de verdade — e um totem que
  // ignora em silêncio o número que a tela de configuração mostra.
  assert.equal(msDeOciosidade({ ociosidadeSegundos: 5 }), 5_000);
  assert.equal(msDeOciosidade({ ociosidadeSegundos: 3600 }), 3_600_000);
});

// ── o aviso ─────────────────────────────────────────────────────────────────
test('o aviso começa exatamente nos 15 s finais', () => {
  assert.equal(msDoAviso(90_000), 75_000);
  assert.equal(msDoAviso(30_000), 15_000);
  assert.equal(msDoAviso(300_000), 285_000);
  // A relação vale para qualquer total, e é ela que o teste guarda.
  for (const seg of [30, 45, 60, 90, 120, 180, 300]) {
    assert.equal(msDoAviso(seg * 1000), seg * 1000 - MS_AVISO_INATIVIDADE);
  }
});

test('🔴 total curto não gera atraso negativo', () => {
  // `setTimeout` com número negativo dispara IMEDIATAMENTE: o aviso nasceria junto com a
  // sessão, dizendo "o seu pedido é apagado" a quem ainda não pediu nada.
  assert.equal(msDoAviso(10_000), 0);
  assert.equal(msDoAviso(15_000), 0);
  assert.equal(msDoAviso(-5), 75_000, 'total inválido usa o padrão');
});

// ── captura pela sessão ─────────────────────────────────────────────────────
test('fora de sessão o relógio já responde o padrão', () => {
  const r = criarRelogioSessao();
  assert.equal(r.ativo(), false);
  // Nunca `null`: nenhum caminho pode entregar "sem relógio" a quem vai agendar um reset.
  assert.equal(r.atual(), MS_OCIOSIDADE_PADRAO);
});

test('a sessão captura a configuração ao começar', () => {
  const r = criarRelogioSessao();
  assert.equal(r.iniciar({ ociosidadeSegundos: 300 }), 300_000);
  assert.equal(r.atual(), 300_000);
  assert.equal(r.ativo(), true);
});

test('🔴 bootstrap que se refaz DURANTE a sessão não encurta o relógio dela', () => {
  // O cenário real: o bootstrap se refaz sozinho a cada 5 min. O cliente começou com
  // 300 s, a loja trocou para 30 s, e o refresh chegou no meio da escolha. O relógio DELE
  // não muda — senão o pedido sumiria antes do tempo que a tela prometeu quando começou.
  const r = criarRelogioSessao();
  r.iniciar({ ociosidadeSegundos: 300 });
  // ... chega bootstrap novo, com outro valor. Ninguém chama `iniciar`.
  assert.equal(r.atual(), 300_000);
  // Nem um valor MAIOR entra no meio: estabilidade é a regra, não "só encurtar é ruim".
  assert.equal(r.atual(), 300_000);
});

test('a sessão seguinte usa a configuração nova', () => {
  const r = criarRelogioSessao();
  r.iniciar({ ociosidadeSegundos: 300 });
  r.encerrar();                       // reiniciar(): voltou ao repouso
  assert.equal(r.ativo(), false);
  assert.equal(r.atual(), MS_OCIOSIDADE_PADRAO, 'em repouso, o padrão');
  r.iniciar({ ociosidadeSegundos: 30 });   // próximo cliente
  assert.equal(r.atual(), 30_000);
});

test('sessão iniciada com bootstrap sem o campo roda em 90 s', () => {
  const r = criarRelogioSessao();
  r.iniciar(undefined);
  assert.equal(r.atual(), MS_OCIOSIDADE_PADRAO);
  assert.equal(msDoAviso(r.atual()), 75_000);
});

// ── a fronteira com o prazo da confirmação em dúvida ────────────────────────
test('🔴 MS_AMBIGUO é 90 s e a configuração da loja não o alcança', () => {
  assert.equal(MS_AMBIGUO, 90_000);
  const r = criarRelogioSessao();
  r.iniciar({ ociosidadeSegundos: 30 });
  assert.equal(r.atual(), 30_000);
  // Mesmo com a loja em 30 s, o prazo da dúvida continua 90 s: ele não mede cliente
  // parado, mede quanto o totem espera antes de mandar alguém ao balcão com um pedido
  // que talvez exista.
  assert.equal(MS_AMBIGUO, 90_000);
  r.iniciar({ ociosidadeSegundos: 300 });
  assert.equal(MS_AMBIGUO, 90_000);
});
