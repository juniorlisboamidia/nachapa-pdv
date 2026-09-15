// TV Indoor › TELEMETRIA DO PLAYER — o estado da parede, num lugar só.
//
// ── POR QUE ISTO EXISTE SEPARADO ──────────────────────────────────────────────────────
// Sem um dono único, cada pedaço do player escreveria seu pedaço no heartbeat: o vídeo
// mandaria o estado do vídeo, o rodízio mandaria o item, a busca mandaria a sincronização.
// Três donos do mesmo objeto é como se produz um diagnóstico que contradiz a si mesmo — a
// TV reportando "REPRODUZINDO" com item nulo, ou uma falha sem dizer de quê.
//
// Aqui existe UM registro, com funções que o atualizam, e o heartbeat só LÊ.
//
// ── TELEMETRIA NUNCA MANDA NO PLAYER ──────────────────────────────────────────────────
// Nada aqui agenda, troca item, dispara requisição ou decide o que tocar. Se este arquivo
// inteiro parasse de funcionar, a parede continuaria exatamente igual. É a razão de ele não
// ter timer nenhum: quem bate é o heartbeat que já existia.
//
// ── O RELÓGIO DA TV NÃO É AUTORIDADE ──────────────────────────────────────────────────
// Uma parede de loja com a data errada é o caso comum. Por isso o que viaja daqui são
// DURAÇÕES relativas (`haSegundos`, `uptimeSegundos`), medidas com `performance.now()`, que
// anda para frente independentemente de o relógio do sistema estar certo. O servidor ancora
// essas durações na hora em que recebe. A única hora absoluta que mandamos de volta é o
// `agoraServidor` que ele mesmo nos deu.

export const ESTADOS = Object.freeze(['REPRODUZINDO', 'INSTITUCIONAL', 'SEM_CONTEUDO', 'ATUALIZANDO', 'FALHA_TOTAL'])

/* Os códigos de falha. Enum curto e fechado — nunca stack trace, nunca mensagem do
   navegador, nunca URL interna. O que o suporte precisa é "qual falha, em qual mídia". */
export const FALHAS = Object.freeze({
  IMAGEM: 'IMAGE_LOAD_ERROR',
  VIDEO_CARGA: 'VIDEO_LOAD_ERROR',
  VIDEO_AUTOPLAY: 'VIDEO_PLAY_REJECTED',
  VIDEO_TRAVOU: 'VIDEO_STALL',
  PROGRAMACAO: 'PROGRAMACAO_REFRESH_ERROR',
  TUDO_FALHOU: 'ALL_MEDIA_FAILED',
})

/* Relógio MONOTÔNICO. `performance.now()` conta desde que a aba abriu e não anda para trás
   quando o sistema acerta a hora — que é exatamente o que acontece numa TV de loja assim
   que ela pega rede. Com `Date.now()`, um acerto de relógio produziria uptime negativo ou
   uma falha "do futuro". */
const agoraMono = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : 0)

const inicio = agoraMono()

// O registro. Módulo-singleton de propósito: existe UM player por aba, e passá-lo por
// props atravessaria quatro componentes para nada.
const estado = {
  estado: 'ATUALIZANDO',
  programacao: { playlistId: null, origem: null, regraId: null, caiuNoPadrao: false, sincronizadoEm: null, proximaTrocaEm: null },
  itemAtual: null,
  video: null,
  totalFalhas: 0,
  ultimaFalha: null,   // { codigo, tipo, id, versao, mono }
}

/* A programação chegou VÁLIDA. `sincronizadoEm` é o `agoraServidor` da resposta — a única
   hora absoluta em que confiamos, porque não nasceu aqui.

   Um refresh que FALHA não chama isto, e é justamente essa ausência que o servidor enxerga
   como "não sincroniza há X" — sem precisar de uma mensagem de erro dizendo isso. */
export function programacaoRecebida(dados) {
  const t = dados?.programacaoTela ?? {}
  estado.programacao = {
    playlistId: numero(t.playlistEfetivaId ?? dados?.playlist?.id),
    origem: t.origem === 'REGRA' || t.origem === 'PADRAO' ? t.origem : null,
    regraId: numero(t.regraId),
    caiuNoPadrao: t.caiuNoPadrao === true,
    sincronizadoEm: typeof dados?.agoraServidor === 'string' ? dados.agoraServidor : null,
    proximaTrocaEm: typeof t.proximaTrocaEm === 'string' ? t.proximaTrocaEm : null,
  }
}

/* O item que está na tela AGORA. `null` significa que nada está sendo exibido — e o estado
   diz por quê: institucional (repouso), sem conteúdo, ou falha total. */
export function itemNoAr(item, { total = 0, temProgramacao = false } = {}) {
  if (!item) {
    estado.itemAtual = null
    estado.video = null
    // As três razões para a tela mostrar a marca da loja são MUITO diferentes na gestão, e
    // é aqui que elas se separam — depois disso ninguém mais consegue distingui-las.
    if (!temProgramacao) estado.estado = 'SEM_CONTEUDO'
    else if (total === 0 && estado.totalFalhas > 0) estado.estado = 'FALHA_TOTAL'
    else estado.estado = 'INSTITUCIONAL'
    return
  }
  const tipo = item.tipo === 'menu_board' ? 'MENU_BOARD' : item.tipo === 'video' ? 'VIDEO' : 'IMAGEM'
  estado.estado = 'REPRODUZINDO'
  estado.itemAtual = {
    tipo,
    id: numero(item.id),
    // A versão só existe onde ela SIGNIFICA algo: é ela que diz se a TV está tocando o
    // arquivo novo ou ainda o antigo depois de uma substituição.
    versao: numero(tipo === 'VIDEO' ? item.arquivoVersao : tipo === 'IMAGEM' ? item.imagemVersao : null),
  }
  if (tipo !== 'VIDEO') estado.video = null
}

/* O subestado do vídeo. Só PLAYING/BUFFERING: "o filme está correndo" e "o filme parou para
   carregar" são a única distinção que muda o que alguém faria a respeito. */
export function videoNoEstado(v) {
  estado.video = v === 'PLAYING' || v === 'BUFFERING' ? { estado: v } : null
}

/* Uma falha. Guarda a ÚLTIMA e conta a sessão — sem histórico, que era o pedido: isto é
   diagnóstico de sessão, não analytics. Se a aba reiniciar, o contador zera, e tudo bem. */
export function falhou(codigo, { tipo = null, id = null, versao = null } = {}) {
  if (!Object.values(FALHAS).includes(codigo)) return
  estado.totalFalhas += 1
  estado.ultimaFalha = { codigo, tipo, id: numero(id), versao: numero(versao), mono: agoraMono() }
}

export function atualizando() {
  // Só marca "atualizando" antes de existir qualquer programação. Depois disso, um refresh
  // em curso não muda o que está na parede — e dizer "ATUALIZANDO" com um vídeo tocando
  // seria reportar algo que o gestor não veria na tela.
  if (!estado.programacao.sincronizadoEm) estado.estado = 'ATUALIZANDO'
}

/* O SNAPSHOT que viaja no heartbeat. Só leitura — montar aqui é o que garante que o corpo
   enviado é sempre coerente com o registro, e nunca a soma de pedaços de vários donos. */
export function snapshot() {
  const mono = agoraMono()
  return {
    versao: 1,
    estado: estado.estado,
    programacao: { ...estado.programacao },
    itemAtual: estado.itemAtual ? { ...estado.itemAtual } : null,
    video: estado.video ? { ...estado.video } : null,
    falhas: {
      totalSessao: estado.totalFalhas,
      ultima: estado.ultimaFalha
        ? {
          codigo: estado.ultimaFalha.codigo,
          tipo: estado.ultimaFalha.tipo,
          id: estado.ultimaFalha.id,
          versao: estado.ultimaFalha.versao,
          // DURAÇÃO, nunca instante: o servidor ancora isto na hora em que recebeu.
          haSegundos: Math.max(0, Math.round((mono - estado.ultimaFalha.mono) / 1000)),
        }
        : null,
    },
    uptimeSegundos: Math.max(0, Math.round((mono - inicio) / 1000)),
  }
}

// Só para os testes: o registro é um singleton de módulo, e um teste não pode herdar o
// estado do anterior.
export function _reiniciar() {
  estado.estado = 'ATUALIZANDO'
  estado.programacao = { playlistId: null, origem: null, regraId: null, caiuNoPadrao: false, sincronizadoEm: null, proximaTrocaEm: null }
  estado.itemAtual = null
  estado.video = null
  estado.totalFalhas = 0
  estado.ultimaFalha = null
}

const numero = (v) => {
  // A recusa explícita de `null`/`undefined`/`''` vem antes de qualquer conversão, e não é
  // zelo: `Number(null)` é 0, e sem esta linha um menu board — que não tem versão — viajaria
  // como `versao: 0`, indistinguível de uma mídia que realmente está na versão zero.
  if (v === null || v === undefined || v === '') return null
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : null
}
