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


app.listen(PORT, () => console.log(`Operação (PDV) API rodando em http://localhost:${PORT}`));
