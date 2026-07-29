import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

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

  const [mensagens, setMensagens] = useState([])
  const [historico, setHistorico] = useState([])
  const [modal, setModal] = useState(null) // mensagem em edição/criação
  const [excluir, setExcluir] = useState(null)
  const carregarMsgs = useCallback(() => {
    api.get('/grupo-vip/mensagens').then((r) => setMensagens(r.data.mensagens || [])).catch(() => {})
    api.get('/grupo-vip/historico').then((r) => setHistorico(r.data.historico || [])).catch(() => {})
  }, [])
  useEffect(() => { carregarMsgs() }, [carregarMsgs])

  // Poll de status enquanto o QR está aberto
  useEffect(() => {
    if (!conectando) return
    const t = setInterval(() => {
      // Só pollar /status (o /connect é rate-limited). O status já traz o QR renovado.
      api.get('/grupo-vip/status').then((r) => {
        setStatus(r.data)
        if (r.data?.qr) setQr(r.data.qr)
        if (r.data?.connected) { setConectando(false); setQr(null); notify('WhatsApp conectado!'); carregarGrupos() }
      }).catch(() => {})
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

  const DIAS = [['Dom', 0], ['Seg', 1], ['Ter', 2], ['Qua', 3], ['Qui', 4], ['Sex', 5], ['Sáb', 6]]
  const CUPOM_TIPOS = [['PERCENT_DISCOUNT', '% de desconto'], ['FLAT_DISCOUNT', 'R$ de desconto'], ['FREE_SHIPPING', 'Frete grátis']]
  const fmtDiasHorario = (m) => `${m.diasSemana.map((d) => DIAS.find(([, n]) => n === d)?.[0]).join(', ')} · ${m.horario}`
  const novaMsg = () => setModal({ rotulo: '', texto: '', diasSemana: [], horario: '18:00', ativa: true, cupomModo: 'NENHUM', cupomTipo: 'PERCENT_DISCOUNT', cupomValor: '', cupomNome: '', cupomCodigoFixo: '', cupomValidadeHoras: '', cupomPedidoMinimo: '', cupomLimiteUso: '', cupomSoNovosClientes: false })
  const editarMsg = (m) => setModal({ ...m, cupomValor: m.cupomValor ?? '', cupomValidadeHoras: m.cupomValidadeHoras ?? '', cupomPedidoMinimo: m.cupomPedidoMinimo ?? '', cupomLimiteUso: m.cupomLimiteUso ?? '', cupomNome: m.cupomNome ?? '', cupomCodigoFixo: m.cupomCodigoFixo ?? '', cupomTipo: m.cupomTipo || 'PERCENT_DISCOUNT', cupomSoNovosClientes: !!m.cupomSoNovosClientes })
  const updM = (k, v) => setModal((m) => ({ ...m, [k]: v }))
  const toggleDia = (n) => setModal((m) => ({ ...m, diasSemana: m.diasSemana.includes(n) ? m.diasSemana.filter((x) => x !== n) : [...m.diasSemana, n] }))
  async function salvarMsg() {
    try {
      if (modal.id) await api.put(`/grupo-vip/mensagens/${modal.id}`, modal)
      else await api.post('/grupo-vip/mensagens', modal)
      notify('Mensagem salva.'); setModal(null); carregarMsgs()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
  }
  async function confirmarExcluirMsg() {
    try { await api.delete(`/grupo-vip/mensagens/${excluir.id}`); notify('Removida.'); setExcluir(null); carregarMsgs() }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao excluir.', 'error') }
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

      {conectado && (
        <>
          <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>Mensagens</strong>
              <button type="button" className="btn btn-primary btn-sm" onClick={novaMsg}>+ Nova mensagem</button>
            </div>
            {mensagens.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>Nenhuma mensagem ainda.</div> : (
              <table className="hb-table"><tbody>
                {mensagens.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.rotulo}</strong>{!m.ativa && <span className="badge badge-gray" style={{ marginLeft: 8 }}>Inativa</span>}<div style={{ fontSize: 12, color: 'var(--app-text-3)' }}>{fmtDiasHorario(m)}{m.cupomModo !== 'NENHUM' && ' · com cupom'}</div></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => editarMsg(m)}>Editar</button>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => setExcluir(m)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div className="table-card" style={{ padding: 16 }}>
            <strong>Histórico de disparos</strong>
            {historico.length === 0 ? <div className="empty-state" style={{ padding: 16 }}>Nada disparado ainda.</div> : (
              <table className="hb-table"><thead><tr><th>Quando</th><th>Mensagem</th><th>Status</th><th>Cupom</th></tr></thead><tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{h.rotulo}</td>
                    <td>{h.status === 'ENVIADO' ? '✓ Enviado' : '✕ Falhou'}{h.erro && <div style={{ fontSize: 11, color: '#dc2626' }}>{h.erro}</div>}</td>
                    <td>{h.cupomCode || '—'}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </>
      )}

      {modal && (
        <div className="modal-overlay"><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-title">{modal.id ? 'Editar mensagem' : 'Nova mensagem'}</div>
          <div className="form-group"><label className="form-label">Rótulo</label><input className="form-input" value={modal.rotulo} onChange={(e) => updM('rotulo', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Texto (use <code>{'{cupom}'}</code> para inserir o código)</label><textarea className="form-input" rows={4} value={modal.texto} onChange={(e) => updM('texto', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Dias</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DIAS.map(([lbl, n]) => <button key={n} type="button" className={'btn btn-sm ' + (modal.diasSemana.includes(n) ? 'btn-primary' : 'btn-secondary')} onClick={() => toggleDia(n)}>{lbl}</button>)}</div></div>
          <div className="form-group"><label className="form-label">Horário</label><input type="time" className="form-input" style={{ maxWidth: 140 }} value={modal.horario} onChange={(e) => updM('horario', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Ativa</label><input type="checkbox" checked={modal.ativa} onChange={(e) => updM('ativa', e.target.checked)} /></div>

          <div className="form-group"><label className="form-label">Cupom</label>
            <select className="form-input" value={modal.cupomModo} onChange={(e) => updM('cupomModo', e.target.value)}>
              <option value="NENHUM">Sem cupom</option>
              <option value="NOVO_POR_DISPARO">Criar um cupom novo a cada disparo</option>
              <option value="FIXO">Usar um código fixo já existente</option>
            </select>
          </div>
          {modal.cupomModo === 'FIXO' && (
            <div className="form-group"><label className="form-label">Código do cupom</label><input className="form-input" value={modal.cupomCodigoFixo} onChange={(e) => updM('cupomCodigoFixo', e.target.value)} placeholder="Ex.: TERCAEMDOBRO" /></div>
          )}
          {modal.cupomModo === 'NOVO_POR_DISPARO' && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Tipo</label><select className="form-input" value={modal.cupomTipo} onChange={(e) => updM('cupomTipo', e.target.value)}>{CUPOM_TIPOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                {modal.cupomTipo !== 'FREE_SHIPPING' && <div className="form-group" style={{ flex: 1 }}><label className="form-label">Valor</label><input type="number" className="form-input" value={modal.cupomValor} onChange={(e) => updM('cupomValor', e.target.value)} /></div>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Vale por (horas)</label><input type="number" className="form-input" value={modal.cupomValidadeHoras} onChange={(e) => updM('cupomValidadeHoras', e.target.value)} placeholder="ex.: 6" /></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Pedido mínimo (R$)</label><input type="number" className="form-input" value={modal.cupomPedidoMinimo} onChange={(e) => updM('cupomPedidoMinimo', e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Limite de usos</label><input type="number" className="form-input" value={modal.cupomLimiteUso} onChange={(e) => updM('cupomLimiteUso', e.target.value)} /></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label"><input type="checkbox" checked={modal.cupomSoNovosClientes} onChange={(e) => updM('cupomSoNovosClientes', e.target.checked)} /> Só novos clientes</label></div>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={salvarMsg}>Salvar</button>
          </div>
        </div></div>
      )}

      <ConfirmDialog open={!!excluir} title="Excluir mensagem" message={excluir ? `Excluir "${excluir.rotulo}"?` : ''} confirmLabel="Excluir" cancelLabel="Cancelar" variant="danger" onConfirm={confirmarExcluirMsg} onCancel={() => setExcluir(null)} />
    </div>
  )
}
