import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

export default function GrupoVip() {
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null) // {connected, number}
  const [qr, setQr] = useState(null)
  const [conectando, setConectando] = useState(false)
  const [grupos, setGrupos] = useState([])
  const [jidManual, setJidManual] = useState('')
  const [hubId, setHubId] = useState('')

  const carregar = useCallback(() => {
    api.get('/grupo-vip/config').then((r) => { setCfg(r.data); setHubId(r.data.hubClienteId || '') }).catch(() => {})
    api.get('/grupo-vip/status').then((r) => setStatus(r.data)).catch(() => setStatus({ connected: false }))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Poll de status enquanto o QR está aberto
  useEffect(() => {
    if (!conectando) return
    const t = setInterval(() => {
      api.get('/grupo-vip/status').then((r) => { setStatus(r.data); if (r.data?.connected) { setConectando(false); setQr(null); notify('WhatsApp conectado!'); carregarGrupos() } }).catch(() => {})
      api.get('/grupo-vip/qr').then((r) => r.data?.qr && setQr(r.data.qr)).catch(() => {})
    }, 3000)
    return () => clearInterval(t)
  }, [conectando]) // eslint-disable-line react-hooks/exhaustive-deps

  async function conectar() {
    setConectando(true); setQr(null)
    try { await api.post('/grupo-vip/instancia'); const r = await api.get('/grupo-vip/qr'); setQr(r.data?.qr || null) }
    catch (e) { setConectando(false); notify(e?.response?.data?.error ?? 'Não foi possível iniciar a conexão.', 'error') }
  }
  async function carregarGrupos() {
    try { const r = await api.get('/grupo-vip/grupos'); setGrupos(r.data.grupos || []) } catch { setGrupos([]) }
  }
  async function salvarGrupo(jid, nome) {
    try { const r = await api.put('/grupo-vip/config', { grupoJid: jid, grupoNome: nome || null }); setCfg(r.data); notify('Grupo salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar o grupo.', 'error') }
  }
  async function salvarConfig(patch) {
    try { const r = await api.put('/grupo-vip/config', patch); setCfg(r.data); notify('Salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
  }

  if (!cfg) return <div className="loading-state">Carregando…</div>
  const conectado = status?.connected

  return (
    <div>
      <div className="page-header"><div><h1>Grupo VIP</h1><div className="page-header-sub">Disparos agendados no seu grupo VIP do WhatsApp + cupom do Cardápio Web.</div></div></div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* Conexão */}
      <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <strong>Número do WhatsApp</strong>
            <div style={{ fontSize: 13, color: 'var(--app-text-3)' }}>{conectado ? `Conectado${status?.number ? ` · ${status.number}` : ''}` : 'Não conectado'}</div>
          </div>
          {!conectado && <button type="button" className="btn btn-primary" onClick={conectar} disabled={conectando}>{conectando ? 'Aguardando leitura…' : 'Conectar por QR'}</button>}
        </div>
        {conectando && qr && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <img src={qr} alt="QR" style={{ width: 240, height: 240 }} />
            <div style={{ fontSize: 12.5, color: 'var(--app-text-3)', marginTop: 6 }}>Abra o WhatsApp do número dedicado › Aparelhos conectados › Conectar um aparelho.</div>
          </div>
        )}
      </div>

      {/* Grupo + config (só quando conectado) */}
      {conectado && (
        <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Grupo VIP</div>
          <div style={{ fontSize: 13, color: 'var(--app-text-3)', marginBottom: 10 }}>Grupo atual: <strong>{cfg.grupoNome || cfg.grupoJid || 'nenhum'}</strong></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={carregarGrupos}>Listar grupos</button>
          </div>
          {grupos.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              {grupos.map((g) => <button key={g.jid} type="button" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => salvarGrupo(g.jid, g.nome)}>{g.nome || g.jid}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="…ou cole o ID do grupo (…@g.us)" value={jidManual} onChange={(e) => setJidManual(e.target.value)} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => jidManual.trim() && salvarGrupo(jidManual.trim(), null)}>Usar este</button>
          </div>

          <div style={{ marginTop: 16, borderTop: '1px solid var(--app-border)', paddingTop: 14 }}>
            <label className="form-label">ID da loja no HUB (Cardápio Web) — para os cupons</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} value={hubId} onChange={(e) => setHubId(e.target.value)} placeholder="clienteId no HUB" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => salvarConfig({ hubClienteId: hubId.trim() })}>Salvar</button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => salvarConfig({ ativo: !cfg.ativo })}>{cfg.ativo ? 'Desativar Grupo VIP' : 'Ativar Grupo VIP'}</button>
            <span style={{ fontSize: 13, color: cfg.ativo ? 'var(--money, #0F8A54)' : 'var(--app-text-3)' }}>{cfg.ativo ? 'Ativo — disparos agendados rodando' : 'Inativo — nada é disparado'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
