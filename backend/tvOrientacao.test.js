// TV Indoor › posição física da tela — testes puros (node --test, ESM).
// Rodar: node --test backend/tvOrientacao.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_JANELA_AJUSTE, ORIENTACOES, ROTACOES,
  emAjuste, orientacaoDe, posicaoPublica, proximaRotacao, rotacaoDe, rotacaoInicial, validarOrientacao,
} from './tvOrientacao.js';

test('toda TV antiga é PAISAGEM sem rotação — como sempre se comportou', () => {
  // A coluna nasce nula em todas as telas que já existem. Se nulo virasse qualquer outra
  // coisa, o deploy giraria paredes que estão funcionando.
  assert.equal(orientacaoDe({}), 'PAISAGEM');
  assert.equal(orientacaoDe({ tvOrientacao: null }), 'PAISAGEM');
  assert.equal(orientacaoDe(null), 'PAISAGEM');
  assert.equal(rotacaoDe({}), 0);
  assert.equal(rotacaoDe({ tvRotacao: null }), 0);
  assert.equal(rotacaoDe(null), 0);
});

test('valor corrompido no banco cai no padrão, nunca viaja para a TV', () => {
  assert.equal(orientacaoDe({ tvOrientacao: 'DIAGONAL' }), 'PAISAGEM');
  for (const ruim of [45, -90, 360, '90', NaN, 1.5]) {
    assert.equal(rotacaoDe({ tvRotacao: ruim }), 0, `${JSON.stringify(ruim)} não é rotação`);
  }
});

test('entrada do navegador: só o catálogo passa, o resto é recusa', () => {
  assert.equal(validarOrientacao('RETRATO'), 'RETRATO');
  assert.equal(validarOrientacao('PAISAGEM'), 'PAISAGEM');
  for (const ruim of ['retrato', 'VERTICAL', '', null, undefined, 1, {}]) {
    assert.equal(validarOrientacao(ruim), null, `${JSON.stringify(ruim)} devia ser recusado`);
  }
  assert.deepEqual(ORIENTACOES, ['PAISAGEM', 'RETRATO']);
  assert.deepEqual(ROTACOES, [0, 90, 180, 270]);
});

test('a TV em pé nasce girada; a deitada, não', () => {
  // A maioria das boxes não gira a saída sozinha, então 90 é o palpite que mais acerta.
  assert.equal(rotacaoInicial('RETRATO'), 90);
  assert.equal(rotacaoInicial('PAISAGEM'), 0);
});

test('🔴 "girar" percorre as QUATRO posições, da mais provável à menos', () => {
  /* +90 às cegas levaria uma TV em pé de 90 para 180: de lado para de ponta-cabeça, que
     é certamente errado, antes de chegar ao outro lado. A ordem segue a probabilidade:
     em pé, os dois lados primeiro; deitada, o de ponta-cabeça (suporte de teto) primeiro. */
  assert.equal(proximaRotacao('RETRATO', 90), 270);
  assert.equal(proximaRotacao('RETRATO', 270), 0);
  assert.equal(proximaRotacao('RETRATO', 0), 180);
  assert.equal(proximaRotacao('RETRATO', 180), 90);

  assert.equal(proximaRotacao('PAISAGEM', 0), 180);
  assert.equal(proximaRotacao('PAISAGEM', 180), 90);

  // Nenhuma posição fica inalcançável: de qualquer ponto, quatro giros dão a volta.
  for (const o of ORIENTACOES) {
    for (const inicio of ROTACOES) {
      const vistas = new Set();
      let r = inicio;
      for (let i = 0; i < 4; i += 1) { r = proximaRotacao(o, r); vistas.add(r); }
      assert.equal(vistas.size, 4, `${o} a partir de ${inicio} não visitou as quatro`);
      assert.equal(r, inicio, 'quatro giros voltam ao começo');
    }
  }
});

test('rotação desconhecida recomeça do mais provável', () => {
  assert.equal(proximaRotacao('RETRATO', 45), 90);
  assert.equal(proximaRotacao('PAISAGEM', undefined), 0);
  assert.equal(proximaRotacao('QUALQUER', 0), 180, 'orientação inválida usa o ciclo da paisagem');
});

test('a janela de ajuste abre, fecha, e nunca fica aberta por um valor torto', () => {
  const agora = Date.parse('2026-09-17T12:00:00Z');
  assert.equal(emAjuste({ tvAjusteAte: new Date(agora + 60_000) }, agora), true);
  assert.equal(emAjuste({ tvAjusteAte: new Date(agora - 1) }, agora), false);
  assert.equal(emAjuste({ tvAjusteAte: null }, agora), false);
  assert.equal(emAjuste({}, agora), false);
  assert.equal(emAjuste({ tvAjusteAte: 'ontem' }, agora), false);
  assert.equal(MS_JANELA_AJUSTE, 600_000);
});

test('🔴 a TV só recebe `ajusteAte` enquanto a janela está aberta', () => {
  /* Enquanto a chave existe, a TV consulta o servidor a cada poucos segundos. Se ela
     viajasse sempre (ou com uma data vencida que a TV interpretasse mal), toda parede de
     toda loja passaria a bater no servidor doze vezes mais — para sempre. */
  const agora = Date.parse('2026-09-17T12:00:00Z');
  const aberta = posicaoPublica({ tvOrientacao: 'RETRATO', tvRotacao: 270, tvAjusteAte: new Date(agora + 5_000) }, agora);
  assert.deepEqual(aberta, { orientacao: 'RETRATO', rotacao: 270, ajusteAte: new Date(agora + 5_000).toISOString() });

  const fechada = posicaoPublica({ tvOrientacao: 'RETRATO', tvRotacao: 270, tvAjusteAte: new Date(agora - 5_000) }, agora);
  assert.deepEqual(fechada, { orientacao: 'RETRATO', rotacao: 270 });
  assert.equal('ajusteAte' in fechada, false);

  assert.deepEqual(posicaoPublica({}, agora), { orientacao: 'PAISAGEM', rotacao: 0 });
});
