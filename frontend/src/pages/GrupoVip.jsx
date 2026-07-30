import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// ícones stroke (currentColor)
const svg = (children, vb = '0 0 24 24') => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const I = {
  phone: svg(<><path d="M15 4a5 5 0 0 1 5 5" /><path d="M15 8a1 1 0 0 1 1 1" /><path d="M5 4.5c-.7.7-1 1.8-.7 2.8a17 17 0 0 0 10.9 10.9c1 .3 2.1 0 2.8-.7l.9-.9a1.4 1.4 0 0 0 0-2l-2.1-2.1a1.4 1.4 0 0 0-2 0l-.6.6a12 12 0 0 1-5-5l.6-.6a1.4 1.4 0 0 0 0-2L9 3.6a1.4 1.4 0 0 0-2 0Z" /></>),
  users: svg(<><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5" /><path d="M18.5 19a5.5 5.5 0 0 0-3-4.9" /></>),
  zap: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />),
  clock: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></>),
  check: svg(<path d="m4 10 4 4 8-9" />, '0 0 20 20'),
  gear: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>),
  lock: svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
}

function Avatar({ src, nome, className }) {
  const [erro, setErro] = useState(false)
  const inicial = (String(nome || '?').trim().charAt(0) || '?').toUpperCase()
  return <div className={'gv-av ' + className}>{src && !erro ? <img src={src} alt="" onError={() => setErro(true)} /> : inicial}</div>
}

const DIAS = [['Dom', 0], ['Seg', 1], ['Ter', 2], ['Qua', 3], ['Qui', 4], ['Sex', 5], ['Sáb', 6]]
const CUPOM_TIPOS = [['PERCENT_DISCOUNT', '% de desconto'], ['FLAT_DISCOUNT', 'R$ de desconto'], ['FREE_SHIPPING', 'Frete grátis']]
const fmtDias = (dd) => dd.map((d) => DIAS.find(([, n]) => n === d)?.[0]).join(', ')
// Renderiza o texto com a formatação do WhatsApp: *negrito*, _itálico_, ~tachado~,
// ```mono```, `mono`, links clicáveis (azul) e a variável {cupom}.
function renderTexto(txt) {
  const re = /(\{cupom\})|(```[\s\S]+?```)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(`[^`\n]+`)|((?:https?:\/\/|www\.)[^\s]+)/g
  const s = String(txt || '')
  const out = []
  let last = 0, m, k = 0
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    if (m[1]) out.push(<span key={k++} className="gv-bubble-cupom">CUPOM</span>)
    else if (m[2]) out.push(<code key={k++} className="wa-mono">{tok.slice(3, -3)}</code>)
    else if (m[3]) out.push(<strong key={k++}>{renderTexto(tok.slice(1, -1))}</strong>)
    else if (m[4]) out.push(<em key={k++}>{renderTexto(tok.slice(1, -1))}</em>)
    else if (m[5]) out.push(<span key={k++} className="wa-strike">{renderTexto(tok.slice(1, -1))}</span>)
    else if (m[6]) out.push(<code key={k++} className="wa-mono">{tok.slice(1, -1)}</code>)
    else if (m[7]) { const href = tok.startsWith('www.') ? `https://${tok}` : tok; out.push(<a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="wa-link">{tok}</a>) }
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

export default function GrupoVip() {
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null) // {connected, number, profileName, avatar, qr}
  const [grupoInfo, setGrupoInfo] = useState(null)
  const [qr, setQr] = useState(null)
  const [conectando, setConectando] = useState(false)
  const [grupos, setGrupos] = useState([])
  const [hubId, setHubId] = useState('')
  const [mensagens, setMensagens] = useState([])
  const [historico, setHistorico] = useState([])
  const [modal, setModal] = useState(null)
  const [excluir, setExcluir] = useState(null)
  const configRef = useRef(null)

  const carregar = useCallback(() => {
    api.get('/grupo-vip/config').then((r) => { setCfg(r.data); setHubId(r.data.hubClienteId || '') }).catch(() => {})
    api.get('/grupo-vip/status').then((r) => setStatus(r.data)).catch(() => setStatus({ connected: false }))
  }, [])
  const carregarMsgs = useCallback(() => {
    api.get('/grupo-vip/mensagens').then((r) => setMensagens(r.data.mensagens || [])).catch(() => {})
    api.get('/grupo-vip/historico').then((r) => setHistorico(r.data.historico || [])).catch(() => {})
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarMsgs() }, [carregarMsgs])

  const conectado = !!status?.connected
  const temGrupo = !!cfg?.grupoJid

  // info do grupo (membros/descrição) quando conectado e com grupo
  useEffect(() => {
    if (conectado && temGrupo) api.get('/grupo-vip/grupo-info').then((r) => setGrupoInfo(r.data.info)).catch(() => setGrupoInfo(null))
    else setGrupoInfo(null)
  }, [conectado, temGrupo, cfg?.grupoJid])

  // poll de status enquanto o QR está aberto
  useEffect(() => {
    if (!conectando) return
    const t = setInterval(() => {
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
    try { const r = await api.put('/grupo-vip/config', { grupoJid: jid, grupoNome: nome || null }); setCfg(r.data); setGrupos([]); notify('Grupo salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar o grupo.', 'error') }
  }
  async function salvarConfig(patch) {
    try { const r = await api.put('/grupo-vip/config', patch); setCfg(r.data); notify('Salvo.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
  }
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
  const irConfig = () => configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (!cfg) return <div className="loading-state">Carregando…</div>

  const subGrupo = temGrupo
    ? [grupoInfo?.membros > 0 ? `${grupoInfo.membros} membros` : null, grupoInfo?.descricao].filter(Boolean).join('  ·  ') || 'grupo selecionado'
    : 'toque na engrenagem para escolher o grupo'
  const nAtivas = mensagens.filter((m) => m.ativa).length

  return (
    <div>
      <div className="page-header"><div><h1>Grupo VIP</h1><div className="page-header-sub">Disparos agendados no seu grupo VIP do WhatsApp + cupom do Cardápio Web.</div></div></div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* Não conectado → setup de conexão */}
      {!conectado && (
        <div className="gv-card">
          <div className="gv-head">
            <div className="gv-ic">{I.phone}</div>
            <div>
              <div className="gv-tt">Conecte um número de WhatsApp</div>
              <div className="gv-sub">É o número que vai enviar as mensagens no grupo VIP.</div>
            </div>
            <div className="gv-right">
              <button type="button" className="btn btn-primary" onClick={conectar} disabled={conectando}>{conectando ? 'Aguardando leitura…' : 'Conectar por QR'}</button>
            </div>
          </div>
          {conectando && qr && (
            <div className="gv-qr">
              <img src={qr} alt="QR code para conectar" />
              <div className="gv-qr-hint">No WhatsApp do número → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>, e aponte para o QR.</div>
            </div>
          )}
        </div>
      )}

      {/* Conectado → chat estilo WhatsApp */}
      {conectado && (<>
        <div className="gv-wa">
          <div className="gv-wa-head">
            <Avatar src={temGrupo ? grupoInfo?.foto : null} nome={temGrupo ? (cfg.grupoNome || 'G') : '?'} className="gv-av-lg" />
            <div className="gv-wa-id">
              <div className="gv-wa-tt">{temGrupo ? (cfg.grupoNome || cfg.grupoJid) : 'Nenhum grupo escolhido'}</div>
              <div className="gv-wa-sub">{subGrupo}</div>
            </div>
            <div className="gv-wa-actions">
              {nAtivas > 0 && <span className="gv-wa-pill on">{nAtivas} programada{nAtivas > 1 ? 's' : ''}</span>}
              <button type="button" className="gv-wa-gear" title="Configurações" onClick={irConfig}>{I.gear}</button>
            </div>
          </div>

          <div className="gv-wa-body">
            {temGrupo && mensagens.length > 0 && (
              <div className="gv-wa-info">📅 Estas são as <strong>mensagens programadas</strong> — o sistema envia sozinho no grupo, nos dias e horários mostrados. Use <strong>Editar</strong> em cada uma para alterar.</div>
            )}

            {!temGrupo
              ? <div className="gv-wa-empty">Escolha o grupo VIP nas <strong>Configurações</strong> logo abaixo para começar a programar as mensagens.</div>
              : mensagens.length === 0
                ? <div className="gv-wa-empty">Nenhuma mensagem programada.<br />Toque no <strong>+</strong> abaixo para criar a primeira.</div>
                : mensagens.map((m) => (
                  <div key={m.id} className="gv-msg-item">
                    <div className={'gv-bubble' + (m.ativa ? '' : ' off')}>
                      <div className="gv-bubble-tx">{renderTexto(m.texto)}</div>
                      {m.cupomModo !== 'NENHUM' && <div className="gv-bubble-tag">🎟️ {m.cupomModo === 'FIXO' ? `cupom ${m.cupomCodigoFixo || ''}` : 'cria cupom no disparo'}</div>}
                      <div className="gv-bubble-foot">
                        <span className="gv-bubble-day">{fmtDias(m.diasSemana)}</span>
                        <span>{m.horario}</span>
                        {I.clock}
                      </div>
                    </div>
                    <div className="gv-cap">
                      <span className="gv-cap-tag">{m.ativa ? '🕒 Programada' : '⏸️ Pausada'}</span>
                      <span className="sep">·</span>
                      <button type="button" onClick={() => editarMsg(m)}>Editar</button>
                      <span className="sep">·</span>
                      <button type="button" className="del" onClick={() => setExcluir(m)}>Excluir</button>
                    </div>
                  </div>
                ))}
          </div>

          <div className="gv-wa-compose">
            <button type="button" className="gv-wa-fakeinput" onClick={novaMsg}>Programar uma nova mensagem…</button>
            <button type="button" className="gv-wa-send" onClick={novaMsg} title="Programar mensagem">+</button>
          </div>
        </div>

        {/* Configurações */}
        <div className="gv-card" ref={configRef}>
          <div className="gv-head">
            <div className="gv-ic">{I.gear}</div>
            <div><div className="gv-tt">Configurações</div><div className="gv-sub">Grupo e cupom.</div></div>
          </div>
          <div className="gv-body">
            {/* número conectado */}
            <label className="form-label">Número conectado</label>
            <div className="gv-current">
              <Avatar src={status.avatar} nome={status.profileName || status.number} className="gv-av-lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gv-current-nm">{status.profileName || 'Número do WhatsApp'}</div>
                <div className="gv-current-sub">{status.number || '—'} · <span style={{ color: '#16a34a', fontWeight: 600 }}>conectado</span></div>
              </div>
            </div>

            <hr className="gv-divider" />

            {/* grupo */}
            <label className="form-label">Grupo do WhatsApp</label>
            {grupos.length > 0 ? (
              <>
                <div className="gv-rows" style={{ marginBottom: 8 }}>
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGrupos([])}>Fechar lista</button>
              </>
            ) : temGrupo ? (
              <div className="gv-current">
                <Avatar src={grupoInfo?.foto} nome={cfg.grupoNome} className="gv-av-lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gv-current-nm">{cfg.grupoNome || cfg.grupoJid}</div>
                  <div className="gv-current-sub">{grupoInfo?.membros > 0 ? `${grupoInfo.membros} membros · ` : ''}Grupo selecionado</div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={carregarGrupos}>Trocar</button>
              </div>
            ) : (
              <div className="gv-inline">
                <span style={{ flex: 1, fontSize: 13, color: 'var(--app-text-3)' }}>Nenhum grupo escolhido ainda.</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={carregarGrupos}>Escolher grupo</button>
              </div>
            )}

            <hr className="gv-divider" />

            {/* cupom */}
            <label className="form-label">Cupom do Cardápio Web <span style={{ color: 'var(--app-text-3)', fontWeight: 400 }}>(opcional)</span></label>
            <div className="gv-inline">
              <input className="form-input" value={hubId} onChange={(e) => setHubId(e.target.value)} placeholder="ID da loja no HUB (clienteId)" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => salvarConfig({ hubClienteId: hubId.trim() })}>Salvar</button>
            </div>
            <div className="gv-hint">Só é preciso se alguma mensagem usar <code>{'{cupom}'}</code> para criar um cupom automático no Cardápio Web.</div>
          </div>
        </div>

        {/* histórico */}
        <div className="gv-card">
          <div className="gv-head">
            <div className="gv-ic">{I.clock}</div>
            <div><div className="gv-tt">Histórico de disparos</div><div className="gv-sub">Últimos envios e cupons gerados.</div></div>
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
          <div className="form-group"><label className="form-label">Texto (use <code>{'{cupom}'}</code> para inserir o código)</label><textarea className="form-input" rows={4} value={modal.texto} onChange={(e) => updM('texto', e.target.value)} />
            <div className="gv-hint">Formatação do WhatsApp: <code>*negrito*</code> · <code>_itálico_</code> · <code>~tachado~</code> · <code>```mono```</code>. Links viram azul automaticamente.</div>
          </div>
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
