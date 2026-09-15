// Armazenamento de mídia — testes com filesystem REAL, num diretório temporário.
// Rodar: node --test backend/armazenamentoMidia.test.js
//
// Estes testes tocam o disco de propósito: o que eles defendem — path traversal, atomicidade
// do rename, limpeza de temporário em caso de falha — só é verdade contra um filesystem de
// verdade. Um mock provaria que o mock funciona.
//
// Tudo acontece sob um diretório próprio em `os.tmpdir()`, criado e apagado por teste;
// `PDV_MEDIA_DIR` é apontado para lá.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

let raiz;
before(async () => {
  raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'pdv-midia-'));
  process.env.PDV_MEDIA_DIR = raiz;
});
after(async () => {
  delete process.env.PDV_MEDIA_DIR;
  await fs.rm(raiz, { recursive: true, force: true });
});

const mod = await import('./armazenamentoMidia.js');
const {
  raizDeMidia, dirDeVideos, dirTemporario, prepararArmazenamento, novaChave, caminhoDaChave,
  receberParaTemporario, promover, tamanhoDaChave, lerTrecho, removerChave, usoDaEmpresa,
  espacoLivre, limparTemporarios, varrerOrfaos,
} = mod;

beforeEach(async () => {
  await fs.rm(dirDeVideos(), { recursive: true, force: true });
  await prepararArmazenamento();
});

const fluxo = (buf, pedacos = 1) => {
  const tamanho = Math.ceil(buf.length / pedacos);
  const partes = [];
  for (let i = 0; i < buf.length; i += tamanho) partes.push(buf.subarray(i, i + tamanho));
  return Readable.from(partes.length ? partes : [Buffer.alloc(0)]);
};

// ── Onde os bytes moram ──────────────────────────────────────────────────────
test('a raiz sai do env, e o vídeo fica FORA do repositório', () => {
  assert.equal(raizDeMidia(), path.resolve(raiz));
  assert.ok(dirDeVideos().startsWith(path.resolve(raiz)));
  assert.equal(dirDeVideos().includes('nachapa-pdv' + path.sep + 'backend'), false,
    'nada de mídia dentro da árvore do git — o deploy faz git pull e rebuild');
});

test('prepararArmazenamento cria a árvore e PROVA que dá para escrever', async () => {
  await fs.rm(dirDeVideos(), { recursive: true, force: true });
  const r = await prepararArmazenamento();
  assert.equal(r.ok, true);
  const s = await fs.stat(dirTemporario());
  assert.equal(s.isDirectory(), true);
});

// ── Segurança de caminho ─────────────────────────────────────────────────────
test('a chave é GERADA aqui: opaca, com a extensão do container validado', () => {
  const c = novaChave(9, 'mp4');
  assert.match(c, /^9\/[0-9a-f]{32}\.mp4$/);
  assert.notEqual(novaChave(9, 'mp4'), novaChave(9, 'mp4'), 'duas chamadas nunca colidem');
  assert.match(novaChave(9, '../../etc'), /\.bin$/, 'extensão torta vira bin, nunca caminho');
  assert.throws(() => novaChave(0, 'mp4'));
  assert.throws(() => novaChave('x', 'mp4'));
});

test('🔴 path traversal não passa — nem vindo do banco', () => {
  // Esta é a última linha de defesa: mesmo uma `storageKey` adulterada por acesso direto ao
  // Postgres para aqui.
  for (const malicioso of [
    '../../../etc/passwd', '9/../../../etc/passwd', '/etc/passwd',
    '..\\..\\windows\\system32', '9/../../.tmp/x.mp4', '', '   ', null, 42,
  ]) {
    const c = caminhoDaChave(malicioso);
    if (c !== null) assert.ok(c.startsWith(dirDeVideos() + path.sep), `escapou: ${malicioso} → ${c}`);
  }
  assert.equal(caminhoDaChave('../fora.mp4'), null);
  assert.equal(caminhoDaChave('/etc/passwd'), null);
  assert.equal(caminhoDaChave(null), null);
});

test('🔴 um `.tmp` nunca é servível: ele é parcial por definição', () => {
  assert.equal(caminhoDaChave('.tmp/123.tmp'), null);
});

test('a chave legítima resolve dentro do diretório', () => {
  const c = novaChave(7, 'mp4');
  const caminho = caminhoDaChave(c);
  assert.ok(caminho.startsWith(dirDeVideos() + path.sep));
  assert.ok(caminho.endsWith('.mp4'));
});

// ── Recepção em streaming ────────────────────────────────────────────────────
test('recebe em pedaços, conta os bytes e entrega o PRIMEIRO pedaço', async () => {
  const dados = Buffer.from('X'.repeat(5000));
  let viu = null;
  const r = await receberParaTemporario(fluxo(dados, 7), { limiteBytes: 1e6, aoPrimeiroPedaco: (b) => { viu = b } });
  assert.equal(r.ok, true);
  assert.equal(r.bytes, 5000);
  assert.ok(viu && viu.length > 0, 'o começo do arquivo é o que reconhece o container');
  assert.equal((await fs.stat(r.caminhoTmp)).size, 5000);
});

test('🔴 estourar o teto corta na hora e NÃO deixa rastro', async () => {
  // Um cliente que ignore o teto declarado não pode encher o disco enquanto o servidor
  // espera o fim do upload para reclamar.
  const antes = (await fs.readdir(dirTemporario())).length;
  const r = await receberParaTemporario(fluxo(Buffer.alloc(10_000), 10), { limiteBytes: 1000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'VIDEO_GRANDE');
  assert.deepEqual((await fs.readdir(dirTemporario())).length, antes, 'o temporário foi removido');
});

test('corpo vazio é recusado e limpo', async () => {
  const r = await receberParaTemporario(Readable.from([]), { limiteBytes: 1e6 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'VIDEO_VAZIO');
  assert.equal((await fs.readdir(dirTemporario())).length, 0);
});

test('stream que quebra no meio não deixa temporário', async () => {
  const quebrado = new Readable({ read() { this.destroy(new Error('rede')) } });
  const r = await receberParaTemporario(quebrado, { limiteBytes: 1e6 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'UPLOAD_INTERROMPIDO');
  assert.equal((await fs.readdir(dirTemporario())).length, 0);
});

// ── Promoção e leitura ───────────────────────────────────────────────────────
test('promover move o temporário para o definitivo', async () => {
  const r = await receberParaTemporario(fluxo(Buffer.from('conteudo')), { limiteBytes: 1e6 });
  const chave = novaChave(3, 'mp4');
  const p = await promover(r.caminhoTmp, chave);
  assert.equal(p.ok, true);
  assert.equal(await tamanhoDaChave(chave), 8);
  assert.equal((await fs.readdir(dirTemporario())).length, 0, 'o temporário saiu do lugar');
});

test('promover com chave inválida não grava e limpa o temporário', async () => {
  const r = await receberParaTemporario(fluxo(Buffer.from('x')), { limiteBytes: 1e6 });
  const p = await promover(r.caminhoTmp, '../fora.mp4');
  assert.equal(p.ok, false);
  assert.equal(p.motivo, 'CHAVE_INVALIDA');
});

test('🔴 lerTrecho entrega SÓ o intervalo pedido', async () => {
  const dados = Buffer.from('0123456789');
  const r = await receberParaTemporario(fluxo(dados), { limiteBytes: 1e6 });
  const chave = novaChave(4, 'mp4');
  await promover(r.caminhoTmp, chave);

  const ler = async (ini, fim) => {
    const partes = [];
    for await (const p of lerTrecho(chave, ini, fim)) partes.push(p);
    return Buffer.concat(partes).toString();
  };
  assert.equal(await ler(0, 9), '0123456789');
  assert.equal(await ler(2, 4), '234', 'inclusivo nas duas pontas, como manda o Range');
  assert.equal(await ler(9, 9), '9');
  assert.equal(lerTrecho('../fora.mp4', 0, 1), null);
});

test('tamanhoDaChave: arquivo que não existe é null, nunca erro', async () => {
  assert.equal(await tamanhoDaChave(novaChave(1, 'mp4')), null);
  assert.equal(await tamanhoDaChave('../fora.mp4'), null);
});

// ── Uso, cota e disco ────────────────────────────────────────────────────────
test('usoDaEmpresa soma o que está no DISCO', async () => {
  assert.equal(await usoDaEmpresa(11), 0, 'empresa sem diretório usa zero');
  for (const n of [100, 250]) {
    const r = await receberParaTemporario(fluxo(Buffer.alloc(n)), { limiteBytes: 1e6 });
    await promover(r.caminhoTmp, novaChave(11, 'mp4'));
  }
  assert.equal(await usoDaEmpresa(11), 350);
  assert.equal(await usoDaEmpresa(12), 0, 'e é por empresa');
});

test('espacoLivre devolve número ou null, e nunca lança', async () => {
  const livre = await espacoLivre();
  assert.ok(livre === null || (Number.isFinite(livre) && livre >= 0));
});

// ── Limpeza ──────────────────────────────────────────────────────────────────
test('🔴 temporários VELHOS são removidos; os recentes ficam', async () => {
  // Um upload interrompido deixa um `.tmp`. Sem isto eles se acumulam para sempre.
  const r = await receberParaTemporario(fluxo(Buffer.from('x')), { limiteBytes: 1e6 });
  const novo = (await limparTemporarios({ idadeMs: 60_000 })).length;
  assert.equal(novo, 0, 'recém-criado não é lixo');
  const removidos = await limparTemporarios({ idadeMs: 0, agora: Date.now() + 1000 });
  assert.equal(removidos.length, 1);
  assert.equal(await tamanhoDaChave(r.caminhoTmp), null);
});

test('limparTemporarios em diretório inexistente não lança', async () => {
  await fs.rm(dirDeVideos(), { recursive: true, force: true });
  assert.deepEqual(await limparTemporarios(), []);
});

test('🔴 varrerOrfaos acha o que o banco não conhece — e só remove se mandarem', async () => {
  const chaves = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await receberParaTemporario(fluxo(Buffer.alloc(50)), { limiteBytes: 1e6 });
    const c = novaChave(21, 'mp4');
    await promover(r.caminhoTmp, c);
    chaves.push(c);
  }
  // O banco conhece dois; o terceiro é órfão (sobrou de uma substituição, por exemplo).
  const vivas = chaves.slice(0, 2);
  const achados = await varrerOrfaos(21, vivas);
  assert.equal(achados.length, 1);
  assert.equal(achados[0].bytes, 50);
  assert.equal(await usoDaEmpresa(21), 150, 'listar não apaga');

  await varrerOrfaos(21, vivas, { remover: true });
  assert.equal(await usoDaEmpresa(21), 100);
  // E o que o banco conhece continua lá.
  for (const c of vivas) assert.equal(await tamanhoDaChave(c), 50);
});

test('removerChave apaga; remover duas vezes não lança', async () => {
  const r = await receberParaTemporario(fluxo(Buffer.from('x')), { limiteBytes: 1e6 });
  const chave = novaChave(31, 'mp4');
  await promover(r.caminhoTmp, chave);
  assert.equal(await removerChave(chave), true);
  assert.equal(await removerChave(chave), false, 'o segundo delete é inofensivo');
  assert.equal(await removerChave('../fora.mp4'), false);
});
