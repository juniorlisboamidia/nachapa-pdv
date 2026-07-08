import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}

const CATEGORIAS = [
  { value: 'TAXA_CARTAO',  label: 'Taxa de Cartão' },
  { value: 'MARKETPLACE',  label: 'Marketplace' },
  { value: 'EMBALAGEM',    label: 'Embalagem' },
  { value: 'ENTREGA',      label: 'Entrega' },
  { value: 'IMPOSTO',      label: 'Imposto' },
  { value: 'CUPOM',        label: 'Cupom' },
  { value: 'COMISSAO',     label: 'Comissão' },
  { value: 'OUTROS',       label: 'Outros' }
]
const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]))

const TIPOS = [
  { value: 'PERCENTUAL_FATURAMENTO',     label: '% do faturamento' },
  { value: 'VALOR_POR_PEDIDO',           label: 'Valor por pedido' },
  { value: 'VALOR_FIXO_MENSAL_VARIAVEL', label: 'Valor fixo mensal' }
]
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]))

function formatValor(valor, tipoCalculo) {
  const v = Number(valor)
  if (!Number.isFinite(v)) return '—'
  if (tipoCalculo === 'PERCENTUAL_FATURAMENTO') return pct(v)
  if (tipoCalculo === 'VALOR_POR_PEDIDO') return `${brl(v)} / pedido`
  if (tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL') return `${brl(v)} / mês`
  return brl(v)
}

const FORM_BLANK = { nome: '', categoria: '', tipoCalculo: '', valor: '' }

function validateForm({ nome, categoria, tipoCalculo, valor }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  if (!categoria || !CATEGORIA_LABEL[categoria]) return 'categoria é obrigatória'
  if (!tipoCalculo || !TIPO_LABEL[tipoCalculo]) return 'tipo de cálculo é obrigatório'
  const v = Number(valor)
  if (valor === '' || !Number.isFinite(v)) return 'valor é obrigatório e deve ser numérico'
  if (v < 0) return 'valor deve ser maior ou igual a zero'
  return null
}

function payloadFromForm(form) {
  return {
    nome: form.nome.trim(),
    categoria: form.categoria,
    tipoCalculo: form.tipoCalculo,
    valor: Number(form.valor)
  }
}

const fieldStyle = { marginBottom: 0 }
const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

export default function CustosVariaveis() {
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
      .get('/custos-variaveis')
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
      .post('/custos-variaveis', payloadFromForm(newForm))
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
      categoria: c.categoria,
      tipoCalculo: c.tipoCalculo,
      valor: String(Number(c.valor))
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
      .put(`/custos-variaveis/${editingId}`, payloadFromForm(editForm))
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
      .delete(`/custos-variaveis/${c.id}`)
      .then(() => {
        setToast({ message: `Custo variável "${c.nome}" excluído com sucesso.`, type: 'success' })
        return load()
      })
      .catch((e) =>
        setToast({ message: e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir custo variável.', type: 'error' })
      )
      .finally(() => {
        setExcluindo(false)
        setCustoParaExcluir(null)
      })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return custos
    return custos.filter((c) => {
      const cat = (CATEGORIA_LABEL[c.categoria] ?? c.categoria).toLowerCase()
      const tipo = (TIPO_LABEL[c.tipoCalculo] ?? c.tipoCalculo).toLowerCase()
      return (
        c.nome.toLowerCase().includes(q) ||
        cat.includes(q) ||
        tipo.includes(q) ||
        c.categoria.toLowerCase().includes(q) ||
        c.tipoCalculo.toLowerCase().includes(q)
      )
    })
  }, [custos, search])

  const total = custos.length
  const totalPercentual = custos
    .filter((c) => c.tipoCalculo === 'PERCENTUAL_FATURAMENTO')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalPorPedido = custos
    .filter((c) => c.tipoCalculo === 'VALOR_POR_PEDIDO')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalFixoMensal = custos
    .filter((c) => c.tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL')
    .reduce((s, c) => s + Number(c.valor), 0)
  const maior =
    total === 0
      ? null
      : custos.reduce(
          (m, c) => (Number(c.valor) > Number(m.valor) ? c : m),
          custos[0]
        )

  if (loading) return <div className="loading-state">Carregando custos variáveis…</div>
  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os custos variáveis</div>
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
      <div className="grid-5">
        <Card title="Total Ativos" value={total} hint="Custos cadastrados" variant="info" />
        <Card title="% do Faturamento" value={pct(totalPercentual)} hint="Soma dos percentuais" variant="brand" />
        <Card title="Por Pedido" value={brl(totalPorPedido)} hint="Soma por pedido" variant="info" />
        <Card title="Fixo Mensal" value={brl(totalFixoMensal)} hint="Soma mensal" />
        <Card
          title="Maior Custo Variável"
          value={maior ? formatValor(maior.valor, maior.tipoCalculo) : '—'}
          hint={maior ? maior.nome : 'Sem dados'}
          variant="danger"
        />
      </div>

      <div className="section-title">Novo Custo Variável</div>
      <div className="card">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ ...fieldStyle, flex: 2, minWidth: 180 }}>
              <label className="form-label">Nome</label>
              <input className="form-input" type="text"
                value={newForm.nome}
                onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })}
                placeholder="Ex.: Taxa de cartão crédito" />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1.3, minWidth: 150 }}>
              <label className="form-label">Categoria</label>
              <select className="form-input"
                value={newForm.categoria}
                onChange={(e) => setNewForm({ ...newForm, categoria: e.target.value })}>
                <option value="">— selecione —</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1.5, minWidth: 160 }}>
              <label className="form-label">Tipo de cálculo</label>
              <select className="form-input"
                value={newForm.tipoCalculo}
                onChange={(e) => setNewForm({ ...newForm, tipoCalculo: e.target.value })}>
                <option value="">— selecione —</option>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 110 }}>
              <label className="form-label">
                Valor {newForm.tipoCalculo === 'PERCENTUAL_FATURAMENTO' ? '(%)' : '(R$)'}
              </label>
              <input className="form-input" type="number" min="0" step="0.0001"
                value={newForm.valor}
                onChange={(e) => setNewForm({ ...newForm, valor: e.target.value })}
                placeholder="0,00" />
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
          placeholder="Buscar custo variável... (nome, categoria ou tipo)"
          style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
          {search.trim() === ''
            ? `${total} custo${total === 1 ? '' : 's'}`
            : `${filtered.length} de ${total}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          Nenhum custo variável cadastrado. Use o formulário acima para cadastrar o primeiro item.
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
                <th>Categoria</th>
                <th>Tipo de cálculo</th>
                <th>Valor</th>
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
                        <select className="form-input" style={cellInputStyle}
                          value={editForm.categoria}
                          onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}>
                          <option value="">—</option>
                          {CATEGORIAS.map((cat) => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="form-input" style={cellInputStyle}
                          value={editForm.tipoCalculo}
                          onChange={(e) => setEditForm({ ...editForm, tipoCalculo: e.target.value })}>
                          <option value="">—</option>
                          {TIPOS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="form-input" style={cellInputStyle}
                          type="number" min="0" step="0.0001"
                          value={editForm.valor}
                          onChange={(e) => setEditForm({ ...editForm, valor: e.target.value })} />
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
                    <td>
                      <span className="badge badge-blue">
                        {CATEGORIA_LABEL[c.categoria] ?? c.categoria}
                      </span>
                    </td>
                    <td>{TIPO_LABEL[c.tipoCalculo] ?? c.tipoCalculo}</td>
                    <td style={{ fontWeight: 500 }}>{formatValor(c.valor, c.tipoCalculo)}</td>
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
        title="Excluir custo variável?"
        message={custoParaExcluir ? `Você está prestes a excluir “${custoParaExcluir.nome}”.` : ''}
        description="Este custo não entrará mais nos cálculos do dashboard, mas o histórico será preservado."
        confirmLabel="Excluir custo variável"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmExcluir}
        onCancel={() => setCustoParaExcluir(null)}
      />
    </div>
  )
}
