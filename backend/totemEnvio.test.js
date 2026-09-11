// Outbox do totem — máquina de estados (spec §5.3), classificação da resposta do HUB
// (§4.7/§7) e janelas do job (§5.4). Tudo puro: nenhuma linha aqui toca banco, rede ou
// Express. É de propósito — o que decide se um pedido do cliente virou CRIADO, REJEITADO
// ou AMBIGUO é a parte que não pode errar, e ela precisa ser testável sem infraestrutura.
//
// A regra do dinheiro, repetida em vários testes abaixo porque é a razão do módulo:
// AMBIGUO é o lado seguro. Nada vira falha sozinho, nada convida o cliente a repetir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS, ORDER_TYPES, JANELA_REVISAO_MS, JANELA_RECONCILIACAO_MS, TICKS_REVISAO, JANELA_DISPLAY_MS, JANELA_ENVIANDO_MS,
  EVENTO_DO_DESFECHO, novaReferencia, classificarResposta, transicao, proximaAcaoJob, precisaDisplay,
  respostaPublica, corpoDaResposta, httpDaResposta, validarCorpoPedido, camposDoDesfecho, bootstrapPublico, respostaSegura,
} from './totemEnvio.js';

const UUID = '9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

// ── Constantes do contrato ───────────────────────────────────────────────────
test('constantes: estados, modos e janelas da spec', () => {
  assert.deepEqual(ESTADOS, ['ENVIANDO', 'CRIADO', 'REJEITADO', 'AMBIGUO', 'REVISAO_MANUAL', 'ENCERRADO_MANUAL']);
  assert.deepEqual(ORDER_TYPES, ['onsite', 'takeout']);
  assert.equal(JANELA_REVISAO_MS, 30 * 60_000);
  assert.equal(JANELA_RECONCILIACAO_MS, 24 * 3600_000);
  assert.equal(JANELA_DISPLAY_MS, 24 * 3600_000);
  assert.equal(TICKS_REVISAO, 5);
  assert.equal(JANELA_ENVIANDO_MS, 5 * 60_000);
});

// ── novaReferencia ──────────────────────────────────────────────────────────
test('novaReferencia: estável para o mesmo uuid e independente do id do registro', () => {
  const a = novaReferencia(7, UUID);
  assert.deepEqual(a, { orderId: `TOTEM-${UUID}`, displayIdEnviado: 'T7-9F1C2D' });
  // Mesma entrada, mesma saída (pura): a referência nasce ANTES do INSERT, então não
  // pode depender de nada que só exista depois de gravar.
  assert.deepEqual(novaReferencia(7, UUID), a);
  // O orderId (chave de reconciliação no CW) não carrega id de aparelho nem do envio.
  assert.equal(novaReferencia(999, UUID).orderId, a.orderId);
  assert.ok(!a.orderId.includes('7-'));
  // Só o displayIdEnviado (etiqueta de balcão) identifica o aparelho.
  assert.equal(novaReferencia(12, UUID).displayIdEnviado, 'T12-9F1C2D');
  // uuid diferente = referência diferente.
  assert.notEqual(novaReferencia(7, '11111111-2222-3333-4444-555555555555').orderId, a.orderId);
});

// ── classificarResposta ─────────────────────────────────────────────────────
// A tabela inteira do §7: só o que é comprovadamente pré-criação vira REJEITADO.
const CASOS_CLASSIFICACAO = [
  ['201 com cwOrderId inteiro', { ok: true, status: 201, data: { criado: true, cwOrderId: 88, cwStatus: 'pending' } }, 'CRIADO'],
  ['201 sem cwOrderId', { ok: true, status: 201, data: { criado: true } }, 'AMBIGUO'],
  ['201 com cwOrderId não inteiro', { ok: true, status: 201, data: { criado: true, cwOrderId: '88' } }, 'AMBIGUO'],
  ['201 sem criado:true', { ok: true, status: 201, data: { cwOrderId: 88 } }, 'AMBIGUO'],
  ['200 (contrato quebrado)', { ok: true, status: 200, data: { criado: true, cwOrderId: 88 } }, 'AMBIGUO'],
  ['2xx com corpo vazio', { ok: true, status: 204, data: {} }, 'AMBIGUO'],
  ['422 COTACAO_INVALIDA', { ok: false, http: 422, codigo: 'COTACAO_INVALIDA', ambiguo: false }, 'REJEITADO'],
  ['422 CW_RECUSOU', { ok: false, http: 422, codigo: 'CW_RECUSOU', ambiguo: false }, 'REJEITADO'],
  ['409 COTACAO_DIVERGENTE', { ok: false, http: 409, codigo: 'COTACAO_DIVERGENTE', ambiguo: false }, 'REJEITADO'],
  ['400 CORPO_INVALIDO do HUB', { ok: false, http: 400, codigo: 'ORDER_TYPE_INVALIDO', ambiguo: false }, 'REJEITADO'],
  ['401 do serviço', { ok: false, http: 401, codigo: 'SVC_TOKEN_INVALIDO', ambiguo: false }, 'REJEITADO'],
  ['503 CW_RATE_LIMIT (determinístico)', { ok: false, http: 503, codigo: 'CW_RATE_LIMIT', ambiguo: false }, 'REJEITADO'],
  ['503 HUB_SEM_PARTNER_KEY (determinístico)', { ok: false, http: 503, codigo: 'HUB_SEM_PARTNER_KEY', ambiguo: false }, 'REJEITADO'],
  ['502 CW_INDISPONIVEL ambíguo', { ok: false, http: 502, codigo: 'CW_INDISPONIVEL', ambiguo: true }, 'AMBIGUO'],
  ['500 do HUB', { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }, 'AMBIGUO'],
  ['timeout/rede', { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true }, 'AMBIGUO'],
];

test('classificarResposta: tabela do §7 (ambíguo é o lado seguro)', () => {
  for (const [nome, resultado, esperado] of CASOS_CLASSIFICACAO) {
    assert.equal(classificarResposta(resultado), esperado, nome);
  }
});

test('classificarResposta: resposta malformada ou sem ambiguo cai em AMBIGUO', () => {
  // Sem o campo `ambiguo` ninguém pode afirmar que nada foi criado.
  assert.equal(classificarResposta({ ok: false, http: 502, codigo: 'HUB_INDISPONIVEL' }), 'AMBIGUO');
  assert.equal(classificarResposta({}), 'AMBIGUO');
  assert.equal(classificarResposta(null), 'AMBIGUO');
  assert.equal(classificarResposta(undefined), 'AMBIGUO');
  assert.equal(classificarResposta('erro'), 'AMBIGUO');
  // Nunca devolve um 4º valor.
  for (const [, r] of CASOS_CLASSIFICACAO) assert.ok(['CRIADO', 'REJEITADO', 'AMBIGUO'].includes(classificarResposta(r)));
});

test('EVENTO_DO_DESFECHO liga a classificação ao evento da máquina', () => {
  assert.deepEqual(EVENTO_DO_DESFECHO, { CRIADO: 'criado', REJEITADO: 'rejeitado', AMBIGUO: 'ambiguo' });
  for (const desfecho of ['CRIADO', 'REJEITADO', 'AMBIGUO']) {
    assert.equal(transicao('ENVIANDO', EVENTO_DO_DESFECHO[desfecho]), desfecho);
  }
});

// ── transicao ───────────────────────────────────────────────────────────────
const PERMITIDAS = [
  ['ENVIANDO', 'criado', 'CRIADO'],
  ['ENVIANDO', 'rejeitado', 'REJEITADO'],
  ['ENVIANDO', 'ambiguo', 'AMBIGUO'],
  ['AMBIGUO', 'reconciliado', 'CRIADO'],
  ['AMBIGUO', 'confirmadoManual', 'CRIADO'],
  ['AMBIGUO', 'revisao', 'REVISAO_MANUAL'],
  ['REVISAO_MANUAL', 'reconciliado', 'CRIADO'],
  ['REVISAO_MANUAL', 'confirmadoManual', 'CRIADO'],
  ['REVISAO_MANUAL', 'encerradoManual', 'ENCERRADO_MANUAL'],
];
const EVENTOS = ['criado', 'rejeitado', 'ambiguo', 'reconciliado', 'revisao', 'confirmadoManual', 'encerradoManual'];

test('transicao: todas as permitidas da spec §5.3', () => {
  for (const [de, evento, para] of PERMITIDAS) assert.equal(transicao(de, evento), para, `${de} --${evento}--> ${para}`);
});

test('transicao: TODA transição fora da tabela lança (matriz completa)', () => {
  const permitida = new Set(PERMITIDAS.map(([de, ev]) => `${de}|${ev}`));
  let proibidas = 0;
  for (const de of ESTADOS) {
    for (const evento of EVENTOS) {
      if (permitida.has(`${de}|${evento}`)) continue;
      assert.throws(() => transicao(de, evento), (e) => e.message === `TRANSICAO_PROIBIDA:${de}->${evento}`, `${de} --${evento}--> deveria lançar`);
      proibidas += 1;
    }
  }
  assert.equal(proibidas, ESTADOS.length * EVENTOS.length - PERMITIDAS.length);
});

test('transicao: AMBIGUO e REVISAO_MANUAL nunca viram falha nem voltam a ENVIANDO', () => {
  // O coração da regra do Junior: ambiguidade NÃO vira rejeição automática (senão o
  // cliente refaria um pedido que talvez já exista no CW) e não volta para ENVIANDO
  // (senão haveria re-POST com o mesmo orderId).
  for (const de of ['AMBIGUO', 'REVISAO_MANUAL']) {
    for (const evento of ['rejeitado', 'criado', 'ambiguo']) {
      assert.throws(() => transicao(de, evento), /TRANSICAO_PROIBIDA/, `${de} --${evento}-->`);
    }
  }
  // Só sai de AMBIGUO/REVISAO_MANUAL para CRIADO (achado no CW) ou, no manual, ENCERRADO.
  assert.deepEqual(PERMITIDAS.filter(([de]) => de === 'AMBIGUO').map(([, , para]) => para).sort(), ['CRIADO', 'CRIADO', 'REVISAO_MANUAL']);
  assert.deepEqual(PERMITIDAS.filter(([de]) => de === 'REVISAO_MANUAL').map(([, , para]) => para).sort(), ['CRIADO', 'CRIADO', 'ENCERRADO_MANUAL']);
  // ENCERRADO_MANUAL só nasce de REVISAO_MANUAL — nunca direto de AMBIGUO.
  assert.deepEqual(PERMITIDAS.filter(([, , para]) => para === 'ENCERRADO_MANUAL').map(([de]) => de), ['REVISAO_MANUAL']);
});

test('transicao: estados terminais não aceitam nada', () => {
  for (const de of ['CRIADO', 'REJEITADO', 'ENCERRADO_MANUAL']) {
    for (const evento of EVENTOS) assert.throws(() => transicao(de, evento), /TRANSICAO_PROIBIDA/, `${de} --${evento}-->`);
  }
});

test('transicao: estado/evento desconhecido lança (nada de herança do Object)', () => {
  assert.throws(() => transicao('ENVIANDO', 'constructor'), /TRANSICAO_PROIBIDA/);
  assert.throws(() => transicao('toString', 'criado'), /TRANSICAO_PROIBIDA/);
  assert.throws(() => transicao(undefined, undefined), /TRANSICAO_PROIBIDA/);
});

// ── proximaAcaoJob ──────────────────────────────────────────────────────────
const AGORA = new Date('2026-09-11T12:00:00.000Z');
const minutosAtras = (m) => new Date(AGORA.getTime() - m * 60_000);
const horasAtras = (h) => new Date(AGORA.getTime() - h * 3600_000);

test('proximaAcaoJob: AMBIGUO reconcilia até 30 min e depois pede revisão', () => {
  assert.equal(proximaAcaoJob({ status: 'AMBIGUO', tentadoEm: minutosAtras(0) }, AGORA, 1), 'RECONCILIAR');
  assert.equal(proximaAcaoJob({ status: 'AMBIGUO', tentadoEm: minutosAtras(29) }, AGORA, 1), 'RECONCILIAR');
  assert.equal(proximaAcaoJob({ status: 'AMBIGUO', tentadoEm: minutosAtras(31) }, AGORA, 1), 'REVISAO');
  // Todo tick, não a cada 5: AMBIGUO é o caso urgente.
  for (const tick of [1, 2, 3, 4, 5]) assert.equal(proximaAcaoJob({ status: 'AMBIGUO', tentadoEm: minutosAtras(10) }, AGORA, tick), 'RECONCILIAR');
});

test('proximaAcaoJob: REVISAO_MANUAL só a cada 5 ticks e só dentro de 24 h', () => {
  const envio = { status: 'REVISAO_MANUAL', tentadoEm: horasAtras(2) };
  assert.equal(proximaAcaoJob(envio, AGORA, 5), 'RECONCILIAR');
  assert.equal(proximaAcaoJob(envio, AGORA, 10), 'RECONCILIAR');
  assert.equal(proximaAcaoJob(envio, AGORA, 4), 'NADA');
  assert.equal(proximaAcaoJob(envio, AGORA, 1), 'NADA');
  // Passadas 24 h o updated_since do CW já não aceita a janela: o job para (e o estado
  // NÃO muda — quem decide dali em diante é o admin).
  assert.equal(proximaAcaoJob({ status: 'REVISAO_MANUAL', tentadoEm: horasAtras(25) }, AGORA, 5), 'NADA');
  assert.equal(proximaAcaoJob({ status: 'REVISAO_MANUAL', tentadoEm: horasAtras(23) }, AGORA, 5), 'RECONCILIAR');
});

test('proximaAcaoJob: ENVIANDO parado há mais de 5 min vira AMBIGUAR', () => {
  // O processo pode ter caído entre o INSERT e a gravação do desfecho. A linha não pode
  // ficar ENVIANDO para sempre (o job nem a olharia): passa a AMBIGUO — que é justamente
  // "não sei se foi criado" — e entra na reconciliação normal. Não é estado de falha.
  assert.equal(proximaAcaoJob({ status: 'ENVIANDO', tentadoEm: minutosAtras(4) }, AGORA, 1), 'NADA');
  assert.equal(proximaAcaoJob({ status: 'ENVIANDO', tentadoEm: minutosAtras(6) }, AGORA, 1), 'AMBIGUAR');
  // Um pedido em curso (a ponte espera até 60 s) nunca é promovido no meio do caminho.
  assert.equal(proximaAcaoJob({ status: 'ENVIANDO', tentadoEm: minutosAtras(0) }, AGORA, 1), 'NADA');
  // Sem tentadoEm legível não se promove nada (o lado seguro é não mexer).
  assert.equal(proximaAcaoJob({ status: 'ENVIANDO', tentadoEm: null }, AGORA, 1), 'NADA');
  // Vale em todo tick, não a cada 5.
  for (const tick of [1, 2, 3, 4, 5]) assert.equal(proximaAcaoJob({ status: 'ENVIANDO', tentadoEm: minutosAtras(90) }, AGORA, tick), 'AMBIGUAR');
});

test('proximaAcaoJob: nunca devolve falha e ignora o resto', () => {
  const acoes = new Set();
  for (const status of ESTADOS) {
    for (const tentadoEm of [minutosAtras(1), minutosAtras(45), horasAtras(30), null, undefined, 'lixo']) {
      for (const tick of [0, 1, 4, 5, 7, 10]) acoes.add(proximaAcaoJob({ status, tentadoEm }, AGORA, tick));
    }
  }
  assert.deepEqual([...acoes].sort(), ['AMBIGUAR', 'NADA', 'RECONCILIAR', 'REVISAO']);
  for (const status of ['CRIADO', 'REJEITADO', 'ENCERRADO_MANUAL']) {
    assert.equal(proximaAcaoJob({ status, tentadoEm: minutosAtras(45) }, AGORA, 5), 'NADA');
  }
  assert.equal(proximaAcaoJob(null, AGORA, 5), 'NADA');
  // tentadoEm ilegível não pode virar revisão silenciosa: reconcilia (lado seguro).
  assert.equal(proximaAcaoJob({ status: 'AMBIGUO', tentadoEm: null }, AGORA, 1), 'RECONCILIAR');
});

// ── precisaDisplay ──────────────────────────────────────────────────────────
test('precisaDisplay: só CRIADO, sem cwDisplayId e dentro de 24 h', () => {
  assert.equal(precisaDisplay({ status: 'CRIADO', cwDisplayId: null, criadoEm: minutosAtras(5) }, AGORA), true);
  assert.equal(precisaDisplay({ status: 'CRIADO', cwDisplayId: undefined, criadoEm: minutosAtras(5) }, AGORA), true);
  assert.equal(precisaDisplay({ status: 'CRIADO', cwDisplayId: 1234, criadoEm: minutosAtras(5) }, AGORA), false);
  assert.equal(precisaDisplay({ status: 'CRIADO', cwDisplayId: null, criadoEm: horasAtras(25) }, AGORA), false);
  assert.equal(precisaDisplay({ status: 'AMBIGUO', cwDisplayId: null, criadoEm: minutosAtras(5) }, AGORA), false);
  assert.equal(precisaDisplay({ status: 'CRIADO', cwDisplayId: null, criadoEm: null }, AGORA), false);
  assert.equal(precisaDisplay(null, AGORA), false);
});

// ── resposta ao aparelho ────────────────────────────────────────────────────
const ENVIO_CRIADO = {
  id: 31, empresaId: 3, dispositivoId: 7, status: 'CRIADO', cwOrderId: 4242, cwDisplayId: 17,
  totalCalculado: '13.50', displayIdEnviado: 'T7-9F1C2D', erroCodigo: null, erroDetalhe: null,
  orderId: `TOTEM-${UUID}`, chaveIdempotencia: 'abc12345', carrinhoJson: { segredo: 'nao vaza' },
};

test('respostaPublica: só o que o totem precisa ver', () => {
  assert.deepEqual(respostaPublica(ENVIO_CRIADO), {
    envioId: 31, status: 'CRIADO', cwOrderId: 4242, cwDisplayId: 17, total: 13.5, referencia: 'T7-9F1C2D',
  });
  // Nada de carrinho, cotação, orderId interno, empresaId ou chave de idempotência.
  const chaves = Object.keys(respostaPublica(ENVIO_CRIADO)).sort();
  assert.deepEqual(chaves, ['cwDisplayId', 'cwOrderId', 'envioId', 'referencia', 'status', 'total']);
  const r = respostaPublica({ id: 9, status: 'AMBIGUO', displayIdEnviado: 'T7-AAAAAA' });
  assert.deepEqual(r, { envioId: 9, status: 'AMBIGUO', cwOrderId: null, cwDisplayId: null, total: null, referencia: 'T7-AAAAAA' });
});

test('httpDaResposta: 201 criado, 202 em andamento, 422 quando nada foi criado', () => {
  assert.equal(httpDaResposta({ status: 'CRIADO' }), 201);
  for (const status of ['ENVIANDO', 'AMBIGUO', 'REVISAO_MANUAL']) assert.equal(httpDaResposta({ status }), 202, status);
  assert.equal(httpDaResposta({ status: 'REJEITADO' }), 422);
  assert.equal(httpDaResposta({ status: 'ENCERRADO_MANUAL' }), 422);
  // Cotação furada é 409 (§5.2/§7): o totem volta para Revisar com "Preços atualizados",
  // e isso é diferente de "o CW recusou o pedido" (422).
  assert.equal(httpDaResposta({ status: 'REJEITADO', erroCodigo: 'COTACAO_DIVERGENTE' }), 409);
  assert.equal(httpDaResposta({ status: 'REJEITADO', erroCodigo: 'COTACAO_EXPIRADA' }), 409);
  assert.equal(httpDaResposta({ status: 'REJEITADO', erroCodigo: 'CW_RECUSOU' }), 422);
  assert.equal(httpDaResposta({ status: 'REJEITADO', erroCodigo: 'COTACAO_INVALIDA' }), 422);
  // O 409 não muda o corpo: erro e detalhes continuam lá.
  assert.equal(corpoDaResposta({ status: 'REJEITADO', erroCodigo: 'COTACAO_EXPIRADA' }).erro, 'COTACAO_EXPIRADA');
  // Estado inesperado: 202 (em andamento) — nunca um 5xx que faça o totem repetir.
  assert.equal(httpDaResposta({ status: 'QUALQUER' }), 202);
  assert.equal(httpDaResposta(null), 202);
});

test('corpoDaResposta: REJEITADO leva erro e detalhes; nada convida a repetir', () => {
  const rejeitado = { id: 5, status: 'REJEITADO', displayIdEnviado: 'T7-BBBBBB', erroCodigo: 'COTACAO_DIVERGENTE', erroDetalhe: '[{"codigo":"PRECO"}]' };
  assert.equal(corpoDaResposta(rejeitado).erro, 'COTACAO_DIVERGENTE');
  assert.equal(corpoDaResposta(rejeitado).detalhes, '[{"codigo":"PRECO"}]');
  // Sem erroCodigo gravado, o próprio estado é a resposta (não inventamos código).
  assert.equal(corpoDaResposta({ id: 6, status: 'ENCERRADO_MANUAL' }).erro, 'ENCERRADO_MANUAL');
  // CRIADO/202 não ganham campo de erro.
  assert.equal('erro' in corpoDaResposta(ENVIO_CRIADO), false);
  assert.equal('erro' in corpoDaResposta({ id: 7, status: 'AMBIGUO' }), false);
  // Nenhuma chave sugere nova tentativa: o 202 do totem é "apresente este código".
  for (const envio of [ENVIO_CRIADO, rejeitado, { id: 7, status: 'AMBIGUO' }, { id: 8, status: 'REVISAO_MANUAL' }]) {
    for (const chave of Object.keys(corpoDaResposta(envio))) assert.ok(!/retry|tentar|repetir/i.test(chave), `chave ${chave}`);
    assert.ok(!/retry|tentar|repetir/i.test(JSON.stringify(Object.keys(corpoDaResposta(envio)))));
  }
});

// ── validarCorpoPedido ──────────────────────────────────────────────────────
const COTACAO = { hash: 'a'.repeat(64), expiraEm: '2026-09-11T12:10:00.000Z', assinatura: 'f'.repeat(64) };
const CORPO_OK = { chaveIdempotencia: 'chave_de-teste-01', orderType: 'onsite', carrinho: [{ itemId: '1', qtd: 1 }], metodoId: 'pix', cotacao: COTACAO };

test('validarCorpoPedido: corpo bom devolve só os 5 campos do pedido', () => {
  const r = validarCorpoPedido(CORPO_OK);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.valor).sort(), ['carrinho', 'chaveIdempotencia', 'cotacao', 'metodoId', 'orderType']);
  assert.deepEqual(r.valor.cotacao, COTACAO);
  assert.deepEqual(Object.keys(r.valor.cotacao).sort(), ['assinatura', 'expiraEm', 'hash']);
});

test('validarCorpoPedido: identidade do corpo é DESCARTADA (regra do Junior)', () => {
  const hostil = {
    ...CORPO_OK, empresaId: 99, clienteId: 'outro-cliente', dispositivoId: 12345, aparelhoId: 1,
    cotacao: { ...COTACAO, clienteId: 'outro-cliente', empresaId: 99 },
  };
  const r = validarCorpoPedido(hostil);
  assert.equal(r.ok, true);
  const serializado = JSON.stringify(r.valor);
  for (const proibido of ['empresaId', 'clienteId', 'dispositivoId', 'aparelhoId', 'outro-cliente', '12345', '99']) {
    assert.ok(!serializado.includes(proibido), `vazou ${proibido}: ${serializado}`);
  }
});

test('validarCorpoPedido: recusa o que não dá para gravar nem cotar', () => {
  const ruim = (patch) => validarCorpoPedido({ ...CORPO_OK, ...patch });
  for (const patch of [
    { chaveIdempotencia: 'curta' }, { chaveIdempotencia: 'x'.repeat(65) }, { chaveIdempotencia: 'com espaço aqui' },
    { chaveIdempotencia: undefined }, { orderType: 'delivery' }, { orderType: '' }, { orderType: undefined },
    { carrinho: [] }, { carrinho: 'itens' }, { carrinho: undefined }, { metodoId: '' }, { metodoId: undefined },
    { cotacao: undefined }, { cotacao: {} }, { cotacao: { ...COTACAO, hash: 'abc' } },
    { cotacao: { ...COTACAO, hash: 'z'.repeat(64) } }, { cotacao: { ...COTACAO, assinatura: '' } },
    { cotacao: { ...COTACAO, expiraEm: '' } },
  ]) {
    const r = ruim(patch);
    assert.equal(r.ok, false, `deveria recusar ${JSON.stringify(patch)}`);
    assert.equal(r.erro, 'CORPO_INVALIDO');
    assert.ok(Array.isArray(r.detalhes) && r.detalhes.length > 0);
  }
  for (const corpo of [null, undefined, 'texto', [], 42]) assert.equal(validarCorpoPedido(corpo).ok, false);
});

test('validarCorpoPedido: tetos de tamanho antes de gravar', () => {
  const linha = (extra = {}) => ({ itemId: '1', qtd: 1, ...extra });
  const com = (carrinho) => validarCorpoPedido({ ...CORPO_OK, carrinho });
  // 50 linhas passam; 51 não (o totem é um balcão, não um atacado — e o carrinho vai
  // inteiro para dentro do carrinhoJson).
  assert.equal(com(Array.from({ length: 50 }, () => linha())).ok, true);
  assert.equal(com(Array.from({ length: 51 }, () => linha())).ok, false);
  assert.equal(com([linha({ qtd: 99 })]).ok, true);
  assert.equal(com([linha({ qtd: 100 })]).ok, false);
  assert.equal(com([linha({ qtd: 0 })]).ok, false);
  assert.equal(com([linha({ qtd: 1.5 })]).ok, false);
  assert.equal(com(['nao é objeto']).ok, false);
  const grupos = (n, opcoes = 1) => Array.from({ length: n }, () => ({ grupoId: 'g', opcoes: Array.from({ length: opcoes }, () => ({ opcaoId: 'o', qtd: 1 })) }));
  assert.equal(com([linha({ grupos: grupos(30) })]).ok, true);
  assert.equal(com([linha({ grupos: grupos(31) })]).ok, false);
  assert.equal(com([linha({ grupos: grupos(1, 30) })]).ok, true);
  assert.equal(com([linha({ grupos: grupos(1, 31) })]).ok, false);
  assert.equal(com([linha({ grupos: 'nao é lista' })]).ok, false);
  for (const r of [com(Array.from({ length: 51 }, () => linha())), com([linha({ qtd: 100 })])]) {
    assert.equal(r.erro, 'CORPO_INVALIDO');
    assert.ok(r.detalhes.length > 0);
  }
});

// ── camposDoDesfecho ────────────────────────────────────────────────────────
test('camposDoDesfecho: CRIADO grava os números do CW', () => {
  const d = camposDoDesfecho('CRIADO', { ok: true, status: 201, data: { criado: true, cwOrderId: 4242, cwStatus: 'pending', cwDisplayId: 17, total: 13.5 } });
  assert.equal(d.cwOrderId, 4242);
  assert.equal(d.cwDisplayId, 17);
  assert.equal(d.cwStatusInicial, 'pending');
  assert.equal(Number(d.totalCalculado), 13.5);
  assert.equal(d.erroCodigo, null);
  // cwDisplayId pode vir nulo (o HUB não conseguiu o detalhe) — o pedido ESTÁ criado.
  const semDisplay = camposDoDesfecho('CRIADO', { ok: true, status: 201, data: { criado: true, cwOrderId: 1, cwDisplayId: null, detalheOk: false } });
  assert.equal(semDisplay.cwDisplayId, null);
  assert.equal(semDisplay.cwOrderId, 1);
});

test('camposDoDesfecho: REJEITADO/AMBIGUO gravam código e detalhe cortado em 2000', () => {
  const rej = camposDoDesfecho('REJEITADO', { ok: false, http: 422, codigo: 'CW_RECUSOU', ambiguo: false, data: { erro: 'CW_RECUSOU', detalhes: [{ codigo: 'ITEM_EM_FALTA' }] } });
  assert.equal(rej.erroCodigo, 'CW_RECUSOU');
  assert.ok(rej.erroDetalhe.includes('ITEM_EM_FALTA'));
  const amb = camposDoDesfecho('AMBIGUO', { ok: false, http: 502, codigo: 'CW_INDISPONIVEL', ambiguo: true, data: { erro: 'CW_INDISPONIVEL', detalhes: 'x'.repeat(5000) } });
  assert.equal(amb.erroCodigo, 'CW_INDISPONIVEL');
  assert.ok(amb.erroDetalhe.length <= 2000);
  // Sem corpo nenhum (timeout) ainda grava o código: o registro nunca fica mudo.
  const mudo = camposDoDesfecho('AMBIGUO', { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true, data: null });
  assert.equal(mudo.erroCodigo, 'HUB_INDISPONIVEL');
  assert.deepEqual(mudo.respostaJson, { status: 502 });
});

test('respostaSegura: a outbox guarda um recorte, nunca o corpo cru do HUB', () => {
  const r = respostaSegura({
    ok: true, status: 201,
    data: { criado: true, cwOrderId: 4242, cwDisplayId: 17, cwStatus: 'pending', total: 13.5, detalheOk: true, cliente: { nome: 'Fulano', telefone: '11999999999' }, tokenInterno: 'segredo' },
  });
  assert.deepEqual(Object.keys(r).sort(), ['cwDisplayId', 'cwOrderId', 'cwStatus', 'status', 'total']);
  const bruto = JSON.stringify(r);
  for (const vazamento of ['Fulano', '11999999999', 'segredo']) assert.ok(!bruto.includes(vazamento), `vazou ${vazamento}`);
  // Erro: guarda erro + detalhes cortados em 2000.
  const e = respostaSegura({ ok: false, http: 422, codigo: 'CW_RECUSOU', data: { erro: 'CW_RECUSOU', detalhes: 'x'.repeat(5000), corpoDoCw: { pedido: 'inteiro' } } });
  assert.deepEqual(Object.keys(e).sort(), ['detalhes', 'erro', 'status']);
  assert.ok(e.detalhes.length <= 2000);
  assert.equal(respostaSegura(null), null);
  assert.equal(respostaSegura({ ok: false }), null);
});

// ── bootstrapPublico ────────────────────────────────────────────────────────
test('bootstrapPublico: orderTypes vêm dos modos do CW, nunca do aparelho', () => {
  const em = AGORA;
  const b = bootstrapPublico({ operacional: { modos: { onsite: true, takeout: false } }, catalogo: { categorias: [] } }, em, false);
  assert.deepEqual(b.orderTypes, ['onsite']);
  assert.equal(b.snapshotEm, em);
  assert.equal('desatualizado' in b, false);
  assert.deepEqual(bootstrapPublico({ operacional: { modos: { onsite: true, takeout: true } } }, em, false).orderTypes, ['onsite', 'takeout']);
  assert.deepEqual(bootstrapPublico({}, em, false).orderTypes, []);
  assert.deepEqual(bootstrapPublico(null, em, true).orderTypes, []);
  assert.equal(bootstrapPublico({ operacional: { modos: { onsite: true } } }, em, true).desatualizado, true);
});
