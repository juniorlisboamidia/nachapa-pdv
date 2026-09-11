// Outbox do totem — o miolo do caminho do dinheiro (spec §5.2-§5.4).
// Módulo PURO: sem Prisma, sem Express, sem rede, sem Date.now() escondido (`agora` é
// sempre parâmetro). As rotas e o job em server.js só orquestram estas funções.
//
// A regra que manda em tudo aqui: depois que o cliente confirma, a única coisa pior que
// perder o pedido é criar DOIS. Então:
//  · toda dúvida (5xx, timeout, rede, 4xx inesperado, corpo estranho) é AMBIGUO;
//  · AMBIGUO/REVISAO_MANUAL NUNCA viram falha sozinhos nem voltam para ENVIANDO —
//    não existe re-POST automático com o mesmo orderId;
//  · a única saída automática de AMBIGUO é encontrar o pedido no CW (→ CRIADO);
//  · o que a máquina não resolve, um humano decide no admin (§5.5).
// Por isso a máquina de estados é uma tabela fechada e `transicao` LANÇA fora dela: um
// caminho novo tem de ser escrito aqui, de propósito, com teste.

export const ESTADOS = ['ENVIANDO', 'CRIADO', 'REJEITADO', 'AMBIGUO', 'REVISAO_MANUAL', 'ENCERRADO_MANUAL'];
export const ORDER_TYPES = ['onsite', 'takeout'];

export const JANELA_REVISAO_MS = 30 * 60_000;          // AMBIGUO sem solução em 30 min → REVISAO_MANUAL
export const JANELA_RECONCILIACAO_MS = 24 * 3600_000;  // updated_since do CW aceita no máximo 24 h
export const TICKS_REVISAO = 5;                        // REVISAO_MANUAL é reconciliado a cada 5 ticks (5 min)
export const JANELA_DISPLAY_MS = 24 * 3600_000;        // completar cwDisplayId só no primeiro dia

const LIMITE_DETALHE = 2000;   // erroDetalhe é para o admin ler, não para guardar o mundo
const LIMITE_CODIGO = 60;

// Instante em ms aceitando Date, number ou ISO. Ausente/ilegível = NaN, e toda
// comparação com NaN é falsa — é o que faz "sem data" cair no lado seguro.
const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : v ? new Date(v).getTime() : NaN);
const texto = (v, n) => (v == null ? null : String(v).slice(0, n));

// Referência do pedido, gerada ANTES do INSERT (§5.2 passo 3): o `uuid` entra por
// parâmetro (randomUUID() no chamador) para que a referência seja pura e testável.
// `orderId` é o que o CW guarda como external_order_id e o que a reconciliação procura —
// por isso não carrega id de aparelho nem do envio. `displayIdEnviado` é só etiqueta de
// balcão (não é senha, não é exclusiva).
export function novaReferencia(aparelhoId, uuid) {
  const u = String(uuid ?? '');
  return { orderId: `TOTEM-${u}`, displayIdEnviado: `T${aparelhoId}-${u.slice(0, 6).toUpperCase()}` };
}

// Resposta da ponte (cardapioPedido.js) → desfecho do envio. Só o que é comprovadamente
// pré-criação vira REJEITADO; o resto é AMBIGUO, inclusive um 2xx fora do contrato.
// ⚠️ `ambiguo` ausente conta como ambíguo: sem esse campo ninguém pode AFIRMAR que nada
// foi criado, e afirmar errado significa um segundo pedido no balcão.
export function classificarResposta(resultado) {
  const r = resultado && typeof resultado === 'object' ? resultado : null;
  if (!r) return 'AMBIGUO';
  if (r.ok === true) {
    const d = r.data ?? r.corpo ?? null;
    const status = Number(r.status ?? r.http);
    return status === 201 && d?.criado === true && Number.isInteger(d?.cwOrderId) ? 'CRIADO' : 'AMBIGUO';
  }
  return r.ambiguo === false ? 'REJEITADO' : 'AMBIGUO';
}

// Desfecho → evento da máquina de estados.
export const EVENTO_DO_DESFECHO = { CRIADO: 'criado', REJEITADO: 'rejeitado', AMBIGUO: 'ambiguo' };

// Tabela FECHADA de transições (§5.3). Mapa sem protótipo: 'constructor'/'toString' não
// podem virar um evento válido por acidente.
const TRANSICOES = new Map([
  ['ENVIANDO', new Map([['criado', 'CRIADO'], ['rejeitado', 'REJEITADO'], ['ambiguo', 'AMBIGUO']])],
  ['AMBIGUO', new Map([['reconciliado', 'CRIADO'], ['confirmadoManual', 'CRIADO'], ['revisao', 'REVISAO_MANUAL']])],
  ['REVISAO_MANUAL', new Map([['reconciliado', 'CRIADO'], ['confirmadoManual', 'CRIADO'], ['encerradoManual', 'ENCERRADO_MANUAL']])],
  // CRIADO, REJEITADO e ENCERRADO_MANUAL são terminais: nenhum evento sai deles.
]);

export function transicao(status, evento) {
  const destino = TRANSICOES.get(status)?.get(evento);
  if (!destino) throw new Error(`TRANSICAO_PROIBIDA:${status}->${evento}`);
  return destino;
}

// O que o job faz com um envio neste tick (§5.4). NUNCA devolve uma ação de falha:
// o pior que acontece é 'NADA'.
export function proximaAcaoJob(envio, agora, tick = 0) {
  const status = envio?.status;
  const t = ms(agora);
  const tentado = ms(envio?.tentadoEm);
  if (status === 'AMBIGUO') {
    // Sem tentadoEm legível, reconcilia (nunca promove a revisão sozinho por falta de dado).
    return Number.isFinite(tentado) && tentado < t - JANELA_REVISAO_MS ? 'REVISAO' : 'RECONCILIAR';
  }
  if (status === 'REVISAO_MANUAL') {
    if (!Number.isFinite(tentado) || tentado <= t - JANELA_RECONCILIACAO_MS) return 'NADA';
    return Number(tick) % TICKS_REVISAO === 0 ? 'RECONCILIAR' : 'NADA';
  }
  return 'NADA';
}

// Pedido criado cujo número do balcão (cwDisplayId) ficou pendente: o job completa via
// `detalhe` enquanto estiver no primeiro dia.
export function precisaDisplay(envio, agora) {
  if (envio?.status !== 'CRIADO' || envio?.cwDisplayId != null) return false;
  const criado = ms(envio?.criadoEm);
  return Number.isFinite(criado) && criado > ms(agora) - JANELA_DISPLAY_MS;
}

// O que o APARELHO vê de um envio. Nada de carrinho, cotação, orderId interno,
// empresaId ou chave de idempotência.
export function respostaPublica(envio) {
  return {
    envioId: envio?.id ?? null,
    status: envio?.status ?? null,
    cwOrderId: envio?.cwOrderId ?? null,
    cwDisplayId: envio?.cwDisplayId ?? null,
    total: envio?.totalCalculado == null ? null : Number(envio.totalCalculado),
    referencia: envio?.displayIdEnviado ?? null,
  };
}

// HTTP da resposta: 201 criado · 202 em andamento/sem confirmação · 422 quando está
// provado que nada foi criado. Nunca um 5xx depois do INSERT, e nada que faça o totem
// oferecer "tentar de novo" (§5.3/§5.6).
export function httpDaResposta(envio) {
  if (envio?.status === 'CRIADO') return 201;
  if (envio?.status === 'REJEITADO' || envio?.status === 'ENCERRADO_MANUAL') return 422;
  return 202;
}

// Corpo da resposta ao aparelho. Nos terminais negativos acrescenta `erro`/`detalhes`
// (o que o HUB/CW recusou). Sem erroCodigo gravado, o próprio estado é o código — não
// inventamos nome fora do §7.
export function corpoDaResposta(envio) {
  const corpo = respostaPublica(envio);
  if (httpDaResposta(envio) !== 422) return corpo;
  return { ...corpo, erro: envio?.erroCodigo ?? envio?.status ?? 'ERRO_INTERNO', detalhes: envio?.erroDetalhe ?? null };
}

// Forma do corpo de POST /pedido. Devolve SÓ os 5 campos do pedido: empresaId,
// clienteId, dispositivoId e qualquer outro campo de identidade são descartados aqui —
// o escopo vem do cookie, nunca do navegador (regra do Junior).
export function validarCorpoPedido(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const detalhes = [];
  const chaveIdempotencia = String(b.chaveIdempotencia ?? '').trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(chaveIdempotencia)) detalhes.push({ campo: 'chaveIdempotencia', mensagem: 'Use 8 a 64 caracteres (letras, números, _ ou -).' });
  const orderType = String(b.orderType ?? '');
  if (!ORDER_TYPES.includes(orderType)) detalhes.push({ campo: 'orderType', mensagem: 'Modo inválido.' });
  const carrinho = Array.isArray(b.carrinho) && b.carrinho.length ? b.carrinho : null;
  if (!carrinho) detalhes.push({ campo: 'carrinho', mensagem: 'Carrinho vazio.' });
  const metodoId = b.metodoId == null ? '' : String(b.metodoId).trim();
  if (!metodoId) detalhes.push({ campo: 'metodoId', mensagem: 'Escolha a forma de pagamento.' });
  const c = b.cotacao && typeof b.cotacao === 'object' && !Array.isArray(b.cotacao) ? b.cotacao : {};
  const hash = String(c.hash ?? '').trim();
  const expiraEm = c.expiraEm == null ? '' : String(c.expiraEm).trim();
  const assinatura = String(c.assinatura ?? '').trim();
  if (!/^[0-9a-f]{64}$/i.test(hash)) detalhes.push({ campo: 'cotacao.hash', mensagem: 'Cotação inválida.' });
  if (!expiraEm) detalhes.push({ campo: 'cotacao.expiraEm', mensagem: 'Cotação sem validade.' });
  if (!assinatura) detalhes.push({ campo: 'cotacao.assinatura', mensagem: 'Cotação sem assinatura.' });
  if (detalhes.length) return { ok: false, erro: 'CORPO_INVALIDO', detalhes };
  // Cotação remontada campo a campo: nada de extra atravessa para o HUB.
  return { ok: true, valor: { chaveIdempotencia, orderType, carrinho, metodoId, cotacao: { hash, expiraEm, assinatura } } };
}

// Colunas gravadas na saída de ENVIANDO. O status sai de `transicao`, nunca daqui.
export function camposDoDesfecho(desfecho, resultado) {
  const d = resultado?.data ?? null;
  if (desfecho === 'CRIADO') {
    const total = Number(d?.total);
    return {
      cwOrderId: Number.isInteger(d?.cwOrderId) ? d.cwOrderId : null,
      cwDisplayId: Number.isInteger(d?.cwDisplayId) ? d.cwDisplayId : null,
      cwStatusInicial: texto(d?.cwStatus, LIMITE_CODIGO),
      totalCalculado: Number.isFinite(total) ? total.toFixed(2) : null,
      respostaJson: d,
      erroCodigo: null,
      erroDetalhe: null,
    };
  }
  return {
    erroCodigo: texto(resultado?.codigo ?? 'HUB_INDISPONIVEL', LIMITE_CODIGO),
    erroDetalhe: detalheLegivel(d),
    respostaJson: d,
  };
}

// Detalhe do erro em texto curto para o admin. Nunca inclui token nem cabeçalho: o que
// chega aqui é só o corpo JSON do HUB.
function detalheLegivel(d) {
  if (d == null) return null;
  const alvo = d?.detalhes !== undefined ? d.detalhes : d;
  let s;
  try { s = typeof alvo === 'string' ? alvo : JSON.stringify(alvo); }
  catch { s = null; }
  return s == null ? null : String(s).slice(0, LIMITE_DETALHE);
}

// Bootstrap do HUB → resposta ao totem: acrescenta os modos realmente disponíveis
// (quem decide é o CW, não o aparelho) e a hora do snapshot.
export function bootstrapPublico(data, snapshotEm, desatualizado = false) {
  const base = data && typeof data === 'object' ? data : {};
  const modos = base?.operacional?.modos ?? {};
  return {
    ...base,
    orderTypes: ORDER_TYPES.filter((t) => !!modos?.[t]),
    snapshotEm,
    ...(desatualizado ? { desatualizado: true } : {}),
  };
}
