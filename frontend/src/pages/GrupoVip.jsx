import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// ícones stroke (currentColor), no estilo do resto do PDV
const svg = (children, vb = '0 0 24 24') => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const I = {
  phone: svg(<><path d="M15 4a5 5 0 0 1 5 5" /><path d="M15 8a1 1 0 0 1 1 1" /><path d="M5 4.5c-.7.7-1 1.8-.7 2.8a17 17 0 0 0 10.9 10.9c1 .3 2.1 0 2.8-.7l.9-.9a1.4 1.4 0 0 0 0-2l-2.1-2.1a1.4 1.4 0 0 0-2 0l-.6.6a12 12 0 0 1-5-5l.6-.6a1.4 1.4 0 0 0 0-2L9 3.6a1.4 1.4 0 0 0-2 0Z" /></>),
  users: svg(<><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5" /><path d="M18.5 19a5.5 5.5 0 0 0-3-4.9" /></>),
  zap: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />),
  mega: svg(<><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M14 8.5a4 4 0 0 1 0 7" /><path d="M17 5.5a8 8 0 0 1 0 13" /></>),
  clock: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></>),
  check: svg(<path d="m4 10 4 4 8-9" />, '0 0 20 20'),
}

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
    try { const r = await api.put('/grupo-vip/config', { grupoJid: jid, grupoNome: nome || null }); setCfg(r.data); setJidManual(''); notify('Grupo salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar o grupo.', 'error') }
  }
  async function salvarConfig(patch) {
    try { const r = await api.put('/grupo-vip/config', patch); setCfg(r.data); notify('Salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
  }

  const DIAS = [['Dom', 0], ['Seg', 1], ['Ter', 2], ['Qua', 3], ['Qui', 4], ['Sex', 5], ['Sáb', 6]]
  const CUPOM_TIPOS = [['PERCENT_DISCOUNT', '% de desconto'], ['FLAT_DISCOUNT', 'R$ de desconto'], ['FREE_SHIPPING', 'Frete grátis']]
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
  const toggleAtivo = () => salvarConfig({ ativo: !cfg.ativo })

  if (!cfg) return <div className="loading-state">Carregando…</div>
  const conectado = status?.connected

  return (
    <div>
      <div className="page-header"><div><h1>Grupo VIP</h1><div className="page-header-sub">Disparos agendados no seu grupo VIP do WhatsApp + cupom do Cardápio Web.</div></div></div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* 1 · Conexão */}
      <div className="gv-card">
        <div className="gv-head">
          <div className="gv-ic">{I.phone}</div>
          <div>
            <div className="gv-tt">Número do WhatsApp</div>
            <div className="gv-sub">O número que envia as mensagens no grupo.</div>
          </div>
          <div className="gv-right">
            {conectado
              ? <span className="gv-status on"><span className="gv-dot" />Conectado{status?.number ? ` · ${status.number}` : ''}</span>
              : (<>
                <span className="gv-status off"><span className="gv-dot" />Não conectado</span>
                <button type="button" className="btn btn-primary" onClick={conectar} disabled={conectando}>{conectando ? 'Aguardando leitura…' : 'Conectar por QR'}</button>
              </>)}
          </div>
        </div>
        {conectando && qr && (
          <div className="gv-qr">
            <img src={qr} alt="QR code para conectar" />
            <div className="gv-qr-hint">No WhatsApp do número → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>, e aponte para o QR.</div>
          </div>
        )}
      </div>

      {conectado && (<>
        {/* 2 · Grupo */}
        <div className="gv-card">
          <div className="gv-head">
            <div className="gv-ic">{I.users}</div>
            <div>
              <div className="gv-tt">Grupo VIP</div>
              <div className="gv-sub">Onde as mensagens serão disparadas.</div>
            </div>
            <div className="gv-right">
              <button type="button" className="btn btn-secondary btn-sm" onClick={carregarGrupos}>{grupos.length ? 'Atualizar lista' : 'Listar grupos'}</button>
            </div>
          </div>
          <div className="gv-body">
            {cfg.grupoJid && grupos.length === 0 && (
              <div className="gv-current">
                <div className="gv-mini">{I.check}</div>
                <div>
                  <div className="gv-current-nm">{cfg.grupoNome || cfg.grupoJid}</div>
                  <div className="gv-current-sub">Grupo selecionado</div>
                </div>
              </div>
            )}
            {grupos.length > 0 && (
              <div className="gv-rows">
                {grupos.map((g) => {
                  const sel = g.jid === cfg.grupoJid
                  return (
                    <div key={g.jid} className={'gv-row' + (sel ? ' sel' : '')} role="button" tabIndex={0}
                      onClick={() => salvarGrupo(g.jid, g.nome)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); salvarGrupo(g.jid, g.nome) } }}>
                      <div className="gv-row-ic">{I.users}</div>
                      <div className="gv-row-tx">
                        <div className="gv-row-nm">{g.nome || g.jid}</div>
                        {g.nome && <div className="gv-row-sub">{g.jid}</div>}
                      </div>
                      {sel && <div className="gv-row-ck">{I.check}</div>}
                    </div>
                  )
                })}
              </div>
            )}
            <hr className="gv-divider" />
            <div className="gv-inline">
              <input className="form-input" placeholder="…ou cole o ID do grupo (…@g.us)" value={jidManual} onChange={(e) => setJidManual(e.target.value)} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => jidManual.trim() && salvarGrupo(jidManual.trim(), null)}>Usar este</button>
            </div>
          </div>
        </div>

        {/* 3 · Ativação + cupom */}
        <div className="gv-card">
          <div className="gv-toggle">
            <div className="gv-ic">{I.zap}</div>
            <div style={{ minWidth: 0 }}>
              <div className="gv-tt">{cfg.ativo ? 'Grupo VIP ativo' : 'Grupo VIP pausado'}</div>
              <div className="gv-sub">{cfg.ativo ? 'As mensagens agendadas estão sendo disparadas.' : 'Ative para disparar as mensagens no horário agendado.'}</div>
            </div>
            <div className={'intel-switch' + (cfg.ativo ? ' on' : '')} role="switch" aria-checked={cfg.ativo} tabIndex={0}
              onClick={toggleAtivo} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAtivo() } }} />
          </div>
          <hr className="gv-divider" />
          <label className="form-label">Cupom do Cardápio Web <span style={{ color: 'var(--app-text-3)', fontWeight: 400 }}>(opcional)</span></label>
          <div className="gv-inline">
            <input className="form-input" value={hubId} onChange={(e) => setHubId(e.target.value)} placeholder="ID da loja no HUB (clienteId)" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => salvarConfig({ hubClienteId: hubId.trim() })}>Salvar</button>
          </div>
          <div className="gv-hint">Só é preciso se alguma mensagem usar a variável <code>{'{cupom}'}</code> para criar um cupom automático no Cardápio Web.</div>
        </div>

        {/* 4 · Mensagens */}
        <div className="gv-card">
          <div className="gv-head">
            <div className="gv-ic">{I.mega}</div>
            <div>
              <div className="gv-tt">Mensagens</div>
              <div className="gv-sub">Agende o que disparar ao longo da semana.</div>
            </div>
            <div className="gv-right"><button type="button" className="btn btn-primary btn-sm" onClick={novaMsg}>+ Nova mensagem</button></div>
          </div>
          <div className="gv-body">
            {mensagens.length === 0
              ? <div className="gv-empty">{I.mega}<div>Nenhuma mensagem ainda. Crie a primeira em “+ Nova mensagem”.</div></div>
              : <div className="gv-msgs">
                {mensagens.map((m) => (
                  <div key={m.id} className="gv-msg">
                    <div className="gv-msg-main">
                      <div className="gv-msg-nm">{m.rotulo}{!m.ativa && <span className="badge badge-gray" style={{ marginLeft: 8 }}>Inativa</span>}</div>
                      <div className="gv-msg-meta">
                        {m.diasSemana.map((d) => <span key={d} className="gv-chip">{DIAS.find(([, n]) => n === d)?.[0]}</span>)}
                        <span className="gv-chip gold">{m.horario}</span>
                        {m.cupomModo !== 'NENHUM' && <span className="gv-chip gold">cupom</span>}
                      </div>
                    </div>
                    <div className="gv-msg-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => editarMsg(m)}>Editar</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExcluir(m)}>Excluir</button>
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        </div>

        {/* 5 · Histórico */}
        <div className="gv-card">
          <div className="gv-head">
            <div className="gv-ic">{I.clock}</div>
            <div>
              <div className="gv-tt">Histórico de disparos</div>
              <div className="gv-sub">Últimos envios e cupons gerados.</div>
            </div>
          </div>
          <div className="gv-body">
            {historico.length === 0
              ? <div className="gv-empty">{I.clock}<div>Nada disparado ainda.</div></div>
              : <div className="table-card" style={{ border: 'none' }}>
                <table className="hb-table">
                  <thead><tr><th>Quando</th><th>Mensagem</th><th>Status</th><th>Cupom</th></tr></thead>
                  <tbody>
                    {historico.map((h) => (
                      <tr key={h.id}>
                        <td>{new Date(h.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{h.rotulo}</td>
                        <td>
                          <span className={'badge ' + (h.status === 'ENVIADO' ? 'badge-green' : 'badge-red')}>{h.status === 'ENVIADO' ? 'Enviado' : 'Falhou'}</span>
                          {h.erro && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{h.erro}</div>}
                        </td>
                        <td>{h.cupomCode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </div>
        </div>
      </>)}

      {modal && (
        <div className="modal-overlay"><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-title">{modal.id ? 'Editar mensagem' : 'Nova mensagem'}</div>
          <div className="form-group"><label className="form-label">Rótulo</label><input className="form-input" value={modal.rotulo} onChange={(e) => updM('rotulo', e.target.value)} placeholder="Ex.: Terça em dobro" /></div>
          <div className="form-group"><label className="form-label">Texto (use <code>{'{cupom}'}</code> para inserir o código)</label><textarea className="form-input" rows={4} value={modal.texto} onChange={(e) => updM('texto', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Dias</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DIAS.map(([lbl, n]) => <button key={n} type="button" className={'btn btn-sm ' + (modal.diasSemana.includes(n) ? 'btn-primary' : 'btn-secondary')} onClick={() => toggleDia(n)}>{lbl}</button>)}</div></div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Horário</label><input type="time" className="form-input" style={{ maxWidth: 140 }} value={modal.horario} onChange={(e) => updM('horario', e.target.value)} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--app-text)', paddingBottom: 10, cursor: 'pointer' }}><input type="checkbox" checked={modal.ativa} onChange={(e) => updM('ativa', e.target.checked)} /> Ativa</label>
          </div>

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
                <div className="form-group" style={{ flex: 1 }}><label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={modal.cupomSoNovosClientes} onChange={(e) => updM('cupomSoNovosClientes', e.target.checked)} /> Só novos clientes</label></div>
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
