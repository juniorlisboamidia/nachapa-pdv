// DOMÍNIO → CSS por CSSOM — helper técnico, sem domínio.
//
// Saiu de `components/totemTema.js` quando a TV Indoor precisou da mesma ponte. O que ele
// sabe é só isto: existe um mapa de chaves conhecidas para nomes de custom property, e um
// valor só atravessa se for hexadecimal canônico. Não sabe quais são as chaves — o mapa
// ENTRA POR PARÂMETRO, e é por isso que dois canais irmãos podem dividi-lo.
//
// ── POR QUE ISTO EXISTE, E POR QUE É SÓ UM LUGAR ─────────────────────────────────────
// O banco guarda chaves de DOMÍNIO (`fundo`, `destaque`) e nunca nomes de CSS. No dia em
// que a folha renomear um token, muda o mapa e nenhuma loja precisa reconfigurar nada.
//
// ── SEGURANÇA ────────────────────────────────────────────────────────────────────────
// O valor chega ao navegador por `element.style.setProperty(prop, valor)`, e por mais nada.
// Nunca uma `<style>` montada com string, nunca `dangerouslySetInnerHTML`. A consequência
// prática: não existe escape a fazer, porque não existe texto sendo interpretado como CSS.
// Uma chave fora do mapa não tem para onde ir, e um valor que não é hexadecimal não passa.

const HEX = /^#[0-9a-f]{6}$/

/* Os pares `[propriedade, valor]` a escrever, a partir do que veio do servidor.

   Filtra duas vezes, e as duas importam: a chave tem de estar no MAPA (nada de
   `--qualquer-coisa` vindo do servidor) e o valor tem de ser um hexadecimal canônico de
   seis dígitos. O servidor já normaliza, mas este é o último portão antes do CSSOM — e o
   último portão não confia no anterior.

   Entrada torta devolve lista vazia, e a folha continua mandando. */
export function propriedadesDe(tokens, mapa) {
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) return []
  if (typeof mapa !== 'object' || mapa === null) return []
  const fora = []
  for (const chave of Object.keys(mapa)) {
    const valor = tokens[chave]
    if (typeof valor !== 'string') continue
    const v = valor.trim().toLowerCase()
    if (!HEX.test(v)) continue
    fora.push([mapa[chave], v])
  }
  return fora
}

/* Escreve os pares num nó, e APAGA o que o mapa conhece e não foi escrito.

   O `removeProperty` é o que faz a loja conseguir VOLTAR: sem ele, tirar um override no
   admin deixaria a cor antiga grudada no aparelho até alguém recarregar a página.

   Recebe também `extras` — pares já prontos que não vêm do mapa (uma cor DERIVADA, por
   exemplo). Eles passam pelo mesmo `setProperty`, com o nome fixo no código de quem chama;
   nada arbitrário do banco atravessa por aqui. */
export function aplicarTema(el, tokens, mapa, extras = []) {
  if (!el || typeof el.style?.setProperty !== 'function') return
  const pares = propriedadesDe(tokens, mapa)
  const escritas = new Set(pares.map(([p]) => p))
  for (const [, prop] of Object.entries(mapa ?? {})) {
    if (!escritas.has(prop)) el.style.removeProperty(prop)
  }
  for (const [prop, valor] of pares) el.style.setProperty(prop, valor)
  for (const [prop, valor] of Array.isArray(extras) ? extras : []) {
    if (typeof prop !== 'string' || typeof valor !== 'string') continue
    if (valor) el.style.setProperty(prop, valor)
    else el.style.removeProperty(prop)
  }
}

/* `#rrggbb` → `rgba(r, g, b, alpha)`.

   Existe para as cores DERIVADAS — uma divisória, um véu — que precisam acompanhar um token
   configurável sem virar um sétimo campo na tela. O alvo é WebView de TV, onde `color-mix`
   pode não existir; a conta feita aqui chega pronta como texto. */
export function comAlpha(cor, alpha) {
  if (typeof cor !== 'string') return null
  const c = cor.trim().toLowerCase()
  if (!HEX.test(c)) return null
  const a = Number(alpha)
  if (!Number.isFinite(a) || a < 0 || a > 1) return null
  return `rgba(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}, ${a})`
}
