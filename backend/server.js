import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

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
  'bonificacaoNivel', 'bonificacaoXp',
  'conquista', 'conquistaDesbloqueada',
  'bonificacaoMoeda', 'mercadoItem', 'mercadoResgate',
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

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'operacao-pdv' }));

// Perfil do usuário logado, lido do JWT do HUB.
app.get('/api/auth/me', (req, res) => {
  const u = req.user;
  res.json({
    id: u.membroId, nome: u.nome, email: u.email, role: u.role,
    papel: u.papel, clienteId: u.clienteId ?? null, podePDV: podeAcessarPDV(u),
  });
});

async function getEmpresa() {
  const empresaId = getEmpresaIdAtual();
  if (empresaId != null) return prisma.empresa.findUnique({ where: { id: empresaId } });
  return prisma.empresa.findFirst({ orderBy: { id: 'asc' } });
}

// Lojas que o usuário pode ver (ADMIN: todas).
app.get('/api/lojas', async (req, res) => {
  try {
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
    const { nome, whatsapp, endereco, logoDataUrl } = req.body ?? {};
    const data = {};
    if (nome !== undefined) { const v = String(nome).trim(); if (!v) return res.status(400).json({ error: 'O nome da empresa é obrigatório.' }); data.nome = v; }
    for (const [campo, valor] of Object.entries({ whatsapp, endereco })) {
      if (valor !== undefined) { const v = String(valor).trim(); data[campo] = v === '' ? null : v; }
    }
    if (logoDataUrl !== undefined) data.logoDataUrl = logoDataUrl || null;
    const upd = await prisma.empresa.update({ where: { id: empresa.id }, data });
    res.json(upd);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao atualizar empresa' }); }
});

app.listen(PORT, () => console.log(`Operação (PDV) API rodando em http://localhost:${PORT}`));
