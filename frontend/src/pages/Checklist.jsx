// Checklist Inteligente — rotinas padronizadas da operação, com registro exigido e
// acompanhamento de longe. Painel do gestor (próximos agendamentos, sem agendamento,
// checks em alerta e a tabela de checklists com criar), Templates (biblioteca pronta,
// semeada pelo backend) e Checklists (CRUD + editor: nasce do zero ou de um template,
// atribuído por Função — a mesma do cadastro/Ponto Facial).
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const TABS = [
  { id: 'painel', label: 'Painel' },
  { id: 'checklists', label: 'Checklists' },
  { id: 'templates', label: 'Templates' },
  { id: 'notificacoes', label: 'Notificações' },
]
const TAB_IDS = TABS.map((t) => t.id)

// A API só devolve o código do tipo do item (enum TipoItemChecklist) — o rótulo de
// exibição fica no front, mesmo padrão de Etiquetas.jsx com CONS_LABEL.
const TIPO_LABEL = { CHECK: 'Check', AVALIACAO: 'Avaliação', TEXTO: 'Texto', NUMERICO: 'Numérico', SELECAO: 'Seleção', FOTO: 'Foto' }
const PRIORIDADE_LABEL = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' }
const REC_LABEL = { DIARIA: 'Todo dia', DIAS_SEMANA: 'Dias da semana', AVULSO: 'Sem agendamento' }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// FOTO, assim como CHECK e TEXTO, não tem config própria no editor — é só evidência
// (a execução exige anexar uma foto, sem parâmetros extras pra configurar aqui).
const TIPOS = ['CHECK', 'AVALIACAO', 'TEXTO', 'NUMERICO', 'SELECAO', 'FOTO']
// Mesma lista fixa do backend (CHECKLIST_CATEGORIAS em server.js) — o endpoint de
// checklists não devolve categorias (diferente de /templates), então replica aqui.
const CHECKLIST_CATEGORIAS = ['Abertura', 'Fechamento', 'Controle de Pragas', 'Documentações Sanitárias', 'Segurança Alimentar']
// enum StatusExecucao no backend — só esses 2 valores existem (sem "pendente": a
// execução só nasce quando o operador abre o checklist).
const STATUS_EXEC_LABEL = { EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' }

// Formata data+hora de execução (iniciadaEm/concluidaEm) — mesmo padrão de PontoFacial.jsx.
function fmtDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

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
      {tab === 'checklists' && <AbaChecklists notify={notify} />}
      {tab === 'notificacoes' && <AbaNotificacoes notify={notify} />}
      {tab === 'painel' && <AbaPainel notify={notify} />}
    </div>
  )
}

// ===================== PAINEL =====================
// Visão consolidada do gestor (adaptada da referência): KPIs do dia, três colunas
// (próximos agendamentos, sem agendamento, checks em alerta) e a tabela "Meus checklists"
// com o botão de criar direto por aqui. "Hoje" já vem resolvido pelo backend com o dia de
// expediente (corte 05:00 BR) — sem cálculo de fuso no front. Abaixo, as execuções
// recentes (Fatia 2) pra abrir o detalhe com foto.

// Botão-link discreto (sem depender de classe utilitária) usado nos cabeçalhos do painel.
function LinkAcao({ children, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ marginLeft: 'auto', fontSize: 12, background: 'none', border: 'none', color: 'var(--app-primary, #2563eb)', cursor: 'pointer', padding: 0 }}>
      {children}
    </button>
  )
}

// Tags visuais (não clicáveis) das funções que executam um checklist.
function FuncoesTags({ funcoes }) {
  if (!funcoes || funcoes.length === 0) return <span style={{ fontSize: 11, color: '#999' }}>Sem função</span>
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {funcoes.map((fn) => (
        <span key={fn} style={{ fontSize: 10, background: 'var(--app-border, #eee)', color: 'var(--app-text-soft, #555)', borderRadius: 4, padding: '1px 6px' }}>{fn}</span>
      ))}
    </span>
  )
}

// Uma coluna do painel (título + linhas), com "Ver todos" opcional e empty-state próprio.
function PainelColuna({ titulo, cor, vazio, verTodos, temItens, children }) {
  return (
    <div className="table-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: cor || 'inherit' }}>{titulo}</h3>
        {verTodos && <LinkAcao onClick={verTodos}>Ver todos</LinkAcao>}
      </div>
      {temItens ? children : <p className="empty-state" style={{ padding: 10 }}>{vazio}</p>}
    </div>
  )
}

// Uma linha de checklist dentro de uma coluna do painel.
function PainelLinha({ nome, sub, funcoes, right, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: '8px 0', borderTop: '1px solid var(--app-border, #eee)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{nome}</span>
        {right && <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{right}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
        {sub && <span style={{ fontSize: 11, color: '#999' }}>{sub}</span>}
        {funcoes && <FuncoesTags funcoes={funcoes} />}
      </div>
    </div>
  )
}

function AbaPainel({ notify }) {
  const navigate = useNavigate()
  const [p, setP] = useState(null)
  const [erro, setErro] = useState(false)
  // Execuções recentes (Task 8) — carga independente do restante do painel: se essa
  // chamada falhar, não trava os KPIs/pendentes, só a própria seção fica com o aviso.
  const [execucoes, setExecucoes] = useState([])
  const [carregandoExec, setCarregandoExec] = useState(true)
  const [erroExec, setErroExec] = useState(false)
  const [verExecucaoId, setVerExecucaoId] = useState(null) // id da execução aberta no modal de detalhe, ou null

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

  useEffect(() => {
    api.get('/checklist/execucoes')
      .then((r) => setExecucoes(r.data.execucoes || []))
      .catch((e) => {
        notify(e?.response?.data?.error ?? 'Não foi possível carregar as execuções recentes.', 'error')
        setErroExec(true)
      })
      .finally(() => setCarregandoExec(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (erro) return <div className="empty-state">Não foi possível carregar o painel.</div>
  if (!p) return <div className="empty-state">Carregando…</div>
  const KPI = ({ n, label }) => <div className="table-card" style={{ padding: 16 }}><div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: '#777' }}>{label}</div></div>
  const meusPreview = p.meus.slice(0, 8)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPI n={p.kpis.ativos} label="Checklists ativos" /><KPI n={p.kpis.venceHoje} label="Vencem hoje" />
        <KPI n={p.kpis.concluidosHoje} label="Concluídos hoje" /><KPI n={p.kpis.emAlerta} label="Em alerta" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <PainelColuna titulo="Próximos agendamentos" vazio="Nada vence hoje." temItens={p.proximos.length > 0} verTodos={() => navigate('/checklist/checklists')}>
          {p.proximos.map((c) => (
            <PainelLinha key={c.id} nome={c.nome} sub={c.categoria} funcoes={c.funcoes}
              right={<span className="badge badge-gray">{c.status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Pendente'}</span>} />
          ))}
        </PainelColuna>
        <PainelColuna titulo="Sem agendamento" vazio="Nenhum avulso." temItens={p.semAgendamento.length > 0} verTodos={() => navigate('/checklist/checklists')}>
          {p.semAgendamento.map((c) => (
            <PainelLinha key={c.id} nome={c.nome} sub={`${c.categoria} · ${c.itens} ${c.itens === 1 ? 'item' : 'itens'}`} funcoes={c.funcoes} />
          ))}
        </PainelColuna>
        <PainelColuna titulo="Checks em alerta" cor="#dc2626" vazio="Nenhum alerta." temItens={p.alertas.length > 0}>
          {p.alertas.map((c) => (
            <PainelLinha key={c.id} nome={c.nome} sub={c.categoria}
              onClick={c.execId ? () => setVerExecucaoId(c.execId) : undefined}
              right={<span className="badge badge-red">Fora do padrão</span>} />
          ))}
        </PainelColuna>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 8px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 800 }}>Meus checklists</h3>
        {p.meus.length > meusPreview.length && <LinkAcao onClick={() => navigate('/checklist/checklists')}>Ver todos</LinkAcao>}
        <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: p.meus.length > meusPreview.length ? 0 : 'auto' }} onClick={() => navigate('/checklist/checklists?novo=1')}>+ Novo checklist</button>
      </div>
      {meusPreview.length === 0 ? (
        <div className="empty-state">Nenhum checklist ainda. Crie um do zero ou use um template pronto na aba Templates.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead><tr><th>Nome</th><th>Categoria</th><th>Prioridade</th><th>Recorrência</th><th>Itens</th><th>Funções</th><th></th></tr></thead>
            <tbody>
              {meusPreview.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nome}</td>
                  <td>{c.categoria}</td>
                  <td>{PRIORIDADE_LABEL[c.prioridade] || c.prioridade}</td>
                  <td>{REC_LABEL[c.recorrenciaTipo] || c.recorrenciaTipo}</td>
                  <td>{c.itens}</td>
                  <td>{(c.funcoes && c.funcoes.length) ? c.funcoes.join(', ') : <span style={{ color: '#999' }}>—</span>}</td>
                  <td style={{ textAlign: 'right' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/checklist/checklists?editar=${c.id}`)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 800, margin: '18px 0 8px' }}>Execuções recentes</h3>
      {carregandoExec ? (
        <div className="loading-state">Carregando…</div>
      ) : erroExec ? (
        <div className="empty-state">Não foi possível carregar as execuções recentes.</div>
      ) : execucoes.length === 0 ? (
        <div className="empty-state">Nenhuma execução registrada ainda.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr><th>Checklist</th><th>Categoria</th><th>Funcionário</th><th>Início</th><th>Conclusão</th><th>Status</th></tr>
            </thead>
            <tbody>
              {/* Linha inteira clicável (pedido explícito da task) — o hover do hb-table já
                  dá o feedback visual de "isso é clicável", sem precisar de um botão extra. */}
              {execucoes.map((e) => (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setVerExecucaoId(e.id)}>
                  <td style={{ fontWeight: 600 }}>{e.checklistNome}</td>
                  <td>{e.categoria}</td>
                  <td>{e.funcionario}</td>
                  <td>{fmtDataHora(e.iniciadaEm)}</td>
                  <td>{fmtDataHora(e.concluidaEm)}</td>
                  <td>
                    <span className={'badge ' + (e.status === 'CONCLUIDA' ? 'badge-green' : 'badge-gray')}>{STATUS_EXEC_LABEL[e.status] || e.status}</span>
                    {e.emAlerta && <span className="badge badge-red" style={{ marginLeft: 6 }}>Em alerta</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {verExecucaoId != null && <DetalheExecucao id={verExecucaoId} onClose={() => setVerExecucaoId(null)} />}
    </div>
  )
}

// ===================== DETALHE DA EXECUÇÃO (Task 8) =====================
// O gestor confere o que o operador registrou numa execução: cabeçalho com
// quem/quando + cada item do snapshot com a resposta formatada conforme o tipo.
// Fecha só pelo botão "Fechar" — mesma trava dos outros modais deste arquivo
// (overlay sem onClick, stopPropagation no .modal). O "Fechar" fica fora do
// condicional de estado (mesmo layout do ModalProgressoEnvio em PontoFacial.jsx):
// se o GET falhar ou travar carregando, o gestor não fica preso no modal.
function DetalheExecucao({ id, onClose }) {
  const [ex, setEx] = useState(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    api.get(`/checklist/execucoes/${id}`)
      .then((r) => setEx(r.data.execucao))
      .catch(() => setErro(true))
  }, [id])

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '85vh', overflow: 'auto' }}>
        {erro ? (
          <div className="empty-state">Não foi possível carregar esta execução.</div>
        ) : !ex ? (
          <div className="loading-state">Carregando…</div>
        ) : (
          <>
            <div className="modal-title">
              {ex.checklistNome}
              {ex.emAlerta && <span className="badge badge-red" style={{ marginLeft: 8 }}>Em alerta</span>}
            </div>
            <div className="page-header-sub" style={{ marginTop: -8, marginBottom: 12 }}>
              {ex.categoria} · {ex.funcionario} · iniciada {fmtDataHora(ex.iniciadaEm)}
              {ex.concluidaEm ? ` · concluída ${fmtDataHora(ex.concluidaEm)}` : ` · ${STATUS_EXEC_LABEL[ex.status] || ex.status}`}
            </div>

            {(ex.itens || []).map((it) => {
              const r = ex.respostas?.[it.chave]
              const foto = ex.fotos?.[it.chave]
              return (
                <div key={it.chave} style={{ padding: '9px 0', borderTop: '1px solid var(--app-border, #eee)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {it.titulo}{it.critico && <span style={{ color: '#dc2626' }} title="Item crítico"> *</span>}
                    </span>
                    {r?.conforme === false && <span className="badge badge-red" style={{ flexShrink: 0 }}>Fora do padrão</span>}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <RespostaItem item={it} resposta={r} foto={foto} />
                  </div>
                  {r?.observacao && <div style={{ fontSize: 12, color: 'var(--app-text-soft, #888)', marginTop: 4 }}>Obs.: {r.observacao}</div>}
                </div>
              )
            })}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// Formata a resposta de um item do snapshot conforme o tipo (mesmos 6 tipos do
// editor). SELECAO e TEXTO: o valor salvo já É o texto/rótulo escolhido — ver
// ItemChecklist em BonificacaoEu.jsx, onde SELECAO grava `o.rotulo` diretamente, sem
// um código à parte pra traduzir aqui.
function RespostaItem({ item, resposta: r, foto }) {
  if (item.tipo === 'FOTO') {
    return foto?.id ? <FotoMiniatura fotoId={foto.id} /> : <span style={{ fontSize: 13, color: '#999' }}>Sem foto anexada.</span>
  }
  if (!r || r.valor === null || r.valor === undefined || r.valor === '') {
    return <span style={{ fontSize: 13, color: '#999' }}>Sem resposta.</span>
  }
  if (item.tipo === 'CHECK') {
    return <span style={{ fontSize: 13 }}>{r.valor === true ? '✓ Feito' : '✗ Não feito'}</span>
  }
  if (item.tipo === 'AVALIACAO') {
    const n = Number(r.valor) || 0
    return <span style={{ fontSize: 15, letterSpacing: 1 }}>{[1, 2, 3, 4, 5].map((i) => (i <= n ? '★' : '☆')).join('')}</span>
  }
  if (item.tipo === 'NUMERICO') {
    return <span style={{ fontSize: 13 }}>{r.valor}{item.config?.unidade ? ` ${item.config.unidade}` : ''}</span>
  }
  return <span style={{ fontSize: 13 }}>{String(r.valor)}</span>
}

// Miniatura de uma foto anexada à execução. Poucas fotos por execução — busca os
// bytes sob demanda assim que a miniatura MONTA (ou seja, ao abrir o detalhe; não
// espera um clique), mesmo padrão de "prévia sob demanda" do ItemFoto em
// BonificacaoEu.jsx. Ao clicar na miniatura já carregada, abre a foto grande num
// overlay próprio (sem novo fetch) que também só fecha pelo botão.
function FotoMiniatura({ fotoId }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [erro, setErro] = useState(false)
  const [grande, setGrande] = useState(false)

  useEffect(() => {
    api.get(`/checklist/fotos/${fotoId}`)
      .then((r) => setDataUrl(r.data?.dataUrl || null))
      .catch(() => setErro(true)) // sai do "Carregando…" eterno; resto do detalhe continua legível
  }, [fotoId])

  if (erro) return <span style={{ fontSize: 12, color: '#999' }}>⚠ Falha ao carregar foto</span>
  if (!dataUrl) return <span style={{ fontSize: 12, color: '#999' }}>Carregando foto…</span>

  return (
    <>
      <img
        src={dataUrl}
        alt="Foto anexada"
        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--app-border, #eee)' }}
        onClick={() => setGrande(true)}
      />
      {grande && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', textAlign: 'center' }}>
            <img src={dataUrl} alt="Foto anexada (ampliada)" style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} />
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setGrande(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
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
// template ("Usar como base" na aba Templates). Nome, categoria, prioridade, funções que
// executam, recorrência (todo dia / dias da semana / avulso) e a lista de itens.
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

  // Chegando com querystring no mount: `?editar=<id>` (de "Usar como base" na aba
  // Templates ou do "Editar" no Painel) abre o editor já carregado nesse checklist —
  // mesmo caminho do botão "Editar" (GET completo, exigido pelo full-replace do PUT);
  // `?novo=1` (do "+ Novo checklist" no Painel) abre o editor vazio. Depois limpa o
  // parâmetro da URL pra um F5 não reabrir o editor sozinho.
  useEffect(() => {
    const id = searchParams.get('editar')
    if (id) {
      api.get(`/checklist/checklists/${id}`)
        .then((r) => setEdit(r.data.checklist))
        .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar o checklist.', 'error'))
        .finally(() => {
          searchParams.delete('editar')
          setSearchParams(searchParams, { replace: true })
        })
      return
    }
    if (searchParams.get('novo')) {
      novo()
      searchParams.delete('novo')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function novo() {
    setEdit({
      novo: true, nome: '', categoria: CHECKLIST_CATEGORIAS[0], descricao: '', prioridade: 'MEDIA',
      funcoes: [], recorrenciaTipo: 'AVULSO', recorrenciaConfig: { diasSemana: [], horarioLimite: '' }, itens: [],
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
    funcoes: inicial.funcoes || [],
    recorrenciaConfig: inicial.recorrenciaConfig || { diasSemana: [], horarioLimite: '' },
    itens: inicial.itens || [],
  }))
  const [funcoesDisp, setFuncoesDisp] = useState([]) // funções cadastradas (reusa /funcoes)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    // Reusa a lista de Funções que já existe (mesma do Ponto Facial/Bonificação).
    api.get('/funcoes').then((r) => setFuncoesDisp(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const updRc = (k, v) => setF((s) => ({ ...s, recorrenciaConfig: { ...s.recorrenciaConfig, [k]: v } }))
  const toggleFuncao = (nome) => setF((s) => ({ ...s, funcoes: s.funcoes.includes(nome) ? s.funcoes.filter((x) => x !== nome) : [...s.funcoes, nome] }))
  // Opções = funções registradas (Dep. Pessoal › Funções) + as já atribuídas ao checklist
  // que porventura não estejam na lista (a função do colaborador é texto livre e pode
  // divergir das registradas). Assim editar nunca some com um chip já marcado.
  const funcoesOpcoes = [...new Set([...funcoesDisp.map((fn) => fn.nome), ...(f.funcoes || [])])]
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
        funcoes: f.funcoes,
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
          <label className="form-label">Funções que executam</label>
          {funcoesOpcoes.length === 0 ? (
            <span style={{ fontSize: 12, color: '#999' }}>Nenhuma função cadastrada — cadastre em Dep. Pessoal › Funções.</span>
          ) : (
            <div className="chip-row">
              {funcoesOpcoes.map((nome) => (
                <button key={nome} type="button" className={'chip' + (f.funcoes.includes(nome) ? ' chip-on' : '')} onClick={() => toggleFuncao(nome)}>{nome}</button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Quem tem essa função (no cadastro do Ponto Facial) vê o checklist na Área do Colaborador.</div>
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

// ===================== NOTIFICAÇÕES =====================
// Alerta imediato (Fatia 3a / Task 3 no backend): quando uma execução conclui com item
// crítico fora do padrão, os destinatários cadastrados aqui recebem no WhatsApp na
// hora. Nesta aba o gestor liga/desliga o alerta, mantém a lista de destinatários,
// confere a prévia da mensagem e acompanha o histórico dos últimos envios.
function AbaNotificacoes({ notify }) {
  const [config, setConfig] = useState(null)
  const [dests, setDests] = useState([])
  const [historico, setHistorico] = useState([])
  const [previa, setPrevia] = useState('')
  const [nome, setNome] = useState('')
  const [whats, setWhats] = useState('')
  const [salvandoDest, setSalvandoDest] = useState(false)
  const [excluir, setExcluir] = useState(null) // destinatário em confirmação de exclusão
  const [excluindo, setExcluindo] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false) // trava cliques concorrentes no toggle

  function carregar() {
    api.get('/checklist/notificacoes')
      .then((r) => { setConfig(r.data.config); setDests(r.data.destinatarios || []) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar as notificações.', 'error'))
  }
  function carregarHist() {
    api.get('/checklist/notificacoes/historico')
      .then((r) => setHistorico(r.data.historico || []))
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar o histórico de envios.', 'error'))
  }
  useEffect(() => { carregar(); carregarHist() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update otimista — se o PUT falhar, notify + recarrega do servidor pra desfazer o
  // chute otimista.
  async function toggleAtivo() {
    if (salvandoConfig) return
    const novo = !config.alertaImediatoAtivo
    setConfig((c) => ({ ...c, alertaImediatoAtivo: novo }))
    setSalvandoConfig(true)
    try {
      await api.put('/checklist/notificacoes/config', { alertaImediatoAtivo: novo })
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível salvar a configuração.', 'error')
      carregar()
    } finally {
      setSalvandoConfig(false)
    }
  }

  async function addDest(e) {
    e.preventDefault()
    if (!nome.trim() || !whats.trim() || salvandoDest) return
    setSalvandoDest(true)
    try {
      await api.post('/checklist/notificacoes/destinatarios', { nome, whatsapp: whats })
      setNome('')
      setWhats('')
      notify('Destinatário adicionado.')
      carregar()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível adicionar o destinatário.', 'error')
    } finally {
      setSalvandoDest(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      await api.delete(`/checklist/notificacoes/destinatarios/${excluir.id}`)
      notify('Destinatário removido.')
      setExcluir(null)
      carregar()
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível remover o destinatário.', 'error')
    } finally {
      setExcluindo(false)
    }
  }

  async function verPrevia() {
    try {
      const r = await api.get('/checklist/notificacoes/previa')
      setPrevia(r.data.previa)
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível carregar a prévia.', 'error')
    }
  }

  if (!config) return <div className="loading-state">Carregando…</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="table-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Alerta imediato (WhatsApp)</div>
            <div style={{ fontSize: 12, color: 'var(--app-text-soft, #888)' }}>
              Quando um checklist é concluído com um item crítico fora do padrão, os destinatários recebem na hora.
            </div>
          </div>
          <label style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!config.alertaImediatoAtivo} disabled={salvandoConfig} onChange={toggleAtivo} />
            {config.alertaImediatoAtivo ? 'Ativo' : 'Inativo'}
          </label>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={verPrevia}>Ver prévia</button>
        {previa && (
          <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--app-surface-2,#f7f7f7)', border: '1px solid var(--app-border,#eee)', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 12 }}>
            {previa}
          </pre>
        )}
      </div>

      <form onSubmit={addDest} className="table-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Destinatários</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder="WhatsApp (DDD+número)" value={whats} onChange={(e) => setWhats(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={salvandoDest || !nome.trim() || !whats.trim()}>
            {salvandoDest ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
        {dests.length === 0 ? (
          <p className="empty-state">Nenhum destinatário. Adicione quem deve receber os alertas.</p>
        ) : (
          dests.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--app-border,#eee)' }}>
              <span>
                <strong>{d.nome}</strong> <span style={{ color: 'var(--app-text-soft, #888)', fontSize: 12 }}>{d.whatsapp}</span>
                {!d.ativo && <span className="badge badge-gray" style={{ marginLeft: 6 }}>inativo</span>}
              </span>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setExcluir(d)}>Excluir</button>
            </div>
          ))
        )}
      </form>

      <ConfirmDialog
        open={!!excluir}
        title="Excluir destinatário"
        message={excluir ? `Excluir "${excluir.nome}"?` : ''}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />

      <div className="table-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Histórico de envios</div>
        {historico.length === 0 ? (
          <p className="empty-state">Nenhum envio ainda.</p>
        ) : (
          <table className="hb-table">
            <thead><tr><th>Quando</th><th>Destino</th><th>Status</th></tr></thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDataHora(h.criadoEm)}</td>
                  <td>{h.destinatarioNome || h.destino}</td>
                  <td>{h.status === 'ENVIADO' ? '✓ Enviado' : `✗ ${h.erro || 'Falhou'}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
