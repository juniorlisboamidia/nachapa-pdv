// A régua de AGENDA e RELÓGIO no aparelho — helper técnico, sem domínio.
//
// Saiu de `components/totemBanners.js` quando a TV Indoor precisou exatamente das mesmas
// contas. O que ele sabe é só isto: o relógio do aparelho não é confiável, o servidor
// mandou o dele, e uma peça de mídia pode ter janela. Não sabe o que é banner, conteúdo,
// capa ou playlist — e é por isso que pode ser compartilhado por canais irmãos sem criar
// dependência conceitual entre eles.
//
// ── POR QUE A DECISÃO TEMPORAL É DO APARELHO ──────────────────────────────────────────
// O bootstrap (ou a programação) se refaz a cada poucos minutos. Uma peça agendada para as
// 18:00 que só entrasse no próximo refresh estrearia às 18:04. O servidor manda os
// metadados e o INSTANTE DELE; o aparelho calcula o desvio e decide a cada segundo.
//
// ── E POR QUE O DESVIO IMPORTA ────────────────────────────────────────────────────────
// Tablet Android e TV de loja sem rede erram a hora, às vezes por horas. A agenda da loja
// não pode depender disso.

/* Desvio, em milissegundos, entre o relógio do servidor e o do aparelho.

   `localMs` entra por parâmetro (nunca `Date.now()` aqui dentro) para o teste conseguir
   fixar os dois lados. Entrada torta devolve 0: sem desvio conhecido, vale o aparelho —
   que é melhor do que não exibir nada. */
export function desvioDoRelogio(agoraServidor, localMs) {
  const servidor = agoraServidor ? new Date(agoraServidor).getTime() : NaN
  if (!Number.isFinite(servidor) || !Number.isFinite(localMs)) return 0
  return servidor - localMs
}

/* A mesma pergunta que o servidor faz, com as mesmas bordas: início INCLUSIVO, fim
   EXCLUSIVO. Duplicada do backend de propósito — o aparelho não importa módulo do
   servidor, o contrato entre os dois é o JSON, e as duas implementações são presas por
   testes que comparam as bordas nos dois lados. */
export function dentroDaJanela(peca, agoraMs) {
  if (!peca) return false
  if (!Number.isFinite(agoraMs)) return false
  const i = peca.inicioEm ? new Date(peca.inicioEm).getTime() : null
  const f = peca.fimEm ? new Date(peca.fimEm).getTime() : null
  if (i !== null && Number.isFinite(i) && agoraMs < i) return false
  if (f !== null && Number.isFinite(f) && agoraMs >= f) return false
  return true
}

/* Duração de UMA peça em ms, dentro da faixa do canal.

   O canal passa a faixa dele — o totem gira em 3–60 s, a TV em 3–120 s. Este é o portão
   SEGUINTE ao do servidor, e ele não confia no anterior: um `0` que escapasse viraria um
   `setTimeout(0)` girando a lista a cada quadro.

   O TIPO antes da conversão: `Number(null)` é 0 e `Number(true)` é 1, e nenhum dos dois é
   alguém configurando duração. Sem esta linha, ausência viraria o piso em vez do padrão. */
export function duracaoEmMs(bruto, { minS, maxS, padraoS }) {
  if (typeof bruto !== 'number' && typeof bruto !== 'string') return padraoS * 1000
  if (typeof bruto === 'string' && bruto.trim() === '') return padraoS * 1000
  const n = Number(bruto)
  if (!Number.isFinite(n)) return padraoS * 1000
  const ms = Math.round(n) * 1000
  if (ms < minS * 1000) return minS * 1000
  if (ms > maxS * 1000) return maxS * 1000
  return ms
}

/* O índice seguinte, circular. Lista vazia devolve 0 — nunca `NaN`, que viraria um índice
   inválido e uma tela em branco. */
export function proximoIndice(indice, total) {
  if (!Number.isFinite(total) || total <= 0) return 0
  const i = Number.isFinite(indice) ? indice : 0
  return (i + 1) % total
}
