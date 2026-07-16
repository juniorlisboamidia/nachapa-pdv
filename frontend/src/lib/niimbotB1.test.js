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
  const ok = [
    ['2 bytes por linha', l0.length === 2],
    ['8 px pretos = 0xFF no 1º byte', l0[0] === 0xff],
    ['resto branco = 0x00', l0[1] === 0x00],
    ['2ª linha toda branca', l1[0] === 0x00 && l1[1] === 0x00],
    ['altura preservada', bmp.altura === 2],
  ]
  ok.forEach(([n, v]) => console.log(v ? `ok   ${n}` : `FALHA ${n}`))
  return ok.every(([, v]) => v)
}
