// Fornecedores — quem vende cada insumo e por quanto, com histórico de cotações.
// CRUD sobre /api/fornecedores; o detalhe lista os insumos fornecidos com preço
// atual, tendência (PREÇO DE COMPRA: subir é ruim → vermelho; cair é bom → verde)
// e permite registrar novas cotações e ver a evolução de preço. Segue o padrão
// visual do PDV (page-header, table-card, badges, modal, ConfirmDialog, Toast).
// Portado do H360 (Produtos › Fornecedores, migration 20260812120000).
import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import InputMoeda from '../components/InputMoeda'
import IconeLixeira from '../components/IconeLixeira'
import SkeletonTabela from '../components/SkeletonTabela'
import { ICONE_CONTATO } from '../components/IconesContato'
import { mascararTelefone } from '../utils/telefone'

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function brl(value) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? brlFormatter.format(n) : '—'
}

// Link wa.me a partir de um telefone cru/mascarado (só dígitos; DDI 55 sem duplicar).
function waLink(whats) {
  let d = String(whats ?? '').replace(/\D/g, '')
  if (!d) return null
  // 12/13 dígitos já trazem o DDI 55; até 11 é DDD+número → prefixa 55.
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}`
}
function telLink(v) { const d = String(v ?? '').replace(/\D/g, ''); return d ? `tel:${d}` : null }
function mailLink(v) { const e = String(v ?? '').trim(); return e ? `mailto:${e}` : null }
function siteLink(v) {
  let u = String(v ?? '').trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  return u
}
function mapsLink(v) {
  const e = String(v ?? '').trim()
  return e ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}` : null
}

// Ícones de contato coloridos: components/IconesContato.jsx (ICONE_CONTATO, import no topo).

// Botões dos contatos disponíveis do fornecedor (WhatsApp, ligar, e-mail, site, local),
// cada um com o ícone indicando a ação. Só aparece se preenchido; sem nenhum → "Sem contato".
function ContatosFornecedor({ f, size = 'sm' }) {
  const cls = 'btn btn-secondary' + (size === 'sm' ? ' btn-sm' : '')
  const itens = []
  const wa = waLink(f.whatsapp); if (wa) itens.push({ k: 'wa', href: wa, label: 'WhatsApp', ext: true })
  const tel = telLink(f.telefone); if (tel) itens.push({ k: 'tel', href: tel, label: 'Ligar', title: f.telefone })
  const mail = mailLink(f.email); if (mail) itens.push({ k: 'mail', href: mail, label: 'E-mail', title: f.email })
  const site = siteLink(f.website); if (site) itens.push({ k: 'site', href: site, label: 'Site', ext: true, title: f.website })
  const maps = mapsLink(f.endereco); if (maps) itens.push({ k: 'maps', href: maps, label: 'Local', ext: true, title: f.endereco })
  if (itens.length === 0) return <span className="clr-muted" style={{ fontSize: 13 }}>Sem contato</span>
  return (
    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {itens.map((it) => (
        <a
          key={it.k}
          className={cls}
          href={it.href}
          title={it.title || it.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          {...(it.ext ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {ICONE_CONTATO[it.k]}
          {it.label}
        </a>
      ))}
    </div>
  )
}

// Data ISO/Date → "12/08/2026" (sem fuso: usa só a parte da data quando vier ISO).
function dataBR(value) {
  if (!value) return '—'
  const s = String(value)
  const soData = s.length >= 10 ? s.slice(0, 10) : s
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(soData)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

// Hoje em YYYY-MM-DD (para o valor padrão do input date da cotação).
function hojeISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

// Tendência do preço de COMPRA (semântica invertida vs. faturamento):
//   up   → subiu   → VERMELHO ▲ (ruim)
//   down → baixou  → VERDE   ▼ (bom)
//   flat/null → neutro
function Tendencia({ tendencia }) {
  if (!tendencia || tendencia.direcao === 'flat' || !tendencia.direcao) {
    return <span className="clr-muted" style={{ fontSize: 12 }}>—</span>
  }
  const sobe = tendencia.direcao === 'up'
  const pctNum = Number(tendencia.pct)
  const pctTxt = Number.isFinite(pctNum)
    ? `${sobe ? '+' : '−'}${Math.abs(pctNum).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    : ''
  return (
    <span
      className={sobe ? 'clr-red' : 'clr-green'}
      title={sobe ? 'Preço subiu desde a cotação anterior' : 'Preço baixou desde a cotação anterior'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 12.5 }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {sobe ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
      {pctTxt}
    </span>
  )
}

// Mini gráfico de linha (SVG puro, sem lib) da evolução de preço. Recebe uma lista
// de números em ordem cronológica (antigo → recente).
function MiniGrafico({ valores }) {
  const pts = (valores ?? []).map(Number).filter((n) => Number.isFinite(n))
  if (pts.length < 2) return null
  const W = 260
  const H = 60
  const pad = 6
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const stepX = (W - pad * 2) / (pts.length - 1)
  const coords = pts.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (H - pad * 2) * (1 - (v - min) / span)
    return [x, y]
  })
  const linha = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [ux, uy] = coords[coords.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }} aria-hidden="true">
      <path d={linha} fill="none" stroke="#eab802" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3 : 2} fill="#eab802" />
      ))}
      <circle cx={ux} cy={uy} r="5" fill="none" stroke="#eab802" strokeWidth="1.5" />
    </svg>
  )
}

const FORM_VAZIO = { nome: '', whatsapp: '', telefone: '', email: '', website: '', endereco: '', observacao: '' }

export default function Fornecedores() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)

  // Modal de criar/editar fornecedor: { modo:'novo'|'editar', id?, form }
  const [modal, setModal] = useState(null)
  const [formErro, setFormErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // Detalhe (painel/modal do fornecedor selecionado)
  const [detalheId, setDetalheId] = useState(null)

  // Exclusão
  const [paraExcluir, setParaExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)

  function carregar() {
    setLoading(true)
    setErro(null)
    api
      .get('/fornecedores')
      .then((r) => setLista(Array.isArray(r.data) ? r.data : []))
      .catch((err) =>
        setErro(
          err?.response?.data?.error ??
            (err?.code === 'ERR_NETWORK'
              ? 'Não foi possível conectar ao backend (http://localhost:4000).'
              : err?.message ?? 'Erro ao carregar fornecedores.')
        )
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setFormErro(null)
    setModal({ modo: 'novo', form: { ...FORM_VAZIO } })
  }
  function abrirEditar(f) {
    setFormErro(null)
    setModal({
      modo: 'editar',
      id: f.id,
      form: {
        nome: f.nome ?? '',
        whatsapp: mascararTelefone(f.whatsapp ?? ''),
        telefone: mascararTelefone(f.telefone ?? ''),
        email: f.email ?? '',
        website: f.website ?? '',
        endereco: f.endereco ?? '',
        observacao: f.observacao ?? ''
      }
    })
  }
  const upd = (campo, valor) => setModal((m) => ({ ...m, form: { ...m.form, [campo]: valor } }))

  function salvar() {
    const f = modal.form
    if (!f.nome.trim()) { setFormErro('Informe o nome do fornecedor.'); return }
    const payload = {
      nome: f.nome.trim(),
      whatsapp: String(f.whatsapp).replace(/\D/g, ''),
      telefone: String(f.telefone).replace(/\D/g, ''),
      email: f.email.trim(),
      website: f.website.trim(),
      endereco: f.endereco.trim(),
      observacao: f.observacao.trim()
    }
    setFormErro(null)
    setSalvando(true)
    const req =
      modal.modo === 'novo'
        ? api.post('/fornecedores', payload)
        : api.put(`/fornecedores/${modal.id}`, payload)
    req
      .then(() => {
        setToast({ message: modal.modo === 'novo' ? 'Fornecedor criado.' : 'Fornecedor atualizado.', type: 'success' })
        setModal(null)
        carregar()
      })
      .catch((e) => setFormErro(e?.response?.data?.error ?? e?.message ?? 'Não foi possível salvar.'))
      .finally(() => setSalvando(false))
  }

  function confirmarExcluir() {
    const alvo = paraExcluir
    if (!alvo) return
    setExcluindo(true)
    api
      .delete(`/fornecedores/${alvo.id}`)
      .then(() => {
        setToast({ message: 'Fornecedor excluído.', type: 'success' })
        setParaExcluir(null)
        if (detalheId === alvo.id) setDetalheId(null)
        carregar()
      })
      .catch((e) =>
        setToast({ message: e?.response?.data?.error ?? e?.message ?? 'Não foi possível excluir.', type: 'error' })
      )
      .finally(() => setExcluindo(false))
  }

  const total = lista.length

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>Fornecedores</h1>
            <div className="page-header-sub">Quem vende cada insumo e por quanto — com histórico de preço.</div>
          </div>
        </div>
        <SkeletonTabela colunas={4} linhas={6} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Fornecedores</h1>
          <div className="page-header-sub">Quem vende cada insumo e por quanto — com histórico de preço.</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNovo}>+ Novo fornecedor</button>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {erro ? (
        <div className="alert alert-red">
          <div>
            <div className="alert-title clr-red">Não foi possível carregar os fornecedores</div>
            <div className="alert-msg">{erro}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={carregar}>Tentar novamente</button>
            </div>
          </div>
        </div>
      ) : total === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          Nenhum fornecedor cadastrado. Use o botão “+ Novo fornecedor” para cadastrar o primeiro.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Insumos</th>
                <th>Contato</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                return (
                  <tr key={f.id}>
                    <td
                      style={{ fontWeight: 600, color: 'var(--app-text)', cursor: 'pointer' }}
                      onClick={() => setDetalheId(f.id)}
                      title="Ver insumos e preços"
                    >
                      {f.nome}
                    </td>
                    <td>
                      <span className="badge badge-gray">
                        {f.qtdInsumos ?? 0} insumo{(f.qtdInsumos ?? 0) === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td><ContatosFornecedor f={f} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn-primary" onClick={() => setDetalheId(f.id)}>
                          Ver insumos
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => abrirEditar(f)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-lixeira"
                          aria-label="Excluir"
                          title="Excluir"
                          onClick={() => setParaExcluir(f)}
                        >
                          <IconeLixeira />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar/editar — só fecha pelo botão (nunca no overlay). */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">{modal.modo === 'novo' ? 'Novo fornecedor' : 'Editar fornecedor'}</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Nome <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className="form-input"
                value={modal.form.nome}
                onChange={(e) => upd('nome', e.target.value)}
                placeholder="Ex.: Distribuidora Central"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 12, flex: 1, minWidth: 160 }}>
                <label className="form-label">WhatsApp</label>
                <input
                  className="form-input"
                  value={modal.form.whatsapp}
                  onChange={(e) => upd('whatsapp', mascararTelefone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="numeric"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12, flex: 1, minWidth: 160 }}>
                <label className="form-label">Telefone</label>
                <input
                  className="form-input"
                  value={modal.form.telefone}
                  onChange={(e) => upd('telefone', mascararTelefone(e.target.value))}
                  placeholder="(00) 0000-0000"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">E-mail</label>
              <input
                className="form-input"
                type="email"
                value={modal.form.email}
                onChange={(e) => upd('email', e.target.value)}
                placeholder="contato@fornecedor.com"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Website</label>
              <input
                className="form-input"
                value={modal.form.website}
                onChange={(e) => upd('website', e.target.value)}
                placeholder="www.fornecedor.com.br"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Endereço <span className="clr-muted" style={{ fontWeight: 400 }}>(local para comprar)</span></label>
              <input
                className="form-input"
                value={modal.form.endereco}
                onChange={(e) => upd('endereco', e.target.value)}
                placeholder="Rua, número, bairro, cidade"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 4 }}>
              <label className="form-label">Observação</label>
              <textarea
                className="form-input"
                value={modal.form.observacao}
                onChange={(e) => upd('observacao', e.target.value)}
                placeholder="Prazo de entrega, pedido mínimo, condições…"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            {formErro && (
              <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="alert-msg clr-red">{formErro}</div>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={salvando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar fornecedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalheId !== null && (
        <FornecedorDetalhe
          fornecedorId={detalheId}
          onClose={() => setDetalheId(null)}
          onToast={setToast}
        />
      )}

      <ConfirmDialog
        open={paraExcluir !== null}
        title="Excluir fornecedor?"
        message={paraExcluir ? `Você está prestes a excluir "${paraExcluir.nome}".` : ''}
        description="Ele deixará de aparecer na lista. O histórico de cotações é preservado."
        confirmLabel="Excluir fornecedor"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmarExcluir}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  )
}

// ================= Detalhe do fornecedor (modal) =================
function FornecedorDetalhe({ fornecedorId, onClose, onToast }) {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  // Controle das ações inline por insumo (fornecedorInsumoId):
  const [cotacaoAberta, setCotacaoAberta] = useState(null) // fornecedorInsumoId | null
  const [historicoAberto, setHistoricoAberto] = useState(null)

  function carregar() {
    setLoading(true)
    setErro(null)
    api
      .get(`/fornecedores/${fornecedorId}`)
      .then((r) => setDados(r.data))
      .catch((err) => setErro(err?.response?.data?.error ?? err?.message ?? 'Erro ao carregar o fornecedor.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [fornecedorId])

  const insumos = dados?.insumos ?? []

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 720, width: '100%' }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{dados?.nome ?? 'Fornecedor'}</span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>

        {loading ? (
          <div className="loading-state" style={{ padding: '24px 0' }}>Carregando…</div>
        ) : erro ? (
          <div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div>
        ) : (
          <>
            {/* Cabeçalho: contato + observação */}
            <div style={{ marginBottom: 8 }}>
              <ContatosFornecedor f={dados} size="normal" />
            </div>
            {dados.observacao && (
              <div className="alert alert-gray" style={{ marginBottom: 12, padding: '8px 12px' }}>
                <div className="alert-msg">{dados.observacao}</div>
              </div>
            )}

            <div className="section-title" style={{ marginTop: 6 }}>Insumos fornecidos</div>

            {insumos.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 16px' }}>
                Este fornecedor ainda não tem insumos vinculados.
              </div>
            ) : (
              <div className="table-card">
                <table className="hb-table">
                  <thead>
                    <tr>
                      <th>Insumo</th>
                      <th>Preço atual</th>
                      <th>Tendência</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insumos.map((ins) => (
                      <ItemInsumo
                        key={ins.fornecedorInsumoId}
                        insumo={ins}
                        cotacaoAberta={cotacaoAberta === ins.fornecedorInsumoId}
                        historicoAberto={historicoAberto === ins.fornecedorInsumoId}
                        onToggleCotacao={() =>
                          setCotacaoAberta((v) => (v === ins.fornecedorInsumoId ? null : ins.fornecedorInsumoId))
                        }
                        onToggleHistorico={() =>
                          setHistoricoAberto((v) => (v === ins.fornecedorInsumoId ? null : ins.fornecedorInsumoId))
                        }
                        onSalvo={() => {
                          setCotacaoAberta(null)
                          carregar()
                        }}
                        onToast={onToast}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Linha de um insumo + áreas expansíveis (registrar cotação / ver histórico).
function ItemInsumo({ insumo, cotacaoAberta, historicoAberto, onToggleCotacao, onToggleHistorico, onSalvo, onToast }) {
  return (
    <>
      <tr>
        <td style={{ fontWeight: 500, color: 'var(--app-text)' }}>
          {insumo.insumoNome}
          {insumo.unidade && <span className="clr-muted" style={{ fontSize: 12, marginLeft: 6 }}>({insumo.unidade})</span>}
        </td>
        <td>{brl(insumo.precoAtual)}
          {insumo.precoAtualEm && (
            <div className="clr-muted" style={{ fontSize: 11, marginTop: 2 }}>em {dataBR(insumo.precoAtualEm)}</div>
          )}
        </td>
        <td><Tendencia tendencia={insumo.tendencia} /></td>
        <td style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              className={'btn ' + (cotacaoAberta ? 'btn-primary' : 'btn-secondary')}
              onClick={onToggleCotacao}
            >
              Registrar cotação
            </button>
            <button
              type="button"
              className={'btn ' + (historicoAberto ? 'btn-primary' : 'btn-secondary')}
              onClick={onToggleHistorico}
            >
              Histórico
            </button>
          </div>
        </td>
      </tr>
      {cotacaoAberta && (
        <tr>
          <td colSpan={4} style={{ background: 'var(--app-surface-2)' }}>
            <CotacaoForm fornecedorInsumoId={insumo.fornecedorInsumoId} onSalvo={onSalvo} onToast={onToast} />
          </td>
        </tr>
      )}
      {historicoAberto && (
        <tr>
          <td colSpan={4} style={{ background: 'var(--app-surface-2)' }}>
            <HistoricoCotacoes fornecedorInsumoId={insumo.fornecedorInsumoId} />
          </td>
        </tr>
      )}
    </>
  )
}

// Mini-form de nova cotação.
function CotacaoForm({ fornecedorInsumoId, onSalvo, onToast }) {
  const [preco, setPreco] = useState('')
  const [data, setData] = useState(hojeISO())
  const [observacao, setObservacao] = useState('')
  const [usarComoCusto, setUsarComoCusto] = useState(false)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  function salvar() {
    const p = Number(preco)
    if (preco === '' || !Number.isFinite(p) || p <= 0) {
      setErro('Informe um preço maior que zero.')
      return
    }
    setErro(null)
    setSalvando(true)
    api
      .post(`/fornecedor-insumo/${fornecedorInsumoId}/cotacao`, {
        preco: p,
        data: data || undefined,
        observacao: observacao.trim() || undefined,
        usarComoCusto
      })
      .then(() => {
        onToast?.({
          message: usarComoCusto ? 'Cotação registrada e definida como custo do insumo.' : 'Cotação registrada.',
          type: 'success'
        })
        onSalvo?.()
      })
      .catch((e) => setErro(e?.response?.data?.error ?? e?.message ?? 'Não foi possível registrar a cotação.'))
      .finally(() => setSalvando(false))
  }

  return (
    <div style={{ padding: '12px 8px' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
          <label className="form-label">Preço (R$)</label>
          <InputMoeda className="form-input" valor={preco} onChange={setPreco} placeholder="0,00" autoFocus />
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
          <label className="form-label">Data</label>
          <input className="form-input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
          <label className="form-label">Observação (opcional)</label>
          <input
            className="form-input"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: promoção, pedido acima de 10kg…"
          />
        </div>
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={usarComoCusto} onChange={(e) => setUsarComoCusto(e.target.checked)} />
        <span style={{ fontSize: 13 }}>Usar este preço como custo do insumo</span>
      </label>
      {erro && <div className="alert alert-red" style={{ marginTop: 10, marginBottom: 0 }}><div className="alert-msg clr-red">{erro}</div></div>}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar cotação'}
        </button>
      </div>
    </div>
  )
}

// Histórico de cotações (data → preço) com seta de variação vs. a cotação anterior
// (mais antiga) e um mini gráfico da evolução.
function HistoricoCotacoes({ fornecedorInsumoId }) {
  const [cotacoes, setCotacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setErro(null)
    api
      .get(`/fornecedor-insumo/${fornecedorInsumoId}/cotacoes`)
      .then((r) => { if (vivo) setCotacoes(Array.isArray(r.data) ? r.data : []) })
      .catch((e) => { if (vivo) setErro(e?.response?.data?.error ?? e?.message ?? 'Erro ao carregar o histórico.') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [fornecedorInsumoId])

  // A API devolve em ordem decrescente (recente → antigo); a série cronológica
  // do gráfico é o inverso.
  const serie = useMemo(() => [...cotacoes].reverse().map((c) => Number(c.preco)), [cotacoes])

  if (loading) return <div style={{ padding: '12px 8px' }}><div className="loading-state">Carregando histórico…</div></div>
  if (erro) return <div style={{ padding: '12px 8px' }}><div className="alert alert-red"><div className="alert-msg clr-red">{erro}</div></div></div>
  if (cotacoes.length === 0) {
    return <div style={{ padding: '12px 8px' }}><div className="clr-muted" style={{ fontSize: 13 }}>Nenhuma cotação registrada ainda.</div></div>
  }

  return (
    <div style={{ padding: '12px 8px' }}>
      {serie.length >= 2 && (
        <div className="card" style={{ marginBottom: 12, padding: 8 }}>
          <MiniGrafico valores={serie} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cotacoes.map((c, i) => {
          // Cotação imediatamente anterior no tempo = a próxima na lista (ordem desc).
          const anterior = cotacoes[i + 1]
          let variacao = null
          if (anterior) {
            const at = Number(c.preco)
            const ant = Number(anterior.preco)
            if (Number.isFinite(at) && Number.isFinite(ant) && ant !== 0) {
              const pct = ((at - ant) / ant) * 100
              const dir = at > ant ? 'up' : at < ant ? 'down' : 'flat'
              variacao = { direcao: dir, pct }
            }
          }
          return (
            <div
              key={c.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--app-surface, #fff)', border: '1px solid var(--app-border, #eee)' }}
            >
              <span className="clr-muted" style={{ fontSize: 13 }}>{dataBR(c.data)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {c.observacao && <span className="clr-muted" style={{ fontSize: 12 }}>{c.observacao}</span>}
                {variacao && <Tendencia tendencia={variacao} />}
                <strong style={{ minWidth: 84, textAlign: 'right' }}>{brl(c.preco)}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
