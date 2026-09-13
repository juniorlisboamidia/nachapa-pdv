// Totem › Configurações do CANAL — módulo puro, testado em totemConfiguracao.test.js.
//
// Por que existe: o tempo de ociosidade deixou de ser constante no código e passou a
// ser decisão da loja. Dois lugares precisam dele — o PUT do admin, que grava, e o
// bootstrap público, que entrega ao tablet — e os dois têm de aplicar EXATAMENTE a
// mesma régua. Duas cópias divergem no dia em que alguém mexe numa só, e a divergência
// aparece como um totem que reinicia num tempo que a tela de configuração não mostra.
//
// A régua NÃO se repete no cliente. O quiosque recebe o número já normalizado e só se
// protege da AUSÊNCIA do campo (servidor antigo, bootstrap de cache) — o que ele nunca
// faz é decidir piso, teto ou arredondamento por conta própria.
//
// Sem `require` de Prisma nem de Express, sem relógio, sem lançar: entrada torta
// devolve o padrão. É o mesmo contrato de `totemCategoria.js` e `clientes/
// inadimplencia.js`.

/* O PADRÃO é o comportamento que já está em produção. Empresa que nunca abriu a tela de
   configuração tem de continuar exatamente como está — mudar este número muda o totem
   de todas elas de uma vez. */
export const OCIOSIDADE_PADRAO = 90;

/* O PISO existe por causa do aviso. O "Ainda está aí?" ocupa os 15 s finais; abaixo de
   30 s sobraria menos tempo de leitura do que de aviso, e o cliente veria "o seu pedido
   é apagado" antes de ter pedido qualquer coisa.

   O TETO existe pelo motivo oposto: um carrinho abandonado prende o totem para quem
   está atrás na fila. Dez minutos é o limite do que dá para chamar de "alguém ainda
   está usando". */
export const OCIOSIDADE_MIN = 30;
export const OCIOSIDADE_MAX = 600;

/* Os valores que a tela oferece. É atalho, não enumeração fechada: um número fora desta
   lista, dentro dos limites, continua valendo. O teto acima é maior que 300 de
   propósito — a lista é conselho, o limite é segurança. */
export const OCIOSIDADE_SUGERIDA = Object.freeze([30, 45, 60, 90, 120, 180, 300]);

/* Devolve SEMPRE um inteiro utilizável.

   Lixo (`null`, texto, `NaN`, objeto) cai no padrão, e nunca em zero: um relógio de
   ociosidade zerado apagaria o pedido no instante seguinte ao toque. Número fora da
   faixa é GRAMPEADO em vez de recusado — o valor vem de um select, e o que chega fora
   dos limites é engano ou requisição fabricada; nos dois casos o totem precisa
   continuar com um relógio sensato em vez de nenhum.

   Arredonda ANTES de grampear: 29,6 é intenção de 30, não de mínimo forçado. */
export function normalizarOciosidade(valor) {
  /* `Number('')` e `Number('   ')` dão 0, e `Number(true)` dá 1 — nenhum dos dois é
     alguém configurando meio minuto. Só texto e número entram na conta. */
  if (typeof valor !== 'number' && typeof valor !== 'string') return OCIOSIDADE_PADRAO;
  if (typeof valor === 'string' && valor.trim() === '') return OCIOSIDADE_PADRAO;
  const n = Number(valor);
  if (!Number.isFinite(n)) return OCIOSIDADE_PADRAO;
  const inteiro = Math.round(n);
  if (inteiro < OCIOSIDADE_MIN) return OCIOSIDADE_MIN;
  if (inteiro > OCIOSIDADE_MAX) return OCIOSIDADE_MAX;
  return inteiro;
}

/* A linha do banco (ou a sua ausência) virando o que sai na resposta.

   Empresa SEM linha não é erro: `TotemConfiguracao` é agregado do canal, e enquanto
   ninguém salvou nada o servidor responde os padrões. Normaliza na SAÍDA também — uma
   linha gravada antes de um limite mudar, ou escrita à mão no banco, não pode escapar
   da régua só porque já está salva.

   Devolve só o que o totem precisa. Isto vai para o bootstrap PÚBLICO, que qualquer
   tablet pareado lê: id, empresaId e datas não têm o que fazer ali. */
export function configuracaoParaJson(linha) {
  return { ociosidadeSegundos: normalizarOciosidade(linha?.ociosidadeSegundos) };
}
