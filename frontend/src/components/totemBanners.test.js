// Carrossel da tela de espera — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/totemBanners.test.js
//
// O que estes testes defendem: a agenda acerta a hora com o relógio do tablet errado, o
// bootstrap que se refaz igual não faz a arte piscar, e imagem que falha é pulada em vez
// de deixar a espera preta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DURACAO_MIN_MS, DURACAO_MAX_MS, DURACAO_PADRAO_MS,
  desvioDoRelogio, noAr, paraExibir, duracaoMs, proximoIndice, assinatura, proximaParaPrecarregar,
} from './totemBanners.js';
import { elegivel, bannersPublicos } from '../../../backend/totemBanner.js';

const T = (iso) => new Date(iso).getTime();
const AGORA = T('2026-09-13T15:00:00.000Z');
const b = (extra = {}) => ({ id: 1, nome: 'Promo', ativo: true, ordem: 0, duracaoSegundos: 6, inicioEm: null, fimEm: null, imagemVersao: 1, imagemUrl: '/api/x/1?v=1', ...extra });

// ── o relógio ───────────────────────────────────────────────────────────────
test('🔴 o desvio corrige um tablet com a hora errada', () => {
  // Aparelho duas horas atrasado. O que importa é que a agenda continue certa.
  const local = T('2026-09-13T13:00:00.000Z');
  const desvio = desvioDoRelogio('2026-09-13T15:00:00.000Z', local);
  assert.equal(desvio, 2 * 60 * 60 * 1000);
  assert.equal(local + desvio, AGORA);
});

test('sem agoraServidor o desvio é zero — degrada para confiar no aparelho', () => {
  assert.equal(desvioDoRelogio(undefined, AGORA), 0);
  assert.equal(desvioDoRelogio(null, AGORA), 0);
  assert.equal(desvioDoRelogio('ontem', AGORA), 0);
  assert.equal(desvioDoRelogio('2026-09-13T15:00:00Z', NaN), 0);
});

test('🔴 a régua do cliente é a MESMA do servidor', () => {
  // As duas implementações existem porque o quiosque não importa módulo do servidor. Este
  // teste é o fiador: se uma mudar sem a outra, cai.
  const casos = [
    b(), b({ ativo: false }),
    b({ inicioEm: '2026-09-13T18:00:00Z' }), b({ fimEm: '2026-09-13T12:00:00Z' }),
    b({ inicioEm: '2026-09-13T14:00:00Z', fimEm: '2026-09-13T16:00:00Z' }),
  ];
  for (const t of [AGORA, T('2026-09-13T11:00:00Z'), T('2026-09-13T18:30:00Z')]) {
    for (const caso of casos) {
      assert.equal(noAr(caso, t), elegivel(caso, t), `${caso.id} em ${new Date(t).toISOString()}`);
    }
  }
});

// ── elegibilidade ───────────────────────────────────────────────────────────
test('🔴 agenda aberta, futura e expirada', () => {
  assert.equal(noAr(b(), AGORA), true);
  assert.equal(noAr(b({ inicioEm: '2026-09-13T18:00:00Z' }), AGORA), false);
  assert.equal(noAr(b({ fimEm: '2026-09-13T12:00:00Z' }), AGORA), false);
  assert.equal(noAr(b({ ativo: false }), AGORA), true === false);
  // As bordas: início inclusivo, fim exclusivo.
  assert.equal(noAr(b({ inicioEm: '2026-09-13T15:00:00Z' }), AGORA), true);
  assert.equal(noAr(b({ fimEm: '2026-09-13T15:00:00Z' }), AGORA), false);
});

test('🔴 o banner das 18:00 entra às 18:00, sem esperar o bootstrap', () => {
  // O bootstrap chegou às 15:00 com o banner agendado. O cliente decide a cada segundo.
  const bloco = bannersPublicos([{ ...b({ id: 9, inicioEm: '2026-09-13T18:00:00.000Z' }) }], AGORA);
  assert.deepEqual(paraExibir({ itens: bloco.itens, agoraMs: AGORA }).map((x) => x.id), []);
  assert.deepEqual(paraExibir({ itens: bloco.itens, agoraMs: T('2026-09-13T18:00:00Z') }).map((x) => x.id), [9]);
});

test('ordem, e o empate desempata por id', () => {
  const itens = [b({ id: 3, ordem: 1 }), b({ id: 1, ordem: 0 }), b({ id: 2, ordem: 0 })];
  assert.deepEqual(paraExibir({ itens, agoraMs: AGORA }).map((x) => x.id), [1, 2, 3]);
});

test('🔴 imagem que falhou é PULADA', () => {
  const itens = [b({ id: 1 }), b({ id: 2 }), b({ id: 3 })];
  const r = paraExibir({ itens, agoraMs: AGORA, falhados: new Set([2]) });
  assert.deepEqual(r.map((x) => x.id), [1, 3]);
});

test('🔴 todas falharam: lista vazia, e a tela cai no institucional', () => {
  const itens = [b({ id: 1 }), b({ id: 2 })];
  assert.deepEqual(paraExibir({ itens, agoraMs: AGORA, falhados: new Set([1, 2]) }), []);
  // Empresa sem banners: mesma coisa, pelo caminho normal.
  assert.deepEqual(paraExibir({ itens: [], agoraMs: AGORA }), []);
  assert.deepEqual(paraExibir({}), []);
  assert.deepEqual(paraExibir(), []);
});

test('banner sem URL de imagem não entra', () => {
  assert.deepEqual(paraExibir({ itens: [b({ imagemUrl: null })], agoraMs: AGORA }), []);
});

// ── duração ─────────────────────────────────────────────────────────────────
test('🔴 duração absurda não faz o carrossel piscar nem travar', () => {
  assert.equal(duracaoMs({ duracaoSegundos: 6 }), 6000);
  assert.equal(duracaoMs({ duracaoSegundos: 0 }), DURACAO_MIN_MS, 'zero viraria setTimeout(0)');
  assert.equal(duracaoMs({ duracaoSegundos: 1 }), DURACAO_MIN_MS);
  assert.equal(duracaoMs({ duracaoSegundos: -5 }), DURACAO_MIN_MS);
  assert.equal(duracaoMs({ duracaoSegundos: 99999 }), DURACAO_MAX_MS);
  for (const v of [undefined, null, 'abc', {}]) assert.equal(duracaoMs({ duracaoSegundos: v }), DURACAO_PADRAO_MS);
  assert.equal(duracaoMs(undefined), DURACAO_PADRAO_MS);
});

// ── rotação ─────────────────────────────────────────────────────────────────
test('a rotação é circular e nunca devolve índice inválido', () => {
  assert.equal(proximoIndice(0, 3), 1);
  assert.equal(proximoIndice(2, 3), 0);
  assert.equal(proximoIndice(0, 1), 0, 'um banner só fica parado');
  assert.equal(proximoIndice(0, 0), 0);
  assert.equal(proximoIndice(NaN, 3), 1);
  assert.equal(proximoIndice(5, undefined), 0);
});

// ── estabilidade entre bootstraps ───────────────────────────────────────────
test('🔴 bootstrap que se refaz IGUAL não muda a assinatura — a arte não pisca', () => {
  const antes = [b({ id: 1 }), b({ id: 2, ordem: 1 })];
  const depois = [b({ id: 1 }), b({ id: 2, ordem: 1 })];
  assert.equal(assinatura(antes), assinatura(depois));
});

test('🔴 trocar a ARTE muda a assinatura; trocar o NOME não', () => {
  const base = [b({ id: 1, imagemVersao: 1 })];
  assert.notEqual(assinatura(base), assinatura([b({ id: 1, imagemVersao: 2 })]));
  assert.equal(assinatura(base), assinatura([b({ id: 1, nome: 'Outro nome' })]));
  // Mudar a duração também conta: o timer precisa ser refeito.
  assert.notEqual(assinatura(base), assinatura([b({ id: 1, duracaoSegundos: 12 })]));
  // Entrar ou sair um banner conta.
  assert.notEqual(assinatura(base), assinatura([...base, b({ id: 2 })]));
  assert.equal(assinatura(null), '');
});

// ── pré-carregamento ────────────────────────────────────────────────────────
test('pré-carrega só a PRÓXIMA', () => {
  const lista = [b({ id: 1, imagemUrl: '/a' }), b({ id: 2, imagemUrl: '/b' }), b({ id: 3, imagemUrl: '/c' })];
  assert.equal(proximaParaPrecarregar(lista, 0), '/b');
  assert.equal(proximaParaPrecarregar(lista, 2), '/a', 'circular');
  // Com um banner só não há o que pré-carregar.
  assert.equal(proximaParaPrecarregar([lista[0]], 0), null);
  assert.equal(proximaParaPrecarregar([], 0), null);
  assert.equal(proximaParaPrecarregar(null, 0), null);
});
