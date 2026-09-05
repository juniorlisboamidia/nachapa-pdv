// Entregadores (admin) — base de motoboys com métricas, histórico de participações
// e ocorrências. Consome /api/motoboys (Etapa 2). Suporta ?motoboyId para abrir
// um entregador já selecionado (vindo da tela de Escala).
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import InputMoeda from '../components/InputMoeda'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatarWhats, mascararTelefone } from '../utils/telefone'

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function brl(v) {
  const n = Number(v)
  return Number.isFinite(n) ? brlFmt.format(n) : 'R$ 0,00'
}
function dataCurta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}
function pct(v) {
  return v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR')}%`
}
function iniciais(nome) {
  const ps = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '?'
  return (ps[0][0] + (ps.length > 1 ? ps[ps.length - 1][0] : '')).toUpperCase()
}

const STATUS_MB = {
  ATIVO: { label: 'Ativo', cls: 'badge-green' },
  INATIVO: { label: 'Inativo', cls: 'badge-gray' },
  BLOQUEADO: { label: 'Bloqueado', cls: 'badge-red' },
  PENDENTE: { label: 'Pendente', cls: 'badge-yellow' }
}
// Status exibido: "Atenção" (amarelo) quando o motoboy ativo tem sinais de risco
function statusInfo(m) {
  if (m?.status === 'ATIVO' && m?.atencao) return { label: 'Atenção', cls: 'badge-yellow' }
  return STATUS_MB[m?.status] ?? { label: m?.status ?? '—', cls: 'badge-gray' }
}
// Cor da taxa de comparecimento (verde alto, âmbar médio, vermelho baixo)
function corTaxa(v) {
  if (v === null || v === undefined) return '#bbb'
  if (v >= 80) return '#16a34a'
  if (v >= 50) return '#d97706'
  return '#dc2626'
}
const INSC_STATUS = { INSCRITO: 'Inscrito', CONFIRMADO: 'Confirmado', CANCELADO: 'Cancelado' }
const PRESENCA = { PENDENTE: 'Pendente', COMPARECEU: 'Compareceu', FALTOU: 'Faltou', JUSTIFICOU: 'Justificou' }
const MES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const OC_TIPOS = [
  { v: 'NAO_COMPARECEU', label: 'Não compareceu' },
  { v: 'ABANDONO', label: 'Abandono (saiu durante o turno)' },
  { v: 'MOTO_QUEBROU', label: 'Moto quebrou' },
  { v: 'ATRASO', label: 'Atraso' },
  { v: 'PREJUIZO', label: 'Prejuízo' },
  { v: 'CONDUTA', label: 'Conduta' },
  { v: 'ATENDIMENTO', label: 'Atendimento' },
  { v: 'OBSERVACAO_POSITIVA', label: 'Observação positiva' },
  { v: 'OUTRO', label: 'Outro' }
]
const OC_TIPO_LABEL = Object.fromEntries(OC_TIPOS.map((t) => [t.v, t.label]))
const GRAVIDADE = {
  BAIXA: { label: 'Baixa', cls: 'badge-gray' },
  MEDIA: { label: 'Média', cls: 'badge-blue' },
  ALTA: { label: 'Alta', cls: 'badge-orange' },
  CRITICA: { label: 'Crítica', cls: 'badge-red' }
}
const FORM_OC_VAZIO = { tipo: 'NAO_COMPARECEU', gravidade: 'MEDIA', dataOcorrencia: '', descricao: '', valorPrejuizo: '', resolvida: false }

export default function Entregadores() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')

  const [detalhe, setDetalhe] = useState(null) // { ...motoboy, historico, ocorrencias }
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [histAberto, setHistAberto] = useState(false) // histórico de participações recolhível (fechado por padrão)
  const [editAberto, setEditAberto] = useState(false) // edição de "Dados do entregador" recolhível (fechada por padrão)
  const [histMes, setHistMes] = useState(null) // mês selecionado no histórico de participações
  const [pendentes, setPendentes] = useState([]) // solicitações de cadastro (link público) aguardando aprovação

  const [modalEntregador, setModalEntregador] = useState(null) // { modo:'novo'|'editar', form }
  const [salvando, setSalvando] = useState(false)
  const [modalOcorrencia, setModalOcorrencia] = useState(null) // { id?, form }
  const [confirmOc, setConfirmOc] = useState(null)
  const [confirmExcluir, setConfirmExcluir] = useState(null) // entregador a excluir
  const [confirmBloq, setConfirmBloq] = useState(null)       // entregador a bloquear
  const [bloqueando, setBloqueando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [edit, setEdit] = useState(null) // form inline de edição no modal de detalhe
  const [salvandoDados, setSalvandoDados] = useState(false)

  function carregarLista() {
    setLoading(true)
    setErro(null)
    api
      .get('/motoboys', { params: { busca: busca || undefined, status: statusFiltro || undefined } })
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((err) =>
        setErro(
          err?.response?.data?.error ??
            (err?.code === 'ERR_NETWORK'
              ? 'Não foi possível conectar ao backend (http://localhost:4000).'
              : err?.message ?? 'Erro ao carregar entregadores.')
        )
      )
      .finally(() => setLoading(false))
  }

  // recarrega ao mudar busca/status (debounce simples)
  useEffect(() => {
    const t = setTimeout(carregarLista, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, statusFiltro])

  function abrirDetalhe(id) {
    setLoadingDetalhe(true)
    setDetalhe((d) => (d && d.id === id ? d : null))
    Promise.all([
      api.get(`/motoboys/${id}`),
      api.get(`/motoboys/${id}/historico`),
      api.get(`/motoboys/${id}/ocorrencias`)
    ])
      .then(([mb, hist, oco]) => {
        setDetalhe({ ...mb.data, historico: hist.data ?? [], ocorrencias: oco.data ?? [] })
      })
      .catch((err) => setToast({ message: err?.response?.data?.error ?? 'Erro ao carregar o entregador.', type: 'error' }))
      .finally(() => setLoadingDetalhe(false))
  }

  // Contador de solicitações pendentes (independe do filtro visível na tabela).
  function carregarPendentes() {
    api.get('/motoboys', { params: { status: 'PENDENTE' } })
      .then((r) => setPendentes(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
  }

  function recarregarDetalhe() {
    if (detalhe?.id) abrirDetalhe(detalhe.id)
    carregarLista()
    carregarPendentes()
  }

  // Aprova a solicitação de cadastro (PENDENTE → ATIVO). Recusar = excluir (reusa o confirm).
  async function aprovarPendente() {
    if (!detalhe) return
    try {
      await api.put(`/motoboys/${detalhe.id}`, { nome: detalhe.nome, whatsapp: detalhe.whatsapp, status: 'ATIVO', observacoes: detalhe.observacoes ?? '' })
      setToast({ message: 'Cadastro aprovado. Entregador ativo.', type: 'success' })
      recarregarDetalhe()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível aprovar.', type: 'error' })
    }
  }

  // Bloqueia direto (o backend impede um bloqueado de se inscrever na escala).
  async function bloquearEntregador() {
    const alvo = confirmBloq
    if (!alvo) return
    setBloqueando(true)
    try {
      await api.put(`/motoboys/${alvo.id}`, { status: 'BLOQUEADO' })
      setToast({ message: 'Entregador bloqueado. Ele não poderá se inscrever nas escalas.', type: 'success' })
      setConfirmBloq(null)
      setEdit((e) => (e ? { ...e, status: 'BLOQUEADO' } : e))
      recarregarDetalhe()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível bloquear.', type: 'error' })
    } finally {
      setBloqueando(false)
    }
  }
  async function desbloquearEntregador() {
    if (!detalhe) return
    try {
      await api.put(`/motoboys/${detalhe.id}`, { status: 'ATIVO' })
      setToast({ message: 'Entregador desbloqueado.', type: 'success' })
      setEdit((e) => (e ? { ...e, status: 'ATIVO' } : e))
      recarregarDetalhe()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível desbloquear.', type: 'error' })
    }
  }

  // abre automaticamente o motoboy de ?motoboyId (vindo da Escala)
  useEffect(() => {
    const mid = Number(searchParams.get('motoboyId'))
    if (Number.isInteger(mid) && mid > 0) abrirDetalhe(mid)
    carregarPendentes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza o form de edição ao abrir OUTRO entregador (não reseta em
  // recargas do mesmo, p/ não perder edição ao registrar ocorrência etc.)
  useEffect(() => {
    if (detalhe) setEdit({ nome: detalhe.nome ?? '', whatsapp: detalhe.whatsapp ?? '', status: detalhe.status ?? 'ATIVO', observacoes: detalhe.observacoes ?? '', possuiCnh: detalhe.possuiCnh ?? null })
    else setEdit(null)
    setHistAberto(false) // sempre recolhido ao abrir outro entregador
    setEditAberto(false)
    setHistMes(null) // volta ao mês mais recente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalhe?.id])

  // ===== Entregador: novo (lista) / edição inline (detalhe) =====
  function abrirNovo() {
    setModalEntregador({ modo: 'novo', form: { nome: '', whatsapp: '', status: 'ATIVO', observacoes: '' } })
  }
  const updEdit = (campo, valor) => setEdit((e) => ({ ...e, [campo]: valor }))
  async function salvarDados() {
    if (!detalhe || !edit) return
    if (!edit.nome.trim()) return setToast({ message: 'Informe o nome.', type: 'error' })
    if (!edit.whatsapp.replace(/\D/g, '')) return setToast({ message: 'Informe um WhatsApp válido.', type: 'error' })
    setSalvandoDados(true)
    try {
      await api.put(`/motoboys/${detalhe.id}`, edit)
      setToast({ message: 'Dados atualizados.', type: 'success' })
      recarregarDetalhe()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar.', type: 'error' })
    } finally {
      setSalvandoDados(false)
    }
  }
  async function salvarEntregador() {
    const f = modalEntregador.form
    if (!f.nome.trim()) return setToast({ message: 'Informe o nome.', type: 'error' })
    if (!f.whatsapp.replace(/\D/g, '')) return setToast({ message: 'Informe um WhatsApp válido.', type: 'error' })
    setSalvando(true)
    try {
      if (modalEntregador.modo === 'novo') {
        const r = await api.post('/motoboys', f)
        setToast({ message: 'Entregador criado.', type: 'success' })
        setModalEntregador(null)
        carregarLista()
        abrirDetalhe(r.data.id)
      } else {
        await api.put(`/motoboys/${detalhe.id}`, f)
        setToast({ message: 'Entregador atualizado.', type: 'success' })
        setModalEntregador(null)
        recarregarDetalhe()
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }
  async function excluirEntregador() {
    const alvo = confirmExcluir
    if (!alvo) return
    setExcluindo(true)
    try {
      await api.delete(`/motoboys/${alvo.id}`)
      setConfirmExcluir(null)
      setDetalhe(null)
      setSearchParams({})
      setToast({ message: 'Entregador excluído.', type: 'success' })
      carregarLista()
      carregarPendentes()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível excluir o entregador.', type: 'error' })
    } finally {
      setExcluindo(false)
    }
  }

  // ===== Ocorrências =====
  // motoboyId nulo = aberta pela tela (botão central) → o modal mostra o seletor de entregador.
  function abrirNovaOcorrencia(motoboyId = null) {
    setModalOcorrencia({ id: null, motoboyId, central: motoboyId == null, form: { ...FORM_OC_VAZIO } })
  }
  function abrirEditarOcorrencia(oc) {
    setModalOcorrencia({
      id: oc.id,
      form: {
        tipo: oc.tipo,
        gravidade: oc.gravidade,
        dataOcorrencia: oc.dataOcorrencia ? new Date(oc.dataOcorrencia).toISOString().slice(0, 10) : '',
        descricao: oc.descricao ?? '',
        valorPrejuizo: oc.valorPrejuizo ?? '',
        resolvida: !!oc.resolvida
      }
    })
  }
  async function salvarOcorrencia() {
    const f = modalOcorrencia.form
    if (!f.dataOcorrencia) return setToast({ message: 'Informe a data da ocorrência.', type: 'error' })
    if (!f.descricao.trim()) return setToast({ message: 'Descreva a ocorrência.', type: 'error' })
    // Ao criar: usa o entregador escolhido no seletor (central) ou o do detalhe aberto.
    const mbId = modalOcorrencia.id ? null : (modalOcorrencia.motoboyId ?? detalhe?.id)
    if (!modalOcorrencia.id && !mbId) return setToast({ message: 'Selecione o entregador.', type: 'error' })
    const payload = {
      tipo: f.tipo,
      gravidade: f.gravidade,
      dataOcorrencia: f.dataOcorrencia,
      descricao: f.descricao,
      valorPrejuizo: f.valorPrejuizo === '' ? null : Number(f.valorPrejuizo),
      resolvida: f.resolvida
    }
    setSalvando(true)
    try {
      if (modalOcorrencia.id) {
        await api.put(`/motoboys/ocorrencias/${modalOcorrencia.id}`, payload)
        setToast({ message: 'Ocorrência atualizada.', type: 'success' })
      } else {
        await api.post(`/motoboys/${mbId}/ocorrencias`, payload)
        setToast({ message: 'Ocorrência registrada.', type: 'success' })
      }
      setModalOcorrencia(null)
      recarregarDetalhe()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar a ocorrência.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }
  async function excluirOcorrencia() {
    const alvo = confirmOc
    if (!alvo) return
    try {
      await api.delete(`/motoboys/ocorrencias/${alvo.id}`)
      setConfirmOc(null)
      setToast({ message: 'Ocorrência excluída.', type: 'success' })
      recarregarDetalhe()
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível excluir.', type: 'error' })
    }
  }

  const upd = (campo, valor) => setModalEntregador((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))
  const updOc = (campo, valor) => setModalOcorrencia((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))

  // Resumo (KPIs do topo). Reflete o conjunto listado; "Pendentes" usa o contador real.
  const resumoEnt = useMemo(() => {
    const total = lista.length
    const ativos = lista.filter((m) => m.status === 'ATIVO').length
    const taxas = lista.map((m) => m.taxaComparecimento).filter((t) => t !== null && t !== undefined)
    const taxaMedia = taxas.length ? Math.round(taxas.reduce((a, b) => a + Number(b), 0) / taxas.length) : null
    return { total, ativos, taxaMedia }
  }, [lista])

  // Histórico de participações agrupado por mês (mais recente primeiro) — evita a lista
  // gigante quando o entregador roda o ano todo. Cada grupo já traz a contagem de presenças.
  const historicoPorMes = useMemo(() => {
    const mapa = new Map()
    for (const h of detalhe?.historico ?? []) {
      let ano = h.ano, mes = h.mes
      if (!ano || !mes) {
        const d = new Date(h.data)
        if (!isNaN(d.getTime())) { ano = d.getUTCFullYear(); mes = d.getUTCMonth() + 1 }
      }
      const chave = ano && mes ? `${ano}-${String(mes).padStart(2, '0')}` : 'sem-data'
      if (!mapa.has(chave)) mapa.set(chave, { chave, ano, mes, itens: [] })
      mapa.get(chave).itens.push(h)
    }
    return [...mapa.values()]
      .map((g) => ({ ...g, compareceu: g.itens.filter((i) => i.presencaStatus === 'COMPARECEU').length }))
      .sort((a, b) => (a.chave < b.chave ? 1 : a.chave > b.chave ? -1 : 0))
  }, [detalhe?.historico])
  // Mês exibido: o escolhido (se ainda existir) ou o mais recente.
  const grupoHistSel = historicoPorMes.find((g) => g.chave === histMes) ?? historicoPorMes[0] ?? null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Entregadores</h1>
          <div className="page-header-sub">Acompanhe a base, histórico, presença e ocorrências dos motoboys.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => abrirNovaOcorrencia(null)}>Registrar ocorrência</button>
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>Novo entregador</button>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {!loading && !erro && (
        <div className="ent-kpis">
          <div className="ent-kpi">
            <span className="ent-kpi-valor">{resumoEnt.total}</span>
            <span className="ent-kpi-label">{statusFiltro ? 'Listados' : 'Entregadores'}</span>
          </div>
          <div className="ent-kpi">
            <span className="ent-kpi-valor">{resumoEnt.ativos}</span>
            <span className="ent-kpi-label">Ativos</span>
          </div>
          <div className={'ent-kpi' + (pendentes.length > 0 ? ' ent-kpi-pend' : '')}>
            <span className="ent-kpi-valor">{pendentes.length}</span>
            <span className="ent-kpi-label">Pendentes</span>
          </div>
          <div className="ent-kpi">
            <span className="ent-kpi-valor">{resumoEnt.taxaMedia === null ? '—' : `${resumoEnt.taxaMedia}%`}</span>
            <span className="ent-kpi-label">Taxa média</span>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="ent-filtros">
        <input
          className="form-input"
          placeholder="Buscar por nome ou WhatsApp…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <div className="ic-filtros" style={{ marginBottom: 0 }}>
          {[
            { id: '', label: 'Todos' },
            { id: 'ATIVO', label: 'Ativos' },
            { id: 'PENDENTE', label: 'Pendentes' },
            { id: 'INATIVO', label: 'Inativos' },
            { id: 'BLOQUEADO', label: 'Bloqueados' }
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={'ic-filtro' + (statusFiltro === f.id ? ' active' : '')}
              onClick={() => setStatusFiltro(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {pendentes.length > 0 && statusFiltro !== 'PENDENTE' && (
        <div className="ent-pendentes-banner">
          <span className="ent-pendentes-num">{pendentes.length}</span>
          <span className="ent-pendentes-txt">
            {pendentes.length === 1 ? 'nova solicitação de cadastro aguardando aprovação.' : 'novas solicitações de cadastro aguardando aprovação.'}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStatusFiltro('PENDENTE')}>Ver solicitações</button>
        </div>
      )}

      {erro ? (
        <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
      ) : loading ? (
        <div className="loading-state">Carregando entregadores…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>Nenhum entregador encontrado.</div>
      ) : (
        <div className="table-card">
          <table className="ent-tabela">
            <thead>
              <tr>
                <th>Entregador</th>
                <th>Status</th>
                <th className="ent-th-num">Diárias</th>
                <th className="ent-th-num">Faltas</th>
                <th className="ent-th-num">Abandonos</th>
                <th className="ent-th-num">Ocorr.</th>
                <th className="ent-th-num">Taxa</th>
                <th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const st = statusInfo(m)
                return (
                  <tr
                    key={m.id}
                    className={'ent-row-click' + (detalhe?.id === m.id ? ' ent-row-sel' : '')}
                    onClick={() => abrirDetalhe(m.id)}
                  >
                    <td>
                      <div className="ent-row-id">
                        <span className="ent-av">{iniciais(m.nome)}</span>
                        <div className="ent-row-id-txt">
                          <span className="ent-row-nome">{m.nome}</span>
                          <span className="ent-row-whats">{formatarWhats(m.whatsapp)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={'badge ' + st.cls}
                        title={m.atencao && m.atencaoMotivos?.length ? m.atencaoMotivos.join(' · ') : undefined}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="ent-num"><strong>{m.totalCompareceu}</strong></td>
                    <td className={'ent-num' + (m.totalFaltou > 0 ? ' clr-red' : ' ent-zero')}>{m.totalFaltou}</td>
                    <td className={'ent-num' + (m.totalAbandonos > 0 ? ' clr-red' : ' ent-zero')}>{m.totalAbandonos}</td>
                    <td className={'ent-num' + (m.totalOcorrencias > 0 ? '' : ' ent-zero')}>{m.totalOcorrencias}</td>
                    <td className="ent-num"><strong style={{ color: corTaxa(m.taxaComparecimento) }}>{pct(m.taxaComparecimento)}</strong></td>
                    <td className="ent-chevron" aria-hidden="true">›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalhe (modal centralizado) */}
      {detalhe && (
        <div className="modal-overlay">
          <div className="modal modal-card-large ent-modal" onClick={(e) => e.stopPropagation()}>
          {loadingDetalhe ? (
            <div className="loading-state">Carregando entregador…</div>
          ) : (
            <>
              <div className="modal-header ent-det-head">
                <div className="ent-det-id">
                  <span className="ent-av ent-av-lg">{iniciais(edit?.nome || detalhe.nome)}</span>
                  <div>
                    <div className="ent-det-nome">
                      {edit?.nome || detalhe.nome}
                      {(() => {
                        const st = statusInfo({ status: edit?.status ?? detalhe.status, atencao: detalhe.atencao, atencaoMotivos: detalhe.atencaoMotivos })
                        return <span className={'badge ' + st.cls} style={{ marginLeft: 8 }}>{st.label}</span>
                      })()}
                    </div>
                    <div className="ent-det-sub">{formatarWhats(edit?.whatsapp ?? detalhe.whatsapp)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirNovaOcorrencia(detalhe.id)}>Registrar ocorrência</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditAberto(true)}>Editar</button>
                  {detalhe.status !== 'PENDENTE' && (
                    detalhe.status === 'BLOQUEADO'
                      ? <button type="button" className="btn btn-secondary btn-sm" onClick={desbloquearEntregador}>Desbloquear</button>
                      : <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmBloq(detalhe)}>Bloquear</button>
                  )}
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(detalhe)}>Excluir</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDetalhe(null); setSearchParams({}) }}>Fechar</button>
                </div>
              </div>

              {/* Solicitação de cadastro (link público) — aprovar/recusar em destaque */}
              {detalhe.status === 'PENDENTE' && (
                <div className="ent-pendente-box">
                  <div className="ent-pendente-info">
                    <span className="ent-pendente-tag">Solicitação de cadastro</span>
                    <span>Este entregador se cadastrou pelo link público e aguarda sua aprovação.</span>
                  </div>
                  <div className="ent-pendente-acoes">
                    <button type="button" className="btn btn-primary btn-sm" onClick={aprovarPendente}>Aprovar</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmExcluir(detalhe)}>Recusar</button>
                  </div>
                </div>
              )}

              {detalhe.atencao && detalhe.atencaoMotivos?.length > 0 && (
                <div className="ent-atencao-alerta">
                  <span className="ent-atencao-tag">Atenção</span>
                  {detalhe.atencaoMotivos.join(' · ')}
                </div>
              )}

              {/* Métricas em destaque (as 4 principais) */}
              <div className="ent-hero">
                <div className="ent-hero-card">
                  <div className="ent-hero-label">Taxa de comparecimento</div>
                  <div className="ent-hero-valor" style={{ color: corTaxa(detalhe.taxaComparecimento) }}>{pct(detalhe.taxaComparecimento)}</div>
                  <div className="ent-hero-bar"><div className="ent-hero-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(detalhe.taxaComparecimento) || 0))}%`, background: corTaxa(detalhe.taxaComparecimento) }} /></div>
                </div>
                <div className="ent-hero-card">
                  <div className="ent-hero-label">Diárias</div>
                  <div className="ent-hero-valor">{detalhe.totalCompareceu}</div>
                  <div className="ent-hero-sub">dias trabalhados</div>
                </div>
                <div className="ent-hero-card">
                  <div className="ent-hero-label">Ocorrências</div>
                  <div className="ent-hero-valor">{detalhe.totalOcorrencias}</div>
                  {detalhe.totalOcorrenciasCriticas > 0
                    ? <div className="ent-hero-sub clr-red">{detalhe.totalOcorrenciasCriticas} crítica{detalhe.totalOcorrenciasCriticas > 1 ? 's' : ''}</div>
                    : <div className="ent-hero-sub">nenhuma crítica</div>}
                </div>
                <div className="ent-hero-card">
                  <div className="ent-hero-label">Prejuízo</div>
                  <div className={'ent-hero-valor' + (Number(detalhe.prejuizoAcumulado) > 0 ? ' clr-red' : '')}>{brl(detalhe.prejuizoAcumulado)}</div>
                  <div className="ent-hero-sub">acumulado</div>
                </div>
              </div>

              {/* Métricas de detalhe */}
              <div className="ent-metricas">
                {[
                  ['Inscrições', detalhe.totalInscricoes],
                  ['Confirmadas', detalhe.totalConfirmadas],
                  ['Canceladas', detalhe.totalCanceladas],
                  ['Faltas', detalhe.totalFaltou],
                  ['Abandonos', detalhe.totalAbandonos],
                  ['Justificou', detalhe.totalJustificou],
                  ['Última particip.', dataCurta(detalhe.ultimaParticipacao)],
                  ['Última ocorr.', dataCurta(detalhe.ultimaOcorrencia)]
                ].map(([label, valor]) => (
                  <div key={label} className="ent-metrica">
                    <div className="ent-metrica-label">{label}</div>
                    <div className="ent-metrica-valor">{valor}</div>
                  </div>
                ))}
              </div>

              {/* Dados do entregador (edição recolhível — fechada por padrão) */}
              <button type="button" className="ent-collapse-head" onClick={() => setEditAberto((v) => !v)} aria-expanded={editAberto}>
                <span className="section-title" style={{ margin: 0 }}>Dados do entregador</span>
                <svg className={'ent-collapse-chevron' + (editAberto ? ' open' : '')} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {editAberto && (
                <div className="ent-edit">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Nome</label>
                      <input className="form-input" value={edit?.nome ?? ''} onChange={(e) => updEdit('nome', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">WhatsApp</label>
                      <input className="form-input" value={mascararTelefone(edit?.whatsapp ?? '')} onChange={(e) => updEdit('whatsapp', mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="numeric" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select className="form-input" value={edit?.status ?? 'ATIVO'} onChange={(e) => updEdit('status', e.target.value)}>
                        <option value="ATIVO">Ativo</option>
                        <option value="INATIVO">Inativo</option>
                        <option value="BLOQUEADO">Bloqueado (não pode se inscrever)</option>
                        <option value="PENDENTE">Pendente (aguardando aprovação)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Observações</label>
                      <input className="form-input" value={edit?.observacoes ?? ''} onChange={(e) => updEdit('observacoes', e.target.value)} placeholder="opcional" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Possui CNH?</label>
                      <select
                        className="form-input"
                        value={edit?.possuiCnh === true ? 'sim' : edit?.possuiCnh === false ? 'nao' : ''}
                        onChange={(e) => updEdit('possuiCnh', e.target.value === 'sim' ? true : e.target.value === 'nao' ? false : null)}
                      >
                        <option value="">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                  </div>
                  <div className="ent-edit-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={salvarDados} disabled={salvandoDados}>
                      {salvandoDados ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                  </div>
                </div>
              )}

              {/* Histórico (recolhível — fechado por padrão p/ não alongar o modal) */}
              <button type="button" className="ent-collapse-head" onClick={() => setHistAberto((v) => !v)} aria-expanded={histAberto}>
                <span className="section-title" style={{ margin: 0 }}>Histórico de participações</span>
                <span className="ent-collapse-count">{detalhe.historico.length}</span>
                <svg className={'ent-collapse-chevron' + (histAberto ? ' open' : '')} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {histAberto && (
                detalhe.historico.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px 16px' }}>Sem participações registradas.</div>
                ) : (
                  <>
                    <div className="ent-hist-filtro">
                      <select className="form-input" value={grupoHistSel?.chave ?? ''} onChange={(e) => setHistMes(e.target.value)}>
                        {historicoPorMes.map((g) => (
                          <option key={g.chave} value={g.chave}>
                            {g.mes ? `${MES_NOME[g.mes]} de ${g.ano}` : 'Sem data'} ({g.itens.length})
                          </option>
                        ))}
                      </select>
                      <span className="ent-hist-resumo">{grupoHistSel?.compareceu ?? 0} de {grupoHistSel?.itens.length ?? 0} compareceu</span>
                    </div>
                    <div className="table-card ent-hist-wrap">
                      <table className="hb-table hb-table-compact">
                        <thead>
                          <tr><th>Data</th><th>Inscrição</th><th>Presença</th><th>Observação</th></tr>
                        </thead>
                        <tbody>
                          {(grupoHistSel?.itens ?? []).map((h) => (
                            <tr key={h.inscricaoId}>
                              <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{dataCurta(h.data)}</td>
                              <td>{INSC_STATUS[h.status] ?? h.status}</td>
                              <td>{PRESENCA[h.presencaStatus] ?? h.presencaStatus}</td>
                              <td style={{ color: '#666', fontSize: 11.5 }}>{h.presencaObservacao || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              )}

              {/* Ocorrências (registro pelo botão do topo do modal) */}
              <div className="ent-sec-head"><div className="section-title">Ocorrências</div></div>
              {detalhe.ocorrencias.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px 16px' }}>Nenhuma ocorrência registrada.</div>
              ) : (
                <div className="table-card">
                  <table className="hb-table hb-table-compact">
                    <thead>
                      <tr><th>Data</th><th>Tipo</th><th>Gravidade</th><th>Descrição</th><th style={{ textAlign: 'right' }}>Prejuízo</th><th>Resolvida</th><th></th></tr>
                    </thead>
                    <tbody>
                      {detalhe.ocorrencias.map((o) => (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>{dataCurta(o.dataOcorrencia)}</td>
                          <td>{OC_TIPO_LABEL[o.tipo] ?? o.tipo}</td>
                          <td><span className={'badge ' + (GRAVIDADE[o.gravidade]?.cls ?? 'badge-gray')}>{GRAVIDADE[o.gravidade]?.label ?? o.gravidade}</span></td>
                          <td style={{ color: '#666', fontSize: 11.5, maxWidth: 260 }}>{o.descricao}</td>
                          <td style={{ textAlign: 'right' }} className={Number(o.valorPrejuizo) > 0 ? 'clr-red' : undefined}>{o.valorPrejuizo ? brl(o.valorPrejuizo) : '—'}</td>
                          <td>{o.resolvida ? <span className="badge badge-green">Sim</span> : <span className="badge badge-yellow">Não</span>}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditarOcorrencia(o)}>Editar</button>{' '}
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmOc(o)}>Excluir</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      )}

      {/* Modal entregador */}
      {modalEntregador && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalEntregador.modo === 'novo' ? 'Novo entregador' : 'Editar entregador'}</div>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={modalEntregador.form.nome} onChange={(e) => upd('nome', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp</label>
              <input className="form-input" value={mascararTelefone(modalEntregador.form.whatsapp)} onChange={(e) => upd('whatsapp', mascararTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="numeric" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={modalEntregador.form.status} onChange={(e) => upd('status', e.target.value)}>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
                <option value="BLOQUEADO">Bloqueado</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea className="form-input" rows={2} value={modalEntregador.form.observacoes} onChange={(e) => upd('observacoes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalEntregador(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarEntregador} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ocorrência */}
      {modalOcorrencia && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalOcorrencia.id ? 'Editar ocorrência' : 'Registrar ocorrência'}</div>
            {modalOcorrencia.central && (
              <div className="form-group">
                <label className="form-label">Entregador</label>
                <select
                  className="form-input"
                  value={modalOcorrencia.motoboyId ?? ''}
                  onChange={(e) => setModalOcorrencia((m) => ({ ...m, motoboyId: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">Selecione o entregador…</option>
                  {[...lista].sort((a, b) => a.nome.localeCompare(b.nome)).map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={modalOcorrencia.form.tipo} onChange={(e) => updOc('tipo', e.target.value)}>
                  {OC_TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Gravidade</label>
                <select className="form-input" value={modalOcorrencia.form.gravidade} onChange={(e) => updOc('gravidade', e.target.value)}>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data</label>
                <input type="date" className="form-input" value={modalOcorrencia.form.dataOcorrencia} onChange={(e) => updOc('dataOcorrencia', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Valor do prejuízo (R$)</label>
                <InputMoeda className="form-input" valor={modalOcorrencia.form.valorPrejuizo} onChange={(v) => updOc('valorPrejuizo', v)} placeholder="opcional" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <textarea className="form-input" rows={3} value={modalOcorrencia.form.descricao} onChange={(e) => updOc('descricao', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <label className="ent-check">
              <input type="checkbox" checked={modalOcorrencia.form.resolvida} onChange={(e) => updOc('resolvida', e.target.checked)} />
              Ocorrência resolvida
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOcorrencia(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarOcorrencia} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmOc}
        title="Excluir ocorrência"
        message={confirmOc ? `Excluir a ocorrência "${OC_TIPO_LABEL[confirmOc.tipo] ?? confirmOc.tipo}" de ${dataCurta(confirmOc.dataOcorrencia)}?` : ''}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={excluirOcorrencia}
        onCancel={() => setConfirmOc(null)}
      />

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir entregador"
        message={confirmExcluir ? `Excluir ${confirmExcluir.nome}?` : ''}
        description="As ocorrências dele serão removidas. O histórico de inscrições na escala é mantido (sem vínculo). Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={excluirEntregador}
        onCancel={() => setConfirmExcluir(null)}
      />

      <ConfirmDialog
        open={!!confirmBloq}
        title="Bloquear entregador"
        message={confirmBloq ? `Bloquear ${confirmBloq.nome}?` : ''}
        description="Ele deixa de aparecer para novas escalas e não consegue se inscrever pelo link público. Você pode desbloquear a qualquer momento."
        confirmLabel="Bloquear"
        cancelLabel="Cancelar"
        variant="danger"
        loading={bloqueando}
        onConfirm={bloquearEntregador}
        onCancel={() => setConfirmBloq(null)}
      />
    </div>
  )
}
