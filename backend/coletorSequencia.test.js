// Sequência de tipo (ENTRADA/SAIDA) das batidas do COLETOR DIXI. O bug reportado: turno
// que cruza a meia-noite saía invertido (a saída da madrugada virava ENTRADA e tudo
// depois deslocava) porque a janela era o DIA CIVIL, não o DIA DE EXPEDIENTE (corte 05:00
// BR) — o mesmo bug já corrigido no fluxo do tablet (server.js), que não tinha chegado ao
// coletor. Este teste trava a regra: batida de madrugada após uma entrada da noite é SAÍDA.
//
// Roda sem framework: `node coletorSequencia.test.js`. Um `prisma` de mentira aplica o
// filtro de dataHora do `where` sobre um dataset fixo (o filtro É o que estava errado).
import { proximoTipoPontoNaData } from './coletorServer.js'

let ok = 0, fail = 0
const t = (n, real, esp) => {
  if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`) }
  else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`) }
}

// BR (UTC-3) → instante Date. mo é 1-based aqui pra legibilidade.
const BR = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi) - -180 * 60000)

// prisma de mentira: findMany aplica o where.dataHora (gte/lt) ao dataset — assim o teste
// exercita de fato a JANELA, que é o ponto do bug. `funcionario` sem jornada (jornadaId
// null) mantém estes casos no puro entrada/saída; a regra da jornada é testada à parte
// em pontoTipo.test.js.
function fakePrisma(batidas, funcionario = { jornadaId: null, folgaSemana: [] }) {
  return {
    pontoRegistro: {
      findMany: async ({ where }) => {
        const gte = where.dataHora.gte.getTime(), lt = where.dataHora.lt.getTime()
        return batidas
          .filter((b) => b.dataHora.getTime() >= gte && b.dataHora.getTime() < lt)
          .sort((a, b) => a.dataHora - b.dataHora)
          .map((b) => ({ tipo: b.tipo }))
      },
    },
    funcionario: { findFirst: async () => funcionario },
    jornada: { findFirst: async () => null },
  }
}

console.log('\n== coletor: sequência entrada/saída no dia de expediente ==')

// Cenário do bug: ENTRADA às 18:00 de 18/07; a batida das 00:30 de 19/07 é do MESMO
// expediente (turno da noite) → deve ser SAÍDA, não abrir uma ENTRADA nova.
const comEntradaNoite = fakePrisma([{ tipo: 'ENTRADA', dataHora: BR(2026, 7, 18, 18, 0) }])
t('madrugada (00:30) após entrada da noite = SAIDA',
  await proximoTipoPontoNaData(comEntradaNoite, 1, 1, BR(2026, 7, 19, 0, 30), false), 'SAIDA')

// A primeira batida real do expediente (sem prévia na janela) é ENTRADA.
t('primeira batida do expediente = ENTRADA',
  await proximoTipoPontoNaData(fakePrisma([]), 1, 1, BR(2026, 7, 18, 18, 0), false), 'ENTRADA')

// Batida antes das 05:00 pertence ao expediente que começou às 05:00 do dia ANTERIOR:
// uma ENTRADA às 04:00 e a saída às 04:30 do mesmo dia continuam no mesmo expediente.
const madrugada = fakePrisma([{ tipo: 'ENTRADA', dataHora: BR(2026, 7, 19, 4, 0) }])
t('04:30 após entrada 04:00 (mesmo expediente da véspera) = SAIDA',
  await proximoTipoPontoNaData(madrugada, 1, 1, BR(2026, 7, 19, 4, 30), false), 'SAIDA')

// Sanidade: dois expedientes distintos não se misturam. ENTRADA 18/07 18:00 (expediente do
// dia 18) e a chegada de 19/07 08:00 (expediente do dia 19, já passou das 05:00) → ENTRADA.
const doisExpedientes = fakePrisma([
  { tipo: 'ENTRADA', dataHora: BR(2026, 7, 18, 18, 0) },
  { tipo: 'SAIDA', dataHora: BR(2026, 7, 19, 0, 30) },
])
t('chegada 08:00 do dia seguinte (novo expediente) = ENTRADA',
  await proximoTipoPontoNaData(doisExpedientes, 1, 1, BR(2026, 7, 19, 8, 0), false), 'ENTRADA')

console.log(`\n${ok} ok, ${fail} falha(s)`)
process.exit(fail ? 1 : 0)
