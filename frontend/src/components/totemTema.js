// Totem › o adaptador DOMÍNIO → CSS — módulo puro, testado em totemTema.test.js.
//
// Este arquivo é a ÚNICA ponte entre as chaves que o banco guarda (`fundo`, `cartao`…) e
// os nomes de custom property que a folha usa (`--ds-fundo`, `--tq-superficie`…). É de
// propósito que ele seja só um: no dia em que a folha renomear um token, muda aqui e
// nenhuma loja precisa reconfigurar nada. O banco nunca soube o nome de CSS.
//
// ── COMO O VALOR CHEGA NO NAVEGADOR ───────────────────────────────────────────────────
// Por `element.style.setProperty(prop, valor)`, e por mais nada. Nunca uma `<style>`
// montada com string, nunca `dangerouslySetInnerHTML`. A consequência prática: não existe
// escape a fazer, porque não existe texto sendo interpretado como CSS. Uma chave fora do
// mapa não tem para onde ir, e um valor que não é hexadecimal não passa da validação.
//
// ── O CHÃO CONTINUA SENDO A FOLHA ─────────────────────────────────────────────────────
// Aparência ausente, vazia ou corrompida não escreve nada, e o quiosque desenha com os
// valores embarcados no `totem.css`. É por isso que uma instalação sem configuração fica
// idêntica ao que sempre foi, e é por isso que o totem abre com a rede caindo.

/* As seis chaves são declaradas aqui, e não importadas do backend: o quiosque não pode
   depender de um módulo do servidor, e repetir seis strings custa menos do que esse
   acoplamento. O contrato entre os dois é o JSON do bootstrap, e chave que o servidor
   mandar e este mapa não conhecer simplesmente não vira CSS. */

/* Domínio → custom property. Seis entradas, e nenhuma a mais.

   Duas escolhas que não são óbvias:

   · `cartao` aponta para `--tq-superficie`, e NÃO para `--ds-cartao`. O `surface.card` da
     marca (#251a07) é um marrom dessaturado que, ao lado do preto e sob foto de comida,
     lê como sujeira — a spec §5.2 registra o desvio. Quem desenha o cartão no quiosque é
     `--tq-superficie`, então é ele que a loja configura.

   · `fundo` aponta para `--tq-fundo` pelo mesmo motivo, e a partir da frente dos dois
     fundos. `--ds-fundo` guarda o #000 da marca e continua lá como registro; o chão do
     quiosque saiu do preto puro (#0f0e0d) porque com #000 embaixo e o cartão 1,2% mais
     claro em cima quem separava um do outro era a FOTOGRAFIA, não a interface — e no
     fundo claro ele é papel. Quem desenha o chão é `--tq-fundo`, então é ele que a loja
     configura, e `--tq-preto` continua sendo apelido dele.

   · As outras quatro apontam para tokens `--ds-*` porque os papéis do quiosque
     (`--tq-branco`, `--tq-amarelo`, `--tq-tinta`, `--tq-texto-2`) já são `var()` deles.
     Escrever no `--ds-*` propaga para todos os papéis de uma vez; escrever em cada papel
     deixaria um esquecido. */
export const PROPRIEDADES = Object.freeze({
  fundo: '--tq-fundo',
  cartao: '--tq-superficie',
  texto: '--ds-texto',
  textoApoio: '--ds-texto-apoio',
  acaoFundo: '--ds-botao-fundo',
  acaoTexto: '--ds-botao-texto',
})

const HEX = /^#[0-9a-f]{6}$/

/* Os pares `[propriedade, valor]` a escrever, a partir do que veio no bootstrap.

   Filtra duas vezes, e as duas importam: a chave tem de estar no mapa (nada de
   `--ds-qualquer-coisa` vindo do servidor) e o valor tem de ser um hexadecimal canônico
   de seis dígitos. O servidor já normaliza, mas este é o último portão antes do CSSOM —
   e o último portão não confia no anterior.

   Entrada torta devolve lista vazia, e a folha continua mandando. */
export function propriedadesDe(tokens) {
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) return []
  const fora = []
  for (const chave of Object.keys(PROPRIEDADES)) {
    const valor = tokens[chave]
    if (typeof valor !== 'string') continue
    const v = valor.trim().toLowerCase()
    if (!HEX.test(v)) continue
    fora.push([PROPRIEDADES[chave], v])
  }
  return fora
}

/* Qual FUNDO o quiosque desenha.

   O fundo não é uma sétima cor: é a RELAÇÃO entre as seis — quem é mais claro que quem,
   onde entra fio, o que o dourado significa. Por isso ele não passa pelo mapa de
   propriedades acima; ele vira um ATRIBUTO na raiz, e quem sabe o que fazer com ele é a
   folha, num bloco só. Escrever a escada inteira por CSSOM seria mover para o JavaScript
   uma decisão que é de desenho.

   Minúsculo aqui porque é valor de atributo HTML, no mesmo formato de
   `data-posicao-categorias`. O servidor fala 'PADRAO'/'CLARO'; a conversão é uma linha e
   mora neste lado, que é o lado que escreve o atributo.

   Valor desconhecido cai no padrão. É a mesma tolerância do resto: bootstrap velho, chave
   nova que o servidor ainda não manda ou dado torto no banco não podem deixar a tela sem
   fundo — eles caem no carvão e a loja continua vendendo. */
export const FUNDOS = Object.freeze(['padrao', 'claro'])
export const FUNDO_PADRAO = 'padrao'

export function fundoDoTotem(aparencia) {
  const v = typeof aparencia?.layoutFundo === 'string' ? aparencia.layoutFundo.toLowerCase() : ''
  return FUNDOS.includes(v) ? v : FUNDO_PADRAO
}

/* Qual logo o quiosque mostra.

   A ordem é a regra da frente inteira: o CANAL vence o HUB. A logo do Cardápio Web é
   desenhada para o cardápio digital, de fundo claro — no vidro preto do totem ela vira
   uma placa branca. Quando a loja subir uma logo própria, é ela que manda.

   `logoVersao` entra na URL para o cache do tablet cair sozinho quando a imagem trocar. */
export function logoDoTotem({ aparencia, loja } = {}) {
  if (aparencia?.temLogoPersonalizada) {
    const v = Number.isInteger(aparencia.logoVersao) ? aparencia.logoVersao : 0
    // `propria` é o que decide a APRESENTAÇÃO, e por isso sai daqui e não da tela: a logo
    // do canal foi preparada com transparência para o fundo escuro do totem, e a do
    // Cardápio Web vem com fundo branco embutido (é feita para o cardápio digital). A
    // primeira aparece direto sobre o preto; a segunda vira placa, senão fica um retângulo
    // branco irregular colado na tela.
    return { url: `/api/public/aparelho/totem/logo?v=${v}`, propria: true }
  }
  return { url: loja?.logo || loja?.logoDataUrl || null, propria: false }
}

/* Só a URL. Mantida porque é o que a maior parte do código pede, e implementada sobre a
   função acima para as duas nunca discordarem sobre qual logo está valendo. */
export function urlDaLogo(entrada) {
  return logoDoTotem(entrada).url
}

/* Posição das categorias que a raiz vai anunciar. Só as duas conhecidas; qualquer outra
   coisa é `esquerda`, que é o desenho de sempre. */
export function posicaoDeCategorias(aparencia) {
  return aparencia?.posicaoCategorias === 'direita' ? 'direita' : 'esquerda'
}

/* ── Contraste, para a PRÉVIA da tela de configuração ────────────────────────────────
   A régua oficial é a do backend (`backend/totemAparencia.js`), e é ela que responde no
   GET e no PUT. Esta cópia existe por um motivo só: a prévia precisa recalcular a cada
   toque no seletor de cor, e não dá para ir ao servidor a cada pixel arrastado.

   Duplicar fórmula é dívida, então ela vem com fiador: `totemTema.test.js` importa as DUAS
   implementações e compara os números numa tabela. Se uma mudar sem a outra, o teste cai. */
export const AA_NORMAL = 4.5
export const AA_GRANDE = 3

const canal = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/* Razão de contraste entre duas cores hex. Cor inválida devolve `null` — nunca um número
   inventado, que passaria no teste da tela sem passar na vida real. */
export function razaoDeContraste(a, b) {
  const na = normalizarHex(a)
  const nb = normalizarHex(b)
  if (!na || !nb) return null
  const lum = (h) => 0.2126 * canal(parseInt(h.slice(1, 3), 16))
    + 0.7152 * canal(parseInt(h.slice(3, 5), 16))
    + 0.0722 * canal(parseInt(h.slice(5, 7), 16))
  const la = lum(na)
  const lb = lum(nb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/* Aceita a forma curta aqui (o seletor de cor do navegador devolve seis dígitos, mas um
   valor colado à mão pode vir com três). */
export function normalizarHex(valor) {
  if (typeof valor !== 'string') return null
  const t = valor.trim().toLowerCase()
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(t)) return null
  const h = t.slice(1)
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`
}
