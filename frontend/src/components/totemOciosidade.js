// Totem › o relógio de ociosidade da SESSÃO — módulo puro, testado em
// totemOciosidade.test.js.
//
// O tempo deixou de ser constante no código e passou a ser decisão da loja, entregue no
// bootstrap. Este módulo faz duas coisas e nenhuma delas envolve `setTimeout`: converte a
// configuração em milissegundos e guarda o valor CAPTURADO enquanto uma sessão corre.
//
// A CAPTURA é a razão de existir daqui. O bootstrap se refaz sozinho a cada 5 min, em
// segundo plano. Sem captura, um cliente que estivesse montando o pedido no momento em que
// a loja trocasse 300 s por 30 s veria o relógio dele encurtar no meio da escolha — e o
// pedido sumiria antes do tempo que a tela prometia quando ele começou. A sessão fica com
// o número que valia quando ela começou; a próxima sessão pega o mais novo.
//
// A RÉGUA NÃO MORA AQUI. Piso, teto e arredondamento são do backend
// (`backend/totemConfiguracao.js`), e o número chega normalizado. O que existe aqui é
// defesa contra AUSÊNCIA e contra valor impossível — servidor antigo, bootstrap de cache,
// resposta truncada. Repetir a faixa 30–600 no cliente criaria a segunda fonte de verdade
// que o backend existe para evitar.

/* O padrão é o comportamento que sempre esteve em produção. É para onde tudo cai quando o
   campo não vem. */
export const MS_OCIOSIDADE_PADRAO = 90_000;

/* O "Ainda está aí?" ocupa os 15 s FINAIS do tempo total — não é um relógio à parte. */
export const MS_AVISO_INATIVIDADE = 15_000;

/* Prazo da confirmação em DÚVIDA, e ele NÃO é o relógio de ociosidade.
   Não mede cliente parado: mede quanto tempo o totem espera antes de mandar alguém ao
   balcão com um pedido que talvez exista. A loja configura a ociosidade; isto não. Baixar
   a ociosidade para 30 s despacharia o cliente antes de a confirmação chegar. */
export const MS_AMBIGUO = 90_000;

/* `{ ociosidadeSegundos }` do bootstrap → milissegundos.

   A conversão para ms acontece SÓ aqui: o backend fala em segundos porque é o que a loja
   escolhe na tela, e o quiosque fala em ms porque é o que `setTimeout` recebe. Misturar as
   duas unidades no mesmo arquivo é como nasce um relógio mil vezes mais longo do que
   deveria.

   Ausente, não-numérico ou impossível (≤ 0) cai no padrão. Note o que NÃO se faz: não há
   piso de 30 nem teto de 600 — um valor fora da faixa que tenha vindo do servidor é
   problema do servidor, e o cliente obedecer é o que mantém uma fonte de verdade só. */
export function msDeOciosidade(configuracao) {
  const bruto = configuracao?.ociosidadeSegundos;
  if (typeof bruto !== 'number' && typeof bruto !== 'string') return MS_OCIOSIDADE_PADRAO;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return MS_OCIOSIDADE_PADRAO;
  return Math.round(n * 1000);
}

/* Quando o aviso entra, dado o total da sessão: os 15 s finais.

   O `Math.max(0, …)` não é a régua de volta pela porta dos fundos — é aritmética. Um total
   menor que 15 s daria um atraso negativo, e `setTimeout` com número negativo dispara na
   hora: o aviso nasceria junto com a sessão, dizendo "o seu pedido é apagado" a quem ainda
   não pediu nada. */
export function msDoAviso(msTotal) {
  const total = Number(msTotal);
  if (!Number.isFinite(total) || total <= 0) return Math.max(0, MS_OCIOSIDADE_PADRAO - MS_AVISO_INATIVIDADE);
  return Math.max(0, total - MS_AVISO_INATIVIDADE);
}

/* O valor capturado pela sessão corrente.

   Fora de qualquer sessão (`atual()` sem `iniciar()`) devolve o padrão em vez de `null`:
   nenhum caminho deste código pode entregar "sem relógio" a quem for agendar um reset.

   É um fechamento e não um `useRef` porque assim se testa a regra inteira — captura,
   estabilidade durante a sessão, e a sessão seguinte pegando o valor novo — sem montar
   React nem esperar cinco minutos por um refresh de bootstrap. */
export function criarRelogioSessao(padrao = MS_OCIOSIDADE_PADRAO) {
  let capturado = null;
  return {
    // Começo da sessão (hoje, a escolha do modo; com a Tela de espera, `espera → inicio`).
    iniciar(configuracao) {
      capturado = msDeOciosidade(configuracao);
      return capturado;
    },
    // O que os dois relógios da sessão devem usar. Imune ao bootstrap que se refez.
    atual() {
      return capturado ?? padrao;
    },
    // `reiniciar()`: a sessão acabou e o totem voltou ao repouso.
    encerrar() {
      capturado = null;
    },
    // Só para leitura em teste e depuração: há sessão com valor capturado?
    ativo() {
      return capturado !== null;
    },
  };
}
