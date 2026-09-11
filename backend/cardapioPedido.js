// Ponte PDV→HUB do totem (spec §5.1). Clone estrutural de cardapioOrigens.js: fetch
// nativo, JWT de serviço `svc:'pdv-operacao'` assinado com o JWT_SECRET compartilhado,
// HUB_API_URL/JWT_SECRET lidos do env POR CHAMADA e SEM DEFAULT.
//
// ⚠️ Nenhuma credencial do Cardápio Web mora no PDV: quem fala com o CW é o HUB. Aqui só
// existe o token de serviço, que NUNCA é logado (este módulo não loga nada — quem decide
// o que registrar é o outbox, com o código do erro).
//
// ⚠️ Estas funções NÃO LANÇAM: sempre resolvem um resultado. É de propósito — no caminho
// do pedido, uma exceção solta viraria "resposta sem registro", exatamente o que a spec
// proíbe. Os dois formatos:
//   sucesso: { ok:true,  status, data }
//   falha:   { ok:false, http, codigo, ambiguo, data }
// `ambiguo:true` significa "pode ter sido criado no CW" — o outbox vira AMBIGUO e só um
// humano ou a reconciliação decidem. `ambiguo:false` só quando está PROVADO que nada foi
// criado (4xx, ou 5xx cujo código o HUB garante ser pré-envio).
import jwt from 'jsonwebtoken';

const HUB_API_URL = () => process.env.HUB_API_URL;   // ex.: http://127.0.0.1:<porta-hub>/api
const JWT_SECRET = () => process.env.JWT_SECRET;

export const TIMEOUT_PADRAO_MS = 15_000;
// 60 s no pedido: o pior caminho do HUB é 30 s (POST /orders) + 10 s (GET /orders/{id}) +
// folga de rede. O PDV só desiste DEPOIS do HUB — desistir antes é criar ambiguidade de graça.
export const TIMEOUT_PEDIDO_MS = 60_000;

// 5xx que o HUB garante serem anteriores a qualquer envio ao CW (§5.1): nada foi criado,
// então são determinísticos e o pedido pode ser REJEITADO com segurança.
const CODIGOS_5XX_DETERMINISTICOS = ['CW_RATE_LIMIT', 'HUB_SEM_PARTNER_KEY', 'HUB_CONFIG_INVALIDA'];

// Códigos 4xx do contrato §7. Um 4xx com um destes é caminho PREVISTO: o HUB recusou antes
// de criar, então é determinístico. Um 4xx com código desconhecido (ou sem código) é
// caminho que ninguém desenhou — no pedido, prudência: ambíguo (§4.7 c).
const CODIGOS_4XX_CONHECIDOS = new Set([
  'LOJA_INATIVA', 'LOJA_FECHADA', 'MODO_INDISPONIVEL',
  'CARRINHO_VAZIO', 'CARRINHO_GRANDE', 'QTD_INVALIDA',
  'ITEM_INDISPONIVEL', 'ITEM_EM_FALTA', 'ITEM_FORA_DE_HORARIO', 'ITEM_NAO_SUPORTADO', 'ESTOQUE_INSUFICIENTE',
  'GRUPO_OBRIGATORIO', 'GRUPO_LIMITE', 'GRUPO_CALCULO_NAO_SUPORTADO', 'OPCAO_INDISPONIVEL', 'OPCAO_EM_FALTA',
  'PAGAMENTO_INVALIDO', 'COTACAO_INVALIDA', 'COTACAO_DIVERGENTE', 'COTACAO_EXPIRADA', 'CW_RECUSOU',
  'CLIENTE_SEM_CW', 'PEDIDO_NAO_CORRESPONDE', 'PEDIDO_NAO_ENCONTRADO', 'JANELA_RECONCILIACAO_EXPIRADA',
  'CLIENTE_ID_OBRIGATORIO', 'REFERENCIA_OBRIGATORIA', 'CW_ORDER_ID_OBRIGATORIO', 'TENTADO_EM_INVALIDO', 'ORDER_TYPE_INVALIDO',
  'SVC_TOKEN_AUSENTE', 'SVC_TOKEN_INVALIDO', 'SVC_NAO_AUTORIZADO',
]);

const OPERACAO_AMBIGUA = 'pedido';   // só a criação do pedido pode deixar dúvida no CW

// Tradutor PURO status/corpo → resultado. Fica exportado para o teste de contrato rodar a
// tabela inteira do §4.7/§7 sem rede.
export function interpretarRespostaHub({ status, data, falha, timeout, operacao } = {}) {
  const ambiguoNaFalha = operacao === OPERACAO_AMBIGUA;
  const s = Number(status);
  // Sem resposta (rede, timeout, status ilegível): no pedido é ambíguo, sempre.
  if (falha || timeout || !Number.isFinite(s)) {
    return { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: ambiguoNaFalha, data: null };
  }
  const corpo = data && typeof data === 'object' ? data : null;
  if (s >= 200 && s < 300) return { ok: true, status: s, data: corpo ?? {} };
  const erro = typeof corpo?.erro === 'string' && corpo.erro ? corpo.erro : null;
  // 4xx: o HUB recusou antes de criar (validação, cotação, auth). Repassa o corpo — e só é
  // determinístico se o código for do contrato.
  if (s >= 400 && s < 500) {
    const previsto = !!erro && CODIGOS_4XX_CONHECIDOS.has(erro);
    return { ok: false, http: s, codigo: erro ?? 'HUB_RECUSOU', ambiguo: previsto ? false : ambiguoNaFalha, data: corpo };
  }
  if (erro && CODIGOS_5XX_DETERMINISTICOS.includes(erro)) return { ok: false, http: s, codigo: erro, ambiguo: false, data: corpo };
  if (s === 502 && erro === 'CW_INDISPONIVEL') {
    // Quem sabe onde a chamada parou é o HUB. Se ele não disser (bug), no pedido a gente
    // NÃO afirma que nada foi criado.
    const ambiguo = corpo?.ambiguo === undefined ? ambiguoNaFalha : !!corpo.ambiguo;
    return { ok: false, http: 502, codigo: 'CW_INDISPONIVEL', ambiguo, data: corpo };
  }
  // Qualquer outro 5xx (500 do HUB, 504 do Nginx, corpo ilegível): pode ter gravado no CW.
  return { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: ambiguoNaFalha, data: corpo };
}

const semConfiguracao = () => ({ ok: false, http: 503, codigo: 'HUB_NAO_CONFIGURADO', ambiguo: false, data: null });

// `deps` existe só para o teste (fetch e fábrica do sinal de timeout injetáveis). Em
// produção é o fetch nativo com AbortSignal.timeout.
async function chamar(operacao, rota, corpo, timeoutMs, deps) {
  const buscar = deps?.fetch ?? globalThis.fetch;
  const sinalDe = deps?.sinal ?? ((limite) => AbortSignal.timeout(limite));
  const base = HUB_API_URL();
  const segredo = JWT_SECRET();
  // Configuração local é checada ANTES de qualquer rede: no /pedido é a única falha que
  // pode responder 5xx sem gravar o outbox (§5.2).
  if (!base || !segredo) return semConfiguracao();
  let res;
  try {
    const token = jwt.sign({ svc: 'pdv-operacao' }, segredo, { expiresIn: '2m' });
    res = await buscar(`${base}/internal/${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: sinalDe(timeoutMs),
    });
  } catch (e) {
    return interpretarRespostaHub({ falha: true, timeout: e?.name === 'TimeoutError', operacao });
  }
  const texto = await res.text().catch(() => '');
  let data = null;
  try { data = texto ? JSON.parse(texto) : {}; } catch { data = null; }
  return interpretarRespostaHub({ status: res.status, data, operacao });
}

// ⚠️ `{ ...body, clienteId }` e NUNCA `{ clienteId, ...body }`: o clienteId derivado no
// servidor tem de vencer qualquer clienteId que tenha vindo no corpo do aparelho.
export function bootstrapTotemCW(clienteId, deps) {
  return chamar('bootstrap', 'cardapio-totem-bootstrap', { clienteId }, TIMEOUT_PADRAO_MS, deps);
}

export function cotarTotemCW(clienteId, body, deps) {
  return chamar('cotar', 'cardapio-totem-cotar', { ...(body || {}), clienteId }, TIMEOUT_PADRAO_MS, deps);
}

export function criarPedidoTotemCW(clienteId, body, deps) {
  return chamar(OPERACAO_AMBIGUA, 'cardapio-totem-pedido', { ...(body || {}), clienteId }, TIMEOUT_PEDIDO_MS, deps);
}

export function detalheTotemCW(clienteId, cwOrderId, deps) {
  return chamar('detalhe', 'cardapio-totem-detalhe', { clienteId, cwOrderId }, TIMEOUT_PADRAO_MS, deps);
}

export function reconciliarTotemCW(clienteId, body, deps) {
  return chamar('reconciliar', 'cardapio-totem-reconciliar', { ...(body || {}), clienteId }, TIMEOUT_PADRAO_MS, deps);
}
