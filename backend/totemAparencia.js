// Totem › Aparência do canal — módulo puro, testado em totemAparencia.test.js.
//
// ⚠️ Não confundir com `frontend/src/components/totemAparencia.js`, que só resolve as ABAS
// da tela de admin. Este aqui é o domínio: as cores do canal, a validação delas e o
// diagnóstico de contraste.
//
// ── O QUE ESTE MÓDULO NÃO FAZ, e é a parte que importa ────────────────────────────────
// Ele não produz CSS. Não devolve `<style>`, não devolve `--ds-fundo: #fff`, não devolve
// string nenhuma que um navegador vá interpretar. Ele trabalha com SEIS chaves conhecidas
// e com valores hexadecimais normalizados, e é só isso que sai daqui.
//
// Por consequência, não existe "escapar" a fazer em lugar nenhum: um valor que não casa
// com a regex de hex simplesmente não vira valor. `var(`, `url(`, `;`, `}` e nomes de cor
// do CSS não são rejeitados por uma lista de proibidos — eles não são aceitos por nada.
// Lista de proibidos é a defesa que esquece um caso; aceitar só o que se reconhece, não.
//
// ── AS CHAVES SÃO DE DOMÍNIO, NÃO DE CSS ──────────────────────────────────────────────
// `fundo`, `cartao`, `texto`… e nunca `--ds-fundo`. A configuração persistida não pode
// conhecer nome de custom property: no dia em que a folha renomear um token, o banco de
// todas as lojas continuaria falando o nome antigo. O mapeamento domínio → CSS é do
// frontend, num lugar só, e é ele que muda quando a folha mudar.
//
// ── RIGOR AO ESCREVER, TOLERÂNCIA AO LER ──────────────────────────────────────────────
// São duas responsabilidades e dois comportamentos opostos, de propósito:
//
//   validarEntrada    → o PUT do admin. Chave desconhecida é ERRO, valor inválido é ERRO.
//                       Uma cor que o gestor digitou errado tem de voltar como recusa, e
//                       não sumir em silêncio deixando a tela dizer que salvou.
//   sanitizarTokens   → a leitura, o bootstrap. Chave desconhecida é IGNORADA, valor
//                       inválido é IGNORADO. Dado antigo, escrito à mão no banco ou
//                       sobrevivente de uma versão anterior não pode derrubar o totem —
//                       ele cai no padrão da folha e a loja continua vendendo.

// ── O QUE SAIU DAQUI, E POR QUÊ ───────────────────────────────────────────────────────
// A régua de cor (hexadecimal, validação, sanitização) e a matemática de contraste (sRGB,
// WCAG) eram deste arquivo e viraram `cores.js` quando a TV Indoor precisou exatamente das
// mesmas contas. O helper não sabe quais são as chaves da paleta nem quais pares merecem
// diagnóstico — tudo isso ENTRA POR PARÂMETRO, e é por isso que dois canais irmãos podem
// dividi-lo sem um conhecer o outro.
//
// O que é de PRODUTO do totem (as seis chaves, os pares, os dois fundos, os textos da tela
// de espera) continua inteiro aqui. As funções seguem exportadas com os mesmos nomes e o
// mesmo comportamento — quem importa deste módulo não muda uma linha.
import {
  AA_NORMAL, AA_GRANDE, MOTIVO_CHAVE, MOTIVO_COR, MOTIVO_FORMATO,
  normalizarCor, contraste, validarPaleta, sanitizarPaleta, diagnosticar,
} from './cores.js';

export { AA_NORMAL, AA_GRANDE, MOTIVO_CHAVE, MOTIVO_COR, MOTIVO_FORMATO, normalizarCor, contraste };

/* As chaves do domínio. A ordem é a de leitura na tela de configuração, não tem outro
   significado. */
export const CHAVES = Object.freeze(['fundo', 'cartao', 'texto', 'textoApoio', 'acaoFundo', 'acaoTexto']);

/* `normalizarCor` e `contraste` vêm de `cores.js` e são reexportados acima: o contrato
   deste módulo não mudou, só o lugar onde a conta mora. */

/* ENTRADA DO ADMIN — rigor.

   Devolve `{ ok, tokens, erros }`. `tokens` já vem normalizado e só com o que passou;
   `erros` é a lista de `{ chave, motivo }` na ordem em que apareceram.

   Objeto PARCIAL é válido: mexer numa cor não obriga a reenviar as seis. O que não vem
   simplesmente não é tocado — quem decide o que fazer com a ausência é o endpoint.

   Chave presente com valor não-string (número, `null`, objeto) é `COR_INVALIDA`, e não uma
   forma de apagar. Se um dia "voltar ao padrão" precisar existir, ele merece um caminho
   explícito em vez de pegar carona no `null`, que é o mesmo que um campo vazio manda por
   acidente. */
export const validarEntrada = (bruto) => validarPaleta(bruto, CHAVES);

/* LEITURA — tolerância.

   Nunca lança e nunca devolve `undefined`: entrada torta vira `{}`, e o totem usa o padrão
   da folha. `ignoradas` existe para o admin poder mostrar "isto aqui está no banco e não
   é usado" sem que nada disso chegue perto do quiosque. */
export const sanitizarTokens = (bruto) => sanitizarPaleta(bruto, CHAVES);

/* A matemática do contraste (luminância sRGB, razão, limiares) mora em `cores.js`. */

/* Os pares que decidem se a tela é legível. São estes cinco porque são os que existem no
   desenho: texto e texto de apoio sobre as duas superfícies, e o texto do botão sobre o
   botão. Um par a mais aqui é um aviso que ninguém sabe interpretar. */
export const PARES = Object.freeze([
  Object.freeze({ id: 'texto-fundo', frente: 'texto', tras: 'fundo', rotulo: 'Texto sobre o fundo' }),
  Object.freeze({ id: 'texto-cartao', frente: 'texto', tras: 'cartao', rotulo: 'Texto sobre o cartão' }),
  Object.freeze({ id: 'apoio-fundo', frente: 'textoApoio', tras: 'fundo', rotulo: 'Texto de apoio sobre o fundo' }),
  Object.freeze({ id: 'apoio-cartao', frente: 'textoApoio', tras: 'cartao', rotulo: 'Texto de apoio sobre o cartão' }),
  Object.freeze({ id: 'acao', frente: 'acaoTexto', tras: 'acaoFundo', rotulo: 'Texto sobre o botão' }),
]);

/* Diagnóstico dos cinco pares.

   Devolve SEMPRE os cinco, mesmo quando faltar cor: par sem medida vem com `ratio: null` e
   as duas aprovações em `false`. Sumir com a linha esconderia justamente o caso em que a
   loja preencheu meia paleta.

   As aprovações saem da razão CRUA, não da arredondada: 4,4996 exibido como "4,5" não pode
   passar num limiar de 4,5. */
export const diagnosticoDeContraste = (tokens) => diagnosticar(tokens, PARES, CHAVES);

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/* ══ Operações de CONTRATO ═══════════════════════════════════════════════════════════
   O que vem acima é o domínio puro das cores. O que vem daqui para baixo é o contrato do
   endpoint administrativo — e a diferença mais importante é o `null`.

   Para a validação de cor, `null` NÃO é cor: `normalizarCor(null)` é `null` e
   `validarEntrada({ fundo: null })` é erro. Isso continua valendo e não mudou.

   No PATCH do PUT, `null` é uma OPERAÇÃO: "remova este override e volte ao padrão". São
   camadas diferentes, e é por isso que a operação mora numa função separada em vez de
   afrouxar a régua de cor — afrouxar faria um campo vazio enviado por acidente apagar a
   escolha da loja sem que nada acusasse. */

/* Os PADRÕES do canal, que é o que a tela mostra quando não há override.

   ⚠️ Estes seis valores também existem em `frontend/src/styles/totem.css`, e é de
   propósito: lá eles são o que o quiosque desenha quando NADA chega (bootstrap velho,
   rede caindo, aparência corrompida), aqui são o que o admin vê como "padrão". Os dois
   têm de concordar, e há teste para isso. Mudar um sem o outro faz a tela de configuração
   mentir sobre o que o cliente está vendo. */
/* ── OS DOIS FUNDOS ───────────────────────────────────────────────────────────────────
   O fundo não é uma sétima cor: é a RELAÇÃO entre as seis. Quem é mais claro que quem,
   onde entra fio, o que o dourado significa. Por isso ele é uma escolha própria, e as seis
   cores passam a ser ajuste fino POR CIMA da escolha.

   PADRÃO é a escada de carvão: o chão é o tom mais escuro, a coluna sobe um passo, o
   cartão sobe outro. O preto puro de antes saiu — com #000 embaixo e #131211 em cima, o
   cartão era 1,2% mais claro que o chão, e quem separava um do outro era a FOTOGRAFIA, não
   a interface. Sem foto (produto em falta, catálogo novo), a grade sumia.

   CLARO é a mesma escada espelhada. Não é outro desenho: mesmo viés quente no neutro,
   mesma ausência de sombra, mesmo fio único. O que muda é onde a escada começa.

   O DOURADO DO PREÇO não está aqui de propósito. Ele é derivado do fundo, na folha
   (`--tq-preco`), porque no claro o dourado da marca dá 2,2:1 sobre branco e simplesmente
   não pode ser texto. Cor que a loja não pode escolher errado não vira campo. */
export const PADROES_POR_LAYOUT = Object.freeze({
  PADRAO: Object.freeze({
    fundo: '#0f0e0d',       // --ds-fundo      · o chão do catálogo
    cartao: '#1e1b18',      // --tq-superficie · e não --ds-cartao: o marrom da marca lê
                            //   como sujeira sob foto de comida (spec §5.2)
    texto: '#ffffff',       // --ds-texto
    textoApoio: '#d79e00',  // --ds-texto-apoio
    acaoFundo: '#d79e00',   // --ds-botao-fundo
    acaoTexto: '#000000',   // --ds-botao-texto
  }),
  CLARO: Object.freeze({
    fundo: '#eae8e4',
    cartao: '#ffffff',
    texto: '#1a1714',
    textoApoio: '#665e55',  // 4,7:1 sobre o chão e 6,0:1 sobre o cartão
    acaoFundo: '#d79e00',   // o dourado da marca aguenta ser CHAPA no claro…
    acaoTexto: '#000000',   // …com tinta preta em cima: 8,8:1, o par do próprio guia
  }),
});

/* Atalho para o fundo padrão. Continua exportado porque é o que a folha do quiosque
   embarca como valor de partida, e há teste amarrando os dois. */
export const PADROES = PADROES_POR_LAYOUT.PADRAO;

export const LAYOUTS = Object.freeze(['PADRAO', 'CLARO']);
export const LAYOUT_PADRAO = 'PADRAO';
export const MOTIVO_LAYOUT = 'LAYOUT_INVALIDO';

/* Fundo válido, ou `null`. Não normaliza caixa: isto vem de um seletor com duas opções,
   como a posição das categorias. */
export function normalizarLayout(valor) {
  return LAYOUTS.includes(valor) ? valor : null;
}

/* LEITURA — o fundo que vale, com tolerância. Valor torto guardado no banco não derruba o
   totem: ele cai no padrão e a loja continua vendendo. */
export function layoutEfetivo(valor) {
  return normalizarLayout(valor) ?? LAYOUT_PADRAO;
}

/* ── A CHAMADA DA TELA DE ESPERA ──────────────────────────────────────────────────────
   O texto do botão que fica horas no vidro chamando quem passa.

   O TETO é 32 e não é número redondo à toa: o botão tem `width: min(760px, 100%)` e o
   texto vai em caixa alta, na fonte de display, a `clamp(24px, 4.2vw, 50px)`. A 50px, 32
   caracteres em Montserrat 900 é o que ainda cabe numa linha no alvo em pé — passando
   disso o texto quebra em duas e o botão cresce por cima da arte. Recusar é melhor do que
   aceitar e deixar a loja descobrir no vidro.

   VAZIO NÃO É ERRO, é "voltar ao padrão": campo apagado no formulário guarda `null` e a
   tela volta a dizer "Toque para começar". É o mesmo desenho do `null` no patch de cores —
   ausência é uma escolha, e ela tem de ter um caminho.

   A CAIXA ALTA é da folha (`text-transform: uppercase`), não daqui: o que a loja escreve é
   guardado como ela escreveu. Se um dia a tela deixar de gritar, o texto continua certo. */
export const CHAMADA_PADRAO = 'Toque para começar';
export const CHAMADA_MAX = 32;
export const MOTIVO_CHAMADA = 'CHAMADA_INVALIDA';

/* O TÍTULO e o SUBTÍTULO da tela de espera padrão — a vitrine.

   Mesma régua da chamada, com tetos diferentes porque os papéis são diferentes: o título é
   display, grande, e vive de ser curto; o subtítulo é corpo e pode explicar. Ambos vazios
   por padrão, e a tela sabe se compor sem eles.

   Não têm PADRÃO de fábrica, ao contrário da chamada. Um botão sem texto é um botão
   quebrado, então lá o padrão é obrigatório; um título ausente é uma escolha de desenho
   legítima — a loja que só quer a foto e o botão não deve ser obrigada a inventar frase. */
/* A medida recomendada da FOTO DE FUNDO da vitrine: a metade de cima da tela, e não a tela
   inteira. A foto só aparece ali — recomendar 1080 × 1920 fazia a loja enquadrar uma arte
   que teria metade cortada. 960 é exatamente 50% de 1920, e a folha do quiosque divide a
   tela em duas metades iguais para o número ser verdade. */
export const FUNDO_ESPERA_MEDIDA = Object.freeze({ largura: 1080, altura: 960 });

/* A FRASE DO MEIO: a faixa que liga a metade de cima (foto) à de baixo (esteiras). Tem
   padrão de fábrica, como a chamada — uma faixa vazia entre as duas metades seria um
   traço sem sentido, e "Nossos produtos" é o que a faixa quer dizer na maioria das lojas.
   Teto curto porque é UMA linha, em caixa alta e espaçada, sobre 1080px. */
export const FRASE_MEIO_PADRAO = 'Nossos produtos';
export const FRASE_MEIO_MAX = 30;
export const MOTIVO_FRASE_MEIO = 'FRASE_MEIO_INVALIDA';

export const TITULO_MAX = 40;
export const SUBTITULO_MAX = 90;
export const MOTIVO_TITULO = 'TITULO_INVALIDO';
export const MOTIVO_SUBTITULO = 'SUBTITULO_INVALIDO';

/* Uma régua só para os dois: aparar, aceitar vazio como `null`, recusar o que passa do
   teto. Contar CARACTERES e não bytes — acento não pode custar duas letras. */
export function validarTexto(bruto, teto) {
  if (bruto === null) return { ok: true, valor: null };
  if (typeof bruto !== 'string') return { ok: false, valor: null };
  const t = bruto.trim();
  if (!t) return { ok: true, valor: null };
  if ([...t].length > teto) return { ok: false, valor: null };
  return { ok: true, valor: t };
}

/* LEITURA — tolerância. Texto torto guardado no banco vira ausência, não vira tela
   quebrada: a vitrine simplesmente não desenha aquela linha. */
export function textoEfetivo(bruto, teto) {
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim();
  if (!t || [...t].length > teto) return null;
  return t;
}

/* ENTRADA — rigor. Devolve `{ ok, valor }`, com `valor` já aparado; `null` significa
   "sem personalização, use o padrão".

   Espaço em volta some: ninguém escolhe começar um botão com espaço, e um texto que só tem
   espaços é um campo vazio disfarçado. */
export function validarChamada(bruto) {
  if (bruto === null) return { ok: true, valor: null };
  if (typeof bruto !== 'string') return { ok: false, valor: null };
  const t = bruto.trim();
  if (!t) return { ok: true, valor: null };
  if ([...t].length > CHAMADA_MAX) return { ok: false, valor: null };
  return { ok: true, valor: t };
}

/* LEITURA — tolerância. O que o quiosque vai realmente escrever no botão. Nunca vazio:
   dado torto no banco não pode deixar o totem com um botão sem texto. */
export function chamadaEfetiva(bruto) {
  if (typeof bruto !== 'string') return CHAMADA_PADRAO;
  const t = bruto.trim();
  if (!t || [...t].length > CHAMADA_MAX) return CHAMADA_PADRAO;
  return t;
}

export const POSICOES = Object.freeze(['esquerda', 'direita']);
export const POSICAO_PADRAO = 'esquerda';
export const MOTIVO_POSICAO = 'POSICAO_INVALIDA';

/* Posição válida, ou `null`. Não normaliza caixa nem acento: isto vem de um seletor com
   duas opções, não de texto digitado — aceitar "Direita" seria aceitar que o cliente
   inventa valores. */
export function normalizarPosicao(valor) {
  return POSICOES.includes(valor) ? valor : null;
}

/* Qual posição vale para ESTE aparelho: override dele, senão o padrão da loja, senão
   esquerda. Cada degrau é sanitizado — um valor inválido guardado no banco não desce para
   o quiosque, ele cai para o degrau seguinte. */
export function posicaoEfetiva({ override, padrao } = {}) {
  return normalizarPosicao(override) ?? normalizarPosicao(padrao) ?? POSICAO_PADRAO;
}

/* O PATCH do PUT administrativo.

   Devolve `{ ok, definir, remover, erros }`:
     definir  — `{ chave: '#rrggbb' }` a gravar
     remover  — `['chave']` cujo override sai (volta ao padrão)

   Chave OMITIDA não aparece em nenhum dos dois: não mexer é diferente de voltar ao padrão,
   e um PUT parcial não pode apagar o que ele não mencionou.

   Chave desconhecida é erro mesmo com valor `null`: remover algo que não existe é engano
   do chamador, e responder "ok" a isso esconde um typo. */
export function validarPatch(bruto) {
  if (!ehObjeto(bruto)) return { ok: false, definir: {}, remover: [], erros: [{ chave: null, motivo: MOTIVO_FORMATO }] };
  const definir = {};
  const remover = [];
  const erros = [];
  for (const chave of Object.keys(bruto)) {
    if (!CHAVES.includes(chave)) { erros.push({ chave, motivo: MOTIVO_CHAVE }); continue; }
    if (bruto[chave] === null) { remover.push(chave); continue; }
    const cor = normalizarCor(bruto[chave]);
    if (cor === null) { erros.push({ chave, motivo: MOTIVO_COR }); continue; }
    definir[chave] = cor;
  }
  return { ok: erros.length === 0, definir, remover, erros };
}

/* ── O COFRE: um conjunto de overrides POR FUNDO ──────────────────────────────────────
   `TotemConfiguracao.tokens` guarda `{ PADRAO: {...}, CLARO: {...} }`.

   Dois conjuntos, e não um, porque as cores de um fundo não servem no outro: um
   `texto: '#ffffff'` escolhido no escuro transformaria o claro em branco sobre papel. Com
   o cofre, trocar de fundo troca a paleta junto — e voltar traz de volta o que estava.

   LEITURA TOLERANTE, e é ela que dispensa migração de dado: quem já tinha o formato ANTIGO
   (um objeto plano com as seis chaves) é lido como o conjunto do fundo padrão, que é
   exatamente o que aquelas cores sempre foram. A primeira gravação normaliza a forma.
   Nada de `UPDATE` em coluna JSON de produção para converter o que a leitura já resolve. */
export function lerCofre(bruto) {
  const vazio = () => Object.fromEntries(LAYOUTS.map((l) => [l, {}]));
  if (!ehObjeto(bruto)) return vazio();
  // Formato antigo: nenhuma chave de fundo no topo, mas chaves de COR. Vira o padrão.
  const temFundo = LAYOUTS.some((l) => ehObjeto(bruto[l]));
  if (!temFundo) {
    const cofre = vazio();
    cofre[LAYOUT_PADRAO] = sanitizarTokens(bruto).tokens;
    return cofre;
  }
  const cofre = vazio();
  for (const l of LAYOUTS) cofre[l] = sanitizarTokens(bruto[l]).tokens;
  return cofre;
}

/* Os overrides de UM fundo. Fundo torto cai no padrão, como em todo lugar. */
export function tokensDoLayout(bruto, layout) {
  return lerCofre(bruto)[layoutEfetivo(layout)];
}

/* Os overrides guardados + o patch = o COFRE novo, com um só conjunto tocado. O que sai
   fica FORA do objeto — não vira `null` guardado, que seria um override de valor nulo em
   vez da ausência dele. */
export function aplicarPatch(guardados, patch, layout) {
  const cofre = lerCofre(guardados);
  const alvo = layoutEfetivo(layout);
  const novos = { ...cofre[alvo], ...(patch?.definir ?? {}) };
  for (const chave of (patch?.remover ?? [])) delete novos[chave];
  return { ...cofre, [alvo]: novos };
}

/* As seis cores que o quiosque vai realmente desenhar NESTE fundo: padrão do fundo por
   baixo, override do fundo por cima. Sempre completo — a tela e o diagnóstico de contraste
   nunca recebem meia paleta.

   O fundo é parâmetro e não é opcional na prática: sem ele o servidor devolveria a paleta
   escura como efetiva enquanto a tela real está clara, e o diagnóstico de contraste diria
   que está tudo bem medindo o par errado. */
export function coresEfetivas(guardados, layout) {
  const alvo = layoutEfetivo(layout);
  return { ...PADROES_POR_LAYOUT[alvo], ...tokensDoLayout(guardados, alvo) };
}

/* O bloco `aparencia` do bootstrap público.

   Só o que o quiosque precisa para desenhar: os overrides (o padrão ele já tem embarcado
   na folha), a posição efetiva DESTE aparelho, e o estado da logo. A logo em si NUNCA vai
   aqui — o bootstrap é relido a cada 5 min por aparelho, e 200 KB de base64 nessa
   frequência é desperdício puro. Vai a versão, e o tablet busca os bytes uma vez. */
export function aparenciaPublica({ config, dispositivo, temFundoEspera = false } = {}) {
  // O fundo primeiro: é ele que diz QUAL conjunto de overrides desce para o tablet.
  const layoutFundo = layoutEfetivo(config?.layoutFundo);
  return {
    layoutFundo,
    tokens: tokensDoLayout(config?.tokens, layoutFundo),
    // JÁ RESOLVIDA, ao contrário das cores. Cor tem o padrão embarcado na folha, que é o
    // chão quando nada chega; texto não tem folha nenhuma por baixo — mandar `null` e
    // deixar o quiosque adivinhar espalharia o padrão por dois lugares.
    chamadaEspera: chamadaEfetiva(config?.chamadaEspera),
    // Estes dois podem ser `null`, e `null` aqui é informação: a tela não desenha a linha.
    tituloEspera: textoEfetivo(config?.tituloEspera, TITULO_MAX),
    subtituloEspera: textoEfetivo(config?.subtituloEspera, SUBTITULO_MAX),
    // Com padrão, como a chamada: a faixa entre as metades nunca fica em branco.
    fraseMeioEspera: textoEfetivo(config?.fraseMeioEspera, FRASE_MEIO_MAX) ?? FRASE_MEIO_PADRAO,
    // A foto de fundo, como a logo: só versão e presença. Os bytes têm rota própria e cache
    // versionado; mandá-los a cada 5 min por aparelho seria desperdício puro.
    fundoEsperaVersao: Number.isInteger(config?.fundoEsperaVersao) && config.fundoEsperaVersao >= 0 ? config.fundoEsperaVersao : 0,
    temFundoEspera: temFundoEspera === true,
    posicaoCategorias: posicaoEfetiva({
      override: dispositivo?.posicaoCategoriasOverride,
      padrao: config?.posicaoCategoriasPadrao,
    }),
    logoVersao: Number.isInteger(config?.logoVersao) ? config.logoVersao : 0,
    temLogoPersonalizada: typeof config?.logoDataUrl === 'string' && config.logoDataUrl.length > 0,
  };
}

/* ══ Logo do canal ═══════════════════════════════════════════════════════════════════
   Data URL, como já se faz nas fotos de Checklist e em `Empresa.logoDataUrl`.

   O teto é pequeno de propósito: é uma LOGO, não uma fotografia, e precisa caber com
   folga no `client_max_body_size` do Nginx — cujo padrão, quando ninguém configurou, é
   1 MB. 300 KB decodificados dão ~400 KB em base64, e ainda sobra espaço para o resto do
   corpo da requisição. */
export const LOGO_MAX_BYTES = 300 * 1024;
const LOGO_TIPOS = Object.freeze({ 'image/png': true, 'image/jpeg': true, 'image/webp': true });
const LOGO_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/* Devolve o CÓDIGO do erro, ou `null` quando passa.

   Valida o tipo declarado E o tamanho REAL depois de decodificar. O cabeçalho do data URL
   é texto que o cliente escreve: confiar nele é confiar em quem manda a requisição, e
   `data:image/png;base64,` na frente de um megabyte continua sendo um megabyte.

   SVG fica de fora junto com o resto: SVG é documento, não imagem — ele carrega script. */
export function validarLogoDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return 'LOGO_AUSENTE';
  const m = LOGO_DATA_URL.exec(dataUrl.trim());
  if (!m) return 'LOGO_FORMATO';
  if (!LOGO_TIPOS[m[1]]) return 'LOGO_TIPO';
  let bytes;
  try { bytes = Buffer.from(m[2], 'base64'); } catch { return 'LOGO_FORMATO'; }
  if (!bytes.length) return 'LOGO_FORMATO';
  if (bytes.length > LOGO_MAX_BYTES) return 'LOGO_GRANDE';
  return null;
}

/* Data URL guardado → `{ tipo, bytes }`, ou `null`.

   Revalida na LEITURA também, e não só na escrita: dado gravado por uma versão anterior,
   ou escrito à mão no banco, não pode virar uma resposta com Content-Type inventado. */
export function decodificarDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = LOGO_DATA_URL.exec(dataUrl.trim());
  if (!m || !LOGO_TIPOS[m[1]]) return null;
  try {
    const bytes = Buffer.from(m[2], 'base64');
    return bytes.length ? { tipo: m[1], bytes } : null;
  } catch { return null; }
}

/* A versão sobe quando os bytes mudam, e SÓ então.

   É ela que invalida o cache do tablet — que guarda a imagem por um ano, `immutable`. Por
   isso a REMOÇÃO também sobe: sem isso o totem continuaria servindo do cache uma logo que
   a loja acabou de tirar do ar. E reenviar a mesma imagem NÃO sobe, para não obrigar todos
   os tablets a rebaixar o que já têm. */
export function proximaVersaoLogo({ atual, mudou } = {}) {
  const base = Number.isInteger(atual) && atual >= 0 ? atual : 0;
  return mudou ? base + 1 : base;
}
