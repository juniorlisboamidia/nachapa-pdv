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

/* Os dois tipos de item da programação. Um item sem `tipo` é IMAGEM: é o contrato do
   servidor (a coluna nasce com DEFAULT 'IMAGEM') e o que faz uma TV com build anterior
   continuar entendendo a programação. */
export const ehMenuBoard = (item) => item?.tipo === 'menu_board'
export const ehVideo = (item) => item?.tipo === 'video'

/* Este item está no ar AGORA?

   A pergunta é diferente para cada tipo, e é por isso que ela mora aqui:

   · IMAGEM     precisa estar ativa, dentro da janela e ter arte. A agenda é da imagem —
                ela pode entrar às 18:00 sem ninguém tocar no aparelho.
   · MENU BOARD já chega RESOLVIDO do servidor, que é quem conhece o catálogo. Se ele veio,
                é porque tem produto disponível. A checagem aqui é a última rede: um board
                que chegasse sem produto nenhum viraria uma tela vazia na parede. */
export function noAr(item, agoraMs) {
  if (!item) return false
  if (ehMenuBoard(item)) return Array.isArray(item.produtos) && item.produtos.length > 0
  if (item.ativo !== true) return false
  // VÍDEO passa pela MESMA régua de agenda da imagem — e essa régua responde "pode
  // COMEÇAR?". Um vídeo que já está tocando quando o `fimEm` passa TERMINA: quem garante
  // isso é o player, que só reavalia a lista entre itens. Cortar no meio é pior do que
  // exibir vinte segundos além da janela.
  return dentroDaJanela(item, agoraMs)
}

/* O que a TV deve girar agora, na ordem que veio da playlist — já sem o que falhou ao
   carregar. `falhados` é um Set de ids: uma imagem que não abriu é PULADA, em vez de
   deixar um retângulo preto numa parede da loja pelo resto do dia.

   A ORDEM NÃO É REORDENADA AQUI. Ela vem pronta do servidor (a posição na playlist), e
   reordenar por id desfaria a sequência que o gestor montou. */
export function paraExibir({ itens, agoraMs, falhados } = {}) {
  const lista = Array.isArray(itens) ? itens : []
  const fora = falhados instanceof Set ? falhados : new Set()
  return lista.filter((item) => {
    if (!item) return false
    // `falhados` é por TIPO: o id 3 de uma imagem e o id 3 de um board são coisas
    // diferentes, e uma arte quebrada não pode tirar um menu board do ar.
    if (fora.has(chaveDoItem(item))) return false
    // Arte sem URL existiria só para falhar no carregamento; board sem produto seria tela
    // vazia. Os dois caem na mesma pergunta, cada um com a régua dele.
    if (ehVideo(item) && !item.arquivoUrl) return false
    if (!ehMenuBoard(item) && !ehVideo(item) && !item.imagemUrl) return false
    return noAr(item, agoraMs)
  })
}

/* A chave de um item na programação. `tipo:id` porque as duas listas têm ids próprios. */
/* A chave de um item na programação — por TIPO, porque as três listas têm ids próprios.

   No VÍDEO a chave inclui a VERSÃO do arquivo: um vídeo que falhou e foi substituído merece
   chance nova sem esperar a programação inteira mudar. */
export const chaveDoItem = (item) => {
  if (ehMenuBoard(item)) return `b:${item?.id}`
  if (ehVideo(item)) return `v:${item?.id}:${item?.arquivoVersao ?? 0}`
  return `i:${item?.id}`
}

/* A assinatura da lista exibida: mudou de verdade, ou o refresh só devolveu o mesmo?

   É o que impede a TV de piscar. A programação é relida a cada 60 s; sem isto, o índice
   voltaria a zero a cada resposta igual e a primeira imagem reapareceria a cada minuto,
   para sempre, na frente do cliente.

   A VERSÃO da imagem entra: trocar a arte de um conteúdo É mudança. Trocar o NOME dele não
   é — o nome é do admin, a TV nem o mostra —, e por isso ele fica de fora. */
export function assinatura(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((item) => {
      // O ARQUIVO novo é mudança estrutural daquela mídia — a URL muda e a TV precisa
      // buscá-la. O NOME administrativo não entra: renomear não reinicia o rodízio.
      if (ehVideo(item)) return `v${item?.id}:${item?.arquivoVersao ?? 0}`
      if (!ehMenuBoard(item)) return `i${item?.id}:${item?.imagemVersao ?? 0}:${item?.duracaoSegundos ?? 0}`
      // O PREÇO NÃO ENTRA na assinatura, e isso é o coração do menu board: preço mudou no
      // Cardápio Web, a tela se redesenha com o valor novo no próximo refresh SEM reiniciar
      // o rodízio. O que entra é a COMPOSIÇÃO — layout, título e quais produtos estão na
      // tela —, porque essa mudança é estrutural e merece recomeçar.
      const ids = (item.produtos ?? []).map((p) => p?.id).join(',')
      return `b${item.id}:${item.duracaoSegundos ?? 0}:${item.layout ?? ''}:${item.titulo ?? ''}:${ids}`
    })
    .join('|')
}

/* Qual imagem pré-carregar: a próxima da fila, e só ela.

   Uma só, e não a lista inteira: TV de loja é hardware modesto, e o que importa é que a
   troca não mostre um quadro vazio. Com um conteúdo só não há o que pré-carregar. */
export function proximaParaPrecarregar(lista, indice) {
  if (!Array.isArray(lista) || lista.length < 2) return []
  const proxima = lista[proximoIndice(indice, lista.length)]
  if (!proxima) return []
  // MENU BOARD pré-carrega as fotos dos PRODUTOS: sem isso, a troca mostraria oito
  // retângulos vazios enchendo um a um na frente do cliente. É a lista inteira do board, e
  // não a tela toda — são poucas imagens, e só as do próximo item.
  if (ehMenuBoard(proxima)) return (proxima.produtos ?? []).map((p) => p?.imagemUrl).filter(Boolean)
  // VÍDEO não é pré-carregado, e isso é deliberado: baixar 200 MB do próximo enquanto o
  // atual toca é a maneira mais rápida de estourar a banda da loja e travar o que está na
  // tela. O `<video>` cuida do próprio buffer quando chega a vez dele.
  if (ehVideo(proxima)) return []
  return proxima.imagemUrl ? [proxima.imagemUrl] : []
}
