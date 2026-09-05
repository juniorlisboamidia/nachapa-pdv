// Escala de Motoboys (admin) — escala mensal com vagas por dia e inscrições.
// Consome os endpoints de /api/escala-motoboys (Etapa 1). Sem cálculo novo.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import InputMoeda from '../components/InputMoeda'
import ConfirmDialog from '../components/ConfirmDialog'
import MesSwitcher from '../components/MesSwitcher'
import BotaoCopiar from '../components/BotaoCopiar'

const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function partesMes(mesStr) {
  const [ano, mes] = mesStr.split('-')
  return { ano: Number(ano), mes: Number(mes) }
}
// Data ISO (UTC, @db.Date) → "DD/MM" sem deslocar por fuso
function dataCurta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function rotuloMesAno(mesStr) {
  const { ano, mes } = partesMes(mesStr)
  return `${MESES[mes - 1] ?? mes} · ${ano}`
}

// Status visual do dia (admin)
function statusDia(dia) {
  if (dia.status === 'FECHADO') return { label: 'Fechado', cls: 'badge-gray' }
  if (Number(dia.vagas) === 0) return { label: 'Sem vagas', cls: 'badge-gray' }
  if (dia.lotado) return { label: 'Completo', cls: 'badge-blue' }
  return { label: 'Aberto', cls: 'badge-green' }
}
const INSC_BADGE = {
  INSCRITO: { label: 'Inscrito', cls: 'badge-blue' },
  CONFIRMADO: { label: 'Confirmado', cls: 'badge-green' },
  CANCELADO: { label: 'Cancelado', cls: 'badge-gray' }
}
const PRESENCA_BADGE = {
  PENDENTE: { label: 'Pendente', cls: 'badge-gray' },
  COMPARECEU: { label: 'Compareceu', cls: 'badge-green' },
  FALTOU: { label: 'Faltou', cls: 'badge-red' },
  JUSTIFICOU: { label: 'Justificou', cls: 'badge-yellow' }
}
const PRESENCA_ACOES = [
  { v: 'COMPARECEU', label: 'Compareceu' },
  { v: 'FALTOU', label: 'Faltou' },
  { v: 'JUSTIFICOU', label: 'Justificou' },
  { v: 'PENDENTE', label: 'Pendente' }
]
// Cor do ponto de presença nas "fichas" compactas do card do dia
const PRESENCA_DOT = { PENDENTE: '#cbd5e1', COMPARECEU: '#16a34a', FALTOU: '#dc2626', JUSTIFICOU: '#d97706' }

// Ocorrências — mesma base de Entregadores, para registrar direto da escala
// (o backend aceita escalaDiaId + inscricaoId no POST de ocorrência).
const OC_TIPOS = [
  { v: 'NAO_COMPARECEU', label: 'Não compareceu' },
  { v: 'MOTO_QUEBROU', label: 'Moto quebrou' },
  { v: 'ATRASO', label: 'Atraso' },
  { v: 'PREJUIZO', label: 'Prejuízo' },
  { v: 'CONDUTA', label: 'Conduta' },
  { v: 'ATENDIMENTO', label: 'Atendimento' },
  { v: 'OBSERVACAO_POSITIVA', label: 'Observação positiva' },
  { v: 'OUTRO', label: 'Outro' }
]
const FORM_OC_VAZIO = { tipo: 'NAO_COMPARECEU', gravidade: 'MEDIA', dataOcorrencia: '', descricao: '', valorPrejuizo: '', resolvida: false }

// Data ISO (UTC, @db.Date) → "AAAA-MM-DD" para preencher <input type="date">
function dataInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}
// Faixa de datas da semana: "01/06 – 07/06" (primeiro e último dia da semana)
function rangeSemana(dias) {
  if (!dias?.length) return ''
  const ini = dataCurta(dias[0].data)
  const fim = dataCurta(dias[dias.length - 1].data)
  return ini === fim ? ini : `${ini} – ${fim}`
}
// Total de inscritos ativos na semana (soma do contador de cada dia)
function resumoSemana(dias) {
  return (dias ?? []).reduce((acc, d) => acc + (Number(d.inscritosAtivos) || 0), 0)
}
// Total de vagas oferecidas na semana (soma de cada dia)
function vagasSemana(dias) {
  return (dias ?? []).reduce((acc, d) => acc + (Number(d.vagas) || 0), 0)
}
// "02" (dia do mês, UTC) para o tile de data do modal
function diaNumero(iso) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '--' : String(d.getUTCDate()).padStart(2, '0')
}
// "02 de junho de 2026"
function dataExtenso(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getUTCDate()).padStart(2, '0')} de ${(MESES[d.getUTCMonth()] ?? '').toLowerCase()} de ${d.getUTCFullYear()}`
}
// Iniciais do nome para o avatar (1ª + última palavra)
function iniciais(nome) {
  const ps = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '?'
  return (ps[0][0] + (ps.length > 1 ? ps[ps.length - 1][0] : '')).toUpperCase()
}
// Nome para os chips do card: nome único fica inteiro; com sobrenome vira
// "Primeiro S." (ex.: "Junior Lisboa" → "Junior L."). Completo segue no tooltip.
function nomeCurto(nome) {
  const ps = String(nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return ''
  if (ps.length === 1) return ps[0]
  return `${ps[0]} ${ps[ps.length - 1][0].toUpperCase()}.`
}

// Ícones em linha (stroke 1.9, currentColor) no padrão visual do app
function Icon({ name }) {
  const paths = {
    check: <path d="M20 6 9 17l-5-5" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </>
    ),
    chat: <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5Z" />,
    alert: (
      <>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    chevronL: <path d="m15 18-6-6 6-6" />,
    chevronR: <path d="m9 18 6-6-6-6" />,
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    external: (
      <>
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </>
    )
  }
  return (
    <svg className="esc-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

// Ordem de exibição do padrão semanal (Segunda → Domingo). ds = diaSemana (0=Dom..6=Sáb)
const ORDEM_SEMANA = [
  { ds: 1, label: 'Segunda' },
  { ds: 2, label: 'Terça' },
  { ds: 3, label: 'Quarta' },
  { ds: 4, label: 'Quinta' },
  { ds: 5, label: 'Sexta' },
  { ds: 6, label: 'Sábado' },
  { ds: 0, label: 'Domingo' }
]

const DIA_LONGO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
function nomeDiaSemana(ds) {
  return DIA_LONGO[ds] ?? '—'
}
// Data ISO (UTC, @db.Date) → "DD/MM/AAAA" sem deslocar por fuso
function formatarDataEscala(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}
// Número para link wa.me: só dígitos; prefixa 55 se 10/11 dígitos e não começar com 55.
// Retorna null se inválido (< 10 dígitos).
function normalizarNumeroWhatsapp(num) {
  const d = String(num ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  if (d.startsWith('55')) return d
  if (d.length === 10 || d.length === 11) return '55' + d
  return d
}
function gerarMensagemIndividual(insc, dia, empresaNome) {
  const statusFrase = insc.status === 'CONFIRMADO' ? 'confirmado na escala.' : 'pré-inscrito na escala.'
  return (
    `Olá, ${insc.nome}! Tudo certo?\n\n` +
    `Passando para confirmar sua presença na escala de motoboys do ${empresaNome}.\n\n` +
    `Data: ${nomeDiaSemana(dia.diaSemana)}, ${formatarDataEscala(dia.data)}\n` +
    `Status: ${statusFrase}\n\n` +
    `Qualquer imprevisto, avise a equipe com antecedência.`
  )
}
function gerarResumoDia(dia, empresaNome) {
  const ativos = (dia.inscricoes ?? []).filter((i) => i.status !== 'CANCELADO')
  const cab = `Escala de Motoboys — ${empresaNome}\n${nomeDiaSemana(dia.diaSemana)}, ${formatarDataEscala(dia.data)}`
  if (ativos.length === 0) return `${cab}\n\nNenhum motoboy inscrito até o momento.`
  const linhas = ativos
    .map((i, idx) => `${idx + 1}. ${i.nome} — ${i.whatsapp} — ${i.status === 'CONFIRMADO' ? 'Confirmado' : 'Inscrito'}`)
    .join('\n')
  return `${cab}\n\nVagas: ${dia.inscritosAtivos}/${dia.vagas}\nRestantes: ${dia.vagasRestantes}\n\nMotoboys:\n${linhas}`
}

// Sugere o padrão por dia da semana = valor de vagas mais frequente entre os dias
// daquele dia da semana no mês (empate → primeiro encontrado). Sem persistência.
function calcularPadrao(dias) {
  const contagem = {} // ds -> { valorVagas: ocorrencias }
  for (const d of dias ?? []) {
    const ds = d.diaSemana
    const v = Number(d.vagas) || 0
    if (!contagem[ds]) contagem[ds] = {}
    contagem[ds][v] = (contagem[ds][v] ?? 0) + 1
  }
  const padrao = {}
  for (let ds = 0; ds < 7; ds++) {
    const counts = contagem[ds]
    if (!counts) {
      padrao[ds] = 0
      continue
    }
    let melhor = 0
    let melhorCount = -1
    for (const [valor, ocorr] of Object.entries(counts)) {
      if (ocorr > melhorCount) {
        melhorCount = ocorr
        melhor = Number(valor)
      }
    }
    padrao[ds] = melhor
  }
  return padrao
}

export default function EscalaMotoboys() {
  const [mes, setMes] = useState(mesAtual())
  const [escala, setEscala] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)
  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [acaoId, setAcaoId] = useState(null) // inscrição em ação
  const [confirmAlvo, setConfirmAlvo] = useState(null) // cancelar inscrição
  const [draftVagas, setDraftVagas] = useState({}) // { diaId: number }
  const [padrao, setPadrao] = useState({}) // { diaSemana: vagas }
  const [aplicandoPadrao, setAplicandoPadrao] = useState(false)
  const [empresaNome, setEmpresaNome] = useState('Hamburgueria')
  const [modalDiaId, setModalDiaId] = useState(null) // dia aberto no modal de gerenciamento
  const [modalOc, setModalOc] = useState(null) // { insc, dia, form } — ocorrência direto da escala
  const [salvandoOc, setSalvandoOc] = useState(false)
  const [semanaAberta, setSemanaAberta] = useState(null) // acordeão: nº da semana expandida
  // Escala manual: escalar entregadores já cadastrados num dia (origem ADMIN).
  const [entregadores, setEntregadores] = useState([])
  const [carregandoEntreg, setCarregandoEntreg] = useState(false)
  const [buscaEntreg, setBuscaEntreg] = useState('')
  const [escalandoId, setEscalandoId] = useState(null)
  const [mostrarEscalar, setMostrarEscalar] = useState(false)
  // Matriz (entregadores × dias) — gerencia o mês inteiro numa tela só.
  const [matrizAberta, setMatrizAberta] = useState(false)
  const [agendados, setAgendados] = useState({})        // `${motoboyId}:${diaId}` -> inscricaoId
  const [matrizSalvando, setMatrizSalvando] = useState({}) // `${motoboyId}:${diaId}` -> true (em voo)
  const [matrizExtras, setMatrizExtras] = useState([])  // escalados fora da lista ATIVA
  const navigate = useNavigate()

  async function marcarPresenca(inscricaoId, presencaStatus) {
    try {
      await api.put(`/escala-motoboys/inscricoes/${inscricaoId}/presenca`, { presencaStatus })
      const { ano, mes: m } = partesMes(mes)
      const r = await api.get('/escala-motoboys', { params: { ano, mes: m } })
      aplicarEscala(r.data)
      setToast({ message: 'Presença atualizada.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível marcar presença.', type: 'error' })
    }
  }

  // ===== Ocorrência registrada direto da escala (vinculada ao dia + inscrição) =====
  function abrirOcorrencia(insc, dia) {
    setModalOc({ insc, dia, form: { ...FORM_OC_VAZIO, dataOcorrencia: dataInput(dia.data) } })
  }
  const updOc = (campo, valor) => setModalOc((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))
  async function salvarOcorrencia() {
    if (!modalOc) return
    const { insc, dia, form } = modalOc
    if (!form.dataOcorrencia) return setToast({ message: 'Informe a data da ocorrência.', type: 'error' })
    if (!form.descricao.trim()) return setToast({ message: 'Descreva a ocorrência.', type: 'error' })
    const payload = {
      tipo: form.tipo,
      gravidade: form.gravidade,
      dataOcorrencia: form.dataOcorrencia,
      descricao: form.descricao,
      valorPrejuizo: form.valorPrejuizo === '' ? null : Number(form.valorPrejuizo),
      resolvida: form.resolvida,
      escalaDiaId: dia.id,
      inscricaoId: insc.id
    }
    setSalvandoOc(true)
    try {
      await api.post(`/motoboys/${insc.motoboyId}/ocorrencias`, payload)
      setToast({ message: 'Ocorrência registrada.', type: 'success' })
      setModalOc(null)
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível registrar a ocorrência.', type: 'error' })
    } finally {
      setSalvandoOc(false)
    }
  }

  // Nome da empresa para as mensagens (endpoint já existente; fallback se falhar)
  useEffect(() => {
    api
      .get('/empresa')
      .then((r) => setEmpresaNome((r.data?.nome ?? '').trim() || 'Hamburgueria'))
      .catch(() => {})
  }, [])


  function abrirWhatsapp(insc, dia) {
    const num = normalizarNumeroWhatsapp(insc.whatsapp)
    if (!num) {
      setToast({ message: 'WhatsApp inválido para abrir conversa.', type: 'error' })
      return
    }
    const msg = gerarMensagemIndividual(insc, dia, empresaNome)
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  function aplicarEscala(data) {
    setEscala(data)
    const draft = {}
    if (data?.dias) for (const d of data.dias) draft[d.id] = d.vagas
    setDraftVagas(draft)
    setPadrao(calcularPadrao(data?.dias ?? []))
  }

  function carregar(mesStr = mes) {
    setLoading(true)
    setErro(null)
    const { ano, mes: m } = partesMes(mesStr)
    api
      .get('/escala-motoboys', { params: { ano, mes: m } })
      .then((r) => aplicarEscala(r.data))
      .catch((err) =>
        setErro(
          err?.response?.data?.error ??
            (err?.code === 'ERR_NETWORK'
              ? 'Não foi possível conectar ao backend (http://localhost:4000).'
              : err?.message ?? 'Erro ao carregar a escala.')
        )
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    carregar(mes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  // Ao abrir o modal de um dia: zera o painel de escalar e carrega os entregadores ATIVOS.
  useEffect(() => {
    if (modalDiaId == null) return
    setMostrarEscalar(false)
    setBuscaEntreg('')
    let vivo = true
    setCarregandoEntreg(true)
    api.get('/motoboys', { params: { status: 'ATIVO' } })
      .then((r) => { if (vivo) setEntregadores(Array.isArray(r.data) ? r.data : []) })
      .catch(() => { if (vivo) setEntregadores([]) })
      .finally(() => { if (vivo) setCarregandoEntreg(false) })
    return () => { vivo = false }
  }, [modalDiaId])

  // Escala um entregador já cadastrado no dia aberto (origem ADMIN no backend).
  async function escalarEntregador(motoboyId) {
    if (escalandoId != null || modalDiaId == null) return
    setEscalandoId(motoboyId)
    try {
      await api.post(`/escala-motoboys/dias/${modalDiaId}/inscricoes`, { motoboyId })
      const { ano, mes: m } = partesMes(mes)
      const r = await api.get('/escala-motoboys', { params: { ano, mes: m } })
      aplicarEscala(r.data)
      setToast({ message: 'Entregador escalado.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível escalar o entregador.', type: 'error' })
    } finally {
      setEscalandoId(null)
    }
  }

  // Carrega os entregadores ATIVOS (usado pela matriz).
  function carregarEntregadores() {
    setCarregandoEntreg(true)
    api.get('/motoboys', { params: { status: 'ATIVO' } })
      .then((r) => setEntregadores(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEntregadores([]))
      .finally(() => setCarregandoEntreg(false))
  }

  // Abre a matriz: monta o mapa de agendados a partir da escala atual + carrega entregadores.
  function abrirMatriz() {
    if (!escala) return
    const ag = {}
    const extras = new Map()
    for (const d of escala.dias ?? []) {
      for (const i of d.inscricoes ?? []) {
        if (i.status === 'CANCELADO' || i.motoboyId == null) continue
        ag[`${i.motoboyId}:${d.id}`] = i.id
        extras.set(i.motoboyId, { id: i.motoboyId, nome: i.nome, whatsapp: i.whatsapp, status: 'ATIVO' })
      }
    }
    setAgendados(ag)
    setMatrizExtras([...extras.values()])
    setMatrizSalvando({})
    setBuscaEntreg('')
    setMatrizAberta(true)
    carregarEntregadores()
  }

  function fecharMatriz() {
    setMatrizAberta(false)
    carregar(mes) // recarrega p/ refletir contagens e a visão por semana
  }

  // Liga/desliga um entregador num dia. Otimista: atualiza a célula na hora e
  // reverte em caso de erro. Add → POST (devolve o id); remove → DELETE (cancela).
  async function toggleMatriz(motoboyId, dia) {
    const key = `${motoboyId}:${dia.id}`
    if (matrizSalvando[key]) return
    const inscricaoId = agendados[key]
    setMatrizSalvando((s) => ({ ...s, [key]: true }))
    if (inscricaoId) {
      setAgendados((a) => { const n = { ...a }; delete n[key]; return n })
      try {
        await api.delete(`/escala-motoboys/inscricoes/${inscricaoId}`)
      } catch (err) {
        setAgendados((a) => ({ ...a, [key]: inscricaoId }))
        setToast({ message: err?.response?.data?.error ?? 'Não foi possível remover.', type: 'error' })
      } finally {
        setMatrizSalvando((s) => { const n = { ...s }; delete n[key]; return n })
      }
    } else {
      setAgendados((a) => ({ ...a, [key]: '__pending__' }))
      try {
        const r = await api.post(`/escala-motoboys/dias/${dia.id}/inscricoes`, { motoboyId })
        setAgendados((a) => ({ ...a, [key]: r?.data?.inscricaoId ?? '__saved__' }))
      } catch (err) {
        setAgendados((a) => { const n = { ...a }; delete n[key]; return n })
        setToast({ message: err?.response?.data?.error ?? 'Não foi possível escalar.', type: 'error' })
      } finally {
        setMatrizSalvando((s) => { const n = { ...s }; delete n[key]; return n })
      }
    }
  }

  async function criarEscala() {
    const { ano, mes: m } = partesMes(mes)
    setCriando(true)
    try {
      const r = await api.post('/escala-motoboys', { ano, mes: m })
      aplicarEscala(r.data)
      setToast({ message: 'Escala do mês criada com sucesso.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível criar a escala.', type: 'error' })
    } finally {
      setCriando(false)
    }
  }

  async function salvarVagas() {
    if (!escala) return
    const dias = escala.dias
      .filter((d) => Number(draftVagas[d.id]) !== Number(d.vagas))
      .map((d) => ({ id: d.id, vagas: Number(draftVagas[d.id]) }))
    if (dias.length === 0) {
      setToast({ message: 'Nenhuma alteração de vagas para salvar.', type: 'info' })
      return
    }
    if (dias.some((d) => !Number.isInteger(d.vagas) || d.vagas < 0)) {
      setToast({ message: 'Vagas devem ser números inteiros maiores ou iguais a 0.', type: 'error' })
      return
    }
    setSalvando(true)
    try {
      const r = await api.put(`/escala-motoboys/${escala.id}/dias`, { dias })
      aplicarEscala(r.data)
      setToast({ message: 'Vagas atualizadas com sucesso.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar as vagas.', type: 'error' })
    } finally {
      setSalvando(false)
    }
  }

  async function aplicarPadraoNoMes() {
    if (!escala) return
    // valida inteiros >= 0
    for (let ds = 0; ds < 7; ds++) {
      const v = Number(padrao[ds])
      if (!Number.isInteger(v) || v < 0) {
        setToast({ message: 'As vagas do padrão devem ser números inteiros maiores ou iguais a 0.', type: 'error' })
        return
      }
    }
    // bloqueia se o padrão reduziria vagas abaixo dos inscritos ativos em algum dia
    const conflito = escala.dias.some((d) => Number(padrao[d.diaSemana]) < Number(d.inscritosAtivos))
    if (conflito) {
      setToast({
        message: 'O padrão reduziria vagas abaixo dos inscritos em alguns dias. Ajuste o padrão ou cancele inscrições antes.',
        type: 'error'
      })
      return
    }
    // envia só vagas (mantém o status atual de cada dia)
    const dias = escala.dias.map((d) => ({ id: d.id, vagas: Number(padrao[d.diaSemana]) }))
    setAplicandoPadrao(true)
    try {
      const r = await api.put(`/escala-motoboys/${escala.id}/dias`, { dias })
      aplicarEscala(r.data)
      setToast({ message: 'Padrão aplicado no mês.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível aplicar o padrão.', type: 'error' })
    } finally {
      setAplicandoPadrao(false)
    }
  }

  async function alternarDia(dia) {
    const novo = dia.status === 'ABERTO' ? 'FECHADO' : 'ABERTO'
    try {
      const r = await api.put(`/escala-motoboys/${escala.id}/dias`, { dias: [{ id: dia.id, status: novo }] })
      aplicarEscala(r.data)
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível alterar o dia.', type: 'error' })
    }
  }

  async function alternarEscala() {
    const novo = escala.status === 'ABERTA' ? 'FECHADA' : 'ABERTA'
    try {
      const r = await api.put(`/escala-motoboys/${escala.id}`, { status: novo })
      aplicarEscala(r.data)
      setToast({ message: novo === 'ABERTA' ? 'Inscrições abertas.' : 'Inscrições fechadas.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível alterar a escala.', type: 'error' })
    }
  }

  async function confirmarInscricao(id) {
    setAcaoId(id)
    try {
      await api.put(`/escala-motoboys/inscricoes/${id}/confirmar`)
      const { ano, mes: m } = partesMes(mes)
      const r = await api.get('/escala-motoboys', { params: { ano, mes: m } })
      aplicarEscala(r.data)
      setToast({ message: 'Inscrição confirmada.', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível confirmar.', type: 'error' })
    } finally {
      setAcaoId(null)
    }
  }

  async function cancelarInscricao() {
    const alvo = confirmAlvo
    if (!alvo) return
    setAcaoId(alvo.id)
    try {
      await api.delete(`/escala-motoboys/inscricoes/${alvo.id}`)
      const { ano, mes: m } = partesMes(mes)
      const r = await api.get('/escala-motoboys', { params: { ano, mes: m } })
      aplicarEscala(r.data)
      setConfirmAlvo(null)
      setToast({ message: 'Inscrição cancelada (vaga liberada).', type: 'success' })
    } catch (err) {
      setToast({ message: err?.response?.data?.error ?? 'Não foi possível cancelar.', type: 'error' })
    } finally {
      setAcaoId(null)
    }
  }


  const semanas = useMemo(() => {
    if (!escala?.dias) return []
    const mapa = new Map()
    for (const d of escala.dias) {
      if (!mapa.has(d.semanaDoMes)) mapa.set(d.semanaDoMes, [])
      mapa.get(d.semanaDoMes).push(d)
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([num, dias]) => ({ num, dias }))
  }, [escala])

  // "AAAA-MM-DD" de hoje (fuso local) — destaca o dia e a semana atuais na visão do mês
  const hojeStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  // Semana que contém hoje (só quando o mês visível é o corrente)
  const semanaAtualNum = useMemo(() => {
    if (mes !== mesAtual()) return null
    const s = semanas.find((sm) => sm.dias.some((d) => dataInput(d.data) === hojeStr))
    return s ? s.num : null
  }, [semanas, mes, hojeStr])
  // KPIs do mês para a faixa do cabeçalho (derivados dos dias já carregados)
  const resumoMes = useMemo(() => {
    const dias = escala?.dias ?? []
    let vagas = 0, inscritos = 0, confirmados = 0
    for (const d of dias) {
      vagas += Number(d.vagas) || 0
      inscritos += Number(d.inscritosAtivos) || 0
      for (const i of d.inscricoes ?? []) if (i.status === 'CONFIRMADO') confirmados += 1
    }
    return { vagas, inscritos, confirmados, pct: vagas > 0 ? Math.round((inscritos / vagas) * 100) : 0 }
  }, [escala])

  // Acordeão: ao trocar de mês/escala, abre a semana atual (se for o mês corrente)
  // ou a primeira semana. Mantém a escolha do usuário se a semana ainda existir.
  useEffect(() => {
    if (!semanas.length) {
      setSemanaAberta(null)
      return
    }
    setSemanaAberta((atual) => {
      if (atual != null && semanas.some((s) => s.num === atual)) return atual
      if (mes === mesAtual()) {
        const hoje = new Date()
        const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
        const semHoje = semanas.find((s) => s.dias.some((d) => dataInput(d.data) === hojeStr))
        if (semHoje) return semHoje.num
      }
      return semanas[0].num
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanas, mes])

  const linkPublico = escala ? `${window.location.origin}/escala/motoboys/${escala.tokenPublico}` : ''
  // Dia atualmente aberto no modal — derivado da escala para refletir recargas
  const modalDia = modalDiaId != null ? (escala?.dias?.find((d) => d.id === modalDiaId) ?? null) : null
  const modalDiaAtivos = modalDia ? (modalDia.inscricoes ?? []).filter((i) => i.status !== 'CANCELADO') : []
  // Entregadores ATIVOS ainda não escalados neste dia (filtra por id e por whatsapp).
  const entregadoresDisponiveis = useMemo(() => {
    if (modalDiaId == null) return []
    const jaId = new Set(modalDiaAtivos.map((i) => i.motoboyId).filter(Boolean))
    const jaZap = new Set(modalDiaAtivos.map((i) => i.whatsapp))
    const q = buscaEntreg.trim().toLowerCase()
    const qDig = q.replace(/\D/g, '')
    return entregadores.filter((m) =>
      m.status === 'ATIVO' && !jaId.has(m.id) && !jaZap.has(m.whatsapp) &&
      (!q || m.nome.toLowerCase().includes(q) || (qDig && String(m.whatsapp).includes(qDig)))
    )
  }, [modalDiaId, modalDiaAtivos, entregadores, buscaEntreg])

  // Matriz: dias do mês (ordenados) e linhas de entregadores (ATIVOS + já escalados).
  const matrizDias = useMemo(
    () => (escala?.dias ?? []).slice().sort((a, b) => new Date(a.data) - new Date(b.data)),
    [escala]
  )
  const matrizEntregadores = useMemo(() => {
    const base = entregadores.filter((m) => m.status === 'ATIVO').map((m) => ({ id: m.id, nome: m.nome, whatsapp: m.whatsapp }))
    const ids = new Set(base.map((m) => m.id))
    const linhas = [...base, ...matrizExtras.filter((m) => !ids.has(m.id))].sort((a, b) => a.nome.localeCompare(b.nome))
    const q = buscaEntreg.trim().toLowerCase()
    const qDig = q.replace(/\D/g, '')
    return q ? linhas.filter((m) => m.nome.toLowerCase().includes(q) || (qDig && String(m.whatsapp).includes(qDig))) : linhas
  }, [entregadores, matrizExtras, buscaEntreg])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Escala de Motoboys</h1>
          <div className="page-header-sub">Organize as vagas e inscrições dos entregadores por semana.</div>
        </div>
        <MesSwitcher mes={mes} onChange={(v) => setMes(v || mesAtual())} />
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {erro && (
        <div className="alert alert-red">
          <div className="alert-msg clr-red">{erro}</div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Carregando escala…</div>
      ) : !escala ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text)', marginBottom: 8 }}>
            Nenhuma escala para {rotuloMesAno(mes)}
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Crie a escala do mês para configurar as vagas por dia e gerar o link de inscrição.
          </div>
          <button type="button" className="btn btn-primary" onClick={criarEscala} disabled={criando}>
            {criando ? 'Criando…' : 'Criar escala do mês'}
          </button>
        </div>
      ) : (
        <>
          {/* Cabeçalho da escala */}
          <div className="card esc-head-card">
            <div className="esc-head-row">
              <div className="esc-head-info">
                <div className="esc-head-title">
                  {escala.titulo || `Escala de ${rotuloMesAno(mes)}`}
                  <span className={'badge ' + (escala.status === 'ABERTA' ? 'badge-green' : 'badge-gray')} style={{ marginLeft: 8 }}>
                    {escala.status === 'ABERTA' ? 'Inscrições abertas' : 'Inscrições fechadas'}
                  </span>
                </div>
                <div className="esc-link-row">
                  <span className="esc-link">{linkPublico}</span>
                  <BotaoCopiar className="esc-link-btn" texto={linkPublico} title="Copiar link de inscrição" onCopiado={() => setToast({ message: 'Link copiado com sucesso.', type: 'success' })} />
                  <a className="esc-link-btn" href={linkPublico} target="_blank" rel="noopener noreferrer" title="Abrir link em nova aba" aria-label="Abrir link de inscrição em nova aba">
                    <Icon name="external" />
                  </a>
                </div>
              </div>
              <div className="esc-head-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={abrirMatriz}>
                  <Icon name="calendar" /> Escalar em matriz
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={alternarEscala}>
                  {escala.status === 'ABERTA' ? 'Fechar inscrições' : 'Abrir inscrições'}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={salvarVagas} disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar alterações da escala'}
                </button>
              </div>
            </div>
            <div className="esc-stats">
              <div className="esc-stat">
                <span className="esc-stat-valor">{resumoMes.vagas}</span>
                <span className="esc-stat-label">Vagas no mês</span>
              </div>
              <div className="esc-stat">
                <span className="esc-stat-valor">{resumoMes.inscritos}</span>
                <span className="esc-stat-label">Inscritos</span>
              </div>
              <div className="esc-stat">
                <span className="esc-stat-valor">{resumoMes.confirmados}</span>
                <span className="esc-stat-label">Confirmados</span>
              </div>
              <div className="esc-stat esc-stat-preench">
                <span className="esc-stat-valor">{resumoMes.pct}%</span>
                <span className="esc-stat-label">Preenchimento</span>
              </div>
            </div>
          </div>

          {/* Padrão de vagas por semana */}
          <div className="card esc-padrao-card">
            <div className="esc-padrao-titulo">Padrão de vagas por semana</div>
            <div className="esc-padrao-sub">
              Defina quantas vagas cada dia da semana deve ter e aplique no mês inteiro.
            </div>
            <div className="esc-padrao-grid">
              {ORDEM_SEMANA.map(({ ds, label }) => (
                <div key={ds} className="esc-padrao-campo">
                  <label className="esc-padrao-label">{label}</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input esc-padrao-input"
                    value={padrao[ds] ?? 0}
                    onChange={(e) =>
                      setPadrao((p) => ({ ...p, [ds]: e.target.value === '' ? '' : Number(e.target.value) }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="esc-padrao-acoes">
              <button type="button" className="btn btn-primary btn-sm" onClick={aplicarPadraoNoMes} disabled={aplicandoPadrao}>
                {aplicandoPadrao ? 'Aplicando…' : 'Aplicar no mês'}
              </button>
              <span className="esc-padrao-dica">Você ainda pode ajustar datas específicas manualmente depois.</span>
            </div>
          </div>

          {/* Semanas (acordeão: uma aberta por vez) */}
          {semanas.map((semana) => {
            const aberta = semanaAberta === semana.num
            const totalInscritos = resumoSemana(semana.dias)
            const totalVagas = vagasSemana(semana.dias)
            const pctSem = totalVagas > 0 ? Math.min(100, Math.round((totalInscritos / totalVagas) * 100)) : 0
            const ehSemanaAtual = semana.num === semanaAtualNum
            return (
            <div key={semana.num} className={'esc-semana' + (aberta ? ' aberta' : '') + (ehSemanaAtual ? ' atual' : '')}>
              <button
                type="button"
                className="esc-semana-header"
                aria-expanded={aberta}
                onClick={() => setSemanaAberta((p) => (p === semana.num ? null : semana.num))}
              >
                <span className="esc-semana-header-info">
                  <span className="esc-semana-chevron" aria-hidden="true"><Icon name="chevronR" /></span>
                  <span className="esc-semana-titulo">Semana {semana.num}</span>
                  <span className="esc-semana-range">{rangeSemana(semana.dias)}</span>
                  {ehSemanaAtual && <span className="esc-semana-agora">Esta semana</span>}
                </span>
                <span className="esc-semana-meta">
                  <span className="esc-semana-mini" aria-hidden="true"><span className="esc-semana-mini-fill" style={{ width: `${pctSem}%` }} /></span>
                  <span className="esc-semana-resumo">{totalVagas === 0 ? 'Sem vagas' : `${totalInscritos}/${totalVagas}`}</span>
                </span>
              </button>
              {aberta && (
              <div className="esc-dias-grid">
                {semana.dias.map((dia) => {
                  const sd = statusDia(dia)
                  const ativos = (dia.inscricoes ?? []).filter((i) => i.status !== 'CANCELADO')
                  const pctDia = Number(dia.vagas) > 0 ? Math.min(100, Math.round((dia.inscritosAtivos / dia.vagas) * 100)) : 0
                  const ehHoje = dataInput(dia.data) === hojeStr
                  const fds = dia.diaSemana === 0 || dia.diaSemana === 6
                  return (
                    <div key={dia.id} className={'esc-dia-card' + (ehHoje ? ' hoje' : '') + (fds ? ' fds' : '') + (dia.status === 'FECHADO' ? ' fechado' : '')}>
                      <div className="esc-dia-top">
                        <div className="esc-dia-quando">
                          <div className="esc-dia-nome">
                            {DIA_CURTO[dia.diaSemana]}
                            {ehHoje && <span className="esc-dia-hoje">Hoje</span>}
                          </div>
                          <div className="esc-dia-data">{dataCurta(dia.data)}</div>
                        </div>
                        <span className={'badge ' + sd.cls}>{sd.label}</span>
                      </div>

                      <div className="esc-dia-vagas">
                        <label className="esc-vagas-label">Vagas</label>
                        <input
                          type="number"
                          min="0"
                          className="form-input esc-vagas-input"
                          value={draftVagas[dia.id] ?? 0}
                          onChange={(e) =>
                            setDraftVagas((p) => ({ ...p, [dia.id]: e.target.value === '' ? '' : Number(e.target.value) }))
                          }
                        />
                        <span className="esc-dia-contagem">
                          {dia.inscritosAtivos}/{dia.vagas} · {dia.vagasRestantes} rest.
                        </span>
                      </div>

                      <div className="esc-dia-bar" aria-hidden="true"><div className="esc-dia-bar-fill" style={{ width: `${pctDia}%` }} /></div>

                      <div className="esc-dia-corpo">
                        {ativos.length > 0 ? (
                          <div className="esc-dia-resumo">
                            {ativos.map((i) => (
                              <span
                                key={i.id}
                                className="esc-chip"
                                title={`${i.nome} — ${PRESENCA_BADGE[i.presencaStatus]?.label ?? 'Pendente'}${i.status === 'CONFIRMADO' ? ' · Confirmado' : ''}`}
                              >
                                <span className="esc-chip-dot" style={{ background: PRESENCA_DOT[i.presencaStatus] ?? '#cbd5e1' }} />
                                <span className="esc-chip-nome">{nomeCurto(i.nome)}</span>
                                {i.status === 'CONFIRMADO' && <span className="esc-chip-check">✓</span>}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="esc-sem-inscritos">Sem inscritos</div>
                        )}
                      </div>

                      <div className="esc-dia-footer">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalDiaId(dia.id)}>
                          Gerenciar{ativos.length > 0 ? ` · ${ativos.length}` : ''}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => alternarDia(dia)}>
                          {dia.status === 'ABERTO' ? 'Fechar dia' : 'Abrir dia'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
            )
          })}
        </>
      )}

      {/* Modal: gerenciar o dia (lista de motoboys, presença, ações e ocorrência) */}
      {modalDia && (() => {
        const sd = statusDia(modalDia)
        const pct = modalDia.vagas > 0 ? Math.min(100, Math.round((modalDia.inscritosAtivos / modalDia.vagas) * 100)) : 0
        return (
        <div className="modal-overlay">
          <div className="modal esc-modal-dia" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho com tile de data */}
            <div className="esc-modal-head">
              <div className="esc-modal-head-left">
                <div className="esc-datetile">
                  <span className="esc-datetile-dia">{diaNumero(modalDia.data)}</span>
                  <span className="esc-datetile-dow">{DIA_CURTO[modalDia.diaSemana]}</span>
                </div>
                <div>
                  <div className="esc-modal-h1">
                    {nomeDiaSemana(modalDia.diaSemana)}
                    <span className={'badge ' + sd.cls}>{sd.label}</span>
                  </div>
                  <div className="esc-modal-h2">{dataExtenso(modalDia.data)}</div>
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalDiaId(null)}>Fechar</button>
            </div>

            {/* Vagas + progresso */}
            <div className="esc-modal-vagas">
              <div className="esc-modal-vagas-top">
                <span className="esc-mini-label">Vagas preenchidas</span>
                <span className="esc-modal-vagas-num"><strong>{modalDia.inscritosAtivos}</strong> / {modalDia.vagas}</span>
              </div>
              <div className="particip-bar-track"><div className="particip-bar-fill" style={{ width: `${pct}%` }} /></div>
              <div className="esc-modal-vagas-sub">{modalDia.vagasRestantes} vaga(s) restante(s)</div>
            </div>

            {/* Ações do dia */}
            <div className="esc-modal-toolbar">
              <button type="button" className={'btn btn-sm ' + (mostrarEscalar ? 'btn-secondary' : 'btn-primary')} onClick={() => setMostrarEscalar((v) => !v)}>
                <Icon name="user" /> {mostrarEscalar ? 'Fechar' : 'Escalar entregador'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => alternarDia(modalDia)}>
                {modalDia.status === 'ABERTO' ? 'Fechar dia' : 'Abrir dia'}
              </button>
              <BotaoCopiar className="btn btn-secondary btn-sm" label="Copiar lista" texto={() => gerarResumoDia(modalDia, empresaNome)} onCopiado={() => setToast({ message: 'Lista do dia copiada.', type: 'success' })} />
            </div>

            {/* Painel: escalar um entregador já cadastrado (montagem manual da escala) */}
            {mostrarEscalar && (
              <div className="esc-escalar">
                <div className="esc-escalar-top">
                  <span className="esc-mini-label">Escalar entregador cadastrado</span>
                  <input
                    className="form-input esc-escalar-busca"
                    placeholder="Buscar por nome ou WhatsApp…"
                    value={buscaEntreg}
                    onChange={(e) => setBuscaEntreg(e.target.value)}
                  />
                </div>
                {carregandoEntreg ? (
                  <div className="esc-escalar-info">Carregando entregadores…</div>
                ) : entregadoresDisponiveis.length === 0 ? (
                  <div className="esc-escalar-info">
                    {entregadores.length === 0
                      ? 'Nenhum entregador cadastrado. Cadastre na aba Entregadores.'
                      : 'Todos os entregadores ativos já estão neste dia (ou ajuste a busca).'}
                  </div>
                ) : (
                  <div className="esc-escalar-lista">
                    {entregadoresDisponiveis.map((m) => (
                      <div key={m.id} className="esc-escalar-item">
                        <span className="esc-av esc-av-sm">{iniciais(m.nome)}</span>
                        <div className="esc-escalar-id">
                          <span className="esc-escalar-nome">{m.nome}</span>
                          <span className="esc-escalar-zap">{m.whatsapp}</span>
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" disabled={escalandoId != null} onClick={() => escalarEntregador(m.id)}>
                          {escalandoId === m.id ? '…' : (<><Icon name="check" /> Escalar</>)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lista de motoboys */}
            {modalDiaAtivos.length === 0 ? (
              <div className="esc-modal-vazio">
                <span className="esc-modal-vazio-ico"><Icon name="user" /></span>
                <span>Nenhum motoboy inscrito neste dia.</span>
              </div>
            ) : (
              <div className="esc-modal-lista">
                {modalDiaAtivos.map((i) => {
                  const presenca = i.presencaStatus ?? 'PENDENTE'
                  return (
                  <div key={i.id} className="esc-pessoa">
                    <div className="esc-pessoa-top">
                      <span className="esc-av">{iniciais(i.nome)}</span>
                      <div className="esc-pessoa-id">
                        <span className="esc-pessoa-nome">{i.nome}</span>
                        <span className="esc-pessoa-zap">{i.whatsapp}</span>
                      </div>
                      <span className={'badge ' + (INSC_BADGE[i.status]?.cls ?? 'badge-gray')}>
                        {INSC_BADGE[i.status]?.label ?? i.status}
                      </span>
                    </div>

                    <div className="esc-pessoa-presenca">
                      <span className="esc-mini-label">Presença</span>
                      <div className="esc-seg">
                        {PRESENCA_ACOES.map((p) => (
                          <button
                            key={p.v}
                            type="button"
                            className={'esc-seg-btn' + (presenca === p.v ? ' on s-' + p.v : '')}
                            onClick={() => marcarPresenca(i.id, p.v)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="esc-pessoa-acoes">
                      {i.status !== 'CONFIRMADO' && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={acaoId === i.id} onClick={() => confirmarInscricao(i.id)}>
                          <Icon name="check" /> Confirmar
                        </button>
                      )}
                      <BotaoCopiar className="btn btn-secondary btn-sm" label="Mensagem" texto={() => gerarMensagemIndividual(i, modalDia, empresaNome)} onCopiado={() => setToast({ message: 'Mensagem copiada.', type: 'success' })} />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirWhatsapp(i, modalDia)}>
                        <Icon name="chat" /> WhatsApp
                      </button>
                      {i.motoboyId && (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirOcorrencia(i, modalDia)}>
                            <Icon name="alert" /> Ocorrência
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/entregadores?motoboyId=${i.motoboyId}`)}>
                            <Icon name="user" /> Entregador
                          </button>
                        </>
                      )}
                      <button type="button" className="btn btn-danger btn-sm esc-acao-cancelar" disabled={acaoId === i.id} onClick={() => setConfirmAlvo(i)}>
                        <Icon name="x" /> Cancelar
                      </button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        )
      })()}

      {/* Matriz da escala: entregadores × dias do mês (clique nas células) */}
      {matrizAberta && escala && (
        <div className="modal-overlay">
          <div className="modal modal-card-large esc-matriz-modal" onClick={(e) => e.stopPropagation()}>
            <div className="esc-matriz-head">
              <div>
                <div className="modal-title" style={{ marginBottom: 2 }}>Escala em matriz · {rotuloMesAno(mes)}</div>
                <div className="esc-matriz-sub">Clique nas células para escalar/desescalar. Linhas = entregadores · colunas = dias.</div>
              </div>
              <div className="esc-matriz-head-actions">
                <input className="form-input esc-matriz-busca" placeholder="Buscar entregador…" value={buscaEntreg} onChange={(e) => setBuscaEntreg(e.target.value)} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={fecharMatriz}>Fechar</button>
              </div>
            </div>

            {carregandoEntreg && matrizEntregadores.length === 0 ? (
              <div className="esc-escalar-info">Carregando entregadores…</div>
            ) : matrizEntregadores.length === 0 ? (
              <div className="esc-escalar-info">Nenhum entregador {buscaEntreg ? 'encontrado' : 'cadastrado'}.</div>
            ) : (
              <div className="esc-matriz-wrap">
                <table className="esc-matriz">
                  <thead>
                    <tr>
                      <th className="esc-matriz-canto">Entregador</th>
                      {matrizDias.map((d) => {
                        const fds = d.diaSemana === 0 || d.diaSemana === 6
                        return (
                          <th key={d.id} className={'esc-matriz-dia' + (fds ? ' fds' : '')}>
                            <span className="esc-matriz-dia-num">{diaNumero(d.data)}</span>
                            <span className="esc-matriz-dia-dow">{DIA_CURTO[d.diaSemana]}</span>
                          </th>
                        )
                      })}
                      <th className="esc-matriz-total-h">Tot.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrizEntregadores.map((m) => {
                      const totalM = matrizDias.reduce((acc, d) => acc + (agendados[`${m.id}:${d.id}`] ? 1 : 0), 0)
                      return (
                        <tr key={m.id}>
                          <th className="esc-matriz-nome" title={m.whatsapp}>
                            <span className="esc-matriz-nome-txt">{m.nome}</span>
                          </th>
                          {matrizDias.map((d) => {
                            const key = `${m.id}:${d.id}`
                            const on = !!agendados[key]
                            const saving = !!matrizSalvando[key]
                            const fds = d.diaSemana === 0 || d.diaSemana === 6
                            return (
                              <td key={d.id} className={'esc-matriz-cel' + (fds ? ' fds' : '')}>
                                <button
                                  type="button"
                                  className={'esc-cel-btn' + (on ? ' on' : '') + (saving ? ' saving' : '')}
                                  onClick={() => toggleMatriz(m.id, d)}
                                  aria-label={`${m.nome} — dia ${diaNumero(d.data)}`}
                                >
                                  {on ? '✓' : ''}
                                </button>
                              </td>
                            )
                          })}
                          <td className="esc-matriz-total">{totalM}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th className="esc-matriz-canto esc-matriz-foot-label">Total/dia</th>
                      {matrizDias.map((d) => {
                        const fds = d.diaSemana === 0 || d.diaSemana === 6
                        const tot = matrizEntregadores.reduce((acc, m) => acc + (agendados[`${m.id}:${d.id}`] ? 1 : 0), 0)
                        return <td key={d.id} className={'esc-matriz-foot' + (fds ? ' fds' : '')}>{tot}</td>
                      })}
                      <td className="esc-matriz-foot"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: registrar ocorrência direto da escala (vinculada ao dia/inscrição) */}
      {modalOc && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Registrar ocorrência · {modalOc.insc.nome}</div>
            <div className="esc-modal-sub" style={{ marginTop: -6, marginBottom: 14 }}>
              {nomeDiaSemana(modalOc.dia.diaSemana)} · {dataCurta(modalOc.dia.data)}
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={modalOc.form.tipo} onChange={(e) => updOc('tipo', e.target.value)}>
                  {OC_TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Gravidade</label>
                <select className="form-input" value={modalOc.form.gravidade} onChange={(e) => updOc('gravidade', e.target.value)}>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data</label>
                <input type="date" className="form-input" value={modalOc.form.dataOcorrencia} onChange={(e) => updOc('dataOcorrencia', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Valor do prejuízo (R$)</label>
                <InputMoeda className="form-input" valor={modalOc.form.valorPrejuizo} onChange={(v) => updOc('valorPrejuizo', v)} placeholder="opcional" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <textarea className="form-input" rows={3} value={modalOc.form.descricao} onChange={(e) => updOc('descricao', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <label className="ent-check">
              <input type="checkbox" checked={modalOc.form.resolvida} onChange={(e) => updOc('resolvida', e.target.checked)} />
              Ocorrência resolvida
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOc(null)} disabled={salvandoOc}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarOcorrencia} disabled={salvandoOc}>{salvandoOc ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAlvo}
        title="Cancelar inscrição"
        message={confirmAlvo ? `Cancelar a inscrição de ${confirmAlvo.nome}?` : ''}
        description="A vaga será liberada. A inscrição fica registrada como cancelada."
        confirmLabel="Cancelar inscrição"
        cancelLabel="Voltar"
        variant="danger"
        loading={acaoId != null}
        onConfirm={cancelarInscricao}
        onCancel={() => setConfirmAlvo(null)}
      />
    </div>
  )
}
