// TV Indoor › posição física da tela — testes puros (node --test, ESM).
// Rodar: node --test backend/tvOrientacao.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MS_JANELA_AJUSTE, ORIENTACOES, ROTACOES,
  emAjuste, orientacaoDe, posicaoPublica, proximaRotacao, rotacaoDe, rotacaoInicial, saidaDe,
  validarOrientacao,
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
  // Sem medida nenhuma, o palpite é o de sempre: a maioria das boxes não gira a saída.
  assert.equal(rotacaoInicial('RETRATO'), 90);
  assert.equal(rotacaoInicial('PAISAGEM'), 0);
  assert.equal(rotacaoInicial('RETRATO', 'PAISAGEM'), 90, 'a box manda deitado: falta um quarto de volta');
  assert.equal(rotacaoInicial('PAISAGEM', 'PAISAGEM'), 0);
});

test('🔴 a box que JÁ gira a saída não leva um quarto de volta a mais', () => {
  /* Apareceu na primeira conferência em pé: a janela já era em pé — 1080 × 1920, um monitor
     girado —, o sistema chutou 90 assim mesmo, e o gestor teve de girar DUAS vezes (90 →
     270 → 0) para voltar ao zero de onde a imagem já estava certa. A medida existia o tempo
     todo, no heartbeat.

     ⚠️ Numa box de TV o caso é o OUTRO: a saída continua deitada, o palpite 90 continua
     valendo, e o que se confere é o lado. Esta regra não troca um chute por outro — ela só
     deixa de chutar quando há medida.

     A regra não é "em pé gira": é "gira quem está recebendo a imagem na posição errada". */
  assert.equal(rotacaoInicial('RETRATO', 'RETRATO'), 0, 'imagem já chega em pé: nada a corrigir');
  assert.equal(proximaRotacao('RETRATO', 0, 'RETRATO'), 180, 'o suspeito seguinte é o painel de ponta-cabeça');

  // E o inverso, que é o mesmo princípio: TV deitada alimentada por uma saída em pé.
  assert.equal(rotacaoInicial('PAISAGEM', 'RETRATO'), 90);

  // Nenhuma posição fica inalcançável em nenhum dos dois ciclos.
  for (const o of ORIENTACOES) {
    for (const s of [...ORIENTACOES, null]) {
      const vistas = new Set();
      let r = rotacaoInicial(o, s);
      for (let i = 0; i < 4; i += 1) { vistas.add(r); r = proximaRotacao(o, r, s); }
      assert.equal(vistas.size, 4, `${o}/${s} não visitou as quatro`);
      assert.equal(r, rotacaoInicial(o, s), 'quatro giros voltam ao começo');
    }
  }
});

test('🔴 medida ausente ou torta é "não sei" — nunca uma orientação inventada', () => {
  /* `null` tem de sair como `null`: virasse PAISAGEM por acidente, uma TV que ainda não deu
     sinal seria tratada como medida CONHECIDA, e o palpite pareceria informado sem ser.
     ⚠️ `Number(null) === 0` — é o guarda `<= 0` que segura isso, não o `Number.isFinite`. */
  assert.equal(saidaDe({ heartbeatJson: { tela: { w: 1920, h: 1080 } } }), 'PAISAGEM');
  assert.equal(saidaDe({ heartbeatJson: { tela: { w: 1080, h: 1920 } } }), 'RETRATO');
  assert.equal(saidaDe({ heartbeatJson: { tela: { w: 960, h: 539 } } }), 'PAISAGEM', 'a medida vem escalada, e a proporção basta');
  for (const ruim of [
    undefined, null, {}, { heartbeatJson: null }, { heartbeatJson: { tela: null } },
    { heartbeatJson: { tela: { w: null, h: 1920 } } },
    { heartbeatJson: { tela: { w: 1080, h: null } } },
    { heartbeatJson: { tela: { w: 0, h: 0 } } },
    { heartbeatJson: { tela: { w: 1080, h: 1080 } } },
    { heartbeatJson: { tela: { w: 'a', h: 'b' } } },
  ]) {
    assert.equal(saidaDe(ruim), null, `${JSON.stringify(ruim)} não é medida`);
  }
});

test('🔴 quem decide a rotação consulta a MEDIDA, nas duas rotas', () => {
  // Declarar a orientação e "girar" são os dois pontos onde a rotação nasce ou muda. Se um
  // deles esquecer a medida, a box que gira sozinha volta a pedir dois giros à toa.
  const server = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  assert.match(server, /tvRotacaoInicial\(orientacao, tvSaidaDe\(alvo\.d\)\)/);
  assert.match(server, /tvProximaRotacao\(tvOrientacaoDe\(alvo\.d\), tvRotacaoDe\(alvo\.d\), tvSaidaDe\(alvo\.d\)\)/);
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
