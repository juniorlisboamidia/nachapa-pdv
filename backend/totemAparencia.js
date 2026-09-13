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

/* As chaves do domínio. A ordem é a de leitura na tela de configuração, não tem outro
   significado. */
export const CHAVES = Object.freeze(['fundo', 'cartao', 'texto', 'textoApoio', 'acaoFundo', 'acaoTexto']);

/* Limiares da WCAG 2.1. `aaGrande` vale para texto grande — no totem, quase tudo é texto
   grande, mas quem decide o que é aviso e o que é bloqueio é a tela (A6), não este
   módulo. Aqui só se mede. */
export const AA_NORMAL = 4.5;
export const AA_GRANDE = 3;

/* Motivos de recusa. Constantes porque a tela vai traduzi-los, e comparar string solta é
   como um erro deixa de aparecer depois de um typo. */
export const MOTIVO_CHAVE = 'CHAVE_DESCONHECIDA';
export const MOTIVO_COR = 'COR_INVALIDA';
export const MOTIVO_FORMATO = 'FORMATO_INVALIDO';

/* Só `#rgb` e `#rrggbb`. Sem alpha: `#rgba`/`#rrggbbaa` ficam de fora porque uma cor de
   marca semitransparente sobre outra superfície produz um contraste que este módulo não
   consegue medir — e medir errado é pior do que não oferecer. */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/* Texto → `#rrggbb` minúsculo, ou `null`.

   Aceita espaço em volta (é campo de formulário, e colar de um guia de marca traz espaço).
   Não aceita mais nada: número, objeto, `null`, `transparent`, `rgb(...)`, `var(...)`.
   Tudo isso falha no tipo ou na regex. */
export function normalizarCor(valor) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  if (!HEX.test(t)) return null;
  const hex = t.slice(1).toLowerCase();
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex}`;
}

/* ENTRADA DO ADMIN — rigor.

   Devolve `{ ok, tokens, erros }`. `tokens` já vem normalizado e só com o que passou;
   `erros` é a lista de `{ chave, motivo }` na ordem em que apareceram.

   Objeto PARCIAL é válido: mexer numa cor não obriga a reenviar as seis. O que não vem
   simplesmente não é tocado — quem decide o que fazer com a ausência é o endpoint.

   Chave presente com valor não-string (número, `null`, objeto) é `COR_INVALIDA`, e não uma
   forma de apagar. Se um dia "voltar ao padrão" precisar existir, ele merece um caminho
   explícito em vez de pegar carona no `null`, que é o mesmo que um campo vazio manda por
   acidente. */
export function validarEntrada(bruto) {
  if (!ehObjeto(bruto)) return { ok: false, tokens: {}, erros: [{ chave: null, motivo: MOTIVO_FORMATO }] };
  const tokens = {};
  const erros = [];
  for (const chave of Object.keys(bruto)) {
    if (!CHAVES.includes(chave)) { erros.push({ chave, motivo: MOTIVO_CHAVE }); continue; }
    const cor = normalizarCor(bruto[chave]);
    if (cor === null) { erros.push({ chave, motivo: MOTIVO_COR }); continue; }
    tokens[chave] = cor;
  }
  return { ok: erros.length === 0, tokens, erros };
}

/* LEITURA — tolerância.

   Nunca lança e nunca devolve `undefined`: entrada torta vira `{}`, e o totem usa o padrão
   da folha. `ignoradas` existe para o admin poder mostrar "isto aqui está no banco e não
   é usado" sem que nada disso chegue perto do quiosque. */
export function sanitizarTokens(bruto) {
  if (!ehObjeto(bruto)) return { tokens: {}, ignoradas: [] };
  const tokens = {};
  const ignoradas = [];
  for (const chave of Object.keys(bruto)) {
    if (!CHAVES.includes(chave)) { ignoradas.push({ chave, motivo: MOTIVO_CHAVE }); continue; }
    const cor = normalizarCor(bruto[chave]);
    if (cor === null) { ignoradas.push({ chave, motivo: MOTIVO_COR }); continue; }
    tokens[chave] = cor;
  }
  return { tokens, ignoradas };
}

/* ── Contraste (WCAG 2.1, sRGB) ──────────────────────────────────────────────────────── */

/* Luminância relativa de um canal: a curva de gama do sRGB, não o valor cru. Usar o byte
   direto é o erro clássico — dá números plausíveis e errados, e o erro só aparece em
   cores médias, justamente onde a decisão é difícil. */
function canal(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/* Razão de contraste entre duas cores, na ordem que for — a fórmula é simétrica.
   Cor inválida devolve `null`, nunca um número inventado: um contraste falso é pior que
   contraste nenhum, porque ele passa no teste da tela.

   Arredondado a duas casas para exibição. Preto × branco dá exatamente 21. */
export function contraste(a, b) {
  const ca = normalizarCor(a);
  const cb = normalizarCor(b);
  if (ca === null || cb === null) return null;
  return round2(razao(ca, cb));
}

function razao(ca, cb) {
  const la = luminancia(ca);
  const lb = luminancia(cb);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

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
export function diagnosticoDeContraste(tokens) {
  const { tokens: cores } = sanitizarTokens(tokens);
  return PARES.map((p) => {
    const a = cores[p.frente];
    const b = cores[p.tras];
    if (!a || !b) {
      return { ...p, ratio: null, aaNormal: false, aaGrande: false, medido: false };
    }
    const cru = razao(a, b);
    return { ...p, ratio: round2(cru), aaNormal: cru >= AA_NORMAL, aaGrande: cru >= AA_GRANDE, medido: true };
  });
}

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;

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
export const PADROES = Object.freeze({
  fundo: '#000000',       // --ds-fundo
  cartao: '#131211',      // --tq-superficie (e não --ds-cartao: o marrom da marca lê como
                          //   sujeira sob foto de comida — desvio consciente da spec §5.2)
  texto: '#ffffff',       // --ds-texto
  textoApoio: '#d79e00',  // --ds-texto-apoio
  acaoFundo: '#d79e00',   // --ds-botao-fundo
  acaoTexto: '#000000',   // --ds-botao-texto
});

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

/* Os overrides guardados + o patch = os overrides novos. O que sai fica FORA do objeto —
   não vira `null` guardado, que seria um override de valor nulo em vez da ausência dele. */
export function aplicarPatch(guardados, patch) {
  const { tokens } = sanitizarTokens(guardados);
  const novos = { ...tokens, ...(patch?.definir ?? {}) };
  for (const chave of (patch?.remover ?? [])) delete novos[chave];
  return novos;
}

/* As seis cores que o quiosque vai realmente desenhar: padrão por baixo, override por
   cima. Sempre completo — a tela e o diagnóstico de contraste nunca recebem meia paleta. */
export function coresEfetivas(guardados) {
  const { tokens } = sanitizarTokens(guardados);
  return { ...PADROES, ...tokens };
}

/* O bloco `aparencia` do bootstrap público.

   Só o que o quiosque precisa para desenhar: os overrides (o padrão ele já tem embarcado
   na folha), a posição efetiva DESTE aparelho, e o estado da logo. A logo em si NUNCA vai
   aqui — o bootstrap é relido a cada 5 min por aparelho, e 200 KB de base64 nessa
   frequência é desperdício puro. Vai a versão, e o tablet busca os bytes uma vez. */
export function aparenciaPublica({ config, dispositivo } = {}) {
  const { tokens } = sanitizarTokens(config?.tokens);
  return {
    tokens,
    posicaoCategorias: posicaoEfetiva({
      override: dispositivo?.posicaoCategoriasOverride,
      padrao: config?.posicaoCategoriasPadrao,
    }),
    logoVersao: Number.isInteger(config?.logoVersao) ? config.logoVersao : 0,
    temLogoPersonalizada: typeof config?.logoDataUrl === 'string' && config.logoDataUrl.length > 0,
  };
}
