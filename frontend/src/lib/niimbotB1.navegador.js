// Roda no navegador (precisa de canvas). Chame de um console ou de uma página
// temporária: import('./lib/niimbotB1.test.js').then(m => m.run())
import { canvasParaBitmap } from './niimbotB1'

export function run() {
  const c = document.createElement('canvas')
  c.width = 16; c.height = 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 16, 2)
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 8, 1) // 8 px pretos na 1ª linha

  const bmp = canvasParaBitmap(c)
  const l0 = bmp.linhas[0], l1 = bmp.linhas[1]

  // Alfa parcial: o canvas NÃO leva fundo branco, senão o próprio canvas compõe e o
  // pixel chegaria opaco no getImageData — o caso não seria exercitado. Pintando sobre
  // o transparente, o pixel chega (0,0,0,64) e quem compõe é o canvasParaBitmap.
  // A lib faz fillRect branco + drawImage antes de thresholdar, então preto com alfa 64
  // vira ~191 e sai BRANCO. A versão antiga desta função dizia PRETO (thresholdava o
  // RGB cru): era exatamente a divergência.
  const ca = document.createElement('canvas')
  ca.width = 8; ca.height = 1
  const ctxa = ca.getContext('2d')
  ctxa.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctxa.fillRect(0, 0, 8, 1) // preto, alfa ~64
  const bmpAlfa = canvasParaBitmap(ca)

  // deslocamentoY: a arte desce dy linhas (as de cima saem brancas), igual ao
  // drawImage(bmp, 0, dy, …) da lib.
  const co = document.createElement('canvas')
  co.width = 8; co.height = 2
  const ctxo = co.getContext('2d')
  ctxo.fillStyle = '#fff'; ctxo.fillRect(0, 0, 8, 2)
  ctxo.fillStyle = '#000'; ctxo.fillRect(0, 0, 8, 1) // preto na 1ª linha
  const bmpOff = canvasParaBitmap(co, { deslocamentoY: 1 })

  const ok = [
    ['2 bytes por linha', l0.length === 2],
    ['8 px pretos = 0xFF no 1º byte', l0[0] === 0xff],
    ['resto branco = 0x00', l0[1] === 0x00],
    ['2ª linha toda branca', l1[0] === 0x00 && l1[1] === 0x00],
    ['altura preservada', bmp.altura === 2],
    ['alfa 0 (transparente) = branco', canvasParaBitmap(semFundo(8, 1)).linhas[0][0] === 0x00],
    ['preto com alfa 64 compõe sobre branco e sai BRANCO (igual à lib)', bmpAlfa.linhas[0][0] === 0x00],
    ['deslocamentoY empurra a arte para baixo', bmpOff.linhas[0][0] === 0x00 && bmpOff.linhas[1][0] === 0xff],
  ]
  ok.forEach(([n, v]) => console.log(v ? `ok   ${n}` : `FALHA ${n}`))
  return ok.every(([, v]) => v)
}

// Canvas intocado: todo pixel (0,0,0,0).
function semFundo(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}
