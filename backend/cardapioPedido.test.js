// Ponte PDV→HUB do totem (spec §5.1 + §4.7): a tradução de "o que o HUB respondeu" para
// "o que o outbox pode afirmar". `fetch` é MOCKADO — nenhum teste aqui fala com o HUB nem
// com o Cardápio Web, e nenhum pedido de verdade é criado.
//
// O que estes testes protegem: a diferença entre `ambiguo:false` (nada foi criado, pode
// rejeitar e o cliente refaz) e `ambiguo:true` (pode ter sido criado, então o registro
// fica AMBIGUO e um humano decide). Errar isso é pedido duplicado no balcão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import {
  interpretarRespostaHub, TIMEOUT_PADRAO_MS, TIMEOUT_PEDIDO_MS,
  bootstrapTotemCW, cotarTotemCW, criarPedidoTotemCW, detalheTotemCW, reconciliarTotemCW,
} from './cardapioPedido.js';

// ── interpretarRespostaHub (puro, sem rede) ─────────────────────────────────
const CASOS = [
  ['201 criado', { status: 201, data: { criado: true, cwOrderId: 7 }, operacao: 'pedido' }, { ok: true, status: 201 }],
  ['200 do cotar', { status: 200, data: { ok: true, total: 13.5 }, operacao: 'cotar' }, { ok: true, status: 200 }],
  ['422 COTACAO_INVALIDA', { status: 422, data: { erro: 'COTACAO_INVALIDA', detalhes: [] }, operacao: 'pedido' }, { ok: false, http: 422, codigo: 'COTACAO_INVALIDA', ambiguo: false }],
  ['422 CW_RECUSOU', { status: 422, data: { erro: 'CW_RECUSOU', cwStatus: 422 }, operacao: 'pedido' }, { ok: false, http: 422, codigo: 'CW_RECUSOU', ambiguo: false }],
  ['409 COTACAO_DIVERGENTE', { status: 409, data: { erro: 'COTACAO_DIVERGENTE' }, operacao: 'pedido' }, { ok: false, http: 409, codigo: 'COTACAO_DIVERGENTE', ambiguo: false }],
  ['409 COTACAO_EXPIRADA', { status: 409, data: { erro: 'COTACAO_EXPIRADA' }, operacao: 'pedido' }, { ok: false, http: 409, codigo: 'COTACAO_EXPIRADA', ambiguo: false }],
  // 4xx INESPERADO no pedido (sem código conhecido) é ambíguo por prudência (§4.7 c).
  ['400 sem corpo conhecido (pedido)', { status: 400, data: {}, operacao: 'pedido' }, { ok: false, http: 400, codigo: 'HUB_RECUSOU', ambiguo: true }],
  ['403 inesperado (pedido)', { status: 403, data: { erro: 'ALGO_NOVO' }, operacao: 'pedido' }, { ok: false, http: 403, codigo: 'ALGO_NOVO', ambiguo: true }],
  ['409 inesperado (pedido)', { status: 409, data: { erro: 'CONFLITO_DESCONHECIDO' }, operacao: 'pedido' }, { ok: false, http: 409, codigo: 'CONFLITO_DESCONHECIDO', ambiguo: true }],
  ['400 sem corpo no cotar', { status: 400, data: {}, operacao: 'cotar' }, { ok: false, http: 400, codigo: 'HUB_RECUSOU', ambiguo: false }],
  ['422 COTACAO_INVALIDA com detalhes do §7', { status: 422, data: { erro: 'COTACAO_INVALIDA', detalhes: [{ codigo: 'ITEM_EM_FALTA' }] }, operacao: 'pedido' }, { ok: false, http: 422, codigo: 'COTACAO_INVALIDA', ambiguo: false }],
  ['422 ITEM_EM_FALTA direto', { status: 422, data: { erro: 'ITEM_EM_FALTA' }, operacao: 'pedido' }, { ok: false, http: 422, codigo: 'ITEM_EM_FALTA', ambiguo: false }],
  ['401 do serviço', { status: 401, data: { erro: 'SVC_TOKEN_INVALIDO' }, operacao: 'pedido' }, { ok: false, http: 401, codigo: 'SVC_TOKEN_INVALIDO', ambiguo: false }],
  ['404 do HUB', { status: 404, data: { erro: 'PEDIDO_NAO_ENCONTRADO' }, operacao: 'detalhe' }, { ok: false, http: 404, codigo: 'PEDIDO_NAO_ENCONTRADO', ambiguo: false }],
  // 5xx com código determinístico: o HUB garante que nada saiu para o CW (§5.1).
  ['503 CW_RATE_LIMIT', { status: 503, data: { erro: 'CW_RATE_LIMIT' }, operacao: 'pedido' }, { ok: false, http: 503, codigo: 'CW_RATE_LIMIT', ambiguo: false }],
  ['503 HUB_SEM_PARTNER_KEY', { status: 503, data: { erro: 'HUB_SEM_PARTNER_KEY' }, operacao: 'pedido' }, { ok: false, http: 503, codigo: 'HUB_SEM_PARTNER_KEY', ambiguo: false }],
  ['503 HUB_CONFIG_INVALIDA', { status: 503, data: { erro: 'HUB_CONFIG_INVALIDA' }, operacao: 'pedido' }, { ok: false, http: 503, codigo: 'HUB_CONFIG_INVALIDA', ambiguo: false }],
  // 502 CW_INDISPONIVEL: quem diz se foi ambíguo é o HUB, que sabe onde parou.
  ['502 CW_INDISPONIVEL ambiguo:true', { status: 502, data: { erro: 'CW_INDISPONIVEL', ambiguo: true }, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'CW_INDISPONIVEL', ambiguo: true }],
  ['502 CW_INDISPONIVEL ambiguo:false', { status: 502, data: { erro: 'CW_INDISPONIVEL', ambiguo: false }, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'CW_INDISPONIVEL', ambiguo: false }],
  ['502 CW_INDISPONIVEL no cotar', { status: 502, data: { erro: 'CW_INDISPONIVEL' }, operacao: 'cotar' }, { ok: false, http: 502, codigo: 'CW_INDISPONIVEL', ambiguo: false }],
  // 5xx sem código conhecido: ambíguo no pedido, determinístico no resto.
  ['500 sem corpo (pedido)', { status: 500, data: null, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }],
  ['500 ERRO_INTERNO (pedido)', { status: 500, data: { erro: 'ERRO_INTERNO' }, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }],
  ['504 do Nginx (pedido)', { status: 504, data: null, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }],
  ['500 no bootstrap', { status: 500, data: null, operacao: 'bootstrap' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: false }],
  // Rede/timeout: no pedido é sempre ambíguo (o HUB pode ter criado).
  ['timeout no pedido', { timeout: true, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }],
  ['timeout no cotar', { timeout: true, operacao: 'cotar' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: false }],
  ['rede caiu no pedido', { falha: true, operacao: 'pedido' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }],
  ['rede caiu no bootstrap', { falha: true, operacao: 'bootstrap' }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: false }],
];

test('interpretarRespostaHub: tabela status → {http, codigo, ambiguo}', () => {
  for (const [nome, entrada, esperado] of CASOS) {
    const r = interpretarRespostaHub(entrada);
    for (const [chave, valor] of Object.entries(esperado)) assert.equal(r[chave], valor, `${nome}: ${chave}`);
  }
});

test('interpretarRespostaHub: 2xx devolve o corpo; erro devolve o corpo do HUB', () => {
  const ok = interpretarRespostaHub({ status: 200, data: { total: 13.5 }, operacao: 'cotar' });
  assert.deepEqual(ok.data, { total: 13.5 });
  assert.equal(ok.ok, true);
  // 2xx sem JSON legível não vira erro, vira corpo vazio (o outbox classifica como AMBIGUO).
  assert.deepEqual(interpretarRespostaHub({ status: 201, data: null, operacao: 'pedido' }), { ok: true, status: 201, data: {} });
  const rej = interpretarRespostaHub({ status: 422, data: { erro: 'CW_RECUSOU', detalhes: [{ codigo: 'ITEM_EM_FALTA' }] }, operacao: 'pedido' });
  assert.deepEqual(rej.data.detalhes, [{ codigo: 'ITEM_EM_FALTA' }]);
});

test('interpretarRespostaHub: no pedido, 4xx só é determinístico com código conhecido', () => {
  // A diferença importa: código conhecido = o HUB sabe onde parou e nada foi criado; código
  // desconhecido num 4xx é caminho que ninguém previu — e aí não se afirma nada.
  for (const erro of ['COTACAO_DIVERGENTE', 'COTACAO_EXPIRADA', 'COTACAO_INVALIDA', 'CW_RECUSOU', 'CLIENTE_SEM_CW', 'REFERENCIA_OBRIGATORIA', 'CLIENTE_ID_OBRIGATORIO', 'ORDER_TYPE_INVALIDO', 'SVC_TOKEN_INVALIDO', 'SVC_NAO_AUTORIZADO', 'MODO_INDISPONIVEL', 'ITEM_EM_FALTA', 'GRUPO_OBRIGATORIO', 'PAGAMENTO_INVALIDO']) {
    const r = interpretarRespostaHub({ status: 422, data: { erro }, operacao: 'pedido' });
    assert.equal(r.ambiguo, false, `${erro} deveria ser determinístico`);
    assert.equal(r.codigo, erro);
  }
  for (const data of [{}, null, { erro: '' }, { erro: 'CODIGO_QUE_NAO_EXISTE' }, { mensagem: 'sem erro' }]) {
    assert.equal(interpretarRespostaHub({ status: 400, data, operacao: 'pedido' }).ambiguo, true, JSON.stringify(data));
    // Fora do pedido não há o que ficar ambíguo: nada é criado em bootstrap/cotar/detalhe.
    assert.equal(interpretarRespostaHub({ status: 400, data, operacao: 'cotar' }).ambiguo, false);
  }
});

test('interpretarRespostaHub: 502 CW_INDISPONIVEL sem o campo ambiguo é ambíguo NO PEDIDO', () => {
  // Lado seguro: se o HUB (por bug) não disser, no pedido a gente não afirma que nada foi criado.
  assert.equal(interpretarRespostaHub({ status: 502, data: { erro: 'CW_INDISPONIVEL' }, operacao: 'pedido' }).ambiguo, true);
  assert.equal(interpretarRespostaHub({ status: 502, data: { erro: 'CW_INDISPONIVEL' }, operacao: 'cotar' }).ambiguo, false);
});

test('interpretarRespostaHub: status ilegível é tratado como rede caída', () => {
  for (const status of [undefined, null, NaN, 'oops']) {
    const r = interpretarRespostaHub({ status, operacao: 'pedido' });
    assert.equal(r.codigo, 'HUB_INDISPONIVEL');
    assert.equal(r.ambiguo, true);
  }
});

// ── Ambiente ausente: falha ANTES de qualquer rede ──────────────────────────
const comEnv = async (env, fn) => {
  const antes = { HUB_API_URL: process.env.HUB_API_URL, JWT_SECRET: process.env.JWT_SECRET };
  for (const [k, v] of Object.entries(env)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); }
  finally { for (const [k, v] of Object.entries(antes)) { if (v == null) delete process.env[k]; else process.env[k] = v; } }
};

// fetch falso que grava a chamada. Se um teste de "sem env" passar por aqui, quebra.
function espiao(resposta = { status: 200, corpo: {} }) {
  const chamadas = [];
  const sinais = [];
  const fetch = async (url, init) => {
    chamadas.push({ url, init });
    return {
      status: resposta.status,
      ok: resposta.status >= 200 && resposta.status < 300,
      text: async () => (typeof resposta.corpo === 'string' ? resposta.corpo : JSON.stringify(resposta.corpo)),
    };
  };
  return { chamadas, sinais, deps: { fetch, sinal: (msLimite) => { sinais.push(msLimite); return undefined; } } };
}

test('sem HUB_API_URL: HUB_NAO_CONFIGURADO e NENHUMA chamada de rede', async () => {
  await comEnv({ HUB_API_URL: null, JWT_SECRET: 'segredo-de-teste' }, async () => {
    const e = espiao();
    for (const chamar of [
      () => bootstrapTotemCW('loja-1', e.deps),
      () => cotarTotemCW('loja-1', { orderType: 'onsite' }, e.deps),
      () => criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, e.deps),
      () => detalheTotemCW('loja-1', 42, e.deps),
      () => reconciliarTotemCW('loja-1', { orderId: 'TOTEM-x' }, e.deps),
    ]) {
      const r = await chamar();
      assert.deepEqual({ ok: r.ok, http: r.http, codigo: r.codigo, ambiguo: r.ambiguo }, { ok: false, http: 503, codigo: 'HUB_NAO_CONFIGURADO', ambiguo: false });
    }
    assert.equal(e.chamadas.length, 0, 'o fetch NÃO pode ser chamado sem configuração');
  });
});

test('sem JWT_SECRET: HUB_NAO_CONFIGURADO e NENHUMA chamada de rede', async () => {
  await comEnv({ HUB_API_URL: 'http://127.0.0.1:9/api', JWT_SECRET: null }, async () => {
    const e = espiao();
    const r = await criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, e.deps);
    assert.equal(r.codigo, 'HUB_NAO_CONFIGURADO');
    assert.equal(r.ambiguo, false);
    assert.equal(e.chamadas.length, 0);
  });
});

// ── Requisição montada ──────────────────────────────────────────────────────
const ENV_OK = { HUB_API_URL: 'http://127.0.0.1:9/api', JWT_SECRET: 'segredo-de-teste' };

test('cada função POSTa no endpoint interno certo, com JWT de serviço do PDV', async () => {
  await comEnv(ENV_OK, async () => {
    const rotas = [
      ['cardapio-totem-bootstrap', (deps) => bootstrapTotemCW('loja-1', deps)],
      ['cardapio-totem-cotar', (deps) => cotarTotemCW('loja-1', { orderType: 'onsite' }, deps)],
      ['cardapio-totem-pedido', (deps) => criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, deps)],
      ['cardapio-totem-detalhe', (deps) => detalheTotemCW('loja-1', 42, deps)],
      ['cardapio-totem-reconciliar', (deps) => reconciliarTotemCW('loja-1', { orderId: 'TOTEM-x' }, deps)],
    ];
    for (const [rota, chamar] of rotas) {
      const e = espiao({ status: 200, corpo: { ok: true } });
      const r = await chamar(e.deps);
      assert.equal(r.ok, true);
      assert.equal(e.chamadas.length, 1);
      const { url, init } = e.chamadas[0];
      assert.equal(url, `http://127.0.0.1:9/api/internal/${rota}`);
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/json');
      const token = String(init.headers.Authorization).replace('Bearer ', '');
      const payload = jwt.verify(token, ENV_OK.JWT_SECRET);
      assert.equal(payload.svc, 'pdv-operacao');
      assert.ok(payload.exp - payload.iat <= 120, 'o token de serviço vale no máximo 2 min');
      assert.equal(JSON.parse(init.body).clienteId, 'loja-1');
    }
  });
});

test('o clienteId do SERVIDOR vence qualquer clienteId que venha no corpo', async () => {
  await comEnv(ENV_OK, async () => {
    for (const chamar of [
      (deps) => cotarTotemCW('loja-real', { clienteId: 'invasor', empresaId: 99, orderType: 'onsite' }, deps),
      (deps) => criarPedidoTotemCW('loja-real', { clienteId: 'invasor', orderType: 'onsite' }, deps),
      (deps) => reconciliarTotemCW('loja-real', { clienteId: 'invasor', orderId: 'TOTEM-x' }, deps),
    ]) {
      const e = espiao();
      await chamar(e.deps);
      const corpo = JSON.parse(e.chamadas[0].init.body);
      assert.equal(corpo.clienteId, 'loja-real');
      assert.ok(!JSON.stringify(corpo.clienteId).includes('invasor'));
    }
  });
});

test('timeout: 60 s no pedido, 15 s no resto', async () => {
  assert.equal(TIMEOUT_PEDIDO_MS, 60_000);
  assert.equal(TIMEOUT_PADRAO_MS, 15_000);
  await comEnv(ENV_OK, async () => {
    const p = espiao(); await criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, p.deps);
    assert.deepEqual(p.sinais, [60_000]);
    const c = espiao(); await cotarTotemCW('loja-1', { orderType: 'onsite' }, c.deps);
    assert.deepEqual(c.sinais, [15_000]);
    const b = espiao(); await bootstrapTotemCW('loja-1', b.deps);
    assert.deepEqual(b.sinais, [15_000]);
    const d = espiao(); await detalheTotemCW('loja-1', 42, d.deps);
    assert.deepEqual(d.sinais, [15_000]);
    const rc = espiao(); await reconciliarTotemCW('loja-1', { orderId: 'TOTEM-x' }, rc.deps);
    assert.deepEqual(rc.sinais, [15_000]);
  });
});

test('nunca lança: fetch que estoura vira resultado (ambíguo só no pedido)', async () => {
  await comEnv(ENV_OK, async () => {
    const erroDeRede = { fetch: async () => { const e = new Error('fetch failed'); e.name = 'TypeError'; throw e; }, sinal: () => undefined };
    const timeout = { fetch: async () => { const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e; }, sinal: () => undefined };
    for (const deps of [erroDeRede, timeout]) {
      const pedido = await criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, deps);
      assert.deepEqual({ ok: pedido.ok, http: pedido.http, codigo: pedido.codigo, ambiguo: pedido.ambiguo }, { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true });
      const cotar = await cotarTotemCW('loja-1', { orderType: 'onsite' }, deps);
      assert.equal(cotar.ambiguo, false);
    }
  });
});

test('corpo não-JSON: 2xx vira corpo vazio, 5xx vira HUB_INDISPONIVEL', async () => {
  await comEnv(ENV_OK, async () => {
    const html = espiao({ status: 200, corpo: '<html>proxy</html>' });
    const ok = await criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, html.deps);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.data, {});
    const erro = espiao({ status: 502, corpo: '<html>bad gateway</html>' });
    const r = await criarPedidoTotemCW('loja-1', { orderType: 'onsite' }, erro.deps);
    assert.equal(r.codigo, 'HUB_INDISPONIVEL');
    assert.equal(r.ambiguo, true);
  });
});

test('a ponte não loga nada: token de serviço nunca vai para o log', () => {
  // Normalizado: ver a nota em totem.tenant.test.js.
  const fonte = readFileSync(new URL('./cardapioPedido.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = fonte.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.equal(codigo.match(/console\./), null, 'a ponte não deve logar (o resultado carrega o que interessa)');
  assert.equal(codigo.match(/Authorization[^\n]*console/), null);
});
