// DURAÇÃO RELATIVA — "há 18s", "há 4h 2min". Módulo puro e compartilhado.
//
// ── POR QUE RELATIVO ──────────────────────────────────────────────────────────────────
// Quem abre uma tela de operação quer saber se a TV está viva AGORA. Um horário absoluto
// ("14:32") obriga a fazer a conta de cabeça justamente no momento em que a pessoa está com
// pressa — e ela vai errar, porque não sabe de cor que horas são.
//
// ── POR QUE COMPACTO ──────────────────────────────────────────────────────────────────
// `4 h 2 min` tem três espaços e lê como frase. `4h 2min` lê como medida, que é o que é.
// Numa lista de oitenta aparelhos essa diferença é a diferença entre varrer e ler.
//
// ── POR QUE COMPARTILHADO ─────────────────────────────────────────────────────────────
// Havia três cópias disto no projeto, cada uma com seu arredondamento e seu espaçamento.
// Três formatadores da mesma grandeza divergem sempre — e divergem devagar, de um jeito que
// ninguém nota até duas telas mostrarem tempos diferentes para o mesmo instante.

const MIN = 60
const HORA = 60 * MIN
const DIA = 24 * HORA

/* Segundos → texto compacto. Uma unidade abaixo de um minuto, duas acima disso: "4h 2min"
   informa, "4h 2min 13s" só atrapalha — ninguém age com base nos segundos de uma TV que
   está fora há horas. */
export function compacta(segundos) {
  // A validação vem ANTES do `Math.max`, e isso não é estilo: `Number(null)` é 0, e um
  // `isFinite` depois do clamp nunca mais vê o problema — `compacta(null)` devolvia "0s",
  // que numa tela de operação lê como "acabou de acontecer".
  if (segundos === null || segundos === undefined || segundos === '') return null
  const bruto = Number(segundos)
  if (!Number.isFinite(bruto)) return null
  const s = Math.max(0, Math.round(bruto))
  if (s < MIN) return `${s}s`
  if (s < HORA) return `${Math.floor(s / MIN)}min`
  if (s < DIA) {
    const h = Math.floor(s / HORA)
    const m = Math.floor((s % HORA) / MIN)
    return m ? `${h}h ${m}min` : `${h}h`
  }
  const d = Math.floor(s / DIA)
  const h = Math.floor((s % DIA) / HORA)
  return h ? `${d}d ${h}h` : `${d}d`
}

/* Quanto tempo se passou desde `iso`, na forma "há X".

   A âncora é `agoraIso` — o relógio do SERVIDOR, que veio na mesma resposta. Usar o do
   navegador faria um computador com a hora adiantada mostrar "há 2 horas" numa TV que bateu
   agora; o `Date.now()` é só o último recurso, para quando não há âncora nenhuma.

   `null` quando não há instante: quem chama decide o que escrever no lugar, porque "nunca se
   comunicou" e "sem dados" são frases diferentes em telas diferentes. */
export function haQuanto(iso, agoraIso) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const base = Date.parse(agoraIso ?? '')
  const agora = Number.isFinite(base) ? base : Date.now()
  return `há ${compacta((agora - t) / 1000)}`
}

/* A mesma medida, para uma duração que já vem em segundos (uptime do player). Sem "há":
   "Player ativo há 3h 42min" já traz o "há" na etiqueta, e repetir soaria errado. */
export const duracao = (segundos) => (Number(segundos) >= 0 ? compacta(segundos) : null)
