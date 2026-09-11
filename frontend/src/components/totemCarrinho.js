// Regras do carrinho do totem — módulo PURO (sem React, sem rede), testado com
// node --test em totemCarrinho.test.js.
//
// Divisão de trabalho com o backend (spec §4.5/§5.2): quem PRECIFICA e quem decide o
// que pode ser vendido é o HUB, com o catálogo do CW na mão. O que vive aqui é só a
// regra de TELA: impedir que o cliente monte um item que o HUB vá recusar (min/max/
// max_quantity/SINGLE) e mostrar um subtotal de conferência. O corpo que sai daqui
// (montarCarrinho) não leva um único preço — se levasse, o preço viria do navegador.
//
// Formas de dado usadas por este módulo:
//   grupo    = { id, nome, choiceType:'SINGLE'|'MULTIPLE'|'SUMMABLE', min, max, status, opcoes:[opcao] }
//   opcao    = { id, nome, preco, status:'ACTIVE'|'MISSING', maxQuantidade }
//   selecao  = [{ opcaoId, qtd }]                 (o que o cliente escolheu NUM grupo)
//   selecoes = { [grupoId]: selecao }             (todos os grupos de um item)
//   linhaUI  = { item, qtd, observacao?, selecoes }  (uma linha do carrinho na tela)

const TIPOS = ['SINGLE', 'MULTIPLE', 'SUMMABLE'];

const num = (v, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const lista = (v) => (Array.isArray(v) ? v : []);
// Ids do catálogo chegam como número e viajam como string: comparar sempre em string.
const mesmoId = (a, b) => String(a) === String(b);
const soma = (selecao) => lista(selecao).reduce((s, e) => s + Math.max(1, Math.trunc(num(e?.qtd, 1))), 0);
const qtdDa = (selecao, opcaoId) => {
  const achou = lista(selecao).find((e) => mesmoId(e?.opcaoId, opcaoId));
  return achou ? Math.max(1, Math.trunc(num(achou.qtd, 1))) : 0;
};
// null/undefined = sem teto. 0 é teto de verdade (e é respeitado).
const teto = (v) => (v === null || v === undefined || v === '' ? null : num(v, null));

// Preço que vale AGORA. O HUB só manda `precoPromocional` quando a promoção está em
// vigor, então a tela não decide nada: se veio, é o preço. 0 é preço legítimo (brinde),
// por isso `??` e não `||`.
export function precoEmVigor(item) {
  const promo = item?.precoPromocional;
  if (promo === null || promo === undefined) return round2(num(item?.preco));
  return round2(num(promo));
}

// Cabe mais uma unidade desta opção? Devolve { ok } ou { ok:false, motivo }.
// SINGLE devolve `substitui:true`: quem chama troca a escolha em vez de somar.
export function podeAdicionarOpcao(grupo, selecao, opcao) {
  const tipo = String(grupo?.choiceType ?? '');
  if (!TIPOS.includes(tipo)) return { ok: false, motivo: 'TIPO_NAO_SUPORTADO' };
  // MISSING vem do CW marcado, não escondido: a tela mostra a opção apagada e recusa o toque.
  if (opcao?.status && opcao.status !== 'ACTIVE') return { ok: false, motivo: 'OPCAO_EM_FALTA' };

  if (tipo === 'SINGLE') return { ok: true, substitui: true };

  const maxGrupo = teto(grupo?.max);
  const atual = soma(selecao);

  if (tipo === 'MULTIPLE') {
    if (qtdDa(selecao, opcao?.id) > 0) return { ok: false, motivo: 'JA_ESCOLHIDA' };
    if (maxGrupo !== null && atual + 1 > maxGrupo) return { ok: false, motivo: 'GRUPO_LIMITE' };
    return { ok: true };
  }

  // SUMMABLE: dois tetos independentes — o da própria opção (max_quantity) e o do grupo.
  const maxOpcao = teto(opcao?.maxQuantidade);
  if (maxOpcao !== null && qtdDa(selecao, opcao?.id) + 1 > maxOpcao) return { ok: false, motivo: 'OPCAO_LIMITE' };
  if (maxGrupo !== null && atual + 1 > maxGrupo) return { ok: false, motivo: 'GRUPO_LIMITE' };
  return { ok: true };
}

// O mínimo do grupo foi atendido? (Σ das quantidades ≥ min; min ausente = 0.)
export function grupoSatisfeito(grupo, selecao) {
  return soma(selecao) >= num(grupo?.min, 0);
}

// O item pode ir para o carrinho? Só os grupos ACTIVE contam — o HUB ignora os outros
// (`validarLinha`), e travar o botão por um grupo que o servidor nem olha deixaria o
// item impossível de pedir.
export function itemPronto(item, selecoes) {
  const gruposFaltando = [];
  for (const g of lista(item?.grupos)) {
    if (g?.status && g.status !== 'ACTIVE') continue;
    if (num(g?.min, 0) <= 0) continue;
    if (!grupoSatisfeito(g, selecoes?.[g?.id])) gruposFaltando.push(g?.id);
  }
  return { ok: gruposFaltando.length === 0, gruposFaltando };
}

// Subtotal da linha — SÓ EXIBIÇÃO (a tela rotula "a confirmar na revisão"). A conta é a
// mesma do HUB (`(unitPrice + Σ opções×qtd) × qtd`) para que uma divergência signifique
// preço mudado no CW, e não aritmética diferente.
export function subtotalLocal(linha) {
  const item = linha?.item;
  const qtd = Math.max(1, Math.trunc(num(linha?.qtd, 1)));
  let unitario = precoEmVigor(item);
  for (const g of lista(item?.grupos)) {
    for (const e of lista(linha?.selecoes?.[g?.id])) {
      const op = lista(g?.opcoes).find((o) => mesmoId(o?.id, e?.opcaoId));
      if (!op) continue; // opção que saiu do catálogo: some da conta (o HUB recusaria na cotação)
      unitario += num(op.preco) * Math.max(1, Math.trunc(num(e?.qtd, 1)));
    }
  }
  return round2(unitario * qtd);
}

// Carrinho no formato do contrato (§5.2). Ids em string, quantidades inteiras, e NENHUM
// preço: o corpo que o aparelho manda descreve o que o cliente quer, nunca quanto custa.
export function montarCarrinho(linhasUI) {
  return lista(linhasUI).map((linha) => {
    const grupos = [];
    for (const g of lista(linha?.item?.grupos)) {
      const opcoes = lista(linha?.selecoes?.[g?.id])
        .filter((e) => e?.opcaoId !== null && e?.opcaoId !== undefined)
        .map((e) => ({ opcaoId: String(e.opcaoId), qtd: Math.max(1, Math.trunc(num(e.qtd, 1))) }));
      if (opcoes.length) grupos.push({ grupoId: String(g.id), opcoes });
    }
    const out = {
      itemId: String(linha?.item?.id),
      qtd: Math.max(1, Math.trunc(num(linha?.qtd, 1))),
      grupos,
    };
    const obs = String(linha?.observacao ?? '').trim();
    if (obs) out.observacao = obs;
    return out;
  });
}

// Um centavo de diferença é diferença; 0,001 de arredondamento não é.
const difere = (a, b) => Math.abs(num(a) - num(b)) > 0.005;

// Compara o que o carrinho MOSTRAVA com o que o HUB cotou, para a tela de Revisar poder
// dizer "Preços atualizados" e marcar as linhas que mudaram (spec §5.6).
// O `unitPrice` do HUB é só o item (as opções vêm separadas), então a comparação é pelo
// `totalPrice` da linha: assim o preço de uma OPÇÃO que subiu também aparece.
// O HUB devolve as linhas na ordem do carrinho; casamos por índice e, se o id do índice
// não bater (linha recusada, ordem diferente), caímos para o casamento por itemId.
export function diffCotacao(linhasUI, linhasHub, totalLocal, totalHub) {
  const ui = lista(linhasUI);
  const hub = lista(linhasHub);
  const alteradas = [];
  const marcar = (id) => { if (id != null && !alteradas.includes(String(id))) alteradas.push(String(id)); };
  const usados = new Set();

  ui.forEach((linha, i) => {
    const itemId = linha?.item?.id;
    let par = null;
    if (hub[i] && mesmoId(hub[i]?.itemId, itemId) && !usados.has(i)) { par = hub[i]; usados.add(i); }
    else {
      const j = hub.findIndex((h, k) => !usados.has(k) && mesmoId(h?.itemId, itemId));
      if (j >= 0) { par = hub[j]; usados.add(j); }
    }
    // Sem par no retorno do HUB a linha não foi cotada: para o cliente, ela mudou.
    if (!par) { marcar(itemId); return; }
    if (difere(subtotalLocal(linha), par.totalPrice)) marcar(itemId);
  });

  return { alteradas, totalMudou: difere(totalLocal, totalHub) };
}

// Chave de idempotência de UMA confirmação (o backend exige /^[A-Za-z0-9_-]{8,64}$/).
// Gerada uma vez por tentativa de confirmar e reenviada igual num retry manual: é ela
// que impede que dois toques no botão criem dois pedidos no CW.
export function chaveNova() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* tablet antigo / contexto inseguro: cai no sorteio abaixo */ }
  const ALFA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let bytes = null;
  try {
    if (typeof globalThis.crypto?.getRandomValues === 'function') bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  } catch { bytes = null; }
  let s = '';
  for (let i = 0; i < 32; i++) {
    const n = bytes ? bytes[i] : Math.floor(Math.random() * 256);
    s += ALFA[n % ALFA.length];
  }
  return s;
}

// Código do contrato (§7) → frase que o CLIENTE entende. Nenhum código cru, nenhuma
// sigla de servidor: quem está no totem não sabe o que é HUB nem CW, e um erro de
// integração para ele é sempre "fale com o balcão".
const MENSAGENS = {
  // Aparelho / pareamento
  APARELHO_NAO_PAREADO: 'Este aparelho não está mais conectado à loja. Chame um atendente.',
  APARELHO_NAO_E_TOTEM: 'Este aparelho não faz pedidos. Chame um atendente.',
  CODIGO_INVALIDO: 'Código inválido ou expirado. Peça um novo código no balcão.',
  MUITAS_TENTATIVAS: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.',
  // Loja e modo
  LOJA_INATIVA: 'A loja não está atendendo pelo totem agora. Chame um atendente.',
  LOJA_FECHADA: 'A loja está fechada neste momento. Chame um atendente.',
  MODO_INDISPONIVEL: 'Esta forma de retirada não está disponível agora. Escolha a outra ou chame um atendente.',
  // Carrinho
  CARRINHO_VAZIO: 'Seu carrinho está vazio. Escolha pelo menos um item.',
  CARRINHO_GRANDE: 'São muitos itens para um só pedido. Faça em dois pedidos ou chame um atendente.',
  QTD_INVALIDA: 'A quantidade de um dos itens não é válida. Ajuste e tente de novo.',
  // Item
  ITEM_INDISPONIVEL: 'Um item do seu carrinho não está mais disponível. Remova para continuar.',
  ITEM_EM_FALTA: 'Um item do seu carrinho acabou. Remova para continuar.',
  ITEM_FORA_DE_HORARIO: 'Um item do seu carrinho não é servido neste horário. Remova para continuar.',
  ITEM_NAO_SUPORTADO: 'Um item do seu carrinho não pode ser pedido no totem. Chame um atendente.',
  ESTOQUE_INSUFICIENTE: 'Não temos essa quantidade em estoque. Diminua a quantidade e tente de novo.',
  // Grupos e opções
  GRUPO_OBRIGATORIO: 'Falta escolher uma opção obrigatória de um item.',
  GRUPO_LIMITE: 'As opções escolhidas passam do limite permitido para esse item.',
  GRUPO_CALCULO_NAO_SUPORTADO: 'Este item não pode ser montado no totem. Chame um atendente.',
  OPCAO_INDISPONIVEL: 'Uma das opções escolhidas não está mais disponível. Escolha outra.',
  OPCAO_EM_FALTA: 'Uma das opções escolhidas acabou. Escolha outra.',
  // Pagamento e cotação
  PAGAMENTO_INVALIDO: 'Essa forma de pagamento não está mais disponível. Escolha outra.',
  COTACAO_INVALIDA: 'Não foi possível fechar o valor do seu pedido. Confira os itens do carrinho.',
  COTACAO_DIVERGENTE: 'Os preços mudaram enquanto você escolhia. Confira o novo valor antes de confirmar.',
  COTACAO_EXPIRADA: 'Seu pedido ficou parado e o valor precisa ser recalculado. Confira e confirme de novo.',
  // Integração (para o cliente, é sempre "tente de novo" ou "chame o balcão")
  CW_RECUSOU: 'O sistema da loja não aceitou este pedido. Chame um atendente.',
  CW_RATE_LIMIT: 'Muitos pedidos ao mesmo tempo. Aguarde alguns segundos e tente de novo.',
  CW_INDISPONIVEL: 'Sem conexão com o sistema da loja. Tente de novo em instantes.',
  HUB_INDISPONIVEL: 'Sem conexão com o sistema. Tente de novo em instantes.',
  HUB_NAO_CONFIGURADO: 'Este totem ainda não está liberado para pedidos. Chame um atendente.',
  HUB_SEM_PARTNER_KEY: 'Este totem ainda não está liberado para pedidos. Chame um atendente.',
  HUB_CONFIG_INVALIDA: 'Este totem ainda não está liberado para pedidos. Chame um atendente.',
  CATALOGO_INDISPONIVEL: 'O menu não pôde ser carregado agora. Tente de novo em instantes.',
  CLIENTE_SEM_CW: 'Este totem ainda não está ligado ao cardápio da loja. Chame um atendente.',
  CORPO_INVALIDO: 'Não foi possível enviar o pedido. Recomece o pedido, por favor.',
  PEDIDO_NAO_ENCONTRADO: 'Não encontramos este pedido. Chame um atendente.',
  ERRO_INTERNO: 'Algo deu errado por aqui. Tente de novo em instantes.',
};

const GENERICA = 'Algo deu errado por aqui. Tente de novo ou chame um atendente.';

export function mensagemErro(codigo) {
  return MENSAGENS[String(codigo ?? '')] ?? GENERICA;
}
