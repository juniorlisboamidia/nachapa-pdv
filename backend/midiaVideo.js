// VÍDEO enviado pelo admin — validação de container, helper TÉCNICO sem domínio.
//
// Irmão de `midiaImagem.js`, e pelo mesmo motivo: o que decide se um arquivo é mesmo um
// vídeo não sabe o que é TV, banner ou totem. A diferença é a escala — imagem se lê inteira
// na memória, vídeo não se lê nunca: aqui só passam o PRIMEIRO PEDAÇO (para os magic bytes)
// e números.
//
// ── O QUE ESTE MÓDULO NÃO FAZ, E É IMPORTANTE DIZER ───────────────────────────────────
// Ele NÃO verifica codec. Saber que um MP4 carrega H.264 (e não HEVC, que a TV não toca)
// exigiria ffprobe, e essa dependência de sistema não existe garantida no VPS. Então:
// valida-se o CONTAINER, recomenda-se o codec no admin, e a falha de decode é tratada no
// player. O que não se faz é fingir que verificamos.

/* Teto por arquivo. 200 MB é o ponto em que 1080p bem comprimido já deu mais de um minuto —
   acima disso, quase sempre é arte mal exportada, não vídeo longo. Configurável porque o
   disco do VPS pode mudar. */
export const MAX_BYTES_PADRAO = 200 * 1024 * 1024;

/* Os dois containers do V1.

   MP4 é o denominador universal: toca em qualquer TV, box ou tablet que a loja tenha. WebM
   entra junto porque o custo é um magic byte a mais e o Chromium o reproduz nativamente — e
   o Chromium é o que roda nessas telas. */
export const CONTAINERS = Object.freeze({
  'video/mp4': Object.freeze({ tipo: 'video/mp4', extensao: 'mp4', rotulo: 'MP4' }),
  'video/webm': Object.freeze({ tipo: 'video/webm', extensao: 'webm', rotulo: 'WebM' }),
});
export const TIPOS = Object.freeze(Object.keys(CONTAINERS));

export const MOTIVO_TIPO = 'VIDEO_TIPO';
export const MOTIVO_GRANDE = 'VIDEO_GRANDE';
export const MOTIVO_VAZIO = 'VIDEO_VAZIO';
export const MOTIVO_COTA = 'COTA_EXCEDIDA';
export const MOTIVO_DISCO = 'DISCO_CHEIO';

/* Quantos bytes bastam para reconhecer o container. 12 basta para os dois:

     MP4   xx xx xx xx 66 74 79 70   — o tamanho do box, e então "ftyp" no byte 4
     WebM  1A 45 DF A3               — o magic do Matroska, logo no começo

   O chunk é o PRIMEIRO que chega do stream; nada além disso é lido para decidir. */
export const BYTES_PARA_RECONHECER = 12;

/* O tipo REAL, lido dos primeiros bytes.

   A extensão e o `Content-Type` que o navegador manda são texto que o cliente escreve — um
   `.exe` renomeado para `.mp4` chega com `video/mp4` no cabeçalho sem nenhum esforço. A
   assinatura do container não mente.

   No MP4 o `ftyp` não está no começo: os quatro primeiros bytes são o tamanho do box. Por
   isso a comparação é no offset 4, e não em 0 — checar em 0 é o erro clássico, e ele recusa
   todo MP4 do mundo. */
export function tipoReal(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  if (bytes.toString('latin1', 4, 8) === 'ftyp') return 'video/mp4';
  return null;
}

/* O container é aceito? Devolve `{ ok, tipo, extensao }` ou `{ ok: false, motivo }`. */
export function validarContainer(primeirosBytes) {
  const tipo = tipoReal(primeirosBytes);
  if (!tipo || !CONTAINERS[tipo]) return { ok: false, motivo: MOTIVO_TIPO };
  return { ok: true, tipo, extensao: CONTAINERS[tipo].extensao };
}

/* O upload cabe? Três perguntas, nesta ordem, e cada uma responde a um dono diferente:
   o ARQUIVO (teto por peça), a EMPRESA (cota) e o SERVIDOR (margem de disco).

   `livreBytes` pode vir `null` — é o que acontece num sistema sem `statfs`. Nesse caso a
   terceira pergunta é PULADA em vez de recusar: derrubar todo upload porque o SO não sabe
   informar espaço seria trocar um risco por uma certeza. */
export function cabe({ tamanho, maxBytes = MAX_BYTES_PADRAO, usadoBytes = 0, cotaBytes = null, livreBytes = null, margemBytes = 0 }) {
  const n = Number(tamanho);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, motivo: MOTIVO_VAZIO };
  if (n > maxBytes) return { ok: false, motivo: MOTIVO_GRANDE, limite: maxBytes };
  if (cotaBytes !== null && Number(usadoBytes) + n > cotaBytes) {
    return { ok: false, motivo: MOTIVO_COTA, limite: cotaBytes, usado: Number(usadoBytes) };
  }
  if (livreBytes !== null && Number(livreBytes) - n < margemBytes) {
    return { ok: false, motivo: MOTIVO_DISCO };
  }
  return { ok: true };
}

/* Metadata que o NAVEGADOR do gestor informou (duração, largura, altura).

   É INFORMATIVA, e o nome da função existe para isso ficar impossível de esquecer. O player
   nunca a usa — ele avança no evento `ended`, que é a única fonte confiável de "acabou". Ela
   serve para o admin mostrar "0:32 · 1920×1080" na listagem, e só.

   Valores tortos viram `null` em vez de derrubar o upload: um navegador que não conseguiu
   ler a duração não é motivo para recusar um vídeo que toca. */
export function metadataInformativa(bruto) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const inteiro = (v, teto) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 && n <= teto ? n : null;
  };
  return {
    // 4 h de teto: acima disso é lixo de parsing, não vídeo de loja.
    duracaoMs: inteiro(b.duracaoMs, 4 * 60 * 60 * 1000),
    largura: inteiro(b.largura, 16000),
    altura: inteiro(b.altura, 16000),
  };
}

/* A versão sobe SÓ quando o arquivo muda. Trocar nome ou agenda não mexe nela — a TV guarda
   o vídeo por um ano com `immutable`, e rebaixar tudo porque alguém corrigiu um título seria
   mandar a loja inteira baixar 200 MB de novo. */
export function proximaVersaoArquivo(atual) {
  const base = Number.isInteger(atual) && atual >= 0 ? atual : 0;
  return base + 1;
}
