// Totem › o estado do CANAL vindo do bootstrap — módulo puro, testado em totemLoja.test.js.
//
// Existe para separar dois estados que estavam misturados na mesma condição e que não têm
// nada a ver um com o outro:
//
//  · LOJA FECHADA (`operacional.abertaAgora === false`) — horário. A loja abre de novo
//    daqui a pouco. O cliente pode olhar o cardápio inteiro, montar o pedido e só não
//    fecha a compra. É exatamente o que o Cardápio Web faz, e é o que a pessoa em pé na
//    frente do totem espera: ninguém entende uma tela preta dizendo "volte amanhã" quando
//    a vitrine da loja está acesa ao lado.
//
//  · SEM MODO DISPONÍVEL (`orderTypes` vazio) — o canal não tem nem "comer aqui" nem
//    "levar" habilitado. Aqui não há o que navegar: o fluxo COMEÇA escolhendo o modo, e
//    sem nenhum o cliente não sai do lugar. Este continua barrando na entrada.
//
// A separação importa porque as consequências são opostas. Tratar as duas como "fechado"
// escondia o cardápio inteiro por causa do relógio; tratar as duas como "navegável"
// deixaria o cliente num beco sem saída.
//
// ── ISTO É UX, NÃO AUTORIDADE ────────────────────────────────────────────────────────
// A decisão comercial continua sendo do HUB/CW, que recusam com LOJA_FECHADA na cotação e
// na confirmação. Este módulo evita que o cliente ande até o pagamento para levar um não
// no fim — e é tudo que ele faz. A loja pode fechar entre o bootstrap e a confirmação, e
// nesse caso quem diz não é o servidor, com a razão certa. Nada aqui substitui essa
// validação, e afrouxá-la porque "a tela já cuida" seria trocar uma guarda de verdade por
// uma de aparência.

export const ROTULO_AVANCAR = 'Ir para o pagamento';
export const ROTULO_FECHADO = 'Estabelecimento fechado';

/* O bootstrap → o que o canal permite agora.

   `abertaAgora === false` é comparação ESTRITA de propósito: campo ausente, `null` ou
   bootstrap antigo não podem ser lidos como loja fechada. Na dúvida o totem segue
   funcionando e deixa o servidor recusar — o contrário travaria a venda de uma loja
   aberta por causa de um campo que não veio. */
export function estadoDoCanal(boot) {
  const fechada = boot?.operacional?.abertaAgora === false;
  const modos = Array.isArray(boot?.orderTypes) ? boot.orderTypes : [];
  const semModo = modos.length === 0;
  return {
    fechada,
    semModo,
    // Só a ausência de modo barra na entrada. Loja fechada, não.
    bloquearEntrada: semModo,
    // Cardápio, detalhe do produto e carrinho seguem abertos com a loja fechada.
    podeNavegar: !semModo,
    podeMontarCarrinho: !semModo,
    // A única porta que fecha.
    podeIrAoPagamento: !fechada && !semModo,
  };
}

/* O que a ação do rodapé do carrinho diz e se ela responde.

   O rótulo TROCA em vez de aparecer um aviso ao lado: o espaço é o mesmo, o layout não
   muda, e a razão de não poder avançar está escrita exatamente onde o dedo ia tocar.

   `habilitado` é aparência. A recusa de verdade tem de estar no callback também — uma
   regressão de markup ou de CSS não pode reabrir o caminho. É o que `podeAvancar` abaixo
   serve para checar do outro lado. */
export function acaoDoCarrinho({ fechada = false, qtdLinhas = 0 } = {}) {
  const vazio = Number(qtdLinhas) <= 0;
  return {
    rotulo: fechada ? ROTULO_FECHADO : ROTULO_AVANCAR,
    habilitado: !fechada && !vazio,
    fechada: !!fechada,
  };
}

/* A guarda do callback: a transição carrinho → pagamento acontece? */
export function podeAvancar({ fechada = false, qtdLinhas = 0 } = {}) {
  return !fechada && Number(qtdLinhas) > 0;
}
