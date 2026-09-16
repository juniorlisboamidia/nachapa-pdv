// TV Indoor › APARÊNCIA — módulo puro do canal (sem Prisma, sem Express, sem rede).
//
// A identidade visual da TV: seis cores e uma logo. Domínio PRÓPRIO — nenhuma linha daqui
// conhece `TotemConfiguracao`, `--tq-*`, `--ds-*` ou qualquer token do totem. Se o Totem
// sumisse do repositório, este arquivo continuaria compilando e a TV continuaria no ar.
//
// O que se divide com o outro canal é TÉCNICO (`cores.js`): validar hexadecimal, medir
// contraste, derivar um rgba. Essas funções não sabem o que é totem nem o que é TV.
//
// ── O QUE A APARÊNCIA ALCANÇA ─────────────────────────────────────────────────────────
// O fallback institucional e os três layouts de Menu Board. NÃO alcança a arte que o gestor
// enviou: uma imagem 1920 × 1080 é exibida como foi criada, e pintar tokens por cima dela
// seria estragar o trabalho de quem a desenhou.
import { AA_NORMAL, AA_GRANDE, MOTIVO_CHAVE, MOTIVO_COR, MOTIVO_FORMATO, diagnosticar, normalizarCor, sanitizarPaleta, validarPaleta } from './cores.js';

export { AA_NORMAL, AA_GRANDE, MOTIVO_CHAVE, MOTIVO_COR, MOTIVO_FORMATO };

/* As SEIS chaves do domínio. A ordem é a de leitura na tela de configuração.

   São seis, e não sete ou dez, porque cada uma responde a uma pergunta que o desenho
   realmente faz: qual é o chão, o que fica sobre ele, com que cor se escreve, com que cor
   se escreve o secundário, o que chama atenção, e o que se escreve EM CIMA do que chama
   atenção. Tudo o mais (divisória, véu, sombra) é derivado — e derivado não vira campo. */
export const CHAVES = Object.freeze(['fundo', 'superficie', 'texto', 'textoApoio', 'destaque', 'textoDestaque']);

/* Os PADRÕES do canal.

   Começam nos valores que a TV já mostrava, para ninguém acordar com a parede diferente —
   mas eles passam a pertencer a ESTE domínio. Não são lidos do totem em tempo de execução
   nem importados dele: são literais daqui, e mudam daqui.

   ⚠️ Os mesmos seis valores estão em `frontend/src/styles/tvMenuBoard.css` como fallback da
   folha, e é de propósito: lá é o que a TV desenha quando NADA chega (cold start, rede
   caindo, aparência corrompida); aqui é o que o admin mostra como "padrão". Os dois têm de
   concordar, e há teste para isso — mudar um sem o outro faz a tela de configuração mentir
   sobre o que a loja está vendo. */
export const PADROES = Object.freeze({
  fundo: '#0b0a09',
  /* A SUPERFÍCIE é o card, e ela não nasce mais igual ao fundo.

     Enquanto as duas eram `#0b0a09`, o card não existia: o menu board era texto e foto
     soltos sobre um fundo, e é isso que fazia a peça parecer dados em vez de cartaz. Um
     tom quente apenas dois degraus acima do fundo basta para o olho agrupar mídia, nome e
     preço numa unidade — sem transformar a tela num painel administrativo cheio de caixas.

     ⚠️ Isto é DEFAULT visual, e muda a aparência de boards que nunca configuraram cor. Foi
     decisão explícita da etapa de refino; quem já escolheu uma superfície continua com a
     dela. */
  superficie: '#17130d',
  texto: '#ffffff',
  textoApoio: '#b8b8b8',
  destaque: '#d79e00',
  textoDestaque: '#000000',
});

/* Os pares que decidem se a tela é legível. São estes cinco porque são os que existem no
   desenho: texto e apoio sobre as duas superfícies, e o texto do destaque sobre o destaque.
   Um par a mais aqui é um aviso que ninguém sabe interpretar. */
export const PARES = Object.freeze([
  Object.freeze({ id: 'texto-fundo', frente: 'texto', tras: 'fundo', rotulo: 'Texto sobre o fundo' }),
  Object.freeze({ id: 'texto-superficie', frente: 'texto', tras: 'superficie', rotulo: 'Texto sobre a superfície' }),
  Object.freeze({ id: 'apoio-fundo', frente: 'textoApoio', tras: 'fundo', rotulo: 'Texto de apoio sobre o fundo' }),
  Object.freeze({ id: 'apoio-superficie', frente: 'textoApoio', tras: 'superficie', rotulo: 'Texto de apoio sobre a superfície' }),
  Object.freeze({ id: 'destaque', frente: 'textoDestaque', tras: 'destaque', rotulo: 'Texto sobre o destaque' }),
]);

/* ── Tokens ──────────────────────────────────────────────────────────────────────────── */

/* ESCRITA: rigor. Chave desconhecida ou cor inválida é 400 — a régua é a de `cores.js`,
   com as chaves DESTE canal. */
export const validarTokens = (bruto) => validarPaleta(bruto, CHAVES);

/* LEITURA: tolerância. Dado antigo, escrito à mão ou corrompido é ignorado e cai no padrão.
   A TV nunca quebra por causa de um valor torto no banco. */
export const sanitizar = (bruto) => sanitizarPaleta(bruto, CHAVES);

/* As cores EFETIVAS: padrão com os overrides por cima. É o que a TV desenha e o que o admin
   mostra em cada seletor. */
export function coresEfetivas(bruto) {
  const { tokens } = sanitizar(bruto);
  return { ...PADROES, ...tokens };
}

/* O PATCH do PUT — e aqui `null` é uma OPERAÇÃO, não uma cor.

     chave ausente  → não altera
     "#rrggbb"      → cria/altera o override
     null           → REMOVE o override e volta ao padrão

   Por que `null` não passa pela régua de cor: para a validação, `null` não é cor e nunca
   será. Afrouxar aquela régua faria um campo vazio enviado por acidente apagar a escolha da
   loja sem que nada acusasse. São camadas diferentes, e por isso a operação mora aqui.

   Devolve `{ ok, tokens, erros }` com os tokens JÁ MESCLADOS, prontos para gravar. */
export function aplicarPatch(atuais, patch) {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, tokens: {}, erros: [{ chave: null, motivo: MOTIVO_FORMATO }] };
  }
  const { tokens: base } = sanitizar(atuais);
  const saida = { ...base };
  const erros = [];
  const paraValidar = {};
  for (const chave of Object.keys(patch)) {
    if (!CHAVES.includes(chave)) { erros.push({ chave, motivo: MOTIVO_CHAVE }); continue; }
    if (patch[chave] === null) { delete saida[chave]; continue; }
    paraValidar[chave] = patch[chave];
  }
  const v = validarTokens(paraValidar);
  erros.push(...v.erros);
  if (erros.length) return { ok: false, tokens: {}, erros };
  return { ok: true, tokens: { ...saida, ...v.tokens }, erros: [] };
}

/* O diagnóstico dos cinco pares, medido sobre as cores EFETIVAS — e não só sobre os
   overrides. É o contraste que o cliente vai ver na parede que importa, não o que a loja
   digitou; uma loja que muda só o fundo precisa ser avisada do texto padrão sobre ele. */
export const diagnosticoDeContraste = (bruto) => diagnosticar(coresEfetivas(bruto), PARES, CHAVES);

/* ── Logo ────────────────────────────────────────────────────────────────────────────── */

/* De onde a logo efetiva vem. A precedência é do PRODUTO, não do arquivo:

     'PROPRIA'  a logo do TV Indoor. Feita para a televisão, pode ter transparência, e vai
                direto sobre o fundo — sem placa.
     'EMPRESA'  a logo neutra da empresa (`Empresa.logoDataUrl`). Costuma vir de material
                impresso, com fundo branco embutido; sobre um fundo escuro ela ganha uma
                placa clara discreta, senão o retângulo branco aparece como um erro.
     'INICIAL'  nem uma nem outra: a inicial do nome num disco na cor de destaque.

   NUNCA a logo do totem. Os canais são irmãos, e a marca de um não é a do outro — uma loja
   pode querer no vidro do quiosque uma arte que não serve para a parede. */
export const ORIGENS_LOGO = Object.freeze(['PROPRIA', 'EMPRESA', 'INICIAL']);

export function origemDaLogo({ temPropria, temDaEmpresa } = {}) {
  if (temPropria) return 'PROPRIA';
  if (temDaEmpresa) return 'EMPRESA';
  return 'INICIAL';
}

/* A versão sobe ao TROCAR e ao REMOVER — nos dois casos o que estava em cache virou mentira.
   Editar cor não chega aqui, e é isso que impede uma troca de paleta de fazer todas as TVs
   rebaixarem uma logo que não mudou. */
export function proximaVersaoLogo(atual) {
  const base = Number.isInteger(atual) && atual >= 0 ? atual : 0;
  return base + 1;
}

/* ── Saídas ──────────────────────────────────────────────────────────────────────────── */

/* O que a TELA ADMIN lê. Sem bytes: a logo é uma URL versionada, e `logoBytes` é o TAMANHO.

   Manda os TRÊS níveis de propósito — padrão, override e efetiva. Sem os padrões, o React
   precisaria de uma cópia deles, e a cópia envelheceria no primeiro ajuste de marca. */
export function aparenciaParaAdmin(cfg, { temLogoDaEmpresa = false } = {}) {
  const linha = cfg && typeof cfg === 'object' ? cfg : {};
  const { tokens: overrides, ignoradas } = sanitizar(linha.tokens);
  const versao = linha.logoVersao ?? 0;
  const temPropria = versao > 0 && !!linha.logoTipo;
  return {
    padroes: { ...PADROES },
    overrides,
    efetivas: coresEfetivas(linha.tokens),
    // Chaves que estão no banco e não são usadas. Nunca chegam perto da TV; existem para o
    // admin poder mostrar que há lixo guardado.
    ignoradas,
    contraste: diagnosticoDeContraste(linha.tokens),
    logo: {
      tem: temPropria,
      versao,
      tipo: linha.logoTipo ?? null,
      bytes: linha.logoBytes ?? null,
      origem: origemDaLogo({ temPropria, temDaEmpresa: temLogoDaEmpresa }),
      url: temPropria ? `/api/tv-indoor/aparencia/logo?v=${versao}` : null,
    },
    chaves: CHAVES,
    pares: PARES,
  };
}

/* O bloco que vai para a TV, dentro da programação.

   Três decisões que o comentário justifica:

   · SEM BYTES. A programação é relida a cada 60 s por tela; a logo é uma URL versionada, e
     o navegador a busca uma vez por versão.

   · TOKENS EFETIVOS, não overrides. A TV não precisa saber o que é padrão e o que a loja
     mudou — ela precisa saber o que desenhar. A distinção é assunto do admin.

   · SEM ID INTERNO E SEM METADADO. Nada de `id`, `empresaId`, `criadoEm` ou `ignoradas`. O
     que a parede recebe é o que a parede usa. */
export function aparenciaPublica(cfg, { temLogoDaEmpresa = false } = {}) {
  const linha = cfg && typeof cfg === 'object' ? cfg : {};
  const versao = linha.logoVersao ?? 0;
  const temPropria = versao > 0 && !!linha.logoTipo;
  return {
    tokens: coresEfetivas(linha.tokens),
    logoVersao: versao,
    temLogoPersonalizada: temPropria,
    origemLogo: origemDaLogo({ temPropria, temDaEmpresa: temLogoDaEmpresa }),
    logoUrl: temPropria ? `/api/public/aparelho/tv/aparencia/logo?v=${versao}` : null,
  };
}
