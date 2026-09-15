// O VIGIA de reprodução — módulo puro. Decide se um vídeo está TRAVADO.
//
// ── POR QUE ELE EXISTE ────────────────────────────────────────────────────────────────
// `ended` é o sinal de "acabou", mas não existe sinal de "não vai acabar". Um arquivo ruim
// ou uma rede que caiu deixam a TV em buffering para sempre, sem erro nenhum e sem evento
// nenhum. Numa parede ligada o dia inteiro, isso é um retângulo preto até alguém ir lá.
//
// ── A RÉGUA, E O ERRO QUE ELA JÁ COMETEU ──────────────────────────────────────────────
// O que separa "vídeo longo funcionando" de "vídeo travado" é o `currentTime` ANDAR. A
// primeira versão disto media `t > anterior`, ou seja, exigia tempo estritamente crescente —
// e derrubou um vídeo em loop em produção: ao dar a volta, o `currentTime` volta a zero, que
// é MENOR que o anterior. Num vídeo de 17 s, o tempo nunca mais ultrapassava o máximo já
// visto, o vigia concluía "parado" e matava a reprodução no meio da segunda passagem.
//
// A régua correta é MUDANÇA, não crescimento: um vídeo travado tem tempo CONSTANTE. Voltar
// a zero (loop) ou pular (seek) são movimento, e movimento é vida.
//
// Está num módulo puro, e não dentro do componente, exatamente porque essa distinção é
// sutil o bastante para errar duas vezes — e aqui ela tem teste.

// 12 s sem o tempo mudar. Conservador de propósito: um buffer inicial em rede ruim leva
// vários segundos, e derrubar um vídeo que ia tocar é pior do que demorar a desistir de um
// que não ia.
export const MS_STALL = 12_000
// De quanto em quanto se olha. 2 s é barato e dá seis amostras dentro da janela.
export const MS_VIGIA = 2_000
// Abaixo disto é ruído de ponto flutuante do próprio elemento, não reprodução.
const TOLERANCIA = 0.05

/* O estado inicial do vigia. `em` é o instante em que ele começou a contar — e é por isso
   que ele nasce do relógio de quem chama, nunca de um `Date.now()` escondido aqui. */
export const inicio = (agora) => ({ t: 0, em: agora })

/* Uma amostra. Devolve o estado novo e o veredito.

   `travado: true` significa "esta mídia não vai sair do lugar" — quem recebe marca a falha e
   avança. Nunca significa "a rede está lenta": rebuffer normal muda o tempo entre amostras. */
export function avaliar(estado, { t, agora, ended = false, msStall = MS_STALL } = {}) {
  const anterior = estado ?? inicio(agora)
  // Tempo que o elemento não sabe informar (ainda sem metadata) não é prova de nada: não
  // conta como progresso, mas também não reinicia o relógio.
  if (!Number.isFinite(t)) return { estado: anterior, travado: false }
  // MUDOU — para frente, para trás no loop, ou num seek. Tudo isso é movimento.
  if (Math.abs(t - anterior.t) > TOLERANCIA) return { estado: { t, em: agora }, travado: false }
  // Acabou: parar é o correto. Quem cuida do fim é o evento `ended`, não o vigia.
  if (ended) return { estado: anterior, travado: false }
  return { estado: anterior, travado: agora - anterior.em > msStall }
}
