// Checklist Inteligente — rotinas padronizadas da operação, com registro exigido e
// acompanhamento de longe. Painel do gestor (Task 10: KPIs + pendentes de hoje + em
// alerta) com Templates (biblioteca pronta, semeada pelo backend), Setores (onde cada
// checklist roda — Cozinha, Salão…) e Checklists (CRUD + editor, Task 7: nasce do zero
// ou de um template).
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const TABS = [
  { id: 'painel', label: 'Painel' },
  { id: 'checklists', label: 'Checklists' },
  { id: 'templates', label: 'Templates' },
  { id: 'setores', label: 'Setores' },
  { id: 'colaboradores', label: 'Colaboradores' },
]
const TAB_IDS = TABS.map((t) => t.id)

// A API só devolve o código do tipo do item (enum TipoItemChecklist) — o rótulo de
// exibição fica no front, mesmo padrão de Etiquetas.jsx com CONS_LABEL.
const TIPO_LABEL = { CHECK: 'Check', AVALIACAO: 'Avaliação', TEXTO: 'Texto', NUMERICO: 'Numérico', SELECAO: 'Seleção' }
const PRIORIDADE_LABEL = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' }
const REC_LABEL = { DIARIA: 'Todo dia', DIAS_SEMANA: 'Dias da semana', AVULSO: 'Sem agendamento' }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TIPOS = ['CHECK', 'AVALIACAO', 'TEXTO', 'NUMERICO', 'SELECAO']
// Mesma lista fixa do backend (CHECKLIST_CATEGORIAS em server.js) — o endpoint de
// checklists não devolve categorias (diferente de /templates), então replica aqui.
const CHECKLIST_CATEGORIAS = ['Abertura', 'Fechamento', 'Controle de Pragas', 'Documentações Sanitárias', 'Segurança Alimentar']

export default function Checklist() {
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const tab = TAB_IDS.includes(tabParam) ? tabParam : 'painel'
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Checklist Inteligente</h1>
          <div className="page-header-sub">Padronize rotinas, exija registro e acompanhe de longe.</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="modal-tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'av-tab' + (tab === t.id ? ' active' : '')}
            onClick={() => navigate(`/checklist/${t.id}`)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'templates' && <AbaTemplates notify={notify} />}
      {tab === 'setores' && <AbaSetores notify={notify} />}
      {tab === 'colaboradores' && <AbaColaboradores notify={notify} />}
      {tab === 'checklists' && <AbaChecklists notify={notify} />}
      {tab === 'painel' && <AbaPainel notify={notify} />}
    </div>
  )
}

// ===================== PAINEL =====================
// Visão consolidada do gestor: KPIs do dia + pendentes (vencem hoje e ainda não foram
// concluídos) + em alerta (execução com item crítico não-conforme). "Hoje" já vem
// resolvido pelo backend com o dia de expediente (corte 05:00 BR), não precisa de
// nenhum cálculo de fuso aqui no front.
function AbaPainel({ notify }) {
  const [p, setP] = useState(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    api.get('/checklist/painel')
      .then((r) => setP(r.data))
      .catch((e) => {
        // Painel é a aba DEFAULT — se engolir o erro em silêncio, a tela trava em
        // "Carregando…" pra sempre sem o gestor entender o porquê. Mesmo padrão de
        // notify das abas irmãs, e sai do loading pra um empty-state com o motivo.
        notify(e?.response?.data?.error ?? 'Não foi possível carregar o painel.', 'error')
        setErro(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (erro) return <div className="empty-state">Não foi possível carregar o painel.</div>
  if (!p) return <div className="empty-state">Carregando…</div>
  const KPI = ({ n, label }) => <div className="table-card" style={{ padding: 16 }}><div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: '#777' }}>{label}</div></div>
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPI n={p.kpis.ativos} label="Checklists ativos" /><KPI n={p.kpis.venceHoje} label="Vencem hoje" />
        <KPI n={p.kpis.concluidosHoje} label="Concluídos hoje" /><KPI n={p.kpis.emAlerta} label="Em alerta" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div className="table-card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Pendentes de hoje</h3>
          {p.pendentes.length === 0 ? <p className="empty-state">Tudo em dia.</p> : p.pendentes.map((c) => <div key={c.id} style={{ padding: '6px 0', borderTop: '1px solid var(--app-border,#eee)', fontSize: 13 }}>{c.nome} <span style={{ color: '#999' }}>· {c.categoria}</span></div>)}
        </div>
        <div className="table-card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 8 }}>Em alerta</h3>
          {p.alertas.length === 0 ? <p className="empty-state">Nenhum alerta.</p> : p.alertas.map((c) => <div key={c.id} style={{ padding: '6px 0', borderTop: '1px solid var(--app-border,#eee)', fontSize: 13 }}>{c.nome}</div>)}
        </div>
      </div>
    </div>
  )
}

// ===================== SETORES =====================
// Setores alimentam a atribuição de "onde" cada checklist roda — usados pelas telas que
// chegam nas próximas tasks (Checklists/Painel). Nesta F1: só criar e excluir, o
// suficiente pra popular a lista antes de existir quem consuma.
function AbaSetores({ notify }) {
  const [setores, setSetores] = useState([])
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [excluir, setExcluir] = useState(null) // setor em confirmação de exclusão
  const [excluindo, setExcluindo] = useState(false)

  function carregar() {
    api.get('/checklist/setores')
      .then((r) => setSetores(r.data.setores || []))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os setores.', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function criar(e) {
    e.preventDefault()
    const n = nome.trim()
    if (!n || criando) return
    setCriando(true)
    try {
      await api.post('/checklist/setores', { nome: n })
      setNome('')
      notify('Setor criado.')
      carregar()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível criar o setor.', 'error')
    } finally {
      setCriando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      await api.delete(`/checklist/setores/${excluir.id}`)
      notify(`"${excluir.nome}" excluído.`)
      setExcluir(null)
      carregar()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível excluir o setor.', 'error')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <form onSubmit={criar} className="table-card" style={{ padding: 16, display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="Novo setor (ex.: Cozinha)"
          maxLength={60}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>
          {criando ? 'Criando…' : 'Adicionar'}
        </button>
      </form>

      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : setores.length === 0 ? (
        <div className="empty-state">Nenhum setor ainda.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Setor</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {setores.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.nome}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setExcluir(s)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!excluir}
        title="Excluir setor"
        message={excluir ? `Excluir "${excluir.nome}"?` : ''}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />
    </div>
  )
}

// ===================== COLABORADORES =====================
// Atribui setor(es) a cada colaborador — o elo que faltava pra fechar o ciclo: sem
// setor, Funcionario.setorIds fica sempre [] e a Área do Colaborador nunca mostra
// checklist nenhum pro operador (GET /public/colaborador/checklists corta em
// "meus.length === 0"). Aqui só liga/desliga por chip; quem cria os setores é a aba
// Setores.
function AbaColaboradores({ notify }) {
  const [colaboradores, setColaboradores] = useState([])
  const [setores, setSetores] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState(null) // id do colaborador com PUT em voo — trava só os chips dele

  function carregar() {
    Promise.all([api.get('/checklist/colaboradores'), api.get('/checklist/setores')])
      .then(([rc, rs]) => { setColaboradores(rc.data.colaboradores || []); setSetores(rs.data.setores || []) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os colaboradores.', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update otimista (chip muda na hora) — se o PUT falhar, notify + recarrega tudo do
  // servidor pra desfazer o chute otimista (mesmo padrão de rollback já usado nas
  // outras abas deste arquivo).
  async function toggleSetor(colab, setorId) {
    if (salvandoId) return
    const setorIdsNovo = colab.setorIds.includes(setorId)
      ? colab.setorIds.filter((x) => x !== setorId)
      : [...colab.setorIds, setorId]
    setColaboradores((cs) => cs.map((c) => (c.id === colab.id ? { ...c, setorIds: setorIdsNovo } : c)))
    setSalvandoId(colab.id)
    try {
      await api.put(`/checklist/colaboradores/${colab.id}/setores`, { setorIds: setorIdsNovo })
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível salvar os setores.', 'error')
      carregar()
    } finally {
      setSalvandoId(null)
    }
  }

  if (loading) return <div className="loading-state">Carregando…</div>
  if (colaboradores.length === 0) return <div className="empty-state">Nenhum colaborador ativo.</div>

  return (
    <div>
      {setores.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 12 }}>Nenhum setor cadastrado ainda — crie na aba Setores antes de atribuir aos colaboradores.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {colaboradores.map((c) => (
          <div key={c.id} className="table-card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: setores.length ? 6 : 0 }}>
              {c.nome}
              {c.apelido ? <span style={{ fontWeight: 400, color: 'var(--app-text-soft, #888)' }}> ({c.apelido})</span> : null}
            </div>
            {setores.length > 0 && (
              <div className="chip-row">
                {setores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={'chip' + (c.setorIds.includes(s.id) ? ' chip-on' : '')}
                    disabled={salvandoId === c.id}
                    onClick={() => toggleSetor(c, s.id)}
                  >
                    {s.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ===================== TEMPLATES =====================
// Biblioteca de templates prontos (semeada por loja na 1ª leitura pelo backend —
// garantirChecklistTemplatesSeed em server.js). Nesta F1 só visualização com filtro por
// categoria; criar/editar template fica pra fatia seguinte.
function AbaTemplates({ notify }) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [categorias, setCategorias] = useState([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [ver, setVer] = useState(null)
  const [usando, setUsando] = useState(false)

  // "Usar como base": clona o template num checklist novo e manda direto pro editor
  // dele na aba Checklists — o id vai na querystring (?editar=) porque Templates e
  // Checklists são abas irmãs sem estado compartilhado; AbaChecklists detecta o
  // parâmetro no mount e abre o editor com o objeto completo (mesmo caminho do
  // botão "Editar").
  function usarComoBase() {
    if (usando) return
    setUsando(true)
    api.post(`/checklist/templates/${ver.id}/usar`)
      .then((r) => {
        setVer(null)
        notify('Checklist criado a partir do template.')
        navigate(`/checklist/checklists?editar=${r.data.checklist.id}`)
      })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível usar o template.', 'error'))
      .finally(() => setUsando(false))
  }

  // Sem reset de `loading` a cada troca de categoria (só a carga inicial mostra
  // "Carregando…") — mesmo padrão da busca debounced em Etiquetas.jsx (AbaItens):
  // setState direto no corpo do efeito dispara o lint react-hooks/set-state-in-effect.
  useEffect(() => {
    api.get('/checklist/templates', { params: filtro ? { categoria: filtro } : {} })
      .then((r) => { setTemplates(r.data.templates || []); setCategorias(r.data.categorias || []) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os templates.', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  return (
    <div>
      <div className="modal-tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={'av-tab' + (!filtro ? ' active' : '')} onClick={() => setFiltro('')}>Todas</button>
        {categorias.map((c) => (
          <button key={c} type="button" className={'av-tab' + (filtro === c ? ' active' : '')} onClick={() => setFiltro(c)}>{c}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">Nenhum template nesta categoria.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {templates.map((t) => (
            <div key={t.id} className="table-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a17c00', textTransform: 'uppercase' }}>{t.categoria}</div>
              <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0' }}>{t.nome}</div>
              <div style={{ fontSize: 12, color: 'var(--app-text-soft, #888)', minHeight: 32 }}>{t.descricao}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--app-text-soft, #888)' }}>
                <span>{t.itens.length} itens{t.tempoEstimadoMin ? ` · ${t.tempoEstimadoMin} min` : ''}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVer(t)}>Ver</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fecha só pelo botão "Fechar" — o overlay não tem onClick, e o stopPropagation
          no .modal é a mesma trava defensiva usada em PontoFacial.jsx. */}
      {ver && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-title">{ver.nome}</div>
            <div className="page-header-sub" style={{ marginTop: -8, marginBottom: 12 }}>
              {ver.categoria} · {ver.itens.length} itens{ver.tempoEstimadoMin ? ` · ${ver.tempoEstimadoMin} min` : ''}
            </div>
            {ver.itens.map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid var(--app-border, #eee)' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {it.titulo}{it.critico && <span style={{ color: '#dc2626' }} title="Item crítico"> *</span>}
                </span>
                <span style={{ fontSize: 11, color: 'var(--app-text-soft, #888)', flexShrink: 0 }}>{TIPO_LABEL[it.tipo] || it.tipo}</span>
              </div>
            ))}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVer(null)}>Fechar</button>
              <button type="button" className="btn btn-primary" disabled={usando} onClick={usarComoBase}>{usando ? 'Criando…' : 'Usar como base'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===================== CHECKLISTS =====================
// CRUD dos checklists que a operação executa: nasce do zero (+ Novo checklist) ou de um
// template ("Usar como base" na aba Templates). Nome, categoria, prioridade, setores
// responsáveis, recorrência (todo dia / dias da semana / avulso) e a lista de itens.
function AbaChecklists({ notify }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(null) // checklist completo em edição, ou {novo:true,...} pra criação

  function carregar() {
    api.get('/checklist/checklists', { params: busca ? { busca } : {} })
      .then((r) => setLista(r.data.checklists || []))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os checklists.', 'error'))
      .finally(() => setLoading(false))
  }
  // Busca debounced — mesmo padrão de AbaItens em Etiquetas.jsx. Dispara também na
  // carga inicial (busca começa vazia, o efeito roda no mount).
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t) }, [busca]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chegando de "Usar como base" (aba Templates) com ?editar=<id>: abre o editor já
  // carregado nesse checklist, mesmo caminho do botão "Editar" (GET completo, exigido
  // pelo full-replace do PUT). Só no mount — depois limpa o parâmetro da URL pra um
  // F5 não reabrir o editor sozinho.
  useEffect(() => {
    const id = searchParams.get('editar')
    if (!id) return
    api.get(`/checklist/checklists/${id}`)
      .then((r) => setEdit(r.data.checklist))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar o checklist.', 'error'))
      .finally(() => {
        searchParams.delete('editar')
        setSearchParams(searchParams, { replace: true })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function novo() {
    setEdit({
      novo: true, nome: '', categoria: CHECKLIST_CATEGORIAS[0], descricao: '', prioridade: 'MEDIA',
      setorIds: [], recorrenciaTipo: 'AVULSO', recorrenciaConfig: { diasSemana: [], horarioLimite: '' }, itens: [],
    })
  }

  // O PUT do backend é full-replace (zera o que não vier no corpo) — por isso o editor
  // sempre parte do checklist COMPLETO (GET /:id), nunca da linha resumida da tabela.
  function editar(c) {
    api.get(`/checklist/checklists/${c.id}`)
      .then((r) => setEdit(r.data.checklist))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar o checklist.', 'error'))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="form-input" style={{ maxWidth: 320 }} placeholder="Buscar checklist…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={novo}>+ Novo checklist</button>
      </div>

      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state">Nenhum checklist ainda. Crie um do zero ou use um template pronto na aba Templates.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead><tr><th>Nome</th><th>Categoria</th><th>Prioridade</th><th>Recorrência</th><th>Itens</th><th></th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nome}</td>
                  <td>{c.categoria}</td>
                  <td>{PRIORIDADE_LABEL[c.prioridade] || c.prioridade}</td>
                  <td>{REC_LABEL[c.recorrenciaTipo] || c.recorrenciaTipo}</td>
                  <td>{c._count?.itens ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => editar(c)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <ChecklistEditor inicial={edit} notify={notify} onClose={() => setEdit(null)} onSalvou={() => { setEdit(null); carregar() }} />}
    </div>
  )
}

function ChecklistEditor({ inicial, notify, onClose, onSalvou }) {
  const [f, setF] = useState(() => ({
    ...inicial,
    descricao: inicial.descricao || '',
    recorrenciaConfig: inicial.recorrenciaConfig || { diasSemana: [], horarioLimite: '' },
    itens: inicial.itens || [],
  }))
  const [setores, setSetores] = useState([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api.get('/checklist/setores').then((r) => setSetores(r.data.setores || [])).catch(() => {})
  }, [])

  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const updRc = (k, v) => setF((s) => ({ ...s, recorrenciaConfig: { ...s.recorrenciaConfig, [k]: v } }))
  const toggleSetor = (id) => setF((s) => ({ ...s, setorIds: s.setorIds.includes(id) ? s.setorIds.filter((x) => x !== id) : [...s.setorIds, id] }))
  const toggleDow = (d) => updRc('diasSemana', f.recorrenciaConfig.diasSemana.includes(d) ? f.recorrenciaConfig.diasSemana.filter((x) => x !== d) : [...f.recorrenciaConfig.diasSemana, d])
  const setItem = (i, patch) => setF((s) => ({ ...s, itens: s.itens.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
  const addItem = () => setF((s) => ({ ...s, itens: [...s.itens, { tipo: 'CHECK', titulo: '', descricao: '', critico: false, config: {} }] }))
  const rmItem = (i) => setF((s) => ({ ...s, itens: s.itens.filter((_, j) => j !== i) }))

  async function salvar() {
    if (!f.nome?.trim()) { notify('Informe o nome do checklist.', 'error'); return }
    // Valida no cliente antes de mandar pro backend — o 400 "Todo item precisa de um
    // título." de lá não diz qual, então aponta a posição aqui.
    const itemSemTitulo = f.itens.findIndex((it) => !it.titulo?.trim())
    if (itemSemTitulo !== -1) { notify(`O item ${itemSemTitulo + 1} está sem título.`, 'error'); return }
    const criando = f.novo || !f.id
    setSalvando(true)
    try {
      // Corpo completo mesmo editando — full-replace no backend (ver comentário em
      // AbaChecklists.editar): omitir um campo aqui zera ele no servidor.
      const body = {
        nome: f.nome,
        categoria: f.categoria,
        descricao: f.descricao,
        prioridade: f.prioridade,
        setorIds: f.setorIds,
        recorrenciaTipo: f.recorrenciaTipo,
        recorrenciaConfig: f.recorrenciaConfig,
        itens: f.itens,
        templateOrigemId: f.templateOrigemId,
      }
      if (criando) await api.post('/checklist/checklists', body)
      else await api.put(`/checklist/checklists/${f.id}`, body)
      notify(criando ? 'Checklist criado.' : 'Checklist atualizado.')
      onSalvou()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível salvar o checklist.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    // Fecha só pelo botão Cancelar — overlay sem onClick, stopPropagation no .modal
    // (mesma trava defensiva do modal "Ver template" acima e de PontoFacial.jsx).
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-title">{f.novo ? 'Novo checklist' : 'Editar checklist'}</div>

        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Nome</label><input className="form-input" value={f.nome} onChange={(e) => upd('nome', e.target.value)} /></div>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-input" value={f.categoria} onChange={(e) => upd('categoria', e.target.value)}>
              {CHECKLIST_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Prioridade</label>
            <select className="form-input" value={f.prioridade} onChange={(e) => upd('prioridade', e.target.value)}>
              <option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Recorrência</label>
            <select className="form-input" value={f.recorrenciaTipo} onChange={(e) => upd('recorrenciaTipo', e.target.value)}>
              <option value="DIARIA">Todo dia</option><option value="DIAS_SEMANA">Dias da semana</option><option value="AVULSO">Sem agendamento</option>
            </select>
          </div>
        </div>

        {f.recorrenciaTipo === 'DIAS_SEMANA' && (
          <div className="form-group">
            <label className="form-label">Dias</label>
            <div className="chip-row">
              {DOW.map((d, i) => (
                <button key={i} type="button" className={'chip' + (f.recorrenciaConfig.diasSemana.includes(i) ? ' chip-on' : '')} onClick={() => toggleDow(i)}>{d}</button>
              ))}
            </div>
          </div>
        )}
        {f.recorrenciaTipo !== 'AVULSO' && (
          <div className="form-group">
            <label className="form-label">Horário limite (opcional)</label>
            <input className="form-input" style={{ maxWidth: 120 }} placeholder="HH:mm" value={f.recorrenciaConfig.horarioLimite || ''} onChange={(e) => updRc('horarioLimite', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Setores</label>
          {setores.length === 0 ? (
            <span style={{ fontSize: 12, color: '#999' }}>Nenhum setor cadastrado — crie na aba Setores.</span>
          ) : (
            <div className="chip-row">
              {setores.map((s) => (
                <button key={s.id} type="button" className={'chip' + (f.setorIds.includes(s.id) ? ' chip-on' : '')} onClick={() => toggleSetor(s.id)}>{s.nome}</button>
              ))}
            </div>
          )}
        </div>

        <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Itens</label>
        {f.itens.length === 0 && <div className="empty-state" style={{ padding: 20 }}>Nenhum item ainda.</div>}
        {f.itens.map((it, i) => (
          <div key={i} className="table-card" style={{ padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="form-input" style={{ width: 130, flexShrink: 0 }} value={it.tipo} onChange={(e) => setItem(i, { tipo: e.target.value, config: {} })}>
                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
              <input className="form-input" style={{ flex: 1, minWidth: 0 }} placeholder="Título do item" value={it.titulo} onChange={(e) => setItem(i, { titulo: e.target.value })} />
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <input type="checkbox" checked={!!it.critico} onChange={(e) => setItem(i, { critico: e.target.checked })} /> crítico
              </label>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => rmItem(i)}>Remover</button>
            </div>

            {it.tipo === 'NUMERICO' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input className="form-input" style={{ width: 100 }} placeholder="unidade" value={it.config?.unidade || ''} onChange={(e) => setItem(i, { config: { ...it.config, unidade: e.target.value } })} />
                <input className="form-input" type="number" style={{ width: 90 }} placeholder="mín." value={it.config?.min ?? ''} onChange={(e) => setItem(i, { config: { ...it.config, min: e.target.value === '' ? undefined : Number(e.target.value) } })} />
                <input className="form-input" type="number" style={{ width: 90 }} placeholder="máx." value={it.config?.max ?? ''} onChange={(e) => setItem(i, { config: { ...it.config, max: e.target.value === '' ? undefined : Number(e.target.value) } })} />
              </div>
            )}
            {it.tipo === 'AVALIACAO' && (
              <input className="form-input" type="number" min={1} max={5} style={{ width: 160, marginTop: 6 }} placeholder="nota mínima (1-5)" value={it.config?.notaMinima ?? ''} onChange={(e) => setItem(i, { config: { ...it.config, notaMinima: e.target.value === '' ? undefined : Number(e.target.value) } })} />
            )}
            {it.tipo === 'SELECAO' && (
              <div style={{ marginTop: 6 }}>
                {(it.config?.opcoes || []).map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <input className="form-input" style={{ flex: 1 }} placeholder="opção" value={o.rotulo} onChange={(e) => setItem(i, { config: { ...it.config, opcoes: it.config.opcoes.map((x, j) => (j === oi ? { ...x, rotulo: e.target.value } : x)) } })} />
                    <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      <input type="checkbox" checked={o.conforme !== false} onChange={(e) => setItem(i, { config: { ...it.config, opcoes: it.config.opcoes.map((x, j) => (j === oi ? { ...x, conforme: e.target.checked } : x)) } })} /> conforme
                    </label>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setItem(i, { config: { ...it.config, opcoes: it.config.opcoes.filter((_, j) => j !== oi) } })}>Remover</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItem(i, { config: { ...it.config, opcoes: [...(it.config?.opcoes || []), { rotulo: '', conforme: true }] } })}>+ opção</button>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar item</button>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
