import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import SeletorPeriodo, { rangeDoPreset } from '../../components/relatorios/SeletorPeriodo'
import KpiCard from '../../components/relatorios/KpiCard'
import GraficoEvolucao from '../../components/relatorios/GraficoEvolucao'
import { brl, num, x2, brlExato } from '../../components/relatorios/formatos'

// Formatador do VALOR exibido no KpiCard, por tipo do contrato.
const fmtValor = {
  brl: (n) => brl(n),
  num: (n) => num(n),
  x: (n) => x2(n),
  pct: (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
}
// Formatador da variação ABSOLUTA (sempre valor positivo já vem do KpiCard).
const fmtAbs = {
  brl: (n) => brlExato(n),
  num: (n) => num(n),
  x: (n) => x2(n),
  pct: (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
}

function SemConta({ titulo }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--app-text)', marginBottom: 6 }}>{titulo}</div>
      <div style={{ color: '#737373', fontSize: 14, maxWidth: 420, margin: '0 auto' }}>
        Assim que a agência conectar esta fonte à sua loja, o relatório aparece aqui automaticamente.
      </div>
    </div>
  )
}

export default function RelatorioShell({ fonte, titulo, logoSrc, semContaTitulo }) {
  const { empresaAtual } = useAuth()
  const [periodo, setPeriodo] = useState(() => rangeDoPreset('last_30d'))
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const buscar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const { data } = await api.get(`/relatorios/${fonte}`, { params: { since: periodo.since, until: periodo.until } })
      setDados(data)
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível carregar o relatório agora.')
      setDados(null)
    } finally {
      setCarregando(false)
    }
  }, [fonte, periodo.since, periodo.until, empresaAtual])

  useEffect(() => { buscar() }, [buscar])

  const primeiraCarga = carregando && !dados
  const conectado = dados?.conectado
  const kpis = Array.isArray(dados?.kpis) ? dados.kpis : []
  const serie = Array.isArray(dados?.serie) ? dados.serie : []
  const serieConfig = Array.isArray(dados?.serieConfig) ? dados.serieConfig : []
  // Formatador do tooltip do gráfico: usa o formato do 1º KPI que casa com a chave da série (fallback num).
  const fmtSerie = (() => {
    const chave = serieConfig[0]?.chave
    const k = kpis.find((x) => x.chave === chave)
    return fmtValor[k?.formato] || num
  })()

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {logoSrc && <img src={logoSrc} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />}
          <h1 style={{ margin: 0 }}>{titulo}</h1>
        </div>
        <SeletorPeriodo valor={periodo} onChange={setPeriodo} />
      </div>

      {primeiraCarga ? (
        <div className="loading-state" style={{ padding: '64px 20px' }}>Carregando o relatório…</div>
      ) : erro ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: 6 }}>Ops…</div>
          <div style={{ color: '#737373', fontSize: 14, marginBottom: 16 }}>{erro}</div>
          <button type="button" className="btn btn-secondary" onClick={buscar}>Tentar de novo</button>
        </div>
      ) : !conectado ? (
        <SemConta titulo={semContaTitulo} />
      ) : (
        <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
          {dados?.sincronizando && (
            <div className="card" style={{ marginBottom: 16, fontSize: 13.5, color: '#737373' }}>
              Estamos preparando seus dados pela primeira vez — isso pode levar alguns minutos. Atualize a página em instantes.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            {kpis.map((k) => (
              <KpiCard
                key={k.chave}
                label={k.label}
                valor={(fmtValor[k.formato] || num)(k.valor)}
                atual={k.valor}
                anterior={k.anterior}
                formatAbs={fmtAbs[k.formato] || num}
                modo={k.modo || 'bom-sobe'}
              />
            ))}
          </div>
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)', marginBottom: 10 }}>Evolução no período</div>
            <GraficoEvolucao serie={serie} serieConfig={serieConfig} formatValor={fmtSerie} />
          </div>
        </div>
      )}
    </div>
  )
}
