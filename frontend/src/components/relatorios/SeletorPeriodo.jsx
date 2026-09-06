import { useState, useEffect, useRef } from 'react'
import { fmtBR } from './formatos'

export const PRESETS = [
  { v: 'today',      l: 'Hoje' },
  { v: 'yesterday',  l: 'Ontem' },
  { v: 'this_week',  l: 'Esta semana' },
  { v: 'last_7d',    l: 'Últimos 7 dias' },
  { v: 'last_14d',   l: 'Últimos 14 dias' },
  { v: 'last_30d',   l: 'Últimos 30 dias' },
  { v: 'this_month', l: 'Este mês' },
  { v: 'last_month', l: 'Mês passado' },
]

const ymdLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Converte um preset em { since, until } (datas YYYY-MM-DD). "Últimos N dias"
// terminam ONTEM (dias fechados) — igual ao Gerenciador de Anúncios do Meta.
export function rangeDoPreset(preset) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dia = 86400000
  const ontem = new Date(hoje.getTime() - dia)
  const r = (since, until) => ({ since: ymdLocal(since), until: ymdLocal(until), preset })
  switch (preset) {
    case 'today':      return r(hoje, hoje)
    case 'yesterday':  return r(ontem, ontem)
    case 'this_week':  return r(new Date(hoje.getTime() - 6 * dia), hoje) // últimos 6 dias + hoje

    case 'last_7d':    return r(new Date(ontem.getTime() - 6 * dia), ontem)
    case 'last_30d':   return r(new Date(ontem.getTime() - 29 * dia), ontem)
    case 'this_month': return r(new Date(hoje.getFullYear(), hoje.getMonth(), 1), hoje)
    case 'last_month': return r(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), new Date(hoje.getFullYear(), hoje.getMonth(), 0))
    case 'last_14d':
    default:           return r(new Date(ontem.getTime() - 13 * dia), ontem)
  }
}

const inputData = { flex: 1, minWidth: 0, border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 8px', fontSize: 12, color: '#404040' }

function IconeCalendario() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function IconeChevron({ aberto }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// Seletor de período (presets + personalizado), estilo date-range.
export default function SeletorPeriodo({ valor, onChange }) {
  const [aberto, setAberto] = useState(false)
  const [deCustom, setDeCustom] = useState(valor.since)
  const [ateCustom, setAteCustom] = useState(valor.until)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  const escolherPreset = (v) => {
    const r = rangeDoPreset(v)
    setDeCustom(r.since); setAteCustom(r.until)
    onChange(r); setAberto(false)
  }
  const aplicarCustom = () => {
    if (!deCustom || !ateCustom) return
    const [a, b] = deCustom <= ateCustom ? [deCustom, ateCustom] : [ateCustom, deCustom]
    onChange({ since: a, until: b, preset: 'custom' }); setAberto(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--app-surface)',
          border: '1px solid #e5e5e5', borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
          fontSize: 13, color: 'var(--app-text)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <IconeCalendario />
        <span style={{ fontWeight: 600 }}>{fmtBR(valor.since)} → {fmtBR(valor.until)}</span>
        <IconeChevron aberto={aberto} />
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, width: 248,
          background: 'var(--app-surface)', border: '1px solid #e5e5e5', borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 6,
        }}>
          {PRESETS.map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => escolherPreset(p.v)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: valor.preset === p.v ? 'var(--app-highlight)' : 'transparent',
                color: valor.preset === p.v ? '#ea580c' : '#404040',
                fontWeight: valor.preset === p.v ? 700 : 500,
                fontSize: 13, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
              }}
            >
              {p.l}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 4px', paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 0.4, padding: '0 8px 6px', fontWeight: 700 }}>
              Personalizado
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '0 8px' }}>
              <input type="date" value={deCustom} max={ateCustom || undefined} onChange={(e) => setDeCustom(e.target.value)} style={inputData} />
              <input type="date" value={ateCustom} min={deCustom || undefined} onChange={(e) => setAteCustom(e.target.value)} style={inputData} />
            </div>
            <button type="button" className="btn btn-primary btn-sm" style={{ width: 'calc(100% - 16px)', margin: '8px 8px 4px' }} onClick={aplicarCustom}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
