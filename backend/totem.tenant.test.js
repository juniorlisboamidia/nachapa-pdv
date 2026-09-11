// Varredura do CÓDIGO das rotas do totem em server.js. É teste de fonte de propósito: as
// regras que mais importam aqui não são sobre um valor devolvido, e sim sobre o que o
// código tem permissão de FAZER. Um teste de comportamento passaria felizmente com uma
// consulta sem escopo ou com um retry escondido; este quebra.
//
// O que está travado aqui (regras do Junior + spec §5.2):
//  1. identidade (empresaId/clienteId/dispositivoId) NUNCA sai da requisição;
//  2. `clienteId` no bloco público só nasce de clienteIdDoAparelho(), e Empresa.clienteId
//     é lido num ÚNICO lugar (clienteIdDaEmpresaTotem);
//  3. toda consulta ao outbox é escopada pelo aparelho do cookie;
//  4. existe UM ÚNICO ponto de criação de pedido no CW e nenhum laço de retry;
//  5. o INSERT do outbox vem ANTES da chamada externa — depois da confirmação do cliente,
//     nenhuma resposta sai sem registro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MARCA_INICIO = '// ===== INICIO ROTAS PUBLICAS DO APARELHO =====';
const MARCA_FIM = '// ===== FIM ROTAS PUBLICAS DO APARELHO =====';

const fonte = () => readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const semComentarios = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

function blocoPublico() {
  const f = fonte();
  const i = f.indexOf(MARCA_INICIO);
  const j = f.indexOf(MARCA_FIM);
  assert.ok(i > 0 && j > i, 'marcadores do bloco público do aparelho não encontrados em server.js');
  return f.slice(i, j + MARCA_FIM.length);
}

// Seção admin/job do totem (fora do bloco público, mas também só dela é assunto deste teste).
const MARCA_TOTEM = '// ===== Totem › Pedidos: outbox, reconciliação e job (spec §5.4/§5.5) =====';
const MARCA_TOTEM_FIM = '// ===== Marcações + Painel (ADMIN) =====';

function secaoTotem() {
  const f = fonte();
  const i = f.indexOf(MARCA_TOTEM);
  const j = f.indexOf(MARCA_TOTEM_FIM);
  assert.ok(i > 0 && j > i, 'seção admin/job do totem não encontrada em server.js');
  return semComentarios(f.slice(i, j));
}

// Trecho de um handler: de app.<verbo>('<rota>' até o fechamento `});` na coluna 0.
function handler(rota, verbo = 'post') {
  const bloco = semComentarios(blocoPublico());
  const i = bloco.indexOf(`app.${verbo}('${rota}'`);
  assert.ok(i > 0, `handler ${verbo.toUpperCase()} ${rota} não encontrado no bloco público`);
  const resto = bloco.slice(i);
  const fim = resto.indexOf('\n});');
  return resto.slice(0, fim > 0 ? fim : resto.length);
}

const ROTAS_TOTEM = [
  ['/api/public/aparelho/totem/bootstrap', 'get'],
  ['/api/public/aparelho/totem/cotar', 'post'],
  ['/api/public/aparelho/totem/pedido', 'post'],
  ['/api/public/aparelho/totem/pedido/:envioId', 'get'],
];

test('as 4 rotas públicas do totem estão DENTRO do bloco varrido', () => {
  const bloco = blocoPublico();
  for (const [rota, verbo] of ROTAS_TOTEM) assert.ok(bloco.includes(`app.${verbo}('${rota}'`), `${verbo} ${rota} fora do bloco varrido`);
  // E todas passam pelo aparelho do cookie.
  for (const [rota, verbo] of ROTAS_TOTEM) assert.ok(handler(rota, verbo).includes('exigirAparelho(req, res)'), `${rota} sem exigirAparelho`);
});

test('clienteId no bloco público só nasce de clienteIdDoAparelho()', () => {
  const linhas = semComentarios(blocoPublico()).split('\n');
  const permitidas = [
    /clienteIdDoAparelho\b/,           // definição do atalho e as chamadas
    /clienteIdDaEmpresaTotem\(/,       // a leitura canônica, que mora FORA do bloco
    /TotemCW\(clienteId\b/,            // repasse para a ponte
    /!clienteId\)/,                    // guarda do CLIENTE_SEM_CW
  ];
  linhas.forEach((linha, i) => {
    if (!/\bclienteId\b/.test(linha)) return;
    assert.ok(permitidas.some((re) => re.test(linha)), `linha ${i + 1} do bloco usa clienteId fora dos padrões permitidos:\n${linha}`);
  });
  // Empresa.clienteId NÃO é lido dentro do bloco: a coluna tem um leitor só, e ele está
  // fora, recebendo empresaId (nunca um corpo de requisição).
  assert.equal(semComentarios(blocoPublico()).match(/clienteId:\s*true/), null, 'o bloco público não pode ler Empresa.clienteId direto');
  const codigo = semComentarios(fonte());
  // No código DO TOTEM (bloco público + seção admin/job) existe exatamente UMA leitura da
  // coluna, dentro de clienteIdDaEmpresaTotem. Outras áreas do PDV (Grupo VIP, indicação)
  // têm as suas próprias e não são assunto daqui.
  const leiturasNoTotem = (semComentarios(blocoPublico()) + secaoTotem()).match(/clienteId:\s*true/g) || [];
  assert.equal(leiturasNoTotem.length, 1, `o totem deveria ler Empresa.clienteId em um lugar só; achei ${leiturasNoTotem.length}`);
  assert.equal((codigo.match(/async function clienteIdDaEmpresaTotem\(/g) || []).length, 1, 'clienteIdDaEmpresaTotem tem de existir exatamente uma vez');
  assert.ok(/clienteId:\s*true/.test(secaoTotem().slice(secaoTotem().indexOf('async function clienteIdDaEmpresaTotem('), secaoTotem().indexOf('const usuarioDoAdmin'))), 'a leitura tem de estar dentro de clienteIdDaEmpresaTotem');
  // E o leitor do totem recebe empresaId, não um corpo.
  const i = codigo.indexOf('async function clienteIdDaEmpresaTotem(');
  const corpoHelper = codigo.slice(i, i + 600);
  assert.ok(/findUnique\(\{ where: \{ id: empresaId \}/.test(corpoHelper), 'clienteIdDaEmpresaTotem tem de buscar pelo empresaId recebido');
  assert.equal(corpoHelper.slice(0, corpoHelper.indexOf('\n}')).match(/req\./), null, 'clienteIdDaEmpresaTotem não pode tocar na requisição');
});

test('dispositivoId no bloco público é sempre o id do aparelho do cookie', () => {
  const linhas = semComentarios(blocoPublico()).split('\n');
  let usos = 0;
  linhas.forEach((linha, i) => {
    if (!/\bdispositivoId\b/.test(linha)) return;
    usos += 1;
    assert.ok(/dispositivoId: ap\.id\b/.test(linha), `linha ${i + 1}: dispositivoId só pode ser ap.id:\n${linha}`);
  });
  assert.ok(usos >= 3, `esperava o filtro por aparelho nas consultas do outbox, achei ${usos}`);
});

test('req.params no bloco público só existe para o envioId do polling', () => {
  const usos = semComentarios(blocoPublico()).match(/req\.params[^\s;,)]*/g) || [];
  assert.deepEqual([...new Set(usos)], ['req.params.envioId']);
});

test('toda consulta ao outbox no bloco público é escopada pelo aparelho', () => {
  const linhas = semComentarios(blocoPublico()).split('\n');
  const alvos = [];
  linhas.forEach((linha, i) => {
    if (/prisma\.pedidoTotemEnvio\./.test(linha)) alvos.push({ linha: i + 1, trecho: linhas.slice(i, i + 5).join('\n') });
  });
  assert.ok(alvos.length >= 4, `esperava as consultas do outbox no bloco, achei ${alvos.length}`);
  for (const alvo of alvos) {
    assert.ok(/whereDoAparelho\(|escopoEmpresa\(/.test(alvo.trecho), `consulta ao outbox sem escopo na linha ${alvo.linha}:\n${alvo.trecho}`);
  }
});

test('existe UM ÚNICO ponto de criação de pedido no CW, e nenhum retry', () => {
  const codigo = semComentarios(fonte());
  assert.equal((codigo.match(/criarPedidoTotemCW\(/g) || []).length, 1, 'criarPedidoTotemCW só pode ser chamado em um lugar do server.js');
  const h = handler('/api/public/aparelho/totem/pedido');
  // Nenhum laço em volta da chamada: um POST por registro, ponto.
  for (const re of [/\bfor\s*\(/, /\bwhile\s*\(/, /\.retry\b/, /tentativa/i]) {
    assert.equal(h.match(re), null, `o handler do pedido não pode ter ${re}`);
  }
  // E nenhuma segunda chamada de criação escondida no mesmo handler.
  assert.equal((h.match(/criarPedidoTotemCW\(/g) || []).length, 1);
});

test('o INSERT do outbox acontece ANTES da chamada ao HUB', () => {
  const h = handler('/api/public/aparelho/totem/pedido');
  const insert = h.indexOf('prisma.pedidoTotemEnvio.create(');
  const ponte = h.indexOf('criarPedidoTotemCW(');
  const idempotencia = h.indexOf('chaveIdempotencia }');
  const validacao = h.indexOf('validarCorpoPedido(');
  const envAusente = h.indexOf("erro: 'HUB_NAO_CONFIGURADO'");
  assert.ok(validacao > 0 && idempotencia > validacao, 'a idempotência é checada depois de validar a forma do corpo');
  assert.ok(insert > idempotencia, 'o INSERT só acontece depois da checagem de idempotência');
  assert.ok(envAusente > 0 && envAusente < insert, 'a falta de configuração (HUB_NAO_CONFIGURADO) tem de ser detectada ANTES do INSERT');
  assert.ok(ponte > insert, 'a chamada ao HUB tem de vir DEPOIS do INSERT (nenhuma resposta sem registro)');
  // A ponte está protegida: se lançar, o desfecho é ambíguo e gravado.
  const depois = h.slice(ponte);
  assert.ok(/catch \(e\)/.test(depois.slice(0, 400)), 'a chamada à ponte tem de estar em try/catch');
  assert.ok(/ambiguo: true/.test(depois.slice(0, 700)), 'ponte que lança conta como ambígua');
  // Status nunca escrito à mão: sai da máquina de estados.
  assert.ok(/transicao\('ENVIANDO', EVENTO_DO_DESFECHO\[desfecho\]\)/.test(depois), 'a transição de saída de ENVIANDO tem de passar por transicao()');
});

test('o job e as rotas admin do totem levam empresaId explícito', () => {
  const codigo = semComentarios(fonte());
  const i = codigo.indexOf('async function varrerTotemEnvios(');
  assert.ok(i > 0, 'job do totem não encontrado');
  const job = codigo.slice(i, codigo.indexOf('\nfunction iniciarAgendadorTotem('));
  // O job roda fora do tenantStore: todo updateMany dele precisa do empresaId da linha.
  const updates = job.match(/updateMany\(\{[\s\S]{0,200}?\}/g) || [];
  assert.ok(updates.length >= 2, `esperava updates no job, achei ${updates.length}`);
  for (const u of updates) assert.ok(/empresaId: envio\.empresaId/.test(u), `update do job sem empresaId explícito:\n${u}`);
  assert.ok(/if \(totemJobRodando\) return;/.test(job), 'o job precisa do lock in-process');
  // As 4 rotas admin existem e são todas fechadas por exigirAdmin + empresaDoAdmin.
  for (const rota of ['/api/totem/pedidos', '/api/totem/pedidos/:id/reconciliar', '/api/totem/pedidos/:id/confirmar-criado', '/api/totem/pedidos/:id/encerrar']) {
    const j = codigo.indexOf(`'${rota}'`);
    assert.ok(j > 0, `rota admin ${rota} não encontrada`);
    const trecho = codigo.slice(j, j + 400);
    assert.ok(trecho.includes('exigirAdmin(req, res)'), `${rota} sem exigirAdmin`);
    assert.ok(trecho.includes('empresaDoAdmin(req, res)'), `${rota} sem empresaDoAdmin`);
  }
});

test('confirmar-criado exige o external_order_id do CW batendo com o orderId', () => {
  const codigo = semComentarios(fonte());
  const i = codigo.indexOf("'/api/totem/pedidos/:id/confirmar-criado'");
  const h = codigo.slice(i, codigo.indexOf('\n});', i));
  assert.ok(h.includes('detalheTotemCW('), 'confirmar-criado tem de consultar o detalhe no HUB');
  assert.ok(/externalOrderId/.test(h) && /!== envio\.orderId/.test(h), 'tem de comparar o external_order_id com o orderId gravado');
  assert.ok(h.includes("erro: 'PEDIDO_NAO_CORRESPONDE'"), 'sem correspondência, 409 PEDIDO_NAO_CORRESPONDE');
  assert.ok(/transicao\(envio\.status, 'confirmadoManual'\)/.test(h), 'a confirmação manual passa pela máquina de estados');
  // Só de AMBIGUO/REVISAO_MANUAL.
  assert.ok(/status !== 'AMBIGUO' && envio\.status !== 'REVISAO_MANUAL'/.test(h));
});

test('encerrar exige motivo e só sai de REVISAO_MANUAL', () => {
  const codigo = semComentarios(fonte());
  const i = codigo.indexOf("'/api/totem/pedidos/:id/encerrar'");
  const h = codigo.slice(i, codigo.indexOf('\n});', i));
  assert.ok(/motivo\.length < 3 \|\| motivo\.length > 300/.test(h), 'motivo é obrigatório (3 a 300 chars)');
  assert.ok(/status !== 'REVISAO_MANUAL'/.test(h), 'encerrar só de REVISAO_MANUAL');
  assert.ok(/transicao\(envio\.status, 'encerradoManual'\)/.test(h));
  assert.ok(/decisaoJson: \{ usuarioId:/.test(h), 'a decisão fica assinada em decisaoJson');
});

test('nenhuma rota do totem chama o Cardápio Web direto: só a ponte do HUB', () => {
  const codigo = semComentarios(fonte());
  // Nada de credencial/URL do CW no PDV (Global Constraints).
  for (const re of [/cardapioweb\.com/i, /X-PARTNER-KEY/i, /CW_API_KEY/i, /X-API-KEY/i]) {
    assert.equal(codigo.match(re), null, `o PDV não pode falar com o CW direto (${re})`);
  }
  // E a ponte do totem usa a URL do env sem default (a const do server.js tem default e
  // não serve para o totem).
  const ponte = semComentarios(readFileSync(new URL('./cardapioPedido.js', import.meta.url), 'utf8'));
  assert.ok(/process\.env\.HUB_API_URL/.test(ponte));
  assert.equal(ponte.match(/HUB_API_URL\s*\|\|/), null, 'a ponte do totem não pode ter URL padrão');
  assert.ok(/svc: 'pdv-operacao'/.test(ponte));
});

// ── Correções da revisão (2026-09-11) ───────────────────────────────────────
test('depois do INSERT o /pedido NUNCA responde 5xx', () => {
  const h = handler('/api/public/aparelho/totem/pedido');
  const insert = h.indexOf('prisma.pedidoTotemEnvio.create(');
  const catchExterno = h.indexOf("} catch (err) { console.error('[public/aparelho totem pedido]'");
  assert.ok(insert > 0 && catchExterno > insert);
  const depois = h.slice(insert, catchExterno);
  const cincoxx = depois.match(/res\.status\(5\d\d\)/g) || [];
  assert.deepEqual(cincoxx, [], `resposta 5xx depois do INSERT: ${cincoxx.join(', ')}`);
  // A gravação do desfecho tem rede de segurança própria: falhou, responde 202.
  assert.ok(/catch \(e\) \{\s*console\.error\('\[public\/aparelho totem pedido desfecho\]'/.test(depois), 'os passos 7-8 precisam de try/catch próprio');
  assert.ok(/res\.status\(202\)\.json\(respostaPublica\(\{ \.\.\.envio, status: 'ENVIANDO' \}\)\)/.test(depois), 'a falha na gravação do desfecho responde 202 ENVIANDO');
  // E o 500 do catch externo só alcança o que acontece ANTES do INSERT.
  assert.ok(h.slice(catchExterno).includes("res.status(500)"));
});

test('CRIADO que chega tarde não se perde', () => {
  const h = handler('/api/public/aparelho/totem/pedido');
  assert.ok(/if \(!count && desfecho === 'CRIADO'\) await gravarCriadoTardio\(envio, campos\);/.test(h), 'update que não pegou + CRIADO tem de reaplicar o desfecho');
  const codigo = semComentarios(fonte());
  const i = codigo.indexOf('async function gravarCriadoTardio(');
  assert.ok(i > 0, 'gravarCriadoTardio não encontrado');
  const fn = codigo.slice(i, codigo.indexOf('\n}\n', i));
  assert.ok(/transicao\(de, 'reconciliado'\)/.test(fn), 'a reaplicação passa pela máquina de estados');
  assert.ok(/status: de/.test(fn), 'o update é guardado pelo estado lido');
  assert.ok(/empresaId: envio\.empresaId/.test(fn), 'escopo explícito por loja');
  assert.ok(/console\.error\('\[totem criado tardio nao gravado/.test(fn), 'perder a criação tem de deixar rastro no log');
  assert.equal(fn.match(/token|secret|assinatura/i), null, 'nada de segredo no log');
});

test('o job promove ENVIANDO parado e nunca o transforma em falha', () => {
  const codigo = semComentarios(fonte());
  const job = codigo.slice(codigo.indexOf('async function varrerTotemEnvios('), codigo.indexOf('\nfunction iniciarAgendadorTotem('));
  assert.ok(/status: \{ in: \['ENVIANDO', 'AMBIGUO', 'REVISAO_MANUAL'\] \}/.test(job), 'o job precisa enxergar ENVIANDO órfão');
  assert.ok(/acao === 'AMBIGUAR'/.test(job));
  const i = job.indexOf("acao === 'AMBIGUAR'");
  const trecho = job.slice(i, i + 700);
  assert.ok(/transicao\('ENVIANDO', 'ambiguo'\)/.test(trecho), 'promoção só pela transição permitida');
  assert.ok(/status: 'ENVIANDO'/.test(trecho), 'o update é guardado por status ENVIANDO (não atropela quem respondeu)');
  // Nenhum estado de falha automático em lugar nenhum do job.
  assert.equal(job.match(/'REJEITADO'/), null, 'o job nunca rejeita nada sozinho');
});

test('só TOTEM pede: as 4 rotas públicas checam o tipo do aparelho', () => {
  for (const [rota, verbo] of ROTAS_TOTEM) {
    assert.ok(handler(rota, verbo).includes('if (!exigirTotem(ap, res)) return;'), `${rota} sem a checagem de tipo`);
  }
  const codigo = semComentarios(fonte());
  const i = codigo.indexOf('function exigirTotem(');
  const fn = codigo.slice(i, codigo.indexOf('\n}\n', i));
  assert.ok(/ap\.tipo === 'TOTEM'/.test(fn));
  assert.ok(/erro: 'APARELHO_NAO_E_TOTEM'/.test(fn));
  assert.ok(/res\.status\(403\)/.test(fn));
});

test('a assinatura da cotação não vai para a outbox', () => {
  const h = handler('/api/public/aparelho/totem/pedido');
  const i = h.indexOf('prisma.pedidoTotemEnvio.create(');
  const create = h.slice(i, h.indexOf('});', i));
  assert.ok(/carrinhoJson: \{ carrinho, metodoId, cotacao: \{ hash: cotacao\.hash, expiraEm: cotacao\.expiraEm \} \}/.test(create), 'o carrinhoJson tem de ser remontado sem a assinatura');
  assert.equal(create.match(/assinatura/), null, 'a assinatura HMAC não pode ser gravada');
});

test('as rotas admin com :id validam o id antes do Prisma', () => {
  const codigo = semComentarios(fonte());
  for (const rota of ['/api/totem/pedidos/:id/reconciliar', '/api/totem/pedidos/:id/confirmar-criado', '/api/totem/pedidos/:id/encerrar']) {
    const i = codigo.indexOf(`'${rota}'`);
    const h = codigo.slice(i, codigo.indexOf('\n});', i));
    const id = h.indexOf('idDaRota(req)');
    const invalido = h.indexOf("erro: 'ID_INVALIDO'");
    const prisma = h.indexOf('prisma.');
    assert.ok(id > 0 && invalido > id, `${rota} sem validação de :id`);
    assert.ok(invalido < prisma, `${rota} valida o :id depois de consultar o banco`);
  }
});

test('os códigos de erro do totem são os do §7 (nada inventado)', () => {
  const codigo = semComentarios(blocoPublico()) + secaoTotem();
  const usados = new Set((codigo.match(/erro: '([A-Z_]+)'/g) || []).map((m) => m.slice(7, -1)));
  const CONTRATO = new Set([
    'APARELHO_NAO_PAREADO', 'APARELHO_NAO_E_TOTEM', 'CORPO_INVALIDO', 'MODO_INDISPONIVEL', 'CARRINHO_VAZIO',
    'PAGAMENTO_INVALIDO', 'CLIENTE_SEM_CW', 'HUB_NAO_CONFIGURADO', 'HUB_INDISPONIVEL', 'CATALOGO_INDISPONIVEL',
    'PEDIDO_NAO_ENCONTRADO', 'PEDIDO_NAO_CORRESPONDE', 'ID_INVALIDO', 'ESTADO_NAO_PERMITE_ACAO', 'ESTADO_MUDOU',
    'MOTIVO_OBRIGATORIO', 'CW_ORDER_ID_OBRIGATORIO', 'ERRO_INTERNO',
    // Do pareamento (P2, §3.2), que divide o mesmo bloco público.
    'CODIGO_INVALIDO', 'MUITAS_TENTATIVAS',
  ]);
  for (const c of usados) assert.ok(CONTRATO.has(c), `código fora do §7: ${c}`);
  // Os nomes ad-hoc da primeira volta não podem voltar.
  for (const velho of ['ENVIO_EM_CURSO', 'ESTADO_NAO_RECONCILIAVEL', 'ESTADO_NAO_PERMITE_CONFIRMAR', 'ESTADO_NAO_PERMITE_ENCERRAR']) {
    assert.ok(!usados.has(velho), `${velho} não está no §7`);
  }
});
