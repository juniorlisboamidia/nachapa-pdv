// Dep. Pessoal › Equipe — cadastro da equipe interna (cozinha/atendimento).
// Base para o sistema de Bonificação. Restrito ao ADMIN (gate no backend + rota).
import { useEffect, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatarWhats, mascararTelefone } from '../utils/telefone'

function iniciais(nome) {
  const ps = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '?'
  return (ps[0][0] + (ps.length > 1 ? ps[ps.length - 1][0] : '')).toUpperCase()
}
// Máscara de CPF: 000.000.000-00
function mascararCPF(v) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
const STATUS = {
  ATIVO: { label: 'Ativo', cls: 'badge-green' },
  INATIVO: { label: 'Inativo', cls: 'badge-gray' }
}
const FUNCOES_SUGERIDAS = ['Cozinha', 'Atendimento', 'Caixa', 'Gerência', 'Chapa', 'Montagem']
const FORM_VAZIO = { nome: '', funcao: '', cpf: '', whatsapp: '', status: 'ATIVO' }

export default function Equipe() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')

  const [modal, setModal] = useState(null) // { id?, form }
  const [salvando, setSalvando] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)

  function carregar() {
    setLoading(true)
    setErro(null)
    api
      .get('/funcionarios', { params: { busca: busca || undefined, status: statusFiltro || undefined } })
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((err) => setErro(err?.response?.data?.error ?? 'Não foi possível carregar a equipe.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    const t = setTimeout(carregar, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, statusFiltro])

  const abrirNovo = () => setModal({ id: null, form: { ...FORM_VAZIO } })
  const abrirEditar = (f) => setModal({ id: f.id, form: { nome: f.nome ?? '', funcao: f.funcao ?? '', cpf: mascararCPF(f.cpf ?? ''), whatsapp: f.whatsapp ?? '', status: f.status ?? 'ATIVO' } })
  const upd = (campo, valor) => setModal((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))

  async function salvar() {
    const f = modal.form
    if (!f.nome.trim()) return setToast({ message: 'Informe o nome.', type: 'error' })
    setSalvando(true)
    try {
      if (modal.id) {
        await api.put(`/funcionarios/${modal.id}`, f)
        setToast({ message: 'Funcionário atualizado.', type: 'success' })
      } else {
        await api.post('/funcionarios', f)
        setToast({ message: 'Funcionário cadastrado.', type: 'success' })
      }
      setModal(null)
      carregar()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    const alvo = confirmExcluir
    if (!alvo) return
    setExcluindo(true)
    try {
      await api.delete(`/funcionarios/${alvo.id}`)
      setConfirmExcluir(null)
      setToast({ message: 'Funcionário excluído.', type: 'success' })
      carregar()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível excluir.', type: 'error' })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Equipe</h1>
          <div className="page-header-sub">Cadastro da equipe interna (cozinha, atendimento). Base para a bonificação.</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNovo}>Novo funcionário</button>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="ent-filtros">
        <input
          className="form-input"
          placeholder="Buscar por nome, função, CPF ou WhatsApp…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ maxWidth: 340 }}
        />
        <div className="ic-filtros" style={{ marginBottom: 0 }}>
          {[
            { id: '', label: 'Todos' },
            { id: 'ATIVO', label: 'Ativos' },
            { id: 'INATIVO', label: 'Inativos' }
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={'ic-filtro' + (statusFiltro === f.id ? ' active' : '')}
              onClick={() => setStatusFiltro(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando equipe…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum funcionário cadastrado ainda.</div>
      ) : (
        <div className="table-card">
          <table className="ent-tabela">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Função</th>
                <th>CPF</th>
                <th>Status</th>
                <th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const st = STATUS[f.status] ?? { label: f.status, cls: 'badge-gray' }
                return (
                  <tr key={f.id} className="ent-row-click" onClick={() => abrirEditar(f)}>
                    <td>
                      <div className="ent-row-id">
                        <span className="ent-av">{iniciais(f.nome)}</span>
                        <div className="ent-row-id-txt">
                          <span className="ent-row-nome">{f.nome}</span>
                          <span className="ent-row-whats">{f.whatsapp ? formatarWhats(f.whatsapp) : '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>{f.funcao || '—'}</td>
                    <td>{mascararCPF(f.cpf) || '—'}</td>
                    <td><span className={'badge ' + st.cls}>{st.label}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditar(f)}>Editar</button>{' '}
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(f)}>Excluir</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modal.id ? 'Editar funcionário' : 'Novo funcionário'}</div>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={modal.form.nome} onChange={(e) => upd('nome', e.target.value)} autoFocus />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Função</label>
                <input className="form-input" list="equipe-funcoes" value={modal.form.funcao} onChange={(e) => upd('funcao', e.target.value)} placeholder="Ex.: Cozinha" />
                <datalist id="equipe-funcoes">
                  {FUNCOES_SUGERIDAS.map((f) => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">CPF</label>
                <input className="form-input" value={modal.form.cpf} onChange={(e) => upd('cpf', mascararCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="form-input" value={mascararTelefone(modal.form.whatsapp)} onChange={(e) => upd('whatsapp', mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={modal.form.status} onChange={(e) => upd('status', e.target.value)}>
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir funcionário"
        message={confirmExcluir ? `Excluir ${confirmExcluir.nome}?` : ''}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={excluir}
        onCancel={() => setConfirmExcluir(null)}
      />
    </div>
  )
}
