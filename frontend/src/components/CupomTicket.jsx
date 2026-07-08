// Cupom estilo ticket com faixa de brilho animada (sweep a cada ~3s).
// Usado na página pública do amigo e na prévia da tela de Personalização.

// Monta o background do cupom a partir da config (sólido ou degradê).
// Tolera hex parcial/ inválido (enquanto o gestor digita) caindo no padrão.
export function cupomBg(visual) {
  if (!visual) return undefined
  const hex = (c, d) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : d)
  const c1 = hex(visual.cupomCor1, '#ecc558')
  const c2 = hex(visual.cupomCor2, '#c48a1c')
  if (visual.cupomCorTipo === 'solido') return c1
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
}

export default function CupomTicket({ eyebrow, value, mono, valueSize, caption, bg }) {
  return (
    <div className="ind-ticket" style={bg ? { background: bg } : undefined}>
      <div className="ind-ticket-clip"><span className="ind-ticket-shine" /></div>
      {eyebrow && <div className="ind-ticket-eyebrow">{eyebrow}</div>}
      <div className={'ind-ticket-value' + (mono ? ' ind-ticket-code' : '')} style={valueSize ? { fontSize: valueSize } : undefined}>{value}</div>
      <div className="ind-ticket-perf" />
      {caption && <div className="ind-ticket-caption">{caption}</div>}
    </div>
  )
}
