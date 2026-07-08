// Máscara de moeda BR (centavos fixos): o usuário digita só dígitos e a vírgula
// entra sozinha. Ex.: "2" -> "0,02", "200" -> "2,00", "2000" -> "20,00".
export function mascaraMoeda(valor) {
  const digitos = String(valor).replace(/\D/g, '')
  if (!digitos) return ''
  return (parseInt(digitos, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Converte o texto mascarado de volta pra número. "2,00" -> 2, "2.000,00" -> 2000.
export function parseMoeda(valor) {
  if (typeof valor === 'number') return valor
  const digitos = String(valor).replace(/\D/g, '')
  return digitos ? parseInt(digitos, 10) / 100 : NaN
}

// Número (ou ''/null) -> texto mascarado ("39,00"). Usado para popular o input ao
// editar (o valor vem do banco como número).
export function numeroParaMascara(n) {
  if (n === '' || n == null) return ''
  const num = Number(n)
  if (!Number.isFinite(num)) return ''
  return mascaraMoeda(String(Math.round(num * 100)))
}
