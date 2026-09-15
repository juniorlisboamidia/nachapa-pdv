// TV Indoor › TELEMETRIA E SAÚDE — módulo puro (sem Prisma, sem Express, sem relógio).
//
// Responde a UMA pergunta que "Online" não responde: **esta TV está realmente funcionando?**
//
// Uma parede pode estar online, mandando heartbeat a cada 60 s, e mesmo assim: sem
// conseguir sincronizar a programação há dez minutos, com o único vídeo quebrado, ou
// mostrando a marca da loja porque nada é reproduzível. Do lado de fora, os quatro casos se
// parecem. É essa diferença que este módulo torna visível.
//
// ── TELEMETRIA É OBSERVAÇÃO, NUNCA AUTORIDADE ─────────────────────────────────────────
// Nada que o player reporte muda playlist, agenda, regra, preço, isolamento ou o que é
// servido. Se a telemetria mentir, o pior que acontece é o admin mostrar um diagnóstico
// errado — e nunca a TV se comportar diferente. Os ids que chegam aqui NÃO autorizam nada:
// uma TV reportando `videoId: 44` não ganha acesso ao vídeo 44 de ninguém, e a resolução de
// nomes no admin é feita dentro da empresa.
//
// ── O QUE É DO SERVIDOR, E O QUE É DA TV ──────────────────────────────────────────────
// "Está online?" e "quando foi a última comunicação?" são do SERVIDOR (`estaOnline`, hora de
// recebimento). A TV nunca é autoridade sobre o próprio relógio — uma parede com a data
// errada é o caso comum, não a exceção. O que ela reporta em tempo são DURAÇÕES relativas
// (há quantos segundos falhou, há quanto tempo está de pé), que o servidor ancora na hora em
// que recebeu. A exceção é `sincronizadoEm`, que é o `agoraServidor` que nós mesmos mandamos
// na última resposta válida — devolvido para nós, e por isso confiável.

export const VERSAO_SNAPSHOT = 1;

/* Os estados do player. Um conjunto PEQUENO e fechado: vinte estados seriam impossíveis de
   interpretar às sete da noite com o gerente no telefone. */
export const ESTADOS = Object.freeze(['REPRODUZINDO', 'INSTITUCIONAL', 'SEM_CONTEUDO', 'ATUALIZANDO', 'FALHA_TOTAL']);
export const ESTADOS_VIDEO = Object.freeze(['PLAYING', 'BUFFERING']);
export const TIPOS_ITEM = Object.freeze(['IMAGEM', 'MENU_BOARD', 'VIDEO']);

/* Códigos de falha CONTROLADOS. Nunca stack trace, nunca mensagem arbitrária, nunca URL
   interna: o que viaja é um enum curto mais ids. Texto livre vindo do navegador para dentro
   de um JSON no banco é superfície de ataque e lixo de diagnóstico ao mesmo tempo. */
export const CODIGOS_FALHA = Object.freeze([
  'IMAGE_LOAD_ERROR',
  'VIDEO_LOAD_ERROR',
  'VIDEO_PLAY_REJECTED',
  'VIDEO_STALL',
  'PROGRAMACAO_REFRESH_ERROR',
  'ALL_MEDIA_FAILED',
]);

/* A frase que o gestor lê. O CÓDIGO existe para o suporte e aparece pequeno no detalhe;
   ninguém deveria precisar saber o que é `VIDEO_STALL` para entender que a TV está bem. */
const FRASES = Object.freeze({
  IMAGE_LOAD_ERROR: 'Uma arte não carregou e foi pulada.',
  VIDEO_LOAD_ERROR: 'Um vídeo não pôde ser carregado e foi pulado.',
  VIDEO_PLAY_REJECTED: 'O navegador da TV recusou iniciar o vídeo sozinho.',
  VIDEO_STALL: 'Um vídeo parou de avançar e foi pulado.',
  PROGRAMACAO_REFRESH_ERROR: 'Não foi possível atualizar a programação.',
  ALL_MEDIA_FAILED: 'Nenhum conteúdo da playlist pôde ser exibido.',
});
export const fraseDaFalha = (codigo) => FRASES[codigo] ?? 'Ocorreu uma falha de reprodução.';

/* ── Limiares ───────────────────────────────────────────────────────────────────────── */

/* Sem sincronizar a programação há quanto tempo vira ATENÇÃO.

   O polling é de 60 s, então este número é "quantos ciclos seguidos podem falhar antes de
   isso ser um problema, e não um soluço". Quatro minutos = quatro tentativas perdidas. Três
   seria apertado demais: uma rede de loja engasga por dois minutos sem que nada esteja
   errado, e um aviso que aparece à toa é um aviso que ninguém lê. */
export const MS_SINC_ANTIGA = 4 * 60_000;

/* Por quanto tempo uma falha JÁ RECUPERADA ainda pesa na saúde.

   Um vídeo que travou às 9h e foi pulado não pode deixar a TV "quebrada" o dia inteiro — ela
   está tocando. Mas uma falha de cinco minutos atrás merece que alguém olhe. Passado isso, a
   última ocorrência continua VISÍVEL no detalhe, sem contaminar o estado atual. */
export const MS_FALHA_RECENTE = 5 * 60_000;

/* ── Saúde ──────────────────────────────────────────────────────────────────────────── */

export const SAUDES = Object.freeze(['ATENCAO', 'OFFLINE', 'SEM_TELEMETRIA', 'SEM_PROGRAMACAO', 'SAUDAVEL']);

/* A ordem em que as TVs aparecem, e ela É a regra de operação: PROBLEMA SOBE.

   Ninguém abre esta tela para admirar as que funcionam. Numa lista de oitenta aparelhos, a
   que quebrou não pode estar no fim. ATENÇÃO vem antes de OFFLINE de propósito: uma TV
   offline pode ser a loja fechada, enquanto uma online e com defeito é uma parede acesa
   mostrando a coisa errada agora. */
export const PESO_SAUDE = Object.freeze({ ATENCAO: 0, OFFLINE: 1, SEM_TELEMETRIA: 2, SEM_PROGRAMACAO: 3, SAUDAVEL: 4 });

export const MOTIVOS = Object.freeze({
  SINCRONIZACAO_ANTIGA: 'SINCRONIZACAO_ANTIGA',
  SEM_CONTEUDO_REPRODUZIVEL: 'SEM_CONTEUDO_REPRODUZIVEL',
  FALHA_TOTAL: 'FALHA_TOTAL',
  FALHA_RECENTE: 'FALHA_RECENTE',
  SEM_SINAL: 'SEM_SINAL',
  SEM_SNAPSHOT: 'SEM_SNAPSHOT',
  SEM_PLAYLIST: 'SEM_PLAYLIST',
});

const FRASES_MOTIVO = Object.freeze({
  SINCRONIZACAO_ANTIGA: 'A TV está online, mas não consegue atualizar a programação.',
  SEM_CONTEUDO_REPRODUZIVEL: 'A playlist está configurada, mas nenhum conteúdo pode ser exibido agora.',
  FALHA_TOTAL: 'Todos os conteúdos falharam e a TV está mostrando a marca da loja.',
  FALHA_RECENTE: 'Houve uma falha de reprodução há poucos minutos.',
  SEM_SINAL: 'A TV não se comunica com o sistema.',
  SEM_SNAPSHOT: 'A TV está online, mas o player ainda não informa o que está reproduzindo.',
  SEM_PLAYLIST: 'Nenhuma playlist configurada para esta tela.',
});
export const fraseDoMotivo = (motivo) => FRASES_MOTIVO[motivo] ?? null;

/* A saúde de UMA tela. Função pura: tudo entra por parâmetro, inclusive o agora.

   `online` vem de `estaOnline()`, que já é a autoridade do projeto — este módulo NÃO cria
   uma segunda definição de "online", porque duas definições divergem e aí a gestão e o
   monitoramento passam a discordar sobre a mesma TV. */
export function saudeDaTela({ online, snapshot, agoraMs, sincronizadoEmMs = null, ultimaFalhaEmMs = null, temPlaylistPadrao = false } = {}) {
  if (!online) return { saude: 'OFFLINE', motivo: MOTIVOS.SEM_SINAL };
  // Online e sem snapshot: ou o player é de uma versão anterior a esta frente, ou acabou de
  // subir. NÃO é defeito, e tratar como tal faria todo deploy progressivo parecer incêndio.
  if (!snapshot) return { saude: 'SEM_TELEMETRIA', motivo: MOTIVOS.SEM_SNAPSHOT };

  const idade = (ms) => (Number.isFinite(ms) ? agoraMs - ms : null);

  // A sincronização vem primeiro porque ela explica TODAS as outras: uma TV que não recebe
  // programação há dez minutos pode estar tocando algo correto e obsoleto ao mesmo tempo.
  const desdeSinc = idade(sincronizadoEmMs);
  if (desdeSinc === null || desdeSinc > MS_SINC_ANTIGA) {
    return { saude: 'ATENCAO', motivo: MOTIVOS.SINCRONIZACAO_ANTIGA };
  }
  if (snapshot.estado === 'FALHA_TOTAL') return { saude: 'ATENCAO', motivo: MOTIVOS.FALHA_TOTAL };

  /* SEM CONTEÚDO tem duas causas que PARECEM iguais na parede e são opostas na gestão:
     ninguém configurou playlist (é configuração, não defeito), ou a playlist existe e nada
     dela pode ser exibido agora (aí sim alguém precisa olhar). */
  if (snapshot.estado === 'SEM_CONTEUDO' || snapshot.estado === 'INSTITUCIONAL') {
    const temPlaylist = snapshot.programacao?.playlistId != null || temPlaylistPadrao;
    if (!temPlaylist) return { saude: 'SEM_PROGRAMACAO', motivo: MOTIVOS.SEM_PLAYLIST };
    return { saude: 'ATENCAO', motivo: MOTIVOS.SEM_CONTEUDO_REPRODUZIVEL };
  }

  // Falha recente pesa; falha velha que já se recuperou NÃO. A TV está tocando — deixá-la
  // "quebrada" o dia inteiro por causa de um soluço das nove da manhã treinaria o gestor a
  // ignorar o aviso, que é o pior resultado possível.
  const desdeFalha = idade(ultimaFalhaEmMs);
  if (desdeFalha !== null && desdeFalha <= MS_FALHA_RECENTE) {
    return { saude: 'ATENCAO', motivo: MOTIVOS.FALHA_RECENTE };
  }
  return { saude: 'SAUDAVEL', motivo: null };
}

/* ── Sanitização do que a TV manda ──────────────────────────────────────────────────── */

const inteiro = (v, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const deLista = (v, lista) => (lista.includes(v) ? v : null);

/* O snapshot que chega no heartbeat, RECONSTRUÍDO campo a campo.

   Nada é copiado: cada campo é lido, validado e reescrito. É o que impede um payload
   arbitrário de virar JSON infinito numa coluna do banco, e o que garante que campo
   desconhecido simplesmente não existe do outro lado. Um `{ ...body.tv }` teria sido uma
   linha; teria também aceitado qualquer coisa que um navegador comprometido mandasse.

   Devolve `null` quando não há nada aproveitável — e `null` significa "sem telemetria", que
   é um estado legítimo (TV com frontend anterior a esta frente), nunca um erro. */
export function sanitizarSnapshot(bruto) {
  const b = (typeof bruto === 'object' && bruto !== null && !Array.isArray(bruto)) ? bruto : null;
  if (!b) return null;
  const estado = deLista(b.estado, ESTADOS);
  if (!estado) return null;

  const prog = (typeof b.programacao === 'object' && b.programacao !== null) ? b.programacao : {};
  const item = (typeof b.itemAtual === 'object' && b.itemAtual !== null) ? b.itemAtual : null;
  const falhas = (typeof b.falhas === 'object' && b.falhas !== null) ? b.falhas : {};
  const ultima = (typeof falhas.ultima === 'object' && falhas.ultima !== null) ? falhas.ultima : null;
  const tipoItem = item ? deLista(item.tipo, TIPOS_ITEM) : null;
  const codigo = ultima ? deLista(ultima.codigo, CODIGOS_FALHA) : null;

  return {
    versao: VERSAO_SNAPSHOT,
    estado,
    programacao: {
      // Os ids são GUARDADOS, não CONFIADOS: servem para o admin resolver um nome dentro da
      // própria empresa. Um id de outra loja aqui não abre nada — a consulta é escopada.
      playlistId: inteiro(prog.playlistId, { min: 1 }),
      origem: deLista(prog.origem, ['REGRA', 'PADRAO']),
      regraId: inteiro(prog.regraId, { min: 1 }),
      caiuNoPadrao: prog.caiuNoPadrao === true,
      // O `agoraServidor` que NÓS mandamos, devolvido. É a única hora absoluta que aceitamos
      // da TV, justamente porque não nasceu nela.
      sincronizadoEm: iso(prog.sincronizadoEm),
      proximaTrocaEm: iso(prog.proximaTrocaEm),
    },
    itemAtual: tipoItem && inteiro(item.id, { min: 1 }) !== null
      ? { tipo: tipoItem, id: inteiro(item.id, { min: 1 }), versao: inteiro(item.versao, { min: 0, max: 1e6 }) }
      : null,
    video: deLista(b.video?.estado, ESTADOS_VIDEO) ? { estado: b.video.estado } : null,
    falhas: {
      // Teto no contador: é diagnóstico de sessão, não métrica. Um número absurdo só
      // denunciaria um player em laço — e um laço não melhora com um inteiro maior.
      totalSessao: inteiro(falhas.totalSessao, { min: 0, max: 100_000 }) ?? 0,
      ultima: codigo
        ? {
          codigo,
          tipo: deLista(ultima.tipo, TIPOS_ITEM),
          id: inteiro(ultima.id, { min: 1 }),
          versao: inteiro(ultima.versao, { min: 0, max: 1e6 }),
          // DURAÇÃO, não instante: a TV diz "há quantos segundos", e o servidor ancora isso
          // na hora em que recebeu. Assim uma parede com a data errada não produz uma falha
          // datada de 1970 — ou de 2040.
          haSegundos: inteiro(ultima.haSegundos, { min: 0, max: 30 * 24 * 3600 }),
        }
        : null,
    },
    uptimeSegundos: inteiro(b.uptimeSegundos, { min: 0, max: 365 * 24 * 3600 }),
  };
}

/* ISO só se for ISO de verdade, com teto de tamanho. Uma string qualquer aqui viraria um
   `Invalid Date` silencioso lá na frente, e o diagnóstico mentiria sem nenhum sinal. */
function iso(v) {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/* ── Saída para o admin ─────────────────────────────────────────────────────────────── */

/* O diagnóstico de uma tela, pronto para a UI.

   Os NOMES chegam resolvidos de fora (`nomeDoItem`, `nomeDaPlaylist`), porque quem sabe
   consultar o banco é a rota — e porque resolver em lote é o que impede N+1 com cem TVs.
   Item apagado entre o heartbeat e a consulta não quebra nada: vira "Item removido". */
export function telaMonitorada({ aparelho, snapshot, agoraMs, recebidoEmMs, nomeDoItem, nomeDaPlaylist, nomeDaRegra }) {
  const sincronizadoEmMs = snapshot?.programacao?.sincronizadoEm ? Date.parse(snapshot.programacao.sincronizadoEm) : null;
  // A falha vira instante ABSOLUTO aqui, ancorada na hora em que o heartbeat chegou.
  const haS = snapshot?.falhas?.ultima?.haSegundos;
  const ultimaFalhaEmMs = Number.isFinite(haS) && Number.isFinite(recebidoEmMs) ? recebidoEmMs - haS * 1000 : null;

  const { saude, motivo } = saudeDaTela({
    online: aparelho.online,
    snapshot,
    agoraMs,
    sincronizadoEmMs: Number.isFinite(sincronizadoEmMs) ? sincronizadoEmMs : null,
    ultimaFalhaEmMs,
    temPlaylistPadrao: aparelho.tvPlaylistId != null,
  });

  const item = snapshot?.itemAtual ?? null;
  const ultima = snapshot?.falhas?.ultima ?? null;

  return {
    id: aparelho.id,
    nome: aparelho.nome,
    online: aparelho.online,
    ultimoSinalEm: aparelho.ultimoSinalEm ?? null,
    tela: aparelho.tela ?? null,
    versaoPlayer: aparelho.versao ?? null,
    saude,
    motivo,
    // A frase é montada AQUI e não no React: a regra e o texto que a explica não podem morar
    // em arquivos diferentes, senão um muda sem o outro.
    mensagem: fraseDoMotivo(motivo),
    temTelemetria: !!snapshot,
    estado: snapshot?.estado ?? null,
    uptimeSegundos: snapshot?.uptimeSegundos ?? null,
    programacao: snapshot
      ? {
        playlistId: snapshot.programacao.playlistId,
        playlistNome: nomeDaPlaylist?.(snapshot.programacao.playlistId) ?? null,
        origem: snapshot.programacao.origem,
        regraId: snapshot.programacao.regraId,
        regraDescricao: nomeDaRegra?.(snapshot.programacao.regraId) ?? null,
        caiuNoPadrao: snapshot.programacao.caiuNoPadrao,
        sincronizadoEm: snapshot.programacao.sincronizadoEm,
        proximaTrocaEm: snapshot.programacao.proximaTrocaEm,
      }
      : null,
    itemAtual: item
      ? { tipo: item.tipo, id: item.id, versao: item.versao, nome: nomeDoItem?.(item.tipo, item.id) ?? null }
      : null,
    video: snapshot?.video ?? null,
    falhas: snapshot
      ? {
        totalSessao: snapshot.falhas.totalSessao,
        ultima: ultima
          ? {
            codigo: ultima.codigo,
            frase: fraseDaFalha(ultima.codigo),
            tipo: ultima.tipo,
            id: ultima.id,
            nome: ultima.tipo && ultima.id ? (nomeDoItem?.(ultima.tipo, ultima.id) ?? null) : null,
            em: Number.isFinite(ultimaFalhaEmMs) ? new Date(ultimaFalhaEmMs).toISOString() : null,
          }
          : null,
      }
      : null,
  };
}

/* O resumo do topo. Contar aqui, e não no React, é o que garante que a soma dos cartões
   bate com a lista — se cada lado contasse do seu jeito, um dia não bateria. */
export function resumo(telas) {
  const base = { total: telas.length, SAUDAVEL: 0, ATENCAO: 0, OFFLINE: 0, SEM_TELEMETRIA: 0, SEM_PROGRAMACAO: 0 };
  for (const t of telas) base[t.saude] = (base[t.saude] ?? 0) + 1;
  return base;
}

/* PROBLEMA SOBE. Empate desfeito pelo nome, para a lista não dançar entre dois refreshes —
   uma lista que reordena sozinha a cada 30 s é impossível de usar. */
export const ordenar = (telas) => [...telas].sort(
  (a, b) => (PESO_SAUDE[a.saude] - PESO_SAUDE[b.saude]) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'),
);
