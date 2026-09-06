import { useState } from 'react'

// minutos → "45 min" / "3h 20min" / "2 dias 4h".
function fmtDur(min) {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) { const r = m % 60; return r ? `${h}h ${r}min` : `${h}h` }
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d} ${d === 1 ? 'dia' : 'dias'}`
}
function fmtDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const chaveItem = (it) => `${it?.tipo || 'item'}:${it?.anotaaiItemId}`
// Marcador discreto de complemento (↳ = "faz parte de um produto"), no laranja da marca.
function BadgeCompl() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-label="Complemento">
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
  )
}
// Complemento: `categoria` = nome do produto pai (onde ele aparece).
function contextoFalta(it) {
  if (it?.tipo === 'complemento') return it.categoria ? `Complemento de ${it.categoria}` : 'Complemento'
  return it?.categoria || ''
}

function LinhaTempo({ episodios }) {
  if (!episodios || episodios.length === 0) {
    return <div style={{ fontSize: 13, color: '#a3a3a3' }}>Sem episódios registrados neste período.</div>
  }
  return (
    <div style={{ marginLeft: 2, display: 'flex', flexDirection: 'column', gap: 9, paddingLeft: 14, borderLeft: '2px solid #eee' }}>
      {episodios.map((ep, i) => {
        const dur = ((ep.fimEm ? new Date(ep.fimEm).getTime() : Date.now()) - new Date(ep.inicioEm).getTime()) / 60000
        return (
          <div key={i} style={{ fontSize: 13, color: 'var(--app-text-2, #555)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--app-text)' }}>{fmtDataHora(ep.inicioEm)}</span>
            {ep.fimEm
              ? <> → {fmtDataHora(ep.fimEm)} <span style={{ color: '#a3a3a3' }}>· ficou {fmtDur(dur)}</span></>
              : <> <span style={{ color: '#dc2626', fontWeight: 600 }}>· ainda em falta ({fmtDur(dur)})</span></>}
          </div>
        )
      })}
    </div>
  )
}

// Modal com o histórico de um produto: resumo + linha do tempo das pausas. Não fecha fora.
function ModalHistoricoItem({ item, onFechar }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, height: 'min(600px, 90vh)', display: 'flex', flexDirection: 'column', background: 'var(--app-surface, #fff)', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 18px', borderBottom: '1px solid #eee' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.tipo === 'complemento' && <BadgeCompl />}
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--app-text)' }}>{item.nome}</span>
              {item.emFaltaAgora && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: 999, padding: '2px 8px' }}>em falta agora</span>
              )}
            </div>
            {contextoFalta(item) && <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 2 }}>{contextoFalta(item)}</div>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, color: '#a3a3a3', cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ flex: 1, background: 'var(--app-surface-2, #f8fafc)', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--app-text)', lineHeight: 1 }}>{item.qtd}×</div>
            <div style={{ fontSize: 11, color: '#a3a3a3', marginTop: 3 }}>vezes em falta</div>
          </div>
          <div style={{ flex: 1, background: 'var(--app-surface-2, #f8fafc)', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--app-text)', lineHeight: 1 }}>{fmtDur(item.totalMin)}</div>
            <div style={{ fontSize: 11, color: '#a3a3a3', marginTop: 3 }}>em falta com a loja aberta</div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '16px 18px', overflowY: 'auto' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--app-text)', marginBottom: 12 }}>Linha do tempo</div>
          <LinhaTempo episodios={item.episodios} />
        </div>
      </div>
    </div>
  )
}

function IconeSeta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// Histórico de faltas: ranking dos itens que mais faltam no período. Clicar num item abre o
// modal com o resumo + linha do tempo das pausas daquele produto.
export default function HistoricoFaltasAnotaAI({ dados, carregando }) {
  const [sel, setSel] = useState(null)
  if (dados && dados.conectado === false) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#a3a3a3', fontSize: 13.5 }}>
        Esta loja ainda não tem o Anota AI conectado.
      </div>
    )
  }
  const itens = Array.isArray(dados?.itens) ? dados.itens : []
  return (
    <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>Itens que mais faltam</div>
        <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 3, marginBottom: 14 }}>
          No período, ordenados pelo tempo em falta <strong>com a loja aberta</strong> — é aí que se perde venda. Clique num item para ver o histórico.
        </div>
        {itens.length === 0 ? (
          <div style={{ padding: '28px 8px', textAlign: 'center', color: '#a3a3a3', fontSize: 13, lineHeight: 1.5 }}>
            Nenhuma falta registrada no período.<br />
            <span style={{ fontSize: 12 }}>O histórico é montado a partir de quando o monitoramento foi ligado — vai crescendo com o tempo.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {itens.map((it) => {
              return (
                <button
                  key={chaveItem(it)} type="button" onClick={() => setSel(it)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', border: '1px solid #eee', borderRadius: 12, background: 'var(--app-surface-2, #f8fafc)', padding: '12px 14px', cursor: 'pointer' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {it.tipo === 'complemento' && <BadgeCompl />}
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--app-text)' }}>{it.nome}</span>
                      {it.emFaltaAgora && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: 999, padding: '2px 8px' }}>em falta agora</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 2 }}>
                      {contextoFalta(it) ? `${contextoFalta(it)} · ` : ''}<strong style={{ color: 'var(--app-text-2, #555)' }}>{it.qtd}×</strong> · {fmtDur(it.totalMin)} em falta
                    </div>
                  </div>
                  <IconeSeta />
                </button>
              )
            })}
          </div>
        )}
      </div>
      {sel && <ModalHistoricoItem item={sel} onFechar={() => setSel(null)} />}
    </div>
  )
}
