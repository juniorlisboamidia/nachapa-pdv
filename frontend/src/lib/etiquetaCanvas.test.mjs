// Teste node puro (sem framework, sem browser): canvas não existe fora do navegador, então
// este arquivo cria um stub mínimo de canvas/ctx — só o suficiente para os 4 `desenhar*`
// rodarem até o fim sem lançar. Não valida pixel nenhum (isso exigiria um canvas de
// verdade); valida o contrato: para cada modelo, com fonte NORMAL e GRANDE, o desenho
// completa e a largura final é sempre 384 (LARGURA_PX) — a invariante que a impressão real
// depende (niimbotB1.imprimir estoura se a largura do canvas divergir).
import { desenharEtiqueta, dadosExemplo, MODELOS } from './etiquetaCanvas.js'

let falhou = false

function ok(desc, cond) {
  if (cond) {
    console.log(`  ok   ${desc}`)
  } else {
    falhou = true
    console.log(`  FAIL ${desc}`)
  }
}

// ctx stub: só métodos/props que os 4 `desenhar*` chamam. Tudo no-op — o objetivo é
// detectar exceções (ex.: função undefined, .length de algo que não existe), não pixels.
function criarCtxStub() {
  return {
    fillStyle: '', font: '', textBaseline: '', textAlign: '',
    fillRect() {}, fillText() {}, save() {}, restore() {}, rotate() {}, translate() {},
    beginPath() {}, closePath() {}, fill() {}, measureText: () => ({ width: 10 }),
  }
}

function criarCanvasStub() {
  const ctx = criarCtxStub()
  return { width: 0, height: 0, getContext: () => ctx }
}

console.log('== desenharEtiqueta — 4 modelos × 2 fontes ==')
for (const { id } of MODELOS) {
  for (const fonte of ['NORMAL', 'GRANDE']) {
    const canvas = criarCanvasStub()
    const config = { alturaMm: 40, modelo: id, fonte, razaoSocial: 'X', cnpj: '1', sif: '', sie: '' }
    let lancou = false
    try {
      desenharEtiqueta(canvas, dadosExemplo(), config)
    } catch (e) {
      lancou = e
    }
    ok(`${id} / fonte ${fonte} não lança`, !lancou)
    if (lancou) console.log(`       -> ${lancou.stack || lancou}`)
    ok(`${id} / fonte ${fonte} — canvas.width === 384`, canvas.width === 384)
  }
}

// modelo desconhecido/ausente cai no default (CLASSICO) em vez de quebrar — é o `|| desenharClassico`
// do dispatch.
console.log('== fallback de modelo desconhecido ==')
{
  const canvas = criarCanvasStub()
  let lancou = false
  try {
    desenharEtiqueta(canvas, dadosExemplo(), { alturaMm: 40, modelo: 'NAO_EXISTE', fonte: 'NORMAL', razaoSocial: 'X', cnpj: '1' })
  } catch (e) {
    lancou = e
  }
  ok('modelo inválido não lança (cai no CLASSICO)', !lancou)
  ok('modelo inválido — canvas.width === 384', canvas.width === 384)
}

console.log('== MODELOS ==')
ok('MODELOS tem 4 entradas', MODELOS.length === 4)
ok('MODELOS tem os 4 ids esperados', ['CLASSICO', 'VALIDADE', 'LATERAL_QR', 'COMPACTO'].every((id) => MODELOS.some((m) => m.id === id)))

console.log(falhou ? '\nFALHOU' : '\nOK')
process.exit(falhou ? 1 : 0)
