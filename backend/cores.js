// CORES de uma paleta configurável — helper TÉCNICO, sem domínio.
//
// Saiu de `totemAparencia.js` quando a TV Indoor precisou exatamente das mesmas contas.
// Repare no que este arquivo NÃO sabe: não sabe quais são as chaves da paleta, quais pares
// merecem diagnóstico, nem quais são os padrões. Tudo isso ENTRA POR PARÂMETRO, e é por
// isso que dois canais irmãos podem dividi-lo sem um conhecer o outro.
//
// Sem Prisma, sem Express, sem I/O.

/* Limiares da WCAG 2.1. Quem decide o que é aviso e o que é bloqueio é a tela — aqui só
   se mede. `aaGrande` vale para texto grande, que numa TV é quase tudo. */
export const AA_NORMAL = 4.5;
export const AA_GRANDE = 3;

/* Motivos de recusa. Constantes porque a tela vai traduzi-los, e comparar string solta é
   como um erro deixa de aparecer depois de um typo. */
export const MOTIVO_CHAVE = 'CHAVE_DESCONHECIDA';
export const MOTIVO_COR = 'COR_INVALIDA';
export const MOTIVO_FORMATO = 'FORMATO_INVALIDO';

/* Só `#rgb` e `#rrggbb`. Sem alpha: `#rgba`/`#rrggbbaa` ficam de fora porque uma cor
   semitransparente sobre outra superfície produz um contraste que este módulo não consegue
   medir — e medir errado é pior do que não oferecer. */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;

/* Texto → `#rrggbb` minúsculo, ou `null`.

   Aceita espaço em volta (é campo de formulário, e colar de um guia de marca traz espaço).
   Não aceita mais nada: número, objeto, `null`, `transparent`, `rgb(...)`, `var(...)`. */
export function normalizarCor(valor) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  if (!HEX.test(t)) return null;
  const hex = t.slice(1).toLowerCase();
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex}`;
}

/* ENTRADA DO ADMIN — rigor.

   Devolve `{ ok, tokens, erros }`. Objeto PARCIAL é válido: mexer numa cor não obriga a
   reenviar a paleta inteira. Chave presente com valor não-string é `COR_INVALIDA`, e não
   uma forma de apagar — "voltar ao padrão" merece um caminho explícito em vez de pegar
   carona no `null`, que é o que um campo vazio manda por acidente. */
export function validarPaleta(bruto, chaves) {
  if (!ehObjeto(bruto)) return { ok: false, tokens: {}, erros: [{ chave: null, motivo: MOTIVO_FORMATO }] };
  const permitidas = Array.isArray(chaves) ? chaves : [];
  const tokens = {};
  const erros = [];
  for (const chave of Object.keys(bruto)) {
    if (!permitidas.includes(chave)) { erros.push({ chave, motivo: MOTIVO_CHAVE }); continue; }
    const cor = normalizarCor(bruto[chave]);
    if (cor === null) { erros.push({ chave, motivo: MOTIVO_COR }); continue; }
    tokens[chave] = cor;
  }
  return { ok: erros.length === 0, tokens, erros };
}

/* LEITURA — tolerância.

   Nunca lança e nunca devolve `undefined`: entrada torta vira `{}`, e a tela usa o padrão
   embarcado. `ignoradas` existe para o admin poder mostrar "isto está no banco e não é
   usado" sem que nada disso chegue perto do aparelho. */
export function sanitizarPaleta(bruto, chaves) {
  if (!ehObjeto(bruto)) return { tokens: {}, ignoradas: [] };
  const permitidas = Array.isArray(chaves) ? chaves : [];
  const tokens = {};
  const ignoradas = [];
  for (const chave of Object.keys(bruto)) {
    if (!permitidas.includes(chave)) { ignoradas.push({ chave, motivo: MOTIVO_CHAVE }); continue; }
    const cor = normalizarCor(bruto[chave]);
    if (cor === null) { ignoradas.push({ chave, motivo: MOTIVO_COR }); continue; }
    tokens[chave] = cor;
  }
  return { tokens, ignoradas };
}

/* ── Contraste (WCAG 2.1, sRGB) ──────────────────────────────────────────────────────── */

/* Luminância relativa de um canal: a curva de gama do sRGB, não o valor cru. Usar o byte
   direto é o erro clássico — dá números plausíveis e errados, e só aparece em cores médias,
   justamente onde a decisão é difícil. */
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

/* A razão CRUA, sem arredondar. É ela que decide as aprovações: 4,4996 exibido como "4,5"
   não pode passar num limiar de 4,5. */
export function razaoCrua(ca, cb) {
  const la = luminancia(ca);
  const lb = luminancia(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* Razão de contraste entre duas cores, na ordem que for — a fórmula é simétrica. Cor
   inválida devolve `null`, nunca um número inventado: contraste falso é pior que contraste
   nenhum, porque passa no teste da tela. Arredondado a duas casas para exibição; preto ×
   branco dá exatamente 21. */
export function contraste(a, b) {
  const ca = normalizarCor(a);
  const cb = normalizarCor(b);
  if (ca === null || cb === null) return null;
  return round2(razaoCrua(ca, cb));
}

/* Diagnóstico de uma lista de pares `{ id, frente, tras, rotulo }`.

   Devolve SEMPRE todos, mesmo quando faltar cor: par sem medida vem com `ratio: null` e as
   duas aprovações em `false`. Sumir com a linha esconderia justamente o caso em que a loja
   preencheu meia paleta. */
export function diagnosticar(tokens, pares, chaves) {
  const { tokens: cores } = sanitizarPaleta(tokens, chaves);
  return (Array.isArray(pares) ? pares : []).map((p) => {
    const a = cores[p.frente];
    const b = cores[p.tras];
    if (!a || !b) return { ...p, ratio: null, aaNormal: false, aaGrande: false, medido: false };
    const cru = razaoCrua(a, b);
    return { ...p, ratio: round2(cru), aaNormal: cru >= AA_NORMAL, aaGrande: cru >= AA_GRANDE, medido: true };
  });
}

/* `#rrggbb` → `rgba(r, g, b, alpha)`.

   Existe para as cores DERIVADAS — uma divisória, um véu — que precisam acompanhar um token
   configurável sem virar um sétimo campo na tela. O alvo é WebView de TV, onde `color-mix`
   pode não existir; a conta feita aqui chega pronta como texto. */
export function comAlpha(cor, alpha) {
  const c = normalizarCor(cor);
  if (c === null) return null;
  const a = Number(alpha);
  if (!Number.isFinite(a) || a < 0 || a > 1) return null;
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
