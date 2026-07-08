import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}
function num(value) {
  if (value === null || value === undefined) return '—'
  return numberFormatter.format(Number(value))
}

const STATUS_VARIANT = {
  SAUDAVEL:  'success',
  ATENCAO:   'warn',
  ALERTA:    'brand',
  CRITICO:   'danger',
  SEM_FICHA: 'info',
  SEM_PRECO: 'info'
}
const STATUS_BADGE = {
  SAUDAVEL:  'badge-green',
  ATENCAO:   'badge-yellow',
  ALERTA:    'badge-orange',
  CRITICO:   'badge-red',
  SEM_FICHA: 'badge-blue',
  SEM_PRECO: 'badge-gray'
}
const STATUS_ALERT = {
  SAUDAVEL:  'alert-green',
  ATENCAO:   'alert-yellow',
  ALERTA:    'alert-yellow',
  CRITICO:   'alert-red',
  SEM_FICHA: 'alert-gray',
  SEM_PRECO: 'alert-gray'
}
const STATUS_LABEL = {
  SAUDAVEL:  'Saudável',
  ATENCAO:   'Atenção',
  ALERTA:    'Alerta',
  CRITICO:   'Crítico',
  SEM_FICHA: 'Sem ficha',
  SEM_PRECO: 'Sem preço'
}

const fieldStyle = { marginBottom: 0 }
const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

export default function FichaTecnica() {
  const { produtoId } = useParams()
  if (!produtoId) return <SelecionarProduto />
  return <FichaProdutoEditor produtoId={Number(produtoId)} />
}

// ============ Seleção de produto ============

function SelecionarProduto() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get('/produtos')
      .then((r) => { setProdutos(r.data); setLoading(false) })
      .catch((err) => {
        setError(err?.response?.data?.error ?? err?.message ?? 'Erro inesperado')
        setLoading(false)
      })
  }, [])

  function handleGo(e) {
    e.preventDefault()
    if (!selected) return
    navigate(`/ficha-tecnica/${selected}`)
  }

  if (loading) return <div className="loading-state">Carregando produtos…</div>
  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar a lista de produtos</div>
          <div className="alert-msg">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-title">Selecionar Produto</div>
      <div className="card">
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--app-text-2)' }}>
          Escolha um produto para editar a composição da ficha técnica.
        </div>
        <form onSubmit={handleGo}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ ...fieldStyle, flex: 1 }}>
              <label className="form-label">Produto</label>
              <select
                className="form-input"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">— selecione —</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({brl(p.precoVenda)})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!selected}>
              Abrir ficha
            </button>
          </div>
        </form>
        {produtos.length === 0 && (
          <div className="alert alert-yellow" style={{ marginTop: 12 }}>
            <div className="alert-msg clr-yellow">Nenhum produto ativo cadastrado.</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ Editor da ficha ============

function FichaProdutoEditor({ produtoId }) {
  const navigate = useNavigate()

  const [produto, setProduto] = useState(null)
  const [analise, setAnalise] = useState(null)
  const [itens, setItens] = useState([])
  const [insumos, setInsumos] = useState([])
  const [custoTotal, setCustoTotal] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [formInsumoId, setFormInsumoId] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formError, setFormError] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editingQty, setEditingQty] = useState('')
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [toast, setToast] = useState(null)
  const [itemParaRemover, setItemParaRemover] = useState(null)
  const [removendo, setRemovendo] = useState(false)

  function loadAll() {
    setLoading(true)
    setError(null)
    Promise.all([
      api.get(`/produtos/${produtoId}/ficha-tecnica`),
      api.get(`/produtos/${produtoId}/analise`),
      api.get('/insumos')
    ])
      .then(([fichaRes, analiseRes, insumosRes]) => {
        setProduto(fichaRes.data.produto)
        setItens(fichaRes.data.itens)
        setCustoTotal(fichaRes.data.custoTotalFicha)
        setAnalise(analiseRes.data)
        setInsumos(insumosRes.data)
        setLoading(false)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 404) {
          setError('Produto não encontrado ou inativo.')
        } else {
          setError(err?.response?.data?.error ?? err?.message ?? 'Erro inesperado.')
        }
        setLoading(false)
      })
  }

  function reload() {
    return Promise.all([
      api.get(`/produtos/${produtoId}/ficha-tecnica`),
      api.get(`/produtos/${produtoId}/analise`)
    ]).then(([fichaRes, analiseRes]) => {
      setProduto(fichaRes.data.produto)
      setItens(fichaRes.data.itens)
      setCustoTotal(fichaRes.data.custoTotalFicha)
      setAnalise(analiseRes.data)
    })
  }

  useEffect(() => { loadAll() }, [produtoId])

  function handleAdd(e) {
    e.preventDefault()
    setFormError(null)
    if (!formInsumoId) {
      setFormError('Selecione um insumo.')
      return
    }
    const q = Number(formQty)
    if (!Number.isFinite(q) || q <= 0) {
      setFormError('Quantidade deve ser maior que zero.')
      return
    }
    setFormSubmitting(true)
    api
      .post(`/produtos/${produtoId}/ficha-tecnica/itens`, {
        insumoId: Number(formInsumoId),
        quantidade: q
      })
      .then(() => {
        setFormInsumoId('')
        setFormQty('')
        return reload()
      })
      .catch((err) => {
        setFormError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar item.')
      })
      .finally(() => setFormSubmitting(false))
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditingQty(String(Number(item.quantidade)))
    setEditError(null)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditingQty('')
    setEditError(null)
  }
  function saveEdit() {
    setEditError(null)
    const q = Number(editingQty)
    if (!Number.isFinite(q) || q <= 0) {
      setEditError('Quantidade deve ser maior que zero.')
      return
    }
    setEditSubmitting(true)
    api
      .put(`/ficha-tecnica/itens/${editingId}`, { quantidade: q })
      .then(() => {
        cancelEdit()
        return reload()
      })
      .catch((err) =>
        setEditError(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDelete(item) {
    setItemParaRemover(item)
  }

  function confirmRemover() {
    const item = itemParaRemover
    if (!item) return
    setRemovendo(true)
    api
      .delete(`/ficha-tecnica/itens/${item.id}`)
      .then(() => {
        setToast({ message: `"${item.insumo.nome}" removido da ficha técnica.`, type: 'success' })
        return reload()
      })
      .catch((err) =>
        setToast({ message: err?.response?.data?.error ?? err?.message ?? 'Erro ao remover item.', type: 'error' })
      )
      .finally(() => {
        setRemovendo(false)
        setItemParaRemover(null)
      })
  }

  if (loading) return <div className="loading-state">Carregando ficha técnica…</div>

  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar a ficha técnica</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={loadAll}>Tentar novamente</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/ficha-tecnica')}>
              Trocar produto
            </button>
          </div>
        </div>
      </div>
    )
  }

  const status = analise.statusCmv
  const variant = STATUS_VARIANT[status] ?? 'info'
  const semFicha = status === 'SEM_FICHA'

  const mensagemSemFicha =
    'Produto sem ficha técnica cadastrada. Adicione os insumos abaixo para calcular CMV e margem real.'

  return (
    <div>
      {/* Cabeçalho do produto */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--app-text)' }}>
            {produto.nome}
          </div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            Preço de venda: {brl(produto.precoVenda)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={'badge ' + (STATUS_BADGE[status] ?? 'badge-gray')}>
            {STATUS_LABEL[status] ?? status}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/ficha-tecnica')}
          >
            Trocar produto
          </button>
        </div>
      </div>

      {/* Análise */}
      <div className="section-title">Análise do Produto</div>
      <div className="grid-4">
        <Card title="Preço de Venda" value={brl(produto.precoVenda)} hint="Cadastrado no produto" variant="brand" />
        <Card
          title="Custo Total Real"
          value={brl(custoTotal)}
          hint={semFicha ? 'Sem itens' : 'Produto + embutido'}
        />
        <Card
          title="CMV do Produto"
          value={pct(analise.cmvProdutoPercentual ?? analise.cmvPercentual)}
          hint={semFicha ? 'Adicione insumos' : 'Custo do produto / preço'}
          variant={variant}
        />
        <Card
          title="Margem Bruta"
          value={pct(analise.margemBrutaPercentual)}
          hint={analise.lucroBruto === null ? 'Indisponível' : `Lucro: ${brl(analise.lucroBruto)}`}
          variant={analise.margemBrutaPercentual !== null && analise.margemBrutaPercentual > 0 ? 'success' : 'info'}
        />
      </div>

      <div
        className={'alert ' + (STATUS_ALERT[status] ?? 'alert-gray')}
        style={{ marginTop: 12 }}
      >
        <div>
          <div className="alert-title">
            <span className={'badge ' + (STATUS_BADGE[status] ?? 'badge-gray')}>
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
          <div className="alert-msg" style={{ marginTop: 6 }}>
            {semFicha ? mensagemSemFicha : analise.mensagemDiagnostico}
          </div>
        </div>
      </div>

      {/* Adicionar Insumo */}
      <div className="section-title">Adicionar Insumo</div>
      <div className="card">
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ ...fieldStyle, flex: 2, minWidth: 220 }}>
              <label className="form-label">Insumo</label>
              <select
                className="form-input"
                value={formInsumoId}
                onChange={(e) => setFormInsumoId(e.target.value)}
              >
                <option value="">— selecione —</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} ({brl(i.custoUnitario)} / {i.unidade})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 130 }}>
              <label className="form-label">Quantidade</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.0001"
                value={formQty}
                onChange={(e) => setFormQty(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 100 }}>
              <label className="form-label">Unidade</label>
              <div
                className="form-input"
                style={{ background: 'var(--app-surface-2)', color: '#888', display: 'flex', alignItems: 'center' }}
              >
                {(() => {
                  const i = insumos.find((x) => String(x.id) === formInsumoId)
                  return i ? i.unidade : '—'
                })()}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
              {formSubmitting ? 'Adicionando…' : 'Adicionar à ficha'}
            </button>
          </div>
          {formError && (
            <div className="alert alert-red" style={{ marginTop: 12 }}>
              <div className="alert-msg clr-red">{formError}</div>
            </div>
          )}
          {insumos.length === 0 && (
            <div className="alert alert-yellow" style={{ marginTop: 12 }}>
              <div className="alert-msg clr-yellow">
                Nenhum insumo ativo cadastrado. Cadastre insumos antes de montar a ficha.
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Itens da Ficha */}
      <div className="section-title">Itens da Ficha</div>

      {itens.length === 0 ? (
        <div className="empty-state">
          Ficha técnica vazia. Adicione o primeiro insumo no formulário acima — assim que houver pelo menos um item, o CMV e a margem serão recalculados.
        </div>
      ) : (
        <>
          <div className="table-card">
            <table className="hb-table">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Quantidade</th>
                  <th>Custo unitário</th>
                  <th>Custo do item</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const isEditing = editingId === item.id
                  const custoUnit = Number(item.insumo.custoUnitario)
                  const qty = isEditing ? Number(editingQty) : Number(item.quantidade)
                  const custoItemAtual = qty > 0 ? qty * custoUnit : 0

                  return (
                    <tr key={item.id} style={isEditing ? { background: 'var(--app-highlight)' } : undefined}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--app-text)' }}>{item.insumo.nome}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {brl(custoUnit)} / {item.insumo.unidade}
                        </div>
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="form-input"
                            style={{ ...cellInputStyle, width: 110 }}
                            type="number"
                            min="0"
                            step="0.0001"
                            value={editingQty}
                            onChange={(e) => setEditingQty(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <span>
                            <strong>{num(item.quantidade)}</strong>{' '}
                            <span style={{ color: '#aaa' }}>{item.insumo.unidade}</span>
                          </span>
                        )}
                      </td>
                      <td>{brl(custoUnit)}</td>
                      <td className="clr-orange" style={{ fontWeight: 600 }}>
                        {brl(custoItemAtual)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={editSubmitting}>
                                {editSubmitting ? 'Salvando…' : 'Salvar'}
                              </button>
                              <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={editSubmitting}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn btn-secondary" onClick={() => startEdit(item)}>
                                Editar
                              </button>
                              <button type="button" className="btn btn-danger" onClick={() => handleDelete(item)}>
                                Remover
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {editError && (
            <div className="alert alert-red" style={{ marginTop: 10 }}>
              <div className="alert-msg clr-red">{editError}</div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              padding: '14px 18px',
              background: 'var(--app-surface)',
              border: '0.5px solid #e8e8e8',
              borderRadius: 12,
              fontSize: 13,
              color: 'var(--app-text-2)'
            }}
          >
            <span>Custo total da ficha técnica</span>
            <strong className="clr-orange" style={{ fontSize: 18 }}>{brl(custoTotal)}</strong>
          </div>
        </>
      )}

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <ConfirmDialog
        open={itemParaRemover !== null}
        title="Remover item da ficha técnica?"
        message={itemParaRemover ? `Você está prestes a remover “${itemParaRemover.insumo.nome}”.` : ''}
        description="O item sai da ficha técnica e dos cálculos de custo deste produto."
        confirmLabel="Remover item"
        cancelLabel="Cancelar"
        variant="danger"
        loading={removendo}
        onConfirm={confirmRemover}
        onCancel={() => setItemParaRemover(null)}
      />
    </div>
  )
}
