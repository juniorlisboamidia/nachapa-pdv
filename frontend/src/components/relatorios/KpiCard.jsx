// KPI card com pill de variação (%) e variação absoluta vs período anterior.
// Compartilhado entre o Dashboard e os Relatórios do cliente.

// Cores do comparativo conforme o modo e o sentido da variação.
export function coresVariacao(modo, sobe, zero) {
  if (modo !== 'bom-sobe' || zero) return { fg: '#64748b', bg: '#f1f5f9' }     // neutro
  return sobe ? { fg: '#16a34a', bg: '#dcfce7' } : { fg: '#dc2626', bg: '#fee2e2' }
}

// Pill arredondado com a variação %.
export function Pill({ pct, modo }) {
  const sobe = pct > 0, zero = pct === 0
  const { fg, bg } = coresVariacao(modo, sobe, zero)
  const seta = zero ? '→' : sobe ? '↗' : '↘'
  const txt = `${sobe ? '+' : ''}${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, background: bg, color: fg,
      fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>{seta}</span>{txt}
    </span>
  )
}

export default function KpiCard({ label, valor, atual, anterior, formatAbs, modo, variant }) {
  const temAnterior = anterior !== null && anterior !== undefined
  const abs = temAnterior ? (Number(atual) || 0) - anterior : 0
  const pct = (temAnterior && anterior > 0) ? Math.round((abs / anterior) * 1000) / 10 : null
  const sobe = abs > 0, zero = abs === 0
  const { fg } = coresVariacao(modo, sobe, zero)
  const valueClass = variant === 'success' ? 'clr-green' : variant === 'brand' ? 'clr-orange' : ''

  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <div className={'card-value' + (valueClass ? ' ' + valueClass : '')}>{valor}</div>
        {pct !== null && <Pill pct={pct} modo={modo} />}
      </div>
      {temAnterior ? (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <span style={{ color: fg, fontWeight: 700 }}>{abs >= 0 ? '+' : '−'}{formatAbs(Math.abs(abs))}</span>
          <span style={{ color: '#a3a3a3', marginLeft: 5 }}>vs período anterior</span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: '#bbb' }}>sem período anterior</div>
      )}
    </div>
  )
}
