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
const intFormatter = new Intl.NumberFormat('pt-BR')

function brl(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return brlFormatter.format(Number(value))
}
function int(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return intFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}
function pct1(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(1).replace('.', ',')}%`
}

const MESES_ANO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Dias do mês de calendário (mes = 1..12). Dia 0 do mês seguinte = último dia.
function diasNoMes(ano, mes) {
  const n = new Date(Number(ano), Number(mes), 0).getDate()
  return Number.isFinite(n) && n > 0 ? n : 30
}
function anoAtual() {
  return String(new Date().getFullYear())
}
function mesAtualNum() {
  return new Date().getMonth() + 1
}
function ym(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

const PE_BADGE = {
  ACIMA_DO_EQUILIBRIO:   { cls: 'badge-green',  label: 'Acima do equilíbrio' },
  PROXIMO_DO_EQUILIBRIO: { cls: 'badge-yellow', label: 'Próximo do equilíbrio' },
  ABAIXO_DO_EQUILIBRIO:  { cls: 'badge-orange', label: 'Abaixo do equilíbrio' },
  MARGEM_INSUFICIENTE:   { cls: 'badge-red',    label: 'Margem insuficiente' }
}

// Um lançamento mensal consolidado: ano + mês + faturamento + pedidos
const MES_FORM_BLANK = { ano: anoAtual(), mes: String(mesAtualNum()), valorTotal: '', quantidadePedidos: '' }
const FILL_ANO_BLANK = MESES_ANO.map(() => ({ valorTotal: '', quantidadePedidos: '' }))

function validateMesForm({ ano, mes, valorTotal, quantidadePedidos }) {
  const a = Number(ano)
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return 'ano inválido'
  const m = Number(mes)
  if (!Number.isInteger(m) || m < 1 || m > 12) return 'mês inválido'
  const v = Number(valorTotal)
  if (valorTotal === '' || !Number.isFinite(v)) return 'faturamento é obrigatório e numérico'
  if (v < 0) return 'faturamento deve ser maior ou igual a zero'
  if (quantidadePedidos === '' || !Number.isInteger(Number(quantidadePedidos))) {
    return 'pedidos é obrigatório e deve ser inteiro'
  }
  if (Number(quantidadePedidos) < 0) return 'pedidos deve ser maior ou igual a zero'
  return null
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

function MetricRow({ label, children }) {
  return (
    <div style={metricRowStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span>{children}</span>
    </div>
  )
}

// Resultado do /dashboard de um mês → indicadores prontos da visão mensal/anual.
// Mês sem lançamento (faturamento e pedidos zerados) vira `semDados`.
function analisarMes(d, ano, mes) {
  if (!d) {
    return { semDados: true, faturamento: 0, pedidos: 0, ticketMedio: null, mediaDiariaFat: null,
             mediaDiariaPedidos: null, pontoEquilibrio: null, resultadoVsEquilibrio: null,
             percentualEquilibrio: null, status: null }
  }
  const faturamento = Number(d.faturamentoAtual ?? 0)
  const pedidos = Number(d.totalPedidos ?? 0)
  const semDados = faturamento === 0 && pedidos === 0
  const dias = diasNoMes(ano, mes)
  const pe = d.pontoEquilibrio === null || d.pontoEquilibrio === undefined ? null : Number(d.pontoEquilibrio)
  const resultadoVsEquilibrio = pe === null ? null : faturamento - pe
  const percentualEquilibrio = pe === null || pe === 0 ? null : (faturamento / pe) * 100
  return {
    semDados,
    faturamento,
    pedidos,
    ticketMedio: pedidos > 0 ? faturamento / pedidos : null,
    mediaDiariaFat: faturamento / dias,
    mediaDiariaPedidos: pedidos / dias,
    pontoEquilibrio: pe,
    resultadoVsEquilibrio,
    percentualEquilibrio,
    status: semDados ? null : d.statusOperacao ?? null,
    // valores extras do mês (resultado estimado)
    custosFixos: d.totalCustosFixos ?? null,
    custosVariaveis: d.totalCustosVariaveis ?? null,
    mensagemOperacao: d.mensagemOperacao ?? null
  }
}

export default function Faturamento() {
  // Abas: Mensal (detalhe de um mês) e Anual (Jan–Dez, visão central)
  const [aba, setAba] = useState('ANUAL')
  const [ano, setAno] = useState(anoAtual())
  const [mesSel, setMesSel] = useState(mesAtualNum())

  // Feedbacks de ação usam Toast (canto inferior direito); `error` fica só
  // para falha de carregamento da página (estado, não feedback de ação)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  // Visão anual: 12 resumos mensais do /dashboard (mesma regra oficial de PE)
  const [anualData, setAnualData] = useState(null)
  const [anualLoading, setAnualLoading] = useState(false)

  // Visão mensal: resumo do mês selecionado
  const [mensalData, setMensalData] = useState(null)
  const [mensalLoading, setMensalLoading] = useState(false)

  // Modal cadastrar/editar mês
  const [mesModalOpen, setMesModalOpen] = useState(false)
  const [mesForm, setMesForm] = useState(MES_FORM_BLANK)
  const [mesModalErr, setMesModalErr] = useState(null)
  const [mesSaving, setMesSaving] = useState(false)

  // Modal preencher ano (12 meses de uma vez)
  const [fillOpen, setFillOpen] = useState(false)
  const [fillForm, setFillForm] = useState(FILL_ANO_BLANK)
  const [fillError, setFillError] = useState(null)
  const [fillSaving, setFillSaving] = useState(false)

  // Exclusão de mês (soft delete dos lançamentos daquele mês/ano)
  const [mesParaExcluir, setMesParaExcluir] = useState(null)
  const [excluindoMes, setExcluindoMes] = useState(false)

  // ===== Carregamento =====

  // Cada mês que falhar vira null e aparece como "sem lançamento", sem derrubar a tela
  function loadAnual(anoParam = ano) {
    setAnualLoading(true)
    setError(null)
    const meses = Array.from({ length: 12 }, (_, i) => ym(anoParam, i + 1))
    return Promise.all(
      meses.map((m) => api.get('/dashboard', { params: { mes: m } }).then((r) => r.data).catch(() => null))
    )
      .then((rows) => setAnualData(rows))
      .catch((err) => setError(err?.message ?? 'Erro ao carregar visão anual.'))
      .finally(() => setAnualLoading(false))
  }

  function loadMensal(anoParam = ano, mesParam = mesSel) {
    setMensalLoading(true)
    setError(null)
    return api
      .get('/dashboard', { params: { mes: ym(anoParam, mesParam) } })
      .then((r) => setMensalData(r.data))
      .catch((err) => {
        setMensalData(null)
        setError(
          err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.response?.data?.error ?? err?.message ?? 'Erro ao carregar o mês.'
        )
      })
      .finally(() => setMensalLoading(false))
  }

  useEffect(() => {
    if (aba === 'ANUAL') loadAnual(ano)
    if (aba === 'MENSAL') loadMensal(ano, mesSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, ano, mesSel])

  // ===== Upsert mensal (sem migration, usando os endpoints existentes) =====
  // Convenção: 1 registro por mês/ano em YYYY-MM-01, canal "MENSAL". O upsert
  // atualiza o registro canônico quando já existe (evitando duplicidade) e
  // consolida registros legados (diários) do mês via soft delete.
  async function upsertMes(anoN, mesN, valorTotal, quantidadePedidos) {
    const mm = ym(anoN, mesN)
    const dataDia01 = `${mm}-01`
    const { data: existentes } = await api.get('/faturamento', { params: { mes: mm } })
    const lista = Array.isArray(existentes) ? existentes : []
    const canonico =
      lista.find((r) => String(r.data).slice(0, 10) === dataDia01) ?? lista[0] ?? null
    const payload = {
      data: dataDia01,
      valorTotal: Number(valorTotal),
      quantidadePedidos: Number(quantidadePedidos),
      canal: 'MENSAL'
    }
    if (canonico) {
      await api.put(`/faturamento/${canonico.id}`, payload)
      // Consolida: qualquer outro registro ativo do mês sai dos cálculos
      for (const r of lista) {
        if (r.id !== canonico.id) await api.delete(`/faturamento/${r.id}`)
      }
    } else {
      await api.post('/faturamento', payload)
    }
  }

  function reloadAtual() {
    return Promise.all([
      aba === 'ANUAL' ? loadAnual(ano) : Promise.resolve(),
      aba === 'MENSAL' ? loadMensal(ano, mesSel) : Promise.resolve()
    ])
  }

  // ===== Cadastrar / editar mês =====

  function openCadastrarMes() {
    setMesForm({ ...MES_FORM_BLANK, ano: String(ano), mes: String(mesSel) })
    setMesModalErr(null)
    setMesModalOpen(true)
  }

  function openEditarMes(mesN, info) {
    setMesForm({
      ano: String(ano),
      mes: String(mesN),
      valorTotal: info && !info.semDados ? String(info.faturamento) : '',
      quantidadePedidos: info && !info.semDados ? String(info.pedidos) : ''
    })
    setMesModalErr(null)
    setMesModalOpen(true)
  }

  function handleSalvarMes(e) {
    e.preventDefault()
    const err = validateMesForm(mesForm)
    if (err) { setMesModalErr(err); return }
    setMesModalErr(null)
    setMesSaving(true)
    upsertMes(Number(mesForm.ano), Number(mesForm.mes), Number(mesForm.valorTotal), Number(mesForm.quantidadePedidos))
      .then(() => {
        setMesModalOpen(false)
        // Se cadastrou em outro ano, navega para ele para o usuário ver o efeito
        if (String(mesForm.ano) !== String(ano)) setAno(String(mesForm.ano))
        setToast({ message: `${MESES_ANO[Number(mesForm.mes) - 1]} de ${mesForm.ano} salvo com sucesso.`, type: 'success' })
        return reloadAtual()
      })
      .catch((e2) =>
        setMesModalErr(e2?.response?.data?.error ?? e2?.message ?? 'Erro ao salvar o mês.')
      )
      .finally(() => setMesSaving(false))
  }

  // ===== Excluir mês =====

  function confirmExcluirMes() {
    const mesN = mesParaExcluir
    if (!mesN) return
    setExcluindoMes(true)
    api
      .get('/faturamento', { params: { mes: ym(ano, mesN) } })
      .then(({ data }) => {
        const lista = Array.isArray(data) ? data : []
        return Promise.all(lista.map((r) => api.delete(`/faturamento/${r.id}`)))
      })
      .then(() => {
        setToast({ message: `${MESES_ANO[mesN - 1]} de ${ano} excluído com sucesso.`, type: 'success' })
        return reloadAtual()
      })
      .catch((e) =>
        setToast({ message: e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir o mês.', type: 'error' })
      )
      .finally(() => {
        setExcluindoMes(false)
        setMesParaExcluir(null)
      })
  }

  // ===== Preencher ano =====

  function openPreencherAno() {
    // Pré-carrega os valores já existentes do ano (quando disponíveis)
    const base = MESES_ANO.map((_, i) => {
      const info = anualData ? analisarMes(anualData[i], ano, i + 1) : null
      return info && !info.semDados
        ? { valorTotal: String(info.faturamento), quantidadePedidos: String(info.pedidos) }
        : { valorTotal: '', quantidadePedidos: '' }
    })
    setFillForm(base)
    setFillError(null)
    setFillOpen(true)
  }

  function setFillCampo(i, campo, valor) {
    setFillForm((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)))
  }

  function handleSalvarAno(e) {
    e.preventDefault()
    const aSalvar = []
    for (let i = 0; i < 12; i++) {
      const f = fillForm[i]
      const temValor = f.valorTotal !== ''
      const temPedidos = f.quantidadePedidos !== ''
      if (!temValor && !temPedidos) continue
      if (!temValor || !temPedidos) {
        setFillError(`Preencha faturamento e pedidos de ${MESES_ANO[i]} (ou deixe os dois vazios).`)
        return
      }
      const v = Number(f.valorTotal)
      const q = Number(f.quantidadePedidos)
      if (!Number.isFinite(v) || v < 0) { setFillError(`Faturamento inválido em ${MESES_ANO[i]}.`); return }
      if (!Number.isInteger(q) || q < 0) { setFillError(`Pedidos inválidos em ${MESES_ANO[i]} (use número inteiro).`); return }
      aSalvar.push({ mes: i + 1, valorTotal: v, quantidadePedidos: q })
    }
    if (aSalvar.length === 0) { setFillError('Preencha pelo menos um mês.'); return }
    setFillError(null)
    setFillSaving(true)
    // Upsert mês a mês: cada mês existente é atualizado, novos são criados
    aSalvar
      .reduce(
        (chain, item) => chain.then(() => upsertMes(Number(ano), item.mes, item.valorTotal, item.quantidadePedidos)),
        Promise.resolve()
      )
      .then(() => {
        setFillOpen(false)
        setToast({ message: `${aSalvar.length} ${aSalvar.length === 1 ? 'mês salvo' : 'meses salvos'} em ${ano}.`, type: 'success' })
        return reloadAtual()
      })
      .catch((e2) =>
        setFillError(e2?.response?.data?.error ?? e2?.message ?? 'Erro ao salvar os meses.')
      )
      .finally(() => setFillSaving(false))
  }

  // ===== Derivados =====

  const mesesInfo = MESES_ANO.map((_, i) => analisarMes(anualData?.[i], ano, i + 1))
  const mesesComDados = mesesInfo.filter((m) => !m.semDados)
  const totalAnoFaturamento = mesesComDados.reduce((s, m) => s + m.faturamento, 0)
  const totalAnoPedidos = mesesComDados.reduce((s, m) => s + m.pedidos, 0)
  const ticketMedioAno = totalAnoPedidos > 0 ? totalAnoFaturamento / totalAnoPedidos : null

  const infoMes = analisarMes(mensalData, ano, mesSel)
  const lucroEstimado =
    infoMes.semDados || infoMes.custosFixos === null || infoMes.custosVariaveis === null
      ? null
      : infoMes.faturamento - Number(infoMes.custosFixos) - Number(infoMes.custosVariaveis)
  const margemEstimada =
    lucroEstimado === null || infoMes.faturamento === 0 ? null : (lucroEstimado / infoMes.faturamento) * 100
  const lucroPositivo = lucroEstimado !== null && lucroEstimado >= 0
  const peBadgeMes = infoMes.status ? PE_BADGE[infoMes.status] : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Faturamento</h1>
          <div className="page-header-sub">
            {aba === 'MENSAL'
              ? 'Faturamento mensal consolidado: ticket médio, médias diárias e ponto de equilíbrio.'
              : 'Visão anual consolidada: faturamento, pedidos e ponto de equilíbrio mês a mês.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAno(String(Number(ano) - 1))} aria-label="Ano anterior">‹</button>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)', minWidth: 44, textAlign: 'center' }}>{ano}</span>
            <button type="button" className="btn btn-secondary" onClick={() => setAno(String(Number(ano) + 1))} aria-label="Próximo ano">›</button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={openPreencherAno}>Preencher ano</button>
          <button type="button" className="btn btn-primary" onClick={openCadastrarMes}>+ Cadastrar mês</button>
        </div>
      </div>

      {/* Aba "Mensal" removida temporariamente — exibindo apenas a visão Anual. */}

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* Banner inline reservado apenas para falha de carregamento da página */}
      {error && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-red">{error}</div>
        </div>
      )}

      <ConfirmDialog
        open={mesParaExcluir !== null}
        title="Excluir faturamento do mês?"
        message={mesParaExcluir ? `Você está prestes a excluir ${MESES_ANO[mesParaExcluir - 1]} de ${ano}.` : ''}
        description="Os lançamentos do mês saem dos cálculos, mas o histórico é preservado."
        confirmLabel="Excluir mês"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindoMes}
        onConfirm={confirmExcluirMes}
        onCancel={() => setMesParaExcluir(null)}
      />

      {/* Modal: cadastrar / editar mês */}
      {mesModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Faturamento mensal</div>
            <form onSubmit={handleSalvarMes}>
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ano</label>
                  <input
                    className="form-input"
                    type="number"
                    min="2000"
                    max="2100"
                    step="1"
                    value={mesForm.ano}
                    onChange={(e) => setMesForm({ ...mesForm, ano: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Mês</label>
                  <select
                    className="form-input"
                    value={mesForm.mes}
                    onChange={(e) => setMesForm({ ...mesForm, mes: e.target.value })}
                  >
                    {MESES_ANO.map((nome, i) => (
                      <option key={nome} value={String(i + 1)}>{nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-grid-2" style={{ marginBottom: 0 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Faturamento do mês (R$)</label>
                  <InputMoeda
                    className="form-input"
                    valor={mesForm.valorTotal}
                    onChange={(v) => setMesForm({ ...mesForm, valorTotal: v })}
                    placeholder="0,00"
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Pedidos do mês</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="1"
                    value={mesForm.quantidadePedidos}
                    onChange={(e) => setMesForm({ ...mesForm, quantidadePedidos: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 10, lineHeight: 1.5 }}>
                Um lançamento por mês. Se o mês já existir, ele é atualizado (sem duplicar).
              </div>
              {mesModalErr && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{mesModalErr}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMesModalOpen(false)} disabled={mesSaving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={mesSaving}>
                  {mesSaving ? 'Salvando…' : 'Salvar mês'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: preencher ano */}
      {fillOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-title">Preencher ano · {ano}</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.5 }}>
              Informe o faturamento e os pedidos de cada mês. Meses já preenchidos vêm carregados —
              ajuste e salve. Cada mês vira um único lançamento consolidado (sem duplicar).
            </div>
            <form onSubmit={handleSalvarAno}>
              <div style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 1fr',
                    gap: 6,
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#aaa',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4
                  }}
                >
                  <span>Mês</span>
                  <span>Faturamento (R$)</span>
                  <span>Pedidos</span>
                </div>
                {MESES_ANO.map((nomeMes, i) => (
                  <div
                    key={nomeMes}
                    style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--app-text-2)' }}>{nomeMes}</div>
                    <InputMoeda
                      className="form-input"
                      style={cellInputStyle}
                      valor={fillForm[i].valorTotal}
                      onChange={(v) => setFillCampo(i, 'valorTotal', v)}
                      placeholder="0,00"
                    />
                    <input
                      className="form-input"
                      style={cellInputStyle}
                      type="number"
                      min="0"
                      step="1"
                      value={fillForm[i].quantidadePedidos}
                      onChange={(e) => setFillCampo(i, 'quantidadePedidos', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              {fillError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{fillError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFillOpen(false)} disabled={fillSaving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={fillSaving}>
                  {fillSaving ? 'Salvando…' : 'Salvar meses preenchidos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Aba Mensal ===== */}
      {aba === 'MENSAL' && (
        <>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Resumo mensal</span>
            <select
              className="form-input"
              style={{ width: 150, padding: '5px 10px', fontSize: 13 }}
              value={String(mesSel)}
              onChange={(e) => setMesSel(Number(e.target.value))}
            >
              {MESES_ANO.map((nome, i) => (
                <option key={nome} value={String(i + 1)}>{nome} · {ano}</option>
              ))}
            </select>
          </div>

          {mensalLoading ? (
            <div className="loading-state">Carregando mês…</div>
          ) : infoMes.semDados ? (
            <div className="empty-state">
              Nenhum faturamento lançado em {MESES_ANO[mesSel - 1]} de {ano}. Use “+ Cadastrar mês”
              ou “Preencher ano” para registrar o faturamento consolidado.
            </div>
          ) : (
            <>
              <div className="grid-4">
                <Card title="Faturamento do Mês" value={brl(infoMes.faturamento)} hint={`${MESES_ANO[mesSel - 1]} de ${ano}`} variant="brand" />
                <Card title="Pedidos do Mês" value={int(infoMes.pedidos)} hint="Total consolidado do mês" variant="info" />
                <Card title="Ticket Médio" value={brl(infoMes.ticketMedio)} hint="Faturamento ÷ pedidos" />
                <Card title="Lucro Estimado" value={brl(lucroEstimado)} hint="Após custos fixos e variáveis" variant={lucroEstimado === null ? 'info' : lucroPositivo ? 'success' : 'danger'} />
              </div>

              <div className="grid-4" style={{ marginTop: 4 }}>
                <Card title="Média Diária de Faturamento" value={brl(infoMes.mediaDiariaFat)} hint={`Faturamento ÷ ${diasNoMes(ano, mesSel)} dias do mês`} variant="info" />
                <Card title="Média Diária de Pedidos" value={int(Math.round(infoMes.mediaDiariaPedidos))} hint={`Pedidos ÷ ${diasNoMes(ano, mesSel)} dias do mês`} variant="info" />
                <Card title="Margem Estimada" value={pct1(margemEstimada)} hint="Lucro ÷ faturamento" variant={margemEstimada === null ? 'info' : margemEstimada >= 0 ? 'success' : 'danger'} />
                <Card
                  title="Ponto de Equilíbrio"
                  value={brl(infoMes.pontoEquilibrio)}
                  hint={infoMes.pontoEquilibrio === null ? 'Margem insuficiente para calcular' : 'Faturamento mínimo do mês'}
                  variant={infoMes.pontoEquilibrio === null ? 'warn' : 'info'}
                />
              </div>

              <div className="section-title">Comparação com o Ponto de Equilíbrio</div>
              <div className="grid-2">
                <div className="card">
                  <div className="card-label">Resultado Estimado</div>
                  <MetricRow label="Faturamento"><span style={{ fontWeight: 600 }}>{brl(infoMes.faturamento)}</span></MetricRow>
                  <MetricRow label="Custos fixos">{infoMes.custosFixos === null ? '—' : `− ${brl(infoMes.custosFixos)}`}</MetricRow>
                  <MetricRow label="Custos variáveis estimados">{infoMes.custosVariaveis === null ? '—' : `− ${brl(infoMes.custosVariaveis)}`}</MetricRow>
                  <MetricRow label="Lucro estimado">
                    <span style={{ fontWeight: 600 }} className={lucroEstimado === null ? 'clr-muted' : lucroPositivo ? 'clr-green' : 'clr-red'}>{brl(lucroEstimado)}</span>
                  </MetricRow>
                  <MetricRow label="Margem estimada">
                    {margemEstimada === null ? <span className="clr-muted">—</span> : <span className={lucroPositivo ? 'clr-green' : 'clr-red'}>{pct1(margemEstimada)}</span>}
                  </MetricRow>
                </div>

                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div className="card-label" style={{ marginBottom: 0 }}>Ponto de Equilíbrio</div>
                    {peBadgeMes && <span className={'badge ' + peBadgeMes.cls}>{peBadgeMes.label}</span>}
                  </div>
                  <MetricRow label="Ponto de equilíbrio do mês"><span style={{ fontWeight: 600 }}>{brl(infoMes.pontoEquilibrio)}</span></MetricRow>
                  <MetricRow label="Faturamento do mês">{brl(infoMes.faturamento)}</MetricRow>
                  <MetricRow label="Resultado vs equilíbrio">
                    {infoMes.resultadoVsEquilibrio === null
                      ? <span className="clr-muted">—</span>
                      : <span style={{ fontWeight: 600 }} className={infoMes.resultadoVsEquilibrio >= 0 ? 'clr-green' : 'clr-red'}>{brl(infoMes.resultadoVsEquilibrio)}</span>}
                  </MetricRow>
                  <MetricRow label="Percentual do equilíbrio">{pct1(infoMes.percentualEquilibrio)}</MetricRow>
                  <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                    {infoMes.pontoEquilibrio === null ? (
                      <span className="clr-red">{infoMes.mensagemOperacao ?? 'Margem de contribuição insuficiente para calcular o equilíbrio.'}</span>
                    ) : infoMes.resultadoVsEquilibrio >= 0 ? (
                      <span className="clr-green">Faturamento acima do ponto de equilíbrio neste mês.</span>
                    ) : (
                      <span className="clr-orange">Faltam {brl(Math.abs(infoMes.resultadoVsEquilibrio))} para atingir o ponto de equilíbrio.</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 6, lineHeight: 1.5 }}>
                    O ponto de equilíbrio usa o CMV alvo configurado como base operacional.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => openEditarMes(mesSel, infoMes)}>Editar mês</button>
                <button type="button" className="btn btn-danger" onClick={() => setMesParaExcluir(mesSel)}>Excluir mês</button>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== Aba Anual ===== */}
      {aba === 'ANUAL' && (
        <>
          <div className="section-title">Visão Anual · {ano}</div>
          {anualLoading || anualData === null ? (
            <div className="loading-state">Carregando visão anual…</div>
          ) : (
            <div className="table-card">
              <table className="hb-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Faturamento</th>
                    <th>Pedidos</th>
                    <th>Ticket médio</th>
                    <th>Média diária</th>
                    <th>Ponto de equilíbrio</th>
                    <th>Diferença</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {MESES_ANO.map((nomeMes, i) => {
                    const m = mesesInfo[i]
                    const badge = m.status ? PE_BADGE[m.status] : null
                    return (
                      <tr key={nomeMes}>
                        <td style={{ fontWeight: 500, color: m.semDados ? '#aaa' : 'var(--app-text)' }}>{nomeMes}</td>
                        <td style={{ fontWeight: 500 }}>{m.semDados ? <span className="clr-muted">R$ 0,00</span> : brl(m.faturamento)}</td>
                        <td>{m.semDados ? <span className="clr-muted">—</span> : int(m.pedidos)}</td>
                        <td>{m.ticketMedio === null ? <span className="clr-muted">—</span> : brl(m.ticketMedio)}</td>
                        <td>{m.semDados ? <span className="clr-muted">—</span> : brl(m.mediaDiariaFat)}</td>
                        <td>{m.pontoEquilibrio === null ? <span className="clr-muted">—</span> : brl(m.pontoEquilibrio)}</td>
                        <td>
                          {m.resultadoVsEquilibrio === null || m.semDados
                            ? <span className="clr-muted">—</span>
                            : <span style={{ fontWeight: 600 }} className={m.resultadoVsEquilibrio >= 0 ? 'clr-green' : 'clr-red'}>{brl(m.resultadoVsEquilibrio)}</span>}
                        </td>
                        <td>
                          {m.semDados
                            ? <span className="badge badge-gray">Sem lançamento</span>
                            : badge
                            ? <span className={'badge ' + badge.cls}>{badge.label}</span>
                            : <span className="clr-muted">—</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => openEditarMes(i + 1, m)}>
                              {m.semDados ? 'Lançar' : 'Editar'}
                            </button>
                            {!m.semDados && (
                              <button type="button" className="btn btn-danger" onClick={() => setMesParaExcluir(i + 1)}>Excluir</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #eee' }}>
                    <td style={{ fontWeight: 700, color: 'var(--app-text)' }}>Total do ano</td>
                    <td style={{ fontWeight: 700 }} className="clr-orange">{brl(totalAnoFaturamento)}</td>
                    <td style={{ fontWeight: 600 }}>{int(totalAnoPedidos)}</td>
                    <td style={{ fontWeight: 600 }}>{ticketMedioAno === null ? <span className="clr-muted">—</span> : brl(ticketMedioAno)}</td>
                    <td colSpan={5} style={{ fontSize: 11.5, color: '#999' }}>
                      {mesesComDados.length} {mesesComDados.length === 1 ? 'mês' : 'meses'} com lançamento em {ano}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 8, lineHeight: 1.5 }}>
            O ponto de equilíbrio de cada mês é estimado com os custos fixos e variáveis ativos e o
            CMV alvo configurado — a mesma regra da tela Ponto de Equilíbrio.
          </div>
        </>
      )}
    </div>
  )
}
