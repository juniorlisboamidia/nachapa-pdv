// TV Indoor › Monitoramento — a COMPOSIÇÃO de cada linha da lista.
//
// ── POR QUE ISTO NÃO MORA NO JSX ──────────────────────────────────────────────────────
// Porque "o que a linha diz em cada estado" é a regra de produto desta tela, e regra de
// produto dentro de JSX não tem teste. São cinco saúdes × três tipos de item × item
// removido × fallback × sincronização atrasada — combinações demais para conferir no olho a
// cada mudança.
//
// ── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────────────────
// Não decide saúde e não recalcula limiar nenhum. Quem diz se a sincronização está atrasada
// é o BACKEND, pelo `motivo` que acompanha a saúde — repetir os 4 minutos aqui criaria uma
// segunda régua que um dia discordaria da primeira, e as duas estariam na mesma tela.
//
// ── HIERARQUIA ────────────────────────────────────────────────────────────────────────
// O que a pessoa veio ler vem primeiro: o que está no ar, se está tudo certo; qual é o
// problema, se não está. Playlist, sincronização e resolução são apoio — e apoio não pode
// disputar atenção com o problema.
// A extensão `.js` é obrigatória: o Vite resolveria sem ela, mas o `node --test` não — e
// este módulo é importado pelos dois. Omitir a extensão passa no build e só quebra na
// suíte, que é o pior lugar para descobrir.
import { haQuanto } from '../lib/duracaoRelativa.js'

// O rótulo do tipo, em português e por extenso. `VIDEO #14` é como o banco pensa; ninguém
// na loja chama o filme assim.
export const TIPOS = Object.freeze({ IMAGEM: 'Imagem', MENU_BOARD: 'Menu Board', VIDEO: 'Vídeo' })
export const ORIGENS = Object.freeze({ REGRA: 'Regra semanal', PADRAO: 'Playlist padrão' })

/* O nome da mídia no ar. "Item removido" quando ela foi apagada entre o heartbeat e agora —
   e não um id cru, que obrigaria o gestor a ir procurar o que é o 44. */
export function textoDoItem(item) {
  if (!item?.tipo) return null
  return `${TIPOS[item.tipo] ?? 'Item'} — ${item.nome ?? 'Item removido'}`
}

/* A programação em uma linha: qual playlist, e por quê.

   Termo interno (`origem=REGRA`) não aparece. E o `caiuNoPadrao` vira uma palavra discreta
   em vez de um parágrafo: na lista ele é um detalhe de por que a playlist é essa, e a
   explicação inteira mora no Diagnóstico. */
export function textoDaProgramacao(programacao) {
  if (!programacao) return null
  // "Playlist removida" JÁ é a frase inteira — prefixá-la produzia "Playlist Playlist
  // removida". O rótulo só ganha o prefixo quando há um nome de verdade.
  if (!programacao.playlistNome) return programacao.playlistId ? 'Playlist removida' : null
  const rotulo = `Playlist ${programacao.playlistNome}`
  if (programacao.caiuNoPadrao) return `${rotulo} · Fallback para padrão`
  const origem = ORIGENS[programacao.origem]
  return origem ? `${rotulo} · ${origem}` : rotulo
}

/* A sincronização, com a frase seguindo o DIAGNÓSTICO do servidor.

   "Sincronizado há 18s" e "Sem sincronizar há 8min" são a mesma medida com leituras
   opostas, e quem decide qual delas vale é o `motivo` que veio do backend. Se um dia o
   limiar de 4 minutos mudar lá, esta frase acompanha sozinha. */
export function textoDaSincronizacao(tela, agoraIso) {
  const quando = haQuanto(tela?.programacao?.sincronizadoEm, agoraIso)
  if (!quando) return tela?.temTelemetria ? 'Nunca sincronizou' : null
  return tela.motivo === 'SINCRONIZACAO_ANTIGA' ? `Sem sincronizar ${quando}` : `Sincronizado ${quando}`
}

/* A resolução que o aparelho reportou. Ausente, não vira placeholder feio: a linha
   simplesmente não a menciona. */
export const textoDaResolucao = (tela) => (tela?.tela?.w && tela?.tela?.h ? `${tela.tela.w} × ${tela.tela.h}` : null)

/* A linha inteira, por estado.

   `aviso` é o MOTIVO PRINCIPAL, um só. Despejar três avisos numa lista é garantir que
   nenhum seja lido — os detalhes têm um lugar, e ele se chama Diagnóstico. */
export function composicao(tela, agoraIso) {
  const sinal = haQuanto(tela?.ultimoSinalEm, agoraIso)
  const base = {
    aviso: null,
    item: null,
    programacao: null,
    apoio: [],
  };

  const ultimoSinal = sinal ? `Último sinal ${sinal}` : 'Nunca se comunicou'
  const resolucao = textoDaResolucao(tela)

  // OFFLINE: o que ela estava fazendo não é o que ela está fazendo. A linha fala do SINAL, e
  // o último estado conhecido fica no Diagnóstico, rotulado como tal.
  if (tela?.saude === 'OFFLINE') {
    return { ...base, aviso: tela.mensagem ?? null, apoio: [ultimoSinal, resolucao].filter(Boolean) }
  }

  // SEM TELEMETRIA e SEM PROGRAMAÇÃO não são defeito: são, respectivamente, um player
  // anterior a esta frente e uma configuração que falta. A linha diz isso e para por aí —
  // inventar dados de reprodução que não temos seria pior que não mostrar nada.
  if (tela?.saude === 'SEM_TELEMETRIA' || tela?.saude === 'SEM_PROGRAMACAO') {
    return { ...base, aviso: tela.mensagem ?? null, apoio: [ultimoSinal, resolucao].filter(Boolean) }
  }

  // TUDO CERTO e ATENÇÃO: as duas mostram o que está no ar. A diferença é que a de atenção
  // abre com o problema — e o problema não impede a TV de estar tocando alguma coisa.
  return {
    aviso: tela?.saude === 'ATENCAO' ? (tela.mensagem ?? null) : null,
    item: textoDoItem(tela?.itemAtual),
    programacao: textoDaProgramacao(tela?.programacao),
    apoio: [textoDaSincronizacao(tela, agoraIso), resolucao].filter(Boolean),
  }
}
