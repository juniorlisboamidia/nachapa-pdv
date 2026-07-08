// Minha Empresa (V1) — cadastro básico do negócio usado na sidebar e em telas de
// configuração. Single-tenant: lê/grava a empresa única via /api/empresa. Logo em
// dataURL base64 (sem upload de arquivo no servidor). E-mail é somente leitura.
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'

const CAMPOS_VAZIOS = { nome: '', whatsapp: '', email: '', endereco: '', logoDataUrl: null }
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp']
const LIMITE_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

function inicial(nome) {
  const s = String(nome ?? '').trim()
  return s ? s.charAt(0).toUpperCase() : 'H'
}

// Ícones de linha (SVG inline, sem biblioteca)
function Ico({ d, children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  )
}
const IcoMail = () => <Ico><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></Ico>
const IcoWhats = () => <Ico d="M5 4h3.5l1.8 4.3-2.4 1.5a11 11 0 0 0 5.3 5.3l1.5-2.4L19 16.5V20a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
const IcoPin = () => <Ico><path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></Ico>
const IcoSave = () => <Ico><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7" /><path d="M8 13h8v7H8z" /></Ico>
const IcoUpload = () => <Ico><path d="M12 16V5" /><path d="m7.5 9.5 4.5-4.5 4.5 4.5" /><path d="M5 19h14" /></Ico>
const IcoTrash = () => <Ico><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></Ico>

export default function MinhaEmpresa() {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(CAMPOS_VAZIOS)
  const [importando, setImportando] = useState(false)
  const [modalMaps, setModalMaps] = useState(false)
  const [linkMaps, setLinkMaps] = useState('')
  const fileRef = useRef(null)
  const logoOriginalRef = useRef(null) // logo carregada do servidor (p/ só reenviar se mudar)

  function aplicar(data) {
    setForm({
      nome: data?.nome ?? '',
      whatsapp: data?.whatsapp ?? '',
      email: data?.email ?? '',
      endereco: data?.endereco ?? '',
      logoDataUrl: data?.logoDataUrl ?? null
    })
    logoOriginalRef.current = data?.logoDataUrl ?? null
  }

  useEffect(() => {
    api
      .get('/empresa')
      .then((r) => aplicar(r.data))
      .catch((err) =>
        setErro(
          err?.response?.data?.error ??
            (err?.code === 'ERR_NETWORK'
              ? 'Não foi possível conectar ao backend (http://localhost:4000).'
              : err?.message ?? 'Erro ao carregar os dados da empresa.')
        )
      )
      .finally(() => setLoading(false))
  }, [])

  function onChange(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function handleLogoSelect(file) {
    if (!file) return
    if (!TIPOS_LOGO.includes(file.type)) {
      setToast({ message: 'Formato inválido. Use uma imagem PNG, JPG ou WEBP.', type: 'error' })
      return
    }
    if (file.size > LIMITE_LOGO_BYTES) {
      setToast({ message: 'Imagem muito grande. Use uma logo de até 2 MB.', type: 'error' })
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => onChange('logoDataUrl', String(e.target.result))
    reader.onerror = () => setToast({ message: 'Não foi possível ler a imagem.', type: 'error' })
    reader.readAsDataURL(file)
  }

  function handleRemoverLogo() {
    onChange('logoDataUrl', null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function abrirModalMaps() {
    setLinkMaps('')
    setModalMaps(true)
  }

  async function importarEndereco() {
    const url = linkMaps.trim()
    if (!url) {
      setToast({ message: 'Cole o link do Google Maps primeiro.', type: 'error' })
      return
    }
    setImportando(true)
    try {
      const { data } = await api.post('/empresa/importar-endereco', { url })
      if (data?.endereco) {
        onChange('endereco', data.endereco)
        setModalMaps(false)
        setToast({ message: 'Endereço preenchido! Confira e complete o número, se faltar.', type: 'success' })
      } else {
        setToast({ message: 'Localizei o estabelecimento, mas não o endereço completo. Preencha manualmente.', type: 'error' })
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não consegui ler esse link do Google Maps.', type: 'error' })
    } finally {
      setImportando(false)
    }
  }

  async function handleSalvar() {
    if (!form.nome.trim()) {
      setToast({ message: 'Informe o nome do estabelecimento.', type: 'error' })
      return
    }
    setSalvando(true)
    try {
      // e-mail não é enviado: é somente leitura na V1.
      const payload = {
        nome: form.nome,
        whatsapp: form.whatsapp,
        endereco: form.endereco
      }
      // A logo (dataURL base64) só vai no corpo quando muda — evita um payload
      // pesado ao salvar apenas texto (que pode estourar o limite do proxy).
      if (form.logoDataUrl !== logoOriginalRef.current) {
        payload.logoDataUrl = form.logoDataUrl
      }
      const r = await api.put('/empresa', payload)
      aplicar(r.data)
      window.dispatchEvent(new CustomEvent('empresa-atualizada', { detail: r.data }))
      setToast({ message: 'Dados da empresa salvos com sucesso.', type: 'success' })
    } catch (err) {
      setToast({
        message: err?.response?.data?.error ?? 'Não foi possível salvar os dados da empresa.',
        type: 'error'
      })
    } finally {
      setSalvando(false)
    }
  }

  const nomePreview = form.nome.trim() || 'Hamburgueria'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Minha Empresa</h1>
          <div className="page-header-sub">Dados do seu estabelecimento visíveis no sistema.</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {modalMaps && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-title">Buscar endereço no Google Maps</div>
            <p style={{ fontSize: 13, color: 'var(--app-text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
              No Google Maps, abra a página do seu estabelecimento, toque em <strong>Compartilhar</strong> e copie o link. Cole abaixo para preencher o endereço automaticamente.
            </p>
            <input
              className="form-input"
              autoFocus
              value={linkMaps}
              onChange={(e) => setLinkMaps(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); importarEndereco() } }}
              placeholder="https://maps.app.goo.gl/..."
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalMaps(false)} disabled={importando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={importarEndereco} disabled={importando}>
                {importando ? 'Buscando…' : 'Buscar endereço'}
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <div className="alert alert-red">
          <div className="alert-msg clr-red">{erro}</div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Carregando dados da empresa…</div>
      ) : (
        <div className="me-card">
          {/* Logo + nome (prévia incorporada aqui) */}
          <div className="me-section-title">Logo do estabelecimento</div>
          <div className="me-logo-row">
            {form.logoDataUrl ? (
              <img className="me-logo" src={form.logoDataUrl} alt="Logo do estabelecimento" />
            ) : (
              <div className="me-logo me-logo-empty">{inicial(form.nome)}</div>
            )}
            <div className="me-logo-main">
              <div className="me-logo-name">{nomePreview}</div>
              <div className="me-logo-buttons">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleLogoSelect(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <button type="button" className="me-logo-btn" onClick={() => fileRef.current?.click()}>
                  <IcoUpload />
                  {form.logoDataUrl ? 'Trocar' : 'Selecionar'}
                </button>
                {form.logoDataUrl && (
                  <button type="button" className="me-logo-btn me-logo-btn-danger" onClick={handleRemoverLogo}>
                    <IcoTrash />
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="me-divider" />

          {/* Campos */}
          <div className="me-field">
            <label className="me-label">Nome do estabelecimento</label>
            <input
              className="form-input"
              value={form.nome}
              onChange={(e) => onChange('nome', e.target.value)}
              placeholder="Hamburgueria"
            />
          </div>

          <div className="me-field">
            <label className="me-label">E-mail do gestor</label>
            <div className="me-input-wrap">
              <span className="me-input-icon"><IcoMail /></span>
              <input className="form-input me-input-icon-pad" value={form.email} readOnly disabled placeholder="—" />
            </div>
            <div className="me-hint">O e-mail não pode ser alterado por aqui.</div>
          </div>

          <div className="me-field">
            <label className="me-label">WhatsApp</label>
            <div className="me-input-wrap">
              <span className="me-input-icon"><IcoWhats /></span>
              <input
                className="form-input me-input-icon-pad"
                value={form.whatsapp}
                onChange={(e) => onChange('whatsapp', e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="me-hint">Número que receberá alertas e resumos do sistema.</div>
          </div>

          <div className="me-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <label className="me-label" style={{ marginBottom: 0 }}>Endereço completo</label>
              <button type="button" className="me-logo-btn" onClick={abrirModalMaps} disabled={importando}>
                <IcoPin />
                Buscar endereço no Google Maps
              </button>
            </div>
            <div className="me-input-wrap me-input-wrap-top">
              <span className="me-input-icon"><IcoPin /></span>
              <textarea
                className="form-input me-input-icon-pad"
                rows={2}
                value={form.endereco}
                onChange={(e) => onChange('endereco', e.target.value)}
                placeholder="Rua X, 123, Bairro, Cidade - UF"
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="me-hint">Clique em “Buscar endereço no Google Maps” e cole o link de compartilhamento para preencher automaticamente — ou digite à mão.</div>
          </div>

          <div className="me-actions">
            <button type="button" className="btn btn-primary me-btn-salvar" onClick={handleSalvar} disabled={salvando}>
              <IcoSave />
              {salvando ? 'Salvando…' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
