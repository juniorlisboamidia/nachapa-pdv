// Progressão automática entre grupos — módulo puro, testado em totemFoco.test.js.
//
// O comportamento que se quer reproduzir é o do próprio Cardápio Web: quando o
// cliente completa as escolhas de um grupo, a tela leva ele para o próximo em vez
// de deixá-lo procurar. Num combo com três grupos isso é a diferença entre uma
// jornada guiada e uma página comprida.
//
// A regra é estreita de propósito, porque rolagem automática na hora errada é
// pior do que rolagem nenhuma. Ela dispara SÓ quando uma interação do cliente faz
// a quantidade escolhida passar de "menor que o máximo" para "igual ao máximo".
// Não dispara ao carregar a tela, não dispara ao desmarcar, não dispara em grupo
// sem teto, e o grupo principal da vitrine nem chega aqui (a lista que entra já
// vem sem ele).
import { somaDaSelecao } from './totemLayout.js'

const lista = (v) => (Array.isArray(v) ? v : [])
const mesmoId = (a, b) => String(a) === String(b)
// null/undefined = sem teto. 0 é teto de verdade.
const teto = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// A transição aconteceu NESTE toque? Comparar os dois lados é o que separa
// "acabei de completar o grupo" de "o grupo já estava completo e eu troquei de
// opção" — no segundo caso a tela não pode sair do lugar.
export function atingiuMax(grupo, antes, depois) {
  const max = teto(grupo?.max)
  if (max === null) return false
  return somaDaSelecao(antes) < max && somaDaSelecao(depois) === max
}

// Para onde ir depois de completar `grupoId`. Percorre na ordem em que os grupos
// chegaram, que é a ordem do `index` do Cardápio Web — nunca por id nem por nome.
// Grupo que não está ACTIVE é pulado: ele está na tela, apagado, e não aceita
// toque, então parar nele seria levar o cliente a um beco.
// Sem próximo, o destino é o botão de adicionar.
export function proximoFoco(grupos, grupoId) {
  const gs = lista(grupos)
  const i = gs.findIndex((g) => mesmoId(g?.id, grupoId))
  if (i < 0) return { tipo: 'CTA' }
  for (let k = i + 1; k < gs.length; k++) {
    const g = gs[k]
    if (g?.status && g.status !== 'ACTIVE') continue
    return { tipo: 'GRUPO', id: g.id }
  }
  return { tipo: 'CTA' }
}

// ── Aritmética da rolagem ───────────────────────────────────────────────────
// Fica aqui, pura e testada, porque foi exatamente ela que errou: a primeira
// versão usava `offsetTop` como se fosse coordenada interna do container
// rolável. Não é — o `offsetParent` dos blocos é `.tq-raiz`, o único ancestral
// posicionado, então o valor já vinha somado à altura do cabeçalho e a tela
// parava ~96px abaixo do grupo, cortando justamente o nome dele.
//
// Agora quem lê o DOM entrega a posição do alvo JÁ RELATIVA ao topo visível do
// container (`rect do alvo − rect da caixa`), e esta função decide o resto.
// Devolve `null` quando não se deve rolar.
//
//   topoRelativo   distância do topo do alvo até o topo visível da caixa (pode ser < 0)
//   alturaAlvo     altura do bloco de destino
//   scrollAtual    scrollTop da caixa
//   alturaVisivel  clientHeight da caixa
//   permitirVoltar o avanço automático nunca volta; um toque explícito do
//                  cliente (chip "falta escolher") pode.
export function destinoDeRolagem({
  topoRelativo, alturaAlvo = 0, scrollAtual = 0, alturaVisivel = 0, margem = 16, permitirVoltar = false,
} = {}) {
  const rel = Number(topoRelativo)
  if (!Number.isFinite(rel)) return null
  // Alvo inteiro à vista: mexer na tela seria movimento gratuito.
  const jaVisivel = rel >= 0 && rel + Number(alturaAlvo || 0) <= Number(alturaVisivel || 0)
  if (jaVisivel) return null
  const destino = Math.max(0, Number(scrollAtual || 0) + rel - Number(margem || 0))
  if (!permitirVoltar && destino <= Number(scrollAtual || 0)) return null
  return destino
}

/* QUAL CATEGORIA ESTÁ SENDO LIDA AGORA — o catálogo passou a ser contínuo.

   A grade deixou de mostrar uma categoria por vez: todas ficam empilhadas num
   rolar só, como no Cardápio Web, e a sidebar deixou de FILTRAR para virar
   índice — ela diz onde o cliente está e leva até onde ele quer ir.

   `secoes` é `[{ id, topo }]`, e `topo` é medido a partir do início do conteúdo
   rolável — nunca `offsetTop`, cujo `offsetParent` aqui é a raiz do quiosque e
   não o container que rola. Foi exatamente essa confusão de sistema de
   coordenadas que fez o avanço automático parar 96px depois do grupo certo.
   A lista vem na ordem da tela.

   Duas regras, e a segunda existe por um caso real:
   1. Vale a ÚLTIMA seção cujo TÍTULO já CHEGOU ao topo da tela.

      "Chegou" é medido pela altura do próprio título, mais uma folga: a categoria acende
      quando o título dela encosta na borda de cima, e não quando já saiu por ela. É a
      diferença entre ler "ARTESANAIS" no alto com "ARTESANAIS" aceso ao lado, e ler
      "ARTESANAIS" no alto com "COMBOS" aceso.

      Três tentativas antes desta, e as três erraram na mesma direção — a régua exigia
      mais rolagem do que o olho:
        · topo da SEÇÃO com linha a 24px: o título tem 30px de respiro acima, então
          aparecia inteiro antes de a seção cruzar;
        · linha a 28% da altura: consertou o atraso e criou adiantamento, acendendo a
          categoria nova com o título dela ainda no meio da tela;
        · topo do TÍTULO com linha a 8px: ainda pedia que o título saísse da tela.

      A medida agora sai do conteúdo, não de um número escolhido: a folga é o tamanho do
      próprio título. Ele muda com a tela, e a régua muda junto.
   2. Chegando ao fim da rolagem, vale a última seção. Sem isto, uma categoria
      curta no rodapé — "SUCOS" com três itens — nunca alcançaria a linha e
      ficaria sem destaque por mais que o cliente rolasse.

   Nunca lança: entrada torta devolve `null` e a sidebar fica como está. */
export function categoriaPorRolagem({
  secoes, scrollAtual = 0, alturaVisivel = 0, alturaTotal = 0, folgaTitulo = 16, folgaFim = 24,
} = {}) {
  const lista = Array.isArray(secoes)
    ? secoes.filter((s) => s && s.id != null && Number.isFinite(Number(s.topo)))
    : []
  if (!lista.length) return null

  const y = Number(scrollAtual) || 0
  const visivel = Number(alturaVisivel) || 0
  const total = Number(alturaTotal) || 0
  const folga = Math.max(0, Number(folgaFim) || 0)
  if (total > 0 && visivel > 0 && y + visivel >= total - folga) return lista[lista.length - 1].id

  // A linha é POR SEÇÃO, porque ela sai da altura do título daquela seção. `folgaTitulo`
  // evita que a troca oscile a cada pixel no limiar exato.
  let atual = lista[0].id
  for (const s of lista) {
    const marca = y + (Number(s.alturaTitulo) || 0) + (Number(folgaTitulo) || 0)
    if (Number(s.topo) <= marca) atual = s.id
    else break
  }
  return atual
}

/* ── QUANTO FALTA DO CATÁLOGO ───────────────────────────────────────────────────────
   O tablet não desenha barra de rolagem: sem isto dá para rolar por um minuto num
   cardápio de noventa cards sem nenhuma pista de quanto falta. Puro e sem DOM: quem mede
   é a tela, quem calcula é aqui.

   Este indicador chegou a ser removido por eu ter atribuído a ele uma confusão que era de
   outro lugar — o destaque da sidebar estava atrasado, e a culpa pareceu do polegar
   marcando um ponto que não batia com a categoria acesa. Com o atraso corrigido, ele
   voltou. Fica o registro para ninguém refazer o diagnóstico errado. */

/* A janela visível sobre o catálogo inteiro: onde ela começa e que fatia ela cobre.

   `minimo` existe porque num cardápio de noventa cards a janela é ~4% do total, e um
   polegar de 4% da altura da coluna é um risco que ninguém enxerga a um metro. Ele passa
   a ocupar o mínimo legível — o indicador vira posição, não medida exata. */
export function janelaDeRolagem({ scrollAtual = 0, alturaVisivel = 0, alturaTotal = 0, minimo = 0.06 } = {}) {
  const total = Number(alturaTotal) || 0
  const visivel = Number(alturaVisivel) || 0
  if (total <= 0 || visivel <= 0 || visivel >= total) return { inicio: 0, fracao: 1 }
  const y = Math.min(Math.max(Number(scrollAtual) || 0, 0), total - visivel)
  const fracao = Math.min(1, Math.max(minimo, visivel / total))
  // O início é reescalado para a fração ampliada não estourar o fim da trilha.
  const inicio = (y / (total - visivel)) * (1 - fracao)
  return { inicio, fracao }
}
