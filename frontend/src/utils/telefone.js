// Telefone/WhatsApp — formatação BR reutilizável (extraído de Entregadores).

// WhatsApp cru (só dígitos, com ou sem DDI 55) → "(89) 98121-7084". Read-only.
export function formatarWhats(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return String(raw ?? '') || '—'
}

// Máscara progressiva p/ digitar: vai formatando como (89) 99999-9999. Idempotente.
// O backend normaliza p/ dígitos, então pode enviar formatado.
export function mascararTelefone(valor) {
  let d = String(valor ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
