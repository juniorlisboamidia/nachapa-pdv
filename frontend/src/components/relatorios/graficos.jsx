import { useState } from 'react'
import { fmtBR, brlExato, kFmt, diaCurto } from './formatos'

// Gráficos e peças visuais compartilhados entre o Dashboard e os Relatórios do
// cliente. Copiados VERBATIM de DashboardCliente.jsx — o Dashboard continua com
// sua própria cópia intacta; esta é a base que os Relatórios evoluem separados.

// Cabeçalho de uma seção (Meta x Instagram etc.), com cor/ícone próprios.
// `direita` é um conteúdo opcional alinhado à direita (ex.: o chip do perfil do IG).
export function SecaoTitulo({ titulo, sub, cor, gradiente, icone, logoSrc, logoSize = 34, direita }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '4px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {logoSrc ? (
          <img src={logoSrc} alt="" style={{ width: logoSize, height: logoSize, objectFit: 'contain', flexShrink: 0 }} />
        ) : (
          <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: gradiente || cor, color: '#fff' }}>
            {icone}
          </span>
        )}
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--app-text)', lineHeight: 1.1 }}>{titulo}</div>
          {sub && <div style={{ fontSize: 12, color: '#a3a3a3' }}>{sub}</div>}
        </div>
      </div>
      {direita}
    </div>
  )
}

// Card genérico exibido quando a fonte de dados não está conectada. Título e
// descrição vêm das props para servir a qualquer relatório (Meta, Cardápio, ...).
export function SemConta({ titulo, descricao }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--app-text)', marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ color: '#737373', fontSize: 14, maxWidth: 420, margin: '0 auto' }}>
        {descricao}
      </div>
    </div>
  )
}

export function Legenda({ itens }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
      {itens.map((i) => (
        <span key={i.txt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#737373' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.cor, display: 'inline-block' }} />
          {i.txt}
        </span>
      ))}
    </div>
  )
}

// Geometria comum aos dois gráficos. CH baixo (proporção achatada) para a altura
// renderizada ficar próxima dos gráficos do Instagram (que têm altura fixa).
export const CW = 640, CH = 210, CPADL = 8, CPADR = 8, CPADTOP = 14, CPADBOT = 26
export const CINNERW = CW - CPADL - CPADR
export const CINNERH = CH - CPADTOP - CPADBOT
export const CBASE = CPADTOP + CINNERH

// Tooltip flutuante (HTML), posicionado em % sobre o gráfico.
export function ChartTooltip({ leftPct, topPct, titulo, linhas }) {
  return (
    <div style={{
      position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
      transform: 'translate(-50%, calc(-100% - 12px))', background: '#1f2937', color: '#fff',
      borderRadius: 8, padding: '8px 10px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
      zIndex: 5, boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: linhas.length ? 4 : 0 }}>{titulo}</div>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {l.cor && <span style={{ width: 8, height: 8, borderRadius: 2, background: l.cor, display: 'inline-block' }} />}
          <span style={{ color: '#cbd5e1' }}>{l.label}</span>
          <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{l.valor}</span>
        </div>
      ))}
    </div>
  )
}

// ── Gráfico de barras agrupadas (SVG, interativo) ──
export function BarChart({ data, series, formatTip, formatYTick, referencia }) {
  const [hover, setHover] = useState(null)
  if (!data.length) return <div className="empty-state" style={{ padding: '40px 20px' }}>Sem dados nos últimos 6 meses.</div>

  const maxDados = Math.max(...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)), 0)
  // Topo do eixo = referência (se os dados não a ultrapassarem); senão acompanha os dados.
  const max = (referencia != null ? Math.max(maxDados, referencia) : maxDados * 1.08) || 1
  const gw = CINNERW / data.length
  const gap = 5
  const bw = Math.min(26, (gw * 0.62 - gap * (series.length - 1)) / series.length)
  const yAt = (v) => CBASE - (((Number(v) || 0) / max) * CINNERH)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const gy = CBASE - t * CINNERH
          return (
            <g key={t}>
              <line x1={CPADL} y1={gy} x2={CW - CPADR} y2={gy} stroke="#f0f0f0" strokeWidth="1" />
              <text x={CPADL} y={gy - 3} fontSize="9" fill="#c4c4c4">{formatYTick(t * max)}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const centro = CPADL + i * gw + gw / 2
          const totalW = series.length * bw + (series.length - 1) * gap
          const start = centro - totalW / 2
          const ativo = hover?.i === i
          const topoBarra = Math.min(...series.map((s) => yAt(d[s.key]))) // topo da barra mais alta do grupo
          return (
            <g key={i}>
              {/* área de hover do grupo inteiro */}
              <rect x={CPADL + i * gw} y={CPADTOP} width={gw} height={CINNERH} fill="transparent"
                onMouseEnter={() => setHover({ i, leftPct: (centro / CW) * 100, topPct: (topoBarra / CH) * 100 })} />
              {series.map((s, j) => {
                const bx = start + j * (bw + gap)
                const by = yAt(d[s.key])
                return <rect key={s.key} x={bx} y={by} width={bw} height={Math.max(0, CBASE - by)} rx="3" fill={s.cor} opacity={ativo ? 1 : 0.92} style={{ pointerEvents: 'none' }} />
              })}
              <text x={centro} y={CH - 9} fontSize="11" fill={ativo ? 'var(--app-text)' : '#737373'} fontWeight={ativo ? 700 : 400} textAnchor="middle" style={{ pointerEvents: 'none' }}>{d.mes}</text>
            </g>
          )
        })}
      </svg>
      {hover && (
        <ChartTooltip
          leftPct={hover.leftPct}
          topPct={hover.topPct}
          titulo={data[hover.i].mes}
          linhas={series.map((s) => ({ cor: s.cor, label: s.label, valor: formatTip(data[hover.i][s.key]) }))}
        />
      )}
    </div>
  )
}

// Path suave (Catmull-Rom → Bézier) para a linha do ROAS.
export function smoothPath(pts) {
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

// ── Gráfico de linha suave (SVG, interativo) ──
export function LineChartSuave({ data, dataKey, cor, formatTip, formatYTick, referencia }) {
  const [hover, setHover] = useState(null)
  if (!data.length) return <div className="empty-state" style={{ padding: '40px 20px' }}>Sem dados nos últimos 6 meses.</div>

  const maxDados = Math.max(...data.map((d) => Number(d[dataKey]) || 0), 0)
  // Topo do eixo = referência (se os dados não a ultrapassarem); senão acompanha os dados.
  const max = (referencia != null ? Math.max(maxDados, referencia) : maxDados * 1.08) || 1
  const xAt = (i) => (data.length === 1 ? CPADL + CINNERW / 2 : CPADL + (i / (data.length - 1)) * CINNERW)
  const yAt = (v) => CBASE - (((Number(v) || 0) / max) * CINNERH)
  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d[dataKey]) }))
  const colW = CINNERW / data.length
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const gy = CBASE - t * CINNERH
          return (
            <g key={t}>
              <line x1={CPADL} y1={gy} x2={CW - CPADR} y2={gy} stroke="#f0f0f0" strokeWidth="1" />
              <text x={CPADL} y={gy - 3} fontSize="9" fill="#c4c4c4">{formatYTick(t * max)}</text>
            </g>
          )
        })}
        <path d={smoothPath(pts)} fill="none" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => {
          const ativo = hover?.i === i
          if (data.length > 12 && !ativo) return null // muitos pontos (série diária): só destaca o ativo
          return <circle key={i} cx={p.x} cy={p.y} r={ativo ? 5 : 3.5} fill="#fff" stroke={cor} strokeWidth="2" style={{ pointerEvents: 'none' }} />
        })}
        {/* áreas de hover por coluna */}
        {data.map((d, i) => (
          <rect key={i} x={xAt(i) - colW / 2} y={CPADTOP} width={colW} height={CINNERH} fill="transparent"
            onMouseEnter={() => setHover({ i, leftPct: (xAt(i) / CW) * 100, topPct: (yAt(d[dataKey]) / CH) * 100 })} />
        ))}
        {data.map((d, i) => {
          // Com muitos pontos (série diária) mostra só primeiro, meio e último rótulo.
          if (data.length > 8 && i !== 0 && i !== data.length - 1 && i !== Math.floor((data.length - 1) / 2)) return null
          return <text key={i} x={xAt(i)} y={CH - 9} fontSize="11" fill={hover?.i === i ? 'var(--app-text)' : '#737373'} fontWeight={hover?.i === i ? 700 : 400} textAnchor="middle" style={{ pointerEvents: 'none' }}>{d.mes}</text>
        })}
      </svg>
      {hover && (
        <ChartTooltip
          leftPct={hover.leftPct}
          topPct={hover.topPct}
          titulo={data[hover.i].mes}
          linhas={[{ cor, label: 'ROAS', valor: formatTip(data[hover.i][dataKey]) }]}
        />
      )}
    </div>
  )
}

// Gráfico de área (faturamento por dia). Usa dimensões próprias (mais baixo que os
// gráficos do Meta) — reusa só smoothPath/ChartTooltip.
export const VW = 640, VH = 112, VPADL = 8, VPADR = 8, VPADTOP = 10, VPADBOT = 20
export const VINNERW = VW - VPADL - VPADR
export const VINNERH = VH - VPADTOP - VPADBOT
export const VBASE = VPADTOP + VINNERH
export function AreaVendasDiarias({ data }) {
  const [hover, setHover] = useState(null)
  if (!data.length) return <div className="empty-state" style={{ padding: '32px 20px' }}>Sem vendas no período.</div>
  const cor = '#ff5f00'
  const maxDados = Math.max(...data.map((d) => Number(d.total) || 0), 0)
  const max = (maxDados * 1.08) || 1
  const xAt = (i) => (data.length === 1 ? VPADL + VINNERW / 2 : VPADL + (i / (data.length - 1)) * VINNERW)
  const yAt = (v) => VBASE - (((Number(v) || 0) / max) * VINNERH)
  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.total) }))
  const colW = VINNERW / data.length
  const ticks = [0, 0.5, 1]
  const linha = smoothPath(pts)
  const area = `${linha} L ${pts[pts.length - 1].x} ${VBASE} L ${pts[0].x} ${VBASE} Z`
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="cwArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity="0.28" /><stop offset="100%" stopColor={cor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => {
          const gy = VBASE - t * VINNERH
          return (
            <g key={t}>
              <line x1={VPADL} y1={gy} x2={VW - VPADR} y2={gy} stroke="#f0f0f0" strokeWidth="1" />
              <text x={VPADL} y={gy - 3} fontSize="5" fill="#c4c4c4">{kFmt(t * max)}</text>
            </g>
          )
        })}
        <path d={area} fill="url(#cwArea)" stroke="none" />
        <path d={linha} fill="none" stroke={cor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => {
          const ativo = hover?.i === i
          if (data.length > 12 && !ativo) return null
          return <circle key={i} cx={p.x} cy={p.y} r={ativo ? 4 : 2.5} fill="#fff" stroke={cor} strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
        })}
        {data.map((d, i) => (
          <rect key={i} x={xAt(i) - colW / 2} y={VPADTOP} width={colW} height={VINNERH} fill="transparent"
            onMouseEnter={() => setHover({ i, leftPct: (xAt(i) / VW) * 100, topPct: (yAt(d.total) / VH) * 100 })} />
        ))}
        {(() => {
          // Até 30 dias mostra TODOS; acima disso distribui ~12 rótulos (não cabe todos).
          // Bordas alinhadas para dentro para não cortar.
          const mostrar = new Set()
          if (data.length <= 31) {
            data.forEach((_, i) => mostrar.add(i))
          } else {
            const n = 12, div = Math.max(1, n - 1)
            for (let j = 0; j < n; j++) mostrar.add(Math.round((j * (data.length - 1)) / div))
          }
          return data.map((d, i) => {
            if (!mostrar.has(i)) return null
            const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'
            return <text key={i} x={xAt(i)} y={VH - 7} fontSize="5" fill={hover?.i === i ? 'var(--app-text)' : '#9a9a9a'} textAnchor={anchor} style={{ pointerEvents: 'none' }}>{diaCurto(d.dia)}</text>
          })
        })()}
      </svg>
      {hover && (
        <ChartTooltip leftPct={hover.leftPct} topPct={hover.topPct} titulo={fmtBR(data[hover.i].dia)}
          linhas={[{ cor, label: 'Faturamento', valor: brlExato(data[hover.i].total) }]} />
      )}
    </div>
  )
}
