// A aritmética da fila do Carrossel. Módulo puro porque é aqui que os erros moram: índice
// circular, resto negativo e divisão de tempo são três contas curtas que já derrubaram a
// parede uma vez, e nenhuma delas dá para testar de dentro do componente.

/* Qual produto está em cena, dado o passo da pista.

   ⚠️ `passo % n` sozinho NÃO serve: em JavaScript o resto de um negativo é negativo
   (-1 % 10 === -1), e `itens[-1]` é `undefined`. Um `undefined` aqui derruba a árvore
   inteira no primeiro acesso a `.nome` — na TV isso é a parede ficar branca e travada
   até alguém ir à loja recarregar o navegador. A dobra a mais fecha essa porta. */
export function indiceEmCena(passo, n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const p = Number.isFinite(passo) ? Math.trunc(passo) : 0;
  return ((p % n) + n) % n;
}

/* A pista recua quando chega à posição GÊMEA — aquela que mostra exatamente o mesmo que a
   posição inicial, porque a lista é desenhada três vezes. É o que torna a volta invisível:
   o recuo acontece sem transição e nada na tela muda. */
export function precisaRecuar(passo, n) {
  if (!Number.isFinite(n) || n <= 0) return false;
  return Number.isFinite(passo) && passo >= n;
}

/* Quanto tempo cada produto fica em cena.

   O board sai do ar depois de `duracaoSegundos`, então o tempo é dividido entre os
   produtos: cada um passa pelo centro uma vez e o ciclo fecha junto com o board. Abaixo do
   piso ninguém lê de longe — aí o ciclo não fecha, e os últimos não chegam ao centro. É a
   troca certa: uma fila legível incompleta vale mais que uma completa ilegível, e o editor
   avisa o gestor antes. */
export function msPorPasso(duracaoSegundos, n, piso) {
  const d = Number(duracaoSegundos);
  const total = Number.isFinite(d) && d > 0 ? d : 20;
  const qtd = Number.isFinite(n) && n > 0 ? n : 1;
  return Math.max(piso, Math.round((total * 1000) / qtd));
}
