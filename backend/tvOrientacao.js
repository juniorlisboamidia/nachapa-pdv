// TV Indoor › a POSIÇÃO FÍSICA da tela — módulo puro.
//
// ── O PROBLEMA QUE ISTO RESOLVE ───────────────────────────────────────────────────────
// Uma TV pendurada em pé continua recebendo 1920 × 1080 deitados: a box Android não sabe
// que o painel foi girado, e o navegador também não. O conteúdo sai de lado. Não existe
// API que conte ao sistema como a TV está na parede — então a posição é DECLARADA pelo
// gestor e a rotação é CONFERIDA por ele, olhando para a tela.
//
// São duas informações, e elas não são a mesma coisa:
//
//   ORIENTAÇÃO  o que a parede é: deitada (PAISAGEM) ou em pé (RETRATO). É intenção, e é
//               o que o admin mostra na lista e o que os layouts futuros vão consultar.
//   ROTAÇÃO     a correção mecânica, em graus, que o player aplica por CSS para o
//               conteúdo sair em pé. Depende do aparelho e do LADO para o qual a TV foi
//               virada — por isso não dá para derivar uma da outra.
//
// Uma TV em pé pode precisar de 90 ou de 270 (virada para um lado ou para o outro), ou de
// 0 (as raras boxes que giram a saída sozinhas). Uma TV deitada pode precisar de 180:
// suporte de teto costuma pendurar o painel de ponta-cabeça.

export const ORIENTACOES = Object.freeze(['PAISAGEM', 'RETRATO']);
export const ORIENTACAO_PADRAO = 'PAISAGEM';
export const ROTACOES = Object.freeze([0, 90, 180, 270]);
export const MOTIVO_ORIENTACAO = 'ORIENTACAO_INVALIDA';

// Quanto dura a janela de ajuste. Enquanto ela está aberta a TV consulta o servidor a cada
// poucos segundos em vez de uma vez por minuto — senão cada "girar" do gestor levaria um
// minuto para aparecer na parede, e conferir três posições viraria uma espera de três.
export const MS_JANELA_AJUSTE = 10 * 60_000;

/* Orientação vinda de fora → valor do catálogo, ou `null` se não for nenhum.
   `null` é RECUSA, não padrão: quem chama decide o que fazer com entrada inválida. */
export function validarOrientacao(v) {
  return ORIENTACOES.includes(v) ? v : null;
}

/* Orientação lida do BANCO → sempre um valor do catálogo. Linha antiga (coluna nula) e
   valor corrompido são PAISAGEM: é como toda TV se comportava antes de a coluna existir. */
export function orientacaoDe(d) {
  return ORIENTACOES.includes(d?.tvOrientacao) ? d.tvOrientacao : ORIENTACAO_PADRAO;
}

/* Rotação lida do banco → sempre um valor do catálogo.
   ⚠️ Sem `Number(null)`: nulo viraria 0 por acidente — aqui daria o valor certo pelo
   motivo errado, e o hábito é o que quebra no próximo campo. */
export function rotacaoDe(d) {
  const r = d?.tvRotacao;
  return typeof r === 'number' && ROTACOES.includes(r) ? r : 0;
}

/* A rotação com que uma orientação NASCE. Em pé começa em 90 porque a maioria das boxes
   não gira a saída sozinha; se estiver errado, o gestor gira na conferência. */
export function rotacaoInicial(orientacao) {
  return orientacao === 'RETRATO' ? 90 : 0;
}

/* A ordem em que o "está errado, girar" percorre as posições: da MAIS provável para a
   menos, dada a orientação. Girar +90 às cegas levaria uma TV em pé de 90 para 180 — de
   lado para de ponta-cabeça, que é certamente errado — antes de chegar ao outro lado. */
const CICLO = Object.freeze({
  RETRATO: Object.freeze([90, 270, 0, 180]),
  PAISAGEM: Object.freeze([0, 180, 90, 270]),
});

export function proximaRotacao(orientacao, atual) {
  const ciclo = CICLO[ORIENTACOES.includes(orientacao) ? orientacao : ORIENTACAO_PADRAO];
  const i = ciclo.indexOf(atual);
  // Rotação fora do catálogo: recomeça do mais provável.
  return ciclo[(i + 1) % ciclo.length];
}

/* A janela de ajuste está aberta? `agora` e o valor do banco em qualquer forma de data. */
export function emAjuste(d, agoraMs) {
  const ate = d?.tvAjusteAte ? new Date(d.tvAjusteAte).getTime() : NaN;
  return Number.isFinite(ate) && ate > agoraMs;
}

/* O que a TV recebe sobre si mesma, dentro da programação.
   `ajusteAte` só viaja enquanto a janela está aberta: fora dela a chave nem existe, e a TV
   consulta no ritmo normal. */
export function posicaoPublica(d, agoraMs) {
  return {
    orientacao: orientacaoDe(d),
    rotacao: rotacaoDe(d),
    ...(emAjuste(d, agoraMs) ? { ajusteAte: new Date(d.tvAjusteAte).toISOString() } : {}),
  };
}
