// TV Indoor › a posição física da tela, do lado da TV. Módulo puro.
//
// O servidor diz a rotação (0, 90, 180, 270) e, enquanto o gestor está conferindo a
// posição, até quando vale a JANELA DE AJUSTE. Aqui moram só as duas contas que o player
// faz com isso — e que não dá para testar de dentro do componente.

export const ROTACOES = Object.freeze([0, 90, 180, 270])

// De quanto em quanto tempo a TV consulta o servidor durante o ajuste. Fora dele é uma vez
// por minuto; com o gestor olhando para a parede e apertando "girar", um minuto por
// tentativa transformaria dez segundos de conferência em três minutos de espera.
export const MS_AJUSTE = 5_000

// TETO da janela, do lado da TV. O relógio do aparelho não é confiável (tablet Android sem
// rede erra por horas), e uma data de fim lida com o relógio errado poderia manter a TV
// batendo no servidor a cada 5 s por um dia inteiro. O servidor abre janelas de 10 min;
// nada legítimo passa de 15.
export const MS_TETO_AJUSTE = 15 * 60_000

/* Rotação vinda de fora → um valor do catálogo, ou `null` quando não é nenhum.
   `null` significa "não sei" e quem chama mantém o que tinha: um servidor de versão
   anterior não manda o campo, e isso não pode desvirar uma parede que já está em pé.
   ⚠️ `typeof`, e não `Number()`: `Number(null)` é 0, que é uma rotação VÁLIDA — a ausência
   viraria "gire de volta para deitado". */
export function rotacaoValida(v) {
  return typeof v === 'number' && ROTACOES.includes(v) ? v : null
}

/* A classe que o player põe na raiz. Deitada e sem giro não leva classe nenhuma: é o caso
   de toda TV que já existe, e o DOM delas continua byte a byte como era. */
export function classeDoGiro(rotacao) {
  const r = rotacaoValida(rotacao)
  return r ? ` giro-${r}` : ''
}

/* Quantos ms de consulta rápida ainda restam. Zero = fora da janela.
   `agoraMs` já vem CORRIGIDO pelo desvio do relógio do servidor. */
export function msRestantesDeAjuste(ajusteAte, agoraMs) {
  if (typeof ajusteAte !== 'string' || !ajusteAte) return 0
  const fim = Date.parse(ajusteAte)
  if (!Number.isFinite(fim) || !Number.isFinite(agoraMs)) return 0
  return Math.max(0, Math.min(fim - agoraMs, MS_TETO_AJUSTE))
}
