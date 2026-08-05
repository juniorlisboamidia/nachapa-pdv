import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// Frases motivacionais do banner de boas-vindas (Início). Só o dono (ADMIN) cadastra.
export default function Frases() {
  const [lista, setLista] = useState([])
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState(null)
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  function carregar() {
    api.get('/frases').then((r) => setLista(r.data.frases || [])).catch(() => notify('Erro ao carregar.', 'error'))
  }
  useEffect(() => { carregar() }, [])

  async function adicionar() {
    const t = texto.trim()
    if (!t) return notify('Escreva a frase.', 'error')
    setSalvando(true)
    try {
      await api.post('/frases', { texto: t })
      setTexto(''); carregar(); notify('Frase adicionada.')
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') } finally { setSalvando(false) }
  }
  async function toggleAtiva(f) {
    try { await api.put(`/frases/${f.id}`, { ativa: !f.ativa }); carregar() }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao atualizar.', 'error') }
  }
  async function confirmarExcluir() {
    try { await api.delete(`/frases/${excluir.id}`); setExcluir(null); carregar(); notify('Frase removida.') }
    catch (e) { notify(e?.response?.data?.error ?? 'Erro ao excluir.', 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Frases motivacionais</h1>
          <div className="page-header-sub">Aparecem no banner de boas-vindas do Início, sorteadas a cada acesso.</div>
        </div>
      </div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <textarea
          className="form-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva uma frase de incentivo…"
          rows={2}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button type="button" className="btn btn-primary" onClick={adicionar} disabled={salvando || !texto.trim()}>
          {salvando ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>

      {lista.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--app-text-3)', fontSize: 13.5 }}>
          Nenhuma frase cadastrada. Enquanto isso, o banner mostra frases padrão.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--app-border)', borderRadius: 12, background: 'var(--app-surface)', opacity: f.ativa ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--app-text)', fontStyle: 'italic', lineHeight: 1.5 }}>“{f.texto}”</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--app-text-2)', cursor: 'pointer', flexShrink: 0 }}>
                <input type="checkbox" checked={f.ativa} onChange={() => toggleAtiva(f)} /> Ativa
              </label>
              <button type="button" onClick={() => setExcluir(f)} title="Excluir" style={{ background: 'none', border: 'none', color: 'var(--app-text-3)', cursor: 'pointer', padding: 4, flexShrink: 0, display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!excluir}
        title="Excluir frase"
        message="Remover esta frase do banner?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={confirmarExcluir}
        onCancel={() => setExcluir(null)}
      />
    </div>
  )
}
