// Formatadores compartilhados entre o Dashboard e os Relatórios do cliente.
export const ymd = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
export const fmtBR = (s) => { const p = String(s || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s }
export const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const brlExato = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const num = (n) => (Number(n) || 0).toLocaleString('pt-BR')
export const x2 = (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
export const kFmt = (n) => {
  const v = Number(n) || 0
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
export const diaCurto = (s) => { const p = String(s || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : s }
