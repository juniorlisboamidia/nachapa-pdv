// Apresentação do totem — projeção pura do catálogo do CW (spec §4.1/§5/§7).
//
// O CW modela "TRADICIONAIS 🍔" como um item base a R$ 0,00 com um grupo obrigatório de
// escolha única cujas opções são os produtos reais (X BURGUER, DELICIA…). No totem o
// cliente precisa ver CADA OPÇÃO como um produto. Este módulo faz essa tradução — e só
// isso: sem Prisma, sem Express, sem rede, sem relógio. A entrada nunca é mutada.
//
// Duas regras mandam em tudo aqui:
//  · A FONTE DE VERDADE CONTINUA NO CW. O produto apresentado é uma projeção do catálogo
//    vivo a cada bootstrap; nada dele é persistido. Só a ESCOLHA da loja (item X é
//    EXPANDIDO pelo grupo Y) mora no banco, e ela é revalidada a cada projeção.
//  · O CATÁLOGO PÚBLICO NUNCA QUEBRA. Configuração que deixou de valer (grupo removido,
//    grupo virou 2–2, apareceu outro obrigatório, item saiu do cardápio) cai para NORMAL
//    com aviso — nunca some da vitrine, nunca lança.
//
// Vínculo SEMPRE por id do CW, jamais por nome: no cardápio real "X BURGUER" existe com
// quatro ids diferentes (um por grupo/promoção) e "TRADICIONAIS 🍔" é o nome de dois itens
// distintos. Comparar por nome trocaria o produto do cliente por outro.

export const MODOS = ['NORMAL', 'EXPANDIDO'];

const arranjo = (v) => (Array.isArray(v) ? v : []);
const objeto = (v) => (v && typeof v === 'object' ? v : {});
// Ids vêm number do bootstrap e podem chegar string do banco/corpo: compara como texto.
const mesmoId = (a, b) => a != null && b != null && String(a) === String(b);
const numero = (v, padrao) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : padrao);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// `max: null` no bootstrap significa SEM TETO — não pode virar 1 por acidente de Number().
const tetoDoGrupo = (g) => (objeto(g).max === null || objeto(g).max === undefined ? null : numero(objeto(g).max, NaN));
// Só `{ ok, codigo? }`: o admin recebe o veredito, não o grupo inteiro.
const resumo = (r) => (r.ok ? { ok: true } : { ok: false, codigo: r.codigo });

// Um grupo pode ser o principal? Olha SÓ o grupo (o item inteiro é `validarConfiguracao`).
// `min 1 e max 1` INDEPENDE de `choiceType`: no cardápio real "ESCOLHA SEU FAVORITO" é
// SUMMABLE 1–1 e é escolha única de verdade — recusá-la por causa do rótulo deixaria de
// fora um caso legítimo. Grupo MISSING não serve de principal: seus produtos nasceriam
// todos em falta. Sem opção visível também não: expandir daria zero produtos e o item
// sumiria da vitrine.
export function grupoElegivel(grupo) {
  const g = objeto(grupo);
  if (g.status !== 'ACTIVE') return { ok: false, codigo: 'GRUPO_INDISPONIVEL' };
  if (!(numero(g.min, 0) === 1 && tetoDoGrupo(g) === 1)) return { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' };
  if (arranjo(g.opcoes).length === 0) return { ok: false, codigo: 'GRUPO_SEM_OPCOES' };
  return { ok: true };
}

// Um grupo obrigatório que NÃO é o principal impede a expansão: o card do totem seria uma
// mentira (o cliente escolheria "X BURGUER" e ainda teria de escolher bebida e
// acompanhamento). É o que barra COMBO - TRADICIONAIS, cujo "BURGUER DO COMBO" é 1–1 e
// passa em `grupoElegivel` sozinho.
// ⚠️ MISSING com `min ≥ 1` TAMBÉM conta como obrigatório: o grupo continua visível e
// exigido no CW (só está em falta agora, e volta a qualquer momento). Ignorá-lo faria a
// configuração alternar entre válida e inválida ao sabor do estoque.
const obrigatorio = (g) => (objeto(g).status === 'ACTIVE' || objeto(g).status === 'MISSING') && numero(objeto(g).min, 0) >= 1;

// A ÚNICA regra de "pode ser principal" (spec §4.1, ajuste 4): o bootstrap usa para
// projetar, o admin usa para habilitar o select (`selecionavel`) e o PUT usa para aceitar.
// Ordem dos códigos é contrato: modo → item → grupo → elegibilidade → outro obrigatório.
// NORMAL é modo válido e não olha o catálogo (é o que permite apagar uma órfã).
export function validarConfiguracao(config, item) {
  const c = objeto(config);
  if (!MODOS.includes(c.modo)) return { ok: false, codigo: 'MODO_INVALIDO' };
  if (c.modo === 'NORMAL') return { ok: true, grupo: null };
  if (item === null || item === undefined) return { ok: false, codigo: 'ITEM_AUSENTE' };
  const grupos = arranjo(objeto(item).grupos);
  const grupo = grupos.find((g) => mesmoId(objeto(g).id, c.cwGrupoPrincipalId));
  if (!grupo) return { ok: false, codigo: 'GRUPO_AUSENTE' };
  const elegivel = grupoElegivel(grupo);
  if (!elegivel.ok) return elegivel;
  for (const outro of grupos) {
    if (mesmoId(objeto(outro).id, c.cwGrupoPrincipalId)) continue;
    if (obrigatorio(outro)) return { ok: false, codigo: 'OUTRO_GRUPO_OBRIGATORIO' };
  }
  return { ok: true, grupo };
}

// Espelha `itemOrdenavel` do frontend (frontend/src/components/totemCarrinho.js): o produto
// apresentado herda a ordenabilidade do ITEM BASE, porque é o item base que vai ao CW.
// Uma opção ACTIVE de um item com outro grupo obrigatório em falta não pode ser pedida.
export function ordenavelDoItem(item) {
  const it = objeto(item);
  if (it.status && it.status !== 'ACTIVE') return { ok: false, motivo: 'ITEM_EM_FALTA' };
  for (const g of arranjo(it.grupos)) {
    if (objeto(g).status === 'MISSING' && numero(objeto(g).min, 0) >= 1) return { ok: false, motivo: 'GRUPO_EM_FALTA' };
  }
  return { ok: true };
}

// Produto = card do totem (spec §5). LEVE de propósito (ajuste 1): NÃO carrega o item
// completo — o frontend indexa `categorias[].itens` por `origem.itemId` e resolve na hora
// de abrir. Duplicar a árvore técnica por opção multiplicaria o bootstrap por nove.
export function projetarProduto(item, grupo, opcao) {
  const it = objeto(item);
  const g = objeto(grupo);
  const op = objeto(opcao);
  const ordem = ordenavelDoItem(it);
  return {
    id: `opcao:${it.id}:${g.id}:${op.id}`,
    tipo: 'OPCAO_PRINCIPAL',
    nome: op.nome ?? null,
    // Identidade apresentada é a da OPÇÃO; imagem/descrição caem para a do item quando a
    // opção não tem (é o caso de "HMB DOG") e para `null` quando nem o item tem.
    descricao: op.descricao ?? it.descricao ?? null,
    imagem: op.imagem ?? it.imagem ?? null,
    preco: round2(numero(it.preco, 0) + numero(op.preco, 0)),
    // A promoção é do ITEM BASE (o CW não promove opção): a opção soma por cima dela.
    ...(typeof it.precoPromocional === 'number' ? { precoPromocional: round2(it.precoPromocional + numero(op.preco, 0)) } : {}),
    // Item em falta derruba TODOS os produtos dele, mesmo os de opção ACTIVE.
    status: it.status === 'MISSING' ? 'MISSING' : op.status,
    ordenavel: ordem.ok,
    ...(ordem.ok ? {} : { motivo: ordem.motivo }),
    origem: { itemId: it.id, grupoId: g.id, opcaoId: op.id },
    grupoPrincipalId: g.id,
  };
}

// Produto do item sem expansão (modo NORMAL) — o card de hoje, só com o contrato novo.
export function produtoDeItem(item) {
  const it = objeto(item);
  const ordem = ordenavelDoItem(it);
  return {
    id: `item:${it.id}`,
    tipo: 'ITEM',
    nome: it.nome ?? null,
    descricao: it.descricao ?? null,
    imagem: it.imagem ?? null,
    preco: round2(numero(it.preco, 0)),
    ...(typeof it.precoPromocional === 'number' ? { precoPromocional: round2(it.precoPromocional) } : {}),
    status: it.status,
    ordenavel: ordem.ok,
    ...(ordem.ok ? {} : { motivo: ordem.motivo }),
    origem: { itemId: it.id },
  };
}

// Configurações indexadas por `String(cwItemId)` — o banco devolve Int, o bootstrap devolve
// Number, e um dia algum caminho devolve string; a chave é sempre texto.
function porItemId(configuracoes) {
  const mapa = new Map();
  for (const bruta of arranjo(configuracoes)) {
    const cfg = objeto(bruta);
    if (cfg.cwItemId === null || cfg.cwItemId === undefined) continue;
    mapa.set(String(cfg.cwItemId), cfg);
  }
  return mapa;
}

// Bootstrap + configurações → mesmo bootstrap com `produtos` em cada categoria (aditivo:
// `itens` continua igual e é o que o frontend indexa). A ORDEM É SAGRADA e vem pronta do
// HUB (`index` do CW): nada aqui ordena nada — categorias, itens e opções saem na ordem em
// que chegaram, senão a vitrine muda de arrumação sem ninguém pedir.
export function projetarCatalogo(catalogo, configuracoes) {
  const raiz = objeto(catalogo);
  const configs = porItemId(configuracoes);
  const noCatalogo = new Set();
  const avisos = [];
  // Um aviso por CONFIG, não por ocorrência: o mesmo item pode estar em duas categorias e
  // o admin veria o mesmo defeito em dobro.
  const avisado = new Set();

  const categorias = arranjo(raiz.categorias).map((bruta) => {
    const categoria = objeto(bruta);
    const produtos = [];
    for (const cru of arranjo(categoria.itens)) {
      const item = objeto(cru);
      const chave = String(item.id);
      noCatalogo.add(chave);
      const cfg = configs.get(chave);
      if (!cfg) { produtos.push(produtoDeItem(item)); continue; }
      const veredito = validarConfiguracao(cfg, item);
      if (!veredito.ok) {
        // Fallback seguro (spec §7): item volta a NORMAL na vitrine e o defeito vira aviso.
        if (!avisado.has(chave)) { avisado.add(chave); avisos.push({ cwItemId: cfg.cwItemId, codigo: veredito.codigo }); }
        produtos.push(produtoDeItem(item));
        continue;
      }
      // Hoje a tabela só guarda EXPANDIDO, mas um NORMAL persistido não pode explodir aqui.
      if (!veredito.grupo) { produtos.push(produtoDeItem(item)); continue; }
      for (const opcao of arranjo(objeto(veredito.grupo).opcoes)) produtos.push(projetarProduto(item, veredito.grupo, opcao));
    }
    // Cópia rasa da categoria + `produtos` novo. `itens` segue por REFERÊNCIA de propósito
    // (ninguém aqui escreve nele) — clonar o catálogo inteiro a cada bootstrap seria caro à
    // toa. A entrada não é mutada em nenhum caminho.
    return { ...categoria, produtos };
  });

  // Config cujo item sumiu do bootstrap: vira aviso e, no admin, ÓRFÃ removível.
  for (const [chave, cfg] of configs) {
    if (!noCatalogo.has(chave)) avisos.push({ cwItemId: cfg.cwItemId, codigo: 'ITEM_AUSENTE' });
  }

  return { catalogo: { ...raiz, categorias }, avisos };
}

// Heurística de SUGESTÃO (spec §4.1, ajuste 3) — nunca ativa nada, só preenche o formulário
// do admin. Regra: preço base 0 + exatamente UM grupo visível obrigatório + esse grupo 1–1,
// sem olhar `choiceType` nem `index`. No cardápio real de 2026-09-11 sugere TRADICIONAIS 🍔,
// ARTESANAIS 🍔, NOSSOS DOGS 🌭 e ESCOLHA SEU ACOMPANHAMENTO 🍟; deixa de fora os COMBOS
// (três obrigatórios), QUINTA DA BATATA (2–2) e itens com preço próprio.
export function sugerirCandidatos(catalogo) {
  const sugeridos = new Set();
  const saida = [];
  for (const bruta of arranjo(objeto(catalogo).categorias)) {
    const categoria = objeto(bruta);
    for (const cru of arranjo(categoria.itens)) {
      const item = objeto(cru);
      const chave = String(item.id);
      if (sugeridos.has(chave)) continue; // mesmo item em duas categorias: vale a primeira
      if (numero(item.preco, NaN) !== 0) continue; // preço próprio = produto de verdade, não vitrine
      const obrigatorios = arranjo(item.grupos).filter((g) => objeto(g).status === 'ACTIVE' && numero(objeto(g).min, 0) >= 1);
      if (obrigatorios.length !== 1) continue;
      const grupo = objeto(obrigatorios[0]);
      if (!(numero(grupo.min, 0) === 1 && tetoDoGrupo(grupo) === 1)) continue;
      // A palavra final é da regra oficial: sugerir algo que o PUT recusaria seria cruel.
      if (!validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: grupo.id }, item).ok) continue;
      sugeridos.add(chave);
      saida.push({
        cwItemId: item.id,
        nome: item.nome ?? null,
        categoria: categoria.nome ?? null,
        cwGrupoPrincipalId: grupo.id,
        grupoNome: grupo.nome ?? null,
      });
    }
  }
  return saida;
}

// Lista do GET admin (spec §4.3, ajuste 2): catálogo vivo + configurações persistidas.
// `elegivel` olha só o grupo e `selecionavel` olha o item inteiro — é a diferença que faz
// o combo mostrar o grupo 1–1 na lista com o select desabilitado e o motivo à vista.
export function mesclarAdmin(catalogo, configuracoes) {
  const configs = porItemId(configuracoes);
  const vistos = new Set();
  const itens = [];

  for (const bruta of arranjo(objeto(catalogo).categorias)) {
    const categoria = objeto(bruta);
    for (const cru of arranjo(categoria.itens)) {
      const item = objeto(cru);
      const chave = String(item.id);
      if (vistos.has(chave)) continue; // uma linha por item; vale a primeira categoria
      vistos.add(chave);
      const cfg = configs.get(chave) || null;
      itens.push({
        cwItemId: item.id,
        nome: item.nome ?? null,
        categoria: categoria.nome ?? null,
        precoBase: round2(numero(item.preco, 0)),
        config: cfg ? { id: cfg.id, modo: cfg.modo, cwGrupoPrincipalId: cfg.cwGrupoPrincipalId } : null,
        validacao: cfg ? resumo(validarConfiguracao(cfg, item)) : { ok: true },
        grupos: arranjo(item.grupos).map((bruto) => {
          const g = objeto(bruto);
          return {
            id: g.id,
            nome: g.nome ?? null,
            min: numero(g.min, 0),
            max: tetoDoGrupo(g),
            choiceType: g.choiceType ?? null,
            nOpcoes: arranjo(g.opcoes).length,
            elegivel: resumo(grupoElegivel(g)),
            selecionavel: resumo(validarConfiguracao({ modo: 'EXPANDIDO', cwGrupoPrincipalId: g.id }, item)),
          };
        }),
      });
    }
  }

  const orfas = [];
  for (const [chave, cfg] of configs) {
    if (vistos.has(chave)) continue;
    orfas.push({
      id: cfg.id,
      cwItemId: cfg.cwItemId,
      modo: cfg.modo,
      cwGrupoPrincipalId: cfg.cwGrupoPrincipalId,
      validacao: { ok: false, codigo: 'ITEM_AUSENTE' },
    });
  }

  return { itens, orfas };
}
