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

/* O PISO: abaixo disto a fila deixa de ser acompanhável. 5 s (o mínimo do board) com seis
   produtos daria 833 ms por passo — a fila vira um piscar. Quando o tempo não dá, o ciclo
   NÃO fecha: os últimos não chegam ao centro, o que é preferível a uma fileira que ninguém
   acompanha. Mora aqui, com a aritmética, porque três lugares dependem do mesmo número — o
   renderer para andar, o editor e a playlist para avisar. Dois pisos diferentes fariam a
   tela de gestão prometer seis produtos e a parede mostrar quatro. */
export const MS_MINIMO_SLIDE = 1600;

/* O tempo em que um produto é LIDO, e não apenas visto.

   O piso acima é outra coisa: é o limite do acompanhável. Este aqui é o conforto — o tempo
   em que quem está na fila do balcão termina de ler o nome, olhar a foto e registrar o
   preço sem pressa. Entre os dois há uma faixa larga que funciona; as telas de gestão usam
   este número para sugerir, nunca para impor.

   Já foi 3,5s. Subiu para 5s por decisão de quem olha a parede: no editor, com a tela a um
   palmo, 3,5s parecem folgados; de longe, com foto, nome e preço para absorver de uma vez,
   o produto sai de cena antes de a conta estar feita. Mexer aqui NÃO muda board nenhum que
   já existe — muda o número que os avisos sugerem daqui em diante. */
export const MS_CONFORTO = 5000;

/* Quanto o board precisa durar para dar `MS_CONFORTO` a cada produto.

   Arredonda para CIMA: sobrar meio segundo é melhor que faltar. E respeita os limites do
   board — com muitos produtos a conta estoura o teto, e aí o que dá para fazer é usar o
   teto, que é o que esta função devolve em vez de um número que a rota recusaria. */
export function duracaoConfortavel(n, { min = 5, max = 120 } = {}) {
  const qtd = Number.isFinite(n) && n > 0 ? n : 1;
  const ideal = Math.ceil((qtd * MS_CONFORTO) / 1000);
  return Math.min(max, Math.max(min, ideal));
}

/* O RITMO de um carrossel: o que a duração escolhida faz com os produtos.

   No Carrossel o tempo na tela deixa de ser só "quanto dura" e passa a decidir QUANTOS
   produtos aparecem — ele é dividido entre eles. Sem esta conta à vista, o gestor põe dez
   produtos em oito segundos e descobre pela parede, se descobrir, que metade nunca entrou.

   Uma conta só, usada em dois lugares: o editor do board (onde a duração nasce) e a
   playlist (onde o item pode sobrescrevê-la). Duas cópias divergiriam, e aí as duas telas
   dariam respostas diferentes sobre a MESMA parede.

   `null` quando não há o que dizer: menos de dois produtos, ou duração ainda inválida
   enquanto o gestor digita. */
export function ritmoDoCarrossel(n, duracaoSegundos, { piso = MS_MINIMO_SLIDE, min = 5, max = 120 } = {}) {
  const qtd = Math.trunc(Number(n));
  const duracao = Number(duracaoSegundos);
  if (!Number.isFinite(qtd) || qtd < 2) return null;
  if (!Number.isFinite(duracao) || duracao <= 0) return null;
  const msPorSlide = (duracao * 1000) / qtd;
  const confortavel = duracaoConfortavel(qtd, { min, max });
  const apertado = msPorSlide < piso;
  return {
    n: qtd,
    duracao,
    msPorSlide,
    confortavel,
    apertado,
    // Quantos cabem quando o tempo não dá para todos. Fora desse caso são todos.
    cabem: apertado ? Math.max(1, Math.floor((duracao * 1000) / piso)) : qtd,
    /* A sugestão só aparece quando muda alguma coisa: com a duração já no ponto, um botão
       que não faz nada é ruído. E ela é sempre um BOTÃO, nunca um ajuste automático — quem
       calibrou a duração à mão não pode vê-la mudar sozinha porque trocou um produto. */
    sugerir: confortavel !== duracao && msPorSlide < MS_CONFORTO,
  };
}

/* Meio segundo importa aqui, e o Brasil escreve com vírgula. Uma casa decimal: "1,6s" é
   preciso o bastante para decidir, e "1,63s" é ruído. */
export function segundosCurtos(ms) {
  // ⚠️ `typeof`, e não `Number(ms)`: nulo viraria 0 e a tela diria "cada produto fica 0,0s
  // no ar" — uma frase que parece medida e não é. É a mesma armadilha que já mordeu a
  // duração do item e a rotação da TV.
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '0';
  return (ms / 1000).toFixed(1).replace('.', ',');
}
