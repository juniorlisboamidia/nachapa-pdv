// Totem › Aparência — as abas da tela, em módulo puro (testado em totemAparencia.test.js).
//
// Por que isto não é uma constante dentro da página: a aba vem da URL
// (`/totem/aparencia/:aba`), e URL é entrada do mundo externo — alguém digita, um link
// antigo aponta para uma aba que deixou de existir, o navegador restaura uma sessão. Uma
// tela que confia no parâmetro renderiza vazio e não diz por quê.
//
// A Aparência é FOLHA da sidebar e resolve a profundidade extra aqui dentro. A Sidebar
// desenha três níveis, e aprofundar o menu inteiro para servir um caso só sairia caro em
// toda a aplicação — a decisão está no plano da Loja Digital, e as abas são a outra
// metade dela.

export const ABAS = Object.freeze([
  Object.freeze({ id: 'personalizacao', label: 'Personalização' }),
  Object.freeze({ id: 'banners', label: 'Banners' }),
]);

/* A PRIMEIRA aba é o padrão, e isso é contrato com duas outras peças: a rota
   `/totem/aparencia` redireciona para ela, e a folha da sidebar aponta para a raiz da
   seção. Reordenar a lista muda o destino das duas — há teste guardando. */
export const ABA_PADRAO = ABAS[0].id;

/* Parâmetro da URL → id de aba que existe. Nunca devolve `undefined`: a página sempre tem
   o que renderizar, e um endereço torto cai na primeira aba em vez de numa tela branca.

   Aceita a diferença de caixa e o espaço em volta porque isso é URL digitada à mão, não
   dado de banco: "/Banners" é a mesma intenção que "/banners". */
export function abaValida(param) {
  if (typeof param !== 'string') return ABA_PADRAO;
  const alvo = param.trim().toLowerCase();
  return ABAS.some((a) => a.id === alvo) ? alvo : ABA_PADRAO;
}

/* Endereço canônico de uma aba. Existe para que nenhum lugar monte a string à mão e
   escreva uma rota que não existe. */
export function rotaDaAba(id) {
  return `/totem/aparencia/${abaValida(id)}`;
}
