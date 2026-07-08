import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import InsumoAutocomplete from '../components/InsumoAutocomplete'
import InputMoeda from '../components/InputMoeda'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const qtyFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function num(value) {
  if (value === null || value === undefined) return '—'
  return qtyFormatter.format(Number(value))
}

// Unidades padronizadas: Kg (custo por kg, quantidades em gramas),
// L (custo por litro, quantidades em ml) e Und (custo por unidade)
function unidadeNormalizada(u) {
  const v = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg'
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L'
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und'
  return null
}
// Sufixo da quantidade em fichas/receitas conforme a unidade do insumo
function sufixoQuantidade(unidadeInsumo) {
  const u = unidadeNormalizada(unidadeInsumo)
  if (u === 'Kg') return 'g'
  if (u === 'L') return 'ml'
  return 'und'
}

// Unidades controladas do rendimento da receita e da porção.
// O rendimento aceita unidades menores (g/ml): o backend converte para a unidade
// base do insumo produzido (3800 g → 3,8 Kg) antes de calcular o custo unitário.
const UNIDADES_RENDIMENTO = ['g', 'Kg', 'ml', 'L', 'Und', 'Porções']
const UNIDADES_PORCAO = ['g', 'ml', 'und', 'porção']
// Unidades de rendimento compatíveis com a unidade do insumo produzido:
// Kg rende em g, L rende em ml, Und rende em Und/Porções. Limitar o select
// evita combinação incoerente (ex.: insumo em Kg com rendimento em L).
const RENDIMENTO_POR_UNIDADE_INSUMO = {
  Kg: ['g'],
  L: ['ml'],
  Und: ['Und', 'Porções']
}
function opcoesUnidadeRendimento(unidadeInsumo) {
  return RENDIMENTO_POR_UNIDADE_INSUMO[unidadeInsumo] ?? UNIDADES_RENDIMENTO
}
const AJUDA_RENDIMENTO = {
  Kg: 'Informe o rendimento total da receita em gramas. O sistema converterá para Kg para calcular o custo por Kg.',
  L: 'Informe o rendimento total da receita em ml. O sistema converterá para L para calcular o custo por litro.',
  Und: 'Informe quantas unidades ou porções essa receita rende.'
}
const SUGESTAO_UNIDADE_PORCAO = {
  g: 'g', Kg: 'g', ml: 'ml', L: 'ml', Und: 'und', 'Porções': 'porção'
}

// Unidade em que as quantidades são informadas para o insumo (Kg→g, L→ml, Und→und)
function unidadeQuantidadeLabel(unidade) {
  const u = unidadeNormalizada(unidade)
  if (u === 'Kg') return 'g'
  if (u === 'L') return 'ml'
  return 'und'
}

function unidadeRendimentoCanonica(u) {
  const v = String(u ?? '').trim().toLowerCase()
  if (['g', 'gr', 'grama', 'gramas'].includes(v)) return 'g'
  if (['ml', 'mililitro', 'mililitros'].includes(v)) return 'ml'
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg'
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L'
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und'
  if (['porcoes', 'porções', 'porcao', 'porção', 'porc'].includes(v)) return 'Porções'
  return null
}
function unidadePorcaoCanonica(u) {
  const v = String(u ?? '').trim().toLowerCase()
  if (['g', 'gr', 'grama', 'gramas'].includes(v)) return 'g'
  if (['ml', 'mililitro', 'mililitros'].includes(v)) return 'ml'
  if (['und', 'un', 'unidade'].includes(v)) return 'und'
  if (['porcao', 'porção'].includes(v)) return 'porção'
  return null
}

// Custo da porção exibido no resumo (apenas exibição): o custo unitário calculado
// é por unidade base do insumo produzido (Kg/L/Und), então porção em g/ml divide
// por 1000 quando o insumo é Kg/L. Demais casos usam o valor direto.
function custoPorcaoExibido(receita, unidadeInsumoProduzido) {
  if (!receita) return null
  const cpr = receita.custoPorRendimento
  const peso = Number(receita.pesoPorcao)
  if (cpr === null || cpr === undefined || !Number.isFinite(peso) || peso <= 0) return null
  const ui = unidadeNormalizada(unidadeInsumoProduzido)
  const up = unidadePorcaoCanonica(receita.unidadePorcao)
  const fator =
    (ui === 'Kg' && up === 'g') || (ui === 'L' && up === 'ml') ? peso / 1000 : peso
  return Number(cpr) * fator
}

const TIPOS = [
  { value: 'INGREDIENTE',      label: 'Ingrediente',      filtro: 'Ingredientes',     badge: 'badge-orange' },
  { value: 'PRODUCAO_PROPRIA', label: 'Produção própria', filtro: 'Produção própria', badge: 'badge-blue' },
  { value: 'BEBIDA',           label: 'Bebida',           filtro: 'Bebidas',          badge: 'badge-yellow' },
  { value: 'HORTIFRUTI',       label: 'Hortifruti',       filtro: 'Hortifruti',       badge: 'badge-green' },
  { value: 'EMBALAGEM',        label: 'Embalagem',        filtro: 'Embalagens',       badge: 'badge-gray' },
  { value: 'ACOMPANHAMENTO',   label: 'Acompanhamento',   filtro: 'Acompanhamentos',  badge: 'badge-red' },
  { value: 'OPERACIONAL',      label: 'Operacional',      filtro: 'Operacional',      badge: 'badge-gray' }
]
const TIPO_BY_VALUE = Object.fromEntries(TIPOS.map((t) => [t.value, t]))

function tipoLabel(value) {
  return TIPO_BY_VALUE[value]?.label ?? value ?? '—'
}
function tipoBadge(value) {
  return TIPO_BY_VALUE[value]?.badge ?? 'badge-gray'
}

const FORM_BLANK = {
  nome: '',
  tipo: 'INGREDIENTE',
  unidade: 'Kg',
  custoUnitario: '',
  fornecedor: '',
  // Modo de custo (apenas para Und): DIRETO informa o custo por unidade;
  // CAIXA calcula custoUnitario = valorCaixa / quantidadeCaixa (não persistidos).
  modoCusto: 'DIRETO',
  valorCaixa: '',
  quantidadeCaixa: '',
  // Perda/rendimento no preparo (V2): a ficha lança a quantidade pronta/servida.
  considerarPerdaPreparo: false,
  quantidadeBrutaPreparo: '',
  quantidadeAproveitavelPreparo: ''
}

// Rendimento (fração 0..1) a partir dos campos do form, ou null se inválido.
function rendimentoPreparoForm({ quantidadeBrutaPreparo, quantidadeAproveitavelPreparo }) {
  const b = Number(quantidadeBrutaPreparo)
  const a = Number(quantidadeAproveitavelPreparo)
  if (quantidadeBrutaPreparo === '' || quantidadeAproveitavelPreparo === '') return null
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0 || a <= 0 || a > b) return null
  return a / b
}

// Sufixo de unidade do custo (R$ por unidade de compra): Kg→/kg, L→/l, Und→/un.
function sufixoCusto(unidade) {
  const u = unidadeNormalizada(unidade)
  if (u === 'Kg') return '/kg'
  if (u === 'L') return '/l'
  return '/un'
}

// Custo unitário efetivo (bruto) a partir do form, ou null. Respeita o modo CAIXA.
function custoUnitarioEfetivoForm(form) {
  if (form.unidade === 'Und' && form.modoCusto === 'CAIXA') {
    return custoCaixaCalculado(form)
  }
  const c = Number(form.custoUnitario)
  return form.custoUnitario !== '' && Number.isFinite(c) && c > 0 ? c : null
}

// Custo real após perda = custo bruto / rendimento. null quando não dá para calcular.
function custoRealAposPerda(custoBruto, rendimento) {
  const c = Number(custoBruto)
  if (!Number.isFinite(c) || c <= 0 || !rendimento || rendimento <= 0) return null
  return c / rendimento
}

// Rendimento (fração) de um insumo da lista (espelha o backend; produção própria → null).
function rendimentoDoInsumo(insumo) {
  if (!insumo || insumo.considerarPerdaPreparo !== true) return null
  if ((insumo.tipo ?? '') === 'PRODUCAO_PROPRIA') return null
  const b = Number(insumo.quantidadeBrutaPreparo)
  const a = Number(insumo.quantidadeAproveitavelPreparo)
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0 || a <= 0 || a > b) return null
  return a / b
}

// Custo por unidade calculado a partir da caixa/pacote (null se inválido)
function custoCaixaCalculado({ valorCaixa, quantidadeCaixa }) {
  const v = Number(valorCaixa)
  const q = Number(quantidadeCaixa)
  if (valorCaixa === '' || quantidadeCaixa === '') return null
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(q) || q <= 0) return null
  return v / q
}

function validateForm(form) {
  const { nome, unidade, custoUnitario, tipo, modoCusto, valorCaixa, quantidadeCaixa } = form
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  if (!tipo) return 'tipo é obrigatório'
  if (unidade !== 'Kg' && unidade !== 'L' && unidade !== 'Und') {
    return 'unidade é obrigatória (Kg, L ou Und)'
  }

  // Perda no preparo: produção própria usa o rendimento da receita (bloqueado)
  if (form.considerarPerdaPreparo) {
    if (tipo === 'PRODUCAO_PROPRIA') {
      return 'Insumos de produção própria usam o rendimento da receita.'
    }
    const b = Number(form.quantidadeBrutaPreparo)
    const a = Number(form.quantidadeAproveitavelPreparo)
    if (form.quantidadeBrutaPreparo === '' || !Number.isFinite(b) || b <= 0) {
      return 'Quantidade bruta deve ser maior que zero.'
    }
    if (form.quantidadeAproveitavelPreparo === '' || !Number.isFinite(a) || a <= 0) {
      return 'Quantidade aproveitável deve ser maior que zero.'
    }
    if (a > b) {
      return 'Quantidade aproveitável deve ser menor ou igual à bruta.'
    }
  }

  // Produção própria: custo não é obrigatório — será calculado pela receita
  if (tipo === 'PRODUCAO_PROPRIA') return null

  if (unidade === 'Und' && modoCusto === 'CAIXA') {
    const v = Number(valorCaixa)
    if (valorCaixa === '' || !Number.isFinite(v) || v <= 0) {
      return 'valor da caixa/pacote deve ser maior que zero'
    }
    const q = Number(quantidadeCaixa)
    if (quantidadeCaixa === '' || !Number.isFinite(q) || q <= 0) {
      return 'quantidade na caixa/pacote deve ser maior que zero'
    }
    if (!(custoCaixaCalculado(form) > 0)) {
      return 'custo calculado por unidade deve ser maior que zero'
    }
    return null
  }

  const c = Number(custoUnitario)
  if (custoUnitario === '' || !Number.isFinite(c)) {
    return 'custo é obrigatório e deve ser numérico'
  }
  if (c <= 0) {
    return unidade === 'Kg'
      ? 'custo por kg deve ser maior que zero'
      : 'custo por unidade deve ser maior que zero'
  }
  return null
}

function payloadFromForm(form) {
  let custoUnitario
  if (form.tipo === 'PRODUCAO_PROPRIA') {
    // Criação: 0 (a calcular pela receita). Edição: preserva o custo já calculado,
    // que foi carregado no formulário ao abrir.
    custoUnitario = form.custoUnitario === '' ? 0 : Number(form.custoUnitario)
  } else if (form.unidade === 'Und' && form.modoCusto === 'CAIXA') {
    custoUnitario = custoCaixaCalculado(form)
  } else {
    custoUnitario = Number(form.custoUnitario)
  }
  const considerar = !!form.considerarPerdaPreparo && form.tipo !== 'PRODUCAO_PROPRIA'
  return {
    nome: form.nome.trim(),
    tipo: form.tipo,
    unidade: form.unidade,
    custoUnitario,
    fornecedor: form.fornecedor.trim() === '' ? null : form.fornecedor.trim(),
    considerarPerdaPreparo: considerar,
    quantidadeBrutaPreparo: considerar ? Number(form.quantidadeBrutaPreparo) : null,
    quantidadeAproveitavelPreparo: considerar ? Number(form.quantidadeAproveitavelPreparo) : null
  }
}

export default function Insumos() {
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [toast, setToast] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(FORM_BLANK)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [deletingId, setDeletingId] = useState(null)
  const [insumoParaExcluir, setInsumoParaExcluir] = useState(null)
  const [receitaInsumoId, setReceitaInsumoId] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/insumos')
      .then((r) => { setInsumos(r.data); setLoading(false) })
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

  // Recarrega a lista sem o loading de página inteira
  // (usado pelo modal de receita para atualizar a tabela atrás dele)
  function refresh() {
    return api
      .get('/insumos')
      .then((r) => setInsumos(r.data))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(insumo) {
    setEditingId(insumo.id)
    setForm({
      nome: insumo.nome ?? '',
      tipo: insumo.tipo ?? 'INGREDIENTE',
      unidade: unidadeNormalizada(insumo.unidade) ?? '',
      custoUnitario:
        insumo.custoUnitario === null || insumo.custoUnitario === undefined
          ? ''
          : String(Number(insumo.custoUnitario)),
      fornecedor: insumo.fornecedor ?? '',
      // V1 não persiste valorCaixa/quantidadeCaixa: edição abre sempre em custo direto
      modoCusto: 'DIRETO',
      valorCaixa: '',
      quantidadeCaixa: '',
      considerarPerdaPreparo: !!insumo.considerarPerdaPreparo,
      quantidadeBrutaPreparo:
        insumo.quantidadeBrutaPreparo === null || insumo.quantidadeBrutaPreparo === undefined
          ? ''
          : String(Number(insumo.quantidadeBrutaPreparo)),
      quantidadeAproveitavelPreparo:
        insumo.quantidadeAproveitavelPreparo === null || insumo.quantidadeAproveitavelPreparo === undefined
          ? ''
          : String(Number(insumo.quantidadeAproveitavelPreparo))
    })
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const err = validateForm(form)
    if (err) { setFormError(err); return }
    setFormError(null)
    setSubmitting(true)

    const request = editingId === null
      ? api.post('/insumos', payloadFromForm(form))
      : api.put(`/insumos/${editingId}`, payloadFromForm(form))

    request
      .then(() => {
        setToast({
          message: editingId === null
            ? 'Insumo criado com sucesso.'
            : 'Insumo atualizado com sucesso.',
          type: 'success'
        })
        closeModal()
        load()
      })
      .catch((e) =>
        setFormError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar insumo.')
      )
      .finally(() => setSubmitting(false))
  }

  function handleDelete(insumo) {
    setInsumoParaExcluir(insumo)
  }

  // "Excluir" na UI = exclusão lógica (soft delete) no backend, preservando histórico
  function confirmExcluirInsumo() {
    const insumo = insumoParaExcluir
    if (!insumo) return
    setDeletingId(insumo.id)
    api
      .delete(`/insumos/${insumo.id}`)
      .then(() => {
        setToast({ message: 'Insumo excluído com sucesso.', type: 'success' })
        load()
      })
      .catch((e) =>
        setToast({
          message: e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir insumo.',
          type: 'error'
        })
      )
      .finally(() => {
        setDeletingId(null)
        setInsumoParaExcluir(null)
      })
  }

  const filtered = useMemo(() => {
    let rows = insumos
    if (filtroTipo !== 'TODOS') {
      rows = rows.filter((i) => i.tipo === filtroTipo)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (i) =>
          i.nome.toLowerCase().includes(q) ||
          (i.fornecedor && i.fornecedor.toLowerCase().includes(q))
      )
    }
    return rows
  }, [insumos, search, filtroTipo])

  const total = insumos.length
  const countTipo = (t) => insumos.filter((i) => i.tipo === t).length
  const totalIngredientes = countTipo('INGREDIENTE')
  const totalProducaoPropria = countTipo('PRODUCAO_PROPRIA')
  const totalEmbAcomp = countTipo('EMBALAGEM') + countTipo('ACOMPANHAMENTO')

  if (loading) return <div className="loading-state">Carregando insumos…</div>
  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os insumos</div>
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
      <div className="page-header">
        <div>
          <h1>Insumos</h1>
          <div className="page-header-sub">
            Cadastre ingredientes, embalagens, acompanhamentos, bebidas, hortifruti e produções próprias.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Novo insumo
        </button>
      </div>

      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      <ConfirmDialog
        open={insumoParaExcluir !== null}
        title="Excluir insumo?"
        message={
          insumoParaExcluir ? `Você está prestes a excluir "${insumoParaExcluir.nome}".` : ''
        }
        description="Este insumo não aparecerá mais para novos usos, mas o histórico será preservado."
        confirmLabel="Excluir insumo"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deletingId !== null}
        onConfirm={confirmExcluirInsumo}
        onCancel={() => setInsumoParaExcluir(null)}
      />

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {editingId === null ? 'Novo insumo' : 'Editar insumo'}
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: Pão Brioche"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                  <label className="form-label">Unidade</label>
                  <select
                    className="form-input"
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                  >
                    {form.unidade !== 'Kg' && form.unidade !== 'L' && form.unidade !== 'Und' && (
                      <option value="">— selecione —</option>
                    )}
                    <option value="Kg">Kg</option>
                    <option value="L">L</option>
                    <option value="Und">Und</option>
                  </select>
                </div>
                {form.tipo !== 'PRODUCAO_PROPRIA' && form.unidade !== 'Und' && (
                  <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                    <label className="form-label">
                      {form.unidade === 'Kg'
                        ? 'Custo por kg (R$)'
                        : form.unidade === 'L'
                        ? 'Custo por litro (R$)'
                        : 'Custo unitário (R$)'}
                    </label>
                    <InputMoeda
                      className="form-input"
                      valor={form.custoUnitario}
                      onChange={(v) => setForm({ ...form, custoUnitario: v })}
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>
              {form.tipo === 'PRODUCAO_PROPRIA' && (
                <div className="alert alert-gray" style={{ marginTop: -2, marginBottom: 12, padding: '8px 12px' }}>
                  <div className="alert-msg">
                    O custo deste item será calculado pela receita de produção própria.{' '}
                    Custo atual calculado:{' '}
                    <strong className="clr-orange">
                      {brl(form.custoUnitario === '' ? 0 : Number(form.custoUnitario))}
                    </strong>
                  </div>
                </div>
              )}

              {form.tipo !== 'PRODUCAO_PROPRIA' && form.unidade === 'Kg' && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                  Informe o custo de 1 kg. Na ficha técnica e nas receitas, as quantidades serão
                  lançadas em gramas.
                </div>
              )}
              {form.tipo !== 'PRODUCAO_PROPRIA' && form.unidade === 'L' && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                  Informe o custo de 1 litro. Na ficha técnica e nas receitas, as quantidades serão
                  lançadas em ml.
                </div>
              )}

              {form.tipo !== 'PRODUCAO_PROPRIA' && form.unidade === 'Und' && (
                <>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Como deseja informar o custo?</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className={'btn btn-sm ' + (form.modoCusto === 'DIRETO' ? 'btn-primary' : 'btn-secondary')}
                        onClick={() => setForm({ ...form, modoCusto: 'DIRETO' })}
                      >
                        Custo por unidade
                      </button>
                      <button
                        type="button"
                        className={'btn btn-sm ' + (form.modoCusto === 'CAIXA' ? 'btn-primary' : 'btn-secondary')}
                        onClick={() => setForm({ ...form, modoCusto: 'CAIXA' })}
                      >
                        Caixa / pacote
                      </button>
                    </div>
                  </div>

                  {form.modoCusto === 'DIRETO' ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 12 }}>
                        <label className="form-label">Custo por unidade (R$)</label>
                        <InputMoeda
                          className="form-input"
                          valor={form.custoUnitario}
                          onChange={(v) => setForm({ ...form, custoUnitario: v })}
                          placeholder="0,00"
                        />
                      </div>
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                        Informe o custo de 1 unidade. Na ficha técnica e nas receitas, as quantidades
                        serão lançadas em unidades.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                          <label className="form-label">Valor da caixa/pacote (R$)</label>
                          <InputMoeda
                            className="form-input"
                            valor={form.valorCaixa}
                            onChange={(v) => setForm({ ...form, valorCaixa: v })}
                            placeholder="Ex.: 31,90"
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                          <label className="form-label">Quantidade na caixa/pacote</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="1"
                            value={form.quantidadeCaixa}
                            onChange={(e) => setForm({ ...form, quantidadeCaixa: e.target.value })}
                            placeholder="Ex.: 168"
                          />
                        </div>
                      </div>
                      <div
                        className="alert alert-gray"
                        style={{ marginTop: -2, marginBottom: 12, padding: '8px 12px' }}
                      >
                        <div className="alert-msg">
                          Custo calculado por unidade:{' '}
                          <strong className="clr-orange">
                            {custoCaixaCalculado(form) === null ? '—' : brl(custoCaixaCalculado(form))}
                          </strong>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                        Use para sachês, embalagens, guardanapos, potes ou itens comprados em pacote
                        e usados por unidade.
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="form-group" style={{ marginBottom: form.tipo === 'PRODUCAO_PROPRIA' ? 0 : 14 }}>
                <label className="form-label">Fornecedor (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  placeholder="Padaria Central"
                />
              </div>

              {/* ===== Perda no preparo (V2) ===== */}
              {form.tipo === 'PRODUCAO_PROPRIA' ? (
                <div className="alert alert-gray" style={{ marginBottom: 0 }}>
                  <div className="alert-msg">Insumos de produção própria usam o rendimento da receita.</div>
                </div>
              ) : (
                <div className="card" style={{ background: 'var(--app-surface-2)', marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.considerarPerdaPreparo}
                      onChange={(e) => setForm({ ...form, considerarPerdaPreparo: e.target.checked })}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text)' }}>
                        Este insumo perde peso/volume ao preparar
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: '#999', lineHeight: 1.5, marginTop: 2 }}>
                        Use para insumos que perdem peso ao fritar, assar ou preparar (ex.: bacon cru que vira
                        bacon frito). Na ficha técnica, cadastre a quantidade pronta/servida.
                      </span>
                    </span>
                  </label>

                  {form.considerarPerdaPreparo && (
                    <>
                      <div className="form-grid-2" style={{ marginTop: 12 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">
                            Quantidade bruta ({unidadeQuantidadeLabel(form.unidade)})
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="any"
                            value={form.quantidadeBrutaPreparo}
                            onChange={(e) => setForm({ ...form, quantidadeBrutaPreparo: e.target.value })}
                            placeholder="1000"
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">
                            Quantidade aproveitável ({unidadeQuantidadeLabel(form.unidade)})
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="any"
                            value={form.quantidadeAproveitavelPreparo}
                            onChange={(e) => setForm({ ...form, quantidadeAproveitavelPreparo: e.target.value })}
                            placeholder="700"
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--app-text-2)', lineHeight: 1.7 }}>
                        {(() => {
                          const r = rendimentoPreparoForm(form)
                          if (r === null) {
                            return <span className="clr-muted">Informe bruta e aproveitável (aproveitável ≤ bruta) para calcular o rendimento.</span>
                          }
                          const sufCusto = sufixoCusto(form.unidade)
                          const custoBruto = custoUnitarioEfetivoForm(form)
                          const custoReal = custoRealAposPerda(custoBruto, r)
                          return (
                            <>
                              <div>
                                Rendimento: <strong>{(r * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</strong>
                                {' · '}Perda: <strong>{((1 - r) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</strong>
                              </div>
                              {custoReal === null ? (
                                <div className="clr-muted" style={{ marginTop: 4 }}>
                                  Informe custo, quantidade bruta e quantidade aproveitável para calcular o custo real.
                                </div>
                              ) : (
                                <div style={{ marginTop: 4 }}>
                                  <div>
                                    Custo de compra: <strong>{brl(custoBruto)}{sufCusto}</strong> bruto
                                  </div>
                                  <div>
                                    Custo real após preparo: <strong className="clr-orange">{brl(custoReal)}{sufCusto}</strong> aproveitável
                                  </div>
                                  <div>
                                    Aumento por perda:{' '}
                                    <strong className="clr-orange">
                                      +{brl(custoReal - custoBruto)}{sufCusto} (+{(((1 / r) - 1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)
                                    </strong>
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {formError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{formError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando…' : 'Salvar insumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receitaInsumoId !== null && (
        <ReceitaModal
          insumoId={receitaInsumoId}
          insumosLista={insumos}
          onClose={() => setReceitaInsumoId(null)}
          onChanged={refresh}
        />
      )}

      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card title="Total de Insumos" value={total} hint="Ativos na base" variant="info" />
        <Card title="Ingredientes" value={totalIngredientes} hint="Base das fichas técnicas" variant="brand" />
        <Card title="Produção Própria" value={totalProducaoPropria} hint="Receita completa em breve" variant="info" />
        <Card
          title="Embalagens / Acompanhamentos"
          value={totalEmbAcomp}
          hint="Custos por pedido"
        />
      </div>

      <div className="section-title">Insumos Cadastrados</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          className={'btn ' + (filtroTipo === 'TODOS' ? 'btn-primary' : 'btn-secondary')}
          onClick={() => setFiltroTipo('TODOS')}
        >
          Todos
        </button>
        {TIPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={'btn ' + (filtroTipo === t.value ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setFiltroTipo(t.value)}
          >
            {t.filtro}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          className="form-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo... (nome ou fornecedor)"
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
          {filtered.length === total
            ? `${total} insumo${total === 1 ? '' : 's'}`
            : `${filtered.length} de ${total}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          Nenhum insumo cadastrado. Use o botão “+ Novo insumo” para cadastrar o primeiro.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          Nenhum insumo encontrado
          {filtroTipo !== 'TODOS' ? ` no tipo "${TIPO_BY_VALUE[filtroTipo]?.filtro ?? filtroTipo}"` : ''}
          {search.trim() !== '' ? ` para "${search}"` : ''}.
          Ajuste os filtros ou a busca.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Unidade</th>
                <th>Custo unitário</th>
                <th>Fornecedor</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{i.nome}</td>
                  <td>
                    <span className={'badge ' + tipoBadge(i.tipo)}>{tipoLabel(i.tipo)}</span>
                  </td>
                  <td>{i.unidade}</td>
                  <td>
                    {i.tipo === 'PRODUCAO_PROPRIA' && Number(i.custoUnitario) === 0 ? (
                      <span className="badge badge-yellow">A calcular</span>
                    ) : (
                      (() => {
                        const rend = rendimentoDoInsumo(i)
                        const custoReal = custoRealAposPerda(i.custoUnitario, rend)
                        const suf = sufixoCusto(i.unidade).toUpperCase()
                        return (
                          <>
                            <div>{brl(i.custoUnitario)}{suf}</div>
                            {custoReal !== null && (
                              <div className="clr-orange" style={{ fontSize: 11, marginTop: 2 }}>
                                Pós perda: <strong>{brl(custoReal)}{suf}</strong>
                              </div>
                            )}
                          </>
                        )
                      })()
                    )}
                  </td>
                  <td className={i.fornecedor ? '' : 'clr-muted'}>
                    {i.fornecedor || 'Sem fornecedor'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {i.tipo === 'PRODUCAO_PROPRIA' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setReceitaInsumoId(i.id)}
                        >
                          Abrir receita
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(i)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(i)}
                        disabled={deletingId === i.id}
                      >
                        {deletingId === i.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============ Modal grande: receita de produção própria ============

const RECEITA_FORM_BLANK = {
  modoRendimento: 'TOTAL',
  rendimento: '',
  unidadeRendimento: '',
  quantidadePorcoes: '',
  pesoPorcao: '',
  unidadePorcao: '',
  observacoes: ''
}

function ReceitaModal({ insumoId, insumosLista, onClose, onChanged }) {
  const [insumo, setInsumo] = useState(null)
  const [receita, setReceita] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const [dadosForm, setDadosForm] = useState(RECEITA_FORM_BLANK)
  const [dadosError, setDadosError] = useState(null)
  const [dadosSaving, setDadosSaving] = useState(false)

  const [showAddIngForm, setShowAddIngForm] = useState(false)
  const [ingId, setIngId] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [ingError, setIngError] = useState(null)
  const [ingSubmitting, setIngSubmitting] = useState(false)

  const [ingParaRemover, setIngParaRemover] = useState(null)
  const [removendoIng, setRemovendoIng] = useState(false)

  const [editingItemId, setEditingItemId] = useState(null)
  const [editingQty, setEditingQty] = useState('')
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  function applyResponse(data) {
    setInsumo(data.insumo)
    setReceita(data.receita)
    if (data.receita) {
      const rendimentoNum = Number(data.receita.rendimento)
      // Unidade do rendimento limitada pela unidade do insumo produzido:
      // valor salvo incompatível é trocado automaticamente pela unidade compatível
      // (ex.: insumo Kg com rendimento em L → g); vazio em lista de opção única
      // já abre pré-selecionado.
      const opcoes = opcoesUnidadeRendimento(unidadeNormalizada(data.insumo?.unidade))
      const unidadeSalva =
        unidadeRendimentoCanonica(data.receita.unidadeRendimento) ??
        (data.receita.unidadeRendimento ?? '')
      const unidadeAjustada =
        unidadeSalva !== '' && !opcoes.includes(unidadeSalva)
          ? opcoes[0]
          : unidadeSalva === '' && opcoes.length === 1
          ? opcoes[0]
          : unidadeSalva
      setDadosForm({
        // Receitas antigas não têm modoRendimento salvo: tratadas como TOTAL
        modoRendimento: data.receita.modoRendimento === 'PORCOES' ? 'PORCOES' : 'TOTAL',
        // rendimento 0 = ainda não informado (receita criada antes do rendimento)
        rendimento: rendimentoNum > 0 ? String(rendimentoNum) : '',
        unidadeRendimento: unidadeAjustada,
        quantidadePorcoes:
          data.receita.quantidadePorcoes === null || data.receita.quantidadePorcoes === undefined
            ? ''
            : String(Number(data.receita.quantidadePorcoes)),
        pesoPorcao:
          data.receita.pesoPorcao === null || data.receita.pesoPorcao === undefined
            ? ''
            : String(Number(data.receita.pesoPorcao)),
        unidadePorcao:
          unidadePorcaoCanonica(data.receita.unidadePorcao) ??
          (data.receita.unidadePorcao ?? ''),
        observacoes: data.receita.observacoes ?? ''
      })
    }
  }

  function loadAll() {
    setLoading(true)
    setError(null)
    api
      .get(`/insumos/${insumoId}/receita`)
      .then((r) => {
        applyResponse(r.data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err?.response?.data?.error ?? err?.message ?? 'Erro inesperado.')
        setLoading(false)
      })
  }

  useEffect(() => { loadAll() }, [insumoId])

  // Ao trocar a unidade do rendimento, sugere a unidade da porção compatível
  // (não bloqueia: só substitui se o campo estiver vazio ou com outra sugestão padrão)
  function handleChangeUnidadeRendimento(value) {
    const sugestao = SUGESTAO_UNIDADE_PORCAO[value]
    setDadosForm((f) => ({
      ...f,
      unidadeRendimento: value,
      unidadePorcao:
        sugestao && (f.unidadePorcao === '' || UNIDADES_PORCAO.includes(f.unidadePorcao))
          ? sugestao
          : f.unidadePorcao
    }))
  }

  function handleSaveDados(e) {
    e.preventDefault()
    setDadosError(null)
    const modoPorcoes = dadosForm.modoRendimento === 'PORCOES'
    const unidadeInsumo = unidadeNormalizada(insumo?.unidade)
    if (modoPorcoes) {
      const qtd = Number(dadosForm.quantidadePorcoes)
      if (dadosForm.quantidadePorcoes === '' || !Number.isFinite(qtd) || qtd <= 0) {
        setDadosError('quantidade de unidades/porções é obrigatória e deve ser maior que zero')
        return
      }
      if (unidadeInsumo === 'Kg' || unidadeInsumo === 'L') {
        const tam = Number(dadosForm.pesoPorcao)
        if (dadosForm.pesoPorcao === '' || !Number.isFinite(tam) || tam <= 0) {
          setDadosError(
            unidadeInsumo === 'Kg'
              ? 'tamanho de cada unidade (em g) é obrigatório e deve ser maior que zero'
              : 'volume por unidade (em ml) é obrigatório e deve ser maior que zero'
          )
          return
        }
      }
    } else {
      const r = Number(dadosForm.rendimento)
      if (dadosForm.rendimento === '' || !Number.isFinite(r) || r <= 0) {
        setDadosError('rendimento é obrigatório e deve ser maior que zero')
        return
      }
      if (!dadosForm.unidadeRendimento.trim()) {
        setDadosError('unidade do rendimento é obrigatória')
        return
      }
    }
    if (dadosForm.pesoPorcao !== '' && (!Number.isFinite(Number(dadosForm.pesoPorcao)) || Number(dadosForm.pesoPorcao) <= 0)) {
      setDadosError('peso da porção deve ser maior que zero')
      return
    }
    setDadosSaving(true)
    api
      .post(`/insumos/${insumoId}/receita`, {
        modoRendimento: dadosForm.modoRendimento,
        // No modo PORCOES o backend calcula rendimento/unidade a partir de
        // quantidadePorcoes × pesoPorcao (Und usa só a quantidade)
        rendimento: modoPorcoes ? null : Number(dadosForm.rendimento),
        unidadeRendimento: modoPorcoes ? null : dadosForm.unidadeRendimento.trim(),
        quantidadePorcoes:
          dadosForm.quantidadePorcoes === '' ? null : Number(dadosForm.quantidadePorcoes),
        pesoPorcao: dadosForm.pesoPorcao === '' ? null : Number(dadosForm.pesoPorcao),
        unidadePorcao: dadosForm.unidadePorcao.trim() === '' ? null : dadosForm.unidadePorcao.trim(),
        observacoes: dadosForm.observacoes.trim() === '' ? null : dadosForm.observacoes.trim()
      })
      .then((res) => {
        applyResponse(res.data)
        // O custo do insumo é sincronizado automaticamente no backend ao salvar
        if (res.data.custoAtualizado) {
          setToast({ message: 'Receita salva e custo do insumo atualizado.', type: 'success' })
        } else {
          setToast({
            message: res.data.custoMensagem
              ? `Dados da receita salvos. ${res.data.custoMensagem}`
              : 'Dados da receita salvos.',
            type: 'info'
          })
        }
        return onChanged()
      })
      .catch((e) =>
        setDadosError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar receita.')
      )
      .finally(() => setDadosSaving(false))
  }

  function openAddIngForm() {
    setIngError(null)
    setShowAddIngForm(true)
  }

  function cancelAddIng() {
    setIngId('')
    setIngQty('')
    setIngError(null)
    setShowAddIngForm(false)
  }

  function handleAddIngrediente(e) {
    e.preventDefault()
    setIngError(null)
    if (!ingId) {
      setIngError('Selecione um insumo válido.')
      return
    }
    const q = Number(ingQty)
    if (!Number.isFinite(q) || q <= 0) {
      setIngError('Quantidade deve ser maior que zero.')
      return
    }
    setIngSubmitting(true)
    // Ingredientes podem ser adicionados antes do rendimento: se a receita ainda
    // não existe, cria uma receita inicial vazia (rendimento 0 = não informado).
    const garantirReceita =
      receita === null
        ? api.post(`/insumos/${insumoId}/receita`, { rendimento: 0, unidadeRendimento: '' })
        : Promise.resolve(null)
    garantirReceita
      .then(() =>
        api.post(`/insumos/${insumoId}/receita/itens`, {
          insumoId: Number(ingId),
          quantidade: q
        })
      )
      .then((res) => {
        applyResponse(res.data)
        setIngId('')
        setIngQty('')
        setShowAddIngForm(false)
        setToast({ message: 'Ingrediente adicionado à receita.', type: 'success' })
        return onChanged()
      })
      .catch((err) =>
        setIngError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar ingrediente.')
      )
      .finally(() => setIngSubmitting(false))
  }

  function startEditItem(item) {
    setEditingItemId(item.id)
    setEditingQty(String(Number(item.quantidade)))
    setEditError(null)
  }
  function cancelEditItem() {
    setEditingItemId(null)
    setEditingQty('')
    setEditError(null)
  }
  function saveEditItem() {
    setEditError(null)
    const q = Number(editingQty)
    if (!Number.isFinite(q) || q <= 0) {
      setEditError('Quantidade deve ser maior que zero.')
      return
    }
    setEditSubmitting(true)
    api
      .put(`/receitas-producao/itens/${editingItemId}`, { quantidade: q })
      .then((res) => {
        applyResponse(res.data)
        cancelEditItem()
        return onChanged()
      })
      .catch((err) =>
        setEditError(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDeleteItem(item) {
    setIngParaRemover(item)
  }

  function confirmRemoveIngrediente() {
    const item = ingParaRemover
    if (!item) return
    setRemovendoIng(true)
    api
      .delete(`/receitas-producao/itens/${item.id}`)
      .then((res) => {
        applyResponse(res.data)
        setToast({ message: 'Ingrediente removido da receita.', type: 'success' })
        return onChanged()
      })
      .catch((err) =>
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao remover.',
          type: 'error'
        })
      )
      .finally(() => {
        setRemovendoIng(false)
        setIngParaRemover(null)
      })
  }

  // Ingredientes disponíveis: ativos, sem o próprio insumo e sem produção própria
  const opcoesIngrediente = insumosLista.filter(
    (i) => i.id !== insumoId && i.tipo !== 'PRODUCAO_PROPRIA'
  )

  const itens = receita?.itens ?? []

  const ingSelecionado = opcoesIngrediente.find((i) => String(i.id) === ingId)
  const ingUnidade = ingSelecionado ? unidadeNormalizada(ingSelecionado.unidade) : null

  // Resumo do custo: rendimento 0/ausente = "não informado" (custo unitário pendente).
  // O custo unitário calculado é sempre por unidade base do insumo produzido.
  const temRendimento = receita !== null && Number(receita.rendimento) > 0
  const unidadeRendimentoExibida = receita
    ? (unidadeRendimentoCanonica(receita.unidadeRendimento) ?? receita.unidadeRendimento ?? '')
    : ''
  const unidadeInsumoProduzido = unidadeNormalizada(insumo?.unidade) ?? (insumo?.unidade ?? '')

  // ===== Modo de rendimento por porções: total calculado em tempo real =====
  // Kg/L: quantidade × tamanho (g/ml); Und: quantidade direto (tamanho informativo)
  const modoPorcoesForm = dadosForm.modoRendimento === 'PORCOES'
  const qtdPorcoesNum = Number(dadosForm.quantidadePorcoes)
  const tamPorcaoNum = Number(dadosForm.pesoPorcao)
  let rendimentoCalculado = null
  let rendimentoCalculadoLabel = null
  if (modoPorcoesForm && Number.isFinite(qtdPorcoesNum) && qtdPorcoesNum > 0) {
    if (unidadeInsumoProduzido === 'Kg' || unidadeInsumoProduzido === 'L') {
      if (Number.isFinite(tamPorcaoNum) && tamPorcaoNum > 0) {
        rendimentoCalculado = qtdPorcoesNum * tamPorcaoNum
        const menor = unidadeInsumoProduzido === 'Kg' ? 'g' : 'ml'
        rendimentoCalculadoLabel =
          `${num(rendimentoCalculado)} ${menor} = ${num(rendimentoCalculado / 1000)} ${unidadeInsumoProduzido}`
      }
    } else {
      rendimentoCalculado = qtdPorcoesNum
      rendimentoCalculadoLabel = `${num(rendimentoCalculado)} und`
    }
  }
  const rendimentoBase =
    receita?.rendimentoBase === null || receita?.rendimentoBase === undefined
      ? null
      : Number(receita.rendimentoBase)
  const rendimentoIncompativel = temRendimento && receita?.rendimentoIncompativel === true
  const rendimentoConvertido =
    temRendimento &&
    rendimentoBase !== null &&
    unidadeRendimentoExibida !== unidadeInsumoProduzido
  const custoUnitarioCalculado =
    temRendimento &&
    receita.custoPorRendimento !== null &&
    receita.custoPorRendimento !== undefined
      ? Number(receita.custoPorRendimento)
      : null
  const custoPorcaoResumo = temRendimento
    ? custoPorcaoExibido(receita, insumo?.unidade)
    : null

  // ===== Resumo no modo PORCOES: a leitura principal é o custo POR UNIDADE =====
  // (custoTotal / quantidadePorcoes); o custo por Kg/L vira leitura técnica
  const receitaEmPorcoes = receita?.modoRendimento === 'PORCOES'
  const qtdPorcoesReceita = Number(receita?.quantidadePorcoes)
  const pesoPorcaoReceita = Number(receita?.pesoPorcao)
  const custoPorUnidadeReceita =
    receitaEmPorcoes && qtdPorcoesReceita > 0 && Number(receita?.custoTotalReceita) > 0
      ? Number(receita.custoTotalReceita) / qtdPorcoesReceita
      : null
  const unidadeMenorInsumo =
    unidadeInsumoProduzido === 'Kg' ? 'g' : unidadeInsumoProduzido === 'L' ? 'ml' : 'und'
  // Para insumo base Und o custo por unidade já é o próprio custo unitário:
  // não duplica o card de custo por Kg/L
  const mostraCustoBasePorcoes =
    receitaEmPorcoes && (unidadeInsumoProduzido === 'Kg' || unidadeInsumoProduzido === 'L')
  // Custo ATUAL da unidade: o que a ficha técnica usa hoje ao consumir por
  // unidade (peso da porção × custo salvo no insumo; Und usa o custo direto)
  const custoAtualUnidadeReceita = !receitaEmPorcoes
    ? null
    : unidadeInsumoProduzido === 'Kg' || unidadeInsumoProduzido === 'L'
    ? pesoPorcaoReceita > 0
      ? (pesoPorcaoReceita / 1000) * Number(insumo?.custoUnitario ?? 0)
      : null
    : Number(insumo?.custoUnitario ?? 0)

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--app-text)' }}>
              {insumo?.nome ?? '…'}
            </span>
            <span className={'badge ' + tipoBadge('PRODUCAO_PROPRIA')}>
              {tipoLabel('PRODUCAO_PROPRIA')}
            </span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Carregando receita…</div>
        ) : error ? (
          <div className="alert alert-red">
            <div>
              <div className="alert-title clr-red">Não foi possível carregar a receita</div>
              <div className="alert-msg">{error}</div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={loadAll}>
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Seção 1 — Ingredientes da receita (montagem primeiro, rendimento depois) */}
            <div className="section-title" style={{ marginTop: 0 }}>Ingredientes da Receita</div>

                <div className="table-card table-card-form">
                  {itens.length === 0 ? (
                    <div className="empty-state" style={{ padding: '28px 16px' }}>
                      Nenhum ingrediente na receita. Adicione o primeiro ingrediente abaixo para
                      calcular o custo da produção própria.
                    </div>
                  ) : (
                    <div className="table-scroll">
                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th>Insumo</th>
                          <th>Tipo</th>
                          <th>Unidade</th>
                          <th>Custo unitário</th>
                          <th>Quantidade usada</th>
                          <th>Custo aplicado</th>
                          <th style={{ textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item) => {
                          const isEditing = editingItemId === item.id
                          const custoUnit = Number(item.insumo.custoUnitario)
                          const unidadeItem = unidadeNormalizada(item.insumo.unidade)
                          const divideMil = unidadeItem === 'Kg' || unidadeItem === 'L'
                          const qty = isEditing ? Number(editingQty) : Number(item.quantidade)
                          const qtyBase = divideMil ? qty / 1000 : qty
                          const custoAplicado = isEditing
                            ? (qty > 0 ? qtyBase * custoUnit : 0)
                            : Number(item.custoItem ?? (qty > 0 ? qtyBase * custoUnit : 0))

                          return (
                            <tr key={item.id} style={isEditing ? { background: 'var(--app-highlight)' } : undefined}>
                              <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{item.insumo.nome}</td>
                              <td>
                                <span className={'badge ' + tipoBadge(item.insumo.tipo)}>
                                  {tipoLabel(item.insumo.tipo)}
                                </span>
                              </td>
                              <td style={{ color: '#888' }}>{item.insumo.unidade}</td>
                              <td>{brl(custoUnit)}</td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="form-input"
                                    style={{ padding: '6px 10px', fontSize: 13, width: 110 }}
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={editingQty}
                                    onChange={(e) => setEditingQty(e.target.value)}
                                    autoFocus
                                  />
                                ) : (
                                  <strong>
                                    {num(item.quantidade)} {item.unidadeQuantidadeReceita ?? sufixoQuantidade(item.insumo.unidade)}
                                  </strong>
                                )}
                              </td>
                              <td className="clr-orange" style={{ fontWeight: 600 }}>
                                {brl(custoAplicado)}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  {isEditing ? (
                                    <>
                                      <button type="button" className="btn btn-primary" onClick={saveEditItem} disabled={editSubmitting}>
                                        {editSubmitting ? 'Salvando…' : 'Salvar'}
                                      </button>
                                      <button type="button" className="btn btn-secondary" onClick={cancelEditItem} disabled={editSubmitting}>
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button type="button" className="btn btn-secondary" onClick={() => startEditItem(item)}>
                                        Editar
                                      </button>
                                      <button type="button" className="btn btn-danger" onClick={() => handleDeleteItem(item)}>
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
                  )}

                  {/* Adição integrada à receita (continuação do card) */}
                  <div className="ficha-add-area">
                    {!showAddIngForm ? (
                      <button type="button" className="ficha-add-trigger" onClick={openAddIngForm}>
                        + Adicionar ingrediente
                      </button>
                    ) : (
                    <>
                    <div className="ficha-add-title">Adicionar ingrediente</div>
                    <form onSubmit={handleAddIngrediente}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
                          <label className="form-label">Insumo</label>
                          <InsumoAutocomplete
                            insumos={opcoesIngrediente}
                            value={ingId}
                            onChange={(v) => setIngId(v)}
                            placeholder="Digite para buscar o ingrediente..."
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                          <label className="form-label">
                            {ingUnidade === 'Kg'
                              ? 'Quantidade usada (g)'
                              : ingUnidade === 'L'
                              ? 'Quantidade usada (ml)'
                              : ingUnidade === 'Und'
                              ? 'Quantidade usada (und)'
                              : 'Quantidade usada'}
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.001"
                            value={ingQty}
                            onChange={(e) => setIngQty(e.target.value)}
                            placeholder={ingUnidade === 'Kg' || ingUnidade === 'L' ? 'Ex.: 300' : 'Ex.: 1'}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={cancelAddIng}
                            disabled={ingSubmitting}
                          >
                            Cancelar
                          </button>
                          <button type="submit" className="btn btn-primary" disabled={ingSubmitting}>
                            {ingSubmitting ? 'Adicionando…' : 'Adicionar'}
                          </button>
                        </div>
                      </div>
                      {ingUnidade === 'Kg' && (
                        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                          Este insumo é cadastrado por kg. Informe aqui a quantidade em gramas.
                        </div>
                      )}
                      {ingUnidade === 'L' && (
                        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                          Este insumo é cadastrado por litro. Informe aqui a quantidade em ml.
                        </div>
                      )}
                      {ingUnidade === 'Und' && (
                        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                          Este insumo é cadastrado por unidade. Informe aqui a quantidade de unidades.
                        </div>
                      )}
                      {ingError && (
                        <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                          <div className="alert-msg clr-red">{ingError}</div>
                        </div>
                      )}
                      {opcoesIngrediente.length === 0 && (
                        <div className="alert alert-yellow" style={{ marginTop: 12, marginBottom: 0 }}>
                          <div className="alert-msg clr-yellow">
                            Nenhum insumo disponível como ingrediente. Cadastre insumos comuns primeiro.
                          </div>
                        </div>
                      )}
                    </form>
                    </>
                    )}
                  </div>
                </div>

                {editError && (
                  <div className="alert alert-red" style={{ marginTop: 10 }}>
                    <div className="alert-msg clr-red">{editError}</div>
                  </div>
                )}

            {/* Seção 2 — Rendimento da receita */}
            <div className="section-title">Rendimento da Receita</div>
            <div className="card">
              <form onSubmit={handleSaveDados}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                    <label className="form-label">Modo de rendimento</label>
                    <select
                      className="form-input"
                      value={dadosForm.modoRendimento}
                      onChange={(e) => setDadosForm({ ...dadosForm, modoRendimento: e.target.value })}
                    >
                      <option value="TOTAL">Rendimento total</option>
                      <option value="PORCOES">Porções/unidades</option>
                    </select>
                  </div>

                  {!modoPorcoesForm ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                        <label className="form-label">Rendimento total</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={dadosForm.rendimento}
                          onChange={(e) => setDadosForm({ ...dadosForm, rendimento: e.target.value })}
                          placeholder="Ex.: 2"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                        <label className="form-label">Unidade do rendimento</label>
                        <select
                          className="form-input"
                          value={dadosForm.unidadeRendimento}
                          onChange={(e) => handleChangeUnidadeRendimento(e.target.value)}
                        >
                          {dadosForm.unidadeRendimento !== '' &&
                            !opcoesUnidadeRendimento(unidadeInsumoProduzido).includes(
                              dadosForm.unidadeRendimento
                            ) && (
                              <option value={dadosForm.unidadeRendimento}>
                                {dadosForm.unidadeRendimento}
                              </option>
                            )}
                          <option value="">— selecione —</option>
                          {opcoesUnidadeRendimento(unidadeInsumoProduzido).map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
                        <label className="form-label">Tamanho da porção (opcional)</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={dadosForm.pesoPorcao}
                          onChange={(e) => setDadosForm({ ...dadosForm, pesoPorcao: e.target.value })}
                          placeholder="Ex.: 30"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                        <label className="form-label">Unidade da porção</label>
                        <select
                          className="form-input"
                          value={dadosForm.unidadePorcao}
                          onChange={(e) => setDadosForm({ ...dadosForm, unidadePorcao: e.target.value })}
                        >
                          {dadosForm.unidadePorcao !== '' &&
                            !UNIDADES_PORCAO.includes(dadosForm.unidadePorcao) && (
                              <option value={dadosForm.unidadePorcao}>{dadosForm.unidadePorcao}</option>
                            )}
                          <option value="">—</option>
                          {UNIDADES_PORCAO.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                        <label className="form-label">Quantidade de unidades/porções</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={dadosForm.quantidadePorcoes}
                          onChange={(e) =>
                            setDadosForm({ ...dadosForm, quantidadePorcoes: e.target.value })
                          }
                        />
                      </div>
                      {(unidadeInsumoProduzido === 'Kg' || unidadeInsumoProduzido === 'L') ? (
                        <>
                          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                            <label className="form-label">
                              {unidadeInsumoProduzido === 'Kg'
                                ? 'Tamanho de cada unidade (g)'
                                : 'Volume por unidade (ml)'}
                            </label>
                            <input
                              className="form-input"
                              type="number"
                              min="0"
                              step="0.001"
                              value={dadosForm.pesoPorcao}
                              onChange={(e) =>
                                setDadosForm({ ...dadosForm, pesoPorcao: e.target.value })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0, flex: 0.6, minWidth: 80 }}>
                            <label className="form-label">Unidade</label>
                            <input
                              className="form-input"
                              type="text"
                              value={unidadeInsumoProduzido === 'Kg' ? 'g' : 'ml'}
                              disabled
                            />
                          </div>
                        </>
                      ) : (
                        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                          <label className="form-label">Tamanho por unidade (opcional)</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.001"
                            value={dadosForm.pesoPorcao}
                            onChange={(e) =>
                              setDadosForm({ ...dadosForm, pesoPorcao: e.target.value })
                            }
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="form-group" style={{ marginBottom: 0, flex: 1.5, minWidth: 150 }}>
                    <label className="form-label">Observações (opcional)</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.observacoes}
                      onChange={(e) => setDadosForm({ ...dadosForm, observacoes: e.target.value })}
                      placeholder="Modo de preparo, validade, observações..."
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={dadosSaving}>
                    {dadosSaving ? 'Salvando…' : 'Salvar dados da receita'}
                  </button>
                </div>
                {modoPorcoesForm && rendimentoCalculadoLabel && (
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--app-text-2)', marginTop: 10 }}>
                    Rendimento total calculado: {rendimentoCalculadoLabel}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                  {modoPorcoesForm
                    ? 'Use este modo quando a receita rende unidades padronizadas, como 70 coxinhas de 25 g.'
                    : AJUDA_RENDIMENTO[unidadeInsumoProduzido] ??
                      'Escolha como o rendimento final da receita será medido. Ex.: essa receita rendeu 2 Kg e cada porção usada tem 30 g.'}
                </div>
                {dadosError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{dadosError}</div>
                  </div>
                )}
              </form>
            </div>

            {/* Seção 3 — Resumo do custo. No modo PORCOES a leitura principal é
                o custo por unidade; o custo por Kg/L segue como leitura técnica */}
            <div className="section-title">Resumo do Custo</div>
            <div className={mostraCustoBasePorcoes ? 'grid-5' : 'grid-4'}>
              <Card
                title="Custo Total da Receita"
                value={brl(receita?.custoTotalReceita ?? 0)}
                hint="Soma dos ingredientes"
                variant="brand"
              />
              <Card
                title="Rendimento"
                value={
                  !temRendimento
                    ? '—'
                    : receitaEmPorcoes && qtdPorcoesReceita > 0
                    ? `${num(qtdPorcoesReceita)} unidades${
                        mostraCustoBasePorcoes && pesoPorcaoReceita > 0
                          ? ` de ${num(pesoPorcaoReceita)} ${unidadeMenorInsumo}`
                          : ''
                      }`
                    : `${num(receita.rendimento)} ${unidadeRendimentoExibida}`
                }
                hint={
                  !temRendimento
                    ? 'Não informado'
                    : rendimentoIncompativel
                    ? `Incompatível com insumo em ${unidadeInsumoProduzido}`
                    : receitaEmPorcoes && mostraCustoBasePorcoes
                    ? `= ${num(receita.rendimento)} ${unidadeRendimentoExibida} = ${num(rendimentoBase)} ${unidadeInsumoProduzido}`
                    : rendimentoConvertido
                    ? `= ${num(rendimentoBase)} ${unidadeInsumoProduzido}`
                    : receita?.pesoPorcao
                    ? `Porção: ${num(receita.pesoPorcao)} ${receita.unidadePorcao ?? ''}`
                    : 'Sem porção definida'
                }
              />
              {!receitaEmPorcoes ? (
                <>
                  <Card
                    title="Custo Unitário Calculado"
                    value={custoUnitarioCalculado !== null ? brl(custoUnitarioCalculado) : '—'}
                    hint={
                      rendimentoIncompativel
                        ? 'Unidade do rendimento incompatível com o insumo'
                        : custoUnitarioCalculado === null
                        ? 'Informe o rendimento para calcular'
                        : custoPorcaoResumo !== null
                        ? `Por ${unidadeInsumoProduzido} · porção: ${num(receita.pesoPorcao)} ${receita.unidadePorcao ?? ''} = ${brl(custoPorcaoResumo)}`
                        : `Por ${unidadeInsumoProduzido}`
                    }
                    variant={custoUnitarioCalculado !== null ? 'success' : 'info'}
                  />
                  <Card
                    title="Custo Atual do Insumo"
                    value={brl(insumo?.custoUnitario)}
                    hint={`Por ${insumo?.unidade ?? '—'} (em uso nas fichas)`}
                    variant="info"
                  />
                </>
              ) : (
                <>
                  {/* Leitura operacional: a unidade/porção é o valor principal */}
                  <Card
                    title="Custo da Unidade"
                    value={custoPorUnidadeReceita !== null ? brl(custoPorUnidadeReceita) : '—'}
                    hint={
                      custoPorUnidadeReceita === null
                        ? 'Informe ingredientes e quantidade de unidades'
                        : mostraCustoBasePorcoes && pesoPorcaoReceita > 0
                        ? `Por unidade de ${num(pesoPorcaoReceita)} ${unidadeMenorInsumo}`
                        : 'Por unidade'
                    }
                    variant="success"
                  />
                  <Card
                    title="Custo Atual da Unidade"
                    value={custoAtualUnidadeReceita !== null ? brl(custoAtualUnidadeReceita) : '—'}
                    hint="Usado na ficha por unidade"
                    variant="info"
                  />
                  {mostraCustoBasePorcoes && (
                    <Card
                      title={unidadeInsumoProduzido === 'Kg' ? 'Referência por Kg' : 'Referência por Litro'}
                      value={brl(insumo?.custoUnitario)}
                      hint={
                        unidadeInsumoProduzido === 'Kg'
                          ? 'Usado quando consumir por peso'
                          : 'Usado quando consumir por volume'
                      }
                    />
                  )}
                </>
              )}
            </div>

            {rendimentoIncompativel && (
              <div className="alert alert-yellow" style={{ marginTop: 12 }}>
                <div className="alert-msg clr-yellow">
                  A unidade do rendimento não é compatível com a unidade cadastrada para este
                  insumo.{' '}
                  {unidadeInsumoProduzido === 'Kg' &&
                    'Este insumo está cadastrado em Kg: use rendimento em g ou Kg, ou edite o insumo para L se o rendimento for em litros.'}
                  {unidadeInsumoProduzido === 'L' &&
                    'Este insumo está cadastrado em L: use rendimento em ml ou L.'}
                  {unidadeInsumoProduzido === 'Und' &&
                    'Este insumo está cadastrado em Und: use rendimento em Und ou Porções.'}
                </div>
              </div>
            )}

            {/* Custo do insumo é sincronizado automaticamente ao salvar a receita */}
            <div className="alert alert-gray" style={{ marginTop: 16 }}>
              <div className="alert-msg" style={{ color: '#888' }}>
                O custo do insumo é atualizado automaticamente ao salvar a receita, usando o custo
                calculado (ingredientes + rendimento).
              </div>
            </div>
          </>
        )}

        <ConfirmDialog
          open={ingParaRemover !== null}
          title="Remover ingrediente da receita?"
          message={
            ingParaRemover
              ? `Você está prestes a remover "${ingParaRemover.insumo?.nome}" desta receita.`
              : ''
          }
          description="Essa ação recalcula o custo da receita e pode alterar o custo unitário calculado."
          confirmLabel="Remover ingrediente"
          cancelLabel="Cancelar"
          variant="danger"
          loading={removendoIng}
          onConfirm={confirmRemoveIngrediente}
          onCancel={() => setIngParaRemover(null)}
        />

        <Toast
          message={toast?.message}
          type={toast?.type}
          onClose={() => setToast(null)}
        />
      </div>
    </div>
  )
}
