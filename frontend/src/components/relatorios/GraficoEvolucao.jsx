import { useState } from 'react'
import { diaCurto } from './formatos'

const CORES = { brand: '#f97316', success: '#10b981', neutro: '#1e293b', info: '#3b82f6' }
const W = 640, H = 210, PADL = 8, PADR = 8, PADTOP = 14, PADBOT = 26
const INNERW = W - PADL - PADR
const INNERH = H - PADTOP - PADBOT
const BASE = PADTOP + INNERH

// Path suave (Catmull-Rom → Bézier).
function smoothPath(pts) {
  if (!pts.length) return ''
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

// Gráfico de evolução: N linhas suaves sobre uma série diária. Genérico o bastante
// para Investimento×Receita (Meta), Investimento×Conversões (Google) e Faturamento
// (Cardápio). Reusa a mesma geometria dos gráficos do Dashboard, com eixo X por dia.
export default function GraficoEvolucao({ serie, serieConfig, formatValor = (n) => (Number(n) || 0).toLocaleString('pt-BR') }) {
  const [hover, setHover] = useState(null)
  const data = Array.isArray(serie) ? serie : []
  if (!data.length) return <div className="empty-state" style={{ padding: '40px 20px' }}>Sem dados no período.</div>

  const chaves = serieConfig.map((s) => s.chave)
  const maxDados = Math.max(...data.flatMap((d) => chaves.map((c) => Number(d[c]) || 0)), 0)
  const max = (maxDados * 1.08) || 1
  const xAt = (i) => (data.length === 1 ? PADL + INNERW / 2 : PADL + (i / (data.length - 1)) * INNERW)
  const yAt = (v) => BASE - (((Number(v) || 0) / max) * INNERH)
  const colW = INNERW / data.length
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        {serieConfig.map((s) => (
          <span key={s.chave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#737373' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: CORES[s.cor] || s.cor, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => {
            const gy = BASE - t * INNERH
            return (
              <g key={t}>
                <line x1={PADL} y1={gy} x2={W - PADR} y2={gy} stroke="#f0f0f0" strokeWidth="1" />
              </g>
            )
          })}
          {serieConfig.map((s) => {
            const cor = CORES[s.cor] || s.cor
            const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d[s.chave]) }))
            return <path key={s.chave} d={smoothPath(pts)} fill="none" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          })}
          {data.map((d, i) => (
            <rect key={i} x={xAt(i) - colW / 2} y={PADTOP} width={colW} height={INNERH} fill="transparent"
              onMouseEnter={() => setHover({ i, leftPct: (xAt(i) / W) * 100, topPct: (Math.min(...serieConfig.map((s) => yAt(d[s.chave]))) / H) * 100 })} />
          ))}
          {data.map((d, i) => {
            if (data.length > 8 && i !== 0 && i !== data.length - 1 && i !== Math.floor((data.length - 1) / 2)) return null
            return <text key={i} x={xAt(i)} y={H - 9} fontSize="11" fill={hover?.i === i ? 'var(--app-text)' : '#737373'} textAnchor="middle" style={{ pointerEvents: 'none' }}>{diaCurto(d.data)}</text>
          })}
        </svg>
        {hover && data[hover.i] && (
          <div style={{
            position: 'absolute', left: `${hover.leftPct}%`, top: `${hover.topPct}%`,
            transform: 'translate(-50%, calc(-100% - 12px))', background: '#1f2937', color: '#fff',
            borderRadius: 8, padding: '8px 10px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
            zIndex: 5, boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{diaCurto(data[hover.i].data)}</div>
            {serieConfig.map((s) => (
              <div key={s.chave} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES[s.cor] || s.cor, display: 'inline-block' }} />
                <span style={{ color: '#cbd5e1' }}>{s.label}</span>
                <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{formatValor(data[hover.i][s.chave])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
