import { brl, brlExato, num } from './formatos'

// Análise de CRM do período: % das compras de clientes novos (aquisição) × recorrentes,
// + ranking dos clientes mais fiéis (mais pedidos nos últimos 30 dias) para ações de
// fidelidade. Recebe `dados.clientes` do dashboard; ausente/nulo → não renderiza nada.

const COR_NOVOS = '#ea580c' // laranja da marca — aquisição
const COR_REC = '#16a34a'   // verde — recorrência/fidelidade
const MEDALHA = ['#f59e0b', '#94a3b8', '#b45309'] // ouro, prata, bronze (top 3)

function fmtTel(t) {
  if (!t) return null
  const d = String(t).replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

function IconeAquisicao({ cor }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}
function IconeRecorrencia({ cor }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function MiniStat({ valor, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--app-text)', lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 9.5, color: '#a3a3a3', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    </div>
  )
}

function Painel({ Icone, cor, tint, titulo, sub, pct, clientes, pedidos, fat }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '11px 13px', background: 'var(--app-surface-2, #f8fafc)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icone cor={cor} /></span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: cor }}>{titulo}</span>
        <span style={{ marginLeft: 'auto', fontSize: 27, fontWeight: 800, color: cor, lineHeight: 1 }}>{pct}<span style={{ fontSize: 15 }}>%</span></span>
      </div>
      <div style={{ fontSize: 11, color: '#a3a3a3', marginBottom: 9 }}>{sub}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, paddingTop: 9, borderTop: '1px solid #eee' }}>
        <MiniStat valor={num(clientes)} label="clientes" />
        <MiniStat valor={num(pedidos)} label="pedidos" />
        <MiniStat valor={brl(fat)} label="faturam." />
      </div>
    </div>
  )
}

function CardFiel({ t, rank, maxPedidos }) {
  const pct = maxPedidos ? Math.max(6, Math.round((t.pedidos / maxPedidos) * 100)) : 0
  const corRank = rank <= 3 ? MEDALHA[rank - 1] : '#cbd5e1'
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '9px 11px', background: 'var(--app-surface-2, #f8fafc)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ flexShrink: 0, width: 21, height: 21, borderRadius: '50%', background: rank <= 3 ? corRank : '#f1f1f1', color: rank <= 3 ? '#fff' : '#737373', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{rank}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome || 'Cliente'}</div>
          {fmtTel(t.telefone) && <div style={{ fontSize: 11, color: '#a3a3a3' }}>{fmtTel(t.telefone)}</div>}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--app-text)', lineHeight: 1 }}>{num(t.pedidos)}</div>
          <div style={{ fontSize: 9.5, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 0.3 }}>pedidos</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#eee', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: COR_NOVOS }} />
        </div>
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--app-text-2, #555)' }}>{brlExato(t.gasto)}</span>
      </div>
    </div>
  )
}

export default function AnaliseClientes({ clientes }) {
  if (!clientes) return null
  const c = clientes
  const top = Array.isArray(c.top30) ? c.top30 : []
  const maxPedidos = top.length ? top[0].pedidos : 0
  const semDados = !c.pedidosIdentificados && top.length === 0
  if (semDados) {
    return (
      <div>
        <div style={{ fontSize: 12, color: '#a3a3a3', marginBottom: 12 }}>Quem comprou no período e quem são os mais fiéis para você mimar.</div>
        <div className="card" style={{ fontSize: 13, color: '#a3a3a3' }}>Sem pedidos com cliente identificado no período.</div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: '#a3a3a3', marginBottom: 12 }}>Quem comprou no período e quem são os mais fiéis para você mimar.</div>

      {/* Linha principal — Aquisição × Recorrência (do período) */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>Aquisição × Recorrência</span>
          <span style={{ fontSize: 11.5, color: '#a3a3a3' }}>· % das compras do período por tipo de cliente</span>
        </div>
        <div style={{ display: 'flex', height: 11, borderRadius: 999, overflow: 'hidden', background: '#eee', marginBottom: 12 }}>
          <div style={{ width: `${c.pctPedidosNovos || 0}%`, background: COR_NOVOS }} />
          <div style={{ width: `${c.pctPedidosRecorrentes || 0}%`, background: COR_REC }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <Painel Icone={IconeAquisicao} cor={COR_NOVOS} tint="#ffedd5" titulo="Aquisição" sub="clientes novos (1º pedido)" pct={c.pctPedidosNovos || 0} clientes={c.novos || 0} pedidos={c.pedidosNovos || 0} fat={c.faturamentoNovos || 0} />
          <Painel Icone={IconeRecorrencia} cor={COR_REC} tint="#dcfce7" titulo="Recorrência" sub="já compraram antes" pct={c.pctPedidosRecorrentes || 0} clientes={c.recorrentes || 0} pedidos={c.pedidosRecorrentes || 0} fat={c.faturamentoRecorrentes || 0} />
        </div>
        {c.pedidosSemCliente > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#a3a3a3' }}>+ {num(c.pedidosSemCliente)} pedido(s) sem cliente identificado (fora do %).</div>
        )}
      </div>

      {/* Clientes mais fiéis — últimos 30 dias (largura total, grid) */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>Clientes mais fiéis</span>
          <span style={{ fontSize: 11.5, color: '#a3a3a3' }}>· mais pedidos nos últimos 30 dias — bons candidatos a um mimo</span>
        </div>
        {top.length === 0 ? (
          <div style={{ fontSize: 13, color: '#a3a3a3' }}>Ninguém com pedido nos últimos 30 dias ainda.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 10 }}>
            {top.map((t, i) => (
              <CardFiel key={t.cwCustomerId ?? i} t={t} rank={i + 1} maxPedidos={maxPedidos} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
