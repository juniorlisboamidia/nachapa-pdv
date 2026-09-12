// Progressão automática entre grupos — módulo puro, testado em totemFoco.test.js.
//
// O comportamento que se quer reproduzir é o do próprio Cardápio Web: quando o
// cliente completa as escolhas de um grupo, a tela leva ele para o próximo em vez
// de deixá-lo procurar. Num combo com três grupos isso é a diferença entre uma
// jornada guiada e uma página comprida.
//
// A regra é estreita de propósito, porque rolagem automática na hora errada é
// pior do que rolagem nenhuma. Ela dispara SÓ quando uma interação do cliente faz
// a quantidade escolhida passar de "menor que o máximo" para "igual ao máximo".
// Não dispara ao carregar a tela, não dispara ao desmarcar, não dispara em grupo
// sem teto, e o grupo principal da vitrine nem chega aqui (a lista que entra já
// vem sem ele).
import { somaDaSelecao } from './totemLayout.js'

const lista = (v) => (Array.isArray(v) ? v : [])
const mesmoId = (a, b) => String(a) === String(b)
// null/undefined = sem teto. 0 é teto de verdade.
const teto = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// A transição aconteceu NESTE toque? Comparar os dois lados é o que separa
// "acabei de completar o grupo" de "o grupo já estava completo e eu troquei de
// opção" — no segundo caso a tela não pode sair do lugar.
export function atingiuMax(grupo, antes, depois) {
  const max = teto(grupo?.max)
  if (max === null) return false
  return somaDaSelecao(antes) < max && somaDaSelecao(depois) === max
}

// Para onde ir depois de completar `grupoId`. Percorre na ordem em que os grupos
// chegaram, que é a ordem do `index` do Cardápio Web — nunca por id nem por nome.
// Grupo que não está ACTIVE é pulado: ele está na tela, apagado, e não aceita
// toque, então parar nele seria levar o cliente a um beco.
// Sem próximo, o destino é o botão de adicionar.
export function proximoFoco(grupos, grupoId) {
  const gs = lista(grupos)
  const i = gs.findIndex((g) => mesmoId(g?.id, grupoId))
  if (i < 0) return { tipo: 'CTA' }
  for (let k = i + 1; k < gs.length; k++) {
    const g = gs[k]
    if (g?.status && g.status !== 'ACTIVE') continue
    return { tipo: 'GRUPO', id: g.id }
  }
  return { tipo: 'CTA' }
}
