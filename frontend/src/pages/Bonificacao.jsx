// Dep. Pessoal › Bonificação — abas Mês atual (lançamentos + cálculo + fechamento)
// e Configuração (tetos, bônus, tipos por pilar). Restrito ao ADMIN.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import MesSwitcher from '../components/MesSwitcher'

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
const pct = (n) => `${Number(n) || 0}%`
const gridAuto = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 })
const dataCurta = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
const mesAtualStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
let tmpSeq = 0

function CampoNum({ label, prefixo, sufixo, valor, onChange, step = '1', max }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        {prefixo && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: 13, pointerEvents: 'none' }}>{prefixo}</span>}
        <input type="number" className="form-input" min="0" max={max} step={step} inputMode="decimal"
          style={{ paddingLeft: prefixo ? 34 : undefined, paddingRight: sufixo ? 30 : undefined }}
          value={valor} onChange={(e) => onChange(e.target.value)} />
        {sufixo && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: 13, pointerEvents: 'none' }}>{sufixo}</span>}
      </div>
    </div>
  )
}

/* ───────────── Aba: Mês atual ───────────── */
function AbaMes({ tipos, toast }) {
  const [mes, setMes] = useState(mesAtualStr())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [funcSel, setFuncSel] = useState(null)      // funcionarioId com modal aberto
  const [confirmFechar, setConfirmFechar] = useState(false)
  const [confirmReabrir, setConfirmReabrir] = useState(false)
  const [acao, setAcao] = useState(false)
  const [coletivaModal, setColetivaModal] = useState(false)

  const [ano, mesN] = mes.split('-').map(Number)

  function carregar() {
    setLoading(true)
    api.get('/bonificacao/mensal', { params: { ano, mes: mesN } })
      .then((r) => setData(r.data))
      .catch((err) => toast({ message: err?.response?.data?.error ?? 'Erro ao carregar o mês.', type: 'error' }))
      .finally(() => setLoading(false))
  }
  useEffect(carregar, [mes]) // eslint-disable-line react-hooks/exhaustive-deps

  const fechado = !!data?.fechado
  const funcs = data?.funcionarios || []
  const fSel = funcs.find((f) => f.funcionarioId === funcSel) || null
  const tiposColetivos = (tipos || []).filter((t) => t.pilar === 'COLETIVA')
  const coletivas = data?.coletivas || []

  async function excluirOc(id) {
    try { await api.delete(`/bonificacao/ocorrencias/${id}`); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao excluir.', type: 'error' }) }
  }
  async function fecharMes() {
    setAcao(true)
    try { await api.post('/bonificacao/fechar', { ano, mes: mesN }); setConfirmFechar(false); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao fechar.', type: 'error' }) }
    finally { setAcao(false) }
  }
  async function reabrirMes() {
    setAcao(true)
    try { await api.post('/bonificacao/reabrir', { ano, mes: mesN }); setConfirmReabrir(false); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao reabrir.', type: 'error' }) }
    finally { setAcao(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <MesSwitcher mes={mes} onChange={setMes} />
        {!loading && (fechado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge badge-gray">Mês fechado</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReabrir(true)}>Reabrir</button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setConfirmFechar(true)} disabled={!funcs.length}>Fechar mês</button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">Carregando…</div>
      ) : (
        <>
          {fechado && (
            <div className="alert" style={{ marginBottom: 12 }}>
              <div className="alert-msg">Fechado em {new Date(data.fechadoEm).toLocaleDateString('pt-BR')}{data.fechadoPor ? ` por ${data.fechadoPor}` : ''}. Este é o relatório de pagamento (valores congelados).</div>
            </div>
          )}

          {/* Nota coletiva da equipe — 100% e desce por ocorrência coletiva */}
          <div className="table-card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Nota Coletiva da equipe</div>
                <div style={{ fontSize: 11.5, color: '#999' }}>Começa em 100% e desce por ocorrência da equipe. Aplicada igual a todos.</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: Number(data.coletivaPct) >= 100 ? '#16a34a' : Number(data.coletivaPct) >= 70 ? '#d97706' : '#dc2626' }}>{pct(data.coletivaPct)}</span>
                {!fechado && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setColetivaModal(true)} disabled={!tiposColetivos.length}
                    title={tiposColetivos.length ? 'Lançar ocorrência da equipe' : 'Cadastre tipos coletivos na Configuração'}>+ Ocorrência</button>
                )}
              </div>
            </div>
            {coletivas.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--app-border, #eee)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {coletivas.map((o) => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#999', width: 42, flexShrink: 0 }}>{dataCurta(o.data)}</span>
                    <span style={{ fontWeight: 600 }}>{o.nomeTipo}</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>−{o.percentual}%</span>
                    {o.observacao && <span style={{ color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {o.observacao}</span>}
                    {!fechado && <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={() => excluirOc(o.id)} title="Remover">✕</button>}
                  </div>
                ))}
              </div>
            )}
            {!fechado && tiposColetivos.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: '#999' }}>Cadastre tipos de ocorrência coletiva na aba <strong>Configuração</strong> para poder lançar.</div>
            )}
          </div>

          {funcs.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 16px' }}>Nenhum funcionário ativo. Cadastre a equipe em Dep. Pessoal › Equipe.</div>
          ) : (
            <div className="table-card">
              <table className="ent-tabela">
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Assiduidade</th>
                    <th>Desempenho</th>
                    <th>Coletiva</th>
                    <th>Classificação</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {funcs.map((f) => (
                    <tr key={f.funcionarioId} className={fechado ? '' : 'ent-row-click'} onClick={fechado ? undefined : () => setFuncSel(f.funcionarioId)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.nome}</div>
                        {f.funcao && <div style={{ fontSize: 11.5, color: '#999' }}>{f.funcao}</div>}
                      </td>
                      <td>{pct(f.assidPct)} <span style={{ color: '#999' }}>· {brl(f.assidRs)}</span></td>
                      <td>{pct(f.desPct)} <span style={{ color: '#999' }}>· {brl(f.desRs)}</span></td>
                      <td>{brl(f.colRs)}</td>
                      <td>{f.posicao <= 3 && f.classificacaoRs > 0 ? <span className="badge badge-yellow">{f.posicao}º · {brl(f.classificacaoRs)}</span> : <span style={{ color: '#bbb' }}>{f.posicao}º</span>}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{brl(f.totalRs)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600, color: '#666' }}>Total do mês</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{brl(data.totalGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {!fechado && funcs.length > 0 && <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Clique num funcionário para lançar ocorrências (atrasos, faltas, advertências…).</div>}
        </>
      )}

      {/* Modal: ocorrências do funcionário */}
      {fSel && (
        <OcorrenciasModal
          func={fSel} tipos={tipos} ano={ano} mes={mesN}
          onClose={() => setFuncSel(null)}
          onExcluir={excluirOc}
          onLancou={carregar}
          toast={toast}
        />
      )}

      {/* Modal: ocorrência coletiva (da equipe) */}
      {coletivaModal && (
        <ColetivaModal
          tipos={tiposColetivos} ano={ano} mes={mesN}
          onClose={() => setColetivaModal(false)}
          onLancou={carregar}
          toast={toast}
        />
      )}

      <ConfirmDialog open={confirmFechar} title="Fechar o mês" message={`Fechar ${mes.split('-')[1]}/${mes.split('-')[0]}?`}
        description="Os valores serão congelados para o relatório de pagamento. Você poderá reabrir se precisar ajustar."
        confirmLabel="Fechar mês" cancelLabel="Cancelar" loading={acao} onConfirm={fecharMes} onCancel={() => setConfirmFechar(false)} />
      <ConfirmDialog open={confirmReabrir} title="Reabrir o mês" message="Reabrir para novos ajustes?"
        description="O fechamento atual será descartado; um novo cálculo será gerado ao fechar de novo." variant="danger"
        confirmLabel="Reabrir" cancelLabel="Cancelar" loading={acao} onConfirm={reabrirMes} onCancel={() => setConfirmReabrir(false)} />
    </div>
  )
}

function OcorrenciasModal({ func, tipos, ano, mes, onClose, onExcluir, onLancou, toast }) {
  const tiposInd = (tipos || []).filter((t) => t.pilar !== 'COLETIVA') // coletivos só na aba da equipe
  const [tipoId, setTipoId] = useState(tiposInd[0]?.id ? String(tiposInd[0].id) : '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function lancar() {
    if (!tipoId) return toast({ message: 'Escolha o tipo de ocorrência.', type: 'error' })
    setSalvando(true)
    try {
      await api.post('/bonificacao/ocorrencias', { funcionarioId: func.funcionarioId, ano, mes, tipoId: Number(tipoId), data, observacao: obs })
      setObs('')
      onLancou()
    } catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao lançar.', type: 'error' }) }
    finally { setSalvando(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{func.nome}</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              Assiduidade {pct(func.assidPct)} ({brl(func.assidRs)}) · Desempenho {pct(func.desPct)} ({brl(func.desRs)}) · Total {brl(func.totalRs)}
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>

        <div className="ent-edit" style={{ marginTop: 4 }}>
          <div className="ent-edit-titulo">Lançar ocorrência</div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-input" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                {tiposInd.map((t) => <option key={t.id} value={t.id}>{t.pilar === 'ASSIDUIDADE' ? 'Assiduidade' : 'Desempenho'} · {t.nome} (−{t.percentual}%)</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observação (opcional)</label>
            <input className="form-input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: atraso de 20 min" />
          </div>
          <div className="ent-edit-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={lancar} disabled={salvando}>{salvando ? 'Lançando…' : 'Lançar'}</button>
          </div>
        </div>

        <div className="section-title">Ocorrências do mês</div>
        {(func.ocorrencias || []).length === 0 ? (
          <div className="empty-state" style={{ padding: '18px 16px' }}>Nenhuma ocorrência lançada.</div>
        ) : (
          <div className="table-card">
            <table className="hb-table hb-table-compact">
              <thead><tr><th>Data</th><th>Tipo</th><th>Pilar</th><th>Desconto</th><th>Obs.</th><th></th></tr></thead>
              <tbody>
                {func.ocorrencias.map((o) => (
                  <tr key={o.id}>
                    <td>{dataCurta(o.data)}</td>
                    <td>
                      {o.nomeTipo}
                      {(() => { const d = o.explicacao && o.explicacao.startsWith(o.nomeTipo) ? o.explicacao.slice(o.nomeTipo.length).replace(/^\s*·\s*/, '') : (o.explicacao && o.explicacao !== o.nomeTipo ? o.explicacao : ''); return d ? <div style={{ fontSize: 10.5, color: 'var(--app-text-soft, #999)', marginTop: 1 }}>{d}</div> : null })()}
                    </td>
                    <td>{o.pilar === 'ASSIDUIDADE' ? 'Assiduidade' : 'Desempenho'}</td>
                    <td className="clr-red">−{o.percentual}%</td>
                    <td style={{ color: '#666', fontSize: 11.5 }}>{o.observacao || '—'}</td>
                    <td style={{ textAlign: 'right' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => onExcluir(o.id)}>Excluir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Lança uma ocorrência COLETIVA (da equipe) — desce a Nota Coletiva do mês.
function ColetivaModal({ tipos, ano, mes, onClose, onLancou, toast }) {
  const [tipoId, setTipoId] = useState(tipos[0]?.id ? String(tipos[0].id) : '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function lancar() {
    if (!tipoId) return toast({ message: 'Escolha o tipo de ocorrência.', type: 'error' })
    setSalvando(true)
    try {
      await api.post('/bonificacao/ocorrencias', { ano, mes, tipoId: Number(tipoId), data, observacao: obs })
      onLancou(); onClose()
    } catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao lançar.', type: 'error' }) }
    finally { setSalvando(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Ocorrência coletiva</div>
        <div className="page-header-sub" style={{ marginTop: -4, marginBottom: 12 }}>Desce a Nota Coletiva de toda a equipe neste mês.</div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome} (−{t.percentual}%)</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Observação (opcional)</label>
          <input className="form-input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} placeholder="Ex.: meta de julho não batida" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={lancar} disabled={salvando || !tipoId}>{salvando ? 'Lançando…' : 'Lançar'}</button>
        </div>
      </div>
    </div>
  )
}

/* ───────────── Aba: Equipe (Coins, link privado) ───────────── */
function AbaEquipe({ toast }) {
  const [lista, setLista] = useState(null)
  const [moedaSel, setMoedaSel] = useState(null) // funcionário do modal de Coins

  function carregar() {
    api.get('/bonificacao/equipe')
      .then((r) => setLista(r.data))
      .catch((err) => toast({ message: err?.response?.data?.error ?? 'Erro ao carregar a equipe.', type: 'error' }))
  }
  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  const linkDe = (tok) => `${window.location.origin}/eu/${tok}`
  async function copiarLink(f, rotacionar = false) {
    try {
      let tok = f.tokenPrivado
      if (!tok || rotacionar) {
        const r = await api.post(`/funcionarios/${f.id}/link-privado`, { rotacionar })
        tok = r.data.tokenPrivado
        setLista((ls) => ls.map((x) => (x.id === f.id ? { ...x, tokenPrivado: tok } : x)))
      }
      try { await navigator.clipboard.writeText(linkDe(tok)) } catch { /* noop */ }
      toast({ message: rotacionar ? 'Novo link gerado e copiado — o anterior parou de funcionar.' : 'Link privado copiado.', type: 'success' })
    } catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao gerar o link.', type: 'error' }) }
  }

  if (!lista) return <div className="loading-state">Carregando…</div>

  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#777', marginBottom: 12 }}>
        Cada funcionário junta <strong>🪙 Coins</strong> ao fechar o mês (proporcionais ao prêmio) e por conquistas, pra gastar no Mercado. O <strong>link privado</strong> abre a página pessoal dele (Coins, conquistas e mercado), sem login.
      </div>
      {lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 16px' }}>Nenhum funcionário cadastrado. Cadastre a equipe em Dep. Pessoal › Equipe.</div>
      ) : (
        <div className="table-card">
          <table className="ent-tabela">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th style={{ textAlign: 'right' }}>🪙 Coins</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{f.nome} {f.status !== 'ATIVO' && <span className="badge badge-gray" style={{ marginLeft: 4 }}>inativo</span>}</div>
                    {f.funcao && <div style={{ fontSize: 11.5, color: '#999' }}>{f.funcao}</div>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#B8860B', fontSize: 15 }}>{new Intl.NumberFormat('pt-BR').format(f.coins ?? f.moedas ?? 0)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoedaSel(f)}>🪙 Coins</button>
                    {' '}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiarLink(f)} title="Copiar link privado da página pessoal">🔗 Link</button>
                    {f.tokenPrivado && <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiarLink(f, true)} title="Gerar novo link (invalida o atual)" style={{ marginLeft: 4 }}>↻</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moedaSel && <MoedasModal func={moedaSel} onClose={() => setMoedaSel(null)} onMudou={carregar} toast={toast} />}
    </div>
  )
}

function MoedasModal({ func, onClose, onMudou, toast }) {
  const [dados, setDados] = useState(null)   // { saldo, extrato }
  const [pontos, setPontos] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  function carregar() {
    api.get(`/bonificacao/moedas/${func.id}`).then((r) => setDados(r.data)).catch(() => setDados({ saldo: 0, extrato: [] }))
  }
  useEffect(carregar, [func.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function lancar(sinal) {
    const p = Math.abs(parseInt(pontos, 10)) * sinal
    if (!Number.isFinite(p) || p === 0) return toast({ message: 'Informe a quantidade de Coins.', type: 'error' })
    setSalvando(true)
    try {
      await api.post('/bonificacao/moedas', { funcionarioId: func.id, pontos: p, motivo })
      setPontos(''); setMotivo(''); carregar(); onMudou()
    } catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao lançar Coins.', type: 'error' }) }
    finally { setSalvando(false) }
  }
  async function excluir(id) {
    try { await api.delete(`/bonificacao/moedas/${id}`); carregar(); onMudou() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao excluir.', type: 'error' }) }
  }
  const dataHora = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  const nf = new Intl.NumberFormat('pt-BR')
  const ORIGEM = { FECHAMENTO: 'Fechamento', MANUAL: 'Manual', RESGATE: 'Resgate', ESTORNO: 'Estorno' }

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🪙 Coins de {func.nome}</div>
            <div style={{ fontSize: 12, color: '#999' }}>Saldo atual: <strong style={{ color: '#B8860B' }}>{nf.format(dados?.saldo ?? 0)} Coins</strong></div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>

        <div className="ent-edit" style={{ marginTop: 4 }}>
          <div className="ent-edit-titulo">Ajustar Coins</div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Quantidade</label>
              <input type="number" className="form-input" min="1" step="1" inputMode="numeric" value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder="Ex.: 100" />
            </div>
            <div className="form-group">
              <label className="form-label">Motivo (opcional)</label>
              <input className="form-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: bônus surpresa" />
            </div>
          </div>
          <div className="ent-edit-actions" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => lancar(1)} disabled={salvando}>+ Creditar</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => lancar(-1)} disabled={salvando}>− Descontar</button>
          </div>
        </div>

        <div className="section-title">Extrato de Coins</div>
        {!dados ? (
          <div className="loading-state">Carregando…</div>
        ) : dados.extrato.length === 0 ? (
          <div className="empty-state" style={{ padding: '18px 16px' }}>Nenhuma movimentação de Coins ainda.</div>
        ) : (
          <div className="table-card">
            <table className="hb-table hb-table-compact">
              <thead><tr><th>Data</th><th>Motivo</th><th>Origem</th><th style={{ textAlign: 'right' }}>Coins</th><th></th></tr></thead>
              <tbody>
                {dados.extrato.map((x) => (
                  <tr key={x.id}>
                    <td>{dataHora(x.criadoEm)}</td>
                    <td style={{ color: '#666', fontSize: 12 }}>{x.motivo || '—'}</td>
                    <td><span className="badge badge-gray">{ORIGEM[x.origem] || x.origem}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: x.pontos < 0 ? '#7f6300' : '#0F8A54' }}>{x.pontos > 0 ? '+' : ''}{nf.format(x.pontos)}</td>
                    <td style={{ textAlign: 'right' }}>{x.origem === 'MANUAL' && <button type="button" className="btn btn-danger btn-sm" onClick={() => excluir(x.id)}>Excluir</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────── Aba: Conquistas (cards) ───────────── */
const RARIDADES = [
  { id: 'COMUM', label: 'Comum', cor: '#64748b', bg: '#f1f5f9' },
  { id: 'RARO', label: 'Raro', cor: '#a17c00', bg: '#fdf6da' },
  { id: 'EPICO', label: 'Épico', cor: '#7c3aed', bg: '#f5f3ff' },
  { id: 'LENDARIO', label: 'Lendário', cor: '#d97706', bg: '#fffbeb' },
]
const RAR = Object.fromEntries(RARIDADES.map((r) => [r.id, r]))
const REGRAS = [
  { id: 'MANUAL', label: 'Concedida manualmente', unit: '' },
  { id: 'VITORIAS', label: 'Vitórias (1º lugar)', unit: 'vitórias' },
  { id: 'PODIOS', label: 'Pódios (Top 3)', unit: 'pódios' },
  { id: 'MESES_ATIVOS', label: 'Meses ativos', unit: 'meses' },
  { id: 'PRESENCA_100', label: 'Meses com Assiduidade 100%', unit: 'meses' },
  { id: 'SCORE_100', label: 'Meses com Desempenho 100%', unit: 'meses' },
]
const REG = Object.fromEntries(REGRAS.map((r) => [r.id, r]))
const regraTexto = (c) => c.regra === 'MANUAL' ? 'Concedida manualmente' : `${REG[c.regra]?.label || c.regra} ≥ ${c.meta}${REG[c.regra]?.unit ? ' ' + REG[c.regra].unit : ''}`

function AbaConquistas({ toast }) {
  const [lista, setLista] = useState(null)
  const [edit, setEdit] = useState(null)      // conquista em edição (ou {} p/ nova)
  const [conceder, setConceder] = useState(null)
  const [excluir, setExcluir] = useState(null)
  const [recalc, setRecalc] = useState(false)

  function carregar() {
    api.get('/bonificacao/conquistas')
      .then((r) => setLista(r.data))
      .catch((err) => toast({ message: err?.response?.data?.error ?? 'Erro ao carregar as conquistas.', type: 'error' }))
  }
  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function recalcular() {
    setRecalc(true)
    try { const r = await api.post('/bonificacao/conquistas/recalcular'); toast({ message: r.data.novas > 0 ? `${r.data.novas} nova(s) conquista(s) desbloqueada(s)!` : 'Tudo em dia — nenhuma nova conquista.', type: 'success' }); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao recalcular.', type: 'error' }) }
    finally { setRecalc(false) }
  }
  async function excluirConfirm() {
    try { await api.delete(`/bonificacao/conquistas/${excluir.id}`); setExcluir(null); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao excluir.', type: 'error' }) }
  }

  if (!lista) return <div className="loading-state">Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, color: '#777', maxWidth: 520 }}>
          Cards que o funcionário desbloqueia. As de regra automática são concedidas ao <strong>fechar o mês</strong> (ou ao recalcular); as <strong>manuais</strong>, você concede à mão. Cada uma pode dar 🪙 Coins bônus.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={recalcular} disabled={recalc}>{recalc ? 'Recalculando…' : '↻ Recalcular'}</button>
          <button type="button" className="btn btn-primary" onClick={() => setEdit({})}>+ Nova conquista</button>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 16px' }}>Nenhuma conquista. Crie a primeira.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12, marginTop: 12 }}>
          {lista.map((c) => {
            const r = RAR[c.raridade] || RAR.COMUM
            return (
              <div key={c.id} className="table-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, opacity: c.ativo ? 1 : 0.55, borderTop: `3px solid ${r.cor}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 30, lineHeight: 1 }}>{c.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.nome}</div>
                    <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: r.cor, background: r.bg, borderRadius: 999, padding: '2px 8px' }}>{r.label}</span>
                  </div>
                </div>
                {c.descricao && <div style={{ fontSize: 12, color: '#777', lineHeight: 1.4 }}>{c.descricao}</div>}
                <div style={{ fontSize: 11.5, color: '#555' }}>🎯 {regraTexto(c)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11.5, color: '#999' }}>
                  <span>{c.xpBonus > 0 ? <span style={{ color: '#B8860B', fontWeight: 700 }}>+{c.xpBonus} 🪙</span> : 'sem bônus'}</span>
                  <span>👥 {c.desbloqueada}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setEdit(c)}>Editar</button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setConceder(c)}>Conceder</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setExcluir(c)} title="Excluir">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {edit && <ConquistaModal conquista={edit} onClose={() => setEdit(null)} onSalvou={() => { setEdit(null); carregar() }} toast={toast} />}
      {conceder && <ConcederModal conquista={conceder} onClose={() => setConceder(null)} onMudou={carregar} toast={toast} />}
      <ConfirmDialog open={!!excluir} title="Excluir conquista" message={excluir ? `Excluir “${excluir.nome}”?` : ''}
        description="Os desbloqueios dessa conquista também serão removidos. Os Coins já creditados não são estornados." variant="danger"
        confirmLabel="Excluir" cancelLabel="Cancelar" onConfirm={excluirConfirm} onCancel={() => setExcluir(null)} />
    </div>
  )
}

function ConquistaModal({ conquista, onClose, onSalvou, toast }) {
  const nova = !conquista.id
  const [f, setF] = useState({
    emoji: conquista.emoji || '🏅', nome: conquista.nome || '', descricao: conquista.descricao || '',
    raridade: conquista.raridade || 'COMUM', regra: conquista.regra || 'MANUAL',
    meta: conquista.meta ?? 1, xpBonus: conquista.xpBonus ?? 0, ativo: conquista.ativo !== false,
  })
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const temMeta = f.regra !== 'MANUAL'

  async function salvar() {
    if (!f.nome.trim()) return toast({ message: 'Informe o nome da conquista.', type: 'error' })
    setSalvando(true)
    try {
      if (nova) await api.post('/bonificacao/conquistas', f)
      else await api.put(`/bonificacao/conquistas/${conquista.id}`, f)
      onSalvou()
    } catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao salvar.', type: 'error' }) }
    finally { setSalvando(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontWeight: 700, fontSize: 16 }}>{nova ? 'Nova conquista' : 'Editar conquista'}</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <div className="form-group" style={{ width: 74 }}>
            <label className="form-label">Emoji</label>
            <input className="form-input" style={{ textAlign: 'center', fontSize: 20 }} value={f.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={4} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Nome</label>
            <input className="form-input" value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Tricampeão" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição (opcional)</label>
          <input className="form-input" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="O que representa essa conquista" />
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Raridade</label>
            <select className="form-input" value={f.raridade} onChange={(e) => set('raridade', e.target.value)}>
              {RARIDADES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">🪙 Coins bônus</label>
            <input type="number" className="form-input" min="0" step="10" value={f.xpBonus} onChange={(e) => set('xpBonus', e.target.value)} />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Regra de desbloqueio</label>
            <select className="form-input" value={f.regra} onChange={(e) => set('regra', e.target.value)}>
              {REGRAS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          {temMeta && (
            <div className="form-group">
              <label className="form-label">Meta ({REG[f.regra]?.unit || '—'})</label>
              <input type="number" className="form-input" min="1" step="1" value={f.meta} onChange={(e) => set('meta', e.target.value)} />
            </div>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          <span>Conquista ativa (visível e avaliada)</span>
        </label>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function ConcederModal({ conquista, onClose, onMudou, toast }) {
  const [equipe, setEquipe] = useState(null)
  const [desb, setDesb] = useState([])   // desbloqueios [{id, funcionarioId, origem}]
  const [busy, setBusy] = useState(0)

  function carregar() {
    Promise.all([api.get('/bonificacao/equipe'), api.get(`/bonificacao/conquistas/${conquista.id}/desbloqueios`)])
      .then(([e, d]) => { setEquipe(e.data); setDesb(d.data) })
      .catch((err) => toast({ message: err?.response?.data?.error ?? 'Erro ao carregar.', type: 'error' }))
  }
  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps
  const desbDe = (fid) => desb.find((d) => d.funcionarioId === fid) || null

  async function conceder(fid) {
    setBusy(fid)
    try { await api.post(`/bonificacao/conquistas/${conquista.id}/conceder`, { funcionarioId: fid }); carregar(); onMudou() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao conceder.', type: 'error' }) }
    finally { setBusy(0) }
  }
  async function revogar(d) {
    setBusy(d.funcionarioId)
    try { await api.delete(`/bonificacao/conquistas/desbloqueio/${d.id}`); carregar(); onMudou() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao revogar.', type: 'error' }) }
    finally { setBusy(0) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{conquista.emoji} {conquista.nome}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{regraTexto(conquista)}{conquista.xpBonus > 0 ? ` · +${conquista.xpBonus} 🪙` : ''}</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
        {conquista.regra !== 'MANUAL' && <div className="alert" style={{ margin: '4px 0 10px' }}><div className="alert-msg" style={{ fontSize: 12 }}>Esta conquista tem regra automática — normalmente é concedida sozinha ao fechar o mês. Você ainda pode conceder/revogar à mão aqui.</div></div>}
        {!equipe ? (
          <div className="loading-state">Carregando…</div>
        ) : (
          <div className="table-card">
            <table className="hb-table hb-table-compact">
              <tbody>
                {equipe.map((f) => {
                  const d = desbDe(f.id)
                  return (
                    <tr key={f.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.nome}</div>
                        {f.funcao && <div style={{ fontSize: 11, color: '#999' }}>{f.funcao}</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {d ? (
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <span className="badge" style={{ background: '#ecfdf5', color: '#059669' }}>{d.origem === 'MANUAL' ? 'Concedida' : 'Desbloqueada'}</span>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => revogar(d)} disabled={busy === f.id}>Revogar</button>
                          </span>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => conceder(f.id)} disabled={busy === f.id}>Conceder</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────── Aba: Mercado (itens + resgates) ───────────── */
const STATUS_RESGATE = {
  PENDENTE: { label: 'Pendente', cor: '#b45309', bg: '#fffbeb' },
  APROVADO: { label: 'Aprovado', cor: '#a17c00', bg: '#fdf6da' },
  ENTREGUE: { label: 'Entregue', cor: '#059669', bg: '#ecfdf5' },
  REJEITADO: { label: 'Rejeitado', cor: '#dc2626', bg: '#fef2f2' },
}
const moeda = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0)

function AbaMercado({ toast }) {
  const [sub, setSub] = useState('itens')
  const [pendentes, setPendentes] = useState(0)

  useEffect(() => {
    api.get('/bonificacao/mercado/resgates', { params: { status: 'PENDENTE' } }).then((r) => setPendentes(r.data.length)).catch(() => {})
  }, [sub])

  return (
    <div>
      <div className="modal-tabs" style={{ marginBottom: 14 }}>
        <button type="button" className={'av-tab' + (sub === 'itens' ? ' active' : '')} onClick={() => setSub('itens')}>Itens</button>
        <button type="button" className={'av-tab' + (sub === 'resgates' ? ' active' : '')} onClick={() => setSub('resgates')}>
          Resgates {pendentes > 0 && <span className="badge badge-yellow" style={{ marginLeft: 4 }}>{pendentes}</span>}
        </button>
      </div>
      {sub === 'itens' ? <MercadoItens toast={toast} /> : <MercadoResgates toast={toast} onMudou={() => setSub('resgates')} />}
    </div>
  )
}

function MercadoItens({ toast }) {
  const [lista, setLista] = useState(null)
  const [edit, setEdit] = useState(null)
  const [excluir, setExcluir] = useState(null)

  function carregar() {
    api.get('/bonificacao/mercado/itens').then((r) => setLista(r.data)).catch((err) => toast({ message: err?.response?.data?.error ?? 'Erro ao carregar os itens.', type: 'error' }))
  }
  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function excluirConfirm() {
    try { await api.delete(`/bonificacao/mercado/itens/${excluir.id}`); setExcluir(null); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao excluir.', type: 'error' }) }
  }
  if (!lista) return <div className="loading-state">Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: '#777', maxWidth: 520 }}>Prêmios que a equipe resgata com <strong>🪙 Coins</strong>. Cada resgate entra na fila de aprovação. Deixe o estoque em branco para ilimitado.</div>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}>+ Novo item</button>
      </div>
      {lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 16px' }}>Nenhum item no mercado. Crie o primeiro.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 12 }}>
          {lista.map((i) => (
            <div key={i.id} className="table-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, opacity: i.ativo ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{i.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{i.nome}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#B8860B' }}>🪙 {moeda(i.custo)}</div>
                </div>
              </div>
              {i.descricao && <div style={{ fontSize: 12, color: '#777', lineHeight: 1.4 }}>{i.descricao}</div>}
              <div style={{ fontSize: 11.5, color: '#999' }}>{i.estoque == null ? 'Estoque ilimitado' : `${i.estoque} em estoque`}{!i.ativo && ' · inativo'}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setEdit(i)}>Editar</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setExcluir(i)} title="Excluir">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <ItemModal item={edit} onClose={() => setEdit(null)} onSalvou={() => { setEdit(null); carregar() }} toast={toast} />}
      <ConfirmDialog open={!!excluir} title="Excluir item" message={excluir ? `Excluir “${excluir.nome}”?` : ''}
        description="Resgates já feitos deste item continuam no histórico." variant="danger"
        confirmLabel="Excluir" cancelLabel="Cancelar" onConfirm={excluirConfirm} onCancel={() => setExcluir(null)} />
    </div>
  )
}

function ItemModal({ item, onClose, onSalvou, toast }) {
  const nova = !item.id
  const [f, setF] = useState({
    emoji: item.emoji || '🎁', nome: item.nome || '', descricao: item.descricao || '',
    custo: item.custo ?? 100, estoque: item.estoque ?? '', ativo: item.ativo !== false,
  })
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  async function salvar() {
    if (!f.nome.trim()) return toast({ message: 'Informe o nome do item.', type: 'error' })
    setSalvando(true)
    try {
      if (nova) await api.post('/bonificacao/mercado/itens', f)
      else await api.put(`/bonificacao/mercado/itens/${item.id}`, f)
      onSalvou()
    } catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao salvar.', type: 'error' }) }
    finally { setSalvando(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontWeight: 700, fontSize: 16 }}>{nova ? 'Novo item' : 'Editar item'}</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <div className="form-group" style={{ width: 74 }}>
            <label className="form-label">Emoji</label>
            <input className="form-input" style={{ textAlign: 'center', fontSize: 20 }} value={f.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={4} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Nome</label>
            <input className="form-input" value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Combo grátis" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição (opcional)</label>
          <input className="form-input" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="O que o funcionário ganha" />
        </div>
        <div className="form-grid-2">
          <CampoNum label="Custo (Coins)" sufixo="🪙" step="10" valor={f.custo} onChange={(v) => set('custo', v)} />
          <div className="form-group">
            <label className="form-label">Estoque (vazio = ilimitado)</label>
            <input type="number" className="form-input" min="0" step="1" value={f.estoque} onChange={(e) => set('estoque', e.target.value)} placeholder="ilimitado" />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          <span>Item ativo (visível no mercado)</span>
        </label>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function MercadoResgates({ toast }) {
  const [filtro, setFiltro] = useState('PENDENTE')
  const [lista, setLista] = useState(null)
  const [rejeitar, setRejeitar] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(0)

  function carregar() {
    setLista(null)
    api.get('/bonificacao/mercado/resgates', { params: filtro === 'TODOS' ? {} : { status: filtro } })
      .then((r) => setLista(r.data)).catch((err) => toast({ message: err?.response?.data?.error ?? 'Erro ao carregar.', type: 'error' }))
  }
  useEffect(carregar, [filtro]) // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(r, verbo) {
    setBusy(r.id)
    try { await api.post(`/bonificacao/mercado/resgates/${r.id}/${verbo}`); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro na ação.', type: 'error' }) }
    finally { setBusy(0) }
  }
  async function confirmarRejeicao() {
    setBusy(rejeitar.id)
    try { await api.post(`/bonificacao/mercado/resgates/${rejeitar.id}/rejeitar`, { motivo }); setRejeitar(null); setMotivo(''); carregar() }
    catch (err) { toast({ message: err?.response?.data?.error ?? 'Erro ao rejeitar.', type: 'error' }) }
    finally { setBusy(0) }
  }
  const dataHora = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
  const FILTROS = [['PENDENTE', 'Pendentes'], ['APROVADO', 'Aprovados'], ['ENTREGUE', 'Entregues'], ['REJEITADO', 'Rejeitados'], ['TODOS', 'Todos']]

  return (
    <div>
      <div className="modal-tabs" style={{ marginBottom: 12, gap: 6 }}>
        {FILTROS.map(([id, label]) => (
          <button key={id} type="button" className={'av-tab' + (filtro === id ? ' active' : '')} onClick={() => setFiltro(id)}>{label}</button>
        ))}
      </div>
      {!lista ? (
        <div className="loading-state">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 16px' }}>Nenhum resgate {filtro !== 'TODOS' ? STATUS_RESGATE[filtro]?.label.toLowerCase() : ''}.</div>
      ) : (
        <div className="table-card">
          <table className="ent-tabela">
            <thead><tr><th>Funcionário</th><th>Item</th><th style={{ textAlign: 'right' }}>Custo</th><th>Status</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
            <tbody>
              {lista.map((r) => {
                const s = STATUS_RESGATE[r.status] || {}
                const podeDecidir = r.status === 'PENDENTE' || r.status === 'APROVADO'
                return (
                  <tr key={r.id}>
                    <td><div style={{ fontWeight: 600 }}>{r.funcionarioNome}</div><div style={{ fontSize: 11, color: '#999' }}>{dataHora(r.criadoEm)}</div></td>
                    <td>{r.itemEmoji} {r.itemNome}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#B8860B' }}>🪙 {moeda(r.custo)}</td>
                    <td><span className="badge" style={{ color: s.cor, background: s.bg }}>{s.label || r.status}</span>{r.observacao && r.status === 'REJEITADO' && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{r.observacao}</div>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {podeDecidir ? (
                        <>
                          {r.status === 'PENDENTE' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => acao(r, 'aprovar')} disabled={busy === r.id}>Aprovar</button>}
                          {' '}
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => acao(r, 'entregar')} disabled={busy === r.id}>Entregue</button>
                          {' '}
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => { setRejeitar(r); setMotivo('') }} disabled={busy === r.id}>Rejeitar</button>
                        </>
                      ) : <span style={{ color: '#bbb', fontSize: 12 }}>{r.decididoPor ? `por ${r.decididoPor}` : '—'}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejeitar && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: 16 }}>Rejeitar resgate</div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejeitar(null)}>Fechar</button>
            </div>
            <p style={{ fontSize: 13, color: '#666', margin: '4px 0 10px' }}>Os <strong>🪙 {moeda(rejeitar.custo)} Coins</strong> voltam para {rejeitar.funcionarioNome} e o estoque é reposto.</p>
            <div className="form-group">
              <label className="form-label">Motivo (opcional)</label>
              <input className="form-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: prêmio indisponível no momento" />
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRejeitar(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" onClick={confirmarRejeicao} disabled={busy === rejeitar.id}>Rejeitar e estornar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────── Aba: Configuração ───────────── */
const PILARES = [
  { id: 'ASSIDUIDADE', label: 'Assiduidade', hint: 'presença — falta, atraso, atestado…', cor: '#a17c00' },
  { id: 'DESEMPENHO', label: 'Desempenho', hint: 'trabalho — advertência, erro…', cor: '#7c3aed' },
  { id: 'COLETIVA', label: 'Coletiva (equipe)', hint: 'da loja toda — meta não batida, inspeção reprovada…', cor: '#0d9488' },
]
// Card de seção padronizado da Configuração (título forte + descrição + slot à direita).
function SecaoConfig({ titulo, descricao, right, children }) {
  return (
    <div className="table-card" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{titulo}</div>
          {descricao && <div style={{ fontSize: 12.5, color: 'var(--app-text-soft, #737373)', marginTop: 3, lineHeight: 1.45 }}>{descricao}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// Funções da equipe: a lista do cadastro do colaborador + flag "recebe bonificação".
function SecaoFuncoes({ toast }) {
  const [funcoes, setFuncoes] = useState([])
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api.get('/funcoes').then((r) => setFuncoes((r.data || []).map((f) => ({ ...f })))).catch(() => {}) }, [])
  const set = (key, patch) => setFuncoes((fs) => fs.map((f) => ((f.id ?? f._tmp) === key ? { ...f, ...patch } : f)))
  const add = () => setFuncoes((fs) => [...fs, { _tmp: `f${++tmpSeq}`, nome: '', bonificavel: true }])
  const rm = (key) => setFuncoes((fs) => fs.filter((f) => (f.id ?? f._tmp) !== key))
  async function salvar() {
    setSalvando(true)
    try {
      const r = await api.put('/funcoes', { funcoes: funcoes.filter((f) => (f.nome || '').trim()).map((f) => ({ id: f.id, nome: f.nome, bonificavel: f.bonificavel !== false })) })
      setFuncoes((r.data || []).map((f) => ({ ...f })))
      toast?.({ message: 'Funções salvas.', type: 'success' })
    } catch (err) { toast?.({ message: err?.response?.data?.error ?? 'Erro ao salvar as funções.', type: 'error' }) }
    finally { setSalvando(false) }
  }
  return (
    <SecaoConfig titulo="Funções da equipe" descricao="A lista que aparece no cadastro do colaborador. Desmarque “recebe bonificação” para tirar a função inteira do cálculo (ex.: Entregador)."
      right={<button type="button" className="btn btn-primary btn-sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar funções'}</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {funcoes.map((f) => {
          const key = f.id ?? f._tmp
          return (
            <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="Nome da função" value={f.nome} onChange={(e) => set(key, { nome: e.target.value })} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--app-text-soft, #737373)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={f.bonificavel !== false} onChange={(e) => set(key, { bonificavel: e.target.checked })} /> recebe bonificação
              </label>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => rm(key)} title="Remover">✕</button>
            </div>
          )
        })}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={add}>+ Adicionar função</button>
    </SecaoConfig>
  )
}

// Resumo curto do que a regra (tipo) tem configurado além do % base.
function resumoRegra(t) {
  const p = []
  if (t.tipoImpacto === 'FAIXA_MINUTOS') p.push(`faixas de minutos${Array.isArray(t.faixasJson) ? ` (${t.faixasJson.length})` : ''}`)
  else if (t.tipoImpacto === 'SEVERIDADE') p.push('por severidade')
  if (t.toleranciaMin) p.push(`tolerância ${t.toleranciaMin}min`)
  if (t.reincidenciaAPartir != null && t.reincidenciaAPartir !== '') p.push(`reincidência ≥${t.reincidenciaAPartir}ª (+${t.incrementoPct || 0}%)`)
  if (t.tetoOcorrenciaPct != null && t.tetoOcorrenciaPct !== '') p.push(`teto ${t.tetoOcorrenciaPct}%/oco`)
  if (t.tetoCicloPct != null && t.tetoCicloPct !== '') p.push(`teto ${t.tetoCicloPct}%/ciclo`)
  return p.join(' · ')
}

// Editor avançado de uma regra (Motor de Regras) + simulador. As mudanças são
// aplicadas ao estado do tipo; só persistem no "Salvar configuração".
function RegraAvancadaModal({ regra: t, severidades, onPatch, onClose, toast }) {
  const faixas = Array.isArray(t.faixasJson) ? t.faixasJson : []
  const setFaixas = (fx) => onPatch({ faixasJson: fx })
  const setFaixa = (i, patch) => setFaixas(faixas.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const [simN, setSimN] = useState(3)
  const [simMin, setSimMin] = useState(20)
  const [simRes, setSimRes] = useState(null)
  const [simulando, setSimulando] = useState(false)
  async function simular() {
    setSimulando(true)
    try {
      const regraSim = { nome: t.nome || 'Regra', percentual: num(t.percentual) || 0, tipoImpacto: t.tipoImpacto, toleranciaMin: num(t.toleranciaMin), faixasJson: faixas.map((f) => ({ minMin: num(f.minMin), maxMin: num(f.maxMin), percentual: num(f.percentual), rotulo: f.rotulo })), reincidenciaAPartir: num(t.reincidenciaAPartir), incrementoPct: num(t.incrementoPct), tetoOcorrenciaPct: num(t.tetoOcorrenciaPct), tetoCicloPct: num(t.tetoCicloPct) }
      const body = { regra: regraSim, ocorrencias: simN }
      if (t.tipoImpacto === 'FAIXA_MINUTOS') body.minutos = simMin
      const r = await api.post('/bonificacao/simular', body)
      setSimRes(r.data)
    } catch (e) { toast?.({ message: e?.response?.data?.error ?? 'Erro ao simular.', type: 'error' }) }
    finally { setSimulando(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="modal-title">Regra · {t.nome || 'nova'}</div>
        <div className="page-header-sub" style={{ marginTop: -4, marginBottom: 12 }}>Como o impacto desta ocorrência é calculado.</div>
        <div className="form-group">
          <label className="form-label">Tipo de impacto</label>
          <select className="form-input" value={t.tipoImpacto || 'PERCENTUAL'} onChange={(e) => onPatch({ tipoImpacto: e.target.value })}>
            <option value="PERCENTUAL">Percentual fixo (usa o % base)</option>
            <option value="FAIXA_MINUTOS">Por faixa de minutos (atraso)</option>
            <option value="SEVERIDADE">Por severidade</option>
          </select>
        </div>
        {t.tipoImpacto === 'FAIXA_MINUTOS' && (
          <>
            <div className="form-group">
              <label className="form-label">Tolerância (min) — abaixo disso, sem impacto</label>
              <input type="number" className="form-input" style={{ maxWidth: 140 }} min="0" value={t.toleranciaMin ?? ''} onChange={(e) => onPatch({ toleranciaMin: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Faixas de minutos</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {faixas.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="number" className="form-input" style={{ width: 64 }} placeholder="de" value={f.minMin ?? ''} onChange={(e) => setFaixa(i, { minMin: e.target.value })} />
                    <span style={{ color: '#999' }}>–</span>
                    <input type="number" className="form-input" style={{ width: 64 }} placeholder="até" value={f.maxMin ?? ''} onChange={(e) => setFaixa(i, { maxMin: e.target.value })} />
                    <span style={{ color: '#999', fontSize: 12 }}>min →</span>
                    <div style={{ position: 'relative', width: 80 }}>
                      <input type="number" className="form-input" style={{ paddingRight: 20 }} placeholder="%" value={f.percentual ?? ''} onChange={(e) => setFaixa(i, { percentual: e.target.value })} />
                      <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: 12 }}>%</span>
                    </div>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setFaixas(faixas.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setFaixas([...faixas, { minMin: '', maxMin: '', percentual: '', rotulo: '' }])}>+ Faixa</button>
              <div style={{ fontSize: 11, color: 'var(--app-text-soft, #999)', marginTop: 4 }}>Deixe "até" vazio na última faixa para "em diante". Ex.: 6–15→2%, 16–30→4%, 31+→8%.</div>
            </div>
          </>
        )}
        {t.tipoImpacto === 'SEVERIDADE' && (
          <div className="form-group">
            <label className="form-label">Severidade padrão</label>
            <select className="form-input" value={t.severidadeId ?? ''} onChange={(e) => onPatch({ severidadeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— escolher ao lançar —</option>
              {severidades.map((s) => <option key={s.id} value={s.id}>{s.nome} (−{s.percentual}%)</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--app-text-soft, #999)', marginTop: 4 }}>O % vem da severidade escolhida. Cadastre as severidades na seção "Severidades".</div>
          </div>
        )}
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Reincidência a partir da Nª</label>
            <input type="number" className="form-input" min="1" placeholder="—" value={t.reincidenciaAPartir ?? ''} onChange={(e) => onPatch({ reincidenciaAPartir: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Incremento por reincidência (%)</label>
            <input type="number" className="form-input" min="0" step="0.5" placeholder="—" value={t.incrementoPct ?? ''} onChange={(e) => onPatch({ incrementoPct: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Teto por ocorrência (%)</label>
            <input type="number" className="form-input" min="0" placeholder="—" value={t.tetoOcorrenciaPct ?? ''} onChange={(e) => onPatch({ tetoOcorrenciaPct: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Teto no ciclo (%)</label>
            <input type="number" className="form-input" min="0" placeholder="—" value={t.tetoCicloPct ?? ''} onChange={(e) => onPatch({ tetoCicloPct: e.target.value })} />
          </div>
        </div>
        <div className="table-card" style={{ padding: 12, marginTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13 }}>Simular</strong>
            <span style={{ fontSize: 12, color: '#999' }}>nº ocorrências:</span>
            <input type="number" className="form-input" style={{ width: 62 }} min="1" max="20" value={simN} onChange={(e) => setSimN(Number(e.target.value))} />
            {t.tipoImpacto === 'FAIXA_MINUTOS' && (<><span style={{ fontSize: 12, color: '#999' }}>minutos:</span><input type="number" className="form-input" style={{ width: 70 }} min="0" value={simMin} onChange={(e) => setSimMin(Number(e.target.value))} /></>)}
            <button type="button" className="btn btn-secondary btn-sm" onClick={simular} disabled={simulando}>{simulando ? '…' : 'Simular'}</button>
          </div>
          {simRes && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {simRes.linhas.map((l) => <div key={l.ocorrencia} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: '1px solid var(--app-border, #eee)' }}><span style={{ color: '#666' }}>{l.explicacao}</span><span style={{ color: '#dc2626', fontWeight: 600, flexShrink: 0 }}>−{l.percentual}%</span></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 5, marginTop: 2, borderTop: '2px solid var(--app-border, #ddd)', fontWeight: 700 }}><span>Total no ciclo</span><span style={{ color: '#dc2626' }}>−{simRes.totalPct}%</span></div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Concluir</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--app-text-soft, #999)', marginTop: 6, textAlign: 'right' }}>Aplica ao clicar em "Salvar configuração".</div>
      </div>
    </div>
  )
}

// Severidades configuráveis (Desempenho) — CRUD leve, próprio Salvar.
function SecaoSeveridades({ toast }) {
  const [sev, setSev] = useState([])
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api.get('/bonificacao/severidades').then((r) => setSev((r.data || []).map((s) => ({ ...s })))).catch(() => {}) }, [])
  const set = (key, patch) => setSev((ss) => ss.map((s) => ((s.id ?? s._tmp) === key ? { ...s, ...patch } : s)))
  async function salvar() {
    setSalvando(true)
    try {
      const r = await api.put('/bonificacao/severidades', { severidades: sev.filter((s) => (s.nome || '').trim()).map((s) => ({ id: s.id, nome: s.nome, percentual: s.percentual, cor: s.cor })) })
      setSev((r.data || []).map((s) => ({ ...s })))
      toast?.({ message: 'Severidades salvas.', type: 'success' })
    } catch (e) { toast?.({ message: e?.response?.data?.error ?? 'Erro ao salvar.', type: 'error' }) }
    finally { setSalvando(false) }
  }
  return (
    <SecaoConfig titulo="Severidades (Desempenho)" descricao="Classificação das ocorrências de Desempenho — o impacto de uma regra 'por severidade' vem daqui."
      right={<button type="button" className="btn btn-primary btn-sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar severidades'}</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sev.map((s) => {
          const key = s.id ?? s._tmp
          return (
            <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={s.cor || '#dc2626'} onChange={(e) => set(key, { cor: e.target.value })} style={{ width: 30, height: 30, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }} title="Cor" />
              <input className="form-input" style={{ flex: 1 }} placeholder="Nome (ex.: Grave)" value={s.nome} onChange={(e) => set(key, { nome: e.target.value })} />
              <div style={{ position: 'relative', width: 96 }}>
                <input type="number" className="form-input" min="0" max="100" step="0.5" style={{ paddingRight: 22 }} value={s.percentual} onChange={(e) => set(key, { percentual: e.target.value })} />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: 12 }}>%</span>
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setSev((ss) => ss.filter((x) => (x.id ?? x._tmp) !== key))}>✕</button>
            </div>
          )
        })}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setSev((ss) => [...ss, { _tmp: `s${++tmpSeq}`, nome: '', percentual: '', cor: '#dc2626' }])}>+ Severidade</button>
    </SecaoConfig>
  )
}

function AbaConfig({ cfg, setCfg, tipos, setTipos, salvar, salvando, toast }) {
  const set = (campo, v) => setCfg((c) => ({ ...c, [campo]: v }))
  const addTipo = (pilar) => setTipos((ts) => [...ts, { _tmp: `t${++tmpSeq}`, nome: '', pilar, percentual: '', tipoImpacto: 'PERCENTUAL' }])
  const setTipo = (key, patch) => setTipos((ts) => ts.map((t) => ((t.id ?? t._tmp) === key ? { ...t, ...patch } : t)))
  const rmTipo = (key) => setTipos((ts) => ts.filter((t) => (t.id ?? t._tmp) !== key))
  const [regraKey, setRegraKey] = useState(null) // regra em edição avançada
  const [severidades, setSeveridades] = useState([])
  useEffect(() => { api.get('/bonificacao/severidades').then((r) => setSeveridades(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }, [])
  const regraSel = tipos.find((t) => (t.id ?? t._tmp) === regraKey) || null
  const totalMax = Number(cfg.tetoAssiduidade || 0) + Number(cfg.tetoDesempenho || 0) + Number(cfg.tetoColetiva || 0) + Number(cfg.bonusTop1 || 0)
  const identificador = cfg.slugPublico || cfg.tokenPublico || ''
  const linkPublico = identificador ? `${window.location.origin}/bonificacao/${identificador}` : ''
  const origemCurta = window.location.origin.replace(/^https?:\/\//, '')
  const limparSlug = (v) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-')
  const copiar = () => { try { navigator.clipboard.writeText(linkPublico) } catch { /* noop */ } toast?.({ message: 'Link copiado.', type: 'success' }) }
  const abrir = () => { if (linkPublico) window.open(linkPublico, '_blank', 'noopener') }

  const somaTetos = Number(cfg.tetoAssiduidade || 0) + Number(cfg.tetoDesempenho || 0) + Number(cfg.tetoColetiva || 0)

  return (
    <div>
      {/* Barra: status (switch) + salvar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" role="switch" aria-checked={cfg.ativo} onClick={() => set('ativo', !cfg.ativo)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--app-border, #e5e5e5)', background: cfg.ativo ? 'rgba(22,163,74,0.08)' : 'transparent', cursor: 'pointer' }}>
          <span style={{ width: 38, height: 22, borderRadius: 999, background: cfg.ativo ? '#16a34a' : '#cbd5e1', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
            <span style={{ position: 'absolute', top: 2, left: cfg.ativo ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'left .15s' }} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: cfg.ativo ? '#166534' : 'var(--app-text-soft, #737373)' }}>{cfg.ativo ? 'Bonificação ativa nesta loja' : 'Bonificação desativada'}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar configuração'}</button>
      </div>

      <SecaoConfig titulo="Link público da equipe" descricao="Compartilhe com a equipe para acompanharem o ranking do mês, sem login.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Endereço do link</label>
            <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--app-border, #d4d4d4)', borderRadius: 8, overflow: 'hidden', maxWidth: 520 }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 4px 0 11px', fontSize: 13, color: 'var(--app-text-soft, #999)', background: 'rgba(0,0,0,0.03)', whiteSpace: 'nowrap' }}>{origemCurta}/bonificacao/</span>
              <input className="form-input" style={{ border: 'none', borderRadius: 0, flex: 1 }} value={cfg.slugPublico || ''} placeholder="ranking" onChange={(e) => set('slugPublico', limparSlug(e.target.value))} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #999)', marginTop: 5 }}>Um apelido curto e fácil (ex.: ranking). Deixe em branco para usar o link automático. Salve a configuração para aplicar.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" readOnly value={linkPublico} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220 }} placeholder="Salve a configuração para gerar o link" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={copiar} disabled={!linkPublico}>Copiar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={abrir} disabled={!linkPublico}>Abrir</button>
          </div>
        </div>
      </SecaoConfig>

      <SecaoConfig titulo="Valor de cada pilar" descricao="Quanto cada pilar paga, em reais, quando fica em 100%."
        right={<span style={{ fontSize: 12.5, color: 'var(--app-text-soft, #737373)', background: 'rgba(0,0,0,0.04)', padding: '5px 11px', borderRadius: 8, whiteSpace: 'nowrap' }}>Soma: <strong style={{ color: 'var(--app-text)' }}>{brl(somaTetos)}</strong></span>}>
        <div style={gridAuto(150)}>
          <CampoNum label="Assiduidade" prefixo="R$" valor={cfg.tetoAssiduidade} onChange={(v) => set('tetoAssiduidade', v)} />
          <CampoNum label="Desempenho" prefixo="R$" valor={cfg.tetoDesempenho} onChange={(v) => set('tetoDesempenho', v)} />
          <CampoNum label="Coletiva" prefixo="R$" valor={cfg.tetoColetiva} onChange={(v) => set('tetoColetiva', v)} />
        </div>
      </SecaoConfig>

      <SecaoConfig titulo="Bônus da Classificação" descricao="Prêmio extra, em reais, para o Top 3 do ranking do mês.">
        <div style={gridAuto(130)}>
          <CampoNum label="1º lugar" prefixo="R$" valor={cfg.bonusTop1} onChange={(v) => set('bonusTop1', v)} />
          <CampoNum label="2º lugar" prefixo="R$" valor={cfg.bonusTop2} onChange={(v) => set('bonusTop2', v)} />
          <CampoNum label="3º lugar" prefixo="R$" valor={cfg.bonusTop3} onChange={(v) => set('bonusTop3', v)} />
        </div>
      </SecaoConfig>

      <SecaoFuncoes toast={toast} />

      <SecaoConfig titulo="Tipos de ocorrência" descricao="Cada pilar começa em 100% e desce o percentual de cada ocorrência lançada no mês.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {PILARES.map((p) => {
            const doPilar = tipos.filter((t) => t.pilar === p.id)
            return (
              <div key={p.id} style={{ borderLeft: `3px solid ${p.cor}`, paddingLeft: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.cor }}>{p.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--app-text-soft, #999)', marginBottom: 8 }}>{p.hint}</div>
                {doPilar.length === 0 && <div style={{ fontSize: 12, color: '#bbb', marginBottom: 6 }}>Nenhum tipo cadastrado.</div>}
                {doPilar.map((t) => {
                  const key = t.id ?? t._tmp
                  const resumo = resumoRegra(t)
                  return (
                    <div key={key} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input className="form-input" style={{ flex: 1 }} placeholder="Nome da ocorrência" value={t.nome} onChange={(e) => setTipo(key, { nome: e.target.value })} />
                        <div style={{ position: 'relative', width: 96 }}>
                          <input type="number" className="form-input" min="0" max="100" step="0.5" style={{ paddingRight: 26 }} value={t.percentual} onChange={(e) => setTipo(key, { percentual: e.target.value })} title="% base (usado no modo Percentual e como fallback)" />
                          <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: 13, pointerEvents: 'none' }}>%</span>
                        </div>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRegraKey(key)} title="Regras avançadas (faixas, severidade, progressividade, tetos)" style={{ padding: '5px 9px' }}>⚙</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => rmTipo(key)} title="Remover">✕</button>
                      </div>
                      {resumo && <div style={{ fontSize: 10.5, color: p.cor, marginTop: 2, marginLeft: 2 }}>{resumo}</div>}
                    </div>
                  )
                })}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addTipo(p.id)}>+ Adicionar tipo</button>
              </div>
            )
          })}
        </div>
      </SecaoConfig>

      <SecaoSeveridades toast={toast} />

      <SecaoConfig titulo="Coins" descricao="Ao fechar o mês, cada funcionário ganha 🪙 Coins proporcionais ao prêmio (R$) para gastar no Mercado. Conquistas também dão Coins.">
        <div style={gridAuto(240)}>
          <CampoNum label="Coins por R$ (no fechamento)" sufixo="🪙" step="0.5" valor={cfg.moedasPorReal} onChange={(v) => set('moedasPorReal', v)} />
        </div>
      </SecaoConfig>

      <div className="table-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(13,148,136,0.06))' }}>
        <div style={{ fontSize: 13, color: 'var(--app-text-soft, #666)' }}>Bonificação máxima por funcionário <span style={{ color: '#999' }}>(pilares + 1º lugar)</span></div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{brl(totalMax)}</div>
      </div>

      {regraSel && <RegraAvancadaModal regra={regraSel} severidades={severidades} onPatch={(patch) => setTipo(regraKey, patch)} onClose={() => setRegraKey(null)} toast={toast} />}
    </div>
  )
}

/* ───────────── Container ───────────── */
const BONI_TABS = {
  mes: { label: 'Mês atual', sub: 'Ranking e prêmios do mês' },
  equipe: { label: 'Equipe & Coins', sub: 'Progresso e coins da equipe' },
  conquistas: { label: 'Conquistas', sub: 'Medalhas e desafios' },
  mercado: { label: 'Mercado', sub: 'Loja de recompensas' },
  config: { label: 'Configuração', sub: 'Regras, pilares e prêmios' },
}
const BONI_ABAS = Object.keys(BONI_TABS)
export default function Bonificacao() {
  const { aba: abaParam } = useParams()
  const aba = BONI_ABAS.includes(abaParam) ? abaParam : 'mes'
  const [cfg, setCfg] = useState(null)
  const [tipos, setTipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)
  const showToast = (t) => setToast(t)

  useEffect(() => {
    api.get('/bonificacao/config')
      .then((r) => { setCfg(r.data.config); setTipos((r.data.tipos || []).map((t) => ({ ...t }))) })
      .catch((err) => showToast({ message: err?.response?.data?.error ?? 'Erro ao carregar.', type: 'error' }))
      .finally(() => setLoading(false))
  }, [])

  async function salvarConfig() {
    setSalvando(true)
    try {
      const payload = {
        ...cfg,
        tipos: tipos.filter((t) => (t.nome || '').trim()).map((t) => ({ id: t.id, nome: t.nome, pilar: t.pilar, percentual: t.percentual, tipoImpacto: t.tipoImpacto, evento: t.evento, toleranciaMin: t.toleranciaMin, faixasJson: t.faixasJson, severidadeId: t.severidadeId, reincidenciaAPartir: t.reincidenciaAPartir, incrementoPct: t.incrementoPct, tetoOcorrenciaPct: t.tetoOcorrenciaPct, tetoCicloPct: t.tetoCicloPct })),
      }
      const r = await api.put('/bonificacao/config', payload)
      setCfg(r.data.config); setTipos((r.data.tipos || []).map((t) => ({ ...t })))
      showToast({ message: 'Configuração salva.', type: 'success' })
    } catch (err) { showToast({ message: err?.response?.data?.error ?? 'Não foi possível salvar.', type: 'error' }) }
    finally { setSalvando(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{BONI_TABS[aba].label}</h1>
          <div className="page-header-sub">{BONI_TABS[aba].sub}</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {loading || !cfg ? (
        <div className="loading-state">Carregando…</div>
      ) : aba === 'mes' ? (
        <AbaMes tipos={tipos} toast={showToast} />
      ) : aba === 'equipe' ? (
        <AbaEquipe toast={showToast} />
      ) : aba === 'conquistas' ? (
        <AbaConquistas toast={showToast} />
      ) : aba === 'mercado' ? (
        <AbaMercado toast={showToast} />
      ) : (
        <AbaConfig cfg={cfg} setCfg={setCfg} tipos={tipos} setTipos={setTipos} salvar={salvarConfig} salvando={salvando} toast={showToast} />
      )}
    </div>
  )
}
