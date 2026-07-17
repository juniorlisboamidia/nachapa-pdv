// Gera a matriz de módulos de um QR (offline, sem servidor). O canvas da etiqueta desenha
// a matriz como quadrados — o QR carrega os dados na própria imagem.
import qrcode from 'qrcode-generator'

export function matrizQr(texto) {
  const t = String(texto ?? '') || ' ' // string vazia quebra a lib; espaço vira QR mínimo válido
  const qr = qrcode(0, 'M') // typeNumber 0 = auto; correção M
  qr.addData(t)
  qr.make()
  const n = qr.getModuleCount()
  const m = []
  for (let r = 0; r < n; r++) {
    const linha = []
    for (let c = 0; c < n; c++) linha.push(qr.isDark(r, c))
    m.push(linha)
  }
  return m
}
