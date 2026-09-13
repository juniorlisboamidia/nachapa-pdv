// Totem › a máquina de estados da SESSÃO — módulo puro, testado em totemSessao.test.js.
//
// O quiosque tinha um estado só para duas coisas diferentes. `inicio` era ao mesmo tempo o
// repouso — a tela que fica horas no vidro chamando quem passa — e a escolha "comer aqui /
// levar". Enquanto foram a mesma tela, "não tem sessão" e "está no início" eram sinônimos,
// e o código comparava `tela === 'inicio'` querendo dizer a primeira coisa.
//
// Separados:
//
//   espera  → repouso. Não há sessão, não há carrinho, não há relógio correndo. A tela
//             pode ficar horas aqui, com a loja aberta ou fechada.
//   inicio  → o cliente TOCOU. Já é sessão, mesmo sem ter escolhido o modo ainda — e por
//             isso o relógio de ociosidade já vale aqui. Quem tocou e foi embora não pode
//             deixar o totem parado na escolha para sempre.
//
// A pergunta "existe sessão?" passa a ter um dono. Espalhar `tela === 'espera'` pelo
// orquestrador recriaria o problema no formato novo: a próxima tela de repouso (uma
// proteção de tela, um modo noturno) teria de ser lembrada em cada comparação.

export const TELA_REPOUSO = 'espera';

/* Repouso: sem sessão, sem relógio. Hoje é uma tela só, e é justamente por isso que a
   pergunta mora aqui — no dia em que forem duas, muda um lugar. */
export function emRepouso(tela) {
  return tela === TELA_REPOUSO;
}

/* Existe sessão de cliente em andamento? Tela desconhecida ou ausente conta como repouso:
   é o estado seguro, o que NÃO arma relógio nenhum. */
export function temSessao(tela) {
  return typeof tela === 'string' && tela !== '' && !emRepouso(tela);
}

/* O relógio de reset é armado?

   As duas guardas de estado são as de sempre e não mudaram de sentido: `enviando` e
   `travado` (confirmação em dúvida) impedem o reset porque ele zera a chave de
   idempotência — e zerar a chave de um pedido que talvez exista é como se cria o segundo.

   O que mudou é a primeira condição: era "não está no início", virou "existe sessão". */
export function armaReset({ tela, enviando = false, travado = false } = {}) {
  return temSessao(tela) && !enviando && !travado;
}

/* O aviso "Ainda está aí?" é armado?

   Tudo que barra o reset barra o aviso — não faria sentido avisar sobre um reset que não
   vem. E há uma exclusão a mais: a tela de RESULTADO. Ali o relógio continua correndo (é
   assim que o totem volta ao repouso depois do pedido), mas cobrir o número do pedido com
   "o seu pedido é apagado" seria mentir para quem está justamente anotando esse número. */
export function armaAviso({ tela, enviando = false, travado = false } = {}) {
  return armaReset({ tela, enviando, travado }) && tela !== 'resultado';
}
