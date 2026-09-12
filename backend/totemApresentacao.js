// Apresentação do totem — projeção pura do catálogo do CW (spec §4.1/§5/§7, rev. 3).
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
//    grupo virou 2–2, grupo ficou com uma opção só, item saiu do cardápio) cai para NORMAL
//    com aviso — nunca some da vitrine, nunca lança.
//
// Vínculo SEMPRE por id do CW, jamais por nome: no cardápio real "X BURGUER" existe com
// quatro ids diferentes (um por grupo/promoção) e "TRADICIONAIS 🍔" é o nome de dois itens
// distintos. Comparar por nome trocaria o produto do cliente por outro.
//
// PRICING NÃO MORA AQUI (rev. 3). Quem sabe quanto custa a escolha mais barata de um grupo é o
// HUB (`resumoPrecoDoGrupo`, spec §3), que manda por grupo `custoMinimo`, `custoMaximo` e
// `precoVariavel` no bootstrap. O PDV só SOMA esses números. Uma segunda régua de preço aqui
// divergiria da cotação do CW no primeiro grupo esquisito — e o cliente veria um valor no card
// e outro no carrinho.

export const MODOS = ['NORMAL', 'EXPANDIDO'];

// Frase humana por código, para o admin (spec §8): a tela mostra a frase e o código discreto ao
// lado, nunca o código sozinho. Minúscula e sem ponto final porque entra emendada na sentença.
// ⚠️ O frontend tem o seu espelho (`frontend/src/pages/TotemApresentacao.jsx`, task B3): este
// módulo é backend puro e não é importado pela tela; mudou aqui, muda lá.
export const MENSAGENS_ADMIN = {
  MODO_INVALIDO: 'modo inválido',
  ITEM_AUSENTE: 'este item não está mais no cardápio do balcão',
  GRUPO_AUSENTE: 'o grupo escolhido não existe mais neste item',
  GRUPO_NAO_E_ESCOLHA_UNICA: 'o grupo passou a aceitar mais de uma escolha',
  GRUPO_SEM_OPCOES: 'o grupo ficou sem opções',
  GRUPO_COM_UMA_OPCAO: 'o grupo tem uma opção só',
  GRUPO_INDISPONIVEL: 'o grupo está oculto no cardápio',
};

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

// APRESENTÁVEL = vira card. MISSING entra (card "Em falta", que volta sozinho quando a loja
// repõe); INACTIVE não, porque o CW nem a oferece. Exigir duas ACTIVE desmontaria a vitrine no
// meio do expediente por causa de estoque.
const apresentavel = (op) => objeto(op).status === 'ACTIVE' || objeto(op).status === 'MISSING';
const opcoesApresentaveis = (g) => arranjo(objeto(g).opcoes).filter(apresentavel);

// Um grupo pode ser o principal? Olha SÓ o grupo (o item inteiro é `validarConfiguracao`).
// `min 1 e max 1` INDEPENDE de `choiceType`: no cardápio real "ESCOLHA SEU FAVORITO" é
// SUMMABLE 1–1 e é escolha única de verdade — recusá-la por causa do rótulo deixaria de
// fora um caso legítimo. Grupo MISSING não serve de principal: seus produtos nasceriam
// todos em falta. Sem opção apresentável também não: expandir daria zero produtos e o item
// sumiria da vitrine. E com UMA opção só (rev. 3, "PEGUE SUA BATATA 🍟" da QUINTA) a vitrine
// seria um card só — o mesmo produto com outro nome, e a jornada continuaria no detalhe.
// A ordem dos códigos é contrato: é o que o admin mostra à loja como "o que resolver".
export function grupoElegivel(grupo) {
  const g = objeto(grupo);
  if (g.status !== 'ACTIVE') return { ok: false, codigo: 'GRUPO_INDISPONIVEL' };
  if (!(numero(g.min, 0) === 1 && tetoDoGrupo(g) === 1)) return { ok: false, codigo: 'GRUPO_NAO_E_ESCOLHA_UNICA' };
  const apresentaveis = opcoesApresentaveis(g);
  if (apresentaveis.length === 0) return { ok: false, codigo: 'GRUPO_SEM_OPCOES' };
  if (apresentaveis.length === 1) return { ok: false, codigo: 'GRUPO_COM_UMA_OPCAO' };
  return { ok: true };
}

// Grupo que o cliente É OBRIGADO a resolver, e que continua visível na tela.
// ⚠️ MISSING com `min ≥ 1` TAMBÉM conta: o grupo continua exigido no CW (só está em falta
// agora, e volta a qualquer momento). Ignorá-lo faria a conta do card piscar com o estoque.
const obrigatorio = (g) => (objeto(g).status === 'ACTIVE' || objeto(g).status === 'MISSING') && numero(objeto(g).min, 0) >= 1;

// A ÚNICA regra de "pode ser principal" (spec §4.1, rev. 3): o bootstrap usa para projetar, o
// admin usa para habilitar o select (`selecionavel`) e o PUT usa para aceitar.
// Ordem dos códigos é contrato: modo → item → grupo → elegibilidade.
// NORMAL é modo válido e não olha o catálogo (é o que permite apagar uma órfã).
// ⚠️ Rev. 3 APAGOU `OUTRO_GRUPO_OBRIGATORIO`. A rev. 2 recusava o combo porque bebida e
// acompanhamento também eram obrigatórios — e isso estava errado: num combo o burguer é a
// IDENTIDADE (o que vira card) e as outras escolhas são etapas legítimas da jornada, que
// seguem visíveis no detalhe. O que o card faz é mostrar o preço mínimo da jornada inteira.
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
  return { ok: true, grupo };
}

// Espelha `itemOrdenavel` do frontend (frontend/src/components/totemCarrinho.js): o produto
// apresentado herda a ordenabilidade do ITEM BASE, porque é o item base que vai ao CW.
// Uma opção ACTIVE de um item com outro grupo obrigatório em falta não pode ser pedida.
// (O caso "obrigatório sem seleção válida" é da projeção, logo abaixo — aqui só o que a tela
// também sabe olhar, senão o card diria uma coisa e o detalhe outra.)
export function ordenavelDoItem(item) {
  const it = objeto(item);
  if (it.status && it.status !== 'ACTIVE') return { ok: false, motivo: 'ITEM_EM_FALTA' };
  for (const g of arranjo(it.grupos)) {
    if (objeto(g).status === 'MISSING' && numero(objeto(g).min, 0) >= 1) return { ok: false, motivo: 'GRUPO_EM_FALTA' };
  }
  return { ok: true };
}

// Os grupos obrigatórios que SOBRAM depois do principal, na ordem do CW — a jornada que o
// cliente ainda vai percorrer no detalhe. Passe `null` como principal (modo NORMAL) para ter
// todos os obrigatórios do item.
export function obrigatoriosRestantes(item, grupoPrincipalId) {
  return arranjo(objeto(item).grupos).filter((g) => obrigatorio(g) && !mesmoId(objeto(g).id, grupoPrincipalId));
}

// Soma o piso da jornada obrigatória a partir do que o HUB mandou. NÃO calcula preço nenhum:
// só soma `custoMinimo`. Três estados por grupo, e os três importam:
//  · número  → entra na soma; `precoVariavel` liga o "a partir de".
//  · null    → o HUB não achou seleção válida (grupo obrigatório sem opção escolhível): não dá
//              para prometer preço nem deixar pedir → `precoMinimo: null` e produto não ordenável.
//  · ausente → bootstrap ANTIGO (spec §10, HUB ainda sem a rev. 3). DESCONHECIDO não é zero:
//              contribui 0, não liga o "a partir de" e NUNCA derruba a ordenabilidade — o card
//              volta ao comportamento da rev. 2 em vez de mentir "R$ 0,00" ou "Indisponível".
function jornadaObrigatoria(grupos) {
  let soma = 0;
  let semSelecao = false;
  let variavel = false;
  for (const bruto of grupos) {
    const g = objeto(bruto);
    if (g.custoMinimo === undefined) continue;
    if (g.custoMinimo === null) { semSelecao = true; continue; }
    soma += numero(g.custoMinimo, 0);
    if (g.precoVariavel === true) variavel = true;
  }
  return { soma, semSelecao, variavel };
}

// Produto = card do totem (spec §5). LEVE de propósito (ajuste 1): NÃO carrega o item
// completo — o frontend indexa `categorias[].itens` por `origem.itemId` e resolve na hora
// de abrir. Duplicar a árvore técnica por opção multiplicaria o bootstrap por nove.
//
// Dois preços, e a diferença é o coração da rev. 3:
//  · `preco` é a IDENTIDADE (base + opção principal) — é o que o cliente já escolheu.
//  · `precoMinimo` é o que ele vai pagar NO MÍNIMO ao terminar a jornada obrigatória. É esse
//    que o card mostra, com "a partir de" quando alguma etapa restante pode mudar o valor.
export function projetarProduto(item, grupo, opcao) {
  const it = objeto(item);
  const g = objeto(grupo);
  const op = objeto(opcao);
  // Sem grupo principal (ou grupo sem `id`) NÃO HÁ o que projetar: sem id para excluir, o
  // próprio principal entraria em `obrigatoriosRestantes` e o card somaria o mínimo dele DUAS
  // vezes — um preço a mais no vidro do totem, que é o pior defeito possível aqui. Cai para o
  // card de item normal, o mesmo fallback do §7: nunca lança e nunca mente o preço.
  if (g.id === null || g.id === undefined) return produtoDeItem(it);
  const jornada = jornadaObrigatoria(obrigatoriosRestantes(it, g.id));
  const base = ordenavelDoItem(it);
  // Sem seleção válida num obrigatório restante o produto cai — mas o item em falta ganha,
  // que é o motivo mais alto na cadeia (e o que a loja tem de resolver primeiro).
  const ordem = base.ok && jornada.semSelecao ? { ok: false, motivo: 'GRUPO_EM_FALTA' } : base;
  const preco = round2(numero(it.preco, 0) + numero(op.preco, 0));
  const temPromo = typeof it.precoPromocional === 'number';
  const precoPromocional = temPromo ? round2(it.precoPromocional + numero(op.preco, 0)) : null;
  return {
    id: `opcao:${it.id}:${g.id}:${op.id}`,
    tipo: 'OPCAO_PRINCIPAL',
    nome: op.nome ?? null,
    // Identidade apresentada é a da OPÇÃO; imagem/descrição caem para a do item quando a
    // opção não tem (é o caso de "HMB DOG") e para `null` quando nem o item tem.
    descricao: op.descricao ?? it.descricao ?? null,
    imagem: op.imagem ?? it.imagem ?? null,
    preco,
    // A promoção é do ITEM BASE (o CW não promove opção): a opção soma por cima dela.
    ...(temPromo ? { precoPromocional } : {}),
    precoMinimo: jornada.semSelecao ? null : round2(preco + jornada.soma),
    ...(temPromo ? { precoMinimoPromocional: jornada.semSelecao ? null : round2(precoPromocional + jornada.soma) } : {}),
    precoEhAPartirDe: jornada.variavel,
    // Item em falta derruba TODOS os produtos dele, mesmo os de opção ACTIVE.
    status: it.status === 'MISSING' ? 'MISSING' : op.status,
    ordenavel: ordem.ok,
    ...(ordem.ok ? {} : { motivo: ordem.motivo }),
    origem: { itemId: it.id, grupoId: g.id, opcaoId: op.id },
    grupoPrincipalId: g.id,
  };
}

// Produto do item sem expansão (modo NORMAL) — o card de hoje, com o contrato da rev. 3.
// Aqui NÃO há principal: a jornada obrigatória é a do item inteiro. É o que faz o card de um
// combo em modo normal deixar de anunciar R$ 0,00 (o preço da base) e passar a dizer
// "a partir de R$ 27,90".
export function produtoDeItem(item) {
  const it = objeto(item);
  const jornada = jornadaObrigatoria(obrigatoriosRestantes(it, null));
  const base = ordenavelDoItem(it);
  const ordem = base.ok && jornada.semSelecao ? { ok: false, motivo: 'GRUPO_EM_FALTA' } : base;
  const preco = round2(numero(it.preco, 0));
  const temPromo = typeof it.precoPromocional === 'number';
  const precoPromocional = temPromo ? round2(it.precoPromocional) : null;
  return {
    id: `item:${it.id}`,
    tipo: 'ITEM',
    nome: it.nome ?? null,
    descricao: it.descricao ?? null,
    imagem: it.imagem ?? null,
    preco,
    ...(temPromo ? { precoPromocional } : {}),
    precoMinimo: jornada.semSelecao ? null : round2(preco + jornada.soma),
    ...(temPromo ? { precoMinimoPromocional: jornada.semSelecao ? null : round2(precoPromocional + jornada.soma) } : {}),
    precoEhAPartirDe: jornada.variavel,
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
// do admin. INALTERADA na rev. 3 e conservadora de propósito: preço base 0 + exatamente UM
// grupo visível obrigatório + esse grupo elegível (agora incluindo "duas apresentáveis"), sem
// olhar `choiceType` nem `index`. No cardápio real de 2026-09-11 sugere TRADICIONAIS 🍔,
// ARTESANAIS 🍔, NOSSOS DOGS 🌭 e ESCOLHA SEU ACOMPANHAMENTO 🍟; deixa de fora os COMBOS
// (três obrigatórios) e a QUINTA DA BATATA (dois obrigatórios, e a batata tem uma opção só).
// Combo agora PODE ser configurado à mão — só não é adivinhado: quem decide que o burguer é a
// identidade do combo é a loja, não a heurística.
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

// Lista do GET admin (spec §4.3/§8): catálogo vivo + configurações persistidas.
// `elegivel` olha só o grupo e `selecionavel` olha o item inteiro. Na rev. 3 os dois COINCIDEM
// por construção (a regra do item virou "a regra do grupo" quando `OUTRO_GRUPO_OBRIGATORIO`
// morreu) — o par fica no contrato porque a tela já o consome e porque uma futura regra de item
// (sem tocar no frontend) volta a separá-los.
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
      const grupos = arranjo(item.grupos);
      const elegiveis = grupos.filter((g) => grupoElegivel(g).ok);
      const validacao = cfg ? resumo(validarConfiguracao(cfg, item)) : { ok: true };
      // Referência para a nota "a partir de" (spec §8): o grupo configurado só serve quando a
      // configuração AINDA VALE. Um id que não casa com grupo nenhum (grupo apagado no CW) não
      // excluiria ninguém e a conta inflaria — o admin diria "tem outras 3 escolhas
      // obrigatórias" para um item que tem 2. Configuração quebrada cai no mesmo palpite de
      // quem não tem configuração: o primeiro grupo que serviria de vitrine. Sem candidato
      // nenhum, conta todos os obrigatórios — informação neutra, a tela nem mostra o select.
      const referencia = cfg && validacao.ok && cfg.cwGrupoPrincipalId !== null && cfg.cwGrupoPrincipalId !== undefined
        ? cfg.cwGrupoPrincipalId
        : (elegiveis.length ? objeto(elegiveis[0]).id : null);
      itens.push({
        cwItemId: item.id,
        nome: item.nome ?? null,
        categoria: categoria.nome ?? null,
        precoBase: round2(numero(item.preco, 0)),
        config: cfg ? { id: cfg.id, modo: cfg.modo, cwGrupoPrincipalId: cfg.cwGrupoPrincipalId } : null,
        validacao,
        // Dá para virar vitrine? É o que separa o estado NEUTRO ("sem grupo de escolha única
        // com duas ou mais opções") do convite "pode virar vitrine".
        candidato: elegiveis.length > 0,
        // Quantas OUTRAS escolhas obrigatórias sobram — quando > 0 o card dirá "a partir de".
        obrigatoriosAlem: obrigatoriosRestantes(item, referencia).length,
        grupos: grupos.map((bruto) => {
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
