// Formata CNPJ progressivamente: mantém só dígitos, corta em 14 e aplica a máscara
// XX.XXX.XXX/XXXX-XX de forma PARCIAL (funciona a qualquer estágio de digitação, não só
// com os 14 dígitos completos) — usada tanto no campo de CNPJ da Config (máscara ao
// digitar) quanto no desenho da etiqueta (formata o que já veio salvo no banco, mesmo que
// tenha sido gravado sem máscara antes desta função existir).
export function formatarCnpj(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14)
  if (!d) return ''
  let out = d.slice(0, 2)
  if (d.length > 2) out += '.' + d.slice(2, 5)
  if (d.length > 5) out += '.' + d.slice(5, 8)
  if (d.length > 8) out += '/' + d.slice(8, 12)
  if (d.length > 12) out += '-' + d.slice(12, 14)
  return out
}
