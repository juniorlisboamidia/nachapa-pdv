// AGENDA de uma peça de mídia — helper TÉCNICO, sem domínio.
//
// Saiu de `totemBanner.js` quando a TV Indoor precisou da mesma semântica. O que ele sabe
// é só isto: uma peça pode ter um início e um fim, em instante ABSOLUTO, e a pergunta
// "está no ar agora?" se responde comparando com um instante que ENTRA POR PARÂMETRO.
// Não sabe o que é banner, conteúdo, capa ou playlist.
//
// ── SOBRE O RELÓGIO ───────────────────────────────────────────────────────────────────
// `agoraMs` nunca é lido aqui dentro. É o mesmo contrato de `clientes/inadimplencia.js` no
// HUB, e existe porque teste que lê `Date.now()` passa hoje e quebra sozinho em duas
// semanas. Quem decide o instante é quem chama — no aparelho, é o relógio CORRIGIDO pelo
// desvio do servidor.
//
// ── SOBRE O FUSO ──────────────────────────────────────────────────────────────────────
// Instante absoluto, sempre. O PDV não tem fuso por loja, e inventar um a partir do
// relógio do VPS faria a agenda de uma loja depender de onde o servidor está hospedado. O
// admin converte a hora local do navegador antes de mandar.

/* Texto ISO (ou Date) → milissegundos, ou `null`. */
export function instante(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/* A janela é coerente? `fim <= início` é entrada inválida: uma janela que fecha antes de
   abrir nunca exibiria a peça, e aceitar em silêncio deixaria o gestor esperando por algo
   que não vai aparecer nunca. */
export function janelaValida({ inicioEm, fimEm } = {}) {
  const i = instante(inicioEm);
  const f = instante(fimEm);
  if (i === null || f === null) return true;
  return f > i;
}

/* Está dentro da janela AGORA?

   As bordas: o início é INCLUSIVO e o fim é EXCLUSIVO, para uma peça que termina às 18:00
   não dividir esse segundo com a que começa às 18:00. Sem janela, está sempre dentro. */
export function dentroDaJanela({ inicioEm, fimEm } = {}, agoraMs) {
  if (!Number.isFinite(agoraMs)) return false;
  const i = instante(inicioEm);
  const f = instante(fimEm);
  if (i !== null && agoraMs < i) return false;
  if (f !== null && agoraMs >= f) return false;
  return true;
}

/* O rótulo que o admin lê. Derivado, NUNCA guardado em coluna: um status persistido
   envelhece sozinho e passa a mentir no minuto seguinte ao vencimento.

   `ativo` é o liga-desliga da loja e vence tudo: desligado é INATIVO, tenha a agenda que
   tiver. */
export function statusDaJanela(peca, agoraMs) {
  if (!peca) return 'INATIVO';
  if (peca.ativo !== true) return 'INATIVO';
  const i = instante(peca.inicioEm);
  const f = instante(peca.fimEm);
  if (f !== null && Number.isFinite(agoraMs) && agoraMs >= f) return 'ENCERRADO';
  if (i !== null && Number.isFinite(agoraMs) && agoraMs < i) return 'AGENDADO';
  return 'ATIVO';
}

/* Inteiro dentro de uma faixa, com o padrão na dúvida — a régua de LEITURA das durações.
   Grampeia em vez de recusar quando o valor é numérico: no caminho de leitura o que
   importa é continuar com uma duração sensata. A ESCRITA (validação do corpo) recusa, e
   isso é decisão de cada canal. */
export function duracaoNaFaixa(valor, { min, max, padrao }) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return padrao;
  if (typeof valor === 'string' && valor.trim() === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  const i = Math.round(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}
