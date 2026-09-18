// O ARTBOARD do menu board: as medidas fixas em que ele é desenhado, por orientação.
//
// O board é sempre desenhado em tamanho REAL e encolhido por `scale` — é o que faz "o card
// cabe?" ter uma resposta só, no admin e na parede. Com layout fluido, o admin em 600px
// tomaria decisões de quebra diferentes das da TV, e o gestor descobriria pela parede.
//
// Uma TV em pé é a mesma tela virada: 1080 × 1920. O mesmo board a alimenta, com outra
// composição (as regras `.retrato` da folha). A orientação é da TELA — a TV ou o seletor
// da prévia —, nunca do board.
export const ARTBOARD = Object.freeze({
  PAISAGEM: Object.freeze({ largura: 1920, altura: 1080 }),
  RETRATO: Object.freeze({ largura: 1080, altura: 1920 }),
})

/* Só RETRATO é em pé. Qualquer outra coisa — inclusive ausência, servidor antigo, valor
   torto — é deitada, que é como toda parede se comportava antes desta frente. */
export const ehRetrato = (orientacao) => orientacao === 'RETRATO'

export const artboardDe = (orientacao) => (ehRetrato(orientacao) ? ARTBOARD.RETRATO : ARTBOARD.PAISAGEM)

/* A escala: quantas vezes o artboard cabe na caixa. Divide pela largura do artboard EM USO —
   medir sempre por 1920 numa caixa em pé desenharia o board pela metade. */
export function escalaDe(larguraDaCaixa, orientacao) {
  const l = Number(larguraDaCaixa)
  if (!Number.isFinite(l) || l <= 0) return null
  return l / artboardDe(orientacao).largura
}
