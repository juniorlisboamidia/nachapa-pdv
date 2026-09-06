import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import SeletorPeriodo, { rangeDoPreset } from '../../components/relatorios/SeletorPeriodo'
import SecaoVendasCardapio from '../../components/relatorios/SecaoVendasCardapio'
import AnaliseClientes from '../../components/relatorios/AnaliseClientes'
import HistoricoFaltas from '../../components/relatorios/HistoricoFaltas'

// Busca um endpoint do cardápio com o período; re-busca ao trocar loja/período.
function useDadosCardapio(endpoint, periodo) {
  const { empresaAtual } = useAuth()
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
    } finally { setCarregando(false) }
  }, [endpoint, periodo.since, periodo.until, empresaAtual])
  useEffect(() => { buscar() }, [buscar])
  return { dados, carregando, erro, buscar }
}

function EstadoErro({ erro, onRetry }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: 6 }}>Ops…</div>
      <div style={{ color: '#737373', fontSize: 14, marginBottom: 16 }}>{erro}</div>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>Tentar de novo</button>
    </div>
  )
}

function AbaGeral({ periodo }) {
  const { dados, carregando, erro, buscar } = useDadosCardapio('/dashboard/cardapio', periodo)
  if (carregando && !dados) return <div className="loading-state" style={{ padding: '64px 20px' }}>Carregando o relatório…</div>
  if (erro) return <EstadoErro erro={erro} onRetry={buscar} />
  return <SecaoVendasCardapio dados={dados} carregando={carregando} />
}

function AbaClientes({ periodo }) {
  // Reusa o dashboard (que já traz `clientes`) — só renderiza a análise de CRM.
  const { dados, carregando, erro, buscar } = useDadosCardapio('/dashboard/cardapio', periodo)
  if (carregando && !dados) return <div className="loading-state" style={{ padding: '64px 20px' }}>Carregando clientes…</div>
  if (erro) return <EstadoErro erro={erro} onRetry={buscar} />
  return <AnaliseClientes clientes={dados?.clientes} />
}

function AbaHistorico({ periodo }) {
  const { dados, carregando, erro, buscar } = useDadosCardapio('/dashboard/cardapio-faltas-historico', periodo)
  if (carregando && !dados) return <div className="loading-state" style={{ padding: '64px 20px' }}>Carregando o histórico…</div>
  if (erro) return <EstadoErro erro={erro} onRetry={buscar} />
  return <HistoricoFaltas dados={dados} carregando={carregando} />
}

const ABAS = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'historico', label: 'Histórico de pausas' },
]

export default function RelatorioCardapio() {
  const [aba, setAba] = useState('geral')
  const [periodo, setPeriodo] = useState(() => rangeDoPreset('this_week'))
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/cardapio-web.webp" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <h1 style={{ margin: 0 }}>Resumo do período</h1>
        </div>
        <SeletorPeriodo valor={periodo} onChange={setPeriodo} />
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #eee', marginBottom: 18 }}>
        {ABAS.map((a) => (
          <button
            key={a.id} type="button" onClick={() => setAba(a.id)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 16px', marginBottom: -1,
              fontSize: 13.5, fontWeight: aba === a.id ? 700 : 500,
              color: aba === a.id ? '#ea580c' : '#737373',
              borderBottom: `2px solid ${aba === a.id ? '#ea580c' : 'transparent'}`,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'geral' ? <AbaGeral periodo={periodo} /> : aba === 'clientes' ? <AbaClientes periodo={periodo} /> : <AbaHistorico periodo={periodo} />}
    </div>
  )
}
