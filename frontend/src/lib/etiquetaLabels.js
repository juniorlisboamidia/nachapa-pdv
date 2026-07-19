// Fonte ÚNICA dos rótulos de etiqueta — a tela de Config, a aba Itens e o quiosque tinham
// mapas soltos e DIVERGENTES (o quiosque rotulava a conservação errado, imprimindo o rótulo
// antigo no alimento). Tudo importa daqui agora.
export const CONS_LABEL = {
  CONGELADO: 'Congelado',
  RESFRIADO_0_4: 'Refrigerado',
  RESFRIADO_4_6: 'Resfriado',
  AMBIENTE: 'Ambiente Seco',
  DESCONGELADO: 'Descongelado',
  ABERTO: 'Produto aberto',
}
export const TIPO_LABEL = {
  PRODUCAO_PROPRIA: 'Produção própria',
  INGREDIENTE: 'Ingrediente',
  ACOMPANHAMENTO: 'Acompanhamento',
  HORTIFRUTI: 'Hortifruti',
  BEBIDA: 'Bebida',
  EMBALAGEM: 'Embalagem',
  OPERACIONAL: 'Operacional',
}
export const TIPO_BADGE = {
  PRODUCAO_PROPRIA: 'badge-blue',
  INGREDIENTE: 'badge-orange',
  ACOMPANHAMENTO: 'badge-red',
  HORTIFRUTI: 'badge-green',
  BEBIDA: 'badge-yellow',
  EMBALAGEM: 'badge-gray',
  OPERACIONAL: 'badge-gray',
}
// Ordem de exibição: produção própria primeiro (é o que mais usa etiqueta). Default 99.
export const TIPO_ORDEM = { PRODUCAO_PROPRIA: 0, INGREDIENTE: 1, ACOMPANHAMENTO: 2, HORTIFRUTI: 3, BEBIDA: 4 }
export const tipoOrdem = (t) => (t in TIPO_ORDEM ? TIPO_ORDEM[t] : 99)
