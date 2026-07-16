// Ferramentas › Etiquetas — rotulagem de alimentos manipulados (ANVISA RDC 216/2004).
// Duas abas: Configuração (identificação do estabelecimento + validade padrão
// por conservação) e Itens (conservação/validade própria por insumo, quando
// difere da regra). As abas "Painel" (imprimir) e "Histórico" entram na Task 8.
// Sem sub-rota na sidebar (item único "Etiquetas") — a troca de aba é local,
// por isso navega via useNavigate em vez de itens de menu.
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'

const TABS = [
  { id: 'config', label: 'Configuração' },
  { id: 'itens', label: 'Itens' },
]
const TAB_IDS = TABS.map((t) => t.id)

// A API só devolve o código da conservação (enum ConservacaoTipo) — os rótulos
// de exibição ficam no front.
const CONS_LABEL = {
  CONGELADO: 'Congelado',
  RESFRIADO_0_4: 'Resfriado (0 a 4 °C)',
  RESFRIADO_4_6: 'Resfriado (4 a 6 °C)',
  AMBIENTE: 'Ambiente (seco)',
  DESCONGELADO: 'Descongelado',
  ABERTO: 'Produto aberto',
}

export default function Etiquetas() {
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const tab = TAB_IDS.includes(tabParam) ? tabParam : 'config'
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => setToast({ message, type })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Etiquetas</h1>
          <div className="page-header-sub">Rotulagem de alimentos manipulados conforme ANVISA (RDC 216/2004).</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="modal-tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'av-tab' + (tab === t.id ? ' active' : '')}
            onClick={() => navigate(`/etiquetas/${t.id}`)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config' ? <AbaConfig notify={notify} /> : <AbaItens notify={notify} />}
    </div>
  )
}

// ===================== CONFIGURAÇÃO =====================
function AbaConfig({ notify }) {
  const [config, setConfig] = useState(null)
  const [regras, setRegras] = useState([])
  const [salvando, setSalvando] = useState(false)

  function carregar() {
    api.get('/etiquetas/config')
      .then((r) => { setConfig(r.data.config); setRegras(r.data.regras) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar a configuração.', 'error'))
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (k, v) => setConfig((c) => ({ ...c, [k]: v }))
  // Só troca os dias — o tempLabel de cada regra permanece o que veio do GET
  // (o PUT /etiquetas/regras rejeita com 400 se tempLabel vier vazio).
  const updRegraDias = (cons, dias) => setRegras((rs) => rs.map((r) => (r.conservacao === cons ? { ...r, dias } : r)))
  const updRegraLabel = (cons, tempLabel) => setRegras((rs) => rs.map((r) => (r.conservacao === cons ? { ...r, tempLabel } : r)))

  async function salvar() {
    setSalvando(true)
    try {
      // config já traz de volta larguraMm/alturaMm/campos (layout de impressão,
      // fora do escopo desta tela) — reenviar o objeto inteiro preserva o que já
      // estava configurado lá em vez de resetar pro default do backend.
      await api.put('/etiquetas/config', config)
      await api.put('/etiquetas/regras', {
        regras: regras.map((r) => ({ conservacao: r.conservacao, tempLabel: r.tempLabel, dias: r.dias })),
      })
      notify('Configurações salvas.')
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (!config) return <div className="loading-state">Carregando…</div>

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <div className="table-card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Identificação do estabelecimento</h2>
        <div className="form-group">
          <label className="form-label">Razão social / nome fantasia</label>
          <input className="form-input" value={config.razaoSocial || ''} onChange={(e) => upd('razaoSocial', e.target.value)} />
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">CNPJ</label>
            <input className="form-input" value={config.cnpj || ''} onChange={(e) => upd('cnpj', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Responsável técnico</label>
            <input className="form-input" value={config.responsavelTecnico || ''} onChange={(e) => upd('responsavelTecnico', e.target.value)} />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">SIF (inspeção federal)</label>
            <input className="form-input" value={config.sif || ''} onChange={(e) => upd('sif', e.target.value)} placeholder="Ex.: 4231" />
          </div>
          <div className="form-group">
            <label className="form-label">SIE (inspeção estadual)</label>
            <input className="form-input" value={config.sie || ''} onChange={(e) => upd('sie', e.target.value)} placeholder="Ex.: 0987" />
          </div>
        </div>
      </div>

      <div className="table-card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Regras de validade (padrão)</h2>
        <div className="page-header-sub" style={{ marginTop: 0, marginBottom: 12 }}>
          Vale para todo item que não tem validade própria (aba Itens).
        </div>
        {regras.map((r) => (
          <div key={r.conservacao} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--app-border, #eee)' }}>
            <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: 13, fontWeight: 600 }}>{CONS_LABEL[r.conservacao] || r.conservacao}</span>
            <input
              className="form-input"
              style={{ maxWidth: 150 }}
              value={r.tempLabel}
              onChange={(e) => updRegraLabel(r.conservacao, e.target.value)}
              placeholder="Ex.: <= -18 °C"
              title="Temperatura impressa no rótulo"
            />
            <input
              className="form-input"
              type="number"
              min={1}
              max={3650}
              style={{ width: 76 }}
              value={r.dias}
              onChange={(e) => updRegraDias(r.conservacao, parseInt(e.target.value, 10) || 1)}
            />
            <span style={{ fontSize: 12, color: 'var(--app-text-soft, #888)', width: 34 }}>dias</span>
          </div>
        ))}
      </div>

      <div>
        <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}

// ===================== ITENS =====================
function AbaItens({ notify }) {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  const [cons, setCons] = useState([])
  const [loading, setLoading] = useState(true)

  function carregar() {
    api.get('/etiquetas/itens', { params: busca ? { busca } : {} })
      .then((r) => { setItens(r.data.itens || []); setCons(r.data.conservacoes || []) })
      .catch((e) => notify(e?.response?.data?.error ?? 'Não foi possível carregar os itens.', 'error'))
      .finally(() => setLoading(false))
  }
  // Debounce de 250ms na busca — mesmo padrão usado em Equipe.jsx.
  useEffect(() => {
    const t = setTimeout(carregar, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  async function salvarItem(it, patch) {
    const novo = { ...it, ...patch }
    setItens((xs) => xs.map((x) => (x.insumoId === it.insumoId ? novo : x)))
    try {
      const r = await api.put(`/etiquetas/itens/${it.insumoId}`, {
        conservacaoPadrao: novo.conservacaoPadrao,
        validadeDias: novo.validadeDias,
        ativo: novo.ativo,
      })
      // recarrega pra pegar a validadeEfetiva recalculada pelo backend
      setItens((xs) => xs.map((x) => (x.insumoId === it.insumoId
        ? { ...x, conservacaoPadrao: r.data.item.conservacaoPadrao, validadeDias: r.data.item.validadeDias, ativo: r.data.item.ativo }
        : x)))
      carregar()
    } catch (e) {
      notify(e?.response?.data?.error ?? 'Não foi possível salvar o item.', 'error')
      carregar()
    }
  }

  return (
    <div>
      <input
        className="form-input"
        style={{ maxWidth: 320, marginBottom: 12 }}
        placeholder="Buscar item…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : itens.length === 0 ? (
        <div className="empty-state">Nenhum item encontrado.</div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Conservação padrão</th>
                <th>Validade própria</th>
                <th>Vale na cozinha</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.insumoId}>
                  <td style={{ fontWeight: 600 }}>{it.nome}</td>
                  <td>
                    <select
                      className="form-input"
                      style={{ minWidth: 170 }}
                      value={it.conservacaoPadrao || ''}
                      onChange={(e) => salvarItem(it, { conservacaoPadrao: e.target.value || null })}
                    >
                      <option value="">— escolher na hora —</option>
                      {cons.map((c) => <option key={c} value={c}>{CONS_LABEL[c] || c}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      max={3650}
                      style={{ width: 90 }}
                      placeholder="usa a regra"
                      value={it.validadeDias ?? ''}
                      onChange={(e) => salvarItem(it, { validadeDias: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                    />
                  </td>
                  <td style={{ color: 'var(--app-text-soft, #888)' }}>
                    {it.validadeEfetiva ? `${it.validadeEfetiva} dia(s)` : '—'}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={it.ativo !== false}
                      onChange={(e) => salvarItem(it, { ativo: e.target.checked })}
                      title="Desligado, o item some da tela de impressão de etiquetas na cozinha"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
