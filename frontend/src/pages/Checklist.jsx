// Checklist Inteligente — rotinas padronizadas da operação, com registro exigido e
// acompanhamento de longe. Painel do gestor (próximos agendamentos, sem agendamento,
// checks em alerta e a tabela de checklists com criar), Templates (biblioteca pronta,
// semeada pelo backend) e Checklists (CRUD + editor: nasce do zero ou de um template,
// atribuído por Função — a mesma do cadastro/Ponto Facial).
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const TABS = [
  { id: 'painel', label: 'Painel', sub: 'Visão geral do dia' },
  { id: 'checklists', label: 'Checklists', sub: 'Modelos que a operação executa' },
  { id: 'templates', label: 'Templates', sub: 'Biblioteca pronta de rotinas' },
  { id: 'notificacoes', label: 'Notificações', sub: 'Alerta imediato no WhatsApp' },
  { id: 'configuracoes', label: 'Configurações', sub: 'Lembrete de atraso e destinatários' },
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
  const tab = TAB_IDS.includes(tabParam) ? tabParam : 'painel'
  const tabDef = TABS.find((t) => t.id === tab) || TABS[0]
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tabDef.label}</h1>
          <div className="page-header-sub">{tabDef.sub}</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {tab === 'templates' && <AbaTemplates notify={notify} />}
      {tab === 'checklists' && <AbaChecklists notify={notify} />}
      {tab === 'notificacoes' && <AbaNotificacoes notify={notify} />}
      {tab === 'configuracoes' && <AbaConfiguracoes notify={notify} />}
      {tab === 'painel' && <AbaPainel notify={notify} />}
    </div>
  )
}

// ===================== PAINEL =====================
// Visão consolidada do gestor no layout da referência (Cardápio Web), com as cores da
// marca (dourado sobre creme, tema-aware via tokens): Guia inicial + KPIs com ícone,
// três colunas (próximos agendamentos, sem agendamento, checks em alerta) e a tabela
// "Meus checklists". "Hoje" já vem resolvido pelo backend com o dia de expediente (corte
// 05:00 BR). Abaixo, as execuções recentes (Fatia 2) pra abrir o detalhe com foto.

// Ícones SVG (stroke = currentColor, herdam a cor do container). Lucide-like.
function ChkIcon({ name, size = 20 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (name) {
    case 'rocket': return <svg {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.79-.87.78-2.2-.02-3a2.12 2.12 0 0 0-2.98 0z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
    case 'lista': return <svg {...p}><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><path d="M9 12h6" /><path d="M9 16h6" /></svg>
    case 'check': return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
    case 'alerta': return <svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
    case 'relogio': return <svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    case 'chevron': return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>
    case 'checkSm': return <svg {...p} strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
    default: return null
  }
}

// Tags visuais das funções que executam um checklist.
function ChkTags({ funcoes }) {
  if (!funcoes || funcoes.length === 0) return <span className="chkp-tag" style={{ opacity: 0.65 }}>Sem responsável</span>
  return <>{funcoes.map((fn) => <span key={fn} className="chkp-tag">{fn}</span>)}</>
}

// Uma coluna do painel: título + corpo + rodapé "Ver todos" opcional.
function ChkColuna({ titulo, rodape, children }) {
  return (
    <div className="chkp-col">
      <div className="chkp-col-h">{titulo}</div>
      <div className="chkp-col-b">{children}</div>
      {rodape && <div className="chkp-col-f">{rodape}</div>}
    </div>
  )
}

// Empty-state centralizado de uma coluna (ícone + título + subtítulo).
function ChkEmpty({ icon, titulo, sub }) {
  return (
    <div className="chkp-empty">
      <div className="chkp-empty-ic"><ChkIcon name={icon} /></div>
      <div className="chkp-empty-t">{titulo}</div>
      <div className="chkp-empty-s">{sub}</div>
    </div>
  )
}

// Uma linha de checklist dentro de uma coluna.
function ChkLinha({ nome, sub, funcoes, right, onClick }) {
  return (
    <div className={'chkp-row' + (onClick ? ' is-click' : '')} onClick={onClick}>
      <div className="chkp-row-top">
        <span className="chkp-row-name">{nome}</span>
        {right && <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{right}</span>}
      </div>
      <div className="chkp-row-sub">
        {sub && <span>{sub}</span>}
        {funcoes && <ChkTags funcoes={funcoes} />}
      </div>
    </div>
  )
}

// ===================== GUIA INICIAL (modal) =====================
// Onboarding no formato da referência (passos coloridos + "marcar como aprendido"),
// mas com o conteúdo REAL do nosso Checklist: foto SEM IA, execução por login WhatsApp
// na Área do Colaborador (não é QR/anônimo) e só alerta imediato (sem lembrete/boletim).
// Progresso é manual e guardado no localStorage.
const GUIA_KEY = 'chk-guia-aprendidos'
function lerGuiaAprendidos() {
  try { const v = JSON.parse(localStorage.getItem(GUIA_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function salvarGuiaAprendidos(arr) {
  try { localStorage.setItem(GUIA_KEY, JSON.stringify(arr)) } catch { /* storage indisponível — segue sem persistir */ }
}
const GUIA_PASSOS = [
  { k: 'checklist', n: 1, cor: '#eab802', corTxt: '#0e1319', titulo: 'Crie seu primeiro checklist',
    desc: 'Em Checklist › Checklists, clique em "+ Novo checklist". Monte as informações, os itens e a recorrência (todo dia / dias da semana / avulso) — ou parta de um Template pronto.',
    chips: ['Check', 'Avaliação', 'Texto', 'Numérico', 'Seleção', 'Foto'] },
  { k: 'funcao', n: 2, cor: '#e8850c', corTxt: '#ffffff', titulo: 'Defina quem executa',
    desc: 'No editor do checklist, marque as Funções que executam. Quem tem essa função no cadastro (Ponto Facial › Colaboradores) vê o checklist na Área do Colaborador.',
    chips: ['Por função', 'Gestor acompanha', 'Operador executa'] },
  { k: 'alerta', n: 3, cor: '#16a34a', corTxt: '#ffffff', titulo: 'Ative o alerta no WhatsApp',
    desc: 'Em Checklist › Notificações, ligue o alerta imediato e cadastre quem recebe. Quando um item crítico sair do padrão ao concluir, o WhatsApp dispara na hora.',
    chips: ['Alerta imediato', 'WhatsApp'] },
  { k: 'execucao', n: 4, cor: '#2563eb', corTxt: '#ffffff', titulo: 'Acompanhe a primeira execução',
    desc: 'O colaborador executa pelo celular na Área do Colaborador (login por WhatsApp). Você acompanha aqui no Painel: próximos, alertas e execuções recentes com foto.',
    chips: ['Área do Colaborador', 'Login por WhatsApp'] },
]

// Modal do guia (fecha só pelo X/overlay-sem-onClick — padrão dos modais deste arquivo).
function GuiaModal({ aprendidos, onToggle, onAbrirEtapa, onClose }) {
  const feitos = GUIA_PASSOS.filter((s) => aprendidos.includes(s.k)).length
  return (
    <div className="modal-overlay">
      <div className="modal chkg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chkg-head">
          <div className="chkg-head-ic"><ChkIcon name="rocket" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="chkg-head-t">Como usar o Checklist Inteligente</div>
            <div className="chkg-head-s">Guia passo a passo · {feitos} de {GUIA_PASSOS.length} concluídas</div>
          </div>
          <button type="button" className="chkg-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="chkg-body">
          {GUIA_PASSOS.map((s) => {
            const ok = aprendidos.includes(s.k)
            return (
              <div key={s.k} className="chkg-step">
                <div className="chkg-step-h" style={{ background: s.cor, color: s.corTxt }}>
                  <span className="chkg-step-n" style={{ color: s.cor }}>{s.n}</span>
                  <span className="chkg-step-t">{s.titulo}</span>
                  <button type="button" className="chkg-mark" onClick={() => onToggle(s.k)}
                    style={ok ? { background: '#ffffff', color: s.cor, borderColor: '#ffffff' } : { color: s.corTxt, borderColor: s.corTxt }}>
                    {ok ? '✓ Aprendido' : 'Marcar como aprendido'}
                  </button>
                </div>
                <div className="chkg-step-b">
                  <p className="chkg-step-desc">{s.desc}</p>
                  <div className="chkg-recursos">
                    <div className="chkg-recursos-t">Ações e recursos:</div>
                    <div className="chkg-chips">{s.chips.map((c) => <span key={c} className="chkg-chip">{c}</span>)}</div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAbrirEtapa(s.k)}>Abrir etapa</button>
                </div>
              </div>
            )
          })}
        </div>
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
  const [verGuia, setVerGuia] = useState(false) // modal do guia inicial aberto?
  const [aprendidos, setAprendidos] = useState(lerGuiaAprendidos) // etapas marcadas como aprendidas (localStorage)
  const execRef = useRef(null) // âncora da seção "Execuções recentes" (rolagem dos "Ver todos")

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
  const meusPreview = p.meus.slice(0, 8)
  const feitos = GUIA_PASSOS.filter((s) => aprendidos.includes(s.k)).length
  const toggleAprendido = (k) => setAprendidos((prev) => {
    const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    salvarGuiaAprendidos(next)
    return next
  })
  const abrirEtapa = (k) => {
    setVerGuia(false)
    if (k === 'checklist') navigate('/checklist/checklists?novo=1')
    else if (k === 'funcao') navigate('/checklist/checklists')
    else if (k === 'alerta') navigate('/checklist/notificacoes')
    else if (k === 'execucao') setTimeout(() => execRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  return (
    <div>
      <div className="chkp-top">
        <div className="chkp-guia">
          <div className="chkp-guia-head">
            <div className="chkp-guia-ic"><ChkIcon name="rocket" /></div>
            <div className="chkp-guia-title">Guia inicial</div>
            <div className="chkp-guia-frac">{feitos}/{GUIA_PASSOS.length}</div>
          </div>
          <div className="chkp-guia-track"><div className="chkp-guia-fill" style={{ width: `${(feitos / GUIA_PASSOS.length) * 100}%` }} /></div>
          <button type="button" className="chkp-guia-btn" onClick={() => setVerGuia(true)}>
            <ChkIcon name="chevron" size={13} /> Ver etapas
          </button>
        </div>
        <div className="chkp-card chkp-kpi">
          <div className="chkp-kpi-ic is-gold"><ChkIcon name="lista" /></div>
          <div><div className="chkp-kpi-n">{p.kpis.ativos}</div><div className="chkp-kpi-l">Checklists ativos</div></div>
        </div>
        <div className="chkp-card chkp-kpi">
          <div className="chkp-kpi-ic is-green"><ChkIcon name="check" /></div>
          <div><div className="chkp-kpi-n">{p.kpis.concluidosHoje}</div><div className="chkp-kpi-l">Concluídos hoje</div></div>
        </div>
        <div className="chkp-card chkp-kpi">
          <div className="chkp-kpi-ic is-red"><ChkIcon name="alerta" /></div>
          <div><div className="chkp-kpi-n">{p.kpis.emAlerta}</div><div className="chkp-kpi-l">Alertas pendentes</div></div>
        </div>
      </div>

      <div className="chkp-cols">
        <ChkColuna titulo="Próximos agendamentos"
          rodape={<button type="button" className="chkp-link" onClick={() => execRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver todas execuções →</button>}>
          {p.proximos.length === 0
            ? <ChkEmpty icon="relogio" titulo="Sem agendamentos hoje" sub="Não há checklists programados para hoje." />
            : p.proximos.map((c) => (
              <ChkLinha key={c.id} nome={c.nome} sub={c.categoria} funcoes={c.responsavel}
                right={<span className="badge badge-gray">{c.status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Pendente'}</span>} />
            ))}
        </ChkColuna>
        <ChkColuna titulo="Sem agendamento"
          rodape={<button type="button" className="chkp-link" onClick={() => navigate('/checklist/checklists')}>Ver todos →</button>}>
          {p.semAgendamento.length === 0 ? (
            <div className="chkp-empty">
              <div className="chkp-empty-ic is-plus" onClick={() => navigate('/checklist/checklists?novo=1')} title="Novo checklist avulso">+</div>
              <div className="chkp-empty-t">Tudo agendado</div>
              <div className="chkp-empty-s">Crie um checklist avulso para rodar sob demanda.</div>
            </div>
          ) : p.semAgendamento.map((c) => (
            <ChkLinha key={c.id} nome={c.nome} sub={`${c.categoria} · ${c.itens} ${c.itens === 1 ? 'item' : 'itens'}`} funcoes={c.responsavel} />
          ))}
        </ChkColuna>
        <ChkColuna titulo="Checks em alerta"
          rodape={<button type="button" className="chkp-link" onClick={() => execRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver todos os alertas →</button>}>
          {p.alertas.length === 0
            ? <ChkEmpty icon="alerta" titulo="Sem alertas" sub="Nenhum check em alerta no momento." />
            : p.alertas.map((c) => (
              <ChkLinha key={c.id} nome={c.nome} sub={c.categoria}
                onClick={c.execId ? () => setVerExecucaoId(c.execId) : undefined}
                right={<span className="badge badge-red">Fora do padrão</span>} />
            ))}
        </ChkColuna>
      </div>

      <div className="chkp-meus">
        <div className="chkp-meus-h">
          <h3>Meus checklists</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/checklist/checklists')}>Ver todos</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/checklist/checklists?novo=1')}>+ Novo checklist</button>
        </div>
        {meusPreview.length === 0 ? (
          <div className="table-card" style={{ padding: 30, textAlign: 'center', color: 'var(--app-text-3)' }}>Nenhum checklist encontrado.</div>
        ) : (
          <div className="table-card">
            <table className="hb-table">
              <thead><tr><th>Nome</th><th>Categoria</th><th>Prioridade</th><th>Recorrência</th><th>Itens</th><th>Responsável</th><th></th></tr></thead>
              <tbody>
                {meusPreview.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nome}</td>
                    <td>{c.categoria}</td>
                    <td>{PRIORIDADE_LABEL[c.prioridade] || c.prioridade}</td>
                    <td>{REC_LABEL[c.recorrenciaTipo] || c.recorrenciaTipo}</td>
                    <td>{c.itens}</td>
                    <td>{(c.responsavel && c.responsavel.length) ? c.responsavel.join(', ') : <span style={{ color: '#999' }}>—</span>}</td>
                    <td style={{ textAlign: 'right' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/checklist/checklists?editar=${c.id}`)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h3 ref={execRef} style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', scrollMarginTop: 12 }}>Execuções recentes</h3>
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
      {verGuia && <GuiaModal aprendidos={aprendidos} onToggle={toggleAprendido} onAbrirEtapa={abrirEtapa} onClose={() => setVerGuia(false)} />}
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

// As 4 etapas do wizard do editor de checklist (Task B1): Informações → Itens →
// Agendamento → Revisão. WZ_PRIORIDADES dá cor semântica aos 3 botões segmentados
// de prioridade (verde/dourado/vermelho — mesma leitura de "farol" do resto do app).
const WZ_ETAPAS = [
  { n: 1, label: 'Informações' },
  { n: 2, label: 'Itens do Checklist' },
  { n: 3, label: 'Agendamento' },
  { n: 4, label: 'Revisão' },
]
const WZ_PRIORIDADES = [
  { v: 'BAIXA', l: 'Baixa', cor: '#16a34a' },
  { v: 'MEDIA', l: 'Média', cor: '#eab802' },
  { v: 'ALTA', l: 'Alta', cor: '#dc2626' },
]

// Stepper do topo do wizard — passo atual em destaque (roxo), concluídos em verde,
// os demais neutros (tokens --app-*, tema-aware). Só visual: a navegação real
// (Voltar/Próximo/validação) vive nos botões no rodapé do editor.
function WzStepper({ etapa }) {
  return (
    <div className="wz-steps">
      {WZ_ETAPAS.map((e, i) => {
        const estado = e.n < etapa ? 'done' : e.n === etapa ? 'active' : 'todo'
        return (
          <div key={e.n} className={'wz-step wz-step-' + estado}>
            <div className="wz-step-row">
              <span className="wz-step-circle">{estado === 'done' ? '✓' : e.n}</span>
              <span className="wz-step-label">{e.label}</span>
            </div>
            {i < WZ_ETAPAS.length - 1 && <span className="wz-step-line" />}
          </div>
        )
      })}
    </div>
  )
}

function ChecklistEditor({ inicial, notify, onClose, onSalvou }) {
  const [f, setF] = useState(() => ({
    ...inicial,
    descricao: inicial.descricao || '',
    tempoEstimadoMin: inicial.tempoEstimadoMin ?? null,
    atribuicaoTipo: inicial.atribuicaoTipo || 'FUNCAO',
    funcoes: inicial.funcoes || [],
    funcionarioIds: inicial.funcionarioIds || [],
    recorrenciaConfig: { diasSemana: [], horarioLimite: '', toleranciaMin: 0, ...(inicial.recorrenciaConfig || {}) },
    itens: inicial.itens || [],
  }))
  const [etapa, setEtapa] = useState(1) // 1..4 — Informações / Itens / Agendamento / Revisão
  const [funcoesDisp, setFuncoesDisp] = useState([]) // funções cadastradas (reusa /funcoes)
  const [equipe, setEquipe] = useState([]) // funcionários ativos (modo COLABORADOR)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    // Modo FUNCAO reusa /funcoes (Bonificação › Funções da equipe); modo COLABORADOR usa a
    // equipe ativa (Ponto Facial). Carrega os dois — o editor alterna sem novo fetch.
    api.get('/funcoes').then((r) => setFuncoesDisp(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    api.get('/funcionarios', { params: { status: 'ATIVO' } }).then((r) => setEquipe(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const updRc = (k, v) => setF((s) => ({ ...s, recorrenciaConfig: { ...s.recorrenciaConfig, [k]: v } }))
  const toggleFuncao = (nome) => setF((s) => ({ ...s, funcoes: s.funcoes.includes(nome) ? s.funcoes.filter((x) => x !== nome) : [...s.funcoes, nome] }))
  const toggleFuncionario = (id) => setF((s) => ({ ...s, funcionarioIds: s.funcionarioIds.includes(id) ? s.funcionarioIds.filter((x) => x !== id) : [...s.funcionarioIds, id] }))
  // Opções = funções registradas (Bonificação › Funções da equipe) + as já atribuídas ao checklist
  // que porventura não estejam na lista (a função do colaborador é texto livre e pode
  // divergir das registradas). Assim editar nunca some com um chip já marcado.
  const funcoesOpcoes = [...new Set([...funcoesDisp.map((fn) => fn.nome), ...(f.funcoes || [])])]
  const toggleDow = (d) => updRc('diasSemana', f.recorrenciaConfig.diasSemana.includes(d) ? f.recorrenciaConfig.diasSemana.filter((x) => x !== d) : [...f.recorrenciaConfig.diasSemana, d])
  const setItem = (i, patch) => setF((s) => ({ ...s, itens: s.itens.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
  const addItem = () => setF((s) => ({ ...s, itens: [...s.itens, { tipo: 'CHECK', titulo: '', descricao: '', critico: false, config: {} }] }))
  const rmItem = (i) => setF((s) => ({ ...s, itens: s.itens.filter((_, j) => j !== i) }))

  // Navegação do wizard — o estado `f` é único (não recria por etapa), só troca o
  // que renderiza. Única validação ao avançar é o nome (etapa 1); item sem título
  // já é barrado no `salvar` (e volta o operador pra etapa 2, onde estão os itens).
  function proximaEtapa() {
    if (etapa === 1 && !f.nome?.trim()) { notify('Informe o nome do checklist.', 'error'); return }
    setEtapa((e) => Math.min(4, e + 1))
  }
  function etapaAnterior() { setEtapa((e) => Math.max(1, e - 1)) }

  async function salvar() {
    if (!f.nome?.trim()) { notify('Informe o nome do checklist.', 'error'); setEtapa(1); return }
    // Valida no cliente antes de mandar pro backend — o 400 "Todo item precisa de um
    // título." de lá não diz qual, então aponta a posição aqui (e leva pra etapa dos itens).
    const itemSemTitulo = f.itens.findIndex((it) => !it.titulo?.trim())
    if (itemSemTitulo !== -1) { notify(`O item ${itemSemTitulo + 1} está sem título.`, 'error'); setEtapa(2); return }
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
        tempoEstimadoMin: f.tempoEstimadoMin,
        atribuicaoTipo: f.atribuicaoTipo,
        funcoes: f.funcoes,
        funcionarioIds: f.funcionarioIds,
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-title">{f.novo ? 'Novo checklist' : 'Editar checklist'}</div>

        <WzStepper etapa={etapa} />

        {etapa === 1 && (
          <div>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Nome</label><input className="form-input" value={f.nome} onChange={(e) => upd('nome', e.target.value)} /></div>
              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-input" value={f.categoria} onChange={(e) => upd('categoria', e.target.value)}>
                  {CHECKLIST_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tempo estimado (min) — opcional</label>
              <input className="form-input" type="number" min={0} style={{ maxWidth: 140 }} placeholder="Ex.: 15"
                value={f.tempoEstimadoMin ?? ''} onChange={(e) => upd('tempoEstimadoMin', e.target.value === '' ? null : Number(e.target.value))} />
            </div>

            <div className="form-group">
              <label className="form-label">Descrição (opcional)</label>
              <textarea className="form-input" style={{ width: '100%', minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} maxLength={300}
                placeholder="O que este checklist cobre" value={f.descricao} onChange={(e) => upd('descricao', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <div className="wz-seg">
                {WZ_PRIORIDADES.map((o) => (
                  <button key={o.v} type="button" className={'wz-seg-btn' + (f.prioridade === o.v ? ' on' : '')}
                    style={f.prioridade === o.v ? { background: o.cor, color: o.v === 'MEDIA' ? '#3a2c00' : '#fff', borderColor: o.cor } : undefined}
                    onClick={() => upd('prioridade', o.v)}>{o.l}</button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Atribuir a</label>
              {/* Modo: por FUNÇÃO (qualquer um do cargo) ou por COLABORADOR (pessoas específicas —
                  responsabilidade clara, sem "jogar a culpa pra outra"). */}
              <div className="chip-row" style={{ marginBottom: 8 }}>
                <button type="button" className={'chip' + (f.atribuicaoTipo !== 'COLABORADOR' ? ' chip-on' : '')} onClick={() => upd('atribuicaoTipo', 'FUNCAO')}>Função</button>
                <button type="button" className={'chip' + (f.atribuicaoTipo === 'COLABORADOR' ? ' chip-on' : '')} onClick={() => upd('atribuicaoTipo', 'COLABORADOR')}>Colaborador</button>
              </div>

              {f.atribuicaoTipo === 'COLABORADOR' ? (
                equipe.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#999' }}>Nenhum colaborador ativo — cadastre em Ponto Facial › Colaboradores.</span>
                ) : (
                  <>
                    <div className="chip-row">
                      {equipe.map((fn) => (
                        <button key={fn.id} type="button" className={'chip' + (f.funcionarioIds.includes(fn.id) ? ' chip-on' : '')} onClick={() => toggleFuncionario(fn.id)} title={fn.funcao || ''}>
                          {fn.apelido || fn.nome}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Só essas pessoas veem o checklist na Área do Colaborador — e são cobradas no lembrete de atraso.</div>
                  </>
                )
              ) : (
                <>
                  {funcoesOpcoes.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#999' }}>Nenhuma função cadastrada — cadastre em Bonificação › Configuração › Funções da equipe.</span>
                  ) : (
                    <div className="chip-row">
                      {funcoesOpcoes.map((nome) => (
                        <button key={nome} type="button" className={'chip' + (f.funcoes.includes(nome) ? ' chip-on' : '')} onClick={() => toggleFuncao(nome)}>{nome}</button>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Quem tem essa função no cadastro (Ponto Facial › Colaboradores) vê o checklist na Área do Colaborador.</div>
                </>
              )}
            </div>
          </div>
        )}

        {etapa === 2 && (
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Itens</label>
            {f.itens.length === 0 && <div className="empty-state" style={{ padding: 20 }}>Nenhum item ainda.</div>}
            {f.itens.map((it, i) => (
              <div key={i} className="table-card" style={{ padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Troca de tipo zera só os campos por-tipo (min/max, opções, nota mínima) —
                      dica/instrução são genéricas a qualquer tipo, então sobrevivem à troca. */}
                  <select className="form-input" style={{ width: 130, flexShrink: 0 }} value={it.tipo}
                    onChange={(e) => setItem(i, { tipo: e.target.value, config: { dica: it.config?.dica, instrucaoAlerta: it.config?.instrucaoAlerta } })}>
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

                <div style={{ marginTop: 8 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Dicas para execução (opcional)</label>
                  <textarea className="form-input" style={{ width: '100%', minHeight: 46, resize: 'vertical', fontFamily: 'inherit', marginTop: 3 }} maxLength={300}
                    placeholder="O que ajuda o colaborador a fazer certo"
                    value={it.config?.dica || ''} onChange={(e) => setItem(i, { config: { ...it.config, dica: e.target.value } })} />
                </div>
                <div style={{ marginTop: 6 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Instruções da gestão para alertas (opcional)</label>
                  <textarea className="form-input" style={{ width: '100%', minHeight: 46, resize: 'vertical', fontFamily: 'inherit', marginTop: 3 }} maxLength={300}
                    placeholder="O que fazer se este item ficar fora do padrão"
                    value={it.config?.instrucaoAlerta || ''} onChange={(e) => setItem(i, { config: { ...it.config, instrucaoAlerta: e.target.value } })} />
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar item</button>
          </div>
        )}

        {etapa === 3 && (
          <div>
            <div className="form-group">
              <label className="form-label">Recorrência</label>
              <select className="form-input" value={f.recorrenciaTipo} onChange={(e) => upd('recorrenciaTipo', e.target.value)}>
                <option value="DIARIA">Todo dia</option><option value="DIAS_SEMANA">Dias da semana</option><option value="AVULSO">Sem agendamento</option>
              </select>
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
              <>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Horário de execução (opcional)</label>
                    <input className="form-input" style={{ maxWidth: 120 }} placeholder="HH:mm" value={f.recorrenciaConfig.horarioLimite || ''} onChange={(e) => updRc('horarioLimite', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tolerância (min)</label>
                    <input className="form-input" type="number" min={0} max={240} style={{ maxWidth: 120 }} placeholder="0"
                      value={f.recorrenciaConfig.toleranciaMin ?? 0} onChange={(e) => updRc('toleranciaMin', e.target.value === '' ? 0 : Number(e.target.value))} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#999', marginTop: -6, marginBottom: 14 }}>O lembrete de atraso dispara esses minutos depois do horário de execução.</div>
              </>
            )}
          </div>
        )}

        {etapa === 4 && (
          <div>
            <div className="table-card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{f.nome || <span style={{ color: '#999' }}>(sem nome)</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--app-text-soft, #888)' }}>
                {f.categoria} · {f.itens.length} {f.itens.length === 1 ? 'item' : 'itens'} · {REC_LABEL[f.recorrenciaTipo] || f.recorrenciaTipo}
                {f.recorrenciaTipo !== 'AVULSO' && f.recorrenciaConfig.horarioLimite ? ` às ${f.recorrenciaConfig.horarioLimite}` : ''}
              </div>
            </div>

            <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Itens</label>
            {f.itens.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>Nenhum item ainda.</div>
            ) : (
              f.itens.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid var(--app-border, #eee)' }}>
                  <span style={{ fontSize: 13 }}>
                    {it.titulo || `Item ${i + 1}`}{it.critico && <span style={{ color: '#dc2626' }} title="Item crítico"> *</span>}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--app-text-soft, #888)', flexShrink: 0 }}>{TIPO_LABEL[it.tipo] || it.tipo}</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="wz-actions">
          <div className="wz-actions-left">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
            {etapa > 1 && <button type="button" className="btn btn-secondary" onClick={etapaAnterior} disabled={salvando}>Voltar</button>}
          </div>
          <div className="wz-actions-right">
            {etapa < 4 ? (
              <button type="button" className="btn btn-primary" onClick={proximaEtapa}>Próximo</button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar checklist'}</button>
            )}
          </div>
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
      // Só os destinatários do alerta IMEDIATO — os de atraso vivem na aba Configurações.
      .then((r) => { setConfig(r.data.config); setDests((r.data.destinatarios || []).filter((d) => d.tipo === 'IMEDIATO')) })
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
      // O PUT é full-replace-ish: campo ausente = reseta (lembreteAtivo->false,
      // lembreteTemplate->'', lembreteMinutosAntes->30). Manda o que já está salvo
      // pros 3 campos de lembrete (aba Configurações) pra não zerá-los sem querer.
      await api.put('/checklist/notificacoes/config', {
        alertaImediatoAtivo: novo,
        lembreteAtivo: config.lembreteAtivo,
        lembreteTemplate: config.lembreteTemplate,
        lembreteMinutosAntes: config.lembreteMinutosAntes,
      })
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

// ===================== CONFIGURAÇÕES (lembrete de atraso) =====================
// Mesmo padrão da AbaNotificacoes (alerta imediato): toggle otimista + card de
// destinatários com form de adicionar + ConfirmDialog na exclusão. A diferença é o
// card do lembrete em si (modelo de mensagem editável — a tolerância em minutos agora
// é por checklist, configurada na etapa de Agendamento do wizard) e a lista de
// destinatários é filtrada por tipo==='ATRASO' (o alerta imediato usa 'IMEDIATO').
const LEMBRETE_TOKENS = [
  { label: 'Nome do checklist', token: '[nome do checklist]' },
  { label: 'Horário do checklist', token: '[horário do checklist]' },
  { label: 'Nome do responsável', token: '[nome do responsável]' },
]

function AbaConfiguracoes({ notify }) {
  const [config, setConfig] = useState(null)
  const [destsAll, setDestsAll] = useState([])
  const [template, setTemplate] = useState('')
  const [previa, setPrevia] = useState('')
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false) // trava o toggle
  const [salvando, setSalvando] = useState(false) // trava o botão Salvar
  const [nome, setNome] = useState('')
  const [whats, setWhats] = useState('')
  const [salvandoDest, setSalvandoDest] = useState(false)
  const [excluir, setExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const templateRef = useRef(null)

  const dests = destsAll.filter((d) => d.tipo === 'ATRASO')

  function carregar() {
    api.get('/checklist/notificacoes')
      .then((r) => {
        setConfig(r.data.config)
        setDestsAll(r.data.destinatarios || [])
        setTemplate(r.data.config?.lembreteTemplate || '')
      })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar as configurações.', 'error'))
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle otimista — só mexe em lembreteAtivo; os outros campos vão com o valor já
  // salvo (não a edição em andamento no textarea) pra não commitar rascunho sem
  // querer. Mesmo cuidado do PUT full-replace-ish explicado no toggleAtivo acima.
  async function toggleLembrete() {
    if (salvandoConfig || !config) return
    const novo = !config.lembreteAtivo
    setConfig((c) => ({ ...c, lembreteAtivo: novo }))
    setSalvandoConfig(true)
    try {
      await api.put('/checklist/notificacoes/config', {
        alertaImediatoAtivo: config.alertaImediatoAtivo,
        lembreteAtivo: novo,
        lembreteTemplate: config.lembreteTemplate,
      })
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível salvar a configuração.', 'error')
      carregar()
    } finally {
      setSalvandoConfig(false)
    }
  }

  // Insere o token na posição do cursor (ou no fim, se o textarea ainda não tiver foco).
  function inserirToken(token) {
    const el = templateRef.current
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : template.length
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : template.length
    setTemplate((atual) => atual.slice(0, start) + token + atual.slice(end))
  }

  async function salvar() {
    if (salvando || !config) return
    setSalvando(true)
    try {
      const r = await api.put('/checklist/notificacoes/config', {
        alertaImediatoAtivo: config.alertaImediatoAtivo,
        lembreteAtivo: config.lembreteAtivo,
        lembreteTemplate: template,
      })
      setConfig(r.data.config)
      setTemplate(r.data.config.lembreteTemplate)
      notify('Configurações do lembrete salvas.')
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function verPrevia() {
    setCarregandoPrevia(true)
    try {
      const r = await api.get('/checklist/notificacoes/lembrete/previa')
      setPrevia(r.data.previa)
    } catch (err) {
      notify(err?.response?.data?.error ?? 'Não foi possível carregar a prévia.', 'error')
    } finally {
      setCarregandoPrevia(false)
    }
  }

  async function addDest(e) {
    e.preventDefault()
    if (!nome.trim() || !whats.trim() || salvandoDest) return
    setSalvandoDest(true)
    try {
      await api.post('/checklist/notificacoes/destinatarios', { nome, whatsapp: whats, tipo: 'ATRASO' })
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

  if (!config) return <div className="loading-state">Carregando…</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="table-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Lembrete de atraso</div>
            <div style={{ fontSize: 12, color: 'var(--app-text-soft, #888)' }}>
              Quando um checklist passa do horário-limite sem ser concluído, os destinatários de atraso recebem um lembrete no WhatsApp (uma vez por checklist, por dia).
            </div>
          </div>
          <label style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!config.lembreteAtivo} disabled={salvandoConfig} onChange={toggleLembrete} />
            {config.lembreteAtivo ? 'Ativo' : 'Inativo'}
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Modelo da mensagem</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {LEMBRETE_TOKENS.map((t) => (
              <button key={t.token} type="button" className="btn btn-secondary btn-sm" onClick={() => inserirToken(t.token)}>
                + {t.label}
              </button>
            ))}
          </div>
          <textarea
            ref={templateRef}
            className="form-input"
            style={{ width: '100%', minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Aviso: o checklist [nome do checklist] previsto para as [horário do checklist] não foi concluído. Colaborador responsável: [nome do responsável]. Por favor, verifique."
            value={template}
            maxLength={600}
            onChange={(e) => setTemplate(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={verPrevia} disabled={carregandoPrevia}>
            {carregandoPrevia ? 'Carregando…' : 'Ver prévia'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        {previa && (
          <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--app-surface-2,#f7f7f7)', border: '1px solid var(--app-border,#eee)', borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12 }}>
            {previa}
          </pre>
        )}
      </div>

      <form onSubmit={addDest} className="table-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Notificações de atraso</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder="WhatsApp (DDD+número)" value={whats} onChange={(e) => setWhats(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={salvandoDest || !nome.trim() || !whats.trim()}>
            {salvandoDest ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
        {dests.length === 0 ? (
          <p className="empty-state">Nenhum destinatário. Adicione quem deve receber os lembretes de atraso.</p>
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
    </div>
  )
}
