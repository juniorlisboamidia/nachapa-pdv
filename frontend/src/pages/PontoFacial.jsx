// Dep. Pessoal › Ponto Facial — controle de ponto da equipe.
// Alimenta a Presença da Bonificação. As batidas podem vir do coletor facial
// (casadas pelo CPF), de importação, ou de lançamento manual. Restrito ao ADMIN.
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatarWhats, mascararTelefone } from '../utils/telefone'

// ---- helpers ---------------------------------------------------------------
function iniciais(nome) {
  const ps = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '?'
  return (ps[0][0] + (ps.length > 1 ? ps[ps.length - 1][0] : '')).toUpperCase()
}
function mascararCPF(v) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
function fmtDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
// datetime-local prefill = agora, no fuso local
function agoraLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
function hojeISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const SITUACAO = {
  presente: { label: 'Presente', bg: '#dcfce7', fg: '#166534' },
  intervalo: { label: 'Em intervalo', bg: '#fef3c7', fg: '#92400e' },
  encerrado: { label: 'Encerrado', bg: '#dbeafe', fg: '#1e40af' },
  ausente: { label: 'Ausente', bg: '#f4f4f5', fg: '#52525b' }
}
const ORIGEM = {
  FACIAL: { label: 'Facial', bg: '#dbeafe', fg: '#1e40af' },
  PIN: { label: 'PIN', bg: '#f3e8ff', fg: '#6b21a8' },
  MANUAL: { label: 'Manual', bg: '#fef3c7', fg: '#92400e' }
}
const TIPOS = [
  { id: 'ENTRADA', label: 'Entrada' },
  { id: 'SAIDA_INTERVALO', label: 'Saída p/ intervalo' },
  { id: 'RETORNO_INTERVALO', label: 'Retorno do intervalo' },
  { id: 'SAIDA', label: 'Saída' }
]
const FUNCOES_SUGERIDAS = ['Cozinha', 'Atendimento', 'Caixa', 'Gerência', 'Chapa', 'Montagem']

function Pill({ meta }) {
  if (!meta) return <span>—</span>
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: meta.bg, color: meta.fg }}>
      {meta.label}
    </span>
  )
}

const TABS = [
  { id: 'painel', label: 'Painel' },
  { id: 'colaboradores', label: 'Colaboradores' },
  { id: 'marcacoes', label: 'Marcações' }
]

export default function PontoFacial() {
  const [tab, setTab] = useState('painel')
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ponto Facial</h1>
          <div className="page-header-sub">Controle de ponto da equipe — alimenta a Presença da Bonificação.</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="modal-tabs" style={{ margin: '10px 0 16px' }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={'av-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'painel' && <Painel />}
      {tab === 'colaboradores' && <Colaboradores notify={notify} />}
      {tab === 'marcacoes' && <Marcacoes notify={notify} />}
    </div>
  )
}

// ===================== PAINEL =====================
function Painel() {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    api.get('/ponto/painel')
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar o painel.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="loading-state">Carregando painel…</div>
  if (erro) return <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
  if (!dados) return null

  const cards = [
    { label: 'Presentes', valor: dados.presentes, meta: SITUACAO.presente },
    { label: 'Em intervalo', valor: dados.intervalo, meta: SITUACAO.intervalo },
    { label: 'Encerrados', valor: dados.encerrados, meta: SITUACAO.encerrado },
    { label: 'Ausentes', valor: dados.ausentes, meta: SITUACAO.ausente }
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {cards.map((c) => (
          <div key={c.label} className="table-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-soft, #737373)' }}>{c.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{c.valor}</span>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: c.meta.fg }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="page-header-sub" style={{ margin: 0 }}>Situação de hoje ({dados.total} colaboradores ativos)</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={carregar}>Atualizar</button>
      </div>

      {dados.colaboradores.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum colaborador ativo.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Situação</th>
                <th>Entrada</th>
                <th>Última marcação</th>
              </tr>
            </thead>
            <tbody>
              {dados.colaboradores.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                    {c.funcao ? <span style={{ color: 'var(--app-text-soft, #737373)' }}> · {c.funcao}</span> : null}
                  </td>
                  <td><Pill meta={SITUACAO[c.situacao]} /></td>
                  <td>{fmtHora(c.entrada)}</td>
                  <td>{fmtHora(c.ultimaMarcacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ===================== COLABORADORES =====================
const FORM_VAZIO = { nome: '', funcao: '', cpf: '', whatsapp: '', status: 'ATIVO' }
function Colaboradores({ notify }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')

  const [modal, setModal] = useState(null) // { id?, form }
  const [salvando, setSalvando] = useState(false)
  const [pinModal, setPinModal] = useState(null) // { id, nome, pin }
  const [salvandoPin, setSalvandoPin] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    api.get('/ponto/colaboradores')
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar os colaboradores.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const filtrada = lista.filter((f) => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return [f.nome, f.funcao, f.cpf, f.whatsapp].some((v) => String(v ?? '').toLowerCase().includes(q))
  })

  const abrirNovo = () => setModal({ id: null, form: { ...FORM_VAZIO } })
  const abrirEditar = (f) => setModal({ id: f.id, form: { nome: f.nome ?? '', funcao: f.funcao ?? '', cpf: mascararCPF(f.cpf ?? ''), whatsapp: f.whatsapp ?? '', status: f.status ?? 'ATIVO' } })
  const upd = (campo, valor) => setModal((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))

  async function salvar() {
    const f = modal.form
    if (!f.nome.trim()) return notify('Informe o nome.', 'error')
    setSalvando(true)
    try {
      if (modal.id) await api.put(`/funcionarios/${modal.id}`, f)
      else await api.post('/funcionarios', f)
      notify(modal.id ? 'Colaborador atualizado.' : 'Colaborador cadastrado.')
      setModal(null)
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarPin() {
    setSalvandoPin(true)
    try {
      await api.put(`/funcionarios/${pinModal.id}/pin`, { pin: pinModal.pin })
      notify(pinModal.pin ? 'PIN definido.' : 'PIN removido.')
      setPinModal(null)
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar o PIN.', 'error')
    } finally {
      setSalvandoPin(false)
    }
  }

  async function excluir() {
    const alvo = confirmExcluir
    if (!alvo) return
    setExcluindo(true)
    try {
      await api.delete(`/funcionarios/${alvo.id}`)
      setConfirmExcluir(null)
      notify('Colaborador excluído.')
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível excluir.', 'error')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Buscar por nome, função, CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320 }} />
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={abrirNovo}>Novo colaborador</button>
      </div>

      <div className="alert" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#1e40af' }}>
        O <strong>CPF</strong> é o identificador que casa cada batida do coletor com o colaborador. Mantenha-o preenchido.
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando colaboradores…</div>
      ) : filtrada.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum colaborador encontrado.</div>
      ) : (
        <div className="table-card">
          <table className="ent-tabela">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Função</th>
                <th>CPF</th>
                <th>PIN</th>
                <th>Última marcação</th>
                <th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((f) => (
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
                  <td>
                    {f.cpf ? mascararCPF(f.cpf) : <span style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>sem CPF</span>}
                  </td>
                  <td>
                    {f.temPin
                      ? <span className="badge badge-green">Definido</span>
                      : <span style={{ color: 'var(--app-text-soft, #737373)' }}>—</span>}
                  </td>
                  <td>{fmtDataHora(f.ultimaMarcacao)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditar(f)}>Editar</button>{' '}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPinModal({ id: f.id, nome: f.nome, pin: '' })}>PIN</button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(f)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal novo/editar */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modal.id ? 'Editar colaborador' : 'Novo colaborador'}</div>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={modal.form.nome} onChange={(e) => upd('nome', e.target.value)} autoFocus />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Função</label>
                <input className="form-input" list="pf-funcoes" value={modal.form.funcao} onChange={(e) => upd('funcao', e.target.value)} placeholder="Ex.: Cozinha" />
                <datalist id="pf-funcoes">{FUNCOES_SUGERIDAS.map((f) => <option key={f} value={f} />)}</datalist>
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

      {/* Modal PIN */}
      {pinModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-title">PIN de reserva — {pinModal.nome}</div>
            <div className="page-header-sub" style={{ marginTop: -6, marginBottom: 12 }}>
              Usado para bater o ponto quando o rosto não é reconhecido. 4 a 8 dígitos. Deixe em branco para remover.
            </div>
            <div className="form-group">
              <label className="form-label">PIN</label>
              <input className="form-input" value={pinModal.pin} onChange={(e) => setPinModal((m) => ({ ...m, pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))} placeholder="Ex.: 1234" inputMode="numeric" autoFocus />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPinModal(null)} disabled={salvandoPin}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarPin} disabled={salvandoPin}>{salvandoPin ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir colaborador"
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

// ===================== MARCAÇÕES =====================
function Marcacoes({ notify }) {
  const [lista, setLista] = useState([])
  const [colabs, setColabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [data, setData] = useState(hojeISO())
  const [funcId, setFuncId] = useState('')

  const [modal, setModal] = useState(null) // { funcionarioId, tipo, dataHora }
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    api.get('/ponto/marcacoes', { params: { data: data || undefined, funcionarioId: funcId || undefined } })
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar as marcações.'))
      .finally(() => setLoading(false))
  }, [data, funcId])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { api.get('/ponto/colaboradores').then((r) => setColabs(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }, [])

  const abrirManual = () => setModal({ funcionarioId: '', tipo: 'ENTRADA', dataHora: agoraLocal() })

  async function salvarManual() {
    if (!modal.funcionarioId) return notify('Selecione o colaborador.', 'error')
    setSalvando(true)
    try {
      await api.post('/ponto/marcacoes', { funcionarioId: Number(modal.funcionarioId), tipo: modal.tipo, dataHora: modal.dataHora })
      notify('Marcação lançada.')
      setModal(null)
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível lançar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Data</label>
          <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} style={{ maxWidth: 170 }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Colaborador</label>
          <select className="form-input" value={funcId} onChange={(e) => setFuncId(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Todos</option>
            {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        {data && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setData('')}>Limpar data</button>}
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={abrirManual}>Lançar manual</button>
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando marcações…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhuma marcação no período.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Marcação</th>
                <th>Data / Hora</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.funcionarioNome}</strong></td>
                  <td>{r.tipoLabel}</td>
                  <td>{fmtDataHora(r.dataHora)}</td>
                  <td><Pill meta={ORIGEM[r.origem]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal lançamento manual */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title">Lançar marcação manual</div>
            <div className="form-group">
              <label className="form-label">Colaborador</label>
              <select className="form-input" value={modal.funcionarioId} onChange={(e) => setModal((m) => ({ ...m, funcionarioId: e.target.value }))} autoFocus>
                <option value="">Selecione…</option>
                {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={modal.tipo} onChange={(e) => setModal((m) => ({ ...m, tipo: e.target.value }))}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data e hora</label>
                <input type="datetime-local" className="form-input" value={modal.dataHora} onChange={(e) => setModal((m) => ({ ...m, dataHora: e.target.value }))} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarManual} disabled={salvando}>{salvando ? 'Lançando…' : 'Lançar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
