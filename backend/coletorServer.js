// Servidor de ingest do coletor DIXI Facial 40 (protocolo "AiFace" sobre
// WebSocket, path /pub/chat). Sobe junto com o backend (porta própria 7788).
// Recebe as batidas (cmd:sendlog) e grava como PontoRegistro, casando por
// enrollid→Funcionario (auto-aprende pelo nome). Batida órfã vai pra fila de
// pendências. Só grava de coletor AUTORIZADO (Dispositivo.ativo). Idempotente
// por coletorRef (sn:enrollid:time). WebSocket em net puro (sem lib externa).
import net from 'node:net';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const BR_OFFSET_MIN = -180; // BR fixo UTC-3 (independe do TZ do servidor/VPS em UTC)

const wsAccept = (k) => crypto.createHash('sha1').update(k + GUID).digest('base64');
function cloudtimeBR() {
  const d = new Date(Date.now() + BR_OFFSET_MIN * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
// "YYYY-MM-DD HH:MM:SS" (horário BR do coletor) → instante Date (UTC).
function parseBrDateTime(s) {
  const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se) - BR_OFFSET_MIN * 60000);
}
// Início/fim (Date UTC) do dia BR de uma dataHora — p/ a sequência de tipos do dia.
function brDiaRange(dataHora) {
  const d = new Date(new Date(dataHora).getTime() + BR_OFFSET_MIN * 60000);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate();
  return {
    ini: new Date(Date.UTC(y, mo, day, 0, 0) - BR_OFFSET_MIN * 60000),
    fim: new Date(Date.UTC(y, mo, day + 1, 0, 0) - BR_OFFSET_MIN * 60000),
  };
}
const normalizarNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── WebSocket (frames) ──────────────────────────────────────────
function parseFrames(buf) {
  const frames = []; let off = 0;
  while (off + 2 <= buf.length) {
    const b1 = buf[off + 1], opcode = buf[off] & 0x0f, masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask; if (masked) { if (p + 4 > buf.length) break; mask = buf.slice(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    let pl = buf.slice(p, p + len);
    if (masked) { const o = Buffer.alloc(len); for (let i = 0; i < len; i++) o[i] = pl[i] ^ mask[i & 3]; pl = o; }
    frames.push({ opcode, payload: pl }); off = p + len;
  }
  return { frames, rest: buf.slice(off) };
}
function encodeFrame(opcode, buf) {
  let h; const len = buf.length;
  if (len < 126) h = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | opcode; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, buf]);
}

// ── Regras de negócio ───────────────────────────────────────────
const SEQ = { ENTRADA: 'SAIDA_INTERVALO', SAIDA_INTERVALO: 'RETORNO_INTERVALO', RETORNO_INTERVALO: 'SAIDA', SAIDA: null };
async function proximoTipoPontoNaData(prisma, empresaId, funcionarioId, dataHora) {
  const { ini, fim } = brDiaRange(dataHora);
  const regs = await prisma.pontoRegistro.findMany({
    where: { empresaId, funcionarioId, dataHora: { gte: ini, lt: fim } },
    orderBy: { dataHora: 'asc' }, select: { tipo: true },
  });
  const ultimo = regs.length ? regs[regs.length - 1].tipo : null;
  if (!ultimo) return 'ENTRADA';
  return SEQ[ultimo] || 'SAIDA'; // além da 4ª batida, mantém como SAIDA (Espelho usa a última)
}

// Grava uma batida do coletor como PontoRegistro (tipo pela sequência do dia).
// Reusado no ingest e ao resolver pendências (vincular enrollid a funcionário).
export async function gravarPontoColetor(prisma, empresaId, funcionarioId, { dataHora, coletorRef, dispositivoId = null }) {
  const tipo = await proximoTipoPontoNaData(prisma, empresaId, funcionarioId, dataHora);
  return prisma.pontoRegistro.create({ data: { empresaId, funcionarioId, tipo, origem: 'COLETOR', dispositivoId, dataHora, coletorRef } });
}

// reg → resolve/auto-cadastra o Dispositivo pelo serial (novo nasce PENDENTE).
async function resolverDispositivoColetor(prisma, sn) {
  if (!sn) return null;
  let disp = await prisma.dispositivo.findFirst({ where: { serialColetor: sn } });
  if (!disp) {
    const emp = await prisma.empresa.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
    if (!emp) return null;
    disp = await prisma.dispositivo.create({
      data: { empresaId: emp.id, nome: `Coletor ${sn}`, token: `coletor-${sn}-${crypto.randomBytes(6).toString('hex')}`, ativo: false, serialColetor: sn },
    });
    console.log(`[coletor] novo device PENDENTE de autorização (ative no painel): sn=${sn}`);
  }
  return disp;
}

// Casa enrollid→Funcionario: por enrollidColetor; senão por nome (auto-aprende).
async function casarFuncionario(prisma, empresaId, enrollid, nome) {
  const porId = await prisma.funcionario.findFirst({ where: { empresaId, enrollidColetor: enrollid, status: 'ATIVO' }, select: { id: true } });
  if (porId) return porId;
  const alvo = normalizarNome(nome);
  if (!alvo) return null;
  const ativos = await prisma.funcionario.findMany({ where: { empresaId, status: 'ATIVO' }, select: { id: true, nome: true, enrollidColetor: true } });
  const cands = ativos.filter((f) => normalizarNome(f.nome) === alvo);
  if (cands.length !== 1) return null; // 0 ou ambíguo → órfã
  const cand = cands[0];
  if (cand.enrollidColetor != null && cand.enrollidColetor !== enrollid) return null; // já mapeado p/ outro id → órfã
  if (cand.enrollidColetor == null) {
    try { await prisma.funcionario.update({ where: { id: cand.id }, data: { enrollidColetor: enrollid } }); }
    catch { /* colisão de unique → grava o ponto mesmo assim */ }
  }
  return { id: cand.id };
}

// sendlog → grava cada record. Retorna true (ACK) só se o device está autorizado.
async function processarSendlog(prisma, disp, sn, records) {
  if (!disp || !disp.ativo) return false; // pendente/inativo → não ACK: device retém e reenvia
  const empresaId = disp.empresaId;
  const ordenados = [...records].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  for (const r of ordenados) {
    try {
      const enrollid = parseInt(r.enrollid, 10);
      const time = String(r.time || '').trim();
      const dataHora = parseBrDateTime(time);
      if (!Number.isInteger(enrollid) || !dataHora) continue;
      const coletorRef = `${sn}:${enrollid}:${time}`;
      const [jaP, jaPend] = await Promise.all([
        prisma.pontoRegistro.findFirst({ where: { coletorRef }, select: { id: true } }),
        prisma.coletorBatidaPendente.findFirst({ where: { coletorRef }, select: { id: true } }),
      ]);
      if (jaP || jaPend) continue; // dedup
      const func = await casarFuncionario(prisma, empresaId, enrollid, r.name);
      if (func) {
        await gravarPontoColetor(prisma, empresaId, func.id, { dataHora, coletorRef, dispositivoId: disp.id });
      } else {
        await prisma.coletorBatidaPendente.create({ data: { empresaId, dispositivoId: disp.id, serial: sn, enrollid, nome: r.name || null, dataHora, coletorRef } });
      }
    } catch (e) {
      if (e?.code !== 'P2002') console.error('[coletor] record:', e?.message || e); // P2002 = corrida no dedup (ok)
    }
  }
  await prisma.dispositivo.update({ where: { id: disp.id }, data: { ultimaSync: new Date() } }).catch(() => {});
  return true;
}

// ── Servidor ────────────────────────────────────────────────────
export function iniciarColetorServer(prisma, opts = {}) {
  const porta = Number(opts.porta || process.env.COLETOR_PORT || 7788);
  const server = net.createServer((sock) => {
    let hs = false, acc = Buffer.alloc(0), disp = null, sn = null;
    const responder = (obj) => { try { sock.write(encodeFrame(1, Buffer.from(JSON.stringify(obj), 'utf8'))); } catch { /* ok */ } };

    async function onMsg(s) {
      let msg = null; try { msg = JSON.parse(s); } catch { return; }
      if (!msg || !msg.cmd) return;
      try {
        if (msg.cmd === 'reg') {
          sn = String(msg.sn || '').trim();
          disp = await resolverDispositivoColetor(prisma, sn);
          responder({ ret: 'reg', result: true, cloudtime: cloudtimeBR(), nosenduser: true });
        } else if (msg.cmd === 'sendlog') {
          const ok = await processarSendlog(prisma, disp, sn || String(msg.sn || '').trim(), Array.isArray(msg.record) ? msg.record : []);
          if (ok) responder({ ret: 'sendlog', result: true, count: msg.count, logindex: msg.logindex, cloudtime: cloudtimeBR() });
          // !ok (device não autorizado) → sem ACK, o coletor retém e reenvia
        } else {
          responder({ ret: msg.cmd, result: true, cloudtime: cloudtimeBR() });
        }
      } catch (e) { console.error('[coletor onMsg]', e?.message || e); }
    }
    function proc() {
      const { frames, rest } = parseFrames(acc); acc = rest;
      for (const f of frames) {
        if (f.opcode === 0x8) { try { sock.end(); } catch { /* ok */ } return; }
        if (f.opcode === 0x9) { try { sock.write(encodeFrame(0xA, f.payload)); } catch { /* ok */ } continue; }
        if (f.opcode === 0xA) continue;
        onMsg(f.payload.toString('utf8'));
      }
    }
    sock.on('data', (chunk) => {
      acc = Buffer.concat([acc, chunk]);
      if (!hs) {
        const txt = acc.toString('utf8'); const end = txt.indexOf('\r\n\r\n');
        if (end === -1) return;
        const headers = txt.slice(0, end);
        const m = headers.match(/Sec-WebSocket-Key:\s*(.+)\r?\n/i);
        if (m && /upgrade:\s*websocket/i.test(headers)) {
          sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + wsAccept(m[1].trim()) + '\r\n\r\n');
          hs = true; acc = acc.slice(end + 4); if (acc.length) proc();
        } else { acc = Buffer.alloc(0); try { sock.end(); } catch { /* ok */ } }
        return;
      }
      proc();
    });
    sock.on('error', () => { /* conexão do coletor pode cair a qualquer momento */ });
  });
  server.on('error', (e) => console.error('[coletor] erro no servidor:', e.message));
  server.listen(porta, '0.0.0.0', () => console.log(`[coletor] ingest WS ouvindo na porta ${porta}`));
  return server;
}
