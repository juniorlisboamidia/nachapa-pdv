// Regras do carrinho do totem — testes puros (node --test, ESM).
// Rodar: node frontend/src/components/totemCarrinho.test.js (como atalhos.test.js).
//
// O que estes testes defendem: a TELA nunca deixa o cliente montar algo que o HUB vá
// recusar (min/max/max_quantity/SINGLE), o subtotal exibido é só exibição, e o carrinho
// que vai no fio não leva preço nenhum — quem precifica é o HUB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  podeAdicionarOpcao, grupoSatisfeito, itemPronto, subtotalLocal,
  montarCarrinho, diffCotacao, chaveNova, mensagemErro, precoEmVigor,
} from './totemCarrinho.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
const opcao = (id, extra = {}) => ({ id, nome: `Opção ${id}`, preco: 1, status: 'ACTIVE', maxQuantidade: null, ...extra });

const grupoSingle = {
  id: 10, nome: 'Ponto da carne', choiceType: 'SINGLE', min: 1, max: 1, status: 'ACTIVE',
  opcoes: [opcao(101, { preco: 0 }), opcao(102, { preco: 0 }), opcao(103, { preco: 0, status: 'MISSING' })],
};
const grupoMultiple = {
  id: 20, nome: 'Adicionais', choiceType: 'MULTIPLE', min: 0, max: 3, status: 'ACTIVE',
  opcoes: [opcao(201, { preco: 2 }), opcao(202, { preco: 3 }), opcao(203, { preco: 4 }), opcao(204, { preco: 5 })],
};
const grupoSummable = {
  id: 30, nome: 'Bacon extra', choiceType: 'SUMMABLE', min: 0, max: 5, status: 'ACTIVE',
  opcoes: [opcao(301, { preco: 4, maxQuantidade: 2 }), opcao(302, { preco: 6, maxQuantidade: null })],
};
const grupoInativo = { id: 40, nome: 'Fora do ar', choiceType: 'SINGLE', min: 1, max: 1, status: 'INACTIVE', opcoes: [opcao(401)] };

const item = {
  id: 999, nome: 'Burger da casa', preco: 30, grupos: [grupoSingle, grupoMultiple, grupoSummable], status: 'ACTIVE',
};

// ── podeAdicionarOpcao ──────────────────────────────────────────────────────
test('SINGLE: sempre cabe e substitui a escolha anterior', () => {
  assert.deepEqual(podeAdicionarOpcao(grupoSingle, [], grupoSingle.opcoes[0]), { ok: true, substitui: true });
  // Já tem a 101 escolhida e o cliente toca na 102: cabe, porque substitui.
  assert.deepEqual(podeAdicionarOpcao(grupoSingle, [{ opcaoId: 101, qtd: 1 }], grupoSingle.opcoes[1]), { ok: true, substitui: true });
});

test('opção em falta não entra em nenhum tipo de grupo', () => {
  assert.deepEqual(podeAdicionarOpcao(grupoSingle, [], grupoSingle.opcoes[2]), { ok: false, motivo: 'OPCAO_EM_FALTA' });
});

test('MULTIPLE: não repete a mesma opção', () => {
  const r = podeAdicionarOpcao(grupoMultiple, [{ opcaoId: 201, qtd: 1 }], grupoMultiple.opcoes[0]);
  assert.deepEqual(r, { ok: false, motivo: 'JA_ESCOLHIDA' });
});

test('MULTIPLE: respeita o máximo do grupo (3 = cabe; a 4ª não)', () => {
  const tres = [{ opcaoId: 201, qtd: 1 }, { opcaoId: 202, qtd: 1 }];
  assert.deepEqual(podeAdicionarOpcao(grupoMultiple, tres, grupoMultiple.opcoes[2]), { ok: true });
  const cheio = [...tres, { opcaoId: 203, qtd: 1 }];
  assert.deepEqual(podeAdicionarOpcao(grupoMultiple, cheio, grupoMultiple.opcoes[3]), { ok: false, motivo: 'GRUPO_LIMITE' });
});

test('MULTIPLE sem max: nunca estoura', () => {
  const g = { ...grupoMultiple, max: null };
  const cheio = [{ opcaoId: 201, qtd: 1 }, { opcaoId: 202, qtd: 1 }, { opcaoId: 203, qtd: 1 }];
  assert.deepEqual(podeAdicionarOpcao(g, cheio, g.opcoes[3]), { ok: true });
});

test('SUMMABLE: maxQuantidade é o teto da MESMA opção', () => {
  assert.deepEqual(podeAdicionarOpcao(grupoSummable, [{ opcaoId: 301, qtd: 1 }], grupoSummable.opcoes[0]), { ok: true });
  assert.deepEqual(podeAdicionarOpcao(grupoSummable, [{ opcaoId: 301, qtd: 2 }], grupoSummable.opcoes[0]), { ok: false, motivo: 'OPCAO_LIMITE' });
  // maxQuantidade null = sem teto próprio; só o do grupo vale.
  assert.deepEqual(podeAdicionarOpcao(grupoSummable, [{ opcaoId: 302, qtd: 4 }], grupoSummable.opcoes[1]), { ok: true });
});

test('SUMMABLE: a soma do grupo não passa do max (5)', () => {
  const soma5 = [{ opcaoId: 301, qtd: 2 }, { opcaoId: 302, qtd: 3 }];
  assert.deepEqual(podeAdicionarOpcao(grupoSummable, soma5, grupoSummable.opcoes[1]), { ok: false, motivo: 'GRUPO_LIMITE' });
  const soma4 = [{ opcaoId: 301, qtd: 2 }, { opcaoId: 302, qtd: 2 }];
  assert.deepEqual(podeAdicionarOpcao(grupoSummable, soma4, grupoSummable.opcoes[1]), { ok: true });
});

test('choiceType desconhecido é recusado (o totem não sabe somar MEAN/MAX)', () => {
  const g = { ...grupoMultiple, choiceType: 'MEAN' };
  assert.deepEqual(podeAdicionarOpcao(g, [], g.opcoes[0]), { ok: false, motivo: 'TIPO_NAO_SUPORTADO' });
});

// ── grupoSatisfeito ─────────────────────────────────────────────────────────
test('grupoSatisfeito: Σ qtd ≥ min', () => {
  assert.equal(grupoSatisfeito(grupoSingle, []), false);
  assert.equal(grupoSatisfeito(grupoSingle, [{ opcaoId: 101, qtd: 1 }]), true);
  assert.equal(grupoSatisfeito(grupoMultiple, []), true);                 // min 0
  assert.equal(grupoSatisfeito({ ...grupoSummable, min: 3 }, [{ opcaoId: 301, qtd: 2 }]), false);
  assert.equal(grupoSatisfeito({ ...grupoSummable, min: 3 }, [{ opcaoId: 301, qtd: 2 }, { opcaoId: 302, qtd: 1 }]), true);
  assert.equal(grupoSatisfeito({ ...grupoSingle, min: null }, []), true);  // min ausente = 0
});

// ── itemPronto ──────────────────────────────────────────────────────────────
test('itemPronto: lista os grupos obrigatórios que faltam', () => {
  assert.deepEqual(itemPronto(item, {}), { ok: false, gruposFaltando: [10] });
  assert.deepEqual(itemPronto(item, { 10: [{ opcaoId: 101, qtd: 1 }] }), { ok: true, gruposFaltando: [] });
});

test('itemPronto: grupo não ACTIVE não trava o item (o HUB também o ignora)', () => {
  const comInativo = { ...item, grupos: [...item.grupos, grupoInativo] };
  assert.deepEqual(itemPronto(comInativo, { 10: [{ opcaoId: 101, qtd: 1 }] }), { ok: true, gruposFaltando: [] });
});

test('itemPronto: item sem grupos está pronto', () => {
  assert.deepEqual(itemPronto({ id: 1, nome: 'Coca', preco: 7 }, {}), { ok: true, gruposFaltando: [] });
});

// ── precoEmVigor / subtotalLocal ────────────────────────────────────────────
test('precoEmVigor: promoção ganha do preço cheio; 0 é preço válido', () => {
  assert.equal(precoEmVigor({ preco: 30 }), 30);
  assert.equal(precoEmVigor({ preco: 30, precoPromocional: 24.9 }), 24.9);
  assert.equal(precoEmVigor({ preco: 30, precoPromocional: 0 }), 0);
  assert.equal(precoEmVigor({ preco: 30, precoPromocional: null }), 30);
});

test('subtotalLocal: (preço em vigor + Σ opções×qtd) × qtd', () => {
  // 30 + (2 adicional) + (4×2 bacon) = 40; ×2 = 80
  const linha = { item, qtd: 2, selecoes: { 10: [{ opcaoId: 101, qtd: 1 }], 20: [{ opcaoId: 201, qtd: 1 }], 30: [{ opcaoId: 301, qtd: 2 }] } };
  assert.equal(subtotalLocal(linha), 80);
});

test('subtotalLocal usa o preço promocional e arredonda em 2 casas', () => {
  const promo = { ...item, precoPromocional: 24.9 };
  const linha = { item: promo, qtd: 3, selecoes: { 20: [{ opcaoId: 202, qtd: 1 }] } };
  assert.equal(subtotalLocal(linha), 83.7); // (24.9 + 3) × 3
});

test('subtotalLocal ignora opção que não existe mais no grupo', () => {
  const linha = { item, qtd: 1, selecoes: { 20: [{ opcaoId: 9999, qtd: 1 }] } };
  assert.equal(subtotalLocal(linha), 30);
});

// ── montarCarrinho ──────────────────────────────────────────────────────────
test('montarCarrinho: formato do contrato, ids em string e SEM preço', () => {
  const linhas = [
    { item, qtd: 2, observacao: ' sem cebola ', selecoes: { 10: [{ opcaoId: 101, qtd: 1 }], 30: [{ opcaoId: 301, qtd: 2 }] } },
    { item: { id: 555, nome: 'Coca', preco: 7 }, qtd: 1, observacao: '', selecoes: {} },
  ];
  assert.deepEqual(montarCarrinho(linhas), [
    {
      itemId: '999', qtd: 2, observacao: 'sem cebola',
      grupos: [
        { grupoId: '10', opcoes: [{ opcaoId: '101', qtd: 1 }] },
        { grupoId: '30', opcoes: [{ opcaoId: '301', qtd: 2 }] },
      ],
    },
    { itemId: '555', qtd: 1, grupos: [] },
  ]);
});

test('montarCarrinho: nenhum preço vaza para o corpo', () => {
  const linhas = [{ item, qtd: 1, selecoes: { 10: [{ opcaoId: 101, qtd: 1 }] } }];
  const json = JSON.stringify(montarCarrinho(linhas));
  assert.ok(!/preco|price|unitPrice|subtotal/i.test(json), json);
});

test('montarCarrinho: grupo sem opção escolhida não entra', () => {
  const linhas = [{ item, qtd: 1, selecoes: { 10: [{ opcaoId: 101, qtd: 1 }], 20: [] } }];
  assert.deepEqual(montarCarrinho(linhas)[0].grupos, [{ grupoId: '10', opcoes: [{ opcaoId: '101', qtd: 1 }] }]);
});

// ── diffCotacao ─────────────────────────────────────────────────────────────
const linhaUI = (qtd, selecoes) => ({ item, qtd, selecoes });

test('diffCotacao: nada mudou', () => {
  const ui = [linhaUI(1, { 10: [{ opcaoId: 101, qtd: 1 }] })];
  const hub = [{ itemId: '999', nome: 'Burger da casa', qtd: 1, unitPrice: 30, totalPrice: 30, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 30, 30), { alteradas: [], totalMudou: false });
});

test('diffCotacao: preço do item subiu → linha marcada e total mudou', () => {
  const ui = [linhaUI(1, {})];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 34, totalPrice: 34, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 30, 34), { alteradas: ['999'], totalMudou: true });
});

test('diffCotacao: só o preço de uma OPÇÃO mudou (o unitPrice do item não muda)', () => {
  // local: 30 + 2 = 32. HUB cobrou a opção a 5: 35.
  const ui = [linhaUI(1, { 20: [{ opcaoId: 201, qtd: 1 }] })];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 35, opcoes: [{ opcaoId: '201', grupoId: '20', nome: 'Opção 201', qtd: 1, unitPrice: 5 }] }];
  assert.deepEqual(diffCotacao(ui, hub, 32, 35), { alteradas: ['999'], totalMudou: true });
});

test('diffCotacao: centavos de arredondamento não contam como mudança', () => {
  const ui = [linhaUI(1, {})];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 30.001, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 30, 30.001), { alteradas: [], totalMudou: false });
});

test('diffCotacao: linha que o HUB não devolveu conta como alterada', () => {
  const ui = [linhaUI(1, {}), { item: { id: 555, nome: 'Coca', preco: 7 }, qtd: 1, selecoes: {} }];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 30, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 37, 30), { alteradas: ['555'], totalMudou: true });
});

test('diffCotacao: itemId fora de ordem no HUB ainda casa pelo id', () => {
  const coca = { id: 555, nome: 'Coca', preco: 7 };
  const ui = [linhaUI(1, {}), { item: coca, qtd: 1, selecoes: {} }];
  const hub = [
    { itemId: '555', qtd: 1, unitPrice: 7, totalPrice: 7, opcoes: [] },
    { itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 30, opcoes: [] },
  ];
  assert.deepEqual(diffCotacao(ui, hub, 37, 37), { alteradas: [], totalMudou: false });
});

test('diffCotacao: alteradas não repete o mesmo itemId', () => {
  const ui = [linhaUI(1, {}), linhaUI(1, {})];
  const hub = [
    { itemId: '999', qtd: 1, unitPrice: 34, totalPrice: 34, opcoes: [] },
    { itemId: '999', qtd: 1, unitPrice: 34, totalPrice: 34, opcoes: [] },
  ];
  assert.deepEqual(diffCotacao(ui, hub, 60, 68), { alteradas: ['999'], totalMudou: true });
});

test('diffCotacao aguenta entrada vazia/inválida sem quebrar', () => {
  assert.deepEqual(diffCotacao([], [], 0, 0), { alteradas: [], totalMudou: false });
  assert.deepEqual(diffCotacao(null, null, null, null), { alteradas: [], totalMudou: false });
});

// ── chaveNova ───────────────────────────────────────────────────────────────
test('chaveNova: aceita pelo validarCorpoPedido do backend e não repete', () => {
  const a = chaveNova();
  const b = chaveNova();
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(a, b);
});

test('chaveNova: funciona sem crypto.randomUUID (tablet antigo)', () => {
  // `globalThis.crypto` é um getter no Node: para simular o tablet velho é preciso
  // redefinir o descritor, e devolvê-lo no finally.
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const k = chaveNova();
    assert.match(k, /^[A-Za-z0-9_-]{8,64}$/);
    assert.notEqual(k, chaveNova());
  } finally {
    Object.defineProperty(globalThis, 'crypto', desc);
  }
});

// ── mensagemErro ────────────────────────────────────────────────────────────
const CODIGOS = [
  'APARELHO_NAO_PAREADO', 'CODIGO_INVALIDO', 'MUITAS_TENTATIVAS',
  'LOJA_INATIVA', 'LOJA_FECHADA', 'MODO_INDISPONIVEL',
  'CARRINHO_VAZIO', 'CARRINHO_GRANDE', 'QTD_INVALIDA',
  'ITEM_INDISPONIVEL', 'ITEM_EM_FALTA', 'ITEM_FORA_DE_HORARIO', 'ITEM_NAO_SUPORTADO', 'ESTOQUE_INSUFICIENTE',
  'GRUPO_OBRIGATORIO', 'GRUPO_LIMITE', 'GRUPO_CALCULO_NAO_SUPORTADO', 'OPCAO_INDISPONIVEL', 'OPCAO_EM_FALTA',
  'PAGAMENTO_INVALIDO', 'COTACAO_INVALIDA', 'COTACAO_DIVERGENTE', 'COTACAO_EXPIRADA',
  'CW_RECUSOU', 'CW_RATE_LIMIT', 'CW_INDISPONIVEL',
  'HUB_INDISPONIVEL', 'HUB_NAO_CONFIGURADO', 'HUB_SEM_PARTNER_KEY', 'HUB_CONFIG_INVALIDA',
  'CATALOGO_INDISPONIVEL', 'CLIENTE_SEM_CW', 'CORPO_INVALIDO', 'APARELHO_NAO_E_TOTEM',
  'PEDIDO_NAO_ENCONTRADO', 'ERRO_INTERNO',
];

test('mensagemErro cobre todos os códigos públicos do §7 com frase de cliente', () => {
  for (const c of CODIGOS) {
    const m = mensagemErro(c);
    assert.equal(typeof m, 'string', c);
    assert.ok(m.length >= 10, `${c}: "${m}"`);
    // A tela do cliente nunca mostra o código cru nem jargão de servidor.
    assert.ok(!m.includes(c), `${c} apareceu cru na mensagem`);
    assert.ok(!/HUB|CW|_/.test(m), `${c}: jargão na mensagem "${m}"`);
  }
});

test('mensagemErro: código desconhecido/vazio cai na frase genérica', () => {
  const generica = mensagemErro('BANANA_VOADORA');
  assert.equal(typeof generica, 'string');
  assert.ok(generica.length >= 10);
  assert.equal(mensagemErro(null), generica);
  assert.equal(mensagemErro(undefined), generica);
  assert.equal(mensagemErro(''), generica);
});

test('mensagemErro: mensagens distintas nos casos que o cliente precisa diferenciar', () => {
  const m = (c) => mensagemErro(c);
  assert.notEqual(m('ITEM_EM_FALTA'), m('ITEM_FORA_DE_HORARIO'));
  assert.notEqual(m('LOJA_FECHADA'), m('MODO_INDISPONIVEL'));
  assert.notEqual(m('COTACAO_EXPIRADA'), m('COTACAO_DIVERGENTE'));
});
