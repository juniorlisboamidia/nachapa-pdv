import 'dotenv/config';
import { randomBytes } from 'node:crypto';
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


// ===================== Dep. Pessoal: Equipe + Bonificação (portado do H360) =====================

// ===== Dep. Pessoal › Equipe (cadastro de funcionários internos) =====
// Área RESTRITA a ADMIN (Dep. Pessoal inteiro é só do administrador). Escopo por
// loja é automático (funcionario está em MODELS_TENANT).
function exigirAdmin(req, res) {
  if (req.user?.papel !== 'ADMIN') { res.status(403).json({ error: 'Apenas o administrador acessa o Departamento Pessoal.' }); return false; }
  return true;
}
const FUNCIONARIO_STATUS = new Set(['ATIVO', 'INATIVO']);
function dadosFuncionario(body) {
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  if (!nome) return { error: 'Informe o nome.' };
  const status = FUNCIONARIO_STATUS.has(body?.status) ? body.status : 'ATIVO';
  const only = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
  return {
    campos: {
      nome: nome.slice(0, 160),
      funcao: only(body?.funcao, 80),
      cpf: only(body?.cpf, 20),
      whatsapp: only(body?.whatsapp, 30),
      status,
    },
  };
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

// ===== Dep. Pessoal › Bonificação — configuração por loja (ADMIN) =====
const BONI_PILARES = new Set(['ASSIDUIDADE', 'DESEMPENHO']);
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
const BONI_REGRAS = new Set(['XP_TOTAL', 'NIVEL', 'VITORIAS', 'PODIOS', 'MESES_ATIVOS', 'PRESENCA_100', 'SCORE_100', 'MANUAL']);
const BONI_CONQUISTAS_PADRAO = [
  { emoji: '🔥', nome: 'Primeira Chama', descricao: 'Participou do primeiro fechamento do mês.', raridade: 'COMUM', regra: 'MESES_ATIVOS', meta: 1, xpBonus: 50, ordem: 0 },
  { emoji: '💯', nome: 'Presença Perfeita', descricao: 'Fechou um mês inteiro sem faltas nem atrasos (Presença 100%).', raridade: 'RARO', regra: 'PRESENCA_100', meta: 1, xpBonus: 100, ordem: 1 },
  { emoji: '🎯', nome: 'Trabalho Impecável', descricao: 'Fechou um mês com Score 100%, sem nenhuma ocorrência.', raridade: 'RARO', regra: 'SCORE_100', meta: 1, xpBonus: 100, ordem: 2 },
  { emoji: '⭐', nome: 'Destaque do Mês', descricao: 'Ficou em 1º lugar no ranking pela primeira vez.', raridade: 'RARO', regra: 'VITORIAS', meta: 1, xpBonus: 150, ordem: 3 },
  { emoji: '🥇', nome: 'Pódio Frequente', descricao: 'Chegou ao Top 3 em 5 meses.', raridade: 'EPICO', regra: 'PODIOS', meta: 5, xpBonus: 200, ordem: 4 },
  { emoji: '🏆', nome: 'Tricampeão', descricao: 'Foi o destaque do mês 3 vezes.', raridade: 'EPICO', regra: 'VITORIAS', meta: 3, xpBonus: 300, ordem: 5 },
  { emoji: '🚀', nome: 'Veterano', descricao: 'Está há 6 meses somando pontos com a equipe.', raridade: 'EPICO', regra: 'MESES_ATIVOS', meta: 6, xpBonus: 200, ordem: 6 },
  { emoji: '👑', nome: 'Lenda da Chapa', descricao: 'Alcançou o Nível 5.', raridade: 'LENDARIO', regra: 'NIVEL', meta: 5, xpBonus: 500, ordem: 7 },
];
const conquistaJson = (c, extra = {}) => ({ id: c.id, nome: c.nome, descricao: c.descricao || null, emoji: c.emoji, raridade: c.raridade, regra: c.regra, meta: c.meta, xpBonus: c.xpBonus, ativo: c.ativo, ordem: c.ordem, ...extra });

// Métricas de conquista por funcionário, a partir de TODOS os fechamentos da loja.
function metricasConquista(fechamentos) {
  const m = new Map();
  const get = (id) => { let x = m.get(id); if (!x) { x = { vitorias: 0, podios: 0, mesesAtivos: 0, presenca100: 0, score100: 0 }; m.set(id, x); } return x; };
  for (const f of fechamentos) {
    const itens = Array.isArray(f.itensJson) ? f.itensJson : [];
    for (const r of itens) {
      if (r?.funcionarioId == null) continue;
      const x = get(r.funcionarioId);
      x.mesesAtivos += 1;
      if (Number(r.posicao) === 1) x.vitorias += 1;
      if (Number(r.posicao) <= 3) x.podios += 1;
      if (Number(r.assidPct) >= 100) x.presenca100 += 1;
      if (Number(r.desPct) >= 100) x.score100 += 1;
    }
  }
  return m;
}
const valorRegraConquista = (regra, xp, nivel, met) => ({
  XP_TOTAL: xp, NIVEL: nivel, VITORIAS: met.vitorias, PODIOS: met.podios,
  MESES_ATIVOS: met.mesesAtivos, PRESENCA_100: met.presenca100, SCORE_100: met.score100,
}[regra]);

// Avalia conquistas automáticas p/ a loja atual (tenantStore). Concede as recém-atingidas
// (+ XP bônus) e repete até estabilizar (o XP bônus pode desbloquear conquistas de XP/nível).
async function avaliarConquistas() {
  const conquistas = await prisma.conquista.findMany({ where: { ativo: true } });
  const autos = conquistas.filter((c) => c.regra !== 'MANUAL' && BONI_REGRAS.has(c.regra));
  if (!autos.length) return 0;
  const cfg = await prisma.bonificacaoConfig.findFirst();
  const xpN = cfg?.xpPorNivel ?? 500;
  const nomesNivel = (await prisma.bonificacaoNivel.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })).map((n) => n.nome);
  const funcs = await prisma.funcionario.findMany();
  const met = metricasConquista(await prisma.bonificacaoFechamento.findMany());
  const jaTem = new Set((await prisma.conquistaDesbloqueada.findMany()).map((d) => `${d.conquistaId}:${d.funcionarioId}`));
  const VAZIO = { vitorias: 0, podios: 0, mesesAtivos: 0, presenca100: 0, score100: 0 };
  let total = 0;
  for (let iter = 0; iter < 6; iter++) {
    const xpMap = await xpPorFuncionario(); // re-lê a cada passada (bônus muda o XP)
    const novos = [];
    for (const f of funcs) {
      const xp = xpMap.get(f.id) || 0;
      const nivel = nivelDeXp(xp, xpN, nomesNivel).nivel;
      const mf = met.get(f.id) || VAZIO;
      for (const c of autos) {
        const chave = `${c.id}:${f.id}`;
        if (jaTem.has(chave)) continue;
        const val = valorRegraConquista(c.regra, xp, nivel, mf);
        if (val != null && val >= c.meta) novos.push({ c, f });
      }
    }
    if (!novos.length) break;
    for (const { c, f } of novos) {
      jaTem.add(`${c.id}:${f.id}`);
      await prisma.conquistaDesbloqueada.create({ data: { conquistaId: c.id, funcionarioId: f.id, origem: 'AUTO' } });
      if (c.xpBonus > 0) await prisma.bonificacaoXp.create({ data: { funcionarioId: f.id, pontos: c.xpBonus, motivo: `Conquista: ${c.nome}`, origem: 'CONQUISTA' } });
      total += 1;
    }
  }
  return total;
}
function bonificacaoConfigJson(c) {
  return {
    ativo: c.ativo,
    tokenPublico: c.tokenPublico || null,
    tetoAssiduidade: Number(c.tetoAssiduidade), tetoDesempenho: Number(c.tetoDesempenho), tetoColetiva: Number(c.tetoColetiva),
    bonusTop1: Number(c.bonusTop1), bonusTop2: Number(c.bonusTop2), bonusTop3: Number(c.bonusTop3),
    xpPorNivel: c.xpPorNivel ?? 500,
    moedasPorReal: Number(c.moedasPorReal ?? 1),
  };
}
const bonificacaoTipoJson = (t) => ({ id: t.id, nome: t.nome, pilar: t.pilar, percentual: Number(t.percentual), ordem: t.ordem, ativo: t.ativo });
// Nível a partir do XP total (níveis uniformes de xpPorNivel).
function nivelDeXp(totalXp, xpPorNivel, nomes) {
  const xpN = Math.max(1, xpPorNivel || 500);
  const xp = Math.max(0, totalXp || 0);
  const nivel = Math.floor(xp / xpN) + 1;
  const nome = (nomes && nomes[nivel - 1]) || `Nível ${nivel}`;
  const noNivel = xp % xpN;
  return { nivel, nome, xpTotal: xp, xpNoNivel: noNivel, xpProximo: xpN, progresso: Math.round((noNivel / xpN) * 100) };
}
// XP total por funcionário (mapa funcionarioId → soma). empresaId explícito p/ rota pública.
async function xpPorFuncionario(where = {}) {
  const g = await prisma.bonificacaoXp.groupBy({ by: ['funcionarioId'], _sum: { pontos: true }, where });
  const m = new Map();
  for (const r of g) m.set(r.funcionarioId, r._sum.pontos || 0);
  return m;
}
// Saldo de moedas por funcionário (mapa funcionarioId → soma do ledger). empresaId explícito p/ rota pública.
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
const mercadoItemJson = (i, extra = {}) => ({ id: i.id, nome: i.nome, descricao: i.descricao || null, emoji: i.emoji, custo: i.custo, estoque: i.estoque, ativo: i.ativo, ordem: i.ordem, ...extra });

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
    };
    const existente = await prisma.bonificacaoConfig.findFirst();
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
        norm.push({ id: idExist, nome, pilar, percentual, ordem: i });
      });
      const manter = norm.filter((t) => t.id != null).map((t) => t.id);
      await prisma.$transaction([
        prisma.bonificacaoTipoOcorrencia.deleteMany(manter.length ? { where: { id: { notIn: manter } } } : {}),
        ...norm.filter((t) => t.id != null).map((t) => prisma.bonificacaoTipoOcorrencia.update({ where: { id: t.id }, data: { nome: t.nome, pilar: t.pilar, percentual: t.percentual, ordem: t.ordem } })),
        ...norm.filter((t) => t.id == null).map((t) => prisma.bonificacaoTipoOcorrencia.create({ data: { nome: t.nome, pilar: t.pilar, percentual: t.percentual, ordem: t.ordem } })),
      ]);
    }

    const tipos = await prisma.bonificacaoTipoOcorrencia.findMany({ orderBy: [{ pilar: 'asc' }, { ordem: 'asc' }, { id: 'asc' }] });
    const niveis = await prisma.bonificacaoNivel.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    res.json({ config: bonificacaoConfigJson(c), tipos: tipos.map(bonificacaoTipoJson), niveis: niveis.map((n) => ({ id: n.id, nome: n.nome, ordem: n.ordem })) });
  } catch (err) { console.error('[bonificacao/config PUT]', err); res.status(500).json({ error: 'Erro ao salvar a configuração.' }); }
});

// ===== Bonificação — motor mensal (lançamentos, coletiva, cálculo, fechamento) =====
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ocorrenciaJson = (o) => ({ id: o.id, funcionarioId: o.funcionarioId, tipoId: o.tipoId, nomeTipo: o.nomeTipo, pilar: o.pilar, percentual: Number(o.percentual), data: o.data, observacao: o.observacao || null });

// Calcula as linhas do mês (por funcionário) a partir das ocorrências + coletiva + tetos.
function calcularLinhasBonificacao(funcionarios, ocorrencias, coletivaPct, t) {
  const porFunc = new Map();
  for (const o of ocorrencias) {
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
    const assidRs = r2(assidPct / 100 * t.tetoA);
    const desRs = r2(desPct / 100 * t.tetoD);
    const colRs = r2(coletivaPct / 100 * t.tetoC);
    const subtotal = r2(assidRs + desRs + colRs);
    return { funcionarioId: f.id, nome: f.nome, funcao: f.funcao || null, assidPct: r2(assidPct), desPct: r2(desPct), coletivaPct: r2(coletivaPct), assidRs, desRs, colRs, subtotal, ocorrencias: g.ocorrencias };
  });
  // Ranking: maior subtotal; desempate por Assiduidade, depois id. Top 3 levam bônus.
  const bonus = [t.b1, t.b2, t.b3];
  [...rows].sort((a, b) => b.subtotal - a.subtotal || b.assidPct - a.assidPct || a.funcionarioId - b.funcionarioId)
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
      return res.json({ fechado: true, fechadoEm: fech.fechadoEm, fechadoPor: fech.fechadoPor, coletivaPct: Number(fech.coletivaPct), totalGeral: Number(fech.totalGeral), funcionarios: fech.itensJson, config: configOut });
    }
    const col = await prisma.bonificacaoColetiva.findFirst({ where: { ano: am.ano, mes: am.mes } });
    const coletivaPct = col ? Number(col.percentual) : 0;
    const funcionarios = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } });
    const ocorrencias = await prisma.bonificacaoOcorrencia.findMany({ where: { ano: am.ano, mes: am.mes }, orderBy: { data: 'desc' } });
    const rows = calcularLinhasBonificacao(funcionarios, ocorrencias, coletivaPct, t);
    res.json({ fechado: false, coletivaPct, totalGeral: r2(rows.reduce((s, r) => s + r.totalRs, 0)), funcionarios: rows, config: configOut });
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
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    const tipoId = parseInt(req.body?.tipoId, 10);
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const tipo = await prisma.bonificacaoTipoOcorrencia.findFirst({ where: { id: tipoId } });
    if (!tipo) return res.status(400).json({ error: 'Tipo de ocorrência inválido.' });
    const data = req.body?.data ? new Date(req.body.data) : new Date();
    if (isNaN(data.getTime())) return res.status(400).json({ error: 'Data inválida.' });
    const oc = await prisma.bonificacaoOcorrencia.create({
      data: { funcionarioId, ano: am.ano, mes: am.mes, tipoId: tipo.id, nomeTipo: tipo.nome, pilar: tipo.pilar, percentual: tipo.percentual, data, observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 300) : null },
    });
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
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/ocorrencias DELETE]', err); res.status(500).json({ error: 'Erro ao excluir a ocorrência.' }); }
});

// Fecha o mês: congela o cálculo num snapshot (relatório de pagamento).
app.post('/api/bonificacao/fechar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const am = lerAnoMesBonif(req, res); if (!am) return;
  try {
    if (await prisma.bonificacaoFechamento.findFirst({ where: { ano: am.ano, mes: am.mes } })) return res.status(400).json({ error: 'Este mês já está fechado.' });
    const t = await tetosBonificacao();
    const cfgFech = await prisma.bonificacaoConfig.findFirst();
    const col = await prisma.bonificacaoColetiva.findFirst({ where: { ano: am.ano, mes: am.mes } });
    const coletivaPct = col ? Number(col.percentual) : 0;
    const funcionarios = await prisma.funcionario.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } });
    const ocorrencias = await prisma.bonificacaoOcorrencia.findMany({ where: { ano: am.ano, mes: am.mes }, orderBy: { data: 'desc' } });
    const rows = calcularLinhasBonificacao(funcionarios, ocorrencias, coletivaPct, t);
    const totalGeral = r2(rows.reduce((s, r) => s + r.totalRs, 0));
    const f = await prisma.bonificacaoFechamento.create({
      data: { ano: am.ano, mes: am.mes, coletivaPct, itensJson: rows, totalGeral, fechadoPor: req.user?.nome || null },
    });
    // Concede XP do mês (1 XP por R$ do total). Removido se o mês for reaberto.
    const xpData = rows.filter((r) => r.totalRs > 0).map((r) => ({ funcionarioId: r.funcionarioId, pontos: Math.round(r.totalRs), motivo: `Fechamento ${String(am.mes).padStart(2, '0')}/${am.ano}`, origem: 'FECHAMENTO', ano: am.ano, mes: am.mes }));
    if (xpData.length) await prisma.bonificacaoXp.createMany({ data: xpData });
    // Credita MOEDAS do mês (permanentes — 1x só; reabrir NÃO estorna, pois podem já ter sido gastas).
    const moedasPorReal = Number(cfgFech?.moedasPorReal ?? 1);
    if (moedasPorReal > 0 && !(await prisma.bonificacaoMoeda.findFirst({ where: { origem: 'FECHAMENTO', ano: am.ano, mes: am.mes } }))) {
      const moedaData = rows.map((r) => ({ funcionarioId: r.funcionarioId, pontos: Math.round(r.totalRs * moedasPorReal), motivo: `Fechamento ${String(am.mes).padStart(2, '0')}/${am.ano}`, origem: 'FECHAMENTO', ano: am.ano, mes: am.mes })).filter((d) => d.pontos > 0);
      if (moedaData.length) await prisma.bonificacaoMoeda.createMany({ data: moedaData });
    }
    // Desbloqueia conquistas atingidas com o novo histórico/XP (não bloqueia o fechamento se falhar).
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
    await prisma.bonificacaoXp.deleteMany({ where: { origem: 'FECHAMENTO', ano: am.ano, mes: am.mes } }); // devolve o XP concedido no fechamento
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/reabrir]', err); res.status(500).json({ error: 'Erro ao reabrir o mês.' }); }
});

// ===== Bonificação — XP / Níveis / link privado (ADMIN) =====
// Equipe com XP total, nível e link privado.
app.get('/api/bonificacao/equipe', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const c = await prisma.bonificacaoConfig.findFirst();
    const xpN = c?.xpPorNivel ?? 500;
    const niveis = (await prisma.bonificacaoNivel.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })).map((n) => n.nome);
    const funcionarios = await prisma.funcionario.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }] });
    const xpMap = await xpPorFuncionario();
    const moedaMap = await moedasPorFuncionario();
    res.json(funcionarios.map((f) => {
      const total = xpMap.get(f.id) || 0;
      const nv = nivelDeXp(total, xpN, niveis);
      return { id: f.id, nome: f.nome, funcao: f.funcao || null, status: f.status, tokenPrivado: f.tokenPrivado || null, xpTotal: total, nivel: nv.nivel, nivelNome: nv.nome, progresso: nv.progresso, xpNoNivel: nv.xpNoNivel, xpProximo: nv.xpProximo, moedas: moedaMap.get(f.id) || 0 };
    }));
  } catch (err) { console.error('[bonificacao/equipe]', err); res.status(500).json({ error: 'Erro ao carregar a equipe.' }); }
});

// Concede/desconta XP manual.
app.post('/api/bonificacao/xp', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.body?.funcionarioId, 10);
    const pontos = parseInt(req.body?.pontos, 10);
    if (!Number.isFinite(pontos) || pontos === 0) return res.status(400).json({ error: 'Informe os pontos de XP (pode ser negativo).' });
    const func = await prisma.funcionario.findFirst({ where: { id: funcionarioId } });
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    await prisma.bonificacaoXp.create({ data: { funcionarioId, pontos, motivo: req.body?.motivo ? String(req.body.motivo).slice(0, 200) : null, origem: 'MANUAL' } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error('[bonificacao/xp POST]', err); res.status(500).json({ error: 'Erro ao lançar XP.' }); }
});

// Extrato de XP de um funcionário.
app.get('/api/bonificacao/xp/:funcionarioId', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const funcionarioId = parseInt(req.params.funcionarioId, 10);
    const lista = await prisma.bonificacaoXp.findMany({ where: { funcionarioId }, orderBy: { criadoEm: 'desc' }, take: 60 });
    res.json(lista.map((x) => ({ id: x.id, pontos: x.pontos, motivo: x.motivo, origem: x.origem, criadoEm: x.criadoEm })));
  } catch (err) { console.error('[bonificacao/xp GET]', err); res.status(500).json({ error: 'Erro ao carregar o XP.' }); }
});

app.delete('/api/bonificacao/xp/:id', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const x = await prisma.bonificacaoXp.findFirst({ where: { id } });
    if (!x) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    await prisma.bonificacaoXp.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/xp DELETE]', err); res.status(500).json({ error: 'Erro ao excluir o XP.' }); }
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
  return { data: { nome, descricao, emoji, custo, estoque, ativo: b?.ativo !== false, ordem: Math.round(Number(b?.ordem) || 0) } };
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
      itemNome: r.itemNome, itemEmoji: r.itemEmoji, custo: r.custo, status: r.status, observacao: r.observacao || null,
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
  const meta = Math.max(1, Math.round(Number(b?.meta) || 1));
  const xpBonus = Math.max(0, Math.round(Number(b?.xpBonus) || 0));
  const emoji = (typeof b?.emoji === 'string' && b.emoji.trim()) ? Array.from(b.emoji.trim())[0] : '🏅';
  const descricao = typeof b?.descricao === 'string' ? b.descricao.trim().slice(0, 240) || null : null;
  return { data: { nome, descricao, emoji, raridade, regra, meta, xpBonus, ativo: b?.ativo !== false, ordem: Math.round(Number(b?.ordem) || 0) } };
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
    await prisma.conquista.delete({ where: { id } }); // desbloqueios caem em cascata
    res.json({ ok: true });
  } catch (err) { console.error('[bonificacao/conquistas DELETE]', err); res.status(500).json({ error: 'Erro ao excluir a conquista.' }); }
});

// Recalcula todas as conquistas automáticas (concede as recém-atingidas).
app.post('/api/bonificacao/conquistas/recalcular', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const novas = await avaliarConquistas();
    res.json({ ok: true, novas });
  } catch (err) { console.error('[bonificacao/conquistas/recalcular]', err); res.status(500).json({ error: 'Erro ao recalcular as conquistas.' }); }
});

// Quem já desbloqueou uma conquista (p/ o modal de conceder manual).
app.get('/api/bonificacao/conquistas/:id/desbloqueios', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const conquistaId = parseInt(req.params.id, 10);
    const lista = await prisma.conquistaDesbloqueada.findMany({ where: { conquistaId }, orderBy: { desbloqueadoEm: 'desc' } });
    res.json(lista.map((d) => ({ id: d.id, funcionarioId: d.funcionarioId, origem: d.origem, desbloqueadoEm: d.desbloqueadoEm })));
  } catch (err) { console.error('[bonificacao/conquistas/desbloqueios]', err); res.status(500).json({ error: 'Erro ao carregar.' }); }
});

// Concede uma conquista manualmente a um funcionário (idempotente; credita o XP bônus).
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
    await prisma.conquistaDesbloqueada.create({ data: { conquistaId, funcionarioId, origem: 'MANUAL' } });
    if (c.xpBonus > 0) await prisma.bonificacaoXp.create({ data: { funcionarioId, pontos: c.xpBonus, motivo: `Conquista: ${c.nome}`, origem: 'CONQUISTA' } });
    res.status(201).json({ ok: true });
  } catch (err) { console.error('[bonificacao/conquistas/conceder]', err); res.status(500).json({ error: 'Erro ao conceder a conquista.' }); }
});

// Revoga um desbloqueio (corrige um erro). Não estorna o XP já creditado.
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
  assidPct: r.assidPct, desPct: r.desPct, coletivaPct: r.coletivaPct,
  assidRs: r.assidRs, desRs: r.desRs, colRs: r.colRs, classificacaoRs: r.classificacaoRs, totalRs: r.totalRs,
});
app.get('/api/public/bonificacao/:token', async (req, res) => {
  try {
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { tokenPublico: String(req.params.token) } });
    if (!cfg) return res.status(404).json({ error: 'Página não encontrada.' });
    if (!cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const empresaId = cfg.empresaId; // rota pública: sem tenantStore → filtro manual
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true } });
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
      const col = await prisma.bonificacaoColetiva.findFirst({ where: { empresaId, ano, mes } });
      coletivaPct = col ? Number(col.percentual) : 0;
      const fs = await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' } });
      const ocs = await prisma.bonificacaoOcorrencia.findMany({ where: { empresaId, ano, mes } });
      funcionarios = calcularLinhasBonificacao(fs, ocs, coletivaPct, t).map(rowPublicoBonif);
    }
    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null },
      ano, mes, fechado, coletivaPct,
      config: { tetoAssiduidade: t.tetoA, tetoDesempenho: t.tetoD, tetoColetiva: t.tetoC, bonusTop1: t.b1, bonusTop2: t.b2, bonusTop3: t.b3 },
      tipos, funcionarios,
    });
  } catch (err) { console.error('[public/bonificacao]', err); res.status(500).json({ error: 'Erro ao carregar a página.' }); }
});

// PÚBLICO/PRIVADO — perfil do funcionário (link privado): seu XP/nível + seu resultado
// do mês + o ranking do time. Mês vigente. Escopo por empresaId do funcionário.
app.get('/api/public/eu/:token', async (req, res) => {
  try {
    const func = await prisma.funcionario.findFirst({ where: { tokenPrivado: String(req.params.token) } });
    if (!func) return res.status(404).json({ error: 'Página não encontrada.' });
    const empresaId = func.empresaId;
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg || !cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const loja = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true, logoDataUrl: true } });
    const now = new Date();
    const ano = now.getFullYear(), mes = now.getMonth() + 1;
    const t = { tetoA: Number(cfg.tetoAssiduidade), tetoD: Number(cfg.tetoDesempenho), tetoC: Number(cfg.tetoColetiva), b1: Number(cfg.bonusTop1), b2: Number(cfg.bonusTop2), b3: Number(cfg.bonusTop3) };
    const fech = await prisma.bonificacaoFechamento.findFirst({ where: { empresaId, ano, mes } });
    let rows, coletivaPct;
    if (fech) { rows = Array.isArray(fech.itensJson) ? fech.itensJson : []; coletivaPct = Number(fech.coletivaPct); }
    else {
      const col = await prisma.bonificacaoColetiva.findFirst({ where: { empresaId, ano, mes } });
      coletivaPct = col ? Number(col.percentual) : 0;
      const fs = await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, orderBy: { nome: 'asc' } });
      const ocs = await prisma.bonificacaoOcorrencia.findMany({ where: { empresaId, ano, mes } });
      rows = calcularLinhasBonificacao(fs, ocs, coletivaPct, t);
    }
    const meu = rows.find((r) => r.funcionarioId === func.id) || null;
    const niveis = (await prisma.bonificacaoNivel.findMany({ where: { empresaId }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })).map((n) => n.nome);
    const xpMap = await xpPorFuncionario({ empresaId, funcionarioId: func.id });
    const xpTotal = xpMap.get(func.id) || 0;
    const nv = nivelDeXp(xpTotal, cfg.xpPorNivel ?? 500, niveis);
    // Mural de conquistas: desbloqueadas + bloqueadas com progresso (métricas do histórico da loja).
    const conquistas = await prisma.conquista.findMany({ where: { empresaId, ativo: true }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    const desbMap = new Map((await prisma.conquistaDesbloqueada.findMany({ where: { empresaId, funcionarioId: func.id } })).map((d) => [d.conquistaId, d.desbloqueadoEm]));
    const mf = metricasConquista(await prisma.bonificacaoFechamento.findMany({ where: { empresaId } })).get(func.id) || { vitorias: 0, podios: 0, mesesAtivos: 0, presenca100: 0, score100: 0 };
    const conquistasOut = conquistas.map((c) => {
      const unlocked = desbMap.has(c.id);
      let progresso = null;
      if (!unlocked && c.regra !== 'MANUAL') {
        const val = valorRegraConquista(c.regra, xpTotal, nv.nivel, mf) || 0;
        progresso = { atual: Math.min(val, c.meta), meta: c.meta };
      }
      return { id: c.id, nome: c.nome, descricao: c.descricao || null, emoji: c.emoji, raridade: c.raridade, xpBonus: c.xpBonus, desbloqueada: unlocked, desbloqueadoEm: unlocked ? desbMap.get(c.id) : null, progresso };
    });
    // Mercado: saldo de moedas, itens à venda e histórico de resgates do funcionário.
    const saldoMoedas = await saldoMoedasDe(func.id, empresaId);
    const itens = await prisma.mercadoItem.findMany({ where: { empresaId, ativo: true }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    const meusResgates = await prisma.mercadoResgate.findMany({ where: { empresaId, funcionarioId: func.id }, orderBy: { criadoEm: 'desc' }, take: 20 });
    res.json({
      loja: { nome: loja?.nome || 'Loja', logoDataUrl: loja?.logoDataUrl || null },
      ano, mes, coletivaPct,
      funcionario: { nome: func.nome, funcao: func.funcao || null },
      nivel: nv,
      meu: meu ? rowPublicoBonif(meu) : null,
      ranking: rows.map(rowPublicoBonif).sort((a, b) => (a.posicao || 99) - (b.posicao || 99)),
      conquistas: conquistasOut,
      conquistasResumo: { total: conquistasOut.length, desbloqueadas: desbMap.size },
      moedas: saldoMoedas,
      mercado: itens.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao || null, emoji: i.emoji, custo: i.custo, esgotado: i.estoque != null && i.estoque <= 0 })),
      meusResgates: meusResgates.map((r) => ({ id: r.id, itemNome: r.itemNome, itemEmoji: r.itemEmoji, custo: r.custo, status: r.status, criadoEm: r.criadoEm })),
      config: { tetoAssiduidade: t.tetoA, tetoDesempenho: t.tetoD, tetoColetiva: t.tetoC, bonusTop1: t.b1 },
    });
  } catch (err) { console.error('[public/eu]', err); res.status(500).json({ error: 'Erro ao carregar a página.' }); }
});

// PÚBLICO — funcionário solicita um resgate no mercado (debita moedas na hora; a
// liderança aprova/entrega depois). Valida saldo e estoque. Escopo por empresaId do token.
app.post('/api/public/eu/:token/resgatar', async (req, res) => {
  try {
    const func = await prisma.funcionario.findFirst({ where: { tokenPrivado: String(req.params.token) } });
    if (!func) return res.status(404).json({ error: 'Página não encontrada.' });
    const empresaId = func.empresaId;
    const cfg = await prisma.bonificacaoConfig.findFirst({ where: { empresaId } });
    if (!cfg || !cfg.ativo) return res.status(404).json({ error: 'A bonificação não está ativa nesta loja.' });
    const itemId = parseInt(req.body?.itemId, 10);
    const item = await prisma.mercadoItem.findFirst({ where: { id: itemId, empresaId } });
    if (!item || !item.ativo) return res.status(404).json({ error: 'Item indisponível.' });
    if (item.estoque != null && item.estoque <= 0) return res.status(400).json({ error: 'Item esgotado.' });
    const saldo = await saldoMoedasDe(func.id, empresaId);
    if (saldo < item.custo) return res.status(400).json({ error: 'Moedas insuficientes para este resgate.' });
    // Cria o pedido, debita as moedas e reserva o estoque.
    const resg = await prisma.mercadoResgate.create({ data: { funcionarioId: func.id, empresaId, itemId: item.id, itemNome: item.nome, itemEmoji: item.emoji, custo: item.custo, status: 'PENDENTE' } });
    await prisma.bonificacaoMoeda.create({ data: { funcionarioId: func.id, empresaId, pontos: -item.custo, motivo: `Resgate: ${item.nome}`, origem: 'RESGATE', resgateId: resg.id } });
    if (item.estoque != null) await prisma.mercadoItem.update({ where: { id: item.id }, data: { estoque: Math.max(0, item.estoque - 1) } });
    res.status(201).json({ ok: true, saldo: await saldoMoedasDe(func.id, empresaId) });
  } catch (err) { console.error('[public/eu/resgatar]', err); res.status(500).json({ error: 'Erro ao solicitar o resgate.' }); }
});


app.listen(PORT, () => console.log(`Operação (PDV) API rodando em http://localhost:${PORT}`));
