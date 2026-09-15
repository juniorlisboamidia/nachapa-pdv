// TV Indoor › VÍDEO — módulo puro do domínio (sem Prisma, sem Express, sem filesystem).
//
// O terceiro tipo de item da programação. Domínio PRÓPRIO do canal: nada aqui conhece o
// totem, e o que se divide com ele é técnico (`midiaAgenda`, `midiaVideo`).
//
// ── O QUE ELE NÃO GUARDA ──────────────────────────────────────────────────────────────
// Bytes. A `storageKey` é uma chave OPACA gerada pelo servidor, e ela NUNCA sai daqui para o
// cliente: a TV recebe uma URL versionada, e quem traduz chave em caminho é o armazenamento.
//
// ── DURAÇÃO ───────────────────────────────────────────────────────────────────────────
// `duracaoMs` é INFORMATIVA — veio do `<video>` do navegador do gestor, porque o servidor não
// tem ffprobe. O player NUNCA a usa: ele avança no evento `ended`, que é a única fonte
// confiável de "acabou". Ela serve para o admin escrever "0:32" numa listagem.
import { dentroDaJanela, instante, janelaValida, statusDaJanela } from './midiaAgenda.js';
import { CONTAINERS, MAX_BYTES_PADRAO } from './midiaVideo.js';

export const NOME_MAX = 60;

export const MOTIVO_NOME = 'NOME_OBRIGATORIO';
export const MOTIVO_DATA = 'DATA_INVALIDA';
export const MOTIVO_JANELA = 'JANELA_INVALIDA';

/* Está no ar AGORA? Ativo, com arquivo, e dentro da janela.

   ⚠️ Esta é a pergunta de COMEÇAR. Um vídeo que já está tocando quando o `fimEm` passa
   TERMINA — quem garante isso é o player, que só reavalia a elegibilidade entre itens.
   Cortar um vídeo no meio é pior do que exibi-lo vinte segundos além da janela. */
export function elegivel(video, agoraMs) {
  if (!video || video.ativo !== true) return false;
  if ((video.arquivoVersao ?? 0) <= 0 || !video.storageKey) return false;
  return dentroDaJanela(video, agoraMs);
}

export const statusDoVideo = (v, agoraMs) => {
  if (!v) return 'INATIVO';
  // Sem arquivo não há o que agendar: o rótulo diz o que falta, não o que a agenda diria.
  if ((v.arquivoVersao ?? 0) <= 0 || !v.storageKey) return 'SEM_ARQUIVO';
  return statusDaJanela(v, agoraMs);
};

/* ── Entrada administrativa ─────────────────────────────────────────────────────────── */

/* Rigor ao escrever. Só os campos PRESENTES no corpo — um PUT parcial não apaga o que não
   mencionou. O ARQUIVO não passa por aqui: ele tem rota própria, porque é a única coisa que
   incrementa a versão. */
export function validarEntrada(bruto, { exigirNome = false } = {}) {
  const corpo = (typeof bruto === 'object' && bruto !== null && !Array.isArray(bruto)) ? bruto : {};
  const erros = [];
  const dados = {};

  if (corpo.nome !== undefined || exigirNome) {
    const nome = String(corpo.nome ?? '').trim().slice(0, NOME_MAX);
    if (!nome) erros.push({ campo: 'nome', motivo: MOTIVO_NOME });
    else dados.nome = nome;
  }
  if (corpo.ativo !== undefined) dados.ativo = corpo.ativo === true;
  for (const campo of ['inicioEm', 'fimEm']) {
    if (corpo[campo] === undefined) continue;
    if (corpo[campo] === null || corpo[campo] === '') { dados[campo] = null; continue; }
    const ms = instante(corpo[campo]);
    if (ms === null) erros.push({ campo, motivo: MOTIVO_DATA });
    else dados[campo] = new Date(ms);
  }
  return { ok: erros.length === 0, dados, erros };
}

/* A janela conferida contra o que JÁ ESTÁ salvo: mandar só `fimEm` num vídeo que já tem
   `inicioEm` pode produzir uma janela invertida sem que o corpo, sozinho, denuncie. */
export function conferirJanela(dados, atual) {
  const inicioEm = 'inicioEm' in dados ? dados.inicioEm : atual?.inicioEm ?? null;
  const fimEm = 'fimEm' in dados ? dados.fimEm : atual?.fimEm ?? null;
  return janelaValida({ inicioEm, fimEm }) ? null : { campo: 'fimEm', motivo: MOTIVO_JANELA };
}

/* ── Saídas ──────────────────────────────────────────────────────────────────────────── */

/* O vídeo como o ADMIN o lê. Sem `storageKey`: o caminho físico não é assunto do navegador,
   nem para exibir. O que ele recebe é a URL versionada. */
export function videoParaAdmin(v, agoraMs) {
  const versao = v.arquivoVersao ?? 0;
  const tem = versao > 0 && !!v.storageKey;
  return {
    id: v.id,
    nome: v.nome,
    ativo: v.ativo,
    inicioEm: v.inicioEm ? new Date(v.inicioEm).toISOString() : null,
    fimEm: v.fimEm ? new Date(v.fimEm).toISOString() : null,
    arquivoVersao: versao,
    arquivoTipo: v.arquivoTipo ?? null,
    arquivoBytes: v.arquivoBytes ?? null,
    // Informativas, e a tela diz isso: vieram do navegador de quem enviou.
    duracaoMs: v.duracaoMs ?? null,
    largura: v.largura ?? null,
    altura: v.altura ?? null,
    nomeOriginal: v.nomeOriginal ?? null,
    temArquivo: tem,
    status: statusDoVideo(v, agoraMs),
    arquivoUrl: tem ? `/api/tv-indoor/videos/${v.id}/arquivo?v=${versao}` : null,
  };
}

/* O vídeo no CONTRATO PÚBLICO — o que vai para a TV.

   Sem bytes, sem `storageKey`, sem metadata de admin. `duracaoMs` viaja só para a TV poder
   decidir o pré-carregamento com bom senso; o AVANÇO é sempre o evento `ended`.

   `ativo: true` é redundante (só elegível viaja) e está aqui de propósito: com o campo
   presente, a mesma régua de elegibilidade decide nos dois lados. Sem ele o player
   precisaria de uma segunda régua, e duas réguas divergem. */
export function videoPublico(v) {
  return {
    tipo: 'video',
    id: v.id,
    nome: v.nome ?? null,
    ativo: true,
    inicioEm: v.inicioEm ? new Date(v.inicioEm).toISOString() : null,
    fimEm: v.fimEm ? new Date(v.fimEm).toISOString() : null,
    arquivoVersao: v.arquivoVersao ?? 0,
    arquivoTipo: v.arquivoTipo ?? null,
    duracaoMs: v.duracaoMs ?? null,
    arquivoUrl: `/api/public/aparelho/tv/video/${v.id}/arquivo?v=${v.arquivoVersao ?? 0}`,
  };
}

/* Os limites que o admin mostra. Vêm do servidor para a tela não guardar uma cópia que
   envelhece quando o teto mudar por env. */
export function limitesDeVideo({ maxBytes = MAX_BYTES_PADRAO, cotaBytes = null } = {}) {
  return {
    maxBytes,
    maxMb: Math.round(maxBytes / (1024 * 1024)),
    cotaBytes,
    cotaMb: cotaBytes === null ? null : Math.round(cotaBytes / (1024 * 1024)),
    tipos: Object.values(CONTAINERS).map((c) => ({ tipo: c.tipo, rotulo: c.rotulo })),
    // O que a tela recomenda. NÃO é verificado pelo servidor (não há ffprobe), e a tela
    // precisa dizer isso com todas as letras em vez de sugerir uma garantia que não existe.
    recomendacao: { largura: 1920, altura: 1080, codec: 'H.264', audio: 'não é usado — a TV toca mudo' },
  };
}
