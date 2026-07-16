import dotenv from 'dotenv';
// override:true => o .env é a fonte de verdade e SOBRESCREVE variáveis herdadas do
// ambiente (ex.: um JWT_SECRET antigo que o PM2 injeta nos processos filhos).
dotenv.config({ override: true });
import { randomBytes, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import { iniciarColetorServer, gravarPontoColetor } from './coletorServer.js';
import { zapiConfigurado, zapiStatus, zapiQrCode, zapiCriarInstancia, zapiEnviarTexto } from './zapi.mjs';
import { validadeDe, gerarLote, colisaoDeLote, CONSERVACOES } from './etiquetas.js';
import { avaliarResposta, execucaoEmAlerta, fotosCriticasFaltando } from './checklistConformidade.js';
import { venceHoje } from './checklistRecorrencia.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// ── Multi-tenancy (mesmo padrão do H360) ──────────────────
// tenantStore guarda a LOJA (empresaId) da request; a extension injeta empresaId
// automaticamente nas queries dos models de negócio. "Empresa" (a Loja) fica fora.
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
  'funcionarioFace', 'pontoRegistro', 'dispositivo', 'jornada', 'coletorBatidaPendente', 'coletorComando', 'pontoConfig', 'funcao',
  'etiquetaConfig', 'etiquetaRegra', 'etiquetaItemConfig', 'etiquetaImpressa',
  'setor', 'checklistTemplate', 'checklistTemplateItem', 'checklist', 'checklistItem', 'checklistExecucao', 'checklistResposta', 'checklistFoto',
  'checklistNotificacaoConfig', 'checklistDestinatario', 'checklistNotificacaoLog',
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
const PORT = process.env.PORT || 4001;

// ── Identidade compartilhada com o NaChapa HUB ────────────
// O PDV NÃO emite tokens: apenas VALIDA o MESMO JWT do HUB (mesmo JWT_SECRET), que
// chega pelo cookie SSO (th_sso, domínio .nachapahub.com.br) ou por Bearer.
const JWT_SECRET = process.env.JWT_SECRET;

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

// Permissão por área (só para operadores; ADMIN vê tudo). Mapa rota→área, FAIL-CLOSED:
// rota não mapeada = negada. Config/Acessos/WhatsApp não estão no mapa → só o dono.
const AREAS_DISPONIVEIS = ['ponto', 'bonificacao', 'produtos', 'gestao', 'financeiro', 'relatorios', 'talentos', 'checklist', 'etiquetas', 'automacoes'];
const AREA_PREFIXOS = [
  ['/bonificacao', 'bonificacao'],
  ['/funcionarios', 'ponto'], ['/ponto', 'ponto'], ['/jornadas', 'ponto'], ['/funcoes', 'ponto'], ['/dispositivos', 'ponto'], ['/coletor', 'ponto'],
  ['/produtos', 'produtos'], ['/insumos', 'produtos'], ['/estoque', 'produtos'], ['/ficha-tecnica', 'produtos'], ['/fichas', 'produtos'],
  ['/custos', 'gestao'], ['/faturamento', 'gestao'], ['/ponto-equilibrio', 'gestao'],
  ['/financeiro', 'financeiro'],
  ['/relatorios', 'relatorios'],
  ['/candidatos', 'talentos'], ['/vagas', 'talentos'], ['/recrutamento', 'talentos'], ['/talentos', 'talentos'], ['/banco-talentos', 'talentos'],
  ['/checklist', 'checklist'], ['/etiquetas', 'etiquetas'], ['/automacoes', 'automacoes'],
];
const OPERADOR_LIBERADO = new Set(['/auth/me', '/lojas', '/empresa']); // meta + logo (GET); PUT /empresa exige ADMIN no handler
function areaDoPath(path) {
  for (const [pre, area] of AREA_PREFIXOS) { if (path === pre || path.startsWith(pre + '/')) return area; }
  return null;
}
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
    return res.json({ nome: u.nome, papel: 'GERENTE', tipo: 'operador', podePDV: true, areas: u.areas || [] });
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
  return { campos };
}

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
    res.json(lista);
  } catch (err) { console.error('[funcionarios GET]', err); res.status(500).json({ error: 'Erro ao listar a equipe.' }); }
});

app.post('/api/funcionarios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const d = dadosFuncionario(req.body);
    if (d.error) return res.status(400).json({ error: d.error });
    const f = await prisma.funcionario.create({ data: d.campos });
    res.status(201).json(f);
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
    const f = await prisma.funcionario.update({ where: { id }, data: d.campos });
    res.json(f);
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
    try {
      const esp = await calcularEspelho(func.id, ano, mes);
      const marc = (esp.dias || [])
        .filter((d) => !d.futuro && (d.entradaHm || d.situacao === 'falta' || d.situacao === 'incompleto'))
        .map((d) => ({ dia: d.dia, dow: d.dow, entrada: d.entradaHm, saida: d.saidaHm, situacao: d.situacao, atrasoMin: d.atrasoMin }))
        .reverse();
      ponto = { marcacoes: marc, resumo: { diasTrabalhados: esp.totais.diasTrabalhados, atrasos: esp.totais.atrasos, faltas: esp.totais.faltas } };
    } catch (e) { console.error('[colaborador/me ponto]', e?.msg || e); }
    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoPublicaDataUrl || loja?.logoDataUrl || null },
      ano, mes, coletivaPct, coletivo,
      funcionario: { id: func.id, nome: func.nome, funcao: func.funcao || null },
      meu: meu ? rowPublicoBonif(meu) : null,
      totalEquipe: rows.length, // p/ "Xº de N", sem expor a pontuação dos colegas
      ponto,
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

app.get('/api/public/colaborador/checklists', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
    if (!func || func.status !== 'ATIVO') return res.status(401).json({ error: 'Acesso indisponível. Fale com a liderança.' });
    const meus = Array.isArray(func.setorIds) ? func.setorIds : [];
    if (meus.length === 0) return res.json({ hoje: [], disponiveis: [] });

    const checklists = await prisma.checklist.findMany({ where: { empresaId: sess.empresaId, ativo: true, setorIds: { hasSome: meus } }, include: { _count: { select: { itens: true } } } });
    const dataRef = chkDataRefAtual();
    const dow = chkDiaSemanaExpediente();
    // Execuções do dia (para saber o que já foi concluído).
    const execs = await prisma.checklistExecucao.findMany({ where: { empresaId: sess.empresaId, dataRef }, select: { checklistId: true, status: true, emAlerta: true } });
    const execMap = new Map(execs.map((e) => [e.checklistId, e]));
    const mapear = (c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, itens: c._count.itens, recorrenciaTipo: c.recorrenciaTipo, status: execMap.get(c.id)?.status || null, emAlerta: execMap.get(c.id)?.emAlerta || false });
    const hoje = [], disponiveis = [];
    for (const c of checklists) {
      if (venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow)) hoje.push(mapear(c));
      else if (c.recorrenciaTipo === 'AVULSO') disponiveis.push(mapear(c));
    }
    res.json({ hoje, disponiveis });
  } catch (err) { console.error('[colab/checklists]', err); res.status(500).json({ error: 'Erro ao carregar checklists.' }); }
});

// Interseção de setores — mesma regra usada tanto pra abrir uma execução nova
// (chkAbrirExecucao) quanto pra checar posse de uma execução já existente
// (chkPosseExecucao, logo abaixo). Um único ponto de verdade evita a regra de posse
// divergir entre as duas.
const chkSetoresIntersectam = (setoresA, setoresB) => Array.isArray(setoresA) && setoresA.some((s) => setoresB.includes(s));

// Verifica posse (checklist do meu setor) e devolve a execução do dia com snapshot.
async function chkAbrirExecucao(sess, checklistId) {
  const func = await prisma.funcionario.findFirst({ where: { id: sess.funcionarioId, empresaId: sess.empresaId } });
  if (!func || func.status !== 'ATIVO') throw { http: 401, msg: 'Acesso indisponível.' };
  const meus = Array.isArray(func.setorIds) ? func.setorIds : [];
  const c = await prisma.checklist.findFirst({ where: { id: checklistId, empresaId: sess.empresaId, ativo: true }, include: { itens: { orderBy: { ordem: 'asc' } } } });
  if (!c) throw { http: 404, msg: 'Checklist não encontrado.' };
  if (!chkSetoresIntersectam(c.setorIds, meus)) throw { http: 403, msg: 'Este checklist não é do seu setor.' };
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
      // (ex.: dois colaboradores do mesmo setor clicando ao mesmo tempo) fazem os dois
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
    const { exec } = await chkAbrirExecucao(sess, parseInt(req.params.id, 10));
    res.status(201).json({ execucao: chkExecJson(exec) });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/iniciar]', e); res.status(500).json({ error: 'Erro ao iniciar.' }); }
});

function chkExecJson(exec) {
  const rmap = {}; for (const r of exec.respostas || []) rmap[r.itemChave] = { valor: r.valorJson, conforme: r.conforme, observacao: r.observacao };
  const fmap = {}; for (const f of exec.fotos || []) fmap[f.itemChave] = { id: f.id };
  return { id: exec.id, checklistId: exec.checklistId, status: exec.status, emAlerta: exec.emAlerta, itens: exec.itensSnapshotJson, respostas: rmap, fotos: fmap };
}

// Posse por SETOR de uma execução JÁ EXISTENTE — não basta filtrar por empresaId: dentro
// da MESMA loja, um colaborador do setor A não pode ler/responder/concluir a execução de
// um checklist do setor B só chutando o id (inteiros sequenciais, adivinháveis). A
// execução é prova, então as 3 rotas de execução (GET, PUT resposta, POST concluir)
// passam por aqui em vez de um findFirst bare por empresaId. Mesma regra de interseção de
// chkAbrirExecucao (chkSetoresIntersectam), pra não divergir entre "abrir" e "continuar".
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
  const meus = Array.isArray(func.setorIds) ? func.setorIds : [];
  if (!chkSetoresIntersectam(checklist.setorIds, meus)) throw { http: 403, msg: 'Esta execução não é do seu setor.' };
  return exec;
}

app.get('/api/public/colaborador/execucoes/:id', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const exec = await chkPosseExecucao(sess, parseInt(req.params.id, 10), { comRespostas: true });
    res.json({ execucao: chkExecJson(exec) });
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

// Bytes da foto sob demanda (o operador vê a própria; posse por setor garante isolamento).
app.get('/api/public/colaborador/fotos/:id', async (req, res) => {
  try {
    const sess = exigirColaborador(req, res); if (!sess) return;
    const foto = await prisma.checklistFoto.findFirst({ where: { id: parseInt(req.params.id, 10), empresaId: sess.empresaId } });
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });
    await chkPosseExecucao(sess, foto.execucaoId); // 403 se não for do setor
    res.json({ dataUrl: foto.dataUrl });
  } catch (e) { if (e.http) return res.status(e.http).json({ error: e.msg }); console.error('[colab/fotos GET]', e); res.status(500).json({ error: 'Erro ao carregar a foto.' }); }
});

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
    // updateMany com empresaId no where: exec já veio validado com empresaId neste handler,
    // mas o filtro fica explícito aqui também para o isolamento sobreviver a um refactor futuro.
    await prisma.checklistExecucao.updateMany({ where: { id: exec.id, empresaId: sess.empresaId }, data: { status: 'CONCLUIDA', concluidaEm: new Date(), emAlerta } });
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
    const vagas = await tenantStore.run({ empresaId: cfg.empresaId }, () => prisma.vaga.findMany({ where: { status: 'ABERTA' }, select: { id: true, titulo: true }, orderBy: { criadoEm: 'desc' } }));
    res.json({ empresa: { nome: (empr?.nome ?? '').trim() || 'Hamburgueria', logo: empr?.logoDataUrl ?? null }, formulario: cfg.formulario || formPadrao(false), vagas, termoVersao: cfg.termoVersao });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});
// ---------- PÚBLICO: formulário de uma VAGA específica ----------
app.get('/api/public/talentos/:slug/vagas/:vagaId', async (req, res) => {
  try {
    const cfg = await prisma.recrutamentoConfig.findUnique({ where: { slug: String(req.params.slug) } });
    if (!cfg || !cfg.publicoAtivo) return res.status(404).json({ error: 'Formulário indisponível' });
    const empr = await prisma.empresa.findUnique({ where: { id: cfg.empresaId }, select: { nome: true, logoDataUrl: true } }).catch(() => null);
    const vaga = await tenantStore.run({ empresaId: cfg.empresaId }, () => prisma.vaga.findUnique({ where: { id: Number(req.params.vagaId) }, select: { id: true, titulo: true, descricao: true, status: true, jornada: true, formulario: true } }));
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
        }
      }
    });
    res.json(insumos.map(insumoSaida));
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
    res.json(await sincronizarCustoComReceita(id));
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

    res.status(201).json(await sincronizarCustoComReceita(id));
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

    res.json(await sincronizarCustoComReceita(item.receita.insumoId));
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

    res.json(await sincronizarCustoComReceita(item.receita.insumoId));
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

const TIPOS_PRODUTO = ['PRODUTO', 'BEBIDA', 'COMBO'];
const TIPOS_BEBIDA_ANALISE = ['COMMODITY', 'AUTORAL'];

// Defaults estratégicos por tipo (V0 da Inteligência do cardápio): bebidas
// nascem fora do ranking estratégico e classificadas como COMMODITY; produtos
// e combos entram no ranking por padrão. Campos do body sobrescrevem o default.
function camposEstrategicosCreate(tipoFinal, body) {
  const ancora = body.produtoAncora === true;
  // Produto isca: aplicável a produto/combo (oculto para bebida)
  const isca = body.produtoIsca === true;
  let incluir;
  if (typeof body.incluirAnaliseEstrategica === 'boolean') {
    incluir = body.incluirAnaliseEstrategica;
  } else {
    incluir = tipoFinal === 'BEBIDA' ? false : true;
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
      return res.status(400).json({ error: 'tipoProduto deve ser PRODUTO, BEBIDA ou COMBO' });
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
        custoDireto:
          custoDireto === undefined || custoDireto === null || custoDireto === ''
            ? null
            : Number(custoDireto),
        ativo: true,
        ...camposEstrategicosCreate(tipoFinal, body)
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
      nome, descricao, precoVenda, ativo, tipoProduto, custoDireto,
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
        return res.status(400).json({ error: 'tipoProduto deve ser PRODUTO, BEBIDA ou COMBO' });
      }
      data.tipoProduto = tipoProduto;
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
          custoDireto: original.custoDireto,
          ativo: true,
          // Preserva a configuração estratégica do original
          produtoAncora: original.produtoAncora,
          produtoIsca: original.produtoIsca,
          incluirAnaliseEstrategica: original.incluirAnaliseEstrategica,
          tipoBebidaAnalise: original.tipoBebidaAnalise
        }
      });

      if (tipo === 'PRODUTO' && original.fichaTecnica.length > 0) {
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
// BEBIDA: custo direto de compra (0 quando não informado) — incluirEmbalagem não se aplica.
// PRODUTO: custo total real da ficha; por padrão (incluirEmbalagem=false) desconta
// a embalagem individual (tipoUso=EMBALAGEM), pois o combo usa embalagem própria.
function custoRealItemCombo(produto, incluirEmbalagem) {
  if ((produto.tipoProduto ?? 'PRODUTO') === 'BEBIDA') {
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
  const ehProduto = (item.produto.tipoProduto ?? 'PRODUTO') !== 'BEBIDA';
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
      custoDireto:
        produto.custoDireto === null || produto.custoDireto === undefined
          ? null
          : round2(Number(produto.custoDireto))
    };

    const config = await getConfigPrecificacao();

    // ===== BEBIDA: revenda simples — análise por lucro/margem, sem régua de
    // CMV de produto próprio e sem exigir ficha técnica =====
    if (produtoOut.tipoProduto === 'BEBIDA') {
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
app.get('/api/ponto/dispositivos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const ds = await prisma.dispositivo.findMany({ orderBy: { criadoEm: 'asc' } });
    res.json(ds.map((d) => ({ id: d.id, nome: d.nome, token: d.token, ativo: d.ativo, ultimaSync: d.ultimaSync })));
  } catch (err) { console.error('[ponto/dispositivos GET]', err); res.status(500).json({ error: 'Erro ao carregar dispositivos.' }); }
});
app.post('/api/ponto/dispositivos', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 60) : '';
    if (!nome) return res.status(400).json({ error: 'Informe o nome do dispositivo.' });
    const d = await prisma.dispositivo.create({ data: { nome, token: randomBytes(12).toString('base64url') } });
    res.status(201).json({ id: d.id, nome: d.nome, token: d.token, ativo: d.ativo });
  } catch (err) { console.error('[ponto/dispositivos POST]', err); res.status(500).json({ error: 'Erro ao criar o dispositivo.' }); }
});
app.delete('/api/ponto/dispositivos/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.dispositivo.delete({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (err) { console.error('[ponto/dispositivos DELETE]', err); res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===== Marcações + Painel (ADMIN) =====
app.get('/api/ponto/marcacoes', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const where = {};
    if (req.query.funcionarioId) where.funcionarioId = parseInt(req.query.funcionarioId, 10);
    // Filtro por intervalo (de/ate = YYYY-MM-DD, inclusivo), no fuso BR fixo. `data` (dia único) mantido por compat.
    const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null; };
    const de = ymd(req.query.de), ate = ymd(req.query.ate);
    if (de || ate) {
      const cond = {};
      if (de) cond.gte = new Date(brToUtcMs(de.y, de.mo, de.d, 0, 0));
      if (ate) cond.lt = new Date(brToUtcMs(ate.y, ate.mo, ate.d + 1, 0, 0)); // dia seguinte (exclusivo)
      where.dataHora = cond;
    } else if (req.query.data) {
      const d0 = ymd(req.query.data);
      if (d0) where.dataHora = { gte: new Date(brToUtcMs(d0.y, d0.mo, d0.d, 0, 0)), lt: new Date(brToUtcMs(d0.y, d0.mo, d0.d + 1, 0, 0)) };
    }
    const regs = await prisma.pontoRegistro.findMany({ where, orderBy: { dataHora: 'desc' }, take: 1000 });
    const fs = new Map((await prisma.funcionario.findMany()).map((f) => [f.id, f.nome]));
    res.json(regs.map((r) => ({ id: r.id, funcionarioId: r.funcionarioId, funcionarioNome: fs.get(r.funcionarioId) || '—', tipo: r.tipo, tipoLabel: PONTO_LABEL[r.tipo] || r.tipo, dataHora: r.dataHora, origem: r.origem, distancia: r.distancia, invalidada: r.invalidada, observacao: r.observacao || null })));
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

    // Folga fixa do colaborador sobrepõe a jornada: o dia vira folga mesmo que a jornada previsse trabalho.
    const folgaColab = Array.isArray(func.folgaSemana) && func.folgaSemana.includes(dow);
    let previstoMin = 0, entradaPrevMs = null, folga = true;
    if (cfg && !cfg.folga && cfg.entrada && cfg.saida && !folgaColab) {
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
        situacao = semJornada ? 'trabalhado' : 'folga_trabalhada';
        tot.diasTrabalhados++;
      } else situacao = semJornada ? 'vazio' : 'folga';
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
async function resolverDispositivo(token) {
  return prisma.dispositivo.findFirst({ where: { token: String(token), ativo: true } });
}
app.get('/api/public/ponto/:token', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const loja = await prisma.empresa.findUnique({ where: { id: disp.empresaId }, select: { nome: true, logoDataUrl: true } });
    res.json({ dispositivo: { nome: disp.nome }, loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null }, limiar: PONTO_LIMIAR });
  } catch (err) { console.error('[public/ponto GET]', err); res.status(500).json({ error: 'Erro.' }); }
});

// Identifica pelo vetor (matching no servidor).
app.post('/api/public/ponto/:token/identificar', async (req, res) => {
  try {
    const disp = await resolverDispositivo(req.params.token);
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
    const disp = await resolverDispositivo(req.params.token);
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
    const disp = await resolverDispositivo(req.params.token);
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
  { conservacao: 'RESFRIADO_0_4', tempLabel: '0 a 4 °C', dias: 5, ordem: 1 },
  { conservacao: 'RESFRIADO_4_6', tempLabel: '4 a 6 °C', dias: 3, ordem: 2 },
  { conservacao: 'AMBIENTE', tempLabel: '<= 25 °C', dias: 30, ordem: 3 },
  { conservacao: 'DESCONGELADO', tempLabel: '0 a 4 °C', dias: 1, ordem: 4 },
  { conservacao: 'ABERTO', tempLabel: 'Conforme fabricante', dias: 3, ordem: 5 },
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
        campos: b.campos && typeof b.campos === 'object' ? b.campos : {},
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
    const disp = await resolverDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ error: 'Dispositivo não autorizado.' });
    const empresaId = disp.empresaId;

    const [loja, config, regras, insumos, cfgs, funcionarios] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true } }),
      prisma.etiquetaConfig.findFirst({ where: { empresaId } }),
      prisma.etiquetaRegra.findMany({ where: { empresaId, ativo: true }, orderBy: { ordem: 'asc' } }),
      prisma.insumo.findMany({ where: { empresaId, ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
      // TODOS os configs, inclusive os desligados: o desligado não some daqui, ele
      // TIRA o insumo da lista (ver a semântica do `ativo`, abaixo). Filtrar por
      // `ativo: true` na query era o bug — o config sumia, o item continuava
      // aparecendo (a lista sai de `insumos`, o config só enriquece) e o /registrar
      // achava o mesmo config e aplicava o override que o admin tinha desativado.
      prisma.etiquetaItemConfig.findMany({ where: { empresaId } }),
      prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true } }),
    ]);

    // Quem bateu ponto no expediente corrente aparece primeiro: é quem está na
    // cozinha agora, e a lista inteira num tablet é lenta de percorrer.
    const { de, ate } = janelaExpedienteAtual();
    const presentes = new Set((await prisma.pontoRegistro.findMany({
      where: { empresaId, invalidada: false, dataHora: { gte: de, lt: ate } }, select: { funcionarioId: true },
    })).map((r) => r.funcionarioId));

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
        return { insumoId: i.id, nome: i.nome, conservacaoPadrao: c?.conservacaoPadrao || null, validadeDias: c?.validadeDias ?? null };
      });

    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null },
      dispositivo: { nome: disp.nome },
      config: config || { larguraMm: 50, alturaMm: 30, razaoSocial: loja?.nome || null },
      regras,
      itens,
      funcionarios: funcionarios
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
    const disp = await resolverDispositivo(req.params.token);
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

// ---- Setores
app.get('/api/checklist/setores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { res.json({ setores: await prisma.setor.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }) }); }
  catch (err) { console.error('[checklist/setores GET]', err); res.status(500).json({ error: 'Erro ao carregar setores.' }); }
});
app.post('/api/checklist/setores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const nome = chkOnly(req.body?.nome, 60);
    if (!nome) return res.status(400).json({ error: 'Informe o nome do setor.' });
    const setor = await prisma.setor.create({ data: { nome, ordem: parseInt(req.body?.ordem, 10) || 0 } });
    res.status(201).json({ ok: true, setor });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
    console.error('[checklist/setores POST]', err); res.status(500).json({ error: 'Erro ao criar setor.' });
  }
});
app.put('/api/checklist/setores/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const atual = await prisma.setor.findFirst({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Setor não encontrado.' });
    const data = {};
    if (req.body?.nome !== undefined) data.nome = chkOnly(req.body.nome, 60) || atual.nome;
    if (req.body?.ativo !== undefined) data.ativo = req.body.ativo !== false;
    if (req.body?.ordem !== undefined) data.ordem = parseInt(req.body.ordem, 10) || 0;
    const setor = await prisma.setor.update({ where: { id }, data });
    res.json({ ok: true, setor });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
    console.error('[checklist/setores PUT]', err); res.status(500).json({ error: 'Erro ao salvar setor.' });
  }
});
app.delete('/api/checklist/setores/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try { await prisma.setor.delete({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (err) { console.error('[checklist/setores DELETE]', err); res.status(500).json({ error: 'Erro ao excluir setor.' }); }
});

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
    itens.push({ ordem: i, tipo: it.tipo, titulo, descricao: chkOnly(it.descricao, 300), critico: !!it.critico, config: it.config && typeof it.config === 'object' ? it.config : null });
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

// ---- Checklists (a partir de template ou do zero) + atribuição de setor ao colaborador
const PRIORIDADES = new Set(['BAIXA', 'MEDIA', 'ALTA']);
const RECORRENCIAS = new Set(['DIARIA', 'DIAS_SEMANA', 'AVULSO']);

// Normaliza os dados de cabeçalho do Checklist. `fallback` é o registro atual no PUT
// (mantém o que não veio no body); no POST é null.
function chkDadosChecklist(body, fallback) {
  const nome = chkOnly(body?.nome, 120);
  if (!nome && !fallback) throw { http: 400, msg: 'Informe o nome do checklist.' };
  const setorIds = Array.isArray(body?.setorIds) ? [...new Set(body.setorIds.map((n) => parseInt(n, 10)).filter(Number.isFinite))] : (fallback?.setorIds || []);
  const rc = body?.recorrenciaConfig && typeof body.recorrenciaConfig === 'object' ? body.recorrenciaConfig : {};
  const diasSemana = Array.isArray(rc.diasSemana) ? [...new Set(rc.diasSemana.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))] : [];
  return {
    nome: nome || fallback.nome,
    categoria: CHECKLIST_CATEGORIAS.includes(body?.categoria) ? body.categoria : (fallback?.categoria || CHECKLIST_CATEGORIAS[0]),
    descricao: chkOnly(body?.descricao, 300),
    prioridade: PRIORIDADES.has(body?.prioridade) ? body.prioridade : (fallback?.prioridade || 'MEDIA'),
    setorIds,
    recorrenciaTipo: RECORRENCIAS.has(body?.recorrenciaTipo) ? body.recorrenciaTipo : (fallback?.recorrenciaTipo || 'AVULSO'),
    recorrenciaConfig: { diasSemana, horarioLimite: chkOnly(rc.horarioLimite, 5) },
  };
}

app.get('/api/checklist/checklists', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const where = { ativo: true };
    if (busca) where.nome = { contains: busca, mode: 'insensitive' };
    const checklists = await prisma.checklist.findMany({ where, orderBy: { nome: 'asc' }, include: { _count: { select: { itens: true } } } });
    res.json({ checklists });
  } catch (err) { console.error('[checklist/checklists GET]', err); res.status(500).json({ error: 'Erro ao carregar checklists.' }); }
});
app.get('/api/checklist/checklists/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await prisma.checklist.findFirst({ where: { id: parseInt(req.params.id, 10) }, include: { itens: { orderBy: { ordem: 'asc' } } } });
    if (!c) return res.status(404).json({ error: 'Checklist não encontrado.' });
    res.json({ checklist: c });
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

// Colaboradores + atribuição de setor
app.get('/api/checklist/colaboradores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const fs = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true, setorIds: true } });
    res.json({ colaboradores: fs });
  } catch (err) { console.error('[checklist/colaboradores GET]', err); res.status(500).json({ error: 'Erro ao carregar colaboradores.' }); }
});
app.put('/api/checklist/colaboradores/:id/setores', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const func = await prisma.funcionario.findFirst({ where: { id } });
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    const setorIds = Array.isArray(req.body?.setorIds) ? [...new Set(req.body.setorIds.map((n) => parseInt(n, 10)).filter(Number.isFinite))] : [];
    await prisma.funcionario.update({ where: { id }, data: { setorIds } });
    res.json({ ok: true, setorIds });
  } catch (err) { console.error('[checklist/colaboradores setores]', err); res.status(500).json({ error: 'Erro ao salvar setores.' }); }
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
    const checklists = await prisma.checklist.findMany({ where: { ativo: true }, include: { _count: { select: { itens: true } } } });
    const execs = await prisma.checklistExecucao.findMany({ where: { dataRef }, select: { checklistId: true, status: true, emAlerta: true } });
    const execMap = new Map(execs.map((e) => [e.checklistId, e]));
    const venceHojeLista = checklists.filter((c) => venceHoje({ recorrenciaTipo: c.recorrenciaTipo, recorrenciaConfig: c.recorrenciaConfig }, dow));
    const concluidosHoje = execs.filter((e) => e.status === 'CONCLUIDA').length;
    const emAlerta = execs.filter((e) => e.emAlerta).length;
    const pendentes = venceHojeLista.filter((c) => execMap.get(c.id)?.status !== 'CONCLUIDA')
      .map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, status: execMap.get(c.id)?.status || 'PENDENTE' }));
    const alertas = checklists.filter((c) => execMap.get(c.id)?.emAlerta).map((c) => ({ id: c.id, nome: c.nome }));
    res.json({
      kpis: { ativos: checklists.length, venceHoje: venceHojeLista.length, concluidosHoje, emAlerta },
      pendentes, alertas,
      meus: checklists.slice(0, 20).map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, prioridade: c.prioridade, recorrenciaTipo: c.recorrenciaTipo, itens: c._count.itens })),
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

app.listen(PORT, () => console.log(`Operação (PDV) API rodando em http://localhost:${PORT}`));

// Servidor de ingest do coletor DIXI (WebSocket na porta própria 7788).
if (process.env.COLETOR_ENABLED !== 'false') {
  try { iniciarColetorServer(prisma); }
  catch (e) { console.error('[coletor] falha ao iniciar:', e?.message || e); }
}
