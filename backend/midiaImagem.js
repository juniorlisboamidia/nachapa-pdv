// Leitura e validação de IMAGEM enviada pelo admin — helper TÉCNICO, sem domínio.
//
// Nasceu dentro de `totemBanner.js` e saiu de lá quando o segundo canal (TV Indoor)
// precisou exatamente das mesmas três garantias. Repare no que este arquivo NÃO sabe:
// não sabe o que é banner, conteúdo, capa ou tela de espera, e não tem medida
// recomendada nenhuma. Ele responde uma pergunta só — "estes bytes são mesmo uma
// imagem PNG/JPEG/WEBP dentro do teto?" — e é por isso que pode ser compartilhado sem
// criar dependência conceitual entre canais irmãos.
//
// Sem Prisma, sem Express, sem I/O.

/* O teto do SERVIDOR. O cliente reduz antes de subir; isto é a rede de baixo.
   700 KB: maior que a logo (300 KB), porque aqui a imagem É o conteúdo, e menor que o
   1 MB que o Nginx assume por padrão, com folga para o resto do corpo. */
export const IMAGEM_MAX_BYTES = 700 * 1024;

const TIPOS_IMAGEM = Object.freeze({ 'image/png': true, 'image/jpeg': true, 'image/webp': true });
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/* O tipo REAL, lido dos primeiros bytes.

   O `Content-Type` do data URL é texto que o cliente escreve, e um `.exe` renomeado chega
   com `image/png` no cabeçalho sem nenhum esforço. A assinatura não mente:
     PNG   89 50 4E 47
     JPEG  FF D8 FF
     WEBP  "RIFF" .... "WEBP" */
export function tipoReal(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* Data URL → `{ tipo, bytes }`, ou `{ erro }`.

   O tipo que sai é o REAL, não o declarado: se os dois discordam, o arquivo é recusado.
   Deixar passar "declara png, é outra coisa" seria servir depois um `Content-Type` que
   não corresponde ao conteúdo.

   `maxBytes` entra por parâmetro para um canal poder ser mais apertado que outro sem
   precisar de uma segunda cópia desta função. */
export function lerImagem(dataUrl, { maxBytes = IMAGEM_MAX_BYTES } = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl) return { erro: 'IMAGEM_AUSENTE' };
  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) return { erro: 'IMAGEM_FORMATO' };
  if (!TIPOS_IMAGEM[m[1]]) return { erro: 'IMAGEM_TIPO' };
  let bytes;
  try { bytes = Buffer.from(m[2], 'base64'); } catch { return { erro: 'IMAGEM_FORMATO' }; }
  if (!bytes.length) return { erro: 'IMAGEM_FORMATO' };
  if (bytes.length > maxBytes) return { erro: 'IMAGEM_GRANDE' };
  const real = tipoReal(bytes);
  if (!real) return { erro: 'IMAGEM_FORMATO' };
  if (real !== m[1]) return { erro: 'IMAGEM_TIPO' };
  return { tipo: real, bytes };
}

/* A versão sobe SÓ quando os bytes mudam. Trocar nome, duração ou agenda não mexe nela —
   o aparelho guarda a arte por um ano com `immutable`, e rebaixar tudo porque alguém
   corrigiu um título seria desperdício. */
export function proximaVersaoImagem(atual) {
  const base = Number.isInteger(atual) && atual >= 0 ? atual : 0;
  return base + 1;
}
