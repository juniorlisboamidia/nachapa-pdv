import { useState, useEffect } from 'react'
import api from '../../services/api'
import KpiCard from './KpiCard'
import { AreaVendasDiarias } from './graficos'
import { brl, brlExato, num } from './formatos'

// Cor de cada canal de venda (fallback cinza).
const CANAL_COR = {
  'Cardápio Digital': '#3b6fe0',
  'iFood': '#ea1d2c',
  '99 Food': '#f5c518',
  'WhatsApp': '#25d366',
  'Portal': '#8b5cf6',
}
const corCanal = (nome) => CANAL_COR[nome] || '#a3a3a3'

// Seção de Vendas (Cardápio Web): KPIs + gráfico + Top 10 produtos/complementos +
// Faturamento por canal. Dados vêm de /dashboard/cardapio (ponte HUB → CW).
export default function SecaoVendasCardapio({ dados, carregando }) {
  const k = dados?.kpis || {}
  const ant = dados?.anterior || {}
  const serie = Array.isArray(dados?.serie) ? dados.serie : []
  const produtos = Array.isArray(dados?.produtos) ? dados.produtos : []
  const complementos = Array.isArray(dados?.complementos) ? dados.complementos : []
  const canais = Array.isArray(dados?.canais) ? dados.canais : []
  const preparando = dados?.sincronizando && !k.pedidos
  return (
    <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity .15s' }}>
      {preparando && (
        <div className="card" style={{ marginBottom: 16, fontSize: 13.5, color: '#737373' }}>
          Estamos preparando seus dados de vendas pela primeira vez — isso pode levar alguns minutos. Atualize a página em instantes.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard label="Faturamento" valor={brl(k.faturamento)} atual={k.faturamento} anterior={ant.faturamento} formatAbs={brlExato} modo="bom-sobe" variant="success" />
        <KpiCard label="Pedidos" valor={num(k.pedidos)} atual={k.pedidos} anterior={ant.pedidos} formatAbs={num} modo="bom-sobe" />
        <KpiCard label="Ticket médio" valor={brlExato(k.ticketMedio)} atual={k.ticketMedio} anterior={ant.ticketMedio} formatAbs={brlExato} modo="bom-sobe" variant="brand" />
        <KpiCard label="Novos clientes" valor={`+${num(k.novosClientes)}`} atual={k.novosClientes} anterior={null} formatAbs={num} modo="bom-sobe" />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)', marginBottom: 10 }}>Vendas diárias</div>
        <AreaVendasDiarias data={serie} />
      </div>

      <TemposOperacionais tempos={dados?.tempos} temPedidos={!!k.pedidos} totalPedidos={k.pedidos} faixasConfig={dados?.faixas} />

      <TipoPedido tipos={dados?.tipos} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <TopVendidos produtos={produtos} complementos={complementos} />
        <FaturamentoCanal canais={canais} total={k.faturamento} />
      </div>
    </div>
  )
}

// Texto do "?" — como o Top produtos é montado (mesma explicação nos dois toggles).
const AJUDA_TOP_VENDIDOS = `Lista universal: vale para qualquer tipo de loja, sem regra de cardápio. Conta o que foi vendido item a item, do jeito que veio no pedido.

Nomes unificados: cada canal escreve o mesmo produto de um jeito ("Guaraná Antarctica 1L", "Refrigerante Guarana 1l", "guarana 1l") — somamos tudo numa linha só. As linhas com ≡ mostram no toque/hover quais grafias foram somadas.

Valor bruto: a soma é o preço dos produtos antes dos descontos da loja e sem taxas de entrega/serviço — por isso é maior que o faturamento do caixa.`

// Top produtos/complementos mais vendidos: barras por quantidade + valor bruto.
// Top 5 inicial (+ "Ver todos"); toggle Produtos|Complementos; ≡ nas grafias somadas.
function TopVendidos({ produtos, complementos }) {
  const [aba, setAba] = useState('produtos')
  const [expandido, setExpandido] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const lista = aba === 'produtos' ? produtos : complementos
  const visiveis = expandido ? lista : lista.slice(0, 5)
  const maxVendas = lista.reduce((m, p) => Math.max(m, Number(p.vendas) || 0), 0) || 1
  const label = aba === 'produtos' ? 'produtos' : 'complementos'

  function trocarAba(id) { setAba(id); setExpandido(false) }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>{aba === 'produtos' ? 'Produtos' : 'Complementos'} mais vendidos</span>
          <button
            type="button"
            onClick={() => setAjuda((v) => !v)}
            aria-label="Como montamos o Top produtos"
            title="Como montamos o Top produtos"
            style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid #f5c99b', background: ajuda ? '#f97316' : '#fff7ed', color: ajuda ? '#fff' : '#ea580c', fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
          >?</button>
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--app-highlight, #fff7ed)', borderRadius: 8, padding: 2 }}>
          {[['produtos', 'Produtos'], ['complementos', 'Complementos']].map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => trocarAba(id)}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                background: aba === id ? 'var(--app-surface, #fff)' : 'transparent',
                color: aba === id ? '#ea580c' : '#737373',
                boxShadow: aba === id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {ajuda && (
        <div style={{ background: 'var(--app-surface-2, #f8fafc)', border: '1px solid #eee', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12.5, color: 'var(--app-text-2, #555)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
          {AJUDA_TOP_VENDIDOS}
        </div>
      )}

      {lista.length === 0 ? (
        <div style={{ padding: '28px 8px', textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>
          {aba === 'complementos' ? 'Sem complementos no período.' : 'Sem vendas no período.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {visiveis.map((p, i) => {
              const pct = Math.max(2, (Number(p.vendas) / maxVendas) * 100)
              const grafias = Array.isArray(p.grafias) ? p.grafias : null
              return (
                <div key={`${p.nome}-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text)', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#a3a3a3', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                      {grafias && (
                        <span title={`Grafias somadas:\n• ${grafias.join('\n• ')}`} style={{ cursor: 'help', color: '#a3a3a3', fontWeight: 700, flexShrink: 0 }}>≡</span>
                      )}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--app-text)', whiteSpace: 'nowrap' }}>{num(p.vendas)} un</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 999, background: 'var(--app-surface-2, #f1f5f9)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #fb923c 0%, #ea580c 100%)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 4 }}>{brlExato(p.receita)}</div>
                </div>
              )
            })}
          </div>
          {lista.length > 5 && (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              style={{ width: '100%', marginTop: 14, padding: '9px 0', border: '1px solid #eee', borderRadius: 8, background: 'var(--app-surface, #fff)', color: '#737373', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              {expandido ? 'Ver menos' : `▾ Ver todos os ${label}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// Minutos → "45 min" ou "1h 05".
function fmtMin(min) {
  const m = Math.round(Number(min) || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${String(r).padStart(2, '0')}` : `${h}h`
}

// Limites de fábrica (min) das faixas — usados quando a loja ainda não configurou.
const FAIXAS_PADRAO = { preparoIdeal: 25, preparoAtencao: 40, entregaIdeal: 20, entregaAtencao: 35, totalIdeal: 45, totalAtencao: 70 }
// Monta as 3 faixas (ideal/atenção/acima) de um card a partir dos limites configurados.
function montarFaixas(ideal, atencao) {
  return [
    { ate: ideal, faixa: `0–${ideal} min`, nome: 'Ideal', cor: '#16a34a', badge: 'Dentro do ideal' },
    { ate: atencao, faixa: `${ideal}–${atencao} min`, nome: 'Atenção', cor: '#ca8a04', badge: 'Atenção' },
    { ate: Infinity, faixa: `> ${atencao} min`, nome: 'Acima do esperado', cor: '#dc2626', badge: 'Acima do esperado' },
  ]
}
const IconeChef = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" /><line x1="6" y1="17" x2="18" y2="17" /></svg>
)
const IconeMoto = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.3" /><circle cx="18.5" cy="17.5" r="3.3" /><path d="M15.2 17.5H8.8l-2.3-6H4" /><path d="M12.5 6h3l2.5 8" /></svg>
)
const IconeRelogio = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
// Card de tempo: título + ícone, valor grande colorido pela faixa ativa, badge, rodapé
// (Mín·Máx) e uma RÉGUA tricolor (ideal/atenção/acima) com um ponteiro na posição do valor
// — no lugar da lista de bolinhas. `vazio` = etapa ainda sem pedidos → placeholder.
function CardTempo({ titulo, icone, valor, valorTexto, faixas, rodape, vazio }) {
  const cab = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 0.6 }}>{titulo}</span>
      <span style={{ color: '#cbd5e1', flexShrink: 0, lineHeight: 0 }}>{icone}</span>
    </div>
  )
  const box = { padding: '16px 18px', border: '1px solid #eee', borderRadius: 12, background: 'var(--app-surface-2, #f8fafc)' }
  if (vazio) {
    return (
      <div style={box}>
        {cab}
        <div style={{ fontSize: 27, fontWeight: 800, color: '#cbd5e1', lineHeight: 1.05, marginTop: 8 }}>—</div>
        <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 10, lineHeight: 1.5 }}>Sem pedidos com esta etapa ainda. Vai aparecer conforme os novos pedidos rodam.</div>
      </div>
    )
  }
  const idxAtiva = faixas.findIndex((f) => valor <= f.ate)
  const ativa = idxAtiva === -1 ? faixas[faixas.length - 1] : faixas[idxAtiva]
  // Régua: zonas proporcionais aos limites; máx visual = fim da atenção × 1.5 (dá espaço ao "acima").
  const lim1 = faixas[0].ate, lim2 = faixas[1].ate
  const escala = lim2 * 1.5
  const p = (v) => Math.max(0, Math.min(100, (v / escala) * 100))
  const pos = p(valor)
  const rotulos = ['Ideal', 'Atenção', 'Acima']
  return (
    <div style={box}>
      {cab}
      <div style={{ fontSize: 30, fontWeight: 800, color: ativa.cor, lineHeight: 1.05, marginTop: 8 }}>{valorTexto}</div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: ativa.cor, borderRadius: 999, padding: '3px 10px', display: 'inline-block' }}>{ativa.badge}</span>
      </div>
      {rodape && <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 10 }}>{rodape}</div>}
      {/* Régua tricolor com ponteiro na posição do valor. */}
      <div style={{ marginTop: 16 }}>
        <div style={{ position: 'relative', height: 8, borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${p(lim1)}%`, background: faixas[0].cor }} />
          <div style={{ width: `${p(lim2) - p(lim1)}%`, background: faixas[1].cor }} />
          <div style={{ flex: 1, background: faixas[2].cor }} />
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: `${pos}%`, top: -11, transform: 'translateX(-50%)', width: 3, height: 14, borderRadius: 2, background: 'var(--app-text)', boxShadow: '0 0 0 2px var(--app-surface-2, #f8fafc)' }} />
        </div>
        <div style={{ display: 'flex', marginTop: 7 }}>
          {faixas.map((f, i) => (
            <span key={i} style={{
              width: i === 0 ? `${p(lim1)}%` : i === 1 ? `${p(lim2) - p(lim1)}%` : undefined,
              flex: i === 2 ? 1 : undefined,
              textAlign: 'center', fontSize: 11, fontWeight: idxAtiva === i ? 700 : 500,
              color: idxAtiva === i ? f.cor : '#a3a3a3',
            }}>{rotulos[i]}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Rodapé Mín·Máx de uma etapa (pedidos + extremos).
const rodapeEtapa = (d) => `${num(d.qtd)} pedidos · Mín ${fmtMin(d.minMin)} · Máx ${fmtMin(d.maxMin)}`

const IconeEngrenagem = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
)

// Cada card e seus 2 campos configuráveis (ideal/atenção), na ordem do modal.
const CARDS_FAIXA = [
  { key: 'preparo', label: 'Preparo', cor: '#16a34a' },
  { key: 'entrega', label: 'Entrega', cor: '#ea580c' },
  { key: 'total', label: 'Total', cor: '#3b82f6' },
]

// Modal de ajuste das faixas (ideal/atenção) por loja. Não fecha ao clicar fora — só pelos
// botões. Salva via PUT /dashboard/cardapio-faixas e devolve os limites salvos ao pai.
function ModalFaixas({ faixas, onSalvar, onFechar }) {
  const [form, setForm] = useState(() => ({ ...FAIXAS_PADRAO, ...faixas }))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v.replace(/[^0-9]/g, '') }))
  const restaurar = () => setForm({ ...FAIXAS_PADRAO })
  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const payload = {}
      for (const k of Object.keys(FAIXAS_PADRAO)) payload[k] = Number(form[k]) || 0
      const { data } = await api.put('/dashboard/cardapio-faixas', payload)
      onSalvar(data); onFechar()
    } catch {
      setErro('Não foi possível salvar agora. Tente de novo.')
    } finally { setSalvando(false) }
  }
  const inp = { width: 58, border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 8px', fontSize: 13, textAlign: 'center', color: 'var(--app-text)' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'var(--app-surface, #fff)', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--app-text)' }}>Definir tempos desta loja</div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, color: '#a3a3a3', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--app-text-2, #737373)', lineHeight: 1.5 }}>
            Para cada etapa, defina até quantos minutos é <strong style={{ color: '#16a34a' }}>ideal</strong> e até quanto é <strong style={{ color: '#ca8a04' }}>atenção</strong>. Acima disso vira <strong style={{ color: '#dc2626' }}>acima do esperado</strong>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CARDS_FAIXA.map((c) => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid #eee', borderLeft: `3px solid ${c.cor}`, borderRadius: 10, background: 'var(--app-surface-2, #f8fafc)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text)', textTransform: 'uppercase', letterSpacing: 0.4, minWidth: 62 }}>{c.label}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--app-text-2, #555)' }}>
                  Ideal até <input inputMode="numeric" value={form[`${c.key}Ideal`]} onChange={(e) => set(`${c.key}Ideal`, e.target.value)} style={inp} /> min
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--app-text-2, #555)' }}>
                  Atenção até <input inputMode="numeric" value={form[`${c.key}Atencao`]} onChange={(e) => set(`${c.key}Atencao`, e.target.value)} style={inp} /> min
                </label>
              </div>
            ))}
          </div>
          {erro && <div style={{ marginTop: 12, fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>{erro}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 18px', borderTop: '1px solid #eee' }}>
          <button type="button" onClick={restaurar} style={{ border: 'none', background: 'transparent', color: '#737373', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Restaurar padrão</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onFechar} className="btn btn-secondary btn-sm">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="btn btn-primary btn-sm">{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tempos operacionais do Cardápio Web via marcos de status (webhook): Preparo (aceito→saiu,
// tempo na loja), Entrega (saiu→entregue, motoboy na rua) e Total (aceito→entregue). O CW não
// tem o "pronto", então não dá p/ separar preparo de espera. Cancelados não entram. Forward-only.
// As faixas (ideal/atenção) são configuráveis por loja (dados.faixas → modal da engrenagem).
function TemposOperacionais({ tempos, temPedidos, totalPedidos, faixasConfig }) {
  const [faixas, setFaixas] = useState(() => ({ ...FAIXAS_PADRAO, ...(faixasConfig || {}) }))
  const [editando, setEditando] = useState(false)
  useEffect(() => { if (faixasConfig) setFaixas({ ...FAIXAS_PADRAO, ...faixasConfig }) }, [faixasConfig])

  const Cabecalho = ({ calculados }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>Tempos operacionais</div>
        <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 3 }}>
          {calculados
            ? `${num(totalPedidos)} pedidos no período · tempo calculado em ${num(calculados)} com ciclo completo`
            : `${num(totalPedidos)} pedidos no período`}
        </div>
      </div>
      <button type="button" onClick={() => setEditando(true)} title="Definir os tempos (ideal/atenção) desta loja"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #eee', background: 'var(--app-surface, #fff)', color: '#737373', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
        {IconeEngrenagem} Definir tempos
      </button>
    </div>
  )

  const modal = editando && <ModalFaixas faixas={faixas} onSalvar={setFaixas} onFechar={() => setEditando(false)} />

  if (!temPedidos) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <Cabecalho />
        <div style={{ padding: '28px 16px', textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>Sem vendas no período.</div>
        {modal}
      </div>
    )
  }

  if (!tempos) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <Cabecalho />
        <div style={{ padding: '18px 16px', textAlign: 'center', color: '#a3a3a3', fontSize: 13, background: 'var(--app-surface-2, #f8fafc)', border: '1px solid #eee', borderRadius: 10 }}>
          Estamos calculando os tempos deste período pela primeira vez — isso leva alguns minutos. Atualize a página em instantes.
        </div>
        {modal}
      </div>
    )
  }

  const fPreparo = montarFaixas(faixas.preparoIdeal, faixas.preparoAtencao)
  const fEntrega = montarFaixas(faixas.entregaIdeal, faixas.entregaAtencao)
  const fTotal = montarFaixas(faixas.totalIdeal, faixas.totalAtencao)
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <Cabecalho calculados={tempos.qtdCiclo} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <CardTempo
          titulo="Tempo médio de preparo" icone={IconeChef}
          vazio={!tempos.preparo}
          valor={tempos.preparo?.mediaMin || 0} valorTexto={tempos.preparo ? fmtMin(tempos.preparo.mediaMin) : ''}
          faixas={fPreparo} rodape={tempos.preparo ? rodapeEtapa(tempos.preparo) : null}
        />
        <CardTempo
          titulo="Tempo médio de entrega" icone={IconeMoto}
          vazio={!tempos.entrega}
          valor={tempos.entrega?.mediaMin || 0} valorTexto={tempos.entrega ? fmtMin(tempos.entrega.mediaMin) : ''}
          faixas={fEntrega} rodape={tempos.entrega ? rodapeEtapa(tempos.entrega) : null}
        />
        <CardTempo
          titulo="Tempo médio total" icone={IconeRelogio}
          vazio={!tempos.total}
          valor={tempos.total?.mediaMin || 0} valorTexto={tempos.total ? fmtMin(tempos.total.mediaMin) : ''}
          faixas={fTotal} rodape={tempos.total ? rodapeEtapa(tempos.total) : null}
        />
      </div>
      {modal}
    </div>
  )
}

// Tipo de pedido: delivery / retirada / consumo no local — qtd, % e valor bruto.
function TipoPedido({ tipos }) {
  const cab = (
    <div style={{ marginBottom: 14 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>Tipo de pedido</span>
    </div>
  )
  if (!tipos || !tipos.total) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        {cab}
        <div style={{ padding: '28px 16px', textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>Sem vendas no período.</div>
      </div>
    )
  }
  const itens = [
    { key: 'delivery', label: 'Delivery', d: tipos.delivery, cor: '#3b82f6' },
    { key: 'retirada', label: 'Retirada', d: tipos.retirada, cor: '#ea580c' },
    { key: 'local', label: 'Consumo no local', d: tipos.local, cor: '#dc2626' },
  ]
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      {cab}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {itens.map((it) => (
          <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid #eee', borderLeft: `3px solid ${it.cor}`, borderRadius: 10, background: 'var(--app-surface-2, #f8fafc)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--app-text)', lineHeight: 1 }}>{num(it.d.qtd)}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>{it.label}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: it.cor }}>{Math.round(it.d.pct)}%</div>
              <div style={{ fontSize: 12, color: '#a3a3a3', marginTop: 2 }}>{brlExato(it.d.valor)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Faturamento por canal de venda: total + barra proporcional por canal.
function FaturamentoCanal({ canais, total }) {
  const soma = canais.reduce((s, c) => s + (c.valor || 0), 0) || total || 0
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--app-text)' }}>Canais de venda</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#a3a3a3' }}>Faturamento Total</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--app-text)' }}>{brl(soma)}</div>
        </div>
      </div>
      {canais.length === 0 ? (
        <div style={{ padding: '24px 8px', textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>Sem vendas no período.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canais.map((c) => {
            const pct = soma ? (c.valor / soma) * 100 : 0
            const cor = corCanal(c.nome)
            return (
              <div key={c.nome}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--app-text)' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: cor, flexShrink: 0 }} />
                    {c.nome}
                  </span>
                  <span style={{ fontSize: 12.5, color: '#737373', whiteSpace: 'nowrap' }}>
                    <strong style={{ color: 'var(--app-text)' }}>{brlExato(c.valor)}</strong>&nbsp;·&nbsp;{pct.toFixed(0)}%
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--app-highlight, #f1f1f1)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: cor, transition: 'width .3s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
