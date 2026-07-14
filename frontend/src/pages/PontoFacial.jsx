// Dep. Pessoal › Ponto Facial — controle de ponto da equipe.
// Alimenta a Presença da Bonificação. As batidas podem vir do coletor facial
// (casadas pelo CPF), de importação, ou de lançamento manual. Restrito ao ADMIN.
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatarWhats, mascararTelefone } from '../utils/telefone'

// ---- helpers ---------------------------------------------------------------
function iniciais(nome) {
  const ps = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '?'
  return (ps[0][0] + (ps.length > 1 ? ps[ps.length - 1][0] : '')).toUpperCase()
}
function mascararCPF(v) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
function fmtDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
// datetime-local prefill = agora, no fuso local
function agoraLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
// Presets de período da aba Marcações. Datas calculadas no fuso local (BR).
const PERIODOS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'mes', label: 'Mês atual' },
  { id: 'mespassado', label: 'Mês passado' },
  { id: 'max', label: 'Período máximo' },
]
function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function rangePreset(preset) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const somaDias = (base, n) => { const x = new Date(base); x.setDate(x.getDate() + n); return x }
  switch (preset) {
    case 'hoje': return { de: ymdLocal(hoje), ate: ymdLocal(hoje) }
    case 'ontem': { const o = somaDias(hoje, -1); return { de: ymdLocal(o), ate: ymdLocal(o) } }
    case '7d': return { de: ymdLocal(somaDias(hoje, -6)), ate: ymdLocal(hoje) }
    case '30d': return { de: ymdLocal(somaDias(hoje, -29)), ate: ymdLocal(hoje) }
    case 'mespassado': {
      const p = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const u = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
      return { de: ymdLocal(p), ate: ymdLocal(u) }
    }
    case 'max': return { de: null, ate: null }
    case 'mes':
    default: {
      const p = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const u = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      return { de: ymdLocal(p), ate: ymdLocal(u) }
    }
  }
}

const SITUACAO = {
  presente: { label: 'Presente', bg: '#dcfce7', fg: '#166534' },
  intervalo: { label: 'Em intervalo', bg: '#fef3c7', fg: '#92400e' },
  encerrado: { label: 'Encerrado', bg: '#dbeafe', fg: '#1e40af' },
  ausente: { label: 'Ausente', bg: '#f4f4f5', fg: '#52525b' }
}
const TIPOS = [
  { id: 'ENTRADA', label: 'Entrada' },
  { id: 'SAIDA_INTERVALO', label: 'Saída p/ intervalo' },
  { id: 'RETORNO_INTERVALO', label: 'Retorno do intervalo' },
  { id: 'SAIDA', label: 'Saída' }
]
const FUNCOES_SUGERIDAS = ['Cozinha', 'Atendimento', 'Caixa', 'Gerência', 'Chapa', 'Montagem']

// --- envio ao coletor (com barra de progresso) -----------------------------
// O cadastro entra numa fila (PENDENTE) e só vira ENVIADO quando o coletor dá o
// próximo "sinal" (~20s). O hook faz polling do status pra mostrar o progresso
// REAL — igual à barrinha da DIXI, que espera o aparelho responder.
function useEnvioColetor(notify) {
  const [envio, setEnvio] = useState(null) // { total, enviados, inicio, concluido, erro }
  const timerRef = useRef(null)
  const parar = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }, [])
  useEffect(() => () => parar(), [parar]) // limpa ao desmontar
  const fechar = useCallback(() => { parar(); setEnvio(null) }, [parar])

  const enviar = useCallback(async (payload) => {
    parar()
    let ids
    try {
      const r = await api.post('/ponto/coletor/enviar', payload)
      ids = r.data?.comandoIds || []
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível enviar ao coletor.', 'error')
      return false
    }
    if (!ids.length) { notify('Nenhum coletor ativo pra receber.', 'error'); return false }
    const inicio = Date.now()
    setEnvio({ total: ids.length, enviados: 0, inicio, concluido: false, erro: null })
    timerRef.current = setInterval(async () => {
      let enviados = 0
      try {
        const s = await api.get('/ponto/coletor/enviar/status', { params: { ids: ids.join(',') } })
        enviados = s.data?.enviados || 0
      } catch { /* mantém tentando no próximo tick */ }
      if (enviados >= ids.length) { parar(); setEnvio((e) => e && { ...e, enviados, concluido: true }) }
      else if (Date.now() - inicio > 60000) { parar(); setEnvio((e) => e && { ...e, enviados, erro: 'O coletor não respondeu agora. O cadastro fica na fila e vai assim que ele der sinal.' }) }
      else setEnvio((e) => e && { ...e, enviados })
    }, 1500)
    return true
  }, [parar, notify])

  return { envio, enviar, fechar }
}

// Modal-barra do envio. Não fecha ao clicar fora (só no botão).
function ModalProgressoEnvio({ envio, onClose }) {
  if (!envio) return null
  const { total, enviados, concluido, erro, inicio } = envio
  let pct, cor
  if (concluido) { pct = 100; cor = '#16a34a' }
  else if (erro) { pct = 100; cor = '#d97706' }
  else { pct = Math.max(6, Math.min(92, Math.round(((Date.now() - inicio) / 18000) * 100))); cor = '#2563eb' }
  const finalizado = concluido || erro
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430 }}>
        <div className="modal-title">{concluido ? 'Enviado ao coletor' : erro ? 'Ainda não chegou' : 'Enviando ao coletor…'}</div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--app-border, #e5e5e5)', overflow: 'hidden', margin: '2px 0 12px' }}>
          <div style={{ height: '100%', width: pct + '%', background: cor, borderRadius: 999, transition: 'width 1.4s linear' }} />
        </div>
        {!finalizado && (
          <div className="page-header-sub" style={{ margin: 0 }}>
            Aguardando o coletor receber — costuma levar alguns segundos.
            {total > 1 && <> <strong>{enviados} de {total}</strong> confirmados.</>}
          </div>
        )}
        {concluido && (
          <div className="page-header-sub" style={{ margin: 0 }}>
            {total > 1 ? `${total} cadastros chegaram no coletor.` : 'Cadastro criado no coletor.'} Agora, no aparelho, cadastre a face: <strong>Menu › Usuários</strong> → selecione o usuário (pelo ID/nome) → <strong>Face</strong>.
          </div>
        )}
        {erro && (
          <div className="page-header-sub" style={{ margin: 0, color: '#92400e' }}>
            {erro}{total > 1 && enviados > 0 ? ` (${enviados} de ${total} já foram)` : ''}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className={'btn ' + (finalizado ? 'btn-primary' : 'btn-secondary')} onClick={onClose}>{finalizado ? 'OK' : 'Fechar'}</button>
        </div>
      </div>
    </div>
  )
}

function Pill({ meta }) {
  if (!meta) return <span>—</span>
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: meta.bg, color: meta.fg }}>
      {meta.label}
    </span>
  )
}

const TABS = [
  { id: 'painel', label: 'Painel', sub: 'Situação do dia' },
  { id: 'colaboradores', label: 'Colaboradores', sub: 'Cadastro da equipe' },
  { id: 'jornadas', label: 'Jornadas e Escalas', sub: 'Horários e folgas' },
  { id: 'marcacoes', label: 'Marcações', sub: 'Batidas de ponto' },
  { id: 'espelho', label: 'Espelho', sub: 'Previsto × realizado do mês' },
  { id: 'fechamento', label: 'Fechamento', sub: 'Consolidação do mês' },
  { id: 'coletor', label: 'Coletor', sub: 'Aparelho de biometria' }
]

// Aba controlada pela URL (/rh/ponto-facial/:tab); a navegação é pela sidebar.
const PF_IDS = TABS.map((t) => t.id)
export default function PontoFacial() {
  const { tab: tabParam } = useParams()
  const tab = PF_IDS.includes(tabParam) ? tabParam : 'painel'
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

      {tab === 'painel' && <Painel />}
      {tab === 'colaboradores' && <Colaboradores notify={notify} />}
      {tab === 'jornadas' && <Jornadas notify={notify} />}
      {tab === 'marcacoes' && <Marcacoes notify={notify} />}
      {tab === 'espelho' && <Espelho notify={notify} />}
      {tab === 'fechamento' && <Fechamento notify={notify} />}
      {tab === 'coletor' && <Coletor notify={notify} />}
    </div>
  )
}

// ===================== COLETOR (DIXI) =====================
const fmtDT = (x) => (x ? new Date(x).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

function Coletor({ notify }) {
  const [coletores, setColetores] = useState([])
  const [pendencias, setPendencias] = useState([])
  const [funcionarios, setFuncionarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [sel, setSel] = useState({}) // { enrollid: funcionarioId } em edição
  const [cfg, setCfg] = useState({ dedupeMin: 15, usaIntervalo: false })
  const [salvandoCfg, setSalvandoCfg] = useState(false)
  const { envio, enviar, fechar } = useEnvioColetor(notify)

  const carregar = useCallback(() => {
    setLoading(true); setErro(null)
    Promise.all([
      api.get('/ponto/coletores'),
      api.get('/ponto/coletor/pendencias'),
      api.get('/ponto/colaboradores'),
      api.get('/ponto/config'),
    ]).then(([c, p, f, cf]) => {
      setColetores(c.data || [])
      setPendencias(p.data || [])
      setFuncionarios((f.data || []).filter((x) => x.status === 'ATIVO'))
      if (cf.data) setCfg({ dedupeMin: cf.data.dedupeMin ?? 15, usaIntervalo: !!cf.data.usaIntervalo })
    }).catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function salvarConfig() {
    setSalvandoCfg(true)
    try {
      const r = await api.put('/ponto/config', { dedupeMin: Number(cfg.dedupeMin) || 0, usaIntervalo: cfg.usaIntervalo })
      setCfg({ dedupeMin: r.data.dedupeMin, usaIntervalo: r.data.usaIntervalo })
      notify('Regras de marcação salvas.')
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
    finally { setSalvandoCfg(false) }
  }

  async function toggleColetor(c) {
    try {
      await api.put(`/ponto/coletores/${c.id}/ativar`, { ativo: !c.ativo })
      notify(c.ativo ? 'Coletor desativado.' : 'Coletor ativado — batidas passam a virar ponto.')
      carregar()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao atualizar.', 'error') }
  }
  async function vincular(enrollid) {
    const funcionarioId = sel[enrollid]
    if (!funcionarioId) return
    try {
      const r = await api.post('/ponto/coletor/pendencias/vincular', { enrollid, funcionarioId: Number(funcionarioId) })
      notify(`Vinculado! ${r.data.criados} batida(s) viraram ponto.`)
      setSel((s) => ({ ...s, [enrollid]: '' })); carregar()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao vincular.', 'error') }
  }
  // Envia todos os colaboradores ativos pro coletor (carga inicial).
  async function enviarTodos() {
    const ok = await enviar({ todos: true })
    if (ok) carregar() // enrollids foram atribuídos no envio
  }

  // Agrupa pendências por enrollid (1 linha por ID do coletor).
  const porEnrollid = useMemo(() => {
    const m = new Map()
    for (const p of pendencias) {
      if (!m.has(p.enrollid)) m.set(p.enrollid, { enrollid: p.enrollid, nome: p.nome, count: 0, ultima: p.dataHora })
      const g = m.get(p.enrollid); g.count++; if (p.dataHora > g.ultima) g.ultima = p.dataHora
    }
    return [...m.values()].sort((a, b) => (a.ultima < b.ultima ? 1 : -1))
  }, [pendencias])

  if (loading) return <div className="loading-state">Carregando…</div>
  if (erro) return <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>

  const temPendente = coletores.some((c) => !c.ativo)

  return (
    <div>
      {/* Regras de marcação — anti-duplicação + modo de batidas */}
      <div className="table-card" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Regras de marcação</div>
            <div style={{ fontSize: 12.5, color: 'var(--app-text-soft, #737373)', marginTop: 3 }}>Como as batidas do coletor viram ponto.</div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={salvarConfig} disabled={salvandoCfg}>{salvandoCfg ? 'Salvando…' : 'Salvar'}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Janela anti-duplicação</label>
            <div style={{ position: 'relative', maxWidth: 150 }}>
              <input type="number" min="0" max="240" className="form-input" style={{ paddingRight: 42 }}
                value={cfg.dedupeMin} onChange={(e) => setCfg((c) => ({ ...c, dedupeMin: e.target.value }))} />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: 12.5, pointerEvents: 'none' }}>min</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #999)', marginTop: 5 }}>Bateu de novo dentro desse tempo? Conta como a mesma batida (ignora a repetida). 0 desliga.</div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Modo de batidas</label>
            <select className="form-input" style={{ maxWidth: 220 }} value={cfg.usaIntervalo ? 'sim' : 'nao'} onChange={(e) => setCfg((c) => ({ ...c, usaIntervalo: e.target.value === 'sim' }))}>
              <option value="nao">Só Entrada e Saída</option>
              <option value="sim">Com intervalo (4 batidas)</option>
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #999)', marginTop: 5 }}>“Só Entrada e Saída” alterna entre as duas. Use “Com intervalo” só se a equipe registra a saída/retorno do intervalo.</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px' }}>
        <div className="page-header-sub" style={{ margin: 0 }}>Coletores</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={enviarTodos} disabled={!coletores.some((c) => c.ativo)} title="Enviar o cadastro (ID + nome) de todos os colaboradores ativos">Enviar todos ao coletor</button>
      </div>
      {coletores.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 16px' }}>
          Nenhum coletor detectado ainda. Aponte o aparelho DIXI para este servidor (porta <strong>7788</strong>, HTTPS não) — ele aparece aqui automaticamente como <strong>pendente</strong>, aí é só ativar.
        </div>
      ) : (
        <>
          {temPendente && (
            <div className="alert" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 10 }}>
              <div className="alert-msg">Há coletor <strong>pendente</strong> — as batidas só viram ponto depois que você <strong>ativar</strong>.</div>
            </div>
          )}
          <div className="table-card" style={{ marginBottom: 22 }}>
            <table className="hb-table">
              <thead><tr><th>Coletor</th><th>Serial</th><th>Status</th><th>Última sync</th><th></th></tr></thead>
              <tbody>
                {coletores.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.serial}</td>
                    <td><span style={{ color: c.ativo ? '#16a34a' : '#d97706', fontWeight: 700 }}>{c.ativo ? 'Ativo' : 'Pendente'}</span></td>
                    <td>{fmtDT(c.ultimaSync)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className={'btn btn-sm ' + (c.ativo ? 'btn-secondary' : 'btn-primary')} onClick={() => toggleColetor(c)}>
                        {c.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px' }}>
        <div className="page-header-sub" style={{ margin: 0 }}>Batidas a vincular ({porEnrollid.length})</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={carregar}>Atualizar</button>
      </div>
      {porEnrollid.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 16px' }}>Nada pendente. Batidas que casam pelo nome viram ponto sozinhas; só caem aqui as de IDs que ainda não conhecemos.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead><tr><th>ID no coletor</th><th>Nome (no aparelho)</th><th>Batidas</th><th>Última</th><th>Vincular ao colaborador</th></tr></thead>
            <tbody>
              {porEnrollid.map((p) => (
                <tr key={p.enrollid}>
                  <td><strong>{p.enrollid}</strong></td>
                  <td>{p.nome || '—'}</td>
                  <td>{p.count}</td>
                  <td>{fmtDT(p.ultima)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={sel[p.enrollid] || ''}
                        onChange={(e) => setSel((s) => ({ ...s, [p.enrollid]: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--app-border, #d4d4d4)', minWidth: 160 }}
                      >
                        <option value="">Selecione…</option>
                        {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                      <button type="button" className="btn btn-primary btn-sm" disabled={!sel[p.enrollid]} onClick={() => vincular(p.enrollid)}>Vincular</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalProgressoEnvio envio={envio} onClose={fechar} />
    </div>
  )
}

// ===================== PAINEL =====================
function Painel() {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    api.get('/ponto/painel')
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar o painel.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="loading-state">Carregando painel…</div>
  if (erro) return <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
  if (!dados) return null

  const cards = [
    { label: 'Presentes', valor: dados.presentes, meta: SITUACAO.presente },
    { label: 'Em intervalo', valor: dados.intervalo, meta: SITUACAO.intervalo },
    { label: 'Encerrados', valor: dados.encerrados, meta: SITUACAO.encerrado },
    { label: 'Ausentes', valor: dados.ausentes, meta: SITUACAO.ausente }
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {cards.map((c) => (
          <div key={c.label} className="table-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-soft, #737373)' }}>{c.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{c.valor}</span>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: c.meta.fg }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="page-header-sub" style={{ margin: 0 }}>Situação de hoje ({dados.total} colaboradores ativos)</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={carregar}>Atualizar</button>
      </div>

      {dados.colaboradores.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum colaborador ativo.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Situação</th>
                <th>Entrada</th>
                <th>Última marcação</th>
              </tr>
            </thead>
            <tbody>
              {dados.colaboradores.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                    {c.funcao ? <span style={{ color: 'var(--app-text-soft, #737373)' }}> · {c.funcao}</span> : null}
                  </td>
                  <td><Pill meta={SITUACAO[c.situacao]} /></td>
                  <td>{fmtHora(c.entrada)}</td>
                  <td>{fmtHora(c.ultimaMarcacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ===================== COLABORADORES =====================
const FORM_VAZIO = { nome: '', funcao: '', cpf: '', whatsapp: '', status: 'ATIVO', folgaSemana: [] }
// Resumo curto das folgas ([1,4] -> "Seg, Qui")
function resumoFolga(dias) {
  if (!Array.isArray(dias) || !dias.length) return null
  return [...dias].sort((a, b) => a - b).map((i) => DIAS_ABREV[i]).join(', ')
}
function Colaboradores({ notify }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')

  const [modal, setModal] = useState(null) // { id?, form }
  const [salvando, setSalvando] = useState(false)
  const [pinModal, setPinModal] = useState(null) // { id, nome, pin }
  const [salvandoPin, setSalvandoPin] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const { envio, enviar, fechar } = useEnvioColetor(notify)

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    api.get('/ponto/colaboradores')
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar os colaboradores.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const [jornadas, setJornadas] = useState([])
  useEffect(() => { api.get('/ponto/jornadas').then((r) => setJornadas(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }, [])

  async function atribuirJornada(f, value) {
    const jornadaId = value === '' ? null : Number(value)
    setLista((ls) => ls.map((x) => x.id === f.id ? { ...x, jornadaId, jornadaNome: jornadas.find((j) => j.id === jornadaId)?.nome || null } : x))
    try { await api.put(`/ponto/colaboradores/${f.id}/jornada`, { jornadaId }) }
    catch (e) { notify(e?.response?.data?.error ?? 'Não foi possível atribuir a jornada.', 'error'); carregar() }
  }

  // ID do funcionário no coletor DIXI (casa as batidas). Salva ao sair do campo.
  async function salvarEnrollid(f, valorRaw) {
    const value = String(valorRaw ?? '').trim()
    const enrollid = value === '' ? null : parseInt(value, 10)
    if (value !== '' && !Number.isInteger(enrollid)) { notify('ID do coletor inválido.', 'error'); carregar(); return }
    if (enrollid === (f.enrollidColetor ?? null)) return
    try {
      await api.put(`/ponto/colaboradores/${f.id}/enrollid`, { enrollid })
      setLista((ls) => ls.map((x) => x.id === f.id ? { ...x, enrollidColetor: enrollid } : x))
      notify('ID do coletor salvo.')
    } catch (e) { notify(e?.response?.data?.error ?? 'Não foi possível salvar o ID do coletor.', 'error'); carregar() }
  }

  // Envia o cadastro (ID + nome) do colaborador pro coletor. A face é cadastrada
  // depois no aparelho. Chega no coletor no próximo "sinal" dele (~20s) — a barra
  // de progresso acompanha até o aparelho confirmar.
  async function enviarColetor(f) {
    const ok = await enviar({ funcionarioIds: [f.id] })
    if (ok) carregar() // enrollid pode ter sido atribuído no envio
  }

  const filtrada = lista.filter((f) => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return [f.nome, f.funcao, f.cpf, f.whatsapp].some((v) => String(v ?? '').toLowerCase().includes(q))
  })

  const abrirNovo = () => setModal({ id: null, form: { ...FORM_VAZIO } })
  const abrirEditar = (f) => setModal({ id: f.id, form: { nome: f.nome ?? '', funcao: f.funcao ?? '', cpf: mascararCPF(f.cpf ?? ''), whatsapp: f.whatsapp ?? '', status: f.status ?? 'ATIVO', folgaSemana: Array.isArray(f.folgaSemana) ? f.folgaSemana : [] } })
  const upd = (campo, valor) => setModal((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))

  async function salvar() {
    const f = modal.form
    if (!f.nome.trim()) return notify('Informe o nome.', 'error')
    if (String(f.cpf).replace(/\D/g, '').length !== 11) return notify('Informe o CPF completo (11 dígitos).', 'error')
    if (String(f.whatsapp).replace(/\D/g, '').length < 10) return notify('Informe o WhatsApp com DDD.', 'error')
    setSalvando(true)
    try {
      if (modal.id) await api.put(`/funcionarios/${modal.id}`, f)
      else await api.post('/funcionarios', f)
      notify(modal.id ? 'Colaborador atualizado.' : 'Colaborador cadastrado.')
      setModal(null)
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarPin() {
    setSalvandoPin(true)
    try {
      await api.put(`/funcionarios/${pinModal.id}/pin`, { pin: pinModal.pin })
      notify(pinModal.pin ? 'PIN definido.' : 'PIN removido.')
      setPinModal(null)
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar o PIN.', 'error')
    } finally {
      setSalvandoPin(false)
    }
  }

  async function excluir() {
    const alvo = confirmExcluir
    if (!alvo) return
    setExcluindo(true)
    try {
      await api.delete(`/funcionarios/${alvo.id}`)
      setConfirmExcluir(null)
      notify('Colaborador excluído.')
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível excluir.', 'error')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Buscar por nome, função, CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320 }} />
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={abrirNovo}>Novo colaborador</button>
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando colaboradores…</div>
      ) : filtrada.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum colaborador encontrado.</div>
      ) : (
        <div className="table-card">
          <table className="ent-tabela">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Função</th>
                <th>CPF</th>
                <th>Jornada</th>
                <th>ID coletor</th>
                <th>PIN</th>
                <th>Última marcação</th>
                <th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((f) => (
                <tr key={f.id} className="ent-row-click" onClick={() => abrirEditar(f)}>
                  <td>
                    <div className="ent-row-id">
                      <span className="ent-av">{iniciais(f.nome)}</span>
                      <div className="ent-row-id-txt">
                        <span className="ent-row-nome">{f.nome}</span>
                        <span className="ent-row-whats">{f.whatsapp ? formatarWhats(f.whatsapp) : '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td>{f.funcao || '—'}</td>
                  <td>
                    {f.cpf ? mascararCPF(f.cpf) : <span style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>sem CPF</span>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="form-input" style={{ padding: '4px 8px', fontSize: 13, minWidth: 130 }} value={f.jornadaId || ''} onChange={(e) => atribuirJornada(f, e.target.value)}>
                      <option value="">Sem jornada</option>
                      {jornadas.map((j) => <option key={j.id} value={j.id}>{j.nome}</option>)}
                    </select>
                    {resumoFolga(f.folgaSemana) && <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #737373)', marginTop: 3 }}>Folga: {resumoFolga(f.folgaSemana)}</div>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      key={'enr-' + (f.enrollidColetor ?? 'x')}
                      type="number"
                      className="form-input"
                      style={{ padding: '4px 8px', fontSize: 13, width: 78 }}
                      defaultValue={f.enrollidColetor ?? ''}
                      placeholder="—"
                      title="ID do usuário no coletor DIXI (casa as batidas)"
                      onBlur={(e) => salvarEnrollid(f, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    />
                  </td>
                  <td>
                    {f.temPin
                      ? <span className="badge badge-green">Definido</span>
                      : <span style={{ color: 'var(--app-text-soft, #737373)' }}>—</span>}
                  </td>
                  <td>{fmtDataHora(f.ultimaMarcacao)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => enviarColetor(f)} title="Enviar cadastro (ID + nome) pro coletor">→ Coletor</button>{' '}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditar(f)}>Editar</button>{' '}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPinModal({ id: f.id, nome: f.nome, pin: '' })}>PIN</button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(f)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal novo/editar */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modal.id ? 'Editar colaborador' : 'Novo colaborador'}</div>
            <div className="form-group">
              <label className="form-label">Nome <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="form-input" value={modal.form.nome} onChange={(e) => upd('nome', e.target.value)} autoFocus />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Função</label>
                <input className="form-input" list="pf-funcoes" value={modal.form.funcao} onChange={(e) => upd('funcao', e.target.value)} placeholder="Ex.: Cozinha" />
                <datalist id="pf-funcoes">{FUNCOES_SUGERIDAS.map((f) => <option key={f} value={f} />)}</datalist>
              </div>
              <div className="form-group">
                <label className="form-label">CPF <span style={{ color: '#dc2626' }}>*</span></label>
                <input className="form-input" value={modal.form.cpf} onChange={(e) => upd('cpf', mascararCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp <span style={{ color: '#dc2626' }}>*</span></label>
                <input className="form-input" value={mascararTelefone(modal.form.whatsapp)} onChange={(e) => upd('whatsapp', mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={modal.form.status} onChange={(e) => upd('status', e.target.value)}>
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Folga semanal</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIAS_ABREV.map((lbl, i) => {
                  const on = (modal.form.folgaSemana || []).includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => upd('folgaSemana', on ? modal.form.folgaSemana.filter((d) => d !== i) : [...(modal.form.folgaSemana || []), i])}
                      style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (on ? '#2563eb' : 'var(--app-border, #d4d4d4)'), background: on ? '#2563eb' : 'transparent', color: on ? '#fff' : 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                    >
                      {lbl}
                    </button>
                  )
                })}
              </div>
              <div className="page-header-sub" style={{ marginTop: 6 }}>Dias em que folga toda semana. Sobrepõe a jornada — nesses dias não conta falta. Deixe vazio para seguir só a jornada.</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal PIN */}
      {pinModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-title">PIN de reserva — {pinModal.nome}</div>
            <div className="page-header-sub" style={{ marginTop: -6, marginBottom: 12 }}>
              Usado para bater o ponto quando o rosto não é reconhecido. 4 a 8 dígitos. Deixe em branco para remover.
            </div>
            <div className="form-group">
              <label className="form-label">PIN</label>
              <input className="form-input" value={pinModal.pin} onChange={(e) => setPinModal((m) => ({ ...m, pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))} placeholder="Ex.: 1234" inputMode="numeric" autoFocus />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPinModal(null)} disabled={salvandoPin}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarPin} disabled={salvandoPin}>{salvandoPin ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir colaborador"
        message={confirmExcluir ? `Excluir ${confirmExcluir.nome}?` : ''}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={excluir}
        onCancel={() => setConfirmExcluir(null)}
      />

      <ModalProgressoEnvio envio={envio} onClose={fechar} />
    </div>
  )
}

// ===================== MARCAÇÕES =====================
function Marcacoes({ notify }) {
  const [lista, setLista] = useState([])
  const [colabs, setColabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [periodo, setPeriodo] = useState('mes') // default: mês atual
  const [funcId, setFuncId] = useState('')

  const [modal, setModal] = useState(null) // { funcionarioId, tipo, dataHora }
  const [editar, setEditar] = useState(null)         // marcação em edição
  const [observar, setObservar] = useState(null)     // marcação p/ observação
  const [ocorrencia, setOcorrencia] = useState(null) // marcação p/ lançar ocorrência na Bonificação
  const [tiposBonif, setTiposBonif] = useState([])   // tipos de ocorrência (Bonificação, sem coletiva)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    const { de, ate } = rangePreset(periodo)
    api.get('/ponto/marcacoes', { params: { de: de || undefined, ate: ate || undefined, funcionarioId: funcId || undefined } })
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar as marcações.'))
      .finally(() => setLoading(false))
  }, [periodo, funcId])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { api.get('/ponto/colaboradores').then((r) => setColabs(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }, [])
  useEffect(() => { api.get('/bonificacao/config').then((r) => setTiposBonif((r.data?.tipos || []).filter((t) => t.pilar !== 'COLETIVA'))).catch(() => {}) }, [])

  const abrirManual = () => setModal({ funcionarioId: '', tipo: 'ENTRADA', dataHora: agoraLocal() })

  async function invalidar(r) {
    try {
      await api.put(`/ponto/marcacoes/${r.id}`, { invalidada: !r.invalidada })
      notify(r.invalidada ? 'Marcação reativada — volta a contar.' : 'Marcação desconsiderada — não conta mais.')
      carregar()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao atualizar.', 'error') }
  }

  async function salvarManual() {
    if (!modal.funcionarioId) return notify('Selecione o colaborador.', 'error')
    setSalvando(true)
    try {
      await api.post('/ponto/marcacoes', { funcionarioId: Number(modal.funcionarioId), tipo: modal.tipo, dataHora: modal.dataHora })
      notify('Marcação lançada.')
      setModal(null)
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível lançar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Período</label>
          <select className="form-input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ maxWidth: 180 }}>
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Colaborador</label>
          <select className="form-input" value={funcId} onChange={(e) => setFuncId(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Todos</option>
            {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={abrirManual}>Lançar manual</button>
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando marcações…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhuma marcação no período.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Marcação</th>
                <th>Data / Hora</th>
                <th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} style={r.invalidada ? { opacity: 0.55 } : undefined}>
                  <td><strong style={r.invalidada ? { textDecoration: 'line-through' } : undefined}>{r.funcionarioNome}</strong></td>
                  <td>
                    {r.tipoLabel}
                    {r.invalidada && <span className="badge badge-gray" style={{ marginLeft: 8 }}>Desconsiderada</span>}
                    {r.observacao && <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #999)', marginTop: 2 }}>Obs.: {r.observacao}</div>}
                  </td>
                  <td>{fmtDataHora(r.dataHora)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <MenuAcoes>
                      <ItemMenu onClick={() => invalidar(r)}>{r.invalidada ? 'Reativar' : 'Desconsiderar'}</ItemMenu>
                      <ItemMenu onClick={() => setEditar(r)}>Editar</ItemMenu>
                      <ItemMenu onClick={() => setOcorrencia(r)}>Ocorrência</ItemMenu>
                      <ItemMenu onClick={() => setObservar(r)}>Observação</ItemMenu>
                    </MenuAcoes>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal lançamento manual */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title">Lançar marcação manual</div>
            <div className="form-group">
              <label className="form-label">Colaborador</label>
              <select className="form-input" value={modal.funcionarioId} onChange={(e) => setModal((m) => ({ ...m, funcionarioId: e.target.value }))} autoFocus>
                <option value="">Selecione…</option>
                {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={modal.tipo} onChange={(e) => setModal((m) => ({ ...m, tipo: e.target.value }))}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data e hora</label>
                <input type="datetime-local" className="form-input" value={modal.dataHora} onChange={(e) => setModal((m) => ({ ...m, dataHora: e.target.value }))} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarManual} disabled={salvando}>{salvando ? 'Lançando…' : 'Lançar'}</button>
            </div>
          </div>
        </div>
      )}

      {editar && <EditarMarcacaoModal reg={editar} onClose={() => setEditar(null)} onSalvou={() => { setEditar(null); carregar() }} notify={notify} />}
      {observar && <ObsMarcacaoModal reg={observar} onClose={() => setObservar(null)} onSalvou={() => { setObservar(null); carregar() }} notify={notify} />}
      {ocorrencia && <OcorrenciaMarcacaoModal reg={ocorrencia} tipos={tiposBonif} onClose={() => setOcorrencia(null)} onSalvou={() => setOcorrencia(null)} notify={notify} />}
    </div>
  )
}

// ---- menu de ações (kebab) + itens --------------------------------------
function MenuAcoes({ children }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberto((a) => !a)} aria-label="Ações" style={{ padding: '4px 11px', fontSize: 17, lineHeight: 1 }}>⋮</button>
      {aberto && (
        <div onClick={() => setAberto(false)} style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid var(--app-border, #e5e5e5)', borderRadius: 10, boxShadow: '0 12px 32px -12px rgba(0,0,0,0.3)', zIndex: 30, minWidth: 172, padding: 4 }}>
          {children}
        </div>
      )}
    </div>
  )
}
function ItemMenu({ onClick, danger, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13.5, background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', color: danger ? '#dc2626' : '#111' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
      {children}
    </button>
  )
}

// datetime-local a partir de um ISO (fuso local, p/ o input de edição)
function isoParaLocal(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return agoraLocal()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Editar a marcação (tipo + data/hora)
function EditarMarcacaoModal({ reg, onClose, onSalvou, notify }) {
  const [tipo, setTipo] = useState(reg.tipo)
  const [dataHora, setDataHora] = useState(() => isoParaLocal(reg.dataHora))
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    try {
      await api.put(`/ponto/marcacoes/${reg.id}`, { tipo, dataHora })
      notify('Marcação atualizada.')
      onSalvou()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
    finally { setSalvando(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-title">Editar marcação — {reg.funcionarioNome}</div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data e hora</label>
            <input type="datetime-local" className="form-input" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// Observação livre na marcação
function ObsMarcacaoModal({ reg, onClose, onSalvou, notify }) {
  const [obs, setObs] = useState(reg.observacao || '')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    try {
      await api.put(`/ponto/marcacoes/${reg.id}`, { observacao: obs })
      notify('Observação salva.')
      onSalvou()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao salvar.', 'error') }
    finally { setSalvando(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-title">Observação — {reg.funcionarioNome}</div>
        <div className="form-group">
          <label className="form-label">Nota da batida ({fmtDataHora(reg.dataHora)})</label>
          <textarea className="form-input" rows={3} value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: bateu adiantado, liberado pela gerência" autoFocus style={{ resize: 'vertical' }} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// Lança uma ocorrência da Bonificação p/ o colaborador da marcação
function OcorrenciaMarcacaoModal({ reg, tipos, onClose, onSalvou, notify }) {
  const [tipoId, setTipoId] = useState(tipos[0]?.id ? String(tipos[0].id) : '')
  const [data, setData] = useState(() => new Date(reg.dataHora).toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function lancar() {
    if (!tipoId) return notify('Escolha o tipo de ocorrência.', 'error')
    const d = new Date(data + 'T12:00:00')
    setSalvando(true)
    try {
      await api.post('/bonificacao/ocorrencias', { funcionarioId: reg.funcionarioId, ano: d.getFullYear(), mes: d.getMonth() + 1, tipoId: Number(tipoId), data, observacao: obs })
      notify('Ocorrência lançada na Bonificação.')
      onSalvou()
    } catch (e) { notify(e?.response?.data?.error ?? 'Erro ao lançar.', 'error') }
    finally { setSalvando(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-title">Ocorrência — {reg.funcionarioNome}</div>
        <div className="page-header-sub" style={{ marginTop: -4, marginBottom: 12 }}>Desconta no prêmio da Bonificação do colaborador.</div>
        {tipos.length === 0 ? (
          <div className="empty-state" style={{ padding: '18px 16px' }}>Nenhum tipo de ocorrência cadastrado. Configure na Bonificação › Configuração.</div>
        ) : (
          <>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.pilar === 'ASSIDUIDADE' ? 'Assiduidade' : 'Desempenho'} · {t.nome} (−{t.percentual}%)</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data</label>
                <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Observação (opcional)</label>
              <input className="form-input" value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: chegou 40 min atrasado" />
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={lancar} disabled={salvando || !tipos.length || !tipoId}>{salvando ? 'Lançando…' : 'Lançar'}</button>
        </div>
      </div>
    </div>
  )
}

// ===================== JORNADAS E ESCALAS =====================
const DIAS_NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// Default = turno noturno da hamburgueria (seg–sex 17h–00h30, sáb 18h–01h, dom folga).
const DIAS_DEFAULT = [
  { folga: true },
  { entrada: '17:00', saida: '00:30' },
  { entrada: '17:00', saida: '00:30' },
  { entrada: '17:00', saida: '00:30' },
  { entrada: '17:00', saida: '00:30' },
  { entrada: '17:00', saida: '00:30' },
  { entrada: '18:00', saida: '01:00' }
]
function cruzaMeiaNoite(d) {
  if (!d || d.folga || !d.entrada || !d.saida) return false
  return d.saida <= d.entrada
}
function resumoJornada(dias) {
  if (!Array.isArray(dias)) return '—'
  const trab = dias.map((d, i) => ({ ...d, i })).filter((d) => !d.folga && d.entrada)
  const folga = dias.map((d, i) => ({ ...d, i })).filter((d) => d.folga).map((d) => DIAS_ABREV[d.i])
  if (!trab.length) return 'Sem dias de trabalho'
  const horarios = [...new Set(trab.map((d) => `${d.entrada}–${d.saida}`))]
  const base = horarios.length === 1
    ? `${trab.map((d) => DIAS_ABREV[d.i]).join(', ')} · ${horarios[0]}`
    : 'Horários variados'
  return folga.length ? `${base}  ·  Folga: ${folga.join(', ')}` : base
}

function Jornadas({ notify }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [modal, setModal] = useState(null) // { id?, nome, toleranciaMin, dias }
  const [salvando, setSalvando] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true); setErro(null)
    api.get('/ponto/jornadas')
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar as jornadas.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const abrirNova = () => setModal({ id: null, nome: '', toleranciaMin: 10, dias: DIAS_DEFAULT.map((d) => ({ ...d })) })
  const abrirEditar = (j) => setModal({ id: j.id, nome: j.nome, toleranciaMin: j.toleranciaMin, dias: (Array.isArray(j.dias) ? j.dias : []).map((d) => ({ folga: !!d.folga, entrada: d.entrada || '', saida: d.saida || '' })) })

  const setDia = (i, patch) => setModal((m) => ({ ...m, dias: m.dias.map((d, idx) => idx === i ? { ...d, ...patch } : d) }))
  const toggleFolga = (i, folga) => setDia(i, folga ? { folga: true } : { folga: false, entrada: '17:00', saida: '00:30' })

  async function salvar() {
    if (!modal.nome.trim()) return notify('Informe o nome da jornada.', 'error')
    const dias = modal.dias.map((d) => d.folga ? { folga: true } : { entrada: d.entrada, saida: d.saida })
    setSalvando(true)
    try {
      if (modal.id) await api.put(`/ponto/jornadas/${modal.id}`, { nome: modal.nome, toleranciaMin: modal.toleranciaMin, dias })
      else await api.post('/ponto/jornadas', { nome: modal.nome, toleranciaMin: modal.toleranciaMin, dias })
      notify(modal.id ? 'Jornada atualizada.' : 'Jornada criada.')
      setModal(null); carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error')
    } finally { setSalvando(false) }
  }

  async function excluir() {
    const alvo = confirmExcluir; if (!alvo) return
    setExcluindo(true)
    try {
      await api.delete(`/ponto/jornadas/${alvo.id}`)
      setConfirmExcluir(null); notify('Jornada excluída.'); carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível excluir.', 'error')
    } finally { setExcluindo(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div className="page-header-sub" style={{ margin: 0 }}>Modelos de horário previsto. Atribua uma jornada a cada colaborador na aba Colaboradores.</div>
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={abrirNova}>Nova jornada</button>
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando jornadas…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhuma jornada cadastrada. Crie a primeira.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr><th>Jornada</th><th>Horário</th><th>Tolerância</th><th>Colaboradores</th><th aria-hidden="true"></th></tr>
            </thead>
            <tbody>
              {lista.map((j) => (
                <tr key={j.id} className="ent-row-click" onClick={() => abrirEditar(j)}>
                  <td><strong>{j.nome}</strong>{!j.ativo && <span className="badge badge-gray" style={{ marginLeft: 8 }}>Inativa</span>}</td>
                  <td style={{ color: 'var(--app-text-soft, #737373)' }}>{resumoJornada(j.dias)}</td>
                  <td>{j.toleranciaMin} min</td>
                  <td>{j.colaboradores}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditar(j)}>Editar</button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(j)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-title">{modal.id ? 'Editar jornada' : 'Nova jornada'}</div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-input" value={modal.nome} onChange={(e) => setModal((m) => ({ ...m, nome: e.target.value }))} placeholder="Ex.: Turno noite" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Tolerância de atraso (min)</label>
                <input type="number" min="0" max="60" className="form-input" value={modal.toleranciaMin} onChange={(e) => setModal((m) => ({ ...m, toleranciaMin: e.target.value }))} />
              </div>
            </div>

            <div className="form-label" style={{ marginTop: 4, marginBottom: 6 }}>Horário por dia da semana</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modal.dias.map((d, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '84px 78px 1fr 1fr 58px', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{DIAS_NOMES[i]}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--app-text-soft, #737373)' }}>
                    <input type="checkbox" checked={!!d.folga} onChange={(e) => toggleFolga(i, e.target.checked)} /> Folga
                  </label>
                  {d.folga ? (
                    <span style={{ gridColumn: '3 / 6', fontSize: 12.5, color: 'var(--app-text-soft, #737373)' }}>—</span>
                  ) : (
                    <>
                      <input type="time" className="form-input" value={d.entrada} onChange={(e) => setDia(i, { entrada: e.target.value })} />
                      <input type="time" className="form-input" value={d.saida} onChange={(e) => setDia(i, { saida: e.target.value })} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: cruzaMeiaNoite(d) ? '#2563eb' : 'transparent' }}>+1 dia</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="page-header-sub" style={{ marginTop: 8 }}>Se a saída for menor ou igual à entrada, o turno vira o dia (sai na madrugada seguinte) — marcado com “+1 dia”.</div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir jornada"
        message={confirmExcluir ? `Excluir a jornada "${confirmExcluir.nome}"?` : ''}
        description={confirmExcluir?.colaboradores ? `${confirmExcluir.colaboradores} colaborador(es) ficarão sem jornada.` : 'Esta ação não pode ser desfeita.'}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={excluir}
        onCancel={() => setConfirmExcluir(null)}
      />
    </div>
  )
}

// ===================== ESPELHO =====================
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
// minutos -> "Xh00" (mostra '—' quando zero); minHm0 sempre mostra
function minHm(min) {
  if (!min) return '—'
  const neg = min < 0; const a = Math.abs(Math.round(min))
  return `${neg ? '-' : ''}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`
}
function minHm0(min) {
  const neg = min < 0; const a = Math.abs(Math.round(min || 0))
  return `${neg ? '-' : ''}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`
}
const SIT_ESP = {
  ok: { label: 'OK', bg: '#dcfce7', fg: '#166534' },
  atraso: { label: 'Atraso', bg: '#fef3c7', fg: '#92400e' },
  falta: { label: 'Falta', bg: '#fee2e2', fg: '#991b1b' },
  incompleto: { label: 'Incompleto', bg: '#fee2e2', fg: '#991b1b' },
  folga: { label: 'Folga', bg: '#f4f4f5', fg: '#71717a' },
  folga_trabalhada: { label: 'Trab. na folga', bg: '#dbeafe', fg: '#1e40af' },
  trabalhado: { label: 'Trabalhado', bg: '#dbeafe', fg: '#1e40af' }
}

function Espelho() {
  const [colabs, setColabs] = useState([])
  const [funcId, setFuncId] = useState('')
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    api.get('/ponto/colaboradores').then((r) => {
      const l = Array.isArray(r.data) ? r.data : []
      setColabs(l)
      setFuncId((cur) => cur || (l.length ? String(l[0].id) : ''))
    }).catch(() => {})
  }, [])

  const carregar = useCallback(() => {
    if (!funcId) { setDados(null); return }
    setLoading(true); setErro(null)
    api.get('/ponto/espelho', { params: { funcionarioId: funcId, ano, mes } })
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível gerar o espelho.'))
      .finally(() => setLoading(false))
  }, [funcId, ano, mes])
  useEffect(() => { carregar() }, [carregar])

  function mudarMes(delta) {
    let m = mes + delta, a = ano
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const t = dados?.totais

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Colaborador</label>
          <select className="form-input" value={funcId} onChange={(e) => setFuncId(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Selecione…</option>
            {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => mudarMes(-1)}>‹</button>
          <span style={{ fontWeight: 700, minWidth: 150, textAlign: 'center' }}>{MESES[mes - 1]} {ano}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => mudarMes(1)}>›</button>
        </div>
      </div>

      {!funcId ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Selecione um colaborador para ver o espelho.</div>
      ) : erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Gerando espelho…</div>
      ) : !dados ? null : (
        <>
          {!dados.funcionario.temJornada && (
            <div className="alert" style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#92400e' }}>
              Este colaborador não tem <strong>jornada atribuída</strong> — sem horário previsto, o espelho mostra só as batidas (sem atraso/falta). Atribua uma jornada na aba Colaboradores.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Previsto', val: minHm0(t.previstoMin) },
              { label: 'Trabalhado', val: minHm0(t.trabalhadoMin) },
              { label: 'Saldo', val: minHm0(t.saldoMin), cor: t.saldoMin < 0 ? '#b91c1c' : (t.saldoMin > 0 ? '#166534' : undefined) },
              { label: 'Atrasos', val: `${t.atrasos} · ${minHm(t.atrasoMin)}` },
              { label: 'Faltas', val: String(t.faltas) },
              { label: 'Hora extra', val: minHm(t.extraMin) },
              { label: 'Ad. noturno', val: minHm(t.noturnoMin) }
            ].map((c) => (
              <div key={c.label} className="table-card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12.5, color: 'var(--app-text-soft, #737373)' }}>{c.label}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: c.cor }}>{c.val}</span>
              </div>
            ))}
          </div>

          <div className="table-card">
            <table className="hb-table">
              <thead>
                <tr>
                  <th>Dia</th><th>Previsto</th><th>Entrada</th><th>Saída</th>
                  <th>Trabalhado</th><th>Atraso</th><th>Extra</th><th>Noturno</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.dias.map((d) => {
                  const sit = SIT_ESP[d.situacao] || null
                  const dim = d.folga || d.futuro || d.situacao === 'vazio'
                  return (
                    <tr key={d.dia} style={dim ? { opacity: 0.5 } : undefined}>
                      <td style={{ whiteSpace: 'nowrap' }}><strong>{String(d.dia).padStart(2, '0')}</strong> <span style={{ color: 'var(--app-text-soft, #737373)', fontSize: 12 }}>{DIAS_ABREV[d.dow]}</span></td>
                      <td>{d.folga ? '—' : (d.previstoMin ? minHm0(d.previstoMin) : '—')}</td>
                      <td>{d.entradaHm || '—'}</td>
                      <td>{d.saidaHm || '—'}</td>
                      <td>{d.trabalhadoMin ? minHm0(d.trabalhadoMin) : '—'}</td>
                      <td style={{ color: d.atrasoMin ? '#92400e' : undefined }}>{minHm(d.atrasoMin)}</td>
                      <td style={{ color: d.extraMin ? '#166534' : undefined }}>{minHm(d.extraMin)}</td>
                      <td>{minHm(d.noturnoMin)}</td>
                      <td><Pill meta={sit} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ===================== FECHAMENTO =====================
function Fechamento({ notify }) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [confirmar, setConfirmar] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true); setErro(null)
    api.get('/ponto/fechamento', { params: { ano, mes } })
      .then((r) => setDados(r.data))
      .catch((e) => setErro(e?.response?.data?.error ?? 'Não foi possível carregar o fechamento.'))
      .finally(() => setLoading(false))
  }, [ano, mes])
  useEffect(() => { carregar() }, [carregar])

  function mudarMes(delta) {
    let m = mes + delta, a = ano
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  async function sincronizar() {
    setSincronizando(true)
    try {
      const { data } = await api.post('/ponto/fechamento/sincronizar', { ano, mes })
      notify(`Lançado na Bonificação: ${data.faltas} falta(s) e ${data.atrasos} atraso(s) em ${data.colaboradores} colaborador(es).`)
      setConfirmar(false); carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível lançar.', 'error')
    } finally { setSincronizando(false) }
  }

  const semTipos = dados && !dados.temTipoFalta && !dados.temTipoAtraso
  const podeLancar = dados && !dados.bonificacaoFechada && !semTipos && dados.colaboradores.length > 0
  const corPresenca = (p) => (p >= 90 ? '#166534' : p >= 70 ? '#92400e' : '#b91c1c')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="page-header-sub" style={{ margin: 0 }}>Consolida o mês e lança faltas/atrasos no pilar Presença da Bonificação.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => mudarMes(-1)}>‹</button>
          <span style={{ fontWeight: 700, minWidth: 150, textAlign: 'center' }}>{MESES[mes - 1]} {ano}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => mudarMes(1)}>›</button>
        </div>
      </div>

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando fechamento…</div>
      ) : !dados ? null : (
        <>
          {semTipos && (
            <div className="alert" style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
              Não encontrei os tipos <strong>Falta</strong>/<strong>Atraso</strong> no pilar Assiduidade da Bonificação. Crie-os na aba Bonificação para lançar o ponto.
            </div>
          )}
          {dados.bonificacaoFechada && (
            <div className="alert" style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#92400e' }}>
              A Bonificação deste mês está <strong>fechada</strong>. Reabra-a na aba Bonificação para lançar/atualizar o ponto.
            </div>
          )}
          {dados.jaLancadas > 0 && !dados.bonificacaoFechada && (
            <div className="alert" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#1e40af' }}>
              O ponto já lançou <strong>{dados.jaLancadas}</strong> ocorrência(s) neste mês. Lançar de novo substitui essas (as manuais são preservadas).
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="page-header-sub" style={{ margin: 0 }}>
              {dados.colaboradores.length} colaborador(es) com jornada · Falta −{dados.pctFalta}% · Atraso −{dados.pctAtraso}%
            </div>
            <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!podeLancar} onClick={() => setConfirmar(true)}>Lançar na Bonificação</button>
          </div>

          {dados.colaboradores.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum colaborador ativo com jornada atribuída. Atribua jornadas na aba Colaboradores.</div>
          ) : (
            <div className="table-card">
              <table className="hb-table">
                <thead>
                  <tr><th>Colaborador</th><th>Faltas</th><th>Atrasos</th><th>Pendências</th><th>Trabalhado</th><th>Saldo</th><th>Noturno</th><th>Presença</th></tr>
                </thead>
                <tbody>
                  {dados.colaboradores.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.nome}</strong>{c.funcao ? <span style={{ color: 'var(--app-text-soft,#737373)' }}> · {c.funcao}</span> : null}</td>
                      <td style={{ color: c.faltas ? '#b91c1c' : undefined }}>{c.faltas}</td>
                      <td style={{ color: c.atrasos ? '#92400e' : undefined }}>{c.atrasos}</td>
                      <td>{c.incompletos ? <span style={{ color: '#92400e' }}>{c.incompletos}</span> : '—'}</td>
                      <td>{minHm0(c.trabalhadoMin)}</td>
                      <td style={{ color: c.saldoMin < 0 ? '#b91c1c' : c.saldoMin > 0 ? '#166534' : undefined }}>{minHm0(c.saldoMin)}</td>
                      <td>{minHm(c.noturnoMin)}</td>
                      <td><strong style={{ color: corPresenca(c.presenca) }}>{c.presenca}%</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmar}
        title="Lançar na Bonificação"
        message={`Lançar as faltas e atrasos de ${MESES[mes - 1]} ${ano} no pilar Presença?`}
        description="As ocorrências lançadas antes pelo ponto neste mês serão substituídas. As manuais são preservadas."
        confirmLabel="Lançar"
        cancelLabel="Cancelar"
        loading={sincronizando}
        onConfirm={sincronizar}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  )
}
