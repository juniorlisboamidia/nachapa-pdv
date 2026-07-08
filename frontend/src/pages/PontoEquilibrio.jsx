import { useEffect, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const intFormatter = new Intl.NumberFormat('pt-BR')
const pctFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function int(value) {
  if (value === null || value === undefined) return '—'
  return intFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${pctFormatter.format(Number(value))}%`
}
function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatMesLabel(mes) {
  if (!mes) return ''
  const [ano, m] = mes.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const idx = Number(m) - 1
  return meses[idx] ? `${meses[idx]} · ${ano}` : mes
}

const STATUS_CONFIG = {
  MARGEM_INSUFICIENTE: {
    alert: 'alert-red', clr: 'clr-red', badge: 'badge-red',
    label: 'Margem insuficiente'
  },
  ACIMA_DO_EQUILIBRIO: {
    alert: 'alert-green', clr: 'clr-green', badge: 'badge-green',
    label: 'Acima do equilíbrio'
  },
  PROXIMO_DO_EQUILIBRIO: {
    alert: 'alert-yellow', clr: 'clr-yellow', badge: 'badge-yellow',
    label: 'Próximo do equilíbrio'
  },
  ABAIXO_DO_EQUILIBRIO: {
    alert: 'alert-gray', clr: 'clr-blue', badge: 'badge-blue',
    label: 'Abaixo do equilíbrio'
  }
}

export default function PontoEquilibrio() {
  const [mes, setMes] = useState(mesAtual())
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load(mesParam = mes) {
    setLoading(true)
    setError(null)
    api
      .get('/ponto-equilibrio', { params: { mes: mesParam } })
      .then((r) => { setDados(r.data); setLoading(false) })
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

  useEffect(() => { load(mes) }, [mes])

  const statusCfg = dados?.status ? STATUS_CONFIG[dados.status] : null
  const margemInsuficiente =
    dados?.margemContribuicaoReal !== null &&
    dados?.margemContribuicaoReal !== undefined &&
    Number(dados.margemContribuicaoReal) <= 0
  const acimaDoEquilibrio =
    dados?.diferencaParaEquilibrio !== null &&
    dados?.diferencaParaEquilibrio !== undefined &&
    Number(dados.diferencaParaEquilibrio) <= 0
  const percentualAtingidoNum =
    dados?.percentualAtingido === null || dados?.percentualAtingido === undefined
      ? null
      : Number(dados.percentualAtingido)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ponto de Equilíbrio</h1>
          <div className="page-header-sub">Faturamento mínimo para cobrir todos os custos</div>
        </div>
        <span className="badge is-success">Análise Mensal</span>
      </div>

      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          padding: '12px 16px'
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--app-text-2)', fontWeight: 500 }}>Mês de referência</span>
        <input
          type="month"
          className="form-input"
          value={mes}
          onChange={(e) => setMes(e.target.value || mesAtual())}
          style={{ width: 180 }}
        />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa' }}>
          {loading ? 'Carregando…' : !error && dados ? `${int(dados.totalPedidos)} pedido(s) no mês` : ''}
        </span>
      </div>

      {error ? (
        <div className="alert alert-red">
          <div>
            <div className="alert-title clr-red">Não foi possível carregar o ponto de equilíbrio</div>
            <div className="alert-msg">{error}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => load(mes)}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">Calculando ponto de equilíbrio…</div>
      ) : !dados ? (
        <div className="empty-state">Nenhum dado disponível para {formatMesLabel(mes)}.</div>
      ) : (
        <>
          {statusCfg && (
            <div className={`alert ${statusCfg.alert}`} style={{ marginBottom: 16 }}>
              <div>
                <div className={`alert-title ${statusCfg.clr}`}>
                  Diagnóstico · {statusCfg.label}
                </div>
                <div className="alert-msg">{dados.mensagem ?? '—'}</div>
                {margemInsuficiente && (
                  <div className="alert-msg" style={{ marginTop: 4 }}>
                    Com a margem de contribuição em {pct(dados.margemContribuicaoReal)}, o ponto
                    de equilíbrio não pode ser calculado: cada venda não sobra valor para cobrir
                    os custos fixos.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="section-title">Resultado Principal · {formatMesLabel(mes)}</div>
          <div className="grid-4">
            <Card
              title="Ponto de Equilíbrio"
              value={dados.pontoEquilibrio === null || dados.pontoEquilibrio === undefined
                ? 'Indisponível'
                : brl(dados.pontoEquilibrio)}
              hint={margemInsuficiente ? 'Margem insuficiente para o cálculo' : 'Faturamento mínimo no mês'}
              variant={margemInsuficiente ? 'danger' : 'brand'}
            />
            <Card
              title="Faturamento Atual"
              value={brl(dados.faturamentoAtual)}
              hint={`${int(dados.totalPedidos)} pedido(s) no mês`}
              variant="info"
            />
            <Card
              title="% Atingido"
              value={pct(dados.percentualAtingido)}
              hint="Faturamento atual / ponto de equilíbrio"
              variant={
                percentualAtingidoNum === null
                  ? 'danger'
                  : percentualAtingidoNum >= 100
                  ? 'success'
                  : percentualAtingidoNum >= 80
                  ? 'warn'
                  : 'danger'
              }
            />
            <Card
              title="Diferença para o Equilíbrio"
              value={dados.diferencaParaEquilibrio === null || dados.diferencaParaEquilibrio === undefined
                ? 'Indisponível'
                : brl(Math.abs(Number(dados.diferencaParaEquilibrio)))}
              hint={
                dados.diferencaParaEquilibrio === null || dados.diferencaParaEquilibrio === undefined
                  ? 'Depende do ponto de equilíbrio'
                  : acimaDoEquilibrio
                  ? 'Acima do ponto de equilíbrio'
                  : 'Faltam para o equilíbrio'
              }
              variant={
                dados.diferencaParaEquilibrio === null || dados.diferencaParaEquilibrio === undefined
                  ? 'danger'
                  : acimaDoEquilibrio
                  ? 'success'
                  : 'warn'
              }
            />
          </div>

          <div className="section-title">Composição do Cálculo</div>
          <div className="grid-4">
            <Card
              title="Custos Fixos"
              value={brl(dados.totalCustosFixos)}
              hint="Total mensal ativo"
              variant="brand"
            />
            <Card
              title="CMV Alvo Usado"
              value={pct(dados.cmvAlvoUsado)}
              hint={`Base do PE · real médio dos produtos: ${pct(dados.cmvMedioRealProdutos)}`}
              variant="info"
            />
            <Card
              title="Margem de Contribuição"
              value={pct(dados.margemContribuicaoReal)}
              hint="100% − CMV alvo − custos variáveis"
              variant={margemInsuficiente ? 'danger' : 'success'}
            />
            <Card
              title="Custos Variáveis Estimados"
              value={pct(
                dados.custosVariaveisPercentuais === null || dados.custosVariaveisPercentuais === undefined
                  ? null
                  : Number(dados.custosVariaveisPercentuais ?? 0) +
                    Number(dados.percentualCustosPorPedido ?? 0) +
                    Number(dados.percentualCustosFixosMensaisVariaveis ?? 0)
              )}
              hint="% total sobre o faturamento"
              variant="warn"
            />
          </div>

          {dados.mensagemBaseCalculo && (
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
              {dados.mensagemBaseCalculo}
            </div>
          )}
          {dados.avisoCmvReal && (
            <div className="alert alert-yellow" style={{ marginTop: 10 }}>
              <div className="alert-msg clr-yellow">{dados.avisoCmvReal}</div>
            </div>
          )}

          <div className="section-title">Detalhamento dos Custos Variáveis</div>
          <div className="table-card">
            <table className="hb-table">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th>Valor</th>
                  <th>% sobre faturamento</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>Percentuais sobre faturamento</td>
                  <td className="clr-muted">—</td>
                  <td>{pct(dados.custosVariaveisPercentuais)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>Soma por pedido</td>
                  <td>{brl(dados.somaCustosPorPedido)}</td>
                  <td className="clr-muted">por pedido</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>Total por pedido no mês</td>
                  <td>{brl(dados.custoVariavelPedidosTotal)}</td>
                  <td>{pct(dados.percentualCustosPorPedido)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>Fixos mensais variáveis</td>
                  <td>{brl(dados.custosVariaveisFixosMensais)}</td>
                  <td>{pct(dados.percentualCustosFixosMensaisVariaveis)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
