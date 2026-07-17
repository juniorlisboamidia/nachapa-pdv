// Roda em node puro (sem framework). Rodar: node src/lib/qr.test.mjs
import { matrizQr } from './qr.js'
let ok = 0, fail = 0
const t = (n, cond) => { if (cond) { ok++; console.log(`  ok   ${n}`) } else { fail++; console.log(`  FALHA ${n}`) } }

const abc = matrizQr('abc')
t('abc: matriz não-vazia', Array.isArray(abc) && abc.length > 0)
t('abc: matriz quadrada', abc.every(linha => linha.length === abc.length))

const vazia = matrizQr('')
t('vazia: não lança e retorna matriz', Array.isArray(vazia) && vazia.length > 0)
t('vazia: matriz quadrada', vazia.every(linha => linha.length === vazia.length))

const x1 = matrizQr('x')
const x2 = matrizQr('x')
t('determinístico: matrizQr("x") === matrizQr("x")', JSON.stringify(x1) === JSON.stringify(x2))

console.log(`\n${ok} ok, ${fail} falha(s)`)
process.exit(fail ? 1 : 0)
