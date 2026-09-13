// Totem › o carrossel da tela de espera — módulo puro, testado em totemBanners.test.js.
//
// A régua de elegibilidade é a MESMA do servidor (`backend/totemBanner.js`): o bloco
// público carrega `ativo`, `inicioEm` e `fimEm`, e a decisão temporal acontece aqui, no
// tablet. Não é descuido — é o que faz um banner agendado para as 18:00 entrar às 18:00 em
// vez de esperar o bootstrap seguinte, que pode estar a quatro minutos de distância.
//
// ── O RELÓGIO DO APARELHO NÃO É CONFIÁVEL ─────────────────────────────────────────────
// Tablet Android sem rede erra a hora, às vezes por horas. O bootstrap traz
// `agoraServidor`; daqui sai o DESVIO entre ele e o relógio local, e todo o resto usa
// `Date.now() + desvio`. Se o `agoraServidor` não vier, o desvio é zero e o comportamento
// degrada para "confiar no aparelho", que é melhor do que não exibir nada.
//
// ── NENHUM TIMER DAQUI TEM A VER COM SESSÃO ───────────────────────────────────────────
// Ociosidade, MS_AMBIGUO e o relógio capturado da sessão são outro domínio. O carrossel só
// gira imagem numa tela onde, por definição, não há sessão nenhuma.

/* Desvio, em milissegundos, entre o relógio do servidor e o do aparelho.

   `localMs` entra por parâmetro (nunca `Date.now()` aqui dentro) para o teste conseguir
   fixar os dois lados. Entrada torta devolve 0: sem desvio conhecido, vale o aparelho. */
export function desvioDoRelogio(agoraServidor, localMs) {
  const servidor = agoraServidor ? new Date(agoraServidor).getTime() : NaN
  if (!Number.isFinite(servidor) || !Number.isFinite(localMs)) return 0
  return servidor - localMs
}

/* A mesma pergunta que o backend faz, com as mesmas bordas: início inclusivo, fim
   exclusivo. Duplicada porque o quiosque não importa módulo do servidor — o contrato entre
   os dois é o JSON, e as duas implementações são presas por um teste que compara as duas. */
export function noAr(banner, agoraMs) {
  if (!banner || banner.ativo !== true) return false
  if (!Number.isFinite(agoraMs)) return false
  const i = banner.inicioEm ? new Date(banner.inicioEm).getTime() : null
  const f = banner.fimEm ? new Date(banner.fimEm).getTime() : null
  if (i !== null && Number.isFinite(i) && agoraMs < i) return false
  if (f !== null && Number.isFinite(f) && agoraMs >= f) return false
  return true
}

/* Os banners que o carrossel deve girar agora, na ordem, já sem os que falharam ao
   carregar. `falhados` é um Set de ids: uma arte que não abriu é PULADA em vez de deixar
   um retângulo preto no vidro. */
export function paraExibir({ itens, agoraMs, falhados, tipo = 'ESPERA' } = {}) {
  const lista = Array.isArray(itens) ? itens : []
  const fora = falhados instanceof Set ? falhados : new Set()
  return lista
    // Linha antiga sem tipo é da tela de espera: era o único lugar que existia.
    .filter((b) => b && (b.tipo ?? 'ESPERA') === tipo)
    .filter((b) => b && !fora.has(b.id) && b.imagemUrl && noAr(b, agoraMs))
    .slice()
    .sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id))
}

/* Duração de UM banner em ms, com a mesma faixa do servidor. O servidor já normaliza; isto
   é o portão seguinte, e ele não confia no anterior — um `0` que escapasse viraria um
   `setTimeout(0)` girando o carrossel a cada quadro. */
export const DURACAO_MIN_MS = 3_000
export const DURACAO_MAX_MS = 60_000
export const DURACAO_PADRAO_MS = 6_000

export function duracaoMs(banner) {
  const bruto = banner?.duracaoSegundos
  // O TIPO antes da conversão: `Number(null)` é 0 e `Number(true)` é 1 — nenhum dos dois
  // é alguém configurando duração. Sem esta linha, ausência viraria o piso em vez do
  // padrão, e o carrossel giraria mais rápido do que a loja pediu.
  if (typeof bruto !== 'number' && typeof bruto !== 'string') return DURACAO_PADRAO_MS
  if (typeof bruto === 'string' && bruto.trim() === '') return DURACAO_PADRAO_MS
  const n = Number(bruto)
  if (!Number.isFinite(n)) return DURACAO_PADRAO_MS
  const ms = Math.round(n) * 1000
  if (ms < DURACAO_MIN_MS) return DURACAO_MIN_MS
  if (ms > DURACAO_MAX_MS) return DURACAO_MAX_MS
  return ms
}

/* O índice seguinte, circular. Lista vazia devolve 0 — nunca `NaN`, que viraria um índice
   inválido e uma tela em branco. */
export function proximoIndice(indice, total) {
  if (!Number.isFinite(total) || total <= 0) return 0
  const i = Number.isFinite(indice) ? indice : 0
  return (i + 1) % total
}

/* A assinatura da lista exibida: mudou de verdade, ou o bootstrap só se refez igual?

   É o que impede o carrossel de reiniciar a cada 5 minutos. Sem isto, o refresh silencioso
   remontaria a lista, o índice voltaria a zero e a arte piscaria — a cada bootstrap, para
   sempre, na frente do cliente.

   A versão da imagem entra na assinatura: trocar a arte de um banner É mudança. Trocar o
   NOME dele não é, e por isso o nome fica de fora. */
export function assinatura(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((b) => `${b.id}:${b.imagemVersao ?? 0}:${b.duracaoSegundos ?? 0}`)
    .join('|')
}

/* Qual imagem pré-carregar: a próxima da fila.

   Uma só, e não a lista inteira: o tablet tem memória modesta, e o que importa é que a
   troca não mostre um quadro vazio. Com um banner só não há o que pré-carregar. */
export function proximaParaPrecarregar(lista, indice) {
  if (!Array.isArray(lista) || lista.length < 2) return null
  return lista[proximoIndice(indice, lista.length)]?.imagemUrl ?? null
}
