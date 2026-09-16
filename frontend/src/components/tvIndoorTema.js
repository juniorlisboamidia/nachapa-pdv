// TV Indoor › o adaptador DOMÍNIO → CSS — módulo puro, testado em tvIndoorTema.test.js.
//
// A ÚNICA ponte entre as chaves que o banco guarda (`fundo`, `destaque`…) e os nomes de
// custom property que as folhas da TV usam. É de propósito que seja só uma: no dia em que a
// folha renomear um token, muda aqui e nenhuma loja precisa reconfigurar nada. O banco nunca
// soube o nome de CSS.
//
// ── A ALLOWLIST ──────────────────────────────────────────────────────────────────────
// Seis entradas, e nenhuma a mais. Chave que o servidor mandar e este mapa não conhecer
// simplesmente não vira CSS — não há caminho por onde um nome vindo do banco chegue ao
// `setProperty`. O valor passa por hexadecimal canônico no último portão (`temaCssom`), que
// não confia no servidor.
//
// ── INDEPENDÊNCIA ────────────────────────────────────────────────────────────────────
// As seis chaves são declaradas aqui, e não importadas do backend: o aparelho não pode
// depender de um módulo do servidor, e repetir seis strings custa menos do que esse
// acoplamento. O contrato entre os dois é o JSON da programação.
//
// Nada aqui conhece o totem: nenhum `--tq-*`, nenhum `--ds-*`, nenhum import de
// `totemTema.js`. Os canais dividem a técnica (`lib/temaCssom.js`), não a identidade.
import { aplicarTema, comAlpha, propriedadesDe } from '../lib/temaCssom.js'

export { comAlpha }

/* Domínio → custom property. As folhas são `tvMenuBoard.css` (o board) e `tv.css` (a casca
   e o institucional); as duas leem os mesmos nomes `--tvmb-*`, e é por isso que uma paleta
   só pinta as quatro telas do canal. */
export const PROPRIEDADES = Object.freeze({
  fundo: '--tvmb-fundo',
  superficie: '--tvmb-superficie',
  texto: '--tvmb-texto',
  textoApoio: '--tvmb-texto-2',
  destaque: '--tvmb-destaque',
  textoDestaque: '--tvmb-texto-destaque',
})

export const CHAVES = Object.freeze(Object.keys(PROPRIEDADES))

/* Os DEFAULTS, espelho de `backend/tvIndoorAparencia.js` e de `styles/tvMenuBoard.css`.

   Existem aqui para a PRÉVIA do admin poder desenhar antes de a API responder e para o
   player ter chão se a programação vier sem o bloco de aparência. Os três lugares têm de
   concordar, e há teste para isso — mudar um sem os outros faz a tela de configuração
   mentir sobre o que a loja está vendo. */
export const PADROES = Object.freeze({
  fundo: '#0b0a09',
  // O card. Dois degraus acima do fundo: o bastante para o olho agrupar mídia, nome e preço
  // numa unidade, sem virar painel administrativo. Ver `backend/tvIndoorAparencia.js`.
  superficie: '#17130d',
  texto: '#ffffff',
  textoApoio: '#b8b8b8',
  destaque: '#d79e00',
  textoDestaque: '#000000',
})

/* A DIVISÓRIA da lista do menu board.

   É uma cor derivada, não um sétimo campo: ela é o texto rebaixado a 14%. Precisa existir
   porque a divisória fixa (branco a 14%) some num fundo claro — e uma lista de preços sem
   linha separando os itens é exatamente o que o layout LISTA existe para dar.

   O nome da propriedade é FIXO no código; o que vem do banco é só a chave `texto`, com um
   hex validado. Nada arbitrário atravessa. */
export const PROP_DIVISORIA = '--tvmb-linha'
export const ALPHA_DIVISORIA = 0.14

/* A SUPERFÍCIE ELEVADA — o chão atrás de uma foto que não veio, e o realce do card
   protagonista. Derivada pelo mesmo mecanismo da divisória, e pela mesma razão: uma cor
   fixa funcionaria numa paleta e sumiria na outra. Como é o texto rebaixado a 7%, ela é
   clara sobre fundo escuro e escura sobre fundo claro, sozinha.

   NÃO é um sétimo campo configurável: a loja escolhe seis cores, e esta sai delas. */
export const PROP_ELEVADA = '--tvmb-superficie-2'
export const ALPHA_ELEVADA = 0.07

/* Os extras derivados de um conjunto de tokens. Hoje é um; a lista existe para o próximo
   não virar um `if` solto no meio do componente. */
export function derivados(tokens) {
  const texto = tokens?.texto ?? PADROES.texto
  const linha = comAlpha(texto, ALPHA_DIVISORIA)
  const elevada = comAlpha(texto, ALPHA_ELEVADA)
  return [
    ...(linha ? [[PROP_DIVISORIA, linha]] : []),
    ...(elevada ? [[PROP_ELEVADA, elevada]] : []),
  ]
}

/* As cores EFETIVAS a partir do que veio do servidor: padrão com os overrides por cima.

   O player recebe os tokens JÁ EFETIVOS (o servidor os resolve), mas esta função existe
   para dois casos reais: a prévia do admin, que monta a paleta enquanto o gestor mexe nos
   seletores, e uma programação de versão anterior, que chega sem o bloco de aparência. */
export function efetivas(tokens) {
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) return { ...PADROES }
  const fora = { ...PADROES }
  for (const chave of CHAVES) {
    const v = typeof tokens[chave] === 'string' ? tokens[chave].trim().toLowerCase() : null
    if (v && /^#[0-9a-f]{6}$/.test(v)) fora[chave] = v
  }
  return fora
}

/* Escreve a paleta num nó. É o único caminho — `setProperty`, nunca `<style>` com string. */
export function aplicar(el, tokens) {
  const cores = efetivas(tokens)
  aplicarTema(el, cores, PROPRIEDADES, derivados(cores))
}

/* Exposto para o teste conseguir inspecionar o que SERIA escrito, sem DOM. */
export const paresDe = (tokens) => propriedadesDe(efetivas(tokens), PROPRIEDADES)
