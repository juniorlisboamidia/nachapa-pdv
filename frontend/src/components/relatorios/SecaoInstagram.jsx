import { useState } from 'react'
import { num, diaCurto } from './formatos'

// Seção Instagram do relatório — mesmo layout do Dashboard › Instagram (Overview
// do HUB): 4 KPIs + gráfico de alcance diário (área) e novos seguidores por dia
// (barras). KPIs: Seguidores | Novos seguidores (comparativo) | Alcance | Impressões.

// KPI: título, valor, badge de variação e rodapé.
function IgKpiCard({ titulo, valor, badge, rodape }) {
  return (
    <div className="card">
      <div className="card-label">{titulo}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <span className="card-value">{valor}</span>
        {badge}
      </div>
      {rodape && <div style={{ marginTop: 4, fontSize: 11, color: '#a3a3a3' }}>{rodape}</div>}
    </div>
  )
}

// Badge de variação (alta verde / queda vermelha).
function IgBadge({ pct, anterior }) {
  if (pct == null) return null
  const zero = pct === 0
  const c = zero ? { fg: '#64748b', bg: '#f1f5f9' } : pct > 0 ? { fg: '#16a34a', bg: '#dcfce7' } : { fg: '#dc2626', bg: '#fee2e2' }
  return (
    <span title={anterior != null ? `${num(anterior)} no período anterior` : ''}
      style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, color: c.fg, background: c.bg, whiteSpace: 'nowrap' }}>
      {pct > 0 ? '▲' : zero ? '' : '▼'} {pct > 0 ? '+' : ''}{(Number(pct) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

// ── Gráficos (altura FIXA, igual ao Overview do HUB) ──
const IG_CHART_H = 170

function igSuave(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const cx = (a.x + b.x) / 2
    d += ` C${cx.toFixed(1)},${a.y.toFixed(1)} ${cx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
  }
  return d
}

function IgGridLines() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ borderTop: '1px solid #f0f0f0' }} />)}
    </div>
  )
}

function IgSemDados() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#a3a3a3', height: IG_CHART_H }}>Sem dados no período.</div>
}

function IgTooltip({ date, value }) {
  return (
    <div style={{ position: 'absolute', bottom: '100%', marginBottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none' }}>
      <div style={{ background: '#1f2937', color: '#fff', fontSize: 10, fontWeight: 600, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>
        {diaCurto(date)} · {num(value)}
      </div>
    </div>
  )
}

function IgChartFrame({ max, pontos, children }) {
  const fracoes = [1, 0.75, 0.5, 0.25, 0]
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', width: 40, flexShrink: 0, fontSize: 10, color: '#a3a3a3', height: IG_CHART_H }}>
          {fracoes.map((f, i) => <span key={i} style={{ lineHeight: 1 }}>{num(Math.round(max * f))}</span>)}
        </div>
        <div style={{ flex: 1, position: 'relative', height: IG_CHART_H }}>
          <IgGridLines />
          {children}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 40, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#a3a3a3' }}>
          <span>{diaCurto(pontos[0]?.date)}</span>
          <span>{diaCurto(pontos[pontos.length - 1]?.date)}</span>
        </div>
      </div>
    </div>
  )
}

// Alcance diário — área suave roxa/rosa, com hover por dia.
function IgAreaChart({ pontos }) {
  const [hover, setHover] = useState(null)
  const W = 600, H = IG_CHART_H, P = 12
  if (!pontos.length) return <IgSemDados />
  const vals = pontos.map((p) => Number(p.value) || 0)
  const max = Math.max(1, ...vals)
  const n = pontos.length
  const x = (i) => (n === 1 ? W / 2 : P + (i / (n - 1)) * (W - P * 2))
  const y = (v) => P + (1 - v / max) * (H - P * 2)
  const pts = vals.map((v, i) => ({ x: x(i), y: y(v) }))
  const linha = igSuave(pts)
  const area = `${linha} L${pts[n - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
  return (
    <IgChartFrame max={max} pontos={pontos}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="igReachFillRel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#igReachFillRel)" />
        <path d={linha} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {pontos.map((p, i) => {
          const ativo = hover?.i === i
          return (
            <div key={p.date} style={{ flex: 1, position: 'relative' }} onMouseEnter={() => setHover({ i })} onMouseLeave={() => setHover(null)}>
              {ativo && (
                <>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 1, background: 'rgba(168,85,247,0.4)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: `${(y(vals[i]) / H) * 100}%`, transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#a855f7', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  <IgTooltip date={p.date} value={vals[i]} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </IgChartFrame>
  )
}

// Novos seguidores por dia — barras laranja, com hover por dia.
function IgBarChart({ pontos }) {
  const [hover, setHover] = useState(null)
  if (!pontos.length) return <IgSemDados />
  const max = Math.max(1, ...pontos.map((p) => Number(p.value) || 0))
  return (
    <IgChartFrame max={max} pontos={pontos}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end' }}>
        {pontos.map((p, i) => {
          const v = Number(p.value) || 0
          const h = Math.max(3, (v / max) * 92)
          const ativo = hover?.i === i
          return (
            <div key={p.date} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative' }}
              onMouseEnter={() => setHover({ i })} onMouseLeave={() => setHover(null)}>
              <div style={{ width: '80%', borderRadius: '3px 3px 0 0', height: `${h}%`, background: 'linear-gradient(to top,#ff5f00,#ff9a5a)', filter: ativo ? 'brightness(1.1)' : 'none' }} />
              {ativo && <IgTooltip date={p.date} value={v} />}
            </div>
          )
        })}
      </div>
    </IgChartFrame>
  )
}

function SemPerfilInstagram() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--app-text)', marginBottom: 6 }}>Nenhum perfil de Instagram conectado</div>
      <div style={{ color: '#737373', fontSize: 13.5, maxWidth: 420, margin: '0 auto' }}>
        Assim que a agência vincular um perfil de Instagram a esta loja, as métricas aparecem aqui.
      </div>
    </div>
  )
}

export default function SecaoInstagram({ dados, carregando }) {
  if (!dados && carregando) {
    return <div className="loading-state" style={{ padding: '40px 20px' }}>Carregando o Instagram…</div>
  }
  if (!dados?.conectado) {
    return <SemPerfilInstagram />
  }
  const m = dados.metricas || {}
  const perf = Array.isArray(dados.performance) ? dados.performance : []
  const reachPontos = perf.map((p) => ({ date: p.date, value: p.alcance }))
  const segPontos = perf.map((p) => ({ date: p.date, value: p.novosSeguidores }))
  const temSeg = perf.some((p) => p.novosSeguidores != null)
  const comp = m.alcanceComparativo || null
  const compSeg = m.novosSeguidoresComparativo || null
  const fmtKpi = (n, prefixo = '') => (n == null ? '—' : `${prefixo}${num(n)}`)

  return (
    <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
      {dados.erros?.insights && (
        <div style={{ fontSize: 11.5, color: '#b45309', background: 'var(--app-surface-2)', border: '1px solid var(--app-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
          {dados.erros.insights}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
        <IgKpiCard titulo="Seguidores" valor={fmtKpi(m.seguidores)} />
        <IgKpiCard
          titulo="Novos seguidores"
          valor={fmtKpi(m.novosSeguidores, m.novosSeguidores > 0 ? '+' : '')}
          badge={compSeg ? <IgBadge pct={compSeg.pct} anterior={compSeg.anterior} /> : null}
          rodape={compSeg && compSeg.anterior != null ? `${num(compSeg.anterior)} no período anterior` : null}
        />
        <IgKpiCard
          titulo="Alcance total"
          valor={fmtKpi(m.alcance)}
          badge={comp ? <IgBadge pct={comp.pct} anterior={comp.anterior} /> : null}
          rodape={comp && comp.anterior != null ? `${num(comp.anterior)} no período anterior` : null}
        />
        <IgKpiCard titulo="Impressões" valor={fmtKpi(m.views)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-label" style={{ marginBottom: 10 }}>Alcance diário</div>
          <IgAreaChart pontos={reachPontos} />
        </div>
        <div className="card">
          <div className="card-label" style={{ marginBottom: 10 }}>Novos seguidores por dia</div>
          {temSeg
            ? <IgBarChart pontos={segPontos} />
            : <div style={{ height: IG_CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#a3a3a3' }}>Série de novos seguidores indisponível para este perfil.</div>}
        </div>
      </div>
    </div>
  )
}
