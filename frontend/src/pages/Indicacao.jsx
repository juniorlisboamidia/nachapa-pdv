// Marketing › Programa de Indicação (admin). As seções viram itens da sidebar
// (rota /indicacao/:secao): Configuração, Promotores, Recompensas, Indicações,
// Cupons (puxa os cupons do Cardápio Web + criar novo). Consome /api/indicacao/*.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import CupomTicket, { cupomBg } from '../components/CupomTicket'
import BotaoCopiar from '../components/BotaoCopiar'
import { mascararTelefone, formatarWhats } from '../utils/telefone'

const DESTINO_LABEL = { SALAO: 'Salão', DELIVERY: 'Delivery' }
const IND_STATUS = { PENDENTE: { label: 'Pendente', cls: 'badge-yellow' }, VALIDADA: { label: 'Validada', cls: 'badge-green' }, CANCELADA: { label: 'Cancelada', cls: 'badge-gray' } }
const origin = typeof window !== 'undefined' ? window.location.origin : ''

const SECOES = ['painel-geral', 'config', 'promotores', 'recompensas', 'indicacoes', 'cupons']
const SECAO_LABEL = { 'painel-geral': 'Painel Geral', config: 'Personalização', promotores: 'Promotores', recompensas: 'Recompensas', indicacoes: 'Indicações', cupons: 'Cupons' }
const SECAO_SUB = {
  promotores: 'Clientes cadastrados no programa de indicação',
  recompensas: 'Marcos que o promotor desbloqueia conforme acumula indicações validadas.',
}
const DEST_LABEL = { salao: 'Salão', delivery: 'Delivery', retirada: 'Retirada' }
const DEST_OPCOES = [['salao', 'Salão'], ['delivery', 'Delivery'], ['retirada', 'Retirada']]
const TIPO_PROMOTOR = {
  CLIENTE: { label: 'Cliente', cls: 'badge-blue' },
  INFLUENCER: { label: 'Influencer', cls: 'badge-orange' },
  PARCEIRA: { label: 'Página Parceira', cls: 'badge-strategic' },
}
const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v) => `${((Number(v) || 0) * 100).toFixed(1).replace('.', ',')}%`
const descontoAmigoLabel = (tipo, valor) => tipo === 'free_shipping' ? 'Frete grátis' : tipo === 'flat_discount' ? `R$ ${(Number(valor) || 0).toFixed(2).replace('.', ',')} OFF` : `${valor || 0}% OFF`
const fmtDataHora = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// Opções do Cardápio Web (tipos de pedido = onde o cupom vale; dias da semana).
const ORDER_TYPES = [{ v: 'delivery', l: 'Delivery' }, { v: 'takeout', l: 'Retirada' }, { v: 'onsite', l: 'Salão' }]
const WEEK_DAYS = [{ v: 'monday', l: 'Seg' }, { v: 'tuesday', l: 'Ter' }, { v: 'wednesday', l: 'Qua' }, { v: 'thursday', l: 'Qui' }, { v: 'friday', l: 'Sex' }, { v: 'saturday', l: 'Sáb' }, { v: 'sunday', l: 'Dom' }]

const TIPO_CUPOM = {
  percent_discount: (c) => `${c.value}%`,
  flat_discount: (c) => `R$ ${Number(c.value).toFixed(2)}`,
  free_shipping: () => 'Frete grátis',
}
const descontoLabel = (c) => (TIPO_CUPOM[c.type] ? TIPO_CUPOM[c.type](c) : c.type)
function regrasLabel(c) {
  const p = []
  if (c.use_limit != null) p.push(`limite ${c.use_limit}`)
  if (c.new_customers_only) p.push('novos clientes')
  if (c.minimum_order_value) p.push(`mín. R$ ${Number(c.minimum_order_value).toFixed(2)}`)
  if (c.expires_at) p.push(`até ${c.expires_at}`)
  return p.join(' · ') || '—'
}

export default function Indicacao() {
  const { secao: secaoParam } = useParams()
  const secao = SECOES.includes(secaoParam) ? secaoParam : 'painel-geral'
  const [toast, setToast] = useState(null)

  const [config, setConfig] = useState(null)
  const [lojaInfo, setLojaInfo] = useState(null) // { nome, logo } — p/ a prévia
  const [recompensas, setRecompensas] = useState([])
  const [promotores, setPromotores] = useState([])
  const [indicacoes, setIndicacoes] = useState([])
  const [loading, setLoading] = useState(true)

  // CW cupons (aba Cupons)
  const [cwCupons, setCwCupons] = useState(null) // null=carregando | { conectado, coupons }
  const [modalCupom, setModalCupom] = useState(null)
  const [cupomToggling, setCupomToggling] = useState(null) // id do cupom em atualização
  const [cupomBusca, setCupomBusca] = useState('') // filtro por nome/código

  // Painel Geral (KPIs)
  const [painel, setPainel] = useState(null) // null=carregando
  const [cwWebhook, setCwWebhook] = useState(null) // null=carregando | { conectado, url }

  // modais
  const [modalRec, setModalRec] = useState(null)   // { id?, form:{meta,titulo,tipo,destino,emoji,descricao,ativo} }
  const [recTab, setRecTab] = useState('marcos')   // marcos | historico
  const [historico, setHistorico] = useState(null) // null=carregando | array | {erro}
  const [modalProm, setModalProm] = useState(null) // { form:{nome,whatsapp} }
  const [salvando, setSalvando] = useState(false)
  const [confirm, setConfirm] = useState(null)     // { titulo, msg, acao }
  const bannerRef = useRef(null)

  function toastErr(e, fb) { setToast({ message: e?.response?.data?.error ?? fb, type: 'error' }) }
  function copiarFallback(txt, ok) {
    try {
      const ta = document.createElement('textarea')
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      ok()
    } catch { setToast({ message: txt, type: 'info' }) }
  }
  function copiar(txt, msg = 'Link copiado!') {
    const ok = () => setToast({ message: msg, type: 'success' })
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(ok, () => copiarFallback(txt, ok))
      else copiarFallback(txt, ok)
    } catch { copiarFallback(txt, ok) }
  }

  useEffect(() => {
    let vivo = true
    Promise.all([
      api.get('/indicacao/config').then((r) => r.data).catch(() => null),
      api.get('/indicacao/recompensas').then((r) => r.data).catch(() => []),
      api.get('/indicacao/promotores').then((r) => r.data).catch(() => []),
      api.get('/indicacao/indicacoes').then((r) => r.data).catch(() => []),
    ]).then(([cfg, rec, prom, ind]) => {
      if (!vivo) return
      setConfig(cfg); setLojaInfo(cfg?.loja || null); setRecompensas(rec || []); setPromotores(prom || []); setIndicacoes(ind || []); setLoading(false)
    })
    return () => { vivo = false }
  }, [])

  // Painel Geral — recarrega ao abrir a seção.
  useEffect(() => {
    if (secao !== 'painel-geral') return
    setPainel(null)
    api.get('/indicacao/painel').then((r) => setPainel(r.data)).catch(() => setPainel({ erro: true }))
  }, [secao])

  // Histórico de resgates — recarrega ao abrir a aba (dado de auditoria sempre fresco).
  useEffect(() => {
    if (secao !== 'recompensas' || recTab !== 'historico') return
    setHistorico(null)
    api.get('/indicacao/recompensas/historico').then((r) => setHistorico(r.data)).catch(() => setHistorico({ erro: true }))
  }, [secao, recTab])

  // Cupons do CW carregam sob demanda (chamam o CW via HUB).
  useEffect(() => {
    if (secao !== 'cupons') return
    setCwCupons(null)
    api.get('/indicacao/cw-cupons').then((r) => setCwCupons(r.data)).catch(() => setCwCupons({ conectado: false, erro: true }))
  }, [secao])

  // URL do webhook (auto-validação) — carrega ao abrir a Configuração.
  useEffect(() => {
    if (secao !== 'config' || cwWebhook !== null) return
    api.get('/indicacao/cw-webhook').then((r) => setCwWebhook(r.data)).catch(() => setCwWebhook({ conectado: false }))
  }, [secao, cwWebhook])

  const recarregarRecompensas = () => api.get('/indicacao/recompensas').then((r) => setRecompensas(r.data)).catch(() => {})
  const recarregarPromotores = () => api.get('/indicacao/promotores').then((r) => setPromotores(r.data)).catch(() => {})

  // ----- Config -----
  async function salvarConfig(patch) {
    try { const r = await api.put('/indicacao/config', patch); setConfig(r.data); return true }
    catch (e) { toastErr(e, 'Não foi possível salvar.'); return false }
  }
  async function rotacionar(qual) {
    try { const r = await api.post('/indicacao/config/rotacionar', { qual }); setConfig(r.data); setToast({ message: 'Link atualizado. O antigo deixou de funcionar.', type: 'success' }) }
    catch (e) { toastErr(e, 'Não foi possível atualizar o link.') }
  }
  function onBanner(e) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = ''
    if (file.size > 3 * 1024 * 1024) return setToast({ message: 'Imagem muito grande. Use até ~3 MB.', type: 'error' })
    const reader = new FileReader()
    reader.onload = async (ev) => { const ok = await salvarConfig({ bannerDataUrl: String(ev.target.result) }); if (ok) setToast({ message: 'Banner atualizado.', type: 'success' }) }
    reader.readAsDataURL(file)
  }

  // ----- Recompensa -----
  async function salvarRecompensa() {
    const f = modalRec.form
    const meta = Number(f.meta)
    if (!Number.isInteger(meta) || meta <= 0) return setToast({ message: 'Meta deve ser um número inteiro positivo.', type: 'error' })
    if (!f.titulo.trim()) return setToast({ message: 'Informe o título da recompensa.', type: 'error' })
    setSalvando(true)
    const payload = { meta, titulo: f.titulo, tipo: f.tipo, destinos: f.tipo === 'CONSUMO' ? (f.destinos || []) : [], emoji: (f.emoji || '').trim(), descricao: f.descricao || '', ativo: !!f.ativo }
    try {
      if (modalRec.id) await api.put(`/indicacao/recompensas/${modalRec.id}`, payload)
      else await api.post('/indicacao/recompensas', payload)
      setModalRec(null); await recarregarRecompensas(); setToast({ message: 'Recompensa salva.', type: 'success' })
    } catch (e) { toastErr(e, 'Não foi possível salvar a recompensa.') }
    finally { setSalvando(false) }
  }
  function excluirRecompensa(r) {
    setConfirm({
      titulo: 'Excluir recompensa', msg: `Excluir "${r.titulo}" (meta ${r.meta})?`,
      acao: async () => { try { await api.delete(`/indicacao/recompensas/${r.id}`); await recarregarRecompensas(); setToast({ message: 'Recompensa excluída.', type: 'success' }) } catch (e) { toastErr(e, 'Não foi possível excluir.') } finally { setConfirm(null) } },
    })
  }
  function abrirRecompensa(r) {
    if (r) setModalRec({ id: r.id, form: { meta: String(r.meta), titulo: r.titulo, tipo: r.tipo || 'CONSUMO', destinos: r.destinos || [], emoji: r.emoji ?? '🎁', descricao: r.descricao ?? '', ativo: r.ativo } })
    else setModalRec({ form: { meta: '', titulo: '', tipo: 'CONSUMO', destinos: [], emoji: '🎁', descricao: '', ativo: true } })
  }

  // ----- Promotor -----
  async function salvarPromotor() {
    const f = modalProm.form
    if (!f.nome.trim()) return setToast({ message: 'Informe o nome.', type: 'error' })
    if (!f.whatsapp.replace(/\D/g, '')) return setToast({ message: 'Informe um WhatsApp válido.', type: 'error' })
    setSalvando(true)
    try { await api.post('/indicacao/promotores', { nome: f.nome, whatsapp: f.whatsapp, tipo: f.tipo }); setModalProm(null); await recarregarPromotores(); setToast({ message: 'Promotor criado.', type: 'success' }) }
    catch (e) { toastErr(e, 'Não foi possível criar o promotor.') }
    finally { setSalvando(false) }
  }
  async function alternarPromotor(p) {
    const novo = p.status === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO'
    try { await api.put(`/indicacao/promotores/${p.id}`, { status: novo }); await recarregarPromotores() }
    catch (e) { toastErr(e, 'Não foi possível atualizar.') }
  }

  // ----- Cupom CW -----
  async function salvarCupomCw() {
    const f = modalCupom
    if (!f.name.trim()) return setToast({ message: 'Informe o nome do cupom.', type: 'error' })
    const val = f.type === 'free_shipping' ? null : Number(String(f.value).replace(',', '.'))
    if (f.type !== 'free_shipping' && (!Number.isFinite(val) || val <= 0)) return setToast({ message: 'Informe um valor válido.', type: 'error' })
    setSalvando(true)
    try {
      const coupon = { name: f.name.trim(), type: f.type, value: val, active: !!f.active, new_customers_only: !!f.new_customers_only, customer_multi_use: !!f.customer_multi_use }
      if (f.code.trim()) coupon.code = f.code.trim()
      if (f.use_limit) coupon.use_limit = Number(f.use_limit)
      if (f.minimum_order_value) coupon.minimum_order_value = Number(String(f.minimum_order_value).replace(',', '.'))
      if (f.available_from) coupon.available_from = f.available_from
      if (f.expires_at) coupon.expires_at = f.expires_at
      if (f.availability_start_time) coupon.availability_start_time = f.availability_start_time
      if (f.availability_end_time) coupon.availability_end_time = f.availability_end_time
      if (f.available_days?.length) coupon.available_days = f.available_days
      if (f.available_order_types?.length) coupon.available_order_types = f.available_order_types
      await api.post('/indicacao/cw-cupons', { coupon })
      setModalCupom(null)
      const r = await api.get('/indicacao/cw-cupons'); setCwCupons(r.data)
      setToast({ message: 'Cupom criado no Cardápio Web.', type: 'success' })
    } catch (e) { toastErr(e, 'Não foi possível criar o cupom.') }
    finally { setSalvando(false) }
  }

  // Ativa/desativa o cupom direto no CW (toggle na lista). Otimista, reverte no erro.
  async function toggleCwCupom(c) {
    if (cupomToggling) return
    const novo = !c.active
    setCupomToggling(c.id)
    setCwCupons((prev) => prev && { ...prev, coupons: prev.coupons.map((x) => (x.id === c.id ? { ...x, active: novo } : x)) })
    try {
      await api.post('/indicacao/cw-cupons/status', { couponId: c.id, active: novo })
      setToast({ message: novo ? 'Cupom ativado.' : 'Cupom desativado.', type: 'success' })
    } catch (e) {
      setCwCupons((prev) => prev && { ...prev, coupons: prev.coupons.map((x) => (x.id === c.id ? { ...x, active: c.active } : x)) })
      toastErr(e, 'Não foi possível atualizar o cupom.')
    } finally { setCupomToggling(null) }
  }

  // Cupons do mais recente pro mais antigo (igual ao painel do CW) + filtro por nome/código
  const termoCupom = cupomBusca.trim().toLowerCase()
  const cuponsOrdenados = (cwCupons?.coupons || []).slice().sort((a, b) => (b.id || 0) - (a.id || 0))
  const cuponsFiltrados = termoCupom
    ? cuponsOrdenados.filter((c) => (c.name || '').toLowerCase().includes(termoCupom) || (c.code || '').toLowerCase().includes(termoCupom))
    : cuponsOrdenados

  // Campo de cor: seletor (swatch) + HEX digitável, ambos aplicando ao vivo.
  function campoCor(key, label) {
    const val = config[key] || ''
    const valido = /^#[0-9a-fA-F]{6}$/.test(val)
    const commit = (v) => { if (/^#[0-9a-fA-F]{6}$/.test(v)) salvarConfig({ [key]: v }) }
    return (
      <div className="ind-cor" key={key}>
        <label className="form-label">{label}</label>
        <div className="ind-cor-row">
          <input type="color" className="ind-cor-input" value={valido ? val : '#000000'} onChange={(e) => setConfig({ ...config, [key]: e.target.value })} onBlur={(e) => commit(e.target.value)} />
          <input type="text" className="form-input ind-cor-hex" value={val} maxLength={7} placeholder="#000000" spellCheck={false}
            onChange={(e) => { const v = '#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6); setConfig({ ...config, [key]: v }); commit(v) }}
            onBlur={(e) => commit(e.target.value)} />
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>{SECAO_LABEL[secao]}</h1>
          <div className="page-header-sub">{SECAO_SUB[secao] || 'Programa de Indicação — Marketing.'}</div>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {loading ? <div className="loading-state">Carregando…</div> : (
        <>
          {/* ===== PAINEL GERAL ===== */}
          {secao === 'painel-geral' && (
            painel === null ? <div className="loading-state">Carregando painel…</div>
            : painel.erro ? <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: '#777' }}>Não foi possível carregar o painel.</div>
            : (
              <div className="ip-wrap">
                <div className="ip-hero">
                  <div className="ip-card">
                    <div className="ip-ico ip-ico-blue">👥</div>
                    <div className="ip-card-body">
                      <div className="ip-card-title">Promotores</div>
                      <div className="ip-card-value">{painel.promotores}</div>
                      <div className="ip-card-sub">{painel.promotoresAtivos} ativo{painel.promotoresAtivos === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <div className="ip-card">
                    <div className="ip-ico ip-ico-orange">🤝</div>
                    <div className="ip-card-body">
                      <div className="ip-card-title">Indicações</div>
                      <div className="ip-card-value">{painel.indicacoes}</div>
                      <div className="ip-card-sub">{painel.validadas} validada{painel.validadas === 1 ? '' : 's'} · {painel.pendentes} pendente{painel.pendentes === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <div className="ip-card">
                    <div className="ip-ico ip-ico-green">💰</div>
                    <div className="ip-card-body">
                      <div className="ip-card-title">Faturamento</div>
                      <div className="ip-card-value">{moeda(painel.faturamento)}</div>
                      <div className="ip-card-sub">gerado via cupons do programa (Cardápio Web)</div>
                    </div>
                  </div>
                </div>

                <div className="ip-mini-grid">
                  <div className="ip-mini">
                    <div className="ip-mini-label">Cupons gerados</div>
                    <div className="ip-mini-value">{painel.cuponsGerados}</div>
                    <div className="ip-mini-note">cupons de boas-vindas dos amigos</div>
                  </div>
                  <div className="ip-mini">
                    <div className="ip-mini-label">Cupons utilizados</div>
                    <div className="ip-mini-value">{painel.cuponsUsados}</div>
                    <div className="ip-mini-note">{pct(painel.convUso)} de conversão dos gerados</div>
                  </div>
                  <div className="ip-mini">
                    <div className="ip-mini-label">Indicações validadas</div>
                    <div className="ip-mini-value">{painel.validadas}</div>
                    <div className="ip-mini-note">{pct(painel.convValidacao)} de conversão das indicações</div>
                  </div>
                  <div className="ip-mini">
                    <div className="ip-mini-label">Ticket médio</div>
                    <div className="ip-mini-value">{moeda(painel.ticketMedio)}</div>
                    <div className="ip-mini-note">por cupom utilizado</div>
                  </div>
                </div>

                <div className="table-card">
                  <div className="ip-rank-head">
                    <div className="ip-rank-title">Ranking de Promotores</div>
                    <div className="ip-rank-sub">Top por indicações validadas</div>
                  </div>
                  {painel.topPromotores.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 20px', color: '#999' }}>Nenhuma indicação validada ainda.</div>
                  ) : (
                    <table className="hb-table">
                      <thead><tr><th style={{ width: 80 }}>Ranking</th><th>Nome</th><th style={{ textAlign: 'right' }}>Validadas</th></tr></thead>
                      <tbody>
                        {painel.topPromotores.map((p, i) => (
                          <tr key={i}>
                            <td>{['🥇', '🥈', '🥉'][i] || `${i + 1}º`}</td>
                            <td>{p.nome}{p.status === 'BLOQUEADO' && <span className="badge badge-gray" style={{ marginLeft: 8 }}>bloqueado</span>}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.validadas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="ip-foot">O faturamento é capturado do Cardápio Web quando o cupom de boas-vindas do amigo é usado num pedido (via webhook). Indicações validadas manualmente no balcão não somam faturamento.</div>
              </div>
            )
          )}

          {/* ===== CONFIG (Personalização) ===== */}
          {secao === 'config' && config && (
            <div className="ind-cfg-layout">
              <div className="ind-cfg">
              <div className="card">
                <div className="ind-toggle-row">
                  <div className="ind-toggle-text">
                    <div className="ind-toggle-title">Programa ativo</div>
                    <div className="ind-toggle-desc">Quando ligado, as páginas públicas (Seja Promotor e link do amigo) ficam abertas.</div>
                  </div>
                  <label className="tgl"><input type="checkbox" checked={config.ativo} onChange={(e) => salvarConfig({ ativo: e.target.checked })} /><span className="tgl-track" /></label>
                </div>
              </div>

              <div className="card">
                <div className="ind-sec-head">
                  <div className="ind-sec-title">Cupom de boas-vindas do amigo</div>
                  <div className="ind-sec-sub">O presente que o amigo indicado recebe ao se cadastrar.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Título do cupom</label>
                  <input className="form-input" value={config.cupomAmigoTitulo} onChange={(e) => setConfig({ ...config, cupomAmigoTitulo: e.target.value })} onBlur={(e) => salvarConfig({ cupomAmigoTitulo: e.target.value })} placeholder="Ex.: 15% no primeiro pedido" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de desconto</label>
                  <div className="seg">
                    {[['percent_discount', 'Desconto %'], ['flat_discount', 'Desconto R$'], ['free_shipping', 'Frete grátis']].map(([v, l]) => (
                      <button key={v} type="button" className={'seg-btn' + ((config.cupomAmigoTipoDesconto || 'percent_discount') === v ? ' seg-btn-on' : '')} onClick={() => { setConfig({ ...config, cupomAmigoTipoDesconto: v }); salvarConfig({ cupomAmigoTipoDesconto: v }) }}>{l}</button>
                    ))}
                  </div>
                </div>
                {(config.cupomAmigoTipoDesconto || 'percent_discount') !== 'free_shipping' && (
                  <div className="form-group">
                    <label className="form-label">{config.cupomAmigoTipoDesconto === 'flat_discount' ? 'Valor (R$)' : 'Percentual (%)'}</label>
                    <input className="form-input" inputMode="decimal" value={config.cupomAmigoValor ?? ''} onChange={(e) => setConfig({ ...config, cupomAmigoValor: e.target.value.replace(/[^\d.,]/g, '') })} onBlur={(e) => salvarConfig({ cupomAmigoValor: Number(String(e.target.value).replace(',', '.')) || null })} placeholder="10" />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Tipos de pedido (onde o cupom vale)</label>
                  <div className="chip-row">
                    {ORDER_TYPES.map((o) => {
                      const sel = (config.cupomAmigoTipos || []).includes(o.v)
                      return <button key={o.v} type="button" className={'chip' + (sel ? ' chip-on' : '')} onClick={() => { const cur = config.cupomAmigoTipos || []; const novo = sel ? cur.filter((x) => x !== o.v) : [...cur, o.v]; setConfig({ ...config, cupomAmigoTipos: novo }); salvarConfig({ cupomAmigoTipos: novo }) }}>{o.l}</button>
                    })}
                  </div>
                  <div className="ind-hint" style={{ marginTop: 6 }}>Nenhum marcado = vale para todos os tipos (salão, delivery e retirada).</div>
                </div>
                <div className="ind-note">Com o <strong>Cardápio Web conectado</strong>, ao se cadastrar o amigo recebe um cupom único no CW (código aleatório, uso único, só novos clientes) com esse desconto. Sem CW, o código vale a baixa manual no balcão.</div>
              </div>

              <div className="card">
                <div className="ind-sec-head">
                  <div className="ind-sec-title">Aparência do cupom</div>
                  <div className="ind-sec-sub">Emoji e cores do cupom/botão na página do amigo (veja na prévia ao lado).</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Emoji do cupom</label>
                  <div className="ind-emoji-row">
                    <input className="form-input ind-emoji-input" value={config.cupomEmoji ?? ''} maxLength={8} placeholder="🎁" onChange={(e) => setConfig({ ...config, cupomEmoji: e.target.value })} onBlur={(e) => salvarConfig({ cupomEmoji: e.target.value.trim() })} />
                    <div className="ind-emoji-presets">
                      {['🎁', '🎉', '🍔', '🍟', '🥤', '🍕', '💰', '⭐', '🔥', '❤️'].map((em) => (
                        <button key={em} type="button" className={'ind-emoji-btn' + (config.cupomEmoji === em ? ' on' : '')} onClick={() => { setConfig({ ...config, cupomEmoji: em }); salvarConfig({ cupomEmoji: em }) }}>{em}</button>
                      ))}
                    </div>
                  </div>
                  <div className="ind-hint" style={{ marginTop: 6 }}>Aparece ao lado do cupom e no topo da página do amigo. Dá para digitar/colar qualquer emoji (ou deixar vazio).</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Estilo da cor do cupom</label>
                  <div className="seg">
                    {[['gradiente', 'Degradê'], ['solido', 'Sólida']].map(([v, l]) => (
                      <button key={v} type="button" className={'seg-btn' + ((config.cupomCorTipo || 'gradiente') === v ? ' seg-btn-on' : '')} onClick={() => { setConfig({ ...config, cupomCorTipo: v }); salvarConfig({ cupomCorTipo: v }) }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="ind-cores">
                  {campoCor('cupomCor1', config.cupomCorTipo === 'solido' ? 'Cor do cupom' : 'Cor inicial')}
                  {config.cupomCorTipo !== 'solido' && campoCor('cupomCor2', 'Cor final')}
                  {campoCor('botaoCor', 'Cor do botão')}
                </div>
              </div>

              <div className="card">
                <div className="ind-sec-head">
                  <div className="ind-sec-title">Campos do formulário</div>
                  <div className="ind-sec-sub">Nome e WhatsApp são sempre pedidos. Escolha o que fazer com os demais.</div>
                </div>
                {[['campoEmail', 'E-mail'], ['campoNascimento', 'Data de nascimento']].map(([campo, label]) => (
                  <div className="form-group" key={campo}>
                    <label className="form-label">{label}</label>
                    <div className="seg">
                      {[['nao', 'Não pedir'], ['opcional', 'Opcional'], ['obrigatorio', 'Obrigatório']].map(([v, l]) => (
                        <button key={v} type="button" className={'seg-btn' + ((config[campo] || 'opcional') === v ? ' seg-btn-on' : '')} onClick={() => { setConfig({ ...config, [campo]: v }); salvarConfig({ [campo]: v }) }}>{l}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div className="ind-sec-head">
                  <div className="ind-sec-title">Banner das páginas públicas</div>
                  <div className="ind-sec-sub">Aparece no topo do link do amigo. Recomendado ~1200×400px.</div>
                </div>
                {config.bannerDataUrl
                  ? <img src={config.bannerDataUrl} alt="Banner" style={{ width: '100%', borderRadius: 10, marginBottom: 12, display: 'block' }} />
                  : <div className="ind-banner-empty">Nenhum banner ainda. Envie uma arte para dar cara ao seu programa.</div>}
                <input type="file" ref={bannerRef} accept="image/*" style={{ display: 'none' }} onChange={onBanner} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => bannerRef.current?.click()}>{config.bannerDataUrl ? 'Trocar banner' : 'Selecionar banner'}</button>
                  {config.bannerDataUrl && <button type="button" className="btn btn-danger btn-sm" onClick={() => salvarConfig({ bannerDataUrl: null })}>Remover</button>}
                </div>
              </div>

              <div className="card">
                <div className="ind-sec-head">
                  <div className="ind-sec-title">Links do programa</div>
                  <div className="ind-sec-sub">Compartilhe estes links. Gerar um novo invalida o anterior.</div>
                </div>
                <div className="ind-link">
                  <div className="ind-link-ico ip-ico-orange">📣</div>
                  <div className="ind-link-body">
                    <div className="ind-link-title">Seja Promotor</div>
                    <div className="ind-link-desc">Divulgue para clientes virarem promotores do programa.</div>
                    <div className="ind-linkfield">
                      <span className="ind-linkfield-url">{`${origin}/indicacao/seja-promotor/${config.promotorToken}`}</span>
                      <BotaoCopiar className="ind-linkfield-copy" label="Copiar" texto={`${origin}/indicacao/seja-promotor/${config.promotorToken}`} onCopiado={() => setToast({ message: 'Link copiado!', type: 'success' })} />
                    </div>
                    <button type="button" className="ind-link-regen" onClick={() => setConfirm({ titulo: 'Gerar novo link', msg: 'O link atual deixará de funcionar. Continuar?', acao: async () => { await rotacionar('promotor'); setConfirm(null) } })}>Gerar novo link</button>
                  </div>
                </div>
                <div className="ind-link">
                  <div className="ind-link-ico ip-ico-blue">🧾</div>
                  <div className="ind-link-body">
                    <div className="ind-link-title">Balcão do atendente <span className="ind-link-tag">secreto</span></div>
                    <div className="ind-link-desc">Tela onde o atendente dá baixa nos cupons. Não divulgue publicamente.</div>
                    <div className="ind-linkfield">
                      <span className="ind-linkfield-url">{`${origin}/indicacao/atendente/${config.atendenteToken}`}</span>
                      <BotaoCopiar className="ind-linkfield-copy" label="Copiar" texto={`${origin}/indicacao/atendente/${config.atendenteToken}`} onCopiado={() => setToast({ message: 'Link copiado!', type: 'success' })} />
                    </div>
                    <button type="button" className="ind-link-regen" onClick={() => setConfirm({ titulo: 'Gerar novo link', msg: 'O link atual do balcão deixará de funcionar. Continuar?', acao: async () => { await rotacionar('atendente'); setConfirm(null) } })}>Gerar novo link</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="ind-sec-head">
                  <div className="ind-sec-title">Validação automática {cwWebhook && <span className={'badge ' + (cwWebhook.conectado ? 'badge-green' : 'badge-gray')}>{cwWebhook.conectado ? 'Cardápio Web conectado' : 'Indisponível'}</span>}</div>
                  <div className="ind-sec-sub">Valida a indicação sozinha quando o amigo usa o cupom num pedido do Cardápio Web.</div>
                </div>
                {cwWebhook?.conectado ? (
                  <div className="ind-link">
                    <div className="ind-link-ico ip-ico-green">⚡</div>
                    <div className="ind-link-body">
                      <div className="ind-link-title">Webhook do Cardápio Web</div>
                      <div className="ind-link-desc">Cole esta URL no painel do Cardápio Web → Webhooks.</div>
                      <div className="ind-linkfield">
                        <span className="ind-linkfield-url">{cwWebhook.url}</span>
                        <BotaoCopiar className="ind-linkfield-copy" label="Copiar" texto={cwWebhook.url} onCopiado={() => setToast({ message: 'URL copiada!', type: 'success' })} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="ind-note">Disponível quando a loja tiver o Cardápio Web conectado (no HUB). Sem isso, a validação é feita pela baixa manual no balcão.</div>
                )}
              </div>
              </div>

              <div className="ind-preview-col">
                <div className="ind-preview">
                  <div className="ind-preview-head">👁 Prévia da página do amigo</div>
                  <div className="ind-preview-frame">
                    <div className="ind-amigo">
                      {config.bannerDataUrl && <img className="ind-amigo-banner" src={config.bannerDataUrl} alt="" />}
                      {lojaInfo?.logo && <img className={'ind-amigo-logo' + (config.bannerDataUrl ? '' : ' ind-amigo-logo-solo')} src={lojaInfo.logo} alt="" />}
                      <div className="ind-amigo-card ind-amigo-hero">
                        <div className="ind-amigo-eyebrow">Indique e Ganhe</div>
                        <div className="ind-amigo-titulo">Maria te enviou um presente!</div>
                        {config.cupomEmoji && <div className="ind-amigo-gift">{config.cupomEmoji}</div>}
                        <div className="ind-amigo-sub">Você ganha um cupom ao aceitar a indicação.</div>
                      </div>
                      <div className="ind-amigo-card ind-ticket-card">
                        <CupomTicket
                          eyebrow={config.cupomAmigoTitulo || 'Cupom de boas-vindas'}
                          value={descontoAmigoLabel(config.cupomAmigoTipoDesconto || 'percent_discount', config.cupomAmigoValor)}
                          caption="Presente exclusivo · o código aparece após o cadastro"
                          bg={cupomBg(config)}
                        />
                      </div>
                      <div className="ind-amigo-card">
                        <div className="ind-amigo-formtitle">Resgate agora</div>
                        <div className="ind-amigo-formsub">Preencha seus dados para garantir seu cupom</div>
                        <div className="form-group"><label className="form-label">Nome *</label><div className="ind-preview-input" /></div>
                        <div className="form-group"><label className="form-label">WhatsApp *</label><div className="ind-preview-input" /></div>
                        {config.campoEmail !== 'nao' && <div className="form-group"><label className="form-label">E-mail {config.campoEmail === 'obrigatorio' ? '*' : '(opcional)'}</label><div className="ind-preview-input" /></div>}
                        {config.campoNascimento !== 'nao' && <div className="form-group"><label className="form-label">Data de nascimento {config.campoNascimento === 'obrigatorio' ? '*' : '(opcional)'}</label><div className="ind-preview-input" /></div>}
                        <button type="button" className="ind-cta" style={/^#[0-9a-fA-F]{6}$/.test(config.botaoCor) ? { background: config.botaoCor } : undefined}>🎟️  Resgatar meu cupom</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== RECOMPENSAS ===== */}
          {secao === 'recompensas' && (
            <>
              <div className="modal-tabs" style={{ marginBottom: 16 }}>
                <button type="button" className={'modal-tab' + (recTab === 'marcos' ? ' active' : '')} onClick={() => setRecTab('marcos')}>Marcos</button>
                <button type="button" className={'modal-tab' + (recTab === 'historico' ? ' active' : '')} onClick={() => setRecTab('historico')}>Histórico</button>
              </div>

              {recTab === 'marcos' && (<>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button type="button" className="btn btn-primary" onClick={() => abrirRecompensa(null)}>+ Nova recompensa</button>
              </div>
              {recompensas.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}>
                  <div style={{ fontSize: 34, marginBottom: 8 }}>🏆</div>
                  Nenhum marco criado ainda. Crie recompensas como "3 indicações = X-Burger grátis" ou "10 = brinde exclusivo".
                </div>
              ) : (
                <div className="ms-list">
                  {recompensas.map((r) => (
                    <div className={'ms-item' + (r.ativo ? '' : ' ms-off')} key={r.id}>
                      <div className="ms-node"><div className="ms-node-num">{r.meta}</div></div>
                      <div className="ms-card">
                        <div className="ms-card-emoji">{r.emoji || '🎁'}</div>
                        <div className="ms-card-body">
                          <div className="ms-card-top">
                            <span className="ms-card-titulo">{r.titulo}</span>
                            <span className={'badge ' + (r.tipo === 'BRINDE' ? 'badge-purple' : 'badge-blue')}>{r.tipo === 'BRINDE' ? 'Brinde' : 'Consumo'}</span>
                            {r.tipo === 'CONSUMO' && ((r.destinos && r.destinos.length)
                              ? r.destinos.map((d) => <span key={d} className="badge badge-gray">{DEST_LABEL[d] ?? d}</span>)
                              : <span className="badge badge-gray">Todos</span>)}
                            {!r.ativo && <span className="badge badge-gray">Inativa</span>}
                          </div>
                          <div className="ms-card-meta">Desbloqueia com {r.meta} {r.meta === 1 ? 'indicação validada' : 'indicações validadas'}</div>
                          {r.descricao && <div className="ms-card-desc">{r.descricao}</div>}
                          <div className={'ms-card-stat' + ((r.resgatadas ?? 0) > 0 ? ' on' : '')}>
                            {(r.resgatadas ?? 0) > 0
                              ? <>🎟️ Resgatada <strong>{r.resgatadas}</strong> {r.resgatadas === 1 ? 'vez' : 'vezes'}</>
                              : 'Ainda não resgatada'}
                          </div>
                        </div>
                        <div className="ms-card-acts">
                          <button type="button" className="ind-act" onClick={() => abrirRecompensa(r)}>Editar</button>
                          <button type="button" className="ind-act ind-act-danger" onClick={() => excluirRecompensa(r)}>Excluir</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </>)}

              {recTab === 'historico' && (
                historico === null ? <div className="loading-state">Carregando histórico…</div>
                : historico.erro ? <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: '#777' }}>Não foi possível carregar o histórico.</div>
                : historico.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}>Nenhum resgate de recompensa registrado ainda. Aqui vão aparecer os resgates com quem resgatou, quando e o atendente.</div>
                : (
                  <div className="table-card">
                    <table className="hb-table">
                      <thead><tr><th>Recompensa</th><th>Promotor</th><th>Quando</th><th>Atendente</th><th>Código</th></tr></thead>
                      <tbody>
                        {historico.map((h) => (
                          <tr key={h.id}>
                            <td><span style={{ marginRight: 6 }}>{h.emoji}</span>{h.titulo}</td>
                            <td><div className="ent-row-id-txt"><span className="ent-row-nome">{h.promotor}</span>{h.whatsapp && <span className="ent-row-whats">{formatarWhats(h.whatsapp)}</span>}</div></td>
                            <td className="hb-num">{fmtDataHora(h.usadoEm)}</td>
                            <td>{h.usadoPor || '—'}</td>
                            <td><strong>{h.codigo}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}

          {/* ===== PROMOTORES ===== */}
          {secao === 'promotores' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => setModalProm({ form: { nome: '', whatsapp: '', tipo: 'CLIENTE' } })}>Novo promotor</button>
              </div>
              {promotores.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: '#777' }}>Nenhum promotor ainda. Divulgue a página "Seja Promotor" ou cadastre um (ex.: influencer).</div>
              ) : (
                <div className="table-card">
                  <table className="hb-table">
                    <thead><tr><th>Promotor</th><th>Tipo</th><th>Indicações</th><th>Validadas</th><th>Recompensas</th><th>Fat. gerado</th><th>Status</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
                    <tbody>
                      {promotores.map((p) => (
                        <tr key={p.id}>
                          <td><div className="ent-row-id-txt"><span className="ent-row-nome">{p.nome}</span><span className="ent-row-whats">{formatarWhats(p.whatsapp)}</span></div></td>
                          <td><span className={'badge ' + (TIPO_PROMOTOR[p.tipo]?.cls || 'badge-blue')}>{TIPO_PROMOTOR[p.tipo]?.label || 'Cliente'}</span></td>
                          <td className="hb-num">{p.totalIndicacoes}</td>
                          <td className="hb-num"><strong>{p.totalValidadas}</strong></td>
                          <td className="hb-num">{p.totalRecompensas}</td>
                          <td className="hb-num">{moeda(p.faturamento)}</td>
                          <td><span className={'badge ' + (p.status === 'ATIVO' ? 'badge-green' : 'badge-red')}>{p.status === 'ATIVO' ? 'Ativo' : 'Bloqueado'}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="ind-acts">
                              <button type="button" className="ind-act" onClick={() => copiar(`${origin}/i/${p.codigo}`, 'Link do amigo copiado!')}><span className="ind-act-ico">🔗</span> Link do amigo</button>
                              <button type="button" className="ind-act" onClick={() => copiar(`${origin}/indicacao/painel/${p.painelToken}`, 'Link do painel copiado!')}><span className="ind-act-ico">📊</span> Painel</button>
                              <button type="button" className={'ind-act' + (p.status === 'ATIVO' ? ' ind-act-danger' : ' ind-act-ok')} onClick={() => alternarPromotor(p)}>{p.status === 'ATIVO' ? '⛔ Bloquear' : '✓ Ativar'}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ===== INDICAÇÕES ===== */}
          {secao === 'indicacoes' && (
            indicacoes.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: '#777' }}>Nenhuma indicação ainda.</div>
            ) : (
              <div className="table-card">
                <table className="hb-table">
                  <thead><tr><th>Amigo</th><th>Promotor</th><th>Cupom</th><th>Status</th></tr></thead>
                  <tbody>
                    {indicacoes.map((i) => (
                      <tr key={i.id}>
                        <td><div className="ent-row-id-txt"><span className="ent-row-nome">{i.amigoNome}</span><span className="ent-row-whats">{formatarWhats(i.amigoWhatsapp)}</span></div></td>
                        <td>{i.promotor?.nome ?? '—'}</td>
                        <td>{i.cupom?.codigo ?? '—'}</td>
                        <td><span className={'badge ' + (IND_STATUS[i.status]?.cls ?? 'badge-gray')}>{IND_STATUS[i.status]?.label ?? i.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ===== CUPONS (Cardápio Web) ===== */}
          {secao === 'cupons' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div className="page-header-sub" style={{ margin: 0 }}>Todos os cupons do Cardápio Web (ativos e inativos).</div>
                <button type="button" className="btn btn-primary" disabled={!cwCupons?.conectado} onClick={() => setModalCupom({ name: '', code: '', type: 'percent_discount', value: '', use_limit: '', minimum_order_value: '', new_customers_only: false, customer_multi_use: false, active: true, available_from: '', expires_at: '', availability_start_time: '', availability_end_time: '', available_days: [], available_order_types: [] })}>+ Novo cupom</button>
              </div>
              {cwCupons === null ? (
                <div className="loading-state">Carregando cupons…</div>
              ) : !cwCupons.conectado ? (
                <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: '#777' }}>Conecte o Cardápio Web a esta loja (no HUB) para gerenciar os cupons por aqui.</div>
              ) : (cwCupons.coupons || []).length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: '#777' }}>Nenhum cupom no Cardápio Web ainda. Crie o primeiro em "+ Novo cupom".</div>
              ) : (
                <>
                  <div className="cup-busca">
                    <span className="cup-busca-ico">🔍</span>
                    <input className="form-input" value={cupomBusca} onChange={(e) => setCupomBusca(e.target.value)} placeholder="Buscar cupom por nome ou código…" />
                    {cupomBusca && <button type="button" className="cup-busca-x" onClick={() => setCupomBusca('')} title="Limpar">×</button>}
                  </div>
                  {cuponsFiltrados.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '28px 20px', color: '#777' }}>Nenhum cupom encontrado para “{cupomBusca}”.</div>
                  ) : (
                    <div className="table-card">
                      <table className="hb-table">
                        <thead><tr><th>Cupom</th><th>Código</th><th>Desconto</th><th>Regras</th><th style={{ textAlign: 'center' }}>Ativo</th></tr></thead>
                        <tbody>
                          {cuponsFiltrados.map((c) => (
                            <tr key={c.id}>
                              <td>{c.name}</td>
                              <td>{c.code ? <strong>{c.code}</strong> : <span style={{ color: '#bbb' }}>sem código</span>}</td>
                              <td>{descontoLabel(c)}</td>
                              <td style={{ fontSize: 12, color: '#777' }}>{regrasLabel(c)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <label className={'tgl' + (cupomToggling === c.id ? ' tgl-busy' : '')} title={c.active ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}>
                                  <input type="checkbox" checked={!!c.active} disabled={cupomToggling === c.id} onChange={() => toggleCwCupom(c)} />
                                  <span className="tgl-track" />
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Modal recompensa */}
      {modalRec && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalRec.id ? 'Editar recompensa' : 'Nova recompensa'}</div>
            <div className="modal-sub">Marco desbloqueado quando o promotor atinge a meta de indicações validadas.</div>

            <div className="form-group">
              <label className="form-label">Meta (indicações validadas)</label>
              <input className="form-input" inputMode="numeric" value={modalRec.form.meta} onChange={(e) => setModalRec({ ...modalRec, form: { ...modalRec.form, meta: e.target.value.replace(/\D/g, '') } })} placeholder="Ex.: 3" />
            </div>
            <div className="form-group">
              <label className="form-label">Recompensa</label>
              <input className="form-input" value={modalRec.form.titulo} onChange={(e) => setModalRec({ ...modalRec, form: { ...modalRec.form, titulo: e.target.value } })} placeholder="Ex.: X-Burger grátis, Camiseta, Brinde exclusivo…" />
            </div>
            <div className="form-group">
              <label className="form-label">Emoji</label>
              <div className="ind-emoji-row">
                <input className="form-input ind-emoji-input" value={modalRec.form.emoji} maxLength={8} placeholder="🎁" onChange={(e) => setModalRec({ ...modalRec, form: { ...modalRec.form, emoji: e.target.value } })} />
                <div className="ind-emoji-presets">
                  {['🎁', '🎟️', '💰', '💵', '🍔', '🍟', '🥤', '🍕', '👕', '🏆'].map((em) => (
                    <button key={em} type="button" className={'ind-emoji-btn' + (modalRec.form.emoji === em ? ' on' : '')} onClick={() => setModalRec({ ...modalRec, form: { ...modalRec.form, emoji: em } })}>{em}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de recompensa</label>
              <div className="seg">
                {[['CONSUMO', 'Consumo'], ['BRINDE', 'Brinde']].map(([v, l]) => (
                  <button key={v} type="button" className={'seg-btn' + (modalRec.form.tipo === v ? ' seg-btn-on' : '')} onClick={() => setModalRec({ ...modalRec, form: { ...modalRec.form, tipo: v } })}>{l}</button>
                ))}
              </div>
            </div>
            {modalRec.form.tipo === 'CONSUMO' && (
              <div className="form-group">
                <label className="form-label">Onde resgatar</label>
                <div className="chip-row">
                  {DEST_OPCOES.map(([v, l]) => {
                    const sel = (modalRec.form.destinos || []).includes(v)
                    return <button key={v} type="button" className={'chip' + (sel ? ' chip-on' : '')} onClick={() => { const cur = modalRec.form.destinos || []; const novo = sel ? cur.filter((x) => x !== v) : [...cur, v]; setModalRec({ ...modalRec, form: { ...modalRec.form, destinos: novo } }) }}>{l}</button>
                  })}
                </div>
                <div className="ind-hint" style={{ marginTop: 6 }}>Nenhum marcado = vale para todos (salão, delivery e retirada).</div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Descrição (opcional)</label>
              <input className="form-input" value={modalRec.form.descricao} onChange={(e) => setModalRec({ ...modalRec, form: { ...modalRec.form, descricao: e.target.value } })} placeholder="Detalhes ou como resgatar" />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalRec(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarRecompensa} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal promotor */}
      {modalProm && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Novo promotor</div>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={modalProm.form.nome} onChange={(e) => setModalProm({ ...modalProm, form: { ...modalProm.form, nome: e.target.value } })} />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp</label>
              <input className="form-input" inputMode="numeric" value={mascararTelefone(modalProm.form.whatsapp)} onChange={(e) => setModalProm({ ...modalProm, form: { ...modalProm.form, whatsapp: mascararTelefone(e.target.value) } })} placeholder="(00) 00000-0000" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de promotor</label>
              <select className="form-input" value={modalProm.form.tipo} onChange={(e) => setModalProm({ ...modalProm, form: { ...modalProm.form, tipo: e.target.value } })}>
                <option value="CLIENTE">Cliente</option>
                <option value="INFLUENCER">Influencer</option>
                <option value="PARCEIRA">Página Parceira</option>
              </select>
              <div className="ind-hint" style={{ marginTop: 6 }}>Identifica de onde veio o promotor (para acompanhar por origem).</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalProm(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarPromotor} disabled={salvando}>{salvando ? 'Criando…' : 'Criar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo cupom (Cardápio Web) — mesmas opções do painel do CW */}
      {modalCupom && (
        <div className="modal-overlay">
          <div className="modal modal-cupom" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Novo cupom no Cardápio Web</div>
            <div className="modal-sub">As mesmas opções do painel do Cardápio Web — criado direto por aqui.</div>

            <div className="cup-sec">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-input" value={modalCupom.name} onChange={(e) => setModalCupom({ ...modalCupom, name: e.target.value })} placeholder="Ex.: Promoção de terça" />
              </div>
              <div className="form-group">
                <label className="form-label">Código do cupom (opcional)</label>
                <input className="form-input" value={modalCupom.code} onChange={(e) => setModalCupom({ ...modalCupom, code: e.target.value.toUpperCase() })} placeholder="Vazio = sem código (visível a todos)" />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de desconto</label>
                <div className="seg">
                  {[['percent_discount', 'Desconto %'], ['flat_discount', 'Desconto R$'], ['free_shipping', 'Frete grátis']].map(([v, l]) => (
                    <button key={v} type="button" className={'seg-btn' + (modalCupom.type === v ? ' seg-btn-on' : '')} onClick={() => setModalCupom({ ...modalCupom, type: v })}>{l}</button>
                  ))}
                </div>
              </div>
              {modalCupom.type !== 'free_shipping' && (
                <div className="form-group">
                  <label className="form-label">{modalCupom.type === 'flat_discount' ? 'Valor (R$)' : 'Percentual (%)'}</label>
                  <input className="form-input" inputMode="decimal" value={modalCupom.value} onChange={(e) => setModalCupom({ ...modalCupom, value: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="Ex.: 10" />
                </div>
              )}
            </div>

            <div className="cup-sechead">Limitações <span>(tudo opcional)</span></div>
            <div className="cup-sec">
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Disponível a partir de</label><input className="form-input" type="date" value={modalCupom.available_from} onChange={(e) => setModalCupom({ ...modalCupom, available_from: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Disponível até</label><input className="form-input" type="date" value={modalCupom.expires_at} onChange={(e) => setModalCupom({ ...modalCupom, expires_at: e.target.value })} /></div>
              </div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Início do horário</label><input className="form-input" type="time" value={modalCupom.availability_start_time} onChange={(e) => setModalCupom({ ...modalCupom, availability_start_time: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Fim do horário</label><input className="form-input" type="time" value={modalCupom.availability_end_time} onChange={(e) => setModalCupom({ ...modalCupom, availability_end_time: e.target.value })} /></div>
              </div>
              <div className="form-group">
                <label className="form-label">Dias da semana</label>
                <div className="chip-row">
                  {WEEK_DAYS.map((d) => { const sel = modalCupom.available_days.includes(d.v); return <button key={d.v} type="button" className={'chip' + (sel ? ' chip-on' : '')} onClick={() => setModalCupom({ ...modalCupom, available_days: sel ? modalCupom.available_days.filter((x) => x !== d.v) : [...modalCupom.available_days, d.v] })}>{d.l}</button> })}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tipos de pedido</label>
                <div className="chip-row">
                  {ORDER_TYPES.map((o) => { const sel = modalCupom.available_order_types.includes(o.v); return <button key={o.v} type="button" className={'chip' + (sel ? ' chip-on' : '')} onClick={() => setModalCupom({ ...modalCupom, available_order_types: sel ? modalCupom.available_order_types.filter((x) => x !== o.v) : [...modalCupom.available_order_types, o.v] })}>{o.l}</button> })}
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Quantidade disponível</label><input className="form-input" inputMode="numeric" value={modalCupom.use_limit} onChange={(e) => setModalCupom({ ...modalCupom, use_limit: e.target.value.replace(/\D/g, '') })} placeholder="vazio = ilimitado" /></div>
                <div className="form-group"><label className="form-label">Valor mínimo do pedido (R$)</label><input className="form-input" inputMode="decimal" value={modalCupom.minimum_order_value} onChange={(e) => setModalCupom({ ...modalCupom, minimum_order_value: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="vazio = sem mínimo" /></div>
              </div>
            </div>

            <div className="cup-sec cup-tgls">
              <div className="tgl-row">
                <span>Apenas para novos clientes</span>
                <label className="tgl"><input type="checkbox" checked={modalCupom.new_customers_only} onChange={(e) => setModalCupom({ ...modalCupom, new_customers_only: e.target.checked })} /><span className="tgl-track" /></label>
              </div>
              <div className="tgl-row">
                <span>Pode ser usado mais de uma vez pelo mesmo cliente</span>
                <label className="tgl"><input type="checkbox" checked={modalCupom.customer_multi_use} onChange={(e) => setModalCupom({ ...modalCupom, customer_multi_use: e.target.checked })} /><span className="tgl-track" /></label>
              </div>
              <div className="tgl-row">
                <span>Cupom ativo</span>
                <label className="tgl"><input type="checkbox" checked={modalCupom.active} onChange={(e) => setModalCupom({ ...modalCupom, active: e.target.checked })} /><span className="tgl-track" /></label>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalCupom(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvarCupomCw} disabled={salvando}>{salvando ? 'Criando…' : 'Criar cupom'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.titulo}
        message={confirm?.msg}
        variant="danger"
        onConfirm={() => confirm?.acao?.()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
