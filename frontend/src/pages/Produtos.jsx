import { useEffect, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import InsumoAutocomplete from '../components/InsumoAutocomplete'
import { mascaraMoeda, parseMoeda } from '../utils/moeda'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const numberFormatter = new Intl.NumberFormat('pt-BR')
const qtyFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}
function int(value) {
  if (value === null || value === undefined) return '—'
  return numberFormatter.format(Number(value))
}
function num(value) {
  if (value === null || value === undefined) return '—'
  return qtyFormatter.format(Number(value))
}

// Unidades padronizadas: Kg (custo por kg, quantidades da ficha em gramas),
// L (custo por litro, quantidades em ml) e Und (por unidade)
function unidadeNormalizada(u) {
  const v = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg'
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L'
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und'
  return null
}
function sufixoQuantidade(unidadeInsumo) {
  const u = unidadeNormalizada(unidadeInsumo)
  if (u === 'Kg') return 'g'
  if (u === 'L') return 'ml'
  return 'und'
}

// Rendimento de preparo do insumo (fração 0..1) ou null. Espelha a regra do
// backend: produção própria não usa perda de preparo (rendimento vem da receita).
function rendimentoInsumo(insumo) {
  if (!insumo || insumo.considerarPerdaPreparo !== true) return null
  if ((insumo.tipo ?? '') === 'PRODUCAO_PROPRIA') return null
  const b = Number(insumo.quantidadeBrutaPreparo)
  const a = Number(insumo.quantidadeAproveitavelPreparo)
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0 || a <= 0 || a > b) return null
  return a / b
}

// Cor informativa do "CMV + custo embutido" (percentual total real). Não altera
// o badge Saudável/Atenção/Crítico, que segue baseado só no CMV do produto.
function classePercentualTotal(p) {
  if (p === null || p === undefined) return ''
  const v = Number(p)
  if (v > 40) return 'clr-red'
  if (v > 35) return 'clr-orange'
  return 'clr-green'
}

// Produção própria com receita em modo PORCOES pode ser usada na ficha por
// unidade/porção (Kg/L exigem pesoPorcao definido; Und usa a própria unidade)
function insumoPermitePorcao(insumo) {
  if (!insumo || insumo.tipo !== 'PRODUCAO_PROPRIA') return false
  const receita = insumo.receitaProducao
  if (!receita || receita.modoRendimento !== 'PORCOES') return false
  const u = unidadeNormalizada(insumo.unidade)
  if (u === 'Kg' || u === 'L') return Number(receita.pesoPorcao) > 0
  return true
}

// Custo de 1 unidade/porção do insumo de produção própria (na ficha técnica)
function custoPorUnidadePorcao(insumo) {
  if (!insumoPermitePorcao(insumo)) return null
  const u = unidadeNormalizada(insumo.unidade)
  if (u === 'Kg' || u === 'L') {
    return (Number(insumo.receitaProducao.pesoPorcao) / 1000) * Number(insumo.custoUnitario)
  }
  return Number(insumo.custoUnitario)
}

// Alertas informativos da ficha técnica (heurísticas de revisão — não bloqueiam nada)
function buildAlertasFicha(analise, itens) {
  const alertas = []
  const semFicha = !itens || itens.length === 0
  if (semFicha) alertas.push('Este produto está sem ficha técnica.')
  if (analise?.statusCmv === 'SEM_PRECO') alertas.push('Preço de venda pendente.')
  if (
    analise?.cmvPercentual !== null &&
    analise?.cmvPercentual !== undefined &&
    Number(analise.cmvPercentual) > 100
  ) {
    alertas.push('Custo total acima de 100% do preço. Revise preço, ficha ou quantidades.')
  }
  // Alertas separados do status: custo total/embutido altos não rebaixam o
  // status do produto (que olha só o CMV do produto), mas merecem revisão
  if (analise?.alertaCustoTotal) alertas.push(analise.alertaCustoTotal)
  if (analise?.alertaCustoEmbutido) alertas.push(analise.alertaCustoEmbutido)
  if (
    analise?.diferencaPrecoSugerido !== null &&
    analise?.diferencaPrecoSugerido !== undefined &&
    Number(analise.diferencaPrecoSugerido) < 0
  ) {
    alertas.push('Preço atual abaixo do preço sugerido.')
  }

  const precoVenda = Number(analise?.precoVenda)
  for (const item of itens ?? []) {
    const nome = item.insumo?.nome ?? 'Insumo'
    const qtd = Number(item.quantidade)
    // Itens usados por unidade/porção não entram nas heurísticas de g/ml:
    // a quantidade deles é em unidades (1 coxinha), não em gramas
    if (item.modoUsoQuantidade === 'PORCAO') {
      if (qtd > 10) {
        alertas.push(`Quantidade alta de unidades/porções: ${nome} — ${num(qtd)} und.`)
      }
      continue
    }
    const unidadeItem = unidadeNormalizada(item.insumo?.unidade)
    if (unidadeItem === 'Kg') {
      if (qtd < 1) {
        alertas.push(`Quantidade muito baixa para insumo em Kg: ${nome} — ${num(qtd)} g.`)
      } else if (qtd >= 1000) {
        alertas.push(`Quantidade alta para insumo em Kg: ${nome} — ${num(qtd)} g.`)
      }
    } else if (unidadeItem === 'L') {
      if (qtd < 1) {
        alertas.push(`Quantidade muito baixa para insumo em L: ${nome} — ${num(qtd)} ml.`)
      } else if (qtd >= 1000) {
        alertas.push(`Quantidade alta para insumo em L: ${nome} — ${num(qtd)} ml.`)
      }
    } else {
      if (qtd > 10) {
        alertas.push(`Quantidade alta para insumo unitário: ${nome} — ${num(qtd)} und.`)
      }
      if (Number.isFinite(qtd) && !Number.isInteger(qtd)) {
        alertas.push(`Quantidade fracionada em insumo unitário: ${nome} — ${num(qtd)} und.`)
      }
    }

    const custoApl = Number(item.custoAplicado)
    if (Number.isFinite(custoApl)) {
      if (custoApl === 0) {
        alertas.push(`Item com custo aplicado zerado: ${nome}.`)
      } else if (precoVenda > 0 && custoApl > precoVenda * 0.5) {
        alertas.push(
          `${nome} custa ${brl(custoApl)} — ${pct((custoApl / precoVenda) * 100)} do preço de venda.`
        )
      }
    }

    if (item.formaRateio && item.formaRateio !== 'POR_PRODUTO') {
      const qa = Number(item.quantidadeAtendida)
      if (!Number.isFinite(qa) || qa <= 0) {
        alertas.push(`Rateio de ${nome} sem quantidade atendida válida.`)
      }
    }
  }
  return alertas
}

const STATUS_BADGE = {
  SAUDAVEL:  'badge-green',
  ATENCAO:   'badge-yellow',
  ALERTA:    'badge-orange',
  CRITICO:   'badge-red',
  SEM_FICHA: 'badge-blue',
  SEM_PRECO: 'badge-gray',
  SEM_COMPOSICAO: 'badge-gray'
}
const STATUS_LABEL = {
  SAUDAVEL:  'Saudável',
  ATENCAO:   'Atenção',
  ALERTA:    'Alerta',
  CRITICO:   'Crítico',
  SEM_FICHA: 'Sem ficha',
  SEM_PRECO: 'Sem preço',
  SEM_COMPOSICAO: 'Composição pendente'
}

// Abas da listagem: produtos antigos sem tipoProduto contam como PRODUTO
const TIPOS_PRODUTO_TABS = [
  { value: 'PRODUTO', label: 'Produtos' },
  { value: 'BEBIDA', label: 'Bebidas' },
  { value: 'COMBO', label: 'Combos' }
]
function tipoDoProduto(p) {
  return p?.tipoProduto ?? 'PRODUTO'
}
// Textos por tipo para ConfirmDialog/Toast (concordância de gênero)
const TIPO_TEXTO = {
  PRODUTO: { nome: 'produto', Nome: 'Produto', excluido: 'excluído', duplicado: 'duplicado' },
  BEBIDA:  { nome: 'bebida',  Nome: 'Bebida',  excluido: 'excluída', duplicado: 'duplicada' },
  COMBO:   { nome: 'combo',   Nome: 'Combo',   excluido: 'excluído', duplicado: 'duplicado' }
}
function textosDoTipo(p) {
  return TIPO_TEXTO[tipoDoProduto(p)] ?? TIPO_TEXTO.PRODUTO
}
const CMV_COLOR_CLASS = {
  SAUDAVEL:  'clr-green',
  ATENCAO:   'clr-yellow',
  ALERTA:    'clr-orange',
  CRITICO:   'clr-red'
}

// Defaults estratégicos por tipo (Inteligência do cardápio): bebida nasce fora
// do ranking e como COMMODITY; produto/combo entram no ranking por padrão
function estrategiaPadraoPorTipo(tipo) {
  if (tipo === 'BEBIDA') {
    return { produtoAncora: false, produtoIsca: false, incluirAnaliseEstrategica: false, tipoBebidaAnalise: 'COMMODITY' }
  }
  return { produtoAncora: false, produtoIsca: false, incluirAnaliseEstrategica: true, tipoBebidaAnalise: '' }
}

// mascaraMoeda / parseMoeda agora vivem em utils/moeda.js (regra única).

const FORM_BLANK = {
  nome: '', descricao: '', precoVenda: '', tipoProduto: 'PRODUTO', custoDireto: '',
  ...estrategiaPadraoPorTipo('PRODUTO')
}

function validateForm({ nome, precoVenda, tipoProduto, custoDireto }) {
  if (!nome || nome.trim() === '') return 'nome é obrigatório'
  if (precoVenda === '' || precoVenda === null || precoVenda === undefined) {
    return 'preço de venda é obrigatório'
  }
  const v = parseMoeda(precoVenda)
  if (!Number.isFinite(v)) return 'preço de venda deve ser numérico'
  if (v < 0) return 'preço de venda deve ser maior ou igual a zero'
  if (tipoProduto === 'BEBIDA' && custoDireto !== '' && custoDireto !== undefined) {
    const c = parseMoeda(custoDireto)
    if (!Number.isFinite(c) || c < 0) return 'custo de compra deve ser maior ou igual a zero'
  }
  return null
}

function payloadFromForm(form) {
  const tipo = form.tipoProduto ?? 'PRODUTO'
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() === '' ? null : form.descricao.trim(),
    precoVenda: parseMoeda(form.precoVenda),
    tipoProduto: tipo,
    custoDireto: tipo === 'BEBIDA' && form.custoDireto !== '' ? parseMoeda(form.custoDireto) : null,
    // Inteligência do cardápio: âncora/isca só fazem sentido em produto/combo;
    // tipoBebidaAnalise só em bebida
    produtoAncora: tipo === 'BEBIDA' ? false : !!form.produtoAncora,
    produtoIsca: tipo === 'BEBIDA' ? false : !!form.produtoIsca,
    incluirAnaliseEstrategica: !!form.incluirAnaliseEstrategica,
    tipoBebidaAnalise: tipo === 'BEBIDA' ? (form.tipoBebidaAnalise || 'COMMODITY') : null
  }
}

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

const metricRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 13,
  padding: '5px 0',
  borderBottom: '1px solid #f5f5f5'
}
const metricLabelStyle = { color: '#888', fontSize: 12 }

const priceLabelStyle = {
  fontSize: 10,
  fontWeight: 600,
  color: '#aaa',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 2
}
const pricePendingStyle = { fontSize: 12, fontWeight: 500, color: '#aaa' }

function MetricRow({ label, children }) {
  return (
    <div style={metricRowStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span>{children}</span>
    </div>
  )
}

// Card/opção selecionável da seção de inteligência (toggle ou seletor)
function IntelOption({ active, title, desc, onClick }) {
  return (
    <button
      type="button"
      className={'intel-option' + (active ? ' active' : '')}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="intel-option-title">
        <span>{title}</span>
        {active && <span className="intel-option-check" aria-hidden="true">✓</span>}
      </div>
      <div className="intel-option-desc">{desc}</div>
    </button>
  )
}

// Bloco "Inteligência do cardápio" reutilizado na criação e na edição (produto,
// bebida e combo). Recebe form/onChange para refletir os valores atuais e
// permitir alteração. Produto/combo: cartões padrão/assinatura/isca (toggles).
// Bebida: seletor Commodity/Autoral. "Incluir na análise" é um switch em todos.
function InteligenciaCardapioFields({ form, onChange }) {
  const tipo = form.tipoProduto ?? 'PRODUTO'
  const ancora = !!form.produtoAncora
  const isca = !!form.produtoIsca
  const incluir = !!form.incluirAnaliseEstrategica
  const tipoBebida = form.tipoBebidaAnalise || 'COMMODITY'

  return (
    <div className="intel-section">
      <div className="intel-head">Inteligência do cardápio</div>
      <div className="intel-sub">
        Use essas marcações para orientar futuras análises de vendas, margem e cardápio.
      </div>

      {tipo === 'BEBIDA' ? (
        <div className="intel-options intel-options-2">
          <IntelOption
            active={tipoBebida === 'COMMODITY'}
            title="Commodity"
            desc="Refrigerante / revenda. Fica fora do ranking estratégico por padrão."
            onClick={() => onChange({ tipoBebidaAnalise: 'COMMODITY' })}
          />
          <IntelOption
            active={tipoBebida === 'AUTORAL'}
            title="Autoral / da casa"
            desc="Bebida própria da marca, avaliada como item estratégico."
            onClick={() => onChange({ tipoBebidaAnalise: 'AUTORAL' })}
          />
        </div>
      ) : (
        <div className="intel-options">
          <IntelOption
            active={!ancora && !isca}
            title="Produto padrão"
            desc="Produto comum do cardápio."
            onClick={() => onChange({ produtoAncora: false, produtoIsca: false })}
          />
          <IntelOption
            active={ancora}
            title="Produto assinatura"
            desc="Representa a marca e não deve ser avaliado apenas por volume."
            onClick={() => onChange({ produtoAncora: !ancora })}
          />
          <IntelOption
            active={isca}
            title="Produto isca"
            desc="Atrai novos clientes, gera volume e estimula upsell."
            onClick={() => onChange({ produtoIsca: !isca })}
          />
        </div>
      )}

      <button
        type="button"
        className="intel-switch-row"
        onClick={() => onChange({ incluirAnaliseEstrategica: !incluir })}
        aria-pressed={incluir}
      >
        <span>
          <span className="intel-switch-label">Incluir na análise estratégica</span>
          <span className="intel-switch-desc">Entra no ranking e nas comparações de cardápio.</span>
        </span>
        <span className={'intel-switch' + (incluir ? ' on' : '')} aria-hidden="true" />
      </button>
    </div>
  )
}

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal simples: apenas criação de produto
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(FORM_BLANK)
  const [createError, setCreateError] = useState(null)
  const [creating, setCreating] = useState(false)

  const [deletingId, setDeletingId] = useState(null)
  const [duplicandoId, setDuplicandoId] = useState(null)
  const [produtoParaExcluir, setProdutoParaExcluir] = useState(null)
  const [toast, setToast] = useState(null)

  const [fichaProdutoId, setFichaProdutoId] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [tipoTab, setTipoTab] = useState('PRODUTO')
  const [busca, setBusca] = useState('')

  function fetchProdutos() {
    return api
      .get('/produtos')
      .then((res) => Promise.all(
        res.data.map((p) =>
          api.get(`/produtos/${p.id}/analise`).then((r) => ({ ...p, analise: r.data }))
        )
      ))
  }

  function load() {
    setLoading(true)
    setError(null)
    fetchProdutos()
      .then((rows) => {
        setProdutos(rows)
        setLoading(false)
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro inesperado.')
        setError(msg)
        setLoading(false)
      })
  }

  // Recarrega a lista sem acionar o loading de página inteira
  // (usado pelo modal de ficha para atualizar os cards atrás dele)
  function refresh() {
    return fetchProdutos()
      .then((rows) => setProdutos(rows))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  // Criação contextual: o card de ação de cada aba abre já com o tipo certo
  function openCreate(tipo = 'PRODUTO') {
    setCreateForm({ ...FORM_BLANK, tipoProduto: tipo, ...estrategiaPadraoPorTipo(tipo) })
    setCreateError(null)
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateForm(FORM_BLANK)
    setCreateError(null)
  }

  function handleCreate(e) {
    e.preventDefault()
    const err = validateForm(createForm)
    if (err) { setCreateError(err); return }
    setCreateError(null)
    setCreating(true)
    api
      .post('/produtos', payloadFromForm(createForm))
      .then(() => {
        setToast({ message: 'Produto criado com sucesso.', type: 'success' })
        closeCreate()
        load()
      })
      .catch((e) =>
        setCreateError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar produto.')
      )
      .finally(() => setCreating(false))
  }

  function handleDelete(p) {
    setProdutoParaExcluir(p)
  }

  // "Excluir" na interface = soft delete: o backend apenas marca ativo=false
  function confirmExcluirProduto() {
    const p = produtoParaExcluir
    if (!p) return
    const t = textosDoTipo(p)
    setDeletingId(p.id)
    api
      .delete(`/produtos/${p.id}`)
      .then(() => {
        setToast({ message: `${t.Nome} "${p.nome}" ${t.excluido} com sucesso.`, type: 'success' })
        load()
      })
      .catch((e) =>
        setToast({
          message: e?.response?.data?.error ?? e?.message ?? `Erro ao excluir ${t.nome}.`,
          type: 'error'
        })
      )
      .finally(() => {
        setDeletingId(null)
        setProdutoParaExcluir(null)
      })
  }

  function handleDuplicar(p) {
    const t = textosDoTipo(p)
    setDuplicandoId(p.id)
    api
      .post(`/produtos/${p.id}/duplicar`)
      .then(() => {
        setToast({ message: `${t.Nome} ${t.duplicado} com sucesso.`, type: 'success' })
        return refresh()
      })
      .catch((e) =>
        setToast({
          message: e?.response?.data?.error ?? e?.message ?? `Erro ao duplicar ${t.nome}.`,
          type: 'error'
        })
      )
      .finally(() => setDuplicandoId(null))
  }

  if (loading) {
    return <div className="loading-state">Carregando produtos…</div>
  }

  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os produtos</div>
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

  // Métricas agregadas: ficha técnica e CMV são conceitos de PRODUTO montado —
  // bebidas e combos não entram nessas contagens
  const produtosMontados = produtos.filter((p) => tipoDoProduto(p) === 'PRODUTO')
  const totalAtivos = produtosMontados.length
  const semFicha = produtosMontados.filter((p) => p.analise?.statusCmv === 'SEM_FICHA').length
  const criticos = produtosMontados.filter((p) => p.analise?.statusCmv === 'CRITICO').length
  const fichasCadastradas = totalAtivos - semFicha

  // Itens da aba selecionada
  const produtosDaAba = produtos.filter((p) => tipoDoProduto(p) === tipoTab)

  // Busca instantânea dentro da aba atual: ignora caixa e espaços extras, casa
  // por nome e descrição (para achar fichas pelo nome do produto rapidamente)
  const termoBusca = busca.trim().toLowerCase()
  const produtosFiltrados =
    termoBusca === ''
      ? produtosDaAba
      : produtosDaAba.filter((p) => {
          const alvo = `${p.nome ?? ''} ${p.descricao ?? ''}`.toLowerCase()
          return alvo.includes(termoBusca)
        })
  const buscaSemResultado = termoBusca !== '' && produtosFiltrados.length === 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Produtos</h1>
          <div className="page-header-sub">
            Cadastro de produtos, ficha técnica, CMV e precificação.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-definir-lucro" onClick={() => setConfigOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
            </svg>
            Definir lucro
          </button>
        </div>
      </div>

      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      <ConfirmDialog
        open={produtoParaExcluir !== null}
        title={`Excluir ${textosDoTipo(produtoParaExcluir).nome}?`}
        message={
          produtoParaExcluir
            ? `Você está prestes a excluir "${produtoParaExcluir.nome}".`
            : ''
        }
        description="O item sai do cardápio e dos cálculos, mas o histórico é preservado."
        confirmLabel={`Excluir ${textosDoTipo(produtoParaExcluir).nome}`}
        cancelLabel="Cancelar"
        variant="danger"
        loading={deletingId !== null}
        onConfirm={confirmExcluirProduto}
        onCancel={() => setProdutoParaExcluir(null)}
      />

      {createOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {createForm.tipoProduto === 'BEBIDA'
                ? 'Nova bebida'
                : createForm.tipoProduto === 'COMBO'
                ? 'Novo combo'
                : 'Novo produto'}
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={createForm.tipoProduto}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      tipoProduto: e.target.value,
                      ...estrategiaPadraoPorTipo(e.target.value)
                    })
                  }
                >
                  <option value="PRODUTO">Produto</option>
                  <option value="BEBIDA">Bebida</option>
                  <option value="COMBO">Combo</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={createForm.nome}
                  onChange={(e) => setCreateForm({ ...createForm, nome: e.target.value })}
                  placeholder={
                    createForm.tipoProduto === 'BEBIDA'
                      ? 'Coca lata'
                      : createForm.tipoProduto === 'COMBO'
                      ? 'Combo X-Burger + bebida'
                      : 'X-Burger Especial'
                  }
                  autoFocus
                />
              </div>
              {createForm.tipoProduto === 'PRODUTO' && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Descrição (opcional)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={createForm.descricao}
                    onChange={(e) => setCreateForm({ ...createForm, descricao: e.target.value })}
                    placeholder="Pão, blend 160g, queijo..."
                  />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Preço de venda (R$)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  value={createForm.precoVenda}
                  onChange={(e) => setCreateForm({ ...createForm, precoVenda: mascaraMoeda(e.target.value) })}
                  placeholder="0,00"
                />
              </div>
              {createForm.tipoProduto === 'BEBIDA' && (
                <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label className="form-label">Custo de compra (R$)</label>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    value={createForm.custoDireto}
                    onChange={(e) => setCreateForm({ ...createForm, custoDireto: mascaraMoeda(e.target.value) })}
                    placeholder="0,00"
                  />
                </div>
              )}
              {createForm.tipoProduto === 'COMBO' && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 12 }}>
                  A composição do combo será configurada em uma próxima etapa.
                </div>
              )}

              {/* Inteligência do cardápio: marcações discretas para análises futuras */}
              <InteligenciaCardapioFields
                form={createForm}
                onChange={(patch) => setCreateForm({ ...createForm, ...patch })}
              />

              {createError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{createError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCreate} disabled={creating}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Salvando…' : 'Salvar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fichaProdutoId !== null && (
        <FichaModal
          produtoId={fichaProdutoId}
          onClose={() => setFichaProdutoId(null)}
          onChanged={refresh}
        />
      )}

      {configOpen && (
        <ConfigPrecificacaoModal
          onClose={() => setConfigOpen(false)}
          onSaved={() => {
            setConfigOpen(false)
            setToast({
              message: 'Configuração de precificação salva. Preços recalculados.',
              type: 'success'
            })
            load()
          }}
        />
      )}

      <div className="section-title">Resumo</div>
      <div className="grid-4" style={{ marginBottom: 4 }}>
        <Card
          title="Produtos Cadastrados"
          value={int(totalAtivos)}
          hint="Ativos no cardápio"
          variant="info"
        />
        <Card
          title="Sem Ficha Técnica"
          value={int(semFicha)}
          hint="Sem CMV calculado"
          variant={semFicha > 0 ? 'warn' : 'success'}
        />
        <Card
          title="CMV Crítico"
          value={int(criticos)}
          hint="CMV do produto acima de 35%"
          variant={criticos > 0 ? 'danger' : 'success'}
        />
        <Card
          title="Fichas Cadastradas"
          value={int(fichasCadastradas)}
          hint="Produtos com composição"
          variant={fichasCadastradas > 0 ? 'success' : 'info'}
        />
      </div>

      <div className="section-title">Produtos e Fichas</div>

      {/* Abas por tipo de item vendido */}
      <div className="modal-tabs" style={{ marginBottom: 14 }}>
        {TIPOS_PRODUTO_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={'modal-tab' + (tipoTab === t.value ? ' active' : '')}
            onClick={() => { setTipoTab(t.value); setBusca('') }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Busca instantânea da aba atual */}
      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 460 }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#aaa"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          className="form-input"
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar produto, bebida ou combo..."
          style={{ paddingLeft: 36, paddingRight: busca ? 36 : 12 }}
          aria-label="Pesquisar"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca('')}
            title="Limpar busca"
            aria-label="Limpar busca"
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              border: 'none', background: 'transparent', color: '#aaa', cursor: 'pointer',
              fontSize: 18, lineHeight: 1, padding: '4px 6px'
            }}
          >
            ×
          </button>
        )}
      </div>

      {buscaSemResultado ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          Nenhum item encontrado para essa busca.
        </div>
      ) : (
      <div className="grid-3">
          {/* Card de ação contextual: primeiro espaço da grid quando não há busca
              ativa (apenas UI, não entra em nenhuma contagem) */}
          {termoBusca === '' && (
          <button type="button" className="card card-action" onClick={() => openCreate(tipoTab)}>
            <span className="card-action-plus">+</span>
            <span className="card-action-title">
              {tipoTab === 'BEBIDA'
                ? 'Cadastrar bebida'
                : tipoTab === 'COMBO'
                ? 'Montar combo'
                : 'Cadastrar produto'}
            </span>
            <span className="card-action-sub">
              {tipoTab === 'BEBIDA'
                ? 'Cadastro simples de revenda'
                : tipoTab === 'COMBO'
                ? 'Combinar produtos e bebidas'
                : 'Adicionar novo item com ficha técnica'}
            </span>
          </button>
          )}
          {produtosFiltrados.map((p) => {
            const a = p.analise ?? {}
            const tipoP = tipoDoProduto(p)
            // Badge = saúde GERAL da precificação (statusGeral); a linha "CMV do
            // produto" continua colorida pelo statusCmv (leitura isolada do CMV)
            const statusGeralProduto = a.statusGeral ?? a.statusCmv
            const semFichaProduto = a.statusCmv === 'SEM_FICHA'
            const semPrecoProduto = a.statusCmv === 'SEM_PRECO'
            const cmvClass = CMV_COLOR_CLASS[a.statusCmv] ?? ''
            const lucroPositivo =
              a.lucroBruto !== null && a.lucroBruto !== undefined && Number(a.lucroBruto) > 0
            const abaixoDoSugerido =
              a.diferencaPrecoSugerido !== null &&
              a.diferencaPrecoSugerido !== undefined &&
              Number(a.diferencaPrecoSugerido) < 0

            const diagnosticos = []
            if (tipoP === 'BEBIDA') {
              diagnosticos.push({
                texto: a.mensagemDiagnostico ?? 'Bebida de revenda.',
                cls:
                  statusGeralProduto === 'CRITICO'
                    ? 'clr-red'
                    : statusGeralProduto === 'ATENCAO'
                    ? 'clr-yellow'
                    : statusGeralProduto === 'SAUDAVEL'
                    ? 'clr-green'
                    : 'clr-muted'
              })
            } else if (tipoP === 'COMBO') {
              diagnosticos.push({
                texto: a.mensagemDiagnostico ?? 'Monte o combo com produtos e bebidas.',
                cls:
                  statusGeralProduto === 'CRITICO'
                    ? 'clr-red'
                    : statusGeralProduto === 'ATENCAO'
                    ? 'clr-yellow'
                    : statusGeralProduto === 'SAUDAVEL'
                    ? 'clr-green'
                    : 'clr-muted'
              })
            } else if (semFichaProduto) {
              diagnosticos.push({ texto: 'Ficha técnica pendente', cls: 'clr-muted' })
            } else if (semPrecoProduto) {
              diagnosticos.push({ texto: 'Preço de venda pendente', cls: 'clr-muted' })
            } else {
              if (a.statusCmv === 'ATENCAO') diagnosticos.push({ texto: 'CMV em atenção', cls: 'clr-yellow' })
              if (a.statusCmv === 'ALERTA') diagnosticos.push({ texto: 'CMV em alerta', cls: 'clr-orange' })
              if (a.statusCmv === 'CRITICO') diagnosticos.push({ texto: 'CMV crítico', cls: 'clr-red' })
              if (abaixoDoSugerido) diagnosticos.push({ texto: 'Preço abaixo do sugerido', cls: 'clr-orange' })
              if (a.alertaCustoEmbutido) diagnosticos.push({ texto: 'Custo embutido elevado', cls: 'clr-orange' })
              if (a.alertaCustoTotal) diagnosticos.push({ texto: 'Custo total acima de 40%', cls: 'clr-red' })
              if (diagnosticos.length === 0) diagnosticos.push({ texto: 'Precificação saudável', cls: 'clr-green' })
            }

            return (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={() => setFichaProdutoId(p.id)} title="Clique para editar">
                {/* Bloco 1 — Identidade */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 12
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--app-text)', fontSize: 14 }}>{p.nome}</div>
                    {p.descricao && (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{p.descricao}</div>
                    )}
                    {/* Marcações estratégicas — discretas, não competem com o badge de saúde */}
                    {(p.produtoAncora ||
                      p.produtoIsca ||
                      (tipoP === 'BEBIDA' && p.tipoBebidaAnalise === 'AUTORAL' && p.incluirAnaliseEstrategica)) && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                        {p.produtoAncora && <span className="badge-strategic badge-assinatura">Assinatura</span>}
                        {p.produtoIsca && <span className="badge-strategic badge-isca">Isca</span>}
                        {tipoP === 'BEBIDA' && p.tipoBebidaAnalise === 'AUTORAL' && p.incluirAnaliseEstrategica && (
                          <span className="badge-strategic badge-autoral">Autoral</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={'badge ' + (STATUS_BADGE[statusGeralProduto] ?? 'badge-gray')}>
                    {STATUS_LABEL[statusGeralProduto] ?? statusGeralProduto ?? '—'}
                  </span>
                </div>

                {/* Bloco 2 — Preços principais */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    background: 'var(--app-surface-2)',
                    border: '1px solid #f0f0f0',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 12
                  }}
                >
                  <div style={{ flex: 1, minWidth: 86 }}>
                    <div style={priceLabelStyle}>Venda</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--app-text)', letterSpacing: '-0.3px' }}>
                      {p.precoVenda === null || p.precoVenda === undefined
                        ? <span style={pricePendingStyle}>Pendente</span>
                        : brl(p.precoVenda)}
                    </div>
                  </div>
                  {tipoP === 'PRODUTO' && (
                    <div style={{ flex: 1, minWidth: 86 }}>
                      <div style={priceLabelStyle}>Sugerido</div>
                      <div className="clr-blue" style={{ fontSize: 15, fontWeight: 600 }}>
                        {a.precoSugerido === null || a.precoSugerido === undefined
                          ? <span style={pricePendingStyle}>{semFichaProduto ? 'Sem ficha' : 'Pendente'}</span>
                          : brl(a.precoSugerido)}
                      </div>
                    </div>
                  )}
                  {tipoP !== 'COMBO' && (
                    <div style={{ flex: 1, minWidth: 86 }}>
                      <div style={priceLabelStyle}>iFood</div>
                      <div className="clr-orange" style={{ fontSize: 15, fontWeight: 600 }}>
                        {a.precoIfood === null || a.precoIfood === undefined
                          ? <span style={pricePendingStyle}>{tipoP === 'PRODUTO' && semFichaProduto ? 'Sem ficha' : 'Pendente'}</span>
                          : brl(a.precoIfood)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bloco 3 — Indicadores (por tipo de item) */}
                <div style={{ flex: 1 }}>
                  {tipoP === 'BEBIDA' ? (
                    <>
                      <MetricRow label="Custo de compra">
                        {a.produto?.custoDireto === null || a.produto?.custoDireto === undefined
                          ? <span className="clr-muted">Não informado</span>
                          : brl(a.produto.custoDireto)}
                      </MetricRow>
                      <MetricRow label="Lucro bruto">
                        {a.lucroBrutoReal === null || a.lucroBrutoReal === undefined
                          ? <span className="clr-muted">—</span>
                          : <span className={Number(a.lucroBrutoReal) > 0 ? 'clr-green' : 'clr-red'}>{brl(a.lucroBrutoReal)}</span>}
                      </MetricRow>
                      <MetricRow label="Margem sobre venda">
                        {a.margemRealPercentual === null || a.margemRealPercentual === undefined
                          ? <span className="clr-muted">—</span>
                          : <span style={{ fontWeight: 600 }}>{pct(a.margemRealPercentual)}</span>}
                      </MetricRow>
                    </>
                  ) : tipoP === 'COMBO' ? (
                    (a.quantidadeItensCombo ?? 0) > 0 ? (
                      <>
                        <MetricRow label="Valor referência">{brl(a.valorReferenciaCombo)}</MetricRow>
                        <MetricRow label={Number(a.descontoCombo) < 0 ? 'Mais caro' : 'Economia'}>
                          {a.descontoCombo === null || a.descontoCombo === undefined
                            ? <span className="clr-muted">—</span>
                            : Number(a.descontoCombo) < 0
                            ? <span className="clr-red">{brl(Math.abs(Number(a.descontoCombo)))}</span>
                            : Number(a.descontoCombo) === 0
                            ? <span className="clr-muted">Sem desconto</span>
                            : (
                              <span className="clr-green">
                                {brl(a.descontoCombo)}
                                {a.percentualDescontoCombo !== null && a.percentualDescontoCombo !== undefined
                                  ? ` (${pct(a.percentualDescontoCombo)})`
                                  : ''}
                              </span>
                            )}
                        </MetricRow>
                        <MetricRow label="Custo total">{brl(a.custoTotalCombo)}</MetricRow>
                        <MetricRow label="CMV do combo">
                          {a.cmvComboPercentual === null || a.cmvComboPercentual === undefined
                            ? <span className="clr-muted">—</span>
                            : <span style={{ fontWeight: 600 }}>{pct(a.cmvComboPercentual)}</span>}
                        </MetricRow>
                        <MetricRow label="Lucro bruto">
                          {a.lucroBrutoCombo === null || a.lucroBrutoCombo === undefined
                            ? <span className="clr-muted">—</span>
                            : (
                              <span className={Number(a.lucroBrutoCombo) > 0 ? 'clr-green' : 'clr-red'}>
                                {brl(a.lucroBrutoCombo)}
                              </span>
                            )}
                        </MetricRow>
                      </>
                    ) : (
                      <MetricRow label="Composição">
                        <span className="clr-muted">Pendente</span>
                      </MetricRow>
                    )
                  ) : (
                    <>
                      <MetricRow label="CMV do produto">
                        {a.cmvProdutoPercentual === null || a.cmvProdutoPercentual === undefined
                          ? <span className="clr-muted">—</span>
                          : <span className={cmvClass} style={{ fontWeight: 600 }}>{pct(a.cmvProdutoPercentual)}</span>}
                      </MetricRow>
                      <MetricRow label="CMV + custo embutido">
                        {a.percentualTotalReal === null || a.percentualTotalReal === undefined
                          ? <span className="clr-muted">—</span>
                          : (
                            <span className={classePercentualTotal(a.percentualTotalReal)} style={{ fontWeight: 600 }}>
                              {pct(a.percentualTotalReal)}
                            </span>
                          )}
                      </MetricRow>
                      <MetricRow label="Custo total real">
                        {semFichaProduto
                          ? <span className="clr-muted">Não cadastrado</span>
                          : brl(a.custoTotalReal ?? a.custoFichaTecnica)}
                      </MetricRow>
                      <MetricRow label="Lucro bruto real">
                        {a.lucroBruto === null || a.lucroBruto === undefined
                          ? <span className="clr-muted">—</span>
                          : <span className={lucroPositivo ? 'clr-green' : 'clr-red'}>{brl(a.lucroBrutoReal ?? a.lucroBruto)}</span>}
                      </MetricRow>
                    </>
                  )}
                </div>

                {/* Bloco 4 — Diagnóstico */}
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid #f5f5f5',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3
                  }}
                >
                  {diagnosticos.map((d) => (
                    <div key={d.texto} className={d.cls} style={{ fontSize: 11.5, fontWeight: 500 }}>
                      {d.texto}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={`Duplicar ${textosDoTipo(p).nome}`}
                    aria-label={`Duplicar ${textosDoTipo(p).nome}`}
                    onClick={(e) => { e.stopPropagation(); handleDuplicar(p) }}
                    disabled={duplicandoId === p.id}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="9" y="9" width="12" height="12" rx="2.5" />
                      <path d="M5 15c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={(e) => { e.stopPropagation(); setFichaProdutoId(p.id) }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? 'Excluindo…' : 'Excluir'}
                  </button>
                </div>
              </div>
            )
          })}
      </div>
      )}
    </div>
  )
}

// ============ Modal: configuração de precificação ============

const CONFIG_FIELDS = [
  'cmvAlvoPercentual',
  'lucroDesejadoPercentual',
  'taxaIfoodPercentual',
  'campanhaInteligente',
  'maiorTaxaEntrega',
  'cupomDesconto',
  'ticketMedioDelivery'
]

function validateConfigForm(form) {
  for (const f of CONFIG_FIELDS) {
    if (form[f] === '' || !Number.isFinite(Number(form[f]))) {
      return 'Todos os campos são obrigatórios e devem ser numéricos.'
    }
  }
  const cmv = Number(form.cmvAlvoPercentual)
  if (cmv <= 0 || cmv >= 100) return 'CMV alvo deve ser maior que 0 e menor que 100.'
  const lucro = Number(form.lucroDesejadoPercentual)
  if (lucro < 0 || lucro >= 100) return 'Lucro desejado deve ser maior ou igual a 0 e menor que 100.'
  const taxa = Number(form.taxaIfoodPercentual)
  if (taxa < 0 || taxa >= 100) return 'Taxa iFood deve ser maior ou igual a 0 e menor que 100.'
  if (Number(form.campanhaInteligente) < 0) return 'Campanha Inteligente deve ser maior ou igual a zero.'
  if (Number(form.maiorTaxaEntrega) < 0) return 'Maior taxa de entrega deve ser maior ou igual a zero.'
  if (Number(form.cupomDesconto) < 0) return 'Cupom de desconto deve ser maior ou igual a zero.'
  if (Number(form.ticketMedioDelivery) <= 0) return 'Ticket médio delivery deve ser maior que zero.'
  return null
}

// Logo do iFood. Coloque o arquivo oficial em frontend/public/ifood-logo.png (ou
// .svg). Enquanto o arquivo não existir, cai num wordmark estilizado.
function IfoodMark({ height = 16 }) {
  const [erro, setErro] = useState(false)
  if (erro) {
    return (
      <span style={{ fontWeight: 800, fontStyle: 'italic', color: '#EA1D2C', fontSize: height + 3, lineHeight: 1, letterSpacing: -0.3 }}>
        iFood
      </span>
    )
  }
  return <img src="/ifood-logo.png" alt="iFood" style={{ height, maxWidth: 60, display: 'block', objectFit: 'contain' }} onError={() => setErro(true)} />
}

function ConfigPrecificacaoModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  function loadConfig() {
    setLoading(true)
    setError(null)
    api
      .get('/configuracao-precificacao')
      .then((r) => {
        const c = r.data
        const toStr = (v) => (v === null || v === undefined ? '' : String(Number(v)))
        setForm({
          cmvAlvoPercentual: toStr(c.cmvAlvoPercentual),
          lucroDesejadoPercentual: toStr(c.lucroDesejadoPercentual),
          taxaIfoodPercentual: toStr(c.taxaIfoodPercentual),
          campanhaInteligente: toStr(c.campanhaInteligente),
          maiorTaxaEntrega: toStr(c.maiorTaxaEntrega),
          cupomDesconto: toStr(c.cupomDesconto),
          ticketMedioDelivery: toStr(c.ticketMedioDelivery)
        })
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

  useEffect(() => { loadConfig() }, [])

  function handleSave(e) {
    e.preventDefault()
    const err = validateConfigForm(form)
    if (err) { setFormError(err); return }
    setFormError(null)
    setSaving(true)
    const payload = Object.fromEntries(CONFIG_FIELDS.map((f) => [f, Number(form[f])]))
    api
      .put('/configuracao-precificacao', payload)
      .then(() => onSaved())
      .catch((e) =>
        setFormError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar configuração.')
      )
      .finally(() => setSaving(false))
  }

  const numOrZero = (v) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : 0)
  const taxaIfoodTotal = form ? numOrZero(form.taxaIfoodPercentual) : 0
  const custosRateaveis = form
    ? numOrZero(form.campanhaInteligente) +
      numOrZero(form.maiorTaxaEntrega) +
      numOrZero(form.cupomDesconto)
    : 0

  const fieldDef = [
    ['taxaIfoodPercentual', 'Taxa iFood (%)'],
    ['campanhaInteligente', 'Campanha Inteligente (R$)'],
    ['maiorTaxaEntrega', 'Maior taxa de entrega (R$)'],
    ['cupomDesconto', 'Cupom (R$)'],
    ['ticketMedioDelivery', 'Ticket médio delivery (R$)']
  ]

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-title">Definir lucro</div>
        <div style={{ fontSize: 12.5, color: '#999', marginTop: -10, marginBottom: 14 }}>
          Seu lucro na venda direta e os custos do iFood — usados para calcular o preço sugerido.
        </div>

        {loading ? (
          <div className="loading-state">Carregando configuração…</div>
        ) : error ? (
          <div className="alert alert-red">
            <div>
              <div className="alert-title clr-red">Não foi possível carregar a configuração</div>
              <div className="alert-msg">{error}</div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={loadConfig}>
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            {/* Venda Direta — preço no balcão, sem intermediário */}
            <div className="precif-secao">
              <div className="precif-secao-head">
                <span className="precif-badge" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l1.6-5h14.8L21 9" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9h18" /><path d="M9 20v-6h6v6" />
                  </svg>
                </span>
                <div>
                  <div className="precif-secao-titulo">Venda Direta</div>
                  <div className="precif-secao-sub">Preço no balcão / retirada, sem intermediário.</div>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CMV alvo (%)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.cmvAlvoPercentual} onChange={(e) => setForm({ ...form, cmvAlvoPercentual: e.target.value })} autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Lucro desejado (%)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.lucroDesejadoPercentual} onChange={(e) => setForm({ ...form, lucroDesejadoPercentual: e.target.value })} />
                </div>
              </div>
              <div className="precif-hint">CMV alvo e lucro desejado ajudam a avaliar se o produto está saudável e a formar o preço sugerido.</div>
            </div>

            {/* iFood — custos do marketplace que entram no preço */}
            <div className="precif-secao precif-secao-ifood">
              <div className="precif-secao-head">
                <span className="precif-badge" style={{ background: '#fde8ea' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA1D2C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2 3.5 6.5V20a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V6.5L18 2z" /><path d="M3.5 7h17" /><path d="M16 11a4 4 0 0 1-8 0" />
                  </svg>
                </span>
                <div>
                  <div className="precif-secao-titulo" style={{ display: 'flex', alignItems: 'center', minHeight: 18 }}><IfoodMark height={16} /></div>
                  <div className="precif-secao-sub">Custos do marketplace que entram no preço do delivery.</div>
                </div>
              </div>
              <div className="form-grid-2">
                {fieldDef.map(([campo, label]) => (
                  <div key={campo} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{label}</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="precif-hint">O preço no iFood parte do preço de venda e soma o impacto de taxa, campanha, entrega, cupom e ticket médio.</div>
              <div className="precif-resumo">
                <span>
                  Taxa iFood total:{' '}
                  <strong className={taxaIfoodTotal >= 100 ? 'clr-red' : 'clr-orange'}>{pct(taxaIfoodTotal)}</strong>
                </span>
                <span>
                  Custos iFood rateáveis: <strong className="clr-orange">{brl(custosRateaveis)}</strong>
                </span>
              </div>
            </div>

            {formError && (
              <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="alert-msg clr-red">{formError}</div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ============ Modal grande: ficha do produto ============

const TIPO_USO_OPTIONS = [
  { value: 'INGREDIENTE',    label: 'Ingrediente' },
  { value: 'EMBALAGEM',      label: 'Embalagem' },
  { value: 'ACOMPANHAMENTO', label: 'Acompanhamento' },
  { value: 'OPERACIONAL',    label: 'Operacional' }
]
const TIPO_USO_LABEL = Object.fromEntries(TIPO_USO_OPTIONS.map((o) => [o.value, o.label]))

const RATEIO_OPTIONS = [
  { value: 'POR_PRODUTO',   label: 'Por produto' },
  { value: 'POR_EMBALAGEM', label: 'Por embalagem' },
  { value: 'POR_PEDIDO',    label: 'Por pedido' }
]
const RATEIO_LABEL = Object.fromEntries(RATEIO_OPTIONS.map((o) => [o.value, o.label]))

const ATENDIDA_LABEL = {
  POR_EMBALAGEM: 'Produtos atendidos por embalagem',
  POR_PEDIDO: 'Produtos médios por pedido'
}

// Sugestão de uso a partir do tipo do insumo (mesma regra do backend)
function sugestaoUso(tipoInsumo) {
  if (tipoInsumo === 'EMBALAGEM') return 'EMBALAGEM'
  if (tipoInsumo === 'ACOMPANHAMENTO') return 'ACOMPANHAMENTO'
  if (tipoInsumo === 'OPERACIONAL') return 'OPERACIONAL'
  return 'INGREDIENTE'
}

// Regra automática (mesma do backend): só ingrediente entra na base do preço sugerido
function aplicaMargemPorTipoUso(tipoUso) {
  return tipoUso === 'INGREDIENTE'
}

function ComposicaoBadge({ aplicarMargem }) {
  return aplicarMargem
    ? <span className="badge badge-green">Preço sugerido</span>
    : <span className="badge badge-gray">Custo embutido</span>
}

function FichaModal({ produtoId, onClose, onChanged }) {
  const [produto, setProduto] = useState(null)
  const [analise, setAnalise] = useState(null)
  const [itens, setItens] = useState([])
  const [insumos, setInsumos] = useState([])
  const [fichaTotais, setFichaTotais] = useState({
    custoComMargem: 0,
    custoEmbutido: 0,
    custoTotalFicha: 0
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTab, setActiveTab] = useState('PRECIFICACAO')
  const [toast, setToast] = useState(null)

  const [dadosForm, setDadosForm] = useState(FORM_BLANK)
  const [dadosError, setDadosError] = useState(null)
  const [dadosSaving, setDadosSaving] = useState(false)

  const [showAddItemForm, setShowAddItemForm] = useState(false)
  const [formInsumoId, setFormInsumoId] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formTipoUso, setFormTipoUso] = useState('INGREDIENTE')
  const [formRateio, setFormRateio] = useState('POR_PRODUTO')
  const [formAtendida, setFormAtendida] = useState('')
  const [formModoUso, setFormModoUso] = useState('BASE')
  const [itemError, setItemError] = useState(null)
  const [itemSubmitting, setItemSubmitting] = useState(false)

  const [editingItemId, setEditingItemId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [itemParaRemover, setItemParaRemover] = useState(null)
  const [removendoItem, setRemovendoItem] = useState(false)

  // ===== Combo: composição por produtos/bebidas prontos =====
  const [produtosLista, setProdutosLista] = useState([])
  const [comboSelId, setComboSelId] = useState('')
  const [comboQty, setComboQty] = useState('1')
  const [comboError, setComboError] = useState(null)
  const [comboSubmitting, setComboSubmitting] = useState(false)
  const [editComboItemId, setEditComboItemId] = useState(null)
  const [editComboQty, setEditComboQty] = useState('')
  const [togglandoEmbalagemId, setTogglandoEmbalagemId] = useState(null)

  // ===== Combo: insumos adicionais (box, sacola, embalagem especial) =====
  const [comboInsumoSelId, setComboInsumoSelId] = useState('')
  const [comboInsumoQty, setComboInsumoQty] = useState('1')
  const [comboInsumoError, setComboInsumoError] = useState(null)
  const [comboInsumoSubmitting, setComboInsumoSubmitting] = useState(false)
  const [editComboInsumoId, setEditComboInsumoId] = useState(null)
  const [editComboInsumoQty, setEditComboInsumoQty] = useState('')

  function applyFicha(fichaData) {
    setProduto(fichaData.produto)
    setItens(fichaData.itens)
    setFichaTotais({
      custoComMargem: fichaData.custoComMargem ?? 0,
      custoEmbutido: fichaData.custoEmbutido ?? 0,
      custoTotalFicha: fichaData.custoTotalFicha ?? 0
    })
  }

  const custoTotal = fichaTotais.custoTotalFicha

  function loadAll() {
    setLoading(true)
    setError(null)
    Promise.all([
      api.get(`/produtos/${produtoId}/ficha-tecnica`),
      api.get(`/produtos/${produtoId}/analise`),
      api.get('/insumos'),
      api.get('/produtos')
    ])
      .then(([fichaRes, analiseRes, insumosRes, produtosRes]) => {
        const prod = fichaRes.data.produto
        applyFicha(fichaRes.data)
        setAnalise(analiseRes.data)
        setInsumos(insumosRes.data)
        setProdutosLista(produtosRes.data)
        setDadosForm({
          nome: prod.nome ?? '',
          descricao: prod.descricao ?? '',
          precoVenda:
            prod.precoVenda === null || prod.precoVenda === undefined
              ? ''
              : mascaraMoeda(String(Math.round(Number(prod.precoVenda) * 100))),
          // Preserva o tipo ao salvar (payloadFromForm envia tipoProduto)
          tipoProduto: prod.tipoProduto ?? 'PRODUTO',
          custoDireto:
            prod.custoDireto === null || prod.custoDireto === undefined
              ? ''
              : mascaraMoeda(String(Math.round(Number(prod.custoDireto) * 100))),
          // Inteligência do cardápio: carrega os valores atuais para que a edição
          // mostre o estado real e não sobrescreva com defaults ao salvar
          produtoAncora: !!prod.produtoAncora,
          produtoIsca: !!prod.produtoIsca,
          incluirAnaliseEstrategica: !!prod.incluirAnaliseEstrategica,
          tipoBebidaAnalise:
            prod.tipoBebidaAnalise ??
            ((prod.tipoProduto ?? 'PRODUTO') === 'BEBIDA' ? 'COMMODITY' : '')
        })
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
      applyFicha(fichaRes.data)
      setAnalise(analiseRes.data)
      return onChanged()
    })
  }

  useEffect(() => { loadAll() }, [produtoId])

  function handleSaveDados(e) {
    e.preventDefault()
    const err = validateForm(dadosForm)
    if (err) { setDadosError(err); return }
    setDadosError(null)
    setDadosSaving(true)
    api
      .put(`/produtos/${produtoId}`, payloadFromForm(dadosForm))
      .then(() => {
        setToast({ message: 'Dados do produto salvos. CMV e margem recalculados.', type: 'success' })
        return reload()
      })
      .catch((e) =>
        setDadosError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar produto.')
      )
      .finally(() => setDadosSaving(false))
  }

  function handleSelectInsumo(value) {
    setFormInsumoId(value)
    const ins = insumos.find((x) => String(x.id) === value)
    if (ins) {
      setFormTipoUso(sugestaoUso(ins.tipo))
      // Produção própria com receita por porções entra por padrão como
      // "Por unidade" (1 = uma porção da receita); demais insumos usam a base
      setFormModoUso(insumoPermitePorcao(ins) ? 'PORCAO' : 'BASE')
    }
  }

  function resetItemForm() {
    setFormInsumoId('')
    setFormQty('')
    setFormTipoUso('INGREDIENTE')
    setFormRateio('POR_PRODUTO')
    setFormAtendida('')
    setFormModoUso('BASE')
  }

  function openAddItemForm() {
    setItemError(null)
    setShowAddItemForm(true)
  }

  function cancelAddItem() {
    resetItemForm()
    setItemError(null)
    setShowAddItemForm(false)
  }

  // Troca de aba fecha e limpa o formulário de novo item
  function switchTab(tab) {
    setActiveTab(tab)
    if (showAddItemForm) cancelAddItem()
  }

  function handleAddItem(e) {
    e.preventDefault()
    setItemError(null)
    if (!formInsumoId) {
      setItemError('Selecione um insumo válido.')
      return
    }
    const q = Number(formQty)
    if (!Number.isFinite(q) || q <= 0) {
      setItemError('Quantidade deve ser maior que zero.')
      return
    }
    if (formRateio !== 'POR_PRODUTO') {
      const qa = Number(formAtendida)
      if (formAtendida === '' || !Number.isFinite(qa) || qa <= 0) {
        setItemError(`${ATENDIDA_LABEL[formRateio]} é obrigatório e deve ser maior que zero.`)
        return
      }
    }
    setItemSubmitting(true)
    api
      .post(`/produtos/${produtoId}/ficha-tecnica/itens`, {
        insumoId: Number(formInsumoId),
        quantidade: q,
        modoUsoQuantidade:
          insumoPermitePorcao(insumos.find((x) => String(x.id) === formInsumoId)) &&
          formModoUso === 'PORCAO'
            ? 'PORCAO'
            : 'BASE',
        tipoUso: formTipoUso,
        formaRateio: formRateio,
        quantidadeAtendida: formRateio === 'POR_PRODUTO' ? null : Number(formAtendida),
        aplicarMargem: aplicaMargemPorTipoUso(formTipoUso)
      })
      .then(() => {
        resetItemForm()
        setShowAddItemForm(false)
        setToast({ message: 'Item adicionado à ficha.', type: 'success' })
        return reload()
      })
      .catch((err) => {
        setItemError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar item.')
      })
      .finally(() => setItemSubmitting(false))
  }

  function startEditItem(item) {
    setEditingItemId(item.id)
    setEditForm({
      quantidade: String(Number(item.quantidade)),
      tipoUso: item.tipoUso ?? 'INGREDIENTE',
      formaRateio: item.formaRateio ?? 'POR_PRODUTO',
      quantidadeAtendida:
        item.quantidadeAtendida === null || item.quantidadeAtendida === undefined
          ? ''
          : String(Number(item.quantidadeAtendida))
    })
    setEditError(null)
  }
  function cancelEditItem() {
    setEditingItemId(null)
    setEditForm(null)
    setEditError(null)
  }
  function saveEditItem() {
    setEditError(null)
    const q = Number(editForm.quantidade)
    if (!Number.isFinite(q) || q <= 0) {
      setEditError('Quantidade deve ser maior que zero.')
      return
    }
    if (editForm.formaRateio !== 'POR_PRODUTO') {
      const qa = Number(editForm.quantidadeAtendida)
      if (editForm.quantidadeAtendida === '' || !Number.isFinite(qa) || qa <= 0) {
        setEditError(`${ATENDIDA_LABEL[editForm.formaRateio]} é obrigatório e deve ser maior que zero.`)
        return
      }
    }
    setEditSubmitting(true)
    api
      .put(`/ficha-tecnica/itens/${editingItemId}`, {
        quantidade: q,
        tipoUso: editForm.tipoUso,
        formaRateio: editForm.formaRateio,
        quantidadeAtendida:
          editForm.formaRateio === 'POR_PRODUTO' ? null : Number(editForm.quantidadeAtendida),
        aplicarMargem: aplicaMargemPorTipoUso(editForm.tipoUso)
      })
      .then(() => {
        cancelEditItem()
        setToast({ message: 'Item da ficha atualizado.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setEditError(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDeleteItem(item) {
    setItemParaRemover(item)
  }

  function confirmRemoveItem() {
    const item = itemParaRemover
    if (!item) return
    setRemovendoItem(true)
    api
      .delete(`/ficha-tecnica/itens/${item.id}`)
      .then(() => {
        setToast({ message: 'Item removido da ficha.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao remover.',
          type: 'error'
        })
      )
      .finally(() => {
        setRemovendoItem(false)
        setItemParaRemover(null)
      })
  }

  function handleAddComboItem(e) {
    e.preventDefault()
    setComboError(null)
    if (!comboSelId) {
      setComboError('Selecione um produto ou bebida.')
      return
    }
    const q = Number(comboQty)
    if (!Number.isFinite(q) || q <= 0) {
      setComboError('Quantidade deve ser maior que zero.')
      return
    }
    setComboSubmitting(true)
    api
      .post(`/produtos/${produtoId}/combo-itens`, { produtoId: Number(comboSelId), quantidade: q })
      .then(() => {
        setComboSelId('')
        setComboQty('1')
        setToast({ message: 'Item adicionado ao combo.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setComboError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar item.')
      )
      .finally(() => setComboSubmitting(false))
  }

  function handleSaveComboItem(itemId) {
    const q = Number(editComboQty)
    if (!Number.isFinite(q) || q <= 0) {
      setComboError('Quantidade deve ser maior que zero.')
      return
    }
    setComboError(null)
    api
      .put(`/produtos/${produtoId}/combo-itens/${itemId}`, { quantidade: q })
      .then(() => {
        setEditComboItemId(null)
        setEditComboQty('')
        return reload()
      })
      .catch((err) =>
        setComboError(err?.response?.data?.error ?? err?.message ?? 'Erro ao atualizar item.')
      )
  }

  function handleRemoveComboItem(itemId) {
    setComboError(null)
    api
      .delete(`/produtos/${produtoId}/combo-itens/${itemId}`)
      .then(() => {
        setToast({ message: 'Item removido do combo.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setComboError(err?.response?.data?.error ?? err?.message ?? 'Erro ao remover item.')
      )
  }

  // Liga/desliga a embalagem individual de um item do combo (padrão: desligada)
  function handleToggleEmbalagem(item) {
    setComboError(null)
    setTogglandoEmbalagemId(item.id)
    api
      .put(`/produtos/${produtoId}/combo-itens/${item.id}`, {
        incluirEmbalagemIndividual: !item.incluirEmbalagemIndividual
      })
      .then(() => reload())
      .catch((err) =>
        setComboError(err?.response?.data?.error ?? err?.message ?? 'Erro ao atualizar embalagem.')
      )
      .finally(() => setTogglandoEmbalagemId(null))
  }

  function handleAddComboInsumo(e) {
    e.preventDefault()
    setComboInsumoError(null)
    if (!comboInsumoSelId) {
      setComboInsumoError('Selecione um insumo.')
      return
    }
    const q = Number(comboInsumoQty)
    if (!Number.isFinite(q) || q <= 0) {
      setComboInsumoError('Quantidade deve ser maior que zero.')
      return
    }
    setComboInsumoSubmitting(true)
    api
      .post(`/produtos/${produtoId}/combo-insumos`, { insumoId: Number(comboInsumoSelId), quantidade: q })
      .then(() => {
        setComboInsumoSelId('')
        setComboInsumoQty('1')
        setToast({ message: 'Insumo adicionado ao combo.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setComboInsumoError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar insumo.')
      )
      .finally(() => setComboInsumoSubmitting(false))
  }

  function handleSaveComboInsumo(itemId) {
    const q = Number(editComboInsumoQty)
    if (!Number.isFinite(q) || q <= 0) {
      setComboInsumoError('Quantidade deve ser maior que zero.')
      return
    }
    setComboInsumoError(null)
    api
      .put(`/produtos/${produtoId}/combo-insumos/${itemId}`, { quantidade: q })
      .then(() => {
        setEditComboInsumoId(null)
        setEditComboInsumoQty('')
        return reload()
      })
      .catch((err) =>
        setComboInsumoError(err?.response?.data?.error ?? err?.message ?? 'Erro ao atualizar insumo.')
      )
  }

  function handleRemoveComboInsumo(itemId) {
    setComboInsumoError(null)
    api
      .delete(`/produtos/${produtoId}/combo-insumos/${itemId}`)
      .then(() => {
        setToast({ message: 'Insumo removido do combo.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setComboInsumoError(err?.response?.data?.error ?? err?.message ?? 'Erro ao remover insumo.')
      )
  }

  const status = analise?.statusCmv
  // Badge do cabeçalho do modal segue a saúde geral; o card "CMV do Produto"
  // continua colorido pelo statusCmv
  const statusGeralModal = analise?.statusGeral ?? status
  const semFicha = status === 'SEM_FICHA'
  // BEBIDA e COMBO usam corpo simplificado (sem ficha técnica/precificação por CMV)
  const tipoModalProduto = produto?.tipoProduto ?? 'PRODUTO'
  // Elegíveis para compor combo: produtos e bebidas ativos (nunca outro combo)
  const elegiveisCombo = produtosLista.filter(
    (p) => (p.tipoProduto ?? 'PRODUTO') !== 'COMBO' && p.id !== produtoId
  )
  const comboItensResumo = analise?.comboItensResumo ?? []
  const comboInsumosResumo = analise?.comboInsumosResumo ?? []
  // Insumos elegíveis como custo adicional do combo: insumos ativos do cadastro
  const elegiveisInsumosCombo = insumos.filter((i) => i.ativo !== false)

  const insumoSelecionado = insumos.find((x) => String(x.id) === formInsumoId)
  const insumoSelUnidade = insumoSelecionado
    ? unidadeNormalizada(insumoSelecionado.unidade)
    : null
  const selPermitePorcao = insumoPermitePorcao(insumoSelecionado)
  const usandoPorcao = selPermitePorcao && formModoUso === 'PORCAO'
  const selCustoPorUnidade = selPermitePorcao ? custoPorUnidadePorcao(insumoSelecionado) : null
  const selPesoPorcao = selPermitePorcao
    ? Number(insumoSelecionado.receitaProducao?.pesoPorcao)
    : null

  const alertasFicha = loading || error ? [] : buildAlertasFicha(analise, itens)

  const alertasBlock = alertasFicha.length > 0 && (
    <>
      <div className="section-title">Alertas da Ficha Técnica</div>
      <div className="alert alert-yellow" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alertasFicha.map((a) => (
            <div key={a} className="alert-msg">• {a}</div>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large">
        <div className="modal-header">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--app-text)' }}>
              {produto?.nome ?? 'Ficha do produto'}
            </span>
            {statusGeralModal && (
              <span className={'badge ' + (STATUS_BADGE[statusGeralModal] ?? 'badge-gray')}>
                {STATUS_LABEL[statusGeralModal] ?? statusGeralModal}
              </span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Carregando ficha do produto…</div>
        ) : error ? (
          <div className="alert alert-red">
            <div>
              <div className="alert-title clr-red">Não foi possível carregar a ficha</div>
              <div className="alert-msg">{error}</div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={loadAll}>
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : tipoModalProduto !== 'PRODUTO' ? (
          <>
            {/* Corpo simplificado: bebida (revenda) e combo (composição futura) */}
            <div className="section-title" style={{ marginTop: 0 }}>
              {tipoModalProduto === 'BEBIDA' ? 'Dados da Bebida' : 'Dados do Combo'}
            </div>
            <div className="card">
              <form onSubmit={handleSaveDados}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
                    <label className="form-label">Nome</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.nome}
                      onChange={(e) => setDadosForm({ ...dadosForm, nome: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                    <label className="form-label">Preço de venda (R$)</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      value={dadosForm.precoVenda}
                      onChange={(e) => setDadosForm({ ...dadosForm, precoVenda: mascaraMoeda(e.target.value) })}
                    />
                  </div>
                  {tipoModalProduto === 'BEBIDA' && (
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                      <label className="form-label">Custo de compra (R$)</label>
                      <input
                        className="form-input"
                        type="text"
                        inputMode="numeric"
                        value={dadosForm.custoDireto}
                        onChange={(e) => setDadosForm({ ...dadosForm, custoDireto: mascaraMoeda(e.target.value) })}
                      />
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={dadosSaving}>
                    {dadosSaving ? 'Salvando…' : 'Salvar dados'}
                  </button>
                </div>
                <InteligenciaCardapioFields
                  form={dadosForm}
                  onChange={(patch) => setDadosForm({ ...dadosForm, ...patch })}
                />
                {dadosError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{dadosError}</div>
                  </div>
                )}
              </form>
            </div>

            {tipoModalProduto === 'BEBIDA' ? (
              <>
                <div className="section-title">Resumo da Revenda</div>
                <div className="grid-4">
                  <Card title="Preço de Venda" value={brl(analise?.precoVenda)} hint="Cadastrado na bebida" variant="brand" />
                  <Card
                    title="Custo de Compra"
                    value={
                      analise?.produto?.custoDireto === null || analise?.produto?.custoDireto === undefined
                        ? '—'
                        : brl(analise.produto.custoDireto)
                    }
                    hint="Custo de revenda"
                  />
                  <Card
                    title="Lucro Bruto"
                    value={
                      analise?.lucroBrutoReal === null || analise?.lucroBrutoReal === undefined
                        ? '—'
                        : brl(analise.lucroBrutoReal)
                    }
                    hint="Preço − custo de compra"
                    variant={analise?.lucroBrutoReal !== null && Number(analise?.lucroBrutoReal) > 0 ? 'success' : 'info'}
                  />
                  <Card
                    title="Margem sobre Venda"
                    value={pct(analise?.margemRealPercentual)}
                    hint="Lucro / preço de venda"
                    variant={
                      statusGeralModal === 'SAUDAVEL' ? 'success'
                      : statusGeralModal === 'ATENCAO' ? 'warn'
                      : statusGeralModal === 'CRITICO' ? 'danger'
                      : 'info'
                    }
                  />
                </div>
                {analise?.mensagemDiagnostico && (
                  <div
                    className={
                      'alert ' +
                      (statusGeralModal === 'CRITICO'
                        ? 'alert-red'
                        : statusGeralModal === 'ATENCAO'
                        ? 'alert-yellow'
                        : statusGeralModal === 'SAUDAVEL'
                        ? 'alert-green'
                        : 'alert-gray')
                    }
                    style={{ marginTop: 12 }}
                  >
                    <div className="alert-msg">{analise.mensagemDiagnostico}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* ===== Itens do combo: produtos/bebidas prontos ===== */}
                <div className="section-title">Itens do Combo</div>
                <div className="card">
                  <form onSubmit={handleAddComboItem}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 220 }}>
                        <label className="form-label">Produto ou bebida</label>
                        <InsumoAutocomplete
                          insumos={elegiveisCombo}
                          value={comboSelId}
                          onChange={setComboSelId}
                          placeholder="Digite para buscar produto ou bebida..."
                          getOptionLabel={(p) =>
                            `${p.nome} — ${brl(p.precoVenda)} · ${
                              (p.tipoProduto ?? 'PRODUTO') === 'BEBIDA' ? 'Bebida' : 'Produto'
                            }`
                          }
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 0.6, minWidth: 90 }}>
                        <label className="form-label">Quantidade</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.5"
                          value={comboQty}
                          onChange={(e) => setComboQty(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={comboSubmitting}>
                        {comboSubmitting ? 'Adicionando…' : 'Adicionar item'}
                      </button>
                    </div>
                    {comboError && (
                      <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                        <div className="alert-msg clr-red">{comboError}</div>
                      </div>
                    )}
                  </form>

                  {comboItensResumo.length === 0 ? (
                    <div className="empty-state" style={{ padding: '24px 16px' }}>
                      Monte o combo com produtos e bebidas. Adicione o primeiro item acima.
                    </div>
                  ) : (
                    <div className="table-card" style={{ marginTop: 14 }}>
                      <table className="hb-table hb-table-compact">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Tipo</th>
                            <th>Qtd</th>
                            <th>Preço unit.</th>
                            <th>Custo unit.</th>
                            <th>Emb. individual</th>
                            <th>Total venda</th>
                            <th>Total custo</th>
                            <th style={{ textAlign: 'right' }}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comboItensResumo.map((item) => (
                            <tr key={item.id}>
                              <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{item.nome}</td>
                              <td>
                                <span className={'badge ' + (item.tipoProduto === 'BEBIDA' ? 'badge-blue' : 'badge-gray')}>
                                  {item.tipoProduto === 'BEBIDA' ? 'Bebida' : 'Produto'}
                                </span>
                              </td>
                              <td>
                                {editComboItemId === item.id ? (
                                  <input
                                    className="form-input"
                                    style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={editComboQty}
                                    onChange={(e) => setEditComboQty(e.target.value)}
                                  />
                                ) : (
                                  <strong>{num(item.quantidade)}x</strong>
                                )}
                              </td>
                              <td>{brl(item.precoVendaUnitario)}</td>
                              <td>{brl(item.custoRealUnitario)}</td>
                              <td>
                                {item.ehProduto ? (
                                  <label
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', cursor: 'pointer' }}
                                    title="Quando marcado, inclui a embalagem individual do produto no custo do combo"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!!item.incluirEmbalagemIndividual}
                                      disabled={togglandoEmbalagemId === item.id}
                                      onChange={() => handleToggleEmbalagem(item)}
                                    />
                                    Incluir
                                    {item.custoEmbalagemUnitario > 0 && (
                                      <span className="clr-muted">({brl(item.custoEmbalagemUnitario)})</span>
                                    )}
                                  </label>
                                ) : (
                                  <span className="clr-muted">—</span>
                                )}
                              </td>
                              <td>{brl(item.totalVenda)}</td>
                              <td>{brl(item.totalCusto)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  {editComboItemId === item.id ? (
                                    <>
                                      <button type="button" className="btn btn-primary" onClick={() => handleSaveComboItem(item.id)}>
                                        Salvar
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => { setEditComboItemId(null); setEditComboQty('') }}
                                      >
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => { setEditComboItemId(item.id); setEditComboQty(String(item.quantidade)) }}
                                      >
                                        Editar
                                      </button>
                                      <button type="button" className="btn btn-danger" onClick={() => handleRemoveComboItem(item.id)}>
                                        Remover
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ===== Custos adicionais do combo: box, sacola, embalagem especial ===== */}
                <div className="section-title">Custos Adicionais do Combo</div>
                <div className="card">
                  <div style={{ fontSize: 11.5, color: '#999', marginBottom: 12 }}>
                    Insumos usados só no combo (box única, sacola, embalagem especial, brinde).
                    Por padrão, as embalagens individuais dos produtos não entram no custo do combo.
                  </div>
                  <form onSubmit={handleAddComboInsumo}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 220 }}>
                        <label className="form-label">Insumo</label>
                        <InsumoAutocomplete
                          insumos={elegiveisInsumosCombo}
                          value={comboInsumoSelId}
                          onChange={setComboInsumoSelId}
                          placeholder="Digite para buscar um insumo..."
                          getOptionLabel={(i) => `${i.nome} — ${brl(i.custoUnitario)}/${i.unidade}`}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 0.6, minWidth: 90 }}>
                        <label className="form-label">Quantidade</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.5"
                          value={comboInsumoQty}
                          onChange={(e) => setComboInsumoQty(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={comboInsumoSubmitting}>
                        {comboInsumoSubmitting ? 'Adicionando…' : 'Adicionar insumo'}
                      </button>
                    </div>
                    {comboInsumoError && (
                      <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                        <div className="alert-msg clr-red">{comboInsumoError}</div>
                      </div>
                    )}
                  </form>

                  {comboInsumosResumo.length === 0 ? (
                    <div className="empty-state" style={{ padding: '24px 16px' }}>
                      Nenhum custo adicional. Adicione a embalagem própria do combo acima, se houver.
                    </div>
                  ) : (
                    <div className="table-card" style={{ marginTop: 14 }}>
                      <table className="hb-table hb-table-compact">
                        <thead>
                          <tr>
                            <th>Insumo</th>
                            <th>Qtd</th>
                            <th>Custo unit.</th>
                            <th>Custo total</th>
                            <th style={{ textAlign: 'right' }}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comboInsumosResumo.map((ci) => (
                            <tr key={ci.id}>
                              <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{ci.nome}</td>
                              <td>
                                {editComboInsumoId === ci.id ? (
                                  <input
                                    className="form-input"
                                    style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={editComboInsumoQty}
                                    onChange={(e) => setEditComboInsumoQty(e.target.value)}
                                  />
                                ) : (
                                  <strong>{num(ci.quantidade)} {ci.unidade}</strong>
                                )}
                              </td>
                              <td>{brl(ci.custoUnitario)}</td>
                              <td>{brl(ci.custoTotal)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  {editComboInsumoId === ci.id ? (
                                    <>
                                      <button type="button" className="btn btn-primary" onClick={() => handleSaveComboInsumo(ci.id)}>
                                        Salvar
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => { setEditComboInsumoId(null); setEditComboInsumoQty('') }}
                                      >
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => { setEditComboInsumoId(ci.id); setEditComboInsumoQty(String(ci.quantidade)) }}
                                      >
                                        Editar
                                      </button>
                                      <button type="button" className="btn btn-danger" onClick={() => handleRemoveComboInsumo(ci.id)}>
                                        Remover
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ===== Resumo do combo ===== */}
                <div className="section-title">Resumo do Combo</div>
                <div className="grid-3">
                  <Card
                    title="Valor de Referência do Combo"
                    value={comboItensResumo.length === 0 ? '—' : brl(analise?.valorReferenciaCombo)}
                    hint="Produtos/bebidas + adicionais exclusivos do combo"
                  />
                  <Card
                    title="Preço do Combo"
                    value={brl(analise?.precoVenda)}
                    hint="Cadastrado no combo"
                    variant="brand"
                  />
                  {(() => {
                    const d = analise?.descontoCombo
                    if (d === null || d === undefined) {
                      return <Card title="Desconto do Combo" value="—" hint="Referência − preço do combo" />
                    }
                    const dn = Number(d)
                    if (dn > 0) {
                      return (
                        <Card
                          title="Economia do Combo"
                          value={brl(dn)}
                          hint={
                            analise?.percentualDescontoCombo === null || analise?.percentualDescontoCombo === undefined
                              ? 'Referência − preço do combo'
                              : `${pct(analise.percentualDescontoCombo)} do valor de referência`
                          }
                          variant="success"
                        />
                      )
                    }
                    if (dn === 0) {
                      return <Card title="Economia do Combo" value="Sem desconto" hint="Preço igual ao valor de referência" />
                    }
                    return (
                      <Card
                        title="Economia do Combo"
                        value={`${brl(Math.abs(dn))} mais caro`}
                        hint="Preço acima do valor de referência"
                        variant="danger"
                      />
                    )
                  })()}
                </div>
                {comboItensResumo.length > 0 && (
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 2, marginBottom: 2 }}>
                    Referência = produtos/bebidas separados ({brl(analise?.valorItensSeparados)})
                    {Number(analise?.custoAdicionaisCombo) > 0
                      ? ` + adicionais exclusivos do combo (${brl(analise?.custoAdicionaisCombo)})`
                      : ' (sem adicionais)'}
                  </div>
                )}
                <div className="grid-3">
                  <Card
                    title="Custo Total do Combo"
                    value={comboItensResumo.length === 0 ? '—' : brl(analise?.custoTotalCombo)}
                    hint="Itens (com embalagem marcada) + adicionais do combo"
                  />
                  <Card
                    title="CMV do Combo"
                    value={
                      analise?.cmvComboPercentual === null || analise?.cmvComboPercentual === undefined
                        ? '—'
                        : pct(analise.cmvComboPercentual)
                    }
                    hint="Custo total / preço do combo"
                  />
                  <Card
                    title="Lucro Bruto do Combo"
                    value={
                      analise?.lucroBrutoCombo === null || analise?.lucroBrutoCombo === undefined
                        ? '—'
                        : brl(analise.lucroBrutoCombo)
                    }
                    hint={
                      analise?.margemComboPercentual === null ||
                      analise?.margemComboPercentual === undefined
                        ? 'Preço − custo total'
                        : `Margem: ${pct(analise.margemComboPercentual)}`
                    }
                    variant={
                      analise?.lucroBrutoCombo !== null && Number(analise?.lucroBrutoCombo) > 0
                        ? 'success'
                        : 'info'
                    }
                  />
                </div>

                {/* Composição discreta do custo total do combo */}
                {comboItensResumo.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: '12px 14px',
                      background: 'var(--app-surface-2)',
                      border: '1px solid #f0f0f0',
                      borderRadius: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={metricRowStyle}>
                      <span style={metricLabelStyle}>Custo dos itens do combo</span>
                      <span>{brl(analise?.custoItensCombo)}</span>
                    </div>
                    {Number(analise?.embalagensDesconsideradas) > 0 && (
                      <div style={metricRowStyle}>
                        <span style={metricLabelStyle}>Embalagens individuais desconsideradas</span>
                        <span className="clr-muted">− {brl(analise?.embalagensDesconsideradas)}</span>
                      </div>
                    )}
                    {Number(analise?.custoAdicionaisCombo) > 0 && (
                      <div style={metricRowStyle}>
                        <span style={metricLabelStyle}>Custos adicionais do combo</span>
                        <span className="clr-orange">+ {brl(analise?.custoAdicionaisCombo)}</span>
                      </div>
                    )}
                    <div style={{ ...metricRowStyle, borderBottom: 'none', fontWeight: 600 }}>
                      <span style={{ ...metricLabelStyle, color: 'var(--app-text)' }}>Custo total real do combo</span>
                      <span>{brl(analise?.custoTotalCombo)}</span>
                    </div>
                  </div>
                )}
                {analise?.mensagemDiagnostico && (
                  <div
                    className={
                      'alert ' +
                      (statusGeralModal === 'CRITICO'
                        ? 'alert-red'
                        : statusGeralModal === 'ATENCAO'
                        ? 'alert-yellow'
                        : statusGeralModal === 'SAUDAVEL'
                        ? 'alert-green'
                        : 'alert-gray')
                    }
                    style={{ marginTop: 12 }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="alert-msg">{analise.mensagemDiagnostico}</div>
                      {(analise?.alertasCombo ?? [])
                        .filter((al) => al !== analise.mensagemDiagnostico)
                        .map((al) => (
                          <div key={al} className="alert-msg">• {al}</div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="modal-tabs">
              <button
                type="button"
                className={'modal-tab' + (activeTab === 'PRECIFICACAO' ? ' active' : '')}
                onClick={() => switchTab('PRECIFICACAO')}
              >
                Precificação
              </button>
              <button
                type="button"
                className={'modal-tab' + (activeTab === 'FICHA' ? ' active' : '')}
                onClick={() => switchTab('FICHA')}
              >
                Ficha Técnica
              </button>
            </div>

            {/* Wrapper comum: as duas abas vivem no MESMO painel com altura padronizada */}
            <div className="product-tab-panel">
            {activeTab === 'PRECIFICACAO' && (
            <>
            {/* Seção 1 — Dados do produto */}
            <div className="section-title" style={{ marginTop: 0 }}>Dados do Produto</div>
            <div className="card">
              <form onSubmit={handleSaveDados}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1.2, minWidth: 170 }}>
                    <label className="form-label">Nome</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.nome}
                      onChange={(e) => setDadosForm({ ...dadosForm, nome: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1.6, minWidth: 200 }}>
                    <label className="form-label">Descrição (opcional)</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.descricao}
                      onChange={(e) => setDadosForm({ ...dadosForm, descricao: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 0.8, minWidth: 130 }}>
                    <label className="form-label">Preço de venda (R$)</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      value={dadosForm.precoVenda}
                      onChange={(e) => setDadosForm({ ...dadosForm, precoVenda: mascaraMoeda(e.target.value) })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={dadosSaving}>
                    {dadosSaving ? 'Salvando…' : 'Salvar dados do produto'}
                  </button>
                </div>
                <InteligenciaCardapioFields
                  form={dadosForm}
                  onChange={(patch) => setDadosForm({ ...dadosForm, ...patch })}
                />
                {dadosError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{dadosError}</div>
                  </div>
                )}
              </form>
            </div>

            {/* Seção 2 — Resumo financeiro: CMV do produto separado do custo embutido */}
            <div className="section-title">Resumo Financeiro</div>
            <div className="grid-3">
              <Card title="Preço de Venda" value={brl(analise?.precoVenda)} hint="Cadastrado no produto" variant="brand" />
              <Card
                title="Custo do Produto"
                value={brl(analise?.custoProduto)}
                hint={semFicha ? 'Sem itens na ficha' : 'Ingredientes com preço sugerido'}
              />
              <Card
                title="CMV do Produto"
                value={pct(analise?.cmvProdutoPercentual)}
                hint={semFicha ? 'Adicione insumos' : 'Custo do produto / preço de venda'}
                variant={
                  status === 'SAUDAVEL' ? 'success'
                  : status === 'ATENCAO' ? 'warn'
                  : status === 'ALERTA' ? 'brand'
                  : status === 'CRITICO' ? 'danger'
                  : 'info'
                }
              />
            </div>
            <div className="grid-3">
              <Card
                title="Custo Embutido"
                value={brl(analise?.custoEmbutido)}
                hint="Embalagem, acompanhamento e operacional"
              />
              <Card
                title="Custo Total Real"
                value={brl(custoTotal)}
                hint={`Produto + embutido${
                  analise?.percentualTotalReal === null || analise?.percentualTotalReal === undefined
                    ? ''
                    : ` · ${pct(analise.percentualTotalReal)} do preço`
                }`}
              />
              <Card
                title="Lucro Bruto Real"
                value={analise?.lucroBrutoReal === null || analise?.lucroBrutoReal === undefined
                  ? '—'
                  : brl(analise.lucroBrutoReal)}
                hint={`Preço − custo total real${
                  analise?.margemRealPercentual === null || analise?.margemRealPercentual === undefined
                    ? ''
                    : ` · margem ${pct(analise.margemRealPercentual)}`
                }`}
                variant={analise?.lucroBrutoReal !== null && Number(analise?.lucroBrutoReal) > 0 ? 'success' : 'info'}
              />
            </div>

            {/* Alertas informativos da ficha técnica */}
            {alertasBlock}

            {/* Seção 3 — Precificação técnica */}
            <div className="section-title">Precificação Técnica</div>
            <div className="grid-2">
              <div className="card">
                <div className="card-label">Venda Direta</div>
                <MetricRow label="CMV alvo">{pct(analise?.cmvAlvoPercentual)}</MetricRow>
                <MetricRow label="Lucro desejado">{pct(analise?.lucroDesejadoPercentual)}</MetricRow>
                <MetricRow label="Custo do produto">{brl(analise?.custoProduto)}</MetricRow>
                <MetricRow label="Custo embutido">{brl(analise?.custoEmbutido)}</MetricRow>
                <MetricRow label="Preço sugerido">
                  <span style={{ fontWeight: 600 }} className="clr-blue">
                    {analise?.precoSugerido === null || analise?.precoSugerido === undefined
                      ? 'Pendente'
                      : brl(analise.precoSugerido)}
                  </span>
                </MetricRow>
                <MetricRow label="Preço atual">{brl(analise?.precoVenda)}</MetricRow>
                <MetricRow label="Diferença para preço atual">
                  {analise?.diferencaPrecoSugerido === null || analise?.diferencaPrecoSugerido === undefined
                    ? <span className="clr-muted">—</span>
                    : (
                      <span
                        style={{ fontWeight: 600 }}
                        className={Number(analise.diferencaPrecoSugerido) >= 0 ? 'clr-green' : 'clr-red'}
                      >
                        {brl(analise.diferencaPrecoSugerido)}
                      </span>
                    )}
                </MetricRow>
              </div>
              <div className="card">
                <div className="card-label">iFood</div>
                <MetricRow label="Preço de venda (base)">
                  <span style={{ fontWeight: 600 }}>{brl(analise?.precoVenda)}</span>
                </MetricRow>
                <MetricRow label="Taxa iFood">{pct(analise?.taxaIfoodPercentual)}</MetricRow>
                <MetricRow label="Campanha Inteligente">{brl(analise?.campanhaInteligente)}</MetricRow>
                <MetricRow label="Maior taxa de entrega">{brl(analise?.maiorTaxaEntrega)}</MetricRow>
                <MetricRow label="Cupom">{brl(analise?.cupomDesconto)}</MetricRow>
                <MetricRow label="Ticket médio delivery">{brl(analise?.ticketMedioDelivery)}</MetricRow>
                <MetricRow label="Custos iFood rateáveis">{brl(analise?.custosIfoodRateaveis)}</MetricRow>
                <MetricRow label="Valor rateado no produto">{brl(analise?.valorCustosIfoodRateados)}</MetricRow>
                <MetricRow label="Preço base com taxa">{brl(analise?.precoIfoodBaseTaxas)}</MetricRow>
                <MetricRow label="Preço iFood final">
                  <span style={{ fontWeight: 600 }} className="clr-orange">
                    {analise?.precoIfood === null || analise?.precoIfood === undefined
                      ? 'Pendente'
                      : brl(analise.precoIfood)}
                  </span>
                </MetricRow>
              </div>
            </div>
            </>
            )}

            {activeTab === 'FICHA' && (
            <>
            {alertasBlock}

            {/* Seção 4 — Ficha técnica */}
            <div className="section-title">Ficha Técnica</div>

            <div className="table-card table-card-form">
              {itens.length === 0 ? (
                <div className="empty-state" style={{ padding: '28px 16px' }}>
                  Ficha técnica vazia. Adicione o primeiro insumo no formulário abaixo — assim que
                  houver pelo menos um item, o CMV e a margem serão recalculados.
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="hb-table hb-table-compact">
                    <thead>
                      <tr>
                        <th>Insumo</th>
                        <th>Uso</th>
                        <th>Custo unit.</th>
                        <th>Qtd.</th>
                        <th>Rateio</th>
                        <th>Qtd. atendida</th>
                        <th>Composição</th>
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

                        const rendItem = rendimentoInsumo(item.insumo)
                        const fatorItem = rendItem ? 1 / rendItem : 1

                        let custoAplicadoExibido
                        if (isEditing && editForm) {
                          const q = Number(editForm.quantidade)
                          const qBase = divideMil ? q / 1000 : q
                          const qa = Number(editForm.quantidadeAtendida)
                          const divisor =
                            editForm.formaRateio !== 'POR_PRODUTO' && qa > 0 ? qa : 1
                          // Aplica a perda no preparo também na prévia de edição.
                          custoAplicadoExibido = q > 0 ? ((qBase * custoUnit) / divisor) * fatorItem : 0
                        } else {
                          custoAplicadoExibido = item.custoAplicado
                        }

                        return (
                          <tr key={item.id} style={isEditing ? { background: 'var(--app-highlight)' } : undefined}>
                            <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{item.insumo.nome}</td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="form-input"
                                  style={{ ...cellInputStyle, width: 118 }}
                                  value={editForm.tipoUso}
                                  onChange={(e) => setEditForm({ ...editForm, tipoUso: e.target.value })}
                                >
                                  {TIPO_USO_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="badge badge-gray">
                                  {TIPO_USO_LABEL[item.tipoUso] ?? item.tipoUso}
                                </span>
                              )}
                            </td>
                            <td className={rendItem ? 'clr-perda' : undefined} style={rendItem ? { fontWeight: 600 } : undefined}>
                              {rendItem ? (
                                <span title="Custo unitário pós-perda no preparo">{brl(custoUnit / rendItem)}</span>
                              ) : (
                                brl(custoUnit)
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="form-input"
                                  style={{ ...cellInputStyle, width: 76 }}
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  value={editForm.quantidade}
                                  onChange={(e) => setEditForm({ ...editForm, quantidade: e.target.value })}
                                  autoFocus
                                />
                              ) : (
                                <strong>
                                  {num(item.quantidade)} {item.unidadeQuantidadeFicha ?? sufixoQuantidade(item.insumo.unidade)}
                                </strong>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="form-input"
                                  style={{ ...cellInputStyle, width: 126 }}
                                  value={editForm.formaRateio}
                                  onChange={(e) => setEditForm({ ...editForm, formaRateio: e.target.value })}
                                >
                                  {RATEIO_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ fontSize: 12, color: '#666' }}>
                                  {RATEIO_LABEL[item.formaRateio] ?? item.formaRateio}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                editForm.formaRateio === 'POR_PRODUTO' ? (
                                  <span className="clr-muted">—</span>
                                ) : (
                                  <input
                                    className="form-input"
                                    style={{ ...cellInputStyle, width: 70 }}
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={editForm.quantidadeAtendida}
                                    onChange={(e) =>
                                      setEditForm({ ...editForm, quantidadeAtendida: e.target.value })
                                    }
                                    placeholder="Ex.: 2"
                                  />
                                )
                              ) : item.quantidadeAtendida === null || item.quantidadeAtendida === undefined ? (
                                <span className="clr-muted">—</span>
                              ) : (
                                num(item.quantidadeAtendida)
                              )}
                            </td>
                            <td>
                              <ComposicaoBadge
                                aplicarMargem={
                                  isEditing
                                    ? aplicaMargemPorTipoUso(editForm.tipoUso)
                                    : item.aplicarMargem
                                }
                              />
                            </td>
                            <td className={rendItem ? 'clr-perda' : 'clr-orange'} style={{ fontWeight: 600 }}>
                              {rendItem ? (
                                <span title="Custo já ajustado pela perda no preparo">{brl(custoAplicadoExibido)}</span>
                              ) : (
                                brl(custoAplicadoExibido)
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {isEditing ? (
                                  <>
                                    <button type="button" className="btn btn-primary btn-sm" onClick={saveEditItem} disabled={editSubmitting}>
                                      {editSubmitting ? 'Salvando…' : 'Salvar'}
                                    </button>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditItem} disabled={editSubmitting}>
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEditItem(item)}>
                                      Editar
                                    </button>
                                    <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteItem(item)}>
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

              {/* Adição integrada à ficha (continuação do card) */}
              <div className="ficha-add-area">
                {!showAddItemForm ? (
                  <button type="button" className="ficha-add-trigger" onClick={openAddItemForm}>
                    + Adicionar novo item
                  </button>
                ) : (
                <>
                <div className="ficha-add-title">Adicionar novo item</div>
                <form onSubmit={handleAddItem}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
                    <label className="form-label">Insumo</label>
                    <InsumoAutocomplete
                      insumos={insumos}
                      value={formInsumoId}
                      onChange={handleSelectInsumo}
                      placeholder="Digite para buscar o insumo..."
                    />
                  </div>
                  {selPermitePorcao && (
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                      <label className="form-label">Modo de uso</label>
                      <select
                        className="form-input"
                        value={formModoUso}
                        onChange={(e) => setFormModoUso(e.target.value)}
                      >
                        <option value="PORCAO">Por unidade</option>
                        <option value="BASE">
                          {insumoSelUnidade === 'Kg'
                            ? 'Por peso (g)'
                            : insumoSelUnidade === 'L'
                            ? 'Por volume (ml)'
                            : 'Por unidade base'}
                        </option>
                      </select>
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: 0, flex: 0.8, minWidth: 100 }}>
                    <label className="form-label">
                      {usandoPorcao
                        ? 'Quantidade (und)'
                        : insumoSelUnidade === 'Kg'
                        ? 'Quantidade (g)'
                        : insumoSelUnidade === 'L'
                        ? 'Quantidade (ml)'
                        : insumoSelUnidade === 'Und'
                        ? 'Quantidade (und)'
                        : 'Quantidade'}
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      placeholder={
                        usandoPorcao
                          ? 'Ex.: 1'
                          : insumoSelUnidade === 'Kg'
                          ? 'Ex.: 120'
                          : insumoSelUnidade === 'L'
                          ? 'Ex.: 300'
                          : 'Ex.: 1'
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                    <label className="form-label">Tipo de uso</label>
                    <select
                      className="form-input"
                      value={formTipoUso}
                      onChange={(e) => setFormTipoUso(e.target.value)}
                    >
                      {TIPO_USO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                    <label className="form-label">Forma de rateio</label>
                    <select
                      className="form-input"
                      value={formRateio}
                      onChange={(e) => setFormRateio(e.target.value)}
                    >
                      {RATEIO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {formRateio !== 'POR_PRODUTO' && (
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                      <label className="form-label">{ATENDIDA_LABEL[formRateio]}</label>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.001"
                        value={formAtendida}
                        onChange={(e) => setFormAtendida(e.target.value)}
                        placeholder="Ex.: 2"
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
                    <label className="form-label">Composição</label>
                    <div style={{ display: 'flex', alignItems: 'center', minHeight: 37 }}>
                      <ComposicaoBadge aplicarMargem={aplicaMargemPorTipoUso(formTipoUso)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={cancelAddItem}
                      disabled={itemSubmitting}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={itemSubmitting}>
                      {itemSubmitting ? 'Adicionando…' : 'Adicionar item'}
                    </button>
                  </div>
                </div>
                {usandoPorcao ? (
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                    {insumoSelUnidade === 'Kg' || insumoSelUnidade === 'L'
                      ? `Cada unidade equivale a ${num(selPesoPorcao)} ${
                          insumoSelUnidade === 'Kg' ? 'g' : 'ml'
                        } e custa ${brl(selCustoPorUnidade)}.`
                      : `Cada unidade custa ${brl(selCustoPorUnidade)}.`}
                  </div>
                ) : (
                  <>
                    {insumoSelUnidade === 'Kg' && (
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                        Este insumo é cadastrado por kg. Informe aqui a quantidade em gramas.
                      </div>
                    )}
                    {insumoSelUnidade === 'L' && (
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                        Este insumo é cadastrado por litro. Informe aqui a quantidade em ml.
                      </div>
                    )}
                    {insumoSelUnidade === 'Und' && (
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                        Este insumo é cadastrado por unidade. Informe aqui a quantidade de unidades.
                      </div>
                    )}
                  </>
                )}
                {itemError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{itemError}</div>
                  </div>
                )}
                {insumos.length === 0 && (
                  <div className="alert alert-yellow" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-yellow">
                      Nenhum insumo ativo cadastrado. Cadastre insumos antes de montar a ficha.
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

            {itens.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: '14px 18px',
                  background: 'var(--app-surface)',
                  border: '0.5px solid #e8e8e8',
                  borderRadius: 12,
                  fontSize: 13,
                  color: 'var(--app-text-2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                  <span>Custo do produto (preço sugerido)</span>
                  <strong style={{ fontSize: 14, color: 'var(--app-text)' }}>{brl(fichaTotais.custoComMargem)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                  <span>Custo embutido (embalagem/acompanhamento)</span>
                  <strong style={{ fontSize: 14, color: 'var(--app-text)' }}>{brl(fichaTotais.custoEmbutido)}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 6,
                    paddingTop: 8,
                    borderTop: '1px solid #f0f0f0'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Custo total real</span>
                  <strong className="clr-orange" style={{ fontSize: 18 }}>{brl(custoTotal)}</strong>
                </div>
              </div>
            )}
            </>
            )}
            </div>
          </>
        )}

        <ConfirmDialog
          open={itemParaRemover !== null}
          title="Remover item da ficha?"
          message={
            itemParaRemover
              ? `Você está prestes a remover "${itemParaRemover.insumo?.nome}" da ficha técnica deste produto.`
              : ''
          }
          description="Essa ação recalcula o custo da ficha e os preços sugeridos."
          confirmLabel="Remover item"
          cancelLabel="Cancelar"
          variant="danger"
          loading={removendoItem}
          onConfirm={confirmRemoveItem}
          onCancel={() => setItemParaRemover(null)}
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
