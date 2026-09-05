// Avaliação (admin/Marketing) — campanhas de feedback por link/QR + relatório.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import BotaoCopiar from '../components/BotaoCopiar'

function dataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}
function formatarWhats(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return String(raw ?? '') || '—'
}

function EstrelasView({ valor, tamanho = 15 }) {
  const v = Math.round(valor || 0)
  return (
    <span className="aval-stars-view" style={{ fontSize: tamanho }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= v ? 'on' : ''}>★</span>
      ))}
    </span>
  )
}

const FORM_VAZIO = { nome: '', categorias: [] }

export default function Avaliacao() {
  const [campanhas, setCampanhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)

  const [modalCampanha, setModalCampanha] = useState(null) // { modo, id?, form }
  const [catInput, setCatInput] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null)

  const [relatorio, setRelatorio] = useState(null) // { campanha, resumo, respostas }
  const [loadingRel, setLoadingRel] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  function carregar() {
    setLoading(true)
    setErro(null)
    api
      .get('/avaliacao/campanhas')
      .then((r) => setCampanhas(Array.isArray(r.data) ? r.data : []))
      .catch((err) =>
        setErro(
          err?.response?.data?.error ??
            (err?.code === 'ERR_NETWORK' ? 'Não foi possível conectar ao backend (http://localhost:4000).' : 'Erro ao carregar campanhas.')
        )
      )
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    carregar()
  }, [])

  function linkPublico(token) {
    return `${window.location.origin}/avaliacao/${token}`
  }

  // ===== Campanha: nova / editar =====
  function abrirNova() {
    setCatInput('')
    setModalCampanha({ modo: 'nova', form: { ...FORM_VAZIO } })
  }
  function abrirEditar(c) {
    setCatInput('')
    setModalCampanha({ modo: 'editar', id: c.id, form: { nome: c.nome, categorias: [...(c.categorias ?? [])] } })
  }
  function addCategoria() {
    const v = catInput.trim()
    if (!v) return
    setModalCampanha((m) => {
      if (m.form.categorias.some((c) => c.toLowerCase() === v.toLowerCase())) return m
      if (m.form.categorias.length >= 10) return m
      return { ...m, form: { ...m.form, categorias: [...m.form.categorias, v] } }
    })
    setCatInput('')
  }
  const removeCategoria = (cat) =>
    setModalCampanha((m) => ({ ...m, form: { ...m.form, categorias: m.form.categorias.filter((c) => c !== cat) } }))

  async function salvarCampanha() {
    const f = modalCampanha.form
    if (!f.nome.trim()) return setToast({ message: 'Informe o nome da campanha.', type: 'error' })
    setSalvando(true)
    try {
      if (modalCampanha.modo === 'nova') {
        await api.post('/avaliacao/campanhas', f)
        setToast({ message: 'Campanha criada.', type: 'success' })
      } else {
        await api.put(`/avaliacao/campanhas/${modalCampanha.id}`, f)
        setToast({ message: 'Campanha atualizada.', type: 'success' })
        if (relatorio?.campanha?.id === modalCampanha.id) abrirRelatorio(modalCampanha.id, false)
      }
      setModalCampanha(null)
      carregar()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }
  async function excluirCampanha() {
    const alvo = confirmExcluir
    if (!alvo) return
    try {
      await api.delete(`/avaliacao/campanhas/${alvo.id}`)
      setConfirmExcluir(null)
      if (relatorio?.campanha?.id === alvo.id) setRelatorio(null)
      setToast({ message: 'Campanha excluída.', type: 'success' })
      carregar()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível excluir.', type: 'error' })
    }
  }

  // ===== Relatório (modal) =====
  async function abrirRelatorio(id, gerarQr = true) {
    setLoadingRel(true)
    if (gerarQr) setRelatorio((r) => (r?.campanha?.id === id ? r : null))
    try {
      const r = await api.get(`/avaliacao/campanhas/${id}/relatorio`)
      setRelatorio(r.data)
      if (gerarQr) {
        const url = await QRCode.toDataURL(linkPublico(r.data.campanha.tokenPublico), { width: 320, margin: 1, color: { dark: 'var(--app-text)', light: '#ffffff' } })
        setQrDataUrl(url)
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Erro ao abrir o relatório.', type: 'error' })
    } finally {
      setLoadingRel(false)
    }
  }
  function baixarQR(nome) {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `qr-${String(nome).toLowerCase().replace(/\s+/g, '-')}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Avaliação</h1>
          <div className="page-header-sub">Crie links/QR para coletar avaliações e dados dos clientes.</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNova}>Nova campanha</button>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando campanhas…</div>
      ) : campanhas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text)', marginBottom: 8 }}>Nenhuma campanha ainda</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Crie uma campanha (ex.: "Mesa 1", "Delivery") para gerar o link e o QR Code de avaliação.
          </div>
          <button type="button" className="btn btn-primary" onClick={abrirNova}>Criar primeira campanha</button>
        </div>
      ) : (
        <div className="aval-grid">
          {campanhas.map((c) => (
            <div key={c.id} className="aval-card">
              <div className="aval-card-top">
                <div className="aval-card-nome">{c.nome}</div>
                <span className={'badge ' + (c.ativa ? 'badge-green' : 'badge-gray')}>{c.ativa ? 'Ativa' : 'Inativa'}</span>
              </div>
              <div className="aval-card-metricas">
                <div>
                  <div className="aval-metrica-valor">{c.totalRespostas}</div>
                  <div className="aval-metrica-label">respostas</div>
                </div>
                <div>
                  <div className="aval-metrica-valor">
                    {c.mediaGeral != null ? <>{c.mediaGeral.toLocaleString('pt-BR')} <EstrelasView valor={c.mediaGeral} tamanho={13} /></> : '—'}
                  </div>
                  <div className="aval-metrica-label">média geral</div>
                </div>
              </div>
              {c.categorias.length > 0 && (
                <div className="aval-card-cats">
                  {c.categorias.map((cat) => <span key={cat} className="aval-chip">{cat}</span>)}
                </div>
              )}
              <div className="aval-card-acoes">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirRelatorio(c.id)}>Abrir</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditar(c)}>Editar</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(c)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal relatório */}
      {relatorio && (
        <div className="modal-overlay">
          <div className="modal modal-card-large aval-modal" onClick={(e) => e.stopPropagation()}>
            {loadingRel ? (
              <div className="loading-state">Carregando relatório…</div>
            ) : (
              <>
                <div className="modal-header">
                  <div>
                    <div className="aval-modal-titulo">
                      {relatorio.campanha.nome}
                      <span className={'badge ' + (relatorio.campanha.ativa ? 'badge-green' : 'badge-gray')} style={{ marginLeft: 8 }}>
                        {relatorio.campanha.ativa ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRelatorio(null)}>Fechar</button>
                </div>

                {/* Link + QR */}
                <div className="aval-qr-bloco">
                  <div className="aval-qr">{qrDataUrl ? <img src={qrDataUrl} alt="QR Code" width={150} height={150} /> : null}</div>
                  <div className="aval-qr-info">
                    <div className="esc-mini-label">Link de avaliação</div>
                    <div className="aval-link">{linkPublico(relatorio.campanha.tokenPublico)}</div>
                    <div className="aval-qr-acoes">
                      <BotaoCopiar className="btn btn-secondary btn-sm" label="Copiar link" texto={linkPublico(relatorio.campanha.tokenPublico)} onCopiado={() => setToast({ message: 'Link copiado.', type: 'success' })} />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => baixarQR(relatorio.campanha.nome)} disabled={!qrDataUrl}>Baixar QR</button>
                      <a className="btn btn-secondary btn-sm" href={linkPublico(relatorio.campanha.tokenPublico)} target="_blank" rel="noopener noreferrer">Abrir</a>
                    </div>
                  </div>
                </div>

                {/* Resumo */}
                <div className="aval-resumo">
                  <div className="aval-resumo-card">
                    <div className="aval-metrica-label">Respostas</div>
                    <div className="aval-resumo-valor">{relatorio.resumo.total}</div>
                  </div>
                  <div className="aval-resumo-card">
                    <div className="aval-metrica-label">Média geral</div>
                    <div className="aval-resumo-valor">
                      {relatorio.resumo.mediaGeral != null ? relatorio.resumo.mediaGeral.toLocaleString('pt-BR') : '—'}{' '}
                      <EstrelasView valor={relatorio.resumo.mediaGeral} tamanho={16} />
                    </div>
                  </div>
                  {relatorio.resumo.porCategoria.map((pc) => (
                    <div key={pc.categoria} className="aval-resumo-card">
                      <div className="aval-metrica-label">{pc.categoria}</div>
                      <div className="aval-resumo-valor">
                        {pc.media != null ? pc.media.toLocaleString('pt-BR') : '—'}{' '}
                        <EstrelasView valor={pc.media} tamanho={14} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Respostas */}
                <div className="section-title">Respostas ({relatorio.respostas.length})</div>
                {relatorio.respostas.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 16px' }}>Nenhuma resposta ainda. Compartilhe o link/QR para começar a coletar.</div>
                ) : (
                  <div className="aval-respostas">
                    {relatorio.respostas.map((r) => (
                      <div key={r.id} className="aval-resp">
                        <div className="aval-resp-top">
                          <div>
                            <span className="aval-resp-nome">{r.nome}</span>
                            <span className="aval-resp-contato">{formatarWhats(r.whatsapp)}{r.email ? ` · ${r.email}` : ''}</span>
                          </div>
                          <div className="aval-resp-nota">
                            <EstrelasView valor={r.notaGeral} tamanho={15} />
                            <span className="aval-resp-data">{dataHora(r.criadoEm)}</span>
                          </div>
                        </div>
                        {Object.keys(r.notasCategorias ?? {}).length > 0 && (
                          <div className="aval-resp-cats">
                            {Object.entries(r.notasCategorias).map(([cat, nota]) => (
                              <span key={cat} className="aval-chip">{cat}: {nota}★</span>
                            ))}
                          </div>
                        )}
                        {r.comentario && <div className="aval-resp-coment">“{r.comentario}”</div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal campanha (nova/editar) */}
      {modalCampanha && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalCampanha.modo === 'nova' ? 'Nova campanha' : 'Editar campanha'}</div>
            <div className="form-group">
              <label className="form-label">Nome da campanha</label>
              <input
                className="form-input"
                value={modalCampanha.form.nome}
                onChange={(e) => setModalCampanha((m) => ({ ...m, form: { ...m.form, nome: e.target.value } }))}
                placeholder="Ex.: Mesa 1, Delivery, Balcão…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Categorias de nota (opcional)</label>
              <div className="aval-cat-editor">
                <input
                  className="form-input"
                  value={catInput}
                  onChange={(e) => setCatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategoria() } }}
                  placeholder="Ex.: Comida, Atendimento, Entrega…"
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={addCategoria}>Adicionar</button>
              </div>
              {modalCampanha.form.categorias.length > 0 && (
                <div className="aval-cat-chips">
                  {modalCampanha.form.categorias.map((cat) => (
                    <span key={cat} className="aval-chip aval-chip-rem" onClick={() => removeCategoria(cat)} title="Remover">
                      {cat} <span className="aval-chip-x">×</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="aval-cat-dica">O cliente dá uma nota geral e, se houver, uma nota por categoria.</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalCampanha(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarCampanha} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir campanha"
        message={confirmExcluir ? `Excluir a campanha "${confirmExcluir.nome}"?` : ''}
        description="Todas as respostas coletadas nela serão removidas. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={excluirCampanha}
        onCancel={() => setConfirmExcluir(null)}
      />
    </div>
  )
}
