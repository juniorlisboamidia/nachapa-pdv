// Regras do carrinho do totem — testes puros (node --test, ESM).
// Rodar: node frontend/src/components/totemCarrinho.test.js (como atalhos.test.js).
//
// O que estes testes defendem: a TELA nunca deixa o cliente montar algo que o HUB vá
// recusar (min/max/max_quantity/SINGLE), o subtotal exibido é só exibição, e o carrinho
// que vai no fio não leva preço nenhum — quem precifica é o HUB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  podeAdicionarOpcao, grupoSatisfeito, itemPronto, itemOrdenavel, subtotalLocal,
  montarCarrinho, diffCotacao, chaveNova, mensagemErro, precoEmVigor,
  proximoEstadoAposFalha,
  indicePorItemId, linhaDeProduto, gruposRenderizaveis, nomeApresentado,
  imagemApresentada, descricaoApresentada, opcoesVisiveisDaLinha, substituirLinha,
  linhaDoDetalhe, precoDoCard, mensagemApresentacao,
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

// ── itemOrdenavel ───────────────────────────────────────────────────────────
test('itemOrdenavel: grupo OBRIGATÓRIO em falta tira o item do cardápio', () => {
  // Sem opção possível num grupo de min ≥ 1, não existe item montável: deixar o cliente
  // escolher levaria a uma recusa do HUB só lá na revisão, depois de todo o trabalho.
  const obrigatorioEmFalta = { ...grupoSingle, status: 'MISSING' };
  assert.deepEqual(itemOrdenavel({ ...item, grupos: [obrigatorioEmFalta, grupoMultiple] }), { ok: false, motivo: 'GRUPO_EM_FALTA' });
  // Opcional em falta é só um adicional que acabou: o item continua pedível.
  assert.deepEqual(itemOrdenavel({ ...item, grupos: [grupoSingle, { ...grupoMultiple, status: 'MISSING' }] }), { ok: true });
  // Tudo ACTIVE, item sem grupos, ou item sem status: pedível.
  assert.deepEqual(itemOrdenavel(item), { ok: true });
  assert.deepEqual(itemOrdenavel({ id: 1, nome: 'Coca', preco: 7 }), { ok: true });
  assert.deepEqual(itemOrdenavel(null), { ok: true });
  // O item em falta ele mesmo cai aqui também — um motivo só para a tela tratar.
  assert.deepEqual(itemOrdenavel({ ...item, status: 'MISSING' }), { ok: false, motivo: 'ITEM_EM_FALTA' });
  // Grupo INACTIVE obrigatório continua ignorado (o HUB também o ignora, como em itemPronto).
  assert.deepEqual(itemOrdenavel({ ...item, grupos: [...item.grupos, grupoInativo] }), { ok: true });
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
  assert.deepEqual(diffCotacao(ui, hub, 30, 30), { alteradas: [], alteradasIdx: [], totalMudou: false });
});

test('diffCotacao: preço do item subiu → linha marcada e total mudou', () => {
  const ui = [linhaUI(1, {})];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 34, totalPrice: 34, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 30, 34), { alteradas: ['999'], alteradasIdx: [0], totalMudou: true });
});

test('diffCotacao: só o preço de uma OPÇÃO mudou (o unitPrice do item não muda)', () => {
  // local: 30 + 2 = 32. HUB cobrou a opção a 5: 35.
  const ui = [linhaUI(1, { 20: [{ opcaoId: 201, qtd: 1 }] })];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 35, opcoes: [{ opcaoId: '201', grupoId: '20', nome: 'Opção 201', qtd: 1, unitPrice: 5 }] }];
  assert.deepEqual(diffCotacao(ui, hub, 32, 35), { alteradas: ['999'], alteradasIdx: [0], totalMudou: true });
});

test('diffCotacao: centavos de arredondamento não contam como mudança', () => {
  const ui = [linhaUI(1, {})];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 30.001, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 30, 30.001), { alteradas: [], alteradasIdx: [], totalMudou: false });
});

test('diffCotacao: linha que o HUB não devolveu conta como alterada', () => {
  const ui = [linhaUI(1, {}), { item: { id: 555, nome: 'Coca', preco: 7 }, qtd: 1, selecoes: {} }];
  const hub = [{ itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 30, opcoes: [] }];
  assert.deepEqual(diffCotacao(ui, hub, 37, 30), { alteradas: ['555'], alteradasIdx: [1], totalMudou: true });
});

test('diffCotacao: itemId fora de ordem no HUB ainda casa pelo id', () => {
  const coca = { id: 555, nome: 'Coca', preco: 7 };
  const ui = [linhaUI(1, {}), { item: coca, qtd: 1, selecoes: {} }];
  const hub = [
    { itemId: '555', qtd: 1, unitPrice: 7, totalPrice: 7, opcoes: [] },
    { itemId: '999', qtd: 1, unitPrice: 30, totalPrice: 30, opcoes: [] },
  ];
  assert.deepEqual(diffCotacao(ui, hub, 37, 37), { alteradas: [], alteradasIdx: [], totalMudou: false });
});

test('diffCotacao: alteradas não repete o mesmo itemId', () => {
  const ui = [linhaUI(1, {}), linhaUI(1, {})];
  const hub = [
    { itemId: '999', qtd: 1, unitPrice: 34, totalPrice: 34, opcoes: [] },
    { itemId: '999', qtd: 1, unitPrice: 34, totalPrice: 34, opcoes: [] },
  ];
  assert.deepEqual(diffCotacao(ui, hub, 60, 68), { alteradas: ['999'], alteradasIdx: [0, 1], totalMudou: true });
});

test('diffCotacao aguenta entrada vazia/inválida sem quebrar', () => {
  assert.deepEqual(diffCotacao([], [], 0, 0), { alteradas: [], alteradasIdx: [], totalMudou: false });
  assert.deepEqual(diffCotacao(null, null, null, null), { alteradas: [], alteradasIdx: [], totalMudou: false });
});

// ── proximoEstadoAposFalha ──────────────────────────────────────────────────
// A regra mais caríssima da tela: decidir, depois de um POST /pedido que não deu 201/202,
// se o pedido PODE existir no Cardápio Web. Se puder, a chave de idempotência tem de
// sobreviver (`novaChave:false`) e a tela tem de travar (`travar:true`) — porque qualquer
// caminho que gere chave nova vira um SEGUNDO pedido para o mesmo cliente.
test('timeout / rede: trava a tela e PRESERVA a chave (o pedido pode existir)', () => {
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: false }), {
    travar: true, novaChave: false, tela: 'revisar', codigo: 'HUB_INDISPONIVEL',
  });
  assert.deepEqual(proximoEstadoAposFalha({}), {
    travar: true, novaChave: false, tela: 'revisar', codigo: 'HUB_INDISPONIVEL',
  });
});

test('503 HUB_NAO_CONFIGURADO é determinístico: nada criado, chave nova, tela de erro', () => {
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 503, codigo: 'HUB_NAO_CONFIGURADO' }), {
    travar: false, novaChave: true, tela: 'erro', codigo: 'HUB_NAO_CONFIGURADO',
  });
});

test('503 HUB_SEM_PARTNER_KEY / HUB_CONFIG_INVALIDA / CW_RATE_LIMIT também são determinísticos', () => {
  for (const codigo of ['HUB_SEM_PARTNER_KEY', 'HUB_CONFIG_INVALIDA', 'CW_RATE_LIMIT']) {
    assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 503, codigo }), {
      travar: false, novaChave: true, tela: 'erro', codigo,
    }, codigo);
  }
});

test('409 COTACAO_* volta para Revisar com chave nova (o registro anterior ficou recusado)', () => {
  for (const codigo of ['COTACAO_DIVERGENTE', 'COTACAO_EXPIRADA']) {
    assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 409, codigo }), {
      travar: false, novaChave: true, tela: 'revisar', codigo,
    }, codigo);
  }
});

test('422 determinístico: chave nova e tela de erro', () => {
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 422, codigo: 'CW_RECUSOU' }), {
    travar: false, novaChave: true, tela: 'erro', codigo: 'CW_RECUSOU',
  });
  // 4xx sem código no corpo continua determinístico (o servidor recusou a forma do pedido).
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 400 }), {
    travar: false, novaChave: true, tela: 'erro', codigo: 'CORPO_INVALIDO',
  });
});

test('409 que NÃO é de cotação segue determinístico, mas em tela de erro', () => {
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 409, codigo: 'CLIENTE_SEM_CW' }), {
    travar: false, novaChave: true, tela: 'erro', codigo: 'CLIENTE_SEM_CW',
  });
});

test('5xx desconhecido (500 ERRO_INTERNO, 502) é AMBÍGUO: trava e preserva a chave', () => {
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 500, codigo: 'ERRO_INTERNO' }), {
    travar: true, novaChave: false, tela: 'revisar', codigo: 'ERRO_INTERNO',
  });
  assert.deepEqual(proximoEstadoAposFalha({ temResposta: true, http: 502 }), {
    travar: true, novaChave: false, tela: 'revisar', codigo: 'HUB_INDISPONIVEL',
  });
});

test('nenhum desfecho que trava pede chave nova (invariante: travar ⇒ !novaChave)', () => {
  const casos = [
    { temResposta: false },
    { temResposta: true, http: 500, codigo: 'ERRO_INTERNO' },
    { temResposta: true, http: 503, codigo: 'HUB_INDISPONIVEL' },
    { temResposta: true, http: 503, codigo: 'HUB_NAO_CONFIGURADO' },
    { temResposta: true, http: 422, codigo: 'CW_RECUSOU' },
    { temResposta: true, http: 409, codigo: 'COTACAO_EXPIRADA' },
  ];
  for (const c of casos) {
    const r = proximoEstadoAposFalha(c);
    assert.ok(!(r.travar && r.novaChave), JSON.stringify(c));
    assert.ok(['revisar', 'erro'].includes(r.tela), JSON.stringify(c));
    assert.equal(typeof mensagemErro(r.codigo), 'string');
  }
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

// ── Camada de apresentação (spec §5/§6/§9) ──────────────────────────────────
// Fixture REAL do golden do backend (TRADICIONAIS 🍔 do Hamburgão): o item base custa
// R$ 0,00 e quem tem preço é a opção do grupo principal — é justamente o caso em que a
// vitrine muda tudo para o cliente e nada para o carrinho que vai no fio.
const IT_TRADICIONAIS = 2979325;
const G_FAVORITO = 795194;
const OP_X_BURGUER = 3633259;
const OP_X_BACON = 3633262;
const G_MAIONESE = 745977;

const grupoFavorito = {
  id: G_FAVORITO, nome: 'SEU TRADICIONAL FAVORITO', choiceType: 'SINGLE', min: 1, max: 1, status: 'ACTIVE',
  opcoes: [
    { id: OP_X_BURGUER, nome: 'X BURGUER', preco: 12, status: 'ACTIVE', maxQuantidade: null, imagem: 'x-burguer.jpg', descricao: 'Carne 56G, queijo muçarela, alface e tomate' },
    { id: OP_X_BACON, nome: 'X BACON', preco: 16, status: 'ACTIVE', maxQuantidade: null, imagem: 'x-bacon.jpg', descricao: 'Carne 56G, bacon em cubos, queijo muçarela, alface e tomate' },
  ],
};
const grupoMaionese = {
  id: G_MAIONESE, nome: 'ESCOLHA SUA MAIONESE', choiceType: 'MULTIPLE', min: 0, max: 1, status: 'ACTIVE',
  opcoes: [{ id: 2796650, nome: 'MAIONESE TRADICIONAL', preco: 0, status: 'ACTIVE', maxQuantidade: null }],
};
const itemTradicionais = {
  id: IT_TRADICIONAIS, nome: 'TRADICIONAIS 🍔', preco: 0, status: 'ACTIVE', imagem: 'capa-tradicionais.jpg',
  descricao: 'Clique aqui para conhecer todos os tradicionais', grupos: [grupoFavorito, grupoMaionese],
};
const itemCoca = { id: 111, nome: 'COCA LATA', preco: 6, status: 'ACTIVE', grupos: [] };

const produtoDe = (opcao) => ({
  id: `opcao:${IT_TRADICIONAIS}:${G_FAVORITO}:${opcao.id}`,
  tipo: 'OPCAO_PRINCIPAL',
  nome: opcao.nome, descricao: opcao.descricao, imagem: opcao.imagem,
  preco: opcao.preco, status: 'ACTIVE', ordenavel: true,
  origem: { itemId: IT_TRADICIONAIS, grupoId: G_FAVORITO, opcaoId: opcao.id },
  grupoPrincipalId: G_FAVORITO,
});
const produtoXBurguer = produtoDe(grupoFavorito.opcoes[0]);
const produtoXBacon = produtoDe(grupoFavorito.opcoes[1]);
const produtoCoca = {
  id: `item:${itemCoca.id}`, tipo: 'ITEM', nome: itemCoca.nome, descricao: null, imagem: null,
  preco: 6, status: 'ACTIVE', ordenavel: true, origem: { itemId: itemCoca.id },
};

const categorias = [
  { id: 328734, nome: '🍔 TRADICIONAIS', itens: [itemTradicionais], produtos: [produtoXBurguer, produtoXBacon] },
  { id: 400000, nome: '🥤 BEBIDAS', itens: [itemCoca, { ...itemTradicionais, nome: 'DUPLICADO' }], produtos: [produtoCoca] },
];
const indice = indicePorItemId(categorias);

// ── indicePorItemId ─────────────────────────────────────────────────────────
test('indicePorItemId: chaves em string e a PRIMEIRA ocorrência vence', () => {
  assert.deepEqual([...indice.keys()], [String(IT_TRADICIONAIS), String(itemCoca.id)]);
  // O mesmo item em duas categorias tem grupos idênticos: vale a primeira (nome original).
  assert.equal(indice.get(String(IT_TRADICIONAIS)).nome, 'TRADICIONAIS 🍔');
  assert.equal(indice.get('111'), itemCoca);
  // A chave é STRING: o produto traz `origem.itemId` como número.
  assert.equal(indice.get(IT_TRADICIONAIS), undefined);
  assert.equal(indicePorItemId(null).size, 0);
  assert.equal(indicePorItemId([{ itens: [{ nome: 'sem id' }] }]).size, 0);
});

// ── linhaDeProduto ──────────────────────────────────────────────────────────
test('linhaDeProduto: OPCAO_PRINCIPAL nasce com o principal já escolhido', () => {
  const linha = linhaDeProduto(produtoXBurguer, indice);
  assert.deepEqual(linha, {
    item: itemTradicionais,
    apresentado: {
      id: 'opcao:2979325:795194:3633259',
      nome: 'X BURGUER',
      imagem: 'x-burguer.jpg',
      descricao: 'Carne 56G, queijo muçarela, alface e tomate',
      grupoPrincipalId: G_FAVORITO,
      opcaoId: OP_X_BURGUER,
    },
    selecoes: { [String(G_FAVORITO)]: [{ opcaoId: OP_X_BURGUER, qtd: 1 }] },
    qtd: 1,
    observacao: '',
    uid: null,
  });
  // O item técnico vem POR REFERÊNCIA do índice (não é cópia): grupos e opções são os do
  // catálogo, que é o que `podeAdicionarOpcao`/`subtotalLocal` sabem ler.
  assert.equal(linha.item, itemTradicionais);
});

test('linhaDeProduto: ITEM abre vazio, como um toque no card de hoje', () => {
  assert.deepEqual(linhaDeProduto(produtoCoca, indice), {
    item: itemCoca, apresentado: null, selecoes: {}, qtd: 1, observacao: '', uid: null,
  });
});

test('linhaDeProduto: item fora do índice (ou produto quebrado) devolve null', () => {
  assert.equal(linhaDeProduto({ ...produtoCoca, origem: { itemId: 999999 } }, indice), null);
  assert.equal(linhaDeProduto({ ...produtoXBurguer, grupoPrincipalId: null, origem: { itemId: IT_TRADICIONAIS, opcaoId: OP_X_BURGUER } }, indice), null);
  assert.equal(linhaDeProduto({ ...produtoXBurguer, origem: { itemId: IT_TRADICIONAIS, grupoId: G_FAVORITO } }, indice), null);
  assert.equal(linhaDeProduto(null, indice), null);
  assert.equal(linhaDeProduto(produtoXBurguer, null), null);
});

test('linhaDeProduto: grupoPrincipalId ausente cai para origem.grupoId', () => {
  const semCampo = { ...produtoXBurguer };
  delete semCampo.grupoPrincipalId;
  const linha = linhaDeProduto(semCampo, indice);
  assert.equal(linha.apresentado.grupoPrincipalId, G_FAVORITO);
  assert.deepEqual(linha.selecoes, { [String(G_FAVORITO)]: [{ opcaoId: OP_X_BURGUER, qtd: 1 }] });
});

// ── A pré-seleção é INDISTINGUÍVEL de uma escolha manual ────────────────────
test('montarCarrinho da vitrine é byte-idêntico ao da seleção manual do mesmo X BURGUER', () => {
  const daVitrine = linhaDeProduto(produtoXBurguer, indice);
  // O que o cliente faz hoje: abrir TRADICIONAIS e tocar em X BURGUER (chave NUMÉRICA).
  const manual = { item: itemTradicionais, qtd: 1, observacao: '', selecoes: { [G_FAVORITO]: [{ opcaoId: OP_X_BURGUER, qtd: 1 }] } };
  assert.equal(JSON.stringify(montarCarrinho([daVitrine])), JSON.stringify(montarCarrinho([manual])));
  assert.deepEqual(montarCarrinho([daVitrine]), [{
    itemId: '2979325', qtd: 1, grupos: [{ grupoId: '795194', opcoes: [{ opcaoId: '3633259', qtd: 1 }] }],
  }]);
});

test('itemPronto: o principal já satisfaz o único grupo obrigatório', () => {
  const linha = linhaDeProduto(produtoXBurguer, indice);
  assert.deepEqual(itemPronto(linha.item, linha.selecoes), { ok: true, gruposFaltando: [] });
  // Sem a pré-seleção o item não estaria pronto — é a prova de que a chave em string casa.
  assert.deepEqual(itemPronto(linha.item, {}), { ok: false, gruposFaltando: [G_FAVORITO] });
});

test('subtotalLocal da linha da vitrine = preço base + preço da opção principal', () => {
  assert.equal(subtotalLocal(linhaDeProduto(produtoXBurguer, indice)), 12);
  assert.equal(subtotalLocal(linhaDeProduto(produtoXBacon, indice)), 16);
  // Com um complemento de graça o valor não muda; com qtd 2, dobra.
  const comMaionese = linhaDeProduto(produtoXBurguer, indice);
  comMaionese.selecoes[G_MAIONESE] = [{ opcaoId: 2796650, qtd: 1 }];
  assert.equal(subtotalLocal(comMaionese), 12);
  assert.equal(subtotalLocal({ ...comMaionese, qtd: 2 }), 24);
});

// ── gruposRenderizaveis / identidade apresentada ────────────────────────────
test('gruposRenderizaveis: o grupo principal não vai para a tela (nada de "trocar")', () => {
  const linha = linhaDeProduto(produtoXBurguer, indice);
  assert.deepEqual(gruposRenderizaveis(linha).map((g) => g.id), [G_MAIONESE]);
  // Sem apresentação, todos os grupos aparecem, na ordem original.
  assert.deepEqual(gruposRenderizaveis({ item: itemTradicionais }).map((g) => g.id), [G_FAVORITO, G_MAIONESE]);
  assert.deepEqual(gruposRenderizaveis(null), []);
});

test('nome/imagem/descrição apresentados: a opção manda; sem ela, o item base', () => {
  const linha = linhaDeProduto(produtoXBurguer, indice);
  assert.equal(nomeApresentado(linha), 'X BURGUER');
  assert.equal(imagemApresentada(linha), 'x-burguer.jpg');
  assert.equal(descricaoApresentada(linha), 'Carne 56G, queijo muçarela, alface e tomate');

  const semApresentacao = { item: itemTradicionais, apresentado: null, selecoes: {} };
  assert.equal(nomeApresentado(semApresentacao), 'TRADICIONAIS 🍔');
  assert.equal(imagemApresentada(semApresentacao), 'capa-tradicionais.jpg');

  // Opção sem foto própria: cai para a do item (o mesmo que o backend faz na projeção).
  const semFoto = { ...linha, apresentado: { ...linha.apresentado, imagem: null } };
  assert.equal(imagemApresentada(semFoto), 'capa-tradicionais.jpg');
  assert.equal(nomeApresentado(null), null);
});

test('opcoesVisiveisDaLinha: complementos sem o principal (X BURGUER não é adicional de si)', () => {
  const linha = linhaDeProduto(produtoXBurguer, indice);
  assert.deepEqual(opcoesVisiveisDaLinha(linha), []);
  linha.selecoes[G_MAIONESE] = [{ opcaoId: 2796650, qtd: 1 }];
  assert.deepEqual(opcoesVisiveisDaLinha(linha), [
    { grupoId: G_MAIONESE, opcaoId: 2796650, nome: 'MAIONESE TRADICIONAL', preco: 0, qtd: 1 },
  ]);
  // Sem apresentação (item comum), não há principal e tudo aparece.
  const manual = { item: itemTradicionais, selecoes: { [G_FAVORITO]: [{ opcaoId: OP_X_BURGUER, qtd: 1 }] } };
  assert.deepEqual(opcoesVisiveisDaLinha(manual).map((o) => o.nome), ['X BURGUER']);
});

// ── DUAS linhas do mesmo item base (spec §6, ajuste 5) ──────────────────────
// O caso que só existe por causa da vitrine: X BURGUER e X BACON são, no fio, o MESMO
// item 2979325 com opções diferentes. Tudo que casa por itemId aqui é armadilha.
test('duas linhas do mesmo item base: carrinho, subtotais e nomes são independentes', () => {
  const l1 = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' };
  const l2 = { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' };
  const carrinho = [l1, l2];

  assert.deepEqual(montarCarrinho(carrinho), [
    { itemId: '2979325', qtd: 1, grupos: [{ grupoId: '795194', opcoes: [{ opcaoId: '3633259', qtd: 1 }] }] },
    { itemId: '2979325', qtd: 1, grupos: [{ grupoId: '795194', opcoes: [{ opcaoId: '3633262', qtd: 1 }] }] },
  ]);
  assert.deepEqual(carrinho.map(subtotalLocal), [12, 16]);
  assert.deepEqual(carrinho.map(nomeApresentado), ['X BURGUER', 'X BACON']);
});

test('duas linhas do mesmo item base: só a segunda mudou de preço → alteradasIdx [1]', () => {
  const carrinho = [
    { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' },
    { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' },
  ];
  // O HUB devolve as linhas NA ORDEM do carrinho (§5.2): X BACON subiu de 16 para 18.
  const linhasHub = [
    { itemId: '2979325', nome: 'TRADICIONAIS 🍔', qtd: 1, unitPrice: 0, totalPrice: 12, opcoes: [{ opcaoId: '3633259', nome: 'X BURGUER', qtd: 1, unitPrice: 12 }] },
    { itemId: '2979325', nome: 'TRADICIONAIS 🍔', qtd: 1, unitPrice: 0, totalPrice: 18, opcoes: [{ opcaoId: '3633262', nome: 'X BACON', qtd: 1, unitPrice: 18 }] },
  ];
  const d = diffCotacao(carrinho, linhasHub, 28, 30);
  // O DESTAQUE é por índice: só o X BACON acende.
  assert.deepEqual(d.alteradasIdx, [1]);
  // `alteradas` continua por itemId (compatibilidade) — e é exatamente por isso que ela
  // NÃO serve para destacar aqui: as duas linhas têm o mesmo itemId.
  assert.deepEqual(d.alteradas, ['2979325']);
  assert.equal(d.totalMudou, true);
});

test('duas linhas do mesmo item base: editar uma por uid não encosta na outra', () => {
  const l1 = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' };
  const l2 = { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' };
  const carrinho = [l1, l2];

  // Edição do X BACON (qtd 3 + observação): é o corpo que `adicionarAoCarrinho` monta.
  const editada = { ...l2, qtd: 3, observacao: 'sem tomate' };
  const depois = substituirLinha(carrinho, 'u2', editada);
  assert.deepEqual(depois.map((l) => l.uid), ['u1', 'u2']);
  assert.equal(depois[0], l1);                       // a outra linha é a MESMA referência
  assert.deepEqual(depois.map(subtotalLocal), [12, 48]);
  assert.deepEqual(depois.map(nomeApresentado), ['X BURGUER', 'X BACON']);
  assert.deepEqual(montarCarrinho(depois)[0], { itemId: '2979325', qtd: 1, grupos: [{ grupoId: '795194', opcoes: [{ opcaoId: '3633259', qtd: 1 }] }] });
  assert.equal(montarCarrinho(depois)[1].observacao, 'sem tomate');

  // Sem uid (item novo) a linha vai para o fim, sem tocar em ninguém.
  const nova = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u3' };
  assert.deepEqual(substituirLinha(carrinho, null, nova).map((l) => l.uid), ['u1', 'u2', 'u3']);
  assert.deepEqual(substituirLinha(null, null, nova), [nova]);
});

// ── linhaDoDetalhe (§5.6/§7) ────────────────────────────────────────────────
// O erro do HUB vem por `itemId` (+ `opcaoId`, quando é numa opção). Com duas linhas do
// MESMO item base, nomear a errada é pior do que não nomear nenhuma.
test('linhaDoDetalhe: a opção principal do detalhe escolhe a linha certa', () => {
  const l1 = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' };
  const l2 = { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' };
  const carrinho = [l1, l2];
  // O HUB manda os ids como STRING; a linha guarda número. O casamento é em string.
  assert.equal(linhaDoDetalhe(carrinho, { codigo: 'OPCAO_EM_FALTA', itemId: '2979325', opcaoId: '3633262' }), l2);
  assert.equal(linhaDoDetalhe(carrinho, { codigo: 'OPCAO_EM_FALTA', itemId: '2979325', opcaoId: 3633259 }), l1);
});

test('linhaDoDetalhe: sem pista de qual linha é, devolve null (nunca chuta um nome)', () => {
  const carrinho = [
    { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' },
    { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' },
  ];
  // Erro no ITEM (sem opcaoId): as duas linhas casam pelo itemId → ambíguo.
  assert.equal(linhaDoDetalhe(carrinho, { codigo: 'ITEM_EM_FALTA', itemId: '2979325' }), null);
  // Opção de COMPLEMENTO em falta: não é a principal de ninguém, e o itemId segue ambíguo.
  assert.equal(linhaDoDetalhe(carrinho, { codigo: 'OPCAO_EM_FALTA', itemId: '2979325', opcaoId: '2796650' }), null);
});

test('linhaDoDetalhe: uma linha só com aquele itemId é ela, com opção ou sem', () => {
  const burguer = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' };
  const coca = { ...linhaDeProduto(produtoCoca, indice), uid: 'u2' };
  const carrinho = [burguer, coca];
  assert.equal(linhaDoDetalhe(carrinho, { itemId: '2979325' }), burguer);
  assert.equal(linhaDoDetalhe(carrinho, { itemId: 111, codigo: 'ITEM_EM_FALTA' }), coca);
  // Item que não está no carrinho, detalhe sem itemId, carrinho vazio: null.
  assert.equal(linhaDoDetalhe(carrinho, { itemId: '999999' }), null);
  assert.equal(linhaDoDetalhe(carrinho, { codigo: 'PAGAMENTO_INVALIDO' }), null);
  assert.equal(linhaDoDetalhe(null, { itemId: '2979325' }), null);
});

test('linhaDoDetalhe: nome exibido — a linha certa, ou o do item BASE (verdadeiro p/ todas)', () => {
  const carrinho = [
    { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' },
    { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' },
  ];
  // É esta a régua que a tela usa nos dois lugares (Revisar e a tela de erro).
  const nomeDoDetalhe = (d) => {
    const l = linhaDoDetalhe(carrinho, d);
    if (l) return nomeApresentado(l);
    return carrinho.find((x) => String(x.item?.id) === String(d?.itemId))?.item?.nome ?? null;
  };
  assert.equal(nomeDoDetalhe({ itemId: '2979325', opcaoId: '3633262' }), 'X BACON');
  assert.equal(nomeDoDetalhe({ itemId: '2979325' }), 'TRADICIONAIS 🍔');
  assert.equal(nomeDoDetalhe({ codigo: 'PAGAMENTO_INVALIDO' }), null);
});

test('linhaDoDetalhe: a opção principal só vale DENTRO do item acusado', () => {
  const burguer = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' };
  const coca = { ...linhaDeProduto(produtoCoca, indice), uid: 'u2' };
  const carrinho = [burguer, coca];
  // O detalhe acusa a COCA (item 111) e traz, por engano ou coincidência, o id da opção
  // principal do burguer. Recortar por item primeiro impede a linha errada de ser nomeada.
  assert.equal(linhaDoDetalhe(carrinho, { itemId: '111', opcaoId: '3633259' }), coca);
  assert.equal(linhaDoDetalhe(carrinho, { itemId: '2979325', opcaoId: '3633259' }), burguer);
});

test('linhaDoDetalhe: o COMPLEMENTO escolhido por uma linha só desempata', () => {
  const comMaionese = { ...linhaDeProduto(produtoXBurguer, indice), uid: 'u1' };
  comMaionese.selecoes[G_MAIONESE] = [{ opcaoId: 2796650, qtd: 1 }];
  const semNada = { ...linhaDeProduto(produtoXBacon, indice), uid: 'u2' };
  const carrinho = [comMaionese, semNada];
  // "MAIONESE TRADICIONAL acabou": as duas linhas são o item 2979325, mas só uma pediu.
  assert.equal(linhaDoDetalhe(carrinho, { codigo: 'OPCAO_EM_FALTA', itemId: '2979325', opcaoId: '2796650' }), comMaionese);
  assert.equal(nomeApresentado(linhaDoDetalhe(carrinho, { itemId: '2979325', opcaoId: 2796650 })), 'X BURGUER');
  // Se as DUAS pediram, volta a ser ambíguo — e o nome exibido é o do item base.
  const ambas = [comMaionese, { ...semNada, selecoes: { ...semNada.selecoes, [G_MAIONESE]: [{ opcaoId: 2796650, qtd: 1 }] } }];
  assert.equal(linhaDoDetalhe(ambas, { itemId: '2979325', opcaoId: '2796650' }), null);
});

// ── Preço do card e mensagens do admin (rev. 3, spec §5/§6/§8) ──────────────
// O card não faz conta: `precoMinimo` chega pronto do HUB (base + principal + mínimos dos
// obrigatórios que ainda faltam). Aqui só se decide QUAL número mostrar e se ele leva o
// rótulo "a partir de".
const produtoCombo = {
  id: 'opcao:1:2:3', tipo: 'OPCAO_PRINCIPAL', nome: 'X BURGUER', preco: 12,
  precoMinimo: 27.9, precoEhAPartirDe: true, status: 'ACTIVE', ordenavel: true,
  origem: { itemId: 1, grupoId: 2, opcaoId: 3 }, grupoPrincipalId: 2,
};

test('precoDoCard: combo expandido mostra o mínimo da jornada com "a partir de"', () => {
  assert.deepEqual(precoDoCard(produtoCombo), { valor: 27.9, aPartirDe: true, indisponivel: false });
});

test('precoDoCard: opção sem outro obrigatório mostra o preço dela, sem "a partir de"', () => {
  const p = { ...produtoXBurguer, precoMinimo: 12, precoEhAPartirDe: false };
  assert.deepEqual(precoDoCard(p), { valor: 12, aPartirDe: false, indisponivel: false });
});

test('precoDoCard: promoção na base vira "de/por" sobre os MÍNIMOS', () => {
  const p = { ...produtoCombo, preco: 12, precoPromocional: 10, precoMinimo: 27.9, precoMinimoPromocional: 25.9 };
  assert.deepEqual(precoDoCard(p), { valor: 27.9, valorPromocional: 25.9, aPartirDe: true, indisponivel: false });
  // Sem mínimo promocional (servidor antigo), o "por" cai para a promoção da base.
  const semMinimoPromo = { ...produtoXBurguer, precoPromocional: 10 };
  assert.deepEqual(precoDoCard(semMinimoPromo), { valor: 12, valorPromocional: 10, aPartirDe: false, indisponivel: false });
  // Sem promoção na base não existe "por" — nem chave no objeto.
  assert.equal('valorPromocional' in precoDoCard(produtoCombo), false);
});

test('precoDoCard: `precoMinimo: null` é produto sem jornada possível → indisponível', () => {
  const p = { ...produtoCombo, precoMinimo: null, precoEhAPartirDe: false, ordenavel: false, motivo: 'GRUPO_EM_FALTA' };
  assert.deepEqual(precoDoCard(p), { valor: 12, aPartirDe: false, indisponivel: true });
  // `ordenavel:false` sozinho também apaga o card, mesmo com mínimo calculado.
  assert.equal(precoDoCard({ ...produtoCombo, ordenavel: false }).indisponivel, true);
});

test('precoDoCard: bootstrap antigo (sem os campos novos) cai no preço, sem "a partir de"', () => {
  assert.deepEqual(precoDoCard(produtoXBurguer), { valor: 12, aPartirDe: false, indisponivel: false });
  assert.deepEqual(precoDoCard(produtoCoca), { valor: 6, aPartirDe: false, indisponivel: false });
  assert.deepEqual(precoDoCard(null), { valor: 0, aPartirDe: false, indisponivel: false });
});

test('mensagemApresentacao: frase humana para cada código do servidor', () => {
  assert.equal(mensagemApresentacao('MODO_INVALIDO'), 'modo inválido');
  assert.equal(mensagemApresentacao('ITEM_AUSENTE'), 'este item não está mais no cardápio do balcão');
  assert.equal(mensagemApresentacao('GRUPO_AUSENTE'), 'o grupo escolhido não existe mais neste item');
  assert.equal(mensagemApresentacao('GRUPO_NAO_E_ESCOLHA_UNICA'), 'o grupo passou a aceitar mais de uma escolha');
  assert.equal(mensagemApresentacao('GRUPO_SEM_OPCOES'), 'o grupo ficou sem opções');
  assert.equal(mensagemApresentacao('GRUPO_COM_UMA_OPCAO'), 'o grupo tem uma opção só');
  assert.equal(mensagemApresentacao('GRUPO_INDISPONIVEL'), 'o grupo está oculto no cardápio');
  // Código que esta versão da tela não conhece (servidor mais novo) não vira sigla crua.
  assert.equal(mensagemApresentacao('OUTRO_GRUPO_OBRIGATORIO'), 'configuração inválida');
  assert.equal(mensagemApresentacao('QUALQUER_COISA'), 'configuração inválida');
  assert.equal(mensagemApresentacao(undefined), 'configuração inválida');
});

// Combo em vitrine (spec §6/§9): expandir o grupo principal NÃO some com os outros
// obrigatórios. Bebida e acompanhamento continuam na tela, continuam exigidos, e o
// subtotal só chega no mínimo prometido pelo card depois que o cliente escolhe os dois.
const G_BURGUER_COMBO = 800001;
const itemCombo = {
  id: 500001, nome: 'COMBO - TRADICIONAIS', preco: 15.9, status: 'ACTIVE', grupos: [
    {
      id: G_BURGUER_COMBO, nome: 'BURGUER DO COMBO', choiceType: 'SINGLE', min: 1, max: 1, status: 'ACTIVE',
      opcoes: [
        { id: 900001, nome: 'X BURGUER', preco: 12, status: 'ACTIVE', maxQuantidade: null },
        { id: 900002, nome: 'X BACON', preco: 14, status: 'ACTIVE', maxQuantidade: null },
      ],
    },
    {
      id: 800002, nome: 'BEBIDA DO COMBO', choiceType: 'SINGLE', min: 1, max: 1, status: 'ACTIVE',
      opcoes: [
        { id: 900010, nome: 'COCA LATA', preco: 0, status: 'ACTIVE', maxQuantidade: null },
        { id: 900011, nome: 'SUCO', preco: 3, status: 'ACTIVE', maxQuantidade: null },
      ],
    },
    {
      id: 800003, nome: 'ACOMPANHAMENTO', choiceType: 'SINGLE', min: 1, max: 1, status: 'ACTIVE',
      opcoes: [
        { id: 900020, nome: 'BATATA', preco: 0, status: 'ACTIVE', maxQuantidade: null },
        { id: 900021, nome: 'ONION RINGS', preco: 6, status: 'ACTIVE', maxQuantidade: null },
      ],
    },
  ],
};
const produtoComboXBurguer = {
  id: `opcao:${itemCombo.id}:${G_BURGUER_COMBO}:900001`, tipo: 'OPCAO_PRINCIPAL', nome: 'X BURGUER',
  descricao: null, imagem: null, preco: 27.9, precoMinimo: 27.9, precoEhAPartirDe: true,
  status: 'ACTIVE', ordenavel: true,
  origem: { itemId: itemCombo.id, grupoId: G_BURGUER_COMBO, opcaoId: 900001 }, grupoPrincipalId: G_BURGUER_COMBO,
};

test('combo em vitrine: os outros obrigatórios continuam visíveis e exigidos', () => {
  const indiceCombo = indicePorItemId([{ id: 1, itens: [itemCombo], produtos: [produtoComboXBurguer] }]);
  const linha = linhaDeProduto(produtoComboXBurguer, indiceCombo);
  // O principal saiu da tela (é a identidade do card); bebida e acompanhamento ficaram.
  assert.deepEqual(gruposRenderizaveis(linha).map((g) => g.nome), ['BEBIDA DO COMBO', 'ACOMPANHAMENTO']);
  assert.deepEqual(itemPronto(linha.item, linha.selecoes), { ok: false, gruposFaltando: [800002, 800003] });
  linha.selecoes['800002'] = [{ opcaoId: 900010, qtd: 1 }];
  assert.equal(itemPronto(linha.item, linha.selecoes).ok, false);
  linha.selecoes['800003'] = [{ opcaoId: 900020, qtd: 1 }];
  assert.equal(itemPronto(linha.item, linha.selecoes).ok, true);
  // Escolhendo o mais barato de cada obrigatório, o subtotal bate no "a partir de" do card.
  assert.equal(subtotalLocal(linha), 27.9);
  assert.equal(precoDoCard(produtoComboXBurguer).valor, 27.9);
  // Trocando por opções mais caras, o subtotal sobe — que é o motivo do "a partir de".
  linha.selecoes['800003'] = [{ opcaoId: 900021, qtd: 1 }];
  assert.equal(subtotalLocal(linha), 33.9);
});
