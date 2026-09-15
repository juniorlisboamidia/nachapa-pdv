// ARMAZENAMENTO de mídia grande no filesystem — helper técnico, sem domínio.
//
// ── POR QUE NÃO O BANCO ───────────────────────────────────────────────────────────────
// BYTEA foi a escolha certa para imagens de 700 KB e é a errada para vídeo, por três razões
// concretas: o driver do Postgres materializa o blob inteiro no heap (150 MB por requisição,
// com três TVs o processo morre); atender um Range exigiria `substring()` no SQL a cada seek
// do navegador; e o dump do banco — que hoje é copiado inteiro — passaria a gigabytes.
// Com arquivo, `createReadStream(path, { start, end })` deixa o trabalho para o sistema.
//
// ── SEGURANÇA DE CAMINHO ──────────────────────────────────────────────────────────────
// O nome do arquivo é SEMPRE gerado aqui. Nada que venha do usuário — nem o nome original,
// nem a extensão que ele mandou — toca o caminho. E antes de qualquer `open`, o caminho
// resolvido é conferido contra o diretório base: nem uma `storageKey` adulterada no banco
// escapa do diretório.
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

/* A raiz da mídia. FORA do repositório de propósito: `deploy.sh` faz `git pull` e rebuild, e
   qualquer coisa dentro da árvore do git é candidata a sumir num `git clean` ou a entrar num
   commit por acidente.

   O default de produção é `/var/lib/nachapa-pdv/media`, o lugar canônico de dado variável de
   aplicação no Linux. Em desenvolvimento (Windows), cai para `.media` na raiz do repositório
   — que está no `.gitignore`. */
export function raizDeMidia() {
  const doEnv = process.env.PDV_MEDIA_DIR;
  if (doEnv && doEnv.trim()) return path.resolve(doEnv.trim());
  if (process.platform === 'win32') return path.resolve(process.cwd(), '..', '.media');
  return '/var/lib/nachapa-pdv/media';
}

export const dirDeVideos = () => path.join(raizDeMidia(), 'tv-indoor', 'videos');
export const dirTemporario = () => path.join(dirDeVideos(), '.tmp');

/* Cria a árvore no boot. O caminho feliz NÃO pode depender de alguém lembrar de um passo
   manual — mas, se não der para escrever, é melhor saber agora e alto do que descobrir no
   primeiro upload de uma loja. */
export async function prepararArmazenamento() {
  const dir = dirDeVideos();
  const tmp = dirTemporario();
  try {
    await fs.mkdir(tmp, { recursive: true });
    // Prova de escrita: `mkdir` pode passar num diretório onde o processo não escreve.
    const teste = path.join(tmp, `.escrita-${randomBytes(4).toString('hex')}`);
    await fs.writeFile(teste, 'ok');
    await fs.unlink(teste);
    return { ok: true, dir };
  } catch (err) {
    return { ok: false, dir, erro: err?.code ?? err?.message ?? 'erro' };
  }
}

/* A CHAVE de um arquivo: opaca, gerada aqui, com a extensão do container JÁ VALIDADO.

   Nunca `baseDir + nomeDoUsuario`. O nome original, quando guardado, é metadata de exibição
   — jamais autoridade para o filesystem. */
export function novaChave(empresaId, extensao) {
  const id = Number(empresaId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('empresa inválida');
  const ext = /^[a-z0-9]{2,5}$/.test(String(extensao)) ? String(extensao) : 'bin';
  return `${id}/${randomBytes(16).toString('hex')}.${ext}`;
}

/* Chave → caminho absoluto, com a conferência que impede path traversal.

   `path.resolve` normaliza `..` e separadores; depois disso, ou o caminho está DENTRO do
   diretório base, ou não se abre nada. É a última linha de defesa, e ela não confia no
   banco: mesmo uma `storageKey` adulterada por acesso direto ao Postgres para aqui. */
export function caminhoDaChave(chave) {
  if (typeof chave !== 'string' || !chave.trim()) return null;
  const base = dirDeVideos();
  const alvo = path.resolve(base, chave);
  const prefixo = base.endsWith(path.sep) ? base : base + path.sep;
  if (!alvo.startsWith(prefixo)) return null;
  // Um `.tmp` não é arquivo publicável: ele é parcial por definição.
  if (path.basename(path.dirname(alvo)) === '.tmp') return null;
  return alvo;
}

/* Grava um stream num arquivo TEMPORÁRIO, contando os bytes e chamando `aoPrimeiroPedaco`
   com o começo do arquivo — é ali que o container é reconhecido, sem ler o resto.

   `limiteBytes` corta na hora: um cliente que ignore o teto declarado não enche o disco
   enquanto o servidor espera o fim para reclamar.

   Devolve `{ ok, caminhoTmp, bytes, primeiros }` ou `{ ok: false, motivo }`. O temporário é
   removido em qualquer falha — quem sai daqui com `ok: false` não deixou rastro. */
export async function receberParaTemporario(origem, { limiteBytes, aoPrimeiroPedaco } = {}) {
  await fs.mkdir(dirTemporario(), { recursive: true });
  const caminhoTmp = path.join(dirTemporario(), `${Date.now()}-${randomBytes(8).toString('hex')}.tmp`);
  const destino = createWriteStream(caminhoTmp);
  let bytes = 0;
  let primeiros = null;
  let estouro = false;

  const contar = async function* (fluxo) {
    for await (const pedaco of fluxo) {
      if (primeiros === null) {
        primeiros = Buffer.from(pedaco.subarray(0, Math.min(pedaco.length, 64)));
        if (typeof aoPrimeiroPedaco === 'function') aoPrimeiroPedaco(primeiros);
      }
      bytes += pedaco.length;
      if (Number.isFinite(limiteBytes) && bytes > limiteBytes) {
        estouro = true;
        // Parar de consumir aqui deixaria o socket pendurado; a exceção derruba o pipeline
        // e o catch abaixo limpa o temporário.
        throw new Error('LIMITE');
      }
      yield pedaco;
    }
  };

  try {
    await pipeline(origem, contar, destino);
  } catch (err) {
    // O `pipeline` destrói os streams, mas o handle do arquivo pode levar um instante para
    // ser liberado — e no Windows `unlink` num arquivo ainda aberto falha com EBUSY. Sem
    // esperar o fechamento, todo upload interrompido deixaria um `.tmp` para trás, que é
    // exatamente o lixo que este módulo existe para não acumular.
    await fechado(destino);
    await removerSilencioso(caminhoTmp);
    if (estouro) return { ok: false, motivo: 'VIDEO_GRANDE' };
    return { ok: false, motivo: 'UPLOAD_INTERROMPIDO', erro: err?.code ?? err?.message };
  }
  if (bytes === 0) {
    await fechado(destino);
    await removerSilencioso(caminhoTmp);
    return { ok: false, motivo: 'VIDEO_VAZIO' };
  }
  return { ok: true, caminhoTmp, bytes, primeiros };
}

/* Espera um stream de escrita fechar de verdade. `destroy()` é síncrono no pedido e
   assíncrono no efeito; quem precisa apagar o arquivo em seguida tem de esperar o `close`.
   O timeout curto existe para nenhuma limpeza pendurar uma requisição. */
function fechado(stream, limiteMs = 2000) {
  if (!stream || stream.closed || stream.destroyed === true && stream.writableFinished) return Promise.resolve();
  return new Promise((resolve) => {
    const pronto = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(resolve, limiteMs);
    stream.once('close', pronto);
    stream.destroy();
  });
}

/* Promove o temporário a definitivo. `rename` é atômico dentro do mesmo filesystem — não
   existe instante em que o arquivo final esteja pela metade. */
export async function promover(caminhoTmp, chave) {
  const destino = caminhoDaChave(chave);
  if (!destino) return { ok: false, motivo: 'CHAVE_INVALIDA' };
  try {
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.rename(caminhoTmp, destino);
    return { ok: true, caminho: destino };
  } catch (err) {
    await removerSilencioso(caminhoTmp);
    return { ok: false, motivo: 'GRAVACAO_FALHOU', erro: err?.code ?? err?.message };
  }
}

/* Tamanho do arquivo de uma chave, ou `null`. É o número que a rota de Range usa — e vem do
   DISCO, não do banco: se os dois divergirem, quem manda é o que existe. */
export async function tamanhoDaChave(chave) {
  const caminho = caminhoDaChave(chave);
  if (!caminho) return null;
  try {
    const s = await fs.stat(caminho);
    return s.isFile() ? s.size : null;
  } catch { return null; }
}

/* Um stream de LEITURA de um trecho. É o coração do Range: o sistema entrega só os bytes
   pedidos, e o processo nunca vê o arquivo inteiro. */
export function lerTrecho(chave, inicio, fim) {
  const caminho = caminhoDaChave(chave);
  if (!caminho) return null;
  return createReadStream(caminho, { start: inicio, end: fim });
}

/* Remove sem reclamar. Usado nos caminhos de limpeza, onde falhar em apagar não pode
   derrubar a operação que já deu certo. */
export async function removerSilencioso(caminho) {
  if (!caminho) return false;
  try { await fs.unlink(caminho); return true; } catch { return false; }
}

export async function removerChave(chave) {
  return removerSilencioso(caminhoDaChave(chave));
}

/* Quanto a empresa já ocupa, em bytes, lendo o DISCO. Existe para a cota não depender de uma
   soma no banco poder divergir do que está lá. */
export async function usoDaEmpresa(empresaId) {
  const dir = path.join(dirDeVideos(), String(empresaId));
  try {
    const nomes = await fs.readdir(dir);
    let total = 0;
    for (const nome of nomes) {
      try {
        const s = await fs.stat(path.join(dir, nome));
        if (s.isFile()) total += s.size;
      } catch { /* sumiu no meio da varredura: não conta */ }
    }
    return total;
  } catch { return 0; }
}

/* Espaço livre no filesystem da mídia, ou `null` onde `statfs` não existe.

   `null` é tratado como "não sei" por quem chama, e a checagem é PULADA — derrubar todo
   upload porque o SO não informa espaço seria trocar um risco por uma certeza. */
export async function espacoLivre() {
  if (typeof fs.statfs !== 'function') return null;
  try {
    const s = await fs.statfs(raizDeMidia());
    return Number(s.bsize) * Number(s.bavail);
  } catch { return null; }
}

/* ── Limpeza ─────────────────────────────────────────────────────────────────────────── */

/* Temporários velhos. Um upload interrompido (aba fechada, rede caindo) deixa um `.tmp`, e
   sem isto eles se acumulam para sempre.

   `idadeMs` de 6 h por padrão: um upload legítimo de 200 MB numa rede ruim pode levar muito,
   mas não isso. Nada é apagado em segundo plano — quem chama é uma rota administrativa. */
export async function limparTemporarios({ idadeMs = 6 * 60 * 60 * 1000, agora = Date.now() } = {}) {
  const dir = dirTemporario();
  const removidos = [];
  try {
    for (const nome of await fs.readdir(dir)) {
      const caminho = path.join(dir, nome);
      try {
        const s = await fs.stat(caminho);
        if (s.isFile() && agora - s.mtimeMs > idadeMs) {
          if (await removerSilencioso(caminho)) removidos.push(nome);
        }
      } catch { /* sumiu no meio: nada a fazer */ }
    }
  } catch { /* diretório ainda não existe */ }
  return removidos;
}

/* Arquivos ÓRFÃOS: existem no disco e não têm linha no banco.

   Eles aparecem porque filesystem e banco não compartilham transação — e a ordem escolhida
   (o banco é a autoridade) prefere deixar um órfão a deixar o banco apontando para um
   arquivo que não existe. Um custa disco; o outro custa uma TV preta.

   `chavesVivas` vem de quem chama, com as chaves DAQUELA empresa. `remover: false` só lista. */
export async function varrerOrfaos(empresaId, chavesVivas, { remover = false } = {}) {
  const dir = path.join(dirDeVideos(), String(empresaId));
  const vivas = new Set((chavesVivas ?? []).map((c) => path.basename(String(c))));
  const achados = [];
  try {
    for (const nome of await fs.readdir(dir)) {
      if (vivas.has(nome)) continue;
      const caminho = path.join(dir, nome);
      try {
        const s = await fs.stat(caminho);
        if (!s.isFile()) continue;
        achados.push({ nome, bytes: s.size });
        if (remover) await removerSilencioso(caminho);
      } catch { /* sumiu no meio */ }
    }
  } catch { /* empresa sem diretório: nada a varrer */ }
  return achados;
}
