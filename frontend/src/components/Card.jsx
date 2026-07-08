const VALUE_COLOR = {
  success: 'clr-green',
  brand:   'clr-orange',
  warn:    'clr-yellow',
  danger:  'clr-red',
  info:    'clr-blue'
}

export default function Card({ title, value, hint, variant, badge, children }) {
  const valueClass = VALUE_COLOR[variant] || ''

  return (
    <div className="card">
      {title && <div className="card-label">{title}</div>}
      {value !== undefined && (
        <div className={'card-value' + (valueClass ? ' ' + valueClass : '')}>{value}</div>
      )}
      {hint && <div className="card-hint">{hint}</div>}
      {badge && <div style={{ marginTop: 8 }}>{badge}</div>}
      {children}
    </div>
  )
}
