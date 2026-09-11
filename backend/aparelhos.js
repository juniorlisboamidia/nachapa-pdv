// Aparelhos do PDV (TOTEM hoje, TV_INDOOR depois): pareamento por código temporário,
// credencial do cookie HttpOnly e heartbeat — spec §3.1-§3.4.
// Módulo PURO: sem Prisma, sem Express, sem I/O. `agora` é sempre parâmetro, então o
// que decide se um código vale, se um aparelho está online e o que a resposta expõe
// pode ser testado sem banco. As rotas em server.js só orquestram estas funções.
//
// ⚠️ A credencial em claro NUNCA é gravada nem logada: o banco guarda só o SHA-256.
import { randomBytes, randomInt, createHash } from 'node:crypto';

// Tipos que esta área administra. PONTO e ETIQUETA (legados) continuam nas telas
// próprias, usando `Dispositivo.token` na URL — nada aqui os alcança.
export const TIPOS_APARELHO = ['TOTEM', 'TV_INDOOR'];

export const PAREAMENTO_VALIDADE_MS = 10 * 60_000;  // código vale 10 min
export const PAREAMENTO_MAX_TENTATIVAS = 5;         // 5 erros e o código morre
export const HEARTBEAT_ONLINE_MS = 150_000;         // online = sinal há menos de 150 s

export const COOKIE_NOME = 'pdv_aparelho';
export const COOKIE_PATH = '/api/public/aparelho';  // o cookie só viaja para as rotas do aparelho
const COOKIE_MAX_AGE = 31_536_000;                  // 365 dias

// Instante em ms, aceitando Date, number ou string ISO. Ausente = NaN, e toda
// comparação com NaN é falsa — é o que faz o "sem data" cair no lado seguro.
const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : v ? new Date(v).getTime() : NaN);

// Código de pareamento: 6 dígitos, com zeros à esquerda (000000..999999). `rand` é
// injetável só para o teste; em produção é o randomInt do crypto.
export function gerarCodigoPareamento(rand = randomInt) {
  return String(rand(0, 1_000_000)).padStart(6, '0');
}

export function hashCredencial(credencial) {
  return createHash('sha256').update(String(credencial)).digest('hex');
}

// Credencial do cookie: 32 bytes aleatórios. Devolve o claro (vai no Set-Cookie, e
// só ali) e o hash (o único que vai para o banco).
export function gerarCredencial() {
  const credencial = randomBytes(32).toString('base64url');
  return { credencial, hash: hashCredencial(credencial) };
}

// Online é decidido no servidor: sinal há menos de 150 s. Nunca pelo aparelho.
export function estaOnline(ultimoHeartbeatEm, agora) {
  const t = ms(ultimoHeartbeatEm);
  if (!Number.isFinite(t)) return false;
  return ms(agora) - t < HEARTBEAT_ONLINE_MS;
}

// Set-Cookie do pareamento (§3.2). `secure: false` só em dev por http (localhost):
// sem isso o navegador descarta o cookie e o totem nunca pareia.
export function cookieAparelho(credencial, { secure = true } = {}) {
  const attrs = ['HttpOnly'];
  if (secure) attrs.push('Secure');
  attrs.push('SameSite=Strict', `Path=${COOKIE_PATH}`, `Max-Age=${COOKIE_MAX_AGE}`);
  return `${COOKIE_NOME}=${credencial}; ${attrs.join('; ')}`;
}

// Apaga o cookie (mesmo nome e mesmo Path, senão o navegador ignora).
export function cookieAparelhoLimpar() {
  return `${COOKIE_NOME}=; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=0`;
}

// Lê o cookie do header cru — o PDV não usa cookie-parser (mesmo regex do th_sso).
export function lerCookieAparelho(headerCookie) {
  const m = String(headerCookie || '').match(/(?:^|;\s*)pdv_aparelho=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]).trim();
  return v || null;
}

// Julga uma tentativa de pareamento. Resposta ao aparelho é SEMPRE a mesma
// (CODIGO_INVALIDO) — o que muda é o que o servidor faz em seguida:
// `invalidar` = apagar o código (expirou, ou esta é a 5ª falha).
export function avaliarTentativa(disp, codigo, agora) {
  if (!disp || !disp.pareamentoCodigo) return { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: false };
  const expirado = !(ms(disp.pareamentoExpiraEm) > ms(agora));
  const bate = disp.pareamentoCodigo === String(codigo);
  if (bate && !expirado && disp.ativo) return { ok: true };
  const quintaFalha = (Number(disp.pareamentoTentativas) || 0) + 1 >= PAREAMENTO_MAX_TENTATIVAS;
  return { ok: false, codigo: 'CODIGO_INVALIDO', invalidar: expirado || quintaFalha };
}

// O que o APARELHO vê de si mesmo. Nada de token/credencialHash/pareamentoCodigo.
export function aparelhoPublico(d) {
  return { id: d.id, nome: d.nome, tipo: d.tipo };
}

// O que a TELA ADMIN vê. Também sem nenhum segredo: `pareado` e `pareamentoAtivo`
// são booleanos derivados, não o hash nem o código.
export function aparelhoAdmin(d, agora) {
  return {
    id: d.id,
    nome: d.nome,
    tipo: d.tipo,
    ativo: d.ativo,
    pareado: !!d.credencialHash,
    pareadoEm: d.pareadoEm ?? null,
    online: estaOnline(d.ultimoHeartbeatEm, agora),
    ultimoSinalEm: d.ultimoHeartbeatEm ?? null,
    versao: d.heartbeatJson?.versao ?? null,
    pareamentoAtivo: !!(d.pareamentoCodigo && ms(d.pareamentoExpiraEm) > ms(agora)),
    pareamentoExpiraEm: d.pareamentoExpiraEm ?? null,
    criadoEm: d.criadoEm ?? null,
  };
}

// ── Tenant das rotas públicas ────────────────────────────────────────────────
// As rotas `/api/public/aparelho/*` rodam fora do tenantStore: a extension do
// Prisma NÃO injeta empresaId. Estas duas funções são o ÚNICO lugar de onde os
// `where` dessas rotas nascem, e as duas só olham o aparelho resolvido pelo
// cookie — nunca o corpo da requisição (regra do Junior: clienteId/empresaId
// jamais vêm do navegador).
export function filtroAparelhoDoCookie(hash) {
  return { credencialHash: hash, ativo: true, tipo: { in: TIPOS_APARELHO } };
}

export function escopoEmpresa(aparelho) {
  return { empresaId: aparelho.empresaId };
}

// Limite de força bruta no código: 10 tentativas por IP em 10 min (§3.2). Em
// memória de propósito — é defesa de ritmo, não de auditoria; reiniciar o
// processo zerar não é problema.
export class LimitadorIp {
  constructor({ janelaMs = 10 * 60_000, maximo = 10 } = {}) {
    this.janelaMs = janelaMs;
    this.maximo = maximo;
    this.porIp = new Map(); // ip → [timestamps]
  }

  // Registra uma tentativa. Quando já bateu o teto na janela, NÃO registra (para o
  // bloqueio não se renovar para sempre) e devolve bloqueado: true.
  registrar(ip, agora) {
    const t = ms(agora);
    const chave = String(ip || 'sem-ip');
    this.#limpar(t);
    const tentativas = (this.porIp.get(chave) || []).filter((x) => t - x < this.janelaMs);
    if (tentativas.length >= this.maximo) {
      this.porIp.set(chave, tentativas);
      return { bloqueado: true };
    }
    tentativas.push(t);
    this.porIp.set(chave, tentativas);
    return { bloqueado: false };
  }

  // Poda IPs cujas tentativas já saíram da janela (o Map não cresce sem fim).
  #limpar(t) {
    for (const [chave, lista] of this.porIp) {
      const vivas = lista.filter((x) => t - x < this.janelaMs);
      if (vivas.length) this.porIp.set(chave, vivas);
      else this.porIp.delete(chave);
    }
  }
}
