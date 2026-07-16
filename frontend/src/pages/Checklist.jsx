// Checklist Inteligente — rotinas padronizadas da operação, com registro exigido e
// acompanhamento de longe. Fatia 1 (F1): só o painel do gestor, com Templates (biblioteca
// pronta, semeada pelo backend) e Setores (onde cada checklist roda — Cozinha, Salão…).
// As abas Painel (visão do gestor) e Checklists (o dia a dia de quem executa) chegam nas
// Tasks 7 e 10; por ora ficam como placeholder "Em breve".
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const TABS = [
  { id: 'painel', label: 'Painel' },
  { id: 'checklists', label: 'Checklists' },
  { id: 'templates', label: 'Templates' },
  { id: 'setores', label: 'Setores' },
]
const TAB_IDS = TABS.map((t) => t.id)

// A API só devolve o código do tipo do item (enum TipoItemChecklist) — o rótulo de
// exibição fica no front, mesmo padrão de Etiquetas.jsx com CONS_LABEL.
const TIPO_LABEL = { CHECK: 'Check', AVALIACAO: 'Avaliação', TEXTO: 'Texto', NUMERICO: 'Numérico', SELECAO: 'Seleção' }

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
      {(tab === 'painel' || tab === 'checklists') && (
        <div className="empty-state">Em breve nesta fatia.</div>
      )}
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

// ===================== TEMPLATES =====================
// Biblioteca de templates prontos (semeada por loja na 1ª leitura pelo backend —
// garantirChecklistTemplatesSeed em server.js). Nesta F1 só visualização com filtro por
// categoria; criar/editar template fica pra fatia seguinte.
function AbaTemplates({ notify }) {
  const [templates, setTemplates] = useState([])
  const [categorias, setCategorias] = useState([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [ver, setVer] = useState(null)

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
              <button type="button" className="btn btn-primary" onClick={() => setVer(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
