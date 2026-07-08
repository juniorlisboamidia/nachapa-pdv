import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import InputMoeda from '../components/InputMoeda'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}

const FORM_BLANK = { nome: '', valorMensal: '', tipo: '', observacao: '' }

function validateForm({ nome, valorMensal }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  const v = Number(valorMensal)
  if (valorMensal === '' || !Number.isFinite(v)) {
    return 'valor mensal é obrigatório e deve ser numérico'
  }
  if (v < 0) return 'valor mensal deve ser maior ou igual a zero'
  return null
}

function payloadFromForm(form) {
  return {
    nome: form.nome.trim(),
    valorMensal: Number(form.valorMensal),
    tipo: form.tipo.trim() === '' ? null : form.tipo.trim(),
    observacao: form.observacao.trim() === '' ? null : form.observacao.trim()
  }
}

const fieldStyle = { marginBottom: 0 }
const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

export default function CustosFixos() {
  const [custos, setCustos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const [newForm, setNewForm] = useState(FORM_BLANK)
  const [newError, setNewError] = useState(null)
  const [newSubmitting, setNewSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(FORM_BLANK)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [toast, setToast] = useState(null)
  const [custoParaExcluir, setCustoParaExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/custos-fixos')
      .then((r) => { setCustos(r.data); setLoading(false) })
      .catch((err) => {
        setError(
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro inesperado.')
        )
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  function handleCreate(e) {
    e.preventDefault()
    const err = validateForm(newForm)
    if (err) { setNewError(err); return }
    setNewError(null)
    setNewSubmitting(true)
    api
      .post('/custos-fixos', payloadFromForm(newForm))
      .then(() => {
        setNewForm(FORM_BLANK)
        return load()
      })
      .catch((e) =>
        setNewError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setNewSubmitting(false))
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditForm({
      nome: c.nome,
      valorMensal: String(Number(c.valorMensal)),
      tipo: c.tipo ?? '',
      observacao: c.observacao ?? ''
    })
    setEditError(null)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditForm(FORM_BLANK)
    setEditError(null)
  }
  function saveEdit() {
    const err = validateForm(editForm)
    if (err) { setEditError(err); return }
    setEditError(null)
    setEditSubmitting(true)
    api
      .put(`/custos-fixos/${editingId}`, payloadFromForm(editForm))
      .then(() => {
        cancelEdit()
        return load()
      })
      .catch((e) =>
        setEditError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDelete(c) {
    setCustoParaExcluir(c)
  }

  function confirmExcluir() {
    const c = custoParaExcluir
    if (!c) return
    setExcluindo(true)
    api
      .delete(`/custos-fixos/${c.id}`)
      .then(() => {
        setToast({ message: `Custo fixo "${c.nome}" excluído com sucesso.`, type: 'success' })
        return load()
      })
      .catch((e) =>
        setToast({ message: e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir custo fixo.', type: 'error' })
      )
      .finally(() => {
        setExcluindo(false)
        setCustoParaExcluir(null)
      })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return custos
    return custos.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.tipo && c.tipo.toLowerCase().includes(q)) ||
        (c.observacao && c.observacao.toLowerCase().includes(q))
    )
  }, [custos, search])

  const total = custos.length
  const valorTotalMensal = custos.reduce((s, c) => s + Number(c.valorMensal), 0)
  const custoMedio = total === 0 ? 0 : valorTotalMensal / total
  const maiorCusto =
    total === 0
      ? null
      : custos.reduce(
          (m, c) => (Number(c.valorMensal) > Number(m.valorMensal) ? c : m),
          custos[0]
        )

  if (loading) return <div className="loading-state">Carregando custos fixos…</div>
  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os custos fixos</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={load}>Tentar novamente</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card title="Total Ativos" value={total} hint="Custos cadastrados" variant="info" />
        <Card title="Valor Total Mensal" value={brl(valorTotalMensal)} hint="Soma do mês" variant="brand" />
        <Card
          title="Maior Custo Fixo"
          value={maiorCusto ? brl(maiorCusto.valorMensal) : '—'}
          hint={maiorCusto ? maiorCusto.nome : 'Sem dados'}
          variant="danger"
        />
        <Card title="Custo Médio" value={brl(custoMedio)} hint="Média mensal por item" />
      </div>

      <div className="section-title">Novo Custo Fixo</div>
      <div className="card">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ ...fieldStyle, flex: 2, minWidth: 180 }}>
              <label className="form-label">Nome</label>
              <input className="form-input" type="text"
                value={newForm.nome}
                onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })}
                placeholder="Ex.: Aluguel" />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1.2, minWidth: 130 }}>
              <label className="form-label">Valor mensal</label>
              <InputMoeda className="form-input"
                valor={newForm.valorMensal}
                onChange={(v) => setNewForm({ ...newForm, valorMensal: v })}
                placeholder="0,00" />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 130 }}>
              <label className="form-label">Tipo (opcional)</label>
              <input className="form-input" type="text"
                value={newForm.tipo}
                onChange={(e) => setNewForm({ ...newForm, tipo: e.target.value })}
                placeholder="INFRAESTRUTURA" />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1.5, minWidth: 150 }}>
              <label className="form-label">Observação (opcional)</label>
              <input className="form-input" type="text"
                value={newForm.observacao}
                onChange={(e) => setNewForm({ ...newForm, observacao: e.target.value })}
                placeholder="Loja matriz, contrato 12 meses..." />
            </div>
            <button type="submit" className="btn btn-primary" disabled={newSubmitting}>
              {newSubmitting ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>
          {newError && (
            <div className="alert alert-red" style={{ marginTop: 12 }}>
              <div className="alert-msg clr-red">{newError}</div>
            </div>
          )}
        </form>
      </div>

      <div className="section-title">Custos Cadastrados</div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input className="form-input" type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar custo fixo... (nome, tipo ou observação)"
          style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
          {search.trim() === ''
            ? `${total} custo${total === 1 ? '' : 's'}`
            : `${filtered.length} de ${total}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          Nenhum custo fixo cadastrado. Use o formulário acima para cadastrar o primeiro item.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          Nenhum custo encontrado para "{search}". Ajuste a busca ou limpe o campo.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Valor mensal</th>
                <th>Tipo</th>
                <th>Observação</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isEditing = editingId === c.id
                if (isEditing) {
                  return (
                    <tr key={c.id} style={{ background: 'var(--app-highlight)' }}>
                      <td>
                        <input className="form-input" style={cellInputStyle}
                          value={editForm.nome}
                          onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                          autoFocus />
                      </td>
                      <td>
                        <InputMoeda className="form-input" style={cellInputStyle}
                          valor={editForm.valorMensal}
                          onChange={(v) => setEditForm({ ...editForm, valorMensal: v })} />
                      </td>
                      <td>
                        <input className="form-input" style={cellInputStyle}
                          value={editForm.tipo}
                          onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                          placeholder="(opcional)" />
                      </td>
                      <td>
                        <input className="form-input" style={cellInputStyle}
                          value={editForm.observacao}
                          onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })}
                          placeholder="(opcional)" />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={editSubmitting}>
                            {editSubmitting ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={editSubmitting}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{c.nome}</td>
                    <td>{brl(c.valorMensal)}</td>
                    <td>
                      {c.tipo ? (
                        <span className="badge badge-blue">{c.tipo}</span>
                      ) : (
                        <span className="clr-muted">—</span>
                      )}
                    </td>
                    <td className={c.observacao ? '' : 'clr-muted'}>
                      {c.observacao || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => startEdit(c)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => handleDelete(c)}>
                          Desativar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editError}</div>
        </div>
      )}

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <ConfirmDialog
        open={custoParaExcluir !== null}
        title="Excluir custo fixo?"
        message={custoParaExcluir ? `Você está prestes a excluir “${custoParaExcluir.nome}”.` : ''}
        description="Este custo não entrará mais nos cálculos mensais, mas o histórico será preservado."
        confirmLabel="Excluir custo fixo"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmExcluir}
        onCancel={() => setCustoParaExcluir(null)}
      />
    </div>
  )
}
