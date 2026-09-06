import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { brl, brlExato, num } from '../components/relatorios/formatos'
import ContagemEstoque from '../components/cmv/ContagemEstoque'
import Compras from '../components/cmv/Compras'
import Toast from '../components/Toast'
import InputMoeda from '../components/InputMoeda'

// Página base do CMV Global (Gestão): seletor de mês/ano + card de resultado +
// gráfico de evolução + Contagem de estoque (Task 6) + Compras do mês (Task 7) +
// Faturamento do mês (Task 8, integrado com Gestão › Faturamento). Rota/sidebar
// também são da Task 8 (App.jsx e Sidebar.jsx).

const MESES_ANO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function anoAtual() {
  return String(new Date().getFullYear())
}
function mesAtualNum() {
  return new Date().getMonth() + 1
}
// Rótulo curto MM/AA (ex.: 07/26) para o eixo do gráfico de evolução.
function mesCurto(ano, mes) {
  return `${String(mes).padStart(2, '0')}/${String(ano).slice(-2)}`
}
function formatDiffPontos(diffPontos) {
  const v = Number(diffPontos) || 0
  const sinal = v > 0 ? '+' : ''
  return `${sinal}${v.toFixed(1).replace('.', ',')} p.p.`
}

// ===== Upsert do faturamento mensal (Task 8) =====
// Mesma convenção de Faturamento.jsx (upsertMes): 1 registro por mês/ano em
// YYYY-MM-01, canal "MENSAL". Atualiza o registro canônico quando já existe
// (evitando duplicidade) e consolida (soft delete) registros legados do mês.
// `quantidadePedidos` mantém o valor já existente no canônico (ou 0, quando
// o mês ainda não tem lançamento) — este campo não é editado aqui.
async function upsertFaturamentoMes(anoN, mesN, valorTotal) {
  const mm = `${anoN}-${String(mesN).padStart(2, '0')}`
  const dataDia01 = `${mm}-01`
  const { data: existentes } = await api.get('/faturamento', { params: { mes: mm } })
  const lista = Array.isArray(existentes) ? existentes : []
  const canonico = lista.find((r) => String(r.data).slice(0, 10) === dataDia01) ?? lista[0] ?? null
  const payload = {
    data: dataDia01,
    valorTotal: Number(valorTotal),
    quantidadePedidos: canonico ? Number(canonico.quantidadePedidos) || 0 : 0,
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

// ===== Badge de meta (verde dentro da meta, vermelho acima) =====
function MetaBadge({ resultado }) {
  if (!resultado || !resultado.statusMeta) return null
  if (resultado.statusMeta === 'ok') {
    return <span className="badge badge-green">Dentro da meta</span>
  }
  return <span className="badge badge-red">{formatDiffPontos(resultado.diffPontos)} acima da meta</span>
}

// ===== Gráfico de evolução — linha do CMV % por mês, sem lib (SVG puro) =====
const EVO_W = 640
const EVO_H = 170
const EVO_P = 24

function EvolucaoChart({ evolucao, meta }) {
  const pontos = Array.isArray(evolucao) ? evolucao : []
  const valores = pontos
    .map((p) => p.cmvPercent)
    .filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v)))

  if (valores.length === 0) {
    return (
      <div className="empty-state">
        Sem dados suficientes para a evolução ainda (é preciso contagem de estoque de dois meses seguidos).
      </div>
    )
  }

  const metaN = meta === null || meta === undefined ? null : Number(meta)
  const maxVal = Math.max(...valores, metaN || 0) * 1.15 || 100
  const n = pontos.length
  const x = (i) => (n === 1 ? EVO_W / 2 : EVO_P + (i / (n - 1)) * (EVO_W - EVO_P * 2))
  const y = (v) => EVO_P + (1 - Number(v) / maxVal) * (EVO_H - EVO_P * 2)

  // Constrói a linha pulando meses sem cmvPercent (vira um "corte" no traçado).
  let linha = ''
  let aberto = false
  pontos.forEach((p, i) => {
    if (p.cmvPercent === null || p.cmvPercent === undefined) { aberto = false; return }
    const px = x(i).toFixed(1)
    const py = y(p.cmvPercent).toFixed(1)
    linha += aberto ? ` L${px},${py}` : `M${px},${py}`
    aberto = true
  })

  const metaY = metaN !== null ? y(metaN) : null

  return (
    <div>
      <svg
        viewBox={`0 0 ${EVO_W} ${EVO_H}`}
        width="100%"
        height={EVO_H}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {metaY !== null && (
          <>
            <line
              x1={EVO_P} y1={metaY.toFixed(1)} x2={EVO_W - EVO_P} y2={metaY.toFixed(1)}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4"
            />
            <text x={EVO_W - EVO_P} y={metaY - 6} textAnchor="end" fontSize="10" fill="#94a3b8">
              Meta {num(metaN)}%
            </text>
          </>
        )}
        {linha && (
          <path
            d={linha} fill="none" stroke="#f97316" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          />
        )}
        {pontos.map((p, i) => (
          p.cmvPercent === null || p.cmvPercent === undefined ? null : (
            <circle key={`${p.ano}-${p.mes}`} cx={x(i).toFixed(1)} cy={y(p.cmvPercent).toFixed(1)} r="3" fill="#f97316" />
          )
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#a3a3a3' }}>
        {pontos.map((p) => <span key={`${p.ano}-${p.mes}`}>{mesCurto(p.ano, p.mes)}</span>)}
      </div>
    </div>
  )
}

export default function CmvGlobal() {
  const [ano, setAno] = useState(anoAtual())
  const [mesSel, setMesSel] = useState(mesAtualNum())
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  // ===== Faturamento do mês (Task 8): edição inline do card de resultado =====
  const [editandoFaturamento, setEditandoFaturamento] = useState(false)
  const [faturamentoInput, setFaturamentoInput] = useState('')
  const [erroFaturamento, setErroFaturamento] = useState(null)
  const [salvandoFaturamento, setSalvandoFaturamento] = useState(false)
  const [toastFaturamento, setToastFaturamento] = useState(null)

  // Exportável para as próximas seções (contagem/compras/faturamento)
  // chamarem depois de salvar — refaz o fetch de /api/cmv do mês atual.
  const recarregar = useCallback((anoParam = ano, mesParam = mesSel) => {
    setCarregando(true)
    setErro(null)
    return api
      .get('/cmv', { params: { ano: anoParam, mes: mesParam } })
      .then((r) => setDados(r.data))
      .catch((err) => {
        setDados(null)
        setErro(
          err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.response?.data?.error ?? err?.message ?? 'Erro ao carregar o CMV Global.'
        )
      })
      .finally(() => setCarregando(false))
  }, [ano, mesSel])

  useEffect(() => {
    recarregar(ano, mesSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mesSel])

  const resultado = dados?.resultado ?? null

  // Fecha o form de edição de faturamento sempre que o mês/ano em tela muda
  // (troca do seletor no cabeçalho dispara recarregar() e atualiza
  // dados.ano/dados.mes) — sem isso, um valor digitado no mês antigo podia
  // ser salvo no mês novo em handleSalvarFaturamento (que usa dados.ano/mes).
  // Mesmo padrão do efeito de pré-preenchimento em ContagemEstoque.jsx.
  useEffect(() => {
    setEditandoFaturamento(false)
    setErroFaturamento(null)
  }, [dados?.ano, dados?.mes])

  // dados.ano/dados.mes (não ano/mesSel do seletor) — mesmo cuidado da
  // Contagem de estoque e Compras: salva sempre no mês que está realmente em
  // tela, mesmo numa troca de mês em trânsito.
  function abrirEdicaoFaturamento() {
    setFaturamentoInput(dados?.faturamento ?? 0)
    setErroFaturamento(null)
    setEditandoFaturamento(true)
  }

  function cancelarEdicaoFaturamento() {
    setEditandoFaturamento(false)
    setErroFaturamento(null)
  }

  function handleSalvarFaturamento(e) {
    e.preventDefault()
    const anoAlvo = dados?.ano
    const mesAlvo = dados?.mes
    if (!Number.isInteger(anoAlvo) || !Number.isInteger(mesAlvo)) return

    // Valida antes de qualquer coisa: campo vazio/inválido NÃO salva (evita
    // sobrescrever o faturamento já lançado com zero acidentalmente).
    if (faturamentoInput === '' || !Number.isFinite(Number(faturamentoInput))) {
      setErroFaturamento('Informe um valor de faturamento válido.')
      return
    }
    const valor = Number(faturamentoInput)
    if (valor < 0) {
      setErroFaturamento('Faturamento deve ser maior ou igual a zero.')
      return
    }

    setErroFaturamento(null)
    setSalvandoFaturamento(true)
    upsertFaturamentoMes(anoAlvo, mesAlvo, valor)
      .then(() => recarregar())
      .then(() => {
        setEditandoFaturamento(false)
        setToastFaturamento({ message: 'Faturamento do mês salvo com sucesso.', type: 'success' })
      })
      .catch((err) => {
        setErroFaturamento(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar o faturamento.')
      })
      .finally(() => setSalvandoFaturamento(false))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>CMV Global</h1>
          <div className="page-header-sub">Consumo de estoque sobre o faturamento, comparado com a meta.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAno(String(Number(ano) - 1))} aria-label="Ano anterior">‹</button>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)', minWidth: 44, textAlign: 'center' }}>{ano}</span>
            <button type="button" className="btn btn-secondary" onClick={() => setAno(String(Number(ano) + 1))} aria-label="Próximo ano">›</button>
          </div>
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
      </div>

      {erro && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-red">{erro}</div>
        </div>
      )}

      {carregando && !dados ? (
        <div className="loading-state">Carregando CMV Global…</div>
      ) : !dados ? (
        <div className="empty-state">Não foi possível carregar os dados de {MESES_ANO[mesSel - 1]} de {ano}.</div>
      ) : (
        <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
          {/* ===== Card de resultado ===== */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-label">CMV Global · {MESES_ANO[mesSel - 1]} de {ano}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              <div className="card-value" style={{ fontSize: 40, lineHeight: 1 }}>
                {resultado?.cmvPercent === null || resultado?.cmvPercent === undefined
                  ? '—'
                  : `${num(resultado.cmvPercent)}%`}
              </div>
              <MetaBadge resultado={resultado} />
            </div>
            <div className="card-hint">Meta configurada: {num(dados.meta)}%</div>

            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--app-text-2)', lineHeight: 1.6 }}>
              Estoque inicial {brlExato(dados.estoqueInicial)} + Compras {brlExato(dados.compras?.total)} − Estoque final {brlExato(dados.estoqueFinal)}
              {' = '}Consumo <strong style={{ color: 'var(--app-text)' }}>{brlExato(resultado?.consumo)}</strong>
            </div>
            <div style={{ fontSize: 13, color: 'var(--app-text-2)' }}>
              Faturamento {brl(dados.faturamento)}
            </div>

            {!dados.temContagemAnterior && (
              <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 10, lineHeight: 1.5 }}>
                Ainda não há contagem de estoque do mês anterior — o estoque inicial fica zerado até que ela seja registrada.
              </div>
            )}
          </div>

          {/* ===== Gráfico de evolução ===== */}
          <div className="section-title">Evolução do CMV %</div>
          <div className="card">
            <EvolucaoChart evolucao={dados.evolucao} meta={dados.meta} />
          </div>

          {/* ===== Contagem de estoque ===== */}
          <ContagemEstoque dados={dados} recarregar={recarregar} />

          {/* ===== Compras do mês ===== */}
          <Compras dados={dados} recarregar={recarregar} />

          {/* ===== Faturamento do mês (Task 8) ===== */}
          <div className="section-title">Faturamento do mês</div>
          <div className="card" style={{ marginBottom: 16 }}>
            <Toast message={toastFaturamento?.message} type={toastFaturamento?.type} onClose={() => setToastFaturamento(null)} />

            {editandoFaturamento ? (
              <form onSubmit={handleSalvarFaturamento}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                    <label className="form-label">Faturamento de {MESES_ANO[mesSel - 1]} de {ano} (R$)</label>
                    <InputMoeda
                      className="form-input"
                      valor={faturamentoInput}
                      onChange={setFaturamentoInput}
                      placeholder="0,00"
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={cancelarEdicaoFaturamento} disabled={salvandoFaturamento}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={salvandoFaturamento}>
                      {salvandoFaturamento ? 'Salvando…' : 'Salvar faturamento'}
                    </button>
                  </div>
                </div>
                {erroFaturamento && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{erroFaturamento}</div>
                  </div>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="card-label">Faturamento de {MESES_ANO[mesSel - 1]} de {ano}</div>
                  <div className="card-value" style={{ fontSize: 28 }}>{brlExato(dados.faturamento)}</div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={abrirEdicaoFaturamento}>
                  Editar faturamento
                </button>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: '#999', marginTop: 12, lineHeight: 1.5 }}>
              Integrado com Gestão › Faturamento — um único lançamento consolidado por mês
              (canal "Mensal"), sem duplicar os registros já existentes.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
