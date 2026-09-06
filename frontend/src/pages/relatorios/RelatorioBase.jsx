import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import SeletorPeriodo, { rangeDoPreset } from '../../components/relatorios/SeletorPeriodo'

// Shell comum aos relatórios que reusam o visual do Dashboard (Meta Ads, Cardápio):
// cabeçalho (logo + título + seletor de período) + busca no HUB + estados de
// carregando/erro. `children` é uma render-prop: (dados, carregando) => JSX — quem
// chama decide qual seção desenhar (SecaoMetaAds, SecaoVendasCardapio, ...).
export default function RelatorioBase({ titulo, logoSrc, endpoint, semConta, presetInicial = 'last_14d', children }) {
  const { empresaAtual } = useAuth()
  const [periodo, setPeriodo] = useState(() => rangeDoPreset(presetInicial))
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const buscar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const { data } = await api.get(endpoint, { params: { since: periodo.since, until: periodo.until } })
      setDados(data)
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível carregar o relatório agora.')
      setDados(null)
    } finally {
      setCarregando(false)
    }
  }, [endpoint, periodo.since, periodo.until, empresaAtual])

  useEffect(() => { buscar() }, [buscar])

  const primeiraCarga = carregando && !dados

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
      ) : (
        children(dados, carregando)
      )}
    </div>
  )
}
