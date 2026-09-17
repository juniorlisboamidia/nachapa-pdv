import dotenv from 'dotenv';
// override:true => o .env é a fonte de verdade e SOBRESCREVE variáveis herdadas do
// ambiente (ex.: um JWT_SECRET antigo que o PM2 injeta nos processos filhos).
dotenv.config({ override: true });
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import { iniciarColetorServer, gravarPontoColetor } from './coletorServer.js';
import { zapiConfigurado, zapiStatus, zapiQrCode, zapiCriarInstancia, zapiEnviarTexto, zapiEnviarImagem, zapiListarGrupos, zapiGrupoInfo } from './zapi.mjs';
import { validadeDe, gerarLote, colisaoDeLote, CONSERVACOES } from './etiquetas.js';
import { avaliarResposta, execucaoEmAlerta, fotosCriticasFaltando } from './checklistConformidade.js';
import { venceHoje, offsetDiaDoHorario } from './checklistRecorrencia.js';
import { itensCriticosNaoConformes, montarMensagemAlerta } from './checklistAlerta.js';
import { montarMensagemLembrete, atrasado } from './checklistLembrete.js';
import { calcularEstatisticas } from './checklistEstatisticas.js';
import { classificarOcorrencia, agregar, STATUS } from './checklistHistoricoGeral.js';
import { ausenciaDoDia } from './pontoAusencia.js';
import { mensagensParaDisparar, montarPayloadCupom } from './grupoVip.js';
import { criarCupomCW, gerarCodigoCupom } from './cardapioCupom.js';
import { extrairOrigem } from './grupoVipOrigem.js';
import { buscarOrigensCW } from './cardapioOrigens.js';
import { ordemDeRecalculo } from './custos/propagacaoCusto.js';
// TV Indoor › a POSIÇÃO FÍSICA da tela: orientação declarada + rotação conferida pelo gestor.
import {
  validarOrientacao as tvValidarOrientacao, orientacaoDe as tvOrientacaoDe, rotacaoDe as tvRotacaoDe,
  rotacaoInicial as tvRotacaoInicial, proximaRotacao as tvProximaRotacao, emAjuste as tvEmAjuste,
  posicaoPublica as tvPosicaoPublica, MS_JANELA_AJUSTE as TV_MS_JANELA_AJUSTE,
} from './tvOrientacao.js';
// A regra ÚNICA de como o custo de um item vendido é apurado. Quem precisa decidir
// "usa ficha técnica ou custo de compra?" pergunta aqui — nunca olhando o tipo.
import {
  TIPOS_PRODUTO, MODOS_SOBREMESA, MODO_SOBREMESA_PADRAO,
  usaCustoDireto, usaFichaTecnica
} from './produtos/custeio.js';
import { AREAS_DISPONIVEIS, AREA_PREFIXOS, areaDoPath } from './acessos/areas.js';
import {
  TIPOS_APARELHO, PAREAMENTO_VALIDADE_MS, gerarCodigoPareamento, gerarCredencial, hashCredencial,
  cookieAparelho, cookieAparelhoLimpar, cookieDeveSerSecure, lerCookieAparelho, avaliarTentativa,
  aparelhoPublico, aparelhoAdmin, filtroAparelhoDoCookie, whereDoAparelho, LimitadorIp,
} from './aparelhos.js';
// Totem: ponte com o HUB (nunca com o Cardápio Web direto) + outbox puro.
import { bootstrapTotemCW, cotarTotemCW, criarPedidoTotemCW, detalheTotemCW, reconciliarTotemCW, TIMEOUT_PEDIDO_MS } from './cardapioPedido.js';
import {
  ESTADOS as ESTADOS_TOTEM, ORDER_TYPES, JANELA_DISPLAY_MS, JANELA_ENVIANDO_MS, JANELA_RECONCILIACAO_MS, EVENTO_DO_DESFECHO,
  novaReferencia, classificarResposta, transicao, proximaAcaoJob, precisaDisplay, selecionarParaReconciliar,
  respostaPublica, corpoDaResposta, httpDaResposta, validarCorpoPedido, camposDoDesfecho, bootstrapPublico,
} from './totemEnvio.js';
// Totem › Apresentação: projeção pura do catálogo (sem Prisma, sem rede) — spec §4.1.
import { MODOS, validarConfiguracao, projetarCatalogo, mesclarAdmin, sugerirCandidatos } from './totemApresentacao.js';
import { SELOS, validarSelo, aplicarFitas, fitasParaAdmin, fitasPorItem } from './produtoFita.js';
import {
  aplicarNomes as aplicarNomesDeCategoria,
  mesclarAdmin as mesclarAdminCategorias,
} from './totemCategoria.js';
// Totem › Configurações: a régua da ociosidade mora num lugar só, e o PUT do admin e o
// bootstrap público leem a MESMA função.
import {
  normalizarOciosidade, configuracaoParaJson,
  OCIOSIDADE_PADRAO, OCIOSIDADE_MIN, OCIOSIDADE_MAX, OCIOSIDADE_SUGERIDA,
} from './totemConfiguracao.js';
// Totem › Aparência: cores em chaves de DOMÍNIO, posição das categorias e o estado da
// logo. A régua é toda pura e mora num lugar só.
import {
  CHAVES as CHAVES_APARENCIA, POSICOES as POSICOES_CATEGORIAS,
  MOTIVO_POSICAO, validarPatch, aplicarPatch, coresEfetivas, sanitizarTokens,
  normalizarPosicao, aparenciaPublica, diagnosticoDeContraste,
  LAYOUTS, MOTIVO_LAYOUT, normalizarLayout, layoutEfetivo, PADROES_POR_LAYOUT, tokensDoLayout,
  CHAMADA_PADRAO, CHAMADA_MAX, MOTIVO_CHAMADA, validarChamada,
  TITULO_MAX, SUBTITULO_MAX, MOTIVO_TITULO, MOTIVO_SUBTITULO, validarTexto, FUNDO_ESPERA_MEDIDA,
  FRASE_MEIO_PADRAO, FRASE_MEIO_MAX, MOTIVO_FRASE_MEIO,
  LOGO_MAX_BYTES, validarLogoDataUrl, decodificarDataUrl, proximaVersaoLogo,
} from './totemAparencia.js';
// Totem › Destaques: os produtos da esteira da vitrine. O banco guarda ID; nome, preço e
// foto vêm do catálogo vivo, e é este módulo que junta os dois.
import {
  MAX_POR_ESTEIRA, ESTEIRAS as DESTAQUE_ESTEIRAS, destaquesPublicos, destaquesParaAdmin,
  catalogoParaEscolha, validarEsteiras, linhasParaGravar,
} from './totemDestaque.js';
// Totem › Banners: agenda, duração, imagem e as duas projeções (admin e pública).
import {
  DURACAO_MIN as BANNER_DUR_MIN, DURACAO_MAX as BANNER_DUR_MAX, DURACAO_PADRAO as BANNER_DUR_PADRAO,
  IMAGEM_MAX_BYTES as BANNER_IMG_MAX, validarEntrada as validarBanner, conferirJanela,
  lerImagem as lerImagemBanner, proximaVersaoImagem, bannerParaAdmin, bannersPublicos,
  TIPOS as BANNER_TIPOS, TIPO_PADRAO as BANNER_TIPO_PADRAO, MEDIDAS as BANNER_MEDIDAS,
} from './totemBanner.js';
// TV Indoor: canal IRMÃO do totem, domínio próprio. Nenhum símbolo daqui é do totem, e
// nenhum símbolo do totem é usado no canal da TV — o que os dois dividem são os helpers
// técnicos (`midiaImagem`, `midiaAgenda`) e a infraestrutura de Dispositivo/cookie/cache.
import {
  DURACAO_MIN as TV_DUR_MIN, DURACAO_MAX as TV_DUR_MAX, DURACAO_PADRAO as TV_DUR_PADRAO,
  MEDIDA as TV_MEDIDA, MAX_ITENS_PLAYLIST as TV_MAX_ITENS,
  validarConteudo as validarTvConteudo, conferirJanela as conferirJanelaTv,
  validarNomePlaylist, validarItens as validarItensTv, itensParaGravar as itensTvParaGravar,
  conteudoParaAdmin as tvConteudoParaAdmin, playlistParaAdmin as tvPlaylistParaAdmin,
  programacaoPublica as tvProgramacaoPublica,
} from './tvIndoor.js';
// A validação de imagem é helper TÉCNICO (MIME real por magic bytes, teto de bytes): os
// dois canais usam a mesma, e ela não sabe o que é banner nem o que é conteúdo.
import { lerImagem as lerImagemMidia, IMAGEM_MAX_BYTES as TV_IMG_MAX, proximaVersaoImagem as proximaVersaoTv } from './midiaImagem.js';
// TV Indoor › Menu Board: o segundo tipo de item da programação, alimentado pelo CATÁLOGO.
import {
  LAYOUTS as MB_LAYOUTS, LAYOUT_PADRAO as MB_LAYOUT_PADRAO, DURACAO_PADRAO as MB_DUR_PADRAO,
  DURACAO_MIN as MB_DUR_MIN, DURACAO_MAX as MB_DUR_MAX,
  validarEntrada as validarMenuBoard, resolverMenuBoard, menuBoardPublico, menuBoardParaAdmin,
  opcoesDoTemplate,
  validarItensPlaylist, itensParaGravar as itensPlaylistParaGravar,
} from './tvMenuBoard.js';
// A VERSÃO do aplicativo que está no ar. A página da TV fica aberta por semanas e relê a
// programação a cada 60 s, mas o JS e o CSS continuam os do dia do pareamento — depois de um
// deploy, cada parede segue com o aplicativo velho até alguém ir lá recarregar.
import { readFileSync as lerArquivoSync } from 'node:fs';
import { versaoDe as versaoDoApp } from './versaoApp.js';
// TV Indoor › TELEMETRIA: o que a parede está REALMENTE fazendo. Observação pura — nada
// que a TV reporte muda playlist, agenda, isolamento ou o que é servido.
import {
  sanitizarSnapshot as sanitizarTelemetriaTv, telaMonitorada, resumo as resumoMonitoramento,
  ordenar as ordenarMonitoramento,
} from './tvTelemetria.js';
// TV Indoor › GRADE SEMANAL: qual playlist esta tela usa NESTE instante. Domínio puro, sem
// relógio escondido — o instante entra por parâmetro e o fuso é o DA LOJA, nunca o do VPS.
import {
  DIAS as GRADE_DIAS, FUSO_PADRAO as GRADE_FUSO_PADRAO, MOTIVO_FUSO as GRADE_MOTIVO_FUSO,
  resolverGrade, regraParaAdmin, validarEntradaRegra, conferirJanela as conferirJanelaRegra,
  conferirPeriodo as conferirPeriodoRegra, fusoValido, fusoOuPadrao, cruzaCom as regrasSeCruzam,
} from './tvGradeSemanal.js';
// O catálogo da loja com ÚLTIMO-ESTADO-BOM. Serviço NEUTRO: o caminho
// empresaId → clienteId → HUB → CW é o mesmo do totem, e nenhum navegador fala com o CW.
import { catalogoDaLoja } from './catalogoDaLoja.js';
// TV Indoor › Aparência: as seis cores e a logo PRÓPRIAS do canal. Nada de
// `TotemConfiguracao` — os canais dividem infraestrutura, não identidade.
import {
  CHAVES as TV_AP_CHAVES, PADROES as TV_AP_PADROES,
  aplicarPatch as tvAparenciaPatch, aparenciaParaAdmin as tvAparenciaAdmin,
  aparenciaPublica as tvAparenciaPublica, proximaVersaoLogo as proximaVersaoLogoTv,
} from './tvIndoorAparencia.js';
// TV Indoor › Vídeo: o terceiro tipo de item. Os BYTES ficam no filesystem (ver
// `armazenamentoMidia.js`), nunca no banco — e nunca passam pelo heap inteiros.
import {
  validarEntrada as validarVideo, conferirJanela as conferirJanelaVideo,
  videoParaAdmin, videoPublico, limitesDeVideo, elegivel as videoElegivel,
} from './tvVideo.js';
import {
  MAX_BYTES_PADRAO as VIDEO_MAX_PADRAO, validarContainer, cabe as videoCabe,
  metadataInformativa, proximaVersaoArquivo, BYTES_PARA_RECONHECER,
} from './midiaVideo.js';
import { interpretarRange, cabecalhosDeMidia } from './rangeHttp.js';
import * as midiaFs from './armazenamentoMidia.js';

// Campos do banner SEM a arte. Existe como constante para que nenhuma consulta esqueça o
// `select` e arraste blobs — a arte mora em outra tabela justamente por isso, e este
// objeto é o lembrete de que a listagem nunca precisa dela.
const BANNER_CAMPOS = {
  id: true, nome: true, tipo: true, ativo: true, ordem: true, duracaoSegundos: true,
  inicioEm: true, fimEm: true, imagemVersao: true, imagemTipo: true, imagemBytes: true,
};

// Campos do conteúdo da TV SEM os bytes — o mesmo lembrete do BANNER_CAMPOS, pela mesma
// razão: a imagem mora em outra tabela para que arrastar blobs numa listagem seja
// impossível, e não só improvável.
const TV_CAMPOS = {
  id: true, nome: true, ativo: true, duracaoSegundos: true,
  inicioEm: true, fimEm: true, imagemVersao: true, imagemTipo: true, imagemBytes: true,
};
import { calcularCmvGlobal } from './cmv/calculo.js';
import { normalizarRelatorio, FONTES } from './relatorios/normalizar.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// ── Multi-tenancy (mesmo padrão do H360) ──────────────────
// tenantStore guarda a LOJA (empresaId) da request; a extension injeta empresaId
// automaticamente nas queries dos models de negócio. "Empresa" (a Loja) fica fora.
//
// ⚠️ ARMADILHA: `tenantStore.run(store, () => prisma.X.op())` (arrow que RETORNA
// a operacao direto) NAO isola! A PrismaPromise e lazy: so executa no `await`
// externo, ja FORA do run — a extension ve empresaId=null e NAO filtra (leaks
// entre lojas; creates falham). Use `run(async () => { await prisma.X.op() })`,
// `run(() => prisma.$transaction(...))` ou `where/data: { empresaId }` explicito.
const tenantStore = new AsyncLocalStorage();
function getEmpresaIdAtual() { return tenantStore.getStore()?.empresaId ?? null; }

const MODELS_TENANT = new Set([
  'insumo', 'receitaProducao', 'receitaProducaoItem', 'produto', 'comboItem', 'comboInsumo',
  'fichaTecnicaItem', 'configuracaoPrecificacao', 'custoFixo', 'custoVariavel', 'faturamentoDiario',
  'analiseVenda', 'escalaMotoboy', 'escalaMotoboyDia', 'escalaMotoboyInscricao', 'motoboy',
  'motoboyOcorrencia', 'avaliacaoCampanha', 'avaliacaoResposta',
  'indicacaoConfig', 'promotor', 'indicacao', 'recompensaTier', 'cupom',
  'cargo', 'vaga', 'candidato', 'experienciaProfissional', 'candidatura', 'candidatoHistorico',
  'avaliacaoCandidato', 'contatoCandidato', 'entrevistaCandidato', 'recrutamentoTag', 'recrutamentoConfig', 'scoreHistorico',
  'funcionario', 'bonificacaoConfig', 'bonificacaoTipoOcorrencia',
  'bonificacaoOcorrencia', 'bonificacaoColetiva', 'bonificacaoFechamento',
  'bonificacaoNivel', 'bonificacaoXp', 'bonificacaoAuditoria', 'bonificacaoSeveridade',
  'bonificacaoIndicador', 'bonificacaoIndicadorValor',
  'bonificacaoOuvidoria', 'bonificacaoContribuicao', 'bonificacaoReconhecimento',
  'acessoOperador',
  'conquista', 'conquistaDesbloqueada',
  'bonificacaoMoeda', 'mercadoItem', 'mercadoResgate',
  'funcionarioFace', 'pontoRegistro', 'dispositivo', 'jornada', 'coletorBatidaPendente', 'coletorComando', 'pontoConfig', 'funcao', 'pontoAusencia', 'grupoVipConfig', 'grupoVipMensagem', 'grupoVipDisparo',
  'etiquetaConfig', 'etiquetaRegra', 'etiquetaItemConfig', 'etiquetaImpressa',
  'checklistTemplate', 'checklistTemplateItem', 'checklist', 'checklistItem', 'checklistExecucao', 'checklistResposta', 'checklistFoto',
  'checklistNotificacaoConfig', 'checklistDestinatario', 'checklistNotificacaoLog', 'checklistLembreteEnviado',
  'frase',
  // Produtos › Fornecedores (cadastro + cotações de preço por insumo)
  'fornecedor', 'fornecedorInsumo', 'fornecedorInsumoCotacao',
  // Produtos › Estoque (CMV Global): contagem mensal + compras
  'cmvContagem', 'cmvContagemItem', 'cmvCompra', 'cmvCompraItem',
  // Dashboard › Faixas dos Tempos operacionais do Cardápio (ideal/atenção), por loja
  'tempoFaixaCardapioConfig',
  // Totem de autoatendimento: outbox/auditoria dos pedidos criados no Cardápio Web
  'pedidoTotemEnvio',
  // Totem de autoatendimento: configuração explícita da apresentação (modo EXPANDIDO) por item
  'totemApresentacao',
]);
const OPS_WHERE = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany', 'update', 'delete',
]);

const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const empresaId = getEmpresaIdAtual();
        const key = model.charAt(0).toLowerCase() + model.slice(1);
        if (empresaId != null && MODELS_TENANT.has(key)) {
          if (OPS_WHERE.has(operation)) {
            args.where = { ...(args.where || {}), empresaId };
          } else if (operation === 'create') {
            args.data = { ...(args.data || {}), empresaId };
          } else if (operation === 'createMany') {
            const d = args.data;
            args.data = Array.isArray(d) ? d.map((x) => ({ ...x, empresaId })) : { ...d, empresaId };
          } else if (operation === 'upsert') {
            args.where = { ...(args.where || {}), empresaId };
            args.create = { ...(args.create || {}), empresaId };
          }
        }
        return query(args);
      },
    },
  },
});

const app = express();
// Atrás do Nginx: ele SOBRESCREVE X-Forwarded-For com $remote_addr, então o 1º salto
// é sempre o cliente de verdade (ninguém injeta IP por header). Sem isto req.ip seria
// 127.0.0.1 para todo mundo — o freio por IP do pareamento viraria global e o
// heartbeatJson.ip gravaria o proxy. Também é o que faz req.secure/req.protocol
// respeitarem o X-Forwarded-Proto do Nginx (ver o snippet no README).
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4001;

// ── Identidade compartilhada com o NaChapa HUB ────────────
// O PDV NÃO emite tokens: apenas VALIDA o MESMO JWT do HUB (mesmo JWT_SECRET), que
// chega pelo cookie SSO (th_sso, domínio .nachapahub.com.br) ou por Bearer.
const JWT_SECRET = process.env.JWT_SECRET;

// API do HUB (server-to-server): o PDV lê dados que vivem no HUB assinando um JWT de
// SERVIÇO com o mesmo JWT_SECRET (compartilhado via SSO). O HUB valida só assinatura +
// claim `svc`, sem checar origem — assinamos 'h360-dashboard', o svc que todos os
// /internal/* do HUB aceitam. (A ponte de cupom do Grupo VIP em cardapioCupom.js usa o
// seu próprio 'pdv-operacao', aceito só em 2 rotas; não misturar.)
const HUB_API_URL = process.env.HUB_API_URL || 'https://nachapahub.com.br/api';
const svcTokenHub = () => jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });

const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin) || CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// Lê o token do cookie SSO (th_sso) ou do header Authorization.
function lerToken(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)th_sso=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Acesso ao Operação: por ora SÓ ADMIN (loja do próprio dono). No futuro, trocar por
// uma flag `acessoPDV` no cadastro do usuário (Membro) no HUB, igual `acessoH360`.
function podeAcessarPDV(u) { return !!u && u.papel === 'ADMIN'; }

// Exige um JWT válido (emitido pelo HUB) E acesso ao PDV (ADMIN). Popula req.user.
function autenticar(req, res, next) {
  if (!JWT_SECRET) {
    console.error('[auth] JWT_SECRET ausente no .env do PDV');
    return res.status(500).json({ error: 'Configuracao de autenticacao ausente' });
  }
  const token = lerToken(req);
  if (!token) return res.status(401).json({ error: 'Nao autenticado' });
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Sessao invalida ou expirada' }); }
  // Token emitido pelo PRÓPRIO PDV (login de operador por WhatsApp): acesso limitado
  // por área (checado no middleware de permissão). Nunca é ADMIN.
  if (payload?.tipo === 'operador') {
    if (!payload.oid || !payload.eid) return res.status(401).json({ error: 'Sessao invalida' });
    req.user = { tipo: 'operador', papel: 'GERENTE', operadorId: payload.oid, empresaId: payload.eid, nome: payload.nome || 'Operador', areas: Array.isArray(payload.areas) ? payload.areas : [] };
    return next();
  }
  if (!podeAcessarPDV(payload)) return res.status(403).json({ error: 'Acesso ao Operação restrito ao administrador' });
  req.user = payload;
  next();
}

// Gate global: tudo sob /api exige login, EXCETO health e rotas públicas (por token).
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/health' || req.path.startsWith('/public/')) return next();
  return autenticar(req, res, next);
});

// Clientes (do HUB) que o usuário pode enxergar. null = todos (ADMIN).
function clientesPermitidos(u) {
  if (u.papel === 'ADMIN') return null;
  if (u.papel === 'CLIENTE') {
    const lista = Array.isArray(u.clientesLiberados) ? u.clientesLiberados : [];
    return [...new Set([u.clienteId, ...lista].filter(Boolean).map(String))];
  }
  if (u.papel === 'AGENCIA') return Array.isArray(u.clientesLiberados) ? u.clientesLiberados : [];
  return [];
}

// Resolve a LOJA (empresaId) da request: header X-Empresa-Id (validado) ou a 1ª loja.
async function resolverLoja(req) {
  const u = req.user;
  if (u.tipo === 'operador') return u.empresaId; // operador é preso à sua loja
  const permitidos = clientesPermitidos(u); // null = todas
  const pedido = Number(req.headers['x-empresa-id']) || null;
  if (pedido) {
    const loja = await prisma.empresa.findUnique({ where: { id: pedido } });
    if (!loja) throw { http: 404, msg: 'Loja nao encontrada' };
    if (permitidos !== null && !permitidos.includes(loja.clienteId)) throw { http: 403, msg: 'Voce nao tem acesso a esta loja' };
    return loja.id;
  }
  const where = permitidos === null ? {} : { clienteId: { in: permitidos.length ? permitidos : ['__nenhum__'] } };
  const lojas = await prisma.empresa.findMany({ where, orderBy: { id: 'asc' }, take: 1 });
  if (!lojas.length) throw { http: 404, msg: 'Nenhuma loja disponivel para este usuario' };
  return lojas[0].id;
}

// Gate de tenant: roda após o de auth. Rotas "meta" (perfil e lojas) não exigem loja.
const ROTAS_SEM_TENANT = new Set(['/auth/me', '/lojas']);
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/health' || req.path.startsWith('/public/')) return next();
  if (!req.user) return next();
  if (ROTAS_SEM_TENANT.has(req.path) || req.path.startsWith('/lojas/')) return next();
  resolverLoja(req)
    .then((empresaId) => tenantStore.run({ empresaId, user: req.user }, () => next()))
    .catch((err) => res.status(err?.http || 500).json({ error: err?.msg || 'Erro ao resolver a loja' }));
});

// Permissão por área (só para operadores; ADMIN vê tudo). Mapa rota→área em acessos/areas.js,
// FAIL-CLOSED: rota não mapeada = negada. Config/Acessos/WhatsApp não estão no mapa → só o dono.
const OPERADOR_LIBERADO = new Set(['/auth/me', '/lojas', '/empresa']); // meta + logo (GET); PUT /empresa exige ADMIN no handler
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const u = req.user;
  if (!u || u.tipo !== 'operador') return next(); // ADMIN e público seguem
  if (req.path === '/health' || req.path.startsWith('/public/')) return next();
  if (OPERADOR_LIBERADO.has(req.path) || req.path.startsWith('/lojas/')) return next();
  const area = areaDoPath(req.path);
  if (!area || !(u.areas || []).includes(area)) return res.status(403).json({ error: 'Você não tem acesso a esta área.' });
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'operacao-pdv' }));

// Perfil do usuário logado (JWT do HUB ou operador do PDV).
app.get('/api/auth/me', (req, res) => {
  const u = req.user;
  if (u.tipo === 'operador') {
    return res.json({ id: u.operadorId, nome: u.nome, papel: 'GERENTE', tipo: 'operador', podePDV: true, areas: u.areas || [] }); // id: favoritos da Visão Geral por usuário
  }
  res.json({
    id: u.membroId, nome: u.nome, email: u.email, role: u.role,
    papel: u.papel, clienteId: u.clienteId ?? null, podePDV: podeAcessarPDV(u), tipo: 'admin', areas: null,
  });
});

async function getEmpresa() {
  const empresaId = getEmpresaIdAtual();
  if (empresaId != null) return prisma.empresa.findUnique({ where: { id: empresaId } });
  return prisma.empresa.findFirst({ orderBy: { id: 'asc' } });
}

// Lojas que o usuário pode ver (ADMIN: todas; operador: só a dele).
app.get('/api/lojas', async (req, res) => {
  try {
    if (req.user.tipo === 'operador') {
      const loja = await prisma.empresa.findUnique({ where: { id: req.user.empresaId }, select: { id: true, nome: true, clienteId: true, clienteNome: true, logoDataUrl: true } });
      return res.json(loja ? [loja] : []);
    }
    const permitidos = clientesPermitidos(req.user);
    const where = permitidos === null ? {} : { clienteId: { in: permitidos.length ? permitidos : ['__nenhum__'] } };
    const lojas = await prisma.empresa.findMany({ where, orderBy: { id: 'asc' }, select: { id: true, nome: true, clienteId: true, clienteNome: true, logoDataUrl: true } });
    res.json(lojas);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao listar lojas' }); }
});

app.post('/api/lojas', async (req, res) => {
  try {
    if (req.user.papel !== 'ADMIN') return res.status(403).json({ error: 'Apenas o administrador pode criar lojas.' });
    const { nome, clienteId, clienteNome } = req.body ?? {};
    const alvo = clienteId ? String(clienteId).trim() : 'admin';
    const loja = await prisma.empresa.create({
      data: { clienteId: alvo, clienteNome: clienteNome ? String(clienteNome).trim() : (alvo === 'admin' ? 'Loja de teste' : null), nome: nome && String(nome).trim() ? String(nome).trim() : 'Minha Loja' },
    });
    res.status(201).json(loja);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar loja' }); }
});

app.get('/api/empresa', async (req, res) => {
  try { res.json(await getEmpresa()); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno ao consultar empresa' }); }
});

app.put('/api/empresa', async (req, res) => {
  try {
    if (req.user.papel !== 'ADMIN') return res.status(403).json({ error: 'Apenas o administrador pode editar os dados da loja.' });
    const empresa = await getEmpresa();
    if (!empresa) return res.status(404).json({ error: 'Loja não encontrada' });
    const { nome, whatsapp, endereco, logoDataUrl, logoPublicaDataUrl } = req.body ?? {};
    const data = {};
    if (nome !== undefined) { const v = String(nome).trim(); if (!v) return res.status(400).json({ error: 'O nome da empresa é obrigatório.' }); data.nome = v; }
    for (const [campo, valor] of Object.entries({ whatsapp, endereco })) {
      if (valor !== undefined) { const v = String(valor).trim(); data[campo] = v === '' ? null : v; }
    }
    if (logoDataUrl !== undefined) data.logoDataUrl = logoDataUrl || null;
    if (logoPublicaDataUrl !== undefined) data.logoPublicaDataUrl = logoPublicaDataUrl || null;
    const upd = await prisma.empresa.update({ where: { id: empresa.id }, data });
    res.json(upd);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao atualizar empresa' }); }
});


// ===================== Dep. Pessoal: Equipe + Bonificação (portado do H360) =====================

// ===== Dep. Pessoal › Equipe (cadastro de funcionários internos) =====
// Área RESTRITA a ADMIN (Dep. Pessoal inteiro é só do administrador). Escopo por
// loja é automático (funcionario está em MODELS_TENANT).
// Acesso ao PDV (dono ADMIN ou operador). Operadores já foram filtrados por ÁREA no
// middleware de permissão antes de chegar aqui — então basta serem PDV staff.
function exigirAdmin(req, res) {
  const u = req.user;
  if (u?.papel === 'ADMIN' || u?.tipo === 'operador') return true;
  res.status(403).json({ error: 'Apenas o administrador acessa o Departamento Pessoal.' }); return false;
}
// Só o DONO (ADMIN do HUB). Config, Acessos, WhatsApp — nunca operador.
function exigirDono(req, res) {
  if (req.user?.papel !== 'ADMIN') { res.status(403).json({ error: 'Apenas o administrador (dono) pode acessar isto.' }); return false; }
  return true;
}

// ── Login da Área do Colaborador (OTP por WhatsApp) ──────────────────────────
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
// Telefone BR canônico = DDD + número (10-11 dígitos), sem DDI. Remove 55 se veio com DDI.
function foneCanonico(s) {
  let d = soDigitos(s);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(-11);
}
const foneParaEnvio = (canon) => '55' + canon; // DDI Brasil p/ o UAZAPI
const hashOtp = (codigo) => createHash('sha256').update(`${codigo}:${JWT_SECRET || 'otp'}`).digest('hex');
const gerarOtp = () => String(100000 + (randomBytes(4).readUInt32BE(0) % 900000)); // 6 dígitos
// Verifica o token de SESSÃO do colaborador (assinado pelo próprio PDV, tipo 'colab').
// Devolve { funcionarioId, empresaId } ou null (já responde 401). NUNCA dá acesso admin.
function exigirColaborador(req, res) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || !JWT_SECRET) { res.status(401).json({ error: 'Sessão expirada. Entre de novo.' }); return null; }
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { res.status(401).json({ error: 'Sessão expirada. Entre de novo.' }); return null; }
  if (payload?.tipo !== 'colab' || !payload.fid || !payload.eid) { res.status(401).json({ error: 'Sessão inválida.' }); return null; }
  return { funcionarioId: payload.fid, empresaId: payload.eid };
}
async function empresaPorSlugColaborador(chave) {
  const cfg = await prisma.bonificacaoConfig.findFirst({ where: { OR: [{ slugPublico: String(chave) }, { tokenPublico: String(chave) }] } });
  if (!cfg || !cfg.ativo) return null;
  return cfg.empresaId;
}
const FUNCIONARIO_STATUS = new Set(['ATIVO', 'INATIVO']);
function dadosFuncionario(body) {
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  if (!nome) return { error: 'Informe o nome.' };
  // Nome, CPF e WhatsApp são obrigatórios no cadastro do colaborador.
  if (String(body?.cpf ?? '').replace(/\D/g, '').length !== 11) return { error: 'Informe o CPF completo (11 dígitos).' };
  if (String(body?.whatsapp ?? '').replace(/\D/g, '').length < 10) return { error: 'Informe o WhatsApp com DDD.' };
  const status = FUNCIONARIO_STATUS.has(body?.status) ? body.status : 'ATIVO';
  const only = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
  const campos = {
    nome: nome.slice(0, 160),
    apelido: only(body?.apelido, 60),
    funcao: only(body?.funcao, 80),
    cpf: only(body?.cpf, 20),
    whatsapp: only(body?.whatsapp, 30),
    status,
  };
  // Folga fixa por dia da semana (0=dom..6=sáb). Só grava se o campo veio no body.
  if (body?.folgaSemana !== undefined) {
    const arr = Array.isArray(body.folgaSemana) ? body.folgaSemana : [];
    campos.folgaSemana = [...new Set(arr.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
  }
  // PIN de 4 dígitos p/ execução pública do Checklist. Só mexe se o campo veio no body
  // (undefined preserva o PIN atual — importante no PUT, cujo form não devolve o pin salvo).
  if (body?.pin !== undefined) {
    const pin = String(body.pin).replace(/\D/g, '');
    if (pin === '') campos.pin = null;
    else if (pin.length !== 4) return { error: 'O PIN deve ter 4 dígitos.' };
    else campos.pin = pin;
  }
  return { campos };
}

// Serializa o Funcionario pro ADMIN: o `pin` (execução pública do checklist) NUNCA sai no
// JSON — só o booleano `temPin`. Com ele a tela sabe quem já tem PIN (pra oferecer "remover")
// e o Detalhe do checklist consegue avisar quem está atribuído e não vai conseguir entrar
// pelo link. Só a EXISTÊNCIA, nunca o valor, e só em rota de admin.
const funcAdmin = ({ pin, ...f }) => ({ ...f, temPin: !!pin });

app.get('/api/funcionarios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const status = FUNCIONARIO_STATUS.has(req.query.status) ? req.query.status : null;
    const where = {};
    if (status) where.status = status;
    if (busca) {
      const dig = busca.replace(/\D/g, '');
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { funcao: { contains: busca, mode: 'insensitive' } },
        ...(dig ? [{ cpf: { contains: dig } }, { whatsapp: { contains: dig } }] : []),
      ];
    }
    const lista = await prisma.funcionario.findMany({ where, orderBy: [{ status: 'asc' }, { nome: 'asc' }] });
    res.json(lista.map(funcAdmin));
  } catch (err) { console.error('[funcionarios GET]', err); res.status(500).json({ error: 'Erro ao listar a equipe.' }); }
});

app.post('/api/funcionarios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const d = dadosFuncionario(req.body);
    if (d.error) return res.status(400).json({ error: d.error });
    res.status(201).json(funcAdmin(await prisma.funcionario.create({ data: d.campos })));
  } catch (err) { console.error('[funcionarios POST]', err); res.status(500).json({ error: 'Erro ao criar o funcionário.' }); }
});

app.put('/api/funcionarios/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.funcionario.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const d = dadosFuncionario(req.body);
    if (d.error) return res.status(400).json({ error: d.error });
    res.json(funcAdmin(await prisma.funcionario.update({ where: { id }, data: d.campos })));
  } catch (err) { console.error('[funcionarios PUT]', err); res.status(500).json({ error: 'Erro ao salvar o funcionário.' }); }
});

app.delete('/api/funcionarios/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.funcionario.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    await prisma.funcionario.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[funcionarios DELETE]', err); res.status(500).json({ error: 'Erro ao excluir o funcionário.' }); }
});

// ===== Funções/cargos da equipe (lista escolhida no cadastro + flag de bonificação) =====
const FUNCOES_PADRAO = [
  { nome: 'Aux. de Cozinha', bonificavel: true, ordem: 0 },
  { nome: 'Atendente', bonificavel: true, ordem: 1 },
  { nome: 'Caixa', bonificavel: true, ordem: 2 },
  { nome: 'Gerente', bonificavel: true, ordem: 3 },
  { nome: 'Entregador', bonificavel: false, ordem: 4 },
];
const funcaoJson = (f) => ({ id: f.id, nome: f.nome, bonificavel: f.bonificavel, ordem: f.ordem });
// Nomes das funções que NÃO participam da bonificação (p/ excluir do cálculo).
async function nomesFuncoesNaoBonif(empresaId) {
  const where = empresaId != null ? { empresaId, bonificavel: false } : { bonificavel: false };
  const fs = await prisma.funcao.findMany({ where, select: { nome: true } });
  return new Set(fs.map((f) => f.nome));
}
app.get('/api/funcoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let fs = await prisma.funcao.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
    if (fs.length === 0) {
      await prisma.funcao.createMany({ data: FUNCOES_PADRAO });
      fs = await prisma.funcao.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
    }
    res.json(fs.map(funcaoJson));
  } catch (err) { console.error('[funcoes GET]', err); res.status(500).json({ error: 'Erro ao carregar as funções.' }); }
});
app.put('/api/funcoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const entrada = Array.isArray(req.body?.funcoes) ? req.body.funcoes : [];
    const atuais = await prisma.funcao.findMany();
    const norm = [];
    const vistos = new Set();
    entrada.forEach((f, i) => {
      const nome = String(f?.nome ?? '').trim().slice(0, 60);
      if (!nome) return;
      const chave = nome.toLowerCase();
      if (vistos.has(chave)) return; // sem nomes duplicados
      vistos.add(chave);
      const idExist = Number.isInteger(f?.id) ? f.id : (atuais.find((a) => a.nome.toLowerCase() === chave)?.id ?? null);
      norm.push({ id: idExist, nome, bonificavel: f?.bonificavel !== false, ordem: i });
    });
    const manter = norm.filter((f) => f.id != null).map((f) => f.id);
    await prisma.$transaction([
      prisma.funcao.deleteMany(manter.length ? { where: { id: { notIn: manter } } } : {}),
      ...norm.filter((f) => f.id != null).map((f) => prisma.funcao.update({ where: { id: f.id }, data: { nome: f.nome, bonificavel: f.bonificavel, ordem: f.ordem } })),
      ...norm.filter((f) => f.id == null).map((f) => prisma.funcao.create({ data: { nome: f.nome, bonificavel: f.bonificavel, ordem: f.ordem } })),
    ]);
    const fs = await prisma.funcao.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
    res.json(fs.map(funcaoJson));
  } catch (err) { console.error('[funcoes PUT]', err); res.status(500).json({ error: 'Erro ao salvar as funções.' }); }
});

// ===== Dep. Pessoal › Bonificação — configuração por loja (ADMIN) =====
const BONI_PILARES = new Set(['ASSIDUIDADE', 'DESEMPENHO', 'COLETIVA']);
// Tipos de ocorrência padrão (seed na 1ª vez): Assiduidade = presença; Desempenho = trabalho.
const BONI_TIPOS_PADRAO = [
  { nome: 'Falta', pilar: 'ASSIDUIDADE', percentual: 25, ordem: 0 },
  { nome: 'Atraso', pilar: 'ASSIDUIDADE', percentual: 2, ordem: 1 },
  { nome: 'Atestado', pilar: 'ASSIDUIDADE', percentual: 5, ordem: 2 },
  { nome: 'Advertência', pilar: 'DESEMPENHO', percentual: 15, ordem: 0 },
  { nome: 'Erro', pilar: 'DESEMPENHO', percentual: 5, ordem: 1 },
];
const gerarTokenBonificacao = () => randomBytes(12).toString('base64url');
const BONI_NIVEIS_PADRAO = ['Aprendiz', 'Chapeiro', 'Chapa de Bronze', 'Chapa de Prata', 'Chapa de Ouro', 'Mestre da Chapa', 'Lenda da Chapa'];

// Conquistas (cards) padrão — semeadas na 1ª vez. Regras automáticas mapeáveis ao histórico.
const BONI_RARIDADES = new Set(['COMUM', 'RARO', 'EPICO', 'LENDARIO']);
const BONI_CATEGORIAS = ['JORNADA', 'ASSIDUIDADE', 'DESEMPENHO', 'EXCELENCIA', 'COLABORACAO', 'INOVACAO', 'COLECAO'];
const BONI_TIPOS_CONQUISTA = new Set(['UNICA', 'REPETIVEL', 'PROGRESSIVA']);
// Regras automáticas + por validação. O "tipo de desbloqueio" do card é DERIVADO daqui.
const BONI_REGRAS = new Set([
  'VITORIAS', 'PODIOS', 'MESES_ATIVOS', 'PRESENCA_100', 'SCORE_100',
  'CICLOS_CONSECUTIVOS_95', 'COLECAO',
  'SUGESTOES_IMPLEMENTADAS', 'RECONHECIMENTOS_RECEBIDOS',
  'MANUAL',
]);
const REGRAS_VALIDACAO = new Set(['SUGESTOES_IMPLEMENTADAS', 'RECONHECIMENTOS_RECEBIDOS']);
const desbloqueioDe = (regra) => (regra === 'MANUAL' ? 'MANUAL' : REGRAS_VALIDACAO.has(regra) ? 'VALIDACAO' : 'AUTOMATICA');
// Faixas sugeridas de Coins por raridade (orientativas — o backend não bloqueia).
const FAIXA_COINS = { COMUM: [25, 75], RARO: [75, 200], EPICO: [200, 400], LENDARIO: [400, 750] };
const BONI_CONQUISTAS_PADRAO = [
  { emoji: '🔥', nome: 'Primeira Chama', descricao: 'Concluiu seu primeiro ciclo no programa.', raridade: 'COMUM', regra: 'MESES_ATIVOS', meta: 1, xpBonus: 50, categoria: 'JORNADA', ordem: 0 },
  { emoji: '🚀', nome: 'Veterano', descricao: 'Completou seis ciclos no programa.', raridade: 'RARO', regra: 'MESES_ATIVOS', meta: 6, xpBonus: 200, categoria: 'JORNADA', ordem: 1 },
  { emoji: '💯', nome: 'Assiduidade Perfeita', descricao: 'Concluiu um ciclo com 100% em Assiduidade.', raridade: 'RARO', regra: 'PRESENCA_100', meta: 1, xpBonus: 100, categoria: 'ASSIDUIDADE', ordem: 2 },
  { emoji: '🎯', nome: 'Trabalho Impecável', descricao: 'Concluiu um ciclo com 100% em Desempenho.', raridade: 'RARO', regra: 'SCORE_100', meta: 1, xpBonus: 100, categoria: 'DESEMPENHO', ordem: 3 },
  { emoji: '📈', nome: 'Consistência em Chamas', descricao: 'Finalizou três ciclos consecutivos com Assiduidade e Desempenho acima de 95%.', raridade: 'EPICO', regra: 'CICLOS_CONSECUTIVOS_95', meta: 3, xpBonus: 250, categoria: 'EXCELENCIA', ordem: 4 },
  { emoji: '⭐', nome: 'Destaque do Mês', descricao: 'Conquistou o 1º lugar no Índice de Excelência pela primeira vez.', raridade: 'RARO', regra: 'VITORIAS', meta: 1, xpBonus: 150, categoria: 'EXCELENCIA', ordem: 5 },
  { emoji: '🥇', nome: 'Pódio Frequente', descricao: 'Alcançou o Top 3 em cinco ciclos diferentes.', raridade: 'EPICO', regra: 'PODIOS', meta: 5, xpBonus: 200, categoria: 'EXCELENCIA', ordem: 6 },
  { emoji: '🏆', nome: 'Tripla Coroa', descricao: 'Foi Destaque do Mês em três ciclos diferentes.', raridade: 'EPICO', regra: 'VITORIAS', meta: 3, xpBonus: 300, categoria: 'EXCELENCIA', ordem: 7 },
  { emoji: '💡', nome: 'Ideia em Ação', descricao: 'Teve sua primeira sugestão de melhoria implementada pela empresa.', raridade: 'RARO', regra: 'SUGESTOES_IMPLEMENTADAS', meta: 1, xpBonus: 100, categoria: 'INOVACAO', ordem: 8 },
  { emoji: '🔍', nome: 'Olhar de Dono', descricao: 'Teve três sugestões de melhoria implementadas.', raridade: 'EPICO', regra: 'SUGESTOES_IMPLEMENTADAS', meta: 3, xpBonus: 250, categoria: 'INOVACAO', ordem: 9 },
  { emoji: '🤝', nome: 'Parceiro de Time', descricao: 'Recebeu reconhecimentos de colegas aprovados pela gestão.', raridade: 'RARO', regra: 'RECONHECIMENTOS_RECEBIDOS', meta: 5, xpBonus: 150, categoria: 'COLABORACAO', tipo: 'PROGRESSIVA', niveisJson: [{ nome: 'Bronze', meta: 5, coins: 150 }, { nome: 'Prata', meta: 15, coins: 250 }, { nome: 'Ouro', meta: 30, coins: 400 }], ordem: 10 },
  { emoji: '👑', nome: 'Lenda da Chapa', descricao: 'Desbloqueou todas as conquistas principais do programa.', raridade: 'LENDARIO', regra: 'COLECAO', meta: 0, xpBonus: 500, categoria: 'COLECAO', ordem: 11 },
];
// Níveis de uma conquista: PROGRESSIVA usa niveisJson; as demais têm o nível 0 (única).
function niveisDaConquista(c) {
  if (c.tipo === 'PROGRESSIVA' && Array.isArray(c.niveisJson) && c.niveisJson.length) {
    return c.niveisJson.map((n, i) => ({ nivel: i + 1, meta: Number(n?.meta) || 0, coins: Number(n?.coins) || 0, nome: n?.nome || `Nível ${i + 1}` }));
  }
  return [{ nivel: 0, meta: c.meta, coins: c.xpBonus, nome: null }];
}
const conquistaJson = (c, extra = {}) => ({
  id: c.id, nome: c.nome, descricao: c.descricao || null, emoji: c.emoji, raridade: c.raridade,
  regra: c.regra, meta: c.meta, xpBonus: c.xpBonus, ativo: c.ativo, ordem: c.ordem,
  categoria: c.categoria || 'JORNADA', tipo: c.tipo || 'UNICA',
  niveisJson: Array.isArray(c.niveisJson) ? c.niveisJson : null,
  acumulavel: c.acumulavel !== false, arquivada: !!c.arquivada,
  desbloqueio: desbloqueioDe(c.regra), ...extra,
});

// Métricas de conquista por funcionário, a partir de TODOS os fechamentos da loja.
function metricasConquista(fechamentos) {
  const m = new Map();
  const get = (id) => { let x = m.get(id); if (!x) { x = { vitorias: 0, podios: 0, mesesAtivos: 0, presenca100: 0, score100: 0, consecutivos95: 0 }; m.set(id, x); } return x; };
  // Ordena por ciclo — necessário p/ medir sequência (CICLOS_CONSECUTIVOS_95).
  const ord = [...fechamentos].sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
  const streak = new Map(); // funcionarioId → sequência atual de ciclos ≥95% em Assid E Desemp
  for (const f of ord) {
    const itens = Array.isArray(f.itensJson) ? f.itensJson : [];
    const noCiclo = new Set();
    for (const r of itens) {
      if (r?.funcionarioId == null) continue;
      const x = get(r.funcionarioId);
      noCiclo.add(r.funcionarioId);
      x.mesesAtivos += 1;
      if (Number(r.posicao) === 1) x.vitorias += 1;
      if (Number(r.posicao) <= 3) x.podios += 1;
      if (Number(r.assidPct) >= 100) x.presenca100 += 1;
      if (Number(r.desPct) >= 100) x.score100 += 1;
      const ok = Number(r.assidPct) >= 95 && Number(r.desPct) >= 95;
      const s = ok ? (streak.get(r.funcionarioId) || 0) + 1 : 0;
      streak.set(r.funcionarioId, s);
      if (s > x.consecutivos95) x.consecutivos95 = s;
    }
    // Quem não participou do ciclo quebra a sequência.
    for (const fid of streak.keys()) if (!noCiclo.has(fid)) streak.set(fid, 0);
  }
  return m;
}
// Sugestões da Ouvidoria marcadas como IMPLEMENTADAS, por funcionário (regra de validação).
async function sugestoesImplementadasPorFunc() {
  const g = await prisma.bonificacaoOuvidoria.groupBy({ by: ['funcionarioId'], _count: { _all: true }, where: { tipo: 'SUGESTAO', status: 'IMPLEMENTADA', funcionarioId: { not: null } } });
  return new Map(g.map((r) => [r.funcionarioId, r._count._all]));
}
// Reconhecimentos de colegas APROVADOS pela gestão, por funcionário que recebeu.
async function reconhecimentosRecebidosPorFunc() {
  const g = await prisma.bonificacaoReconhecimento.groupBy({ by: ['paraFuncionarioId'], _count: { _all: true }, where: { status: 'APROVADO' } });
  return new Map(g.map((r) => [r.paraFuncionarioId, r._count._all]));
}
const MET_VAZIA = { vitorias: 0, podios: 0, mesesAtivos: 0, presenca100: 0, score100: 0, consecutivos95: 0 };
// Valor atual do critério de uma regra p/ um funcionário. null = regra não automática.
function valorRegraConquista(regra, ctx) {
  const m = ctx.met || MET_VAZIA;
  switch (regra) {
    case 'VITORIAS': return m.vitorias;
    case 'PODIOS': return m.podios;
    case 'MESES_ATIVOS': return m.mesesAtivos;
    case 'PRESENCA_100': return m.presenca100;
    case 'SCORE_100': return m.score100;
    case 'CICLOS_CONSECUTIVOS_95': return m.consecutivos95;
    case 'SUGESTOES_IMPLEMENTADAS': return ctx.sugestoes || 0;
    case 'RECONHECIMENTOS_RECEBIDOS': return ctx.reconhecimentos || 0;
    case 'COLECAO': return ctx.principaisDesbloqueadas || 0;
    default: return null;
  }
}

// DRY-RUN: calcula os desbloqueios que ACONTECERIAM, sem gravar nada. Base da prévia
// do "Verificar conquistas" e reusado pelo fechamento. Escopo = loja atual (tenantStore).
async function calcularNovasConquistas() {
  const conquistas = await prisma.conquista.findMany({ where: { ativo: true, arquivada: false } });
  const autos = conquistas.filter((c) => c.regra !== 'MANUAL' && BONI_REGRAS.has(c.regra));
  if (!autos.length) return [];
  const funcs = await prisma.funcionario.findMany({ where: { status: 'ATIVO' } });
  const met = metricasConquista(await prisma.bonificacaoFechamento.findMany());
  const sug = await sugestoesImplementadasPorFunc();
  const rec = await reconhecimentosRecebidosPorFunc();
  const desb = await prisma.conquistaDesbloqueada.findMany();
  const jaTem = new Set(desb.map((d) => `${d.conquistaId}:${d.funcionarioId}:${d.nivel}`));
  // "Principais" = tudo que não é de coleção (a Lenda não conta como requisito dela mesma).
  const idsPrincipais = new Set(conquistas.filter((c) => c.categoria !== 'COLECAO').map((c) => c.id));
  const totalPrincipais = idsPrincipais.size;
  const principaisPorFunc = new Map(); // funcionarioId → Set(conquistaId)
  for (const d of desb) if (idsPrincipais.has(d.conquistaId)) {
    if (!principaisPorFunc.has(d.funcionarioId)) principaisPorFunc.set(d.funcionarioId, new Set());
    principaisPorFunc.get(d.funcionarioId).add(d.conquistaId);
  }
  const novos = [];
  // 2 passadas: as normais primeiro; a COLEÇÃO depois (depende do resultado das outras).
  for (const grupo of [autos.filter((c) => c.regra !== 'COLECAO'), autos.filter((c) => c.regra === 'COLECAO')]) {
    for (const f of funcs) {
      for (const c of grupo) {
        const ctx = { met: met.get(f.id), sugestoes: sug.get(f.id), reconhecimentos: rec.get(f.id), principaisDesbloqueadas: principaisPorFunc.get(f.id)?.size || 0 };
        const val = valorRegraConquista(c.regra, ctx);
        if (val == null) continue;
        for (const nv of niveisDaConquista(c)) {
          const chave = `${c.id}:${f.id}:${nv.nivel}`;
          if (jaTem.has(chave)) continue;
          const meta = c.regra === 'COLECAO' ? totalPrincipais : nv.meta;
          if (meta <= 0 || val < meta) continue;
          jaTem.add(chave);
          if (idsPrincipais.has(c.id)) {
            if (!principaisPorFunc.has(f.id)) principaisPorFunc.set(f.id, new Set());
            principaisPorFunc.get(f.id).add(c.id); // conta já p/ a passada da coleção
          }
          novos.push({ conquistaId: c.id, conquistaNome: c.nome, emoji: c.emoji, funcionarioId: f.id, funcionarioNome: f.apelido || f.nome, nivel: nv.nivel, nivelNome: nv.nome, coins: nv.coins });
        }
      }
    }
  }
  return novos;
}

// Grava os desbloqueios calculados e credita os Coins. Idempotente pela unique
// (conquista+funcionário+nível) — um novo cálculo não concede nada duas vezes.
async function aplicarConquistas(novos) {
  for (const n of novos) {
    try {
      await prisma.conquistaDesbloqueada.create({ data: { conquistaId: n.conquistaId, funcionarioId: n.funcionarioId, nivel: n.nivel, origem: 'AUTO' } });
      if (n.coins > 0) {
        const motivo = `Conquista: ${n.conquistaNome}${n.nivelNome ? ' (' + n.nivelNome + ')' : ''}`;
        await prisma.bonificacaoMoeda.create({ data: { funcionarioId: n.funcionarioId, pontos: n.coins, motivo: motivo.slice(0, 200), origem: 'CONQUISTA' } });
      }
    } catch (e) { console.error('[conquistas/aplicar]', e?.message || e); } // unique = já tinha
  }
  return novos.length;
}

// Avalia + concede (usado no fechamento do mês).
async function avaliarConquistas() {
  return aplicarConquistas(await calcularNovasConquistas());
}
function sanitizarSlugBonif(v) {
  const s = String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return s || null;
}
function bonificacaoConfigJson(c) {
  return {
    ativo: c.ativo,
    tokenPublico: c.tokenPublico || null,
    slugPublico: c.slugPublico || null,
    tetoAssiduidade: Number(c.tetoAssiduidade), tetoDesempenho: Number(c.tetoDesempenho), tetoColetiva: Number(c.tetoColetiva),
    bonusTop1: Number(c.bonusTop1), bonusTop2: Number(c.bonusTop2), bonusTop3: Number(c.bonusTop3),
    xpPorNivel: c.xpPorNivel ?? 500,
    moedasPorReal: Number(c.moedasPorReal ?? 1),
    reconhecimentoCoins: c.reconhecimentoCoins ?? 10,
    reconhecimentoMaxMes: c.reconhecimentoMaxMes ?? 3,
  };
}
const bonificacaoTipoJson = (t) => ({
  id: t.id, nome: t.nome, pilar: t.pilar, percentual: Number(t.percentual), ordem: t.ordem, ativo: t.ativo,
  // Motor de Regras
  tipoImpacto: t.tipoImpacto || 'PERCENTUAL', evento: t.evento || null,
  toleranciaMin: t.toleranciaMin ?? null, faixasJson: Array.isArray(t.faixasJson) ? t.faixasJson : null,
  severidadeId: t.severidadeId ?? null,
  reincidenciaAPartir: t.reincidenciaAPartir ?? null,
  incrementoPct: t.incrementoPct != null ? Number(t.incrementoPct) : null,
  tetoOcorrenciaPct: t.tetoOcorrenciaPct != null ? Number(t.tetoOcorrenciaPct) : null,
  tetoCicloPct: t.tetoCicloPct != null ? Number(t.tetoCicloPct) : null,
  prioridade: t.prioridade ?? 0,
});
// Sanitiza os campos do Motor de Regras vindos do PUT /config (bulk de tipos).
function motorCamposRegra(t) {
  const int = (v) => (v === '' || v == null ? null : (Number.isInteger(parseInt(v, 10)) ? parseInt(v, 10) : null));
  const dec = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : null));
  const modos = new Set(['PERCENTUAL', 'FAIXA_MINUTOS', 'SEVERIDADE']);
  let faixas = null;
  if (Array.isArray(t?.faixasJson)) {
    faixas = t.faixasJson
      .map((f) => ({ minMin: int(f?.minMin) ?? 0, maxMin: int(f?.maxMin), percentual: dec(f?.percentual) ?? 0, rotulo: f?.rotulo ? String(f.rotulo).slice(0, 40) : null }))
      .filter((f) => f.percentual != null);
    if (!faixas.length) faixas = null;
  }
  return {
    tipoImpacto: modos.has(t?.tipoImpacto) ? t.tipoImpacto : 'PERCENTUAL',
    evento: t?.evento ? String(t.evento).slice(0, 40) : null,
    toleranciaMin: int(t?.toleranciaMin),
    faixasJson: faixas,
    severidadeId: int(t?.severidadeId),
    reincidenciaAPartir: int(t?.reincidenciaAPartir),
    incrementoPct: dec(t?.incrementoPct),
    tetoOcorrenciaPct: dec(t?.tetoOcorrenciaPct),
    tetoCicloPct: dec(t?.tetoCicloPct),
    prioridade: int(t?.prioridade) ?? 0,
  };
}
// Saldo de Coins por funcionário (mapa funcionarioId → soma do ledger). empresaId explícito p/ rota pública.
async function moedasPorFuncionario(where = {}) {
  const g = await prisma.bonificacaoMoeda.groupBy({ by: ['funcionarioId'], _sum: { pontos: true }, where });
  const m = new Map();
  for (const r of g) m.set(r.funcionarioId, r._sum.pontos || 0);
  return m;
}
const saldoMoedasDe = async (funcionarioId, empresaId) => {
  const r = await prisma.bonificacaoMoeda.aggregate({ _sum: { pontos: true }, where: empresaId != null ? { funcionarioId, empresaId } : { funcionarioId } });
  return r._sum.pontos || 0;
};
// Itens padrão do mercado — semeados na 1ª vez (editáveis pela loja).
const MERCADO_ITENS_PADRAO = [
  { emoji: '☕', nome: 'Bebida ou café grátis', descricao: 'Uma bebida do cardápio, por conta da casa.', custo: 40, estoque: null, ordem: 0 },
  { emoji: '🍔', nome: 'Combo grátis', descricao: 'Um combo do cardápio pra você.', custo: 120, estoque: null, ordem: 1 },
  { emoji: '💵', nome: 'Bônus de R$ 50', descricao: 'R$ 50 no seu pagamento.', custo: 400, estoque: null, ordem: 2 },
  { emoji: '🎫', nome: 'Folga extra (1 dia)', descricao: 'Um dia de folga combinado com a liderança.', custo: 600, estoque: null, ordem: 3 },
];
const mercadoItemJson = (i, extra = {}) => ({ id: i.id, nome: i.nome, descricao: i.descricao || null, emoji: i.emoji, tipo: i.tipo || 'PRODUTO', custo: i.custo, estoque: i.estoque, ativo: i.ativo, ordem: i.ordem, ...extra });

// ===== WhatsApp do PDV (UAZAPI) — número que envia os códigos de acesso (DONO) =====
app.get('/api/pdv/whatsapp/status', async (req, res) => {
  if (!exigirDono(req, res)) return;
  if (!zapiConfigurado()) return res.json({ configurado: false, connected: false });
  try { res.json({ configurado: true, ...(await zapiStatus()) }); }
  catch (err) { res.status(err?.http || 500).json({ error: err?.msg || 'Erro ao consultar o WhatsApp.' }); }
});
app.post('/api/pdv/whatsapp/conectar', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try { res.json({ qrcode: await zapiQrCode() }); }
  catch (err) { res.status(err?.http || 500).json({ error: err?.msg || 'Erro ao gerar o QR Code.' }); }
});
app.post('/api/pdv/whatsapp/instancia', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const nome = (String(req.body?.nome || '').trim() || 'nachapa-pdv').slice(0, 40);
    const data = await zapiCriarInstancia(nome);
    const token = data?.token || data?.instance?.token || data?.instanceToken || data?.hash || null;
    res.status(201).json({ ok: true, token, raw: data });
  } catch (err) { res.status(err?.http || 500).json({ error: err?.msg || 'Erro ao criar a instância.' }); }
});

// ===== Acessos (operadores/gerentes) — CRUD só do DONO =====
const operadorJson = (o) => ({ id: o.id, nome: o.nome, whatsapp: o.whatsapp, areas: o.areas || [], ativo: o.ativo, ultimoAcesso: o.ultimoAcesso || null });
app.get('/api/acessos', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const lista = await prisma.acessoOperador.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
    res.json({ operadores: lista.map(operadorJson), areas: AREAS_DISPONIVEIS });
  } catch (err) { console.error('[acessos GET]', err); res.status(500).json({ error: 'Erro ao carregar os acessos.' }); }
});
app.post('/api/acessos', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const nome = String(req.body?.nome || '').trim().slice(0, 80);
    const canon = foneCanonico(req.body?.whatsapp);
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' });
    if (canon.length < 10) return res.status(400).json({ error: 'Informe o WhatsApp com DDD.' });
    const areas = (Array.isArray(req.body?.areas) ? req.body.areas : []).filter((a) => AREAS_DISPONIVEIS.includes(a));
    const o = await prisma.acessoOperador.create({ data: { nome, whatsapp: canon, areas, ativo: req.body?.ativo !== false } });
    res.status(201).json(operadorJson(o));
  } catch (err) { console.error('[acessos POST]', err); res.status(500).json({ error: 'Erro ao criar o acesso.' }); }
});
app.put('/api/acessos/:id', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.acessoOperador.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Acesso não encontrado.' });
    const data = {};
    if (req.body?.nome !== undefined) data.nome = String(req.body.nome).trim().slice(0, 80);
    if (req.body?.whatsapp !== undefined) data.whatsapp = foneCanonico(req.body.whatsapp);
    if (Array.isArray(req.body?.areas)) data.areas = req.body.areas.filter((a) => AREAS_DISPONIVEIS.includes(a));
    if (req.body?.ativo !== undefined) data.ativo = !!req.body.ativo;
    const o = await prisma.acessoOperador.update({ where: { id }, data });
    res.json(operadorJson(o));
  } catch (err) { console.error('[acessos PUT]', err); res.status(500).json({ error: 'Erro ao salvar o acesso.' }); }
});
app.delete('/api/acessos/:id', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try { await prisma.acessoOperador.deleteMany({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (err) { console.error('[acessos DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===== Login de OPERADOR por WhatsApp (público) — mesma mecânica do colaborador =====
app.post('/api/public/operador/solicitar', async (req, res) => {
  try {
    const canon = foneCanonico(req.body?.telefone);
    if (canon.length < 10) return res.status(400).json({ error: 'Informe seu WhatsApp com DDD.' });
    const op = (await prisma.acessoOperador.findMany({ where: { ativo: true } })).find((o) => foneCanonico(o.whatsapp) === canon);
    if (!op) return res.status(404).json({ error: 'Número não encontrado nos acessos. Fale com o administrador.' });
    const recente = await prisma.colaboradorOtp.findFirst({ where: { empresaId: op.empresaId, telefone: canon, funcionarioId: null }, orderBy: { criadoEm: 'desc' } });
    if (recente && (Date.now() - new Date(recente.criadoEm).getTime()) < 45000) return res.status(429).json({ error: 'Aguarde alguns segundos para pedir um novo código.' });
    if (!zapiConfigurado()) return res.status(503).json({ error: 'O envio por WhatsApp ainda não está configurado.' });
    const codigo = gerarOtp();
    await prisma.colaboradorOtp.create({ data: { empresaId: op.empresaId, funcionarioId: null, telefone: canon, codigoHash: hashOtp(codigo), expiraEm: new Date(Date.now() + 10 * 60000) } });
    const loja = await prisma.empresa.findUnique({ where: { id: op.empresaId }, select: { nome: true } });
    const msg = `*${loja?.nome || 'PDV'}* — Acesso ao sistema\n\nSeu código de acesso é *${codigo}*\nVale por 10 minutos. Não compartilhe. 🔒`;
    try { await zapiEnviarTexto(foneParaEnvio(canon), msg); }
    catch (e) { console.error('[operador/solicitar zapi]', e?.msg || e); return res.status(502).json({ error: 'Não consegui enviar o código pelo WhatsApp agora.' }); }
    res.json({ ok: true, telefoneMascara: canon.slice(0, 2) + '••••' + canon.slice(-2) });
  } catch (err) { console.error('[operador/solicitar]', err); res.status(500).json({ error: 'Erro ao solicitar o código.' }); }
});
app.post('/api/public/operador/verificar', async (req, res) => {
  try {
    if (!JWT_SECRET) return res.status(500).json({ error: 'Configuração de sessão ausente.' });
    const canon = foneCanonico(req.body?.telefone);
    const codigo = soDigitos(req.body?.codigo).slice(0, 6);
    if (codigo.length !== 6) return res.status(400).json({ error: 'Informe o código de 6 dígitos.' });
    const op = (await prisma.acessoOperador.findMany({ where: { ativo: true } })).find((o) => foneCanonico(o.whatsapp) === canon);
    if (!op) return res.status(404).json({ error: 'Número não encontrado nos acessos.' });
    const otp = await prisma.colaboradorOtp.findFirst({ where: { empresaId: op.empresaId, telefone: canon, funcionarioId: null, usado: false }, orderBy: { criadoEm: 'desc' } });
    if (!otp) return res.status(400).json({ error: 'Peça um novo código.' });
    if (new Date(otp.expiraEm).getTime() < Date.now()) return res.status(400).json({ error: 'Código expirado. Peça um novo.' });
    if (otp.tentativas >= 5) return res.status(429).json({ error: 'Muitas tentativas. Peça um novo código.' });
    if (otp.codigoHash !== hashOtp(codigo)) { await prisma.colaboradorOtp.update({ where: { id: otp.id }, data: { tentativas: otp.tentativas + 1 } }); return res.status(400).json({ error: 'Código incorreto.' }); }
    await prisma.colaboradorOtp.update({ where: { id: otp.id }, data: { usado: true } });
    await prisma.acessoOperador.update({ where: { id: op.id }, data: { ultimoAcesso: new Date() } });
    const token = jwt.sign({ tipo: 'operador', oid: op.id, eid: op.empresaId, nome: op.nome, areas: op.areas || [] }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token });
  } catch (err) { console.error('[operador/verificar]', err); res.status(500).json({ error: 'Erro ao verificar o código.' }); }
});

app.get('/api/bonificacao/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let c = await prisma.bonificacaoConfig.findFirst();
    if (!c) c = await prisma.bonificacaoConfig.create({ data: { tokenPublico: gerarTokenBonificacao() } }); // defaults na 1ª vez
    else if (!c.tokenPublico) c = await prisma.bonificacaoConfig.update({ where: { id: c.id }, data: { tokenPublico: gerarTokenBonificacao() } });
    let tipos = await prisma.bonificacaoTipoOcorrencia.findMany({ orderBy: [{ pilar: 'asc' }, { ordem: 'asc' }, { id: 'asc' }] });
    if (!tipos.length) {
      await prisma.bonificacaoTipoOcorrencia.createMany({ data: BONI_TIPOS_PADRAO });
      tipos = await prisma.bonificacaoTipoOcorrencia.findMany({ orderBy: [{ pilar: 'asc' }, { ordem: 'asc' }, { id: 'asc' }] });
    }
    let niveis = await prisma.bonificacaoNivel.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    if (!niveis.length) {
      await prisma.bonificacaoNivel.createMany({ data: BONI_NIVEIS_PADRAO.map((nome, i) => ({ nome, ordem: i })) });
      niveis = await prisma.bonificacaoNivel.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    }
    res.json({ config: bonificacaoConfigJson(c), tipos: tipos.map(bonificacaoTipoJson), niveis: niveis.map((n) => ({ id: n.id, nome: n.nome, ordem: n.ordem })) });
  } catch (err) { console.error('[bonificacao/config GET]', err); res.status(500).json({ error: 'Erro ao carregar a configuração.' }); }
});

app.put('/api/bonificacao/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const b = req.body || {};
    const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
    const data = {
      ativo: b.ativo !== false,
      tetoAssiduidade: num(b.tetoAssiduidade, 100), tetoDesempenho: num(b.tetoDesempenho, 100), tetoColetiva: num(b.tetoColetiva, 100),
      bonusTop1: num(b.bonusTop1, 100), bonusTop2: num(b.bonusTop2, 50), bonusTop3: num(b.bonusTop3, 25),
      xpPorNivel: Math.max(1, Math.round(num(b.xpPorNivel, 500))),
      moedasPorReal: Math.max(0, num(b.moedasPorReal, 1)),
      reconhecimentoCoins: Math.max(0, Math.round(num(b.reconhecimentoCoins, 10))),
      reconhecimentoMaxMes: Math.max(0, Math.round(num(b.reconhecimentoMaxMes, 3))),
    };
    const existente = await prisma.bonificacaoConfig.findFirst();
    // Slug amigável do link público (opcional; único global).
    if (b.slugPublico !== undefined) {
      const slug = sanitizarSlugBonif(b.slugPublico);
      if (slug) {
        const conflito = await prisma.bonificacaoConfig.findFirst({ where: { slugPublico: slug, ...(existente ? { NOT: { id: existente.id } } : {}) } });
        if (conflito) return res.status(409).json({ error: 'Esse endereço já está em uso. Escolha outro.' });
      }
      data.slugPublico = slug;
    }
    const c = existente
      ? await prisma.bonificacaoConfig.update({ where: { id: existente.id }, data })
      : await prisma.bonificacaoConfig.create({ data });

    // Níveis (bulk): lista ordenada de nomes.
    if (Array.isArray(b.niveis)) {
      const atuais = await prisma.bonificacaoNivel.findMany();
      const byId = new Map(atuais.map((n) => [n.id, n]));
      const norm = [];
      b.niveis.forEach((n, i) => {
        const nome = typeof n?.nome === 'string' ? n.nome.trim().slice(0, 60) : '';
        if (!nome) return;
        const idExist = Number.isInteger(n?.id) && byId.has(n.id) ? n.id : null;
        norm.push({ id: idExist, nome, ordem: i });
      });
      const manter = norm.filter((n) => n.id != null).map((n) => n.id);
      await prisma.$transaction([
        prisma.bonificacaoNivel.deleteMany(manter.length ? { where: { id: { notIn: manter } } } : {}),
        ...norm.filter((n) => n.id != null).map((n) => prisma.bonificacaoNivel.update({ where: { id: n.id }, data: { nome: n.nome, ordem: n.ordem } })),
        ...norm.filter((n) => n.id == null).map((n) => prisma.bonificacaoNivel.create({ data: { nome: n.nome, ordem: n.ordem } })),
      ]);
    }

    // Tipos de ocorrência (bulk): normaliza, remove os retirados, atualiza/insere.
    if (Array.isArray(b.tipos)) {
      const atuais = await prisma.bonificacaoTipoOcorrencia.findMany();
      const byId = new Map(atuais.map((t) => [t.id, t]));
      const norm = [];
      b.tipos.forEach((t, i) => {
        const nome = typeof t?.nome === 'string' ? t.nome.trim().slice(0, 60) : '';
        if (!nome) return;
        const pilar = BONI_PILARES.has(t?.pilar) ? t.pilar : 'ASSIDUIDADE';
        const percentual = Math.min(100, num(t?.percentual, 0));
        const idExist = Number.isInteger(t?.id) && byId.has(t.id) ? t.id : null;
        norm.push({ id: idExist, nome, pilar, percentual, ordem: i, ...motorCamposRegra(t) });
      });
      const manter = norm.filter((t) => t.id != null).map((t) => t.id);
      const dados = (t) => ({ nome: t.nome, pilar: t.pilar, percentual: t.percentual, ordem: t.ordem, tipoImpacto: t.tipoImpacto, evento: t.evento, toleranciaMin: t.toleranciaMin, faixasJson: t.faixasJson, severidadeId: t.severidadeId, reincidenciaAPartir: t.reincidenciaAPartir, incrementoPct: t.incrementoPct, tetoOcorrenciaPct: t.tetoOcorrenciaPct, tetoCicloPct: t.tetoCicloPct, prioridade: t.prioridade });
      await prisma.$transaction([
        prisma.bonificacaoTipoOcorrencia.deleteMany(manter.length ? { where: { id: { notIn: manter } } } : {}),
        ...norm.filter((t) => t.id != null).map((t) => prisma.bonificacaoTipoOcorrencia.update({ where: { id: t.id }, data: dados(t) })),
        ...norm.filter((t) => t.id == null).map((t) => prisma.bonificacaoTipoOcorrencia.create({ data: dados(t) })),
      ]);
    }

    const tipos = await prisma.bonificacaoTipoOcorrencia.findMany({ orderBy: [{ pilar: 'asc' }, { ordem: 'asc' }, { id: 'asc' }] });
    const niveis = await prisma.bonificacaoNivel.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    auditarBonif(req, 'CONFIG_ALTERADA', { entidade: 'BonificacaoConfig' });
    res.json({ config: bonificacaoConfigJson(c), tipos: tipos.map(bonificacaoTipoJson), niveis: niveis.map((n) => ({ id: n.id, nome: n.nome, ordem: n.ordem })) });
  } catch (err) { console.error('[bonificacao/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

// ===== Bonificação — motor mensal (lançamentos, coletiva, cálculo, fechamento) =====
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ocorrenciaJson = (o) => ({ id: o.id, funcionarioId: o.funcionarioId, tipoId: o.tipoId, nomeTipo: o.nomeTipo, pilar: o.pilar, percentual: Number(o.percentual), data: o.data, observacao: o.observacao || null, explicacao: o.explicacao || null, severidade: o.severidade || null, minutosEvento: o.minutosEvento ?? null, status: o.status || 'VALIDADA' });

// ── Motor de Regras ───────────────────────────────────────────────────────
// Dado uma regra (tipo de ocorrência) e o contexto do evento, calcula o impacto
// (%), a severidade e a explicação. Modos:
//   PERCENTUAL    → % base fixo (regra simples; comportamento original).
//   FAIXA_MINUTOS → escolhe a faixa de `faixasJson` pelos minutos do evento
//                   (respeita toleranciaMin); usa o % da faixa. (M2)
//   SEVERIDADE    → usa o % da severidade escolhida (ctx.severidadePct). (M3)
// Depois aplica progressividade por reincidência no ciclo, teto por ocorrência
// e teto acumulado no ciclo. (M4). A explicação lista o que pesou (M5).
// ctx: { minutos, severidadePct, severidadeNome, ocorrenciasAnteriores, impactoAcumuladoCiclo }
function calcularImpactoRegra(regra, ctx = {}) {
  const modo = regra.tipoImpacto || 'PERCENTUAL';
  const partes = [];
  let base = Number(regra.percentual) || 0;
  let severidade = regra.severidade || null;

  if (modo === 'FAIXA_MINUTOS') {
    const min = Number(ctx.minutos) || 0;
    const tol = Number(regra.toleranciaMin) || 0;
    if (min <= tol) return { percentual: 0, severidade: null, explicacao: `${regra.nome}: ${min}min dentro da tolerância de ${tol}min — sem impacto` };
    const faixas = Array.isArray(regra.faixasJson) ? regra.faixasJson : [];
    const faixa = faixas.find((f) => min >= (Number(f.minMin) || 0) && (f.maxMin == null || min <= Number(f.maxMin)));
    if (faixa) { base = Number(faixa.percentual) || 0; partes.push(faixa.rotulo || `${faixa.minMin}–${faixa.maxMin ?? '∞'}min`); }
    else partes.push(`${min}min`); // sem faixa casada → usa o % base da regra
  } else if (modo === 'SEVERIDADE') {
    if (ctx.severidadePct != null) base = Number(ctx.severidadePct) || 0;
    if (ctx.severidadeNome) { severidade = ctx.severidadeNome; partes.push(ctx.severidadeNome); }
    else if (severidade) partes.push(severidade);
  }

  // Progressividade: a k-ésima ocorrência da regra no ciclo (k = anteriores+1);
  // a partir de `reincidenciaAPartir`, soma incrementoPct por ocorrência excedente.
  let impacto = base;
  const k = (Number(ctx.ocorrenciasAnteriores) || 0) + 1;
  const aPartir = regra.reincidenciaAPartir;
  const incr = Number(regra.incrementoPct) || 0;
  if (aPartir != null && incr > 0 && k >= aPartir) {
    const add = incr * (k - aPartir + 1);
    impacto = base + add;
    partes.push(`${k}ª vez (+${r2(add)}%)`);
  }

  // Teto por ocorrência.
  if (regra.tetoOcorrenciaPct != null) {
    const teto = Number(regra.tetoOcorrenciaPct);
    if (impacto > teto) { impacto = teto; partes.push(`teto ${teto}%/ocorrência`); }
  }
  // Teto acumulado no ciclo (limita o que resta até o teto).
  if (regra.tetoCicloPct != null) {
    const tetoC = Number(regra.tetoCicloPct);
    const restante = Math.max(0, tetoC - (Number(ctx.impactoAcumuladoCiclo) || 0));
    if (impacto > restante) { impacto = restante; partes.push(`teto ${tetoC}%/ciclo`); }
  }

  const explicacao = `${regra.nome}${partes.length ? ' · ' + partes.join(' · ') : ''}`;
  return { percentual: r2(impacto), severidade, explicacao };
}

// Auditoria best-effort do módulo (empresaId injetado pela extension no create).
function auditarBonif(req, acao, { entidade = null, entidadeId = null, antes = null, depois = null, justificativa = null } = {}) {
  try {
    prisma.bonificacaoAuditoria.create({
      data: { usuarioId: req?.user?.id ?? null, usuarioNome: req?.user?.nome ?? null, acao, entidade, entidadeId, valorAntes: antes, valorDepois: depois, justificativa },
    }).catch(() => {});
  } catch { /* best-effort — nunca bloqueia o fluxo */ }
}

// Separa as ocorrências individuais das coletivas (da equipe) e calcula a Nota
// Coletiva do mês: começa em 100% e desce a soma dos % das ocorrências coletivas.
// Pesos do Índice de Excelência (base do Destaque/Top 3): Assiduidade 50% + Desempenho 35%
// + Contribuições 15% (Contribuições positivas lançadas pela liderança, Bloco 4).
const INDICE_PESO_ASSID = 0.50;
const INDICE_PESO_DESEMP = 0.35;
const INDICE_PESO_CONTRIB = 0.15;
const indiceExcelencia = (assidPct, desPct, contribPct = 0) =>
  r2(INDICE_PESO_ASSID * (assidPct || 0) + INDICE_PESO_DESEMP * (desPct || 0) + INDICE_PESO_CONTRIB * (contribPct || 0));

// Contribuições positivas do mês → Map(funcionarioId → contribPct 0..100 = min(100, Σpontos)).
async function contribPctDoMes(ano, mes, empresaId) {
  const where = empresaId != null ? { empresaId, ano, mes } : { ano, mes };
  const g = await prisma.bonificacaoContribuicao.groupBy({ by: ['funcionarioId'], _sum: { pontos: true }, where });
  const m = new Map();
  for (const r of g) m.set(r.funcionarioId, Math.max(0, Math.min(100, r._sum.pontos || 0)));
  return m;
}

// Score Coletivo do mês a partir dos indicadores configuráveis (Google/iFood/NPS). Média
// ponderada dos valores lançados (val/escalaMax·100). Sem valores lançados → base 100
// (comportamento antigo). empresaId explícito p/ rotas públicas; admin usa a extension.
async function scoreColetivoDoMes(ano, mes, empresaId) {
  const where = empresaId != null ? { empresaId } : {};
  const indicadores = await prisma.bonificacaoIndicador.findMany({ where: { ...where, ativo: true }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
  if (!indicadores.length) return { temIndicadores: false, scoreIndicadores: 100, indicadores: [] };
  const valores = await prisma.bonificacaoIndicadorValor.findMany({ where: { ...where, ano, mes } });
  const vmap = new Map(valores.map((v) => [v.indicadorId, Number(v.valor)]));
  let somaPeso = 0, somaPond = 0;
  const out = indicadores.map((ind) => {
    const temValor = vmap.has(ind.id);
    const valor = temValor ? vmap.get(ind.id) : null;
    const escalaMax = Number(ind.escalaMax) || 100;
    const peso = Number(ind.peso) || 0;
    const pct = temValor ? Math.max(0, Math.min(100, r2((valor / escalaMax) * 100))) : null;
    if (temValor && peso > 0) { somaPeso += peso; somaPond += peso * pct; }
    return { id: ind.id, nome: ind.nome, escalaMax: r2(escalaMax), peso: r2(peso), valor: temValor ? r2(valor) : null, pct };
  });
  const temLancado = somaPeso > 0;
  return { temIndicadores: temLancado, scoreIndicadores: temLancado ? r2(somaPond / somaPeso) : 100, indicadores: out };
}

// Separa individuais/coletivas. baseColetiva = 100 (padrão) ou o Score Coletivo dos
// indicadores; coletiva final = base − Σ ocorrências COLETIVA (coexistem, Bloco 3).
function separarOcorrenciasBonif(ocorrencias, baseColetiva = 100) {
  const coletivas = ocorrencias.filter((o) => o.pilar === 'COLETIVA');
  const individuais = ocorrencias.filter((o) => o.pilar !== 'COLETIVA' && o.funcionarioId != null);
  const descontoColetivo = r2(coletivas.reduce((s, o) => s + Number(o.percentual), 0));
  const coletivaPct = Math.max(0, r2((Number(baseColetiva) || 0) - descontoColetivo));
  return { individuais, coletivas, coletivaPct, descontoColetivo, baseColetiva: r2(baseColetiva) };
}

// Calcula as linhas do mês (por funcionário) a partir das ocorrências + coletiva + tetos.
// contribMap (funcionarioId → contribPct 0..100) entra nos 15% do Índice de Excelência.
function calcularLinhasBonificacao(funcionarios, ocorrencias, coletivaPct, t, contribMap = new Map()) {
  const porFunc = new Map();
  for (const o of ocorrencias) {
    if (o.funcionarioId == null || o.pilar === 'COLETIVA') continue; // coletivas entram via coletivaPct
    const g = porFunc.get(o.funcionarioId) || { assidPen: 0, desPen: 0, ocorrencias: [] };
    const pct = Number(o.percentual);
    if (o.pilar === 'ASSIDUIDADE') g.assidPen += pct;
    else if (o.pilar === 'DESEMPENHO') g.desPen += pct;
    g.ocorrencias.push(ocorrenciaJson(o));
    porFunc.set(o.funcionarioId, g);
  }
  const rows = funcionarios.map((f) => {
    const g = porFunc.get(f.id) || { assidPen: 0, desPen: 0, ocorrencias: [] };
    const assidPct = Math.max(0, 100 - g.assidPen);
    const desPct = Math.max(0, 100 - g.desPen);
    const contribPct = contribMap.get(f.id) || 0;
    const assidRs = r2(assidPct / 100 * t.tetoA);
    const desRs = r2(desPct / 100 * t.tetoD);
    const colRs = r2(coletivaPct / 100 * t.tetoC);
    const subtotal = r2(assidRs + desRs + colRs);
    const indice = indiceExcelencia(assidPct, desPct, contribPct);
    return { funcionarioId: f.id, nome: f.apelido || f.nome, funcao: f.funcao || null, assidPct: r2(assidPct), desPct: r2(desPct), coletivaPct: r2(coletivaPct), contribPct: r2(contribPct), indice, assidRs, desRs, colRs, subtotal, ocorrencias: g.ocorrencias };
  });
  // Ranking (Destaque do Mês): maior Índice de Excelência; desempate por subtotal, depois
  // Assiduidade, depois id. Top 3 levam o bônus Extra. (Bloco 3)
  const bonus = [t.b1, t.b2, t.b3];
  [...rows].sort((a, b) => b.indice - a.indice || b.subtotal - a.subtotal || b.assidPct - a.assidPct || a.funcionarioId - b.funcionarioId)
    .forEach((r, i) => { r.posicao = i + 1; r.classificacaoRs = i < 3 ? r2(bonus[i]) : 0; r.totalRs = r2(r.subtotal + r.classificacaoRs); });
  return rows;
}
async function tetosBonificacao() {
  const c = await prisma.bonificacaoConfig.findFirst();
  return {
    tetoA: Number(c?.tetoAssiduidade ?? 100), tetoD: Number(c?.tetoDesempenho ?? 100), tetoC: Number(c?.tetoColetiva ?? 100),
    b1: Number(c?.bonusTop1 ?? 100), b2: Number(c?.bonusTop2 ?? 50), b3: Number(c?.bonusTop3 ?? 25),
  };
}
function lerAnoMesBonif(req, res) {
  const ano = parseInt(req.query.ano ?? req.body?.ano, 10);
  const mes = parseInt(req.query.mes ?? req.body?.mes, 10);
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) { res.status(400).json({ error: 'Ano/mês inválido.' }); return null; }
  return { ano, mes };
}

// Mês: se fechado devolve o snapshot; senão calcula ao vivo.
app.get('/api/bonificacao/mensal', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    const t = await tetosBonificacao();
    const configOut = { tetoAssiduidade: t.tetoA, tetoDesempenho: t.tetoD, tetoColetiva: t.tetoC, bonusTop1: t.b1, bonusTop2: t.b2, bonusTop3: t.b3 };
    const fech = await prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } });
    if (fech) {
      return res.json({ fechado: true, fechadoEm: fech.fechadoEm, fechadoPor: fech.fechadoPor, coletivaPct: Number(fech.coletivaPct), coletivo: fech.indicadoresJson || null, regras: fech.regrasJson || null, totalGeral: Number(fech.totalGeral), funcionarios: fech.itensJson, config: configOut });
    }
    const exclFuncoes = await nomesFuncoesNaoBonif();
    const funcionarios = (await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } })).filter((f) => !exclFuncoes.has(f.funcao));
    const ocorrenciasTodas = await prisma.bonificacaoOcorrencia.findMany({ where: { ano: am.ano, mes: am.mes }, orderBy: { data: 'desc' } });
    const score = await scoreColetivoDoMes(am.ano, am.mes);
    const contribMap = await contribPctDoMes(am.ano, am.mes);
    const { individuais, coletivas, coletivaPct, descontoColetivo } = separarOcorrenciasBonif(ocorrenciasTodas, score.scoreIndicadores);
    const rows = calcularLinhasBonificacao(funcionarios, individuais, coletivaPct, t, contribMap);
    res.json({ fechado: false, coletivaPct, coletivas: coletivas.map(ocorrenciaJson), coletivo: { ...score, descontoColetivo, coletivaPct }, totalGeral: r2(rows.reduce((s, r) => s + r.totalRs, 0)), funcionarios: rows, config: configOut });
  } catch (err) { console.error('[bonificacao/mensal]', err); res.status(500).json({ error: 'Erro ao carregar o mês.' }); }
});

// Nota coletiva da loja no mês (upsert). Bloqueado se o mês estiver fechado.
app.put('/api/bonificacao/coletiva', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } })) return res.status(400).json({ error: 'O mês já está fechado.' });
    const percentual = Math.max(0, Math.min(100, Number(req.body?.percentual) || 0));
    const ex = await prisma.bonificacaoColetiva.findFirst({ where: { ano: am.ano, mes: am.mes } });
    const c = ex ? await prisma.bonificacaoColetiva.update({ where: { id: ex.id }, data: { percentual } })
                 : await prisma.bonificacaoColetiva.create({ data: { ano: am.ano, mes: am.mes, percentual } });
    res.json({ ok: true, percentual: Number(c.percentual) });
  } catch (err) { console.error('[bonificacao/coletiva]', err); res.status(500).json({ error: 'Erro ao salvar a nota coletiva.' }); }
});

// Lança uma ocorrência (snapshot do tipo). Bloqueado se o mês estiver fechado.
app.post('/api/bonificacao/ocorrencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } })) return res.status(400).json({ error: 'O mês já está fechado.' });
    const tipoId = parseInt(req.body?.tipoId, 10);
    const tipo = await prisma.bonificacaoTipoOcorrencia.findFirst({ where: { id: tipoId } });
    if (!tipo) return res.status(400).json({ error: 'Tipo de ocorrência inválido.' });
    // Ocorrência coletiva (pilar COLETIVA) é da loja — não tem funcionário.
    const ehColetiva = tipo.pilar === 'COLETIVA';
    let funcionarioId = null;
    if (!ehColetiva) {
      funcionarioId = parseInt(req.body?.funcionarioId, 10);
      const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
      if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }
    const data = req.body?.data ? new Date(req.body.data) : new Date();
    if (isNaN(data.getTime())) return res.status(400).json({ error: 'Data inválida.' });
    // Evento → Motor de Regras → impacto (% + severidade + explicação).
    let minutosEvento = null;
    if (req.body?.minutosEvento != null) { const m = parseInt(req.body.minutosEvento, 10); if (Number.isInteger(m)) minutosEvento = m; }
    // Severidade (Desempenho): o admin pode escolher no lançamento; senão a padrão da regra.
    let severidadePct = null, severidadeNome = null;
    const sevId = req.body?.severidadeId ? parseInt(req.body.severidadeId, 10) : (tipo.severidadeId || null);
    if (tipo.tipoImpacto === 'SEVERIDADE' && sevId) {
      const sev = await prisma.bonificacaoSeveridade.findFirst({ where: { id: sevId } });
      if (sev) { severidadePct = Number(sev.percentual); severidadeNome = sev.nome; }
    }
    // Reincidência/teto de ciclo: precisa das ocorrências anteriores da MESMA regra no ciclo.
    let ocorrenciasAnteriores = 0, impactoAcumuladoCiclo = 0;
    if ((tipo.reincidenciaAPartir != null || tipo.tetoCicloPct != null) && funcionarioId != null) {
      const ant = await prisma.bonificacaoOcorrencia.findMany({ where: { funcionarioId, ano: am.ano, mes: am.mes, tipoId: tipo.id }, select: { percentual: true } });
      ocorrenciasAnteriores = ant.length;
      impactoAcumuladoCiclo = ant.reduce((s, o) => s + Number(o.percentual), 0);
    }
    const impacto = calcularImpactoRegra(tipo, { minutos: minutosEvento, severidadePct, severidadeNome, ocorrenciasAnteriores, impactoAcumuladoCiclo });
    // Idempotência opcional: mesmo evento reenviado não gera impacto duplicado.
    const idemp = req.body?.idempotencyKey ? String(req.body.idempotencyKey).slice(0, 160) : null;
    if (idemp) {
      const ja = await prisma.bonificacaoOcorrencia.findFirst({ where: { idempotencyKey: idemp } });
      if (ja) return res.status(200).json({ ...ocorrenciaJson(ja), jaExistia: true });
    }
    const oc = await prisma.bonificacaoOcorrencia.create({
      data: {
        funcionarioId, ano: am.ano, mes: am.mes, tipoId: tipo.id, nomeTipo: tipo.nome, pilar: tipo.pilar,
        percentual: impacto.percentual, severidade: impacto.severidade, explicacao: impacto.explicacao, minutosEvento,
        data, observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 300) : null,
        status: 'VALIDADA', lancadoPor: req.user?.id ?? null, idempotencyKey: idemp,
      },
    });
    auditarBonif(req, 'OCORRENCIA_LANCADA', { entidade: 'BonificacaoOcorrencia', entidadeId: oc.id, depois: { funcionarioId, pilar: tipo.pilar, percentual: Number(impacto.percentual), nomeTipo: tipo.nome, ano: am.ano, mes: am.mes } });
    res.status(201).json(ocorrenciaJson(oc));
  } catch (err) { console.error('[bonificacao/ocorrencias POST]', err); res.status(500).json({ error: 'Erro ao lançar a ocorrência.' }); }
});

app.delete('/api/bonificacao/ocorrencias/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const oc = await prisma.bonificacaoOcorrencia.findFirst({ where: { id } });
    if (!oc) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano: oc.ano, mes: oc.mes } })) return res.status(400).json({ error: 'O mês já está fechado.' });
    await prisma.bonificacaoOcorrencia.delete({ where: { id } });
    auditarBonif(req, 'OCORRENCIA_EXCLUIDA', { entidade: 'BonificacaoOcorrencia', entidadeId: id, antes: { funcionarioId: oc.funcionarioId, pilar: oc.pilar, percentual: Number(oc.percentual), nomeTipo: oc.nomeTipo, ano: oc.ano, mes: oc.mes } });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/ocorrencias DELETE]', err); res.status(500).json({ error: 'Erro ao excluir a ocorrência.' }); }
});

// ── Severidades (Desempenho) — M3 ──
const BONI_SEVERIDADES_PADRAO = [
  { nome: 'Leve', percentual: 5, cor: '#16a34a', ordem: 0 },
  { nome: 'Média', percentual: 10, cor: '#d97706', ordem: 1 },
  { nome: 'Grave', percentual: 20, cor: '#dc2626', ordem: 2 },
  { nome: 'Crítica', percentual: 40, cor: '#7c2d12', ordem: 3 },
];
const severidadeJson = (s) => ({ id: s.id, nome: s.nome, percentual: Number(s.percentual), cor: s.cor || null, ordem: s.ordem, ativo: s.ativo });
app.get('/api/bonificacao/severidades', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let sev = await prisma.bonificacaoSeveridade.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    if (sev.length === 0) { await prisma.bonificacaoSeveridade.createMany({ data: BONI_SEVERIDADES_PADRAO }); sev = await prisma.bonificacaoSeveridade.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] }); }
    res.json(sev.map(severidadeJson));
  } catch (err) { console.error('[bonificacao/severidades GET]', err); res.status(500).json({ error: 'Erro ao carregar severidades.' }); }
});
app.put('/api/bonificacao/severidades', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const entrada = Array.isArray(req.body?.severidades) ? req.body.severidades : [];
    const atuais = await prisma.bonificacaoSeveridade.findMany();
    const norm = [];
    entrada.forEach((s, i) => {
      const nome = String(s?.nome ?? '').trim().slice(0, 40); if (!nome) return;
      const idExist = Number.isInteger(s?.id) && atuais.some((a) => a.id === s.id) ? s.id : null;
      norm.push({ id: idExist, nome, percentual: Math.max(0, Math.min(100, Number(s?.percentual) || 0)), cor: s?.cor ? String(s.cor).slice(0, 20) : null, ordem: i });
    });
    const manter = norm.filter((s) => s.id != null).map((s) => s.id);
    await prisma.$transaction([
      prisma.bonificacaoSeveridade.deleteMany(manter.length ? { where: { id: { notIn: manter } } } : {}),
      ...norm.filter((s) => s.id != null).map((s) => prisma.bonificacaoSeveridade.update({ where: { id: s.id }, data: { nome: s.nome, percentual: s.percentual, cor: s.cor, ordem: s.ordem } })),
      ...norm.filter((s) => s.id == null).map((s) => prisma.bonificacaoSeveridade.create({ data: { nome: s.nome, percentual: s.percentual, cor: s.cor, ordem: s.ordem } })),
    ]);
    auditarBonif(req, 'SEVERIDADES_ALTERADAS', { entidade: 'BonificacaoSeveridade' });
    const sev = await prisma.bonificacaoSeveridade.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    res.json(sev.map(severidadeJson));
  } catch (err) { console.error('[bonificacao/severidades PUT]', err); res.status(500).json({ error: 'Erro ao salvar severidades.' }); }
});

// ===== Bonificação — Indicadores coletivos configuráveis (Bloco 3) =====
const indicadorJson = (i) => ({ id: i.id, nome: i.nome, escalaMax: Number(i.escalaMax), peso: Number(i.peso), ordem: i.ordem, ativo: i.ativo });
app.get('/api/bonificacao/indicadores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const inds = await prisma.bonificacaoIndicador.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    res.json(inds.map(indicadorJson));
  } catch (err) { console.error('[bonificacao/indicadores GET]', err); res.status(500).json({ error: 'Erro ao carregar indicadores.' }); }
});
app.put('/api/bonificacao/indicadores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const entrada = Array.isArray(req.body?.indicadores) ? req.body.indicadores : [];
    const atuais = await prisma.bonificacaoIndicador.findMany();
    const norm = [];
    entrada.forEach((it, i) => {
      const nome = String(it?.nome ?? '').trim().slice(0, 40); if (!nome) return;
      const idExist = Number.isInteger(it?.id) && atuais.some((a) => a.id === it.id) ? it.id : null;
      norm.push({ id: idExist, nome, escalaMax: Math.max(0.01, Number(it?.escalaMax) || 5), peso: Math.max(0, Number(it?.peso) || 0), ordem: i, ativo: it?.ativo !== false });
    });
    const manter = norm.filter((n) => n.id != null).map((n) => n.id);
    await prisma.$transaction([
      prisma.bonificacaoIndicador.deleteMany(manter.length ? { where: { id: { notIn: manter } } } : {}),
      ...norm.filter((n) => n.id != null).map((n) => prisma.bonificacaoIndicador.update({ where: { id: n.id }, data: { nome: n.nome, escalaMax: n.escalaMax, peso: n.peso, ordem: n.ordem, ativo: n.ativo } })),
      ...norm.filter((n) => n.id == null).map((n) => prisma.bonificacaoIndicador.create({ data: { nome: n.nome, escalaMax: n.escalaMax, peso: n.peso, ordem: n.ordem, ativo: n.ativo } })),
    ]);
    auditarBonif(req, 'INDICADORES_ALTERADOS', { entidade: 'BonificacaoIndicador' });
    const inds = await prisma.bonificacaoIndicador.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    res.json(inds.map(indicadorJson));
  } catch (err) { console.error('[bonificacao/indicadores PUT]', err); res.status(500).json({ error: 'Erro ao salvar indicadores.' }); }
});
// Score coletivo + valores lançados de um mês (painel do mês).
app.get('/api/bonificacao/indicadores/valores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try { res.json(await scoreColetivoDoMes(am.ano, am.mes)); }
  catch (err) { console.error('[bonificacao/indicadores/valores GET]', err); res.status(500).json({ error: 'Erro ao carregar os valores.' }); }
});
// Lança/atualiza os valores dos indicadores do mês (bloqueado se o mês estiver fechado).
app.post('/api/bonificacao/indicadores/valores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } })) return res.status(400).json({ error: 'O mês já está fechado.' });
    const entrada = Array.isArray(req.body?.valores) ? req.body.valores : [];
    const validId = new Set((await prisma.bonificacaoIndicador.findMany()).map((i) => i.id));
    for (const v of entrada) {
      const indicadorId = parseInt(v?.indicadorId, 10);
      if (!validId.has(indicadorId)) continue;
      if (v?.valor === '' || v?.valor == null) { await prisma.bonificacaoIndicadorValor.deleteMany({ where: { indicadorId, ano: am.ano, mes: am.mes } }); continue; }
      const valor = Math.max(0, Number(v.valor) || 0);
      const ex = await prisma.bonificacaoIndicadorValor.findFirst({ where: { indicadorId, ano: am.ano, mes: am.mes } });
      if (ex) await prisma.bonificacaoIndicadorValor.update({ where: { id: ex.id }, data: { valor } });
      else await prisma.bonificacaoIndicadorValor.create({ data: { indicadorId, ano: am.ano, mes: am.mes, valor } });
    }
    auditarBonif(req, 'INDICADORES_VALORES_LANCADOS', { entidade: 'BonificacaoIndicadorValor', justificativa: `${String(am.mes).padStart(2, '0')}/${am.ano}` });
    res.json(await scoreColetivoDoMes(am.ano, am.mes));
  } catch (err) { console.error('[bonificacao/indicadores/valores POST]', err); res.status(500).json({ error: 'Erro ao lançar os valores.' }); }
});

// ===== Bonificação — Ouvidoria / Sugestões (ADMIN) (Bloco 4) =====
// IMPLEMENTADA = a sugestão virou realidade (alimenta as conquistas de Inovação).
const OUVIDORIA_STATUS = new Set(['ABERTA', 'EM_ANALISE', 'RESPONDIDA', 'IMPLEMENTADA', 'ARQUIVADA']);
const OUVIDORIA_TIPOS = new Set(['RECLAMACAO', 'SUGESTAO', 'ELOGIO', 'DENUNCIA', 'OUTRO']);
app.get('/api/bonificacao/ouvidoria', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const st = req.query.status && OUVIDORIA_STATUS.has(String(req.query.status)) ? String(req.query.status) : null;
    const lista = await prisma.bonificacaoOuvidoria.findMany({ where: st ? { status: st } : {}, orderBy: { criadoEm: 'desc' }, take: 200 });
    const ids = [...new Set(lista.filter((o) => !o.anonimo && o.funcionarioId).map((o) => o.funcionarioId))];
    const nomes = new Map((await prisma.funcionario.findMany({ where: { id: { in: ids } } })).map((f) => [f.id, f.nome]));
    res.json(lista.map((o) => ({ id: o.id, tipo: o.tipo, mensagem: o.mensagem, status: o.status, anonimo: o.anonimo, funcionario: o.anonimo ? null : (o.funcionarioId ? nomes.get(o.funcionarioId) || null : null), resposta: o.resposta || null, respondidoPor: o.respondidoPor || null, respondidoEm: o.respondidoEm || null, criadoEm: o.criadoEm })));
  } catch (err) { console.error('[bonificacao/ouvidoria GET]', err); res.status(500).json({ error: 'Erro ao carregar a ouvidoria.' }); }
});
app.patch('/api/bonificacao/ouvidoria/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const o = await prisma.bonificacaoOuvidoria.findFirst({ where: { id } });
    if (!o) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    const data = {};
    if (req.body?.status && OUVIDORIA_STATUS.has(req.body.status)) data.status = req.body.status;
    if (req.body?.resposta !== undefined) {
      data.resposta = req.body.resposta ? String(req.body.resposta).slice(0, 2000) : null;
      data.respondidoPor = req.user?.nome || null; data.respondidoEm = new Date();
      if (data.resposta && !data.status) data.status = 'RESPONDIDA';
    }
    await prisma.bonificacaoOuvidoria.update({ where: { id }, data });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/ouvidoria PATCH]', err); res.status(500).json({ error: 'Erro ao atualizar.' }); }
});

// ===== Bonificação — Contribuições positivas (ADMIN) — 15% do Índice (Bloco 4) =====
app.get('/api/bonificacao/contribuicoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    const lista = await prisma.bonificacaoContribuicao.findMany({ where: { ano: am.ano, mes: am.mes }, orderBy: { criadoEm: 'desc' } });
    const ids = [...new Set(lista.map((c) => c.funcionarioId))];
    const nomes = new Map((await prisma.funcionario.findMany({ where: { id: { in: ids } } })).map((f) => [f.id, f.nome]));
    const contribMap = await contribPctDoMes(am.ano, am.mes);
    res.json({
      contribuicoes: lista.map((c) => ({ id: c.id, funcionarioId: c.funcionarioId, funcionario: nomes.get(c.funcionarioId) || '—', descricao: c.descricao, pontos: c.pontos, coins: c.coins, registradoPor: c.registradoPor || null, criadoEm: c.criadoEm })),
      contribPct: Object.fromEntries(contribMap),
    });
  } catch (err) { console.error('[bonificacao/contribuicoes GET]', err); res.status(500).json({ error: 'Erro ao carregar contribuições.' }); }
});
app.post('/api/bonificacao/contribuicoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const descricao = String(req.body?.descricao || '').trim().slice(0, 300);
    if (!descricao) return res.status(400).json({ error: 'Descreva a contribuição.' });
    const pontos = Math.max(0, Math.min(100, Math.round(Number(req.body?.pontos) || 25)));
    const coins = Math.max(0, Math.round(Number(req.body?.coins) || 0));
    const c = await prisma.bonificacaoContribuicao.create({ data: { funcionarioId, ano: am.ano, mes: am.mes, descricao, pontos, coins, registradoPor: req.user?.nome || null } });
    if (coins > 0) await prisma.bonificacaoMoeda.create({ data: { funcionarioId, pontos: coins, motivo: `Contribuição: ${descricao}`.slice(0, 200), origem: 'CONTRIBUICAO' } });
    auditarBonif(req, 'CONTRIBUICAO_LANCADA', { entidade: 'BonificacaoContribuicao', entidadeId: c.id, valorDepois: { funcionarioId, pontos, coins } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error('[bonificacao/contribuicoes POST]', err); res.status(500).json({ error: 'Erro ao lançar a contribuição.' }); }
});
app.delete('/api/bonificacao/contribuicoes/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const c = await prisma.bonificacaoContribuicao.findFirst({ where: { id } });
    if (!c) return res.status(404).json({ error: 'Contribuição não encontrada.' });
    await prisma.bonificacaoContribuicao.delete({ where: { id } });
    auditarBonif(req, 'CONTRIBUICAO_EXCLUIDA', { entidade: 'BonificacaoContribuicao', entidadeId: id });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/contribuicoes DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===== Bonificação — Reconhecimento entre colegas (ADMIN) (Bloco 4) =====
app.get('/api/bonificacao/reconhecimentos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const st = req.query.status ? String(req.query.status) : null;
    const lista = await prisma.bonificacaoReconhecimento.findMany({ where: st ? { status: st } : {}, orderBy: { criadoEm: 'desc' }, take: 200 });
    const ids = [...new Set(lista.flatMap((r) => [r.deFuncionarioId, r.paraFuncionarioId]))];
    const nomes = new Map((await prisma.funcionario.findMany({ where: { id: { in: ids } } })).map((f) => [f.id, f.nome]));
    res.json(lista.map((r) => ({ id: r.id, de: nomes.get(r.deFuncionarioId) || '—', para: nomes.get(r.paraFuncionarioId) || '—', mensagem: r.mensagem, coins: r.coins, status: r.status, criadoEm: r.criadoEm, decididoPor: r.decididoPor || null, decididoEm: r.decididoEm || null })));
  } catch (err) { console.error('[bonificacao/reconhecimentos GET]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});
app.patch('/api/bonificacao/reconhecimentos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const acao = String(req.body?.acao || '');
    const r = await prisma.bonificacaoReconhecimento.findFirst({ where: { id } });
    if (!r) return res.status(404).json({ error: 'Reconhecimento não encontrado.' });
    if (r.status !== 'PENDENTE') return res.status(400).json({ error: 'Este reconhecimento já foi avaliado.' });
    if (acao === 'aprovar') {
      await prisma.bonificacaoReconhecimento.update({ where: { id }, data: { status: 'APROVADO', decididoPor: req.user?.nome || null, decididoEm: new Date() } });
      if (r.coins > 0) await prisma.bonificacaoMoeda.create({ data: { funcionarioId: r.paraFuncionarioId, pontos: r.coins, motivo: 'Reconhecimento de colega', origem: 'RECONHECIMENTO' } });
      auditarBonif(req, 'RECONHECIMENTO_APROVADO', { entidade: 'BonificacaoReconhecimento', entidadeId: id });
    } else if (acao === 'rejeitar') {
      await prisma.bonificacaoReconhecimento.update({ where: { id }, data: { status: 'REJEITADO', decididoPor: req.user?.nome || null, decididoEm: new Date() } });
      auditarBonif(req, 'RECONHECIMENTO_REJEITADO', { entidade: 'BonificacaoReconhecimento', entidadeId: id });
    } else return res.status(400).json({ error: 'Ação inválida.' });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/reconhecimentos PATCH]', err); res.status(500).json({ error: 'Erro ao avaliar.' }); }
});

// ===== Bonificação — Auditoria (ADMIN) (Bloco 5) =====
app.get('/api/bonificacao/auditoria', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const lista = await prisma.bonificacaoAuditoria.findMany({ orderBy: { criadoEm: 'desc' }, take: 150 });
    res.json(lista.map((a) => ({ id: a.id, acao: a.acao, entidade: a.entidade || null, entidadeId: a.entidadeId || null, usuarioNome: a.usuarioNome || null, justificativa: a.justificativa || null, valorDepois: a.valorDepois || null, criadoEm: a.criadoEm })));
  } catch (err) { console.error('[bonificacao/auditoria GET]', err); res.status(500).json({ error: 'Erro ao carregar a auditoria.' }); }
});

// ===== Bonificação — Pendências do gestor (ADMIN) (Bloco 5) =====
app.get('/api/bonificacao/pendencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    const [fech, recPend, ouvAberta, resgPend, indicadores, indicScore] = await Promise.all([
      prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } }),
      prisma.bonificacaoReconhecimento.count({ where: { status: 'PENDENTE' } }),
      prisma.bonificacaoOuvidoria.count({ where: { status: 'ABERTA' } }),
      prisma.mercadoResgate.count({ where: { status: 'PENDENTE' } }),
      prisma.bonificacaoIndicador.count({ where: { ativo: true } }),
      scoreColetivoDoMes(am.ano, am.mes),
    ]);
    res.json({
      mesFechado: !!fech,
      reconhecimentosPendentes: recPend,
      ouvidoriaAberta: ouvAberta,
      resgatesPendentes: resgPend,
      indicadoresPendentes: indicadores > 0 && !indicScore.temIndicadores, // há indicadores mas nenhum valor lançado no mês
    });
  } catch (err) { console.error('[bonificacao/pendencias GET]', err); res.status(500).json({ error: 'Erro ao carregar as pendências.' }); }
});

// Simula o impacto de uma regra num cenário, SEM gravar (M5).
// body: { regra:{...campos da regra...}, ocorrencias?, minutos?, severidadePct? }
app.post('/api/bonificacao/simular', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const regra = req.body?.regra || {};
    const n = Math.max(1, Math.min(20, parseInt(req.body?.ocorrencias, 10) || 1));
    const minutos = req.body?.minutos != null ? Number(req.body.minutos) : null;
    const severidadePct = req.body?.severidadePct != null ? Number(req.body.severidadePct) : null;
    const linhas = [];
    let acum = 0;
    for (let k = 0; k < n; k++) {
      const imp = calcularImpactoRegra(regra, { minutos, severidadePct, ocorrenciasAnteriores: k, impactoAcumuladoCiclo: acum });
      acum += imp.percentual;
      linhas.push({ ocorrencia: k + 1, percentual: imp.percentual, explicacao: imp.explicacao });
    }
    res.json({ linhas, totalPct: r2(acum) });
  } catch (err) { console.error('[bonificacao/simular]', err); res.status(500).json({ error: 'Erro ao simular.' }); }
});

// Fecha o mês: congela o cálculo num snapshot (relatório de pagamento).
app.post('/api/bonificacao/fechar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } })) return res.status(400).json({ error: 'Este mês já está fechado.' });
    const t = await tetosBonificacao();
    const cfgFech = await prisma.bonificacaoConfig.findFirst();
    const exclFuncoes = await nomesFuncoesNaoBonif();
    const funcionarios = (await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } })).filter((f) => !exclFuncoes.has(f.funcao));
    const ocorrenciasTodas = await prisma.bonificacaoOcorrencia.findMany({ where: { ano: am.ano, mes: am.mes }, orderBy: { data: 'desc' } });
    const score = await scoreColetivoDoMes(am.ano, am.mes);
    const contribMap = await contribPctDoMes(am.ano, am.mes);
    const { individuais, coletivaPct } = separarOcorrenciasBonif(ocorrenciasTodas, score.scoreIndicadores);
    const rows = calcularLinhasBonificacao(funcionarios, individuais, coletivaPct, t, contribMap);
    const totalGeral = r2(rows.reduce((s, r) => s + r.totalRs, 0));
    // Snapshot das regras vigentes (congela tetos/bônus/pesos p/ o relatório histórico). (Bloco 5)
    const regrasSnapshot = {
      tetoAssiduidade: t.tetoA, tetoDesempenho: t.tetoD, tetoColetiva: t.tetoC,
      bonusTop1: t.b1, bonusTop2: t.b2, bonusTop3: t.b3,
      indice: { assid: INDICE_PESO_ASSID, desemp: INDICE_PESO_DESEMP, contrib: INDICE_PESO_CONTRIB },
      coletivoComIndicadores: !!score.temIndicadores,
      congeladoEm: new Date().toISOString(),
    };
    const f = await prisma.bonificacaoFechamento.create({
      data: { ano: am.ano, mes: am.mes, coletivaPct, itensJson: rows, indicadoresJson: score, regrasJson: regrasSnapshot, totalGeral, fechadoPor: req.user?.nome || null },
    });
    auditarBonif(req, 'MES_FECHADO', { entidade: 'BonificacaoFechamento', entidadeId: f.id, justificativa: `${String(am.mes).padStart(2, '0')}/${am.ano}`, valorDepois: { totalGeral } });
    // Credita COINS do mês (permanentes — 1x só; reabrir NÃO estorna, pois podem já ter sido gastas).
    const moedasPorReal = Number(cfgFech?.moedasPorReal ?? 1);
    if (moedasPorReal > 0 && !(await prisma.bonificacaoMoeda.findFirst({ where: { origem: 'FECHAMENTO', ano: am.ano, mes: am.mes } }))) {
      const moedaData = rows.map((r) => ({ funcionarioId: r.funcionarioId, pontos: Math.round(r.totalRs * moedasPorReal), motivo: `Fechamento ${String(am.mes).padStart(2, '0')}/${am.ano}`, origem: 'FECHAMENTO', ano: am.ano, mes: am.mes })).filter((d) => d.pontos > 0);
      if (moedaData.length) await prisma.bonificacaoMoeda.createMany({ data: moedaData });
    }
    // Desbloqueia conquistas atingidas com o novo histórico (não bloqueia o fechamento se falhar).
    let novasConquistas = 0;
    try { novasConquistas = await avaliarConquistas(); } catch (e) { console.error('[conquistas/fechar]', e); }
    res.status(201).json({ ok: true, fechadoEm: f.fechadoEm, totalGeral, funcionarios: rows, novasConquistas });
  } catch (err) { console.error('[bonificacao/fechar]', err); res.status(500).json({ error: 'Erro ao fechar o mês.' }); }
});

// Reabre o mês (remove o fechamento) para novos ajustes.
app.post('/api/bonificacao/reabrir', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    await prisma.bonificacaoFechamento.deleteMany({ where: { ano: am.ano, mes: am.mes } });
    // Coins do fechamento NÃO são estornados na reabertura (podem já ter sido gastos no Mercado).
    auditarBonif(req, 'MES_REABERTO', { entidade: 'BonificacaoFechamento', justificativa: `${String(am.mes).padStart(2, '0')}/${am.ano}` });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/reabrir]', err); res.status(500).json({ error: 'Erro ao reabrir o mês.' }); }
});

// ===== Bonificação — Coins / link privado (ADMIN) =====
// Equipe com saldo de Coins e link privado.
app.get('/api/bonificacao/equipe', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarios = await prisma.funcionario.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }] });
    const moedaMap = await moedasPorFuncionario();
    res.json(funcionarios.map((f) => ({ id: f.id, nome: f.nome, funcao: f.funcao || null, status: f.status, tokenPrivado: f.tokenPrivado || null, coins: moedaMap.get(f.id) || 0, moedas: moedaMap.get(f.id) || 0 })));
  } catch (err) { console.error('[bonificacao/equipe]', err); res.status(500).json({ error: 'Erro ao carregar a equipe.' }); }
});

// ===== Bonificação — MOEDAS (economia do mercado) (ADMIN) =====
// Credita/desconta moedas manualmente (pode ser negativo p/ ajuste).
app.post('/api/bonificacao/moedas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    const pontos = parseInt(req.body?.pontos, 10);
    if (!Number.isFinite(pontos) || pontos === 0) return res.status(400).json({ error: 'Informe as moedas (pode ser negativo).' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    if (pontos < 0 && (await saldoMoedasDe(funcionarioId)) + pontos < 0) return res.status(400).json({ error: 'Saldo insuficiente para descontar essas moedas.' });
    await prisma.bonificacaoMoeda.create({ data: { funcionarioId, pontos, motivo: req.body?.motivo ? String(req.body.motivo).slice(0, 200) : null, origem: 'MANUAL' } });
    res.status(201).json({ ok: true, saldo: await saldoMoedasDe(funcionarioId) });
  } catch (err) { console.error('[bonificacao/moedas POST]', err); res.status(500).json({ error: 'Erro ao lançar moedas.' }); }
});

// Extrato de moedas de um funcionário (+ saldo atual).
app.get('/api/bonificacao/moedas/:funcionarioId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.params.funcionarioId, 10);
    const lista = await prisma.bonificacaoMoeda.findMany({ where: { funcionarioId }, orderBy: { criadoEm: 'desc' }, take: 60 });
    res.json({ saldo: await saldoMoedasDe(funcionarioId), extrato: lista.map((x) => ({ id: x.id, pontos: x.pontos, motivo: x.motivo, origem: x.origem, criadoEm: x.criadoEm })) });
  } catch (err) { console.error('[bonificacao/moedas GET]', err); res.status(500).json({ error: 'Erro ao carregar as moedas.' }); }
});

app.delete('/api/bonificacao/moedas/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const x = await prisma.bonificacaoMoeda.findFirst({ where: { id } });
    if (!x) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    if (x.origem !== 'MANUAL') return res.status(400).json({ error: 'Só é possível excluir lançamentos manuais.' });
    await prisma.bonificacaoMoeda.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/moedas DELETE]', err); res.status(500).json({ error: 'Erro ao excluir as moedas.' }); }
});

// ===== Bonificação — MERCADO: itens (ADMIN) =====
app.get('/api/bonificacao/mercado/itens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let itens = await prisma.mercadoItem.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    if (!itens.length) {
      await prisma.mercadoItem.createMany({ data: MERCADO_ITENS_PADRAO });
      itens = await prisma.mercadoItem.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    }
    res.json(itens.map((i) => mercadoItemJson(i)));
  } catch (err) { console.error('[mercado/itens GET]', err); res.status(500).json({ error: 'Erro ao carregar os itens.' }); }
});

function lerMercadoItemBody(b) {
  const nome = typeof b?.nome === 'string' ? b.nome.trim().slice(0, 80) : '';
  if (!nome) return { erro: 'Informe o nome do item.' };
  const custo = Math.max(0, Math.round(Number(b?.custo) || 0));
  const emoji = (typeof b?.emoji === 'string' && b.emoji.trim()) ? Array.from(b.emoji.trim())[0] : '🎁';
  const descricao = typeof b?.descricao === 'string' ? b.descricao.trim().slice(0, 240) || null : null;
  const estoqueRaw = b?.estoque;
  const estoque = (estoqueRaw === '' || estoqueRaw == null) ? null : Math.max(0, Math.round(Number(estoqueRaw) || 0));
  const tipo = b?.tipo === 'FOLGA' ? 'FOLGA' : 'PRODUTO';
  return { data: { nome, descricao, emoji, tipo, custo, estoque, ativo: b?.ativo !== false, ordem: Math.round(Number(b?.ordem) || 0) } };
}

app.post('/api/bonificacao/mercado/itens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const p = lerMercadoItemBody(req.body || {});
    if (p.erro) return res.status(400).json({ error: p.erro });
    const i = await prisma.mercadoItem.create({ data: p.data });
    res.status(201).json(mercadoItemJson(i));
  } catch (err) { console.error('[mercado/itens POST]', err); res.status(500).json({ error: 'Erro ao criar o item.' }); }
});

app.put('/api/bonificacao/mercado/itens/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.mercadoItem.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Item não encontrado.' });
    const p = lerMercadoItemBody(req.body || {});
    if (p.erro) return res.status(400).json({ error: p.erro });
    const i = await prisma.mercadoItem.update({ where: { id }, data: p.data });
    res.json(mercadoItemJson(i));
  } catch (err) { console.error('[mercado/itens PUT]', err); res.status(500).json({ error: 'Erro ao salvar o item.' }); }
});

app.delete('/api/bonificacao/mercado/itens/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.mercadoItem.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Item não encontrado.' });
    await prisma.mercadoItem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[mercado/itens DELETE]', err); res.status(500).json({ error: 'Erro ao excluir o item.' }); }
});

// ===== Bonificação — MERCADO: resgates (ADMIN) =====
// Fila de resgates (opcionalmente filtrada por status), com nome do funcionário.
app.get('/api/bonificacao/mercado/resgates', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const status = req.query.status && ['PENDENTE', 'APROVADO', 'ENTREGUE', 'REJEITADO'].includes(req.query.status) ? req.query.status : undefined;
    const lista = await prisma.mercadoResgate.findMany({ where: status ? { status } : {}, orderBy: { criadoEm: 'desc' }, take: 200 });
    const funcs = new Map((await prisma.funcionario.findMany()).map((f) => [f.id, f]));
    res.json(lista.map((r) => ({
      id: r.id, funcionarioId: r.funcionarioId, funcionarioNome: funcs.get(r.funcionarioId)?.nome || '—',
      itemNome: r.itemNome, itemEmoji: r.itemEmoji, tipoItem: r.tipoItem || 'PRODUTO', dataDesejada: r.dataDesejada || null,
      custo: r.custo, status: r.status, observacao: r.observacao || null,
      decididoPor: r.decididoPor || null, decididoEm: r.decididoEm, criadoEm: r.criadoEm,
    })));
  } catch (err) { console.error('[mercado/resgates GET]', err); res.status(500).json({ error: 'Erro ao carregar os resgates.' }); }
});

// Aprova um resgate pendente (moedas já foram debitadas na solicitação).
app.post('/api/bonificacao/mercado/resgates/:id/aprovar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const r = await prisma.mercadoResgate.findFirst({ where: { id } });
    if (!r) return res.status(404).json({ error: 'Resgate não encontrado.' });
    if (r.status !== 'PENDENTE') return res.status(400).json({ error: 'Este resgate não está pendente.' });
    await prisma.mercadoResgate.update({ where: { id }, data: { status: 'APROVADO', decididoPor: req.user?.nome || null, decididoEm: new Date() } });
    auditarBonif(req, 'MERCADO_RESGATE_APROVADO', { entidade: 'MercadoResgate', entidadeId: id });
    res.json({ ok: true });
  } catch (err) { console.error('[mercado/resgates aprovar]', err); res.status(500).json({ error: 'Erro ao aprovar.' }); }
});

// Marca como entregue (prêmio entregue ao funcionário).
app.post('/api/bonificacao/mercado/resgates/:id/entregar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const r = await prisma.mercadoResgate.findFirst({ where: { id } });
    if (!r) return res.status(404).json({ error: 'Resgate não encontrado.' });
    if (!['PENDENTE', 'APROVADO'].includes(r.status)) return res.status(400).json({ error: 'Este resgate não pode ser entregue.' });
    await prisma.mercadoResgate.update({ where: { id }, data: { status: 'ENTREGUE', decididoPor: req.user?.nome || null, decididoEm: new Date() } });
    auditarBonif(req, 'MERCADO_RESGATE_ENTREGUE', { entidade: 'MercadoResgate', entidadeId: id });
    res.json({ ok: true });
  } catch (err) { console.error('[mercado/resgates entregar]', err); res.status(500).json({ error: 'Erro ao marcar como entregue.' }); }
});

// Rejeita: devolve as moedas (estorno) e repõe o estoque.
app.post('/api/bonificacao/mercado/resgates/:id/rejeitar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const r = await prisma.mercadoResgate.findFirst({ where: { id } });
    if (!r) return res.status(404).json({ error: 'Resgate não encontrado.' });
    if (!['PENDENTE', 'APROVADO'].includes(r.status)) return res.status(400).json({ error: 'Este resgate não pode ser rejeitado.' });
    await prisma.bonificacaoMoeda.create({ data: { funcionarioId: r.funcionarioId, pontos: r.custo, motivo: `Estorno: ${r.itemNome}`, origem: 'ESTORNO', resgateId: r.id } });
    if (r.itemId != null) { const it = await prisma.mercadoItem.findFirst({ where: { id: r.itemId } }); if (it && it.estoque != null) await prisma.mercadoItem.update({ where: { id: it.id }, data: { estoque: it.estoque + 1 } }); }
    await prisma.mercadoResgate.update({ where: { id }, data: { status: 'REJEITADO', observacao: req.body?.motivo ? String(req.body.motivo).slice(0, 240) : r.observacao, decididoPor: req.user?.nome || null, decididoEm: new Date() } });
    auditarBonif(req, 'MERCADO_RESGATE_REJEITADO', { entidade: 'MercadoResgate', entidadeId: id, valorDepois: { estornado: r.custo } });
    res.json({ ok: true });
  } catch (err) { console.error('[mercado/resgates rejeitar]', err); res.status(500).json({ error: 'Erro ao rejeitar.' }); }
});

// Gera (ou rotaciona) o link privado do funcionário.
app.post('/api/funcionarios/:id/link-privado', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const token = (func.tokenPrivado && req.body?.rotacionar !== true) ? func.tokenPrivado : randomBytes(12).toString('base64url');
    const upd = await prisma.funcionario.update({ where: { id }, data: { tokenPrivado: token } });
    res.json({ tokenPrivado: upd.tokenPrivado });
  } catch (err) { console.error('[funcionarios/link-privado]', err); res.status(500).json({ error: 'Erro ao gerar o link.' }); }
});

// Gera um novo token público (invalida o link anterior).
app.post('/api/bonificacao/token/rotacionar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await prisma.bonificacaoConfig.findFirst();
    if (!c) return res.status(404).json({ error: 'Configuração não encontrada.' });
    const upd = await prisma.bonificacaoConfig.update({ where: { id: c.id }, data: { tokenPublico: gerarTokenBonificacao() } });
    res.json({ tokenPublico: upd.tokenPublico });
  } catch (err) { console.error('[bonificacao/token]', err); res.status(500).json({ error: 'Erro ao gerar o link.' }); }
});

// ===== Bonificação — Conquistas (cards) (ADMIN) =====
// Lista as conquistas (semeia as padrão na 1ª vez) + quantos funcionários já têm cada uma.
app.get('/api/bonificacao/conquistas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let conquistas = await prisma.conquista.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    if (!conquistas.length) {
      await prisma.conquista.createMany({ data: BONI_CONQUISTAS_PADRAO });
      conquistas = await prisma.conquista.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    }
    const grp = await prisma.conquistaDesbloqueada.groupBy({ by: ['conquistaId'], _count: { _all: true } });
    const cnt = new Map(grp.map((g) => [g.conquistaId, g._count._all]));
    res.json(conquistas.map((c) => conquistaJson(c, { desbloqueada: cnt.get(c.id) || 0 })));
  } catch (err) { console.error('[bonificacao/conquistas GET]', err); res.status(500).json({ error: 'Erro ao carregar as conquistas.' }); }
});

function lerConquistaBody(b) {
  const nome = typeof b?.nome === 'string' ? b.nome.trim().slice(0, 80) : '';
  if (!nome) return { erro: 'Informe o nome da conquista.' };
  const raridade = BONI_RARIDADES.has(b?.raridade) ? b.raridade : 'COMUM';
  const regra = BONI_REGRAS.has(b?.regra) ? b.regra : 'MANUAL';
  // COLECAO calcula a meta sozinha (total de conquistas principais).
  const meta = regra === 'COLECAO' ? 0 : Math.max(1, Math.round(Number(b?.meta) || 1));
  const xpBonus = Math.max(0, Math.round(Number(b?.xpBonus) || 0));
  const emoji = (typeof b?.emoji === 'string' && b.emoji.trim()) ? Array.from(b.emoji.trim())[0] : '🏅';
  const descricao = typeof b?.descricao === 'string' ? b.descricao.trim().slice(0, 240) || null : null;
  const categoria = BONI_CATEGORIAS.includes(b?.categoria) ? b.categoria : 'JORNADA';
  const tipo = BONI_TIPOS_CONQUISTA.has(b?.tipo) ? b.tipo : 'UNICA';
  let niveisJson = null;
  if (tipo === 'PROGRESSIVA' && Array.isArray(b?.niveisJson)) {
    niveisJson = b.niveisJson
      .map((n) => ({ nome: String(n?.nome ?? '').trim().slice(0, 30) || null, meta: Math.max(1, Math.round(Number(n?.meta) || 0)), coins: Math.max(0, Math.round(Number(n?.coins) || 0)) }))
      .filter((n) => n.nome && n.meta > 0)
      .sort((a, z) => a.meta - z.meta); // níveis sempre em ordem crescente
    if (!niveisJson.length) return { erro: 'Uma conquista progressiva precisa de pelo menos um nível.' };
  }
  return { data: { nome, descricao, emoji, raridade, regra, meta, xpBonus, categoria, tipo, niveisJson, acumulavel: b?.acumulavel !== false, ativo: b?.ativo !== false, ordem: Math.round(Number(b?.ordem) || 0) } };
}

app.post('/api/bonificacao/conquistas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const p = lerConquistaBody(req.body || {});
    if (p.erro) return res.status(400).json({ error: p.erro });
    const c = await prisma.conquista.create({ data: p.data });
    res.status(201).json(conquistaJson(c, { desbloqueada: 0 }));
  } catch (err) { console.error('[bonificacao/conquistas POST]', err); res.status(500).json({ error: 'Erro ao criar a conquista.' }); }
});

app.put('/api/bonificacao/conquistas/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.conquista.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Conquista não encontrada.' });
    const p = lerConquistaBody(req.body || {});
    if (p.erro) return res.status(400).json({ error: p.erro });
    const c = await prisma.conquista.update({ where: { id }, data: p.data });
    const n = await prisma.conquistaDesbloqueada.count({ where: { conquistaId: id } });
    res.json(conquistaJson(c, { desbloqueada: n }));
  } catch (err) { console.error('[bonificacao/conquistas PUT]', err); res.status(500).json({ error: 'Erro ao salvar a conquista.' }); }
});

app.delete('/api/bonificacao/conquistas/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.conquista.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Conquista não encontrada.' });
    // Conquista já concedida NÃO se apaga (apagaria o histórico e os Coins ficariam órfãos):
    // nesse caso só dá pra arquivar.
    const concedidas = await prisma.conquistaDesbloqueada.count({ where: { conquistaId: id } });
    if (concedidas > 0) return res.status(409).json({ error: `Esta conquista já foi concedida a ${concedidas} colaborador(es). Arquive em vez de excluir — assim o histórico é preservado.` });
    await prisma.conquista.delete({ where: { id } });
    auditarBonif(req, 'CONQUISTA_EXCLUIDA', { entidade: 'Conquista', entidadeId: id, justificativa: ex.nome });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/conquistas DELETE]', err); res.status(500).json({ error: 'Erro ao excluir a conquista.' }); }
});

// Verificar conquistas — PRÉVIA (não grava): quem cumpriu critério e ainda não recebeu.
app.get('/api/bonificacao/conquistas/verificar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const novos = await calcularNovasConquistas();
    res.json({
      novos,
      total: novos.length,
      colaboradores: new Set(novos.map((n) => n.funcionarioId)).size,
      coins: novos.reduce((s, n) => s + (n.coins || 0), 0),
    });
  } catch (err) { console.error('[conquistas/verificar GET]', err); res.status(500).json({ error: 'Erro ao verificar as conquistas.' }); }
});
// Confirma e concede o que a prévia encontrou (recalcula na hora — nada de confiar no cliente).
app.post('/api/bonificacao/conquistas/verificar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const novos = await calcularNovasConquistas();
    const total = await aplicarConquistas(novos);
    auditarBonif(req, 'CONQUISTAS_CONCEDIDAS', { entidade: 'ConquistaDesbloqueada', valorDepois: { total, coins: novos.reduce((s, n) => s + (n.coins || 0), 0) } });
    res.json({ ok: true, total });
  } catch (err) { console.error('[conquistas/verificar POST]', err); res.status(500).json({ error: 'Erro ao conceder as conquistas.' }); }
});
// Arquivar/desarquivar — preserva o histórico (não apaga desbloqueios concedidos).
app.patch('/api/bonificacao/conquistas/:id/arquivar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.conquista.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Conquista não encontrada.' });
    const arquivada = req.body?.arquivada !== false;
    await prisma.conquista.update({ where: { id }, data: { arquivada } });
    auditarBonif(req, arquivada ? 'CONQUISTA_ARQUIVADA' : 'CONQUISTA_DESARQUIVADA', { entidade: 'Conquista', entidadeId: id });
    res.json({ ok: true, arquivada });
  } catch (err) { console.error('[conquistas/arquivar]', err); res.status(500).json({ error: 'Erro ao arquivar.' }); }
});
// Duplicar — nasce inativa p/ o gestor ajustar antes de valer.
app.post('/api/bonificacao/conquistas/:id/duplicar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.conquista.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Conquista não encontrada.' });
    const c = await prisma.conquista.create({
      data: {
        nome: `${ex.nome} (cópia)`.slice(0, 80), descricao: ex.descricao, emoji: ex.emoji, raridade: ex.raridade,
        regra: ex.regra, meta: ex.meta, xpBonus: ex.xpBonus, categoria: ex.categoria, tipo: ex.tipo,
        niveisJson: ex.niveisJson ?? undefined, acumulavel: ex.acumulavel, ativo: false, ordem: ex.ordem + 1,
      },
    });
    res.status(201).json(conquistaJson(c, { desbloqueada: 0 }));
  } catch (err) { console.error('[conquistas/duplicar]', err); res.status(500).json({ error: 'Erro ao duplicar.' }); }
});

// Quem já desbloqueou uma conquista (p/ o modal de conceder manual).
app.get('/api/bonificacao/conquistas/:id/desbloqueios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const conquistaId = parseInt(req.params.id, 10);
    const lista = await prisma.conquistaDesbloqueada.findMany({ where: { conquistaId }, orderBy: { desbloqueadoEm: 'desc' } });
    const nomes = new Map((await prisma.funcionario.findMany({ select: { id: true, nome: true, apelido: true } })).map((f) => [f.id, f.apelido || f.nome]));
    const conq = await prisma.conquista.findFirst({ where: { id: conquistaId } });
    const niveis = conq ? niveisDaConquista(conq) : [];
    res.json(lista.map((d) => ({
      id: d.id, funcionarioId: d.funcionarioId, funcionario: nomes.get(d.funcionarioId) || '—',
      origem: d.origem, nivel: d.nivel, nivelNome: niveis.find((n) => n.nivel === d.nivel)?.nome || null,
      motivo: d.motivo || null, concedidoPor: d.concedidoPor || null, desbloqueadoEm: d.desbloqueadoEm,
    })));
  } catch (err) { console.error('[bonificacao/conquistas/desbloqueios]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

// Concede uma conquista manualmente a um funcionário (idempotente; credita o bônus em Coins).
app.post('/api/bonificacao/conquistas/:id/conceder', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const conquistaId = parseInt(req.params.id, 10);
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    const c = await prisma.conquista.findFirst({ where: { id: conquistaId } });
    if (!c) return res.status(404).json({ error: 'Conquista não encontrada.' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    if (await prisma.conquistaDesbloqueada.findFirst({ where: { conquistaId, funcionarioId } })) return res.json({ ok: true, jaTinha: true });
    // Concessão manual exige justificativa (fica no histórico de quem concedeu).
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
    if (!motivo) return res.status(400).json({ error: 'Descreva o motivo da concessão.' });
    const ano = Number.isInteger(parseInt(req.body?.ano, 10)) ? parseInt(req.body.ano, 10) : null;
    const mes = Number.isInteger(parseInt(req.body?.mes, 10)) ? parseInt(req.body.mes, 10) : null;
    await prisma.conquistaDesbloqueada.create({ data: { conquistaId, funcionarioId, origem: 'MANUAL', motivo, ano, mes, concedidoPor: req.user?.nome || null } });
    if (c.xpBonus > 0) await prisma.bonificacaoMoeda.create({ data: { funcionarioId, pontos: c.xpBonus, motivo: `Conquista: ${c.nome}`, origem: 'CONQUISTA', ano, mes } });
    auditarBonif(req, 'CONQUISTA_CONCEDIDA', { entidade: 'Conquista', entidadeId: conquistaId, justificativa: motivo, valorDepois: { funcionarioId, coins: c.xpBonus } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error('[bonificacao/conquistas/conceder]', err); res.status(500).json({ error: 'Erro ao conceder a conquista.' }); }
});

// Revoga um desbloqueio (corrige um erro). Não estorna os Coins já creditados.
app.delete('/api/bonificacao/conquistas/desbloqueio/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const d = await prisma.conquistaDesbloqueada.findFirst({ where: { id } });
    if (!d) return res.status(404).json({ error: 'Desbloqueio não encontrado.' });
    await prisma.conquistaDesbloqueada.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/conquistas/desbloqueio DELETE]', err); res.status(500).json({ error: 'Erro ao revogar.' }); }
});

// PÚBLICO — ranking do mês p/ a equipe (sem login). Só nome/pilares/valores/ranking;
// NÃO expõe o motivo das ocorrências (privacidade). Escopo por empresaId do token.
const rowPublicoBonif = (r) => ({
  funcionarioId: r.funcionarioId, nome: r.nome, funcao: r.funcao || null, posicao: r.posicao,
  assidPct: r.assidPct, desPct: r.desPct, coletivaPct: r.coletivaPct, contribPct: r.contribPct ?? null, indice: r.indice ?? null,
  assidRs: r.assidRs, desRs: r.desRs, colRs: r.colRs, classificacaoRs: r.classificacaoRs, totalRs: r.totalRs,
});
app.get('/api/public/bonificacao/:token', async (req, res) => {
  try {
    const chave = String(req.params.token);
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { OR: [{ slugPublico: chave }, { tokenPublico: chave }] } });
    if (!cfg) return res.status(404).json({ error: 'Página não encontrada.' });
    if (!cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const empresaId = cfg.empresaId; // rota pública: sem tenantStore → filtro manual
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true, logoPublicaDataUrl: true } });
    const tiposRaw = await prisma.bonificacaoTipoOcorrencia.findMany({ where: { empresaId }, orderBy: [{ pilar: 'asc' }, { ordem: 'asc' }, { id: 'asc' }] });
    const tipos = tiposRaw.map((tp) => ({ nome: tp.nome, pilar: tp.pilar, percentual: Number(tp.percentual) }));
    const now = new Date();
    const ano = parseInt(req.query.ano, 10) || now.getFullYear();
    const mes = parseInt(req.query.mes, 10) || (now.getMonth() + 1);
    if (mes < 1 || mes > 12) return res.status(400).json({ error: 'Mês inválido.' });
    const t = {
      tetoA: Number(cfg.tetoAssiduidade), tetoD: Number(cfg.tetoDesempenho), tetoC: Number(cfg.tetoColetiva),
      b1: Number(cfg.bonusTop1), b2: Number(cfg.bonusTop2), b3: Number(cfg.bonusTop3),
    };
    const fech = await prisma.bonificacaoFechamento.findFirst({ where: { empresaId, ano, mes } });
    let funcionarios, coletivaPct, fechado = false;
    if (fech) {
      funcionarios = (Array.isArray(fech.itensJson) ? fech.itensJson : []).map(rowPublicoBonif);
      coletivaPct = Number(fech.coletivaPct); fechado = true;
    } else {
      const exclFuncoes = await nomesFuncoesNaoBonif(empresaId);
      const fs = (await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' } })).filter((f) => !exclFuncoes.has(f.funcao));
      const ocs = await prisma.bonificacaoOcorrencia.findMany({ where: { empresaId, ano, mes } });
      const score = await scoreColetivoDoMes(ano, mes, empresaId);
      const contribMap = await contribPctDoMes(ano, mes, empresaId);
      const sep = separarOcorrenciasBonif(ocs, score.scoreIndicadores);
      coletivaPct = sep.coletivaPct;
      funcionarios = calcularLinhasBonificacao(fs, sep.individuais, coletivaPct, t, contribMap).map(rowPublicoBonif);
    }
    // Link PÚBLICO: expõe SÓ o pódio (Top 3). As posições de 4º em diante não saem
    // daqui nem no JSON — cada um vê o próprio resultado na Área do Colaborador.
    const podio = funcionarios.filter((f) => f.posicao && f.posicao <= 3);
    // Indicadores do coletivo (Google/NPS/metas) — nomes p/ as etiquetas da página.
    const indicadores = (await prisma.bonificacaoIndicador.findMany({ where: { empresaId, ativo: true }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }], select: { nome: true } })).map((i) => i.nome);
    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoPublicaDataUrl || loja?.logoDataUrl || null },
      ano, mes, fechado, coletivaPct,
      config: { tetoAssiduidade: t.tetoA, tetoDesempenho: t.tetoD, tetoColetiva: t.tetoC, bonusTop1: t.b1, bonusTop2: t.b2, bonusTop3: t.b3 },
      tipos, indicadores, funcionarios: podio,
    });
  } catch (err) { console.error('[public/bonificacao]', err); res.status(500).json({ error: 'Erro ao carregar a página.' }); }
});

// ── ÁREA DO COLABORADOR — login por WhatsApp (OTP) ───────────────────────────
// Dados da loja p/ a tela de login (valida o slug).
app.get('/api/public/colaborador/:slug/loja', async (req, res) => {
  try {
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { OR: [{ slugPublico: String(req.params.slug) }, { tokenPublico: String(req.params.slug) }] } });
    if (!cfg || !cfg.ativo) return res.status(404).json({ error: 'Loja não encontrada.' });
    const loja = await prisma.empresa.findUnique({ where: { id: cfg.empresaId }, select: { nome: true, logoDataUrl: true, logoPublicaDataUrl: true } });
    res.json({ nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoPublicaDataUrl || loja?.logoDataUrl || null });
  } catch (err) { console.error('[colaborador/loja]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

// Solicita o código: acha o funcionário ATIVO com o número e envia o OTP por WhatsApp.
app.post('/api/public/colaborador/:slug/solicitar', async (req, res) => {
  try {
    const empresaId = await empresaPorSlugColaborador(req.params.slug);
    if (empresaId == null) return res.status(404).json({ error: 'Loja não encontrada.' });
    const canon = foneCanonico(req.body?.telefone);
    if (canon.length < 10) return res.status(400).json({ error: 'Informe seu WhatsApp com DDD.' });
    const ativos = await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, select: { id: true, whatsapp: true } });
    const func = ativos.find((f) => foneCanonico(f.whatsapp) === canon);
    if (!func) return res.status(404).json({ error: 'Não encontramos esse número. Confira com a liderança se seu WhatsApp está cadastrado.' });
    // Rate-limit: no máximo 1 código a cada 45s por funcionário.
    const recente = await prisma.colaboradorOtp.findFirst({ where: { empresaId, funcionarioId: func.id }, orderBy: { criadoEm: 'desc' } });
    if (recente && (Date.now() - new Date(recente.criadoEm).getTime()) < 45000) return res.status(429).json({ error: 'Aguarde alguns segundos para pedir um novo código.' });
    if (!zapiConfigurado()) return res.status(503).json({ error: 'O envio por WhatsApp ainda não está configurado. Fale com a liderança.' });
    const codigo = gerarOtp();
    await prisma.colaboradorOtp.create({ data: { empresaId, funcionarioId: func.id, telefone: canon, codigoHash: hashOtp(codigo), expiraEm: new Date(Date.now() + 10 * 60000) } });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });
    const msg = `*${loja?.nome || 'Sua loja'}* — Área do Colaborador\n\nSeu código de acesso é *${codigo}*\nVale por 10 minutos. Não compartilhe com ninguém. 🔒`;
    try { await zapiEnviarTexto(foneParaEnvio(canon), msg); }
    catch (e) { console.error('[colaborador/solicitar zapi]', e?.msg || e); return res.status(502).json({ error: 'Não consegui enviar o código pelo WhatsApp agora. Tente de novo em instantes.' }); }
    res.json({ ok: true, telefoneMascara: canon.slice(0, 2) + '••••' + canon.slice(-2) });
  } catch (err) { console.error('[colaborador/solicitar]', err); res.status(500).json({ error: 'Erro ao solicitar o código.' }); }
});

// Verifica o código e devolve o token de sessão (30 dias).
app.post('/api/public/colaborador/:slug/verificar', async (req, res) => {
  try {
    if (!JWT_SECRET) return res.status(500).json({ error: 'Configuração de sessão ausente.' });
    const empresaId = await empresaPorSlugColaborador(req.params.slug);
    if (empresaId == null) return res.status(404).json({ error: 'Loja não encontrada.' });
    const canon = foneCanonico(req.body?.telefone);
    const codigo = soDigitos(req.body?.codigo).slice(0, 6);
    if (codigo.length !== 6) return res.status(400).json({ error: 'Informe o código de 6 dígitos.' });
    const otp = await prisma.colaboradorOtp.findFirst({ where: { empresaId, telefone: canon, usado: false }, orderBy: { criadoEm: 'desc' } });
    if (!otp) return res.status(400).json({ error: 'Peça um novo código.' });
    if (new Date(otp.expiraEm).getTime() < Date.now()) return res.status(400).json({ error: 'Código expirado. Peça um novo.' });
    if (otp.tentativas >= 5) return res.status(429).json({ error: 'Muitas tentativas. Peça um novo código.' });
    if (otp.codigoHash !== hashOtp(codigo)) {
      await prisma.colaboradorOtp.update({ where: { id: otp.id }, data: { tentativas: otp.tentativas + 1 } });
      return res.status(400).json({ error: 'Código incorreto.' });
    }
    await prisma.colaboradorOtp.update({ where: { id: otp.id }, data: { usado: true } });
    const token = jwt.sign({ fid: otp.funcionarioId, eid: empresaId, tipo: 'colab' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token });
  } catch (err) { console.error('[colaborador/verificar]', err); res.status(500).json({ error: 'Erro ao verificar o código.' }); }
});

// ÁREA DO COLABORADOR — dados do mês (exige sessão OTP; deriva o funcionário do token).
app.get('/api/public/colaborador/me', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível. Fale com a liderança.' });
    const empresaId = func.empresaId;
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg || !cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true, logoPublicaDataUrl: true } });
    const now = new Date();
    const ano = now.getFullYear(), mes = now.getMonth() + 1;
    const t = { tetoA: Number(cfg.tetoAssiduidade), tetoD: Number(cfg.tetoDesempenho), tetoC: Number(cfg.tetoColetiva), b1: Number(cfg.bonusTop1), b2: Number(cfg.bonusTop2), b3: Number(cfg.bonusTop3) };
    const fech = await prisma.bonificacaoFechamento.findFirst({ where: { empresaId, ano, mes } });
    let rows, coletivaPct, coletivo;
    if (fech) { rows = Array.isArray(fech.itensJson) ? fech.itensJson : []; coletivaPct = Number(fech.coletivaPct); coletivo = fech.indicadoresJson || null; }
    else {
      const fs = await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' } });
      const ocs = await prisma.bonificacaoOcorrencia.findMany({ where: { empresaId, ano, mes } });
      const score = await scoreColetivoDoMes(ano, mes, empresaId);
      const contribMap = await contribPctDoMes(ano, mes, empresaId);
      const sep = separarOcorrenciasBonif(ocs, score.scoreIndicadores); // coletiva = base(indicadores ou 100) − ocorrências COLETIVA
      coletivaPct = sep.coletivaPct; coletivo = { ...score, coletivaPct };
      rows = calcularLinhasBonificacao(fs, sep.individuais, coletivaPct, t, contribMap);
    }
    const meu = rows.find((r) => r.funcionarioId === func.id) || null;
    // Mural de conquistas: desbloqueadas + bloqueadas com progresso (métricas do histórico da loja).
    const conquistas = await prisma.conquista.findMany({ where: { empresaId, ativo: true, arquivada: false }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    const desbTodos = await prisma.conquistaDesbloqueada.findMany({ where: { empresaId, funcionarioId: func.id } });
    const desbMap = new Map(desbTodos.map((d) => [d.conquistaId, d.desbloqueadoEm])); // qualquer nível
    const nivelMax = new Map(); // conquistaId → maior nível já desbloqueado
    for (const d of desbTodos) if ((nivelMax.get(d.conquistaId) ?? -1) < d.nivel) nivelMax.set(d.conquistaId, d.nivel);
    const mfMap = metricasConquista(await prisma.bonificacaoFechamento.findMany({ where: { empresaId } }));
    const idsPrincipais = new Set(conquistas.filter((c) => c.categoria !== 'COLECAO').map((c) => c.id));
    const ctxMeu = {
      met: mfMap.get(func.id),
      sugestoes: await prisma.bonificacaoOuvidoria.count({ where: { empresaId, funcionarioId: func.id, tipo: 'SUGESTAO', status: 'IMPLEMENTADA' } }),
      reconhecimentos: await prisma.bonificacaoReconhecimento.count({ where: { empresaId, paraFuncionarioId: func.id, status: 'APROVADO' } }),
      principaisDesbloqueadas: desbTodos.filter((d) => idsPrincipais.has(d.conquistaId)).length,
    };
    const conquistasOut = conquistas.map((c) => {
      const unlocked = desbMap.has(c.id);
      const niveis = niveisDaConquista(c);
      const feito = nivelMax.get(c.id) ?? -1;
      // Progressiva: o "próximo" é o 1º nível ainda não desbloqueado.
      const proximo = niveis.find((n) => n.nivel > feito) || null;
      const completa = c.tipo === 'PROGRESSIVA' ? !proximo : unlocked;
      let progresso = null
      if (!completa && c.regra !== 'MANUAL') {
        const val = valorRegraConquista(c.regra, ctxMeu) || 0;
        const meta = c.regra === 'COLECAO' ? idsPrincipais.size : (proximo?.meta ?? c.meta);
        if (meta > 0) progresso = { atual: Math.min(val, meta), meta, nivelNome: proximo?.nome || null };
      }
      return {
        id: c.id, nome: c.nome, descricao: c.descricao || null, emoji: c.emoji, raridade: c.raridade,
        categoria: c.categoria || 'JORNADA', coinsBonus: proximo?.coins ?? c.xpBonus,
        desbloqueada: completa || unlocked, desbloqueadoEm: unlocked ? desbMap.get(c.id) : null,
        nivelAtual: c.tipo === 'PROGRESSIVA' && feito > 0 ? (niveis[feito - 1]?.nome || null) : null,
        progresso,
      };
    });
    // Mercado: saldo de Coins, itens à venda e histórico de resgates do funcionário.
    const saldoMoedas = await saldoMoedasDe(func.id, empresaId);
    const itens = await prisma.mercadoItem.findMany({ where: { empresaId, ativo: true }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    const meusResgates = await prisma.mercadoResgate.findMany({ where: { empresaId, funcionarioId: func.id }, orderBy: { criadoEm: 'desc' }, take: 20 });
    // Bloco 4: colegas p/ reconhecer, meus reconhecimentos, ouvidoria e contribuições.
    const colegasRaw = await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO', NOT: { id: func.id } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true, funcao: true } });
    const recRaw = await prisma.bonificacaoReconhecimento.findMany({ where: { empresaId, OR: [{ deFuncionarioId: func.id }, { paraFuncionarioId: func.id }] }, orderBy: { criadoEm: 'desc' }, take: 40 });
    const recIds = [...new Set(recRaw.flatMap((r) => [r.deFuncionarioId, r.paraFuncionarioId]))];
    const recNomes = new Map((await prisma.funcionario.findMany({ where: { id: { in: recIds } }, select: { id: true, nome: true, apelido: true } })).map((f) => [f.id, f.apelido || f.nome]));
    const enviadosMes = recRaw.filter((r) => r.deFuncionarioId === func.id && r.ano === ano && r.mes === mes && r.status !== 'REJEITADO').length;
    const minhasMsgs = await prisma.bonificacaoOuvidoria.findMany({ where: { empresaId, funcionarioId: func.id, anonimo: false }, orderBy: { criadoEm: 'desc' }, take: 20 });
    const minhasContrib = await prisma.bonificacaoContribuicao.findMany({ where: { empresaId, funcionarioId: func.id, ano, mes }, orderBy: { criadoEm: 'desc' } });
    // Bloco 5: comparação pessoal entre ciclos (últimos fechamentos).
    const fechs = await prisma.bonificacaoFechamento.findMany({ where: { empresaId }, orderBy: [{ ano: 'desc' }, { mes: 'desc' }], take: 6 });
    const historico = fechs.map((fc) => {
      const linha = (Array.isArray(fc.itensJson) ? fc.itensJson : []).find((x) => x.funcionarioId === func.id);
      return { ano: fc.ano, mes: fc.mes, totalRs: linha ? Number(linha.totalRs) : 0, indice: linha && linha.indice != null ? Number(linha.indice) : null, posicao: linha ? linha.posicao : null };
    }).reverse();
    // Área do Colaborador: minhas marcações de ponto do mês (reaproveita o espelho).
    let ponto = { marcacoes: [], resumo: { diasTrabalhados: 0, atrasos: 0, faltas: 0 } };
    // Ponto de HOJE (dia de expediente) pro painel "Seu dia" da Início: entrada/saída,
    // se é folga, e a situação. Só derivado quando o dia de expediente cai no mês do
    // espelho (`ano`/`mes`); na virada de mês fica null pra não dar palpite errado.
    let pontoHoje = null;
    try {
      const esp = await calcularEspelho(func.id, ano, mes);
      const marc = (esp.dias || [])
        .filter((d) => !d.futuro && (d.entradaHm || d.situacao === 'falta' || d.situacao === 'incompleto' || d.situacao === 'abonado' || d.situacao === 'abonado_trabalhado'))
        .map((d) => ({ dia: d.dia, dow: d.dow, entrada: d.entradaHm, saida: d.saidaHm, situacao: d.situacao, atrasoMin: d.atrasoMin, ausenciaTipo: d.ausenciaTipo || null }))
        .reverse();
      ponto = { marcacoes: marc, resumo: { diasTrabalhados: esp.totais.diasTrabalhados, atrasos: esp.totais.atrasos, faltas: esp.totais.faltas } };
      const hf = brFields(chkDataRefAtual().getTime());
      if (hf.y === ano && hf.mo === mes - 1) {
        const dh = (esp.dias || []).find((x) => x.dia === hf.day);
        if (dh && !dh.futuro) pontoHoje = { entrada: dh.entradaHm || null, saida: dh.saidaHm || null, folga: !!dh.folga, situacao: dh.situacao };
      }
      // Ausência que cobre HOJE (pro "Seu dia": "de férias até dd/mm"). Query por
      // funcionarioId (rota pública, fora do tenantStore).
      const hojeMs = new Date(brToUtcMs(hf.y, hf.mo, hf.day, 5, 0));
      const ausHoje = await prisma.pontoAusencia.findFirst({ where: { funcionarioId: func.id, dataInicio: { lte: hojeMs }, dataFim: { gte: hojeMs } }, orderBy: { dataFim: 'desc' } });
      if (ausHoje) {
        pontoHoje = { ...(pontoHoje || { entrada: null, saida: null, folga: true, situacao: 'abonado' }), ausencia: { tipo: ausHoje.tipo, ate: ausHoje.dataFim } };
      }
    } catch (e) { console.error('[colaborador/me ponto]', e?.msg || e); }
    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoPublicaDataUrl || loja?.logoDataUrl || null },
      ano, mes, coletivaPct, coletivo,
      funcionario: { id: func.id, nome: func.nome, funcao: func.funcao || null },
      meu: meu ? rowPublicoBonif(meu) : null,
      totalEquipe: rows.length, // p/ "Xº de N", sem expor a pontuação dos colegas
      ponto,
      pontoHoje,
      conquistas: conquistasOut,
      conquistasResumo: { total: conquistasOut.length, desbloqueadas: desbMap.size },
      coins: saldoMoedas,
      moedas: saldoMoedas,
      mercado: itens.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao || null, emoji: i.emoji, tipo: i.tipo || 'PRODUTO', custo: i.custo, esgotado: i.estoque != null && i.estoque <= 0 })),
      meusResgates: meusResgates.map((r) => ({ id: r.id, itemNome: r.itemNome, itemEmoji: r.itemEmoji, tipoItem: r.tipoItem || 'PRODUTO', dataDesejada: r.dataDesejada || null, custo: r.custo, status: r.status, criadoEm: r.criadoEm })),
      historico,
      colegas: colegasRaw.map((c) => ({ id: c.id, nome: c.apelido || c.nome, funcao: c.funcao || null })),
      reconhecimento: {
        maxMes: cfg.reconhecimentoMaxMes ?? 3, coins: cfg.reconhecimentoCoins ?? 10, enviadosMes,
        recebidos: recRaw.filter((r) => r.paraFuncionarioId === func.id).map((r) => ({ id: r.id, de: recNomes.get(r.deFuncionarioId) || 'Colega', mensagem: r.mensagem, coins: r.coins, status: r.status, criadoEm: r.criadoEm })),
        enviados: recRaw.filter((r) => r.deFuncionarioId === func.id).map((r) => ({ id: r.id, para: recNomes.get(r.paraFuncionarioId) || 'Colega', mensagem: r.mensagem, coins: r.coins, status: r.status, criadoEm: r.criadoEm })),
      },
      ouvidoria: minhasMsgs.map((o) => ({ id: o.id, tipo: o.tipo, mensagem: o.mensagem, status: o.status, resposta: o.resposta || null, criadoEm: o.criadoEm })),
      contribuicoes: minhasContrib.map((c) => ({ id: c.id, descricao: c.descricao, pontos: c.pontos, coins: c.coins, criadoEm: c.criadoEm })),
      config: { tetoAssiduidade: t.tetoA, tetoDesempenho: t.tetoD, tetoColetiva: t.tetoC, bonusTop1: t.b1 },
    });
  } catch (err) { console.error('[colaborador/me]', err); res.status(500).json({ error: 'Erro ao carregar a página.' }); }
});

// ÁREA DO COLABORADOR — solicita um resgate no mercado (debita moedas na hora; a
// liderança aprova/entrega depois). Valida saldo e estoque. Exige sessão OTP.
app.post('/api/public/colaborador/resgatar', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível.' });
    const empresaId = func.empresaId;
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg || !cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const itemId = parseInt(req.body?.itemId, 10);
    const item = await prisma.mercadoItem.findFirst({ where: { id: itemId, empresaId } });
    if (!item || !item.ativo) return res.status(404).json({ error: 'Item indisponível.' });
    if (item.estoque != null && item.estoque <= 0) return res.status(400).json({ error: 'Item esgotado.' });
    const saldo = await saldoMoedasDe(func.id, empresaId);
    if (saldo < item.custo) return res.status(400).json({ error: 'Coins insuficientes para este resgate.' });
    // Folga/reserva: exige uma data desejada (hoje ou futura).
    let dataDesejada = null;
    if (item.tipo === 'FOLGA') {
      const raw = String(req.body?.dataDesejada || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: 'Escolha a data desejada para a folga.' });
      const d = new Date(`${raw}T12:00:00-03:00`);
      if (isNaN(d)) return res.status(400).json({ error: 'Data inválida.' });
      const hojeBrStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
      if (raw < hojeBrStr) return res.status(400).json({ error: 'A data da folga não pode ser no passado.' });
      dataDesejada = d;
    }
    // Cria o pedido, debita as moedas e reserva o estoque.
    const resg = await prisma.mercadoResgate.create({ data: { funcionarioId: func.id, empresaId, itemId: item.id, itemNome: item.nome, itemEmoji: item.emoji, tipoItem: item.tipo || 'PRODUTO', dataDesejada, custo: item.custo, status: 'PENDENTE' } });
    await prisma.bonificacaoMoeda.create({ data: { funcionarioId: func.id, empresaId, pontos: -item.custo, motivo: `Resgate: ${item.nome}`, origem: 'RESGATE', resgateId: resg.id } });
    if (item.estoque != null) await prisma.mercadoItem.update({ where: { id: item.id }, data: { estoque: Math.max(0, item.estoque - 1) } });
    res.status(201).json({ ok: true, saldo: await saldoMoedasDe(func.id, empresaId) });
  } catch (err) { console.error('[colaborador/resgatar]', err); res.status(500).json({ error: 'Erro ao solicitar o resgate.' }); }
});

// ÁREA DO COLABORADOR — envia mensagem à Ouvidoria (opc. anônima). Exige sessão OTP. (Bloco 4)
app.post('/api/public/colaborador/ouvidoria', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível.' });
    const empresaId = func.empresaId;
    const tipo = OUVIDORIA_TIPOS.has(req.body?.tipo) ? req.body.tipo : 'SUGESTAO';
    const mensagem = String(req.body?.mensagem || '').trim().slice(0, 2000);
    if (!mensagem) return res.status(400).json({ error: 'Escreva sua mensagem.' });
    const anonimo = req.body?.anonimo === true;
    await prisma.bonificacaoOuvidoria.create({ data: { empresaId, funcionarioId: anonimo ? null : func.id, anonimo, tipo, mensagem } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error('[colaborador/ouvidoria]', err); res.status(500).json({ error: 'Erro ao enviar a mensagem.' }); }
});

// ÁREA DO COLABORADOR — reconhece um colega (peer kudos). Coins entram só após a
// liderança aprovar. Anti-manipulação: de≠para, colega da mesma loja, teto mensal. Exige OTP. (Bloco 4)
app.post('/api/public/colaborador/reconhecer', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível.' });
    const empresaId = func.empresaId;
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg || !cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const paraId = parseInt(req.body?.paraFuncionarioId, 10);
    if (!Number.isInteger(paraId) || paraId === func.id) return res.status(400).json({ error: 'Escolha um colega (diferente de você).' });
    const colega = await prisma.funcionario.findFirst({ where: { id: paraId, empresaId, status: 'ATIVO' } });
    if (!colega) return res.status(404).json({ error: 'Colega não encontrado nesta loja.' });
    const mensagem = String(req.body?.mensagem || '').trim().slice(0, 500);
    if (!mensagem) return res.status(400).json({ error: 'Escreva um motivo para o reconhecimento.' });
    const now = new Date(); const ano = now.getFullYear(), mes = now.getMonth() + 1;
    const limite = cfg.reconhecimentoMaxMes ?? 3;
    if (limite > 0) {
      const enviados = await prisma.bonificacaoReconhecimento.count({ where: { empresaId, deFuncionarioId: func.id, ano, mes, status: { not: 'REJEITADO' } } });
      if (enviados >= limite) return res.status(400).json({ error: `Você já usou seus ${limite} reconhecimentos deste mês.` });
    }
    await prisma.bonificacaoReconhecimento.create({ data: { empresaId, deFuncionarioId: func.id, paraFuncionarioId: paraId, mensagem, coins: Math.max(0, cfg.reconhecimentoCoins ?? 10), ano, mes } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error('[colaborador/reconhecer]', err); res.status(500).json({ error: 'Erro ao enviar o reconhecimento.' }); }
});

// ===== Checklist — Área do Colaborador (execução; sessão OTP) =====
// Fora do gate: empresaId vem de exigirColaborador; passar explícito em toda query.

// Início do dia de expediente atual (corte 05:00 BR) — instante canônico do dataRef.
function chkDataRefAtual() { return janelaExpedienteAtual().de; }
function chkDiaSemanaExpediente() { const f = brFields(chkDataRefAtual().getTime()); return new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay(); }

// Snapshot dos itens do checklist para congelar na execução.
function chkSnapshot(itens) {
  return itens.map((it) => ({ chave: String(it.id), ordem: it.ordem, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao || null, critico: it.critico, config: it.config || null }));
}

// Atribuição por FUNÇÃO: o checklist guarda os NOMES das funções que o executam (reusa a
// Funcao existente — Aux. de Cozinha, Caixa…) e o colaborador já tem a sua função no
// cadastro. Casa pelo nome normalizado (trim + minúsculas) — a função é uma string livre e
// pode divergir em caixa/espaço do rótulo salvo no checklist. Ponto único de verdade da
// posse, usado tanto pra listar (abaixo) quanto pra abrir/checar execução.
const chkFuncaoNorm = (s) => String(s || '').trim().toLowerCase();
const chkFuncaoAtende = (funcoesChecklist, funcaoColab) => {
  const alvo = chkFuncaoNorm(funcaoColab);
  if (!alvo) return false;
  return Array.isArray(funcoesChecklist) && funcoesChecklist.some((fn) => chkFuncaoNorm(fn) === alvo);
};
// Atribuição dupla: um colaborador atende um checklist se for modo COLABORADOR e ele estiver
// em funcionarioIds, OU modo FUNCAO e a função dele casar. Ponto único de verdade da posse,
// usado pra listar (abaixo) e pra abrir/checar execução (chkAbrir/chkPosseExecucao).
const chkColabAtende = (checklist, func) => {
  if (checklist?.atribuicaoTipo === 'COLABORADOR') {
    return Array.isArray(checklist.funcionarioIds) && checklist.funcionarioIds.includes(func.id);
  }
  return chkFuncaoAtende(checklist?.funcoes, func.funcao);
};

// ===== PÚBLICO — execução do Checklist por link+PIN (sem OTP; ativado por checklist,
// achado pelo publicoToken gerado no Detalhe admin). Fora do gate de tenant (empresaId
// explícito em toda query, vem do checklist resolvido pelo token) — mesmo padrão do
// EtiquetasQuiosque (resolverDispositivo). =====

// Dados do checklist + colaboradores elegíveis (mesma regra de posse do modo OTP —
// chkColabAtende) para o combo de "quem sou eu" na tela pública. NUNCA devolve pin/whatsapp.
app.get('/api/public/checklist/:token/bootstrap', async (req, res) => {
  try {
    const c = await prisma.checklist.findFirst({ where: { publicoToken: String(req.params.token), ativo: true }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    const ativos = await prisma.funcionario.findMany({ where: { empresaId: c.empresaId, status: 'ATIVO' }, select: { id: true, nome: true, apelido: true, funcao: true } });
    const elegiveis = ativos.filter((f) => chkColabAtende(c, f)).map((f) => ({ id: f.id, nome: f.apelido || f.nome, funcao: f.funcao || null }));
    res.json({ checklist: { id: c.id, nome: c.nome, categoria: c.categoria, descricao: c.descricao, tempoEstimadoMin: c.tempoEstimadoMin ?? null }, colaboradores: elegiveis });
  } catch (e) { console.error('[public/checklist/bootstrap]', e); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

// Entra na execução com o colaborador escolhido (id, vindo do bootstrap) + PIN de 4
// dígitos. Rate-limit em memória por funcionarioId (5 falhas → trava 5min) e mensagem
// SEMPRE genérica ("Nome ou PIN inválido") — não vaza quais colaboradores têm PIN
// cadastrado nem se o motivo foi PIN errado, sem posse ou sem PIN. Emite o mesmo token
// de sessão do login OTP (tipo 'colab'), só que de vida curta (6h — dispositivo
// compartilhado, não é o celular do colaborador).
const pinTentativas = new Map(); // funcionarioId -> { fails, lockUntil }
app.post('/api/public/checklist/:token/entrar', async (req, res) => {
  try {
    if (!JWT_SECRET) return res.status(500).json({ error: 'Configuração de sessão ausente.' });
    const c = await prisma.checklist.findFirst({ where: { publicoToken: String(req.params.token), ativo: true }, select: { id: true, empresaId: true, atribuicaoTipo: true, funcoes: true, funcionarioIds: true } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    const fid = parseInt(req.body?.funcionarioId, 10);
    const pin = String(req.body?.pin || '').trim();
    if (!Number.isInteger(fid)) return res.status(401).json({ error: 'Nome ou PIN inválido.' });
    const st = pinTentativas.get(fid) || { fails: 0, lockUntil: 0 };
    if (st.lockUntil > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
    const func = await prisma.funcionario.findFirst({ where: { id: fid, empresaId: c.empresaId, status: 'ATIVO' } });
    const ok = !!func && !!func.pin && /^\d{4}$/.test(pin) && func.pin === pin && chkColabAtende(c, func);
    if (!ok) {
      const fails = st.fails + 1;
      pinTentativas.set(fid, { fails, lockUntil: fails >= 5 ? Date.now() + 5 * 60000 : 0 });
      return res.status(401).json({ error: 'Nome ou PIN inválido.' });
    }
    pinTentativas.delete(fid);
    const token = jwt.sign({ fid: func.id, eid: c.empresaId, tipo: 'colab' }, JWT_SECRET, { expiresIn: '6h' });
    res.json({ token, checklistId: c.id });
  } catch (e) { console.error('[public/checklist/entrar]', e); res.status(500).json({ error: 'Erro ao entrar.' }); }
});

app.get('/api/public/colaborador/checklists', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível. Fale com a liderança.' });

    // Filtro fino em JS (poucos checklists por loja): modo FUNCAO casa o nome normalizado
    // (string livre), modo COLABORADOR casa o id — ambos via chkColabAtende. Sem early-return
    // por função: quem não tem função ainda pode ter checklists atribuídos por colaborador.
    const todos = await prisma.checklist.findMany({ where: { empresaId: sess.empresaId, ativo: true }, include: { _count: { select: { itens: true } } } });
    const checklists = todos.filter((c) => chkColabAtende(c, func));
    const dataRef = chkDataRefAtual();
    const dow = chkDiaSemanaExpediente();
    // Execuções do dia (status + quantas respostas já foram dadas, p/ a barra de progresso).
    const execs = await prisma.checklistExecucao.findMany({ where: { empresaId: sess.empresaId, dataRef }, select: { checklistId: true, status: true, emAlerta: true, _count: { select: { respostas: true } } } });
    const execMap = new Map(execs.map((e) => [e.checklistId, e]));
    const mapear = (c) => {
      const ex = execMap.get(c.id);
      const total = c._count.itens;
      const feitos = Math.min(ex?._count?.respostas || 0, total);
      const pct = ex?.status === 'CONCLUIDA' ? 100 : (total ? Math.round((feitos / total) * 100) : 0);
      const hl = (c.recorrenciaConfig && typeof c.recorrenciaConfig.horarioLimite === 'string') ? c.recorrenciaConfig.horarioLimite : null;
      return { id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, itens: total, recorrenciaTipo: c.recorrenciaTipo, tempoEstimadoMin: c.tempoEstimadoMin ?? null, horarioLimite: hl, status: ex?.status || null, emAlerta: ex?.emAlerta || false, progresso: { feitos, total, pct } };
    };
    const hoje = [], disponiveis = [];
    for (const c of checklists) {
      if (venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) hoje.push(mapear(c));
      else if (c.recorrenciaTipo === 'AVULSO') disponiveis.push(mapear(c));
    }
    res.json({ hoje, disponiveis });
  } catch (err) { console.error('[colab/checklists]', err); res.status(500).json({ error: 'Erro ao carregar checklists.' }); }
});

// Verifica posse (checklist da minha função) e devolve a execução do dia com snapshot.
async function chkAbrirExecucao(sess, checklistId) {
  const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
  if (!func || func.status !== 'ATIVO') throw { http: 401, msg: 'Acesso indisponível.' };
  const c = await prisma.checklist.findFirst({ where: { id: checklistId, empresaId: sess.empresaId, ativo: true }, include: { itens: { orderBy: { ordem: 'asc' } } } });
  if (!c) throw { http: 404, msg: 'Checklist não encontrado.' };
  if (!chkColabAtende(c, func)) throw { http: 403, msg: 'Este checklist não é atribuído a você.' };
  const dataRef = chkDataRefAtual();
  // empresaId explícito mesmo com checklistId já validado acima — não depender só do pai.
  let exec = await prisma.checklistExecucao.findFirst({ where: { checklistId: c.id, dataRef, empresaId: sess.empresaId }, include: { respostas: true, fotos: true } });
  if (!exec) {
    try {
      exec = await prisma.checklistExecucao.create({
        data: { empresaId: sess.empresaId, checklistId: c.id, dataRef, funcionarioId: func.id, itensSnapshotJson: chkSnapshot(c.itens) },
        include: { respostas: true, fotos: true },
      });
    } catch (e) {
      // @@unique([checklistId, dataRef]): dois "iniciar" simultâneos do mesmo checklist/dia
      // (ex.: dois colaboradores da mesma função clicando ao mesmo tempo) fazem os dois
      // findFirst→null e os dois create; o segundo esbarra no unique — relê a execução
      // que a outra requisição acabou de criar e retoma, em vez de 500 no perdedor.
      if (e?.code === 'P2002') {
        exec = await prisma.checklistExecucao.findFirst({ where: { checklistId: c.id, dataRef, empresaId: sess.empresaId }, include: { respostas: true, fotos: true } });
        if (!exec) throw e; // não deveria acontecer — não escondemos o erro se ainda assim sumir
      } else {
        throw e;
      }
    }
  }
  return { exec, checklist: c };
}

app.post('/api/public/colaborador/checklists/:id/iniciar', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const { exec, checklist } = await chkAbrirExecucao(sess, parseInt(req.params.id, 10));
    res.status(201).json({ execucao: chkExecJson(exec, checklist) });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/iniciar]', e); res.status(500).json({ error: 'Erro ao iniciar.' }); }
});

// `checklist` é opcional (só o `iniciar` e o GET de retomada o passam) — carrega o
// tempoEstimadoMin pro cabeçalho da execução no colaborador.
function chkExecJson(exec, checklist) {
  const rmap = {}; for (const r of exec.respostas || []) rmap[r.itemChave] = { valor: r.valorJson, conforme: r.conforme, observacao: r.observacao };
  const fmap = {}; for (const f of exec.fotos || []) fmap[f.itemChave] = { id: f.id };
  return { id: exec.id, checklistId: exec.checklistId, status: exec.status, emAlerta: exec.emAlerta, tempoEstimadoMin: checklist?.tempoEstimadoMin ?? null, itens: exec.itensSnapshotJson, respostas: rmap, fotos: fmap };
}

// Posse de uma execução JÁ EXISTENTE — não basta filtrar por empresaId: dentro da MESMA loja,
// um colaborador não pode ler/responder/concluir a execução de um checklist que não é dele só
// chutando o id (inteiros sequenciais, adivinháveis). A execução é prova, então as 3 rotas de
// execução (GET, PUT resposta, POST concluir) passam por aqui em vez de um findFirst bare por
// empresaId. Mesma regra de atribuição de chkAbrirExecucao (chkColabAtende — função OU
// colaborador), pra não divergir entre "abrir" e "continuar".
async function chkPosseExecucao(sess, execucaoId, { comRespostas = false } = {}) {
  const exec = await prisma.checklistExecucao.findFirst({
    where: { id: execucaoId, empresaId: sess.empresaId },
    include: comRespostas ? { respostas: true, fotos: true } : undefined,
  });
  if (!exec) throw { http: 404, msg: 'Execução não encontrada.' };
  const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
  if (!func || func.status !== 'ATIVO') throw { http: 401, msg: 'Acesso indisponível.' };
  const checklist = await prisma.checklist.findFirst({ where: { id: exec.checklistId, empresaId: sess.empresaId } });
  if (!checklist) throw { http: 404, msg: 'Checklist não encontrado.' };
  if (!chkColabAtende(checklist, func)) throw { http: 403, msg: 'Esta execução não é atribuída a você.' };
  return exec;
}

app.get('/api/public/colaborador/execucoes/:id', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await chkPosseExecucao(sess, parseInt(req.params.id, 10), { comRespostas: true });
    const checklist = await prisma.checklist.findFirst({ where: { id: exec.checklistId, empresaId: sess.empresaId }, select: { tempoEstimadoMin: true } });
    res.json({ execucao: chkExecJson(exec, checklist) });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/execucao GET]', e); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.put('/api/public/colaborador/execucoes/:id/resposta', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await chkPosseExecucao(sess, parseInt(req.params.id, 10));
    if (exec.status === 'CONCLUIDA') return res.status(409).json({ error: 'Execução já concluída.' });
    const itemChave = String(req.body?.itemChave || '');
    const item = (exec.itensSnapshotJson || []).find((it) => it.chave === itemChave);
    if (!item) return res.status(400).json({ error: 'Item inválido.' });
    // Conformidade recalculada no servidor — o cliente não decide se passou.
    const { conforme } = avaliarResposta({ tipo: item.tipo, config: item.config, valor: req.body?.valor });
    const observacao = req.body?.observacao == null ? null : String(req.body.observacao).slice(0, 500);
    // empresaId explícito mesmo com execucaoId já validado acima — não depender só do pai.
    const existente = await prisma.checklistResposta.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId } });
    const dados = { tipo: item.tipo, valorJson: req.body?.valor ?? null, conforme, observacao };
    if (existente) {
      // updateMany com empresaId no where (em vez de update por PK) para o isolamento
      // não depender só do findFirst escopado acima, mesmo que essa query seja refatorada depois.
      await prisma.checklistResposta.updateMany({ where: { id: existente.id, empresaId: sess.empresaId }, data: dados });
    } else {
      await prisma.checklistResposta.create({ data: { ...dados, empresaId: sess.empresaId, execucaoId: exec.id, itemChave } });
    }
    res.json({ ok: true, itemChave, conforme });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/resposta]', e); res.status(500).json({ error: 'Erro ao salvar resposta.' }); }
});

// Sobe/atualiza a foto de um item FOTO (uma por item por execução). dataUrl já vem
// comprimido do cliente; o servidor ainda valida tamanho e formato.
app.put('/api/public/colaborador/execucoes/:id/foto', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await chkPosseExecucao(sess, parseInt(req.params.id, 10));
    if (exec.status === 'CONCLUIDA') return res.status(409).json({ error: 'Execução já concluída.' });
    const itemChave = String(req.body?.itemChave || '');
    const item = (exec.itensSnapshotJson || []).find((it) => it.chave === itemChave);
    if (!item || item.tipo !== 'FOTO') return res.status(400).json({ error: 'Item de foto inválido.' });
    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return res.status(400).json({ error: 'Foto inválida.' });
    if (dataUrl.length > 4_500_000) return res.status(413).json({ error: 'Foto muito grande. Tente novamente.' });
    const tamanhoBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    const largura = parseInt(req.body?.largura, 10) || null;
    const altura = parseInt(req.body?.altura, 10) || null;

    const fExist = await prisma.checklistFoto.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId } });
    if (fExist) await prisma.checklistFoto.updateMany({ where: { id: fExist.id, empresaId: sess.empresaId }, data: { dataUrl, tamanhoBytes, largura, altura } });
    else await prisma.checklistFoto.create({ data: { empresaId: sess.empresaId, execucaoId: exec.id, itemChave, dataUrl, tamanhoBytes, largura, altura } });

    // marca a resposta do item (temFoto); conformidade FOTO é sempre null.
    const rExist = await prisma.checklistResposta.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId } });
    const dados = { tipo: 'FOTO', valorJson: { temFoto: true }, conforme: null };
    if (rExist) await prisma.checklistResposta.updateMany({ where: { id: rExist.id, empresaId: sess.empresaId }, data: dados });
    else await prisma.checklistResposta.create({ data: { ...dados, empresaId: sess.empresaId, execucaoId: exec.id, itemChave } });

    const foto = await prisma.checklistFoto.findFirst({ where: { execucaoId: exec.id, itemChave, empresaId: sess.empresaId }, select: { id: true } });
    res.json({ ok: true, itemChave, fotoId: foto?.id });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/foto PUT]', e); res.status(500).json({ error: 'Erro ao salvar a foto.' }); }
});

// Bytes da foto sob demanda (o operador vê a própria; posse por função garante isolamento).
app.get('/api/public/colaborador/fotos/:id', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const foto = await prisma.checklistFoto.findFirst({ where: { id: parseInt(req.params.id, 10), empresaId: sess.empresaId } });
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });
    await chkPosseExecucao(sess, foto.execucaoId); // 403 se não for da função
    res.json({ dataUrl: foto.dataUrl });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/fotos GET]', e); res.status(500).json({ error: 'Erro ao carregar a foto.' }); }
});

// Texto legível de um erro pra gravar no histórico de notificações e no console.
// O zapi lança um OBJETO (`{http, msg, causa, data}`), não um Error: `e.message` é undefined
// e o `String(e)` de antes gravava literalmente "[object Object]" no log, escondendo o motivo
// real da falha (WhatsApp não configurado? número inválido? 401 da UAZAPI?).
function textoErro(e) {
  if (!e) return 'Erro desconhecido';
  if (typeof e === 'string') return e;
  const base = e.msg || e.message || '';
  const extra = e.causa || (e.data && typeof e.data !== 'object' ? String(e.data) : '');
  const txt = [base, extra].filter(Boolean).join(' — ');
  if (txt) return txt;
  try { return JSON.stringify(e); } catch { return String(e); }
}

// Instante (ms) do horário-limite "HH:MM" no dia de EXPEDIENTE [y,mo,day]. Horário antes do
// corte (05:00) pertence à madrugada do dia seguinte — ver offsetDiaDoHorario. Null se inválido.
function chkDeadlineMs(y, mo, day, horarioLimite) {
  const [h, m] = String(horarioLimite || '').split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return null;
  return brToUtcMs(y, mo, day + offsetDiaDoHorario(horarioLimite), h, m || 0);
}

// Dispara o alerta imediato de um checklist concluído com item crítico fora do padrão.
// Best-effort: chamado sem await no concluir, com try/catch total — uma falha (zapi off,
// número ruim, DB) NUNCA toca a resposta do concluir. empresaId explícito (fora do tenantStore).
async function dispararAlertaImediato(empresaId, execucaoId) {
  try {
    const cfg = await prisma.checklistNotificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg?.alertaImediatoAtivo) return;
    const exec = await prisma.checklistExecucao.findFirst({ where: { id: execucaoId, empresaId }, include: { respostas: true, checklist: { select: { nome: true } } } });
    if (!exec) return;
    const rmap = {}; for (const r of exec.respostas) rmap[r.itemChave] = { conforme: r.conforme };
    const itensForaDoPadrao = itensCriticosNaoConformes(exec.itensSnapshotJson, rmap);
    const func = await prisma.funcionario.findFirst({ where: { id: exec.funcionarioId, empresaId }, select: { nome: true, apelido: true } });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });
    const quando = new Date(exec.concluidaEm || Date.now()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const msg = montarMensagemAlerta({ lojaNome: loja?.nome || 'Loja', checklistNome: exec.checklist?.nome || 'Checklist', funcionarioNome: func ? (func.apelido || func.nome) : '—', quando, itensForaDoPadrao });

    // tipo:'IMEDIATO' — um destinatário cadastrado só-de-atraso (tipo ATRASO) não deve
    // receber o alerta imediato (review da Task 2).
    const dests = await prisma.checklistDestinatario.findMany({ where: { empresaId, tipo: 'IMEDIATO', ativo: true } });
    if (!dests.length) return;
    const podeEnviar = zapiConfigurado();
    for (const d of dests) {
      const destino = foneParaEnvio(foneCanonico(d.whatsapp));
      let status = 'ENVIADO', erro = null;
      if (!podeEnviar) { status = 'FALHOU'; erro = 'WhatsApp não configurado'; }
      else { try { await zapiEnviarTexto(destino, msg); } catch (e) { status = 'FALHOU'; erro = textoErro(e).slice(0, 300); } }
      await prisma.checklistNotificacaoLog.create({ data: { empresaId, regra: 'ALERTA_IMEDIATO', canal: 'WHATSAPP', destino, destinatarioNome: d.nome, execucaoId: exec.id, conteudo: msg, status, erro } });
    }
  } catch (e) { console.error('[dispararAlertaImediato]', textoErro(e)); }
}

// Dispara o LEMBRETE de atraso de uma loja: checklists que vencem hoje, ainda sem execução
// concluída, cujo horarioLimite está dentro da janela [limite - minutosAntes, limite]. Roda
// pelo agendador (setInterval), FORA do tenantStore — igual ao dispararAlertaImediato, todo
// empresaId é explícito (where E data) porque a extension do Prisma só injeta empresaId
// dentro do AsyncLocalStorage de uma request; aqui não existe request nenhuma.
async function dispararLembretesLoja(empresaId) {
  try {
    const cfg = await prisma.checklistNotificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg?.lembreteAtivo) return;
    // Só quem está marcado tipo:'ATRASO' recebe o lembrete (o imediato usa tipo:'IMEDIATO').
    const destinatarios = await prisma.checklistDestinatario.findMany({ where: { empresaId, tipo: 'ATRASO', ativo: true } });
    if (!destinatarios.length || !zapiConfigurado()) return;

    // dataRef = início do dia de EXPEDIENTE (corte 05:00 BR) — mesma referência usada pela
    // Área do Colaborador e pelo painel do gestor. dow (dia da semana) sai dos mesmos campos
    // de parede BR, igual ao /api/checklist/painel (linha ~7878).
    const dataRef = janelaExpedienteAtual().de;
    const f = brFields(dataRef.getTime());
    const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
    const agoraMs = Date.now();

    const checklists = await prisma.checklist.findMany({ where: { empresaId, ativo: true } });
    for (const c of checklists) {
      // Por-checklist: uma falha aqui (query, cálculo) não deve impedir os demais checklists
      // da mesma loja de serem avaliados neste ciclo.
      try {
        if (!venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) continue;
        const horarioLimite = c.recorrenciaConfig?.horarioLimite;
        if (!horarioLimite || typeof horarioLimite !== 'string') continue; // sem horário-limite, não há "atraso" a lembrar
        // ms do horário-limite de HOJE (dia de expediente) em BR→UTC — chkDeadlineMs usa
        // brToUtcMs (conta BR_OFFSET_MIN certa; NUNCA `new Date(y,mo,day,h,m)`, que pega o fuso
        // do VPS/UTC) e joga o horário ANTES das 05:00 pra madrugada seguinte — senão o limite
        // caía antes do expediente começar e o lembrete disparava logo no início do dia.
        const limiteMs = chkDeadlineMs(f.y, f.mo, f.day, horarioLimite);
        if (limiteMs === null) continue;
        if (!atrasado(agoraMs, limiteMs, c.recorrenciaConfig?.toleranciaMin)) continue;

        const exec = await prisma.checklistExecucao.findFirst({ where: { empresaId, checklistId: c.id, dataRef } });
        if (exec?.status === 'CONCLUIDA') continue;

        // Dedup: cria o marcador ANTES de enviar. Se já existe (P2002, unique
        // [empresaId,checklistId,dataRef]) é porque já lembramos hoje — pula.
        try {
          await prisma.checklistLembreteEnviado.create({ data: { empresaId, checklistId: c.id, dataRef } });
        } catch (e) {
          if (e?.code === 'P2002') continue;
          throw e;
        }

        // Responsável: quem já iniciou (se em andamento) senão os atribuídos (FUNCAO/COLABORADOR).
        let responsavel = '';
        if (exec) {
          const func = await prisma.funcionario.findFirst({ where: { id: exec.funcionarioId, empresaId }, select: { nome: true, apelido: true } });
          responsavel = func ? (func.apelido || func.nome) : '';
        } else if (c.atribuicaoTipo === 'COLABORADOR') {
          const ids = Array.isArray(c.funcionarioIds) ? c.funcionarioIds : [];
          if (ids.length) {
            const funcs = await prisma.funcionario.findMany({ where: { id: { in: ids }, empresaId }, select: { nome: true, apelido: true } });
            responsavel = funcs.map((fx) => fx.apelido || fx.nome).join(', ');
          }
        } else {
          responsavel = Array.isArray(c.funcoes) ? c.funcoes.join(', ') : '';
        }

        const msg = montarMensagemLembrete(cfg.lembreteTemplate, { checklist: c.nome, horario: horarioLimite, responsavel });

        for (const d of destinatarios) {
          const destino = foneParaEnvio(foneCanonico(d.whatsapp));
          let status = 'ENVIADO', erro = null;
          try { await zapiEnviarTexto(destino, msg); } catch (e) { status = 'FALHOU'; erro = textoErro(e).slice(0, 300); }
          await prisma.checklistNotificacaoLog.create({ data: { empresaId, regra: 'LEMBRETE_ATRASO', canal: 'WHATSAPP', destino, destinatarioNome: d.nome, conteudo: msg, status, erro } });
        }
      } catch (e) { console.error('[dispararLembretesLoja checklist]', empresaId, c?.id, textoErro(e)); }
    }
  } catch (e) { console.error('[dispararLembretesLoja]', empresaId, textoErro(e)); }
}

// Varre TODAS as lojas com lembrete ativo. Fora do tenantStore (sem injeção automática de
// empresaId) — cada loja isolada em try/catch: uma loja quebrada nunca trava as demais.
async function varrerLembretes() {
  const configs = await prisma.checklistNotificacaoConfig.findMany({ where: { lembreteAtivo: true } });
  for (const cfg of configs) {
    try { await dispararLembretesLoja(cfg.empresaId); }
    catch (e) { console.error('[varrerLembretes]', cfg.empresaId, e?.message || e); }
  }
}

// Agendador do lembrete de atraso: 1 ciclo a cada 5min. Não roda no boot (o 1º ciclo só
// chega em 5min) pra não atrasar o start do server.
function iniciarAgendadorLembretes() {
  setInterval(() => { varrerLembretes().catch((e) => console.error('[lembretes]', e)); }, 5 * 60 * 1000);
}

// Dispara as mensagens VIP que vencem AGORA numa loja. FORA do tenantStore (empresaId
// explícito). Dedup: cria GrupoVipDisparo (unique) ANTES de enviar — P2002 ⇒ já foi hoje.
async function dispararGrupoVipLoja(empresaId, cfg) {
  try {
    if (!cfg.grupoJid || !cfg.instanceToken) return; // sem master switch: controla-se por mensagem (ativa) + ter grupo/instância
    const agoraMs = Date.now();
    const f = brFields(agoraMs);
    const dataRef = new Date(brToUtcMs(f.y, f.mo, f.day, 0, 0));
    const mensagens = await prisma.grupoVipMensagem.findMany({ where: { empresaId, ativa: true } });
    const jaHoje = await prisma.grupoVipDisparo.findMany({ where: { empresaId, dataRef }, select: { mensagemId: true } });
    const jaSet = new Set(jaHoje.map((d) => d.mensagemId));
    const aDisparar = mensagensParaDisparar(agoraMs, mensagens, jaSet);
    for (const m of aDisparar) {
      // marcador de dedup ANTES de enviar
      try { await prisma.grupoVipDisparo.create({ data: { empresaId, mensagemId: m.id, dataRef, status: 'ENVIADO' } }); }
      catch (e) { if (e?.code === 'P2002') continue; throw e; }
      let cupomCode = null, erroCupom = null;
      try {
        if (m.cupomModo === 'FIXO' && m.cupomCodigoFixo) cupomCode = m.cupomCodigoFixo;
        else if (m.cupomModo === 'NOVO_POR_DISPARO') {
          const codigo = gerarCodigoCupom();
          const payload = montarPayloadCupom(m, agoraMs, codigo);
          if (payload) {
            const r = await criarCupomCW(await hubClienteIdGrupoVip(cfg), payload);
            if (r?.conectado === false) erroCupom = 'Loja sem Cardápio Web vinculado';
            else cupomCode = r?.coupon?.code || codigo;
          }
        }
      } catch (e) { erroCupom = textoErro(e).slice(0, 200); }
      const texto = String(m.texto).split('{cupom}').join(cupomCode || '');
      let status = 'ENVIADO', erroEnvio = null;
      try {
        if (m.imagem) await zapiEnviarImagem(cfg.grupoJid, m.imagem, texto, cfg.instanceToken); // foto com o texto de legenda
        else await zapiEnviarTexto(cfg.grupoJid, texto, cfg.instanceToken);
      }
      catch (e) { status = 'FALHOU'; erroEnvio = textoErro(e).slice(0, 200); }
      const erro = [erroEnvio, erroCupom].filter(Boolean).join(' · ') || null;
      try { await prisma.grupoVipDisparo.updateMany({ where: { empresaId, mensagemId: m.id, dataRef }, data: { status, erro, cupomCode, conteudo: texto.slice(0, 1000) } }); }
      catch (e) { console.error('[dispararGrupoVipLoja updateMany]', empresaId, m.id, textoErro(e)); }
    }
  } catch (e) { console.error('[dispararGrupoVipLoja]', empresaId, textoErro(e)); }
}

async function varrerGrupoVip() {
  const cfgs = await prisma.grupoVipConfig.findMany({ where: { grupoJid: { not: null }, instanceToken: { not: null } } });
  for (const cfg of cfgs) {
    try { await dispararGrupoVipLoja(cfg.empresaId, cfg); }
    catch (e) { console.error('[varrerGrupoVip]', cfg.empresaId, e?.message || e); }
  }
}

function iniciarAgendadorGrupoVip() {
  setInterval(() => { varrerGrupoVip().catch((e) => console.error('[grupo-vip]', e)); }, 60 * 1000);
}

app.post('/api/public/colaborador/execucoes/:id/concluir', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await chkPosseExecucao(sess, parseInt(req.params.id, 10), { comRespostas: true });
    // Foto crítica é obrigatória: item FOTO crítico sem foto bloqueia concluir.
    const chavesComFoto = new Set((await prisma.checklistFoto.findMany({ where: { execucaoId: exec.id, empresaId: sess.empresaId }, select: { itemChave: true } })).map((f) => f.itemChave));
    const faltando = fotosCriticasFaltando(exec.itensSnapshotJson, chavesComFoto);
    if (faltando.length) return res.status(400).json({ error: `Falta a foto obrigatória de: ${faltando.join(', ')}` });
    const rmap = {}; for (const r of exec.respostas) rmap[r.itemChave] = { conforme: r.conforme };
    const emAlerta = execucaoEmAlerta(exec.itensSnapshotJson, rmap);
    // Guarda a transição ANTES do updateMany: idempotência do alerta depende de saber se
    // esta execução JÁ estava CONCLUIDA (reenvio de request, dupla submissão etc).
    const eraAndamento = exec.status !== 'CONCLUIDA';
    // updateMany com empresaId no where: exec já veio validado com empresaId neste handler,
    // mas o filtro fica explícito aqui também para o isolamento sobreviver a um refactor futuro.
    await prisma.checklistExecucao.updateMany({ where: { id: exec.id, empresaId: sess.empresaId }, data: { status: 'CONCLUIDA', concluidaEm: new Date(), emAlerta } });
    // Alerta só na TRANSIÇÃO para CONCLUIDA e quando em alerta. Fire-and-forget: não segura a
    // resposta do concluir nem propaga falha (dispararAlertaImediato é best-effort).
    if (eraAndamento && emAlerta) dispararAlertaImediato(sess.empresaId, exec.id);
    res.json({ ok: true, status: 'CONCLUIDA', emAlerta });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/concluir]', e); res.status(500).json({ error: 'Erro ao concluir.' }); }
});

app.get('/api/public/colaborador/checklists/historico', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const execs = await prisma.checklistExecucao.findMany({
      where: { empresaId: sess.empresaId, funcionarioId: sess.funcionarioId, status: 'CONCLUIDA' },
      orderBy: { concluidaEm: 'desc' }, take: 50, include: { checklist: { select: { nome: true, categoria: true } } },
    });
    res.json({ historico: execs.map((e) => ({ id: e.id, nome: e.checklist?.nome, categoria: e.checklist?.categoria, concluidaEm: e.concluidaEm, emAlerta: e.emAlerta })) });
  } catch (err) { console.error('[colab/historico]', err); res.status(500).json({ error: 'Erro ao carregar histórico.' }); }
});

// ===================== Dep. Pessoal: Banco de Talentos (portado do H360) =====================
// ============================================================================
// ============================================================================
// Dep. Pessoal › Banco de Talentos / Seleção
// Arquitetura: Candidato = perfil permanente; Candidatura = participação numa vaga
// (status/score/histórico/avaliações/entrevistas/contatos são POR candidatura).
// ============================================================================
const RH_STATUS = ['NOVO', 'TRIAGEM', 'PRE_SELECIONADO', 'CONTATO_REALIZADO', 'ENTREVISTA_AGENDADA', 'TESTE_PRATICO', 'APROVADO', 'BANCO_TALENTOS', 'REPROVADO', 'SEM_RETORNO'];
const RH_ORIGENS = ['MANUAL', 'PUBLICO', 'INSTAGRAM', 'WHATSAPP', 'INDICACAO', 'QRCODE', 'SITE', 'ANUNCIO', 'LOJA', 'OUTRO'];
const RH_VINCULOS = ['CLT', 'FREELANCER', 'DIARISTA', 'ESTAGIO', 'A_COMBINAR'];
const RH_CONTATO_TIPO = ['WHATSAPP', 'LIGACAO', 'EMAIL', 'PRESENCIAL'];
const RH_CONTATO_RES = ['SEM_RESPOSTA', 'INTERESSADO', 'SEM_INTERESSE', 'ENTREVISTA_MARCADA', 'RETORNAR'];
const RH_ENTREVISTA_TIPO = ['ONLINE', 'PRESENCIAL', 'TESTE'];
const RH_ENTREVISTA_STATUS = ['AGENDADA', 'REALIZADA', 'CANCELADA', 'NAO_COMPARECEU'];
const RH_VAGA_STATUS = ['ABERTA', 'PAUSADA', 'ENCERRADA'];
const RH_PESOS_PADRAO = { disponibilidade: 30, experiencia: 25, deslocamento: 15, triagem: 15, gestor: 15 };
const SCORE_VERSAO = '1.0';

const usuarioAtual = () => tenantStore.getStore()?.user?.nome ?? null;
const rhData = (v) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : null; };
const rhStr = (v, max = 255) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const rhArr = (v, perm) => Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter((x) => (perm ? perm.includes(x) : x)))] : [];
const rhNum = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
// Telefone só dígitos; chave de dedup remove o +55 (por empresa).
const rhTelefone = (v) => String(v ?? '').replace(/\D/g, '');
const rhNormTelefone = (v) => { const d = rhTelefone(v); return /^55\d{10,11}$/.test(d) ? d.slice(2) : d; };
const rhEmailNorm = (v) => { const s = String(v ?? '').trim().toLowerCase(); return s || null; };

// Score de compatibilidade candidato×vaga (0-100), por regras transparentes + auditoria.
// Dados ausentes NÃO inflam o candidato: dimensão sem dado do candidato = 0 (não 0,5).
function calcularScore(cand, vaga, avaliacaoGestor) {
  const pesos = { ...RH_PESOS_PADRAO, ...(vaga?.pesos && typeof vaga.pesos === 'object' ? vaga.pesos : {}) };
  const disp = cand?.disponibilidade && typeof cand.disponibilidade === 'object' ? cand.disponibilidade : {};
  const inter = (a, b) => (Array.isArray(a) ? a : []).filter((x) => (Array.isArray(b) ? b : []).includes(x));
  const partes = [];

  const vTur = Array.isArray(vaga?.turno) ? vaga.turno : []; const vDia = Array.isArray(vaga?.diasTrabalho) ? vaga.diasTrabalho : [];
  const cTur = Array.isArray(disp.turnos) ? disp.turnos : []; const cDia = Array.isArray(disp.dias) ? disp.dias : [];
  let rDisp;
  if (!vTur.length && !vDia.length) rDisp = 1;                 // vaga não exige disponibilidade específica
  else if (!cTur.length && !cDia.length) rDisp = 0;            // candidato não informou → não infla
  else { const cobT = vTur.length ? inter(vTur, cTur).length / vTur.length : 1; const cobD = vDia.length ? inter(vDia, cDia).length / vDia.length : 1; rDisp = (cobT + cobD) / 2; }
  partes.push({ chave: 'disponibilidade', label: 'Disponibilidade compatível', ratio: rDisp, peso: pesos.disponibilidade });

  const ess = Array.isArray(vaga?.atividadesEssenciais) ? vaga.atividadesEssenciais : [];
  const exp = Array.isArray(cand?.experienciasRapidas) ? cand.experienciasRapidas : [];
  const rExp = !ess.length ? 1 : inter(ess, exp).length / ess.length; // sem essenciais na vaga = neutro alto; senão fração real (0 se nada)
  partes.push({ chave: 'experiencia', label: 'Experiência nas atividades', ratio: rExp, peso: pesos.experiencia });

  let rDesl;
  if (disp.transporteProprio) rDesl = 1;
  else if (disp.tempoDeslocamentoMin != null && disp.tempoDeslocamentoMin !== '') { const t = Number(disp.tempoDeslocamentoMin); rDesl = t <= 20 ? 1 : t <= 40 ? 0.75 : t <= 60 ? 0.5 : 0.3; }
  else rDesl = 0.3; // desconhecido → baixo (não infla)
  partes.push({ chave: 'deslocamento', label: 'Deslocamento compatível', ratio: rDesl, peso: pesos.deslocamento });

  const perguntas = Array.isArray(vaga?.perguntas) ? vaga.perguntas : [];
  const resp = cand?.respostasTriagem && typeof cand.respostasTriagem === 'object' ? cand.respostasTriagem : {};
  const comIdeal = perguntas.filter((p) => p && p.respostaIdeal != null && p.respostaIdeal !== '');
  let rTri;
  if (!comIdeal.length) rTri = 1; // vaga sem perguntas → dimensão não discrimina
  else { let ok = 0; for (const p of comIdeal) { const r = resp[p.id]; if (r != null && r !== '' && String(r).toLowerCase() === String(p.respostaIdeal).toLowerCase()) ok++; } rTri = ok / comIdeal.length; }
  partes.push({ chave: 'triagem', label: 'Respostas da triagem', ratio: rTri, peso: pesos.triagem });

  const rGestor = avaliacaoGestor != null ? Math.max(0, Math.min(100, avaliacaoGestor)) / 100 : 0;
  partes.push({ chave: 'gestor', label: 'Avaliação do gestor', ratio: rGestor, peso: pesos.gestor });

  const soma = partes.reduce((s, p) => s + (Number(p.peso) || 0), 0) || 100;
  let score = 0;
  const breakdown = partes.map((p) => { const max = Math.round(((Number(p.peso) || 0) / soma) * 100); const pontos = Math.round(Math.max(0, Math.min(1, p.ratio)) * max); score += pontos; return { chave: p.chave, label: p.label, pontos, max }; });
  score = Math.max(0, Math.min(100, score));

  // Qualidade dos dados (independente do score): % de campos-chave preenchidos.
  const checks = [
    (cTur.length || cDia.length) > 0,
    exp.length > 0,
    !!(disp.transporteProprio || (disp.tempoDeslocamentoMin != null && disp.tempoDeslocamentoMin !== '')),
    Array.isArray(cand?.funcoesInteresse) && cand.funcoesInteresse.length > 0,
    avaliacaoGestor != null,
  ];
  const preenchimento = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const qualidade = (avaliacaoGestor == null || preenchimento < 40) ? 'ESTIMADO' : (preenchimento >= 75 ? 'COMPLETO' : 'PARCIAL');
  return { score, breakdown, pesos, preenchimento, qualidade };
}

function scoreHumano(av) {
  const pos = ['comunicacao', 'organizacao', 'postura', 'tecnico', 'compatibilidade', 'disponibilidade', 'interesse'];
  const vals = [];
  for (const k of pos) if (av[k] != null) vals.push(Math.max(1, Math.min(5, Number(av[k]))));
  if (av.treinamento != null) vals.push(6 - Math.max(1, Math.min(5, Number(av.treinamento))));
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length / 5) * 100);
}

// Calcula e persiste o score de uma candidatura + registra na trilha (ScoreHistorico).
async function registrarScoreCandidatura(candidaturaId, motivo) {
  const cx = await prisma.candidatura.findUnique({ where: { id: candidaturaId }, include: { candidato: true, vaga: true } });
  if (!cx) return null;
  const r = calcularScore(cx.candidato, cx.vaga, cx.avaliacaoGestor);
  await prisma.candidatura.update({ where: { id: candidaturaId }, data: { score: r.score, scoreBreakdown: r.breakdown, scorePesos: r.pesos, scoreVersao: SCORE_VERSAO, scoreMotivo: motivo, scorePreenchimento: r.preenchimento, scoreQualidade: r.qualidade, scoreCalculadoEm: new Date() } });
  await prisma.scoreHistorico.create({ data: { candidaturaId, score: r.score, breakdown: r.breakdown, pesos: r.pesos, versao: SCORE_VERSAO, motivo, preenchimento: r.preenchimento, qualidade: r.qualidade } });
  return r;
}
async function recalcularCandidaturasDoCandidato(candidatoId, motivo) {
  const cxs = await prisma.candidatura.findMany({ where: { candidatoId }, select: { id: true } });
  for (const c of cxs) await registrarScoreCandidatura(c.id, motivo);
}
async function recalcularCandidaturasDaVaga(vagaId, motivo) {
  const cxs = await prisma.candidatura.findMany({ where: { vagaId }, select: { id: true } });
  for (const c of cxs) await registrarScoreCandidatura(c.id, motivo);
}

// ---- Construtor de formulário (permanente e por vaga) ----
const FORM_TIPOS = ['sim_nao', 'unica', 'multipla', 'numero', 'escala', 'texto', 'texto_longo'];
const FORM_PAPEIS = ['informativa', 'eliminatoria', 'prioridade'];
const FORM_CAMPOS = ['email', 'endereco', 'cidade', 'bairro', 'transporte', 'tempoDeslocamento', 'disponivelEm', 'funcoes', 'experiencias', 'historico', 'ultimosEmpregos', 'pretensao', 'sobre', 'disponibilidade'];
// Rótulos de duração de vínculo → aproximação em meses (análise de permanência).
const RH_DURACOES = { 'Menos de 3 meses': 2, '3 a 6 meses': 4, '6 meses a 1 ano': 9, '1 a 2 anos': 18, '2 a 5 anos': 42, 'Mais de 5 anos': 72 };
// Salva o histórico estruturado de empresas (substitui o anterior).
async function salvarExperiencias(candidatoId, arr) {
  if (!Array.isArray(arr)) return;
  await prisma.experienciaProfissional.deleteMany({ where: { candidatoId } });
  for (const e of arr.slice(0, 15)) {
    if (!e?.empresa) continue;
    const duracao = rhStr(e.duracao, 60);
    await prisma.experienciaProfissional.create({ data: { candidatoId, empresa: String(e.empresa).slice(0, 160), cargo: rhStr(e.cargo, 120), funcao: rhStr(e.funcao, 120), duracao, duracaoMeses: duracao && RH_DURACOES[duracao] != null ? RH_DURACOES[duracao] : (e.duracaoMeses != null ? Number(e.duracaoMeses) || null : null), atividades: e.atividades ? String(e.atividades).slice(0, 1000) : null, motivoSaida: rhStr(e.motivoSaida, 200) } });
  }
}
function formPadrao(vaga) {
  return {
    titulo: vaga ? 'Candidate-se a esta vaga' : 'Trabalhe conosco',
    apresentacao: vaga ? '' : 'Deixe seus dados no nosso banco de talentos. Quando surgir uma vaga, a gente te chama!',
    campos: { email: { ativo: true, obrigatorio: false }, endereco: { ativo: true }, cidade: { ativo: true }, bairro: { ativo: true }, funcoes: { ativo: true }, experiencias: { ativo: true }, historico: { ativo: true }, disponibilidade: { ativo: true }, sobre: { ativo: true }, transporte: { ativo: false }, tempoDeslocamento: { ativo: false }, disponivelEm: { ativo: false }, ultimosEmpregos: { ativo: false }, pretensao: { ativo: false } },
    funcoes: ['Atendente', 'Auxiliar de cozinha', 'Chapista', 'Caixa', 'Motoboy'],
    experiencias: ['Atendimento', 'Caixa', 'Chapa', 'Montagem', 'Delivery'],
    dispDias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    dispTurnos: ['Manhã', 'Tarde', 'Noite'],
    perguntas: [],
  };
}
// Sanitiza/valida o objeto formulário vindo do gestor.
function sanitizarFormulario(f) {
  if (!f || typeof f !== 'object') return null;
  const out = {};
  out.titulo = String(f.titulo ?? '').slice(0, 120) || 'Trabalhe conosco';
  out.apresentacao = String(f.apresentacao ?? '').slice(0, 1000);
  out.campos = {};
  for (const k of FORM_CAMPOS) { const c = f.campos?.[k] || {}; out.campos[k] = { ativo: !!c.ativo, obrigatorio: !!c.obrigatorio }; }
  out.funcoes = Array.isArray(f.funcoes) ? f.funcoes.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 40) : [];
  out.experiencias = Array.isArray(f.experiencias) ? f.experiencias.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 40) : [];
  out.dispDias = Array.isArray(f.dispDias) ? f.dispDias.map((x) => String(x).slice(0, 30)).filter(Boolean).slice(0, 14) : [];
  out.dispTurnos = Array.isArray(f.dispTurnos) ? f.dispTurnos.map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 14) : [];
  out.perguntas = Array.isArray(f.perguntas) ? f.perguntas.slice(0, 30).map((p, i) => ({
    id: String(p.id || `p${i}_${Date.now()}`).slice(0, 40),
    texto: String(p.texto ?? '').slice(0, 300),
    tipo: FORM_TIPOS.includes(p.tipo) ? p.tipo : 'sim_nao',
    opcoes: Array.isArray(p.opcoes) ? p.opcoes.map((o) => String(o).slice(0, 100)).filter(Boolean).slice(0, 20) : [],
    obrigatoria: !!p.obrigatoria,
    papel: FORM_PAPEIS.includes(p.papel) ? p.papel : 'informativa',
    respostaIdeal: p.respostaIdeal != null ? (Array.isArray(p.respostaIdeal) ? p.respostaIdeal.map(String) : String(p.respostaIdeal).slice(0, 100)) : null,
    peso: Number.isFinite(Number(p.peso)) && Number(p.peso) > 0 ? Math.min(10, Math.round(Number(p.peso))) : 1,
  })).filter((p) => p.texto) : [];
  return out;
}

// Motor de classificação simples por aderência (sem score complexo).
// Retorna { classificacao, aderencia, detalhe } a partir das respostas de uma vaga.
function classificarCandidatura(formulario, respostas) {
  const perguntas = Array.isArray(formulario?.perguntas) ? formulario.perguntas : [];
  const resp = respostas && typeof respostas === 'object' ? respostas : {};
  const relevantes = perguntas.filter((p) => p.papel !== 'informativa' && p.tipo !== 'texto' && p.tipo !== 'texto_longo');
  if (!relevantes.length) return { classificacao: 'ATENDE', aderencia: 100, detalhe: [] };

  const atende = (p, r) => {
    if (r == null || r === '' || (Array.isArray(r) && !r.length)) return 'faltando';
    if (p.respostaIdeal == null || p.respostaIdeal === '') return 'sim'; // sem gabarito: basta responder
    if (p.tipo === 'numero' || p.tipo === 'escala') return Number(r) >= Number(p.respostaIdeal) ? 'sim' : 'nao';
    if (p.tipo === 'multipla') { const arr = Array.isArray(r) ? r.map((x) => String(x).toLowerCase()) : [String(r).toLowerCase()]; const ideais = Array.isArray(p.respostaIdeal) ? p.respostaIdeal : [p.respostaIdeal]; return ideais.some((i) => arr.includes(String(i).toLowerCase())) ? 'sim' : 'nao'; }
    return String(r).toLowerCase() === String(p.respostaIdeal).toLowerCase() ? 'sim' : 'nao';
  };

  let elimFail = false, faltando = false, prioFail = false, pesoTotal = 0, pesoOk = 0;
  const detalhe = relevantes.map((p) => {
    const ok = atende(p, resp[p.id]);
    const peso = Number(p.peso) || 1; pesoTotal += peso; if (ok === 'sim') pesoOk += peso;
    if (p.papel === 'eliminatoria') { if (ok === 'nao') elimFail = true; if (ok === 'faltando') faltando = true; }
    if (p.papel === 'prioridade') { if (ok === 'nao') prioFail = true; if (ok === 'faltando' && p.obrigatoria) faltando = true; }
    if (p.obrigatoria && ok === 'faltando') faltando = true;
    return { label: p.texto, ok, papel: p.papel };
  });
  let classificacao;
  if (elimFail) classificacao = 'NAO_ATENDE';
  else if (faltando) classificacao = 'INCOMPLETO';
  else if (prioFail) classificacao = 'PARCIAL';
  else classificacao = 'ATENDE';
  const aderencia = pesoTotal ? Math.round((pesoOk / pesoTotal) * 100) : 100;
  return { classificacao, aderencia, detalhe };
}

// Aplica a classificação a uma candidatura (usa o formulário da vaga + respostas guardadas).
async function classificarECaptar(candidaturaId) {
  const cx = await prisma.candidatura.findUnique({ where: { id: candidaturaId }, include: { vaga: { select: { formulario: true } } } });
  if (!cx) return null;
  const r = classificarCandidatura(cx.vaga?.formulario, cx.respostas);
  await prisma.candidatura.update({ where: { id: candidaturaId }, data: { classificacao: r.classificacao, aderencia: r.aderencia, classificacaoDetalhe: r.detalhe } });
  return r;
}

function rhSlugify(nome) {
  return String(nome || 'loja').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'loja';
}
async function getOrCreateRecrutamentoConfig() {
  const existente = await prisma.recrutamentoConfig.findFirst();
  if (existente) return existente;
  const empresaId = getEmpresaIdAtual();
  const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }).catch(() => null);
  let base = rhSlugify(emp?.nome); let slug = base; let n = 1;
  while (await prisma.recrutamentoConfig.findUnique({ where: { slug } })) { n++; slug = `${base}-${n}`; }
  return prisma.recrutamentoConfig.create({ data: { slug } });
}
async function rhSyncTags(tags) {
  if (!Array.isArray(tags)) return;
  for (const nome of tags) { try { await prisma.recrutamentoTag.create({ data: { nome: String(nome).slice(0, 60) } }); } catch { /* já existe */ } }
}

// Campos PERMANENTES do candidato (nada de status/score/currículo — esses não existem aqui).
function rhCandidatoInput(body) {
  const d = {};
  if (body.nome !== undefined) { const v = String(body.nome).trim(); if (!v) throw { http: 400, msg: 'Informe o nome.' }; d.nome = v.slice(0, 160); }
  if (body.email !== undefined) d.email = rhEmailNorm(body.email);
  if (body.endereco !== undefined) d.endereco = rhStr(body.endereco, 200);
  if (body.cidade !== undefined) d.cidade = rhStr(body.cidade, 120);
  if (body.bairro !== undefined) d.bairro = rhStr(body.bairro, 120);
  if (body.nascimento !== undefined) d.nascimento = rhData(body.nascimento);
  if (body.linkedin !== undefined) d.linkedin = rhStr(body.linkedin, 300);
  if (body.instagram !== undefined) d.instagram = rhStr(body.instagram, 120);
  if (body.funcoesInteresse !== undefined) d.funcoesInteresse = rhArr(body.funcoesInteresse).slice(0, 20);
  if (body.pretensaoSalarial !== undefined) d.pretensaoSalarial = body.pretensaoSalarial === '' || body.pretensaoSalarial == null ? null : rhNum(body.pretensaoSalarial);
  if (body.disponivelEm !== undefined) d.disponivelEm = rhData(body.disponivelEm);
  if (body.tipoVinculo !== undefined) d.tipoVinculo = RH_VINCULOS.includes(body.tipoVinculo) ? body.tipoVinculo : null;
  if (body.disponibilidade !== undefined && body.disponibilidade && typeof body.disponibilidade === 'object') d.disponibilidade = body.disponibilidade;
  if (body.experienciasRapidas !== undefined) d.experienciasRapidas = rhArr(body.experienciasRapidas).slice(0, 40);
  if (body.respostasTriagem !== undefined && body.respostasTriagem && typeof body.respostasTriagem === 'object') d.respostasTriagem = body.respostasTriagem;
  if (body.tags !== undefined) d.tags = rhArr(body.tags).slice(0, 40);
  if (body.observacoesInternas !== undefined) d.observacoesInternas = body.observacoesInternas ? String(body.observacoesInternas).slice(0, 2000) : null;
  return d;
}
// Só os campos que o formulário PÚBLICO pode tocar (nunca dados internos).
function rhCandidatoInputPublico(body) {
  return rhCandidatoInput({
    nome: body.nome, email: body.email, endereco: body.endereco, cidade: body.cidade, bairro: body.bairro, nascimento: body.nascimento,
    linkedin: body.linkedin, instagram: body.instagram, funcoesInteresse: body.funcoesInteresse,
    pretensaoSalarial: body.pretensaoSalarial, disponivelEm: body.disponivelEm, tipoVinculo: body.tipoVinculo,
    disponibilidade: body.disponibilidade, experienciasRapidas: body.experienciasRapidas,
  });
}

// ---------- ADMIN: config ----------
app.get('/api/recrutamento/config', async (req, res) => {
  try { const cfg = await getOrCreateRecrutamentoConfig(); res.json({ ...cfg, formulario: cfg.formulario || formPadrao(false) }); }
  catch (err) { console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});
app.put('/api/recrutamento/config', async (req, res) => {
  try {
    const cfg = await getOrCreateRecrutamentoConfig();
    const data = {};
    if (req.body?.publicoAtivo !== undefined) data.publicoAtivo = !!req.body.publicoAtivo;
    if (req.body?.retencaoMeses !== undefined) { const m = Number(req.body.retencaoMeses); if (Number.isInteger(m) && m > 0 && m <= 120) data.retencaoMeses = m; }
    if (req.body?.formulario !== undefined) { const f = sanitizarFormulario(req.body.formulario); if (f) data.formulario = f; }
    const upd = await prisma.recrutamentoConfig.update({ where: { id: cfg.id }, data });
    res.json({ ...upd, formulario: upd.formulario || formPadrao(false) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: KPIs ----------
app.get('/api/recrutamento/kpis', async (req, res) => {
  try {
    const agora = new Date();
    const trintaDias = new Date(agora.getTime() - 30 * 24 * 3600 * 1000);
    const [ativos, novos30, entrevistas, preSelRaw, vagasAbertas, altaRaw] = await Promise.all([
      prisma.candidato.count({ where: { anonimizado: false } }),
      prisma.candidato.count({ where: { anonimizado: false, criadoEm: { gte: trintaDias } } }),
      prisma.entrevistaCandidato.count({ where: { status: 'AGENDADA', quando: { gte: agora } } }),
      prisma.candidatura.findMany({ where: { status: 'PRE_SELECIONADO' }, select: { candidatoId: true }, distinct: ['candidatoId'] }),
      prisma.vaga.count({ where: { status: 'ABERTA' } }),
      prisma.candidatura.findMany({ where: { score: { gte: 80 }, scoreQualidade: { in: ['COMPLETO', 'PARCIAL'] } }, select: { candidatoId: true }, distinct: ['candidatoId'] }),
    ]);
    res.json({ ativos, novos30, entrevistas, preSelecionados: preSelRaw.length, altaCompatibilidade: altaRaw.length, vagasAbertas });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: cargos ----------
app.get('/api/recrutamento/cargos', async (req, res) => {
  try { res.json(await prisma.cargo.findMany({ orderBy: { nome: 'asc' } })); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/cargos', async (req, res) => {
  try { const nome = String(req.body?.nome ?? '').trim(); if (!nome) return res.status(400).json({ error: 'Informe o cargo.' }); res.status(201).json(await prisma.cargo.create({ data: { nome: nome.slice(0, 80) } })); }
  catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Cargo já existe.' }); console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.delete('/api/recrutamento/cargos/:id', async (req, res) => {
  try { await prisma.cargo.deleteMany({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: tags ----------
app.get('/api/recrutamento/tags', async (req, res) => {
  try { res.json(await prisma.recrutamentoTag.findMany({ orderBy: { nome: 'asc' } })); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/tags', async (req, res) => {
  try { const nome = String(req.body?.nome ?? '').trim(); if (!nome) return res.status(400).json({ error: 'Informe a tag.' }); await rhSyncTags([nome]); res.status(201).json(await prisma.recrutamentoTag.findFirst({ where: { nome: nome.slice(0, 60) } })); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: vagas ----------
function rhVagaInput(body) {
  const d = {};
  if (body.titulo !== undefined) { const v = String(body.titulo).trim(); if (!v) throw { http: 400, msg: 'Informe o título da vaga.' }; d.titulo = v.slice(0, 160); }
  if (body.cargoId !== undefined) d.cargoId = body.cargoId ? Number(body.cargoId) : null;
  if (body.status !== undefined) { if (!RH_VAGA_STATUS.includes(body.status)) throw { http: 400, msg: 'Status inválido' }; d.status = body.status; }
  if (body.quantidade !== undefined) { const q = Number(body.quantidade); d.quantidade = Number.isInteger(q) && q > 0 ? q : 1; }
  if (body.descricao !== undefined) d.descricao = body.descricao ? String(body.descricao).slice(0, 4000) : null;
  if (body.jornada !== undefined) d.jornada = rhStr(body.jornada, 120);
  if (body.turno !== undefined) d.turno = rhArr(body.turno, ['manha', 'tarde', 'noite', 'madrugada']);
  if (body.diasTrabalho !== undefined) d.diasTrabalho = rhArr(body.diasTrabalho, ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
  if (body.salarioMin !== undefined) d.salarioMin = body.salarioMin === '' || body.salarioMin == null ? null : rhNum(body.salarioMin);
  if (body.salarioMax !== undefined) d.salarioMax = body.salarioMax === '' || body.salarioMax == null ? null : rhNum(body.salarioMax);
  if (body.inicioPrevisto !== undefined) d.inicioPrevisto = rhData(body.inicioPrevisto);
  if (body.requisitos !== undefined) d.requisitos = body.requisitos ? String(body.requisitos).slice(0, 2000) : null;
  if (body.diferenciais !== undefined) d.diferenciais = body.diferenciais ? String(body.diferenciais).slice(0, 2000) : null;
  if (body.responsavel !== undefined) d.responsavel = rhStr(body.responsavel, 120);
  if (body.observacoes !== undefined) d.observacoes = body.observacoes ? String(body.observacoes).slice(0, 2000) : null;
  if (body.atividadesEssenciais !== undefined) d.atividadesEssenciais = rhArr(body.atividadesEssenciais).slice(0, 40);
  if (body.perguntas !== undefined) d.perguntas = Array.isArray(body.perguntas) ? body.perguntas.slice(0, 30) : null;
  if (body.pesos !== undefined && body.pesos && typeof body.pesos === 'object') d.pesos = body.pesos;
  if (body.formulario !== undefined) { const f = sanitizarFormulario(body.formulario); if (f) d.formulario = f; }
  return d;
}
async function rhVagaComStats(vagas) {
  const ids = vagas.map((v) => v.id);
  if (!ids.length) return [];
  const cands = await prisma.candidatura.findMany({ where: { vagaId: { in: ids } }, select: { vagaId: true, classificacao: true, classificacaoManual: true } });
  return vagas.map((v) => {
    const cs = cands.filter((c) => c.vagaId === v.id);
    const efetiva = (c) => c.classificacaoManual || c.classificacao;
    const atende = cs.filter((c) => efetiva(c) === 'ATENDE').length;
    const parcial = cs.filter((c) => efetiva(c) === 'PARCIAL').length;
    return { ...v, stats: { inscritos: cs.length, atende, parcial } };
  });
}
app.get('/api/recrutamento/vagas', async (req, res) => {
  try {
    const where = {};
    if (req.query.status && RH_VAGA_STATUS.includes(req.query.status)) where.status = req.query.status;
    const vagas = await prisma.vaga.findMany({ where, orderBy: { criadoEm: 'desc' }, include: { cargo: { select: { nome: true } } } });
    res.json(await rhVagaComStats(vagas));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.get('/api/recrutamento/vagas/:id', async (req, res) => {
  try {
    const v = await prisma.vaga.findUnique({ where: { id: Number(req.params.id) }, include: { cargo: { select: { nome: true } } } });
    if (!v) return res.status(404).json({ error: 'Vaga não encontrada' });
    res.json({ ...v, formulario: v.formulario || formPadrao(true) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
// Inscritos da vaga (lista simples, sem Kanban)
app.get('/api/recrutamento/vagas/:id/candidaturas', async (req, res) => {
  try {
    const vagaId = Number(req.params.id);
    const cxs = await prisma.candidatura.findMany({ where: { vagaId }, orderBy: [{ aderencia: 'desc' }, { criadoEm: 'desc' }], include: { candidato: { select: { id: true, nome: true, telefone: true, cidade: true, bairro: true, situacao: true, funcoesInteresse: true } } } });
    res.json(cxs.map((c) => ({ id: c.id, candidatoId: c.candidatoId, nome: c.candidato?.nome, telefone: c.candidato?.telefone, cidade: c.candidato?.cidade, bairro: c.candidato?.bairro, situacao: c.candidato?.situacao, funcoes: c.candidato?.funcoesInteresse, classificacao: c.classificacaoManual || c.classificacao, classificacaoManual: c.classificacaoManual, aderencia: c.aderencia, detalhe: c.classificacaoDetalhe, criadoEm: c.criadoEm })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/vagas', async (req, res) => {
  try {
    const data = rhVagaInput(req.body || {});
    if (!data.titulo) return res.status(400).json({ error: 'Informe o título da vaga.' });
    if (data.formulario === undefined) data.formulario = formPadrao(true);
    res.status(201).json(await prisma.vaga.create({ data }));
  } catch (err) { console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});
app.put('/api/recrutamento/vagas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existe = await prisma.vaga.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Vaga não encontrada' });
    const data = rhVagaInput(req.body || {});
    const v = await prisma.vaga.update({ where: { id }, data });
    // Formulário mudou → reclassifica todas as candidaturas da vaga
    if (data.formulario !== undefined) { const cxs = await prisma.candidatura.findMany({ where: { vagaId: id }, select: { id: true } }); for (const c of cxs) await classificarECaptar(c.id); }
    res.json(v);
  } catch (err) { console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});
app.delete('/api/recrutamento/vagas/:id', async (req, res) => {
  try { await prisma.vaga.deleteMany({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
// Override manual da classificação de uma candidatura
app.put('/api/recrutamento/candidaturas/:id/classificacao', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const val = req.body?.classificacao;
    const permitido = ['ATENDE', 'PARCIAL', 'NAO_ATENDE', 'INCOMPLETO', null, ''];
    if (!permitido.includes(val)) return res.status(400).json({ error: 'Classificação inválida' });
    await prisma.candidatura.update({ where: { id }, data: { classificacaoManual: val || null } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: candidatos (perfil) ----------
function rhResumoCandidato(c) {
  const cxs = c.candidaturas || [];
  const ativas = cxs.filter((x) => !['REPROVADO', 'SEM_RETORNO'].includes(x.status));
  const best = cxs.filter((x) => x.score != null).sort((a, b) => b.score - a.score)[0] || null;
  const principal = ativas[0] || cxs[0] || null;
  return {
    id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, cidade: c.cidade, bairro: c.bairro,
    funcoesInteresse: c.funcoesInteresse, experienciasRapidas: c.experienciasRapidas, disponibilidade: c.disponibilidade,
    origem: c.origem, tags: c.tags, bancoTalentos: c.bancoTalentos, situacao: c.situacao, atualizadoEm: c.atualizadoEm, criadoEm: c.criadoEm,
    candidaturasAtivas: ativas.length, totalCandidaturas: cxs.length,
    vagaPrincipal: principal ? { candidaturaId: principal.id, vagaId: principal.vagaId, titulo: principal.vaga?.titulo, status: principal.status } : null,
    compat: best?.score ?? null, compatQualidade: best?.scoreQualidade ?? null,
    proximaEntrevista: (c.entrevistas || [])[0]?.quando ?? null,
    candidaturas: cxs.map((x) => ({ id: x.id, vagaId: x.vagaId, titulo: x.vaga?.titulo, status: x.status, score: x.score, qualidade: x.scoreQualidade })),
  };
}
app.get('/api/recrutamento/candidatos', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const where = { anonimizado: false };
    if (req.query.situacao && ['ATIVO', 'ARQUIVADO', 'CONTRATADO'].includes(req.query.situacao)) where.situacao = req.query.situacao;
    if (req.query.origem && RH_ORIGENS.includes(req.query.origem)) where.origem = req.query.origem;
    if (req.query.funcao) where.funcoesInteresse = { has: String(req.query.funcao) };
    if (req.query.experiencia) where.experienciasRapidas = { has: String(req.query.experiencia) };
    if (req.query.tag) where.tags = { has: String(req.query.tag) };
    const cxWhere = {};
    if (req.query.status && RH_STATUS.includes(req.query.status)) cxWhere.status = req.query.status;
    if (req.query.vagaId) cxWhere.vagaId = Number(req.query.vagaId);
    if (Object.keys(cxWhere).length) where.candidaturas = { some: cxWhere };
    const agora = new Date();
    const lista = await prisma.candidato.findMany({
      where, orderBy: { atualizadoEm: 'desc' }, take: 1000,
      include: { candidaturas: { select: { id: true, vagaId: true, status: true, score: true, scoreQualidade: true, vaga: { select: { titulo: true } } } }, entrevistas: { where: { status: 'AGENDADA', quando: { gte: agora } }, orderBy: { quando: 'asc' }, take: 1 } },
    });
    let itens = lista.map(rhResumoCandidato);
    if (q) itens = itens.filter((c) => c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(q) || (c.email || '').toLowerCase().includes(q));
    if (req.query.vagaId) { const vid = Number(req.query.vagaId); itens = itens.map((c) => ({ ...c, compat: c.candidaturas.find((x) => x.vagaId === vid)?.score ?? c.compat })); }
    const cmin = req.query.compatMin != null && req.query.compatMin !== '' ? Number(req.query.compatMin) : null;
    if (cmin != null) itens = itens.filter((c) => (c.compat ?? -1) >= cmin);
    if (req.query.turno) itens = itens.filter((c) => Array.isArray(c.disponibilidade?.turnos) && c.disponibilidade.turnos.includes(String(req.query.turno)));
    const sort = String(req.query.sort ?? 'compat');
    itens.sort((a, b) => {
      if (sort === 'recentes') return new Date(b.criadoEm) - new Date(a.criadoEm);
      if (sort === 'movimentacao') return new Date(b.atualizadoEm) - new Date(a.atualizadoEm);
      if (sort === 'entrevista') return (a.proximaEntrevista ? new Date(a.proximaEntrevista) : Infinity) - (b.proximaEntrevista ? new Date(b.proximaEntrevista) : Infinity);
      return (b.compat ?? -1) - (a.compat ?? -1);
    });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
    res.json({ itens: itens.slice((page - 1) * pageSize, page * pageSize), total: itens.length, page, pageSize });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.get('/api/recrutamento/candidatos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.candidato.findUnique({
      where: { id },
      include: {
        experiencias: { orderBy: { criadoEm: 'desc' } },
        candidaturas: {
          orderBy: { criadoEm: 'desc' },
          include: {
            vaga: { select: { id: true, titulo: true, status: true, formulario: true } },
            historico: { orderBy: { criadoEm: 'desc' }, take: 60 },
            avaliacoes: { orderBy: { criadoEm: 'desc' } },
            contatos: { orderBy: { criadoEm: 'desc' } },
            entrevistas: { orderBy: { quando: 'desc' } },
          },
        },
        historico: { where: { candidaturaId: null }, orderBy: { criadoEm: 'desc' }, take: 40 },
      },
    });
    if (!c) return res.status(404).json({ error: 'Candidato não encontrado' });
    const vagasAbertas = await prisma.vaga.findMany({ where: { status: 'ABERTA' }, select: { id: true, titulo: true }, orderBy: { titulo: 'asc' } });
    const cfg = await prisma.recrutamentoConfig.findFirst({ select: { formulario: true } }).catch(() => null);
    res.json({ ...c, vagasAbertas, configForm: cfg?.formulario || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/candidatos', async (req, res) => {
  try {
    const body = req.body || {};
    const telefone = rhTelefone(body.telefone);
    const telefoneNorm = rhNormTelefone(body.telefone);
    if (!telefoneNorm) return res.status(400).json({ error: 'Informe um telefone válido.' });
    const data = rhCandidatoInput(body);
    if (!data.nome) return res.status(400).json({ error: 'Informe o nome.' });
    const existe = await prisma.candidato.findFirst({ where: { telefoneNorm } });
    if (existe) return res.status(409).json({ error: 'Já existe um candidato com esse telefone.', candidatoId: existe.id });
    data.telefone = telefone; data.telefoneNorm = telefoneNorm;
    data.origem = RH_ORIGENS.includes(body.origem) ? body.origem : 'MANUAL';
    if (body.tags) await rhSyncTags(data.tags);
    const cand = await prisma.candidato.create({ data });
    await prisma.candidatoHistorico.create({ data: { candidatoId: cand.id, tipo: 'SISTEMA', descricao: 'Candidato cadastrado', usuario: usuarioAtual() } });
    if (Array.isArray(body.experiencias)) await salvarExperiencias(cand.id, body.experiencias);
    if (body.vagaId) { const vaga = await prisma.vaga.findUnique({ where: { id: Number(body.vagaId) } }); if (vaga) { const cx = await prisma.candidatura.create({ data: { candidatoId: cand.id, vagaId: vaga.id } }); await registrarScoreCandidatura(cx.id, 'Cadastro inicial'); await prisma.candidatoHistorico.create({ data: { candidatoId: cand.id, candidaturaId: cx.id, tipo: 'STATUS', para: 'NOVO', descricao: `Candidatura em ${vaga.titulo}`, usuario: usuarioAtual() } }); } }
    res.status(201).json(cand);
  } catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um candidato com esse telefone.' }); console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});
app.put('/api/recrutamento/candidatos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existe = await prisma.candidato.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Candidato não encontrado' });
    const body = req.body || {};
    const data = rhCandidatoInput(body);
    if (body.telefone !== undefined) { const n = rhNormTelefone(body.telefone); if (!n) return res.status(400).json({ error: 'Telefone inválido' }); data.telefone = rhTelefone(body.telefone); data.telefoneNorm = n; }
    if (body.bancoTalentos !== undefined) data.bancoTalentos = !!body.bancoTalentos;
    if (body.situacao !== undefined && ['ATIVO', 'ARQUIVADO', 'CONTRATADO'].includes(body.situacao)) data.situacao = body.situacao;
    if (body.tags) await rhSyncTags(data.tags);
    const cand = await prisma.candidato.update({ where: { id }, data });
    // Perfil mudou (disponibilidade/experiências/triagem) → recalcula candidaturas
    if (data.disponibilidade !== undefined || data.experienciasRapidas !== undefined || data.respostasTriagem !== undefined || data.funcoesInteresse !== undefined) await recalcularCandidaturasDoCandidato(id, 'Atualização do perfil do candidato');
    res.json(cand);
  } catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um candidato com esse telefone.' }); console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});
// Vincular candidato a uma vaga (nova candidatura)
app.post('/api/recrutamento/candidatos/:id/candidatura', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const vagaId = Number(req.body?.vagaId);
    const cand = await prisma.candidato.findUnique({ where: { id } });
    const vaga = await prisma.vaga.findUnique({ where: { id: vagaId } });
    if (!cand || !vaga) return res.status(404).json({ error: 'Candidato ou vaga não encontrado' });
    const jaTem = await prisma.candidatura.findFirst({ where: { candidatoId: id, vagaId } });
    if (jaTem) return res.status(409).json({ error: 'Este candidato já participa dessa vaga.', candidaturaId: jaTem.id });
    const cx = await prisma.candidatura.create({ data: { candidatoId: id, vagaId } });
    await registrarScoreCandidatura(cx.id, 'Cadastro inicial');
    await prisma.candidatoHistorico.create({ data: { candidatoId: id, candidaturaId: cx.id, tipo: 'STATUS', para: 'NOVO', descricao: `Candidatura em ${vaga.titulo}`, usuario: usuarioAtual() } });
    res.status(201).json(cx);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
// Anonimização / exclusão (LGPD — irreversível)
app.delete('/api/recrutamento/candidatos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existe = await prisma.candidato.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Candidato não encontrado' });
    // Remove dados identificáveis e textos livres; preserva só estatística (status/score/vaga/origem/datas).
    await prisma.experienciaProfissional.deleteMany({ where: { candidatoId: id } });
    await prisma.avaliacaoCandidato.deleteMany({ where: { candidatoId: id } });
    await prisma.contatoCandidato.deleteMany({ where: { candidatoId: id } });
    await prisma.entrevistaCandidato.deleteMany({ where: { candidatoId: id } });
    await prisma.candidatoHistorico.updateMany({ where: { candidatoId: id }, data: { descricao: null, usuario: null } });
    await prisma.candidato.update({ where: { id }, data: { anonimizado: true, situacao: 'ARQUIVADO', anonimizadoEm: new Date(), nome: 'Candidato anonimizado', telefone: '', telefoneNorm: `anon-${id}`, email: null, endereco: null, cidade: null, bairro: null, nascimento: null, linkedin: null, instagram: null, observacoesInternas: null, funcoesInteresse: [], experienciasRapidas: [], tags: [], disponibilidade: null, respostasTriagem: null, respostasFormulario: null } });
    await prisma.candidatoHistorico.create({ data: { candidatoId: id, tipo: 'SISTEMA', descricao: 'Dados anonimizados (LGPD)', usuario: usuarioAtual() } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: candidaturas (processo) ----------
app.get('/api/recrutamento/candidaturas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cx = await prisma.candidatura.findUnique({
      where: { id },
      include: {
        candidato: { select: { id: true, nome: true, telefone: true, email: true, cidade: true, bairro: true } },
        vaga: { select: { id: true, titulo: true, status: true } },
        historico: { orderBy: { criadoEm: 'desc' }, take: 100 },
        avaliacoes: { orderBy: { criadoEm: 'desc' } },
        contatos: { orderBy: { criadoEm: 'desc' } },
        entrevistas: { orderBy: { quando: 'desc' } },
        scoreHist: { orderBy: { criadoEm: 'desc' }, take: 20 },
      },
    });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    res.json(cx);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
// Alterar status (com histórico) — só desta candidatura
app.put('/api/recrutamento/candidaturas/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const novo = String(req.body?.status ?? '');
    if (!RH_STATUS.includes(novo)) return res.status(400).json({ error: 'Status inválido' });
    const cx = await prisma.candidatura.findUnique({ where: { id }, select: { status: true, candidatoId: true } });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    if (cx.status === novo) return res.json({ ok: true, semMudanca: true });
    const data = { status: novo };
    if (novo === 'REPROVADO' && req.body?.motivoReprovacao) data.motivoReprovacao = rhStr(req.body.motivoReprovacao, 200);
    await prisma.candidatura.update({ where: { id }, data });
    if (novo === 'BANCO_TALENTOS') await prisma.candidato.update({ where: { id: cx.candidatoId }, data: { bancoTalentos: true } }).catch(() => {});
    await prisma.candidatoHistorico.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, tipo: 'STATUS', de: cx.status, para: novo, descricao: req.body?.observacao ? String(req.body.observacao).slice(0, 500) : (data.motivoReprovacao || null), usuario: usuarioAtual() } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/candidaturas/:id/observacao', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cx = await prisma.candidatura.findUnique({ where: { id }, select: { candidatoId: true } });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    const texto = String(req.body?.descricao ?? '').trim();
    if (!texto) return res.status(400).json({ error: 'Informe a observação.' });
    const data = {};
    if (req.body?.proximaAcao !== undefined) data.proximaAcao = rhStr(req.body.proximaAcao, 200);
    if (req.body?.dataRetorno !== undefined) data.dataRetorno = rhData(req.body.dataRetorno);
    if (Object.keys(data).length) await prisma.candidatura.update({ where: { id }, data });
    await prisma.candidatoHistorico.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, tipo: 'OBS', descricao: texto.slice(0, 2000), usuario: usuarioAtual() } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/candidaturas/:id/avaliacao', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cx = await prisma.candidatura.findUnique({ where: { id }, select: { candidatoId: true } });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    const b = req.body || {};
    const evidencias = String(b.evidencias ?? '').trim();
    if (!evidencias) return res.status(400).json({ error: 'Descreva as evidências da avaliação.' });
    const crit = {}; for (const k of ['comunicacao', 'organizacao', 'postura', 'tecnico', 'compatibilidade', 'disponibilidade', 'interesse', 'treinamento']) { const n = Number(b[k]); if (Number.isInteger(n) && n >= 1 && n <= 5) crit[k] = n; }
    const av = await prisma.avaliacaoCandidato.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, ...crit, evidencias: evidencias.slice(0, 2000), autor: usuarioAtual() } });
    const sh = scoreHumano(crit);
    if (sh != null) { await prisma.candidatura.update({ where: { id }, data: { avaliacaoGestor: sh } }); await registrarScoreCandidatura(id, 'Nova avaliação do gestor'); }
    await prisma.candidatoHistorico.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, tipo: 'AVALIACAO', descricao: `Avaliação registrada${sh != null ? ` (nota humana ${sh}/100)` : ''}`, usuario: usuarioAtual() } });
    res.status(201).json(av);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/candidaturas/:id/contato', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cx = await prisma.candidatura.findUnique({ where: { id }, select: { candidatoId: true } });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    const tipo = String(req.body?.tipo ?? ''); const resultado = String(req.body?.resultado ?? '');
    if (!RH_CONTATO_TIPO.includes(tipo)) return res.status(400).json({ error: 'Tipo de contato inválido' });
    if (!RH_CONTATO_RES.includes(resultado)) return res.status(400).json({ error: 'Resultado inválido' });
    const ct = await prisma.contatoCandidato.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, tipo, resultado, observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 1000) : null, proximaAcao: rhStr(req.body?.proximaAcao, 200), dataRetorno: rhData(req.body?.dataRetorno), autor: usuarioAtual() } });
    const data = {}; if (req.body?.proximaAcao) data.proximaAcao = rhStr(req.body.proximaAcao, 200); if (req.body?.dataRetorno) data.dataRetorno = rhData(req.body.dataRetorno);
    if (Object.keys(data).length) await prisma.candidatura.update({ where: { id }, data });
    await prisma.candidatoHistorico.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, tipo: 'CONTATO', para: resultado, descricao: `${tipo}: ${resultado}`, usuario: usuarioAtual() } });
    res.status(201).json(ct);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/candidaturas/:id/entrevista', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cx = await prisma.candidatura.findUnique({ where: { id }, select: { candidatoId: true } });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    const quando = req.body?.quando ? new Date(req.body.quando) : null;
    if (!quando || isNaN(quando.getTime())) return res.status(400).json({ error: 'Informe data e hora válidas.' });
    const tipo = RH_ENTREVISTA_TIPO.includes(req.body?.tipo) ? req.body.tipo : 'PRESENCIAL';
    const ent = await prisma.entrevistaCandidato.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, quando, tipo, responsavel: rhStr(req.body?.responsavel, 120), local: rhStr(req.body?.local, 300), observacoes: req.body?.observacoes ? String(req.body.observacoes).slice(0, 1000) : null } });
    await prisma.candidatura.update({ where: { id }, data: { status: 'ENTREVISTA_AGENDADA' } });
    await prisma.candidatoHistorico.create({ data: { candidatoId: cx.candidatoId, candidaturaId: id, tipo: 'ENTREVISTA', para: 'ENTREVISTA_AGENDADA', descricao: `Entrevista ${tipo} agendada`, usuario: usuarioAtual() } });
    res.status(201).json(ent);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.post('/api/recrutamento/candidaturas/:id/recalcular-score', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cx = await prisma.candidatura.findUnique({ where: { id }, select: { id: true } });
    if (!cx) return res.status(404).json({ error: 'Candidatura não encontrada' });
    const r = await registrarScoreCandidatura(id, 'Recálculo manual');
    res.json(r || { ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
app.delete('/api/recrutamento/candidaturas/:id', async (req, res) => {
  try { await prisma.candidatura.deleteMany({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// Kanban: CANDIDATURAS agrupadas por status (opcional ?vagaId)
app.get('/api/recrutamento/kanban', async (req, res) => {
  try {
    const where = {};
    if (req.query.vagaId) where.vagaId = Number(req.query.vagaId);
    const agora = new Date();
    const cxs = await prisma.candidatura.findMany({
      where, orderBy: { atualizadoEm: 'desc' }, take: 2000,
      include: { candidato: { select: { id: true, nome: true, tags: true, anonimizado: true } }, vaga: { select: { titulo: true } }, entrevistas: { where: { status: 'AGENDADA', quando: { gte: agora } }, orderBy: { quando: 'asc' }, take: 1 } },
    });
    const colunas = {}; for (const s of RH_STATUS) colunas[s] = [];
    for (const cx of cxs) {
      if (cx.candidato?.anonimizado) continue;
      colunas[cx.status]?.push({
        candidaturaId: cx.id, candidatoId: cx.candidatoId, vagaId: cx.vagaId, nome: cx.candidato?.nome, vagaTitulo: cx.vaga?.titulo,
        status: cx.status, score: cx.score, qualidade: cx.scoreQualidade, tags: cx.candidato?.tags || [],
        atualizadoEm: cx.atualizadoEm, proximaAcao: cx.proximaAcao, proximaEntrevista: (cx.entrevistas || [])[0]?.quando ?? null,
      });
    }
    res.json({ status: RH_STATUS, colunas });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: LGPD (visão de gestão manual) ----------
app.get('/api/recrutamento/lgpd', async (req, res) => {
  try {
    const cfg = await getOrCreateRecrutamentoConfig();
    const agora = new Date();
    const msAlerta = agora.getTime() - Math.max(1, cfg.retencaoMeses - 1) * 30 * 24 * 3600 * 1000;
    const msLimite = agora.getTime() - cfg.retencaoMeses * 30 * 24 * 3600 * 1000;
    const sel = { id: true, nome: true, origem: true, criadoEm: true, consentimentoLGPD: true, consentimentoBanco: true, consentimentoEm: true, termoVersao: true };
    const [proximos, soProcesso, todos] = await Promise.all([
      prisma.candidato.findMany({ where: { anonimizado: false, criadoEm: { lte: new Date(msAlerta) } }, select: sel, orderBy: { criadoEm: 'asc' }, take: 200 }),
      prisma.candidato.findMany({ where: { anonimizado: false, consentimentoLGPD: true, consentimentoBanco: false }, select: sel, orderBy: { criadoEm: 'asc' }, take: 200 }),
      prisma.candidato.count({ where: { anonimizado: false } }),
    ]);
    const elegiveis = proximos.filter((c) => new Date(c.criadoEm).getTime() <= msLimite || c.consentimentoBanco === false);
    res.json({ retencaoMeses: cfg.retencaoMeses, termoVersao: cfg.termoVersao, totalAtivos: todos, proximosRetencao: proximos, soConsentimentoProcesso: soProcesso, elegiveisAnonimizar: elegiveis });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- PÚBLICO: formulário PERMANENTE (banco de talentos) ----------
app.get('/api/public/talentos/:slug', async (req, res) => {
  try {
    const cfg = await prisma.recrutamentoConfig.findUnique({ where: { slug: String(req.params.slug) } });
    if (!cfg || !cfg.publicoAtivo) return res.status(404).json({ error: 'Formulário indisponível' });
    const empr = await prisma.empresa.findUnique({ where: { id: cfg.empresaId }, select: { nome: true, logoDataUrl: true } }).catch(() => null);
    const vagas = await prisma.vaga.findMany({ where: { status: 'ABERTA', empresaId: cfg.empresaId }, select: { id: true, titulo: true }, orderBy: { criadoEm: 'desc' } });
    res.json({ empresa: { nome: (empr?.nome ?? '').trim() || 'Hamburgueria', logo: empr?.logoDataUrl ?? null }, formulario: cfg.formulario || formPadrao(false), vagas, termoVersao: cfg.termoVersao });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
// ---------- PÚBLICO: formulário de uma VAGA específica ----------
app.get('/api/public/talentos/:slug/vagas/:vagaId', async (req, res) => {
  try {
    const cfg = await prisma.recrutamentoConfig.findUnique({ where: { slug: String(req.params.slug) } });
    if (!cfg || !cfg.publicoAtivo) return res.status(404).json({ error: 'Formulário indisponível' });
    const empr = await prisma.empresa.findUnique({ where: { id: cfg.empresaId }, select: { nome: true, logoDataUrl: true } }).catch(() => null);
    const vaga = await prisma.vaga.findFirst({ where: { id: Number(req.params.vagaId), empresaId: cfg.empresaId }, select: { id: true, titulo: true, descricao: true, status: true, jornada: true, formulario: true } });
    if (!vaga || vaga.status !== 'ABERTA') return res.status(404).json({ error: 'Vaga indisponível' });
    res.json({ empresa: { nome: (empr?.nome ?? '').trim() || 'Hamburgueria', logo: empr?.logoDataUrl ?? null }, vaga: { id: vaga.id, titulo: vaga.titulo, descricao: vaga.descricao, jornada: vaga.jornada }, formulario: vaga.formulario || formPadrao(true), termoVersao: cfg.termoVersao });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// Grava/atualiza candidato (dedup por telefone, preservando dados internos) + consentimento.
async function upsertCandidatoPublico(cfg, body, origem) {
  const telefone = rhTelefone(body.telefone); const telefoneNorm = rhNormTelefone(body.telefone);
  const data = rhCandidatoInputPublico(body);
  if (!data.nome) throw { http: 400, msg: 'Informe o nome.' };
  const consent = { consentimentoLGPD: true, consentimentoBanco: !!body.consentimentoBanco, consentimentoEm: new Date(), consentimentoOrigem: 'PUBLICO', termoVersao: cfg.termoVersao };
  const respostasFormulario = body.respostasFormulario && typeof body.respostasFormulario === 'object' ? body.respostasFormulario : undefined;
  const existente = await prisma.candidato.findFirst({ where: { telefoneNorm } });
  if (existente) { const cand = await prisma.candidato.update({ where: { id: existente.id }, data: { ...data, telefone, ...consent, ...(respostasFormulario !== undefined ? { respostasFormulario } : {}) } }); if (Array.isArray(body.experiencias)) await salvarExperiencias(cand.id, body.experiencias); return { cand, novo: false }; }
  const cand = await prisma.candidato.create({ data: { ...data, telefone, telefoneNorm, origem, ...consent, ...(respostasFormulario !== undefined ? { respostasFormulario } : {}) } });
  if (Array.isArray(body.experiencias)) await salvarExperiencias(cand.id, body.experiencias);
  await prisma.candidatoHistorico.create({ data: { candidatoId: cand.id, tipo: 'SISTEMA', descricao: 'Cadastro pelo formulário público', usuario: null } });
  return { cand, novo: true };
}
app.post('/api/public/talentos/:slug', async (req, res) => {
  try {
    const cfg = await prisma.recrutamentoConfig.findUnique({ where: { slug: String(req.params.slug) } });
    if (!cfg || !cfg.publicoAtivo) return res.status(404).json({ error: 'Formulário indisponível' });
    const body = req.body || {};
    if (!body.consentimentoLGPD) return res.status(400).json({ error: 'É necessário aceitar o uso dos dados para participar.' });
    if (!rhNormTelefone(body.telefone)) return res.status(400).json({ error: 'Informe um telefone válido.' });
    const out = await tenantStore.run({ empresaId: cfg.empresaId }, async () => {
      const { novo } = await upsertCandidatoPublico(cfg, body, 'PUBLICO');
      return { ok: true, novoCadastro: novo, banco: true };
    });
    res.status(201).json(out);
  } catch (err) { console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});
app.post('/api/public/talentos/:slug/vagas/:vagaId', async (req, res) => {
  try {
    const cfg = await prisma.recrutamentoConfig.findUnique({ where: { slug: String(req.params.slug) } });
    if (!cfg || !cfg.publicoAtivo) return res.status(404).json({ error: 'Formulário indisponível' });
    const body = req.body || {};
    if (!body.consentimentoLGPD) return res.status(400).json({ error: 'É necessário aceitar o uso dos dados para participar.' });
    if (!rhNormTelefone(body.telefone)) return res.status(400).json({ error: 'Informe um telefone válido.' });
    const out = await tenantStore.run({ empresaId: cfg.empresaId }, async () => {
      const vaga = await prisma.vaga.findUnique({ where: { id: Number(req.params.vagaId) } });
      if (!vaga || vaga.status !== 'ABERTA') throw { http: 404, msg: 'Vaga indisponível' };
      const { cand, novo } = await upsertCandidatoPublico(cfg, body, 'PUBLICO');
      const respostas = body.respostas && typeof body.respostas === 'object' ? body.respostas : {};
      let jaInscrito = false;
      const jaTem = await prisma.candidatura.findFirst({ where: { candidatoId: cand.id, vagaId: vaga.id } });
      if (jaTem) { jaInscrito = true; await prisma.candidatura.update({ where: { id: jaTem.id }, data: { respostas } }); await classificarECaptar(jaTem.id); }
      else {
        const cx = await prisma.candidatura.create({ data: { candidatoId: cand.id, vagaId: vaga.id, respostas } });
        await classificarECaptar(cx.id);
        await prisma.candidatoHistorico.create({ data: { candidatoId: cand.id, candidaturaId: cx.id, tipo: 'STATUS', para: 'NOVO', descricao: `Candidatura em ${vaga.titulo}` } });
      }
      return { ok: true, novoCadastro: novo, jaInscrito, vaga: vaga.titulo };
    });
    res.status(201).json(out);
  } catch (err) { console.error(err); res.status(err?.http || 500).json({ error: err?.msg || 'Erro interno' }); }
});



// ===================== Gestão: Insumos/Produtos/Ficha/Precificação/Análise/Custos Fixos GET (do H360) =====================
// ===== Insumos =====

const TIPOS_INSUMO = [
  'INGREDIENTE',
  'PRODUCAO_PROPRIA',
  'BEBIDA',
  'HORTIFRUTI',
  'EMBALAGEM',
  'ACOMPANHAMENTO',
  'OPERACIONAL'
];

// Unidades padronizadas: Kg (custo por 1 kg; quantidades em ficha/receita lançadas em gramas),
// L (custo por 1 litro; quantidades lançadas em ml) e Und (custo por 1 unidade).
function normalizeUnidade(u) {
  if (typeof u !== 'string') return null;
  const v = u.trim().toLowerCase();
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg';
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L';
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und';
  return null;
}

// Converte a quantidade informada para a base do custo unitário:
// Kg (gramas) e L (ml) dividem por 1000; Und usa direto.
function quantidadeBase(quantidade, unidadeInsumo) {
  const q = Number(quantidade);
  const u = normalizeUnidade(unidadeInsumo);
  return u === 'Kg' || u === 'L' ? q / 1000 : q;
}

// Unidade em que a quantidade deve ser informada/exibida na ficha ou receita
function unidadeQuantidade(unidadeInsumo) {
  const u = normalizeUnidade(unidadeInsumo);
  if (u === 'Kg') return 'g';
  if (u === 'L') return 'ml';
  return 'und';
}

function insumoComUnidadeNormalizada(insumo) {
  if (!insumo) return insumo;
  const norm = normalizeUnidade(insumo.unidade);
  return norm ? { ...insumo, unidade: norm } : insumo;
}

// ===== Perda/rendimento no preparo (V2) =====
// Rendimento do insumo no preparo (fração 0..1) ou null quando não se aplica.
// Produção própria NUNCA usa perda de preparo (o rendimento vem da receita),
// evitando dupla contagem. Protegido contra divisão por zero / NaN / Infinity.
function rendimentoPreparo(insumo) {
  if (!insumo || insumo.considerarPerdaPreparo !== true) return null;
  if ((insumo.tipo ?? 'INGREDIENTE') === 'PRODUCAO_PROPRIA') return null;
  const bruta = Number(insumo.quantidadeBrutaPreparo);
  const aprov = Number(insumo.quantidadeAproveitavelPreparo);
  if (!Number.isFinite(bruta) || !Number.isFinite(aprov)) return null;
  if (bruta <= 0 || aprov <= 0 || aprov > bruta) return null;
  const r = aprov / bruta;
  return Number.isFinite(r) && r > 0 && r <= 1 ? r : null;
}
// Fator multiplicador do custo bruto: 1/rendimento (ou 1 quando não há perda).
function fatorPerdaPreparo(insumo) {
  const r = rendimentoPreparo(insumo);
  return r ? 1 / r : 1;
}
// Valida/normaliza os campos de perda vindos do body. Retorna { ok, data } ou
// { ok:false, error }. tipoFinal é o tipo efetivo do insumo (após o merge).
function buildPerdaPreparoData(body, tipoFinal) {
  const considerar = body?.considerarPerdaPreparo === true;
  if (!considerar) {
    return {
      ok: true,
      data: {
        considerarPerdaPreparo: false,
        quantidadeBrutaPreparo: null,
        quantidadeAproveitavelPreparo: null
      }
    };
  }
  if (tipoFinal === 'PRODUCAO_PROPRIA') {
    return { ok: false, error: 'Insumos de produção própria usam o rendimento da receita.' };
  }
  const bruta = Number(body.quantidadeBrutaPreparo);
  const aprov = Number(body.quantidadeAproveitavelPreparo);
  if (!Number.isFinite(bruta) || bruta <= 0) {
    return { ok: false, error: 'Quantidade bruta deve ser um número maior que zero.' };
  }
  if (!Number.isFinite(aprov) || aprov <= 0) {
    return { ok: false, error: 'Quantidade aproveitável deve ser um número maior que zero.' };
  }
  if (aprov > bruta) {
    return { ok: false, error: 'Quantidade aproveitável deve ser menor ou igual à quantidade bruta.' };
  }
  return {
    ok: true,
    data: {
      considerarPerdaPreparo: true,
      quantidadeBrutaPreparo: bruta,
      quantidadeAproveitavelPreparo: aprov
    }
  };
}

app.get('/api/insumos', async (req, res) => {
  try {
    const insumos = await prisma.insumo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      // Resumo da receita própria: a ficha técnica usa modoRendimento/pesoPorcao
      // para oferecer o uso por unidade/porção
      include: {
        receitaProducao: {
          select: { modoRendimento: true, quantidadePorcoes: true, pesoPorcao: true }
        },
        _count: { select: { fornecedores: true } }
      }
    });
    res.json(insumos.map((i) => ({ ...insumoSaida(i), qtdFornecedores: i._count?.fornecedores ?? 0 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar insumos' });
  }
});

// Saída de insumo com unidade normalizada + rendimento/perda calculados (campo
// derivado, não armazenado). rendimento/perda ficam null quando não há perda.
function insumoSaida(insumo) {
  const base = insumoComUnidadeNormalizada(insumo);
  const r = rendimentoPreparo(insumo);
  return {
    ...base,
    rendimentoPreparoPercentual: r === null ? null : Number((r * 100).toFixed(2)),
    perdaPreparoPercentual: r === null ? null : Number(((1 - r) * 100).toFixed(2))
  };
}

app.post('/api/insumos', async (req, res) => {
  try {
    const { nome, unidade, custoUnitario, fornecedor, tipo } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    const unidadeNormalizada = normalizeUnidade(unidade);
    if (!unidadeNormalizada) {
      return res.status(400).json({ error: 'Unidade inválida. Use Kg, L ou Und.' });
    }
    if (tipo !== undefined && tipo !== null && !TIPOS_INSUMO.includes(tipo)) {
      return res.status(400).json({
        error: `tipo inválido. Tipos permitidos: ${TIPOS_INSUMO.join(', ')}`
      });
    }

    // Produção própria nasce com custo 0 (calculado depois pela receita);
    // demais tipos exigem custo informado e maior que zero.
    const tipoFinal = tipo ?? 'INGREDIENTE';
    let custoUnitarioFinal;
    if (tipoFinal === 'PRODUCAO_PROPRIA') {
      if (custoUnitario === undefined || custoUnitario === null || custoUnitario === '') {
        custoUnitarioFinal = 0;
      } else if (isNaN(Number(custoUnitario)) || Number(custoUnitario) < 0) {
        return res.status(400).json({ error: 'custoUnitario inválido' });
      } else {
        custoUnitarioFinal = Number(custoUnitario);
      }
    } else {
      if (
        custoUnitario === undefined ||
        custoUnitario === null ||
        custoUnitario === '' ||
        isNaN(Number(custoUnitario)) ||
        Number(custoUnitario) <= 0
      ) {
        return res.status(400).json({ error: 'Informe um custo unitário maior que zero.' });
      }
      custoUnitarioFinal = Number(custoUnitario);
    }

    const perda = buildPerdaPreparoData(req.body ?? {}, tipoFinal);
    if (!perda.ok) {
      return res.status(400).json({ error: perda.error });
    }

    const insumo = await prisma.insumo.create({
      data: {
        nome: nome.trim(),
        tipo: tipoFinal,
        unidade: unidadeNormalizada,
        custoUnitario: custoUnitarioFinal,
        fornecedor: fornecedor ? String(fornecedor).trim() : null,
        ativo: true,
        ...perda.data
      }
    });

    res.status(201).json(insumoSaida(insumo));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar insumo' });
  }
});

app.put('/api/insumos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.insumo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    const { nome, unidade, custoUnitario, fornecedor, ativo, tipo } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (tipo !== undefined) {
      if (!TIPOS_INSUMO.includes(tipo)) {
        return res.status(400).json({
          error: `tipo inválido. Tipos permitidos: ${TIPOS_INSUMO.join(', ')}`
        });
      }
      data.tipo = tipo;
    }
    if (unidade !== undefined) {
      const unidadeNormalizada = normalizeUnidade(unidade);
      if (!unidadeNormalizada) {
        return res.status(400).json({ error: 'Unidade inválida. Use Kg, L ou Und.' });
      }
      data.unidade = unidadeNormalizada;
    }
    if (custoUnitario !== undefined) {
      // Regra por tipo final: produção própria aceita 0 (custo vem da receita);
      // demais tipos exigem custo maior que zero. Se não enviado, preserva o atual.
      const tipoFinal = data.tipo ?? existing.tipo;
      if (tipoFinal === 'PRODUCAO_PROPRIA') {
        if (custoUnitario === null || custoUnitario === '' || isNaN(Number(custoUnitario))) {
          return res.status(400).json({ error: 'custoUnitario inválido' });
        }
        if (Number(custoUnitario) < 0) {
          return res.status(400).json({ error: 'custoUnitario deve ser maior ou igual a zero' });
        }
      } else {
        if (
          custoUnitario === null ||
          custoUnitario === '' ||
          isNaN(Number(custoUnitario)) ||
          Number(custoUnitario) <= 0
        ) {
          return res.status(400).json({ error: 'Informe um custo unitário maior que zero.' });
        }
      }
      data.custoUnitario = Number(custoUnitario);
    }
    if (fornecedor !== undefined) {
      data.fornecedor =
        fornecedor === null || fornecedor === '' ? null : String(fornecedor).trim();
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }
    // Perda no preparo: só processa quando o flag é enviado no body.
    if (req.body && req.body.considerarPerdaPreparo !== undefined) {
      const tipoFinal = data.tipo ?? existing.tipo;
      const perda = buildPerdaPreparoData(req.body, tipoFinal);
      if (!perda.ok) {
        return res.status(400).json({ error: perda.error });
      }
      Object.assign(data, perda.data);
    }

    const updated = await prisma.insumo.update({ where: { id }, data });
    res.json(insumoSaida(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar insumo' });
  }
});

app.delete('/api/insumos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.insumo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    const desativado = await prisma.insumo.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar insumo' });
  }
});

// ===== Receita de Produção Própria =====

const round4 = (n) => Number(n.toFixed(4));

// Normaliza a unidade do rendimento da receita (inclui g e ml, além das unidades de insumo)
function normalizeUnidadeRendimento(u) {
  const v = String(u ?? '').trim().toLowerCase();
  if (['g', 'gr', 'grama', 'gramas'].includes(v)) return 'g';
  if (['ml', 'mililitro', 'mililitros'].includes(v)) return 'ml';
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg';
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L';
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und';
  if (['porcoes', 'porções', 'porcao', 'porção', 'porc'].includes(v)) return 'Porções';
  return null;
}

// Converte o rendimento informado para a unidade base do insumo produzido.
// Retorna null quando a unidade do rendimento é incompatível com a do insumo.
function rendimentoBaseReceita(rendimento, unidadeRendimento, unidadeInsumoProduzido) {
  const r = Number(rendimento);
  if (!Number.isFinite(r) || r <= 0) return null;
  const ui = normalizeUnidade(unidadeInsumoProduzido);
  const ur = normalizeUnidadeRendimento(unidadeRendimento);
  if (ui === 'Kg') {
    if (ur === 'g') return r / 1000;
    if (ur === 'Kg') return r;
    return null;
  }
  if (ui === 'L') {
    if (ur === 'ml') return r / 1000;
    if (ur === 'L') return r;
    return null;
  }
  if (ui === 'Und') {
    if (ur === 'Und' || ur === 'Porções') return r;
    return null;
  }
  // unidade do insumo desconhecida (legado): usa o rendimento direto
  return r;
}

function computeReceita(receita) {
  // Mesma regra da ficha técnica: ingrediente em Kg tem quantidade informada em gramas
  const itens = receita.itens.map((item) => ({
    ...item,
    insumo: insumoComUnidadeNormalizada(item.insumo),
    unidadeQuantidadeReceita: unidadeQuantidade(item.insumo?.unidade),
    custoItem: round4(
      quantidadeBase(item.quantidade, item.insumo.unidade) * Number(item.insumo.custoUnitario)
    )
  }));
  const custoTotalReceita = round4(itens.reduce((s, i) => s + i.custoItem, 0));
  const rendimento = Number(receita.rendimento);
  // Rendimento convertido para a unidade base do insumo produzido (ex.: 3800 g → 3,8 Kg).
  // null = rendimento não informado ou unidade incompatível com o insumo.
  const rendimentoBase = rendimentoBaseReceita(
    receita.rendimento,
    receita.unidadeRendimento,
    receita.insumo?.unidade
  );
  const custoPorRendimento =
    rendimentoBase !== null && rendimentoBase > 0
      ? round4(custoTotalReceita / rendimentoBase)
      : null;
  const pesoPorcao =
    receita.pesoPorcao === null || receita.pesoPorcao === undefined
      ? null
      : Number(receita.pesoPorcao);
  const custoPorPorcao =
    pesoPorcao && pesoPorcao > 0 && custoPorRendimento !== null
      ? round4(custoPorRendimento * pesoPorcao)
      : null;
  return {
    ...receita,
    insumo: receita.insumo ? insumoComUnidadeNormalizada(receita.insumo) : receita.insumo,
    itens,
    custoTotalReceita,
    rendimentoBase: rendimentoBase === null ? null : round4(rendimentoBase),
    rendimentoIncompativel: rendimento > 0 && rendimentoBase === null,
    custoPorRendimento,
    custoPorPorcao
  };
}

async function getReceitaCompleta(insumoId) {
  const receita = await prisma.receitaProducao.findUnique({
    where: { insumoId },
    include: {
      itens: { include: { insumo: true }, orderBy: { id: 'asc' } },
      insumo: true
    }
  });
  return receita ? computeReceita(receita) : null;
}

function insumoResumo(insumo) {
  return {
    id: insumo.id,
    nome: insumo.nome,
    tipo: insumo.tipo,
    unidade: normalizeUnidade(insumo.unidade) ?? insumo.unidade,
    custoUnitario: insumo.custoUnitario
  };
}

// Fonte da verdade do custo de produção própria: recalcula a receita e, quando o
// custo é calculável (tem ingredientes E rendimento válido), sincroniza o
// custoUnitario do insumo produzido com o custo unitário da receita. NUNCA zera
// o custo por falta de dados — apenas devolve uma orientação. Mesma regra do
// antigo botão "Atualizar custo do insumo", agora aplicada automaticamente.
async function sincronizarCustoComReceita(insumoId) {
  const receita = await getReceitaCompleta(insumoId);
  let custoAtualizado = false;
  let custoMensagem = null;
  if (receita && receita.itens.length > 0 && receita.custoPorRendimento !== null) {
    await prisma.insumo.update({
      where: { id: insumoId },
      data: { custoUnitario: receita.custoPorRendimento }
    });
    custoAtualizado = true;
  } else if (receita && receita.itens.length === 0) {
    custoMensagem = 'Adicione ingredientes à receita para calcular e atualizar o custo do insumo.';
  } else if (receita && receita.rendimentoIncompativel) {
    custoMensagem =
      'A unidade do rendimento não é compatível com a unidade do insumo. Ajuste para atualizar o custo.';
  } else if (receita) {
    custoMensagem = 'Informe o rendimento da receita para atualizar o custo do insumo.';
  }
  const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } });
  const receitaFinal = custoAtualizado ? await getReceitaCompleta(insumoId) : receita;
  return { insumo: insumoResumo(insumo), receita: receitaFinal, custoAtualizado, custoMensagem };
}

// Um insumo de produção própria carrega dentro dele o custo dos ingredientes, e
// esse custo fica GRAVADO (é o que as fichas técnicas e os combos leem). Então,
// sempre que o custo de um ingrediente muda — edição na tela de Insumos ou
// cotação de fornecedor virando custo —, toda receita que o usa precisa ser
// refeita na hora.
// Não lança: a alteração de custo já foi gravada e não deve ser derrubada por
// uma falha no efeito colateral; o erro vai para o log e volta sinalizado.
async function propagarCustoParaConsumidores(insumoId) {
  try {
    // Quem consome quem, subindo nível a nível a partir do insumo alterado.
    const consumidoresPorInsumo = new Map();
    const visitados = new Set([insumoId]);
    let fronteira = [insumoId];
    // Teto de segurança: cadastro saudável não passa de 2-3 níveis.
    for (let nivel = 0; nivel < 20 && fronteira.length > 0; nivel += 1) {
      const itens = await prisma.receitaProducaoItem.findMany({
        where: { insumoId: { in: fronteira } },
        select: { insumoId: true, receita: { select: { insumoId: true } } }
      });
      const proxima = [];
      for (const item of itens) {
        const consumidorId = item.receita?.insumoId;
        // Receita que se usa como próprio ingrediente = cadastro inválido; ignora.
        if (!consumidorId || consumidorId === item.insumoId) continue;
        const lista = consumidoresPorInsumo.get(item.insumoId) ?? [];
        if (!lista.includes(consumidorId)) lista.push(consumidorId);
        consumidoresPorInsumo.set(item.insumoId, lista);
        if (!visitados.has(consumidorId)) {
          visitados.add(consumidorId);
          proxima.push(consumidorId);
        }
      }
      fronteira = proxima;
    }

    const recalculados = [];
    for (const id of ordemDeRecalculo(insumoId, consumidoresPorInsumo)) {
      const { custoAtualizado } = await sincronizarCustoComReceita(id);
      if (custoAtualizado) recalculados.push(id);
    }
    return { recalculados, erro: false };
  } catch (err) {
    console.error('[custo] falha ao propagar custo do insumo', insumoId, err);
    return { recalculados: [], erro: true };
  }
}

// Editar a receita muda o custo do insumo produzido — e ele mesmo pode ser
// ingrediente de outra receita. Recalcula este e espalha para os de cima.
async function sincronizarCustoEPropagar(insumoId) {
  const resultado = await sincronizarCustoComReceita(insumoId);
  if (resultado.custoAtualizado) await propagarCustoParaConsumidores(insumoId);
  return resultado;
}

// ===================== Fornecedores (Produtos › Fornecedores) =====================
// Cadastro de fornecedor + vínculo com insumos + histórico de cotações de preço.
// Tudo roda dentro do tenantStore das rotas /api/* — o prisma injeta empresaId
// automaticamente (create/find/update). Não usar nested create (o filho não herda
// empresaId): crio o pai e depois o filho referenciando por id.
// Portado do H360 (migration 20260812120000 + 20260812140000).

// Tendência de preço: compara as 2 cotações mais recentes (recebidas por data desc).
function calcTendenciaPreco(cotacoes) {
  if (!Array.isArray(cotacoes) || cotacoes.length < 2) return null;
  const atual = Number(cotacoes[0].preco);
  const anterior = Number(cotacoes[1].preco);
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  const pct = ((atual - anterior) / anterior) * 100;
  return { direcao: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct: Number(pct.toFixed(1)) };
}

app.get('/api/fornecedores', async (req, res) => {
  try {
    const fornecedores = await prisma.fornecedor.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { insumos: true } } },
    });
    res.json(fornecedores.map((f) => ({
      id: f.id, nome: f.nome, whatsapp: f.whatsapp, telefone: f.telefone, email: f.email,
      website: f.website, endereco: f.endereco, observacao: f.observacao,
      qtdInsumos: f._count.insumos,
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao listar fornecedores' }); }
});

app.get('/api/fornecedores/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    const f = await prisma.fornecedor.findUnique({
      where: { id },
      include: {
        insumos: {
          include: {
            insumo: { select: { id: true, nome: true, unidade: true } },
            cotacoes: { orderBy: { data: 'desc' }, take: 2 },
          },
          orderBy: { atualizadoEm: 'desc' },
        },
      },
    });
    if (!f) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json({
      id: f.id, nome: f.nome, whatsapp: f.whatsapp, telefone: f.telefone, email: f.email,
      website: f.website, endereco: f.endereco, observacao: f.observacao,
      insumos: f.insumos.map((fi) => ({
        fornecedorInsumoId: fi.id,
        insumoId: fi.insumo.id, insumoNome: fi.insumo.nome, unidade: fi.insumo.unidade,
        precoAtual: fi.precoAtual, precoAtualEm: fi.precoAtualEm,
        tendencia: calcTendenciaPreco(fi.cotacoes),
      })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao carregar fornecedor' }); }
});

// Normaliza um campo de contato (string vazia/só espaço → null).
function strOuNull(v) { return v == null || String(v).trim() === '' ? null : String(v).trim(); }
const CONTATOS_FORNECEDOR = ['whatsapp', 'telefone', 'email', 'website', 'endereco'];

app.post('/api/fornecedores', async (req, res) => {
  try {
    const b = req.body ?? {};
    if (typeof b.nome !== 'string' || b.nome.trim() === '') return res.status(400).json({ error: 'nome é obrigatório' });
    const f = await prisma.fornecedor.create({
      data: {
        nome: b.nome.trim(),
        whatsapp: strOuNull(b.whatsapp), telefone: strOuNull(b.telefone), email: strOuNull(b.email),
        website: strOuNull(b.website), endereco: strOuNull(b.endereco), observacao: strOuNull(b.observacao),
      },
    });
    res.status(201).json(f);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar fornecedor' }); }
});

app.put('/api/fornecedores/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    const existing = await prisma.fornecedor.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    const b = req.body ?? {};
    const data = {};
    if (b.nome !== undefined) {
      if (typeof b.nome !== 'string' || b.nome.trim() === '') return res.status(400).json({ error: 'nome inválido' });
      data.nome = b.nome.trim();
    }
    for (const campo of [...CONTATOS_FORNECEDOR, 'observacao']) {
      if (b[campo] !== undefined) data[campo] = strOuNull(b[campo]);
    }
    const f = await prisma.fornecedor.update({ where: { id }, data });
    res.json(f);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao atualizar fornecedor' }); }
});

app.delete('/api/fornecedores/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    const existing = await prisma.fornecedor.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    // Soft delete: preserva o histórico de cotações; some das listagens.
    await prisma.fornecedor.update({ where: { id }, data: { ativo: false } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao excluir fornecedor' }); }
});

// Fornecedores de um insumo (com tendência e destaque do mais barato)
app.get('/api/insumos/:id/fornecedores', async (req, res) => {
  try {
    const insumoId = Number(req.params.id);
    if (!Number.isInteger(insumoId) || insumoId <= 0) return res.status(400).json({ error: 'id inválido' });
    const vinculos = await prisma.fornecedorInsumo.findMany({
      where: { insumoId },
      include: {
        fornecedor: { select: { id: true, nome: true, whatsapp: true, ativo: true } },
        cotacoes: { orderBy: { data: 'desc' }, take: 2 },
      },
      orderBy: { precoAtual: 'asc' },
    });
    const ativos = vinculos.filter((v) => v.fornecedor.ativo);
    const precos = ativos.map((v) => (v.precoAtual == null ? null : Number(v.precoAtual))).filter((p) => p != null);
    const menor = precos.length ? Math.min(...precos) : null;
    res.json(ativos.map((v) => ({
      fornecedorInsumoId: v.id,
      fornecedorId: v.fornecedor.id, fornecedorNome: v.fornecedor.nome, whatsapp: v.fornecedor.whatsapp,
      precoAtual: v.precoAtual, precoAtualEm: v.precoAtualEm,
      tendencia: calcTendenciaPreco(v.cotacoes),
      maisBarato: menor != null && v.precoAtual != null && Number(v.precoAtual) === menor,
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao listar fornecedores do insumo' }); }
});

// Vincula um fornecedor (existente OU novo) a um insumo; preço/cotação e "usar como
// custo" são opcionais. Idempotente no vínculo.
app.post('/api/insumos/:id/fornecedores', async (req, res) => {
  try {
    const insumoId = Number(req.params.id);
    if (!Number.isInteger(insumoId) || insumoId <= 0) return res.status(400).json({ error: 'id inválido' });
    const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) return res.status(404).json({ error: 'Insumo não encontrado' });

    let { fornecedorId, novoFornecedor, preco, observacao, usarComoCusto } = req.body ?? {};

    if (!fornecedorId) {
      const nome = novoFornecedor?.nome;
      if (typeof nome !== 'string' || nome.trim() === '') return res.status(400).json({ error: 'Informe um fornecedor.' });
      const novo = await prisma.fornecedor.create({
        data: {
          nome: nome.trim(),
          whatsapp: strOuNull(novoFornecedor?.whatsapp), telefone: strOuNull(novoFornecedor?.telefone),
          email: strOuNull(novoFornecedor?.email), website: strOuNull(novoFornecedor?.website),
          endereco: strOuNull(novoFornecedor?.endereco),
        },
      });
      fornecedorId = novo.id;
    } else {
      fornecedorId = Number(fornecedorId);
      const forn = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
      if (!forn) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    let vinculo = await prisma.fornecedorInsumo.findUnique({ where: { fornecedorId_insumoId: { fornecedorId, insumoId } } });
    if (!vinculo) vinculo = await prisma.fornecedorInsumo.create({ data: { fornecedorId, insumoId } });

    const precoNum = preco == null || preco === '' ? null : Number(preco);
    if (precoNum != null) {
      if (!Number.isFinite(precoNum) || precoNum < 0) return res.status(400).json({ error: 'preço inválido' });
      await prisma.fornecedorInsumoCotacao.create({ data: { fornecedorInsumoId: vinculo.id, preco: precoNum, observacao: observacao ? String(observacao).trim() : null } });
      await prisma.fornecedorInsumo.update({ where: { id: vinculo.id }, data: { precoAtual: precoNum, precoAtualEm: new Date() } });
      if (usarComoCusto) {
        await prisma.insumo.update({ where: { id: insumoId }, data: { custoUnitario: precoNum, custoFornecedorId: fornecedorId } });
        await propagarCustoParaConsumidores(insumoId);
      }
    }
    res.status(201).json({ ok: true, fornecedorInsumoId: vinculo.id, fornecedorId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao vincular fornecedor' }); }
});

// Registra uma nova cotação de preço para um vínculo fornecedor×insumo
app.post('/api/fornecedor-insumo/:id/cotacao', async (req, res) => {
  try {
    const fiId = Number(req.params.id);
    if (!Number.isInteger(fiId) || fiId <= 0) return res.status(400).json({ error: 'id inválido' });
    const vinculo = await prisma.fornecedorInsumo.findUnique({ where: { id: fiId } });
    if (!vinculo) return res.status(404).json({ error: 'Vínculo não encontrado' });
    const { preco, data, observacao, usarComoCusto } = req.body ?? {};
    const precoNum = Number(preco);
    if (!Number.isFinite(precoNum) || precoNum < 0) return res.status(400).json({ error: 'preço inválido' });
    const dataCot = data ? new Date(data) : new Date();
    await prisma.fornecedorInsumoCotacao.create({ data: { fornecedorInsumoId: fiId, preco: precoNum, data: dataCot, observacao: observacao ? String(observacao).trim() : null } });
    // precoAtual = cotação mais recente por data (a nova pode ser retroativa)
    const maisRecente = await prisma.fornecedorInsumoCotacao.findFirst({ where: { fornecedorInsumoId: fiId }, orderBy: { data: 'desc' } });
    await prisma.fornecedorInsumo.update({ where: { id: fiId }, data: { precoAtual: maisRecente.preco, precoAtualEm: maisRecente.data } });
    if (usarComoCusto) {
      await prisma.insumo.update({ where: { id: vinculo.insumoId }, data: { custoUnitario: precoNum, custoFornecedorId: vinculo.fornecedorId } });
      await propagarCustoParaConsumidores(vinculo.insumoId);
    }
    res.status(201).json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao registrar cotação' }); }
});

// Histórico de cotações de um vínculo (para a curva de evolução)
app.get('/api/fornecedor-insumo/:id/cotacoes', async (req, res) => {
  try {
    const fiId = Number(req.params.id);
    if (!Number.isInteger(fiId) || fiId <= 0) return res.status(400).json({ error: 'id inválido' });
    const cotacoes = await prisma.fornecedorInsumoCotacao.findMany({ where: { fornecedorInsumoId: fiId }, orderBy: { data: 'desc' } });
    res.json(cotacoes);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao listar cotações' }); }
});

// Desvincula um fornecedor de um insumo (remove o vínculo e suas cotações)
app.delete('/api/fornecedor-insumo/:id', async (req, res) => {
  try {
    const fiId = Number(req.params.id);
    if (!Number.isInteger(fiId) || fiId <= 0) return res.status(400).json({ error: 'id inválido' });
    const vinculo = await prisma.fornecedorInsumo.findUnique({ where: { id: fiId } });
    if (!vinculo) return res.status(404).json({ error: 'Vínculo não encontrado' });
    await prisma.fornecedorInsumo.delete({ where: { id: fiId } });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao remover vínculo' }); }
});

app.get('/api/insumos/:id/receita', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }
    const receita = await getReceitaCompleta(id);
    res.json({ insumo: insumoResumo(insumo), receita });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar receita' });
  }
});

app.post('/api/insumos/:id/receita', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }
    if (insumo.tipo !== 'PRODUCAO_PROPRIA') {
      return res.status(400).json({
        error: 'Receita só pode ser cadastrada para insumos do tipo PRODUCAO_PROPRIA'
      });
    }

    const {
      rendimento,
      unidadeRendimento,
      modoRendimento,
      quantidadePorcoes,
      pesoPorcao,
      unidadePorcao,
      observacoes
    } = req.body ?? {};

    // Rendimento agora é opcional: 0 = ainda não informado. Isso permite criar a
    // receita e adicionar ingredientes antes de saber o rendimento final; o custo
    // unitário calculado só existe quando rendimento > 0 (computeReceita já trata).
    let rendimentoFinal = 0;
    if (rendimento !== undefined && rendimento !== null && rendimento !== '') {
      if (isNaN(Number(rendimento)) || Number(rendimento) < 0) {
        return res.status(400).json({ error: 'rendimento deve ser numérico e maior ou igual a zero' });
      }
      rendimentoFinal = Number(rendimento);
    }
    let unidadeRendimentoFinal =
      typeof unidadeRendimento === 'string' ? unidadeRendimento.trim() : '';
    if (pesoPorcao !== undefined && pesoPorcao !== null && pesoPorcao !== '') {
      if (isNaN(Number(pesoPorcao)) || Number(pesoPorcao) <= 0) {
        return res.status(400).json({ error: 'pesoPorcao deve ser numérico e maior que zero' });
      }
    }
    const pesoPorcaoFinal =
      pesoPorcao === undefined || pesoPorcao === null || pesoPorcao === ''
        ? null
        : Number(pesoPorcao);

    // Modo de rendimento: TOTAL (informa o total direto, comportamento original)
    // ou PORCOES (informa quantidade × tamanho e o total é calculado aqui).
    // Receitas antigas não têm o campo e seguem como TOTAL.
    const modoFinal = modoRendimento === 'PORCOES' ? 'PORCOES' : 'TOTAL';
    let quantidadePorcoesFinal = null;
    if (quantidadePorcoes !== undefined && quantidadePorcoes !== null && quantidadePorcoes !== '') {
      if (isNaN(Number(quantidadePorcoes)) || Number(quantidadePorcoes) <= 0) {
        return res.status(400).json({ error: 'quantidadePorcoes deve ser numérica e maior que zero' });
      }
      quantidadePorcoesFinal = Number(quantidadePorcoes);
    }

    let unidadePorcaoFinal =
      unidadePorcao === undefined || unidadePorcao === null || String(unidadePorcao).trim() === ''
        ? null
        : String(unidadePorcao).trim();

    if (modoFinal === 'PORCOES') {
      if (quantidadePorcoesFinal === null) {
        return res.status(400).json({
          error: 'quantidadePorcoes é obrigatória no modo de rendimento por porções'
        });
      }
      const ui = normalizeUnidade(insumo.unidade);
      if (ui === 'Kg' || ui === 'L') {
        if (pesoPorcaoFinal === null) {
          return res.status(400).json({
            error:
              'pesoPorcao (tamanho de cada unidade/porção) é obrigatório no modo por porções para insumo em ' +
              ui
          });
        }
        rendimentoFinal = quantidadePorcoesFinal * pesoPorcaoFinal;
        unidadeRendimentoFinal = ui === 'Kg' ? 'g' : 'ml';
        unidadePorcaoFinal = ui === 'Kg' ? 'g' : 'ml';
      } else {
        // Und (ou legado): cada porção é 1 unidade; tamanho é apenas informativo
        rendimentoFinal = quantidadePorcoesFinal;
        unidadeRendimentoFinal = 'Und';
      }
    }

    if (rendimentoFinal > 0 && unidadeRendimentoFinal === '') {
      return res.status(400).json({
        error: 'unidadeRendimento é obrigatória quando o rendimento é informado'
      });
    }

    const data = {
      rendimento: rendimentoFinal,
      unidadeRendimento: unidadeRendimentoFinal,
      modoRendimento: modoFinal,
      quantidadePorcoes: modoFinal === 'PORCOES' ? quantidadePorcoesFinal : null,
      pesoPorcao: pesoPorcaoFinal,
      unidadePorcao: unidadePorcaoFinal,
      observacoes:
        observacoes === undefined || observacoes === null || String(observacoes).trim() === ''
          ? null
          : String(observacoes).trim()
    };

    await prisma.receitaProducao.upsert({
      where: { insumoId: id },
      create: { insumoId: id, ...data },
      update: data
    });

    // Atualiza automaticamente o custo do insumo produzido a partir da receita
    res.json(await sincronizarCustoEPropagar(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao salvar receita' });
  }
});

app.post('/api/insumos/:id/receita/itens', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const receita = await prisma.receitaProducao.findUnique({ where: { insumoId: id } });
    if (!receita) {
      return res.status(400).json({
        error: 'Cadastre primeiro os dados da receita (rendimento) antes de adicionar ingredientes'
      });
    }

    const { insumoId, quantidade } = req.body ?? {};
    const ingredienteId = Number(insumoId);
    if (!Number.isInteger(ingredienteId) || ingredienteId <= 0) {
      return res.status(400).json({ error: 'insumoId inválido' });
    }
    if (ingredienteId === id) {
      return res.status(400).json({
        error: 'Uma receita não pode usar o próprio insumo como ingrediente'
      });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    const ingrediente = await prisma.insumo.findUnique({ where: { id: ingredienteId } });
    if (!ingrediente || !ingrediente.ativo) {
      return res.status(404).json({ error: 'Insumo ingrediente não encontrado ou inativo' });
    }
    if (ingrediente.tipo === 'PRODUCAO_PROPRIA') {
      return res.status(400).json({
        error:
          'Nesta versão, uma receita não pode usar outro insumo de produção própria como ingrediente'
      });
    }

    const existente = await prisma.receitaProducaoItem.findUnique({
      where: { receitaId_insumoId: { receitaId: receita.id, insumoId: ingredienteId } }
    });
    if (existente) {
      return res.status(409).json({
        error: 'Esse insumo já está na receita. Edite a quantidade do item existente.'
      });
    }

    await prisma.receitaProducaoItem.create({
      data: {
        receitaId: receita.id,
        insumoId: ingredienteId,
        quantidade: Number(quantidade)
      }
    });

    res.status(201).json(await sincronizarCustoEPropagar(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao adicionar ingrediente' });
  }
});

app.put('/api/receitas-producao/itens/:itemId', async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'itemId inválido' });
    }
    const item = await prisma.receitaProducaoItem.findUnique({
      where: { id: itemId },
      include: { receita: true }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item da receita não encontrado' });
    }

    const { quantidade } = req.body ?? {};
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    await prisma.receitaProducaoItem.update({
      where: { id: itemId },
      data: { quantidade: Number(quantidade) }
    });

    res.json(await sincronizarCustoEPropagar(item.receita.insumoId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar ingrediente' });
  }
});

app.delete('/api/receitas-producao/itens/:itemId', async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'itemId inválido' });
    }
    const item = await prisma.receitaProducaoItem.findUnique({
      where: { id: itemId },
      include: { receita: true }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item da receita não encontrado' });
    }

    await prisma.receitaProducaoItem.delete({ where: { id: itemId } });

    res.json(await sincronizarCustoEPropagar(item.receita.insumoId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover ingrediente' });
  }
});

app.post('/api/insumos/:id/receita/atualizar-custo', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }
    if (insumo.tipo !== 'PRODUCAO_PROPRIA') {
      return res.status(400).json({
        error: 'Apenas insumos do tipo PRODUCAO_PROPRIA podem ter custo calculado por receita'
      });
    }

    const receita = await getReceitaCompleta(id);
    if (!receita) {
      return res.status(400).json({ error: 'Este insumo ainda não possui receita cadastrada' });
    }
    if (receita.itens.length === 0) {
      return res.status(400).json({
        error: 'A receita não possui ingredientes. Adicione ingredientes antes de atualizar o custo.'
      });
    }
    if (receita.custoPorRendimento === null) {
      return res.status(400).json({
        error: receita.rendimentoIncompativel
          ? 'A unidade do rendimento não é compatível com a unidade cadastrada para este insumo. Ajuste a unidade do rendimento ou edite a unidade do insumo produzido.'
          : 'Informe o rendimento da receita para calcular o custo do insumo.'
      });
    }

    const atualizado = await prisma.insumo.update({
      where: { id },
      data: { custoUnitario: receita.custoPorRendimento }
    });

    const receitaRecalculada = await getReceitaCompleta(id);
    res.json({ insumo: atualizado, receita: receitaRecalculada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar custo do insumo' });
  }
});

// ===== Produtos =====

app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(produtos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar produtos' });
  }
});

// Read-only: todos os produtos ativos com ficha técnica (enriquecida), itens de
// combo e custos adicionais do combo, em uma única chamada. Usado pela Análise
// de Vendas (V3) para estimar consumo de insumos. Reusa o cálculo existente
// (computeFichaTotals/comboInsumoOut); não altera nenhuma regra de negócio.
app.get('/api/produtos-detalhados', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    const [fichaItensRaw, comboItensRaw, comboInsumosRaw] = await Promise.all([
      prisma.fichaTecnicaItem.findMany({ include: FICHA_INSUMO_INCLUDE }),
      prisma.comboItem.findMany(),
      prisma.comboInsumo.findMany({ include: COMBO_INSUMO_INCLUDE })
    ]);

    const fichaPorProduto = new Map();
    for (const it of fichaItensRaw) {
      if (!fichaPorProduto.has(it.produtoId)) fichaPorProduto.set(it.produtoId, []);
      fichaPorProduto.get(it.produtoId).push(it);
    }
    const comboItensPorCombo = new Map();
    for (const it of comboItensRaw) {
      if (!comboItensPorCombo.has(it.comboId)) comboItensPorCombo.set(it.comboId, []);
      comboItensPorCombo.get(it.comboId).push(it);
    }
    const comboInsumosPorCombo = new Map();
    for (const it of comboInsumosRaw) {
      if (!comboInsumosPorCombo.has(it.comboId)) comboInsumosPorCombo.set(it.comboId, []);
      comboInsumosPorCombo.get(it.comboId).push(it);
    }

    const round4 = (n) => Number(Number(n).toFixed(4));
    const out = produtos.map((p) => {
      const tipo = p.tipoProduto ?? 'PRODUTO';
      // Ficha técnica enriquecida: custoAplicado é o custo (rateado) por 1 produto
      const fichaTotais = computeFichaTotals(fichaPorProduto.get(p.id) ?? []);
      const ficha = fichaTotais.itens.map((it) => {
        const rend = rendimentoPreparo(it.insumo);
        return {
          insumoId: it.insumoId,
          nome: it.insumo?.nome ?? '—',
          unidade: it.insumo?.unidade ?? null,
          unidadeQuantidade: it.unidadeQuantidadeFicha ?? null,
          quantidade: round4(it.quantidade),
          custoUnitario:
            it.insumo?.custoUnitario === null || it.insumo?.custoUnitario === undefined
              ? null
              : Number(it.insumo.custoUnitario),
          custoAplicado: round4(it.custoAplicado),
          tipoUso: it.tipoUso,
          // Perda no preparo: custoAplicado já considera a necessidade bruta.
          // rendimentoPreparo (fração) permite ao consumo estimar a qtd bruta.
          considerarPerdaPreparo: rend !== null,
          rendimentoPreparo: rend
        };
      });
      return {
        id: p.id,
        nome: p.nome,
        tipoProduto: tipo,
        sobremesaModo: p.sobremesaModo ?? null,
        precoVenda: p.precoVenda === null || p.precoVenda === undefined ? null : Number(p.precoVenda),
        custoDireto: p.custoDireto === null || p.custoDireto === undefined ? null : Number(p.custoDireto),
        produtoAncora: p.produtoAncora,
        produtoIsca: p.produtoIsca,
        incluirAnaliseEstrategica: p.incluirAnaliseEstrategica,
        tipoBebidaAnalise: p.tipoBebidaAnalise,
        ficha,
        comboItens:
          tipo === 'COMBO'
            ? (comboItensPorCombo.get(p.id) ?? []).map((c) => ({
                produtoId: c.produtoId,
                quantidade: Number(c.quantidade),
                incluirEmbalagemIndividual: !!c.incluirEmbalagemIndividual
              }))
            : [],
        comboInsumos:
          tipo === 'COMBO'
            ? (comboInsumosPorCombo.get(p.id) ?? []).map(comboInsumoOut)
            : []
      };
    });

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar produtos detalhados' });
  }
});

// TIPOS_PRODUTO e MODOS_SOBREMESA vêm de ./produtos/custeio.js (regra única de custeio).
const TIPOS_BEBIDA_ANALISE = ['COMMODITY', 'AUTORAL'];

// Defaults estratégicos por tipo (V0 da Inteligência do cardápio): bebidas
// nascem fora do ranking estratégico e classificadas como COMMODITY; produtos
// e combos entram no ranking por padrão. Campos do body sobrescrevem o default.
function camposEstrategicosCreate(tipoFinal, body, sobremesaModo = null) {
  const ancora = body.produtoAncora === true;
  // Produto isca: aplicável a produto/combo (oculto para bebida)
  const isca = body.produtoIsca === true;
  let incluir;
  if (typeof body.incluirAnaliseEstrategica === 'boolean') {
    incluir = body.incluirAnaliseEstrategica;
  } else {
    // Revenda (bebida ou sobremesa comprada pronta) nasce fora do ranking estratégico.
    incluir = usaCustoDireto({ tipoProduto: tipoFinal, sobremesaModo }) ? false : true;
  }
  let tipoBebida = null;
  if (tipoFinal === 'BEBIDA') {
    if (body.tipoBebidaAnalise === undefined || body.tipoBebidaAnalise === null || body.tipoBebidaAnalise === '') {
      tipoBebida = 'COMMODITY';
    } else {
      tipoBebida = body.tipoBebidaAnalise;
    }
  }
  return {
    produtoAncora: ancora,
    produtoIsca: isca,
    incluirAnaliseEstrategica: incluir,
    tipoBebidaAnalise: tipoBebida
  };
}

/* Modo de custeio da sobremesa. Só SOBREMESA carrega o campo; os demais ficam null.

   Devolve o símbolo de inválido em vez de lançar porque a rota precisa responder 400
   com a mensagem certa — e um valor fora do catálogo é erro do cliente MESMO em um
   tipo que não usa o campo: engolir calado esconderia um bug de integração. */
const SOBREMESA_MODO_INVALIDO = Symbol('sobremesaModoInvalido');
function resolverModoSobremesa(tipo, valor) {
  const informado = valor !== undefined && valor !== null && valor !== '';
  if (informado && !MODOS_SOBREMESA.includes(valor)) return SOBREMESA_MODO_INVALIDO;
  if (tipo !== 'SOBREMESA') return null;
  return informado ? valor : MODO_SOBREMESA_PADRAO;
}

app.post('/api/produtos', async (req, res) => {
  try {
    const { nome, descricao, precoVenda, tipoProduto, custoDireto } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (precoVenda === undefined || precoVenda === null || isNaN(Number(precoVenda))) {
      return res.status(400).json({ error: 'precoVenda é obrigatório e deve ser numérico' });
    }
    if (Number(precoVenda) < 0) {
      return res.status(400).json({ error: 'precoVenda deve ser maior ou igual a zero' });
    }
    const tipoFinal = tipoProduto === undefined || tipoProduto === null ? 'PRODUTO' : tipoProduto;
    if (!TIPOS_PRODUTO.includes(tipoFinal)) {
      return res.status(400).json({ error: `tipoProduto deve ser ${TIPOS_PRODUTO.join(', ')}` });
    }
    const modoSobremesaFinal = resolverModoSobremesa(tipoFinal, (req.body ?? {}).sobremesaModo);
    if (modoSobremesaFinal === SOBREMESA_MODO_INVALIDO) {
      return res.status(400).json({ error: `sobremesaModo deve ser ${MODOS_SOBREMESA.join(' ou ')}` });
    }
    if (custoDireto !== undefined && custoDireto !== null && custoDireto !== '') {
      if (isNaN(Number(custoDireto)) || Number(custoDireto) < 0) {
        return res.status(400).json({ error: 'custoDireto deve ser numérico e maior ou igual a zero' });
      }
    }
    const body = req.body ?? {};
    if (
      tipoFinal === 'BEBIDA' &&
      body.tipoBebidaAnalise !== undefined &&
      body.tipoBebidaAnalise !== null &&
      body.tipoBebidaAnalise !== '' &&
      !TIPOS_BEBIDA_ANALISE.includes(body.tipoBebidaAnalise)
    ) {
      return res.status(400).json({ error: 'tipoBebidaAnalise deve ser COMMODITY ou AUTORAL' });
    }

    const produto = await prisma.produto.create({
      data: {
        nome: nome.trim(),
        descricao: descricao ? String(descricao).trim() : null,
        precoVenda: Number(precoVenda),
        tipoProduto: tipoFinal,
        sobremesaModo: modoSobremesaFinal,
        custoDireto:
          custoDireto === undefined || custoDireto === null || custoDireto === ''
            ? null
            : Number(custoDireto),
        ativo: true,
        ...camposEstrategicosCreate(tipoFinal, body, modoSobremesaFinal)
      }
    });

    res.status(201).json(produto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar produto' });
  }
});

app.put('/api/produtos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.produto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const {
      nome, descricao, precoVenda, ativo, tipoProduto, custoDireto, sobremesaModo,
      produtoAncora, produtoIsca, incluirAnaliseEstrategica, tipoBebidaAnalise
    } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (tipoProduto !== undefined) {
      if (!TIPOS_PRODUTO.includes(tipoProduto)) {
        return res.status(400).json({ error: `tipoProduto deve ser ${TIPOS_PRODUTO.join(', ')}` });
      }
      data.tipoProduto = tipoProduto;
    }
    if (sobremesaModo !== undefined) {
      if (sobremesaModo === null || sobremesaModo === '') {
        data.sobremesaModo = null;
      } else if (!MODOS_SOBREMESA.includes(sobremesaModo)) {
        return res.status(400).json({ error: `sobremesaModo deve ser ${MODOS_SOBREMESA.join(' ou ')}` });
      } else {
        data.sobremesaModo = sobremesaModo;
      }
    }
    if (custoDireto !== undefined) {
      if (custoDireto === null || custoDireto === '') {
        data.custoDireto = null;
      } else if (isNaN(Number(custoDireto)) || Number(custoDireto) < 0) {
        return res.status(400).json({ error: 'custoDireto deve ser numérico e maior ou igual a zero' });
      } else {
        data.custoDireto = Number(custoDireto);
      }
    }
    if (descricao !== undefined) {
      data.descricao =
        descricao === null || descricao === '' ? null : String(descricao).trim();
    }
    if (precoVenda !== undefined) {
      if (precoVenda === null || isNaN(Number(precoVenda))) {
        return res.status(400).json({ error: 'precoVenda inválido' });
      }
      if (Number(precoVenda) < 0) {
        return res.status(400).json({ error: 'precoVenda deve ser maior ou igual a zero' });
      }
      data.precoVenda = Number(precoVenda);
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }
    if (produtoAncora !== undefined) {
      if (typeof produtoAncora !== 'boolean') {
        return res.status(400).json({ error: 'produtoAncora inválido' });
      }
      data.produtoAncora = produtoAncora;
    }
    if (produtoIsca !== undefined) {
      if (typeof produtoIsca !== 'boolean') {
        return res.status(400).json({ error: 'produtoIsca inválido' });
      }
      data.produtoIsca = produtoIsca;
    }
    if (incluirAnaliseEstrategica !== undefined) {
      if (typeof incluirAnaliseEstrategica !== 'boolean') {
        return res.status(400).json({ error: 'incluirAnaliseEstrategica inválido' });
      }
      data.incluirAnaliseEstrategica = incluirAnaliseEstrategica;
    }
    if (tipoBebidaAnalise !== undefined) {
      if (tipoBebidaAnalise === null || tipoBebidaAnalise === '') {
        data.tipoBebidaAnalise = null;
      } else if (!TIPOS_BEBIDA_ANALISE.includes(tipoBebidaAnalise)) {
        return res.status(400).json({ error: 'tipoBebidaAnalise deve ser COMMODITY ou AUTORAL' });
      } else {
        data.tipoBebidaAnalise = tipoBebidaAnalise;
      }
    }

    /* O modo só existe em sobremesa: mudou de tipo, o campo acompanha — senão um
       produto comum ficaria com "modo de sobremesa" pendurado.

       ⚠️ Mas nunca REBAIXAR para o padrão: um PUT parcial (só o tipo, sem o modo)
       numa sobremesa de revenda a jogaria em FICHA, o custo de compra pararia de
       valer e ela passaria a custar R$ 0,00 dentro dos combos, calada. */
    const tipoEfetivo = data.tipoProduto ?? existing.tipoProduto ?? 'PRODUTO';
    if (tipoEfetivo !== 'SOBREMESA') {
      if (data.tipoProduto !== undefined) data.sobremesaModo = null;
    } else if (data.sobremesaModo === undefined || data.sobremesaModo === null) {
      data.sobremesaModo = existing.sobremesaModo ?? MODO_SOBREMESA_PADRAO;
    }

    const updated = await prisma.produto.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar produto' });
  }
});

app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.produto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const desativado = await prisma.produto.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar produto' });
  }
});

// Duplica produto/bebida/combo: novo registro "(cópia)" nascendo ATIVO.
// PRODUTO copia a ficha técnica (ficha independente da original); COMBO copia
// a composição apontando para os mesmos produtos/bebidas (sem duplicá-los).
app.post('/api/produtos/:id/duplicar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const original = await prisma.produto.findUnique({
      where: { id },
      include: { fichaTecnica: true, comboItens: true, comboInsumos: true }
    });
    if (!original || !original.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const tipo = original.tipoProduto ?? 'PRODUTO';

    const novo = await prisma.$transaction(async (tx) => {
      const criado = await tx.produto.create({
        data: {
          nome: `${original.nome} (cópia)`,
          descricao: original.descricao,
          precoVenda: original.precoVenda,
          tipoProduto: tipo,
          sobremesaModo: original.sobremesaModo,
          custoDireto: original.custoDireto,
          ativo: true,
          // Preserva a configuração estratégica do original
          produtoAncora: original.produtoAncora,
          produtoIsca: original.produtoIsca,
          incluirAnaliseEstrategica: original.incluirAnaliseEstrategica,
          tipoBebidaAnalise: original.tipoBebidaAnalise
        }
      });

      if (usaFichaTecnica(original) && original.fichaTecnica.length > 0) {
        await tx.fichaTecnicaItem.createMany({
          data: original.fichaTecnica.map((item) => ({
            produtoId: criado.id,
            insumoId: item.insumoId,
            quantidade: item.quantidade,
            modoUsoQuantidade: item.modoUsoQuantidade,
            tipoUso: item.tipoUso,
            formaRateio: item.formaRateio,
            quantidadeAtendida: item.quantidadeAtendida,
            aplicarMargem: item.aplicarMargem
          }))
        });
      }

      if (tipo === 'COMBO' && original.comboItens.length > 0) {
        await tx.comboItem.createMany({
          data: original.comboItens.map((item) => ({
            comboId: criado.id,
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            // Preserva a configuração de embalagem individual de cada item
            incluirEmbalagemIndividual: item.incluirEmbalagemIndividual
          }))
        });
      }

      // Insumos adicionais do combo (box, sacola...) — cópia independente
      if (tipo === 'COMBO' && original.comboInsumos.length > 0) {
        await tx.comboInsumo.createMany({
          data: original.comboInsumos.map((ci) => ({
            comboId: criado.id,
            insumoId: ci.insumoId,
            quantidade: ci.quantidade,
            modoUsoQuantidade: ci.modoUsoQuantidade
          }))
        });
      }

      return criado;
    });

    res.status(201).json(novo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao duplicar produto' });
  }
});

// ===== Itens de Combo =====
// Combo é composto por produtos/bebidas prontos (nunca insumos, nunca outro combo)

const COMBO_ITEM_INCLUDE = {
  produto: { include: { fichaTecnica: { include: { insumo: { include: { receitaProducao: true } } } } } }
};
// Insumos adicionais do combo: insumo + receita própria (mesma base da ficha)
const COMBO_INSUMO_INCLUDE = { insumo: { include: { receitaProducao: true } } };

// Custo da embalagem individual de um produto (itens da ficha com tipoUso=EMBALAGEM).
// Usado para descontar do custo do produto quando ele entra num combo.
function custoEmbalagemFicha(fichaTecnica) {
  const totals = computeFichaTotals(fichaTecnica ?? []);
  return totals.itens
    .filter((i) => i.tipoUso === 'EMBALAGEM')
    .reduce((s, i) => s + i.custoAplicado, 0);
}

// Custo unitário de um item filho do combo.
// Revenda (bebida/sobremesa comprada pronta): custo direto de compra (0 quando não
// informado) — incluirEmbalagem não se aplica. Ficha (produto/sobremesa da casa):
// custo total real da ficha; por padrão (incluirEmbalagem=false) desconta a embalagem
// individual (tipoUso=EMBALAGEM), pois o combo usa embalagem própria.
function custoRealItemCombo(produto, incluirEmbalagem) {
  if (usaCustoDireto(produto)) {
    return produto.custoDireto === null || produto.custoDireto === undefined
      ? 0
      : Number(produto.custoDireto);
  }
  const total = computeFichaTotals(produto.fichaTecnica ?? []).custoTotalFicha;
  if (incluirEmbalagem) return total;
  return total - custoEmbalagemFicha(produto.fichaTecnica ?? []);
}

function comboItemOut(item) {
  const round2 = (n) => Number(n.toFixed(2));
  const qtd = Number(item.quantidade);
  const precoUnit = Number(item.produto.precoVenda);
  const ehProduto = usaFichaTecnica(item.produto);
  const incluirEmbalagem = !!item.incluirEmbalagemIndividual;
  const custoUnit = custoRealItemCombo(item.produto, incluirEmbalagem);
  // Embalagem individual unitária (sempre informativa; só é removida quando produto e !incluir)
  const embalagemUnit = ehProduto ? custoEmbalagemFicha(item.produto.fichaTecnica ?? []) : 0;
  const embalagemRemovidaUnit = ehProduto && !incluirEmbalagem ? embalagemUnit : 0;
  return {
    id: item.id,
    comboId: item.comboId,
    produtoId: item.produtoId,
    nome: item.produto.nome,
    tipoProduto: item.produto.tipoProduto ?? 'PRODUTO',
    sobremesaModo: item.produto.sobremesaModo ?? null,
    ehProduto,
    quantidade: qtd,
    incluirEmbalagemIndividual: incluirEmbalagem,
    precoVendaUnitario: round2(precoUnit),
    custoRealUnitario: round2(custoUnit),
    custoEmbalagemUnitario: round2(embalagemUnit),
    custoEmbalagemRemovido: round2(embalagemRemovidaUnit * qtd),
    totalVenda: round2(precoUnit * qtd),
    totalCusto: round2(custoUnit * qtd)
  };
}

// Custo bruto de um insumo adicional do combo (mesma base da ficha técnica, sem
// rateio): PORCAO usa custo por porção da receita; BASE converte pela unidade.
function custoComboInsumoBruto(ci) {
  // Mesma regra de perda no preparo da ficha técnica (quantidade = pronta/servida).
  const base =
    ci.modoUsoQuantidade === 'PORCAO'
      ? Number(ci.quantidade) * (custoPorPorcaoInsumo(ci.insumo) ?? 0)
      : quantidadeBase(ci.quantidade, ci.insumo.unidade) * Number(ci.insumo.custoUnitario);
  return base * fatorPerdaPreparo(ci.insumo);
}

function comboInsumoOut(ci) {
  const round2 = (n) => Number(n.toFixed(2));
  const qtd = Number(ci.quantidade);
  const custoTotal = custoComboInsumoBruto(ci);
  const custoUnitario = qtd > 0 ? custoTotal / qtd : custoTotal;
  const rend = rendimentoPreparo(ci.insumo);
  return {
    id: ci.id,
    comboId: ci.comboId,
    insumoId: ci.insumoId,
    nome: ci.insumo.nome,
    unidade: ci.insumo.unidade,
    tipoInsumo: ci.insumo.tipo,
    quantidade: qtd,
    modoUsoQuantidade: ci.modoUsoQuantidade ?? 'BASE',
    custoUnitario: round2(custoUnitario),
    custoTotal: round2(custoTotal),
    considerarPerdaPreparo: rend !== null,
    rendimentoPreparo: rend
  };
}

async function findComboAtivo(id) {
  if (!Number.isInteger(id) || id <= 0) return { error: 'id inválido', status: 400 };
  const combo = await prisma.produto.findUnique({ where: { id } });
  if (!combo || !combo.ativo) return { error: 'Combo não encontrado', status: 404 };
  if ((combo.tipoProduto ?? 'PRODUTO') !== 'COMBO') {
    return { error: 'Itens de combo só existem para produtos do tipo COMBO', status: 400 };
  }
  return { combo };
}

app.get('/api/produtos/:id/combo-itens', async (req, res) => {
  try {
    const { error, status } = await findComboAtivo(Number(req.params.id));
    if (error) return res.status(status).json({ error });
    const itens = await prisma.comboItem.findMany({
      where: { comboId: Number(req.params.id) },
      include: COMBO_ITEM_INCLUDE,
      orderBy: { id: 'asc' }
    });
    res.json(itens.map(comboItemOut));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar itens do combo' });
  }
});

app.post('/api/produtos/:id/combo-itens', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });

    const { produtoId, quantidade } = req.body ?? {};
    if (!Number.isInteger(Number(produtoId)) || Number(produtoId) <= 0) {
      return res.status(400).json({ error: 'produtoId inválido' });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser maior que zero' });
    }
    if (Number(produtoId) === comboId) {
      return res.status(400).json({ error: 'O combo não pode conter ele mesmo' });
    }
    const filho = await prisma.produto.findUnique({ where: { id: Number(produtoId) } });
    if (!filho || !filho.ativo) {
      return res.status(404).json({ error: 'Produto/bebida não encontrado ou inativo' });
    }
    if ((filho.tipoProduto ?? 'PRODUTO') === 'COMBO') {
      return res.status(400).json({ error: 'Combo não pode conter outro combo. Adicione produtos e bebidas.' });
    }

    // Mesmo item adicionado de novo: soma a quantidade (consolidado por item)
    const existente = await prisma.comboItem.findUnique({
      where: { comboId_produtoId: { comboId, produtoId: Number(produtoId) } }
    });
    const item = existente
      ? await prisma.comboItem.update({
          where: { id: existente.id },
          data: { quantidade: Number(existente.quantidade) + Number(quantidade) },
          include: COMBO_ITEM_INCLUDE
        })
      : await prisma.comboItem.create({
          data: { comboId, produtoId: Number(produtoId), quantidade: Number(quantidade) },
          include: COMBO_ITEM_INCLUDE
        });

    res.status(201).json(comboItemOut(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao adicionar item ao combo' });
  }
});

app.put('/api/produtos/:id/combo-itens/:itemId', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });

    const existente = await prisma.comboItem.findUnique({ where: { id: itemId } });
    if (!existente || existente.comboId !== comboId) {
      return res.status(404).json({ error: 'Item não encontrado neste combo' });
    }
    const { quantidade, incluirEmbalagemIndividual } = req.body ?? {};
    const data = {};
    if (quantidade !== undefined) {
      if (quantidade === null || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
        return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
      }
      data.quantidade = Number(quantidade);
    }
    if (incluirEmbalagemIndividual !== undefined) {
      if (typeof incluirEmbalagemIndividual !== 'boolean') {
        return res.status(400).json({ error: 'incluirEmbalagemIndividual inválido' });
      }
      data.incluirEmbalagemIndividual = incluirEmbalagemIndividual;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }
    const item = await prisma.comboItem.update({
      where: { id: itemId },
      data,
      include: COMBO_ITEM_INCLUDE
    });
    res.json(comboItemOut(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar item do combo' });
  }
});

app.delete('/api/produtos/:id/combo-itens/:itemId', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });
    const existente = await prisma.comboItem.findUnique({ where: { id: itemId } });
    if (!existente || existente.comboId !== comboId) {
      return res.status(404).json({ error: 'Item não encontrado neste combo' });
    }
    await prisma.comboItem.delete({ where: { id: itemId } });
    res.json({ id: itemId, deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover item do combo' });
  }
});

// ===== Insumos adicionais do Combo (box, sacola, embalagem especial) =====
const MODOS_USO_QTD = ['BASE', 'PORCAO'];

app.get('/api/produtos/:id/combo-insumos', async (req, res) => {
  try {
    const { error, status } = await findComboAtivo(Number(req.params.id));
    if (error) return res.status(status).json({ error });
    const itens = await prisma.comboInsumo.findMany({
      where: { comboId: Number(req.params.id) },
      include: COMBO_INSUMO_INCLUDE,
      orderBy: { id: 'asc' }
    });
    res.json(itens.map(comboInsumoOut));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar insumos do combo' });
  }
});

app.post('/api/produtos/:id/combo-insumos', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });

    const { insumoId, quantidade, modoUsoQuantidade } = req.body ?? {};
    if (!Number.isInteger(Number(insumoId)) || Number(insumoId) <= 0) {
      return res.status(400).json({ error: 'insumoId inválido' });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser maior que zero' });
    }
    const modo = modoUsoQuantidade ?? 'BASE';
    if (!MODOS_USO_QTD.includes(modo)) {
      return res.status(400).json({ error: 'modoUsoQuantidade deve ser BASE ou PORCAO' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id: Number(insumoId) } });
    if (!insumo || !insumo.ativo) {
      return res.status(404).json({ error: 'Insumo não encontrado ou inativo' });
    }

    // Mesmo insumo adicionado de novo: soma a quantidade (consolidado por insumo)
    const existente = await prisma.comboInsumo.findUnique({
      where: { comboId_insumoId: { comboId, insumoId: Number(insumoId) } }
    });
    const item = existente
      ? await prisma.comboInsumo.update({
          where: { id: existente.id },
          data: { quantidade: Number(existente.quantidade) + Number(quantidade) },
          include: COMBO_INSUMO_INCLUDE
        })
      : await prisma.comboInsumo.create({
          data: { comboId, insumoId: Number(insumoId), quantidade: Number(quantidade), modoUsoQuantidade: modo },
          include: COMBO_INSUMO_INCLUDE
        });

    res.status(201).json(comboInsumoOut(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao adicionar insumo ao combo' });
  }
});

app.put('/api/produtos/:id/combo-insumos/:itemId', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });

    const existente = await prisma.comboInsumo.findUnique({ where: { id: itemId } });
    if (!existente || existente.comboId !== comboId) {
      return res.status(404).json({ error: 'Insumo não encontrado neste combo' });
    }
    const { quantidade, modoUsoQuantidade } = req.body ?? {};
    const data = {};
    if (quantidade !== undefined) {
      if (quantidade === null || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
        return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
      }
      data.quantidade = Number(quantidade);
    }
    if (modoUsoQuantidade !== undefined) {
      if (!MODOS_USO_QTD.includes(modoUsoQuantidade)) {
        return res.status(400).json({ error: 'modoUsoQuantidade deve ser BASE ou PORCAO' });
      }
      data.modoUsoQuantidade = modoUsoQuantidade;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }
    const item = await prisma.comboInsumo.update({
      where: { id: itemId },
      data,
      include: COMBO_INSUMO_INCLUDE
    });
    res.json(comboInsumoOut(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar insumo do combo' });
  }
});

// Remove apenas o vínculo insumo×combo; o Insumo do cadastro geral permanece.
app.delete('/api/produtos/:id/combo-insumos/:itemId', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });
    const existente = await prisma.comboInsumo.findUnique({ where: { id: itemId } });
    if (!existente || existente.comboId !== comboId) {
      return res.status(404).json({ error: 'Insumo não encontrado neste combo' });
    }
    await prisma.comboInsumo.delete({ where: { id: itemId } });
    res.json({ id: itemId, deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover insumo do combo' });
  }
});

// ===== Ficha Técnica =====

const TIPOS_USO_FICHA = ['INGREDIENTE', 'EMBALAGEM', 'ACOMPANHAMENTO', 'OPERACIONAL'];
const FORMAS_RATEIO_FICHA = ['POR_PRODUTO', 'POR_EMBALAGEM', 'POR_PEDIDO'];

// tipoUso/aplicarMargem sugeridos a partir do tipo do insumo
function defaultsUsoPorTipoInsumo(tipoInsumo) {
  if (tipoInsumo === 'EMBALAGEM') return { tipoUso: 'EMBALAGEM', aplicarMargem: false };
  if (tipoInsumo === 'ACOMPANHAMENTO') return { tipoUso: 'ACOMPANHAMENTO', aplicarMargem: false };
  if (tipoInsumo === 'OPERACIONAL') return { tipoUso: 'OPERACIONAL', aplicarMargem: false };
  return { tipoUso: 'INGREDIENTE', aplicarMargem: true };
}

// custoBruto = quantidadeBase × custoUnitario
// (insumo em Kg: quantidade informada em gramas, convertida com /1000; em Und: direto)
// custoAplicado = custoBruto / quantidadeAtendida (POR_EMBALAGEM e POR_PEDIDO)
// Include padrão para itens da ficha técnica: o insumo + receita própria
// (a receita é necessária para calcular itens em modo PORCAO)
const FICHA_INSUMO_INCLUDE = { insumo: { include: { receitaProducao: true } } };

// Custo de uma porção/unidade da receita própria, na unidade base do insumo.
// Kg/L: pesoPorcao (g/ml) convertido para a base × custo unitário; Und: 1 porção
// = 1 unidade. Retorna null quando não dá para calcular (sem receita/pesoPorcao).
function custoPorPorcaoInsumo(insumo) {
  const receita = insumo?.receitaProducao;
  if (!receita) return null;
  const ui = normalizeUnidade(insumo.unidade);
  if (ui === 'Kg' || ui === 'L') {
    const peso = Number(receita.pesoPorcao);
    if (!Number.isFinite(peso) || peso <= 0) return null;
    return (peso / 1000) * Number(insumo.custoUnitario);
  }
  return Number(insumo.custoUnitario);
}

function computeItemFicha(item) {
  // PORCAO: quantidade = nº de porções/unidades da receita própria
  // (1 coxinha de 25 g → 0,025 Kg × custo/Kg). BASE: comportamento original.
  // Perda no preparo: a quantidade da ficha é a PRONTA/servida; o custo usa a
  // necessidade bruta = pronta / rendimento (fator 1 quando não há perda).
  const custoBruto =
    (item.modoUsoQuantidade === 'PORCAO'
      ? Number(item.quantidade) * (custoPorPorcaoInsumo(item.insumo) ?? 0)
      : quantidadeBase(item.quantidade, item.insumo.unidade) * Number(item.insumo.custoUnitario)) *
    fatorPerdaPreparo(item.insumo);
  const qa =
    item.quantidadeAtendida === null || item.quantidadeAtendida === undefined
      ? null
      : Number(item.quantidadeAtendida);
  const rateia = item.formaRateio === 'POR_EMBALAGEM' || item.formaRateio === 'POR_PEDIDO';
  const divisor = rateia && qa && qa > 0 ? qa : 1;
  const custoAplicado = custoBruto / divisor;
  return {
    custoBruto: Number(custoBruto.toFixed(4)),
    custoAplicado: Number(custoAplicado.toFixed(4))
  };
}

function computeFichaTotals(itensRaw) {
  let custoComMargem = 0;
  let custoEmbutido = 0;
  const itens = itensRaw.map((item) => {
    const { custoBruto, custoAplicado } = computeItemFicha(item);
    if (item.aplicarMargem) {
      custoComMargem += custoAplicado;
    } else {
      custoEmbutido += custoAplicado;
    }
    return {
      ...item,
      insumo: insumoComUnidadeNormalizada(item.insumo),
      unidadeQuantidadeFicha:
        item.modoUsoQuantidade === 'PORCAO' ? 'und' : unidadeQuantidade(item.insumo?.unidade),
      custoBruto,
      custoAplicado,
      custoItem: custoAplicado
    };
  });
  return {
    itens,
    custoComMargem: Number(custoComMargem.toFixed(4)),
    custoEmbutido: Number(custoEmbutido.toFixed(4)),
    custoTotalFicha: Number((custoComMargem + custoEmbutido).toFixed(4))
  };
}

// Valida campos de rateio (POST e PUT). Recebe valores já mesclados com o estado atual.
function validateRateioFields({ tipoUso, formaRateio, quantidadeAtendida, aplicarMargem }) {
  if (!TIPOS_USO_FICHA.includes(tipoUso)) {
    return `tipoUso inválido. Valores permitidos: ${TIPOS_USO_FICHA.join(', ')}`;
  }
  if (!FORMAS_RATEIO_FICHA.includes(formaRateio)) {
    return `formaRateio inválida. Valores permitidos: ${FORMAS_RATEIO_FICHA.join(', ')}`;
  }
  if (typeof aplicarMargem !== 'boolean') {
    return 'aplicarMargem deve ser booleano';
  }
  if (formaRateio === 'POR_EMBALAGEM' || formaRateio === 'POR_PEDIDO') {
    if (
      quantidadeAtendida === null ||
      quantidadeAtendida === undefined ||
      isNaN(Number(quantidadeAtendida)) ||
      Number(quantidadeAtendida) <= 0
    ) {
      return 'quantidadeAtendida é obrigatória e deve ser maior que zero para rateio POR_EMBALAGEM ou POR_PEDIDO';
    }
  }
  return null;
}

app.get('/api/produtos/:produtoId/ficha-tecnica', async (req, res) => {
  try {
    const produtoId = Number(req.params.produtoId);
    if (!Number.isInteger(produtoId) || produtoId <= 0) {
      return res.status(400).json({ error: 'produtoId inválido' });
    }

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto || !produto.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const itensRaw = await prisma.fichaTecnicaItem.findMany({
      where: { produtoId },
      include: FICHA_INSUMO_INCLUDE,
      orderBy: { id: 'asc' }
    });

    const totals = computeFichaTotals(itensRaw);

    res.json({
      produto,
      itens: totals.itens,
      custoComMargem: totals.custoComMargem,
      custoEmbutido: totals.custoEmbutido,
      custoTotalFicha: totals.custoTotalFicha
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar ficha técnica' });
  }
});

app.post('/api/produtos/:produtoId/ficha-tecnica/itens', async (req, res) => {
  try {
    const produtoId = Number(req.params.produtoId);
    if (!Number.isInteger(produtoId) || produtoId <= 0) {
      return res.status(400).json({ error: 'produtoId inválido' });
    }

    const { insumoId, quantidade, tipoUso, formaRateio, quantidadeAtendida, modoUsoQuantidade } =
      req.body ?? {};

    if (!Number.isInteger(Number(insumoId)) || Number(insumoId) <= 0) {
      return res.status(400).json({ error: 'insumoId inválido' });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto || !produto.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const insumo = await prisma.insumo.findUnique({
      where: { id: Number(insumoId) },
      include: { receitaProducao: true }
    });
    if (!insumo || !insumo.ativo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    // Modo de uso da quantidade: PORCAO só vale para produção própria com
    // receita em modo PORCOES (e pesoPorcao definido quando o insumo é Kg/L)
    const modoUsoFinal = modoUsoQuantidade === 'PORCAO' ? 'PORCAO' : 'BASE';
    if (modoUsoFinal === 'PORCAO') {
      if (insumo.tipo !== 'PRODUCAO_PROPRIA') {
        return res.status(400).json({
          error: 'Uso por unidade/porção só está disponível para insumos de produção própria'
        });
      }
      if (insumo.receitaProducao?.modoRendimento !== 'PORCOES') {
        return res.status(400).json({
          error:
            'Uso por unidade/porção exige que a receita do insumo esteja no modo de rendimento por porções'
        });
      }
      if (custoPorPorcaoInsumo(insumo) === null) {
        return res.status(400).json({
          error: 'Receita sem tamanho de porção definido para calcular o custo por unidade'
        });
      }
    }

    const defaults = defaultsUsoPorTipoInsumo(insumo.tipo);
    const tipoUsoFinal = tipoUso ?? defaults.tipoUso;
    const merged = {
      tipoUso: tipoUsoFinal,
      formaRateio: formaRateio ?? 'POR_PRODUTO',
      quantidadeAtendida:
        quantidadeAtendida === undefined || quantidadeAtendida === null || quantidadeAtendida === ''
          ? null
          : Number(quantidadeAtendida),
      // Regra automática: apenas INGREDIENTE entra na base do preço sugerido.
      // O valor enviado no payload é ignorado para evitar inconsistência.
      aplicarMargem: tipoUsoFinal === 'INGREDIENTE'
    };
    if (merged.formaRateio === 'POR_PRODUTO') {
      merged.quantidadeAtendida = null;
    }
    const rateioError = validateRateioFields(merged);
    if (rateioError) {
      return res.status(400).json({ error: rateioError });
    }

    const item = await prisma.fichaTecnicaItem.create({
      data: {
        produtoId,
        insumoId: Number(insumoId),
        quantidade: Number(quantidade),
        modoUsoQuantidade: modoUsoFinal,
        tipoUso: merged.tipoUso,
        formaRateio: merged.formaRateio,
        quantidadeAtendida: merged.quantidadeAtendida,
        aplicarMargem: merged.aplicarMargem
      },
      include: FICHA_INSUMO_INCLUDE
    });

    res.status(201).json({ ...item, ...computeItemFicha(item) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar item da ficha técnica' });
  }
});

app.put('/api/ficha-tecnica/itens/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const { quantidade, tipoUso, formaRateio, quantidadeAtendida } = req.body ?? {};

    const existing = await prisma.fichaTecnicaItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item da ficha técnica não encontrado' });
    }

    const data = {};

    if (quantidade !== undefined) {
      if (quantidade === null || isNaN(Number(quantidade))) {
        return res.status(400).json({ error: 'quantidade deve ser numérica' });
      }
      if (Number(quantidade) <= 0) {
        return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
      }
      data.quantidade = Number(quantidade);
    }
    if (tipoUso !== undefined) data.tipoUso = tipoUso;
    if (formaRateio !== undefined) data.formaRateio = formaRateio;
    if (quantidadeAtendida !== undefined) {
      data.quantidadeAtendida =
        quantidadeAtendida === null || quantidadeAtendida === ''
          ? null
          : Number(quantidadeAtendida);
    }

    // Regra automática: aplicarMargem é derivado do tipoUso final (payload é ignorado).
    // Apenas INGREDIENTE entra na base do preço sugerido; ao salvar, itens antigos
    // fora da regra são corrigidos automaticamente.
    data.aplicarMargem = (data.tipoUso ?? existing.tipoUso) === 'INGREDIENTE';

    // Valida o estado final do item (campos novos mesclados com os atuais)
    const merged = {
      tipoUso: data.tipoUso ?? existing.tipoUso,
      formaRateio: data.formaRateio ?? existing.formaRateio,
      quantidadeAtendida:
        data.quantidadeAtendida !== undefined
          ? data.quantidadeAtendida
          : existing.quantidadeAtendida === null
          ? null
          : Number(existing.quantidadeAtendida),
      aplicarMargem: data.aplicarMargem
    };
    if (merged.formaRateio === 'POR_PRODUTO') {
      merged.quantidadeAtendida = null;
      data.quantidadeAtendida = null;
    }
    const rateioError = validateRateioFields(merged);
    if (rateioError) {
      return res.status(400).json({ error: rateioError });
    }

    const updated = await prisma.fichaTecnicaItem.update({
      where: { id },
      data,
      include: FICHA_INSUMO_INCLUDE
    });

    res.json({ ...updated, ...computeItemFicha(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar item da ficha técnica' });
  }
});

app.delete('/api/ficha-tecnica/itens/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.fichaTecnicaItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item da ficha técnica não encontrado' });
    }

    await prisma.fichaTecnicaItem.delete({ where: { id } });
    res.json({ id, deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover item da ficha técnica' });
  }
});

// ===== Configuração de Precificação =====

async function getConfigPrecificacao() {
  let config = await prisma.configuracaoPrecificacao.findFirst({
    where: { ativo: true },
    orderBy: { id: 'asc' }
  });
  if (!config) {
    config = await prisma.configuracaoPrecificacao.create({ data: {} });
  }
  return config;
}

// precoSugerido = custoComMargem / (cmvAlvo/100) + custoEmbutido (venda direta)
// precoIfood = precoVenda / (1 - taxaIfood/100)
//            + ((campanhaInteligente + maiorTaxaEntrega + cupomDesconto) / ticketMedioDelivery) * precoVenda
// O preço iFood usa o preço de venda REAL do produto, não o sugerido — o gestor
// pode praticar preços estratégicos (isca, âncora, promocional) e o iFood
// precisa ser calculado sobre a decisão real.
function computePrecificacao(totals, precoVenda, config) {
  const round2 = (n) => Number(n.toFixed(2));
  const cmvAlvo = Number(config.cmvAlvoPercentual);
  const lucroDesejado = Number(config.lucroDesejadoPercentual);
  const taxa = Number(config.taxaIfoodPercentual);
  const campanhaInteligente = Number(config.campanhaInteligente);
  const maiorTaxaEntrega = Number(config.maiorTaxaEntrega);
  const cupomDesconto = Number(config.cupomDesconto);
  const ticketMedioDelivery = Number(config.ticketMedioDelivery);

  const percentualIfoodTotal = taxa;
  const custosIfoodRateaveis = campanhaInteligente + maiorTaxaEntrega + cupomDesconto;

  let precoSugerido = null;
  if (totals.custoComMargem > 0 && cmvAlvo > 0 && cmvAlvo < 100) {
    precoSugerido = totals.custoComMargem / (cmvAlvo / 100) + totals.custoEmbutido;
  }

  let precoIfoodBaseTaxas = null;
  let valorCustosIfoodRateados = null;
  let precoIfood = null;
  if (precoVenda > 0 && taxa >= 0 && taxa < 100 && ticketMedioDelivery > 0) {
    precoIfoodBaseTaxas = precoVenda / (1 - taxa / 100);
    valorCustosIfoodRateados = (custosIfoodRateaveis / ticketMedioDelivery) * precoVenda;
    precoIfood = precoIfoodBaseTaxas + valorCustosIfoodRateados;
  }

  return {
    cmvAlvoPercentual: round2(cmvAlvo),
    lucroDesejadoPercentual: round2(lucroDesejado),
    taxaIfoodPercentual: round2(taxa),
    campanhaInteligente: round2(campanhaInteligente),
    percentualIfoodTotal: round2(percentualIfoodTotal),
    maiorTaxaEntrega: round2(maiorTaxaEntrega),
    cupomDesconto: round2(cupomDesconto),
    ticketMedioDelivery: round2(ticketMedioDelivery),
    custosIfoodRateaveis: round2(custosIfoodRateaveis),
    precoIfoodBaseTaxas: precoIfoodBaseTaxas === null ? null : round2(precoIfoodBaseTaxas),
    valorCustosIfoodRateados:
      valorCustosIfoodRateados === null ? null : round2(valorCustosIfoodRateados),
    precoSugerido: precoSugerido === null ? null : round2(precoSugerido),
    precoIfood: precoIfood === null ? null : round2(precoIfood)
  };
}

app.get('/api/configuracao-precificacao', async (req, res) => {
  try {
    const config = await getConfigPrecificacao();
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar configuração de precificação' });
  }
});

app.put('/api/configuracao-precificacao', async (req, res) => {
  try {
    const config = await getConfigPrecificacao();
    const {
      cmvAlvoPercentual,
      lucroDesejadoPercentual,
      taxaIfoodPercentual,
      campanhaInteligente,
      maiorTaxaEntrega,
      cupomDesconto,
      ticketMedioDelivery
    } = req.body ?? {};

    const data = {};

    if (cmvAlvoPercentual !== undefined) {
      const v = Number(cmvAlvoPercentual);
      if (isNaN(v) || v <= 0 || v >= 100) {
        return res.status(400).json({ error: 'cmvAlvoPercentual deve ser maior que 0 e menor que 100' });
      }
      data.cmvAlvoPercentual = v;
    }
    if (lucroDesejadoPercentual !== undefined) {
      const v = Number(lucroDesejadoPercentual);
      if (isNaN(v) || v < 0 || v >= 100) {
        return res.status(400).json({
          error: 'lucroDesejadoPercentual deve ser maior ou igual a 0 e menor que 100'
        });
      }
      data.lucroDesejadoPercentual = v;
    }
    if (taxaIfoodPercentual !== undefined) {
      const v = Number(taxaIfoodPercentual);
      if (isNaN(v) || v < 0 || v >= 100) {
        return res.status(400).json({
          error: 'taxaIfoodPercentual deve ser maior ou igual a 0 e menor que 100'
        });
      }
      data.taxaIfoodPercentual = v;
    }
    if (campanhaInteligente !== undefined) {
      const v = Number(campanhaInteligente);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({ error: 'campanhaInteligente deve ser maior ou igual a zero' });
      }
      data.campanhaInteligente = v;
    }
    if (maiorTaxaEntrega !== undefined) {
      const v = Number(maiorTaxaEntrega);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({ error: 'maiorTaxaEntrega deve ser maior ou igual a zero' });
      }
      data.maiorTaxaEntrega = v;
    }
    if (cupomDesconto !== undefined) {
      const v = Number(cupomDesconto);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({ error: 'cupomDesconto deve ser maior ou igual a zero' });
      }
      data.cupomDesconto = v;
    }
    if (ticketMedioDelivery !== undefined) {
      const v = Number(ticketMedioDelivery);
      if (isNaN(v) || v <= 0) {
        return res.status(400).json({ error: 'ticketMedioDelivery deve ser maior que zero' });
      }
      data.ticketMedioDelivery = v;
    }

    const updated = await prisma.configuracaoPrecificacao.update({
      where: { id: config.id },
      data
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar configuração de precificação' });
  }
});

// ===== Análise Financeira do Produto =====

app.get('/api/produtos/:id/analise', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const produto = await prisma.produto.findUnique({ where: { id } });
    if (!produto || !produto.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const itens = await prisma.fichaTecnicaItem.findMany({
      where: { produtoId: id },
      include: FICHA_INSUMO_INCLUDE
    });

    const precoVenda = Number(produto.precoVenda);
    const round2 = (n) => Number(n.toFixed(2));

    const produtoOut = {
      id: produto.id,
      nome: produto.nome,
      precoVenda: round2(precoVenda),
      tipoProduto: produto.tipoProduto ?? 'PRODUTO',
      sobremesaModo: produto.sobremesaModo ?? null,
      custoDireto:
        produto.custoDireto === null || produto.custoDireto === undefined
          ? null
          : round2(Number(produto.custoDireto))
    };

    const config = await getConfigPrecificacao();

    // ===== REVENDA (bebida ou sobremesa comprada pronta): análise por lucro/margem,
    // sem régua de CMV de produto próprio e sem exigir ficha técnica =====
    if (usaCustoDireto(produtoOut)) {
      const custoDireto = produtoOut.custoDireto;
      const precificacaoBebida = computePrecificacao(
        { custoComMargem: 0, custoEmbutido: 0 },
        precoVenda,
        config
      );
      let statusGeral;
      let mensagemDiagnostico;
      let lucroBrutoReal = null;
      let margemRealPercentual = null;
      let percentualTotalReal = null;
      if (precoVenda === 0) {
        statusGeral = 'SEM_PRECO';
        mensagemDiagnostico = 'Bebida sem preço de venda.';
      } else if (custoDireto === null) {
        statusGeral = 'ATENCAO';
        mensagemDiagnostico = 'Bebida sem custo de compra.';
      } else {
        lucroBrutoReal = precoVenda - custoDireto;
        margemRealPercentual = (lucroBrutoReal / precoVenda) * 100;
        percentualTotalReal = (custoDireto / precoVenda) * 100;
        if (lucroBrutoReal <= 0) {
          statusGeral = 'CRITICO';
          mensagemDiagnostico = 'Bebida vendida sem lucro. Revise custo de compra e preço.';
        } else if (margemRealPercentual < 20) {
          statusGeral = 'ATENCAO';
          mensagemDiagnostico = 'Margem da bebida abaixo de 20%. Avalie o preço de venda.';
        } else {
          statusGeral = 'SAUDAVEL';
          mensagemDiagnostico = 'Margem de revenda saudável.';
        }
      }
      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        custoFichaTecnica: 0,
        custoComMargem: custoDireto === null ? 0 : round2(custoDireto),
        custoEmbutido: 0,
        custoTotalFicha: custoDireto === null ? 0 : round2(custoDireto),
        custoProduto: custoDireto === null ? 0 : round2(custoDireto),
        custoTotalReal: custoDireto === null ? 0 : round2(custoDireto),
        cmvProdutoPercentual: null,
        percentualTotalReal: percentualTotalReal === null ? null : round2(percentualTotalReal),
        percentualCustoEmbutido: null,
        lucroBrutoReal: lucroBrutoReal === null ? null : round2(lucroBrutoReal),
        margemRealPercentual:
          margemRealPercentual === null ? null : round2(margemRealPercentual),
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: lucroBrutoReal === null ? null : round2(lucroBrutoReal),
        cmvPercentual: percentualTotalReal === null ? null : round2(percentualTotalReal),
        margemBrutaPercentual:
          margemRealPercentual === null ? null : round2(margemRealPercentual),
        statusCmv: statusGeral,
        statusGeral,
        mensagemDiagnostico,
        ...precificacaoBebida,
        precoSugerido: null,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda:
          precificacaoBebida.precoIfood === null
            ? null
            : round2(precificacaoBebida.precoIfood - precoVenda),
        mensagemPrecificacao:
          'Bebida de revenda: análise por lucro bruto e margem, sem preço sugerido por CMV.'
      });
    }

    // ===== COMBO: análise calculada a partir dos itens (produtos/bebidas) =====
    // Combo não usa a régua 30/35 de produto individual: o objetivo é elevar
    // ticket e lucro bruto absoluto, então a leitura é desconto/margem/lucro.
    if (produtoOut.tipoProduto === 'COMBO') {
      const comboItens = await prisma.comboItem.findMany({
        where: { comboId: id },
        include: COMBO_ITEM_INCLUDE,
        orderBy: { id: 'asc' }
      });
      const comboInsumos = await prisma.comboInsumo.findMany({
        where: { comboId: id },
        include: COMBO_INSUMO_INCLUDE,
        orderBy: { id: 'asc' }
      });
      const precificacaoCombo = computePrecificacao(
        { custoComMargem: 0, custoEmbutido: 0 },
        precoVenda,
        config
      );

      const comboItensResumo = comboItens.map(comboItemOut);
      const comboInsumosResumo = comboInsumos.map(comboInsumoOut);
      const temItens = comboItensResumo.length > 0;
      // Preço que o cliente pagaria comprando os produtos/bebidas separadamente
      const valorItensSeparados = comboItensResumo.reduce((s, i) => s + i.totalVenda, 0);
      // Custo dos itens (embalagem individual conforme marcação) + insumos adicionais do combo
      const custoItensCombo = comboItensResumo.reduce((s, i) => s + i.totalCusto, 0);
      const custoAdicionaisCombo = comboInsumosResumo.reduce((s, i) => s + i.custoTotal, 0);
      const embalagensDesconsideradas = comboItensResumo.reduce((s, i) => s + i.custoEmbalagemRemovido, 0);
      const custoTotalCombo = custoItensCombo + custoAdicionaisCombo;

      // Valor de referência: itens vendidos separadamente + adicionais exclusivos
      // do combo (Fini, suco, brinde...). É contra esse valor que se mede a economia.
      const valorReferenciaCombo = valorItensSeparados + custoAdicionaisCombo;
      const descontoCombo = temItens ? valorReferenciaCombo - precoVenda : null;
      const percentualDescontoCombo =
        temItens && valorReferenciaCombo > 0
          ? (descontoCombo / valorReferenciaCombo) * 100
          : null;
      const cmvComboPercentual =
        temItens && precoVenda > 0 ? (custoTotalCombo / precoVenda) * 100 : null;
      const lucroBrutoCombo = temItens && precoVenda > 0 ? precoVenda - custoTotalCombo : null;
      const margemComboPercentual =
        lucroBrutoCombo === null ? null : (lucroBrutoCombo / precoVenda) * 100;

      const alertasCombo = [];
      let statusCombo;
      let mensagemDiagnostico;
      if (precoVenda === 0) {
        statusCombo = 'SEM_PRECO';
        mensagemDiagnostico = 'Combo sem preço de venda.';
      } else if (!temItens) {
        statusCombo = 'SEM_COMPOSICAO';
        mensagemDiagnostico = 'Monte o combo com produtos e bebidas.';
      } else if (custoTotalCombo >= precoVenda || lucroBrutoCombo <= 0) {
        statusCombo = 'CRITICO';
        mensagemDiagnostico = 'Combo vendido sem lucro. Revise itens e preço.';
      } else {
        if (percentualDescontoCombo !== null && percentualDescontoCombo > 20) {
          alertasCombo.push('Desconto do combo acima de 20% do valor de referência.');
        }
        if (descontoCombo !== null && descontoCombo < 0) {
          alertasCombo.push('Combo mais caro que o valor de referência (itens + adicionais).');
        }
        if (margemComboPercentual !== null && margemComboPercentual < 25) {
          alertasCombo.push('Margem do combo abaixo de 25%.');
        }
        if (cmvComboPercentual !== null && cmvComboPercentual > 50) {
          alertasCombo.push('CMV do combo acima de 50%.');
        }
        if (alertasCombo.length > 0) {
          statusCombo = 'ATENCAO';
          mensagemDiagnostico = alertasCombo[0];
        } else {
          statusCombo = 'SAUDAVEL';
          mensagemDiagnostico = 'Combo saudável: lucro e margem dentro do esperado.';
        }
      }

      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        // Campos próprios do combo
        quantidadeItensCombo: comboItensResumo.length,
        comboItensResumo,
        comboInsumosResumo,
        valorItensSeparados: round2(valorItensSeparados),
        valorReferenciaCombo: round2(valorReferenciaCombo),
        custoItensCombo: round2(custoItensCombo),
        custoAdicionaisCombo: round2(custoAdicionaisCombo),
        embalagensDesconsideradas: round2(embalagensDesconsideradas),
        custoTotalCombo: round2(custoTotalCombo),
        descontoCombo: descontoCombo === null ? null : round2(descontoCombo),
        percentualDescontoCombo:
          percentualDescontoCombo === null ? null : round2(percentualDescontoCombo),
        cmvComboPercentual: cmvComboPercentual === null ? null : round2(cmvComboPercentual),
        lucroBrutoCombo: lucroBrutoCombo === null ? null : round2(lucroBrutoCombo),
        margemComboPercentual:
          margemComboPercentual === null ? null : round2(margemComboPercentual),
        ticketGerado: round2(precoVenda),
        statusCombo,
        alertasCombo,
        // Compatibilidade com a listagem/Dashboard
        custoFichaTecnica: 0,
        custoComMargem: round2(custoTotalCombo),
        custoEmbutido: 0,
        custoTotalFicha: round2(custoTotalCombo),
        custoProduto: round2(custoTotalCombo),
        custoTotalReal: round2(custoTotalCombo),
        cmvProdutoPercentual: null,
        percentualTotalReal: cmvComboPercentual === null ? null : round2(cmvComboPercentual),
        percentualCustoEmbutido: null,
        lucroBrutoReal: lucroBrutoCombo === null ? null : round2(lucroBrutoCombo),
        margemRealPercentual:
          margemComboPercentual === null ? null : round2(margemComboPercentual),
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: lucroBrutoCombo === null ? null : round2(lucroBrutoCombo),
        cmvPercentual: cmvComboPercentual === null ? null : round2(cmvComboPercentual),
        margemBrutaPercentual:
          margemComboPercentual === null ? null : round2(margemComboPercentual),
        statusCmv: statusCombo,
        statusGeral: statusCombo,
        mensagemDiagnostico,
        ...precificacaoCombo,
        precoSugerido: null,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda:
          precificacaoCombo.precoIfood === null
            ? null
            : round2(precificacaoCombo.precoIfood - precoVenda),
        mensagemPrecificacao:
          'Combo: análise por desconto, lucro bruto e margem sobre os itens que o compõem.'
      });
    }

    if (itens.length === 0) {
      const precificacaoVazia = computePrecificacao(
        { custoComMargem: 0, custoEmbutido: 0 },
        precoVenda,
        config
      );
      let mensagemSemFicha = 'Cadastre a ficha técnica para calcular o preço sugerido.';
      if (precificacaoVazia.precoIfood !== null) {
        mensagemSemFicha +=
          ' Preço iFood usa o preço de venda definido no produto e considera taxa iFood, campanha inteligente, entrega/cupom e ticket médio delivery.';
      } else {
        mensagemSemFicha +=
          ' Defina um preço de venda válido e uma configuração iFood válida para calcular o preço iFood.';
      }
      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        custoFichaTecnica: 0,
        custoComMargem: 0,
        custoEmbutido: 0,
        custoTotalFicha: 0,
        custoProduto: 0,
        custoTotalReal: 0,
        cmvProdutoPercentual: null,
        percentualTotalReal: null,
        percentualCustoEmbutido: null,
        lucroBrutoReal: null,
        margemRealPercentual: null,
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_FICHA',
        statusGeral: 'SEM_FICHA',
        mensagemDiagnostico:
          'Produto sem ficha técnica cadastrada. Cadastre os insumos para calcular CMV e margem real.',
        ...precificacaoVazia,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda:
          precificacaoVazia.precoIfood === null
            ? null
            : round2(precificacaoVazia.precoIfood - precoVenda),
        mensagemPrecificacao: mensagemSemFicha
      });
    }

    // Custo real considera rateio (POR_EMBALAGEM / POR_PEDIDO dividem pelo atendimento)
    const totals = computeFichaTotals(itens);
    const custoFichaTecnica = totals.custoTotalFicha;
    const precificacao = computePrecificacao(totals, precoVenda, config);

    if (precoVenda === 0) {
      return res.json({
        produto: produtoOut,
        precoVenda: 0,
        custoFichaTecnica: round2(custoFichaTecnica),
        custoComMargem: round2(totals.custoComMargem),
        custoEmbutido: round2(totals.custoEmbutido),
        custoTotalFicha: round2(totals.custoTotalFicha),
        custoProduto: round2(totals.custoComMargem),
        custoTotalReal: round2(totals.custoTotalFicha),
        cmvProdutoPercentual: null,
        percentualTotalReal: null,
        percentualCustoEmbutido: null,
        lucroBrutoReal: null,
        margemRealPercentual: null,
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_PRECO',
        statusGeral: 'SEM_PRECO',
        mensagemDiagnostico:
          'Produto sem preço de venda válido para cálculo de CMV e margem.',
        ...precificacao,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda: null,
        mensagemPrecificacao:
          'Defina o preço de venda para comparar com o preço sugerido. ' +
          'Defina um preço de venda válido e uma configuração iFood válida para calcular o preço iFood.'
      });
    }

    // Leitura separada de custos:
    // - custoProduto: itens com composição "Preço sugerido" (aplicarMargem = true)
    // - custoEmbutido: itens com composição "Custo embutido" (aplicarMargem = false)
    // - custoTotalReal: produto + embutido
    // O status principal usa o CMV DO PRODUTO — embalagem/acompanhamento não deve
    // sozinho jogar o produto para atenção/crítico; o custo total vira alerta à parte.
    const custoProduto = totals.custoComMargem;
    const custoTotalReal = totals.custoTotalFicha;
    const cmvProdutoPercentual = (custoProduto / precoVenda) * 100;
    const percentualCustoEmbutido = (totals.custoEmbutido / precoVenda) * 100;
    const lucroBruto = precoVenda - custoFichaTecnica;
    // Compatibilidade: cmvPercentual segue sendo o percentual do custo TOTAL real
    const cmvPercentual = (custoFichaTecnica / precoVenda) * 100;
    const percentualTotalReal = cmvPercentual;
    const margemBrutaPercentual = (lucroBruto / precoVenda) * 100;
    const lucroBrutoReal = lucroBruto;
    const margemRealPercentual = margemBrutaPercentual;

    let statusCmv;
    let mensagemDiagnostico;
    if (cmvProdutoPercentual <= 30) {
      statusCmv = 'SAUDAVEL';
      mensagemDiagnostico = 'CMV do produto saudável. Ingredientes com boa margem bruta.';
    } else if (cmvProdutoPercentual <= 35) {
      statusCmv = 'ATENCAO';
      mensagemDiagnostico =
        'CMV do produto em atenção. Acompanhe variações de custo dos ingredientes.';
    } else {
      statusCmv = 'CRITICO';
      mensagemDiagnostico =
        'CMV do produto crítico. Revise preço de venda, ficha técnica e porcionamento.';
    }

    const alertaCustoTotal =
      percentualTotalReal > 40 ? 'Custo total real acima de 40% do preço de venda.' : null;
    const alertaCustoEmbutido =
      percentualCustoEmbutido > 10
        ? 'Custo embutido elevado. Avalie compensar no preço, taxa de entrega ou pedido mínimo.'
        : null;

    // Status GERAL da precificação (badge do produto). statusCmv segue medindo só
    // o CMV do produto; aqui entram também preço abaixo do sugerido, custo
    // embutido/total elevados e lucro real negativo. Tolerância de R$ 0,01 no
    // preço sugerido para não marcar atenção por arredondamento de centavos.
    const precoAbaixoSugerido =
      precificacao.precoSugerido !== null && precoVenda < precificacao.precoSugerido - 0.01;
    let statusGeral;
    if (cmvProdutoPercentual > 35 || lucroBrutoReal < 0) {
      statusGeral = 'CRITICO';
    } else if (
      cmvProdutoPercentual > 30 ||
      precoAbaixoSugerido ||
      alertaCustoEmbutido !== null ||
      alertaCustoTotal !== null
    ) {
      statusGeral = 'ATENCAO';
    } else {
      statusGeral = 'SAUDAVEL';
    }

    let mensagemPrecificacao;
    if (precificacao.precoSugerido === null) {
      mensagemPrecificacao =
        'Não foi possível calcular o preço sugerido. Verifique a ficha técnica e a margem alvo.';
    } else if (precoVenda < precificacao.precoSugerido) {
      mensagemPrecificacao =
        'Preço atual abaixo do preço técnico sugerido. Revise preço, ficha ou margem alvo.';
    } else {
      mensagemPrecificacao =
        'Preço atual cobre o preço técnico sugerido para venda direta.';
    }
    if (precificacao.precoIfood !== null) {
      mensagemPrecificacao +=
        ' Preço iFood usa o preço de venda definido no produto e considera taxa iFood, campanha inteligente, entrega/cupom e ticket médio delivery.';
    } else {
      mensagemPrecificacao +=
        ' Defina um preço de venda válido e uma configuração iFood válida para calcular o preço iFood.';
    }

    res.json({
      produto: produtoOut,
      precoVenda: round2(precoVenda),
      custoFichaTecnica: round2(custoFichaTecnica),
      custoComMargem: round2(totals.custoComMargem),
      custoEmbutido: round2(totals.custoEmbutido),
      custoTotalFicha: round2(totals.custoTotalFicha),
      custoProduto: round2(custoProduto),
      custoTotalReal: round2(custoTotalReal),
      cmvProdutoPercentual: round2(cmvProdutoPercentual),
      percentualTotalReal: round2(percentualTotalReal),
      percentualCustoEmbutido: round2(percentualCustoEmbutido),
      lucroBrutoReal: round2(lucroBrutoReal),
      margemRealPercentual: round2(margemRealPercentual),
      alertaCustoTotal,
      alertaCustoEmbutido,
      lucroBruto: round2(lucroBruto),
      cmvPercentual: round2(cmvPercentual),
      margemBrutaPercentual: round2(margemBrutaPercentual),
      statusCmv,
      statusGeral,
      mensagemDiagnostico,
      ...precificacao,
      diferencaPrecoSugerido:
        precificacao.precoSugerido === null
          ? null
          : round2(precoVenda - precificacao.precoSugerido),
      diferencaPrecoIfoodVsVenda:
        precificacao.precoIfood === null
          ? null
          : round2(precificacao.precoIfood - precoVenda),
      mensagemPrecificacao
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao analisar produto' });
  }
});

// ===== Custos Fixos =====

app.get('/api/custos-fixos', async (req, res) => {
  try {
    const custos = await prisma.custoFixo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(custos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar custos fixos' });
  }
});


// ===================== Gestão: Custos Fixos CRUD + Custos Variáveis + Faturamento + Ponto de Equilíbrio (do H360) =====================
app.post('/api/custos-fixos', async (req, res) => {
  try {
    const { nome, valorMensal, tipo, observacao } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    const colaborador = resolveCamposColaborador(req.body);
    if (colaborador.error) {
      return res.status(400).json({ error: colaborador.error });
    }
    // Com encargos automáticos o valor mensal vem do cálculo; sem, é obrigatório
    let valorMensalFinal;
    if (colaborador.valorMensalCalculado !== null) {
      valorMensalFinal = colaborador.valorMensalCalculado;
    } else {
      if (valorMensal === undefined || valorMensal === null || isNaN(Number(valorMensal))) {
        return res.status(400).json({ error: 'valorMensal é obrigatório e deve ser numérico' });
      }
      if (Number(valorMensal) < 0) {
        return res.status(400).json({ error: 'valorMensal deve ser maior ou igual a zero' });
      }
      valorMensalFinal = Number(valorMensal);
    }

    const custo = await prisma.custoFixo.create({
      data: {
        nome: nome.trim(),
        valorMensal: valorMensalFinal,
        tipo: tipo ? String(tipo).trim() : null,
        observacao: observacao ? String(observacao).trim() : null,
        ...colaborador.campos,
        ativo: true
      }
    });

    res.status(201).json(custo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar custo fixo' });
  }
});

app.put('/api/custos-fixos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoFixo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo fixo não encontrado' });
    }

    const { nome, valorMensal, tipo, observacao, ativo, tipoCusto } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (valorMensal !== undefined) {
      if (valorMensal === null || isNaN(Number(valorMensal))) {
        return res.status(400).json({ error: 'valorMensal inválido' });
      }
      if (Number(valorMensal) < 0) {
        return res.status(400).json({ error: 'valorMensal deve ser maior ou igual a zero' });
      }
      data.valorMensal = Number(valorMensal);
    }
    if (tipo !== undefined) {
      data.tipo = tipo === null || tipo === '' ? null : String(tipo).trim();
    }
    if (observacao !== undefined) {
      data.observacao =
        observacao === null || observacao === '' ? null : String(observacao).trim();
    }
    // Campos de colaborador: quando o payload traz tipoCusto, resolve o conjunto
    // inteiro (e o valorMensal vira o total calculado se encargos estiverem ativos)
    if (tipoCusto !== undefined) {
      const colaborador = resolveCamposColaborador(req.body);
      if (colaborador.error) {
        return res.status(400).json({ error: colaborador.error });
      }
      Object.assign(data, colaborador.campos);
      if (colaborador.valorMensalCalculado !== null) {
        data.valorMensal = colaborador.valorMensalCalculado;
      }
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }

    const updated = await prisma.custoFixo.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar custo fixo' });
  }
});

app.delete('/api/custos-fixos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoFixo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo fixo não encontrado' });
    }

    const desativado = await prisma.custoFixo.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar custo fixo' });
  }
});

// ===== Custos Variáveis =====

const CATEGORIAS_CUSTO_VARIAVEL = new Set([
  'TAXA_CARTAO',
  'MARKETPLACE',
  'EMBALAGEM',
  'ENTREGA',
  'IMPOSTO',
  'CUPOM',
  'COMISSAO',
  'OUTROS'
]);

const TIPOS_CALCULO_CUSTO_VARIAVEL = new Set([
  'PERCENTUAL_FATURAMENTO',
  'VALOR_POR_PEDIDO',
  'VALOR_FIXO_MENSAL_VARIAVEL'
]);

app.get('/api/custos-variaveis', async (req, res) => {
  try {
    const custos = await prisma.custoVariavel.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(custos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar custos variáveis' });
  }
});

app.post('/api/custos-variaveis', async (req, res) => {
  try {
    const { nome, categoria, tipoCalculo, valor } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (typeof categoria !== 'string' || !CATEGORIAS_CUSTO_VARIAVEL.has(categoria)) {
      return res.status(400).json({
        error: 'categoria inválida',
        valoresPermitidos: [...CATEGORIAS_CUSTO_VARIAVEL]
      });
    }
    if (typeof tipoCalculo !== 'string' || !TIPOS_CALCULO_CUSTO_VARIAVEL.has(tipoCalculo)) {
      return res.status(400).json({
        error: 'tipoCalculo inválido',
        valoresPermitidos: [...TIPOS_CALCULO_CUSTO_VARIAVEL]
      });
    }
    if (valor === undefined || valor === null || isNaN(Number(valor))) {
      return res.status(400).json({ error: 'valor é obrigatório e deve ser numérico' });
    }
    if (Number(valor) < 0) {
      return res.status(400).json({ error: 'valor deve ser maior ou igual a zero' });
    }

    const custo = await prisma.custoVariavel.create({
      data: {
        nome: nome.trim(),
        categoria,
        tipoCalculo,
        valor: Number(valor),
        ativo: true
      }
    });

    res.status(201).json(custo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar custo variável' });
  }
});

app.put('/api/custos-variaveis/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoVariavel.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo variável não encontrado' });
    }

    const { nome, categoria, tipoCalculo, valor, ativo } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (categoria !== undefined) {
      if (typeof categoria !== 'string' || !CATEGORIAS_CUSTO_VARIAVEL.has(categoria)) {
        return res.status(400).json({
          error: 'categoria inválida',
          valoresPermitidos: [...CATEGORIAS_CUSTO_VARIAVEL]
        });
      }
      data.categoria = categoria;
    }
    if (tipoCalculo !== undefined) {
      if (typeof tipoCalculo !== 'string' || !TIPOS_CALCULO_CUSTO_VARIAVEL.has(tipoCalculo)) {
        return res.status(400).json({
          error: 'tipoCalculo inválido',
          valoresPermitidos: [...TIPOS_CALCULO_CUSTO_VARIAVEL]
        });
      }
      data.tipoCalculo = tipoCalculo;
    }
    if (valor !== undefined) {
      if (valor === null || isNaN(Number(valor))) {
        return res.status(400).json({ error: 'valor inválido' });
      }
      if (Number(valor) < 0) {
        return res.status(400).json({ error: 'valor deve ser maior ou igual a zero' });
      }
      data.valor = Number(valor);
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }

    const updated = await prisma.custoVariavel.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar custo variável' });
  }
});

app.delete('/api/custos-variaveis/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoVariavel.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo variável não encontrado' });
    }

    const desativado = await prisma.custoVariavel.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar custo variável' });
  }
});

// ===== Faturamento Diário =====

function parseDataFaturamento(input) {
  if (typeof input !== 'string') return null;
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

function comTicketMedio(registro) {
  const valor = Number(registro.valorTotal);
  const qtd = Number(registro.quantidadePedidos);
  const ticketMedio = qtd === 0 ? 0 : Number((valor / qtd).toFixed(2));
  return { ...registro, ticketMedio };
}

app.get('/api/faturamento', async (req, res) => {
  try {
    const where = { ativo: true };

    const { mes } = req.query;
    if (mes !== undefined) {
      const m = String(mes).match(/^(\d{4})-(\d{2})$/);
      if (!m) {
        return res.status(400).json({ error: 'mes deve estar no formato YYYY-MM' });
      }
      const ano = Number(m[1]);
      const mesNum = Number(m[2]);
      if (mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ error: 'mes inválido' });
      }
      const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
      const fim = new Date(Date.UTC(ano, mesNum, 1));
      where.data = { gte: inicio, lt: fim };
    }

    const registros = await prisma.faturamentoDiario.findMany({
      where,
      orderBy: { data: 'desc' }
    });

    res.json(registros.map(comTicketMedio));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar faturamento' });
  }
});

app.post('/api/faturamento', async (req, res) => {
  try {
    const { data, valorTotal, quantidadePedidos, canal, observacoes } = req.body ?? {};

    if (data === undefined || data === null || data === '') {
      return res.status(400).json({ error: 'data é obrigatória' });
    }
    const dataParsed = parseDataFaturamento(data);
    if (!dataParsed) {
      return res.status(400).json({ error: 'data inválida (use formato YYYY-MM-DD)' });
    }
    if (valorTotal === undefined || valorTotal === null || isNaN(Number(valorTotal))) {
      return res.status(400).json({ error: 'valorTotal é obrigatório e deve ser numérico' });
    }
    if (Number(valorTotal) < 0) {
      return res.status(400).json({ error: 'valorTotal deve ser maior ou igual a zero' });
    }
    if (
      quantidadePedidos === undefined ||
      quantidadePedidos === null ||
      !Number.isInteger(Number(quantidadePedidos))
    ) {
      return res
        .status(400)
        .json({ error: 'quantidadePedidos é obrigatória e deve ser inteira' });
    }
    if (Number(quantidadePedidos) < 0) {
      return res
        .status(400)
        .json({ error: 'quantidadePedidos deve ser maior ou igual a zero' });
    }

    const registro = await prisma.faturamentoDiario.create({
      data: {
        data: dataParsed,
        valorTotal: Number(valorTotal),
        quantidadePedidos: Number(quantidadePedidos),
        canal: canal ? String(canal).trim() : null,
        observacoes: observacoes ? String(observacoes).trim() : null,
        ativo: true
      }
    });

    res.status(201).json(comTicketMedio(registro));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar faturamento' });
  }
});

app.put('/api/faturamento/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.faturamentoDiario.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Faturamento não encontrado' });
    }

    const { data, valorTotal, quantidadePedidos, canal, observacoes, ativo } = req.body ?? {};
    const update = {};

    if (data !== undefined) {
      const dataParsed = parseDataFaturamento(data);
      if (!dataParsed) {
        return res.status(400).json({ error: 'data inválida (use formato YYYY-MM-DD)' });
      }
      update.data = dataParsed;
    }
    if (valorTotal !== undefined) {
      if (valorTotal === null || isNaN(Number(valorTotal))) {
        return res.status(400).json({ error: 'valorTotal inválido' });
      }
      if (Number(valorTotal) < 0) {
        return res.status(400).json({ error: 'valorTotal deve ser maior ou igual a zero' });
      }
      update.valorTotal = Number(valorTotal);
    }
    if (quantidadePedidos !== undefined) {
      if (quantidadePedidos === null || !Number.isInteger(Number(quantidadePedidos))) {
        return res.status(400).json({ error: 'quantidadePedidos inválida' });
      }
      if (Number(quantidadePedidos) < 0) {
        return res
          .status(400)
          .json({ error: 'quantidadePedidos deve ser maior ou igual a zero' });
      }
      update.quantidadePedidos = Number(quantidadePedidos);
    }
    if (canal !== undefined) {
      update.canal = canal === null || canal === '' ? null : String(canal).trim();
    }
    if (observacoes !== undefined) {
      update.observacoes =
        observacoes === null || observacoes === '' ? null : String(observacoes).trim();
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      update.ativo = ativo;
    }

    const updated = await prisma.faturamentoDiario.update({ where: { id }, data: update });
    res.json(comTicketMedio(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar faturamento' });
  }
});

app.delete('/api/faturamento/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.faturamentoDiario.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Faturamento não encontrado' });
    }

    const desativado = await prisma.faturamentoDiario.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(comTicketMedio(desativado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar faturamento' });
  }
});

// ===== Ponto de Equilíbrio =====

app.get('/api/ponto-equilibrio', async (req, res) => {
  try {
    const { mes } = req.query;
    if (mes === undefined || mes === '') {
      return res.status(400).json({ error: 'mes é obrigatório (formato YYYY-MM)' });
    }
    const m = String(mes).match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return res.status(400).json({ error: 'mes deve estar no formato YYYY-MM' });
    }
    const ano = Number(m[1]);
    const mesNum = Number(m[2]);
    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'mes inválido' });
    }
    const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
    const fim = new Date(Date.UTC(ano, mesNum, 1));

    const round2 = (n) => Number(n.toFixed(2));

    const [custosFixos, faturamentos, produtos, custosVariaveis] = await Promise.all([
      prisma.custoFixo.findMany({ where: { ativo: true } }),
      prisma.faturamentoDiario.findMany({
        where: { ativo: true, data: { gte: inicio, lt: fim } }
      }),
      prisma.produto.findMany({
        where: { ativo: true },
        include: { fichaTecnica: { include: FICHA_INSUMO_INCLUDE } }
      }),
      prisma.custoVariavel.findMany({ where: { ativo: true } })
    ]);

    const totalCustosFixos = custosFixos.reduce(
      (acc, c) => acc + Number(c.valorMensal),
      0
    );

    const faturamentoAtual = faturamentos.reduce(
      (acc, f) => acc + Number(f.valorTotal),
      0
    );
    const totalPedidos = faturamentos.reduce(
      (acc, f) => acc + Number(f.quantidadePedidos),
      0
    );

    let somaCmv = 0;
    let qtdProdutosValidos = 0;
    for (const p of produtos) {
      const preco = Number(p.precoVenda);
      if (preco <= 0) continue;
      if (!p.fichaTecnica || p.fichaTecnica.length === 0) continue;
      const custoFicha = computeFichaTotals(p.fichaTecnica).custoTotalFicha;
      somaCmv += (custoFicha / preco) * 100;
      qtdProdutosValidos += 1;
    }
    const cmvMedioPercentual = qtdProdutosValidos === 0 ? 0 : somaCmv / qtdProdutosValidos;

    let custosVariaveisPercentuais = 0;
    let somaCustosPorPedido = 0;
    let custosVariaveisFixosMensais = 0;
    for (const cv of custosVariaveis) {
      const v = Number(cv.valor);
      if (cv.tipoCalculo === 'PERCENTUAL_FATURAMENTO') {
        custosVariaveisPercentuais += v;
      } else if (cv.tipoCalculo === 'VALOR_POR_PEDIDO') {
        somaCustosPorPedido += v;
      } else if (cv.tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL') {
        custosVariaveisFixosMensais += v;
      }
    }

    const custoVariavelPedidosTotal = totalPedidos * somaCustosPorPedido;

    const percentualCustosPorPedido =
      faturamentoAtual === 0 ? 0 : (custoVariavelPedidosTotal / faturamentoAtual) * 100;

    const percentualCustosFixosMensaisVariaveis =
      faturamentoAtual === 0 ? 0 : (custosVariaveisFixosMensais / faturamentoAtual) * 100;

    // Base operacional do ponto de equilíbrio: CMV ALVO configurado.
    // O CMV real médio dos produtos (média simples) era distorcido por produtos
    // com CMV > 100% e segue sendo retornado apenas como diagnóstico.
    const config = await getConfigPrecificacao();
    const cmvAlvoUsado = Number(config.cmvAlvoPercentual);

    const margemContribuicaoReal =
      100 -
      cmvAlvoUsado -
      custosVariaveisPercentuais -
      percentualCustosPorPedido -
      percentualCustosFixosMensaisVariaveis;

    let pontoEquilibrio = null;
    let diferencaParaEquilibrio = null;
    let percentualAtingido = null;
    let status;
    let mensagem;

    if (margemContribuicaoReal <= 0) {
      status = 'MARGEM_INSUFICIENTE';
      mensagem =
        'A margem de contribuição está zerada ou negativa. Revise CMV, custos variáveis e preços.';
    } else {
      pontoEquilibrio = totalCustosFixos / (margemContribuicaoReal / 100);
      diferencaParaEquilibrio = pontoEquilibrio - faturamentoAtual;
      percentualAtingido =
        pontoEquilibrio > 0 ? (faturamentoAtual / pontoEquilibrio) * 100 : null;

      if (faturamentoAtual >= pontoEquilibrio) {
        status = 'ACIMA_DO_EQUILIBRIO';
        mensagem = 'A operação já ultrapassou o ponto de equilíbrio no mês.';
      } else if (percentualAtingido !== null && percentualAtingido >= 80) {
        status = 'PROXIMO_DO_EQUILIBRIO';
        mensagem = 'A operação está próxima do ponto de equilíbrio.';
      } else {
        status = 'ABAIXO_DO_EQUILIBRIO';
        mensagem = 'A operação ainda está abaixo do ponto de equilíbrio.';
      }
    }

    res.json({
      mes,
      totalCustosFixos: round2(totalCustosFixos),
      faturamentoAtual: round2(faturamentoAtual),
      totalPedidos,
      // Diagnóstico: CMV real médio dos produtos (não é mais a base do PE)
      cmvMedioPercentual: round2(cmvMedioPercentual),
      cmvMedioRealProdutos: round2(cmvMedioPercentual),
      // Base operacional usada no cálculo do ponto de equilíbrio
      cmvAlvoUsado: round2(cmvAlvoUsado),
      cmvBasePontoEquilibrio: round2(cmvAlvoUsado),
      fonteCmvPontoEquilibrio: 'CMV_ALVO',
      mensagemBaseCalculo:
        'O ponto de equilíbrio usa o CMV alvo configurado como base operacional.',
      avisoCmvReal:
        qtdProdutosValidos > 0 && cmvMedioPercentual > cmvAlvoUsado
          ? 'Existem produtos com CMV acima do alvo. Eles não foram usados como base do ponto de equilíbrio, mas devem ser revisados.'
          : null,
      custosVariaveisPercentuais: round2(custosVariaveisPercentuais),
      somaCustosPorPedido: round2(somaCustosPorPedido),
      custoVariavelPedidosTotal: round2(custoVariavelPedidosTotal),
      percentualCustosPorPedido: round2(percentualCustosPorPedido),
      custosVariaveisFixosMensais: round2(custosVariaveisFixosMensais),
      percentualCustosFixosMensaisVariaveis: round2(percentualCustosFixosMensaisVariaveis),
      margemContribuicaoReal: round2(margemContribuicaoReal),
      pontoEquilibrio: pontoEquilibrio === null ? null : round2(pontoEquilibrio),
      diferencaParaEquilibrio:
        diferencaParaEquilibrio === null ? null : round2(diferencaParaEquilibrio),
      percentualAtingido: percentualAtingido === null ? null : round2(percentualAtingido),
      status,
      mensagem
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao calcular ponto de equilíbrio' });
  }
});

// ===== CMV Global =====
// Mês-a-mês: consumo = estoqueInicial (contagem do mês anterior) + compras do
// mês - estoqueFinal (contagem do próprio mês). O cálculo em si (puro, sem
// Prisma) vive em cmv/calculo.js — aqui só busca os dados do tenant e monta a
// evolução dos últimos 12 meses reaproveitando 3 queries de range (contagens,
// compras, faturamento), sem N+1 por mês.

function cmvMesAnterior({ ano, mes }) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}
const cmvChave = (ano, mes) => `${ano}-${mes}`;

app.get('/api/cmv', async (req, res) => {
  try {
    const agora = new Date();
    const ano = req.query.ano !== undefined && req.query.ano !== ''
      ? Number(req.query.ano) : agora.getUTCFullYear();
    const mes = req.query.mes !== undefined && req.query.mes !== ''
      ? Number(req.query.mes) : agora.getUTCMonth() + 1;
    if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'ano/mes inválidos' });
    }

    const round2 = (n) => Number((Number(n) || 0).toFixed(2));

    // Os 12 pontos da evolução (do mês pedido p/ trás), em ordem cronológica
    // (mais antigo -> mais novo). O ponto mais antigo precisa da contagem de UM
    // mês antes dele (offset 12), que cai sempre em ano-1 (12 meses = 1 ano) —
    // por isso o range de busca abaixo cobre exatamente [ano - 1, ano].
    const pontosEvolucao = [];
    {
      let atual = { ano, mes };
      for (let i = 0; i < 12; i++) {
        pontosEvolucao.unshift(atual);
        atual = cmvMesAnterior(atual);
      }
    }

    const inicioRange = new Date(Date.UTC(ano - 1, 0, 1));
    const fimRange = new Date(Date.UTC(ano + 1, 0, 1)); // exclusivo

    const [contagens, compras, faturamentos, config] = await Promise.all([
      prisma.cmvContagem.findMany({
        where: { ano: { in: [ano - 1, ano] } },
        include: { itens: { orderBy: { nome: 'asc' } } }
      }),
      prisma.cmvCompra.findMany({
        where: { ano: { in: [ano - 1, ano] } },
        include: { itens: true },
        orderBy: { data: 'asc' }
      }),
      prisma.faturamentoDiario.findMany({
        where: { ativo: true, data: { gte: inicioRange, lt: fimRange } }
      }),
      getConfigPrecificacao()
    ]);

    const contagemPorChave = new Map(contagens.map((c) => [cmvChave(c.ano, c.mes), c]));
    const comprasPorChave = new Map();
    for (const c of compras) {
      const k = cmvChave(c.ano, c.mes);
      comprasPorChave.set(k, (comprasPorChave.get(k) || 0) + Number(c.valor));
    }
    const faturamentoPorChave = new Map();
    for (const f of faturamentos) {
      const d = f.data;
      const k = cmvChave(d.getUTCFullYear(), d.getUTCMonth() + 1);
      faturamentoPorChave.set(k, (faturamentoPorChave.get(k) || 0) + Number(f.valorTotal));
    }

    const evolucao = pontosEvolucao.map(({ ano: a, mes: m }) => {
      const atualC = contagemPorChave.get(cmvChave(a, m));
      const antPt = cmvMesAnterior({ ano: a, mes: m });
      const antC = contagemPorChave.get(cmvChave(antPt.ano, antPt.mes));
      const fat = faturamentoPorChave.get(cmvChave(a, m)) || 0;
      let cmvPercent = null;
      if (atualC && antC && fat > 0) {
        const comprasM = comprasPorChave.get(cmvChave(a, m)) || 0;
        cmvPercent = calcularCmvGlobal({
          estoqueInicial: Number(antC.valorTotal),
          compras: comprasM,
          estoqueFinal: Number(atualC.valorTotal),
          faturamento: fat,
          meta: null
        }).cmvPercent;
      }
      return { ano: a, mes: m, cmvPercent };
    });

    const contagemFinalRec = contagemPorChave.get(cmvChave(ano, mes)) || null;
    const contagemAnteriorPt = cmvMesAnterior({ ano, mes });
    const contagemAnteriorRec = contagemPorChave.get(cmvChave(contagemAnteriorPt.ano, contagemAnteriorPt.mes)) || null;

    const estoqueFinal = contagemFinalRec ? Number(contagemFinalRec.valorTotal) : 0;
    const estoqueInicial = contagemAnteriorRec ? Number(contagemAnteriorRec.valorTotal) : 0;

    const comprasMesAtual = compras.filter((c) => c.ano === ano && c.mes === mes);
    const comprasTotal = comprasMesAtual.reduce((acc, c) => acc + Number(c.valor), 0);
    const faturamentoTotal = faturamentoPorChave.get(cmvChave(ano, mes)) || 0;
    const meta = Number(config?.cmvAlvoPercentual ?? 32);

    const resultado = calcularCmvGlobal({
      estoqueInicial, compras: comprasTotal, estoqueFinal, faturamento: faturamentoTotal, meta
    });

    const contagemFinal = contagemFinalRec ? {
      id: contagemFinalRec.id,
      ano: contagemFinalRec.ano,
      mes: contagemFinalRec.mes,
      valorTotal: round2(contagemFinalRec.valorTotal),
      observacao: contagemFinalRec.observacao ?? null,
      itens: contagemFinalRec.itens.map((i) => ({
        id: i.id,
        insumoId: i.insumoId ?? null,
        nome: i.nome,
        unidade: i.unidade ?? null,
        custoUnitario: round2(i.custoUnitario),
        quantidade: round2(i.quantidade),
        valor: round2(i.valor)
      }))
    } : null;

    res.json({
      ano,
      mes,
      estoqueInicial: round2(estoqueInicial),
      estoqueFinal: round2(estoqueFinal),
      compras: {
        total: round2(comprasTotal),
        lista: comprasMesAtual.map((c) => ({
          id: c.id,
          ano: c.ano,
          mes: c.mes,
          data: c.data,
          valor: round2(c.valor),
          fornecedor: c.fornecedor ?? null,
          observacao: c.observacao ?? null,
          itens: c.itens.map((i) => ({
            id: i.id,
            insumoId: i.insumoId ?? null,
            nome: i.nome,
            custoUnitario: round2(i.custoUnitario),
            quantidade: round2(i.quantidade),
            valor: round2(i.valor)
          }))
        }))
      },
      faturamento: round2(faturamentoTotal),
      meta: round2(meta),
      resultado,
      contagemFinal,
      temContagemAnterior: !!contagemAnteriorRec,
      evolucao
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao calcular CMV Global' });
  }
});

// Salva a contagem de estoque (item a item) de um mês — SUBSTITUI os itens
// antigos daquele mês. O upsert é por (empresaId, ano, mes); dentro da mesma
// $transaction o contexto de tenant é preservado (mesma execução assíncrona),
// mas passamos empresaId explícito no create/createMany como defense-in-depth.
app.put('/api/cmv/contagem', async (req, res) => {
  try {
    const { observacao, itens } = req.body ?? {};
    const ano = Number(req.body?.ano);
    const mes = Number(req.body?.mes);
    if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'ano/mes inválidos' });
    }
    if (!Array.isArray(itens)) {
      return res.status(400).json({ error: 'itens deve ser uma lista' });
    }

    const round2 = (n) => Number((Number(n) || 0).toFixed(2));

    const itensValidos = [];
    for (const item of itens) {
      const nome = String(item?.nome ?? '').trim();
      if (!nome) return res.status(400).json({ error: 'Todo item precisa de nome' });
      const custoUnitario = Number(item?.custoUnitario);
      const quantidade = Number(item?.quantidade);
      if (!Number.isFinite(custoUnitario) || custoUnitario < 0) {
        return res.status(400).json({ error: `custoUnitario inválido para o item "${nome}"` });
      }
      if (!Number.isFinite(quantidade) || quantidade < 0) {
        return res.status(400).json({ error: `quantidade inválida para o item "${nome}"` });
      }
      itensValidos.push({
        insumoId: item?.insumoId != null && item.insumoId !== '' ? Number(item.insumoId) : null,
        nome,
        unidade: item?.unidade ? String(item.unidade).trim() : null,
        custoUnitario,
        quantidade,
        valor: round2(quantidade * custoUnitario)
      });
    }
    const valorTotal = round2(itensValidos.reduce((acc, i) => acc + i.valor, 0));
    const observacaoNorm =
      observacao != null && String(observacao).trim() !== '' ? String(observacao).trim() : null;

    const empresaId = getEmpresaIdAtual();

    const contagem = await prisma.$transaction(async (tx) => {
      const salva = await tx.cmvContagem.upsert({
        where: { empresaId_ano_mes: { empresaId, ano, mes } },
        create: { empresaId, ano, mes, valorTotal, observacao: observacaoNorm },
        update: { valorTotal, observacao: observacaoNorm }
      });

      await tx.cmvContagemItem.deleteMany({ where: { contagemId: salva.id } });

      if (itensValidos.length > 0) {
        await tx.cmvContagemItem.createMany({
          data: itensValidos.map((i) => ({ ...i, empresaId, contagemId: salva.id }))
        });
      }

      return tx.cmvContagem.findUnique({
        where: { id: salva.id },
        include: { itens: { orderBy: { nome: 'asc' } } }
      });
    });

    res.json({
      id: contagem.id,
      ano: contagem.ano,
      mes: contagem.mes,
      valorTotal: round2(contagem.valorTotal),
      observacao: contagem.observacao ?? null,
      itens: contagem.itens.map((i) => ({
        id: i.id,
        insumoId: i.insumoId ?? null,
        nome: i.nome,
        unidade: i.unidade ?? null,
        custoUnitario: round2(i.custoUnitario),
        quantidade: round2(i.quantidade),
        valor: round2(i.valor)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao salvar a contagem de estoque' });
  }
});

// Valida os itens (opcionais) de uma compra do CMV Global e já calcula o
// `valor` de cada um (round2(qtd×custo)) — reaproveitado por POST e PUT.
function validarItensCompra(itens) {
  if (itens === undefined) return { itens: null, error: null };
  if (!Array.isArray(itens)) return { itens: null, error: 'itens deve ser uma lista' };

  const round2 = (n) => Number((Number(n) || 0).toFixed(2));
  const itensValidos = [];
  for (const item of itens) {
    const nome = String(item?.nome ?? '').trim();
    if (!nome) return { itens: null, error: 'Todo item precisa de nome' };
    const custoUnitario = Number(item?.custoUnitario);
    const quantidade = Number(item?.quantidade);
    if (!Number.isFinite(custoUnitario) || custoUnitario < 0) {
      return { itens: null, error: `custoUnitario inválido para o item "${nome}"` };
    }
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      return { itens: null, error: `quantidade inválida para o item "${nome}"` };
    }
    itensValidos.push({
      insumoId: item?.insumoId != null && item.insumoId !== '' ? Number(item.insumoId) : null,
      nome,
      custoUnitario,
      quantidade,
      valor: round2(quantidade * custoUnitario)
    });
  }
  return { itens: itensValidos, error: null };
}

function serializarCompra(compra) {
  const round2 = (n) => Number((Number(n) || 0).toFixed(2));
  return {
    id: compra.id,
    ano: compra.ano,
    mes: compra.mes,
    data: compra.data,
    valor: round2(compra.valor),
    fornecedor: compra.fornecedor ?? null,
    observacao: compra.observacao ?? null,
    itens: compra.itens.map((i) => ({
      id: i.id,
      insumoId: i.insumoId ?? null,
      nome: i.nome,
      custoUnitario: round2(i.custoUnitario),
      quantidade: round2(i.quantidade),
      valor: round2(i.valor)
    }))
  };
}

// Registra uma compra de insumos do mês (CMV Global) — itens opcionais. Se
// vierem itens (length > 0), `valor` é recalculado como a soma dos itens;
// sem itens, respeita o `valor` informado no body. Mesmo padrão do PUT da
// contagem: empresaId explícito + $transaction (não usa tenantStore.run
// arrow-lazy, que perderia o contexto de tenant).
app.post('/api/cmv/compra', async (req, res) => {
  try {
    const { fornecedor, observacao, itens } = req.body ?? {};
    const ano = Number(req.body?.ano);
    const mes = Number(req.body?.mes);
    if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'ano/mes inválidos' });
    }
    const dataCompra = parseDataFaturamento(req.body?.data);
    if (!dataCompra) {
      return res.status(400).json({ error: 'data inválida (use formato YYYY-MM-DD)' });
    }

    const { itens: itensValidos, error: itensError } = validarItensCompra(itens);
    if (itensError) return res.status(400).json({ error: itensError });

    const round2 = (n) => Number((Number(n) || 0).toFixed(2));
    let valor;
    if (itensValidos && itensValidos.length > 0) {
      valor = round2(itensValidos.reduce((acc, i) => acc + i.valor, 0));
    } else {
      valor = Number(req.body?.valor);
      if (!Number.isFinite(valor) || valor < 0) {
        return res.status(400).json({ error: 'valor inválido' });
      }
      valor = round2(valor);
    }

    const fornecedorNorm =
      fornecedor != null && String(fornecedor).trim() !== '' ? String(fornecedor).trim() : null;
    const observacaoNorm =
      observacao != null && String(observacao).trim() !== '' ? String(observacao).trim() : null;

    const empresaId = getEmpresaIdAtual();

    const compra = await prisma.$transaction(async (tx) => {
      const criada = await tx.cmvCompra.create({
        data: {
          empresaId, ano, mes, data: dataCompra, valor,
          fornecedor: fornecedorNorm, observacao: observacaoNorm
        }
      });

      if (itensValidos && itensValidos.length > 0) {
        await tx.cmvCompraItem.createMany({
          data: itensValidos.map((i) => ({ ...i, empresaId, compraId: criada.id }))
        });
      }

      return tx.cmvCompra.findUnique({
        where: { id: criada.id },
        include: { itens: true }
      });
    });

    res.status(201).json(serializarCompra(compra));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao registrar a compra' });
  }
});

// Atualiza uma compra existente (CMV Global). Só altera os campos enviados
// no body (partial update, igual PUT /api/produtos/:id e /api/faturamento/:id);
// se `itens` vier, substitui a lista inteira (deleteMany + createMany na
// mesma transação) e recalcula `valor` quando a lista não vier vazia.
app.put('/api/cmv/compra/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existente = await prisma.cmvCompra.findUnique({ where: { id } });
    if (!existente) {
      return res.status(404).json({ error: 'Compra não encontrada' });
    }

    const { fornecedor, observacao, itens } = req.body ?? {};
    const round2 = (n) => Number((Number(n) || 0).toFixed(2));
    const data = {};

    if (req.body?.ano !== undefined) {
      const ano = Number(req.body.ano);
      if (!Number.isInteger(ano)) {
        return res.status(400).json({ error: 'ano inválido' });
      }
      data.ano = ano;
    }
    if (req.body?.mes !== undefined) {
      const mes = Number(req.body.mes);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        return res.status(400).json({ error: 'mes inválido' });
      }
      data.mes = mes;
    }
    if (req.body?.data !== undefined) {
      const dataParsed = parseDataFaturamento(req.body.data);
      if (!dataParsed) {
        return res.status(400).json({ error: 'data inválida (use formato YYYY-MM-DD)' });
      }
      data.data = dataParsed;
    }
    if (fornecedor !== undefined) {
      data.fornecedor =
        fornecedor != null && String(fornecedor).trim() !== '' ? String(fornecedor).trim() : null;
    }
    if (observacao !== undefined) {
      data.observacao =
        observacao != null && String(observacao).trim() !== '' ? String(observacao).trim() : null;
    }

    const { itens: itensValidos, error: itensError } = validarItensCompra(itens);
    if (itensError) return res.status(400).json({ error: itensError });

    if (itensValidos && itensValidos.length > 0) {
      data.valor = round2(itensValidos.reduce((acc, i) => acc + i.valor, 0));
    } else if (req.body?.valor !== undefined) {
      const valor = Number(req.body.valor);
      if (!Number.isFinite(valor) || valor < 0) {
        return res.status(400).json({ error: 'valor inválido' });
      }
      data.valor = round2(valor);
    }

    const empresaId = getEmpresaIdAtual();

    const compra = await prisma.$transaction(async (tx) => {
      await tx.cmvCompra.update({ where: { id }, data });

      if (itensValidos !== null) {
        await tx.cmvCompraItem.deleteMany({ where: { compraId: id } });
        if (itensValidos.length > 0) {
          await tx.cmvCompraItem.createMany({
            data: itensValidos.map((i) => ({ ...i, empresaId, compraId: id }))
          });
        }
      }

      return tx.cmvCompra.findUnique({ where: { id }, include: { itens: true } });
    });

    res.json(serializarCompra(compra));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar a compra' });
  }
});

// Remove uma compra do CMV Global. `deleteMany` (mesmo padrão de
// /api/recrutamento/cargos/:id etc.) porque o id sozinho não prova posse — a
// extension do tenant injeta o filtro empresaId; os itens caem em cascade via FK.
app.delete('/api/cmv/compra/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    await prisma.cmvCompra.deleteMany({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover a compra' });
  }
});


// ===== Dashboard (Meta Ads do cliente, via HUB) =====
// Resolve a loja atual → clienteId → pede ao HUB os insights do Meta Ads da conta
// vinculada. O token Meta nunca chega ao H360; o HUB devolve KPIs + série prontos.
// Sem conta vinculada ⇒ { conectado: false } (a tela mostra o estado "conecte").
app.get('/api/dashboard/meta', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false, conta: null });

    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const datePreset = String(req.query.datePreset || 'last_14d');
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cliente-meta-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until, datePreset }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    }
    res.json(data);
  } catch (err) {
    console.error('[dashboard/meta]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar o Meta Ads agora.' });
  }
});

// ===== Dashboard (Google Ads do cliente, via HUB) =====
// Mesmo padrão do Meta acima: resolve a loja atual → clienteId → pede ao HUB os
// insights do Google Ads da conta vinculada. Sem clienteId ⇒ { conectado: false }.
app.get('/api/dashboard/google', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false });

    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cliente-google-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    }
    res.json(data);
  } catch (err) {
    console.error('[dashboard/google]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar o Google Ads agora.' });
  }
});

// Instagram do cliente (via HUB). Mesmo isolamento do Meta: resolve a loja → clienteId
// → o HUB devolve só o perfil VINCULADO àquele cliente. Sem perfil ⇒ { conectado:false }.
app.get('/api/dashboard/instagram', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false, perfil: null });

    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const datePreset = String(req.query.datePreset || 'last_30d');
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cliente-instagram-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until, datePreset }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    }
    res.json(data);
  } catch (err) {
    console.error('[dashboard/instagram]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar o Instagram agora.' });
  }
});

// Vendas do Cardápio Web do cliente (via HUB). Mesmo isolamento: resolve a loja →
// clienteId → o HUB devolve KPIs (faturamento/pedidos/ticket/novos clientes) + série
// diária, do banco sincronizado. Sem CW vinculado ⇒ { conectado:false } (some a seção).
app.get('/api/dashboard/cardapio', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false });

    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cliente-cardapio-dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    if (data && typeof data === 'object') data.faixas = await faixasCardapioAtuais();
    res.json(data);
  } catch (err) {
    console.error('[dashboard/cardapio]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar as vendas agora.' });
  }
});

// Faixas (ideal/atenção) dos Tempos operacionais — configuráveis por loja. Defaults de
// fábrica quando a loja ainda não configurou. GET lê; PUT salva (upsert por empresa).
const FAIXAS_CARDAPIO_PADRAO = { preparoIdeal: 25, preparoAtencao: 40, entregaIdeal: 20, entregaAtencao: 35, totalIdeal: 45, totalAtencao: 70 };
const faixasPublicas = (c) => ({
  preparoIdeal: c.preparoIdeal, preparoAtencao: c.preparoAtencao,
  entregaIdeal: c.entregaIdeal, entregaAtencao: c.entregaAtencao,
  totalIdeal: c.totalIdeal, totalAtencao: c.totalAtencao,
});
async function faixasCardapioAtuais() {
  const c = await prisma.tempoFaixaCardapioConfig.findFirst();
  return c ? faixasPublicas(c) : { ...FAIXAS_CARDAPIO_PADRAO };
}

app.get('/api/dashboard/cardapio-faixas', async (req, res) => {
  try {
    if (!getEmpresaIdAtual()) return res.status(404).json({ error: 'Loja não resolvida' });
    res.json(await faixasCardapioAtuais());
  } catch (err) {
    console.error('[dashboard/cardapio-faixas GET]', err?.message || err);
    res.status(500).json({ error: 'Não foi possível carregar as faixas.' });
  }
});

app.put('/api/dashboard/cardapio-faixas', async (req, res) => {
  try {
    if (!getEmpresaIdAtual()) return res.status(404).json({ error: 'Loja não resolvida' });
    const b = req.body || {};
    const num = (v, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 1440 ? n : def; };
    const dados = {
      preparoIdeal: num(b.preparoIdeal, 25), preparoAtencao: num(b.preparoAtencao, 40),
      entregaIdeal: num(b.entregaIdeal, 20), entregaAtencao: num(b.entregaAtencao, 35),
      totalIdeal: num(b.totalIdeal, 45), totalAtencao: num(b.totalAtencao, 70),
    };
    // "atenção" não pode ser menor que "ideal" em cada card.
    if (dados.preparoAtencao < dados.preparoIdeal) dados.preparoAtencao = dados.preparoIdeal;
    if (dados.entregaAtencao < dados.entregaIdeal) dados.entregaAtencao = dados.entregaIdeal;
    if (dados.totalAtencao < dados.totalIdeal) dados.totalAtencao = dados.totalIdeal;
    const existente = await prisma.tempoFaixaCardapioConfig.findFirst();
    const c = existente
      ? await prisma.tempoFaixaCardapioConfig.update({ where: { id: existente.id }, data: dados })
      : await prisma.tempoFaixaCardapioConfig.create({ data: dados });
    res.json(faixasPublicas(c));
  } catch (err) {
    console.error('[dashboard/cardapio-faixas PUT]', err?.message || err);
    res.status(500).json({ error: 'Não foi possível salvar as faixas.' });
  }
});

// Histórico de faltas (ranking + episódios) do período — via HUB.
app.get('/api/dashboard/cardapio-faltas-historico', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false });
    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cardapio-faltas-historico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    res.json(data);
  } catch (err) {
    console.error('[dashboard/cardapio-faltas-historico]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar o histórico agora.' });
  }
});

// ── AnotaAI (proxies p/ o HUB) — fonte alternativa ao Cardápio Web ───────────
// Qual a fonte de cardápio da loja: 'anotaai' | 'cw' | null. O front usa p/ montar o módulo certo.
app.get('/api/dashboard/cardapio-fonte', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ fonte: null });
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cliente-cardapio-fonte`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId }),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(r.ok ? data : { fonte: null });
  } catch (err) {
    console.error('[dashboard/cardapio-fonte]', err?.message || err);
    res.json({ fonte: null });
  }
});

// Dashboard de vendas AnotaAI (mesmo shape do /dashboard/cardapio; injeta faixas locais).
app.get('/api/dashboard/anotaai', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false });
    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/cliente-anotaai-dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    if (data && typeof data === 'object') data.faixas = await faixasCardapioAtuais();
    res.json(data);
  } catch (err) {
    console.error('[dashboard/anotaai]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar as vendas agora.' });
  }
});

// Histórico de faltas AnotaAI (mesmo shape do /dashboard/cardapio-faltas-historico).
app.get('/api/dashboard/anotaai-faltas-historico', async (req, res) => {
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json({ conectado: false });
    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/anotaai-faltas-historico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    res.json(data);
  } catch (err) {
    console.error('[dashboard/anotaai-faltas-historico]', err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar o histórico agora.' });
  }
});

// ===== Relatórios (prestação de contas por fonte, via HUB) =====
// Proxy fino que resolve a loja → clienteId → pede ao HUB os insights da fonte e
// devolve o CONTRATO ÚNICO normalizado. Reusa os endpoints internos: meta e cardapio
// (já existentes) e google (novo). Sem conta ⇒ contrato "desconectado".
const REL_FONTE_ENDPOINT = {
  meta: 'cliente-meta-insights',
  google: 'cliente-google-insights',
  cardapio: 'cliente-cardapio-dashboard',
};
app.get('/api/relatorios/:fonte', async (req, res) => {
  const fonte = String(req.params.fonte || '').toLowerCase();
  if (!FONTES.includes(fonte)) return res.status(404).json({ error: 'Fonte de relatório desconhecida' });
  try {
    const empresaId = getEmpresaIdAtual();
    if (!empresaId) return res.status(404).json({ error: 'Loja não resolvida' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!loja?.clienteId) return res.json(normalizarRelatorio(fonte, { conectado: false }));

    const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const since = isYmd(req.query.since) ? req.query.since : null;
    const until = isYmd(req.query.until) ? req.query.until : null;
    const datePreset = String(req.query.datePreset || 'last_30d');
    const token = jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
    const r = await fetch(`${HUB_API_URL}/internal/${REL_FONTE_ENDPOINT[fonte]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId: loja.clienteId, since, until, datePreset }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status === 401 ? 401 : 502).json({ error: data?.error || 'Erro ao consultar o HUB' });
    }
    res.json(normalizarRelatorio(fonte, data));
  } catch (err) {
    console.error('[relatorios]', fonte, err?.message || err);
    res.status(502).json({ error: 'Não foi possível carregar o relatório agora.' });
  }
});

// ===================== Dep. Pessoal: Ponto Facial (Fase 1) =====================
// Reconhecimento no tablet (face-api.js); aqui só guardamos/comparamos VETORES.
const PONTO_LIMIAR = 0.55; // distância euclidiana máx. p/ considerar "reconhecido"
const PONTO_TIPOS = ['ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'SAIDA'];
const PONTO_LABEL = { ENTRADA: 'Entrada', SAIDA_INTERVALO: 'Saída p/ intervalo', RETORNO_INTERVALO: 'Retorno do intervalo', SAIDA: 'Saída' };

function distEuclid(a, b) {
  let s = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}
// Acha o melhor funcionário para um vetor detectado (menor distância). empresaId manual.
async function melhorMatchFacial(descritor, empresaId) {
  if (!Array.isArray(descritor) || descritor.length < 100) return null;
  const faces = await prisma.funcionarioFace.findMany({ where: { empresaId } });
  let best = null;
  for (const f of faces) {
    const amostras = Array.isArray(f.descritoresJson) ? f.descritoresJson : [];
    for (const s of amostras) {
      if (!Array.isArray(s) || s.length < 100) continue;
      const d = distEuclid(descritor, s);
      if (best === null || d < best.distancia) best = { funcionarioId: f.funcionarioId, distancia: d };
    }
  }
  return best;
}
// Próxima marcação esperada (auto-sequência entrada→intervalo→retorno→saída).
// A janela é o dia de EXPEDIENTE, não o dia civil: a jornada vira a meia-noite,
// e cortar à 00:00 fazia a saída da madrugada abrir uma sequência nova — a
// chegada seguinte então era lida como saída.
async function proximoTipoPonto(funcionarioId, empresaId) {
  const { de, ate } = janelaExpedienteAtual();
  const regs = await prisma.pontoRegistro.findMany({ where: { funcionarioId, empresaId, invalidada: false, dataHora: { gte: de, lt: ate } }, orderBy: { dataHora: 'asc' } });
  const ultimo = regs.length ? regs[regs.length - 1].tipo : null;
  const seq = { ENTRADA: 'SAIDA_INTERVALO', SAIDA_INTERVALO: 'RETORNO_INTERVALO', RETORNO_INTERVALO: 'SAIDA', SAIDA: null };
  return ultimo ? seq[ultimo] : 'ENTRADA';
}
const funcPublico = (f) => ({ id: f.id, nome: f.nome, funcao: f.funcao || null });

// ---- Fuso BR fixo (UTC-3, sem horário de verão desde 2019) p/ os cálculos de ponto.
// Assim o resultado independe do timezone do servidor (o VPS roda em UTC).
const BR_OFFSET_MIN = -180;
// Campos "de parede" (ano/mês/dia/hora) no fuso BR de um instante (Date | ms | ISO).
function brFields(dataHora) {
  const d = new Date(new Date(dataHora).getTime() + BR_OFFSET_MIN * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
// Instante (ms UTC) a partir de campos de parede BR (day/hora podem estourar; Date.UTC normaliza).
const brToUtcMs = (y, mo, day, h, mi) => Date.UTC(y, mo, day, h, mi) - BR_OFFSET_MIN * 60000;
// Parseia "YYYY-MM-DDTHH:mm" (sem tz) como horário BR; respeita o tz se vier explícito.
function parseDataHoraBr(str) {
  if (!str) return new Date();
  const s = String(str);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m && !/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(brToUtcMs(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return new Date(s);
}
const EXP_CUTOFF_MIN = 5 * 60; // 05:00 — corte do "dia de expediente" (junta o turno que vira a meia-noite)
const hmToMin = (hm) => { const p = String(hm).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
const hmFmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
// Minutos do intervalo [iniMs,fimMs) dentro da faixa noturna 22:00–05:00 BR.
function minutosNoturnos(iniMs, fimMs) {
  if (fimMs <= iniMs) return 0;
  const f = brFields(iniMs);
  let total = 0;
  for (let k = -1; k <= 2; k++) {
    const ns = brToUtcMs(f.y, f.mo, f.day + k, 22, 0);
    const ne = brToUtcMs(f.y, f.mo, f.day + k + 1, 5, 0);
    const s = Math.max(iniMs, ns), e = Math.min(fimMs, ne);
    if (e > s) total += (e - s) / 60000;
  }
  return Math.round(total);
}
// Chave "y-mo-day" do dia de expediente de uma marcação (antes do corte = dia anterior).
function diaExpedienteKey(dataHora) {
  const f = brFields(dataHora);
  const base = new Date(Date.UTC(f.y, f.mo, f.day));
  if (f.min < EXP_CUTOFF_MIN) base.setUTCDate(base.getUTCDate() - 1);
  return `${base.getUTCFullYear()}-${base.getUTCMonth()}-${base.getUTCDate()}`;
}
// Instante do início do dia de expediente que contém `dataHora` (o corte, em BR;
// antes dele, o expediente é o do dia anterior). Versão em instante do
// diaExpedienteKey, para filtrar por intervalo no banco.
function inicioDoExpedienteMs(dataHora = Date.now()) {
  const f = brFields(dataHora);
  const day = f.min < EXP_CUTOFF_MIN ? f.day - 1 : f.day; // brToUtcMs normaliza o dia 0
  return brToUtcMs(f.y, f.mo, day, Math.floor(EXP_CUTOFF_MIN / 60), EXP_CUTOFF_MIN % 60);
}
// Janela [de, ate) do expediente corrente: do corte de hoje ao corte de amanhã.
function janelaExpedienteAtual() {
  const de = new Date(inicioDoExpedienteMs());
  return { de, ate: new Date(de.getTime() + 24 * 3600 * 1000) };
}

// ===== Colaboradores (ADMIN) — reusa o cadastro de Funcionario, + biometria/PIN =====
app.get('/api/ponto/colaboradores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const fs = await prisma.funcionario.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }] });
    const ultimas = await prisma.pontoRegistro.groupBy({ by: ['funcionarioId'], _max: { dataHora: true } });
    const uMap = new Map(ultimas.map((u) => [u.funcionarioId, u._max.dataHora]));
    const jornadas = await prisma.jornada.findMany({ select: { id: true, nome: true } });
    const jMap = new Map(jornadas.map((j) => [j.id, j.nome]));
    res.json(fs.map((f) => ({
      id: f.id, nome: f.nome, apelido: f.apelido || null, funcao: f.funcao || null, cpf: f.cpf || null, whatsapp: f.whatsapp || null, status: f.status,
      biometriaStatus: f.biometriaStatus, biometriaEm: f.biometriaEm, temPin: !!f.pinPonto, ultimaMarcacao: uMap.get(f.id) || null,
      jornadaId: f.jornadaId || null, jornadaNome: f.jornadaId ? (jMap.get(f.jornadaId) || null) : null,
      enrollidColetor: f.enrollidColetor ?? null,
      folgaSemana: Array.isArray(f.folgaSemana) ? f.folgaSemana : [],
    })));
  } catch (err) { console.error('[ponto/colaboradores]', err); res.status(500).json({ error: 'Erro ao carregar colaboradores.' }); }
});

// Salva o(s) vetor(es) facial(is) do funcionário. SÓ vetor — nenhuma foto.
app.post('/api/funcionarios/:id/face', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const descritores = Array.isArray(req.body?.descritores) ? req.body.descritores.filter((d) => Array.isArray(d) && d.length >= 100) : [];
    if (!descritores.length) return res.status(400).json({ error: 'Nenhum vetor facial válido recebido.' });
    const ex = await prisma.funcionarioFace.findFirst({ where: { funcionarioId: id } });
    if (ex) await prisma.funcionarioFace.update({ where: { id: ex.id }, data: { descritoresJson: descritores } });
    else await prisma.funcionarioFace.create({ data: { funcionarioId: id, descritoresJson: descritores } });
    await prisma.funcionario.update({ where: { id }, data: { biometriaStatus: 'CADASTRADA', biometriaEm: new Date(), termoBiometriaEm: req.body?.termo === true ? new Date() : func.termoBiometriaEm } });
    res.json({ ok: true });
  } catch (err) { console.error('[funcionarios/face POST]', err); res.status(500).json({ error: 'Erro ao salvar o rosto.' }); }
});

app.delete('/api/funcionarios/:id/face', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.funcionarioFace.deleteMany({ where: { funcionarioId: id } });
    await prisma.funcionario.update({ where: { id }, data: { biometriaStatus: 'PENDENTE', biometriaEm: null } });
    res.json({ ok: true });
  } catch (err) { console.error('[funcionarios/face DELETE]', err); res.status(500).json({ error: 'Erro ao remover o rosto.' }); }
});

// Define/gera o PIN de reserva (único na loja).
app.put('/api/funcionarios/:id/pin', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const pin = String(req.body?.pin ?? '').replace(/\D/g, '');
    if (pin && (pin.length < 4 || pin.length > 8)) return res.status(400).json({ error: 'O PIN deve ter de 4 a 8 dígitos.' });
    if (pin) { const dup = await prisma.funcionario.findFirst({ where: { pinPonto: pin, id: { not: id } } }); if (dup) return res.status(400).json({ error: 'Esse PIN já está em uso por outro colaborador.' }); }
    await prisma.funcionario.update({ where: { id }, data: { pinPonto: pin || null } });
    res.json({ ok: true });
  } catch (err) { console.error('[funcionarios/pin]', err); res.status(500).json({ error: 'Erro ao salvar o PIN.' }); }
});

// ===== Jornadas e Escalas (ADMIN) =====
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
// diasJson: 7 posições (0=domingo .. 6=sábado). Cada dia = {folga:true} ou {entrada,saida}.
function normalizarDias(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = arr[i] || {};
    if (d.folga || (!d.entrada && !d.saida)) { out.push({ folga: true }); continue; }
    const entrada = String(d.entrada || '').trim();
    const saida = String(d.saida || '').trim();
    if (!HHMM.test(entrada) || !HHMM.test(saida)) throw { http: 400, msg: `Horário inválido (use HH:MM) no dia ${i}.` };
    out.push({ entrada, saida });
  }
  return out;
}
const clampTol = (v, def) => (Number.isFinite(+v) ? Math.max(0, Math.min(60, Math.round(+v))) : def);

app.get('/api/ponto/jornadas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const js = await prisma.jornada.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
    const usos = await prisma.funcionario.groupBy({ by: ['jornadaId'], _count: { _all: true }, where: { jornadaId: { not: null } } });
    const uMap = new Map(usos.map((u) => [u.jornadaId, u._count._all]));
    res.json(js.map((j) => ({ id: j.id, nome: j.nome, dias: j.diasJson, toleranciaMin: j.toleranciaMin, ativo: j.ativo, colaboradores: uMap.get(j.id) || 0 })));
  } catch (err) { console.error('[ponto/jornadas GET]', err); res.status(500).json({ error: 'Erro ao carregar jornadas.' }); }
});

app.post('/api/ponto/jornadas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = String(req.body?.nome || '').trim().slice(0, 60);
    if (!nome) return res.status(400).json({ error: 'Informe o nome da jornada.' });
    const dias = normalizarDias(req.body?.dias);
    const j = await prisma.jornada.create({ data: { nome, diasJson: dias, toleranciaMin: clampTol(req.body?.toleranciaMin, 10) } });
    res.status(201).json({ id: j.id });
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[ponto/jornadas POST]', err); res.status(500).json({ error: 'Erro ao criar a jornada.' }); }
});

app.put('/api/ponto/jornadas/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.jornada.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Jornada não encontrada.' });
    const nome = String(req.body?.nome ?? ex.nome).trim().slice(0, 60);
    if (!nome) return res.status(400).json({ error: 'Informe o nome da jornada.' });
    const dias = req.body?.dias !== undefined ? normalizarDias(req.body.dias) : ex.diasJson;
    const ativo = typeof req.body?.ativo === 'boolean' ? req.body.ativo : ex.ativo;
    await prisma.jornada.update({ where: { id }, data: { nome, diasJson: dias, toleranciaMin: clampTol(req.body?.toleranciaMin, ex.toleranciaMin), ativo } });
    res.json({ ok: true });
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[ponto/jornadas PUT]', err); res.status(500).json({ error: 'Erro ao salvar a jornada.' }); }
});

app.delete('/api/ponto/jornadas/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.funcionario.updateMany({ where: { jornadaId: id }, data: { jornadaId: null } });
    await prisma.jornada.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/jornadas DELETE]', err); res.status(500).json({ error: 'Erro ao excluir a jornada.' }); }
});

// ===== Afastamentos / Ausências (ADMIN) — férias, atestado, licença, folga abonada =====
const AUSENCIA_TIPOS = ['FERIAS', 'ATESTADO', 'LICENCA', 'FOLGA_ABONADA', 'OUTRO'];
// 'YYYY-MM-DD' → Date às 05:00 BR (início do dia de expediente). null se inválido.
const ausData = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(brToUtcMs(+m[1], +m[2] - 1, +m[3], 5, 0)) : null; };

app.get('/api/ponto/ausencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const where = {};
    if (req.query.funcionarioId) where.funcionarioId = parseInt(req.query.funcionarioId, 10);
    const de = ausData(req.query.de), ate = ausData(req.query.ate);
    if (de) where.dataFim = { gte: de };
    if (ate) where.dataInicio = { lte: ate };
    const rows = await prisma.pontoAusencia.findMany({ where, orderBy: { dataInicio: 'desc' }, take: 500 });
    const fs = new Map((await prisma.funcionario.findMany()).map((f) => [f.id, f.apelido || f.nome]));
    res.json({ ausencias: rows.map((a) => ({ id: a.id, funcionarioId: a.funcionarioId, funcionarioNome: fs.get(a.funcionarioId) || '—', tipo: a.tipo, dataInicio: a.dataInicio, dataFim: a.dataFim, observacao: a.observacao || null, trocaGrupo: a.trocaGrupo || null })) });
  } catch (err) { console.error('[ponto/ausencias GET]', err); res.status(500).json({ error: 'Erro ao carregar afastamentos.' }); }
});

app.post('/api/ponto/ausencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    if (!funcionarioId) return res.status(400).json({ error: 'Selecione o colaborador.' });
    if (!AUSENCIA_TIPOS.includes(req.body?.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
    const dataInicio = ausData(req.body?.dataInicio), dataFim = ausData(req.body?.dataFim);
    if (!dataInicio || !dataFim) return res.status(400).json({ error: 'Datas inválidas.' });
    if (dataFim < dataInicio) return res.status(400).json({ error: 'A data fim não pode ser antes do início.' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    // Sobreposição AVISA (não bloqueia): o gestor decide.
    const sobrepoe = await prisma.pontoAusencia.findFirst({ where: { funcionarioId, dataInicio: { lte: dataFim }, dataFim: { gte: dataInicio } } });
    const a = await prisma.pontoAusencia.create({ data: { funcionarioId, tipo: req.body.tipo, dataInicio, dataFim, observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 300) : null } });
    res.status(201).json({ id: a.id, aviso: sobrepoe ? 'Atenção: já existe um afastamento que se sobrepõe a este período.' : null });
  } catch (err) { console.error('[ponto/ausencias POST]', err); res.status(500).json({ error: 'Erro ao salvar o afastamento.' }); }
});

app.put('/api/ponto/ausencias/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.pontoAusencia.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Afastamento não encontrado.' });
    const data = {};
    if (req.body?.tipo !== undefined) {
      if (!AUSENCIA_TIPOS.includes(req.body.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
      data.tipo = req.body.tipo;
    }
    if (req.body?.dataInicio !== undefined) { const d = ausData(req.body.dataInicio); if (!d) return res.status(400).json({ error: 'Data início inválida.' }); data.dataInicio = d; }
    if (req.body?.dataFim !== undefined) { const d = ausData(req.body.dataFim); if (!d) return res.status(400).json({ error: 'Data fim inválida.' }); data.dataFim = d; }
    const ini = data.dataInicio || ex.dataInicio, fim = data.dataFim || ex.dataFim;
    if (fim < ini) return res.status(400).json({ error: 'A data fim não pode ser antes do início.' });
    if (req.body?.observacao !== undefined) data.observacao = req.body.observacao ? String(req.body.observacao).slice(0, 300) : null;
    await prisma.pontoAusencia.update({ where: { id }, data });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/ausencias PUT]', err); res.status(500).json({ error: 'Erro ao salvar o afastamento.' }); }
});

app.delete('/api/ponto/ausencias/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.pontoAusencia.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Afastamento não encontrado.' });
    // Troca é atômica: excluir uma ponta remove as duas (mesmo trocaGrupo).
    if (ex.trocaGrupo) await prisma.pontoAusencia.deleteMany({ where: { trocaGrupo: ex.trocaGrupo } });
    else await prisma.pontoAusencia.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/ausencias DELETE]', err); res.status(500).json({ error: 'Erro ao excluir o afastamento.' }); }
});

// Troca de folga: cria as DUAS pontas (FOLGA_ABONADA de 1 dia) com o mesmo trocaGrupo.
// A extension injeta empresaId no createMany; setamos explícito também (defensivo,
// mesmo valor). trocaGrupo liga as 2 pontas — excluir uma remove as duas.
app.post('/api/ponto/ausencias/troca', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const aId = parseInt(req.body?.aFuncionarioId, 10), bId = parseInt(req.body?.bFuncionarioId, 10);
    if (!aId || !bId || aId === bId) return res.status(400).json({ error: 'Escolha dois colaboradores diferentes.' });
    const aData = ausData(req.body?.aData), bData = ausData(req.body?.bData);
    if (!aData || !bData) return res.status(400).json({ error: 'Datas inválidas.' });
    const [aFunc, bFunc] = await Promise.all([
      prisma.funcionario.findFirst({ where: { id: aId } }),
      prisma.funcionario.findFirst({ where: { id: bId } }),
    ]);
    if (!aFunc || !bFunc) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    const empresaId = getEmpresaIdAtual();
    const grupo = randomBytes(9).toString('base64url');
    await prisma.pontoAusencia.createMany({ data: [
      { empresaId, funcionarioId: aId, tipo: 'FOLGA_ABONADA', dataInicio: aData, dataFim: aData, trocaGrupo: grupo },
      { empresaId, funcionarioId: bId, tipo: 'FOLGA_ABONADA', dataInicio: bData, dataFim: bData, trocaGrupo: grupo },
    ] });
    res.status(201).json({ ok: true, trocaGrupo: grupo });
  } catch (err) { console.error('[ponto/ausencias/troca POST]', err); res.status(500).json({ error: 'Erro ao registrar a troca de folga.' }); }
});

// ===== Automações › Grupo VIP — conexão do WhatsApp (ADMIN) =====
async function garantirGrupoVipConfig() {
  let c = await prisma.grupoVipConfig.findFirst();
  if (!c) c = await prisma.grupoVipConfig.create({ data: {} });
  return c;
}
// ID da loja no HUB usado pelas pontes do Grupo VIP (cupom + origens). O manual
// (cfg.hubClienteId) vence; vazio → cai no vínculo canônico da empresa
// (Empresa.clienteId — o mesmo que os Relatórios usam), como o H360 deriva da
// loja. Usa cfg.empresaId (e não o tenant da request) porque o agendador de
// disparos roda fora de request. "admin" é a loja de teste sem cliente real no HUB.
async function hubClienteIdGrupoVip(cfg) {
  if (cfg?.hubClienteId) return cfg.hubClienteId;
  if (!cfg?.empresaId) return null;
  const emp = await prisma.empresa.findUnique({ where: { id: cfg.empresaId }, select: { clienteId: true } });
  const id = emp?.clienteId ? String(emp.clienteId).trim() : "";
  return id && id !== "admin" ? id : null;
}
const configPublicaHub = async (c) => ({ ...grupoVipConfigPublica(c), hubClienteIdEfetivo: await hubClienteIdGrupoVip(c) });
const grupoVipConfigPublica = (c) => ({
  grupoJid: c.grupoJid || null, grupoNome: c.grupoNome || null,
  hubClienteId: c.hubClienteId || null, ativo: !!c.ativo,
  temInstancia: !!c.instanceToken,
});

app.get('/api/grupo-vip/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json(await configPublicaHub(await garantirGrupoVipConfig())); }
  catch (err) { console.error('[grupo-vip/config GET]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.post('/api/grupo-vip/instancia', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (c.instanceToken) return res.json({ ok: true, jaExistia: true });
    const nome = `pdv-vip-${getEmpresaIdAtual()}-${Date.now()}`;
    const data = await zapiCriarInstancia(nome);
    const token = data?.token || data?.instance?.token || data?.instanceToken || null;
    if (!token) return res.status(502).json({ error: 'A UAZAPI não devolveu o token da instância.' });
    await prisma.grupoVipConfig.update({ where: { id: c.id }, data: { instanceName: nome, instanceToken: token } });
    res.json({ ok: true });
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[grupo-vip/instancia]', err); res.status(500).json({ error: 'Erro ao criar a instância.' }); }
});

app.get('/api/grupo-vip/qr', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken) return res.status(400).json({ error: 'Crie a instância primeiro.' });
    res.json({ qr: await zapiQrCode(c.instanceToken) });
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[grupo-vip/qr]', err); res.status(500).json({ error: 'Erro ao gerar o QR.' }); }
});

app.get('/api/grupo-vip/status', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken) return res.json({ connected: false, status: 'sem_instancia', number: null });
    res.json(await zapiStatus(c.instanceToken));
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[grupo-vip/status]', err); res.status(500).json({ error: 'Erro ao consultar status.' }); }
});

app.get('/api/grupo-vip/grupos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken) return res.json({ grupos: [] });
    res.json({ grupos: await zapiListarGrupos(c.instanceToken) });
  } catch (err) { console.error('[grupo-vip/grupos]', err); res.json({ grupos: [] }); }
});

// Info do grupo configurado (membros + descrição) para o cabeçalho estilo WhatsApp.
app.get('/api/grupo-vip/grupo-info', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    if (!c.instanceToken || !c.grupoJid) return res.json({ info: null });
    res.json({ info: await zapiGrupoInfo(c.grupoJid, c.instanceToken) });
  } catch (err) { console.error('[grupo-vip/grupo-info]', err); res.json({ info: null }); }
});

app.put('/api/grupo-vip/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await garantirGrupoVipConfig();
    const data = {};
    if (req.body?.grupoJid !== undefined) { data.grupoJid = req.body.grupoJid ? String(req.body.grupoJid).trim().slice(0, 120) : null; data.grupoNome = req.body?.grupoNome ? String(req.body.grupoNome).trim().slice(0, 120) : null; }
    if (req.body?.hubClienteId !== undefined) data.hubClienteId = req.body.hubClienteId ? String(req.body.hubClienteId).trim().slice(0, 60) : null;
    if (req.body?.ativo !== undefined) data.ativo = !!req.body.ativo;
    await prisma.grupoVipConfig.update({ where: { id: c.id }, data });
    res.json(await configPublicaHub(await garantirGrupoVipConfig()));
  } catch (err) { console.error('[grupo-vip/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});

// ===== Grupo VIP — mensagens + histórico (ADMIN) =====
const GRUPOVIP_CUPOM_MODOS = ['NENHUM', 'NOVO_POR_DISPARO', 'FIXO'];
const CUPOM_TIPOS_CW = ['FREE_SHIPPING', 'PERCENT_DISCOUNT', 'FLAT_DISCOUNT'];
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function normalizarMensagemVip(body) {
  const rotulo = String(body?.rotulo || '').trim().slice(0, 80);
  const texto = String(body?.texto || '').trim().slice(0, 2000);
  if (!rotulo) return { error: 'Informe um rótulo.' };
  if (!texto) return { error: 'Informe o texto da mensagem.' };
  const diasSemana = Array.isArray(body?.diasSemana) ? [...new Set(body.diasSemana.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))] : [];
  if (!diasSemana.length) return { error: 'Escolha ao menos um dia da semana.' };
  const horario = String(body?.horario || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(horario)) return { error: 'Horário inválido (HH:MM).' };
  const cupomModo = GRUPOVIP_CUPOM_MODOS.includes(body?.cupomModo) ? body.cupomModo : 'NENHUM';
  const d = { rotulo, texto, diasSemana, horario, ativa: body?.ativa !== false, cupomModo };
  if (cupomModo === 'FIXO') {
    d.cupomCodigoFixo = String(body?.cupomCodigoFixo || '').trim().slice(0, 40) || null;
    if (!d.cupomCodigoFixo) return { error: 'Modo fixo: informe o código do cupom.' };
  }
  if (cupomModo === 'NOVO_POR_DISPARO') {
    if (!CUPOM_TIPOS_CW.includes(body?.cupomTipo)) return { error: 'Escolha o tipo do cupom.' };
    d.cupomTipo = body.cupomTipo;
    d.cupomNome = String(body?.cupomNome || '').trim().slice(0, 80) || null;
    d.cupomValor = d.cupomTipo === 'FREE_SHIPPING' ? null : numOrNull(body?.cupomValor);
    if (d.cupomTipo !== 'FREE_SHIPPING' && (d.cupomValor == null || d.cupomValor <= 0 || (d.cupomTipo === 'PERCENT_DISCOUNT' && d.cupomValor > 100))) return { error: 'Valor do cupom inválido.' };
    d.cupomValidadeHoras = numOrNull(body?.cupomValidadeHoras);
    d.cupomPedidoMinimo = numOrNull(body?.cupomPedidoMinimo);
    d.cupomLimiteUso = numOrNull(body?.cupomLimiteUso);
    d.cupomSoNovosClientes = body?.cupomSoNovosClientes == null ? null : !!body.cupomSoNovosClientes;
  }
  // Foto opcional (data URL base64, mesmo padrão da foto do Checklist). Vazio → limpa.
  const imagem = typeof body?.imagem === 'string' ? body.imagem.trim() : '';
  if (imagem) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(imagem)) return { error: 'Foto inválida (use JPG, PNG ou WEBP).' };
    if (imagem.length > 4_500_000) return { error: 'Foto muito grande. Comprima e tente de novo.' };
    d.imagem = imagem;
  } else {
    d.imagem = null;
  }
  return { data: d };
}

app.get('/api/grupo-vip/mensagens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json({ mensagens: await prisma.grupoVipMensagem.findMany({ orderBy: { criadoEm: 'desc' } }) }); }
  catch (err) { console.error('[grupo-vip/mensagens GET]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

app.post('/api/grupo-vip/mensagens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const n = normalizarMensagemVip(req.body);
    if (n.error) return res.status(400).json({ error: n.error });
    const m = await prisma.grupoVipMensagem.create({ data: n.data });
    res.status(201).json({ id: m.id });
  } catch (err) { console.error('[grupo-vip/mensagens POST]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});

app.put('/api/grupo-vip/mensagens/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.grupoVipMensagem.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    const n = normalizarMensagemVip(req.body);
    if (n.error) return res.status(400).json({ error: n.error });
    // full-replace dos campos de cupom: zera os que não vieram no modo atual
    const zeraCupom = { cupomTipo: null, cupomValor: null, cupomNome: null, cupomCodigoFixo: null, cupomValidadeHoras: null, cupomPedidoMinimo: null, cupomLimiteUso: null, cupomSoNovosClientes: null };
    await prisma.grupoVipMensagem.update({ where: { id }, data: { ...zeraCupom, ...n.data } });
    res.json({ ok: true });
  } catch (err) { console.error('[grupo-vip/mensagens PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});

app.delete('/api/grupo-vip/mensagens/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await prisma.grupoVipMensagem.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    await prisma.grupoVipMensagem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[grupo-vip/mensagens DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===== Frases motivacionais (banner de boas-vindas do Início) =====
// Fallback embutido: se a loja ainda não cadastrou nenhuma, o banner nunca fica vazio.
const FRASES_PADRAO = [
  'Liderança não é dar respostas. É construir um ambiente onde as respostas aparecem.',
  'Cuide dos detalhes; o cliente sente cada um deles.',
  'Time forte não nasce pronto — se constrói todo dia.',
  'Consistência vale mais que intensidade.',
  'O padrão de hoje é o resultado de amanhã.',
  'Feito com atenção rende mais do que feito com pressa.',
];
// Sorteia uma frase ATIVA da loja (ou uma padrão). Qualquer usuário logado.
app.get('/api/frases/aleatoria', async (req, res) => {
  try {
    const lista = await prisma.frase.findMany({ where: { ativa: true }, select: { texto: true } });
    const fonte = lista.length ? lista.map((f) => f.texto) : FRASES_PADRAO;
    const texto = fonte[Math.floor(Math.random() * fonte.length)];
    res.json({ texto, personalizada: lista.length > 0 });
  } catch (err) { console.error('[frases/aleatoria]', err?.message || err); res.json({ texto: FRASES_PADRAO[0], personalizada: false }); }
});
// CRUD — só o dono (ADMIN).
app.get('/api/frases', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    // 1ª vez que o dono abre a página: materializa as 6 frases padrão no banco desta
    // loja — assim elas aparecem aqui pra editar/desativar/excluir, em vez de viverem
    // só no código. O flag na Empresa evita re-semear se ele apagar todas depois.
    const empresaId = getEmpresaIdAtual();
    if (empresaId != null) {
      const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { frasesSemeadas: true } });
      if (emp && !emp.frasesSemeadas) {
        if ((await prisma.frase.count()) === 0) {
          await prisma.frase.createMany({ data: FRASES_PADRAO.map((texto) => ({ texto, empresaId })) });
        }
        await prisma.empresa.update({ where: { id: empresaId }, data: { frasesSemeadas: true } });
      }
    }
    res.json({ frases: await prisma.frase.findMany({ orderBy: { criadoEm: 'desc' } }) });
  } catch (err) { console.error('[frases GET]', err?.message || err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});
app.post('/api/frases', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva a frase.' });
    const f = await prisma.frase.create({ data: { texto: texto.slice(0, 400), ativa: req.body?.ativa !== false } });
    res.status(201).json(f);
  } catch (err) { console.error('[frases POST]', err?.message || err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
app.put('/api/frases/:id', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const id = Number(req.params.id);
    const ex = await prisma.frase.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Frase não encontrada.' });
    const data = {};
    if (req.body?.texto !== undefined) { const t = String(req.body.texto).trim(); if (!t) return res.status(400).json({ error: 'A frase não pode ficar vazia.' }); data.texto = t.slice(0, 400); }
    if (req.body?.ativa !== undefined) data.ativa = !!req.body.ativa;
    const f = await prisma.frase.update({ where: { id }, data });
    res.json(f);
  } catch (err) { console.error('[frases PUT]', err?.message || err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
app.delete('/api/frases/:id', async (req, res) => {
  if (!exigirDono(req, res)) return;
  try {
    const id = Number(req.params.id);
    const ex = await prisma.frase.findFirst({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'Frase não encontrada.' });
    await prisma.frase.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[frases DELETE]', err?.message || err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

app.get('/api/grupo-vip/historico', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const rows = await prisma.grupoVipDisparo.findMany({ orderBy: { criadoEm: 'desc' }, take: 100 });
    const ms = new Map((await prisma.grupoVipMensagem.findMany({ select: { id: true, rotulo: true } })).map((m) => [m.id, m.rotulo]));
    res.json({ historico: rows.map((d) => ({ id: d.id, rotulo: ms.get(d.mensagemId) || '—', status: d.status, cupomCode: d.cupomCode || null, erro: d.erro || null, criadoEm: d.criadoEm })) });
  } catch (err) { console.error('[grupo-vip/historico]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

// Grupo VIP › Visão Geral: KPIs de retorno por período (cruza o ?s= das mensagens com
// o customer_origin dos pedidos, agregados no HUB). Best-effort com o CW.
app.get('/api/grupo-vip/visao-geral', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const dias = [7, 30, 90].includes(parseInt(req.query?.dias, 10)) ? parseInt(req.query.dias, 10) : 30;
    const fim = new Date();
    const inicio = new Date(fim.getTime() - dias * 24 * 3600 * 1000);
    const mensagensEnviadas = await prisma.grupoVipDisparo.count({ where: { status: 'ENVIADO', criadoEm: { gte: inicio, lte: fim } } });
    const mensagens = await prisma.grupoVipMensagem.findMany();
    const cfg = await garantirGrupoVipConfig();
    let origensCW = [];
    let cwOk = true;
    const hubId = await hubClienteIdGrupoVip(cfg);
    if (hubId) {
      try { origensCW = await buscarOrigensCW(hubId, inicio.toISOString(), fim.toISOString()); }
      catch (e) { console.error('[grupo-vip/visao-geral] CW', textoErro(e)); cwOk = false; }
    }
    const norm = (s) => String(s || '').trim().toLowerCase();
    const mapaCW = new Map();
    for (const o of origensCW) {
      const k = norm(o.origem);
      const cur = mapaCW.get(k) || { origem: o.origem, pedidos: 0, receita: 0 };
      cur.pedidos += o.pedidos || 0;
      cur.receita += o.receita || 0;
      mapaCW.set(k, cur);
    }
    const porMensagem = [];
    let conversoes = 0, receita = 0;
    const jaContou = new Set(); // não dobra se 2 mensagens usarem a mesma origem
    for (const m of mensagens) {
      const origem = extrairOrigem(m.texto);
      if (!origem) continue;
      const hit = mapaCW.get(norm(origem));
      porMensagem.push({ rotulo: m.rotulo, origem, pedidos: hit ? hit.pedidos : 0, receita: hit ? hit.receita : 0 });
      if (hit && !jaContou.has(norm(origem))) { conversoes += hit.pedidos; receita += hit.receita; jaContou.add(norm(origem)); }
    }
    // origensCW: o que o CW registrou no período — deixa visível um ?s= que não casa (ex.: código ≠ nome).
    res.json({ dias, mensagensEnviadas, conversoes, receita, porMensagem, cwOk, hubVinculado: !!hubId, origensCW: [...mapaCW.values()].map((o) => o.origem).sort().slice(0, 30) });
  } catch (err) { console.error('[grupo-vip/visao-geral]', err); res.status(500).json({ error: 'Erro ao carregar a visão geral.' }); }
});

// Atribui (ou remove, jornadaId null) a jornada de um colaborador.
app.put('/api/ponto/colaboradores/:id/jornada', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    const raw = req.body?.jornadaId;
    const jornadaId = raw === null || raw === '' || raw === undefined ? null : parseInt(raw, 10);
    if (jornadaId !== null) {
      const j = await prisma.jornada.findFirst({ where: { id: jornadaId } });
      if (!j) return res.status(400).json({ error: 'Jornada inválida.' });
    }
    await prisma.funcionario.update({ where: { id }, data: { jornadaId } });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/colaboradores jornada PUT]', err); res.status(500).json({ error: 'Erro ao atribuir a jornada.' }); }
});

// ===== Dispositivos (tablets) (ADMIN) =====
// Escopados por `tipo` (PONTO aqui, ETIQUETA no bloco irmão perto de Etiquetas):
// cada tela só lista/cria/apaga os aparelhos do seu papel — um aparelho de etiqueta
// não pode ser apagado pela tela de ponto e vice-versa (ver DELETE, deleteMany
// com o filtro no where; 0 linhas afetadas = 404, não silencioso).
app.get('/api/ponto/dispositivos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const ds = await prisma.dispositivo.findMany({ where: { tipo: 'PONTO' }, orderBy: { criadoEm: 'asc' } });
    res.json(ds.map((d) => ({ id: d.id, nome: d.nome, token: d.token, ativo: d.ativo, ultimaSync: d.ultimaSync, ehColetor: !!d.serialColetor })));
  } catch (err) { console.error('[ponto/dispositivos GET]', err); res.status(500).json({ error: 'Erro ao carregar dispositivos.' }); }
});
app.post('/api/ponto/dispositivos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 60) : '';
    if (!nome) return res.status(400).json({ error: 'Informe o nome do dispositivo.' });
    const d = await prisma.dispositivo.create({ data: { nome, token: randomBytes(12).toString('base64url'), tipo: 'PONTO' } });
    res.status(201).json({ id: d.id, nome: d.nome, token: d.token, ativo: d.ativo });
  } catch (err) { console.error('[ponto/dispositivos POST]', err); res.status(500).json({ error: 'Erro ao criar o dispositivo.' }); }
});
app.delete('/api/ponto/dispositivos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const { count } = await prisma.dispositivo.deleteMany({ where: { id: parseInt(req.params.id, 10), tipo: 'PONTO' } });
    if (!count) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    res.json({ ok: true });
  } catch (err) { console.error('[ponto/dispositivos DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===== Dispositivos de Etiquetas (tablets da cozinha) (ADMIN) =====
// Espelha o bloco de cima (mesma auth, mesma geração de token), escopado a ETIQUETA.
// empresaId NÃO é passado à mão em nenhum dos três: a extension do Prisma injeta
// sozinha porque Dispositivo é model de tenant (mesmo padrão do bloco de ponto).
app.get('/api/etiquetas/dispositivos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const ds = await prisma.dispositivo.findMany({ where: { tipo: 'ETIQUETA' }, orderBy: { criadoEm: 'asc' } });
    res.json(ds.map((d) => ({ id: d.id, nome: d.nome, token: d.token, ativo: d.ativo, ultimaSync: d.ultimaSync })));
  } catch (err) { console.error('[etiquetas/dispositivos GET]', err); res.status(500).json({ error: 'Erro ao carregar dispositivos.' }); }
});
app.post('/api/etiquetas/dispositivos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 60) : '';
    if (!nome) return res.status(400).json({ error: 'Informe o nome do dispositivo.' });
    const d = await prisma.dispositivo.create({ data: { nome, token: randomBytes(12).toString('base64url'), tipo: 'ETIQUETA' } });
    res.status(201).json({ id: d.id, nome: d.nome, token: d.token, ativo: d.ativo });
  } catch (err) { console.error('[etiquetas/dispositivos POST]', err); res.status(500).json({ error: 'Erro ao criar o dispositivo.' }); }
});
app.delete('/api/etiquetas/dispositivos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const { count } = await prisma.dispositivo.deleteMany({ where: { id: parseInt(req.params.id, 10), tipo: 'ETIQUETA' } });
    if (!count) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    res.json({ ok: true });
  } catch (err) { console.error('[etiquetas/dispositivos DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===================== Aparelhos: TOTEM / TV_INDOOR (ADMIN) =====================
// Área `aparelhos` (acessos/areas.js). Espelha o CRUD de dispositivos acima, com uma
// diferença central: estes aparelhos NÃO se autenticam pelo `token` na URL — quem prova
// quem eles são é a credencial do cookie HttpOnly, nascida de um código de 6 dígitos
// (spec §3.2). O `token` continua sendo gerado no POST (coluna NOT NULL, e os legados
// PONTO/ETIQUETA seguem dependendo dele) — só não é credencial destes tipos.
// As regras puras (código, credencial, online, o que a resposta expõe) vivem em
// backend/aparelhos.js; aqui só tem orquestração e banco.

// Freio de força bruta do pareamento: 10 tentativas por IP a cada 10 min (§3.2).
const limitadorPareamento = new LimitadorIp();

// Loja da request. O tenantStore é a fonte (ADMIN do HUB não traz empresaId no JWT:
// a loja é resolvida por X-Empresa-Id no gate de tenant). Fail-closed se não houver.
function empresaDoAdmin(req, res) {
  const empresaId = getEmpresaIdAtual() ?? req.user?.empresaId ?? null;
  if (empresaId == null) { res.status(400).json({ error: 'Loja não resolvida.' }); return null; }
  return empresaId;
}

// Origem pública do PDV (o tablet abre <origem>/dispositivo para digitar o código).
function origemPublicaPdv(req) {
  return String(process.env.PDV_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

app.get('/api/aparelhos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const tipo = req.query.tipo ? String(req.query.tipo) : null;
    if (tipo && !TIPOS_APARELHO.includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    // PONTO/ETIQUETA nunca aparecem aqui: esta tela é só dos aparelhos do totem/TV.
    const ds = await prisma.dispositivo.findMany({
      where: { empresaId, tipo: tipo || { in: TIPOS_APARELHO } },
      orderBy: { criadoEm: 'asc' },
    });
    const agora = new Date();
    res.json({ aparelhos: ds.map((d) => aparelhoAdmin(d, agora)) });
  } catch (err) { console.error('[aparelhos GET]', err); res.status(500).json({ error: 'Erro ao carregar os aparelhos.' }); }
});

app.post('/api/aparelhos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 60) : '';
    if (!nome) return res.status(400).json({ error: 'Informe o nome do aparelho.' });
    const tipo = String(req.body?.tipo ?? '');
    if (!TIPOS_APARELHO.includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    const d = await prisma.dispositivo.create({
      data: { empresaId, nome, tipo, ativo: true, token: randomBytes(12).toString('base64url') },
    });
    res.status(201).json({ aparelho: aparelhoAdmin(d, new Date()) });
  } catch (err) { console.error('[aparelhos POST]', err); res.status(500).json({ error: 'Erro ao criar o aparelho.' }); }
});

app.patch('/api/aparelhos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const data = {};
    if (req.body?.nome !== undefined) {
      const v = String(req.body.nome).trim().slice(0, 60);
      if (!v) return res.status(400).json({ error: 'Informe o nome do aparelho.' });
      data.nome = v;
    }
    // Desativar já derruba o aparelho: resolverAparelhoPorCookie exige ativo: true.
    if (req.body?.ativo !== undefined) data.ativo = !!req.body.ativo;
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada para atualizar.' });
    const { count } = await prisma.dispositivo.updateMany({ where: { id, empresaId, tipo: { in: TIPOS_APARELHO } }, data });
    if (!count) return res.status(404).json({ error: 'Aparelho não encontrado.' });
    const d = await prisma.dispositivo.findFirst({ where: { id, empresaId } });
    res.json({ aparelho: aparelhoAdmin(d, new Date()) });
  } catch (err) { console.error('[aparelhos PATCH]', err); res.status(500).json({ error: 'Erro ao atualizar o aparelho.' }); }
});

app.delete('/api/aparelhos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    // Aparelho com pedido no outbox não some: o histórico do que ele mandou ao CW é
    // auditoria, e a FK de PedidoTotemEnvio aponta para ele. Conferir e apagar dentro
    // da MESMA transação: senão um pedido entrando no meio transformaria o 409 honesto
    // num 500 de violação de FK.
    const fora = await prisma.$transaction(async (tx) => {
      const envios = await tx.pedidoTotemEnvio.count({ where: { empresaId, dispositivoId: id } });
      if (envios > 0) return { http: 409, corpo: { erro: 'APARELHO_COM_PEDIDOS' } };
      const { count } = await tx.dispositivo.deleteMany({ where: { id, empresaId, tipo: { in: TIPOS_APARELHO } } });
      if (!count) return { http: 404, corpo: { error: 'Aparelho não encontrado.' } };
      return { http: 200, corpo: { ok: true } };
    });
    res.status(fora.http).json(fora.corpo);
  } catch (err) {
    // P2003 = a FK barrou o delete (pedido inserido na corrida): é o mesmo 409, não um 500.
    if (err?.code === 'P2003') return res.status(409).json({ erro: 'APARELHO_COM_PEDIDOS' });
    console.error('[aparelhos DELETE]', err); res.status(500).json({ error: 'Erro ao excluir o aparelho.' });
  }
});

// Gera o código de pareamento (6 dígitos, 10 min, tentativas zeradas).
app.post('/api/aparelhos/:id/parear', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const alvo = await prisma.dispositivo.findFirst({ where: { id, empresaId, tipo: { in: TIPOS_APARELHO } }, select: { id: true } });
    if (!alvo) return res.status(404).json({ error: 'Aparelho não encontrado.' });
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + PAREAMENTO_VALIDADE_MS);
    // pareamentoCodigo é @unique no banco inteiro: quem garante "único entre os códigos
    // vivos" é o índice, não a sorte — se colidir (P2002), sorteia outro.
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      const codigo = gerarCodigoPareamento();
      try {
        await prisma.dispositivo.update({
          where: { id: alvo.id },
          data: { pareamentoCodigo: codigo, pareamentoExpiraEm: expiraEm, pareamentoTentativas: 0 },
        });
        return res.json({ codigo, expiraEm, urlDispositivo: `${origemPublicaPdv(req)}/dispositivo` });
      } catch (e) { if (e?.code !== 'P2002') throw e; }
    }
    res.status(503).json({ error: 'Não foi possível gerar um código agora. Tente de novo.' });
  } catch (err) { console.error('[aparelhos parear]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ error: 'Erro ao gerar o código.' }); }
});

// Revoga a credencial: o tablet cai para "não pareado" no próximo request.
app.post('/api/aparelhos/:id/revogar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const { count } = await prisma.dispositivo.updateMany({
      where: { id, empresaId, tipo: { in: TIPOS_APARELHO } },
      data: { credencialHash: null, pareamentoCodigo: null, pareamentoExpiraEm: null, pareamentoTentativas: 0 },
    });
    if (!count) return res.status(404).json({ error: 'Aparelho não encontrado.' });
    res.json({ ok: true });
  } catch (err) { console.error('[aparelhos revogar]', err); res.status(500).json({ error: 'Erro ao revogar.' }); }
});

// ===== INICIO ROTAS PUBLICAS DO APARELHO =====
// (marcador fixo: aparelhos.tenant.test.js VARRE o código entre este comentário e o
// FIM lá embaixo para provar que nenhuma linha daqui lê identidade do corpo da
// requisição. Não renomeie nem apague os dois marcadores.)
// Aparelhos (PÚBLICO — o tablet, sem login): estas rotas rodam FORA dos 3 gates e FORA
// do tenantStore (ver o app.use('/api') do topo: tudo sob /public/ passa direto). Sem
// tenantStore a extension do Prisma NÃO injeta empresaId: aqui todo where/update leva
// empresaId EXPLÍCITO — e ele vem do APARELHO que o cookie resolveu, nunca do corpo da
// requisição. O único construtor de where permitido é whereDoAparelho(aparelho, body)
// (aparelhos.js), que recebe o corpo justamente para ignorá-lo; a identidade do próprio
// aparelho vem de filtroAparelhoDoCookie.

// Identidade do aparelho: SÓ o cookie (hash da credencial), ativo e do tipo do totem.
async function resolverAparelhoPorCookie(req) {
  const credencial = lerCookieAparelho(req.headers.cookie);
  if (!credencial) return null;
  return prisma.dispositivo.findFirst({ where: filtroAparelhoDoCookie(hashCredencial(credencial)) });
}

// Resolve ou responde 401. Devolve null quando já respondeu (padrão do exigirAdmin).
async function exigirAparelho(req, res) {
  const ap = await resolverAparelhoPorCookie(req);
  if (!ap) { res.status(401).json({ erro: 'APARELHO_NAO_PAREADO' }); return null; }
  return ap;
}

// Loja do aparelho (nome + logo para a tela). O id vem do aparelho, ponto — o corpo
// entra na chamada só para atravessar o whereDoAparelho, que o descarta.
function lojaDoAparelho(ap, body) {
  return prisma.empresa.findUnique({ where: { id: whereDoAparelho(ap, body).empresaId }, select: { nome: true, logoDataUrl: true } });
}
const lojaPublica = (loja) => ({ nome: loja?.nome ?? null, logoDataUrl: loja?.logoDataUrl ?? null });

// ⚠️ Nos catch destas rotas logamos só code/name: a mensagem crua do Prisma pode
// carregar o where (código de pareamento, hash da credencial) para dentro do log.
app.post('/api/public/aparelho/parear', async (req, res) => {
  try {
    const agora = new Date();
    if (limitadorPareamento.registrar(req.ip, agora).bloqueado) return res.status(429).json({ erro: 'MUITAS_TENTATIVAS' });
    const codigo = String(req.body?.codigo ?? '').trim();
    if (!/^\d{6}$/.test(codigo)) return res.status(401).json({ erro: 'CODIGO_INVALIDO' });
    const disp = await prisma.dispositivo.findFirst({ where: { pareamentoCodigo: codigo, tipo: { in: TIPOS_APARELHO } } });
    const veredito = avaliarTentativa(disp, codigo, agora);
    if (!veredito.ok) {
      // Mesma resposta para todos os casos (inexistente, expirado, inativo): o aparelho
      // não descobre por qual motivo falhou. Só conta a tentativa quando o código existe.
      if (disp) {
        const data = veredito.invalidar
          ? { pareamentoCodigo: null, pareamentoExpiraEm: null, pareamentoTentativas: 0 }
          : { pareamentoTentativas: { increment: 1 } };
        await prisma.dispositivo.updateMany({ where: { id: disp.id, ...whereDoAparelho(disp, req.body) }, data });
      }
      return res.status(401).json({ erro: 'CODIGO_INVALIDO' });
    }
    const { credencial, hash } = gerarCredencial();
    // O update é condicionado ao código ainda estar lá: se dois tablets digitarem o
    // mesmo código ao mesmo tempo, só o primeiro pareia; o segundo leva CODIGO_INVALIDO.
    const { count } = await prisma.dispositivo.updateMany({
      where: { id: disp.id, ...whereDoAparelho(disp, req.body), pareamentoCodigo: codigo },
      data: { credencialHash: hash, pareadoEm: agora, pareamentoCodigo: null, pareamentoExpiraEm: null, pareamentoTentativas: 0 },
    });
    if (!count) return res.status(401).json({ erro: 'CODIGO_INVALIDO' });
    // O pareamento JÁ está gravado: o cookie vai no header AGORA, antes de qualquer
    // outra consulta. Se a busca da loja falhar, o aparelho sai pareado com loja: null
    // (o /eu completa depois) — perder o pareamento por causa do nome da loja, não.
    res.setHeader('Set-Cookie', cookieAparelho(credencial, { secure: cookieDeveSerSecure(req) }));
    let loja = null;
    try { loja = await lojaDoAparelho(disp, req.body); }
    catch (e) { console.error('[public/aparelho parear loja]', e?.code ?? e?.name ?? 'erro'); }
    res.json({ ok: true, aparelho: aparelhoPublico(disp), loja: loja ? lojaPublica(loja) : null });
  } catch (err) { console.error('[public/aparelho parear]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Quem sou eu (o front decide a UI pelo tipo).
app.get('/api/public/aparelho/eu', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    const loja = await lojaDoAparelho(ap, req.body);
    // A TV aprende a própria posição JÁ AQUI: a programação só chega depois, e sem isto
    // uma tela em pé nasceria deitada e giraria sozinha no primeiro minuto.
    const posicao = ap.tipo === 'TV_INDOOR' ? tvPosicaoPublica(ap, Date.now()) : {};
    res.json({ aparelho: { ...aparelhoPublico(ap), ...posicao }, loja: lojaPublica(loja) });
  } catch (err) { console.error('[public/aparelho eu]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Sinal de vida a cada 60 s: alimenta o "online" (< 150 s) da tela admin.
app.post('/api/public/aparelho/heartbeat', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    const agora = new Date();
    const dim = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 && n <= 20000 ? n : null; };
    /* O heartbeat carrega DUAS perguntas diferentes na mesma requisição: "o aparelho está
       vivo?" (que é o que ele sempre respondeu) e, só para TV, "o que ele está fazendo?".

       Piggyback em vez de rota nova porque a frequência é EXATAMENTE a mesma e o dado é
       EXATAMENTE do mesmo instante. Um segundo timer bateria no banco em dobro para dizer,
       com meio segundo de diferença, o que este já poderia ter dito.

       `heartbeatJson` é substituído inteiro a cada batida — então guardar o snapshot aqui é
       "só o mais recente" por construção, sem tabela que cresça uma linha por minuto e sem
       migration nenhuma.

       O bloco `tv` só existe em TV_INDOOR. Num totem ele é simplesmente ignorado: aceitar
       telemetria de TV num aparelho que não é TV seria guardar um dado que nenhuma rota lê,
       e que um dia alguém leria como se significasse algo. */
    const telemetria = ap.tipo === 'TV_INDOOR' ? sanitizarTelemetriaTv(req.body?.tv) : null;
    const heartbeatJson = {
      versao: String(req.body?.versao ?? '').slice(0, 40),
      tela: { w: dim(req.body?.tela?.w), h: dim(req.body?.tela?.h) },
      userAgent: (req.get('user-agent') || '').slice(0, 200),
      ip: req.ip,
      // `null` quando o player é anterior a esta frente. Isso NÃO é defeito: a TV continua
      // online e tocando, e o monitoramento a mostra como "sem telemetria" — é o que permite
      // deploy progressivo sem a sala de gestão achar que metade da rede caiu.
      tv: telemetria,
    };
    await prisma.dispositivo.updateMany({ where: { id: ap.id, ...whereDoAparelho(ap, req.body) }, data: { ultimoHeartbeatEm: agora, heartbeatJson } });
    res.json({ ok: true, agora });
  } catch (err) { console.error('[public/aparelho heartbeat]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Esquece o aparelho neste tablet (só apaga o cookie; a credencial do banco morre no
// revogar). Exige o cookie: quem não está pareado não tem nada para encerrar, e assim
// esta rota também não serve de ponto de sondagem sem credencial.
app.post('/api/public/aparelho/sair', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    res.setHeader('Set-Cookie', cookieAparelhoLimpar());
    res.json({ ok: true });
  } catch (err) { console.error('[public/aparelho sair]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Totem: catálogo, cotação e pedido (spec §5.2) ────────────────────────────
// Snapshot do bootstrap por LOJA (empresaId do APARELHO, nunca do corpo): se o HUB cair,
// o totem segue mostrando o último catálogo com `desatualizado:true`. Em memória de
// propósito — é conforto de vitrine, não fonte de verdade: dinheiro só passa por
// `cotar`/`pedido`, que falam com o HUB na hora.
const snapshotTotem = new Map();

// A loja no HUB nunca vem do aparelho: cookie → Dispositivo → empresaId →
// Empresa.clienteId. A leitura da coluna mora em clienteIdDaEmpresaTotem (o ÚNICO lugar
// do totem que a lê); aqui só se traduz o aparelho em empresaId, via whereDoAparelho —
// que recebe o corpo justamente para descartá-lo.
const clienteIdDoAparelho = (ap, body) => clienteIdDaEmpresaTotem(whereDoAparelho(ap, body).empresaId);

// Resposta de um envio ao aparelho: 201 criado · 202 em andamento/sem confirmação · 409
// cotação furada · 422 quando está provado que nada foi criado. Nunca 5xx depois do INSERT.
const responderEnvio = (res, envio) => res.status(httpDaResposta(envio)).json(corpoDaResposta(envio));

// Só TOTEM compra: um cookie de TV_INDOOR (mesmo válido e da mesma loja) não pede nada.
function exigirTotem(ap, res) {
  if (ap.tipo === 'TOTEM') return true;
  res.status(403).json({ erro: 'APARELHO_NAO_E_TOTEM' });
  return false;
}

// Apresentação (spec §4.2): o bootstrap que vai ao aparelho ganha
// `catalogo.categorias[].produtos` e `avisosApresentacao`. É ADITIVO — `itens` continua
// igual e é o que o frontend indexa; os `avisos` do HUB não são tocados.
//
// Três cuidados que valem o comentário:
//  · O ESCOPO É O DO APARELHO. A configuração é lida com whereDoAparelho(ap, body) — o
//    corpo entra só para ser descartado —, nunca com empresaId vindo da requisição.
//  · NADA É MUTADO. `projetarCatalogo` devolve catálogo NOVO (com `itens` por referência)
//    e aqui só se espalha a resposta; o snapshot em memória segue CRU, para poder ser
//    reprojetado com a configuração mais nova no próximo bootstrap desatualizado.
//  · O CATÁLOGO PÚBLICO NUNCA QUEBRA (spec §7). Banco fora do ar — ou um defeito na
//    própria projeção — responde o bootstrap SEM `produtos` (o front cai para `itens`) e
//    com `avisosApresentacao: []`. Por isso a projeção está DENTRO do try, e esta função
//    não conhece `res`: daqui não sai 5xx nenhum depois de o catálogo estar em mãos.
async function comApresentacao(ap, body, resposta) {
  try {
    const escopo = whereDoAparelho(ap, body);
    const [configuracoes, categorias, doCanal, banners, destaques, fundo, fitas] = await Promise.all([
      prisma.totemApresentacao.findMany({ where: escopo }),
      prisma.totemCategoria.findMany({ where: escopo }),
      // `findFirst` com o MESMO escopo das outras duas: o construtor de where é um só, e
      // trocá-lo por um findUnique com empresaId solto abriria a porta que o §5.4 fecha.
      //
      // `.catch` PRÓPRIO, e ele importa: sem isto, uma falha só desta leitura — deploy que
      // subiu o código sem rodar a migration, por exemplo — estouraria o Promise.all antes
      // da projeção e a VITRINE sumiria do totem em silêncio. Aqui o pior caso é o canal
      // voltar ao relógio padrão, com os produtos intactos.
      prisma.totemConfiguracao.findFirst({ where: escopo }).catch(() => null),
      // `.catch` próprio, pelo mesmo motivo da configuração: falha só desta leitura não
      // pode estourar o Promise.all antes da projeção e fazer a VITRINE sumir em silêncio.
      prisma.totemBanner.findMany({
        where: { ...escopo, ativo: true }, select: BANNER_CAMPOS, orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }).catch(() => []),
      // `.catch` próprio, pelo mesmo motivo dos dois acima: falha só desta leitura não pode
      // estourar o Promise.all e fazer a VITRINE inteira sumir. Sem destaques, a esteira
      // não aparece e o resto da tela continua de pé.
      prisma.totemDestaque.findMany({
        where: escopo, select: { chave: true, esteira: true, ordem: true }, orderBy: [{ ordem: 'asc' }, { chave: 'asc' }],
      }).catch(() => []),
      // Só a PRESENÇA da foto de fundo: `select` na chave, nunca em `dados`. É a razão de
      // os bytes morarem em tabela própria — este bootstrap roda a cada 5 min por aparelho.
      prisma.totemEsperaFundo.findFirst({ where: escopo, select: { empresaId: true } }).catch(() => null),
      // As fitas dos produtos. `.catch` próprio como as outras leituras acessórias: sem a
      // tabela (deploy antes da migration) o card sai sem fita, e o catálogo continua.
      prisma.produtoFita.findMany({ where: escopo, select: { cwItemId: true, selo: true } }).catch(() => []),
    ]);
    const { catalogo: projetado, avisos } = projetarCatalogo(resposta.catalogo, configuracoes);
    // A fita entra DEPOIS da projeção, porque é do item base e vai para cada produto que a
    // vitrine tirou dele — antes da projeção não haveria `produtos` para receber.
    const catalogo = aplicarFitas(projetado, fitas);
    // Nome de exibição por categoria: ADITIVO (`nomeExibido` ao lado de `nome`) e
    // depois da projeção, porque a vitrine mexe em itens e este passo só na string
    // que o cliente lê.
    return {
      ...resposta,
      catalogo: aplicarNomesDeCategoria(catalogo, categorias),
      avisosApresentacao: avisos,
      // Empresa sem linha responde o padrão — ausência de configuração não é erro.
      configuracao: configuracaoParaJson(doCanal),
      // Bloco PRÓPRIO do PDV, nunca dentro de `loja` (território do HUB). A logo não vem
      // aqui: vai só a versão, e o tablet busca os bytes uma vez pela rota dedicada.
      aparencia: aparenciaPublica({ config: doCanal, dispositivo: ap, temFundoEspera: fundo !== null }),
      // Banners da tela de espera: metadados e `agoraServidor`, nenhum byte. Quem decide a
      // elegibilidade temporal é o CLIENTE, com o relógio corrigido pelo desvio — é assim
      // que um banner das 18:00 entra às 18:00 em vez de esperar o próximo bootstrap.
      banners: bannersPublicos(banners, Date.now()),
      // As duas esteiras da vitrine (`{ superior, inferior }`), resolvidas contra o catálogo
      // PROJETADO (`catalogo`, já com os complementos expandidos em produtos) — e não contra
      // o cru do CW. É a mesma lista que o cliente vê; o banco só guardou chaves.
      destaques: destaquesPublicos(catalogo, destaques),
    };
  } catch (err) {
    console.error('[public/aparelho totem apresentacao]', err?.code ?? err?.name ?? 'erro');
    // Banco fora do ar não pode deixar o totem sem relógio: o campo vai SEMPRE, com o
    // padrão. Quem lê do outro lado também se protege da ausência, mas contar com isso
    // seria depender de uma versão específica do quiosque.
    return {
      ...resposta,
      avisosApresentacao: [],
      configuracao: configuracaoParaJson(null),
      // Falha na leitura não pode deixar o quiosque sem aparência: os campos vão sempre,
      // com os padrões, e a folha embarcada continua sendo o chão de tudo.
      aparencia: aparenciaPublica({}),
      // Sem banner, a espera institucional é o fallback — que é exatamente o que se quer
      // quando algo deu errado.
      banners: bannersPublicos([], Date.now()),
      destaques: { superior: [], inferior: [] },
    };
  }
}

// ── Logo do canal: a RESPOSTA ──────────────────────────────────────────────
// A validação e a decodificação moram no módulo puro (totemAparencia.js) — é o que
// permite testá-las sem subir servidor, e elas são a parte que decide o Content-Type.
//
// Cache PRIVADO e versionado, e o `private` é o detalhe que evita vazamento entre lojas:
// a URL é a mesma para todo mundo (`/logo?v=4`), e um cache COMPARTILHADO poderia
// entregar a logo da loja A para a loja B só porque as duas estão na versão 4. Com
// `private`, só o navegador do tablet guarda — e um tablet pertence a uma empresa só.
// `Vary: Cookie` fecha a porta em qualquer intermediário que ignore o `private`, já que é
// o cookie que identifica o aparelho. O ETag carrega empresa + versão pelo mesmo motivo:
// ele nunca colide entre lojas.
function responderImagem(res, { tipo, bytes }, marca, req) {
  const etag = `W/"logo-${marca}"`;
  res.set('Content-Type', tipo);
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.set('Vary', 'Cookie');
  res.set('ETag', etag);
  if (req?.headers?.['if-none-match'] === etag) return res.status(304).end();
  return res.send(bytes);
}

// A LOGO do canal, em bytes. Fora do bootstrap de propósito: ele é relido a cada 5 min
// por aparelho, e 200 KB de base64 nessa frequência é desperdício puro.
//
// Cache PRIVADO e versionado. `private` importa mais do que parece: a URL é a mesma para
// todas as lojas (`/logo?v=4`), e um cache COMPARTILHADO poderia servir a logo da loja A
// para a loja B só porque as duas estão na versão 4. Com `private` só o navegador do
// tablet guarda, e um tablet pertence a uma empresa só. `Vary: Cookie` fecha a porta em
// qualquer intermediário que ignore isso.
app.get('/api/public/aparelho/totem/logo', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    const cfg = await prisma.totemConfiguracao.findFirst({ where: whereDoAparelho(ap, {}) });
    const bytes = decodificarDataUrl(cfg?.logoDataUrl);
    if (!bytes) return res.status(404).end();
    responderImagem(res, bytes, `${ap.empresaId}-${cfg?.logoVersao ?? 0}`, req);
  } catch (err) {
    console.error('[public/aparelho totem logo]', err?.code ?? err?.name ?? 'erro');
    res.status(500).end();
  }
});

// A FOTO DE FUNDO da vitrine, em bytes. Mesma disciplina da logo e dos banners: fora do
// bootstrap, cache privado e versionado, empresa vinda do COOKIE.
//
// A versão entra no WHERE como nos banners: `?v=` que não bate com a versão atual é 404,
// nunca os bytes atuais sob um número velho — a resposta é `immutable` por um ano, e servir
// coisas diferentes sob a mesma URL deixaria dois tablets com fundos diferentes sem que nada
// no sistema conseguisse distinguir os casos.
app.get('/api/public/aparelho/totem/fundo', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    const versao = Number(req.query?.v);
    if (!Number.isSafeInteger(versao) || versao < 1) return res.status(404).end();
    // `whereDoAparelho` chamado inline nas duas leituras, como a rota da logo faz — a
    // variável `escopo` é reservada ao bootstrap, e a guarda estática só a aceita nascendo
    // de `whereDoAparelho(ap, body)`.
    const cfg = await prisma.totemConfiguracao.findFirst({ where: whereDoAparelho(ap, {}), select: { fundoEsperaVersao: true } });
    if ((cfg?.fundoEsperaVersao ?? 0) !== versao) return res.status(404).end();
    const fundo = await prisma.totemEsperaFundo.findFirst({ where: whereDoAparelho(ap, {}), select: { tipo: true, dados: true } });
    if (!fundo?.dados || !fundo.tipo) return res.status(404).end();
    responderImagem(res, { tipo: fundo.tipo, bytes: fundo.dados }, `fundo-${ap.empresaId}-${versao}`, req);
  } catch (err) {
    console.error('[public/aparelho totem fundo]', err?.code ?? err?.name ?? 'erro');
    res.status(500).end();
  }
});

// A ARTE de um banner, em bytes. Fora do bootstrap pelo mesmo motivo da logo.
//
// A empresa vem do COOKIE do aparelho, nunca do pedido: o `id` na URL é conferido CONTRA
// o escopo, e um id de outra loja simplesmente não é encontrado. Não existe caminho em
// que o navegador escolha de quem é a imagem.
app.get('/api/public/aparelho/totem/banner/:id/imagem', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).end();
    // A VERSÃO é parte da identidade do recurso, não enfeite na URL.
    //
    // A resposta é `immutable` por um ano: quem guardar `?v=3` nunca mais vai perguntar.
    // Servir os bytes atuais sob uma versão antiga faria dois tablets terem conteúdos
    // DIFERENTES para a mesma URL — um com a arte velha em cache, outro baixando a nova —
    // e nada no sistema conseguiria distinguir os dois casos depois.
    //
    // Versão ausente, torta ou de outra geração: o recurso NAQUELA versão não existe, e a
    // resposta é 404. Consequência aceita: nos minutos entre trocar a arte e o tablet
    // refazer o bootstrap, ele pede a versão velha e leva 404 — o carrossel pula aquele
    // banner e o recupera no bootstrap seguinte. Pular por alguns minutos é melhor do que
    // uma URL imutável servindo coisas diferentes.
    const versao = Number(req.query?.v);
    if (!Number.isSafeInteger(versao) || versao < 1) return res.status(404).end();
    const banner = await prisma.totemBanner.findFirst({
      // A versão entra no WHERE: não bateu, não há linha — e o blob nunca é carregado do
      // banco para ser descartado depois.
      where: { id, imagemVersao: versao, ...whereDoAparelho(ap, {}) },
      select: { imagemVersao: true, imagemTipo: true, imagem: { select: { dados: true } } },
    });
    if (!banner?.imagem?.dados || !banner.imagemTipo) return res.status(404).end();
    responderImagem(
      res,
      { tipo: banner.imagemTipo, bytes: banner.imagem.dados },
      `b${id}-${ap.empresaId}-${banner.imagemVersao}`,
      req,
    );
  } catch (err) {
    console.error('[public/aparelho totem banner imagem]', err?.code ?? err?.name ?? 'erro');
    res.status(500).end();
  }
});

// Bootstrap: loja, catálogo, métodos de pagamento e modos ativos.
app.get('/api/public/aparelho/totem/bootstrap', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    const loja = whereDoAparelho(ap, req.body).empresaId;
    const clienteId = await clienteIdDoAparelho(ap, req.body);
    if (!clienteId) return res.status(409).json({ erro: 'CLIENTE_SEM_CW', conectado: false });
    const r = await bootstrapTotemCW(clienteId);
    // O HUB pode responder 200 dizendo que a loja NÃO está ligada ao Cardápio Web. Isso é
    // estado de configuração, não catálogo: gravar esse corpo no snapshot apagaria o último
    // menu bom e deixaria a vitrine vazia até alguém religar a loja E o HUB voltar. Responde
    // o mesmo 409 do caso sem clienteId e não encosta no snapshot.
    if (r.ok && r.data?.conectado === false) return res.status(409).json({ erro: 'CLIENTE_SEM_CW', conectado: false });
    if (r.ok) {
      const em = new Date();
      snapshotTotem.set(loja, { data: r.data, em });
      return res.json(await comApresentacao(ap, req.body, bootstrapPublico(r.data, em, false)));
    }
    const snap = snapshotTotem.get(loja);
    if (snap) return res.json(await comApresentacao(ap, req.body, bootstrapPublico(snap.data, snap.em, true)));
    res.status(503).json({ erro: r.codigo === 'HUB_NAO_CONFIGURADO' ? 'HUB_NAO_CONFIGURADO' : 'CATALOGO_INDISPONIVEL' });
  } catch (err) { console.error('[public/aparelho totem bootstrap]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Cotação: quem calcula preço é o HUB (com o catálogo do CW). O totem só exibe.
app.post('/api/public/aparelho/totem/cotar', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    const orderType = String(req.body?.orderType ?? '');
    const carrinho = Array.isArray(req.body?.carrinho) && req.body.carrinho.length ? req.body.carrinho : null;
    const metodoId = req.body?.metodoId == null ? '' : String(req.body.metodoId).trim();
    if (!ORDER_TYPES.includes(orderType)) return res.status(422).json({ erro: 'MODO_INDISPONIVEL' });
    if (!carrinho) return res.status(422).json({ erro: 'CARRINHO_VAZIO' });
    if (!metodoId) return res.status(422).json({ erro: 'PAGAMENTO_INVALIDO' });
    const clienteId = await clienteIdDoAparelho(ap, req.body);
    if (!clienteId) return res.status(409).json({ erro: 'CLIENTE_SEM_CW', conectado: false });
    const r = await cotarTotemCW(clienteId, { orderType, carrinho, metodoId });
    if (r.ok) return res.json(r.data);
    // 4xx do HUB (cotação inválida, item em falta, loja fechada) vai inteiro para a tela.
    if (r.http >= 400 && r.http < 500) return res.status(r.http).json(r.data ?? { erro: r.codigo });
    res.status(503).json({ erro: CODIGOS_503_TOTEM.includes(r.codigo) ? r.codigo : 'HUB_INDISPONIVEL' });
  } catch (err) { console.error('[public/aparelho totem cotar]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Pedido — o ponto sem volta (§5.2). A ORDEM é o contrato:
// (1) forma do corpo · (2) idempotência · (3) checagens locais SEM rede · (4) referência ·
// (5) INSERT ENVIANDO · (6) UMA chamada à ponte, sem retry · (7) transição · (8) resposta.
// A partir do (5) não existe "HUB indisponível sem gravar": toda falha vira registro
// AMBIGUO/REJEITADO auditável, e a mesma chave devolve sempre esse registro.
app.post('/api/public/aparelho/totem/pedido', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    // (1) forma do corpo. Campos de identidade que venham no corpo são descartados aqui.
    const v = validarCorpoPedido(req.body);
    if (!v.ok) return res.status(400).json({ erro: v.erro, detalhes: v.detalhes });
    const { chaveIdempotencia, orderType, carrinho, metodoId, cotacao } = v.valor;
    // (2) idempotência ANTES de qualquer INSERT: a mesma chave devolve o mesmo registro.
    const jaTem = await prisma.pedidoTotemEnvio.findFirst({
      where: { ...whereDoAparelho(ap, req.body), dispositivoId: ap.id, chaveIdempotencia },
    });
    if (jaTem) return responderEnvio(res, jaTem);
    // (3) checagens locais, sem rede. HUB_NAO_CONFIGURADO é a ÚNICA 5xx sem gravar.
    const clienteId = await clienteIdDoAparelho(ap, req.body);
    if (!clienteId) return res.status(409).json({ erro: 'CLIENTE_SEM_CW', conectado: false });
    if (!process.env.HUB_API_URL || !process.env.JWT_SECRET) return res.status(503).json({ erro: 'HUB_NAO_CONFIGURADO' });
    // (4) referência antes do INSERT: o orderId é o que a reconciliação procura no CW.
    const { orderId, displayIdEnviado } = novaReferencia(ap.id, randomUUID());
    const agora = new Date();
    // (5) INSERT ENVIANDO — antes de qualquer chamada externa.
    let envio;
    try {
      envio = await prisma.pedidoTotemEnvio.create({
        data: {
          ...whereDoAparelho(ap, req.body), dispositivoId: ap.id, chaveIdempotencia, orderId, displayIdEnviado,
          orderType, status: 'ENVIANDO', cotacaoHash: cotacao.hash, tentadoEm: agora,
          // A assinatura HMAC da cotação NÃO é gravada: ela é credencial de uma chamada, não
          // dado do pedido. O que a auditoria precisa é do hash e da validade.
          carrinhoJson: { carrinho, metodoId, cotacao: { hash: cotacao.hash, expiraEm: cotacao.expiraEm } },
        },
      });
    } catch (e) {
      // Corrida na mesma chave (dois toques no botão): o unique (dispositivoId,
      // chaveIdempotencia) decide, e quem perdeu responde o registro do outro.
      if (e?.code === 'P2002') {
        const outro = await prisma.pedidoTotemEnvio.findFirst({
          where: { ...whereDoAparelho(ap, req.body), dispositivoId: ap.id, chaveIdempotencia },
        });
        if (outro) return responderEnvio(res, outro);
      }
      throw e;
    }
    // (6) ÚNICA chamada de criação. Nenhum laço, nenhum retry: um POST por registro.
    let r;
    try {
      r = await criarPedidoTotemCW(clienteId, { orderType, carrinho, metodoId, cotacao, referencia: { orderId, displayId: displayIdEnviado } });
    } catch (e) {
      // A ponte não deveria lançar; se lançar, é ambiguidade — nunca resposta sem registro.
      console.error('[public/aparelho totem pedido ponte]', e?.code ?? e?.name ?? 'erro');
      r = { ok: false, http: 502, codigo: 'HUB_INDISPONIVEL', ambiguo: true, data: null };
    }
    // (7) e (8) têm try/catch PRÓPRIO: a linha já existe, então daqui para a frente nenhuma
    // falha pode virar 5xx. Se a gravação do desfecho falhar, o aparelho recebe 202
    // ("estamos confirmando") e o job resolve a linha — o pior caso é uma espera.
    try {
      // (7) transição pela máquina de estados (nunca status escrito à mão).
      const desfecho = classificarResposta(r);
      const campos = camposDoDesfecho(desfecho, r);
      if (campos.respostaJson == null) delete campos.respostaJson;   // Json? não aceita null puro no Prisma
      const { count } = await prisma.pedidoTotemEnvio.updateMany({
        where: { id: envio.id, ...whereDoAparelho(ap, req.body), status: 'ENVIANDO' },
        data: { status: transicao('ENVIANDO', EVENTO_DO_DESFECHO[desfecho]), ...campos },
      });
      // (8) resposta. UPDATE que não pegou = o job já promoveu a linha enquanto o HUB
      // respondia; se o desfecho foi CRIADO, a prova da criação não pode se perder.
      if (!count && desfecho === 'CRIADO') await gravarCriadoTardio(envio, campos);
      const atual = count
        ? { ...envio, status: desfecho, ...campos }
        : (await prisma.pedidoTotemEnvio.findFirst({ where: { id: envio.id, ...whereDoAparelho(ap, req.body) } })) ?? { ...envio, status: desfecho, ...campos };
      responderEnvio(res, atual);
    } catch (e) {
      console.error('[public/aparelho totem pedido desfecho]', e?.code ?? e?.name ?? 'erro');
      res.status(202).json(respostaPublica({ ...envio, status: 'ENVIANDO' }));
    }
  } catch (err) { console.error('[public/aparelho totem pedido]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Polling curto do totem enquanto o número do balcão (cwDisplayId) não chega.
app.get('/api/public/aparelho/totem/pedido/:envioId', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTotem(ap, res)) return;
    const envioIdNum = parseInt(req.params.envioId, 10);
    if (!Number.isInteger(envioIdNum)) return res.status(404).json({ erro: 'PEDIDO_NAO_ENCONTRADO' });
    const envio = await prisma.pedidoTotemEnvio.findFirst({
      where: { id: envioIdNum, ...whereDoAparelho(ap, req.body), dispositivoId: ap.id },
    });
    if (!envio) return res.status(404).json({ erro: 'PEDIDO_NAO_ENCONTRADO' });
    res.json(respostaPublica(envio));
  } catch (err) { console.error('[public/aparelho totem pedido GET]', err?.code ?? err?.name ?? 'erro'); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});
// ── TV Indoor (PÚBLICO — a TV pareada) ──────────────────────────────────────
// Só TV_INDOOR lê programação: um cookie de TOTEM (mesmo válido e da mesma loja) não
// enxerga nada daqui. É o irmão exato de `exigirTotem`, e existe pelo mesmo motivo — o
// tipo do aparelho é uma fronteira de produto, não um detalhe de UI.
function exigirTvIndoor(ap, res) {
  if (ap.tipo === 'TV_INDOOR') return true;
  res.status(403).json({ erro: 'APARELHO_NAO_E_TV' });
  return false;
}

// A APARÊNCIA que esta TV deve desenhar. Cores efetivas (padrão + overrides) e a logo como
// URL versionada — nenhum byte, nenhum id interno, nenhum metadado de admin.
//
// A logo da EMPRESA entra como fallback NEUTRO da marca. É `Empresa.logoDataUrl`, que
// pertence à empresa e não a canal nenhum — a logo do TOTEM nunca é consultada aqui.
//
// Falhar não pode custar a parede: qualquer erro cai nos defaults do canal, e a TV desenha
// como sempre desenhou.
async function aparenciaDaTv(ap) {
  try {
    // `whereDoAparelho(ap, {})` INLINE, e não numa variável `escopo`: aquele nome é
    // reservado ao bootstrap do totem, e a guarda estática do bloco público só o aceita
    // nascendo de `whereDoAparelho(ap, body)`. O `{}` literal é a prova de que o corpo da
    // requisição não entra na conta.
    const [cfg, empresa] = await Promise.all([
      prisma.tvIndoorConfiguracao.findFirst({
        where: whereDoAparelho(ap, {}), select: { tokens: true, logoVersao: true, logoTipo: true },
      }).catch(() => null),
      prisma.empresa.findUnique({
        where: { id: whereDoAparelho(ap, {}).empresaId }, select: { logoDataUrl: true },
      }).catch(() => null),
    ]);
    return tvAparenciaPublica(cfg, { temLogoDaEmpresa: !!empresa?.logoDataUrl });
  } catch {
    return tvAparenciaPublica(null);
  }
}

// Os MENU BOARDS de uma programação, resolvidos contra o catálogo atual da loja.
//
// Três cuidados que valem o comentário:
//
//  · SÓ VAI AO HUB SE PRECISAR. Playlist sem board nenhum não paga chamada nenhuma.
//
//  · CATÁLOGO FORA NÃO APAGA A PAREDE. `catalogoDaLoja` devolve o último catálogo bom
//    quando a chamada falha; sem nem isso, os boards ficam de fora e a TV toca as artes que
//    restarem — e o player ainda tem a programação anterior em mãos.
//
//  · A EMPRESA VEM DO APARELHO. `whereDoAparelho(ap, {})` para as fitas, e o mesmo
//    `empresaId` para o catálogo: não existe caminho em que o navegador escolha a loja.
//
// Devolve um Map `String(boardId)` → board público. Board INELEGÍVEL (desligado, ou sem
// nenhum produto disponível agora) simplesmente não entra: o player segue para o próximo.
async function boardsDaProgramacao(ap, itens) {
  const vazios = new Map();
  const comBoard = (itens ?? []).filter((i) => i?.tipo === 'MENU_BOARD' && i?.menuBoard);
  if (!comBoard.length) return vazios;
  const empresaId = whereDoAparelho(ap, {}).empresaId;
  const r = await catalogoDaLoja(empresaId, {
    clienteIdDaEmpresa: clienteIdDaEmpresaTotem,
    bootstrap: bootstrapTotemCW,
  }).catch(() => ({ ok: false }));
  if (!r.ok) return vazios;
  const linhas = await prisma.produtoFita.findMany({ where: whereDoAparelho(ap, {}), select: { cwItemId: true, selo: true } }).catch(() => []);
  const fitas = fitasPorItem(linhas);
  const mapa = new Map();
  for (const item of comBoard) {
    const resolvido = resolverMenuBoard(item.menuBoard, r.catalogo, fitas);
    if (resolvido.elegivel) mapa.set(String(item.menuBoard.id), menuBoardPublico(resolvido));
  }
  return mapa;
}

// A PROGRAMAÇÃO desta tela. Sem um byte de imagem: metadados, a URL versionada de cada
// conteúdo e o `agoraServidor` que a TV usa para corrigir o próprio relógio.
//
// A playlist sai do APARELHO (que o cookie resolveu), nunca do pedido — e a consulta dos
// itens leva o escopo da empresa TAMBÉM, mesmo já tendo o playlistId: sem isso, uma
// playlist de outra loja associada por engano (ou por adulteração de banco) serviria a
// arte dela aqui. Com o escopo, ela simplesmente não é encontrada.
//
// Sem playlist, ou com a playlist vazia, a resposta é 200 com `itens: []`. A TV entende
// isso como "mostre o fallback institucional", que é um estado legítimo — não um erro.
app.get('/api/public/aparelho/tv/programacao', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTvIndoor(ap, res)) return;
    const agora = Date.now();
    // A APARÊNCIA acompanha TODA resposta, inclusive a vazia: é ela que pinta o fallback
    // institucional, que é justamente o que a TV mostra quando não há programação.
    // `.catch` próprio — sem a tabela (deploy antes da migration) a TV usa os defaults do
    // canal, nunca um erro na parede.
    const aparencia = await aparenciaDaTv(ap);

    /* ── A GRADE decide QUAL playlist, antes de qualquer item ──────────────────
       Duas perguntas em sequência, e nunca fundidas: a grade escolhe a playlist (domínio
       PDV, nenhuma chamada externa), e só depois a agenda de cada conteúdo filtra os itens
       dela. É por isso que descobrir "o que está no ar agora" nunca custa uma ida ao HUB.

       O `.catch` em cada consulta é deliberado: um deploy que ainda não rodou a migration
       não pode derrubar a parede. Sem tabela de regras, a TV volta a se comportar como
       antes desta frente — playlist padrão, e nada mais. */
    const [cfg, regras] = await Promise.all([
      prisma.tvIndoorConfiguracao.findFirst({
        where: whereDoAparelho(ap, {}), select: { fusoHorario: true },
      }).catch(() => null),
      prisma.tvProgramacaoRegra.findMany({
        where: { dispositivoId: ap.id, ...whereDoAparelho(ap, {}) },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        select: TV_REGRA_CAMPOS,
      }).catch(() => []),
    ]);
    const grade = resolverGrade({
      agoraMs: agora,
      fuso: cfg?.fusoHorario,
      regras,
      // `tvPlaylistId` NÃO mudou de papel — mudou de nome. Ele é a PLAYLIST PADRÃO: o que
      // toca quando nenhuma regra está valendo. Uma tela sem regra nenhuma resolve
      // exatamente como antes desta migration.
      playlistPadraoId: ap.tvPlaylistId ?? null,
    });
    // O bloco que a TV usa para agendar a própria reconsulta na virada, sem depender do
    // relógio absoluto dela: o delay sai de `proximaTrocaEm - agoraServidor`.
    const daGrade = (extra) => ({
      programacaoTela: {
        playlistEfetivaId: null,
        origem: grade.origem,
        regraId: grade.regraId,
        fuso: grade.fuso,
        proximaTrocaEm: grade.proximaTrocaEm === null ? null : new Date(grade.proximaTrocaEm).toISOString(),
        // As REGRAS não viajam: a TV não precisa delas para nada, e o que não viaja não
        // vaza nem diverge. Ela só precisa saber o que tocar e quando reconsultar.
        ...extra,
      },
    });
    const vazia = (extra) => res.json({
      // A posição viaja em TODA resposta, inclusive na vazia: é justamente com a tela
      // sem playlist ("Configure uma playlist") que o gestor confere se ela saiu em pé.
      tela: { id: ap.id, nome: ap.nome, ...tvPosicaoPublica(ap, agora) },
      playlist: null,
      aparencia,
      versaoApp: VERSAO_APP,
      ...daGrade(),
      ...tvProgramacaoPublica([], agora),
      ...extra,
    });
    if (grade.playlistId === null) return vazia();

    // `whereDoAparelho(ap, {})` inline, como nas rotas de imagem: a variável `escopo` é
    // reservada ao bootstrap do totem, e a guarda estática só a aceita nascendo de
    // `whereDoAparelho(ap, body)`.
    const carregarPlaylist = (id) => prisma.tvPlaylist.findFirst({
      where: { id, ...whereDoAparelho(ap, {}) },
      select: {
        id: true, nome: true,
        itens: {
          select: {
            id: true, ordem: true, tipo: true, duracaoSegundos: true,
            conteudo: { select: TV_CAMPOS },
            menuBoard: { select: MB_CAMPOS },
            video: { select: TV_VIDEO_CAMPOS },
          },
          orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        },
      },
    });

    // Os MENU BOARDS resolvidos contra o catálogo ATUAL. Só se vai ao HUB quando a
    // programação realmente tem board — uma playlist só de artes não paga esse custo.
    const montar = async (pl) => {
      const boards = await boardsDaProgramacao(ap, pl.itens);
      // `videoPublico`/`videoElegivel` entram por injeção: `tvIndoor.js` é o contrato da
      // programação, e não precisa conhecer o domínio de cada tipo de mídia.
      return tvProgramacaoPublica(pl.itens, agora, { boards, videoPublico, videoElegivel });
    };

    let playlist = await carregarPlaylist(grade.playlistId);
    let corpo = playlist ? await montar(playlist) : null;
    let caiuNoPadrao = false;

    /* FALLBACK OPERACIONAL. A regra apontava para uma playlist que existe mas que, NESTE
       instante, não tem nada reproduzível — tudo agendado para amanhã, tudo desligado, o
       vídeo ainda sem arquivo. Uma programação especial vazia não pode calar a comunicação
       da loja, então a tela cai para a PLAYLIST PADRÃO INTEIRA.

       Cair para a padrão, e não completar a especial com itens avulsos: misturar as duas
       produziria uma terceira programação que ninguém montou. */
    const padraoId = ap.tvPlaylistId ?? null;
    const vaziaAgora = !playlist || (corpo?.itens?.length ?? 0) === 0;
    if (vaziaAgora && grade.origem === 'REGRA' && padraoId && padraoId !== grade.playlistId) {
      const padrao = await carregarPlaylist(padraoId);
      if (padrao) {
        const corpoPadrao = await montar(padrao);
        if ((corpoPadrao.itens?.length ?? 0) > 0) {
          playlist = padrao;
          corpo = corpoPadrao;
          caiuNoPadrao = true;
        }
      }
    }
    if (!playlist || !corpo) return vazia(daGrade({ playlistEfetivaId: null }));

    const loja = await lojaDoAparelho(ap, {}).catch(() => null);
    res.json({
      // A posição viaja em TODA resposta, inclusive na vazia: é justamente com a tela
      // sem playlist ("Configure uma playlist") que o gestor confere se ela saiu em pé.
      tela: { id: ap.id, nome: ap.nome, ...tvPosicaoPublica(ap, agora) },
      loja: loja ? lojaPublica(loja) : null,
      playlist: { id: playlist.id, nome: playlist.nome },
      aparencia,
      /* A TV compara com a versão que ela viu ao abrir. Diferente = o aplicativo dela está
         velho, e ela se recarrega sozinha — esperando o vídeo terminar, como faz com a troca
         de grade. É OBSERVAÇÃO, não comando: o servidor não manda recarregar, ele só diz em
         que versão está. */
      versaoApp: VERSAO_APP,
      ...daGrade({
        playlistEfetivaId: playlist.id,
        // Quando a regra venceu mas a playlist dela estava vazia, a origem HONESTA é o
        // padrão: é ele que está no ar. `regraId` fica para o admin entender o porquê.
        origem: caiuNoPadrao ? 'PADRAO' : grade.origem,
        caiuNoPadrao,
      }),
      ...corpo,
    });
  } catch (err) {
    console.error('[public/aparelho tv programacao]', err?.code ?? err?.name ?? 'erro');
    // Banco fora do ar, ou tabela ausente (deploy sem migration): a TV recebe programação
    // vazia e mostra o fallback institucional, em vez de um erro numa parede da loja.
    res.status(200).json({ playlist: null, agoraServidor: new Date().toISOString(), itens: [] });
  }
});

/* Serve um arquivo de vídeo com suporte a HTTP RANGE.
 *
 * Isto NÃO é o `responderImagem`, e copiá-lo teria sido o erro: ele não conhece Range e
 * responderia 200 sempre. O `<video>` do Chromium pede um trecho para descobrir a duração,
 * outro para começar, e outro a cada vez que o buffer esvazia; sem 206 alguns WebViews nem
 * iniciam a reprodução, e todos baixam o arquivo inteiro antes do primeiro quadro.
 *
 * O tamanho vem do DISCO, não do banco: se os dois divergirem, quem manda é o que existe.
 * E o corpo é um `createReadStream` do intervalo — o processo nunca vê o arquivo inteiro.
 */
async function responderVideo(req, res, video, marca) {
  const tamanho = await midiaFs.tamanhoDaChave(video.storageKey);
  if (tamanho === null) return res.status(404).end();
  const etag = `W/"${marca}"`;
  const veredito = interpretarRange(req.headers.range, tamanho);
  const { status, cabecalhos, corpo } = cabecalhosDeMidia({ veredito, tamanho, tipo: video.arquivoTipo, etag });
  res.set(cabecalhos);
  // 304 SÓ numa requisição sem Range: devolvê-lo para um pedido de trecho quebra o buffer do
  // `<video>`, que fica esperando bytes que não vêm.
  if (veredito.tipo !== 'parcial' && req.headers['if-none-match'] === etag) return res.status(304).end();
  res.status(status);
  if (!corpo) return res.end();
  if (req.method === 'HEAD') return res.end();
  const fluxo = midiaFs.lerTrecho(video.storageKey, corpo.inicio, corpo.fim);
  if (!fluxo) return res.status(404).end();
  // Cliente que fecha a conexão no meio (a TV trocou de item): destrói o stream em vez de
  // deixar o descritor aberto.
  res.on('close', () => fluxo.destroy());
  fluxo.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });
  return fluxo.pipe(res);
}

// O ARQUIVO de um vídeo, para a TV. Mesmas regras de identidade de todo o canal: aparelho
// autenticado, tipo TV_INDOOR, empresa do COOKIE, id conferido contra o escopo e a VERSÃO
// dentro do WHERE — `?v=` de outra geração é 404, nunca os bytes atuais sob número velho.
//
// A `storageKey` NUNCA vem do pedido: ela sai da linha que o escopo encontrou.
app.get('/api/public/aparelho/tv/video/:id/arquivo', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTvIndoor(ap, res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).end();
    const versao = Number(req.query?.v);
    if (!Number.isSafeInteger(versao) || versao < 1) return res.status(404).end();
    const video = await prisma.tvVideo.findFirst({
      where: { id, arquivoVersao: versao, ...whereDoAparelho(ap, {}) },
      select: { arquivoVersao: true, arquivoTipo: true, storageKey: true },
    });
    if (!video?.storageKey || !video.arquivoTipo) return res.status(404).end();
    await responderVideo(req, res, video, `tvv-${ap.empresaId}-${id}-${video.arquivoVersao}`);
  } catch (err) {
    console.error('[public/aparelho tv video]', err?.code ?? err?.name ?? 'erro');
    if (!res.headersSent) res.status(500).end();
  }
});

// A LOGO do canal, em bytes. Mesma disciplina de tudo o mais: fora da programação, cache
// PRIVADO e versionado, empresa vinda do COOKIE, e a VERSÃO dentro do WHERE — `?v=` de
// outra geração é 404, nunca os bytes atuais sob um número velho.
app.get('/api/public/aparelho/tv/aparencia/logo', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTvIndoor(ap, res)) return;
    const versao = Number(req.query?.v);
    if (!Number.isSafeInteger(versao) || versao < 1) return res.status(404).end();
    const cfg = await prisma.tvIndoorConfiguracao.findFirst({
      where: { ...whereDoAparelho(ap, {}), logoVersao: versao },
      select: { logoVersao: true, logoTipo: true, logo: { select: { dados: true } } },
    });
    if (!cfg?.logo?.dados || !cfg.logoTipo) return res.status(404).end();
    responderImagem(res, { tipo: cfg.logoTipo, bytes: cfg.logo.dados }, `tvap-${ap.empresaId}-${cfg.logoVersao}`, req);
  } catch (err) {
    console.error('[public/aparelho tv aparencia logo]', err?.code ?? err?.name ?? 'erro');
    res.status(500).end();
  }
});

// A IMAGEM de um conteúdo, em bytes. Mesma disciplina dos banners, e pelas mesmas razões:
// fora da programação (que é relida a cada 60 s), cache PRIVADO e versionado, empresa
// vinda do COOKIE, e a VERSÃO dentro do WHERE — `?v=` de outra geração é 404, nunca os
// bytes atuais sob um número velho. A resposta é `immutable` por um ano: servir coisas
// diferentes sob a mesma URL deixaria duas TVs com conteúdos distintos sem que nada no
// sistema conseguisse distinguir os casos.
app.get('/api/public/aparelho/tv/conteudo/:id/imagem', async (req, res) => {
  try {
    const ap = await exigirAparelho(req, res); if (!ap) return;
    if (!exigirTvIndoor(ap, res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).end();
    const versao = Number(req.query?.v);
    if (!Number.isSafeInteger(versao) || versao < 1) return res.status(404).end();
    const conteudo = await prisma.tvConteudo.findFirst({
      where: { id, imagemVersao: versao, ...whereDoAparelho(ap, {}) },
      select: { imagemVersao: true, imagemTipo: true, imagem: { select: { dados: true } } },
    });
    if (!conteudo?.imagem?.dados || !conteudo.imagemTipo) return res.status(404).end();
    responderImagem(res, { tipo: conteudo.imagemTipo, bytes: conteudo.imagem.dados }, `tv${id}-${ap.empresaId}-${conteudo.imagemVersao}`, req);
  } catch (err) {
    console.error('[public/aparelho tv conteudo imagem]', err?.code ?? err?.name ?? 'erro');
    res.status(500).end();
  }
});

// ===== FIM ROTAS PUBLICAS DO APARELHO =====

// ===== Totem › Pedidos: outbox, reconciliação e job (spec §5.4/§5.5) =====
// Códigos 503 do §7 que fazem sentido para o aparelho ver (o resto é HUB_INDISPONIVEL).
const CODIGOS_503_TOTEM = ['HUB_NAO_CONFIGURADO', 'CW_RATE_LIMIT', 'HUB_SEM_PARTNER_KEY', 'HUB_CONFIG_INVALIDA', 'CATALOGO_INDISPONIVEL'];

// ÚNICO lugar do totem que lê Empresa.clienteId (regra do Junior: o clienteId nunca vem
// de payload — nasce sempre do empresaId, que nasce do cookie ou do próprio registro).
// Mesma regra do hubClienteIdGrupoVip: vazio ou 'admin' (loja de teste) = não vinculada.
async function clienteIdDaEmpresaTotem(empresaId) {
  if (empresaId == null) return null;
  const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { clienteId: true } });
  const id = emp?.clienteId ? String(emp.clienteId).trim() : '';
  return id && id !== 'admin' ? id : null;
}

// O :id da rota admin — inteiro positivo ou nada (nunca chega NaN no Prisma).
function idDaRota(req) {
  const id = parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Quem decidiu (para o decisaoJson). O PDV tem dois tipos de sessão: dono (JWT do HUB,
// com id) e operador (JWT do próprio PDV, com operadorId).
const usuarioDoAdmin = (req) => String(req.user?.operadorId ?? req.user?.id ?? req.user?.email ?? 'desconhecido');

// Linha da tela admin. Sem carrinho e sem cotação: a tela audita, não reprocessa.
const pedidoTotemAdmin = (r) => ({
  id: r.id,
  status: r.status,
  orderType: r.orderType,
  orderId: r.orderId,
  displayIdEnviado: r.displayIdEnviado,
  cwOrderId: r.cwOrderId ?? null,
  cwDisplayId: r.cwDisplayId ?? null,
  cwStatusInicial: r.cwStatusInicial ?? null,
  totalCalculado: r.totalCalculado == null ? null : Number(r.totalCalculado),
  erroCodigo: r.erroCodigo ?? null,
  erroDetalhe: r.erroDetalhe ?? null,
  tentadoEm: r.tentadoEm,
  reconciliadoEm: r.reconciliadoEm ?? null,
  revisaoEm: r.revisaoEm ?? null,
  decisaoJson: r.decisaoJson ?? null,
  criadoEm: r.criadoEm,
  aparelho: r.dispositivo ? { id: r.dispositivo.id, nome: r.dispositivo.nome } : null,
});

const APARELHO_DA_LINHA = { dispositivo: { select: { id: true, nome: true } } };

// ── O construtor único do `data` que leva uma linha a CRIADO DEPOIS do POST ─────────────
// Três caminhos chegam a CRIADO tarde: o CRIADO tardio (a resposta do HUB venceu a corrida
// com o job), a reconciliação (job ou botão) e a confirmação manual do admin. Nos três,
// "virar CRIADO" é a MESMA lista de colunas — a identidade do pedido no CW, o total e a
// LIMPEZA do erroCodigo/erroDetalhe que a linha carregava de quando era AMBIGUA. Esquecer a
// limpeza deixa na tela do admin um "pedido criado" exibindo um HUB_INDISPONIVEL velho (já
// aconteceu duas vezes), então nenhum dos três monta esse objeto à mão: todos passam por aqui.
// O desfecho DIRETO do POST não entra aqui: ele grava camposDoDesfecho('CRIADO', …), que já
// traz a mesma limpeza e tem teste próprio travando a lista de campos.
//   de/evento = a transição, sempre pela máquina de estados (nunca status escrito à mão)
//   campos    = camposDoDesfecho('CRIADO', …) ou o recorte { cwOrderId, cwDisplayId, … }
// `reconciliadoEm` é a marca de que o pedido foi ENCONTRADO depois, não confirmado na
// resposta do POST — daí entrar em todo evento que não seja o 'criado' do caminho direto.
function dadosDeCriado(de, evento, campos, em = new Date()) {
  const data = { ...(campos || {}), erroCodigo: null, erroDetalhe: null, status: transicao(de, evento) };
  if (evento !== 'criado') data.reconciliadoEm = em;
  return data;
}

// O HUB confirmou a criação DEPOIS de o job já ter promovido a linha (a resposta demorou
// mais que a janela). A prova de que o pedido existe no CW não pode se perder: reaplica o
// desfecho como `reconciliado` — a transição permitida a partir de AMBIGUO/REVISAO_MANUAL.
async function gravarCriadoTardio(envio, campos) {
  const linha = await prisma.pedidoTotemEnvio.findFirst({ where: { id: envio.id, empresaId: envio.empresaId }, select: { status: true } });
  const de = linha?.status;
  if (de !== 'AMBIGUO' && de !== 'REVISAO_MANUAL') {
    if (de !== 'CRIADO') console.error('[totem criado tardio] envio', envio.id, 'cwOrderId', campos?.cwOrderId ?? null, 'estado', de ?? 'sumiu');
    return false;
  }
  // `campos` é o MESMO objeto do caminho normal (camposDoDesfecho('CRIADO', …)) e quem monta
  // o `data` é o construtor único: números do CW, totalCalculado, respostaJson e a limpeza do
  // erro — que aqui importa ainda mais, porque a linha carrega o HUB_INDISPONIVEL escrito na
  // promoção a AMBIGUO e não pode ficar na tela como "pedido criado com erro" nem sem total.
  const { count } = await prisma.pedidoTotemEnvio.updateMany({
    where: { id: envio.id, empresaId: envio.empresaId, status: de },
    data: dadosDeCriado(de, 'reconciliado', campos),
  });
  if (!count) console.error('[totem criado tardio nao gravado] envio', envio.id, 'cwOrderId', campos?.cwOrderId ?? null);
  return !!count;
}

// Reconciliação de UM envio — a MESMA função do job e do botão do admin.
// Procura no CW um pedido com external_order_id === orderId. Só isso vira CRIADO.
// Nunca cria nada, nunca marca falha: não achar deixa a linha exatamente como estava.
async function reconciliarEnvio(envio) {
  let atual = envio;
  if (atual.status === 'ENVIANDO') {
    // Envio interrompido (processo reiniciado entre o INSERT e a resposta). Não vira falha:
    // depois da mesma janela do job (5 min) vira AMBIGUO e passa a ser reconciliável como
    // qualquer outra ambiguidade. Antes disso a chamada pode estar em curso — não se mexe.
    if (Date.now() - new Date(atual.tentadoEm).getTime() < JANELA_ENVIANDO_MS) return { erro: 'ESTADO_NAO_PERMITE_ACAO', http: 409 };
    await prisma.pedidoTotemEnvio.updateMany({
      where: { id: atual.id, empresaId: atual.empresaId, status: 'ENVIANDO' },
      data: { status: transicao('ENVIANDO', 'ambiguo'), erroCodigo: 'HUB_INDISPONIVEL', erroDetalhe: 'Envio sem resposta registrada (processo interrompido).' },
    });
    atual = { ...atual, status: 'AMBIGUO' };
  }
  if (atual.status !== 'AMBIGUO' && atual.status !== 'REVISAO_MANUAL') return { erro: 'ESTADO_NAO_PERMITE_ACAO', http: 409 };
  const clienteId = await clienteIdDaEmpresaTotem(atual.empresaId);
  if (!clienteId) return { erro: 'CLIENTE_SEM_CW', http: 409 };
  const r = await reconciliarTotemCW(clienteId, {
    orderId: atual.orderId,
    orderType: atual.orderType,
    tentadoEm: new Date(atual.tentadoEm).toISOString(),
    timeoutMs: TIMEOUT_PEDIDO_MS,
  });
  // Linha intocada nos dois casos. A diferença é o que o admin lê na tela: um 4xx é resposta
  // DETERMINÍSTICA do HUB (ex.: 422 JANELA_RECONCILIACAO_EXPIRADA, quando o pedido é velho
  // demais para o updated_since do CW) e insistir não muda nada — então o código vai inteiro
  // para o botão, com o HTTP original. 5xx/rede continuam 503: aí vale tentar de novo.
  if (!r.ok) {
    const http = Number(r.http);
    return http >= 400 && http < 500 ? { erro: r.codigo, http } : { erro: r.codigo, http: 503 };
  }
  if (r.data?.encontrado !== true || !Number.isInteger(r.data?.cwOrderId)) return { encontrado: false };
  const campos = {
    cwOrderId: r.data.cwOrderId,
    cwDisplayId: Number.isInteger(r.data.cwDisplayId) ? r.data.cwDisplayId : null,
    cwStatusInicial: r.data.cwStatus == null ? null : String(r.data.cwStatus).slice(0, 60),
  };
  // UMA consulta a mais, best-effort: o `reconciliar` responde a pergunta que importa
  // ("existe?"), mas nem sempre traz o total nem o número do balcão — e uma linha CRIADA com
  // total vazio faz o admin achar que o pedido saiu de graça. Falhar aqui não muda nada: a
  // criação já está provada e o job completa o display depois.
  try {
    const det = await detalheTotemCW(clienteId, r.data.cwOrderId);
    if (det.ok) {
      const total = Number(det.data?.total);
      if (Number.isFinite(total)) campos.totalCalculado = total.toFixed(2);
      if (campos.cwDisplayId == null && Number.isInteger(det.data?.cwDisplayId)) campos.cwDisplayId = det.data.cwDisplayId;
    }
  } catch (e) { console.error('[totem reconciliar detalhe]', e?.code ?? e?.name ?? 'erro'); }
  const { count } = await prisma.pedidoTotemEnvio.updateMany({
    where: { id: atual.id, empresaId: atual.empresaId, status: atual.status },
    data: dadosDeCriado(atual.status, 'reconciliado', campos),
  });
  return { encontrado: true, atualizado: !!count };
}

// Lista da outbox (aparelho, hora, status, #display, total, erro, referência).
app.get('/api/totem/pedidos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 7, 1), 90);
    const where = { empresaId, tentadoEm: { gte: new Date(Date.now() - dias * 86_400_000) } };
    const status = String(req.query.status || '').trim();
    if (status && ESTADOS_TOTEM.includes(status)) where.status = status;
    const regs = await prisma.pedidoTotemEnvio.findMany({ where, orderBy: { tentadoEm: 'desc' }, take: 500, include: APARELHO_DA_LINHA });
    res.json({ pedidos: regs.map(pedidoTotemAdmin) });
  } catch (err) { console.error('[totem/pedidos]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// "Reconciliar agora": mesma busca do job, na hora.
app.post('/api/totem/pedidos/:id/reconciliar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const envio = await prisma.pedidoTotemEnvio.findFirst({ where: { id, empresaId } });
    if (!envio) return res.status(404).json({ erro: 'PEDIDO_NAO_ENCONTRADO' });
    const r = await reconciliarEnvio(envio);
    if (r.erro) return res.status(r.http ?? 409).json({ erro: r.erro });
    const atual = await prisma.pedidoTotemEnvio.findFirst({ where: { id, empresaId }, include: APARELHO_DA_LINHA });
    res.json({ encontrado: !!r.encontrado, pedido: atual ? pedidoTotemAdmin(atual) : null });
  } catch (err) { console.error('[totem/pedidos reconciliar]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// "Confirmar criado": o admin viu o pedido no painel do CW e informa o cwOrderId. O HUB
// confirma que aquele pedido é ESTE (external_order_id === orderId) — sem isso, 409. É a
// trava que impede marcar como criado o pedido de outra pessoa.
app.post('/api/totem/pedidos/:id/confirmar-criado', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const cwOrderId = Math.trunc(Number(req.body?.cwOrderId));
    if (!Number.isInteger(cwOrderId) || cwOrderId <= 0) return res.status(400).json({ erro: 'CW_ORDER_ID_OBRIGATORIO' });
    const envio = await prisma.pedidoTotemEnvio.findFirst({ where: { id, empresaId } });
    if (!envio) return res.status(404).json({ erro: 'PEDIDO_NAO_ENCONTRADO' });
    if (envio.status !== 'AMBIGUO' && envio.status !== 'REVISAO_MANUAL') return res.status(409).json({ erro: 'ESTADO_NAO_PERMITE_ACAO' });
    const clienteId = await clienteIdDaEmpresaTotem(empresaId);
    if (!clienteId) return res.status(409).json({ erro: 'CLIENTE_SEM_CW' });
    const r = await detalheTotemCW(clienteId, cwOrderId);
    // Mesma régua da reconciliação: um 4xx do HUB é resposta determinística — o 404
    // PEDIDO_NAO_ENCONTRADO diz que o cwOrderId digitado não existe no CW, e insistir não
    // muda isso. Devolver 503 para tudo faria o admin ficar tentando de novo um número
    // errado. 5xx e rede continuam 503, que é onde tentar de novo faz sentido.
    if (!r.ok) {
      const http = Number(r.http);
      return res.status(http >= 400 && http < 500 ? http : 503).json({ erro: r.codigo });
    }
    // Fail-closed: sem o external_order_id do CW não se confirma nada.
    const externo = r.data?.externalOrderId ?? r.data?.external_order_id ?? null;
    if (!externo || String(externo) !== envio.orderId) return res.status(409).json({ erro: 'PEDIDO_NAO_CORRESPONDE' });
    const em = new Date();
    // O detalhe do CW é a única fonte do valor aqui: a linha ficou AMBIGUA sem total (o POST
    // nunca respondeu), e um pedido confirmado sem valor na tela é um pedido que ninguém
    // confere. Sem total legível, mantém o que já havia — nunca apaga.
    const total = Number(r.data?.total);
    const campos = {
      cwOrderId,
      cwDisplayId: Number.isInteger(r.data?.cwDisplayId) ? r.data.cwDisplayId : null,
      cwStatusInicial: r.data?.cwStatus == null ? envio.cwStatusInicial : String(r.data.cwStatus).slice(0, 60),
      totalCalculado: Number.isFinite(total) ? total.toFixed(2) : envio.totalCalculado,
    };
    const { count } = await prisma.pedidoTotemEnvio.updateMany({
      where: { id, empresaId, status: envio.status },
      data: {
        ...dadosDeCriado(envio.status, 'confirmadoManual', campos, em),
        decisaoJson: { usuarioId: usuarioDoAdmin(req), acao: 'confirmar', em: em.toISOString() },
      },
    });
    if (!count) return res.status(409).json({ erro: 'ESTADO_MUDOU' });
    const atual = await prisma.pedidoTotemEnvio.findFirst({ where: { id, empresaId }, include: APARELHO_DA_LINHA });
    res.json({ pedido: atual ? pedidoTotemAdmin(atual) : null });
  } catch (err) { console.error('[totem/pedidos confirmar-criado]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// "Encerrar: não criado" — só de REVISAO_MANUAL e só com motivo. É o único jeito de um
// envio ambíguo terminar sem pedido, e fica assinado em decisaoJson.
app.post('/api/totem/pedidos/:id/encerrar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const motivo = String(req.body?.motivo ?? '').trim();
    if (motivo.length < 3 || motivo.length > 300) return res.status(400).json({ erro: 'MOTIVO_OBRIGATORIO' });
    const envio = await prisma.pedidoTotemEnvio.findFirst({ where: { id, empresaId } });
    if (!envio) return res.status(404).json({ erro: 'PEDIDO_NAO_ENCONTRADO' });
    if (envio.status !== 'REVISAO_MANUAL') return res.status(409).json({ erro: 'ESTADO_NAO_PERMITE_ACAO' });
    const em = new Date();
    const { count } = await prisma.pedidoTotemEnvio.updateMany({
      where: { id, empresaId, status: 'REVISAO_MANUAL' },
      data: {
        status: transicao(envio.status, 'encerradoManual'),
        decisaoJson: { usuarioId: usuarioDoAdmin(req), acao: 'encerrar', motivo, em: em.toISOString() },
      },
    });
    if (!count) return res.status(409).json({ erro: 'ESTADO_MUDOU' });
    const atual = await prisma.pedidoTotemEnvio.findFirst({ where: { id, empresaId }, include: APARELHO_DA_LINHA });
    res.json({ pedido: atual ? pedidoTotemAdmin(atual) : null });
  } catch (err) { console.error('[totem/pedidos encerrar]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Totem › Apresentação (ADMIN, spec §4.3) ─────────────────────────────────
// A loja escolhe, item a item, se ele aparece no totem como um card só (NORMAL) ou como
// um card por opção do grupo principal (EXPANDIDO). A escolha é EXPLÍCITA e mora aqui;
// o catálogo continua sendo do Cardápio Web e é relido vivo a cada chamada.
// `empresaId` vem SEMPRE de empresaDoAdmin (tenantStore), jamais do corpo/query/rota.

// Catálogo vivo do CW para as duas rotas, com a mesma régua de erro:
// sem clienteId (loja não vinculada) ou HUB dizendo `conectado:false` → 409 CLIENTE_SEM_CW;
// HUB fora do ar → 503. Devolve null quando JÁ respondeu (padrão do exigirAdmin).
async function catalogoVivoDoAdmin(empresaId, res) {
  const clienteId = await clienteIdDaEmpresaTotem(empresaId);
  if (!clienteId) { res.status(409).json({ erro: 'CLIENTE_SEM_CW' }); return null; }
  const r = await bootstrapTotemCW(clienteId);
  if (!r.ok) { res.status(503).json({ erro: r.codigo === 'HUB_NAO_CONFIGURADO' ? 'HUB_NAO_CONFIGURADO' : 'HUB_INDISPONIVEL' }); return null; }
  if (r.data?.conectado === false) { res.status(409).json({ erro: 'CLIENTE_SEM_CW' }); return null; }
  // 200 do HUB SEM catálogo utilizável não pode virar "catálogo vazio": com zero categorias
  // o merge declararia TODA configuração salva como órfã e a tela ofereceria "Remover" para
  // cada uma — um clique apagaria a loja inteira por causa de uma resposta torta. Fail-closed.
  if (!Array.isArray(r.data?.catalogo?.categorias)) { res.status(503).json({ erro: 'CATALOGO_INDISPONIVEL' }); return null; }
  return r.data.catalogo;
}

// Item do catálogo pelo id do CW. Vale a PRIMEIRA ocorrência: o mesmo item pode estar em
// duas categorias e os grupos são os mesmos. Comparação por texto — o id chega number do
// HUB e string da rota. Nunca por nome: no cardápio real "X BURGUER" tem quatro ids.
function itemDoCatalogoCW(catalogo, cwItemId) {
  for (const categoria of catalogo?.categorias ?? []) {
    for (const item of categoria?.itens ?? []) {
      if (item?.id != null && String(item.id) === String(cwItemId)) return item;
    }
  }
  return null;
}

// Lista da tela: catálogo vivo + configurações persistidas (mesclarAdmin), sugestões da
// heurística e os avisos que o totem veria AGORA com essa mesma configuração.
/* ══ DESTAQUES DA VITRINE ═════════════════════════════════════════════════════════════
   Os produtos da esteira da tela de espera. A tabela guarda a CHAVE e a ordem; tudo o que
   se vê na tela vem do catálogo do Cardápio Web — PROJETADO, com os complementos expandidos
   em produtos, porque é assim que o cliente o vê e é assim que a loja quer escolher. */

/* O mesmo catálogo que o quiosque desenha: vivo, e passado pela apresentação da loja. Sem a
   projeção, a lista de escolha teria só os itens base, e a batata dentro do combo — que é
   o que a loja mais quer na esteira — não existiria para ser escolhida. */
async function catalogoProjetadoDoAdmin(empresaId, res) {
  const catalogo = await catalogoVivoDoAdmin(empresaId, res); if (!catalogo) return null;
  const configuracoes = await prisma.totemApresentacao.findMany({ where: { empresaId } });
  return projetarCatalogo(catalogo, configuracoes).catalogo;
}

/* A resposta traz TRÊS coisas porque a tela precisa das três: o que já foi escolhido (com
   órfão, sem-foto e em-falta marcados), o catálogo inteiro para escolher, e o teto.

   A resposta traz TRÊS coisas porque a tela precisa das três: o que já foi escolhido (com
   órfão e sem-foto marcados), o catálogo inteiro para escolher, e o teto. */
app.get('/api/totem/destaques', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const projetado = await catalogoProjetadoDoAdmin(empresaId, res); if (!projetado) return;
    const linhas = await prisma.totemDestaque.findMany({
      where: { empresaId }, select: { chave: true, esteira: true, ordem: true }, orderBy: [{ ordem: 'asc' }, { chave: 'asc' }],
    });
    res.json({
      escolhidos: destaquesParaAdmin(projetado, linhas),
      catalogo: catalogoParaEscolha(projetado),
      esteiras: DESTAQUE_ESTEIRAS,
      maxPorEsteira: MAX_POR_ESTEIRA,
    });
  } catch (err) { console.error('[totem/destaques]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

/* SUBSTITUI a escolha inteira, e não emenda: o corpo é a lista final, na ordem final.

   A ORDEM sai da posição na lista, nunca de um número enviado pelo browser — aceitar um
   `ordem` do cliente abriria espaço para dois destaques na mesma posição, e aí a esteira
   decidiria por desempate em vez de por escolha.

   O `deleteMany` é escopado por empresa, como todo o resto: um id de outra loja no corpo
   não encontra linha para apagar, e o `createMany` grava com o empresaId da SESSÃO. Não
   existe caminho em que o browser escolha de quem é a lista.

   Transação porque o par apagar+gravar não pode ficar pela metade: uma falha entre os dois
   deixaria a loja sem esteira nenhuma, e ela só descobriria olhando o vidro. */
app.put('/api/totem/destaques', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    // O corpo é `{ superior: [...], inferior: [...] }` — as duas listas finais, na ordem.
    const r = validarEsteiras(req.body);
    if (!r.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: r.erros });
    await prisma.$transaction([
      prisma.totemDestaque.deleteMany({ where: { empresaId } }),
      prisma.totemDestaque.createMany({ data: linhasParaGravar(empresaId, r.esteiras) }),
    ]);
    // Relê contra o catálogo projetado para a tela já mostrar órfão, sem-foto e em-falta do
    // que acabou de ser gravado, sem precisar de uma segunda chamada.
    const projetado = await catalogoProjetadoDoAdmin(empresaId, res); if (!projetado) return;
    const linhas = await prisma.totemDestaque.findMany({
      where: { empresaId }, select: { chave: true, esteira: true, ordem: true }, orderBy: [{ ordem: 'asc' }, { chave: 'asc' }],
    });
    res.json({ ok: true, escolhidos: destaquesParaAdmin(projetado, linhas), maxPorEsteira: MAX_POR_ESTEIRA });
  } catch (err) { console.error('[totem/destaques PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.get('/api/totem/apresentacao', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const catalogo = await catalogoVivoDoAdmin(empresaId, res); if (!catalogo) return;
    const [configuracoes, fitas] = await Promise.all([
      prisma.totemApresentacao.findMany({ where: { empresaId }, orderBy: { cwItemId: 'asc' } }),
      // `.catch` próprio: sem a tabela a tela do Cardápio continua abrindo, só sem fitas.
      prisma.produtoFita.findMany({ where: { empresaId }, select: { cwItemId: true, selo: true } }).catch(() => []),
    ]);
    res.json({
      ...mesclarAdmin(catalogo, configuracoes),
      sugestoes: sugerirCandidatos(catalogo),
      avisosApresentacao: projetarCatalogo(catalogo, configuracoes).avisos,
      // A fita por item e a lista fechada de selos — a tela monta o select com a lista
      // que o servidor aceita, e nunca com uma cópia própria.
      fitas: fitasParaAdmin(fitas),
      selos: SELOS,
    });
  } catch (err) { console.error('[totem/apresentacao]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Salvar a apresentação de UM item. NORMAL apaga a linha (é o estado padrão — a tabela só
// guarda EXPANDIDO) e por isso NÃO consulta o catálogo: é o único jeito de remover uma
// ÓRFÃ, cujo item sumiu do CW e nunca voltaria numa validação viva.
app.put('/api/totem/apresentacao/:cwItemId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    // Inteiro SEGURO e positivo: `12.7` e `1e30` não são ids do CW, e arredondar um
    // deles gravaria a configuração em cima de OUTRO item sem ninguém perceber.
    const cwItemId = Number(req.params.cwItemId);
    if (!Number.isSafeInteger(cwItemId) || cwItemId <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const modo = String(req.body?.modo ?? '');
    if (!MODOS.includes(modo)) return res.status(400).json({ erro: 'MODO_INVALIDO' });
    if (modo === 'NORMAL') {
      const { count } = await prisma.totemApresentacao.deleteMany({ where: { empresaId, cwItemId } });
      return res.json({ ok: true, removida: count > 0 });
    }
    const cwGrupoPrincipalId = Number(req.body?.cwGrupoPrincipalId);
    if (!Number.isSafeInteger(cwGrupoPrincipalId) || cwGrupoPrincipalId <= 0) return res.status(400).json({ erro: 'GRUPO_OBRIGATORIO' });
    // Validação VIVA contra o CW e pela MESMA função que o bootstrap usa para projetar:
    // salvar algo que o totem recusaria deixaria o card mentindo até alguém reparar.
    const catalogo = await catalogoVivoDoAdmin(empresaId, res); if (!catalogo) return;
    const veredito = validarConfiguracao({ modo, cwGrupoPrincipalId }, itemDoCatalogoCW(catalogo, cwItemId));
    if (!veredito.ok) return res.status(422).json({ erro: 'APRESENTACAO_INVALIDA', codigo: veredito.codigo });
    const cfg = await prisma.totemApresentacao.upsert({
      where: { empresaId_cwItemId: { empresaId, cwItemId } },
      create: { empresaId, cwItemId, modo, cwGrupoPrincipalId },
      update: { modo, cwGrupoPrincipalId },
    });
    res.json({ ok: true, config: { id: cfg.id, cwItemId: cfg.cwItemId, modo: cfg.modo, cwGrupoPrincipalId: cfg.cwGrupoPrincipalId } });
  } catch (err) { console.error('[totem/apresentacao PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// A FITA de um item: `{ selo: 'MAIS_PEDIDO' }` grava, `{ selo: null }` tira. Não consulta o
// catálogo de propósito — é apresentação, e tirar a fita de um item que saiu do CW tem de
// funcionar mesmo com o Cardápio Web fora do ar. Um selo por item; a lista é fechada.
app.put('/api/totem/fita/:cwItemId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const cwItemId = Number(req.params.cwItemId);
    if (!Number.isSafeInteger(cwItemId) || cwItemId <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const veredito = validarSelo(req.body?.selo);
    if (!veredito.ok) return res.status(400).json({ erro: veredito.codigo });
    if (veredito.selo === null) {
      const { count } = await prisma.produtoFita.deleteMany({ where: { empresaId, cwItemId } });
      return res.json({ ok: true, selo: null, removida: count > 0 });
    }
    const linha = await prisma.produtoFita.upsert({
      where: { empresaId_cwItemId: { empresaId, cwItemId } },
      create: { empresaId, cwItemId, selo: veredito.selo },
      update: { selo: veredito.selo },
    });
    res.json({ ok: true, selo: linha.selo });
  } catch (err) { console.error('[totem/fita PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Lista da tela: uma linha por categoria do catálogo VIVO, com o nome do CW, o
// apelido salvo e a sugestão sem emoji. A sugestão é oferecida, nunca aplicada:
// quem decide como a categoria se chama no totem é a loja.
app.get('/api/totem/categorias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const catalogo = await catalogoVivoDoAdmin(empresaId, res); if (!catalogo) return;
    const configuracoes = await prisma.totemCategoria.findMany({ where: { empresaId }, orderBy: { cwCategoriaId: 'asc' } });
    res.json({ categorias: mesclarAdminCategorias(catalogo, configuracoes) });
  } catch (err) { console.error('[totem/categorias]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Salvar o apelido de UMA categoria. Nome vazio APAGA a linha — é o estado
// padrão (mostrar o nome do CW) e o único jeito de remover uma órfã, cuja
// categoria sumiu do cardápio e nunca voltaria numa validação viva. Por isso
// este caminho não consulta o CW.
app.put('/api/totem/categorias/:cwCategoriaId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    // Inteiro SEGURO e positivo: arredondar `12.7` gravaria o apelido em cima de
    // OUTRA categoria sem ninguém perceber.
    const cwCategoriaId = Number(req.params.cwCategoriaId);
    if (!Number.isSafeInteger(cwCategoriaId) || cwCategoriaId <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const nomeExibido = String(req.body?.nomeExibido ?? '').trim().slice(0, 60);
    if (!nomeExibido) {
      const { count } = await prisma.totemCategoria.deleteMany({ where: { empresaId, cwCategoriaId } });
      return res.json({ ok: true, removida: count > 0 });
    }
    const cfg = await prisma.totemCategoria.upsert({
      where: { empresaId_cwCategoriaId: { empresaId, cwCategoriaId } },
      create: { empresaId, cwCategoriaId, nomeExibido },
      update: { nomeExibido },
    });
    res.json({ ok: true, config: { cwCategoriaId: cfg.cwCategoriaId, nomeExibido: cfg.nomeExibido } });
  } catch (err) { console.error('[totem/categorias PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Totem › Configurações do canal ─────────────────────────────────────────
// Agregado 1:1 por empresa. Empresa sem linha é caso NORMAL: responde os padrões e não
// cria nada — quem cria é o PUT, e a linha então permanece (voltar a 90 s não apaga).
//
// As opções viajam junto de propósito. A tela poderia ter a lista de valores escrita
// nela, e aí bastaria alguém mexer num limite aqui para o select passar a oferecer o que
// o servidor recusa. Uma fonte só, e ela é esta.
app.get('/api/totem/configuracao', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const linha = await prisma.totemConfiguracao.findUnique({ where: { empresaId } });
    res.json({
      configuracao: configuracaoParaJson(linha),
      // `salva` diz se a loja já decidiu alguma vez. A tela usa isto para mostrar
      // "padrão do sistema" em vez de fingir que 90 s foi escolha de alguém.
      salva: !!linha,
      opcoes: {
        ociosidadeSugerida: OCIOSIDADE_SUGERIDA,
        ociosidadeMin: OCIOSIDADE_MIN,
        ociosidadeMax: OCIOSIDADE_MAX,
        ociosidadePadrao: OCIOSIDADE_PADRAO,
      },
    });
  } catch (err) { console.error('[totem/configuracao]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Upsert, sempre. Este PUT NUNCA apaga a linha: diferente do apelido de categoria, aqui
// o padrão não é "ausência de configuração" — 90 s pode ser uma escolha registrada.
app.put('/api/totem/configuracao', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    // Campo AUSENTE é erro do chamador, e é diferente de campo torto. Normalizar o
    // `undefined` gravaria 90 s por cima da escolha da loja, e do lado de lá isso
    // apareceria como "a configuração se redefiniu sozinha".
    const bruto = req.body?.ociosidadeSegundos;
    if (bruto === undefined) return res.status(400).json({ erro: 'CAMPO_AUSENTE' });
    // Valor presente e fora da faixa é GRAMPEADO pela régua, não recusado: a resposta
    // devolve o que foi realmente gravado, e a tela mostra esse número.
    const ociosidadeSegundos = normalizarOciosidade(bruto);
    const linha = await prisma.totemConfiguracao.upsert({
      where: { empresaId },
      create: { empresaId, ociosidadeSegundos },
      update: { ociosidadeSegundos },
    });
    res.json({ ok: true, configuracao: configuracaoParaJson(linha), salva: true });
  } catch (err) { console.error('[totem/configuracao PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Totem › Aparência do canal ─────────────────────────────────────────────
// Endpoint PRÓPRIO, e não um campo a mais na configuração de ociosidade: são domínios
// diferentes, com telas diferentes e vidas diferentes. Enfiar cor num objeto genérico de
// "configurações" é como nasce o endpoint que ninguém mais consegue mudar.
app.get('/api/totem/aparencia', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const cfg = await prisma.totemConfiguracao.findUnique({ where: { empresaId } });
    const temFundo = (await prisma.totemEsperaFundo.findUnique({ where: { empresaId }, select: { empresaId: true } })) !== null;
    // O FUNDO primeiro: é ele que diz qual conjunto de overrides e quais padrões valem.
    // Ler os overrides sem ele devolveria a paleta escura enquanto a tela está clara.
    const layoutFundo = layoutEfetivo(cfg?.layoutFundo);
    const overrides = tokensDoLayout(cfg?.tokens, layoutFundo);
    const efetivas = coresEfetivas(cfg?.tokens, layoutFundo);
    const versao = Number.isInteger(cfg?.logoVersao) ? cfg.logoVersao : 0;
    res.json({
      // Os três estados que a tela precisa distinguir: o que é padrão, o que a loja
      // escolheu, e o que o cliente vê. Sem os três ela teria de copiar hexadecimal para
      // dentro do React, e aí o padrão passaria a existir em dois lugares.
      chaves: CHAVES_APARENCIA,
      // `padroes` é o do fundo ATUAL — é contra ele que a tela mostra "voltar ao padrão".
      // `padroesPorFundo` vai junto para a prévia de cada fundo no seletor não precisar
      // de uma segunda chamada.
      padroes: PADROES_POR_LAYOUT[layoutFundo],
      padroesPorFundo: PADROES_POR_LAYOUT,
      layoutFundo,
      layouts: LAYOUTS,
      // O que está GUARDADO (pode ser null) ao lado do padrão: a tela precisa distinguir
      // "a loja escolheu isto" de "está valendo o padrão" para saber o que pôr no campo.
      chamadaEspera: cfg?.chamadaEspera ?? null,
      chamadaPadrao: CHAMADA_PADRAO,
      chamadaMax: CHAMADA_MAX,
      // Título e subtítulo vão CRUS (podem ser null): aqui `null` é "a tela não desenha
      // esta linha", e resolver para um padrão inventaria texto que a loja não escreveu.
      tituloEspera: cfg?.tituloEspera ?? null,
      subtituloEspera: cfg?.subtituloEspera ?? null,
      tituloMax: TITULO_MAX,
      subtituloMax: SUBTITULO_MAX,
      fraseMeioEspera: cfg?.fraseMeioEspera ?? null,
      fraseMeioPadrao: FRASE_MEIO_PADRAO,
      fraseMeioMax: FRASE_MEIO_MAX,
      overrides,
      efetivas,
      contraste: diagnosticoDeContraste(efetivas),
      posicaoCategoriasPadrao: normalizarPosicao(cfg?.posicaoCategoriasPadrao) ?? 'esquerda',
      posicoes: POSICOES_CATEGORIAS,
      logo: {
        tem: typeof cfg?.logoDataUrl === 'string' && cfg.logoDataUrl.length > 0,
        versao,
        url: `/api/totem/aparencia/logo?v=${versao}`,
      },
      fundo: estadoDoFundo(cfg, temFundo),
      limiteLogoKb: Math.round(LOGO_MAX_BYTES / 1024),
    });
  } catch (err) { console.error('[totem/aparencia]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// PUT parcial. Chave omitida não é tocada; `null` remove o override e volta ao padrão.
// Entrada é RIGOROSA: chave desconhecida e cor inválida são 400, com a lista do que
// falhou — sumir com o campo e responder "salvo" é a mentira que o suporte descobre
// três semanas depois.
app.put('/api/totem/aparencia', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const corpo = req.body ?? {};
    const erros = [];
    let patch = null;
    if (corpo.tokens !== undefined) {
      patch = validarPatch(corpo.tokens);
      erros.push(...patch.erros);
    }
    let posicao;
    if (corpo.posicaoCategoriasPadrao !== undefined) {
      posicao = normalizarPosicao(corpo.posicaoCategoriasPadrao);
      if (posicao === null) erros.push({ chave: 'posicaoCategoriasPadrao', motivo: MOTIVO_POSICAO });
    }
    let layout;
    if (corpo.layoutFundo !== undefined) {
      layout = normalizarLayout(corpo.layoutFundo);
      if (layout === null) erros.push({ chave: 'layoutFundo', motivo: MOTIVO_LAYOUT });
    }
    // A chamada usa uma variável de PRESENÇA à parte: `valor` legítimo é `null` (voltar ao
    // padrão), então `if (chamada)` no lugar de `if (temChamada)` engoliria o pedido de
    // apagar e o campo nunca mais voltaria ao texto de fábrica.
    let temChamada = false;
    let chamada = null;
    if (corpo.chamadaEspera !== undefined) {
      const r = validarChamada(corpo.chamadaEspera);
      if (!r.ok) erros.push({ chave: 'chamadaEspera', motivo: MOTIVO_CHAMADA });
      else { temChamada = true; chamada = r.valor; }
    }
    // Os dois textos da vitrine seguem a mesma mecânica de presença: `null` é valor
    // legítimo ("apagar"), então quem decide se grava é a presença da chave no corpo.
    const textos = {};
    for (const [chave, teto, motivo] of [
      ['tituloEspera', TITULO_MAX, MOTIVO_TITULO],
      ['subtituloEspera', SUBTITULO_MAX, MOTIVO_SUBTITULO],
      ['fraseMeioEspera', FRASE_MEIO_MAX, MOTIVO_FRASE_MEIO],
    ]) {
      if (corpo[chave] === undefined) continue;
      const r = validarTexto(corpo[chave], teto);
      if (!r.ok) erros.push({ chave, motivo });
      else textos[chave] = r.valor;
    }
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });

    const atual = await prisma.totemConfiguracao.findUnique({ where: { empresaId } });
    // Em QUAL fundo o patch de cores cai: o que veio no corpo, se veio, senão o guardado.
    // A regra é "o fundo que vale DEPOIS deste PUT" — trocar de fundo e pintar na mesma
    // requisição pinta no fundo novo, que é a única leitura que não surpreende.
    const alvo = layout ?? layoutEfetivo(atual?.layoutFundo);
    const dados = {};
    // `aplicarPatch` parte do que está GUARDADO: o PUT não precisa reenviar as seis cores
    // para mexer numa, e o que ele não menciona continua exatamente como estava. Devolve o
    // cofre inteiro, com só o conjunto do fundo alvo tocado.
    if (patch) dados.tokens = aplicarPatch(atual?.tokens, patch, alvo);
    if (posicao) dados.posicaoCategoriasPadrao = posicao;
    if (layout) dados.layoutFundo = layout;
    if (temChamada) dados.chamadaEspera = chamada;
    Object.assign(dados, textos);

    const linha = await prisma.totemConfiguracao.upsert({
      where: { empresaId },
      create: { empresaId, ...dados },
      update: dados,
    });
    const layoutFundo = layoutEfetivo(linha.layoutFundo);
    const efetivas = coresEfetivas(linha.tokens, layoutFundo);
    res.json({
      ok: true,
      layoutFundo,
      padroes: PADROES_POR_LAYOUT[layoutFundo],
      chamadaEspera: linha.chamadaEspera ?? null,
      tituloEspera: linha.tituloEspera ?? null,
      subtituloEspera: linha.subtituloEspera ?? null,
      fraseMeioEspera: linha.fraseMeioEspera ?? null,
      overrides: tokensDoLayout(linha.tokens, layoutFundo),
      efetivas,
      contraste: diagnosticoDeContraste(efetivas),
      posicaoCategoriasPadrao: linha.posicaoCategoriasPadrao,
    });
  } catch (err) { console.error('[totem/aparencia PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// A logo, para a PRÉVIA do admin. Mesma função de resposta da rota do aparelho.
app.get('/api/totem/aparencia/logo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const cfg = await prisma.totemConfiguracao.findUnique({ where: { empresaId } });
    const bytes = decodificarDataUrl(cfg?.logoDataUrl);
    if (!bytes) return res.status(404).end();
    responderImagem(res, bytes, `${empresaId}-${cfg?.logoVersao ?? 0}`, req);
  } catch (err) { console.error('[totem/aparencia logo]', err); res.status(500).end(); }
});

// ── A foto de fundo da vitrine ──
// Mesmo trio da logo (ver, trocar, remover), com uma diferença que é o motivo de existir
// separado: os bytes moram em TotemEsperaFundo, e não na linha de configuração.
const estadoDoFundo = (cfg, tem) => {
  const versao = Number.isInteger(cfg?.fundoEsperaVersao) && cfg.fundoEsperaVersao >= 0 ? cfg.fundoEsperaVersao : 0;
  return {
    tem: tem === true, versao, url: `/api/totem/aparencia/fundo?v=${versao}`,
    limiteKb: Math.round(BANNER_IMG_MAX / 1024),
    // A medida vai do servidor para o admin não ter um número escrito à mão que a folha do
    // quiosque possa desmentir depois.
    medida: FUNDO_ESPERA_MEDIDA,
  };
};

app.get('/api/totem/aparencia/fundo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const [cfg, fundo] = await Promise.all([
      prisma.totemConfiguracao.findUnique({ where: { empresaId }, select: { fundoEsperaVersao: true } }),
      prisma.totemEsperaFundo.findUnique({ where: { empresaId } }),
    ]);
    if (!fundo?.dados) return res.status(404).end();
    responderImagem(res, { tipo: fundo.tipo, bytes: fundo.dados }, `fundo-${empresaId}-${cfg?.fundoEsperaVersao ?? 0}`, req);
  } catch (err) { console.error('[totem/aparencia fundo]', err); res.status(500).end(); }
});

// A mesma régua dos banners (`lerImagem`): tipo REAL pelos bytes, teto de 700 KB. A versão
// sobe sempre — trocar a foto é trocar os bytes, e é ela que invalida o cache do tablet.
app.put('/api/totem/aparencia/fundo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const lida = lerImagemBanner(req.body?.dataUrl);
    if (lida.erro) return res.status(400).json({ erro: lida.erro });
    const atual = await prisma.totemConfiguracao.findUnique({ where: { empresaId }, select: { fundoEsperaVersao: true } });
    const versao = proximaVersaoImagem(atual?.fundoEsperaVersao);
    // Transação: os bytes e a versão precisam mudar juntos, senão um tablet pode ler a
    // versão nova e ainda receber os bytes velhos (ou o contrário) na janela entre os dois.
    const [linha] = await prisma.$transaction([
      prisma.totemConfiguracao.upsert({
        where: { empresaId },
        create: { empresaId, fundoEsperaVersao: versao },
        update: { fundoEsperaVersao: versao },
      }),
      prisma.totemEsperaFundo.upsert({
        where: { empresaId },
        create: { empresaId, tipo: lida.tipo, dados: lida.bytes },
        update: { tipo: lida.tipo, dados: lida.bytes },
      }),
    ]);
    res.json({ ok: true, fundo: estadoDoFundo(linha, true) });
  } catch (err) { console.error('[totem/aparencia fundo PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Remover também SOBE a versão, como na logo: sem isso o tablet seguiria servindo do cache
// uma foto que a loja acabou de tirar.
app.delete('/api/totem/aparencia/fundo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const atual = await prisma.totemConfiguracao.findUnique({ where: { empresaId }, select: { fundoEsperaVersao: true } });
    const versao = proximaVersaoImagem(atual?.fundoEsperaVersao);
    const [linha] = await prisma.$transaction([
      prisma.totemConfiguracao.upsert({
        where: { empresaId },
        create: { empresaId, fundoEsperaVersao: versao },
        update: { fundoEsperaVersao: versao },
      }),
      prisma.totemEsperaFundo.deleteMany({ where: { empresaId } }),
    ]);
    res.json({ ok: true, fundo: estadoDoFundo(linha, false) });
  } catch (err) { console.error('[totem/aparencia fundo DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Trocar a logo. A versão sobe SEMPRE que os bytes mudam — é ela que invalida o cache do
// tablet sem depender de o navegador reconsultar.
app.put('/api/totem/aparencia/logo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const erro = validarLogoDataUrl(req.body?.dataUrl);
    if (erro) return res.status(400).json({ erro });
    const atual = await prisma.totemConfiguracao.findUnique({ where: { empresaId } });
    const versao = proximaVersaoLogo({ atual: atual?.logoVersao, mudou: atual?.logoDataUrl !== req.body.dataUrl });
    const linha = await prisma.totemConfiguracao.upsert({
      where: { empresaId },
      create: { empresaId, logoDataUrl: req.body.dataUrl, logoVersao: 1 },
      update: { logoDataUrl: req.body.dataUrl, logoVersao: versao },
    });
    res.json({ ok: true, logo: { tem: true, versao: linha.logoVersao, url: `/api/totem/aparencia/logo?v=${linha.logoVersao}` } });
  } catch (err) { console.error('[totem/aparencia logo PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Remover também SOBE a versão: sem isso o tablet continuaria servindo do cache uma logo
// que a loja acabou de tirar do ar.
app.delete('/api/totem/aparencia/logo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const atual = await prisma.totemConfiguracao.findUnique({ where: { empresaId } });
    if (!atual?.logoDataUrl) return res.json({ ok: true, logo: { tem: false, versao: atual?.logoVersao ?? 0 } });
    const versao = proximaVersaoLogo({ atual: atual.logoVersao, mudou: true });
    const linha = await prisma.totemConfiguracao.update({
      where: { empresaId }, data: { logoDataUrl: null, logoVersao: versao },
    });
    res.json({ ok: true, logo: { tem: false, versao: linha.logoVersao } });
  } catch (err) { console.error('[totem/aparencia logo DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Totem › Banners (admin) ────────────────────────────────────────────────
// TODA consulta leva `empresaId` no `where`, inclusive as que já recebem um `id` na URL.
// Não é redundância: é o que faz um id adulterado devolver "não encontrado" em vez da
// linha de outra loja. O `empresaId` sai SEMPRE da sessão, nunca do corpo.
app.get('/api/totem/banners', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const linhas = await prisma.totemBanner.findMany({
      where: { empresaId }, select: BANNER_CAMPOS, orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    });
    const agora = Date.now();
    res.json({
      banners: linhas.map((b) => bannerParaAdmin(b, agora)),
      agoraServidor: new Date(agora).toISOString(),
      limites: {
        duracaoMin: BANNER_DUR_MIN, duracaoMax: BANNER_DUR_MAX, duracaoPadrao: BANNER_DUR_PADRAO,
        imagemKb: Math.round(BANNER_IMG_MAX / 1024), tipos: BANNER_TIPOS, medidas: BANNER_MEDIDAS,
      },
    });
  } catch (err) { console.error('[totem/banners]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Criar. Nome e imagem são obrigatórios: banner sem arte só existiria para falhar na tela.
// Nasce no FIM da fila — quem cadastra depois não passa na frente sem pedir.
app.post('/api/totem/banners', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const v = validarBanner(req.body, { exigirNome: true });
    const janela = conferirJanela(v.dados, null);
    const erros = [...v.erros, ...(janela ? [janela] : [])];
    const img = lerImagemBanner(req.body?.imagem);
    if (img.erro) erros.push({ campo: 'imagem', motivo: img.erro });
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });

    // A ordem é POR TIPO: as duas listas giram separadas, e uma capa nova não pode nascer
    // atrás de dez banners da tela de espera.
    const tipo = v.dados.tipo ?? BANNER_TIPO_PADRAO;
    const ultimo = await prisma.totemBanner.findFirst({ where: { empresaId, tipo }, orderBy: { ordem: 'desc' }, select: { ordem: true } });
    const criado = await prisma.totemBanner.create({
      data: {
        empresaId,
        ...v.dados,
        tipo,
        ordem: (ultimo?.ordem ?? -1) + 1,
        imagemVersao: 1,
        imagemTipo: img.tipo,
        imagemBytes: img.bytes.length,
        imagem: { create: { dados: img.bytes } },
      },
      select: BANNER_CAMPOS,
    });
    res.status(201).json({ ok: true, banner: bannerParaAdmin(criado, Date.now()) });
  } catch (err) { console.error('[totem/banners POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ⚠️ ANTES do `/:id`: o Express casa na ORDEM de declaração, e com esta rota embaixo o
// caminho `/banners/ordem` cairia no parâmetro, viraria `Number('ordem')` = NaN e
// responderia 400 — um bug que só aparece ao arrastar, nunca ao editar.
// Reordenar em lote. A lista chega inteira e a ordem é reescrita por POSIÇÃO — nada de
// trocar dois vizinhos, que deixa buracos e empates quando duas abas mexem juntas.
//
// `updateMany` com empresaId no where, dentro de uma transação: um id de outra loja não
// atualiza nada em vez de reordenar o carrossel dela.
app.put('/api/totem/banners/ordem', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
    if (!ids || !ids.length || ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
      return res.status(400).json({ erro: 'ENTRADA_INVALIDA' });
    }
    await prisma.$transaction(ids.map((id, i) => prisma.totemBanner.updateMany({ where: { id, empresaId }, data: { ordem: i } })));
    const linhas = await prisma.totemBanner.findMany({ where: { empresaId }, select: BANNER_CAMPOS, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    const agora = Date.now();
    res.json({ ok: true, banners: linhas.map((b) => bannerParaAdmin(b, agora)) });
  } catch (err) { console.error('[totem/banners ordem]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Editar nome, ativo, duração e agenda. NÃO toca na imagem nem na versão dela: corrigir um
// título não pode obrigar todos os tablets a rebaixar a arte que já têm em cache.
app.put('/api/totem/banners/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.totemBanner.findFirst({ where: { id, empresaId }, select: BANNER_CAMPOS });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });

    const v = validarBanner(req.body);
    const janela = conferirJanela(v.dados, atual);
    const erros = [...v.erros, ...(janela ? [janela] : [])];
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });

    const linha = await prisma.totemBanner.update({ where: { id }, data: v.dados, select: BANNER_CAMPOS });
    res.json({ ok: true, banner: bannerParaAdmin(linha, Date.now()) });
  } catch (err) { console.error('[totem/banners PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Substituir a arte. É a ÚNICA rota que incrementa `imagemVersao` — é ela que invalida o
// cache de um ano dos tablets.
app.put('/api/totem/banners/:id/imagem', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.totemBanner.findFirst({ where: { id, empresaId }, select: { id: true, imagemVersao: true } });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const img = lerImagemBanner(req.body?.imagem);
    if (img.erro) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'imagem', motivo: img.erro }] });

    const linha = await prisma.totemBanner.update({
      where: { id },
      data: {
        imagemVersao: proximaVersaoImagem(atual.imagemVersao),
        imagemTipo: img.tipo,
        imagemBytes: img.bytes.length,
        imagem: { upsert: { create: { dados: img.bytes }, update: { dados: img.bytes } } },
      },
      select: BANNER_CAMPOS,
    });
    res.json({ ok: true, banner: bannerParaAdmin(linha, Date.now()) });
  } catch (err) { console.error('[totem/banners imagem PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Excluir. `deleteMany` com empresaId: id adulterado apaga ZERO linhas em vez da de outra
// loja. A arte vai junto por CASCADE, na mesma transação do banco — não há passo separado
// de mídia que possa falhar pela metade.
app.delete('/api/totem/banners/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const { count } = await prisma.totemBanner.deleteMany({ where: { id, empresaId } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    res.json({ ok: true });
  } catch (err) { console.error('[totem/banners DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// A arte, para a PRÉVIA e a miniatura do admin.
app.get('/api/totem/banners/:id/imagem', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).end();
    const banner = await prisma.totemBanner.findFirst({
      where: { id, empresaId },
      select: { imagemVersao: true, imagemTipo: true, imagem: { select: { dados: true } } },
    });
    if (!banner?.imagem?.dados || !banner.imagemTipo) return res.status(404).end();
    responderImagem(res, { tipo: banner.imagemTipo, bytes: banner.imagem.dados }, `b${id}-${empresaId}-${banner.imagemVersao}`, req);
  } catch (err) { console.error('[totem/banners imagem]', err); res.status(500).end(); }
});

// ── TV Indoor › Conteúdos, Playlists e Telas (ADMIN) ───────────────────────
// Canal IRMÃO do totem: mesma disciplina, domínio próprio. TODA consulta leva `empresaId`
// no `where`, inclusive as que já recebem um `id` na URL — não é redundância, é o que faz
// um id adulterado devolver "não encontrado" em vez da linha de outra loja. O `empresaId`
// sai SEMPRE da sessão, nunca do corpo.
//
// A área de permissão é `aparelhos` (acessos/areas.js), a mesma do totem: quem cadastra o
// aparelho é quem programa o que ele mostra.
app.get('/api/tv-indoor/conteudos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const linhas = await prisma.tvConteudo.findMany({
      where: { empresaId }, select: TV_CAMPOS, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    });
    const agora = Date.now();
    res.json({
      conteudos: linhas.map((c) => tvConteudoParaAdmin(c, agora)),
      agoraServidor: new Date(agora).toISOString(),
      limites: {
        duracaoMin: TV_DUR_MIN, duracaoMax: TV_DUR_MAX, duracaoPadrao: TV_DUR_PADRAO,
        imagemKb: Math.round(TV_IMG_MAX / 1024), medida: TV_MEDIDA, maxItensPlaylist: TV_MAX_ITENS,
      },
    });
  } catch (err) { console.error('[tv-indoor/conteudos]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Criar. Nome e imagem são obrigatórios: conteúdo sem imagem só existiria para falhar na
// tela — e numa TV que fica ligada o dia inteiro isso é uma tarja preta na parede.
app.post('/api/tv-indoor/conteudos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const v = validarTvConteudo(req.body, { exigirNome: true });
    const janela = conferirJanelaTv(v.dados, null);
    const erros = [...v.erros, ...(janela ? [janela] : [])];
    const img = lerImagemMidia(req.body?.imagem, { maxBytes: TV_IMG_MAX });
    if (img.erro) erros.push({ campo: 'imagem', motivo: img.erro });
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });

    const criado = await prisma.tvConteudo.create({
      data: {
        empresaId,
        ...v.dados,
        imagemVersao: 1,
        imagemTipo: img.tipo,
        imagemBytes: img.bytes.length,
        imagem: { create: { dados: img.bytes } },
      },
      select: TV_CAMPOS,
    });
    res.status(201).json({ ok: true, conteudo: tvConteudoParaAdmin(criado, Date.now()) });
  } catch (err) { console.error('[tv-indoor/conteudos POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Editar nome, ativo, duração e agenda. NÃO toca na imagem nem na versão dela: corrigir um
// título não pode obrigar todas as TVs a rebaixar a arte que já têm em cache por um ano.
app.put('/api/tv-indoor/conteudos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvConteudo.findFirst({ where: { id, empresaId }, select: TV_CAMPOS });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });

    const v = validarTvConteudo(req.body);
    const janela = conferirJanelaTv(v.dados, atual);
    const erros = [...v.erros, ...(janela ? [janela] : [])];
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });

    const linha = await prisma.tvConteudo.update({ where: { id }, data: v.dados, select: TV_CAMPOS });
    res.json({ ok: true, conteudo: tvConteudoParaAdmin(linha, Date.now()) });
  } catch (err) { console.error('[tv-indoor/conteudos PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Substituir a imagem. É a ÚNICA rota que incrementa `imagemVersao` — é ela que invalida o
// cache de um ano das TVs.
app.put('/api/tv-indoor/conteudos/:id/imagem', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvConteudo.findFirst({ where: { id, empresaId }, select: { id: true, imagemVersao: true } });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const img = lerImagemMidia(req.body?.imagem, { maxBytes: TV_IMG_MAX });
    if (img.erro) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'imagem', motivo: img.erro }] });

    const linha = await prisma.tvConteudo.update({
      where: { id },
      data: {
        imagemVersao: proximaVersaoTv(atual.imagemVersao),
        imagemTipo: img.tipo,
        imagemBytes: img.bytes.length,
        imagem: { upsert: { create: { dados: img.bytes }, update: { dados: img.bytes } } },
      },
      select: TV_CAMPOS,
    });
    res.json({ ok: true, conteudo: tvConteudoParaAdmin(linha, Date.now()) });
  } catch (err) { console.error('[tv-indoor/conteudos imagem PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Excluir. `deleteMany` com empresaId: id adulterado apaga ZERO linhas em vez da de outra
// loja. A imagem e os vínculos com playlists vão junto por CASCADE, na mesma transação do
// banco — não há passo separado de mídia que possa falhar pela metade.
app.delete('/api/tv-indoor/conteudos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const { count } = await prisma.tvConteudo.deleteMany({ where: { id, empresaId } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    res.json({ ok: true });
  } catch (err) { console.error('[tv-indoor/conteudos DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// A imagem, para a miniatura e a prévia do admin.
app.get('/api/tv-indoor/conteudos/:id/imagem', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).end();
    const c = await prisma.tvConteudo.findFirst({
      where: { id, empresaId },
      select: { imagemVersao: true, imagemTipo: true, imagem: { select: { dados: true } } },
    });
    if (!c?.imagem?.dados || !c.imagemTipo) return res.status(404).end();
    responderImagem(res, { tipo: c.imagemTipo, bytes: c.imagem.dados }, `tv${id}-${empresaId}-${c.imagemVersao}`, req);
  } catch (err) { console.error('[tv-indoor/conteudos imagem]', err); res.status(500).end(); }
});

// ── Playlists ───────────────────────────────────────────────────────────────
// A programação com os conteúdos já resolvidos: a tela precisa do nome, da miniatura e do
// status de cada um para mostrar a sequência, e uma segunda chamada por playlist deixaria
// a tela piscando em lista.
// Campos do menu board SEM a configuração: a listagem de playlists só precisa do cabeçalho.
/* ⚠️ A POSIÇÃO DESTE BLOCO É PARTE DO CÓDIGO, não arrumação.

   `TV_PLAYLIST_INCLUDE`, logo abaixo, é um literal de objeto no topo do módulo: ele é
   AVALIADO no import, não quando alguma rota roda. Um `const` declarado depois dele ainda
   está na temporal dead zone nesse instante, e a referência estoura com

       ReferenceError: Cannot access 'TV_VIDEO_CAMPOS' before initialization

   antes do `app.listen` — ou seja, o processo nem sobe. Foi exatamente o que derrubou o
   PDV em produção quando este bloco morava lá embaixo, junto dos limites de vídeo.

   Os usos dentro de corpos de função (rotas, helpers) são adiados e aceitam qualquer ordem.
   O que NÃO aceita é ser consumido por outro `const` de topo. Se for mover algo daqui,
   mova para CIMA. */
const TV_VIDEO_CAMPOS = {
  id: true, nome: true, ativo: true, inicioEm: true, fimEm: true,
  arquivoVersao: true, arquivoTipo: true, arquivoBytes: true, storageKey: true,
  duracaoMs: true, largura: true, altura: true, nomeOriginal: true,
};

// `arquivoBytes` é BigInt no banco (um vídeo passa de 2 GB em tese) e o JSON não o serializa.
// A conversão acontece num lugar só, na fronteira — e não espalhada por cada rota.
const videoAdmin = (v, agora) => videoParaAdmin({ ...v, arquivoBytes: v.arquivoBytes === null || v.arquivoBytes === undefined ? null : Number(v.arquivoBytes) }, agora);

const MB_CABECALHO = { id: true, nome: true, ativo: true, layout: true, duracaoSegundos: true };
// O CABEÇALHO é o que basta para listar playlists; os CAMPOS incluem o que a cena precisa
// para ser desenhada. A separação existe porque a programação de uma playlist carrega o
// cabeçalho de cada board, e arrastar texto e flags ali seria pagar por dado que ninguém lê.
const MB_TEXTO = { titulo: true, subtitulo: true, mostrarLogo: true, mostrarDescricao: true, mostrarImagem: true, mostrarFita: true };
const MB_CAMPOS = { ...MB_CABECALHO, ...MB_TEXTO, configuracao: true };

// Minutos → "HH:MM" para descrever uma regra no monitoramento. Reexportado do domínio da
// grade de propósito: um segundo formatador aqui divergiria do primeiro no dia em que
// alguém mudasse um dos dois.
const horaDeMinutosTv = (min) => {
  const p = (x) => String(x).padStart(2, '0');
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
};

// A regra da grade como o domínio a espera. `playlist` vem junto só pelo NOME, para o
// admin escrever "Jantar" em vez de "playlist 12" — os itens dela não entram aqui.
const TV_REGRA_CAMPOS = {
  id: true, dispositivoId: true, playlistId: true, ativo: true,
  dias: true, inicioMin: true, fimMin: true, ordem: true, validoDe: true, validoAte: true,
  playlist: { select: { id: true, nome: true } },
};

// O fuso DA LOJA. Sem configuração (ou sem a tabela, num deploy antes da migration) cai no
// padrão do canal — nunca no fuso do processo, que é justamente o que esta frente evita.
async function fusoDaEmpresa(empresaId) {
  const cfg = await prisma.tvIndoorConfiguracao
    .findFirst({ where: { empresaId }, select: { fusoHorario: true } })
    .catch(() => null);
  return fusoOuPadrao(cfg?.fusoHorario);
}

// As regras de UMA tela, na ordem que É a prioridade. O `empresaId` viaja junto mesmo já
// tendo o `dispositivoId`: sem ele, um id de outra loja associado por engano devolveria a
// grade dela — e o escopo é o que torna isso impossível em vez de improvável.
const regrasDaTela = (empresaId, dispositivoId) => prisma.tvProgramacaoRegra.findMany({
  where: { empresaId, dispositivoId },
  orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
  select: TV_REGRA_CAMPOS,
});

const TV_PLAYLIST_INCLUDE = {
  id: true, nome: true,
  itens: {
    // POLIMÓRFICO: cada item traz a referência que lhe cabe, e só ela. O `tipo` é o que
    // permite à mesma programação alternar arte promocional e menu board.
    select: {
      id: true, ordem: true, tipo: true, duracaoSegundos: true,
      conteudo: { select: TV_CAMPOS }, menuBoard: { select: MB_CABECALHO }, video: { select: TV_VIDEO_CAMPOS },
    },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
  },
};

// A playlist para o admin, com o cabeçalho de cada board já no formato da tela.
const tvPlaylistAdmin = (linha) => tvPlaylistParaAdmin(linha, Date.now(), menuBoardParaAdmin, videoAdmin);

app.get('/api/tv-indoor/playlists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const linhas = await prisma.tvPlaylist.findMany({
      where: { empresaId }, select: TV_PLAYLIST_INCLUDE, orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    res.json({ playlists: linhas.map(tvPlaylistAdmin), agoraServidor: new Date().toISOString() });
  } catch (err) { console.error('[tv-indoor/playlists]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.post('/api/tv-indoor/playlists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const v = validarNomePlaylist(req.body?.nome);
    if (!v.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'nome', motivo: v.motivo }] });
    const criada = await prisma.tvPlaylist.create({ data: { empresaId, nome: v.nome }, select: TV_PLAYLIST_INCLUDE });
    res.status(201).json({ ok: true, playlist: tvPlaylistAdmin(criada) });
  } catch (err) { console.error('[tv-indoor/playlists POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.put('/api/tv-indoor/playlists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const v = validarNomePlaylist(req.body?.nome);
    if (!v.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'nome', motivo: v.motivo }] });
    const { count } = await prisma.tvPlaylist.updateMany({ where: { id, empresaId }, data: { nome: v.nome } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const linha = await prisma.tvPlaylist.findFirst({ where: { id, empresaId }, select: TV_PLAYLIST_INCLUDE });
    res.json({ ok: true, playlist: tvPlaylistAdmin(linha) });
  } catch (err) { console.error('[tv-indoor/playlists PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Os ITENS da playlist, de uma vez. A lista chega inteira e a ordem é reescrita por
// POSIÇÃO — nada de trocar dois vizinhos, que deixa buracos e empates quando duas abas
// mexem juntas.
//
// O escopo aqui protege DUAS coisas: a playlist (que precisa ser desta loja) e cada
// conteúdo (idem). Os ids permitidos saem de uma consulta escopada, e `validarItensTv`
// RECUSA — não filtra — o que não estiver nela: filtrar deixaria a tela dizendo "salvo"
// com menos conteúdos do que o gestor escolheu, sem ele saber qual sumiu.
app.put('/api/tv-indoor/playlists/:id/itens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const playlist = await prisma.tvPlaylist.findFirst({ where: { id, empresaId }, select: { id: true } });
    if (!playlist) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });

    // Os dois conjuntos permitidos saem de consultas ESCOPADAS. É por aqui que o board da
    // empresa B não entra na playlist da A — e o domínio RECUSA o que não estiver neles, em
    // vez de filtrar: filtrar deixaria a tela dizendo "salvo" com menos itens do que o
    // gestor escolheu, sem ele saber qual sumiu.
    const [meusConteudos, meusBoards, meusVideos] = await Promise.all([
      prisma.tvConteudo.findMany({ where: { empresaId }, select: { id: true } }),
      prisma.tvMenuBoard.findMany({ where: { empresaId }, select: { id: true } }).catch(() => []),
      prisma.tvVideo.findMany({ where: { empresaId }, select: { id: true } }).catch(() => []),
    ]);
    const disponiveis = {
      conteudos: new Set(meusConteudos.map((c) => c.id)),
      boards: new Set(meusBoards.map((b) => b.id)),
      videos: new Set(meusVideos.map((v) => v.id)),
    };
    // Contrato ADITIVO: `itens` é o corpo polimórfico novo; `ids` continua aceito e vira
    // uma lista só de imagens — é o formato que a tela usava antes do Menu Board.
    const corpo = Array.isArray(req.body?.itens)
      ? req.body.itens
      : (Array.isArray(req.body?.ids) ? req.body.ids.map((x) => ({ tipo: 'IMAGEM', conteudoId: Number(x) })) : null);
    const v = validarItensPlaylist(corpo, disponiveis);
    if (!v.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'itens', motivo: v.motivo }] });
    if (v.itens.length > TV_MAX_ITENS) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'itens', motivo: 'LIMITE_DE_ITENS' }] });

    // Apagar e recriar dentro da MESMA transação: a programação nunca fica pela metade, e
    // uma TV que buscar no meio da troca lê o estado antigo ou o novo, nunca um híbrido.
    await prisma.$transaction([
      prisma.tvPlaylistItem.deleteMany({ where: { playlistId: id } }),
      ...(v.itens.length ? [prisma.tvPlaylistItem.createMany({ data: itensPlaylistParaGravar(id, v.itens) })] : []),
    ]);
    const linha = await prisma.tvPlaylist.findFirst({ where: { id, empresaId }, select: TV_PLAYLIST_INCLUDE });
    res.json({ ok: true, playlist: tvPlaylistAdmin(linha) });
  } catch (err) { console.error('[tv-indoor/playlists itens PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Excluir a playlist. As TVs que a usavam caem para `tvPlaylistId: null` pelo SET NULL da
// FK — elas passam a mostrar o fallback institucional, que é estado legítimo, em vez de o
// delete travar ou a TV sumir junto.
app.delete('/api/tv-indoor/playlists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const { count } = await prisma.tvPlaylist.deleteMany({ where: { id, empresaId } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    res.json({ ok: true });
  } catch (err) { console.error('[tv-indoor/playlists DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Menu Boards ─────────────────────────────────────────────────────────────
// O segundo tipo de item da programação: uma tela montada com o CATÁLOGO REAL da loja.
//
// O que se guarda aqui é REFERÊNCIA e ESCOLHA (qual categoria, quais itens, em que ordem,
// qual é o destaque). Nome, preço, foto, promoção e disponibilidade NÃO são gravados: eles
// vêm do Cardápio Web a cada resolução, e uma cópia aqui seria uma segunda fonte de verdade
// sobre dinheiro. Mudou o preço lá, muda na parede no próximo refresh.
app.get('/api/tv-indoor/menu-boards', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const linhas = await prisma.tvMenuBoard.findMany({
      where: { empresaId }, select: MB_CAMPOS, orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    res.json({
      // A LISTAGEM não resolve catálogo nenhum, de propósito: ela precisa abrir mesmo com o
      // HUB fora do ar. Quem consulta o cardápio é a tela de edição e a programação da TV.
      menuBoards: linhas.map(menuBoardParaAdmin),
      // Cada template leva as OPÇÕES que oferece. O editor lê daqui em vez de ter a própria
      // tabela — é o que garante que nenhum interruptor apareça sem ter efeito, e nenhum
      // efeito exista sem interruptor.
      layouts: Object.values(MB_LAYOUTS).map((t) => ({ ...t, opcoes: opcoesDoTemplate(t.id) })),
      limites: { duracaoMin: MB_DUR_MIN, duracaoMax: MB_DUR_MAX, duracaoPadrao: MB_DUR_PADRAO },
    });
  } catch (err) { console.error('[tv-indoor/menu-boards]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.post('/api/tv-indoor/menu-boards', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const v = validarMenuBoard(req.body, { exigirNome: true, layoutAtual: req.body?.layout ?? MB_LAYOUT_PADRAO });
    if (!v.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: v.erros });
    const criado = await prisma.tvMenuBoard.create({
      data: { empresaId, ...v.dados, configuracao: v.dados.configuracao ?? { titulo: '', itens: [] } },
      select: MB_CAMPOS,
    });
    res.status(201).json({ ok: true, menuBoard: menuBoardParaAdmin(criado) });
  } catch (err) { console.error('[tv-indoor/menu-boards POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.put('/api/tv-indoor/menu-boards/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvMenuBoard.findFirst({ where: { id, empresaId }, select: MB_CAMPOS });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    // A configuração é validada contra o layout FINAL (o do corpo, ou o já salvo): trocar de
    // DESTAQUE para GRADE mandando a configuração antiga guardaria uma escolha que o layout
    // novo ignora em silêncio.
    const v = validarMenuBoard(req.body, { layoutAtual: atual.layout });
    if (!v.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: v.erros });
    const linha = await prisma.tvMenuBoard.update({ where: { id }, data: v.dados, select: MB_CAMPOS });
    res.json({ ok: true, menuBoard: menuBoardParaAdmin(linha) });
  } catch (err) { console.error('[tv-indoor/menu-boards PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Excluir. `deleteMany` com empresaId: id adulterado apaga ZERO linhas. Os itens de playlist
// que apontavam para ele vão junto por CASCADE — a programação simplesmente encurta, e a TV
// segue tocando o resto.
app.delete('/api/tv-indoor/menu-boards/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const { count } = await prisma.tvMenuBoard.deleteMany({ where: { id, empresaId } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    res.json({ ok: true });
  } catch (err) { console.error('[tv-indoor/menu-boards DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// O CATÁLOGO para escolher os produtos, e a PRÉVIA de um board já configurado.
//
// O catálogo sai do serviço neutro (`catalogoDaLoja`), que é quem tem o último-estado-bom:
// com o HUB fora do ar por um minuto, a tela ainda abre com os últimos preços conhecidos e
// diz que está desatualizada, em vez de mostrar "erro" e sumir com a seleção do gestor.
//
// `empresaId` vem da SESSÃO. O catálogo é o da loja da sessão e de mais nenhuma: não existe
// caminho em que o navegador escolha de quem é o cardápio.
async function catalogoParaMenuBoard(empresaId) {
  const r = await catalogoDaLoja(empresaId, {
    clienteIdDaEmpresa: clienteIdDaEmpresaTotem,
    bootstrap: bootstrapTotemCW,
  });
  const fitas = await prisma.produtoFita.findMany({ where: { empresaId }, select: { cwItemId: true, selo: true } }).catch(() => []);
  return { ...r, fitas: fitasPorItem(fitas) };
}

app.get('/api/tv-indoor/catalogo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const r = await catalogoParaMenuBoard(empresaId);
    if (!r.ok) return res.status(r.codigo === 'CLIENTE_SEM_CW' ? 409 : 503).json({ erro: r.codigo });
    // Só o que a escolha precisa: categoria, id, nome, foto, preço e disponibilidade. Os
    // grupos de opções do item (a árvore técnica do CW) ficariam pesados e não servem aqui.
    const categorias = (r.catalogo.categorias ?? []).map((c) => ({
      id: c?.id, nome: c?.nome ?? null,
      itens: (c?.itens ?? []).map((i) => ({
        id: i?.id, nome: i?.nome ?? null, descricao: i?.descricao ?? null,
        imagem: i?.imagem ?? null, preco: i?.preco ?? null,
        ...(typeof i?.precoPromocional === 'number' ? { precoPromocional: i.precoPromocional } : {}),
        status: i?.status ?? null,
        selo: r.fitas.get(String(i?.id)) ?? null,
      })),
    }));
    res.json({ categorias, desatualizado: r.desatualizado === true, catalogoEm: r.em ?? null, selos: SELOS });
  } catch (err) { console.error('[tv-indoor/catalogo]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// A PRÉVIA: o board resolvido contra o catálogo atual, exatamente como a TV o receberá —
// mesma função (`resolverMenuBoard`), mesmos campos. É o que garante que o admin e a parede
// não mostrem coisas diferentes.
//
// A prévia leva o que a TV NÃO leva: `ausentes`, as referências que não existem mais no
// catálogo. É assim que o gestor descobre que um produto saiu do cardápio — e a referência
// NÃO é apagada por isso: some-la seria perder a escolha dele sem aviso.
app.get('/api/tv-indoor/menu-boards/:id/previa', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const board = await prisma.tvMenuBoard.findFirst({ where: { id, empresaId }, select: MB_CAMPOS });
    if (!board) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const r = await catalogoParaMenuBoard(empresaId);
    if (!r.ok) return res.status(r.codigo === 'CLIENTE_SEM_CW' ? 409 : 503).json({ erro: r.codigo });
    res.json({ previa: resolverMenuBoard(board, r.catalogo, r.fitas), desatualizado: r.desatualizado === true });
  } catch (err) { console.error('[tv-indoor/menu-boards previa]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Vídeos (ADMIN) ──────────────────────────────────────────────────────────
// O terceiro tipo de item da programação. A diferença de escala em relação à imagem muda
// tudo: os bytes vão para o FILESYSTEM (`armazenamentoMidia.js`), o upload é STREAMING (o
// arquivo nunca existe inteiro no heap) e o download é por RANGE.
app.get('/api/tv-indoor/videos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const linhas = await prisma.tvVideo.findMany({
      where: { empresaId }, select: TV_VIDEO_CAMPOS, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    });
    const agora = Date.now();
    const usado = await midiaFs.usoDaEmpresa(empresaId).catch(() => 0);
    res.json({
      videos: linhas.map((v) => videoAdmin(v, agora)),
      agoraServidor: new Date(agora).toISOString(),
      limites: { ...limitesDeVideo({ maxBytes: VIDEO_MAX_BYTES, cotaBytes: VIDEO_COTA_BYTES }), usadoBytes: usado },
    });
  } catch (err) { console.error('[tv-indoor/videos]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Criar o CADASTRO. O arquivo sobe depois, por rota própria: separar os dois é o que permite
// a tela mostrar progresso de upload sem segurar o formulário, e é o que faz um PUT de nome
// nunca encostar na versão do arquivo.
app.post('/api/tv-indoor/videos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const v = validarVideo(req.body, { exigirNome: true });
    const janela = conferirJanelaVideo(v.dados, null);
    const erros = [...v.erros, ...(janela ? [janela] : [])];
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });
    const criado = await prisma.tvVideo.create({ data: { empresaId, ...v.dados }, select: TV_VIDEO_CAMPOS });
    res.status(201).json({ ok: true, video: videoAdmin(criado, Date.now()) });
  } catch (err) { console.error('[tv-indoor/videos POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.put('/api/tv-indoor/videos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvVideo.findFirst({ where: { id, empresaId }, select: TV_VIDEO_CAMPOS });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const v = validarVideo(req.body);
    const janela = conferirJanelaVideo(v.dados, atual);
    const erros = [...v.erros, ...(janela ? [janela] : [])];
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });
    // `v.dados` nunca contém arquivo nem versão — o domínio não os aceita. É o que impede
    // um PUT de nome de fazer a loja inteira rebaixar 200 MB.
    const linha = await prisma.tvVideo.update({ where: { id }, data: v.dados, select: TV_VIDEO_CAMPOS });
    res.json({ ok: true, video: videoAdmin(linha, Date.now()) });
  } catch (err) { console.error('[tv-indoor/videos PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

/* O UPLOAD. Corpo CRU, em streaming.
 *
 * Não é multipart, e a razão é boa: o backend tem oito dependências e nenhuma de upload.
 * Trazer multer/busboy para receber um arquivo por vez seria dependência nova para resolver
 * um problema que `req.pipe` resolve. O `express.json` global não atrapalha porque só age em
 * `application/json` — um corpo `video/mp4` atravessa intocado, e é justamente isso que
 * permite ler o stream aqui.
 *
 * A ORDEM importa, e ela é a garantia de consistência (ver §2 do doc):
 *   1. grava num `.tmp`, contando bytes e reconhecendo o container no primeiro pedaço;
 *   2. valida container e limites;
 *   3. move para o definitivo, com chave NOVA;
 *   4. grava no banco;
 *   5. só ENTÃO apaga o arquivo antigo.
 * Se o passo 4 falhar, o arquivo novo é removido — nada aponta para nada. Se o 5 falhar,
 * sobra um órfão e o banco está correto. Um órfão custa disco; o contrário custa uma TV
 * preta, e é por isso que a assimetria é deliberada.
 */
app.put('/api/tv-indoor/videos/:id/arquivo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  let tmp = null;
  let chaveNova = null;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvVideo.findFirst({ where: { id, empresaId }, select: TV_VIDEO_CAMPOS });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });

    // O container é reconhecido no PRIMEIRO pedaço do stream — nada além disso é lido para
    // decidir, e o resto do arquivo nunca entra no heap.
    let veredito = null;
    const recebido = await midiaFs.receberParaTemporario(req, {
      limiteBytes: VIDEO_MAX_BYTES,
      aoPrimeiroPedaco: (b) => { if (b.length >= BYTES_PARA_RECONHECER) veredito = validarContainer(b); },
    });
    if (!recebido.ok) {
      return res.status(recebido.motivo === 'UPLOAD_INTERROMPIDO' ? 400 : 413)
        .json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'arquivo', motivo: recebido.motivo }] });
    }
    tmp = recebido.caminhoTmp;
    if (!veredito) veredito = validarContainer(recebido.primeiros);
    if (!veredito.ok) {
      await midiaFs.removerSilencioso(tmp); tmp = null;
      return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'arquivo', motivo: veredito.motivo }] });
    }

    // Os três limites: arquivo, cota da empresa e margem de disco do servidor.
    const [usado, livre] = await Promise.all([
      midiaFs.usoDaEmpresa(empresaId).catch(() => 0),
      midiaFs.espacoLivre().catch(() => null),
    ]);
    // O que este vídeo já ocupava não conta contra a cota: substituir não é acumular.
    const jaOcupado = Number(atual.arquivoBytes ?? 0);
    const veredictoTamanho = videoCabe({
      tamanho: recebido.bytes, maxBytes: VIDEO_MAX_BYTES,
      usadoBytes: Math.max(0, usado - jaOcupado), cotaBytes: VIDEO_COTA_BYTES,
      livreBytes: livre, margemBytes: DISCO_MIN_BYTES,
    });
    if (!veredictoTamanho.ok) {
      await midiaFs.removerSilencioso(tmp); tmp = null;
      return res.status(413).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'arquivo', motivo: veredictoTamanho.motivo }], limite: veredictoTamanho.limite ?? null });
    }

    // Chave NOVA sempre: a antiga só é apagada depois de o banco confirmar a troca.
    chaveNova = midiaFs.novaChave(empresaId, veredito.extensao);
    const movido = await midiaFs.promover(tmp, chaveNova);
    tmp = null;
    if (!movido.ok) return res.status(500).json({ erro: 'ERRO_INTERNO' });

    const meta = metadataInformativa({
      duracaoMs: req.get('x-video-duracao-ms'), largura: req.get('x-video-largura'), altura: req.get('x-video-altura'),
    });
    // O nome original é METADATA de exibição. Ele nunca toca o caminho — a chave foi gerada
    // acima, e `caminhoDaChave` recusaria qualquer coisa fora do diretório de qualquer forma.
    const nomeOriginal = String(req.get('x-video-nome') ?? '').slice(0, 120) || null;

    let linha;
    try {
      linha = await prisma.tvVideo.update({
        where: { id },
        data: {
          arquivoVersao: proximaVersaoArquivo(atual.arquivoVersao),
          arquivoTipo: veredito.tipo, arquivoBytes: BigInt(recebido.bytes), storageKey: chaveNova,
          ...meta, nomeOriginal,
        },
        select: TV_VIDEO_CAMPOS,
      });
    } catch (err) {
      // O banco falhou DEPOIS de o arquivo estar no lugar: remove o novo e não deixa rastro.
      await midiaFs.removerChave(chaveNova);
      throw err;
    }

    // Só agora o antigo sai. Se isto falhar, sobra um órfão — e o banco está certo, que é o
    // que importa. A rota de manutenção varre órfãos.
    if (atual.storageKey && atual.storageKey !== chaveNova) await midiaFs.removerChave(atual.storageKey);
    res.json({ ok: true, video: videoAdmin(linha, Date.now()) });
  } catch (err) {
    if (tmp) await midiaFs.removerSilencioso(tmp);
    console.error('[tv-indoor/videos arquivo PUT]', err);
    if (!res.headersSent) res.status(500).json({ erro: 'ERRO_INTERNO' });
  }
});

// Excluir. O BANCO é a autoridade: a linha some primeiro (e com ela, por CASCADE, as
// ocorrências nas playlists), e só então o arquivo. Se a limpeza física falhar, fica um
// órfão — o registro NÃO ressuscita.
app.delete('/api/tv-indoor/videos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvVideo.findFirst({ where: { id, empresaId }, select: { id: true, storageKey: true } });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const { count } = await prisma.tvVideo.deleteMany({ where: { id, empresaId } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    if (atual.storageKey) await midiaFs.removerChave(atual.storageKey);
    res.json({ ok: true });
  } catch (err) { console.error('[tv-indoor/videos DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// O arquivo para a PRÉVIA do admin. Mesmo suporte a Range do público: o `<video>` do
// navegador do gestor pede trechos igual ao da TV.
app.get('/api/tv-indoor/videos/:id/arquivo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).end();
    const v = await prisma.tvVideo.findFirst({ where: { id, empresaId }, select: { arquivoVersao: true, arquivoTipo: true, storageKey: true } });
    if (!v?.storageKey || !v.arquivoTipo) return res.status(404).end();
    await responderVideo(req, res, v, `tvv-${empresaId}-${id}-${v.arquivoVersao}`);
  } catch (err) { console.error('[tv-indoor/videos arquivo]', err); if (!res.headersSent) res.status(500).end(); }
});

// MANUTENÇÃO do armazenamento: temporários velhos e arquivos órfãos.
//
// Filesystem e banco não compartilham transação, e a ordem escolhida (o banco manda) prefere
// deixar um órfão a deixar o banco apontando para um arquivo que não existe. Esta rota é
// como o órfão sai — explicitamente, nunca por varredura automática em segundo plano.
app.get('/api/tv-indoor/videos/manutencao', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const vivas = (await prisma.tvVideo.findMany({ where: { empresaId }, select: { storageKey: true } }))
      .map((v) => v.storageKey).filter(Boolean);
    const remover = req.query?.remover === '1';
    const [orfaos, temporarios] = await Promise.all([
      midiaFs.varrerOrfaos(empresaId, vivas, { remover }),
      remover ? midiaFs.limparTemporarios() : Promise.resolve([]),
    ]);
    res.json({ orfaos, temporariosRemovidos: temporarios.length, removeu: remover, usadoBytes: await midiaFs.usoDaEmpresa(empresaId) });
  } catch (err) { console.error('[tv-indoor/videos manutencao]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Monitoramento (ADMIN) ───────────────────────────────────────────────────
/* "Esta TV está realmente funcionando?" — a pergunta que Online/Offline não responde.
 *
 * ⚠️ ESTA ROTA NÃO FALA COM O HUB NEM COM O CARDÁPIO WEB. Tudo que ela precisa está no
 * Dispositivo, no snapshot do heartbeat e nos models locais da TV. Monitorar cinquenta
 * telas não pode disparar cinquenta bootstraps de catálogo — o custo de OLHAR não pode ser
 * maior que o de operar.
 *
 * ESCALA: quatro consultas no total, independentemente do número de TVs. Os ids reportados
 * são reunidos por TIPO e resolvidos em LOTE; um `findFirst` por tela × item seria N+1 e,
 * com cem paredes, transformaria uma tela de diagnóstico num incidente próprio.
 *
 * ISOLAMENTO: os ids vêm do payload de um navegador e NÃO autorizam nada. Eles entram
 * apenas como filtro de uma consulta que já está escopada por `empresaId` — uma TV da
 * empresa A reportando o vídeo 44 da B não faz o nome da B aparecer aqui: o `in` não acha
 * a linha, e o item vira "removido".
 */
app.get('/api/tv-indoor/monitoramento', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const agora = new Date();
    const agoraMs = agora.getTime();
    const dispositivos = await prisma.dispositivo.findMany({
      where: { empresaId, tipo: 'TV_INDOOR' },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });

    // Os ids que as telas reportaram, reunidos por tipo — inclusive os da ÚLTIMA FALHA, que
    // também viram nome no detalhe ("o vídeo que travou foi o Promo Antiga").
    const ids = { IMAGEM: new Set(), MENU_BOARD: new Set(), VIDEO: new Set() };
    const playlistIds = new Set();
    const regraIds = new Set();
    const snaps = new Map();
    for (const d of dispositivos) {
      // Relê pelo sanitizador: o que está no banco foi gravado por uma versão anterior desta
      // rota, e confiar na forma do que está gravado é confiar num contrato que já mudou uma
      // vez. Custa nada e fecha a porta.
      const snap = sanitizarTelemetriaTv(d.heartbeatJson?.tv);
      snaps.set(d.id, snap);
      if (!snap) continue;
      for (const alvo of [snap.itemAtual, snap.falhas?.ultima]) {
        if (alvo?.tipo && alvo?.id && ids[alvo.tipo]) ids[alvo.tipo].add(alvo.id);
      }
      if (snap.programacao.playlistId) playlistIds.add(snap.programacao.playlistId);
      if (snap.programacao.regraId) regraIds.add(snap.programacao.regraId);
      if (d.tvPlaylistId) playlistIds.add(d.tvPlaylistId);
    }

    // O `empresaId` fica ESCRITO em cada consulta, e não escondido dentro do helper. Duas
    // razões: quem lê a linha vê o escopo sem seguir uma indireção, e a guarda estática do
    // canal consegue conferir — uma guarda que não enxerga o escopo não protege nada.
    const emLote = (conjunto) => ({ id: { in: [...conjunto] } });
    const [conteudos, boards, videos, playlists, regras] = await Promise.all([
      ids.IMAGEM.size ? prisma.tvConteudo.findMany({ where: { ...emLote(ids.IMAGEM), empresaId }, select: { id: true, nome: true } }) : [],
      ids.MENU_BOARD.size ? prisma.tvMenuBoard.findMany({ where: { ...emLote(ids.MENU_BOARD), empresaId }, select: { id: true, nome: true } }) : [],
      ids.VIDEO.size ? prisma.tvVideo.findMany({ where: { ...emLote(ids.VIDEO), empresaId }, select: { id: true, nome: true } }) : [],
      playlistIds.size ? prisma.tvPlaylist.findMany({ where: { ...emLote(playlistIds), empresaId }, select: { id: true, nome: true } }) : [],
      regraIds.size ? prisma.tvProgramacaoRegra.findMany({ where: { ...emLote(regraIds), empresaId }, select: { id: true, dias: true, inicioMin: true, fimMin: true } }) : [],
    ]);

    const mapa = (linhas) => new Map(linhas.map((x) => [x.id, x.nome]));
    const porTipo = { IMAGEM: mapa(conteudos), MENU_BOARD: mapa(boards), VIDEO: mapa(videos) };
    const nomeDaPlaylist = mapa(playlists);
    // A regra vira uma descrição legível usando as MESMAS funções da grade — o admin não
    // reimplementa "Seg–Sex 18:00 — 23:00" com um segundo formatador que um dia divergiria.
    const descricaoDaRegra = new Map(regras.map((r) => [r.id, `${r.dias.join('/')} · ${horaDeMinutosTv(r.inicioMin)} — ${horaDeMinutosTv(r.fimMin)}`]));

    const telas = dispositivos.map((d) => telaMonitorada({
      aparelho: aparelhoAdmin(d, agora),
      snapshot: snaps.get(d.id),
      agoraMs,
      recebidoEmMs: d.ultimoHeartbeatEm ? new Date(d.ultimoHeartbeatEm).getTime() : null,
      nomeDoItem: (tipo, id) => porTipo[tipo]?.get(id) ?? null,
      nomeDaPlaylist: (id) => nomeDaPlaylist.get(id) ?? null,
      nomeDaRegra: (id) => descricaoDaRegra.get(id) ?? null,
    }));

    res.json({
      agoraServidor: agora.toISOString(),
      resumo: resumoMonitoramento(telas),
      // A ordenação é do SERVIDOR: a soma dos cartões e a ordem da lista saem da mesma
      // fonte, então nunca discordam.
      telas: ordenarMonitoramento(telas),
    });
  } catch (err) { console.error('[tv-indoor/monitoramento]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Programação semanal (ADMIN) ─────────────────────────────────────────────
// A GRADE de cada tela: qual playlist ela usa em cada faixa de horário. Domínio do PDV —
// nenhuma destas rotas encosta no HUB ou no Cardápio Web.
//
// ISOLAMENTO: toda consulta leva `empresaId`, inclusive as que já recebem um id na URL.
// É justamente onde a distração acontece ("já tenho o id, para que o empresaId?"), e é
// onde um id de outra loja passaria a valer.

// A tela precisa ser DESTA empresa e precisa ser uma TV. Um totem não tem grade — e deixar
// passar seria gravar regra numa linha que nenhuma rota lê, o que o gestor descobriria só
// quando a programação não acontecesse.
async function telaDeTv(empresaId, bruto) {
  const id = Number(bruto);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return prisma.dispositivo.findFirst({
    where: { id, empresaId, tipo: 'TV_INDOOR' },
    select: { id: true, nome: true, tvPlaylistId: true },
  });
}

// A grade de uma tela, com o "agora" JÁ RESOLVIDO pela MESMA função que a rota pública usa.
// Duplicar o algoritmo no frontend faria o admin e a parede discordarem sobre o mesmo
// instante — e quem estivesse certo seria sempre o outro.
async function gradeParaAdmin(empresaId, tela) {
  const [fuso, regras] = await Promise.all([
    fusoDaEmpresa(empresaId),
    regrasDaTela(empresaId, tela.id),
  ]);
  const agoraMs = Date.now();
  const grade = resolverGrade({ agoraMs, fuso, regras, playlistPadraoId: tela.tvPlaylistId ?? null });
  const nomeDe = (id) => regras.find((r) => r.playlistId === id)?.playlist?.nome ?? null;
  return {
    tela: { id: tela.id, nome: tela.nome, playlistPadraoId: tela.tvPlaylistId ?? null },
    fuso,
    regras: regras.map(regraParaAdmin),
    agora: {
      playlistId: grade.playlistId,
      playlistNome: grade.origem === 'REGRA' ? nomeDe(grade.playlistId) : null,
      origem: grade.origem,
      regraId: grade.regraId,
      agoraServidor: new Date(agoraMs).toISOString(),
      proximaTrocaEm: grade.proximaTrocaEm === null ? null : new Date(grade.proximaTrocaEm).toISOString(),
    },
  };
}

// A tela da Programação: as TVs, as playlists e — se uma tela for escolhida — a grade dela.
// Uma chamada só: abrir a página e já ver o que está no ar agora é o ponto da página.
app.get('/api/tv-indoor/programacao', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const [telas, playlists] = await Promise.all([
      prisma.dispositivo.findMany({
        where: { empresaId, tipo: 'TV_INDOOR' },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        select: { id: true, nome: true, tvPlaylistId: true },
      }),
      prisma.tvPlaylist.findMany({
        where: { empresaId }, orderBy: [{ nome: 'asc' }, { id: 'asc' }], select: { id: true, nome: true },
      }),
    ]);
    const pedida = req.query?.dispositivoId;
    const escolhida = pedida ? telas.find((t) => String(t.id) === String(pedida)) : telas[0];
    res.json({
      telas: telas.map((t) => ({ id: t.id, nome: t.nome, playlistPadraoId: t.tvPlaylistId ?? null })),
      playlists,
      dias: GRADE_DIAS,
      fusoPadrao: GRADE_FUSO_PADRAO,
      ...(escolhida ? await gradeParaAdmin(empresaId, escolhida) : { tela: null, regras: [], agora: null, fuso: await fusoDaEmpresa(empresaId) }),
    });
  } catch (err) { console.error('[tv-indoor/programacao]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// O FUSO da loja. Vive na configuração do canal, e é validado contra o runtime antes de
// gravar: uma string torta aqui derrubaria a resolução da grade de todas as telas.
app.put('/api/tv-indoor/programacao/fuso', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const fuso = String(req.body?.fusoHorario ?? '').trim();
    if (!fusoValido(fuso)) {
      return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'fusoHorario', motivo: GRADE_MOTIVO_FUSO }] });
    }
    await prisma.tvIndoorConfiguracao.upsert({
      where: { empresaId }, create: { empresaId, fusoHorario: fuso }, update: { fusoHorario: fuso },
    });
    res.json({ ok: true, fuso });
  } catch (err) { console.error('[tv-indoor/programacao fuso]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Criar regra. Ela entra NO FIM da lista — a posição mais conservadora que existe: uma regra
// nova nunca rouba a vez de uma que já estava funcionando. O gestor sobe com ↑ se quiser.
app.post('/api/tv-indoor/programacao/regras', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const tela = await telaDeTv(empresaId, req.body?.dispositivoId);
    if (!tela) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const minhas = await prisma.tvPlaylist.findMany({ where: { empresaId }, select: { id: true } });
    const v = validarEntradaRegra(req.body, { exigirTudo: true, playlists: new Set(minhas.map((x) => x.id)) });
    const janela = conferirJanelaRegra(v.dados, null);
    const periodo = conferirPeriodoRegra(v.dados, null);
    const erros = [...v.erros, ...(janela ? [janela] : []), ...(periodo ? [periodo] : [])];
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });
    const ultima = await prisma.tvProgramacaoRegra.findFirst({
      where: { empresaId, dispositivoId: tela.id }, orderBy: { ordem: 'desc' }, select: { ordem: true },
    });
    await prisma.tvProgramacaoRegra.create({
      data: { empresaId, dispositivoId: tela.id, ...v.dados, ordem: (ultima?.ordem ?? -1) + 1 },
    });
    res.status(201).json({ ok: true, ...(await gradeParaAdmin(empresaId, tela)) });
  } catch (err) { console.error('[tv-indoor/programacao regras POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.put('/api/tv-indoor/programacao/regras/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvProgramacaoRegra.findFirst({ where: { id, empresaId }, select: TV_REGRA_CAMPOS });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const minhas = await prisma.tvPlaylist.findMany({ where: { empresaId }, select: { id: true } });
    const v = validarEntradaRegra(req.body, { playlists: new Set(minhas.map((x) => x.id)) });
    const janela = conferirJanelaRegra(v.dados, atual);
    const periodo = conferirPeriodoRegra(v.dados, atual);
    const erros = [...v.erros, ...(janela ? [janela] : []), ...(periodo ? [periodo] : [])];
    if (erros.length) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros });
    await prisma.tvProgramacaoRegra.update({ where: { id }, data: v.dados });
    const tela = await telaDeTv(empresaId, atual.dispositivoId);
    res.json({ ok: true, ...(tela ? await gradeParaAdmin(empresaId, tela) : {}) });
  } catch (err) { console.error('[tv-indoor/programacao regras PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

app.delete('/api/tv-indoor/programacao/regras/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const atual = await prisma.tvProgramacaoRegra.findFirst({ where: { id, empresaId }, select: { dispositivoId: true } });
    if (!atual) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const { count } = await prisma.tvProgramacaoRegra.deleteMany({ where: { id, empresaId } });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const tela = await telaDeTv(empresaId, atual.dispositivoId);
    res.json({ ok: true, ...(tela ? await gradeParaAdmin(empresaId, tela) : {}) });
  } catch (err) { console.error('[tv-indoor/programacao regras DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

/* A ORDEM, que É a prioridade. A lista inteira sobe de uma vez e o servidor reescreve por
   POSIÇÃO, em transação — o mesmo caminho da programação da playlist, e pela mesma razão:
   trocar dois vizinhos deixa buracos e empates quando duas abas mexem juntas.

   Os ids são conferidos contra as regras DAQUELA tela: mandar um id de outra tela (ou de
   outra loja) não reordena nada, recusa. */
app.put('/api/tv-indoor/programacao/regras/ordem', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const tela = await telaDeTv(empresaId, req.body?.dispositivoId);
    if (!tela) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const pedidos = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)) : null;
    if (!pedidos || pedidos.some((x) => !Number.isSafeInteger(x) || x <= 0)) {
      return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'ids', motivo: 'ITENS_INVALIDOS' }] });
    }
    const minhas = await prisma.tvProgramacaoRegra.findMany({
      where: { empresaId, dispositivoId: tela.id }, select: { id: true },
    });
    const conhecidos = new Set(minhas.map((r) => r.id));
    // A lista precisa ser a MESMA, sem faltar nem sobrar: aceitar um subconjunto deixaria as
    // regras de fora com ordem indefinida, e ordem indefinida é prioridade indefinida.
    if (pedidos.length !== conhecidos.size || new Set(pedidos).size !== pedidos.length || pedidos.some((id) => !conhecidos.has(id))) {
      return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'ids', motivo: 'ITENS_INVALIDOS' }] });
    }
    await prisma.$transaction(pedidos.map((id, i) => prisma.tvProgramacaoRegra.updateMany({
      where: { id, empresaId, dispositivoId: tela.id }, data: { ordem: i },
    })));
    res.json({ ok: true, ...(await gradeParaAdmin(empresaId, tela)) });
  } catch (err) { console.error('[tv-indoor/programacao regras ordem]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// ── Aparência (ADMIN) ───────────────────────────────────────────────────────
// A identidade visual PRÓPRIA do canal. Seis cores e uma logo, que alcançam o fallback
// institucional e os três layouts de Menu Board — e NÃO a arte que o gestor enviou: uma
// imagem 1920 × 1080 é exibida como foi criada.
//
// A configuração é OPCIONAL: empresa sem linha desenha com os defaults embarcados, e é por
// isso que o GET responde 200 com os padrões em vez de 404.
const TV_AP_CAMPOS = { id: true, tokens: true, logoVersao: true, logoTipo: true, logoBytes: true };

// ── Limites de vídeo, todos por env ────────────────────────────────────────
// Defaults escolhidos olhando a infraestrutura, não sorteados: 200 MB cobre 1080p bem
// comprimido com folga (acima disso quase sempre é arte mal exportada); 2 GB de cota impede
// uma loja de lotar o disco do servidor; 2 GB de margem livre é o que o VPS precisa para não
// morrer por disco cheio enquanto o Postgres escreve.
const mbEnv = (nome, padraoMb) => {
  const n = Number(process.env[nome]);
  return (Number.isFinite(n) && n > 0 ? n : padraoMb) * 1024 * 1024;
};
const VIDEO_MAX_BYTES = Number(process.env.PDV_VIDEO_MAX_MB) > 0 ? mbEnv('PDV_VIDEO_MAX_MB', 200) : VIDEO_MAX_PADRAO;
const VIDEO_COTA_BYTES = mbEnv('PDV_VIDEO_COTA_MB', 2048);
const DISCO_MIN_BYTES = mbEnv('PDV_DISCO_MIN_MB', 2048);
// A logo da EMPRESA é o fallback neutro da marca (nunca a do totem). Só a PRESENÇA
// interessa aqui — os bytes dela não passam por esta rota.
async function temLogoDaEmpresa(empresaId) {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { logoDataUrl: true } }).catch(() => null);
  return !!e?.logoDataUrl;
}

app.get('/api/tv-indoor/aparencia', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const [cfg, daEmpresa] = await Promise.all([
      prisma.tvIndoorConfiguracao.findUnique({ where: { empresaId }, select: TV_AP_CAMPOS }),
      temLogoDaEmpresa(empresaId),
    ]);
    res.json(tvAparenciaAdmin(cfg, { temLogoDaEmpresa: daEmpresa }));
  } catch (err) { console.error('[tv-indoor/aparencia]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// PATCH esparso das cores. `null` numa chave REMOVE o override e volta ao padrão; chave
// desconhecida e cor inválida são 400, e nesse caso NADA é gravado — o PUT é tudo ou nada.
app.put('/api/tv-indoor/aparencia', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const atual = await prisma.tvIndoorConfiguracao.findUnique({ where: { empresaId }, select: TV_AP_CAMPOS });
    const v = tvAparenciaPatch(atual?.tokens, req.body?.tokens);
    if (!v.ok) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: v.erros });
    const linha = await prisma.tvIndoorConfiguracao.upsert({
      where: { empresaId },
      create: { empresaId, tokens: v.tokens },
      // A logo NÃO entra no update: trocar cor não pode mexer na versão dela.
      update: { tokens: v.tokens },
      select: TV_AP_CAMPOS,
    });
    res.json(tvAparenciaAdmin(linha, { temLogoDaEmpresa: await temLogoDaEmpresa(empresaId) }));
  } catch (err) { console.error('[tv-indoor/aparencia PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Trocar a logo: é a ÚNICA rota (com o DELETE) que incrementa `logoVersao`. O MIME é lido
// dos BYTES, nunca do cabeçalho que o cliente escreve.
app.put('/api/tv-indoor/aparencia/logo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const img = lerImagemMidia(req.body?.dataUrl, { maxBytes: TV_IMG_MAX });
    if (img.erro) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'dataUrl', motivo: img.erro }] });
    const atual = await prisma.tvIndoorConfiguracao.findUnique({ where: { empresaId }, select: { id: true, logoVersao: true } });
    const versao = proximaVersaoLogoTv(atual?.logoVersao);
    // Transação: a versão e os bytes sobem juntos, ou nenhum dos dois. Uma versão nova
    // apontando para bytes velhos é um cache imutável servindo a logo errada por um ano.
    const linha = await prisma.$transaction(async (tx) => {
      const cfg = await tx.tvIndoorConfiguracao.upsert({
        where: { empresaId },
        create: { empresaId, logoVersao: 1, logoTipo: img.tipo, logoBytes: img.bytes.length },
        update: { logoVersao: versao, logoTipo: img.tipo, logoBytes: img.bytes.length },
        select: TV_AP_CAMPOS,
      });
      await tx.tvIndoorLogo.upsert({
        where: { configuracaoId: cfg.id },
        create: { configuracaoId: cfg.id, dados: img.bytes },
        update: { dados: img.bytes },
      });
      return cfg;
    });
    res.json(tvAparenciaAdmin(linha, { temLogoDaEmpresa: await temLogoDaEmpresa(empresaId) }));
  } catch (err) { console.error('[tv-indoor/aparencia logo PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Remover TAMBÉM sobe a versão: sem isso a TV continuaria servindo do cache uma logo que a
// loja acabou de tirar do ar.
app.delete('/api/tv-indoor/aparencia/logo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const atual = await prisma.tvIndoorConfiguracao.findUnique({ where: { empresaId }, select: TV_AP_CAMPOS });
    if (!atual || !atual.logoTipo) {
      return res.json(tvAparenciaAdmin(atual, { temLogoDaEmpresa: await temLogoDaEmpresa(empresaId) }));
    }
    const linha = await prisma.$transaction(async (tx) => {
      await tx.tvIndoorLogo.deleteMany({ where: { configuracaoId: atual.id } });
      return tx.tvIndoorConfiguracao.update({
        where: { empresaId },
        data: { logoVersao: proximaVersaoLogoTv(atual.logoVersao), logoTipo: null, logoBytes: null },
        select: TV_AP_CAMPOS,
      });
    });
    res.json(tvAparenciaAdmin(linha, { temLogoDaEmpresa: await temLogoDaEmpresa(empresaId) }));
  } catch (err) { console.error('[tv-indoor/aparencia logo DELETE]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// A logo, para a prévia do admin.
app.get('/api/tv-indoor/aparencia/logo', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const cfg = await prisma.tvIndoorConfiguracao.findUnique({
      where: { empresaId },
      select: { logoVersao: true, logoTipo: true, logo: { select: { dados: true } } },
    });
    if (!cfg?.logo?.dados || !cfg.logoTipo) return res.status(404).end();
    responderImagem(res, { tipo: cfg.logoTipo, bytes: cfg.logo.dados }, `tvap-${empresaId}-${cfg.logoVersao}`, req);
  } catch (err) { console.error('[tv-indoor/aparencia logo]', err); res.status(500).end(); }
});

// ── Telas ───────────────────────────────────────────────────────────────────
// As TVs desta loja, com a programação associada e o que o aparelho reportou. Criar,
// parear, revogar, ativar e excluir continuam em `/api/aparelhos/*` — é a MESMA
// infraestrutura do totem, e duplicá-la aqui seria criar um segundo lugar para o mesmo
// pareamento divergir.
//
// O filtro `tipo: 'TV_INDOOR'` é do SERVIDOR, não uma peneira na tela: pedir a lista
// inteira e esconder metade é como um totem reaparece num contador ou numa ação em lote.
// A tela no admin: o aparelho de sempre + a posição física. `function`, e não `const`,
// de propósito: é içada, então não importa onde as rotas que a usam aparecem no arquivo.
function tvTelaAdmin(d, agora) {
  return {
    ...aparelhoAdmin(d, agora),
    orientacao: tvOrientacaoDe(d),
    rotacao: tvRotacaoDe(d),
    emAjuste: tvEmAjuste(d, new Date(agora).getTime()),
  };
}

app.get('/api/tv-indoor/telas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const ds = await prisma.dispositivo.findMany({
      where: { empresaId, tipo: 'TV_INDOOR' }, orderBy: { criadoEm: 'asc' },
    });
    const playlists = await prisma.tvPlaylist.findMany({
      where: { empresaId }, select: { id: true, nome: true }, orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    const agora = new Date();
    res.json({ telas: ds.map((d) => tvTelaAdmin(d, agora)), playlists });
  } catch (err) { console.error('[tv-indoor/telas]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

/* ── A POSIÇÃO FÍSICA DA TELA ─────────────────────────────────────────────────────────
   Três rotas, e todas escopadas pelo mesmo trio `{ id, empresaId, tipo: 'TV_INDOOR' }`
   num `updateMany`: o id vem do navegador, e sem o escopo na própria escrita um id de
   outra loja giraria a parede de outra empresa.

   Todas ABREM a janela de ajuste. Enquanto ela está aberta a TV consulta o servidor a
   cada poucos segundos; fora dela, uma vez por minuto. Sem isso, conferir a posição seria
   girar, esperar um minuto, olhar, girar de novo — três minutos para uma decisão de dez
   segundos. */
const tvAbrirAjuste = () => new Date(Date.now() + TV_MS_JANELA_AJUSTE);

async function tvTelaDoAdmin(req, res) {
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return null;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ erro: 'ID_INVALIDO' }); return null; }
  const d = await prisma.dispositivo.findFirst({ where: { id, empresaId, tipo: 'TV_INDOOR' } });
  if (!d) { res.status(404).json({ erro: 'NAO_ENCONTRADO' }); return null; }
  return { id, empresaId, d };
}

async function tvGravarPosicao(res, alvo, data) {
  const { count } = await prisma.dispositivo.updateMany({
    where: { id: alvo.id, empresaId: alvo.empresaId, tipo: 'TV_INDOOR' }, data,
  });
  if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
  const d = await prisma.dispositivo.findFirst({ where: { id: alvo.id, empresaId: alvo.empresaId } });
  return res.json({ ok: true, tela: tvTelaAdmin(d, new Date()) });
}

// Declarar a orientação. Trocar de orientação REINICIA a rotação no palpite mais provável
// daquela posição; regravar a mesma não mexe em nada — senão reabrir o modal e salvar
// desfaria a conferência que o gestor já fez.
app.put('/api/tv-indoor/telas/:id/posicao', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const alvo = await tvTelaDoAdmin(req, res); if (!alvo) return;
    const orientacao = tvValidarOrientacao(req.body?.orientacao);
    if (!orientacao) return res.status(400).json({ erro: 'ENTRADA_INVALIDA', erros: [{ campo: 'orientacao', motivo: 'ORIENTACAO_INVALIDA' }] });
    const mudou = orientacao !== tvOrientacaoDe(alvo.d);
    await tvGravarPosicao(res, alvo, {
      tvOrientacao: orientacao,
      ...(mudou ? { tvRotacao: tvRotacaoInicial(orientacao) } : {}),
      tvAjusteAte: tvAbrirAjuste(),
    });
  } catch (err) { console.error('[tv-indoor/telas posicao PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// "Está errado, girar": avança para a próxima posição provável. O navegador NÃO manda os
// graus — ele só diz "a que está aí não serve", e a ordem é do domínio.
app.post('/api/tv-indoor/telas/:id/girar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const alvo = await tvTelaDoAdmin(req, res); if (!alvo) return;
    await tvGravarPosicao(res, alvo, {
      tvRotacao: tvProximaRotacao(tvOrientacaoDe(alvo.d), tvRotacaoDe(alvo.d)),
      tvAjusteAte: tvAbrirAjuste(),
    });
  } catch (err) { console.error('[tv-indoor/telas girar POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Abrir (ou encerrar) a janela de ajuste — chamada quando o modal de posição abre e fecha.
app.post('/api/tv-indoor/telas/:id/ajuste', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const alvo = await tvTelaDoAdmin(req, res); if (!alvo) return;
    await tvGravarPosicao(res, alvo, { tvAjusteAte: req.body?.encerrar === true ? null : tvAbrirAjuste() });
  } catch (err) { console.error('[tv-indoor/telas ajuste POST]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

// Associar (ou desassociar, com `null`) a programação de uma tela.
//
// A playlist é conferida com um `findFirst` ESCOPADO antes de gravar: a FK do banco garante
// que ela existe, não que ela é desta loja. Sem esta conferência, um id de outra empresa
// mandado pelo navegador faria uma TV daqui reproduzir a programação de lá — o vazamento
// mais caro que este canal poderia ter.
app.put('/api/tv-indoor/telas/:id/playlist', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const empresaId = empresaDoAdmin(req, res); if (empresaId == null) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID_INVALIDO' });
    const bruto = req.body?.playlistId;
    let tvPlaylistId = null;
    if (bruto !== null && bruto !== undefined && bruto !== '') {
      const n = Number(bruto);
      if (!Number.isSafeInteger(n) || n <= 0) return res.status(400).json({ erro: 'PLAYLIST_INVALIDA' });
      const p = await prisma.tvPlaylist.findFirst({ where: { id: n, empresaId }, select: { id: true } });
      if (!p) return res.status(404).json({ erro: 'PLAYLIST_NAO_ENCONTRADA' });
      tvPlaylistId = p.id;
    }
    const { count } = await prisma.dispositivo.updateMany({
      where: { id, empresaId, tipo: 'TV_INDOOR' }, data: { tvPlaylistId },
    });
    if (!count) return res.status(404).json({ erro: 'NAO_ENCONTRADO' });
    const d = await prisma.dispositivo.findFirst({ where: { id, empresaId } });
    res.json({ ok: true, tela: tvTelaAdmin(d, new Date()) });
  } catch (err) { console.error('[tv-indoor/telas playlist PUT]', err); res.status(500).json({ erro: 'ERRO_INTERNO' }); }
});

/* A versão do APLICATIVO, lida uma vez no boot.

   Uma vez basta porque o deploy reinicia o processo: se o `index.html` mudou, este servidor
   é novo e já lê o valor novo. Ler a cada requisição seria um acesso a disco por TV por
   minuto para responder a mesma coisa.

   `null` quando não dá para ler (servidor de desenvolvimento sem build, permissão, caminho
   diferente). E `null` é seguro: sem versão, a TV nunca é mandada recarregar — ela fica
   exatamente como está hoje. */
let VERSAO_APP = null;
try {
  // Caminho relativo ao MÓDULO, não ao `cwd`: o PM2 sobe o processo a partir de `backend/`
  // para o dotenv achar o `.env`, e amarrar a leitura ao diretório de trabalho seria
  // depender de um detalhe do script de deploy.
  const indice = new URL('../frontend/dist/index.html', import.meta.url);
  VERSAO_APP = versaoDoApp(lerArquivoSync(indice, 'utf8'));
  console.log(VERSAO_APP ? `[app] versão ${VERSAO_APP}` : '[app] sem build — as TVs não serão recarregadas');
} catch {
  console.log('[app] index.html do build não encontrado — as TVs não serão recarregadas');
}

// O armazenamento de mídia, no boot. O caminho feliz não depende de alguém lembrar de criar
// o diretório no VPS — mas, se não der para escrever, é melhor saber agora e alto do que
// descobrir no primeiro upload de uma loja.
midiaFs.prepararArmazenamento().then((r) => {
  if (r.ok) console.log(`[midia] armazenamento pronto em ${r.dir}`);
  else console.error(`[midia] SEM ESCRITA em ${r.dir} (${r.erro}) — o upload de vídeo vai falhar`);
});

// ── Job do totem (§5.4): 60 s, in-process, com lock ─────────────────────────
// Roda FORA do tenantStore e varre TODAS as lojas: por isso cada where leva empresaId
// explícito. Uma linha que estoura nunca interrompe a varredura das outras.
let totemJobRodando = false;
let totemJobTick = 0;

async function varrerTotemEnvios() {
  if (totemJobRodando) return;   // lock in-process: um tick de cada vez
  totemJobRodando = true;
  totemJobTick += 1;
  const tick = totemJobTick;
  try {
    const agora = new Date();
    // Só o que o job AINDA pode resolver. REVISAO_MANUAL fora da janela de 24 h não é
    // reconciliável (o updated_since do CW não alcança) e ficaria para sempre na fila:
    // bastariam 200 linhas velhas de uma loja para o job nunca mais olhar uma ambiguidade
    // nova — a fila satura e o dano é invisível. Elas continuam na tela do admin, que é
    // quem decide dali em diante.
    const pendentes = await prisma.pedidoTotemEnvio.findMany({
      where: {
        OR: [
          { status: { in: ['ENVIANDO', 'AMBIGUO'] } },
          { status: 'REVISAO_MANUAL', tentadoEm: { gt: new Date(agora.getTime() - JANELA_RECONCILIACAO_MS) } },
        ],
      },
      orderBy: { tentadoEm: 'asc' },
      take: 200,
      select: { id: true, empresaId: true, status: true, orderId: true, orderType: true, tentadoEm: true },
    });
    // Teto de reconciliações por tick (as mais antigas primeiro): cada uma é uma ida ao HUB,
    // que vai ao CW. Uma fila grande não pode virar rajada — o resto espera 60 s. Promover
    // ENVIANDO órfão e mandar para revisão são updates locais e não entram nesse teto.
    const aReconciliar = new Set(selecionarParaReconciliar(pendentes, agora, tick).map((e) => e.id));
    for (const envio of pendentes) {
      try {
        const acao = proximaAcaoJob(envio, agora, tick);
        if (acao === 'AMBIGUAR') {
          // Linha órfã: o processo caiu entre o INSERT e a gravação do desfecho. Vira
          // AMBIGUO (transição permitida) e entra na reconciliação — nunca vira falha.
          const { count } = await prisma.pedidoTotemEnvio.updateMany({
            where: { id: envio.id, empresaId: envio.empresaId, status: 'ENVIANDO' },
            data: { status: transicao('ENVIANDO', 'ambiguo'), erroCodigo: 'HUB_INDISPONIVEL', erroDetalhe: 'Envio sem resposta registrada (processo interrompido).' },
          });
          if (count) console.log('[totem] envio', envio.id, 'estava parado em ENVIANDO e virou ambiguo');
        } else if (acao === 'RECONCILIAR') { if (aReconciliar.has(envio.id)) await reconciliarEnvio(envio); }
        else if (acao === 'REVISAO') {
          // 30 min sem solução: passa para a mão do humano. NÃO é estado de falha — o job
          // continua procurando por até 24 h.
          const { count } = await prisma.pedidoTotemEnvio.updateMany({
            where: { id: envio.id, empresaId: envio.empresaId, status: 'AMBIGUO' },
            data: { status: transicao('AMBIGUO', 'revisao'), revisaoEm: new Date() },
          });
          if (count) console.log('[totem] envio', envio.id, 'foi para revisão manual');
        }
      } catch (e) { console.error('[totem job envio]', envio.id, e?.code ?? e?.name ?? 'erro'); }
    }
    // Pedidos criados cujo número do balcão ficou pendente (o HUB não conseguiu o detalhe).
    const semDisplay = await prisma.pedidoTotemEnvio.findMany({
      where: { status: 'CRIADO', cwDisplayId: null, criadoEm: { gt: new Date(agora.getTime() - JANELA_DISPLAY_MS) } },
      take: 100,
      select: { id: true, empresaId: true, status: true, cwOrderId: true, cwDisplayId: true, criadoEm: true },
    });
    for (const envio of semDisplay) {
      try {
        if (!precisaDisplay(envio, agora) || !Number.isInteger(envio.cwOrderId)) continue;
        const clienteId = await clienteIdDaEmpresaTotem(envio.empresaId);
        if (!clienteId) continue;
        const r = await detalheTotemCW(clienteId, envio.cwOrderId);
        if (!r.ok || !Number.isInteger(r.data?.cwDisplayId)) continue;
        await prisma.pedidoTotemEnvio.updateMany({
          where: { id: envio.id, empresaId: envio.empresaId, status: 'CRIADO', cwDisplayId: null },
          data: { cwDisplayId: r.data.cwDisplayId },
        });
      } catch (e) { console.error('[totem job display]', envio.id, e?.code ?? e?.name ?? 'erro'); }
    }
  } catch (e) { console.error('[totem job]', e?.code ?? e?.name ?? 'erro'); }
  finally { totemJobRodando = false; }
}

function iniciarAgendadorTotem() {
  setInterval(() => { varrerTotemEnvios().catch((e) => console.error('[totem]', e?.message || e)); }, 60 * 1000);
}

// ===== Marcações + Painel (ADMIN) =====
app.get('/api/ponto/marcacoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const where = {};
    if (req.query.funcionarioId) where.funcionarioId = parseInt(req.query.funcionarioId, 10);
    // Filtro por intervalo (de/ate = YYYY-MM-DD, inclusivo) por DIA DE EXPEDIENTE, não dia
    // civil: cada dia vai de 05:00 às 05:00 do dia seguinte, então o turno que cruza a
    // meia-noite fica junto (a batida da madrugada conta no dia em que o turno começou —
    // mesma janela do espelho/painel). `data` (dia único) mantido por compat.
    const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null; };
    const EH = Math.floor(EXP_CUTOFF_MIN / 60), EM = EXP_CUTOFF_MIN % 60; // 05:00 — corte do dia de expediente
    const de = ymd(req.query.de), ate = ymd(req.query.ate);
    if (de || ate) {
      const cond = {};
      if (de) cond.gte = new Date(brToUtcMs(de.y, de.mo, de.d, EH, EM));        // expediente começa 05:00
      if (ate) cond.lt = new Date(brToUtcMs(ate.y, ate.mo, ate.d + 1, EH, EM)); // até 05:00 do dia seguinte (exclusivo)
      where.dataHora = cond;
    } else if (req.query.data) {
      const d0 = ymd(req.query.data);
      if (d0) where.dataHora = { gte: new Date(brToUtcMs(d0.y, d0.mo, d0.d, EH, EM)), lt: new Date(brToUtcMs(d0.y, d0.mo, d0.d + 1, EH, EM)) };
    }
    const regs = await prisma.pontoRegistro.findMany({ where, orderBy: { dataHora: 'desc' }, take: 1000 });
    const fs = new Map((await prisma.funcionario.findMany()).map((f) => [f.id, f.nome]));
    // diaExpedienteMs = início (05:00) do expediente a que a batida pertence — o front
    // agrupa por ele (madrugada cai no dia do turno, não no dia civil seguinte).
    res.json(regs.map((r) => ({ id: r.id, funcionarioId: r.funcionarioId, funcionarioNome: fs.get(r.funcionarioId) || '—', tipo: r.tipo, tipoLabel: PONTO_LABEL[r.tipo] || r.tipo, dataHora: r.dataHora, diaExpedienteMs: inicioDoExpedienteMs(r.dataHora), origem: r.origem, distancia: r.distancia, invalidada: r.invalidada, observacao: r.observacao || null })));
  } catch (err) { console.error('[ponto/marcacoes]', err); res.status(500).json({ error: 'Erro ao carregar marcações.' }); }
});

// Edita/desconsidera uma marcação (dataHora, tipo, observação, invalidada).
app.put('/api/ponto/marcacoes/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const reg = await prisma.pontoRegistro.findFirst({ where: { id } });
    if (!reg) return res.status(404).json({ error: 'Marcação não encontrada.' });
    const data = {};
    if (req.body?.tipo !== undefined) {
      if (!PONTO_TIPOS.includes(req.body.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
      data.tipo = req.body.tipo;
    }
    if (req.body?.dataHora !== undefined) {
      const dh = parseDataHoraBr(req.body.dataHora);
      if (isNaN(dh.getTime())) return res.status(400).json({ error: 'Data/hora inválida.' });
      data.dataHora = dh;
    }
    if (req.body?.observacao !== undefined) data.observacao = req.body.observacao ? String(req.body.observacao).slice(0, 300) : null;
    if (req.body?.invalidada !== undefined) data.invalidada = !!req.body.invalidada;
    const r = await prisma.pontoRegistro.update({ where: { id }, data });
    res.json({ id: r.id, tipo: r.tipo, tipoLabel: PONTO_LABEL[r.tipo] || r.tipo, dataHora: r.dataHora, invalidada: r.invalidada, observacao: r.observacao || null });
  } catch (err) { console.error('[ponto/marcacoes PUT]', err); res.status(500).json({ error: 'Erro ao salvar a marcação.' }); }
});

app.get('/api/ponto/painel', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    // Expediente, não dia civil: quem entrou ontem 17h e segue no turno à 01h
    // continua "presente" — virar a página à meia-noite zerava o painel.
    const { de, ate } = janelaExpedienteAtual();
    const fs = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } });
    const regs = await prisma.pontoRegistro.findMany({ where: { invalidada: false, dataHora: { gte: de, lt: ate } }, orderBy: { dataHora: 'asc' } });
    const porFunc = new Map();
    for (const r of regs) { const a = porFunc.get(r.funcionarioId) || []; a.push(r); porFunc.set(r.funcionarioId, a); }
    const linhas = fs.map((f) => {
      const rs = porFunc.get(f.id) || [];
      const ultimo = rs.length ? rs[rs.length - 1].tipo : null;
      let situacao = 'ausente';
      if (ultimo === 'ENTRADA' || ultimo === 'RETORNO_INTERVALO') situacao = 'presente';
      else if (ultimo === 'SAIDA_INTERVALO') situacao = 'intervalo';
      else if (ultimo === 'SAIDA') situacao = 'encerrado';
      return { id: f.id, nome: f.nome, funcao: f.funcao || null, situacao, entrada: rs.find((r) => r.tipo === 'ENTRADA')?.dataHora || null, ultimaMarcacao: rs.length ? rs[rs.length - 1].dataHora : null };
    });
    const cont = (s) => linhas.filter((l) => l.situacao === s).length;
    res.json({ total: linhas.length, presentes: cont('presente'), intervalo: cont('intervalo'), encerrados: cont('encerrado'), ausentes: cont('ausente'), colaboradores: linhas });
  } catch (err) { console.error('[ponto/painel]', err); res.status(500).json({ error: 'Erro ao carregar o painel.' }); }
});

// Lançamento manual de marcação (ADMIN) — corrige batida esquecida/ajuste.
app.post('/api/ponto/marcacoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    if (!funcionarioId) return res.status(400).json({ error: 'Selecione o colaborador.' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (!PONTO_TIPOS.includes(req.body?.tipo)) return res.status(400).json({ error: 'Tipo de marcação inválido.' });
    const dataHora = parseDataHoraBr(req.body?.dataHora);
    if (isNaN(dataHora.getTime())) return res.status(400).json({ error: 'Data/hora inválida.' });
    const reg = await prisma.pontoRegistro.create({ data: { funcionarioId, tipo: req.body.tipo, dataHora, origem: 'MANUAL' } });
    res.status(201).json({ id: reg.id, ok: true, tipoLabel: PONTO_LABEL[req.body.tipo], dataHora: reg.dataHora });
  } catch (err) { console.error('[ponto/marcacoes POST]', err); res.status(500).json({ error: 'Erro ao lançar a marcação.' }); }
});

// ===== Espelho de ponto (ADMIN) — previsto × realizado por dia =====
async function calcularEspelho(funcionarioId, ano, mes) {
  const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
  if (!func) throw { http: 404, msg: 'Colaborador não encontrado.' };
  const jornada = func.jornadaId ? await prisma.jornada.findFirst({ where: { id: func.jornadaId } }) : null;
  const dias = jornada && Array.isArray(jornada.diasJson) ? jornada.diasJson : null;
  const semJornada = !dias;
  const tol = jornada?.toleranciaMin ?? 0;

  // Batidas do mês com margem (pega madrugadas da virada do 1º dia e do fim do mês).
  const de = new Date(brToUtcMs(ano, mes - 1, 0, 0, 0));
  const ate = new Date(brToUtcMs(ano, mes - 1, 32, 12, 0));
  const regs = await prisma.pontoRegistro.findMany({ where: { funcionarioId, invalidada: false, dataHora: { gte: de, lt: ate } }, orderBy: { dataHora: 'asc' } });
  const porDia = new Map();
  for (const r of regs) { const k = diaExpedienteKey(r.dataHora); const a = porDia.get(k) || []; a.push(r); porDia.set(k, a); }

  // Afastamentos que cruzam o mês (para abonar dias — ver pontoAusencia.js). Query por
  // funcionarioId (único): funciona dentro do tenantStore (admin) E fora dele (me público).
  const ausRows = await prisma.pontoAusencia.findMany({
    where: {
      funcionarioId,
      dataFim: { gte: new Date(brToUtcMs(ano, mes - 1, 1, 5, 0)) },
      dataInicio: { lte: new Date(brToUtcMs(ano, mes - 1, 31, 5, 0)) },
    },
  });
  const ausencias = ausRows.map((a) => ({ tipo: a.tipo, iniMs: new Date(a.dataInicio).getTime(), fimMs: new Date(a.dataFim).getTime() }));

  const hojeF = brFields(Date.now());
  const hojeNum = Date.UTC(hojeF.y, hojeF.mo, hojeF.day);

  const linhas = [];
  const tot = { previstoMin: 0, trabalhadoMin: 0, atrasoMin: 0, faltaMin: 0, extraMin: 0, noturnoMin: 0, saldoMin: 0, faltas: 0, atrasos: 0, diasTrabalhados: 0 };

  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(ano, mes - 1, d));
    if (dt.getUTCMonth() !== mes - 1) break;
    const dow = dt.getUTCDay();
    const cfg = dias ? dias[dow] : null;
    const futuro = Date.UTC(ano, mes - 1, d) > hojeNum;
    const batidas = porDia.get(`${ano}-${mes - 1}-${d}`) || [];
    const abono = ausenciaDoDia(brToUtcMs(ano, mes - 1, d, 5, 0), ausencias);

    // Folga fixa do colaborador sobrepõe a jornada: o dia vira folga mesmo que a jornada previsse trabalho.
    const folgaColab = Array.isArray(func.folgaSemana) && func.folgaSemana.includes(dow);
    let previstoMin = 0, entradaPrevMs = null, folga = true;
    if (!abono && cfg && !cfg.folga && cfg.entrada && cfg.saida && !folgaColab) {
      folga = false;
      const em = hmToMin(cfg.entrada), sm = hmToMin(cfg.saida);
      entradaPrevMs = brToUtcMs(ano, mes - 1, d, Math.floor(em / 60), em % 60);
      const saidaPrevMs = brToUtcMs(ano, mes - 1, d + (sm <= em ? 1 : 0), Math.floor(sm / 60), sm % 60);
      previstoMin = Math.round((saidaPrevMs - entradaPrevMs) / 60000);
    }

    const entradaMs = batidas.length ? new Date(batidas[0].dataHora).getTime() : null;
    const saidaMs = batidas.length > 1 ? new Date(batidas[batidas.length - 1].dataHora).getTime() : null;

    let trabalhadoMin = 0, atrasoMin = 0, extraMin = 0, faltaMin = 0, noturnoMin = 0, situacao;

    if (folga) {
      if (entradaMs && saidaMs) {
        trabalhadoMin = Math.round((saidaMs - entradaMs) / 60000);
        noturnoMin = minutosNoturnos(entradaMs, saidaMs);
        if (!semJornada) extraMin = trabalhadoMin;
        situacao = abono ? 'abonado_trabalhado' : (semJornada ? 'trabalhado' : 'folga_trabalhada');
        tot.diasTrabalhados++;
      } else situacao = abono ? 'abonado' : (semJornada ? 'vazio' : 'folga');
    } else if (futuro) {
      situacao = 'futuro';
    } else if (!entradaMs) {
      faltaMin = previstoMin; situacao = 'falta'; tot.faltas++;
    } else if (!saidaMs) {
      situacao = 'incompleto'; tot.diasTrabalhados++;
    } else {
      trabalhadoMin = Math.round((saidaMs - entradaMs) / 60000);
      const atr = Math.round((entradaMs - entradaPrevMs) / 60000);
      if (atr > tol) { atrasoMin = atr; tot.atrasos++; situacao = 'atraso'; } else situacao = 'ok';
      extraMin = Math.max(0, trabalhadoMin - previstoMin);
      noturnoMin = minutosNoturnos(entradaMs, saidaMs);
      tot.diasTrabalhados++;
    }

    const saldoMin = (!folga && !futuro) ? (trabalhadoMin - previstoMin) : 0;
    tot.saldoMin += saldoMin;
    tot.previstoMin += previstoMin;
    tot.trabalhadoMin += trabalhadoMin;
    tot.atrasoMin += atrasoMin;
    tot.faltaMin += faltaMin;
    tot.extraMin += extraMin;
    tot.noturnoMin += noturnoMin;

    linhas.push({
      dia: d, dow, folga, futuro, situacao, previstoMin,
      entradaHm: entradaMs ? hmFmt(brFields(entradaMs).min) : null,
      saidaHm: saidaMs ? hmFmt(brFields(saidaMs).min) : null,
      trabalhadoMin, atrasoMin, extraMin, faltaMin, noturnoMin, saldoMin,
      ausenciaTipo: abono ? abono.tipo : null,
    });
  }

  return {
    funcionario: { id: func.id, nome: func.nome, funcao: func.funcao || null, cpf: func.cpf || null, temJornada: !!jornada },
    jornada: jornada ? { id: jornada.id, nome: jornada.nome } : null,
    ano, mes, totais: tot, dias: linhas,
  };
}

app.get('/api/ponto/espelho', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.query.funcionarioId, 10);
    if (!funcionarioId) return res.status(400).json({ error: 'Selecione o colaborador.' });
    const agora = brFields(Date.now());
    const ano = parseInt(req.query.ano, 10) || agora.y;
    const mes = parseInt(req.query.mes, 10) || (agora.mo + 1);
    if (mes < 1 || mes > 12) return res.status(400).json({ error: 'Mês inválido.' });
    res.json(await calcularEspelho(funcionarioId, ano, mes));
  } catch (err) { if (err?.http) return res.status(err.http).json({ error: err.msg }); console.error('[ponto/espelho]', err); res.status(500).json({ error: 'Erro ao gerar o espelho.' }); }
});

// ===== Fechamento do Ponto → lança a Presença (falta/atraso) na Bonificação =====
const semAcento = (s) => String(s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
const acharTipoAssid = (tipos, chave) => tipos.find((t) => t.ativo && semAcento(t.nome).includes(chave));

app.get('/api/ponto/fechamento', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const agora = brFields(Date.now());
    const ano = parseInt(req.query.ano, 10) || agora.y;
    const mes = parseInt(req.query.mes, 10) || (agora.mo + 1);
    if (mes < 1 || mes > 12) return res.status(400).json({ error: 'Mês inválido.' });
    const funcs = await prisma.funcionario.findMany({ where: { status: 'ATIVO', jornadaId: { not: null } }, orderBy: { nome: 'asc' } });
    const tipos = await prisma.bonificacaoTipoOcorrencia.findMany({ where: { pilar: 'ASSIDUIDADE' } });
    const tipoFalta = acharTipoAssid(tipos, 'falta');
    const tipoAtraso = acharTipoAssid(tipos, 'atraso');
    const pctFalta = tipoFalta ? Number(tipoFalta.percentual) : 0;
    const pctAtraso = tipoAtraso ? Number(tipoAtraso.percentual) : 0;
    const bonificacaoFechada = !!(await prisma.bonificacaoFechamento.findFirst({ where: { ano, mes } }));
    const jaLancadas = await prisma.bonificacaoOcorrencia.count({ where: { ano, mes, origem: 'PONTO' } });

    const colaboradores = [];
    for (const f of funcs) {
      const esp = await calcularEspelho(f.id, ano, mes);
      const t = esp.totais;
      const incompletos = esp.dias.filter((d) => d.situacao === 'incompleto').length;
      const presenca = Math.max(0, 100 - t.faltas * pctFalta - t.atrasos * pctAtraso);
      colaboradores.push({ id: f.id, nome: f.nome, funcao: f.funcao || null, faltas: t.faltas, atrasos: t.atrasos, incompletos, trabalhadoMin: t.trabalhadoMin, saldoMin: t.saldoMin, noturnoMin: t.noturnoMin, presenca: Math.round(presenca) });
    }
    res.json({ ano, mes, colaboradores, pctFalta, pctAtraso, temTipoFalta: !!tipoFalta, temTipoAtraso: !!tipoAtraso, bonificacaoFechada, jaLancadas });
  } catch (err) { console.error('[ponto/fechamento GET]', err); res.status(500).json({ error: 'Erro ao gerar o fechamento.' }); }
});

app.post('/api/ponto/fechamento/sincronizar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const ano = parseInt(req.body?.ano, 10);
    const mes = parseInt(req.body?.mes, 10);
    if (!ano || mes < 1 || mes > 12) return res.status(400).json({ error: 'Período inválido.' });
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano, mes } })) return res.status(400).json({ error: 'A Bonificação deste mês já está fechada. Reabra-a na aba Bonificação para lançar o ponto.' });
    const tipos = await prisma.bonificacaoTipoOcorrencia.findMany({ where: { pilar: 'ASSIDUIDADE' } });
    const tipoFalta = acharTipoAssid(tipos, 'falta');
    const tipoAtraso = acharTipoAssid(tipos, 'atraso');
    if (!tipoFalta && !tipoAtraso) return res.status(400).json({ error: 'Não encontrei os tipos "Falta"/"Atraso" no pilar Assiduidade da Bonificação. Crie-os na aba Bonificação.' });

    const funcs = await prisma.funcionario.findMany({ where: { status: 'ATIVO', jornadaId: { not: null } } });
    // idempotência: remove só o que o Ponto já lançou nesse mês (preserva as ocorrências manuais)
    await prisma.bonificacaoOcorrencia.deleteMany({ where: { ano, mes, origem: 'PONTO' } });

    const novas = [];
    let nFaltas = 0, nAtrasos = 0, nColab = 0;
    for (const f of funcs) {
      const esp = await calcularEspelho(f.id, ano, mes);
      let teve = false;
      let nAtrasoFunc = 0, acumAtrasoPct = 0; // reincidência/teto de ciclo do atraso
      for (const d of esp.dias) {
        const dataDia = new Date(brToUtcMs(ano, mes - 1, d.dia, 12, 0));
        const ref = `${String(d.dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
        if (d.situacao === 'falta' && tipoFalta) {
          const imp = calcularImpactoRegra(tipoFalta, {});
          novas.push({ funcionarioId: f.id, ano, mes, tipoId: tipoFalta.id, nomeTipo: tipoFalta.nome, pilar: 'ASSIDUIDADE', percentual: imp.percentual, explicacao: imp.explicacao, data: dataDia, observacao: `Ponto: falta em ${ref}`, origem: 'PONTO', status: 'VALIDADA' });
          nFaltas++; teve = true;
        } else if (d.situacao === 'atraso' && tipoAtraso) {
          // Motor: passa os minutos reais → escolhe a faixa (M2) + progressividade/teto (M4).
          const imp = calcularImpactoRegra(tipoAtraso, { minutos: d.atrasoMin, ocorrenciasAnteriores: nAtrasoFunc, impactoAcumuladoCiclo: acumAtrasoPct });
          nAtrasoFunc++; acumAtrasoPct += imp.percentual;
          novas.push({ funcionarioId: f.id, ano, mes, tipoId: tipoAtraso.id, nomeTipo: tipoAtraso.nome, pilar: 'ASSIDUIDADE', percentual: imp.percentual, minutosEvento: d.atrasoMin, explicacao: imp.explicacao, data: dataDia, observacao: `Ponto: atraso de ${d.atrasoMin} min em ${ref}`, origem: 'PONTO', status: 'VALIDADA' });
          nAtrasos++; teve = true;
        }
      }
      if (teve) nColab++;
    }
    if (novas.length) await prisma.bonificacaoOcorrencia.createMany({ data: novas });
    res.json({ ok: true, faltas: nFaltas, atrasos: nAtrasos, colaboradores: nColab, total: novas.length });
  } catch (err) { console.error('[ponto/fechamento sincronizar]', err); res.status(500).json({ error: 'Erro ao lançar na Bonificação.' }); }
});

// ===== PÚBLICO — tela quiosque do tablet (aberta por token do dispositivo) =====
// `tipo` (opcional) escopa por papel: se informado e o dispositivo achado for de
// outro papel (ex.: token de ETIQUETA batendo em /public/ponto), devolve null —
// mesmo comportamento de token inválido, pra não vazar "existe mas é de outra área".
async function resolverDispositivo(token, tipo) {
  const d = await prisma.dispositivo.findFirst({ where: { token: String(token), ativo: true } });
  if (d && tipo && d.tipo !== tipo) return null;
  return d;
}
app.get('/api/public/ponto/:token', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token, 'PONTO');
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const loja = await prisma.empresa.findUnique({ where: { id: disp.empresaId }, select: { nome: true, logoDataUrl: true } });
    res.json({ dispositivo: { nome: disp.nome }, loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null }, limiar: PONTO_LIMIAR });
  } catch (err) { console.error('[public/ponto GET]', err); res.status(500).json({ error: 'Erro.' }); }
});

// Identifica pelo vetor (matching no servidor).
app.post('/api/public/ponto/:token/identificar', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token, 'PONTO');
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const match = await melhorMatchFacial(req.body?.descritor, disp.empresaId);
    if (!match || match.distancia > PONTO_LIMIAR) return res.json({ reconhecido: false });
    const func = await prisma.funcionario.findFirst({ where: { id: match.funcionarioId, empresaId: disp.empresaId, status: 'ATIVO' } });
    if (!func) return res.json({ reconhecido: false });
    const proximo = await proximoTipoPonto(func.id, disp.empresaId);
    res.json({ reconhecido: true, funcionario: funcPublico(func), distancia: match.distancia, proximoTipo: proximo, proximoLabel: proximo ? PONTO_LABEL[proximo] : null });
  } catch (err) { console.error('[public/ponto identificar]', err); res.status(500).json({ error: 'Erro ao identificar.' }); }
});

// Identifica pelo PIN de reserva.
app.post('/api/public/ponto/:token/identificar-pin', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token, 'PONTO');
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const pin = String(req.body?.pin ?? '').replace(/\D/g, '');
    if (!pin) return res.status(400).json({ error: 'Informe o PIN.' });
    const func = await prisma.funcionario.findFirst({ where: { pinPonto: pin, empresaId: disp.empresaId, status: 'ATIVO' } });
    if (!func) return res.json({ reconhecido: false });
    const proximo = await proximoTipoPonto(func.id, disp.empresaId);
    res.json({ reconhecido: true, funcionario: funcPublico(func), proximoTipo: proximo, proximoLabel: proximo ? PONTO_LABEL[proximo] : null });
  } catch (err) { console.error('[public/ponto pin]', err); res.status(500).json({ error: 'Erro.' }); }
});

// Registra a marcação (auto-sequência; aceita tipo explícito opcional).
app.post('/api/public/ponto/:token/registrar', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token, 'PONTO');
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId, empresaId: disp.empresaId, status: 'ATIVO' } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    let tipo = PONTO_TIPOS.includes(req.body?.tipo) ? req.body.tipo : await proximoTipoPonto(func.id, disp.empresaId);
    if (!tipo) return res.status(400).json({ error: 'Expediente de hoje já foi encerrado.' });
    const origem = req.body?.origem === 'PIN' ? 'PIN' : 'FACIAL';
    const distancia = typeof req.body?.distancia === 'number' ? req.body.distancia : null;
    const reg = await prisma.pontoRegistro.create({ data: { empresaId: disp.empresaId, funcionarioId: func.id, tipo, origem, dispositivoId: disp.id, distancia } });
    await prisma.dispositivo.update({ where: { id: disp.id }, data: { ultimaSync: new Date() } });
    res.status(201).json({ ok: true, tipo, tipoLabel: PONTO_LABEL[tipo], funcionario: funcPublico(func), dataHora: reg.dataHora });
  } catch (err) { console.error('[public/ponto registrar]', err); res.status(500).json({ error: 'Erro ao registrar o ponto.' }); }
});

/* ── Ponto Facial › Coletor DIXI (gestão) ───────────────────────────── */

// Config de marcação (janela anti-duplicação + modo de batidas). 1 por loja.
app.get('/api/ponto/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await prisma.pontoConfig.findFirst();
    res.json({ dedupeMin: c ? c.dedupeMin : 15, usaIntervalo: c ? c.usaIntervalo : false });
  } catch (err) { console.error('[ponto/config GET]', err); res.status(500).json({ error: 'Erro ao carregar a configuração.' }); }
});
app.put('/api/ponto/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const dedupeMin = Math.max(0, Math.min(240, parseInt(req.body?.dedupeMin, 10) || 0));
    const usaIntervalo = !!req.body?.usaIntervalo;
    const ex = await prisma.pontoConfig.findFirst();
    const c = ex ? await prisma.pontoConfig.update({ where: { id: ex.id }, data: { dedupeMin, usaIntervalo } })
                 : await prisma.pontoConfig.create({ data: { dedupeMin, usaIntervalo } });
    res.json({ dedupeMin: c.dedupeMin, usaIntervalo: c.usaIntervalo });
  } catch (err) { console.error('[ponto/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

// Lista os coletores (Dispositivos com serial). Novos nascem PENDENTES (inativos).
app.get('/api/ponto/coletores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const ds = await prisma.dispositivo.findMany({ where: { serialColetor: { not: null } }, orderBy: { criadoEm: 'asc' } });
    res.json(ds.map((d) => ({ id: d.id, nome: d.nome, serial: d.serialColetor, ativo: d.ativo, ultimaSync: d.ultimaSync })));
  } catch (err) { console.error('[ponto/coletores GET]', err); res.status(500).json({ error: 'Erro ao carregar coletores.' }); }
});

// Autoriza/desautoriza um coletor (só grava batidas quando ativo).
app.put('/api/ponto/coletores/:id/ativar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const disp = await prisma.dispositivo.findFirst({ where: { id, serialColetor: { not: null } } });
    if (!disp) return res.status(404).json({ error: 'Coletor não encontrado.' });
    const upd = await prisma.dispositivo.update({ where: { id }, data: { ativo: req.body?.ativo !== false } });
    res.json({ ok: true, ativo: upd.ativo });
  } catch (err) { console.error('[ponto/coletores ativar]', err); res.status(500).json({ error: 'Erro ao atualizar.' }); }
});

// Batidas que não casaram com nenhum funcionário (fila pra vincular).
app.get('/api/ponto/coletor/pendencias', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const pend = await prisma.coletorBatidaPendente.findMany({ where: { resolvidoEm: null }, orderBy: { dataHora: 'desc' }, take: 500 });
    res.json(pend.map((p) => ({ id: p.id, serial: p.serial, enrollid: p.enrollid, nome: p.nome, dataHora: p.dataHora })));
  } catch (err) { console.error('[coletor pendencias GET]', err); res.status(500).json({ error: 'Erro ao carregar pendências.' }); }
});

// Vincula um enrollid a um funcionário: grava o vínculo e converte as pendências
// daquele enrollid em PontoRegistro (dedup por coletorRef).
app.post('/api/ponto/coletor/pendencias/vincular', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const empresaId = getEmpresaIdAtual();
    const enrollid = parseInt(req.body?.enrollid, 10);
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    if (!Number.isInteger(enrollid) || !Number.isInteger(funcionarioId)) return res.status(400).json({ error: 'Dados inválidos.' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    try { await prisma.funcionario.update({ where: { id: funcionarioId }, data: { enrollidColetor: enrollid } }); }
    catch (e) { if (e?.code === 'P2002') return res.status(409).json({ error: 'Esse ID do coletor já está vinculado a outro colaborador.' }); throw e; }
    const pend = await prisma.coletorBatidaPendente.findMany({ where: { enrollid, resolvidoEm: null }, orderBy: { dataHora: 'asc' } });
    let criados = 0;
    for (const p of pend) {
      try {
        const ja = await prisma.pontoRegistro.findFirst({ where: { coletorRef: p.coletorRef }, select: { id: true } });
        if (!ja) { await gravarPontoColetor(prisma, empresaId, funcionarioId, { dataHora: p.dataHora, coletorRef: p.coletorRef, dispositivoId: p.dispositivoId }); criados++; }
        await prisma.coletorBatidaPendente.update({ where: { id: p.id }, data: { resolvidoEm: new Date() } });
      } catch (e) { if (e?.code !== 'P2002') console.error('[coletor vincular record]', e?.message); }
    }
    res.json({ ok: true, criados, total: pend.length });
  } catch (err) { console.error('[coletor vincular]', err); res.status(500).json({ error: 'Erro ao vincular.' }); }
});

// Edita/limpa o ID do coletor (enrollid) de um colaborador.
app.put('/api/ponto/colaboradores/:id/enrollid', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    const raw = req.body?.enrollid;
    const enrollid = (raw === null || raw === '' || raw === undefined) ? null : parseInt(raw, 10);
    if (enrollid !== null && !Number.isInteger(enrollid)) return res.status(400).json({ error: 'ID do coletor inválido.' });
    try { await prisma.funcionario.update({ where: { id }, data: { enrollidColetor: enrollid } }); }
    catch (e) { if (e?.code === 'P2002') return res.status(409).json({ error: 'Esse ID do coletor já está em uso.' }); throw e; }
    res.json({ ok: true, enrollidColetor: enrollid });
  } catch (err) { console.error('[colaboradores enrollid]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});

// Comando de cadastro de usuário no coletor (formato capturado da DIXI).
// record vazio = cria o "slot" (ID + nome) SEM biometria; a face é cadastrada
// no aparelho depois.
function montarSetUserInfo(enrollid, nome) {
  return { cmd: 'setuserinfo', enrollid, name: String(nome || '').slice(0, 64), backupnum: 0, admin: 0, record: '' };
}

// Enfileira o envio de colaborador(es) pro coletor. body: { funcionarioIds: [] }
// ou { todos: true }. O coletorServer envia a fila no próximo reg do coletor.
app.post('/api/ponto/coletor/enviar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const coletores = await prisma.dispositivo.findMany({ where: { serialColetor: { not: null }, ativo: true }, select: { serialColetor: true } });
    if (!coletores.length) return res.status(400).json({ error: 'Nenhum coletor ativo. Ative em Ponto Facial › Coletor.' });

    let funcionarios;
    if (req.body?.todos) {
      funcionarios = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, select: { id: true, nome: true, enrollidColetor: true } });
    } else {
      const ids = Array.isArray(req.body?.funcionarioIds) ? req.body.funcionarioIds.map((x) => parseInt(x, 10)).filter(Number.isInteger) : [];
      if (!ids.length) return res.status(400).json({ error: 'Nenhum colaborador informado.' });
      funcionarios = await prisma.funcionario.findMany({ where: { id: { in: ids }, status: 'ATIVO' }, select: { id: true, nome: true, enrollidColetor: true } });
    }
    if (!funcionarios.length) return res.status(400).json({ error: 'Nenhum colaborador ativo para enviar.' });

    // próximo enrollid livre (para quem ainda não tem um ID no coletor)
    const agg = await prisma.funcionario.aggregate({ _max: { enrollidColetor: true } });
    let proximo = (agg._max.enrollidColetor || 0) + 1;

    const comandoIds = [];
    for (const f of funcionarios) {
      let enrollid = f.enrollidColetor;
      if (!enrollid) { enrollid = proximo++; await prisma.funcionario.update({ where: { id: f.id }, data: { enrollidColetor: enrollid } }).catch(() => {}); }
      const payload = montarSetUserInfo(enrollid, f.nome);
      for (const c of coletores) {
        const cmd = await prisma.coletorComando.create({ data: { serial: c.serialColetor, funcionarioId: f.id, enrollid, cmd: 'setuserinfo', payload } });
        comandoIds.push(cmd.id);
      }
    }
    res.json({ ok: true, enfileirados: comandoIds.length, funcionarios: funcionarios.length, comandoIds });
  } catch (err) { console.error('[coletor enviar]', err); res.status(500).json({ error: 'Erro ao enfileirar o envio.' }); }
});

// Status dos comandos enfileirados (p/ a barra de progresso do envio).
app.get('/api/ponto/coletor/enviar/status', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Number.isInteger);
    if (!ids.length) return res.json({ total: 0, enviados: 0 });
    const cmds = await prisma.coletorComando.findMany({ where: { id: { in: ids } }, select: { status: true } });
    res.json({ total: cmds.length, enviados: cmds.filter((c) => c.status === 'ENVIADO').length });
  } catch (err) { console.error('[coletor enviar/status]', err); res.status(500).json({ error: 'Erro ao consultar o status.' }); }
});

// ===== Etiquetas (ADMIN) — área `etiquetas` já protegida pelo middleware =====

// Tipos de insumo que não se etiqueta: embalagem e material operacional não são
// alimento manipulado.
const ETIQUETA_TIPOS_INSUMO = ['INGREDIENTE', 'PRODUCAO_PROPRIA', 'HORTIFRUTI', 'ACOMPANHAMENTO', 'BEBIDA'];

// Regras padrão (RDC 216) — mesmos valores do seed da migration. Existem aqui
// de novo porque o seed da migration só rodou para as empresas que já existiam
// naquele momento; uma loja criada depois (POST /api/lojas não semeia nada)
// precisa que o backend semeie na primeira vez que ela mexer em Etiquetas.
const ETIQUETA_REGRAS_PADRAO = [
  { conservacao: 'CONGELADO', tempLabel: '<= -18 °C', dias: 90, ordem: 0 },
  { conservacao: 'RESFRIADO_0_4', tempLabel: '0 a 8 °C', dias: 5, ordem: 1 },
  { conservacao: 'AMBIENTE', tempLabel: '<= 25 °C', dias: 30, ordem: 2 },
  { conservacao: 'ABERTO', tempLabel: 'Conforme fabricante', dias: 3, ordem: 3 },
];

// Garante config (1 por loja) E as 6 regras de validade na primeira vez que a
// loja mexe em Etiquetas. Sem as regras, validadeDe() lança 400 "Não há regra
// de validade" para toda conservação — e como o seed da migration só cobriu as
// empresas que já existiam, uma loja nova ficaria com o módulo todo morto
// (nenhuma etiqueta imprime) sem nenhum aviso até alguém tentar usar.
async function garantirEtiquetaSetup() {
  // NÃO usar req.user.empresaId aqui: só existe para operador (autenticar monta
  // req.user manualmente com empresaId=payload.eid); para ADMIN req.user é o JWT
  // cru do HUB, sem empresaId, e empresa.findUnique({ id: undefined }) lançava
  // PrismaClientValidationError => 500 permanente nesta rota. getEmpresaIdAtual()
  // lê a loja já resolvida pelo gate de tenant (tenantStore), vale para os dois papéis.
  const empresaId = getEmpresaIdAtual();
  let c = await prisma.etiquetaConfig.findFirst();
  if (!c) {
    const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });
    try {
      c = await prisma.etiquetaConfig.create({ data: { razaoSocial: emp?.nome || null, campos: {} } });
    } catch (e) {
      // @@unique([empresaId]): duas requisições concorrentes na primeira vez que a
      // loja mexe em Etiquetas (ex.: React StrictMode dobrando o mount) podem colidir
      // aqui — relê a linha que a outra request acabou de criar em vez de 500.
      if (e?.code === 'P2002') c = await prisma.etiquetaConfig.findFirst();
      else throw e;
    }
  }
  let regras = await prisma.etiquetaRegra.findMany({ orderBy: { ordem: 'asc' } });
  if (!regras.length) {
    // skipDuplicates: @@unique([empresaId, conservacao]) torna isto idempotente
    // caso duas requisições cheguem aqui ao mesmo tempo (sem transação/lock).
    await prisma.etiquetaRegra.createMany({ data: ETIQUETA_REGRAS_PADRAO, skipDuplicates: true });
    regras = await prisma.etiquetaRegra.findMany({ orderBy: { ordem: 'asc' } });
  }
  return { config: c, regras };
}

app.get('/api/etiquetas/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const { config, regras } = await garantirEtiquetaSetup();
    res.json({ config, regras, conservacoes: CONSERVACOES });
  } catch (err) { console.error('[etiquetas/config GET]', err); res.status(500).json({ error: 'Erro ao carregar a configuração.' }); }
});

app.put('/api/etiquetas/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const b = req.body || {};
    const only = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
    // +'' e +null são 0 (finito), então caíam no clamp mínimo (20/15) em vez do
    // default (50/30) — um campo de formulário limpo virava rótulo minúsculo.
    // Trata '' e null como ausentes junto com undefined, caindo no default.
    // Math.round porque larguraMm/alturaMm são colunas Int: o clamp deixava passar
    // fracionário (30.7 está entre 15 e 100), o Prisma recusava o Float na hora do
    // update e o PUT inteiro morria em 500 opaco — a tela só dizia "Erro ao salvar".
    const numOuDefault = (v, min, max, def) => {
      if (v === undefined || v === null || String(v).trim() === '') return def;
      return Number.isFinite(+v) ? Math.round(Math.min(max, Math.max(min, +v))) : def;
    };
    // Valor fora da lista (ou ausente) cai no registro atual — nunca 500 por um
    // enum inválido vindo do front.
    const MODELOS_OK = new Set(['CLASSICO', 'VALIDADE', 'LATERAL_QR', 'COMPACTO']);
    const FONTES_OK = new Set(['NORMAL', 'GRANDE']);
    // Sanitiza os campos impressos na etiqueta (toggles da Config): grava sempre as MESMAS
    // 3 chaves com o default do contrato — conservacao/responsavel/cnpj default TRUE
    // (retrocompat: loja sem `campos` já mostrava tudo, então "ausente"≠"desligado"). Sem
    // isso, lixo do body (chaves extras, valores não booleanos) seria gravado direto no
    // Json e o desenho (etiquetaCanvas.js, que espera exatamente este contrato) teria que
    // adivinhar tipos na hora de imprimir.
    const c = b.campos && typeof b.campos === 'object' ? b.campos : {};
    const camposSaneados = {
      conservacao: c.conservacao !== false,
      responsavel: c.responsavel !== false,
      cnpj: c.cnpj !== false,
    };
    const { config: atual } = await garantirEtiquetaSetup();
    const config = await prisma.etiquetaConfig.update({
      where: { id: atual.id },
      data: {
        razaoSocial: only(b.razaoSocial, 160),
        cnpj: only(b.cnpj, 20),
        responsavelTecnico: only(b.responsavelTecnico, 120),
        sif: only(b.sif, 10),
        sie: only(b.sie, 10),
        larguraMm: numOuDefault(b.larguraMm, 20, 50, 50),
        alturaMm: numOuDefault(b.alturaMm, 15, 100, 30),
        modelo: MODELOS_OK.has(b.modelo) ? b.modelo : (atual?.modelo || 'CLASSICO'),
        fonte: FONTES_OK.has(b.fonte) ? b.fonte : (atual?.fonte || 'NORMAL'),
        campos: camposSaneados,
      },
    });
    res.json({ ok: true, config });
  } catch (err) { console.error('[etiquetas/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

app.put('/api/etiquetas/regras', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    await garantirEtiquetaSetup(); // lazy-seed: garante as 6 regras antes de atualizar
    const entrada = Array.isArray(req.body?.regras) ? req.body.regras : [];
    for (const r of entrada) {
      if (!CONSERVACOES.includes(r.conservacao)) return res.status(400).json({ error: `Conservação inválida: ${r.conservacao}` });
      const dias = parseInt(r.dias, 10);
      if (!Number.isFinite(dias) || dias < 1 || dias > 3650) return res.status(400).json({ error: 'Validade deve ser de 1 a 3650 dias.' });
      // Coluna NOT NULL e impressa no rótulo sanitário (ex.: "<= -18 °C"): vazio some
      // com a temperatura na etiqueta ANVISA sem nenhum erro visível, por isso valida.
      if (!String(r.tempLabel ?? '').trim()) return res.status(400).json({ error: 'Temperatura do rótulo é obrigatória.' });
    }
    for (const r of entrada) {
      await prisma.etiquetaRegra.updateMany({
        where: { conservacao: r.conservacao },
        data: { dias: parseInt(r.dias, 10), tempLabel: String(r.tempLabel).trim().slice(0, 60) },
      });
    }
    const regras = await prisma.etiquetaRegra.findMany({ orderBy: { ordem: 'asc' } });
    res.json({ ok: true, regras });
  } catch (err) { console.error('[etiquetas/regras PUT]', err); res.status(500).json({ error: 'Erro ao salvar as regras.' }); }
});

app.get('/api/etiquetas/itens', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    await garantirEtiquetaSetup(); // lazy-seed: garante as regras antes de casar validadeEfetiva
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = { ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } };
    if (busca) where.nome = { contains: busca, mode: 'insensitive' };
    const insumos = await prisma.insumo.findMany({ where, orderBy: { nome: 'asc' }, select: { id: true, nome: true, tipo: true, unidade: true } });
    const cfgs = await prisma.etiquetaItemConfig.findMany();
    const cMap = new Map(cfgs.map((c) => [c.insumoId, c]));
    const regras = await prisma.etiquetaRegra.findMany();
    const itens = insumos.map((i) => {
      const c = cMap.get(i.id) || null;
      const cons = c?.conservacaoPadrao || null;
      const regra = cons ? regras.find((r) => r.conservacao === cons) : null;
      return {
        insumoId: i.id, nome: i.nome, tipo: i.tipo, unidade: i.unidade,
        conservacaoPadrao: cons,
        validadeDias: c?.validadeDias ?? null,
        validadeEfetiva: c?.validadeDias ?? regra?.dias ?? null, // o que a cozinha vai ver
        ativo: c ? c.ativo : true,
      };
    });
    res.json({ itens, conservacoes: CONSERVACOES });
  } catch (err) { console.error('[etiquetas/itens GET]', err); res.status(500).json({ error: 'Erro ao carregar os itens.' }); }
});

app.put('/api/etiquetas/itens/:insumoId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const insumoId = parseInt(req.params.insumoId, 10);
    if (!Number.isFinite(insumoId)) return res.status(400).json({ error: 'Insumo inválido.' });
    // findFirst (não findUnique) passa pela extension de tenant: devolve null se o
    // insumo existir mas for de outra loja — é isso que impede configurar insumo alheio.
    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId } });
    if (!insumo) return res.status(404).json({ error: 'Insumo não encontrado.' });

    const b = req.body || {};
    if (b.conservacaoPadrao && !CONSERVACOES.includes(b.conservacaoPadrao)) return res.status(400).json({ error: 'Conservação inválida.' });
    const dias = b.validadeDias == null || b.validadeDias === '' ? null : parseInt(b.validadeDias, 10);
    if (dias !== null && (!Number.isFinite(dias) || dias < 1 || dias > 3650)) return res.status(400).json({ error: 'Validade deve ser de 1 a 3650 dias.' });

    const dados = {
      conservacaoPadrao: b.conservacaoPadrao || null,
      validadeDias: dias,
      ativo: b.ativo !== false,
    };
    const existente = await prisma.etiquetaItemConfig.findFirst({ where: { insumoId } });
    const cfg = existente
      ? await prisma.etiquetaItemConfig.update({ where: { id: existente.id }, data: dados })
      : await prisma.etiquetaItemConfig.create({ data: { ...dados, insumoId } });
    res.json({ ok: true, item: cfg });
  } catch (err) { console.error('[etiquetas/itens PUT]', err); res.status(500).json({ error: 'Erro ao salvar o item.' }); }
});

// Painel de vencimentos: o que já venceu / vence hoje / vence amanhã.
app.get('/api/etiquetas/painel', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const agora = new Date();
    // Fronteiras do DIA CIVIL BR (não o dia do servidor, que roda em UTC) — é
    // isso que decide se um item "vence hoje" ou "vence amanhã" pra quem está
    // na cozinha, não a hora do VPS. brFields()/brToUtcMs() são os mesmos
    // helpers do módulo de Ponto (fuso BR fixo, -180min, sem DST desde 2019).
    const f = brFields(agora);
    const inicioAmanha = new Date(brToUtcMs(f.y, f.mo, f.day + 1, 0, 0));
    const inicioDepoisDeAmanha = new Date(brToUtcMs(f.y, f.mo, f.day + 2, 0, 0));

    // 3 queries independentes com `take` próprio — não 1 query
    // `where: { validoAte: { lt: fim } }` seguida de split em memória (era o
    // desenho original). "Vencidas" nunca esvazia: o model é log de impressão,
    // sem campo de baixa/descarte, então esse balde só CRESCE desde o dia 1.
    // Com uma query só e orderBy validoAte asc, o backlog antigo enchia o
    // take antes de sobrar espaço pra "hoje"/"amanhã" — depois de alguns meses
    // de uso o painel ia mostrar só etiqueta vencida há muito tempo, e o que
    // vence HOJE (a informação que a cozinha realmente precisa agora) nem
    // aparecia. Separando as 3 queries, "hoje" e "amanhã" têm cota própria e
    // nunca competem com o histórico de vencidas.
    const [vencidas, hoje, amanha] = await Promise.all([
      // DESC: vencimento mais recente primeiro. É o que ainda pode estar na
      // prateleira agora e precisa sair; o que venceu há 3 meses já foi
      // descartado há muito e não é prioridade de tela.
      prisma.etiquetaImpressa.findMany({ where: { validoAte: { lt: agora } }, orderBy: { validoAte: 'desc' }, take: 200 }),
      prisma.etiquetaImpressa.findMany({ where: { validoAte: { gte: agora, lt: inicioAmanha } }, orderBy: { validoAte: 'asc' }, take: 200 }),
      prisma.etiquetaImpressa.findMany({ where: { validoAte: { gte: inicioAmanha, lt: inicioDepoisDeAmanha } }, orderBy: { validoAte: 'asc' }, take: 200 }),
    ]);
    res.json({ vencidas, hoje, amanha });
  } catch (err) { console.error('[etiquetas/painel]', err); res.status(500).json({ error: 'Erro ao carregar o painel.' }); }
});

// Histórico: tudo que já foi impresso (rastreabilidade sanitária), com busca
// por item/lote e filtro por período.
app.get('/api/etiquetas/historico', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = {};
    // lote é sempre gravado maiúsculo (gerarLote()) — normaliza a busca em vez
    // de exigir mode:'insensitive', que o Postgres não usa em índice comum.
    if (busca) where.OR = [{ nomeItem: { contains: busca, mode: 'insensitive' } }, { lote: { contains: busca.toUpperCase() } }];
    // de/ate = YYYY-MM-DD, inclusivo, fuso BR fixo — mesmo padrão de
    // GET /api/ponto/marcacoes. Filtra por criadoEm (quando a etiqueta foi
    // IMPRESSA, que é o que esta tela lista), coluna do índice [empresaId, criadoEm].
    const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null; };
    const de = ymd(req.query.de), ate = ymd(req.query.ate);
    if (de || ate) {
      const cond = {};
      if (de) cond.gte = new Date(brToUtcMs(de.y, de.mo, de.d, 0, 0));
      if (ate) cond.lt = new Date(brToUtcMs(ate.y, ate.mo, ate.d + 1, 0, 0)); // dia seguinte (exclusivo)
      where.criadoEm = cond;
    }
    const etiquetas = await prisma.etiquetaImpressa.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 200 });
    res.json({ etiquetas });
  } catch (err) { console.error('[etiquetas/historico]', err); res.status(500).json({ error: 'Erro ao carregar o histórico.' }); }
});

// ===== Etiquetas (PÚBLICO — quiosque por token, sem login) =====
// Estas rotas rodam FORA dos gates de auth/tenant (ver o app.use('/api') do topo:
// tudo sob /public/ passa direto). Sem tenantStore, a extension do Prisma NÃO
// injeta empresaId: aqui todo where leva empresaId EXPLÍCITO, vindo do Dispositivo
// que o token resolve. É o oposto do lado ADMIN, onde filtro manual é erro.

app.get('/api/public/etiquetas/:token/bootstrap', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token, 'ETIQUETA');
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const empresaId = disp.empresaId;

    const [loja, config, regras, insumos, cfgs, funcionarios] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true } }),
      prisma.etiquetaConfig.findFirst({ where: { empresaId } }),
      prisma.etiquetaRegra.findMany({ where: { empresaId, ativo: true }, orderBy: { ordem: 'asc' } }),
      prisma.insumo.findMany({ where: { empresaId, ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, tipo: true } }),
      // TODOS os configs, inclusive os desligados: o desligado não some daqui, ele
      // TIRA o insumo da lista (ver a semântica do `ativo`, abaixo). Filtrar por
      // `ativo: true` na query era o bug — o config sumia, o item continuava
      // aparecendo (a lista sai de `insumos`, o config só enriquece) e o /registrar
      // achava o mesmo config e aplicava o override que o admin tinha desativado.
      prisma.etiquetaItemConfig.findMany({ where: { empresaId } }),
      prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true, funcao: true } }),
    ]);

    // Quem está NO TURNO agora aparece primeiro: é quem está na cozinha, e a lista inteira
    // num tablet é lenta de percorrer. "No turno" = a ÚLTIMA marcação do expediente é ENTRADA
    // ou RETORNO_INTERVALO (turno aberto) — não basta ter batido ponto hoje (quem já bateu
    // SAIDA encerrou). Mesma regra do painel do ponto (/api/ponto/painel).
    const { de, ate } = janelaExpedienteAtual();
    const regsPonto = await prisma.pontoRegistro.findMany({
      where: { empresaId, invalidada: false, dataHora: { gte: de, lt: ate } },
      orderBy: { dataHora: 'asc' }, select: { funcionarioId: true, tipo: true },
    });
    const ultimoTipoPonto = new Map();
    for (const r of regsPonto) ultimoTipoPonto.set(r.funcionarioId, r.tipo); // asc → a última marcação vence
    const presentes = new Set(
      [...ultimoTipoPonto].filter(([, t]) => t === 'ENTRADA' || t === 'RETORNO_INTERVALO').map(([id]) => id),
    );

    const cMap = new Map(cfgs.map((c) => [c.insumoId, c]));

    // ── Semântica do `ativo` do EtiquetaItemConfig (VALE PARA AS DUAS PONTAS) ──
    //
    //   • SEM config           → o item APARECE e pode ser etiquetado, escolhendo a
    //                            conservação na hora. É o insumo recém-cadastrado:
    //                            não ter padrão não é motivo para não poder etiquetar.
    //   • config `ativo: true` → o item aparece COM o padrão dele (conservação/validade).
    //   • config `ativo: false`→ o item NÃO aparece na cozinha, e o /registrar RECUSA.
    //                            É o que o toggle do admin promete literalmente:
    //                            "Desligado, o item some da tela de impressão".
    //
    // Bootstrap e /registrar TÊM que concordar nisso — foi a discordância que colou
    // no pote uma validade diferente da que o tablet mostrou: aqui o config desligado
    // era ignorado (item aparecia sem padrão, prévia calculava pela regra: +5d) e lá
    // ele era encontrado e aplicado (override desativado: +3d). Mexeu aqui, mexa lá.
    const itens = insumos
      .filter((i) => cMap.get(i.id)?.ativo !== false) // sem config (undefined) fica; desligado sai
      .map((i) => {
        const c = cMap.get(i.id) || null;
        return { insumoId: i.id, nome: i.nome, tipo: i.tipo, conservacaoPadrao: c?.conservacaoPadrao || null, validadeDias: c?.validadeDias ?? null };
      });

    // Entregador/motoboy não manipula alimento na cozinha — não faz sentido aparecer
    // como responsável por uma etiqueta. `funcao` é texto livre (sem enum), então o
    // filtro é por regex em vez de igualdade exata.
    const ehEntregador = (f) => /entregador|motoboy/i.test(String(f.funcao || ''));

    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null },
      dispositivo: { nome: disp.nome },
      config: config || { larguraMm: 50, alturaMm: 30, razaoSocial: loja?.nome || null },
      regras,
      itens,
      funcionarios: funcionarios
        .filter((f) => !ehEntregador(f))
        .map((f) => ({ id: f.id, nome: f.apelido || f.nome, presente: presentes.has(f.id) }))
        .sort((a, b) => (b.presente - a.presente) || a.nome.localeCompare(b.nome)),
    });
  } catch (err) { console.error('[public/etiquetas/bootstrap]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

// Cria a etiqueta sorteando o lote, com RETRY em colisão.
//
// A detecção da colisão (colisaoDeLote) mora em etiquetas.js: é decisão pura sobre
// o objeto de erro e é onde ela tem teste. Este helper fica aqui porque é o oposto
// disso — só existe para falar com o Prisma, e o módulo é puro por contrato.
//
// `lote` é @unique GLOBAL e gerarLote() sorteia 6 chars de um alfabeto de 32 —
// 32^6 ≈ 1,07 bi combinações. Como o unique é global, o paradoxo do aniversário
// conta o volume SOMADO de todas as lojas: ~5% de chance de ao menos uma colisão
// em 10 mil etiquetas e ~69% em 50 mil. Não é hipótese remota: é o normal de um
// ano de operação. Sem retry, o azar chegaria à cozinha como erro opaco no meio
// do turno — e o cozinheiro não tem o que fazer com "Erro ao registrar".
//
// 3 tentativas: cada sorteio é independente, então a chance de três colidirem
// seguidas é desprezível (~1e-15 no volume acima).
async function criarEtiquetaComLote(dados) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await prisma.etiquetaImpressa.create({ data: { ...dados, lote: gerarLote() } });
    } catch (e) {
      // Qualquer outro erro sobe inalterado: engolir aqui esconderia bug de verdade
      // atrás de três tentativas idênticas e de uma mensagem errada.
      if (!colisaoDeLote(e)) throw e;
      console.warn('[public/etiquetas/registrar] colisão de lote, sorteando outro (tentativa %d de 3)', tentativa + 1);
    }
  }
  throw { http: 503, msg: 'Não foi possível gerar um código de lote livre. Tente imprimir de novo.' };
}

app.post('/api/public/etiquetas/:token/registrar', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token, 'ETIQUETA');
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const empresaId = disp.empresaId;
    const b = req.body || {};

    const insumoId = b.insumoId ? parseInt(b.insumoId, 10) : null;
    const nomeAvulso = typeof b.nomeAvulso === 'string' ? b.nomeAvulso.trim().slice(0, 120) : '';
    if (!insumoId && !nomeAvulso) return res.status(400).json({ error: 'Escolha um item ou informe o nome.' });

    let nomeItem = nomeAvulso, itemConfig = null;
    if (insumoId) {
      // MESMOS filtros do bootstrap (`ativo` + tipo etiquetável). Rota pública e sem
      // auth: se a cozinha não vê o item na tela, um request forjado também não pode
      // etiquetá-lo — e o que a tela lista é isto aqui.
      const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId, ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } } });
      if (!insumo) return res.status(404).json({ error: 'Item não encontrado.' });
      nomeItem = insumo.nome;
      itemConfig = await prisma.etiquetaItemConfig.findFirst({ where: { empresaId, insumoId } });
      // Config desligado = item fora da cozinha (semântica completa no bootstrap).
      // O bootstrap já o tirou da lista; recusar aqui fecha a outra ponta: sem isto,
      // um tablet com o bootstrap velho em cache imprimiria com o override que o
      // admin desativou. Recusar é melhor que ignorar o config e cair na regra — a
      // etiqueta sairia com validade que ninguém configurou.
      if (itemConfig?.ativo === false) {
        return res.status(400).json({ error: 'Este item está desativado para etiquetagem. Fale com o gestor.' });
      }
    }

    // `status: 'ATIVO'` como no bootstrap (e como na rota irmã do ponto): sem isso um
    // request forjado atribui a manipulação a um demitido, e responsavelNome é
    // snapshot legal — é o nome que fica no rótulo colado no alimento.
    const func = b.responsavelId ? await prisma.funcionario.findFirst({ where: { id: parseInt(b.responsavelId, 10), empresaId, status: 'ATIVO' } }) : null;
    if (!func) return res.status(400).json({ error: 'Escolha quem manipulou.' });

    const regras = await prisma.etiquetaRegra.findMany({ where: { empresaId, ativo: true } });
    // A validade é recalculada AQUI: o cliente não é fonte de verdade para a
    // data que vai colada num alimento.
    let calc;
    try { calc = validadeDe({ manipuladoEmMs: Date.now(), conservacao: b.conservacao, regras, itemConfig }); }
    catch (e) { return res.status(e.http || 400).json({ error: e.msg || 'Conservação inválida.' }); }

    const quantidade = Math.min(50, Math.max(1, parseInt(b.quantidade, 10) || 1));
    let etiqueta;
    try {
      etiqueta = await criarEtiquetaComLote({
        empresaId, insumoId, nomeItem,
        conservacao: b.conservacao, tempLabel: calc.tempLabel,
        manipuladoEm: new Date(), validoAte: calc.validoAte, validadeDias: calc.dias,
        responsavelId: func.id,
        // Snapshot deliberado: o rótulo colado no alimento tem que continuar
        // dizendo quem manipulou mesmo que o cadastro mude ou saia depois.
        responsavelNome: func.apelido || func.nome,
        dispositivoId: disp.id, quantidade,
      });
    } catch (e) {
      // Só o esgotamento das tentativas chega aqui como {http, msg}; o resto cai
      // no catch de fora e vira 500 com log.
      if (e?.http) return res.status(e.http).json({ error: e.msg });
      throw e;
    }
    await prisma.dispositivo.update({ where: { id: disp.id }, data: { ultimaSync: new Date() } });
    res.status(201).json({ ok: true, etiqueta });
  } catch (err) { console.error('[public/etiquetas/registrar]', err); res.status(500).json({ error: 'Erro ao registrar a etiqueta.' }); }
});

// ===== Etiquetas (ADMIN) — registro direto pelo admin, para a Niimbot =====
//
// Espelha o /public/etiquetas/:token/registrar acima, mas autenticado (dentro do
// gate de tenant, não por token de dispositivo) e com responsável em TEXTO LIVRE
// em vez de funcionário cadastrado — é o admin digitando na hora, não a cozinha
// escolhendo o próprio nome numa lista. `getEmpresaIdAtual()` (nunca
// req.user.empresaId: para ADMIN é o JWT cru do HUB, sem esse campo) é a mesma
// função que garantirEtiquetaSetup() já usa por este mesmo motivo.
app.post('/api/etiquetas/registrar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const empresaId = getEmpresaIdAtual();
    const b = req.body || {};
    const insumoId = b.insumoId ? parseInt(b.insumoId, 10) : null;
    const nomeAvulso = typeof b.nomeAvulso === 'string' ? b.nomeAvulso.trim().slice(0, 120) : '';
    if (!insumoId && !nomeAvulso) return res.status(400).json({ error: 'Escolha um item ou informe o nome.' });

    let nomeItem = nomeAvulso, itemConfig = null;
    if (insumoId) {
      const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } } });
      if (!insumo) return res.status(404).json({ error: 'Item não encontrado.' });
      nomeItem = insumo.nome;
      itemConfig = await prisma.etiquetaItemConfig.findFirst({ where: { insumoId } });
      if (itemConfig?.ativo === false) return res.status(400).json({ error: 'Este item está desativado para etiquetagem.' });
    }

    const responsavelNome = typeof b.responsavelNome === 'string' ? b.responsavelNome.trim().slice(0, 120) : '';
    if (!responsavelNome) return res.status(400).json({ error: 'Informe o responsável (quem manipulou).' });

    const manipuladoEmMs = b.manipuladoEm ? Date.parse(b.manipuladoEm) : Date.now();
    if (!Number.isFinite(manipuladoEmMs)) return res.status(400).json({ error: 'Data de manipulação inválida.' });

    const regras = await prisma.etiquetaRegra.findMany({ where: { ativo: true } });
    let calc;
    try { calc = validadeDe({ manipuladoEmMs, conservacao: b.conservacao, regras, itemConfig }); }
    catch (e) { return res.status(e.http || 400).json({ error: e.msg || 'Conservação inválida.' }); }

    // Override opcional de validade (dias) — aplicado NO SERVIDOR, mantendo o tempLabel da regra.
    const override = b.validadeDias == null || b.validadeDias === '' ? null : parseInt(b.validadeDias, 10);
    let validoAte = calc.validoAte, validadeDias = calc.dias;
    if (override !== null) {
      if (!Number.isFinite(override) || override < 1 || override > 3650) return res.status(400).json({ error: 'Validade deve ser de 1 a 3650 dias.' });
      validadeDias = override;
      validoAte = new Date(manipuladoEmMs + override * 86400000);
    }

    const quantidade = Math.min(50, Math.max(1, parseInt(b.quantidade, 10) || 1));
    let etiqueta;
    try {
      etiqueta = await criarEtiquetaComLote({
        empresaId, insumoId, nomeItem, conservacao: b.conservacao, tempLabel: calc.tempLabel,
        manipuladoEm: new Date(manipuladoEmMs), validoAte, validadeDias,
        responsavelId: null, responsavelNome, dispositivoId: null, quantidade,
      });
    } catch (e) { if (e?.http) return res.status(e.http).json({ error: e.msg }); throw e; }
    res.status(201).json({ ok: true, etiqueta });
  } catch (err) { console.error('[etiquetas/registrar admin]', err); res.status(500).json({ error: 'Erro ao registrar a etiqueta.' }); }
});

// O QR da etiqueta ficou para a v2, e com ele a consulta pública por lote que existia
// aqui (GET /api/public/etiquetas/lote/:lote). Ela era pública e sem auth, mas nada a
// chamava: não há rota /etq/:lote no App.jsx e o quiosque nunca desenha QR. Endpoint sem
// chamador é só superfície de ataque — quem soubesse o formato do lote (6 chars) lia nome
// do item, datas e o NOME de quem manipulou, de fora, sem login. Volta junto com o QR,
// quando houver quem o chame e um dono para a regra de exposição.

// ===== Checklist (ADMIN) — área `checklist` já protegida pelo middleware =====

const CHECKLIST_CATEGORIAS = ['Abertura', 'Fechamento', 'Controle de Pragas', 'Documentações Sanitárias', 'Segurança Alimentar'];

// Templates de fábrica (da referência), SEM itens de foto — o tipo FOTO chega na
// Fatia 2. Semeados por loja na 1ª leitura (cobre lojas criadas depois).
const CHECKLIST_TEMPLATES_SEED = [
  { nome: 'Abertura Cozinha', categoria: 'Abertura', descricao: 'Procedimentos obrigatórios para abertura da cozinha', tempoEstimadoMin: 20, itens: [
    { tipo: 'CHECK', titulo: 'Verificar validade dos insumos', critico: true },
    { tipo: 'NUMERICO', titulo: 'Temperatura da câmara fria', config: { unidade: '°C' } },
    { tipo: 'AVALIACAO', titulo: 'Estado de limpeza das bancadas', config: { notaMinima: 4 } },
    { tipo: 'CHECK', titulo: 'Ligar equipamentos' },
    { tipo: 'SELECAO', titulo: 'Verificar estoque crítico', config: { opcoes: [{ rotulo: 'Estoque OK', conforme: true }, { rotulo: 'Baixo estoque', conforme: true }, { rotulo: 'Sem estoque', conforme: false }] } },
    { tipo: 'TEXTO', titulo: 'Observações da abertura' },
    { tipo: 'FOTO', titulo: 'Foto da organização geral', descricao: 'Verifique se a cozinha está organizada, limpa e sem resíduos' },
  ] },
  { nome: 'Abertura Salão', categoria: 'Abertura', descricao: 'Checklist para garantir a correta abertura do salão', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Limpar e arrumar mesas' },
    { tipo: 'CHECK', titulo: 'Verificar cardápios nas mesas' },
    { tipo: 'AVALIACAO', titulo: 'Avaliação da apresentação', config: { notaMinima: 4 } },
    { tipo: 'FOTO', titulo: 'Foto do salão montado', descricao: 'Verifique se as mesas estão arrumadas e o ambiente apresentável' },
  ] },
  { nome: 'Fechamento Salão', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento do salão', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Recolher todos os cardápios' },
    { tipo: 'CHECK', titulo: 'Limpar mesas e cadeiras' },
    { tipo: 'CHECK', titulo: 'Varrer e passar pano no piso' },
    { tipo: 'CHECK', titulo: 'Desligar luzes e ar-condicionado' },
  ] },
  { nome: 'Abertura Caixa', categoria: 'Abertura', descricao: 'Procedimentos de abertura do caixa', tempoEstimadoMin: 10, itens: [
    { tipo: 'NUMERICO', titulo: 'Conferir troco inicial', config: { unidade: 'un' } },
    { tipo: 'CHECK', titulo: 'Testar máquinas de cartão' },
    { tipo: 'CHECK', titulo: 'Ligar sistema PDV' },
    { tipo: 'SELECAO', titulo: 'Status das máquinas', config: { opcoes: [{ rotulo: 'Todas funcionando', conforme: true }, { rotulo: 'Uma com problema', conforme: false }, { rotulo: 'Várias com problema', conforme: false }] } },
  ] },
  { nome: 'Fechamento Caixa', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento do caixa', tempoEstimadoMin: 20, itens: [
    { tipo: 'CHECK', titulo: 'Verificar se há pedidos em aberto no sistema' },
    { tipo: 'CHECK', titulo: 'Realizar fechamento de caixa no sistema' },
    { tipo: 'CHECK', titulo: 'Imprimir e arquivar relatórios de pagamento' },
    { tipo: 'NUMERICO', titulo: 'Contar troco e sangria', config: { unidade: 'un' } },
    { tipo: 'CHECK', titulo: 'Armazenar malote em cofre' },
    { tipo: 'CHECK', titulo: 'Conferir recebimentos eletrônicos' },
    { tipo: 'CHECK', titulo: 'Carregar máquinas de cartão' },
    { tipo: 'CHECK', titulo: 'Encerrar sessão do iFood Manager' },
    { tipo: 'CHECK', titulo: 'Desligar equipamentos de front' },
  ] },
  { nome: 'Abertura Bar', categoria: 'Abertura', descricao: 'Checklist para garantir a correta abertura do bar', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Verificar estoque de bebidas' },
    { tipo: 'CHECK', titulo: 'Preparar mise en place' },
    { tipo: 'CHECK', titulo: 'Verificar gelo e frutas' },
    { tipo: 'CHECK', titulo: 'Limpar bancada do bar' },
  ] },
  { nome: 'Fechamento Bar', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento do bar', tempoEstimadoMin: 15, itens: [
    { tipo: 'CHECK', titulo: 'Limpar todos os utensílios' },
    { tipo: 'CHECK', titulo: 'Guardar bebidas' },
    { tipo: 'CHECK', titulo: 'Descartar frutas vencidas' },
  ] },
  { nome: 'Fechamento Cozinha', categoria: 'Fechamento', descricao: 'Checklist para garantir o correto fechamento da cozinha', tempoEstimadoMin: 25, itens: [
    { tipo: 'CHECK', titulo: 'Desligar todos os fogões', critico: true },
    { tipo: 'CHECK', titulo: 'Limpar bancadas e superfícies' },
    { tipo: 'CHECK', titulo: 'Armazenar alimentos corretamente' },
    { tipo: 'AVALIACAO', titulo: 'Avaliação geral do turno', config: { notaMinima: 3 } },
    { tipo: 'CHECK', titulo: 'Retirar lixo' },
    { tipo: 'FOTO', titulo: 'Foto da válvula de gás desligada', descricao: 'Verifique se a válvula de gás está na posição FECHADA', critico: true },
    { tipo: 'FOTO', titulo: 'Foto do estado final da cozinha', descricao: 'Verifique se os equipamentos estão desligados e a cozinha limpa' },
  ] },
  { nome: 'Fechamento Gerência', categoria: 'Fechamento', descricao: 'Checklist de fechamento para a gerência', tempoEstimadoMin: 15, itens: [
    { tipo: 'NUMERICO', titulo: 'Revisar faturamento do dia', config: { unidade: 'un' } },
    { tipo: 'CHECK', titulo: 'Aprovar fechamento de caixa' },
    { tipo: 'TEXTO', titulo: 'Observações gerenciais' },
  ] },
  { nome: 'Controle de Pragas', categoria: 'Controle de Pragas', descricao: 'Inspeção periódica de controle de pragas', tempoEstimadoMin: 30, itens: [
    { tipo: 'CHECK', titulo: 'Inspeção de armadilhas' },
    { tipo: 'SELECAO', titulo: 'Nível de infestação', config: { opcoes: [{ rotulo: 'Nenhuma', conforme: true }, { rotulo: 'Leve', conforme: true }, { rotulo: 'Moderada', conforme: false }, { rotulo: 'Grave', conforme: false }] } },
    { tipo: 'TEXTO', titulo: 'Laudo técnico' },
    { tipo: 'FOTO', titulo: 'Foto das armadilhas', descricao: 'Verifique se as armadilhas estão intactas e posicionadas' },
  ] },
  { nome: 'Segurança Alimentar', categoria: 'Segurança Alimentar', descricao: 'Checklist de conformidade ANVISA', tempoEstimadoMin: 20, itens: [
    { tipo: 'NUMERICO', titulo: 'Temperatura do refrigerador', config: { unidade: '°C', min: 0, max: 4 } },
    { tipo: 'NUMERICO', titulo: 'Temperatura do freezer', config: { unidade: '°C', max: -18 } },
    { tipo: 'CHECK', titulo: 'EPIs sendo utilizados', critico: true },
    { tipo: 'AVALIACAO', titulo: 'Higiene das mãos', config: { notaMinima: 4 } },
    { tipo: 'FOTO', titulo: 'Foto das etiquetas de validade', descricao: 'Verifique se as etiquetas estão visíveis e dentro do prazo' },
  ] },
  { nome: 'Documentações Sanitárias', categoria: 'Documentações Sanitárias', descricao: 'Conferência de documentações sanitárias obrigatórias', tempoEstimadoMin: 30, itens: [
    { tipo: 'CHECK', titulo: 'Alvará sanitário válido', critico: true },
    { tipo: 'CHECK', titulo: 'Laudo de dedetização em dia' },
    { tipo: 'CHECK', titulo: 'POP atualizado' },
    { tipo: 'CHECK', titulo: 'Certificado de manipuladores' },
    { tipo: 'TEXTO', titulo: 'Observações' },
  ] },
];

// Semeia os templates de fábrica na 1ª vez (a extension injeta empresaId por linha,
// inclusive no createMany dos itens — mesmo padrão do garantirEtiquetaSetup).
async function garantirChecklistTemplatesSeed() {
  // findFirst (não count) — findFirst é escopado por empresaId pela extension; um
  // count() poderia contar entre lojas e nunca semear a 2ª loja. Mesmo cuidado do
  // garantirEtiquetaSetup.
  const existe = await prisma.checklistTemplate.findFirst();
  if (existe) return;
  for (const tpl of CHECKLIST_TEMPLATES_SEED) {
    const criado = await prisma.checklistTemplate.create({
      data: { nome: tpl.nome, categoria: tpl.categoria, descricao: tpl.descricao || null, tempoEstimadoMin: tpl.tempoEstimadoMin || null },
    });
    await prisma.checklistTemplateItem.createMany({
      data: tpl.itens.map((it, i) => ({ templateId: criado.id, ordem: i, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao || null, critico: !!it.critico, config: it.config || null })),
    });
  }
}

const chkOnly = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

// ---- Templates
app.get('/api/checklist/templates', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    await garantirChecklistTemplatesSeed();
    const where = { arquivado: false };
    if (req.query.categoria && CHECKLIST_CATEGORIAS.includes(req.query.categoria)) where.categoria = req.query.categoria;
    const templates = await prisma.checklistTemplate.findMany({ where, orderBy: { nome: 'asc' }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.json({ templates, categorias: CHECKLIST_CATEGORIAS });
  } catch (err) { console.error('[checklist/templates GET]', err); res.status(500).json({ error: 'Erro ao carregar templates.' }); }
});
app.get('/api/checklist/templates/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const t = await prisma.checklistTemplate.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });
    res.json({ template: t });
  } catch (err) { console.error('[checklist/templates/:id GET]', err); res.status(500).json({ error: 'Erro ao carregar template.' }); }
});

// Valida e normaliza a lista de itens (compartilhado por template e checklist).
function chkNormalizarItens(itensRaw) {
  const TIPOS = new Set(['CHECK', 'AVALIACAO', 'TEXTO', 'NUMERICO', 'SELECAO', 'FOTO']);
  const arr = Array.isArray(itensRaw) ? itensRaw : [];
  const itens = [];
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i] || {};
    if (!TIPOS.has(it.tipo)) throw { http: 400, msg: `Tipo de item inválido: ${it.tipo}` };
    const titulo = chkOnly(it.titulo, 160);
    if (!titulo) throw { http: 400, msg: 'Todo item precisa de um título.' };
    // config: mantém os campos por-tipo já existentes (min/max do numérico, opções da
    // seleção, unidade, ...) tal como vieram, e soma dica de execução (colaborador) e
    // instrução da gestão (quando o item fica fora do padrão) — comuns a todos os tipos.
    let config = it.config && typeof it.config === 'object' ? { ...it.config } : null;
    if (it.config && typeof it.config === 'object') {
      if (it.config.dica != null && String(it.config.dica).trim() !== '') config.dica = String(it.config.dica).slice(0, 300);
      else if (config) delete config.dica;
      if (it.config.instrucaoAlerta != null && String(it.config.instrucaoAlerta).trim() !== '') config.instrucaoAlerta = String(it.config.instrucaoAlerta).slice(0, 300);
      else if (config) delete config.instrucaoAlerta;
    }
    itens.push({ ordem: i, tipo: it.tipo, titulo, descricao: chkOnly(it.descricao, 300), critico: !!it.critico, config });
  }
  return itens;
}

app.post('/api/checklist/templates', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = chkOnly(req.body?.nome, 120);
    if (!nome) return res.status(400).json({ error: 'Informe o nome do template.' });
    const categoria = CHECKLIST_CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : CHECKLIST_CATEGORIAS[0];
    let itens; try { itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    // create do pai + createMany dos filhos (NÃO `itens: { create: itens }` aninhado):
    // a extension multi-tenant injeta empresaId por chamada de 1º nível do Prisma; um
    // nested write dentro de um único create() não passa pelo $allOperations dos
    // filhos, então o Prisma recusa a escrita na hora ("Argument `empresaId` is
    // missing"), já que a coluna é NOT NULL — confirmado num script isolado durante
    // o desenvolvimento. Mesmo padrão do garantirChecklistTemplatesSeed.
    const criado = await prisma.checklistTemplate.create({
      data: { nome, categoria, descricao: chkOnly(req.body?.descricao, 300), tempoEstimadoMin: parseInt(req.body?.tempoEstimadoMin, 10) || null },
    });
    if (itens.length) {
      await prisma.checklistTemplateItem.createMany({ data: itens.map((it) => ({ ...it, templateId: criado.id })) });
    }
    const t = await prisma.checklistTemplate.findFirst({ where: { id: criado.id }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.status(201).json({ ok: true, template: t });
  } catch (err) { console.error('[checklist/templates POST]', err); res.status(500).json({ error: 'Erro ao criar template.' }); }
});
app.put('/api/checklist/templates/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.checklistTemplate.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Template não encontrado.' });
    let itens; try { itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    // Substitui os itens (a edição reescreve a lista inteira). Templates são
    // biblioteca — execuções passadas usam snapshot, então isso não afeta histórico.
    // Mesma ressalva do POST: nested `itens: { create: itens }` não recebe empresaId
    // da extension (nested write não passa pelo $allOperations do filho) — aqui é
    // delete + update do pai (sem itens aninhados) + createMany dos filhos, dentro da
    // mesma transação. Verificado que `tx` preserva a extension e o AsyncLocalStorage
    // (o createMany via tx também sai com empresaId certo).
    await prisma.$transaction(async (tx) => {
      await tx.checklistTemplateItem.deleteMany({ where: { templateId: id } });
      await tx.checklistTemplate.update({
        where: { id },
        data: {
          nome: chkOnly(req.body?.nome, 120) || atual.nome,
          categoria: CHECKLIST_CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : atual.categoria,
          descricao: chkOnly(req.body?.descricao, 300),
          tempoEstimadoMin: parseInt(req.body?.tempoEstimadoMin, 10) || null,
        },
      });
      if (itens.length) {
        await tx.checklistTemplateItem.createMany({ data: itens.map((it) => ({ ...it, templateId: id })) });
      }
    });
    const t = await prisma.checklistTemplate.findFirst({ where: { id }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.json({ ok: true, template: t });
  } catch (err) { console.error('[checklist/templates PUT]', err); res.status(500).json({ error: 'Erro ao salvar template.' }); }
});
app.delete('/api/checklist/templates/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.checklistTemplate.update({ where: { id: parseInt(req.params.id, 10) }, data: { arquivado: true } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/templates DELETE]', err); res.status(500).json({ error: 'Erro ao arquivar template.' }); }
});

// ---- Checklists (a partir de template ou do zero) — atribuídos por função
const PRIORIDADES = new Set(['BAIXA', 'MEDIA', 'ALTA']);
const RECORRENCIAS = new Set(['DIARIA', 'DIAS_SEMANA', 'AVULSO']);

// Normaliza os dados de cabeçalho do Checklist. `fallback` é o registro atual no PUT
// (mantém o que não veio no body); no POST é null.
function chkDadosChecklist(body, fallback) {
  const nome = chkOnly(body?.nome, 120);
  if (!nome && !fallback) throw { http: 400, msg: 'Informe o nome do checklist.' };
  // Atribuição: FUNCAO (nomes de Funções) OU COLABORADOR (ids de Funcionário). Grava os dois;
  // o `atribuicaoTipo` decide qual vale. Função: dedup, sem vazios, teto 20. Colaborador: ids
  // finitos, dedup, teto 50.
  const atribuicaoTipo = body?.atribuicaoTipo === 'COLABORADOR' ? 'COLABORADOR'
    : body?.atribuicaoTipo === 'FUNCAO' ? 'FUNCAO'
    : (fallback?.atribuicaoTipo || 'FUNCAO');
  const funcoes = Array.isArray(body?.funcoes)
    ? [...new Set(body.funcoes.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20)
    : (fallback?.funcoes || []);
  const funcionarioIds = Array.isArray(body?.funcionarioIds)
    ? [...new Set(body.funcionarioIds.map((n) => parseInt(n, 10)).filter(Number.isFinite))].slice(0, 50)
    : (fallback?.funcionarioIds || []);
  const rc = body?.recorrenciaConfig && typeof body.recorrenciaConfig === 'object' ? body.recorrenciaConfig : {};
  const diasSemana = Array.isArray(rc.diasSemana) ? [...new Set(rc.diasSemana.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))] : [];
  // Tolerância (min) do alerta de atraso — por checklist, dentro do recorrenciaConfig.
  // Ausente/inválida = 0 (dispara no horário); clamp 0–240 (4h).
  const toleranciaBruta = Number(rc.toleranciaMin);
  const toleranciaMin = Number.isFinite(toleranciaBruta)
    ? Math.max(0, Math.min(240, Math.round(toleranciaBruta)))
    : (Number.isFinite(fallback?.recorrenciaConfig?.toleranciaMin) ? fallback.recorrenciaConfig.toleranciaMin : 0);
  // Tempo estimado (min) — opcional, exibido pro colaborador na execução.
  const tempoBruto = parseInt(body?.tempoEstimadoMin, 10);
  const tempoEstimadoMin = Number.isFinite(tempoBruto) && tempoBruto >= 0 ? tempoBruto : (fallback?.tempoEstimadoMin ?? null);
  return {
    nome: nome || fallback.nome,
    categoria: CHECKLIST_CATEGORIAS.includes(body?.categoria) ? body.categoria : (fallback?.categoria || CHECKLIST_CATEGORIAS[0]),
    descricao: chkOnly(body?.descricao, 300),
    prioridade: PRIORIDADES.has(body?.prioridade) ? body.prioridade : (fallback?.prioridade || 'MEDIA'),
    atribuicaoTipo,
    funcoes,
    funcionarioIds,
    tempoEstimadoMin,
    recorrenciaTipo: RECORRENCIAS.has(body?.recorrenciaTipo) ? body.recorrenciaTipo : (fallback?.recorrenciaTipo || 'AVULSO'),
    recorrenciaConfig: { diasSemana, horarioLimite: chkOnly(rc.horarioLimite, 5), toleranciaMin },
  };
}

app.get('/api/checklist/checklists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = { ativo: true };
    if (busca) where.nome = { contains: busca, mode: 'insensitive' };
    const checklists = await prisma.checklist.findMany({ where, orderBy: { nome: 'asc' }, include: { _count: { select: { itens: true } } } });

    // Enriquecimento p/ o card do gestor (rota admin → empresaId injetado pela extension):
    // responsável resolvido (nomes), horário-limite, e o progresso de HOJE (barra) quando o
    // checklist vence hoje. Colaborador → nomes dos funcionários; Função → os próprios nomes.
    const funcs = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, select: { id: true, nome: true, apelido: true } });
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    const dataRef = chkDataRefAtual();
    const dow = chkDiaSemanaExpediente();
    const execs = await prisma.checklistExecucao.findMany({ where: { dataRef }, select: { checklistId: true, status: true, emAlerta: true, _count: { select: { respostas: true } } } });
    const emap = new Map(execs.map((e) => [e.checklistId, e]));
    const enriquecidos = checklists.map((c) => {
      const resp = c.atribuicaoTipo === 'COLABORADOR'
        ? (Array.isArray(c.funcionarioIds) ? c.funcionarioIds.map((id) => fmap.get(id)).filter(Boolean).join(', ') : '')
        : (Array.isArray(c.funcoes) ? c.funcoes.join(', ') : '');
      const vence = venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow);
      const ex = emap.get(c.id);
      const total = c._count.itens;
      const feitos = Math.min(ex?._count?.respostas || 0, total);
      const pct = ex?.status === 'CONCLUIDA' ? 100 : (total ? Math.round((feitos / total) * 100) : 0);
      const hl = (c.recorrenciaConfig && typeof c.recorrenciaConfig.horarioLimite === 'string') ? c.recorrenciaConfig.horarioLimite : null;
      return { ...c, responsavel: resp || null, horarioLimite: hl, venceHoje: vence, hojeStatus: ex?.status || null, hojeEmAlerta: ex?.emAlerta || false, hojePct: (vence || ex) ? pct : null };
    });
    res.json({ checklists: enriquecidos });
  } catch (err) { console.error('[checklist/checklists GET]', err); res.status(500).json({ error: 'Erro ao carregar checklists.' }); }
});
app.get('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let c = await prisma.checklist.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    // Link público (execução por PIN) é gerado sob demanda, na 1ª vez que o admin abre o
    // Detalhe — assim o front sempre tem um publicoToken pra montar a URL, sem exigir uma
    // ação explícita de "gerar link" antes.
    if (!c.publicoToken) {
      c = await prisma.checklist.update({ where: { id: c.id }, data: { publicoToken: randomBytes(12).toString('base64url') }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    }
    // Quem está atribuído a este checklist, com a marca de quem AINDA NÃO TEM PIN — sem isso
    // o gestor gera o link/QR, o colaborador aparece na lista pública e não consegue entrar
    // (a tela pública é genérica de propósito, pra não vazar quem tem PIN). Aqui é rota de
    // admin, então dá pra avisar. Usa o MESMO chkColabAtende da posse — regra num lugar só.
    const ativos = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } });
    const elegiveis = ativos.filter((f) => chkColabAtende(c, f)).map((f) => ({ id: f.id, nome: f.apelido || f.nome, temPin: !!f.pin }));
    res.json({ checklist: c, elegiveis });
  } catch (err) { console.error('[checklist/checklists/:id GET]', err); res.status(500).json({ error: 'Erro ao carregar checklist.' }); }
});
app.post('/api/checklist/checklists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    let dados, itens;
    try { dados = chkDadosChecklist(req.body, null); itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    // create do pai + createMany dos filhos (NÃO `itens: { create: itens }` aninhado):
    // mesmo ponto crítico já resolvido em POST /templates — a extension multi-tenant
    // não injeta empresaId em nested writes, só em chamadas de 1º nível do Prisma.
    const criado = await prisma.checklist.create({
      data: { ...dados, templateOrigemId: parseInt(req.body?.templateOrigemId, 10) || null },
    });
    if (itens.length) {
      await prisma.checklistItem.createMany({ data: itens.map((it) => ({ ...it, checklistId: criado.id })) });
    }
    const c = await prisma.checklist.findFirst({ where: { id: criado.id }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.status(201).json({ ok: true, checklist: c });
  } catch (err) { console.error('[checklist/checklists POST]', err); res.status(500).json({ error: 'Erro ao criar checklist.' }); }
});
app.put('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.checklist.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Checklist não encontrado.' });
    let dados, itens;
    // Validação ANTES do $transaction/deleteMany — input inválido não pode apagar os
    // itens atuais (a checagem tem que acontecer antes de qualquer escrita).
    try { dados = chkDadosChecklist(req.body, atual); itens = chkNormalizarItens(req.body?.itens); } catch (e) { return res.status(e.http || 400).json({ error: e.msg }); }
    // Mesma ressalva do POST: update do pai (sem itens aninhados) + deleteMany/createMany
    // dos filhos, dentro da mesma transação (tx preserva a extension e o empresaId).
    await prisma.$transaction(async (tx) => {
      await tx.checklistItem.deleteMany({ where: { checklistId: id } });
      await tx.checklist.update({ where: { id }, data: dados });
      if (itens.length) {
        await tx.checklistItem.createMany({ data: itens.map((it) => ({ ...it, checklistId: id })) });
      }
    });
    const c = await prisma.checklist.findFirst({ where: { id }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.json({ ok: true, checklist: c });
  } catch (err) { console.error('[checklist/checklists PUT]', err); res.status(500).json({ error: 'Erro ao salvar checklist.' }); }
});
app.delete('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.checklist.update({ where: { id: parseInt(req.params.id, 10) }, data: { ativo: false } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/checklists DELETE]', err); res.status(500).json({ error: 'Erro ao excluir checklist.' }); }
});

// Usar template como base → cria um Checklist copiando os itens (snapshot leve).
app.post('/api/checklist/templates/:id/usar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const t = await prisma.checklistTemplate.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });
    // create do pai + createMany dos filhos — mesmo ponto crítico dos outros endpoints.
    const criado = await prisma.checklist.create({
      data: { templateOrigemId: t.id, nome: t.nome, categoria: t.categoria, descricao: t.descricao },
    });
    if (t.itens.length) {
      await prisma.checklistItem.createMany({
        data: t.itens.map((it, i) => ({ checklistId: criado.id, ordem: i, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao, critico: it.critico, config: it.config })),
      });
    }
    const c = await prisma.checklist.findFirst({ where: { id: criado.id }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    res.status(201).json({ ok: true, checklist: c });
  } catch (err) { console.error('[checklist/templates/usar]', err); res.status(500).json({ error: 'Erro ao criar a partir do template.' }); }
});

// Painel do gestor (Task 10): KPIs + pendentes de hoje + em alerta. "Hoje" aqui é o dia
// de EXPEDIENTE (corte 05:00 BR via janelaExpedienteAtual), não o dia civil do VPS
// (que roda em UTC) — mesmo dataRef/dow usados pela Área do Colaborador (chkDataRefAtual/
// chkDiaSemanaExpediente) e pelo motor de recorrência puro (venceHoje).
app.get('/api/checklist/painel', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const dataRef = janelaExpedienteAtual().de;
    const f = brFields(dataRef.getTime());
    const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
    const checklists = await prisma.checklist.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, include: { _count: { select: { itens: true } } } });
    const execs = await prisma.checklistExecucao.findMany({ where: { dataRef }, select: { id: true, checklistId: true, status: true, emAlerta: true } });
    const execMap = new Map(execs.map((e) => [e.checklistId, e]));
    const venceHojeLista = checklists.filter((c) => venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow));
    const concluidosHoje = execs.filter((e) => e.status === 'CONCLUIDA').length;
    const emAlerta = execs.filter((e) => e.emAlerta).length;
    // Nomes dos colaboradores atribuídos (modo COLABORADOR) para exibir "Responsável".
    const idsColab = [...new Set(checklists.filter((c) => c.atribuicaoTipo === 'COLABORADOR').flatMap((c) => c.funcionarioIds || []))];
    const funcs = idsColab.length ? await prisma.funcionario.findMany({ where: { id: { in: idsColab } }, select: { id: true, nome: true, apelido: true } }) : [];
    const nomeFunc = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    const responsavelDe = (c) => c.atribuicaoTipo === 'COLABORADOR'
      ? (c.funcionarioIds || []).map((id) => nomeFunc.get(id)).filter(Boolean)
      : (c.funcoes || []);
    // Linha padrão do checklist para as listas do painel (com o responsável já resolvido).
    const linha = (c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, atribuicaoTipo: c.atribuicaoTipo, funcoes: c.funcoes || [], responsavel: responsavelDe(c), recorrenciaTipo: c.recorrenciaTipo, itens: c._count.itens });
    // Próximos agendamentos: vencem hoje e ainda não foram concluídos.
    const proximos = venceHojeLista.filter((c) => execMap.get(c.id)?.status !== 'CONCLUIDA')
      .map((c) => ({ ...linha(c), status: execMap.get(c.id)?.status || 'PENDENTE' }));
    // Sem agendamento: checklists avulsos, disponíveis sob demanda a qualquer dia.
    const semAgendamento = checklists.filter((c) => c.recorrenciaTipo === 'AVULSO').map(linha);
    // Checks em alerta: execução de hoje com item crítico fora do padrão. Leva o execId
    // para abrir o Detalhe da Execução direto do painel.
    const alertas = checklists.filter((c) => execMap.get(c.id)?.emAlerta)
      .map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, execId: execMap.get(c.id)?.id || null }));
    res.json({
      kpis: { ativos: checklists.length, venceHoje: venceHojeLista.length, concluidosHoje, emAlerta },
      proximos, semAgendamento, alertas,
      meus: checklists.map(linha),
    });
  } catch (err) { console.error('[checklist/painel]', err); res.status(500).json({ error: 'Erro ao carregar o painel.' }); }
});

// ---- Revisão da execução (Task 7): o gestor confere o que foi feito

// Execuções recentes — o gestor escolhe qual abrir.
app.get('/api/checklist/execucoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const execs = await prisma.checklistExecucao.findMany({
      orderBy: { iniciadaEm: 'desc' }, take: 50,
      include: { checklist: { select: { nome: true, categoria: true } } },
    });
    const funcIds = [...new Set(execs.map((e) => e.funcionarioId))];
    const funcs = funcIds.length ? await prisma.funcionario.findMany({ where: { id: { in: funcIds } }, select: { id: true, nome: true, apelido: true } }) : [];
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    res.json({ execucoes: execs.map((e) => ({ id: e.id, checklistNome: e.checklist?.nome, categoria: e.checklist?.categoria, funcionario: fmap.get(e.funcionarioId) || '—', status: e.status, emAlerta: e.emAlerta, iniciadaEm: e.iniciadaEm, concluidaEm: e.concluidaEm })) });
  } catch (err) { console.error('[checklist/execucoes]', err); res.status(500).json({ error: 'Erro ao carregar execuções.' }); }
});

// Histórico de execuções de UM checklist (Ação 2, Task 1): filtros por status/funcionário/data
// (dataRef em horário BR, dia de expediente) + % de conformidade calculado das respostas.
app.get('/api/checklist/checklists/:id/execucoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const checklistId = parseInt(req.params.id, 10);
    if (!Number.isFinite(checklistId)) return res.status(400).json({ error: 'ID inválido.' });
    const where = { checklistId };
    const status = String(req.query.status || '').toUpperCase();
    if (status === 'CONCLUIDA' || status === 'EM_ANDAMENTO') where.status = status;
    else if (status === 'ALERTA') where.emAlerta = true;
    const funcionarioId = parseInt(req.query.funcionarioId, 10);
    if (Number.isFinite(funcionarioId)) where.funcionarioId = funcionarioId;
    // Intervalo de datas em horário BR — brToUtcMs(y, mo0, day, h, mi) é posicional e o mês é
    // 0-indexed (mesmo contrato de Date.UTC), por isso o "- 1" no mês vindo do "YYYY-MM-DD".
    // NUNCA `new Date('YYYY-MM-DD')` cru (leria como UTC, deslocando o dia no fuso do VPS).
    const de = String(req.query.de || '').trim();
    const ate = String(req.query.ate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(de) || /^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      where.dataRef = {};
      if (/^\d{4}-\d{2}-\d{2}$/.test(de)) {
        const [y, m, d] = de.split('-').map(Number);
        where.dataRef.gte = new Date(brToUtcMs(y, m - 1, d, 0, 0));
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
        const [y, m, d] = ate.split('-').map(Number);
        where.dataRef.lte = new Date(brToUtcMs(y, m - 1, d, 23, 59));
      }
    }
    const execs = await prisma.checklistExecucao.findMany({
      where, orderBy: { iniciadaEm: 'desc' }, take: 200,
      include: { respostas: { select: { conforme: true } } },
    });
    // Nomes dos operadores (mesmo padrão do /api/checklist/execucoes) — select explícito, sem `pin`.
    const ids = [...new Set(execs.map((e) => e.funcionarioId))];
    const funcs = ids.length ? await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, apelido: true } }) : [];
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    const linhas = execs.map((e) => {
      const avaliaveis = e.respostas.filter((r) => r.conforme !== null).length;
      const conformes = e.respostas.filter((r) => r.conforme === true).length;
      const score = avaliaveis ? Math.round((conformes / avaliaveis) * 100) : null;
      return { id: e.id, dataRef: e.dataRef, funcionario: fmap.get(e.funcionarioId) || '—', funcionarioId: e.funcionarioId, status: e.status, emAlerta: e.emAlerta, score, avaliaveis, conformes, iniciadaEm: e.iniciadaEm, concluidaEm: e.concluidaEm };
    });
    res.json({ execucoes: linhas });
  } catch (e) { console.error('[checklist/historico]', e); res.status(500).json({ error: 'Erro ao carregar histórico.' }); }
});

// Estatísticas do checklist no período (KPIs, série diária, ranking de operadores/itens,
// heatmap dow×faixa). Reusa o padrão de fuso BR de brFields/brToUtcMs/venceHoje (mesmo
// usado no histórico acima e em dispararLembretesLoja, ~linha 2477) e delega o cálculo
// puro pra calcularEstatisticas (checklistEstatisticas.js).
app.get('/api/checklist/checklists/:id/estatisticas', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const checklistId = parseInt(req.params.id, 10);
    if (!Number.isFinite(checklistId)) return res.status(400).json({ error: 'ID inválido.' });
    const c = await prisma.checklist.findFirst({ where: { id: checklistId } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });

    // período: default últimos 30 dias de expediente; teto 180 dias
    const hoje = janelaExpedienteAtual().de;
    const fh = brFields(hoje.getTime());
    const parseDia = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').map(Number) : null);
    let deP = parseDia(String(req.query.de || ''));
    let ateP = parseDia(String(req.query.ate || ''));
    if (!ateP) ateP = [fh.y, fh.mo + 1, fh.day];          // brFields.mo é 0-index → +1 p/ o array [y,m,d] 1-index
    if (!deP) { const dm = new Date(Date.UTC(ateP[0], ateP[1] - 1, ateP[2] - 30)); deP = [dm.getUTCFullYear(), dm.getUTCMonth() + 1, dm.getUTCDate()]; }
    // limites BR
    const deMs = brToUtcMs(deP[0], deP[1] - 1, deP[2], 5, 0);   // 05:00 BR (início do dia de expediente)
    let ateMs = brToUtcMs(ateP[0], ateP[1] - 1, ateP[2], 5, 0);
    if (ateMs < deMs) ateMs = deMs;
    if ((ateMs - deMs) / 86400000 > 180) return res.status(400).json({ error: 'Período máximo de 180 dias.' });

    // execuções no intervalo (dataRef é sempre 05:00 BR do dia, então lte:ateMs cobre o dia `ate` sem vazar pro seguinte)
    const execs = await prisma.checklistExecucao.findMany({
      where: { checklistId, dataRef: { gte: new Date(deMs), lte: new Date(ateMs) } },
      include: { respostas: { select: { itemChave: true, conforme: true } } },
      orderBy: { dataRef: 'asc' }, take: 2000,
    });

    // nomes dos operadores (sem pin)
    const ids = [...new Set(execs.map((e) => e.funcionarioId))];
    const funcs = ids.length ? await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, apelido: true } }) : [];
    const fmap = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));

    // helper: 'YYYY-MM-DD' BR de um instante (dia de expediente ao qual o instante pertence)
    const diaStr = (ms) => { const f = brFields(ms); return `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`; };
    // deadline (ms) de um dia BR [y,m0,d] a partir do horarioLimite+tolerância; null se sem horário
    const hl = (typeof c.recorrenciaConfig?.horarioLimite === 'string') ? c.recorrenciaConfig.horarioLimite : '';
    const tol = Math.max(0, Number(c.recorrenciaConfig?.toleranciaMin) || 0);
    const mHL = /^(\d{1,2}):(\d{2})$/.exec(hl);
    const agendado = (c.recorrenciaTipo === 'DIARIA' || c.recorrenciaTipo === 'DIAS_SEMANA') && !!mHL;
    // chkDeadlineMs joga horário antes das 05:00 pra madrugada do dia seguinte (o expediente
    // do dia D vai das 05:00 de D às 05:00 de D+1) — sem isso um limite "02:00" caía antes do
    // expediente começar e TODA ocorrência nascia fora do prazo.
    const deadlineDoDia = (y, m0, d) => { const ms = mHL ? chkDeadlineMs(y, m0, d, hl) : null; return ms === null ? null : ms + tol * 60000; };

    // normalizar execuções
    const execucoes = execs.map((e) => {
      const dref = e.dataRef.getTime(); const f = brFields(dref);
      return { id: e.id, funcionarioId: e.funcionarioId, funcionario: fmap.get(e.funcionarioId) || '—', dia: diaStr(dref), iniciadaMs: e.iniciadaEm ? e.iniciadaEm.getTime() : null, concluidaMs: e.concluidaEm ? e.concluidaEm.getTime() : null, status: e.status, emAlerta: e.emAlerta, deadlineMs: deadlineDoDia(f.y, f.mo, f.day), respostas: e.respostas };
    });

    // dias do intervalo + ocorrências esperadas (itera dia a dia)
    const dias = []; const ocorrenciasEsperadas = [];
    for (let ms = deMs; ms <= ateMs; ms += 86400000) {
      const f = brFields(ms); const dstr = `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
      dias.push(dstr);
      const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
      if (agendado && venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) {
        ocorrenciasEsperadas.push({ dia: dstr, dow, horaLimite: parseInt(mHL[1], 10), deadlineMs: deadlineDoDia(f.y, f.mo, f.day) });
      }
    }

    // itensMap: chave -> título (último visto)
    const itensMap = {};
    for (const e of execs) for (const it of (Array.isArray(e.itensSnapshotJson) ? e.itensSnapshotJson : [])) if (it?.chave != null) itensMap[String(it.chave)] = it.titulo || `Item ${it.chave}`;

    const stats = calcularEstatisticas({ execucoes, ocorrenciasEsperadas, dias, tempoEstimadoMin: c.tempoEstimadoMin ?? null, itensMap, agendado });
    res.json({ periodo: { de: dias[0] || null, ate: dias[dias.length - 1] || null }, checklist: { nome: c.nome, recorrenciaTipo: c.recorrenciaTipo, horarioLimite: hl || null, tempoEstimadoMin: c.tempoEstimadoMin ?? null }, ...stats });
  } catch (e) { console.error('[checklist/estatisticas]', e); res.status(500).json({ error: 'Erro ao calcular estatísticas.' }); }
});

// Histórico geral (Painel do Checklist, reforma): ocorrências esperadas + execuções avulsas
// no período, classificadas e agregadas (KPIs do período + contagens/registros filtrados por
// status/colaborador). Mesmo padrão de fuso BR de /estatisticas acima; classificação e
// agregação são puras, delegadas a checklistHistoricoGeral.js.
const STATUS_VALIDO = (s) => STATUS.includes(s);
app.get('/api/checklist/historico-geral', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const hojeRef = janelaExpedienteAtual().de;               // 05:00 BR de hoje (dia de expediente)
    const fh = brFields(hojeRef.getTime());
    const diaStr = (ms) => { const f = brFields(ms); return `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`; };
    const hojeStr = diaStr(hojeRef.getTime());
    // período: preset (hoje/7/30/90) ou de/ate custom; teto 180 dias; nunca depois de hoje
    const preset = String(req.query.periodo || 'hoje').toLowerCase();
    const diasPreset = { hoje: 1, '7': 7, '30': 30, '90': 90 }[preset] || 1;
    const parseDia = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').map(Number) : null);
    let deP = parseDia(String(req.query.de || ''));
    let ateP = parseDia(String(req.query.ate || ''));
    if (!ateP) ateP = [fh.y, fh.mo + 1, fh.day];              // hoje (fh.mo é 0-index → +1 p/ array 1-index)
    if (!deP) { const dm = new Date(Date.UTC(ateP[0], ateP[1] - 1, ateP[2] - (diasPreset - 1))); deP = [dm.getUTCFullYear(), dm.getUTCMonth() + 1, dm.getUTCDate()]; }
    let deMs = brToUtcMs(deP[0], deP[1] - 1, deP[2], 5, 0);
    let ateMs = brToUtcMs(ateP[0], ateP[1] - 1, ateP[2], 5, 0);
    if (ateMs > hojeRef.getTime()) ateMs = hojeRef.getTime(); // não passa de hoje
    if (deMs > ateMs) deMs = ateMs;
    if ((ateMs - deMs) / 86400000 > 180) return res.status(400).json({ error: 'Período máximo de 180 dias.' });
    const agoraMs = Date.now();

    const checklists = await prisma.checklist.findMany({ where: { ativo: true } });
    const execs = await prisma.checklistExecucao.findMany({
      where: { dataRef: { gte: new Date(deMs), lte: new Date(ateMs) } },
      include: { checklist: { select: { nome: true, categoria: true } }, respostas: { select: { conforme: true } } },
      take: 5000,
    });

    // funcionários necessários: executores + atribuídos por COLABORADOR
    const idsExec = execs.map((e) => e.funcionarioId);
    const idsAtrib = checklists.filter((c) => c.atribuicaoTipo === 'COLABORADOR').flatMap((c) => c.funcionarioIds || []);
    const ids = [...new Set([...idsExec, ...idsAtrib])];
    const funcs = ids.length ? await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, apelido: true } }) : [];
    const nomeFunc = new Map(funcs.map((f) => [f.id, f.apelido || f.nome]));
    const responsavelDe = (c) => c.atribuicaoTipo === 'COLABORADOR'
      ? (c.funcionarioIds || []).map((id) => nomeFunc.get(id)).filter(Boolean)
      : (c.funcoes || []);
    const scoreDe = (respostas) => { const av = respostas.filter((r) => r.conforme !== null).length; const co = respostas.filter((r) => r.conforme === true).length; return av ? Math.round((co / av) * 100) : null; };

    const chById = new Map(checklists.map((c) => [c.id, c]));
    const execByKey = new Map();                              // `${checklistId}|${dia}` -> exec
    for (const e of execs) execByKey.set(`${e.checklistId}|${diaStr(e.dataRef.getTime())}`, e);

    const linhas = [];
    const usados = new Set();
    // 1) ocorrências esperadas (checklists agendados)
    for (const c of checklists) {
      const hl = (typeof c.recorrenciaConfig?.horarioLimite === 'string') ? c.recorrenciaConfig.horarioLimite : '';
      const mHL = /^(\d{1,2}):(\d{2})$/.exec(hl);
      const tol = Math.max(0, Number(c.recorrenciaConfig?.toleranciaMin) || 0);
      const agendado = (c.recorrenciaTipo === 'DIARIA' || c.recorrenciaTipo === 'DIAS_SEMANA');
      if (!agendado) continue;
      for (let ms = deMs; ms <= ateMs; ms += 86400000) {
        const f = brFields(ms);
        const dow = new Date(Date.UTC(f.y, f.mo, f.day)).getUTCDay();
        if (!venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) continue;
        const dia = `${f.y}-${String(f.mo + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
        const key = `${c.id}|${dia}`;
        const exec = execByKey.get(key) || null;
        if (exec) usados.add(key);
        // Mesmo tratamento de madrugada das estatísticas/lembrete (ver chkDeadlineMs).
        const dlBase = mHL ? chkDeadlineMs(f.y, f.mo, f.day, hl) : null;
        const deadlineMs = dlBase === null ? null : dlBase + tol * 60000;
        const ehPassado = dia < hojeStr;
        const status = classificarOcorrencia({ execucao: exec, ehPassado, agoraMs, deadlineMs });
        linhas.push({
          checklistId: c.id, checklistNome: c.nome, categoria: c.categoria, dia, dataRef: new Date(ms).toISOString(),
          horario: hl || null, responsavel: exec ? [nomeFunc.get(exec.funcionarioId) || '—'] : responsavelDe(c),
          funcionario: exec ? (nomeFunc.get(exec.funcionarioId) || '—') : null, funcionarioId: exec ? exec.funcionarioId : null,
          status, scorePct: exec ? scoreDe(exec.respostas) : 0, emAlerta: exec ? exec.emAlerta : false, execId: exec ? exec.id : null, esperada: true,
        });
      }
    }
    // 2) execuções reais SEM ocorrência esperada (avulsos, ou dia fora da recorrência)
    for (const e of execs) {
      const dia = diaStr(e.dataRef.getTime());
      const key = `${e.checklistId}|${dia}`;
      if (usados.has(key)) continue;
      const c = chById.get(e.checklistId);
      linhas.push({
        checklistId: e.checklistId, checklistNome: e.checklist?.nome || (c?.nome) || '—', categoria: e.checklist?.categoria || c?.categoria || '—', dia, dataRef: e.dataRef.toISOString(),
        horario: (typeof c?.recorrenciaConfig?.horarioLimite === 'string' ? c.recorrenciaConfig.horarioLimite : null),
        responsavel: [nomeFunc.get(e.funcionarioId) || '—'], funcionario: nomeFunc.get(e.funcionarioId) || '—', funcionarioId: e.funcionarioId,
        status: e.status === 'CONCLUIDA' ? 'CONCLUIDO' : 'EM_ANDAMENTO', scorePct: scoreDe(e.respostas), emAlerta: e.emAlerta, execId: e.id, esperada: false,
      });
    }

    // KPIs (só período, ignoram chips) / contagens (período + colaborador) / registros (todos os filtros)
    const { kpis } = agregar(linhas, { ativos: checklists.length });
    const fid = parseInt(req.query.funcionarioId, 10);
    const casaColab = (l) => l.funcionarioId === fid || (l.execId == null && (chById.get(l.checklistId)?.atribuicaoTipo === 'COLABORADOR') && (chById.get(l.checklistId)?.funcionarioIds || []).includes(fid));
    const linhasColab = Number.isFinite(fid) ? linhas.filter(casaColab) : linhas;
    const { contagens } = agregar(linhasColab, { ativos: checklists.length });
    const statusF = String(req.query.status || '').toUpperCase();
    const linhasFinal = STATUS_VALIDO(statusF) ? linhasColab.filter((l) => l.status === statusF) : linhasColab;
    linhasFinal.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : a.checklistNome.localeCompare(b.checklistNome)));

    res.json({ periodo: { de: diaStr(deMs), ate: diaStr(ateMs), chave: preset }, kpis, contagens, registros: linhasFinal.length, ocorrencias: linhasFinal.slice(0, 1000) });
  } catch (e) { console.error('[checklist/historico-geral]', e); res.status(500).json({ error: 'Erro ao carregar o histórico geral.' }); }
});

// Detalhe de uma execução (respostas + fotos metadata; bytes por /fotos/:id).
app.get('/api/checklist/execucoes/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const e = await prisma.checklistExecucao.findFirst({
      where: { id: parseInt(req.params.id, 10) },
      include: { respostas: true, fotos: { select: { id: true, itemChave: true } }, checklist: { select: { nome: true, categoria: true } } },
    });
    if (!e) return res.status(404).json({ error: 'Execução não encontrada.' });
    const func = await prisma.funcionario.findFirst({ where: { id: e.funcionarioId }, select: { nome: true, apelido: true } });
    const rmap = {}; for (const r of e.respostas) rmap[r.itemChave] = { valor: r.valorJson, conforme: r.conforme, observacao: r.observacao };
    const fmap = {}; for (const f of e.fotos) fmap[f.itemChave] = { id: f.id };
    res.json({ execucao: { id: e.id, checklistNome: e.checklist?.nome, categoria: e.checklist?.categoria, funcionario: func ? (func.apelido || func.nome) : '—', dataRef: e.dataRef, status: e.status, emAlerta: e.emAlerta, iniciadaEm: e.iniciadaEm, concluidaEm: e.concluidaEm, itens: e.itensSnapshotJson, respostas: rmap, fotos: fmap } });
  } catch (err) { console.error('[checklist/execucoes/:id]', err); res.status(500).json({ error: 'Erro ao carregar a execução.' }); }
});

// Bytes da foto (gestor).
app.get('/api/checklist/fotos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const foto = await prisma.checklistFoto.findFirst({ where: { id: parseInt(req.params.id, 10) }, select: { dataUrl: true } });
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });
    res.json({ dataUrl: foto.dataUrl });
  } catch (err) { console.error('[checklist/fotos]', err); res.status(500).json({ error: 'Erro ao carregar a foto.' }); }
});

// ---- Notificações (Fatia 3a): config, destinatários, histórico e prévia do alerta imediato

// Config de notificações (cria on-demand). Admin, dentro do gate → extension injeta empresaId.
async function garantirNotifConfig() {
  let c = await prisma.checklistNotificacaoConfig.findFirst();
  if (!c) c = await prisma.checklistNotificacaoConfig.create({ data: {} });
  return c;
}
app.get('/api/checklist/notificacoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const config = await garantirNotifConfig();
    const destinatarios = await prisma.checklistDestinatario.findMany({ orderBy: { nome: 'asc' } });
    res.json({ config, destinatarios });
  } catch (err) { console.error('[checklist/notificacoes GET]', err); res.status(500).json({ error: 'Erro ao carregar notificações.' }); }
});
app.put('/api/checklist/notificacoes/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const atual = await garantirNotifConfig();
    const minutosBrutos = Number(req.body?.lembreteMinutosAntes);
    const lembreteMinutosAntes = Number.isFinite(minutosBrutos) ? Math.max(5, Math.min(240, Math.round(minutosBrutos))) : 30;
    const config = await prisma.checklistNotificacaoConfig.update({
      where: { id: atual.id },
      data: {
        alertaImediatoAtivo: req.body?.alertaImediatoAtivo !== false && !!req.body?.alertaImediatoAtivo,
        lembreteAtivo: req.body?.lembreteAtivo !== false && !!req.body?.lembreteAtivo,
        lembreteTemplate: req.body?.lembreteTemplate == null ? '' : String(req.body.lembreteTemplate).slice(0, 600),
        lembreteMinutosAntes,
      },
    });
    res.json({ ok: true, config });
  } catch (err) { console.error('[checklist/notificacoes config PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
app.post('/api/checklist/notificacoes/destinatarios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = req.body?.nome == null ? '' : String(req.body.nome).trim().slice(0, 80);
    const whatsapp = req.body?.whatsapp == null ? '' : String(req.body.whatsapp).trim().slice(0, 30);
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' });
    if (soDigitos(whatsapp).length < 10) return res.status(400).json({ error: 'Informe o WhatsApp com DDD.' });
    const tipo = req.body?.tipo === 'ATRASO' ? 'ATRASO' : 'IMEDIATO';
    const dest = await prisma.checklistDestinatario.create({ data: { nome, whatsapp, tipo } });
    res.status(201).json({ ok: true, destinatario: dest });
  } catch (err) { console.error('[checklist/destinatarios POST]', err); res.status(500).json({ error: 'Erro ao adicionar.' }); }
});
app.put('/api/checklist/notificacoes/destinatarios/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.checklistDestinatario.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Destinatário não encontrado.' });
    const data = {};
    if (req.body?.nome !== undefined) data.nome = String(req.body.nome).trim().slice(0, 80) || atual.nome;
    if (req.body?.whatsapp !== undefined) data.whatsapp = String(req.body.whatsapp).trim().slice(0, 30) || atual.whatsapp;
    if (req.body?.ativo !== undefined) data.ativo = req.body.ativo !== false;
    const dest = await prisma.checklistDestinatario.update({ where: { id }, data });
    res.json({ ok: true, destinatario: dest });
  } catch (err) { console.error('[checklist/destinatarios PUT]', err); res.status(500).json({ error: 'Erro ao salvar.' }); }
});
app.delete('/api/checklist/notificacoes/destinatarios/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.checklistDestinatario.delete({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/destinatarios DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});
app.get('/api/checklist/notificacoes/historico', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json({ historico: await prisma.checklistNotificacaoLog.findMany({ orderBy: { criadoEm: 'desc' }, take: 50 }) }); }
  catch (err) { console.error('[checklist/notificacoes historico]', err); res.status(500).json({ error: 'Erro ao carregar o histórico.' }); }
});
app.get('/api/checklist/notificacoes/previa', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const loja = await getEmpresa();
    const msg = montarMensagemAlerta({ lojaNome: loja?.nome || 'Sua loja', checklistNome: 'Fechamento Cozinha', funcionarioNome: 'Rafaely', quando: '22:10', itensForaDoPadrao: ['Temperatura do freezer', 'EPIs sendo utilizados'] });
    res.json({ previa: msg });
  } catch (err) { console.error('[checklist/notificacoes previa]', err); res.status(500).json({ error: 'Erro ao gerar prévia.' }); }
});
app.get('/api/checklist/notificacoes/lembrete/previa', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    // `template` (opcional) = o RASCUNHO que o gestor está digitando na tela. Sem ele a prévia
    // mostrava só o template já SALVO, então editar o texto e clicar em "Ver prévia" exibia a
    // versão antiga — inútil justamente na hora de conferir a mudança. String vazia é rascunho
    // legítimo (montarMensagemLembrete cai no padrão), por isso testa por `undefined`.
    const rascunho = req.query.template;
    const config = rascunho === undefined ? await garantirNotifConfig() : null;
    const template = rascunho === undefined ? config.lembreteTemplate : String(rascunho).slice(0, 2000);
    const previa = montarMensagemLembrete(template, { checklist: 'Abertura Cozinha', horario: '09:00', responsavel: 'Diego Alves' });
    res.json({ previa });
  } catch (err) { console.error('[checklist/notificacoes lembrete previa]', err); res.status(500).json({ error: 'Erro ao gerar prévia.' }); }
});

// WhatsApp normalizado = só dígitos (para deduplicar por contato no mesmo dia)
function normalizarWhatsapp(v) {
  return String(v ?? '').replace(/\D/g, '');
}

// ============================================================
// Avaliação (Marketing) — campanhas (link/QR) + respostas de clientes
// ============================================================
async function gerarTokenAvaliacao() {
  for (let i = 0; i < 6; i++) {
    const t = randomBytes(9).toString('base64url');
    const existe = await prisma.avaliacaoCampanha.findUnique({ where: { tokenPublico: t }, select: { id: true } });
    if (!existe) return t;
  }
  return randomBytes(12).toString('base64url');
}

// Limpa a lista de categorias: trim, remove vazias, deduplica, limita
function limparCategorias(arr) {
  if (!Array.isArray(arr)) return [];
  const vistos = new Set();
  const out = [];
  for (const c of arr) {
    const v = String(c ?? '').trim().slice(0, 40);
    if (!v) continue;
    const chave = v.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

function notaValida(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

// Métricas do relatório a partir das respostas e das categorias da campanha
function metricasAvaliacao(respostas, categorias) {
  const total = respostas.length;
  const somaGeral = respostas.reduce((s, r) => s + (Number(r.notaGeral) || 0), 0);
  const mediaGeral = total > 0 ? Math.round((somaGeral / total) * 10) / 10 : null;
  const distribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of respostas) {
    const n = Number(r.notaGeral);
    if (distribuicao[n] !== undefined) distribuicao[n]++;
  }
  const porCategoria = (categorias ?? []).map((cat) => {
    let soma = 0;
    let n = 0;
    for (const r of respostas) {
      const v = Number(r.notasCategorias?.[cat]);
      if (Number.isFinite(v) && v >= 1) {
        soma += v;
        n++;
      }
    }
    return { categoria: cat, media: n > 0 ? Math.round((soma / n) * 10) / 10 : null, respostas: n };
  });
  return { total, mediaGeral, distribuicao, porCategoria };
}

// ----- Admin -----
app.get('/api/avaliacao/campanhas', async (req, res) => {
  try {
    const campanhas = await prisma.avaliacaoCampanha.findMany({
      orderBy: { criadoEm: 'desc' },
      include: { respostas: { select: { notaGeral: true } } }
    });
    res.json(
      campanhas.map((c) => {
        const total = c.respostas.length;
        const soma = c.respostas.reduce((s, r) => s + (Number(r.notaGeral) || 0), 0);
        return {
          id: c.id,
          nome: c.nome,
          tokenPublico: c.tokenPublico,
          ativa: c.ativa,
          categorias: c.categorias,
          criadoEm: c.criadoEm,
          totalRespostas: total,
          mediaGeral: total > 0 ? Math.round((soma / total) * 10) / 10 : null
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar campanhas' });
  }
});

app.post('/api/avaliacao/campanhas', async (req, res) => {
  try {
    const { nome, categorias } = req.body ?? {};
    const nomeLimpo = String(nome ?? '').trim();
    if (!nomeLimpo) return res.status(400).json({ error: 'Informe o nome da campanha.' });
    const cats = limparCategorias(categorias);
    const tokenPublico = await gerarTokenAvaliacao();
    const c = await prisma.avaliacaoCampanha.create({ data: { nome: nomeLimpo, categorias: cats, tokenPublico } });
    res.status(201).json(c);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar campanha' });
  }
});

app.put('/api/avaliacao/campanhas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.avaliacaoCampanha.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Campanha não encontrada' });
    const { nome, categorias, ativa } = req.body ?? {};
    const data = {};
    if (nome !== undefined) {
      const v = String(nome).trim();
      if (!v) return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
      data.nome = v;
    }
    if (categorias !== undefined) data.categorias = limparCategorias(categorias);
    if (ativa !== undefined) data.ativa = !!ativa;
    const c = await prisma.avaliacaoCampanha.update({ where: { id }, data });
    res.json(c);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar campanha' });
  }
});

app.delete('/api/avaliacao/campanhas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.avaliacaoCampanha.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Campanha não encontrada' });
    await prisma.avaliacaoCampanha.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao excluir campanha' });
  }
});

app.get('/api/avaliacao/campanhas/:id/relatorio', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const campanha = await prisma.avaliacaoCampanha.findUnique({ where: { id } });
    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada' });
    const respostas = await prisma.avaliacaoResposta.findMany({
      where: { campanhaId: id },
      orderBy: { criadoEm: 'desc' }
    });
    res.json({
      campanha: { id: campanha.id, nome: campanha.nome, categorias: campanha.categorias, ativa: campanha.ativa, tokenPublico: campanha.tokenPublico },
      resumo: metricasAvaliacao(respostas, campanha.categorias),
      respostas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao gerar relatório' });
  }
});

// ----- Público (cliente, via token do QR) -----
app.get('/api/public/avaliacao/:token', async (req, res) => {
  try {
    const campanha = await prisma.avaliacaoCampanha.findUnique({
      where: { tokenPublico: String(req.params.token) },
      select: { nome: true, categorias: true, ativa: true, empresaId: true }
    });
    if (!campanha) return res.status(404).json({ error: 'Avaliação não encontrada' });
    const empresa = await prisma.empresa.findUnique({ where: { id: campanha.empresaId }, select: { nome: true } }).catch(() => null);
    res.json({ empresa: { nome: (empresa?.nome ?? '').trim() || 'Hamburgueria' }, campanha });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao carregar avaliação' });
  }
});

app.post('/api/public/avaliacao/:token', async (req, res) => {
  try {
    const campanha = await prisma.avaliacaoCampanha.findUnique({
      where: { tokenPublico: String(req.params.token) },
      select: { id: true, ativa: true, categorias: true, empresaId: true }
    });
    if (!campanha) return res.status(404).json({ error: 'Avaliação não encontrada' });
    if (!campanha.ativa) return res.status(409).json({ error: 'Esta avaliação não está mais recebendo respostas.' });

    const { notaGeral, notasCategorias, comentario, nome, whatsapp, email } = req.body ?? {};
    if (!notaValida(notaGeral)) return res.status(400).json({ error: 'Dê uma nota geral de 1 a 5.' });
    const nomeLimpo = String(nome ?? '').trim();
    if (!nomeLimpo) return res.status(400).json({ error: 'Informe seu nome.' });
    const whatsappLimpo = normalizarWhatsapp(whatsapp);
    if (!whatsappLimpo) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });
    const emailLimpo = String(email ?? '').trim();
    if (emailLimpo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    // Só aceita notas das categorias da campanha, validadas 1..5
    const notas = {};
    if (notasCategorias && typeof notasCategorias === 'object') {
      for (const cat of campanha.categorias) {
        const v = notasCategorias[cat];
        if (v !== undefined && v !== null && v !== '' && notaValida(v)) notas[cat] = Number(v);
      }
    }
    const resp = await prisma.avaliacaoResposta.create({
      data: {
        empresaId: campanha.empresaId,
        campanhaId: campanha.id,
        notaGeral: Number(notaGeral),
        notasCategorias: notas,
        comentario: String(comentario ?? '').trim().slice(0, 2000) || null,
        nome: nomeLimpo,
        whatsapp: whatsappLimpo,
        email: emailLimpo || null
      }
    });
    res.status(201).json({ success: true, id: resp.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao enviar avaliação' });
  }
});

// ============================================================
// Marketing › Programa de Indicação (referral)
// ============================================================
// Alfabeto sem caracteres ambíguos (sem O/0/I/1) — código legível no balcão.
const CODIGO_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function codigoAleatorio(len) {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += CODIGO_ALFABETO[b[i] % CODIGO_ALFABETO.length];
  return s;
}
// Token secreto longo (links do atendente/painel/seja-promotor) — não adivinhável.
function tokenSecreto() {
  return randomBytes(24).toString('base64url');
}
// Código curto único GLOBAL (via $queryRaw, fora do escopo de tenant) — a unique
// do banco é a garantia final; este loop evita colisão no dia a dia.
async function gerarCodigoUnico(tabela, len) {
  for (let i = 0; i < 8; i++) {
    const c = codigoAleatorio(len);
    const rows = await prisma.$queryRawUnsafe(`SELECT 1 FROM "${tabela}" WHERE "codigo" = $1 LIMIT 1`, c);
    if (!rows.length) return c;
  }
  return codigoAleatorio(len + 2);
}
// renomeado no PDV: gerarCodigoCupom já é o helper síncrono do Grupo VIP (cardapioCupom.js)
const gerarCodigoCupomIndicacao = () => gerarCodigoUnico('Cupom', 8);
const gerarCodigoPromotor = () => gerarCodigoUnico('Promotor', 6);

async function getOrCreateIndicacaoConfig() {
  const existente = await prisma.indicacaoConfig.findFirst();
  if (existente) return existente;
  return prisma.indicacaoConfig.create({ data: { promotorToken: tokenSecreto(), atendenteToken: tokenSecreto() } });
}
const nomeEmpresaPorId = async (empresaId) => {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }).catch(() => null);
  return (e?.nome ?? '').trim() || 'Hamburgueria';
};

// Ponte HUB→CW (a chave do CW mora no HUB). Sem CW / falha ⇒ { conectado:false }.

async function criarCupomCardapioWeb(clienteId, coupon) {
  if (!clienteId) return { conectado: false };
  try {
    const r = await fetch(`${HUB_API_URL}/internal/cardapio-cupom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcTokenHub()}` },
      body: JSON.stringify({ clienteId, coupon }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('[cw-cupom]', r.status, data?.error, data?.detalhe); return { conectado: false, erro: true, error: data?.error, detalhe: data?.detalhe }; }
    return data; // { conectado, coupon }
  } catch (e) { console.error('[cw-cupom]', e?.message); return { conectado: false, erro: true }; }
}

async function listarCuponsCardapioWeb(clienteId) {
  if (!clienteId) return { conectado: false };
  try {
    const r = await fetch(`${HUB_API_URL}/internal/cardapio-cupons?clienteId=${encodeURIComponent(clienteId)}`, {
      headers: { Authorization: `Bearer ${svcTokenHub()}` },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('[cw-cupons]', r.status, data?.error); return { conectado: false, erro: true }; }
    return data; // { conectado, coupons }
  } catch (e) { console.error('[cw-cupons]', e?.message); return { conectado: false, erro: true }; }
}

// clienteId (do HUB) da loja ativa — para as pontes de Cardápio Web.
async function clienteIdDaLojaAtual() {
  const e = await prisma.empresa.findUnique({ where: { id: getEmpresaIdAtual() }, select: { clienteId: true } }).catch(() => null);
  return e?.clienteId || null;
}

// URL do webhook do CW da loja (o HUB gera com base no clienteId).
async function webhookUrlCardapioWeb(clienteId) {
  if (!clienteId) return { conectado: false };
  try {
    const r = await fetch(`${HUB_API_URL}/internal/cardapio-webhook-url?clienteId=${encodeURIComponent(clienteId)}`, { headers: { Authorization: `Bearer ${svcTokenHub()}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.url) return { conectado: false };
    return { conectado: true, url: data.url };
  } catch (e) { console.error('[cw-webhook-url]', e?.message); return { conectado: false }; }
}

// Ativa/desativa um cupom no CW (via HUB). Retorna a resposta (ok/erro).
async function setStatusCupomCardapioWeb(clienteId, couponId, active) {
  if (!clienteId || !couponId) return { ok: false };
  try {
    const r = await fetch(`${HUB_API_URL}/internal/cardapio-cupom-desativar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcTokenHub()}` },
      body: JSON.stringify({ clienteId, couponId, active: !!active }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('[cw-cupom-status]', r.status, data?.error); return { ok: false, error: data?.error }; }
    return data;
  } catch (e) { console.error('[cw-cupom-status]', e?.message); return { ok: false }; }
}
// Uso único já validado → desativa (best-effort).
const desativarCupomCardapioWeb = (clienteId, couponId) => setStatusCupomCardapioWeb(clienteId, couponId, false);

// ---------- PÚBLICO: cadastro de promotor ----------
app.get('/api/public/indicacao/promotor/:token', async (req, res) => {
  try {
    const config = await prisma.indicacaoConfig.findUnique({ where: { promotorToken: String(req.params.token) }, select: { empresaId: true, ativo: true, bannerDataUrl: true, cupomEmoji: true, cupomAmigoTitulo: true, cupomAmigoTipoDesconto: true, cupomAmigoValor: true, cupomAmigoPercentual: true } });
    if (!config) return res.status(404).json({ error: 'Programa não encontrado' });
    const empr = await prisma.empresa.findUnique({ where: { id: config.empresaId }, select: { nome: true, logoDataUrl: true } }).catch(() => null);
    // Recompensas ativas p/ mostrar os benefícios (escopado por loja — rota pública sem tenantStore).
    const recompensas = config.ativo
      ? await prisma.recompensaTier.findMany({ where: { ativo: true, empresaId: config.empresaId }, orderBy: { meta: 'asc' }, take: 12, select: { meta: true, titulo: true, emoji: true, tipo: true, destinos: true, descricao: true } })
      : [];
    res.json({
      empresa: { nome: (empr?.nome ?? '').trim() || 'Hamburgueria', logo: empr?.logoDataUrl ?? null },
      ativo: config.ativo,
      banner: config.bannerDataUrl ?? null,
      recompensas,
      cupomAmigo: { titulo: config.cupomAmigoTitulo, emoji: config.cupomEmoji ?? '🎁', tipoDesconto: config.cupomAmigoTipoDesconto || 'percent_discount', valor: config.cupomAmigoValor ?? config.cupomAmigoPercentual },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/public/indicacao/promotor/:token', async (req, res) => {
  try {
    const config = await prisma.indicacaoConfig.findUnique({ where: { promotorToken: String(req.params.token) }, select: { empresaId: true, ativo: true } });
    if (!config) return res.status(404).json({ error: 'Programa não encontrado' });
    if (!config.ativo) return res.status(409).json({ error: 'O programa de indicação está pausado no momento.' });
    const nome = String(req.body?.nome ?? '').trim();
    if (!nome) return res.status(400).json({ error: 'Informe seu nome.' });
    const whatsapp = normalizarWhatsapp(req.body?.whatsapp);
    if (!whatsapp) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });

    const promotor = await tenantStore.run({ empresaId: config.empresaId }, async () => {
      const existente = await prisma.promotor.findFirst({ where: { whatsapp } });
      if (existente) return existente; // idempotente: mesmo whatsapp reaproveita o promotor
      const codigo = await gerarCodigoPromotor();
      try {
        return await prisma.promotor.create({ data: { nome, whatsapp, codigo, painelToken: tokenSecreto(), origem: 'PUBLICO' } });
      } catch (e) {
        if (e?.code === 'P2002') return prisma.promotor.findFirst({ where: { whatsapp } });
        throw e;
      }
    });
    res.status(201).json({ nome: promotor.nome, codigo: promotor.codigo, painelToken: promotor.painelToken });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- PÚBLICO: cadastro do amigo (resgata o cupom) ----------
app.get('/api/public/indicacao/i/:codigo', async (req, res) => {
  try {
    const promotor = await prisma.promotor.findUnique({ where: { codigo: String(req.params.codigo) }, select: { nome: true, status: true, empresaId: true } });
    if (!promotor || promotor.status !== 'ATIVO') return res.status(404).json({ error: 'Link inválido ou expirado' });
    const config = await prisma.indicacaoConfig.findUnique({ where: { empresaId: promotor.empresaId }, select: { ativo: true, cupomAmigoTitulo: true, cupomEmoji: true, cupomAmigoTipoDesconto: true, cupomAmigoValor: true, cupomAmigoPercentual: true, bannerDataUrl: true, cupomCorTipo: true, cupomCor1: true, cupomCor2: true, botaoCor: true, campoEmail: true, campoNascimento: true } });
    if (!config || !config.ativo) return res.status(409).json({ error: 'O programa de indicação está pausado no momento.' });
    const empr = await prisma.empresa.findUnique({ where: { id: promotor.empresaId }, select: { nome: true, logoDataUrl: true } }).catch(() => null);
    res.json({
      empresa: { nome: (empr?.nome ?? '').trim() || 'Hamburgueria', logo: empr?.logoDataUrl ?? null },
      promotor: { nome: promotor.nome },
      cupom: { titulo: config.cupomAmigoTitulo, emoji: config.cupomEmoji ?? '🎁', tipoDesconto: config.cupomAmigoTipoDesconto || 'percent_discount', valor: config.cupomAmigoValor ?? config.cupomAmigoPercentual },
      banner: config.bannerDataUrl ?? null,
      visual: { cupomCorTipo: config.cupomCorTipo, cupomCor1: config.cupomCor1, cupomCor2: config.cupomCor2, botaoCor: config.botaoCor },
      campos: { email: config.campoEmail, nascimento: config.campoNascimento },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/public/indicacao/i/:codigo', async (req, res) => {
  try {
    const promotor = await prisma.promotor.findUnique({ where: { codigo: String(req.params.codigo) }, select: { id: true, status: true, whatsapp: true, empresaId: true } });
    if (!promotor || promotor.status !== 'ATIVO') return res.status(404).json({ error: 'Link inválido ou expirado' });
    const config = await prisma.indicacaoConfig.findUnique({ where: { empresaId: promotor.empresaId }, select: { ativo: true, cupomAmigoTitulo: true, cupomAmigoDestino: true, cupomAmigoPercentual: true, cupomAmigoTipoDesconto: true, cupomAmigoValor: true, cupomAmigoTipos: true, campoEmail: true, campoNascimento: true } });
    if (!config || !config.ativo) return res.status(409).json({ error: 'O programa de indicação está pausado no momento.' });
    const nome = String(req.body?.nome ?? '').trim();
    if (!nome) return res.status(400).json({ error: 'Informe seu nome.' });
    const whatsapp = normalizarWhatsapp(req.body?.whatsapp);
    if (!whatsapp) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });
    if (whatsapp === promotor.whatsapp) return res.status(409).json({ error: 'Você não pode usar o seu próprio link de indicação.' });
    const email = String(req.body?.email ?? '').trim().slice(0, 160) || null;
    let nascimento = null;
    const nasc = String(req.body?.nascimento ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(nasc)) { const d = new Date(nasc + 'T00:00:00Z'); if (!isNaN(d.getTime())) nascimento = d; }
    if (config.campoEmail === 'obrigatorio' && !email) return res.status(400).json({ error: 'Informe seu e-mail.' });
    if (config.campoNascimento === 'obrigatorio' && !nascimento) return res.status(400).json({ error: 'Informe sua data de nascimento.' });

    const resultado = await tenantStore.run({ empresaId: promotor.empresaId }, async () => {
      const existente = await prisma.indicacao.findFirst({ where: { promotorId: promotor.id, amigoWhatsapp: whatsapp }, include: { cupom: true } });
      if (existente?.cupom) return { cupom: existente.cupom, repetido: true, cw: existente.cupom.cwCouponId != null };
      const codigo = await gerarCodigoCupomIndicacao();
      // Cria o cupom real no Cardápio Web (se a loja tiver CW): código único, uso
      // único, X% (config) só p/ novos clientes. Falha → segue com a baixa manual.
      const empresa = await prisma.empresa.findUnique({ where: { id: promotor.empresaId }, select: { clienteId: true } }).catch(() => null);
      const tipoDesc = config.cupomAmigoTipoDesconto || 'percent_discount';
      const valorDesc = tipoDesc === 'free_shipping' ? null : (config.cupomAmigoValor ?? config.cupomAmigoPercentual ?? 10);
      const orderTypes = Array.isArray(config.cupomAmigoTipos) ? config.cupomAmigoTipos : [];
      const destinoInterno = orderTypes.includes('delivery') && !orderTypes.includes('onsite') ? 'DELIVERY' : (config.cupomAmigoDestino || 'SALAO');
      let cwCouponId = null;
      if (empresa?.clienteId) {
        const cw = await criarCupomCardapioWeb(empresa.clienteId, {
          code: codigo, name: config.cupomAmigoTitulo, type: tipoDesc, value: valorDesc,
          active: true, use_limit: 1, new_customers_only: true, customer_multi_use: false,
          ...(orderTypes.length ? { available_order_types: orderTypes } : {}),
        });
        if (cw?.conectado && cw?.coupon) cwCouponId = cw.coupon.id ?? null;
      }
      return prisma.$transaction(async (tx) => {
        const ind = await tx.indicacao.create({ data: { promotorId: promotor.id, amigoNome: nome, amigoWhatsapp: whatsapp, amigoEmail: email, amigoNascimento: nascimento, status: 'PENDENTE' } });
        const cupom = await tx.cupom.create({ data: { codigo, tipo: 'INDICACAO', titulo: config.cupomAmigoTitulo, destino: destinoInterno, indicacaoId: ind.id, cwCouponId } });
        return { cupom, repetido: false, cw: cwCouponId != null };
      });
    });
    res.status(201).json({ codigo: resultado.cupom.codigo, titulo: resultado.cupom.titulo, repetido: resultado.repetido, cw: resultado.cw, tipoDesconto: config.cupomAmigoTipoDesconto || 'percent_discount', valor: config.cupomAmigoValor ?? config.cupomAmigoPercentual });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Este WhatsApp já resgatou o cupom deste promotor.' });
    console.error(err); res.status(500).json({ error: 'Erro interno' });
  }
});

// ---------- PÚBLICO: painel do promotor (token secreto) ----------
app.get('/api/public/indicacao/painel/:painelToken', async (req, res) => {
  try {
    const promotor = await prisma.promotor.findUnique({ where: { painelToken: String(req.params.painelToken) }, select: { id: true, nome: true, codigo: true, empresaId: true } });
    if (!promotor) return res.status(404).json({ error: 'Painel não encontrado' });
    const dados = await tenantStore.run({ empresaId: promotor.empresaId }, async () => {
      const validadas = await prisma.indicacao.count({ where: { promotorId: promotor.id, status: 'VALIDADA' } });
      const pendentes = await prisma.indicacao.count({ where: { promotorId: promotor.id, status: 'PENDENTE' } });
      const tiers = await prisma.recompensaTier.findMany({ where: { ativo: true }, orderBy: { meta: 'asc' } });
      const recompensas = await prisma.cupom.findMany({ where: { promotorId: promotor.id, tipo: 'RECOMPENSA' }, orderBy: { criadoEm: 'desc' }, select: { codigo: true, titulo: true, destino: true, status: true } });
      const proxima = tiers.find((t) => t.meta > validadas) || null;
      return {
        validadas, pendentes,
        proxima: proxima ? { meta: proxima.meta, titulo: proxima.titulo, faltam: proxima.meta - validadas } : null,
        tiers: tiers.map((t) => ({ meta: t.meta, titulo: t.titulo, destino: t.destino, atingido: validadas >= t.meta })),
        recompensas,
      };
    });
    const cfg = await prisma.indicacaoConfig.findUnique({ where: { empresaId: promotor.empresaId }, select: { bannerDataUrl: true } }).catch(() => null);
    res.json({ empresa: { nome: await nomeEmpresaPorId(promotor.empresaId) }, promotor: { nome: promotor.nome, codigo: promotor.codigo }, banner: cfg?.bannerDataUrl ?? null, ...dados });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- PÚBLICO: atendente (token secreto) — buscar e dar baixa ----------
app.get('/api/public/indicacao/atendente/:token/cupom', async (req, res) => {
  try {
    const config = await prisma.indicacaoConfig.findUnique({ where: { atendenteToken: String(req.params.token) }, select: { empresaId: true } });
    if (!config) return res.status(404).json({ error: 'Acesso inválido' });
    const codigo = String(req.query.codigo ?? '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Informe um código.' });
    const cupom = await prisma.cupom.findFirst({ where: { codigo, empresaId: config.empresaId }, include: { promotor: { select: { nome: true } }, indicacao: { select: { amigoNome: true } } } });
    if (!cupom) return res.status(404).json({ error: 'Cupom não encontrado nesta loja.' });
    res.json({
      codigo: cupom.codigo, tipo: cupom.tipo, titulo: cupom.titulo, destino: cupom.destino, status: cupom.status,
      usadoEm: cupom.usadoEm, usadoPor: cupom.usadoPor,
      para: cupom.tipo === 'RECOMPENSA' ? (cupom.promotor?.nome ?? '—') : (cupom.indicacao?.amigoNome ?? '—'),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// Núcleo da baixa: marca o cupom USADO e, se INDICACAO, valida a indicação
// (PENDENTE→VALIDADA), recomputa validadas e concede marcos novos (idempotente via
// unique). Reutilizado pela baixa manual (atendente) E pela auto-validação (CW).
async function processarBaixaCupom(tx, cupom, usadoPor, valorPedido = null) {
  await tx.cupom.update({ where: { id: cupom.id }, data: { status: 'USADO', usadoEm: new Date(), usadoPor: usadoPor ?? null, ...(valorPedido != null ? { valorPedido } : {}) } });
  const novasRecompensas = [];
  if (cupom.tipo === 'INDICACAO' && cupom.indicacaoId) {
    const ind = await tx.indicacao.findUnique({ where: { id: cupom.indicacaoId } });
    if (ind && ind.status === 'PENDENTE') await tx.indicacao.update({ where: { id: ind.id }, data: { status: 'VALIDADA', validadoEm: new Date() } });
    if (ind) {
      const validadas = await tx.indicacao.count({ where: { promotorId: ind.promotorId, status: 'VALIDADA' } });
      const tiers = await tx.recompensaTier.findMany({ where: { ativo: true, meta: { lte: validadas } }, orderBy: { meta: 'asc' } });
      const jaConcedidos = await tx.cupom.findMany({ where: { promotorId: ind.promotorId, tipo: 'RECOMPENSA' }, select: { recompensaTierId: true } });
      const concedidos = new Set(jaConcedidos.map((c) => c.recompensaTierId));
      const paraConceder = tiers.filter((t) => !concedidos.has(t.id));
      if (paraConceder.length) {
        const dados = [];
        for (const t of paraConceder) dados.push({ codigo: await gerarCodigoCupomIndicacao(), tipo: 'RECOMPENSA', titulo: t.titulo, destino: t.destino, promotorId: ind.promotorId, recompensaTierId: t.id });
        await tx.cupom.createMany({ data: dados, skipDuplicates: true });
        const criados = await tx.cupom.findMany({ where: { promotorId: ind.promotorId, tipo: 'RECOMPENSA', recompensaTierId: { in: paraConceder.map((t) => t.id) } }, select: { codigo: true, titulo: true, destino: true } });
        novasRecompensas.push(...criados);
      }
    }
  }
  return novasRecompensas;
}

app.post('/api/public/indicacao/atendente/:token/baixa', async (req, res) => {
  try {
    const config = await prisma.indicacaoConfig.findUnique({ where: { atendenteToken: String(req.params.token) }, select: { empresaId: true } });
    if (!config) return res.status(404).json({ error: 'Acesso inválido' });
    const codigo = String(req.body?.codigo ?? '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Informe um código.' });
    const usadoPor = String(req.body?.usadoPor ?? '').trim().slice(0, 80) || null;

    const out = await tenantStore.run({ empresaId: config.empresaId }, () => prisma.$transaction(async (tx) => {
      const cupom = await tx.cupom.findFirst({ where: { codigo } });
      if (!cupom) throw { http: 404, msg: 'Cupom não encontrado nesta loja.' };
      if (cupom.status === 'USADO') throw { http: 409, msg: 'Este cupom já foi utilizado.' };
      if (cupom.status === 'CANCELADO') throw { http: 409, msg: 'Este cupom foi cancelado.' };
      const novasRecompensas = await processarBaixaCupom(tx, cupom, usadoPor);
      return { tipo: cupom.tipo, titulo: cupom.titulo, destino: cupom.destino, novasRecompensas, cwCouponId: cupom.cwCouponId };
    }));
    if (out.cwCouponId) {
      const emp = await prisma.empresa.findUnique({ where: { id: config.empresaId }, select: { clienteId: true } }).catch(() => null);
      if (emp?.clienteId) await desativarCupomCardapioWeb(emp.clienteId, out.cwCouponId);
    }
    const { cwCouponId, ...pub } = out;
    res.json({ success: true, ...pub });
  } catch (err) {
    if (err && err.http) return res.status(err.http).json({ error: err.msg });
    console.error(err); res.status(500).json({ error: 'Erro interno ao dar baixa' });
  }
});

// ---------- ADMIN: configuração ----------
app.get('/api/indicacao/config', async (req, res) => {
  try {
    const config = await getOrCreateIndicacaoConfig();
    let loja = null;
    const empresaId = getEmpresaIdAtual();
    if (empresaId != null) {
      const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true } }).catch(() => null);
      loja = { nome: (emp?.nome ?? '').trim() || 'Hamburgueria', logo: emp?.logoDataUrl ?? null };
    }
    res.json({ ...config, loja });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/indicacao/config', async (req, res) => {
  try {
    const config = await getOrCreateIndicacaoConfig();
    const { ativo, cupomAmigoTitulo, cupomEmoji, cupomAmigoDestino, cupomAmigoPercentual, cupomAmigoTipoDesconto, cupomAmigoValor, cupomAmigoTipos, bannerDataUrl,
      cupomCorTipo, cupomCor1, cupomCor2, botaoCor, campoEmail, campoNascimento } = req.body ?? {};
    const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s));
    const data = {};
    if (ativo !== undefined) data.ativo = !!ativo;
    if (cupomAmigoTitulo !== undefined) { const v = String(cupomAmigoTitulo).trim(); if (!v) return res.status(400).json({ error: 'O título do cupom não pode ficar vazio.' }); data.cupomAmigoTitulo = v.slice(0, 120); }
    if (cupomEmoji !== undefined) data.cupomEmoji = String(cupomEmoji).trim().slice(0, 16);
    if (cupomAmigoDestino !== undefined) { if (!['SALAO', 'DELIVERY'].includes(cupomAmigoDestino)) return res.status(400).json({ error: 'Destino inválido' }); data.cupomAmigoDestino = cupomAmigoDestino; }
    if (cupomAmigoPercentual !== undefined) { const p = Number(cupomAmigoPercentual); if (!Number.isInteger(p) || p <= 0 || p > 100) return res.status(400).json({ error: 'Percentual inválido (1 a 100).' }); data.cupomAmigoPercentual = p; }
    if (cupomAmigoTipoDesconto !== undefined) { if (!['percent_discount', 'flat_discount', 'free_shipping'].includes(cupomAmigoTipoDesconto)) return res.status(400).json({ error: 'Tipo de desconto inválido' }); data.cupomAmigoTipoDesconto = cupomAmigoTipoDesconto; }
    if (cupomAmigoValor !== undefined) { if (cupomAmigoValor === null || cupomAmigoValor === '') data.cupomAmigoValor = null; else { const v = Number(cupomAmigoValor); if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: 'Valor inválido' }); data.cupomAmigoValor = v; } }
    if (cupomAmigoTipos !== undefined) { const perm = ['delivery', 'takeout', 'onsite']; data.cupomAmigoTipos = Array.isArray(cupomAmigoTipos) ? [...new Set(cupomAmigoTipos.filter((t) => perm.includes(t)))] : []; }
    if (bannerDataUrl !== undefined) {
      if (!bannerDataUrl) data.bannerDataUrl = null;
      else { const s = String(bannerDataUrl); if (s.length > 4_500_000) return res.status(400).json({ error: 'Banner muito grande. Use uma imagem de até ~3 MB.' }); data.bannerDataUrl = s; }
    }
    if (cupomCorTipo !== undefined) { if (!['solido', 'gradiente'].includes(cupomCorTipo)) return res.status(400).json({ error: 'Tipo de cor inválido' }); data.cupomCorTipo = cupomCorTipo; }
    if (cupomCor1 !== undefined) { if (!isHex(cupomCor1)) return res.status(400).json({ error: 'Cor inválida' }); data.cupomCor1 = cupomCor1; }
    if (cupomCor2 !== undefined) { if (!isHex(cupomCor2)) return res.status(400).json({ error: 'Cor inválida' }); data.cupomCor2 = cupomCor2; }
    if (botaoCor !== undefined) { if (!isHex(botaoCor)) return res.status(400).json({ error: 'Cor inválida' }); data.botaoCor = botaoCor; }
    if (campoEmail !== undefined) { if (!['nao', 'opcional', 'obrigatorio'].includes(campoEmail)) return res.status(400).json({ error: 'Config de e-mail inválida' }); data.campoEmail = campoEmail; }
    if (campoNascimento !== undefined) { if (!['nao', 'opcional', 'obrigatorio'].includes(campoNascimento)) return res.status(400).json({ error: 'Config de nascimento inválida' }); data.campoNascimento = campoNascimento; }
    res.json(await prisma.indicacaoConfig.update({ where: { id: config.id }, data }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/indicacao/config/rotacionar', async (req, res) => {
  try {
    const config = await getOrCreateIndicacaoConfig();
    const qual = String(req.body?.qual ?? '');
    const data = {};
    if (qual === 'promotor') data.promotorToken = tokenSecreto();
    else if (qual === 'atendente') data.atendenteToken = tokenSecreto();
    else return res.status(400).json({ error: 'qual deve ser "promotor" ou "atendente".' });
    res.json(await prisma.indicacaoConfig.update({ where: { id: config.id }, data }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: painel geral (KPIs) ----------
app.get('/api/indicacao/painel', async (req, res) => {
  try {
    const [promotores, promotoresAtivos, indicacoes, validadas, pendentes, canceladas, cuponsGerados, cuponsUsados, fatAgg, grupos] = await Promise.all([
      prisma.promotor.count(),
      prisma.promotor.count({ where: { status: 'ATIVO' } }),
      prisma.indicacao.count(),
      prisma.indicacao.count({ where: { status: 'VALIDADA' } }),
      prisma.indicacao.count({ where: { status: 'PENDENTE' } }),
      prisma.indicacao.count({ where: { status: 'CANCELADA' } }),
      prisma.cupom.count({ where: { tipo: 'INDICACAO' } }),
      prisma.cupom.count({ where: { tipo: 'INDICACAO', status: 'USADO' } }),
      prisma.cupom.aggregate({ _sum: { valorPedido: true }, where: { tipo: 'INDICACAO', status: 'USADO' } }),
      prisma.indicacao.groupBy({ by: ['promotorId'], where: { status: 'VALIDADA' }, _count: { _all: true } }),
    ]);
    const faturamento = fatAgg?._sum?.valorPedido ?? 0;
    grupos.sort((a, b) => b._count._all - a._count._all);
    const top = grupos.slice(0, 8);
    const ids = top.map((g) => g.promotorId);
    const proms = ids.length ? await prisma.promotor.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, status: true } }) : [];
    const byId = new Map(proms.map((p) => [p.id, p]));
    const topPromotores = top.map((g) => ({ nome: byId.get(g.promotorId)?.nome ?? '—', status: byId.get(g.promotorId)?.status ?? 'ATIVO', validadas: g._count._all }));
    res.json({
      promotores, promotoresAtivos,
      indicacoes, validadas, pendentes, canceladas,
      cuponsGerados, cuponsUsados,
      faturamento,
      ticketMedio: cuponsUsados > 0 ? faturamento / cuponsUsados : 0,
      convValidacao: indicacoes > 0 ? validadas / indicacoes : 0,
      convUso: cuponsGerados > 0 ? cuponsUsados / cuponsGerados : 0,
      topPromotores,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: recompensas (marcos) ----------
app.get('/api/indicacao/recompensas', async (req, res) => {
  try {
    const tiers = await prisma.recompensaTier.findMany({ orderBy: { meta: 'asc' } });
    // resgatadas = cupons de recompensa desse marco já usados (baixa no balcão)
    const usados = await prisma.cupom.groupBy({ by: ['recompensaTierId'], where: { tipo: 'RECOMPENSA', status: 'USADO' }, _count: { _all: true } });
    const geradas = await prisma.cupom.groupBy({ by: ['recompensaTierId'], where: { tipo: 'RECOMPENSA' }, _count: { _all: true } });
    const mUsados = new Map(usados.map((g) => [g.recompensaTierId, g._count._all]));
    const mGeradas = new Map(geradas.map((g) => [g.recompensaTierId, g._count._all]));
    res.json(tiers.map((t) => ({ ...t, resgatadas: mUsados.get(t.id) ?? 0, desbloqueadas: mGeradas.get(t.id) ?? 0 })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// Histórico de resgates de recompensas (auditoria): cupons RECOMPENSA já usados.
app.get('/api/indicacao/recompensas/historico', async (req, res) => {
  try {
    const cupons = await prisma.cupom.findMany({
      where: { tipo: 'RECOMPENSA', status: 'USADO' },
      orderBy: { usadoEm: 'desc' },
      take: 500,
      include: { promotor: { select: { nome: true, whatsapp: true } }, recompensaTier: { select: { emoji: true, meta: true } } },
    });
    res.json(cupons.map((c) => ({
      id: c.id, codigo: c.codigo, titulo: c.titulo,
      emoji: c.recompensaTier?.emoji ?? '🎁', meta: c.recompensaTier?.meta ?? null,
      promotor: c.promotor?.nome ?? '—', whatsapp: c.promotor?.whatsapp ?? null,
      usadoEm: c.usadoEm, usadoPor: c.usadoPor ?? null,
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/indicacao/recompensas', async (req, res) => {
  try {
    const meta = Number(req.body?.meta);
    if (!Number.isInteger(meta) || meta <= 0) return res.status(400).json({ error: 'A meta deve ser um número inteiro positivo.' });
    const titulo = String(req.body?.titulo ?? '').trim();
    if (!titulo) return res.status(400).json({ error: 'Informe o título da recompensa.' });
    const tipo = ['CONSUMO', 'BRINDE'].includes(req.body?.tipo) ? req.body.tipo : 'CONSUMO';
    const perm = ['salao', 'delivery', 'retirada'];
    let destinos = tipo === 'CONSUMO' && Array.isArray(req.body?.destinos) ? [...new Set(req.body.destinos.filter((d) => perm.includes(d)))] : [];
    const destino = destinos.includes('delivery') && !destinos.includes('salao') ? 'DELIVERY' : 'SALAO'; // legado derivado
    const emoji = String(req.body?.emoji ?? '🎁').trim().slice(0, 16);
    const descricao = req.body?.descricao != null ? (String(req.body.descricao).trim().slice(0, 200) || null) : null;
    const ativo = req.body?.ativo === undefined ? true : !!req.body.ativo;
    res.status(201).json(await prisma.recompensaTier.create({ data: { meta, titulo: titulo.slice(0, 120), tipo, destino, destinos, emoji, descricao, ativo } }));
  } catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe uma recompensa para essa meta.' }); console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/indicacao/recompensas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.recompensaTier.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Recompensa não encontrada' });
    const { meta, titulo, tipo, destinos, emoji, descricao, ativo } = req.body ?? {};
    const data = {};
    if (meta !== undefined) { const m = Number(meta); if (!Number.isInteger(m) || m <= 0) return res.status(400).json({ error: 'Meta inválida' }); data.meta = m; }
    if (titulo !== undefined) { const v = String(titulo).trim(); if (!v) return res.status(400).json({ error: 'Título vazio' }); data.titulo = v.slice(0, 120); }
    if (tipo !== undefined) { if (!['CONSUMO', 'BRINDE'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' }); data.tipo = tipo; }
    if (destinos !== undefined) { const perm = ['salao', 'delivery', 'retirada']; const arr = Array.isArray(destinos) ? [...new Set(destinos.filter((d) => perm.includes(d)))] : []; data.destinos = arr; data.destino = arr.includes('delivery') && !arr.includes('salao') ? 'DELIVERY' : 'SALAO'; }
    if (emoji !== undefined) data.emoji = String(emoji).trim().slice(0, 16);
    if (descricao !== undefined) data.descricao = descricao ? String(descricao).trim().slice(0, 200) : null;
    if (ativo !== undefined) data.ativo = !!ativo;
    res.json(await prisma.recompensaTier.update({ where: { id }, data }));
  } catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe uma recompensa para essa meta.' }); console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/indicacao/recompensas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.recompensaTier.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Recompensa não encontrada' });
    await prisma.recompensaTier.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: promotores ----------
app.get('/api/indicacao/promotores', async (req, res) => {
  try {
    const promotores = await prisma.promotor.findMany({ orderBy: { criadoEm: 'desc' }, include: { _count: { select: { indicacoes: true } } } });
    const [validadas, recompGrp, usados] = await Promise.all([
      prisma.indicacao.groupBy({ by: ['promotorId'], where: { status: 'VALIDADA' }, _count: { _all: true } }),
      prisma.cupom.groupBy({ by: ['promotorId'], where: { tipo: 'RECOMPENSA' }, _count: { _all: true } }),
      // Cupom INDICACAO não tem promotorId — o vínculo é via indicacao.promotorId
      prisma.cupom.findMany({ where: { tipo: 'INDICACAO', status: 'USADO' }, select: { valorPedido: true, indicacao: { select: { promotorId: true } } } }),
    ]);
    const mapaVal = new Map(validadas.map((v) => [v.promotorId, v._count._all]));
    const mapaRec = new Map(recompGrp.map((r) => [r.promotorId, r._count._all]));
    const mapaFat = new Map();
    for (const c of usados) {
      const pid = c.indicacao?.promotorId;
      if (pid == null) continue;
      mapaFat.set(pid, (mapaFat.get(pid) || 0) + (Number(c.valorPedido) || 0));
    }
    res.json(promotores.map((p) => ({
      id: p.id, nome: p.nome, whatsapp: p.whatsapp, codigo: p.codigo, painelToken: p.painelToken, origem: p.origem, tipo: p.tipo, status: p.status, criadoEm: p.criadoEm,
      totalIndicacoes: p._count.indicacoes, totalValidadas: mapaVal.get(p.id) ?? 0,
      totalRecompensas: mapaRec.get(p.id) ?? 0, faturamento: mapaFat.get(p.id) ?? 0,
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/indicacao/promotores', async (req, res) => {
  try {
    const nome = String(req.body?.nome ?? '').trim();
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' });
    const whatsapp = normalizarWhatsapp(req.body?.whatsapp);
    if (!whatsapp) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });
    const tipo = ['CLIENTE', 'INFLUENCER', 'PARCEIRA'].includes(req.body?.tipo) ? req.body.tipo : 'CLIENTE';
    const codigo = await gerarCodigoPromotor();
    res.status(201).json(await prisma.promotor.create({ data: { nome, whatsapp, codigo, painelToken: tokenSecreto(), origem: 'ADMIN', tipo } }));
  } catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um promotor com esse WhatsApp.' }); console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/indicacao/promotores/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.promotor.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Promotor não encontrado' });
    const { nome, whatsapp, status, tipo } = req.body ?? {};
    const data = {};
    if (nome !== undefined) { const v = String(nome).trim(); if (!v) return res.status(400).json({ error: 'Nome vazio' }); data.nome = v; }
    if (whatsapp !== undefined) { const w = normalizarWhatsapp(whatsapp); if (!w) return res.status(400).json({ error: 'WhatsApp inválido' }); data.whatsapp = w; }
    if (status !== undefined) { if (!['ATIVO', 'BLOQUEADO'].includes(status)) return res.status(400).json({ error: 'Status inválido' }); data.status = status; }
    if (tipo !== undefined) { if (!['CLIENTE', 'INFLUENCER', 'PARCEIRA'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' }); data.tipo = tipo; }
    res.json(await prisma.promotor.update({ where: { id }, data }));
  } catch (err) { if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um promotor com esse WhatsApp.' }); console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: listagens (auditoria) ----------
app.get('/api/indicacao/indicacoes', async (req, res) => {
  try {
    const where = {};
    if (req.query.status && ['PENDENTE', 'VALIDADA', 'CANCELADA'].includes(req.query.status)) where.status = req.query.status;
    if (req.query.promotorId) { const pid = Number(req.query.promotorId); if (Number.isInteger(pid)) where.promotorId = pid; }
    res.json(await prisma.indicacao.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 500, include: { promotor: { select: { nome: true } }, cupom: { select: { codigo: true, status: true } } } }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/indicacao/cupons', async (req, res) => {
  try {
    const where = {};
    if (req.query.tipo && ['INDICACAO', 'RECOMPENSA'].includes(req.query.tipo)) where.tipo = req.query.tipo;
    if (req.query.status && ['DISPONIVEL', 'USADO', 'CANCELADO'].includes(req.query.status)) where.status = req.query.status;
    res.json(await prisma.cupom.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 500, include: { promotor: { select: { nome: true } }, indicacao: { select: { amigoNome: true } } } }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ---------- ADMIN: cupons do Cardápio Web (aba Cupons) ----------
app.get('/api/indicacao/cw-cupons', async (req, res) => {
  try {
    const clienteId = await clienteIdDaLojaAtual();
    if (!clienteId) return res.json({ conectado: false });
    res.json(await listarCuponsCardapioWeb(clienteId));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// URL do webhook do CW p/ o dono colar no painel (auto-validação da indicação).
app.get('/api/indicacao/cw-webhook', async (req, res) => {
  try {
    const clienteId = await clienteIdDaLojaAtual();
    if (!clienteId) return res.json({ conectado: false });
    res.json(await webhookUrlCardapioWeb(clienteId));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/indicacao/cw-cupons', async (req, res) => {
  try {
    const clienteId = await clienteIdDaLojaAtual();
    if (!clienteId) return res.status(409).json({ error: 'Loja sem Cardápio Web conectado.' });
    const coupon = req.body?.coupon;
    if (!coupon || typeof coupon !== 'object') return res.status(400).json({ error: 'Dados do cupom ausentes.' });
    const out = await criarCupomCardapioWeb(clienteId, coupon);
    if (out?.conectado && out?.coupon) return res.status(201).json(out.coupon);
    return res.status(out?.detalhe ? 502 : 409).json({ error: out?.error || 'Cardápio Web não conectado.', detalhe: out?.detalhe });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// Ativa/desativa um cupom no CW pelo H360 (toggle na lista).
app.post('/api/indicacao/cw-cupons/status', async (req, res) => {
  try {
    const clienteId = await clienteIdDaLojaAtual();
    if (!clienteId) return res.status(409).json({ error: 'Loja sem Cardápio Web conectado.' });
    const couponId = Number(req.body?.couponId);
    if (!Number.isInteger(couponId)) return res.status(400).json({ error: 'couponId inválido.' });
    const active = req.body?.active === true;
    const r = await setStatusCupomCardapioWeb(clienteId, couponId, active);
    if (r?.ok === false) return res.status(502).json({ error: r?.error || 'Não foi possível atualizar o cupom no Cardápio Web.' });
    return res.json({ ok: true, active });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ============================================================
// Escala de Motoboys (V1) — portado do H360
// ============================================================
const INSCRICAO_ATIVA = ['INSCRITO', 'CONFIRMADO'];

// Token público curto (node:crypto, sem dependência). Regenera se colidir.
async function gerarTokenPublico() {
  for (let i = 0; i < 6; i++) {
    const t = randomBytes(9).toString('base64url');
    const existe = await prisma.escalaMotoboy.findUnique({
      where: { tokenPublico: t },
      select: { id: true }
    });
    if (!existe) return t;
  }
  return randomBytes(12).toString('base64url');
}

// Segunda = 0 ... Domingo = 6 (para montar as linhas de semana iniciando na segunda)
function semanaIniciandoSegunda(jsDay) {
  return (jsDay + 6) % 7;
}

// Gera todos os dias do mês (UTC, sem deslocar dia por fuso). diaSemana: 0=Dom..6=Sáb.
// semanaDoMes: linha da semana (1..6) considerando semana iniciando na segunda.
function gerarDiasDoMes(ano, mes) {
  const offsetPrimeiro = semanaIniciandoSegunda(new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay());
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias = [];
  for (let d = 1; d <= diasNoMes; d++) {
    const data = new Date(Date.UTC(ano, mes - 1, d));
    dias.push({
      data,
      diaSemana: data.getUTCDay(),
      semanaDoMes: Math.floor((d - 1 + offsetPrimeiro) / 7) + 1,
      vagas: 0,
      status: 'ABERTO'
    });
  }
  return dias;
}

function contarAtivas(inscricoes) {
  return (inscricoes ?? []).filter((i) => INSCRICAO_ATIVA.includes(i.status)).length;
}

// Métricas por dia (comuns a admin e público)
function metricasDia(dia) {
  const inscritosAtivos = contarAtivas(dia.inscricoes);
  const vagasRestantes = Math.max(0, Number(dia.vagas) - inscritosAtivos);
  return {
    inscritosAtivos,
    vagasRestantes,
    lotado: inscritosAtivos >= Number(dia.vagas)
  };
}

// Admin: inclui nomes/WhatsApps dos inscritos
function montarEscalaAdmin(escala) {
  if (!escala) return null;
  return {
    id: escala.id,
    ano: escala.ano,
    mes: escala.mes,
    titulo: escala.titulo,
    tokenPublico: escala.tokenPublico,
    status: escala.status,
    criadoEm: escala.criadoEm,
    atualizadoEm: escala.atualizadoEm,
    dias: (escala.dias ?? []).map((dia) => {
      const m = metricasDia(dia);
      return {
        id: dia.id,
        data: dia.data,
        diaSemana: dia.diaSemana,
        semanaDoMes: dia.semanaDoMes,
        vagas: dia.vagas,
        status: dia.status,
        ...m,
        inscricoes: (dia.inscricoes ?? []).map((i) => ({
          id: i.id,
          nome: i.nome,
          whatsapp: i.whatsapp,
          status: i.status,
          origem: i.origem,
          motoboyId: i.motoboyId,
          presencaStatus: i.presencaStatus,
          presencaObservacao: i.presencaObservacao,
          criadoEm: i.criadoEm
        }))
      };
    })
  };
}

// Público: NÃO expõe nomes/WhatsApps dos inscritos (apenas contagens)
function montarEscalaPublica(escala, empresaNome) {
  return {
    empresaNome: empresaNome || 'Hamburgueria',
    ano: escala.ano,
    mes: escala.mes,
    titulo: escala.titulo,
    status: escala.status,
    dias: (escala.dias ?? []).map((dia) => {
      const m = metricasDia(dia);
      return {
        id: dia.id,
        data: dia.data,
        diaSemana: dia.diaSemana,
        semanaDoMes: dia.semanaDoMes,
        vagas: dia.vagas,
        status: dia.status,
        ...m
      };
    })
  };
}

const DIAS_INCLUDE = {
  dias: { orderBy: { data: 'asc' }, include: { inscricoes: { orderBy: { criadoEm: 'asc' } } } }
};

function validarAnoMes(ano, mes) {
  const a = Number(ano);
  const mm = Number(mes);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return 'ano inválido';
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) return 'mês inválido (1 a 12)';
  return null;
}

// ===== Admin =====
app.get('/api/escala-motoboys', async (req, res) => {
  try {
    const { ano, mes } = req.query;
    const erro = validarAnoMes(ano, mes);
    if (erro) return res.status(400).json({ error: erro });
    const escala = await prisma.escalaMotoboy.findFirst({
      where: { ano: Number(ano), mes: Number(mes) },
      include: DIAS_INCLUDE
    });
    res.json(escala ? montarEscalaAdmin(escala) : null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar a escala de motoboys' });
  }
});

app.post('/api/escala-motoboys', async (req, res) => {
  try {
    const { ano, mes, titulo } = req.body ?? {};
    const erro = validarAnoMes(ano, mes);
    if (erro) return res.status(400).json({ error: erro });
    const existe = await prisma.escalaMotoboy.findFirst({
      where: { ano: Number(ano), mes: Number(mes) },
      select: { id: true }
    });
    if (existe) return res.status(409).json({ error: 'Já existe uma escala para este mês.' });
    const tokenPublico = await gerarTokenPublico();
    const empresaIdAtual = getEmpresaIdAtual();
    const escala = await prisma.escalaMotoboy.create({
      data: {
        ano: Number(ano),
        mes: Number(mes),
        titulo: titulo ? String(titulo).trim() : null,
        tokenPublico,
        // nested create NAO passa pela extension: carimba os dias com a loja atual
        dias: { create: gerarDiasDoMes(Number(ano), Number(mes)).map((d) => ({ ...d, empresaId: empresaIdAtual })) }
      },
      include: DIAS_INCLUDE
    });
    res.status(201).json(montarEscalaAdmin(escala));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar a escala de motoboys' });
  }
});

app.put('/api/escala-motoboys/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const escala = await prisma.escalaMotoboy.findUnique({ where: { id }, select: { id: true } });
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });
    const { titulo, status } = req.body ?? {};
    const data = {};
    if (titulo !== undefined) data.titulo = String(titulo).trim() === '' ? null : String(titulo).trim();
    if (status !== undefined) {
      if (!['ABERTA', 'FECHADA'].includes(status)) {
        return res.status(400).json({ error: 'status deve ser ABERTA ou FECHADA' });
      }
      data.status = status;
    }
    await prisma.escalaMotoboy.update({ where: { id }, data });
    const atual = await prisma.escalaMotoboy.findUnique({ where: { id }, include: DIAS_INCLUDE });
    res.json(montarEscalaAdmin(atual));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar a escala' });
  }
});

app.put('/api/escala-motoboys/:id/dias', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const escala = await prisma.escalaMotoboy.findUnique({
      where: { id },
      include: { dias: { include: { inscricoes: true } } }
    });
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });
    const { dias } = req.body ?? {};
    if (!Array.isArray(dias) || dias.length === 0) {
      return res.status(400).json({ error: 'Informe os dias a atualizar.' });
    }
    const porId = new Map(escala.dias.map((d) => [d.id, d]));
    const updates = [];
    for (const item of dias) {
      const diaId = Number(item?.id);
      const dia = porId.get(diaId);
      if (!dia) return res.status(400).json({ error: `Dia ${item?.id} não pertence a esta escala.` });
      const data = {};
      if (item.vagas !== undefined) {
        const v = Number(item.vagas);
        if (!Number.isInteger(v) || v < 0) {
          return res.status(400).json({ error: 'vagas deve ser inteiro maior ou igual a 0' });
        }
        const ativos = contarAtivas(dia.inscricoes);
        if (v < ativos) {
          return res.status(400).json({
            error: `Não é possível definir ${v} vaga(s) no dia ${new Date(dia.data).toISOString().slice(0, 10)}: já há ${ativos} inscrito(s) ativo(s).`
          });
        }
        data.vagas = v;
      }
      if (item.status !== undefined) {
        if (!['ABERTO', 'FECHADO'].includes(item.status)) {
          return res.status(400).json({ error: 'status do dia deve ser ABERTO ou FECHADO' });
        }
        data.status = item.status;
      }
      if (Object.keys(data).length > 0) {
        updates.push(prisma.escalaMotoboyDia.update({ where: { id: diaId }, data }));
      }
    }
    if (updates.length > 0) await prisma.$transaction(updates);
    const atual = await prisma.escalaMotoboy.findUnique({ where: { id }, include: DIAS_INCLUDE });
    res.json(montarEscalaAdmin(atual));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar os dias da escala' });
  }
});

app.delete('/api/escala-motoboys/inscricoes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const insc = await prisma.escalaMotoboyInscricao.findUnique({ where: { id }, select: { id: true } });
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    // Não apaga: marca CANCELADO (libera vaga)
    await prisma.escalaMotoboyInscricao.update({ where: { id }, data: { status: 'CANCELADO' } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao cancelar a inscrição' });
  }
});

app.put('/api/escala-motoboys/inscricoes/:id/confirmar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const insc = await prisma.escalaMotoboyInscricao.findUnique({
      where: { id },
      include: { dia: { include: { inscricoes: true } } }
    });
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    // Se estava CANCELADA, só volta a ativa se ainda houver vaga
    if (insc.status === 'CANCELADO') {
      const ativos = contarAtivas(insc.dia.inscricoes);
      if (ativos >= Number(insc.dia.vagas)) {
        return res.status(409).json({ error: 'Não há vagas disponíveis neste dia para reativar a inscrição.' });
      }
    }
    await prisma.escalaMotoboyInscricao.update({ where: { id }, data: { status: 'CONFIRMADO' } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao confirmar a inscrição' });
  }
});

// Admin: escala manualmente um entregador JÁ CADASTRADO num dia (origem ADMIN), sem
// depender da auto-inscrição pública. status = CONFIRMADO. Não exige escala/dia ABERTO
// (o admin está montando a escala). Bloqueia entregador BLOQUEADO e duplicado no dia;
// reaproveita uma inscrição CANCELADA do mesmo motoboy; sobe as vagas do dia se preciso
// (mantém a invariante vagas >= inscritos ativos, igual ao PUT /dias).
app.post('/api/escala-motoboys/dias/:diaId/inscricoes', async (req, res) => {
  try {
    const diaId = Number(req.params.diaId);
    if (!Number.isInteger(diaId)) return res.status(400).json({ error: 'dia inválido' });
    const motoboyId = Number(req.body?.motoboyId);
    if (!Number.isInteger(motoboyId)) return res.status(400).json({ error: 'Selecione um entregador.' });

    const cfgAdmin = await getEmpresa();
    const inscricaoId = await prisma.$transaction(async (tx) => {
      const dia = await tx.escalaMotoboyDia.findFirst({ where: { id: diaId }, include: { inscricoes: true } });
      if (!dia) throw { http: 404, msg: 'Dia da escala não encontrado.' };
      const motoboy = await tx.motoboy.findFirst({ where: { id: motoboyId } });
      if (!motoboy) throw { http: 404, msg: 'Entregador não encontrado.' };
      if (motoboy.status === 'BLOQUEADO' && !cfgAdmin.motoboyBloqueadoPodeEscalar) throw { http: 409, msg: 'Este entregador está bloqueado.' };

      const ativos = dia.inscricoes.filter((i) => INSCRICAO_ATIVA.includes(i.status));
      if (ativos.some((i) => i.motoboyId === motoboy.id || i.whatsapp === motoboy.whatsapp)) {
        throw { http: 409, msg: 'Este entregador já está escalado neste dia.' };
      }
      // Reaproveita uma inscrição CANCELADA do mesmo motoboy (não duplica a linha).
      const cancelada = dia.inscricoes.find((i) => i.status === 'CANCELADO' && i.motoboyId === motoboy.id);
      let insc;
      if (cancelada) {
        insc = await tx.escalaMotoboyInscricao.update({
          where: { id: cancelada.id },
          data: { status: 'CONFIRMADO', origem: 'ADMIN', nome: motoboy.nome, whatsapp: motoboy.whatsapp }
        });
      } else {
        insc = await tx.escalaMotoboyInscricao.create({
          data: { escalaDiaId: diaId, nome: motoboy.nome, whatsapp: motoboy.whatsapp, status: 'CONFIRMADO', origem: 'ADMIN', motoboyId: motoboy.id }
        });
      }
      const novosAtivos = ativos.length + 1;
      if (novosAtivos > Number(dia.vagas)) {
        await tx.escalaMotoboyDia.update({ where: { id: diaId }, data: { vagas: novosAtivos } });
      }
      return insc.id;
    });

    res.status(201).json({ success: true, inscricaoId });
  } catch (err) {
    if (err && err.http) return res.status(err.http).json({ error: err.msg });
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao escalar o entregador' });
  }
});

// ===== Público (acesso por token) =====
app.get('/api/public/escala-motoboys/:token', async (req, res) => {
  try {
    const escala = await prisma.escalaMotoboy.findUnique({
      where: { tokenPublico: String(req.params.token) },
      include: DIAS_INCLUDE
    });
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });
    // O nome tem que ser o da loja DONA da escala (o link é público e roda fora do
    // tenantStore — getEmpresa() aqui cairia no fallback "primeira loja" e todo
    // cliente veria o nome da loja id=1).
    let empresaNome = 'Hamburgueria';
    try {
      const empresa = await prisma.empresa.findUnique({
        where: { id: escala.empresaId },
        select: { nome: true }
      });
      empresaNome = (empresa?.nome ?? '').trim() || 'Hamburgueria';
    } catch {
      // mantém fallback
    }
    res.json(montarEscalaPublica(escala, empresaNome));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar a escala' });
  }
});

app.post('/api/public/escala-motoboys/:token/inscricao', async (req, res) => {
  try {
    const escala = await prisma.escalaMotoboy.findUnique({
      where: { tokenPublico: String(req.params.token) },
      select: { id: true, status: true, empresaId: true }
    });
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });
    if (escala.status !== 'ABERTA') {
      return res.status(409).json({ error: 'As inscrições desta escala estão fechadas.' });
    }
    const { nome, whatsapp, diaIds } = req.body ?? {};
    const nomeLimpo = String(nome ?? '').trim();
    if (!nomeLimpo) return res.status(400).json({ error: 'Informe seu nome.' });
    const whatsappLimpo = normalizarWhatsapp(whatsapp);
    if (!whatsappLimpo) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });
    if (!Array.isArray(diaIds) || diaIds.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um dia.' });
    }
    const idsUnicos = [...new Set(diaIds.map((x) => Number(x)))].filter((n) => Number.isInteger(n));
    if (idsUnicos.length === 0) return res.status(400).json({ error: 'Dias inválidos.' });
    // Hoje no fuso BR (UTC-3): dia com data anterior já passou (defesa contra página aberta de ontem).
    const _hb = new Date(Date.now() - 3 * 3600 * 1000);
    const hojeBR = `${_hb.getUTCFullYear()}-${String(_hb.getUTCMonth() + 1).padStart(2, '0')}-${String(_hb.getUTCDate()).padStart(2, '0')}`;

    // All-or-nothing: valida e cria tudo numa transacao, no contexto da loja dona
    // da escala — a partir daqui a extension escopa Motoboy/Inscricao por empresaId.
    const criadas = await tenantStore.run({ empresaId: escala.empresaId }, () => prisma.$transaction(async (tx) => {
      // Só a equipe cadastrada e ATIVA se inscreve. O link NÃO cadastra mais ninguém
      // automaticamente — quem não é da equipe passa por "Enviar meu cadastro" → aprovação.
      const cfgEmpresa = await tx.empresa.findUnique({ where: { id: escala.empresaId }, select: { motoboyBloqueadoPodeEscalar: true } });
      const bloqPodeEscalar = !!cfgEmpresa?.motoboyBloqueadoPodeEscalar;
      const motoboy = await tx.motoboy.findFirst({ where: { whatsapp: whatsappLimpo } });
      // ATIVO sempre pode; BLOQUEADO só se a loja permitir (Motoboys › Configuração). INATIVO/PENDENTE nunca.
      const podeEscalar = motoboy && (motoboy.status === 'ATIVO' || (motoboy.status === 'BLOQUEADO' && bloqPodeEscalar));
      if (!podeEscalar) {
        throw { http: 403, msg: 'Você não tem acesso à escala desta empresa. Fale com a equipe da loja.' };
      }
      for (const diaId of idsUnicos) {
        const dia = await tx.escalaMotoboyDia.findUnique({
          where: { id: diaId },
          include: { inscricoes: true }
        });
        if (!dia || dia.escalaId !== escala.id) {
          throw { http: 400, msg: 'Um dos dias selecionados não pertence a esta escala.' };
        }
        if (dia.status !== 'ABERTO') {
          throw { http: 409, msg: 'Um dos dias selecionados está fechado.' };
        }
        const _dd = new Date(dia.data);
        const diaISO = `${_dd.getUTCFullYear()}-${String(_dd.getUTCMonth() + 1).padStart(2, '0')}-${String(_dd.getUTCDate()).padStart(2, '0')}`;
        if (diaISO < hojeBR) {
          throw { http: 409, msg: 'Um dos dias selecionados já passou.' };
        }
        const ativos = dia.inscricoes.filter((i) => INSCRICAO_ATIVA.includes(i.status));
        if (ativos.length >= Number(dia.vagas)) {
          throw { http: 409, msg: 'Um dos dias selecionados está lotado.' };
        }
        if (ativos.some((i) => i.whatsapp === whatsappLimpo)) {
          throw { http: 409, msg: 'Este WhatsApp já está inscrito em um dos dias selecionados.' };
        }
      }
      const novas = [];
      for (const diaId of idsUnicos) {
        const nova = await tx.escalaMotoboyInscricao.create({
          data: {
            escalaDiaId: diaId,
            // snapshot histórico mantido na inscrição, além do vínculo motoboyId
            nome: nomeLimpo,
            whatsapp: whatsappLimpo,
            status: 'INSCRITO',
            origem: 'PUBLICO',
            motoboyId: motoboy.id
          },
          select: { id: true }
        });
        novas.push(nova);
      }
      return novas;
    }));

    res.status(201).json({
      success: true,
      diasInscritos: criadas.length,
      message: 'Sua inscrição foi registrada. A confirmação final será enviada pela equipe.'
    });
  } catch (err) {
    if (err && err.http) return res.status(err.http).json({ error: err.msg });
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao registrar a inscrição' });
  }
});

// Público: identifica o motoboy pelo WhatsApp ANTES de liberar a escala (filtro de
// "quem está apto a trabalhar na loja"). Só ATIVO vê a escala; os demais recebem a
// orientação certa. Devolve o WhatsApp da loja p/ o botão "falar com a empresa".
app.post('/api/public/escala-motoboys/:token/identificar', async (req, res) => {
  try {
    const escala = await prisma.escalaMotoboy.findUnique({
      where: { tokenPublico: String(req.params.token) },
      select: { id: true, empresaId: true }
    });
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });
    const whatsappLimpo = normalizarWhatsapp(req.body?.whatsapp);
    if (!whatsappLimpo || whatsappLimpo.length < 10) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });

    // await DENTRO do run (a arrow-lazy NÃO isola — ver comentário do tenantStore).
    const dados = await tenantStore.run({ empresaId: escala.empresaId }, async () => {
      const motoboy = await prisma.motoboy.findFirst({
        where: { whatsapp: whatsappLimpo },
        select: { nome: true, status: true }
      });
      // Empresa é a raiz do tenant (fora de MODELS_TENANT): findUnique por id direto.
      const empresa = await prisma.empresa.findUnique({
        where: { id: escala.empresaId },
        select: { whatsapp: true, whatsappEmpresa: true, whatsappContato: true, motoboyContatoWhatsapp: true, motoboyPerguntaCnh: true }
      });
      // Contato: o número dedicado da escala (Motoboys › Configuração) tem prioridade;
      // se vazio, cai no número escolhido em Minha Empresa (responsável/empresa).
      const preferido = empresa?.whatsappContato === 'EMPRESA' ? empresa?.whatsappEmpresa : empresa?.whatsapp;
      const alternativo = empresa?.whatsappContato === 'EMPRESA' ? empresa?.whatsapp : empresa?.whatsappEmpresa;
      const empresaWhatsapp = normalizarWhatsapp(empresa?.motoboyContatoWhatsapp) || normalizarWhatsapp(preferido) || normalizarWhatsapp(alternativo) || null;
      return { motoboy, empresaWhatsapp, perguntaCnh: !!empresa?.motoboyPerguntaCnh };
    });

    const { motoboy, empresaWhatsapp, perguntaCnh } = dados;
    let situacao;
    if (!motoboy) situacao = 'NAO_CADASTRADO';
    else if (motoboy.status === 'ATIVO') situacao = 'APTO';
    else if (motoboy.status === 'PENDENTE') situacao = 'PENDENTE';
    else situacao = 'SEM_ACESSO'; // INATIVO ou BLOQUEADO

    res.json({ situacao, nome: motoboy?.nome ?? null, empresaWhatsapp, perguntaCnh });
  } catch (err) {
    console.error('[public/identificar]', err?.message || err);
    res.status(500).json({ error: 'Erro interno ao identificar' });
  }
});

// Público: motoboy que não é da equipe envia a solicitação → fica PENDENTE de aprovação.
// Idempotente: se o WhatsApp já existe, devolve a situação atual (não recria/duplica).
app.post('/api/public/escala-motoboys/:token/cadastro', async (req, res) => {
  try {
    const escala = await prisma.escalaMotoboy.findUnique({
      where: { tokenPublico: String(req.params.token) },
      select: { id: true, empresaId: true }
    });
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });
    const nomeLimpo = String(req.body?.nome ?? '').trim();
    const whatsappLimpo = normalizarWhatsapp(req.body?.whatsapp);
    if (!nomeLimpo) return res.status(400).json({ error: 'Informe seu nome.' });
    if (!whatsappLimpo || whatsappLimpo.length < 10) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });
    // Resposta "Você possui CNH?" (só quando a loja pede) — informativa, não bloqueia.
    const possuiCnh = req.body?.possuiCnh === true ? true : (req.body?.possuiCnh === false ? false : null);

    const situacao = await tenantStore.run({ empresaId: escala.empresaId }, async () => {
      const existente = await prisma.motoboy.findFirst({ where: { whatsapp: whatsappLimpo }, select: { status: true } });
      if (existente) {
        if (existente.status === 'ATIVO') return 'APTO';
        if (existente.status === 'PENDENTE') return 'PENDENTE';
        return 'SEM_ACESSO'; // INATIVO/BLOQUEADO — não recria
      }
      await prisma.motoboy.create({ data: { nome: nomeLimpo, whatsapp: whatsappLimpo, status: 'PENDENTE', possuiCnh } });
      return 'PENDENTE';
    });

    res.status(201).json({ situacao });
  } catch (err) {
    console.error('[public/cadastro]', err?.message || err);
    res.status(500).json({ error: 'Erro interno ao enviar o cadastro' });
  }
});

// ============================================================
// Base de Entregadores / Motoboys (V2)
// ============================================================
const MOTOBOY_STATUS = ['ATIVO', 'INATIVO', 'BLOQUEADO', 'PENDENTE'];
const PRESENCA_STATUS = ['PENDENTE', 'COMPARECEU', 'FALTOU', 'JUSTIFICOU'];
const OCORRENCIA_TIPOS = ['NAO_COMPARECEU', 'ABANDONO', 'MOTO_QUEBROU', 'ATRASO', 'PREJUIZO', 'CONDUTA', 'ATENDIMENTO', 'OBSERVACAO_POSITIVA', 'OUTRO'];
const OCORRENCIA_GRAVIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];

// Decimal/strings → número seguro (sem NaN)
function numSeguro(v) {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function maxData(datas) {
  const validas = datas.filter(Boolean).map((d) => new Date(d)).filter((d) => !isNaN(d.getTime()));
  if (validas.length === 0) return null;
  return new Date(Math.max(...validas.map((d) => d.getTime()))).toISOString();
}

// Métricas do motoboy a partir de inscricoes (com dia.data) e ocorrencias
function metricasMotoboy(inscricoes, ocorrencias) {
  const totalInscricoes = inscricoes.length;
  const totalConfirmadas = inscricoes.filter((i) => i.status === 'CONFIRMADO').length;
  const totalCanceladas = inscricoes.filter((i) => i.status === 'CANCELADO').length;
  const totalCompareceu = inscricoes.filter((i) => i.presencaStatus === 'COMPARECEU').length;
  const totalFaltou = inscricoes.filter((i) => i.presencaStatus === 'FALTOU').length;
  const totalJustificou = inscricoes.filter((i) => i.presencaStatus === 'JUSTIFICOU').length;
  const totalOcorrencias = ocorrencias.length;
  const totalOcorrenciasCriticas = ocorrencias.filter((o) => o.gravidade === 'CRITICA').length;
  const totalAbandonos = ocorrencias.filter((o) => o.tipo === 'ABANDONO').length;
  const prejuizoAcumulado = ocorrencias.reduce((s, o) => s + numSeguro(o.valorPrejuizo), 0);
  const ultimaParticipacao = maxData(inscricoes.map((i) => i.dia?.data));
  const ultimaOcorrencia = maxData(ocorrencias.map((o) => o.dataOcorrencia));
  // Taxa de comparecimento = de cada dia CONFIRMADO, quantos ele compareceu
  const confirmadasComparecidas = inscricoes.filter((i) => i.status === 'CONFIRMADO' && i.presencaStatus === 'COMPARECEU').length;
  const taxaComparecimento = totalConfirmadas > 0 ? Math.round((confirmadasComparecidas / totalConfirmadas) * 1000) / 10 : null;
  return {
    totalInscricoes,
    totalConfirmadas,
    totalCanceladas,
    totalCompareceu,
    totalFaltou,
    totalJustificou,
    totalOcorrencias,
    totalOcorrenciasCriticas,
    totalAbandonos,
    prejuizoAcumulado: Math.round(prejuizoAcumulado * 100) / 100,
    ultimaParticipacao,
    ultimaOcorrencia,
    taxaComparecimento
  };
}

// "Atenção" derivado: motoboy ATIVO com sinais de risco. Retorna o flag e os
// motivos (usados no tooltip/detalhe). Não altera o status real no banco.
function calcularAtencao(status, m) {
  if (status !== 'ATIVO') return { atencao: false, atencaoMotivos: [] };
  const motivos = [];
  if (m.totalOcorrenciasCriticas > 0) motivos.push(`${m.totalOcorrenciasCriticas} ocorrência(s) crítica(s)`);
  if (m.totalAbandonos >= 1) motivos.push(`${m.totalAbandonos} abandono(s)`);
  if (m.totalFaltou >= 2) motivos.push(`${m.totalFaltou} faltas`);
  if (m.taxaComparecimento !== null && m.totalConfirmadas >= 3 && m.taxaComparecimento < 70) {
    motivos.push(`Taxa de comparecimento ${m.taxaComparecimento}%`);
  }
  return { atencao: motivos.length > 0, atencaoMotivos: motivos };
}

// ===== Base de entregadores =====
app.get('/api/motoboys', async (req, res) => {
  try {
    const { busca, status } = req.query;
    const where = {};
    if (status !== undefined && status !== '') {
      if (!MOTOBOY_STATUS.includes(status)) return res.status(400).json({ error: 'status inválido' });
      where.status = status;
    }
    if (busca && String(busca).trim() !== '') {
      const termo = String(busca).trim();
      const digitos = termo.replace(/\D/g, '');
      where.OR = [
        { nome: { contains: termo, mode: 'insensitive' } },
        ...(digitos ? [{ whatsapp: { contains: digitos } }] : [])
      ];
    }
    const motoboys = await prisma.motoboy.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: {
        inscricoes: { select: { status: true, presencaStatus: true, dia: { select: { data: true } } } },
        ocorrencias: { select: { tipo: true, gravidade: true, valorPrejuizo: true, dataOcorrencia: true } }
      }
    });
    res.json(
      motoboys.map((m) => {
        const met = metricasMotoboy(m.inscricoes, m.ocorrencias);
        return {
          id: m.id,
          nome: m.nome,
          whatsapp: m.whatsapp,
          status: m.status,
          observacoes: m.observacoes,
          criadoEm: m.criadoEm,
          ...met,
          ...calcularAtencao(m.status, met)
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar entregadores' });
  }
});

// ===== Motoboys › Configuração (contato da escala, bloqueado, CNH) — ADMIN =====
// Definido ANTES de /api/motoboys/:id p/ "config" não cair na rota de id.
app.get('/api/motoboys/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const e = await getEmpresa();
    res.json({ contatoWhatsapp: e.motoboyContatoWhatsapp ?? '', bloqueadoPodeEscalar: !!e.motoboyBloqueadoPodeEscalar, perguntaCnh: !!e.motoboyPerguntaCnh });
  } catch (err) { console.error('[motoboys/config GET]', err); res.status(500).json({ error: 'Erro ao carregar a configuração.' }); }
});
app.put('/api/motoboys/config', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const e = await getEmpresa();
    const b = req.body ?? {};
    const data = {};
    if (b.contatoWhatsapp !== undefined) { const d = normalizarWhatsapp(b.contatoWhatsapp); data.motoboyContatoWhatsapp = d === '' ? null : d; }
    if (b.bloqueadoPodeEscalar !== undefined) data.motoboyBloqueadoPodeEscalar = !!b.bloqueadoPodeEscalar;
    if (b.perguntaCnh !== undefined) data.motoboyPerguntaCnh = !!b.perguntaCnh;
    const at = await prisma.empresa.update({ where: { id: e.id }, data });
    res.json({ contatoWhatsapp: at.motoboyContatoWhatsapp ?? '', bloqueadoPodeEscalar: !!at.motoboyBloqueadoPodeEscalar, perguntaCnh: !!at.motoboyPerguntaCnh });
  } catch (err) { console.error('[motoboys/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

app.get('/api/motoboys/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const m = await prisma.motoboy.findUnique({
      where: { id },
      include: {
        inscricoes: { select: { status: true, presencaStatus: true, dia: { select: { data: true } } } },
        ocorrencias: { select: { tipo: true, gravidade: true, valorPrejuizo: true, dataOcorrencia: true } }
      }
    });
    if (!m) return res.status(404).json({ error: 'Entregador não encontrado' });
    const met = metricasMotoboy(m.inscricoes, m.ocorrencias);
    res.json({
      id: m.id,
      nome: m.nome,
      whatsapp: m.whatsapp,
      status: m.status,
      observacoes: m.observacoes,
      possuiCnh: m.possuiCnh,
      criadoEm: m.criadoEm,
      atualizadoEm: m.atualizadoEm,
      ...met,
      ...calcularAtencao(m.status, met)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar entregador' });
  }
});

app.post('/api/motoboys', async (req, res) => {
  try {
    const { nome, whatsapp, status, observacoes, possuiCnh } = req.body ?? {};
    const nomeLimpo = String(nome ?? '').trim();
    if (!nomeLimpo) return res.status(400).json({ error: 'Informe o nome do entregador.' });
    const whatsappLimpo = normalizarWhatsapp(whatsapp);
    if (!whatsappLimpo) return res.status(400).json({ error: 'Informe um WhatsApp válido.' });
    const data = { nome: nomeLimpo, whatsapp: whatsappLimpo };
    if (status !== undefined) {
      if (!MOTOBOY_STATUS.includes(status)) return res.status(400).json({ error: 'status inválido' });
      data.status = status;
    }
    if (observacoes !== undefined) data.observacoes = String(observacoes).trim() === '' ? null : String(observacoes).trim();
    if (possuiCnh !== undefined) data.possuiCnh = possuiCnh === true ? true : (possuiCnh === false ? false : null);
    const m = await prisma.motoboy.create({ data });
    res.status(201).json(m);
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: 'Já existe um entregador com este WhatsApp.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar entregador' });
  }
});

app.put('/api/motoboys/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboy.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Entregador não encontrado' });
    const { nome, whatsapp, status, observacoes, possuiCnh } = req.body ?? {};
    const data = {};
    if (nome !== undefined) {
      const v = String(nome).trim();
      if (v === '') return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
      data.nome = v;
    }
    if (whatsapp !== undefined) {
      const w = normalizarWhatsapp(whatsapp);
      if (!w) return res.status(400).json({ error: 'WhatsApp inválido.' });
      data.whatsapp = w;
    }
    if (status !== undefined) {
      if (!MOTOBOY_STATUS.includes(status)) return res.status(400).json({ error: 'status inválido' });
      data.status = status;
    }
    if (observacoes !== undefined) data.observacoes = String(observacoes).trim() === '' ? null : String(observacoes).trim();
    if (possuiCnh !== undefined) data.possuiCnh = possuiCnh === true ? true : (possuiCnh === false ? false : null);
    const m = await prisma.motoboy.update({ where: { id }, data });
    res.json(m);
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: 'Já existe um entregador com este WhatsApp.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar entregador' });
  }
});

// Exclui o entregador. As ocorrências são removidas (cascade); as inscrições na
// escala ficam como snapshot histórico, apenas sem vínculo (motoboyId = null).
app.delete('/api/motoboys/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboy.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Entregador não encontrado' });
    await prisma.motoboy.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao excluir entregador' });
  }
});

app.get('/api/motoboys/:id/historico', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboy.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Entregador não encontrado' });
    const inscricoes = await prisma.escalaMotoboyInscricao.findMany({
      where: { motoboyId: id },
      include: { dia: { include: { escala: { select: { id: true, ano: true, mes: true, titulo: true } } } } }
    });
    const historico = inscricoes
      .map((i) => ({
        inscricaoId: i.id,
        status: i.status,
        presencaStatus: i.presencaStatus,
        presencaObservacao: i.presencaObservacao,
        data: i.dia?.data ?? null,
        diaSemana: i.dia?.diaSemana ?? null,
        escalaId: i.dia?.escala?.id ?? null,
        ano: i.dia?.escala?.ano ?? null,
        mes: i.dia?.escala?.mes ?? null,
        titulo: i.dia?.escala?.titulo ?? null
      }))
      .sort((a, b) => new Date(b.data ?? 0) - new Date(a.data ?? 0));
    res.json(historico);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar histórico' });
  }
});

// ===== Ocorrências =====
app.get('/api/motoboys/:id/ocorrencias', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboy.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Entregador não encontrado' });
    const ocorrencias = await prisma.motoboyOcorrencia.findMany({
      where: { motoboyId: id },
      orderBy: { dataOcorrencia: 'desc' }
    });
    res.json(ocorrencias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar ocorrências' });
  }
});

function validarOcorrenciaBody(body, parcial) {
  const { tipo, gravidade, dataOcorrencia, descricao, valorPrejuizo, resolvida, escalaDiaId, inscricaoId } = body ?? {};
  const data = {};
  if (tipo !== undefined || !parcial) {
    if (!OCORRENCIA_TIPOS.includes(tipo)) return { erro: 'tipo de ocorrência inválido' };
    data.tipo = tipo;
  }
  if (gravidade !== undefined) {
    if (!OCORRENCIA_GRAVIDADES.includes(gravidade)) return { erro: 'gravidade inválida' };
    data.gravidade = gravidade;
  }
  if (dataOcorrencia !== undefined || !parcial) {
    const d = new Date(dataOcorrencia);
    if (isNaN(d.getTime())) return { erro: 'dataOcorrencia inválida' };
    data.dataOcorrencia = d;
  }
  if (descricao !== undefined || !parcial) {
    const v = String(descricao ?? '').trim();
    if (v === '') return { erro: 'Descreva a ocorrência.' };
    data.descricao = v;
  }
  if (valorPrejuizo !== undefined) {
    if (valorPrejuizo === null || valorPrejuizo === '') data.valorPrejuizo = null;
    else {
      const n = Number(valorPrejuizo);
      if (!Number.isFinite(n) || n < 0) return { erro: 'valorPrejuizo deve ser maior ou igual a 0' };
      data.valorPrejuizo = n;
    }
  }
  if (resolvida !== undefined) data.resolvida = !!resolvida;
  if (escalaDiaId !== undefined) data.escalaDiaId = escalaDiaId === null ? null : Number(escalaDiaId) || null;
  if (inscricaoId !== undefined) data.inscricaoId = inscricaoId === null ? null : Number(inscricaoId) || null;
  return { data };
}

app.post('/api/motoboys/:id/ocorrencias', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboy.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Entregador não encontrado' });
    const { erro, data } = validarOcorrenciaBody(req.body, false);
    if (erro) return res.status(400).json({ error: erro });
    const oc = await prisma.motoboyOcorrencia.create({ data: { ...data, motoboyId: id } });
    res.status(201).json(oc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao registrar ocorrência' });
  }
});

app.put('/api/motoboys/ocorrencias/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboyOcorrencia.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    const { erro, data } = validarOcorrenciaBody(req.body, true);
    if (erro) return res.status(400).json({ error: erro });
    const oc = await prisma.motoboyOcorrencia.update({ where: { id }, data });
    res.json(oc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar ocorrência' });
  }
});

app.delete('/api/motoboys/ocorrencias/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const existe = await prisma.motoboyOcorrencia.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    await prisma.motoboyOcorrencia.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao excluir ocorrência' });
  }
});

// ===== Presença na escala (independente do status de inscrição) =====
app.put('/api/escala-motoboys/inscricoes/:id/presenca', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const insc = await prisma.escalaMotoboyInscricao.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    if (insc.status === 'CANCELADO') {
      return res.status(409).json({ error: 'Não é possível marcar presença em uma inscrição cancelada.' });
    }
    const { presencaStatus, presencaObservacao } = req.body ?? {};
    if (!PRESENCA_STATUS.includes(presencaStatus)) {
      return res.status(400).json({ error: 'presencaStatus inválido' });
    }
    const data = { presencaStatus };
    if (presencaObservacao !== undefined) {
      data.presencaObservacao = String(presencaObservacao).trim() === '' ? null : String(presencaObservacao).trim();
    }
    await prisma.escalaMotoboyInscricao.update({ where: { id }, data });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao registrar presença' });
  }
});

app.listen(PORT, () => console.log(`Operação (PDV) API rodando em http://localhost:${PORT}`));
iniciarAgendadorLembretes();
iniciarAgendadorGrupoVip();
iniciarAgendadorTotem();   // reconciliação da outbox do totem (§5.4)

// Servidor de ingest do coletor DIXI (WebSocket na porta própria 7788).
if (process.env.COLETOR_ENABLED !== 'false') {
  try { iniciarColetorServer(prisma); }
  catch (e) { console.error('[coletor] falha ao iniciar:', e?.message || e); }
}
