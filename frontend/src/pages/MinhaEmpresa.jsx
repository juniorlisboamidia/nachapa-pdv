// Configurações da loja (central). Abas: Empresa (perfil/logo), WhatsApp (número que
// envia os códigos de acesso) e Acessos (link da equipe + gerentes com áreas liberadas).
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

const CAMPOS_VAZIOS = { nome: '', whatsapp: '', email: '', endereco: '', logoDataUrl: null, logoPublicaDataUrl: null }
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp']
const LIMITE_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB
const AREA_LABEL = {
  ponto: 'Ponto Facial', bonificacao: 'Bonificação', produtos: 'Produtos',
  gestao: 'Gestão (custos/faturamento)', financeiro: 'Financeiro', relatorios: 'Relatórios',
  talentos: 'Banco de talentos', checklist: 'Checklist', etiquetas: 'Etiquetas', automacoes: 'Automações',
}
const inicial = (nome) => { const s = String(nome ?? '').trim(); return s ? s.charAt(0).toUpperCase() : 'H' }
const foneMask = (v) => {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function Ico({ d, children }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d ? <path d={d} /> : children}</svg>
}
const IcoMail = () => <Ico><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></Ico>
const IcoWhats = () => <Ico d="M5 4h3.5l1.8 4.3-2.4 1.5a11 11 0 0 0 5.3 5.3l1.5-2.4L19 16.5V20a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
const IcoPin = () => <Ico><path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></Ico>
const IcoSave = () => <Ico><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7" /><path d="M8 13h8v7H8z" /></Ico>
const IcoUpload = () => <Ico><path d="M12 16V5" /><path d="m7.5 9.5 4.5-4.5 4.5 4.5" /><path d="M5 19h14" /></Ico>
const IcoTrash = () => <Ico><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></Ico>

const TABS = [['empresa', 'Empresa'], ['whatsapp', 'WhatsApp'], ['acessos', 'Acessos']]

export default function MinhaEmpresa() {
  const [aba, setAba] = useState('empresa')
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <div className="page-header-sub">Perfil da loja, WhatsApp e quem tem acesso ao sistema.</div>
        </div>
      </div>
      <div className="modal-tabs" style={{ marginBottom: 18, gap: 6 }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={'av-tab' + (aba === id ? ' active' : '')} onClick={() => setAba(id)}>{label}</button>
        ))}
      </div>
      {aba === 'empresa' && <AbaEmpresa />}
      {aba === 'whatsapp' && <AbaWhatsApp />}
      {aba === 'acessos' && <AbaAcessos />}
    </div>
  )
}

/* ───────────── Aba Empresa (perfil/logo) ───────────── */
function AbaEmpresa() {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(CAMPOS_VAZIOS)
  const [importando, setImportando] = useState(false)
  const [modalMaps, setModalMaps] = useState(false)
  const [linkMaps, setLinkMaps] = useState('')
  const fileRef = useRef(null)
  const filePubRef = useRef(null)
  const logoOriginalRef = useRef(null)
  const logoPubOriginalRef = useRef(null)

  function aplicar(data) {
    setForm({ nome: data?.nome ?? '', whatsapp: data?.whatsapp ?? '', email: data?.email ?? '', endereco: data?.endereco ?? '', logoDataUrl: data?.logoDataUrl ?? null, logoPublicaDataUrl: data?.logoPublicaDataUrl ?? null })
    logoOriginalRef.current = data?.logoDataUrl ?? null
    logoPubOriginalRef.current = data?.logoPublicaDataUrl ?? null
  }
  useEffect(() => {
    api.get('/empresa').then((r) => aplicar(r.data))
      .catch((err) => setErro(err?.response?.data?.error ?? (err?.code === 'ERR_NETWORK' ? 'Não foi possível conectar ao backend.' : err?.message ?? 'Erro ao carregar os dados da empresa.')))
      .finally(() => setLoading(false))
  }, [])
  const onChange = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))
  function handleLogoSelect(file, campo = 'logoDataUrl') {
    if (!file) return
    if (!TIPOS_LOGO.includes(file.type)) return setToast({ message: 'Formato inválido. Use PNG, JPG ou WEBP.', type: 'error' })
    if (file.size > LIMITE_LOGO_BYTES) return setToast({ message: 'Imagem muito grande. Use uma logo de até 2 MB.', type: 'error' })
    if (campo === 'logoPublicaDataUrl' && file.type !== 'image/png' && file.type !== 'image/webp') {
      setToast({ message: 'Para fundo transparente use PNG (ou WEBP). JPG não tem transparência.', type: 'error' }); return
    }
    const reader = new FileReader()
    reader.onload = (e) => onChange(campo, String(e.target.result))
    reader.onerror = () => setToast({ message: 'Não foi possível ler a imagem.', type: 'error' })
    reader.readAsDataURL(file)
  }
  function handleRemoverLogo() { onChange('logoDataUrl', null); if (fileRef.current) fileRef.current.value = '' }
  function handleRemoverLogoPub() { onChange('logoPublicaDataUrl', null); if (filePubRef.current) filePubRef.current.value = '' }
  async function importarEndereco() {
    const url = linkMaps.trim()
    if (!url) return setToast({ message: 'Cole o link do Google Maps primeiro.', type: 'error' })
    setImportando(true)
    try {
      const { data } = await api.post('/empresa/importar-endereco', { url })
      if (data?.endereco) { onChange('endereco', data.endereco); setModalMaps(false); setToast({ message: 'Endereço preenchido! Confira e complete o número, se faltar.', type: 'success' }) }
      else setToast({ message: 'Localizei o estabelecimento, mas não o endereço completo. Preencha manualmente.', type: 'error' })
    } catch (err) { setToast({ message: err?.response?.data?.error ?? 'Não consegui ler esse link do Google Maps.', type: 'error' }) }
    finally { setImportando(false) }
  }
  async function handleSalvar() {
    if (!form.nome.trim()) return setToast({ message: 'Informe o nome do estabelecimento.', type: 'error' })
    setSalvando(true)
    try {
      const payload = { nome: form.nome, whatsapp: form.whatsapp, endereco: form.endereco }
      if (form.logoDataUrl !== logoOriginalRef.current) payload.logoDataUrl = form.logoDataUrl
      if (form.logoPublicaDataUrl !== logoPubOriginalRef.current) payload.logoPublicaDataUrl = form.logoPublicaDataUrl
      const r = await api.put('/empresa', payload)
      aplicar(r.data)
      window.dispatchEvent(new CustomEvent('empresa-atualizada', { detail: r.data }))
      setToast({ message: 'Dados da empresa salvos com sucesso.', type: 'success' })
    } catch (err) { setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar os dados da empresa.', type: 'error' }) }
    finally { setSalvando(false) }
  }

  const nomePreview = form.nome.trim() || 'Hamburgueria'
  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      {modalMaps && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-title">Buscar endereço no Google Maps</div>
            <p style={{ fontSize: 13, color: 'var(--app-text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>No Google Maps, abra a página do seu estabelecimento, toque em <strong>Compartilhar</strong> e copie o link. Cole abaixo para preencher o endereço automaticamente.</p>
            <input className="form-input" autoFocus value={linkMaps} onChange={(e) => setLinkMaps(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); importarEndereco() } }} placeholder="https://maps.app.goo.gl/..." />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalMaps(false)} disabled={importando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={importarEndereco} disabled={importando}>{importando ? 'Buscando…' : 'Buscar endereço'}</button>
            </div>
          </div>
        </div>
      )}
      {erro && <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>}
      {loading ? (
        <div className="loading-state">Carregando dados da empresa…</div>
      ) : (
        <div className="me-card">
          <div className="me-section-title">Logo do estabelecimento</div>
          <div className="me-logo-row">
            {form.logoDataUrl ? <img className="me-logo" src={form.logoDataUrl} alt="Logo do estabelecimento" /> : <div className="me-logo me-logo-empty">{inicial(form.nome)}</div>}
            <div className="me-logo-main">
              <div className="me-logo-name">{nomePreview}</div>
              <div className="me-logo-buttons">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { handleLogoSelect(e.target.files?.[0]); e.target.value = '' }} />
                <button type="button" className="me-logo-btn" onClick={() => fileRef.current?.click()}><IcoUpload />{form.logoDataUrl ? 'Trocar' : 'Selecionar'}</button>
                {form.logoDataUrl && <button type="button" className="me-logo-btn me-logo-btn-danger" onClick={handleRemoverLogo}><IcoTrash />Remover</button>}
              </div>
              <div className="me-hint" style={{ marginTop: 6 }}>Usada no menu do sistema (fundo escuro).</div>
            </div>
          </div>

          <div className="me-divider" />

          {/* Logo sem fundo — páginas públicas (fundo claro) */}
          <div className="me-section-title">Logo sem fundo <span style={{ fontWeight: 400, color: 'var(--app-text-soft, #999)', fontSize: 12 }}>· páginas da equipe</span></div>
          <div className="me-logo-row">
            {form.logoPublicaDataUrl
              ? <img className="me-logo" src={form.logoPublicaDataUrl} alt="Logo sem fundo" style={{ background: 'repeating-conic-gradient(#e9e9e9 0% 25%, #fff 0% 50%) 50% / 14px 14px', objectFit: 'contain' }} />
              : <div className="me-logo me-logo-empty">{inicial(form.nome)}</div>}
            <div className="me-logo-main">
              <div className="me-logo-name">{form.logoPublicaDataUrl ? 'Logo transparente' : 'Nenhuma — usaremos a de cima'}</div>
              <div className="me-logo-buttons">
                <input ref={filePubRef} type="file" accept="image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { handleLogoSelect(e.target.files?.[0], 'logoPublicaDataUrl'); e.target.value = '' }} />
                <button type="button" className="me-logo-btn" onClick={() => filePubRef.current?.click()}><IcoUpload />{form.logoPublicaDataUrl ? 'Trocar' : 'Selecionar PNG'}</button>
                {form.logoPublicaDataUrl && <button type="button" className="me-logo-btn me-logo-btn-danger" onClick={handleRemoverLogoPub}><IcoTrash />Remover</button>}
              </div>
              <div className="me-hint" style={{ marginTop: 6 }}>PNG <strong>com fundo transparente</strong>, usada no ranking público e na Área do Colaborador (fundo claro). Se ficar vazia, usamos a logo de cima.</div>
            </div>
          </div>

          <div className="me-divider" />
          <div className="me-field">
            <label className="me-label">Nome do estabelecimento</label>
            <input className="form-input" value={form.nome} onChange={(e) => onChange('nome', e.target.value)} placeholder="Hamburgueria" />
          </div>
          <div className="me-field">
            <label className="me-label">E-mail do gestor</label>
            <div className="me-input-wrap"><span className="me-input-icon"><IcoMail /></span><input className="form-input me-input-icon-pad" value={form.email} readOnly disabled placeholder="—" /></div>
            <div className="me-hint">O e-mail não pode ser alterado por aqui.</div>
          </div>
          <div className="me-field">
            <label className="me-label">WhatsApp</label>
            <div className="me-input-wrap"><span className="me-input-icon"><IcoWhats /></span><input className="form-input me-input-icon-pad" value={form.whatsapp} onChange={(e) => onChange('whatsapp', e.target.value)} placeholder="(00) 00000-0000" /></div>
            <div className="me-hint">Número que receberá alertas e resumos do sistema.</div>
          </div>
          <div className="me-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <label className="me-label" style={{ marginBottom: 0 }}>Endereço completo</label>
              <button type="button" className="me-logo-btn" onClick={() => { setLinkMaps(''); setModalMaps(true) }} disabled={importando}><IcoPin />Buscar endereço no Google Maps</button>
            </div>
            <div className="me-input-wrap me-input-wrap-top"><span className="me-input-icon"><IcoPin /></span><textarea className="form-input me-input-icon-pad" rows={2} value={form.endereco} onChange={(e) => onChange('endereco', e.target.value)} placeholder="Rua X, 123, Bairro, Cidade - UF" style={{ resize: 'vertical' }} /></div>
          </div>
          <div className="me-actions">
            <button type="button" className="btn btn-primary me-btn-salvar" onClick={handleSalvar} disabled={salvando}><IcoSave />{salvando ? 'Salvando…' : 'Salvar Alterações'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────── Aba WhatsApp (número que envia os códigos) ───────────── */
function AbaWhatsApp() {
  const [wa, setWa] = useState(null)
  const [qr, setQr] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)
  const [toast, setToast] = useState(null)
  function status() { setCarregando(true); api.get('/pdv/whatsapp/status').then((r) => setWa(r.data)).catch((e) => setWa({ configurado: false, erro: e?.response?.data?.error })).finally(() => setCarregando(false)) }
  useEffect(status, [])
  async function conectar() {
    setQr(null)
    try { const r = await api.post('/pdv/whatsapp/conectar'); setQr(r.data?.qrcode || null); if (!r.data?.qrcode) setToast({ message: 'Sem QR agora — atualize o status em instantes.', type: 'info' }) }
    catch (e) { setToast({ message: e?.response?.data?.error ?? 'Erro ao gerar o QR.', type: 'error' }) }
  }
  async function criarInstancia() {
    setCriando(true)
    try {
      const r = await api.post('/pdv/whatsapp/instancia', { nome: 'nachapa-pdv' })
      if (r.data?.token) window.prompt('Instância criada! Copie este token para UAZAPI_INSTANCE_TOKEN no .env do PDV e reinicie:', r.data.token)
      setToast({ message: 'Instância criada. Configure o token no .env e reinicie.', type: 'success' })
    } catch (e) { setToast({ message: e?.response?.data?.error ?? 'Erro ao criar a instância.', type: 'error' }) }
    finally { setCriando(false) }
  }
  return (
    <div className="me-card">
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      <div className="me-section-title">WhatsApp do PDV</div>
      <div style={{ fontSize: 13, color: 'var(--app-text-soft, #777)', marginBottom: 14, lineHeight: 1.55 }}>Número que envia os códigos de acesso (login da equipe e dos gerentes).</div>
      {carregando ? <div style={{ fontSize: 13, color: 'var(--app-text-soft, #999)' }}>Verificando…</div> : !wa?.configurado ? (
        <div style={{ fontSize: 13, color: 'var(--app-text-soft, #777)', lineHeight: 1.7 }}>
          Ainda não configurado. Defina <code>UAZAPI_SERVER</code>, <code>UAZAPI_ADMIN_TOKEN</code> e <code>UAZAPI_INSTANCE_TOKEN</code> no <code>.env</code> do PDV (e reinicie). Se ainda não tem instância, crie uma:
          <div style={{ marginTop: 10 }}><button type="button" className="btn btn-secondary btn-sm" onClick={criarInstancia} disabled={criando}>{criando ? 'Criando…' : 'Criar instância'}</button></div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: wa.connected ? 'rgba(22,163,74,.12)' : 'rgba(217,119,6,.12)', color: wa.connected ? '#16a34a' : '#d97706' }}>{wa.connected ? `Conectado${wa.number ? ' · ' + wa.number : ''}` : 'Desconectado'}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={status}>Atualizar</button>
            {!wa.connected && <button type="button" className="btn btn-primary btn-sm" onClick={conectar}>Conectar (QR)</button>}
          </div>
          {qr && <div style={{ marginTop: 14, textAlign: 'center' }}><img src={qr} alt="QR Code" style={{ width: 230, height: 230, borderRadius: 12, border: '1px solid var(--app-border,#eee)' }} /><div style={{ fontSize: 12, color: 'var(--app-text-soft, #999)', marginTop: 8 }}>No WhatsApp do número do PDV: Aparelhos conectados › Conectar aparelho.</div></div>}
        </div>
      )}
    </div>
  )
}

/* ───────────── Aba Acessos (link da equipe + gerentes) ───────────── */
function AbaAcessos() {
  const [dados, setDados] = useState(null) // { operadores, areas }
  const [colabLink, setColabLink] = useState('')
  const [edit, setEdit] = useState(null)
  const [toast, setToast] = useState(null)
  function carregar() {
    api.get('/acessos').then((r) => setDados(r.data)).catch((e) => setToast({ message: e?.response?.data?.error ?? 'Erro ao carregar os acessos.', type: 'error' }))
    api.get('/bonificacao/config').then((r) => { const id = r.data?.config?.slugPublico || r.data?.config?.tokenPublico; setColabLink(id ? `${window.location.origin}/colaborador/${id}` : '') }).catch(() => {})
  }
  useEffect(carregar, [])
  const copiar = (txt) => { try { navigator.clipboard.writeText(txt) } catch { /* noop */ } setToast({ message: 'Link copiado.', type: 'success' }) }
  async function remover(o) {
    if (!window.confirm(`Remover o acesso de ${o.nome}?`)) return
    try { await api.delete(`/acessos/${o.id}`); carregar() } catch (e) { setToast({ message: e?.response?.data?.error ?? 'Erro ao remover.', type: 'error' }) }
  }
  const areasDisp = dados?.areas || Object.keys(AREA_LABEL)
  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="me-card" style={{ marginBottom: 16 }}>
        <div className="me-section-title">Equipe · Área do Colaborador</div>
        <div style={{ fontSize: 13, color: 'var(--app-text-soft, #777)', marginBottom: 12, lineHeight: 1.55 }}>Um link único para a equipe entrar na Área do Colaborador (login por WhatsApp). O número precisa estar cadastrado no colaborador (menu Colaboradores).</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" style={{ flex: 1, minWidth: 220 }} value={colabLink || 'Defina o endereço do link em Bonificação › Configuração › Link público.'} readOnly />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => colabLink && copiar(colabLink)} disabled={!colabLink}>Copiar</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => colabLink && window.open(colabLink, '_blank', 'noopener')} disabled={!colabLink}>Abrir</button>
        </div>
      </div>

      <div className="me-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <div className="me-section-title" style={{ marginBottom: 0 }}>Gestão · gerentes com acesso</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({})}>+ Novo acesso</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--app-text-soft, #777)', marginBottom: 12, lineHeight: 1.55 }}>Quem pode entrar no PDV pelo WhatsApp (sem conta no HUB), vendo só as áreas que você liberar.</div>
        {!dados ? (
          <div className="loading-state">Carregando…</div>
        ) : dados.operadores.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 16px' }}>Nenhum acesso de gestão ainda. Clique em “Novo acesso”.</div>
        ) : (
          <div className="table-card">
            <table className="hb-table">
              <thead><tr><th>Nome</th><th>WhatsApp</th><th>Áreas</th><th>Status</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
              <tbody>
                {dados.operadores.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.nome}</td>
                    <td>{foneMask(o.whatsapp)}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--app-text-soft, #777)' }}>{(o.areas || []).length ? (o.areas || []).map((a) => AREA_LABEL[a] || a).join(', ') : '—'}</td>
                    <td>{o.ativo ? <span className="badge" style={{ background: 'rgba(22,163,74,.12)', color: '#16a34a' }}>Ativo</span> : <span className="badge badge-gray">Inativo</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit(o)}>Editar</button>{' '}
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remover(o)}>Remover</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <OperadorModal operador={edit} areasDisp={areasDisp} onClose={() => setEdit(null)} onSalvou={() => { setEdit(null); carregar() }} setToast={setToast} />}
    </div>
  )
}

function OperadorModal({ operador, areasDisp, onClose, onSalvou, setToast }) {
  const nova = !operador.id
  const [f, setF] = useState({ nome: operador.nome || '', whatsapp: foneMask(operador.whatsapp || ''), areas: operador.areas || [], ativo: operador.ativo !== false })
  const [salvando, setSalvando] = useState(false)
  const toggleArea = (a) => setF((s) => ({ ...s, areas: s.areas.includes(a) ? s.areas.filter((x) => x !== a) : [...s.areas, a] }))
  async function salvar() {
    if (!f.nome.trim()) return setToast({ message: 'Informe o nome.', type: 'error' })
    if (String(f.whatsapp).replace(/\D/g, '').length < 10) return setToast({ message: 'Informe o WhatsApp com DDD.', type: 'error' })
    setSalvando(true)
    try {
      const payload = { nome: f.nome, whatsapp: f.whatsapp, areas: f.areas, ativo: f.ativo }
      if (nova) await api.post('/acessos', payload); else await api.put(`/acessos/${operador.id}`, payload)
      onSalvou()
    } catch (e) { setToast({ message: e?.response?.data?.error ?? 'Erro ao salvar.', type: 'error' }); setSalvando(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{nova ? 'Novo acesso de gestão' : 'Editar acesso'}</div>
        <div className="form-group">
          <label className="form-label">Nome</label>
          <input className="form-input" value={f.nome} onChange={(e) => setF((s) => ({ ...s, nome: e.target.value }))} placeholder="Ex.: Maria (gerente)" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">WhatsApp <span style={{ color: '#999', fontWeight: 400 }}>· por onde ela recebe o código</span></label>
          <input className="form-input" value={f.whatsapp} onChange={(e) => setF((s) => ({ ...s, whatsapp: foneMask(e.target.value) }))} placeholder="(00) 00000-0000" inputMode="numeric" />
        </div>
        <div className="form-group">
          <label className="form-label">Áreas liberadas</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {areasDisp.map((a) => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer', padding: '4px 2px' }}>
                <input type="checkbox" checked={f.areas.includes(a)} onChange={() => toggleArea(a)} />
                {AREA_LABEL[a] || a}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #999)', marginTop: 6 }}>Configurações, WhatsApp e Acessos ficam sempre só com você (dono).</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 4 }}>
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF((s) => ({ ...s, ativo: e.target.checked }))} /> Acesso ativo
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
