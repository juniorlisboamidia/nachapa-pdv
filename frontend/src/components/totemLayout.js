// Decisões de LAYOUT do quiosque que são regra, não CSS — módulo puro, sem React
// e sem rede, testado em totemLayout.test.js.
//
// A fronteira com totemCarrinho.js: lá mora o que decide se um item PODE ser
// pedido e quanto ele custa (regra de negócio, espelhada no HUB); aqui mora o que
// decide como a tela se organiza — o texto da regra do grupo, quais chips de
// pendência aparecer, e (V6) se um grupo é desenhado em grade com foto ou em
// lista de texto. Nada aqui inventa preço nem monta pedido.
//
// Formas usadas (as mesmas do bootstrap):
//   grupo   = { id, nome, choiceType, min, max, status, opcoes:[opcao] }
//   opcao   = { id, nome, preco, status, maxQuantidade, imagem, descricao }
//   selecao = [{ opcaoId, qtd }]         · selecoes = { [grupoId]: selecao }

const lista = (v) => (Array.isArray(v) ? v : [])
const num = (v, padrao = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : padrao
}
const mesmoId = (a, b) => String(a) === String(b)

// Σ das quantidades escolhidas num grupo. Entrada sem `qtd` conta 1 — é como o
// resto do fluxo trata a seleção simples.
export function somaDaSelecao(selecao) {
  return lista(selecao).reduce((s, e) => s + Math.max(1, Math.trunc(num(e?.qtd, 1))), 0)
}

export function qtdDaOpcao(selecao, opcaoId) {
  const achou = lista(selecao).find((e) => mesmoId(e?.opcaoId, opcaoId))
  return achou ? Math.max(1, Math.trunc(num(achou.qtd, 1))) : 0
}

// O que o cliente precisa saber de um grupo é quantas escolhas ele DEVE e PODE
// fazer — não o nome técnico do tipo de escolha do Cardápio Web.
// `max` nulo/ausente = sem teto.
export function regraDoGrupo(grupo) {
  const min = num(grupo?.min, 0)
  const semTeto = grupo?.max === null || grupo?.max === undefined
  const max = semTeto ? null : num(grupo.max)
  if (min > 0 && max !== null && max === min) return { texto: `escolha ${min}`, obrigatorio: true }
  if (min > 0 && max !== null) return { texto: `escolha de ${min} a ${max}`, obrigatorio: true }
  if (min > 0) return { texto: `escolha ao menos ${min}`, obrigatorio: true }
  if (max !== null) return { texto: `escolha até ${max}`, obrigatorio: false }
  return { texto: 'opcional', obrigatorio: false }
}

// Grupos obrigatórios que ainda não foram atendidos, na ordem em que chegaram
// (que é a ordem do `index` do CW). Quem chama passa os grupos JÁ RENDERIZÁVEIS —
// o principal da vitrine não entra, porque foi escolhido no card e continua
// oculto na tela.
//
// Mesma régua de `itemPronto` (totemCarrinho.js): grupo que não está ACTIVE é
// ignorado, porque o HUB também o ignora na cotação — travar a tela por um grupo
// que o servidor nem olha deixaria o item impossível de pedir.
export function obrigatoriosPendentes(grupos, selecoes) {
  const out = []
  for (const g of lista(grupos)) {
    if (g?.status && g.status !== 'ACTIVE') continue
    const min = num(g?.min, 0)
    if (min <= 0) continue
    if (somaDaSelecao(selecoes?.[g?.id]) < min) out.push(g)
  }
  return out
}

// Grade com foto ou lista de texto? A decisão é do GRUPO inteiro, não de cada
// opção: se uma tem imagem e a outra não, as duas entram na grade (a sem foto
// recebe o marcador desenhado) para a coluna de nomes ficar alinhada. Grupo em
// que NENHUMA opção tem imagem vira lista de texto — reservar um quadrado vazio
// ao lado de cada linha só produziria buraco.
//
// String vazia não é foto: o Cardápio Web devolve '' quando o campo existe e não
// foi preenchido.
export function modoDeOpcoes(grupo) {
  const temFoto = lista(grupo?.opcoes).some((o) => typeof o?.imagem === 'string' && o.imagem.trim() !== '')
  return temFoto ? 'GRADE' : 'LISTA'
}
