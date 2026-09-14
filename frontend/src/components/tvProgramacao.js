// TV Indoor › a programação na TELA — módulo puro, testado em tvProgramacao.test.js.
//
// Domínio PRÓPRIO do canal, como o `tvIndoor.js` do servidor. O que ele compartilha com o
// totem são as contas de relógio e janela (`lib/midiaAgenda.js`), que não sabem o que é
// banner nem o que é conteúdo. Nenhuma linha daqui importa nada do totem.
//
// A régua de elegibilidade é a MESMA do servidor (`backend/tvIndoor.js`): a programação
// carrega `ativo`, `inicioEm` e `fimEm`, e a decisão temporal acontece aqui, na TV. É isso
// que faz um conteúdo agendado para as 18:00 entrar às 18:00 em vez de esperar o próximo
// refresh, que pode estar a um minuto de distância.
import { dentroDaJanela, duracaoEmMs, proximoIndice } from '../lib/midiaAgenda.js'

export { desvioDoRelogio, proximoIndice } from '../lib/midiaAgenda.js'

/* A faixa do canal, espelho de `backend/tvIndoor.js`. Padrão 10 s: a TV é lida de longe e
   de passagem, e os 6 s do totem numa parede viram inquietação. */
export const FAIXA = Object.freeze({ minS: 3, maxS: 120, padraoS: 10 })

export const duracaoMs = (conteudo) => duracaoEmMs(conteudo?.duracaoSegundos, FAIXA)

/* Este conteúdo está no ar AGORA? */
export function noAr(conteudo, agoraMs) {
  if (!conteudo || conteudo.ativo !== true) return false
  return dentroDaJanela(conteudo, agoraMs)
}

/* O que a TV deve girar agora, na ordem que veio da playlist — já sem o que falhou ao
   carregar. `falhados` é um Set de ids: uma imagem que não abriu é PULADA, em vez de
   deixar um retângulo preto numa parede da loja pelo resto do dia.

   A ORDEM NÃO É REORDENADA AQUI. Ela vem pronta do servidor (a posição na playlist), e
   reordenar por id desfaria a sequência que o gestor montou. */
export function paraExibir({ itens, agoraMs, falhados } = {}) {
  const lista = Array.isArray(itens) ? itens : []
  const fora = falhados instanceof Set ? falhados : new Set()
  return lista.filter((c) => c && !fora.has(c.id) && c.imagemUrl && noAr(c, agoraMs))
}

/* A assinatura da lista exibida: mudou de verdade, ou o refresh só devolveu o mesmo?

   É o que impede a TV de piscar. A programação é relida a cada 60 s; sem isto, o índice
   voltaria a zero a cada resposta igual e a primeira imagem reapareceria a cada minuto,
   para sempre, na frente do cliente.

   A VERSÃO da imagem entra: trocar a arte de um conteúdo É mudança. Trocar o NOME dele não
   é — o nome é do admin, a TV nem o mostra —, e por isso ele fica de fora. */
export function assinatura(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((c) => `${c.id}:${c.imagemVersao ?? 0}:${c.duracaoSegundos ?? 0}`)
    .join('|')
}

/* Qual imagem pré-carregar: a próxima da fila, e só ela.

   Uma só, e não a lista inteira: TV de loja é hardware modesto, e o que importa é que a
   troca não mostre um quadro vazio. Com um conteúdo só não há o que pré-carregar. */
export function proximaParaPrecarregar(lista, indice) {
  if (!Array.isArray(lista) || lista.length < 2) return null
  return lista[proximoIndice(indice, lista.length)]?.imagemUrl ?? null
}
