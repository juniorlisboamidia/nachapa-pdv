import { useEffect, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast from '../components/Toast'
import InputMoeda from '../components/InputMoeda'

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
// Percentual com 1 casa decimal (padrão da visão analítica)
function pct1(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(1).replace('.', ',')}%`
}
// Mesmo padrão de período da tela de Faturamento: mês corrente (YYYY-MM)
function mesAtualYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function labelMesAtual() {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const d = new Date()
  return `${meses[d.getMonth()]} de ${d.getFullYear()}`
}

// ===== Custos fixos =====

// Grupos padronizados de custo fixo, na ordem fixa de exibição da grade.
// "Colaboradores" = equipe fixa/CLT; "Freelancer" = equipe eventual.
const GRUPOS_FIXOS_PADRAO = [
  'Custos de funcionamento',
  'Colaboradores',
  'Motoboys',
  'Marketing',
  'Alimentação',
  'Pró-labore',
  'Custos gerais',
  'Freelancer'
]

// Mapeia categorias antigas/legadas para o grupo padronizado mais próximo.
// Só afeta exibição e o valor pré-selecionado na edição — o dado salvo não
// muda até o usuário editar e salvar (padronização de UI, sem migration).
const MAPA_CATEGORIA_LEGADA = {
  'Funcionamento': 'Custos de funcionamento',
  'Aluguel': 'Custos de funcionamento',
  'Contas': 'Custos de funcionamento',
  'Sistemas': 'Custos de funcionamento',
  'Manutenção': 'Custos de funcionamento',
  'Salários': 'Colaboradores',
  'Salários CLT': 'Colaboradores',
  'Mão de obra': 'Colaboradores',
  'Salários Freelancer': 'Freelancer',
  'Freelancers': 'Freelancer',
  'Outros': 'Custos gerais'
}

// Encargos de colaborador CLT (estimativa gerencial, espelhando o backend):
// 13º = base/12 · férias = (base/12) × 4/3 · FGTS = 8% da base
function encargosClt(salarioBase) {
  const s = Number(salarioBase)
  if (!Number.isFinite(s) || s <= 0) return null
  const decimo = s / 12
  const ferias = (s / 12) * (4 / 3)
  const fgts = s * 0.08
  return { decimo, ferias, fgts, total: s + decimo + ferias + fgts }
}

// Tipos de pessoa por grupo especial: Colaboradores (equipe fixa) e
// Motoboys (entregadores, com diarista calculado por diária × qtd × dias)
const TIPOS_COLABORADOR = [
  { value: 'CLT', label: 'CLT' },
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'OUTRO', label: 'Outro' }
]
const TIPOS_MOTOBOY = [
  { value: 'CLT', label: 'CLT' },
  { value: 'PJ', label: 'PJ' },
  { value: 'DIARISTA', label: 'Diarista' }
]
const GRUPOS_ESPECIAIS = ['Colaboradores', 'Motoboys']
function tiposPessoaDoGrupo(categoria) {
  return categoria === 'Motoboys' ? TIPOS_MOTOBOY : TIPOS_COLABORADOR
}
function totalDiarista(form) {
  const v = Number(form.valorDiaria)
  const q = Number(form.quantidade)
  const d = Number(form.dias)
  if (!(v > 0) || !(q > 0) || !(d > 0)) return null
  return v * q * d
}

function categoriaCanonicaFixo(tipo) {
  const t = (tipo ?? '').trim()
  if (t === '') return 'Custos gerais'
  if (GRUPOS_FIXOS_PADRAO.includes(t)) return t
  return MAPA_CATEGORIA_LEGADA[t] ?? 'Custos gerais'
}

const FIXO_BLANK = {
  nome: '',
  valorMensal: '',
  tipo: '',
  observacao: '',
  tipoCusto: 'GERAL',
  tipoColaborador: 'CLT',
  salarioBase: '',
  calcularEncargos: true,
  valorDiaria: '',
  quantidade: '',
  dias: ''
}

// O modo colaborador/motoboy só vale dentro dos grupos especiais
function ehColaboradorForm(form) {
  return GRUPOS_ESPECIAIS.includes(form.tipo) && form.tipoCusto === 'COLABORADOR'
}
function encargosAtivosForm(form) {
  return ehColaboradorForm(form) && form.tipoColaborador === 'CLT' && form.calcularEncargos
}
function diaristaForm(form) {
  return ehColaboradorForm(form) && form.tipoColaborador === 'DIARISTA'
}

function validateFixo(form) {
  if (!form.nome || !form.nome.trim()) return 'nome é obrigatório'
  if (encargosAtivosForm(form)) {
    const s = Number(form.salarioBase)
    if (form.salarioBase === '' || !Number.isFinite(s) || s <= 0) {
      return 'salário base é obrigatório e deve ser maior que zero'
    }
    return null
  }
  if (diaristaForm(form)) {
    if (totalDiarista(form) === null) {
      return 'valor da diária, quantidade e dias são obrigatórios e maiores que zero'
    }
    return null
  }
  const v = Number(form.valorMensal)
  if (form.valorMensal === '' || !Number.isFinite(v)) {
    return 'valor mensal é obrigatório e deve ser numérico'
  }
  if (v < 0) return 'valor mensal deve ser maior ou igual a zero'
  return null
}

function payloadFixo(form) {
  const colaborador = ehColaboradorForm(form)
  const encargos = encargosAtivosForm(form)
  const diarista = diaristaForm(form)
  return {
    nome: form.nome.trim(),
    // Com cálculo automático (encargos ou diária) o backend recalcula e grava
    // o total; o valor enviado aqui é só o espelho do preview
    valorMensal: encargos
      ? Number((encargosClt(form.salarioBase)?.total ?? 0).toFixed(2))
      : diarista
      ? Number((totalDiarista(form) ?? 0).toFixed(2))
      : Number(form.valorMensal),
    tipo: form.tipo.trim() === '' ? null : form.tipo.trim(),
    observacao: form.observacao.trim() === '' ? null : form.observacao.trim(),
    tipoCusto: colaborador ? 'COLABORADOR' : 'GERAL',
    tipoColaborador: colaborador ? form.tipoColaborador : null,
    salarioBase: colaborador && form.salarioBase !== '' ? Number(form.salarioBase) : null,
    calcularEncargos: encargos,
    valorDiaria: diarista ? Number(form.valorDiaria) : null,
    quantidade: diarista ? Number(form.quantidade) : null,
    dias: diarista ? Number(form.dias) : null
  }
}

// ===== Custos variáveis =====

const CATEGORIAS_VARIAVEL = [
  { value: 'TAXA_CARTAO',  label: 'Taxa de Cartão' },
  { value: 'MARKETPLACE',  label: 'Marketplace' },
  { value: 'EMBALAGEM',    label: 'Embalagem' },
  { value: 'ENTREGA',      label: 'Entrega' },
  { value: 'IMPOSTO',      label: 'Imposto' },
  { value: 'CUPOM',        label: 'Cupom' },
  { value: 'COMISSAO',     label: 'Comissão' },
  { value: 'OUTROS',       label: 'Outros' }
]
const CATEGORIA_VARIAVEL_LABEL = Object.fromEntries(
  CATEGORIAS_VARIAVEL.map((c) => [c.value, c.label])
)

const TIPOS_CALCULO = [
  { value: 'PERCENTUAL_FATURAMENTO',     label: '% do faturamento' },
  { value: 'VALOR_POR_PEDIDO',           label: 'Valor por pedido' },
  { value: 'VALOR_FIXO_MENSAL_VARIAVEL', label: 'Valor fixo mensal' }
]
const TIPO_CALCULO_LABEL = Object.fromEntries(TIPOS_CALCULO.map((t) => [t.value, t.label]))

const GRUPOS_VARIAVEL = [
  {
    tipo: 'PERCENTUAL_FATURAMENTO',
    titulo: 'Percentual do faturamento',
    hint: 'Impostos, taxas de cartão, comissões e royalties.'
  },
  {
    tipo: 'VALOR_POR_PEDIDO',
    titulo: 'Por pedido',
    hint: 'Embalagem média, motoboy e taxas operacionais por pedido.'
  },
  {
    tipo: 'VALOR_FIXO_MENSAL_VARIAVEL',
    titulo: 'Valor fixo mensal',
    hint: 'Custos variáveis lançados como valor fechado no mês.'
  }
]

function formatValorVariavel(valor, tipoCalculo) {
  const v = Number(valor)
  if (!Number.isFinite(v)) return '—'
  if (tipoCalculo === 'PERCENTUAL_FATURAMENTO') return pct(v)
  if (tipoCalculo === 'VALOR_POR_PEDIDO') return `${brl(v)} / pedido`
  if (tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL') return `${brl(v)} / mês`
  return brl(v)
}

const VARIAVEL_BLANK = { nome: '', categoria: '', tipoCalculo: '', valor: '' }

function validateVariavel({ nome, categoria, tipoCalculo, valor }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  if (!categoria || !CATEGORIA_VARIAVEL_LABEL[categoria]) return 'categoria é obrigatória'
  if (!tipoCalculo || !TIPO_CALCULO_LABEL[tipoCalculo]) return 'tipo de cálculo é obrigatório'
  const v = Number(valor)
  if (valor === '' || !Number.isFinite(v)) return 'valor é obrigatório e deve ser numérico'
  if (v < 0) return 'valor deve ser maior ou igual a zero'
  return null
}

function payloadVariavel(form) {
  return {
    nome: form.nome.trim(),
    categoria: form.categoria,
    tipoCalculo: form.tipoCalculo,
    valor: Number(form.valor)
  }
}

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }
const btnCompactStyle = { padding: '5px 10px', fontSize: 12 }
const sectionHintStyle = { fontSize: 12.5, color: '#999', margin: '-4px 0 12px' }

// Select padronizado de categoria do custo fixo: exatamente os grupos da grade
// (valores legados são pré-mapeados em startEditFixo, então nunca chegam aqui)
function CategoriaFixoSelect({ value, onChange, style }) {
  return (
    <select className="form-input" style={style} value={value} onChange={onChange}>
      <option value="">— selecione —</option>
      {GRUPOS_FIXOS_PADRAO.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )
}

export default function Custos() {
  const [fixos, setFixos] = useState([])
  const [variaveis, setVariaveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Abas da página: Lançamentos (cadastro atual) e Análise (visão gerencial)
  const [aba, setAba] = useState('LANCAMENTOS')
  // Faturamento do mês corrente para a Análise (falha vira lista vazia para
  // nunca derrubar a tela de custos por causa de um indicador)
  const [faturamentoMes, setFaturamentoMes] = useState([])

  // Criação (modais)
  const [fixoModalOpen, setFixoModalOpen] = useState(false)
  const [fixoForm, setFixoForm] = useState(FIXO_BLANK)
  const [fixoError, setFixoError] = useState(null)
  const [fixoSaving, setFixoSaving] = useState(false)

  const [varModalOpen, setVarModalOpen] = useState(false)
  const [varForm, setVarForm] = useState(VARIAVEL_BLANK)
  const [varError, setVarError] = useState(null)
  const [varSaving, setVarSaving] = useState(false)

  // Edição inline
  const [editFixoId, setEditFixoId] = useState(null)
  const [editFixoForm, setEditFixoForm] = useState(FIXO_BLANK)
  const [editFixoError, setEditFixoError] = useState(null)
  const [editFixoSaving, setEditFixoSaving] = useState(false)

  const [editVarId, setEditVarId] = useState(null)
  const [editVarForm, setEditVarForm] = useState(VARIAVEL_BLANK)
  const [editVarError, setEditVarError] = useState(null)
  const [editVarSaving, setEditVarSaving] = useState(false)

  // Exclusão (lógica) com ConfirmDialog padrão — sem window.confirm/alert
  const [fixoParaExcluir, setFixoParaExcluir] = useState(null)
  const [excluindoFixo, setExcluindoFixo] = useState(false)
  const [varParaExcluir, setVarParaExcluir] = useState(null)
  const [excluindoVar, setExcluindoVar] = useState(false)
  

  function fetchFaturamentoMes() {
    return api
      .get('/faturamento', { params: { mes: mesAtualYM() } })
      .catch(() => ({ data: [] }))
  }

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([api.get('/custos-fixos'), api.get('/custos-variaveis'), fetchFaturamentoMes()])
      .then(([fixosRes, variaveisRes, fatRes]) => {
        setFixos(fixosRes.data)
        setVariaveis(variaveisRes.data)
        setFaturamentoMes(Array.isArray(fatRes.data) ? fatRes.data : [])
        setLoading(false)
      })
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

  // Recarrega as listas sem o loading de página inteira
  function refresh() {
    return Promise.all([api.get('/custos-fixos'), api.get('/custos-variaveis'), fetchFaturamentoMes()])
      .then(([fixosRes, variaveisRes, fatRes]) => {
        setFixos(fixosRes.data)
        setVariaveis(variaveisRes.data)
        setFaturamentoMes(Array.isArray(fatRes.data) ? fatRes.data : [])
      })
  }

  useEffect(() => { load() }, [])

  // ===== Custos fixos: criar / editar / desativar =====

  // Criação contextual: o "+ Novo custo" de cada bloco abre o modal já com a
  // categoria aplicada (sem campo de categoria/observação no formulário).
  // Grupos especiais entram direto no modo colaborador/motoboy.
  function openFixoModal(categoria = '') {
    setFixoForm({
      ...FIXO_BLANK,
      tipo: categoria,
      tipoCusto: GRUPOS_ESPECIAIS.includes(categoria) ? 'COLABORADOR' : 'GERAL'
    })
    setFixoError(null)
    setFixoModalOpen(true)
  }

  function handleCreateFixo(e) {
    e.preventDefault()
    const err = validateFixo(fixoForm)
    if (err) { setFixoError(err); return }
    setFixoError(null)
    setFixoSaving(true)
    api
      .post('/custos-fixos', payloadFixo(fixoForm))
      .then(() => {
        setFixoModalOpen(false)
        setToast({ message: 'Custo fixo criado com sucesso.', type: 'success' })
        return refresh()
      })
      .catch((e) =>
        setFixoError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setFixoSaving(false))
  }

  function startEditFixo(c) {
    setEditFixoId(c.id)
    setEditFixoForm({
      nome: c.nome,
      valorMensal: String(Number(c.valorMensal)),
      // Categoria legada vem pré-mapeada para o grupo padronizado: salvar a
      // edição normaliza o dado sem migration
      tipo: (c.tipo ?? '').trim() === '' ? '' : categoriaCanonicaFixo(c.tipo),
      observacao: c.observacao ?? '',
      tipoCusto: c.tipoCusto === 'COLABORADOR' ? 'COLABORADOR' : 'GERAL',
      tipoColaborador: c.tipoColaborador ?? 'CLT',
      salarioBase:
        c.salarioBase === null || c.salarioBase === undefined
          ? ''
          : String(Number(c.salarioBase)),
      calcularEncargos: !!c.calcularEncargos,
      valorDiaria:
        c.valorDiaria === null || c.valorDiaria === undefined ? '' : String(Number(c.valorDiaria)),
      quantidade:
        c.quantidade === null || c.quantidade === undefined ? '' : String(Number(c.quantidade)),
      dias: c.dias === null || c.dias === undefined ? '' : String(Number(c.dias))
    })
    setEditFixoError(null)
  }
  function cancelEditFixo() {
    setEditFixoId(null)
    setEditFixoForm(FIXO_BLANK)
    setEditFixoError(null)
  }
  function saveEditFixo() {
    const err = validateFixo(editFixoForm)
    if (err) { setEditFixoError(err); return }
    setEditFixoError(null)
    setEditFixoSaving(true)
    api
      .put(`/custos-fixos/${editFixoId}`, payloadFixo(editFixoForm))
      .then(() => {
        cancelEditFixo()
        return refresh()
      })
      .catch((e) =>
        setEditFixoError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditFixoSaving(false))
  }

  function handleDeleteFixo(c) {
    setFixoParaExcluir(c)
  }

  function confirmExcluirFixo() {
    const c = fixoParaExcluir
    if (!c) return
    setExcluindoFixo(true)
    api
      .delete(`/custos-fixos/${c.id}`)
      .then(() => {
        setToast({ message: 'Custo fixo excluído com sucesso.', type: 'success' })
        return refresh()
      })
      .catch((e) =>
        setToast({ message: e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir custo fixo.', type: 'error' })
      )
      .finally(() => {
        setExcluindoFixo(false)
        setFixoParaExcluir(null)
      })
  }

  // ===== Custos variáveis: criar / editar / desativar =====

  // Idem para variáveis: o bloco define o tipo de cálculo; a categoria interna
  // entra como OUTROS (ajustável depois pela edição, que mantém o select)
  function openVarModal(tipoCalculo = '') {
    setVarForm({ ...VARIAVEL_BLANK, tipoCalculo, categoria: 'OUTROS' })
    setVarError(null)
    setVarModalOpen(true)
  }

  function handleCreateVar(e) {
    e.preventDefault()
    const err = validateVariavel(varForm)
    if (err) { setVarError(err); return }
    setVarError(null)
    setVarSaving(true)
    api
      .post('/custos-variaveis', payloadVariavel(varForm))
      .then(() => {
        setVarModalOpen(false)
        setToast({ message: 'Custo variável criado com sucesso.', type: 'success' })
        return refresh()
      })
      .catch((e) =>
        setVarError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setVarSaving(false))
  }

  function startEditVar(c) {
    setEditVarId(c.id)
    setEditVarForm({
      nome: c.nome,
      categoria: c.categoria,
      tipoCalculo: c.tipoCalculo,
      valor: String(Number(c.valor))
    })
    setEditVarError(null)
  }
  function cancelEditVar() {
    setEditVarId(null)
    setEditVarForm(VARIAVEL_BLANK)
    setEditVarError(null)
  }
  function saveEditVar() {
    const err = validateVariavel(editVarForm)
    if (err) { setEditVarError(err); return }
    setEditVarError(null)
    setEditVarSaving(true)
    api
      .put(`/custos-variaveis/${editVarId}`, payloadVariavel(editVarForm))
      .then(() => {
        cancelEditVar()
        return refresh()
      })
      .catch((e) =>
        setEditVarError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditVarSaving(false))
  }

  function handleDeleteVar(c) {
    setVarParaExcluir(c)
  }

  function confirmExcluirVar() {
    const c = varParaExcluir
    if (!c) return
    setExcluindoVar(true)
    api
      .delete(`/custos-variaveis/${c.id}`)
      .then(() => {
        setToast({ message: 'Custo variável excluído com sucesso.', type: 'success' })
        return refresh()
      })
      .catch((e) =>
        setToast({ message: e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir custo variável.', type: 'error' })
      )
      .finally(() => {
        setExcluindoVar(false)
        setVarParaExcluir(null)
      })
  }

  if (loading) return <div className="loading-state">Carregando custos…</div>

  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os custos</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={load}>
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Resumo (somas simples das listas já carregadas)
  const totalCustosFixos = fixos.reduce((s, c) => s + Number(c.valorMensal), 0)
  const totalVariaveisPercentuais = variaveis
    .filter((c) => c.tipoCalculo === 'PERCENTUAL_FATURAMENTO')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalVariaveisPorPedido = variaveis
    .filter((c) => c.tipoCalculo === 'VALOR_POR_PEDIDO')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalVariaveisFixoMensal = variaveis
    .filter((c) => c.tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalGeralEstimado = totalCustosFixos + totalVariaveisFixoMensal

  // ===== Custos fixos agrupados pelos grupos padronizados (ordem fixa) =====
  // Sem regra nova no backend: categorias legadas e itens sem categoria são
  // mapeados via categoriaCanonicaFixo; todos os 8 grupos aparecem na grade,
  // mesmo vazios
  const gruposFixos = GRUPOS_FIXOS_PADRAO.map((categoria) => {
    const itens = fixos.filter((c) => categoriaCanonicaFixo(c.tipo) === categoria)
    return {
      categoria,
      itens,
      subtotal: itens.reduce((s, c) => s + Number(c.valorMensal), 0)
    }
  })
  const gruposComItens = gruposFixos.filter((g) => g.itens.length > 0)
  const maiorGrupoFixo = gruposComItens.reduce(
    (m, g) => (m === null || g.subtotal > m.subtotal ? g : m),
    null
  )

  // Subtotal de um grupo de custos variáveis, na unidade do grupo
  function subtotalGrupoVariavel(tipo, itens) {
    const s = itens.reduce((x, c) => x + Number(c.valor), 0)
    if (tipo === 'PERCENTUAL_FATURAMENTO') return pct(s)
    if (tipo === 'VALOR_POR_PEDIDO') return `${brl(s)} / pedido`
    return `${brl(s)} / mês`
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Custos</h1>
          <div className="page-header-sub">
            {aba === 'ANALISE'
              ? 'Indicadores e alertas gerenciais calculados a partir dos custos cadastrados.'
              : 'Organize os custos fixos por categoria e os variáveis por tipo de cálculo.'}
          </div>
        </div>
      </div>

      {/* Separação cadastro × análise: a aba Lançamentos mantém a tela atual */}
      <div className="modal-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={'modal-tab' + (aba === 'LANCAMENTOS' ? ' active' : '')}
          onClick={() => setAba('LANCAMENTOS')}
        >
          Lançamentos
        </button>
        <button
          type="button"
          className={'modal-tab' + (aba === 'ANALISE' ? ' active' : '')}
          onClick={() => setAba('ANALISE')}
        >
          Análise
        </button>
      </div>

      {/* Feedback flutuante (posição fixa, visível em qualquer rolagem) —
          substitui o banner inline que ficava no topo do documento */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confirmação de exclusão (lógica): mesmo endpoint, histórico preservado */}
      <ConfirmDialog
        open={fixoParaExcluir !== null}
        title="Excluir custo fixo?"
        message={fixoParaExcluir ? `Você está prestes a excluir “${fixoParaExcluir.nome}”.` : ''}
        description="Este custo não entrará mais nos cálculos mensais, mas o histórico será preservado."
        confirmLabel="Excluir custo fixo"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindoFixo}
        onConfirm={confirmExcluirFixo}
        onCancel={() => setFixoParaExcluir(null)}
      />
      <ConfirmDialog
        open={varParaExcluir !== null}
        title="Excluir custo variável?"
        message={varParaExcluir ? `Você está prestes a excluir “${varParaExcluir.nome}”.` : ''}
        description="Este custo não entrará mais nos cálculos ativos, mas o histórico será preservado."
        confirmLabel="Excluir custo variável"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindoVar}
        onConfirm={confirmExcluirVar}
        onCancel={() => setVarParaExcluir(null)}
      />

      {/* Modal: novo custo fixo */}
      {fixoModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {fixoForm.tipo === 'Colaboradores'
                ? 'Novo colaborador'
                : fixoForm.tipo === 'Motoboys'
                ? 'Novo motoboy'
                : `Novo custo — ${fixoForm.tipo || 'Custo fixo'}`}
            </div>
            <form onSubmit={handleCreateFixo}>
              {/* Fluxo contextual: a categoria do bloco já vem aplicada — sem
                  campo de categoria nem observação no cadastro */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={fixoForm.nome}
                  onChange={(e) => setFixoForm({ ...fixoForm, nome: e.target.value })}
                  placeholder={
                    ehColaboradorForm(fixoForm) ? 'Nome do colaborador' : 'Ex.: Aluguel da loja'
                  }
                  autoFocus
                />
              </div>

              {!ehColaboradorForm(fixoForm) && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valor mensal (R$)</label>
                  <InputMoeda
                    className="form-input"
                    valor={fixoForm.valorMensal}
                    onChange={(v) => setFixoForm({ ...fixoForm, valorMensal: v })}
                    placeholder="0,00"
                  />
                </div>
              )}

              {ehColaboradorForm(fixoForm) && (
                <>
                  <div className="form-grid-2" style={{ marginBottom: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        {fixoForm.tipo === 'Motoboys' ? 'Tipo de motoboy' : 'Tipo de colaborador'}
                      </label>
                      <select
                        className="form-input"
                        value={fixoForm.tipoColaborador}
                        onChange={(e) => setFixoForm({ ...fixoForm, tipoColaborador: e.target.value })}
                      >
                        {tiposPessoaDoGrupo(fixoForm.tipo).map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    {fixoForm.tipoColaborador === 'CLT' ? (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Salário base (R$)</label>
                        <InputMoeda
                          className="form-input"
                          valor={fixoForm.salarioBase}
                          onChange={(v) => setFixoForm({ ...fixoForm, salarioBase: v })}
                          placeholder="0,00"
                        />
                      </div>
                    ) : fixoForm.tipoColaborador === 'DIARISTA' ? (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Valor da diária (R$)</label>
                        <InputMoeda
                          className="form-input"
                          valor={fixoForm.valorDiaria}
                          onChange={(v) => setFixoForm({ ...fixoForm, valorDiaria: v })}
                          placeholder="0,00"
                        />
                      </div>
                    ) : (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Valor mensal (R$)</label>
                        <InputMoeda
                          className="form-input"
                          valor={fixoForm.valorMensal}
                          onChange={(v) => setFixoForm({ ...fixoForm, valorMensal: v })}
                          placeholder="0,00"
                        />
                      </div>
                    )}
                  </div>

                  {fixoForm.tipoColaborador === 'DIARISTA' && (
                    <>
                      <div className="form-grid-2" style={{ marginBottom: 12 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Quantidade</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.5"
                            value={fixoForm.quantidade}
                            onChange={(e) => setFixoForm({ ...fixoForm, quantidade: e.target.value })}
                            placeholder="Ex.: 2"
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Dias</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.5"
                            value={fixoForm.dias}
                            onChange={(e) => setFixoForm({ ...fixoForm, dias: e.target.value })}
                            placeholder="Ex.: 8"
                          />
                        </div>
                      </div>
                      {totalDiarista(fixoForm) !== null && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            background: 'var(--app-surface-2)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            marginBottom: 12,
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--app-text)'
                          }}
                        >
                          <span>Total mensal (diária × qtd. × dias)</span>
                          <span className="clr-orange">{brl(totalDiarista(fixoForm))}</span>
                        </div>
                      )}
                    </>
                  )}

                  {fixoForm.tipoColaborador === 'CLT' && (
                    <>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          color: 'var(--app-text-2)',
                          marginBottom: 12,
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={fixoForm.calcularEncargos}
                          onChange={(e) =>
                            setFixoForm({ ...fixoForm, calcularEncargos: e.target.checked })
                          }
                        />
                        Calcular encargos automaticamente (13º, férias e FGTS)
                      </label>
                      {encargosAtivosForm(fixoForm) ? (
                        (() => {
                          const prev = encargosClt(fixoForm.salarioBase)
                          return prev ? (
                            <div
                              style={{
                                background: 'var(--app-surface-2)',
                                borderRadius: 8,
                                padding: '10px 12px',
                                marginBottom: 12,
                                fontSize: 12.5,
                                color: 'var(--app-text-2)'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>13º mensal</span><span>{brl(prev.decimo)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>Férias mensal (com 1/3)</span><span>{brl(prev.ferias)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>FGTS (8%)</span><span>{brl(prev.fgts)}</span>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '4px 0 0',
                                  marginTop: 4,
                                  borderTop: '1px solid #eee',
                                  fontWeight: 600,
                                  color: 'var(--app-text)'
                                }}
                              >
                                <span>Total mensal</span><span className="clr-orange">{brl(prev.total)}</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                                Estimativa gerencial — o total vira o valor mensal deste custo.
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>
                              Informe o salário base para ver os encargos calculados.
                            </div>
                          )
                        })()
                      ) : (
                        <div className="form-group" style={{ marginBottom: 12 }}>
                          <label className="form-label">Valor mensal (R$)</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={fixoForm.valorMensal}
                            onChange={(e) => setFixoForm({ ...fixoForm, valorMensal: e.target.value })}
                            placeholder="0,00"
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {fixoError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{fixoError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFixoModalOpen(false)}
                  disabled={fixoSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={fixoSaving}>
                  {fixoSaving ? 'Salvando…' : 'Salvar custo fixo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: novo custo variável */}
      {varModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              Novo custo — {TIPO_CALCULO_LABEL[varForm.tipoCalculo] ?? 'Custo variável'}
            </div>
            <form onSubmit={handleCreateVar}>
              {/* Fluxo contextual: o tipo de cálculo do bloco já vem aplicado —
                  sem campo de categoria no cadastro (ajustável na edição) */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={varForm.nome}
                  onChange={(e) => setVarForm({ ...varForm, nome: e.target.value })}
                  placeholder="Ex.: Taxa de cartão crédito"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Valor {varForm.tipoCalculo === 'PERCENTUAL_FATURAMENTO' ? '(%)' : '(R$)'}
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={varForm.valor}
                  onChange={(e) => setVarForm({ ...varForm, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              {varError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{varError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVarModalOpen(false)}
                  disabled={varSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={varSaving}>
                  {varSaving ? 'Salvando…' : 'Salvar custo variável'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {aba === 'ANALISE' && (
        <AnaliseCustos
          fixos={fixos}
          variaveis={variaveis}
          gruposComItens={gruposComItens}
          maiorGrupoFixo={maiorGrupoFixo}
          totalCustosFixos={totalCustosFixos}
          totalVariaveisPercentuais={totalVariaveisPercentuais}
          totalVariaveisPorPedido={totalVariaveisPorPedido}
          totalVariaveisFixoMensal={totalVariaveisFixoMensal}
          faturamentoMes={faturamentoMes}
        />
      )}

      {aba === 'LANCAMENTOS' && (
      <>
      {/* Resumo */}
      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card
          title="Custos Fixos Totais"
          value={brl(totalCustosFixos)}
          hint={`${fixos.length} custo${fixos.length === 1 ? '' : 's'} em ${gruposComItens.length} grupo${gruposComItens.length === 1 ? '' : 's'}`}
          variant="brand"
        />
        <Card
          title="Custos Variáveis Totais"
          value={brl(totalVariaveisFixoMensal)}
          hint={`Fixo mensal variável · + ${pct(totalVariaveisPercentuais)} do faturamento e ${brl(totalVariaveisPorPedido)} por pedido`}
          variant="info"
        />
        <Card
          title="Total Geral Mensal Estimado"
          value={brl(totalGeralEstimado)}
          hint="Fixos + variáveis de valor fixo mensal (não inclui % do faturamento nem por pedido)"
        />
        <Card
          title="Maior Grupo de Custo Fixo"
          value={maiorGrupoFixo ? maiorGrupoFixo.categoria : '—'}
          hint={
            maiorGrupoFixo
              ? `${brl(maiorGrupoFixo.subtotal)} · ${maiorGrupoFixo.itens.length} ${maiorGrupoFixo.itens.length === 1 ? 'item' : 'itens'}`
              : 'Nenhum custo fixo cadastrado'
          }
          variant="info"
        />
      </div>

      {/* Seção 1 — Custos fixos */}
      <div className="section-title">Custos Fixos</div>
      <div style={sectionHintStyle}>
        Custos que acontecem todos os meses, mesmo que o volume de vendas mude.
      </div>

      {/* Grade de grupos: 2 blocos por linha no desktop, 1 no mobile (grid-2).
          Todos os grupos padronizados aparecem, mesmo vazios. */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {gruposFixos.map((grupo) => (
          <div key={grupo.categoria} className="card" style={{ padding: '14px 16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 6
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-2)' }}>
                  {grupo.categoria}
                </span>
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  {grupo.itens.length} {grupo.itens.length === 1 ? 'item' : 'itens'}
                </span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }} className="clr-orange">
                {brl(grupo.subtotal)}
              </span>
            </div>

            {grupo.itens.length === 0 ? (
              <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0 4px' }}>
                Nenhum custo neste grupo ainda.
              </div>
            ) : (
              grupo.itens.map((c) => {
                const isEditing = editFixoId === c.id
                if (isEditing) {
                  return (
                    <div
                      key={c.id}
                      style={{ background: 'var(--app-highlight)', borderRadius: 8, padding: 10, margin: '6px 0' }}
                    >
                      <div className="form-grid-2" style={{ marginBottom: 8 }}>
                        <input className="form-input" style={cellInputStyle}
                          value={editFixoForm.nome}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, nome: e.target.value })}
                          placeholder="Nome"
                          autoFocus />
                        {encargosAtivosForm(editFixoForm) ? (
                          <InputMoeda className="form-input" style={cellInputStyle}
                            valor={editFixoForm.salarioBase}
                            onChange={(v) => setEditFixoForm({ ...editFixoForm, salarioBase: v })}
                            placeholder="Salário base" />
                        ) : diaristaForm(editFixoForm) ? (
                          <InputMoeda className="form-input" style={cellInputStyle}
                            valor={editFixoForm.valorDiaria}
                            onChange={(v) => setEditFixoForm({ ...editFixoForm, valorDiaria: v })}
                            placeholder="Valor da diária" />
                        ) : (
                          <InputMoeda className="form-input" style={cellInputStyle}
                            valor={editFixoForm.valorMensal}
                            onChange={(v) => setEditFixoForm({ ...editFixoForm, valorMensal: v })}
                            placeholder="Valor mensal" />
                        )}
                      </div>
                      <div className="form-grid-2" style={{ marginBottom: 8 }}>
                        <CategoriaFixoSelect
                          style={cellInputStyle}
                          value={editFixoForm.tipo}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, tipo: e.target.value })}
                        />
                        <input className="form-input" style={cellInputStyle}
                          value={editFixoForm.observacao}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, observacao: e.target.value })}
                          placeholder="Observação (opcional)" />
                      </div>
                      {GRUPOS_ESPECIAIS.includes(editFixoForm.tipo) && (
                        <div className="form-grid-2" style={{ marginBottom: 8 }}>
                          <select className="form-input" style={cellInputStyle}
                            value={editFixoForm.tipoCusto}
                            onChange={(e) => setEditFixoForm({ ...editFixoForm, tipoCusto: e.target.value })}>
                            <option value="GERAL">Custo comum</option>
                            <option value="COLABORADOR">
                              {editFixoForm.tipo === 'Motoboys' ? 'Motoboy' : 'Colaborador'}
                            </option>
                          </select>
                          {editFixoForm.tipoCusto === 'COLABORADOR' ? (
                            <select className="form-input" style={cellInputStyle}
                              value={editFixoForm.tipoColaborador}
                              onChange={(e) => setEditFixoForm({ ...editFixoForm, tipoColaborador: e.target.value })}>
                              {tiposPessoaDoGrupo(editFixoForm.tipo).map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span />
                          )}
                        </div>
                      )}
                      {diaristaForm(editFixoForm) && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            marginBottom: 8,
                            flexWrap: 'wrap'
                          }}
                        >
                          <input className="form-input" style={{ ...cellInputStyle, width: 100 }}
                            type="number" min="0" step="0.5"
                            value={editFixoForm.quantidade}
                            onChange={(e) => setEditFixoForm({ ...editFixoForm, quantidade: e.target.value })}
                            placeholder="Qtd." />
                          <input className="form-input" style={{ ...cellInputStyle, width: 100 }}
                            type="number" min="0" step="0.5"
                            value={editFixoForm.dias}
                            onChange={(e) => setEditFixoForm({ ...editFixoForm, dias: e.target.value })}
                            placeholder="Dias" />
                          {totalDiarista(editFixoForm) !== null && (
                            <span style={{ fontSize: 12, fontWeight: 600 }} className="clr-orange">
                              Total: {brl(totalDiarista(editFixoForm))}
                            </span>
                          )}
                        </div>
                      )}
                      {ehColaboradorForm(editFixoForm) && editFixoForm.tipoColaborador === 'CLT' && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 8,
                            flexWrap: 'wrap'
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--app-text-2)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={editFixoForm.calcularEncargos}
                              onChange={(e) =>
                                setEditFixoForm({ ...editFixoForm, calcularEncargos: e.target.checked })
                              }
                            />
                            Calcular encargos
                          </label>
                          {encargosAtivosForm(editFixoForm) && encargosClt(editFixoForm.salarioBase) && (
                            <span style={{ fontSize: 12, fontWeight: 600 }} className="clr-orange">
                              Total: {brl(encargosClt(editFixoForm.salarioBase).total)}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                          onClick={cancelEditFixo} disabled={editFixoSaving}>
                          Cancelar
                        </button>
                        <button type="button" className="btn btn-primary" style={btnCompactStyle}
                          onClick={saveEditFixo} disabled={editFixoSaving}>
                          {editFixoSaving ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 0',
                      borderBottom: '1px solid #f5f5f5'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--app-text)' }}>{c.nome}</div>
                      {/* Linha secundária compacta: CLT mostra base + provisões;
                          diarista mostra diária × qtd × dias; PJ/demais o tipo */}
                      {c.tipoCusto === 'COLABORADOR' && c.calcularEncargos && encargosClt(c.salarioBase) ? (
                        (() => {
                          const e = encargosClt(c.salarioBase)
                          return (
                            <div style={{ fontSize: 11, color: '#aaa' }}>
                              Base {brl(Number(c.salarioBase))} · 13º {brl(e.decimo)} · Férias {brl(e.ferias)} · FGTS {brl(e.fgts)}
                            </div>
                          )
                        })()
                      ) : c.tipoCusto === 'COLABORADOR' && c.tipoColaborador === 'DIARISTA' && c.valorDiaria ? (
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          Diária {brl(Number(c.valorDiaria))} · Qtd. {String(Number(c.quantidade ?? 0))} · Dias {String(Number(c.dias ?? 0))}
                        </div>
                      ) : c.tipoCusto === 'COLABORADOR' && c.tipoColaborador ? (
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {{ CLT: 'CLT', FREELANCER: 'Freelancer', PJ: 'PJ', DIARISTA: 'Diarista' }[c.tipoColaborador] ?? 'Colaborador'}
                          {c.observacao ? ` · ${c.observacao}` : ''}
                        </div>
                      ) : c.observacao ? (
                        <div style={{ fontSize: 11, color: '#aaa' }}>{c.observacao}</div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{brl(c.valorMensal)}</span>
                      <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                        onClick={() => startEditFixo(c)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-danger" style={btnCompactStyle}
                        onClick={() => handleDeleteFixo(c)}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            {/* Ação contextual: cria já com a categoria do grupo selecionada */}
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={btnCompactStyle}
                onClick={() => openFixoModal(grupo.categoria)}
              >
                + Novo custo
              </button>
            </div>
          </div>
        ))}
      </div>

      {editFixoError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editFixoError}</div>
        </div>
      )}

      {/* Seção 2 — Custos variáveis */}
      <div className="section-title">Custos Variáveis</div>
      <div style={sectionHintStyle}>
        Custos que variam conforme vendas, pedidos ou faturamento.
      </div>

      {/* Grade de grupos de variáveis: mesmo padrão visual dos custos fixos,
          agrupados por tipo de cálculo; todos os blocos aparecem, mesmo vazios */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {GRUPOS_VARIAVEL.map((grupo) => {
          const itens = variaveis.filter((c) => c.tipoCalculo === grupo.tipo)
          return (
            <div key={grupo.tipo} className="card" style={{ padding: '14px 16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 2
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-2)' }}>
                    {grupo.titulo}
                  </span>
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700 }} className="clr-orange">
                  {subtotalGrupoVariavel(grupo.tipo, itens)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginBottom: 6 }}>{grupo.hint}</div>

              {itens.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0 4px' }}>
                  Nenhum custo neste grupo ainda.
                </div>
              ) : (
                itens.map((c) => {
                  const isEditing = editVarId === c.id
                  if (isEditing) {
                    return (
                      <div
                        key={c.id}
                        style={{ background: 'var(--app-highlight)', borderRadius: 8, padding: 10, margin: '6px 0' }}
                      >
                        <div className="form-grid-2" style={{ marginBottom: 8 }}>
                          <input className="form-input" style={cellInputStyle}
                            value={editVarForm.nome}
                            onChange={(e) => setEditVarForm({ ...editVarForm, nome: e.target.value })}
                            placeholder="Nome"
                            autoFocus />
                          <input className="form-input" style={cellInputStyle}
                            type="number" min="0" step="0.0001"
                            value={editVarForm.valor}
                            onChange={(e) => setEditVarForm({ ...editVarForm, valor: e.target.value })}
                            placeholder="Valor" />
                        </div>
                        <div className="form-grid-2" style={{ marginBottom: 8 }}>
                          <select className="form-input" style={cellInputStyle}
                            value={editVarForm.categoria}
                            onChange={(e) => setEditVarForm({ ...editVarForm, categoria: e.target.value })}>
                            <option value="">— categoria —</option>
                            {CATEGORIAS_VARIAVEL.map((cat) => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                          <select className="form-input" style={cellInputStyle}
                            value={editVarForm.tipoCalculo}
                            onChange={(e) => setEditVarForm({ ...editVarForm, tipoCalculo: e.target.value })}>
                            <option value="">— tipo de cálculo —</option>
                            {TIPOS_CALCULO.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                            onClick={cancelEditVar} disabled={editVarSaving}>
                            Cancelar
                          </button>
                          <button type="button" className="btn btn-primary" style={btnCompactStyle}
                            onClick={saveEditVar} disabled={editVarSaving}>
                            {editVarSaving ? 'Salvando…' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 0',
                        borderBottom: '1px solid #f5f5f5'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--app-text)' }}>{c.nome}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {CATEGORIA_VARIAVEL_LABEL[c.categoria] ?? c.categoria}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {formatValorVariavel(c.valor, c.tipoCalculo)}
                        </span>
                        <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                          onClick={() => startEditVar(c)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-danger" style={btnCompactStyle}
                          onClick={() => handleDeleteVar(c)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  )
                })
              )}

              {/* Ação contextual: cria já com o tipo de cálculo do grupo */}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={btnCompactStyle}
                  onClick={() => openVarModal(grupo.tipo)}
                >
                  + Novo custo
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editVarError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editVarError}</div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

// ============ Aba Análise: visão gerencial dos custos ============
// Tudo derivado dos dados já carregados (custos + faturamento do mês corrente).
// Nenhuma divisão sem guarda: sem pedidos/faturamento os indicadores viram
// estado orientativo, nunca NaN/Infinity.

function AnaliseCustos({
  fixos,
  variaveis,
  gruposComItens,
  maiorGrupoFixo,
  totalCustosFixos,
  totalVariaveisPercentuais,
  totalVariaveisPorPedido,
  totalVariaveisFixoMensal,
  faturamentoMes
}) {
  const temCustos = fixos.length > 0 || variaveis.length > 0

  if (!temCustos) {
    return (
      <div className="card" style={{ padding: '28px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text-2)', marginBottom: 4 }}>
          Cadastre seus custos para visualizar a análise.
        </div>
        <div style={{ fontSize: 12.5, color: '#999' }}>
          Use a aba Lançamentos para registrar custos fixos e variáveis.
        </div>
      </div>
    )
  }

  // Período analisado = mês corrente (mesmo padrão da tela de Faturamento)
  const faturamentoPeriodo = faturamentoMes.reduce((s, r) => s + Number(r.valorTotal ?? 0), 0)
  const totalPedidosPeriodo = faturamentoMes.reduce(
    (s, r) => s + Number(r.quantidadePedidos ?? 0),
    0
  )
  const temFaturamento = faturamentoPeriodo > 0
  const temPedidos = totalPedidosPeriodo > 0

  // custoFixoDiario = custoFixoMensal / 30 (também é a meta mínima diária
  // de faturamento para cobrir a estrutura fixa)
  const custoFixoDiario = totalCustosFixos / 30
  const custoFixoPorPedido = temPedidos ? totalCustosFixos / totalPedidosPeriodo : null
  const percentualFixoSobreFaturamento = temFaturamento
    ? (totalCustosFixos / faturamentoPeriodo) * 100
    : null

  // Custos variáveis estimados no período: fixo mensal + (por pedido × pedidos)
  // + (% × faturamento) — componentes sem dados ficam de fora da estimativa
  const variaveisDePedidos = temPedidos ? totalVariaveisPorPedido * totalPedidosPeriodo : 0
  const variaveisDeFaturamento = temFaturamento
    ? (totalVariaveisPercentuais / 100) * faturamentoPeriodo
    : 0
  const custoVariavelEstimado = totalVariaveisFixoMensal + variaveisDePedidos + variaveisDeFaturamento
  const custoOperacionalEstimado = totalCustosFixos + custoVariavelEstimado
  const operacionalParcial = !temFaturamento || !temPedidos

  // Participação dos grupos sobre o custo fixo total (maior primeiro)
  const participacao = [...gruposComItens]
    .sort((a, b) => b.subtotal - a.subtotal)
    .map((g) => ({
      ...g,
      percentual: totalCustosFixos > 0 ? (g.subtotal / totalCustosFixos) * 100 : 0
    }))

  function percentualDoGrupo(nome) {
    const g = participacao.find((x) => x.categoria === nome)
    return g ? g.percentual : null
  }

  // ===== Alertas gerenciais =====
  const alertas = []
  const pctColaboradores = percentualDoGrupo('Colaboradores')
  if (pctColaboradores !== null && pctColaboradores > 45) {
    alertas.push({
      nivel: 'atencao',
      texto: `Colaboradores representam ${pct1(pctColaboradores)} dos custos fixos. Avalie se a equipe está proporcional ao faturamento.`
    })
  }
  const pctMotoboys = percentualDoGrupo('Motoboys')
  if (pctMotoboys !== null && pctMotoboys > 20) {
    alertas.push({
      nivel: 'atencao',
      texto: `Motoboys representam ${pct1(pctMotoboys)} dos custos fixos. Verifique impacto da logística na operação.`
    })
  }
  const pctMarketing = percentualDoGrupo('Marketing')
  if (pctMarketing !== null && pctMarketing > 10) {
    alertas.push({
      nivel: 'atencao',
      texto: `Marketing representa ${pct1(pctMarketing)} dos custos fixos. Confirme se o investimento está retornando em vendas.`
    })
  }
  if (custoFixoDiario > 0 && !temFaturamento) {
    alertas.push({
      nivel: 'atencao',
      texto: `Você precisa faturar pelo menos ${brl(custoFixoDiario)} por dia apenas para cobrir custos fixos.`
    })
  }
  if (percentualFixoSobreFaturamento !== null && percentualFixoSobreFaturamento > 35) {
    alertas.push({
      nivel: 'atencao',
      texto: `Custos fixos representam ${pct1(percentualFixoSobreFaturamento)} do faturamento. A estrutura pode estar pesada para o volume atual.`
    })
  }
  if (!temFaturamento) {
    alertas.push({
      nivel: 'info',
      texto: 'Cadastre faturamento e pedidos para analisar custo por pedido e peso dos custos sobre as vendas.'
    })
  }

  const ALERTA_CLS = { atencao: 'alert-yellow', info: 'alert-gray' }
  const hintPeriodo = temFaturamento
    ? `Faturamento de ${labelMesAtual()}: ${brl(faturamentoPeriodo)}`
    : `Sem faturamento em ${labelMesAtual()}`

  return (
    <div>
      {/* Cards principais */}
      <div className="section-title">Indicadores principais</div>
      <div className="grid-4">
        <Card
          title="Custo Fixo Mensal"
          value={brl(totalCustosFixos)}
          hint={`${fixos.length} custo${fixos.length === 1 ? '' : 's'} fixo${fixos.length === 1 ? '' : 's'} ativo${fixos.length === 1 ? '' : 's'}`}
          variant="brand"
        />
        <Card
          title="Custo Fixo Diário"
          value={brl(custoFixoDiario)}
          hint="Custo fixo mensal ÷ 30 dias"
          variant="info"
        />
        <Card
          title="Maior Grupo de Custo Fixo"
          value={maiorGrupoFixo ? maiorGrupoFixo.categoria : '—'}
          hint={
            maiorGrupoFixo && totalCustosFixos > 0
              ? `${brl(maiorGrupoFixo.subtotal)} · ${pct1((maiorGrupoFixo.subtotal / totalCustosFixos) * 100)} do custo fixo`
              : 'Nenhum custo fixo cadastrado'
          }
          variant="info"
        />
        <Card
          title="Custo Fixo por Pedido"
          value={custoFixoPorPedido === null ? '—' : brl(custoFixoPorPedido)}
          hint={
            custoFixoPorPedido === null
              ? 'Cadastre faturamento e pedidos para calcular custo fixo por pedido.'
              : `${totalPedidosPeriodo} pedido${totalPedidosPeriodo === 1 ? '' : 's'} em ${labelMesAtual()}`
          }
          variant={custoFixoPorPedido === null ? 'warn' : 'info'}
        />
      </div>

      {/* Cards secundários */}
      <div className="grid-4" style={{ marginTop: 4 }}>
        <Card
          title="Meta Diária de Faturamento"
          value={brl(custoFixoDiario)}
          hint="Faturamento mínimo por dia para cobrir a estrutura fixa"
        />
        <Card
          title="Custo Fixo sobre Faturamento"
          value={percentualFixoSobreFaturamento === null ? '—' : pct1(percentualFixoSobreFaturamento)}
          hint={hintPeriodo}
          variant={
            percentualFixoSobreFaturamento === null
              ? 'warn'
              : percentualFixoSobreFaturamento > 35
              ? 'danger'
              : 'success'
          }
        />
        <Card
          title="Custos Variáveis Estimados"
          value={brl(custoVariavelEstimado)}
          hint={`${pct1(totalVariaveisPercentuais)} do faturamento · ${brl(totalVariaveisPorPedido)} por pedido · ${brl(totalVariaveisFixoMensal)} fixo mensal`}
        />
        <Card
          title="Custo Operacional Estimado"
          value={brl(custoOperacionalEstimado)}
          hint={
            operacionalParcial
              ? 'Cálculo parcial — sem faturamento/pedidos, considera apenas fixos + variáveis de valor mensal.'
              : `Fixos + variáveis estimados de ${labelMesAtual()}`
          }
          variant={operacionalParcial ? 'warn' : 'info'}
        />
      </div>

      {/* Participação por grupo */}
      <div className="section-title">Participação por grupo de custo fixo</div>
      <div className="card" style={{ padding: '16px 18px' }}>
        {participacao.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#bbb' }}>
            Nenhum custo fixo cadastrado ainda.
          </div>
        ) : (
          participacao.map((g) => (
            <div key={g.categoria} style={{ padding: '8px 0' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 5
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-2)' }}>
                  {g.categoria}
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                    {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                  </span>
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--app-text-2)' }}>
                  <strong>{brl(g.subtotal)}</strong> · {pct1(g.percentual)}
                </span>
              </div>
              <div className="particip-bar-track">
                <div
                  className="particip-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, g.percentual))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alertas gerenciais */}
      <div className="section-title">Alertas gerenciais</div>
      {alertas.length === 0 ? (
        <div className="alert alert-green">
          <div className="alert-msg clr-green">
            Nenhum alerta relevante encontrado com os dados atuais.
          </div>
        </div>
      ) : (
        alertas.map((a) => (
          <div key={a.texto} className={`alert ${ALERTA_CLS[a.nivel] ?? 'alert-gray'}`}>
            <div className="alert-msg">{a.texto}</div>
          </div>
        ))
      )}
    </div>
  )
}
