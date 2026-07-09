// Captura BRUTA do que o coletor DIXI Facial 40 (firmware ai518_f40v) envia.
//
// O aparelho é "PUSH": no menu Comunicacao/Servidor ele manda os dados para um
// IP:porta. Hoje aponta para a nuvem da DIXI (52.87.26.39:7788). Este script
// sobe um servidor que ESCUTA nessa porta e LOGA tudo que chegar (utf8 + hex),
// pra gente descobrir o protocolo exato (provavelmente HTTP+JSON: a doc da DIXI
// diz "desative HTTPS" no coletor => texto puro).
//
// USO (no VPS):
//   node captura-coletor.mjs              -> escuta na porta 7788
//   PORTA=7788 node captura-coletor.mjs
//
// PASSOS no aparelho (Menu > Comunicacao > Servidor):
//   IP    = IP PUBLICO do nosso VPS
//   Porta = 7788 (a mesma)
//   HTTPS / "Servidor Ratify" = Nao
// Depois bata um ponto (rosto) -> o registro cai aqui.
//
// REVERSAO (voltar pra DIXI a qualquer momento): reaponte o Servidor para
//   IP 52.87.26.39  Porta 7788.  Enquanto isso, o aparelho guarda log local
//   (Menu > Dados > Download Todos Logs em pendrive) — nada se perde de fato.

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const PORTA = Number(process.env.PORTA || 7788);
const ARQ = path.join(process.cwd(), `captura-coletor-${PORTA}.log`);

function log(linha) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${linha}\n`;
  process.stdout.write(msg);
  fs.appendFileSync(ARQ, msg);
}

const server = net.createServer((sock) => {
  const de = `${sock.remoteAddress}:${sock.remotePort}`;
  log(`===== CONEXAO de ${de} =====`);
  let total = Buffer.alloc(0);
  let respondido = false;

  sock.on('data', (chunk) => {
    total = Buffer.concat([total, chunk]);
    log(`RECEBIDO ${chunk.length} bytes de ${de}`);
    log(`UTF8 >>>\n${chunk.toString('utf8')}`);
    log(`HEX  >>> ${chunk.toString('hex')}`);

    // Espera 300ms sem novos bytes e responde um 200 OK generico (caso HTTP),
    // pra fechar a conexao limpa e capturar o registro inteiro.
    if (!respondido) {
      respondido = true;
      setTimeout(() => {
        const corpo = JSON.stringify({ result: 1, success: true, cmd: 'none' });
        const resp =
          'HTTP/1.1 200 OK\r\n' +
          'Content-Type: application/json\r\n' +
          `Content-Length: ${Buffer.byteLength(corpo)}\r\n` +
          'Connection: close\r\n\r\n' +
          corpo;
        try { sock.write(resp); sock.end(); } catch {}
      }, 300);
    }
  });

  sock.on('close', () => log(`===== FIM ${de} (total ${total.length} bytes) =====`));
  sock.on('error', (e) => log(`ERRO ${de}: ${e.message}`));
});

server.on('error', (e) => log(`ERRO servidor: ${e.message}`));
server.listen(PORTA, '0.0.0.0', () => log(`Capturando na porta ${PORTA}. Log em ${ARQ}`));
