// A prévia do menu board no editor — testes puros (node --test, ESM).
// Rodar: node --test frontend/src/components/tvMenuBoardPrevia.test.js
//
// O TESTE MAIS IMPORTANTE DESTE ARQUIVO é o último: ele importa a função do SERVIDOR
// (`backend/tvMenuBoard.js`) e prova que a prévia e a parede produzem o MESMO objeto para os
// mesmos casos. É o que transforma "duplicar a regra" em "duplicação provada equivalente" —
// o mesmo arranjo que `totemBanners.js` usa com a régua de elegibilidade do totem.
//
// Sem ele, um ajuste de promoção num lado passaria despercebido até o gestor aprovar uma
// tela no admin e a loja mostrar outra na parede.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { produtoDaPrevia, disponivelNaPrevia, previaDoBoard } from './tvMenuBoardPrevia.js'
// O servidor. Importado direto: os dois são ESM puro, e é justamente isso que permite
// comparar os dois lados sem subir nada.
import { produtoParaTv, disponivel } from '../../../backend/tvMenuBoard.js'
import { SELOS } from '../../../backend/produtoFita.js'

// O catálogo como `GET /tv-indoor/catalogo` o entrega (com `selo` já no item).
const item = (extra) => ({ id: 3527346, nome: 'X BACON', descricao: 'Pão e bacon', imagem: 'https://cw/x.jpg', preco: 31.9, status: 'ACTIVE', selo: null, ...extra })

test('produtoDaPrevia: preço normal, sem campos de promoção', () => {
  const p = produtoDaPrevia(item(), SELOS)
  assert.deepEqual(p, { id: '3527346', nome: 'X BACON', descricao: 'Pão e bacon', imagemUrl: 'https://cw/x.jpg', preco: 31.9 })
})

test('produtoDaPrevia: o promocional é o preço ATUAL e o outro vira o anterior', () => {
  const p = produtoDaPrevia(item({ preco: 25, precoPromocional: 19.9 }), SELOS)
  assert.equal(p.preco, 19.9)
  assert.equal(p.precoAnterior, 25)
  assert.equal(p.descontoPercentual, 20)
})

test('produtoDaPrevia: o selo sai do catálogo de selos, com texto e cor', () => {
  assert.deepEqual(produtoDaPrevia(item({ selo: 'MAIS_PEDIDO' }), SELOS).selo, { texto: 'Mais pedido', cor: '#B45309' })
  assert.equal('selo' in produtoDaPrevia(item({ selo: 'INVENTADO' }), SELOS), false)
})

test('disponivelNaPrevia: só ACTIVE; status ausente conta como disponível', () => {
  assert.equal(disponivelNaPrevia(item()), true)
  assert.equal(disponivelNaPrevia(item({ status: 'MISSING' })), false)
  assert.equal(disponivelNaPrevia({}), true)
})

const porId = new Map([
  ['1', item({ id: 1, nome: 'A' })],
  ['2', item({ id: 2, nome: 'B', preco: 25, precoPromocional: 19.9 })],
  ['3', item({ id: 3, nome: 'C', status: 'MISSING' })],
])

test('previaDoBoard monta na ordem e tira indisponível e sumido', () => {
  const p = previaDoBoard({
    layout: 'GRADE', titulo: 'Burgers',
    escolhidos: [{ cwItemId: 2 }, { cwItemId: 3 }, { cwItemId: 99 }, { cwItemId: 1 }],
    porId, selos: SELOS,
  })
  assert.deepEqual(p.produtos.map((x) => x.nome), ['B', 'A'], 'o MISSING e o inexistente saem')
  assert.equal(p.titulo, 'Burgers')
  assert.equal('destaqueId' in p, false, 'GRADE não tem destaque')
})

test('previaDoBoard: destaque escolhido manda; sem escolha, o primeiro disponível', () => {
  const com = previaDoBoard({ layout: 'DESTAQUE', escolhidos: [{ cwItemId: 1 }, { cwItemId: 2, destaque: true }], porId, selos: SELOS })
  assert.equal(com.destaqueId, '2')
  const sem = previaDoBoard({ layout: 'DESTAQUE', escolhidos: [{ cwItemId: 1 }, { cwItemId: 2 }], porId, selos: SELOS })
  assert.equal(sem.destaqueId, '1')
  // O destaque escolhido ficou indisponível: o primeiro que sobrou assume.
  const caiu = previaDoBoard({ layout: 'DESTAQUE', escolhidos: [{ cwItemId: 3, destaque: true }, { cwItemId: 2 }], porId, selos: SELOS })
  assert.equal(caiu.destaqueId, '2')
})

test('previaDoBoard aguenta entrada torta', () => {
  assert.deepEqual(previaDoBoard({ layout: 'GRADE' }), { layout: 'GRADE', titulo: null, subtitulo: null, produtos: [] })
  // Sem `exibicao`, a chave simplesmente não existe — e o renderer cai nos defaults do V1.
  assert.equal('exibicao' in previaDoBoard({ layout: 'GRADE' }), false)
  assert.deepEqual(previaDoBoard({ layout: 'LISTA', escolhidos: null, porId: null }).produtos, [])
})

// ── A PROVA ──────────────────────────────────────────────────────────────────
test('🔴 a prévia do admin e a tela da TV produzem O MESMO produto', () => {
  // Se este teste cair, o gestor está aprovando uma tela e a loja mostrando outra.
  const casos = [
    { rotulo: 'preço normal', item: item(), selo: undefined },
    { rotulo: 'promoção', item: item({ preco: 25, precoPromocional: 19.9 }), selo: undefined },
    { rotulo: 'promoção que não é oferta', item: item({ preco: 10, precoPromocional: 10 }), selo: undefined },
    { rotulo: 'promocional maior que o preço', item: item({ preco: 10, precoPromocional: 12 }), selo: undefined },
    { rotulo: 'preço zero', item: item({ preco: 0 }), selo: undefined },
    { rotulo: 'sem foto e sem descrição', item: item({ imagem: null, descricao: null }), selo: undefined },
    { rotulo: 'com selo', item: item({ selo: 'OFERTA' }), selo: 'OFERTA' },
    { rotulo: 'selo desconhecido', item: item({ selo: 'ZZZ' }), selo: 'ZZZ' },
    { rotulo: 'id como texto', item: item({ id: 'abc-1' }), selo: undefined },
    { rotulo: 'desconto quebrado (arredonda)', item: item({ preco: 52, precoPromocional: 39.9 }), selo: undefined },
  ]
  for (const caso of casos) {
    // O servidor recebe o CÓDIGO do selo (que no banco é o que existe); a prévia recebe o
    // item já com o código dentro. Os dois têm de chegar ao mesmo `{ texto, cor }`.
    const naTv = produtoParaTv(caso.item, caso.selo)
    const noAdmin = produtoDaPrevia(caso.item, SELOS)
    assert.deepEqual(noAdmin, naTv, `divergiram em: ${caso.rotulo}`)
  }
})

test('🔴 a régua de disponibilidade é a MESMA nos dois lados', () => {
  for (const status of ['ACTIVE', 'MISSING', 'INACTIVE', undefined, null, 'QUALQUER']) {
    assert.equal(disponivelNaPrevia({ status }), disponivel({ status }), `status ${String(status)}`)
  }
})
