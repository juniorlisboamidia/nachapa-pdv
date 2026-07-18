// ÁREA DO COLABORADOR — login por WhatsApp (OTP) + mini-app com abas na base:
// Início (desempenho do mês, sem ranking dos colegas), Ponto (minhas marcações),
// Prêmios (Coins/conquistas/mercado) e Sugestões (reconhecer/ouvidoria).
// Acesso pelo link da loja /colaborador/:slug; sessão de ~30 dias no aparelho.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { colabApi, COLAB_TOKEN_KEY } from '../services/api'
import { AREA_COLABORADOR_CSS } from '../styles/areaColaboradorCss'
import { ExecutarChecklist } from '../components/checklist/ExecutarChecklist'

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
const num = (n) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0))
const MEDAL = { 1: 'g1', 2: 'g2', 3: 'g3' }
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const RAR = {
  COMUM: { label: 'Comum', cor: '#64748b' },
  RARO: { label: 'Raro', cor: '#eab802' },
  EPICO: { label: 'Épico', cor: '#8b5cf6' },
  LENDARIO: { label: 'Lendário', cor: '#f59e0b' },
}
const STAT = {
  PENDENTE: { label: 'Pendente', cor: '#b45309' },
  APROVADO: { label: 'Aprovado', cor: '#a17c00' },
  ENTREGUE: { label: 'Entregue', cor: '#0F8A54' },
  REJEITADO: { label: 'Rejeitado', cor: '#dc2626' },
}
const SIT = {
  ok: { l: 'No horário', c: '#0F8A54' },
  atraso: { l: 'Atraso', c: '#d97706' },
  falta: { l: 'Falta', c: '#dc2626' },
  incompleto: { l: 'Sem saída', c: '#b45309' },
  folga_trabalhada: { l: 'Folga trabalhada', c: '#2563eb' },
  trabalhado: { l: 'Trabalhado', c: '#2563eb' },
}
const OUV_TIPOS_PUB = [['SUGESTAO', 'Sugestão'], ['ELOGIO', 'Elogio'], ['RECLAMACAO', 'Reclamação'], ['DENUNCIA', 'Denúncia'], ['OUTRO', 'Outro']]
const CL_STATUS = { EM_ANDAMENTO: { label: 'Em andamento', cor: '#d97706' }, CONCLUIDA: { label: 'Concluído', cor: '#0F8A54' } }
const TABS = [['inicio', 'Início', '🏠'], ['ponto', 'Ponto', '🕐'], ['checklists', 'Checklists', '✅'], ['premios', 'Prêmios', '🎁'], ['voz', 'Sugestões', '💬']]

// CSS movido para styles/areaColaboradorCss.js (reusado pelo link público de
// checklist, que também roda a MESMA execução — ver ExecutarChecklist.jsx).
const CSS = AREA_COLABORADOR_CSS

export default function BonificacaoEu() {
  const { slug } = useParams()
  const [sessao, setSessao] = useState(() => localStorage.getItem(COLAB_TOKEN_KEY))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem(COLAB_TOKEN_KEY))
  const [erro, setErro] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [confirmar, setConfirmar] = useState(null) // item a resgatar
  const [dataFolga, setDataFolga] = useState('')   // data desejada quando o item é FOLGA
  const [resgatando, setResgatando] = useState(false)
  const [aviso, setAviso] = useState(null)

  function sair() { localStorage.removeItem(COLAB_TOKEN_KEY); setSessao(null); setData(null); setErro(null) }
  function aoEntrar(token) { localStorage.setItem(COLAB_TOKEN_KEY, token); setSessao(token); setLoading(true) }

  function carregar(silent) {
    if (!localStorage.getItem(COLAB_TOKEN_KEY)) { setLoading(false); return }
    if (!silent) setLoading(true)
    setErro(null)
    colabApi.get('/public/colaborador/me')
      .then((r) => setData(r.data))
      .catch((err) => {
        if (err?.response?.status === 401) { sair() }
        else if (!silent) setErro(err?.response?.data?.error ?? 'Não foi possível carregar a página.')
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [sessao]) // eslint-disable-line react-hooks/exhaustive-deps

  async function resgatar() {
    if (!confirmar) return
    if (confirmar.tipo === 'FOLGA' && !dataFolga) { setAviso('Escolha a data desejada para a folga.'); return }
    setResgatando(true)
    try {
      await colabApi.post('/public/colaborador/resgatar', { itemId: confirmar.id, dataDesejada: confirmar.tipo === 'FOLGA' ? dataFolga : undefined })
      setConfirmar(null); setDataFolga(''); setAviso('Resgate solicitado! A liderança vai avaliar e te entregar o prêmio. 🎉')
      carregar(true)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível resgatar.'); setConfirmar(null); setDataFolga('') }
    finally { setResgatando(false) }
  }

  if (!sessao) return <LoginColaborador slug={slug} onEntrar={aoEntrar} />
  if (loading && !data) return <div className="be-root"><style>{CSS}</style><div className="be-state">Carregando…</div></div>
  if (erro) return <div className="be-root"><style>{CSS}</style><div className="be-state"><div>{erro}</div><button type="button" className="be-btn" style={{ maxWidth: 200, marginTop: 16 }} onClick={sair}>Entrar de novo</button></div></div>

  const d = data || {}
  const { loja, funcionario, meu, conquistas = [], conquistasResumo = { total: 0, desbloqueadas: 0 }, coins, moedas = 0, mercado = [], meusResgates = [], colegas = [], reconhecimento = null, ouvidoria = [], contribuicoes = [], historico = [], ponto = null, totalEquipe = 0, ano, mes } = d
  const saldoCoins = Number(coins ?? moedas ?? 0)
  const primeiro = (funcionario?.nome || 'você').split(' ')[0]
  const inicial = (funcionario?.nome || 'C').charAt(0).toUpperCase()

  return (
    <div className="be-root">
      <style>{CSS}</style>
      <div className="be-app">
        <header className="be-hero">
          <div className="be-hero-bar">
            <span className="be-hero-loja"><span className="lg">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</span>{loja?.nome}</span>
            <button type="button" className="be-sair" onClick={sair}>Sair</button>
          </div>
          <div className="be-hero-main">
            <div className="be-avatar">{inicial}</div>
            <div className="be-hero-id">
              <div className="oi">Área do colaborador</div>
              <h1>Olá, {primeiro} 👋</h1>
              {funcionario?.funcao && <div className="fx">{funcionario.funcao}</div>}
            </div>
          </div>
          <div className="be-hero-stats">
            <div className="be-stat coins">
              <div className="v be-tnum">🪙 {num(saldoCoins)}</div>
              <div className="k">Coins</div>
            </div>
            {meu?.indice != null && (
              <>
                <div className="be-stat-div" />
                <div className="be-stat">
                  <div className="v be-tnum">⭐ {meu.indice}%</div>
                  <div className="k">Índice</div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="be-body">
          {tab === 'inicio' && <TabInicio meu={meu} totalEquipe={totalEquipe} historico={historico} contribuicoes={contribuicoes} mes={mes} ano={ano} />}
          {tab === 'ponto' && <TabPonto ponto={ponto} ano={ano} mes={mes} />}
          {tab === 'checklists' && <TabChecklists setAviso={setAviso} />}
          {tab === 'premios' && <TabPremios saldoCoins={saldoCoins} conquistas={conquistas} conquistasResumo={conquistasResumo} mercado={mercado} meusResgates={meusResgates} onResgatar={setConfirmar} />}
          {tab === 'voz' && <TabVoz colegas={colegas} reconhecimento={reconhecimento} ouvidoria={ouvidoria} onFeito={() => carregar(true)} setAviso={setAviso} />}
        </main>

        <nav className="be-tabs">
          {TABS.map(([id, label, ic]) => (
            <button key={id} type="button" className={'be-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
              <span className="ic">{ic}</span><span className="lb">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Confirmar resgate */}
      {confirmar && (
        <div className="be-ov" onClick={() => !resgatando && (setConfirmar(null), setDataFolga(''))}>
          <div className="be-dlg" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>{confirmar.emoji}</div>
            <h3>Resgatar {confirmar.nome}?</h3>
            <p>Vão sair <b className="be-tnum">🪙 {num(confirmar.custo)} Coins</b> do seu saldo. A liderança avalia e te entrega o prêmio.</p>
            {confirmar.tipo === 'FOLGA' && (
              <div style={{ margin: '4px 0 14px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>Data desejada para a folga 🏖️</label>
                <input type="date" className="be-input" value={dataFolga} onChange={(e) => setDataFolga(e.target.value)} />
              </div>
            )}
            <div className="be-dlg-row">
              <button type="button" className="no" onClick={() => { setConfirmar(null); setDataFolga('') }} disabled={resgatando}>Cancelar</button>
              <button type="button" className="ok" onClick={resgatar} disabled={resgatando}>{resgatando ? 'Resgatando…' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso pós-ação */}
      {aviso && (
        <div className="be-ov" onClick={() => setAviso(null)}>
          <div className="be-dlg" onClick={(e) => e.stopPropagation()}>
            <p style={{ marginBottom: 16 }}>{aviso}</p>
            <div className="be-dlg-row"><button type="button" className="ok" onClick={() => setAviso(null)}>Ok</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════ ABA: INÍCIO ══════════ */
function TabInicio({ meu, totalEquipe, historico, contribuicoes, mes, ano }) {
  const mesNome = new Date(ano, (mes || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  const pos = meu?.posicao
  const medalCls = pos && pos <= 3 ? MEDAL[pos] : ''
  const idx = meu?.indice != null ? Math.max(0, Math.min(100, Number(meu.indice))) : null
  return (
    <>
      <section>
        <h2 className="be-sec-title">🗓️ Seu {mesNome}</h2>
        <div className="be-card">
          <div className="be-mhead">
            {pos ? (
              <span className={'be-rank-pill ' + medalCls}><span className="m be-tnum">{pos}</span>{pos}º <span className="of">de {totalEquipe}</span></span>
            ) : <span className="be-rank-pill">Sem posição ainda</span>}
            <div className="mtot">
              <div className="k">Seu prêmio</div>
              <div className="v be-tnum">{brl(meu?.totalRs)}</div>
            </div>
          </div>
          {meu ? (
            <>
              <div className="be-el"><span className="l">Assiduidade <small>· {meu.assidPct}%</small></span><span className="r be-tnum">{brl(meu.assidRs)}</span></div>
              <div className="be-el"><span className="l">Desempenho <small>· {meu.desPct}%</small></span><span className="r be-tnum">{brl(meu.desRs)}</span></div>
              <div className="be-el"><span className="l">Coletivo <small>· {meu.coletivaPct}%</small></span><span className="r be-tnum">{brl(meu.colRs)}</span></div>
              <div className={'be-el' + (meu.classificacaoRs > 0 ? '' : ' zero')}><span className="l">Extra <small>· destaque do mês</small></span><span className="r be-tnum">{brl(meu.classificacaoRs)}</span></div>
              {idx != null && (
                <div className="be-idx">
                  <div className="be-idx-top"><span>⭐ Índice de Excelência</span><b className="be-tnum">{meu.indice}%</b></div>
                  <div className="be-idx-bar"><i style={{ width: idx + '%' }} /></div>
                  <div className="be-idx-sub">50% Assiduidade + 35% Desempenho + 15% Contribuições · define o Destaque do mês</div>
                </div>
              )}
            </>
          ) : (
            <div className="be-emptybox">Seu resultado deste mês ainda não foi lançado. 😉</div>
          )}
          <p className="be-hint">Só você vê esta tela — a pontuação dos colegas não aparece aqui. A cada fechamento você ganha <b>🪙 Coins</b> pra trocar por prêmios. 🚀</p>
        </div>
      </section>

      {contribuicoes.length > 0 && (
        <section>
          <h2 className="be-sec-title">🌟 Suas contribuições do mês</h2>
          <div className="be-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contribuicoes.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--money)', fontWeight: 800, flexShrink: 0 }}>+{c.pontos}pt</span>
                {c.coins > 0 && <span className="be-coins" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}>🪙 {c.coins}</span>}
                <span style={{ color: 'var(--ink-soft)' }}>{c.descricao}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {historico.length > 1 && <SecaoHistorico historico={historico} />}
    </>
  )
}

/* ══════════ ABA: PONTO ══════════ */
function TabPonto({ ponto, ano, mes }) {
  const marc = ponto?.marcacoes || []
  const res = ponto?.resumo || { diasTrabalhados: 0, atrasos: 0, faltas: 0 }
  const mesNome = new Date(ano, (mes || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return (
    <section>
      <h2 className="be-sec-title">🕐 Minhas marcações · {mesNome}</h2>
      <div className="be-ptres">
        <div className="be-ptres-c"><div className="n be-tnum" style={{ color: 'var(--money)' }}>{res.diasTrabalhados}</div><div className="l">dias</div></div>
        <div className="be-ptres-c"><div className="n be-tnum" style={{ color: '#d97706' }}>{res.atrasos}</div><div className="l">atrasos</div></div>
        <div className="be-ptres-c"><div className="n be-tnum" style={{ color: '#dc2626' }}>{res.faltas}</div><div className="l">faltas</div></div>
      </div>
      {marc.length === 0 ? (
        <div className="be-empty">Nenhuma marcação registrada neste mês ainda.</div>
      ) : (
        <div className="be-pt">
          {marc.map((m) => {
            const st = SIT[m.situacao] || { l: m.situacao, c: 'var(--muted)' }
            const label = m.situacao === 'atraso' && m.atrasoMin > 0 ? `Atraso ${m.atrasoMin}min` : st.l
            return (
              <div key={m.dia} className="be-pt-row">
                <div className="be-pt-day"><div className="d be-tnum">{String(m.dia).padStart(2, '0')}</div><div className="w">{DOW[m.dow]}</div></div>
                <div className="be-pt-hrs">
                  {m.entrada ? <><span className="be-tnum">{m.entrada}</span><span className="ar">→</span><span className="be-tnum">{m.saida || '--:--'}</span></> : <span className="none">Sem batida</span>}
                </div>
                <span className="be-pt-st" style={{ color: st.c, background: st.c + '1f' }}>{label}</span>
              </div>
            )
          })}
        </div>
      )}
      <p className="be-hint">Entrada e saída de cada dia, do jeito que o ponto registrou. Algo errado? Fale com a liderança na aba <b>Voz</b>.</p>
    </section>
  )
}

/* ══════════ ABA: CHECKLISTS (execução por função) ══════════ */
function TabChecklists({ setAviso }) {
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState(false)
  const [exec, setExec] = useState(null) // execução aberta (troca a tela pela de responder)

  function carregar() {
    setErroCarga(false)
    colabApi.get('/public/colaborador/checklists')
      .then((r) => setDados(r.data))
      .catch(() => { setDados({ hoje: [], disponiveis: [] }); setErroCarga(true) })
  }
  useEffect(() => { carregar() }, [])

  async function abrir(c) {
    try {
      const r = await colabApi.post(`/public/colaborador/checklists/${c.id}/iniciar`)
      setExec(r.data.execucao)
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível abrir o checklist.') }
  }

  if (exec) return <ExecutarChecklist exec={exec} setAviso={setAviso} onSair={() => { setExec(null); carregar() }} cliente={colabApi} />
  if (!dados) return <div className="be-empty">Carregando…</div>

  return (
    <>
      <section>
        <h2 className="be-sec-title">✅ Para hoje</h2>
        {dados.hoje.length === 0 ? (
          <div className="be-empty">Nenhum checklist pra hoje. 🎉</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dados.hoje.map((c) => <CardChecklist key={c.id} c={c} onAbrir={abrir} />)}
          </div>
        )}
      </section>

      {dados.disponiveis.length > 0 && (
        <section>
          <h2 className="be-sec-title">🗂️ Disponíveis</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dados.disponiveis.map((c) => <CardChecklist key={c.id} c={c} onAbrir={abrir} />)}
          </div>
        </section>
      )}

      {erroCarga && <p className="be-hint">Não foi possível atualizar os checklists agora. Puxe a tela pra cima e tente de novo.</p>}
    </>
  )
}

function CardChecklist({ c, onAbrir }) {
  const st = CL_STATUS[c.status]
  const icone = c.status === 'CONCLUIDA' ? '✅' : c.status === 'EM_ANDAMENTO' ? '📝' : '📋'
  return (
    <button type="button" className="be-cl-row" onClick={() => onAbrir(c)}>
      <span className="be-cl-ic">{icone}</span>
      <span className="be-cl-info">
        <span className="be-cl-nm">{c.nome}</span>
        <span className="be-cl-meta">{c.categoria} · {c.itens} {c.itens === 1 ? 'item' : 'itens'}{c.tempoEstimadoMin > 0 ? ` · ~${c.tempoEstimadoMin} min` : ''}</span>
      </span>
      {c.emAlerta && <span className="be-st" style={{ color: '#dc2626', background: '#dc262622' }}>⚠️ Alerta</span>}
      {st && <span className="be-st" style={{ color: st.cor, background: st.cor + '22' }}>{st.label}</span>}
      <span className="be-cl-arrow">›</span>
    </button>
  )
}

/* ══════════ ABA: PRÊMIOS ══════════ */
function TabPremios({ saldoCoins, conquistas, conquistasResumo, mercado, meusResgates, onResgatar }) {
  return (
    <>
      <section>
        <div className="be-wallet">
          <div className="big be-tnum">🪙 {num(saldoCoins)}</div>
          <div className="lbl">Coins disponíveis</div>
          <div className="sub">Junte Coins a cada fechamento e por conquistas, e troque por prêmios no mercado 🎁</div>
        </div>
      </section>

      {conquistas.length > 0 && (
        <section>
          <h2 className="be-sec-title">🏅 Conquistas · {conquistasResumo.desbloqueadas}/{conquistasResumo.total}</h2>
          <div className="be-ach">
            {conquistas.map((c) => {
              const r = RAR[c.raridade] || RAR.COMUM
              const on = c.desbloqueada
              const p = c.progresso
              const pct = p && p.meta ? Math.min(100, Math.round((p.atual / p.meta) * 100)) : 0
              return (
                <div key={c.id} className={'be-ach-card ' + (on ? 'on' : 'off')} style={on ? { '--ac': r.cor } : undefined}>
                  {!on && <span className="be-ach-lock">🔒</span>}
                  <span className="be-ach-emo">{c.emoji}</span>
                  <div className="be-ach-nm">{c.nome}</div>
                  {c.descricao && <div className="be-ach-ds">{c.descricao}</div>}
                  {on ? (
                    <span className="be-rar" style={{ color: r.cor, background: r.cor + '22' }}>{c.nivelAtual || r.label}{(c.coinsBonus ?? c.xpBonus) > 0 && !c.nivelAtual ? ` · +${c.coinsBonus ?? c.xpBonus} 🪙` : ''}</span>
                  ) : p ? (
                    <>
                      <div className="be-ach-prog"><i style={{ width: pct + '%' }} /></div>
                      <div className="be-ach-meta be-tnum">{num(p.atual)} / {num(p.meta)}{p.nivelNome ? ` · ${p.nivelNome}` : ''}</div>
                    </>
                  ) : (
                    <span className="be-ach-meta">Concedida pela liderança</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {mercado.length > 0 && (
        <section>
          <h2 className="be-sec-title">🎁 Mercado de prêmios</h2>
          <div className="be-shop">
            {mercado.map((i) => {
              const podeResgatar = !i.esgotado && saldoCoins >= i.custo
              return (
                <div key={i.id} className="be-shop-card">
                  <span className="be-shop-emo">{i.emoji}</span>
                  <div className="be-shop-nm">{i.nome}{i.tipo === 'FOLGA' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-deep)', marginLeft: 4 }}>🏖️ folga</span>}</div>
                  {i.descricao && <div className="be-shop-ds">{i.descricao}</div>}
                  <div className="be-shop-cost be-tnum">🪙 {num(i.custo)}</div>
                  <button type="button" className="be-shop-btn" disabled={!podeResgatar} onClick={() => onResgatar(i)}>
                    {i.esgotado ? 'Esgotado' : saldoCoins >= i.custo ? 'Resgatar' : `Faltam ${num(i.custo - saldoCoins)}`}
                  </button>
                </div>
              )
            })}
          </div>
          {meusResgates.length > 0 && (
            <div className="be-resg">
              {meusResgates.map((r) => {
                const st = STAT[r.status] || { label: r.status, cor: '#888' }
                return (
                  <div key={r.id} className="be-resg-row">
                    <span style={{ fontSize: 18 }}>{r.itemEmoji}</span>
                    <span className="nm">{r.itemNome}{r.tipoItem === 'FOLGA' && r.dataDesejada && <span style={{ fontSize: 11, color: 'var(--brand-deep)', fontWeight: 700, marginLeft: 6 }}>🏖️ {new Date(r.dataDesejada).toLocaleDateString('pt-BR')}</span>}</span>
                    <span className="be-tnum" style={{ fontSize: 12, color: 'var(--gold-text)', fontWeight: 800 }}>🪙 {num(r.custo)}</span>
                    <span className="be-st" style={{ color: st.cor, background: st.cor + '22' }}>{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
  )
}

/* ══════════ ABA: SUGESTÕES (reconhecer + ouvidoria) ══════════ */
function TabVoz({ colegas, reconhecimento, ouvidoria, onFeito, setAviso }) {
  return (
    <>
      {colegas.length > 0 && <SecaoReconhecer colegas={colegas} reconhecimento={reconhecimento} onFeito={onFeito} setAviso={setAviso} />}
      <SecaoOuvidoria ouvidoria={ouvidoria} onFeito={onFeito} setAviso={setAviso} />
    </>
  )
}

function SecaoReconhecer({ colegas, reconhecimento, onFeito, setAviso }) {
  const [para, setPara] = useState('')
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const r = reconhecimento || { maxMes: 3, coins: 10, enviadosMes: 0, recebidos: [], enviados: [] }
  const restam = Math.max(0, (r.maxMes || 0) - (r.enviadosMes || 0))
  async function enviar() {
    if (!para) { setAviso('Escolha um colega.'); return }
    if (!msg.trim()) { setAviso('Escreva um motivo.'); return }
    setEnviando(true)
    try {
      await colabApi.post('/public/colaborador/reconhecer', { paraFuncionarioId: Number(para), mensagem: msg })
      setPara(''); setMsg(''); setAviso('Reconhecimento enviado! A liderança vai aprovar. 🙌'); onFeito()
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível enviar.') }
    finally { setEnviando(false) }
  }
  return (
    <section>
      <h2 className="be-sec-title">🙌 Reconhecer um colega</h2>
      <div className="be-card">
        <p className="be-hint" style={{ marginTop: 0 }}>Valorize quem te ajudou. Ao aprovar, o colega ganha <b>🪙 {r.coins} Coins</b>. Você tem <b>{restam}</b> de {r.maxMes} este mês.</p>
        {restam > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            <select className="be-input" value={para} onChange={(e) => setPara(e.target.value)}>
              <option value="">Escolha o colega…</option>
              {colegas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <textarea className="be-input" rows={2} placeholder="Por que você reconhece esse colega?" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button type="button" className="be-btn" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar reconhecimento'}</button>
          </div>
        ) : <div className="be-emptybox">Você já usou seus reconhecimentos deste mês. 🙌</div>}
        {r.recebidos.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="be-mini-title">Você foi reconhecido por</div>
            {r.recebidos.map((x) => (
              <div key={x.id} className="be-rec-row">
                <span className="be-rec-de">{x.de}</span>
                <span className="be-rec-msg">“{x.mensagem}”</span>
                <span className="be-rec-st" style={{ color: x.status === 'APROVADO' ? 'var(--money)' : x.status === 'REJEITADO' ? '#dc2626' : 'var(--muted)' }}>{x.status === 'APROVADO' ? `🪙 ${x.coins}` : x.status === 'PENDENTE' ? 'aguardando' : 'não aprovado'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SecaoOuvidoria({ ouvidoria, onFeito, setAviso }) {
  const [tipo, setTipo] = useState('SUGESTAO')
  const [msg, setMsg] = useState('')
  const [anonimo, setAnonimo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    if (!msg.trim()) { setAviso('Escreva sua mensagem.'); return }
    setEnviando(true)
    try {
      await colabApi.post('/public/colaborador/ouvidoria', { tipo, mensagem: msg, anonimo })
      setMsg(''); setAviso('Mensagem enviada! 💬'); onFeito()
    } catch (err) { setAviso(err?.response?.data?.error ?? 'Não foi possível enviar.') }
    finally { setEnviando(false) }
  }
  return (
    <section>
      <h2 className="be-sec-title">💬 Fale com a liderança</h2>
      <div className="be-card">
        <p className="be-hint" style={{ marginTop: 0 }}>Sugestões, elogios, reclamações ou denúncias. Marque <b>anônimo</b> se preferir não se identificar.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
          <select className="be-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {OUV_TIPOS_PUB.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <textarea className="be-input" rows={3} placeholder="Escreva sua mensagem…" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} /> Enviar como anônimo 🕶️
          </label>
          <button type="button" className="be-btn" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar mensagem'}</button>
        </div>
        {ouvidoria.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="be-mini-title">Suas mensagens</div>
            {ouvidoria.map((o) => (
              <div key={o.id} className="be-ouv-row">
                <div className="be-ouv-msg">{o.mensagem}</div>
                {o.resposta && <div className="be-ouv-resp"><b>Resposta:</b> {o.resposta}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* Comparação pessoal entre ciclos — evolução do prêmio nos últimos meses. */
function SecaoHistorico({ historico }) {
  const max = Math.max(1, ...historico.map((h) => Number(h.totalRs) || 0))
  const ult = historico[historico.length - 1]
  const penult = historico[historico.length - 2]
  const delta = ult && penult ? (Number(ult.totalRs) || 0) - (Number(penult.totalRs) || 0) : 0
  return (
    <section>
      <h2 className="be-sec-title">📈 Sua evolução</h2>
      <div className="be-card">
        {penult && (
          <p className="be-hint" style={{ marginTop: 0 }}>
            {delta > 0 ? <>📈 Seu prêmio <b>subiu {brl(delta)}</b> vs. o mês anterior. Mandou bem!</>
              : delta < 0 ? <>📉 Seu prêmio caiu {brl(Math.abs(delta))} vs. o mês anterior. Bora recuperar! 💪</>
                : <>➡️ Seu prêmio ficou estável vs. o mês anterior.</>}
          </p>
        )}
        <div className="be-hist">
          {historico.map((h, i) => {
            const v = Number(h.totalRs) || 0
            return (
              <div key={i} className="be-hist-col">
                <div className="be-hist-val be-tnum">{v > 0 ? brl(v).replace('R$', '').trim() : '—'}</div>
                <div className="be-hist-bar"><i style={{ height: `${Math.round((v / max) * 100)}%` }} /></div>
                <div className="be-hist-lbl">{MES_CURTO[(h.mes || 1) - 1]}{h.posicao ? <span className="be-hist-pos"> · {h.posicao}º</span> : ''}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ══════════ LOGIN por WhatsApp (OTP) ══════════ */
const soFoneDig = (s) => String(s || '').replace(/\D/g, '')
function LoginColaborador({ slug, onEntrar }) {
  const [loja, setLoja] = useState(null)
  const [etapa, setEtapa] = useState('fone') // 'fone' | 'codigo'
  const [fone, setFone] = useState('')
  const [codigo, setCodigo] = useState('')
  const [mascara, setMascara] = useState('')
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    colabApi.get(`/public/colaborador/${slug}/loja`).then((r) => setLoja(r.data)).catch(() => setLoja({ nome: 'Loja' }))
  }, [slug])
  async function pedir() {
    if (soFoneDig(fone).length < 10) { setErro('Digite seu WhatsApp com DDD.'); return }
    setErro(null); setBusy(true)
    try {
      const r = await colabApi.post(`/public/colaborador/${slug}/solicitar`, { telefone: fone })
      setMascara(r.data?.telefoneMascara || ''); setCodigo(''); setEtapa('codigo')
    } catch (e) { setErro(e?.response?.data?.error ?? 'Não foi possível enviar o código.') }
    finally { setBusy(false) }
  }
  async function entrar() {
    if (soFoneDig(codigo).length !== 6) { setErro('Digite o código de 6 dígitos.'); return }
    setErro(null); setBusy(true)
    try {
      const r = await colabApi.post(`/public/colaborador/${slug}/verificar`, { telefone: fone, codigo })
      onEntrar(r.data.token)
    } catch (e) { setErro(e?.response?.data?.error ?? 'Código inválido.') }
    finally { setBusy(false) }
  }
  return (
    <div className="be-root">
      <style>{CSS}</style>
      <div className="be-login">
        <div className="be-login-card">
          <div className="be-login-logo">{loja?.logoDataUrl ? <img src={loja.logoDataUrl} alt="" /> : (loja?.nome || 'L').charAt(0).toUpperCase()}</div>
          <div className="be-login-oi">Área do colaborador</div>
          <h1 className="be-login-loja">{loja?.nome || '…'}</h1>
          {etapa === 'fone' ? (
            <>
              <p className="be-login-sub">Digite o WhatsApp que a liderança cadastrou. Você vai receber um código de acesso por lá.</p>
              <input className="be-input" inputMode="numeric" placeholder="(00) 00000-0000" value={fone} onChange={(e) => setFone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pedir()} />
              {erro && <div className="be-login-erro">{erro}</div>}
              <button type="button" className="be-btn" onClick={pedir} disabled={busy}>{busy ? 'Enviando…' : 'Receber código no WhatsApp'}</button>
            </>
          ) : (
            <>
              <p className="be-login-sub">Enviamos um código {mascara && <>para o WhatsApp <b>{mascara}</b></>}. Digite abaixo.</p>
              <input className="be-input be-cod" inputMode="numeric" maxLength={6} placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && entrar()} autoFocus />
              {erro && <div className="be-login-erro">{erro}</div>}
              <button type="button" className="be-btn" onClick={entrar} disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
              <button type="button" className="be-login-voltar" onClick={() => { setEtapa('fone'); setCodigo(''); setErro(null) }}>‹ Trocar número / reenviar código</button>
            </>
          )}
        </div>
        <div className="be-login-foot">🔒 Acesso seguro · Na Chapa</div>
      </div>
    </div>
  )
}
